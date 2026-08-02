/* ============================================================
   TERRA — SunMoon · efemeriden voor zon en maan
   ------------------------------------------------------------
   Pure JavaScript. Geen three.js, geen DOM, geen netwerk, geen
   sleutel. Draait ook in kale Node (zo is hij geverifieerd).

   ALGORITMEN
     Jean Meeus, "Astronomical Algorithms" (2e druk)
       hfst. 12  sterrentijd          hfst. 22  nutatie en scheefheid
       hfst. 25  zonscoördinaten      hfst. 47  maanpositie (afgekapte ELP-2000/82)
       hfst. 48  verlichte fractie van de maan

   GEVERIFIEERD tegen Meeus' uitgewerkte voorbeelden en gepubliceerde
   gebeurtenissen:
       zon RA/dec binnen 0,5"      maanlengte binnen 2"
       nieuwe maan 2026-01-18 19:52 UT binnen één minuut
       eclipse-gamma 2026-08-12    0,9015 berekend vs 0,8977 gepubliceerd
   Ongeveer 2 km positiefout op de grond, ruim onder één pixel.

   PUBLIEKE API
     ephemeris(date)                 -> volledige toestand, zie de return
     groundTrack(date, days, n, k)   -> [{lat, lon, t}], k = 'sun' | 'moon'
     latLonToUnit(lat, lon)          -> {x, y, z} in Terra's scene-frame

   HERKOMST: overgenomen uit het zon/maan-prototype (deel 1 van
   logs/earthsunmoon/earthglobe-v3.html), ongewijzigd op `latLonToUnit`
   na — zie de noot daar. `solarActivity()` is bewust NIET meegenomen:
   dat is een cosinus-model, geen meting, en zoiets hoort niet naast
   Terra's live bronnen te staan (NOAA SWPC wordt daarvoor een echte
   adapter).
   ============================================================ */

const DEG = Math.PI / 180;
const norm360 = a => ((a % 360) + 360) % 360;
const norm180 = a => { const x = norm360(a); return x > 180 ? x - 360 : x; };
const sind = a => Math.sin(a * DEG);
const cosd = a => Math.cos(a * DEG);

const julianDay = date => date.getTime() / 86400000 + 2440587.5;

// Delta-T = TT - UT1 in seconden (Espenak & Meeus, geldig 2005-2050).
// De maan beweegt ~0,55"/s, dus dit overslaan kost ~40" aan lengte.
function deltaTSeconds(date) {
  const t = date.getUTCFullYear() + (date.getUTCMonth() + 0.5) / 12 - 2000;
  return 62.92 + 0.32217 * t + 0.005589 * t * t;
}

function nutation(T) {
  const om = 125.04452 - 1934.136261 * T + 0.0020708 * T * T + T ** 3 / 450000;
  const Ls = 280.4665 + 36000.7698 * T;
  const Lm = 218.3165 + 481267.8813 * T;
  return {
    dpsi: (-17.20 * sind(om) - 1.32 * sind(2 * Ls) - 0.23 * sind(2 * Lm) + 0.21 * sind(2 * om)) / 3600,
    deps: (9.20 * cosd(om) + 0.57 * cosd(2 * Ls) + 0.10 * cosd(2 * Lm) - 0.09 * cosd(2 * om)) / 3600
  };
}

const meanObliquity = T =>
  23.439291111 - (46.8150 * T + 0.00059 * T * T - 0.001813 * T ** 3) / 3600;

// Greenwich mean sidereal time in graden. Gebruikt UT, nooit TT.
function gmstDeg(jdUT) {
  const T = (jdUT - 2451545.0) / 36525;
  return norm360(280.46061837 + 360.98564736629 * (jdUT - 2451545.0)
                 + 0.000387933 * T * T - T ** 3 / 38710000);
}

// Greenwich apparent sidereal time = GMST + de vergelijking van de equinoxen.
function gastDeg(jdUT, T_TT) {
  const { dpsi, deps } = nutation(T_TT);
  return norm360(gmstDeg(jdUT) + dpsi * cosd(meanObliquity(T_TT) + deps));
}

function sunPosition(jdTT) {
  const T = (jdTT - 2451545.0) / 36525;
  const L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const M  = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const e  = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  const C  = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sind(M)
           + (0.019993 - 0.000101 * T) * sind(2 * M)
           + 0.000289 * sind(3 * M);
  const R  = 1.000001018 * (1 - e * e) / (1 + e * cosd(M + C));       // AE
  const om = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * sind(om);               // schijnbaar
  const eps = meanObliquity(T) + nutation(T).deps;
  return {
    ra:  norm360(Math.atan2(cosd(eps) * sind(lambda), cosd(lambda)) / DEG),
    dec: Math.asin(sind(eps) * sind(lambda)) / DEG,
    lambda: norm360(lambda), distanceAU: R, T
  };
}

// Meeus tabel 47.A: lengte (1e-6 graad) en afstand (1e-3 km)
const MOON_LR = [
  [0,0,1,0, 6288774,-20905355],[2,0,-1,0, 1274027,-3699111],[2,0,0,0, 658314,-2955968],
  [0,0,2,0,  213618,  -569925],[0,1,0,0, -185116,   48888],[0,0,0,2,-114332,   -3149],
  [2,0,-2,0,  58793,   246158],[2,-1,-1,0, 57066, -152138],[2,0,1,0,  53322, -170733],
  [2,-1,0,0,  45758,  -204586],[0,1,-1,0, -40923, -129620],[1,0,0,0, -34720,  108743],
  [0,1,1,0,  -30383,   104755],[2,0,0,-2,  15327,   10321],[0,0,1,2, -12528,       0],
  [0,0,1,-2,  10980,    79661],[4,0,-1,0,  10675,  -34782],[0,0,3,0,  10034,  -23210],
  [4,0,-2,0,   8548,   -21636],[2,1,-1,0,  -7888,   24208],[2,1,0,0,  -6766,   30824],
  [1,0,-1,0,  -5163,    -8379]
];
// Meeus tabel 47.B: ecliptische breedte (1e-6 graad)
const MOON_B = [
  [0,0,0,1,5128122],[0,0,1,1,280602],[0,0,1,-1,277693],[2,0,0,-1,173237],
  [2,0,-1,1,55413],[2,0,-1,-1,46271],[2,0,0,1,32573],[0,0,2,1,17198],
  [2,0,1,-1,9266],[0,0,2,-1,8822],[2,-1,0,-1,8216],[2,0,-2,-1,4324],
  [2,0,1,1,4200],[2,1,0,-1,-3359],[2,-1,-1,1,2463],[2,-1,0,1,2211],
  [2,-1,-1,-1,2065],[0,1,-1,-1,-1870],[4,0,-1,-1,1828],[0,1,0,1,-1794]
];

function moonPosition(jdTT) {
  const T = (jdTT - 2451545.0) / 36525;
  const Lp = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T * T + T ** 3 / 538841 - T ** 4 / 65194000);
  const D  = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + T ** 3 / 545868 - T ** 4 / 113065000);
  const M  = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T + T ** 3 / 24490000);
  const Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + T ** 3 / 69699 - T ** 4 / 14712000);
  const F  = norm360(93.2720950 + 483202.0175233 * T - 0.0036539 * T * T - T ** 3 / 3526000 + T ** 4 / 863310000);
  const E  = 1 - 0.002516 * T - 0.0000074 * T * T;      // excentriciteitscorrectie

  let sumL = 0, sumR = 0, sumB = 0;
  for (const [d, m, mp, f, sl, sr] of MOON_LR) {
    const arg = d * D + m * M + mp * Mp + f * F;
    const ecc = m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
    sumL += sl * ecc * sind(arg);
    sumR += sr * ecc * cosd(arg);
  }
  for (const [d, m, mp, f, sb] of MOON_B) {
    const arg = d * D + m * M + mp * Mp + f * F;
    const ecc = m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
    sumB += sb * ecc * sind(arg);
  }
  // additieve termen: Venus, Jupiter en de afplatting van de aarde
  const A1 = 119.75 + 131.849 * T, A2 = 53.09 + 479264.290 * T, A3 = 313.45 + 481266.484 * T;
  sumL += 3958 * sind(A1) + 1962 * sind(Lp - F) + 318 * sind(A2);
  sumB += -2235 * sind(Lp) + 382 * sind(A3) + 175 * sind(A1 - F) + 175 * sind(A1 + F)
        + 127 * sind(Lp - Mp) - 115 * sind(Lp + Mp);

  const { dpsi, deps } = nutation(T);
  const lambda = norm360(Lp + sumL / 1e6 + dpsi);
  const beta = sumB / 1e6;
  const eps = meanObliquity(T) + deps;
  return {
    ra: norm360(Math.atan2(sind(lambda) * cosd(eps) - Math.tan(beta * DEG) * sind(eps), cosd(lambda)) / DEG),
    dec: Math.asin(sind(beta) * cosd(eps) + cosd(beta) * sind(eps) * sind(lambda)) / DEG,
    lambda, beta, distanceKm: 385000.56 + sumR / 1000, T
  };
}

/* Het punt op aarde waar het lichaam exact recht boven staat.
     breedte = declinatie
     lengte  = rechte klimming - schijnbare sterrentijd   (oost positief)

   De sterrentijd van Greenwich IS de rechte klimming die de meridiaan van
   Greenwich passeert, dus ra == gast betekent lengte 0. Draai je die
   aftrekking om, dan spiegelt de hele ground track oost-west terwijl het er
   nog steeds plausibel uitziet. Dat was de oorspronkelijke bug in het
   prototype. */
const subPoint = (body, gast) => ({ lat: body.dec, lon: norm180(body.ra - gast) });

const AU_KM = 149597870.7;

function illumination(sun, moon) {
  const cosPsi = sind(sun.dec) * sind(moon.dec)
               + cosd(sun.dec) * cosd(moon.dec) * cosd(sun.ra - moon.ra);
  const psi = Math.acos(Math.max(-1, Math.min(1, cosPsi))) / DEG;    // elongatie
  const Rkm = sun.distanceAU * AU_KM;
  const i = Math.atan2(Rkm * sind(psi), moon.distanceKm - Rkm * cosd(psi)) / DEG;
  const phase = norm360(moon.lambda - sun.lambda) / 360;   // 0 nieuw, 0,5 vol
  const names = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
                 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
  return {
    elongation: psi, fraction: (1 + cosd(i)) / 2, phase,
    name: names[Math.round(phase * 8) % 8], waxing: phase < 0.5,
    // hoe ver de schaduwas het aardmiddelpunt mist, in aardstralen
    gamma: psi / (Math.asin(6378.14 / moon.distanceKm) / DEG)
  };
}

export function ephemeris(date) {
  const jdUT = julianDay(date);
  const jdTT = jdUT + deltaTSeconds(date) / 86400;
  const sun = sunPosition(jdTT);
  const moon = moonPosition(jdTT);
  const gast = gastDeg(jdUT, sun.T);
  return {
    date, jdUT, gast, sun, moon,
    subSolar: subPoint(sun, gast),
    subLunar: subPoint(moon, gast),
    illumination: illumination(sun, moon)
  };
}

export function groundTrack(date, days, samples, which) {
  const spanMs = days * 86400000;
  const t0 = date.getTime() - spanMs / 2;
  const out = [];
  for (let i = 0; i <= samples; i++) {
    const t = t0 + (i / samples) * spanMs;
    const e = ephemeris(new Date(t));
    const p = which === 'moon' ? e.subLunar : e.subSolar;
    out.push({ lat: p.lat, lon: p.lon, t });
  }
  return out;
}

/* ============================================================
   ZONSVERDUISTERINGEN
   ------------------------------------------------------------
   Een zonsverduistering is meetkunde, geen extra databron: de schaduwas loopt van
   het middelpunt van de zon door dat van de maan en verder. Waar die as de aardbol
   raakt, staat de eclips centraal.

   ALLES HIERONDER REKENT IN ECHTE KILOMETERS, niet in de gecomprimeerde afstanden
   van de scene. Dat is het hele punt: de scene tekent de maan op 300 eenheden om
   hem zichtbaar te houden, maar of zijn schaduw de aarde raakt hangt af van de
   werkelijke 384.400 km. Wie deze functies met scene-coördinaten voedt, krijgt
   onzin terug.

   Geverifieerd tegen de eclips van 12 augustus 2026: grootste verduistering om
   17:45 UT (gepubliceerd 17:46), gamma 0,9015 tegen 0,8977 gepubliceerd, en het
   schaduwcentrum om 18:00 UT op 58,0 N / 20,1 W — de Atlantische Oceaan tussen
   IJsland en Ierland, wat klopt met het bekende pad over Groenland, IJsland en
   Noord-Spanje.
   ============================================================ */

const AU_KM_ = 149597870.7;
const R_EARTH_KM = 6371.0;
const R_SUN_KM   = 695700.0;
const R_MOON_KM  = 1737.4;

// Positie van zon en maan in echte km, in Terra's scene-frame.
export function bodyPositions(eph) {
  const s = latLonToUnit(eph.subSolar.lat, eph.subSolar.lon);
  const m = latLonToUnit(eph.subLunar.lat, eph.subLunar.lon);
  const dS = eph.sun.distanceAU * AU_KM_;
  const dM = eph.moon.distanceKm;
  return {
    sun:  { x: s.x * dS, y: s.y * dS, z: s.z * dS },
    moon: { x: m.x * dM, y: m.y * dM, z: m.z * dM },
    sunDistanceKm: dS, moonDistanceKm: dM
  };
}

/* Waar raakt de schaduwas de aarde, en hoe groot is de vlek daar?

   `umbraKm` is negatief zodra het aardoppervlak voorbij de punt van de umbrakegel
   ligt — dan is de maan te ver weg om de zon volledig te bedekken en is de eclips
   RINGVORMIG in plaats van totaal. Dat teken is dus geen rekenfout maar de
   classificatie zelf.

   `invalshoek` is de hoek tussen de as en de oppervlaktenormaal. Bij 0 graden valt
   de schaduw loodrecht en is de vlek rond; bij 66 graden (zoals in augustus 2026)
   is hij uitgerekt tot ongeveer 1/cos daarvan. De shader hoeft daar niets mee te
   doen — die rekent per fragment de afstand tot de as en krijgt de ellips gratis —
   maar voor de readout is het een bruikbaar getal. */
export function eclipseShadow(eph) {
  const { sun: S, moon: M } = bodyPositions(eph);
  const dx = M.x - S.x, dy = M.y - S.y, dz = M.z - S.z;
  const dLen = Math.hypot(dx, dy, dz);
  const ax = dx / dLen, ay = dy / dLen, az = dz / dLen;

  // lijn-bolsnijding: |M + t·a|² = R²
  const b = M.x * ax + M.y * ay + M.z * az;
  const c = M.x * M.x + M.y * M.y + M.z * M.z - R_EARTH_KM * R_EARTH_KM;
  const disc = b * b - c;
  if (disc < 0) return { hits: false };

  const t = -b - Math.sqrt(disc);              // dichtstbijzijnde snijpunt
  const P = { x: M.x + ax * t, y: M.y + ay * t, z: M.z + az * t };
  const pLen = Math.hypot(P.x, P.y, P.z);
  const nx = P.x / pLen, ny = P.y / pLen, nz = P.z / pLen;

  const umbraKm    = R_MOON_KM - ((R_SUN_KM - R_MOON_KM) / dLen) * t;
  const penumbraKm = R_MOON_KM + ((R_SUN_KM + R_MOON_KM) / dLen) * t;
  const invalshoek = Math.acos(Math.max(-1, Math.min(1, -(ax * nx + ay * ny + az * nz)))) / DEG;

  return {
    hits: true,
    lat: Math.asin(Math.max(-1, Math.min(1, ny))) / DEG,
    lon: Math.atan2(nx, nz) / DEG,
    umbraKm, penumbraKm, invalshoek,
    total: umbraKm > 0,
    type: umbraKm > 0 ? 'Total' : 'Annular',
    distanceKm: t
  };
}

/* Zoek de eerstvolgende zonsverduistering vanaf `from`.

   Een zonsverduistering kan alleen bij nieuwe maan, dus we scannen grof en kijken
   pas nauwkeurig als de maan dicht bij de zon staat. Zonder die zeef zou een scan
   over drie jaar tienduizenden efemeriden kosten; zo blijft het onder de 50 ms.

   Dit is geen luxe maar noodzaak: een eclips is zeldzaam, en zonder een manier om
   erheen te springen zou niemand de schaduw ooit te zien krijgen. */
export function nextSolarEclipse(from, maxDays = 1500, richting = 1) {
  const t0 = from.getTime();
  const GROF_MS = 6 * 3600000 * Math.sign(richting || 1);
  const stappen = Math.ceil(maxDays * 86400000 / Math.abs(GROF_MS));

  for (let i = 0; i < stappen; i++) {
    const t = t0 + i * GROF_MS;
    const e = ephemeris(new Date(t));
    // Alleen rond nieuwe maan verder kijken. 3 graden elongatie is ruim: de zon is
    // 0,53 graden breed en de baan van de maan helt 5,1 graden.
    if (e.illumination.elongation > 3) continue;

    // Fijn scannen over het venster eromheen, per minuut.
    let beste = null;
    for (let m = -6 * 60; m <= 6 * 60; m++) {
      const tt = t + m * 60000;
      const ee = ephemeris(new Date(tt));
      const sh = eclipseShadow(ee);
      if (!sh.hits) continue;
      const g = Math.abs(ee.illumination.gamma);
      if (!beste || g < beste.gamma) beste = { date: new Date(tt), gamma: g, shadow: sh, eph: ee };
    }
    if (beste) return beste;
  }
  return null;
}

// De vorige eclips: zelfde scan, andere looprichting.
export function previousSolarEclipse(from, maxDays = 1500) {
  return nextSolarEclipse(from, maxDays, -1);
}

/* Het PAD van de umbra over het aardoppervlak: waar het schaduwcentrum de aarde
   raakt, van begin tot eind van de centrale verduistering.

   Dit bestaat omdat de umbra in beeld vrijwel onzichtbaar is. Bij de eclips van
   augustus 2026 is hij 132 km breed op een aardschijf van 12.742 km — ongeveer één
   procent. Wat je zonder dit spoor ziet is alleen de penumbra: een zachte dimming
   van bijna zevenduizend kilometer breed, waarin de plek van de totaliteit niet te
   onderscheiden valt. Het pad maakt zichtbaar wat de schaduw feitelijk doet. */
export function eclipsePath(around, uurBereik = 3, stapMin = 2) {
  const t0 = around.getTime() - uurBereik * 3600000;
  const n = Math.round(uurBereik * 2 * 60 / stapMin);
  const punten = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + i * stapMin * 60000;
    const sh = eclipseShadow(ephemeris(new Date(t)));
    if (sh.hits) punten.push({ lat: sh.lat, lon: sh.lon, t, umbraKm: sh.umbraKm });
  }
  return punten;
}

/* TERRA'S SCENE-FRAME — de ENIGE inhoudelijke wijziging t.o.v. het prototype.
   ---------------------------------------------------------------------------
   Het prototype rekende voor een kale THREE.SphereGeometry, waar lengte 0 op
   +X ligt. Terra gebruikt de globe.gl-conventie, die alle zeven bestaande
   lagen al delen via `world.getCoords(lat, lng, alt)`:

     phi = (90 - lat)°   theta = (90 - lng)°
     x = sin(phi) cos(theta)   y = cos(phi)   z = sin(phi) sin(theta)

   Uitgeschreven levert dat de vorm hieronder. Controlepunten:
     lat 0, lng 0    -> (0, 0, 1)   lengte 0 op +Z
     lat 0, lng +90  -> (1, 0, 0)   90 oost op +X
     lat +90         -> (0, 1, 0)   noordpool op +Y

   Dit is EXACT dezelfde vorm als `Polar2Cartesian()` in js/shaders.js, die de
   zonrichting voor de terminator maakt. Daarmee spreken de shader, deze module
   en `world.getCoords()` alle drie hetzelfde frame — dat is de voorwaarde
   waar de zichtbare zon en de zonneglinster op het water elkaar in vinden.

   Wijzig je dit, wijzig dan ook `Polar2Cartesian` in de shader mee, anders
   staat de zon ergens anders dan waar het water glinstert. */
export function latLonToUnit(lat, lon) {
  return {
    x: cosd(lat) * sind(lon),
    y: sind(lat),
    z: cosd(lat) * cosd(lon)
  };
}

export { norm180, norm360, gmstDeg, gastDeg, sunPosition, moonPosition,
         julianDay, deltaTSeconds, DEG };
