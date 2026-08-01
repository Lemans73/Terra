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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'terra-standalone.html';

// Pin to a tag rather than a branch once this project starts tagging releases:
// @main means the file silently follows whatever lands on the branch, which is
// the wrong behaviour for something people download and keep.
const CDN = 'https://cdn.jsdelivr.net/gh/Lemans73/Terra@main/';

// Order matters: config first, because the others import from it.
const MODULES = [
  './js/config.js',
  './js/shaders.js',
  './js/modes/expert.js',
  './js/symbols-expert.js'
];

const read = (p) => readFile(join(ROOT, p), 'utf8');

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
// The import block in index.html spans several statements; replace it wholesale
// with the concatenated sources, then drop the module type so it runs as one
// classic script. The CDN imports (three, globe.gl, gsap) stay: those are real
// URLs and load fine over https, even from a file:// page.
let inlined = '';
for (const m of MODULES) {
  inlined += `\n/* ===== inlined from ${m} ===== */\n` + deModule(await read(m)) + '\n';
}

const importBlock = out.match(
  /\/\/ Config & constanten[\s\S]*?from '\.\/js\/symbols-expert\.js';/
);
if (!importBlock) throw new Error('build failed: could not locate the local import block');
out = out.replace(importBlock[0], inlined);

assertGone(out, "from './js/config.js'", 'config import');
assertGone(out, "from './js/shaders.js'", 'shaders import');
assertGone(out, "from './js/modes/expert.js'", 'expert import');
assertGone(out, "from './js/symbols-expert.js'", 'symbols import');

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
