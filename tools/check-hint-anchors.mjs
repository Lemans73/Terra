/* check-hint-anchors.mjs — wijst de rondleiding nog naar bestaande bediening?
 *
 *   node tools/check-hint-anchors.mjs
 *   node tools/check-hint-anchors.mjs --selftest
 *
 * WAAROM DIT BESTAAT.
 * Deze fout maakt NIETS kapot, en dat is precies het probleem. `js/ui/hints.js`
 * laat een stap weg zodra zijn anker niet gevonden wordt — dat moet ook, want
 * een halve rondleiding is beter dan een gebroken. Maar het gevolg is dat een
 * hernoemde of verplaatste id de uitleg stil inkort: geen foutmelding, geen
 * lege plek, alleen vijf bolletjes waar er zes hoorden te staan. Zoiets
 * overleeft elke review en valt pas op als iemand de rondleiding uitloopt.
 *
 * VIER CONTROLES, en elk meldt zelf of hij iets te toetsen HAD. Een controle op
 * een lege verzameling zegt "ok" en toetst niets — vandaar `n.v.t.` als aparte
 * uitkomst. Zie de noot bovenaan check-tile-sources.mjs.
 *
 *   1  parseert de module?              breek: haal een haakje weg
 *   2  bestaat elk anker in index.html? breek: verzin een id
 *   3  draagt elke stap tekst?          breek: maak een `text` leeg
 *   4  is elk anker uniek?              breek: laat twee stappen hetzelfde
 *                                              anker delen
 *
 * CONTROLE 4 LIJKT OVERBODIG EN IS HET NIET. Twee stappen op één anker geven
 * een rondleiding die twee keer op dezelfde plek stilstaat — zichtbaar voor een
 * bezoeker, onzichtbaar in de broncode zodra de lijst voorbij een schermlengte
 * groeit.
 *
 * Draaien:  node tools/check-hint-anchors.mjs            (exit 0 = groen)
 *           node tools/check-hint-anchors.mjs --selftest (elke breuk moet uitslaan)
 */

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = 'js/ui/hints.js';
const MARKUP = 'index.html';

const selftest = process.argv.includes('--selftest');

function meld(uitkomst, tekst, extra) {
  const merk = uitkomst === 'ok' ? '  ok   ' : uitkomst === 'nvt' ? '  n.v.t.' : '  FOUT ';
  console.log(merk + ' ' + tekst + (extra ? ' — ' + extra : ''));
  return uitkomst === 'fout' ? 1 : 0;
}

/* 1. Parseert de module? Een module die niet laadt geeft in de browser een lege
   pagina zonder regelnummer dat ergens naar wijst. */
async function toetsParse(rel) {
  let bron;
  try { bron = await readFile(join(ROOT, rel), 'utf8'); }
  catch { return meld('fout', rel, 'bestaat niet'); }
  const tmp = `${process.env.TMPDIR || '/tmp'}/terra-hints-${rel.replace(/\W/g, '_')}.mjs`;
  await writeFile(tmp, bron);
  try { execFileSync('node', ['--check', tmp], { stdio: 'pipe' }); return meld('ok', rel + ' parseert'); }
  catch (e) {
    const m = String(e.stderr || e).split('\n').find((r) => /Error|Unexpected|Invalid/.test(r)) || '?';
    return meld('fout', rel + ' parseert NIET', m.trim());
  } finally { await unlink(tmp).catch(() => {}); }
}

/* 2, 3 en 4. Uit de module zelf en niet uit een tweede lijst hier: een kopie
   van de ankers in dit bestand zou precies de tweede waarheid zijn die deze
   controle moet uitsluiten.

   De ankers worden GETELD in de markup en niet met een DOM geparseerd. Dat is
   voldoende: een id staat er of hij staat er niet, en een halve parser op
   713 kB HTML zou zelf een bron van fouten worden. */
async function toetsAnkers(modulePad, markupPad) {
  const mod = await import('file://' + join(ROOT, modulePad) + '?t=' + process.hrtime.bigint());
  const stappen = mod.HINT_STEPS;
  if (!Array.isArray(stappen) || !stappen.length) {
    return meld('nvt', 'ankers', 'HINT_STEPS is leeg of ontbreekt');
  }
  const markup = await readFile(join(ROOT, markupPad), 'utf8');
  let fout = 0;

  const missend = stappen
    .map((s) => s.anchor)
    .filter((a) => !new RegExp('id="' + a + '"').test(markup));
  fout += missend.length
    ? meld('fout', 'elk anker bestaat in ' + markupPad, 'niet gevonden: ' + missend.join(', '))
    : meld('ok', `elk anker bestaat in ${markupPad} (${stappen.length} stappen)`);

  const leeg = stappen.filter((s) => !s.text || !s.text.trim() || !s.title || !s.title.trim()
                                  || !s.label || !s.label.trim());
  fout += leeg.length
    ? meld('fout', 'elke stap draagt tekst', 'leeg bij: ' + leeg.map((s) => s.anchor || '?').join(', '))
    : meld('ok', `elke stap draagt titel, label en tekst (${stappen.length} stappen)`);

  const gezien = new Set(), dubbel = new Set();
  for (const s of stappen) { if (gezien.has(s.anchor)) dubbel.add(s.anchor); gezien.add(s.anchor); }
  fout += dubbel.size
    ? meld('fout', 'elk anker komt één keer voor', 'dubbel: ' + [...dubbel].join(', '))
    : meld('ok', `elk anker komt één keer voor (${gezien.size} unieke)`);

  return fout;
}

async function draai(modulePad = MODULE, markupPad = MARKUP) {
  let fout = 0;
  fout += await toetsParse(modulePad);
  fout += await toetsAnkers(modulePad, markupPad);
  return fout;
}

/* DE CONTROLE OP DE CONTROLE. Elke breuk hieronder MOET uitslaan; een toets die
   slaagt zonder dat er iets te toetsen viel, toetst niets. De breuk gaat op een
   KOPIE van de module en de markup, zodat een afgebroken zelftest nooit een
   beschadigd bestand achterlaat. */
async function zelftest() {
  const modBron = await readFile(join(ROOT, MODULE), 'utf8');
  const htmlBron = await readFile(join(ROOT, MARKUP), 'utf8');
  const tmpMod = 'js/ui/__hints-selftest.mjs';
  const tmpHtml = '__index-selftest.html';

  const breuken = [
    {
      naam: 'een verzonnen anker',
      mod: (s) => s.replace(/anchor: 'panel-open'/, "anchor: 'bestaat-niet-xyz'"),
      html: (s) => s
    },
    {
      naam: 'een lege tekst',
      mod: (s) => s.replace(/text: 'Click anything[^']*'/, "text: ''"),
      html: (s) => s
    },
    {
      naam: 'twee stappen op hetzelfde anker',
      mod: (s) => s.replace(/anchor: 'details-open'/, "anchor: 'panel-open'"),
      html: (s) => s
    },
    {
      naam: 'een hernoemde id in de markup',
      mod: (s) => s,
      html: (s) => s.replace('id="settings-open"', 'id="settings-open-hernoemd"')
    },
    {
      naam: 'een syntaxfout in de module',
      mod: (s) => s.replace('export const HINT_STEPS = [', 'export const HINT_STEPS = [ {{'),
      html: (s) => s
    }
  ];

  let mis = 0;
  for (const b of breuken) {
    await writeFile(join(ROOT, tmpMod), b.mod(modBron));
    await writeFile(join(ROOT, tmpHtml), b.html(htmlBron));
    let fout = 0;
    try { fout = await draai(tmpMod, tmpHtml); }
    catch { fout = 1; }          // een module die niet importeert IS een uitslag
    finally {
      await unlink(join(ROOT, tmpMod)).catch(() => {});
      await unlink(join(ROOT, tmpHtml)).catch(() => {});
    }
    if (fout) console.log('  ok    breuk gezien: ' + b.naam + '\n');
    else { console.log('  FOUT  breuk NIET gezien: ' + b.naam + '\n'); mis++; }
  }
  return mis;
}

if (selftest) {
  console.log('zelftest — elke breuk moet uitslaan\n');
  const mis = await zelftest();
  console.log(mis ? `\n${mis} breuk(en) bleven onopgemerkt` : '\nalle breuken gezien');
  process.exit(mis ? 1 : 0);
} else {
  const fout = await draai();
  process.exit(fout ? 1 : 0);
}
