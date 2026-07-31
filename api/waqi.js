// api/waqi.js — server-side proxy for the WAQI air quality API.
//
// Why this exists: the browser must never see the API key. This function holds
// it server-side, reading it from the WAQI_TOKEN environment variable, and
// returns only the data.
//
// On a host where no key is configured — GitHub Pages, or your own fork before
// you add one — this returns 404 and the air quality layer shows a padlock
// with instructions instead of an error. That is the intended behaviour, not a
// failure mode.
//
// Want air quality in your own deploy? Request a free token at
// https://aqicn.org/data-platform/token/ and set WAQI_TOKEN in your Vercel
// project settings. We do not, and will not, distribute keys.
//
// The local counterpart lives in serve.mjs at the repository root. Keep the
// two in sync: same validation, same cache header, same 404.

// Fixed upstream host, so this is not an open proxy: there is no parameter
// through which a caller can choose a destination.
const UPSTREAM = 'https://api.waqi.info/v2/map/bounds/';

// Four comma-separated numbers, each with at most three integer digits.
const BOUNDS_SHAPE = /^-?\d{1,3}(\.\d+)?(,-?\d{1,3}(\.\d+)?){3}$/;

function validBounds(s) {
  if (!s || !BOUNDS_SHAPE.test(s)) return false;
  const [lat1, lng1, lat2, lng2] = s.split(',').map(Number);
  return [lat1, lat2].every(v => v >= -90 && v <= 90) &&
         [lng1, lng2].every(v => v >= -180 && v <= 180);
}

export default async function handler(req, res) {
  const token = process.env.WAQI_TOKEN;

  if (!token) {
    res.status(404).json({ status: 'error', data: 'no token configured' });
    return;
  }

  const bounds = req.query?.bounds;
  if (!validBounds(bounds)) {
    res.status(400).json({ status: 'error', data: 'invalid bounds' });
    return;
  }

  const target = UPSTREAM +
    '?latlng=' + encodeURIComponent(bounds) +
    '&token='  + encodeURIComponent(token);

  try {
    const upstream = await fetch(target);
    const body = await upstream.text();

    // Let the edge cache hold this for five minutes. AQI stations only refresh
    // hourly, and the client rounds its viewport to a ten-degree grid so that
    // panning produces repeat hits rather than a new URL every frame.
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.setHeader('Content-Type', 'application/json');
    res.status(upstream.ok ? 200 : 502).send(body);
  } catch {
    // Deliberately opaque: no stack trace, no file paths, no key, no upstream
    // URL. An error response must not become a source of information.
    res.status(502).json({ status: 'error', data: 'upstream unreachable' });
  }
}
