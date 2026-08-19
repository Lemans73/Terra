/* =========================================================================
   terra/strip.js — de tijdlijn onder de scene.

   Zes lanes, en de vraag die ze samen beantwoorden is de enige die de 3D-scene
   niet kan stellen: WAAROM staat de magnetopauze daar? De scene toont één
   moment; de strip toont wat er aan dat moment vooraf ging, en in welke
   volgorde. Bz eerst, dan de druk, dan de grens die eruit volgt.

   Dit bouwt op lib/chart.js en herschrijft daar niets van. Dat is mogelijk
   omdat v1 GEEN FORECAST heeft: chart.js schrijft zelf op waarom de POC's
   Strip tóch zijn eigen draw() hield — hij draagt de naad, de zekerheids-
   klassen en de Kp-provenance van de outlook, en dat herschrijven zou het
   enige riskeren dat niet mag breken. Die reden vervalt hier. Wat overblijft
   is de tekentaal, en die staat er al.

   Twee lanes tekenen we zelf, en beide om dezelfde reden: een generieke lijn
   zou een uitspraak tekenen die niemand gemeten heeft.

     Kp        is een STAPFUNCTIE. Een lijn tussen blokmiddens verzint een
               helling van drie uur die niet bestaat.
     sector    is CATEGORISCH, met drie toestanden waarvan er één een
               weigering is. Onbeslist mag niet als derde kleur lezen.

   UMD, net als core.js en data.js — zodat node de spec kan toetsen zonder
   canvas. Dat is dezelfde splitsing die lib/chart.js maakt: het deel dat stil
   fout kan zijn is het deel dat getoetst wordt.
   ========================================================================= */

;(function (root) {
"use strict";

var BLOCK_MS = 3 * 3600e3;

/* ---------- 1. De lanes, als data ----------------------------------------

   Geen proza en geen code: label, klasse, gewicht, eenheid, kleursleutel en
   één `beyond`-zin. Precies de vorm die terra/registry.js (bouwstap 8) straks
   overneemt, zodat die verhuizing een verplaatsing is en geen herschrijving.

   `klasse` is dezelfde drieslag als het paneel: MEASURED wat een instrument
   zag, DERIVED wat daar rekenkundig uit volgt, MODEL wat een model beweert. */

var LANES = [
  { id: "bz", label: "Bz", unit: "nT GSM", klasse: "MEASURED",
    weight: 1.15, color: "ink",
    beyond: "geen zonnewind" },

  { id: "sector", label: "IMF-sector", unit: "", klasse: "MEASURED",
    weight: 0.40, color: "ink-dim",
    beyond: "geen Bx of Bt" },

  { id: "pdyn", label: "dyn. druk", unit: "nPa", klasse: "DERIVED",
    weight: 0.85, color: "derived",
    beyond: "geen dichtheid of snelheid" },

  { id: "r0", label: "standoff r₀", unit: "Re", klasse: "MODEL",
    weight: 0.95, color: "model",
    beyond: "geen model zonder wind" },

  { id: "goes", label: "GOES extern", unit: "nT", klasse: "MEASURED",
    weight: 1.25, color: "goes",
    /* DE BELANGRIJKSTE ZIN IN DEZE HELE STRIP. De wind-lanes lopen door tot
       voorbij de wandklok — die metingen zijn gedaan maar nog ONDERWEG — en
       de magnetosfeer is daar per definitie nog niet gemeten. Zonder deze
       arcering zou de rechterhelft van de tijdlijn lezen als een GOES die
       stilviel. */
    beyond: "de magnetosfeer is niet in de toekomst gemeten" },

  { id: "kp", label: "Kp", unit: "", klasse: "MEASURED",
    weight: 0.70, color: "measured",
    beyond: "index nog niet gepubliceerd · T89 valt terug op band 2" }
];

var KLASSE_KLEUR = { MEASURED: "measured", DERIVED: "derived", MODEL: "model" };

/* De drie sectortoestanden. `onbeslist` heeft met opzet GEEN kleur: hij wordt
   als arcering getekend, met dezelfde streepjes die chart.js gebruikt voor
   "voorbij de bron" — want het is dezelfde soort uitspraak. Een derde kleur
   zou hem tot derde sector maken. */
var SECTOR_TINT = { "naar de zon": "open", "van de zon af": "mp" };

/* ---------- 2. Runs ------------------------------------------------------ */

/* Aaneengesloten stukken van dezelfde toestand. Een categorische lane heeft
   ~10 runs waar hij 2.000 samples heeft, en het verschil is niet cosmetisch:
   één rechthoek per run in plaats van één per minuut is het verschil tussen
   een strip die binnen zijn tekenbudget blijft en een die dat niet doet.

   De run loopt door tot het BEGIN van het volgende sample, niet tot het
   laatste sample van de run zelf — anders ontstaat er een gat van één
   sample-interval bij elke wissel. */
function runsOf(rows, valueOf) {
  var out = [], i;
  var cur = null;
  for (i = 0; i < rows.length; i++) {
    var v = valueOf(rows[i]);
    if (cur && cur.v === v) { cur.to = rows[i].time; continue; }
    if (cur) cur.to = rows[i].time;
    cur = { v: v, from: rows[i].time, to: rows[i].time };
    out.push(cur);
  }
  return out;
}

/* Runs naar het puntenformaat dat chart.js' `bars` verwacht: een punt met een
   waarde opent de balk, het volgende punt sluit hem. Een NaN-punt op het einde
   van elke run is dus geen opvulling maar de sluiting. */
function runsToBars(runs, want, height) {
  var pts = [];
  for (var i = 0; i < runs.length; i++) {
    var mijn = runs[i].v === want;
    pts.push({ time: runs[i].from, v: mijn ? height : NaN });
    /* HET SLUITPUNT VAN DE LAATSTE RUN DRAAGT ZIJN WAARDE, en dat is geen
       detail: `coverageOf` leest het laatste EINDIGE punt, dus met NaN eindigde
       de dekking van deze lane waar de laatste sectorwissel BEGON. Gemeten op
       de live feed: 1.888 minuten — eenendertig uur sector gearceerd als
       "geen Bx of Bt", terwijl Bx en Bt daar gewoon gemeten waren en de sector
       de hele tijd besliste.

       Voor elke andere run moet het sluitpunt wél NaN zijn: dat is wat de balk
       sluit voordat de volgende toestand begint. */
    var laatste = i === runs.length - 1;
    pts.push({ time: runs[i].to, v: (laatste && mijn) ? height : NaN });
  }
  return pts;
}

/* ---------- 2b. De sector, met de hysterese van lib/sector.js -------------

   ELKE MINUUT ZIJN EIGEN TOESTAND GEVEN IS FOUT, en dat was op de eerste run
   meteen te zien: 704 runs over zeven dagen, waarvan 284 onbeslist. De lane
   was een streepjescode.

   lib/sector.js heeft dat uitgezocht en de reden opgeschreven: een onbeslist
   sample is "neither evidence for nor against" — het is geen derde sector maar
   een minuut waarin Bx niets zegt, en de sector blijft dus wat hij was. Een
   WISSEL telt pas als de nieuwe toestand `HOLD_MIN` besliste samples
   standhoudt.

   De twee getallen (86 graden, 120 minuten) zijn daar GEMETEN en niet gekozen:
   over cone 60-89 en hold 5-480 op het bevroren zevendaagse record is het
   aantal wissels vlak op zeven over cone 84-89 en hold 90-180 — twaalf
   roosterpunten, een factor 2 in hold en 6 graden in cone. Deze twee liggen in
   het midden van dat vlak. Zeven wissels, tegen mijn 704.

   Onbeslist verdwijnt daarmee niet uit beeld: het wordt een dichtheids-
   markering op de lane-vloer. Hoeveel van de tijd Bx niet beslissend was is
   een uitspraak over de METING; welke sector er gold is een uitspraak over de
   zonnewind. Twee dingen, twee tekens. */
function sectorRuns(rows, Sector) {
  var samples = [], i;
  for (i = 0; i < rows.length; i++) {
    samples.push({ time: rows[i].time, bx: rows[i].bx, bt: rows[i].bt });
  }
  var res = Sector.changes(samples, { coneBarDeg: Sector.CONE_BAR_DEG,
                                      holdMin: Sector.HOLD_MIN });
  if (!res) return { runs: [], undecided: [], changes: 0 };

  var NAAM = { toward: "naar de zon", away: "van de zon af" };

  /* De eerste besliste toestand geeft `changes` niet terug — hij wordt de
     eerste `settled` en die valt buiten de lijst. Hem opnieuw opzoeken is
     goedkoper dan sector.js aanpassen, en dat bestand blijft ongewijzigd. */
  var first = null, firstAt = rows.length ? rows[0].time : 0;
  for (i = 0; i < samples.length; i++) {
    var st = Sector.state(samples[i].bx, samples[i].bt, Sector.CONE_BAR_DEG);
    if (st.state !== "undecided") { first = st.state; firstAt = samples[i].time; break; }
  }

  var runs = [];
  var end = rows.length ? rows[rows.length - 1].time : firstAt;
  if (first === null) return { runs: [], undecided: undecidedRuns(rows, Sector),
                               changes: 0 };

  var cur = { v: NAAM[first], from: firstAt, to: end };
  runs.push(cur);
  for (i = 0; i < res.changes.length; i++) {
    cur.to = res.changes[i].time;
    cur = { v: NAAM[res.changes[i].to], from: res.changes[i].time, to: end };
    runs.push(cur);
  }

  return { runs: runs, undecided: undecidedRuns(rows, Sector),
           changes: res.changes.length, pending: res.pending };
}

/* De minuten waarin Bx niets zei, als aaneengesloten stukken. */
function undecidedRuns(rows, Sector) {
  var out = [], open = null;
  for (var i = 0; i < rows.length; i++) {
    var st = Sector.state(rows[i].bx, rows[i].bt, Sector.CONE_BAR_DEG);
    var und = st.state === "undecided";
    if (und && !open) open = { from: rows[i].time, to: rows[i].time };
    else if (und) open.to = rows[i].time;
    else if (open) { out.push(open); open = null; }
  }
  if (open) out.push(open);
  return out;
}

/* ---------- 2c. Decimatie, met de pieken erin ----------------------------

   Zeven dagen op een minuut is 10.013 samples op ~1.500 pixels: zeven metingen
   per pixel. chart.js lost dat op met `stride` — elk n-de punt — en dat is
   voor het TEKENEN genoeg, maar het gooit zes van de zeven metingen weg en
   daarmee elke piek die niet toevallig op een stride-index valt. Op de
   Bz-lane is dat precies het verkeerde verlies: een korte zuidwaartse piek is
   wat de koppeling drijft.

   En het is niet alleen de lijn. chart.js loopt per hertekening ELK punt af
   voor `coverageOf` en (zonder fixedScale) voor de as. Gemeten op deze week:
   90.276 punten, waarvan 60.090 in de GOES-lane, en die ene lane kostte 3,33
   van de 4,46 ms.

   Min/max per pixelkolom lost beide op en is NAUWKEURIGER dan wat er stond:
   per kolom overleven de twee extremen van alle samples erin, in tijdvolgorde,
   zodat de omhullende van de lijn exact blijft waar `stride` hem afvlakte.

   Twee dingen overleven altijd:
     - een kolom die alleen niet-eindige waarden bevat levert een niet-eindig
       punt op, zodat een GAT een gat blijft;
     - een gevlagd sample gaat mee ongeacht zijn waarde. De arcjet-vlag is een
       handvol minuten en betekent "hier meet de magnetometer de standregel-
       motor" — gemarkeerd, nooit verwijderd, en dus ook niet weggedecimeerd. */
function decimateMinMax(pts, targetPx) {
  var n = pts.length;
  if (n <= targetPx * 2 || targetPx < 2) return pts;
  var out = [];
  var span = n / targetPx;
  for (var b = 0; b < targetPx; b++) {
    var i0 = Math.floor(b * span);
    var i1 = Math.min(Math.floor((b + 1) * span), n);
    if (i1 <= i0) continue;
    var lo = -1, hi = -1, loV = Infinity, hiV = -Infinity, eindig = false;
    for (var i = i0; i < i1; i++) {
      var v = pts[i].v;
      if (pts[i].flag === true) out.push(pts[i]);
      if (!(v === v) || v === Infinity || v === -Infinity) continue;
      eindig = true;
      if (v < loV) { loV = v; lo = i; }
      if (v > hiV) { hiV = v; hi = i; }
    }
    if (!eindig) { out.push(pts[i0]); continue; }
    var a = lo < hi ? lo : hi, z = lo < hi ? hi : lo;
    out.push(pts[a]);
    if (z !== a) out.push(pts[z]);
  }
  /* DE RANDEN ZIJN GEEN KOLOM ALS ALLE ANDERE, en dit heeft me een echte fout
     gekost. `coverageOf` leest het eerste en het laatste EINDIGE punt, en
     daarop besluit chart.js waar de bron ophoudt en de arcering begint. De
     min/max van de laatste kolom liggen ergens IN die kolom, dus zonder deze
     twee regels eindigde de dekking gemiddeld een halve kolom te vroeg —
     gemeten op de live feed: Bz hield 2,9 minuten te vroeg op, druk en r0 elk
     5,0 minuten, terwijl er in die week NUL ontbrekende samples zaten.

     Drie lanes die arceren zonder gat, met een verklaring eronder waarom de
     bron ophield. Precies de faalvorm die deze strip moet uitsluiten, gemaakt
     door de decimatie die hem sneller moest maken. */
  var eersteEindig = null, laatsteEindig = null;
  for (var a2 = 0; a2 < n; a2++) {
    var va = pts[a2].v;
    if (va === va && va !== Infinity && va !== -Infinity) { eersteEindig = pts[a2]; break; }
  }
  for (var z2 = n - 1; z2 >= 0; z2--) {
    var vz = pts[z2].v;
    if (vz === vz && vz !== Infinity && vz !== -Infinity) { laatsteEindig = pts[z2]; break; }
  }
  if (eersteEindig && out.indexOf(eersteEindig) < 0) out.push(eersteEindig);
  if (laatsteEindig && out.indexOf(laatsteEindig) < 0) out.push(laatsteEindig);

  out.sort(function (p, q) { return p.time - q.time; });
  return out;
}


/* ---------- 3. GOES: de externe restterm --------------------------------- */

/* Gemeten min intern, per component. De aftrekking is exact, dus de restterm
   erft alleen instrumentfout.

   HET INTERNE VELD WORDT ÉÉN KEER PER SATELLIET UITGEREKEND, en dat volgt uit
   de fysica en niet uit een profiel: de satelliet staat stil in het
   Earth-fixed frame en IGRF ligt in datzelfde frame vast, dus het interne veld
   op die plek verandert met ~0,0002 nT per dag. Tien minuten of tien dagen
   later is het hetzelfde getal. Per sample opnieuw rekenen zou 10.000 IGRF-
   evaluaties op nmax 13 kosten voor 10.000 keer dezelfde uitkomst. */
function goesSeries(craft, Core, coeff, from, to) {
  var lon = craft.longitude;
  var p = Core.geoPoint(0, lon, Core.CONST.GEOSTATIONARY_RE);
  var bGeo = Core.IGRF.fieldGeo(p, coeff, 13);
  var internal = Core.Goes.toInstrument(bGeo, lon);

  var comps = ["Hp", "He", "Hn"];
  var out = { satellite: craft.satellite, internal: internal, series: {} };
  for (var c = 0; c < comps.length; c++) out.series[comps[c]] = [];

  for (var i = 0; i < craft.rows.length; i++) {
    var r = craft.rows[i];
    if (r.time < from || r.time > to) continue;
    for (var k = 0; k < comps.length; k++) {
      var name = comps[k];
      out.series[name].push({
        time: r.time,
        /* Niet-eindig blijft niet-eindig: chart.js' plotter weigert die en
           breekt de lijn, wat precies klopt. Een ontbrekende component als nul
           tekenen zou een meting verzinnen. */
        v: Number.isFinite(r[name]) ? r[name] - internal[name] : NaN,
        /* De standregelmotor. Gemarkeerd, nooit verwijderd: als de arcjet
           vuurt meet de magnetometer de MOTOR, en een weggegooid sample zou
           een uitspraak zijn over wat de magnetosfeer deed. */
        flag: r.arcjet === true
      });
    }
  }
  return out;
}

/* ---------- 4. De spec, puur --------------------------------------------- */

var Strip = {
  LANES: LANES,
  BLOCK_MS: BLOCK_MS,
  SECTOR_TINT: SECTOR_TINT,
  KLASSE_KLEUR: KLASSE_KLEUR,
  runsOf: runsOf,
  runsToBars: runsToBars,
  sectorRuns: sectorRuns,
  decimateMinMax: decimateMinMax,
  goesSeries: goesSeries,

  /* in = { rows, kpRows, goes, coeff, Core, palette, width, height,
            from, to, playhead, hoverX, now }

     Geeft het chart.js-spec terug, plus `overlay` — wat de twee eigen
     renderers nodig hebben en wat chart.js niet kan tekenen. Alles hier is
     data; er wordt geen canvas aangeraakt. */
  spec: function (input) {
    var rows = input.rows || [];
    var Chart = input.Chart || null;
    var pal = input.palette || {};
    var col = function (k) { return pal[k + "_hex"] || pal[k] || "#8496ad"; };
    var from = input.from !== undefined ? input.from
             : (rows.length ? rows[0].time : 0);
    var to = input.to !== undefined ? input.to
           : (rows.length ? rows[rows.length - 1].time : 1);
    var now = input.now === undefined ? Date.now() : input.now;

    var by = {};
    for (var i = 0; i < LANES.length; i++) by[LANES[i].id] = LANES[i];

    /* Het tekenvlak in pixels, want dat is wat de decimatie stuurt. `Chart.PAD`
       is de linkergoot waar de asgetallen staan. */
    var plotPx = Math.max(40, (input.width || 900) - (Chart ? Chart.PAD : 52));
    var thin = function (pts) { return decimateMinMax(pts, plotPx); };

    var lanes = [];
    var mk = function (def, extra) {
      var lane = { id: def.id, label: def.label, unit: def.unit,
                   weight: def.weight, color: col(def.color),
                   beyond: def.beyond, klasse: def.klasse,
                   klasseColor: col(KLASSE_KLEUR[def.klasse]) };
      for (var k in extra) if (extra.hasOwnProperty(k)) lane[k] = extra[k];

      /* DE SCHAAL ÉÉN KEER, en dat is geen microoptimalisatie.

         chart.js rekent de as per TEKENING uit, en bouwt daarvoor een array
         van elke waarde in elke serie van de lane. Voor de GOES-lane zijn dat
         60.090 pushes, voor de hele strip 90.129 — per hertekening, terwijl de
         data tussen twee hertekeningen niet verandert. Gemeten: de strip stond
         daarmee op 9,70 ms bij een budget van 1,2.

         `fixedScale` is geen omweg maar het veld dat chart.js daar zelf voor
         heeft. En het lost een tweede ding op dat erger is dan traag: een as
         die per teken opnieuw uit de data volgt, VERSPRINGT als het venster
         schuift. Een lane waarvan de as meebeweegt met wat er toevallig in
         beeld staat, laat twee momenten die even ver van nul liggen op
         verschillende hoogte zien. */
      if (Chart && !lane.fixedScale && lane.series) {
        var all = [];
        for (var s = 0; s < lane.series.length; s++) {
          var pts = lane.series[s].points;
          for (var i = 0; i < pts.length; i++) all.push(pts[i].v);
        }
        lane.fixedScale = lane.log
          ? Chart.logScaleFor(all, lane.scaleOpts)
          : Chart.scaleFor(all, lane.scaleOpts);
      }

      lanes.push(lane);
      return lane;
    };

    /* -- Bz ---------------------------------------------------------------
       Het teken draagt hier de hele fysica, dus de nul moet in beeld staan
       ook als de reeks er niet omheen loopt: een venster van -8 tot -2 nT
       zonder nullijn leest als "Bz schommelt" waar het "Bz staat al uren
       zuidwaarts" is. */
    mk(by.bz, {
      scaleOpts: { includeZero: true, minSpan: 6 },
      series: [{ points: thin(pluck(rows, "bz")), color: col("ink"), width: 1.3 }],
      marks: [{ v: 0, label: "", color: col("edge") || "rgba(126,158,200,0.30)",
                dash: [1, 3] }]
    });

    /* -- IMF-sector -------------------------------------------------------
       Twee series, één per besliste toestand, als balken over de volle
       lane-hoogte. De onbesliste minuten staan in `overlay` en worden op de
       lane-vloer gemarkeerd — niet als derde kleur, want ze zijn geen derde
       sector. */
    var sec = input.Sector
            ? sectorRuns(rows, input.Sector)
            : { runs: runsOf(rows, function (r) { return r.sector; }),
                undecided: [], changes: null };
    mk(by.sector, {
      fixedScale: { lo: 0, hi: 1, tick: 1 },
      kind: "bars",
      series: [
        { points: runsToBars(sec.runs, "naar de zon", 1),
          color: col(SECTOR_TINT["naar de zon"]), label: "naar de zon" },
        { points: runsToBars(sec.runs, "van de zon af", 1),
          color: col(SECTOR_TINT["van de zon af"]), label: "van de zon af" }
      ]
    });

    /* -- Dynamische druk --------------------------------------------------- */
    mk(by.pdyn, {
      scaleOpts: { includeZero: true, minSpan: 2 },
      series: [{ points: thin(pluck(rows, "pdyn")), color: col("derived"), width: 1.3 }]
    });

    /* -- Standoff r0 ------------------------------------------------------
       Het gevolg, en het getal dat de 3D-scene toont. De geostationaire baan
       staat er als merkteken bij: als r0 daaronder zakt, staat GOES BUITEN de
       magnetopauze, en dan meet het toestel de zonnewind in plaats van de
       magnetosfeer. Dat is de zeldzame toestand waarin de GOES-lane erboven
       iets anders betekent. */
    mk(by.r0, {
      scaleOpts: { minSpan: 3 },
      series: [{ points: thin(pluck(rows, "r0")), color: col("model"), width: 1.4 }],
      marks: [{ v: input.Core ? input.Core.CONST.GEOSTATIONARY_RE : 6.618,
                label: "GOES 6,62", color: col("goes"), dash: [1, 4] }]
    });

    /* -- GOES extern -------------------------------------------------------
       Drie componenten, en dat is de hele reden dat deze lane bestaat: een
       GEOMETRIEFOUT blaast één component op, een MODELFOUT spreidt over alle
       drie. Met alleen Hp is dat verschil onzichtbaar — precies hoe de
       lengtegraadfout ooit maandenlang plausibel bleef staan.

       Een tweede satelliet komt er gestippeld bij: twee lengtegraden zien
       dezelfde storing op verschillende lokale tijd, en dat is wat een
       modelfout van een plaatselijke stroom onderscheidt. */
    var goesSeriesOut = [];
    var craftInfo = [];
    var COMP_TINT = { Hp: "goes", He: "open", Hn: "shock" };
    if (input.goes && input.Core && input.coeff) {
      for (var g = 0; g < input.goes.length && g < 2; g++) {
        var got = goesSeries(input.goes[g], input.Core, input.coeff, from, to);
        craftInfo.push(got);
        for (var comp in COMP_TINT) {
          if (!COMP_TINT.hasOwnProperty(comp)) continue;
          goesSeriesOut.push({
            points: thin(got.series[comp]),
            color: col(COMP_TINT[comp]),
            width: g === 0 ? 1.2 : 1,
            alpha: g === 0 ? 1 : 0.55,
            dash: g === 0 ? null : [2, 2],
            /* HET SATELLIETNUMMER HOORT IN HET LABEL, en dat bleek op de
               eerste hover: zonder nummer gaf de uitleesbox zes getallen
               waarvan drie zonder naam. En juist hier moet je weten welk
               toestel je leest — de eerste hover toonde Hn 3,75 op het ene
               toestel naast 36,00 op het andere, terwijl Hp en He wél bij
               elkaar lagen. Eén component die uitloopt en twee die dat niet
               doen is een GEOMETRIEFOUT en geen storm; welke satelliet dat is,
               is dan de hele vraag. */
            label: "G" + got.satellite + " " + comp,
            /* De arcjet-vlag hangt aan het TOESTEL en niet aan de component:
               als de standregelmotor vuurt, meet de magnetometer de motor op
               alle drie de assen. Hem op één serie per satelliet zetten geeft
               dus dezelfde streepjes op de lane-vloer — en chart.js scant voor
               elke gevlagde serie ELK punt (niet elke stride, want een vlag is
               meestal een handvol minuten), dus zes keer 10.015 in plaats van
               twee keer. */
            flagColor: comp === "Hp" ? col("saa") : null
          });
        }
      }
    }
    mk(by.goes, {
      scaleOpts: { includeZero: true, minSpan: 20 },
      series: goesSeriesOut.length ? goesSeriesOut
            : [{ points: [], color: col("goes") }]
    });

    /* -- Kp ---------------------------------------------------------------
       Blokken, nooit een lijn. En de blokken dragen hun herkomst: het lopende
       blok is een ONDERGRENS, want Kp is het maximum over drie uur en dat
       maximum kan alleen omhoog. Na het laatste gepubliceerde blok zegt de
       bron niets, en dat wordt chart.js' arcering met de `beyond`-zin. */
    var blocks = (input.kpRows && input.kpRows.length)
               ? input.KpIndex.blocks(input.kpRows, now, from, to) : [];
    var pub = [], fill = [];
    for (var b = 0; b < blocks.length; b++) {
      var blk = blocks[b];
      var v = (blk.state === "absent" || blk.kp === null) ? NaN : blk.kp;
      pub.push({ time: blk.time, v: blk.state === "published" ? v : NaN });
      fill.push({ time: blk.time, v: blk.state === "filling" ? v : NaN });
    }
    mk(by.kp, {
      fixedScale: { lo: 0, hi: 9, tick: 3 },
      kind: "bars",
      series: [
        { points: pub, color: col("measured"), label: "gepubliceerd" },
        { points: fill, color: col("measured"), alpha: 0.5, label: "nog vullend" }
      ]
    });

    /* DE BEYOND-ZIN MOET PASSEN OF WEGBLIJVEN.

       chart.js zet het label bij de arcering, en als de arcering smaller is
       dan de tekst schuift hij hem naar LINKS — het venster in, over de data
       heen. Dat is voor de instrumenttabs van de POC de goede keuze: daar
       arceert een lane meestal over een groot stuk. Hier niet: de GOES-feed
       loopt tot de wandklok en het venster tot 47 minuten daarna, dus de
       arcering is zeven pixels breed en de zin van 42 tekens ging dwars over
       de meting heen liggen.

       Dus: past hij, dan staat hij waar hij hoort. Past hij niet, dan draagt
       de arcering hem niet en zegt de captie onder de strip het — waar hij
       hoe dan ook leesbaar is. Wat NIET gebeurt is de zin laten vallen: een
       arcering zonder reden is een grijs vlak, en dan is het net zo goed
       kapot als leeg. */
    var notes = [];
    var px = function (t) { return (t - from) / Math.max(to - from, 1) * plotPx; };
    for (var L = 0; L < lanes.length; L++) {
      var ln = lanes[L];
      if (!ln.beyond) continue;
      var cov = null;
      for (var si = 0; si < ln.series.length; si++) {
        var cv2 = coverEnd(ln.series[si].points);
        if (cv2 !== null && (cov === null || cv2 > cov)) cov = cv2;
      }
      /* EERST: ARCEERT DEZE LANE UBERHAUPT? Dezelfde drempel als chart.js —
         een dekking die tot binnen een minuut van de vensterrand loopt, is
         een bron die niet is opgehouden. Zonder deze vraag verhuisde de zin
         van ELKE lane naar de captie, ook die van de vier lanes die gewoon
         doorlopen, en dan staan er vijf verklaringen onder een strip waarin
         twee dingen arceren. Een reden bij iets dat niet gebeurt is net zo
         verwarrend als geen reden bij iets dat wel gebeurt. */
      var arceert = cov === null || cov < to - 60000;
      if (!arceert) continue;

      var breedtePx = cov === null ? plotPx : plotPx - px(cov);
      /* ~5,4 px per teken op 9px monospace, plus de marge die chart.js
         aanhoudt. Ruim geschat: liever een zin in de captie dan een zin over
         de data. */
      if (breedtePx < ln.beyond.length * 5.4 + 12) {
        notes.push({ id: ln.id, label: ln.label, beyond: ln.beyond });
        ln.beyond = null;
      }
    }

    return {
      width: input.width, height: input.height,
      from: from, to: to,
      lanes: lanes,
      playhead: input.playhead === undefined ? null : input.playhead,

      /* ALTIJD null, en dat is geen omissie. chart.js tekent met dit veld zijn
         eigen uitleesvenster: één blok bovenaan met de zes lanes als tekstregels
         onder elkaar. Dat leest als een tabel die je moet aflopen om te zien
         welk getal bij welke rij hoort — terwijl de rijen zélf al onder elkaar
         staan. Wij zetten elk getal bij zijn eigen lane, aan de lijn, in
         `Strip.draw`. De echte hoverX reist mee in `overlay`.
         chart.js is een POC-bestand: het wordt gelezen, nooit gewijzigd. */
      hoverX: null,
      ink: col("ink"), inkFaint: col("ink-faint"),
      hair: "rgba(126,158,200,0.16)", hairSoft: "rgba(126,158,200,0.07)",
      playheadColor: col("ink"),
      mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      /* De tolerantie van de uitleesbox, en die moet naar de GROFSTE lane.

         chart.js kent één `nearMs` voor alle lanes, en dat is precies goed
         voor de instrumenttabs van de POC, waar alle lanes van hetzelfde
         product komen. Hier niet: de wind is een minuutproduct en Kp een
         blok van drie uur. Op vijf minuten viel de Kp-rij dus WEG uit de
         uitlezing — en de sector ook, want die staat als runs van uren in de
         serie. Twee van de zes lanes zwegen, en niet omdat ze niets te zeggen
         hadden.

         Ruimer nemen kost hier niets: elke lane draagt een punt per sample,
         ook waar dat sample geen waarde heeft, dus een gat leest als
         em-dash — "geen lezing hier" — en niet als de waarde van drie uur
         geleden. Wat buiten een bron zijn dekking valt, heeft helemaal geen
         punt en verdwijnt uit de box, wat de juiste uitspraak is. */
      hoverOpts: { nearMs: BLOCK_MS / 2 },

      /* Wat chart.js niet kan tekenen, en waarom het apart staat: dit zijn
         drie uitspraken over ONZEKERHEID, niet over waarden. */
      overlay: {
        beyondNotes: notes,
        sectorUndecided: sec.undecided,
        sectorChanges: sec.changes,
        kpFilling: blocks.filter(function (x) { return x.state === "filling"; }),
        /* De volledige blokkenlijst, voor de uitleeschip: een blok is een
           INTERVAL en geen meetpunt, dus de chip leest hem uit de bloklogica
           en niet uit hoverRows — zie kpChip hieronder. */
        kpBlocks: blocks,
        goes: craftInfo,
        laneById: indexBy(lanes),
        hoverX: input.hoverX === undefined ? null : input.hoverX,
        /* De sector als RUNS, voor de uitlezing. Zie Strip.runAt hieronder:
           de balken dragen punten op hun grenzen, en daar is niet uit af te
           lezen wat er middenin geldt. */
        sectorRuns: sec.runs,
        sectorTint: {
          "naar de zon": col(SECTOR_TINT["naar de zon"]),
          "van de zon af": col(SECTOR_TINT["van de zon af"])
        }
      }
    };
  },

  /* ---------- 5. Tekenen ------------------------------------------------- */

  /* chart.js eerst, dan de twee dingen die hij niet kan. In die volgorde,
     want chart.js zet per lane `_top`, `_bot` en `_plot` op het lane-object en
     die layout is precies wat de overlays nodig hebben — twee keer uitrekenen
     zou twee antwoorden kunnen geven. */
  draw: function (Chart, c, spec) {
    var res = Chart.draw(c, spec);
    var lay = spec.overlay.laneById;

    /* -- de minuten waarin Bx niets zei -----------------------------------
       Een band op de LANE-VLOER, niet over de hele lane. Dat onderscheid is
       de hele vertaalslag van deze lane: hoeveel van de tijd de kegelhoek
       boven de bar stond is een uitspraak over de MEETBAARHEID, en welke
       sector er gold is een uitspraak over de zonnewind. Ze over elkaar heen
       tekenen zou suggereren dat de sector daar onderbroken was, en dat is
       precies wat lib/sector.js weerlegt: onbeslist is geen bewijs tegen de
       lopende sector, het is geen bewijs.

       Een enkele minuut is bij zeven dagen op 1560 px een zesde van een
       pixel. Ze worden dus niet apart getekend maar samen als DICHTHEID —
       een dichte band betekent dat Bx daar lang niets zei. */
    var sec = lay.sector;
    if (sec && sec._top !== undefined) {
      var runs = spec.overlay.sectorUndecided;
      c.save();
      c.fillStyle = "rgba(126,158,200,0.55)";
      for (var i = 0; i < runs.length; i++) {
        var x0 = res.xOf(runs[i].from), x1 = res.xOf(runs[i].to);
        c.fillRect(x0, sec._bot - 3, Math.max(x1 - x0, 0.8), 3);
      }
      c.restore();
    }

    /* -- de kap op het lopende Kp-blok ------------------------------------
       Kp is het MAXIMUM over drie uur. Zolang het blok loopt is de
       gepubliceerde waarde dus een ondergrens die alleen omhoog kan. Een
       gestippelde bovenrand zegt dat; een volle balk zou beweren dat de
       waarde vaststaat. */
    var kp = lay.kp;
    if (kp && kp._plot) {
      var fillings = spec.overlay.kpFilling;
      for (var k = 0; k < fillings.length; k++) {
        var f = fillings[k];
        if (f.kp === null || !isFinite(f.kp)) continue;
        var y = kp._plot(f.kp);
        if (y === null) continue;
        var bx0 = res.xOf(f.time);
        var bx1 = res.xOf(f.time + BLOCK_MS);
        c.save();
        c.setLineDash([2, 2]);
        c.strokeStyle = spec.ink;
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(bx0, y - 0.5); c.lineTo(Math.max(bx1 - 1, bx0 + 1), y - 0.5);
        c.stroke();
        c.setLineDash([]);
        c.restore();
      }
    }

    /* -- de klasse-markering per lane -------------------------------------
       Vier pixels naast het lane-label, in dezelfde drie kleuren als het
       paneel. Waar een lane vandaan komt hoort bij de lane te staan en niet in
       een legenda die je erbij moet houden. */
    for (var n = 0; n < spec.lanes.length; n++) {
      var lane = spec.lanes[n];
      if (lane._top === undefined) continue;
      c.save();
      c.fillStyle = lane.klasseColor;
      c.fillRect(Chart.PAD - 4, lane._top + 3, 3, 6);
      c.restore();
    }

    /* -- de uitlezing bij de aanwijzer, per lane --------------------------- */
    var hx = spec.overlay.hoverX;
    if (hx !== null && hx !== undefined && hx >= Chart.PAD) {
      drawHover(Chart, c, spec, res, hx);
    }

    return res;
  },

  /* Waar een chip komt te staan. Puur en apart, want de fouten die hier vallen
     zijn PLAATSINGSfouten — een chip die van het canvas loopt of die over de
     asgetallen in de linkergoot schuift — en die zijn zonder canvas te toetsen.
     Liefst rechts van de lijn; past dat niet, dan links; past dat ook niet,
     dan tegen de goot aan. Die laatste stand is een echte uitkomst en geen
     noodgeval: bij een strip van 168 uur staat de aanwijzer vaak in de eerste
     centimeter. */
  chipAt: function (hx, textW, pad, width) {
    var w = textW + 10;
    var x = hx + 6, side = "right";
    if (x + w > width - 2) { x = hx - 6 - w; side = "left"; }
    if (x < pad + 1) { x = pad + 1; side = "clamped"; }
    return { x: x, w: w, side: side };
  },

  /* WELKE RUN BEVAT DIT MOMENT — en dat is een andere vraag dan die
     `Chart.hoverRows` beantwoordt.

     Die zoekt het dichtstbijzijnde PUNT en verwerpt het buiten `nearMs`, wat
     precies goed is voor een meetreeks. De sector is geen meetreeks maar een
     TOESTAND OVER EEN INTERVAL, en hij draagt punten alleen op zijn
     run-grenzen. Midden in een run van zestien uur ligt het dichtstbijzijnde
     punt acht uur weg — ruim buiten de tolerantie van 90 minuten — dus viel de
     lane uit de uitlezing terwijl de sector daar gewoon bekend was. Gemeten op
     een reeks met één wissel: het naaste punt lag 1000 minuten weg.

     Voor een interval bestaat er geen tolerantie: het moment ligt erin of niet.
     Halfopen, zodat een grens bij precies één run hoort en niet bij twee. */
  /* Zes reeksen op één lane geven zes labels, en bij GOES staat het toestel
     daar drie keer achter elkaar in: "G19 Hp · G19 He · G19 Hn · G18 Hp …".
     De chip werd daarmee breder dan de halve strip en schoof over zijn eigen
     lane-label heen. Een label dat hetzelfde eerste woord heeft als zijn
     voorganger draagt dat woord niet nog eens — de reeksen staan naast elkaar
     en de kleur houdt ze uit elkaar. Puur breedte; er verdwijnt geen
     onderscheid dat er nog niet stond. */
  trimLabels: function (parts) {
    var out = [], prev = null;
    for (var i = 0; i < parts.length; i++) {
      var lab = parts[i].label || "";
      var sp = lab.indexOf(" ");
      if (sp > 0) {
        var pre = lab.slice(0, sp);
        if (pre === prev) lab = lab.slice(sp + 1);
        prev = pre;
      } else {
        prev = null;
      }
      out.push(lab);
    }
    return out;
  },

  runAt: function (runs, t) {
    if (!runs || !runs.length) return null;
    for (var i = 0; i < runs.length; i++) {
      if (t >= runs[i].from && t < runs[i].to) return runs[i];
    }
    /* Op het eindpunt van de laatste run staan is de reeks aanwijzen op zijn
       laatste sample — een gewone stand, geen gat. */
    var last = runs[runs.length - 1];
    return t === last.to ? last : null;
  },

  /* De Kp-uitleeschip. Een blok is een INTERVAL van drie uur en geen
     meetpunt, dus de chip leest de bloklogica en niet hoverRows — dezelfde
     reden waarom de sector zijn eigen uitzondering heeft. Wat hij zegt is
     Terry's ≥-notatie (sessie 29): een afgerond blok toont de waarde kaal
     ("3.3"), een lopend blok toont "≥ 2.0" — Kp is het maximum over het blok,
     dus zolang het loopt is de waarde een ondergrens die alleen kan stijgen;
     dát draagt het ene teken. Voorbij de feed (absent) zwijgt de chip: de
     arcering plus de captie verklaren die stilte al. */
  kpChip: function (blocks, t) {
    if (!blocks || !blocks.length) return null;
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (t >= b.time && t < b.time + BLOCK_MS) {     // halfopen, zoals runAt
        if (b.kp === null || !isFinite(b.kp)) return null;
        if (b.state === "published") return { text: b.kp.toFixed(1) };
        if (b.state === "filling") return { text: "≥ " + b.kp.toFixed(1) };
        return null;
      }
    }
    return null;
  },

  /* De tijd-as. Onder een dag alleen de klok, daarboven de datum erbij — en
     het EERSTE label dat past draagt de datum, waar hij ook valt. chart.js
     regelt dat met de derde parameter; hier staat alleen hoe het eruitziet. */
  fmtTick: function (t, step, wantDate) {
    var d = new Date(t);
    var hh = String(d.getUTCHours()).padStart(2, "0");
    var mm = String(d.getUTCMinutes()).padStart(2, "0");
    var clock = step < 3600e3 ? hh + ":" + mm : hh + "h";
    if (!wantDate && d.getUTCHours() !== 0) return clock;
    var day = String(d.getUTCDate()).padStart(2, "0");
    var mon = ["jan", "feb", "mrt", "apr", "mei", "jun",
               "jul", "aug", "sep", "okt", "nov", "dec"][d.getUTCMonth()];
    return day + " " + mon + " " + clock;
  },

  fmtTime: function (t) {
    return new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UT";
  }
};

/* ---------- helpers ------------------------------------------------------ */

/* Een afgeronde rechthoek bestaat nergens in chart.js of hier — vandaar deze.
   `roundRect` is er in elke browser die deze app draait; de arcTo-tak staat er
   voor node, waar de strip getoetst wordt met een canvas-dubbel. */
function chipPath(c, x, y, w, h, r) {
  if (typeof c.roundRect === "function") {
    c.beginPath(); c.roundRect(x, y, w, h, r); return;
  }
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/* De waarden onder de aanwijzer, elk bij zijn eigen lane.

   De GETALLEN komen van `Chart.hoverRows`, en dat is geen gemak maar een eis:
   daar zit de nearMs-regel, en daar zit het verschil tussen een serie die
   buiten haar dekking valt (verdwijnt) en een serie die binnen haar dekking
   niets te melden heeft (em-dash). Twee plaatsen die dat verschil moeten
   kennen, is één plaats die het een keer verkeerd krijgt. Wij vragen hem per
   lane, want wij hebben de lane-id nodig om de hoogte te vinden en hoverRows
   geeft alleen het label terug. */
function drawHover(Chart, c, spec, res, hx) {
  var hoverAt = Chart.timeAtX(hx, spec.from, spec.to, Chart.PAD, res.plotW);
  var px = res.xOf(hoverAt);
  /* De aslijnhoogte niet herhalen maar aflezen: chart.js legt de lanes uit tot
     `lanesH` en zet de laatste `bot` op `lanesH - gap`. Twee keer 13 opschrijven
     is twee getallen die uit elkaar kunnen lopen. */
  var last = res.layout[res.layout.length - 1];
  var lanesH = last ? last.bot + 2 : spec.height;
  var H = 13;

  c.save();
  c.font = "10px " + spec.mono;
  c.textBaseline = "middle";
  c.textAlign = "left";

  c.strokeStyle = "rgba(199,213,232,0.28)";
  c.setLineDash([2, 3]); c.lineWidth = 1;
  c.beginPath(); c.moveTo(px, 0); c.lineTo(px, lanesH); c.stroke();
  c.setLineDash([]);

  for (var i = 0; i < spec.lanes.length; i++) {
    var lane = spec.lanes[i];
    if (lane._top === undefined) continue;

    var segs = [], textW = 0, j, sw;
    if (lane.id === "sector") {
      /* De uitzondering, en hij is inhoudelijk: een sector geldt over een
         interval. `onbeslist` krijgt geen sectorkleur maar de doffe inkt —
         het is een weigering en geen derde toestand, dezelfde regel als in de
         legenda en op de lane-vloer. */
      var run = Strip.runAt(spec.overlay.sectorRuns, hoverAt);
      if (!run) continue;
      sw = c.measureText(run.v).width;
      segs.push({ t: run.v, w: sw,
                  color: spec.overlay.sectorTint[run.v] || spec.inkFaint });
      textW = sw;
    } else if (lane.id === "kp") {
      /* De tweede interval-uitzondering: één segment, waarde voorop, en het
         lege tweede segment ("gepubliceerd — / nog vullend 2.00") bestaat
         niet meer. Zie Strip.kpChip voor de notatie. */
      var chip = Strip.kpChip(spec.overlay.kpBlocks, hoverAt);
      if (!chip) continue;
      sw = c.measureText(chip.text).width;
      segs.push({ t: chip.text, w: sw,
                  color: (lane.series[0] && lane.series[0].color) || spec.ink });
      textW = sw;
    } else {
      var rows = Chart.hoverRows([lane], hoverAt, spec.hoverOpts);
      if (!rows.length) continue;            // buiten dekking: de lane zwijgt
      var parts = rows[0].parts;
      var labels = Strip.trimLabels(parts);
      for (j = 0; j < parts.length; j++) {
        var p = parts[j];
        var t = (labels[j] ? labels[j] + " " : "") + p.value + (p.flag ? " !" : "");
        sw = c.measureText(t).width;
        segs.push({ t: t, w: sw, color: p.color || spec.ink });
        textW += sw + (j ? 7 : 0);
      }
    }

    var box = Strip.chipAt(px, textW, Chart.PAD, spec.width);
    var y = Math.max(0, Math.min(lane._top + 1, lanesH - H));
    c.fillStyle = "rgba(6,10,18,0.92)";
    c.strokeStyle = spec.hair;
    chipPath(c, box.x, y, box.w, H, 3);
    c.fill(); c.stroke();

    var tx = box.x + 5;
    for (var k = 0; k < segs.length; k++) {
      c.fillStyle = segs[k].color;
      c.fillText(segs[k].t, tx, y + H / 2);
      tx += segs[k].w + 7;
    }
  }

  /* Het moment zelf hoort op de as: daar staat de tijd al. */
  if (spec.fmtTime) {
    var stamp = spec.fmtTime(hoverAt);
    var stampW = c.measureText(stamp).width;
    var sb = Strip.chipAt(px, stampW, Chart.PAD, spec.width);
    var sy = Math.min(lanesH + 1, spec.height - H);
    c.fillStyle = "rgba(6,10,18,0.92)";
    c.strokeStyle = spec.hair;
    chipPath(c, sb.x, sy, sb.w, H, 3);
    c.fill(); c.stroke();
    c.fillStyle = spec.ink;
    c.fillText(stamp, sb.x + 5, sy + H / 2);
  }

  c.restore();
}

function pluck(rows, key) {
  var out = new Array(rows.length);
  for (var i = 0; i < rows.length; i++) {
    out[i] = { time: rows[i].time,
               v: Number.isFinite(rows[i][key]) ? rows[i][key] : NaN };
  }
  return out;
}

function filterRuns(runs, want) {
  var out = [];
  for (var i = 0; i < runs.length; i++) if (runs[i].v === want) out.push(runs[i]);
  return out;
}

/* Het laatste punt waarop een serie iets zegt. Dezelfde regel als chart.js'
   coverageOf: eindig telt, niet-eindig niet — want een lijn wordt daar
   afgebroken en een afgebroken lijn is geen dekking. */
function coverEnd(points) {
  for (var i = points.length - 1; i >= 0; i--) {
    var v = points[i].v;
    if (v === v && v !== Infinity && v !== -Infinity) return points[i].time;
  }
  return null;
}

function indexBy(lanes) {
  var out = {};
  for (var i = 0; i < lanes.length; i++) out[lanes[i].id] = lanes[i];
  return out;
}

if (typeof module === "object" && module.exports) module.exports = Strip;
else root.TerraStrip = Strip;

})(typeof globalThis !== "undefined" ? globalThis : this);
