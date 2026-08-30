/* check-tile-sources.mjs — de tegelschil tegen zijn eigen regels.
 *
 *   node tools/check-tile-sources.mjs
 *   node tools/check-tile-sources.mjs --selftest
 *
 * WAAROM DIT BESTAAT.
 * Twee van de vier controles hieronder gaan over fouten die NIETS kapotmaken.
 * Een bron die terugvalt op een ander raster toont gewoon beeld — alleen van de
 * verkeerde plek op aarde, en niemand die het merkt. Een bron zonder licentie
 * rendert prima en is een juridisch probleem. Dat soort fout overleeft een
 * review; een controle vangt hem in een seconde.
 *
 * VIER CONTROLES, en elk meldt zelf of hij iets te toetsen HAD. Een controle op
 * een lege verzameling zegt "ok" en toetst niets — vandaar `n.v.t.` als aparte
 * uitkomst.
 *
 *   1  parseert elke module?                breek: haal een haakje weg
 *   2  valt elke fallback binnen zijn raster? breek: wijs er een naar `gibs`
 *   3  heeft elke bron naam en licentie?    breek: haal er een weg
 *   4  staat de bol-tak van de shader er nog? breek: haal `vWorldUv = uv` weg
 *
 * CONTROLE 4 IS GEEN BYTE-VERGELIJKING, en dat is met opzet. De shader draagt
 * sinds de tegelschil een `#ifdef TILE_MODE`; de bol compileert de `#else`-tak en
 * die MOET `vWorldUv` gelijkstellen aan `uv`. Gebeurt dat niet, dan sampelen de
 * nacht-, wolken-, specular- en reliëfkaart op een varying die nooit gevuld is —
 * en dat is zwart, niet een foutmelding.
 *
 * Draaien:  node tools/check-tile-sources.mjs            (exit 0 = groen)
 *           node tools/check-tile-sources.mjs --selftest (elke breuk moet uitslaan)
 */

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = [
  'js/layers/tile-shell/sources.js',
  'js/layers/tile-shell/quadtree.js',
  'js/layers/tile-shell/loader.js',
  'js/layers/tile-shell/cache.js',
  'js/layers/tile-shell/shell.js'
];
const SHADER = 'js/shaders.js';

const selftest = process.argv.includes('--selftest');

function meld(uitkomst, tekst, extra) {
  const merk = uitkomst === 'ok' ? '  ok   ' : uitkomst === 'nvt' ? '  n.v.t.' : '  FOUT ';
  console.log(merk + ' ' + tekst + (extra ? ' — ' + extra : ''));
  return uitkomst === 'fout' ? 1 : 0;
}

/* 1. Parseert elke module? Een module die niet laadt geeft in de browser een
   lege pagina zonder regelnummer dat ergens naar wijst. */
async function toetsParse(paden) {
  let fout = 0, gezien = 0;
  for (const rel of paden) {
    let bron;
    try { bron = await readFile(join(ROOT, rel), 'utf8'); }
    catch { fout += meld('fout', rel, 'bestaat niet'); continue; }
    gezien++;
    const tmp = `${process.env.TMPDIR || '/tmp'}/terra-tile-${rel.replace(/\W/g, '_')}.mjs`;
    await writeFile(tmp, bron);
    try { execFileSync('node', ['--check', tmp], { stdio: 'pipe' }); fout += meld('ok', rel + ' parseert'); }
    catch (e) {
      const m = String(e.stderr || e).split('\n').find((r) => /Error|Unexpected|Invalid/.test(r)) || '?';
      fout += meld('fout', rel + ' parseert NIET', m.trim());
    } finally { await unlink(tmp).catch(() => {}); }
  }
  if (!gezien) fout += meld('nvt', 'parse', 'geen modules gevonden');
  return fout;
}

/* 2 en 3. Het broncontract, uit de module zelf. checkSources() draait ook bij het
   opstarten van de app; hier draait hij vóór de commit. */
async function toetsContract(sourcesPad) {
  const mod = await import('file://' + join(ROOT, sourcesPad) + '?t=' + process.hrtime.bigint());
  const aantal = Object.keys(mod.TILE_SOURCES).length;
  if (!aantal) return meld('nvt', 'broncontract', 'geen bronnen');
  const problemen = mod.checkSources();
  const rasterFouten = problemen.filter((p) => /grid|raster|fallback/.test(p));
  const licentieFouten = problemen.filter((p) => /attribution/.test(p));
  let fout = 0;
  fout += rasterFouten.length
    ? meld('fout', 'terugval binnen hetzelfde raster', rasterFouten.join('; '))
    : meld('ok', `terugval binnen hetzelfde raster (${aantal} bronnen)`);
  fout += licentieFouten.length
    ? meld('fout', 'naam en licentie per bron', licentieFouten.join('; '))
    : meld('ok', `naam en licentie per bron (${aantal} bronnen)`);
  return fout;
}

/* 4. De bol-tak van dayNightShader. Zie de noot bovenaan waarom dit geen
   byte-vergelijking is. */
async function toetsShader(pad) {
  const bron = await readFile(join(ROOT, pad), 'utf8');
  const heeftIfdef = /#ifdef\s+TILE_MODE/.test(bron);
  if (!heeftIfdef) return meld('nvt', 'bol-tak van de shader', 'geen TILE_MODE in ' + pad);
  const elseTak = /#else\s*\n\s*vUv\s*=\s*uv;\s*\n\s*vWorldUv\s*=\s*uv;/.test(bron);
  return elseTak
    ? meld('ok', 'bol-tak zet vUv en vWorldUv allebei op uv')
    : meld('fout', 'bol-tak van de shader', 'de #else zet vUv/vWorldUv niet allebei op uv');
}

async function draai(paden = MODULES, sourcesPad = MODULES[0], shaderPad = SHADER) {
  let fout = 0;
  fout += await toetsParse(paden);
  fout += await toetsContract(sourcesPad);
  fout += await toetsShader(shaderPad);
  return fout;
}

if (!selftest) {
  const fout = await draai();
  console.log(fout ? `\n${fout} controle(s) rood.` : '\nAlles groen (5 controles).');
  process.exit(fout ? 1 : 0);
} else {
  /* ELKE BREUK APART, en dat is niet duurder maar juister: een module die niet
     parseert maakt de contract-controle betekenisloos, en dan lijkt het of die
     niets toetst terwijl hij niet aan bod kwam. */
  console.log('zelftest — elke breuk MOET zijn controle laten uitslaan\n');
  const gevallen = [
    /* EEN ECHTE SYNTAXFOUT, en niet een backtick in commentaar: deze modules
       dragen geen template literals, dus daar breekt een backtick niets. De
       zelftest wees dat zelf aan — het geval ging er ongezien doorheen omdat er
       niets te breken viel. Voor de GLSL-literals is check-template-backticks
       de vangrail. */
    ['een haakje weg (syntaxfout)', MODULES[1],
     (s) => s.replace('function buildRoots() {', 'function buildRoots( {')],
    ['fallback naar een ander raster', MODULES[0],
     (s) => s.replace("fallback: 'eox-bluemarble',", "fallback: 'eox-gibs-nep',")
             .replace("'eox-bluemarble': {", "'eox-gibs-nep': { grid: 'gibs', minLevel: 1, maxLevel: 8, fallback: null, attribution: { name: 'x', licence: 'y' } },\n  'eox-bluemarble': {")],
    ['een bron zonder licentie', MODULES[0],
     (s) => s.replace("licence: 'CC BY-NC-SA 4.0', note: 'Contains modified Copernicus Sentinel data'", "note: 'Contains modified Copernicus Sentinel data'")],
    ['de bol-tak van de shader gesloopt', SHADER,
     (s) => s.replace('vUv = uv;\n        vWorldUv = uv;', 'vUv = uv;')]
  ];
  let mis = 0;
  for (const [naam, rel, breek] of gevallen) {
    const pad = join(ROOT, rel);
    const origineel = await readFile(pad, 'utf8');
    const kapot = breek(origineel);
    if (kapot === origineel) { console.log(`  MISLUKT ${naam} — er viel niets te breken`); mis++; continue; }
    await writeFile(pad, kapot);
    let fout = 0;
    try { fout = await draai(); } catch { fout = 1; }   // een import die klapt telt als uitslag
    finally { await writeFile(pad, origineel); }
    if (fout) console.log(`  ok      ${naam} → gezien`);
    else { console.log(`  MISLUKT ${naam} → GING ER ONGEZIEN DOORHEEN`); mis++; }
    console.log('');
  }
  console.log(mis ? `SELFTEST MISLUKT — ${mis} breuk(en) ongezien.`
                  : `SELFTEST GESLAAGD — alle ${gevallen.length} breuken sloegen door naar hun controle.`);
  process.exit(mis ? 1 : 0);
}
