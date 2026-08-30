/* ============================================================
   TERRA — Tile loader · pace, retry, and knowing when to stop
   ------------------------------------------------------------
   Fetching a tile is the easy part. What this file is actually
   about is NOT fetching: not too fast, not what nobody is looking
   at any more, not what already failed five times, and never
   deeper than the source has.

   EOX IS A SMALL COMPANY GIVING THIS AWAY and says itself that
   the load is rising. Measured on 2026-08-30 over 48 sequential
   requests: two came back empty and both succeeded on a retry.
   So the backoff below is not politeness, it is the difference
   between working and not.

   FETCH COMES IN AS A PARAMETER. That was the cheapest decision
   of the whole proof of concept: the loader was built against a
   fake server, and the code that passed those tests is literally
   the code that runs live. It is also the only way to test the
   EOX trap — a refusal that arrives as status 200 with a web page
   — because a real source will not produce one on demand.

   THREE TRAPS THAT ARE SILENT WHEN YOU GET THEM WRONG:

     1  A REFUSAL WITH STATUS 200. The browser calls it success
        and hands you HTML. Check the content-type, always.
     2  three IGNORES texture.flipY ON AN ImageBitmap. The
        orientation has to be right at DECODE time, otherwise
        every tile is upside down inside its own frame and the
        north pole lands in the tropics.
     3  TEXTURE MEMORY IS COUNTED IN BYTES, NOT IN TILES. A
        512-pixel tile with mipmaps is about 1.4 MB on the GPU.
        Seven hundred of those is a gigabyte.
   ============================================================ */

import { TILE_SOURCES, TILE_MB, tileUrl } from './sources.js';

export function createTileLoader(THREE, opts = {}) {
  const haal = opts.fetch || ((...a) => fetch(...a));
  const schijf = opts.cache || null;
  const getSource = opts.getSource;
  const getGrid = opts.getGrid;
  if (!getSource || !getGrid) throw new Error('createTileLoader: getSource en getGrid zijn verplicht');

  const NET = {
    maxConcurrent: opts.maxConcurrent || 6,
    /* HET TEMPO STAAT LOS VAN DE GELIJKTIJDIGHEID, en dat is geen dubbelop. Zes
       tegelijk zegt hoeveel er OPEN staan; acht per seconde zegt hoe vaak we
       aankloppen. Zonder het tweede stuurt een snelle verbinding honderden
       verzoeken per seconde zolang er maar zes tegelijk lopen. */
    ratePerSec: opts.ratePerSec || 8,
    burst: opts.burst || 12,
    maxAttempts: opts.maxAttempts || 3,
    baseBackoff: 500, maxBackoff: 8000,
    breakerWindow: 10000, breakerFails: 5, breakerCooldown: 20000,
    textureBudget: (opts.textureBudgetMB || 384) * TILE_MB,
    useFallback: opts.useFallback !== false
  };

  const textures = new Map();
  const entries = new Map();
  const breakers = new Map();
  let inFlight = 0;
  let texMemory = 0;
  let wanted = new Set();
  let subCounter = 0;
  let bucket = { tokens: NET.burst, last: Date.now() };

  const stats = {
    sent: 0, ok: 0, limited: 0, notFound: 0, aborted: 0, retries: 0,
    fallbacks: 0, failed: 0, bytes: 0, cacheHits: 0, cacheBytes: 0, htmlRefusals: 0
  };

  const nu = () => Date.now();
  const texKey = (srcId, z, x, y) => `${srcId}|${z}/${x}/${y}`;

  /* ---- tempo ------------------------------------------------------------- */

  function neemToken(t) {
    bucket.tokens = Math.min(NET.burst, bucket.tokens + ((t - bucket.last) / 1000) * NET.ratePerSec);
    bucket.last = t;
    if (bucket.tokens >= 1) { bucket.tokens -= 1; return true; }
    return false;
  }

  /* ---- circuit breaker ---------------------------------------------------
     Vijf mislukkingen binnen tien seconden en deze bron gaat twintig seconden
     dicht. Zonder dit blijft een app die rate-limited wordt dóórvragen, en dat
     is precies het gedrag dat de limiet strenger maakt. */
  function breakerVoor(id) {
    if (!breakers.has(id)) breakers.set(id, { fails: [], openTot: 0 });
    return breakers.get(id);
  }
  const breakerOpen = (id, t) => breakerVoor(id).openTot > t;

  function noteerFout(id, t) {
    const b = breakerVoor(id);
    b.fails = b.fails.filter((x) => t - x < NET.breakerWindow);
    b.fails.push(t);
    if (b.fails.length >= NET.breakerFails && b.openTot <= t) {
      b.openTot = t + NET.breakerCooldown;
      b.fails.length = 0;
    }
  }

  /* ---- decoderen ---------------------------------------------------------- */

  async function decodeTegel(blob) {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'flipY' });
    } catch {
      /* Oudere browsers kennen imageOrientation niet. Dan zelf omkeren, want een
         tegel die ondersteboven staat is erger dan een tegel die traag komt. */
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      const g = c.getContext('2d');
      g.translate(0, bmp.height); g.scale(1, -1);
      g.drawImage(bmp, 0, 0);
      bmp.close();
      return createImageBitmap(c);
    }
  }

  /* ---- texturen ----------------------------------------------------------- */

  function textureBytes(bitmap) {
    return bitmap.width * bitmap.height * 4 * 1.34;   // 1.34 voor de mipmapstaart
  }

  function bewaarTexture(key, bitmap, srcId) {
    const tex = new THREE.CanvasTexture(bitmap);
    tex.flipY = false;                    // de bitmap staat al goed, zie de kop
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    if (opts.maxAnisotropy) tex.anisotropy = opts.maxAnisotropy;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    tex.userData = { lastUsed: nu(), srcId, bytes: textureBytes(bitmap) };
    texMemory += tex.userData.bytes;
    textures.set(key, tex);
    ruimTexturenOp();
    return tex;
  }

  function laatTextureVallen(key) {
    const tex = textures.get(key);
    if (!tex) return;
    texMemory -= tex.userData.bytes;
    tex.dispose();
    if (tex.image && tex.image.close) tex.image.close();   // ook de bitmap
    textures.delete(key);
  }

  function ruimTexturenOp() {
    if (texMemory <= NET.textureBudget) return;
    const oud = [...textures.entries()].sort((a, b) => a[1].userData.lastUsed - b[1].userData.lastUsed);
    for (const [key] of oud) {
      if (texMemory <= NET.textureBudget * 0.9) break;
      if (wanted.has(key)) continue;      // wat nu in beeld is blijft
      laatTextureVallen(key);
    }
  }

  /* ---- de wachtrij -------------------------------------------------------- */

  function request(srcId, level, x, y, priority) {
    const key = texKey(srcId, level, x, y);
    const tex = textures.get(key);
    if (tex) { tex.userData.lastUsed = nu(); return key; }
    const e = entries.get(key);
    if (e) { e.priority = priority; return key; }        // ontdubbelen
    entries.set(key, {
      key, level, x, y, priority, srcId,
      state: 'queued', attempt: 0, notBefore: 0, controller: null
    });
    return key;
  }

  /* Wat niet meer geselecteerd is, hoeft ook niet meer te komen. Lopende
     verzoeken worden AFGEBROKEN en niet alleen genegeerd: een afgebroken
     verzoek geeft zijn plek terug aan iets dat wel in beeld staat. */
  function setWanted(keys) {
    wanted = keys instanceof Set ? keys : new Set(keys);
    for (const [key, e] of entries) {
      if (wanted.has(key)) continue;
      if (e.state === 'loading') { e.controller?.abort(); stats.aborted++; }
      else entries.delete(key);
    }
    /* EN METEEN OPRUIMEN. Wat in beeld staat mag nooit weg, dus zolang alles
       gewenst is kan het opruimen niets doen en groeit het geheugen door tot
       boven het budget. Precies bij een SELECTIEWISSEL komt de ruimte vrij — en
       dan hoort hij ook genomen te worden, niet pas wanneer er toevallig een
       volgende tegel binnenkomt. Zonder deze regel bleef het geheugen op 3,4 MB
       staan met een budget van 1 MB. */
    ruimTexturenOp();
  }

  function pump() {
    const t = nu();
    const klaar = [];
    for (const e of entries.values()) if (e.state === 'queued' && e.notBefore <= t) klaar.push(e);
    klaar.sort((a, b) => a.priority - b.priority);
    for (const e of klaar) {
      if (inFlight >= NET.maxConcurrent) break;
      if (!neemToken(t)) break;
      startVerzoek(e);
    }
  }

  async function startVerzoek(e) {
    const t = nu();
    if (breakerOpen(e.srcId, t)) { volgendeBron(e); return; }

    const src = TILE_SOURCES[e.srcId];
    if (!src || !src.url) { mislukt(e); return; }
    e.state = 'loading';
    e.controller = new AbortController();
    inFlight++;

    try {
      const url = tileUrl(src, e.level, e.x, e.y, { vintage: opts.vintage && opts.vintage() });
      let bitmap;

      /* Eerst de schijf. Een treffer kost geen netwerk, dus het tempo-token gaat
         terug in de emmer — anders remmen we onszelf af voor een verzoek dat
         nooit de deur uit ging. */
      const bewaard = schijf ? await schijf.get(url) : null;
      if (bewaard) {
        stats.cacheHits++; stats.cacheBytes += bewaard.size;
        bucket.tokens = Math.min(NET.burst, bucket.tokens + 1);
        bitmap = await decodeTegel(bewaard);
      } else {
        stats.sent++;
        const res = await haal(url, { signal: e.controller.signal, mode: 'cors', credentials: 'omit' });
        const type = res.headers.get('content-type') || '';

        // Val 1 uit de kop: geweigerd met status 200 en een webpagina.
        if (res.ok && !type.startsWith('image/')) {
          stats.htmlRefusals++; stats.limited++;
          noteerFout(e.srcId, nu()); opnieuwOfVolgende(e, null); return;
        }
        if (res.status === 404 || res.status === 400) { stats.notFound++; mislukt(e); return; }
        if (!res.ok) {
          stats.limited++; noteerFout(e.srcId, nu());
          opnieuwOfVolgende(e, res.headers.get('retry-after')); return;
        }
        const blob = await res.blob();
        stats.bytes += blob.size;                 // echte bytes, geen schatting
        if (schijf) schijf.put(url, blob);        // bewust niet afwachten
        bitmap = await decodeTegel(blob);
      }

      // Ondertussen weggekeken? Dan is dit beeld niets meer waard.
      if (!wanted.has(e.key)) { bitmap.close(); entries.delete(e.key); return; }
      bewaarTexture(e.key, bitmap, e.srcId);
      stats.ok++;
      entries.delete(e.key);
      if (opts.onTile) opts.onTile(e.key);
    } catch (err) {
      if (err && err.name === 'AbortError') { entries.delete(e.key); return; }
      stats.limited++;
      noteerFout(e.srcId, nu());
      opnieuwOfVolgende(e, null);
    } finally {
      inFlight--;
    }
  }

  /* Exponentieel wachten MET JITTER. Zonder die willekeur komen alle mislukte
     verzoeken op exact hetzelfde moment terug en is de tweede golf net zo groot
     als de eerste — precies wat een server onder druk niet kan hebben. */
  function opnieuwOfVolgende(e, retryAfter) {
    if (!entries.has(e.key)) return;
    e.attempt++;
    if (e.attempt < NET.maxAttempts) {
      const uitHeader = retryAfter ? Number(retryAfter) * 1000 : 0;
      const terug = Math.min(NET.baseBackoff * Math.pow(2, e.attempt - 1), NET.maxBackoff);
      e.state = 'queued';
      e.notBefore = nu() + Math.max(uitHeader, terug + terug * 0.5 * Math.random());
      stats.retries++;
      return;
    }
    volgendeBron(e);
  }

  /* DE RESERVEBRON MAG ALLEEN BINNEN HETZELFDE RASTER, en dat wordt hier
     getoetst en niet alleen afgesproken: op een ander raster is dezelfde z/x/y
     een ander stuk aarde, en dan toont de app rustig het verkeerde continent. */
  function volgendeBron(e) {
    const src = TILE_SOURCES[e.srcId];
    const volgend = NET.useFallback ? src && src.fallback : null;
    const f = volgend ? TILE_SOURCES[volgend] : null;
    if (!f || f.grid !== getSource().grid || f.maxLevel < e.level) { mislukt(e); return; }
    e.srcId = volgend; e.attempt = 0; e.state = 'queued';
    e.notBefore = nu() + 200;
    stats.fallbacks++;
  }

  function mislukt(e) { e.state = 'failed'; e.notBefore = Infinity; stats.failed++; }

  function clear() {
    for (const e of entries.values()) if (e.state === 'loading') e.controller?.abort();
    entries.clear();
    for (const key of [...textures.keys()]) laatTextureVallen(key);
    texMemory = 0;
    breakers.clear();
    inFlight = 0;
  }

  return {
    request, setWanted, pump, clear, texKey,
    getTexture: (key) => {
      const t = textures.get(key);
      if (t) t.userData.lastUsed = nu();
      return t || null;
    },
    hasTexture: (key) => textures.has(key),
    stats: () => ({
      ...stats, inFlight, queued: entries.size, textures: textures.size,
      textureMB: Math.round(texMemory / TILE_MB * 10) / 10,
      budgetMB: Math.round(NET.textureBudget / TILE_MB),
      breakerOpen: [...breakers.entries()].filter(([, b]) => b.openTot > nu()).map(([id]) => id)
    })
  };
}
