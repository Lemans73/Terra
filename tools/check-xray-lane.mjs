/* ============================================================
   check-xray-lane.mjs — the X-ray lane's arithmetic, without a browser
   ------------------------------------------------------------
   The lane under the sun draws a week of GOES flux in a few hundred
   pixels and marks the flares NOAA found in it. Everything that can be
   quietly wrong in that lives in js/layers/sun/lane.js: which class a
   flux is, where a gap is a gap, which sample survives a pixel column,
   and which region a flare belongs to.

   THE FIXTURES ARE REAL ROWS, taken from NOAA SWPC on 2026-09-11:
   the 34 flares of that week with their own classes, the minutes around
   the M1.0 of 5 September, the 82-minute hole of the 10th, and the
   eclipse of the 11th — an hour in which GOES-18 stood in the earth's
   shadow and reported zero.

   `--selftest` breaks each check on purpose and demands that it fails.
   A check that passes on a broken input is not a check.
   ============================================================ */

import {
  xrayClassOf, xrayFluxOf, parseXrayRows, xrayWithGaps, xrayEnvelope,
  XRAY_GAP_MS, parseFlareRows, parseXraEvents, joinFlareRegions
} from '../js/layers/sun/lane.js';

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

for (const r of results) {
  console.log((r.pass ? '  ok    ' : '  FAIL  ') + r.name.padEnd(18) + r.detail);
}
let failed = results.filter(r => !r.pass).length;

if (selftest) {
  console.log('\n  --selftest: every check below has to FAIL');
  const breaks = [
    ['class by rounding', () => checkClasses(roundedClass)],
    ['peak by stride', () => checkPeak(stridePoints)],
    ['gap without markers', () => checkGap(p => p)],
    ['zero as a value', () => checkZero(json => ({
      points: json.map(r => ({ time: Date.parse(r.time_tag), v: +r.flux, flag: r.electron_contaminaton === true }))
    }))],
    ['region from the wrong satellite', () => checkRegions(joinByFirst)]
  ];
  for (const [name, run] of breaks) {
    const before = results.length;
    run();
    const caught = results.slice(before).every(r => !r.pass);
    console.log((caught ? '  ok    ' : '  FAIL  ') + ('break: ' + name).padEnd(34) +
      (caught ? 'caught' : 'SLIPPED THROUGH'));
    if (!caught) failed++;
    results.length = before;
  }
}

if (failed) {
  console.log('\n' + failed + ' failed');
  process.exit(1);
}
console.log('\nall green (' + results.length + ' checks' + (selftest ? ' plus 5 breaks' : '') + ')');
