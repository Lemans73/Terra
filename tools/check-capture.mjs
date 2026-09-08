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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = join(ROOT, 'js/core/capture.js');

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
  exportSize: (ratio, longEdge) => ({
    frameW: longEdge, frameH: longEdge, frames: ratio.frames,
    width: longEdge * ratio.frames + 1, height: longEdge
  }),
  /* The caption spread across the three frames of a set. It reads well while
     swiping and leaves two of the three files unattributed the moment one is
     taken out of the row, so it has to stay caught. */
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

  const onSpread = cap.selftest({ captionSlots: BROKEN.captionSlots });
  if (onSpread.length > 0) say('ok', 'a caption spread across the set is caught (' + onSpread.length + ' complaints)');
  else { say('fail', 'a spread caption passes — a lone frame would carry no credit'); failed++; }

  const keys = cap.RATIOS.map((r) => r.key);
  if (new Set(keys).size === keys.length) say('ok', 'every ratio key is unique');
  else { say('fail', 'duplicate ratio key', keys.join(', ')); failed++; }

  const sets = cap.RATIOS.filter((r) => r.frames > 1);
  if (!sets.length) say('na', 'no sets in the catalogue');
  else if (sets.every((r) => r.frames === 3 && r.note)) say('ok', sets.length + ' sets, all of three frames and labelled');
  else { say('fail', 'a set is not three frames, or carries no note'); failed++; }

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
