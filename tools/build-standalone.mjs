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

// Pin to a tag rather than a branch once this project starts tagging releases:
// @main means the file silently follows whatever lands on the branch, which is
// the wrong behaviour for something people download and keep.
const CDN = 'https://cdn.jsdelivr.net/gh/Lemans73/Terra@main/';

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

// ---- 5. Mark the file -----------------------------------------------------
out = out.replace(
  '<title>',
  '<!-- GENERATED FILE — do not edit.\n' +
  '     Built by tools/build-standalone.mjs from index.html and js/*.js.\n' +
  '     Edit those and rebuild; changes made here are lost on the next build.\n' +
  '     Assets and data are fetched over the network, so this needs a connection.\n' +
  '-->\n<title>'
);

await writeFile(join(ROOT, OUT), out, 'utf8');

const kb = Math.round(Buffer.byteLength(out, 'utf8') / 1024);
console.log(`${OUT} written — ${kb} KB`);
console.log(`assets from ${CDN}`);
