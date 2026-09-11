/* check-sun-projection.mjs — does the orthographic slab cover the whole zoom?
 *
 *   node tools/check-sun-projection.mjs
 *   node tools/check-sun-projection.mjs --selftest
 *
 * WHY THIS EXISTS.
 * js/states/sun.js drives the zoom from the CAMERA DISTANCE and then overrides
 * updateProjectionMatrix to build an orthographic matrix by hand. The extents
 * follow VIEW_R; the depth slab is a separate constant. Nothing ties the two
 * together, and nothing complains when they drift apart.
 *
 * WHAT DRIFTING APART LOOKS LIKE — session 49, LASCO C3.
 * makeOrthographic(-hw, hw, hh, -hh, -DEPTH, DEPTH) puts the camera at view-z 0
 * and a layer at the origin at view-z -d, where d is the camera distance. The
 * matrix then gives
 *
 *     ndc_z = d / DEPTH
 *
 * and anything past ndc_z = 1 is clipped on depth. With DEPTH fixed at 4000 and
 * distanceFor(VIEW_R_MAX) = 12800, every view past VIEW_R 10 fell outside the
 * slab. The preset that frames LASCO at 15 landed on ndc_z = 1.5 and rendered
 * black — while the texture held data, the uniforms read correct, the mesh sat
 * in the scene, and onBeforeRender counted six draws a second. A solid red test
 * shader in the same slot produced no pixel either. That is the signature: it
 * is not the shader, and no uniform will bring it back.
 *
 *   1  DEPTH covers the furthest the camera is allowed to stand (ndc_z <= 1)
 *   2  the depth slab carries margin beyond that
 *   3  setViewR cuts a running flight, and puts the distance limits back
 *   4  the constants are still shaped the way this check reads them
 *
 * ON CHECK 3 — session 49, the second half of the same black screen.
 * A flight writes the camera every frame, and this state's zoom IS the camera
 * distance. A preset that sets the distance while the entry flight is still
 * running loses it on the next frame: measured, the preset set 6000 and the
 * flight walked it back to 660 over the following second, in a smooth curve.
 * The layers arrived, the zoom did not, and LASCO framed at 15 showed nothing
 * but its own occulter. The limits have to come back by hand, because a flight
 * opens them to 0.01 and Infinity and only restores them on an arrival that no
 * longer happens.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUN = join(ROOT, 'js/states/sun.js');

const selftest = process.argv.includes('--selftest');
let failures = 0;

function report(kind, text, extra) {
  console.log((kind === 'ok' ? '  ok   ' : '  FAIL ') + ' ' + text +
              (extra ? '\n         ' + extra : ''));
  if (kind === 'fail') failures++;
}

/* The constants are not exported, so they are read from the source. That is
   deliberate: exporting them for a test would let the test pass while the
   value the running code uses is a different one. */
function readConstants(src) {
  const num = (name, re) => {
    const m = src.match(re);
    return m ? { name, expr: m[1].trim() } : null;
  };
  return {
    viewRMax: num('VIEW_R_MAX', /const\s+VIEW_R_MAX\s*=\s*([^;]+);/),
    cameraK:  num('CAMERA_K',   /const\s+CAMERA_K\s*=\s*([^;]+);/),
    worldR:   num('SUN_WORLD_R',/SUN_WORLD_R\s*=\s*([^;]+);/),
    depth:    num('DEPTH',      /const\s+DEPTH\s*=\s*([^;]+);/),
    /* The four sides come from orthoBounds() (see check-ortho-bounds.mjs);
       this check owns the depth slab, the last two arguments. */
    ortho:    /makeOrthographic\(\s*b\.left,\s*b\.right,\s*b\.top,\s*b\.bottom,\s*-DEPTH,\s*DEPTH\s*\)/.test(src)
  };
}

/* SUN_WORLD_R lives in the scene module, so it is read from there. */
async function worldRadius() {
  const src = await readFile(join(ROOT, 'js/layers/sun/scene.js'), 'utf8');
  const m = src.match(/export\s+const\s+SUN_WORLD_R\s*=\s*([\d.]+)/);
  return m ? +m[1] : null;
}

async function run() {
  const src = await readFile(SUN, 'utf8');
  const c = readConstants(src);
  const R = await worldRadius();
  const out = [];

  // 4 first: every other check reads these, so a shape change must be loud
  // rather than silently turning the rest into comparisons against NaN.
  const shapeOk = !!(c.viewRMax && c.cameraK && c.depth && R && c.ortho);
  out.push({ n: 4, ok: shapeOk,
    what: 'the constants and the makeOrthographic call are shaped as expected',
    extra: shapeOk ? null : 'missing: ' + [
      !c.viewRMax && 'VIEW_R_MAX', !c.cameraK && 'CAMERA_K', !c.depth && 'DEPTH',
      !R && 'SUN_WORLD_R', !c.ortho && 'makeOrthographic(b.left,b.right,b.top,b.bottom,-DEPTH,DEPTH)'
    ].filter(Boolean).join(', ') });
  if (!shapeOk) return out;

  const viewRMax = +c.viewRMax.expr;
  const cameraK = +c.cameraK.expr;
  if (!Number.isFinite(viewRMax) || !Number.isFinite(cameraK)) {
    out.push({ n: 4, ok: false, what: 'VIEW_R_MAX and CAMERA_K are plain numbers',
      extra: `read VIEW_R_MAX=${c.viewRMax.expr} CAMERA_K=${c.cameraK.expr}` });
    return out;
  }

  const distanceFor = r => r * R * cameraK;
  const maxDistance = distanceFor(viewRMax);

  // DEPTH may be written as an expression; evaluate it in a scope that holds
  // exactly the names the source has at that point, and nothing else.
  let depth;
  try {
    depth = Function('SUN_WORLD_R', 'VIEW_R_MAX', 'CAMERA_K', 'distanceFor',
      'return (' + c.depth.expr + ');')(R, viewRMax, cameraK, distanceFor);
  } catch (e) {
    out.push({ n: 4, ok: false, what: 'DEPTH evaluates', extra: String(e.message) });
    return out;
  }

  /* ndc_z = distance / DEPTH, and the relation is linear, so the furthest the
     camera may stand is also the worst case. Walking the range would add rows
     but not a second way to fail — the endpoint is the whole test. */
  const worstNdcZ = maxDistance / depth;
  out.push({ n: 1, ok: depth >= maxDistance,
    what: 'DEPTH covers the furthest the camera may stand',
    extra: `DEPTH ${depth} vs distanceFor(VIEW_R_MAX ${viewRMax}) ${maxDistance}` +
           `, worst ndc_z ${+worstNdcZ.toFixed(3)}` +
           (depth >= maxDistance
             ? ''
             : ` — everything past VIEW_R ${+(depth / (R * cameraK)).toFixed(2)} clips to black`) });

  const margin = depth - maxDistance;
  out.push({ n: 2, ok: margin >= R * 10,
    what: 'the slab carries margin for meshes that are not at z = 0',
    extra: `margin ${margin} world units, want at least ${R * 10}` });

  /* Read the body of setViewR rather than the whole file: a stopFlight call
     somewhere else entirely would satisfy a file-wide search while the zoom
     still loses to the flight. */
  const body = (src.match(/function setViewR\s*\([^)]*\)\s*\{([\s\S]*?)\n  \}/) || [])[1] || '';
  const cuts = /stopFlight\s*\(\s*\)/.test(body);
  const restoresMin = /minDistance\s*=/.test(body);
  const restoresMax = /maxDistance\s*=/.test(body);
  out.push({ n: 3, ok: !!body && cuts && restoresMin && restoresMax,
    what: 'setViewR cuts a running flight and restores the distance limits',
    extra: !body ? 'setViewR not found — this check read nothing'
      : [cuts ? null : 'no stopFlight() call',
         restoresMin ? null : 'minDistance not set back',
         restoresMax ? null : 'maxDistance not set back'
        ].filter(Boolean).join(', ') || 'cuts the flight and puts both limits back' });

  return out;
}

/* Each break must make a NAMED check fail. A break that merely makes the run
   throw proves nothing about the check that was supposed to catch it. */
const BREAKS = [
  { n: 1, what: 'a fixed slab that no longer follows the zoom range',
    from: /const DEPTH = distanceFor\(VIEW_R_MAX\) \+ SUN_WORLD_R \* 40;/,
    to: 'const DEPTH = SUN_WORLD_R * 40;' },
  { n: 2, what: 'a slab with no margin above the furthest camera stand',
    from: /const DEPTH = distanceFor\(VIEW_R_MAX\) \+ SUN_WORLD_R \* 40;/,
    to: 'const DEPTH = distanceFor(VIEW_R_MAX);' },
  { n: 3, what: 'setViewR that lets a running flight overwrite the zoom',
    from: /      if \(env\.stopFlight\) \{\n        env\.stopFlight\(\);/,
    to: '      if (false) {\n        void 0;' },
  { n: 3, what: 'setViewR that cuts the flight but leaves the limits wide open',
    from: /        ctl\.minDistance = distanceFor\(VIEW_R_MIN\);\n        ctl\.maxDistance = distanceFor\(VIEW_R_MAX\);/,
    to: '        void 0;' },
  { n: 4, what: 'the orthographic call no longer using DEPTH on both sides',
    from: /-DEPTH, DEPTH\s*\)/,
    to: '-DEPTH, 4000)' }
];

async function main() {
  const original = await readFile(SUN, 'utf8');

  if (!selftest) {
    console.log('check-sun-projection — the orthographic depth slab\n');
    const rows = await run();
    for (const r of rows) report(r.ok ? 'ok' : 'fail', 'check ' + r.n + '  ' + r.what, r.extra);
    console.log(failures ? '\n' + failures + ' failure(s)' : '\nall good');
    process.exit(failures ? 1 : 0);
  }

  console.log('check-sun-projection --selftest — break it and see if we notice\n');
  let missed = 0;
  for (const brk of BREAKS) {
    if (!brk.from.test(original)) {
      report('fail', 'check ' + brk.n + ' SETUP: the injection no longer matches the source',
        String(brk.from));
      missed++;
      continue;
    }
    await writeFile(SUN, original.replace(brk.from, brk.to));
    let caught = false;
    try {
      caught = (await run()).some(r => r.n === brk.n && !r.ok);
    } catch { caught = false; }
    finally { await writeFile(SUN, original); }
    report(caught ? 'ok' : 'fail',
      'check ' + brk.n + (caught ? ' catches: ' : ' MISSED: ') + brk.what);
    if (!caught) missed++;
  }
  await writeFile(SUN, original);
  console.log(missed ? '\n' + missed + ' break(s) went unnoticed' : '\nall breaks seen');
  process.exit(missed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
