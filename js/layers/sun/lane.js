/* ============================================================
   TERRA — Sun · the X-ray lane, as arithmetic
   ------------------------------------------------------------
   Everything the lane decides that can be quietly wrong lives here, pure
   and testable in node: which class a flux is, where the measurement
   stops, and which points a few hundred pixels can carry without losing
   the one thing the lane exists for — the peaks.

   THE DRAWING IS js/compute/magnetosphere/chart.js, UNCHANGED. That file
   draws every n-th point once a series outgrows its width, which is fine
   for a quiet curve and fatal for a flare: at seven days n is fourteen,
   and a peak of a few minutes falls between two of them. So the series
   reaches it already reduced to one point per pixel column.

   PREFIXED NAMES, because tools/build-standalone.mjs pours every module
   into one script and a bare `classOf` or `GAP_MS` is exactly the kind
   of name another module has too. The build is the only check that would
   see the collision.
   ============================================================ */

/* The band NOAA derives the flare class from, 0.1–0.8 nm. The other band,
   0.05–0.4 nm, is not drawn: on GOES-18 it carries the contamination flag on
   most rows and sits on a floor of exactly 1e-9. */
export const XRAY_LONG_BAND = '0.1-0.8nm';

/**
 * "B3.0" from 3.0e-7 W/m². A starts at 1e-8 and each letter is a decade; above
 * X the digit keeps counting (X17.5), below A it drops under 1 rather than
 * inventing a letter. Null for anything the instrument cannot have said: zero
 * is GOES's outage marker, and a negative is a sentinel.
 *
 * THE DIGIT IS CUT, NOT ROUNDED, because that is what SWPC does: 1.2851e-6 is
 * a C1.2 in their list, not a C1.3. Measured on the week to 2026-09-11 against
 * all 34 flares with a peak: cutting agrees with every one of their classes,
 * rounding disagrees with 13. The tiny addition keeps a value that is exactly
 * on a tenth in decimal — and a hair below it in binary — from dropping one.
 */
export function xrayClassOf(flux) {
  if (!Number.isFinite(flux) || flux <= 0) return null;
  const e = Math.min(Math.max(Math.floor(Math.log10(flux)), -8), -4);
  const digit = Math.floor(flux / Math.pow(10, e) * 10 + 1e-9) / 10;
  return 'ABCMX'[e + 8] + digit.toFixed(1);
}

/** The inverse, for comparing two classes as fluxes. */
export function xrayFluxOf(cls) {
  if (!cls) return null;
  const m = /^([ABCMX])\s*(\d+(?:\.\d+)?)$/.exec(String(cls).trim());
  if (!m) return null;
  return Math.pow(10, 'ABCMX'.indexOf(m[1]) - 8) * parseFloat(m[2]);
}

/**
 * NOAA's rows as points on the long band, oldest first.
 *
 * ZERO BECOMES NaN. GOES reports zero when it cannot see the sun — an outage,
 * or the satellite standing in the earth's shadow, which in eclipse season is
 * an hour around 09 UT every day — and a zero on a log axis is not a low
 * value but no value. NaN is what chart.js and the envelope below read as a
 * gap.
 *
 * The flag is NOAA's electron-contamination mark. The field really is spelled
 * `electron_contaminaton`.
 */
export function parseXrayRows(json, band = XRAY_LONG_BAND) {
  const points = [];
  let satellite = null, newestRow = -Infinity;
  for (const r of Array.isArray(json) ? json : []) {
    if (!r || r.energy !== band) continue;
    const time = Date.parse(r.time_tag);
    if (!Number.isFinite(time)) continue;
    const flux = Number(r.flux);
    points.push({ time, v: flux > 0 ? flux : NaN, flag: r.electron_contaminaton === true });
    // The satellite of the newest row names the lane; a primary switch inside
    // the file is rare, and the newest row is the one on screen at "now".
    if (time > newestRow && r.satellite != null) { newestRow = time; satellite = r.satellite; }
  }
  points.sort((a, b) => a.time - b.time);
  return { points, satellite };
}

/* A step between two rows longer than this is a gap, and a NaN goes in to say
   so. NOAA leaves rows out as often as it zeroes them, and a line from the last
   sample before a gap to the first one after it is an interpolation nobody
   measured. The feed is on whole minutes, so three minutes tolerates one
   missing row and nothing more. */
export const XRAY_GAP_MS = 3 * 60000;

export function xrayWithGaps(points, gapMs = XRAY_GAP_MS) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[i - 1];
    if (prev && points[i].time - prev.time > gapMs) {
      out.push({ time: prev.time + 60000, v: NaN, gap: true });
    }
    out.push(points[i]);
  }
  return out;
}

/**
 * One point per pixel column, and that point is the column's highest flux, at
 * the moment it was measured.
 *
 * THE MAXIMUM AND NOT THE MEAN. The lane is read for its peaks — the class of
 * a flare IS its maximum — and a column that averages a four-minute M1 with
 * its quiet neighbours draws a C.
 *
 * A gap inside a column survives as its own NaN point, in time order, so the
 * line breaks where the measurement does and not a column later. Consecutive
 * NaNs collapse into one: an hour of earth shadow is one gap, not sixty. A
 * flag anywhere in a column's run marks the point that stands for it.
 *
 * THE FIRST AND LAST MEASUREMENT ARE KEPT AS THEY ARE. chart.js decides where a
 * source stops from the last finite point, and a column maximum can sit
 * anywhere inside its column — without this, the lane would hatch its final
 * column as "no measurement" while there is a sample right at its edge.
 *
 * The result holds at most one point per column, one per gap and the two
 * edges, so chart.js draws it with a stride of one.
 */
export function xrayEnvelope(points, from, to, columns) {
  const out = [];
  if (!(columns >= 1) || !(to > from)) return out;
  const span = (to - from) / columns;
  let col = -1, best = null, flagged = false, inGap = false;
  let first = null, last = null;

  const flush = () => {
    if (best) out.push(flagged && !best.flag ? { ...best, flag: true } : best);
    best = null; flagged = false;
  };

  for (const p of points) {
    if (p.time < from || p.time > to) continue;
    const c = Math.min(columns - 1, Math.floor((p.time - from) / span));
    if (c !== col) { flush(); col = c; }
    if (!(p.v > 0)) {
      flush();
      if (!inGap) out.push({ time: p.time, v: NaN });
      inGap = true;
      continue;
    }
    inGap = false;
    if (!first) first = p;
    last = p;
    if (p.flag) flagged = true;
    if (!best || p.v > best.v) best = p;
  }
  flush();

  // By time and not by identity: a flagged column point is a copy of its sample.
  for (const edge of [first, last]) {
    if (!edge || out.some(q => q.time === edge.time)) continue;
    let i = 0;
    while (i < out.length && out[i].time <= edge.time) i++;
    out.splice(i, 0, edge);
  }
  return out;
}

/**
 * The sample at a moment: the nearest one, if it lies within `nearMs`. A
 * hover or a cursor past the end of the series reports nothing rather than
 * the last value NOAA sent, which on a seven-day axis could be hours away.
 */
export function xraySampleAt(points, time, nearMs = 90000) {
  if (!points.length) return null;
  let lo = 0, hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].time < time) lo = mid + 1; else hi = mid;
  }
  let best = points[lo];
  if (lo > 0 && Math.abs(points[lo - 1].time - time) < Math.abs(best.time - time)) best = points[lo - 1];
  return Math.abs(best.time - time) <= nearMs ? best : null;
}

/* ---- The flares ---------------------------------------------------------

   SWPC's own reduction of the same curve: begin, peak and end of every flare,
   with the class SWPC gave it. That class is what the lane writes. Ours
   (xrayClassOf) only checks the parser — if the two disagree, the fault is
   here, not in NOAA's list. */

// Edited-event times come without a zone, and they are UTC.
const utcOf = s => (s ? Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z') : NaN);

/**
 * `xray-flares-7-day.json` as flares, oldest first. A flare can be listed
 * without a maximum — NOAA reported a begin and an end but no peak — and it
 * stays in the list: it happened, and saying "no maximum reported" is a
 * statement, where leaving it out would be a silence.
 */
export function parseFlareRows(json) {
  const out = [];
  for (const r of Array.isArray(json) ? json : []) {
    const begin = utcOf(r && r.begin_time);
    if (!Number.isFinite(begin)) continue;
    const peak = utcOf(r.max_time);
    const end = utcOf(r.end_time);
    out.push({
      begin,
      peak: Number.isFinite(peak) ? peak : null,
      end: Number.isFinite(end) ? end : null,
      cls: r.max_class || null,
      peakFlux: Number.isFinite(+r.max_xrlong) && r.max_xrlong != null ? +r.max_xrlong : null,
      satellite: r.satellite != null ? r.satellite : null,
      region: null
    });
  }
  out.sort((a, b) => a.begin - b.begin);
  return out;
}

/**
 * The XRA entries of `edited_events.json`: GOES X-ray events, each with the
 * region NOAA assigned it and the satellite that saw it ("G18", "G19"). Both
 * satellites report the same flare, so most peaks appear twice.
 */
export function parseXraEvents(json) {
  const out = [];
  for (const r of Array.isArray(json) ? json : []) {
    if (!r || r.type !== 'XRA') continue;
    const peak = utcOf(r.max_datetime);
    if (!Number.isFinite(peak)) continue;
    const sat = /^G(\d+)$/.exec(r.observatory || '');
    out.push({
      peak,
      satellite: sat ? +sat[1] : null,
      region: Number.isFinite(+r.region) && r.region ? +r.region : null
    });
  }
  return out;
}

/* How far apart two peaks may be and still be the same flare. Both lists come
   from the same satellites on the same one-minute series; in the week measured
   on 2026-09-11 all 34 peaks matched within a minute. */
export const FLARE_MATCH_MS = 2 * 60000;

/**
 * Give each flare the region NOAA assigned it. The event from the same
 * satellite as the flare list wins; the other satellite's record of the same
 * peak is the fallback, because the region is NOAA's call either way. No match
 * leaves `region` null, and the card says so.
 */
export function joinFlareRegions(flares, xra, tolMs = FLARE_MATCH_MS) {
  return flares.map(f => {
    if (f.peak == null) return f;
    let same = null, other = null;
    for (const e of xra) {
      if (!e.region || Math.abs(e.peak - f.peak) > tolMs) continue;
      if (e.satellite === f.satellite) { if (!same) same = e; }
      else if (!other) other = e;
    }
    const hit = same || other;
    return hit ? { ...f, region: hit.region } : f;
  });
}

/** The letter of a class, for choosing its colour. */
export const flareLetter = cls => (cls && /^[ABCMX]/.test(cls) ? cls[0] : null);
