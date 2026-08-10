/* ============================================================
   TERRA — Space · het zonnestelsel om de zon
   ------------------------------------------------------------
   Een state, geen laag. Hij ORKESTREERT: hij zet de gebeurtenislagen uit,
   verbergt de aarde en alles wat aan haar vastzit, zet de banen aan en
   biedt vier camerastanden. Wat hij zelf tekent is niets.

   DAT ONDERSCHEID IS DE HELE OPZET. De magnetosfeer en de instrumenten
   op L1 en L2 horen hier later naast te passen zonder dat dit bestand
   opengebroken wordt — de volgende bewoner meldt zich aan via `layers`,
   hij wordt hier niet ingebouwd.

   ------------------------------------------------------------
   WAT ER IN SESSIE 23 VERANDERDE, EN WAAROM
   ------------------------------------------------------------
   Deze state was GEOCENTRISCH: zeven planeten op schillen rond de
   aardbol. Meetkundig klopte dat tot op 5e-14, maar het beeld leest als
   een model van het zonnestelsel, en dat is het niet. Terry, aan het
   eind van sessie 22: "het zonnestelsel draait natuurlijk niet rondom
   de aarde maar de zon."

   De ontsnapping uit "de aarde staat op (0,0,0)" is niet de scene
   verbouwen — globe.gl's bol, de shader, de terminator en elke laag
   gaan van die oorsprong uit en die is daar niet weg te halen. De
   ontsnapping is: TOON DE GLOBE NIET. In een heliocentrisch beeld heb
   je geen aardbol nodig, alleen een stip in een baan.

   De geocentrische projectie is niet weggegooid: die staat nu in de
   gewone weergave, als schakelbare laag. Dezelfde planeet, twee
   stelsels, en de knop ertussen is de uitleg.

   ------------------------------------------------------------
   DE ORIENTATIE WORDT BEVROREN, en dat is het belangrijkste detail.

   `eclipticPole()` draait in Terra's aardvaste frame mee met de
   sterrentijd — 15,041 graden per uur. Voor de geocentrische weergave
   is dat fysiek juist: sta je boven de ecliptica-pool, dan draait de
   aarde onder je door. Voor een HELIOCENTRISCH beeld is het onzin: het
   zonnestelsel zou dan 88 keer sneller bewegen dan Mercurius (0,17
   graden per uur) en 366 keer sneller dan de aarde (0,041), en het
   beeld toont vrijwel uitsluitend de aardrotatie. Precies de fout die
   het hemelspoor met een bevroren sterrentijd vermijdt.

   Dus: bij binnenkomst één keer orienteren op het ecliptica-frame zoals
   dat op DAT moment staat — wat de overgang vanuit de aarde-weergave
   naadloos maakt — en daarna niet meer. De camerastanden lezen daarom
   `orbits.pole()` en `orbits.vernal()` uit de groep, niet uit de klok.
   ============================================================ */

export function createSpaceState(THREE, deps) {
  const { world, orbits, layers } = deps;

  const _dir = new THREE.Vector3();
  const _side = new THREE.Vector3();
  const _tilt = new THREE.Vector3();
  const origin = new THREE.Vector3(0, 0, 0);

  const moment = () => (deps.moment ? deps.moment() : new Date());

  /* ----------------------------------------------------------
     HOE VER MOET DE CAMERA STAAN?

     `fitDistance(S) = S / sin(min(halfV, halfH))`, met
     `halfH = atan(aspect * tan(halfV))` — de formule uit sessie 14.
     Op een telefoon in portret vraagt hetzelfde beeld ruim twee keer
     de afstand van een breed scherm, dus dit is geen constante.
  ---------------------------------------------------------- */
  function fitDistance(S) {
    const cam = world.camera();
    const halfV = (cam.fov / 2) * Math.PI / 180;
    const halfH = Math.atan(cam.aspect * Math.tan(halfV));
    return S / Math.sin(Math.min(halfV, halfH));
  }

  // Neptunus' baan plus de bol erop, zodat hij niet op de rand plakt.
  const overviewDistance = () =>
    fitDistance(orbits.config.scaleOuter + orbits.config.bodyRadius * 2);

  /* De ondergrens is hier NIET `zoomMinDistance` (155). Dat getal bestaat
     omdat diep inzoomen op de aardbol zwarte clipping geeft — en die bol
     is in deze state verborgen. Halverwege Mercurius' baan mag je dus
     gerust komen; dat is precies waar het binnenstelsel leesbaar wordt. */
  const bounds = () => ({
    min: orbits.config.scaleInner * 0.5,
    max: overviewDistance() * 2.4
  });

  function targetFrom(direction, distance) {
    const b = bounds();
    return { pos: direction.clone().multiplyScalar(distance), target: origin.clone(),
             min: b.min, max: Math.max(b.max, distance * 1.15) };
  }

  /* ----------------------------------------------------------
     DE VIER STANDEN, alle vier uit de BEVROREN groepsorientatie.

     TOP        langs de ecliptica-pool: acht banen als concentrische
                ellipsen, en Mercurius' zon-offset is daar het duidelijkst
     EDGE       in het vlak, langs het lentepunt: het baanvlak op zijn
                kant, wat het sterkste beeld is van "alles ligt in een vlak"
     SIDE       idem, 90 graden verder — een tweede kijkrichting binnen
                datzelfde vlak
     ORBIT      schuin, vrij te draaien

     `left`/`right` uit sessie 22 zijn vervallen: die stonden loodrecht op
     de zonrichting GEZIEN VANAF DE AARDE, en die aarde is hier geen
     middelpunt meer. Ze zijn vervangen door richtingen uit het frame zelf,
     die niet verouderen zodra je de tijd verschuift.

     Top, Edge en Side zijn VASTGEZET — de orientatie staat vast, maar
     pannen en zoomen blijven toegestaan. Dat is het verschil met magneto's
     "zoom only"; zie de kop van core/view-state.js.
  ---------------------------------------------------------- */
  /* `label` en `note` staan sinds sessie 24 bij de view zelf en niet meer in
     de markup. Reden: js/ui/nav.js bouwt de knoppenrij uit het register, dus
     een view die zijn naam niet meegeeft verschijnt met zijn sleutel. En de
     nootregel wás een `if` in `markeerSpaceStand()` met twee vaste teksten —
     dat werkt voor één state en breekt bij de tweede. */
  const LOCK_NOTE = 'Locked to the ecliptic plane — pan and zoom still work.';

  const views = {
    top: {
      locked: true, label: 'Top', note: LOCK_NOTE,
      camera: () => targetFrom(orbits.pole(_dir).clone(), overviewDistance())
    },
    edge: {
      locked: true, label: 'Edge', note: LOCK_NOTE,
      camera: () => targetFrom(orbits.vernal(_dir).clone(), overviewDistance())
    },
    side: {
      locked: true, label: 'Side', note: LOCK_NOTE,
      camera: () => {
        // Loodrecht op zowel de pool als het lentepunt: de derde as van
        // hetzelfde frame, dus per constructie in het baanvlak.
        _side.crossVectors(orbits.pole(_dir), orbits.vernal(_tilt)).normalize();
        return targetFrom(_side.clone(), overviewDistance());
      }
    },
    orbit: {
      locked: false, label: '3D orbit', note: 'Free orbit.',
      camera: () => {
        // Schuin boven het vlak: de banen worden dan ellipsen in plaats van
        // lijnen of cirkels, en dat leest als ruimte. Uit de huidige
        // camerarichting zou hier ook kunnen, maar dan hangt de stand af
        // van waar je toevallig stond.
        _tilt.copy(orbits.pole(_dir)).multiplyScalar(0.55);
        _side.copy(orbits.vernal(_dir));
        return targetFrom(_tilt.add(_side).normalize().clone(), overviewDistance());
      }
    }
  };

  /* ----------------------------------------------------------
     DE DEFINITIE die core/view-state.js uitvoert.

     De sleutels zijn Engels sinds sessie 24 — het contract in
     view-state.js is toen hernoemd (besluit B10). `label` en `icon`
     zijn er toen bij gekomen: het register is óók de navigatie, dus
     een state die zich aanmeldt zonder die twee verschijnt naamloos
     in het Navigate-paneel.

     Het icoon is een baan om een middelpunt — dat is wat deze state
     toont, en het onderscheidt zich van de zon (een schijf met
     stralen) zonder een tweede cirkel te worden.
  ---------------------------------------------------------- */
  const definition = {
    body: 'space-on',
    label: 'Space',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round"><circle cx="12" cy="12" r="3" fill="currentColor" ' +
          'stroke="none"/><ellipse cx="12" cy="12" rx="10" ry="4.5" ' +
          'transform="rotate(-20 12 12)"/></svg>',
    views,
    initialView: 'orbit',
    camera: () => targetFrom(
      views.orbit.camera().pos.clone().normalize(), overviewDistance()),

    enter() {
      const d = moment();
      layers.eventsOff();
      layers.environmentOff();
      // EERST orienteren, DAN pas een view berekenen: view-state.js vraagt
      // direct na `enter()` om `views.orbit.camera()`, en die leest de
      // quaternion die hier gezet wordt. Andersom staat de camera op de
      // orientatie van de vórige keer.
      const f = deps.skyFrame(d);
      orbits.orient(f.gast, f.eps);
      orbits.setVisible(true);
      orbits.buildOrbits(d);
      orbits.update(d, world.camera());
    },

    exit() {
      orbits.setVisible(false);
      orbits.setFocus(null);
      layers.environmentRestore();
      layers.eventsRestore();
    }
  };

  /* De state loopt mee met de tijdkiezer. Wordt aangeroepen door dezelfde
     plek die de zon en maan bijwerkt, zodat er geen tweede klok ontstaat.
     Hier wordt NIET opnieuw georienteerd — zie de kopnoot. */
  function tik() {
    if (!orbits.group.visible) return;
    orbits.update(moment(), world.camera());
  }

  return { definition, views: Object.keys(views), tik };
}
