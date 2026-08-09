/* ============================================================
   TERRA — Frames · referentierichtingen in Terra's scene-frame
   ------------------------------------------------------------
   Pure berekening. Geen three.js, geen DOM, geen netwerk.

   WAAROM DIT EEN EIGEN BESTAND IS
   `states/space.js` had de ecliptica-pool en de zonrichting zelf staan,
   en `layers/ecliptic-layer.js` heeft ze ook nodig. Twee kopieën van een
   frame-berekening is precies het soort duplicatie dat stil uiteen gaat
   lopen: de een krijgt een correctie, de ander niet, en het verschil is
   een paar graden die niemand opmerkt tot iets niet meer op elkaar valt.

   HET FRAME — gedeeld met sunmoon-layer, planets-layer, world.getCoords()
   en de shader. Lengte 0 op +Z, 90 oost op +X, noordpool op +Y. Numeriek
   bewezen tot 6e-16 in sessie 14; niet opnieuw uitzoeken.
   ============================================================ */

import { ephemeris, latLonToUnit, meanObliquity, julianDay, deltaTSeconds,
         norm180 } from '../sunmoon.js';

/* De sterrentijd van Greenwich, afgeleid uit wat de app toch al berekent.
   `subSolar.lon = ra_zon - gast`, dus gast volgt daaruit. Zo kan deze
   module niet uit de pas lopen met de rest van de projectie. */
export function gastVan(eph) {
  return eph.sun.ra - eph.subSolar.lon;
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
export function eclipticaPool(date) {
  const jdUT = julianDay(date);
  const T = (jdUT + deltaTSeconds(date) / 86400 - 2451545.0) / 36525;
  const eps = meanObliquity(T);
  const gast = gastVan(ephemeris(date));
  const u = latLonToUnit(90 - eps, norm180(270 - gast));
  return { x: u.x, y: u.y, z: u.z, obliquiteit: eps };
}

/* De zonrichting: het subsolaire punt naar buiten toe. */
export function zonRichting(date) {
  const s = ephemeris(date).subSolar;
  return latLonToUnit(s.lat, s.lon);
}

/* ------------------------------------------------------------
   EEN GROOTCIRKEL LOODRECHT OP EEN AS.

   Geeft `punten` eenheidsvectoren rond `as`. Wordt gebruikt voor de
   ecliptica op de bol, en is met opzet algemeen: de hemelequator of het
   galactisch vlak vragen dezelfde meetkunde en horen geen tweede
   implementatie te krijgen.

   De hulpvector is +Y, behalve wanneer de as daar bijna mee samenvalt —
   dan wordt het kruisproduct nul en klapt de basis in. Dat is dezelfde
   klasse fout als de sentinel-vector uit sessie 14: een aanname over
   twee richtingen die toevallig meestal klopt.
------------------------------------------------------------ */
export function grootcirkel(as, punten = 180) {
  const L = Math.hypot(as.x, as.y, as.z) || 1;
  const n = { x: as.x / L, y: as.y / L, z: as.z / L };
  const hulp = Math.abs(n.y) > 0.95 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };

  const kruis = (a, b) => ({ x: a.y * b.z - a.z * b.y,
                             y: a.z * b.x - a.x * b.z,
                             z: a.x * b.y - a.y * b.x });
  const norm = (v) => { const l = Math.hypot(v.x, v.y, v.z) || 1;
                        return { x: v.x / l, y: v.y / l, z: v.z / l }; };

  const u = norm(kruis(n, hulp));
  const v = norm(kruis(n, u));

  const uit = [];
  for (let i = 0; i < punten; i++) {
    const a = (i / punten) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    uit.push({ x: u.x * c + v.x * s, y: u.y * c + v.y * s, z: u.z * c + v.z * s });
  }
  return uit;
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
const AE_KM = 149597870.7;
const AARDE_OVER_ZON = 3.00348959632e-6;
export const L1_L2_KM = AE_KM * Math.cbrt(AARDE_OVER_ZON / 3);   // 1,497 mln km

export const LAGRANGE_INFO = {
  L1: { naam: 'L1', wat: 'Solar wind is measured here before it reaches us — DSCOVR, ACE' },
  L2: { naam: 'L2', wat: 'Shielded from the Sun by Earth — James Webb, Gaia, Euclid' },
  L4: { naam: 'L4', wat: 'Sixty degrees ahead of Earth in its orbit' },
  L5: { naam: 'L5', wat: 'Sixty degrees behind — proposed spot for space-weather watch' }
};

/* Richtingen vanaf het aardmiddelpunt. L1 naar de zon toe, L2 er recht
   vanaf, L4/L5 in het eclipticavlak op 60 graden. */
export function lagrangeRichtingen(date) {
  const z = zonRichting(date);
  const p = eclipticaPool(date);

  const kruis = (a, b) => ({ x: a.y * b.z - a.z * b.y,
                             y: a.z * b.x - a.x * b.z,
                             z: a.x * b.y - a.y * b.x });
  const norm = (v) => { const l = Math.hypot(v.x, v.y, v.z) || 1;
                        return { x: v.x / l, y: v.y / l, z: v.z / l }; };

  // Een richting in het eclipticavlak, loodrecht op de zonlijn: daarmee
  // is elke hoek binnen dat vlak op te bouwen.
  const zij = norm(kruis(p, z));
  const draai = (graden) => {
    const a = graden * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return norm({ x: z.x * c + zij.x * s, y: z.y * c + zij.y * s, z: z.z * c + zij.z * s });
  };

  return {
    L1: { richting: z,                                    afstandKm: L1_L2_KM, opZonschil: false },
    L2: { richting: { x: -z.x, y: -z.y, z: -z.z },        afstandKm: L1_L2_KM, opZonschil: false },
    L4: { richting: draai(60),                            afstandKm: AE_KM,    opZonschil: true },
    L5: { richting: draai(-60),                           afstandKm: AE_KM,    opZonschil: true }
  };
}
