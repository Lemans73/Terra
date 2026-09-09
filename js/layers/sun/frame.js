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

const DEG = Math.PI / 180;

/**
 * The heliographic basis as seen by an observer on +z.
 *
 * @param {number} b0Deg  heliographic latitude of the disc centre
 * @param {number} pDeg   position angle of the rotation axis in the image
 */
export function solarFrame(b0Deg, pDeg = 0) {
  const b0 = b0Deg * DEG, p = pDeg * DEG;
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
  const B = latDeg * DEG, L = -lonDeg * DEG;
  const cB = Math.cos(B), sB = Math.sin(B), cL = Math.cos(L), sL = Math.sin(L);
  const { cm, west, axis } = frame;
  return {
    x: cm.x * cB * cL + west.x * cB * sL + axis.x * sB,
    y: cm.y * cB * cL + west.y * cB * sL + axis.y * sB,
    z: cm.z * cB * cL + west.z * cB * sL + axis.z * sB
  };
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
  const lat = Math.asin(Math.max(-1, Math.min(1, dAxis))) / DEG;
  // Negated back, mirroring the single negation in spotDirection.
  const lon = -Math.atan2(dWest, dCm) / DEG;
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
  return Math.acos(Math.max(-1, Math.min(1, dot))) / DEG;
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
  const b0 = Math.asin(Math.max(-1, Math.min(1, d))) / DEG;
  return { cm, axis, west, b0, p: null };
}
