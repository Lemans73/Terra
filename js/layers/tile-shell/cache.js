/* ============================================================
   TERRA — Tile cache · tiles that stay on disk
   ------------------------------------------------------------
   The browser has a cache of its own, but it is the first thing
   evicted under pressure. A cache with its own budget is what
   makes a RETURNING visit free — for the visitor's bandwidth and
   for the source that gives this away.

   That matters more here than it looks: a yearly mosaic never
   changes, so a tile fetched once is good forever. EOX is a small
   company handing out imagery for nothing, and every tile served
   twice is a tile they paid for twice.

   THE INDEX LIVES IN localStorage, not in the Cache API. Reading
   sizes back out of the cache means opening every response, and
   that turns "how much disk am I using" into hundreds of reads.
   The index is small: one entry of two numbers per tile.

   AN INDEX THAT DRIFTS FROM THE CACHE IS NOT FATAL. A missing
   response deletes its entry and counts as a miss; an orphaned
   response is caught by the next prune. Both are cheap, so
   neither is guarded against with a lock that could itself fail.

   THE WHOLE THING IS OPTIONAL. `caches` needs a secure context,
   and private windows may refuse it. Then everything below turns
   into a no-op and the loader simply goes to the network.
   ============================================================ */

import { TILE_MB } from './sources.js';

export function createTileCache(opts = {}) {
  const naam = opts.name || 'terra-tiles-v1';
  const indexSleutel = opts.indexKey || 'terra-tile-index';
  let budget = (opts.budgetMB || 200) * TILE_MB;
  const maxAgeDagen = opts.maxAgeDays || 30;

  let store = null;
  let beschikbaar = false;
  let index = {};
  let bytes = 0;

  const stats = { hits: 0, misses: 0, puts: 0, hitBytes: 0, geweigerd: 0, gesnoeid: 0 };

  function bewaarIndex() {
    try { localStorage.setItem(indexSleutel, JSON.stringify(index)); }
    catch { /* opslag vol of geweigerd: de cache draait door, alleen de index niet */ }
  }

  function telBytes() {
    let t = 0;
    for (const k in index) t += index[k].b;
    return t;
  }

  async function init() {
    if (typeof caches === 'undefined') return false;   // geen secure context
    try {
      store = await caches.open(naam);
      try { index = JSON.parse(localStorage.getItem(indexSleutel) || '{}'); }
      catch { index = {}; }
      bytes = telBytes();
      beschikbaar = true;
      await prune();
      return true;
    } catch {
      beschikbaar = false;
      return false;
    }
  }

  async function get(url) {
    if (!beschikbaar) return null;
    const e = index[url];
    if (!e) { stats.misses++; return null; }
    let res = null;
    try { res = await store.match(url); } catch { res = null; }
    if (!res) { delete index[url]; stats.misses++; return null; }
    e.t = Date.now();
    stats.hits++;
    const blob = await res.blob();
    stats.hitBytes += blob.size;
    return blob;
  }

  async function put(url, blob) {
    if (!beschikbaar) return false;
    try {
      await store.put(url, new Response(blob, { headers: { 'content-type': blob.type } }));
      index[url] = { b: blob.size, t: Date.now() };
      bytes += blob.size;
      stats.puts++;
      if (bytes > budget) await prune(); else bewaarIndex();
      return true;
    } catch {
      /* Quota vol of opslag geweigerd. Snoeien en verder — een tegel die niet op
         schijf past is geen reden om hem ook niet te TONEN. */
      stats.geweigerd++;
      await prune();
      return false;
    }
  }

  /* Oudste eruit, en alles ouder dan maxAgeDagen sowieso. Er wordt tot 90 % van
     het budget gesnoeid en niet tot precies 100 %: anders snoeit elke volgende
     put opnieuw en betaalt de bezoeker die grens bij elke tegel. */
  async function prune() {
    if (!beschikbaar) return 0;
    const nu = Date.now();
    const maxAge = maxAgeDagen * 864e5;
    const rijen = Object.entries(index).sort((a, b) => a[1].t - b[1].t);
    let totaal = rijen.reduce((s, [, e]) => s + e.b, 0);
    let weg = 0;
    for (const [url, e] of rijen) {
      const teOud = nu - e.t > maxAge;
      if (!teOud && totaal <= budget * 0.9) break;
      try { await store.delete(url); } catch { /* al weg */ }
      delete index[url];
      totaal -= e.b; weg++;
    }
    bytes = totaal;
    stats.gesnoeid += weg;
    bewaarIndex();
    return weg;
  }

  async function clear() {
    if (!beschikbaar) return false;
    try { await caches.delete(naam); store = await caches.open(naam); }
    catch { return false; }
    index = {}; bytes = 0;
    bewaarIndex();
    return true;
  }

  /* WAT DE BEZOEKER TE ZIEN KRIJGT VOORDAT HIJ OP WISSEN DRUKT is niet onze
     eigen boekhouding maar wat de BROWSER zegt: die telt alles van deze
     oorsprong mee. Onze index kan eronder zitten (een gesnoeide entry die nog
     niet weggeschreven is) en dat zou het getal laten liegen. */
  async function diskUsage() {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    try {
      const e = await navigator.storage.estimate();
      return { gebruikt: e.usage || 0, beschikbaar: e.quota || 0, eigenIndex: bytes };
    } catch { return null; }
  }

  return {
    init, get, put, prune, clear, diskUsage,
    isAvailable: () => beschikbaar,
    bytes: () => bytes,
    count: () => Object.keys(index).length,
    setBudgetMB: (mb) => { budget = mb * TILE_MB; },
    budgetMB: () => Math.round(budget / TILE_MB),
    stats: () => ({ ...stats, bytes, entries: Object.keys(index).length, beschikbaar })
  };
}
