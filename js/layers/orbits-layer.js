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
    sunRadius:      14,
    sunGlowScale:  3.2,    // 45 eenheden — moet ruim binnen Mercurius' 63,5 blijven
    sunColorBoost: [2.6, 2.25, 1.85],
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
     `_labelLift` staat BOVEN `update()`: die is hoisted, deze `const` niet.
     In de praktijk gaat het goed omdat update() pas na de opbouw wordt
     aangeroepen, maar dat is precies de aanname waar dit project acht keer
     op is stukgelopen. */
  const _labelLift = new THREE.Vector3();
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
    redrawLabels, orient, pole, vernal, dispose,
    config: cfg, bodies,
    ephemerides: () => lastEph,
    focus: () => focus,
    outerRadius: () => cfg.scaleOuter,
    isVisible: () => group.visible
  };
}
