// ============================================================
//  geomag.js — de geomagnetische dipool uit IGRF-14
//
//  Pure rekenmodule: geen three.js, geen DOM. Zelfde tweedeling als
//  sunmoon.js / sunmoon-layer.js, en om dezelfde reden: dit is met `node` te
//  toetsen zonder browser, en de laag eromheen is dan puur tekenwerk.
//
//  WAT DIT WEL EN NIET IS. Hier staat alléén de DIPOOL: de eerste drie Gauss-
//  coëfficiënten, oftewel het veld van één rechte staafmagneet door het
//  aardmiddelpunt. Dat levert twee GEOMAGNETISCHE polen op, en die zijn per
//  definitie elkaars tegenpunt. Dat is iets anders dan de MAGNETISCHE DIP-POLEN,
//  waar een kompasnaald werkelijk recht omlaag wijst; die volgen pas uit de volle
//  reeks van 195 coëfficiënten, liggen niet tegenover elkaar, en zijn wat elk
//  nieuwsbericht over "de magnetische pool raast naar Siberië" bedoelt. Ter
//  vergelijking in 2025: dipoolpool 80,8° N / 72,8° W, dip-pool 85,8° N /
//  138,1° O. Wie die twee verwart, denkt dat de app fout staat.
//
//  Bron: IGRF-14 (IAGA werkgroep V-MOD, 2024), coëfficiëntenlijst
//  igrf14coeffs.txt van NOAA NCEI. De waarden hieronder zijn machinaal uit dat
//  bestand overgenomen, niet overgetypt — een tikfout hierin is geen
//  natuurkundefout en zou dus nergens uit komen rollen.
// ============================================================

import { latLonToUnit, DEG } from './sunmoon.js';

// ---- De coëfficiënten -------------------------------------------------------
//
// Structuur bewust generiek: `epochs` + een rij per coëfficiënt met zijn 26
// waarden en zijn seculaire variatie. Een volledige IGRF-tabel (195 rijen) past
// in exact dezelfde vorm, zodat interpolate() daar ongewijzigd op werkt als de
// veldweergave uit de Magnetosphere-PoC later deze kant op komt.
//
// De DGRF-epochen (1900 t/m 2020) zijn definitief en veranderen niet meer; 2025
// is de voorspelling van IGRF-14 en de SV-kolom geldt van 2025 tot 2030.
export const IGRF14_DIPOLE = {
  epochs: [1900, 1905, 1910, 1915, 1920, 1925, 1930, 1935, 1940, 1945, 1950, 1955,
           1960, 1965, 1970, 1975, 1980, 1985, 1990, 1995, 2000, 2005, 2010, 2015,
           2020, 2025],
  svUntil: 2030,
  rows: [
    { c: 'g', n: 1, m: 0, sv: 12.6,
      v: [-31543, -31464, -31354, -31212, -31060, -30926, -30805, -30715, -30654,
          -30594, -30554, -30500, -30421, -30334, -30220, -30100, -29992, -29873,
          -29775, -29692, -29619.4, -29554.63, -29496.57, -29441.46, -29403.41, -29350] },
    { c: 'g', n: 1, m: 1, sv: 10,
      v: [-2298, -2298, -2297, -2306, -2317, -2318, -2316, -2306, -2292, -2285,
          -2250, -2215, -2169, -2119, -2068, -2013, -1956, -1905, -1848, -1784,
          -1728.2, -1669.05, -1586.42, -1501.77, -1451.37, -1410.3] },
    { c: 'h', n: 1, m: 1, sv: -21.5,
      v: [5922, 5909, 5898, 5875, 5845, 5817, 5808, 5812, 5821, 5810, 5815, 5820,
          5791, 5776, 5737, 5675, 5604, 5500, 5406, 5306, 5186.1, 5077.99, 4944.26,
          4795.99, 4653.35, 4545.5] }
  ]
};

// Het bereik waarbinnen het model iets zegt. Daarbuiten klemmen we en melden we
// dat: via het datumveld is 1850 net zo goed in te typen als 2026.
export const MODEL_RANGE = [
  IGRF14_DIPOLE.epochs[0],
  IGRF14_DIPOLE.svUntil
];

// ---- Tijd -------------------------------------------------------------------

// Decimaal jaar, schrikkeljaarbestendig doordat de lengte van het jaar zelf de
// noemer is. ALTIJD via de UTC-getters: de app heeft sinds sessie 18 een
// UTC-schakelaar, en die mag de natuurkunde niet aanraken.
export function decimalYear(date) {
  const y = date.getUTCFullYear();
  const begin = Date.UTC(y, 0, 1);
  const eind = Date.UTC(y + 1, 0, 1);
  return y + (date.getTime() - begin) / (eind - begin);
}

// ---- Interpolatie -----------------------------------------------------------

// De IGRF-regel, en bewust geen spline: lineair tussen de twee omliggende
// vijfjaarsepochen, en na de laatste epoche met de SV-kolom in nT per jaar.
// Interpoleer de COËFFICIËNTEN en niet de poolcoördinaten die eruit volgen —
// dat laatste geeft een zichtbaar geknikt spoor.
//
// Retourneert een array met één waarde per rij, in de volgorde van `model.rows`.
export function interpolate(model, jaar) {
  const ep = model.epochs;
  const laatste = ep.length - 1;
  const t = Math.min(Math.max(jaar, ep[0]), model.svUntil);
  if (t >= ep[laatste]) {
    const dt = t - ep[laatste];
    return model.rows.map(r => r.v[laatste] + dt * r.sv);
  }
  let k = 0;
  while (k < laatste - 1 && t >= ep[k + 1]) k++;
  const f = (t - ep[k]) / (ep[k + 1] - ep[k]);
  return model.rows.map(r => r.v[k] + f * (r.v[k + 1] - r.v[k]));
}

// ---- De dipool --------------------------------------------------------------

// De dipoolas uit g₁⁰, g₁¹ en h₁¹.
//
// In het geocentrische frame wijst het dipoolmoment langs (g₁¹, h₁¹, g₁⁰). Omdat
// g₁⁰ NEGATIEF is wijst die vector naar het zuiden: de magnetische noordpool van
// de aarde is fysisch een magnetische zuidpool. De geomagnetische NOORDpool is
// daarom de tegengestelde richting, en daar komen alle mintekens hieronder
// vandaan.
//
// atan2 en NOOIT atan: `atan(h11/g11)` geeft 72,7 graden OOST in plaats van west.
// Dat is 145 graden ernaast, de pool landt in Siberië, en niets aan het beeld
// verraadt dat er iets mis is — hij ziet er dan uit als de dip-pool.
export function dipole(date) {
  const jaarRuw = decimalYear(date);
  const jaar = Math.min(Math.max(jaarRuw, MODEL_RANGE[0]), MODEL_RANGE[1]);
  const [g10, g11, h11] = interpolate(IGRF14_DIPOLE, jaar);
  const B0 = Math.hypot(g10, g11, h11);
  const latN = Math.asin(-g10 / B0) / DEG;
  const lonN = Math.atan2(-h11, -g11) / DEG;
  return {
    jaar, buitenBereik: jaarRuw !== jaar,
    herkomst: herkomstVan(jaar),
    g10, g11, h11, B0,
    // Twee exact antipodale punten; voor een gecentreerde dipool kan het niet
    // anders, en die identiteit is meteen de goedkoopste zelftoets.
    north: { lat: latN, lon: lonN },
    south: { lat: -latN, lon: lonN > 0 ? lonN - 180 : lonN + 180 },
    // Hoek met de rotatie-as. Ongeveer 9,4 graden, en dát is de wobble.
    tilt: 90 - latN
  };
}

// ---- Waar een waarde vandaan komt ------------------------------------------
//
// ER IS GEEN "LAATSTE METING" VAN DE DIPOOLAS, en dat is de kern van deze functie.
// IGRF is een MODEL dat IAGA-werkgroep V-MOD elke vijf jaar vaststelt uit
// grondobservatoria en de Swarm-satellieten. Wat de app voor vandaag toont is
// bovendien geen vastgestelde waarde: onze tabel eindigt op epoche 2025,0 en alles
// daarna komt uit de voorspelde seculaire variatie.
//
// Drie standen, en die zijn niet cosmetisch: 'definitive' is nagerekend en
// vastgesteld, 'extrapolated' is een voorspelling die verder van de epoche af
// slechter wordt. Wie dat verschil niet ziet leest een prognose als een meting.
export const LAATSTE_EPOCHE = IGRF14_DIPOLE.epochs[IGRF14_DIPOLE.epochs.length - 1];
export const LAATSTE_DEFINITIEF = IGRF14_DIPOLE.epochs[IGRF14_DIPOLE.epochs.length - 2];
export const MODEL_NAAM = 'IGRF-14';
export const MODEL_VASTGESTELD = 2024;   // IAGA V-MOD, eind 2024, voor epoche 2025,0
export const MODEL_HERZIENING = 2030;    // volgende generatie

export function herkomstVan(jaar) {
  if (jaar <= LAATSTE_DEFINITIEF) {
    return { soort: 'definitive', jarenVoorbij: 0 };
  }
  if (jaar <= LAATSTE_EPOCHE) {
    return { soort: 'interpolated', jarenVoorbij: 0 };
  }
  return { soort: 'extrapolated', jarenVoorbij: jaar - LAATSTE_EPOCHE };
}

// Hoeveel kilometer de geomagnetische noordpool is opgeschoven sinds de laatste
// epoche. Een hoek zegt weinig; deze afstand maakt tastbaar hoe ver we voorbij het
// vastgestelde model rekenen. Grootcirkelafstand over een bol van 6371 km.
export function driftSindsEpoche(jaar) {
  if (jaar <= LAATSTE_EPOCHE) return 0;
  const a = poolOpJaar(LAATSTE_EPOCHE), b = poolOpJaar(jaar);
  const la = a.lat * DEG, lb = b.lat * DEG, dl = (b.lon - a.lon) * DEG;
  const c = Math.sin(la) * Math.sin(lb) + Math.cos(la) * Math.cos(lb) * Math.cos(dl);
  return Math.acos(Math.min(1, Math.max(-1, c))) * 6371;
}

function poolOpJaar(jaar) {
  const [g10, g11, h11] = interpolate(IGRF14_DIPOLE, jaar);
  const B0 = Math.hypot(g10, g11, h11);
  return { lat: Math.asin(-g10 / B0) / DEG, lon: Math.atan2(-h11, -g11) / DEG };
}

// GEOCENTRISCH VERSUS GEODETISCH — gemeten, niet aangenomen (sessie 18).
// Alles hierboven rekent GEOCENTRISCH: de breedte is de hoek vanuit het
// aardmiddelpunt. Gepubliceerde pooltabellen (WDC Kyoto, en daarmee ook wat je in
// een encyclopedie vindt) geven GEODETISCHE breedte, de hoek met de normaal op de
// WGS84-ellipsoïde. Dat scheelt op poolbreedte ongeveer 0,06 graden, oftewel 6,7 km.
//
// De meting die dit vaststelde, over 35 gepubliceerde jaren van 1900 tot 2030:
// geocentrisch vergeleken gaf max 0,113° en gemiddeld 0,065° afwijking, en dat is
// méér dan hun afrondingsstap; met deze conversie erop max 0,050° en gemiddeld
// 0,026°, precies de halve stap van een tabel op 0,1 graad. Het was dus geen fout
// maar een verschil in grootheid.
//
// TERRA TEKENT GEOCENTRISCH en dat moet ook: de bol heeft straal 100 en
// latLonToUnit leest de breedte als een boldhoek. De readout toont daarom óók de
// geocentrische waarde, zodat getal en markering hetzelfde zeggen. Deze functie is
// er alleen om tegen gepubliceerde tabellen te kunnen toetsen — en voor de uitleg
// in het paneel, waar het verschil benoemd wordt.
const WGS84_AFPLATTING = 1 / 298.257223563;
export function toGeodeticLat(geocentrischeLat) {
  const k = (1 - WGS84_AFPLATTING) ** 2;
  return Math.atan(Math.tan(geocentrischeLat * DEG) / k) / DEG;
}

// De as als eenheidsvector in Terra's scene-frame (lengte 0 op +Z, 90 oost op +X,
// noordpool op +Y), wijzend naar de geomagnetische noordpool.
//
// Deze uitdrukking is óók het frame-bewijs: hij moet tot op afrondingsniveau
// samenvallen met latLonToUnit(north.lat, north.lon). Vallen die twee uiteen, dan
// is er ergens een as verwisseld — dezelfde toets die in sessie 14 de
// zon-maan-laag op 6e-16 vastpinde.
export function dipoleAxis(d) {
  return { x: -d.h11 / d.B0, y: -d.g10 / d.B0, z: -d.g11 / d.B0 };
}

// ---- Het driftspoor ---------------------------------------------------------

// Het pad dat de geomagnetische noordpool aflegt. Substappen binnen elk
// vijfjaarsinterval, want we interpoleren de coëfficiënten en het spoor is dan
// glad in plaats van een lijnstuk per epoche.
//
// Kost niets: ongeveer 625 keer een formule met drie termen. Het spoor hangt niet
// van het gekozen moment af en wordt dus één keer gebouwd, niet gesmoord.
export function poleDriftTrack(vanJaar = MODEL_RANGE[0], totJaar = MODEL_RANGE[1], perInterval = 24) {
  const stap = 5 / perInterval;
  const punten = [];
  for (let t = vanJaar; t <= totJaar + 1e-9; t += stap) {
    const jaar = Math.min(t, totJaar);
    const [g10, g11, h11] = interpolate(IGRF14_DIPOLE, jaar);
    const B0 = Math.hypot(g10, g11, h11);
    punten.push({
      jaar,
      lat: Math.asin(-g10 / B0) / DEG,
      lon: Math.atan2(-h11, -g11) / DEG
    });
  }
  return punten;
}

export { latLonToUnit, DEG };
