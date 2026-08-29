/* ============================================================
   TERRA — EQ-indicator v2 · de shaders
   ------------------------------------------------------------
   Overgezet uit logs/indicator-workbench.html (sessie 38), waar
   deze vorm in zeven ronden is afgesteld. Pure shader-strings,
   geen THREE- of DOM-afhankelijkheid — hetzelfde contract als
   js/shaders.js.

   WAAROM EEN EIGEN BESTAND EN NIET js/shaders.js. Daar staan al
   een SHOCK_VERT en een SHOCK_FRAG: die van de v1-indicator. Twee
   paar shaders met dezelfde naam in één module is precies de
   tweede waarheid die dit project overal dichtzet. De prefix
   QUAKE_ maakt bovendien zichtbaar bij welke laag ze horen.

   DRIE DINGEN ZIJN ANDERS DAN IN DE WORKBENCH:

   1  De workbench sluit af met projectionMatrix * viewMatrix en
      leest cameraPosition in wereldruimte. Dat klopt daar omdat
      de mesh los in de scene hangt en zijn modelMatrix dus de
      eenheidsmatrix is. In Terra hangt de laag onder globe.gl's
      boom — zie js/core/globe-root.js: die boom heeft meerdere
      tussenlagen. Hier gaat het daarom door modelViewMatrix, en
      vWorld door modelMatrix. Dan klopt het ONGEACHT waar de
      groep hangt, in plaats van omdat we hebben gekeken.

   2  De identifiers zijn Engels. Het commentaar blijft Nederlands.

   3  De aNormal komt van world.getCoords() en niet van de
      workbench-latLonToVec3. Voor de shader verandert dat niets —
      het is een eenheidsvector — maar het is wél de reden dat de
      lat/lon-conventie hier geen rol speelt.

   LET OP BIJ HET BEWERKEN: geen backticks in het GLSL-commentaar.
   De shaders staan in template literals, dus één backtick
   hierbinnen sluit de literal af en dan laadt de hele module niet
   meer — geen scene, geen foutmelding die naar die regel wijst.
   De vangrail in de scratchpad vangt dit in een seconde.
   ============================================================ */

/* ---- Stapelen -------------------------------------------------------------
   Gedeeld door de ring en de shockwave, zodat de twee lagen per constructie
   dezelfde plek uitrekenen. De JS-spiegel hiervan staat in
   quake-indicator.js (stackedNormalJS); die twee horen bij elkaar veranderd
   te worden.

   In deze eerste ronde start uStackOn op 0 — de code verhuist mee, het
   gedrag nog niet. */
export const QUAKE_STACK_GLSL = /* glsl */`
attribute vec3  aRoot;
attribute float aLayer;

uniform float uStackOn;
uniform float uStackNear;
uniform float uStackFar;
uniform float uStackLift;
uniform float uStackSpread;
uniform float uRadius;

// Hoeveel er op dit moment gestapeld staat: 0 = ieder op zijn eigen plek.
float stackAmount(float camDist) {
  return uStackOn * smoothstep(uStackNear, uStackFar, camDist);
}

/* De verschoven richting van dit event. De BASIS van een stapel (laag 0)
   beweegt nooit — die staat waar de zwaarste beving werkelijk plaatsvond. */
vec3 stackedNormal(vec3 n, float amt) {
  if (amt < 0.001 || aLayer < 0.5) return n;

  /* DE RICHTING BLIJFT, ALLEEN DE AFSTAND GROEIT.

     Dit was eerst anders en dat was fout. De eerste opzet trok elk event naar
     zijn basis toe en zette het daarna op de gulden hoek weer neer — een
     zonnebloempatroon dat er van bovenaf keurig uitziet maar dat de
     WERKELIJKE ligging weggooit. Een beving ten noorden van zijn buurman kon
     zo ten zuiden van hem belanden, en zodra je inzoomde sprong hij terug
     naar zijn echte plek: twee bevingen wisselden dan zichtbaar van plaats.

     Wat een indicator moet doen is zeggen WAAR iets gebeurde. Verschuiven mag
     — anders is een kluwen niet te ontwarren — maar herschikken niet. Dus:
     de tangentiele richting van dit event ten opzichte van zijn basis blijft
     precies wat hij is, en alleen de AFSTAND wordt opgerekt tot er ruimte is.
     Bij inzoomen krimpt die oprekking naar nul en staat alles weer exact op
     zijn eigen plek, zonder ooit van kant te zijn gewisseld.

     sqrt(aLayer) zet verdiepingen die toevallig dezelfde kant op wijzen op
     verschillende afstanden, zodat ze elkaar ook dan niet bedekken. */
  vec3 tang = n - aRoot * dot(n, aRoot);      // wat er van n opzij staat
  float d = length(tang);

  if (d < 1e-6) {
    /* Exact op de basis — dat kan alleen bij twee events op dezelfde
       coordinaat. Dan is er geen eigen richting om te bewaren en valt er
       niets te doen dan er een te kiezen. */
    vec3 up = abs(aRoot.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    tang = normalize(cross(up, aRoot));
    d = 0.0;
  } else {
    tang /= d;
  }

  float want = uStackSpread * sqrt(aLayer) / uRadius;   // gewenste hoekafstand
  float grown = mix(d, max(d, want), amt);
  return normalize(aRoot + tang * grown);
}

/* Hoe ver deze verdieping boven het oppervlak uitkomt — MAAL DE ICOONSCHAAL.

   Zonder die factor is de stapel er wel maar zie je hem niet: met een lift
   van 1,1 eenheid en de camera op 300 scheelt een verdieping 5 pixels, en dan
   liggen de ringen nog altijd op elkaar. Gemeten toen dat zo stond: met
   stapelen aan waren er MEER verzadigde pixels dan zonder, want de ringen
   kropen wel naar elkaar toe maar niet van elkaar weg.

   De schaal wordt meegegeven en niet hier berekend: iconScale() staat in elke
   shader apart en wordt pas na dit blok gedefinieerd. */
float stackLift(float amt, float sc) {
  return aLayer * uStackLift * amt * sc;
}
`;

/* ---- Hover ---------------------------------------------------------------
   Which instance sits under the mouse. The picking itself happens in JS
   (quake-labels.js: pickAt) because the shader moves the vertices and a raycast
   would systematically miss; all that happens here is the HIGHLIGHT.

   AN INDEX ATTRIBUTE OF OUR OWN, NOT gl_InstanceID. That only exists in GLSL ES
   3.00, and the rest of this file is deliberately 1.00-safe: a shader that
   fails to compile makes the whole layer silently invisible.

   uHoverIdx at -1 means nothing is hovered. The comparison has a half-unit
   margin, because a float does not come back exactly from an attribute. */
const PICK_GLSL = /* glsl */`
attribute float aIndex;
uniform float uHoverIdx;
uniform float uHoverBoost;
uniform float uDimOthers;

float aangewezen() {
  return abs(aIndex - uHoverIdx) < 0.5 ? 1.0 : 0.0;
}

/* ONE RULE: everything except the hovered one dims. Session 41 also had a
   stack-only mode (dim just the neighbours in the same label block); session 42
   dropped it — hovering a label now does exactly what hovering an indicator
   does. */
float dempFactor() {
  float actief = step(-0.5, uHoverIdx);
  return mix(1.0, mix(1.0, 1.0 - uDimOthers, 1.0 - aangewezen()), actief);
}
`;

/* ---- De schermvaste icoonschaal -------------------------------------------
   Dezelfde vorm als Terra's gedeelde schaal in animateShader(), maar op EIGEN
   parameters (quakeIconScale*). Terra's iconScale* stuurt elke glyph in de
   app — vulkanen, bliksem, bosbranden — en die mogen door deze laag niet van
   maat veranderen.

   Beide pow-basissen zijn geklemd. uCamDist en uScaleRef zijn positief, maar
   de max() staat er zodat er geen enkele pow in dit bestand op goed
   vertrouwen draait: pow() met een negatieve basis is in GLSL ongedefinieerd
   en het antwoord is NaN. Dat patroon heeft dit project drie keer een zwart
   scherm gekost. */
const ICON_SCALE_GLSL = /* glsl */`
uniform float uScaleRef;
uniform float uScalePow;
uniform float uScaleMin;
uniform float uScaleMax;
uniform float uNearPerUnit;
uniform float uNearFloor;
uniform float uSizeBoost;

float iconScale(float camDist) {
  float base = max(camDist, 1.0) / max(uScaleRef, 1.0);
  float s = clamp(pow(max(base, 1e-6), uScalePow), uScaleMin, uScaleMax);
  // De klem meet de hoogte BOVEN de glyphschil, niet tot het middelpunt —
  // dat is wat de hoekgrootte werkelijk bepaalt.
  float h = max(0.001, camDist - uNearFloor);
  return min(s, uNearPerUnit * h);
}
`;

/* ===========================================================================
   DE RING

   De hele indicator wordt hier gemaakt, ook zijn POSITIE en zijn SCHAAL. Dat
   is de kern van de P1 uit sessie 37: zolang de maat in JavaScript wordt
   gezet, moet er per frame een lus over alle events lopen om hem bij te
   werken. Hier krijgt de shader de camera-afstand als een uniform en rekent
   elk hoekpunt zijn eigen plaats uit. De JS per frame is daarmee een regel.

   Wat er per instance in gaat: de eenheidsnormaal van het event, de magnitude
   als fractie, de diepte-KLEUR (niet de diepte zelf — depthRGB draait in JS
   zodat er een bron van waarheid is), de leeftijd en een zaad voor de fase.
   =========================================================================== */

export const QUAKE_RING_VERT = /* glsl */`
precision highp float;
${QUAKE_STACK_GLSL}
${ICON_SCALE_GLSL}
${PICK_GLSL}
attribute vec3  aNormal;   // eenheidsvector naar het event
attribute vec3  aColor;    // diepte-kleur, al door depthRGB gehaald
attribute float aMagFrac;  // 0 bij magMin, 1 bij magMax
attribute float aAge;      // 0 = zojuist, 1 = aan het eind van het venster
attribute float aSeed;

uniform float uCamDist;
uniform float uLift;              // uRadius komt uit het stapelblok
uniform float uRingLo;
uniform float uRingHi;
uniform float uRingPow;

varying vec2  vUv;
varying vec3  vColor;
varying float vMagFrac;
varying float vAge;
varying float vSeed;
varying vec3  vWorld;
varying vec3  vN;
varying float vHover;
varying float vDemp;

void main() {
  vUv      = uv;
  vHover   = aangewezen();
  vDemp    = dempFactor();
  vColor   = aColor;
  vMagFrac = aMagFrac;
  vAge     = aAge;
  vSeed    = aSeed;

  float amt = stackAmount(uCamDist);
  float stackSc = iconScale(uCamDist) * uSizeBoost;
  vec3 n = stackedNormal(normalize(aNormal), amt);
  float lift = uLift + stackLift(amt, stackSc);

  // Tangentiele basis. De keuze van de hulpvector voorkomt een ontaarde
  // cross bij de polen.
  vec3 up = abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 tx = normalize(cross(up, n));
  vec3 ty = normalize(cross(n, tx));

  // Magnitude naar wereldstraal, en dan de schermvaste schaal eroverheen.
  float mf = clamp(aMagFrac, 0.0, 1.0);
  float worldR = mix(uRingLo, uRingHi, pow(max(mf, 0.0), max(uRingPow, 0.01)));
  float s = worldR * iconScale(uCamDist) * uSizeBoost;

  // Op de bol PROJECTEREN in plaats van als plat vlak neerleggen: zo volgt de
  // schijf de kromming en steekt hij ook bij de grote magnitudes nergens door
  // het oppervlak.
  vec3 planar = n * uRadius + tx * position.x * s + ty * position.y * s;
  vec3 local = normalize(planar) * (uRadius + lift);

  /* DE KIJKHOEK WORDT IN DE FRAGMENT-SHADER UITGEREKEND, niet hier. Twee
     redenen. De goede: een grote schijf bij de limb heeft over zijn oppervlak
     merkbaar verschillende kijkhoeken, en vier hoekpunten vangen dat niet. De
     andere: hier stond de NaN-tegenmeting, en die ging nooit af — met maar
     vier hoekpunten is er geen enkele waar dot() precies 1 wordt. Een
     tegenmeting die niet kan falen, toetst niets.

     vWorld gaat door modelMatrix omdat cameraPosition in de fragment-shader
     WERELDruimte is. Zie de kop van dit bestand. */
  vWorld = (modelMatrix * vec4(local, 1.0)).xyz;
  vN = normalize(mat3(modelMatrix) * n);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
}
`;

export const QUAKE_RING_FRAG = /* glsl */`
precision highp float;

uniform float uCountLo;
uniform float uCountHi;
uniform float uLineLo;
uniform float uLineHi;
uniform float uFill;
uniform float uCore;
uniform float uFalloff;
uniform float uOpacity;
uniform float uLineMinPx;
uniform float uRingGapPx;
uniform float uFitRings;
uniform float uRingEdge;
uniform float uRingVolume;
uniform float uRingShine;
/* DE AANWIJS-UNIFORMS MOETEN OOK HIER STAAN. PICK_GLSL wordt alleen in de
   VERTEX-shaders ingevoegd — daar hoort het attribuut thuis — maar een uniform
   is per SHADER en niet per programma. Zonder deze drie regels compileert de
   fragment-shader niet, en dan tekent de hele ringlaag niets terwijl de beam
   ernaast gewoon doorgaat. Dat leest als "de ring is even weg", niet als een
   fout: de console meldt het, het beeld niet. */
uniform float uHoverIdx;
uniform float uHoverBoost;
uniform float uDimOthers;

varying vec2  vUv;
varying vec3  vColor;
varying float vMagFrac;
varying float vAge;
varying float vSeed;
varying vec3  vWorld;
varying vec3  vN;
varying float vHover;
varying float vDemp;

/* ---- De horizon, in de fragment-shader ------------------------------------
   Deze lagen tekenen met depthTest UIT. Dat is nodig omdat ze op straal 100
   liggen — exact op het oppervlak — en daar zou de dieptebuffer ze laten
   vechten met de aardbol, de kaartlijnen en de landvlakken.

   WAAROM ZE OP HET OPPERVLAK MOETEN LIGGEN: parallax. Een indicator die boven
   de grond zweeft schuift bij een scheve blik weg van de plek die hij aanwijst,
   en dat loopt hard op bij het inzoomen. GEMETEN, verschuiving bij lift 0,8 op
   15 graden uit het beeldmidden:

       camera    450    260    200    150    120    105
       verschil  0,49   1,33   2,56   7,25   30,8   222   pixels

   Op straal 100 is dat per constructie nul.

   Maar met de dieptetoets uit verdwijnt ook wat de aardbol deed: de ACHTERKANT
   verbergen. Dat doet dit blok. Per FRAGMENT en niet per instance, want een
   grote schijf bij de limb ligt deels voor en deels achter de horizon; een
   toets per event zou hem in één keer laten verspringen. */
uniform vec2 uHorizonBand;

/* THE LIMB AS A BAND, NOT A CUT-OFF (session 42, Terry). An indicator turning
   around the globe used to vanish in a single frame; it is now full until a few
   degrees before the horizon and gone a few degrees past it.

   uHorizonBand is computed in JS once per frame: x = the cosine where the fade
   ends (gone), y = where it begins (still full). That keeps acos() out of the
   fragment shader and puts the clamp against NaN in one place instead of three. */
float limbFade(vec3 wereldPunt) {
  return smoothstep(uHorizonBand.x, uHorizonBand.y,
                    dot(normalize(wereldPunt), normalize(cameraPosition)));
}

uniform float uRingOn;

void main() {
  // De hele laag uit, zonder de mesh te hoeven weghalen. De draw call blijft dus
  // staan; dit is een schuif om te KIJKEN wat er zonder ringen overblijft, geen
  // manier om er iets mee te besparen.
  if (uRingOn < 0.5) discard;
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  // The limb, as a factor. discard only once nothing is left, so a fragment in
  // the band still draws — that is the whole point of the band.
  float limb = limbFade(vWorld);
  if (limb <= 0.0) discard;

  float mf = clamp(vMagFrac, 0.0, 1.0);

  // Zwaarder = meer ringen. Dat is Groks vondst en hij is goed: het aantal
  // ringen leest als een schaalverdeling, niet als sier. Of de LIJN daarbij
  // dunner of dikker wordt, staat los — Grok koos dunner, Terry dikker, en
  // beide kanten zijn hier in te stellen (uLineLo tegen uLineHi).

  /* DE LIJNDIKTE KRIJGT EEN ONDERGRENS IN SCHERMPIXELS, en dat is geen
     verfijning maar een reparatie. GEMETEN 2026-08-23: met de dikte als vaste
     fractie van de schijfstraal is een ringlijn over het hele gangbare
     zoombereik 0,21 tot 0,29 PIXEL dik:

         afstand      450    300    260    200    155    125
         ringstraal   27,9   28,6   28,7   30,6   37,4   38,7  px
         lijndikte    0,21   0,22   0,22   0,23   0,28   0,29  px

     Zo'n lijn bestaat niet als lijn. Hij wordt door de antialiasing tot een
     grijze veeg uitgesmeerd waarvan de helderheid afhangt van waar de
     pixelgrid toevallig valt — en dat was ook te zien: de gemeten hoekstraal
     sprong tussen 0,73 en 2,14 graden op nagenoeg dezelfde afstand.

     fwidth(r) zegt hoeveel r verandert over een pixel. De dikte mag daar niet
     onder zakken. Bij inzoomen wint de ingestelde fractie het vanzelf weer. */
  float pw = fwidth(r);
  float w  = max(mix(uLineLo, uLineHi, mf), pw * uLineMinPx);

  /* HET RINGTAL NAAR DE BESCHIKBARE SCHERMRUIMTE.

     GEMETEN 2026-08-23, met de schaal van Terra en een venster van 800 px:

         magnitude   4,5    5,5    6,5    7,4    9,0
         ringstraal  6,0   11,0   16,1   20,6   28,7  px
         ringen       4     4,8    5,6    6,3    7,5
         per ring    1,34   2,08   2,60   2,96   3,44  px
         lijn vult    97%    63%    50%    44%    38%

     Bij M4,5 vult de lijn 97 % van de ruimte tussen twee ringen. Er staat dan
     geen ringpatroon meer maar een dichtgeslibde vlek — en M4,5 is door
     Gutenberg-Richter verreweg de meest voorkomende beving, dus dat is wat je
     op de bol ziet: stippen, geen ringen.

     Een shader weet wel hoeveel pixels hij heeft. Hier past het aantal ringen
     zich aan: nooit meer ringen dan er met een leesbare tussenruimte in
     passen. Een zware beving houdt zijn volle telling, een lichte zakt naar
     twee of drie ringen en blijft daarmee leesbaar als ring. */
  float nWant = mix(uCountLo, uCountHi, mf);
  float nFit  = 0.90 / max(pw * uRingGapPx, 1e-5);
  float nRings = uFitRings > 0.5 ? min(nWant, max(1.0, nFit)) : nWant;

  /* DE RANDSCHERPTE, overgenomen van de shockwave. Daar staat de lijn als een
     SOLIDE kern met een zachte rand eromheen — smoothstep(dikte, dikte+rand)
     — en de ring had alleen een gradient van het hart naar buiten:
     smoothstep(0, dikte). Precies dat verschil is waarom de shockwave
     scherper leest dan de ringen eromheen.

     uRingEdge is de FRACTIE van de lijndikte die zacht is. Op 1,0 is het
     gedrag identiek aan wat er stond; lager maakt de kern solide en de lijn
     scherper. De ondergrens houdt smoothstep uit zijn ontaarde geval waarin
     beide randen samenvallen. */
  float soft  = clamp(uRingEdge, 0.0, 1.0);
  float inner = min(w * (1.0 - soft), w - 1e-5);

  /* VOLUME: DE LIJN ALS BUIS IN PLAATS VAN ALS STREEP.

     Terra's v1-indicatoren zijn geometrie en hebben daardoor dikte; deze
     ringen zijn een shaderlijn en oogden plat. Het verschil zit niet in de
     BREEDTE — die was al goed — maar in de dwarsdoorsnede.

     Neem u als de plek binnen de lijndikte: 0 in het hart, 1 aan de rand. Een
     halfronde doorsnede heeft daar hoogte h = sqrt(1 - u*u), en de normaal van
     dat oppervlak is (radiale richting maal u, h): opzij bij de flanken, recht
     omhoog in het hart. Belicht met een vaste richting ten opzichte van het
     SCHERM — de schijf is een billboard, dus het licht blijft staan waar het
     staat terwijl de bol draait, precies zoals bij echte geometrie.

     VORM EN LICHT ZIJN GESCHEIDEN. De teller rings houdt de dekking en blijft
     exact wat hij was; alleen ringsLit draagt het profiel naar de kleur.
     Anders zou de lijn met het volume ook dunner of doorzichtiger worden en
     klopt de ringafstand niet meer.

     Op uRingVolume = 0 is shade exact 1,0 en is ringsLit gelijk aan rings —
     dan tekent deze shader pixel voor pixel wat hij voor 8g tekende. STAAT
     IN TERRA OP 0 (Terry, sessie 39): het effect is alleen bij dikkere lijnen
     zichtbaar en viel daar verkeerd uit.

     Geen pow() met een basis die negatief kan worden: dif is geklemd op 0 en
     sqrt krijgt een max() eronder. */
  vec2 rad = p / max(r, 1e-5);
  vec3 L = normalize(vec3(-0.42, 0.55, 0.72));   // vast t.o.v. het scherm

  float rings = 0.0;      // de VORM, en dus de dekking
  float ringsLit = 0.0;   // dezelfde vorm, maar belicht
  for (int i = 0; i < 8; i++) {
    if (float(i) >= nRings) break;
    float ri   = (float(i) + 1.0) / nRings * 0.90;
    float d    = abs(r - ri);
    float line = 1.0 - smoothstep(inner, w, d);
    float wf   = 1.0 - ri * uFalloff;
    rings += line * wf;

    float u  = clamp(d / max(w, 1e-5), 0.0, 1.0);
    float h  = sqrt(max(0.0, 1.0 - u * u));
    vec3  nT = normalize(vec3(rad * (sign(r - ri) * u), max(h, 1e-3)));
    float dif  = max(dot(nT, L), 0.0);
    float spec = pow(dif, 26.0) * uRingShine;
    /* 0,45 als bodem: een buis mag aan zijn schaduwkant donkerder zijn maar
       niet verdwijnen — de ring moet rondom leesbaar blijven. */
    float shade = mix(1.0, 0.45 + 0.55 * dif + spec, uRingVolume);
    ringsLit += line * wf * shade;
  }

  float fill = (1.0 - smoothstep(0.0, 0.88, r)) * uFill;
  float core = exp(-r * r * 80.0) * uCore;   // exp(-q*q), geen pow
  float envelope = 1.0 - smoothstep(0.82, 1.0, r);

  /* Hoe scherend kijken we op deze schijf? Bij de limb wordt een platte schijf
     een lijn; zonder deze fade knijpt hij daar samen tot een felle streep. */
  vec3 viewDir = normalize(cameraPosition - vWorld);
  vec3 nn = normalize(vN);
#ifdef UNSAFE_POW
  /* DE TEGENMETING — en dit is letterlijk het patroon dat dit project drie
     keer een zwart scherm heeft gekost: max() zonder BOVENgrens, waarna een
     dot die door afronding op 1.0000001 uitkomt een negatieve basis onder
     pow() legt. In GLSL is dat ongedefinieerd, en het antwoord is NaN.

     Zet deze define aan en de ring hoort zwart te worden. Doet hij dat niet,
     dan meet de opstelling niet wat hij denkt te meten. */
  float ndv = max(dot(nn, viewDir), 0.0);
  float graze = pow(1.0 - ndv, 0.55);
#else
  float ndv = clamp(dot(nn, viewDir), 0.0, 1.0);
  float graze = pow(max(1.0 - ndv, 0.0), 0.55);
#endif
  // Niet helemaal naar nul: recht van boven mag de ring niet verdwijnen.
  graze = 0.35 + 0.65 * (1.0 - graze);

  float lum   = ringsLit * 1.15 + fill + core;
  float alpha = (rings + fill + core * 0.95) * envelope * uOpacity * graze;

  /* AANGEWEZEN LICHT OP, DE REST DEMPT (sessie 41). Twee kanalen, want ze doen
     iets anders: uHoverBoost tilt de aangewezen ring op, uDimOthers haalt de
     andere omlaag. Dat tweede is wat een enkele beving uit een zwerm licht —
     alleen oplichten helpt daar niet, want de buren zijn even fel.

     uDimOthers werkt ALLEEN als er iets is aangewezen. Zonder die voorwaarde
     zou de hele laag permanent gedempt staan zodra de waarde boven nul komt. */
  float opTil = 1.0 + uHoverBoost * vHover;
  gl_FragColor = vec4(vColor * lum * opTil, clamp(alpha * vDemp * opTil * limb, 0.0, 1.0));
}
`;

/* ===========================================================================
   DE SHOCKWAVE

   Een eigen laag en niet een term in de ringshader: zo is hij los te
   schakelen, heeft hij zijn eigen (veel ruimere) maat, en blijft de
   ringshader leesbaar. Dezelfde geometrie als de ring — een op de bol
   geprojecteerde schijf.

   DE LEEFTIJD KOMT VAN HET GEKOZEN MOMENT en niet van de wandklok. Dat wordt
   in quake-indicator.js afgedwongen; hier staat alleen wat de shader ermee
   doet. Zie de noot bij uploadEvents().
   =========================================================================== */

export const QUAKE_SHOCK_VERT = /* glsl */`
precision highp float;
${QUAKE_STACK_GLSL}
${ICON_SCALE_GLSL}
${PICK_GLSL}
attribute vec3  aNormal;
attribute vec3  aColor;
attribute float aMagFrac;
attribute float aAgeH;     // leeftijd in UREN
attribute float aSeed;

uniform float uCamDist;
uniform float uLift;              // uRadius komt uit het stapelblok
/* DEZELFDE DRIE ALS DE RING, en dat is een reparatie (sessie 40).

   De shockwave had zijn eigen lo/hi/pow. Klinkt goed — het contract noemt zelfs
   "zijn eigen, veel ruimere maat" — maar het betekent dat de twee uiteen kunnen
   lopen zodra er aan één van beide wordt gedraaid. En dat gebeurde: de ring ging
   naar 10..30 met pow 0,95, de shockwave bleef op 2,8..20 met pow 2. GEMETEN:

       magnitude    2,5    4,5    6,5    9,5
       ring        10,0   16,1   21,8   30,0  eenheden
       shockwave    2,8    4,2    8,4   20,0
       verhouding  0,28   0,26   0,39   0,67

   De puls viel dus bij ELKE magnitude binnen zijn eigen indicator, en met de
   ringen aan zag je hem daardoor nooit. Dat de verhouding ook nog per magnitude
   verschilt maakt het onherstelbaar met één schuif.

   Nu is er één maat: de shockwave IS de ringstraal, maal uShockScale. Een golf
   die voorbij de indicator uitdijt hoort een factor boven 1 te hebben. Wie de
   ring verandert krijgt de puls per constructie mee. */
uniform float uRadLo, uRadHi, uRadPow;
uniform float uShockScale;
uniform float uAgeLo, uAgeHi;

varying vec2  vUv;
varying vec3  vColor;
varying float vSeed;
varying float vFresh;
varying vec3  vWorld;

void main() {
  vUv = uv;
  vColor = aColor;
  vSeed = aSeed;

  /* De leeftijd-envelope. Vers pulseert vol, daarna dooft het uit; voorbij
     uAgeHi wordt er niets meer getekend. Zonder deze grens pulseert de hele
     wereld altijd en betekent een puls niets meer. */
  vFresh = 1.0 - smoothstep(uAgeLo, max(uAgeHi, uAgeLo + 0.01), aAgeH);

  float amt = stackAmount(uCamDist);
  float stackSc = iconScale(uCamDist) * uSizeBoost;
  vec3 n = stackedNormal(normalize(aNormal), amt);
  float lift = uLift + stackLift(amt, stackSc);
  vec3 up = abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 tx = normalize(cross(up, n));
  vec3 ty = normalize(cross(n, tx));

  float mf = clamp(aMagFrac, 0.0, 1.0);
  float worldR = mix(uRadLo, uRadHi, pow(max(mf, 0.0), max(uRadPow, 0.01))) * uShockScale;
  float s = worldR * iconScale(uCamDist) * uSizeBoost;

  // Op de bol projecteren, net als de ring — anders steekt de schijf bij de
  // grote magnitudes door het oppervlak. Zie de noot bij de 16x16 in
  // quake-indicator.js.
  vec3 planar = n * uRadius + tx * position.x * s + ty * position.y * s;
  vec3 local = normalize(planar) * (uRadius + lift);
  // Door modelMatrix, want de horizontoets in de fragment-shader vergelijkt met
  // cameraPosition en dat is wereldruimte. Zie de kop van dit bestand.
  vWorld = (modelMatrix * vec4(local, 1.0)).xyz;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
}
`;

export const QUAKE_SHOCK_FRAG = /* glsl */`
precision highp float;

uniform float uTime;
uniform float uWaves, uSpeed, uThickness, uEdge, uOpacity;

varying vec2  vUv;
varying vec3  vColor;
varying float vSeed;
varying float vFresh;
varying vec3  vWorld;

/* ---- De horizon, in de fragment-shader ------------------------------------
   Deze lagen tekenen met depthTest UIT. Dat is nodig omdat ze op straal 100
   liggen — exact op het oppervlak — en daar zou de dieptebuffer ze laten
   vechten met de aardbol, de kaartlijnen en de landvlakken.

   WAAROM ZE OP HET OPPERVLAK MOETEN LIGGEN: parallax. Een indicator die boven
   de grond zweeft schuift bij een scheve blik weg van de plek die hij aanwijst,
   en dat loopt hard op bij het inzoomen. GEMETEN, verschuiving bij lift 0,8 op
   15 graden uit het beeldmidden:

       camera    450    260    200    150    120    105
       verschil  0,49   1,33   2,56   7,25   30,8   222   pixels

   Op straal 100 is dat per constructie nul.

   Maar met de dieptetoets uit verdwijnt ook wat de aardbol deed: de ACHTERKANT
   verbergen. Dat doet dit blok. Per FRAGMENT en niet per instance, want een
   grote schijf bij de limb ligt deels voor en deels achter de horizon; een
   toets per event zou hem in één keer laten verspringen. */
uniform vec2 uHorizonBand;

/* THE LIMB AS A BAND, NOT A CUT-OFF (session 42, Terry). An indicator turning
   around the globe used to vanish in a single frame; it is now full until a few
   degrees before the horizon and gone a few degrees past it.

   uHorizonBand is computed in JS once per frame: x = the cosine where the fade
   ends (gone), y = where it begins (still full). That keeps acos() out of the
   fragment shader and puts the clamp against NaN in one place instead of three. */
float limbFade(vec3 wereldPunt) {
  return smoothstep(uHorizonBand.x, uHorizonBand.y,
                    dot(normalize(wereldPunt), normalize(cameraPosition)));
}

void main() {
  if (vFresh <= 0.002) discard;
  float limb = limbFade(vWorld);
  if (limb <= 0.0) discard;

  float d = length(vUv * 2.0 - 1.0);      // 0 = hart, 1 = rand
  if (d > 1.0) discard;

  /* Terra's v1-SHOCK_FRAG, met het aantal golven instelbaar in plaats van
     vast op drie. Elke golf loopt van het hart naar de rand en vervaagt
     onderweg; het faseverschil houdt ze gelijkmatig uit elkaar. */
  float a = 0.0;
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uWaves) break;
    float ph = fract(uTime * uSpeed + float(i) / max(uWaves, 1.0) + vSeed);
    float dd = abs(d - ph);
    float band = 1.0 - smoothstep(uThickness, uThickness + uEdge, dd);
    a += band * (1.0 - ph);               // vervaag terwijl hij uitdijt
  }

  // Hart en rand netjes dichthouden, exact zoals v1 het doet.
  a *= smoothstep(0.0, 0.07, d) * smoothstep(1.0, 0.6, d);
  a *= vFresh * uOpacity;
  if (a < 0.004) discard;

  gl_FragColor = vec4(vColor, clamp(a * limb, 0.0, 1.0));
}
`;

/* ===========================================================================
   DE BEAM (sessie 41, Terry)

   De staaf die v1 had en die bij de sloop meeging. Hij is terug omdat hij iets
   kan wat de ring per constructie niet kan: TWEE grootheden in twee kanalen die
   elkaar niet in de weg zitten. De ring zet magnitude in zijn straal, en straal
   concurreert met leesbaarheid — in een zwerm liggen de cirkels over elkaar
   heen. Hoogte doet dat niet: staven naast elkaar blijven los te lezen.

   HOOGTE = MAGNITUDE, KLEUR = DIEPTE. Dezelfde afspraak als v1, met dezelfde
   parameters: beamBase plus magnitude in het kwadraat maal beamMultiplier. Die
   drie stonden sinds de v1-sloop wees in js/config.js en krijgen hier hun
   betekenis terug.

   EEN QUAD EN GEEN CILINDER, en dat is het verschil tussen deze beam en die van
   v1. Daar was het een CylinderGeometry met 16 segmenten plus een tweede
   cilinder eromheen voor de gloed — per event, in JavaScript gebouwd, en dat is
   waar de 1.409 draw calls vandaan kwamen. Hier is het één instanced quad van
   twee driehoeken die zich in de vertex-shader naar de camera keert. Additief
   gemengd ziet een billboard er hetzelfde uit als een cilinder, want er is geen
   belichting die een ronding zou verraden.

   DE VOET BLIJFT OP STRAAL 100, en dat is de voorwaarde waaronder deze laag
   mocht terugkomen. Sessie 40 haalde alles naar het oppervlak omdat hoogte
   parallax kost: op afstand 105 schoof een zwevende indicator 222 px weg van de
   plek die hij aanwees. Bij een beam is dat op te lossen zonder de hoogte op te
   geven — de VOET wijst aan en blijft op het oppervlak, alleen de top steekt
   uit. Dat is precies hoe een staaf op een kaart hoort te werken, en het is de
   reden dat het label aan de voet hangt en niet aan de top.
   =========================================================================== */

export const QUAKE_BEAM_VERT = /* glsl */`
precision highp float;
${QUAKE_STACK_GLSL}
${ICON_SCALE_GLSL}
${PICK_GLSL}
attribute vec3  aNormal;
attribute vec3  aColor;
attribute float aMagFrac;
attribute float aAge;
attribute float aSeed;

uniform float uCamDist;
uniform float uLift;              // uRadius komt uit het stapelblok
uniform float uBeamSink;
uniform float uBeamBase;
uniform float uBeamPerMag;
uniform float uBeamWidth;
uniform float uMagMin;
uniform float uMagSpan;
uniform float uBeamScaleWithZoom;
/* DE CAMERA IN LOKALE RUIMTE, ALS UNIFORM. Hier stond eerst
   inverse(modelMatrix) * cameraPosition, en inverse() bestaat pas in GLSL ES
   3.00 — op een WebGL1-context compileert die shader niet en dan is de hele
   laag stil weg. De aanroeper kent group.matrixWorld en rekent dit één keer
   per frame uit, wat ook goedkoper is dan een matrix-inverse per hoekpunt. */
uniform vec3 uCamLocal;

varying vec3  vColor;
varying float vAge;
varying float vSeed;
varying float vLangs;
varying float vDwars;
varying vec3  vWorld;
varying float vHover;
varying float vDemp;

void main() {
  vColor = aColor;
  vHover = aangewezen();
  vDemp  = dempFactor();
  vAge   = aAge;
  vSeed  = aSeed;
  // de uv van de basis-quad: x dwars, y langs de staaf
  vDwars = uv.x * 2.0 - 1.0;
  vLangs = uv.y;

  float amt = stackAmount(uCamDist);
  float sc  = iconScale(uCamDist);
  vec3 n = stackedNormal(normalize(aNormal), amt);

  /* DE MAGNITUDE TERUG UIT DE FRACTIE. aMagFrac is genormaliseerd over
     [quakeMagMin, quakeMagMax] omdat de ring daar zijn straal uit haalt; de
     beam wil het rauwe getal, want de v1-formule kwadrateert het en dan is een
     fractie iets heel anders dan een magnitude. */
  float mag = uMagMin + clamp(aMagFrac, 0.0, 1.0) * uMagSpan;
  float hoogte = (uBeamBase + mag * mag * uBeamPerMag);
  // Met de zoom meeschalen is een KEUZE en staat op een uniform: een staaf die
  // schermvast is blijft leesbaar, een staaf in wereldmaat vertelt de schaal.
  hoogte *= mix(1.0, sc, clamp(uBeamScaleWithZoom, 0.0, 1.0));

  /* uLift MOET MEE, en dat is een reparatie (sessie 41). Hier stond alleen
     stackLift(), zonder uLift — en dat is de hoogte die de WEERGAVE bepaalt: in
     de schematische weergave staat de ring op 1,3 boven het oppervlak en de
     beam-voet stond dus 1,3 eenheid lager. Zichtbaar als een streep die onder
     de indicator uit stak. De ring doet uLift + stackLift; de beam hoort
     hetzelfde te doen, anders vertrekken ze niet vanaf dezelfde plek.

     uBeamSink laat de voet een klein stukje ONDER die plek beginnen, zodat er
     geen naad tussen beam en indicator valt. Hij hoort klein te blijven: wat
     hieronder uitsteekt hoort binnen de kern van de ring te vallen en dus niet
     als losse streep zichtbaar te zijn. */
  float lift = uLift + stackLift(amt, sc);
  vec3 voet = n * (uRadius + lift);

  /* NAAR DE CAMERA KEREN. De staaf staat langs n; de breedte moet loodrecht
     staan op n EN op de blikrichting, anders kijk je er op zijn smalst tegenaan
     en verdwijnt hij. cameraPosition is wereldruimte, dus de kijkrichting wordt
     hier in lokale ruimte gehaald via de inverse modelMatrix — de laag hangt
     onder de globe-wortel en die draait. */
  vec3 kijk = normalize(uCamLocal - voet);
  vec3 dwars = cross(n, kijk);
  float len = length(dwars);
  // Kijk je recht langs de staaf, dan is de cross ontaard: pak dan een
  // willekeurige loodrechte richting in plaats van een NaN.
  if (len < 1e-4) {
    vec3 up = abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    dwars = normalize(cross(n, up));
  } else {
    dwars /= len;
  }

  float halveBreedte = uBeamWidth * sc * (0.35 + 0.65 * clamp(aMagFrac, 0.0, 1.0));
  vec3 lokaal = voet + n * (hoogte * vLangs - uBeamSink) + dwars * (halveBreedte * vDwars);

  vWorld = (modelMatrix * vec4(lokaal, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(lokaal, 1.0);
}
`;

export const QUAKE_BEAM_FRAG = /* glsl */`
precision highp float;

uniform float uOpacity;
uniform float uBeamCore;
uniform float uBeamFalloff;
uniform vec2 uHorizonBand;
uniform float uBeamOn;
uniform float uHoverIdx;
uniform float uHoverBoost;
uniform float uDimOthers;

varying vec3  vColor;
varying float vAge;
varying float vSeed;
varying float vLangs;
varying float vDwars;
varying vec3  vWorld;
varying float vHover;
varying float vDemp;

/* The same limb band as the ring and the shockwave. Repeated here and not
   shared, because every shader is its own program; the shape has to stay equal
   to the one in QUAKE_RING_FRAG. */
float limbFade(vec3 wereldPunt) {
  return smoothstep(uHorizonBand.x, uHorizonBand.y,
                    dot(normalize(wereldPunt), normalize(cameraPosition)));
}

void main() {
  if (uBeamOn < 0.5) discard;
  /* THE FOOT IS NOT CLIPPED BY THE HORIZON, the rest is. A shaft at the edge of
     the globe sticks outwards and should stay visible there — that is exactly
     where it reads best. Only what stands BEHIND the globe disappears, and we
     test that on the point itself. */
  float limb = limbFade(vWorld);
  if (limb <= 0.0) discard;

  // dwarsprofiel: helder hart, zachte flanken
  float d = abs(vDwars);
  float kern = pow(max(1.0 - d, 0.0), max(uBeamCore, 0.01));
  // langsprofiel: vol aan de voet, uitdovend naar de top
  float langs = pow(max(1.0 - vLangs, 0.0), max(uBeamFalloff, 0.01));
  float a = kern * langs * uOpacity * (1.0 - 0.55 * clamp(vAge, 0.0, 1.0));
  // Dezelfde twee kanalen als de ring; zie de noot daar.
  float opTil = 1.0 + uHoverBoost * vHover;
  a *= vDemp * opTil;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * (0.75 + 0.85 * kern) * opTil, clamp(a * limb, 0.0, 1.0));
}
`;
