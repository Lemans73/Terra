/* ============================================================
   TERRA — Sun · talking to Helioviewer, through our own proxy
   ------------------------------------------------------------
   Every request goes to /api/helioviewer, never to api.helioviewer.org.
   Measured in session 48: Helioviewer echoes the origin back only for
   origins on an allowlist of common development ports, and neither
   terra.terryelemans.nl nor localhost:8771 is on it. Going direct fails
   with a 200 and no header, which reads in the console exactly like a
   server error.

   Same-origin has a second benefit that matters more than it looks: the
   canvas stays clean. An image fetched cross-origin without CORS taints
   it, and a tainted canvas cannot be exported — which would take the
   whole wallpaper maker away from this state.

   ONE QUEUE, and everything goes through it, images included. At 130 ms
   apart it is not politeness so much as arithmetic: a stack of three
   layers plus their metadata is eight requests, and fired as a burst
   those are eight renders queued on someone else's server.

   ASK FOR THE OBSERVATION TIME, NEVER THE CLOCK. `getClosestImage` is
   cheap and returns the real observation timestamp; `takeScreenshot` is
   4 MB and seven seconds. Requesting the image at the timestamp that
   came back means two visitors within the same cadence window ask for
   the same thing — AIA publishes every 36 seconds, so that is 100 keys
   an hour instead of 3600. It is also the only way to deduplicate a
   time series before fetching it.
   ============================================================ */

import { toInstant } from './source.js';

const ENDPOINT = '/api/helioviewer';
const GAP_MS = 130;
const RETRY_STATUS = new Set([429, 503]);

export function createSunFetch(opts = {}) {
  const base = opts.endpoint || ENDPOINT;
  const gap = opts.gapMs == null ? GAP_MS : opts.gapMs;
  const doFetch = opts.fetch || ((...a) => fetch(...a));

  let chain = Promise.resolve();
  let inFlight = 0;
  let done = 0;

  /* The queue is a promise chain rather than a timer loop: it cannot drift,
     it cannot run twice, and an exception in one link does not strand the
     ones behind it. */
  function enqueue(task) {
    const run = chain.then(async () => {
      inFlight++;
      try { return await task(); }
      finally { inFlight--; done++; }
    });
    chain = run.then(() => new Promise(r => setTimeout(r, gap)), () => new Promise(r => setTimeout(r, gap)));
    return run;
  }

  function url(endpoint, params) {
    const q = new URLSearchParams({ endpoint, ...params });
    return base + '?' + q.toString();
  }

  async function once(target, as) {
    const res = await doFetch(target);
    if (!res.ok) {
      const err = new Error('helioviewer ' + res.status);
      err.status = res.status;
      throw err;
    }
    return as === 'blob' ? res.blob() : res.json();
  }

  /* One retry, and only for the two statuses that mean "later": a 400 from our
     own proxy is a request that will never become valid, and repeating it just
     doubles the wrong. */
  async function request(endpoint, params, as) {
    const target = url(endpoint, params);
    return enqueue(async () => {
      try {
        return await once(target, as);
      } catch (e) {
        if (!RETRY_STATUS.has(e.status)) throw e;
        await new Promise(r => setTimeout(r, 900));
        return once(target, as);
      }
    });
  }

  /** Metadata for the image nearest a moment. Cheap, and the source of every
      derived quantity. */
  function closestImage(sourceId, date) {
    return request('getClosestImage', {
      date: toInstant(date instanceof Date ? date.toISOString() : date),
      sourceId: String(sourceId)
    });
  }

  /**
   * A rendered frame.
   *
   * `y0` is in SCREEN coordinates, positive downward, while our world counts
   * positive upward. The minus sign below is the whole of that difference; drop
   * it and you fetch the bottom of the sun and draw it where the top belongs.
   * `x0` needs no such treatment — only the vertical axis is flipped.
   */
  function screenshot({ sourceId, date, imageScale, x0, y0, px }) {
    return request('takeScreenshot', {
      date: toInstant(date instanceof Date ? date.toISOString() : date),
      imageScale: String(imageScale),
      layers: '[' + sourceId + ',1,100]',
      x0: String(x0),
      y0: String(-y0),
      width: String(px),
      height: String(px),
      display: 'true',
      // On by default upstream, and it bakes the instrument name into the
      // pixels — straight through the corona on LASCO C3.
      watermark: 'false'
    }, 'blob');
  }

  function jp2Header(id) {
    return request('getJP2Header', { id: String(id) });
  }

  function dataSources() {
    return request('getDataSources', {});
  }

  return {
    closestImage, screenshot, jp2Header, dataSources,
    stats: () => ({ inFlight, done })
  };
}

/**
 * The arcsec-per-pixel that yields a given field at a given texture size.
 * Derived rather than chosen: the field is in solar radii, the response is in
 * arcsec, and radiusArcsec is what ties the two together.
 */
export function imageScaleFor(field, texPx, radiusArcsec) {
  return (2 * field * radiusArcsec) / texPx;
}
