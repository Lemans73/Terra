/* ============================================================
   TERRA — Frames · referentierichtingen in Terra's scene-frame
   ------------------------------------------------------------
   Pure berekening. Geen three.js, geen DOM, geen netwerk.

   WAAROM DIT EEN EIGEN BESTAND IS
   `states/space.js` had de ecliptica-pool en de zonrichting zelf staan,
   en `layers/sky-disks.js` heeft ze ook nodig. Twee kopieën van een
   frame-berekening is precies het soort duplicatie dat stil uiteen gaat
   lopen: de een krijgt een correctie, de ander niet, en het verschil is
   een paar graden die niemand opmerkt tot iets niet meer op elkaar valt.

   HET FRAME — gedeeld met sunmoon-layer, planets-layer, world.getCoords()
   en de shader. Lengte 0 op +Z, 90 oost op +X, noordpool op +Y. Numeriek
   bewezen tot 6e-16 in sessie 14; niet opnieuw uitzoeken.

   NAAMGEVING (sessie 23): identifiers zijn Engels, commentaar blijft
   Nederlands. `gast` en `eps` houden hun naam — dat zijn de standaard
   astronomische symbolen voor Greenwich Apparent Sidereal Time en de
   scheefstand, geen Nederlandse woorden.
   ============================================================ */

import { ephemeris, latLonToUnit, meanObliquity, julianDay, deltaTSeconds,
         norm180 } from '../sunmoon.js';

/* De sterrentijd van Greenwich, afgeleid uit wat de app toch al berekent.
   `subSolar.lon = ra_zon - gast`, dus gast volgt daaruit. Zo kan deze
   module niet uit de pas lopen met de rest van de projectie. */
export function gastFrom(eph) {
  return eph.sun.ra - eph.subSolar.lon;
}

/* ------------------------------------------------------------
   DE TWEE GETALLEN DIE DE HELE HEMELORIENTATIE BEPALEN.

   `gast` draait het aardvaste frame naar een equatoriaal frame waarin
   +Z het lentepunt is; `eps` kantelt dat daarna naar de ecliptica. Alles
   in deze module en in `core/sky-orientation.js` is een functie van deze
   twee, en ze hebben daarom één bron.
------------------------------------------------------------ */
export function skyFrame(date) {
  const jdUT = julianDay(date);
  const T = (jdUT + deltaTSeconds(date) / 86400 - 2451545.0) / 36525;
  return { gast: gastFrom(ephemeris(date)), eps: meanObliquity(T) };
}

/* ------------------------------------------------------------
   DE ECLIPTICA-NOORDPOOL als eenheidsvector.

   Hij ligt op rechte klimming 270 graden en declinatie 90 - eps. In
   Terra's AARDVASTE frame draait hij dus mee met de sterrentijd, en dat
   is fysiek juist: sta je boven de ecliptica-pool, dan draait de aarde
   onder je door.

   De hoek met de rotatie-as is eps, de scheefstand van 23,44 graden —
   dezelfde die de seizoenen maakt.
------------------------------------------------------------ */
export function eclipticPole(date) {
  const { gast, eps } = skyFrame(date);
  const u = latLonToUnit(90 - eps, norm180(270 - gast));
  return { x: u.x, y: u.y, z: u.z, eps };
}

/* ------------------------------------------------------------
   HET LENTEPUNT als eenheidsvector: rechte klimming 0, declinatie 0.

   Omdat `sub.lon = ra - gast`, staat RA 0 op geografische lengte -gast.
   De vector schuift dus met 15,041 graden per uur westwaarts over de
   aarde — dat is de siderische dag, en het is precies wat de
   RA-verdeling op de hemelequator laat zien.

   Waarom dit ertoe doet buiten de verdeling: samen met de pool spant hij
   het hele hemelframe op, en het heliocentrische beeld heeft juist die
   tweede vector nodig om zijn stand vast te leggen.
------------------------------------------------------------ */
export function vernalEquinox(date) {
  return latLonToUnit(0, norm180(-skyFrame(date).gast));
}

/* De zonrichting: het subsolaire punt naar buiten toe. */
export function sunDirection(date) {
  const s = ephemeris(date).subSolar;
  return latLonToUnit(s.lat, s.lon);
}

/* Twee vectorhelpers. Ze staan BOVEN hun gebruikers: `greatCircle` en
   `lagrangeDirections` zijn hoisted functiedeclaraties, deze twee zijn dat
   als `const` niet. Zolang niemand ze tijdens de module-evaluatie aanroept
   gaat het goed — maar dat is precies de aanname die dit project zeven keer
   een leeg bootscherm heeft gekost. */
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y,
                           y: a.z * b.x - a.x * b.z,
                           z: a.x * b.y - a.y * b.x });

const normalise = (v) => { const l = Math.hypot(v.x, v.y, v.z) || 1;
                           return { x: v.x / l, y: v.y / l, z: v.z / l }; };

/* ------------------------------------------------------------
   EEN GROOTCIRKEL LOODRECHT OP EEN AS.

   Geeft `points` eenheidsvectoren rond `axis`. Wordt gebruikt voor de
   ecliptica op de bol, en is met opzet algemeen: de hemelequator of het
   galactisch vlak vragen dezelfde meetkunde en horen geen tweede
   implementatie te krijgen.

   De hulpvector is +Y, behalve wanneer de as daar bijna mee samenvalt —
   dan wordt het kruisproduct nul en klapt de basis in. Dat is dezelfde
   klasse fout als de sentinel-vector uit sessie 14: een aanname over
   twee richtingen die toevallig meestal klopt.
------------------------------------------------------------ */
export function greatCircle(axis, points = 180) {
  const L = Math.hypot(axis.x, axis.y, axis.z) || 1;
  const n = { x: axis.x / L, y: axis.y / L, z: axis.z / L };
  const helper = Math.abs(n.y) > 0.95 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };

  const u = normalise(cross(n, helper));
  const v = normalise(cross(n, u));

  const out = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    out.push({ x: u.x * c + v.x * s, y: u.y * c + v.y * s, z: u.z * c + v.z * s });
  }
  return out;
}

/* ------------------------------------------------------------
   DE LAGRANGE-PUNTEN van het zon-aardestelsel, als richting plus
   ware afstand tot de aarde in kilometers.

   L1 en L2 liggen op de zon-aardelijn, op r = R * cbrt(m / 3M) — 1,497
   miljoen km, oftewel EEN PROCENT van de zonafstand. Dat getal is de
   reden dat ze niet op dezelfde schaal als de zon getekend kunnen
   worden: op Terra's zoncompressie van 1 : 5591 komen ze op 4,2
   eenheden van het middelpunt uit, en de globe heeft straal 100. Ze
   zouden dus IN de aarde liggen. De laag zet ze daarom op een eigen
   straal en zegt dat er in de readout bij.

   L4 en L5 liggen 60 graden voor en achter de aarde in haar baan, op
   precies de zonafstand — die passen wel gewoon op de zonschil.

   WAAROM DIT IN EEN GEOFYSISCH DASHBOARD HOORT: op L1 staan DSCOVR en
   ACE, en zij meten de zonnewind voordat hij de aarde bereikt. Elke
   ruimteweer-waarschuwing hangt daaraan. L2 huisvest James Webb, Gaia
   en Euclid.
------------------------------------------------------------ */
/* GEEN `AU_KM`, hoe voor de hand liggend die naam ook is: `js/sunmoon.js:162`
   heeft er al een, en tools/build-standalone.mjs concateneert alle modules in
   EEN scope. Een tweede declaratie is daar een parse-fout en dus een lege bol.
   Dit is precies de val die de hernoeming van sessie 23 zelf creëerde — de
   oude naam `AE_KM` was toevallig uniek. */
const FRAMES_AU_KM = 149597870.7;
const EARTH_OVER_SUN = 3.00348959632e-6;
export const L1_L2_KM = FRAMES_AU_KM * Math.cbrt(EARTH_OVER_SUN / 3);   // 1,497 mln km

export const LAGRANGE_INFO = {
  L1: { name: 'L1', what: 'Solar wind is measured here before it reaches us — DSCOVR, ACE' },
  L2: { name: 'L2', what: 'Shielded from the Sun by Earth — James Webb, Gaia, Euclid' },
  L4: { name: 'L4', what: 'Sixty degrees ahead of Earth in its orbit' },
  L5: { name: 'L5', what: 'Sixty degrees behind — proposed spot for space-weather watch' }
};

/* Richtingen vanaf het aardmiddelpunt. L1 naar de zon toe, L2 er recht
   vanaf, L4/L5 in het eclipticavlak op 60 graden. */
export function lagrangeDirections(date) {
  const z = sunDirection(date);
  const p = eclipticPole(date);

  // Een richting in het eclipticavlak, loodrecht op de zonlijn: daarmee
  // is elke hoek binnen dat vlak op te bouwen.
  const side = normalise(cross(p, z));
  const rotate = (degrees) => {
    const a = degrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return normalise({ x: z.x * c + side.x * s,
                       y: z.y * c + side.y * s,
                       z: z.z * c + side.z * s });
  };

  return {
    L1: { direction: z,                             distanceKm: L1_L2_KM, onSunShell: false },
    L2: { direction: { x: -z.x, y: -z.y, z: -z.z }, distanceKm: L1_L2_KM, onSunShell: false },
    L4: { direction: rotate(60),                    distanceKm: FRAMES_AU_KM,    onSunShell: true },
    L5: { direction: rotate(-60),                   distanceKm: FRAMES_AU_KM,    onSunShell: true }
  };
}
