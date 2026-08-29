/* ============================================================
   TERRA — EQ-indicator v2 · de laag
   ------------------------------------------------------------
   De aardbeving-indicator uit logs/indicator-workbench.html, als
   twee instanced lagen NAAST globe.gl's eigen scene.

   WAAROM NAAST EN NIET ALS customThreeObject (contract, sessie 39).

   Terra bouwt vandaag een THREE.Group per beving: buildQuakeObject()
   maakt drie meshes — gloed-cilinder, kern-cilinder, shockwave-ring —
   en customThreeObjectUpdate zet per datawijziging positie en
   orientatie. Bij 450 bevingen zijn dat 1.350 meshes.

   Deze laag doet het omgekeerd: twee InstancedBufferGeometry's
   waarin ALLE bevingen samen zitten, en de plaatsing gebeurt in de
   vertex-shader. Twee draw calls voor het hele veld.

   Die twee modellen passen niet in dezelfde laag. Vandaar een eigen
   groep, en globe.gl's quake-laag wordt leeggemaakt in plaats van
   vervangen. De v1-tak blijft staan: terugkeren is een schakelaar
   en geen revert.

   EEN InstancedBufferGeometry EN GEEN InstancedMesh. De shader
   bepaalt zelf waar elk hoekpunt komt, dus een instanceMatrix zou
   een tweede, afwijkende waarheid zijn — en de raycast die je er
   gratis bij krijgt, zou op die verkeerde waarheid mikken.
   Aanwijzen loopt daarom langs dezelfde formule als de shader; zie
   iconScaleJS en ringWorldRadius onderaan.

   WAT DEZE MODULE NIET DOET: de kleurschaal en de omrekening van
   lat/lon. Allebei komen ze van de aanroeper (depthRGB en
   world.getCoords), zodat er van geen van beide een tweede versie
   in dit bestand staat.
   ============================================================ */

import {
  QUAKE_RING_VERT, QUAKE_RING_FRAG,
  QUAKE_SHOCK_VERT, QUAKE_SHOCK_FRAG,
  QUAKE_BEAM_VERT, QUAKE_BEAM_FRAG
} from './quake-indicator-shaders.js';

export function createQuakeIndicator(THREE, opts = {}) {
  /* DE STRAAL STAAT HIER EN NIET IN DE MODULE-SCOPE, en dat is geen stijlkeuze.
     tools/build-standalone.mjs giet alle modules in ÉÉN script voor de
     standalone, en index.html declareert zijn eigen GLOBE_R. Twee const-en met
     dezelfde naam in dezelfde scope is een SyntaxError — in de browser valt dat
     nooit op, want daar heeft elke module zijn eigen scope. De build ving het.

     Als optie meegeven mag; de app draait op 100 en dat is three-globe.  */
  const GLOBE_R = opts.globeRadius || 100;
  const P = opts.params;
  const depthRGB = opts.depthRGB;
  const getCoords = opts.getCoords;
  if (!P || !depthRGB || !getCoords) {
    throw new Error('createQuakeIndicator: params, depthRGB en getCoords zijn verplicht');
  }

  const group = new THREE.Group();
  group.name = 'quake-indicator-v2';

  // ---- geometrie ---------------------------------------------------------

  /* ZESTIEN BIJ ZESTIEN, en niet 1x1. De vertex-shader projecteert elk
     hoekpunt op de bol, maar de DRIEHOEKEN ertussen blijven vlak — die lopen
     als koorde onder het oppervlak door. Met vier hoekpunten ligt het midden
     van zo'n driehoek bij een schijf van 13 graden hoekradius 2,65 eenheden
     BINNEN de bol, en dan verdwijnt de hele indicator in de aarde.

     GEMETEN 2026-08-23: met 1x1 en de aarde zichtbaar verschilden er NUL
     pixels tussen ring aan en ring uit, terwijl dezelfde stand met de aarde
     verborgen 24.546 verlichte pixels gaf. Met 16x16 blijft de
     koorde-afwijking per segment onder 0,01 eenheid.

     Het staat nergens uitgelegd en het is niet vanzelfsprekend, maar zonder
     is de indicator onzichtbaar. */
  const discBase = new THREE.PlaneGeometry(2, 2, 16, 16);

  const makeDiscGeometry = () => {
    const g = new THREE.InstancedBufferGeometry();
    g.index = discBase.index;
    g.setAttribute('position', discBase.attributes.position);
    g.setAttribute('uv', discBase.attributes.uv);
    g.instanceCount = 0;
    return g;
  };

  const ringGeo = makeDiscGeometry();
  const shockGeo = makeDiscGeometry();

  /* DE BEAM KRIJGT EEN 1x1-QUAD en niet de 16x16 van de schijven. Die fijne
     verdeling is er omdat een schijf op de BOL geprojecteerd wordt en de
     driehoeken ertussen anders als koorde onder het oppervlak door lopen. Een
     staaf steekt recht naar buiten en raakt de bol alleen in zijn voet — daar
     valt niets weg te zakken, en vier hoekpunten volstaan. */
  const beamBase = new THREE.PlaneGeometry(1, 1, 1, 1);
  beamBase.translate(0, 0.5, 0);   // oorsprong in het midden van de ONDERrand
  const beamGeo = new THREE.InstancedBufferGeometry();
  beamGeo.index = beamBase.index;
  beamGeo.setAttribute('position', beamBase.attributes.position);
  beamGeo.setAttribute('uv', beamBase.attributes.uv);
  beamGeo.instanceCount = 0;

  // ---- uniforms ----------------------------------------------------------

  /* De schaal- en stapeluniforms zijn per constructie gelijk tussen de twee
     lagen: ze komen uit een functie. Zouden ze uiteen lopen, dan tekent de
     shockwave een andere plek dan de ring eronder — en dat is precies het
     soort fout dat alleen bij een bepaalde zoomstand opvalt. */
  const sharedUniforms = () => ({
    uCamDist:     { value: 260 },
    uRadius:      { value: GLOBE_R },
    // De straal waartegen de fragment-shader zijn horizon uitrekent. Los van
    // uRadius omdat die in de VERTEX-shader zit; een uniform is per programma
    // en de twee blokken staan elk in hun eigen helft.
    uHorizonRadius: { value: GLOBE_R },
    uScaleRef:    { value: P.quakeIconScaleRef },
    uScalePow:    { value: P.quakeIconScalePow },
    uScaleMin:    { value: P.quakeIconScaleMin },
    uScaleMax:    { value: P.quakeIconScaleMax },
    uNearPerUnit: { value: P.quakeIconNearPerUnit },
    uNearFloor:   { value: P.quakeIconNearFloor },
    uSizeBoost:   { value: 1 },
    uStackOn:     { value: P.quakeStackOn ? 1 : 0 },
    uStackNear:   { value: P.quakeStackNear },
    uStackFar:    { value: P.quakeStackFar },
    uStackLift:   { value: P.quakeStackLift },
    uStackSpread: { value: P.quakeStackSpread },
    /* AANWIJZEN. Deze drie staan in het GEDEELDE blok en niet per laag: wijs je
       een beving aan, dan horen zijn ring, zijn beam en zijn puls samen op te
       lichten en de andere samen te dempen. Zouden ze per laag staan, dan is
       één vergeten aanroep genoeg om de helft te laten meedoen. */
    uHoverIdx:   { value: -1 },
    uHoverBoost: { value: P.quakeHoverBoost },
    uDimOthers:  { value: P.quakeHoverDim }
  });

  const ringUniforms = Object.assign(sharedUniforms(), {
    uLift:      { value: P.quakeRingLift },
    uRingLo:    { value: P.quakeRingRadiusLo },
    uRingHi:    { value: P.quakeRingRadiusHi },
    uRingPow:   { value: P.quakeRingRadiusPow },
    uCountLo:   { value: P.quakeRingCountLo },
    uCountHi:   { value: P.quakeRingCountHi },
    uLineLo:    { value: P.quakeRingLineLo },
    uLineHi:    { value: P.quakeRingLineHi },
    uFill:      { value: P.quakeRingFill },
    uCore:      { value: P.quakeRingCore },
    uFalloff:   { value: P.quakeRingFalloff },
    uLineMinPx: { value: P.quakeRingLineMinPx },
    uRingGapPx: { value: P.quakeRingGapMinPx },
    uFitRings:  { value: P.quakeRingFitToScreen ? 1 : 0 },
    uRingEdge:  { value: P.quakeRingEdge },
    uRingVolume:{ value: P.quakeRingVolume },
    uRingShine: { value: P.quakeRingShine },
    uOpacity:   { value: P.quakeRingOpacity },
    uRingOn:    { value: P.quakeRingOn ? 1 : 0 }
  });

  /* DE BEAM (sessie 41). Zijn maat komt uit de OUDE v1-parameters — beamBase,
     beamMultiplier en beamRadius stonden sinds de sloop wees in js/config.js en
     betekenen hier weer wat ze betekenden. uMagMin en uMagSpan staan erbij omdat
     de shader de rauwe magnitude nodig heeft: aMagFrac is genormaliseerd, en het
     kwadraat van een fractie is iets heel anders dan het kwadraat van een
     magnitude. */
  const beamUniforms = Object.assign(sharedUniforms(), {
    uLift:       { value: P.quakeRingLift },
    uBeamSink:   { value: P.quakeBeamSink },
    uCamLocal:   { value: new THREE.Vector3(0, 0, 300) },
    uBeamBase:   { value: P.beamBase },
    uBeamPerMag: { value: P.beamMultiplier },
    uBeamWidth:  { value: P.beamRadius },
    uMagMin:     { value: P.quakeMagMin },
    uMagSpan:    { value: Math.max(0.1, P.quakeMagMax - P.quakeMagMin) },
    uBeamScaleWithZoom: { value: P.quakeBeamScaleWithZoom ? 1 : 0 },
    uBeamCore:   { value: P.quakeBeamCore },
    uBeamFalloff:{ value: P.quakeBeamFalloff },
    uOpacity:    { value: P.quakeBeamOpacity },
    uBeamOn:     { value: P.quakeBeamOn ? 1 : 0 }
  });

  const shockUniforms = Object.assign(sharedUniforms(), {
    uTime:      { value: 0 },
    uLift:      { value: P.quakeShockLift },
    /* DE RINGMAAT, niet een eigen. Zie de lange noot in QUAKE_SHOCK_VERT: twee
       losse maten liepen uiteen zodra er aan één werd gedraaid, en dan valt de
       puls binnen zijn eigen indicator. */
    uRadLo:     { value: P.quakeRingRadiusLo },
    uRadHi:     { value: P.quakeRingRadiusHi },
    uRadPow:    { value: P.quakeRingRadiusPow },
    uShockScale:{ value: P.quakeShockScale },
    uAgeLo:     { value: P.quakeShockAgeLo },
    uAgeHi:     { value: P.quakeShockAgeHi },
    uWaves:     { value: P.quakeShockWaves },
    uSpeed:     { value: P.quakeShockSpeed },
    uThickness: { value: P.quakeShockThickness },
    uEdge:      { value: P.quakeShockEdge },
    uOpacity:   { value: P.quakeShockOpacity }
  });

  // ---- materialen --------------------------------------------------------

  /* Additief, zoals elke indicator in Terra: onverlicht neon dat niet met de
     ondergrond mengt. Wel met polygonOffset, anders vecht de schijf met de
     bol op de vlakke stukken — die staat hier op straal 100 en de ring met
     quakeRingLift 0 net zo. */
  const ringMat = new THREE.ShaderMaterial({
    uniforms: ringUniforms,
    vertexShader: QUAKE_RING_VERT,
    fragmentShader: QUAKE_RING_FRAG,
    transparent: true,
    depthWrite: false,
    /* DEPTHTEST UIT, en dat is de kern van de parallax-reparatie (sessie 40).

       Deze laag lag op straal 100,8 om boven de kaartlijnen uit te komen, en
       daar betaalde hij parallax voor: bij een scheve blik schuift een zwevende
       indicator weg van de plek die hij aanwijst. GEMETEN op 15 graden uit het
       beeldmidden — 0,49 px op camera-afstand 450, maar 30,8 px op 120 en 222 px
       op 105. Precies wat er bij diep inzoomen te zien was.

       Op straal 100 is die verschuiving per constructie nul, maar dan vecht de
       laag met de bol en de kaart. Dus geen dieptetoets, en de tekenvolgorde uit
       renderOrder. Wat de dieptebuffer nog wél deed — de ACHTERKANT van de bol
       verbergen — is naar de fragment-shader verhuisd; zie achterDeHorizon()
       daar. polygonOffset is daarmee overbodig: er is geen dieptetoets meer om
       tegen te duwen. */
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    defines: {}
  });

  const shockMat = new THREE.ShaderMaterial({
    uniforms: shockUniforms,
    vertexShader: QUAKE_SHOCK_VERT,
    fragmentShader: QUAKE_SHOCK_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,   // zelfde reden als bij de ring hierboven
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false
  });

  /* GEEN DIEPTETOETS, net als de andere twee, en om dezelfde reden: de voet
     ligt op straal 100 en zou daar met de bol en de kaartlijnen vechten. Wat de
     dieptebuffer nog deed — de achterkant verbergen — doet achterDeHorizon() in
     de fragment-shader. */
  const beamMat = new THREE.ShaderMaterial({
    uniforms: beamUniforms,
    vertexShader: QUAKE_BEAM_VERT,
    fragmentShader: QUAKE_BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false
  });

  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  const shockMesh = new THREE.Mesh(shockGeo, shockMat);
  const beamMesh = new THREE.Mesh(beamGeo, beamMat);
  // De shader verplaatst de hoekpunten, dus een boundingSphere op de
  // basisgeometrie liegt: die zou de hele laag wegculllen zodra de camera
  // niet naar de oorsprong kijkt.
  ringMesh.frustumCulled = false;
  shockMesh.frustumCulled = false;
  beamMesh.frustumCulled = false;
  ringMesh.renderOrder = 3;
  shockMesh.renderOrder = 1;   // onder alles: hij is de achtergrondpuls
  /* TUSSEN DE SHOCKWAVE EN DE RING. De ring hoort bovenop te liggen: die wijst
     de plek aan en draagt het label. De beam steekt naar buiten en mag daar
     onderdoor. */
  beamMesh.renderOrder = 2;
  ringMesh.userData.noPick = true;
  shockMesh.userData.noPick = true;
  beamMesh.userData.noPick = true;
  group.add(shockMesh, beamMesh, ringMesh);

  // ---- data --------------------------------------------------------------

  let events = [];
  let stackRoot = null, stackLayer = null;
  /* The per-event normals, kept from the last upload so restack() can redo the
     grouping without a data refresh. See restack() for why that is needed. */
  let stackNormals = null;
  let stackWasOn = null;
  const _v = new THREE.Vector3();

  /* Wie hangt aan wie, en op welke verdieping. Draait bij een datawissel en
     niet per frame; de camera bepaalt alleen hoe ver de lagen naar hun basis
     toe kruipen, en dat gebeurt in de shader.

     SLAAT OVER ALS HET STAPELEN UIT STAAT, en dat is niet alleen zuinig maar
     ook eerlijk: deze lus is O(n-kwadraat) en zou bij 450 events ruim
     tweehonderdduizend keer een acos() doen voor een uitkomst die nergens
     wordt gelezen. */
  function computeStacking(list, normals) {
    const n = list.length;
    const root = new Int32Array(n);
    const layer = new Float32Array(n);
    for (let i = 0; i < n; i++) root[i] = i;
    if (!P.quakeStackOn) return { root, layer };

    const magSpan = Math.max(0.1, P.quakeMagMax - P.quakeMagMin);
    const angularRadius = i => {
      const mf = Math.max(0, Math.min(1, ((list[i].value || 0) - P.quakeMagMin) / magSpan));
      return ringWorldRadius(mf) / GLOBE_R;
    };

    // De ZWAARSTE eerst: die wordt de basis van zijn stapel en blijft daarmee
    // op zijn werkelijke plek staan.
    const order = Array.from({ length: n }, (_, i) => i)
      .sort((a, b) => (list[b].value || 0) - (list[a].value || 0));

    const used = new Map();
    for (let a = 1; a < order.length; a++) {
      const i = order[a];
      const ri = angularRadius(i);
      let best = -1, bestAngle = Infinity;
      for (let b = 0; b < a; b++) {
        const j = order[b];
        const r = root[j];                     // hecht aan de BASIS, niet aan j
        const dot = Math.min(1, Math.max(-1, normals[i].dot(normals[r])));
        const angle = Math.acos(dot);
        const limit = (ri + angularRadius(r)) * P.quakeStackOverlap;
        if (angle < limit && angle < bestAngle) { best = r; bestAngle = angle; }
      }
      if (best < 0) continue;
      const n0 = used.get(best) || 0;
      if (n0 + 1 > P.quakeStackMaxLayers) continue;
      root[i] = best;
      layer[i] = n0 + 1;
      used.set(best, n0 + 1);
    }
    return { root, layer };
  }

  /* De buffers vullen. Draait bij een datawissel, niet per frame — dat is
     precies het verschil waar de P1 uit sessie 37 naartoe werkte.

     `nowMs` IS VERPLICHT EN KOMT VAN DE AANROEPER. Niet Date.now(), want
     Terra heeft een tijdschuif: render() rekent met momentNow().getTime() en
     waarschuwt daar expliciet dat de wandklok een lege kaart oplevert. Met de
     wandklok zou bij een reis naar 1985 elke beving miljoenen uren oud zijn
     en stond de shockwave permanent uit — een laag die stil niets doet. */
  function uploadEvents(list, nowMs, windowMs) {
    if (!Number.isFinite(nowMs)) {
      throw new Error('uploadEvents: nowMs is verplicht (het GEKOZEN moment, niet Date.now())');
    }
    events = list || [];
    const n = events.length;
    ringGeo.instanceCount = n;
    shockGeo.instanceCount = n;
    beamGeo.instanceCount = n;
    if (!n) return;

    const span = Math.max(1, windowMs || 30 * 24 * 3600e3);
    const nor = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const magF = new Float32Array(n);
    const age = new Float32Array(n);
    const ageH = new Float32Array(n);   // leeftijd in UREN, voor de shockwave
    const seed = new Float32Array(n);
    /* DE INDEX GAAT MEE NAAR DE GPU. De shader kan hem niet zelf afleiden —
       gl_InstanceID bestaat pas in GLSL ES 3.00 en deze shaders zijn met opzet
       1.00-veilig. Deze volgorde is dezelfde als die van `events`, en daar
       hangt ook de labellaag aan (die leest de gestapelde plek per index). */
    const idx = new Float32Array(n);
    const rootN = new Float32Array(n * 3);
    const layerA = new Float32Array(n);
    const normals = [];
    const magSpan = Math.max(0.1, P.quakeMagMax - P.quakeMagMin);

    for (let i = 0; i < n; i++) {
      const q = events[i];
      /* DE OMREKENING KOMT VAN world.getCoords EN NERGENS ANDERS VANDAAN. De
         workbench had een eigen latLonToVec3 met azim = lon + 180; die gaat
         niet mee. Zo kan de conventie per constructie niet uiteenlopen met de
         rest van de app — en dan hoeft de vraag welke van de twee gelijk had,
         hier niet beantwoord te worden. */
      const c = getCoords(q.lat, q.lng, 0);
      _v.set(c.x, c.y, c.z).normalize();
      nor[i * 3] = _v.x; nor[i * 3 + 1] = _v.y; nor[i * 3 + 2] = _v.z;
      normals.push(_v.clone());

      // De diepte-kleur komt van de aanroeper (depthRGB), zodat de zes-stops-
      // schaal een bron van waarheid houdt. De shader krijgt de uitkomst.
      const [r, g, b] = depthRGB(q.depth);
      col[i * 3] = r / 255; col[i * 3 + 1] = g / 255; col[i * 3 + 2] = b / 255;

      magF[i] = Math.max(0, Math.min(1, ((q.value || 0) - P.quakeMagMin) / magSpan));
      const dt = Math.max(0, nowMs - (q.time || nowMs));
      age[i]  = Math.min(1, dt / span);
      ageH[i] = dt / 3600e3;
      seed[i] = (i * 0.137) % 1;
      idx[i] = i;
    }

    const stack = computeStacking(events, normals);
    for (let i = 0; i < n; i++) {
      const r = stack.root[i];
      rootN[i * 3]     = nor[r * 3];
      rootN[i * 3 + 1] = nor[r * 3 + 1];
      rootN[i * 3 + 2] = nor[r * 3 + 2];
      layerA[i] = stack.layer[i];
    }
    stackRoot = rootN;
    stackLayer = layerA;
    stackNormals = normals;
    stackWasOn = !!P.quakeStackOn;

    /* Dezelfde buffers voor beide meshes. Niet apart opbouwen: dan kunnen ze
       uiteen gaan lopen zodra er ergens een regel bijkomt, en dan tekent de
       shockwave een andere beving dan de ring eronder. */
    /* DE BEAM EET UIT DEZELFDE BUFFERS, en dat is geen zuinigheid maar de enige
       manier waarop hij niet uiteen kan lopen met de ring eronder. Zou hij zijn
       eigen aNormal krijgen, dan staat er bij de eerstvolgende wijziging een
       staaf op een andere plek dan zijn eigen ring — en dat valt pas op bij een
       bepaalde zoomstand. */
    for (const geo of [ringGeo, shockGeo, beamGeo]) {
      geo.setAttribute('aNormal',  new THREE.InstancedBufferAttribute(nor, 3));
      geo.setAttribute('aColor',   new THREE.InstancedBufferAttribute(col, 3));
      geo.setAttribute('aMagFrac', new THREE.InstancedBufferAttribute(magF, 1));
      geo.setAttribute('aAge',     new THREE.InstancedBufferAttribute(age, 1));
      geo.setAttribute('aAgeH',    new THREE.InstancedBufferAttribute(ageH, 1));
      geo.setAttribute('aSeed',    new THREE.InstancedBufferAttribute(seed, 1));
      geo.setAttribute('aIndex',   new THREE.InstancedBufferAttribute(idx, 1));
      geo.setAttribute('aRoot',    new THREE.InstancedBufferAttribute(rootN, 3));
      geo.setAttribute('aLayer',   new THREE.InstancedBufferAttribute(layerA, 1));
      geo.instanceCount = n;
    }
  }

  /* WELKE BEVING IS AANGEWEZEN. Neemt een event-ID en niet een index, want de
     aanroeper werkt met events en de index is een detail van deze laag. Bij een
     onbekend of leeg id gaat de highlight uit.

     ZOEKT LINEAIR, en dat mag: dit draait op een muisbeweging en niet per
     frame, en de lijst is een paar honderd lang. Een map bijhouden zou een
     tweede waarheid zijn die bij elke uploadEvents opnieuw moet kloppen. */
  /* REDO THE GROUPING WITHOUT A DATA REFRESH.

     computeStacking() runs inside uploadEvents and returns an all-zero layer
     array while quakeStackOn is off, and aRoot/aLayer are instance attributes
     written only there. So flipping the switch at runtime used to change
     uStackOn and nothing else: with the default now OFF, turning "Group nearby
     quakes" back on did nothing at all until the next data arrived.

     Called from syncParams() and only when the flag actually changed — the
     inner loop is O(n²) with an acos per pair, which is fine on a click and
     wrong on a slider. */
  function restack() {
    if (!stackNormals || !stackRoot || !stackLayer) return 0;
    const stack = computeStacking(events, stackNormals);
    const nor = ringGeo.getAttribute('aNormal');
    if (!nor) return 0;
    let stacked = 0;
    for (let i = 0; i < events.length; i++) {
      const r = stack.root[i];
      stackRoot[i * 3]     = nor.array[r * 3];
      stackRoot[i * 3 + 1] = nor.array[r * 3 + 1];
      stackRoot[i * 3 + 2] = nor.array[r * 3 + 2];
      stackLayer[i] = stack.layer[i];
      if (stack.layer[i] > 0.5) stacked++;
    }
    for (const g of [ringGeo, shockGeo, beamGeo]) {
      const a = g.getAttribute('aRoot'), b = g.getAttribute('aLayer');
      if (a) a.needsUpdate = true;
      if (b) b.needsUpdate = true;
    }
    stackWasOn = !!P.quakeStackOn;
    return stacked;
  }

  function setHovered(id) {
    let idx = -1;
    if (id != null) {
      for (let i = 0; i < events.length; i++) {
        if (events[i].id === id) { idx = i; break; }
      }
    }
    for (const uni of [ringUniforms, shockUniforms, beamUniforms]) uni.uHoverIdx.value = idx;
    return idx;
  }

  // The instance index currently highlighted, or -1. Read straight from the
  // uniform, so it reports what the shader actually draws.
  function hoveredIndex() {
    return ringUniforms.uHoverIdx.value;
  }

  // ---- per frame ---------------------------------------------------------

  /* Drie regels, en dat is het hele punt van deze laag. Alles wat per event
     verschilt zit in de shader; hier gaat alleen wat voor het hele veld
     tegelijk geldt naar de GPU. */
  const _camLokaal = new THREE.Vector3();
  const _inv = new THREE.Matrix4();

  function update(camDist, timeSec, lift, camWereld) {
    ringUniforms.uCamDist.value = camDist;
    shockUniforms.uCamDist.value = camDist;
    beamUniforms.uCamDist.value = camDist;
    shockUniforms.uTime.value = timeSec;

    /* DE CAMERA IN LOKALE RUIMTE, één keer per frame. De beam keert zich naar
       de camera en heeft die richting nodig in de ruimte waar hij zelf staat;
       de laag hangt onder de globe-wortel en die draait mee met de aarde.

       Zonder de wereldpositie valt hij terug op de laatste waarde in plaats van
       op nul: een uCamLocal van (0,0,0) laat elke kruisproduct-richting samen-
       vallen met de normaal en dan is de staaf oneindig smal. Stil onzichtbaar
       is erger dan verkeerd. */
    if (camWereld) {
      group.updateMatrixWorld();
      _inv.copy(group.matrixWorld).invert();
      _camLokaal.copy(camWereld).applyMatrix4(_inv);
      beamUniforms.uCamLocal.value.copy(_camLokaal);
    }
    /* DE HOOGTE KOMT VAN BUITEN, want hij hangt aan de WEERGAVE en die kent
       deze laag niet. Realistisch liggen de kaartlijnen op 0,006 en volstaat
       een vaste 0,8; schematisch lopen ze tot 0,013 en ligt diezelfde 0,8 er
       juist ONDER.

       WAT ER KNIPT ZIJN DE LIJNEN, NIET DE LANDVLAKKEN. Die laatste liggen
       schematisch op 0,01 en zouden een ring op 0,8 moeten wegknippen, maar
       het materiaal hieronder draagt polygonOffset en dat duwt de ring in de
       dieptebuffer naar voren. Gemeten met de lift van -0,5 tot 2,5: het
       aantal ringpixels blijft constant. Tegen LIJNEN helpt polygonOffset
       niet — die zijn geen polygonen — en daar is de hoogte dus wel de enige
       weg. Zie quakeRingLiftNu() in index.html voor de meetreeks.

       Zelfde patroon als labelBaseAltitude() en overlayAlt() in index.html:
       de weergave bepaalt de hoogte, de laag voert hem uit. */
    if (lift != null) {
      ringUniforms.uLift.value = lift;
      // De shockwave blijft eronder, zodat de puls onder zijn eigen indicator
      // door loopt in plaats van eroverheen.
      shockUniforms.uLift.value = Math.max(0, lift - (P.quakeRingLift - P.quakeShockLift));
      // De beam vertrekt vanaf dezelfde voet als de ring, anders zweeft hij.
      beamUniforms.uLift.value = lift;
    }
  }

  // ---- de wiskunde die JS moet spiegelen ---------------------------------

  /* Wie in JavaScript met de ONgestapelde plek rekent, mikt stelselmatig mis:
     de shader verplaatst de indicator en de labels weten dat niet. GEMETEN in
     de workbench op 2026-08-25 met stapelen aan: 257 van de 450 events staan
     op een verdieping en die verschuiven gemiddeld 43 pixels op het scherm,
     tot 141 pixels aan toe.

     In deze eerste ronde staat het stapelen uit, dus geeft dit de normaal
     ongewijzigd terug en is de lift nul. Dat is geen reden om de functie weg
     te laten: zodra de schuif omgaat, moet dit al kloppen. Loopt hij ooit
     uiteen met de GLSL, dan zijn labels en aanwijzen allebei stuk — ze horen
     bij elkaar veranderd te worden. */
  const _sr = new THREE.Vector3();
  const _st = new THREE.Vector3();

  const smoothstepJS = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / Math.max(1e-6, b - a)));
    return t * t * (3 - 2 * t);
  };

  function iconScaleJS(camDist) {
    const base = Math.max(camDist, 1) / Math.max(P.quakeIconScaleRef, 1);
    const s = Math.min(P.quakeIconScaleMax, Math.max(P.quakeIconScaleMin,
      Math.pow(Math.max(base, 1e-6), P.quakeIconScalePow)));
    const h = Math.max(0.001, camDist - P.quakeIconNearFloor);
    return Math.min(s, P.quakeIconNearPerUnit * h);
  }

  function ringWorldRadius(magFrac) {
    const mf = Math.max(0, Math.min(1, magFrac));
    const t = Math.pow(Math.max(mf, 0), Math.max(P.quakeRingRadiusPow, 0.01));
    return P.quakeRingRadiusLo + (P.quakeRingRadiusHi - P.quakeRingRadiusLo) * t;
  }

  function stackedNormalJS(i, n, camDist, target) {
    target.copy(n);
    if (!P.quakeStackOn || !stackLayer || i >= stackLayer.length) return 0;
    const layer = stackLayer[i];
    const amt = smoothstepJS(P.quakeStackNear, P.quakeStackFar, camDist);
    if (amt < 0.001 || layer < 0.5) return 0;

    _sr.set(stackRoot[i * 3], stackRoot[i * 3 + 1], stackRoot[i * 3 + 2]);
    _st.copy(n).addScaledVector(_sr, -n.dot(_sr));   // wat er van n opzij staat
    const d = _st.length();
    if (d >= 1e-6) {
      _st.divideScalar(d);
      const want = P.quakeStackSpread * Math.sqrt(layer) / GLOBE_R;
      target.copy(_sr).addScaledVector(_st, d + (Math.max(d, want) - d) * amt).normalize();
    }
    // De lift gaat maal de icoonschaal, net als in de shader.
    return layer * P.quakeStackLift * amt * iconScaleJS(camDist);
  }

  /* De hoogte waarop de ring van dit event werkelijk ligt, als ALTITUDE —
     dezelfde eenheid die world.getCoords() en getScreenCoords() verwachten.
     Hier komt de leader-line van het label op uit. */
  function ringAltitude(i, camDist) {
    if (!P.quakeStackOn || !stackLayer || i == null || i >= stackLayer.length) {
      return P.quakeRingLift / GLOBE_R;
    }
    const layer = stackLayer[i];
    const amt = smoothstepJS(P.quakeStackNear, P.quakeStackFar, camDist);
    const lift = P.quakeRingLift + layer * P.quakeStackLift * amt * iconScaleJS(camDist);
    return lift / GLOBE_R;
  }

  // ---- opruimen ----------------------------------------------------------

  function dispose() {
    if (group.parent) group.parent.remove(group);
    ringGeo.dispose(); shockGeo.dispose(); beamGeo.dispose();
    discBase.dispose(); beamBase.dispose();
    ringMat.dispose(); shockMat.dispose(); beamMat.dispose();
  }

  /* De uniforms opnieuw uit PARAMS lezen. Nodig zodra er aan een schuif wordt
     gedraaid; in de app is dat voorlopig alleen de tuning tijdens het meten. */
  function syncParams() {
    const pairs = [
      [ringUniforms, {
        uLift: 'quakeRingLift', uRingLo: 'quakeRingRadiusLo', uRingHi: 'quakeRingRadiusHi',
        uRingPow: 'quakeRingRadiusPow', uCountLo: 'quakeRingCountLo', uCountHi: 'quakeRingCountHi',
        uLineLo: 'quakeRingLineLo', uLineHi: 'quakeRingLineHi', uFill: 'quakeRingFill',
        uCore: 'quakeRingCore', uFalloff: 'quakeRingFalloff', uLineMinPx: 'quakeRingLineMinPx',
        uRingGapPx: 'quakeRingGapMinPx', uRingEdge: 'quakeRingEdge',
        uRingVolume: 'quakeRingVolume', uRingShine: 'quakeRingShine', uOpacity: 'quakeRingOpacity'
      }],
      [shockUniforms, {
        uLift: 'quakeShockLift', uAgeLo: 'quakeShockAgeLo', uAgeHi: 'quakeShockAgeHi',
        uWaves: 'quakeShockWaves', uSpeed: 'quakeShockSpeed', uThickness: 'quakeShockThickness',
        uEdge: 'quakeShockEdge', uOpacity: 'quakeShockOpacity',
      // De maat volgt de RING, plus de eigen factor.
      uRadLo: 'quakeRingRadiusLo', uRadHi: 'quakeRingRadiusHi',
      uRadPow: 'quakeRingRadiusPow', uShockScale: 'quakeShockScale'
      }],
      [beamUniforms, {
        uBeamBase: 'beamBase', uBeamPerMag: 'beamMultiplier', uBeamWidth: 'beamRadius',
        uBeamCore: 'quakeBeamCore', uBeamFalloff: 'quakeBeamFalloff',
        uOpacity: 'quakeBeamOpacity', uBeamSink: 'quakeBeamSink'
      }]
    ];
    for (const [uni, map] of pairs) {
      for (const u in map) uni[u].value = P[map[u]];
    }
    for (const uni of [ringUniforms, shockUniforms, beamUniforms]) {
      uni.uScaleRef.value = P.quakeIconScaleRef;
      uni.uScalePow.value = P.quakeIconScalePow;
      uni.uScaleMin.value = P.quakeIconScaleMin;
      uni.uScaleMax.value = P.quakeIconScaleMax;
      uni.uNearPerUnit.value = P.quakeIconNearPerUnit;
      uni.uNearFloor.value = P.quakeIconNearFloor;
      uni.uStackOn.value = P.quakeStackOn ? 1 : 0;

      uni.uStackNear.value = P.quakeStackNear;
      uni.uStackFar.value = P.quakeStackFar;
      uni.uStackLift.value = P.quakeStackLift;
      uni.uStackSpread.value = P.quakeStackSpread;
      uni.uHoverBoost.value = P.quakeHoverBoost;
      uni.uDimOthers.value = P.quakeHoverDim;
    }
    // The grouping itself lives in an attribute, not a uniform, so the switch
    // needs a rebuild and not just a new uniform value. See restack().
    if (stackWasOn !== null && stackWasOn !== !!P.quakeStackOn) restack();

    /* DE MAGNITUDE-SCHAAL MOET MEE. De beam rekent aMagFrac terug naar een
       magnitude, en die omrekening hangt aan quakeMagMin/Max — draait daar
       iemand aan, dan zou de hoogte stil verkeerd blijven. */
    beamUniforms.uMagMin.value = P.quakeMagMin;
    beamUniforms.uMagSpan.value = Math.max(0.1, P.quakeMagMax - P.quakeMagMin);
    beamUniforms.uBeamOn.value = P.quakeBeamOn ? 1 : 0;
    beamUniforms.uBeamScaleWithZoom.value = P.quakeBeamScaleWithZoom ? 1 : 0;
    ringUniforms.uFitRings.value = P.quakeRingFitToScreen ? 1 : 0;
    ringUniforms.uRingOn.value = P.quakeRingOn ? 1 : 0;
  }

  return {
    group, ringMesh, shockMesh, beamMesh, ringMat, shockMat, beamMat,
    uploadEvents, update, syncParams, dispose, setHovered, hoveredIndex,
    restack,
    get count() { return ringGeo.instanceCount; },
    // Meethaken en gedeelde wiskunde — de labels en het aanwijzen lopen
    // hierlangs, zodat ze niet met een eigen formule naast de shader komen.
    iconScaleJS, ringWorldRadius, stackedNormalJS, ringAltitude,
    get events() { return events; }
  };
}
