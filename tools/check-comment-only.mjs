/* check-comment-only.mjs — heeft een opruimronde ALLEEN commentaar geraakt?
 *
 *   node tools/check-comment-only.mjs [ref]     (standaard: HEAD)
 *   node tools/check-comment-only.mjs --selftest
 *
 * WAAROM DIT BESTAAT (sessie 42).
 * De commentaarronde raakt duizenden regels, waarvan een groot deel binnen GLSL-
 * template-literals staat. Een shader die daarbij stukgaat is STIL: hij
 * compileert niet, tekent niets, en de buurlaag gaat door alsof er niets is —
 * gemeten in sessie 41. Met de hand nalezen of er per ongeluk code is
 * meegegaan, schaalt niet bij 4.000 regels.
 *
 * HOE. Van elke versie wordt het commentaar GESTRIPT en de rest vergeleken. Dat
 * is met opzet niet "kijk of de gewijzigde regels commentaar zijn": bij het
 * strippen maakt de scanner in beide versies dezelfde fouten, en dan valt een
 * zuivere commentaarwijziging nog steeds gelijk uit. Twijfelt de scanner, dan
 * MELDT hij een verschil — een vals alarm en geen valse geruststelling.
 *
 * DE SCANNER KENT STRINGS. Een `//` binnen een GLSL-literal of een `/*` in een
 * reguliere expressie is geen commentaar; zonder dat onderscheid zou dit
 * gereedschap juist de shaders verminken die het moet bewaken.
 */

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Commentaar eruit, de rest ongemoeid. Loopt teken voor teken door vijf standen:
   gewone code, regelcommentaar, blokcommentaar, een quote-string en een template
   literal (die `${...}` mag bevatten en dus een diepte bijhoudt). Een `/` die op
   een operator volgt opent een reguliere expressie en geen commentaar. */
export function stripComments(src) {
  let uit = '';
  let i = 0;
  const n = src.length;
  // Waar de vorige betekenisvolle token op eindigde, om regex van deling te scheiden.
  let vorige = '';
  const templateDiepte = [];
  // Staat er een `/* glsl */`- of `/* css */`-markering vlak vóór de
  // eerstvolgende backtick? Dan is de inhoud CODE met commentaar erin.
  let codeVolgt = null;

  const laatsteTekenIsOperator = () => {
    const t = vorige.trimEnd();
    if (!t) return true;
    const c = t[t.length - 1];
    if ('=(,:[!&|?{};+-*%<>~^'.includes(c)) return true;
    return /\b(return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await)$/.test(t);
  };

  while (i < n) {
    const c = src[i], d = src[i + 1];

    // ---- commentaar ----
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;                       // de \n zelf blijft staan
    }
    if (c === '/' && d === '*') {
      /* DE MARKERING `/* glsl *\/` OPENT EEN LITERAL MET CODE ERIN.

         Zonder deze uitzondering toetst dit gereedschap juist de bestanden niet
         waarvoor het gemaakt is: de shaders staan in template literals, en de
         inhoud daarvan is voor JavaScript een STRING. Een GLSL-commentaarblok
         weghalen zou dan als codewijziging lezen en elke opruimronde zou vals
         alarm geven.

         Alleen bij deze markering, en niet bij elke template literal. Een `//`
         in een url of een `/*` in een CSS-regel is geen commentaar dat wij
         mogen wegdenken; die literals blijven ongemoeid. */
      const staart = src.slice(i, i + 40);
      if (/^\/\* *glsl *\*\/\s*`/.test(staart)) codeVolgt = 'glsl';
      /* EN DE CSS-LITERALS, om dezelfde reden. Alleen BLOKcommentaar: CSS kent
         geen regelcommentaar, en `//` komt er wel in voor — in een url. */
      else if (/^\/\* *css *\*\/\s*`/.test(staart)) codeVolgt = 'css';
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') uit += '\n';   // regelnummers blijven kloppen
        i++;
      }
      i += 2;
      continue;
    }

    // ---- reguliere expressie ----
    if (c === '/' && laatsteTekenIsOperator()) {
      let j = i + 1, inKlasse = false;
      while (j < n) {
        const e = src[j];
        if (e === '\\') { j += 2; continue; }
        if (e === '[') inKlasse = true;
        else if (e === ']') inKlasse = false;
        else if (e === '/' && !inKlasse) break;
        else if (e === '\n') break;         // geen geldige regex: toch maar delen
        j++;
      }
      const stuk = src.slice(i, j + 1);
      uit += stuk; vorige = stuk; i = j + 1;
      continue;
    }

    // ---- strings ----
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === c || src[j] === '\n') break;
        j++;
      }
      const stuk = src.slice(i, j + 1);
      uit += stuk; vorige = stuk; i = j + 1;
      continue;
    }

    // ---- template literal ----
    if (c === '`') {
      /* EEN GEMARKEERDE LITERAL WORDT WÉL OPGESCHOOND: zoek zijn einde, strip
         de inhoud en ga verder. Een gewone literal loopt hieronder ongemoeid
         door. GLSL gaat langs dezelfde scanner; CSS krijgt alleen zijn
         blokcommentaar weg, want een `//` daar hoort bij een url. */
      if (codeVolgt) {
        const soort = codeVolgt;
        codeVolgt = null;
        let j = i + 1;
        while (j < n && src[j] !== '`') { if (src[j] === '\\') j++; j++; }
        const binnen = src.slice(i + 1, j);
        uit += '`' + (soort === 'css' ? binnen.replace(/\/\*[\s\S]*?\*\//g, '')
                                      : stripComments(binnen)) + '`';
        vorige = '`';
        i = j + 1;
        continue;
      }
      uit += c; i++;
      templateDiepte.push(0);
      while (i < n && templateDiepte.length) {
        if (src[i] === '\\') { uit += src.slice(i, i + 2); i += 2; continue; }
        if (src[i] === '`') { uit += src[i]; i++; templateDiepte.pop(); continue; }
        if (src[i] === '$' && src[i + 1] === '{') {
          /* DE UITDRUKKING BINNEN ${...} IS WEER CODE, en daar kan commentaar in
             staan. Recursief langs dezelfde scanner in plaats van doorlopen:
             `${x /* noot *\/ + y}` hoort dan ook opgeschoond te worden. */
          let j = i + 2, diepte = 1;
          while (j < n && diepte) {
            if (src[j] === '{') diepte++;
            else if (src[j] === '}') diepte--;
            else if (src[j] === '`') {        // geneste template: overslaan tot zijn eind
              j++;
              while (j < n && src[j] !== '`') { if (src[j] === '\\') j++; j++; }
            }
            if (diepte) j++;
          }
          uit += '${' + stripComments(src.slice(i + 2, j)) + '}';
          i = j + 1;
          continue;
        }
        uit += src[i]; i++;
      }
      vorige = '`';
      continue;
    }

    uit += c;
    if (!/\s/.test(c)) vorige += c;
    if (vorige.length > 40) vorige = vorige.slice(-40);
    i++;
  }
  return uit;
}

// Lege regels en regeleindes gelijktrekken: het verwijderen van een commentaarblok
// laat lege regels achter, en dat is geen codewijziging.
const normaliseer = (s) => s.split('\n').map(l => l.trimEnd()).filter(l => l.length).join('\n');

async function vergelijk(ref) {
  const gewijzigd = execFileSync('git', ['diff', '--name-only', ref, '--', '*.js', '*.html'],
    { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  if (!gewijzigd.length) return { bestanden: 0, verschillen: [] };

  const verschillen = [];
  for (const pad of gewijzigd) {
    let oud;
    try { oud = execFileSync('git', ['show', `${ref}:${pad}`], { cwd: ROOT, encoding: 'utf8' }); }
    catch { continue; }                       // nieuw bestand: niets om tegen af te zetten
    const nieuw = await readFile(join(ROOT, pad), 'utf8');
    const a = normaliseer(stripComments(oud));
    const b = normaliseer(stripComments(nieuw));
    if (a === b) continue;
    // Waar loopt het uiteen? De eerste afwijkende regel is genoeg om te gaan kijken.
    const ra = a.split('\n'), rb = b.split('\n');
    let k = 0;
    while (k < ra.length && k < rb.length && ra[k] === rb[k]) k++;
    verschillen.push({ pad, regel: k + 1, oud: ra[k] || '(einde)', nieuw: rb[k] || '(einde)' });
  }
  return { bestanden: gewijzigd.length, verschillen };
}

async function selftest() {
  console.log('zelftest — de controle MOET uitslaan op een codewijziging\n');
  const doel = join(ROOT, 'js/compute/storm-track.js');
  const origineel = await readFile(doel, 'utf8');
  let fouten = 0;

  const gevallen = [
    ['alleen commentaar weggehaald',
     (s) => s.replace('// One nautical mile is one minute of arc, by definition.\n', ''),
     false],
    ['een coderegel gewijzigd',
     (s) => s.replace('const NM_TO_RAD = TO_RAD / 60;', 'const NM_TO_RAD = TO_RAD / 61;'),
     true],
    ['een coderegel weggehaald',
     (s) => s.replace('  uit.push(uit[0]);   // sluiten\n', ''),
     true],
    ['code die op commentaar lijkt, binnen een string',
     (s) => s.replace("const TO_RAD = Math.PI / 180;", "const TO_RAD = Math.PI / 180; const _n = '/* niet echt */';"),
     true]
  ];

  // En de twee gevallen waar dit gereedschap voor bestaat: commentaar BINNEN een
  // GLSL-literal mag weg, GLSL-CODE binnen diezelfde literal niet.
  const shader = join(ROOT, 'js/layers/quake-indicator-shaders.js');
  const shaderOrigineel = await readFile(shader, 'utf8');
  const shaderGevallen = [
    ['GLSL-commentaar weggehaald',
     (s) => s.replace('// Hoeveel er op dit moment gestapeld staat: 0 = ieder op zijn eigen plek.\n', ''),
     false],
    ['een GLSL-CODEregel gewijzigd',
     (s) => s.replace('return uStackOn * smoothstep(uStackNear, uStackFar, camDist);',
                      'return uStackOn * smoothstep(uStackNear, uStackFar, camDist * 2.0);'),
     true]
  ];

  /* DE CSS-GEVALLEN TOETSEN stripComments RECHTSTREEKS en niet via git.

     De markering `/* css *\/` moet in BEIDE versies staan om iets te zeggen, en
     in HEAD staat hij pas nadat deze ronde is vastgelegd. Een git-vergelijking
     zou dus falen om de verkeerde reden. Dit toetst wat er werkelijk toe doet:
     strípt de scanner CSS-commentaar en laat hij CSS-code staan. */
  const cssEenheid = [
    ['CSS-commentaar weggehaald',
     'const c = /* css */`.a { color: red; } /* noot */`;',
     'const c = /* css */`.a { color: red; } `;',
     false],
    ['een CSS-REGEL gewijzigd',
     'const c = /* css */`.a { color: red; }`;',
     'const c = /* css */`.a { color: blue; }`;',
     true],
    ['een // in een url blijft staan',
     'const c = /* css */`.a { background: url(//x/y.png); }`;',
     'const c = /* css */`.a { background: url(//x/z.png); }`;',
     true]
  ];

  for (const [wat, muteer, moetUitslaan] of gevallen) {
    await writeFile(doel, muteer(origineel), 'utf8');
    const { verschillen } = await vergelijk('HEAD');
    const sloegUit = verschillen.length > 0;
    const goed = sloegUit === moetUitslaan;
    if (!goed) fouten++;
    console.log(`  ${goed ? 'ok  ' : 'FOUT'}  ${wat} → ${sloegUit ? 'melding' : 'geen melding'}` +
                `  (verwacht: ${moetUitslaan ? 'melding' : 'geen melding'})`);
  }
  await writeFile(doel, origineel, 'utf8');

  for (const [wat, muteer, moetUitslaan] of shaderGevallen) {
    await writeFile(shader, muteer(shaderOrigineel), 'utf8');
    const { verschillen } = await vergelijk('HEAD');
    const sloegUit = verschillen.length > 0;
    const goed = sloegUit === moetUitslaan;
    if (!goed) fouten++;
    console.log(`  ${goed ? 'ok  ' : 'FOUT'}  ${wat} → ${sloegUit ? 'melding' : 'geen melding'}` +
                `  (verwacht: ${moetUitslaan ? 'melding' : 'geen melding'})`);
  }
  await writeFile(shader, shaderOrigineel, 'utf8');

  for (const [wat, a, b, moetVerschillen] of cssEenheid) {
    const verschilt = stripComments(a) !== stripComments(b);
    const goed = verschilt === moetVerschillen;
    if (!goed) fouten++;
    console.log(`  ${goed ? 'ok  ' : 'FOUT'}  ${wat} → ${verschilt ? 'verschil' : 'geen verschil'}` +
                `  (verwacht: ${moetVerschillen ? 'verschil' : 'geen verschil'})`);
  }

  const totaal = gevallen.length + shaderGevallen.length + cssEenheid.length;
  console.log(fouten ? `\n${fouten} van de ${totaal} verkeerd` : '\nalle gevallen goed');
  process.exit(fouten ? 1 : 0);
}

/* ALLEEN DRAAIEN ALS HIJ ZELF WORDT AANGEROEPEN. stripComments is exporteerbaar
   en wordt ook los gebruikt om twee versies naast elkaar te leggen; zonder deze
   toets zou een import de hele controle uitvoeren en met code 1 afsluiten. */
const directAangeroepen = process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

const arg = process.argv[2];
if (!directAangeroepen) { /* geïmporteerd: niets doen */ }
else if (arg === '--selftest') { await selftest(); }
else {
  const { bestanden, verschillen } = await vergelijk(arg || 'HEAD');
  if (!bestanden) { console.log('geen gewijzigde bestanden — n.v.t.'); process.exit(0); }
  if (!verschillen.length) {
    console.log(`ok — ${bestanden} bestand(en) gewijzigd, en na het strippen van commentaar zijn ze identiek`);
    process.exit(0);
  }
  console.log(`ER IS CODE GEWIJZIGD in ${verschillen.length} van de ${bestanden} bestand(en):\n`);
  for (const v of verschillen) {
    console.log(`  ${v.pad} — eerste afwijking rond regel ${v.regel}`);
    console.log(`    was: ${v.oud.slice(0, 96)}`);
    console.log(`    nu : ${v.nieuw.slice(0, 96)}\n`);
  }
  process.exit(1);
}
