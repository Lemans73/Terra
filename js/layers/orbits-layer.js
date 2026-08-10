/* ============================================================
   TERRA — Orbits · het zonnestelsel om de zon in plaats van om ons
   ------------------------------------------------------------
   Hangt uitsluitend af van de THREE-instance die je meegeeft, zelfde
   afspraak als de andere lagen. Tekent; weet niets van de app.

   HET LOKALE FRAME. `heliocentric()` geeft rechthoekige ecliptische
   coordinaten met +x naar het lentepunt en +z naar de ecliptica-pool.
   Three wil +Y omhoog, dus we leggen ze neer als:

     lokaal (X, Y, Z)  =  ecliptisch (y, z, x)

   Dat is een CYCLISCHE verwisseling en dus rechtshandig (det +1). De
   spiegelende variant (x, z, y) heeft det -1 en laat het hele
   zonnestelsel retrograde lopen — een fout die er goed uitziet, want
   acht planeten die netjes samen de verkeerde kant op draaien zien er
   precies zo geordend uit als acht die het goed doen.

   Bijkomend voordeel van juist deze verwisseling: lokaal +Z is het
   lentepunt en +Y de ecliptica-pool, precies wat
   `core/sky-orientation.js` als frame oplevert. De groep hoeft dus maar
   één quaternion te krijgen en alles staat goed.

   ------------------------------------------------------------
   DE SCHAAL — en dit is de belangrijkste keuze in dit bestand
   ------------------------------------------------------------
   ELKE BAAN KRIJGT ZIJN EIGEN UNIFORME SCHAALFACTOR k = R(a)/a, in
   plaats van dat de straal zelf gecomprimeerd wordt. Het verschil is
   niet cosmetisch:

     · uniform schalen houdt de ellips een ELLIPS, met de zon exact in
       een brandpunt. Mercurius' zon-offset wordt a·e·k = 21% van zijn
       baanstraal, en dat zie je met het blote oog. Kepler's eerste wet
       staat daarmee gewoon op het scherm.
     · de straal comprimeren zou elke baan naar een cirkel duwen en de
       zon naar het midden. Dan tekent het beeld een middeleeuws model
       in plaats van het onze.

   De ONDERLINGE afstanden liegen wel, en dat moet ook: Neptunus staat
   78 keer verder dan Mercurius, en op ware schaal is het binnenstelsel
   een punt. De wortelcompressie van a brengt die factor terug tot 8,8.

   DOORGEREKEND en niet geschat: bij 80..900 snijdt geen enkele baan
   zijn buurman, met als krapste marge 20,0 eenheden tussen aarde en
   Mars. Boven een binnenstraal van ongeveer 100 begint Mercurius'
   e = 0,206 de marge naar Venus op te eten, en bij 162 raken ze elkaar.
   Wie het binnenstelsel ruimer wil, moet dus niet `scaleInner`
   verhogen maar de compressie wisselen.

   WAT DE VERSCHILLENDE k WEL LIEGT: de lijn aarde→Mars in dit beeld is
   niet de ware zichtlijn. Elke k bewaart de richting vanaf de ZON
   exact, dus conjuncties en opposities gezien vanuit de zon kloppen —
   maar wie ooit "kijk, hier haalt de aarde Mars in" met een zichtlijn
   wil tekenen, heeft voor dat ene paar een gedeelde k nodig.
   ============================================================ */

import { BODIES, PLANET_INFO, heliocentric, julianCenturies,
         orbitBasis, orbitPoint } from '../compute/planets.js';
import { createSkyOrientation } from '../core/sky-orientation.js';
import { createLabelSprite, scaleToPixels } from '../core/label-sprite.js';

export function createOrbitsLayer(THREE, opts = {}) {
  const cfg = Object.assign({
    scaleInner:     80,    // Mercurius' halve lange as
    scaleOuter:    900,    // Neptunus
    segments:      256,    // per baan; koordefout op de buitenste 0,03 px
    bodyRadius:     10,    // GEMETEN: bij 6 is Neptunus 2,7 px op desktop
    /* DE ZON IS EEN LICHAAM EN GEEN STIP, maar hij mag zijn binnenste buurman
       niet opeten. GEMETEN op de getekende baanlijn: Mercurius' perihelium ligt
       op 63,5 scene-eenheden, zijn aphelium op 96,5.

       LET OP DE FACTOR TWEE, want daar zit de val. `sunGlowScale` gaat via
       `scale.setScalar()` naar een SPRITE, en de schaal van een sprite is zijn
       VOLLE breedte, niet zijn straal:

         gloedstraal = sunRadius x sunGlowScale / 2 = 22 x 3,2 / 2 = 35,2
         marge tot Mercurius' perihelium              63,5 - 35,2 = 28,3

       De oude noot vergeleek 'sunRadius x sunGlowScale = 45' rechtstreeks met
       die 63,5 en zette dus een volle breedte naast een straal. Dat viel niet
       op omdat het antwoord toevallig ook veilig was. Wie hier iets verzet,
       moet de deling door twee meenemen — anders lijkt een halo die keurig
       past ineens te groot, en krimpt hij tot niets. */
    sunRadius:      22,
    sunGlowScale:  3.2,
    /* De boost tilt de zon boven de bloom-drempel van 0,75 uit; zie de noot bij
       het materiaal. Hij vermenigvuldigt de TEXTUUR, dus zonder `sunTextureUrl`
       is dit een vlakke kleur die na de bloom naar wit klapt — dat was tot
       sessie 24 de reden dat de zon hier wit oogde en in de aarde-weergave
       warm, terwijl beide dezelfde getallen gebruiken. */
    sunColorBoost: [2.6, 2.25, 1.85],
    sunTextureUrl:  null,
    orbitOpacity:  0.42,
    dimOpacity:    0.28,   // buiten focus
    labelHeightPx:  24,
    rebuildAfterT: 0.01    // 1 jaar; baanelementen verlopen in decennia
  }, opts);

  const group = new THREE.Group();
  group.name = 'orbits';
  group.visible = false;

  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };
  const orientation = createSkyOrientation(THREE);

  /* ----------------------------------------------------------
     DE SCHILVERDELING.

     Vaste nominale waarden en niet de `a` uit de baanelementen: die
     verloopt weliswaar pas in het achtste decimaal, maar de schaal van
     het beeld hoort een ontwerpconstante te zijn en geen grootheid die
     met de tijdkiezer meebeweegt. De ECHTE `a` komt er straks wel aan
     te pas — in k, zodat de getekende ellips exact op deze schil
     uitkomt.
  ---------------------------------------------------------- */
  const SEMI_MAJOR_AU = {
    mercury: 0.38710, venus: 0.72333, earth: 1.00000, mars: 1.52368,
    jupiter: 5.20260, saturn: 9.55491, uranus: 19.21845, neptune: 30.11039
  };
  const wMin = Math.sqrt(SEMI_MAJOR_AU.mercury);
  const wMax = Math.sqrt(SEMI_MAJOR_AU.neptune);
  const shellOf = (k) => cfg.scaleInner + (cfg.scaleOuter - cfg.scaleInner) *
    (Math.sqrt(SEMI_MAJOR_AU[k]) - wMin) / (wMax - wMin);

  /* ---- de zon in de oorsprong ----
     MeshBasicMaterial negeert alle lichten en is dus altijd vol helder —
     het emissive gedrag dat een lichtbron hoort te hebben. De kleur staat
     BOVEN 1 per kanaal, en dat is geen slordigheid: de renderer draait
     zonder tonemapping, dus de zon is letterlijk textuur maal kleur, en
     onder de bloom-drempel van 0,75 krijgt hij geen corona. `setRGB()`
     klemt niet op 1, hex-notatie wel. */
  const sunMaterial = track(new THREE.MeshBasicMaterial());
  sunMaterial.color.setRGB(...cfg.sunColorBoost);
  const sun = new THREE.Mesh(
    track(new THREE.SphereGeometry(cfg.sunRadius, 40, 24)), sunMaterial);
  sun.raycast = () => {};

  /* De textuur, langs dezelfde weg als in sunmoon-layer.js. `crossOrigin` is
     geen formaliteit: zodra ASSET_BASE naar het CDN wijst (de standalone) is
     die vlag het verschil tussen een zichtbare zon en een zwarte bol — zonder
     toestemming laadt het plaatje wel, maar raakt het canvas tainted en
     weigert WebGL het.

     Deze laag laadt hem ZELF in plaats van de al geladen textuur over te nemen
     van de zon/maan-laag, en dat is een bewuste afweging. Overnemen zou de twee
     lagen aan elkaar knopen terwijl de afspraak onder `layers/` juist is dat ze
     alleen van THREE afhangen. De prijs is eerlijk benoemd: het netwerk kost
     niets (de browser heeft hem in de cache), het GPU-geheugen ongeveer 8 MB
     voor een tweede 2k-kopie — tegen de 8k-aardtexturen in dezelfde scene is
     dat ongeveer een procent. */
  if (cfg.sunTextureUrl) {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(cfg.sunTextureUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      sunMaterial.map = tex;
      sunMaterial.needsUpdate = true;
      track(tex);
    }, undefined,
    // Zonder plaatje blijft de effen boost staan: een witte zon is beter dan
    // geen zon.
    () => console.warn('[orbits] zontextuur niet geladen: ' + cfg.sunTextureUrl));
  }

  // `depthTest: true`, zie de gemeten noot in sunmoon-layer.js: met `false`
  // tekent de gloed-sprite over zijn eigen lichaam heen en wordt de zon een
  // egale schijf.
  const sunGlow = new THREE.Sprite(track(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,247,214,0.95)', 'rgba(255,166,40,0.55)'),
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
    transparent: true
  })));
  sunGlow.scale.setScalar(cfg.sunRadius * cfg.sunGlowScale);
  sunGlow.raycast = () => {};
  group.add(sun, sunGlow);

  function glowTexture(inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0.00, inner);
    g.addColorStop(0.18, outer);
    g.addColorStop(1.00, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return track(t);
  }

  /* ----------------------------------------------------------
     PER LICHAAM: een baanlijn, een bol en een label.

     De positiebuffer wordt EEN keer aangemaakt en daarna alleen
     overschreven — nooit een verse BufferGeometry per herbouw. Dat is
     de les uit sessie 7: globe.gl vergelijkt op objectidentiteit, en
     three heeft er ook niets aan om per herbouw te alloceren.
  ---------------------------------------------------------- */
  const bodies = {};

  for (const k of BODIES) {
    const info = PLANET_INFO[k];

    const positions = new Float32Array((cfg.segments + 1) * 3);
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const orbitMat = track(new THREE.LineBasicMaterial({
      color: info.color, transparent: true, opacity: cfg.orbitOpacity
    }));
    const orbit = new THREE.Line(geo, orbitMat);
    // Zonder dit verdwijnt Neptunus' baan zodra zijn bounding sphere
    // veroudert; en de raycaster zou anders 2056 lijnvertices per
    // pointermove doorlopen voor iets dat niet aanklikbaar hoeft te zijn.
    orbit.frustumCulled = false;
    orbit.raycast = () => {};

    const bodyMat = track(new THREE.MeshBasicMaterial({
      color: info.color, transparent: true, opacity: 1, map: null
    }));
    const mesh = new THREE.Mesh(
      track(new THREE.SphereGeometry(cfg.bodyRadius, 24, 16)), bodyMat);

    const label = createLabelSprite(THREE, info.name, info.color,
                                    { width: 256, height: 56, font: 40 });

    group.add(orbit, mesh, label);
    bodies[k] = { orbit, orbitMat, positions, geo, mesh, bodyMat, label,
                  shell: shellOf(k), k: 1, au: 0, visible: true };
  }

  /* ----------------------------------------------------------
     DE LAGRANGE-PUNTEN, en hier kloppen L4 en L5 voor het eerst echt.

     In de geocentrische weergave staan ze op de zonschil op 60 graden — een
     richting zonder plek, want daar is de aarde het middelpunt en heeft "60
     graden voor de aarde in haar baan" geen baan om in te liggen. Hier wel:
     L4 en L5 zijn letterlijk de aardepositie, 60 graden om de ecliptica-pool
     gedraaid. Ze liggen dus exact ÓP de aardbaan, en dat is precies wat ze
     zijn.

     L1 EN L2 BLIJVEN SYMBOLISCH, en dat is geen slordigheid maar meetkunde:
     ze staan op 1,00% van de zonafstand, oftewel 1,4 eenheden van de aarde af
     op deze schaal — binnen de aardmarker van straal 10. Ze worden op 22
     eenheden gezet, een factor 15 te ver, en het paneel zegt dat erbij.
     Waarom ze er toch staan: op L1 meten DSCOVR en ACE de zonnewind vóór hij
     ons bereikt, en op L2 staan James Webb en Gaia.
  ---------------------------------------------------------- */
  const L_COLOR = 0x8fd0ff;
  const L1_L2_SYMBOLIC = 22;
  const lagrangeGroup = new THREE.Group();
  lagrangeGroup.name = 'orbit-lagrange';
  lagrangeGroup.visible = false;
  const lagrangeMarks = {};

  for (const naam of ['L1', 'L2', 'L4', 'L5']) {
    const mesh = new THREE.Mesh(
      track(new THREE.OctahedronGeometry(4)),
      track(new THREE.MeshBasicMaterial({ color: L_COLOR, transparent: true,
                                          opacity: 0.9, wireframe: true })));
    mesh.raycast = () => {};
    const label = createLabelSprite(THREE, naam, L_COLOR,
                                    { width: 128, height: 56, font: 40 });
    lagrangeGroup.add(mesh, label);
    lagrangeMarks[naam] = { mesh, label };
  }
  group.add(lagrangeGroup);

  /* Werkvectoren. Ze staan BOVEN hun gebruikers — die zijn hoisted
     functiedeclaraties, deze `const`s niet. `_labelLift` wordt ook door
     update() gelezen, verderop. */
  const _earth = new THREE.Vector3();
  const _lag = new THREE.Vector3();
  const _poleAxis = new THREE.Vector3(0, 1, 0);
  const _labelLift = new THREE.Vector3();

  function placeLagrange(camera) {
    if (!lagrangeGroup.visible) return;
    const E = bodies.earth.mesh.position;
    _earth.copy(E);
    const r = _earth.length() || 1;

    // L1 naar de zon toe, L2 er recht vanaf — beide langs de zon-aardelijn.
    for (const [naam, teken] of [['L1', -1], ['L2', 1]]) {
      const M = lagrangeMarks[naam];
      _lag.copy(_earth).multiplyScalar(1 + teken * L1_L2_SYMBOLIC / r);
      M.mesh.position.copy(_lag);
      M.label.position.copy(_lag).add(_labelLift.set(0, 12, 0));
      if (camera) scaleToPixels(THREE, M.label, camera, cfg.labelHeightPx * 0.8);
    }
    // L4 zestig graden vóór de aarde in haar baan, L5 evenveel erachter. De
    // draaiing gaat om de LOKALE +Y, want dat is hier de ecliptica-pool.
    for (const [naam, graden] of [['L4', 60], ['L5', -60]]) {
      const M = lagrangeMarks[naam];
      _lag.copy(_earth).applyAxisAngle(_poleAxis, graden * Math.PI / 180);
      M.mesh.position.copy(_lag);
      M.label.position.copy(_lag).add(_labelLift.set(0, 12, 0));
      if (camera) scaleToPixels(THREE, M.label, camera, cfg.labelHeightPx * 0.8);
    }
  }

  function setLagrangeVisible(on, date, camera) {
    lagrangeGroup.visible = !!on;
    if (lagrangeGroup.visible) placeLagrange(camera);
  }

  /* ---- de banen bouwen ----
     Sweep van de excentrische anomalie, niet van de tijd: dat sluit exact
     (het laatste punt IS het eerste) en kost geen 165 jaar aan tijdstappen
     voor Neptunus. Zie orbitBasis()/orbitPoint() in compute/planets.js. */
  let builtAtT = null;

  function buildOrbits(date) {
    const T = julianCenturies(date);
    for (const key of BODIES) {
      const B = bodies[key];
      const basis = orbitBasis(key, T);
      B.k = B.shell / basis.a;
      for (let n = 0; n <= cfg.segments; n++) {
        // n === segments krijgt bewust E = 0 terug, zodat het laatste punt
        // bit voor bit het eerste is en de ring geen naad heeft.
        const E = (n % cfg.segments) / cfg.segments * Math.PI * 2;
        const p = orbitPoint(basis, E);
        const i = n * 3;
        B.positions[i]     = p.y * B.k;
        B.positions[i + 1] = p.z * B.k;
        B.positions[i + 2] = p.x * B.k;
      }
      B.geo.attributes.position.needsUpdate = true;
      B.geo.computeBoundingSphere();
    }
    builtAtT = T;
    return T;
  }

  /* ---- de lichamen plaatsen ----
     De werkvectoren die update() leest (`_labelLift`) staan bij de
     Lagrange-blok hierboven, ruim boven deze functie. Zie de noot daar. */
  let lastEph = null;
  let focus = null;

  function update(date, camera) {
    if (!group.visible) return null;

    const T = julianCenturies(date);
    if (builtAtT === null || Math.abs(T - builtAtT) > cfg.rebuildAfterT) buildOrbits(date);

    const out = {};
    for (const key of BODIES) {
      const B = bodies[key];
      const h = heliocentric(date, key);
      B.mesh.position.set(h.y * B.k, h.z * B.k, h.x * B.k);
      // Het label komt LOODRECHT OP HET BAANVLAK boven het lichaam te staan
      // (lokaal +Y is de ecliptica-pool), niet radiaal naar buiten: radiaal
      // zou de binnenste vier labels naar elkaar toe duwen, want daar liggen
      // de banen maar twintig eenheden uit elkaar.
      B.label.position.copy(B.mesh.position)
        .add(_labelLift.set(0, cfg.bodyRadius * 2.2, 0));
      B.au = h.r;
      out[key] = { au: h.r, x: h.x, y: h.y, z: h.z,
                   lambda: (Math.atan2(h.y, h.x) * 180 / Math.PI + 360) % 360 };
      if (camera) scaleToPixels(THREE, B.label, camera, cfg.labelHeightPx);
    }
    lastEph = out;
    placeLagrange(camera);
    applyFocus();
    return out;
  }

  const _up = new THREE.Vector3();

  /* Focus dimt de rest, maar laat hem staan. Dezelfde regel als in de
     geocentrische laag, en om dezelfde reden: wie alleen het gekozen
     lichaam toont, haalt juist de informatie weg die het beeld moet
     overbrengen — namelijk dat ze samen één stelsel zijn. */
  function applyFocus() {
    for (const key of BODIES) {
      const B = bodies[key];
      const full = !focus || focus === key;
      B.bodyMat.opacity = B.visible ? (full ? 1 : 0.5) : 0;
      B.orbitMat.opacity = B.visible
        ? (full ? cfg.orbitOpacity : cfg.dimOpacity) : 0;
      B.label.material.opacity = B.visible ? (full ? 1 : 0.55) : 0;
      B.mesh.visible = B.visible;
      B.orbit.visible = B.visible;
      B.label.visible = B.visible;
    }
  }

  function setFocus(key) {
    focus = key && bodies[key] ? key : null;
    applyFocus();
    return focus;
  }

  function setBodyVisible(key, on) {
    if (!bodies[key]) return;
    bodies[key].visible = !!on;
    applyFocus();
  }

  function setVisible(on) { group.visible = !!on; }

  function redrawLabels(camera) {
    if (!group.visible || !camera) return;
    for (const key of BODIES) scaleToPixels(THREE, bodies[key].label, camera, cfg.labelHeightPx);
  }

  /* ---- de orientatie ----
     Wordt EEN keer bij binnenkomst gezet en daarna bevroren. Laat je hem
     met `gast` meelopen, dan draait het hele zonnestelsel met 15,041 graden
     per uur mee — tegen Mercurius' 0,17 en de aarde's 0,041. Het beeld zou
     dan vrijwel uitsluitend de AARDROTATIE tonen, precies de fout die het
     hemelspoor met een bevroren sterrentijd vermijdt. En de sterrenhemel
     achter dit alles staat sowieso stil. */
  function orient(gast, eps) {
    orientation.ecliptic(group.quaternion, gast, eps);
    group.updateMatrixWorld(true);
  }

  const _v = new THREE.Vector3();
  const pole   = (target = _v) => target.set(0, 1, 0).applyQuaternion(group.quaternion);
  const vernal = (target = _v) => target.set(0, 0, 1).applyQuaternion(group.quaternion);

  function dispose() {
    disposables.forEach(o => o.dispose && o.dispose());
    if (group.parent) group.parent.remove(group);
  }

  return {
    group, update, buildOrbits, setVisible, setFocus, setBodyVisible,
    redrawLabels, orient, pole, vernal, dispose, setLagrangeVisible,
    config: cfg, bodies,
    ephemerides: () => lastEph,
    focus: () => focus,
    outerRadius: () => cfg.scaleOuter,
    isVisible: () => group.visible
  };
}
