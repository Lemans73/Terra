/* simplify-admin1.mjs — turn Natural Earth's admin-1 file into one Terra can ship.
 *
 *   node tools/simplify-admin1.mjs <path-to-ne_10m_admin_1_states_provinces.geojson>
 *   node tools/simplify-admin1.mjs --selftest
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT strip-geojson-props.mjs.
 * That tool throws away FIELDS and leaves every coordinate untouched — its whole
 * contract is that nothing changes shape. This one changes the shape on purpose,
 * so it has to be a separate step with its own numbers.
 *
 * THE SOURCE IS NOT IN THE REPO. Natural Earth's 10m admin-1 file is 40.7 MB and
 * covers 4596 regions across 253 countries; what Terra ships is the simplified
 * result. Fetch the source from natural-earth-vector when the asset needs to be
 * rebuilt:
 *
 *   https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/
 *     geojson/ne_10m_admin_1_states_provinces.geojson
 *
 * WHAT THE NUMBERS WERE, measured 2026-09-02 with brotli (which is what
 * terra.terryelemans.nl actually serves — verified, not assumed):
 *
 *     tolerance   raw        brotli     points kept
 *     0.5 km      10.97 MB   2.15 MB    44 %
 *     1 km         7.66 MB   1.54 MB    30 %
 *     2 km         5.17 MB   1.06 MB    19 %      <- shipped
 *     4 km         3.33 MB   0.64 MB    13 %
 *
 * 2 km is invisible at world and regional zoom and only starts to show at the
 * deepest satellite zoom, where a border may sit a couple of kilometres off the
 * river it follows. 4 km would have met the original budget but is a tenth of a
 * Dutch province wide, which reads as wrong the moment you zoom into a country.
 *
 * WHAT WAS TRIED AND REJECTED: dropping the name and admin fields saved 46 kB
 * (4 %), and filtering on Natural Earth's `min_zoom <= 8` saved 196 kB but lost
 * 127 of the 253 countries — which is the coverage hole this file exists to fill.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOEL = 'assets/geo/ne_10m_admin_1_states_provinces.geojson';

const TOLERANTIE = 0.02;   // graden ≈ 2 km aan de evenaar
const DECIMALEN = 4;       // ≈ 11 m, ruim onder de tolerantie
const MIN_RING = 4;        // een ring onder vier punten is geen vlak meer

/* ITERATIVE DOUGLAS-PEUCKER, and the iteration is not a style choice: Russia's
   outer ring runs to tens of thousands of points and a recursive split blows the
   stack there. A measurement that dies on its largest input has not measured the
   largest input. */
function vereenvoudig(punten, tol) {
  const n = punten.length;
  if (n < 3) return punten;
  const houd = new Uint8Array(n);
  houd[0] = houd[n - 1] = 1;
  const stapel = [[0, n - 1]];
  while (stapel.length) {
    const [a, b] = stapel.pop();
    if (b - a < 2) continue;
    const [x1, y1] = punten[a], [x2, y2] = punten[b];
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    let grootste = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = punten[i];
      const t = l2 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l2)) : 0;
      const d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
      if (d > grootste) { grootste = d; idx = i; }
    }
    if (grootste > tol) { houd[idx] = 1; stapel.push([a, idx], [idx, b]); }
  }
  const uit = [];
  for (let i = 0; i < n; i++) if (houd[i]) uit.push(punten[i]);
  return uit;
}

const rond = (p) => [+p[0].toFixed(DECIMALEN), +p[1].toFixed(DECIMALEN)];

/* A RING THAT COLLAPSES KEEPS ITS ORIGINAL POINTS. Simplifying a tiny island
   down to two points does not make it small, it makes it a line — and a line
   with a fill is a rendering artefact, not a saving. */
function loop(a, tol) {
  if (typeof a[0][0] === 'number') {
    const s = vereenvoudig(a, tol);
    return (s.length >= MIN_RING ? s : a).map(rond);
  }
  return a.map(x => loop(x, tol));
}

const telPunten = (a) => typeof a[0] === 'number' ? 1 : a.reduce((s, x) => s + telPunten(x), 0);
const telRingen = (a) => typeof a[0][0] === 'number' ? 1 : a.reduce((s, x) => s + telRingen(x), 0);

async function bouw(bron) {
  const geo = JSON.parse(await readFile(bron, 'utf8'));
  const f = geo.features;
  const puntenVoor = f.reduce((s, x) => s + telPunten(x.geometry.coordinates), 0);
  const ringenVoor = f.reduce((s, x) => s + telRingen(x.geometry.coordinates), 0);

  const uit = {
    type: 'FeatureCollection',
    features: f.map(x => ({
      type: 'Feature',
      /* THREE FIELDS OUT OF 121. `name` is what a label would say, `admin` is
         which country it belongs to, and that pair is what tells two regions
         called "Limburg" apart. Everything else Natural Earth ships — names in
         twenty languages, wikidata ids, five rank systems — Terra never reads. */
      properties: { name: x.properties.name, admin: x.properties.admin },
      geometry: { type: x.geometry.type, coordinates: loop(x.geometry.coordinates, TOLERANTIE) }
    }))
  };

  const puntenNa = uit.features.reduce((s, x) => s + telPunten(x.geometry.coordinates), 0);
  const ringenNa = uit.features.reduce((s, x) => s + telRingen(x.geometry.coordinates), 0);

  /* THE COUNTS THAT MAY NOT MOVE. Points are supposed to go down — that is the
     job. Features and rings are not: losing one is losing a region or a hole in
     one, and that is silent unless it is counted. */
  if (uit.features.length !== f.length) {
    throw new Error(`features ${uit.features.length} tegen ${f.length}`);
  }
  if (ringenNa !== ringenVoor) {
    throw new Error(`ringen ${ringenNa} tegen ${ringenVoor}`);
  }

  const tekst = JSON.stringify(uit);
  await writeFile(join(ROOT, DOEL), tekst);
  const landen = new Set(f.map(x => x.properties.admin)).size;
  console.log(`${DOEL}`);
  console.log(`  ${uit.features.length} regio's in ${landen} landen, ${ringenNa} ringen`);
  console.log(`  ${puntenNa} van ${puntenVoor} punten (${(100 * puntenNa / puntenVoor).toFixed(0)} %)`);
  console.log(`  ${tekst.length} bytes ruw, tolerantie ${TOLERANTIE}° ≈ ${Math.round(TOLERANTIE * 111)} km`);
}

/* THE SELF-TEST BREAKS WHAT IT WATCHES. A simplifier that returns its input
   unchanged would pass every count check above, so the test has to show that it
   actually removes something — and that it stops removing when told to. */
function selftest() {
  const fouten = [];
  // Een rechte lijn met tussenpunten hoort tot twee punten terug te vallen.
  const recht = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]];
  const r1 = vereenvoudig(recht, 0.01);
  if (r1.length !== 2) fouten.push(`rechte lijn gaf ${r1.length} punten in plaats van 2`);
  // Met tolerantie 0 mag er niets weg: elke afwijking is dan groter dan 0.
  const bocht = [[0, 0], [1, 0.5], [2, 0], [3, 0.5], [4, 0]];
  const r2 = vereenvoudig(bocht, 0);
  if (r2.length !== bocht.length) fouten.push(`tolerantie 0 gooide ${bocht.length - r2.length} punten weg`);
  // En een bocht die ruim binnen de tolerantie valt, hoort wél weg te vallen.
  const r3 = vereenvoudig(bocht, 1);
  if (r3.length !== 2) fouten.push(`grove tolerantie gaf ${r3.length} punten in plaats van 2`);
  // Een ring die te klein wordt houdt zijn eigen punten.
  const eiland = [[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]];
  const r4 = loop(eiland, TOLERANTIE);
  if (r4.length !== eiland.length) fouten.push(`klein eiland verloor punten: ${r4.length} van ${eiland.length}`);
  // En de stapelvariant moet een grote invoer overleven.
  const groot = Array.from({ length: 60000 }, (_, i) => [i * 1e-4, Math.sin(i) * 1e-3]);
  try { vereenvoudig(groot, 1e-4); } catch (e) { fouten.push(`60.000 punten: ${e.message}`); }

  if (fouten.length) { console.error('SELFTEST ROOD:'); fouten.forEach(f => console.error('  ' + f)); process.exit(1); }
  console.log('selftest groen: 5 controles');
}

const arg = process.argv[2];
if (arg === '--selftest') selftest();
else if (!arg) { console.error('gebruik: node tools/simplify-admin1.mjs <bronbestand> | --selftest'); process.exit(2); }
else bouw(arg).catch(e => { console.error(e.message); process.exit(1); });
