// build-standalone.mjs — produces terra-standalone.html, a single file you can
// send to someone or put on a USB stick.
//
//   node tools/build-standalone.mjs
//
// WHY THIS EXISTS
// Terra is modular: index.html imports ./js/config.js and friends as ES modules.
// Browsers refuse to load ES modules over file://, so double-clicking index.html
// gets you nothing. This script inlines those modules into one document.
//
// WHAT IT DOES NOT DO
// It is not a bundler and it adds no dependency. Terra still runs without any
// build step — index.html is the real application, this output is a derivative.
// Do not import anything here that is not in Node's standard library.
//
// WHAT STAYS REMOTE
// Textures, star fields and GeoJSON are 33 MB; inlining those as data URIs would
// be absurd. They are fetched from jsDelivr instead, which already serves the
// public repository with `access-control-allow-origin: *`. That CORS header is
// what makes this work at all: from a file:// page the origin is `null`, so every
// request is cross-origin.
//
// KNOWN LIMITS OF THE OUTPUT
// - Air quality is locked: it needs a server-side token behind /api/waqi.
// - Lightning is locked: it needs a relay holding a permanent WebSocket open.
// - Earthquakes, volcanoes, wildfires, storms and sea ice all work — those feeds
//   send CORS headers of their own.
// - It needs an internet connection. "Standalone" means one file, not offline.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// The output name is the name people see in their downloads folder, so it is
// deliberately plain. It is also the filename of the Release asset, and the
// README links straight at it via /releases/latest/download/terra.html — that
// URL only resolves if the asset carries exactly this name. Renaming here means
// renaming there.
const OUT = 'terra.html';

// WHICH REF THE ASSETS COME FROM.
//
//   node tools/build-standalone.mjs               -> @main
//   node tools/build-standalone.mjs --ref v1.1.0  -> @v1.1.0
//
// `@main` means the file silently follows whatever lands on the branch, and that
// is the wrong behaviour for something people download and keep: a texture that
// moves under an old copy is at best confusing. Release builds therefore pin to
// the tag. The tag only exists after the merge, which is why this is a parameter
// and not a constant — during development `@main` is the honest default.
const refArg = process.argv.indexOf('--ref');
const REF = refArg !== -1 && process.argv[refArg + 1] ? process.argv[refArg + 1] : 'main';
const CDN = `https://cdn.jsdelivr.net/gh/Lemans73/Terra@${REF}/`;

const read = (p) => readFile(join(ROOT, p), 'utf8');

// ---------------------------------------------------------------------------
// WHICH MODULES GET INLINED IS DERIVED, NOT MAINTAINED BY HAND
//
// This used to be a constant list, and that is precisely how the sun and moon
// got lost: index.html imported them, this file had never heard of them, and
// the build stripped the imports while inlining nothing. The output kept every
// call site and lost every definition — and the script reported success. What
// someone adds to index.html tomorrow has to be picked up without them
// remembering that this file exists.
//
// One import statement, multi-line forms included, with its source captured.
// The lazy body refuses to cross a line that opens a new `import`, which is
// what stops a CDN import from swallowing the local one underneath it.
const IMPORT_RE = /^import\s+(?:(?!^import\b)[\s\S])*?\bfrom\s*['"]([^'"]+)['"];?[ \t]*$/gm;
const isLocal = (spec) => spec.startsWith('./') || spec.startsWith('../');

const localSpecs = (src) => [...src.matchAll(IMPORT_RE)].map(m => m[1]).filter(isLocal);

// Depth-first over the import graph, a dependency pushed before whatever
// depends on it. That is what puts sunmoon.js above sunmoon-layer.js: a
// consequence of what the files declare, not an order to keep right by hand.
async function collectModules(entrySrc) {
  const order = [];
  const state = new Map(); // path -> 'visiting' | 'done'

  async function visit(path, via) {
    if (state.get(path) === 'done') return;
    if (state.get(path) === 'visiting') {
      throw new Error(`build failed: circular import — ${path} via ${via}`);
    }
    state.set(path, 'visiting');
    const src = await read(path);
    for (const spec of localSpecs(src)) {
      await visit(posix.join(posix.dirname(path), spec), path);
    }
    state.set(path, 'done');
    order.push(path);
  }

  for (const spec of localSpecs(entrySrc)) await visit(posix.join('.', spec), 'index.html');
  return order;
}

// Strip the module syntax. The inlined result is one script, so imports have
// nothing left to resolve and exports have nowhere to go — but every name has to
// stay a plain top-level declaration so the rest of the file still sees it.
function deModule(src) {
  return src
    // import { a, b } from './x.js';  — including multi-line forms
    .replace(/^import\s+[\s\S]*?from\s*['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^import\s*['"][^'"]+['"];?\s*$/gm, '')
    // export const X / export function X / export class X → drop the keyword
    .replace(/^export\s+(const|let|var|function|class|async)\b/gm, '$1')
    // export { a, b };
    .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '');
}

function assertGone(html, needle, label) {
  if (html.includes(needle)) {
    throw new Error(`build failed: ${label} still present (${needle})`);
  }
}

/* ---------------------------------------------------------------------------
   COMMENTAAR STRIPPEN

   Drie soorten commentaar in één bestand, elk met hun eigen regels:
     - HTML  <!-- ... -->   buiten <style> en <script>
     - CSS   /* ... *​/      binnen <style>
     - JS    // en /* *​/     binnen <script>

   Alleen de JS is lastig. De scanner loopt teken voor teken en houdt bij of hij
   in een string, een template literal of een regex-literal zit; binnen die drie
   blijft alles staan. Een `/` opent alleen een regex als het vorige betekenisvolle
   teken geen naam, getal, `)` of `]` is — anders is het een deling.
--------------------------------------------------------------------------- */
function stripJs(src) {
  let uit = '', i = 0;
  const n = src.length;
  let laatsteZinvol = '';   // laatste niet-witruimteteken buiten commentaar
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') {                       // regelcommentaar
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {                       // blokcommentaar
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {          // string of template
      const q = c;
      uit += c; i++;
      while (i < n) {
        if (src[i] === '\\') { uit += src[i] + (src[i + 1] || ''); i += 2; continue; }
        uit += src[i];
        if (src[i] === q) { i++; break; }
        i++;
      }
      laatsteZinvol = q;
      continue;
    }
    if (c === '/' && !/[A-Za-z0-9_$)\]]/.test(laatsteZinvol)) {   // regex-literal
      uit += c; i++;
      let inKlasse = false;
      while (i < n) {
        if (src[i] === '\\') { uit += src[i] + (src[i + 1] || ''); i += 2; continue; }
        if (src[i] === '[') inKlasse = true;
        else if (src[i] === ']') inKlasse = false;
        else if (src[i] === '/' && !inKlasse) { uit += src[i]; i++; break; }
        uit += src[i]; i++;
      }
      laatsteZinvol = '/';
      continue;
    }
    if (!/\s/.test(c)) laatsteZinvol = c;
    uit += c; i++;
  }
  return uit;
}

// CSS kent alleen /* */ en geen strings met // erin die ertoe doen; een gewone
// vervanging volstaat, mits niet-gulzig.
const stripCss = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '');

// Lege en witruimte-regels die na het strippen overblijven, samenvouwen tot één.
const vouwLegeRegels = (src) => src.replace(/\n[ \t]*(?=\n[ \t]*\n)/g, '').replace(/\n{3,}/g, '\n\n');

// Loopt de HTML door en past per blok de juiste stripper toe. Buiten <style> en
// <script> gaan alleen de HTML-commentaren eruit.
function stripComments(html) {
  const stukken = [];
  const BLOK = /<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi;
  let laatst = 0, m;
  while ((m = BLOK.exec(html)) !== null) {
    stukken.push({ soort: 'html', tekst: html.slice(laatst, m.index) });
    const open = m[0].indexOf('>') + 1;
    const sluit = m[0].lastIndexOf('</');
    stukken.push({ soort: m[1].toLowerCase(), kop: m[0].slice(0, open),
                   body: m[0].slice(open, sluit), voet: m[0].slice(sluit) });
    laatst = m.index + m[0].length;
  }
  stukken.push({ soort: 'html', tekst: html.slice(laatst) });
  return stukken.map(s => {
    if (s.soort === 'html') return vouwLegeRegels(s.tekst.replace(/<!--[\s\S]*?-->/g, ''));
    const body = s.soort === 'style' ? stripCss(s.body) : stripJs(s.body);
    return s.kop + vouwLegeRegels(body) + s.voet;
  }).join('');
}

// Parseert elk scriptblok apart. `node --check` leest een bestand en voert het
// niet uit, dus dit is een pure syntaxtoets — precies wat we willen weten.
async function assertParses(html) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { unlink } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const run = promisify(execFile);
  const blokken = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (let i = 0; i < blokken.length; i++) {
    const [, attrs, body] = blokken[i];
    if (/type\s*=\s*["']importmap["']/i.test(attrs)) continue;   // JSON, geen JS
    if (!body.trim()) continue;
    const pad = join(tmpdir(), `terra-check-${i}.mjs`);
    await writeFile(pad, body, 'utf8');
    try {
      await run(process.execPath, ['--check', pad]);
    } catch (e) {
      throw new Error(`build failed: stripping broke script block ${i} — ${e.stderr || e.message}`);
    } finally {
      await unlink(pad).catch(() => {});
    }
  }
}

const html = await readFile(join(ROOT, 'index.html'), 'utf8');
let out = html;

// ---- 1. CSS inline --------------------------------------------------------
const css = await read('./css/app.css');
out = out.replace(
  '<link rel="stylesheet" href="./css/app.css">',
  '<style>\n' + css + '\n</style>'
);
assertGone(out, 'href="./css/app.css"', 'stylesheet link');

// ---- 2. Modules inline ----------------------------------------------------
// Every local import in index.html is replaced by the concatenated sources: the
// first one becomes the inlined block, the rest fall away.
//
// `type="module"` STAYS. The CDN imports (three, globe.gl, gsap) are bare
// specifiers resolved by the import map in the head, and an import map only
// applies to a module script. Those imports are real URLs and load fine over
// https, even from a file:// page.
const modules = await collectModules(html);
if (!modules.length) throw new Error('build failed: no local imports found in index.html');

// ---- No aliases in local imports ------------------------------------------
// `import { ephemeris as sunMoonEphemeris } from './js/sunmoon.js'` reads fine as a
// module and is a landmine here: the import line is stripped and the modules are
// concatenated, so the alias never gets declared and every call site refers to a name
// that does not exist. It was in index.html from session 14 and only surfaced in
// session 19, because the one call site happened to sit behind a guard that had not
// fired yet.
//
// REFUSED, NOT REPAIRED. Emitting `const alias = original;` would work, but it makes
// this script responsible for a piece of module semantics — and that responsibility is
// exactly where the bug came from. A build that stops with a name in the message costs
// one minute; a standalone that throws at an arbitrary moment costs an afternoon.
const ALIAS_RE = /\b([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)/;
for (const stmt of [...html.matchAll(IMPORT_RE)]) {
  if (!isLocal(stmt[1])) continue;                       // CDN imports are untouched
  const alias = ALIAS_RE.exec(stmt[0]);
  if (alias) {
    throw new Error(
      `build failed: aliased local import — "${alias[1]} as ${alias[2]}" from ${stmt[1]}.\n` +
      `  The alias does not survive inlining. Import the original name and use that.`);
  }
}

let inlined = '';
for (const m of modules) {
  inlined += `\n/* ===== inlined from ./${m} ===== */\n` + deModule(await read(m)) + '\n';
}

// The placeholder has to be absent from the document, or the modules land in
// the wrong spot. It is shaped like a comment so a missed swap is inert rather
// than a syntax error.
const MARK = '/*__TERRA_INLINE__*/';
if (out.includes(MARK)) throw new Error(`build failed: ${MARK} already occurs in index.html`);
let replaced = 0;
out = out.replace(IMPORT_RE, (stmt, spec) => {
  if (!isLocal(spec)) return stmt;
  return replaced++ === 0 ? MARK : '';
});
if (!replaced) throw new Error('build failed: could not locate the local imports');
out = out.replace(MARK, inlined);

// Generic where there used to be one assertion per module: nothing local may
// survive, and everything collected must actually be in there.
const leftover = [...out.matchAll(IMPORT_RE)].map(m => m[1]).filter(isLocal);
if (leftover.length) {
  throw new Error(`build failed: local imports survived — ${leftover.join(', ')}`);
}
for (const m of modules) {
  if (!out.includes(`inlined from ./${m}`)) {
    throw new Error(`build failed: ${m} was collected but never inlined`);
  }
}

// ---- 3. Assets naar het CDN ----------------------------------------------
if (!out.includes("const ASSET_BASE = '';")) {
  throw new Error('build failed: ASSET_BASE declaration not found — did config.js change?');
}
out = out.replace("const ASSET_BASE = '';", `const ASSET_BASE = '${CDN}';`);

// The icons in <head> are plain HTML and never pass through asset().
out = out.replace(/href="\.\/assets\//g, `href="${CDN}assets/`);

// ---- 4. Analytics uit -----------------------------------------------------
// This file does not run on Vercel, so /_vercel/insights/ does not exist there.
// An empty host list is enough; the injection is guarded by it.
out = out.replace(
  /const ANALYTICS_HOSTS = \[[^\]]*\];/,
  'const ANALYTICS_HOSTS = [];   // standalone: never on Vercel'
);

// ---- 4b. Cut the sketch layer out -----------------------------------------
//
// The drawing layer is deliberately absent from this file. It is a browser-local
// feature: it keeps work in localStorage and exchanges JSON files, and neither
// belongs in something people download once and keep. Terry's call, and this is
// where it is enforced rather than hoped for.
//
// Two locks, either one sufficient on its own:
//
//   1. index.html reaches the modules through `await import()`, never a static
//      import statement — so collectModules() above cannot see them and they are
//      never inlined. That covers js/sketch.js and js/sketch-editor.js entirely.
//   2. Everything else — markup, CSS, PARAMS, the wiring — sits between
//      SKETCH:START and SKETCH:END markers, and this step removes those blocks.
//
// This runs BEFORE the comment stripper. Afterwards the markers are gone, and
// with them any chance of finding the blocks they delimited.
// NOT one spanning regex. That was the first version and it is quietly dangerous:
// drop a single SKETCH:END and `START …lazy… END` runs on to the NEXT block's end
// marker, so the cut swallows every line between two blocks — real, unrelated code
// — and the word `sketch` is gone either way, so the check below passes and the
// build reports success. Measured: removing one end marker cut 177 KB and exited 0.
//
// So: find the markers, insist they alternate, and only then cut. A missing or
// doubled marker is a build failure, which is the whole point of having them.
function cutMarked(src) {
  const regelVan = (i) => src.slice(0, i).split('\n').length;

  // Find the word, then grow outwards to the comment that holds it. Matching the
  // whole comment with one pattern does not work: two of these markers open a
  // block comment that runs for many lines before its `*/`, and a pattern that
  // demands the closer on the same line silently finds neither.
  const marks = [];
  const WOORD = /SKETCH:(START|END)/g;
  let m;
  while ((m = WOORD.exec(src)) !== null) {
    const i = m.index;
    const htmlOpen = src.lastIndexOf('<!--', i);
    const jsOpen   = src.lastIndexOf('/*', i);
    const isHtml   = htmlOpen > jsOpen;
    const open     = isHtml ? htmlOpen : jsOpen;
    const sluiter  = isHtml ? '-->' : '*/';
    if (open === -1) throw new Error(`build failed: SKETCH:${m[1]} on line ${regelVan(i)} is not inside a comment`);
    const eind = src.indexOf(sluiter, i);
    if (eind === -1) throw new Error(`build failed: the comment holding SKETCH:${m[1]} on line ${regelVan(i)} is never closed`);
    // Voorloopwitruimte en de afsluitende newline mee, anders blijven er lege
    // regels en losse inspringingen achter.
    let van = open;
    while (van > 0 && (src[van - 1] === ' ' || src[van - 1] === '\t')) van--;
    let tot = eind + sluiter.length;
    while (tot < src.length && (src[tot] === ' ' || src[tot] === '\t')) tot++;
    if (src[tot] === '\n') tot++;
    marks.push({ soort: m[1], van, tot, regel: regelVan(i) });
    WOORD.lastIndex = eind;   // niet nog eens binnen dezelfde commentaar zoeken
  }
  if (!marks.length) throw new Error('build failed: no SKETCH markers found — did they move or get renamed?');

  // Strikt om en om. Ontbreekt er één, dan zou een naïeve knip alles tussen twee
  // blokken opslokken — echte, niet-sketch code — en omdat het woord daarna toch
  // weg is, zou de controle hieronder groen geven. Gemeten: één END weghalen sneed
  // 177 KB weg en gaf exitcode 0. Vandaar dat dit een bouwfout is.
  const stukken = [];
  let laatst = 0;
  for (let i = 0; i < marks.length; i += 2) {
    const open = marks[i], sluit = marks[i + 1];
    if (open.soort !== 'START') {
      throw new Error(`build failed: SKETCH:END without a matching START on line ${open.regel}`);
    }
    if (!sluit) {
      throw new Error(`build failed: SKETCH:START on line ${open.regel} is never closed`);
    }
    if (sluit.soort !== 'END') {
      throw new Error(
        `build failed: SKETCH:START on line ${open.regel} is followed by another START on line ${sluit.regel} ` +
        '— the END in between is missing, and cutting anyway would swallow everything between the two blocks'
      );
    }
    stukken.push(src.slice(laatst, open.van));
    laatst = sluit.tot;
  }
  stukken.push(src.slice(laatst));
  return stukken.join('');
}

const voorKnip = Buffer.byteLength(out, 'utf8');
out = cutMarked(out);
console.log(`sketch layer cut — ${Math.round((voorKnip - Buffer.byteLength(out, 'utf8')) / 1024)} KB removed`);

// The check that makes the next person's mistake loud instead of silent. A static
// import, a forgotten marker, a stray id — any of them leaves the word behind,
// and then this throws rather than shipping half a feature.
if (/sketch/i.test(out)) {
  const regel = out.split('\n').findIndex(l => /sketch/i.test(l)) + 1;
  throw new Error(
    `build failed: the sketch layer survived into the standalone (first hit on line ${regel}). ` +
    'Check that every block is wrapped in SKETCH:START/SKETCH:END and that the modules ' +
    'are only ever reached through await import().'
  );
}

// ---- 5. Strip the comments ------------------------------------------------
// Measured before this step existed: 118 KB of 296 KB was comment — 40%. The
// repository keeps every word of it; only this derived file is stripped.
//
// WHY A SCANNER AND NOT A REGEX. The shaders are JS template literals, and a `//`
// inside one is GLSL code or part of a URL, not a comment. A regex on `//` cuts
// straight through them and the failure is a SyntaxError on a GLSL identifier —
// which is exactly how two hours went missing in session 14.
const stripped = stripComments(out);
const winst = Buffer.byteLength(out, 'utf8') - Buffer.byteLength(stripped, 'utf8');
// A silent breakage here is the worst outcome: the file would still be written and
// only fall over in someone's browser. So the stripped script is parsed before it
// is allowed through.
await assertParses(stripped);
out = stripped;

// ---- 6. Mark the file -----------------------------------------------------
out = out.replace(
  '<title>',
  '<!-- GENERATED FILE — do not edit.\n' +
  '     Built by tools/build-standalone.mjs from index.html and js/*.js.\n' +
  '     Edit those and rebuild; changes made here are lost on the next build.\n' +
  '     Assets and data are fetched over the network, so this needs a connection.\n' +
  '-->\n<title>'
);

await writeFile(join(ROOT, OUT), out, 'utf8');

console.log(`comments stripped — ${Math.round(winst / 1024)} KB saved`);
const kb = Math.round(Buffer.byteLength(out, 'utf8') / 1024);
console.log(`${OUT} written — ${kb} KB`);
console.log(`assets from ${CDN}`);
