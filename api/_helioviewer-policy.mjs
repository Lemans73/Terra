// api/_helioviewer-policy.mjs — what the Helioviewer proxy is allowed to pass on.
//
// Pure: no I/O, no network, no runtime assumptions. Imported by both the Vercel
// function in api/helioviewer.js and its local counterpart in serve.mjs, so the
// two cannot drift apart. That is the one thing api/waqi.js has to ask you to do
// by hand ("keep the two in sync"), and it is the kind of promise that quietly
// breaks.
//
// WHY A PROXY EXISTS AT ALL
// Helioviewer does not send `Access-Control-Allow-Origin: *`. It echoes the
// origin back, but only for origins on an allowlist of common development
// ports. Measured: localhost:8000, :8080 and :5173 are on it; localhost:3000,
// localhost:8771 (Terra's port), 127.0.0.1:8000 and terra.terryelemans.nl are
// not. A 200 without the header looks exactly like a server error in the
// console, so read the status number before believing a diagnosis.
//
// The data is public and there is no API key, so nothing here is a secret. What
// this file protects is bandwidth: a rewrite that forwards anything to
// api.helioviewer.org lets a stranger spend Terra's transfer budget at 4 MB per
// image. Hence a fixed upstream and a closed set of endpoints and parameters —
// an allowlist, never a blocklist.

const UPSTREAM = 'https://api.helioviewer.org/v2/';

// Absolute ceiling on a rendered image, independent of the per-host limit the
// client applies. 2048 is what the proof of concept settled on, and it is where
// a single frame costs about 4 MB.
export const MAX_IMAGE_PX = 2048;

/* ---- Parameter shapes ----------------------------------------------------
   Each returns true only for a value we are willing to forward. Anything a
   validator does not recognise is rejected rather than passed through, so a
   parameter Helioviewer gains later cannot reach it without a change here. */

const isoInstant = v => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(v);

// The length cap keeps an absurd string away from Number(); the range does the
// actual work. Twelve digits because a Helioviewer image id is nine and
// climbing — a cap of seven silently refused every getJP2Header call.
const intIn = (lo, hi) => v => /^\d{1,12}$/.test(v) && +v >= lo && +v <= hi;

const numIn = (lo, hi) => v =>
  /^-?\d{1,7}(\.\d{1,6})?$/.test(v) && Number.isFinite(+v) && +v >= lo && +v <= hi;

const bool = v => v === 'true' || v === 'false';

// The numeric layer form: [sourceId,visible,opacity], repeated for a stack.
// Shorter and more robust than the observatory notation, and it means the only
// free text in the whole query is a bracketed list of digits.
const layerStack = v =>
  /^\[\d{1,4},[01],\d{1,3}\](,\[\d{1,4},[01],\d{1,3}\]){0,4}$/.test(v);

/* ---- Cache windows -------------------------------------------------------
   Helioviewer sends no cache headers at all — no Cache-Control, no ETag, no
   Expires — so whatever the edge holds is what we put here.

   `takeScreenshot` gets a full day because the client asks for the OBSERVATION
   time it got back from getClosestImage, never the visitor's wall clock. That
   turns 3600 possible keys per hour into one per image: AIA publishes every 36
   seconds. If a caller ever passes a raw clock time, this cache still returns a
   correct image — just a less useful one to cache.

   `getClosestImage` is the moving part: asking about "now" gives a different
   answer every 36 seconds, so a minute is as far as it can be trusted. It is
   also small and fast, which is exactly why it is the one that may miss. */
const CACHE = {
  getClosestImage: 'public, s-maxage=60, stale-while-revalidate=300',
  takeScreenshot:  'public, s-maxage=86400, stale-while-revalidate=604800',
  getJP2Header:    'public, s-maxage=86400, stale-while-revalidate=604800',
  getDataSources:  'public, s-maxage=3600, stale-while-revalidate=86400'
};

/* ---- The endpoints we use, and nothing else ------------------------------
   `required` must all be present; `optional` may be. A parameter in neither
   list is a rejection, not something to drop silently: a request carrying an
   unknown key is not the request we think it is, and answering it anyway is how
   a proxy becomes a passthrough. */
const ENDPOINTS = {
  getClosestImage: {
    required: { date: isoInstant, sourceId: intIn(0, 9999) },
    optional: {}
  },
  takeScreenshot: {
    required: {
      date: isoInstant,
      imageScale: numIn(0.001, 1000),
      layers: layerStack,
      x0: numIn(-100000, 100000),
      y0: numIn(-100000, 100000),
      width: intIn(1, MAX_IMAGE_PX),
      height: intIn(1, MAX_IMAGE_PX)
    },
    // `watermark` is optional here but the client always sends false: it is on
    // by default upstream, and it bakes the instrument name into the pixels —
    // straight through the corona on LASCO C3.
    optional: { display: bool, watermark: bool }
  },
  getJP2Header: {
    required: { id: intIn(0, 99999999999) },
    optional: {}
  },
  getDataSources: {
    required: {},
    optional: { verbose: bool, enable: v => /^[A-Za-z0-9,\[\]]{0,120}$/.test(v) }
  }
};

export const ALLOWED_ENDPOINTS = Object.keys(ENDPOINTS);

/**
 * Decide what to do with one incoming request.
 *
 * @param {string|null} endpoint  the `endpoint` query parameter
 * @param {(k: string) => string|null} get  reads one query parameter
 * @param {Iterable<string>} keys  every query parameter present
 * @returns {{ok: true, url: string, cacheControl: string}
 *          | {ok: false, status: number, error: string}}
 */
export function planRequest(endpoint, get, keys) {
  const spec = Object.prototype.hasOwnProperty.call(ENDPOINTS, endpoint)
    ? ENDPOINTS[endpoint] : null;
  if (!spec) {
    return { ok: false, status: 400, error: 'unknown endpoint' };
  }

  const out = new URLSearchParams();

  for (const key of keys) {
    if (key === 'endpoint') continue;
    const check = spec.required[key] || spec.optional[key];
    if (!check) return { ok: false, status: 400, error: 'unexpected parameter' };
    const value = get(key);
    if (value === null || !check(value)) {
      return { ok: false, status: 400, error: 'invalid parameter' };
    }
    out.set(key, value);
  }

  for (const key of Object.keys(spec.required)) {
    if (!out.has(key)) return { ok: false, status: 400, error: 'missing parameter' };
  }

  return {
    ok: true,
    url: UPSTREAM + endpoint + '/?' + out.toString(),
    cacheControl: CACHE[endpoint]
  };
}
