/* ============================================================
   TERRA — Sun · the film, and finding its frames
   ------------------------------------------------------------
   The flipbook's controller. This part finds out which frames a film
   would have — cheap JSON, one lookup per moment — and what fetching
   them would cost. Fetching the frames is a separate, explicit step,
   because every frame is a render on someone else's server.

   ONE LOOKUP AT "NOW" COMES FIRST, for the newest picture the source
   has. A lookup at the window's end is a different question: inside a
   gap in the data it answers with a picture from before the gap, and
   the film would move back for no reason. LASCO C2 had such a gap on
   2026-09-13, from 09:48 to 10:36.

   THEN EVERY MOMENT, THROUGH THE QUEUE (js/layers/sun/fetch.js), one
   after the other. A film that is cleared halfway stops asking, rather
   than leaving a row of requests to run out for nobody.

   THE SOURCE IS THE PANEL'S BOTTOM SLOT: a film is one source, and that
   is the layer the disc comes from.
   ============================================================ */

import {
  filmWindowAround, filmWindowForFlare, filmFitToNewest, filmTargets,
  filmUnique, filmEveryMs, filmCostMb, filmObservedMs
} from '../layers/sun/film.js';

const blank = () => ({
  phase: 'idle',            // idle · lookup · ready · error
  sourceId: 0, source: null,
  window: null, stepMs: 0, targets: [],
  done: 0, failed: 0, frames: [],
  newest: null, everyMs: null, costMb: 0,
  reason: null, lookupMs: null
});

export function createSolarFilm(deps) {
  const api = deps.api || null;
  const sourceOf = deps.sourceOf || (() => 0);
  const nameOf = deps.nameOf || (id => 'source ' + id);
  const clock = deps.now || (() => Date.now());

  let S = blank();
  let run = 0;
  const listeners = new Set();
  const notify = () => {
    for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } }
  };

  async function ask(sourceId, t) {
    try { return await api.closestImage(sourceId, new Date(t)); } catch { return null; }
  }

  /**
   * Look up the frames of a film: of `flare` when the moment stands on one,
   * otherwise of six hours around `cursor`. Resolves with the state it ended in.
   */
  async function lookUp({ cursor, flare }) {
    const mine = ++run;
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

    const answers = [];
    for (const t of times) {
      answers.push(await ask(sourceId, t));
      if (mine !== run) return S;
      const partial = filmUnique(answers);
      S = { ...S, done: answers.length, failed: partial.failed, frames: partial.frames };
      notify();
    }

    const found = filmUnique(answers);
    S = {
      ...S,
      phase: found.frames.length ? 'ready' : 'error',
      frames: found.frames,
      failed: found.failed,
      everyMs: filmEveryMs(found.frames),
      costMb: filmCostMb(found.frames.length),
      reason: found.frames.length ? null : 'No pictures found',
      lookupMs: Math.round(performance.now() - started)
    };
    notify();
    return S;
  }

  function clear() {
    run++;
    if (S.phase === 'idle') return;
    S = blank();
    notify();
  }

  return {
    lookUp,
    clear,
    /* What the film holds, as copies: a reader cannot change it by accident. */
    state: () => ({
      ...S,
      window: S.window ? { ...S.window } : null,
      targets: S.targets.slice(),
      frames: S.frames.map(f => ({ ...f }))
    }),
    onUpdate(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
}
