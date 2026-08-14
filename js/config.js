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

// Is de knop "Enter magneto view" te zien? Staat sinds 2026-08-09 UIT, en net als
// LOCK_DETAILS hierboven is dat een tijdelijke stand met dezelfde redenering: niets
// tonen wat de app nog niet kan waarmaken. De state werkt technisch — de aarde staat
// er op zijn ware 23,44°, de standen zijn vastgezet aan het aarde-zonvlak — maar hij
// is nog niet af genoeg om iemand in te sturen: geen pannen in de vastgezette standen,
// geen tijdlijn over jaren, en de afstanden staan niet op ware schaal.
//
// WAT HIJ NIET UITZET: de drie as-lagen in `Axes & poles`. Die tekenen gewoon op de
// bol en staan los van deze state — de rotatie-as, de dipoolas en de pooldrift blijven
// dus volledig bruikbaar. Alleen de aparte camerastand verdwijnt.
//
// Zet dit op true zodra de state af is. De knop is de ENIGE ingang (geen sneltoets,
// geen url-parameter), dus deze ene vlag volstaat.
export const MAGNETO_VIEW = false;

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
  // bloom (post-processing)
  bloomStrength: 0.1, bloomRadius: 0.3, bloomThreshold: 0.75,
  // kleurgrading + chromatische aberratie
  gradeContrast: 1.06, gradeSaturation: 1.12, gradeAberration: 0.005, gradeTemp: 0.5,
  // mist — fresnel-waas die naar de randen toe het kaartje vertroebelt
  fogStrength: 1.0, fogPower: 3.0, fogColor: '#b6c4d6',
  // staven — simpele cilinder die vanaf het oppervlak de ruimte in rijst (hoogte ∝ magnitude²)
  beamBase: 4.0,        // basislengte: ook lichte bevingen krijgen een zichtbare staaf
  beamMultiplier: 1.0,  // hoogte-toeslag = magnitude² · deze factor
  beamRadius: 0.1,      // kern-straal = magnitude · deze factor
  coreOpacity: 1.0, glowOpacity: 0.02,
  // shockwave — magnitude → straal binnen min/max; rand-scherpte + rand-dikte
  shockMinR: 1, shockMaxR: 20, shockMagLo: 1, shockMagHi: 10,
  shockLift: 0,         // hoogte boven het oppervlak (units)
  shockEdge: 0.02,      // randscherpte (lager = hardere overgang)
  shockThickness: 0.04, // randdikte (breedte van de ringband)
  shockOpacity: 1.0, shockSpeed: 0.1,
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
  cloudAltitude: 0.02,  // hoogte van de wolkenschil (fractie van de straal)
  cloudOpacity: 1.0, cloudShadow: 1.0, cloudSpeed: 0.001,
  /* aurora — de OVATION-ovaal als schil boven de wolken.

     KLEUR VOLGT DE RAUWE KANS, HELDERHEID DE GAMMA DAARVAN. Die twee gescheiden
     houden: `auroraGamma` bijstellen mag nooit betekenen dat groen ineens ergens
     anders begint. Groen is 557 nm zuurstof, rood 630 nm — dat is fysica.

     GEKALIBREERD OP EEN RUSTIGE DAG (2026-08-14): piek 37 %, gemiddelde 2,3, en
     29 % van de cellen niet nul. Een ramp die pas boven 80 % rood wordt zou dus
     vrijwel nooit rood tonen; vandaar dat `auroraRedFrom` op 0,55 staat en niet
     hoger. Let bij het opdraaien op de bloomdrempel (`bloomThreshold`, 0,75):
     kleur x helderheid daarboven wordt een gloeiende vlek in plaats van een boog. */
  auroraAltitude: 0.027,   // straal 102,7 — boven de wolken (102), fysiek ~170 km
  auroraGain: 1.0,         // DE knop voor felheid: alpha wordt op 1 geklemd, de kleur niet
  auroraOpacity: 0.85,
  auroraGamma: 2.4,        // helderheid = kans^(1/gamma); hoger = zwak licht eerder zichtbaar
  auroraFloor: 0.02,       // onder 2 % kans niets tekenen
  auroraDayFloor: 0.25,    // wat er aan de DAGzijde overblijft (0 = hard afkappen)
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
  // Zonneglinster op het water. De tweede waarde geldt zodra de oceaanbodem aan
  // staat, en dat is geen smaakkwestie maar een meting: bij 0,7 legt de brede
  // `sheen` (macht 14) een lichtwaas over de halve dagzijde, en daar verdwijnt het
  // hele bodemreliëf onder. Bij 0,7 was er van de Mid-Atlantische Rug niets te
  // zien; bij 0,3 tekent hij zich af terwijl de fonkeling blijft. Op de vlakke
  // oceaan van de gewone dagtextuur valt er niets te verbergen — daar mag hij vol.
  glintStrength: 0.7,
  glintStrengthOcean: 0.3,
  // schermvaste icoongrootte (app-breed, beide modi): iconen schalen mee met de
  // camera-afstand. Power-curve (pow>1) = agressievere zoom-respons, vooral diep
  // ingezoomd kleiner. camDist-bereik in de praktijk ≈ 169 (diep in) → 438 (uit).
  // schaal = clamp( (camDist / ref)^pow, min, max ).
  iconScaleRef: 280,   // camera-afstand waarbij schaal = 1 (lager = grotere iconen)
  iconScalePow: 1.55,  // steilheid (>1 = agressiever; diep inzoomen krimpt sneller)
  iconScaleMin: 0.4,   // ondergrens (sterk ingezoomd)
  iconScaleMax: 1.9,   // bovengrens (ver uitgezoomd)
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
  labelCountMax: 12,   // aantal beving-labels diep ingezoomd (meer detail)
  labelCountCeiling: 40, // bovengrens van de slider — zie de meting hieronder
  // De pool die rebuildLabels() opbouwt, als veelvoud van het plafond. Groter dan het
  // plafond omdat de selectie pas per frame gebeurt: welke bevingen naar ons toe
  // gekeerd zijn hangt van de camera af, dus er moeten genoeg kandidaten klaarstaan
  // om er ook na het draaien nog `K` over te houden.
  //
  // Waarom de factor zo hoog is — gemeten met 339 EMSC-events.
  // Aantal near-side labels per poolgrootte, per camerastand:
  //                    pool 54   pool 108   pool 216
  //   Afrika               6        12         23
  //   Egeische Zee         7        14         23
  //   Japan               25        49         90
  //   Chili               25        50         90
  // De reden voor het verschil: EMSC is Euro-Med-gericht, dus zodra je van Europa
  // wegdraait ligt het gros van de sterkste events achter de bol. Bij het plafond van
  // 12 komt de pool op 144 en haalt elke stand het ruim; de tabel staat erbij omdat
  // een hoger plafond de pool meeschaalt en de krapste stand (Afrika, Egeische Zee)
  // dan de maat is. Met USGS erbij is de spreiding gelijkmatiger en is dit ruimer dan
  // nodig — wat niets kost, want een verborgen label is één dot-product per frame.
  labelPoolFactor: 12,
  labelPoolMax: 220,   // dak op de pool — elk element is een div plus twee SVG-nodes
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

  // Op de dagzijde verdwijnt een dunne gekleurde lijn in de felle textuur. Daarom
  // krijgt elke lijn in de realistische modus een donkere "casing" eronder: dezelfde
  // cartografische truc die de deskundig-symbolen al gebruiken. In de deskundig-modus
  // is de achtergrond egaal donker en is dat niet nodig.
  overlayCasingColor:   'rgba(3,6,12,0.8)',
  overlayCasingExtra:   0.55,       // hoeveel breder de casing is dan de lijn
  overlayCasingDrop:    0.0008,     // hoeveel lager de casing ligt

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
  // NIET ZOMAAR VERRUIMEN. Behalve bruikbaarheid dekt `zoomMinDistance` ook een
  // renderfout af: diep ingezoomd en dan pannen over het oppervlak geeft zwarte
  // clipping. Zolang die niet apart is opgelost (vermoedelijk de near-plane van de
  // camera in verhouding tot de bolstraal), is deze ondergrens de werkende omweg.
  // Wie hem verlaagt, krijgt die zwarte vlakken terug.
  zoomMinDistance: 155,
  zoomMaxDistance: 450,
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
  // deskundig (schematische) modus — vlakke kaart-kleuren
  expertOcean: '#0e1b2a',   // effen oceaan-bol
  expertLand:  '#26323d',   // vlak land-vlak
  expertCoast: '#5e7488',   // harde kustlijn-stroke
  expertBg:    '#080b11',   // platte achtergrond (i.p.v. sterren)
  expertEdge:  '#dfe8f2',   // lichte contrast-rand ("casing") rond elk symbool
  expertEdgeWidth: 0.22,    // absolute randbreedte (units) — dun/subtiel, high-end
  // basis-hoogte voor ÁLLE indicatoren in deskundig modus: net boven de land-
  // polygons (0.01) zodat symbolen nooit door de kaart worden afgedekt. De
  // aardbeving-staaf rijst vanaf deze hoogte verder de atmosfeer in.
  expertIndicatorAlt: 0.013,
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
  '2k': {
    label: 'Standard (2K)',
    // Nagemeten op 2026-08-05: som van de zes bestanden die een wissel ophaalt
    // (day, night, clouds, normal, specular, sterrenhemel). Stond op 2.476.000 en
    // 29.675.000, allebei te laag — de 8K-set is sindsdien 31,2 MB.
    bytes: 2_536_000,
    day:      asset('assets/earth/2k_earth_daymap.jpg'),
    bathyDay: asset('assets/earth/2k_earth_daymap_bathy.jpg'),
    night:    asset('assets/earth/2k_earth_nightmap.jpg'),
    clouds:   asset('assets/earth/2k_earth_clouds.jpg'),
    normal:   asset('assets/earth/2k_earth_normal_map.png'),
    specular: asset('assets/earth/2k_earth_specular_map.png'),
    stars:    asset('assets/stars/2k_stars_milky_way.jpg')
  },
  '8k': {
    label: 'High resolution (8K)',
    bytes: 31_151_000,
    day:      asset('assets/earth/8k_earth_daymap.jpg'),
    bathyDay: asset('assets/earth/8k_earth_daymap_bathy.jpg'),
    night:    asset('assets/earth/8k_earth_nightmap.jpg'),
    clouds:   asset('assets/earth/8k_earth_clouds.jpg'),
    normal:   asset('assets/earth/8k_earth_normal_map.png'),
    specular: asset('assets/earth/8k_earth_specular_map.png'),
    stars:    asset('assets/stars/8k_stars_milky_way.jpg')
  }
};

export const DEFAULT_QUALITY = '2k';

// Leesbare grootte, voor de waarschuwing in de interface.
export function textureSetSize(quality) {
  const b = (TEXTURE_SETS[quality] || TEXTURE_SETS[DEFAULT_QUALITY]).bytes;
  return b >= 1_000_000 ? Math.round(b / 100_000) / 10 + ' MB' : Math.round(b / 1000) + ' KB';
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
