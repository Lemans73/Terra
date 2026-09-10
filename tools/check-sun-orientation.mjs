/* check-sun-orientation.mjs — does the on-screen readout say the right thing?
 *
 *   node tools/check-sun-orientation.mjs
 *   node tools/check-sun-orientation.mjs --selftest
 *
 * WHY THIS EXISTS.
 * This block is the only place in Terra that tells a viewer, without being
 * asked, that what they are looking at is a photograph and not a measurement.
 * Every way of getting it wrong produces a screen that looks fine:
 *
 *   - The wrong kicker turns a drawing into "image data", or an instrument
 *     frame into a drawing. Both are false, in opposite directions.
 *   - The occulter number. C2 blanks 2.40 R☉ and C3 blanks 4.67; stacked, the
 *     inner one fills the outer one's hole and what stays blank is 2.40. Take
 *     the largest instead of the smallest and the line states a wrong number
 *     with complete confidence — and it will be wrong by two solar radii.
 *   - The occulter line at all, next to a disc source. AIA images the disc, so
 *     there is no blank centre; announcing one sends the viewer looking for a
 *     hole that is not there.
 *   - The sharpness verdict. Two slots, one green and one red, is a red
 *     picture: the weakest layer is the one that misleads.
 *
 *   1  no frames                → drawn sun, region count
 *   2  a disc frame             → image data, provenance, sharpness, texels
 *   3  coronagraphs only        → the SMALLEST occulter
 *   4  coronagraph + disc       → no occulter line at all
 *   5  mixed verdicts           → the worst one wins
 *
 * THE STATES BELOW ARE HAND-BUILT AND THAT IS THE POINT. They carry the numbers
 * measured in session 49 — C2 at 2.40, C3 at 4.67 — so the check fails if the
 * rule stops matching the instruments rather than if the code stops matching
 * itself.
 *
 * Run:  node tools/check-sun-orientation.mjs            (exit 0 = green)
 *       node tools/check-sun-orientation.mjs --selftest (every break must show)
 */

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = 'js/ui/solar-orient.js';

const selftest = process.argv.includes('--selftest');

function report(ok, text, extra) {
  console.log((ok ? '  ok   ' : '  FAIL ') + ' ' + text + (extra ? ' — ' + extra : ''));
  return ok ? 0 : 1;
}

const slot = (over) => ({
  name: 'AIA 193',
  observed: '2026-09-10T14:47:29.000Z',
  ageMinutes: 45,
  coronagraph: false,
  occulter: null,
  earthTexels: 15.2,
  sharpness: { verdict: 'green', ratio: 0.6, wanted: 500, supplied: 800, ceiling: 1589 },
  ...over
});

const C2 = slot({ name: 'LASCO C2', coronagraph: true, occulter: 2.40, earthTexels: 0.4 });
const C3 = slot({ name: 'LASCO C3', coronagraph: true, occulter: 4.67, earthTexels: 0.1,
                  sharpness: { verdict: 'red', ratio: 3.2, wanted: 800, supplied: 250, ceiling: 35 } });

const text = (rows) => rows.map(r => r.text).join(' | ');

function run(orientLines) {
  let bad = 0;

  // 1 — nothing fetched. The drawn sun is a model and the caps on it are not.
  {
    const rows = orientLines({ spots: { drawn: 9 }, slotDetail: [null, null, null] });
    const t = text(rows);
    bad += report(/DRAWN SUN/.test(t) && /9 active regions/.test(t) && !/IMAGE DATA/.test(t),
                  'no frames → drawn sun and the region count', t);
  }

  // 2 — one disc frame. Everything a viewer needs without opening a panel.
  {
    const t = text(orientLines({ spots: { drawn: 9 }, slotDetail: [slot({}), null, null] }));
    bad += report(/IMAGE DATA/.test(t) && /AIA 193 · 14:47 UTC · 45 min old/.test(t)
                  && /sharp at this zoom/.test(t) && /Earth ≈ 15 texels/.test(t)
                  && !/occulter/.test(t),
                  'a disc frame → image data, provenance, sharpness, texels', t);
  }

  // 3 — the stacked coronagraphs. 2.40 and not 4.67.
  {
    const t = text(orientLines({ spots: { drawn: 9 }, slotDetail: [C3, C2, null] }));
    bad += report(/Blank within 2\.4 R☉/.test(t) && !/4\.7/.test(t),
                  'coronagraphs only → the smallest occulter (2.4)', t);
  }

  // 4 — a disc in the stack fills the hole, so there is nothing to explain.
  {
    const t = text(orientLines({ spots: { drawn: 9 }, slotDetail: [C3, C2, slot({})] }));
    bad += report(!/occulter/.test(t) && /Earth ≈ 15 texels/.test(t),
                  'coronagraph + disc → no occulter line', t);
  }

  // 5 — one red layer makes a red picture.
  {
    const t = text(orientLines({ spots: { drawn: 9 }, slotDetail: [slot({}), C3, null] }));
    bad += report(/zoomed past what the source holds/.test(t) && !/sharp at this zoom/.test(t),
                  'mixed verdicts → the worst one wins', t);
  }

  return bad;
}

/* THE CHECK ON THE CHECK. Every break below MUST show. The breaks go on a COPY
   of the module, so an interrupted selftest leaves nothing damaged behind. */
async function selftestRun() {
  const src = await readFile(join(ROOT, MODULE), 'utf8');
  const tmp = 'js/ui/__orient-selftest.js';

  const breaks = [
    { name: 'the largest occulter instead of the smallest',
      edit: (s) => s.replace('Math.min(...occs)', 'Math.max(...occs)') },
    { name: 'the occulter line next to a disc source',
      edit: (s) => s.replace('if (!discs.length && occs.length)', 'if (occs.length)') },
    { name: 'the best sharpness verdict instead of the worst',
      edit: (s) => s.replace('> VERDICT_RANK[a]', '< VERDICT_RANK[a]') },
    { name: 'the drawn sun calling itself image data',
      edit: (s) => s.replace("text: 'DRAWN SUN — MEASURED REGIONS'",
                             "text: 'IMAGE DATA — NOT MEASUREMENTS'") },
    { name: 'the age dropped from the provenance line',
      edit: (s) => s.replace(" + ' · ' + ageText(d.ageMinutes)", '') }
  ];

  let missed = 0;
  for (const b of breaks) {
    await writeFile(join(ROOT, tmp), b.edit(src));
    let bad = 0;
    try {
      const mod = await import('../' + tmp + '?v=' + Date.now());
      bad = run(mod.orientLines);
    } catch { bad = 1; }
    finally { await unlink(join(ROOT, tmp)).catch(() => {}); }
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
  const { orientLines } = await import('../' + MODULE);
  process.exit(run(orientLines) ? 1 : 0);
}
