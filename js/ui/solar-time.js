/* ============================================================
   TERRA — Sun · the time strip under the sun
   ------------------------------------------------------------
   The sun state's own time axis, in the place of the time island — the
   same arrangement the magnetosphere has (js/ui/magnetosphere-strip.js),
   and for the same reason: there IS a moment to choose here, but only
   within the stretch that was measured. A slider reaching back to 1985
   would promise a sun nobody recorded.

   THE TRACK IS THE MEASUREMENT. One lane: the X-ray flux of the primary
   GOES satellite in the band that defines the flare class. It is the one
   thing in this state that is measured rather than imaged, and it is what
   makes a moment worth choosing — the flares are where the curve goes up.

   TWO TIMES, BECAUSE THERE ARE TWO.
     the playhead   the chosen moment, which is Terra's global moment
     a dashed mark  when the image on screen was taken
   Choose "now" and the mark for AIA stands an hour to the left. That gap
   is the processing chain, it is true, and a strip that hid it would be
   telling the reader the picture is live.

   THE STRIP SETS THE MOMENT THROUGH THE CLOCK, the same three handles the
   magnetosphere uses (index.html, `sceneClock`), and gives the visitor's
   moment back on the way out. Scrubbing never fetches: an image is one
   to four megabytes and seconds of someone else's rendering, so fetching
   stays behind a button.

   THE DRAWING IS chart.js, UNCHANGED — it is a byte-identical copy of the
   proof of concept. What this file supplies is a canvas with a size, a
   palette, a window, and the pointer.
   ============================================================ */

import { xrayEnvelope, xrayWithGaps, xraySampleAt, xrayClassOf, flareLetter } from '../layers/sun/lane.js';
import { CLICK_SLOP_PX } from './label-passthrough.js';

/* The three windows, the same three the magnetosphere strip offers, and the
   first is the default: one habit for both strips. Each ends at the newest
   sample, so the strip never scrolls; wider means further back. */
export const SOLAR_WINDOWS = [
  { id: '24h', label: '24h', ms: 24 * 3600e3 },
  { id: '3d',  label: '3d',  ms: 3 * 24 * 3600e3 },
  { id: '7d',  label: '7d',  ms: 7 * 24 * 3600e3 }
];

/* A moment within this much of the newest sample is "now". The feed is on whole
   minutes and lags the wall clock by one or two of them; asking the visitor to
   hit the last pixel exactly would make "now" unreachable by dragging. */
const SOLAR_NOW_SLACK_MS = 2 * 60000;

/* The class boundaries as horizontal marks. chart.js writes each label just
   above its line, so "B" sits inside the B decade. */
const SOLAR_CLASS_MARKS = [
  { v: 1e-7, label: 'B' }, { v: 1e-6, label: 'C' },
  { v: 1e-5, label: 'M' }, { v: 1e-4, label: 'X' }
];

/* A fixed scale from A to ten times X. A scale fitted to the data would move
   the class lines every time a flare came in, and the lines are how the lane
   is read. X10 is rare, and above it the curve clips at the top edge — which
   reads as "off the scale", and that is what it is. */
const SOLAR_SCALE = { lo: -8, hi: -3, tick: 1, log: true };

/* The palette, read from the stylesheet once. A missing colour draws black, and
   a lane that is there but invisible is worse than an error — so it throws, the
   same choice the magnetosphere strip makes. */
const SOLAR_PALETTE = {
  ink: '--ink', inkDim: '--ink-dim', inkFaint: '--ink-faint', hair: '--hair',
  measured: '--solar-measured', classLine: '--solar-class', onScreen: '--solar-onscreen',
  flag: '--solar-flag',
  A: '--solar-flare-b', B: '--solar-flare-b', C: '--solar-flare-c',
  M: '--solar-flare-m', X: '--solar-flare-x'
};

/* FROM M UPWARD A FLARE GETS A LINE AND ITS CLASS. Below that the band at the
   lane's foot is the mark: a quiet week has thirty-odd B and C flares, and as
   many full-height lines would bury the curve they were read from. Hover and
   the card say the rest. */
const SOLAR_LABELLED = new Set(['M', 'X']);

/* How far beside a flare's band a pointer may be and still mean that flare,
   in CSS pixels. A C flare of ten minutes is two pixels wide on a week. */
const SOLAR_FLARE_REACH_PX = 5;

const SOLAR_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* The time axis, in UTC like the flux itself. Below a day only the clock; the
   first label that fits carries the date, wherever it falls (chart.js passes
   that as the third argument). */
function fmtTick(t, step, wantDate) {
  const d = new Date(t);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const clock = step < 3600e3 ? hh + ':' + mm : hh + 'h';
  if (!wantDate && d.getUTCHours() !== 0) return clock;
  return String(d.getUTCDate()).padStart(2, '0') + ' ' + SOLAR_MONTHS[d.getUTCMonth()] + ' ' + clock;
}

function fmtUtc(t) {
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

export function createSolarTime(deps) {
  const { feed, clock, moment, isLive, Chart, fmtStamp, formatOffset } = deps;
  /* Both optional. `onScreen` says what the image on screen is; `onFetch` is
     absent in the standalone, where there is nothing to fetch. */
  const onScreen = deps.onScreen || (() => null);
  const onFetch = deps.onFetch || null;
  // Opens the flare's card; the strip has already put the moment on its peak.
  const onFlare = deps.onFlare || null;
  // Told after every redraw, for the flare labels on the sun.
  const onDrawn = deps.onDrawn || null;

  const root = document.getElementById('solar-time');
  const canvas = document.getElementById('solar-lane');
  const btnWindow = document.getElementById('sol-window');
  const btnMoment = document.getElementById('sol-val');
  const btnFetch = document.getElementById('sol-fetch');
  const note = document.getElementById('sol-note');
  if (!root || !canvas || !Chart) return null;

  const ctx = canvas.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const palette = {};
  const missing = [];
  for (const [key, name] of Object.entries(SOLAR_PALETTE)) {
    const v = css.getPropertyValue(name).trim();
    if (v) palette[key] = v; else missing.push(name);
  }
  if (missing.length) throw new Error('the solar strip palette is incomplete: ' + missing.join(', '));
  const mono = css.getPropertyValue('--mono').trim() ||
    'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  let windowIndex = 0;
  let entered = false;
  let saved = null;              // the visitor's moment, handed back on exit
  let hoverX = null;
  let dragging = false;
  let noteTimer = null;
  const S = { w: 0, h: 0, dpr: 0, from: 0, to: 0, plotW: 0, lastDraw: 0, pending: null };

  const currentWindow = () => SOLAR_WINDOWS[windowIndex];

  /* ---- The window ------------------------------------------------------ */

  function range() {
    const newest = feed.newest();
    const to = newest != null ? newest : Date.now();
    return { from: to - currentWindow().ms, to, newest };
  }

  /* The smallest window that still shows `t`, so a moment chosen elsewhere lands
     on the strip rather than off its left edge. */
  function windowFor(t) {
    const newest = feed.newest() != null ? feed.newest() : Date.now();
    const age = newest - t;
    const i = SOLAR_WINDOWS.findIndex(w => w.ms >= age * 1.05);
    return i < 0 ? SOLAR_WINDOWS.length - 1 : i;
  }

  function setWindow(i) {
    windowIndex = i;
    feed.cover(currentWindow().ms);
    if (btnWindow) btnWindow.textContent = currentWindow().label;
    /* A narrower window can leave the moment off its left edge. The moment moves
       onto the strip rather than off the screen: a playhead nobody can see is a
       moment nobody chose. */
    if (!isLive()) {
      const { from } = range();
      if (moment().getTime() < from) clock.zet(new Date(from));
    }
    draw(true);
  }

  /* ---- The canvas ------------------------------------------------------ */

  /* A canvas is a replaced element: without a CSS box it falls back to the
     width of its own attribute. The box lives in the stylesheet; the buffer
     follows it here. */
  function measure() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w === S.w && h === S.h && dpr === S.dpr) return;
    S.w = w; S.h = h; S.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* The moment the playhead stands on. Live means the newest sample: the lane
     ends there, and "now" is the right edge. */
  function cursorTime() {
    const { newest } = range();
    if (isLive()) return newest;
    return moment().getTime();
  }

  function spec() {
    const { from, to } = range();
    S.from = from; S.to = to;
    S.plotW = Math.max(1, S.w - Chart.PAD);
    const points = xrayEnvelope(xrayWithGaps(feed.points()), from, to, S.plotW);
    // For the measurement hook: the envelope may not lower the window's peak.
    S.drawn = points.length;
    S.drawnMax = points.reduce((m, p) => (p.v > m ? p.v : m), 0);
    S.rawMax = feed.points().reduce((m, p) => (p.time >= from && p.time <= to && p.v > m ? p.v : m), 0);
    const sat = feed.satellite();
    const shown = onScreen();
    const marks = [];
    if (shown && Number.isFinite(shown.time)) {
      marks.push({ time: shown.time, label: shown.label, color: palette.onScreen, dash: [3, 3] });
    }

    /* The flares in the window: a band from begin to end at the lane's foot for
       every one, and from M upward a line at the peak with SWPC's class. A flare
       still in progress has no end yet, so its band runs to its peak — or, with
       neither, a minute past its begin: it happened, and it may not round to
       nothing. */
    const flares = feed.flares().filter(f => (f.end ?? f.peak ?? f.begin) >= from && f.begin <= to);
    S.flares = flares;
    const bands = flares.map(f => ({
      from: f.begin,
      to: f.end != null ? f.end : (f.peak != null ? f.peak : f.begin + 60000),
      color: palette[flareLetter(f.cls)] || palette.A
    }));
    let labelled = 0;
    for (const f of flares) {
      const letter = flareLetter(f.cls);
      if (f.peak == null || !SOLAR_LABELLED.has(letter)) continue;
      marks.push({ time: f.peak, label: f.cls, color: palette[letter] });
      labelled++;
    }
    S.bands = bands.length;
    S.labelled = labelled;

    const state = feed.state();
    return {
      width: S.w, height: S.h, from, to, mono,
      ink: palette.ink, inkFaint: palette.inkFaint, hair: palette.hair,
      fmtTick, fmtTime: fmtUtc,
      lanes: [{
        label: (sat ? 'GOES-' + sat : 'GOES') + ' · 0.1–0.8 nm',
        unit: 'W/m² · measured',
        log: true, fixedScale: SOLAR_SCALE,
        color: palette.inkDim,
        series: [{ points, color: palette.measured, width: 1.3, flagColor: palette.flag }],
        marks: SOLAR_CLASS_MARKS.map(m => ({ ...m, color: palette.classLine })),
        bands,
        beyond: state.error ? 'no answer from NOAA' : (state.points ? 'no measurement' : 'loading…')
      }],
      playhead: cursorTime(),
      marks,
      /* Only the dashed line: the value box is drawn below, from the raw sample
         rather than from the one point that stands for a whole pixel column. */
      hoverX, hoverOpts: { nearMs: -1 }
    };
  }

  /* Which flare a pointer at `x` (CSS px in the canvas) means, if any: the one
     whose band it is on, or within reach of, and of several the one whose peak
     is nearest. A flare without a peak is only reachable at its begin — its band
     can run for hours, and it may not swallow every click in between. */
  function flareAt(x) {
    if (!S.flares || !S.flares.length || !S.plotW) return null;
    const xOf = Chart.xMapper(S.from, S.to, Chart.PAD, S.plotW);
    let best = null, bestD = Infinity;
    for (const f of S.flares) {
      const anchor = f.peak != null ? f.peak : f.begin;
      const x0 = xOf(f.begin) - SOLAR_FLARE_REACH_PX;
      const x1 = (f.peak != null && f.end != null ? xOf(f.end) : xOf(anchor)) + SOLAR_FLARE_REACH_PX;
      if (x < x0 || x > x1) continue;
      const d = Math.abs(xOf(anchor) - x);
      if (d < bestD) { bestD = d; best = f; }
    }
    return best;
  }

  function flareLine(f) {
    const peak = f.peak != null ? ' · peak ' + fmtUtc(f.peak).slice(11, 16) : '';
    return (f.cls ? f.cls + ' flare' : 'flare, no maximum reported') +
      (f.region ? ' · region ' + f.region : '') + peak;
  }

  function drawHoverBox(result) {
    if (hoverX === null || !result || result.hoverAt === null) return;
    const t = result.hoverAt;
    const p = xraySampleAt(feed.points(), t);
    const value = p && p.v > 0
      ? xrayClassOf(p.v) + '  ' + p.v.toExponential(1) + ' W/m²' + (p.flag ? '  !' : '')
      : 'no measurement';
    const lines = [fmtUtc(p ? p.time : t), value];
    const f = flareAt(hoverX);
    if (f) lines.push(flareLine(f));
    ctx.save();
    ctx.font = '10px ' + mono;
    let bw = 0;
    for (const l of lines) bw = Math.max(bw, ctx.measureText(l).width);
    bw += 12;
    const bh = lines.length * 12 + 8;
    const hx = result.xOf(t);
    let bx = hx + 8;
    if (bx + bw > S.w) bx = hx - bw - 8;
    if (bx < Chart.PAD) bx = Chart.PAD;
    ctx.fillStyle = 'rgba(6,10,18,0.92)';
    ctx.strokeStyle = palette.hair;
    ctx.fillRect(bx, 2, bw, bh);
    ctx.strokeRect(bx, 2, bw, bh);
    ctx.fillStyle = palette.ink;
    ctx.textAlign = 'left';
    lines.forEach((l, i) => ctx.fillText(l, bx + 6, 14 + i * 12));
    ctx.restore();
  }

  /* Redraws are cheap next to the scene but not free, and a pointer produces
     them faster than a screen shows them: at most one every 50 ms, with the
     last request always honoured. */
  function draw(now = false) {
    if (!entered) return;
    const since = performance.now() - S.lastDraw;
    if (!now && since < 50) {
      if (!S.pending) S.pending = setTimeout(() => { S.pending = null; draw(true); }, 50 - since);
      return;
    }
    if (S.pending) { clearTimeout(S.pending); S.pending = null; }
    S.lastDraw = performance.now();
    measure();
    ctx.clearRect(0, 0, S.w, S.h);
    const result = Chart.draw(ctx, spec());
    drawHoverBox(result);
    refreshRow();
    // Which flares the window holds is decided here, so whoever draws them on
    // the sun hears it from the same place rather than working it out again.
    if (onDrawn) onDrawn();
  }

  /* ---- The row --------------------------------------------------------- */

  function refreshRow() {
    const { newest } = range();
    const t = cursorTime();
    const live = isLive();
    if (btnMoment) {
      const p = t != null ? xraySampleAt(feed.points(), t) : null;
      const cls = p && p.v > 0 ? xrayClassOf(p.v) : null;
      let text;
      if (live || newest == null) text = 'now';
      else {
        const stamp = fmtStamp(new Date(t), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        text = (formatOffset(t - newest) || 'now') + ' · ' + stamp;
      }
      btnMoment.textContent = cls ? text + ' · ' + cls : text;
      btnMoment.classList.toggle('shifted', !live);
    }
    /* Whether the button shows is the stylesheet's business (body.solar-bare):
       `hidden` loses to a class that sets display, and .play-btn does. */
    if (btnFetch && onFetch) {
      const stamp = live ? 'now'
        : fmtStamp(new Date(t), { hour: '2-digit', minute: '2-digit' });
      btnFetch.textContent = 'Fetch · ' + stamp;
    }
  }

  /* ---- The pointer ----------------------------------------------------- */

  function timeAt(ev) {
    const r = canvas.getBoundingClientRect();
    return Chart.timeAtX(ev.clientX - r.left, S.from, S.to, Chart.PAD, S.plotW);
  }

  /* Setting the moment runs the app's whole time funnel, so a drag writes it at
     the same rate the strip redraws. The last position always lands. */
  let lastSet = 0, setPending = null;
  function setMoment(t, force = false) {
    const apply = () => {
      lastSet = performance.now();
      const { newest } = range();
      if (newest != null && t >= newest - SOLAR_NOW_SLACK_MS) clock.zetNu();
      else clock.zet(new Date(t));
      draw(true);
    };
    if (setPending) { clearTimeout(setPending); setPending = null; }
    const since = performance.now() - lastSet;
    if (force || since >= 50) apply();
    else setPending = setTimeout(() => { setPending = null; apply(); }, 50 - since);
  }

  /* A flare chosen: the moment goes to its peak, and its card opens. The same
     call serves a click on the lane and, later, a click on its label on the
     sun, so both routes land in exactly the same place. */
  function selectFlare(f) {
    setMoment(f.peak != null ? f.peak : f.begin, true);
    if (onFlare) onFlare(f);
  }

  /* CLICK OR DRAG, decided by how far the pointer travelled — the same number
     as the labels and the globe use (CLICK_SLOP_PX). A drag scrubs and snaps to
     nothing; a click on a flare means that flare, anywhere else that moment.
     Nothing is written on the press itself, so a click is one write, not two. */
  let press = null;
  function onDown(ev) {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    press = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
    dragging = false;
    canvas.setPointerCapture(ev.pointerId);
    hoverX = null;
    ev.preventDefault();
  }
  function onMove(ev) {
    if (press && ev.pointerId === press.id) {
      if (!dragging && Math.hypot(ev.clientX - press.x, ev.clientY - press.y) >= CLICK_SLOP_PX) {
        dragging = true;
      }
      if (dragging) setMoment(timeAt(ev));
      return;
    }
    if (ev.pointerType !== 'mouse') return;
    const r = canvas.getBoundingClientRect();
    hoverX = ev.clientX - r.left;
    draw();
  }
  function onUp(ev) {
    if (!press || ev.pointerId !== press.id) return;
    const wasDrag = dragging;
    press = null;
    dragging = false;
    try { canvas.releasePointerCapture(ev.pointerId); } catch {}
    if (wasDrag) { setMoment(timeAt(ev), true); return; }
    const f = flareAt(ev.clientX - canvas.getBoundingClientRect().left);
    if (f) selectFlare(f);
    else setMoment(timeAt(ev), true);
  }
  function onCancel(ev) {
    if (press && ev.pointerId === press.id) { press = null; dragging = false; }
  }
  function onLeave() { if (!press && hoverX !== null) { hoverX = null; draw(); } }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('pointerleave', onLeave);

  btnWindow?.addEventListener('click', () => setWindow((windowIndex + 1) % SOLAR_WINDOWS.length));
  btnMoment?.addEventListener('click', () => { clock.zetNu(); draw(true); });
  btnFetch?.addEventListener('click', () => { if (onFetch) onFetch(); });

  const unsubscribe = feed.onUpdate(() => draw());
  const resize = new ResizeObserver(() => draw(true));
  resize.observe(canvas);

  /* ---- A line that says why ------------------------------------------- */

  function showNote(text) {
    if (!note) return;
    note.textContent = text;
    note.hidden = false;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { note.hidden = true; }, 9000);
  }

  /* ---- Entering and leaving ------------------------------------------- */

  return {
    /* THE MOMENT ON THE WAY IN (Terry, session 52). A moment inside the
       measured week stays, and the window widens until it shows it: the sun
       then opens on the day you were looking at. A moment outside it has no
       flux to stand on, so the strip starts at now and says why. Live stays
       live. */
    enter() {
      if (entered) return;
      entered = true;
      saved = clock.lees();
      feed.start();
      if (!isLive()) {
        const t = moment().getTime();
        const age = Date.now() - t;
        const week = SOLAR_WINDOWS[SOLAR_WINDOWS.length - 1].ms;
        if (age >= 0 && age <= week - SOLAR_NOW_SLACK_MS) {
          windowIndex = windowFor(t);
        } else {
          clock.zetNu();
          showNote('Your moment, ' + fmtUtc(t) + ', lies outside the measured week — the sun shows now.');
        }
      }
      if (btnWindow) btnWindow.textContent = currentWindow().label;
      feed.cover(currentWindow().ms);
      draw(true);
    },

    exit() {
      if (!entered) return;
      entered = false;
      dragging = false;
      press = null;
      hoverX = null;
      feed.stop();
      if (note) note.hidden = true;
      if (saved) { clock.herstel(saved); saved = null; }
    },

    /* Something on screen changed — a fetch landed, a slot was cleared. */
    refresh: () => draw(true),

    selectFlare,
    /* The flares the strip is drawing, for the labels on the sun: the same list,
       so the two can never show different flares for the same window. */
    flares: () => (S.flares || []),

    /* A measurement hook: what the strip shows, read back from where it is. */
    state: () => ({
      entered,
      window: currentWindow().id,
      from: S.from ? new Date(S.from).toISOString() : null,
      to: S.to ? new Date(S.to).toISOString() : null,
      cursor: entered && cursorTime() != null ? new Date(cursorTime()).toISOString() : null,
      live: isLive(),
      canvas: [S.w, S.h, S.dpr],
      plotW: S.plotW,
      drawn: S.drawn || 0,
      drawnMax: S.drawnMax || null,
      rawMax: S.rawMax || null,
      flaresInWindow: (S.flares || []).length,
      flaresWithPeakInWindow: (S.flares || []).filter(f => f.peak != null).length,
      bands: S.bands || 0,
      labelled: S.labelled || 0,
      moment: btnMoment ? btnMoment.textContent : null,
      fetch: btnFetch && onFetch ? btnFetch.textContent : null,
      feed: feed.state()
    }),

    dispose() {
      unsubscribe();
      resize.disconnect();
    }
  };
}
