/* ============================================================
   TERRA — Sun · sources, and every quantity derived from metadata
   ------------------------------------------------------------
   THE LEADING PRINCIPLE OF THIS WHOLE LAYER: not one hard-coded number.
   `getClosestImage` returns rsun, refPixel, scale, width and height, and
   from those five the field of view, the apparent radius, the observer's
   distance, the native resolution and the useful zoom limit all follow.
   A table of fields per instrument would be a table that goes stale the
   day a source changes its detector.

   TWO RULES FOR THE FIELD, AND THE DIFFERENCE IS NOT COSMETIC
   Disc instruments put the sun in the middle of the detector, so the
   largest symmetric crop about that centre is the usable field. A
   coronagraph puts it deliberately off-centre, and the same rule then
   throws most of the instrument away: LASCO C3 came out at 11 solar
   radii instead of nearly 49 — three quarters of the field gone, and
   the main reason composites with LASCO looked wrong.
   ============================================================ */

/* The sources Terra offers. Not the full Helioviewer catalogue: an id whose
   `end` timestamp has passed draws a spacecraft that is no longer there, and
   the ones with a genuinely different vantage point (STEREO-A, Solar Orbiter)
   bring their own caveats that this state does not carry yet. */
export const SOURCES = [
  // SDO, near earth. Ordered by the height in the atmosphere they see, from
  // the photosphere upward — the same order the temperatures run in.
  { id: 18, name: 'HMI continuum',  what: 'Photosphere in white light, sunspots' },
  { id: 19, name: 'HMI magnetogram', what: 'Magnetic polarity' },
  { id: 16, name: 'AIA 1700', what: 'Upper photosphere, about 4,500 K' },
  { id: 15, name: 'AIA 1600', what: 'Transition region, about 10,000 K' },
  { id: 13, name: 'AIA 304',  what: 'Chromosphere, 50,000 K, prominences at the limb' },
  { id: 10, name: 'AIA 171',  what: 'Quiet corona, 600,000 K, coronal loops' },
  { id: 11, name: 'AIA 193',  what: 'Corona plus flare plasma, coronal holes' },
  { id: 12, name: 'AIA 211',  what: 'Active regions, about 2 MK' },
  { id: 14, name: 'AIA 335',  what: 'Active regions, about 2.5 MK' },
  { id: 8,  name: 'AIA 94',   what: 'Flaring regions, about 6 MK' },
  { id: 9,  name: 'AIA 131',  what: 'Flares at 10 MK plus cool plasma' },
  /* Coronagraphs. They run solo — see isCoronagraph.

     `occulter` IS THE ONE NUMBER THAT CANNOT BE DERIVED, and leaving it out
     cost session 49 a bug that looked like everything except what it was. The
     metadata describes the detector; it says nothing about the disc bolted in
     front of it. So a crop tighter than the occulter is empty by construction —
     not dim, not low contrast: empty. Ask for 2.06 radii of LASCO C3 and every
     pixel that comes back is black, and the request looks entirely reasonable.

     MEASURED, not taken from a datasheet, session 49: a frame fetched at a
     field well outside both instruments, then the first radius carrying data
     read back from the pixels in eight directions, median taken. C2 came out at
     2.40 and C3 at 4.67 solar radii, against published ranges of 2.2-6 and
     3.7-30 — so these agree with the instrument rather than merely with each
     other. See logs/MEETING-sessie-49-lasco-en-velden.md section 5. */
  { id: 4, name: 'LASCO C2', what: 'About 2.2 to 6 solar radii',
    coronagraph: true, occulter: 2.40 },
  { id: 5, name: 'LASCO C3', what: 'About 3.7 to 30 solar radii',
    coronagraph: true, occulter: 4.67 }
];

export const SOURCE_BY_ID = new Map(SOURCES.map(s => [s.id, s]));

export const isCoronagraph = id => !!(SOURCE_BY_ID.get(id) || {}).coronagraph;

/**
 * Which field to fetch, in solar radii.
 *
 * THE FIRST LOOK AT A SOURCE IS ALWAYS THE WHOLE SOURCE. Until someone has
 * seen what an instrument covers, cropping to the current zoom answers a
 * question nobody asked — and it answers it invisibly, because a tight crop of
 * LASCO C3 is a perfectly good picture of the wrong thing. It also means the
 * first zoom out has something to show: the texture already holds the full
 * field, so widening the view costs no request at all.
 *
 * After that the zoom leads. Someone who has framed a detail and fetches again
 * is asking for that detail at a better resolution, and handing back the whole
 * field would throw their framing away.
 *
 * For a disc instrument the two branches mostly agree anyway — AIA's native
 * field is 1.29 and the default view already asks for more than that.
 */
export function fieldFor(nativeField, viewR, sourceId, firstLoad) {
  if (firstLoad) return nativeField;
  return Math.min(nativeField, Math.max(viewR * 1.25, minimumField(sourceId)));
}

/**
 * The smallest field worth fetching from a source, in solar radii.
 *
 * For a disc instrument that is a floor against a degenerate crop. For a
 * coronagraph it is the occulter, with room to spare: a crop that only just
 * clears the disc shows a ring of a few pixels, which reads as a failure just
 * as much as black does.
 */
export function minimumField(sourceId) {
  const src = SOURCE_BY_ID.get(sourceId) || {};
  return src.occulter ? src.occulter * 1.6 : 0.2;
}

/* The four presets. Each carries its own framing, because the framing is part
   of what the preset means. */
export const PRESETS = [
  { key: 'quiet',    label: 'Quiet corona',      layers: [10], viewR: 1.65 },
  { key: 'active',   label: 'Active sun',        layers: [11, 10], modes: ['normal', 'add'], viewR: 1.65 },
  { key: 'sunspots', label: 'Sunspots',          layers: [18], viewR: 1.10 },
  { key: 'outward',  label: 'The corona outward', layers: [5, 4], modes: ['lumaAdd', 'lumaAdd'], viewR: 15 }
];

/* PREFIXED, and not because the short names were taken by accident. The
   standalone build pours every module into one script, so a bare `AU_KM` here
   collides with js/sunmoon.js:162 — which is exactly the collision that
   js/compute/frames.js:148 and js/compute/planets.js:248 already avoid the same
   way. The build is the only check that sees it; nothing fails in the browser,
   where each module has its own scope. */
const SOLAR_R_KM = 695700;
const SOLAR_AU_KM = 149597870.7;
const SOLAR_ARCSEC = Math.PI / (180 * 3600);

/**
 * Everything that follows from one getClosestImage response.
 *
 * @param {object} meta   the parsed JSON
 * @param {boolean} coronagraph  which of the two field rules applies
 */
export function deriveGeometry(meta, coronagraph) {
  const width = +meta.width;
  const height = +meta.height;
  const refX = +meta.refPixelX;
  const refY = +meta.refPixelY;
  const rsun = +meta.rsun;      // solar radius, in pixels of the source image
  const scale = +meta.scale;    // arcsec per pixel

  // The largest crop we can take about the reference pixel, in pixels.
  const halfPx = coronagraph
    ? Math.max(Math.max(refX, width - refX), Math.max(refY, height - refY))
    : Math.min(Math.min(refX, width - refX), Math.min(refY, height - refY));

  const nativeField = halfPx / rsun;          // in solar radii
  const radiusArcsec = rsun * scale;

  // 695700 km subtending radiusArcsec puts the observer here. SDO lands on
  // 0.9996 AU, which is the check that this chain is right rather than merely
  // plausible.
  const distanceKm = SOLAR_R_KM / Math.tan(radiusArcsec * SOLAR_ARCSEC);

  return {
    width, height, refX, refY, rsun, scale,
    nativeField,
    radiusArcsec,
    distanceKm,
    distanceAu: distanceKm / SOLAR_AU_KM,
    // rsun IS the native resolution in pixels per solar radius, and therefore
    // also the point past which zooming invents detail.
    pxPerRadius: rsun
  };
}

/** Texture size for a given field: one texel per source pixel, within reason. */
export function textureSize(field, rsun, ceiling) {
  const ideal = Math.round(2 * field * rsun);
  return Math.max(256, Math.min(ceiling, ideal));
}

/**
 * Sharpness, as three numbers that can be compared directly.
 *
 * Green below 1.25. Amber above it, meaning "fetch again at this zoom". Red
 * once the screen asks for more than the source has, because past that point
 * the extra pixels are invention.
 */
export function sharpness(texPx, field, screenPx, viewR, rsun) {
  const supplied = texPx / (2 * field);
  const wanted = screenPx / (2 * viewR);
  const ceiling = rsun;
  return {
    supplied, wanted, ceiling,
    ratio: wanted / supplied,
    verdict: wanted > ceiling ? 'red' : (wanted / supplied > 1.25 ? 'amber' : 'green')
  };
}

/**
 * How wide the earth is in texels of the current source. Below two, the source
 * cannot resolve the earth at all — and saying so explains what resolution
 * means in one line.
 */
export function earthInTexels(texPx, field) {
  return (6371 / SOLAR_R_KM) * (texPx / (2 * field));
}

/* getClosestImage returns "2026-09-08 11:59:57"; takeScreenshot wants
   "2026-09-08T11:59:57Z". One space, and it is the difference between an image
   and a 400. */
export function toInstant(date) {
  return date.trim().replace(' ', 'T').replace(/Z?$/, 'Z');
}
