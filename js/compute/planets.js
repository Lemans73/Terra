/* ============================================================
   TERRA — Planets · efemeriden voor de zeven planeten
   ------------------------------------------------------------
   Pure JavaScript. Geen three.js, geen DOM, geen netwerk, geen
   sleutel. Draait ook in kale Node (zo is hij geverifieerd).

   ALGORITMEN
     Jean Meeus, "Astronomical Algorithms" (2e druk)
       tabel 31.A  baanelementen, gemiddelde equinox van de datum
       hfst.  33   omzetting naar geocentrische coordinaten
       hfst.  41   schijnbare magnitude (set van de Astronomical Almanac)

   WAAROM BAANELEMENTEN EN NIET VSOP87
   VSOP87 geeft een boogseconde met duizenden termen; baanelementen
   geven een boogminuut met tweehonderd getallen. Wat Terra ermee
   doet is een lichaam op een schil zetten en een subpunt op de bol
   projecteren. Een boogminuut is daar 1,85 km op de grond, en een
   pixel is op maximale zoom 2,3 tot 4,5 km (doorgerekend in sessie
   21). De duurdere reeks zou onder de kwantisering verdwijnen.

   HET GELDIGHEIDSBEREIK IS EINDIG en dat is geen detail: de
   tijdkiezer kan naar 1980 en verder terug. Zie GELDIGHEID onderaan
   voor wat er gemeten is.

   DELEN DIE UIT sunmoon.js KOMEN
   DEG, sind, cosd, norm360, norm180, julianDay, deltaTSeconds,
   meanObliquity en gastDeg worden geimporteerd, niet herhaald. Dat
   is geen stijlkeuze maar een harde eis van tools/build-standalone.mjs:
   die concateneert alle modules in EEN scope, dus een naam die hier
   opnieuw gedeclareerd wordt is een dubbele declaratie, een
   parse-fout en een lege bol. Alles wat hieronder op top-level
   staat moet uniek zijn binnen de hele app.
   ============================================================ */

import { DEG, sind, cosd, norm360, norm180, julianDay, deltaTSeconds,
         meanObliquity, gastDeg, sunPosition } from '../sunmoon.js';

/* ------------------------------------------------------------
   BAANELEMENTEN — Meeus tabel 31.A, gemiddelde equinox van de datum.

   Per planeet zes polynomen in T (Juliaanse eeuwen sinds J2000),
   opgeschreven als [a0, a1, a2, a3] zodat een enkele evaluator ze
   allemaal aankan. De volgorde is vast:

     L   gemiddelde lengte                    graden
     a   halve lange as                       AE
     e   excentriciteit                       -
     i   inclinatie op de ecliptica           graden
     O   lengte van de klimmende knoop        graden
     P   lengte van het perihelium            graden

   De AARDE staat er bij en is geen sierstuk: elke geocentrische
   positie is het verschil van twee heliocentrische, dus zonder de
   aarde is er niets te berekenen.
------------------------------------------------------------ */
const ORBIT_ELEMENTS = {
  mercury: {
    L: [252.250906, 149474.0722491, 0.00030350, 0.000000018],
    a: [0.387098310, 0, 0, 0],
    e: [0.20563175, 0.000020407, -0.0000000283, -0.00000000018],
    i: [7.004986, 0.0018215, -0.00001810, 0.000000056],
    O: [48.330893, 1.1861883, 0.00017542, 0.000000215],
    P: [77.456119, 1.5564776, 0.00029544, 0.000000009]
  },
  venus: {
    L: [181.979801, 58519.2130302, 0.00031014, 0.000000015],
    a: [0.723329820, 0, 0, 0],
    e: [0.00677192, -0.000047765, 0.0000000981, 0.00000000046],
    i: [3.394662, 0.0010037, -0.00000088, -0.000000007],
    O: [76.679920, 0.9011206, 0.00040618, -0.000000093],
    P: [131.563703, 1.4022288, -0.00107618, -0.000005678]
  },
  earth: {
    L: [100.466457, 36000.7698278, 0.00030322, 0.000000020],
    a: [1.000001018, 0, 0, 0],
    e: [0.01670863, -0.000042037, -0.0000001267, 0.00000000014],
    i: [0, 0, 0, 0],
    O: [174.873174, -0.2410908, 0.00004067, -0.000001327],
    P: [102.937348, 1.7195366, 0.00045688, -0.000000018]
  },
  mars: {
    L: [355.433000, 19141.6964471, 0.00031052, 0.000000016],
    a: [1.523679342, 0, 0, 0],
    e: [0.09340065, 0.000090484, -0.0000000806, -0.00000000025],
    i: [1.849726, -0.0006011, 0.00001276, -0.000000007],
    O: [49.558093, 0.7720959, 0.00001557, 0.000002267],
    P: [336.060234, 1.8410449, 0.00013477, 0.000000536]
  },
  jupiter: {
    L: [34.351519, 3036.3027748, 0.00022330, 0.000000037],
    a: [5.202603209, 0.0000001913, 0, 0],
    e: [0.04849793, 0.000163225, -0.0000004714, -0.00000000201],
    i: [1.303267, -0.0054965, 0.00000466, -0.000000002],
    O: [100.464407, 1.0209774, 0.00040315, 0.000000404],
    P: [14.331207, 1.6126352, 0.00103042, -0.000004464]
  },
  saturn: {
    L: [50.077444, 1223.5110686, 0.00051908, -0.000000030],
    a: [9.554909192, -0.0000021390, 0.000000004, 0],
    e: [0.05554814, -0.000346641, -0.0000006436, 0.00000000340],
    i: [2.488879, -0.0037362, -0.00001519, 0.000000087],
    O: [113.665503, 0.8770880, -0.00012176, -0.000002249],
    P: [93.057237, 1.9637613, 0.00083753, 0.000004928]
  },
  uranus: {
    L: [314.055005, 429.8640561, 0.00030390, 0.000000026],
    a: [19.218446062, -0.0000000372, 0.00000000098, 0],
    e: [0.04638122, -0.000027293, 0.0000000789, 0.00000000024],
    i: [0.773197, 0.0007744, 0.00003749, -0.000000092],
    O: [74.005957, 0.5211278, 0.00133947, 0.000018484],
    P: [173.005291, 1.4863790, 0.00021406, 0.000000434]
  },
  neptune: {
    L: [304.348665, 219.8833092, 0.00030882, 0.000000018],
    a: [30.110386869, -0.0000001663, 0.00000000069, 0],
    e: [0.00945575, 0.000006033, 0, -0.00000000005],
    i: [1.769953, -0.0093082, -0.00000708, 0.000000027],
    O: [131.784057, 1.1022039, 0.00025952, -0.000000637],
    P: [48.120276, 1.4262957, 0.00038434, 0.000000020]
  }
};

// De zeven die Terra toont. De aarde staat bewust niet in deze lijst:
// hij is het rekenpunt, niet een lichaam aan de hemel.
export const PLANETS = ['mercury', 'venus', 'mars', 'jupiter',
                         'saturn', 'uranus', 'neptune'];

// Wat een kijker ziet, niet wat een ontwerper mooi vindt. De kleuren
// zijn de waargenomen tinten; de laag gebruikt ze als beginwaarde van
// een materiaal dat later een textuur kan krijgen.
/* De ACHT lichamen van het heliocentrische beeld — hier hoort de aarde er
   wel bij, want daar is hij geen rekenpunt maar een planeet als de rest.
   Dat verschil is het hele punt van die weergave, en het is de reden dat
   dit een tweede lijst is en geen uitbreiding van PLANETS: wie `PLANETS`
   uitbreidt, zet de aarde ook in het lijstje aan de hemel, en daar staat
   hij per definitie niet. */
export const BODIES = ['mercury', 'venus', 'earth', 'mars', 'jupiter',
                       'saturn', 'uranus', 'neptune'];

export const PLANET_INFO = {
  mercury: { name: 'Mercury', color: 0x9c9188 },
  earth:   { name: 'Earth',   color: 0x63a5e0 },
  venus:   { name: 'Venus',   color: 0xe8dcb0 },
  mars:    { name: 'Mars',    color: 0xc1502e },
  jupiter: { name: 'Jupiter', color: 0xd8a878 },
  saturn:  { name: 'Saturn',  color: 0xe3d5a0 },
  uranus:  { name: 'Uranus',  color: 0x9fd8e0 },
  neptune: { name: 'Neptune', color: 0x5b7fd4 }
};

const poly = (c, T) => c[0] + c[1] * T + c[2] * T * T + c[3] * T * T * T;

/* Lichttijd voor een astronomische eenheid, in dagen. Meeus 33.3.
   Zonder deze correctie staat Jupiter tot 0,01 graad naast zijn
   plek — een kwartier maanbreedte, dus zichtbaar zodra je twee
   bronnen naast elkaar legt. */
const LIGHT_TIME_PER_AU = 0.0057755183;

/* ------------------------------------------------------------
   KEPLER — E - e*sin(E) = M, opgelost met Newton-Raphson.

   Zes iteraties halen bij e < 0,25 de dubbele precisie; de banen
   hier gaan tot e = 0,206 (Mercurius). De grens staat er als vangnet
   voor het geval iemand ooit een komeet toevoegt: die convergeert
   niet met deze startwaarde en hoort een ander startpunt te krijgen.
------------------------------------------------------------ */
function keplerE(M, e) {
  const Mr = M * DEG;
  let E = Mr + e * Math.sin(Mr) * (1 + e * Math.cos(Mr));
  for (let n = 0; n < 8; n++) {
    const d = (E - e * Math.sin(E) - Mr) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

/* Heliocentrische rechthoekige ecliptische coordinaten, in AE.
   Meeus 33.1 t/m 33.4. */
function heliocentricAt(key, T) {
  const el = ORBIT_ELEMENTS[key];
  const L = norm360(poly(el.L, T));
  const a = poly(el.a, T);
  const e = poly(el.e, T);
  const i = poly(el.i, T);
  const O = norm360(poly(el.O, T));
  const P = norm360(poly(el.P, T));

  const M = norm360(L - P);            // gemiddelde anomalie
  const w = norm360(P - O);            // argument van het perihelium
  const E = keplerE(M, e);

  // Ware anomalie uit de excentrische, en de voerstraal.
  const v = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2),
                           Math.sqrt(1 - e) * Math.cos(E / 2)) / DEG;
  const r = a * (1 - e * Math.cos(E));

  const u = w + v;                     // argument van de breedte
  /* `v`, `E` en `M` GAAN MEE NAAR BUITEN, en dat is geen uitbreiding maar het
     ophouden met weggooien. Ze staan hier al uitgerekend; wie de ware anomalie
     wil, zou anders Kepler een tweede keer moeten oplossen op dezelfde T en
     dan een tweede antwoord krijgen dat het eerste hoort te zijn. Zie de
     alinea hieronder: dit bestand heeft die fout al eens gemaakt met de
     posities zelf. */
  return {
    x: r * (cosd(O) * cosd(u) - sind(O) * sind(u) * cosd(i)),
    y: r * (sind(O) * cosd(u) + cosd(O) * sind(u) * cosd(i)),
    z: r * sind(u) * sind(i),
    r, v: norm360(v), E: E / DEG, M
  };
}

/* ------------------------------------------------------------
   HET HELIOCENTRISCHE BEELD — drie functies die de posities die
   hierboven al berekend worden NIET meer weggooien.

   `planetPosition()` roept `heliocentricAt()` twee keer aan en houdt
   alleen het VERSCHIL met de aarde over. Dat verschil is wat je vanaf
   de aarde ziet; wat eronder ligt — waar de planeten werkelijk staan —
   verdween tot sessie 23 in het niets. Deze drie halen het naar boven.

   GEEN LICHTTIJDCORRECTIE hier, en dat is geen verzuim. Lichttijd
   corrigeert voor een WAARNEMER; in een heliocentrisch beeld is er
   geen waarnemer, je kijkt naar het stelsel zelf. De planeet staat waar
   hij staat.
------------------------------------------------------------ */

/* De Juliaanse eeuwen TT sinds J2000 — dezelfde T die planetPosition()
   intern gebruikt, nu ook bruikbaar voor wie de baanelementen zelf wil
   uitlezen zonder een positie te vragen. */
export function julianCenturies(date) {
  return (julianDay(date) + deltaTSeconds(date) / 86400 - 2451545.0) / 36525;
}

/* Heliocentrische rechthoekige ecliptische coordinaten in AE, voor elk
   lichaam uit BODIES (de aarde inbegrepen). Rechtshandig: +x naar het
   lentepunt van de datum, +z naar de ecliptica-noordpool. */
export function heliocentric(date, key) {
  return heliocentricAt(key, julianCenturies(date));
}

/* GEEN `AU_KM`, om dezelfde reden die in compute/frames.js:148 uitgeschreven
   staat: `js/sunmoon.js` heeft er al twee (`AU_KM` en `AU_KM_`), frames.js een
   derde, en het buildscript concateneert alles in EEN scope. Een vierde met de
   voor de hand liggende naam breekt de standalone terwijl de app in de browser
   gewoon doordraait — daar zijn het aparte modules. Dat is precies de val die
   sessie 23 een uur kostte. */
const PLANETS_AU_KM = 149597870.7;
// Heliocentrische gravitatieparameter in km^3/s^2 (IAU 2015 nominale waarde).
const SUN_GM_KM3 = 1.32712440018e11;

/* ------------------------------------------------------------
   DE HELIOCENTRISCHE TOESTAND — wat het zonnestelsel-beeld beschrijft.

   WAAROM DIT EEN EIGEN FUNCTIE IS EN GEEN VELD IN ephemeris(). Die laatste
   beschrijft wat een waarnemer OP AARDE ziet: schijnbare magnitude, elongatie
   van de zon, rechte klimming, het subpunt. In het heliocentrische beeld staat
   de aarde zelf als lichaam in het plaatje en is er geen waarnemer — dan zegt
   "afstand tot de aarde" niets meer over wat je ziet, en "staat boven 14 graden
   noord" verwijst naar een bol die verborgen is.

   Twee frames, twee functies. Ze delen hun bron (`heliocentricAt`), dus er
   ontstaat geen tweede waarheid; wat verschilt is welke vraag ze beantwoorden.

   DE AARDE HOORT ER WEL BIJ, anders dan bij ephemeris(): daar is hij het
   rekenpunt, hier een planeet als de rest. `BODIES` telt er dus acht waar
   `PLANETS` er zeven telt.
------------------------------------------------------------ */
export function heliocentricState(date, key) {
  const T = julianCenturies(date);
  const p = heliocentricAt(key, T);
  const basis = orbitBasis(key, T);
  const { a, e } = basis;

  /* Kepler 3 in de vorm waarin hij het kortst is: met de halve lange as in AE
     en de tijd in jaren valt de constante weg, want de aarde maakt beide
     eenheden 1. P = a^1.5, en dat is de hele wet. */
  const periodYears = Math.pow(a, 1.5);

  /* Vis-viva. De snelheid volgt uit r en a alleen — de vorm van de baan doet
     er niet toe, en dat is nu juist wat de formule te vertellen heeft: een
     lichaam is snel waar het dicht bij de zon staat. Controle: de aarde op
     r = a = 1 AE geeft 29,78 km/s, en dat is de gepubliceerde waarde. */
  const rKm = p.r * PLANETS_AU_KM, aKm = a * PLANETS_AU_KM;
  const speedKmS = Math.sqrt(SUN_GM_KM3 * (2 / rKm - 1 / aKm));

  return {
    key,
    distanceAU: p.r,
    // Heliocentrische ecliptische lengte: dezelfde hoek die de gradenverdeling
    // op de ecliptica-band aangeeft, dus readout en figuur zeggen hetzelfde.
    lambda: norm360(Math.atan2(p.y, p.x) / DEG),
    trueAnomaly: p.v,
    meanAnomaly: p.M,
    a, e,
    perihelionAU: a * (1 - e),
    aphelionAU:   a * (1 + e),
    periodYears,
    speedKmS
  };
}

/* ------------------------------------------------------------
   DE BAAN ALS ECHTE ELLIPS — de Gauss-vectoren P en Q.

   P wijst naar het perihelium, Q staat er een kwartslag verder in de
   bewegingsrichting op. Daarmee is de hele baan:

     r(E) = a(cos E - e)·P + b·sin E·Q       met  b = a·sqrt(1 - e²)

   WAAROM NIET GEWOON heliocentric() N KEER OVER EEN OMLOOPTIJD. Drie
   redenen, en de derde is de doorslaggevende:
   1. het kost N Kepler-oplossingen en N polynoom-evaluaties;
   2. Neptunus vraagt dan 165 jaar aan tijdstappen;
   3. de lus SLUIT NIET exact, want de elementen verlopen ondertussen —
      en een baanring met een zichtbare naad is geen baanring.

   Met een sweep van E op EEN vaste T is het laatste punt letterlijk het
   eerste, en blijft de zon exact in een brandpunt. Dat laatste is wat de
   ring te vertellen heeft: Mercurius' zon-offset is a·e = 21% van zijn
   baanstraal, en dat zie je.
------------------------------------------------------------ */
export function orbitBasis(key, T) {
  const el = ORBIT_ELEMENTS[key];
  const a = poly(el.a, T);
  const e = poly(el.e, T);
  const i = poly(el.i, T);
  const O = norm360(poly(el.O, T));
  const w = norm360(poly(el.P, T) - O);      // argument van het perihelium

  return {
    a, e,
    b: a * Math.sqrt(1 - e * e),
    P: { x: cosd(O) * cosd(w) - sind(O) * sind(w) * cosd(i),
         y: sind(O) * cosd(w) + cosd(O) * sind(w) * cosd(i),
         z: sind(w) * sind(i) },
    Q: { x: -cosd(O) * sind(w) - sind(O) * cosd(w) * cosd(i),
         y: -sind(O) * sind(w) + cosd(O) * cosd(w) * cosd(i),
         z:  cosd(w) * sind(i) }
  };
}

/* Een punt op die ellips. E = 0 is het perihelium, E = pi het aphelium. */
export function orbitPoint(basis, E) {
  const c = basis.a * (Math.cos(E) - basis.e);
  const s = basis.b * Math.sin(E);
  return { x: c * basis.P.x + s * basis.Q.x,
           y: c * basis.P.y + s * basis.Q.y,
           z: c * basis.P.z + s * basis.Q.z };
}

/* ------------------------------------------------------------
   DE BAAN GEZIEN VANAF DE AARDE — de geocentrische tegenhanger.

   Neemt de hele baan-ellips en projecteert hem op de hemel vanaf de
   HUIDIGE aardepositie. Voor Mercurius en Venus levert dat een gesloten
   lus rond de zon, waarvan de wijdte hun grootste elongatie is; voor de
   buitenplaneten een kromme die dicht bij de ecliptica blijft.

   DIT IS IETS ANDERS DAN skyTrack() OVER EEN OMLOOPTIJD, en het verschil
   is de reden dat deze functie bestaat. Dat pad zou de planeet volgen
   terwijl de AARDE ondertussen 165 rondjes maakt: 165 retrograde lussen
   die bij een paar honderd monsterpunten aliassen tot een gladde cirkel —
   het juiste plaatje om de verkeerde reden. Hier staat de aarde stil en
   beweegt alleen de planeet, en dat is precies de vraag "waar KAN dit
   lichaam aan de hemel staan".
------------------------------------------------------------ */
export function projectedOrbit(date, key, points = 240) {
  const T = julianCenturies(date);
  const earth = heliocentricAt('earth', T);
  const basis = orbitBasis(key, T);
  const eps = meanObliquity(T);

  const out = [];
  for (let n = 0; n < points; n++) {
    const p = orbitPoint(basis, (n / points) * Math.PI * 2);
    const dx = p.x - earth.x, dy = p.y - earth.y, dz = p.z - earth.z;
    const delta = Math.hypot(dx, dy, dz);
    const lambda = norm360(Math.atan2(dy, dx) / DEG);
    const beta = Math.asin(dz / delta) / DEG;
    const ra = norm360(Math.atan2(sind(lambda) * cosd(eps) - Math.tan(beta * DEG) * sind(eps),
                                  cosd(lambda)) / DEG);
    const dec = Math.asin(sind(beta) * cosd(eps) + cosd(beta) * sind(eps) * sind(lambda)) / DEG;
    out.push({ ra, dec });
  }
  return out;
}

/* ------------------------------------------------------------
   SCHIJNBARE MAGNITUDE — Meeus 41, set van de Astronomical Almanac.

   Dit is geen sierwaarde: de laag koppelt zijn dekking eraan, zodat
   de demping een waarheid uitdrukt en geen ontwerpregel. Venus staat
   op -4, Neptunus op +8; twaalf magnituden is een factor 63.000 in
   helderheid, en dat is precies waarom de een opvalt en de ander
   nooit met het blote oog gezien is.

   BEWUSTE VEREENVOUDIGING: de ring van Saturnus scheelt tot een hele
   magnitude, afhankelijk van hoe schuin je erop kijkt. Die term zit
   er niet in. Wie hem toevoegt heeft de ringhoek B nodig (Meeus 45)
   en moet dan ook de laag laten weten dat Saturnus' helderheid over
   jaren varieert zonder dat zijn afstand verandert.
------------------------------------------------------------ */
function magnitude(key, r, delta, phase) {
  const g = 5 * Math.log10(r * delta);
  const i = phase, i2 = i * i, i3 = i2 * i;
  switch (key) {
    case 'mercury': return -0.42 + g + 0.0380 * i - 0.000273 * i2 + 0.000002 * i3;
    case 'venus':   return -4.40 + g + 0.0009 * i + 0.000239 * i2 - 0.00000065 * i3;
    case 'mars':    return -1.52 + g + 0.016 * i;
    case 'jupiter': return -9.40 + g + 0.005 * i;
    case 'saturn':  return -8.88 + g;
    case 'uranus':  return -7.19 + g;
    case 'neptune': return -6.87 + g;
    default:        return 0;
  }
}

/* ------------------------------------------------------------
   EEN PLANEET OP EEN MOMENT.

   Geeft geocentrisch: rechte klimming en declinatie (graden), de
   afstand in AE, de fasehoek, de magnitude en het subplanetaire
   punt — de plek op aarde waar hij loodrecht boven staat.

   DE LICHTTIJD-LUS. Wat je ziet is waar de planeet WAS toen het
   licht vertrok. De eerste ronde schat de afstand, de tweede
   berekent de planeetpositie op t - tau. Verder itereren verandert
   niets meer: de correctie op de correctie ligt onder een
   boogseconde, ruim onder de boogminuut die deze reeks waard is.
------------------------------------------------------------ */
export function planetPosition(date, key) {
  const jdUT = julianDay(date);
  const jdTT = jdUT + deltaTSeconds(date) / 86400;
  const T = (jdTT - 2451545.0) / 36525;

  const earth = heliocentricAt('earth', T);
  let p = heliocentricAt(key, T);
  let dx = p.x - earth.x, dy = p.y - earth.y, dz = p.z - earth.z;
  let delta = Math.hypot(dx, dy, dz);

  // Terug in de tijd over de lichttijd, en opnieuw.
  const Ttau = T - (LIGHT_TIME_PER_AU * delta) / 36525;
  p = heliocentricAt(key, Ttau);
  dx = p.x - earth.x; dy = p.y - earth.y; dz = p.z - earth.z;
  delta = Math.hypot(dx, dy, dz);

  const lambda = norm360(Math.atan2(dy, dx) / DEG);
  const beta = Math.asin(dz / delta) / DEG;

  const eps = meanObliquity(T);
  const ra = norm360(Math.atan2(sind(lambda) * cosd(eps) - Math.tan(beta * DEG) * sind(eps),
                                cosd(lambda)) / DEG);
  const dec = Math.asin(sind(beta) * cosd(eps) + cosd(beta) * sind(eps) * sind(lambda)) / DEG;

  // Fasehoek: de hoek zon-planeet-aarde. R is de afstand zon-aarde.
  const R = Math.hypot(earth.x, earth.y, earth.z);
  const cosFase = (p.r * p.r + delta * delta - R * R) / (2 * p.r * delta);
  const phase = Math.acos(Math.max(-1, Math.min(1, cosFase))) / DEG;

  /* ELONGATIE — de hoek tussen de planeet en de zon, aan de hemel gezien.

     Dit is het getal dat verraadt dat het zonnestelsel niet om ons
     draait. Mercurius komt nooit verder dan 28 graden van de zon en
     Venus niet verder dan 47: ze zitten aan de zon vastgeklonken, want
     hun banen liggen BINNEN die van de aarde. Mars, Jupiter en Saturnus
     halen wel 180 graden — die kunnen in oppositie staan, recht
     tegenover de zon, en dat kan alleen als wij tussen hen en de zon
     door gaan. Een echt geocentrisch stelsel kan geen van beide
     verklaren.

     Berekend als de ware hoekafstand en niet als het verschil in
     ecliptische lengte: dat scheelt bij Mercurius tot een halve graad,
     want zijn baan staat 7 graden schuin. */
  const sun = sunPosition(jdTT);
  const cosElong = sind(dec) * sind(sun.dec)
                 + cosd(dec) * cosd(sun.dec) * cosd(ra - sun.ra);
  const elongation = Math.acos(Math.max(-1, Math.min(1, cosElong))) / DEG;
  // Oost of west van de zon: avondster tegenover ochtendster.
  const eastern = norm180(lambda - sun.lambda) > 0;

  const gast = gastDeg(jdUT, T);
  return {
    key, ra, dec, lambda, beta,
    distanceAU: delta,
    heliocentricAU: p.r,
    phaseAngle: phase,
    illuminated: (1 + cosd(phase)) / 2,
    magnitude: magnitude(key, p.r, delta, phase),
    elongation, eastern,
    sub: { lat: dec, lon: norm180(ra - gast) }
  };
}

/* Alle zeven op een moment, in de volgorde van de zon af. Die
   volgorde is niet cosmetisch: de laag zet ze op oplopende schillen
   en leest hem hier af, zodat er geen tweede lijst ontstaat die uit
   de pas kan lopen. */
export function planetEphemerides(date) {
  const uit = {};
  for (const k of PLANETS) uit[k] = planetPosition(date, k);
  return uit;
}

/* ------------------------------------------------------------
   HET HEMELSPOOR — waar een planeet over weken AAN DE HEMEL loopt.

   Dit is bewust geen grondspoor. Het subplanetaire punt van Jupiter
   loopt 15 graden per uur westwaarts, en dat is de draaiing van de
   AARDE, niet de beweging van Jupiter: een grondspoor tekent hier
   dus vrijwel uitsluitend de aardrotatie en zegt niets over de
   planeet. Het pad in RA/dec zegt wel alles, want daar zit de
   retrograde lus in — de schijnbare achteruitgang rond oppositie,
   die tweeduizend jaar lang het bezwaar tegen het geocentrische
   wereldbeeld was.

   `dagen` is het HELE venster; het spoor loopt van -dagen/2 tot
   +dagen/2 rond het gegeven moment. Een lus vraagt 60 tot 90 dagen.
------------------------------------------------------------ */
export function skyTrack(date, key, days = 90, points = 120) {
  const uit = [];
  const t0 = date.getTime() - (days / 2) * 86400000;
  const step = (days * 86400000) / (points - 1);
  for (let n = 0; n < points; n++) {
    const t = new Date(t0 + n * step);
    const p = planetPosition(t, key);
    uit.push({ ra: p.ra, dec: p.dec, t: t.getTime() });
  }
  return uit;
}

/* ============================================================
   CONJUNCTIES — wanneer staan twee planeten naast elkaar?

   WAAROM DIT EEN KNOP MOET WORDEN. Een conjunctie duurt een dag of
   twee en er zitten maanden tussen. Wie de tijdslider met de hand
   verschuift komt er nooit een tegen, precies zoals niemand ooit een
   eclips vond voordat daar een knop voor kwam. Wat je niet kunt
   vinden, bestaat niet in een interface.

   DE ZOEKOPZET, met dezelfde vorm als nextSolarEclipse(): grof
   scannen, en alleen nauwkeurig kijken waar het de moeite is. De
   winst zit hier in de VOLGORDE van de lussen — bereken per dag de
   zeven posities EEN keer en lees daar de 21 paren uit af, in plaats
   van per paar twee posities te berekenen. Dat scheelt een factor
   zes, en het verschil tussen 30 ms en 200 ms is het verschil tussen
   een knop die reageert en een knop die hapert.
============================================================ */

/* Hoekafstand tussen twee posities, in graden. */
function separation(a, b) {
  const c = sind(a.dec) * sind(b.dec)
          + cosd(a.dec) * cosd(b.dec) * cosd(a.ra - b.ra);
  return Math.acos(Math.max(-1, Math.min(1, c))) / DEG;
}

/* Een conjunctie telt pas als de twee dichter dan dit bij elkaar staan.
   Drie graden is ruim zes maandiameters: dicht genoeg om als paar op te
   vallen, ruim genoeg om er een handvol per jaar te hebben. */
const CONJUNCTION_LIMIT = 3;

/* ------------------------------------------------------------
   De eerstvolgende (of vorige) conjunctie vanaf een moment.

   `richting` +1 vooruit, -1 terug. Geeft null als er binnen
   `maxDagen` niets is.

   LET OP DE ZON-UITSLUITING. Twee planeten kunnen ook samenvallen
   doordat ze allebei achter de zon staan; dat is meetkundig een
   conjunctie maar aan de hemel is er niets te zien, want ze staan in
   het daglicht. Paren met een elongatie onder 15 graden vallen daarom
   af — dat is geen kunstgreep maar het verschil tussen een berekening
   en een waarneming.
------------------------------------------------------------ */
export function nextConjunction(from, maxDays = 900, direction = 1) {
  const coarseStep = 1;                       // dagen
  const t0 = from.getTime();
  let candidate = null;

  /* PER PAAR bijhouden of het nadert of wijkt. Eén gedeelde "vorige stap"
     volstaat niet, en dat kostte de eerste versie een fout: die zag elke
     oplopende reeks als minimum en meldde 16 en 20 november als twee
     verschillende Mars-Jupiter-conjuncties, terwijl het één nadering was.

     Een minimum vraagt DRIE waarnemingen: eerst dalen, dan stijgen. Een
     paar dat al wijkt op het moment dat je begint te kijken, hoort dus
     overgeslagen te worden tot het opnieuw nadert — anders vind je een
     conjunctie die net achter je ligt. */
  const pairState = {};                         // paarsleutel -> { vorige, dalend }

  for (let d = 0; d <= maxDays && !candidate; d += coarseStep) {
    const t = new Date(t0 + direction * d * 86400000);
    const eph = planetEphemerides(t);

    for (let i = 0; i < PLANETS.length && !candidate; i++) {
      for (let j = i + 1; j < PLANETS.length && !candidate; j++) {
        const A = PLANETS[i], B = PLANETS[j], key = A + '|' + B;
        const a = eph[A], b = eph[B];
        // In het daglicht: meetkundig een conjunctie, maar niets te zien.
        if (a.elongation < 15 || b.elongation < 15) { delete pairState[key]; continue; }
        const s = separation(a, b);
        if (s > CONJUNCTION_LIMIT) { delete pairState[key]; continue; }

        const st = pairState[key];
        if (st) {
          if (s < st.sep) {
            pairState[key] = { sep: s, t: t.getTime(), falling: true };
          } else if (st.falling) {
            // Gedaald en nu weer stijgend: het minimum lag bij de vorige stap.
            candidate = { t: st.t, pair: { a: A, b: B } };
          } else {
            pairState[key] = { sep: s, t: t.getTime(), falling: false };
          }
        } else {
          pairState[key] = { sep: s, t: t.getTime(), falling: false };
        }
      }
    }
  }

  // Niets gevonden binnen het venster, of het liep nog steeds op toen we
  // stopten: dan is er geen conjunctie om naartoe te springen.
  if (!candidate) return null;

  /* Fijn zoeken rond het grove minimum: een uur per stap over twee dagen.
     Verder verfijnen heeft geen zin — de scheiding verandert bij een
     conjunctie met hooguit enkele boogminuten per uur, en het model zelf
     is een boogminuut waard. */
  let best = null;
  for (let u = -24; u <= 24; u++) {
    const t = new Date(candidate.t + u * 3600000);
    const eph = planetEphemerides(t);
    const s = separation(eph[candidate.pair.a], eph[candidate.pair.b]);
    if (!best || s < best.sep) best = { sep: s, t };
  }

  const eph = planetEphemerides(best.t);
  return {
    moment: best.t,
    a: candidate.pair.a,
    b: candidate.pair.b,
    separation: best.sep,
    // Waar aan de hemel, zodat de camera erheen kan draaien.
    sub: eph[candidate.pair.a].sub,
    elongation: Math.min(eph[candidate.pair.a].elongation, eph[candidate.pair.b].elongation)
  };
}

export function previousConjunction(from, maxDays = 900) {
  return nextConjunction(from, maxDays, -1);
}

/* ------------------------------------------------------------
   GELDIGHEID — GEMETEN, en de uitkomst was gunstiger dan aangenomen.

   De vrees was drift: baanelementen zijn polynomen, dus je verwacht
   dat ze weglopen naarmate je verder van J2000 komt. Dat gebeurt
   NIET binnen dit bereik. Gemeten door de aardebaan om te draaien
   en te vergelijken met sunPosition() uit sunmoon.js, die tot 0,5"
   tegen Meeus geverifieerd is — elke geocentrische positie is het
   verschil van twee heliocentrische, dus de fout van de aardebaan
   zit in alle zeven planeten:

     1600  27"      1900   4"      2150  31"
     1700  12"      2000  37"      2200   2"
     1800  23"      2026  15"      2300  13"
     1850  31"      2100  14"      2400  37"

   De fout oscilleert tussen 2" en 37" en groeit niet. Wat overblijft
   zijn periodieke storingen die niet in de elementen zitten, en die
   zijn begrensd, niet cumulatief.

   Onafhankelijk bevestigd op de planeten zelf: alle NEGEN
   Venus-overgangen van 1631 tot 2117 komen correct uit (Venus binnen
   16 boogminuten van het zonnecentrum, gemeten 8,9' tot 15,8'),
   Mars' dichtste nadering van 2020 op 0,046% en Venus' grootste
   elongatie van 2023 op 0,05 graad.

   WAT HIER NIET IN ZIT: de grote ongelijkheid van Jupiter en
   Saturnus. Die twee verstoren elkaar met een periode van 900 jaar
   en een amplitude van tientallen boogminuten in lengte. Binnen dit
   bereik blijft dat klein, maar wie het model ver buiten deze
   grenzen gebruikt moet daar als eerste naar kijken — niet naar de
   aardebaan.
------------------------------------------------------------ */
export const VALID_FROM = 1600;
export const VALID_TO = 2400;
