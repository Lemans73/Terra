/* ============================================================
   TERRA — Sun · which frames a film is made of
   ------------------------------------------------------------
   The flipbook shows one source over a stretch of time, frame by
   frame. Before a single picture is fetched, four things are decided
   here, pure and testable in node: the stretch, the moments asked for,
   which of the answers are really different pictures, and the crop
   every frame is rendered with.

   THE STRETCH FOLLOWS WHAT IS BEING LOOKED AT. On a flare's peak it is
   that flare, from half an hour before it began to half an hour after
   it ended; anywhere else it is twelve hours around the moment, six
   before and six after. Twelve hours around a flare of thirteen minutes
   would be mostly quiet sun.

   THE MOMENTS SIT ON A UTC RASTER, in whole minutes. Two visitors
   looking at the same stretch ask for the same moments, get the same
   image ids back, and ask for the same frames: takeScreenshot is cached
   at the edge for a day and requested at the observation time.

   THE ANSWERS ARE DEDUPLICATED ON IMAGE ID. getClosestImage answers
   with the nearest picture, and a source slower than the raster answers
   with the same one several times. Measured on 2026-09-13 for the 83
   minutes around the M1.0 of 5 September, one lookup every 4 minutes:
   21 pictures of AIA 171, and 8 of LASCO C2.

   ONE CROP SERVES THE WHOLE FILM: the frame on screen when its first
   frame is fetched. Every frame is rendered with the same imageScale,
   x0 and y0, so each lies exactly over the one before.

   PREFIXED NAMES, because tools/build-standalone.mjs pours modules into
   one script, and a bare `targets` or `unique` is exactly the kind of
   name another module has too.
   ============================================================ */

import { textureSize } from './source.js';
import { imageScaleFor } from './fetch.js';

/* At most this many moments per film. Plan 52 settled on 24 frames at 8 fps:
   three seconds, enough to see a flare rise and decay. */
export const FILM_MAX_FRAMES = 24;

/* Twelve hours around a moment, six before and six after: with 24 frames, a frame
   every half hour. */
export const FILM_SPAN_MS = 12 * 3600e3;
export const FILM_FLARE_MARGIN_MS = 30 * 60e3;

/* What one frame costs to download, in MB. Measured at 640 px in session 52:
   AIA 171 386 KB, LASCO C3 311 KB. It is an estimate, and the row says so. */
export const FILM_MB_PER_FRAME = 0.4;

/* A frame is at most this many pixels square, which keeps a whole film at
   24 × 640² × 4 B = 39 MB of texture. */
export const FILM_FRAME_PX = 640;

/* Where the plane's round fade begins, as a fraction of the field: the
   `uEdge * 0.86` in js/layers/sun/shader.js. A crop that puts the corners of the
   screen inside it shows the whole screen unfaded. */
export const FILM_FADE_START = 0.86;

/** Twelve hours around a moment: six before it and six after. */
export function filmWindowAround(t, spanMs = FILM_SPAN_MS) {
  return { kind: 'around', from: t - spanMs / 2, to: t + spanMs / 2, shiftedMs: 0, cutMs: 0 };
}

/**
 * A flare with half an hour on either side. A flare without an end yet runs to
 * its peak, and one without either to its begin.
 */
export function filmWindowForFlare(f, marginMs = FILM_FLARE_MARGIN_MS) {
  const last = f.end != null ? f.end : (f.peak != null ? f.peak : f.begin);
  return { kind: 'flare', from: f.begin - marginMs, to: last + marginMs, shiftedMs: 0, cutMs: 0 };
}

/**
 * A window held against the newest picture the source has.
 *
 * Around a moment the window keeps its length and moves back until it ends on
 * that picture, so "now" means the latest twelve hours that exist. Around a flare
 * the end is cut instead: moving back would fill the film with the quiet before
 * the flare. A window that ends before the newest picture stays as it is.
 */
export function filmFitToNewest(win, newest) {
  if (newest == null || !(win.to > newest)) return win;
  const over = win.to - newest;
  if (win.kind === 'flare') return { ...win, to: newest, cutMs: over };
  return { ...win, from: win.from - over, to: newest, shiftedMs: over };
}

/**
 * The moments to ask for: at most `max`, a whole number of minutes apart, on the
 * multiples of that step since 1970, and inside (from, to].
 */
export function filmTargets(win, max = FILM_MAX_FRAMES) {
  const span = win.to - win.from;
  if (!(span > 0)) return { stepMs: 0, times: [] };
  const stepMs = Math.max(1, Math.ceil(span / max / 60000)) * 60000;
  const times = [];
  for (let t = Math.floor(win.from / stepMs) * stepMs + stepMs; t <= win.to; t += stepMs) {
    times.push(t);
  }
  return { stepMs, times };
}

/** "2026-09-05 15:12:33", the way Helioviewer writes it, as UTC milliseconds. */
export const filmObservedMs = date =>
  Date.parse(String(date).trim().replace(' ', 'T').replace(/Z?$/, 'Z'));

/**
 * The pictures behind a list of answers: one per image id, in the order they
 * were taken. An answer that never came is counted as failed, not guessed.
 *
 * @param {(object|null)[]} answers  getClosestImage responses, null for a failure
 */
export function filmUnique(answers) {
  const seen = new Map();
  let failed = 0;
  for (const a of answers) {
    if (!a || a.id == null || !a.date) { failed++; continue; }
    const id = String(a.id);
    if (!seen.has(id)) seen.set(id, { id, time: filmObservedMs(a.date), date: a.date });
  }
  const frames = [...seen.values()]
    .filter(f => Number.isFinite(f.time))
    .sort((p, q) => p.time - q.time);
  return { frames, failed, duplicates: answers.length - failed - frames.length };
}

/**
 * How far apart the frames are on average. That is the film's own pace, and the
 * instrument's only where the raster is finer than the instrument: AIA 171
 * publishes every 36 seconds, and looked up every 15 minutes it reads as every
 * 15 minutes.
 */
export function filmEveryMs(frames) {
  return frames.length > 1
    ? (frames[frames.length - 1].time - frames[0].time) / (frames.length - 1)
    : null;
}

export const filmCostMb = (count, mbPerFrame = FILM_MB_PER_FRAME) => count * mbPerFrame;

/**
 * The crop every frame of a film is rendered with.
 *
 * The frame on screen, square, with its corners inside the fade. A frame that
 * reaches as far as the instrument does gets the instrument's whole field about
 * the sun instead, the way a still is fetched on a first look: past that there
 * is nothing to render. Never inside `minField`, which for a coronagraph is the
 * occulter with room to spare.
 *
 * @param {object} view  centre {x, y} and half-extents {w, h}, in solar radii
 * @param {object} geom  nativeField, rsun and radiusArcsec, from deriveGeometry
 * @param {number} minField  minimumField(sourceId)
 * @returns {{field, centre, px, imageScale, x0, y0}}  the last three as the
 *   request carries them, so every frame asks with the same strings
 */
export function filmCrop(view, geom, minField, maxPx = FILM_FRAME_PX) {
  let field = Math.max(Math.hypot(view.half.w, view.half.h) / FILM_FADE_START, minField);
  let centre = { x: view.centre.x, y: view.centre.y };
  if (field >= geom.nativeField) {
    field = geom.nativeField;
    centre = { x: 0, y: 0 };
  }
  const px = textureSize(field, geom.rsun, maxPx);
  return {
    field, centre, px,
    imageScale: imageScaleFor(field, px, geom.radiusArcsec).toFixed(6),
    x0: (centre.x * geom.radiusArcsec).toFixed(2),
    y0: (centre.y * geom.radiusArcsec).toFixed(2)
  };
}

/* What frames weigh as textures, in MB: four bytes a texel, no mipmaps. */
export const filmTextureMb = (count, px) => count * px * px * 4 / 1e6;

/* The speeds a film plays at, in frames per second, and the one it starts at.
   Every frame plays for the same time, however far apart the pictures were
   taken. */
export const FILM_FPS = [4, 8, 16];
export const FILM_FPS_DEFAULT = 8;

/* The longest a single browser frame may count for, in seconds. After a switch
   of tabs the first frame can arrive seconds late, and a film that jumped that
   far ahead would read as a skip. */
const FILM_DT_MAX_S = 0.1;

/**
 * Where a playing film stands after one browser frame. `position` counts frames
 * and keeps its fraction: at 60 Hz and 8 fps a step is 0.13 of a frame, and a
 * position read back as a whole number would never move. It runs round at both
 * ends.
 */
export function filmStep(position, count, direction, fps, dtMs) {
  if (!(count > 0)) return 0;
  const dt = Math.min(FILM_DT_MAX_S, Math.max(0, dtMs) / 1000);
  const next = position + direction * fps * dt;
  return ((next % count) + count) % count;
}
