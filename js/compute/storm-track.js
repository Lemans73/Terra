/* STORM TRACK AND WIND FOOTPRINT — geometry only.
   ===========================================================================

   Turns a parsed JTWC warning into lines on the globe. No THREE, no DOM: this
   file produces arrays of [lng, lat] and hands them to whoever draws.

   TWO THINGS COME OUT OF THE FILE, and neither of them is guessed:

     the forecast track   the `T` lines carry position AND intensity per lead
                          time, so there is nothing to extrapolate — JTWC says
                          where it expects the centre to be.
     the wind footprint   the radius of 34 kt winds per QUADRANT, in nautical
                          miles. Genuinely asymmetric: measured on warning 64
                          for LALA, NE 100 / SE 80 / NW 80 / SW 0. A single
                          circle would hide exactly what makes this worth
                          drawing.

   WHAT IS DELIBERATELY ABSENT: the cone of uncertainty. JTWC does not publish
   cone radii in this product; the `POSITION ACCURATE TO WITHIN nnn NM` line is
   the error on the CURRENT fix, not on the forecast, and rolling it forward
   would invent precision. No cone until there is a published table to draw it
   from.
   =========================================================================== */

/* NAMES OF THEIR OWN, because the standalone build pours every module into ONE
   scope and js/sunmoon.js already has a DEG — which there means degrees to
   radians and here the other way round. The build caught the collision. */
const TO_RAD = Math.PI / 180;
const TO_DEG = 180 / Math.PI;
// One nautical mile is one minute of arc, by definition.
const NM_TO_RAD = TO_RAD / 60;

/* THE SAFFIR-SIMPSON BOUNDARIES, IN KNOTS, and they are a published scale
   rather than a choice of ours: 34 kt is tropical storm force, 64 kt is
   hurricane force, and 83 / 96 / 113 / 137 are categories 2 to 5. The colours
   run cool to hot so intensity reads without a legend. */
const INTENSITY_SCALE = [
  { min: 137, color: '#f45cff', label: 'Category 5' },
  { min: 113, color: '#ff4d4d', label: 'Category 4' },
  { min: 96,  color: '#ff7a3d', label: 'Category 3' },
  { min: 83,  color: '#ffa53d', label: 'Category 2' },
  { min: 64,  color: '#ffd24d', label: 'Category 1' },
  { min: 34,  color: '#4dd0e1', label: 'Tropical storm' },
  { min: 0,   color: '#8fa6b8', label: 'Tropical depression' }
];

export function intensityBand(knots) {
  return INTENSITY_SCALE.find(b => (knots || 0) >= b.min) || INTENSITY_SCALE[INTENSITY_SCALE.length - 1];
}

/* A point at angular distance `delta` and compass bearing `theta` from a
   centre. The standard great-circle destination formula — the same one the
   footprint and the ring markers both need, so it lives here once. */
function destination(latDeg, lngDeg, theta, delta) {
  const lat1 = latDeg * TO_RAD, lng1 = lngDeg * TO_RAD;
  const sinLat = Math.sin(lat1) * Math.cos(delta) +
                 Math.cos(lat1) * Math.sin(delta) * Math.cos(theta);
  const lat2 = Math.asin(Math.max(-1, Math.min(1, sinLat)));
  const lng2 = lng1 + Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(lat1),
                                 Math.cos(delta) - Math.sin(lat1) * sinLat);
  // Back into [-180, 180]: a storm at the date line would otherwise give a line
  // that jumps right across the map.
  let lng = lng2 * TO_DEG;
  lng = ((lng + 540) % 360) - 180;
  return [lng, lat2 * TO_DEG];
}

/* DE VERWACHTE BAAN, als één segment per tijdstap.

   EEN SEGMENT PER STAP EN NIET ÉÉN LIJN, omdat de kleur de intensiteit draagt
   en die per stap verandert. Elk segment krijgt de band van zijn BEGINpunt: de
   lijn tussen T+0 en T+12 toont de kracht waarmee hij vertrekt, en de volgende
   die waarmee hij daar aankomt.

   De tussenliggende punten laten we aan de tekenlaag over — globe.gl verdeelt
   een pad zelf langs de grootcirkel (pathResolution). Zelf interpoleren zou
   dezelfde bewerking een tweede keer doen, en dan op een andere manier. */
export function forecastSegments(report) {
  const punten = (report && report.forecast || [])
    .filter(f => f.lat && f.lng)
    .sort((a, b) => a.tau - b.tau);
  const uit = [];
  for (let i = 0; i < punten.length - 1; i++) {
    const a = punten[i], b = punten[i + 1];
    uit.push({
      kind: 'storm-track',
      coords: [[a.lng.value * (a.lng.hemi === 'W' ? -1 : 1), a.lat.value * (a.lat.hemi === 'S' ? -1 : 1)],
               [b.lng.value * (b.lng.hemi === 'W' ? -1 : 1), b.lat.value * (b.lat.hemi === 'S' ? -1 : 1)]],
      knots: a.knots,
      color: intensityBand(a.knots).color,
      tauFrom: a.tau, tauTo: b.tau
    });
  }
  return uit;
}

// The individual points of the track, for a marker per lead time.
export function forecastStops(report) {
  return (report && report.forecast || [])
    .filter(f => f.lat && f.lng)
    .sort((a, b) => a.tau - b.tau)
    .map(f => ({
      tau: f.tau, knots: f.knots,
      lat: f.lat.value * (f.lat.hemi === 'S' ? -1 : 1),
      lng: f.lng.value * (f.lng.hemi === 'W' ? -1 : 1),
      color: intensityBand(f.knots).color
    }));
}

/* A SMALL CIRCLE ON THE GLOBE, as a closed loop, for the marker per lead time.
   The radius is in degrees of arc, so it is the same size at every latitude — a
   circle in lat/lon space would turn into an ellipse near the poles. */
export function circleAround(lat, lng, radiusDeg, steps = 24) {
  const delta = radiusDeg * TO_RAD;
  const uit = [];
  for (let i = 0; i <= steps; i++) uit.push(destination(lat, lng, (i / steps) * 2 * Math.PI, delta));
  return uit;
}

/* THE WIND FOOTPRINT: four quadrant arcs, each with its own radius.

   THE STEP BETWEEN QUADRANTS STAYS VISIBLE, and that is a choice. At the border
   between NE and SE the radius jumps from 100 to 80 nautical miles; both points
   go in, so a radial step appears. Interpolating smoothly would look better and
   would suggest a measurement that does not exist — JTWC gives four numbers,
   not a curve.

   A QUADRANT WITH RADIUS 0 COLLAPSES TO THE CENTRE. That is exactly what the
   file says: no wind of that strength on that side. */
export function windFootprint(lat, lng, quadrants, stepDeg = 5) {
  if (!quadrants) return null;
  // From north, clockwise: NE 0-90, SE 90-180, SW 180-270, NW 270-360.
  const volgorde = [['ne', 0], ['se', 90], ['sw', 180], ['nw', 270]];
  const uit = [];
  for (const [naam, start] of volgorde) {
    const nm = quadrants[naam];
    if (nm == null) return null;
    const delta = nm * NM_TO_RAD;
    for (let b = 0; b <= 90; b += stepDeg) {
      uit.push(destination(lat, lng, (start + b) * TO_RAD, delta));
    }
  }
  uit.push(uit[0]);   // sluiten
  return uit;
}

// What a footprint amounts to in the readout: the largest and the smallest
// radius, so the asymmetry is stated in text as well.
export function footprintSpan(quadrants) {
  if (!quadrants) return null;
  const w = ['ne', 'se', 'sw', 'nw'].map(k => quadrants[k]).filter(v => v != null);
  if (w.length !== 4) return null;
  return { min: Math.min(...w), max: Math.max(...w) };
}
