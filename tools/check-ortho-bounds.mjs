/* check-ortho-bounds.mjs — does a hand-built orthographic frustum still cut the frame?
 *
 *   node tools/check-ortho-bounds.mjs
 *   node tools/check-ortho-bounds.mjs --selftest
 *
 * WHY THIS EXISTS.
 * The sun state and the magnetosphere build their orthographic matrix by hand.
 * The export asks for its frame with `camera.setViewOffset()`, and a matrix
 * built by hand ignores that request unless it goes through orthoBounds().
 * Nothing crashes when it does not: the file comes out with the whole screen
 * in it, stretched into the file's shape. Measured on the sun's disc, round
 * on screen: 0.592 wide per high in a 9:16 export, 1.860 in a 16:9.
 *
 *   1  the module loads
 *   2  orthoBoundsSelftest() is empty
 *   3  both states still build their matrix through orthoBounds()
 *
 * Run:  node tools/check-ortho-bounds.mjs            (exit 0 = green)
 *       node tools/check-ortho-bounds.mjs --selftest (every break must show)
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = join(ROOT, 'js/core/ortho-bounds.js');
const STATES = ['js/states/sun.js', 'js/states/magnetosphere.js'];

function say(ok, text, extra) {
  console.log((ok ? '  ok    ' : '  FAIL  ') + text);
  if (extra) for (const line of [].concat(extra)) console.log('        ' + line);
}

/* Every makeOrthographic in a state must take its four bounds from
   orthoBounds(). A call with -hw, hw, hh, -hh typed in is the old shape. */
function statesUseBounds(sources) {
  const bad = [];
  for (const [file, text] of Object.entries(sources)) {
    const calls = text.match(/makeOrthographic\(([^;]*?)\);/gs) || [];
    if (!calls.length) bad.push(file + ': no makeOrthographic found, so this check reads nothing');
    if (!/import\s*\{[^}]*\borthoBounds\b[^}]*\}\s*from\s*'\.\.\/core\/ortho-bounds\.js'/.test(text)) {
      bad.push(file + ': does not import orthoBounds');
    }
    for (const call of calls) {
      if (!/\b\w+\.left\b[\s\S]*\b\w+\.right\b[\s\S]*\b\w+\.top\b[\s\S]*\b\w+\.bottom\b/.test(call)) {
        bad.push(file + ': ' + call.replace(/\s+/g, ' ').slice(0, 90) + ' ignores the view offset');
      }
    }
  }
  return bad;
}

const readStates = () => Object.fromEntries(STATES.map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));

async function run() {
  let failed = 0;
  let mod;
  try {
    mod = await import(pathToFileURL(MODULE).href);
    say(true, 'the module loads');
  } catch (err) {
    say(false, 'the module loads', String(err.message || err));
    return 1;
  }
  const real = mod.orthoBoundsSelftest();
  say(real.length === 0, 'orthoBoundsSelftest() is empty', real);
  if (real.length) failed++;

  const wiring = statesUseBounds(readStates());
  say(wiring.length === 0, 'both states build their matrix through orthoBounds()', wiring);
  if (wiring.length) failed++;
  return failed;
}

async function proveItCanFail() {
  const mod = await import(pathToFileURL(MODULE).href);
  const states = readStates();
  const breaks = [
    ['a frustum that ignores the view', () => mod.orthoBoundsSelftest({ orthoBounds: (w, h) => ({ left: -w, right: w, top: h, bottom: -h }) }).length > 0],
    ['a view offset counted from the bottom', () => mod.orthoBoundsSelftest({
      orthoBounds: (w, h, v) => {
        const b = mod.orthoBounds(w, h, v);
        if (!v || !v.enabled) return b;
        const sh = (2 * h) / v.fullHeight, bottom = -h + sh * v.offsetY;
        return { ...b, bottom, top: bottom + sh * v.height };
      }
    }).length > 0],
    ['a frame half a pixel too wide', () => mod.orthoBoundsSelftest({
      orthoBounds: (w, h, v) => { const b = mod.orthoBounds(w, h, v); return v && v.enabled ? { ...b, right: b.right + (2 * w) / v.fullWidth / 2 } : b; }
    }).length > 0],
    ['the sun state back on typed-in bounds', () => statesUseBounds({
      ...states,
      'js/states/sun.js': states['js/states/sun.js'].replace(/makeOrthographic\([^;]*?\);/s, 'makeOrthographic(-hw, hw, hh, -hh, -DEPTH, DEPTH);')
    }).length > 0],
    ['the magnetosphere without the import', () => statesUseBounds({
      ...states,
      'js/states/magnetosphere.js': states['js/states/magnetosphere.js'].replace(/import\s*\{\s*orthoBounds\s*\}[^;]*;/, '')
    }).length > 0]
  ];
  let missed = 0;
  for (const [name, caught] of breaks) {
    if (caught()) console.log('  ok    break seen: ' + name);
    else { console.log('  FAIL  break NOT seen: ' + name); missed++; }
  }
  return missed;
}

if (process.argv.includes('--selftest')) {
  console.log('selftest — every break must show\n');
  const missed = await proveItCanFail();
  console.log(missed ? '\n' + missed + ' break(s) went unnoticed' : '\nall breaks seen');
  process.exit(missed ? 1 : 0);
} else {
  process.exit((await run()) ? 1 : 0);
}
