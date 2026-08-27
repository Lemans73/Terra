/* ============================================================
   TERRA — Wat de bezoeker heeft ingesteld, en dat onthouden
   ------------------------------------------------------------
   Terra opende tot nu toe voor iedereen hetzelfde. Wie de wolken
   uitzette, de poolverschuiving aanzette en de bosbranden wegklikte,
   deed dat elke keer opnieuw. Dit bestand maakt van Terra een app
   die van jou is: alles wat de scene kan maken blijft staan.

   WAAROM DIT ÉÉN REGISTER IS EN GEEN LAAG EROVERHEEN.

   Een beginstand stond in dit project op DRIE TOT VIER PLEKKEN, en
   de code zei dat zelf ook. Letterlijk, bij `bindCosmosToggle`:
   "drie plekken die één verhaal vertellen" — de klasse `on` in de
   markup, de `start`-parameter bij het aanmelden, en `setVisible()`
   onderaan de laag. Eén regel lager, bij de zonnevlekken: "Dit is de
   vierde plek die met de andere drie moet overeenkomen." Dezelfde
   noot staat in js/geomag-layer.js.

   Een voorkeurenlaag ERBOVENOP zou daar een vijfde plek aan
   toevoegen: "en soms komt hij uit localStorage". Dat is precies de
   tweede waarheid die dit project overal dichtzet. Dus andersom:

     DIT BESTAND IS DE ENIGE BRON VAN EEN BEGINSTAND.

   De markup krijgt zijn klasse `on` hiervandaan, de aanmeldingen
   lezen hun `start` hieruit, en de lagen krijgen hun eerste
   `setVisible()` erlangs. Wat op vier plekken stond, staat hier.

   ALLEEN AFWIJKINGEN WORDEN BEWAARD, en dat is geen zuinigheid maar
   een uitspraak. Wie een schakelaar nooit heeft aangeraakt, hoort de
   fabrieksstand te volgen — ook als die later verandert. Zouden we
   alle 66 waarden wegschrijven, dan bevriest de eerste bezoeker zijn
   app op de standen van vandaag en ziet hij nooit meer een
   verbetering aan een default die hij niet eens kende.

   ÉÉN SLEUTEL IN localStorage EN NIET ZESENZESTIG. Eén JSON-object
   betekent één try/catch, één quotafout om af te vangen, en een
   versieveld waarmee een latere hernoeming te migreren is.

   WAT ER NIET IN ZIT, EN DAT IS EEN BESLUIT (Terry, sessie 35):

     het MOMENT       Terra opent altijd op "nu". Wie naar 1900 reisde
                      en afsloot, zou terugkomen op een moment waar de
                      helft van de lagen op slot staat — aqi, lightning
                      en aurora kennen alleen het heden. Terugreizen is
                      één sleep; uitleggen waarom alles op slot staat niet.
     de VIEW-STATE    altijd op de aarde beginnen. De aarde is de
                      thuisbasis waar elke andere weergave op terugvalt
                      ("Back to Earth"), en dus ook het beginpunt.
     de CAMERASTAND   de aarde staat bij een volgende start op een
                      andere rotatie, dus een herstelde camerapositie
                      kijkt naar een ander stuk oppervlak dan waar je
                      hem achterliet. Dat leest als een fout, niet als
                      een voorkeur.

   De SLIDERSCHAAL en de AFSPEELSNELHEID zitten er wél in: dat zijn
   instellingen en geen moment. Zie de drie tijdbegrippen die in dit
   project uit elkaar gehouden worden — moment, sliderschaal,
   datavenster — waarvan alleen het eerste een plek in de tijd is.
   ============================================================ */

/* De ene sleutel, en het versienummer erin. Wie ooit een sleutelnaam
   hernoemt, verhoogt dit en schrijft een tak in `migreer()`; zonder
   versie is er geen manier om oud van nieuw te onderscheiden. */
const PREFS_STORE = 'terra-prefs';
const PREFS_VERSIE = 1;

/* De vier sleutels die vóór sessie 35 los in localStorage stonden. Ze
   worden één keer ingelezen en dan opgeruimd — niemand hoort zijn
   textuurkwaliteit kwijt te raken omdat de opslag verhuisde. De
   waarde-omzetting staat erbij, want ze stonden als '1'/'0'. */
const PREFS_OUD = {
  'terra-tex-quality': { naar: 'pref.texQuality', lees: (v) => v },
  'terra-ocean-floor': { naar: 'tex.ocean',       lees: (v) => v === '1' },
  'terra-utc':         { naar: 'pref.utc',        lees: (v) => v === '1' }
};

/* DE SLEUTEL VAN DE TEKENLAAG STAAT HIER MET OPZET NIET IN.

   Die draagt geen voorkeur maar de GETEKENDE VORMEN zelf: de tekenmodule
   schrijft er haar hele Store in. Hem hierin opnemen zou betekenen dat de
   migratie hieronder `removeItem` doet en iemands tekening wist bij de eerste
   start na deze versie. Die laag houdt dus haar eigen opslag.

   (Het woord dat die laag in dit project heet, staat hier bewust niet
   uitgeschreven: de standalone knipt haar eruit en de bouwvangrail valt op elk
   voorkomen ervan buiten de markers — ook in commentaar. Zie
   tools/build-standalone.mjs.) */

/* ------------------------------------------------------------
   DE FABRIEKSSTANDEN.

   Dit is de lijst waar de markup, de aanmeldingen en de lagen hun
   beginstand vandaan halen. Een schakelaar die hier niet in staat,
   valt door de vangrail in `ontbrekend()` — een stille schakelaar
   die niets bewaart zou pas opvallen als een bezoeker klaagt.

   DE DATALAGEN BEGINNEN LEEG OP TWEE NA (Terry, sessie 35). Tot deze
   sessie stonden storms, sea ice, wildfires en lightning ook aan, en
   dan opende Terra met vijf soorten markeringen over elkaar heen.
   Nu zijn het er twee, en wie meer wil krijgt dat terug zodra hij het
   één keer aanzet.

   EN DIT SCHEELT OOK OPHALEN, sinds sessie 36. Tot dan niet: `pull()`
   in index.html kende alleen `adapter.enabled` en niet `active[laag]`,
   dus bevroegen de adapters hun bron ongeacht of hun laag zichtbaar
   was — gemeten ~512 KB per opstart voor lagen die niemand zag, met de
   aurora als enige uitzondering. `syncLayerFeeds()` vertaalt de
   laagstand nu door naar `adapter.enabled`, dus deze regels gaan over
   wat je ziet bij een eerste start én over wat daarvoor gehaald wordt.
------------------------------------------------------------ */
export const PREFS_DEFAULTS = {
  /* ---- De databronnen. `active` in index.html leest deze. ---- */
  'layer.quake':     true,
  'layer.volcano':   true,
  'layer.storm':     false,
  'layer.ice':       false,
  'layer.wildfire':  false,
  'layer.aqi':       false,
  'layer.lightning': false,
  'layer.aurora':    false,

  /* ---- De aarde zelf ---- */
  'tex.night':    true,
  'tex.clouds':   true,
  'tex.specular': true,
  'tex.normal':   true,
  'tex.ocean':    true,
  'tex.wave':     true,
  'tex.wire':     false,
  'pref.texQuality': '2k',

  /* ---- Wat er op de bol getekend wordt ---- */
  'overlay.plates':  true,
  'overlay.borders': false,
  'overlay.names':   true,

  /* ---- Assen en polen ---- */
  'axes.rotation':   false,
  'axes.dipole':     false,
  'axes.drift':      false,
  'axes.polarmotion': false,

  /* ---- Zon en maan ---- */
  'sunmoon.subpoint': true,
  'sunmoon.leaders':  true,
  'sunmoon.align':    true,
  'sunmoon.tracks':   true,
  'sunmoon.ticks':    true,
  'sunmoon.twilight': true,
  'sunmoon.eclipse':  true,
  'sunmoon.sunspots': true,

  /* ---- De hemelprojecties ---- */
  'sky.planets':  false,
  'sky.ecliptic': false,
  'sky.equator':  false,
  'sky.ragrid':   false,
  'sky.eclgrid':  false,

  /* ---- De magnetosfeer ---- */
  'msp.magnetopause': true,
  'msp.bowshock':     true,
  'msp.fieldlines':   true,
  'msp.grid':         true,
  'msp.dipole':       false,
  'msp.wind':         true,
  'msp.goes':         true,

  /* ---- De ruimte ---- */
  'space.lagrange': false,
  'planet.mercury': true,
  'planet.venus':   true,
  'planet.mars':    true,
  'planet.jupiter': true,
  'planet.saturn':  true,
  'planet.uranus':  true,
  'planet.neptune': true,

  /* ---- Voorkeuren ---- */
  'pref.sound':      true,
  'pref.quakeLabels': true,
  'pref.autoRotate': true,
  'pref.utc':        false,
  'pref.labelCount': 12,
  'pref.nightGlow':  12,

  /* ---- Welke aardbeving-indicator ---- (sessie 40)
     Drie standen, en `both` is er om te METEN en niet om te kijken:

       'v1'    de bestaande drie meshes per beving (gloed, kern, shockwave)
       'v2'    de instanced ring- en shockwave-lagen uit de workbench
       'both'  allebei tegelijk — zo is de schermafstand tussen de twee
               indicatoren te meten, de toets uit het integratiecontract

     BEGINT OP 'v1', en dat is de afspraak uit dat contract: de oude indicator
     blijft staan zolang de nieuwe niet bewezen is. Terugkeren is daarmee een
     schakelaar en geen revert. */
  'pref.quakeIndicator': 'v1',

  /* ---- Toegankelijkheid ---- (sessie 40)

     `pref.reducedMotion` is de enige met een BEREKENDE fabrieksstand: hij begint
     op wat het systeem zegt (prefers-reduced-motion) en niet op een vast getal.
     Dat kan hier, want dit register wordt bij het laden opgebouwd en de
     mediaquery is dan al te lezen.

     ALLEEN AFWIJKINGEN WORDEN BEWAARD, en dat werkt hier precies goed: wie de
     schakelaar nooit aanraakt volgt het systeem, ook als die voorkeur later
     verandert. Wie hem wél omzet, wint daarvan. */
  'pref.reducedMotion': (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false,
  'pref.labelOutline': true,
  'pref.labelWhite': false,

  /* ---- De gloed (sessie 41, Terry) ----

     De UnrealBloomPass staat er sinds het begin en was tot nu toe alleen via de
     drie `bloom*`-getallen in js/config.js te temperen. Op nul gezet blijft de
     pass toch draaien, en dat is precies de vraag die deze schakelaar
     beantwoordt: is wat je ziet nog gloed, of iets anders?

     BEGINT AAN, want dat is hoe Terra er tot nu toe uitzag. Uit is een keuze en
     geen nieuwe standaard. */
  'pref.bloom': true,

  /* ---- De aardbevingen: de bron en het magnitudevenster ----
     `quake.source` is de adapter-id ('emsc' of 'usgs'). ALLEEN DE KNOP schrijft
     hem: de dekkingstoets in index.html wisselt ook van bron zodra de gekozen
     die periode niet dekt, en dat is een omstandigheid en geen voorkeur. Zou
     die meeschrijven, dan onthield Terra 'USGS' omdat je één keer naar 1950
     reisde. Zelfde onderscheid als bij de datalagen en bij auto-rotate.

     `quake.magMax` is null voor 'geen bovengrens' — en null is hier een echte
     waarde en geen ontbrekende. */
  'quake.source': 'emsc',
  'quake.magMin': 2,
  'quake.magMax': null,

  /* ---- De tekenlaag: alleen de doorzichtigheid ----
     Haar VORMEN en haar zichtbaarheid blijven bij haarzelf (zie de noot
     bovenaan); dit is de schuif ernaast, en die is een gewone voorkeur. */
  'draw.opacity': 100,

  /* ---- De tijdlijn: de SCHAAL en de SNELHEID, niet het moment ----
     `time.span` draagt de waarde die `timeWindow` in index.html gebruikt, en dat
     is 'hour' | 'day' | 'week' — niet de tekst op de knop. Een eerste versie had
     hier '1d' staan: dat leest goed en levert een leeg venster op. */
  'time.span':  'day',
  'time.speed': 50
  /* DE TEKENLAAG STAAT HIER NIET IN, en dat is een besluit. Haar vormen hebben
     hun eigen opslag, en index.html zet de laag al terug zodra daar iets in
     staat — de zichtbaarheid VOLGT dus uit de tekening en is geen tweede vlag.
     Een sleutel hier zou die twee uit elkaar kunnen laten lopen: een tekening
     die bestaat maar verborgen is, of andersom. Zie de noot bovenaan. */
};

/* ------------------------------------------------------------
   DE OPSLAG.

   Elke aanraking van localStorage staat in een try/catch. Dat is niet
   overdreven: in private mode gooit `setItem` bij de eerste schrijf, en
   een browser met een volle quota doet dat ook. Terra hoort dan gewoon
   te starten op fabrieksstanden in plaats van om te vallen — een app
   die niet opent omdat hij een voorkeur niet kan onthouden, heeft zijn
   prioriteiten omgedraaid.
------------------------------------------------------------ */
let waarden = {};          // alleen de AFWIJKINGEN van de fabrieksstand
let geladen = false;
let schrijfTimer = null;
let opslagWerkt = true;    // valt om bij de eerste mislukte schrijf

function leesRuw() {
  try { return localStorage.getItem(PREFS_STORE); }
  catch { opslagWerkt = false; return null; }
}

/* De oude losse sleutels binnenhalen en opruimen. Eén ronde: na de
   eerste start met deze versie bestaan ze niet meer.

   DE OUDE WAARDE WINT NIET VAN EEN NIEUWE. Staat er al iets in het
   register voor dezelfde sleutel, dan is dat recenter en blijft het
   staan — anders zou een migratie die twee keer draait een keuze van
   vandaag terugdraaien naar een keuze van vorige week. */
function migreer() {
  for (const [oud, spec] of Object.entries(PREFS_OUD)) {
    let ruw = null;
    try { ruw = localStorage.getItem(oud); } catch { return; }
    if (ruw === null) continue;
    if (!(spec.naar in waarden)) {
      const v = spec.lees(ruw);
      if (v !== PREFS_DEFAULTS[spec.naar]) waarden[spec.naar] = v;
    }
    try { localStorage.removeItem(oud); } catch {}
  }
}

function laad() {
  if (geladen) return;
  geladen = true;
  const ruw = leesRuw();
  if (ruw) {
    try {
      const o = JSON.parse(ruw);
      /* EEN ONBEKENDE VERSIE IS GEEN REDEN OM ALLES WEG TE GOOIEN, maar
         wel om niets aan te nemen over de vorm. Bij een hogere versie —
         de bezoeker draaide een nieuwere Terra en ging terug — laten we
         staan wat er staat en lezen we alleen wat we herkennen. */
      if (o && typeof o.v === 'object' && o.v !== null) waarden = { ...o.v };
    } catch { waarden = {}; }
  }
  migreer();
}

/* Wegschrijven, ontdubbeld. Een sleep over een slider zet honderden
   waarden achter elkaar; zonder deze vertraging is dat honderden keren
   JSON.stringify over het hele register. 250 ms is ruim onder wat
   iemand als "bewaard" ervaart en ruim boven de sleepfrequentie. */
function plan() {
  if (!opslagWerkt) return;
  if (schrijfTimer !== null) return;
  schrijfTimer = setTimeout(() => {
    schrijfTimer = null;
    try {
      localStorage.setItem(PREFS_STORE,
        JSON.stringify({ versie: PREFS_VERSIE, v: waarden }));
    } catch { opslagWerkt = false; }
  }, 250);
}

/* ------------------------------------------------------------ */

export const Prefs = {

  /* De fabrieksstand. Losstaand opvraagbaar omdat `reset` en de
     vangrail hem nodig hebben zonder het bewaarde eroverheen. */
  fabriek(sleutel) { return PREFS_DEFAULTS[sleutel]; },

  /* Wat er nu geldt: het bewaarde, of anders de fabrieksstand.

     EEN ONBEKENDE SLEUTEL GEEFT `undefined` EN GEEN `false`. Dat is met
     opzet: een tikfout in een sleutelnaam zou anders als "uit" lezen en
     een laag stil onzichtbaar maken. Zo valt hij op. */
  get(sleutel) {
    laad();
    return sleutel in waarden ? waarden[sleutel] : PREFS_DEFAULTS[sleutel];
  },

  /* Zetten. Gelijk aan de fabrieksstand betekent WISSEN en niet
     opslaan — zie de kop: alleen afwijkingen worden bewaard, zodat een
     latere verbetering aan een default doorwerkt bij wie hem nooit
     heeft aangeraakt. */
  set(sleutel, waarde) {
    laad();
    if (!(sleutel in PREFS_DEFAULTS)) {
      // Luid, en niet stil: een sleutel die niet in de tabel staat wordt
      // nooit teruggelezen, en dat merkt niemand tot een bezoeker klaagt.
      console.warn('[prefs] onbekende sleutel:', sleutel);
      return waarde;
    }
    if (waarde === PREFS_DEFAULTS[sleutel]) delete waarden[sleutel];
    else waarden[sleutel] = waarde;
    plan();
    return waarde;
  },

  /* Alles terug naar fabriek. Zonder deze knop is een bewaarde voorkeur
     een val: wie iets uitzette en niet meer weet wát, kan er niet uit. */
  reset() {
    laad();
    waarden = {};
    try { localStorage.removeItem(PREFS_STORE); } catch {}
    return true;
  },

  /* Voor het meetluik en de toetsen: wat er afwijkt, en wat er geldt. */
  snapshot() {
    laad();
    const geldt = {};
    for (const k of Object.keys(PREFS_DEFAULTS)) geldt[k] = this.get(k);
    return { afwijkingen: { ...waarden }, geldt,
             aantal: Object.keys(PREFS_DEFAULTS).length,
             opslagWerkt, versie: PREFS_VERSIE };
  },

  /* DE VANGRAIL. Welke schakelaars in de DOM staan zonder sleutel in de
     tabel hierboven, en welke sleutels in de tabel niemand gebruikt.

     Beide kanten, en dat is het punt: een sleutel die nergens gelezen
     wordt is dode opslag, en een schakelaar zonder sleutel is een knop
     die stil niets bewaart. Alleen de eerste lijst controleren zou de
     tweede fout jarenlang laten staan. */
  ontbrekend(gebruikteSleutels) {
    const inTabel = new Set(Object.keys(PREFS_DEFAULTS));
    const gebruikt = new Set(gebruikteSleutels || []);
    return {
      zonderSleutel: [...gebruikt].filter((k) => !inTabel.has(k)),
      ongebruikt: [...inTabel].filter((k) => !gebruikt.has(k))
    };
  }
};
