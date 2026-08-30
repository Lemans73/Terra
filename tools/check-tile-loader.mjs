/* check-tile-loader.mjs — de tegelloader tegen een nepserver.
 *
 *   node tools/check-tile-loader.mjs
 *
 * WAAROM DIT BESTAAT.
 * De loader gaat over wat er NIET gebeurt: niet te snel, niet dubbel, niet
 * eindeloos opnieuw, niet na afbreken. Dat is met een echte bron niet te
 * toetsen — je krijgt een weigering niet op commando, en een rate limit al
 * helemaal niet. Vandaar dat `fetch` een parameter is: hier komt er een
 * nepserver in die precies antwoordt wat de toets nodig heeft.
 *
 * DE DUURSTE VAL STAAT ER OOK IN. EOX weigert met status 200 en een WEBPAGINA.
 * De browser noemt dat succes; zonder de content-type-toets krijgt de bezoeker
 * stil niets te zien. Zo'n geval krijg je bij een echte bron nooit gecontroleerd
 * te pakken, en dat is precies waarom hij hier staat.
 *
 * ELKE TOETS ZEGT WAT HIJ VERWACHT EN WAT HIJ ZAG. Een toets die alleen "ok"
 * roept, toetst op den duur niets meer.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOADER = 'js/layers/tile-shell/loader.js';
const selftest = process.argv.includes('--selftest');

async function laadLoader() {
  const m = await import('file://' + join(ROOT, LOADER) + '?t=' + process.hrtime.bigint());
  return m.createTileLoader;
}

/* ---- de omgeving die de loader in de browser aantreft --------------------- */

let bitmapTeller = 0;
globalThis.createImageBitmap = async (blob) => {
  bitmapTeller++;
  return { width: 256, height: 256, close() {}, _blob: blob };
};
globalThis.document = { createElement: () => ({ getContext: () => ({ translate() {}, scale() {}, drawImage() {} }) }) };
globalThis.AbortController = globalThis.AbortController || class { constructor() { this.signal = {}; } abort() {} };

const THREE = {
  CanvasTexture: class { constructor(img) { this.image = img; this.userData = {}; } dispose() {} },
  SRGBColorSpace: 'srgb', ClampToEdgeWrapping: 1001,
  LinearMipmapLinearFilter: 1008, LinearFilter: 1006
};

const wgs84 = { grid: 'wgs84' };
const basis = { getSource: () => ({ grid: 'wgs84', maxLevel: 13 }), getGrid: () => wgs84 };

const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

/* Een nepserver die per URL antwoordt wat de toets vraagt. `log` houdt bij wat
   er werkelijk de deur uitging — dat is waar de meeste toetsen op kijken. */
function nepServer(antwoord) {
  const log = [];
  const haal = async (url, init) => {
    log.push({ url, t: Date.now() });
    const a = await antwoord(url, log.length);
    if (a.throwName) { const e = new Error(a.throwName); e.name = a.throwName; throw e; }
    return {
      ok: a.status >= 200 && a.status < 300,
      status: a.status,
      headers: { get: (h) => (h.toLowerCase() === 'content-type' ? a.type : a.headers?.[h] || null) },
      blob: async () => ({ size: a.size || 5000, type: a.type })
    };
  };
  return { haal, log };
}

const beeld = { status: 200, type: 'image/jpeg', size: 5000 };

async function draaiToetsen(createTileLoader, stil) {
  let fout = 0;
  function toets(naam, gelukt, verwacht, gezien) {
    console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}`);
    if (!gelukt) { console.log(`         verwacht: ${verwacht}\n         gezien:   ${gezien}`); fout++; }
}

  /* ---- 1. ontdubbelen ------------------------------------------------------- */
  {
    const { haal, log } = nepServer(async () => beeld);
    const l = createTileLoader(THREE, { ...basis, fetch: haal });
    const k = l.request('eox-cloudless', 3, 1, 1, 0);
    l.request('eox-cloudless', 3, 1, 1, 0);
    l.request('eox-cloudless', 3, 1, 1, 0);
    /* DE WACHTRIJ METEN EN NIET HET AANTAL VERZOEKEN. setWanted() gooit alles weg
       wat niet in de lijst staat, en dat maskeert juist een gebroken ontdubbeling:
       de dubbele entries verdwijnen dan langs een andere weg en de toets blijft
       groen. De zelftest wees dat aan. */
    const inRij = l.stats().queued;
    l.setWanted([k]);
    l.pump(); await wacht(60);
    toets('drie keer dezelfde tegel vragen geeft ÉÉN wachtrij-entry en ÉÉN verzoek',
          inRij === 1 && log.length === 1, '1 in de rij, 1 verzoek',
          `${inRij} in de rij, ${log.length} verzoeken`);
}

  /* ---- 2. gelijktijdigheid --------------------------------------------------- */
  {
    let open = 0, piek = 0;
    const { haal } = nepServer(async () => { open++; piek = Math.max(piek, open); await wacht(40); open--; return beeld; });
    const l = createTileLoader(THREE, { ...basis, fetch: haal, maxConcurrent: 6, ratePerSec: 1000, burst: 1000 });
    const keys = [];
    for (let i = 0; i < 30; i++) keys.push(l.request('eox-cloudless', 4, i, 0, i));
    l.setWanted(keys);
    l.pump(); await wacht(20); l.pump(); await wacht(150);
    toets('nooit meer dan 6 verzoeken tegelijk open', piek <= 6, 'hoogstens 6', `piek ${piek}`);
}

  /* ---- 3. tempo -------------------------------------------------------------- */
  {
    const { haal, log } = nepServer(async () => beeld);
    const l = createTileLoader(THREE, { ...basis, fetch: haal, maxConcurrent: 100, ratePerSec: 8, burst: 8 });
    const keys = [];
    for (let i = 0; i < 40; i++) keys.push(l.request('eox-cloudless', 5, i, 0, i));
    l.setWanted(keys);
    l.pump();                       // de emmer is 8 diep, dus dit mag er 8
    const naEerste = log.length;
    toets('de emmer laat er hoogstens 8 tegelijk door',
          naEerste <= 8, 'hoogstens 8 in de eerste ronde', `${naEerste}`);
}

  /* ---- 4. DE EOX-VAL: status 200 met een webpagina --------------------------- */
  {
    const { haal, log } = nepServer(async () => ({ status: 200, type: 'text/html', size: 900 }));
    const l = createTileLoader(THREE, { ...basis, fetch: haal });
    const k = l.request('eox-cloudless', 3, 2, 1, 0);
    l.setWanted([k]);
    l.pump(); await wacht(60);
    const s = l.stats();
    toets('een weigering met status 200 en HTML telt als weigering, niet als beeld',
          s.htmlRefusals === 1 && !l.hasTexture(k), 'geen textuur, 1 htmlRefusal',
          `htmlRefusals=${s.htmlRefusals}, textuur=${l.hasTexture(k)}`);
}

  /* ---- 5. 404 geeft geen herhaling ------------------------------------------- */
  {
    const { haal, log } = nepServer(async () => ({ status: 404, type: 'text/plain' }));
    const l = createTileLoader(THREE, { ...basis, fetch: haal });
    const k = l.request('eox-bluemarble', 3, 3, 1, 0);
    l.setWanted([k]);
    l.pump(); await wacht(60);
    for (let i = 0; i < 5; i++) { l.pump(); await wacht(20); }
    toets('een 404 wordt niet herhaald', log.length === 1, '1 verzoek', `${log.length}`);
}

  /* ---- 6. een 503 wordt WEL herhaald, met wachttijd ertussen ------------------ */
  {
    const { haal, log } = nepServer(async () => ({ status: 503, type: 'text/plain' }));
    const l = createTileLoader(THREE, { ...basis, fetch: haal, maxAttempts: 3 });
    const k = l.request('eox-bluemarble', 3, 4, 1, 0);
    l.setWanted([k]);
    l.pump(); await wacht(50);
    const naEerste = log.length;
    l.pump();                                   // meteen daarna: nog te vroeg
    const meteen = log.length;
    await wacht(700); l.pump(); await wacht(50); // na de backoff: nu wel
    toets('een 503 wacht vóór de tweede poging',
          naEerste === 1 && meteen === 1 && log.length === 2,
          '1, dan nog 1, dan 2', `${naEerste}, ${meteen}, ${log.length}`);
}

  /* ---- 7. de breaker gaat dicht ---------------------------------------------- */
  {
    const { haal, log } = nepServer(async () => ({ status: 500, type: 'text/plain' }));
    const l = createTileLoader(THREE, { ...basis, fetch: haal, maxAttempts: 1, useFallback: false });
    const keys = [];
    for (let i = 0; i < 8; i++) keys.push(l.request('eox-bluemarble', 6, i, 2, i));
    l.setWanted(keys);
    for (let r = 0; r < 6; r++) { l.pump(); await wacht(40); }
    const s = l.stats();
    toets('na vijf mislukkingen gaat de bron dicht',
          s.breakerOpen.includes('eox-bluemarble'), 'eox-bluemarble in breakerOpen',
          JSON.stringify(s.breakerOpen));
}

  /* ---- 8. afbreken bij wegkijken --------------------------------------------- */
  {
    let afgebroken = 0;
    globalThis.AbortController = class { constructor() { this.signal = {}; } abort() { afgebroken++; } };
    const { haal } = nepServer(async () => { await wacht(200); return beeld; });
    const l = createTileLoader(THREE, { ...basis, fetch: haal });
    const k = l.request('eox-cloudless', 7, 5, 3, 0);
    l.setWanted([k]);
    l.pump(); await wacht(30);
    l.setWanted([]);                            // de bezoeker kijkt ergens anders
    toets('een verzoek dat niemand meer wil wordt afgebroken',
          afgebroken === 1 && l.stats().aborted === 1, '1 afgebroken', `${afgebroken}`);
}

  /* ---- 9. terugval alleen binnen hetzelfde raster ----------------------------- */
  {
    const { haal } = nepServer(async () => ({ status: 500, type: 'text/plain' }));
    // eox-cloudless valt terug op eox-bluemarble: zelfde raster, dus toegestaan
    const l = createTileLoader(THREE, { ...basis, fetch: haal, maxAttempts: 1 });
    const k = l.request('eox-cloudless', 5, 1, 1, 0);
    l.setWanted([k]);
    l.pump(); await wacht(60);
    const zelfdeRaster = l.stats().fallbacks;
    // en met een bron waarvan het raster NIET klopt hoort er niets terug te vallen
    const l2 = createTileLoader(THREE, {
      fetch: haal, getGrid: () => ({ grid: 'gibs' }), getSource: () => ({ grid: 'gibs', maxLevel: 7 }),
      maxAttempts: 1
    });
    const k2 = l2.request('eox-cloudless', 5, 1, 1, 0);
    l2.setWanted([k2]);
    l2.pump(); await wacht(60);
    toets('terugval mag binnen hetzelfde raster en niet daarbuiten',
          zelfdeRaster === 1 && l2.stats().fallbacks === 0,
          'zelfde raster 1, ander raster 0', `${zelfdeRaster} en ${l2.stats().fallbacks}`);
}

  /* ---- 10. het textuurbudget telt in bytes ------------------------------------ */
  {
    const { haal } = nepServer(async () => beeld);
    // 256x256x4x1.34 = 351 kB per tegel; een budget van 1 MB past er dus 2 heel
    const l = createTileLoader(THREE, { ...basis, fetch: haal, textureBudgetMB: 1, ratePerSec: 1000, burst: 1000 });
    const keys = [];
    for (let i = 0; i < 10; i++) keys.push(l.request('eox-cloudless', 8, i, 4, i));
    /* ALLE TIEN EERST GEWENST, anders gooit setWanted de negen andere weg vóór ze
       geladen zijn en raakt het budget nooit aan. Pas als ze binnen zijn wordt de
       selectie kleiner — en dan hoort het opruimen toe te slaan. */
    l.setWanted(keys);
    for (let r = 0; r < 6; r++) { l.pump(); await wacht(40); }
    const geladen = l.stats().textures;
    l.setWanted(keys.slice(0, 1));             // nog maar één in beeld
    l.pump(); await wacht(40);
    const s = l.stats();
    toets('het textuurgeheugen blijft onder zijn budget',
          geladen >= 5 && s.textureMB <= 1.1, `>=5 geladen en daarna hoogstens ~1 MB`,
          `${geladen} geladen, daarna ${s.textureMB} MB over ${s.textures} texturen`);
}

  /* ---- 11. de schijfcache scheelt netwerk ------------------------------------- */
  {
    const opSchijf = new Map();
    const nepCache = {
      get: async (url) => opSchijf.get(url) || null,
      put: async (url, blob) => { opSchijf.set(url, blob); },
      isAvailable: () => true
    };
    const { haal, log } = nepServer(async () => beeld);
    const l = createTileLoader(THREE, { ...basis, fetch: haal, cache: nepCache });
    const k = l.request('eox-cloudless', 9, 1, 1, 0);
    l.setWanted([k]); l.pump(); await wacht(60);
    const naEerste = log.length;
    const l2 = createTileLoader(THREE, { ...basis, fetch: haal, cache: nepCache });
    const k2 = l2.request('eox-cloudless', 9, 1, 1, 0);
    l2.setWanted([k2]); l2.pump(); await wacht(60);
    toets('een tegel van schijf kost geen tweede verzoek',
          naEerste === 1 && log.length === 1 && l2.stats().cacheHits === 1,
          '1 verzoek totaal, 1 cachetreffer', `${log.length} verzoeken, ${l2.stats().cacheHits} treffers`);
}

  return fout;
}

if (!selftest) {
  const fout = await draaiToetsen(await laadLoader(), false);
  console.log(fout ? `\n${fout} toets(en) rood.` : '\nAlles groen (11 toetsen).');
  process.exit(fout ? 1 : 0);
} else {
  /* ELKE BREUK MOET ZIJN TOETS LATEN UITSLAAN. Een suite die groen blijft nadat
     je de code sloopt, toetst niets — en dat is in dit project vaker gebeurd dan
     welke echte bug ook. */
  console.log('zelftest — elke breuk MOET zijn toets laten uitslaan\n');
  const gevallen = [
    /* DE SLEUTEL UNIEK MAKEN, en niet de `if (e)` weghalen: `entries` is een Map
       op die sleutel, dus ontdubbelen gebeurt daar sowieso. Zo'n breuk gaat er
       terecht ongezien doorheen — de zelftest wees dat aan. */
    ['ontdubbelen weggehaald',
     (s) => s.replace('    const key = texKey(srcId, level, x, y);\n    const tex = textures.get(key);',
                      '    const key = texKey(srcId, level, x, y) + Math.random();\n    const tex = textures.get(key);')],
    ['de content-type-toets weggehaald (de EOX-val)',
     (s) => s.replace("        if (res.ok && !type.startsWith('image/')) {", '        if (false) {')],
    ['de rastercontrole bij terugval weggehaald',
     (s) => s.replace("    if (!f || f.grid !== getSource().grid || f.maxLevel < e.level) { mislukt(e); return; }",
                      '    if (!f) { mislukt(e); return; }')],
    ['het textuurbudget genegeerd',
     (s) => s.replace('    if (texMemory <= NET.textureBudget) return;', '    return;')],
    ['de gelijktijdigheidsgrens weggehaald',
     (s) => s.replace('      if (inFlight >= NET.maxConcurrent) break;', '')]
  ];
  const pad = join(ROOT, LOADER);
  const origineel = await readFile(pad, 'utf8');
  let mis = 0;
  for (const [naam, breek] of gevallen) {
    const kapot = breek(origineel);
    if (kapot === origineel) { console.log(`  MISLUKT ${naam} — er viel niets te breken`); mis++; continue; }
    await writeFile(pad, kapot);
    let fout = 0;
    try { fout = await draaiToetsen(await laadLoader(), true); }
    catch { fout = 1; }
    finally { await writeFile(pad, origineel); }
    if (fout) console.log(`  ok      ${naam} → gezien (${fout} toets(en) rood)`);
    else { console.log(`  MISLUKT ${naam} → GING ER ONGEZIEN DOORHEEN`); mis++; }
  }
  console.log(mis ? `\nSELFTEST MISLUKT — ${mis} breuk(en) ongezien.`
                  : `\nSELFTEST GESLAAGD — alle ${gevallen.length} breuken sloegen door naar hun toets.`);
  process.exit(mis ? 1 : 0);
}
