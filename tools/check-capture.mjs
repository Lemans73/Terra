/* check-capture.mjs — does the export frame still hold its promises?
 *
 *   node tools/check-capture.mjs
 *   node tools/check-capture.mjs --selftest
 *
 * WHY THIS EXISTS.
 * The export frame makes one promise: what the frame shows is what the file
 * holds. Break it and nothing crashes — you get a picture, just not the one
 * you framed. That is the kind of fault that survives every review and is only
 * noticed by whoever posts the result.
 *
 * FOUR CHECKS, and the last two are checks on the checks. `selftest()` in
 * js/core/capture.js takes its implementations as an argument precisely so a
 * deliberately broken one can be handed in: a suite that reports "ok" on a
 * frame that fills the whole viewport was never testing anything.
 *
 *   1  the module loads
 *   2  selftest() is empty                break: change a ratio to 5:1 by hand
 *   3  a broken frameRect must be caught  break: make it return the viewport
 *   4  a broken exportSize must be caught break: add a pixel to the wide render
 *
 * Run:  node tools/check-capture.mjs            (exit 0 = green)
 *       node tools/check-capture.mjs --selftest (every break must show)
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = join(ROOT, 'js/core/capture.js');
const CSS = join(ROOT, 'css/app.css');

/* THE PHONE WINDOW IS THE PHONE LAYOUT. capture.js decides the phone offer
   with two numbers; css/app.css gives the app its phone layout with two media
   queries. Move one without the other and a window gets the phone layout
   with the desktop offer, or the other way round. */
function phoneQueriesMatch(css, phone) {
  const bad = [];
  for (const q of ['@media (max-width: ' + phone.maxWidth + 'px)', '@media (max-height: ' + phone.maxHeight + 'px)']) {
    if (!css.includes(q)) bad.push('css/app.css has no ' + q);
  }
  return bad;
}

const wantSelftest = process.argv.includes('--selftest');

function say(outcome, text, extra) {
  const mark = outcome === 'ok' ? '  ok   ' : outcome === 'na' ? '  n/a  ' : '  FAIL ';
  console.log(mark + ' ' + text);
  if (extra) for (const line of [].concat(extra)) console.log('        ' + line);
}

/* The broken implementations live here and not in the module: they exist to
   make the suite fail, so they must not be something the app can reach. */
const BROKEN = {
  frameRect: (aspect, viewW, viewH) => ({ x: 0, y: 0, w: viewW, h: viewH }),
  exportSize: (ratio, longEdge, frames) => ({
    frameW: longEdge, frameH: longEdge, frames: frames || 1,
    width: longEdge * (frames || 1) + 1, height: longEdge
  }),
  /* Frame counts that skip a step: a control offering 1 and 3 but not 2 has
     no honest reading, and the arithmetic behind it is wrong somewhere. */
  availableFrames: () => [1, 3],
  /* The caption spread across the three frames of a set. It reads well while
     swiping and leaves two of the three files unattributed the moment one is
     taken out of the row, so it has to stay caught. */
  /* No filter at all: every window is offered every format, which is what the
     rule existed to prevent. */
  availableRatios: (viewW, viewH, all) => (all || []).slice(),
  captionSlots: (parts, frames) => (frames < 3
    ? [{ brand: true, title: parts.title, credit: parts.credit }]
    : [{ brand: true, title: '', credit: '' },
       { brand: false, title: parts.title, credit: '' },
       { brand: false, title: '', credit: parts.credit }])
};

async function run() {
  let failed = 0;

  let cap;
  try {
    cap = await import(pathToFileURL(MODULE).href);
    say('ok', 'the module loads');
  } catch (err) {
    say('fail', 'the module loads', String(err.message || err));
    return 1;
  }

  const real = cap.selftest();
  if (real.length === 0) say('ok', 'selftest() is empty (' + cap.RATIOS.length + ' ratios)');
  else { say('fail', 'selftest() reports ' + real.length + ' problem(s)', real); failed++; }

  const onBrokenFrame = cap.selftest({ frameRect: BROKEN.frameRect });
  if (onBrokenFrame.length > 0) say('ok', 'a broken frameRect is caught (' + onBrokenFrame.length + ' complaints)');
  else { say('fail', 'a broken frameRect passes — the suite tests nothing'); failed++; }

  const onBrokenSize = cap.selftest({ exportSize: BROKEN.exportSize });
  if (onBrokenSize.length > 0) say('ok', 'a broken exportSize is caught (' + onBrokenSize.length + ' complaints)');
  else { say('fail', 'a broken exportSize passes — the suite tests nothing'); failed++; }

  const onEveryFormat = cap.selftest({
    availableRatios: (w, h, all) => (all || cap.RATIOS).slice()
  });
  if (onEveryFormat.length > 0) say('ok', 'an unfiltered format list is caught (' + onEveryFormat.length + ' complaints)');
  else { say('fail', 'every window offered every format and nothing complained'); failed++; }

  const onGap = cap.selftest({ availableFrames: BROKEN.availableFrames });
  if (onGap.length > 0) say('ok', 'a gap in the frame counts is caught (' + onGap.length + ' complaints)');
  else { say('fail', 'frame counts 1 and 3 without 2 passed'); failed++; }

  const onSpread = cap.selftest({ captionSlots: BROKEN.captionSlots });
  if (onSpread.length > 0) say('ok', 'a caption spread across the set is caught (' + onSpread.length + ' complaints)');
  else { say('fail', 'a spread caption passes — a lone frame would carry no credit'); failed++; }

  const keys = cap.RATIOS.map((r) => r.key);
  if (new Set(keys).size === keys.length) say('ok', 'every ratio key is unique');
  else { say('fail', 'duplicate ratio key', keys.join(', ')); failed++; }

  /* THE CATALOGUE MUST NOT CARRY FRAME COUNTS. Format and frame count are two
     controls; the moment a row like '1:1 x3' appears in this list they are one
     again, and the list starts growing by the product of two choices. */
  const carriers = cap.RATIOS.filter((r) => 'frames' in r || /[x×]\s*[23]\s*$/.test(r.label));
  if (!carriers.length) say('ok', 'the catalogue holds formats only, no frame counts');
  else { say('fail', 'a format row carries a frame count', carriers.map((r) => r.key)); failed++; }

  const desk = cap.availableFrames(cap.ratioByKey('1x1'), 1440, 900);
  const phone = cap.availableFrames(cap.ratioByKey('1x1'), 390, 844);
  say(desk.length === 3 && phone.length === 1 ? 'ok' : 'fail',
      'a laptop offers ' + desk.join('/') + ' frames of 1:1, a phone offers ' + phone.join('/'));
  if (!(desk.length === 3 && phone.length === 1)) failed++;

  const queries = phoneQueriesMatch(readFileSync(CSS, 'utf8'), cap.PHONE_WINDOW);
  if (!queries.length) say('ok', 'the phone window is the phone layout (' + cap.PHONE_WINDOW.maxWidth + ' wide, ' + cap.PHONE_WINDOW.maxHeight + ' high)');
  else { say('fail', 'the phone window and the phone layout have drifted apart', queries); failed++; }

  return failed;
}

/* The check on this file. Each break must make run() come back non-zero;
   a break that stays invisible means the check above is decorative. */
async function proveItCanFail() {
  const cap = await import(pathToFileURL(MODULE).href);
  const breaks = [
    ['a frame that fills the viewport', () => cap.selftest({ frameRect: BROKEN.frameRect }).length > 0],
    ['a wide render one pixel too wide', () => cap.selftest({ exportSize: BROKEN.exportSize }).length > 0],
    ['a caption spread across three frames', () => cap.selftest({ captionSlots: BROKEN.captionSlots }).length > 0],
    ['frame counts that skip a step', () => cap.selftest({ availableFrames: BROKEN.availableFrames }).length > 0],
    ['an upright window offered a row of three', () => cap.selftest({
      availableFrames: () => [1, 2, 3]
    }).length > 0],
    ['every window offered every format', () => cap.selftest({
      availableRatios: (w, h, all) => (all || cap.RATIOS).slice()
    }).length > 0],
    ['a phone stripped of its portrait formats', () => cap.selftest({
      availableRatios: (w, h, all) => (all || cap.RATIOS).filter((r) => r.aspect === null)
    }).length > 0],
    ['a frame that loses the wordmark', () => cap.selftest({
      captionSlots: (p, n) => Array.from({ length: n }, (_, i) => ({ brand: i === 0, title: p.title, credit: p.credit }))
    }).length > 0],
    ['a frame of the wrong aspect', () => cap.selftest({
      frameRect: (a, w, h) => { const r = cap.frameRect(a, w, h); return { ...r, w: r.w * 1.1 }; }
    }).length > 0],
    ['a frame that is not centred', () => cap.selftest({
      frameRect: (a, w, h) => { const r = cap.frameRect(a, w, h); return { ...r, x: r.x + 7 }; }
    }).length > 0],
    ['a frame smaller than it could be', () => cap.selftest({
      frameRect: (a, w, h) => { const r = cap.frameRect(a, w, h); return { x: r.x, y: r.y, w: r.w * 0.5, h: r.h * 0.5 }; }
    }).length > 0],
    /* The read-back. A render that is not a whole number of strips high is
       every render, so the short strip at the top must not be dropped. */
    ['the short strip at the top dropped', () => cap.selftest({
      readbackStrips: (h, s) => cap.readbackStrips(h, s).filter((x) => x.rows === s)
    }).length > 0],
    ['strips that are not turned over', () => cap.selftest({
      flipRows: (src, dst) => { dst.set(src); return dst; }
    }).length > 0],
    ['strips stacked from the top instead of mirrored', () => cap.selftest({
      readbackStrips: (h, s) => cap.readbackStrips(h, s).map((x) => ({ ...x, canvasY: x.glY }))
    }).length > 0],
    /* Window in CSS pixels is what it used to be: 390×844 on a phone whose
       screen holds 1170×2532. */
    ['Window saved in CSS pixels', () => cap.selftest({
      planSize: (ratio, edge, n, view, pr, max) => cap.planSize(ratio, edge, n, view, 1, max)
    }).length > 0],
    ['a phone window given the desktop size', () => cap.selftest({
      planSize: (ratio, edge, n, view, pr, max) => cap.planSize(ratio, edge, n, { w: 1920, h: 1080 }, pr, max)
    }).length > 0],
    ['a phone window offered Large', () => cap.selftest({
      availableSizes: () => ['large', 'standard']
    }).length > 0],
    ['a row on a phone that skips the budget', () => cap.selftest({
      planSize: (ratio, edge, n, view, pr, max) => n > 1
        ? cap.planSize(ratio, edge, n, { w: 1920, h: 1080 }, pr, max)
        : cap.planSize(ratio, edge, n, view, pr, max)
    }).length > 0],
    ['the phone layout moved to 700 px and the offer stayed', () => phoneQueriesMatch(
      readFileSync(CSS, 'utf8').split('@media (max-width: 640px)').join('@media (max-width: 700px)'), cap.PHONE_WINDOW
    ).length > 0],
    ['Window rounded up instead of down', () => cap.selftest({
      planSize: (ratio, edge, n, view, pr, max) => {
        const s = cap.planSize(ratio, edge, n, view, pr, max);
        if (ratio.aspect !== null) return s;
        const w = Math.ceil(view.w * pr), h = Math.ceil(view.h * pr);
        return { ...s, size: { ...s.size, frameW: w, frameH: h, width: w, height: h } };
      }
    }).length > 0]
  ];

  let missed = 0;
  for (const [name, caught] of breaks) {
    if (caught()) console.log('  ok    break seen: ' + name);
    else { console.log('  FAIL  break NOT seen: ' + name); missed++; }
  }
  return missed;
}

if (wantSelftest) {
  console.log('selftest — every break must show\n');
  const missed = await proveItCanFail();
  console.log(missed ? '\n' + missed + ' break(s) went unnoticed' : '\nall breaks seen');
  process.exit(missed ? 1 : 0);
} else {
  const failed = await run();
  process.exit(failed ? 1 : 0);
}
