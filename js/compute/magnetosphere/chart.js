/* ==========================================================================
   Stacked time charts — the drawing language, in one place
   ==========================================================================

   `Strip` grew this vocabulary first: lanes stacked by weight, each with its
   own rounded axis in a left gutter, a time x axis shared by all of them, and
   hatching past the point where a lane's source runs out. The instrument tabs
   need exactly that, and building a second set would give the app two visual
   languages for the same idea — the surest way to make two pictures that look
   comparable and are not.

   So the vocabulary moved here. Strip keeps its own draw(), because it also
   carries the forecast semantics — the seam, the certainty classes, the Kp
   provenance bars — and rewriting it to fit a generic renderer would risk the
   one thing that must not break. What Strip now shares is the arithmetic:
   scaleFor, fmt, coverageOf, drawBeyond. Identical numbers, one definition.

   The layout maths is pure and node-testable; draw() needs a canvas context
   and is not. That split is deliberate: the part that can be wrong quietly is
   the part that is tested.
   ========================================================================== */

(function (root) {
  "use strict";

  var Chart = {

    /* ---- axis ----------------------------------------------------------- */

    /* A rounded range, so the labels are numbers a person would write down
       rather than whatever the data happened to reach. Moved verbatim from
       Strip except for the min/max: spreading a long array into Math.min blows
       the argument limit somewhere north of 100k samples, and the instrument
       feeds are an order of magnitude bigger than the timeline's. */
    scaleFor: function (values, opts) {
      var o = opts || {};
      var lo = null, hi = null, i, v;
      for (i = 0; i < values.length; i++) {
        v = values[i];
        if (!isFinite(v) || v === null) continue;
        if (lo === null || v < lo) lo = v;
        if (hi === null || v > hi) hi = v;
      }
      if (lo === null) { lo = 0; hi = 1; }
      if (o.includeZero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
      if (isFinite(o.minSpan) && hi - lo < o.minSpan) {
        var mid = (hi + lo) / 2;
        lo = mid - o.minSpan / 2; hi = mid + o.minSpan / 2;
      }
      var pad = (hi - lo) * 0.12 || 1;
      lo -= pad; hi += pad;
      var raw = (hi - lo) / 3;
      var mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
      var tick = [1, 2, 2.5, 5, 10].map(function (m) { return m * mag; })
                   .find(function (x) { return x >= raw; }) || 10 * mag;
      return { lo: Math.floor(lo / tick) * tick, hi: Math.ceil(hi / tick) * tick,
               tick: tick };
    },

    /* Decades, for fluxes that live across six of them. A linear axis on GOES
       electron flux is a flat line at the bottom of the lane.

       `lo` and `hi` come back as EXPONENTS, not values — the contract this
       shares with `plotter`, and the one that is easy to misread at a call
       site where every other scale is in the lane's own unit.

       `opts.include` extends the range so a threshold stays on screen.
       `draw` drops a `lane.marks` entry whose value falls outside the scale,
       silently, so a quiet week would lose the very line that says where the
       storm level is — and a flux plot with no reference level is a shape.

       `opts.minDecades` (default 1) stops the axis from collapsing. */
    logScaleFor: function (values, opts) {
      var o = opts || {};
      var lo = null, hi = null, i, v;
      var take = function (x) {
        if (!isFinite(x) || x === null || x <= 0) return;
        if (lo === null || x < lo) lo = x;
        if (hi === null || x > hi) hi = x;
      };
      for (i = 0; i < values.length; i++) take(values[i]);
      if (o.include) for (i = 0; i < o.include.length; i++) take(o.include[i]);
      if (lo === null) { lo = 1; hi = 10; }

      var e0 = Math.floor(Math.log10(lo)), e1 = Math.ceil(Math.log10(hi));
      /* A quiet flux sits inside one decade, and floor and ceil of the same
         decade are the same number. That leaves a scale with no span, on
         which `plotter`'s 1e-9 guard spreads instrument noise over the whole
         lane height. Measured on the frozen GOES week, not imagined. */
      var min = isFinite(o.minDecades) && o.minDecades > 0
              ? Math.ceil(o.minDecades) : 1;
      while (e1 - e0 < min) {
        e1 += 1;
        if (e1 - e0 < min) e0 -= 1;
      }
      return { lo: e0, hi: e1, tick: 1, log: true };
    },

    /* The label for one decade line. Not `sigFmt`: that exists to tell two
       nearby SAMPLES apart and pays for it in trailing digits, which on an
       axis tick is noise — "10.00" where the value is exactly ten. Here the
       value is a power of ten by construction, so the only question is when
       to stop writing it out. */
    decadeLabel: function (e) {
      if (e >= 4 || e < -3) return "1e" + (e < 0 ? "" : "+") + e;
      if (e >= 0) return String(Math.pow(10, e));
      return Math.pow(10, e).toFixed(-e);
    },

    /* Which decades to label inside one lane. Four decades carrying only a
       top and a bottom number is a picture without a scale: the reader sees
       that the curve went up, not that it went up by a factor of a thousand.

       Pure and separate from draw(), because which labels appear is exactly
       the kind of thing that looks fine and is off by one. Always returns
       both ends, so a lane is never labelled with a range it does not span.

       Only log lanes get these. A linear lane already carries a rounded tick
       whose two ends say everything the middle would repeat. */
    logTicks: function (sc, laneH, minGapPx) {
      if (!sc || !sc.log) return [];
      /* A scale that is not finite comes from a hand-written `fixedScale` or
         from a log10 of zero, and the loop below would push until the array
         length overflows — the same shape of failure as the `timeTicks` loop
         that hung when a folding panel reported zero width. No range, no
         ticks. */
      if (!isFinite(sc.lo) || !isFinite(sc.hi)) return [];
      if (!(sc.hi > sc.lo)) return [sc.lo];
      var gap = minGapPx || 14;
      var room = Math.max(1, Math.floor(laneH / gap));   // intervals that fit
      var decades = sc.hi - sc.lo;
      var steps = [1, 2, 3, 5, 10, 20, 50];
      var step = steps[steps.length - 1];
      for (var i = 0; i < steps.length; i++) {
        if (decades / steps[i] <= room) { step = steps[i]; break; }
      }
      var out = [];
      for (var e = sc.lo; e < sc.hi; e += step) out.push(e);
      out.push(sc.hi);
      /* The last stepped label can land a fraction of a step below the top
         and collide with it. Drop it rather than overprint. */
      if (out.length > 2 && sc.hi - out[out.length - 2] < step * 0.5) {
        out.splice(out.length - 2, 1);
      }
      return out;
    },

    /* How many decimals the tick actually justifies. The old form printed a
       0.25 nPa tick as "0.3" — enough for a lane in tens of nT, wrong for one
       in single nPa. Falls back to the old heuristic when no tick is given so
       existing callers are unaffected. */
    fmt: function (v, tick) {
      if (!isFinite(v)) return "--";
      if (isFinite(tick) && tick > 0) {
        /* Decimals from the tick's PRECISION, not its magnitude. Deriving it
           from -log10 looks right and is not: a 0.25 tick came out as "0.3"
           while 0.2 correctly wanted one decimal. Ask instead for the fewest
           decimals that still write the tick exactly. */
        var d = 0;
        while (d < 6 && Math.abs(Number(tick.toFixed(d)) - tick) > tick * 1e-9) d++;
        var s = v.toFixed(d);
        return d > 0 ? s.replace(/\.?0+$/, "") || "0" : s;
      }
      var a = Math.abs(v);
      if (a >= 100) return v.toFixed(0);
      return v.toFixed(a % 1 ? 1 : 0);
    },

    /* ---- layout --------------------------------------------------------- */

    /* Lane tops and bottoms from their weights. One gap between lanes, taken
       off the bottom so a curve never touches the separator below it. */
    laneLayout: function (lanes, height, gap) {
      var g = gap === undefined ? 2 : gap;
      var total = 0, i;
      for (i = 0; i < lanes.length; i++) total += (lanes[i].weight || 1);
      var out = [], y = 0;
      for (i = 0; i < lanes.length; i++) {
        var h = height * (lanes[i].weight || 1) / total;
        out.push({ id: lanes[i].id, top: y, bot: y + h - g, height: h });
        y += h;
      }
      return out;
    },

    /* Time to pixel. The only mapping that stays honest across a gap in a
       feed or two sources at different cadences. */
    xMapper: function (from, to, pad, plotW) {
      var span = Math.max(to - from, 1);
      return function (t) { return pad + ((t - from) / span) * plotW; };
    },

    /* Pixel back to time, for hover and scrubbing. */
    timeAtX: function (x, from, to, pad, plotW) {
      var f = (x - pad) / Math.max(plotW, 1);
      return from + Math.max(0, Math.min(1, f)) * (to - from);
    },

    /* Value to pixel inside one lane, linear or log. */
    plotter: function (sc, top, bot) {
      var span = Math.max(sc.hi - sc.lo, 1e-9);
      if (sc.log) {
        return function (v) {
          if (!(v > 0)) return null;
          return bot - ((Math.log10(v) - sc.lo) / span) * (bot - top);
        };
      }
      return function (v) {
        if (!isFinite(v)) return null;
        return bot - ((v - sc.lo) / span) * (bot - top);
      };
    },

    /* ---- coverage ------------------------------------------------------- */

    /* The window in which a series actually says something, read off the data
       rather than declared. Outside it the lane draws nothing and says why —
       because an empty stretch and a stretch of zeroes look identical. */
    coverageOf: function (points, has, timeOf) {
      var t = timeOf || function (p) { return p.time; };
      var from = null, to = null;
      for (var i = 0; i < points.length; i++) {
        if (has(points[i])) {
          if (from === null) from = t(points[i]);
          to = t(points[i]);
        }
      }
      return from === null ? null : { from: from, to: to };
    },

    /* Nearest sample to a time, for the hover readout. Assumes ascending. */
    nearestIndex: function (points, time) {
      if (!points.length) return -1;
      var lo = 0, hi = points.length - 1, mid;
      while (lo < hi) {
        mid = (lo + hi) >> 1;
        if (points[mid].time < time) lo = mid + 1; else hi = mid;
      }
      if (lo > 0 && Math.abs(points[lo - 1].time - time) < Math.abs(points[lo].time - time)) {
        return lo - 1;
      }
      return lo;
    },

    /* Downsample to about one point per pixel. Keeps the first and last so a
       curve still reaches both edges. */
    stride: function (n, plotW) {
      return Math.max(1, Math.floor(n / Math.max(plotW, 1)));
    },

    /* ---- time axis ------------------------------------------------------ */

    /* Round steps a person would choose, from a minute to a week. Anything
       between these reads as arithmetic rather than as a clock: nobody labels
       an axis every 37 minutes. */
    TIME_STEPS: [
      60e3, 5 * 60e3, 15 * 60e3, 30 * 60e3,
      3600e3, 3 * 3600e3, 6 * 3600e3, 12 * 3600e3,
      86400e3, 2 * 86400e3, 7 * 86400e3
    ],

    /* Tick positions for a time axis, aligned to the step rather than to the
       window edge — so a 6-hour step lands on 00, 06, 12, 18 UT and not on
       whatever minute the feed happens to start at. The alignment is what makes
       two tabs on different spans comparable at a glance.

       Pure and node-tested: which ticks appear is exactly the kind of thing
       that looks right and is off by one somewhere.

       `minPx` is the smallest gap that keeps labels from touching. Returns the
       chosen step alongside the ticks, because how to write a label depends on
       it — 15 minutes wants HH:MM, two days wants a date. */
    timeTicks: function (from, to, plotW, minPx) {
      /* No width, no axis. A folding panel reports zero — and briefly a
         NEGATIVE plot width, since the gutter is subtracted before the canvas
         has caught up — and a tick every week is a worse answer than none. */
      if (!(plotW > 0)) return { step: this.TIME_STEPS[0], ticks: [] };
      var span = Math.max(to - from, 1);
      var gap = minPx || 78;
      var want = span * gap / Math.max(plotW, 1);       // ms per label, minimum
      var steps = this.TIME_STEPS;
      var step = steps[steps.length - 1];
      for (var i = 0; i < steps.length; i++) {
        if (steps[i] >= want) { step = steps[i]; break; }
      }
      /* Past a week the round steps run out, so fall back to whole weeks —
         computed, not stepped towards. A loop here spins forever the moment
         the canvas has no width, which is exactly the state a render loop
         passes through while a panel is folding. */
      var maxTicks = Math.max(1, Math.floor(plotW / gap));
      if (span / step > maxTicks) {
        var week = 7 * 86400e3;
        step = Math.ceil(span / maxTicks / week) * week;
      }

      var out = [];
      var t = Math.ceil(from / step) * step;            // UTC-aligned by construction
      for (; t <= to; t += step) out.push(t);
      return { step: step, ticks: out };
    },

    /* ---- readout -------------------------------------------------------- */

    /* The lines a hover box shows for one moment. Pure, so the thing that can
       be quietly wrong — which sample got picked, what a missing value prints
       as — is testable without a canvas.

       A series with no sample near the time is LEFT OUT; a series that has a
       sample whose value is not finite prints an em dash. Those are different
       statements and the difference is the whole point: outside its coverage a
       source says nothing, inside it a source can say "no reading here".

       `nearMs` guards the first case. Without it, hovering past the end of a
       24-hour feed would report its last sample as though it applied to the
       moment under the pointer, which on a 168-hour axis can be days out. */
    hoverRows: function (lanes, time, opts) {
      var o = opts || {};
      var near = o.nearMs === undefined ? Infinity : o.nearMs;
      var self = this;
      var out = [];
      lanes.forEach(function (lane) {
        var parts = [];
        lane.series.forEach(function (s) {
          if (!s.points || !s.points.length) return;
          var i = self.nearestIndex(s.points, time);
          var p = s.points[i];
          if (!p || Math.abs(p.time - time) > near) return;
          var v = isFinite(p.v)
            ? (o.digits === undefined ? self.sigFmt(p.v) : p.v.toFixed(o.digits))
            : "—";
          /* `count` is how many sub-samples went into one averaged value —
             ACE publishes it per channel. Carried only where the point has
             one, and only beside a value that exists: "out of 12" next to an
             em dash would be counting the samples behind a non-reading. */
          parts.push({ label: s.label || null, value: v,
                       color: s.color, flag: p.flag === true,
                       count: (isFinite(p.v) && isFinite(p.count)) ? p.count : null });
        });
        if (parts.length) out.push({ lane: lane.label, unit: lane.unit, parts: parts });
      });
      return out;
    },

    /* Enough digits to tell two nearby samples apart, without printing the
       float's noise. Flux spans ten decades and nT spans two, so a fixed
       decimal count is wrong for one of them whichever number is chosen. */
    sigFmt: function (v) {
      var a = Math.abs(v);
      if (a === 0) return "0";
      if (a >= 1e4 || a < 1e-2) return v.toExponential(1);
      return v.toFixed(a >= 100 ? 1 : a >= 1 ? 2 : 3);
    },

    /* ---- drawing -------------------------------------------------------- */

    /* Past the edge of a source. Hatched rather than blank, and labelled with
       the reason rather than merely dimmed. */
    drawBeyond: function (c, x0, x1, top, bot, reason, pad) {
      if (x1 - x0 < 2) return;
      c.save();
      c.beginPath(); c.rect(x0, top, x1 - x0, bot - top); c.clip();
      c.strokeStyle = "rgba(126,158,200,0.10)";
      c.lineWidth = 1;
      for (var x = x0 - (bot - top); x < x1; x += 7) {
        c.beginPath(); c.moveTo(x, bot); c.lineTo(x + (bot - top), top); c.stroke();
      }
      c.restore();

      c.save();
      c.setLineDash([2, 3]);
      c.strokeStyle = "rgba(126,158,200,0.45)"; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x0, top); c.lineTo(x0, bot); c.stroke();
      c.setLineDash([]);
      if (reason) {
        c.fillStyle = "rgba(126,158,200,0.75)";
        c.textAlign = "left";
        var tw = c.measureText(reason).width;
        c.fillText(reason, x1 - x0 > tw + 10 ? x0 + 5 : Math.max(pad + 4, x0 - tw - 5),
                   bot - 4);
      }
      c.restore();
    },

    PAD: 52,

    /* One stacked chart. `spec`:

         { width, height, from, to, mono, ink, inkFaint, hair,
           tickGapPx, logGapPx,
           lanes: [{ label, unit, colorVar|color, weight, log, scaleOpts,
                     kind: "line"|"bars",
                     series: [{ points: [{time, v}], color, width, dash, alpha,
                                label }],
                     beyond, marks: [{v, label, color, dash}],
                     bands: [{from, to, color}] }],
           playhead: time|null, hoverX: px|null,
           marks: [{time, label, color, dash}] }

       `scaleOpts` reaches both scales: `includeZero`/`minSpan` on a linear
       lane, `include`/`minDecades` on a log one.

       Everything a caller has to supply is data. Nothing here reaches into
       app state, which is what lets node test the arithmetic above and lets
       an instrument tab draw a feed the model knows nothing about. */
    draw: function (c, spec) {
      var PAD = this.PAD;
      var w = spec.width, h = spec.height;
      var plotW = w - PAD;
      var xOf = this.xMapper(spec.from, spec.to, PAD, plotW);
      /* The time axis takes its strip off the bottom before the lanes divide
         what is left. Without a labelled axis a seven-day window and a
         twenty-four hour one are the same picture, and the reader has no way to
         tell which one they are looking at. */
      var axisH = spec.fmtTick ? 13 : 0;
      var lanesH = Math.max(h - axisH, 1);
      var lay = this.laneLayout(spec.lanes, lanesH);
      var mono = spec.mono || "monospace";
      var self = this;
      var tt = spec.fmtTick
        ? this.timeTicks(spec.from, spec.to, plotW, spec.tickGapPx) : null;

      c.font = "9px " + mono;

      /* Drawn first so every lane's curve sits on top of its own gridline. */
      if (tt) {
        c.save();
        c.strokeStyle = spec.hairSoft || "rgba(126,158,200,0.07)";
        c.lineWidth = 1;
        tt.ticks.forEach(function (t) {
          var x = Math.round(xOf(t)) + 0.5;
          c.beginPath(); c.moveTo(x, 0); c.lineTo(x, lanesH); c.stroke();
        });
        c.restore();
      }

      spec.lanes.forEach(function (lane, li) {
        var top = lay[li].top, bot = lay[li].bot;

        c.strokeStyle = spec.hairSoft || "rgba(126,158,200,0.07)";
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(PAD, top); c.lineTo(w, top); c.stroke();

        var all = [];
        lane.series.forEach(function (s) {
          for (var i = 0; i < s.points.length; i++) all.push(s.points[i].v);
        });
        var sc = lane.fixedScale ? lane.fixedScale
               : lane.log ? self.logScaleFor(all, lane.scaleOpts)
               : self.scaleFor(all, lane.scaleOpts);
        var plot = self.plotter(sc, top, bot);
        var logT = sc.log ? self.logTicks(sc, bot - top, spec.logGapPx) : null;

        c.save();
        c.beginPath(); c.rect(PAD, top, plotW, Math.max(bot - top, 1)); c.clip();

        // Zero line where the sign carries meaning
        if (!sc.log && sc.lo < 0 && sc.hi > 0) {
          c.strokeStyle = spec.hair || "rgba(126,158,200,0.14)";
          c.beginPath(); c.moveTo(PAD, plot(0)); c.lineTo(w, plot(0)); c.stroke();
        }

        /* Decade gridlines, under everything, like the time ticks. The ends
           are the lane's own edges and are already drawn as such. */
        if (logT && logT.length > 2) {
          c.strokeStyle = spec.hairSoft || "rgba(126,158,200,0.07)";
          c.lineWidth = 1;
          logT.forEach(function (e) {
            if (e === sc.lo || e === sc.hi) return;
            var y = Math.round(plot(Math.pow(10, e))) + 0.5;
            c.beginPath(); c.moveTo(PAD, y); c.lineTo(w, y); c.stroke();
          });
        }

        /* Time intervals a source declares on this lane — a flare from begin
           to end, drawn as a strip on the lane floor so the curve stays
           legible on top of it. An interval shorter than a pixel still gets
           1.2 px: an event that happened is not allowed to round to nothing.
           Colour is required, same rule as `marks` below. */
        (lane.bands || []).forEach(function (b) {
          if (b.to < spec.from || b.from > spec.to) return;
          var bx0 = xOf(b.from);
          var bandH = Math.min(8, (bot - top) * 0.22);
          c.fillStyle = b.color;
          c.fillRect(bx0, bot - bandH, Math.max(xOf(b.to) - bx0, 1.2), bandH);
        });

        (lane.marks || []).forEach(function (m) {
          var y = plot(m.v);
          if (y === null || y < top || y > bot) return;
          c.save();
          c.setLineDash(m.dash || [1, 4]);
          c.strokeStyle = m.color; c.lineWidth = 1;
          c.beginPath(); c.moveTo(PAD, y); c.lineTo(w, y); c.stroke();
          c.setLineDash([]);
          c.fillStyle = m.color;
          c.textAlign = "left";
          c.fillText(m.label, PAD + 4, y - 2);
          c.restore();
        });

        lane.series.forEach(function (s) {
          var pts = s.points;
          if (!pts.length) return;
          var step = self.stride(pts.length, plotW);

          if (lane.kind === "bars") {
            c.fillStyle = s.color;
            /* On a log lane `sc.lo` is an EXPONENT, so the linear form asks
               for plot(0), which the log plotter refuses and returns null.
               That does not throw — `null - y` coerces to `-y` — so every bar
               would quietly be drawn from its own value to the TOP of the
               canvas instead of down to the lane floor. The baseline on a log
               lane is the floor itself. */
            var zero = sc.log ? bot : plot(sc.lo < 0 ? 0 : sc.lo);
            for (var b = 0; b < pts.length; b++) {
              var y = plot(pts[b].v);
              if (y === null) continue;
              var x0 = xOf(pts[b].time);
              var x1 = b + 1 < pts.length ? xOf(pts[b + 1].time) : x0 + 2;
              c.fillRect(x0, y, Math.max(x1 - x0 - 1, 1), zero - y);
            }
            return;
          }

          if (s.dash) c.setLineDash(s.dash);
          c.beginPath();
          var started = false;
          for (var i = 0; i < pts.length; i += step) {
            var yy = plot(pts[i].v);
            if (yy === null) { started = false; continue; }
            var xx = xOf(pts[i].time);
            if (started) c.lineTo(xx, yy);
            else { c.moveTo(xx, yy); started = true; }
          }
          c.strokeStyle = s.color;
          c.globalAlpha = s.alpha === undefined ? 1 : s.alpha;
          c.lineWidth = s.width || 1.2;
          c.stroke();
          c.globalAlpha = 1;
          if (s.dash) c.setLineDash([]);

          /* Samples the source itself flags as disturbed. Marked, not dropped:
             a deleted sample is a claim too, and a reader cannot tell a removed
             minute from a quiet one. Every stride is scanned rather than every
             stride-th point, because a flag is usually a handful of minutes and
             downsampling would throw most of them away. */
          if (s.flagColor) {
            c.fillStyle = s.flagColor;
            for (var fi = 0; fi < pts.length; fi++) {
              if (pts[fi].flag === true) c.fillRect(xOf(pts[fi].time) - 0.5, bot - 4, 1, 4);
            }
          }
        });

        /* Where this lane's source stops. What counts as covered has to be
           what actually gets drawn: on a log lane the plotter refuses zero
           and negatives — an instrument floor reported as 0, or ACE's -1e5
           missing-value sentinel — and counting those as coverage suppresses
           the hatching that should say the source went quiet. */
        var drawable = sc.log ? function (p) { return p.v > 0; }
                              : function (p) { return isFinite(p.v); };
        var cov = null;
        lane.series.forEach(function (s) {
          var cv = self.coverageOf(s.points, drawable);
          if (!cv) return;
          cov = cov ? { from: Math.min(cov.from, cv.from), to: Math.max(cov.to, cv.to) } : cv;
        });
        if (cov && cov.to < spec.to - 60000) {
          self.drawBeyond(c, xOf(cov.to), PAD + plotW, top, bot, lane.beyond, PAD);
        } else if (!cov) {
          /* NO drawable point at all. Without this branch an entirely empty
             lane drew nothing and said nothing — indistinguishable from a
             quiet one — while a lane that stopped halfway got hatching and a
             reason. The emptier case was the quieter one. Found by the blok
             B review: a wholesale-failed product left its lanes blank with
             every check green. */
          self.drawBeyond(c, PAD, PAD + plotW, top, bot, lane.beyond, PAD);
        }

        c.restore();

        /* Axis: range in the gutter, name and unit inside.

           A log lane is labelled by `sigFmt`, not `fmt`. `fmt` with no tick
           falls back to a fixed-decimal heuristic, and every flux below 1e-2
           came out of it as "0.0" — so a röntgen lane running from 1e-9 to
           1e-4 was labelled "0.0" at both ends. Temperature never showed it
           because 1e4 and up survive the same path. */
        c.textAlign = "right";
        c.fillStyle = spec.inkFaint || "#465771";
        if (logT) {
          logT.forEach(function (e) {
            /* The two ends belong to the lane's edges; the rest sit on their
               own decade line. */
            var ty = e === sc.hi ? top + 9
                   : e === sc.lo ? bot - 1
                   : plot(Math.pow(10, e)) + 3;
            c.fillText(self.decadeLabel(e), PAD - 5, ty);
          });
        } else {
          c.fillText(self.fmt(sc.hi, sc.tick), PAD - 5, top + 9);
          c.fillText(self.fmt(sc.lo, sc.tick), PAD - 5, bot - 1);
        }
        c.textAlign = "left";
        c.fillStyle = lane.color || spec.ink || "#C7D5E8";
        c.fillText(lane.label, PAD + 4, top + 9);
        c.fillStyle = spec.inkFaint || "#465771";
        c.fillText(lane.unit, PAD + 4 + c.measureText(lane.label).width + 5, top + 9);

        // Series key, when a lane carries more than one
        if (lane.series.length > 1) {
          var kx = PAD + 4 + c.measureText(lane.label).width
                 + c.measureText(lane.unit).width + 16;
          lane.series.forEach(function (s) {
            if (!s.label) return;
            c.fillStyle = s.color;
            c.fillText(s.label, kx, top + 9);
            kx += c.measureText(s.label).width + 10;
          });
        }

        lane._sc = sc; lane._top = top; lane._bot = bot; lane._plot = plot;
      });

      /* Labels last of the axis work, so a curve cannot be drawn over them.
         Edge labels are dropped rather than clamped: a label shifted to fit no
         longer sits above the moment it names. */
      if (tt) {
        c.save();
        c.font = "9px " + mono;
        c.fillStyle = spec.inkFaint || "#465771";
        c.textAlign = "center";
        /* The FIRST label that fits carries the date, whatever hour it lands
           on. Leaving the date to midnight alone meant an axis could carry none
           at all: a 24-hour window whose seam sits near 00:30 puts its only
           midnight at 99% of the width, where the edge test drops it. The axis
           then reads as a clock with no day attached — which is what Terry
           found, and what I could not reproduce because my seam fell elsewhere.

           Anchor first, dates at the day boundaries after it. */
        var prevRight = PAD - 4;
        var anchored = false;
        tt.ticks.forEach(function (t) {
          var label = spec.fmtTick(t, tt.step, !anchored);
          if (!label) return;
          var x = xOf(t);
          var half = c.measureText(label).width / 2;
          if (x - half < prevRight || x + half > w - 2) return;
          c.fillText(label, x, h - 3);
          prevRight = x + half + 8;
          anchored = true;
        });
        c.restore();
      }

      /* Vertical time marks: the seam, flare peaks. The line always draws;
         the label only where it fits. Thirty-three flare peaks on a week axis
         would overprint into noise, and a label over a label says less than
         no label — so labels take the first of two rows with room, same
         prevRight-tracking as the time-axis labels above, and are dropped
         when both rows are full. A lone mark walks the exact old path:
         row 0, same y, same left/right flip. */
      var markRows = [null, null];
      (spec.marks || []).slice()
        .sort(function (a, b) { return a.time - b.time; })
        .forEach(function (m) {
          if (m.time < spec.from || m.time > spec.to) return;
          var x = xOf(m.time);
          c.save();
          if (m.dash) c.setLineDash(m.dash);
          c.strokeStyle = m.color; c.lineWidth = 1;
          c.beginPath(); c.moveTo(x, 0); c.lineTo(x, lanesH); c.stroke();
          if (m.dash) c.setLineDash([]);
          c.fillStyle = m.color; c.font = "9px " + mono; c.textAlign = "left";
          var tw = c.measureText(m.label).width;
          var lx = x + 4 + tw > w ? x - tw - 4 : x + 4;
          for (var row = 0; row < markRows.length; row++) {
            if (markRows[row] === null || lx > markRows[row]) {
              c.fillText(m.label, lx, lanesH - 3 - row * 10);
              markRows[row] = lx + tw + 6;
              break;
            }
          }
          c.restore();
        });

      if (spec.playhead !== null && spec.playhead !== undefined) {
        var px = xOf(spec.playhead);
        c.strokeStyle = spec.playheadColor || spec.ink || "#C7D5E8";
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(px, 0); c.lineTo(px, lanesH); c.stroke();
        c.fillStyle = c.strokeStyle;
        c.beginPath(); c.arc(px, 4, 3, 0, Math.PI * 2); c.fill();
      }

      /* Values under the pointer. Without this a source tab can only be checked
         against its own published page at one moment — the newest sample, which
         is the one the cross-check already covers. Reading any other moment is
         what makes the tab evidence rather than decoration. */
      var hoverAt = null;
      if (spec.hoverX !== null && spec.hoverX !== undefined && spec.hoverX >= PAD) {
        hoverAt = this.timeAtX(spec.hoverX, spec.from, spec.to, PAD, plotW);
        var rows = this.hoverRows(spec.lanes, hoverAt, spec.hoverOpts);
        var hx = xOf(hoverAt);

        c.save();
        c.strokeStyle = "rgba(199,213,232,0.28)";
        c.setLineDash([2, 3]); c.lineWidth = 1;
        c.beginPath(); c.moveTo(hx, 0); c.lineTo(hx, lanesH); c.stroke();
        c.setLineDash([]);

        if (rows.length) {
          c.font = "10px " + mono;
          var lines = [(spec.fmtTime ? spec.fmtTime(hoverAt) : "")];
          rows.forEach(function (r) {
            lines.push(r.lane + (r.unit ? " " + r.unit : "") + "  "
              + r.parts.map(function (p) {
                  return (p.label ? p.label + " " : "") + p.value
                       + (p.count !== null && p.count !== undefined
                          ? "/" + p.count : "")
                       + (p.flag ? " !" : "");
                }).join("   "));
          });
          var bw = 0;
          lines.forEach(function (t) { bw = Math.max(bw, c.measureText(t).width); });
          bw += 12;
          var bh = lines.length * 12 + 8;
          var bx = hx + 8;
          if (bx + bw > w) bx = hx - bw - 8;
          if (bx < PAD) bx = PAD;
          c.fillStyle = "rgba(6,10,18,0.92)";
          c.strokeStyle = spec.hair || "rgba(126,158,200,0.14)";
          c.fillRect(bx, 2, bw, bh);
          c.strokeRect(bx, 2, bw, bh);
          c.fillStyle = spec.ink || "#C7D5E8";
          c.textAlign = "left";
          lines.forEach(function (t, i) { c.fillText(t, bx + 6, 14 + i * 12); });
        }
        c.restore();
      }

      return { xOf: xOf, layout: lay, plotW: plotW, pad: PAD, hoverAt: hoverAt };
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Chart;
  else root.Chart = Chart;

})(typeof globalThis !== "undefined" ? globalThis : this);
