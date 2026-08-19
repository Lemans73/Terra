// check-magnetosphere-sync.mjs — houdt de gekopieerde fysicalaag tegen de PoC.
//
//   node tools/check-magnetosphere-sync.mjs
//
// WAAROM DIT BESTAAT
// js/compute/magnetosphere/ is een KOPIE uit de magnetosfeer-PoC, byte voor byte.
// De PoC is de source of truth: daar staan de asserties tegenaan, en die toetsen
// het verscheepte bestand. Loopt de PoC vooruit, dan draait Terra iets anders dan
// wat getoetst is — en dat merkt niemand, want beide kanten kloppen op zichzelf.
// Precies de fout die de PoC in zijn eigen sessie 32 ving.
//
// WAT "NIET KUNNEN METEN" BETEKENT
// Staat de PoC er niet — een andere machine, een kloon zonder de vault — dan is
// dat GEEN groen. Een toets die niets kan lezen bewijst niets, en hem stil laten
// slagen is hoe een controle in een vinkje verandert. Exitcode 2 in dat geval,
// met de reden erbij; 1 bij echte drift, 0 alleen als er werkelijk vergeleken is.

import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KOPIE = join(ROOT, 'js/compute/magnetosphere');
const POC = join(homedir(),
  'Documents/_werk/_ObsidianVault/apps/magnetosphere-poc-terra');

// Welk bestand hier komt van welk pad daar. Niet af te leiden uit de naam:
// `chart.js` komt uit `lib/`, de rest uit `terra/`.
const HERKOMST = {
  'core.js':     'terra/core.js',
  'data.js':     'terra/data.js',
  'chart.js':    'lib/chart.js',
  'sector.js':   'lib/sector.js',
  'strip.js':    'terra/strip.js',
  'overlay.js':  'terra/overlay.js',
  'registry.js': 'terra/registry.js'
};

const md5 = (buf) => createHash('md5').update(buf).digest('hex');

// Wat er in de map ligt en niet in de tabel staat, is net zo goed drift: iemand
// heeft dan een bestand toegevoegd zonder zijn herkomst op te schrijven.
let aanwezig;
try { aanwezig = (await readdir(KOPIE)).filter(n => n.endsWith('.js')); }
catch {
  console.error(`kan niet toetsen: de kopie is hier niet te vinden.\n  ${KOPIE}`);
  console.error('  Dit is GEEN "in sync" — er is niets vergeleken.');
  process.exit(2);
}
const onbekend = aanwezig.filter(n => !HERKOMST[n]);

let gelijk = 0, anders = [], ontbreekt = [];
for (const [naam, bron] of Object.entries(HERKOMST)) {
  let hier, daar;
  try { hier = await readFile(join(KOPIE, naam)); }
  catch { ontbreekt.push(`${naam} — ontbreekt in js/compute/magnetosphere/`); continue; }
  try { daar = await readFile(join(POC, bron)); }
  catch {
    console.error(`kan niet toetsen: de PoC is hier niet te vinden.\n  ${join(POC, bron)}`);
    console.error('  Dit is GEEN "in sync" — er is niets vergeleken.');
    process.exit(2);
  }
  if (md5(hier) === md5(daar)) gelijk++;
  else anders.push(`${naam}  kopie ${md5(hier)}  PoC ${md5(daar)}  (${bron})`);
}

for (const r of ontbreekt) console.error('ontbreekt: ' + r);
for (const r of anders) console.error('DRIFT: ' + r);
for (const n of onbekend) console.error(`onbekend: ${n} staat in de map maar niet in HERKOMST`);

if (anders.length || ontbreekt.length || onbekend.length) {
  console.error(`\n${gelijk} gelijk, ${anders.length} afwijkend, ` +
    `${ontbreekt.length} ontbrekend, ${onbekend.length} onbekend.`);
  console.error('Wijzig de kopie niet: verbeter in de PoC, toets daar, kopieer opnieuw.');
  process.exit(1);
}
console.log(`magnetosfeer-fysicalaag: ${gelijk} bestanden byte-identiek aan de PoC`);
