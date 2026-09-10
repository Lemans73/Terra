/* ============================================================
   TERRA — Sun · the heliographic frame, in image coordinates
   ------------------------------------------------------------
   WHAT THIS IS FOR
   js/sunmoon-layer.js already places the NOAA sunspot regions, and it
   does so correctly: it builds an orthonormal basis in Terra's WORLD
   frame from the sun's rotation axis and the direction to earth, then
   puts a spot at heliographic (B, L) into it. Calibrated in session 12
   against a real SDO/HMI frame: median 1.67 degrees, under two of
   NOAA's own quantisation steps.

   The solar state looks at the sun down +z with an orthographic
   camera, so it needs the same basis expressed differently. Not a
   second model of the sun — the same one, in the coordinates the
   picture is in.

   THE BASIS
   The observer sits at +z, and the axis carries B0 and P:

     axis = (-sin P * cos B0,  cos P * cos B0,  sin B0)
     cm   = (0, 0, 1) with the axis component removed, renormalised
     west = axis x cm

   CM IS NOT THE VIEW DIRECTION. It is the point on the solar EQUATOR
   nearest the disc centre — where heliographic longitude starts — and
   the two coincide only at B0 = 0. Take (0, 0, 1) as cm directly and
   `west` comes out with length cos(B0), which puts every spot up to 13
   degrees off while still landing it on the disc at a plausible
   latitude.

   B0 drops out of solarPhysical() as a field of its own, and it is
   what makes the basis checkable: asin(viewDirection . axis) has to
   give it back. Not asin(cm . axis) — that is zero by construction,
   which is the point of cm.

   P IS ZERO FOR HELIOVIEWER, and that is measured rather than assumed.

   P is the position angle of the rotation axis IN THE IMAGE, so it
   depends on how the frame is oriented: 0 if the server hands you solar
   north up, up to plus or minus 26 degrees if it hands you terrestrial
   north up. On 2026-09-09 the true position angle was 22.98 degrees, so
   the two answers were 23 degrees apart — not a difference that hides.

   MEASURED on a real HMI continuum frame against the NOAA regions of
   that day. Mean distance from each predicted position to the nearest
   actual dark spot, in solar radii:

     P = 0       0.104     <- best
     P = +-2.5   0.105 / 0.108
     P = 22.98   0.180     (the true position angle)
     P = 40      0.250

   Noise floor, from 2000 draws of eight random points on the disc:
   0.330 on average, and 0.127 for the single best draw of all 2000. P=0
   beats even that, so the fit is not something a lucky arrangement
   produces.

   The residual 0.104 is roughly 6 degrees of longitude, which is about
   what half a day of solar rotation comes to (13.2 degrees per day) —
   NOAA publishes one position per day, and the frame was taken at noon.
   That is a limit of the comparison, not of the frame.

   THIS SETTLES B7 IN THE PLAN. The test plan put "apply CROTA2" under
   deliberately unsupported, on the grounds that Helioviewer probably
   normalises orientation already. It does. P stays a parameter because
   another source may not, but its default is now a finding.
   ============================================================ */

/* Prefixed: js/sunmoon.js:33 already has a bare `DEG`, and the standalone build
   pours every module into one scope. Same rule the AU_KM constants follow. */
const SOLAR_DEG = Math.PI / 180;

/**
 * The heliographic basis as seen by an observer on +z.
 *
 * @param {number} b0Deg  heliographic latitude of the disc centre
 * @param {number} pDeg   position angle of the rotation axis in the image
 */
export function solarFrame(b0Deg, pDeg = 0) {
  const b0 = b0Deg * SOLAR_DEG, p = pDeg * SOLAR_DEG;
  const cb = Math.cos(b0), sb = Math.sin(b0);
  const cp = Math.cos(p), sp = Math.sin(p);

  /* CM IS NOT THE VIEW DIRECTION, and that distinction is the whole of this
     function. The observer looks down +z, but `cm` is the point on the solar
     EQUATOR nearest the disc centre — the origin of heliographic longitude.
     Those two coincide only when B0 is zero.

     Taking (0, 0, 1) directly gave a basis whose `west` had length cos(B0):
     0.992 at B0 = 7.23, because the cross product of two vectors 83 degrees
     apart is shorter than one. Every spot then landed up to 13 degrees away
     from where the world frame put it — still on the disc, still at a plausible
     latitude, still drifting the right way from day to day.

     So this defers to frameFromVectors rather than repeating it. One
     construction with two entrances cannot drift apart; two constructions that
     must agree already have. */
  const axis = { x: -sp * cb, y: cp * cb, z: sb };
  const frame = frameFromVectors(axis, { x: 0, y: 0, z: 1 });
  if (!frame) {
    // B0 = +/-90: looking straight down the pole, where longitude has no
    // meaning. Not reachable from earth — B0 stays within +/-7.25 — but a
    // caller passing it deserves an answer rather than a NaN basis.
    return null;
  }
  frame.p = pDeg;
  return frame;
}

/**
 * Where a heliographic (latitude, longitude) sits, as a unit vector in image
 * coordinates. Same expression as placeSunspots() in js/sunmoon-layer.js, and
 * the same sign convention: NOAA counts west NEGATIVE, so the longitude is
 * negated exactly once, here, the way the layer negates it exactly once there.
 */
export function spotDirection(frame, latDeg, lonDeg) {
  const B = latDeg * SOLAR_DEG, L = -lonDeg * SOLAR_DEG;
  const cB = Math.cos(B), sB = Math.sin(B), cL = Math.cos(L), sL = Math.sin(L);
  const { cm, west, axis } = frame;
  return {
    x: cm.x * cB * cL + west.x * cB * sL + axis.x * sB,
    y: cm.y * cB * cL + west.y * cB * sL + axis.y * sB,
    z: cm.z * cB * cL + west.z * cB * sL + axis.z * sB
  };
}

/* NOAA'S POSITIONS CARRY A TIMESTAMP, AND IT IS NOT THE ONE YOU EXPECT.

   The Solar Region Summary is issued once a day, and the positions in it are
   "as of 2400Z" — the END of `observed_date`, not its start. Measured rather
   than taken on faith, session 49: L0 (the Carrington longitude of the disc
   centre) follows from NOAA's own two fields, since longitude + carrington
   longitude is L0 for every region in the file. That came out at 198 degrees
   for observed_date 2026-09-10, and 198 is where the ephemeris puts L0 at
   2026-09-10 24:00 UT — 13.6 degrees away from where it puts it at 00:00.
   Seven of the nine regions agreed exactly; the file rounds to whole degrees.

   Between that instant and the frame being drawn the sun turns, so a position
   drawn without this correction is a position from up to a day ago. Measured
   against a real HMI continuum frame: the residual has a clean minimum at the
   offset this function computes, and the fit improves from 0.101 to 0.075
   solar radii — better than a quarter of what was left.

   DIFFERENTIAL ROTATION IS INCLUDED because it is free and it is real: the
   equator laps the poles. The synodic rate is the sidereal one (Snodgrass &
   Ulrich 1990, from Doppler measurements) minus the earth's own motion around
   the sun, because what we watch is the sun turning under a moving observer.
   At the latitudes spots occur it is a small term — about 0.2 degrees a day
   between the equator and 20 degrees — but over the span of a time series it
   is the difference between spots that track and spots that drift. */
const SOLAR_ROT_SIDEREAL = 14.713;   // degrees/day at the equator
const SOLAR_ROT_B2 = -2.396;
const SOLAR_ROT_B4 = -1.787;
const EARTH_ORBIT_DEG_PER_DAY = 0.9856;

/** Synodic rotation rate at a heliographic latitude, in degrees per day. */
export function solarRotationRate(latDeg) {
  const s = Math.sin(latDeg * SOLAR_DEG), s2 = s * s;
  return SOLAR_ROT_SIDEREAL + SOLAR_ROT_B2 * s2 + SOLAR_ROT_B4 * s2 * s2
         - EARTH_ORBIT_DEG_PER_DAY;
}

/**
 * The instant NOAA's positions belong to, from the `observed_date` of the feed.
 *
 * Returns null for anything it cannot read, and every caller treats null as
 * "apply no correction" — a wrong shift is worse than none, because it moves
 * every spot by the same amount and so still looks entirely deliberate.
 */
export function noaaReferenceTime(observedDate) {
  if (!observedDate) return null;
  // Date-only ("2026-09-10") parses as UTC midnight; 2400Z is a day later.
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(observedDate)
    ? observedDate + 'T00:00:00Z'
    : observedDate);
  return Number.isFinite(t) ? t + 86400000 : null;
}

/**
 * NOAA's longitude, carried forward to the moment actually being drawn.
 *
 * West is NEGATIVE in NOAA's convention, and a spot travels west as the sun
 * turns, so time advancing makes the longitude smaller. That sign is the whole
 * correction; get it backwards and the error doubles instead of cancelling.
 */
export function longitudeAt(latDeg, lonDeg, refMs, targetMs) {
  if (refMs == null || targetMs == null || !Number.isFinite(refMs) ||
      !Number.isFinite(targetMs)) return lonDeg;
  const days = (targetMs - refMs) / 86400000;
  return lonDeg - solarRotationRate(latDeg) * days;
}

/**
 * Back from a direction to heliographic coordinates. Exists so the round trip
 * can be measured: a placement that cannot be inverted is a placement nobody
 * can check.
 */
export function directionToHeliographic(frame, v) {
  const { cm, west, axis } = frame;
  const dCm = v.x * cm.x + v.y * cm.y + v.z * cm.z;
  const dWest = v.x * west.x + v.y * west.y + v.z * west.z;
  const dAxis = v.x * axis.x + v.y * axis.y + v.z * axis.z;
  const lat = Math.asin(Math.max(-1, Math.min(1, dAxis))) / SOLAR_DEG;
  // Negated back, mirroring the single negation in spotDirection.
  const lon = -Math.atan2(dWest, dCm) / SOLAR_DEG;
  return { lat, lon };
}

/** Is this spot on the hemisphere facing us? z > 0 under an orthographic view. */
export const isFacing = v => v.z > 0;

/**
 * Angle between two unit vectors, in degrees. The measurement currency of this
 * module: every check below compares directions, never components, because two
 * frames can agree on a direction while disagreeing about how they wrote it.
 */
export function angleBetween(a, b) {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  return Math.acos(Math.max(-1, Math.min(1, dot))) / SOLAR_DEG;
}

/**
 * The same basis built the way js/sunmoon-layer.js builds it: from the axis and
 * the direction to earth, in whatever frame those two are given in. Kept here so
 * the two constructions can be compared directly rather than by reading them.
 *
 * @param {{x,y,z}} axis     the sun's rotation axis, unit
 * @param {{x,y,z}} toEarth  from the sun towards the observer, unit
 */
export function frameFromVectors(axisIn, toEarth) {
  /* The axis is normalised on the way in rather than trusted. A caller handing
     in a vector of length 1.008 gets a frame that is subtly wrong everywhere
     and complains nowhere: B0 comes out as asin of something larger than the
     sine it should be, and every spot shifts with it. */
  const aLen = Math.hypot(axisIn.x, axisIn.y, axisIn.z);
  if (aLen < 1e-12) return null;
  const axis = { x: axisIn.x / aLen, y: axisIn.y / aLen, z: axisIn.z / aLen };

  // cm is toEarth with the axis component removed, renormalised — the point on
  // the equator-parallel through the disc centre.
  const d = toEarth.x * axis.x + toEarth.y * axis.y + toEarth.z * axis.z;
  const cmRaw = {
    x: toEarth.x - axis.x * d,
    y: toEarth.y - axis.y * d,
    z: toEarth.z - axis.z * d
  };
  const len = Math.hypot(cmRaw.x, cmRaw.y, cmRaw.z);
  if (len < 1e-12) return null;   // looking straight down the pole: cm undefined
  const cm = { x: cmRaw.x / len, y: cmRaw.y / len, z: cmRaw.z / len };
  const west = {
    x: axis.y * cm.z - axis.z * cm.y,
    y: axis.z * cm.x - axis.x * cm.z,
    z: axis.x * cm.y - axis.y * cm.x
  };
  // B0 falls out rather than being passed in: it is the heliographic latitude
  // of the direction we are looking from.
  const b0 = Math.asin(Math.max(-1, Math.min(1, d))) / SOLAR_DEG;
  return { cm, axis, west, b0, p: null };
}
