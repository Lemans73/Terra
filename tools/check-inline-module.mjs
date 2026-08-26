/* check-inline-module.mjs — het inline module-script van een HTML-bestand parsen.
 *
 *   node tools/check-inline-module.mjs                (index.html)
 *   node tools/check-inline-module.mjs terra.html
 *   node tools/check-inline-module.mjs --selftest
 *
 * Haalt elke <script type="module"> uit een HTML-bestand en laat node hem
   parsen. Vangt in een seconde wat de browser als een lege pagina toont.
   Draai met --selftest om te zien dat hij ergens op aanslaat. */
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Standaard index.html naast de projectwortel; een ander bestand mag als argument.
const hier = dirname(fileURLToPath(import.meta.url));
const pad = process.argv.find(a => a.endsWith('.html')) || join(hier, '..', 'index.html');
const selftest = process.argv.includes('--selftest');
let bron = await readFile(pad, 'utf8');
if (selftest) bron = bron.replace(/const world = Globe\(\)/, 'const world = Globe(');

const blokken = [...bron.matchAll(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/gi)];
if (!blokken.length) { console.log('geen module-scripts gevonden'); process.exit(1); }

let fout = 0;
for (let i = 0; i < blokken.length; i++) {
  const code = blokken[i][1];
  const regel = bron.slice(0, blokken[i].index).split('\n').length;
  const tmp = `${process.env.TMPDIR || '/tmp'}/terra-html-${i}.mjs`;
  await writeFile(tmp, code);
  try {
    execFileSync('node', ['--check', tmp], { stdio: 'pipe' });
    console.log(`  ok    module ${i + 1} (vanaf regel ${regel}, ${code.split('\n').length} regels)`);
  } catch (e) {
    const m = String(e.stderr || e).split('\n');
    const nr = (m.find(r => r.includes('.mjs:')) || '').split(':').pop();
    const bericht = m.find(r => /Error|Unexpected|Invalid/.test(r)) || '?';
    console.log(`  FOUT  module ${i + 1} — ${bericht.trim()}`);
    if (nr) console.log(`        rond regel ${regel + Number(nr) - 1} van ${pad.split('/').pop()}`);
    fout++;
  } finally { await unlink(tmp).catch(() => {}); }
}
if (selftest) {
  console.log(fout ? '\nSELFTEST GESLAAGD — de opzettelijke breuk werd gezien.'
                   : '\nSELFTEST MISLUKT — de breuk ging er ongezien doorheen.');
  process.exit(fout ? 0 : 1);
}
process.exit(fout ? 1 : 0);
