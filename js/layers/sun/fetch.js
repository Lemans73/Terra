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

   A QUEUE FOR STILLS, AND LANES FOR THE REST. A still is a render of up
   to 2048 px on someone else's server, so stills wait their turn, 130 ms
   after the one before: fired as a burst, three layers would be three
   renders queued over there. A getClosestImage renders nothing, so
   lookups run three abreast in a lane of their own (LOOKUP_WIDTH). The
   frames of a film are renders too, but of 640 px at most, and they run
   three abreast in a second lane (FRAME_WIDTH). Each slot in a lane
   rests the same 130 ms before it takes the next task.

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

/* How long a retry waits: what Helioviewer asked for in Retry-After, between one
   and ten seconds, and one second when it did not say. */
const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 10000;

export function retryWaitMs(retryAfter) {
  const seconds = Number(String(retryAfter == null ? '' : retryAfter).trim());
  if (!(seconds > 0)) return RETRY_MIN_MS;
  return Math.min(RETRY_MAX_MS, Math.max(RETRY_MIN_MS, seconds * 1000));
}

/** What the visitor is told when a request to Helioviewer did not come through. */
export function troubleText(err) {
  const status = err && err.status;
  if (status === 429) return 'Helioviewer is busy · try again in a minute';
  if (status === 503) return 'Helioviewer is unavailable for a moment';
  return 'Could not reach Helioviewer';
}

/* How many lookups may run at once. Measured on 2026-09-13: the 20 lookups of
   one flare's film took 8.8 s one at a time, over the 8 s that plan 53 set as
   the limit for a step that only prepares a film. */
const LOOKUP_WIDTH = 3;

/* How many film frames may render at once. Measured on 2026-09-13 through the
   proxy, twelve AIA 171 frames of 640 px each way, twice: one at a time 15.3 and
   14.4 s, three at a time 5.8 and 5.9 s. Every answer was a 200, and a render
   took 1.1 s at the median either way. */
const FRAME_WIDTH = 3;

export function createSunFetch(opts = {}) {
  const base = opts.endpoint || ENDPOINT;
  const gap = opts.gapMs == null ? GAP_MS : opts.gapMs;
  const lookupWidth = opts.lookupWidth == null ? LOOKUP_WIDTH : opts.lookupWidth;
  const frameWidth = opts.frameWidth == null ? FRAME_WIDTH : opts.frameWidth;
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

  /* A lane: up to `width` tasks at once, in the order they came. A slot that
     finishes rests `gap` before it takes the next task, the same pause the queue
     keeps, so a lane is wider and not faster per slot. */
  function createLane(width) {
    const waiting = [];
    let running = 0;
    let pausedUntil = 0;
    let wake = null;
    const pump = () => {
      const rest = pausedUntil - Date.now();
      if (rest > 0) {
        if (!wake) wake = setTimeout(() => { wake = null; pump(); }, rest);
        return;
      }
      while (running < width && waiting.length) waiting.shift()();
    };
    const lane = task => new Promise((resolve, reject) => {
      waiting.push(async () => {
        running++;
        inFlight++;
        try { resolve(await task()); } catch (e) { reject(e); }
        finally {
          inFlight--;
          done++;
          setTimeout(() => { running--; pump(); }, gap);
        }
      });
      pump();
    });
    lane.waiting = () => waiting.length;
    /* Helioviewer said "too many": nothing new leaves this lane before the wait is
       over, so the other slots do not keep asking into the limit. */
    lane.pause = ms => { pausedUntil = Math.max(pausedUntil, Date.now() + ms); };
    return lane;
  }

  const lookupLane = createLane(lookupWidth);
  const frameLane = createLane(frameWidth);

  function url(endpoint, params) {
    const q = new URLSearchParams({ endpoint, ...params });
    return base + '?' + q.toString();
  }

  async function once(target, as) {
    const res = await doFetch(target);
    if (!res.ok) {
      const err = new Error('helioviewer ' + res.status);
      err.status = res.status;
      err.retryAfter = res.headers && res.headers.get ? res.headers.get('retry-after') : null;
      throw err;
    }
    return as === 'blob' ? res.blob() : res.json();
  }

  /* One retry, and only for the two statuses that mean "later": a 400 from our
     own proxy is a request that will never become valid, and repeating it just
     doubles the wrong. The retry waits as long as Helioviewer asked, and a 429
     holds the whole lane for that long. */
  async function request(endpoint, params, as, lane = enqueue) {
    const target = url(endpoint, params);
    return lane(async () => {
      try {
        return await once(target, as);
      } catch (e) {
        if (!RETRY_STATUS.has(e.status)) throw e;
        const wait = retryWaitMs(e.retryAfter);
        if (e.status === 429 && lane.pause) lane.pause(wait);
        await new Promise(r => setTimeout(r, wait));
        return once(target, as);
      }
    });
  }

  /** Metadata for the image nearest a moment. Cheap, and the source of every
      derived quantity. Runs in the lookup lane. */
  function closestImage(sourceId, date) {
    return request('getClosestImage', {
      date: toInstant(date instanceof Date ? date.toISOString() : date),
      sourceId: String(sourceId)
    }, 'json', lookupLane);
  }

  /**
   * The query of one render.
   *
   * `y0` is in SCREEN coordinates, positive downward, while our world counts
   * positive upward. The minus sign below is the whole of that difference; drop
   * it and you fetch the bottom of the sun and draw it where the top belongs.
   * `x0` needs no such treatment — only the vertical axis is flipped.
   */
  function renderParams({ sourceId, date, imageScale, x0, y0, px }) {
    return {
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
    };
  }

  /** A rendered still, in the queue. */
  function screenshot(frame) {
    return request('takeScreenshot', renderParams(frame), 'blob');
  }

  /** A frame of a film: the same render, in the frame lane. */
  function filmFrame(frame) {
    return request('takeScreenshot', renderParams(frame), 'blob', frameLane);
  }

  function jp2Header(id) {
    return request('getJP2Header', { id: String(id) });
  }

  function dataSources() {
    return request('getDataSources', {});
  }

  return {
    closestImage, screenshot, filmFrame, jp2Header, dataSources,
    // As wide as the lanes, for a caller that asks as many at a time.
    lookupWidth, frameWidth,
    stats: () => ({
      inFlight, done,
      lookupsWaiting: lookupLane.waiting(),
      framesWaiting: frameLane.waiting()
    })
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
