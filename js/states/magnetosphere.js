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

   WAT DEZE STATE NOG NIET DOET (sessie 29, blok B2)
   De windwaarden zijn nog NOMINAAL en niet gemeten: 2 nPa, Bz 0,
   Mach 8. Dat is een rustige, gemiddelde zonnewind. Blok B3 hangt er de
   echte metingen aan (propagated solar wind van NOAA SWPC), en dan
   verandert deze vorm mee met wat er werkelijk aankomt. Zolang dat niet
   zo is, staat het er ALS ZODANIG BIJ — een gemodelleerde vorm die zich
   voordoet als een meting is erger dan geen vorm.
   ============================================================ */

import { MSPHERE_RE, MSPHERE_DRAW_MAX, pocNaarTerra }
  from '../layers/magnetosphere/boundary-layer.js';

/* De nominale windstand waarop de vorm draait zolang B3 er niet is.
   Eén plek, met een naam die zegt wat hij is — een default die ergens
   los in een aanroep staat, wordt stilzwijgend een bewering. */
export const MSPHERE_NOMINAL_WIND = { pdyn: 2.0, bz: 0, mach: 8 };

export function createMagnetosphereState(THREE, deps) {
  const { world, boundary, layers, Core } = deps;

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
    const halfH = Math.atan(cam.aspect * Math.tan(halfV));
    return S / Math.sin(Math.min(halfV, halfH));
  }

  /* HOE VER, EN WAAROM DIT GEMETEN IS.

     De eerste versie kadreerde op 20 Re, "genoeg om de holte te zien en de
     bol te herkennen". Op het scherm zat je daarmee BINNEN de magnetosfeer:
     het net vulde het beeld en van de vorm — neus, flank, staart — was niets
     te lezen. De vorm is niet symmetrisch om de aarde: hij loopt van +10 Re
     aan de zonzijde tot -60 in de staart, dus wat je moet omvatten is de
     STAART en niet de neus.

     Vandaar de getekende lengte als maat. De 0,70 volgt uit het draaipunt: dat
     ligt op de aarde (zie targetFrom), dus een kader dat de hele staart omvat
     is aan de zonzijde voor de helft leeg. Zo staan de neus, de flank en een
     goed stuk staart in beeld, en loopt de staart aan de rand door — wat een
     staart hoort te doen. */
  const overviewDistance = () => fitDistance(MSPHERE_DRAW_MAX * MSPHERE_RE * 0.70);

  const bounds = () => ({
    min: MSPHERE_RE * 1.6,                   // net buiten de bol
    max: fitDistance(90 * MSPHERE_RE)        // ruim voorbij de getekende staart
  });

  /* HET DRAAIPUNT BLIJFT OP DE AARDE, EN DAT IS GEEN KEUZE.

     De vorm loopt van +10 Re aan de zonzijde tot -60 in de staart, dus zijn
     midden ligt niet op de aarde. Een kadrering die daarheen pant, is
     geprobeerd en werkt niet: globe.gl schrijft `controls.target` bij elke
     `update()` terug naar de oorsprong. GEMETEN — target op (0,0,-2000) gezet,
     na één `ctl.update()` weer (0,0,0). Dat is dezelfde val als bij de
     zonaanzicht-camera in sessie 21.

     Dus staat de aarde in het midden en strekt de holte zich naar één kant
     uit. Dat is fysisch trouwens de eerlijker weergave: de staart wijst van de
     zon af, en waar hij heen wijst is de informatie. */
  function targetFrom(direction, distance) {
    const b = bounds();
    return { pos: direction.clone().multiplyScalar(distance), target: origin.clone(),
             min: b.min, max: Math.max(b.max, distance * 1.6) };
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

  const views = {
    meridian: {
      locked: true, label: 'Meridian', note: LOCK_NOTE,
      camera: () => {
        // Loodrecht op het X-Z-vlak is de Y-as: van daaruit zie je dat vlak
        // op ware grootte.
        const a = gsmAssen();
        return targetFrom(a.y.clone(), overviewDistance());
      }
    },
    top: {
      locked: true, label: 'Top', note: LOCK_NOTE,
      camera: () => {
        const a = gsmAssen();
        return targetFrom(a.z.clone(), overviewDistance());
      }
    },
    orbit: {
      locked: false, label: '3D orbit', note: 'Free orbit.',
      camera: () => {
        // Schuin op de zonlijn: de neus in beeld én de staart herkenbaar.
        const a = gsmAssen();
        _dir.copy(a.x).multiplyScalar(0.85)
            .add(_z.copy(a.z).multiplyScalar(0.45))
            .add(_y.copy(a.y).multiplyScalar(0.5)).normalize();
        return targetFrom(_dir.clone(), overviewDistance());
      }
    }
  };

  /* Bouwen uit de huidige windstand. Apart van `enter()` omdat de tijdkiezer
     hem ook aanroept: de zonrichting schuift, dus het frame draait mee. */
  let laatste = null;
  function herbouw() {
    const w = MSPHERE_NOMINAL_WIND;
    const a = gsmAssen();
    boundary.orient(a.x, a.dip);
    laatste = boundary.update(w.pdyn, w.bz, w.mach);
    return laatste;
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
      layers.eventsOff();
      // EERST oriënteren, DAN pas een view berekenen: view-state.js vraagt
      // direct na `enter()` om `views.meridian.camera()`, en die leest het
      // frame dat hier gezet wordt. Andersom staat de camera op de oriëntatie
      // van de vórige keer. Dezelfde volgorde als in space.js, en om dezelfde
      // reden daar één keer misgegaan.
      herbouw();
      boundary.setVisible(true);
    },

    exit() {
      boundary.setVisible(false);
      layers.eventsRestore();
    }
  };

  /* Loopt mee met de tijdkiezer, via dezelfde aanroep die zon en maan
     bijwerkt — geen tweede klok. Anders dan space.js wordt hier WEL opnieuw
     georiënteerd: de zonrichting is hier het onderwerp en niet de achtergrond. */
  function tik() {
    if (!boundary.group.visible) return;
    herbouw();
  }

  return { definition, views: Object.keys(views), tik,
           herbouw, laatsteBouw: () => laatste, gsmAssen };
}
