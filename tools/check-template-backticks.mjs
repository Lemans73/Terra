#!/usr/bin/env node
/* ============================================================
   BACKTICKS IN COMMENTAAR BINNEN EEN TEMPLATE LITERAL.

   Terra zet zijn CSS en zijn GLSL in JS template literals, en schrijft daar
   commentaar in — Nederlands commentaar, dat namen van dingen noemt. Wie zo'n
   naam in backticks zet, sluit de string.

   DRIE KEER GEBEURD IN SESSIE 41, en de faalvormen verschillen:

     oneven aantal   `dayLift` in de GLSL van js/shaders.js
                     -> SyntaxError: Unexpected identifier 'dayLift'
                     De build ving dit, want die parseert alles opnieuw.

     even aantal     `.dep` .. `.loc` .. `.tim` in de CSS van js/ui/quake-labels.js
                     -> GEEN syntaxfout. De string wordt geknipt, wat ertussen
                        staat wordt een property-access plus een tagged template,
                        en het bestand importeert schoon. Wat je overhoudt is een
                        halve stylesheet en een app die verderop omvalt met
                        "Cannot access 'planets' before initialization" — een
                        melding die nergens naar backticks wijst.

   Die tweede vorm is de reden dat deze controle bestaat: geen enkele bestaande
   vangrail zag hem. De build niet (het parseert), de module-import niet
   (idem), en de melding in de console wees naar een heel ander bestand.

   HOE: een kleine scanner die door het bestand loopt en bijhoudt waar hij is —
   in een gewone string, in een template, in een blokcommentaar. Meldt elk
   blokcommentaar dat binnen een template literal staat en een backtick bevat.

   Draai met --selftest om te toetsen dat de controle zelf uitslaat.
   ============================================================ */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* De scanner. Geen volledige JS-parser en dat hoeft ook niet: we hoeven alleen
   te weten of een blokcommentaar binnen een template literal valt.

   `${...}` wordt meegeteld als diepte, want binnen een interpolatie mag weer
   een gewone string staan met een backtick erin — die hoort niet gemeld. */
export function vindBacktickCommentaar(bron) {
  const treffers = [];
  let i = 0, templateDiepte = 0, interpolatieDiepte = 0;
  const n = bron.length;
  while (i < n) {
    const c = bron[i], volgende = bron[i + 1];

    // regelcommentaar
    if (c === '/' && volgende === '/') {
      while (i < n && bron[i] !== '\n') i++;
      continue;
    }
    // blokcommentaar: hier zit de hele controle in
    if (c === '/' && volgende === '*') {
      const start = i;
      i += 2;
      while (i < n && !(bron[i] === '*' && bron[i + 1] === '/')) i++;
      i += 2;
      const blok = bron.slice(start, Math.min(i, n));
      if (templateDiepte > 0 && blok.includes('`')) {
        const regel = bron.slice(0, start).split('\n').length;
        const aantal = (blok.match(/`/g) || []).length;
        treffers.push({ regel, aantal, fragment: blok.slice(0, 70).replace(/\s+/g, ' ') });
      }
      continue;
    }
    // gewone strings overslaan
    if (c === '"' || c === "'") {
      const quote = c; i++;
      while (i < n && bron[i] !== quote) { if (bron[i] === '\\') i++; i++; }
      i++;
      continue;
    }
    // template literal
    if (c === '`') {
      if (templateDiepte > 0 && interpolatieDiepte === 0) templateDiepte--;
      else templateDiepte++;
      i++;
      continue;
    }
    if (templateDiepte > 0 && c === '$' && volgende === '{') { interpolatieDiepte++; i += 2; continue; }
    if (interpolatieDiepte > 0 && c === '}') { interpolatieDiepte--; i++; continue; }
    if (c === '\\') { i += 2; continue; }
    i++;
  }
  return treffers;
}

function jsBestanden(map) {
  const uit = [];
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...jsBestanden(pad));
    else if (naam.endsWith('.js') || naam.endsWith('.mjs')) uit.push(pad);
  }
  return uit;
}

/* DE CONTROLE OP DE CONTROLE. Een vangrail die slaagt zonder dat er iets
   gebeurt, toetst niets — dus breek hier expres wat hij bewaakt en kijk of hij
   dan uitslaat. Allebei de faalvormen staan erin, ook de even variant die geen
   syntaxfout geeft. */
function selftest() {
  const gevallen = [
    { naam: 'oneven backtick in GLSL-commentaar',
      bron: 'const s = /* glsl */`\n  uniform float x;\n  /* zet `x` op nul */\n  void main(){}\n`;',
      verwacht: 1 },
    { naam: 'even aantal in CSS-commentaar (geen syntaxfout!)',
      bron: 'css.textContent = `\n  .a { color: red; }\n  /* `.a` volgt `.b` */\n  .b { color: blue; }\n`;',
      verwacht: 1 },
    { naam: 'commentaar BUITEN een template — mag',
      bron: '/* dit gaat over `x` en is prima */\nconst s = `hallo`;',
      verwacht: 0 },
    { naam: 'backtick in een gewone string — mag',
      bron: "const s = `css`;\nconst t = 'een ` in een string';\n/* geen template hier */",
      verwacht: 0 },
    { naam: 'schone template met commentaar zonder backticks',
      bron: 'const s = `\n  /* nette noot zonder backticks */\n  .a { color: red; }\n`;',
      verwacht: 0 }
  ];
  let gezakt = 0;
  for (const g of gevallen) {
    const n = vindBacktickCommentaar(g.bron).length;
    const ok = n === g.verwacht;
    if (!ok) gezakt++;
    console.log(`  ${ok ? 'ok  ' : 'ZAKT'}  ${g.naam} — gevonden ${n}, verwacht ${g.verwacht}`);
  }
  console.log(gezakt ? `\n${gezakt} zelftest(s) gezakt.` : '\nZelftest groen (5 gevallen).');
  process.exit(gezakt ? 1 : 0);
}

if (process.argv.includes('--selftest')) selftest();

const bestanden = jsBestanden('js');
let totaal = 0;
for (const pad of bestanden) {
  const treffers = vindBacktickCommentaar(readFileSync(pad, 'utf8'));
  for (const t of treffers) {
    console.log(`  FOUT  ${pad}:${t.regel} — ${t.aantal} backtick(s) in commentaar binnen een template literal`);
    console.log(`        ${t.fragment}…`);
    totaal++;
  }
}
if (totaal) {
  console.log(`\n${totaal} blok(ken) gevonden. Haal de backticks weg — ze sluiten de string.`);
  process.exit(1);
}
console.log(`  ok    ${bestanden.length} bestanden, geen backticks in commentaar binnen een template`);
