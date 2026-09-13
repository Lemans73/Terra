/* ============================================================
   check-texture-bitmap.mjs — is every image texture the right way up?
   ------------------------------------------------------------
   WebGL ignores `flipY` on an ImageBitmap, so a texture made from a
   bitmap decoded as it comes shows its picture upside down, and nothing
   in the scene, the uniforms or the console says so.
   js/core/texture-bitmap.js turns the picture over while decoding; this
   holds the decoder to that, and every caller to the decoder.

     1  the decoder asks for imageOrientation 'flipY'
     2  where that option throws, the fallback turns a canvas over
     3  createImageBitmap is called in the decoder and nowhere else
     4  every file that decodes for a texture sets flipY = false

   WHY IT IS WORTH A CHECK. Measured on the sun state in session 53: a
   frame decoded without the turn correlates 0.957 with its source upside
   down and 0.261 with the source as it is, and every earlier measurement
   of the regions against the source image still passed.

   `--selftest` breaks each check on purpose and demands that it fails.
   A check that passes on a broken input is not a check.
   ============================================================ */

import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripComments } from './check-comment-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DECODER = 'js/core/texture-bitmap.js';

/* The files that decode an image for a texture. A new one belongs here; if it
   is forgotten, check 3 finds its createImageBitmap call. */
const CALLERS = ['js/states/sun.js', 'js/layers/tile-shell/loader.js'];

const fromDisk = rel => readFile(join(ROOT, rel), 'utf8');

const results = [];
const ok = (name, detail) => results.push({ name, pass: true, detail });
const bad = (name, detail) => results.push({ name, pass: false, detail });

/* ---- The browser the decoder expects ------------------------------------ */

/* A bitmap of 64 by 48 and a canvas that writes down what is done to it. With
   `optionThrows` the engine refuses the option, the way one that does not know
   `imageOrientation` does. */
function browser({ optionThrows }) {
  const calls = [], ops = [];
  globalThis.createImageBitmap = async (source, options) => {
    calls.push({ source, options });
    if (options && optionThrows) throw new TypeError("imageOrientation is not supported");
    return { width: 64, height: 48, source, options, close() { ops.push('close'); } };
  };
  globalThis.document = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({
        translate: (x, y) => ops.push('translate ' + x + ' ' + y),
        scale: (x, y) => ops.push('scale ' + x + ' ' + y),
        drawImage: () => ops.push('drawImage')
      })
    })
  };
  return { calls, ops };
}

/* ---- The checks --------------------------------------------------------- */

async function checkOption(decode) {
  const env = browser({ optionThrows: false });
  const blob = { size: 1 };
  const bitmap = await decode(blob);
  const call = env.calls[0];
  if (env.calls.length !== 1 || !call || call.source !== blob) {
    return bad('option', 'expected one decode of the blob, got ' + env.calls.length);
  }
  if (!call.options || call.options.imageOrientation !== 'flipY') {
    return bad('option', 'the decoder asked for ' + JSON.stringify(call.options || null) +
      ' instead of imageOrientation flipY');
  }
  if (!bitmap || bitmap.options !== call.options) return bad('option', 'the bitmap handed back is not the turned one');
  ok('option', "one decode, with imageOrientation 'flipY'");
}

async function checkFallback(decode) {
  const env = browser({ optionThrows: true });
  const bitmap = await decode({ size: 1 });
  const at = step => env.ops.indexOf(step);
  const draw = at('drawImage');
  if (draw < 0 || at('translate 0 48') < 0 || at('scale 1 -1') < 0 ||
      at('translate 0 48') > draw || at('scale 1 -1') > draw) {
    return bad('fallback', 'the canvas was not turned over before drawing: ' + env.ops.join(', '));
  }
  if (at('close') < 0) return bad('fallback', 'the plain bitmap was not closed');
  const last = env.calls[env.calls.length - 1];
  if (!last || last.options || !last.source || last.source.height !== 48 || bitmap.source !== last.source) {
    return bad('fallback', 'what came back is not a decode of the turned canvas');
  }
  ok('fallback', 'where the option throws, a canvas is turned over and decoded');
}

async function listJs(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listJs(path));
    else if (entry.name.endsWith('.js')) out.push(relative(ROOT, path).split('\\').join('/'));
  }
  return out;
}

/* Every module under js/, comments stripped, plus index.html as it stands: a
   mention inside an HTML comment is a false alarm rather than a false all-clear. */
async function checkOnlyDecoder(read) {
  const offenders = [];
  for (const rel of await listJs(join(ROOT, 'js'))) {
    if (rel === DECODER) continue;
    if (/\bcreateImageBitmap\s*\(/.test(stripComments(await read(rel)))) offenders.push(rel);
  }
  if (/\bcreateImageBitmap\s*\(/.test(await read('index.html'))) offenders.push('index.html');
  if (offenders.length) {
    return bad('one decoder', 'createImageBitmap called outside ' + DECODER + ': ' + offenders.join(', '));
  }
  ok('one decoder', 'createImageBitmap is called in ' + DECODER + ' and nowhere else');
}

async function checkCallers(read) {
  const wrong = [];
  for (const rel of CALLERS) {
    const code = stripComments(await read(rel));
    if (!/\bdecodeTextureBitmap\s*\(/.test(code)) wrong.push(rel + ' does not decode through decodeTextureBitmap');
    if (!/\.flipY\s*=\s*false\b/.test(code)) wrong.push(rel + ' never sets flipY = false');
  }
  if (wrong.length) return bad('callers', wrong.join('; '));
  ok('callers', CALLERS.length + ' callers decode through the decoder and set flipY = false');
}

/* ---- The control implementations --------------------------------------- */

// The obvious decode, without the turn.
const plainDecode = async source => createImageBitmap(source);

// A fallback that draws without turning the canvas over.
const flatFallback = async source => {
  try {
    return await createImageBitmap(source, { imageOrientation: 'flipY' });
  } catch {
    const plain = await createImageBitmap(source);
    const canvas = document.createElement('canvas');
    canvas.width = plain.width;
    canvas.height = plain.height;
    canvas.getContext('2d').drawImage(plain, 0, 0);
    plain.close();
    return createImageBitmap(canvas);
  }
};

/* One file read from disk with one replacement. A replacement that finds
   nothing throws, so a break cannot pass by not breaking anything. */
function editedRead(file, from, to) {
  return async rel => {
    const text = await fromDisk(rel);
    if (rel !== file) return text;
    if (!text.includes(from)) throw new Error('break could not be applied: "' + from + '" is not in ' + file);
    return text.replace(from, to);
  };
}

/* ---- Running ------------------------------------------------------------ */

const { decodeTextureBitmap } = await import(pathToFileURL(join(ROOT, DECODER)).href);
const selftest = process.argv.includes('--selftest');

await checkOption(decodeTextureBitmap);
await checkFallback(decodeTextureBitmap);
await checkOnlyDecoder(fromDisk);
await checkCallers(fromDisk);

for (const r of results) {
  console.log((r.pass ? '  ok    ' : '  FAIL  ') + r.name.padEnd(13) + r.detail);
}
let failed = results.filter(r => !r.pass).length;

if (selftest) {
  console.log('\n  --selftest: every check below has to FAIL');
  const breaks = [
    ['a decoder without the option', () => checkOption(plainDecode)],
    ['a fallback that does not turn', () => checkFallback(flatFallback)],
    ['a raw createImageBitmap in the sun state',
      () => checkOnlyDecoder(editedRead('js/states/sun.js', 'decodeTextureBitmap(blob)', 'createImageBitmap(blob)'))],
    ['a sun texture left to flip',
      () => checkCallers(editedRead('js/states/sun.js', 'texture.flipY = false;', ''))]
  ];
  for (const [name, run] of breaks) {
    const before = results.length;
    await run();
    const caught = results.length > before && results.slice(before).every(r => !r.pass);
    console.log((caught ? '  ok    ' : '  FAIL  ') + ('break: ' + name).padEnd(48) +
      (caught ? 'caught' : 'SLIPPED THROUGH'));
    if (!caught) failed++;
    results.length = before;
  }
}

if (failed) {
  console.log('\n' + failed + ' failed');
  process.exit(1);
}
console.log('\nall green (' + results.length + ' checks' + (selftest ? ' plus 4 breaks' : '') + ')');
