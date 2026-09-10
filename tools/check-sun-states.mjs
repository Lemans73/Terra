/* check-sun-states.mjs — is there exactly one sun, and does everyone mean it?
 *
 *   node tools/check-sun-states.mjs
 *   node tools/check-sun-states.mjs --selftest
 *
 * WHY THIS EXISTS.
 * Terra registered two states for one subject: `sun` flew the camera to its own
 * sun mesh at radius 420, and `solar` put instrument frames on an orthographic
 * projection. Navigate showed two entries, and — worse — seven places in
 * index.html asked `isActive('sun')` and got an answer about the first one.
 *
 * The two are now one, under the key `sun`. What this guards is the shape of
 * that merge, because every way of breaking it again is silent:
 *
 *   - `definitions` in js/core/view-state.js is a Map. A second
 *     `register('sun', …)` OVERWRITES the first without a word, and which one
 *     wins depends on file order.
 *   - `inZonAanzicht()` is the gate for the target lock, the zoom floor and the
 *     camera bounds. Point it at a key nobody registers and it returns false
 *     forever: no error, just a lock that never closes.
 *   - `body.sun-view` rules that outlive their state keep matching nothing.
 *     Dead CSS does not fail; it accumulates.
 *
 *   1  exactly one sun state is registered   break: register a second
 *   2  `solar` is no longer a state key      break: bring isActive('solar') back
 *   3  `sun-view` is gone from the stylesheet break: put a rule back
 *   4  the gate names the sun's own key     break: point the gate elsewhere
 *   5  the drawn sun imports nothing that   break: import source.js there
 *      reaches the proxy
 *
 * CHECK 2 DELIBERATELY IGNORES `detail.kind() === 'solar'`. That string is the
 * READOUT's kind, not a state key, and it is supposed to stay — a check that
 * flagged it would be a check nobody could keep green.
 *
 * Run:  node tools/check-sun-states.mjs            (exit 0 = green)
 *       node tools/check-sun-states.mjs --selftest (every break must show)
 */

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARKUP = 'index.html';
const STATE = 'js/states/sun.js';
const STYLES = 'css/app.css';

const selftest = process.argv.includes('--selftest');

function report(outcome, text, extra) {
  const mark = outcome === 'ok' ? '  ok   ' : '  FAIL ';
  console.log(mark + ' ' + text + (extra ? ' — ' + extra : ''));
  return outcome === 'ok' ? 0 : 1;
}

/* Counted across BOTH files, because that is where the collision lives: the
   markup registers the built-in states and the module registers its own. */
const REGISTER = /viewStates\.register\(\s*'sun'/g;

function count(src, re) {
  return (src.match(re) || []).length;
}

/* 1. One sun, and one only. */
function checkOne(html, state) {
  const n = count(html, REGISTER) + count(state, REGISTER);
  if (n === 1) return report('ok', 'one sun state registered');
  if (n === 0) return report('fail', 'no sun state is registered', 'Navigate loses its sun entry');
  return report('fail', `${n} sun states are registered`,
                'a Map keeps the last one and says nothing');
}

/* 2. `solar` is a readout kind, not a state key. */
function checkKeyGone(...sources) {
  const hits = [];
  for (const { name, src } of sources) {
    src.split('\n').forEach((line, i) => {
      if (/viewStates\.register\(\s*'solar'|isActive\(\s*'solar'\s*\)/.test(line)) {
        hits.push(`${name}:${i + 1}`);
      }
    });
  }
  return hits.length
    ? report('fail', "'solar' is still used as a state key", hits.join(', '))
    : report('ok', "'solar' is no longer a state key");
}

/* 3. Dead selectors do not fail on their own, so they are failed here. */
function checkStylesheet(css) {
  const lines = [];
  css.split('\n').forEach((line, i) => { if (/sun-view/.test(line)) lines.push(i + 1); });
  return lines.length
    ? report('fail', '`sun-view` still appears in the stylesheet',
             'line ' + lines.join(', '))
    : report('ok', '`sun-view` is gone from the stylesheet');
}

/* 4. THE GATE AND THE SUN'S REGISTRATION HAVE TO NAME THE SAME KEY, and nothing
   in the language ties them together. Pointing the gate at another state is the
   quietest failure of the four: `isActive` keeps answering, just about somebody
   else — the lock then closes in Space and never in the sun. */
function checkGate(html, state) {
  const gate = html.match(/const inZonAanzicht\s*=[^;]*?isActive\(\s*'([a-z]+)'\s*\)/);
  if (!gate) return report('fail', 'inZonAanzicht() not found', 'renamed or reshaped?');
  const reg = state.match(/viewStates\.register\(\s*'([a-z]+)'\s*,\s*definition\s*\)/);
  if (!reg) return report('fail', STATE + ' registers nothing', 'renamed or reshaped?');
  return gate[1] === reg[1]
    ? report('ok', `inZonAanzicht() and ${STATE} both say '${gate[1]}'`)
    : report('fail', `inZonAanzicht() asks for '${gate[1]}'`,
             STATE + " registers '" + reg[1] + "'");
}

/* 5. THE SPLIT THAT KEEPS THE STANDALONE ALIVE. The drawn sun ships with
   terra.html; the fetch client and the instrument table do not, because the
   proxy is a Vercel Edge Function. tools/build-standalone walks the STATIC
   import graph, so a single `import … from '../layers/sun/fetch.js'` here drags
   the whole proxy side back in however carefully the call sites are guarded.
   They arrive as `env.imagery` instead — see the head of js/states/sun.js.

   The build has its own guard on the output, and this one says the same thing
   at the place where the mistake gets made. */
const PROXY_SIDE = /^import\s[\s\S]*?from\s*['"][^'"]*\/(fetch|source)\.js['"]/gm;

function checkSplit(state) {
  const hits = (state.match(PROXY_SIDE) || [])
    .map(m => m.replace(/\s+/g, ' ').trim().slice(0, 60));
  return hits.length
    ? report('fail', STATE + ' imports the proxy side directly', hits.join(' | '))
    : report('ok', STATE + ' leaves the proxy side to env.imagery');
}

async function run(markup = MARKUP, state = STATE, styles = STYLES) {
  const html = await readFile(join(ROOT, markup), 'utf8');
  const st = await readFile(join(ROOT, state), 'utf8');
  const css = await readFile(join(ROOT, styles), 'utf8');
  let bad = 0;
  bad += checkOne(html, st);
  bad += checkKeyGone({ name: markup, src: html }, { name: state, src: st });
  bad += checkStylesheet(css);
  bad += checkGate(html, st);
  bad += checkSplit(st);
  return bad;
}

/* THE CHECK ON THE CHECK. Every break below MUST show; a check that passes
   without anything to test tests nothing. Breaks go on COPIES, so an
   interrupted selftest never leaves a damaged file behind. */
async function selftestRun() {
  const html = await readFile(join(ROOT, MARKUP), 'utf8');
  const state = await readFile(join(ROOT, STATE), 'utf8');
  const css = await readFile(join(ROOT, STYLES), 'utf8');
  const tmpHtml = '__index-sunstates.html';
  const tmpState = 'js/states/__sun-sunstates.js';
  const tmpCss = 'css/__app-sunstates.css';

  const breaks = [
    {
      name: 'a second sun state',
      html: (s) => s.replace('viewStates.register(\'space\'',
                             'viewStates.register(\'sun\', { body: \'x\' });\nviewStates.register(\'space\''),
      state: (s) => s, css: (s) => s
    },
    {
      name: "isActive('solar') back in the markup",
      html: (s) => s.replace("viewStates.isActive('sun')", "viewStates.isActive('solar')"),
      state: (s) => s, css: (s) => s
    },
    {
      name: 'a sun-view rule back in the stylesheet',
      html: (s) => s, state: (s) => s,
      css: (s) => s.replace('  body.space-on .panel,', '  body.sun-view .panel,\n  body.space-on .panel,')
    },
    {
      name: 'the gate pointing at another state',
      html: (s) => s.replace("const inZonAanzicht = () => !!(viewStates && viewStates.isActive('sun'))",
                             "const inZonAanzicht = () => !!(viewStates && viewStates.isActive('space'))"),
      state: (s) => s, css: (s) => s
    },
    {
      name: 'the drawn sun importing the proxy side',
      html: (s) => s,
      state: (s) => s.replace("import { createSpotLayer } from '../layers/sun/spots.js';",
                              "import { createSunFetch } from '../layers/sun/fetch.js';\n" +
                              "import { createSpotLayer } from '../layers/sun/spots.js';"),
      css: (s) => s
    },
    {
      name: 'the module registering under the old key',
      html: (s) => s,
      state: (s) => s.replace("viewStates.register('sun', definition)",
                              "viewStates.register('solar', definition)"),
      css: (s) => s
    }
  ];

  let missed = 0;
  for (const b of breaks) {
    await writeFile(join(ROOT, tmpHtml), b.html(html));
    await writeFile(join(ROOT, tmpState), b.state(state));
    await writeFile(join(ROOT, tmpCss), b.css(css));
    let bad = 0;
    try { bad = await run(tmpHtml, tmpState, tmpCss); }
    catch { bad = 1; }
    finally {
      await unlink(join(ROOT, tmpHtml)).catch(() => {});
      await unlink(join(ROOT, tmpState)).catch(() => {});
      await unlink(join(ROOT, tmpCss)).catch(() => {});
    }
    if (bad) console.log('  ok    break seen: ' + b.name + '\n');
    else { console.log('  FAIL  break NOT seen: ' + b.name + '\n'); missed++; }
  }
  return missed;
}

if (selftest) {
  console.log('selftest — every break must show\n');
  const missed = await selftestRun();
  console.log(missed ? `\n${missed} break(s) went unnoticed` : '\nall breaks seen');
  process.exit(missed ? 1 : 0);
} else {
  const bad = await run();
  process.exit(bad ? 1 : 0);
}
