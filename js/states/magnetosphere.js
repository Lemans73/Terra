/* ============================================================
   TERRA — Magnetosphere · de holte die de aarde in de zonnewind maakt
   ------------------------------------------------------------
   Een state, geen laag. Hij ORKESTREERT: hij zet de gebeurtenislagen
   uit, oriënteert het GSM-frame, laat de lagen bouwen en biedt drie
   camerastanden. Wat hij zelf tekent is niets — hetzelfde onderscheid
   als in js/states/space.js, en om dezelfde reden: de volgende bewoner
   (de veldlijnen, de instroom, de tijdlijn) meldt zich aan via `layers`
   en wordt hier niet ingebouwd.

   DE AARDE BLIJFT STAAN, en dat is het verschil met Space. Daar is de
   bol weg omdat een heliocentrisch beeld hem niet nodig heeft; hier is
   hij juist de maat. De magnetopauze staat op ongeveer tien aardstralen,
   dus de aarde is een tiende van de neusafstand — precies groot genoeg
   om te zien waar de holte omheen ligt.

   HET FRAME WORDT BIJ BINNENKOMST GEZET EN DAARNA PER TIK BIJGEWERKT.
   Anders dan Space, waar de oriëntatie bevroren wordt: daar zou de
   sterrentijd het beeld 366 keer sneller laten draaien dan het
   onderwerp. Hier IS de zonrichting het onderwerp — de hele vorm hangt
   eraan — dus die moet meelopen met de tijdkiezer.

   DE KLOK VAN DEZE STATE IS DE GEMETEN REEKS (sessie 30, blok B3).
   Buiten deze state kiest de bezoeker een moment en volgt de hele
   scene dat. Hier kan dat niet: de magnetosfeer van vorige maand is
   niet gemeten, en die van morgen ook niet. De reeks loopt zeven dagen
   terug en tot zo'n uur vooruit — dat laatste omdat de zonnewind
   GEPROPAGEERD is: de nieuwste monsters zijn wél gemeten, ze zijn
   alleen nog onderweg.

   Daarom NEEMT deze state de klok over in plaats van hem te negeren.
   Bij binnenkomst zet hij het moment op het laatste AANGEKOMEN monster
   en onthoudt hij waar de bezoeker stond; bij vertrek geeft hij dat
   terug. Zo staan de schemerlijn, de zonrichting en de holte op
   hetzelfde moment — één klok, alleen begrensd tot waar er gemeten is.
   Het tijd-eiland gaat daarom uit (css/app.css, naast body.sun-view).

   EN GEEN METING IS GEEN OPPERVLAK. `Series.derive` weigert een r0 waar
   de dichtheid ontbreekt, en deze state tekent dan niets. Een
   gemodelleerde vorm die zich voordoet als een meting is erger dan geen
   vorm — dat gold voor de nominale wind die hier tot sessie 30 stond,
   en het geldt net zo goed voor een gat in de feed.
   ============================================================ */

import { MSPHERE_RE, MSPHERE_DRAW_MAX, pocNaarTerra }
  from '../layers/magnetosphere/boundary-layer.js';

/* De diepteplak van de orthografische projectie, in Terra-eenheden. Ruim om de
   getekende staart (60 Re = 6000) heen, en dat mag: orthografische diepte is
   lineair. */
const MSPHERE_ORTHO_DIEPTE = 200000;

export function createMagnetosphereState(THREE, deps) {
  const { world, boundary, grid, scale, fieldlines, layers, Core, feed, clock } = deps;

  const origin = new THREE.Vector3(0, 0, 0);
  const _sun = new THREE.Vector3();
  const _dip = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _y = new THREE.Vector3();
  const _z = new THREE.Vector3();

  const moment = () => (deps.moment ? deps.moment() : new Date());

  /* Hoe ver de camera moet staan om iets van maat S in beeld te krijgen.
     Dezelfde formule als space.js (sessie 14): op een telefoon in portret
     vraagt hetzelfde beeld ruim twee keer de afstand van een breed scherm,
     dus dit is geen constante. */
  function fitDistance(S) {
    const cam = world.camera();
    const halfV = (cam.fov / 2) * Math.PI / 180;
    /* EEN CANVAS VAN NUL HOOG GEEFT aspect = 0/0 = NaN, EN DAN IS DE CAMERA WEG.

       Niet theoretisch: gemeten in sessie 30. In een verborgen browserpaneel
       klapt het canvas in tot clientWidth/Height 0, globe.gl zet dan
       `camera.aspect = 0/0`, en deze formule geeft NaN. Die NaN gaat via
       `targetFrom` rechtstreeks naar `camera.position` — en een positie van NaN
       herstelt zich nergens meer, want elke volgende berekening gaat er weer
       vanuit. Het beeld blijft zwart tot een herlaadbeurt.

       Terugvallen op 1 geeft een iets te ruime kadrering in plaats van geen
       kadrering. DEZELFDE FORMULE STAAT IN js/states/space.js en heeft daar
       hetzelfde gat; dat is niet meegenomen omdat die state deze sessie niet
       aangeraakt is. */
    const aspect = Number.isFinite(cam.aspect) && cam.aspect > 0 ? cam.aspect : 1;
    const halfH = Math.atan(aspect * Math.tan(halfV));
    return S / Math.sin(Math.min(halfV, halfH));
  }

  /* HOE VER, EN WAAROM DIT GEMETEN IS.

     De eerste versie kadreerde op 20 Re, "genoeg om de holte te zien en de
     bol te herkennen". Op het scherm zat je daarmee BINNEN de magnetosfeer:
     het net vulde het beeld en van de vorm — neus, flank, staart — was niets
     te lezen. De vorm is niet symmetrisch om de aarde: hij loopt van +10 Re
     aan de zonzijde tot -60 in de staart, dus wat je moet omvatten is de
     STAART en niet de neus.

     Vandaar de getekende lengte als maat. De 0,55 hoort bij het draaipunt in de
     holte (zie targetFrom): nu de vorm gecentreerd staat, hoeft het kader niet
     meer de lege zonzijde te compenseren die een draaipunt op de aarde opleverde.
     Stond op 0,70 toen dat nog wél zo was. */
  /* Hoe ver de camera staat. TWEE REGIMES, want de projectie verschilt.

     Perspectief (de vrije stand): de afstand BEPAALT hoe groot iets in beeld
     komt, dus die volgt uit de beeldhoek — dat is fitDistance.

     Orthografisch (de vlakke standen): de afstand bepaalt daar niets aan de
     grootte, alleen de hoogte van het beeldveld doet dat. Maar we KIEZEN de
     afstand zo dat hoogte = afstand * 0,9 blijft gelden, want dat is de
     relatie waarop de registratie van de PoC rust. Zie de noot bij
     borgProjectie. */
  /* DE VLAG IS EEN ARGUMENT MET EEN STANDAARD, en dat is sinds sessie 31 het
     verschil tussen een vraag en een opdracht. `camera()` moet kunnen uitrekenen
     waar hij heen gaat ZONDER eerst `vlakkeStand` te verzetten — dat verzetten
     was namelijk precies de helft van de overgang die op frame 0 omklapte. Wie
     geen vlag meegeeft, vraagt naar de stand die er nu getekend wordt. */
  /* DE KADERMAAT VAN DE VRIJE STAND, en 0,75 is uitgerekend en niet geprobeerd.

     Hier stond 0,55, en dat klopte zolang de camera voor 85 % lángs de zonlijn
     keek: de vorm was dan sterk verkort en paste in een kleinere bol. Sinds de
     stand naar Meridian is gedraaid (sessie 33) staat hij BREEDZIJDS, en dan telt
     zijn echte omvang.

     Vanaf het kadermidden op −25,2 Re ligt de neus 45 Re weg en het staarteinde
     35, met daar een flankstraal van ~30 — dus hypot(35, 30) = 46 Re, en 46/60 =
     0,77. Afgerond naar 0,75, want de flank aan de neuszijde is smaller.

     GEMETEN vóór de correctie, op 1300×730: de boegschok liep van x = 220 tot
     x = 1301 en raakte y = 1. Precies één pixel buiten beeld aan twee kanten —
     het soort fout dat op één schermmaat nog net niet opvalt. */
  const overviewDistance = (vlak = vlakkeStand) => (vlak
    ? orthoAfstand()
    : fitDistance(MSPHERE_DRAW_MAX * MSPHERE_RE * 0.75));

  /* De zoomgrenzen, en ook die verschillen per projectie.

     Perspectief: de afstand is letterlijk afstand, dus de ondergrens houdt je
     buiten de bol en de bovengrens voorbij de staart.

     Orthografisch: de afstand IS de zoom (hoogte = afstand * 0,9). De grenzen
     zijn daar dus beeldhoogtes: van 6 Re — dan vult de aarde een derde van het
     beeld — tot 400 Re, ruim voorbij de getekende staart. Camera-in-de-bol
     bestaat hier niet als probleem: bij een orthografische projectie zit er
     geen kegel om doorheen te vallen. */
  const bounds = (vlak = vlakkeStand) => (vlak
    ? { min: 6 * MSPHERE_RE / MSPHERE_ORTHO_K,
        max: orthoAfstand() * 4.5 }            // ruim vier keer uitzoomen vanaf het kader
    : { min: MSPHERE_RE * 1.6, max: fitDistance(90 * MSPHERE_RE) });

  /* HET DRAAIPUNT LIGT IN DE HOLTE, NIET OP DE AARDE.

     De vorm loopt van +10 Re aan de zonzijde tot -60 in de staart, dus zijn
     midden ligt niet op de aarde. Met het draaipunt op de oorsprong draai je
     om de AARDE, en dan zwiept de staart door het beeld zodra je sleept — het
     voelt alsof je in een gesloten ruimte om iets heen draait in plaats van om
     de vorm zelf.

     DIT KAN ALLEEN OMDAT HET SLOT DICHT STAAT. globe.gl zet `controls.target`
     bij elke 'change' terug op de oorsprong met `setScalar()`; `ensureTargetLock()`
     in index.html blokkeert die methode zolang deze state actief is. Zonder dat
     slot is dit gemeten en werkte het niet: target op (0,0,-2000), na één
     `ctl.update()` weer (0,0,0).

     LET OP bij uitbreiden: het slot blokkeert `set` en `setScalar`, NIET `copy`
     of een directe toekenning aan x/y/z. Wie hier een `target.set(...)`
     toevoegt, ziet het stilzwijgend niets doen — dezelfde voorwaarde waarop de
     zonvlucht werkt. */
  const _mid = new THREE.Vector3();
  function kaderMidden(zonAs) {
    // Halverwege tussen de neus (+10) en het einde van de getekende staart
    // (-60) ligt op -25 Re. Dat is 0,42 van de tekengrens, van de zon af.
    return _mid.copy(zonAs).multiplyScalar(-MSPHERE_DRAW_MAX * MSPHERE_RE * 0.42);
  }

  /* DE KIJKRICHTING VAN DE VRIJE STAND, apart omdat er TWEE dingen aan hangen:
     waar de camera gaat staan, en op welke afstand van de AARDE dat is. Dat
     tweede getal is de ijkmaat van het meeschuivende draaipunt — zie
     draaipuntFactor — en het mocht daar niet uit een tweede formule komen. */
  /* DE VRIJE STAND IS MERIDIAN, EEN STAP OPZIJ EN OMHOOG (sessie 33, Terry).

     Hier stond (0,85 · 0,50 · 0,45): een camera die voor 85 % LÁNGS de zonlijn
     keek. Dat is 59,5 graden azimut vanaf Meridian, en het gevolg was dat de
     holte schuin omhoog liep in plaats van vlak te liggen. Terry: "de 3D orbit
     heeft een schuine kanteling omhoog als we het model van de zijkant bekijken;
     we willen dat de basis dezelfde oriëntatie kent als de meridian."

     DE MEETKUNDE ERACHTER, want dit is uit te rekenen en niet te proberen. Met
     `up` op de GSM-Z-as is de schermhoek van de zonlijn `atan2(-dz*dx, -dy)`,
     dus de afwijking van horizontaal hangt aan het PRODUCT van de azimut- en de
     elevatiecomponent. Meridian is (0,1,0) en geeft per constructie 0. Gemeten
     over de kandidaten:

       0,85 / 0,50 / 0,45   azimut 59,5°   elevatie 24,5°   zonlijn 35,2° scheef
       0,50 / 0,80 / 0,33          32,0°             19,3°           11,7°
       0,38 / 0,85 / 0,36          24,1°             21,1°            9,2°
       0,30 / 0,90 / 0,32          18,4°             18,6°            6,1°

     0,38/0,85/0,36 gekozen: de zonlijn ligt binnen tien graden van horizontaal —
     genoeg om als "vlak" te lezen — en er blijft 24 graden azimut en 21 graden
     elevatie over, dus je ziet nog steeds RÓND de vorm en niet erdoorheen. Nog
     dichter bij Meridian (0,30/0,90/0,32) maakt van de vrije stand een tweede
     doorsnede, en dan is er geen reden meer om er twee te hebben.

     De verhouding staat hier als GENORMALISEERDE GSM-componenten, en niet als
     drie losse getallen die daarna genormaliseerd worden — dan is het ook zonder
     assenstelsel uit te rekenen hoe ver die stand van de aarde af ligt. */
  const ORBIT_EENHEID = (() => {
    const L = Math.hypot(0.38, 0.85, 0.36);
    return { x: 0.38 / L, y: 0.85 / L, z: 0.36 / L };
  })();

  function orbitRichting(a) {
    return _dir.copy(a.x).multiplyScalar(ORBIT_EENHEID.x)
               .addScaledVector(a.y, ORBIT_EENHEID.y)
               .addScaledVector(a.z, ORBIT_EENHEID.z);
  }

  function targetFrom(direction, distance, up, midden, vlak) {
    const b = bounds(vlak);
    const doel = midden ? midden.clone() : origin.clone();
    return { pos: direction.clone().multiplyScalar(distance).add(doel), target: doel,
             min: b.min, max: Math.max(b.max, distance * 1.6),
             up: up ? up.clone() : null };
  }

  /* DE GSM-BASIS, IN TWEE FRAMES TEGELIJK.

     X naar de zon, Y = M x X, Z = X x Y — de definitie uit
     Core.Frames.gsmBasis. De camera staat in Terra-coördinaten, dus die
     drie assen gaan door `pocNaarTerra`; zie daar waarom (x,y,z)->(y,z,x)
     een rotatie is en geen spiegeling.

     EN DE ONBEWERKTE VERSIE GAAT MEE TERUG (sessie 32). De veldlijnen
     tracen in het EARTH-FIXED frame van de PoC — Core.Trace._dir zegt dat
     met zoveel woorden — dus hun spec heeft de basis nodig zoals
     Core.Frames.gsmBasis hem levert, vóór de omzetting. Twee keer IGRF
     evalueren om dezelfde basis twee keer uit te rekenen zou precies de
     tweede berekening zijn die ooit uit de pas loopt; `coeff` en `dip`
     staan hier al klaar.

     `tilt` komt uit dezelfde bron. T89 heeft hem nodig en hij is per
     constructie de hoek tussen de dipoolas en de zonlijn — zelf uitrekenen
     uit de Terra-assen geeft hetzelfde getal langs een tweede weg. */
  function gsmAssen() {
    const d = moment();
    const coeff = Core.IGRF.atYear(Core.Frames.decimalYear(d));
    const dip = Core.IGRF.dipole(coeff);

    const dipGeo = Core.geoPoint(dip.northLat, dip.northLon, 1);
    const basis = Core.Frames.gsmBasis(d, dipGeo);

    pocNaarTerra(THREE, basis.X, _sun).normalize();
    pocNaarTerra(THREE, dipGeo, _dip).normalize();

    _y.crossVectors(_dip, _sun);
    if (_y.lengthSq() < 1e-12) _y.set(0, 1, 0);
    _y.normalize();
    _z.crossVectors(_sun, _y).normalize();
    // `dip` gaat mee terug in plaats van als bijwerking in `_dip` te blijven
    // staan: een aanroeper die daarop leunt, breekt zodra de volgorde wijzigt.
    return { x: _sun, y: _y, z: _z, dip: _dip, basis, coeff, date: d };
  }

  /* ----------------------------------------------------------
     DRIE STANDEN.

     MERIDIAN   in het GSM X-Z-vlak, de zon links. Dit is de doorsnede
                waarin de magnetosfeer haar bekende vorm heeft: neus,
                flank, staart. Het beeld van elk leerboek, en het enige
                waarin een schaal langs de assen betekenis heeft.
     TOP        langs de dipoolas-kant van het frame: de holte van boven,
                waarin de afplatting te zien is.
     3D         schuin, vrij te draaien.

     Meridian en Top zijn VASTGEZET — de oriëntatie staat vast, pannen en
     zoomen blijven werken. Zie de kop van core/view-state.js voor waarom
     die twee dingen uit elkaar horen.
  ---------------------------------------------------------- */
  /* IN EEN VASTE STAND PANT DE LINKERKNOP, EN DAT MOET GEZEGD WORDEN.

     view-state.js zet `ctl.enableRotate = false` in een vastgezette stand, en
     OrbitControls heeft de linkerknop standaard op DRAAIEN staan. Uitgezet
     draaien betekent dus: slepen doet niets, en pannen zit verstopt op de
     rechterknop. Precies de klacht dat pannen "nog toegevoegd moest worden" —
     het zat er wel, maar op een knop die niemand probeert.

     Bij de aanraakbediening hetzelfde: één vinger pant, twee vingers zoomen. */
  let bewaardeKnoppen = null, bewaardeVingers = null;

  function zetSleepgedrag(pannen) {
    const ctl = world.controls();
    if (pannen) {
      if (!bewaardeKnoppen) {
        bewaardeKnoppen = { ...ctl.mouseButtons };
        bewaardeVingers = { ...ctl.touches };
      }
      ctl.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY,
                           RIGHT: THREE.MOUSE.PAN };
      ctl.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    } else if (bewaardeKnoppen) {
      ctl.mouseButtons = bewaardeKnoppen;
      ctl.touches = bewaardeVingers;
      bewaardeKnoppen = bewaardeVingers = null;
    }
  }

  const LOCK_NOTE = 'Locked to the GSM frame — drag to pan, scroll to zoom.';

  /* ==========================================================
     DE VLAKKE STANDEN KRIJGEN EEN ORTHOGRAFISCHE PROJECTIE.

     Een doorsnede kent geen verdwijnpunt. Met een perspectiefbeeld loopt de
     staart naar één punt en klapt de ring om de neus open tot een ovaal; dan
     kijk je naar een foto van een driedimensionaal ding, terwijl het beeld dat
     de magnetosfeer verklaart juist de plaat uit het leerboek is. De lange lens
     van 12 graden bracht dat dichterbij maar niet erheen.

     WAAROM DIT GEEN VERBOUWING IS. De camera van globe.gl wordt niet vervangen
     — er wordt één methode op dat exemplaar overschreven. three.js' renderer
     roept `updateProjectionMatrix()` niet aan tijdens het tekenen; hij gebruikt
     `camera.projectionMatrix`. Overschrijf je die methode, dan gaat alles
     downstream mee: tekenen, raycasten, `.project()` en `.unproject()`.
     Dezelfde onderscheppingstechniek als ensureTargetLock en ensureSpeedLock,
     en net zo omkeerbaar.

     DE HOOGTE IS AFSTAND MAAL 0,9, EN DAT IS GEEN WILLEKEURIG GETAL. Het is de
     relatie uit `Core.Registration.pxPerRe` (js/compute/magnetosphere/core.js):
     px per Re is `h / (dist * 0,9)`. Houden we ons daaraan, dan geldt de hele
     registratie van de PoC hier per constructie — en dan is `overlay.js` met
     zijn Re-getallen langs de assen exact aan te sluiten in plaats van
     bij benadering. Dat is de reden dat de afstand hieronder uit de gewenste
     hoogte volgt en niet andersom.

     WAT ER NIET MEEGAAT: `camera.isPerspectiveCamera` blijft waar. Wie daarop
     vertakt denkt dus nog steeds perspectief. In deze state raakt dat twee
     dingen, en allebei zijn ze afgevangen: fitDistance() wordt hier niet
     gebruikt (de afstand komt uit orthoAfstand), en de labelschaal in
     core/label-sprite.js leest `fov` — maar labels staan in deze state uit.
  ========================================================== */
  /* Wat er in het beeld past, in Re. Gemeten bij 960 x 600: de neus (+10 Re)
     valt op -0,489 en het einde van de staart (-60 Re) op +0,483 — de vorm
     vult de breedte symmetrisch, met de zon links zoals de PoC hem zet. */
  const MSPHERE_ORTHO_SPAN_RE = 90;
  const MSPHERE_ORTHO_K = 0.9;             // Registration.pxPerRe

  /* EEN CANVAS VAN NUL GEEFT aspect = 0/0 = NaN, en dan is de projectiematrix
     weg — hetzelfde gat dat fitDistance() hierboven al dicht heeft. Bij een
     orthografische matrix is het erger: een NaN daarin maakt élk punt NaN, dus
     het beeld is zwart en blijft dat. Gemeten in sessie 30, in een verborgen
     browserpaneel. */
  const veiligeAspect = () => {
    const a = world.camera().aspect;
    return Number.isFinite(a) && a > 0 ? a : 1;
  };

  /* De hoogte volgt de VERHOUDING, want de vorm is lang en niet hoog. Op een
     breed scherm bepaalt de hoogte hoeveel je verticaal ziet; op een telefoon
     in portret zou diezelfde hoogte de staart afsnijden, dus daar groeit hij
     mee. Dezelfde afweging als de min(halfV, halfH) in fitDistance. */
  const orthoHoogte = () => MSPHERE_ORTHO_SPAN_RE * MSPHERE_RE * Math.max(1, 1 / veiligeAspect());
  const orthoAfstand = () => orthoHoogte() / MSPHERE_ORTHO_K;

  /* DE PROJECTIE MENGT, HIJ KLAPT NIET OM (sessie 31).

     `mengE` is 0 bij zuiver perspectief en 1 bij zuiver orthografisch. Tot deze
     sessie waren dat de enige twee waarden en werden ze op frame 0 van een
     standwissel gezet — gemeten: 3D orbit -> Meridian klapte de projectie om
     terwijl de camera nog op de plek van de vrije stand stond, met een
     beeldhoogte van 66 Re waar de bestemming er 90 heeft. Dat is de flikker,
     en pas dáárna begon de vlucht.

     WAAROM ELEMENT VOOR ELEMENT MENGEN VEILIG IS, en niet op goed geluk. De
     perspectiefmatrix levert w = -z, de orthografische w = 1. De menging geeft
     w = -(1-e)*z + e. Zichtbare meetkunde ligt bij z < 0 (three kijkt langs -z),
     dus w > 0 voor élke e >= 0: het singuliere vlak van de gemengde projectie
     ligt altijd ACHTER de camera. En een convexe combinatie van twee in z
     monotone afbeeldingen is zelf monotoon, dus de diepteordening kan onderweg
     niet omklappen. Geen z-fighting dat er zonder menging niet was.

     Meetkundig is dit precies de camera waarvan het oogpunt naar oneindig
     schuift terwijl het kader op het draaipunt blijft staan: de dolly-zoom die
     een foto in een doorsnede verandert.

     MAAR DE MENGFACTOR IS NIET WAT JE ZIET, EN DAT IS GEMETEN.

     Een rechtstreekse menging met de vluchtvoortgang leek te werken en was
     onbruikbaar. De sterkte van het perspectief die je waarneemt is niet `e`
     maar s = (1-e) / w, met w de gemengde w op het draaipunt. Uitgerekend en
     nagemeten voor een draaipunt op 7000 eenheden:

       e      0     0,5    0,9    0,99   0,999  0,9999   1
       s/s0  1,00   1,00   1,00   0,99   0,87    0,41    0

     Het beeld blijft dus VOLLEDIG perspectief tot e voorbij 0,999 is en klapt
     dan in de laatste duizendste alsnog om. De menging verplaatste de flikker
     naar het eind in plaats van hem op te heffen — gemeten als een NDC-sprong
     van 0,074 op de laatste stap, tien keer die ervoor.

     De oorzaak is de schaal van de scene: w loopt van 1 (ortho) tot D (de
     afstand tot het draaipunt, hier zevenduizend), en een lineaire menging
     tussen twee getallen die vier ordes uit elkaar liggen is bij elke tussen-
     waarde nog vrijwel gelijk aan de grootste.

     Dus mengt niet `e` maar `s` lineair. Uit s = (1-t)/D volgt

       1 - e = (1-t) / (1 + t(D-1))

     en dat is de omrekening hieronder. `mengE` blijft daarmee zeggen wat het
     zegt — hoe orthografisch het BEELD is — en de matrix krijgt de factor die
     daarbij hoort. */
  let orthoOrigineel = null;
  let mengE = 0;

  const _mOrtho = new THREE.Matrix4();
  const _mPersp = new THREE.Matrix4();

  /* De override PLAATSEN. Idempotent, want hij wordt aangeroepen bij het begin
     van elke overgang die de projectie raakt — ook wanneer hij er al staat.
     Zie de lange noot hierboven bij MSPHERE_ORTHO_SPAN_RE voor waarom dit één
     methode overschrijven is en geen vervangen camera. */
  function borgProjectie() {
    const cam = world.camera(), ctl = world.controls();
    if (orthoOrigineel) { cam.updateProjectionMatrix(); return; }
    orthoOrigineel = cam.updateProjectionMatrix.bind(cam);
    cam.updateProjectionMatrix = function () {
      const afstand = cam.position.distanceTo(ctl.target);
      const halfH = afstand * MSPHERE_ORTHO_K / 2;
      const halfW = halfH * veiligeAspect();
      /* Een diepteplak die de hele scene omvat, en ruim: bij een
         orthografische projectie is de dieptenauwkeurigheid LINEAIR, dus een
         groot bereik kost hier niets. Bij perspectief zou dat juist de
         z-fighting geven waar `near` normaal zo klein voor blijft. */
      _mOrtho.makeOrthographic(-halfW, halfW, halfH, -halfH,
                               -MSPHERE_ORTHO_DIEPTE, MSPHERE_ORTHO_DIEPTE);

      if (mengE >= 1) {
        cam.projectionMatrix.copy(_mOrtho);
      } else {
        /* DE PERSPECTIEFMATRIX WORDT OPNIEUW GEBOUWD EN NIET OVERGENOMEN.

           three.js bouwt `projectionMatrix` alleen op verzoek, en OrbitControls
           vraagt er niet om bij een perspectiefcamera. Was `camera.aspect` ooit
           NaN — en dat is hij in een paneel dat bij het laden 0x0 is — dan staat
           er een NaN-matrix die daarna nooit meer opgeruimd wordt. GEMETEN in
           sessie 31: `projectionMatrix.elements[0] === NaN` in de vrije stand.
           Eén NaN maakt de hele menging NaN, en een NaN-projectie herstelt zich
           nergens meer. Dus eerst de aspect langs dezelfde vangrail als de
           orthografische helft, en dan pas three zijn eigen werk laten doen. */
        const bewaardeAspect = cam.aspect;
        cam.aspect = veiligeAspect();
        orthoOrigineel();
        _mPersp.copy(cam.projectionMatrix);
        cam.aspect = bewaardeAspect;

        /* Van "hoe orthografisch ziet het eruit" naar "welke matrixmenging
           hoort daarbij" — zie de tabel in de kop. Een draaipunt op één
           eenheid of dichterbij maakt de omrekening zinloos (D-1 <= 0); dan is
           er ook geen scheve schaal om recht te trekken. */
        const D = afstand;
        const m = D > 1 ? 1 - (1 - mengE) / (1 + mengE * (D - 1)) : mengE;

        const uit = cam.projectionMatrix.elements;
        const pp = _mPersp.elements, po = _mOrtho.elements;
        for (let i = 0; i < 16; i++) uit[i] = pp[i] + (po[i] - pp[i]) * m;
      }
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    };
    cam.updateProjectionMatrix();
  }

  /* En weer weghalen. Alleen wanneer de menging op nul staat: zolang er ook
     maar een beetje ortho in zit, is deze override de enige die dat weet. */
  function laatProjectieLos() {
    const cam = world.camera();
    if (!orthoOrigineel) return;
    cam.updateProjectionMatrix = orthoOrigineel;
    orthoOrigineel = null;
    mengE = 0;
    cam.updateProjectionMatrix();
  }

  const views = {
    /* DE TWEE VASTE STANDEN GEVEN HUN EIGEN "OMHOOG" OP.

       Zonder dat staat omhoog op Terra's noordpool (0,1,0), en het GSM-frame
       staat daar tientallen graden vanaf — de dipoolas is 11 graden scheef en
       de zonrichting draait de hele dag rond. Je kijkt dan wel loodrecht op
       het juiste vlak, maar het beeld hangt scheef, en een gekanteld
       zijaanzicht is geen zijaanzicht.

       In BEIDE standen ligt de zonlijn (GSM-x) horizontaal, want dat is de as
       waarlangs de vorm zich uitstrekt. Wat verticaal staat verschilt:
       Meridian zet de dipoolkant omhoog, Top de flank.

       EN `camera()` IS EEN VRAAG, GEEN OPDRACHT (sessie 31). Tot deze sessie
       zette elke `camera()` hier eerst `vlakkeStand` en installeerde hij de
       projectie — dus tegen de tijd dat `goToView` de vlucht startte, was de
       helft van de overgang al gebeurd. De bestemming staat nu in `flat` en
       wordt als argument doorgegeven; wát er getekend wordt, verzet de
       overgang zelf, halverwege de vlucht. Zie `transition` verderop.

       `arc: true` op alle drie: de vlucht loopt langs een BOOG om het
       draaipunt in plaats van langs de koorde. Zie de noot bij flyCamera()
       in index.html — in een orthografische stand ís de afstand de zoom, dus
       een koorde leest als een in-en-uit-zoom van 90 naar 64 Re en terug. */
    /* DE VOLGORDE IS DE VOLGORDE OP HET SCHERM (sessie 31, Terry). `list()`
       loopt deze literal af, en zowel de gleuf bovenin als het register lezen
       daaruit. 3D orbit staat vooraan omdat dat de stand is waarin je de vorm
       ROND ziet; de vaste standen daarna zijn doorsneden ervan.

       LET OP dat dit niet hetzelfde is als `initialView`. Wat er als eerste
       STAAT en wat er als eerste GETOOND wordt zijn twee keuzes; ze mogen
       samenvallen maar hoeven het niet. */
    orbit: {
      locked: false, arc: true, label: '3D orbit', note: 'Free orbit.',
      camera: () => {
        // De vrije stand houdt de gewone beeldhoek: daar kijk je juist RÓND de
        // vorm, en dan is perspectief wat de diepte draagt.
        // Schuin op de zonlijn: de neus in beeld én de staart herkenbaar.
        const a = gsmAssen();
        /* "OMHOOG" IS DE GSM-Z-AS, PRECIES ALS IN MERIDIAN (sessie 33, Terry).

           Hier stond `null`, en dat betekent niet "geen voorkeur" maar "geef me
           de STANDAARD terug" (zie de noot bij `up` in core/view-state.js) —
           Terra's wereld-Y, oftewel de geografische noordpool. Die staat scheef
           op het GSM-frame waarin deze hele scene leeft, en dat is de kanteling
           die je van opzij zag: de holte liep omhoog terwijl de doorsnede hem
           recht liet zien.

           Met a.z heeft de vrije stand dezelfde horizon als Meridian, en wat er
           dán nog kantelt ís de holte — die beweegt met de dipoolstand mee, en
           straks met de zonnewind. Dát is wat er te zien hoort te zijn. */
        return targetFrom(orbitRichting(a).clone(), overviewDistance(false),
                          a.z, kaderMidden(a.x), false);
      }
    },
    meridian: {
      locked: true, flat: true, arc: true, label: 'Meridian', note: LOCK_NOTE,
      camera: () => {
        // Loodrecht op het X-Z-vlak is de Y-as: van daaruit zie je dat vlak
        // op ware grootte, met de dipoolas-kant omhoog.
        const a = gsmAssen();
        return targetFrom(a.y.clone(), overviewDistance(true), a.z,
                          kaderMidden(a.x), true);
      }
    },
    top: {
      locked: true, flat: true, arc: true, label: 'Top', note: LOCK_NOTE,
      camera: () => {
        // Van boven op het X-Y-vlak. Omhoog moet IN dat vlak liggen — de
        // Z-as zou samenvallen met de kijkrichting en dat is gedegenereerd.
        //
        // MIN Y EN NIET PLUS: met +y staat de zon rechts en in Meridian links,
        // en dan wisselt de leesrichting bij het omschakelen tussen twee standen
        // van hetzelfde onderwerp. GEMETEN als schermhoek van de zonlijn: +y gaf
        // 0 graden, -y geeft 180, gelijk aan Meridian. De PoC houdt dezelfde
        // conventie aan (+X links, zie zijn schaaloverlay).
        const a = gsmAssen();
        return targetFrom(a.z.clone(), overviewDistance(true),
                          a.y.clone().negate(), kaderMidden(a.x), true);
      }
    }
  };

  /* ==========================================================
     DE CAMERASTELLING WOONT IN HET GSM-FRAME (sessie 30).

     Buiten deze state staat de camera in wereldcoördinaten, en dat klopt
     daar: de aarde ligt stil en de zon trekt eroverheen. Hier is het
     onderwerp juist de holte, en die staat vast ten opzichte van de ZON.
     De aarde draait erin rond.

     Tot deze sessie zette `goToView` de camera één keer neer en bleef hij
     daar. Zet je dan het afspelen aan, dan draait het GSM-frame wél mee en
     de camera niet — en dus zwiept de holte door het beeld terwijl de aarde
     stil lijkt te staan. Precies omgekeerd aan wat er gebeurt.

     De oplossing is niet een correctie maar een andere boekhouding: de
     camerapositie en zijn "omhoog" worden hier BEWAARD IN GSM-COÖRDINATEN.
     Bij elke herbouw worden ze met de nieuwe framerotatie terug naar de
     wereld gerekend; als de bezoeker zelf sleept of zoomt, worden ze
     teruggelezen. Eén formulering, en alle drie de standen kloppen: de
     vaste standen blijven vaststaan, de vrije stand blijft vrij, en in
     allebei staat de holte stil terwijl de aarde erin draait.
  ========================================================== */
  const _camGsm = new THREE.Vector3();
  const _upGsm = new THREE.Vector3(0, 1, 0);
  /* HET DRAAIPUNT STAAT ER OOK IN, en dat is de voorwaarde voor pannen. In de
     vlakke standen verzet de bezoeker het draaipunt zelf; werd het bij elke
     herbouw opnieuw uit de zoomafstand berekend, dan sprong elke pan meteen
     terug. In de vrije stand is het juist andersom — daar STUURT de zoom het,
     en dat is wat het inzoomen op de aarde mogelijk maakt. */
  const _targetGsm = new THREE.Vector3();
  const _qFrame = new THREE.Quaternion();
  const _qInv = new THREE.Quaternion();
  let rigGevuld = false;
  let vlakkeStand = false;

  /* WAT DE BEZOEKER AAN WIL ZIEN, apart van wat er te zien VALT.

     Twee verschillende dingen, en ze door elkaar halen is precies hoe een
     schakelaar stil kapot gaat. `boundary.update()` zet de boegschok zelf uit
     zodra er geen machgetal is — die is dan niet te tekenen, wat de bezoeker
     ook wil. En de voorkeur mag dat niet overschrijven, want dan staat er een
     schok op een verzonnen Mach 1,2 (zie boundary-layer.js).

     Vandaar: de voorkeur staat hier, en de zichtbaarheid is de voorkeur ÉN de
     mogelijkheid. */
  let wilMagnetopauze = true;
  let wilBoegschok = true;
  let wilRaster = true;
  let wilVeldlijnen = true;
  let huidigeView = null;

  function pasVoorkeurenToe() {
    boundary.setPartVisible('magnetopause', wilMagnetopauze);
    // Geen rbs betekent geen machgetal, en dan is er niets om te tonen.
    boundary.setPartVisible('bowshock', wilBoegschok && !!(laatste && laatste.rbs !== null));
  }

  /* Het raster hoort bij een VLAK, dus het bestaat alleen in de vaste standen —
     ook als de bezoeker hem aan heeft staan. In de vrije stand is er geen vlak
     om een schaal op te leggen. */
  function pasRasterToe() {
    const vlak = vlakkeStand && wilRaster && huidigeView ? huidigeView : null;
    if (grid) grid.setPlane(vlak);
    /* De getallen langs de assen horen bij het raster en niet ernaast: ze staan
       op zijn lijnen, ze verschijnen met hem en ze verdwijnen met hem. Eén
       schrijver voor "welk vlak" dus, hier. */
    if (scale) scale.setPlane(vlak);
  }

  /* ==========================================================
     DE VELDLIJNEN (sessie 32, blok F)

     IGRF binnen, T89 buiten, en per lijn de vraag of hij de magnetopauze
     kruist. `Core.Build.run` doet dat in één aanroep en levert de punten plus
     drie uitspraken die nergens anders vandaan komen: hoeveel lijnen open zijn,
     waar de poolkaprand ligt, en hoeveel van de getekende lijnlengte voorbij de
     geostationaire baan valt — de enige straal waarop dit project het veld MEET.

     DE SPEC IS HET ENIGE DAT ERIN GAAT. `Core.Env.of` maakt daar de omgeving
     uit; alle getallen hieronder komen uit de POC en zijn daar met een meting
     onderbouwd. Ze hier "afstemmen" betekent iets anders tekenen dan wat de
     1498 POC-asserties toetsen.

     WAT ERUIT KOMT STAAT IN GSM, niet in het Earth-fixed frame waarin
     `Core.Trace` zegt te rekenen: de integratie loopt daar, maar `Trace.line`
     schrijft per stap de GSM-versie van het punt weg. De tekenlaag hangt daarom
     onder dezelfde groep als het grensvlak. Gemeten, want het verschil is niet
     te zien — een lijnenbundel in het verkeerde frame is nog steeds een dipool.

     GEEN WORKER (besluit sessie 29). Een herbouw kost 24,58 ms gemeten, eens
     per dataminuut. Terugkeerbaar: `Core.Build.run` is in beide gevallen
     dezelfde functie.
  ========================================================== */

  /* De zaadladder. Vijf sporten, ongelijk verdeeld, en dat is een meting: de
     eerste open lijn ligt tussen 60 graden (zware storm) en 70 (rustig), dus een
     ladder die daaronder ligt zegt bij elk weer hetzelfde. Zie de lange noot bij
     Core.Build.seedList. */
  const MSPHERE_ZAAD_LATS = [56, 66, 72, 78, 84];
  /* MINDER LENGTEGRADEN NAAR DE POOL TOE, en alleen in de vrije standen. De
     omtrek van een breedtecirkel krimpt met cos(breedte), dus acht vaste
     meridianen staan bij 84 graden vijf keer zo dicht op elkaar als bij 56 —
     acht bijna identieke bogen de staart in. De vloer is 4 en niet 2: de
     poolkaprand is de laagste breedte waar ÉÉN lengtegraad opengaat, en met
     twee zaden per schil kan een open sector ertussendoor vallen. */
  const MSPHERE_ZAAD_LONN = [8, 6, 4, 4, 4];

  /* WELKE ZADEN BIJ WELKE STAND HOREN, en dit is de enige plek waar dat staat.

     In Meridian kijk je op het GSM X-Z-vlak, en dan zijn de noon-midnight-
     meridiaan en zijn tegenhanger precies de twee lengtegraden die IN dat vlak
     liggen — acht meridianen zouden zes bundels opleveren die je van opzij als
     één streep ziet.

     Top kijkt langs de dipoolas-kant, en dáár vallen die twee juist samen tot
     één lijn. De POC kent geen Top-stand en heeft deze keuze dus nooit hoeven
     maken; hier krijgt Top de acht meridianen van de vrije stand. */
  const zaadSoort = (viewNaam) => (viewNaam === 'meridian' ? 'meridian' : '3d');

  /* De lengtegraad van de zon, in het geofysische frame. `basis.X` ÍS de
     genormaliseerde zonrichting daar — dezelfde die `Core.Frames.gsmBasis`
     gebruikt — dus dit is geen tweede berekening. */
  const zonLon = (basis) => Math.atan2(basis.X.y, basis.X.x) * 180 / Math.PI;

  function veldSpec(rij, a, viewNaam) {
    const soort = zaadSoort(viewNaam);
    const lon = zonLon(a.basis);
    return {
      epochMs: a.date.getTime(),
      year: Core.Frames.decimalYear(a.date),
      basis: Core.Frames.basisArray(a.basis),
      tilt: a.basis.tilt,
      field: { iopt: Core.T89.band(rij ? rij.kp : NaN) },
      /* GEEN GRENS MEESTUREN ALS ER GEEN IS. `Env.of` draagt dat al — `shape`
         wordt null en de tracer kan niets meer OPEN noemen. Een verzonnen r0
         zou de tracer een oppervlak laten classificeren dat niemand gemeten
         heeft, en dat is erger dan geen oppervlak. */
      boundary: (laatste && laatste.ok && laatste.r0 !== null)
        ? { r0: laatste.r0, alpha: laatste.alpha } : null,
      seeds: {
        lonDeg: soort === 'meridian' ? [lon, lon + 180]
                                     : [0, 45, 90, 135, 180, 225, 270, 315],
        lonN: soort === 'meridian' ? null : MSPHERE_ZAAD_LONN,
        lats: MSPHERE_ZAAD_LATS, hemis: [1, -1], seedR: 1.01
      },
      trace: { maxR: Core.CONST.MODEL_MAX_RE, minR: 1.0, steps: 4000,
               dsA: 0.02, dsB: 0.06, dsMax: 0.35 },
      /* De decimatietolerantie schaalt met r: elk weggelaten punt ligt binnen
         `tolCoef * max(r,1)` Re van de koorde die het vervangt. Op 0,0006 is dat
         bij r = 70 Re minder dan een halve pixel; op de oude 0,004 was het 3,5
         en zag je de hoekigheid in de staart. Gemeten kosten: 2093 -> 5622
         punten, en de bouwtijd verandert NIET — die zit in het traceren. */
      emit: { tolCoef: 0.0006, maxPts: 1024 }
    };
  }

  /* DE SLEUTEL DIE ZEGT OF ER IETS TE HERBOUWEN VALT.

     De tijdkwantisering van twee minuten is GEEN rem maar een uitspraak over
     hoe fijn de geometrie de klok volgt. Alles wat de vorm verandert staat
     erin; wat er niet in staat verandert hem niet. */
  function veldSleutel(rij, a, viewNaam) {
    return [Math.round(a.date.getTime() / 120000), zaadSoort(viewNaam),
            Core.T89.band(rij ? rij.kp : NaN),
            (laatste && laatste.ok && laatste.r0 !== null) ? laatste.r0.toFixed(2) : '-',
            (laatste && laatste.ok && laatste.alpha !== null) ? laatste.alpha.toFixed(3) : '-',
            wilVeldlijnen ? 1 : 0].join('|');
  }

  /* EEN VLOER OP DE WANDKLOK, NAAST DE KWANTISERING OP DE DATATIJD.

     Die twee zeggen iets anders en dat is de reden dat het er twee zijn. De
     twee minuten hierboven is een uitspraak over de FYSICA: fijner dan dat
     volgt de geometrie de klok niet. Deze vloer is een uitspraak over het
     BEELD: vaker dan dit past een herbouw niet in een frame.

     GEMETEN in de draaiende app: 23,9 ms per herbouw in de vrije stand (52
     lijnen), 10,2 ms in een doorsnede (20 lijnen). Bij 20 min/s verandert de
     twee-minutensleutel tien keer per seconde, dus zonder vloer kost dat een
     kwart van de wandtijd — en elke herbouw is op zichzelf al langer dan de
     16,7 ms van een frame, dus je ziet hem als een hapering en niet als traag.

     250 ms geeft vier herbouwen per seconde: 10 % van de wandtijd in de vrije
     stand. Wat je ervoor inlevert is dat de lijnen tijdens het afspelen tot een
     kwart seconde achterlopen op het oppervlak — bij 20 min/s zo'n vijf
     datamin, en over die vijf minuten beweegt de vorm niet zichtbaar.

     DE INHAALSLAG IS NIET OPTIONEEL. Een overgeslagen herbouw die nooit
     terugkomt is precies de stille fout die deze app elders dichtzet: de
     lijnen staan dan op een moment dat allang voorbij is en niets zegt het.
     Tijdens het afspelen komt de volgende tik vanzelf; bij de LAATSTE stap
     vóór een pauze niet, en daar is de timer voor. */
  const MSPHERE_VELD_VLOER_MS = 250;

  let laatsteVeld = null;
  let veldSleutelNu = null;
  let veldBouwTijd = 0;
  let veldInhaal = null;

  function bouwVeldlijnen(rij, a, forceer) {
    if (!fieldlines || !Core.Build) return null;
    if (veldInhaal) { clearTimeout(veldInhaal); veldInhaal = null; }
    if (!wilVeldlijnen) {
      fieldlines.setVisible(false);
      veldSleutelNu = null;
      return laatsteVeld;
    }
    const view = huidigeView || (naarView || 'orbit');
    const sleutel = veldSleutel(rij, a, view);
    if (!forceer && sleutel === veldSleutelNu) { fieldlines.setVisible(true); return laatsteVeld; }

    const nu = performance.now();
    const wacht = MSPHERE_VELD_VLOER_MS - (nu - veldBouwTijd);
    if (!forceer && veldSleutelNu !== null && wacht > 0) {
      veldInhaal = setTimeout(() => { veldInhaal = null; if (actief) herbouw(); }, wacht);
      fieldlines.setVisible(true);
      return laatsteVeld;
    }

    const geom = Core.Build.run(veldSpec(rij, a, view));
    const teken = fieldlines.upload(geom);
    veldSleutelNu = sleutel;
    veldBouwTijd = performance.now();
    laatsteVeld = { geom, teken };
    fieldlines.setVisible(true);
    return laatsteVeld;
  }

  /* Geen meting is geen lijn. Zonder wind is er geen grens, en zonder grens kan
     de tracer niets OPEN noemen — maar de lijnen zelf bestaan wél: IGRF en T89
     hangen niet aan de zonnewind. Ze komen dan in één neutrale inkt te staan en
     de uitlezing zegt waarom. Wat er NIET is, is een moment: staat er geen rij,
     dan is er ook geen tijd om het veld op te evalueren. */
  function veldlijnenUit() {
    if (veldInhaal) { clearTimeout(veldInhaal); veldInhaal = null; }
    if (!fieldlines) return;
    fieldlines.setVisible(false);
    veldSleutelNu = null;
  }

  /* HET DRAAIPUNT SCHUIFT MEE MET DE ZOOM.

     Twee dingen die allebei waar zijn en elkaar tegenspraken. Uitgezoomd
     hoort het draaipunt in de HOLTE te liggen: de vorm loopt van +10 Re aan
     de zonzijde tot -60 in de staart, dus zijn midden ligt niet op de aarde,
     en met een draaipunt op de aarde zwiept de staart door het beeld zodra je
     sleept (Terry, sessie 29). Ingezoomd hoort het op de AARDE te liggen:
     anders convergeert het zoomen op een leeg punt 25 Re verderop en kom je
     er nooit bij (Terry, sessie 30 — gemeten: de aarde stond op 22 % van de
     linkerrand en mat zeven pixels).

     Dus verschuift het met de afstand. Ver weg is het beeld een VORM en
     draai je om die vorm; dichtbij is het beeld een PLANEET en draai je om de
     planeet. De overgang loopt over de tussenliggende afstanden, met een
     smoothstep zodat er nergens een knik in zit.

     DE AFSTAND WORDT AAN DE AARDE GEMETEN EN NIET AAN HET DRAAIPUNT. Dat is
     geen detail maar de reden dat dit stabiel is: het draaipunt verplaatsen
     verandert de afstand tot het draaipunt, en zou die de maat zijn, dan
     stuurde het draaipunt zichzelf. De afstand tot de aarde ligt vast. */
  const MSPHERE_PIVOT_NEAR = MSPHERE_RE * 6;    // hier ligt het draaipunt volledig op de aarde
  /* ALLEEN IN DE VRIJE STAND. In de vlakke standen pant de bezoeker zelf, en
     dan hoort het draaipunt te blijven waar hij het neerzet — daar is inzoomen
     op de aarde ook niet het doel (Terry, sessie 30). */
  /* DE IJKMAAT MOET DEZELFDE SOORT AFSTAND ZIJN ALS DE INVOER, en dat was hij
     niet. De invoer is de afstand van de camera tot de AARDE; `overviewDistance`
     geeft de afstand van de camera tot het DRAAIPUNT. Dat draaipunt ligt 25 Re
     van de aarde af, dus die twee lopen fors uiteen: gemeten in de vrije stand
     7808 tegen 6038.

     Het gevolg was zichtbaar op precies één moment. De vlucht landde op het
     volle draaipunt (`kaderMidden`), waarna de eerste `schrijfRig` er de factor
     0,754 op losliet en het draaipunt 618,8 eenheden — ruim zes aardstralen —
     naar de aarde trok. Dat is de grootste sprong van de hele wissel naar de
     vrije stand, en hij zat helemaal aan het eind.

     Nu is de ijkmaat de afstand tot de aarde van de kaderstand zelf. Daar geldt
     per constructie f = 1, dus de vlucht landt waar de besturing hem daarna ook
     houdt — en dichterbij loopt hij door precies dezelfde lineaire helling als
     eerst. */
  /* IN GETALLEN EN NIET IN VECTOREN, want dit is frame-onafhankelijk: de lengte
     van een som in een orthonormale basis hangt niet af van hoe die basis in de
     wereld staat. Dat scheelt hier een IGRF-evaluatie bij ELKE muisbeweging —
     deze functie hangt aan draaipuntFactor, en die draait op elke 'change'. */
  function overviewTotAarde() {
    const ver = overviewDistance(false);
    const k = MSPHERE_DRAW_MAX * MSPHERE_RE * 0.42;      // zie kaderMidden
    return Math.hypot(ORBIT_EENHEID.x * ver - k,
                      ORBIT_EENHEID.y * ver,
                      ORBIT_EENHEID.z * ver);
  }

  function draaipuntFactor(afstandTotAarde, vlak = vlakkeStand) {
    if (vlak) return 1;
    const ver = overviewTotAarde();
    if (!(ver > MSPHERE_PIVOT_NEAR)) return 1;
    const t = (afstandTotAarde - MSPHERE_PIVOT_NEAR) / (ver - MSPHERE_PIVOT_NEAR);
    /* LINEAIR EN NIET SMOOTHSTEP, en de reden is meetkundig.

       De hoek waaronder je de aarde náást de kijkas ziet, is het draaipunt
       GEDEELD DOOR de afstand. Houd je die verhouding constant, dan blijft de
       aarde tijdens het inzoomen op dezelfde plek in beeld staan en groeit hij
       alleen — geen zijwaartse zwaai. Lineair doet precies dat, want teller en
       noemer lopen dan samen op. Smoothstep loopt aan de verre kant vlak, dus
       daar krimpt het draaipunt trager dan de afstand en drijft de aarde nog
       een stukje verder naar de rand voordat hij terugkomt.

       GEMETEN, uitgedempt (OrbitControls staat op damping 0,1, dus één
       update() brengt hem maar een tiende van de weg — meten vóór het uitdempt
       geeft de stand van onderweg en niet die van straks):

         afstand  31671  19735  12325  7713  4835  3035  1906  1196   748
         aarde X  -0,475 -0,470 -0,459 -0,443 -0,417 -0,377 -0,318 -0,228 -0,089
         straal    0,011  0,019  0,031  0,053  0,087  0,144  0,233  0,374  0,592

       Monotoon naar het midden, nergens verder van de as dan waar hij begon,
       en aan het eind vult de aarde het beeld. */
    return Math.max(0, Math.min(1, t));
  }

  /* Het draaipunt in GSM-coördinaten: langs -X (van de zon af), geschaald met
     de factor hierboven. In GSM is de zonlijn per definitie +X, dus dit is
     dezelfde -0,42 x tekengrens als kaderMidden, alleen frame-onafhankelijk. */
  function draaipuntGsm(uit, afstandTotAarde) {
    const f = draaipuntFactor(afstandTotAarde);
    return uit.set(0, 0, -MSPHERE_DRAW_MAX * MSPHERE_RE * 0.42 * f);
  }

  /* WIE DE CAMERA HET LAATST VERZETTE, HEEFT GELIJK.

     Deze stelling BEZIT de camera niet; hij laat hem alleen met het GSM-frame
     meedraaien. Zodra iemand anders hem verplaatst — een vlucht bij een
     standwissel, globe.gl, een sleep die geen 'change' gaf — is diens stand de
     waarheid en moet die eerst ingelezen worden.

     Zonder dit ging het mis bij de EERSTE binnenkomst, en precies daar:
     `set()` roept `enter()` aan, dan `goToView(initialView)`, en die start een
     VLUCHT van 1100 ms. De viewwissel leest de stelling uit aan het BEGIN
     daarvan, dus met de camera nog in de aarde-stand. Kwam de feed een seconde
     later binnen, dan schreef `herbouw()` die verouderde stand terug en stond
     de camera weer op ~200 eenheden. Bij een orthografische projectie is de
     beeldhoogte afstand maal 0,9 — dus 1,8 Re, en je kijkt door een kijkgaatje
     naar een vorm van 90 Re. Gemeten: 2362 opgelichte pixels tegen 28.531 na
     een klik op de viewknop, die de vlucht opnieuw begon.

     Vandaar deze toets in plaats van een uitzondering voor de vlucht: de
     stelling hoeft niet te weten WIE de camera verzette, alleen DAT het
     gebeurde. */
  const _laatstGeschreven = new THREE.Vector3(NaN, NaN, NaN);
  const camIsVerzet = () =>
    !Number.isFinite(_laatstGeschreven.x) ||
    world.camera().position.distanceToSquared(_laatstGeschreven) > 1e-6;

  /* De wereldstand overnemen in GSM. Draait bij elke muisbeweging: wat de
     bezoeker doet is de waarheid, en dit is waar die waarheid binnenkomt. */
  function leesRig() {
    const cam = world.camera();
    _qInv.copy(_qFrame).invert();
    _camGsm.copy(cam.position).applyQuaternion(_qInv);
    _upGsm.copy(cam.up).applyQuaternion(_qInv);
    _targetGsm.copy(world.controls().target).applyQuaternion(_qInv);
    rigGevuld = true;
  }

  /* En terug. Het draaipunt wordt hier OPNIEUW BEREKEND en niet meegedraaid:
     hij hangt aan de zoomafstand, en die kan sinds de vorige keer veranderd
     zijn. `copy` en niet `set` — ensureTargetLock() blokkeert `set` en
     `setScalar` zolang deze state actief is, en dat is precies waarom het
     draaipunt hier überhaupt buiten de oorsprong kan liggen. */
  function schrijfRig() {
    if (!rigGevuld) return;
    const cam = world.camera(), ctl = world.controls();
    // Alleen in de VRIJE stand stuurt de zoom het draaipunt. In de vlakke
    // standen blijft staan wat de bezoeker zelf pande.
    if (!vlakkeStand) draaipuntGsm(_targetGsm, _camGsm.length());
    cam.position.copy(_camGsm).applyQuaternion(_qFrame);
    cam.up.copy(_upGsm).applyQuaternion(_qFrame).normalize();
    ctl.target.copy(_targetGsm).applyQuaternion(_qFrame);
    _laatstGeschreven.copy(cam.position);
    /* DE ORTHOGRAFISCHE MATRIX MOET HIER OPNIEUW, en dit is geen voorzorg maar
       de reparatie van drie klachten tegelijk.

       De beeldhoogte is afstand maal 0,9, dus hij verandert bij ELKE dolly en
       bij elke stap van een vlucht. Maar three.js bouwt `projectionMatrix`
       alleen als iemand `updateProjectionMatrix()` aanroept, en OrbitControls
       doet dat bij een perspectiefcamera niet — daar verandert de dolly de
       POSITIE en regelt het perspectief de rest vanzelf. Onze camera zegt nog
       steeds perspectief te zijn (zie borgProjectie), dus die aanroep blijft uit.

       Wat dat opleverde:
         · bij de eerste binnenkomst zette `set()` de matrix terwijl de camera
           nog in de aarde-stand stond — beeldhoogte 1,8 Re — waarna de vlucht
           hem naar 10.000 bracht zonder de matrix bij te werken. Je keek door
           een sleuf: gemeten 2362 opgelichte pixels, precies één beeldrij.
         · zoomen deed niets zichtbaars: de camera schoof wel op, het beeldveld
           niet.
       Een klik op een viewknop hielp, want die roept de projectie opnieuw op.

       Hier en niet in opBesturing: schrijfRig draait bij élke muisbeweging én
       bij elke herbouw, en dat is precies de verzameling momenten waarop de
       afstand veranderd kan zijn. */
    /* DE VOORWAARDE IS WIE DE PROJECTIE BEZIT, niet welke stand er getekend
       wordt. Sinds sessie 31 mengt de projectie over een overgang, en dan is er
       een tussengebied waarin `vlakkeStand` nog vals is terwijl de override er
       wél staat. Op `vlakkeStand` toetsen zou de matrix daar laten verlopen —
       dezelfde stilstaande matrix die dit blok nu juist repareert. */
    if (orthoOrigineel) cam.updateProjectionMatrix();
  }

  /* De haak op de besturing. Hij MOET er zijn zolang de state open staat:
     zonder terugleesstap zou de eerstvolgende herbouw de camera terugzetten
     naar waar hij stond vóór de bezoeker sleepte. */
  /* TIJDENS EEN OVERGANG LEEST DE STELLING ALLEEN.

     `schrijfRig()` berekent in de vrije stand het draaipunt opnieuw uit de
     zoomafstand en schrijft dat in `controls.target`. Dat is goed zolang de
     bezoeker aan het stuur zit, maar tijdens een vlucht zet die vlucht zélf een
     baan uit — en twee schrijvers op hetzelfde draaipunt geeft de boog van
     sessie 31 nooit waar hij hoort. Lezen mag wel: dan staat de stelling bij
     aankomst al op de goede stand. */
  function opBesturing() {
    if (!actief) return;
    leesRig();
    if (!overgangLoopt) schrijfRig();
  }

  /* ----------------------------------------------------------
     DE CURSOR, EN WAAROM HIJ HIER WOONT EN NIET IN DE FEED.

     De feed levert metingen; welke daarvan je BEKIJKT is een keuze van
     de weergave. Zet je de cursor in de feed, dan moet elke volgende
     bewoner van deze state (de tijdlijn, de veldlijnen, het paneel) zich
     bij een dataobject melden om te weten welk moment er getoond wordt —
     en dan is er geen enkele plek meer waar dat één ding is.

     `volgtNu` is het verschil tussen "de cursor staat toevallig op het
     laatste monster" en "de cursor HOORT op het laatste monster te
     staan". Zonder dat onderscheid trekt elke nieuwe meting de
     bezoeker terug naar nu, precies terwijl hij aan het kijken is.
  ---------------------------------------------------------- */
  let actief = false;
  let volgtNu = true;
  let cursor = 0;
  let laatste = null;
  let bewaardeKlok = null;
  let inZet = false;

  /* HET MACHGETAL, EN WAAROM HET HIER STAAT EN NIET IN Series.derive.

     `derive` rekent wat de LANES nodig hebben (pdyn, r0, sector); de mach
     heeft alleen de scene nodig, voor de boegschok. De keten is die van
     stateAt() in de PoC, inclusief de eis dat alle vier de grootheden er
     zijn: v en n voor de alfvénsnelheid, t voor de geluidssnelheid, bt
     voor het veld. Ontbreekt er één, dan is er geen mach — en geen
     boegschok, zie de noot in boundary-layer.js. */
  function machVan(s) {
    if (!Number.isFinite(s.v) || !Number.isFinite(s.n) ||
        !Number.isFinite(s.t) || !Number.isFinite(s.bt)) return null;
    const m = Core.Physics.magnetosonicMach({ v: s.v, n: s.n, t: s.t, bt: s.bt });
    return Number.isFinite(m) ? m : null;
  }

  /* Bouwen uit het monster onder de cursor. Apart van `enter()` omdat de
     klok hem ook aanroept: de zonrichting schuift, dus het frame draait mee.

     DE AANKONDIGING ZIT IN DE MANTEL EN NIET IN DE KERN, en dat is niet uit
     netheid. `herbouwKern` heeft twee uitgangen — met en zonder oppervlak — en
     de derde die er ooit bij komt zou de melding vergeten. Wie ernaar luistert
     (de uitlezing in index.html) krijgt hem dus per constructie bij élke bouw.

     ZONDER DEZE MELDING LOOPT DE UITLEZING ACHTER OP ZICHZELF. Gemeten: de
     inhaalslag van de wandklokvloer bouwt de veldlijnen opnieuw, maar niets
     vertelde het venster dat — de tally stond dan van een moment dat de r₀
     ernaast allang verlaten had. Precies het soort halve waarheid dat het hele
     paneel moet uitsluiten. */
  function herbouw() {
    const uit = herbouwKern();
    if (deps.onBuild) deps.onBuild(uit);
    return uit;
  }

  function herbouwKern() {
    const a = gsmAssen();
    boundary.orient(a.x, a.dip);
    /* De groep draagt de framerotatie al; die is dus ook de rotatie waarmee de
       camerastelling terug naar de wereld gaat. Eén bron, geen tweede
       berekening die ooit uit de pas kan lopen. */
    /* EERST KIJKEN OF IEMAND ANDERS DE CAMERA VERZETTE, en pas dan het frame
       bijwerken: de terugleesstap rekent met het OUDE frame, want de stand die
       er staat hoort daar nog bij. */
    if (actief && rigGevuld && camIsVerzet()) leesRig();
    _qFrame.copy(boundary.group.quaternion);
    if (actief && !overgangLoopt) schrijfRig();   // zie opBesturing()

    const rows = feed ? feed.rows() : null;
    const s = rows && rows[cursor] ? rows[cursor] : null;

    /* GEEN RIJ IS GEEN MOMENT. De veldlijnen hangen niet aan de zonnewind —
       IGRF en T89 rekenen zonder — maar ze hangen wél aan een TIJD, en zonder
       reeks is er geen moment om het veld op te evalueren. Verderop, na de
       grensberekening, wordt er wel gebouwd: dan is `laatste.r0` bekend en kan
       de tracer classificeren. */
    if (!s) veldlijnenUit();

    /* GEEN METING IS GEEN OPPERVLAK. `pdyn` is null zodra de dichtheid of de
       snelheid ontbreekt, en dan is r0 dat ook — zie de lange noot in
       data.js: null maal v maal v is nul in JavaScript, en standoff(0, bz)
       geeft 23 Re, een magnetosfeer twee keer zo groot als de grootste ooit
       gemeten, uit een getal dat niet bestaat. */
    if (!s || s.pdyn === null || !Number.isFinite(s.bz)) {
      boundary.setVisible(false);
      laatste = { ok: false, reden: rows ? 'no measurement at this moment'
                                         : 'no solar wind', rij: s };
      /* ZONDER GRENS BLIJVEN DE LIJNEN STAAN, in één neutrale inkt. Ze zeggen
         dan alleen nog waar het veld heen wijst en niets over open of dicht —
         `bounded: false` reist met de geometrie mee, en de laag kleurt daarop.
         Het alternatief, de lijnen weghalen, zou beweren dat er geen veld is. */
      if (s) bouwVeldlijnen(s, a, false);
      return laatste;
    }

    const mach = machVan(s);
    laatste = { ok: true, rij: s, mach, ...boundary.update(s.pdyn, s.bz, mach) };
    // NA update(), want die zet de boegschok zelf uit bij een ontbrekend
    // machgetal en zou de voorkeur anders overschrijven.
    pasVoorkeurenToe();
    boundary.setVisible(true);
    // NA `laatste`, want de spec leest er zijn grens uit: kleuren op de HUIDIGE
    // r0 terwijl de lijnen van een vorige spec zijn, toont een topologie die bij
    // andere lijnen hoort. Zie de noot bij `bounded` in Core.Build.run.
    bouwVeldlijnen(s, a, false);
    return laatste;
  }

  /* De cursor verzetten EN de scene meenemen.

     `clock.zet` loopt via refreshTimeUI -> updateSunUniform -> tik(), en dat
     is de bedoeling: één moment voor de hele scene, niet een tweede klok
     ernaast. `inZet` zorgt dat die tik() niet ook nog eens bouwt — dan zou
     elke stap het oppervlak twee keer opbouwen, en tijdens het afspelen is
     dat het verschil tussen soepel en niet. */
  function zetCursor(i) {
    const rows = feed ? feed.rows() : null;
    if (!rows || !rows.length) return null;
    cursor = Math.max(0, Math.min(rows.length - 1, Math.round(i)));
    if (clock) {
      inZet = true;
      try {
        /* OP HET NIEUWSTE AANGEKOMEN MONSTER ZETTEN WE ECHT "NU", en niet de
           tijd van dat monster. Dat scheelt minder dan een minuut, maar het is
           het verschil tussen `bijNu()` waar en onwaar — en daaraan hangt of de
           nowcast-lagen (de aurora voorop) open staan of op een tijdslot. Zie de
           noot bij clock.zetNu in index.html. */
        if (cursor === feed.arrivedEnd() && clock.zetNu) clock.zetNu();
        else clock.zet(new Date(rows[cursor].time));
      } finally { inZet = false; }
    }
    return herbouw();
  }

  /* De feed heeft iets nieuws. Volgt de cursor "nu", dan schuift hij mee naar
     het laatste AANGEKOMEN monster — niet naar het laatste monster, want de
     staart daarna is nog onderweg. */
  function nieuweData() {
    if (!actief) return;
    const i = feed ? feed.arrivedEnd() : -1;
    if (volgtNu && i >= 0) { zetCursor(i); return; }
    herbouw();
  }

  const definition = {
    body: 'msphere-on',
    label: 'Magnetosphere',
    // Een holte om een punt, met de wind van links: dat is wat deze state
    // toont, en het onderscheidt zich van Space (een baan om een middelpunt)
    // en van de zon (een schijf met stralen).
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round"><circle cx="14" cy="12" r="2.5" fill="currentColor" ' +
          'stroke="none"/><path d="M9 4.5a9.5 9.5 0 0 0 0 15"/>' +
          '<path d="M2.5 8h3M2.5 12h3M2.5 16h3"/></svg>',
    views,
    /* DE VRIJE STAND IS DE BINNENKOMST (sessie 31, Terry). Hij stond op
       `meridian` omdat de doorsnede het beeld is dat de vorm VERKLAART. Maar dat
       is een tweede stap: eerst moet je zien dat er een holte om de aarde ligt,
       en daarvoor kijk je eromheen. Bovendien is het nu de eerste optie in de
       gleuf bovenin, en een eerste optie die niet de beginstand is, leest als
       een fout. */
    initialView: 'orbit',
    camera: () => views.orbit.camera(),

    /* DE OVERGANG IS EEN EIGENSCHAP VAN DEZE STATE, niet van de navigatie.
       core/view-state.js weet dat er een vlucht loopt en hoe ver hij is; wat
       er tijdens die vlucht met projectie, hemel, raster en grensvlak moet
       gebeuren, weet alleen deze state. Zie het blok "DE OVERGANG TUSSEN TWEE
       STANDEN" verderop. States zonder dit veld — `sun`, `space` — vliegen
       precies zoals ze deden. */
    transition: { begin: overgangBegin, step: overgangStap, end: overgangEind },

    enter() {
      // EERST de vlag. `clock.zet` hieronder tikt via updateSunUniform terug
      // naar tik(), en die doet niets zolang de state niet actief heet te zijn.
      actief = true;
      volgtNu = true;
      layers.eventsOff();
      // Zon en maan staan op hun echte plek en die ligt BINNEN de magnetopauze;
      // zie de noot bij environmentOff in index.html.
      if (layers.environmentOff) layers.environmentOff();
      // Waar de bezoeker stond, vóór we de klok overnemen. Onthouden en niet
      // "terug naar nu" bij vertrek: wie in 1985 stond te kijken hoort daar
      // terug te komen, net zoals environment.restore() per object onthoudt.
      if (clock) bewaardeKlok = clock.lees();
      // De stelling wordt pas gevuld door de eerste view die view-state.js
      // direct hierna opvraagt; tot dan mag schrijfRig() niets doen.
      rigGevuld = false;
      _laatstGeschreven.set(NaN, NaN, NaN);
      world.controls().addEventListener('change', opBesturing);
      /* DE HEMEL GAAT UIT IN DE HELE STATE (sessie 33, Terry).

         Hij stond alleen uit in de twee doorsnedes, en de reden dáár was dat een
         doorsnede geen uitzicht is. In de vrije stand leek een sterrenveld dus
         gewoon te kloppen — tot je gaat afspelen. Dan blijkt hij te VEGEN, en
         Terry las dat als een achtergrond die animeert.

         Wat er werkelijk beweegt is de camera. De camerastelling woont sinds
         sessie 30 in het GSM-frame: bij afspelen staat de holte stil en draait de
         aarde erin, dus de camera draait in WERELDcoördinaten mee met de zonlijn.
         De sterren staan stil — globe.gl's achtergrondschil beweegt niet — en
         precies daarom vegen ze langs.

         Een sterrenveld dat beweegt terwijl de bezoeker stilstaat, zegt dat híj
         draait. Dat is onwaar, en het is niet te repareren door de hemel mee te
         draaien: dan staan de sterren niet meer waar ze horen. Dus uit. De camera
         is hier aan de zonlijn gebonden en niet aan de hemel; wat erachter hoort
         te staan is niets. */
      if (layers.skyOff) layers.skyOff();
      if (layers.auroraOn) layers.auroraOn();
      if (feed) feed.setEnabled(true);
      // De reeks kan er al liggen van een vorig bezoek — de feed houdt hem
      // vast als de poort dichtgaat. Is hij er nog niet, dan bouwt `herbouw`
      // niets en meldt hij dat; de feed roept ons terug zodra hij binnen is.
      //
      // EERST oriënteren, DAN pas een view berekenen: view-state.js vraagt
      // direct na `enter()` om `views.meridian.camera()`, en die leest het
      // frame dat hier gezet wordt. Andersom staat de camera op de oriëntatie
      // van de vórige keer. Dezelfde volgorde als in space.js, en om dezelfde
      // reden daar één keer misgegaan.
      nieuweData();
      if (!feed) herbouw();
    },

    exit() {
      // Ook hier eerst de vlag, en om de spiegelreden: `clock.herstel`
      // hieronder tikt terug, en die tik hoort niets meer te bouwen.
      actief = false;
      world.controls().removeEventListener('change', opBesturing);
      huidigeView = null;
      if (grid) grid.setPlane(null);
      if (scale) scale.setPlane(null);
      if (boundary.setOutline) boundary.setOutline(null);
      vlakkeStand = false;
      zetSleepgedrag(false);
      /* ONDERWEG OF NIET: alles terug naar de ruststand. Verlaat de bezoeker de
         state halverwege een wissel, dan is er geen bestemming meer om naartoe
         te vervagen — en een half vervaagde grens of een half gemengde
         projectie die blijft staan, neemt hij mee naar de aarde. */
      overgangAfbreken();
      /* De tegenhanger van de `skyOff()` in enter(). Hij stond hier al vóór
         sessie 33, toen alleen de doorsnedes de hemel uitzetten: verlaat je de
         state vanuit Meridian, dan zette niemand hem terug en kwam je op een
         aarde in het zwart. Nu is de state ZELF de schakelaar en is dit de enige
         plek waar hij weer aangaat. */
      if (layers.skyRestore) layers.skyRestore();
      if (layers.atmosphereRestore) layers.atmosphereRestore();
      boundary.setVisible(false);
      veldlijnenUit();
      if (feed) feed.setEnabled(false);
      if (clock && bewaardeKlok) { clock.herstel(bewaardeKlok); bewaardeKlok = null; }
      if (layers.environmentRestore) layers.environmentRestore();
      layers.eventsRestore();
      // NA eventsRestore: die zet `active.aurora` terug op de keuze van de
      // bezoeker, en pas dan kan de poort van de zwaarste bron van de app op
      // die keuze gezet worden. Andersom leest hij de stand van deze state.
      if (layers.auroraRestore) layers.auroraRestore();
    }
  };

  /* Loopt mee met de klok, via dezelfde aanroep die zon en maan bijwerkt —
     geen tweede klok. Anders dan space.js wordt hier WEL opnieuw georiënteerd:
     de zonrichting is hier het onderwerp en niet de achtergrond.

     DE POORT IS `actief` EN NIET `boundary.group.visible`, en dat is sinds
     sessie 30 een noodzaak en geen smaak. Het oppervlak gaat nu uit zodra er
     geen meting is; met de zichtbaarheid als poort klemt dat vast — onzichtbaar
     dus geen herbouw, geen herbouw dus nooit meer zichtbaar. Een vlag die twee
     dingen tegelijk betekent, breekt zodra ze uit elkaar lopen. */
  function tik() {
    if (!actief || inZet) return;
    herbouw();
  }

  /* ==========================================================
     DE OVERGANG TUSSEN TWEE STANDEN (sessie 31).

     Een standwissel was tot deze sessie twee dingen tegelijk. De POSITIE werd
     geanimeerd over 1100 ms; al het andere klapte om op frame 0. GEMETEN, vlak
     vóór en vlak ná `goToView()` en dus voordat er iets bewogen was:

       Meridian -> Top        `camera.up` draaide 90,0 graden
       3D orbit -> Meridian   projectie perspectief -> orthografisch, `up` 15,4
                              graden, beeldhoogte 66 Re waar de bestemming er
                              90 heeft

     Dat leest als een flikker gevolgd door een beweging, en niet als een
     beweging. Dit blok verdeelt alles wat niet vanzelf meebeweegt over die
     1100 ms, langs de voortgang `e` die de vlucht aanreikt.

     DRIE SOORTEN VERANDERING, EN ZE VRAGEN ELK IETS ANDERS.

       doorlopend    positie, draaipunt, "omhoog" en de PROJECTIE. Die lopen
                     mee met `e`; zie de boog in flyCamera() en de menging in
                     borgProjectie().
       niet te mengen   de geometrie van het grensvlak (142 lijnstukken tegen
                     4560), het vlak van het raster, en de hemel. Daar zit geen
                     tussenvorm tussen. Wat er WEL tussen zit is hoeveel je
                     ervan ziet: de inkt zakt naar nul, de wissel gebeurt in dat
                     dal, en de inkt komt weer op.
       onzichtbaar   het sleepgedrag en de zoomgrenzen. Die mogen meteen.

     HET DAL LIGT OP HET SNELSTE PUNT VAN DE BEWEGING. De ease is power2.inOut,
     dus bij e = 0,5 gaat de camera het hardst. Een wissel die je toch niet kunt
     mengen, hoort daar te vallen en niet aan het begin of het eind, waar het
     beeld bijna stilstaat.

     EN HIJ VERVAAGT ALLEEN WAT ER ECHT WISSELT. Meridian -> Top houdt dezelfde
     projectie, dezelfde hemel en dezelfde omtrek; alleen het rastervlak
     wisselt. Zou de vervaging onvoorwaardelijk zijn, dan dook een grensvlak dat
     nergens om vraagt halverwege weg — precies de flikker die dit blok
     opruimt, alleen dan zelfgemaakt.
  ========================================================== */
  /* De halve breedte van het dal, in vluchtvoortgang. Buiten [0,22 .. 0,78]
     staat de inkt vol; daarbinnen zakt hij met een smoothstep naar nul, dus
     nergens een knik. */
  const MSPHERE_DAL = 0.28;

  let overgangLoopt = false;
  let mengVan = 0, mengNaar = 0;
  let naarView = null, naarVlak = false;
  let naarRaster = null;
  /* `hemelWisselt` stond hier tot sessie 33. De hemel wisselt niet meer per
     stand — hij gaat uit bij `enter()` en komt terug bij `exit()` — dus die vlag
     zou altijd onwaar zijn, en een tak die nooit loopt is een tak die de
     volgende lezer laat denken dat er iets gebeurt. */
  let grensWisselt = false, rasterWisselt = false;
  let gewisseld = false;

  const dalZicht = (e) => {
    const t = Math.min(1, Math.abs(e - 0.5) / MSPHERE_DAL);
    return t * t * (3 - 2 * t);
  };

  /* Wat er NU zichtbaar aan raster staat. `grid.plane()` onthoudt het laatst
     gebouwde vlak ook als de groep verborgen is — dat is de optimalisatie die
     een wissel heen en terug geen twee keer laat bouwen. Voor de vraag "wisselt
     er iets" telt alleen wat je ziet. */
  const zichtbaarRaster = () =>
    (grid && grid.group.visible ? grid.plane() : null);

  /* Naast grensWisselt en rasterWisselt; zie overgangBegin. */
  let veldWisselt = false;

  function overgangBegin(vanNaam, naarNaam) {
    if (!actief) return;
    const v = views[naarNaam];
    naarView = naarNaam;
    naarVlak = !!(v && v.flat);
    naarRaster = naarVlak && wilRaster ? naarNaam : null;

    /* DE MENGING BEGINT WAAR HIJ NU STAAT EN NIET BIJ NUL. Klikt de bezoeker
       halverwege een wissel op een derde stand, dan is de projectie op dat
       moment half gemengd — en dáár hoort de nieuwe overgang te beginnen.
       Anders springt hij eerst terug naar zuiver perspectief. */
    mengVan = mengE;
    mengNaar = naarVlak ? 1 : 0;
    if (mengVan > 0 || mengNaar > 0) {
      borgProjectie();
      /* METEEN EN NIET IN HET DAL. De atmosfeer mag niet mee de menging in —
         zie de lange noot bij atmosphereOff in index.html. En dat kan hier,
         want wat je verliest is een dunne gloed om een bol die een honderdste
         van het beeld beslaat; wat je ervoor terugkrijgt is dat 78 % van het
         scherm niet zwart wordt. */
      if (layers.atmosphereOff) layers.atmosphereOff();
    }

    grensWisselt  = (naarVlak ? naarNaam : null) !== boundary.outline();
    rasterWisselt = naarRaster !== zichtbaarRaster();
    /* De veldlijnen wisselen alleen als hun ZADEN wisselen, en dat is niet bij
       elke standwissel zo: Meridian zaait op twee lengtegraden, de andere twee
       standen op acht. Orbit -> Top verandert er dus niets aan, en dan hoort er
       ook niets weg te vervagen. */
    veldWisselt   = !!fieldlines && wilVeldlijnen &&
                    zaadSoort(naarNaam) !== zaadSoort(huidigeView);
    gewisseld = false;
    overgangLoopt = true;

    // Onzichtbaar, dus meteen: wie tijdens de vlucht sleept, doet dat al in de
    // stand waar hij heen gaat.
    zetSleepgedrag(naarVlak);
  }

  /* De harde wissels, alle vier op hetzelfde moment. Ze staan bij elkaar omdat
     ze bij elkaar horen: dit is het frame waarop het beeld van soort verandert,
     en een van de vier die eerder of later gaat, is een tweede omslagpunt. */
  function wisselInHetDal() {
    vlakkeStand = naarVlak;
    huidigeView = naarView;
    /* Het raster vervangt de sterren, en het vlak volgt de kijkrichting:
       Meridian kijkt langs GSM Y en heeft dus het X-Z-vlak, Top kijkt langs
       GSM Z en heeft X-Y. In de vrije stand geen van beide — een raster is
       een doorsnede en een perspectiefbeeld heeft er geen. */
    pasRasterToe();
    /* Alleen de omtrek in de vlakke standen: bij een omwentelingsoppervlak dat
       je loodrecht bekijkt ÍS de doorsnede de omtrek, en het volle net maakt er
       weer een driedimensionaal ding van. Zie de noot in boundary-layer.js. */
    if (boundary.setOutline(naarVlak ? naarView : null)) herbouw();
    /* En de zaden. `huidigeView` staat hierboven al op de nieuwe stand, dus
       `bouwVeldlijnen` leest de goede.

       GEFORCEERD, EN DAT IS HET PUNT VAN DIE VLAG. De wandklokvloer bestaat om
       een AFSPEELLUS te temperen — tien herbouwen per seconde die je toch niet
       kunt lezen. Een standwissel is geen tijdstap: hij komt op menselijk tempo
       en de bezoeker heeft er zojuist zelf op geklikt. Gemeten zonder deze
       vlag: zes wissels achter elkaar hielden alle zes de zaden van de eerste. */
    if (veldWisselt) {
      const rows = feed ? feed.rows() : null;
      bouwVeldlijnen(rows && rows[cursor] ? rows[cursor] : null, gsmAssen(), true);
    }
  }

  function overgangStap(e) {
    if (!overgangLoopt) return;
    mengE = mengVan + (mengNaar - mengVan) * e;
    if (orthoOrigineel) world.camera().updateProjectionMatrix();

    const zicht = dalZicht(e);
    if (grensWisselt && boundary.setFade) boundary.setFade(zicht);
    if (rasterWisselt && grid && grid.setFade) grid.setFade(zicht);
    if (rasterWisselt && scale) scale.setFade(zicht);
    if (veldWisselt && fieldlines) fieldlines.setFade(zicht);

    if (!gewisseld && e >= 0.5) { wisselInHetDal(); gewisseld = true; }
  }

  function overgangEind() {
    if (!overgangLoopt) return;
    // Een vlucht die nooit voorbij het midden kwam — REDUCED_MOTION, of een
    // view die zonder animatie gezet wordt — heeft de wissel nog tegoed.
    if (!gewisseld) { wisselInHetDal(); gewisseld = true; }
    mengE = mengNaar;
    overgangLoopt = false;              // vóór schrijfRig: die mag weer schrijven
    if (mengE <= 0) {
      laatProjectieLos();
      // Zuiver perspectief: nu pas mag de atmosfeer terug.
      if (layers.atmosphereRestore) layers.atmosphereRestore();
    } else if (orthoOrigineel) world.camera().updateProjectionMatrix();
    if (boundary.setFade) boundary.setFade(1);
    if (grid && grid.setFade) grid.setFade(1);
    if (scale) scale.setFade(1);
    if (fieldlines) fieldlines.setFade(1);
    veldWisselt = false;
    // De aangekomen stand is de nieuwe waarheid voor de camerastelling.
    leesRig();
    schrijfRig();
  }

  /* Alles terug naar de ruststand, zonder animatie. Voor `exit()`: daar is er
     geen bestemming meer om naartoe te vervagen. */
  function overgangAfbreken() {
    overgangLoopt = false;
    gewisseld = true;
    grensWisselt = rasterWisselt = veldWisselt = false;
    naarView = null; naarRaster = null; naarVlak = false;
    mengVan = mengNaar = 0;
    if (boundary.setFade) boundary.setFade(1);
    if (grid && grid.setFade) grid.setFade(1);
    if (scale) scale.setFade(1);
    if (fieldlines) fieldlines.setFade(1);
    laatProjectieLos();
  }

  return { definition, views: Object.keys(views), tik, nieuweData,
           herbouw, laatsteBouw: () => laatste, gsmAssen,
           /* De veldlijnuitkomst, voor de uitlezing (blok R). Draagt de hele
              `Core.Build.run`-teruggave plus wat de tekenlaag ervan kwijt kon —
              `tally`, `polarCap` en `horizon` komen NERGENS anders vandaan. */
           laatsteVeld: () => laatsteVeld,
           /* Voor het meetluik. De overgang is per constructie niet met het oog
              te toetsen — hij duurt 1100 ms en het enige wat telt is dat er
              nergens een sprong in zit. Dus moet elke tussenstand op te vragen
              zijn: `mengE` is de projectiemenging (0 perspectief, 1 ortho) en
              `overgang()` zegt of er er een loopt. */
           mengE: () => mengE,
           overgang: () => overgangLoopt,
           vlakkeStand: () => vlakkeStand,
           // Voor de transportbalk (B3c) en voor het meetluik. `volgtNu` is
           // schrijfbaar: wie zelf schuift, volgt niet meer.
           zetCursor,
           /* De vier schakelaars van het paneel. Ze zetten een VOORKEUR en niet
              de zichtbaarheid: wat er werkelijk staat volgt uit de voorkeur én
              uit wat er te tekenen valt. */
           setPart(naam, aan) {
             if (naam === 'magnetopause') wilMagnetopauze = !!aan;
             else if (naam === 'bowshock') wilBoegschok = !!aan;
             else if (naam === 'grid') { wilRaster = !!aan; pasRasterToe(); return; }
             else if (naam === 'fieldlines') {
               wilVeldlijnen = !!aan;
               /* AANZETTEN IS BOUWEN, en niet alleen zichtbaar maken: bij het
                  uitzetten is de sleutel gewist, dus er staat niets klaar. De
                  aanroep gaat langs `herbouw` en niet rechtstreeks, zodat er
                  één weg naar een verse geometrie blijft. */
               if (actief) herbouw(); else veldlijnenUit();
               return;
             }
             pasVoorkeurenToe();
           },
           cursor: () => cursor,
           volgtNu: (v) => (v === undefined ? volgtNu : (volgtNu = !!v)),
           actief: () => actief };
}
