/* check-indicator-modules.mjs — de EQ-indicator-modules tegen hun eigen regels.
 *
 *   node tools/check-indicator-modules.mjs
 *   node tools/check-indicator-modules.mjs --selftest
 *
 * WAAROM DIT BESTAAT (sessie 40).
 * Een backtick in GLSL-commentaar sluit de template literal af waar de shader in
 * staat. De module laadt dan niet meer en de browser toont een lege pagina zonder
 * een foutmelding die naar die regel wijst. In de workbench is dat twee keer
 * gebeurd; dit vangt het in een seconde.

   DRIE CONTROLES, en elke controle meldt zélf of hij iets te toetsen HAD. Een
   controle op een lege verzameling zegt "ok" en toetst niets — precies de val
   waar dit project in vier sessies dertien keer in is gelopen. Vandaar `n.v.t.`
   als aparte uitkomst.

     1  parseert de module?          breek: backtick BINNEN een GLSL-literal
     2  bestaat elke PARAMS-sleutel? breek: hernoem er een
     3  staat er een sleutel dubbel? breek: plak een uniform-regel twee keer

   DE SELFTEST DRAAIT ELKE BREUK APART. Alle drie tegelijk aanbrengen leek
   goedkoper maar deugt niet: een bestand dat niet parseert, maakt de andere
   twee controles betekenisloos, en dan lijkt het of ze niets toetsen terwijl
   ze niet aan bod kwamen. Per breuk één run, en per run precies één verwachte
   uitslag.

   Draaien:  node tools/check-indicator-modules.mjs            (exit 0 = groen)
             node tools/check-indicator-modules.mjs --selftest (elke breuk moet zijn controle laten uitslaan) */

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Vanaf dit bestand naar de projectwortel, zodat hij overal draait waar de repo staat.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = [
  'js/layers/quake-indicator-shaders.js',
  'js/layers/quake-indicator.js'
];

// --- de drie controles -----------------------------------------------------
// Elke controle geeft { staat: 'ok'|'fout'|'nvt', tekst } terug en schrijft niets.

async function toetsParse(pad, bron) {
  const tmp = `${process.env.TMPDIR || '/tmp'}/wb-${pad.replace(/[^a-z]/gi, '_')}.mjs`;
  await writeFile(tmp, bron);
  try {
    execFileSync('node', ['--check', tmp], { stdio: 'pipe' });
    return { staat: 'ok', tekst: 'parseert' };
  } catch (e) {
    const regel = String(e.stderr || e).split('\n').find(r => /Error|Unexpected|Invalid/.test(r)) || '?';
    return { staat: 'fout', tekst: `parseert NIET — ${regel.trim()}` };
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

function toetsParams(pad, bron, bekend) {
  const gebruikt = new Set();
  // `P.` is de lokale alias voor PARAMS in de laagmodule; beide vormen tellen.
  for (const m of bron.matchAll(/\b(?:P|PARAMS)\.([A-Za-z_][A-Za-z0-9_]*)/g)) gebruikt.add(m[1]);
  if (!gebruikt.size) return { staat: 'nvt', tekst: 'leest geen PARAMS' };
  const mist = [...gebruikt].filter(k => !bekend.has(k));
  return mist.length
    ? { staat: 'fout', tekst: `${mist.length} sleutel(s) niet in PARAMS — ${mist.join(', ')}` }
    : { staat: 'ok', tekst: `alle ${gebruikt.size} PARAMS-sleutels bestaan` };
}

/* Een objectliteral met een dubbele sleutel is geldige JS: de tweede wint stil.
   Precies zo staat er in de workbench een dubbele uStackSpread.

   EEN MINI-PARSER OP HAAKJESDIEPTE en geen regex over het hele blok. Een eerdere
   versie zocht naar `const xUniforms = {` en miste daarmee elke
   `Object.assign(x, { ... })` — de vorm die deze laag werkelijk gebruikt. Die
   controle zei "ok" over nul objecten, en dat is precies wat de selftest hier
   aan het licht bracht. */
function toetsDubbel(pad, bron) {
  const stapel = [];              // per open accolade een Map van sleutel → aantal
  const dubbel = [];
  let objecten = 0, sleutels = 0, inLiteral = false;

  for (const regel of bron.split('\n')) {
    // Template literals overslaan: daar staat GLSL in, geen JS-object.
    const ticks = (regel.match(/`/g) || []).length;
    if (inLiteral) { if (ticks % 2) inLiteral = false; continue; }
    if (ticks % 2) inLiteral = true;
    const kaal = regel.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');

    const sleutel = kaal.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/);
    if (sleutel && stapel.length) {
      const top = stapel[stapel.length - 1];
      top.set(sleutel[1], (top.get(sleutel[1]) || 0) + 1);
      sleutels++;
    }
    for (const ch of kaal) {
      if (ch === '{') stapel.push(new Map());
      else if (ch === '}' && stapel.length) {
        const top = stapel.pop();
        if (top.size) objecten++;
        for (const [k, n] of top) if (n > 1) dubbel.push(`${k} (${n}x)`);
      }
    }
  }
  if (!sleutels) return { staat: 'nvt', tekst: 'geen objectliterals met sleutels' };
  return dubbel.length
    ? { staat: 'fout', tekst: `DUBBELE sleutel(s) — ${[...new Set(dubbel)].join(', ')}` }
    : { staat: 'ok', tekst: `${sleutels} sleutels over ${objecten} objecten, geen dubbele` };
}

/* --- de breuken ------------------------------------------------------------
   Elke breuk geeft null terug als er in dit bestand niets te breken viel; dan
   heeft de bijbehorende controle daar niets te toetsen en zegt de selftest dat
   ook, in plaats van het als geslaagd te tellen. */
const BREUKEN = [
  {
    naam: 'backtick in een GLSL-literal',
    controle: 'parse',
    breek: b => {
      // Binnen de eerste template literal, niet ervoor of erna.
      const m = b.match(/= \/\* glsl \*\/`\n/);
      if (!m) return null;
      const i = m.index + m[0].length;
      return b.slice(0, i) + '// hier staat een ` en die sluit de literal\n' + b.slice(i);
    }
  },
  {
    naam: 'PARAMS-sleutel hernoemd',
    controle: 'params',
    breek: b => /\b(?:P|PARAMS)\.[A-Za-z_]/.test(b)
      ? b.replace(/\b(P|PARAMS)\.([A-Za-z_][A-Za-z0-9_]*)/, '$1.ditBestaatNiet') : null
  },
  {
    naam: 'uniform-regel gedupliceerd',
    controle: 'dubbel',
    breek: b => /^(\s+)(u[A-Z]\w*\s*:\s*\{[^}]*\},)$/m.test(b)
      ? b.replace(/^(\s+)(u[A-Z]\w*\s*:\s*\{[^}]*\},)$/m, '$1$2\n$1$2') : null
  }
];

async function draaiAlle(pad, bron, bekend) {
  return {
    parse:  await toetsParse(pad, bron),
    params: toetsParams(pad, bron, bekend),
    dubbel: toetsDubbel(pad, bron)
  };
}

// --- draaien ---------------------------------------------------------------
async function paramsSleutels() {
  const bron = await readFile(`${ROOT}/js/config.js`, 'utf8');
  const start = bron.indexOf('export const PARAMS = {');
  if (start < 0) throw new Error('PARAMS niet gevonden in js/config.js');
  const set = new Set();
  for (const m of bron.slice(start).matchAll(/^\s{2}([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)) set.add(m[1]);
  return set;
}

const TAG = { ok: '  ok    ', fout: '  FOUT  ', nvt: '  n.v.t.' };
const selftest = process.argv.includes('--selftest');
const bekend = await paramsSleutels();
console.log(`PARAMS telt ${bekend.size} sleutels\n`);

const bronnen = new Map();
for (const pad of MODULES) {
  try { bronnen.set(pad, await readFile(`${ROOT}/${pad}`, 'utf8')); }
  catch { console.log(TAG.fout + `${pad} bestaat nog niet`); process.exit(1); }
}

if (!selftest) {
  let fouten = 0, gedaan = 0;
  for (const [pad, bron] of bronnen) {
    console.log(pad);
    const r = await draaiAlle(pad, bron, bekend);
    for (const k of ['parse', 'params', 'dubbel']) {
      console.log(TAG[r[k].staat] + r[k].tekst);
      if (r[k].staat === 'fout') fouten++;
      if (r[k].staat !== 'nvt') gedaan++;
    }
    console.log('');
  }
  console.log(fouten ? `${fouten} fout(en).` : `Alles groen (${gedaan} controles).`);
  process.exit(fouten ? 1 : 0);
}

// DE CONTROLE OP DE CONTROLE: per breuk één run, en die ene controle MOET uitslaan.
let mis = 0, geldig = 0;
for (const [pad, bron] of bronnen) {
  console.log(pad);
  for (const b of BREUKEN) {
    const kapot = b.breek(bron);
    if (kapot === null) {
      console.log(TAG.nvt + `${b.naam} — niets te breken in dit bestand`);
      continue;
    }
    const r = await draaiAlle(pad, kapot, bekend);
    const uitslag = r[b.controle];
    geldig++;
    const goed = uitslag.staat === 'fout';
    if (!goed) mis++;
    console.log((goed ? TAG.ok : TAG.fout) +
      `${b.naam} → controle "${b.controle}" zegt ${uitslag.staat.toUpperCase()}` +
      (goed ? '' : '  ← DEZE CONTROLE TOETST NIETS'));
  }
  console.log('');
}
console.log(mis === 0 && geldig > 0
  ? `SELFTEST GESLAAGD — alle ${geldig} breuken sloegen door naar hun controle.`
  : `SELFTEST MISLUKT — ${mis} van de ${geldig} breuken bleef onopgemerkt.`);
process.exit(mis === 0 && geldig > 0 ? 0 : 1);
