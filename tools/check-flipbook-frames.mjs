/* ============================================================
   check-flipbook-frames.mjs — which frames a film is made of, what
   holding them costs, and how they play
   ------------------------------------------------------------
   js/layers/sun/film.js decides, before any picture is fetched, the
   stretch a film covers, the moments it asks Helioviewer for, which
   answers are different pictures, and the crop every frame is rendered
   with. js/ui/solar-film.js looks the frames up, fetches them, holds
   them as textures and plays them. Each of those can be quietly wrong
   and still produce a film that plays.

     1  the moments sit on a UTC raster, a quarter of an hour apart around a
        moment whatever its stretch: windows a minute apart share them
     2  a flare's window runs from an hour before to an hour after
     3  a window never runs past the newest picture the source has
     4  the answers are deduplicated on image id, in the order taken
     5  a lookup that failed is counted, not guessed
     6  lookups and film frames run three abreast, stills one at a time
     7  the crop is the frame on screen, with its corners inside the fade
     8  a film asks three at a time, every frame once and with one crop,
        and holds one texture per frame
     9  clearing, a new film and another source give every texture back;
        a stop keeps what arrived, and a frame that lands after a clear
        goes straight back
    10  a playing film moves at its speed on the browser's own frame time,
        runs round at both ends, and a late browser frame cannot skip it
    11  playing shows the frames that are in, in order and with one crop;
        a pause hands back the frame on screen; clearing takes that frame
        off the screen before a single texture is given back
    12  the plane fades against the sphere by the distance from the sun's
        centre, so a film cropped off centre keeps its limb
    13  one button walks a film from looking up to playing: a playing film
        pauses before anything else, a film with frames out fetches the rest

   THE FIXTURE IS REAL: getClosestImage through Terra's proxy on
   2026-09-13, for the 83 minutes around the M1.0 of 5 September, one
   lookup every 4 minutes. AIA 171 answered with 21 pictures, LASCO C2
   with 8. That was a film with half an hour on either side and at most
   24 frames, so the raster check asks with those two numbers to meet the
   measured moments. The fake Helioviewer below answers every moment with
   the picture nearest to it, the way getClosestImage does. The geometries
   are deriveGeometry's on the same day.

   `--selftest` breaks each check on purpose and demands that it fails.
   A check that passes on a broken input is not a check.
   ============================================================ */

import { readFileSync } from 'node:fs';
import {
  filmWindowAround, filmWindowForFlare, filmFitToNewest, filmTargets,
  filmUnique, filmEveryMs, filmCostMb, filmCrop, filmTextureMb, filmStep,
  FILM_MAX_FRAMES, FILM_FRAME_PX, FILM_FADE_START, FILM_FPS_DEFAULT
} from '../js/layers/sun/film.js';
import { createSunFetch } from '../js/layers/sun/fetch.js';
import { SOURCES, minimumField } from '../js/layers/sun/source.js';
import { createSolarFilm } from '../js/ui/solar-film.js';
import { filmNextStep } from '../js/ui/solar-time.js';

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

/* deriveGeometry for both sources, from getClosestImage at 10:48 UTC on
   2026-09-13. */
const AIA_ID = SOURCES.find(s => s.name === 'AIA 171').id;
const C2_ID = SOURCES.find(s => s.name === 'LASCO C2').id;
const AIA_GEOM = { nativeField: 1.288276844307512, rsun: 1589.3323, radiusArcsec: 959.6448419414534 };
const C2_GEOM = { nativeField: 6.404823038543459, rsun: 80.64235294117648, radiusArcsec: 959.644 };

/* The view at rest on a window of 1.248 : 1 (VIEW_R 1.65), and one zoomed in on
   a region north-west of the centre. In solar radii. */
const RESTING = { centre: { x: 0, y: 0 }, half: { w: 2.0591, h: 1.65 } };
const REGION = { centre: { x: 0.42, y: 0.31 }, half: { w: 0.5, h: 0.4 } };

const SHADER_SRC = readFileSync(new URL('../js/layers/sun/shader.js', import.meta.url), 'utf8');

/* ---- The checks -------------------------------------------------------- */

const results = [];
const ok = (name, detail) => results.push({ name, pass: true, detail });
const bad = (name, detail) => results.push({ name, pass: false, detail });
const hhmm = t => new Date(t).toISOString().slice(11, 16);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HZ60 = 1000 / 60;

function checkRaster(targetsOf) {
  // The film the fixture was measured for: half an hour on either side, at most 24 frames.
  const asked = targetsOf(filmWindowForFlare(M10, 30 * 60e3), 24).times.map(hhmm);
  const measured = LASCO_C2.map(r => r[0]);
  if (asked.join() !== measured.join()) {
    return bad('raster', 'the measured M1.0 window asks for ' + asked.slice(0, 3).join(', ') +
      '…, not the 21 moments that were measured (' + measured.slice(0, 3).join(', ') + '…)');
  }
  const moment = Date.parse('2026-09-13T09:07:30Z');
  const twelve = filmWindowAround(moment);
  const a = targetsOf(twelve);
  const s = targetsOf(filmWindowAround(moment, 6 * 3600e3));
  const b = targetsOf({ ...twelve, from: twelve.from + 60e3, to: twelve.to + 60e3 });
  if (a.stepMs !== 15 * 60e3 || a.times.length !== 48) {
    return bad('raster', 'twelve hours gave ' + a.times.length + ' moments ' + a.stepMs / 60e3 +
      ' min apart, not 48 a quarter of an hour apart');
  }
  if (s.stepMs !== 15 * 60e3 || s.times.length !== 24) {
    return bad('raster', 'six hours gave ' + s.times.length + ' moments ' + s.stepMs / 60e3 +
      ' min apart, not 24 a quarter of an hour apart');
  }
  if (a.times.some(t => t % a.stepMs !== 0 || t <= twelve.from || t > twelve.to)) {
    return bad('raster', 'a moment lies off the UTC raster or outside its window');
  }
  const shared = a.times.filter(t => b.times.includes(t)).length;
  if (shared < a.times.length - 1) {
    return bad('raster', 'two windows a minute apart share ' + shared + ' of ' + a.times.length + ' moments');
  }
  const flare = targetsOf(filmWindowForFlare(M10));
  if (flare.stepMs !== 3 * 60e3 || flare.times.length !== 48) {
    return bad('raster', 'the M1.0 with an hour either side gave ' + flare.times.length + ' moments ' +
      flare.stepMs / 60e3 + ' min apart, not 48 three minutes apart');
  }
  for (let minutes = 1; minutes <= 48 * 60; minutes += 7) {
    const n = targetsOf({ kind: 'flare', from: 0, to: minutes * 60e3 }).times.length;
    if (n > FILM_MAX_FRAMES) return bad('raster', minutes + ' minutes asked for ' + n + ' moments');
  }
  ok('raster', 'the measured M1.0 window asks for exactly the 21 measured moments; twelve hours give 48 and six ' +
    'hours 24, both on the quarter hour, ' + shared + ' of 48 shared with a window a minute later; the M1.0 with ' +
    'an hour either side gives 48 moments three minutes apart');
}

function checkFlareWindow(windowOf) {
  const whole = windowOf(M10);
  if (whole.from !== at('14:04') || whole.to !== at('16:27')) {
    return bad('flare window', 'the M1.0 runs ' + hhmm(whole.from) + '–' + hhmm(whole.to) + ' instead of 14:04–16:27');
  }
  const open = windowOf({ ...M10, end: null });
  const bare = windowOf({ ...M10, end: null, peak: null });
  if (open.to !== at('16:18')) return bad('flare window', 'a flare without an end does not run to an hour past its peak');
  if (bare.to !== at('16:04')) return bad('flare window', 'a flare without a peak does not run to an hour past its begin');
  ok('flare window', 'an hour either side: 14:04–16:27 for the M1.0; without an end an hour past its peak, without a ' +
    'peak an hour past its begin');
}

function checkNewest(fit, windowAround = filmWindowAround) {
  const clock = Date.parse('2026-09-13T16:13:00Z');
  const newest = Date.parse('2026-09-13T12:00:33Z');     // LASCO C2 that day: 253 min behind
  const plain = windowAround(clock);
  if (plain.from !== clock - 6 * 3600e3 || plain.to !== clock + 6 * 3600e3) {
    return bad('newest', 'the window around a moment runs ' + (clock - plain.from) / 3600e3 + ' h before it and ' +
      (plain.to - clock) / 3600e3 + ' h after, not six and six');
  }
  const around = fit(plain, newest);
  if (around.to !== newest || around.to - around.from !== 12 * 3600e3) {
    return bad('newest', 'twelve hours around now run to ' + new Date(around.to).toISOString() +
      ' while the newest picture is from 12:00:33');
  }
  if (filmTargets(around).times.some(t => t > newest)) return bad('newest', 'moments are asked for after the newest picture');
  const past = filmWindowAround(Date.parse('2026-09-12T10:00:00Z'));
  const kept = fit(past, newest);
  if (kept.from !== past.from || kept.to !== past.to) return bad('newest', 'a window in the past was moved');
  const flare = fit(filmWindowForFlare({ begin: newest - 20 * 60e3, peak: newest - 10 * 60e3, end: newest + 10 * 60e3 }), newest);
  if (flare.from !== newest - 80 * 60e3 || flare.to !== newest) return bad('newest', 'a flare window was moved rather than cut');
  ok('newest', 'six hours before a moment and six after; around now the twelve hours end on the newest picture, ' +
    '253 min behind the clock; a flare window is cut, a past one left alone');
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

/* Nine lookups, four stills and seven film frames at once, against a server
   that takes 20 ms per answer and writes down how many of each kind it is
   serving at the same time. */
async function checkLanes(make) {
  const active = { lookup: 0, still: 0, frame: 0 };
  const most = { lookup: 0, still: 0, frame: 0 };
  const server = async target => {
    const kind = !/endpoint=takeScreenshot/.test(target) ? 'lookup' : /width=640\b/.test(target) ? 'frame' : 'still';
    active[kind]++;
    most[kind] = Math.max(most[kind], active[kind]);
    await sleep(20);
    active[kind]--;
    return { ok: true, status: 200, json: async () => ({ id: '1', date: DAY + ' 15:00:00' }), blob: async () => ({ size: 1 }) };
  };
  const api = make({ fetch: server, gapMs: 1 });
  const shot = px => ({ sourceId: 4, date: DAY + ' 15:00:00', imageScale: '11.9', x0: '0', y0: '0', px });
  const lookups = Array.from({ length: 9 }, (_, i) => api.closestImage(4, new Date(at('15:00') + i * 60e3)));
  const stills = Array.from({ length: 4 }, () => api.screenshot(shot(2048)));
  const frames = Array.from({ length: 7 }, () => api.filmFrame(shot(640)));
  await Promise.all([...lookups, ...stills, ...frames]);
  if (most.lookup !== 3) return bad('lanes', 'lookups ran ' + most.lookup + ' at a time instead of 3');
  if (most.frame !== 3) return bad('lanes', 'film frames rendered ' + most.frame + ' at a time instead of 3');
  if (most.still !== 1) return bad('lanes', 'stills rendered ' + most.still + ' at a time instead of 1');
  if (api.stats().done !== 20) return bad('lanes', 'the counter says ' + api.stats().done + ' requests where 20 were made');
  ok('lanes', 'nine lookups and seven film frames run three abreast while four stills take their turn one at a time, and all 20 are counted');
}

function checkCrop(crop) {
  const resting = crop(RESTING, AIA_GEOM, minimumField(AIA_ID));
  if (resting.field !== AIA_GEOM.nativeField || resting.centre.x !== 0 || resting.centre.y !== 0 ||
      resting.px !== FILM_FRAME_PX) {
    return bad('crop', 'the view at rest gets ' + resting.field.toFixed(3) + ' radii about (' + resting.centre.x +
      ', ' + resting.centre.y + ') at ' + resting.px + ' px, not all of AIA 171 at ' + FILM_FRAME_PX);
  }
  const close = crop(REGION, AIA_GEOM, minimumField(AIA_ID));
  if (close.centre.x !== REGION.centre.x || close.centre.y !== REGION.centre.y) {
    return bad('crop', 'zoomed in on a region, the crop stands at (' + close.centre.x + ', ' + close.centre.y +
      ') and not on the view');
  }
  const corner = Math.hypot(REGION.half.w, REGION.half.h);
  if (corner > FILM_FADE_START * close.field + 1e-9) {
    return bad('crop', 'the corners of the screen lie ' + corner.toFixed(3) + ' radii out, and the fade begins at ' +
      (FILM_FADE_START * close.field).toFixed(3));
  }
  if (close.px > FILM_FRAME_PX ||
      close.imageScale !== (2 * close.field * AIA_GEOM.radiusArcsec / close.px).toFixed(6) ||
      close.x0 !== (REGION.centre.x * AIA_GEOM.radiusArcsec).toFixed(2) ||
      close.y0 !== (REGION.centre.y * AIA_GEOM.radiusArcsec).toFixed(2)) {
    return bad('crop', 'the request does not follow from the crop: ' + [close.imageScale, close.x0, close.y0, close.px].join(' '));
  }
  const corona = crop({ centre: { x: 0.1, y: 0 }, half: { w: 0.3, h: 0.25 } }, C2_GEOM, minimumField(C2_ID));
  if (corona.field !== minimumField(C2_ID)) {
    return bad('crop', 'deep inside the occulter of LASCO C2 the crop is ' + corona.field.toFixed(2) +
      ' radii, not ' + minimumField(C2_ID));
  }
  const fade = SHADER_SRC.match(/smoothstep\(uEdge \* ([\d.]+), uEdge \* [\d.]+, r\)/);
  if (!fade || +fade[1] !== FILM_FADE_START) {
    return bad('crop', 'the shader starts its fade at ' + (fade ? fade[1] : 'no match') + ' of the field; film.js counts on ' +
      FILM_FADE_START);
  }
  ok('crop', 'at rest all of AIA 171 at 640 px; on a region ' + close.field.toFixed(3) + ' radii about the view at ' +
    close.imageScale + ' arcsec a pixel, corners inside the fade; LASCO C2 never inside ' + minimumField(C2_ID) + ' radii');
}

/* At 60 Hz, which is the frame time a browser really has: a step is a fraction
   of a frame, and a position that loses that fraction never moves. */
function checkPlayStep(step) {
  let p = 0, moves = 0;
  for (let k = 0; k < 180; k++) {
    const before = Math.floor(p);
    p = step(p, 24, 1, 8, HZ60);
    if (Math.floor(p) !== before) moves++;
  }
  if (moves < 23 || moves > 24) {
    return bad('play step', 'three seconds at 8 fps and 60 Hz moved ' + moves + ' frames instead of 24');
  }
  if (!(p < 0.01 || p > 23.99)) {
    return bad('play step', 'after 24 steps through 24 frames the film stands at ' + p.toFixed(3) + ', not back at the start');
  }
  const back = step(0.05, 24, -1, 8, HZ60);
  if (Math.floor(back) !== 23) {
    return bad('play step', 'backwards past the first frame lands on ' + Math.floor(back) + ' and not on the last');
  }
  let q = 0, fast = 0;
  for (let k = 0; k < 60; k++) {
    const before = Math.floor(q);
    q = step(q, 24, 1, 16, HZ60);
    if (Math.floor(q) !== before) fast++;
  }
  if (fast < 15 || fast > 16) return bad('play step', 'one second at 16 fps moved ' + fast + ' frames instead of 16');
  const late = step(0, 24, 1, 16, 5000);
  if (late > 1.6 + 1e-9) {
    return bad('play step', 'a browser frame five seconds late moved the film ' + late.toFixed(1) + ' frames');
  }
  ok('play step', 'at 60 Hz, 8 fps moves ' + moves + ' frames in three seconds and ends back at the start, 16 fps moves ' +
    fast + ' in one; backwards runs round to the last frame; a browser frame five seconds late counts for a tenth of a second');
}

/* ---- A film against a fake Helioviewer ------------------------------------
   The fixture's AIA 171 answers, frames of 380 KB, textures that count
   themselves, a screen that writes down what was put on it, and a browser
   frame loop that runs when the check says so. Gated, every frame and every
   decode waits until the check lets it through, so a stop or a clear lands
   exactly between two steps instead of wherever a timer puts it. */

function filmRig({ gated = false, texture = t => t, api: wrap = a => a, hide = h => h } = {}) {
  const rig = {
    source: AIA_ID, live: 0, made: 0, crops: 0, requests: [], blobs: [], decodes: [],
    asking: 0, mostAsking: 0, flying: 0, mostFlying: 0,
    events: [], shows: [], pending: null, clock: 0
  };
  const wait = list => (gated ? new Promise(r => list.push(r)) : sleep(2));
  const pictures = AIA_171.map(([, id, obs]) => ({ id, date: DAY + ' ' + obs, time: at(obs.slice(0, 5)) + +obs.slice(6) * 1e3 }));
  const api = wrap({
    lookupWidth: 3,
    frameWidth: 3,
    async closestImage(sourceId, date) {
      rig.asking++;
      rig.mostAsking = Math.max(rig.mostAsking, rig.asking);
      await sleep(2);
      rig.asking--;
      // The newest picture for "now"; for any other moment the picture nearest to it.
      const t = date.getTime();
      if (t >= at('16:30')) return { id: '191748001', date: DAY + ' 16:29:57' };
      const near = pictures.reduce((best, p) => (Math.abs(p.time - t) < Math.abs(best.time - t) ? p : best));
      return { id: near.id, date: near.date };
    },
    async filmFrame(params) {
      rig.requests.push(params);
      rig.flying++;
      rig.mostFlying = Math.max(rig.mostFlying, rig.flying);
      await wait(rig.blobs);
      rig.flying--;
      return { size: 380000 };
    }
  });
  rig.film = createSolarFilm({
    api,
    sourceOf: () => rig.source,
    nameOf: () => 'AIA 171',
    now: () => at('16:30'),
    cropFor: () => { rig.crops++; return filmCrop(REGION, AIA_GEOM, minimumField(AIA_ID)); },
    makeTexture: async () => {
      await wait(rig.decodes);
      rig.live++;
      rig.made++;
      return texture({
        disposed: false,
        dispose() { if (!this.disposed) { this.disposed = true; rig.live--; rig.events.push('dispose'); } }
      });
    },
    showFrame: view => {
      rig.shows.push({ id: view.frame.id, index: view.index, count: view.count,
                       disposed: view.texture.disposed, crop: view.crop });
      rig.events.push('show');
    },
    hideFrame: hide(() => { rig.events.push('hide'); }),
    requestFrame: fn => { rig.pending = fn; return 1; },
    cancelFrame: () => { rig.pending = null; },
    frameClock: () => rig.clock
  });
  /* One browser frame, `dtMs` after the one before. */
  rig.runFrame = dtMs => {
    rig.clock += dtMs;
    const fn = rig.pending;
    rig.pending = null;
    if (fn) fn();
  };
  return rig;
}

/* Everything waiting in one gate goes through, and whatever that sets moving runs. */
async function letThrough(rig, gate) {
  for (const r of rig[gate].splice(0)) r();
  await sleep(0);
}

/* Both gates open until `promise` settles, or until it plainly never will. */
async function drain(rig, promise) {
  let settled = false;
  promise.then(() => { settled = true; }, () => { settled = true; });
  for (let i = 0; !settled && i < 500; i++) {
    await letThrough(rig, 'blobs');
    await letThrough(rig, 'decodes');
  }
}

async function checkFetch(rigOf) {
  const rig = rigOf();
  await rig.film.lookUp({ flare: M10 });
  const found = rig.film.state();
  if (found.phase !== 'ready' || found.frames.length !== 21) {
    return bad('fetch', 'the lookup ended ' + found.phase + ' with ' + found.frames.length + ' frames, not ready with 21');
  }
  if (rig.mostAsking !== 3) return bad('fetch', 'the lookups ran ' + rig.mostAsking + ' at a time instead of 3');
  await rig.film.fetchFrames();
  const s = rig.film.state();
  const crops = new Set(rig.requests.map(p => [p.imageScale, p.x0, p.y0, p.px].join(' ')));
  const dates = new Set(rig.requests.map(p => p.date));
  if (rig.mostFlying !== 3) return bad('fetch', 'the frames were fetched ' + rig.mostFlying + ' at a time instead of 3');
  if (rig.requests.length !== 21 || dates.size !== 21) {
    return bad('fetch', rig.requests.length + ' requests for ' + dates.size + ' different frames, where 21 frames need 21');
  }
  if (crops.size !== 1 || rig.crops !== 1) {
    return bad('fetch', 'the frames were asked with ' + crops.size + ' different crops, taken ' + rig.crops + ' times');
  }
  if (rig.requests.some(p => p.px > FILM_FRAME_PX)) return bad('fetch', 'a frame was asked larger than ' + FILM_FRAME_PX + ' px');
  if (s.phase !== 'loaded' || s.held !== 21 || rig.live !== 21 || s.frames.some(f => !f.fetched)) {
    return bad('fetch', 'after the fetch ' + s.held + ' frames are held and ' + rig.live + ' textures live, in phase ' + s.phase);
  }
  if (s.bytes !== 21 * 380000 || s.missing !== 0 || !s.pass || s.pass.got !== 21) {
    return bad('fetch', 'the film counts ' + s.bytes + ' bytes, ' + s.missing + ' missing and ' +
      (s.pass ? s.pass.got : 'no') + ' fetched');
  }
  const budget = filmTextureMb(FILM_MAX_FRAMES, FILM_FRAME_PX);
  if (Math.abs(budget - 78.6) > 0.05) {
    return bad('fetch', FILM_MAX_FRAMES + ' frames of ' + FILM_FRAME_PX + ' px come to ' + budget.toFixed(1) + ' MB of texture, not 78.6');
  }
  ok('fetch', 'lookups and frames three at a time; 21 frames asked once each with one crop (' + [...crops][0] +
    '), 21 textures held, ' + (s.bytes / 1e6).toFixed(1) + ' MB fetched, ' + s.textureMb.toFixed(1) + ' MB as textures');
}

async function checkRelease(rigOf) {
  let rig = rigOf();
  await rig.film.lookUp({ flare: M10 });
  await rig.film.fetchFrames();
  const before = rig.live;
  rig.film.clear();
  if (before !== 21 || rig.live !== 0) return bad('release', 'clearing a film of ' + before + ' textures left ' + rig.live);

  rig = rigOf();
  await rig.film.lookUp({ flare: M10 });
  await rig.film.fetchFrames();
  await rig.film.lookUp({ flare: M10 });
  if (rig.live !== 0) return bad('release', 'a new film kept ' + rig.live + ' textures of the one before');

  rig = rigOf();
  await rig.film.lookUp({ flare: M10 });
  await rig.film.fetchFrames();
  rig.source = C2_ID;
  rig.film.sourceChanged();
  if (rig.live !== 0 || rig.film.state().phase !== 'idle') {
    return bad('release', 'another source in the bottom slot kept ' + rig.live + ' textures');
  }

  // A stop after three frames: the three on their way still land, nothing after them is asked.
  rig = rigOf({ gated: true });
  await rig.film.lookUp({ flare: M10 });
  const stopped = rig.film.fetchFrames();
  await letThrough(rig, 'blobs');
  await letThrough(rig, 'decodes');
  rig.film.stop();
  await drain(rig, stopped);
  const kept = rig.film.state();
  if (kept.held !== 6 || kept.phase !== 'loaded' || rig.live !== 6 || rig.requests.length !== 6) {
    return bad('release', 'a stop after three frames left ' + kept.held + ' held, ' + rig.live + ' live and ' +
      rig.requests.length + ' asked, in phase ' + kept.phase);
  }
  await drain(rig, rig.film.fetchFrames());
  if (rig.requests.length !== 21 || rig.live !== 21) {
    return bad('release', 'fetching after the stop asked ' + (rig.requests.length - 6) + ' more and holds ' + rig.live);
  }

  // A clear while three pictures are being decoded: they arrive, and go straight back.
  rig = rigOf({ gated: true });
  await rig.film.lookUp({ flare: M10 });
  const cleared = rig.film.fetchFrames();
  await letThrough(rig, 'blobs');
  rig.film.clear();
  await drain(rig, cleared);
  if (rig.made !== 3 || rig.live !== 0) {
    return bad('release', rig.made + ' pictures were decoded after the clear, and ' + rig.live + ' textures stayed');
  }

  ok('release', 'clear, a new film and another source give back all 21 textures; a stop after three kept the six ' +
    'that were on their way, and the next fetch asked for the other 15; three decoded after a clear went straight back');
}

/* The frame taken off the screen before any texture is given back, read from
   the order in which the rig heard about them. */
function hiddenFirst(events) {
  const hideAt = events.indexOf('hide'), disposeAt = events.indexOf('dispose');
  return hideAt >= 0 && disposeAt >= 0 && hideAt < disposeAt;
}

async function checkPlayback(rigOf) {
  let rig = rigOf();
  await rig.film.lookUp({ flare: M10 });
  await rig.film.fetchFrames();
  const film = rig.film;

  film.play(1);
  if (rig.shows.length !== 1 || rig.shows[0].index !== 0) {
    return bad('playback', 'play put ' + rig.shows.length + ' frames on screen, not the first one');
  }
  for (let k = 0; k < 180; k++) rig.runFrame(HZ60);
  const played = rig.shows.length - 1;
  if (played < 23 || played > 24) {
    return bad('playback', 'three seconds at ' + FILM_FPS_DEFAULT + ' fps showed ' + played + ' frames instead of 24');
  }
  if (!rig.shows.every((s, i) => i === 0 || s.index === (rig.shows[i - 1].index + 1) % 21)) {
    return bad('playback', 'the frames did not play in the order they were taken, round at the end');
  }
  if (rig.shows.some(s => s.disposed || s.crop !== rig.shows[0].crop || s.count !== 21)) {
    return bad('playback', 'a frame came on screen with a disposed texture, another crop, or a count other than 21');
  }

  const onScreen = rig.shows[rig.shows.length - 1];
  const paused = film.pause();
  const shownAtPause = rig.shows.length;
  for (let k = 0; k < 60; k++) rig.runFrame(HZ60);
  if (!paused || paused.id !== onScreen.id || rig.shows.length !== shownAtPause || rig.pending) {
    return bad('playback', 'the pause handed back ' + (paused ? paused.id : 'nothing') + ' for ' + onScreen.id +
      ', and ' + (rig.shows.length - shownAtPause) + ' frames came after it');
  }

  film.play(-1);
  for (let k = 0; k < 8; k++) rig.runFrame(HZ60);
  const back = rig.shows[rig.shows.length - 1];
  if (rig.shows.length !== shownAtPause + 1 || back.index !== (onScreen.index + 20) % 21) {
    return bad('playback', 'backwards from frame ' + onScreen.index + ' came ' + back.index + ' instead of ' +
      ((onScreen.index + 20) % 21));
  }

  const speeds = [film.cycleFps(), film.cycleFps(), film.cycleFps()].join(', ');
  if (speeds !== '16, 4, 8') return bad('playback', 'the speed runs 8, ' + speeds + ' instead of 8, 16, 4, 8');

  rig.events.length = 0;
  film.clear();
  if (!hiddenFirst(rig.events) || rig.pending) {
    return bad('playback', 'clearing a playing film went ' + rig.events.slice(0, 3).join(', ') +
      '…: a texture was given back while its frame was on screen');
  }

  rig = rigOf();
  await rig.film.lookUp({ flare: M10 });
  await rig.film.fetchFrames();
  rig.film.play(1);
  rig.events.length = 0;
  await rig.film.lookUp({ flare: M10 });
  if (!hiddenFirst(rig.events)) {
    return bad('playback', 'a new film over a playing one went ' + rig.events.slice(0, 3).join(', ') + '…');
  }

  // A film with six frames in plays those six, and nothing that is not in.
  rig = rigOf({ gated: true });
  await rig.film.lookUp({ flare: M10 });
  const partial = rig.film.fetchFrames();
  await letThrough(rig, 'blobs');
  await letThrough(rig, 'decodes');
  rig.film.stop();
  await drain(rig, partial);
  rig.film.play(1);
  for (let k = 0; k < 120; k++) rig.runFrame(HZ60);
  const ids = new Set(rig.shows.map(s => s.id));
  if (ids.size !== 6 || rig.shows.some(s => s.count !== 6)) {
    return bad('playback', 'a film with 6 frames in showed ' + ids.size + ' different frames');
  }

  ok('playback', 'play shows the first frame and ' + played + ' more in three seconds at 8 fps, in order and with one crop; ' +
    'the pause hands back the frame on screen and nothing follows; backwards goes to the frame before; the speed runs ' +
    '8, 16, 4, 8; six frames in play only those six; a clear or a new film takes the frame off screen before any ' +
    'texture goes');
}

function checkLimb(shader) {
  const m = shader.match(/uHasSphere\s*>\s*0\.5\s*&&\s*(\w+)\s*<\s*1\.0/);
  if (!m) return bad('limb', 'the plane no longer fades against the sphere where it did');
  const def = shader.match(new RegExp('float\\s+' + m[1] + '\\s*=\\s*([^;]+);'));
  if (!def || def[1].replace(/\s+/g, '') !== 'length(obs)') {
    return bad('limb', 'the plane fades against the sphere by ' + m[1] + ' = ' + (def ? def[1].trim() : '?') +
      ', which is not the distance from the sun\'s centre');
  }
  ok('limb', 'the plane fades against the sphere by ' + m[1] + ' = length(obs), the distance from the sun\'s centre, ' +
    'so a film cropped off centre keeps its limb');
}

/* The panel's film button against the states a film goes through. */
function checkNextStep(next) {
  const frames = n => Array.from({ length: n }, (_, i) => ({ id: String(i) }));
  const base = {
    phase: 'idle', source: 'AIA 171', reason: null, targets: frames(24), done: 0, frames: [],
    held: 0, missing: 0, bytes: 0, costMb: 0, textureMb: 0, everyMs: null, playing: 0, fps: 8,
    spanMs: 12 * 3600e3, nextSource: 'AIA 171'
  };
  const cases = [
    ['idle', {}, false, 'lookUp', /^Film around this moment \(AIA 171\)$/],
    ['idle on a peak', {}, true, 'lookUp', /^Film this flare \(AIA 171\)$/],
    ['idle without a source', { nextSource: null }, false, 'lookUp', /^Film around this moment$/],
    ['looking up', { phase: 'lookup', done: 7 }, false, null, /^Looking up 7 of 24…$/],
    ['ready', { phase: 'ready', frames: frames(24), missing: 24, costMb: 9.6 }, false, 'fetch', /^Fetch 24 frames · ≈ 10 MB$/],
    ['fetching while it plays', { phase: 'fetching', frames: frames(24), held: 7, missing: 17, bytes: 2.7e6, playing: 1 },
      false, 'stop', /^Stop · 7 of 24 · 2\.7 MB$/],
    ['playing with frames out', { phase: 'loaded', frames: frames(24), held: 8, missing: 16, playing: 1 }, false, 'pause',
      /^Pause the film$/],
    ['paused with frames out', { phase: 'loaded', frames: frames(24), held: 8, missing: 16, costMb: 7.4 }, false, 'fetch',
      /^Fetch 16 more · ≈ 7 MB$/],
    ['all in, paused', { phase: 'loaded', frames: frames(24), held: 24 }, false, 'play', /^Play the film · 24 frames$/],
    ['all in, playing backwards', { phase: 'loaded', frames: frames(24), held: 24, playing: -1 }, false, 'pause',
      /^Pause the film$/],
    ['an error', { phase: 'error', reason: 'Choose a source first' }, false, 'lookUp', /^Choose a source first$/]
  ];
  for (const [name, over, peak, action, text] of cases) {
    const s = next({ ...base, ...over }, peak);
    if (s.action !== action || !text.test(s.text) || s.pressable !== (action !== null)) {
      return bad('next step', name + ': ' + s.action + ' "' + s.text + '", where ' + action + ' was due');
    }
  }
  ok('next step', cases.length + ' states, each with its own step: a look-up, fetching, stopping, a pause before ' +
    'anything else while it plays, the rest of the frames before playing, and play once all are in');
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
checkCrop(filmCrop);
await checkFetch(() => filmRig());
await checkRelease(o => filmRig(o));
checkPlayStep(filmStep);
await checkPlayback(o => filmRig(o));
checkLimb(SHADER_SRC);
checkNextStep(filmNextStep);

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
  ['a lookup lane one wide', () => checkLanes(o => createSunFetch({ ...o, lookupWidth: 1 }))],
  ['a lookup lane without a limit', () => checkLanes(o => createSunFetch({ ...o, lookupWidth: 99 }))],
  ['a frame lane one wide', () => checkLanes(o => createSunFetch({ ...o, frameWidth: 1 }))],
  ['a frame lane without a limit', () => checkLanes(o => createSunFetch({ ...o, frameWidth: 99 }))],
  ['a crop about the sun, whatever the view', () => checkCrop((v, g, m) => filmCrop({ ...v, centre: { x: 0, y: 0 } }, g, m))],
  ['a crop without room for the fade', () => checkCrop((v, g, m) =>
    filmCrop({ ...v, half: { w: Math.max(v.half.w, v.half.h) * FILM_FADE_START, h: 0 } }, g, m))],
  ['lookups asked one at a time', () => checkFetch(() => filmRig({ api: a => ({ ...a, lookupWidth: 1 }) }))],
  ['every other frame asked with its own crop', () => checkFetch(() => filmRig({
    api: a => {
      let k = 0;
      return { ...a, filmFrame: p => a.filmFrame(k++ % 2 ? p : { ...p, imageScale: (+p.imageScale * 1.001).toFixed(6) }) };
    }
  }))],
  ['textures that are never given back', () => checkRelease(o => filmRig({ ...o, texture: t => ({ ...t, dispose() {} }) }))],
  ['a position rounded to a whole frame every step', () =>
    checkPlayStep((p, n, d, f, dt) => Math.round(filmStep(p, n, d, f, dt)))],
  ['a late browser frame counted in full', () => checkPlayStep((p, n, d, f, dt) => {
    const x = p + d * f * dt / 1000;
    return ((x % n) + n) % n;
  })],
  ['a texture given back before its frame leaves the screen', () =>
    checkPlayback(o => filmRig({ ...o, hide: h => () => queueMicrotask(h) }))],
  ['the limb faded by the distance from the crop', () =>
    checkLimb(SHADER_SRC.replace('uHasSphere > 0.5 && rs < 1.0', 'uHasSphere > 0.5 && r < 1.0'))],
  ['a window of six hours around the moment', () =>
    checkNewest(filmFitToNewest, t => filmWindowAround(t, 6 * 3600e3))],
  ['a flare window with half an hour either side', () =>
    checkFlareWindow(f => filmWindowForFlare(f, 30 * 60e3))],
  ['frames around a moment half an hour apart', () =>
    checkRaster((win, max, minStep) => filmTargets(win, 24, minStep))],
  ['a film button that does not name its layer', () => checkNextStep((f, peak) => {
    const s = filmNextStep(f, peak);
    return f.phase === 'idle' ? { ...s, text: s.text.replace(/ \([^)]*\)$/, '') } : s;
  })],
  ['a playing film offered more frames before a pause', () => checkNextStep((f, peak) =>
    (f.missing && f.phase === 'loaded'
      ? { action: 'fetch', text: 'Fetch ' + f.missing + ' more · ≈ 7 MB', title: '', pressable: true }
      : filmNextStep(f, peak)))],
  ['a finished film that offers nothing to press', () => checkNextStep((f, peak) =>
    (f.phase === 'loaded' && !f.missing && !f.playing
      ? { action: null, text: f.held + ' frames', title: '', pressable: false }
      : filmNextStep(f, peak)))]
];

if (process.argv.includes('--selftest')) {
  console.log('\n  --selftest: every check below has to FAIL');
  for (const [name, runIt] of breaks) {
    const before = results.length;
    await runIt();
    const caught = results.length > before && results.slice(before).every(r => !r.pass);
    console.log((caught ? '  ok    ' : '  FAIL  ') + ('break: ' + name).padEnd(62) + (caught ? 'caught' : 'SLIPPED THROUGH'));
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
