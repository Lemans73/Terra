/* ============================================================
   TERRA — Space · de aarde in haar kosmische omgeving
   ------------------------------------------------------------
   Een state, geen laag. Hij ORKESTREERT: hij zet gebeurtenislagen uit,
   de planeten aan, laat zon en maan staan, en biedt vier camerastanden.
   Wat hij zelf tekent is niets.

   DAT ONDERSCHEID IS DE HELE OPZET. De magnetosfeer en de instrumenten
   op L1 en L2 horen hier later naast te passen zonder dat dit bestand
   opengebroken wordt — de volgende bewoner meldt zich aan via `lagen`,
   hij wordt hier niet ingebouwd.

   WAAROM DE GEBEURTENISSEN UIT GAAN (Terry, sessie 22): bevingen,
   branden, stormen, zee-ijs, luchtkwaliteit en bliksem gaan over wat er
   OP de aarde gebeurt. Deze state gaat over wat er omheen staat. Ze
   tegelijk tonen levert twee verhalen op een bol, en dan wint geen van
   beide.

   ------------------------------------------------------------
   HET REFERENTIEVLAK IS DE ECLIPTICA, niet het aarde-zonvlak van de
   magneto-state. Voor planeten is dat het juiste vlak: ze liggen er per
   definitie omheen, dus de stand verklaart zelf waarom je ze in een
   band ziet staan.

   De ecliptica-noordpool ligt op rechte klimming 270 graden en
   declinatie 90 - eps. In Terra's AARDVASTE frame (lengte 0 op +Z)
   draait die pool dus mee met de sterrentijd — en dat is fysiek juist:
   sta je boven de ecliptica-pool, dan draait de aarde onder je door.
   Dezelfde meetkunde als "the Earth turns beneath a Sun that stays put"
   bij magneto, alleen om een andere as.

   TOP staat daarmee 23,44 graden scheef op de rotatie-as, en dat is
   geen artefact maar het punt: het is de scheefstand die de seizoenen
   maakt, en het verbindt deze state met `Earth's axis`.
   ============================================================ */

// De frame-berekeningen stonden hier en zijn in sessie 22 naar
// compute/frames.js verhuisd, omdat de ecliptica-laag ze ook nodig heeft.
// Twee kopieën van een frame-berekening lopen stil uiteen.
import { eclipticPole as poolVan, sunDirection as zonVan } from '../compute/frames.js';

export function createSpaceState(THREE, deps) {
  const { world, planets, lagen } = deps;

  const _pool = new THREE.Vector3();
  const _zon = new THREE.Vector3();
  const _zij = new THREE.Vector3();
  const _op = new THREE.Vector3();
  const nul = new THREE.Vector3(0, 0, 0);

  const moment = () => (deps.moment ? deps.moment() : new Date());

  // Dunne wrappers die het resultaat in een hergebruikte Vector3 zetten:
  // deze standen worden bij elke camerabeweging berekend en hoeven daar
  // geen allocatie voor te doen.
  const eclipticaPool = (date) => { const u = poolVan(date);
                                    return _pool.set(u.x, u.y, u.z).normalize(); };
  const zonRichting  = (date) => { const u = zonVan(date);
                                    return _zon.set(u.x, u.y, u.z).normalize(); };

  /* ----------------------------------------------------------
     HOE VER MOET DE CAMERA STAAN?

     `fitDistance(S) = S / sin(min(halfV, halfH))`, met
     `halfH = atan(aspect * tan(halfV))` — de formule uit sessie 14.
     Op een telefoon in portret vraagt hetzelfde beeld ruim twee keer
     de afstand van een breed scherm, dus dit is geen constante.
  ---------------------------------------------------------- */
  function pasAfstand(S) {
    const cam = world.camera();
    const halfV = (cam.fov / 2) * Math.PI / 180;
    const halfH = Math.atan(cam.aspect * Math.tan(halfV));
    return S / Math.sin(Math.min(halfV, halfH));
  }

  // De buitenste schil plus de bol erop, zodat Neptunus niet op de rand plakt.
  const overzichtsAfstand = () =>
    pasAfstand(planets.config.schilBuiten + planets.config.bolStraal * 2);

  const grenzen = () => ({
    min: planets.config.earthRadius * 1.55,
    max: overzichtsAfstand() * 2.4
  });

  function doelUit(richting, afstand) {
    const g = grenzen();
    return { pos: richting.clone().multiplyScalar(afstand), target: nul.clone(),
             min: g.min, max: Math.max(g.max, afstand * 1.15) };
  }

  /* ----------------------------------------------------------
     DE VIER STANDEN.

     TOP          langs de ecliptica-pool: alle planeten in een ring
     LEFT/RIGHT   in het eclipticavlak, 90 graden van de zon: de band
                  op zijn kant, wat het sterkste beeld is van "alles
                  ligt in een vlak"
     ORBIT        vrij

     Top, Left en Right zijn VASTGEZET — de orientatie staat vast,
     maar pannen en zoomen blijven toegestaan. Dat is het verschil
     met magneto's "zoom only"; zie de kop van core/view-state.js.
  ---------------------------------------------------------- */
  const standen = {
    top: {
      vast: true,
      doel: () => doelUit(eclipticaPool(moment()), overzichtsAfstand())
    },
    left: {
      vast: true,
      doel: () => {
        const d = moment();
        _zij.crossVectors(eclipticaPool(d), zonRichting(d)).normalize();
        return doelUit(_zij.clone(), overzichtsAfstand());
      }
    },
    right: {
      vast: true,
      doel: () => {
        const d = moment();
        _zij.crossVectors(eclipticaPool(d), zonRichting(d)).normalize().negate();
        return doelUit(_zij.clone(), overzichtsAfstand());
      }
    },
    orbit: {
      vast: false,
      doel: () => {
        // Vanaf een punt schuin boven de ecliptica: de ring is dan een
        // ellips in plaats van een lijn of een cirkel, en dat leest als
        // ruimte. Uit de huidige camerarichting zou hier ook kunnen,
        // maar dan hangt de stand af van waar je toevallig stond.
        const d = moment();
        _op.copy(eclipticaPool(d)).multiplyScalar(0.55);
        _zij.crossVectors(eclipticaPool(d), zonRichting(d)).normalize();
        return doelUit(_op.add(_zij).normalize(), overzichtsAfstand());
      }
    }
  };

  /* ----------------------------------------------------------
     DE DEFINITIE die core/view-state.js uitvoert.
  ---------------------------------------------------------- */
  const definitie = {
    body: 'space-on',
    knop: 'space-btn',
    knopAan: 'Back to Earth',
    knopUit: 'Enter space view',
    standen,
    beginstand: 'orbit',
    doel: () => doelUit(
      standen.orbit.doel().pos.clone().normalize(), overzichtsAfstand()),

    binnen() {
      lagen.gebeurtenissenUit();
      planets.setVisible(true);
      planets.update(moment(), world.camera());
    },

    buiten() {
      planets.setVisible(false);
      planets.setFocus(null);
      lagen.gebeurtenissenTerug();
    }
  };

  /* De state loopt mee met de tijdkiezer. Wordt aangeroepen door dezelfde
     plek die de zon en maan bijwerkt, zodat er geen tweede klok ontstaat. */
  function tik() {
    if (!planets.group.visible) return;
    planets.update(moment(), world.camera());
  }

  return { definitie, standen: Object.keys(standen), tik, eclipticaPool, zonRichting };
}
