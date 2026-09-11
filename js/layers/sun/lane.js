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
 * The rounding happens BEFORE the decade test — 9.96e-7 rounds to 10.0 tenths
 * of a B, and "B10.0" is spelled "C1.0".
 */
export function xrayClassOf(flux) {
  if (!Number.isFinite(flux) || flux <= 0) return null;
  let e = Math.min(Math.max(Math.floor(Math.log10(flux)), -8), -4);
  let digit = flux / Math.pow(10, e);
  if (Number(digit.toFixed(1)) >= 10 && e < -4) {
    e += 1;
    digit = flux / Math.pow(10, e);
  }
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
