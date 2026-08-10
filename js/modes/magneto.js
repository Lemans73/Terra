/* ============================================================
   TERRA — Magneto-perspectief
   ------------------------------------------------------------
   Een eigen weergave-state: de aarde in de ruimte, met de echte
   scheefstand van de rotatie-as, waarin je hoeken kunt aflezen die
   in de gewone weergave niet te meten zijn.

   WAAROM DIT EEN EIGEN AARDE HEEFT, en niet globe.gl's bol kantelt.
   Gemeten in sessie 18: `getCoords()`, `getScreenCoords()`,
   `toGeoCoords()` en `pointOfView()` van globe.gl rekenen alle vier in
   kale bolwiskunde zonder `matrixWorld`, en er is geen accessor om ze
   daarvan af te brengen. Een gekantelde ThreeGlobe breekt ze dus
   allemaal, plus de terminator in de shader. Een eigen bol in een eigen
   groep raakt niets van dat alles: globe.gl gaat gewoon verborgen.

   HET FRAME, in drie stappen, en dit is de kern van de module.
   Terra rekent aardvast: lengte 0 op +Z, 90 oost op +X, noordpool op +Y,
   en de aarde-mesh draait nooit — de zon loopt eromheen. Voor deze
   weergave willen we het omgekeerde: een vaste zon en een draaiende
   aarde, met de as scheef ten opzichte van het baanvlak. Dat is één
   quaternion:

     wereld = rotZ(-epsilon) · rotY(gast) · aardvast

   rotY(gast) brengt het aardvaste frame naar een equatoriaal frame
   waarin +Z naar het lentepunt wijst; rotZ(-epsilon) kantelt daarna de
   ecliptica-pool naar +Y. Omdat de subsolaire lengte met -15 graden per
   uur meeloopt en gast met +15, valt de dagelijkse draaiing er voor de
   zon precies tegen weg: de aarde draait, de zon staat stil. Dat is geen
   truc maar de definitie van siderische tijd.

   Alles wat in het aardvaste frame gerekend wordt hoort daarom IN deze
   groep: de assen, de zon en de maan. Wie er iets buiten laat, ziet het
   los van de aarde wegdraaien.

   Dependency-injection zoals in modes/expert.js: `enter`/`exit` krijgen
   wat ze nodig hebben als argument en zijn idempotent.
   ============================================================ */

import { latLonToUnit, meanObliquity, DEG } from '../sunmoon.js';
import { findGlobeRoot } from '../core/globe-root.js';

export function createMagnetoMode(THREE, opts = {}) {
  const cfg = Object.assign({
    earthRadius: 100,
    // GEMETEN, niet naar smaak gekozen: met #141c2b gaf de middenpixel rgb(27,45,82)
    // tegen rgb(0,0,0) ernaast. De bol rénderde dus wel, maar was tegen de zwarte
    // ruimte niet als bol te herkennen — geen rand, geen volume. Deze waarden geven
    // een duidelijk lichaam zonder de lijnen erop te overstemmen.
    oceaan: 0x1d2b45,
    graticule: 0x5d7292,
    equator: 0x93aed3,
    meridiaan0: 0xc79055,     // de nulmeridiaan krijgt een eigen kleur
    graticuleStap: 30
  }, opts);

  const R = cfg.earthRadius;
  const group = new THREE.Group();
  group.name = 'terra-magneto';
  group.visible = false;

  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  /* ---- de eigen aarde ----
     Bewust kaal: een effen bol met een raster. Geen textuur, geen shader,
     geen belichting. Deze weergave gaat over meetkunde, en een fotorealistische
     aarde leidt daar alleen van af — bovendien houdt het de state los van de
     dag/nacht-shader, die op de camerastand leunt. */
  const aarde = new THREE.Mesh(
    track(new THREE.SphereGeometry(R, 64, 48)),
    track(new THREE.MeshBasicMaterial({ color: cfg.oceaan }))
  );
  group.add(aarde);

  // Raster van meridianen en parallellen, opgebouwd uit latLonToUnit zodat het
  // exact hetzelfde frame spreekt als de assen en de subpunten.
  function bouwGraticule() {
    const punten = [];
    const stap = cfg.graticuleStap;
    const fijn = 3;                       // hoekstap langs een lijn
    const push = (lat, lon) => {
      const u = latLonToUnit(lat, lon);
      punten.push(u.x * R * 1.001, u.y * R * 1.001, u.z * R * 1.001);
    };
    // meridianen
    for (let lon = -180; lon < 180; lon += stap) {
      for (let lat = -90; lat < 90; lat += fijn) { push(lat, lon); push(lat + fijn, lon); }
    }
    // parallellen
    for (let lat = -90 + stap; lat < 90; lat += stap) {
      for (let lon = -180; lon < 180; lon += fijn) { push(lat, lon); push(lat, lon + fijn); }
    }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(punten), 3));
    return new THREE.LineSegments(g, track(new THREE.LineBasicMaterial({
      color: cfg.graticule, transparent: true, opacity: 0.55
    })));
  }
  group.add(bouwGraticule());

  // Equator en nulmeridiaan apart, want dat zijn de twee lijnen waar je aan
  // afleest hoe de bol staat. Zonder dat onderscheid is het raster stuurloos.
  function bouwGrootcirkel(langsLengte, kleur, opacity) {
    const punten = [];
    for (let a = 0; a <= 360; a += 2) {
      // langsLengte: de equator, dus lat vast op 0 en lon rondlopend.
      // Anders de nulmeridiaan, als volle cirkel door beide polen.
      const u = langsLengte ? latLonToUnit(0, a - 180) : latLonToUnit(a - 180, 0);
      punten.push(u.x * R * 1.002, u.y * R * 1.002, u.z * R * 1.002);
    }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(punten), 3));
    return new THREE.Line(g, track(new THREE.LineBasicMaterial({
      color: kleur, transparent: true, opacity
    })));
  }
  group.add(bouwGrootcirkel(true, cfg.equator, 0.9));
  group.add(bouwGrootcirkel(false, cfg.meridiaan0, 0.7));

  /* ---- de oriëntatie ----
     Eén quaternion per moment. `epsilon` loopt over een eeuw maar 0,013 graden,
     dus hij mag ook een constante zijn; we rekenen hem toch uit omdat de waarde
     al in sunmoon.js staat en het niets kost. */
  const _Y = new THREE.Vector3(0, 1, 0);
  const _Z = new THREE.Vector3(0, 0, 1);
  const _qGast = new THREE.Quaternion();
  const _qTilt = new THREE.Quaternion();
  let laatsteGast = null, laatsteEps = null;

  function update(eph) {
    if (!eph) return;
    const eps = meanObliquity(eph.sun.T);
    _qGast.setFromAxisAngle(_Y, eph.gast * DEG);
    _qTilt.setFromAxisAngle(_Z, -eps * DEG);
    // Eerst gast, dan de kanteling: multiplyQuaternions(a, b) past b als eerste toe.
    group.quaternion.multiplyQuaternions(_qTilt, _qGast);
    group.updateMatrixWorld(true);
    laatsteGast = eph.gast;
    laatsteEps = eps;
  }

  /* ---- camerastanden ----
     Alle drie in WERELDruimte, dus met de groepsrotatie erop. Ze geven alleen een
     positie terug; het vliegen blijft bij de aanroeper, die flyCamera al heeft.

     GEEN `camera.up` erbij, en dat is met opzet. Gemeten in de three-bundel:
     OrbitControls cachet zijn oriëntatieframe uit `object.up` in de CONSTRUCTOR en
     werkt het daarna nooit meer bij. Een latere wijziging draait wel het beeld maar
     niet het sleepgedrag, wat een scheve besturing oplevert. En het is hier
     overbodig: de hoek tussen twee lijnen op het scherm verandert niet door een
     rol, dus voor het aflezen maakt de stand van "boven" niets uit. */
  const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _as = new THREE.Vector3();

  // De rotatie-as in WERELDruimte. Die verandert niet met de dagelijkse draaiing:
  // rotY(gast) laat +Y met rust en alleen de kanteling werkt erop. Daarom is elke
  // stand die hierop steunt vanzelf stabiel over een etmaal.
  function rotatieAsWereld(target = _as) {
    return target.set(0, 1, 0).applyQuaternion(group.quaternion);
  }

  /* `zonWereld` is de richting naar de zon in wereldruimte, genormaliseerd.
     Hij hoort er voor `meridian` bij en niet optioneel: zonder hem valt die stand
     terug op iets dat met de aarde meedraait. */
  function viewFor(naam, zonWereld, afstand) {
    const doel = new THREE.Vector3(0, 0, 0);
    if (naam === 'top') {
      // Recht langs de rotatie-as van boven. Die as staat stil in wereldruimte,
      // dus deze stand blijft vanzelf staan terwijl de aarde eronder doordraait.
      return { pos: rotatieAsWereld().multiplyScalar(afstand).clone(), doel };
    }
    if (naam === 'meridian') {
      /* HET NOON-MIDNIGHT MERIDIAANVLAK, oftewel GSM X-Z: het vlak door de
         aarde-zonlijn en de rotatie-as. Dat is de standaard doorsnede in
         magnetosfeerwerk, en het is de enige die stil blijft staan: beide
         richtingen liggen vast in wereldruimte, dus de aarde draait erin rond
         terwijl de zon links of rechts blijft hangen.

         NIET het vlak door de twee ASSEN, wat de eerste versie deed. De dipoolas
         ligt vast in het aardvaste frame en zwaait dus in wereldruimte een kegel
         rond per etmaal; een camera daarop draait mee en dan beweegt de zon. */
      rotatieAsWereld();
      _n.crossVectors(_as, zonWereld);
      // Zon pal boven de pool bestaat niet, maar bij een lege of ontaarde richting
      // moet er toch iets bruikbaars uitkomen.
      if (_n.lengthSq() < 1e-12) _n.set(1, 0, 0);
      return { pos: _n.normalize().multiplyScalar(afstand).clone(), doel };
    }
    // 3D: schuin van opzij en iets van boven, zodat je meteen ziet dat het ruimte is.
    const pos = _v.set(0.72, 0.45, 0.53).normalize()
      .applyQuaternion(group.quaternion).multiplyScalar(afstand).clone();
    return { pos, doel };
  }

  /* ---- in- en uitstappen ----
     Raakt ALLEEN de scene-inhoud. De camera, de zoomgrenzen en het paneel blijven
     bij de aanroeper: die heeft daar met setSunView() al een boekhouding voor, en
     twee plekken die hetzelfde bewaren lopen gegarandeerd uiteen. */
  function enter({ world, extraGroups = [] }) {
    group.visible = true;
    // globe.gl's eigen aarde gaat uit. Hij blijft in de scene staan zodat al zijn
    // lagen en accessors ongemoeid blijven; alleen zichtbaarheid verandert.
    const globe = findGlobeRoot(world);
    if (globe) globe.visible = false;
    if (world.showAtmosphere) world.showAtmosphere(false);
    // Alles wat in het aardvaste frame rekent moet mee kantelen en meedraaien.
    // `add()` haalt een object automatisch bij zijn vorige ouder weg.
    extraGroups.forEach(g => g && group.add(g));
  }

  function exit({ world, scene, extraGroups = [] }) {
    group.visible = false;
    const globe = findGlobeRoot(world);
    if (globe) globe.visible = true;
    if (world.showAtmosphere) world.showAtmosphere(true);
    // Terug naar de scene-wortel. De rotatie zat op DEZE groep en niet op hen, dus
    // er valt aan de kinderen zelf niets terug te draaien.
    extraGroups.forEach(g => g && scene.add(g));
  }

  // De greep op globe.gl's wortel staat sinds sessie 23 in `js/core/globe-root.js`,
  // samen met de gemeten uitleg waarom het de WORTEL moet zijn en niet de aarde-mesh.
  // De space-state heeft hem ook nodig, en twee kopieen van een greep die op een
  // ongedocumenteerde binnenkant leunt lopen stil uiteen bij een globe.gl-upgrade.

  function dispose() {
    disposables.forEach(o => o.dispose && o.dispose());
    if (group.parent) group.parent.remove(group);
  }

  return {
    group, update, viewFor, enter, exit, dispose, config: cfg,
    get gast() { return laatsteGast; },
    get obliquity() { return laatsteEps; },
    meshes: { aarde }
  };
}
