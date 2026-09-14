/* ============================================================
   check-helioviewer-retry.mjs — 429 and 503, from Helioviewer to the screen
   ------------------------------------------------------------
   A 429 (too many requests) and a 503 (unavailable for a moment) say
   that the same request works later. Terra passes them on, retries
   once after the wait Helioviewer asked for, holds a film's lane while
   it waits, and only when that retry fails too says why, in words,
   where the visitor looks. Every step can break without an error: a
   proxy that turns both into a 502 leaves the retry dead code, and a
   lane that keeps asking loses most of a film.

     1  the policy passes 429 and 503 with a whole-second wait, and turns
        anything else into a 502
     2  the edge function answers with that status and wait, and no-store
     3  the local server answers a failure with the same mapping
     4  a 429 holds the frame lane for the wait it names, and the retry
        comes through
     5  a 503 without a wait is retried once, a second later
     6  the words: busy for a 429, unavailable for a 503, unreachable for
        the rest
     7  a film whose frames fail keeps the reason and tells it on, and a
        new film first says there is nothing to tell

   The line at the top that shows the reason is checked in
   tools/check-sun-orientation.mjs (case 7).

   `--selftest` breaks each step in its own file and demands that its
   check fails. A check that passes on a broken input is not a check.
   ============================================================ */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const POLICY = 'api/_helioviewer-policy.mjs';
const EDGE = 'api/helioviewer.js';
const LOCAL = 'serve.mjs';
const FETCH = 'js/layers/sun/fetch.js';
const FILM = 'js/ui/solar-film.js';
const selftest = process.argv.includes('--selftest');

const BUSY = 'Helioviewer is busy · try again in a minute';

const results = [];
const ok = (name, detail) => results.push({ name, pass: true, detail });
const bad = (name, detail) => results.push({ name, pass: false, detail });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const fromDisk = rel => readFile(join(ROOT, rel), 'utf8');

/* A fresh copy of a module, so a break written to disk is what gets imported. */
const importFresh = rel => import(pathToFileURL(join(ROOT, rel)).href + '?t=' + process.hrtime.bigint());

/* An answer as the client reads it from fetch(). */
const answer = (status, retryAfter = null) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: h => (h.toLowerCase() === 'retry-after' ? retryAfter : null) },
  json: async () => ({ id: '1', date: '2026-09-12 12:00:00' }),
  blob: async () => ({ size: 1 })
});

/* ---- The checks --------------------------------------------------------- */

async function checkPolicy() {
  const { upstreamFailure } = await importFresh(POLICY);
  const cases = [
    [429, '2', 429, '2'],
    [503, null, 503, null],
    [500, '5', 502, null],
    [404, null, 502, null],
    [429, 'Wed, 21 Oct 2026 07:28:00 GMT', 429, null],
    [503, '99999', 503, null]
  ];
  const wrong = [];
  for (const [status, wait, wantStatus, wantWait] of cases) {
    const got = upstreamFailure(status, wait);
    if (got.status !== wantStatus || got.retryAfter !== wantWait) {
      wrong.push(status + ' with ' + JSON.stringify(wait) + ' gave ' + got.status + ' with ' + JSON.stringify(got.retryAfter));
    }
  }
  if (wrong.length) return bad('policy', wrong.join('; '));
  ok('policy', '429 and 503 pass with a whole-second wait; anything else becomes a 502');
}

async function checkEdge() {
  const { default: handler } = await importFresh(EDGE);
  const url = 'https://terra.example/api/helioviewer?endpoint=getClosestImage&date=2026-09-12T12:00:00Z&sourceId=10';
  const wrong = [];
  for (const [status, wait, wantStatus, wantWait] of [[429, '3', 429, '3'], [503, null, 503, null], [500, '3', 502, null]]) {
    globalThis.fetch = async () => new Response('no', { status, headers: wait ? { 'retry-after': wait } : {} });
    const res = await handler(new Request(url));
    const got = [res.status, res.headers.get('retry-after'), res.headers.get('cache-control')];
    if (got[0] !== wantStatus || got[1] !== wantWait || got[2] !== 'no-store') {
      wrong.push(status + ' reached the browser as ' + JSON.stringify(got));
    }
  }
  if (wrong.length) return bad('edge', wrong.join('; '));
  ok('edge', "Helioviewer's 429 and 503 reach the browser with their wait and no-store; a 500 becomes a 502");
}

/* The local server starts listening when it is imported, so its route is read:
   the branch that handles Helioviewer's error, without line comments. */
async function checkLocal(read) {
  const src = await read(LOCAL);
  const start = src.indexOf('async function helioviewerHandler');
  const end = src.indexOf('\ncreateServer(', start);
  if (start < 0 || end < 0) return bad('local server', 'helioviewerHandler not found in ' + LOCAL);
  const route = src.slice(start, end).replace(/^\s*\/\/.*$/gm, '');
  const at = route.indexOf('if (!upstream.ok)');
  const branch = at < 0 ? '' : route.slice(at, route.indexOf('res.end(', at));
  const wrong = [];
  if (!/upstreamFailure\(\s*upstream\.status/.test(branch)) wrong.push("the failure does not go through the policy's mapping");
  if (!/writeHead\(\s*failure\.status/.test(branch)) wrong.push("the answer does not carry the policy's status");
  if (!/Retry-After/.test(branch)) wrong.push("Helioviewer's wait is dropped");
  if (wrong.length) return bad('local server', wrong.join('; '));
  ok('local server', "answers a failure with the policy's status and wait, like the edge function");
}

/* Five film frames in a lane three wide. The very first answer is a 429 asking
   for a second; every other answer is an image after 20 ms. Frames four and five
   may not leave before that second is over. */
async function checkLanePause(load) {
  const { createSunFetch } = await load();
  const t0 = Date.now();
  const starts = [];
  let calls = 0;
  const server = async target => {
    const n = ++calls;
    starts.push({ frame: new URL('https://terra.example' + target).searchParams.get('x0'), at: Date.now() - t0 });
    await sleep(20);
    return n === 1 ? answer(429, '1') : answer(200);
  };
  const api = createSunFetch({ fetch: server, gapMs: 1, frameWidth: 3 });
  const frame = x0 => api.filmFrame({ sourceId: 10, date: '2026-09-12 12:00:00', imageScale: '4.0', x0, y0: '0', px: 640 });
  const settled = await Promise.allSettled(['1', '2', '3', '4', '5'].map(frame));
  const failed = settled.filter(s => s.status === 'rejected').length;
  const late = starts.filter(s => s.frame === '4' || s.frame === '5');
  const retry = starts.filter(s => s.frame === '1')[1];
  if (failed || calls !== 6) return bad('lane pause', failed + ' frames failed and ' + calls + ' requests were made, instead of 0 and 6');
  if (late.some(s => s.at < 950)) {
    return bad('lane pause', 'frames four and five left at ' + late.map(s => s.at + ' ms').join(' and ') + ', inside the wait');
  }
  if (!retry || retry.at < 950) return bad('lane pause', 'the retry left at ' + (retry ? retry.at + ' ms' : 'no time') + ', inside the wait');
  ok('lane pause', 'a 429 asking for 1 s held the lane: the retry left at ' + retry.at + ' ms, the next frames at ' +
    late.map(s => s.at).join(' and ') + ' ms');
}

async function checkRetryWait(load) {
  const { createSunFetch } = await load();
  const t0 = Date.now();
  const at = [];
  const server = async () => { at.push(Date.now() - t0); return at.length === 1 ? answer(503) : answer(200); };
  const api = createSunFetch({ fetch: server, gapMs: 1 });
  let outcome = 'resolved';
  try { await api.closestImage(10, new Date('2026-09-12T12:00:00Z')); } catch (e) { outcome = 'rejected with ' + e.status; }
  if (outcome !== 'resolved' || at.length !== 2) {
    return bad('retry wait', 'a 503 and then a 200 ended ' + outcome + ' after ' + at.length + ' requests');
  }
  const gap = at[1] - at[0];
  if (gap < 950 || gap > 1500) return bad('retry wait', 'a 503 without a wait was retried after ' + gap + ' ms instead of about 1000');
  ok('retry wait', 'a 503 without a wait was retried once, ' + gap + ' ms later');
}

async function checkWords(load) {
  const { troubleText } = await load();
  const pairs = [
    [troubleText({ status: 429 }), BUSY],
    [troubleText({ status: 503 }), 'Helioviewer is unavailable for a moment'],
    [troubleText({ status: 502 }), 'Could not reach Helioviewer'],
    [troubleText(new TypeError('Failed to fetch')), 'Could not reach Helioviewer']
  ];
  const wrong = pairs.filter(([got, want]) => got !== want).map(([got, want]) => JSON.stringify(got) + ' where ' + JSON.stringify(want));
  if (wrong.length) return bad('words', wrong.join('; '));
  ok('words', 'busy for a 429, unavailable for a 503, unreachable for the rest');
}

/* A film of AIA 171 whose lookups answer and whose frames all come back 429. */
async function checkFilm(load) {
  const { createSolarFilm } = await load();
  const told = [];
  const quarter = 900e3;
  const busy = Object.assign(new Error('helioviewer 429'), { status: 429 });
  const film = createSolarFilm({
    api: {
      lookupWidth: 3, frameWidth: 3,
      closestImage: async (id, date) => {
        const t = Math.floor(date.getTime() / quarter) * quarter;
        return { id: String(t), date: new Date(t).toISOString().slice(0, 19).replace('T', ' ') };
      },
      filmFrame: async () => { throw busy; }
    },
    sourceOf: () => 10,
    nameOf: () => 'AIA 171',
    now: () => Date.parse('2026-09-13T00:00:00Z'),
    cropFor: () => ({ field: 1.3, centre: { x: 0, y: 0 }, px: 640, imageScale: '4.0', x0: '0.00', y0: '0.00' }),
    makeTexture: async () => ({ dispose() {} }),
    showFrame() {}, hideFrame() {},
    requestFrame: () => 0, cancelFrame() {}, frameClock: () => 0,
    onTrouble: text => told.push(text)
  });
  await film.lookUp({ cursor: Date.parse('2026-09-12T12:00:00Z'), flare: null });
  const looked = film.state();
  await film.fetchFrames();
  const f = film.state();
  if (looked.phase !== 'ready' || !looked.frames.length) return bad('film', 'the lookup ended ' + looked.phase + ' with ' + looked.frames.length + ' frames');
  if (told[0] !== null) return bad('film', 'a new film did not first clear the line: ' + JSON.stringify(told[0]));
  if (!f.pass || f.pass.failed !== looked.frames.length) {
    return bad('film', (f.pass ? f.pass.failed : 'no') + ' failed frames where ' + looked.frames.length + ' were asked');
  }
  if (f.pass.trouble !== BUSY || told[told.length - 1] !== BUSY) {
    return bad('film', 'the pass says ' + JSON.stringify(f.pass.trouble) + ' and the line was told ' + JSON.stringify(told[told.length - 1]));
  }
  ok('film', looked.frames.length + ' frames came back 429: the pass says why, the line is told, and it was cleared first');
}

/* ---- Breaks ------------------------------------------------------------- */

/* One file edited in place and put back, whatever happens. An edit that finds
   nothing to change throws, so a break cannot pass by breaking nothing. */
async function withEdit(rel, from, to, run) {
  const path = join(ROOT, rel);
  const original = await readFile(path, 'utf8');
  if (!original.includes(from)) throw new Error('"' + from.trim() + '" is not in ' + rel);
  await writeFile(path, original.replace(from, to));
  try { await run(); } finally { await writeFile(path, original); }
}

/* ---- Running ------------------------------------------------------------ */

const fetchModule = () => importFresh(FETCH);
const filmModule = () => importFresh(FILM);
const ignorePolicy = "({ status: 502, retryAfter: null, error: 'upstream error ' + upstream.status })";

await checkPolicy();
await checkEdge();
await checkLocal(fromDisk);
await checkLanePause(fetchModule);
await checkRetryWait(fetchModule);
await checkWords(fetchModule);
await checkFilm(filmModule);

for (const r of results) {
  console.log((r.pass ? '  ok    ' : '  FAIL  ') + r.name.padEnd(14) + r.detail);
}
let failed = results.filter(r => !r.pass).length;

if (selftest) {
  console.log('\n  --selftest: every check below has to FAIL');
  const breaks = [
    ['a policy that turns a 429 into a 502',
      () => withEdit(POLICY, 'const later = RETRY_LATER.has(status);', 'const later = false;', checkPolicy)],
    ['an edge function that skips the policy',
      () => withEdit(EDGE, "upstreamFailure(upstream.status, upstream.headers.get('retry-after'))", ignorePolicy, checkEdge)],
    ['a local server that skips the policy',
      () => withEdit(LOCAL, "upstreamFailure(upstream.status, upstream.headers.get('retry-after'))", ignorePolicy,
        () => checkLocal(fromDisk))],
    ['a 429 that does not hold the lane',
      () => withEdit(FETCH, '        if (e.status === 429 && lane.pause) lane.pause(wait);\n', '', () => checkLanePause(fetchModule))],
    ['a retry on a fixed 900 ms',
      () => withEdit(FETCH, 'const wait = retryWaitMs(e.retryAfter);', 'const wait = 900;', () => checkRetryWait(fetchModule))],
    ['a 429 called unreachable',
      () => withEdit(FETCH, 'if (status === 429) return', 'if (status === 4290) return', () => checkWords(fetchModule))],
    ['a film that forgets why',
      () => withEdit(FILM, '        if (!firstFailure) firstFailure = err;\n', '', () => checkFilm(filmModule))]
  ];
  for (const [name, run] of breaks) {
    const before = results.length;
    let caught = false;
    try {
      await run();
      caught = results.length > before && results.slice(before).every(r => !r.pass);
    } catch (e) {
      console.log('  FAIL  break: ' + name + ' could not be applied: ' + e.message);
    }
    console.log((caught ? '  ok    ' : '  FAIL  ') + ('break: ' + name).padEnd(46) +
      (caught ? 'caught' : 'SLIPPED THROUGH'));
    if (!caught) failed++;
    results.length = before;
  }
}

if (failed) {
  console.log('\n' + failed + ' failed');
  process.exit(1);
}
console.log('\nall green (' + results.length + ' checks' + (selftest ? ' plus 7 breaks' : '') + ')');
