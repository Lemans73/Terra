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
  QUAKE_SHOCK_VERT, QUAKE_SHOCK_FRAG
} from './quake-indicator-shaders.js';

const GLOBE_R = 100;

/* De drie standen van de schakelaar. `both` is een MEETSTAND en geen
   eindstand: hij bestaat om de schermafstand tussen v1 en v2 te kunnen
   meten (de toets uit het integratiecontract bij stap A). */
export const QUAKE_MODES = ['v1', 'v2', 'both'];

export function createQuakeIndicator(THREE, opts = {}) {
  const P = opts.params;
  const depthRGB = opts.depthRGB;
  const getCoords = opts.getCoords;
  if (!P || !depthRGB || !getCoords) {
    throw new Error('createQuakeIndicator: params, depthRGB en getCoords zijn verplicht');
  }

  /* DE STAND KOMT BIJ DE BOUW BINNEN EN WORDT NIET ERNA GEZET. Terra bouwt
     lagen in async callbacks die elke eerder gezette waarde stil
     overschrijven; een voorkeur die er achteraf overheen gaat, verdwijnt
     daar zonder een spoor achter te laten. */
  let mode = QUAKE_MODES.includes(opts.mode) ? opts.mode : 'v1';

  const group = new THREE.Group();
  group.name = 'quake-indicator-v2';
  group.visible = mode !== 'v1';

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

  // ---- uniforms ----------------------------------------------------------

  /* De schaal- en stapeluniforms zijn per constructie gelijk tussen de twee
     lagen: ze komen uit een functie. Zouden ze uiteen lopen, dan tekent de
     shockwave een andere plek dan de ring eronder — en dat is precies het
     soort fout dat alleen bij een bepaalde zoomstand opvalt. */
  const sharedUniforms = () => ({
    uCamDist:     { value: 260 },
    uRadius:      { value: GLOBE_R },
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
    uStackSpread: { value: P.quakeStackSpread }
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
    uOpacity:   { value: P.quakeRingOpacity }
  });

  const shockUniforms = Object.assign(sharedUniforms(), {
    uTime:      { value: 0 },
    uLift:      { value: P.quakeShockLift },
    uRadLo:     { value: P.quakeShockRadiusLo },
    uRadHi:     { value: P.quakeShockRadiusHi },
    uRadPow:    { value: P.quakeShockRadiusPow },
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
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -8,
    toneMapped: false,
    defines: {}
  });

  const shockMat = new THREE.ShaderMaterial({
    uniforms: shockUniforms,
    vertexShader: QUAKE_SHOCK_VERT,
    fragmentShader: QUAKE_SHOCK_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -6,
    toneMapped: false
  });

  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  const shockMesh = new THREE.Mesh(shockGeo, shockMat);
  // De shader verplaatst de hoekpunten, dus een boundingSphere op de
  // basisgeometrie liegt: die zou de hele laag wegculllen zodra de camera
  // niet naar de oorsprong kijkt.
  ringMesh.frustumCulled = false;
  shockMesh.frustumCulled = false;
  ringMesh.renderOrder = 3;
  shockMesh.renderOrder = 1;   // onder alles: hij is de achtergrondpuls
  ringMesh.userData.noPick = true;
  shockMesh.userData.noPick = true;
  group.add(shockMesh, ringMesh);

  // ---- data --------------------------------------------------------------

  let events = [];
  let stackRoot = null, stackLayer = null;
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
    if (!n) return;

    const span = Math.max(1, windowMs || 30 * 24 * 3600e3);
    const nor = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const magF = new Float32Array(n);
    const age = new Float32Array(n);
    const ageH = new Float32Array(n);   // leeftijd in UREN, voor de shockwave
    const seed = new Float32Array(n);
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

    /* Dezelfde buffers voor beide meshes. Niet apart opbouwen: dan kunnen ze
       uiteen gaan lopen zodra er ergens een regel bijkomt, en dan tekent de
       shockwave een andere beving dan de ring eronder. */
    for (const geo of [ringGeo, shockGeo]) {
      geo.setAttribute('aNormal',  new THREE.InstancedBufferAttribute(nor, 3));
      geo.setAttribute('aColor',   new THREE.InstancedBufferAttribute(col, 3));
      geo.setAttribute('aMagFrac', new THREE.InstancedBufferAttribute(magF, 1));
      geo.setAttribute('aAge',     new THREE.InstancedBufferAttribute(age, 1));
      geo.setAttribute('aAgeH',    new THREE.InstancedBufferAttribute(ageH, 1));
      geo.setAttribute('aSeed',    new THREE.InstancedBufferAttribute(seed, 1));
      geo.setAttribute('aRoot',    new THREE.InstancedBufferAttribute(rootN, 3));
      geo.setAttribute('aLayer',   new THREE.InstancedBufferAttribute(layerA, 1));
      geo.instanceCount = n;
    }
  }

  // ---- per frame ---------------------------------------------------------

  /* Drie regels, en dat is het hele punt van deze laag. Alles wat per event
     verschilt zit in de shader; hier gaat alleen wat voor het hele veld
     tegelijk geldt naar de GPU. */
  function update(camDist, timeSec) {
    ringUniforms.uCamDist.value = camDist;
    shockUniforms.uCamDist.value = camDist;
    shockUniforms.uTime.value = timeSec;
  }

  // ---- de schakelaar -----------------------------------------------------

  function setMode(next) {
    if (!QUAKE_MODES.includes(next)) return mode;
    mode = next;
    group.visible = mode !== 'v1';
    return mode;
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
    ringGeo.dispose(); shockGeo.dispose(); discBase.dispose();
    ringMat.dispose(); shockMat.dispose();
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
        uLift: 'quakeShockLift', uRadLo: 'quakeShockRadiusLo', uRadHi: 'quakeShockRadiusHi',
        uRadPow: 'quakeShockRadiusPow', uAgeLo: 'quakeShockAgeLo', uAgeHi: 'quakeShockAgeHi',
        uWaves: 'quakeShockWaves', uSpeed: 'quakeShockSpeed', uThickness: 'quakeShockThickness',
        uEdge: 'quakeShockEdge', uOpacity: 'quakeShockOpacity'
      }]
    ];
    for (const [uni, map] of pairs) {
      for (const u in map) uni[u].value = P[map[u]];
    }
    for (const uni of [ringUniforms, shockUniforms]) {
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
    }
    ringUniforms.uFitRings.value = P.quakeRingFitToScreen ? 1 : 0;
  }

  return {
    group, ringMesh, shockMesh, ringMat, shockMat,
    uploadEvents, update, setMode, syncParams, dispose,
    get mode() { return mode; },
    get count() { return ringGeo.instanceCount; },
    // Meethaken en gedeelde wiskunde — de labels en het aanwijzen lopen
    // hierlangs, zodat ze niet met een eigen formule naast de shader komen.
    iconScaleJS, ringWorldRadius, stackedNormalJS, ringAltitude,
    get events() { return events; }
  };
}
