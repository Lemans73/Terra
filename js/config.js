/* ============================================================
   TERRA — config & constanten
   ------------------------------------------------------------
   Pure, dependency-vrije data + helpers, geëxtraheerd uit
   index.html (Stap 0 van de modulaire refactor). Geen THREE,
   DOM of runtime-state. Het inline-script importeert hieruit.
   ============================================================ */

// ---- Eigen achterkanten aankoppelen -------------------------------------
// De bliksemlaag draait op een los Node-proces (relay/relay.mjs) dat de WebSocket
// van Blitzortung server-side uitleest. Draai je dat lokaal, dan vindt de app hem
// vanzelf op http://localhost:8772 en hoef je hier niets in te vullen.
//
// Staat je relay op een eigen server, zet hier dan de publieke URL, bij voorkeur
// https, bijvoorbeeld 'https://relay.voorbeeld.nl'. Leeg betekent: alleen lokaal, en
// elders gaat de laag op slot.
//
// Dit is bewust GEEN sleutel. De WAQI-token leeft aan de serverkant achter
// /api/waqi en komt de browser nooit meer in (beslissing 5). Deze regel verving op
// 2026-07-31 het oude keys.js, dat daarmee is verdwenen.
export const RELAY_URL = '';

// Waar de uitleg staat voor wie een laag zelf wil aankoppelen. De slotjes in het
// lagenlijstje verwijzen hiernaartoe.
export const REPO_URL = 'https://github.com/Lemans73/Terra#bring-your-own-data';

// Klapt het slotje in de lagenlijst een paneeltje uit met uitleg en een link naar de
// repo? Staat sinds 2026-08-01 UIT, en dat is een tijdelijke stand.
//
// De reden: dat paneeltje belooft iets dat de app nog niet kan waarmaken. Er is geen
// invoerveld voor een eigen sleutel (beslissing 26 staat nog open), dus de enige weg
// die het aanwijst is "fork de repo en deploy zelf". Dat is een grote stap om een
// bezoeker vanuit een demo in te sturen, en het stuurt hem weg vóórdat we iets te
// bieden hebben.
//
// Het slotje zelf BLIJFT staan, met de uitleg in zijn tooltip. Dat is het punt van
// een slotje: het onderscheidt "hier valt iets aan te koppelen" van "dit is kapot".
//
// Zet dit weer op true zodra de sleutel-invoer echt werkt — dan wijst het paneeltje
// naar een functie in de app in plaats van naar de uitgang.
export const LOCK_DETAILS = false;

// ---- Bezoekersteller ----------------------------------------------------
// Vercel Web Analytics: één scriptbestand dat Vercel zelf serveert vanaf hetzelfde
// domein. Geen npm-pakket, geen build-stap, geen dependency — de nul-afhankelijkheden
// belofte blijft staan. Cookieloos en zonder persoonsgegevens, dus er hoort geen
// cookiebanner bij.
//
// Dit is een LIJST VAN HOSTNAMES, geen aan/uit-schakelaar. Dat is bewust. Een kale
// `true` betekent "aan, tenzij", en dat klopt niet voor een repo die geforkt wordt:
// /_vercel/insights/script.js bestaat alleen op een Vercel-deployment. Wie dit op een
// eigen server, op GitHub Pages of via file:// draait, kreeg daar een 404 in de
// netwerktab voor iets dat hij nooit heeft aangezet. Nu vuurt de teller alleen op een
// host die hier expliciet staat.
//
// Fork je dit? Zet je eigen domein erin — het zijn dan jouw cijfers op jouw
// Vercel-project, want /_vercel/insights/ hoort bij de deployment, niet bij ons.
// Aanzetten moet daar wel eerst in het dashboard: project → Analytics → Enable.
// Lege lijst = geen teller, nergens.
//
// Localhost hoeft er niet in te staan en hoort er ook niet in: eigen ontwikkelbezoeken
// horen niet in de cijfers.
export const ANALYTICS_HOSTS = ['terra.terryelemans.nl'];

// ---- Per-dataset visuele identiteit ----
export const COLORS = {
  quake:    '#ff6b3d',
  volcano:  '#ffd23f',
  storm:    '#4dd0e1',
  ice:      '#b3e5fc',
  wildfire: '#ff3b30',
  aqi:      '#a78bfa',  // identiteitskleur (legenda/melding); glyph zelf volgt de AQI-band
  lightning:'#bcd6ff',  // bliksem — zacht blauw-wit (minder fel dan puur wit)
  aurora:   '#1fbf5a',  // poollicht — 557 nm zuurstofgroen, de kleur van een rustige ovaal
  region:   '#ffb347'   // actief gebied op de zon — warm oranje, kleur van de fotosfeer
};

// Bron-homepages (algemene "bron"-link in de readout) en het label voor de
// event-/station-specifieke link per laag (alleen getoond als de API een url geeft).
export const SOURCE_URLS = {
  'USGS':       'https://earthquake.usgs.gov',
  'EMSC':       'https://www.emsc-csem.org',
  'NOAA SWPC':  'https://www.swpc.noaa.gov',
  'NASA EONET': 'https://eonet.gsfc.nasa.gov',
  'WAQI':       'https://aqicn.org',
  'Blitzortung':'https://www.blitzortung.org'
};
export const DETAIL_LINK_LABELS = {
  region: 'Solar region summary',
  quake: 'View on USGS', volcano: 'Source report', wildfire: 'Source report',
  storm: 'Source report', ice: 'Source report', aqi: 'Station on WAQI'
};

/* WAT ER ACHTER DE BRONKNOP ZIT (session 42, Terry).

   EONET hands out whatever url the reporting agency published, and a good third
   of them are not pages at all. The button said "Source report" for all of them
   and quietly downloaded a file, or led to a login wall.

   FILE_LINK_TYPES: extension → the label the button gets. The button then also
   carries the `download` attribute and a ⤓ instead of an ↗. A browser cannot
   open a real "Save as" dialog — that is browser policy — so honest labelling
   plus saving instead of navigating is as far as this goes.

   DEAD_LINK_HOSTS: hosts that answer with a login wall. IRWIN is the only
   source EONET has for US wildfires and it is not public; a button that cannot
   work is worse than no button. What those fires get instead is a lookup at
   NIFC — see wildfireFacts() in index.html.

   FILE_LINK_NOTES: a pale line under the button where the file is not what the
   button suggests. The iceberg csv is the table of ALL icebergs, not this one. */
export const FILE_LINK_TYPES = {
  tcw: 'Warning report (.tcw)',
  csv: 'Data table (.csv)',
  txt: 'Text bulletin (.txt)',
  zip: 'Archive (.zip)'
};
export const DEAD_LINK_HOSTS = ['irwin.doi.gov'];
export const FILE_LINK_NOTES = {
  ice: 'The file is the US National Ice Center table of all tracked icebergs, not just this one.'
};

// Luchtkwaliteit (AQI) → officiële US-EPA bandkleuren (groen=goed … kastanje=gevaarlijk).
// De glyph wordt per station in deze kleur gezet; de band geeft ook een label.
export const AQI_BANDS = [
  // De labels zijn de officiële US EPA-benamingen, geen eigen vertaling: die staan zo
  // op aqicn.org en in elke andere AQI-weergave, dus ze zijn herkenbaar.
  { max: 50,  rgb: [0, 228, 0],     label: 'Good' },
  { max: 100, rgb: [255, 222, 51],  label: 'Moderate' },
  { max: 150, rgb: [255, 126, 0],   label: 'Unhealthy for sensitive groups' },
  { max: 200, rgb: [255, 50, 70],   label: 'Unhealthy' },
  { max: 300, rgb: [153, 70, 235],  label: 'Very unhealthy' },
  { max: Infinity, rgb: [126, 0, 35], label: 'Hazardous' }
];
export function aqiBand(aqi) {
  const v = (aqi == null || isNaN(aqi)) ? 0 : aqi;
  return AQI_BANDS.find(b => v <= b.max) || AQI_BANDS[AQI_BANDS.length - 1];
}
export function aqiHex(aqi) {
  const [r, g, b] = aqiBand(aqi).rgb;
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// Aardbeving-magnitude → kleurramp (zwak = koel/zacht, sterk = heet). In de
// deskundig-modus tonen kleur én ring-straal de magnitude (kracht); de
// staaf-hoogte toont de diepte. (Realistisch gebruikt nog de diepte-ramp.)
export const MAG_STOPS = [
  [0, [120, 220, 160]],  // zeer zwak: zacht groen
  [2, [200, 230, 90]],   // geel-groen
  [3, [255, 214, 64]],   // geel
  [4, [255, 150, 50]],   // oranje
  [5, [255, 80, 60]],    // rood-oranje
  [6, [240, 40, 90]],    // rood-magenta
  [8, [200, 30, 200]]    // extreem: magenta
];
export function magRGB(mag) {
  const m = (mag == null || isNaN(mag)) ? 0 : Math.max(0, mag);
  const s = MAG_STOPS;
  if (m <= s[0][0]) return s[0][1];
  for (let i = 1; i < s.length; i++) {
    if (m <= s[i][0]) {
      const m0 = s[i-1][0], c0 = s[i-1][1], m1 = s[i][0], c1 = s[i][1];
      const f = (m - m0) / (m1 - m0);
      return [0,1,2].map(k => Math.round(c0[k] + (c1[k] - c0[k]) * f));
    }
  }
  return s[s.length - 1][1];
}
export function magHex(mag) {
  return '#' + magRGB(mag).map(v => v.toString(16).padStart(2, '0')).join('');
}

// Per-laag groottefactor in de DESKUNDIG-modus (bovenop de schermvaste schaal).
// Dichte lagen kleiner zodat ze niet clutteren; aardbeving = referentie (1.0).
// Realistische modus gebruikt dit NIET (blijft zoals hij was).
export const EXPERT_LAYER_SCALE = {
  quake:    1.0,   // referentie — voelt goed
  aqi:      0.38,  // zeer hoge dichtheid → veel kleiner
  wildfire: 0.6,
  lightning:0.6,
  ice:      0.65,
  volcano:  0.7,
  storm:    0.78
};

// ---- Bespeelbare parameters (indicatoren + post-processing) ----
// Worden live aangestuurd door de tijdelijke tuning-GUI. PARAMS blijft een
// gedeelde objectreferentie → GUI-mutaties werken ongewijzigd.
export const PARAMS = {
  /* bloom (post-processing)

     `bloomEnabled` STAAT NAAST DE DRIE GETALLEN EN NIET IN PLAATS ERVAN. Een
     pass met sterkte 0 draait namelijk gewoon door: hij leest het beeld, blurt
     het in vijf stappen en telt nul op. Gemeten in sessie 41 op 4.032.000
     pixels: met de drie getallen op 0 verandert het uitzetten van de pass geen
     énkele pixel — de gloed die je dan nog ziet komt ergens anders vandaan.
     Deze schakelaar zet `bloomPass.enabled`, en dat is echt uit. */
  bloomEnabled: true,
  bloomStrength: 0.1, bloomRadius: 0.5, bloomThreshold: 1,
  // colour grading + chromatic aberration
  gradeContrast: 1.105, gradeSaturation: 1.4, gradeAberration: 0.001, gradeTemp: -0.2,
  // mist — fresnel-waas die naar de randen toe het kaartje vertroebelt
  fogStrength: 1.0, fogPower: 3.0, fogColor: '#b6c4d6',
  // staven — simpele cilinder die vanaf het oppervlak de ruimte in rijst (hoogte ∝ magnitude²)
  /* DE BEAM. Deze drie stonden sinds de v1-sloop (sessie 41) wees in dit
     bestand en zijn later diezelfde sessie hergebruikt door de nieuwe
     instanced beam-laag, met dezelfde betekenis als in v1: hoogte is
     `beamBase` plus magnitude in het kwadraat maal `beamMultiplier`.

     `coreOpacity` en `glowOpacity` hoorden bij de twee cilinders van v1 — een
     kern en een gloed eromheen. De shader-beam heeft één quad met een
     dwarsprofiel, dus die twee zijn vervangen door quakeBeamCore en
     quakeBeamOpacity hieronder. Ze staan er nog omdat de vulkaan- en
     bosbrandglyphs ze ook lezen. */
  beamBase: 10,         // base length, so even light quakes get a visible shaft
  beamMultiplier: 0.7,  // height bonus = magnitude² · this factor
  beamRadius: 0.24,     // half-width at the foot, times the icon scale
  coreOpacity: 1.0, glowOpacity: 0.02,

  /* THE BEAM LAYER. On by default since session 42 — the trial it was put on
     in session 41 is over. See the long note at QUAKE_BEAM_VERT for why the
     foot stays on radius 100.

     `quakeBeamScaleWithZoom` is a choice, not a detail. On: the shaft keeps
     its screen height and stays readable from any distance. Off: it sits in
     world scale, shrinks as you zoom out and tells you the size of the planet.
     The ring does the first, and the beam follows it. */
  /* AANWIJZEN (sessie 41, Terry). Twee kanalen omdat ze iets anders doen:
     `quakeHoverBoost` tilt de aangewezen indicator op, `quakeHoverDim` haalt de
     andere omlaag. Alleen optillen helpt niet in een zwerm — daar zijn de buren
     even fel, en dan is er niets uitgelicht. Dempen alleen maakt het beeld
     donker zonder ergens heen te wijzen. Samen wijzen ze aan.

     `quakeHoverDim` op 1 zou de rest volledig laten verdwijnen; 0,55 houdt de
     omgeving leesbaar, zodat je ziet WAAR in de zwerm je zit. */
  quakeHoverBoost: 0.9,
  quakeHoverDim: 0.55,
  /* HOW WIDE THE LIMB FADE IS, IN DEGREES (session 42, Terry). Full until this
     many degrees before the horizon, gone this many degrees past it. At 0 the
     behaviour is the old hard cut-off, which makes it the null measurement for
     this feature. */
  quakeLimbFadeDeg: 6,
  quakeBeamOn: true,
  quakeBeamScaleWithZoom: true,
  quakeBeamCore: 0.2,    // cross profile: higher = narrower core, softer flanks
  quakeBeamFalloff: 0.1, // length profile: higher = fades out faster towards the top
  // Per globe mode, see the note at quakeRingOpacityRealistic.
  quakeBeamOpacityRealistic: 0.8,
  quakeBeamOpacityExpert: 1,
  quakeBeamOpacity: 0.8,
  /* HOW FAR THE BEAM STARTS BELOW ITS FOOT. Without overlap a seam falls
     between the shaft and the indicator under it; with too much it sticks out
     visibly. The limit is optical: whatever pokes out below has to stay inside
     the core of the ring. At 0 it joins exactly.

     0.15 AND NOT 0.35 SINCE SESSION 42. The value now scales with the zoom (see
     QUAKE_BEAM_VERT), and at 0.35 that would have sunk the beam 2.4x deeper at
     the usual camera distance than the 0.35 did before. 0.15 keeps the overlap
     at the 0.022 of the ring radius that was tuned in session 41 — only now it
     is that same fraction at EVERY zoom instead of just at one. */
  quakeBeamSink: 0.15,
  // shockwave — magnitude → straal binnen min/max; rand-scherpte + rand-dikte
  shockMinR: 1, shockMaxR: 20, shockMagLo: 1, shockMagHi: 10,
  shockLift: 0,         // hoogte boven het oppervlak (units)
  shockEdge: 0.02,      // randscherpte (lager = hardere overgang)
  shockThickness: 0.04, // randdikte (breedte van de ringband)
  shockOpacity: 1.0, shockSpeed: 0.1,

  /* ===== DE AARDBEVING-INDICATOR v2 ==========================================
     Overgezet uit logs/indicator-workbench.html (sessie 38-39), waar deze set
     in zeven ronden met de schuiven is afgesteld. Terry's stand, één op één.

     WAAROM DE PREFIX `quake`. Er staan hierboven al een `shockLift`, een
     `shockEdge`, een `shockThickness`, een `shockOpacity` en een `shockSpeed`:
     die van de v1-indicator. Zolang beide generaties naast elkaar draaien
     moeten die uit elkaar te houden zijn — en na het opruimen van v1 is een
     hernoeming een aparte, zichtbare stap in plaats van een stille botsing.

     DE SCHAAL STAAT LOS VAN `iconScale*` HIERONDER, en dat is een besluit
     (Terry, sessie 40). Die stuurt via animateShader() élke glyph in de app:
     vulkanen, bliksem, bosbranden, zee-ijs. De ring is afgesteld op heel
     andere getallen — ref 120 tegen 280, ondergrens 0,18 tegen 0,4 — omdat hij
     gebouwd is op verder kunnen inzoomen dan `zoomMinDistance` nu toestaat.
     Die twee sets bij elkaar vegen zou een app-brede uiterlijkwijziging zijn.
     ========================================================================== */

  // ---- de ring ----
  /* DE MATEN, en waarom het niet Groks maten zijn. Zijn indicator is over de
     hele lijn twee tot vijf keer kleiner dan wat Terra gewend is — omgerekend
     naar straal 100 en gemeten tegen de v1-shockwave hierboven:

         magnitude        4,5    5,5    6,5    7,4    8,0    9,0
         v1-shockwave     8,4   10,5   12,6   14,5   15,8   17,9  eenheden
         Grok ring        1,6    3,4    5,2    6,9    7,9    8,3  eenheden

     Dat is de tweede helft van de verklaring waarom zijn ringen op de bol als
     stippen lezen; de eerste helft staat bij het ringtal in de fragment-shader.
     Maar v1's schaal overnemen kan ook niet: van M4,5 naar M9,0 groeit die maar
     met een factor 2,1, en dan valt er aan de grootte geen magnitude meer af te
     lezen. Deze set neemt het bereik van Grok en de orde van grootte van v1. */
  quakeRingRadiusLo: 1,    // wereldstraal bij quakeMagMin (bol = 100)
  quakeRingRadiusHi: 12,     // wereldstraal bij quakeMagMax
  quakeRingRadiusPow: 0.95,  // kromming van de magnitude→straal-afbeelding
  /* OP HET OPPERVLAK, EN DAT IS EEN OMKERING (sessie 40, Terry).

     Deze stond eerst op 0, ging naar 0,8 om boven de kaartlijnen uit te komen,
     en staat nu weer op 0. Wat er veranderde is niet de wens maar de MANIER: de
     laag tekent sinds deze ronde met depthTest UIT en verbergt zijn achterkant
     met een horizontoets in de fragment-shader. Daarmee is er niets meer om
     boven uit te komen, en telt alleen nog wat de hoogte KOST.

     En dat is parallax. Een indicator die boven de grond zweeft schuift bij een
     scheve blik weg van de plek die hij aanwijst. GEMETEN, verschuiving ten
     opzichte van het oppervlak op 15 graden uit het beeldmidden:

         camera      450    260    200    150    120    105
         lift 0,8   0,49   1,33   2,56   7,25   30,8    222  px
         lift 1,5   0,92   2,50   4,83  13,77   59,5    457  px

     Op 450 is dat onzichtbaar, op 105 staat de ring een kwart scherm naast zijn
     eigen beving. Dat is wat er bij diep inzoomen misging.

     Op 0 is de verschuiving per constructie nul. De schuif blijft staan voor het
     geval een laag er ooit weer boven moet; zie quakeRingLiftNu() in index.html,
     die hem in de schematische weergave nog kan optillen. */
  quakeRingLift: 0,
  /* DE MARGE BOVEN DE KAARTLAGEN IN DE SCHEMATISCHE WEERGAVE. Daar ligt alles
     hoger — landvlakken op 0,01, lijnen tot 0,013 — en volgt de indicator die
     hoogte in plaats van een vast getal. Zie quakeRingLiftNu() in index.html.
     0,2 eenheid, dezelfde marge die de realistische weergave heeft. */
  quakeRingLiftMargin: 0,
  /* HET AANTAL RINGEN LEEST ALS EEN SCHAALVERDELING, niet als sier: zwaarder is
     meer ringen. De LIJNDIKTE loopt bij Terry de andere kant op dan bij Grok —
     zwaarder is dikker, want een zware beving hoort méér op het netvlies te
     drukken. Hier staan lo en hi gelijk (0,05) omdat dikkere lijnen op grotere
     afstand de ringen lieten dichtslibben; de dunne lijn is de oplossing voor
     precies dat. Lijndikte naar zoomniveau is een idee voor later. */
  quakeRingCountLo: 2,       // aantal concentrische ringen bij quakeMagMin
  quakeRingCountHi: 8,       // idem bij quakeMagMax
  quakeRingLineLo: 0.05,     // lijndikte bij quakeMagMin (fractie van de schijfstraal)
  quakeRingLineHi: 0.05,     // idem bij quakeMagMax
  quakeRingFalloff: 0,       // hoeveel elke volgende ring naar buiten toe vervaagt
  quakeRingEdge: 1,          // deel van de lijndikte dat zacht is; 1 = volledig zacht
  /* DE ONDERGRENS IN SCHERMPIXELS IS GEEN VERFIJNING MAAR EEN REPARATIE.
     Gemeten 2026-08-23: met de dikte als vaste fractie van de schijfstraal is
     één ringlijn over het hele gangbare zoombereik 0,21 tot 0,29 PIXEL dik.
     Zo'n lijn bestaat niet als lijn — de antialiasing smeert hem uit tot een
     grijze veeg waarvan de helderheid afhangt van waar de pixelgrid toevallig
     valt. De volledige meettabel staat in de fragment-shader. */
  quakeRingLineMinPx: 3.6,   // ondergrens van de lijndikte, in SCHERMPIXELS
  quakeRingFitToScreen: true,// ringtal begrenzen op wat er leesbaar in past
  quakeRingGapMinPx: 5,      // minimale hart-op-hart-afstand tussen twee ringen, px
  quakeRingFill: 0,          // vulling binnen de buitenste ring
  quakeRingCore: 3,          // helderheid van de kern
  /* OPACITY PER GLOBE MODE (session 42, Terry). The realistic earth carries its
     own light and texture, so an indicator at full strength sits on top of it
     as a sticker; the schematic map is flat and needs the full value.

     `quakeRingOpacity` and `quakeBeamOpacity` stay the LIVE values — they are
     what the uniform reads. The pair below is what applyGlobeMode() copies into
     them on every mode switch. Same shape as overlayOpacityExpert /
     overlayOpacityRealistic, and `Expert` is deliberate: the mode is called
     'expert' everywhere in the code and only its visible label says Schematic. */
  quakeRingOpacityRealistic: 0.8,
  quakeRingOpacityExpert: 1,
  quakeRingOpacity: 1,
  /* DE RING ZELF AAN OF UIT (sessie 40, Terry). Een vraag die het proberen waard
     is: bij een dichte zwerm dragen de concentrische ringen vooral drukte, en
     misschien volstaat de labelstip — die is met quakeLabelDotSize te vergroten.
     Uit laat de shockwave en de labels staan, dus je ziet meteen wat er overblijft. */
  quakeRingOn: true,
  /* VOLUME EN GLANS STAAN OP NUL, en dat is een uitkomst en geen vergetelheid
     (Terry, sessie 39). Ze geven de lijn een halfronde dwarsdoorsnede met een
     lichtval — mooi op een dikke lijn, maar deze set draait juist op een dunne,
     en daar viel het verkeerd uit. Op 0 tekent de shader pixel voor pixel wat
     hij zonder deze twee tekende; dat volgt uit de constructie, want mix(1, x, 0)
     is exact 1. De code blijft staan voor als de lijndikte ooit meebeweegt. */
  quakeRingVolume: 0,
  quakeRingShine: 0,

  // ---- de shockwave ----
  // Een eigen laag en niet een term in de ringshader: los te schakelen, eigen
  // (veel ruimere) maat, en de ringshader blijft leesbaar.
  /* DE MAAT VAN DE PULS, ALS FACTOR VAN DE RING (sessie 40, Terry).

     Hier stonden een eigen lo, hi en pow. Die zijn weg, en dat is een reparatie:
     twee losse maten lopen uiteen zodra er aan één van beide wordt gedraaid. Dat
     gebeurde ook — de ring ging naar 10..30 met pow 0,95, de shockwave bleef op
     2,8..20 met pow 2, en toen viel de puls bij ELKE magnitude binnen zijn eigen
     indicator:

         magnitude    2,5    4,5    6,5    9,5
         ring        10,0   16,1   21,8   30,0  eenheden
         shockwave    2,8    4,2    8,4   20,0
         verhouding  0,28   0,26   0,39   0,67

     Met de ringen aan was hij daardoor onzichtbaar; pas met de ringen uit viel
     op dat er iets stond. Nu is er één maat en één factor.

     BOVEN 1, want een golf dijt VOORBIJ zijn bron uit. Op 1,0 valt de puls
     precies samen met de buitenste ring, daaronder verdwijnt hij er weer in. */
  quakeShockScale: 1.25,
  /* MEE OMHOOG met de ring: boven de kaartlijnen (0,6) maar onder de ring
     (0,8), zodat de puls onder zijn eigen indicator door loopt in plaats van
     eroverheen. Precies 0,6 zou gelijk liggen met de lijnen en dan beslist
     de tekenvolgorde het — daarom 0,7. Zie de noot bij quakeRingLift. */
  quakeShockLift: 0,
  quakeShockWaves: 2,        // aantal golven tegelijk onderweg (max 4, zie shader)
  quakeShockSpeed: 0.1,
  quakeShockThickness: 0.055,
  quakeShockEdge: 0.001,
  /* DE LEEFTIJD-ENVELOPE, IN UREN. Vers pulseert vol, daarna dooft het uit;
     voorbij AgeHi wordt er niets meer getekend. Zonder die grens pulseert de
     hele wereld altijd en betekent een puls niets meer.
     De leeftijd wordt gemeten vanaf het GEKOZEN moment (momentNow), niet vanaf
     de wandklok — anders staat deze laag op de tijdschuif permanent uit. */
  quakeShockAgeLo: 0,        // tot hier vol (uren)
  quakeShockAgeHi: 4,       // hier is er niets meer over (uren)
  quakeShockOpacity: 1,

  // ---- stacking ----
  /* OFF by default since session 42 (Terry).

     Pushing apart is allowed, because otherwise a cluster cannot be untangled.
     REARRANGING is not: the tangential direction of an event relative to its
     base stays exactly what it is, and only the DISTANCE is stretched. See the
     long note in QUAKE_STACK_GLSL on why a sunflower pattern is wrong there.

     The labels follow the stacked position (stackedNormalJS in
     js/layers/quake-indicator.js). Without that they hung beside their own
     indicator: measured in the workbench on 257 of 450 events, 43 px on
     average and up to 141 px. */
  quakeStackOn: false,
  quakeStackNear: 125,       // camera distance where stacking starts
  quakeStackFar: 300,        // and where it is complete
  quakeStackLift: 0,         // height gained per storey (times the icon scale)
  quakeStackSpread: 0,       // how far storeys are pushed sideways
  quakeStackOverlap: 1,      // how strictly two rings must touch before they stack
  quakeStackMaxLayers: 10,

  // ---- de schaal, alleen voor deze laag ----
  // Zelfde vorm als iconScale* hieronder, andere getallen. Zie de kop van dit blok.
  quakeIconScaleRef: 60,      // camera-afstand waarbij de schaal 1 is
  quakeIconScalePow: 0.5,      // steilheid
  quakeIconScaleMin: 0.18,     // ondergrens (sterk ingezoomd)
  quakeIconScaleMax: 3,      // bovengrens (ver uitgezoomd)
  /* DE NABIJHEIDSKLEM. Zonder deze groeit de hoekgrootte onder de ondergrens
     ongeremd; met een vloer op 100 — de bolstraal zelf — is de hoekstraal exact
     constant, en dat is gemeten en niet afgeleid. Terra's gedeelde variant meet
     tot 101,5 (de glyphschil); deze laag ligt op het oppervlak. */
  quakeIconNearPerUnit: 0.0138,
  quakeIconNearFloor: 101,

  // ---- het magnitude-bereik van de AFBEELDING ----
  /* NIET HET FILTER. `magMin`/`magMax` in index.html bepalen welke bevingen je
     te zien krijgt en staan onder de bediening van de bezoeker; deze twee
     bepalen hoe een magnitude op 0..1 wordt afgebeeld en daarmee op straal,
     ringtal en lijndikte. Zou de indicator meeschalen met het filter, dan
     veranderde elke beving van maat zodra je de ondergrens verschoof. */

  /* ===== DE LABELLAAG v2 =====================================================
     Overgezet uit de workbench (sessie 38-39), waar de plaatsing in twee ronden
     is afgesteld. Terry's stand, één op één.

     WAAROM DE PREFIX `quakeLabel`. Er staan hierboven al een `labelPoolMax`,
     `labelCountMax`, `labelStackGapY` en `labelViewMargin` — van de oude laag en
     van de landnamen. Zolang die namen bestaan moeten ze uit elkaar te houden
     zijn; `quakeLabelBudget` zegt bovendien meteen welke laag hij stuurt.

     HET BUDGET KOMT NIET HIERVANDAAN maar uit `pref.labelCount`, de schuif in
     Settings. Deze waarde is alleen de terugval. */
  quakeLabelBudget: 20,        // hoeveel labels er ver weg staan
  quakeLabelMinMag: 2.5,       // ondergrens ver weg
  quakeLabelZoomFar: 200,      // vanaf deze afstand geldt de "ver weg"-stand
  quakeLabelZoomNear: 120,     // en hier de ingezoomde
  quakeLabelZoomMinMag: 2,     // ondergrens ingezoomd
  quakeLabelZoomBudget: 20,    // budget ingezoomd

  /* WAT ER IN EEN UITGEKLAPT LABEL STAAT. Het overzicht draagt alleen de
     magnitude — meer hoeft niet om te zien waar iets gebeurde en hoe zwaar, en
     het blok wordt er drie keer kleiner van. Dat scheelt de ontwijking werk en
     houdt het label dicht bij zijn eigen indicator. */
  quakeLabelDepth: true,
  quakeLabelPlace: true,
  quakeLabelTime: true,
  quakeLabelCoords: false,     // plaatsnaam vervangen door lat/lon

  /* DE OFFSET IS EEN SOM VAN DRIE TERMEN en niet langer een maximum met een
     verborgen factor erin. Alleen zo betekent `quakeLabelOffset: 0` ook echt
     nul, en valt het label desgewenst over zijn eigen indicator.
       offset      een vast aantal pixels
       ringClear   een deel van de RINGSTRAAL, dus groter bij een zware beving
       axisOffset  een deel van de geprojecteerde radiale as: kort waar je
                   bovenop kijkt, lang aan de bolrand */
  quakeLabelOffset: 0,
  quakeLabelRingClear: 1.14,
  quakeLabelAxisOffset: 0,
  /* De offset slaat op de RAND van het label, niet op zijn midden. Bij offset
     nul staat de magnitude dan precies op de indicator in plaats van er een
     halve labelbreedte naast. */
  quakeLabelOffsetToEdge: true,

  /* DE RICHTING IS CONTINU. Hier stonden acht vaste plekken met een eigen
     uitlijning per stuk; die zijn vervangen door één eenheidsvector plus de
     afstand tot de labelrand langs die vector. Het aanhechtpunt glijdt daardoor
     over de rand mee in plaats van van hoek naar hoek te springen.
     GEMETEN over 200 frames bij 0,35 graden per frame: de p99-sprong ging van
     120,33 px naar 14,06, en het aantal frames boven 20 px van 17 naar NUL.

     `upright` volgt de geprojecteerde radiale as — waar een staaf heen zou
     wijzen. Staat uit (Terry): kijk je recht op een beving, dan projecteert die
     as tot bijna niets en valt het label over zijn eigen indicator.
     `outward` wijst van het schermmiddelpunt van de bol af. */
  quakeLabelUpright: false,
  quakeLabelOutward: true,
  quakeLabelUprightMinPx: 6,   // korter dan dit is de asrichting ruis

  /* ONTWIJKEN. Eerst langs de eigen as op oplopende afstand (`avoidRings`
     stappen), en past het daar niet, dan waaiert het label uit over een continu
     hoekbereik — dichtstbij eerst, om en om links en rechts. Die uitweg is er
     omdat "soms een rare richting" beter is dan "soms geen label".
     `dropBlocked` uit betekent: liever een label dat overlapt dan geen label. */
  quakeLabelAvoid: true,
  quakeLabelAvoidRings: 1,
  quakeLabelFanDeg: 0,         // 0 = niet uitwaaieren, alleen langs de as
  quakeLabelFanStep: 10,
  quakeLabelDropBlocked: false,
  quakeLabelPad: 24,            // marge rond een labelblok bij het ontwijken

  /* CLUSTEREN. Bij een zwerm hoort niet elk label bij één stip maar de LIJST
     bij de GROEP — dan bestaat de vraag welk label bij welke indicator hoort
     helemaal niet meer. Greedy vanaf de zwaarste; die wordt het anker.
     DE AFSTAND KRIMPT MET DE ZOOM: diep ingezoomd is er ruimte genoeg en hoort
     elke beving zijn eigen label te hebben, dus bij volle zoom valt hij naar
     nul en clustert er niets meer. */
  quakeLabelCluster: true,
  quakeLabelClusterPx: 60,
  /* DE ONDERGRENS VAN DIE AFSTAND, bij volle zoom (sessie 40, Terry).

     De regel hierboven laat de clusterafstand met de zoom naar NUL krimpen: diep
     ingezoomd is er ruimte genoeg en hoort elke beving zijn eigen label te
     hebben. Dat klopt overal — behalve precies waar je het meest inzoomt, want
     dat doe je juist bij een zwerm. Daar viel de clustering weg en kreeg je
     twintig losse labels over elkaar in plaats van één lijst.

     Op 0 is het gedrag exact wat het was. Hoger houdt de lijst ook bij maximale
     zoom bij elkaar; de lijst zelf staat op tijd gesorteerd met de meest recente
     bovenaan, en dát is bij een zwerm wat je wilt weten. */
  quakeLabelClusterPxNear: 240,
  quakeLabelClusterMax: 20,

  /* BUITEN DE BOLRAND. Van het middelpunt AF wijzen is niet hetzelfde als
     buiten de bol staan: een label bij een indicator midden op de aardbol wijst
     keurig naar buiten en ligt nog altijd over het land. `outsideMax` begrenst
     hoeveel er bij mag, want voor een beving midden op de bol zou de
     leader-line anders zo lang worden als de halve planeet. `outsideKern` is de
     fractie van de bolstraal waarbinnen een label met rust wordt gelaten. */
  quakeLabelOutside: true,
  quakeLabelOutsideFrom: 200,  // alleen vanaf deze camera-afstand
  /* DE BREEDTE VAN DE OVERGANGSBAND (sessie 41). Zonder deze band was
     `quakeLabelOutsideFrom` een harde drempel, en dan springt de offset van een
     randlabel bij het passeren van afstand 200 van 21,4 naar 61,4 pixels — in
     één frame, en bij terugzoomen even hard terug. Over 60 eenheden loopt het
     nu op met een smoothstep. Op 0 komt het oude gedrag terug. */
  quakeLabelOutsideFade: 0,   // 0 = weer de harde drempel
  quakeLabelOutsidePad: 30,
  quakeLabelOutsideMax: 40,
  quakeLabelOutsideKern: 0.8,

  // De leader-line en zijn stip. Getekend in SVG, niet als gedraaide div —
  // scherper bij een hoge pixelratio, en Terra heeft die laag al.
  quakeLabelLineWidth: 2,
  quakeLabelLineOpacity: 1,
  quakeLabelDotSize: 8,

  /* NAGLIJDEN. Ook met een continue as springt een label nog als de ontwijking
     van ring wisselt of als een cluster van samenstelling verandert.
     Exponentieel naar het doel glijden maakt van elke sprong een korte
     beweging. Staat op 0 (Terry). Valt onder prefers-reduced-motion: dit is
     beweging die niets vertelt. */
  quakeLabelEaseMs: 0,

  // Toegankelijkheid: een omlijning maakt de tekst leesbaar op elke ondergrond,
  // wit negeert de dieptekleur voor wie het contrast nodig heeft.
  quakeLabelOutline: 4,
  quakeLabelWhite: false,
  // Trefstraal bij het aanwijzen van een indicator, in pixels.
  quakeLabelPickRadius: 20,

  quakeMagMin: 2.5,
  quakeMagMax: 9.5,

  // vulkanen — additieve pyramide-piek + warme voet-gloed
  volcanoHeight: 3.0, volcanoRadius: 1.5, volcanoGlow: 5, volcanoOpacity: 1.0,
  // bosbranden — zachte rode gloed (sprite)
  wildfireSize: 6, wildfireOpacity: 1.0, wildfireFlicker: 0.8,
  // stormen — twee gloeiende spiraal-armen (cycloon)
  stormSize: 2.6, stormTurns: 2, stormThickness: 0.2, stormOpacity: 1.0, stormSpinSpeed: 1.0,
  // zee-ijs — platte zeshoekige kristal-plaat (drijvend) + koele gloed
  iceSize: 2.1, iceGlow: 2, iceOpacity: 1.0, iceSpinSpeed: 0.3,
  // luchtkwaliteit — zachte band-gekleurde gloed-bubbel (sprite) + helder kernpunt
  aqiHaloRadius: 5.0,   // basis-grootte van de gloed (units)
  aqiHaloMax: 10.0,     // extra grootte bij AQI 300 (severity)
  aqiHaloOpacity: 0.3,
  aqiCoreSize: 1.0, aqiCoreOpacity: 0.4,
  aqiLift: 0.1,         // hoogte boven het oppervlak
  // ===== LUCHTKWALITEIT VOLGT DE CAMERA =========================================
  // WAQI is de enige bron die per gebied werkt: USGS en EONET leveren de hele wereld
  // in één antwoord, maar hier vraag je een bounding box op. Tot 2026-07-31 moest je
  // daarvoor zelf op het vernieuwknopje drukken; draaide je de globe, dan bleven de
  // stations achter waar je ze had opgehaald.
  //
  // aqiFollowGridDeg — het raster waarop de opgevraagde box wordt afgerond.
  //   Zonder afronding levert elke muisbeweging een andere box op en slaat de
  //   edge cache (s-maxage=300 in /api/waqi) nooit aan. Met afronding vraag je
  //   binnen hetzelfde vak steeds dezelfde box op en komt het antwoord uit de cache.
  //   Groter = minder verzoeken, maar ook grovere sprongen in wat je ziet.
  //   De afgeronde box is altijd gelijk aan of groter dan je kijkgebied, dus er
  //   valt nooit een gat aan de rand.
  aqiFollowGridDeg: 10,
  // Pas ophalen als de camera deze tijd heeft stilgestaan. Tijdens het draaien
  // gebeurt er niets; anders vuur je midden in een beweging tien verzoeken af.
  aqiFollowDebounce: 700,   // ms
  // bliksem — pulserende witte 'bliksemwolk' op wolkenhoogte; vaste levensduur
  lightningSize: 6, lightningOpacity: 0.8,
  lightningLifeMs: 8000,   // totale levensduur (globe-lokaal; relay-buffer mag korter)
  lightningHoldMs: 4000,   // vol zichtbaar vóór de uitfade-staart begint
  lightningAttackMs: 400,  // zachte fade-in bij verschijnen (geen harde pop)
  lightningPulse: 0.75,    // puls-diepte (0 = geen puls, 1 = vol)
  lightningPulseSpeed: 12, // puls-snelheid
  // wolken — zwevende transparante schil + schaduw op het oppervlak
  /* HOOGTE VAN DE WOLKENSCHIL — straal 103,5, oftewel 223 km. Dat is onfysiek en
     met opzet: echte wolkentoppen zitten op 12 a 18 km, wat straal 100,2 zou geven,
     en daar mag de schil niet komen. De overlays liggen op 100,6 en de landnamen op
     101,6; die zouden er dwars overheen tekenen.

     DEZE STAPELING IS EEN LEESBAARHEIDSSTAPELING EN GEEN FYSISCHE. De hoogtes worden
     bepaald door wie boven wie moet liggen. Wie hier iets verzet, verzet een
     tekenvolgorde — en dat is meteen de reden dat omhoog mag: er valt geen realisme
     te verliezen dat er is. Van 0,020 naar 0,035 verdubbelt de parallax aan de
     limbus van 2 naar 3,5 procent, en dat is wat de diepte doet.

     LET OP: de SHADER rekent wel met de echte hoogte. Zie de schemeringsdip van 3,21
     graden in CLOUD_FRAG — die hoort bij 10 km en moet daar blijven. */
  cloudAltitude: 0.035,
  cloudOpacity: 1.0, cloudShadow: 1.0, cloudSpeed: 0.001,
  /* DE WOLKEN LOSSEN OP WAAR JE KIJKT (sessie 37).

     Het dek dekte de indicatoren af, en dat is precies waar je ze wilt lezen. In
     plaats van de schil hard uit te zetten lost hij op rond het punt waar je naar
     kijkt en blijft hij aan de horizon staan — wat je ook ziet als je echt door een
     wolkendek zakt.

     DE STUURGROOTHEID IS DE AFSTAND CAMERA-TOT-FRAGMENT, en dat is de hele truc:
     die draagt zoom én kijkhoek in één getal. Het punt recht onder de camera staat
     altijd dichterbij dan de limbus, dus één drempelpaar levert tegelijk het gat en
     de horizon.

     DE DREMPELS SCHALEN MEE MET DE HOOGTE BOVEN DE SCHIL en zijn geen vaste
     afstanden. Dat moet wel: sinds `zoomMinDistance` op 102 staat loopt de afstand
     tot het dichtstbijzijnde wolkenfragment van 346 (camera op 450) naar een halve
     eenheid. Een vast paar zou over dat bereik onbruikbaar zijn. Met een factor is
     het effect zelfgelijkvormig — het gat houdt bij elke hoogte dezelfde hoekmaat.

     DE POORT zet het geheel uit zodra je ver weg staat, want ver uitgezoomd hoort
     het dek gewoon dicht te zijn. Boven `cloudFadeGateFar` verandert er niets,
     onder `cloudFadeGateNear` werkt het vol.

     DE MAAT IS DE ABSOLUTE AFSTAND TOT DE SCHIL, dus hij werkt aan beide kanten. Een
     eerdere versie liet de hoogte onder de schil naar nul vallen, en dan werd het dek
     juist volledig ondoorzichtig zodra je erdoorheen zakte. Van onderaf hoort er
     alleen een subtiele rand over te blijven, geen dicht plafond. */
  cloudFadeNearK: 0.6,      // dichterbij dan (deze factor x hoogte) -> volledig opgelost
  cloudFadeFarK: 2.5,       // verder dan (deze factor x hoogte) -> onaangeroerd
  cloudFadeGateNear: 140,   // camera-afstand waaronder de fade vol werkt
  cloudFadeGateFar: 200,    // camera-afstand waarboven er niets gebeurt
  /* aurora — de OVATION-ovaal als schil boven de wolken.

     KLEUR VOLGT DE RAUWE KANS, HELDERHEID DE GAMMA DAARVAN. Die twee gescheiden
     houden: `auroraGamma` bijstellen mag nooit betekenen dat groen ineens ergens
     anders begint. Groen is 557 nm zuurstof, rood 630 nm — dat is fysica.

     GEKALIBREERD OP EEN RUSTIGE DAG (2026-08-14): piek 37 %, gemiddelde 2,3, en
     29 % van de cellen niet nul. Een ramp die pas boven 80 % rood wordt zou dus
     vrijwel nooit rood tonen; vandaar dat `auroraRedFrom` op 0,55 staat en niet
     hoger.

     DEZE WAARDEN ZIJN OP HET OOG GEKOZEN (Terry, sessie 27) en gelden voor BEIDE
     weergaven — een aparte set voor de schematische kaart bleek niet nodig. De
     twee die het meest afwijken van een eerste gok:

       auroraDayFloor 0,85  De dagzijde dooft nauwelijks. Fysiek zie je overdag
                            geen aurora, maar een ovaal die voor de helft wegvalt
                            leest als een half geladen laag. Bijkomend voordeel:
                            in de schematische weergave IS er geen dag/nacht op de
                            bol (effen MeshBasic-oceaan), en daar zou een fade dus
                            nergens op slaan.
       auroraFloor 0        Geen ondergrens. Nodig is hij niet: cellen met waarde
                            nul geven alpha nul en vallen al weg op de alfatoets. */
  /* Straal 104,5 = 287 km, en dat is de enige hoogte in de hele stapeling die WEL
     fysiek klopt. De echte aurorazone loopt van 100 tot 400 km — in deze eenheden
     0,0157 tot 0,063 — en 0,027 zat daar onderin. Hij mocht dus fors mee omhoog met
     de wolken en blijft de hele weg waar. Hij MOET boven de wolkenschil (103,5)
     blijven; die volgorde draagt de stapeling. */
  auroraAltitude: 0.045,
  auroraGain: 2.5,         // DE knop voor felheid: alpha wordt op 1 geklemd, de kleur niet
  auroraOpacity: 1,
  auroraGamma: 2,          // helderheid = kans^(1/gamma); hoger = zwak licht eerder zichtbaar
  auroraFloor: 0,          // onder deze kans niets tekenen
  auroraDayFloor: 0.85,    // wat er aan de DAGzijde overblijft (0 = hard afkappen)
  auroraRedFrom: 0.55,     // vanaf welke kans het rood begint te winnen
  auroraLow:  '#1fbf5a',   // 557 nm zuurstofgroen
  auroraMid:  '#8fe36b',
  auroraHigh: '#e8483a',   // 630 nm rood, alleen bij een echte storm
  /* SKETCH:START — de tekenlaag zit niet in de standalone; zie tools/build-standalone.mjs */
  // Tekenlaag. De hoogte zit klem tussen twee grenzen: boven de land-polygons van
  // de schematische weergave (die liggen op 0,010 = straal 101) en onder de
  // schemeringslijnen (0,014). Zakt hij naar 0,010 of lager, dan verdwijnt de
  // tekening in die weergave onder het land — dezelfde val als in sessie 14.
  sketchAltitude: 0.012,
  sketchOpacity: 1.0,
  /* SKETCH:END */
  /* Zonneglinster op het water. ÉÉN WAARDE SINDS SESSIE 41, en die staat op de
     zachte stand.

     Er stonden er twee: 0,7 voor de vlakke dagtextuur en 0,3 zodra de
     oceaanbodem aanstond. Dat was geen smaakkwestie maar een meting — bij 0,7
     legt de brede `sheen` (macht 14) een lichtwaas over de halve dagzijde, en
     daar verdween het hele bodemreliëf onder: van de Mid-Atlantische Rug was
     niets te zien, bij 0,3 tekent hij zich af terwijl de fonkeling blijft.

     De nieuwe dagtexturen hebben ALTIJD bathymetrie. Er is dus geen vlakke
     oceaan meer om 0,7 op los te laten, en die waarde laten staan zou precies
     het reliëf wegsmeren waar de nieuwe kaarten voor zijn. */
  glintStrength: 0.3,
  /* HET RELIËF VAN DE DAGZIJDE (sessie 40). Deze drie stonden als vaste getallen
     in de uniform-opbouw van het materiaal en waren daarmee alleen te wijzigen
     door de code te herschrijven. Ze staan hier met exact dezelfde waarden — dit
     is een verhuizing en geen bijstelling.

     WAAROM ZE ERTOE DOEN. In js/shaders.js staat:

         float emboss = (bumpIntensity - baseIntensity) * reliefStrength;
         float relief = clamp(macro + emboss * dayMix, 0.2, 1.7);
         vec3 dayLayer = dayColor.rgb * relief * dayEnabled;

     `relief` heeft een ONDERGRENS VAN 0,2 — de dagtextuur wordt daar tot een
     vijfde gedimd. `emboss` is het verschil tussen de bobbelnormaal en de
     bolnormaal, maal `reliefStrength`. Hoort de normal-map niet meer bij de
     dagtextuur — bijvoorbeeld na het wisselen van een van de twee — dan wordt
     dat verschil op reliëfrijk gebied fors negatief en duikt `relief` naar die
     bodem. Het gevolg is een gebied dat ook op klaarlichte dag bijna zwart is.

     Met `reliefStrength` op 0 valt de emboss helemaal weg en blijft alleen
     `macro` over. Gaat een donker gebied daarmee terug naar normaal, dan ligt
     het aan de normal-map en niet aan de dagtextuur. */
  /* DE HELDERHEID VAN DE DAGKAART (sessie 41, Terry). Zie de lange noot bij
     `dayGain` in js/shaders.js: Blue Marble is aantoonbaar donkerder dan de
     kaart die Terra daarvoor gebruikte — gemiddelde luminantie 63,7 tegen 99,4,
     en 19 % bijna-zwarte pixels tegen 0 %.

     BEGINT ALLEBEI OP NEUTRAAL (1 en 0), zodat deze twee niets veranderen tot
     iemand ze verzet. De schuiven staan in het tuning-paneel onder Earth
     lighting. */
  dayGain: 1,          // vermenigvuldiging: tilt ALLES, ook wat al bijna 1 is
  dayLift: 0,         // optelling: tilt ook de bodem op, maakt de nacht grijzer
  /* GAMMA, SCHOUDER EN DE ZONSTERKTE (sessie 41, Terry). Zie de nagerekende
     tabellen bij `dayGamma` en `zachteSchouder` in js/shaders.js.

     Waar dit vandaan komt: met dayGain 2,5 blaast de dagzijde bij hoge
     zonnestand vlak wit uit boven woestijn en poolkappen, terwijl dezelfde
     scene bij lage zon juist klopt. Nagerekend op het subsolaire punt komen
     savanne, woestijn én poolijs alle drie op exact 1,000 uit — al het detail
     ertussen is weg.

     `dayGamma` tilt de donkere delen op en laat 1,0 op 1,0: hetzelfde zichtbare
     groen, zonder de heldere kant over de rand te duwen. `dayKnee` vangt wat er
     dan nog boven 1 uitkomt. `macroAmbient` en `macroSun` stonden als 0,55 en
     0,75 in de shader en zijn samen "hoe hard slaat de zon op het land".

     ALLE VIER BEGINNEN NEUTRAAL, dus ze veranderen niets tot ze verzet worden —
     gamma 1,0 is geen curve, knie 1,0 is het oude hard afkappen, en 0,55/0,75
     zijn de getallen die er altijd al stonden. */
  /* DE DIEPTEGRENZEN VAN DE KLEURSCHAAL (sessie 41). De kleuren staan in
     index.html bij `DEPTH_KLEUREN`; hier staan alleen de grenzen, want die
     hangen aan hoe de bevingen verdeeld liggen en daar wordt aan gedraaid.
     Zie de noot bij `depthStops()` voor de gemeten verdeling. Elke grens moet
     groter zijn dan de vorige — depthRGB gaat er van uit dat ze oplopen. */
  depthStop1: 10,        // km
  depthStop2: 40,
  depthStop3: 160,
  depthStop4: 320,
  depthStop5: 620,       // en alles dieper krijgt deze kleur
  dayGamma: 1.8,          // >1 lifts the dark parts and leaves 1.0 at 1.0
  dayKnee: 0.85,          // <1 bends the top over softly instead of clipping it
  macroAmbient: 0.55,     // what the surface still carries without direct sun
  macroSun: 0.85,         // how much the sun angle adds on top of that
  normalStrength: 5,      // exaggeration of the normal-map slope
  reliefStrength: 2.4,    // emboss gain → harder relief lines
  waterRipple: 1,         // amplitude of the procedural water ripple
  // schermvaste icoongrootte (app-breed, beide modi): iconen schalen mee met de
  // camera-afstand. Power-curve (pow>1) = agressievere zoom-respons, vooral diep
  // ingezoomd kleiner. camDist-bereik in de praktijk ≈ 169 (diep in) → 438 (uit).
  // schaal = clamp( (camDist / ref)^pow, min, max ).
  iconScaleRef: 280,   // camera-afstand waarbij schaal = 1 (lager = grotere iconen)
  iconScalePow: 1.55,  // steilheid (>1 = agressiever; diep inzoomen krimpt sneller)
  iconScaleMin: 0.4,   // ondergrens (sterk ingezoomd)
  iconScaleMax: 1.9,   // bovengrens (ver uitgezoomd)
  /* DE NABIJHEIDSKLEM (sessie 37) — en dit is waarom `zoomMinDistance` op 155 stond.

     GEMETEN 2026-08-22. De machtscurve hierboven houdt een marker van camera-afstand
     450 tot 168 op een hoekstraal van 0,8 à 1,0 graad: schermvast, precies zoals
     bedoeld. Op 168 raakt hij `iconScaleMin` en bevriest de wereldgrootte, terwijl de
     grond blijft naderen. Vanaf daar loopt de hoekstraal weg:

         camera-afstand   168    155    125    110    102
         hoekstraal       1,0°   1,1°   2,5°   7,0°   64,3°

     De halve verticale fov is 25 graden, dus op 102 bedekt één vulkaan méér dan het
     hele scherm — gezien als een vlak geel beeld. Dat is de werkelijke reden dat er
     niet dichterbij gezoomd mocht worden; de near-plane, waar het commentaar bij
     `zoomMinDistance` naar wees, is gemeten en in orde.

     De klem hieronder begrenst de schaal evenredig met de afstand tot de glyph, wat
     de hoekgrootte begrensd houdt. 0,0080 is zo gekozen dat hij bóven 155 NIET bijt:
     op 155 geeft hij 0,428 tegen een curve-waarde van 0,400. Boven die afstand
     verandert er dus niets — dat is meteen de tegenmeting bij elke wijziging hier. */
  iconNearScalePerUnit: 0.0080,
  /* DE LABELS KRIMPEN MEE MET DE BOL (sessie 25) — schaal = clamp(fitAarde/camDist,
     min, max), met `fitAarde` de afstand waarop de hele aarde net in beeld past.

     TOT SESSIE 25 LIEP DIT PRECIES DE VERKEERDE KANT OP: de formule was
     `camDist / 350`, dus verder weg gaf een GROTER label — tot 1,1 keer. Uitgezoomd
     bedekten acht labels van volle grootte de aarde die ze zouden moeten aanwijzen.
     Nu is 1,0 het plafond en krimpen ze mee zodra je voorbij "de hele aarde past in
     beeld" komt.

     `fitAarde` is aspect-afhankelijk (fitDistance in index.html) en dus geen vast
     getal meer: op een telefoon in portret is de horizontale beeldhoek de krappe, en
     past de aarde pas op ongeveer twee keer de desktop-afstand. Een ingetikte
     referentie zou daar het ene of het andere formaat straffen. */
  labelScaleMin: 0.80, // bodem: 11px x 0,80 = 8,8px — daaronder valt er niets meer te lezen
  labelScaleMax: 1.0,  // nooit groter dan ingezoomd; zie de noot hierboven
  /* WAAR DE LABELS HELEMAAL UITGAAN, als veelvoud van `fitAarde`. Op een 16:9-desktop
     past de aarde op ~237, dus dit landt op ~403 — net vóór de zon op 420, precies
     waar Terry hem wilde. Als factor en niet als afstand, want op een telefoon ligt
     `fitAarde` op ~475 en zou een ingetikte 403 de labels overal uitzetten. */
  labelHideFactor: 1.7,
  // Sinds sessie 16 tellen alleen labels aan de NAAR-ONS-GEKEERDE kant mee voor het
  // plafond (positionLabels filtert op nearSide vóór het budget, niet erna). Daardoor
  // is het aantal in beeld constant terwijl je de bol draait, en mocht dit bereik
  // omhoog: 4 zichtbare labels op een halve aardbol is te weinig.
  labelCountMin: 8,    // aantal beving-labels ver uitgezoomd
  // labelCountMax is sinds sessie 16 de BEGINSTAND van een instelling (Settings →
  // Preferences → Maximum labels), niet langer een harde grens. De lopende waarde
  // staat in `labelBudget` in index.html; rebuildLabels() bouwt er zoveel, en
  // positionLabels() interpoleert ernaartoe. Wie hier een grens zoekt: die is
  // labelCountCeiling.
  labelCountMax: 20,   // aantal beving-labels diep ingezoomd (meer detail)
  labelCountCeiling: 40, // bovengrens van de slider — zie de meting hieronder
  /* DE POOL IS ALLES WAT DOOR DE FILTERS KOMT, en dat is een correctie uit sessie 37.

     Tot dan was de pool `labelBudget x labelPoolFactor` — met het maximum op 6 dus de
     72 ZWAARSTE bevingen ter wereld. GEMETEN: van 288 bevingen zat de zwakste in die
     pool op M3,8. Alles daaronder kon per definitie nooit een label krijgen, waar je
     ook keek. Boven Europa is dat funest: EMSC levert daar veel M2 tot M3,5, die
     vielen allemaal buiten de pool, en dan zag je NUL labels terwijl er tientallen
     bevingen in beeld stonden.

     Dat was een verborgen magnitude-drempel bovenop de filters, en die hoort er niet
     te zijn: het paneel bepaalt welke bevingen meedoen, niet de labellaag.

     Nu is elke gefilterde beving kandidaat en kiest positionLabels() daaruit de
     zwaarste die in beeld staan. Het dak hieronder is een DOM-grens en geen
     redactionele keuze — elk element is een div plus twee SVG-nodes. Boven dat dak
     wint magnitude alsnog, maar bij zo'n dichte set heeft elke weergave kandidaten. */
  labelPoolMax: 500,   // dak op de pool — elk element is een div plus twee SVG-nodes
  // De stapellus in positionLabels() is O(n²) in het aantal ZICHTBARE labels en
  // draait elk frame; 40 is de grens waar dat nog ruim binnen de begroting valt.
  labelCountDebounce: 120, // ms — slepen mag de DOM niet per stap laten herbouwen
  // Het hover-label staat op labelAltitude (0,42 straal) bóven het epicentrum, dus
  // de muis moet een flink stuk scherm afleggen om er te komen — en onderweg ligt er
  // geen glyph onder de cursor. Zonder dit uitstel is het label nooit aan te klikken.
  labelHoverGrace: 350, // ms dat het hover-label blijft staan na het verlaten van de indicator
  // ---- Geografische overlays (tektonische platen, landgrenzen) ----
  // Werken in béíde weergavemodi. In realistisch dun en halftransparant, want harde
  // vectorlijnen over een gefotografeerde aarde ogen goedkoop; in deskundig mogen ze
  // vol zijn, dat past juist bij die kaart-look.
  // Kleuren bewust wég van de datalagen. Subductie was eerst oranje (#ff8a4c) en dat
  // botste met de aardbeving-staven (#ff6b3d) — niet meer doen, dat leest als één ding.
  // Tektoniek in één koel/warm paar: rood waar platen botsen (subductie), diep blauw
  // waar ze uit elkaar gaan of langs elkaar schuiven. Landgrenzen krijgen een gelige
  // tint — een andere kleurfamilie dan de tektoniek, dus meteen te onderscheiden, en
  // geel houdt zich goed staande op zowel de dag- als de nachtzijde.
  plateSubductionColor: '#ff3355',  // convergent/subductie — waar de zware bevingen zitten
  plateOtherColor:      '#3d6cff',  // overige grenzen (divergent/transform)
  borderColor:          '#ffd66b',  // landgrenzen — gelig, los van de tektoniek-kleuren
  overlayAltitude:      0.006,      // realistisch: net boven het oppervlak
  // Deskundig tekent land-polygons op 0.01 (zie modes/expert.js). Blijven de overlays
  // daaronder, dan bedekt het land ze en zie je alleen de grenzen in de oceaan.
  overlayAltitudeExpert: 0.013,
  /* OOK DE OVERLAYS ZAKKEN MEE BIJ HET INZOOMEN (sessie 38, Terry). Zelfde reden en
     zelfde vorm als `expertIndicatorAltMin`: 0,3 eenheden boven de landvlakken is
     nodig tegen z-fighting ver uitgezoomd, en is dichtbij precies wat de grenzen en
     plaatranden van de kaart los laat komen. Terry zag ze meebewegen bij het draaien.

     0,0102 ligt 0,02 eenheden boven de landvlakken (0,010) en 0,02 ONDER de ondergrens
     van de indicatoren (0,0104) — die volgorde hoort zo, anders snijden de kaartlijnen
     door de symbolen heen.

     DIT KAN ALLEEN OMDAT DE SCHEMATISCHE WEERGAVE GEEN CASINGS HEEFT. In de
     realistische modus krijgt elke lijn een donkere casing 0,0008 lager; die zou hier
     onder het land duiken en weggeclipt worden. Zie `if (!expert)` in renderOverlays.
     De realistische modus blijft daarom ongemoeid op `overlayAltitude`. */
  overlayAltitudeExpertMin: 0.0102,

  // Op de dagzijde verdwijnt een dunne gekleurde lijn in de felle textuur. Daarom
  // krijgt elke lijn in de realistische modus een donkere "casing" eronder: dezelfde
  // cartografische truc die de deskundig-symbolen al gebruiken. In de deskundig-modus
  // is de achtergrond egaal donker en is dat niet nodig.
  overlayCasingColor:   'rgba(3,6,12,0.8)',
  overlayCasingExtra:   0.55,       // hoeveel breder de casing is dan de lijn
  overlayCasingDrop:    0.0008,     // hoeveel lager de casing ligt

  /* ---- De stormbaan en de windvoetafdruk (sessie 42, Terry) ----
     Beide komen RECHTSTREEKS uit het JTWC-waarschuwingsbestand: de baan uit de
     `T`-regels (positie en kracht per tijdstap) en de voetafdruk uit de straal
     van 34-knoopswind per kwadrant. Er wordt niets geëxtrapoleerd, en er is
     bewust GEEN onzekerheidskegel — zie js/compute/storm-track.js. */
  stormTrackLift: 0.02,      // boven de kaartlijnen, in beide weergaven
  stormTrackStroke: 1,       // de verwachte baan
  stormStopRadiusDeg: 0.3,   // de markering per tijdstap, in graden booglengte
  stormStopStroke: 2,
  stormFootprintStroke: 2,   // de 34-knoopsvoetafdruk
  stormFootprintColor: '#4dd0e1',
  overlayStrokeRealistic: 0.75,     // lijndikte in de realistische modus
  overlayStrokeExpert:    0.8,      // schematische kaart
  borderStrokeFactor:     0.7,      // landgrenzen dunner dan plaatgrenzen — hiërarchie
  overlayOpacityRealistic: 0.92,    // mag hoog nu de casing voor contrast zorgt
  overlayOpacityExpert:    0.95,
  borderOpacityFactor:     0.72,    // landgrenzen wat ingetogener dan de platen

  // Landnamen. Natural Earth levert LABEL_X/LABEL_Y (door cartografen geplaatste
  // labelpunten) en LABELRANK (1 = belangrijkst). Die rang gebruiken we als
  // overlap-behandeling: ver uitgezoomd alleen de belangrijkste namen, bij inzoomen
  // komen de kleinere landen erbij. Alle 177 namen tegelijk is onleesbare rommel.
  countryLabelColor: '#e2ecf9',
  // VASTE maat in wereldeenheden (sessie 9, 2026-07-30). Was een factor die met de
  // camera-afstand werd vermenigvuldigd, zodat de schijnbare grootte gelijk bleef. Dat
  // is teruggedraaid omdat het onbetaalbaar bleek: three-globe bouwt labels als échte
  // tekstgeometrie, en een gewijzigde `labelSize` laat het die voor alle zichtbare
  // landen opnieuw genereren. Gemeten op 2026-07-30: frames van 357 ms tijdens het
  // zoomen, tegen 9 ms met de labels uit. Meeschalen ging bovendien bijna elke zoomtick
  // aan, want met factor 0,62 is een hoogteverschil van 0,016 al genoeg.
  // Gevolg van de vaste maat: namen worden groter naarmate je inzoomt. Dat is
  // kaartconventie, geen bijwerking — zoom je op Europa in, dan hoort "Nederland"
  // groter te worden. Daarom bewust klein gehouden.
  // De maat is een HOEKmaat (graden op de bol), niet een schermmaat, en het zoombereik
  // is een factor 17.
  //
  // HERZIEN 2026-07-31. Tot dan waren het twee vaste maten met een lineaire
  // interpolatie ertussen. Dat klopte niet: de zoom loopt exponentieel, de
  // interpolatie liep lineair, en daardoor viel de maat juist ver uitgezoomd te laag
  // uit. Terry's klacht "erg klein bij default, pas leesbaar als je inzoomt" was daar
  // het directe gevolg van, en ingezoomd werd hij juist te groot, wat de namen in
  // Europa over elkaar heen duwde.
  //
  // Nu: de hoekmaat is EVENREDIG met de camera-afstand. Twee keer zo ver weg is twee
  // keer zo veel graden om even groot op het scherm te blijven. Daarmee is de
  // schermmaat constant en is er effectief geen scaling meer, wat het gevraagde is.
  // De maat blijft aan de rang-limiet hangen, dus hij verandert nog steeds hooguit
  // zeven keer over het hele bereik en de rebuild blijft gesmoord.
  // ===== DE TWEE KNOPPEN OM AAN TE DRAAIEN =====================================
  //
  // 1) countryLabelScreenSize — de maat als geheel.
  //    Hoger is overal groter, lager is overal kleiner. Het ijkpunt ligt bij diepe
  //    zoom: 0,9 × countryLabelAltNear (0,2) ≈ 0,18 graden. Dat is de maat die Terry
  //    op 2026-07-31 als maximum heeft aangewezen. Verander deze alleen als de namen
  //    ook diep ingezoomd niet kloppen.
  //
  // 2) countryLabelSizeFalloff — hoe hard de maat meeloopt met de camera-afstand.
  //    DIT is de knop voor "bij default een stuk kleiner".
  //      1,0  = schermmaat overal gelijk. Ver uitgezoomd 1,98 graden
  //      0,7  = ver uitgezoomd ongeveer 0,96 graden, dus de helft
  //      0,5  = ver uitgezoomd ongeveer 0,60 graden
  //      0,0  = één vaste hoekmaat, ver uitgezoomd onleesbaar klein
  //    Lager betekent: hoe verder je uitzoomt, hoe kleiner de namen op het scherm.
  //    Het ijkpunt bij diepe zoom verandert NIET mee, wat je hier ook invult.
  //
  // Na een wijziging alleen de pagina verversen; er wordt niets gecachet.
  countryLabelScreenSize: 0.5,
  countryLabelSizeFalloff: 1.0,
  countryLabelAltFar: 1,          // camera-afstand waarbij de rang-limiet op Far staat
  countryLabelAltNear: 0.01,         // idem voor Near; samen de as waarop t wordt bepaald
  countryLabelAltitude: 0.016,      // boven de overlays, anders snijden ze erdoorheen
  countryLabelRankFar: 2,           // ver uitgezoomd: alleen rang 1 t/m 2
  countryLabelRankNear: 100,          // diep ingezoomd: vrijwel alles
  // De rangen liepen recht evenredig met de zoom, waardoor de kleinste landen al
  // vroeg in beeld kwamen en de Balkan een kluwen werd. Met een exponent boven 1
  // komen de hoge rangen pas bij écht diep inzoomen, precies waar er ook ruimte voor
  // ze is. Dit is de knop voor overlap, niet de maat.
  countryLabelRankCurve: 1.8,
  // ===== DE BOTSINGSTOETS =======================================================
  // De rang alleen kan België niet bij Duitsland weghouden: GEMETEN op 2026-07-31
  // heeft België `LABELRANK` 2, precies dezelfde als Rusland en Duitsland. Natural
  // Earth kent die score redactioneel toe, niet ruimtelijk. Daarom vergelijkt
  // fitCountryLabels() de labelvlakken onderling en laat het botsende namen weg; bij
  // gelijke rang wint het bredere land.
  //
  // 3) countryLabelPadding — hoeveel lucht er om elke naam moet blijven.
  //      1,0  = namen mogen elkaar net raken
  //      1,25 = 25% lucht eromheen; hierbij wijkt België ver uitgezoomd voor Duitsland
  //             en komt het terug zodra je inzoomt
  //      1,6  = royaal, duidelijk minder namen tegelijk
  //    HOGER = minder namen, meer rust. Dit is de knop voor België/Duitsland.
  //    Gemeten bij de standaardzoom: 1,25 geeft 35 namen, 1,6 geeft er 34.
  countryLabelPadding: 1.25,
  // Breedte van één teken als fractie van de teksthoogte. GEKALIBREERD op een
  // schermafdruk van 2026-07-31: "Belgium" was daar 65 px breed bij een teksthoogte
  // van 11 px, dus 65 / 11 / 7 tekens ≈ 0,84. De eerdere schatting van 0,55 was te
  // smal, waardoor de botsingstoets botsingen miste die op het scherm wel te zien
  // waren. Alleen aanpassen als lange namen stelselmatig te vroeg of te laat wijken.
  countryLabelCharWidth: 0.8,
  // De rang-limiet is de énige overgebleven zoom-trigger die labels herbouwt. Hij
  // verandert in hele stappen en dus hooguit zeven keer over het zoombereik, maar elke
  // stap kost nog steeds een rebuild. Daarom pas herbouwen als de zoom deze tijd heeft
  // stilgestaan; tijdens de beweging zelf gebeurt er niets.
  countryLabelRankDebounce: 120,    // ms (was 260; korter omdat de rangen nu later
                                    // verspringen en er dus minder rebuilds zijn)
  // zoom-LOD (app-breed): ver uitgezoomd alleen de significantste events per laag;
  // bij inzoomen onthult geleidelijk meer (tegen bloat). frac = deel per laag getoond.
  lodEnabled: true,
  lodFracOut: 0.25,    // fractie per laag op VOLLE grootte ver uitgezoomd; de rest krimpt
  lodCamNear: 175,     // camDist diep ingezoomd → alles op volle grootte
  lodCamFar: 430,      // camDist ver uitgezoomd → alleen lodFracOut op volle grootte
  // Sinds sessie 9 (2026-07-30) VERBERGT de LOD niets meer. Minder significante events
  // krimpen naar lodScaleMin in plaats van te verdwijnen. Een gebeurtenis die echt
  // plaatsvindt hoort nooit onzichtbaar te zijn; drukte oplossen door data weg te
  // laten is een leugen, drukte oplossen door gewicht te verschillen niet.
  lodScaleMin: 0.42,   // ondergrens: hoe klein een event maximaal wordt
  lodScaleFade: 0.5,   // over welk deel van de rangschaal de krimp verloopt
  // Auto-rotatie. De globe draait zachtjes tot je hem aanraakt, en pakt de draad weer
  // op als het deze tijd stil is gebleven. Voorheen stopte hij bij de eerste interactie
  // en kwam hij nooit meer terug.
  autoRotateSpeed: 0.32,
  autoRotateResumeMs: 10000,
  // ===== ZOOMGRENZEN ============================================================
  // Camera-afstand tot het middelpunt van de aarde. De bol zelf heeft straal 100, dus
  // dit zijn absolute afstanden en geen factoren: 100 is precies het oppervlak.
  //
  //   zoomMinDistance — hoe dicht je erop mag. LAGER = verder inzoomen.
  //     110  het oppervlak vlak voor je neus; de kromming is dan bijna weg
  //     140  stevig ingezoomd, ongeveer een land in beeld  ← standaard
  //     200  behoudend, altijd een flink stuk van de bol in beeld
  //     Onder de ~105 zoom je de camera de aarde ín en zie je de textuur van binnen.
  //
  //   zoomMaxDistance — hoe ver je weg mag. HOGER = verder uitzoomen.
  //     380  de aarde vult het beeld comfortabel
  //     450  de hele bol met wat ruimte eromheen  ← standaard
  //     700  de aarde wordt een bal in de verte; landnamen zijn dan onleesbaar
  //
  // De praktijkwaarden vóór deze grenzen bestonden liepen van ongeveer 169 tot 438.
  //
  // NIET ZOMAAR VERRUIMEN — maar om een andere reden dan hier tot sessie 37 stond.
  // Er stond dat deze grens een renderfout afdekte, "vermoedelijk de near-plane van
  // de camera in verhouding tot de bolstraal". GEMETEN 2026-08-22, live in de app:
  // `camera.near` is 0,05 en `far` 125.000, op een 24-bits dieptebuffer in WebGL2.
  // De diepteresolutie aan het oppervlak komt daarmee op ~0,004 units (≈ 250 m).
  // Daar is niets mis mee. Het gedocumenteerde recept klopt evenmin nog: `enablePan`
  // staat in de aardweergave op false, dus "pannen over het oppervlak" kan er niet.
  //
  // DE ECHTE OORZAAK IS GEVONDEN, EN HET WAS GEEN RENDERFOUT. Op 155 raakt de
  // icoonschaal zijn ondergrens `iconScaleMin` (gemeten: dat gebeurt op 168), en
  // daaronder bevriest de wereldgrootte van elke marker terwijl de grond blijft
  // naderen. Op afstand 102 heeft één vulkaan een hoekstraal van 64 graden tegen
  // een halve fov van 25 — een vlak, effen beeld dat als "clipping" leest. Zwart of
  // geel hangt er alleen van af welke glyph er toevallig vóór hangt.
  //
  // De nabijheidsklem bij `iconNearScalePerUnit` heft dat op: onder 155 blijft de
  // hoekstraal op 1,19 graden staan in plaats van weg te lopen, en boven 155
  // verandert er niets (gemeten, rij voor rij).
  //
  // EN ER WAS WEL DEGELIJK EEN TWEEDE, ECHTE RENDERFOUT — alleen niet de near-plane.
  // De fresnel in `dayNightShader` deed `pow(1.0 - dot(n, v), 2.5)`. Recht op het
  // oppervlak kijken geeft dot = 1, door afronding soms nét meer, en dan is de basis
  // negatief: in GLSL ongedefinieerd, dus NaN, die bloom over het halve beeld
  // uitsmeert en de grade-pass zwart maakt. GEMETEN op straal 105: 85,1 % zwart, met
  // de basis geklemd 0 %, teruggedraaid weer 85,1 %. Ver weg raakte dit hooguit een
  // handvol pixels; pas van dichtbij wordt het gebied waar dot tegen 1 aan ligt groot
  // genoeg om op te vallen. DAT was het flikkerende zwarte vlak. Zie js/shaders.js.
  //
  // Daarmee kon deze grens omlaag van 155 naar 120: van 3504 km naar 1274 km boven het
  // oppervlak.
  //
  // WAAROM 120 EN NIET LAGER (Terry, sessie 37). Technisch kan de camera tot vlak
  // boven de grond; wat het tegenhoudt is de TEXTUUR. Eén wereldtextuur van 8k geeft
  // op deze hoogte al zichtbare vergroting, en daaronder wordt het pap. 120 is de
  // stand waar het beeld nog draagt — nagemeten aan een opname van Terry.
  //
  // GEVOLG: je gaat NIET door de wolkenschil (103,5). De fade doet vanaf afstand 200
  // al zijn werk, dus de leesbaarheid — het eigenlijke doel — is er gewoon. Wat er
  // klaar blijft liggen voor als de textuur wél meekan: de schil is DoubleSide en
  // CLOUD_FRAG heeft al een onderzijde. Zodra de grens onder 103,5 zakt werkt dat.
  //
  // De echte oplossing is tegel-gebaseerde beelden per zoomniveau in plaats van één
  // wereldtextuur. Dat is een eigen onderwerp en staat gepland.
  //
  // De vangrail hieronder is `zoomFloorRadius`, die om het MIDDELPUNT meet en dus ook
  // standhoudt als het draaipunt ooit gaat schuiven. Die blijft bewust op 101 staan:
  // hij bewaakt de aardbol, niet de beeldkwaliteit.
  /* ===== DE TEGELSCHIL ==========================================================
     De splitsdrempel: hoeveel schermpixels één texel van een tegel mag beslaan
     voordat hij in vieren gaat. DIT IS DE DIRECTE BANDBREEDTEKNOP en hij werkt
     kwadratisch — elke stap omhoog haalt er ruwweg driekwart van het verkeer af
     tegen nauwelijks zichtbaar scherpteverlies:

         drempel   data t.o.v. 1,0
           1,0         100 %
           1,5          44 %   <- hier
           2,0          25 %
           2,5          16 %

     1,5 is de stand uit de POC. Hij hoort straks per bandbreedtetrap te
     verschillen; tot die keuze bestaat is dit één waarde voor iedereen. */
  tileSplitError: 1.5,
  /* HOE DICHT DE TEGELSCHIL TOELAAT. `zoomMinDistance` hieronder is gezet op wat
     één wereldtextuur aankan; de tegels halen beeld bij naarmate je nadert, dus
     daar geldt die grens niet.

     100,25 is 16 km hoogte, en dat is waar de BRON ophoudt: EOX levert tot level
     13, ongeveer 10 meter per pixel. Dieper zou de shader alleen nog vergroten.

     WAT ER OP DEZE HOOGTE TE ZIEN IS: straten, stadsblokken, start- en
     landingsbanen, rivieren met hun zandbanken. Geen losse huizen — bij 10 m per
     pixel ligt de herkenningsgrens rond 20 tot 30 meter.

     DE ICOONSCHAAL KAN MEE. Gemeten: zodra de nabijheidsklem bijt (onder ~123)
     staat de hoekstraal van een marker constant op 0,46 graden, en dat blijft zo
     tot 101,6. Er hoefde dus niets aan bij.

     JE GAAT WEL DOOR DE WOLKENSCHIL (103,5) EN DE MISTSCHIL. Dat is voorbereid:
     de wolkenschil is DoubleSide en CLOUD_FRAG heeft een onderzijde, en de fade
     rekent met de absolute afstand tot de schil, dus van onderaf blijft het dek
     weg zoals het hoort.

     `zoomFloorRadius` gaat mee omlaag; die is er om de camera BUITEN de bol te
     houden, niet om de beeldkwaliteit te bewaken. */
  zoomMinDistanceTiles: 100.25,
  zoomMinDistance: 120,
  /* DE SCHEMATISCHE WEERGAVE MAG VERDER (sessie 38, Terry). De grens hierboven is
     gezet op de TEXTUUR, en die bestaat in de schematische weergave niet: daar is de
     bol een effen vlak met vectorpolygonen erop, en die blijven scherp op elke schaal.
     Wat er in het echt speelt is het omgekeerde — bij een dicht cluster als de Flores
     Zee vallen zes bevingen op elkaar tot een blob, en juist daar wil je erin kunnen.

     De harde bodem `zoomFloorRadius` geldt onverkort; deze waarde hoort daarboven te
     blijven. Zodra realistisch dieper kan (tegel-gebaseerde beelden per zoomniveau)
     mogen de twee weer samenvallen. */
  zoomMinDistanceExpert: 102,
  zoomMaxDistance: 450,
  // ===== DE HARDE BODEM (sessie 37) =============================================
  // Gemeten vanaf het MIDDELPUNT van de aarde, en dat onderscheid is het hele punt.
  // `zoomMinDistance` hierboven gaat naar `OrbitControls.minDistance`, en die meet
  // camera-tot-DRAAIPUNT. Zolang `zoomToCursor` uit staat en globe.gl het draaipunt
  // bij elke 'change' op de oorsprong terugzet, vallen die twee samen — maar dat is
  // een samenloop en geen garantie. Zet iemand pannen of zoom-to-cursor aan, dan
  // schuift het draaipunt naar het oppervlak en zoom je met een keurig geldige
  // `minDistance` alsnog de bol in.
  //
  // Dit is dus geen kijkwaarde maar een vangrail: hij houdt de camera BUITEN de
  // bol, meer niet. Zie `houdCameraBovenDeAarde()` in index.html.
  //
  // 100,1 SINDS DE TEGELSCHIL. Hij stond op 101 — 64 km hoogte — omdat de
  // beeldkwaliteit toch niet dieper toeliet, en dan is een ruime marge gratis. Met
  // tegels gaat de kijkgrens naar 100,25 en zou 101 die grens zelf worden, wat de
  // vangrail tot bediening maakt. 100,1 is 6 km boven het oppervlak: ruim onder
  // waar iemand mag kijken en ruim boven de bol.
  zoomFloorRadius: 100.1,
  // ===== ZON EN MAAN (sessie 14) ================================================
  // Afstanden zijn BEWUST niet realistisch. De echte maan staat op 60 aardstralen
  // (dus 6030 in deze eenheden) en de zon op 23.480 (2,3 miljoen). Op die schaal is
  // de aarde een stip en de maan onvindbaar. Wat wél klopt is de VERHOUDING: de maan
  // staat dichterbij dan de zon, en de maanafstand ademt mee met perigeum/apogeum.
  //
  // Beide afstanden liggen ruim boven `zoomMinDistance` (155). Dat is geen toeval:
  // stond een lichaam daarbinnen, dan kwam het bij inzoomen achter de camera terecht.
  //
  // De stralen zijn eveneens vergroot. Zon en maan hebben in werkelijkheid allebei
  // een hoekdiameter van ongeveer een halve graad; op deze afstanden zou dat een
  // straal van ~2 units geven, oftewel een stip. De waarden hieronder geven ze een
  // hoekdiameter van ruwweg 6 graden — herkenbaar zonder de aarde te overheersen.
  sunDistance:  420,
  sunRadius:     22,
  moonDistance: 300,
  moonRadius:    15,
  // Perigeum/apogeum: de maan komt zichtbaar dichterbij en verder weg. 35 op 300 is
  // dezelfde relatieve slag (11,6%) die het prototype gebruikte.
  moonDistanceSwing: 35,
  // Gloed rond de lichamen, als factor van hun straal. De zon krijgt een royale
  // additieve halo; de maan een subtiele koele zoom.
  sunGlowScale:  5.5,
  moonGlowScale: 2.2,
  // Helderheidsboost van de zon, als RGB-vermenigvuldiger over de textuur.
  //
  // WAAROM BOVEN 1: de renderer draait zonder tonemapping (`toneMapping: 0`,
  // gemeten), dus de zon is letterlijk textuur maal deze kleur. De zontextuur van
  // Solar System Scope is rood-oranje en komt daarmee niet boven de bloom-drempel
  // van 0,75 uit — de UnrealBloomPass deed dus niets en de zon oogde als een matte
  // rode knikker zonder corona. MeshBasicMaterial klemt `color.setRGB()` niet op 1,
  // dus waarden boven 1 zijn de weg naar HDR-pixels die wél bloomen.
  //
  // Iets warmer dan neutraal (R > G > B) houdt de zon herkenbaar geel-oranje in
  // plaats van klinisch wit.
  sunColorBoost: [2.6, 2.25, 1.85],
  // Subpunt-markers op het aardoppervlak (waar het lichaam recht boven staat).
  subPointRadius: 2.6,
  // Hoogte boven het oppervlak, als fractie van de straal. Twee grenzen knijpen
  // deze waarde vast: hij moet BOVEN 0,010 blijven, want de schematische weergave
  // legt de land-polygons op precies die hoogte en de markers zouden er anders
  // onder verdwijnen; en zo LAAG mogelijk, want een marker die zichtbaar boven de
  // bol zweeft leest als een object in de ruimte in plaats van als een plek op de
  // kaart. 0,015 is dezelfde hoogte als de schemeringslijnen.
  subPointAltitude: 0.015,
  //   zoomToCursor — zoomt de camera naar de muisaanwijzer of naar het middelpunt?
  //     false  naar het middelpunt. De grenzen hierboven houden gegarandeerd stand  ← standaard
  //     true   naar de muisaanwijzer, wat prettiger navigeert, maar dan verschuift het
  //            draaipunt mee en bewaakt zoomMinDistance de afstand tot dát punt. Je kunt
  //            dan dichter bij het oppervlak komen dan de grens bedoelt.
  zoomToCursor: false,
  // label-stacking: aardbeving-labels die op het scherm te dicht op elkaar vallen
  // worden verticaal gestapeld (met dotted leader-line). Alleen labels, nooit de
  // indicatoren op de kaart.
  labelStackGapY: 30,  // min verticale tussenruimte (px) tussen gestapelde labels
  labelStackGapX: 80,  // labels gelden als 'nabij' binnen deze horizontale afstand (px)
  // Hoeveel labels er maximaal in ÉÉN kolom mogen staan. De stapeling duwt botsende
  // labels omhoog en kende geen grens: bij een dicht cluster groeide de kolom door tot
  // buiten het scherm (6 x 30 = 180 px, tegen 40 x 30 = 1200 px op een viewport van
  // 860). Wie er boven uitkomt wordt verborgen, niet verder omhoog geduwd.
  labelStackMax: 6,
  labelAltitude: 0.42, // hoogte (fractie straal) van het labelpunt — hoger = vrij van de indicatoren
  /* DE LABELHOOGTE SCHAALT MEE MET DE ZOOM (sessie 37, Terry).

     `labelAltitude` was een vaste hoogte: straal 142, ver boven het epicentrum. Dat
     werkte zolang de camera nooit dichterbij dan 155 kwam. Sinds de zoomgrens omlaag
     ging niet meer — op straal 105 ligt dat labelpunt 37 eenheden ACHTER de camera,
     en dan schiet de stippellijn van het epicentrum naar het label dwars over het
     scherm. Terry zag een waaier van kruisende lijnen.

     De hoogte hoort schermvast te zijn en niet wereldvast. De schermafstand tussen
     epicentrum en label is bij benadering hoogte/(camera-afstand tot het oppervlak);
     die constant houden betekent dus dat de hoogte EVENREDIG met die afstand
     meeloopt. Vandaar een ijkafstand in plaats van een tweede losse factor:

       hoogte = labelAltitude x (camLen - 100) / (labelLiftFrom - 100),  geklemd op
                labelAltitude

     DE IJKAFSTAND IS GELIJK AAN `zoomMaxDistance`, en dat is geen toeval: daarmee is
     de schermafstand op ELKE stand precies die van volledig uitgezoomd. Eén regel
     over het hele bereik, in plaats van een plafond dat halverwege gaat bijten.

     GEMETEN waarom dat uitmaakt. Het labelpunt hangt boven het epicentrum, en op een
     bol schuift een hoger punt bij het projecteren radiaal naar buiten. Hoe hoger het
     label, hoe eerder het over de beeldrand valt — en dan is het label weg terwijl de
     beving in beeld staat. Boven Europa op afstand 155, met het maximum op 6:

         ijkafstand 280 -> 5 labels     ijkafstand 360 -> 6
         ijkafstand 320 -> 6            ijkafstand 450 -> 6

     Een andere waarde hier is dus niet alleen smaak: hij bepaalt hoeveel labels er
     nog passen. Toets bij een wijziging altijd bovenstaande vier standen na. */
  labelLiftFrom: 450,
  /* Labels tellen alleen mee als hun EPICENTRUM in beeld staat, niet als het aan de
     naar-ons-gekeerde kant van de bol ligt. Ver uitgezoomd valt dat samen; ingezoomd
     is de halve bol vele malen groter dan het scherm, en dan ging het plafond op aan
     bevingen die je helemaal niet ziet. Zet je het maximum op 6, dan hoor je er zes
     te zien op de plek waar je kijkt. Marge in pixels, zodat een label dat half over
     de rand valt nog meetelt. */
  labelViewMargin: 80,
  // deskundig (schematische) modus — vlakke kaart-kleuren
  expertOcean: '#0e1b2a',   // effen oceaan-bol
  expertLand:  '#26323d',   // vlak land-vlak
  expertCoast: '#5e7488',   // harde kustlijn-stroke
  expertBg:    '#080b11',   // platte achtergrond (i.p.v. sterren)
  expertEdge:  '#dfe8f2',   // lichte contrast-rand ("casing") rond elk symbool
  // wireframe-doorkijk (realistische weergave) — kustlijn als omtrek zonder vulling.
  // Helderder dan het rooster van wireMesh (#3a8fa0 op 0,35): het raster is
  // oriëntatie, de kust is inhoud. De achterkant van de bol tekent mee, dus dit
  // moet leesbaar blijven waar twee kustlijnen elkaar kruisen.
  wireCoast: '#7fd4e6',
  // Het rooster zelf: doffer dan de kustlijn, want het is oriëntatie en geen inhoud.
  // Je ziet altijd de voor- én de achterkant, dus alles wat hier te fel staat telt
  // dubbel op de limbus.
  //
  // OPACITY GING VAN 0,35 NAAR 0,55 (sessie 28, Terry's tweede test). GEMETEN met
  // twee frames naast elkaar, één met en één zonder rooster: op 0,35 raakte het
  // grove rooster ingezoomd 0,99 % van de pixels met een gemiddelde delta van 102
  // op 765. Het oude mesh-wireframe leek feller omdat het DICHTER was (7,5° in de
  // lengte, 5,6° in de breedte, plus een diagonaal per vak) — niet omdat de lijnen
  // sterker waren. Met de diagonalen eruit valt die dekking weg, en dan moet de
  // helderheid het overnemen.
  wireGrid: '#3a8fa0',
  wireGridOpacity: 0.55,
  // Het FIJNE rooster, dat alleen ingezoomd verschijnt. 15 graden is op de grond
  // 1670 km: kijk je naar een gebied ter grootte van Colombia, dan staat er hooguit
  // één lijn in beeld en is een rooster geen schaalverdeling meer. Vijf graden vult
  // dat op zodra je dichtbij komt, en verdwijnt weer zodra de hele bol in beeld is —
  // daar zou het juist dichtslibben.
  wireGridFineStep: 5,
  wireGridFineOpacity: 0.22,
  // Onder deze camera-afstand komt het fijne rooster erbij. De bol past op ~237 in
  // beeld (desktop) en dichterbij dan 140 laat OrbitControls niet toe, dus 210 ligt
  // net binnen "ik kijk naar een gebied" en buiten "ik kijk naar de aarde".
  wireGridFineDistance: 210,
  // antipode-doorkijk — koel, want het tegenpunt is nadrukkelijk NIET de
  // gebeurtenis zelf. De bevingen zijn oranje (#ff6b3d) en dat onderscheid moet
  // je in één blik zien; helderder dan de kustlijn eronder, want de koorde loopt
  // er dwars doorheen.
  antipodeColor: '#6fe3ff',
  antipodeChordRadius: 0.45, // straal van de koorde-cilinder (geen THREE.Line: die is 1 px)
  antipodeMarkerRadius: 2.4, // buitenstraal van de ring op het tegenpunt
  antipodeLabelPx: 20,       // schermvaste hoogte van de coördinaat
  expertEdgeWidth: 0.22,    // absolute randbreedte (units) — dun/subtiel, high-end
  // basis-hoogte voor ÁLLE indicatoren in deskundig modus: net boven de land-
  // polygons (0.01) zodat symbolen nooit door de kaart worden afgedekt. De
  // aardbeving-staaf rijst vanaf deze hoogte verder de atmosfeer in.
  expertIndicatorAlt: 0.013,
  /* DE MARGE BOVEN HET LAND SCHAALT MEE MET DE ZOOM (sessie 38, Terry).

     De 0,013 hierboven is gedimensioneerd op VER UITGEZOOMD: de landvlakken liggen op
     0,010 en de dieptebuffer heeft daar een resolutie van ~0,15 eenheden, dus die
     marge van 0,3 eenheden is nodig om z-fighting te voorkomen.

     Diep ingezoomd wordt diezelfde marge juist het probleem. Op camera-afstand 102
     staat een indicator 0,7 eenheden van je af terwijl hij 0,3 boven het land zweeft:
     een parallaxverhouding van 0,43. Kantel je het beeld, dan schuift de indicator
     zichtbaar over de kaart weg — hij lijkt niet meer vast te zitten. Terwijl de
     dieptebuffer daar een resolutie van 0,0000012 eenheden heeft en dus met een
     fractie van die marge toe kan.

     Vandaar een ondergrens die vlak boven de landvlakken ligt, met een lineaire
     overgang ernaartoe. Boven `zoomMinDistance` komt er onveranderd 0,013 uit — dat
     is meteen de scherpste toets bij een wijziging hier.

     LET OP: 0,010 is de `polygonAltitude` van de landvlakken in index.html. Verandert
     die, dan hoort deze mee. */
  expertIndicatorAltMin: 0.0104,
  // aardbeving (deskundig): ring + staaf samen.
  //   kleur (ring+staaf) = magnitude · ring-straal = magnitude · staaf-hoogte = diepte
  expertQuakeRingBase: 1.5,    // ring-straal basis (units)
  expertQuakeRingPerMag: 0.95, // ring-straal toeslag per magnitude-punt
  expertQuakeRingBand: 0.55,   // ring-banddikte (holle cirkel)
  expertQuakeBarBase: 0.8,     // staaf basishoogte (ook ondiepe bevingen zichtbaar)
  expertQuakeBarDepth: 11,     // max extra staaf-hoogte bij de grootste diepte (~700km)
  expertQuakeRadius: 0.3       // staafdikte
};

// venster-duur in ms per preset, voor de slider-berekening
export const WINDOW_MS = { hour: 3_600_000, day: 86_400_000, week: 604_800_000 };

// ---- Waar de assets vandaan komen -------------------------------------------
// Leeg = naast dit bestand, zoals altijd. Gevuld = een absolute prefix, en dan
// moet die op een `/` eindigen.
//
// Dit bestaat voor de standalone-variant (tools/build-standalone.mjs): één HTML die
// je kunt doorsturen en die via file:// opent. Daar werkt `fetch('./assets/…')`
// niet — file:// heeft origin `null` — dus wijzen de assets naar jsDelivr, dat de
// publieke repo al serveert met `access-control-allow-origin: *`.
//
// LET OP bij een gevulde base: texturen moeten dan met `crossOrigin = 'anonymous'`
// geladen worden. Gemeten op 2026-08-01: zonder die vlag laadt het plaatje wél,
// maar raakt het canvas "tainted" en weigert WebGL het als texture (SecurityError).
// three's TextureLoader zet die vlag standaard, maar de code doet het expliciet —
// dit is precies het soort onzichtbare afhankelijkheid dat iemand later opruimt.
export const ASSET_BASE = '';

export function asset(path) {
  return (ASSET_BASE || './') + path;
}

// Lokale earth-assets (in ./assets/earth/), in twee kwaliteiten.
// -----------------------------------------------------------------------------
// 2K is de STANDAARD. De 8K-set is samen ongeveer 29 MB en die willen we niemand
// ongevraagd laten downloaden; op een telefoon is dat pijnlijk. Wie hem wil, zet
// hem aan in de Aarde-tab en krijgt eerst te zien hoeveel dat kost.
// De sterrenhemel hoort bij de set: die is als achtergrond net zo zwaar.
// `bathyDay` is een VARIANT van `day`, geen extra laag: hij vervangt de dagtextuur
// en kost dus niets extra aan downloads of textuureenheden. In het bestand zit
// Terra's eigen land (Solar System Scope) met NASA's zeebodem eronder vandaan,
// samengevoegd langs de specular map. Dat samenvoegen gebeurt één keer bij het
// maken van de asset en niet in de shader — het masker verandert immers nooit.
// Zie logs/bathy/build-bathy-daymap.py (wordt niet meegeleverd).
export const TEXTURE_SETS = {
  /* DE SETS ZIJN IN SESSIE 41 VERVANGEN (Terry). Blue Marble voor de dag,
     Black Marble voor de nacht, en een eigen reliëfkaart in plaats van de
     normal map. Alles in WebP.

     `bathyDay` BESTAAT NIET MEER, en dat is geen bezuiniging maar een gevolg:
     de nieuwe dagtextuur HEEFT bathymetrie. Er valt dus niets meer te kiezen,
     en een keuze tussen "met" en "zonder" die allebei "met" opleveren is een
     schakelaar die liegt. Zie ook `glintStrength` — die had een tweede waarde
     voor precies deze situatie en heeft er nu nog maar één nodig.

     DE NORMAL MAP IS NIET VERVANGEN, en dat is een MEETUITKOMST (sessie 41).
     `terra-relief-*.webp` heeft even in dit slot gestaan, en dat brak de
     belichting over de hele bol:

       bestand                    blauw-gemiddelde   fractie Z negatief
       2k_earth_normal_map.png    255                 0 %
       terra-relief-4096.webp     110,8              58,2 %

     De shader leest dit slot als een tangent-space normal map
     (`rgb * 2.0 - 1.0`), dus het blauwe kanaal is de Z-component van de
     normaal — die hoort naar BUITEN te wijzen. Bij 58 % van het oppervlak wees
     hij naar binnen. Gemeten helderheid van de dagzijde over 725.075 bolpixels:
     10,86 met het reliëf tegen 18,75 met de normal map, en 19,38 met helemaal
     geen normal map. Zichtbaar sloeg de dag/nacht-menging per pixel om — een
     geblokt oranje-zwart patroon over Noord-Afrika.

     Het reliëfbestand is geen normal map maar een reliëfweergave. Wie het
     alsnog wil gebruiken, moet de shader de helling zélf laten uitrekenen uit
     de luminantie; in dit slot kan het niet. */
  '2k': {
    label: 'Standard (2K)',
    // Nagemeten op 2026-08-27, som van de vijf bestanden die een wissel ophaalt:
    // 540 + 197 + 966 + 466 + 134 KB.
    bytes: 2_303_000,
    day:      asset('assets/earth/terra-bluemarble-2048.webp'),
    night:    asset('assets/earth/terra-blackmarble-2048.webp'),
    clouds:   asset('assets/earth/2k_earth_clouds.jpg'),
    normal:   asset('assets/earth/2k_earth_normal_map.png'),
    specular: asset('assets/earth/2k_earth_specular_map.png'),
    stars:    asset('assets/stars/2k_stars_milky_way.jpg')
  },
  '8k': {
    label: 'High resolution (8K)',
    bytes: 29_671_000,
    day:      asset('assets/earth/terra-bluemarble-8192.webp'),
    night:    asset('assets/earth/terra-blackmarble-8192.webp'),
    clouds:   asset('assets/earth/8k_earth_clouds.jpg'),
    normal:   asset('assets/earth/8k_earth_normal_map.png'),
    specular: asset('assets/earth/8k_earth_specular_map.png'),
    stars:    asset('assets/stars/8k_stars_milky_way.jpg')
  }
};

export const DEFAULT_QUALITY = '2k';

// Leesbare grootte, voor de waarschuwing in de interface.
/* DE DERDE TRAP IS GEEN TEXTUURSET, en dat is precies het punt. Standard en High
   resolution downloaden één wereldkaart en zijn daarna klaar; Satellite haalt bij
   terwijl je kijkt. Die twee zijn niet in hetzelfde getal uit te drukken, dus
   staat er `once` bij de eerste twee en `per visit` bij de derde.

   WAT SATELLITE EENMALIG KOST zijn de 2K-hulpkaarten (nacht, wolken, specular,
   reliëf — 1,76 MB) plus de acht worteltegels. GEMETEN op 2026-08-30: die acht
   wegen samen 63 kB, tegen 540 kB voor de 2K-dagkaart die ze vervangen. De start
   is daarmee LICHTER dan Standard.

   WAT HIJ PER BEZOEK KOST is gemeten in Terra zelf: één keer diep inzoomen op één
   plek gaf 215 tegels en 1,9 MB. Bovenin komt uit de POC-berekening voor
   intensief rondvliegen. Een tweede bezoek aan dezelfde plek kostte 20 kB — de
   schijfcache doet daar het werk. */
export const IMAGERY_TILES = {
  label: 'Satellite',
  detail: '10 m',
  bytesOnce: 1_826_000,
  perVisitLowBytes: 2_000_000,
  perVisitHighBytes: 18_000_000
};

function mbTekst(b) {
  return b >= 1_000_000 ? Math.round(b / 100_000) / 10 + ' MB' : Math.round(b / 1000) + ' KB';
}

export function textureSetSize(quality) {
  if (quality === 'tiles') return mbTekst(IMAGERY_TILES.bytesOnce);
  const b = (TEXTURE_SETS[quality] || TEXTURE_SETS[DEFAULT_QUALITY]).bytes;
  return mbTekst(b);
}

/* De regel onder de knop. Voor de eerste twee is dat "2K · 2 MB once", voor de
   derde "10 m · 2-18 MB/visit" — het onderscheid dat de hele keuze draagt. */
export function imageryMeta(trap) {
  if (trap === 'tiles') {
    const laag = Math.round(IMAGERY_TILES.perVisitLowBytes / 1_000_000);
    const hoog = Math.round(IMAGERY_TILES.perVisitHighBytes / 1_000_000);
    return IMAGERY_TILES.detail + ' \u00b7 ' + laag + '\u2013' + hoog + ' MB/visit';
  }
  const mb = textureSetSize(trap).replace(/([\d.]+) MB/, (_, n) => Math.round(Number(n)) + ' MB');
  return trap.toUpperCase() + ' \u00b7 ' + mb + ' once';
}

export function assetsFor(quality) {
  return TEXTURE_SETS[quality] || TEXTURE_SETS[DEFAULT_QUALITY];
}

// volgorde waarin de modus-knop doorloopt + labels/iconen
// realistisch (geshaderde aarde) ⇄ deskundig (schematische vector-kaart)
// MODE_CYCLE is op 2026-07-31 vervallen: de weergave-wissel is een segmented toggle
// geworden waarin je direct kiest, dus er wordt niet meer doorheen gecycled.
// Let op het verschil tussen het LABEL en de SLEUTEL. De sleutel is `expert` en die
// zit door de hele codebase (bestandsnamen, klassen, PARAMS, data-attributen); die
// blijft. Het label is wat de bezoeker leest, en dat is sinds 2026-07-31 "Schematic".
//
// Waarom niet meer "Expert": die naam beschreef de gebruiker in plaats van de
// weergave, en suggereerde dat je iets moest weten voordat je erop mocht klikken.
// Onze eigen code noemde deze modus altijd al een "schematische vector-kaart", dus
// het label liep achter op de beschrijving. Realistisch tegenover schematisch is
// bovendien een gevestigd paar, en het past bij het rastericoon ▦.
export const MODE_LABELS = { realistic: 'Realistic', expert: 'Schematic' };
export const MODE_ICONS  = { realistic: '◐', expert: '▦' };
