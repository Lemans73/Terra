/* ============================================================
   TERRA — the quake indicator · the layer
   ------------------------------------------------------------
   Three instanced layers NEXT TO globe.gl's own scene: the ring,
   the shockwave and the beam.

   WHY BESIDE IT AND NOT AS A customThreeObject. The older approach
   built a THREE.Group per quake — three meshes each — and updated
   position and orientation per data change. At 450 quakes that is
   1350 meshes and it is where 1409 draw calls came from.

   This layer does the opposite: InstancedBufferGeometry holding ALL
   quakes together, with the placement done in the vertex shader.
   One draw call per sub-layer for the whole field.

   AN InstancedBufferGeometry AND NOT AN InstancedMesh. The shader
   decides where every vertex goes, so an instanceMatrix would be a
   second and diverging truth — and the raycast you get for free
   would aim at that wrong truth. Picking therefore follows the same
   formula as the shader; see iconScaleJS and ringWorldRadius at the
   bottom.

   WHAT THIS MODULE DOES NOT DO: the colour scale and the lat/lon
   conversion. Both come from the caller (depthRGB and
   world.getCoords), so neither has a second version in here.
   ============================================================ */

import {
  QUAKE_RING_VERT, QUAKE_RING_FRAG,
  QUAKE_SHOCK_VERT, QUAKE_SHOCK_FRAG,
  QUAKE_BEAM_VERT, QUAKE_BEAM_FRAG
} from './quake-indicator-shaders.js';

export function createQuakeIndicator(THREE, opts = {}) {
  /* THE RADIUS LIVES HERE AND NOT IN THE MODULE SCOPE, and that is not a style
     choice. tools/build-standalone.mjs pours every module into ONE script for
     the standalone build, and index.html declares its own GLOBE_R. Two consts
     with the same name in the same scope is a SyntaxError — in the browser that
     never shows, because there every module has its own scope. The build caught
     it.

     Passing it as an option is allowed; the app runs on 100, which is
     three-globe's radius. */
  const GLOBE_R = opts.globeRadius || 100;
  const P = opts.params;
  const depthRGB = opts.depthRGB;
  const getCoords = opts.getCoords;
  if (!P || !depthRGB || !getCoords) {
    throw new Error('createQuakeIndicator: params, depthRGB en getCoords zijn verplicht');
  }

  const group = new THREE.Group();
  group.name = 'quake-indicator-v2';

  // ---- geometry ----------------------------------------------------------

  /* SIXTEEN BY SIXTEEN, and not 1x1. The vertex shader projects every vertex
     onto the globe, but the TRIANGLES between them stay flat — they run under
     the surface as a chord. With four vertices the middle of such a triangle
     sits 2.65 units INSIDE the globe for a disc of 13 degrees angular radius,
     and then the whole indicator disappears into the earth.

     MEASURED: with 1x1 and the earth visible there were ZERO pixels of
     difference between ring on and ring off, while the same setting with the
     earth hidden gave 24,546 lit pixels. With 16x16 the chord error per segment
     stays under 0.01 unit.

     Not obvious, and without it the indicator is invisible. */
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

  /* THE BEAM GETS A 1x1 QUAD and not the 16x16 of the discs. That fine
     subdivision exists because a disc is projected onto the GLOBE and its
     triangles would otherwise run under the surface as a chord. A shaft points
     straight outwards and touches the globe only at its foot — nothing can sink
     there, and four vertices are enough. */
  const beamBase = new THREE.PlaneGeometry(1, 1, 1, 1);
  beamBase.translate(0, 0.5, 0);   // origin at the middle of the BOTTOM edge
  const beamGeo = new THREE.InstancedBufferGeometry();
  beamGeo.index = beamBase.index;
  beamGeo.setAttribute('position', beamBase.attributes.position);
  beamGeo.setAttribute('uv', beamBase.attributes.uv);
  beamGeo.instanceCount = 0;

  // ---- uniforms ----------------------------------------------------------

  /* The scale and stacking uniforms are equal across the layers by
     construction: they come out of one function. Were they to drift apart, the
     shockwave would draw a different spot than the ring under it — exactly the
     kind of fault that only shows at one particular zoom. */
  const sharedUniforms = () => ({
    uCamDist:     { value: 260 },
    uRadius:      { value: GLOBE_R },
    /* THE LIMB BAND, computed in JS once per frame — see setLimbBand(). Two
       cosines: x where the fade ends (gone), y where it begins (still full).
       Doing it here rather than in the shader keeps acos() out of the fragment
       stage and leaves one place to clamp against NaN. */
    uHorizonBand: { value: new THREE.Vector2(1, 1) },
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
    /* HOVER. These three sit in the SHARED block and not per layer: hover a
       quake and its ring, its beam and its pulse should light up together while
       the others dim together. Per layer, one forgotten call would be enough to
       let half of them join in. */
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

  /* THE BEAM. Its size comes from beamBase, beamMultiplier and beamRadius in
     js/config.js. uMagMin and uMagSpan are here because the shader needs the raw
     magnitude: aMagFrac is normalised, and the square of a fraction is something
     else entirely than the square of a magnitude. */
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
    /* THE RING'S SIZE, not one of its own. See the long note in
       QUAKE_SHOCK_VERT: two separate sizes drifted apart the moment either was
       adjusted, and then the pulse falls inside its own indicator. */
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

  // ---- materials ---------------------------------------------------------

  /* Additive, like every indicator in Terra: unlit neon that does not blend
     with what is under it. With polygonOffset, otherwise the disc fights the
     globe on the flat stretches — that sits at radius 100 and so does the ring
     with quakeRingLift at 0. */
  const ringMat = new THREE.ShaderMaterial({
    uniforms: ringUniforms,
    vertexShader: QUAKE_RING_VERT,
    fragmentShader: QUAKE_RING_FRAG,
    transparent: true,
    depthWrite: false,
    /* DEPTH TEST OFF, and that is the heart of the parallax repair.

       This layer sat at radius 100.8 to clear the map lines, and paid parallax
       for it: under an oblique view a floating indicator drifts away from the
       spot it points at. MEASURED at 15 degrees off centre — 0.49 px at camera
       distance 450, but 30.8 px at 120 and 222 px at 105.

       At radius 100 that drift is zero by construction, but there the layer
       fights the globe and the map. So no depth test, and the draw order comes
       from renderOrder. What the depth buffer still did — hiding the BACK of the
       globe — moved into the fragment shader; see the limb band there.
       polygonOffset is redundant with it: there is no depth test left to push
       against. */
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
    depthTest: false,   // same reason as the ring above
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false
  });

  /* NO DEPTH TEST, like the other two and for the same reason: the foot sits at
     radius 100 and would fight the globe and the map lines there. What the depth
     buffer still did — hiding the back — is done by the limb band in the
     fragment shader. */
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
  // The shader moves the vertices, so a boundingSphere on the base geometry
  // lies: it would cull the whole layer as soon as the camera looks away from
  // the origin.
  ringMesh.frustumCulled = false;
  shockMesh.frustumCulled = false;
  beamMesh.frustumCulled = false;
  ringMesh.renderOrder = 3;
  shockMesh.renderOrder = 1;   // under everything: it is the background pulse
  /* BETWEEN THE SHOCKWAVE AND THE RING. The ring belongs on top: it marks the
     spot and carries the label. The beam points outwards and may pass under. */
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

  /* Who hangs off whom, and on which storey. Runs on a data change and not per
     frame; the camera only decides how far the storeys creep back towards their
     base, and that happens in the shader.

     SKIPPED WHEN STACKING IS OFF, which is not just thrifty but honest: this
     loop is O(n squared) and at 450 events would do over two hundred thousand
     acos() calls for a result nobody reads. */
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

    // The HEAVIEST first: it becomes the base of its stack and therefore stays
    // on its real spot.
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

  /* Filling the buffers. Runs on a data change, not per frame.

     nowMs IS REQUIRED AND COMES FROM THE CALLER. Not Date.now(), because Terra
     has a time slider: render() works from momentNow().getTime(). With the wall
     clock, a trip to 1985 would make every quake millions of hours old and the
     shockwave would sit permanently off — a layer silently doing nothing. */
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
    const ageH = new Float32Array(n);   // age in HOURS, for the shockwave
    const seed = new Float32Array(n);
    /* THE INDEX GOES TO THE GPU. The shader cannot derive it — gl_InstanceID
       only exists in GLSL ES 3.00 and these shaders are deliberately 1.00-safe.
       This order is the same as that of the events array, and the label layer
       hangs off it too (it reads the stacked position per index). */
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

      // The depth colour comes from the caller (depthRGB) so the six-stop scale
      // keeps one source of truth. The shader gets the result.
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

    /* ALL THREE MESHES EAT FROM THE SAME BUFFERS, and that is not thrift but
       the only way they cannot drift apart. Give the beam its own aNormal and
       the next change puts a shaft somewhere other than its own ring — visible
       only at one particular zoom. */
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

  /* WHICH QUAKE IS HOVERED. Takes an event id and not an index, because the
     caller works with events and the index is a detail of this layer. An
     unknown or empty id turns the highlight off.

     SEARCHES LINEARLY, and that is fine: this runs on a mouse move and not per
     frame, and the list is a few hundred long. Keeping a map would be a second
     truth that has to hold again after every uploadEvents. */
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

  /* Three lines, and that is the whole point of this layer. Everything that
     differs per event lives in the shader; only what holds for the entire field
     at once goes to the GPU here. */
  const _camLokaal = new THREE.Vector3();
  const _inv = new THREE.Matrix4();

  /* THE LIMB BAND, in cosines (session 42, Terry).

     The horizon sits at cos(theta_h) = R / camDist. The band runs from a few
     degrees before it to a few degrees after, so an indicator turning around
     the globe fades instead of vanishing in one frame.

     CLAMPED BEFORE acos, because a rounding error above 1.0 there gives NaN —
     and a NaN uniform makes the whole layer draw nothing without a word in the
     console. Below the surface (camDist <= R) there is no horizon at all: the
     band then opens all the way and everything draws. */
  const _band = new THREE.Vector2(1, 1);
  function setLimbBand(camDist) {
    const grens = GLOBE_R / Math.max(camDist, GLOBE_R + 0.001);
    const thetaH = Math.acos(Math.max(-1, Math.min(1, grens)));
    const d = Math.max(0, P.quakeLimbFadeDeg) * Math.PI / 180;
    let lo = Math.cos(Math.min(Math.PI, thetaH + d));
    const hi = Math.cos(Math.max(0, thetaH - d));
    /* THE TWO EDGES MAY NEVER COINCIDE. smoothstep(x, x, v) divides by
       edge1 - edge0 and is undefined in GLSL — measured at fade 0: the beam
       then changed across the whole disc instead of only at the limb, because
       every fragment was reading a division by zero. The floor turns fade 0
       into a very narrow ramp, which is the old hard cut-off. */
    if (hi - lo < 1e-4) lo = hi - 1e-4;
    _band.set(lo, hi);
    for (const uni of [ringUniforms, shockUniforms, beamUniforms]) uni.uHorizonBand.value.copy(_band);
  }

  function update(camDist, timeSec, lift, camWereld) {
    ringUniforms.uCamDist.value = camDist;
    shockUniforms.uCamDist.value = camDist;
    beamUniforms.uCamDist.value = camDist;
    shockUniforms.uTime.value = timeSec;
    setLimbBand(camDist);

    /* THE CAMERA IN LOCAL SPACE, once per frame. The beam turns towards the
       camera and needs that direction in the space where it sits itself; this
       layer hangs under the globe root, which rotates with the earth.

       Without the world position it falls back to the last value rather than to
       zero: a uCamLocal of (0,0,0) makes every cross-product direction coincide
       with the normal and the shaft becomes infinitely thin. Silently invisible
       is worse than wrong. */
    if (camWereld) {
      group.updateMatrixWorld();
      _inv.copy(group.matrixWorld).invert();
      _camLokaal.copy(camWereld).applyMatrix4(_inv);
      beamUniforms.uCamLocal.value.copy(_camLokaal);
    }
    /* THE HEIGHT COMES FROM OUTSIDE, because it depends on the VIEW MODE and
       this layer does not know about that. In realistic view the map lines sit
       at 0.006 and a fixed 0.8 is enough; in schematic they run up to 0.013 and
       that same 0.8 sits UNDER them.

       WHAT CLIPS IS THE LINES, NOT THE LAND POLYGONS. Those sit at 0.01 in
       schematic and should clip a ring at 0.8, but the material below carries
       polygonOffset which pushes the ring forward in the depth buffer. Measured
       with the lift from -0.5 to 2.5: the ring pixel count stays constant.
       Against LINES polygonOffset does not help — they are not polygons — so
       there the height really is the only way. See quakeRingLiftNu() in
       index.html for the measurement series.

       Same pattern as labelBaseAltitude() and overlayAlt() in index.html: the
       view mode decides the height, the layer carries it out. */
    if (lift != null) {
      ringUniforms.uLift.value = lift;
      // The shockwave stays below, so the pulse runs under its own indicator
      // instead of over it.
      shockUniforms.uLift.value = Math.max(0, lift - (P.quakeRingLift - P.quakeShockLift));
      // The beam starts from the same foot as the ring, or it floats.
      beamUniforms.uLift.value = lift;
    }
  }

  // ---- the maths JS has to mirror ----------------------------------------

  /* Anything computing in JavaScript from the UNstacked position misses
     systematically: the shader moves the indicator and the labels do not know.
     MEASURED with stacking on: 257 of 450 events sit on a storey and those
     shift 43 pixels on screen on average, up to 141.

     With stacking off this returns the normal unchanged and a lift of zero.
     That is no reason to leave the function out: the moment the switch goes on,
     this has to be right already. If it ever drifts from the GLSL, both the
     labels and the picking break — they belong changed together. */
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
    // The lift is multiplied by the icon scale, exactly as in the shader.
    return layer * P.quakeStackLift * amt * iconScaleJS(camDist);
  }

  /* The height at which this event's ring actually sits, as an ALTITUDE — the
     same unit world.getCoords() and getScreenCoords() expect. This is where the
     label's leader line lands. */
  function ringAltitude(i, camDist) {
    if (!P.quakeStackOn || !stackLayer || i == null || i >= stackLayer.length) {
      return P.quakeRingLift / GLOBE_R;
    }
    const layer = stackLayer[i];
    const amt = smoothstepJS(P.quakeStackNear, P.quakeStackFar, camDist);
    const lift = P.quakeRingLift + layer * P.quakeStackLift * amt * iconScaleJS(camDist);
    return lift / GLOBE_R;
  }

  // ---- teardown ----------------------------------------------------------

  function dispose() {
    if (group.parent) group.parent.remove(group);
    ringGeo.dispose(); shockGeo.dispose(); beamGeo.dispose();
    discBase.dispose(); beamBase.dispose();
    ringMat.dispose(); shockMat.dispose(); beamMat.dispose();
  }

  /* Re-read the uniforms from PARAMS. Needed as soon as a slider moves, and
     when applyGlobeMode() writes the per-view opacity. */
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
      // The size follows the RING, times its own factor.
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

    /* THE MAGNITUDE SCALE HAS TO FOLLOW. The beam converts aMagFrac back into a
       magnitude, and that conversion depends on quakeMagMin/Max — adjust those
       and the height would silently stay wrong. */
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
    // Measurement hooks and shared maths — the labels and the picking go
    // through here so they never end up with a formula of their own beside the
    // shader.
    iconScaleJS, ringWorldRadius, stackedNormalJS, ringAltitude,
    get events() { return events; }
  };
}
