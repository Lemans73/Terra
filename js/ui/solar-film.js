/* ============================================================
   TERRA — Sun · the film, finding its frames and fetching them
   ------------------------------------------------------------
   The flipbook's controller, in two explicit steps. Looking up finds
   out which frames a film would have — cheap JSON, one lookup per
   moment — and what fetching them would cost. Fetching renders every
   frame on someone else's server and holds it as a texture, so it waits
   for a button of its own.

   ONE LOOKUP AT "NOW" COMES FIRST, for the newest picture the source
   has. A lookup at the window's end is a different question: inside a
   gap in the data it answers with a picture from before the gap, and
   the film would move back for no reason. LASCO C2 had such a gap on
   2026-09-13, from 09:48 to 10:36.

   THEN EVERY MOMENT, AND LATER EVERY FRAME, AS WIDE AS ITS LANE
   (js/layers/sun/fetch.js): three at a time, in order, so the strip
   fills from the left. A worker asks for the next one only when its
   last one came back, so a film that is stopped or cleared halfway
   leaves no row of requests to run out for nobody.

   ONE CROP FOR THE WHOLE FILM, fixed by its first fetch: the frame on
   screen at that moment (js/layers/sun/film.js, filmCrop). Frames
   fetched after a stop are rendered with the same numbers.

   A FRAME IS UPLOADED THE MOMENT IT ARRIVES (the sun state's
   frameTexture), so a film that plays swaps a texture and never waits
   on an upload. At most 24 × 640² × 4 B = 39 MB.

   STOPPING KEEPS WHAT ARRIVED; CLEARING KEEPS NOTHING, and neither does
   a new film, another source in the bottom slot, or leaving the state.
   A frame that lands after its film was cleared is disposed on arrival,
   so the textures held are always the frames of the film on the strip.

   THE SOURCE IS THE PANEL'S BOTTOM SLOT: a film is one source, and that
   is the layer the disc comes from.
   ============================================================ */

import {
  filmWindowAround, filmWindowForFlare, filmFitToNewest, filmTargets,
  filmUnique, filmEveryMs, filmCostMb, filmObservedMs, filmTextureMb
} from '../layers/sun/film.js';

const blank = () => ({
  phase: 'idle',            // idle · lookup · ready · fetching · loaded · error
  sourceId: 0, source: null,
  window: null, stepMs: 0, targets: [],
  done: 0, failed: 0, frames: [],
  newest: null, everyMs: null,
  reason: null, lookupMs: null,
  crop: null,               // fixed by the film's first fetch
  pass: null                // what the last fetch came to
});

/* Items in their order, up to `width` at a time, for as long as `live()` holds.
   A worker takes the next item only when its last one came back. */
async function filmInTurn(items, width, live, each) {
  let next = 0;
  const worker = async () => {
    while (next < items.length && live()) {
      const i = next++;
      await each(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, width || 1) }, worker));
}

export function createSolarFilm(deps) {
  const api = deps.api || null;
  const sourceOf = deps.sourceOf || (() => 0);
  const nameOf = deps.nameOf || (id => 'source ' + id);
  const clock = deps.now || (() => Date.now());
  /* The sun state's half of a frame: the crop the view asks for, and a texture
     made from a picture (js/states/sun.js, frameCrop and frameTexture). */
  const cropFor = deps.cropFor || null;
  const makeTexture = deps.makeTexture || null;

  let S = blank();
  let run = 0;              // a new film or a clear: what belongs to the old one stops
  let turn = 0;             // a fetch or a stop: the fetch before it takes no next frame
  let fetching = false;
  let reference = null;     // the getClosestImage answer the crop is derived from
  const held = new Map();   // image id → { texture, bytes }
  const lost = new Set();   // image ids whose frame did not come through
  const flying = new Set(); // image ids whose frame is on its way
  const listeners = new Set();
  const notify = () => {
    for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } }
  };

  async function ask(sourceId, t) {
    try { return await api.closestImage(sourceId, new Date(t)); } catch { return null; }
  }

  /* Every texture of the film is given back, and nothing on its way is counted. */
  function release() {
    for (const { texture } of held.values()) texture.dispose();
    held.clear();
    lost.clear();
    flying.clear();
    fetching = false;
    reference = null;
  }

  /* Once a film has frames, its phase follows from what is held. */
  function settle() {
    if (S.phase === 'ready' || S.phase === 'fetching' || S.phase === 'loaded') {
      S = { ...S, phase: fetching ? 'fetching' : (held.size ? 'loaded' : 'ready') };
    }
    notify();
  }

  /**
   * Look up the frames of a film: of `flare` when the moment stands on one,
   * otherwise of six hours around `cursor`. Resolves with the state it ended in.
   */
  async function lookUp({ cursor, flare }) {
    const mine = ++run;
    turn++;
    release();
    const sourceId = sourceOf();
    if (!api || !sourceId) {
      S = { ...blank(), phase: 'error', reason: 'Choose a source first' };
      notify();
      return S;
    }
    const started = performance.now();
    const source = nameOf(sourceId);
    let win = flare ? filmWindowForFlare(flare) : filmWindowAround(cursor);
    S = { ...blank(), phase: 'lookup', sourceId, source, window: win };
    notify();

    const newestAnswer = await ask(sourceId, clock());
    if (mine !== run) return S;
    const newest = newestAnswer && newestAnswer.date ? filmObservedMs(newestAnswer.date) : null;
    win = filmFitToNewest(win, newest);
    const { stepMs, times } = filmTargets(win);
    S = { ...S, window: win, stepMs, targets: times, newest };
    notify();

    if (!times.length) {
      S = { ...S, phase: 'error', reason: 'No ' + source + ' pictures yet' };
      notify();
      return S;
    }

    const answers = new Array(times.length);
    await filmInTurn(times, api.lookupWidth, () => mine === run, async (t, i) => {
      const answer = await ask(sourceId, t);
      if (mine !== run) return;
      answers[i] = answer;
      const partial = filmUnique(answers.filter(a => a !== undefined));
      S = { ...S, done: S.done + 1, failed: partial.failed, frames: partial.frames };
      notify();
    });
    if (mine !== run) return S;

    const found = filmUnique(answers);
    reference = found.frames.length
      ? answers.find(a => a && String(a.id) === found.frames[0].id)
      : null;
    S = {
      ...S,
      phase: found.frames.length ? 'ready' : 'error',
      frames: found.frames,
      failed: found.failed,
      everyMs: filmEveryMs(found.frames),
      reason: found.frames.length ? null : 'No pictures found',
      lookupMs: Math.round(performance.now() - started)
    };
    notify();
    return S;
  }

  /**
   * Fetch the frames that are not held yet, as wide as the frame lane. Resolves
   * when this fetch has nothing left on its way.
   */
  async function fetchFrames() {
    if (!(S.phase === 'ready' || S.phase === 'loaded')) return S;
    if (!api || !cropFor || !makeTexture || !reference) return S;
    const wanted = S.frames.filter(f => !held.has(f.id) && !flying.has(f.id));
    if (!wanted.length) return S;

    const mine = run, myTurn = ++turn;
    const { sourceId } = S;
    if (!S.crop) S = { ...S, crop: cropFor(sourceId, reference) };
    const crop = S.crop;
    const started = performance.now();
    let got = 0, missed = 0, bytes = 0;
    fetching = true;
    settle();

    await filmInTurn(wanted, api.frameWidth, () => mine === run && myTurn === turn, async frame => {
      flying.add(frame.id);
      lost.delete(frame.id);
      let blob = null, texture = null;
      try {
        blob = await api.filmFrame({
          sourceId, date: frame.date,
          imageScale: crop.imageScale, x0: crop.x0, y0: crop.y0, px: crop.px
        });
        if (mine === run) texture = await makeTexture(blob);
      } catch { /* counted below, as a frame that did not come through */ }
      // Cleared or replaced while it was on its way: nothing of it may stay.
      if (mine !== run) {
        if (texture) texture.dispose();
        return;
      }
      flying.delete(frame.id);
      if (texture) {
        held.set(frame.id, { texture, bytes: blob.size || 0 });
        bytes += blob.size || 0;
        got++;
      } else {
        lost.add(frame.id);
        missed++;
      }
      settle();
    });

    if (mine !== run) return S;
    if (myTurn === turn) fetching = false;
    /* A fetch that was stopped still reports once its last frames landed, unless
       a newer fetch has taken over by then. */
    if (!fetching && !(S.pass && S.pass.turn > myTurn)) {
      S = {
        ...S,
        pass: {
          turn: myTurn, asked: wanted.length, got, failed: missed, bytes,
          stopped: myTurn !== turn, ms: Math.round(performance.now() - started)
        }
      };
    }
    settle();
    return S;
  }

  /* Stop fetching. What arrived stays, and so do the frames still on their way. */
  function stop() {
    if (!fetching) return;
    turn++;
    fetching = false;
    settle();
  }

  function clear() {
    run++;
    turn++;
    release();
    if (S.phase === 'idle') return;
    S = blank();
    notify();
  }

  /* The bottom slot got another source, and a film is of one source. */
  function sourceChanged() {
    if (S.phase !== 'idle' && sourceOf() !== S.sourceId) clear();
  }

  /* What the film holds, and what fetching the rest would cost: the estimate per
     frame gives way to the frames' own average as soon as one is in. */
  function totals() {
    let bytes = 0;
    for (const h of held.values()) bytes += h.bytes;
    const missing = S.frames.length - held.size;
    return {
      held: held.size,
      bytes,
      missing,
      lost: lost.size,
      costMb: filmCostMb(missing, held.size ? bytes / held.size / 1e6 : undefined),
      textureMb: S.crop ? filmTextureMb(held.size, S.crop.px) : 0
    };
  }

  return {
    lookUp,
    fetchFrames,
    stop,
    clear,
    sourceChanged,
    /* What the film holds, as copies: a reader cannot change it by accident, and
       the textures themselves stay in here. */
    state: () => ({
      ...S,
      ...totals(),
      window: S.window ? { ...S.window } : null,
      targets: S.targets.slice(),
      crop: S.crop ? { ...S.crop, centre: { ...S.crop.centre } } : null,
      pass: S.pass ? { ...S.pass } : null,
      frames: S.frames.map(f => ({
        ...f,
        fetched: held.has(f.id),
        lost: lost.has(f.id),
        bytes: held.has(f.id) ? held.get(f.id).bytes : 0
      }))
    }),
    onUpdate(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
}
