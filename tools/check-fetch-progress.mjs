/* ============================================================
   check-fetch-progress.mjs — a fetch of stills shows under the sun
   ------------------------------------------------------------
   On a phone the panel is mostly closed, so a fetch of stills has to
   show in the row under the sun, the way a film's lookup does. The
   panel keeps the count and the row reads it.

     1  count     the panel counts what is in: 0 of 2, then 1 of 2,
                  then done, naming the layer on its way
     2  reports   every step is reported, and the last report finds
                  the fetch done
     3  failure   a fetch that fails ends done as well, so the row
                  does not stay on its count
     4  row       the row shows the count, and cannot be pressed while
                  stills are on their way
     5  wiring    index.html hands the count from the panel to the row

   1 to 3 run createSolarPanel in node, with a document that holds no
   elements and a loadSlot that waits until the check lets it go. 4 and
   5 are read, not run: the row needs a canvas.

   `--selftest` breaks each guarantee and demands that its check fails.
   A check that passes on a broken input is not a check.
   ============================================================ */

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripComments } from './check-comment-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PANEL = 'js/ui/solar-panel.js';
const TIME = 'js/ui/solar-time.js';
const INDEX = 'index.html';
const COPY = 'js/ui/__panel-selftest.js';
const selftest = process.argv.includes('--selftest');

const results = [];
const ok = (name, detail) => results.push({ name, pass: true, detail });
const bad = (name, detail) => results.push({ name, pass: false, detail });

const fromDisk = rel => readFileSync(join(ROOT, rel), 'utf8');

/* The panel looks its elements up by id, and does without any it cannot find. */
globalThis.document = { getElementById: () => null };

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

/* ---- The panel, run ----------------------------------------------------- */

const loadPanel = () => import(pathToFileURL(join(ROOT, PANEL)).href);

/* A panel whose loadSlot waits until the check lets it go, and what the panel
   reported along the way. */
function panelWith(createSolarPanel, fail) {
  const waiting = [];
  const reports = [];
  const panel = createSolarPanel({
    state: () => ({ slotDetail: [] }),
    loadSlot: () => new Promise((resolve, reject) =>
      waiting.push(fail ? () => reject(new Error('Helioviewer is unavailable')) : resolve)),
    clearSlot: () => {},
    setViewR: () => {},
    setOpacity: () => {},
    setSpotsVisible: () => {},
    onProgress: () => reports.push(panel.progress())
  });
  return { panel, waiting, reports };
}

/* The oldest waiting image arrives, and the fetch takes its next step. */
async function letGo(waiting) {
  const next = waiting.shift();
  if (next) next();
  await new Promise(r => setImmediate(r));
}

const said = p => (p.busy ? p.text + (p.name ? ' (' + p.name + ')' : '') : 'done');

/* The Active sun preset: AIA 193 in the bottom slot, AIA 171 above it. */
async function twoLayers(load) {
  const { createSolarPanel } = await load();
  const { panel, waiting, reports } = panelWith(createSolarPanel, false);
  const seen = [panel.progress()];
  panel.applyPreset('active');
  seen.push(panel.progress());
  await letGo(waiting);
  seen.push(panel.progress());
  await letGo(waiting);
  seen.push(panel.progress());
  return { seen, reports };
}

async function checkCount(load) {
  const { seen } = await twoLayers(load);
  const [before, first, second, after] = seen;
  const right = !before.busy &&
    first.busy && first.text === 'Fetching 0 of 2…' && first.name === 'AIA 193' &&
    second.busy && second.text === 'Fetching 1 of 2…' && second.name === 'AIA 171' &&
    !after.busy;
  (right ? ok : bad)('count', seen.map(said).join(' → '));
}

async function checkReports(load) {
  const { reports } = await twoLayers(load);
  const last = reports[reports.length - 1];
  const right = reports.some(p => p.text === 'Fetching 0 of 2…') &&
    reports.some(p => p.text === 'Fetching 1 of 2…') && last && !last.busy;
  (right ? ok : bad)('reports', reports.length ? reports.map(said).join(' → ') : 'nothing reported');
}

async function checkFailure(load) {
  const { createSolarPanel } = await load();
  const { panel, waiting, reports } = panelWith(createSolarPanel, true);
  panel.applyPreset('quiet');
  await letGo(waiting);
  const last = reports[reports.length - 1];
  const right = !panel.progress().busy && last && !last.busy;
  (right ? ok : bad)('failure', 'a fetch that fails reports ' +
    (reports.length ? reports.map(said).join(' → ') : 'nothing'));
}

/* ---- The row and the wiring, read --------------------------------------- */

function checkRow(read) {
  const src = stripComments(read(TIME));
  const fn = block(src, 'function refreshRow()');
  const wrong = [];
  if (!/const fetchProgress = deps\.fetchProgress\b/.test(src)) wrong.push('the strip takes no fetchProgress');
  if (!fn) wrong.push('refreshRow not found in ' + TIME);
  else {
    if (!/\bfetchProgress\(\)/.test(fn)) wrong.push('the row does not read the count');
    if (!/btnFetch\.textContent\s*=\s*p\.text\b/.test(fn)) wrong.push('the row does not show the count');
    if (!/btnFetch\.disabled\s*=\s*!!\(p && p\.busy\)/.test(fn)) {
      wrong.push('the row can be pressed while stills are on their way');
    }
  }
  if (wrong.length) return bad('row', wrong.join('; '));
  ok('row', 'the row shows the count, and cannot be pressed while it runs');
}

function checkWiring(read) {
  const html = read(INDEX);
  const panelCall = block(html, 'solarPanel = createSolarPanel({');
  const timeCall = block(html, 'solarTime = createSolarTime({');
  const wrong = [];
  if (!panelCall) wrong.push('createSolarPanel is not called in ' + INDEX);
  else if (!/onProgress:\s*\(\)\s*=>\s*\{\s*if\s*\(solarTime\)\s*solarTime\.refresh\(\);\s*\}/.test(stripComments(panelCall))) {
    wrong.push('the panel does not tell the strip when its count changes');
  }
  if (!timeCall) wrong.push('createSolarTime is not called in ' + INDEX);
  else if (!/fetchProgress:\s*solarPanel\s*\?\s*\(\)\s*=>\s*solarPanel\.progress\(\)\s*:\s*null/.test(stripComments(timeCall))) {
    wrong.push("the strip is not given the panel's count");
  }
  if (wrong.length) return bad('wiring', wrong.join('; '));
  ok('wiring', 'index.html hands the count from the panel to the row');
}

/* ---- Breaks ------------------------------------------------------------- */

/* One replacement, or every one with `all`. A replacement that finds nothing
   throws, so a break cannot pass by breaking nothing. */
function edit(text, rel, from, to, all) {
  if (!text.includes(from)) throw new Error('"' + from.trim() + '" is not in ' + rel);
  return all ? text.split(from).join(to) : text.replace(from, to);
}

/* The panel with one edit, as a copy beside it, so an interrupted selftest
   leaves the real module as it was. */
function brokenPanel(from, to, all) {
  return () => {
    writeFileSync(join(ROOT, COPY), edit(fromDisk(PANEL), PANEL, from, to, all));
    return import(pathToFileURL(join(ROOT, COPY)).href + '?t=' + process.hrtime.bigint());
  };
}

/* A read of the files with one replacement in one of them. */
function editedRead(file, from, to) {
  return rel => (rel === file ? edit(fromDisk(rel), rel, from, to) : fromDisk(rel));
}

/* ---- Running ------------------------------------------------------------ */

await checkCount(loadPanel);
await checkReports(loadPanel);
await checkFailure(loadPanel);
checkRow(fromDisk);
checkWiring(fromDisk);

for (const r of results) {
  console.log((r.pass ? '  ok    ' : '  FAIL  ') + r.name.padEnd(10) + r.detail);
}
let failed = results.filter(r => !r.pass).length;

if (selftest) {
  console.log('\n  --selftest: every check below has to FAIL');
  const breaks = [
    ['a count that is never reported',
      () => checkReports(brokenPanel('if (onProgress) onProgress();', '', true))],
    ['a fetch that never says it is on its way',
      () => checkCount(brokenPanel('progress: () => (busy', 'progress: () => (false'))],
    ['a count of the image underway instead of what is in',
      () => checkCount(brokenPanel("'Fetching ' + p.done + ' of '", "'Fetching ' + (p.done + 1) + ' of '"))],
    ['a failed fetch that leaves the row on its count',
      () => checkFailure(brokenPanel(
        '      if (btn) { btn.disabled = false; btn.textContent = fetchLabel(); }\n      if (onProgress) onProgress();\n',
        '      if (btn) { btn.disabled = false; btn.textContent = fetchLabel(); }\n'))],
    ['a row that ignores the count',
      () => checkRow(editedRead(TIME, 'const p = fetchProgress ? fetchProgress() : null;', 'const p = null;'))],
    ['a row that can be pressed while stills are on their way',
      () => checkRow(editedRead(TIME, '      btnFetch.disabled = !!(p && p.busy);\n', ''))],
    ['a panel that does not tell the strip',
      () => checkWiring(editedRead(INDEX, '  onProgress: () => { if (solarTime) solarTime.refresh(); },\n', ''))],
    ['a strip that is not given the count',
      () => checkWiring(editedRead(INDEX, '    fetchProgress: solarPanel ? () => solarPanel.progress() : null,\n', ''))]
  ];
  for (const [name, run] of breaks) {
    const before = results.length;
    let caught = false;
    try {
      await run();
      caught = results.length > before && results.slice(before).every(r => !r.pass);
    } catch (e) {
      console.log('  FAIL  break: ' + name + ' could not be applied: ' + e.message);
    } finally {
      try { unlinkSync(join(ROOT, COPY)); } catch {}
    }
    console.log((caught ? '  ok    ' : '  FAIL  ') + ('break: ' + name).padEnd(66) +
      (caught ? 'caught' : 'SLIPPED THROUGH'));
    if (!caught) failed++;
    results.length = before;
  }
}

if (failed) {
  console.log('\n' + failed + ' failed');
  process.exit(1);
}
console.log('\nall green (' + results.length + ' checks' + (selftest ? ' plus 8 breaks' : '') + ')');
