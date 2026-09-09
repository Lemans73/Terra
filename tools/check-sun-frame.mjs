/* check-sun-frame.mjs — do both heliographic frames describe one sun?
 *
 *   node tools/check-sun-frame.mjs
 *   node tools/check-sun-frame.mjs --selftest
 *
 * WHY THIS EXISTS.
 * js/sunmoon-layer.js places the NOAA regions in Terra's WORLD frame, and it is
 * calibrated: session 12 measured a median of 1.67 degrees against a real
 * SDO/HMI image. js/layers/sun/frame.js places the same regions in IMAGE
 * coordinates, for the orthographic solar view. Two constructions, and they had
 * better be one sun.
 *
 * A disagreement here does not crash and does not look wrong. A spot 20 degrees
 * off still lands on the disc, still moves the right way from day to day, and
 * still sits at a plausible latitude. The only way to see it is to compare the
 * two, or to lay a spot on a photograph.
 *
 *   1  the basis is orthonormal and right-handed
 *   2  B0 comes back from the view direction, and cm is perpendicular
 *   3  place then invert returns the same coordinates
 *   4  both constructions agree, spot for spot
 *   5  P is a free parameter, and a wrong one is visible
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FRAME = join(ROOT, 'js/layers/sun/frame.js');
const DEG = Math.PI / 180;

const selftest = process.argv.includes('--selftest');
let failures = 0;

function report(kind, text, extra) {
  console.log((kind === 'ok' ? '  ok   ' : '  FAIL ') + ' ' + text +
              (extra ? '\n         ' + extra : ''));
  if (kind === 'fail') failures++;
}

/* Real NOAA active regions, and a B0 that belongs with them. Latitudes cover
   both hemispheres and longitudes both limbs, because a frame error that is
   symmetric about the centre hides in a sample that is too. */
const SPOTS = [
  { region: 4231, lat: 15, lon: -3 },
  { region: 4232, lat: -12, lon: 41 },
  { region: 4233, lat: 22, lon: -58 },
  { region: 4234, lat: -8, lon: 12 },
  { region: 4235, lat: 31, lon: 70 },
  { region: 4236, lat: -25, lon: -75 }
];

const B0_CASES = [7.23, -7.23, 0, 3.5, -1.2];

const norm = v => {
  const l = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
});

async function run() {
  const m = await import(FRAME + '?v=' + Date.now() + Math.random());
  const results = [];
  const check = (n, ok, detail) => results.push({ n, ok, detail });

  // 1 — orthonormal and right-handed. Everything downstream assumes it, and a
  // basis that has quietly gone skew still produces plausible-looking spots.
  {
    const wrong = [];
    for (const b0 of B0_CASES) for (const p of [0, 15, -26]) {
      const f = m.solarFrame(b0, p);
      for (const [name, v] of [['cm', f.cm], ['axis', f.axis], ['west', f.west]]) {
        const len = Math.hypot(v.x, v.y, v.z);
        if (Math.abs(len - 1) > 1e-9) wrong.push(`${name} length ${len.toFixed(6)} at B0=${b0} P=${p}`);
      }
      if (Math.abs(dot(f.axis, f.west)) > 1e-9) wrong.push(`axis.west at B0=${b0} P=${p}`);
      if (Math.abs(dot(f.cm, f.west)) > 1e-9) wrong.push(`cm.west at B0=${b0} P=${p}`);
      // Right-handed: axis x cm must be west, not its negative.
      const c = cross(f.axis, f.cm);
      if (Math.hypot(c.x - f.west.x, c.y - f.west.y, c.z - f.west.z) > 1e-9) {
        wrong.push(`handedness at B0=${b0} P=${p}`);
      }
    }
    check(1, wrong.length === 0, wrong.slice(0, 3).join('; '));
  }

  // 2 — B0 comes back out, from the VIEW DIRECTION and not from cm.
  //
  // The first version of this check asked for asin(cm . axis), which is zero by
  // construction once cm is perpendicular to the axis — and that perpendicularity
  // is exactly what cm is for. The check was wrong, not the code; it is written
  // out here because the wrong version looks more natural than the right one.
  {
    const wrong = [];
    const view = { x: 0, y: 0, z: 1 };
    for (const b0 of B0_CASES) for (const p of [0, 20]) {
      const f = m.solarFrame(b0, p);
      const back = Math.asin(dot(view, f.axis)) / DEG;
      if (Math.abs(back - b0) > 1e-9) {
        wrong.push(`B0 ${b0} came back as ${back.toFixed(6)} (P=${p})`);
      }
      // And cm really is perpendicular, which is the other half of the same fact.
      if (Math.abs(dot(f.cm, f.axis)) > 1e-9) {
        wrong.push(`cm is not perpendicular to the axis at B0=${b0}`);
      }
      // The frame also has to report the B0 it was built with.
      if (Math.abs(f.b0 - b0) > 1e-9) wrong.push(`frame.b0 ${f.b0} vs ${b0}`);
    }

    /* AN AXIS THAT IS NOT UNIT LENGTH. Every case above hands in a vector that
       already has length 1, so none of them can tell whether the normalisation
       inside frameFromVectors does anything — and a guard rail that only ever
       exercises the easy input is a guard rail with nothing to say. Scaled by
       1.4 here: B0 must still come back, because asin of a sine 1.4 times too
       large is a different angle entirely. */
    for (const b0 of [7.23, -3.5]) {
      const unit = { x: 0, y: Math.cos(b0 * DEG), z: Math.sin(b0 * DEG) };
      const long = { x: unit.x * 1.4, y: unit.y * 1.4, z: unit.z * 1.4 };
      const f = m.frameFromVectors(long, { x: 0, y: 0, z: 1 });
      if (!f) { wrong.push(`no frame from a long axis at B0=${b0}`); continue; }
      if (Math.abs(f.b0 - b0) > 1e-9) {
        wrong.push(`long axis gave B0 ${f.b0.toFixed(4)} instead of ${b0}`);
      }
      const len = Math.hypot(f.axis.x, f.axis.y, f.axis.z);
      if (Math.abs(len - 1) > 1e-9) wrong.push(`axis left at length ${len.toFixed(4)}`);
    }
    check(2, wrong.length === 0, wrong.slice(0, 3).join('; '));
  }

  // 3 — round trip. A placement that cannot be inverted cannot be checked, and
  // a sign error in the longitude convention shows up here and nowhere else.
  {
    const wrong = [];
    for (const b0 of B0_CASES) {
      const f = m.solarFrame(b0, 0);
      for (const s of SPOTS) {
        const v = m.spotDirection(f, s.lat, s.lon);
        const back = m.directionToHeliographic(f, v);
        if (Math.abs(back.lat - s.lat) > 1e-8 || Math.abs(back.lon - s.lon) > 1e-8) {
          wrong.push(`${s.region}: (${s.lat},${s.lon}) -> (${back.lat.toFixed(4)},${back.lon.toFixed(4)})`);
        }
      }
    }
    check(3, wrong.length === 0, wrong.slice(0, 3).join('; '));
  }

  // 4 — THE ONE THAT MATTERS. Build the same frame the way sunmoon-layer does
  // — from an axis and a direction to the observer — and place every spot in
  // both. Same sun, so the same direction, to within arithmetic.
  //
  // The world-frame axis is constructed here to have exactly the B0 the image
  // frame is given, which is what makes the two comparable: B0 is the only
  // quantity they share.
  {
    const wrong = [];
    let worst = 0;
    for (const b0 of B0_CASES) {
      const toEarth = { x: 0, y: 0, z: 1 };
      // An axis tilted by B0 towards the observer, rolled by an arbitrary angle
      // so the comparison is not accidentally done in the easy orientation.
      const roll = 37 * DEG;
      const axis = norm({
        x: -Math.sin(roll) * Math.cos(b0 * DEG),
        y: Math.cos(roll) * Math.cos(b0 * DEG),
        z: Math.sin(b0 * DEG)
      });
      const world = m.frameFromVectors(axis, toEarth);
      if (!world) { wrong.push(`no world frame at B0=${b0}`); continue; }
      if (Math.abs(world.b0 - b0) > 1e-9) {
        wrong.push(`world frame B0 ${world.b0.toFixed(6)} vs ${b0}`);
      }
      // The image frame with the matching P: the roll IS the position angle.
      const image = m.solarFrame(b0, roll / DEG);
      for (const s of SPOTS) {
        const a = m.spotDirection(world, s.lat, s.lon);
        const b = m.spotDirection(image, s.lat, s.lon);
        const ang = m.angleBetween(a, b);
        if (ang > worst) worst = ang;
        if (ang > 0.05) wrong.push(`${s.region} at B0=${b0}: ${ang.toFixed(4)} deg apart`);
      }
    }
    check(4, wrong.length === 0,
      wrong.length ? wrong.slice(0, 3).join('; ') : '') ;
    if (!wrong.length && !selftest) {
      console.log('         worst disagreement across all cases: ' +
                  worst.toExponential(2) + ' degrees');
    }
  }

  // 5 — P has to matter. If a wrong P produced the same picture, the parameter
  // would be decoration and the open question in the plan would be unanswerable
  // by any measurement at all.
  {
    const f0 = m.solarFrame(7.23, 0);
    const f20 = m.solarFrame(7.23, 20);
    let biggest = 0;
    for (const s of SPOTS) {
      const ang = m.angleBetween(m.spotDirection(f0, s.lat, s.lon),
                                 m.spotDirection(f20, s.lat, s.lon));
      if (ang > biggest) biggest = ang;
    }
    // 20 degrees of roll moves a spot at the limb by close to 20 degrees; a
    // spot at the centre barely moves. Demanding a large maximum is the honest
    // form of "this parameter does something".
    check(5, biggest > 5,
      biggest > 5 ? '' : `P=20 moved the furthest spot only ${biggest.toFixed(3)} deg`);
    if (biggest > 5 && !selftest) {
      console.log('         P=20 moves the furthest spot by ' + biggest.toFixed(2) + ' degrees');
    }
  }

  return results;
}

const DESCRIPTIONS = {
  1: 'the basis is orthonormal and right-handed',
  2: 'B0 comes back from the view direction, and cm is perpendicular',
  3: 'place then invert returns the same coordinates',
  4: 'both constructions agree, spot for spot',
  5: 'P is a free parameter, and a wrong one is visible'
};

const BREAKS = [
  {
    n: 2, what: 'drop the cos(B0) factor from the axis',
    edit: s => s.replace('const axis = { x: -sp * cb, y: cp * cb, z: sb };',
                         'const axis = { x: -sp, y: cp, z: sb };')
  },
  {
    n: 1, what: 'flip the handedness of west',
    edit: s => s.replace(
      '    x: axis.y * cm.z - axis.z * cm.y,\n' +
      '    y: axis.z * cm.x - axis.x * cm.z,\n' +
      '    z: axis.x * cm.y - axis.y * cm.x\n' +
      '  };',
      '    x: cm.y * axis.z - cm.z * axis.y,\n' +
      '    y: cm.z * axis.x - cm.x * axis.z,\n' +
      '    z: cm.x * axis.y - cm.y * axis.x\n' +
      '  };')
  },
  {
    n: 3, what: 'stop negating the longitude on the way back',
    edit: s => s.replace('const lon = -Math.atan2(dWest, dCm) / DEG;',
                         'const lon = Math.atan2(dWest, dCm) / DEG;')
  },
  {
    n: 2, what: 'put B0 into the wrong component',
    edit: s => s.replace('const axis = { x: -sp * cb, y: cp * cb, z: sb };',
                         'const axis = { x: -sp * cb, y: sb, z: cp * cb };')
  },
  {
    n: 5, what: 'ignore P entirely',
    edit: s => s.replace('const cp = Math.cos(p), sp = Math.sin(p);',
                         'const cp = 1, sp = 0;')
  },
  {
    n: 2, what: 'trust the incoming axis instead of normalising it',
    edit: s => s.replace(
      '  const axis = { x: axisIn.x / aLen, y: axisIn.y / aLen, z: axisIn.z / aLen };',
      '  const axis = axisIn;')
  },
  {
    n: 4, what: 'skip removing the axis component when building cm',
    edit: s => s.replace(
      '  const cmRaw = {\n' +
      '    x: toEarth.x - axis.x * d,\n' +
      '    y: toEarth.y - axis.y * d,\n' +
      '    z: toEarth.z - axis.z * d\n' +
      '  };',
      '  const cmRaw = { x: toEarth.x, y: toEarth.y, z: toEarth.z };')
  }
];

async function main() {
  if (!selftest) {
    console.log('check-sun-frame — one sun, two constructions\n');
    for (const r of await run()) {
      report(r.ok ? 'ok' : 'fail', 'check ' + r.n + ' — ' + DESCRIPTIONS[r.n], r.detail);
    }
    console.log(failures ? '\n' + failures + ' failed' : '\nall five green');
    process.exit(failures ? 1 : 0);
  }

  console.log('check-sun-frame --selftest — every break must show\n');
  const baseline = await run();
  if (baseline.some(r => !r.ok)) {
    console.log('  FAIL  the unmodified module is already red — fix that first');
    process.exit(1);
  }

  const original = await readFile(FRAME, 'utf8');
  let missed = 0;
  for (const brk of BREAKS) {
    const broken = brk.edit(original);
    if (broken === original) {
      report('fail', 'break "' + brk.what + '" changed nothing',
             'the injection no longer matches the source');
      missed++;
      continue;
    }
    await writeFile(FRAME, broken);
    let caught = false;
    try {
      caught = (await run()).some(r => r.n === brk.n && !r.ok);
    } catch { caught = true; }
    finally { await writeFile(FRAME, original); }
    report(caught ? 'ok' : 'fail',
      'check ' + brk.n + (caught ? ' catches: ' : ' MISSED: ') + brk.what);
    if (!caught) missed++;
  }
  await writeFile(FRAME, original);
  console.log(missed ? '\n' + missed + ' break(s) went unnoticed' : '\nall breaks seen');
  process.exit(missed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
