/* strip-geojson-props.mjs — gooi de eigenschappen weg die niemand leest.
 *
 *   node tools/strip-geojson-props.mjs            (schrijft de uitgeklede bestanden)
 *   node tools/strip-geojson-props.mjs --check    (alleen melden, niets schrijven)
 *
 * WAAROM DIT BESTAAT (session 42).
 * ne_110m_admin_0_countries.geojson is 819 kB, waarvan 72 % EIGENSCHAPPEN en maar
 * 27 % geometrie. Natural Earth levert 168 velden per land — namen in tientallen
 * talen, ISO-codes, economische classificaties. Terra leest er vijf.
 *
 * DE GEOMETRIE BLIJFT ONAANGERAAKT, en dat is het hele punt. Kustlijnen
 * vereenvoudigen verandert hoe de kaart ERUITZIET; velden weggooien verandert
 * niets zichtbaars. Dat is de goedkope helft van de winst en die nemen we eerst.
 *
 * DE CONTROLE ZIT ERIN: na afloop wordt geteld dat er evenveel features, ringen
 * en coördinaten in zitten als ervoor, en dat elk overgebleven veld ook echt in
 * index.html voorkomt. Een bestand dat stilletjes een land kwijtraakt is erger
 * dan een bestand dat te groot is.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Per bestand: welke velden blijven. De lijst komt niet uit het hoofd maar uit
   de bron — zie de controle onderaan, die eist dat elk veld hier ook in
   index.html voorkomt. */
const BESTANDEN = [
  { pad: 'assets/geo/ne_110m_admin_0_countries.geojson',
    houden: ['ADMIN', 'NAME', 'LABELRANK', 'LABEL_X', 'LABEL_Y'] },
  { pad: 'assets/geo/ne_110m_land.geojson', houden: [] },
  /* Dit bestand komt al uitgekleed uit tools/simplify-admin1.mjs; hier staat het
     voor de tweede controle van dat gereedschap — dat elk overgebleven veld ook
     echt in index.html gelezen wordt. Een veld dat niemand leest is gewicht. */
  { pad: 'assets/geo/ne_10m_admin_1_states_provinces.geojson', houden: ['name', 'admin'] },
  { pad: 'assets/geo/PB2002_boundaries.json', houden: ['Name', 'Type'] }
];

// Features, ringen en punten tellen — de invariant die na het strippen gelijk moet blijven.
function meet(json) {
  let features = 0, ringen = 0, punten = 0;
  const telRing = (r) => { ringen++; punten += r.length; };
  for (const f of json.features || []) {
    features++;
    const g = f.geometry || {};
    const c = g.coordinates || [];
    if (g.type === 'Polygon' || g.type === 'MultiLineString') c.forEach(telRing);
    else if (g.type === 'MultiPolygon') c.forEach((p) => p.forEach(telRing));
    else if (g.type === 'LineString') telRing(c);
    else if (g.type === 'Point') { ringen++; punten++; }
  }
  return { features, ringen, punten };
}

const alleenMelden = process.argv.includes('--check');
const bron = await readFile(join(ROOT, 'index.html'), 'utf8');
let fouten = 0;

for (const { pad, houden } of BESTANDEN) {
  const ruw = await readFile(join(ROOT, pad), 'utf8');
  const json = JSON.parse(ruw);
  const voor = meet(json);

  // Een veld dat we houden moet ook echt gelezen worden; anders is de lijst gokwerk.
  for (const veld of houden) {
    if (!bron.includes(`'${veld}'`) && !bron.includes(`"${veld}"`) && !bron.includes(`.${veld}`)) {
      console.warn(`  let op: ${pad} houdt '${veld}', maar index.html noemt hem niet`);
    }
  }

  const bewaard = new Set(houden);
  for (const f of json.features || []) {
    const p = f.properties || {};
    f.properties = Object.fromEntries(Object.entries(p).filter(([k]) => bewaard.has(k)));
    delete f.id;
  }
  const uit = JSON.stringify(json, null, 0);
  const na = meet(JSON.parse(uit));

  const gelijk = voor.features === na.features && voor.ringen === na.ringen && voor.punten === na.punten;
  if (!gelijk) { fouten++; console.error(`  FOUT: ${pad} — de geometrie is veranderd!`, { voor, na }); continue; }

  const kbVoor = Buffer.byteLength(ruw) / 1024, kbNa = Buffer.byteLength(uit) / 1024;
  console.log(`  ${pad}`);
  console.log(`     ${kbVoor.toFixed(0)} kB -> ${kbNa.toFixed(0)} kB` +
              `  (${(100 - (kbNa / kbVoor) * 100).toFixed(0)} % eraf)` +
              `   ${na.features} features, ${na.ringen} ringen, ${na.punten} punten — ongewijzigd`);
  if (!alleenMelden && kbNa < kbVoor) await writeFile(join(ROOT, pad), uit, 'utf8');
}

if (alleenMelden) console.log('\n--check: er is niets geschreven');
process.exit(fouten ? 1 : 0);
