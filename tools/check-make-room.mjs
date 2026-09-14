/* ============================================================
   check-make-room.mjs — on a phone, a film is there to be watched
   ------------------------------------------------------------
   On a narrow screen the flare card and the panel cover the sun and
   the strip with its film buttons. Fetch this moment and Film this
   flare on the card, and the film button in the panel, clear the view
   (clearView in index.html) so the visitor sees what they asked for.
   On a wide screen nothing closes, and Fetch image leaves the panel
   open everywhere: that is where the layers are put together.

     1  both flare card actions clear the view after they act
     2  the panel's film button asks the strip for room
     3  index.html gives the strip clearView as its way to make room
     4  clearView does nothing on a wide screen
     5  Fetch image, in the panel and in the strip, clears nothing

   Read, not run: all of it lives in index.html's module and in a strip
   that needs a canvas.

   `--selftest` breaks each guarantee and demands that its check fails.
   A check that passes on a broken input is not a check.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './check-comment-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = 'index.html';
const TIME = 'js/ui/solar-time.js';
const PANEL = 'js/ui/solar-panel.js';
const selftest = process.argv.includes('--selftest');

const results = [];
const ok = (name, detail) => results.push({ name, pass: true, detail });
const bad = (name, detail) => results.push({ name, pass: false, detail });

const fromDisk = rel => readFileSync(join(ROOT, rel), 'utf8');

/* The text from `head` to its closing brace, or null. */
function block(src, head) {
  const at = src.indexOf(head);
  if (at < 0) return null;
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  return null;
}

/* ---- The checks --------------------------------------------------------- */

function checkCard(read) {
  const fn = block(read(INDEX), 'function flareView(f)');
  if (!fn) return bad('card', 'flareView not found in ' + INDEX);
  const code = stripComments(fn);
  const wrong = [];
  for (const label of ['Fetch this moment', 'Film this flare']) {
    const m = code.match(new RegExp("label:\\s*'" + label + "'[\\s\\S]*?\\n\\s*run:([^\\n]*)"));
    if (!m) wrong.push(label + ' has no action');
    else if (!/\bclearView\(\)/.test(m[1])) wrong.push(label + ' leaves the card and the panel open');
  }
  if (wrong.length) return bad('card', wrong.join('; '));
  ok('card', 'Fetch this moment and Film this flare clear the view after they act');
}

function checkPanelFilm(read) {
  const src = stripComments(read(TIME));
  const handler = block(src, "panelFilm?.addEventListener('click'");
  const wrong = [];
  if (!/const makeRoom = deps\.makeRoom\b/.test(src)) wrong.push('the strip takes no makeRoom');
  if (!handler) wrong.push("the panel's film button has no handler");
  else if (!/\bmakeRoom\(\)/.test(handler)) wrong.push("the panel's film button does not ask for room");
  if (wrong.length) return bad('panel film', wrong.join('; '));
  ok('panel film', "the panel's film button asks for room after it acts");
}

function checkWiring(read) {
  const call = block(read(INDEX), 'createSolarTime({');
  if (!call) return bad('wiring', 'createSolarTime is not called in ' + INDEX);
  if (!/makeRoom:\s*\(\)\s*=>\s*clearView\(\)/.test(stripComments(call))) {
    return bad('wiring', 'index.html does not give the strip clearView to make room with');
  }
  ok('wiring', 'the strip makes room with clearView');
}

function checkWide(read) {
  const fn = block(read(INDEX), 'function clearView()');
  if (!fn) return bad('wide screen', 'clearView not found in ' + INDEX);
  if (!/^function clearView\(\)\s*\{\s*if\s*\(!isNarrow\(\)\)\s*return;/.test(stripComments(fn))) {
    return bad('wide screen', 'clearView does not return first on a wide screen');
  }
  ok('wide screen', 'clearView returns at once on a wide screen');
}

function checkFetchImage(read) {
  const fetchAll = block(stripComments(read(PANEL)), 'async function fetchAll()');
  const rowFetch = stripComments(read(TIME)).split('\n').find(l => l.includes("btnFetch?.addEventListener('click'"));
  const wrong = [];
  if (!fetchAll) wrong.push('fetchAll not found in ' + PANEL);
  else if (/\b(clearView|makeRoom)\(/.test(fetchAll)) wrong.push('Fetch image in the panel clears the view');
  if (!rowFetch) wrong.push("the strip's Fetch button has no handler");
  else if (/\b(clearView|makeRoom)\(/.test(rowFetch)) wrong.push("the strip's Fetch button clears the view");
  if (wrong.length) return bad('fetch image', wrong.join('; '));
  ok('fetch image', 'Fetch image clears nothing, in the panel or in the strip');
}

/* ---- Breaks ------------------------------------------------------------- */

/* A read of the files with one replacement in one of them. A replacement that
   finds nothing throws, so a break cannot pass by breaking nothing. */
function editedRead(file, from, to) {
  return rel => {
    const text = fromDisk(rel);
    if (rel !== file) return text;
    if (!text.includes(from)) throw new Error('"' + from.trim() + '" is not in ' + file);
    return text.replace(from, to);
  };
}

/* ---- Running ------------------------------------------------------------ */

checkCard(fromDisk);
checkPanelFilm(fromDisk);
checkWiring(fromDisk);
checkWide(fromDisk);
checkFetchImage(fromDisk);

for (const r of results) {
  console.log((r.pass ? '  ok    ' : '  FAIL  ') + r.name.padEnd(13) + r.detail);
}
let failed = results.filter(r => !r.pass).length;

if (selftest) {
  console.log('\n  --selftest: every check below has to FAIL');
  const breaks = [
    ['Film this flare that leaves the card open',
      () => checkCard(editedRead(INDEX, 'solarFilm.lookUp({ flare: f }); clearView();', 'solarFilm.lookUp({ flare: f });'))],
    ['Fetch this moment that leaves the card open',
      () => checkCard(editedRead(INDEX, 'solarPanel.fetchAll(); clearView();', 'solarPanel.fetchAll();'))],
    ['a panel film button that keeps the panel',
      () => checkPanelFilm(editedRead(TIME, '    if (makeRoom) makeRoom();\n', ''))],
    ['a strip without a way to make room',
      () => checkWiring(editedRead(INDEX, '    makeRoom: () => clearView()\n', ''))],
    ['clearView on a wide screen too',
      () => checkWide(editedRead(INDEX, 'function clearView() {\n  if (!isNarrow()) return;', 'function clearView() {'))],
    ['Fetch image that closes the panel',
      () => checkFetchImage(editedRead(PANEL, '  async function fetchAll() {\n    if (busy) return;',
        '  async function fetchAll() {\n    if (busy) return;\n    makeRoom();'))]
  ];
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
console.log('\nall green (' + results.length + ' checks' + (selftest ? ' plus 6 breaks' : '') + ')');
