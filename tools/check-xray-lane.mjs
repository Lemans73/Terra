/* ============================================================
   check-xray-lane.mjs — the X-ray lane's arithmetic, without a browser
   ------------------------------------------------------------
   The lane under the sun draws a week of GOES flux in a few hundred
   pixels and marks the flares NOAA found in it. Everything that can be
   quietly wrong in that lives in js/layers/sun/lane.js: which class a
   flux is, where a gap is a gap, which sample survives a pixel column,
   which region a flare belongs to, and where the magnet puts a moment.

   THE FIXTURES ARE REAL ROWS, taken from NOAA SWPC on 2026-09-11:
   the 34 flares of that week with their own classes, the minutes around
   the M1.0 of 5 September, the 82-minute hole of the 10th, and the
   eclipse of the 11th — an hour in which GOES-18 stood in the earth's
   shadow and reported zero.

   THE MAGNET IS DRIVEN AT REAL FRAME RATES, 60 and 120 samples a second.
   A pointer loop tested only with large steps is not tested: the steps a
   screen produces are small, and small steps are where speed and rounding
   go wrong.

   THE WINDOW ON THE WEEK is held to the rule it takes from the magnetosphere:
   it stays while the moment is well inside, follows the slider within a tenth
   and never jumps, does not crawl under a drag the lane clamps to its edge,
   keeps a film's stretch, and stays on the week. Who may make it follow is
   read from the strip, because the rule cannot say that itself.

   `--selftest` breaks each check on purpose and demands that it fails.
   A check that passes on a broken input is not a check.
   ============================================================ */

import {
  xrayClassOf, xrayFluxOf, parseXrayRows, xrayWithGaps, xrayEnvelope,
  XRAY_GAP_MS, parseFlareRows, parseXraEvents, joinFlareRegions,
  xrayPointerSpeed, xrayDragStep, xrayNearestPeak, xrayFlareAtMoment, XRAY_MAGNET_TOUCH_PX,
  xrayLaneWindow, xraySliderValue, xrayTimeAtSlider, XRAY_WINDOW_MARGIN, XRAY_WEEK_MIN, XRAY_WEEK_MS
} from '../js/layers/sun/lane.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './check-comment-only.mjs';

/* ---- The fixtures ------------------------------------------------------ */

/* SWPC's own classes next to the peak flux they were derived from. */
const CLASSES = [
  ['C6.7', 0.000006703015060338657], ['C1.2', 0.0000012498881005740259],
  ['B9.5', 9.534579703540658e-7], ['B6.2', 6.220063255568675e-7],
  ['C6.4', 0.0000064617579482728615], ['C1.5', 0.0000015257882068908657],
  ['M1.0', 0.00001019028240989428], ['C8.5', 0.000008532091669621877],
  ['B8.4', 8.410489158450218e-7], ['C5.0', 0.000005088231773697771],
  ['C1.1', 0.0000011360365306245512], ['B7.9', 7.961526762301219e-7],
  ['B7.8', 7.885927288953098e-7], ['C1.0', 0.0000010282129778715898],
  ['C2.4', 0.0000024685575681360206], ['B6.1', 6.108404022597824e-7],
  ['B6.2', 6.205974614204024e-7], ['C2.8', 0.0000028236672733328305],
  ['B6.4', 6.492067541330471e-7], ['C1.2', 0.0000012851158999183099],
  ['C1.2', 0.0000012282724810575019], ['C2.6', 0.0000026854795578401536],
  ['C3.4', 0.0000034986539958481444], ['B5.0', 5.038754693487135e-7],
  ['C1.5', 0.000001596556103322655], ['C3.2', 0.0000032198402095673373],
  ['C1.4', 0.000001419982140760112], ['B6.0', 6.042977815923223e-7],
  ['B5.6', 5.667396862918395e-7], ['C1.6', 0.000001619128511265444],
  ['B8.1', 8.120343295558996e-7], ['B6.5', 6.569279094037483e-7],
  ['B5.3', 5.391784725361504e-7], ['B5.8', 5.829851943417452e-7]
];

const rowsOf = compact => compact.map(([t, flux, flag]) => ({
  time_tag: '2026-' + t + ':00Z', energy: '0.1-0.8nm', satellite: 18,
  flux, electron_contaminaton: flag === 1
}));

// The M1.0 of 5 September: a rise of seven minutes, a peak, a long decay.
const PEAK_ROWS = rowsOf([
  ['09-05T14:58', 4.044e-7, 0], ['09-05T14:59', 4.037e-7, 0], ['09-05T15:00', 4.052e-7, 0],
  ['09-05T15:01', 4.056e-7, 0], ['09-05T15:02', 4.11e-7, 0], ['09-05T15:03', 4.134e-7, 0],
  ['09-05T15:04', 4.133e-7, 0], ['09-05T15:05', 4.199e-7, 0], ['09-05T15:06', 4.339e-7, 0],
  ['09-05T15:07', 4.425e-7, 0], ['09-05T15:08', 4.48e-7, 0], ['09-05T15:09', 4.652e-7, 0],
  ['09-05T15:10', 5.123e-7, 0], ['09-05T15:11', 6.356e-7, 0], ['09-05T15:12', 0.000001049, 0],
  ['09-05T15:13', 0.000002183, 0], ['09-05T15:14', 0.000004465, 0], ['09-05T15:15', 0.000007172, 0],
  ['09-05T15:16', 0.000009064, 0], ['09-05T15:17', 0.000009905, 0], ['09-05T15:18', 0.00001019, 0],
  ['09-05T15:19', 0.0000101, 0], ['09-05T15:20', 0.000009705, 0], ['09-05T15:21', 0.000009111, 0],
  ['09-05T15:22', 0.000008412, 0], ['09-05T15:23', 0.000007705, 0], ['09-05T15:24', 0.000006965, 0],
  ['09-05T15:25', 0.000006325, 0], ['09-05T15:26', 0.000005748, 0], ['09-05T15:27', 0.000005233, 0],
  ['09-05T15:28', 0.000004785, 0], ['09-05T15:29', 0.000004399, 0], ['09-05T15:30', 0.000004065, 0],
  ['09-05T15:31', 0.000003788, 0], ['09-05T15:32', 0.000003554, 0], ['09-05T15:33', 0.000003769, 0],
  ['09-05T15:34', 0.000003972, 0], ['09-05T15:35', 0.000003868, 0], ['09-05T15:36', 0.000003768, 0],
  ['09-05T15:37', 0.000003615, 0], ['09-05T15:38', 0.000003413, 0], ['09-05T15:39', 0.000003083, 0],
  ['09-05T15:40', 0.000002807, 0]
]);
const PEAK_FLUX = 0.00001019;

// The 10th, 20:40 to 22:02: no rows at all for 82 minutes.
const GAP_ROWS = rowsOf([
  ['09-10T20:36', 4.055e-7, 0], ['09-10T20:37', 4.046e-7, 0], ['09-10T20:38', 4.049e-7, 0],
  ['09-10T20:39', 4.038e-7, 0], ['09-10T20:40', 3.998e-7, 0],
  ['09-10T22:02', 3.928e-7, 0], ['09-10T22:03', 3.896e-7, 0], ['09-10T22:04', 3.888e-7, 0],
  ['09-10T22:05', 3.868e-7, 0], ['09-10T22:06', 3.84e-7, 0]
]);

// The 11th, in the earth's shadow: rows that are there and read zero.
const ECLIPSE_ROWS = rowsOf([
  ['09-11T08:44', 3.6e-7, 0], ['09-11T08:45', 0, 1], ['09-11T08:46', 0, 1],
  ['09-11T08:47', 0, 1], ['09-11T08:48', 0, 1], ['09-11T08:49', 0, 1],
  ['09-11T08:50', 0, 1], ['09-11T08:51', 3.4e-7, 0]
]);

// One flare as SWPC lists it, and the X-ray events both satellites filed for it.
const FLARE_JSON = [{
  begin_time: '2026-09-05T15:04:00Z', max_time: '2026-09-05T15:18:00Z',
  end_time: '2026-09-05T15:27:00Z', max_class: 'M1.0', max_xrlong: PEAK_FLUX, satellite: 18
}, {
  begin_time: '2026-09-07T08:10:00Z', max_time: null, end_time: '2026-09-07T14:50:00Z',
  max_class: null, max_xrlong: null, satellite: 18
}];
const XRA_JSON = [
  { type: 'XRA', max_datetime: '2026-09-05T15:19:00', observatory: 'G19', region: 4519 },
  { type: 'XRA', max_datetime: '2026-09-05T15:18:00', observatory: 'G18', region: 4520 },
  { type: 'RSP', max_datetime: '2026-09-05T15:18:00', observatory: 'G18', region: 4444 }
];

/* ---- The checks -------------------------------------------------------- */

const results = [];
const ok = (name, detail) => results.push({ name, pass: true, detail });
const bad = (name, detail) => results.push({ name, pass: false, detail });

/* The control implementations: what the lane would do if it took the obvious
   route. Each one has to FAIL the check it stands next to. */
const roundedClass = flux => {
  const e = Math.min(Math.max(Math.floor(Math.log10(flux)), -8), -4);
  return 'ABCMX'[e + 8] + (flux / Math.pow(10, e)).toFixed(1);
};
const stridePoints = (points, from, to, columns) => {
  const step = Math.max(1, Math.floor(points.length / columns));
  return points.filter((_, i) => i % step === 0);
};
// Whichever event matched first, instead of the one from the flare's own satellite.
const joinByFirst = (flares, xra) => flares.map(f => {
  if (f.peak == null) return f;
  const hit = xra.find(e => e.region && Math.abs(e.peak - f.peak) <= 2 * 60000);
  return hit ? { ...f, region: hit.region } : f;
});

function checkClasses(classOf) {
  const wrong = CLASSES.filter(([cls, flux]) => classOf(flux) !== cls)
    .map(([cls, flux]) => cls + ' vs ' + classOf(flux));
  if (wrong.length) return bad('class', wrong.length + ' of ' + CLASSES.length + ' differ from SWPC: ' + wrong.slice(0, 3).join(', '));
  ok('class', 'all ' + CLASSES.length + " classes equal SWPC's own");
}

function checkRoundTrip() {
  const wrong = CLASSES.filter(([cls]) => {
    const f = xrayFluxOf(cls);
    return !(f > 0) || xrayClassOf(f) !== cls;
  }).map(([cls]) => cls);
  if (wrong.length) return bad('class round trip', wrong.join(', '));
  ok('class round trip', 'every class survives flux and back');
}

function checkPeak(reduce) {
  const { points } = parseXrayRows(PEAK_ROWS);
  const from = points[0].time, to = points[points.length - 1].time;
  const drawn = reduce(xrayWithGaps(points), from, to, 5);
  const max = drawn.reduce((m, p) => (p.v > m ? p.v : m), 0);
  if (max !== PEAK_FLUX) return bad('peak', 'the highest drawn point is ' + max.toExponential(3) +
    ' (' + xrayClassOf(max) + ') where the flare measured ' + PEAK_FLUX.toExponential(3) + ' (M1.0)');
  ok('peak', 'the M1.0 survives 43 minutes squeezed into 5 columns');
}

/* The hole of the 10th, in the rows themselves: 20:40 is the last row before it
   and 22:02 the first after. What the lane may not do is join those two with a
   line, so there has to be a break between them and nothing drawn inside. */
const HOLE_FROM = Date.parse('2026-09-10T20:40:00Z');
const HOLE_TO = Date.parse('2026-09-10T22:02:00Z');

function checkGap(withGaps) {
  const { points } = parseXrayRows(GAP_ROWS);
  const drawn = xrayEnvelope(withGaps(points), points[0].time, points[points.length - 1].time, 10);
  const inside = drawn.filter(p => p.v > 0 && p.time > HOLE_FROM && p.time < HOLE_TO);
  if (inside.length) return bad('gap', inside.length + ' drawn points inside a hole with no rows');
  const marker = drawn.find(p => !(p.v > 0) && p.time >= HOLE_FROM && p.time <= HOLE_TO);
  if (!marker) return bad('gap', 'nothing breaks the line across the 82-minute hole');
  ok('gap', 'the 82-minute hole breaks the line at ' +
    new Date(marker.time).toISOString().slice(11, 16));
}

function checkZero(parse) {
  const { points } = parse(ECLIPSE_ROWS);
  const zeros = points.filter(p => p.v === 0);
  if (zeros.length) return bad('zero', zeros.length + ' zeroes reached the lane as a value');
  const drawn = xrayEnvelope(xrayWithGaps(points), points[0].time, points[points.length - 1].time, 20);
  const nan = drawn.filter(p => !(p.v > 0));
  if (nan.length !== 1) return bad('zero', 'the shadow became ' + nan.length + ' gaps instead of one');
  if (!points.some(p => p.flag)) return bad('zero', 'the contamination flag was dropped');
  ok('zero', 'an hour of earth shadow is one gap, and keeps its flag');
}

function checkEdges() {
  const { points } = parseXrayRows(PEAK_ROWS);
  const from = points[0].time, to = points[points.length - 1].time;
  const drawn = xrayEnvelope(xrayWithGaps(points), from, to, 6);
  const first = drawn.find(p => p.v > 0), last = [...drawn].reverse().find(p => p.v > 0);
  if (!first || first.time !== from) return bad('edges', 'the first measurement is not in the series');
  if (!last || last.time !== to) return bad('edges', 'the last measurement is not in the series');
  ok('edges', 'both ends are the samples themselves, so nothing hatches as missing');
}

/* chart.js draws every n-th point with n = floor(count / plot width). The
   envelope has to stay under two points per column or that n becomes 2 and half
   of the extremes disappear after all. */
function checkWidth() {
  const rows = [];
  const t0 = Date.parse('2026-09-04T00:00:00Z');
  for (let i = 0; i < 10080; i++) {
    const gap = i % 1440 >= 540 && i % 1440 < 600;      // an hour of shadow a day
    rows.push({ time_tag: new Date(t0 + i * 60000).toISOString(), energy: '0.1-0.8nm',
                satellite: 18, flux: gap ? 0 : 4e-7 + Math.sin(i / 50) * 1e-7 });
  }
  const { points } = parseXrayRows(rows);
  const columns = 700;
  const drawn = xrayEnvelope(xrayWithGaps(points), points[0].time, points[points.length - 1].time, columns);
  const stride = Math.max(1, Math.floor(drawn.length / columns));
  if (stride !== 1) return bad('width', drawn.length + ' points on ' + columns +
    ' columns makes chart.js skip every ' + stride + 'nd');
  ok('width', drawn.length + ' points for ' + columns + ' columns: chart.js draws them all');
}

function checkRegions(join) {
  const flares = parseFlareRows(FLARE_JSON);
  const xra = parseXraEvents(XRA_JSON);
  if (xra.length !== 2) return bad('regions', 'parsed ' + xra.length + ' X-ray events instead of the 2 XRA rows');
  const joined = join(flares, xra);
  const m = joined[0], noPeak = joined[1];
  if (m.region !== 4520) {
    return bad('regions', 'the M1.0 got region ' + m.region + ' instead of 4520 from its own satellite');
  }
  if (noPeak.region != null) return bad('regions', 'a flare without a peak was given a region');
  ok('regions', "the flare takes its own satellite's region; without a peak it takes none");
}

/* ---- The magnet -------------------------------------------------------- */

/* A lane of one hour on 600 px behind the 52 px gutter, and three flares: a C
   and a B far apart, and a weaker B twelve pixels beside the C for the tie.
   The peaks sit on whole pixels, so "on the peak" is an exact comparison. */
const LANE = { from: 0, to: 3600e3, pad: 52, width: 600 };
const laneX = t => LANE.pad + (t - LANE.from) / (LANE.to - LANE.from) * LANE.width;
const laneT = x => LANE.from + (x - LANE.pad) / LANE.width * (LANE.to - LANE.from);
const FLARE_C = { peak: laneT(202), cls: 'C4.2', peakFlux: 4.2e-6 };
const FLARE_B = { peak: laneT(502), cls: 'B6.0', peakFlux: 6.0e-7 };
const FLARE_WEAK = { peak: laneT(214), cls: 'B2.0', peakFlux: 2.0e-7 };
const peaksOf = list => list.map(f => ({ x: laneX(f.peak), flare: f }));
const MOUSE_REACH = 6;   // the click threshold, CLICK_SLOP_PX

/* Pointer positions from `a` to `b` at a steady speed, one per frame. */
function ramp(a, b, pxPerS, hz) {
  const step = (pxPerS / hz) * Math.sign(b - a);
  const out = [];
  for (let x = a; step > 0 ? x <= b + 1e-9 : x >= b - 1e-9; x += step) out.push(x);
  return out;
}

/* A drag replayed through a step function, one sample per frame. */
function gesture(step, xs, { hz, reach, peaks, aimSpeed }) {
  let drag = null;
  const times = xs.map((x, i) => {
    drag = step(drag, { x, t: i * 1000 / hz }, { reach, peaks, timeAtX: laneT, aimSpeed });
    return drag.time;
  });
  return { drag, times, end: (xs.length - 1) * 1000 / hz };
}

function checkSpeed() {
  for (const hz of [60, 120]) {
    for (const v of [60, 600]) {
      const samples = [];
      for (let i = 0; i <= hz; i++) samples.push({ x: 100 + v * i / hz, t: i * 1000 / hz });
      const read = xrayPointerSpeed(samples, samples[samples.length - 1].t);
      if (Math.abs(read - v) > v * 0.05) return bad('pointer speed', v + ' px/s at ' + hz + ' Hz read as ' + read.toFixed(1));
    }
  }
  const rest = xrayPointerSpeed([{ x: 100, t: 0 }, { x: 110, t: 16.7 }, { x: 110, t: 400 }], 400);
  if (!(rest < 30)) return bad('pointer speed', 'a pointer resting for 380 ms reads as ' + rest.toFixed(1) + ' px/s');
  ok('pointer speed', '60 and 600 px/s read within 5 % at 60 and 120 Hz; a resting pointer reads as slow');
}

function checkAim(step) {
  const peaks = peaksOf([FLARE_C, FLARE_B]);
  const xs = ramp(240, 205, 40, 60);
  const { drag, end } = gesture(step, xs, { hz: 60, reach: MOUSE_REACH, peaks });
  if (drag.time !== FLARE_C.peak) {
    return bad('magnet aim', 'aiming at 40 px/s ended ' + ((drag.time - FLARE_C.peak) / 60000).toFixed(2) + ' min from the peak');
  }
  const release = step(drag, { x: xs[xs.length - 1], t: end + 250 }, { reach: MOUSE_REACH, peaks, timeAtX: laneT });
  if (release.time !== FLARE_C.peak) return bad('magnet aim', 'letting go moved the moment off the peak');
  ok('magnet aim', 'a drag slowing onto a C4.2 lands on its peak to the millisecond, and stays on release');
}

function checkSweep(step) {
  const peaks = peaksOf([FLARE_C, FLARE_B]);
  for (const hz of [60, 120]) {
    const xs = ramp(160, 244, 1200, hz);
    const { times } = gesture(step, xs, { hz, reach: MOUSE_REACH, peaks });
    const caught = times.filter(t => t === FLARE_C.peak).length;
    if (caught) return bad('magnet sweep', 'a sweep at 1200 px/s (' + hz + ' Hz) clicked onto the peak ' + caught + ' times');
  }
  ok('magnet sweep', 'a sweep at 1200 px/s runs past the peak, at 60 and at 120 Hz');
}

function checkReach(pick, touchReach) {
  const peaks = peaksOf([FLARE_C, FLARE_B]);
  const finger = pick(190, touchReach, peaks);
  const mouse = pick(190, MOUSE_REACH, peaks);
  if (!finger || finger.flare !== FLARE_C) return bad('magnet reach', 'a finger 12 px beside a peak did not choose it');
  if (mouse) return bad('magnet reach', 'a mouse 12 px beside a peak chose it, past the click threshold');
  ok('magnet reach', 'at 12 px beside a peak a finger chooses it and a mouse does not');
}

function checkFree(step) {
  const peaks = peaksOf([FLARE_C, FLARE_B]);
  const xs = ramp(340, 360, 40, 60);
  const { times } = gesture(step, xs, { hz: 60, reach: XRAY_MAGNET_TOUCH_PX, peaks });
  const pulled = times.filter((t, i) => t !== laneT(xs[i])).length;
  if (pulled) return bad('magnet free', pulled + ' samples of a slow drag far from every peak were pulled away');
  ok('magnet free', 'a slow drag 138 px from the nearest peak follows the pointer exactly');
}

/* Caught slowly with a finger's reach, then a quick move that stays within it,
   then one that leaves it. */
function checkHold(step) {
  const peaks = peaksOf([FLARE_C, FLARE_B]);
  const lane = { reach: XRAY_MAGNET_TOUCH_PX, peaks, timeAtX: laneT };
  const xs = ramp(230, 205, 40, 60);
  const { drag: caught, end } = gesture(step, xs, { hz: 60, reach: lane.reach, peaks });
  if (caught.time !== FLARE_C.peak) return bad('magnet hold', 'the slow approach did not catch the peak');
  const quick = step(caught, { x: 187, t: end + 1000 / 60 }, lane);
  if (!(quick.speed > 180)) return bad('magnet hold', 'the quick move was not quick: ' + quick.speed.toFixed(0) + ' px/s');
  if (quick.time !== FLARE_C.peak) return bad('magnet hold', 'a quick move inside the reach let go of the peak');
  const away = step(quick, { x: 240, t: end + 2000 / 60 }, lane);
  if (away.time === FLARE_C.peak) return bad('magnet hold', 'leaving the reach did not let go');
  ok('magnet hold', 'a caught peak holds inside its reach at ' + Math.round(quick.speed) + ' px/s, and lets go outside it');
}

function checkTie(pick) {
  const got = pick(208, XRAY_MAGNET_TOUCH_PX, peaksOf([FLARE_C, FLARE_WEAK]));
  if (!got || got.flare !== FLARE_C) {
    return bad('magnet tie', 'midway between a C4.2 and a B2.0 the magnet chose ' + (got ? got.flare.cls : 'nothing'));
  }
  ok('magnet tie', 'midway between a C4.2 and a B2.0 the stronger flare wins');
}

function checkOnPeak(find) {
  const flares = [FLARE_C, FLARE_B];
  if (find(flares, FLARE_C.peak + 30e3) !== FLARE_C) return bad('on peak', 'half a minute after a peak is not on it');
  if (find(flares, FLARE_C.peak + 90e3) !== null) return bad('on peak', 'a minute and a half after a peak still stands on it');
  ok('on peak', 'within a minute of a peak the moment stands on that flare, and past it on none');
}

// Controls for the magnet: each one has to FAIL the check it is handed to.
const withLane = change => (drag, sample, lane) => xrayDragStep(drag, sample, { ...lane, ...change });
const forgetsHold = (drag, sample, lane) => xrayDragStep(drag && { ...drag, heldPeak: null }, sample, lane);
const tieToLast = (x, reach, peaks) => {
  let best = null, bestD = Infinity;
  for (const p of peaks) {
    const d = Math.abs(p.x - x);
    if (d <= reach && d <= bestD) { best = p; bestD = d; }
  }
  return best;
};

/* ---- The window on the week --------------------------------------------- */

const NEWEST = Date.parse('2026-09-14T12:00:00Z');
const HOUR = 3600e3, DAY = 24 * HOUR;

function checkWindowStays(win) {
  const cases = [
    ['the slider, mid-window at now', { to: null, cursor: NEWEST - 12 * HOUR, follow: true }],
    ['the slider, four hours from the edge', { to: NEWEST - 2 * DAY, cursor: NEWEST - 2 * DAY - 20 * HOUR, follow: true }],
    ['the lane, an hour from the edge', { to: NEWEST - 2 * DAY, cursor: NEWEST - 2 * DAY - 23 * HOUR, follow: false }]
  ];
  for (const [what, c] of cases) {
    const w = win({ ...c, width: DAY, newest: NEWEST });
    const was = c.to == null ? NEWEST : c.to;
    if (w.to !== was) return bad('window stays', what + ' moved the window ' + ((w.to - was) / HOUR).toFixed(2) + ' h');
  }
  ok('window stays', 'a moment well inside, or set in the lane, leaves the window where it is');
}

/* The slider walked back a minute at a time, from now to four days back. */
function checkWindowFollows(win) {
  const width = DAY, room = width * XRAY_WINDOW_MARGIN;
  let to = null, jump = 0, closest = Infinity;
  for (let t = NEWEST; t >= NEWEST - 4 * DAY; t -= 60000) {
    const w = win({ to, width, newest: NEWEST, cursor: t, follow: true });
    jump = Math.max(jump, Math.abs(w.to - (to == null ? NEWEST : to)));
    if (w.to < NEWEST) closest = Math.min(closest, t - w.from, w.to - t);
    to = w.to;
  }
  const moved = NEWEST - to;
  if (jump > 60000) return bad('window follows', 'one minute of slider moved the window ' + (jump / 60000).toFixed(0) + ' min');
  if (closest < room) {
    return bad('window follows', 'the moment came within ' + (closest / 60000).toFixed(0) + ' min of an edge; the margin is ' + (room / 60000) + ' min');
  }
  if (moved < 3 * DAY) return bad('window follows', 'four days of slider moved the window ' + (moved / HOUR).toFixed(1) + ' h');
  ok('window follows', 'four days back a minute at a time: at most a minute a step, and ' + (room / HOUR).toFixed(1) + ' h of room kept');
}

/* A drag held past the lane's left edge: the lane clamps each sample to the
   edge, so every one of them is the window's first minute. */
function checkWindowDrag(win) {
  const start = NEWEST - 2 * DAY;
  let to = start;
  for (let i = 0; i < 20; i++) to = win({ to, width: DAY, newest: NEWEST, cursor: to - DAY }).to;
  if (to !== start) return bad('window drag', 'twenty samples on the edge moved the window ' + ((start - to) / HOUR).toFixed(1) + ' h');
  ok('window drag', 'twenty samples clamped to the left edge leave the window where it was');
}

function checkWindowWeek(win) {
  const back = win({ to: NEWEST - 5 * DAY, width: DAY, newest: NEWEST, cursor: NEWEST - 10 * DAY });
  const ahead = win({ to: NEWEST - 5 * DAY, width: DAY, newest: NEWEST, cursor: NEWEST + HOUR });
  const week = win({ to: NEWEST - DAY, width: 7 * DAY, newest: NEWEST, cursor: NEWEST - 3 * DAY });
  const wrong = [];
  if (back.from !== NEWEST - XRAY_WEEK_MS) wrong.push('ten days back starts the window ' + ((NEWEST - back.from) / DAY).toFixed(2) + ' days back');
  if (ahead.to !== NEWEST) wrong.push('an hour past the newest sample ends the window ' + ((ahead.to - NEWEST) / HOUR).toFixed(2) + ' h past it');
  if (week.from !== NEWEST - XRAY_WEEK_MS || week.to !== NEWEST) wrong.push('a window of a week is not the whole week');
  if (wrong.length) return bad('window week', wrong.join('; '));
  ok('window week', 'never before a week back, never past the newest sample, and 7d is the whole week');
}

function checkWindowKeep(win) {
  const t = NEWEST - 3 * DAY;
  const film = { from: t - 6 * HOUR, to: t + 6 * HOUR };
  // The window as the slider left it: the moment a tenth from its left edge.
  const w = win({ to: t + 0.9 * DAY, width: DAY, newest: NEWEST, keep: film });
  if (w.from > film.from || w.to < film.to) {
    return bad('window film', 'a film of 12 h around the moment starts ' + ((w.from - film.from) / HOUR).toFixed(1) + ' h before the window');
  }
  ok('window film', 'a film of twelve hours around the moment is brought onto the window');
}

function checkSlider(valueOf, timeAt) {
  const wrong = [];
  const t = NEWEST - (3 * DAY + 4 * HOUR + 17 * 60000);
  if (valueOf(NEWEST, NEWEST) !== XRAY_WEEK_MIN) wrong.push('now is ' + valueOf(NEWEST, NEWEST) + ', not the right end');
  if (valueOf(NEWEST - XRAY_WEEK_MS, NEWEST) !== 0) wrong.push('a week back is ' + valueOf(NEWEST - XRAY_WEEK_MS, NEWEST) + ', not the left end');
  if (timeAt(XRAY_WEEK_MIN, NEWEST) !== NEWEST || timeAt(0, NEWEST) !== NEWEST - XRAY_WEEK_MS) wrong.push('the ends are not now and a week back');
  if (timeAt(valueOf(t, NEWEST), NEWEST) !== t) wrong.push('3 days 4 h 17 min back does not survive the slider');
  if (valueOf(NEWEST + HOUR, NEWEST) !== XRAY_WEEK_MIN || valueOf(NEWEST - 8 * DAY, NEWEST) !== 0) wrong.push('a moment off the week is not held at its end');
  if (wrong.length) return bad('slider', wrong.join('; '));
  ok('slider', 'the right end is now and the left end a week back, and a minute survives the way there and back');
}

/* ---- The strip, read ----------------------------------------------------- */

/* The rule cannot say who calls it. That only the slider makes the window
   follow, and that the lane never moves it, is read from the strip. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STRIP = 'js/ui/solar-time.js';
const stripSource = () => readFileSync(join(ROOT, STRIP), 'utf8');

/* The text from head to its closing brace, or null. */
function blockOf(src, head) {
  const at = src.indexOf(head);
  if (at < 0) return null;
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  return null;
}

function checkStripFollow(src) {
  const code = stripComments(src);
  const wrong = [];
  const slider = blockOf(code, "slider?.addEventListener('input'");
  if (!slider || !slider.includes('follow: true')) wrong.push('the slider does not make the window follow');
  const follows = code.split('follow: true').length - 1;
  if (follows !== 1) wrong.push('follow: true is written ' + follows + ' times, and only the slider may');
  for (const name of ['onDown', 'onMove', 'onUp']) {
    const fn = blockOf(code, 'function ' + name + '(');
    if (!fn) wrong.push(name + ' not found');
    else if (/placeWindow\(|xrayLaneWindow\(/.test(fn)) wrong.push(name + ' moves the window');
  }
  const draw = blockOf(code, 'function draw(');
  if (!draw || !/placeWindow\(\{\s*cursor:\s*cursorTime\(\)\s*\}\)/.test(draw)) {
    wrong.push('a redraw does not bring the window to a moment off it');
  }
  if (wrong.length) return bad('strip follows', wrong.join('; '));
  ok('strip follows', 'only the slider makes the window follow, the lane never moves it, and a redraw brings it to a moment off it');
}

/* One replacement in the strip; one that finds nothing throws. */
function stripWith(from, to) {
  const src = stripSource();
  if (!src.includes(from)) throw new Error('"' + from.trim() + '" is not in ' + STRIP);
  return src.replace(from, to);
}

// Controls for the window: each one has to FAIL the check it is handed to.
const jumpAtEdge = o => {
  const end = o.to == null ? o.newest : o.to;
  const to = o.cursor < end - o.width ? end - o.width * 0.9 : end;
  return { from: to - o.width, to };
};
const unclamped = o => {
  let end = o.to == null ? o.newest : o.to;
  const room = o.width * XRAY_WINDOW_MARGIN;
  if (o.cursor != null && (o.follow || o.cursor < end - o.width || o.cursor > end)) {
    if (o.cursor > end - room) end = o.cursor + room;
    else if (o.cursor < end - o.width + room) end = o.cursor + o.width - room;
  }
  return { from: end - o.width, to: end };
};
const countedFromNow = (t, newest) => Math.max(0, Math.min(XRAY_WEEK_MIN, Math.round((newest - t) / 60000)));

/* ---- Running ----------------------------------------------------------- */

const selftest = process.argv.includes('--selftest');

checkClasses(xrayClassOf);
checkRoundTrip();
checkPeak(xrayEnvelope);
checkGap(xrayWithGaps);
checkZero(parseXrayRows);
checkEdges();
checkWidth();
checkRegions(joinFlareRegions);
checkSpeed();
checkAim(xrayDragStep);
checkSweep(xrayDragStep);
checkReach(xrayNearestPeak, XRAY_MAGNET_TOUCH_PX);
checkFree(xrayDragStep);
checkHold(xrayDragStep);
checkTie(xrayNearestPeak);
checkOnPeak(xrayFlareAtMoment);
checkWindowStays(xrayLaneWindow);
checkWindowFollows(xrayLaneWindow);
checkWindowDrag(xrayLaneWindow);
checkWindowWeek(xrayLaneWindow);
checkWindowKeep(xrayLaneWindow);
checkSlider(xraySliderValue, xrayTimeAtSlider);
checkStripFollow(stripSource());

for (const r of results) {
  console.log((r.pass ? '  ok    ' : '  FAIL  ') + r.name.padEnd(18) + r.detail);
}
let failed = results.filter(r => !r.pass).length;

const breaks = [
  ['class by rounding', () => checkClasses(roundedClass)],
  ['peak by stride', () => checkPeak(stridePoints)],
  ['gap without markers', () => checkGap(p => p)],
  ['zero as a value', () => checkZero(json => ({
    points: json.map(r => ({ time: Date.parse(r.time_tag), v: +r.flux, flag: r.electron_contaminaton === true }))
  }))],
  ['region from the wrong satellite', () => checkRegions(joinByFirst)],
  ['a magnet without reach', () => checkAim(withLane({ reach: 0 }))],
  ['a magnet without the speed gate', () => checkSweep(withLane({ aimSpeed: Infinity }))],
  ['a finger with the mouse reach', () => checkReach(xrayNearestPeak, MOUSE_REACH)],
  ['a magnet that reaches everywhere', () => checkFree(withLane({ reach: Infinity }))],
  ['a magnet that forgets its hold', () => checkHold(forgetsHold)],
  ['a tie that goes to the last peak', () => checkTie(tieToLast)],
  ['on a peak at any distance', () => checkOnPeak((flares, t) => xrayFlareAtMoment(flares, t, Infinity))],
  ['a lane moment that moves the window', () => checkWindowStays(o => xrayLaneWindow({ ...o, follow: true }))],
  ['a window that jumps at the edge', () => checkWindowFollows(jumpAtEdge)],
  ['a window without room at the edge', () => checkWindowFollows(o => xrayLaneWindow({ ...o, margin: 0 }))],
  ['a window that crawls under a drag', () => checkWindowDrag(o => xrayLaneWindow({ ...o, follow: true }))],
  ['a window off the week', () => checkWindowWeek(unclamped)],
  ['a film left off the window', () => checkWindowKeep(o => xrayLaneWindow({ ...o, keep: null }))],
  ['a slider counted from now', () => checkSlider(countedFromNow, xrayTimeAtSlider)],
  ['a lane drag that moves the window', () => checkStripFollow(stripWith(
    '      if (dragging) setMoment(t);', '      if (dragging) { placeWindow({ cursor: t, follow: true }); setMoment(t); }'))],
  ['a redraw that follows within the margin', () => checkStripFollow(stripWith(
    'placeWindow({ cursor: cursorTime() });', 'placeWindow({ cursor: cursorTime(), follow: true });'))]
];

if (selftest) {
  console.log('\n  --selftest: every check below has to FAIL');
  for (const [name, run] of breaks) {
    const before = results.length;
    let caught = false;
    try {
      run();
      caught = results.length > before && results.slice(before).every(r => !r.pass);
    } catch (e) {
      console.log('  FAIL  break: ' + name + ' could not be applied: ' + e.message);
    }
    console.log((caught ? '  ok    ' : '  FAIL  ') + ('break: ' + name).padEnd(52) +
      (caught ? 'caught' : 'SLIPPED THROUGH'));
    if (!caught) failed++;
    results.length = before;
  }
}

if (failed) {
  console.log('\n' + failed + ' failed');
  process.exit(1);
}
console.log('\nall green (' + results.length + ' checks' + (selftest ? ' plus ' + breaks.length + ' breaks' : '') + ')');
