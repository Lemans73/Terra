/* ============================================================
   TERRA — Sun · the GOES X-ray flux, as a feed
   ------------------------------------------------------------
   NOAA SWPC publishes the flux of the primary GOES satellite in three
   files that differ only in how far back they reach. This module keeps
   one of them, fetches it only while the sun state is open, and hands
   the rows on as points (js/layers/sun/lane.js).

   THE SMALLEST FILE THAT COVERS THE WINDOW, AND ONLY EVER UPWARD.
   Measured 2026-09-11, gzip on the wire: one day 93 KB, three days
   295 KB, seven days 675 KB. The 24-hour window needs the first; asking
   for a wider window switches to a bigger file, and the feed stays there.
   Stepping back down would trade a few hundred kilobytes for a second
   download the moment the window widens again — the same one-way rule the
   magnetometer feed follows (js/compute/magnetosphere-feed.js).

   NO PROXY. services.swpc.noaa.gov sends `access-control-allow-origin: *`,
   so this works from the standalone as well: what works without a server
   may come along.

   EVERY FIVE MINUTES. The file changes every minute and says
   `max-age=60`; a lane that is five minutes behind the newest sample says
   so by where its line ends, and polling faster buys nothing a reader
   would see.
   ============================================================ */

import { parseXrayRows } from './lane.js';

const XRAY_FEED_BASE = 'https://services.swpc.noaa.gov/json/goes/primary/';

/* Ordered by reach. `reach` is what the file promises, not what it holds:
   the seven-day file starts at the same minute of the day, seven days ago. */
export const XRAY_FILES = [
  { reach: 24 * 3600e3,     file: 'xrays-1-day.json' },
  { reach: 3 * 24 * 3600e3, file: 'xrays-3-day.json' },
  { reach: 7 * 24 * 3600e3, file: 'xrays-7-day.json' }
];

const XRAY_POLL_MS = 5 * 60000;
const XRAY_TIMEOUT_MS = 20000;

export function createXrayFeed(opts = {}) {
  const fetchImpl = opts.fetch || ((...a) => fetch(...a));
  const pollMs = opts.pollMs || XRAY_POLL_MS;

  let fileIndex = 0;
  let points = [];
  let satellite = null;
  let fetchedAt = null;
  let heldIndex = -1;          // which file the points came from
  let error = null;
  let inflight = null;
  let timer = null;
  let active = false;
  const listeners = new Set();

  const notify = () => { for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } } };

  async function pull() {
    if (inflight) return inflight;
    const index = fileIndex;
    const ctl = new AbortController();
    const stopper = setTimeout(() => ctl.abort(), XRAY_TIMEOUT_MS);
    inflight = (async () => {
      try {
        const res = await fetchImpl(XRAY_FEED_BASE + XRAY_FILES[index].file, { signal: ctl.signal });
        if (!res.ok) throw new Error('NOAA answered ' + res.status);
        const parsed = parseXrayRows(await res.json());
        /* A smaller file that arrives after a bigger one was asked for is still
           newer — but it would shrink the reach behind the window's back. Keep
           it only if nothing wider has been requested since. */
        if (index >= fileIndex || !points.length) {
          points = parsed.points;
          satellite = parsed.satellite;
          heldIndex = index;
        }
        fetchedAt = Date.now();
        error = null;
      } catch (e) {
        error = e && e.name === 'AbortError' ? 'NOAA did not answer' : (e && e.message) || 'fetch failed';
      } finally {
        clearTimeout(stopper);
        inflight = null;
      }
      notify();
      // A wider file was asked for while this one was on its way.
      if (active && fileIndex > heldIndex && !error) pull();
    })();
    return inflight;
  }

  return {
    /* Open while the sun state is: one fetch now, then on a timer. */
    start() {
      if (active) return;
      active = true;
      pull();
      timer = setInterval(pull, pollMs);
    },
    stop() {
      active = false;
      clearInterval(timer);
      timer = null;
    },

    /* Make sure the file covers `ms` back from its newest sample. Upward only. */
    cover(ms) {
      const want = XRAY_FILES.findIndex(f => f.reach >= ms);
      const index = want < 0 ? XRAY_FILES.length - 1 : want;
      if (index <= fileIndex) return false;
      fileIndex = index;
      if (active) pull();
      return true;
    },

    points: () => points,
    satellite: () => satellite,
    newest: () => (points.length ? points[points.length - 1].time : null),
    onUpdate(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    /* A measurement hook: what the feed holds, not what it was asked for. */
    state: () => ({
      active,
      file: heldIndex >= 0 ? XRAY_FILES[heldIndex].file : null,
      wanted: XRAY_FILES[fileIndex].file,
      points: points.length,
      satellite,
      from: points.length ? new Date(points[0].time).toISOString() : null,
      to: points.length ? new Date(points[points.length - 1].time).toISOString() : null,
      fetchedAt: fetchedAt ? new Date(fetchedAt).toISOString() : null,
      error
    })
  };
}
