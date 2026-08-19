/* =========================================================================
   terra/core.js — de rekenkern van Terra v1.

   Geen DOM, geen Three.js, geen netwerk. Dit bestand wordt DRIE keer
   geconsumeerd en heeft daarom geen buildstap en geen module-formaat dat
   er maar één toelaat:

     hoofdthread   <script src="./terra/core.js">   -> globalThis.TerraCore
     worker        importScripts('./core.js')       -> self.TerraCore
     node          require('../terra/core.js')      -> module.exports

   Dat is hetzelfde UMD-patroon dat lib/*.js zestien keer gebruikt, en het
   is de reden dat de node-toetsen het VERSCHEEPTE bestand kunnen lezen in
   plaats van er code uit te knippen zoals test-t96/run-against-html.js
   moet doen.

   Herkomst: geport uit igrf-globe-poc.html, met de regelnummers erbij zodat
   een verschil naar de bron te herleiden is. De POC blijft de source of
   truth; dit is een selectie, geen vervanging.

     IGRF          igrf-globe-poc.html:895-1176
     Physics       igrf-globe-poc.html:1184-1249
     T89c          igrf-globe-poc.html:1718-1947
     Frames        igrf-globe-poc.html:4730-4832
     Registration  igrf-globe-poc.html:5118-5180

   Wat hier NIET in zit en dat met opzet: T96, T96MP, de provider-registers
   en de aberratie. Terra v1 kiest één extern veld (T89c) en één
   magnetopauze (Shue 98). Zie het plan.
   ========================================================================= */

;(function (root) {
"use strict";


/* ---------- 1. IGRF-14 coëfficiënten ------------------------------------ */
/* Bron: IAGA / NOAA NCEI igrf14coeffs.txt, kolommen "2025.0" en "2025-30".
   Per regel: n m g h gDot hDot   (nT en nT per jaar).
   Seculaire variatie is tot graad 8 gepubliceerd; de rest staat vast. */

var IGRF_TABLE = `
1 0 -29350.0 0 12.6 0
1 1 -1410.3 4545.5 10.0 -21.5
2 0 -2556.2 0 -11.2 0
2 1 2950.9 -3133.6 -5.3 -27.3
2 2 1648.7 -814.2 -8.3 -11.1
3 0 1360.9 0 -1.5 0
3 1 -2404.2 -56.9 -4.4 3.8
3 2 1243.8 237.6 0.4 -0.2
3 3 453.4 -549.6 -15.6 -3.9
4 0 894.7 0 -1.7 0
4 1 799.6 278.6 -2.3 -1.3
4 2 55.8 -134.0 -5.8 4.1
4 3 -281.1 212.0 5.4 1.6
4 4 12.0 -375.4 -6.8 -4.1
5 0 -232.9 0 0.6 0
5 1 369.0 45.3 1.3 -0.5
5 2 187.2 220.0 0.0 2.1
5 3 -138.7 -122.9 0.7 0.5
5 4 -141.9 42.9 2.3 1.7
5 5 20.9 106.2 1.0 1.9
6 0 64.3 0 -0.2 0
6 1 63.8 -18.4 -0.3 0.3
6 2 76.7 16.8 0.8 -1.6
6 3 -115.7 48.9 1.2 -0.4
6 4 -40.9 -59.8 -0.8 0.8
6 5 14.9 10.9 0.4 0.7
6 6 -60.8 72.8 0.9 0.9
7 0 79.6 0 -0.1 0
7 1 -76.9 -48.9 -0.1 0.6
7 2 -8.8 -14.4 -0.1 0.5
7 3 59.3 -1.0 0.5 -0.7
7 4 15.8 23.5 -0.1 0.0
7 5 2.5 -7.4 -0.8 -0.9
7 6 -11.2 -25.1 -0.8 0.5
7 7 14.3 -2.2 0.9 -0.3
8 0 23.1 0 -0.1 0
8 1 10.9 7.2 0.2 -0.3
8 2 -17.5 -12.6 0.0 0.4
8 3 2.0 11.5 0.4 -0.3
8 4 -21.8 -9.7 -0.1 0.4
8 5 16.9 12.7 0.3 -0.5
8 6 14.9 0.7 0.1 -0.6
8 7 -16.8 -5.2 0.0 0.3
8 8 1.0 3.9 0.3 0.2
9 0 4.7 0 0 0
9 1 8.0 -24.8 0 0
9 2 3.0 12.1 0 0
9 3 -0.2 8.3 0 0
9 4 -2.5 -3.4 0 0
9 5 -13.1 -5.3 0 0
9 6 2.4 7.2 0 0
9 7 8.6 -0.6 0 0
9 8 -8.7 0.8 0 0
9 9 -12.8 9.8 0 0
10 0 -1.3 0 0 0
10 1 -6.4 3.3 0 0
10 2 0.2 0.1 0 0
10 3 2.0 2.5 0 0
10 4 -1.0 5.4 0 0
10 5 -0.5 -9.0 0 0
10 6 -0.9 0.4 0 0
10 7 1.5 -4.2 0 0
10 8 0.9 -3.8 0 0
10 9 -2.6 0.9 0 0
10 10 -3.9 -9.0 0 0
11 0 3.0 0 0 0
11 1 -1.4 0.0 0 0
11 2 -2.5 2.8 0 0
11 3 2.4 -0.6 0 0
11 4 -0.6 0.1 0 0
11 5 0.0 0.5 0 0
11 6 -0.6 -0.3 0 0
11 7 -0.1 -1.2 0 0
11 8 1.1 -1.7 0 0
11 9 -1.0 -2.9 0 0
11 10 -0.1 -1.8 0 0
11 11 2.6 -2.3 0 0
12 0 -2.0 0 0 0
12 1 -0.1 -1.2 0 0
12 2 0.4 0.6 0 0
12 3 1.2 1.0 0 0
12 4 -1.2 -1.5 0 0
12 5 0.6 0.0 0 0
12 6 0.5 0.6 0 0
12 7 0.5 -0.2 0 0
12 8 -0.1 0.8 0 0
12 9 -0.5 0.1 0 0
12 10 -0.2 -0.9 0 0
12 11 -1.2 0.1 0 0
12 12 -0.7 0.2 0 0
13 0 0.2 0 0 0
13 1 -0.9 -0.9 0 0
13 2 0.6 0.7 0 0
13 3 0.7 1.2 0 0
13 4 -0.2 -0.3 0 0
13 5 0.5 -1.3 0 0
13 6 0.1 -0.1 0 0
13 7 0.7 0.2 0 0
13 8 0.0 -0.2 0 0
13 9 0.3 0.5 0 0
13 10 0.2 0.6 0 0
13 11 0.4 -0.6 0 0
13 12 -0.5 -0.3 0 0
13 13 -0.4 -0.5 0 0
`;


/* ---------- 2. IGRF ------------------------------------------------------ */

var IGRF = {
  NMAX: 13,
  EPOCH: 2025.0,
  A: 6371.2,            // referentiestraal in km, zoals het model hem definieert
  g: [], h: [], gDot: [], hDot: [],

  init: function () {
    for (var n = 0; n <= this.NMAX; n++) {
      this.g[n] = new Array(n + 1).fill(0);
      this.h[n] = new Array(n + 1).fill(0);
      this.gDot[n] = new Array(n + 1).fill(0);
      this.hDot[n] = new Array(n + 1).fill(0);
    }
    var lines = IGRF_TABLE.trim().split("\n");
    for (var i = 0; i < lines.length; i++) {
      var f = lines[i].trim().split(/\s+/).map(Number);
      this.g[f[0]][f[1]] = f[2];    this.h[f[0]][f[1]] = f[3];
      this.gDot[f[0]][f[1]] = f[4]; this.hDot[f[0]][f[1]] = f[5];
    }
    return this;
  },

  /* Coëfficiënten verschoven naar een decimaal jaar. Voorbij 2030 is de
     lineaire SV niet meer geldig, dus geklemd in plaats van geëxtrapoleerd. */
  atYear: function (year) {
    var dt = Math.max(0, Math.min(5, year - this.EPOCH));
    var g = [], h = [];
    for (var n = 0; n <= this.NMAX; n++) {
      g[n] = []; h[n] = [];
      for (var m = 0; m <= n; m++) {
        g[n][m] = this.g[n][m] + dt * this.gDot[n][m];
        h[n][m] = this.h[n][m] + dt * this.hDot[n][m];
      }
    }
    return { g: g, h: h };
  },

  /* Schmidt semi-genormaliseerde Legendre-functies en hun theta-afgeleide.
     Let op het bijzondere geval n=1: de factor sqrt(2) in de Schmidt-conventie
     geldt pas vanaf m=1, dus de sectorale recursie mag niet bij P(0,0)
     beginnen. Dat fout doen is stil — het maakt alleen elke m=n-term te
     klein — en er is daarom een toets voor. */
  _P: null, _dP: null,

  legendre: function (theta, nmax) {
    var N = nmax === undefined ? this.NMAX : nmax;
    var c = Math.cos(theta), s = Math.sin(theta);
    if (!this._P) {
      this._P = []; this._dP = [];
      for (var i = 0; i <= this.NMAX; i++) {
        this._P[i] = new Float64Array(i + 1);
        this._dP[i] = new Float64Array(i + 1);
      }
    }
    var P = this._P, dP = this._dP;

    P[0][0] = 1; dP[0][0] = 0;
    for (var n = 1; n <= N; n++) {
      // sectorale term, met de Schmidt-uitzondering bij n = 1
      if (n === 1) {
        P[1][1] = s; dP[1][1] = c;
      } else {
        var k = Math.sqrt((2 * n - 1) / (2 * n));
        P[n][n] = k * s * P[n - 1][n - 1];
        dP[n][n] = k * (s * dP[n - 1][n - 1] + c * P[n - 1][n - 1]);
      }
      for (var m = 0; m < n; m++) {
        var d = Math.sqrt(n * n - m * m);
        var e = Math.sqrt((n - 1) * (n - 1) - m * m);
        var prev2P = (n - 2 >= m) ? P[n - 2][m] : 0;
        var prev2dP = (n - 2 >= m) ? dP[n - 2][m] : 0;
        P[n][m]  = ((2 * n - 1) * c * P[n - 1][m] - e * prev2P) / d;
        dP[n][m] = ((2 * n - 1) * (c * dP[n - 1][m] - s * P[n - 1][m])
                    - e * prev2dP) / d;
      }
    }
    return { P: P, dP: dP };
  },

  /* WAAR DE POC 210 TRANSCENDENTEN DEED, DOEN WIJ ER 28.
     De POC rekent cos(m·lon) en sin(m·lon) BINNEN de n-lus uit
     (igrf-globe-poc.html:1102), dus voor elke n opnieuw: 105 (n,m)-paren bij
     nmax 13, twee transcendenten per paar. Ze hangen alleen van m af.

     Hier één keer per evaluatie in een hergebruikte buffer, met dezelfde
     Math.cos/Math.sin — dus BIT VOOR BIT dezelfde waarden, geen recursie en
     dus ook geen opgehoopte afrondfout. Dat is een factor ~7,5 op het duurste
     deel van de veldevaluatie, en de duurste evaluaties zitten onder 1,4 Re
     waar nmax 13 is en de tracer zijn kleinste stap zet. */
  _cosM: new Float64Array(14),
  _sinM: new Float64Array(14),

  /* Geocentrisch sferisch veld. r in km, colat en lon in radialen.
     nmax kapt de reeks af. De hoge graden vallen als (a/r)^(n+2), dus boven
     een paar aardstralen dragen ze minder bij dan een pixel — en weglaten is
     wat live tracen betaalbaar maakt. */
  fieldSpherical: function (r, colat, lon, coeff, nmax) {
    var N = nmax === undefined ? this.NMAX : Math.min(nmax, this.NMAX);
    var g = coeff.g, h = coeff.h;
    this.legendre(colat, N);
    var P = this._P, dP = this._dP;
    var cosM = this._cosM, sinM = this._sinM;
    for (var m0 = 0; m0 <= N; m0++) {
      cosM[m0] = Math.cos(m0 * lon);
      sinM[m0] = Math.sin(m0 * lon);
    }

    var ratio = this.A / r;
    var sinT = Math.sin(colat);

    var Br = 0, Bt = 0, Bp = 0;
    var rn = ratio * ratio;                       // (a/r)^(n+2) met n vanaf 0

    for (var n = 1; n <= N; n++) {
      rn *= ratio;                                // nu (a/r)^(n+2)
      var sumR = 0, sumT = 0, sumP = 0;
      var gn = g[n], hn = h[n], Pn = P[n], dPn = dP[n];
      for (var m = 0; m <= n; m++) {
        var cosMP = cosM[m], sinMP = sinM[m];
        var gh = gn[m] * cosMP + hn[m] * sinMP;
        sumR += gh * Pn[m];
        sumT += gh * dPn[m];
        sumP += m * (gn[m] * sinMP - hn[m] * cosMP) * Pn[m];
      }
      Br += (n + 1) * rn * sumR;
      Bt -= rn * sumT;
      Bp += rn * sumP;
    }
    // Op de as is de phi-component ongedefinieerd; hij is daar ook nul.
    Bp = Math.abs(sinT) < 1e-8 ? 0 : Bp / sinT;
    return { Br: Br, Bt: Bt, Bp: Bp };
  },

  /* Graden die het bij een gegeven afstand waard zijn. Gekozen zodat de
     weggelaten termen onder ruwweg een tiende procent van het totaal blijven. */
  degreesFor: function (rRe) {
    if (rRe < 1.4) return 13;
    if (rRe < 2.2) return 8;
    if (rRe < 4) return 5;
    return 3;
  },

  /* Cartesisch veld in het Earth-fixed frame, ALLOCATIEVRIJ.
     Schrijft in `out` (een array-achtige van 3) en geeft die terug. Positie in
     aardstralen. Dit is de vorm die de tracer aanroept — vier keer per
     RK4-stap — en de reden dat hij geen object per aanroep maakt.

     HIER STAAT sqrt WAAR DE POC Math.hypot GEBRUIKT, en dat is gemeten in
     plaats van aangenomen. Math.hypot doet overloopveilige schaling en kost
     20,0 ns tegen 5,9 ns voor sqrt(x*x+y*y+z*z) — een factor 3,4, op een
     aanroep die ~320.000 keer per rebuild valt. Wat het kost: het antwoord
     verschilt van de POC met ten hoogste 5,1e-15 RELATIEF (gemeten over 60
     punten), oftewel 1,5e-10 nT op een oppervlakteveld van 30.000 nT. De
     scherpste meting die dit project tegen het veld houdt is de
     GOES-restterm, en die leest in nT. Overloop kan niet: r blijft tussen
     1 en 70 Re. */
  fieldGeoInto: function (x, y, z, coeff, nmax, out) {
    var rRe = Math.sqrt(x * x + y * y + z * z);
    var r = rRe * 6371.2;
    var colat = Math.acos(Math.max(-1, Math.min(1, z / (rRe > 1e-9 ? rRe : 1e-9))));
    var lon = Math.atan2(y, x);
    var b = this.fieldSpherical(r, colat, lon, coeff, nmax);

    var st = Math.sin(colat), ct = Math.cos(colat);
    var sp = Math.sin(lon), cp = Math.cos(lon);
    out[0] = b.Br * st * cp + b.Bt * ct * cp - b.Bp * sp;
    out[1] = b.Br * st * sp + b.Bt * ct * sp + b.Bp * cp;
    out[2] = b.Br * ct - b.Bt * st;
    return out;
  },

  /* Objectvorm. Blijft bestaan omdat de toetsen en de uitlezingen hem lezen;
     de hete lus gebruikt fieldGeoInto. */
  _fg: new Float64Array(3),
  fieldGeo: function (p, coeff, nmax) {
    var o = this.fieldGeoInto(p.x, p.y, p.z, coeff, nmax, this._fg);
    return { x: o[0], y: o[1], z: o[2] };
  },

  magnitudeAt: function (latDeg, lonDeg, rRe, coeff) {
    var lat = latDeg * Math.PI / 180, lon = lonDeg * Math.PI / 180;
    var o = this.fieldGeoInto(
      rRe * Math.cos(lat) * Math.cos(lon),
      rRe * Math.cos(lat) * Math.sin(lon),
      rRe * Math.sin(lat), coeff, undefined, this._fg);
    return Math.hypot(o[0], o[1], o[2]);
  },

  /* Dipoolsterkte, moment en poolposities uit de graad-1-termen.
     KOUD PAD — één keer per rebuild — dus hier Math.hypot, zodat de dipoolas
     bit voor bit die van de POC is. Die as bepaalt de GSM-basis, en de basis
     bepaalt elk punt van elke veldlijn; een verschil in de laatste bit hoort
     daar niet te beginnen als het gratis te vermijden is. */
  dipole: function (coeff) {
    var g10 = coeff.g[1][0], g11 = coeff.g[1][1], h11 = coeff.h[1][1];
    var B0 = Math.hypot(g10, g11, h11);
    // De zuidelijke geomagnetische pool volgt direct uit de coëfficiënten
    var southColat = Math.acos(g10 / B0);
    var southLon = Math.atan2(h11, g11);
    var northLat = 90 - (180 - southColat * 180 / Math.PI);
    var northLon = southLon * 180 / Math.PI + 180;
    if (northLon > 180) northLon -= 360;

    var aM = 6371200;                    // meter
    var moment = 4 * Math.PI * Math.pow(aM, 3) * (B0 * 1e-9) / (4e-7 * Math.PI);

    var la = northLat * Math.PI / 180, lo = northLon * Math.PI / 180;
    return {
      B0: B0, moment: moment, northLat: northLat, northLon: northLon,
      tiltFromSpinAxis: 90 - northLat,
      axis: { x: Math.cos(la) * Math.cos(lo),
              y: Math.cos(la) * Math.sin(lo),
              z: Math.sin(la) }
    };
  }
}.init();


/* ---------- 3. Zonnewind-fysica ----------------------------------------- */
/* Empirische modellen, geen simulatie: Shue et al. 1998 voor de grens,
   Farris en Russell 1994 voor de schok, Newell et al. 2007 voor de koppeling.
   Getoetst tegen de artikelen, niet tegen hoe ze eruitzien. */

var Physics = {
  dynamicPressure: function (n, v) { return 1.6726e-6 * n * v * v; },

  standoff: function (pdyn, bz) {
    var p = Math.max(pdyn, 0.01);
    return (10.22 + 1.29 * Math.tanh(0.184 * (bz + 8.14))) * Math.pow(p, -1 / 6.6);
  },

  flaring: function (pdyn, bz) {
    var p = Math.max(pdyn, 0.01);
    return (0.58 - 0.007 * bz) * (1 + 0.024 * Math.log(p));
  },

  magnetopauseRadius: function (theta, r0, alpha) {
    return Physics.magnetopauseRadiusCos(Math.cos(theta), r0, alpha);
  },

  /* DEZELFDE FORMULE OP cos(theta) IN PLAATS VAN theta, en niet uit zuinigheid.
     Wie een PUNT heeft, heeft de cosinus al gratis (x/r) en de hoek niet — en
     die dan via acos halen om er in de volgende regel weer cos van te nemen is
     in een lus over duizenden deeltjes twee transcendenten om niets. Dit is de
     enige plek waar de Shue-vorm staat; `magnetopauseRadius` is de hoekvariant
     ervan en `Boundary.shape` leest hem voor beide. */
  magnetopauseRadiusCos: function (c, r0, alpha) {
    if (c <= -0.999) return 1e4;
    return r0 * Math.pow(2 / (1 + c), alpha);
  },

  /* De afgeleide dr/dtheta van bovenstaande, in gesloten vorm.
     Bestaat omdat het omwentelingsoppervlak in de scene zijn normalen
     analytisch krijgt: computeVertexNormals() zou 14k driehoeken aan
     kruisproducten per update kosten voor iets waar een formule voor is. */
  magnetopauseSlope: function (theta, r0, alpha) {
    var c = Math.cos(theta), s = Math.sin(theta);
    if (c <= -0.999) return 0;
    return r0 * alpha * Math.pow(2 / (1 + c), alpha) * s / (1 + c);
  },

  alfvenSpeed: function (b, n) { return 21.8 * b / Math.sqrt(Math.max(n, 0.05)); },
  soundSpeed: function (t) { return 0.12 * Math.sqrt(Math.max(t, 1e3) + 1.28e5); },

  magnetosonicMach: function (sw) {
    var va = this.alfvenSpeed(sw.bt, sw.n), cs = this.soundSpeed(sw.t);
    return sw.v / Math.max(Math.sqrt(va * va + cs * cs), 1);
  },

  bowShockStandoff: function (rmp, mach) {
    var g = 5 / 3, m = Math.max(mach, 1.2), m2 = m * m;
    return rmp * (1 + 1.1 * ((g - 1) * m2 + 2) / ((g + 1) * (m2 - 1)));
  },

  /* IMF-klokhoek in het GSM y-z-vlak. Nul is pal noord, pi is pal zuid — en
     dat laatste is de stand die de magnetopauze opent. */
  clockAngle: function (sw) {
    var by = Number.isFinite(sw.by) ? sw.by : 0;
    return Math.atan2(by, sw.bz);
  },

  /* Newell et al. 2007 koppelingsfunctie, de gepubliceerde voorspeller van
     hoeveel zonnewind daadwerkelijk in de magnetosfeer koppelt:

       dPhi/dt = v^(4/3) * Bt^(2/3) * sin^(8/3)(theta_c / 2)

     v in km/s, B in nT, Bt het transversale veld. Dit maakt het aantal
     deeltjes op het scherm een AFGELEIDE grootheid in plaats van een
     animatie-instelling: noordwaartse IMF geeft bijna niets, zuidwaartse IMF
     bij hoge snelheid een stortvloed.

     GEEN HUISWAARDE VOOR Bz. Ontbreekt Bz, dan is er geen koppeling — null,
     niet nul. Nul is een echte toestand (rustig) en de verkeerde. */
  couplingNewell: function (sw) {
    if (!sw || !Number.isFinite(sw.bz) || !Number.isFinite(sw.v)) return null;
    var by = Number.isFinite(sw.by) ? sw.by : 0;
    var btr = Math.hypot(by, sw.bz);            // koud pad: eens per frame
    var theta = this.clockAngle(sw);
    var s = Math.pow(Math.abs(Math.sin(theta / 2)), 8 / 3);
    return Math.pow(Math.max(sw.v, 1), 4 / 3)
         * Math.pow(Math.max(btr, 1e-3), 2 / 3) * s;
  },

  /* Alleen schaling. De koppelingsfunctie zelf komt uit het artikel, maar de
     deler hieronder is ONZE referentie zodat het getal leest als een
     vermenigvuldiger van gewone omstandigheden. Het is een leesbaarheidskeuze,
     geen gemeten of gepubliceerde constante, en er hangt niets fysisch aan:
     verander hem en alleen het aantal deeltjes op het scherm verandert. */
  COUPLING_TYPICAL: 4400,
  entryRate: function (sw) {
    var c = this.couplingNewell(sw);
    return c === null ? null : Math.min(8, c / this.COUPLING_TYPICAL);
  }
};


/* ---------- 3b. Waarom de aurora-laag leeg is --------------------------- */
/* Dit hoort hier en niet in terra.html, om twee redenen die allebei op de
   regel hierboven wijzen.

   EEN LEEG SCHERM HEEFT VIER OORZAKEN EN ZE ZIJN NIET GELIJKWAARDIG. De laag
   tekende niets zodra er geen geometrie was, of geen Bz, of geen open lijn, of
   de gebruiker de knop had uitgezet — vier takken in één `if`, en dus vier
   verschillende uitspraken met hetzelfde beeld. Twee daarvan gaan over de
   magnetosfeer en horen benoemd te worden; twee niet.

     no-bz     WEIGERING. entryRate is `null` en niet nul, want de Newell-
               koppeling is een functie van Bz alleen. Zonder die meting is er
               geen antwoord — geen zwak antwoord.
     no-open   TOESTAND. De koppeling is er, de lijnen zijn getraceerd, en geen
               van hen kruist de magnetopauze. Dat IS het antwoord, en het is
               nul. Wel met een grens eraan: het geldt voor de seeds die dit
               model zaait, 52-76 graden, en niet voor de hele poolkap.

   Het verschil tussen die twee is de regel waar dit hele project op rust, en
   het is dezelfde scheiding die Series.derive maakt op de reeks en die de
   sectorlane maakt met `onbeslist`. Ze samenvouwen tot "leeg" gooit precies de
   uitspraak weg die de laag zou moeten doen.

   DE VOLGORDE IS DE LOGICA, en dat is het deel dat stil fout kan zijn. Een
   ontbrekende Bz maakt de lijnenlijst niet ongeldig, maar wel irrelevant: er
   is dan geen instroom om over te praten. Dus wint `no-bz` van `no-open`, en
   winnen de twee zwijgende gevallen van allebei — een uitgezette laag hoeft
   niets uit te leggen, en een build die nog onderweg is heeft nog geen
   uitspraak gedaan. Zet die vier in de verkeerde volgorde en het scherm meldt
   een magnetosfeer zonder open lijnen terwijl er in werkelijkheid geen meting
   was. Vandaar een pure functie hier, met vier asserties in test-terra/core.js,
   in plaats van een if-keten in de renderlus waar niets hem tegenspreekt.

   De TEKSTEN verhuizen bij bouwstap 8 naar terra/registry.js, als `inertWhen`
   bij `scene:aurora` — dezelfde weg die de lane-definities in terra/strip.js
   gaan. De KEUZE blijft hier: een registry draagt declaraties, geen control
   flow. `speaks` is wat er dan overblijft als scheidslijn tussen de twee. */

var Aurora = {

  REASONS: [
    { id: "off", speaks: false,
      when: "de instroomlaag staat uit",
      why: "Een uitgezette laag verklaart zichzelf." },

    { id: "building", speaks: false,
      when: "de geometrie is nog onderweg",
      why: "De deeltjes rijden op de getraceerde lijnen, dus voor de eerste "
         + "build is er niets om op te rijden. Duurt een tiental frames." },

    { id: "no-bz", speaks: true,
      when: "er is geen Bz op dit moment",
      why: "De instroom is de koppelingsfunctie van Newell, en die is een "
         + "functie van Bz alleen. Zonder die meting is entryRate null en niet "
         + "nul: er is geen zwakke instroom, er is geen antwoord." },

    { id: "no-boundary", speaks: true,
      when: "er is geen magnetopauze om te kruisen",
      why: "Zonder dynamische druk is er geen Shue-oppervlak, en `open` is "
         + "gedefinieerd als een kruising daarvan. De lijnen zijn er wel — "
         + "T89c heeft de grens niet nodig — maar ze zijn niet in te delen. "
         + "Dit als `geen open lijn` melden zou een gesloten magnetosfeer "
         + "beweren waar in werkelijkheid de vraag niet gesteld kon worden." },

    { id: "no-open", speaks: true,
      when: "geen enkele getraceerde lijn is open",
      why: "De koppeling is er wel en de grens ook. Geen van de lijnen "
         + "gezaaid tussen 52 en 76 graden kruist de magnetopauze, dus er is "
         + "geen kanaal naar binnen. Dit is een uitspraak over dit model bij "
         + "deze seeds, geen meting van de poolkap." }
  ],

  /* De vijf takken, in de enige volgorde die klopt. Geeft een id terug of
     `null`, en `null` is met opzet niet in REASONS: "er is niets aan de hand"
     hoort geen verklaring te krijgen — een reden bij iets dat gewoon gebeurt
     is net zo verwarrend als geen reden bij iets dat uitvalt.

     WAAROM no-bz VÓÓR no-boundary. Ze treden samen op zodra Bz ontbreekt: r0
     is een functie van pdyn EN Bz, dus geen Bz betekent ook geen grens. De
     ontbrekende meting is dan de wortel en het ontbrekende oppervlak het
     gevolg, en een verklaring hoort de wortel te noemen. Ontbreekt alleen de
     dichtheid, dan is er wél Bz en wél koppeling en géén grens — en dan is
     no-boundary precies het goede antwoord.

     WAAROM no-boundary VÓÓR no-open. Zonder grens is `openCount` per definitie
     nul, want `open` betekent "kruist de magnetopauze". Die nul melden als
     "geen enkele lijn is open" zou een gesloten magnetosfeer beweren waar de
     vraag niet gesteld kon worden.

     `bounded` is `false` alleen als de bouw het expliciet zegt; undefined
     betekent "niet van toepassing", net als bij het inkleuren van de lijnen. */
  reason: function (hasGeom, rate, openCount, enabled, bounded) {
    if (!enabled) return "off";
    if (!hasGeom) return "building";
    if (rate === null || rate === undefined || !Number.isFinite(rate)) return "no-bz";
    if (bounded === false) return "no-boundary";
    if (!openCount) return "no-open";
    return null;
  },

  entry: function (id) {
    for (var i = 0; i < this.REASONS.length; i++) {
      if (this.REASONS[i].id === id) return this.REASONS[i];
    }
    return null;
  },

  /* Alleen de gevallen die iets te zeggen hebben. terra.html hangt hier zijn
     paneelrij aan; wat niet spreekt levert geen tekst op en dus geen ruis. */
  speaks: function (id) {
    var e = this.entry(id);
    return !!(e && e.speaks);
  }
};


/* ---------- 3c. De keten van de zon naar de poolkap ---------------------- */
/* WAT DIT IS EN WAT HET NIET IS.

   Tot sessie 28 stonden er twee losse dingen op het scherm: de POC tekent de
   zonnewind als schematische stipjes die bij de magnetopauze VERDWIJNEN
   (igrf-globe-poc.html:7458 — "the exact paths are drawn for legibility and are
   not a flow solution"), en v1 tekende instroom als deeltjes die op een open
   veldlijn VERSCHIJNEN. Twee halve verhalen met een gat ertussen, en dat gat is
   nou juist waar het interessante gebeurt. Terry, sessie 28: "hoe meer we de
   particles kunnen ketenen tot 1 natuurlijke beweging vanuit de ruimte (zon)
   tot het aardoppervlak."

   De keten heeft drie schakels, en ze zijn NIET van gelijke sterkte:

     WIND    vrije aanstroom langs -X. De snelheid is de GEMETEN v, geschaald;
             de richting is de zonlijn omdat v1 geen aberratie kent.
     SHEATH  achter de schok. Afbuiging om de grens heen is echt en de richting
             klopt; de exacte baan is getekend, niet opgelost. Dit is geen MHD.
     ENTRY   op een open veldlijn naar het voetpunt. Dit is de schakel die v1
             al had, en de enige met een gemeten AANTAL: de koppelingsfunctie.

   DE OVERGANG SHEATH -> ENTRY IS DE ZWAKSTE SCHAKEL EN DE MOOISTE. Waar een
   open veldlijn de magnetopauze kruist kan sheath-plasma naar binnen; dat punt
   is echt en volgt uit de tracer. Maar WELK deeltje daar invalt is een
   reconnectievraag die dit model niet beantwoordt. Wat hier gebeurt is dus:
   het kruispunt is berekend, de invangKANS is de gemeten koppeling, en de rest
   is tekening. Dat staat zo in de registry en het hoort niet weggepoetst.

   Waarom de kans de koppeling is en niet iets anders: dan blijft het aantal
   deeltjes dat werkelijk naar binnen rijdt precies wat het altijd al was — een
   functie van Bz via Newell — en verandert er niets aan wat de app BEWEERT.
   Alleen aan wat je ziet gebeuren voordat ze er zijn. */

var Flow = {

  /* APPROACH is de vierde schakel en zit TUSSEN sheath en entry: het deeltje
     is al ingevangen — het quotum telt hem — maar het is er nog niet. Zie de
     aanvliegfase in terra.html. */
  PHASE: { WIND: 0, SHEATH: 1, ENTRY: 2, APPROACH: 3 },

  /* EEN PUNT OP EEN VELDLIJN, gegeven zijn positie u in 0..1.

     Deze interpolatie stond met de hand uitgeschreven op drie plekken in
     terra.html, en de aanvliegfase had de vierde nodig. Eén plek die te
     toetsen is, is er drie minder om stil uit elkaar te laten lopen.

     `pos` is de platte xyz-buffer, `from` en `to` zijn de puntindices die deze
     lijn begrenzen. u = 0 is het voetpunt (gezaaid op 1,01 Re), u = 1 het
     verre einde. Buiten bereik wordt geklemd: een u die er net overheen valt
     is een afrondingskwestie en geen fout. */
  pointOnLine: function (pos, from, to, u, out) {
    var m = to - from;
    out = out || {};
    if (m < 2) { out.x = 0; out.y = 0; out.z = 0; return out; }
    var uu = u < 0 ? 0 : (u > 1 ? 1 : u);
    var t = uu * (m - 1), k = from + (t | 0), f = t - (t | 0);
    var k2 = k + 1 < to ? k + 1 : to - 1;
    out.x = pos[k * 3]     + (pos[k2 * 3]     - pos[k * 3])     * f;
    out.y = pos[k * 3 + 1] + (pos[k2 * 3 + 1] - pos[k * 3 + 1]) * f;
    out.z = pos[k * 3 + 2] + (pos[k2 * 3 + 2] - pos[k * 3 + 2]) * f;
    return out;
  },

  /* DE RICHTING WAARIN DE WIND WERKELIJK AANKOMT, als eenheidsvector.

     v1 liet elk winddeeltje puur langs -X lopen, want de zonlijn was de enige
     richting die de app kende. De gepropageerde feed draagt vx/vy/vz allang
     mee — de parser liet ze alleen liggen. Doorgaans staat de aanstroom zo'n
     3 tot 5 graden van de zonlijn; bij een schokfront meer.

     De terugval (-1,0,0) is geen foutwaarde maar een uitspraak: ontbreekt de
     vector, dan is de aanname die v1 altijd al maakte nog steeds de beste die
     er is. `gemeten` zegt welk van de twee je in handen hebt, zodat de readout
     niet hoeft te gokken.

     LET OP HET FRAME. De feed geeft GSE, wij tekenen in GSM. Die twee delen
     hun x-as, dus de HOEK MET DE ZONLIJN klopt exact; alleen de verdeling van
     de rest over y en z verschilt met de dipoolkanteling. Dat staat als
     caveat bij `wind-vector` in de registry, met het verificatiepunt erbij. */
  windDir: function (vx, vy, vz) {
    var l = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (!(l > 1e-6)) return { x: -1, y: 0, z: 0, gemeten: false };
    return { x: vx / l, y: vy / l, z: vz / l, gemeten: true };
  },

  /* Hoe schuin de aanstroom staat, in graden vanaf de zonlijn (-X). */
  windOffAxis: function (dir) {
    var c = -dir.x;
    if (c > 1) c = 1; else if (c < -1) c = -1;
    return Math.acos(c) * 180 / Math.PI;
  },

  /* WAAR EEN OPEN LIJN DE GRENS KRUIST, als positie langs de lijn in 0..1.

     De lijn loopt van het voetpunt (u = 0, gezaaid op 1,01 Re) naar het verre
     einde (u = 1), dus we zoeken het EERSTE punt van binnen naar buiten dat
     buiten de grens valt en interpoleren lineair tussen dat punt en zijn buur.

     Lineair en niet bisecterend: de afstand tussen twee opeenvolgende punten is
     na de decimatie hooguit een fractie van een Re, en het kruispunt is hier
     een SPAWNPLEK en geen meting. De poolkaprand — dat is wel een meting — komt
     uit een heel andere plek en wordt niet hierop gebaseerd.

     Geeft -1 als de lijn de grens niet kruist. Dat is geen fout: een dichte
     lijn hoort dat te doen, en een open lijn waarvan het kruispunt buiten het
     getekende stuk viel ook. */
  crossingU: function (pos, from, to, shape) {
    if (!shape || to - from < 2) return -1;
    var n = to - from, i;
    for (i = 0; i < n; i++) {
      var k = (from + i) * 3;
      if (!shape.inside(pos[k], pos[k + 1], pos[k + 2])) {
        if (i === 0) return -1;              // begint al buiten: niets te kruisen
        /* Tussen punt i-1 (binnen) en i (buiten). Halverwege is nauwkeurig
           genoeg voor een spawnplek en kost geen extra evaluaties van een
           oppervlak dat per aanroep een Math.pow doet. */
        return (i - 0.5) / (n - 1);
      }
    }
    return -1;
  },

  /* DE SNELHEID VAN EEN DEELTJE IN DE SHEATH, als factor op de vrije stroom.

     Geport uit igrf-globe-poc.html:7457-7463 en van twee naar drie dimensies
     gebracht: waar de POC in het meridiaanvlak `p.z` als dwarsrichting neemt,
     is dat hier de radiale richting loodrecht op de x-as. In het vlak y = 0
     komt het exact op de POC-formule uit, en dat is wat de node-toets eist.

     De vorm zegt twee dingen die allebei kloppen: achter de schok gaat het
     plasma LANGZAMER vooruit (0,28) en het krijgt een DUWTJE naar buiten dat
     sterker is naarmate het dichter bij de magnetopauze zit. Dat is waarom de
     stroom om de neus heen buigt in plaats van erin te lopen.

     DE REIKWIJDTE IS EEN PARAMETER GEWORDEN (sessie 30) en staat standaard op
     de POC-waarde 0,6, zodat deze functie de POC-formule BLIJFT — de node-toets
     legt hem daar op vast met vier argumenten. Wat de reikwijdte doet is bepalen
     hoe ver vóór de magnetopauze de duw al begint. Op 0,6 begint hij al buiten
     de schok, en dan wordt een deeltje weggeduwd op het moment dat het de
     sheath binnenkomt: gemeten in sessie 30 zat 96% van alle sheath-deeltjes in
     de buitenste tiende, en ELKE invang gebeurde op diepte 0,99 — pal op de
     schok, waarna het deeltje de hele sheath moest oversteken. Een kleinere
     reikwijdte laat de stroom eerst naar binnen dringen en buigt hem pas af
     waar de grens werkelijk is. Zie SHEATH_REIKWIJDTE in terra.html. */
  sheathVel: function (x, rho, rmp, speed, reikwijdte) {
    var r = Math.sqrt(x * x + rho * rho);
    if (!(r > 1e-9)) return { vx: -speed, vrho: 0 };
    var w = (reikwijdte === undefined) ? 0.6 : reikwijdte;
    var push = Math.max(0, 1 - (r - rmp) / Math.max(rmp * w, 1)) * speed * 0.9;
    return { vx: -speed * 0.28 + (x / r) * push * 0.35,
             vrho: (rho / r) * push };
  },

  /* STAAT HET DEELTJE IN DEZELFDE RICHTING ALS DE DEUR? Als cosinus van de hoek
     tussen de twee posities gezien vanuit de aarde.

     DIT WAS EERST EEN AFSTAND EN DAT KON NIET WERKEN. De deur is het punt waar
     een open veldlijn de magnetopauze kruist, dus hij ligt PER DEFINITIE op de
     grens. De sheath-deeltjes worden door diezelfde grens juist weggeduwd — dat
     is wat de afbuiging doet — en de opruimregel houdt ze buiten 0,98 rmp. Er
     zit dus altijd sheath tussen het deeltje en de deur. Gemeten over 600
     stappen: de KLEINSTE afstand die ooit voorkwam was 2,35 Re, bij een drempel
     van 2,0. Nul invangen, en geen enkele drempel onder 2,4 zou ooit iets
     hebben opgeleverd.

     De hoek lost dat op, en niet als truc: het deeltje op (11,1 · 2,9) stond op
     14,6 graden van de zonlijn en de deur op (8,8 · 2,5) op 15,9 — ze zaten op
     dezelfde plek van de grens, alleen op verschillende hoogte erboven. En dat
     is precies de situatie waarin invang hoort te kunnen: de veldlijn steekt de
     sheath in, dus wat langs die richting strijkt kan hem vinden. Hoe hoog
     erboven doet er niet toe zolang het deeltje in de sheath zit — en dat wordt
     apart getoetst.

     Vlak = true negeert y, voor de doorsnede: daar is de tekening een projectie
     en hoort de invang op diezelfde projectie beoordeeld te worden. */
  sameDirection: function (ax, ay, az, bx, by, bz, vlak) {
    var ay2 = vlak ? 0 : ay, by2 = vlak ? 0 : by;
    var la = Math.sqrt(ax * ax + ay2 * ay2 + az * az);
    var lb = Math.sqrt(bx * bx + by2 * by2 + bz * bz);
    if (!(la > 1e-9) || !(lb > 1e-9)) return -1;
    var c = (ax * bx + ay2 * by2 + az * bz) / (la * lb);
    return c > 1 ? 1 : (c < -1 ? -1 : c);
  },

  /* De schokstraal op dezelfde hoek, als geschaalde magnetopauze. De POC doet
     het zo (`rbs / nose * rmp`) en dat is geen luiheid: er is in dit model geen
     tweede vorm voor de schok, alleen een tweede NEUSAFSTAND, en een schok die
     bij de neus 1,35x zo ver staat maar op de flank een andere vorm heeft zou
     een uitspraak zijn waar niets onder ligt. */
  shockAt: function (rmp, r0, rbs) {
    if (!(r0 > 0) || !(rbs > 0)) return null;
    return rbs / r0 * rmp;
  }
};


/* ---------- 4. Shue 98 als het ENE grensoppervlak ------------------------ */
/* De POC heeft hier een provider-register met twee oppervlakken en een
   keuzeknop. Terra v1 kiest er één, dus het register vervalt — maar de REGEL
   eronder blijft en is belangrijker dan het register was:

     het getekende oppervlak en het classificerende oppervlak zijn ÉÉN object.

   Teken een grens en laat iets anders beslissen wat open is, en de tekening
   begint te liegen over welke lijnen open zijn — stil, en het ergst op de
   flanken. Daarom geeft dit één shape terug met radiusAt (tekenen) én inside
   (classificeren) uit dezelfde r0 en alpha, en toetst stap 5 dat over de
   threadgrens heen.

   WAT v1 NIET DOET: de aberratie. De POC mat de aanstroomhoek op 4,84° en
   kantelt Shue daarheen; v1 zet de grens op de zonlijn en zegt dat in het
   paneel. Een gekozen vereenvoudiging, geen ontbrekende meting. */

var Boundary = {
  ID: "shue",
  LABEL: "Shue 98",
  VALIDITY: "Shue et al. 1998, gedreven door dyn. druk en Bz. Divergeert in de "
          + "diepe staart: voorbij ongeveer x = -20 Re is er geen oppervlak "
          + "meer om te kruisen, en die lijnen blijven 'unresolved (tail)'.",
  ABERRATED: false,
  NOT_ABERRATED_WHY: "De grens staat op de GSM-x-as. De POC mat de "
          + "aanstroomhoek op 4,84° en kantelt hem daarheen; v1 modelleert de "
          + "aberratie niet.",

  /* IN WELKE TOESTAND DE GRENS STAAT, naar Bz. Drie klassen en geen kleuren:
     core.js kent het palet niet, en dat hoort zo — dit is een uitspraak over
     het veld, welke inkt hem toont is een keuze van de renderlaag.

     De drempels komen uit de POC (igrf-globe-poc.html:7362) en zijn niet
     willekeurig: bij Bz ≥ 0 sluit de dagzijde en verandert er weinig; onder nul
     begint reconnectie en dus erosie van de neus; onder −10 nT is dat geen
     graduele verschuiving meer maar de toestand waarin r₀ binnen de
     geostationaire baan kan zakken. Drie klassen omdat er drie dingen te
     onderscheiden zijn, niet omdat drie kleuren mooi staat.

     NULL BIJ EEN ONTBREKENDE METING, en dat is meer dan netheid: nul is
     noordwaarts en dus een echte, rustige toestand. Zonder Bz is er geen
     toestand, en dan hoort er geen kleur gekozen te worden. */
  TINTS: ["north", "south", "strong-south"],
  SOUTH_NT: 0,
  STRONG_SOUTH_NT: -10,

  tintOf: function (bz) {
    if (bz === null || bz === undefined || !isFinite(bz)) return null;
    if (bz >= this.SOUTH_NT) return "north";
    return bz < this.STRONG_SOUTH_NT ? "strong-south" : "south";
  },

  /* TOT WAAR DE GRENS GETEKEND WORDT. Shue divergeert, dus er is geen natuurlijk
     einde — er is alleen de straal waarop we ophouden. Uitgerekend en niet
     gekozen: r0*(2/(1+c))^a = R geeft c = 2/(R/r0)^(1/a) - 1. */
  thetaMax: function (r0, alpha, drawMax) {
    var cMin = 2 / Math.pow(drawMax / r0, 1 / alpha) - 1;
    if (!(cMin > -0.999)) cMin = -0.999;
    return Math.acos(Math.max(-1, Math.min(1, cMin)));
  },

  /* DE HOEKEN WAAROP GESAMPLED WORDT, gelijk verdeeld in BOOGLENGTE en niet in
     theta.

     Waarom dat verschil er is: r(theta) divergeert naar de staart toe, dus een
     uniforme hoekstap zet bijna elk punt bij de neus en laat de staart over aan
     een handvol lange rechte stukken. Gemeten op r0 11,3 · alpha 0,58 · tot
     70 Re, met 120 punten: het kortste segment 0,26 Re en het langste 4,41 —
     een verhouding van ZEVENTIEN. Dat is de hoekigheid die je in de staart
     ziet, en meer punten lossen hem niet op: bij 480 punten is de verhouding
     nog steeds zeventien, alles wordt alleen evenredig kleiner.

     Hier is de verhouding 1,01. De booglengte wordt op een fijner rooster
     opgeteld en daar wordt lineair in teruggezocht; `over` bepaalt hoeveel
     fijner. Kosten gemeten: 32 us voor 120 punten uit 480 monsters — twee keer
     per frame, tegen een budget van 3 ms. */
  arcThetas: function (r0, alpha, drawMax, n, over) {
    var thMax = this.thetaMax(r0, alpha, drawMax);
    var out = new Float64Array(n);
    if (n < 2) { if (n === 1) out[0] = 0; return out; }
    var M = Math.max(n, Math.round(n * (over || 4)));
    var th = new Float64Array(M + 1), cum = new Float64Array(M + 1);
    var prevX = Physics.magnetopauseRadius(0, r0, alpha), prevZ = 0, k;
    for (k = 0; k <= M; k++) {
      var t = thMax * k / M;
      th[k] = t;
      var r = Physics.magnetopauseRadius(t, r0, alpha);
      var x = r * Math.cos(t), z = r * Math.sin(t);
      cum[k] = k ? cum[k - 1] + Math.sqrt((x - prevX) * (x - prevX) + (z - prevZ) * (z - prevZ)) : 0;
      prevX = x; prevZ = z;
    }
    var total = cum[M];
    /* Een grens zonder lengte — kan alleen bij onzinnige invoer — valt terug op
       de uniforme verdeling in plaats van op nul: alle punten op de neus zou
       een grens tekenen die er niet is. */
    if (!(total > 0)) {
      for (k = 0; k < n; k++) out[k] = thMax * k / (n - 1);
      return out;
    }
    k = 0;
    for (var i = 0; i < n; i++) {
      var want = total * i / (n - 1);
      while (k < M && cum[k + 1] < want) k++;
      var d = cum[k + 1] - cum[k];
      out[i] = d > 0 ? th[k] + (th[k + 1] - th[k]) * (want - cum[k]) / d : th[k];
    }
    out[n - 1] = thMax;                    // exact, niet bij benadering
    return out;
  },

  /* DE INDEX VAN DE SCHIL ALS RASTER, en niet als driehoeken.

     Tot sessie 28 was de schil een `THREE.Mesh` met `material.wireframe = true`.
     Three tekent dan elke DRIEHOEKSRAND, dus ook de hypotenusa van elke cel —
     op een raster van 40 x 24 zijn dat 936 diagonalen naast de 1896 randen die
     de vorm dragen. Een derde van alle inkt zei niets over de magnetopauze en
     alles over hoe de quad toevallig in tweeën was gesneden. Terry, sessie 28:
     "indien mogelijk kunnen we ook afscheid nemen van de diagonale lijnen in
     deze geometrie om meer rust te bewaren."

     Wat er overblijft zijn de twee families die de vorm WEL dragen:

       ribben   langs theta, van de neus naar de staart. (nTheta-1) * nRoll
                segmenten — de doorsnede van de schil, nRoll keer rondgedraaid.
       ringen   langs roll, de omtrek op een vaste theta. nTheta * nRoll
                segmenten, elk een gesloten cirkel omdat kolom nRoll dezelfde
                positie draagt als kolom 0.

     De naad telt één keer. Het rooster heeft nRoll+1 kolommen waarvan de laatste
     een duplicaat van de eerste is (zo staan de posities in de buffer, en dat is
     wat de ring sluitend maakt). Een ringsegment van kolom nRoll-1 naar kolom
     nRoll is dus dezelfde lijn als van nRoll-1 naar 0; hier wordt de eerste
     geschreven en de tweede niet, anders ligt er over de hele naad een dubbele
     lijn die twee keer zo helder oplicht onder additief mengen.

     `ringElke` DUNT DE RINGEN UIT EN LAAT DE RIBBEN STAAN, en dat is de reden
     dat deze parameter bestaat. Gemeten aspect van een cel — breedte langs de
     omtrek gedeeld door lengte langs theta:

       aspect_i = 2*pi*rho_i / (nRoll * ds),   ds = booglengte / (nTheta-1)

     `ds` is CONSTANT omdat arcThetas gelijk in booglengte verdeelt (gemeten:
     min/max 2,206/2,254 Re, ratio 1,02), dus het aspect hangt alleen van rho af.
     Op 40 x 24 is de mediaan 2,82 — cellen bijna drie keer zo breed als lang,
     wat Terry als "rechthoeken" beschreef. En er is geen getal dat dat oplost:
     nRoll van 24 naar 68 zou de mediaan op 1 zetten maar het raster naar ~5300
     segmenten brengen (een muur, precies waar het POC-commentaar hieronder voor
     waarschuwt), en nTheta terug naar 15 zou de vorm weer hoekig maken — de
     hoekigheid die sessie 27 met 26 -> 40 ribben juist wegnam.

     De uitweg is dat de twee families NIET dezelfde resolutie nodig hebben. De
     ribben dragen de VORM en moeten fijn: ze lopen langs de curve. De ringen
     dragen alleen de RONDING en mogen ijl. Met een ring op elke derde rib wordt
     de cel drie keer zo lang zonder dat er één punt van de vorm verdwijnt:
     mediaan aspect 2,82 -> 0,94 voor de magnetopauze en 3,01 -> 1,00 voor de
     schok, en het raster zakt van 1896 naar 1272 segmenten. Terry, sessie 28:
     "we kunnen het detail verlagen waardoor we er geen rechthoeken vormen maar
     bijna vierkanten."

     De LAATSTE rib krijgt altijd een ring, ook als hij niet op het stramien
     valt. Zonder die uitzondering eindigt de kooi in de staart in losse
     ribuiteinden in plaats van in een rand — bij nTheta 32 en elke derde is rij
     31 precies zo'n geval. */
  wireIndex: function (nTheta, nRoll, ringElke) {
    var idx = [];
    var stride = nRoll + 1;
    var elke = ringElke > 0 ? Math.round(ringElke) : 1;
    for (var i = 0; i < nTheta; i++) {
      var row = i * stride;
      var ring = (i % elke === 0) || (i === nTheta - 1);
      for (var j = 0; j < nRoll; j++) {
        if (ring) idx.push(row + j, row + j + 1);
        if (i < nTheta - 1) idx.push(row + j, row + j + stride);
      }
    }
    return idx;
  },

  shape: function (r0, alpha) {
    return {
      id: "shue",
      nose: r0,
      r0: r0,
      alpha: alpha,
      finiteTail: false,
      /* DE HOEKVARIANT, EN HIJ WEIGERT EEN PUNT. Dat is geen pedanterie maar
         een gemeten fout: `Plasma` gaf hier `(x, y, z)` in en JavaScript liet
         dat door — `th` werd de x-coördinaat, cos is periodiek, en dus stond de
         "magnetopauze" op de zonlijn achtereenvolgens op 22, 31, 50, 119 en
         10.000 Re bij x = 46, 40, 34, 28 en 22. De deeltjes liepen daar tegenop
         en hoopten zich op met een periode van 2*pi Re: dat is de kam die sinds
         sessie 30 gezocht werd, en geen enkele meting kon hem aanwijzen omdat
         beide kanten (de deeltjes en de vorm) op zichzelf klopten.

         Voor een punt is er `radiusToward`. De weigering staat hier omdat een
         verkeerde aanroep anders opnieuw een antwoord krijgt in plaats van een
         fout, en dít is precies het geval waarin dat een half jaar meekan. */
      radiusAt: function (th) {
        if (arguments.length > 1) throw new TypeError(
          'shape.radiusAt neemt een HOEK in radialen; voor een punt is er radiusToward(x, y, z)');
        return Physics.magnetopauseRadius(th, r0, alpha);
      },
      /* De straal van de grens in de RICHTING van een punt. Zelfde vorm, maar
         gevoed met de cosinus die het punt al draagt (x/r) in plaats van met een
         hoek die er eerst uit gehaald moet worden. */
      radiusToward: function (x, y, z) {
        var r = Math.sqrt(x * x + y * y + z * z);
        if (r < 1e-9) return r0;
        return Physics.magnetopauseRadiusCos(x / r, r0, alpha);
      },
      slopeAt: function (th) { return Physics.magnetopauseSlope(th, r0, alpha); },
      inside: function (x, y, z) {
        var r = Math.sqrt(x * x + y * y + z * z);
        if (r < 1e-9) return true;
        var c = x / r;
        if (c <= -0.999) return true;               // divergeert; niets te kruisen
        return r <= Physics.magnetopauseRadiusCos(c, r0, alpha);
      }
    };
  }
};


/* ---------- 5. T89c extern veld ------------------------------------------ */
/* Geport uit de Fortran T89c van N. A. Tsyganenko, release 12 feb 1996.
   Gevalideerd tegen het gepubliceerde geopack-referentiegeval
   (iopt 2, tilt -0.533585131, positie -5.1 0.3 2.8) tot binnen 2e-6 nT — de
   float32-ruis van het origineel. Raak de coëfficiënten niet aan zonder die
   toets opnieuw te draaien.

   Te weten: T89 is gebinned op Kp, dus het is een statistisch gemiddelde voor
   een verstoringsniveau en niet déze storm. Vlak bij de dagzijdige
   magnetopauze bij hoge Kp raakt het buiten zijn comfortzone.

   iopt 1..7 hoort bij Kp 0/0+, 1-/1/1+, 2-/2/2+, 3-/3/3+, 4-/4/4+, 5-/5/5+, >=6-
   Geeft ALLEEN het externe veld, in GSM nT. Positie in Re, tilt in radialen. */

var T89_PARAM = [
  null,
  [-116.53,-10719.,42.375,59.753,-11363.,1.7844,30.268,-0.35372E-01,
   -0.66832E-01,0.16456E-01,-1.3024,0.16529E-02,0.20293E-02,20.289,
   -0.25203E-01,224.91,-9234.8,22.788,7.8813,1.8362,-0.27228,8.8184,
   2.8714,14.468,32.177,0.01,0.0,7.0459,4.0,20.0],
  [-55.553,-13198.,60.647,61.072,-16064.,2.2534,34.407,-0.38887E-01,
   -0.94571E-01,0.27154E-01,-1.3901,0.13460E-02,0.13238E-02,23.005,
   -0.30565E-01,55.047,-3875.7,20.178,7.9693,1.4575,0.89471,9.4039,
   3.5215,14.474,36.555,0.01,0.0,7.0787,4.0,20.0],
  [-101.34,-13480.,111.35,12.386,-24699.,2.6459,38.948,-0.34080E-01,
   -0.12404,0.29702E-01,-1.4052,0.12103E-02,0.16381E-02,24.49,
   -0.37705E-01,-298.32,4400.9,18.692,7.9064,1.3047,2.4541,9.7012,
   7.1624,14.288,33.822,0.01,0.0,6.7442,4.0,20.0],
  [-181.69,-12320.,173.79,-96.664,-39051.,3.2633,44.968,-0.46377E-01,
   -0.16686,0.048298,-1.5473,0.10277E-02,0.31632E-02,27.341,
   -0.50655E-01,-514.10,12482.,16.257,8.5834,1.0194,3.6148,8.6042,
   5.5057,13.778,32.373,0.01,0.0,7.3195,4.0,20.0],
  [-436.54,-9001.0,323.66,-410.08,-50340.,3.9932,58.524,-0.38519E-01,
   -0.26822,0.74528E-01,-1.4268,-0.10985E-02,0.96613E-02,27.557,
   -0.56522E-01,-867.03,20652.,14.101,8.3501,0.72996,3.8149,9.2908,
   6.4674,13.729,28.353,0.01,0.0,7.4237,4.0,20.0],
  [-707.77,-4471.9,432.81,-435.51,-60400.,4.6229,68.178,-0.88245E-01,
   -0.21002,0.11846,-2.6711,0.22305E-02,0.10910E-01,27.547,
   -0.54080E-01,-424.23,1100.2,13.954,7.5337,0.89714,3.7813,8.2945,
   5.174,14.213,25.237,0.01,0.0,7.0037,4.0,20.0],
  [-1190.4,2749.9,742.56,-1110.3,-77193.,7.6727,102.05,-0.96015E-01,
   -0.74507,0.11214,-1.3614,0.15157E-02,0.22283E-01,23.164,
   -0.74146E-01,-2219.1,48253.,12.714,7.6777,0.57138,2.9633,9.3909,
   9.7263,11.123,21.558,0.01,0.0,4.4518,4.0,20.0]
];

var T89 = {
  /* Vaste schaallengtes uit het gepubliceerde model. */
  A02: 25, XLW2: 170, RT: 30, XD: 0, XLD2: 40,
  SXC: 4, XLWC2: 50,

  band: function (kp) {
    if (!Number.isFinite(kp)) return 2;
    return Math.max(1, Math.min(7, Math.floor(kp) + 1));
  },

  /* WAT DE POC PER AANROEP DEED, DOEN WIJ PER REBUILD.
     igrf-globe-poc.html:1762 opent field() met `const a = i => A[i-1]` — een
     closure-allocatie — en pakt daarna ~30 constanten uit die alleen van iopt
     afhangen, plus sin/cos van de tilt die de hele rebuild constant zijn. Bij
     ~250 stappen × 4 RK4-evaluaties × 80 lijnen is dat 80.000 keer hetzelfde
     rekenwerk.

     prepare() doet het één keer en geeft een object met een VASTE vorm terug,
     zodat V8 er een enkele hidden class voor houdt en elke property-lezing
     in fieldInto een inline cache raakt. */
  prepare: function (iopt, tilt) {
    var A = T89_PARAM[Math.max(1, Math.min(7, iopt))];
    var a = function (i) { return A[i - 1]; };

    var DYC = a(30), DYC2 = DYC * DYC;
    var DX = a(18);
    var DEL = a(26), D0 = a(20);
    var W1 = -0.5 / DX;
    var AK6 = a(6), AK7 = a(7), AK8 = a(8), AK9 = a(9), AK10 = a(10);
    var AK11 = a(11), AK12 = a(12), AK13 = a(13);
    var W4 = -1 / 3;
    var SPS = Math.sin(tilt);
    var CPS = Math.sqrt(1 - SPS * SPS);

    return {
      iopt: iopt, tilt: tilt,
      A02: this.A02, XLW2: this.XLW2, RT: this.RT, XD: this.XD,
      XLD2: this.XLD2, SXC: this.SXC, XLWC2: this.XLWC2,

      DYC2: DYC2, DX: DX,
      HA02: 0.5 * this.A02,
      RDYC2: 1 / DYC2,
      HLWC2M: -0.5 * this.XLWC2,
      DRDYC2: -2 / DYC2,
      HXLW2M: -0.5 * this.XLW2,
      HXLD2M: -0.5 * this.XLD2,

      ADR: a(19), D0: D0, DD: a(21), RC: a(22), G: a(23), AT: a(24),
      DT: D0, DEL: DEL, P: a(25), Q: a(27), SX: a(28), GAM: a(29),

      W1: W1, DBLDEL: 2 * DEL, W2: W1 * 2,
      W3: W4 / DX, W4: W4, W5: -0.5, W6: -3,

      AK1: a(1), AK2: a(2), AK3: a(3), AK4: a(4), AK5: a(5),
      AK6: AK6, AK7: AK7, AK8: AK8, AK9: AK9, AK10: AK10,
      AK11: AK11, AK12: AK12, AK13: AK13, AK14: a(14), AK15: a(15),
      AK16: a(16), AK17: a(17),

      AK610: AK6 * W1 + AK10 * (-0.5),
      AK711: AK7 * (W1 * 2) - AK11,
      AK812: AK8 * (W1 * 2) + AK12 * (-3),
      AK913: AK9 * (W4 / DX) + AK13 * W4,

      TLT2: tilt * tilt,
      SPS: SPS, CPS: CPS,
      TPS: SPS / CPS, HTP: SPS / CPS * 0.5
    };
  },

  /* Allocatievrij: schrijft in `out` (array-achtige van 3) en geeft die terug.
     Het lichaam is regel voor regel de POC (igrf-globe-poc.html:1795-1945);
     alleen de aanhef is naar prepare() verhuisd. */
  fieldInto: function (pr, x, y, z, out) {
    var A02 = pr.A02, XLW2 = pr.XLW2, RT = pr.RT, XD = pr.XD;
    var XLD2 = pr.XLD2, SXC = pr.SXC, XLWC2 = pr.XLWC2;
    var HA02 = pr.HA02, RDYC2 = pr.RDYC2, HLWC2M = pr.HLWC2M;
    var DRDYC2 = pr.DRDYC2, HXLW2M = pr.HXLW2M, HXLD2M = pr.HXLD2M;
    var DX = pr.DX;
    var ADR = pr.ADR, D0 = pr.D0, DD = pr.DD, RC = pr.RC, G = pr.G, AT = pr.AT;
    var DT = pr.DT, DEL = pr.DEL, P = pr.P, Q = pr.Q, SX = pr.SX, GAM = pr.GAM;
    var DBLDEL = pr.DBLDEL;
    var AK1 = pr.AK1, AK2 = pr.AK2, AK3 = pr.AK3, AK4 = pr.AK4, AK5 = pr.AK5;
    var AK6 = pr.AK6, AK7 = pr.AK7, AK8 = pr.AK8, AK9 = pr.AK9, AK10 = pr.AK10;
    var AK11 = pr.AK11, AK12 = pr.AK12, AK13 = pr.AK13, AK14 = pr.AK14;
    var AK15 = pr.AK15, AK16 = pr.AK16, AK17 = pr.AK17;
    var AK610 = pr.AK610, AK711 = pr.AK711, AK812 = pr.AK812, AK913 = pr.AK913;
    var TLT2 = pr.TLT2, SPS = pr.SPS, CPS = pr.CPS, HTP = pr.HTP;

    var X = x, Y = y, Z = z;
    var X2 = X * X, Y2 = Y * Y, Z2 = Z * Z;
    var XSM = X * CPS - Z * SPS;
    var ZSM = X * SPS + Z * CPS;

    // Vorm van de gewarpte staartstroomlaag
    var XRC = XSM + RC;
    var SXRC = Math.sqrt(XRC * XRC + 16);
    var Y4 = Y2 * Y2, Y410 = Y4 + 1e4;
    var SY4 = SPS / Y410, GSY4 = G * SY4;
    var ZS1 = HTP * (XRC - SXRC);
    var DZSX = -ZS1 / SXRC;
    var ZS = ZS1 - GSY4 * Y4;
    var D2ZSGY = -SY4 / Y410 * 4e4 * Y2 * Y;
    var DZSY = G * D2ZSGY;

    // Ringstroom
    var XSM2 = XSM * XSM;
    var DSQT = Math.sqrt(XSM2 + A02);
    var FA0 = 0.5 * (1 + XSM / DSQT);
    var DDR = D0 + DD * FA0;
    var DFA0 = HA02 / (DSQT * DSQT * DSQT);
    var ZR = ZSM - ZS;
    var TR = Math.sqrt(ZR * ZR + DDR * DDR);
    var RTR = 1 / TR;
    var RO2 = XSM2 + Y2;
    var ADRT = ADR + TR, ADRT2 = ADRT * ADRT;
    var FK = 1 / (ADRT2 + RO2);
    var FC = FK * FK * Math.sqrt(FK);
    var FACXY = 3 * ADRT * FC * RTR;
    var XZR = XSM * ZR, YZR = Y * ZR;
    var DBXDP = FACXY * XZR;
    var DER25 = FACXY * YZR;
    var XZYZ = XSM * DZSX + Y * DZSY;
    var FAQ = ZR * XZYZ - DDR * DD * DFA0 * XSM;
    var DBZDP = FC * (2 * ADRT2 - RO2) + FACXY * FAQ;
    var DER15 = DBXDP * CPS + DBZDP * SPS;
    var DER35 = DBZDP * CPS - DBXDP * SPS;

    // Staartstroomlaag
    var DELY2 = DEL * Y2;
    var D = DT + DELY2;
    var ADSL = 0;
    if (Math.abs(GAM) >= 1e-6) {
      var XXD = XSM - XD;
      var RQD = 1 / (XXD * XXD + XLD2);
      var RQDS = Math.sqrt(RQD);
      var H = 0.5 * (1 + XXD * RQDS);
      var HS = -HXLD2M * RQD * RQDS;
      D = D + GAM * H;
      ADSL = -D * (XSM * GAM * HS);
    }
    var D2 = D * D;
    var T = Math.sqrt(ZR * ZR + D2);
    var XSMX = XSM - SX;
    var RDSQ2 = 1 / (XSMX * XSMX + XLW2);
    var RDSQ = Math.sqrt(RDSQ2);
    var V = 0.5 * (1 - XSMX * RDSQ);
    var DVX = HXLW2M * RDSQ * RDSQ2;
    var OM = Math.sqrt(Math.sqrt(XSM2 + 16) - XSM);
    var OMS = -OM / (OM * OM + XSM) * 0.5;
    var RDY = 1 / (P + Q * OM);
    var OMSV = OMS * V;
    var RDY2 = RDY * RDY;
    var FY = 1 / (1 + Y2 * RDY2);
    var W = V * FY;
    var YFY1 = 2 * FY * Y2 * RDY2;
    var FYPR = YFY1 * RDY;
    var FYDY = FYPR * FY;
    var DWX = DVX * FY + FYDY * Q * OMSV;
    var YDWY = -V * YFY1 * FY;
    var DDY = DBLDEL * Y;
    var ATT = AT + T;
    var S1 = Math.sqrt(ATT * ATT + RO2);
    var F5 = 1 / S1;
    var F7 = 1 / (S1 + ATT);
    var F1 = F5 * F7;
    var F3 = F5 * F5 * F5;
    var F9 = ATT * F3;
    var FS = ZR * XZYZ - D * Y * DDY + ADSL;
    var XDWX = XSM * DWX + YDWY;
    var RTT = 1 / T;
    var WT = W * RTT;
    var BRRZ1 = WT * F1, BRRZ2 = WT * F3;
    var DBXC1 = BRRZ1 * XZR, DBXC2 = BRRZ2 * XZR;
    var DER21 = BRRZ1 * YZR, DER22 = BRRZ2 * YZR;
    var DER216 = DER21 * TLT2, DER217 = DER22 * TLT2;
    var WTFS = WT * FS;
    var DBZC1 = W * F5 + XDWX * F7 + WTFS * F1;
    var DBZC2 = W * F9 + XDWX * F1 + WTFS * F3;
    var DER11 = DBXC1 * CPS + DBZC1 * SPS;
    var DER12 = DBXC2 * CPS + DBZC2 * SPS;
    var DER31 = DBZC1 * CPS - DBXC1 * SPS;
    var DER32 = DBZC2 * CPS - DBXC2 * SPS;
    var DER116 = DER11 * TLT2, DER117 = DER12 * TLT2;
    var DER316 = DER31 * TLT2, DER317 = DER32 * TLT2;

    // Sluitstromen
    var ZPL = Z + RT, ZMN = Z - RT;
    var ROGSM2 = X2 + Y2;
    var SPL = Math.sqrt(ZPL * ZPL + ROGSM2);
    var SMN = Math.sqrt(ZMN * ZMN + ROGSM2);
    var XSXC = X - SXC;
    var RQC2 = 1 / (XSXC * XSXC + XLWC2);
    var RQC = Math.sqrt(RQC2);
    var FYC = 1 / (1 + Y2 * RDYC2);
    var WC = 0.5 * (1 - XSXC * RQC) * FYC;
    var DWCX = HLWC2M * RQC2 * RQC * FYC;
    var DWCY = DRDYC2 * WC * FYC * Y;
    var SZRP = 1 / (SPL + ZPL);
    var SZRM = 1 / (SMN - ZMN);
    var XYWC = X * DWCX + Y * DWCY;
    var WCSP = WC / SPL, WCSM = WC / SMN;
    var FXYP = WCSP * SZRP, FXYM = WCSM * SZRM;
    var FXPL = X * FXYP, FXMN = -X * FXYM;
    var FYPL = Y * FXYP, FYMN = -Y * FXYM;
    var FZPL = WCSP + XYWC * SZRP;
    var FZMN = WCSM + XYWC * SZRM;
    var DER13 = FXPL + FXMN;
    var DER14 = (FXPL - FXMN) * SPS;
    var DER23 = FYPL + FYMN;
    var DER24 = (FYPL - FYMN) * SPS;
    var DER33 = FZPL + FZMN;
    var DER34 = (FZPL - FZMN) * SPS;

    // Chapman-Ferraro en Birkeland-bijdrage
    var EX = Math.exp(X / DX);
    var EC = EX * CPS, ES = EX * SPS;
    var ECZ = EC * Z, ESZ = ES * Z;
    var ESZY2 = ESZ * Y2, ESZZ2 = ESZ * Z2;
    var ECZ2 = ECZ * Z, ESY = ES * Y;

    var SX1 = AK6 * ECZ + AK7 * ES + AK8 * (ESY * Y) + AK9 * (ESZ * Z);
    var SY1 = AK10 * (ECZ * Y) + AK11 * ESY + AK12 * (ESY * Y2) + AK13 * (ESY * Z2);
    var SZ1 = AK14 * EC + AK15 * (EC * Y2) + AK610 * ECZ2 + AK711 * ESZ
            + AK812 * ESZY2 + AK913 * ESZZ2;

    var BXCL = AK3 * DER13 + AK4 * DER14;
    var BYCL = AK3 * DER23 + AK4 * DER24;
    var BZCL = AK3 * DER33 + AK4 * DER34;

    var BXT = AK1 * DER11 + AK2 * DER12 + BXCL + AK16 * DER116 + AK17 * DER117;
    var BYT = AK1 * DER21 + AK2 * DER22 + BYCL + AK16 * DER216 + AK17 * DER217;
    var BZT = AK1 * DER31 + AK2 * DER32 + BZCL + AK16 * DER316 + AK17 * DER317;

    out[0] = BXT + AK5 * DER15 + SX1;
    out[1] = BYT + AK5 * DER25 + SY1;
    out[2] = BZT + AK5 * DER35 + SZ1;
    return out;
  },

  /* Dezelfde handtekening als de POC, zodat test-terra/core.js de twee
     rechtstreeks naast elkaar kan leggen. Bereidt per aanroep voor en is dus
     traag; de tracer gebruikt prepare() + fieldInto(). */
  _f: new Float64Array(3),
  field: function (iopt, tilt, x, y, z) {
    var o = this.fieldInto(this.prepare(iopt, tilt), x, y, z, this._f);
    return { x: o[0], y: o[1], z: o[2] };
  }
};


/* ---------- 6. Vectorhulp ------------------------------------------------ */

function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y,
           y: a.z * b.x - a.x * b.z,
           z: a.x * b.y - a.y * b.x };
}

/* Math.hypot en niet sqrt, met opzet: norm() valt twee keer per rebuild (de
   GSM-basis) en nooit in de tracer. Zie de noot bij IGRF.fieldGeoInto voor
   waar de afweging wél de andere kant op valt. */
function norm(a) {
  var L = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / L, y: a.y / L, z: a.z / L };
}

function geoPoint(latDeg, lonDeg, rRe) {
  var la = latDeg * Math.PI / 180, lo = lonDeg * Math.PI / 180;
  return { x: rRe * Math.cos(la) * Math.cos(lo),
           y: rRe * Math.cos(la) * Math.sin(lo),
           z: rRe * Math.sin(la) };
}


/* ---------- 7. Frames ---------------------------------------------------- */
/* Alles wordt getraceerd in het Earth-fixed frame omdat IGRF daar leeft, en
   daarna naar GSM geroteerd omdat de zonnewind dáár leeft. */

var Frames = {

  decimalYear: function (date) {
    var y = date.getUTCFullYear();
    var start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1);
    return y + (date.getTime() - start) / (end - start);
  },

  julianDay: function (date) { return date.getTime() / 86400000 + 2440587.5; },

  gmst: function (date) {
    var d = this.julianDay(date) - 2451545.0;
    return ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24 * 15 * Math.PI / 180;
  },

  /* Zonspositie met lage precisie, goed tot ongeveer een honderdste graad —
     ver onder wat deze tekening kan oplossen. */
  sunEci: function (date) {
    var d = this.julianDay(date) - 2451545.0;
    var g = ((357.529 + 0.98560028 * d) % 360) * Math.PI / 180;
    var q = (280.459 + 0.98564736 * d) % 360;
    var lambda = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * Math.PI / 180;
    var eps = this.obliquity(date);
    return { x: Math.cos(lambda),
             y: Math.cos(eps) * Math.sin(lambda),
             z: Math.sin(eps) * Math.sin(lambda) };
  },

  obliquity: function (date) {
    return (23.439 - 0.00000036 * (this.julianDay(date) - 2451545.0)) * Math.PI / 180;
  },

  /* Inertiaal naar Earth-fixed: de GMST-spin, en verder niets. */
  eciToFixed: function (v, date) {
    var th = this.gmst(date), c = Math.cos(th), s = Math.sin(th);
    return { x: v.x * c + v.y * s, y: -v.x * s + v.y * c, z: v.z };
  },

  sunGeo: function (date) { return this.eciToFixed(this.sunEci(date), date); },

  /* GSM-basis uitgedrukt in Earth-fixed coördinaten.
     X naar de Zon, Z in het vlak van X en de dipoolas. */
  gsmBasis: function (date, dipoleAxis) {
    var X = norm(this.sunGeo(date));
    var M = dipoleAxis;
    var Y = norm(cross(M, X));
    if (!Number.isFinite(Y.x)) Y = { x: 0, y: 1, z: 0 };
    var Z = cross(X, Y);
    var tilt = Math.asin(Math.max(-1, Math.min(1, dot(M, X))));
    return { X: X, Y: Y, Z: Z, tilt: tilt };
  },

  toGsm: function (p, basis) {
    return { x: dot(p, basis.X), y: dot(p, basis.Y), z: dot(p, basis.Z) };
  },

  /* DE INVERSE, MET EEN NAAM. In de POC staat deze niet als functie maar
     uitgeschreven binnen Geometry.build (igrf-globe-poc.html:6098-6102) — de
     enige plek die hem nodig had. Zodra de worker meedoet zijn dat er twee, en
     twee kopieën van een frametransformatie is precies hoe een ruimtevaartuig
     hier ooit 145° van zijn baan belandde.

     De basisvectoren zijn Earth-fixed uitgedrukt, dus een GSM-vector
     terugbrengen is een gewogen som van de drie. */
  fromGsm: function (v, basis) {
    return {
      x: v.x * basis.X.x + v.y * basis.Y.x + v.z * basis.Z.x,
      y: v.x * basis.X.y + v.y * basis.Y.y + v.z * basis.Z.y,
      z: v.x * basis.X.z + v.y * basis.Y.z + v.z * basis.Z.z
    };
  },

  /* De basis als negen getallen, in rijvolgorde X,Y,Z. Dit is wat over de
     threadgrens gaat en wat de aarde-matrix in de scene wordt: toGsm(p) is
     precies deze matrix maal p, dus de rotatie hoeft nergens per punt te
     gebeuren. */
  basisArray: function (basis) {
    return [basis.X.x, basis.X.y, basis.X.z,
            basis.Y.x, basis.Y.y, basis.Y.z,
            basis.Z.x, basis.Z.y, basis.Z.z];
  },

  basisFromArray: function (a) {
    return { X: { x: a[0], y: a[1], z: a[2] },
             Y: { x: a[3], y: a[4], z: a[5] },
             Z: { x: a[6], y: a[7], z: a[8] } };
  }
};


/* ---------- 8. Registratie ----------------------------------------------- */
/* De meridian-view is orthografisch en exact omkeerbaar, en dat is de enige
   eigenschap in dit project die tot op de pixel te controleren is. Daarom
   staat hij hier als PURE functie van een view-object, en niet in de
   renderlaag: de Three.js-frustum wordt hieruit AFGELEID, nooit andersom.

   view = { w, h, dist, sunLeft, targetX, targetZ }   (w,h in CSS-pixels)

   Geport uit igrf-globe-poc.html:5118-5180, waar dezelfde formules op het
   Camera-object stonden. De afleiding, nagerekend en niet aangenomen:

     az = +pi/2, el = 0  ->  right = (-1,0,0), up = (0,0,1)
     schermX = w/2 - (p.x - targetX) * pxPerRe
     schermY = h/2 - (p.z - targetZ) * pxPerRe

   Een Three.js OrthographicCamera op target + (0,dist,0) met up = (0,0,1)
   krijgt exact dezelfde right en up, en met de frustum uit frustum() hieronder
   dezelfde pixels. */

var Registration = {

  /* Pixels per aardstraal. Eén uitdrukking, gelezen door de camera, het
     raster en de uitlezing, zodat die niet uit elkaar kunnen lopen. */
  pxPerRe: function (view) { return view.h / (view.dist * 0.9); },

  /* Het teken dat bepaalt welke kant +X GSM op loopt. Dit is het getal waar
     een registratie zonder waardeloos is, en het was ooit impliciet. */
  xSign: function (view) { return view.sunLeft ? -1 : 1; },

  /* Waar de GSM-oorsprong op het scherm valt.

     LET OP HET TEKEN VOOR targetX. De POC rekent schermX = w/2 + rx*schaal met
     rx = dot(p - pos, right), en `right` klapt om met sunLeft: (-1,0,0) tegen
     (+1,0,0). Dus schermX = w/2 + xSign*(p.x - targetX)*schaal, en bij p.x = 0
     staat er MIN xSign*targetX.

     Dit stond er eerst als `+ targetX*s`, wat toevallig klopt zolang xSign -1
     is — en de POC pant target.z altijd op 0 en staat standaard op sunLeft, dus
     geen enkele bestaande meting had het kunnen laten zien. De veeg over beide
     conventies in test-terra/core.js liet het in één keer omvallen, 300 px mis. */
  originPx: function (view) {
    var s = this.pxPerRe(view);
    return { x: view.w / 2 - this.xSign(view) * (view.targetX || 0) * s,
             y: view.h / 2 + (view.targetZ || 0) * s };
  },

  pxToRe: function (view, px, py) {
    var o = this.originPx(view), s = this.pxPerRe(view);
    return { x: this.xSign(view) * (px - o.x) / s, z: -(py - o.y) / s };
  },

  reToPx: function (view, x, z) {
    var o = this.originPx(view), s = this.pxPerRe(view);
    return { x: o.x + this.xSign(view) * x * s, y: o.y - z * s };
  },

  /* De orthografische frustum in Re, waaruit de Three.js-camera wordt gezet.
     De hoogte is per constructie dist * 0,9 — hetzelfde getal als pxPerRe
     omkeert — en dát is wat stap 3 toetst. */
  frustum: function (view) {
    var s = this.pxPerRe(view);
    return { left: -(view.w / 2) / s, right: (view.w / 2) / s,
             top: (view.h / 2) / s, bottom: -(view.h / 2) / s,
             heightRe: view.h / s, widthRe: view.w / s };
  },

  /* Alles wat een externe afbeelding nodig heeft om op deze tekening te
     passen. Zonder het teken zijn de twee getallen erboven dubbelzinnig, en
     dubbelzinnig is precies wat deze view overbodig moet maken. */
  publish: function (view) {
    var o = this.originPx(view), px = this.pxPerRe(view);
    var sign = this.xSign(view), halfX = (view.w / 2) / px;
    var tx = view.targetX || 0;
    return {
      frame: "GSM",
      plane: "X-Z (noon-midnight meridian)",
      projection: "orthographic",
      pixelsPerRe: px,
      originPx: { x: o.x, y: o.y },
      xAxisScreen: view.sunLeft ? "+X GSM naar links" : "+X GSM naar rechts",
      zAxisScreen: "+Z GSM omhoog",
      xSign: sign,
      formula: "x_Re = " + (sign < 0 ? "-" : "") + "(px_x - " + o.x.toFixed(1)
             + ") / " + px.toFixed(3) + " ; z_Re = -(px_y - " + o.y.toFixed(1)
             + ") / " + px.toFixed(3),
      extentRe: {
        xMin: tx - halfX, xMax: tx + halfX,
        zHalf: (view.h / 2) / px,
        atScreenLeft: tx + (sign < 0 ? halfX : -halfX),
        atScreenRight: tx + (sign < 0 ? -halfX : halfX)
      }
    };
  }
};


/* ---------- 8b. De GOES-triad -------------------------------------------- */
/* Het instrument meet in zijn EIGEN drietal, niet in GSM en niet in Earth-fixed
   cartesische componenten. Om de externe restterm per component te kunnen
   uitrekenen moet het interne veld dus eerst naar dat drietal toe.

   Geport uit igrf-globe-poc.html:1540-1559, en met opzet niet opnieuw
   afgeleid — de POC heeft dit uitgezocht en er staat waarom:

     Hp   parallel aan de spin-as, dus noordwaarts        ->  z-dak
     He   aardwaarts, langs -r                            -> -r-dak
     Hn   completeert een RECHTSHANDIG stelsel, He x Hn = Hp
                                                          -> -phi-dak, WESTWAARTS

   Het teken van Hn is het enige hier dat gemakkelijk omgekeerd wordt en
   onmogelijk te zien is; de POC schrijft dat zelf op. Vandaar dat de toets in
   test-terra/core.js hem niet alleen tegen de POC houdt maar ook tegen de
   kruisproductregel, die van BUITEN beide ports komt.

   Op een baan met inclinatie nul is de spin-as de geografische z-as, dus het
   hele drietal ligt vast door de LENGTEGRAAD alleen.

   Waarom drie componenten de moeite waard zijn, ook in de woorden van de POC:
   Hp reageert op de ringstroom, He op compressie van de dagzijde, Hn op de
   staartstroomlaag. En scherper nog, als toets: een GEOMETRIEFOUT blaast EEN
   component op, een MODELFOUT spreidt over alle drie. Die asymmetrie ving ooit
   de lengtegraadfout, met He 74 nT mis naast Hp 2 nT. */

var Goes = {

  triad: function (lonDeg) {
    var lo = lonDeg * Math.PI / 180;
    var rx = Math.cos(lo), ry = Math.sin(lo);          // r-dak
    var px = -Math.sin(lo), py = Math.cos(lo);         // phi-dak
    return {
      He: { x: -rx, y: -ry, z: 0 },
      Hn: { x: -px, y: -py, z: 0 },
      Hp: { x: 0, y: 0, z: 1 }
    };
  },

  /* Een Earth-fixed cartesisch veld op het instrumentdrietal projecteren. */
  toInstrument: function (bGeo, lonDeg) {
    var t = this.triad(lonDeg);
    return {
      He: dot(bGeo, t.He),
      Hn: dot(bGeo, t.Hn),
      Hp: dot(bGeo, t.Hp)
    };
  },

  /* De externe restterm: gemeten min intern, per component.

     De aftrekking is EXACT — het interne veld op 6,618 Re is Earth-fixed en
     verandert met ~0,0002 nT per dag — dus de restterm erft alleen
     instrumentfout. Alles wat hierin beweegt is extern veld: ringstroom,
     staartstroom, magnetopauzestromen.

     Een component die het instrument niet leverde komt terug als null en niet
     als nul. Dat onderscheid is de hele reden dat data.js NaN->null saniteert:
     nul is een meting. */
  residual: function (row, lonDeg, coeff, nmax) {
    var p = geoPoint(0, lonDeg, CONST.GEOSTATIONARY_RE);
    var b = IGRF.fieldGeo(p, coeff, nmax === undefined ? 13 : nmax);
    var internal = this.toInstrument(b, lonDeg);
    var out = {};
    var names = ["Hp", "He", "Hn"];
    for (var i = 0; i < names.length; i++) {
      var k = names[i];
      out[k] = Number.isFinite(row[k]) ? row[k] - internal[k] : null;
    }
    out.internal = internal;
    return out;
  }
};


/* ---------- 9. De omgeving van één moment -------------------------------- */
/* In de POC is dit `traceEnv` (igrf-globe-poc.html:6153): een object van
   LEVENDE CLOSURES, uitgedeeld en nooit herbouwd, precies zodat Geometry.build
   en Geometry.openEdge niet van mening kunnen verschillen over wat "open"
   betekent. Twee kopieën van die vraag zouden bij de eerste wijziging uit
   elkaar lopen.

   Closures overleven geen structuredClone, en de tracer verhuist naar een
   worker. Dus wordt het een PURE FUNCTIE van een serialiseerbare spec. Beide
   threads roepen hem aan: de worker om te tracen, de hoofdthread voor
   shape.radiusAt (het getekende oppervlak) en shape.inside (de uitlezingen).

   Eén spec per moment, één functie van spec naar omgeving — dat is dezelfde
   regel als de POC's traceEnv, uitgedrukt over een threadgrens, en hij is
   toetsbaar: elke lijn die de worker `open` noemde moet buiten shape.inside()
   liggen zoals de HOOFDthread hem evalueert. */

var Env = {

  /* spec, precies zoals hij over de draad gaat:
       { epochMs, year, basis[9], tilt, field:{iopt}, boundary:{r0,alpha},
         seeds:{lonDeg[], lats[] | (latFrom,latTo,shells), hemis[], seedR},
         trace:{maxR, minR, steps, dsA, dsB, dsMax},
         emit:{tolCoef, maxPts} }  */
  of: function (spec) {
    var b = spec.basis;
    var t = spec.trace || {};
    var e = spec.emit || {};
    var hasField = !!(spec.field && Number.isFinite(spec.field.iopt));
    var hasBound = !!(spec.boundary && Number.isFinite(spec.boundary.r0));

    return {
      spec: spec,
      coeff: IGRF.atYear(spec.year),
      prep: hasField ? T89.prepare(spec.field.iopt, spec.tilt) : null,

      /* De basis als negen losse getallen. Als array-index zou elke aanroep
         een bounds-check kosten in een lus die ~320.000 keer valt; als velden
         van een object met vaste vorm leest V8 ze uit een inline cache. */
      b0: b[0], b1: b[1], b2: b[2],
      b3: b[3], b4: b[4], b5: b[5],
      b6: b[6], b7: b[7], b8: b[8],

      shape: hasBound ? Boundary.shape(spec.boundary.r0, spec.boundary.alpha) : null,

      /* "tail" als reden bestaat alleen onder een grens die DIVERGEERT: diep in
         de staart heeft Shue geen oppervlak meer om te kruisen. Onder een
         eindige grens verdwijnt de reden en is een maxR-treffer eerlijk
         "range". v1 heeft alleen Shue, dus de vlag staat vast — maar hij staat
         er, want het is een eigenschap van het oppervlak en niet van v1. */
      tailX: (hasBound && !Boundary.shape(spec.boundary.r0, spec.boundary.alpha).finiteTail)
             ? -20 : null,

      maxR: Number.isFinite(t.maxR) ? t.maxR : CONST.MODEL_MAX_RE,
      minR: Number.isFinite(t.minR) ? t.minR : 1.0,
      steps: Number.isFinite(t.steps) ? t.steps : 4000,
      dsA: Number.isFinite(t.dsA) ? t.dsA : 0.02,
      dsB: Number.isFinite(t.dsB) ? t.dsB : 0.06,
      dsMax: Number.isFinite(t.dsMax) ? t.dsMax : 0.35,

      tolCoef: Number.isFinite(e.tolCoef) ? e.tolCoef : 0.004,
      maxPts: Number.isFinite(e.maxPts) ? e.maxPts : 1024
    };
  }
};


/* ---------- 10. De tracer ------------------------------------------------- */
/* Vierde-orde Runge-Kutta langs de veldrichting. De stap groeit met de
   afstand, want ver weg verandert het veld traag.

   DRIE EINDES, niet twee, en dat onderscheid is het hele punt:

     closed      de lijn kwam terug op het oppervlak. Beide voeten op aarde.
     open        de lijn kruiste de magnetopauze. Verbonden met de zonnewind,
                 en de enige route waarlangs een deeltje kan neerslaan.
     unresolved  de integratie liep uit de ruimte (maxR) of uit de stappen
                 voordat een van beide gebeurde.

   Een eerdere versie van de POC gaf "open" terug voor het maxR-geval, en dat
   is fout overal waar de magnetopauze voorbij maxR ligt. In de staart is dat
   altijd zo: bij r0 = 12,5 Re passeert het Shue-oppervlak 40 Re op 90 graden
   van de neus en divergeert daarna. Elf van dertien lijnen die "open" heetten
   waren lange gesloten staartlijnen, afgekapt op 30 Re — en de open fractie,
   de poolkaprand en elk auroraal voetpunt schoven mee.

   "unresolved" wordt met opzet niet in een van beide emmers gevouwen. Het is
   een uitspraak over de INTEGRATIE en niet over de magnetosfeer.

   WAT HIER ANDERS IS DAN DE POC: geen enkele allocatie. De POC maakt ~8
   objecten per integratiestap (igrf-globe-poc.html:4859-4919) — één uit dir(),
   drie uit step(), één punt, één push, plus de heen-en-weer van het externe
   veld. Bij ~250 stappen x 80 lijnen zijn dat ~160.000 objecten per rebuild.
   Hier staan scalaire locals en één vooraf gealloceerde buffer.

   En de punten komen er in GSM uit, niet in Earth-fixed. De POC roteert
   achteraf met res.pts.map(toGsm) (6167) en dupliceert daarmee elke
   puntenreeks; hier gebeurt de rotatie in de lus die de GSM-coördinaten toch
   al nodig heeft — voor de grenstoets, voor tailward en voor trackY. */

var ENDING = { CLOSED: 0, OPEN: 1, UNRESOLVED: 2 };
var WHY = { NONE: 0, TAIL: 1, RANGE: 2, STEPS: 3, CAPPED: 4 };
var WHY_NAME = ["", "tail", "range", "steps", "capped"];

var Trace = {
  ENDING: ENDING, WHY: WHY, WHY_NAME: WHY_NAME,

  /* Kladruimte voor één lijn, in GSM. 4096 punten is ruim boven de 4000
     stappen die de spec toestaat; groeit mee als iemand steps verhoogt. */
  _cap: 4096,
  _pts: new Float64Array(3 * 4096),
  _b: new Float64Array(3),
  _e: new Float64Array(3),
  _k: new Float64Array(12),

  _grow: function (n) {
    if (n <= this._cap) return;
    this._cap = n;
    this._pts = new Float64Array(3 * n);
  },

  /* De veldrichting in het EARTH-FIXED frame, genormaliseerd en van teken
     voorzien. Schrijft in out[0..2]. Vier keer per RK4-stap. */
  _dir: function (env, x, y, z, sign, out) {
    var r = Math.sqrt(x * x + y * y + z * z);
    var nmax = r < 1.4 ? 13 : r < 2.2 ? 8 : r < 4 ? 5 : 3;
    var b = this._b;
    IGRF.fieldGeoInto(x, y, z, env.coeff, nmax, b);

    if (env.prep) {
      /* IGRF leeft Earth-fixed, T89 leeft in GSM, dus elk monsterpunt maakt de
         rondreis. In de POC is dit een closure die vier objecten per aanroep
         maakt (6097-6105); hier zijn het achttien vermenigvuldigingen. */
      var gx = x * env.b0 + y * env.b1 + z * env.b2;
      var gy = x * env.b3 + y * env.b4 + z * env.b5;
      var gz = x * env.b6 + y * env.b7 + z * env.b8;
      var e = this._e;
      T89.fieldInto(env.prep, gx, gy, gz, e);
      b[0] += e[0] * env.b0 + e[1] * env.b3 + e[2] * env.b6;
      b[1] += e[0] * env.b1 + e[1] * env.b4 + e[2] * env.b7;
      b[2] += e[0] * env.b2 + e[1] * env.b5 + e[2] * env.b8;
    }

    var L = Math.sqrt(b[0] * b[0] + b[1] * b[1] + b[2] * b[2]) || 1;
    var s = sign / L;
    out[0] = b[0] * s; out[1] = b[1] * s; out[2] = b[2] * s;
  },

  /* Traceert één lijn vanaf een Earth-fixed startpunt. De punten komen in
     _pts te staan, in GSM. Geeft het verslag terug — één object per lijn, dus
     80 per rebuild, wat geen hete lus is. */
  line: function (env, sx, sy, sz, sign) {
    this._grow(env.steps + 8);
    var pts = this._pts, k = this._k;
    var shape = env.shape;
    var maxR = env.maxR, minR = env.minR;
    var dsA = env.dsA, dsB = env.dsB, dsMax = env.dsMax;
    var tailX = env.tailX;

    var px = sx, py = sy, pz = sz;
    var n = 0, maxAbsY = 0, lengthRe = 0, reach = 0;
    var pgx = 0, pgy = 0, pgz = 0;
    var lastGx = 0, lastGy = 0, lastGz = 0;
    var ending = ENDING.UNRESOLVED, why = WHY.STEPS;

    for (var i = 0; i < env.steps; i++) {
      var r = Math.sqrt(px * px + py * py + pz * pz);

      // GSM, één keer per stap, en meteen de drie lezers die hem nodig hebben
      pgx = px * env.b0 + py * env.b1 + pz * env.b2;
      pgy = px * env.b3 + py * env.b4 + pz * env.b5;
      pgz = px * env.b6 + py * env.b7 + pz * env.b8;

      var o = n * 3;
      pts[o] = pgx; pts[o + 1] = pgy; pts[o + 2] = pgz;
      if (n > 0) {
        var dx = pgx - lastGx, dy = pgy - lastGy, dz = pgz - lastGz;
        lengthRe += Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      lastGx = pgx; lastGy = pgy; lastGz = pgz;
      n++;

      var ay = pgy < 0 ? -pgy : pgy;
      if (ay > maxAbsY) maxAbsY = ay;
      if (r > reach) reach = r;

      if (i > 2 && r < minR) { ending = ENDING.CLOSED; why = WHY.NONE; break; }

      /* Een lijn die de magnetopauze verlaat is open naar de zonnewind. Dit is
         de ENIGE toets die "open" oplevert; afstand alleen nooit. */
      if (shape && r > 2 && !shape.inside(pgx, pgy, pgz)) {
        ending = ENDING.OPEN; why = WHY.NONE; break;
      }

      if (r > maxR) {
        ending = ENDING.UNRESOLVED;
        why = (tailX !== null && pgx < tailX) ? WHY.TAIL : WHY.RANGE;
        break;
      }

      var ds = dsA + dsB * (r - 1);
      if (ds > dsMax) ds = dsMax;

      this._dir(env, px, py, pz, sign, k);
      var k1x = k[0], k1y = k[1], k1z = k[2];
      var h = ds * 0.5;
      this._dir(env, px + k1x * h, py + k1y * h, pz + k1z * h, sign, k);
      var k2x = k[0], k2y = k[1], k2z = k[2];
      this._dir(env, px + k2x * h, py + k2y * h, pz + k2z * h, sign, k);
      var k3x = k[0], k3y = k[1], k3z = k[2];
      this._dir(env, px + k3x * ds, py + k3y * ds, pz + k3z * ds, sign, k);
      var k4x = k[0], k4y = k[1], k4z = k[2];

      var w = ds / 6;
      px += w * (k1x + 2 * k2x + 2 * k3x + k4x);
      py += w * (k1y + 2 * k2y + 2 * k3y + k4y);
      pz += w * (k1z + 2 * k2z + 2 * k3z + k4z);
    }

    return { n: n, ending: ending, why: why,
             maxAbsY: maxAbsY, lengthRe: lengthRe, reachRe: reach };
  },

  /* Decimatie: de stapgrootte van de tracer is gekozen voor INTEGRATIENAUW-
     KEURIGHEID, niet om te tekenen. Bij r = 1 is ds = 0,02 Re, wat bij de
     gebruikelijke kadrering een kwart pixel is.

     Elk weggelaten punt ligt binnen tol(r) = tolCoef * max(r,1) Re van het
     koorde dat het vervangt — en dat is een GARANTIE, geen benadering: de lus
     controleert alle overgeslagen punten tegen het koorde dat ze zou
     vervangen, niet alleen het laatste. test-terra/protocol.js meet het na.

     Het plafond weigert in plaats van stil af te kappen. Een afgekapte
     veldlijn die als compleet wordt getekend is precies de faalvorm die dit
     project blijft benoemen, dus een lijn die maxPts raakt komt terug met
     why = capped en het paneel meldt hem. */
  decimate: function (pts, n, tolCoef, maxPts, out, outOffset) {
    if (n <= 0) return 0;
    var m = 0;
    function emit(i) {
      var s = i * 3, d = (outOffset + m) * 3;
      out[d] = pts[s]; out[d + 1] = pts[s + 1]; out[d + 2] = pts[s + 2];
      m++;
    }
    emit(0);
    if (n === 1) return 1;

    var last = 0;
    for (var j = 1; j < n - 1; j++) {
      // past het koorde last -> j+1 nog over alles wat ertussen ligt?
      var ax = pts[last * 3], ay = pts[last * 3 + 1], az = pts[last * 3 + 2];
      var bx = pts[(j + 1) * 3], by = pts[(j + 1) * 3 + 1], bz = pts[(j + 1) * 3 + 2];
      var ex = bx - ax, ey = by - ay, ez = bz - az;
      var ell = ex * ex + ey * ey + ez * ez;
      var over = false;
      for (var q = last + 1; q <= j; q++) {
        var qx = pts[q * 3] - ax, qy = pts[q * 3 + 1] - ay, qz = pts[q * 3 + 2] - az;
        var t = ell > 1e-18 ? (qx * ex + qy * ey + qz * ez) / ell : 0;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        var dx = qx - ex * t, dy = qy - ey * t, dz = qz - ez * t;
        var dev = Math.sqrt(dx * dx + dy * dy + dz * dz);
        var rq = Math.sqrt(pts[q * 3] * pts[q * 3] + pts[q * 3 + 1] * pts[q * 3 + 1]
                         + pts[q * 3 + 2] * pts[q * 3 + 2]);
        if (dev > tolCoef * (rq > 1 ? rq : 1)) { over = true; break; }
      }
      if (over) {
        emit(j); last = j;
        if (m >= maxPts - 1) break;                 // ruimte houden voor het laatste
      }
    }
    emit(n - 1);
    return m;
  }
};


/* ---------- 11. De geometrie van één moment ------------------------------ */
/* Wat de worker per rebuild teruggeeft, in de vorm waarin de GPU het wil:
   CSR — één platte positiebuffer plus een offsettabel. Variabele-lengte
   polylijnen passen niet in een rechthoekige array, en een array van arrays
   is geen transferable. */

var Build = {

  /* De seed-lengtegraden. In de meridian-view zitten de zaden op de
     noon-midnight-meridiaan (2 lengtegraden), in 3D op acht vaste
     geografische meridianen. Dat verschil is DATA en geen tak in de code:
     het staat in de spec, en de worker weet niet welke camera er kijkt. */
  seedLatitudes: function (from, to, shells) {
    var lats = [], k = Math.max(shells - 1, 1);
    for (var i = 0; i < shells; i++) lats.push(from + i * ((to - from) / k));
    return lats;
  },

  /* DE LADDER MAG ONGELIJK ZIJN, en sinds sessie 28 is hij dat ook. Een spec
     die `seeds.lats` draagt wint van from/to/shells; die twee blijven bestaan
     voor wie een gelijke ladder wil (test-terra/trace.js vergelijkt zo met de
     POC, die alleen de gelijke vorm kent).

     WAAROM. Gemeten over zes windstanden, met een raster van één graad in
     plaats van het seed-raster zelf — anders meet je je eigen keuze:

       windstand            eerste open   half open   heel open   (noord)
       noordwaarts rustig        70°          81°         85°
       nul-Bz                    69°          80°         87°
       licht zuidwaarts          66°          78°         88°
       zuidwaarts                64°          76°          —
       storm                     61°          70°          —
       zware storm               60°          68°          —

     Twee dingen staan daarin. Ten eerste is de rand geen LIJN maar een ZONE:
     het aandeel open lijnen loopt over twintig graden van nul naar één, en de
     hele zone schuift met de wind mee. Ten tweede lag de oude ladder
     (52-58-64-70-76) er grotendeels ONDER — onder 60 graden is bij elke stand
     behalve een zware storm alles dicht, dus drie van de vijf schillen zeiden
     bij vrijwel elk weer hetzelfde, en bij rustige wind stond er geen enkele
     volledig open lijn in beeld. */
  /* DE ZADEN, ALS ÉÉN PLATTE LIJST van (breedte, lengte, halfrond)-drietallen.

     Zolang elke schil dezelfde lengtegraden kreeg was dit een drievoudige lus
     ter plekke. Sinds sessie 28 mag het AANTAL lengtegraden per schil
     verschillen, en dan is de zaadlijst een uitspraak die apart te toetsen is
     in plaats van een lusvolgorde.

     WAAROM HET AANTAL MEEBEWEEGT MET DE BREEDTE. Acht vaste meridianen op elke
     schil klinkt gelijkmatig maar is het niet: de omtrek van een breedtecirkel
     krimpt met cos(breedte), dus dezelfde acht zaden komen naar de pool toe
     steeds dichter op elkaar te staan. Gemeten op de ladder 56-66-72-78-84:

       breedte   omtrek      afstand tussen 8 zaden   relatief
         56°     3,514 Re          0,439 Re            1,00x
         66°     2,556            0,319               0,73x
         72°     1,942            0,243               0,55x
         78°     1,306            0,163               0,37x
         84°     0,657            0,082               0,19x

     Bij 84 graden staan ze VIJF KEER zo dicht als bij 56, en dat zijn precies
     de lange open lijnen die de staart in lopen — acht bijna identieke bogen
     naast elkaar. Terry, sessie 28, over het 3D-beeld: "de lange bogen lijken
     er alleen erg veel, vooral aan de bovenkant." Dat was geen fysica maar
     bemonstering.

     Voor GELIJKE zaadafstand geeft de meting 8-6-4-3-2. De vloer is 4 en niet
     2: de poolkaprand is de laagste breedte waar ÉÉN van de lengtegraden
     opengaat, dus met twee zaden per schil kan een open sector tussen de zaden
     door vallen en meldt de app een rand die er niet is. Vandaar 8-6-4-4-4 —
     van 80 lijnen naar 52 in 3D, en wat wegvalt zijn de dubbelingen.

     ELKE TWEEDE SCHIL EEN HALVE STAP VERSPRONGEN. Zonder dat vallen 78 en 84
     (allebei vier zaden) precies boven elkaar en ontstaan er spaken. */
  seedList: function (lats, lons, hemis, lonN) {
    var out = [], i, j, k, n, off;
    /* Zonder lonN krijgt elke schil dezelfde lengtegraden, en dan blijft de
       volgorde die van de oude drievoudige lus: lengte buiten, breedte binnen.
       Niet uit netheid — test-terra/trace.js legt onze lijnen één voor één naast
       die van de POC, en een andere volgorde zou daar als een andere
       magnetosfeer lezen. */
    if (!(lonN && lonN.length)) {
      for (j = 0; j < lons.length; j++)
        for (i = 0; i < lats.length; i++)
          for (k = 0; k < hemis.length; k++)
            out.push(lats[i], lons[j], hemis[k]);
      return out;
    }
    for (i = 0; i < lats.length; i++) {
      n = Math.max(1, lonN[Math.min(i, lonN.length - 1)]);
      off = (i % 2) * (180 / n);
      for (j = 0; j < n; j++) {
        var lon = (off + j * 360 / n) % 360;
        for (k = 0; k < hemis.length; k++) out.push(lats[i], lon, hemis[k]);
      }
    }
    return out;
  },

  seedStepAt: function (lats, lat) {
    if (!lats || lats.length < 2 || lat === null || lat === undefined) return null;
    var best = null, bestD = Infinity, i;
    for (i = 0; i < lats.length; i++) {
      var d = Math.abs(Math.abs(lats[i]) - Math.abs(lat));
      if (d < bestD) { bestD = d; best = i; }
    }
    /* De stap RONDOM die sport, en de grootste van de twee buren: dat is de
       afstand waarover de rand had kunnen wegvallen zonder dat we het zagen.
       De kleinste nemen zou de kwantisering optimistischer melden dan ze is. */
    var links = best > 0 ? Math.abs(lats[best] - lats[best - 1]) : null;
    var rechts = best < lats.length - 1 ? Math.abs(lats[best + 1] - lats[best]) : null;
    if (links === null) return rechts;
    if (rechts === null) return links;
    return Math.max(links, rechts);
  },

  run: function (spec) {
    var t0 = (typeof performance !== "undefined" && performance.now)
             ? performance.now() : Date.now();
    var env = Env.of(spec);
    var s = spec.seeds;
    var lats = s.lats && s.lats.length
             ? s.lats
             : this.seedLatitudes(s.latFrom, s.latTo, s.shells);
    var lons = s.lonDeg, hemis = s.hemis;
    var zaden = this.seedList(lats, lons, hemis, s.lonN);
    var nLines = zaden.length / 3;

    var cap = nLines * env.maxPts;
    var pos = new Float32Array(cap * 3);
    var dist = new Float32Array(cap);
    var start = new Uint32Array(nLines + 1);
    var ending = new Uint8Array(nLines);
    var why = new Uint8Array(nLines);
    var seedLat = new Float32Array(nLines);
    var seedLon = new Float32Array(nLines);
    var hemi = new Int8Array(nLines);

    var tally = { open: 0, closed: 0, unresolved: 0, tailBlind: 0, capped: 0 };
    var maxAbsY = 0, ys = [];
    var lenTotal = 0, lenPast = 0, crossers = 0, reach = 0;
    var GEO = CONST.GEOSTATIONARY_RE;

    var li = 0, cursor = 0;
    {
      {
        for (var c = 0; c < nLines; c++) {
          var h = zaden[c * 3 + 2];               // +1 noord, -1 zuid
          /* Noordelijke voetpunten tracen tegen het veld in, zuidelijke ermee
             mee, want het veld gaat het noordelijk halfrond IN en het
             zuidelijke UIT. Zonder de zuidelijke set is er geen zuidelijke
             aurora. */
          var sign = h > 0 ? -1 : 1;
          var p = geoPoint(h * zaden[c * 3], zaden[c * 3 + 1], s.seedR);

          start[li] = cursor;
          var res = Trace.line(env, p.x, p.y, p.z, sign);
          var m = Trace.decimate(Trace._pts, res.n, env.tolCoef, env.maxPts, pos, cursor);

          // booglengte langs de GETEKENDE lijn, voor de streepjes
          for (var q = 0; q < m; q++) {
            var idx = cursor + q;
            if (q === 0) { dist[idx] = 0; continue; }
            var dx = pos[idx * 3] - pos[(idx - 1) * 3];
            var dy = pos[idx * 3 + 1] - pos[(idx - 1) * 3 + 1];
            var dz = pos[idx * 3 + 2] - pos[(idx - 1) * 3 + 2];
            dist[idx] = dist[idx - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz);
          }

          ending[li] = res.ending;
          why[li] = (m >= env.maxPts && res.ending === ENDING.UNRESOLVED)
                    ? WHY.CAPPED : res.why;
          if (why[li] === WHY.CAPPED) tally.capped++;
          seedLat[li] = h * zaden[c * 3];
          seedLon[li] = zaden[c * 3 + 1];
          hemi[li] = h;

          if (res.ending === ENDING.CLOSED) tally.closed++;
          else if (res.ending === ENDING.OPEN) tally.open++;
          else { tally.unresolved++; if (res.why === WHY.TAIL) tally.tailBlind++; }

          if (res.maxAbsY > maxAbsY) maxAbsY = res.maxAbsY;
          ys.push(res.maxAbsY);
          if (res.reachRe > reach) reach = res.reachRe;

          /* DE VALIDATIEHORIZON, in dezelfde geest als maxAbsY: de tekening die
             meet waar zij niet voor kan instaan. Elke onafhankelijke meting die
             dit project van het veld heeft zit op GEOSTATIONARY_RE — twee
             satellieten op één schil, in 24 uur volledig rond in lokale tijd
             maar NOOIT in straal. De eerlijke vraag is dus niet "hoe goed is
             het model" maar "hoeveel van wat er staat ligt voorbij het laatste
             dat het kan tegenspreken".

             Berekend, nooit ingetypt. Het getal beweegt met Kp en pdyn — 59,3 %
             tegen 59,5 % op twee opeenvolgende geometrieën in de POC — en een
             hardgecodeerd cijfer uit één run zou op de volgende fout zijn en er
             nog steeds gezaghebbend uitzien. */
          var crossed = false;
          for (var w = cursor + 1; w < cursor + m; w++) {
            var ax = pos[(w - 1) * 3], ay2 = pos[(w - 1) * 3 + 1], az = pos[(w - 1) * 3 + 2];
            var bx2 = pos[w * 3], by2 = pos[w * 3 + 1], bz2 = pos[w * 3 + 2];
            var ra = Math.sqrt(ax * ax + ay2 * ay2 + az * az);
            var rb = Math.sqrt(bx2 * bx2 + by2 * by2 + bz2 * bz2);
            var d = Math.sqrt((bx2 - ax) * (bx2 - ax) + (by2 - ay2) * (by2 - ay2)
                            + (bz2 - az) * (bz2 - az));
            lenTotal += d;
            if ((ra + rb) / 2 > GEO) lenPast += d;
            if ((ra - GEO) * (rb - GEO) < 0) crossed = true;
          }
          if (crossed) crossers++;

          cursor += m;
          li++;
        }
      }
    }
    start[nLines] = cursor;

    ys.sort(function (x, y) { return x - y; });
    var t1 = (typeof performance !== "undefined" && performance.now)
             ? performance.now() : Date.now();

    return {
      seq: spec.seq,
      /* HAD DEZE BOUW EEN GRENS? Reist mee met de geometrie en niet met de
         toestand, want die twee lopen uit elkaar: de scene rekent elk frame en
         de lijnen komen ~30 ms later binnen. Kleuren op de HUIDIGE r0 terwijl
         de lijnen van een vorige spec zijn, zou een topologie tonen die bij
         andere lijnen hoort — precies de stille vorm van fout waar de
         een-oppervlak-regel voor bestaat. Zonder grens is er geen open/dicht:
         `ending` bevat dan alleen CLOSED en UNRESOLVED, en dat laatste woord
         betekent hier iets anders dan in de legenda. */
      bounded: !!env.shape,
      nLines: nLines, nPts: cursor,
      pos: pos, dist: dist, start: start,
      ending: ending, why: why,
      seedLat: seedLat, seedLon: seedLon, hemi: hemi,
      tally: tally,
      polarCap: this.polarCap(nLines, ending, why, seedLat, hemi, s),
      horizon: lenTotal > 0 ? {
        at: GEO, beyondPct: lenPast / lenTotal * 100,
        lengthRe: lenTotal, reachRe: reach, crossers: crossers, lines: nLines
      } : null,
      maxAbsY: maxAbsY,
      medianAbsY: ys.length ? ys[Math.floor(ys.length / 2)] : 0,
      costMs: t1 - t0
    };
  },

  /* De poolkaprand wordt niet ingetekend maar AFGELEZEN: de laagste gezaaide
     breedte waarvan de veldlijn de magnetopauze echt kruist.

     Alleen "open" telt. Een onopgeloste lijn is er één die de integrator niet
     kon indelen, en die hier laten meestemmen is wat een rand tientallen graden
     te ver naar de evenaar opleverde. Onopgeloste lijnen ONDER de laagste open
     lijn maken de rand niet ongeldig maar wel onscherp, en dat aantal reist
     mee in plaats van te verdwijnen.

     GEKWANTISEERD DOOR HET SEED-RASTER, en v1 zegt dat. De POC bisecteert de
     rand met lib/openedge.js; die bisectie had drie consumenten — de
     OVATION-gap, de entry-band en de plasma sheet — en die gaan geen van
     drieën mee. Zonder consument geen bisectie; wel de stapgrootte melden. */
  polarCap: function (nLines, ending, why, seedLat, hemi, seeds) {
    var out = {};
    /* DE STAP IS LOKAAL SINDS DE LADDER ONGELIJK IS. Tot sessie 28 stond hier
       (latTo - latFrom) / (shells - 1), en dat klopte zolang de sporten gelijk
       verdeeld waren. Op een ladder van 56-66-72-78-84 zou diezelfde som 7
       melden terwijl de rand op een sport ligt waar de afstand tot zijn buren 6
       is, of 10 als hij onderaan valt — een kwantisering die niet die van de
       gevonden rand is. Zie Build.seedStepAt: de grootste van de twee buren,
       want dat is de afstand waarover de rand had kunnen wegvallen. */
    var lats = seeds.lats && seeds.lats.length
             ? seeds.lats
             : (seeds.shells > 1
                ? Build.seedLatitudes(seeds.latFrom, seeds.latTo, seeds.shells)
                : null);
    for (var hi = 0; hi < 2; hi++) {
      var h = hi === 0 ? 1 : -1;
      var lowestOpen = null, ambiguous = 0, tailBlind = 0, nOpen = 0;
      for (var i = 0; i < nLines; i++) {
        if (hemi[i] !== h) continue;
        if (ending[i] === ENDING.OPEN) {
          nOpen++;
          var la = Math.abs(seedLat[i]);
          if (lowestOpen === null || la < lowestOpen) lowestOpen = la;
        }
      }
      for (var j = 0; j < nLines; j++) {
        if (hemi[j] !== h || ending[j] !== ENDING.UNRESOLVED) continue;
        if (lowestOpen === null || Math.abs(seedLat[j]) < lowestOpen) {
          ambiguous++;
          if (why[j] === WHY.TAIL) tailBlind++;
        }
      }
      out[h] = { edge: lowestOpen, nOpen: nOpen, ambiguous: ambiguous,
                 tailBlind: tailBlind,
                 seedStep: Build.seedStepAt(lats, lowestOpen) };
    }
    return out;
  }
};


/* ---------- 12. Constanten met een herkomst ------------------------------ */

var CONST = {
  /* Geostationaire baan in IGRF-referentiestralen. De enige straal waarop dit
     project het veld MEET — twee GOES-satellieten — en daarmee het getal
     waartegen de validatiehorizon wordt uitgedrukt. */
  GEOSTATIONARY_RE: 42164.2 / 6371.2,
  EARTH_RADIUS_KM: 6371.2,

  /* De rand van T89's geldigheid. Verder tracen levert getallen op waar het
     model niets over zegt. */
  MODEL_MAX_RE: 70
};


/* ---------- export ------------------------------------------------------- */

var Core = {
  VERSION: "v1-step2",
  IGRF: IGRF,
  IGRF_TABLE: IGRF_TABLE,
  Physics: Physics,
  Boundary: Boundary,
  Aurora: Aurora,
  Flow: Flow,
  T89: T89,
  T89_PARAM: T89_PARAM,
  Frames: Frames,
  Registration: Registration,
  Goes: Goes,
  Env: Env,
  Trace: Trace,
  Build: Build,
  ENDING: ENDING,
  WHY: WHY,
  WHY_NAME: WHY_NAME,
  CONST: CONST,
  dot: dot, cross: cross, norm: norm, geoPoint: geoPoint,

  /* De acht buffers die als transferable over de draad gaan. Eén lijst, gelezen
     door de worker (postMessage) en door de hoofdthread (recycle), zodat er
     nooit een buffer bij komt die de een wel en de ander niet overdraagt. */
  TRANSFERABLES: ["pos", "dist", "start", "ending", "why",
                  "seedLat", "seedLon", "hemi"],

  buffersOf: function (msg) {
    var out = [];
    for (var i = 0; i < this.TRANSFERABLES.length; i++) {
      var b = msg[this.TRANSFERABLES[i]];
      if (b && b.buffer) out.push(b.buffer);
    }
    return out;
  }
};

if (typeof module === "object" && module.exports) module.exports = Core;
else root.TerraCore = Core;

})(typeof globalThis !== "undefined" ? globalThis : this);
