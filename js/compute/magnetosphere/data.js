/* =========================================================================
   terra/data.js — wat Terra v1 ophaalt, en verder niets.

   De POC heeft ~3.000 regels netwerk verspreid over Net + acht clients +
   Feeds + UI. v1 heeft er DRIE nodig, en dat is de hele strip in één tabel:

     propagated solar wind   drijft pdyn, Bz, By, Bt, de sector
     planetary Kp            drijft de T89-band, en dus de geometrie
     GOES magnetometer       de ENIGE meting waar het model tegenaan ligt

   Wat er NIET in zit, met de reden erbij: Dst (voedde alleen T96, en die gaat
   weg), Enlil en de Kp-outlook (v1 stopt bij nu), OVATION, de grondmagneto-
   meters (INTERMAGNET is CC-BY-NC), ACE EPAM/SIS, de protonkanalen en de
   röntgenreeks. Die blijven in de POC, waar ze gescoord worden.

   UMD, net als terra/core.js — zodat node hem kan lezen.
   ========================================================================= */

;(function (root) {
"use strict";

var HOST = "https://services.swpc.noaa.gov";

/* ---------- 1. De fetchlaag ---------------------------------------------- */

var Net = {
  TTL_MS: 60000,
  _hit: {},
  _inflight: {},
  nonNumbers: {},

  /* SWPC serveert af en toe letterlijke NaN in JSON, wat geen geldige JSON is
     en het hele document doodt — gezien op rtsw_wind_1m.json, acht stuks in
     een bestand van 2,6 MB. Deze scan (geen regex: string-literalen moeten
     worden overgeslagen) maakt er null van en NOOIT nul. Nul is een meting,
     null is de afwezigheid ervan, en het verschil is precies waar dit project
     over gaat.

     Het aantal wordt geteld en niet weggegooid: een bron die dit doet, doet
     het morgen weer, en dan hoor je het te weten. */
  sanitize: function (text) {
    var out = "", i = 0, n = text.length, hits = 0;
    while (i < n) {
      var ch = text[i];
      if (ch === '"') {                       // string-literal in één keer door
        var j = i + 1;
        while (j < n) {
          if (text[j] === "\\") { j += 2; continue; }
          if (text[j] === '"') { j++; break; }
          j++;
        }
        out += text.slice(i, j); i = j; continue;
      }
      if (ch === "N" && text.substr(i, 3) === "NaN") { out += "null"; i += 3; hits++; continue; }
      if (ch === "I" && text.substr(i, 8) === "Infinity") { out += "null"; i += 8; hits++; continue; }
      if (ch === "-" && text.substr(i, 9) === "-Infinity") { out += "null"; i += 9; hits++; continue; }
      out += ch; i++;
    }
    return { text: out, nonNumbers: hits };
  },

  json: function (url, label) {
    var self = this, now = Date.now();
    var hit = this._hit[url];
    if (hit && now - hit.at < this.TTL_MS) return Promise.resolve(hit.body);
    if (this._inflight[url]) return this._inflight[url];

    var p = fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(label + ": HTTP " + r.status);
      return r.text();
    }).then(function (text) {
      var s = self.sanitize(text);
      if (s.nonNumbers) self.nonNumbers[url] = s.nonNumbers;
      var body;
      try {
        body = JSON.parse(s.text);
      } catch (e) {
        /* De ORIGINELE tekst citeren, niet de gerepareerde: anders wijst de
           foutmelding naar iets wat de bron nooit heeft gestuurd. */
        throw new Error(label + ": geen geldige JSON — " + text.slice(0, 120));
      }
      self._hit[url] = { at: Date.now(), body: body };
      delete self._inflight[url];
      return body;
    }).catch(function (e) {
      delete self._inflight[url];
      throw e;
    });

    this._inflight[url] = p;
    return p;
  }
};

/* Tijdstempels. ACE laat de Z weg en JavaScript leest zo'n string dan in de
   tijdzone van de MACHINE — op een Nederlandse zomermachine twee uur mis. Geen
   ACE in v1, maar de regel blijft: nooit een stempel aannemen zonder zone. */
function parseTimeTag(raw) {
  if (!raw) return null;
  var iso = String(raw).trim().replace(" ", "T");
  if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso)) iso += "Z";
  var d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/* ---------- 2. De gepropageerde zonnewind -------------------------------- */
/* Dezelfde L1-metingen, elk monster verplaatst naar het moment waarop dat
   pakket de magnetosfeer bereikt (SWPC's propagatie, ~40-70 min later). Geen
   forecast: een METING die zijn reistijd meedraagt.

   Daarmee staat de zonnewind op dezelfde fysische klok als alles
   magnetosferisch — en die klok is de reden dat één playhead één moment
   betekent.

   Parser regel voor regel als igrf-globe-poc.html:1389-1432, inclusief de
   bereikcontroles en de `num()` die van `+null === 0` af blijft. */

var Wind = {
  url: HOST + "/products/geospace/propagated-solar-wind.json",

  parse: function (payload) {
    if (!Array.isArray(payload) || payload.length < 2) return null;
    var H = payload[0];
    function col(n) { return H.indexOf(n); }
    var iT = col("time_tag"), iA = col("propagated_time_tag");
    var iV = col("speed"), iN = col("density"), iTe = col("temperature");
    var iBy = col("by"), iBz = col("bz"), iBt = col("bt"), iBx = col("bx");
    if ([iT, iA, iV, iN, iTe, iBy, iBz, iBt, iBx].some(function (i) { return i < 0; })) return null;

    /* DE SNELHEIDSVECTOR IS OPTIONEEL EN STAAT MET OPZET NIET IN DE LIJST
       HIERBOVEN. De feed draagt vx/vy/vz vandaag mee, maar `speed` is de
       grootheid waar de app op rekent — valt de vector morgen weg, dan hoort
       de magnetosfeer gewoon door te tekenen en niet de hele reeks te
       verliezen. Zonder vector valt de aanstroomrichting terug op de zonlijn,
       precies wat v1 altijd al deed. */
    var iVx = col("vx"), iVy = col("vy"), iVz = col("vz");
    var heeftVec = iVx >= 0 && iVy >= 0 && iVz >= 0;

    /* Unary + is een val: `+null` is 0, dus een ontbrekende component zou als
       een veld van precies nul binnenkomen en door elke bereikcontrole
       hieronder glippen. Voor bx zou dat lezen als "precies op de sectorgrens"
       — onbeslisbaar om de verkeerde reden. */
    function num(raw) {
      return (raw === null || raw === undefined || raw === "") ? NaN : +raw;
    }

    var rows = [], travels = [];
    for (var k = 1; k < payload.length; k++) {
      var r = payload[k];
      var meas = parseTimeTag(r[iT]), arr = parseTimeTag(r[iA]);
      if (!meas || !arr) continue;
      var v = num(r[iV]), n = num(r[iN]), t = num(r[iTe]);
      var by = num(r[iBy]), bz = num(r[iBz]), bt = num(r[iBt]), bx = num(r[iBx]);
      // Het 7-daagse bestand bevat sentinelrijen. Een onwaarschijnlijke rij
      // wordt WEGGEGOOID en niet gerepareerd.
      if (!(v >= 100 && v <= 3000 && n > 0 && n <= 1000 && bt >= 0 && bt < 300
            && Math.abs(by) < 300 && Math.abs(bz) < 300 && Math.abs(bx) < 300)) continue;
      var travelMin = (arr.getTime() - meas.getTime()) / 60000;
      if (travelMin < 10 || travelMin > 240) continue;
      /* De vector heeft zijn EIGEN bereikcontrole en gooit de rij niet weg:
         een onbruikbare component kost de richting, niet de meting. Vandaar
         null en niet NaN — zie de noot bij num(). */
      var vx = heeftVec ? num(r[iVx]) : NaN;
      var vy = heeftVec ? num(r[iVy]) : NaN;
      var vz = heeftVec ? num(r[iVz]) : NaN;
      var vecOk = Math.abs(vx) < 3000 && Math.abs(vy) < 3000 && Math.abs(vz) < 3000;
      rows.push({ time: arr.getTime(), measured: meas.getTime(), travelMin: travelMin,
                  v: v, n: n, t: t, bx: bx, by: by, bz: bz, bt: bt,
                  vx: vecOk ? vx : null, vy: vecOk ? vy : null,
                  vz: vecOk ? vz : null });
      travels.push(travelMin);
    }
    if (!rows.length) return null;
    rows.sort(function (a, b) { return a.time - b.time; });
    travels.sort(function (a, b) { return a - b; });
    return { rows: rows, medianTravelMin: travels[Math.floor(travels.length / 2)] };
  },

  read: function () {
    var self = this;
    return Net.json(this.url, "propagated solar wind").then(function (p) {
      var r = self.parse(p);
      if (!r) throw new Error("propagated solar wind: onleesbaar");
      return r;
    });
  }
};

/* ---------- 3. Planetaire Kp ---------------------------------------------- */
/* T89 heeft maar één getal nodig, maar het is niet zomaar een getal: de band
   is floor(Kp)+1, dus elke hele Kp die gepasseerd wordt VERSPRINGT de
   geometrie. Daarom staat Kp in v1 op het scherm en niet alleen in de code.

   NIET het minuutproduct. `estimated_kp` daarin is de lopende sommatie binnen
   het huidige blok van drie uur en springt bij elke blokgrens terug naar 0 —
   gemeten op de feed zelf: 14:59 gaf 1,33 en 15:00:00 gaf 0,00. Wie dat als
   een fijnere Kp leest, tekent een zaagtand waar de index vlak is, en laat de
   T89-band met die zaagtand meestappen. */

var KpIndex = {
  url: HOST + "/products/noaa-planetary-k-index.json",
  BLOCK_MS: 3 * 3600e3,

  /* TWEE VORMEN, en dat is gemeten en niet gegokt. SWPC serveert sommige
     producten als [headerrij, ...datarijen] en andere als een lijst objecten.
     De gepropageerde wind is het eerste, dit product het tweede — gecontroleerd
     op de feed zelf: payload[0] is {time_tag, Kp, a_running, station_count}.

     Een parser die één vorm aanneemt valt om met `H.indexOf is not a function`,
     wat precies is wat hier op de eerste live run gebeurde. Beide vormen dus,
     en de keuze wordt uit de payload afgeleid in plaats van uit de URL. */
  parse: function (payload) {
    if (!Array.isArray(payload) || !payload.length) return null;
    var rows = [], i, r, d, kp;

    if (Array.isArray(payload[0])) {              // [header, ...rijen]
      var H = payload[0];
      var iT = H.indexOf("time_tag"), iK = H.indexOf("Kp");
      var iF = H.indexOf("Kp_fraction");
      if (iT < 0) return null;
      for (i = 1; i < payload.length; i++) {
        r = payload[i];
        d = parseTimeTag(r[iT]);
        if (!d) continue;
        kp = (iF >= 0 && r[iF] !== null && r[iF] !== "") ? +r[iF]
           : (iK >= 0 ? +r[iK] : NaN);
        if (!Number.isFinite(kp)) continue;
        rows.push({ time: d.getTime(), kp: kp });
      }
    } else {                                      // lijst objecten
      for (i = 0; i < payload.length; i++) {
        r = payload[i];
        if (!r || typeof r !== "object") continue;
        d = parseTimeTag(r.time_tag);
        if (!d) continue;
        kp = (r.Kp_fraction !== undefined && r.Kp_fraction !== null)
           ? +r.Kp_fraction : +r.Kp;
        if (!Number.isFinite(kp)) continue;
        rows.push({ time: d.getTime(), kp: kp });
      }
    }

    if (!rows.length) return null;
    rows.sort(function (a, b) { return a.time - b.time; });
    return rows;
  },

  /* Kp is een STAPFUNCTIE: één waarde per blok van drie uur. De waarde die om
     14:30 geldt is die van het blok dat om 12:00 begon, niet een interpolatie
     tussen twee blokmiddens — dat zou een helling verzinnen die niemand heeft
     gemeten. */
  at: function (rows, time) {
    if (!rows || !rows.length) return null;
    var lo = 0, hi = rows.length - 1, best = null;
    if (time < rows[0].time - this.BLOCK_MS) return null;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (rows[mid].time <= time) { best = rows[mid]; lo = mid + 1; }
      else hi = mid - 1;
    }
    if (!best) return null;
    // Meer dan één blok oud is geen meting van dit moment meer
    if (time - best.time > this.BLOCK_MS * 1.5) return null;
    return best.kp;
  },

  blockStart: function (t) {
    return Math.floor(t / this.BLOCK_MS) * this.BLOCK_MS;
  },

  /* De blokken met hun HERKOMST, voor de Kp-lane.

     Het index-product draagt geen herkomstveld — de payload is {time_tag, Kp,
     a_running, station_count} en verder niets. lib/kp.js LEEST er wel een
     (`kind: row.observed`), maar dat komt uit het OUTLOOK-product, en dat is
     forecast: v1 stopt bij nu en haalt het niet op.

     Wat wel af te leiden is, en zonder iets te verzinnen, is de blokgrens
     tegen de wandklok. Daarmee zijn er DRIE toestanden in plaats van de vier
     die DATA-MATRIX.md voor de POC beschrijft:

       published  het blok is afgelopen en staat in de feed
       filling    het blok staat in de feed maar loopt nog -> ONDERGRENS, want
                  Kp is het maximum over drie uur en dat maximum kan alleen
                  omhoog
       absent     na het laatste gepubliceerde blok. De index loopt een paar uur
                  achter, dus de nieuwste 1 tot 4 uur van de aankomstklok heeft
                  er geen; T89.band valt daar terug op band 2 (huiswaarde)

     De vierde uit de POC — "voltooide schatting", halve dekking — bestaat hier
     niet, en de legenda zegt dat. Een ontbrekende toestand die nergens staat
     leest als een toestand die niet voorkomt. */
  blocks: function (rows, now, from, to) {
    if (!rows || !rows.length) return [];
    var out = [], i;
    var wall = now === undefined ? Date.now() : now;
    for (i = 0; i < rows.length; i++) {
      var t = this.blockStart(rows[i].time);
      if (to !== undefined && t > to) break;
      if (from !== undefined && t + this.BLOCK_MS < from) continue;
      out.push({
        time: t,
        kp: rows[i].kp,
        state: t + this.BLOCK_MS > wall ? "filling" : "published"
      });
    }

    /* De staart, en dit is de toestand die het gemakkelijkst ontbreekt: na het
       laatste blok zegt de bron NIETS, en dat is iets anders dan Kp nul. Het
       loopt door tot het einde van het venster, want de aankomstklok kijkt
       verder vooruit dan de index. */
    var last = out.length ? out[out.length - 1] : null;
    var edge = last ? last.time + this.BLOCK_MS : (from === undefined ? wall : from);
    if (to !== undefined) {
      for (var t2 = edge; t2 <= to; t2 += this.BLOCK_MS) {
        out.push({ time: t2, kp: null, state: "absent" });
      }
    }
    return out;
  },

  read: function () {
    var self = this;
    return Net.json(this.url, "planetary Kp").then(function (p) {
      var r = self.parse(p);
      if (!r) throw new Error("planetary Kp: onleesbaar");
      return r;
    });
  }
};

/* ---------- 4. GOES magnetometer ------------------------------------------ */
/* De ENIGE meting in deze app die BINNEN de magnetosfeer wordt gedaan, en
   daarmee het enige waar het externe veldmodel tegenaan ligt.

   De rol `primary` wordt PER PRODUCT toegewezen, dus welk toestel je leest
   verschilt per bestand. Het ruimtevaartuignummer komt daarom uit de payload
   en niet uit de map waarin hij stond.

   Lengtegraden worden gepubliceerd als graden WEST, POSITIEF. Letterlijk
   nemen zet het toestel 145 graden mis, op de verkeerde magnetische breedte en
   de verkeerde lokale tijd. Dat bleef onzichtbaar zolang alleen Hp werd
   gebruikt — de noordwaartse component op 6,6 Re trekt zich weinig van
   lengtegraad aan — en viel om zodra He erbij kwam: 74 nT mis op He naast
   2 nT op Hp. Een MODELFOUT spreidt over alle drie de componenten; een
   GEOMETRIEFOUT blaast er één op. Dat is wat de toets meet, en niet of het gat
   klein is. */

var Goes = {
  urlLon: HOST + "/json/goes/satellite-longitudes.json",
  urlMag: function (slot) {
    return HOST + "/json/goes/" + slot + "/magnetometers-7-day.json";
  },
  // Gepubliceerde slotposities, als de lengtegraadfeed wegvalt
  FALLBACK_LON: { 16: -75.2, 17: -137.2, 18: -137.0, 19: -75.0 },

  parseLon: function (payload) {
    var out = {};
    if (!Array.isArray(payload)) return out;
    for (var i = 0; i < payload.length; i++) {
      var r = payload[i];
      var sat = +String(r.satellite).replace(/\D/g, "");
      var lon = +r.longitude;
      // GEPUBLICEERD ALS GRADEN WEST, POSITIEF. Hier ontkend.
      if (Number.isFinite(sat) && Number.isFinite(lon)) out[sat] = -lon;
    }
    return out;
  },

  parseMag: function (payload) {
    if (!Array.isArray(payload) || !payload.length) return null;
    var rows = [], sat = null;
    for (var i = 0; i < payload.length; i++) {
      var r = payload[i];
      var d = parseTimeTag(r.time_tag);
      if (!d) continue;
      if (sat === null && r.satellite !== undefined) sat = +r.satellite;
      var Hp = r.Hp === null ? NaN : +r.Hp;
      var He = r.He === null ? NaN : +r.He;
      var Hn = r.Hn === null ? NaN : +r.Hn;
      if (!Number.isFinite(Hp) && !Number.isFinite(He) && !Number.isFinite(Hn)) continue;
      rows.push({ time: d.getTime(), Hp: Hp, He: He, Hn: Hn,
                  // Gemarkeerd, nooit verwijderd: als de standregelmotor vuurt
                  // meet de magnetometer de MOTOR. Weggooien zou een uitspraak
                  // zijn over wat de magnetosfeer deed, en die hebben we niet.
                  arcjet: !!r.arcjet_flag });
    }
    if (!rows.length) return null;
    rows.sort(function (a, b) { return a.time - b.time; });
    return { satellite: sat, rows: rows };
  },

  read: function () {
    var self = this;
    return Net.json(this.urlLon, "GOES longitudes").catch(function () { return null; })
      .then(function (lonPayload) {
        var lons = lonPayload ? self.parseLon(lonPayload) : {};
        return Promise.all(["primary", "secondary"].map(function (slot) {
          return Net.json(self.urlMag(slot), "GOES " + slot)
            .then(function (p) { return self.parseMag(p); })
            .catch(function () { return null; });
        })).then(function (both) {
          var out = [];
          for (var i = 0; i < both.length; i++) {
            var b = both[i];
            if (!b) continue;
            var lon = lons[b.satellite];
            if (!Number.isFinite(lon)) lon = self.FALLBACK_LON[b.satellite];
            if (!Number.isFinite(lon)) continue;
            // dubbele satelliet uit twee slots: één keer houden
            if (out.some(function (o) { return o.satellite === b.satellite; })) continue;
            out.push({ satellite: b.satellite, longitude: lon, rows: b.rows });
          }
          return out;
        });
      });
  },

  at: function (craft, time, tolMs) {
    var rows = craft.rows, tol = tolMs || 120000;
    if (!rows.length) return null;
    var lo = 0, hi = rows.length - 1, best = null;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (rows[mid].time <= time) { best = rows[mid]; lo = mid + 1; }
      else hi = mid - 1;
    }
    if (!best || time - best.time > tol) return null;
    return best;
  }
};

/* ---------- 5. De reeks --------------------------------------------------- */
/* Eén rij per minuut op de AANKOMSTKLOK. De GOES-lanes stoppen bij de
   wandklok, want de magnetosfeer is niet in de toekomst gemeten; de nieuwste
   ~40-70 minuten wind zijn wél gemeten maar nog ONDERWEG, en die staart draagt
   dat als eigenschap in plaats van als stilte. */

var Series = {
  build: function (wind, kpRows) {
    var rows = [];
    for (var i = 0; i < wind.rows.length; i++) {
      var w = wind.rows[i];
      rows.push({
        time: w.time, measuredAt: w.measured, travelMin: w.travelMin,
        v: w.v, n: w.n, t: w.t, bx: w.bx, by: w.by, bz: w.bz, bt: w.bt,
        vx: w.vx, vy: w.vy, vz: w.vz,
        kp: KpIndex.at(kpRows, w.time)
      });
    }
    return rows;
  },

  /* De kegelhoek waarboven Bx niets meer over de sector zegt. Gemeten in
     lib/sector.js (CONE_BAR_DEG), niet gekozen: dezelfde 1 nT Bx is
     beslissend in een veld van 1,5 nT en betekenisloos in een van 19, dus de
     drempel staat op de HOEK en niet op een aantal nT. */
  SECTOR_CONE_DEG: 86,

  /* ONBESLIST is een derde toestand en een WEIGERING, geen derde sector. */
  sectorAt: function (row) {
    if (!Number.isFinite(row.bx) || !Number.isFinite(row.bt) || !(row.bt > 0)) {
      return "onbeslist";
    }
    var cone = Math.acos(Math.min(1, Math.abs(row.bx) / row.bt)) * 180 / Math.PI;
    if (cone > this.SECTOR_CONE_DEG) return "onbeslist";
    return row.bx > 0 ? "naar de zon" : "van de zon af";
  },

  /* De drie grootheden die de lanes per SAMPLE nodig hebben.

     terra.html's stateAt() rekent deze drie al uit, maar doet er de hele
     frame-keten bij — IGRF.atYear, IGRF.dipole, Frames.gsmBasis, Frames.sunGeo —
     en dat is het werk voor EEN moment. De lanes hebben ze voor de hele reeks
     nodig en niets van die keten. Dit is dus een uitsnede en geen tweede
     berekening; test-terra/strip.js houdt beide wegen tegen elkaar, want twee
     paden naar hetzelfde getal is precies waar dit project uit elkaar loopt
     als niemand het vastzet.

     Physics komt als ARGUMENT binnen. data.js kent core.js niet en hoort dat
     ook niet te doen: dit bestand gaat over wat er binnenkomt, niet over wat
     het betekent. De afhankelijkheid staat zo bij de aanroeper, zichtbaar.

     EN HIER STAAT ÉÉN WEIGERING DIE DE FORMULE ZELF NIET KENT.

     Physics.dynamicPressure is `1,6726e-6 * n * v * v`, bit voor bit de POC,
     en dat blijft zo — een formule hoort geen invoervalidatie te dragen. Maar
     `null * v * v` is 0 in JavaScript, en `standoff(0, bz)` geeft 23,0 Re: een
     magnetosfeer twee keer zo groot als de grootste ooit gemeten, uit een
     ontbrekende dichtheidsmeting. Dat getal is niet fout gerekend, het is
     helemaal niet gemeten.

     De reeks weet iets wat de formule niet weet: of de meting er wás. Dus
     weigert hij hier, en dat is dezelfde regel die de sanitizer hierboven op
     de rauwe feed toepast — nooit nul waar niets stond.

     Gevolg dat benoemd hoort te worden: terra.html's stateAt() doet dit NIET
     en verzint op zo'n rij nog steeds een r0. De strip laat dat zien, want de
     r0-lane breekt daar en de scene niet. */
  derive: function (rows, Physics) {
    for (var i = 0; i < rows.length; i++) {
      var s = rows[i];
      s.pdyn = (Number.isFinite(s.n) && Number.isFinite(s.v))
             ? Physics.dynamicPressure(s.n, s.v) : null;
      s.r0 = (s.pdyn !== null && Number.isFinite(s.bz))
           ? Physics.standoff(s.pdyn, s.bz) : null;
      s.sector = this.sectorAt(s);
    }
    return rows;
  },

  /* Waar de METING ophoudt en de staart begint. Alles daarvoor is aangekomen;
     alles daarna is gemeten maar nog onderweg. */
  arrivedEnd: function (rows) {
    var now = Date.now();
    for (var i = rows.length - 1; i >= 0; i--) if (rows[i].time <= now) return i;
    return -1;
  },

  indexAt: function (rows, time) {
    var lo = 0, hi = rows.length - 1;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (rows[mid].time < time) lo = mid + 1; else hi = mid;
    }
    return lo;
  }
};

/* ---------- export -------------------------------------------------------- */

var Data = {
  HOST: HOST,
  Net: Net, Wind: Wind, KpIndex: KpIndex, Goes: Goes, Series: Series,
  parseTimeTag: parseTimeTag,

  /* Alles in één keer, met een per-bron uitkomst in plaats van alles-of-niets.
     Een gevallen feed is geen rustige magnetosfeer, dus een bron die wegvalt
     wordt BENOEMD en niet vervangen. */
  readAll: function () {
    var out = { wind: null, kp: null, goes: [], errors: [] };
    return Promise.all([
      Wind.read().then(function (w) { out.wind = w; },
                       function (e) { out.errors.push(String(e.message || e)); }),
      KpIndex.read().then(function (k) { out.kp = k; },
                          function (e) { out.errors.push(String(e.message || e)); }),
      Goes.read().then(function (g) { out.goes = g || []; },
                       function (e) { out.errors.push(String(e.message || e)); })
    ]).then(function () { return out; });
  }
};

if (typeof module === "object" && module.exports) module.exports = Data;
else root.TerraData = Data;

})(typeof globalThis !== "undefined" ? globalThis : this);
