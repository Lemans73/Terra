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

export function createMagnetosphereState(THREE, deps) {
  const { world, boundary, grid, layers, Core, feed, clock } = deps;

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
  const overviewDistance = () => fitDistance(MSPHERE_DRAW_MAX * MSPHERE_RE * 0.55);

  const bounds = () => ({
    min: MSPHERE_RE * 1.6,                   // net buiten de bol
    max: fitDistance(90 * MSPHERE_RE)        // ruim voorbij de getekende staart
  });

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

  function targetFrom(direction, distance, up, midden) {
    const b = bounds();
    const doel = midden ? midden.clone() : origin.clone();
    return { pos: direction.clone().multiplyScalar(distance).add(doel), target: doel,
             min: b.min, max: Math.max(b.max, distance * 1.6),
             up: up ? up.clone() : null };
  }

  /* DE GSM-BASIS IN TERRA'S ASSEN.

     X naar de zon, Y = M x X, Z = X x Y — de definitie uit
     Core.Frames.gsmBasis, maar hier in Terra-coördinaten omdat de camera
     daarin staat. De omzetting (x,y,z) -> (y,z,x) zit in `pocNaarTerra`;
     zie daar waarom dat een rotatie is en geen spiegeling. */
  function gsmAssen() {
    const d = moment();
    const coeff = Core.IGRF.atYear(Core.Frames.decimalYear(d));
    const dip = Core.IGRF.dipole(coeff);

    pocNaarTerra(THREE, Core.Frames.sunGeo(d), _sun).normalize();
    pocNaarTerra(THREE, Core.geoPoint(dip.northLat, dip.northLon, 1), _dip).normalize();

    _y.crossVectors(_dip, _sun);
    if (_y.lengthSq() < 1e-12) _y.set(0, 1, 0);
    _y.normalize();
    _z.crossVectors(_sun, _y).normalize();
    // `dip` gaat mee terug in plaats van als bijwerking in `_dip` te blijven
    // staan: een aanroeper die daarop leunt, breekt zodra de volgorde wijzigt.
    return { x: _sun, y: _y, z: _z, dip: _dip };
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
  const LOCK_NOTE = 'Locked to the GSM frame — pan and zoom still work.';

  /* EEN LANGE LENS MAAKT VAN EEN AANZICHT EEN DOORSNEDE.

     De vaste standen kijken loodrecht op een vlak, maar met de gewone
     beeldhoek van 50 graden loopt de staart zichtbaar naar het verdwijnpunt
     en klapt de ring om de neus open tot een ovaal. Je ziet dan een foto van
     een driedimensionaal ding, terwijl het beeld dat de magnetosfeer
     verklaart een DOORSNEDE is — de plaat uit elk leerboek, en het beeld dat
     de PoC op zijn 2D-canvas geeft.

     Twaalf graden is geen orthografische camera maar komt er dichtbij: de
     perspectiefvertekening loopt terug met ongeveer de verhouding van de
     tangens, dus van 50 naar 12 graden is ruim vier keer vlakker. De camera
     schuift evenredig naar achteren omdat fitDistance() de beeldhoek zelf
     leest — daar hoeft dus niets voor bijgesteld te worden.

     Waarom geen echte orthografische camera: die is van globe.gl en wordt
     door de hele app gedeeld (labels, de zonvlucht, de ruimtestand rekenen
     allemaal met zijn beeldhoek). Een tweede cameratype erbij zetten is een
     verbouwing; een andere brandpuntsafstand is een getal. */
  const MSPHERE_FLAT_FOV = 12;
  let bewaardeFov = null;

  function zetLens(vlak) {
    const cam = world.camera();
    if (vlak) {
      if (bewaardeFov === null) bewaardeFov = cam.fov;
      cam.fov = MSPHERE_FLAT_FOV;
    } else if (bewaardeFov !== null) {
      cam.fov = bewaardeFov;
      bewaardeFov = null;
    } else return;
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
       Meridian zet de dipoolkant omhoog, Top de flank. */
    meridian: {
      locked: true, flat: true, label: 'Meridian', note: LOCK_NOTE,
      camera: () => {
        // DE LENS EERST. fitDistance() leest de beeldhoek, dus zet je hem pas
        // ná de berekening, dan hoort de afstand bij de vorige lens en staat
        // het kader er vier keer naast tot de volgende viewwissel.
        zetLens(true);
        // Loodrecht op het X-Z-vlak is de Y-as: van daaruit zie je dat vlak
        // op ware grootte, met de dipoolas-kant omhoog.
        const a = gsmAssen();
        return targetFrom(a.y.clone(), overviewDistance(), a.z, kaderMidden(a.x));
      }
    },
    top: {
      locked: true, flat: true, label: 'Top', note: LOCK_NOTE,
      camera: () => {
        // Van boven op het X-Y-vlak. Omhoog moet IN dat vlak liggen — de
        // Z-as zou samenvallen met de kijkrichting en dat is gedegenereerd.
        //
        // MIN Y EN NIET PLUS: met +y staat de zon rechts en in Meridian links,
        // en dan wisselt de leesrichting bij het omschakelen tussen twee standen
        // van hetzelfde onderwerp. GEMETEN als schermhoek van de zonlijn: +y gaf
        // 0 graden, -y geeft 180, gelijk aan Meridian. De PoC houdt dezelfde
        // conventie aan (+X links, zie zijn schaaloverlay).
        zetLens(true);                       // zie de noot bij meridian
        const a = gsmAssen();
        return targetFrom(a.z.clone(), overviewDistance(), a.y.clone().negate(), kaderMidden(a.x));
      }
    },
    orbit: {
      locked: false, label: '3D orbit', note: 'Free orbit.',
      camera: () => {
        // De vrije stand houdt de gewone beeldhoek: daar kijk je juist RÓND de
        // vorm, en dan is perspectief wat de diepte draagt.
        zetLens(false);
        // Schuin op de zonlijn: de neus in beeld én de staart herkenbaar.
        const a = gsmAssen();
        _dir.copy(a.x).multiplyScalar(0.85)
            .add(_z.copy(a.z).multiplyScalar(0.45))
            .add(_y.copy(a.y).multiplyScalar(0.5)).normalize();
        return targetFrom(_dir.clone(), overviewDistance(), null, kaderMidden(a.x));
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
  const _qFrame = new THREE.Quaternion();
  const _qInv = new THREE.Quaternion();
  const _tmp = new THREE.Vector3();
  let rigGevuld = false;

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
  function draaipuntFactor(afstandTotAarde) {
    const ver = overviewDistance();
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

  /* De wereldstand overnemen in GSM. Draait bij elke muisbeweging: wat de
     bezoeker doet is de waarheid, en dit is waar die waarheid binnenkomt. */
  function leesRig() {
    const cam = world.camera();
    _qInv.copy(_qFrame).invert();
    _camGsm.copy(cam.position).applyQuaternion(_qInv);
    _upGsm.copy(cam.up).applyQuaternion(_qInv);
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
    cam.position.copy(_camGsm).applyQuaternion(_qFrame);
    cam.up.copy(_upGsm).applyQuaternion(_qFrame).normalize();
    ctl.target.copy(draaipuntGsm(_tmp, _camGsm.length()).applyQuaternion(_qFrame));
  }

  /* De haak op de besturing. Hij MOET er zijn zolang de state open staat:
     zonder terugleesstap zou de eerstvolgende herbouw de camera terugzetten
     naar waar hij stond vóór de bezoeker sleepte. */
  function opBesturing() { if (actief) { leesRig(); schrijfRig(); } }

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
     klok hem ook aanroept: de zonrichting schuift, dus het frame draait mee. */
  function herbouw() {
    const a = gsmAssen();
    boundary.orient(a.x, a.dip);
    /* De groep draagt de framerotatie al; die is dus ook de rotatie waarmee de
       camerastelling terug naar de wereld gaat. Eén bron, geen tweede
       berekening die ooit uit de pas kan lopen. */
    _qFrame.copy(boundary.group.quaternion);
    if (actief) schrijfRig();

    const rows = feed ? feed.rows() : null;
    const s = rows && rows[cursor] ? rows[cursor] : null;

    /* GEEN METING IS GEEN OPPERVLAK. `pdyn` is null zodra de dichtheid of de
       snelheid ontbreekt, en dan is r0 dat ook — zie de lange noot in
       data.js: null maal v maal v is nul in JavaScript, en standoff(0, bz)
       geeft 23 Re, een magnetosfeer twee keer zo groot als de grootste ooit
       gemeten, uit een getal dat niet bestaat. */
    if (!s || s.pdyn === null || !Number.isFinite(s.bz)) {
      boundary.setVisible(false);
      laatste = { ok: false, reden: rows ? 'no measurement at this moment'
                                         : 'no solar wind', rij: s };
      return laatste;
    }

    const mach = machVan(s);
    laatste = { ok: true, rij: s, mach, ...boundary.update(s.pdyn, s.bz, mach) };
    boundary.setVisible(true);
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
    initialView: 'meridian',
    camera: () => views.meridian.camera(),

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
      world.controls().addEventListener('change', opBesturing);
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
      if (grid) grid.setPlane(null);
      zetLens(false);
      /* ONVOORWAARDELIJK, en niet alleen wanneer we uit een vlakke stand komen.
         Verlaat je de state vanuit Meridian, dan is de hemel daar uitgezet en
         zet niemand hem terug — je komt dan terug op een aarde in het zwart.
         Gemeten, en het is precies de faalvorm die je niet ziet als je alleen
         via de vrije stand test: dáár staan de sterren toch al aan. */
      if (layers.starsRestore) layers.starsRestore();
      boundary.setVisible(false);
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

  /* Wordt door index.html aangeroepen bij elke viewwissel (viewStates.onChange).
     De KENNIS staat hier en niet daar: welke stand plat hoort te zijn is een
     eigenschap van deze state, en index.html hoort daar geen lijst van te
     onderhouden. */
  function viewGewisseld(naam) {
    if (!actief) return;
    const v = views[naam];
    // De lens is al gezet door view.camera() hierboven; hier gaat het om wat
    // ERNA komt. De stand die goToView zojuist neerzette is de nieuwe waarheid.
    leesRig();
    if (layers.starsOff && layers.starsRestore) {
      if (v && v.flat) layers.starsOff(); else layers.starsRestore();
    }
    /* Het raster vervangt de sterren, en het vlak volgt de kijkrichting:
       Meridian kijkt langs GSM Y en heeft dus het X-Z-vlak, Top kijkt langs
       GSM Z en heeft X-Y. In de vrije stand geen van beide — een raster is
       een doorsnede en een perspectiefbeeld heeft er geen. */
    if (grid) grid.setPlane(v && v.flat ? naam : null);
  }

  return { definition, views: Object.keys(views), tik, nieuweData, viewGewisseld,
           herbouw, laatsteBouw: () => laatste, gsmAssen,
           // Voor de transportbalk (B3c) en voor het meetluik. `volgtNu` is
           // schrijfbaar: wie zelf schuift, volgt niet meer.
           zetCursor,
           cursor: () => cursor,
           volgtNu: (v) => (v === undefined ? volgtNu : (volgtNu = !!v)),
           actief: () => actief };
}
