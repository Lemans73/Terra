// relay/relay.mjs — Terra data relay
// ----------------------------------------------------------------------------
// Verbindt server-side met WebSocket-bronnen die de browser niet direct mag/kan
// bereiken, decodeert + normaliseert ze, en serveert schone JSON via REST (met
// CORS) aan de globe. De globe pollt deze endpoints als gewone adapters.
//
// Node 22+ (globale WebSocket-client) → GEEN npm-dependencies.
//
// Endpoints:
//   GET /lightning  -> { source, connected, count, total, strikes:[{id,time,lat,lon}] }
//   GET /health     -> { ok, modules:{...} }
//
// Start:  node relay/relay.mjs        (luistert op poort 8772)
// ----------------------------------------------------------------------------

import { createServer } from 'node:http';

const PORT = 8772;
const SESSION = Date.now().toString(36); // unieke prefix per relay-start (geen id-botsing)

/* ============================================================
   Bliksem — Blitzortung WebSocket
   ------------------------------------------------------------
   Protocol (community-standaard, reverse-engineered):
   - Verbind met wss://ws{N}.blitzortung.org/
   - Stuur na 'open': {"a":111}  (subscribe op de live-stroom)
   - Berichten zijn LZW-gecomprimeerd → decode() → JSON-string met
     o.a. { time(ns), lat, lon, ... } per blikseminslag.
   Gratis voor privé/niet-commercieel gebruik.
   ============================================================ */

// Canonieke Blitzortung LZW-decompressie.
function decode(data) {
  const e = {};
  const d = String(data).split('');
  let c = d[0];
  let f = c;
  const g = [c];
  let o = 256;
  let n = o;
  for (let i = 1; i < d.length; i++) {
    const j = d[i].charCodeAt(0);
    const h = j < 256 ? d[i] : (e[j] ? e[j] : (f + c));
    g.push(h);
    c = h.charAt(0);
    e[n] = f + c;
    n++;
    f = h;
  }
  return g.join('');
}

const lightning = {
  servers: ['wss://ws1.blitzortung.org/', 'wss://ws7.blitzortung.org/', 'wss://ws8.blitzortung.org/'],
  srvIdx: 0,
  ws: null,
  connected: false,
  bufferMs: 4_000,    // korte relay-buffer; de globe houdt strikes zelf langer vast
  max: 1500,          // harde cap tegen geheugengroei
  strikes: [],        // [{id, time(ms), lat, lon}]
  total: 0,           // teller over de hele looptijd
  seq: 0,             // stabiele unieke id per strike

  start() {
    const url = this.servers[this.srvIdx % this.servers.length];
    this.srvIdx++;
    let ws;
    try { ws = new WebSocket(url); }
    catch (e) { return this.retry('init-fout: ' + e.message); }
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.connected = true;
      console.log('[lightning] verbonden:', url);
      try { ws.send(JSON.stringify({ a: 111 })); } catch {}
    });
    ws.addEventListener('message', (ev) => this.onMessage(ev.data));
    ws.addEventListener('close', () => { this.connected = false; this.retry('verbinding gesloten'); });
    ws.addEventListener('error', () => { this.connected = false; /* 'close' volgt en regelt de retry */ });
  },

  retry(reason) {
    console.warn('[lightning] herverbinden (' + reason + ') over 3s, volgende server');
    if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; }
    setTimeout(() => this.start(), 3000);
  },

  onMessage(raw) {
    const txt = typeof raw === 'string' ? raw : (raw && raw.toString ? raw.toString() : '');
    if (!txt) return;
    let obj = null;
    try { obj = JSON.parse(decode(txt)); } catch { obj = null; }
    if (!obj || typeof obj.lat !== 'number' || typeof obj.lon !== 'number') return;
    const timeMs = obj.time ? Math.round(obj.time / 1e6) : Date.now(); // ns -> ms
    this.strikes.push({ id: 'lt-' + SESSION + '-' + (++this.seq), time: timeMs, lat: obj.lat, lon: obj.lon, recv: Date.now() });
    this.total++;
    this.prune();
  },

  prune() {
    // prune op AANKOMSTtijd (recv), niet inslagtijd — Blitzortung levert strikes met
    // vertraging, dus pruning op inslagtijd zou verse strikes meteen weggooien.
    const cutoff = Date.now() - this.bufferMs;
    if (this.strikes.length && (this.strikes[0].recv < cutoff || this.strikes.length > this.max)) {
      this.strikes = this.strikes.filter(s => s.recv >= cutoff);
      if (this.strikes.length > this.max) this.strikes = this.strikes.slice(-this.max);
    }
  },

  snapshot() {
    this.prune();
    return {
      source: 'Blitzortung',
      connected: this.connected,
      count: this.strikes.length,
      total: this.total,
      strikes: this.strikes
    };
  }
};

/* ============================================================
   HTTP-server (browser-facing, met CORS)
   ============================================================ */
const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const path = (req.url || '/').split('?')[0];
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (path === '/lightning') {
    return res.end(JSON.stringify(lightning.snapshot()));
  }
  if (path === '/health') {
    return res.end(JSON.stringify({
      ok: true,
      modules: {
        lightning: { connected: lightning.connected, count: lightning.strikes.length, total: lightning.total }
      }
    }));
  }
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => console.log('[relay] luistert op http://localhost:' + PORT));
lightning.start();
