/* ============================================================
   check-flipbook-frames.mjs — which frames a film is made of
   ------------------------------------------------------------
   js/layers/sun/film.js decides, before any picture is fetched, the
   stretch a film covers, the moments it asks Helioviewer for, and which
   answers are different pictures. Each of those can be quietly wrong and
   still produce a film that plays.

     1  the moments sit on a UTC raster: windows a minute apart share them
     2  a flare's window runs from half an hour before to half an hour after
     3  a window never runs past the newest picture the source has
     4  the answers are deduplicated on image id, in the order taken
     5  a lookup that failed is counted, not guessed
     6  lookups run three abreast, and renders one at a time (fetch.js)

   THE FIXTURE IS REAL: getClosestImage through Terra's proxy on
   2026-09-13, for the 83 minutes around the M1.0 of 5 September, one
   lookup every 4 minutes. AIA 171 answered with 21 pictures, LASCO C2
   with 8.

   `--selftest` breaks each check on purpose and demands that it fails.
   A check that passes on a broken input is not a check.
   ============================================================ */

import {
  filmWindowAround, filmWindowForFlare, filmFitToNewest, filmTargets,
  filmUnique, filmEveryMs, filmCostMb, FILM_MAX_FRAMES
} from '../js/layers/sun/film.js';
import { createSunFetch } from '../js/layers/sun/fetch.js';

/* ---- The fixture ------------------------------------------------------- */

const DAY = '2026-09-05';
const at = hhmm => Date.parse(DAY + 'T' + hhmm + ':00Z');

// [moment asked for, image id, observation time]
const AIA_171 = [
  ['14:36', '191744956', '14:35:57'], ['14:40', '191744945', '14:40:09'], ['14:44', '191744939', '14:43:45'],
  ['14:48', '191745103', '14:47:57'], ['14:52', '191745096', '14:52:09'], ['14:56', '191745090', '14:55:45'],
  ['15:00', '191745255', '14:59:57'], ['15:04', '191745385', '15:04:09'], ['15:08', '191745379', '15:07:45'],
  ['15:12', '191745568', '15:11:57'], ['15:16', '191745561', '15:16:21'], ['15:20', '191745741', '15:19:57'],
  ['15:24', '191745734', '15:24:09'], ['15:28', '191745728', '15:27:45'], ['15:32', '191746217', '15:31:57'],
  ['15:36', '191746210', '15:36:09'], ['15:40', '191746204', '15:39:45'], ['15:44', '191747316', '15:43:57'],
  ['15:48', '191747309', '15:48:09'], ['15:52', '191747303', '15:51:45'], ['15:56', '191747296', '15:55:57']
];
const LASCO_C2 = [
  ['14:36', '191745312', '14:36:22'], ['14:40', '191745312', '14:36:22'], ['14:44', '191745311', '14:48:33'],
  ['14:48', '191745311', '14:48:33'], ['14:52', '191745311', '14:48:33'], ['14:56', '191745908', '15:00:23'],
  ['15:00', '191745908', '15:00:23'], ['15:04', '191745908', '15:00:23'], ['15:08', '191745907', '15:12:33'],
  ['15:12', '191745907', '15:12:33'], ['15:16', '191745907', '15:12:33'], ['15:20', '191745906', '15:24:23'],
  ['15:24', '191745906', '15:24:23'], ['15:28', '191745906', '15:24:23'], ['15:32', '191745905', '15:36:33'],
  ['15:36', '191745905', '15:36:33'], ['15:40', '191745905', '15:36:33'], ['15:44', '191745968', '15:48:23'],
  ['15:48', '191745968', '15:48:23'], ['15:52', '191745968', '15:48:23'], ['15:56', '191746532', '16:00:34']
];
const answersOf = rows => rows.map(([, id, obs]) => ({ id, date: DAY + ' ' + obs }));

// The M1.0 itself, as SWPC lists it.
const M10 = { begin: at('15:04'), peak: at('15:18'), end: at('15:27') };

/* ---- The checks -------------------------------------------------------- */

const results = [];
const ok = (name, detail) => results.push({ name, pass: true, detail });
const bad = (name, detail) => results.push({ name, pass: false, detail });
const hhmm = t => new Date(t).toISOString().slice(11, 16);

function checkRaster(targetsOf) {
  const asked = targetsOf(filmWindowForFlare(M10)).times.map(hhmm);
  const measured = LASCO_C2.map(r => r[0]);
  if (asked.join() !== measured.join()) {
    return bad('raster', 'the M1.0 window asks for ' + asked.slice(0, 3).join(', ') +
      '…, not the 21 moments that were measured (' + measured.slice(0, 3).join(', ') + '…)');
  }
  const six = filmWindowAround(Date.parse('2026-09-13T09:07:30Z'));
  const a = targetsOf(six);
  const b = targetsOf({ ...six, from: six.from + 60e3, to: six.to + 60e3 });
  if (a.stepMs !== 15 * 60e3 || a.times.length !== 24) {
    return bad('raster', 'six hours gave ' + a.times.length + ' moments ' + a.stepMs / 60e3 + ' min apart');
  }
  if (a.times.some(t => t % a.stepMs !== 0 || t <= six.from || t > six.to)) {
    return bad('raster', 'a moment lies off the UTC raster or outside its window');
  }
  const shared = a.times.filter(t => b.times.includes(t)).length;
  if (shared < a.times.length - 1) {
    return bad('raster', 'two windows a minute apart share ' + shared + ' of ' + a.times.length + ' moments');
  }
  for (let minutes = 1; minutes <= 48 * 60; minutes += 7) {
    const n = targetsOf({ from: 0, to: minutes * 60e3 }).times.length;
    if (n > FILM_MAX_FRAMES) return bad('raster', minutes + ' minutes asked for ' + n + ' moments');
  }
  ok('raster', 'the M1.0 window asks for exactly the 21 measured moments; six hours give 24 on the quarter hour, ' +
    shared + ' of them shared with a window a minute later');
}

function checkFlareWindow(windowOf) {
  const whole = windowOf(M10);
  if (whole.from !== at('14:34') || whole.to !== at('15:57')) {
    return bad('flare window', 'the M1.0 runs ' + hhmm(whole.from) + '–' + hhmm(whole.to) + ' instead of 14:34–15:57');
  }
  const open = windowOf({ ...M10, end: null });
  const bare = windowOf({ ...M10, end: null, peak: null });
  if (open.to !== at('15:48')) return bad('flare window', 'a flare without an end does not run to its peak');
  if (bare.to !== at('15:34')) return bad('flare window', 'a flare without a peak does not run to its begin');
  ok('flare window', 'half an hour either side: 14:34–15:57 for the M1.0; without an end to its peak, without a peak to its begin');
}

function checkNewest(fit) {
  const clock = Date.parse('2026-09-13T16:13:00Z');
  const newest = Date.parse('2026-09-13T12:00:33Z');     // LASCO C2 that day: 253 min behind
  const around = fit(filmWindowAround(clock), newest);
  if (around.to !== newest || around.to - around.from !== 6 * 3600e3) {
    return bad('newest', 'six hours around now run to ' + new Date(around.to).toISOString() +
      ' while the newest picture is from 12:00:33');
  }
  if (filmTargets(around).times.some(t => t > newest)) return bad('newest', 'moments are asked for after the newest picture');
  const past = filmWindowAround(Date.parse('2026-09-12T10:00:00Z'));
  const kept = fit(past, newest);
  if (kept.from !== past.from || kept.to !== past.to) return bad('newest', 'a window in the past was moved');
  const flare = fit(filmWindowForFlare({ begin: newest - 20 * 60e3, peak: newest - 10 * 60e3, end: newest + 10 * 60e3 }), newest);
  if (flare.from !== newest - 50 * 60e3 || flare.to !== newest) return bad('newest', 'a flare window was moved rather than cut');
  ok('newest', 'around now the six hours end on the newest picture, 253 min behind the clock; a flare window is cut, a past one left alone');
}

function checkDedupe(unique) {
  const lasco = unique(answersOf(LASCO_C2));
  const aia = unique(answersOf(AIA_171));
  if (lasco.frames.length !== 8) return bad('dedupe', '21 LASCO C2 answers became ' + lasco.frames.length + ' frames instead of 8');
  if (aia.frames.length !== 21) return bad('dedupe', '21 AIA 171 answers became ' + aia.frames.length + ' frames instead of 21');
  if (lasco.frames.some((f, i) => i && f.time <= lasco.frames[i - 1].time)) return bad('dedupe', 'the frames are not in the order taken');
  const every = filmEveryMs(lasco.frames) / 60e3;
  ok('dedupe', '21 lookups give 8 LASCO C2 frames, every ' + every.toFixed(1) + ' min, and 21 of AIA 171');
}

function checkFailed(unique) {
  const answers = answersOf(AIA_171.slice(0, 5));
  answers.splice(2, 1, null);
  answers.push(null);
  const u = unique(answers);
  if (u.failed !== 2 || u.frames.length !== 4) {
    return bad('failed', 'two lookups without an answer gave ' + u.failed + ' failures and ' + u.frames.length + ' frames');
  }
  if (Math.round(filmCostMb(18)) !== 7) return bad('failed', 'eighteen frames do not cost about 7 MB');
  ok('failed', 'two lookups without an answer count as two failures, and nothing stands in for them');
}

/* Nine lookups and four renders at once, against a server that takes 20 ms per
   answer and writes down how many of each kind it is serving at the same time. */
async function checkLanes(make) {
  const active = { lookup: 0, render: 0 };
  const most = { lookup: 0, render: 0 };
  const server = async target => {
    const kind = /endpoint=takeScreenshot/.test(target) ? 'render' : 'lookup';
    active[kind]++;
    most[kind] = Math.max(most[kind], active[kind]);
    await new Promise(r => setTimeout(r, 20));
    active[kind]--;
    return { ok: true, status: 200, json: async () => ({ id: '1', date: DAY + ' 15:00:00' }), blob: async () => ({ size: 1 }) };
  };
  const api = make({ fetch: server, gapMs: 1 });
  const lookups = Array.from({ length: 9 }, (_, i) => api.closestImage(4, new Date(at('15:00') + i * 60e3)));
  const renders = Array.from({ length: 4 }, () => api.screenshot({ sourceId: 4, date: DAY + ' 15:00:00', imageScale: '11.9', x0: '0', y0: '0', px: 64 }));
  await Promise.all([...lookups, ...renders]);
  if (most.lookup !== 3) return bad('lanes', 'lookups ran ' + most.lookup + ' at a time instead of 3');
  if (most.render !== 1) return bad('lanes', 'renders ran ' + most.render + ' at a time instead of 1');
  if (api.stats().done !== 13) return bad('lanes', 'the counter says ' + api.stats().done + ' requests where 13 were made');
  ok('lanes', 'nine lookups run three abreast while four renders take their turn one at a time, and all 13 are counted');
}

/* ---- The control implementations --------------------------------------- */

// The raster counted from the window's own start instead of from 1970.
const anchoredTargets = win => {
  const stepMs = Math.max(1, Math.ceil((win.to - win.from) / FILM_MAX_FRAMES / 60000)) * 60000;
  const times = [];
  for (let t = win.from + stepMs; t <= win.to; t += stepMs) times.push(t);
  return { stepMs, times };
};
// Every answer a frame, as if every lookup had found a picture of its own.
const everyAnswer = answers => ({
  frames: answers.filter(Boolean).map(a => ({ id: String(a.id), time: Date.parse(a.date.replace(' ', 'T') + 'Z') })),
  failed: 0, duplicates: 0
});
// Failures dropped before counting.
const failuresDropped = answers => filmUnique(answers.filter(Boolean));

/* ---- Running ----------------------------------------------------------- */

checkRaster(filmTargets);
checkFlareWindow(filmWindowForFlare);
checkNewest(filmFitToNewest);
checkDedupe(filmUnique);
checkFailed(filmUnique);
await checkLanes(createSunFetch);

for (const r of results) {
  console.log((r.pass ? '  ok    ' : '  FAIL  ') + r.name.padEnd(14) + r.detail);
}
let failed = results.filter(r => !r.pass).length;

const breaks = [
  ['a raster counted from the window', () => checkRaster(anchoredTargets)],
  ['a flare window without margins', () => checkFlareWindow(f => filmWindowForFlare(f, 0))],
  ['a window left past the newest picture', () => checkNewest(win => win)],
  ['every answer its own frame', () => checkDedupe(everyAnswer)],
  ['failures dropped before counting', () => checkFailed(failuresDropped)],
  ['lookups on the render queue', () => checkLanes(o => createSunFetch({ ...o, lookupWidth: 1 }))],
  ['a lookup lane without a limit', () => checkLanes(o => createSunFetch({ ...o, lookupWidth: 99 }))]
];

if (process.argv.includes('--selftest')) {
  console.log('\n  --selftest: every check below has to FAIL');
  for (const [name, runIt] of breaks) {
    const before = results.length;
    await runIt();
    const caught = results.length > before && results.slice(before).every(r => !r.pass);
    console.log((caught ? '  ok    ' : '  FAIL  ') + ('break: ' + name).padEnd(46) + (caught ? 'caught' : 'SLIPPED THROUGH'));
    if (!caught) failed++;
    results.length = before;
  }
}

if (failed) {
  console.log('\n' + failed + ' failed');
  process.exit(1);
}
console.log('\nall green (' + results.length + ' checks' +
  (process.argv.includes('--selftest') ? ' plus ' + breaks.length + ' breaks' : '') + ')');
