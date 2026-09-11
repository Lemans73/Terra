/* check-attribution.mjs — is everything Terra shows also credited?
 *
 *   node tools/check-attribution.mjs
 *   node tools/check-attribution.mjs --selftest
 *
 * WHY THIS EXISTS.
 * ATTRIBUTION.md was verified on 2026-07-30 and was accurate that day. The tile
 * shell arrived after it and the Sun after that, and neither of them appeared in
 * the file — EOX, Sentinel, Copernicus, Helioviewer, NASA/SDO and SOHO were all
 * missing, for six weeks, while the application showed their imagery. Nothing
 * reported it, because a credit that is absent looks exactly like a credit that
 * is not required.
 *
 * For EOX the wording is not ours to paraphrase: they asked for it in a specific
 * shape, and a credit that is nearly right is a licence condition that is not
 * met.
 *
 *   1  the EOX wording, exactly as they asked for it
 *   2  the credit carries the YEAR of the vintage on screen
 *   3  every tile source is named in ATTRIBUTION.md
 *   4  every owner behind the solar imagery is named
 *
 * CHECK 2 IS THE ONE THAT ROTS QUIETLY. Seven vintages, one credit line: fix the
 * year and it stays right for a year and then lies. So the note holds a
 * placeholder and tileAttribution() fills it, and this checks both halves.
 *
 * Run:  node tools/check-attribution.mjs            (exit 0 = green)
 *       node tools/check-attribution.mjs --selftest (every break must show)
 */

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = 'ATTRIBUTION.md';
const TILES = 'js/layers/tile-shell/sources.js';

const selftest = process.argv.includes('--selftest');

/* Their words, from the reply of 2026-09-10. As CONTIGUOUS phrases and not as
   loose words: the first version of this check looked for the four pieces
   anywhere in the file and passed while the url sat in a heading three lines
   above the credit. Four true statements, and together they proved nothing.
   The line break inside the blockquote falls where EOX's own wording has one. */
const EOX_WORDING = [
  'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH',
  'Contains modified Copernicus Sentinel data'
];

/* Who owns what the Sun view puts on screen. Helioviewer serves it; NASA and ESA
   own it. All three have to be named, because naming only the server would
   credit the postman. */
const SOLAR_OWNERS = ['Helioviewer', 'NASA/SDO', 'SOHO'];

function report(ok, text, extra) {
  console.log((ok ? '  ok   ' : '  FAIL ') + ' ' + text + (extra ? ' — ' + extra : ''));
  return ok ? 0 : 1;
}

/* 1. The wording, part by part, so a failure says which part. */
function checkWording(doc) {
  const missing = EOX_WORDING.filter(w => !doc.includes(w));
  return missing.length
    ? report(false, 'the EOX wording is incomplete in ' + DOC, missing.join(' | '))
    : report(true, 'the EOX wording is present, in full');
}

/* 2. A year that follows the layer, not a year that was true once. */
function checkYear(mod, doc) {
  const raw = mod.TILE_SOURCES['eox-cloudless'];
  const note = raw && raw.attribution && raw.attribution.note;
  if (!note || !note.includes('{year}')) {
    return report(false, 'the EOX note carries no {year} placeholder',
                  'a fixed year is right until the vintage changes');
  }
  const filled = mod.tileAttribution('eox-cloudless', '2017')
    .find(a => a.id === 'eox-cloudless');
  if (!filled || !/Sentinel data 2017$/.test(filled.note)) {
    return report(false, 'tileAttribution() does not fill the year',
                  'got: ' + (filled ? filled.note : 'nothing'));
  }
  const dflt = mod.tileAttribution('eox-cloudless')
    .find(a => a.id === 'eox-cloudless');
  if (/\{year\}/.test(dflt.note)) {
    return report(false, 'the default vintage leaves {year} unfilled', dflt.note);
  }
  const shown = dflt.note.match(/(\d{4})$/);
  if (!shown || !doc.includes('The default is ' + shown[1])) {
    return report(false, DOC + ' names a different default vintage',
                  'code says ' + (shown ? shown[1] : '?'));
  }
  return report(true, 'the credit carries the vintage year, and the file agrees',
                'default ' + shown[1]);
}

/* 3. Every source the shell can put on screen. */
function checkTileSources(mod, doc) {
  const missing = Object.values(mod.TILE_SOURCES)
    .map(s => s.attribution && s.attribution.name)
    .filter(Boolean)
    .filter(name => !doc.includes(name));
  return missing.length
    ? report(false, 'tile sources missing from ' + DOC, missing.join(', '))
    : report(true, 'every tile source is named in ' + DOC);
}

/* 4. And everyone behind the solar frames. */
function checkSolar(doc) {
  const missing = SOLAR_OWNERS.filter(o => !doc.includes(o));
  return missing.length
    ? report(false, 'solar imagery owners missing from ' + DOC, missing.join(', '))
    : report(true, 'every owner behind the solar frames is named');
}

/* 5. NOAA's products, COUNTED RATHER THAN REMEMBERED.

   The file said "Four products are used" while the app had grown to more, and
   nothing noticed: a sentence is not a list, and a number in prose goes stale
   in silence. So the number is derived from the code — every SWPC product the
   sun side asks for — and the sentence has to agree with it.

   The same series in three lengths (one day, three days, seven days) is ONE
   product; the file names differ only in how far back they reach.

   The aurora and the magnetosphere read SWPC too, and they belong to sections
   this check does not cover. They are skipped here rather than silently
   counted — see the open point about them in ATTRIBUTION.md. */
const SWPC_SOURCES = ['index.html', 'js/layers/sun/xray-feed.js'];
const SWPC_SKIP = /ovation|magnetometer|solar-wind|planetary_k/i;
const NUMBER_WORDS = ['no', 'One', 'Two', 'Three', 'Four', 'Five', 'Six',
                      'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];

async function checkNoaa(doc) {
  const products = new Set();
  for (const f of SWPC_SOURCES) {
    const src = await readFile(join(ROOT, f), 'utf8');
    const hits = [
      ...src.matchAll(/https:\/\/services\.swpc\.noaa\.gov\/[A-Za-z0-9/_.-]+\.json/g),
      // The feed builds its urls from a base and a file name, so the names stand
      // alone there; only the sun's own modules are read this way.
      ...(f.startsWith('js/') ? src.matchAll(/['"]([A-Za-z0-9_-]+\.json)['"]/g) : [])
    ].map(m => m[0]);
    for (const url of hits) {
      if (SWPC_SKIP.test(url)) continue;
      const base = url.split('/').pop().replace(/['"]/g, '');
      products.add(base.replace(/-\d+-(day|hour)\.json$/, '.json'));
    }
  }
  const word = NUMBER_WORDS[products.size] || String(products.size);
  const said = /\b(no|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve) products are used\b/.exec(doc);
  if (!doc.includes('NOAA Space Weather Prediction Center')) {
    return report(false, 'NOAA SWPC is not named in ' + DOC);
  }
  if (!/\bGOES\b/.test(doc)) {
    return report(false, 'the GOES satellites are not named in ' + DOC);
  }
  if (!said) return report(false, 'no product count in ' + DOC, 'expected "' + word + ' products are used"');
  if (said[1] !== word) {
    return report(false, DOC + ' counts ' + said[1].toLowerCase() + ' NOAA products, the code asks for ' + products.size,
      [...products].join(', '));
  }
  return report(true, 'the ' + products.size + ' NOAA products in the code are the ' + word.toLowerCase() + ' the file names');
}

async function run(docPath = DOC, tilesPath = TILES) {
  const doc = await readFile(join(ROOT, docPath), 'utf8');
  const mod = await import('../' + tilesPath + '?v=' + Date.now());
  let bad = 0;
  bad += checkWording(doc);
  bad += checkYear(mod, doc);
  bad += checkTileSources(mod, doc);
  bad += checkSolar(doc);
  bad += await checkNoaa(doc);
  return bad;
}

/* THE CHECK ON THE CHECK. Breaks go on copies; an interrupted run leaves
   nothing damaged behind. */
async function selftestRun() {
  const doc = await readFile(join(ROOT, DOC), 'utf8');
  const tiles = await readFile(join(ROOT, TILES), 'utf8');
  const tmpDoc = '__ATTRIBUTION-selftest.md';
  const tmpTiles = 'js/layers/tile-shell/__sources-selftest.js';

  const breaks = [
    { name: 'the EOX url dropped from the file',
      doc: (s) => s.replace(/https:\/\/cloudless\.eox\.at/g, 'https://s2maps.eu'),
      tiles: (s) => s },
    { name: 'the credit line broken in the middle',
      doc: (s) => s.replace('EOxCloudless https://cloudless.eox.at by EOX',
                            'EOxCloudless\n> https://cloudless.eox.at by EOX'),
      tiles: (s) => s },
    { name: 'the year placeholder taken out of the note',
      doc: (s) => s,
      tiles: (s) => s.replace('Copernicus Sentinel data {year}', 'Copernicus Sentinel data') },
    { name: 'tileAttribution no longer filling the year',
      doc: (s) => s,
      tiles: (s) => s.replace("a.note = a.note.replace('{year}', year)", 'a.note = a.note') },
    { name: 'a tile source missing from the file',
      doc: (s) => s.replace(/Blue Marble/g, 'Blauwe Knikker'),
      tiles: (s) => s },
    { name: 'the solar imagery owners missing',
      doc: (s) => s.replace(/Helioviewer/g, 'een beeldbank'),
      tiles: (s) => s },
    { name: 'the NOAA product count left behind',
      doc: (s) => s.replace(/\b(One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten) products are used/,
                            'Four products are used'),
      tiles: (s) => s },
    { name: 'the GOES satellites dropped from the file',
      doc: (s) => s.replace(/GOES/g, 'a weather satellite'),
      tiles: (s) => s }
  ];

  let missed = 0;
  for (const b of breaks) {
    await writeFile(join(ROOT, tmpDoc), b.doc(doc));
    await writeFile(join(ROOT, tmpTiles), b.tiles(tiles));
    let bad = 0;
    try { bad = await run(tmpDoc, tmpTiles); }
    catch { bad = 1; }
    finally {
      await unlink(join(ROOT, tmpDoc)).catch(() => {});
      await unlink(join(ROOT, tmpTiles)).catch(() => {});
    }
    if (bad) console.log('  ok    break seen: ' + b.name + '\n');
    else { console.log('  FAIL  break NOT seen: ' + b.name + '\n'); missed++; }
  }
  return missed;
}

if (selftest) {
  console.log('selftest — every break must show\n');
  const missed = await selftestRun();
  console.log(missed ? `\n${missed} break(s) went unnoticed` : '\nall breaks seen');
  process.exit(missed ? 1 : 0);
} else {
  process.exit(await run() ? 1 : 0);
}
