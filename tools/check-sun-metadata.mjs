/* check-sun-metadata.mjs — does every solar quantity still follow from the data?
 *
 *   node tools/check-sun-metadata.mjs
 *   node tools/check-sun-metadata.mjs --selftest
 *   node tools/check-sun-metadata.mjs --live      (asks Helioviewer, needs network)
 *
 * WHY THIS EXISTS.
 * The whole solar layer rests on deriving its numbers from the metadata rather
 * than tabulating them. That is only worth anything while the derivation is
 * right, and a wrong one does not crash: it draws a sun, just at the wrong size
 * or with three quarters of the instrument thrown away. LASCO C3 came out at 11
 * solar radii instead of 49 that way, and the composite merely looked poor.
 *
 * The fixtures below are real getClosestImage responses. The expected fields
 * are the ones the findings document recorded, and they are written out here so
 * the check knows them independently of the code it checks.
 *
 *   1  the four field values, from real responses
 *   2  SDO's derived distance is 0.9996 AU
 *   3  the coronagraph rule keeps the outer field
 *   4  texture size and image scale invert each other
 *   5  sharpness classifies green / amber / red at the right boundaries
 *   6  the timestamp handoff between the two endpoints
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'js/layers/sun/source.js');
const FETCH = join(ROOT, 'js/layers/sun/fetch.js');

const selftest = process.argv.includes('--selftest');
const live = process.argv.includes('--live');
let failures = 0;

function report(kind, text, extra) {
  const mark = kind === 'ok' ? '  ok   ' : '  FAIL ';
  console.log(mark + ' ' + text + (extra ? '\n         ' + extra : ''));
  if (kind === 'fail') failures++;
}

/* Real getClosestImage responses, captured 2026-09-09 through Terra's own
   proxy. Verbatim: a fixture edited into agreement with the code stops being
   evidence.

   `expectField` is worked out BY HAND from the numbers on its own line and
   written here as a literal, so the check knows the answer independently of
   the function that produces it. The arithmetic is in the comment beside each.

   THESE ARE NOT THE VALUES IN THE FINDINGS DOCUMENT, and that is a finding of
   its own. It recorded AIA 1.28, HMI 1.10, SWAP 1.51 and LASCO C3 nearly 49.
   AIA still holds. The other three have moved, because Helioviewer's own
   processing has: HMI now arrives on AIA's 4096 grid at AIA's plate scale, and
   LASCO C3's reference pixel has migrated to near the centre of the detector.
   Reconstructed from the document's own texture sizes — it quotes 376 and 1672
   pixels, which at rsun 17.14 put the reference pixel at roughly (186, 838) —
   whereas today it sits at (519.2, 533.5). */
const FIXTURES = {
  'AIA 171': {
    date: '2026-09-08 11:59:57', scale: 0.60453, width: 4096, height: 4096,
    refPixelX: 2048.5, refPixelY: 2048.5, rsun: 1587.4247,
    coronagraph: false,
    expectField: 1.2898,          // min(2048.5, 2047.5) / 1587.4247
    expectAu: 0.9996
  },
  'HMI Int': {
    date: '2026-09-08 12:00:00', scale: 0.60453, width: 4096, height: 4096,
    refPixelX: 2048.5, refPixelY: 2048.5, rsun: 1587.4238,
    coronagraph: false,
    expectField: 1.2898           // same grid as AIA since Helioviewer reprocessed
  },
  'SWAP 174': {
    date: '2026-09-08 12:00:00', scale: 3.18844, width: 1024, height: 1024,
    refPixelX: 512.5, refPixelY: 512.5, rsun: 300.9735,
    coronagraph: false,
    expectField: 1.6995           // min(512.5, 511.5) / 300.9735
  },
  'LASCO C2': {
    date: '2026-09-08 12:00:00', scale: 11.90, width: 1024, height: 1024,
    refPixelX: 511.2, refPixelY: 507.5, rsun: 80.6424,
    coronagraph: true,
    expectField: 6.4048           // max(512.8, 516.5) / 80.6424
  },
  'LASCO C3': {
    date: '2026-09-08 12:00:00', scale: 56.0, width: 1024, height: 1024,
    refPixelX: 519.2, refPixelY: 533.5, rsun: 17.1365,
    coronagraph: true,
    expectField: 31.1324          // max(519.2, 533.5) / 17.1365
  }
};

/* The case the coronagraph rule exists for, reconstructed from the findings
   document. On today's responses the two rules differ by 9 per cent, which is
   not enough to prove that the right one is being applied — a check that can
   only pass by 9 per cent would also pass if the rules were swapped by
   accident. With the sun this far off centre the difference is 4.5x, and that
   is a difference a mistake cannot hide in. */
const OFF_CENTRE = {
  scale: 56.0, width: 1024, height: 1024,
  refPixelX: 186, refPixelY: 838, rsun: 17.1365,
  expectAsCoronagraph: 48.90,     // max(838, 838) / 17.1365
  expectAsDisc: 10.85             // min(186, 186) / 17.1365
};

async function load() {
  const stamp = '?v=' + Date.now() + Math.random();
  return {
    src: await import(SOURCE + stamp),
    fetch: await import(FETCH + stamp)
  };
}

async function run() {
  const { src, fetch: f } = await load();
  const results = [];
  const check = (n, ok, detail) => results.push({ n, ok, detail });

  // 1 — the field values, to two decimals, against what the findings recorded.
  {
    const wrong = [];
    for (const [name, fx] of Object.entries(FIXTURES)) {
      const g = src.deriveGeometry(fx, fx.coronagraph);
      if (Math.abs(g.nativeField - fx.expectField) > 0.001) {
        wrong.push(name + ': ' + g.nativeField.toFixed(4) + ' expected ' + fx.expectField);
      }
    }
    check(1, wrong.length === 0, wrong.join('; '));
  }

  // 2 — the distance chain. SDO orbits the earth, so its distance to the sun is
  // one AU to within the eccentricity of the earth's orbit. Landing on 0.9996
  // is what says rsun, scale and the arcsec conversion all agree.
  {
    const g = src.deriveGeometry(FIXTURES['AIA 171'], false);
    const ok = Math.abs(g.distanceAu - 0.9996) < 0.002;
    check(2, ok, ok ? '' : 'AIA distance came out at ' + g.distanceAu.toFixed(4) + ' AU');
  }

  // 3 — the coronagraph rule, on the case it exists for. Today's C3 response
  // is nearly centred, so the two rules agree to within 9 per cent and prove
  // nothing; OFF_CENTRE is the August geometry, where they differ by 4.5x.
  {
    const wrong = [];
    const asCorona = src.deriveGeometry(OFF_CENTRE, true).nativeField;
    const asDisc = src.deriveGeometry(OFF_CENTRE, false).nativeField;
    if (Math.abs(asCorona - OFF_CENTRE.expectAsCoronagraph) > 0.01) {
      wrong.push('coronagraph rule gave ' + asCorona.toFixed(2));
    }
    if (Math.abs(asDisc - OFF_CENTRE.expectAsDisc) > 0.01) {
      wrong.push('disc rule gave ' + asDisc.toFixed(2));
    }
    // And the source table has to know which sources the rule applies to, or a
    // correct rule is applied to the wrong instrument.
    if (!src.isCoronagraph(5) || !src.isCoronagraph(4)) wrong.push('LASCO not marked');
    if (src.isCoronagraph(10) || src.isCoronagraph(18)) wrong.push('a disc source is marked');
    check(3, wrong.length === 0, wrong.join('; '));
  }

  // 4 — texture size and image scale are inverses. Ask for a field at a texture
  // size, convert to arcsec per pixel, convert back, and the field must return.
  {
    const g = src.deriveGeometry(FIXTURES['AIA 171'], false);
    const wrong = [];
    for (const field of [1.1, 1.28, 1.65, 4]) {
      const px = src.textureSize(field, g.rsun, 2048);
      const scale = f.imageScaleFor(field, px, g.radiusArcsec);
      const back = (scale * px) / (2 * g.radiusArcsec);
      if (Math.abs(back - field) > 1e-9) {
        wrong.push('field ' + field + ' returned as ' + back);
      }
      if (px < 256 || px > 2048) wrong.push('texture size ' + px + ' out of range');
    }
    check(4, wrong.length === 0, wrong.join('; '));
  }

  // 5 — sharpness at its boundaries. The three verdicts have to change hands at
  // the stated ratios, not merely be produced.
  {
    const rsun = 1587;
    const wrong = [];
    // Comfortably supplied: green.
    let s = src.sharpness(2048, 1.28, 900, 1.65, rsun);
    if (s.verdict !== 'green') wrong.push('generous case read ' + s.verdict);
    // Screen asks well past what was fetched, but still within the source.
    s = src.sharpness(256, 1.28, 1800, 1.10, rsun);
    if (s.verdict !== 'amber') wrong.push('stretched case read ' + s.verdict);
    // Screen asks past the source itself: invention.
    s = src.sharpness(2048, 1.28, 4000, 0.2, rsun);
    if (s.verdict !== 'red') wrong.push('beyond-source case read ' + s.verdict);
    check(5, wrong.length === 0, wrong.join('; '));
  }

  // 6 — the timestamp handoff. getClosestImage answers with a space,
  // takeScreenshot demands a T and a Z, and that one character is the whole
  // difference between an image and a 400.
  {
    const wrong = [];
    if (src.toInstant('2026-09-08 11:59:57') !== '2026-09-08T11:59:57Z') {
      wrong.push('space form not converted');
    }
    if (src.toInstant('2026-09-08T11:59:57Z') !== '2026-09-08T11:59:57Z') {
      wrong.push('already-correct form was altered');
    }
    // And the result has to satisfy the proxy's own validator, or the two
    // agree with each other and not with the server.
    const policy = await import(join(ROOT, 'api/_helioviewer-policy.mjs') + '?v=' + Date.now());
    const params = new Map([
      ['date', src.toInstant('2026-09-08 11:59:57')], ['sourceId', '10']
    ]);
    const plan = policy.planRequest('getClosestImage',
      k => params.get(k) ?? null, params.keys());
    if (!plan.ok) wrong.push('the proxy rejects our own timestamp: ' + plan.error);
    check(6, wrong.length === 0, wrong.join('; '));
  }

  return results;
}

const DESCRIPTIONS = {
  1: 'the four field values, from real responses',
  2: "SDO's derived distance is 0.9996 AU",
  3: 'the coronagraph rule keeps the outer field',
  4: 'texture size and image scale invert each other',
  5: 'sharpness classifies at the right boundaries',
  6: 'the timestamp handoff, and the proxy accepts it'
};

/* Each break removes exactly one guarantee. An injection that changes nothing
   is the finding: it means the check never had teeth. */
const BREAKS = [
  {
    n: 1, file: SOURCE, what: 'use the coronagraph rule for disc instruments',
    edit: s => s.replace(
      '  const halfPx = coronagraph\n' +
      '    ? Math.max(Math.max(refX, width - refX), Math.max(refY, height - refY))\n' +
      '    : Math.min(Math.min(refX, width - refX), Math.min(refY, height - refY));',
      '  const halfPx = Math.max(Math.max(refX, width - refX), Math.max(refY, height - refY));')
  },
  {
    n: 3, file: SOURCE, what: 'use the disc rule for coronagraphs',
    edit: s => s.replace(
      '  const halfPx = coronagraph\n' +
      '    ? Math.max(Math.max(refX, width - refX), Math.max(refY, height - refY))\n' +
      '    : Math.min(Math.min(refX, width - refX), Math.min(refY, height - refY));',
      '  const halfPx = Math.min(Math.min(refX, width - refX), Math.min(refY, height - refY));')
  },
  {
    n: 2, file: SOURCE, what: 'use sin instead of tan for the distance',
    edit: s => s.replace('SOLAR_R_KM / Math.tan(radiusArcsec * SOLAR_ARCSEC)',
                         'SOLAR_R_KM / Math.sin(radiusArcsec * SOLAR_ARCSEC) * 1.01')
  },
  {
    n: 4, file: FETCH, what: 'drop the factor two from the image scale',
    edit: s => s.replace('return (2 * field * radiusArcsec) / texPx;',
                         'return (field * radiusArcsec) / texPx;')
  },
  {
    n: 5, file: SOURCE, what: 'never report red',
    edit: s => s.replace("verdict: wanted > ceiling ? 'red' : ",
                         "verdict: false ? 'red' : ")
  },
  {
    n: 6, file: SOURCE, what: 'stop converting the space to a T',
    edit: s => s.replace("return date.trim().replace(' ', 'T').replace(/Z?$/, 'Z');",
                         "return date.trim();")
  }
];

async function main() {
  if (!selftest) {
    console.log('check-sun-metadata — every solar quantity against its own data\n');
    const results = await run();
    for (const r of results) {
      report(r.ok ? 'ok' : 'fail', 'check ' + r.n + ' — ' + DESCRIPTIONS[r.n], r.detail);
    }
    if (live) await liveCheck();
    console.log(failures ? '\n' + failures + ' failed' : '\nall six green');
    process.exit(failures ? 1 : 0);
  }

  console.log('check-sun-metadata --selftest — every break must show\n');
  const baseline = await run();
  if (baseline.some(r => !r.ok)) {
    console.log('  FAIL  the unmodified modules are already red — fix that first');
    process.exit(1);
  }

  const originals = new Map();
  for (const file of new Set(BREAKS.map(b => b.file))) {
    originals.set(file, await readFile(file, 'utf8'));
  }

  let missed = 0;
  for (const brk of BREAKS) {
    const original = originals.get(brk.file);
    const broken = brk.edit(original);
    if (broken === original) {
      report('fail', 'break "' + brk.what + '" changed nothing',
             'the injection no longer matches the source');
      missed++;
      continue;
    }
    await writeFile(brk.file, broken);
    let caught = false;
    try {
      const results = await run();
      caught = results.some(r => r.n === brk.n && !r.ok);
    } catch {
      caught = true;
    } finally {
      await writeFile(brk.file, original);
    }
    report(caught ? 'ok' : 'fail',
      'check ' + brk.n + (caught ? ' catches: ' : ' MISSED: ') + brk.what);
    if (!caught) missed++;
  }

  for (const [file, text] of originals) await writeFile(file, text);
  console.log(missed ? '\n' + missed + ' break(s) went unnoticed' : '\nall breaks seen');
  process.exit(missed ? 1 : 0);
}

/* The fixtures are frozen; this asks the live API whether they still describe
   it. Separate because it needs a network and a running proxy, and a check that
   fails when the wifi does is a check people learn to ignore. */
async function liveCheck() {
  const { src } = { src: await import(SOURCE + '?live=' + Date.now()) };
  const base = process.env.TERRA_BASE || 'http://localhost:8771';
  try {
    const res = await fetch(base + '/api/helioviewer?endpoint=getClosestImage' +
      '&date=2026-09-08T12:00:00Z&sourceId=10');
    const meta = await res.json();
    const g = src.deriveGeometry(meta, false);
    const ok = Math.abs(g.nativeField - 1.28) < 0.02 && Math.abs(g.distanceAu - 0.9996) < 0.002;
    report(ok ? 'ok' : 'fail', 'live — AIA field ' + g.nativeField.toFixed(3) +
      ' R, distance ' + g.distanceAu.toFixed(4) + ' AU');
  } catch (e) {
    report('fail', 'live — could not reach ' + base, e.message);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
