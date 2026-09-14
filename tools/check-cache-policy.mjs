/* ============================================================
   check-cache-policy.mjs — what a visitor's device may keep
   ------------------------------------------------------------
   Terra keeps satellite tiles in a cache of its own, with a budget,
   and nothing else on the visitor's device. The browser's HTTP cache
   has no budget Terra can set, so what lands in it is decided by
   headers and fetch options, and any of those can drift back without
   anything on screen changing. The same goes for GPU memory the app
   holds on to after the visitor has moved on.

     1  the edge function tells the browser no-store for a solar image,
        and gives the edge its window in Vercel-CDN-Cache-Control
     2  the edge function refuses a bad request with no-store
     3  the local server hands the browser the policy's header, and
        writes neither an s-maxage nor an edge window of its own
     4  leaving the sun state clears the slots that hold a picture

   Tiles are held to the same rule in tools/check-tile-loader.mjs
   (test 12), where the fake tile server is.

   `--selftest` breaks each guarantee in its own file and demands that
   its check fails. A check that passes on a broken input is not a check.
   ============================================================ */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripComments } from './check-comment-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = 'api/helioviewer.js';
const POLICY = 'api/_helioviewer-policy.mjs';
const LOCAL = 'serve.mjs';
const SUN = 'js/states/sun.js';
const selftest = process.argv.includes('--selftest');

const SCREENSHOT = '/api/helioviewer?endpoint=takeScreenshot&date=2026-09-12T12:00:00Z' +
  '&imageScale=38.6&layers=%5B10%2C1%2C100%5D&x0=0&y0=0&width=64&height=64' +
  '&display=true&watermark=false';

const results = [];
const ok = (name, detail) => results.push({ name, pass: true, detail });
const bad = (name, detail) => results.push({ name, pass: false, detail });

const fromDisk = rel => readFile(join(ROOT, rel), 'utf8');

/* A fresh copy of a module, so a break written to disk is what gets imported. */
const importFresh = rel => import(pathToFileURL(join(ROOT, rel)).href + '?t=' + process.hrtime.bigint());

/* Helioviewer as the edge function meets it: an image for every request. */
function upstreamImage() {
  globalThis.fetch = async () => new Response(new Uint8Array([137, 80, 78, 71]), {
    status: 200, headers: { 'content-type': 'image/png' }
  });
}

/* ---- The checks --------------------------------------------------------- */

async function checkEdgeImage() {
  upstreamImage();
  const { default: handler } = await importFresh(EDGE);
  const { planRequest } = await importFresh(POLICY);
  const url = new URL('https://terra.example' + SCREENSHOT);
  const plan = planRequest(url.searchParams.get('endpoint'), k => url.searchParams.get(k), url.searchParams.keys());
  const res = await handler(new Request(url));
  const browser = res.headers.get('cache-control');
  const edge = res.headers.get('vercel-cdn-cache-control');
  if (res.status !== 200) return bad('edge image', 'expected 200, got ' + res.status);
  if (browser !== 'no-store') return bad('edge image', 'the browser is told ' + JSON.stringify(browser));
  if (!edge || edge !== plan.edgeCacheControl) {
    return bad('edge image', 'the edge window is ' + JSON.stringify(edge) +
      ' where the policy says ' + JSON.stringify(plan.edgeCacheControl));
  }
  ok('edge image', 'browser: no-store · edge: ' + edge);
}

async function checkEdgeRefusal() {
  upstreamImage();
  const { default: handler } = await importFresh(EDGE);
  const res = await handler(new Request('https://terra.example/api/helioviewer?endpoint=nope'));
  const browser = res.headers.get('cache-control');
  if (res.status !== 400 || browser !== 'no-store') {
    return bad('edge refusal', 'expected 400 with no-store, got ' + res.status + ' with ' + JSON.stringify(browser));
  }
  ok('edge refusal', 'a bad request is refused with no-store');
}

/* The local server starts listening when it is imported, so its route is read
   instead: helioviewerHandler, up to the server it belongs to, without its line
   comments. */
async function checkLocal(read) {
  const src = await read(LOCAL);
  const start = src.indexOf('async function helioviewerHandler');
  const end = src.indexOf('\ncreateServer(', start);
  if (start < 0 || end < 0) return bad('local server', 'helioviewerHandler not found in ' + LOCAL);
  const route = src.slice(start, end).replace(/^\s*\/\/.*$/gm, '');
  const wrong = [];
  if (!/'Cache-Control':\s*plan\.cacheControl\b/.test(route)) wrong.push('Cache-Control does not come from the policy');
  if (/s-maxage/.test(route)) wrong.push('an s-maxage is written by hand');
  if (/Vercel-CDN-Cache-Control/i.test(route)) wrong.push('an edge window is sent to the browser');
  if (wrong.length) return bad('local server', wrong.join('; '));
  ok('local server', "the browser gets the policy's header, and no edge window");
}

/* The sun state needs three.js and a renderer to run, so its exit() is read: the
   one in the state's definition, from its name to its closing brace, without
   comments. */
async function checkSunExit(read) {
  const src = stripComments(await read(SUN));
  const definition = src.indexOf('const definition = {');
  const at = definition < 0 ? -1 : src.indexOf('exit() {', definition);
  if (at < 0) return bad('sun exit', 'exit() not found in the definition in ' + SUN);
  let depth = 0, end = -1;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { end = i; break; }
  }
  const body = src.slice(at, end + 1);
  if (!/\bscene\.layers\b/.test(body) || !/\bclear(?:Layer|Slot)\s*\(/.test(body)) {
    return bad('sun exit', 'exit() leaves the slots holding their pictures');
  }
  ok('sun exit', 'leaving the sun state clears every slot that holds a picture');
}

/* ---- Breaks ------------------------------------------------------------- */

/* One file edited in place and put back, whatever happens. An edit that finds
   nothing to change throws, so a break cannot pass by breaking nothing. */
async function withEdit(rel, from, to, run) {
  const path = join(ROOT, rel);
  const original = await readFile(path, 'utf8');
  if (!original.includes(from)) throw new Error('"' + from.trim() + '" is not in ' + rel);
  await writeFile(path, original.replace(from, to));
  try { await run(); } finally { await writeFile(path, original); }
}

/* ---- Running ------------------------------------------------------------ */

await checkEdgeImage();
await checkEdgeRefusal();
await checkLocal(fromDisk);
await checkSunExit(fromDisk);

for (const r of results) {
  console.log((r.pass ? '  ok    ' : '  FAIL  ') + r.name.padEnd(14) + r.detail);
}
let failed = results.filter(r => !r.pass).length;

if (selftest) {
  console.log('\n  --selftest: every check below has to FAIL');
  const breaks = [
    ['the edge window left out',
      () => withEdit(EDGE, "      'Vercel-CDN-Cache-Control': plan.edgeCacheControl\n", '', checkEdgeImage)],
    ['the browser allowed to keep an image',
      () => withEdit(EDGE, "'Cache-Control': plan.cacheControl,", "'Cache-Control': 'public, max-age=86400',", checkEdgeImage)],
    ['a refusal without no-store',
      () => withEdit(EDGE, "    'Cache-Control': BROWSER_CACHE,\n", '', checkEdgeRefusal)],
    ['an s-maxage in the local server',
      () => withEdit(LOCAL, "      'Cache-Control': plan.cacheControl\n", "      'Cache-Control': 'public, s-maxage=86400'\n",
        () => checkLocal(fromDisk))],
    ['the stills kept when the sun state is left',
      () => withEdit(SUN, '      for (const layer of scene.layers) if (layer.texture) scene.clearLayer(layer);\n', '',
        () => checkSunExit(fromDisk))]
  ];
  for (const [name, run] of breaks) {
    const before = results.length;
    let caught = false;
    try {
      await run();
      caught = results.length > before && results.slice(before).every(r => !r.pass);
    } catch (e) {
      console.log('  FAIL  break: ' + name + ' could not be applied: ' + e.message);
    }
    console.log((caught ? '  ok    ' : '  FAIL  ') + ('break: ' + name).padEnd(50) +
      (caught ? 'caught' : 'SLIPPED THROUGH'));
    if (!caught) failed++;
    results.length = before;
  }
}

if (failed) {
  console.log('\n' + failed + ' failed');
  process.exit(1);
}
console.log('\nall green (' + results.length + ' checks' + (selftest ? ' plus 5 breaks' : '') + ')');
