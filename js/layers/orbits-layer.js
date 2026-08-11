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
    /* IN SCHERMPIXELS, want dit is een schermprobleem (sessie 26). Hier stond
       een wereldmaat — `bodyRadius * 2.2` — en die leverde GEMETEN 7 tot 13
       schermpixels op, terwijl het label zelf 24 px hoog is. Het lag dus over
       de bol heen. Dezelfde klasse fout als de labelschaal van sessie 25 en de
       occlusiedrempel van deze sessie: een maat in de verkeerde eenheid.
       18 px is de vrije ruimte TUSSEN de bolrand en de onderkant van de tekst. */
    labelGapPx:     18,
    /* Een grens op die vrije ruimte, want de bolstraal groeit onbeperkt zodra je
       inzoomt: van dichtbij zou het label honderden pixels boven zijn planeet
       gaan zweven en niet meer als bijschrift lezen. GEMETEN op de vier standen
       in Space: de bol is daar 3 tot 21 px, dus deze klem doet niets — hij is er
       voor wie later dichter naar een lichaam toe vliegt. */
    labelLiftMaxPx: 64,
    /* Hoeveel labels mogen elkaar raken voordat er een wegvalt. GEMETEN in de
       Edge-stand op 1280x800: de acht lichamen staan daar over 318 px verdeeld
       terwijl hun namen samen 422 px meten. Zonder deze toets is een derde van
       het beeld onleesbaar; met deze toets vallen de labels weg die het minst
       te vertellen hebben. De marge is wat er MINIMAAL tussen twee labels moet
       zitten, bovenop hun eigen breedte. */
    labelMarginPx:   4,
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

  /* Per lichaam: mag zijn label getoond worden, of valt het weg tegen een label
     dat vóór ligt? APART van `B.visible`, want dat is een andere vraag — die
     zegt of de planeet zelf aanstaat. Twee redenen om iets te verbergen op één
     vlag zetten breekt zodra ze uit elkaar gaan lopen, en dat doen ze hier per
     camerabeweging. Alles begint zichtbaar; `resolveLabelCollisions()` is de
     enige schrijver. */
  const labelVisible = {};
  for (const k of BODIES) labelVisible[k] = true;

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
                                    { height: 56, font: 40 });

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
                                    { height: 56, font: 40 });
    lagrangeGroup.add(mesh, label);
    lagrangeMarks[naam] = { mesh, label };
  }
  group.add(lagrangeGroup);

  /* Werkvectoren. Ze staan BOVEN hun gebruikers — die zijn hoisted
     functiedeclaraties, deze `const`s niet. `_labelLift` hoort sinds sessie 26
     alleen nog bij de Lagrange-punten: de planeetlabels worden in placeLabels()
     in SCHERMPIXELS getild, en die 12 hieronder is een wereldmaat. */
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
     Alleen de BOLLEN; de labels gaan sinds sessie 26 door placeLabels(), want
     hun plaatsing hangt van de camera af en niet van de datum. */
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
      B.au = h.r;
      out[key] = { au: h.r, x: h.x, y: h.y, z: h.z,
                   lambda: (Math.atan2(h.y, h.x) * 180 / Math.PI + 360) % 360 };
    }
    lastEph = out;
    placeLabels(camera);
    placeLagrange(camera);
    applyFocus();
    return out;
  }

  /* ---- de labels: tillen, schalen, en laten wegvallen ----------------------
     ÉÉN FUNCTIE VOOR ALLE DRIE, want ze hangen aan elkaar. De lift wordt in
     schermpixels gerekend en heeft dus de schaal nodig; de botsingstoets heeft
     de plaatsing nodig. Uit elkaar getrokken zouden ze om de beurt met een
     frame achterstand werken.

     TWEE AANROEPERS: `update()` (de tik, en bij elke tijdstap) en
     `redrawLabels()` (elke camerabeweging). Beide moeten, want de plaatsing
     hangt van de posities én van de camera af. */
  function placeLabels(camera) {
    if (!camera) return;
    for (const key of BODIES) {
      const B = bodies[key];
      // HET LABEL STAAT OP DE PLANEET ZELF, en wordt daarna in SCHERMRUIMTE
      // omhoog geduwd met `sprite.center`. Hier stond een verplaatsing langs
      // lokaal +Y — de ecliptica-pool — en die werkt precies zolang je van
      // opzij kijkt. GEMETEN in de Top-stand, waar je er loodrecht op kijkt:
      // die richting wijst dan naar de camera toe, dus het label kwam niet
      // omhoog maar naar VOREN, pal over de bol heen. Een sprite hangt altijd
      // recht naar de kijker toe, dus zijn anker is de enige plek waar een
      // "omhoog" bestaat die in elke camerastand hetzelfde betekent.
      B.label.position.copy(B.mesh.position);
      const h = scaleToPixels(THREE, B.label, camera, cfg.labelHeightPx);
      // `scaleToPixels` geeft de WERELDhoogte terug, en die is per definitie
      // `labelHeightPx` schermpixels. De omrekening is dus gratis.
      const perPixel = h / cfg.labelHeightPx;
      const bodyPx = Math.min(cfg.bodyRadius / perPixel, cfg.labelLiftMaxPx);
      // `center` is de plek waar de sprite aan zijn positie hangt, in eenheden
      // van zijn eigen hoogte. 0,5 is het midden (de standaard), 0 de onderkant.
      // Negatief tilt hem er helemaal bovenuit: precies de bolrand plus de vrije
      // ruimte, gedeeld door de spritehoogte.
      B.label.center.set(0.5, -(bodyPx + cfg.labelGapPx) / cfg.labelHeightPx);
      B.labelLiftPx = bodyPx + cfg.labelGapPx + cfg.labelHeightPx / 2;
    }
    resolveLabelCollisions(camera);
  }

  /* WELK LABEL WINT ALS ER TWEE OVER ELKAAR VALLEN. Hetzelfde patroon dat de
     landnamen sinds sessie 9 gebruiken en de beving-labels sinds 25: eerst een
     rangorde, dan van hoog naar laag toelaten wat nog past.

     De rangorde is (1) het lichaam in FOCUS, altijd — dat is wat je zelf
     aanwees — en daarna (2) wie het DICHTST BIJ DE CAMERA staat. Die tweede is
     zelf-verklarend: draai je het stelsel, dan wisselen de namen mee, en de
     planeet die vooraan ligt is ook degene die je het beste ziet. Een vaste
     volgorde (Mercurius eerst) zou betekenen dat Neptunus zijn naam nooit
     krijgt zodra het krap wordt, ook niet als hij pal voor je staat.

     `visible` blijft ongemoeid — die vlag is van `applyFocus()` en betekent
     "deze planeet staat aan". Wegvallen gaat via de opacity van het
     LABELmateriaal, zodat de twee redenen om iets niet te tonen los blijven. */
  const _labelNDC = new THREE.Vector3();
  function resolveLabelCollisions(camera) {
    const W = window.innerWidth, H = window.innerHeight;
    const candidates = [];
    for (const key of BODIES) {
      const B = bodies[key];
      if (!B.visible) continue;
      B.label.getWorldPosition(_labelNDC).project(camera);
      if (_labelNDC.z > 1) continue;                    // achter de camera
      const c = B.label.userData.labelCanvas;
      candidates.push({
        key,
        x: (_labelNDC.x * 0.5 + 0.5) * W,
        // Het ANKER staat op de planeet; de tekst zelf hangt er `labelLiftPx`
        // bovenuit via `center`. De botsingstoets moet die verschuiving
        // meenemen, anders vergelijkt hij rechthoeken die nergens staan.
        y: (-_labelNDC.y * 0.5 + 0.5) * H - (B.labelLiftPx || 0),
        w: cfg.labelHeightPx * c.width / c.height + cfg.labelMarginPx,
        h: cfg.labelHeightPx + cfg.labelMarginPx,
        // Kleinere NDC-z = dichter bij de camera. De focus krijgt -2, dus altijd
        // vóór alles wat er echt staat (NDC-z loopt van -1 tot 1).
        rank: key === focus ? -2 : _labelNDC.z
      });
    }
    candidates.sort((a, b) => a.rank - b.rank);

    const placed = [];
    for (const c of candidates) {
      const collides = placed.some(p =>
        Math.abs(p.x - c.x) < (p.w + c.w) / 2 && Math.abs(p.y - c.y) < (p.h + c.h) / 2);
      if (!collides) placed.push(c);
      labelVisible[c.key] = !collides;
    }
    // Wat buiten beeld of achter de camera viel, staat niet in `candidates` en
    // houdt zijn vorige stand. Die labels zie je toch niet; ze opnieuw zetten
    // zou alleen betekenen dat er per frame meer geschreven wordt.
    applyFocus();
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
      B.mesh.visible = B.visible;
      B.orbit.visible = B.visible;
      // Twee redenen waarom een label er niet is, en ze staan hier naast elkaar:
      // de planeet staat uit, of zijn naam viel weg tegen een label dat vóór
      // ligt. Zie labelVisible bij zijn declaratie.
      const toonLabel = B.visible && labelVisible[key];
      B.label.material.opacity = toonLabel ? (full ? 1 : 0.55) : 0;
      B.label.visible = toonLabel;
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

  /* Elke camerabeweging: opnieuw schalen, opnieuw tillen, opnieuw uitzoeken wie
     er past. Dat laatste is nieuw sinds sessie 26 en het is de reden dat dit
     `placeLabels()` aanroept in plaats van alleen te schalen — bij het draaien
     van het stelsel schuiven de labels langs elkaar heen, en dan verandert per
     frame wie er wegvalt. */
  function redrawLabels(camera) {
    if (!group.visible || !camera) return;
    placeLabels(camera);
  }

  /* Welk lichaam ligt het dichtst bij een schermpunt? Voor klikken, en met dezelfde
     redenering als `raakPunt()` in planets-layer.js: geen raycaster, want de bollen
     zijn hier nog kleiner — Mercurius meet een fractie van een pixel op de
     overzichtsafstand — en een schermafstand is zowel goedkoper als
     vergevingsgezinder dan een treffer op de geometrie zelf.

     WAT HIER ANDERS IS DAN BIJ DE PLANETENLAAG: die bewaart per lichaam een
     schermpositie in zijn eigen update(), want hij plaatst er toch al labels mee.
     Deze laag houdt alles in 3D en schaalt zijn labels als sprites, dus er ís geen
     schermpositie om te lezen. Daarom projecteert hij hier zelf, één keer per klik.

     `_hitWereld` en niet `mesh.position`: de hele groep draagt een quaternion (zie
     `orient()`), dus de lokale positie zegt niets over waar het lichaam op het
     scherm staat. */
  const _hitWereld = new THREE.Vector3();
  function raakPunt(x, y, camera, marge = 34) {
    if (!group.visible || !camera) return null;
    let best = null, bestD = marge;
    for (const key of BODIES) {
      const B = bodies[key];
      if (!B.visible || !B.mesh.visible) continue;
      B.mesh.getWorldPosition(_hitWereld).project(camera);
      // Achter de camera projecteert een punt naar de tegenoverliggende kant van
      // het beeld; zonder deze toets is een lichaam dat je NIET ziet aanklikbaar.
      if (_hitWereld.z > 1) continue;
      const sx = (_hitWereld.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-_hitWereld.y * 0.5 + 0.5) * window.innerHeight;
      const d = Math.hypot(sx - x, sy - y);
      if (d < bestD) { bestD = d; best = key; }
    }
    return best;
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
    redrawLabels, raakPunt, orient, pole, vernal, dispose, setLagrangeVisible,
    config: cfg, bodies,
    ephemerides: () => lastEph,
    focus: () => focus,
    outerRadius: () => cfg.scaleOuter,
    isVisible: () => group.visible
  };
}
