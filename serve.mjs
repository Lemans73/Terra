// serve.mjs — minimal static server for local development.
//
// Terra has no build step and zero npm dependencies, and it intends to keep it
// that way. But it does use ES modules, which browsers refuse to load over
// file:// — so opening index.html directly will not work. Hence this file.
//
//   node serve.mjs        →  http://localhost:8771
//
// It also serves /api/waqi, mirroring the Vercel serverless function in api/,
// so that the request path you exercise locally is the same one that runs in
// production. Without it, the air quality layer would be untestable offline.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = process.cwd();
const PORT = Number(process.env.PORT) || 8771;

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.geojson': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

// ---- Secrets --------------------------------------------------------------
// The WAQI token lives in .env.local (git-ignored) locally, and as an
// environment variable named WAQI_TOKEN on Vercel. Deliberately the same name
// in both places, so there is only one concept to remember.
//
// NOTE: this is read once, at startup. Change .env.local and you must restart
// the server before the new value takes effect.
async function readEnv() {
  const out = { ...process.env };
  try {
    const text = await readFile(join(ROOT, '.env.local'), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env.local: fall back to process.env */ }
  return out;
}
const ENV = await readEnv();

// ---- /api/waqi ------------------------------------------------------------
// Local counterpart of api/waqi.js. Keep the two in sync: same validation,
// same cache header, same 404 when no token is configured.
//
// Fixed upstream, so this is not an open proxy. Bounds are validated before
// they are passed on; anything that does not look like four numbers within
// range is rejected.
const WAQI_BOUNDS = /^-?\d{1,3}(\.\d+)?(,-?\d{1,3}(\.\d+)?){3}$/;

function validBounds(s) {
  if (!s || !WAQI_BOUNDS.test(s)) return false;
  const [lat1, lng1, lat2, lng2] = s.split(',').map(Number);
  return [lat1, lat2].every(v => v >= -90 && v <= 90) &&
         [lng1, lng2].every(v => v >= -180 && v <= 180);
}

async function waqiHandler(req, res) {
  const token = ENV.WAQI_TOKEN;
  if (!token) {
    // Exactly what a host without the key returns. The layer is expected to
    // show a padlock on this, not an error.
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'error', data: 'no token configured' }));
  }
  const bounds = new URL(req.url, 'http://localhost').searchParams.get('bounds');
  if (!validBounds(bounds)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'error', data: 'invalid bounds' }));
  }
  const target = 'https://api.waqi.info/v2/map/bounds/?latlng=' +
                 encodeURIComponent(bounds) + '&token=' + encodeURIComponent(token);
  try {
    const upstream = await fetch(target);
    const body = await upstream.text();
    res.writeHead(upstream.ok ? 200 : 502, {
      'Content-Type': 'application/json',
      // Same header as the Vercel function: the edge cache may hold this for
      // five minutes. AQI stations only refresh hourly anyway.
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
    });
    res.end(body);
  } catch {
    // No stack trace, no paths, no key — the error path leaks nothing.
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', data: 'upstream unreachable' }));
  }
}

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/api/waqi') return waqiHandler(req, res);
    if (p === '/') p = '/index.html';

    const full = normalize(join(ROOT, p));
    if (!full.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
    // Env files are never reachable over http, not even locally.
    if (/(^|\/)\.env/.test(p)) { res.writeHead(403); return res.end('forbidden'); }

    const data = await readFile(full);
    /* NOOIT CACHEN OP DE ONTWIKKELMACHINE.

       Zonder een cache-kop past een browser HEURISTISCHE caching toe: hij leidt
       zelf een houdbaarheid af uit Last-Modified en serveert een gewijzigd
       bestand daarna nog uit zijn eigen cache, zonder te vragen of het nog
       klopt. Voor `css/app.css` en de ES-modules betekende dat een pagina die
       half oud en half nieuw draait — en dat leest als een fout in de code die
       er niet is. Het kostte in sessie 30 een halve zoektocht naar een bug die
       alleen in de cache van de browser bestond.

       `no-store` en niet `no-cache`: de eerste bewaart niets, de tweede bewaart
       wel maar valideert opnieuw. Op localhost is er niets te winnen met
       bewaren, en alles te verliezen met een halve validatie.

       Dit raakt alleen deze ontwikkelserver. Op Vercel bepalen de headers in
       vercel.json wat er gebeurt, en daar is cachen juist wel de bedoeling. */
    res.writeHead(200, {
      'Content-Type': TYPES[extname(full)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
// Loopback only. listen(PORT) without a host binds to 0.0.0.0, which would
// expose this directory to your entire local network.
}).listen(PORT, '127.0.0.1', () => {
  console.log('Terra running on http://localhost:' + PORT);
  console.log('WAQI token: ' + (ENV.WAQI_TOKEN
    ? 'loaded from .env.local'
    : 'MISSING → /api/waqi returns 404, air quality shows a padlock'));
});
