/* =========================================================================
   terra/registry.js — wat er op het scherm staat, en waar het vandaan komt.

   Dezelfde VORM als lib/registry.js — FRAMES, CLOCKS, CLASSES, ENTRIES — en
   bewust een fractie van de omvang. De POC's register draagt 2.387 regels
   proza omdat de POC een onderzoeksinstrument is waar de onderbouwing zelf
   het product is. v1 toont de grafiek en het model "zonder de onderbouwing",
   en dan blijft over wat de kleine legenda nodig heeft: klasse, frame, klok,
   bron, waar het staat, en per grootheid één zin over wat er gebeurt als de
   bron ophoudt.

   WAAROM DIT BESTAND BESTAAT EN NIET ALLEEN EEN LEGENDA IS.

   Een legenda vertelt wat een kleur betekent. Dit vertelt wat er OP HET SCHERM
   STAAT — en dat is een lijst die kan verlopen zodra iemand een object aan de
   scene toevoegt. Elke Object3D in terra.html draagt al een `scene:*`-naam,
   dus die lijst is te toetsen tegen de echte scenegraaf in plaats van tegen
   een grep. Dat is de check die dit bestand van een document een declaratie
   maakt.

   HET KOPIEERT NIETS. Twee sets stonden al ergens en die blijven daar staan:

     Strip.LANES        de zes lanes — label, klasse, eenheid, `beyond`
     Core.Aurora.REASONS de redenen waarom de aurora-laag leeg kan zijn

   Dit bestand LEEST ze. De alternatieve inrichting — de tekst hierheen
   verhuizen — geeft twee literals die uit elkaar kunnen lopen zodra iemand er
   een aanpast, en dat is precies wat een registry moet uitsluiten. De
   afhankelijkheid loopt dus van de documentatie naar de code en nooit andersom:
   strip.js en core.js weten van dit bestand niets af en blijven los toetsbaar.

   UMD, net als core.js, data.js en strip.js.
   ========================================================================= */

;(function (root) {
"use strict";

/* De twee eigenaren. In node via require, in de browser via de globals die de
   scripttags hierboven al hebben gezet — terra.html laadt dit bestand ná
   strip.js. Geen terugval als er één ontbreekt: een registry die zijn eigen
   bron niet vindt hoort om te vallen en niet een halve lijst te publiceren. */
var isNode = (typeof module === "object" && module.exports);
var Strip = isNode ? require("./strip.js") : root.TerraStrip;
var Core  = isNode ? require("./core.js")  : root.TerraCore;

if (!Strip || !Strip.LANES) throw new Error("terra/registry.js: terra/strip.js ontbreekt");
if (!Core || !Core.Aurora)  throw new Error("terra/registry.js: terra/core.js ontbreekt");


/* ---------- 1. De drie assen ---------------------------------------------- */

var FRAMES = {
  geo:  { label: "aardvast",
          note: "Draait met de planeet mee. IGRF, de graticule, de "
              + "GOES-lengtegraden." },
  gsm:  { label: "GSM",
          note: "X naar de zon, Z naar magnetisch noord. De zonnewind en alles "
              + "wat de magnetosfeer daarop doet." },
  mag:  { label: "geomagnetisch",
          note: "Dipoolbreedte. De poolkaprand leeft hier." },
  none: { label: "geen frame",
          note: "Een scalaire index heeft geen richting. Kp is een getal over "
              + "de hele planeet." }
};

/* v1 kent er DRIE waar de POC er acht heeft, en de drie die wegvielen vielen
   weg met de forecast (`run`), met de L1-tabs (`l1`, `l1part`) en met de
   rontgenlaag (`light`). Wat overblijft is precies het onderscheid dat de
   strip zichtbaar maakt: de wind loopt VOORUIT op de wandklok omdat zijn
   metingen nog onderweg zijn, en de magnetosfeer kan dat per definitie niet. */
var CLOCKS = {
  arrival: { label: "aankomst bij de aarde",
             note: "Wanneer het pakketje de magnetosfeer bereikt. De hoofdklok "
                 + "van deze app — en de reden dat de wind-lanes rechts van de "
                 + "wandklok doorlopen: die metingen zijn gedaan, ze zijn "
                 + "alleen nog onderweg." },
  earth:   { label: "aan de aarde, nu",
             note: "GOES meet ter plekke. Deze klok kan de wandklok NIET "
                 + "passeren, en dat is waarom de GOES-lane arceert waar de "
                 + "wind-lanes gewoon doorlopen. Een lane die daar een lijn "
                 + "trok zou de magnetosfeer in de toekomst meten." },
  block3h: { label: "blok van drie uur",
             note: "Kp is één waarde per blok, geen curve. Hij stapt." },
  none:    { label: "geen klok",
             note: "Geometrie en constanten." }
};

/* Dezelfde woordenlijst als DATA-MATRIX.md. SCHEMATIC was de eerste snede die
   v1 maakte; de sfeer-ronde van sessie 29 brengt hem bewust terug — mét een
   knop die de hele klasse uitzet, zodat de snede nog steeds te maken is. */
var CLASSES = {
  MEASURED: "Een instrument heeft dit getal geproduceerd.",
  DERIVED:  "Uit gemeten waarden gerekend met een gepubliceerde formule.",
  MODEL:    "Een empirisch model. Een gemiddelde van situaties zoals deze.",
  ANALYTIC: "Pure geometrie of astronomie. Er komt geen meting aan te pas.",
  SCHEMATIC: "Getekend om gezien te worden. Geen uitspraak over iets gemetens."
};


/* ---------- 2. De bronnen ------------------------------------------------- */

var SOURCES = [
  { id: "prop", label: "Gepropageerde zonnewind",
    path: "products/geospace/propagated-solar-wind.json",
    frame: "gsm", clock: "arrival", cadenceMin: 1, spanHours: 168,
    note: "Hetzelfde L1-instrument als de realtime feed, met elk sample "
        + "verschoven naar het moment waarop SWPC zegt dat het pakketje de "
        + "bow shock bereikt — ongeveer 62 minuten later. Geen forecast: een "
        + "meting die zijn reistijd draagt." },

  { id: "kp", label: "Planetaire Kp-index",
    path: "products/noaa-planetary-k-index.json",
    frame: "none", clock: "block3h", cadenceMin: 180, spanHours: 168,
    note: "Het gepubliceerde indexproduct. v1 haalt de outlook NIET op, dus de "
        + "vierde toestand van de POC — voltooide schatting — bestaat hier "
        + "niet en staat om die reden in de legenda benoemd." },

  { id: "goes-mag", label: "GOES magnetometer",
    path: "json/goes/{craft}/magnetometers-7-day.json",
    frame: "geo", clock: "earth", cadenceMin: 1, spanHours: 168,
    note: "Twee toestellen op ~6,6 Re, elk drie componenten. De enige straal "
        + "waarop dit project het veld werkelijk meet." }
];


/* ---------- 3. De grootheden ---------------------------------------------- */

/* `shownAs` is de sleutel van dit hele bestand en gebruikt vier soorten:

     row:<id>     een uitleesrij in het kop-paneel  (het DOM-id)
     lane:<id>    een lane in de strip              (Strip.LANES)
     scene:<id>   een object in de 3D-scene         (Object3D.name)
     layer:<id>   een knop die iets aan- of uitzet  (data-lay)

   Alle vier zijn te controleren tegen de draaiende app: de eerste drie tegen
   de DOM en de scenegraaf, de vierde tegen de knoppenbalk. Een grootheid die
   nergens staat is een dode declaratie; een ding op het scherm dat hier niet
   staat is een claim zonder herkomst. `audit()` onderaan zoekt beide. */

function laneVan(id) {
  for (var i = 0; i < Strip.LANES.length; i++) {
    if (Strip.LANES[i].id === id) return Strip.LANES[i];
  }
  throw new Error("terra/registry.js: onbekende lane " + id);
}

/* De zes lane-grootheden. Label, klasse, eenheid en de `beyond`-zin komen uit
   Strip.LANES — daar staan ze en daar blijven ze. Wat hier bijkomt is wat de
   strip niet weet: waar dezelfde grootheid nog meer staat, uit welke bron hij
   komt, en welke voorbehouden eraan hangen. */
function uitLane(id, extra) {
  var L = laneVan(id);
  var e = { id: id, label: L.label, cls: L.klasse, unit: L.unit,
            beyond: L.beyond, shownAs: ["lane:" + id] };
  for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) {
    if (k === "shownAs") e.shownAs = e.shownAs.concat(extra[k]);
    else e[k] = extra[k];
  }
  return e;
}

var ENTRIES = [

  /* --- de zonnewind, zoals hij aankomt --------------------------------- */

  { id: "wind-speed", label: "Snelheid", cls: "MEASURED",
    frame: "gsm", clock: "arrival", sourceId: "prop", unit: "km/s",
    shownAs: ["row:r-v"],
    inertWhen: [
      { when: "er is geen snelheidsmeting op dit moment",
        why: "Dan valt de halve app om: de dynamische druk gaat kwadratisch "
           + "in v, de koppeling met v^(4/3) en het Mach-getal deelt erdoor. "
           + "Geen van drieën heeft een huiswaarde." }
    ] },

  { id: "wind-density", label: "Dichtheid", cls: "MEASURED",
    frame: "gsm", clock: "arrival", sourceId: "prop", unit: "/cm³",
    shownAs: ["row:r-n"],
    inertWhen: [
      { when: "er is geen dichtheidsmeting op dit moment",
        why: "Zonder n bestaat de dynamische druk niet, en zonder druk is er "
           + "geen Shue-oppervlak: r₀ is per definitie een functie van pdyn en "
           + "Bz. Geen grens betekent ook geen open/dicht-classificatie. Dat "
           + "de app dan NIETS tekent is de bedoeling — `Math.max(pdyn; 0,01)` "
           + "is een numeriek vangnet tegen r₀ → ∞ en geen fysische "
           + "ondergrens." }
    ] },

  uitLane("bz", { frame: "gsm", clock: "arrival", sourceId: "prop",
    shownAs: ["row:r-bz"],
    caveat: "De enige grootheid waar VIER andere op omvallen: de koppeling, de "
          + "instroom, de vorm van de grens en sinds deze ronde ook zijn "
          + "kleur — die is een classificatie van Bz zelf." }),

  uitLane("sector", { frame: "gsm", clock: "arrival", sourceId: "prop",
    shownAs: ["row:r-sector"],
    caveat: "Beslist op de KEGELHOEK acos(|Bx|/Bt) en niet op een aantal nT — "
          + "dezelfde 1 nT Bx is beslissend in een veld van 1,5 nT en "
          + "betekenisloos in een van 19. De bar van 86° en de hysterese van "
          + "120 minuten zijn gemeten in lib/sector.js: elk sample zijn eigen "
          + "toestand geven gaf 704 wisselingen over zeven dagen, met de "
          + "hysterese 8.",
    inertWhen: [
      { when: "Bx of Bt ontbreekt, of Bt is nul",
        why: "Dan is de kegelhoek niet te vormen. `onbeslist` is een WEIGERING "
           + "en geen derde sector — het is geen bewijs vóór en geen bewijs "
           + "tegen. Daarom krijgt hij geen kleur maar een arcering." }
    ] }),

  uitLane("pdyn", { frame: "gsm", clock: "arrival", sourceId: "prop",
    shownAs: ["row:r-pdyn"],
    source: "1,6726e-6 · n · v²",
    caveat: "De formule is bit voor bit die van de POC en draagt geen "
          + "invoercontrole; de REEKS weigert (Series.derive). `null · v²` is "
          + "nul in JavaScript, en nul druk geeft een magnetosfeer twee keer "
          + "zo groot als de grootste ooit gemeten." }),

  uitLane("kp", { frame: "none", clock: "block3h", sourceId: "kp",
    shownAs: ["row:r-kp"],
    caveat: "Drie herkomsten in v1 en niet vier. `Voltooide schatting` komt "
          + "uit het outlook-product en dat is forecast; v1 stopt bij nu. De "
          + "ontbrekende vierde staat in de legenda benoemd, want een "
          + "toestand die nergens staat leest als een toestand die niet "
          + "voorkomt." }),

  uitLane("goes", { frame: "geo", clock: "earth", sourceId: "goes-mag",
    shownAs: ["row:r-goes"],
    source: "Hp, He, Hn minus het interne IGRF-veld op de satellietpositie",
    caveat: "G18's Hn draagt een niet-verklaarde offset van ~31 nT. Gemeten "
          + "over zeven dagen, mediane restterm: G19 Hp −5,9 · He 13,1 · "
          + "Hn −2,4 tegen G18 Hp −9,8 · He 6,9 · Hn 31,1. Het is niet de "
          + "arcjet — zonder de 148 gevlagde samples staat er 31,0 in plaats "
          + "van 31,1. Eén component die uitloopt terwijl de andere twee dat "
          + "niet doen is geometrie of kalibratie, geen storm. v1 TOONT de "
          + "meting; de oorzaak uitzoeken is POC-onderzoek." }),

  /* --- de geometrie die daaruit volgt ---------------------------------- */

  { id: "standoff", label: "Standoff r₀", cls: "MODEL",
    frame: "gsm", clock: "arrival", unit: "Re",
    source: "Shue et al. 1998, gedreven door dyn. druk en Bz",
    shownAs: ["row:r-r0", "lane:r0", "scene:boundary", "scene:boundary-band",
              "layer:mag"],
    beyond: laneVan("r0").beyond,
    caveat: "Het getekende en het classificerende oppervlak zijn ÉÉN object. "
          + "Teken een grens en laat iets anders beslissen wat open is, en de "
          + "tekening begint te liegen over welke lijnen open zijn — stil, en "
          + "het ergst op de flanken. Divergeert in de diepe staart: voorbij "
          + "ongeveer x = −20 Re is er geen oppervlak meer om te kruisen. "
          + "De BAND eromheen is σ = 1 Re, de spreiding van de waargenomen "
          + "passages waarop Shue et al. 1998 is gefit — een getal van hen en "
          + "niet van ons. Hij staat er omdat een lijn van één pixel een "
          + "precisie belooft die de fit niet heeft, en hij hoort niet gelezen "
          + "te worden als een gemeten onzekerheid van DEZE toestand. Alleen "
          + "in de doorsnede: in 3D zou het een tweede schil om de eerste zijn "
          + "en dan zie je twee kooien in plaats van een onzekerheid. "
          + "De KLEUR van de grens volgt Bz — noordwaarts, zuidwaarts, of "
          + "onder −10 nT sterk zuidwaarts. Die drempels komen uit de POC en "
          + "markeren waar de dagzijde sluit, waar reconnectie de neus begint "
          + "te eroderen, en waar r₀ binnen de geostationaire baan kan zakken. "
          + "Zonder Bz-meting is er geen toestand en dus geen kleur: de grens "
          + "valt dan terug op zijn neutrale inkt." },

  { id: "bowshock", label: "Bow shock", cls: "MODEL",
    frame: "gsm", clock: "arrival", unit: "Re",
    source: "empirische schaling op r₀ met het magnetosonische Mach-getal",
    shownAs: ["row:r-rbs", "scene:shock", "layer:mag"],
    caveat: "Hangt volledig aan r₀ en voegt geen eigen meting toe." },

  { id: "topology", label: "Open / dicht / onopgelost", cls: "DERIVED",
    frame: "gsm", clock: "arrival",
    source: "veldlijnen getraceerd tot 70 Re, geclassificeerd tegen dezelfde "
          + "grens die getekend wordt",
    shownAs: ["row:r-topo", "scene:fieldlines"],
    caveat: "Alleen een kruising van de grens maakt een lijn open. Uit de "
          + "ruimte of uit de stappen lopen is `onopgelost` en wordt APART "
          + "geteld — dat woord gaat over de integratie en niet over de "
          + "magnetosfeer, en die twee samenvouwen zou de legenda laten "
          + "liegen." },

  { id: "polar-cap", label: "Poolkaprand", cls: "DERIVED",
    frame: "mag", clock: "arrival", unit: "°",
    source: "de meest equatorwaartse open seed per hemisfeer",
    shownAs: ["row:r-cap"],
    caveat: "GEKWANTISEERD door het seed-raster: 6° bij vijf schillen, en de "
          + "rand kan dus niet fijner liggen dan die stap. De POC bisecteert "
          + "hem tot 0,00000° spreiding; die bisectie had drie consumenten en "
          + "die gaan geen van drieën mee naar v1." },

  { id: "coupling", label: "Koppeling", cls: "DERIVED",
    frame: "gsm", clock: "arrival",
    source: "Newell et al. 2007: v^(4/3) · Bt^(2/3) · sin^(8/3)(θc/2)",
    shownAs: ["row:r-coup"],
    caveat: "Het getal op het scherm is de koppeling gedeeld door een "
          + "referentie van 4400 — een leesbaarheidskeuze van ons, geen "
          + "gepubliceerde constante. Er hangt niets fysisch aan.",
    inertWhen: [
      { when: "Bz ontbreekt",
        why: "De koppelingsfunctie is een functie van Bz. Zonder die meting "
           + "is er geen koppeling — null, niet nul. Nul is een echte "
           + "toestand (rustig) en de verkeerde." }
    ] },

  { id: "wind-vector", label: "Aanstroomrichting", cls: "MEASURED",
    frame: "gsm", clock: "arrival",
    source: "vx/vy/vz uit de gepropageerde zonnewind (SWPC)",
    shownAs: ["row:r-winddir", "layer:wind"],
    caveat: "HET FRAME IS NIET HELEMAAL HET ONZE. De feed geeft de componenten "
          + "in GSE, de scene tekent in GSM. Die twee delen hun x-as, dus de "
          + "HOEK MET DE ZONLIJN — het getal dat op het scherm staat — klopt "
          + "exact; alleen de verdeling van de rest over y en z verschilt met "
          + "de dipoolkanteling, en die kanteling loopt tot ±35°. Verificatie"
          + "punt: leg de gepropageerde vy/vz naast de `proton_vy_gse`-feed op "
          + "gedeelde meetminuten. Alleen de VRIJE aanstroom volgt deze "
          + "vector; in de sheath bepaalt de vorm van de grens de richting.",
    inertWhen: [
      { when: "de feed draagt geen vx/vy/vz",
        why: "De kolommen zijn optioneel — de reeks blijft heel en de "
           + "aanstroom valt terug op de zonlijn, precies wat v1 altijd deed. "
           + "De readout zegt dan dat er geen vector is in plaats van 0° te "
           + "tonen, want nul graden is een echte stand en de verkeerde." }
    ] },

  { id: "wind-flow", label: "Aanstromende zonnewind", cls: "MODEL",
    frame: "gsm", clock: "arrival",
    source: "de gemeten v en n, langs de zonlijn, afgebogen om de grens",
    shownAs: ["layer:wind"],
    caveat: "GEEN DEELTJESBANEN. Dit is een stroomRICHTING met een gemeten "
          + "tempo: de snelheid schaalt met v (700 km/s gaat werkelijk 1,75× zo "
          + "snel als 400) en het aantal met n. De afbuiging om de "
          + "magnetopauze heen is echt en de richting klopt, maar de exacte "
          + "baan is getekend en niet opgelost — dit is geen MHD en er is geen "
          + "tweede vorm voor de schok, alleen een tweede neusafstand. De "
          + "vrije aanstroom volgt sinds sessie 30 de GEMETEN vector (zie "
          + "`wind-vector`) en niet meer de zonlijn; de afbuiging in de sheath "
          + "doet dat niet, want die is geformuleerd om de neus van de grens "
          + "heen. Die afbuiging kreeg in sessie 30 wel een KORTERE ARM (0,15 "
          + "waar de POC 0,6 heeft): met de POC-waarde begon de duw al buiten "
          + "de schok en werd 96% van alle sheath-deeltjes in de buitenste "
          + "tiende gehouden, zodat de stroom langs de bow shock scheerde in "
          + "plaats van langs de magnetopauze. De zon zelf staat nooit in "
          + "beeld — hij ligt 23.500 "
          + "aardstralen verder dan de rand van deze tekening; de sfeerlaag "
          + "verraadt hooguit zijn kant met een randgloed.",
    inertWhen: [
      { when: "er is geen standoff",
        why: "Zonder r₀ is er geen oppervlak om omheen te buigen, en een "
           + "rechte stroom dwars door de magnetosfeer zou het tegendeel "
           + "beweren van wat er gebeurt." },
      { when: "de bow shock ontbreekt",
        why: "Het Mach-getal heeft eigen invoer (v, n, T, |B|). Zonder schok "
           + "is er geen sheath, en dan is er geen tweede fase om te tekenen." }
    ] },

  { id: "wind-capture", label: "Invang op een open lijn", cls: "MODEL",
    frame: "gsm", clock: "arrival",
    source: "het kruispunt van een open veldlijn met de magnetopauze",
    shownAs: ["layer:wind"],
    caveat: "DE ZWAKSTE SCHAKEL VAN DE KETEN EN DE MOOISTE. Dát een open "
          + "veldlijn de magnetopauze kruist volgt uit de tracer, en het punt "
          + "wordt uit de getekende lijn en het getekende oppervlak berekend — "
          + "wat je ziet is dus waar het gebeurt. Maar WELK deeltje daar naar "
          + "binnen gaat is een reconnectievraag die dit model niet "
          + "beantwoordt. DE DEUR MOET IN DEZELFDE RICHTING ÉN BINNEN BEREIK "
          + "liggen (sessie 30, 12 Re): de richtingstoets alleen liet een "
          + "deeltje diep in de staart invallen op een deur bij de neus, want "
          + "vanaf de aarde gezien staan die in dezelfde richting — gemeten "
          + "mediane reis 28 Re en langste 66, af te leggen in 0,4 s, oftewel "
          + "elf keer de windsnelheid. Invangen mag bovendien alleen in de "
          + "binnenste helft van de sheath, want reconnectie hoort bij de "
          + "magnetopauze en niet bij de schok; vóór sessie 30 gebeurde ELKE "
          + "invang op diepte 0,99, pal op de schok. Het AANTAL deeltjes dat "
          + "werkelijk naar binnen rijdt "
          + "blijft de koppelingsfunctie en verandert hier niet door — de "
          + "keten laat zien hoe ze aankomen, niet hoeveel het er zijn. Wat "
          + "geen plek vindt glijdt langs de grens weg, en dat is de "
          + "meerderheid. Sinds sessie 30 SPRINGT het ingevangen deeltje niet "
          + "meer naar de lijn maar vliegt het er in 0,35-0,45 s naartoe. Dat "
          + "is tekening en geen baan: de tijd is gekozen om de overgang te "
          + "kunnen zien, niet gemeten. Het quotum telt hem op het moment van "
          + "invangen en niet bij aankomst, zodat de reisduur het AANTAL niet "
          + "kan veranderen." },

  { id: "aurora", label: "Instromende deeltjes", cls: "DERIVED",
    frame: "geo", clock: "arrival",
    source: "de open lijnen uit de tracer, met de koppeling als aantal",
    shownAs: ["row:r-aurora", "scene:aurora", "layer:aurora"],
    caveat: "Cusp en poolregen. De laag heet INSTROOM en niet aurora, en dat "
          + "is geen woordkeuze: de heldere aurora komt van de plasmalaag op "
          + "GESLOTEN lijnen, en die populatie gaat niet mee naar v1 — wat "
          + "hier rijdt is dus niet wat een waarnemer 's nachts ziet. "
          + "`Protonen` zou net zo mis zijn in de andere richting: wat via de "
          + "cusp binnenkomt is magnetosheath-plasma, dus protonen én "
          + "elektronen, en dit model onderscheidt de twee niet.",
    /* Geen kopie: dit is dezelfde lijst waar Core.Aurora.reason op beslist,
       en de node-toets bindt die twee aan elkaar. Alleen de gevallen die iets
       over de magnetosfeer zeggen; `off` en `building` zijn toestanden van de
       app en horen niet in een register van grootheden. */
    inertWhen: Core.Aurora.REASONS.filter(function (r) { return r.speaks; })
                  .map(function (r) { return { when: r.when, why: r.why }; }) },

  { id: "horizon", label: "Voorbij 6,62 Re", cls: "DERIVED",
    frame: "gsm", clock: "arrival", unit: "%",
    source: "het deel van de getekende lijnlengte buiten de GOES-baan",
    shownAs: ["row:r-horizon"],
    caveat: "Dit is waar GOES vliegt, en het is de enige straal waarop dit "
          + "project het veld werkelijk meet. Het percentage zegt dus hoeveel "
          + "van wat je ziet buiten bereik ligt van het enige instrument dat "
          + "het zou kunnen tegenspreken." },

  /* --- het veld en de aarde zelf --------------------------------------- */

  { id: "fieldlines", label: "Veldlijnen", cls: "MODEL",
    frame: "geo", clock: "arrival",
    source: "IGRF-14 intern + T89c extern, getraceerd in GSM",
    shownAs: ["scene:fieldlines", "layer:lines"],
    caveat: "Getraceerd in GSM vanuit aardvaste seeds, dus het beeld is een "
          + "registratie van twee frames en niet van één. De VELDWAARDEN zijn "
          + "gecontroleerd waar GOES vliegt; de getraceerde GEOMETRIE nergens: "
          + "geen instrument meldt of een lijn gezaaid op 70° gaat waar wij "
          + "hem tekenen." },

  /* --- het veld als raster, en de drie tekeningen die eruit leven ------ */

  /* WAAROM DIT EEN EIGEN GROOTHEID IS EN GEEN VOETNOOT. Het raster is het veld
     dat de drie getekende lagen lezen, en het is NIET hetzelfde veld dat de
     tracer leest: het is bemonsterd, geïnterpoleerd en tien minuten oud. Die
     drie verschillen samen zijn een eigen foutbudget, en een foutbudget dat in
     de caveat van een andere grootheid staat is een foutbudget dat niemand
     terugvindt. */
  { id: "fieldgrid", label: "Veldraster", cls: "MODEL",
    frame: "gsm", clock: "arrival", unit: "nT",
    source: "IGRF-14 + T89c, gebakken op drie geneste rasters (±5 · ±20 · ±70 "
          + "Re) als RESIDU na aftrek van een gesloten dipool",
    /* NIET onder `sporen`: een staart is de plek waar het deeltje wás en
       daar komt geen veld aan te pas. Die laag vraagt dus ook geen bake aan. */
    shownAs: ["layer:golf", "layer:gyro"],
    caveat: "HETZELFDE MODEL ALS DE VELDLIJNEN, ANDERS UITGELEZEN. De tracer "
          + "rekent het veld per stap uit; deze lagen hebben het 1800 keer per "
          + "frame nodig en dat kan niet. Vandaar een raster — en vandaar drie "
          + "getallen die erbij horen. EEN: het residu. Een uniform cartesisch "
          + "raster kan 1/r³ niet dragen; zonder de aftrek van de dipool stond "
          + "de richting bij r = 1,5 Re op 74 graden mis, met de aftrek op "
          + "0,000. TWEE: de bemonsteringsfout. Gemeten tegen het directe veld: "
          + "0,11° gemiddeld waar |B| > 20 nT en 2,5° in het ergste geval; de "
          + "uitschieters tot 48° liggen allemaal waar |B| onder 20 nT zakt — "
          + "plasmalaag en neutrale lijn, waar de RICHTING zelf slecht bepaald "
          + "is en niet ons raster. DRIE: de veroudering. Het raster wordt op "
          + "tien data-minuten gekwantiseerd en tijdens AFSPELEN helemaal niet "
          + "herbakken, want de worker bouwt ook de geometrie en die heeft "
          + "voorrang. Tien minuten kost gemiddeld 0,31° extra, ruim onder de "
          + "bemonsteringsfout; het paneel toont de leeftijd en de basisdraai "
          + "in graden zodat het geen aanname blijft. "
          + "HET RASTER BESLIST NIETS. Geen enkele topologie, geen enkele "
          + "classificatie en geen enkele deur komt hieruit — die lezen "
          + "allemaal de getracete lijn.",
    inertWhen: [
      { when: "geen van de drie getekende lagen staat aan",
        why: "Dan wordt er niets gebakken. Een bake kost 190 ms workertijd en "
           + "die thread bouwt ook de veldlijnen; er een uitgeven aan een laag "
           + "die niemand aankijkt is een rebuild wegnemen die wel gezien "
           + "wordt." },
      { when: "het raster heeft geen uitspraak op een punt",
        why: "Binnen 0,85 Re en buiten het modelbereik staat er NaN en geen "
           + "nul. De lagen reageren daarop met stilstand: de golving zet dat "
           + "punt vast, de gyratie laat zijn offset uitdoven. Nul zou een veld "
           + "zijn en dit is de afwezigheid van een uitspraak." }
    ] },

  { id: "fieldline-wave", label: "Golving", cls: "SCHEMATIC",
    frame: "gsm", clock: "arrival", unit: "Re",
    sourceId: "prop",
    source: "een getekende dwarse rimpel over de getracete lijn; de amplitude "
          + "weegt per punt met bRef/(bRef+|B|) uit het veldraster en schaalt "
          + "met de gemeten dynamische druk, en de PERIODE komt per lijn uit "
          + "de looptijd van een Alfvén-golf erlangs (2∫ds/V_A, met B uit het "
          + "raster en één aangenomen dichtheidsprofiel)",
    shownAs: ["scene:fieldlines", "layer:golf"],
    caveat: "ER LOPEN WERKELIJK GOLVEN OVER VELDLIJNEN, EN DIT IS ER GEEN. De "
          + "vorm is geleend van een Alfvén-achtige rimpel, maar geen meting "
          + "zegt dat er nu een loopt, hoe groot hij is of waar hij vandaan "
          + "komt. Wat de laag oplost is iets anders: de lijnen worden elke "
          + "twee minuten opnieuw getraceerd en SPRINGEN daar, en tussendoor "
          + "staat de tekening stil. "
          + "WAT WEL UIT METINGEN KOMT is waar de lijn slap is. De weging komt "
          + "uit het gebakken |B|, dus bij de aarde staat de lijn stil (30.000 "
          + "nT, weging 0,001) en in de staart beweegt hij (5 nT, weging 0,9) — "
          + "de voetpunten staan stil door het VELD en niet door een "
          + "instelling. En de amplitude hangt aan de gemeten druk. "
          + "DE GRENS IS AFDWINGBAAR EN GEEN AFSPRAAK: elk punt wordt elke stap "
          + "op 1,6 Re van de getracete lijn geprojecteerd, en wat er werkelijk "
          + "bereikt wordt staat in het paneel (gemeten: 1,00 Re, 62% van de "
          + "klem, rms 0,19). De CLASSIFICATIE ziet de rimpel niet: `seedAurora` "
          + "en `crossU` lezen de trace, en getoetst is dat geen enkele deur "
          + "erdoor verschijnt of verdwijnt. Zou iemand de rimpel WEL "
          + "classificeren, dan schoof het kruispunt 0,66% van de lijnlengte op "
          + "— dat getal staat erbij omdat het de omvang van de ingreep is en "
          + "niet omdat het gebeurt. "
          + "DE PERIODE IS SINDS SESSIE 31 EEN EIGENSCHAP VAN DE LIJN en niet "
          + "één getal voor allemaal. Ze is de heen-en-terugtijd van een "
          + "Alfvén-golf over die lijn: T = 2∫ds/V_A, met |B| per punt uit het "
          + "gebakken raster en de lijn uit de trace. Gemeten valt dat op 15 "
          + "tot 1.021 s (mediaan 325) — de Pc4/Pc5-band waarin "
          + "veldlijnresonanties werkelijk gemeten worden, en dat is een "
          + "CONTROLE en geen ijking. "
          + "DE ENIGE AANNAME IS DE DICHTHEID: n(r) = 100·(r/4 Re)^−4 /cm³, "
          + "want in de magnetosfeer meet deze app niets. Met een uniforme "
          + "dichtheid loopt de berekende periode over de lijnen uiteen met een "
          + "factor 13.936 en is ze niet te tekenen; met dit profiel 67×. "
          + "EN DE TEKENING VERSNELT: de mediane lijn golft in 5,4 s, dus 60× "
          + "sneller dan echt, en de spreiding wordt met een exponent van 0,5 "
          + "teruggebracht tot 8×. Beide zijn tekenkeuzes, allebei benoemd — "
          + "net als de 30× van de gyrostraal hiernaast.",
    inertWhen: [
      { when: "er is geen dynamische druk gemeten",
        why: "Dan is er geen aandrijving en staan de lijnen stil. Geen "
           + "huiswaarde: een rimpel bij een ontbrekende meting zou beweren dat "
           + "er iets waaide." },
      { when: "het veldraster is er nog niet",
        why: "De weging komt uit |B|. Zonder veld is er geen weging, en dan "
           + "staat de lijn stil in plaats van dat we een stijfheid verzinnen. "
           + "De periode valt dan terug op één vast getal voor alle lijnen, en "
           + "het paneel zegt hoeveel lijnen dat betreft." }
    ] },

  { id: "plasma-swarm", label: "Plasma", cls: "SCHEMATIC",
    frame: "gsm", clock: "arrival", unit: "Re",
    sourceId: "prop",
    source: "deeltjes met een eigen positie en snelheid, geintegreerd met "
          + "Boris om de veldrichting uit het gebakken raster, afgebogen op de "
          + "magnetopauze uit r0/alpha; snelheid en aanstroomrichting komen uit "
          + "de gemeten zonnewind",
    shownAs: ["scene:plasma", "layer:plasma"],
    caveat: "WAAR EEN DEELTJE HEEN GAAT IS HIER EEN UITKOMST EN GEEN BAAN. De "
          + "instroomketen hiernaast rijdt voorgeschreven routes — Flow."
          + "sheathVel voor de sheath, de getracete lijn voor de invang — omdat "
          + "het AANTAL daar de koppelingsfunctie is en de baan daar niets aan "
          + "mag veranderen. Deze laag doet het omgekeerde: elk deeltje heeft "
          + "een snelheid en botst zelf op wat er is. Dat het bij de neus "
          + "wegbuigt en langs een veldlijn naar de pool spiraalt is dus "
          + "gereden en niet ingetekend. "
          + "DE PRIJS IS DEZELFDE ALS BIJ DE GYRATIE: de RICHTING van B is "
          + "gemeten, de GROOTTE gaat door dezelfde logcompressie (vier decaden "
          + "passen niet in een beeld), dus de gyrostralen kloppen niet en deze "
          + "banen zijn geen deeltjesbanen die je zou naslaan. "
          + "HET AANTAL IS EEN TEKENKEUZE EN GEEN METING. Zesduizend punten "
          + "omdat dat leest als een plasma en 1,0 ms per frame kost; het zegt "
          + "niets over dichtheid. Het aantal instroomdeeltjes hiernaast is wel "
          + "een meting, en dat is precies waarom deze laag ernaast staat en "
          + "niet in plaats ervan. "
          + "WAT DE LAAG WEL EERLIJK TOONT: waar het veld heen wijst, waar de "
          + "grens ligt, hoe hard de wind waait en uit welke richting. Gemeten "
          + "met de sheath-koppeling uit: dan staat 31% van de deeltjes binnen "
          + "de magnetopauze in plaats van 10%, hoopt er niets op tussen grens "
          + "en schok (277 tegen 743 deeltjes in die schil) en remt er niets "
          + "af. Dat verschil IS de grens.",
    inertWhen: [
      { when: "er is geen zonnewindsnelheid gemeten",
        why: "Dan is er geen aandrijving en beweegt er niets. Geen huiswaarde: "
           + "een stromend plasma bij een ontbrekende meting zou beweren dat er "
           + "wind stond." },
      { when: "het veldraster is er nog niet",
        why: "Zonder veld is er geen rotatie en zouden het rechte lijnen zijn. "
           + "De laag wacht op de bake in plaats van vast te vliegen." },
      { when: "er is geen standoff, dus geen magnetopauze",
        why: "Dan is er niets om omheen te buigen en stroomt alles rechtdoor. "
           + "De grens is de uitspraak van deze laag; zonder grens doet hij er "
           + "geen." }
    ] },

  { id: "sheath-gyration", label: "Gyratie", cls: "SCHEMATIC",
    frame: "gsm", clock: "arrival", unit: "Re",
    source: "een offset die met de exacte Boris-rotatie om de gemeten "
          + "veldrichting draait, met een gekozen hoeksnelheid",
    shownAs: ["scene:aurora", "layer:gyro"],
    caveat: "DE ECHTE GYROSTRAAL IS EEN DERDE PIXEL. In de sheath is |B| "
          + "ongeveer 20 nT en de zonnewind 400 km/s; een proton draait daar "
          + "met 1,9 rad/s en heeft dus een gyrostraal van ~210 km, oftewel "
          + "0,033 Re. Er is geen zoomstand waarbij dat ECHT is en tegelijk te "
          + "zien. Wat je ziet is 15 tot 30 keer zo groot. "
          + "WAT WEL ECHT IS, IS DE AS. Er wordt om de veldrichting uit het "
          + "raster gedraaid en die staat op een tiende graad na waar hij "
          + "hoort; de straal volgt v/omega met de gecomprimeerde |B|, dus een "
          + "sterk veld geeft een strakke boog en een zwak veld een wijde. "
          + "DE BAAN IS NIET VAN DEZE LAAG. Het deeltje wordt niet verplaatst: "
          + "de baan blijft bit voor bit die van Flow.sheathVel en er komt een "
          + "offset bovenop, geklemd op 1,0 Re. Dat is een gemeten keuze en "
          + "geen voorzichtigheid — de eerste opzet gaf het deeltje een echte "
          + "snelheid en sleepte die naar de stroming terug, en dan wint de "
          + "magnetisering: het deeltje liep in drie seconden 4,4 Re weg van de "
          + "baan en de stroom boog niet meer om de magnetopauze. In de echte "
          + "magnetosheath is de plasmabeta hoog en draagt de STROMING het "
          + "veld, niet andersom. "
          + "De invang, de deurzoeker, de opruimregel en alle tellingen lezen "
          + "de baan en niet de tekening, dus dit verandert er geen van vieren.",
    inertWhen: [
      { when: "het veldraster heeft hier geen uitspraak",
        why: "Dan dooft de offset uit naar nul en staat het deeltje precies "
           + "waar zijn baan het zegt. Uitdoven en niet wegklappen: een offset "
           + "die in één frame verdwijnt leest als een gebeurtenis, en er "
           + "gebeurt niets." }
    ] },

  { id: "flow-trails", label: "Sporen", cls: "SCHEMATIC",
    frame: "gsm", clock: "arrival",
    source: "de laatste zeven getekende posities per deeltje, additief gemengd",
    shownAs: ["scene:trails", "layer:sporen"],
    caveat: "DECOR MET ÉÉN EERLIJKE EIGENSCHAP: de staart is de plek waar het "
          + "deeltje werkelijk was, dus de LENGTE ervan is de snelheid — een "
          + "wind van 700 km/s trekt een staart die 1,75 keer zo lang is als "
          + "een van 400. Dat is dezelfde grootheid die het tempo van de "
          + "deeltjes stuurt en geen tweede uitspraak. "
          + "Wat er NIET in zit: dit is geen baan die uitgerekend is en geen "
          + "spoor dat iets achterlaat. Bemonsterd op 1/24 s en niet per frame, "
          + "zodat de staart bij 30 en bij 60 beelden per seconde even lang is "
          + "in modeltijd; zeven punten geven een kwart seconde, bij de "
          + "gebruikelijke wind ongeveer 1,5 Re. De kleur is die van de kop en "
          + "wordt met hem gedeeld — een staart in een derde kleur zou een "
          + "derde populatie suggereren. Er komt geen deeltje bij en er gaat er "
          + "geen af." },

  { id: "dipole-axis", label: "Dipoolas", cls: "DERIVED",
    frame: "geo", clock: "none", source: "IGRF g10, g11, h11",
    shownAs: ["layer:axis"],
    caveat: "De richting van het dipoolmoment uit de eerste drie IGRF-"
          + "coëfficiënten, getekend tot 2,6 aardstralen aan weerszijden — dus "
          + "dwars door de planeet heen, want juist wáár hij het oppervlak "
          + "kruist onderscheidt magnetisch noord van geografisch noord. "
          + "GESTREEPT omdat het een RICHTING is en geen veldlijn of baan: er "
          + "is niets langs deze lijn te volgen. De N staat bij de noordelijke "
          + "tip en valt in 3D weg zodra die achter de aarde staat; de lijn "
          + "zelf blijft dan wel staan. Dit is een as van het VELD en niet van "
          + "de rotatie — de hoek tussen die twee is precies wat deze lijn "
          + "toont." },

  { id: "saa", label: "Zwakveldgebied", cls: "MODEL",
    frame: "geo", clock: "none", source: "IGRF-14, drempel 32.000 nT",
    shownAs: ["scene:saa", "layer:saa"],
    caveat: "De drempel is van ons en geen gepubliceerde grens. Er zit geen "
          + "grond- of laagbaanmagnetometer in deze app, dus de contour is "
          + "IGRF die tegen zichzelf praat." },

  { id: "earth", label: "De aarde", cls: "ANALYTIC",
    frame: "geo", clock: "arrival", source: "geometrie + zonnealmanak",
    shownAs: ["scene:earth", "scene:terminator"],
    caveat: "De dag-nachtgrens is getekend voor het moment van AANKOMST en "
          + "niet voor het moment van meten." },

  { id: "graticule", label: "Graticule", cls: "ANALYTIC",
    frame: "geo", clock: "none", source: "geometrie",
    shownAs: ["scene:graticule", "layer:grat"] },

  { id: "grid", label: "Schaalraster", cls: "ANALYTIC",
    frame: "gsm", clock: "none", unit: "Re",
    source: "de orthografische projectie zelf (Core.Registration)",
    shownAs: ["layer:grid"],
    caveat: "Staat ALLEEN in de doorsnede. Een raster is een schaal, en een "
          + "perspectiefbeeld heeft er geen — daar is een pixel vooraan iets "
          + "anders waard dan achteraan. Over de 3D-view getekend zou het een "
          + "maat beloven die er niet is. De stap klikt vast op 1 · 2 · 5 × "
          + "10ⁿ Re bij ongeveer 90 px, dus hij verspringt bij zoomen; het "
          + "getal px/Re staat erbij en is hetzelfde getal waaruit de "
          + "Three.js-frustum wordt gezet." },

  { id: "goes-pos", label: "GOES-positie", cls: "ANALYTIC",
    frame: "geo", clock: "earth", unit: "Re",
    sourceId: "goes-mag",
    source: "lengtegraad op 6,62 Re, naar GSM gedraaid met de dipoolbasis",
    shownAs: ["layer:goes"],
    beyond: "geen lengtegraad zonder de GOES-feed",
    caveat: "In de doorsnede is de stip HOL zodra het toestel meer dan 0,5 Re "
          + "uit het tekenvlak staat, en dat is bijna altijd: de baan ligt op "
          + "de evenaar en het vlak op de zonlijn. Een volle stip zou beweren "
          + "dat het toestel staat waar je het ziet. Het label noemt de "
          + "y-component, zodat de afwijking een getal is en geen indruk. "
          + "De ARCJET-minuten kleuren de stip en krijgen een ring: de "
          + "stuurmotoren verstoren de eigen magnetometer, en die samples "
          + "worden gevlagd en niet verwijderd — een weggelaten sample is "
          + "ook een bewering." },

  { id: "clock", label: "Aankomstklok", cls: "ANALYTIC",
    frame: "none", clock: "arrival", source: "de tijdstempels van de bron",
    shownAs: ["row:r-clock", "row:r-when", "row:r-window"],
    caveat: "De geometrie volgt de klok op 2 minuten nauwkeurig: de spec wordt "
          + "gekwantiseerd voordat er een herbouw wordt aangevraagd. Dat is "
          + "geen rem maar een uitspraak over hoe fijn het model de klok "
          + "volgt, en hij staat in het paneel." },

  { id: "sfeer", label: "Sfeerlaag", cls: "SCHEMATIC",
    frame: "none", clock: "none",
    source: "Terra's effectketen (bloom 0,1/0,3/0,75 · grade 1,06/1,12/0,005 "
          + "· tint 0,96/1/1,04), overgenomen parameter voor parameter",
    shownAs: ["layer:sfeer"],
    caveat: "Postprocessing over het hele beeld: de gewone schermrender wordt "
          + "naar een textuur gekopieerd en bloom en grade werken dáárop — op "
          + "schermwaarden dus, precies wat Terra's drempel 0,75 en contrast "
          + "om 0,5 betekenen, want daar ís de buffer het scherm. Met de knop "
          + "uit is het beeld pixel-neutraal ten opzichte van de directe "
          + "render — dat is een METING (TERRA.sfeerNeutraal, gemeten Δ = 0), "
          + "geen belofte. De chromatische aberratie verschuift R/B tot "
          + "~4,5 px in de hoeken; het gemetene leeft in het centrum en de "
          + "overlay (raster, toestellen) doet niet mee aan de keten en "
          + "blijft scherp." },

  { id: "stars", label: "Sterrenhemel", cls: "SCHEMATIC",
    frame: "none", clock: "none",
    source: "Melkweg-foto, Solar System Scope (CC BY 4.0) — dezelfde als Terra",
    shownAs: ["scene:stars", "layer:sterren"],
    caveat: "Decor: de Melkweg staat waar hij mooi staat, niet waar hij is — "
          + "de bol draait niet met de hemel mee en is niet astronomisch "
          + "geregistreerd. Gedempt tot 0,5 zodat de felste ster onder de "
          + "bloomdrempel blijft; bron en licentie in assets/ATTRIBUTION.md. "
          + "ALLEEN IN PERSPECTIEF (sessie 30): de doorsnede is een diagram in "
          + "Re en geen uitzicht, dus daar staan de sterren uit en is de knop "
          + "uitgezet — het spiegelbeeld van `grid`. Dat lost tegelijk een "
          + "gemeten fout op: de bol heeft een vaste straal 900 terwijl de "
          + "doorsnede met het frustum zoomt, waardoor de foto bij inzoomen "
          + "uitsmeerde tot een lichte schuine vlek (bij dist 27 gemeten op "
          + "R +2,5 · G +5,2 · B +4,2)." },

  { id: "fog", label: "Dampkringwaas", cls: "SCHEMATIC",
    frame: "geo", clock: "none",
    source: "Terra's fresnel-waas (fogStrength 1,0 · fogPower 3,0 · #b6c4d6)",
    shownAs: ["scene:fog", "layer:sfeer"],
    caveat: "Een schil een halve procent boven het oppervlak die naar de rand "
          + "toe dichttrekt. Het is een waas en geen atmosfeermodel: de dikte "
          + "zegt niets over de echte dampkring." },

  { id: "sun-glow", label: "Zonzijde-gloed", cls: "SCHEMATIC",
    frame: "gsm", clock: "none",
    source: "een schermrand-gloed in de grade-pass, gericht langs de zonlijn",
    shownAs: ["layer:sfeer"],
    caveat: "Geen object en geen schaal, en dat is een MAAT-argument: de zon "
          + "staat op 23.500 aardstralen met een straal van 109 — elke bol in "
          + "deze scene liegt over schaal of over afstand. De gloed leest de "
          + "zon daarom als RICHTING en verraadt alleen hoe de camera ertoe "
          + "staat: er recht in gekeken loopt hij rondom (elke rand ligt dan "
          + "even ver van de zon), opzij wordt hij een rand aan die kant — in "
          + "de doorsnede altijd de zonzijde — en met de zon in de rug blijft "
          + "een gedempte onderrand over. Nooit een tweede lichtbron: de "
          + "scene zelf wordt er niet door verlicht." }
];


/* ---------- 4. De drie lijnstaten ----------------------------------------- */

/* Wat de legenda toont naast de drie kleuren. `onopgelost` staat er met opzet
   als DERDE en niet als "de rest": hij is een uitspraak over de INTEGRATIE en
   de andere twee over de magnetosfeer. */
/* De `why` is geschreven om ACHTER het label te lezen — "dicht — beide voeten
   op aarde" — want dat is de vorm waarin hij op het scherm staat. Een zin die
   los begint met een hoofdletter leest daar als een tweede zin. */
var LINE_STATES = [
  { id: "closed", label: "dicht",
    why: "beide voeten op aarde." },
  { id: "open", label: "open",
    why: "kruist de magnetopauze, hetzelfde oppervlak dat getekend wordt." },
  { id: "unresolved", label: "onopgelost",
    why: "de integratie, niet de magnetosfeer. De tracer liep uit de ruimte "
       + "of uit de stappen, en dat wordt apart geteld in plaats van bij open "
       + "of dicht opgeteld." }
];


/* ---------- 5. De gekozen vereenvoudigingen ------------------------------- */

/* Twee, en ze stonden tot nu toe als proza in renderNote(). Ze horen data te
   zijn om dezelfde reden als al het andere hier: een tekst in een functie kan
   stil verlopen ten opzichte van de code eromheen.

   Het onderscheid dat beide dragen: dit zijn KEUZES en geen ontbrekende
   metingen. Een ontbrekende meting hoort in `inertWhen` en leidt tot een
   weigering; een vereenvoudiging is iets wat we kunnen en niet doen. */
var SIMPLIFICATIONS = [
  { id: "no-aberration", label: "De magnetopauze staat op de zonlijn",
    why: "De POC mat de aanstroomhoek op 4,84° en kantelt Shue daarheen; v1 "
       + "modelleert de aberratie niet en zet de grens op de zonlijn.",
    kind: "gekozen vereenvoudiging" },

  { id: "seed-quantised", label: "De poolkaprand is gekwantiseerd",
    why: "Het seed-raster is 6° bij vijf schillen, dus de rand kan niet "
       + "fijner liggen dan die stap. De POC bisecteert hem; die bisectie had "
       + "drie consumenten en die gaan geen van drieën mee.",
    kind: "gekozen vereenvoudiging" }
];


/* ---------- 5c. Wat een kleurVERSCHIL betekent ---------------------------- */

/* De drie lijnstaten hierboven hebben elk hun eigen kleur; dit gaat over de
   twee coderingen die BINNEN zo'n kleur werken, of naast de staten om. Ze
   staan hier los omdat ze iets anders zijn dan een categorie: geen van beide
   voegt een staat toe, ze verbijzonderen er een.

   Een kleur op het scherm zonder regel die hem verklaart is decoratie, en
   erger: hij leest als een categorie die er niet is. */
var TINTS = [
  { id: "mp-bz", label: "De kleur van de magnetopauze is Bz",
    why: "Cyaan bij noordwaarts (Bz ≥ 0), oranje bij zuidwaarts, en onder "
       + "−10 nT roze — daar kan de standoff binnen de geostationaire baan "
       + "zakken. De drempels komen uit de POC. Alleen de grens verkleurt, "
       + "niet de schok: de grens is het oppervlak dat beslist wat open is. "
       + "Zonder Bz-meting is er geen toestand en dus geen kleur." },

  { id: "hemi", label: "Lichter en warmer is noord, donkerder en koeler is zuid",
    why: "Een tint BINNEN de staat van een lijn, niet naast de drie staten. "
       + "Alleen om de twee bundels uit elkaar te houden waar ze elkaar in de "
       + "staart kruisen; open blijft open en dicht blijft dicht. De warm/koel-"
       + "kanteling van 6,5 graden is de lezing van een schoolmagneet zonder "
       + "zijn kleuren: warm is dáár de noordpool, en hier is het een nuance "
       + "bovenop de staat in plaats van een vervanging ervan. Wat een lijn "
       + "ROOD of BLAUW zou maken is bij ons dus niet in gebruik — die kleuren "
       + "zijn hier de magnetopauze bij zuidwaartse Bz en het zwakveldgebied." },

  { id: "mp-band", label: "De band om de grens is σ = 1 Re",
    why: "De spreiding van de waargenomen passages waarop Shue et al. 1998 is "
       + "gefit — een getal van hen. Een lijn van één pixel zou een precisie "
       + "beloven die de fit niet heeft. Het is GEEN gemeten onzekerheid van "
       + "dit moment." }
];


/* ---------- 6. Wat ermee te doen is --------------------------------------- */

var Registry = {
  FRAMES: FRAMES, CLOCKS: CLOCKS, CLASSES: CLASSES,
  SOURCES: SOURCES, ENTRIES: ENTRIES,
  LINE_STATES: LINE_STATES, SIMPLIFICATIONS: SIMPLIFICATIONS, TINTS: TINTS,

  entry: function (id) {
    for (var i = 0; i < ENTRIES.length; i++) if (ENTRIES[i].id === id) return ENTRIES[i];
    return null;
  },

  source: function (id) {
    for (var i = 0; i < SOURCES.length; i++) if (SOURCES[i].id === id) return SOURCES[i];
    return null;
  },

  /* Alle `shownAs`-verwijzingen van één soort, ontdubbeld. Dit is wat de
     checks aan de andere kant vergelijken: sceneIds() tegen scene.traverse(),
     rowIds() tegen de DOM, laneIds() tegen Strip.LANES. */
  shown: function (kind) {
    var pre = kind + ":", out = [], zien = {};
    for (var i = 0; i < ENTRIES.length; i++) {
      var s = ENTRIES[i].shownAs || [];
      for (var j = 0; j < s.length; j++) {
        if (s[j].indexOf(pre) !== 0) continue;
        var id = s[j].slice(pre.length);
        if (!zien[id]) { zien[id] = 1; out.push(id); }
      }
    }
    return out.sort();
  },

  /* Welke grootheden op één plek staan — zodat een scene-object of een rij
     terug te lezen is naar zijn herkomst in plaats van alleen andersom. */
  entriesShownAs: function (ref) {
    var out = [];
    for (var i = 0; i < ENTRIES.length; i++) {
      if ((ENTRIES[i].shownAs || []).indexOf(ref) >= 0) out.push(ENTRIES[i]);
    }
    return out;
  },

  /* De interne samenhang, zonder browser en zonder bestandssysteem. Wat hier
     omvalt is een fout in dit bestand zelf; of de app het ook zo doet is een
     andere vraag, en die stelt de zelftoets in terra.html.               */
  audit: function () {
    var faults = [], zien = {};
    for (var i = 0; i < ENTRIES.length; i++) {
      var e = ENTRIES[i], waar = "entry " + e.id + ": ";
      if (zien[e.id]) faults.push(waar + "id komt twee keer voor");
      zien[e.id] = 1;
      if (!e.label) faults.push(waar + "geen label");
      if (!CLASSES[e.cls]) faults.push(waar + "onbekende klasse " + e.cls);
      if (!FRAMES[e.frame]) faults.push(waar + "onbekend frame " + e.frame);
      if (!CLOCKS[e.clock]) faults.push(waar + "onbekende klok " + e.clock);
      if (!e.shownAs || !e.shownAs.length) faults.push(waar + "staat nergens op het scherm");
      for (var j = 0; j < (e.shownAs || []).length; j++) {
        if (!/^(row|lane|scene|layer):[a-z0-9-]+$/.test(e.shownAs[j])) {
          faults.push(waar + "onbruikbare shownAs " + e.shownAs[j]);
        }
      }
      if (e.sourceId && !this.source(e.sourceId)) {
        faults.push(waar + "onbekende bron " + e.sourceId);
      }
      /* Een grootheid met een bron hoort te zeggen wat er gebeurt als die
         bron ophoudt. Zonder bron — geometrie, constanten — is die vraag
         betekenisloos en zou een `beyond` juist verwarren. */
      if (e.sourceId && !e.beyond && !e.inertWhen) {
        faults.push(waar + "heeft een bron maar zegt niet wat er gebeurt als die wegvalt");
      }
      for (var k = 0; k < (e.inertWhen || []).length; k++) {
        var w = e.inertWhen[k];
        if (!w.when || !w.why) faults.push(waar + "inertWhen " + k + " mist when of why");
      }
    }
    /* En de andere kant op: een lane die geen grootheid heeft is een lijn op
       het scherm zonder herkomst. */
    var gedekt = this.shown("lane");
    for (var m = 0; m < Strip.LANES.length; m++) {
      if (gedekt.indexOf(Strip.LANES[m].id) < 0) {
        faults.push("lane " + Strip.LANES[m].id + " staat in de strip en niet in de registry");
      }
    }
    return { total: ENTRIES.length, faults: faults };
  }
};

if (isNode) module.exports = Registry;
else root.TerraRegistry = Registry;

})(typeof globalThis !== "undefined" ? globalThis : this);