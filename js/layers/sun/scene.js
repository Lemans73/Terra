/* ============================================================
   TERRA — Sun · the scene: layers, glow, and the earth to scale
   ------------------------------------------------------------
   A group of its own beside globe.gl, never a change to globe.gl's own
   objects. Same integration contract every indicator since session 38
   has used: this module owns what it adds and can be removed without
   leaving a trace in the shared scene.

   SCALE. Everything here is expressed in solar radii, because every
   quantity the Helioviewer metadata gives us is. The group is then
   scaled once, by SUN_WORLD_R, into the world units globe.gl's camera
   and controls already work in. One factor, one place, and the shader
   divides by it to get back to radii.
   ============================================================ */

import { SUN_VERT, SUN_FRAG, sunUniforms } from './shader.js';

/* One solar radius in world units. Terra's globe has radius 100, and the
   camera distances, the zoom limits and the controls are all built around that
   number — a sun of radius 1 in the same scene would sit far outside every
   range they know. */
export const SUN_WORLD_R = 100;

/* 6371 / 695700. Not a device, just the ratio, and that is exactly what carries
   the effect: about five screen pixels at the default view. */
export const EARTH_R = 0.0091576;

/* Three slots. More would be a stack nobody can read, and each one costs a
   request of its own. */
export const SLOT_COUNT = 3;

export function createSunScene(THREE) {
  const group = new THREE.Group();
  group.name = 'sun-scene';
  group.scale.setScalar(SUN_WORLD_R);
  group.visible = false;

  const sphereGeo = new THREE.SphereGeometry(1, 128, 96);
  const planeGeo = new THREE.PlaneGeometry(2, 2);

  function material(uniforms) {
    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: SUN_VERT,
      fragmentShader: SUN_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    });
  }

  /* A layer is a sphere and a plane sharing one texture. They are two meshes
     rather than one because the sphere occludes and the plane does not, but
     they are never two pictures. */
  function makeLayer(index) {
    const layer = {
      index,
      sourceId: 0,
      meta: null,
      field: 1.65,
      nativeField: null,
      texPx: 1024,
      centre: { x: 0, y: 0 },
      opacity: 1,
      mode: 'normal',
      coronagraph: false,
      texture: null
    };

    layer.sphereUniforms = sunUniforms(THREE, true, SUN_WORLD_R);
    layer.planeUniforms = sunUniforms(THREE, false, SUN_WORLD_R);

    layer.sphere = new THREE.Mesh(sphereGeo, material(layer.sphereUniforms));
    layer.plane = new THREE.Mesh(planeGeo, material(layer.planeUniforms));

    // Lower slot number sits further back. The plane goes behind its own
    // sphere so that the disc wins where both are opaque.
    layer.plane.renderOrder = index * 10;
    layer.sphere.renderOrder = index * 10 + 1;
    layer.sphere.visible = layer.plane.visible = false;

    group.add(layer.plane, layer.sphere);
    return layer;
  }

  const layers = [];
  for (let i = 0; i < SLOT_COUNT; i++) layers.push(makeLayer(i));

  /* ---- Glow -------------------------------------------------------------
     So the limb fades into something rather than into black. Automatic, and
     off as soon as a coronagraph is active: a coronagraph already carries its
     own occulter, and a glow behind it would light up the very region the
     instrument blocks out. */
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 8),
    new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader:
        'varying vec2 vP;' +
        'void main(){ vP = position.xy;' +
        ' gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader:
        'varying vec2 vP;' +
        'void main(){' +
        '  float r = length(vP);' +
        '  float f = pow(max(1.0 - smoothstep(0.55, 2.4, r), 0.0), 2.6);' +
        '  gl_FragColor = vec4(vec3(0.95, 0.62, 0.34) * f, f * 0.42);' +
        '}',
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    })
  );
  glow.position.z = -5;
  glow.renderOrder = -100;
  group.add(glow);

  /* ---- The earth, to scale ---------------------------------------------
     Always on. It is not a setting but a sentence: this is how big we are
     next to it. The ring is there because five pixels are easy to lose. */
  const earth = new THREE.Group();
  earth.position.set(0.75, 0.55, 3.0);
  earth.renderOrder = 100;

  earth.add(new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0x4a8fd4 })
  ));

  const ringPoints = [];
  for (let i = 0; i <= 96; i++) {
    const t = (i / 96) * Math.PI * 2;
    ringPoints.push(new THREE.Vector3(
      Math.cos(t) * EARTH_R * 3.2, Math.sin(t) * EARTH_R * 3.2, 0));
  }
  earth.add(new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(ringPoints),
    new THREE.LineBasicMaterial({ color: 0x8fc4ff, transparent: true, opacity: 0.5 })
  ));
  earth.traverse(o => { if (o.material) o.material.depthTest = false; });
  group.add(earth);

  /* ---- Handling ---------------------------------------------------------- */

  function setLayerTexture(layer, texture, opts) {
    layer.texture = texture;

    /* THE PLANE HAS TO COVER THE FIELD IT CARRIES.

       PlaneGeometry(2, 2) spans -1 to +1, which is exactly one solar radius —
       the disc and nothing beyond it. But the fetched crop runs out to
       `field` radii (1.29 for AIA, 31 for LASCO C3), so at unit scale the
       plane cuts the picture off at the limb and leaves a square edge around
       the sun. Everything the plane exists for — prominences, the corona,
       CME material — sits in the part being cut away.

       Scaling is enough because the shader derives its UV from the WORLD
       position, not from the plane's own coordinates: stretch the mesh and
       every point still reads the texel that belongs to it. The z offset per
       slot keeps three coincident planes from fighting for depth. */
    layer.plane.scale.set(opts.field, opts.field, 1);
    layer.plane.position.set(opts.centre.x, opts.centre.y, -0.001 * layer.index);
    for (const u of [layer.sphereUniforms, layer.planeUniforms]) {
      u.uMap.value = texture;
      u.uHasMap.value = texture ? 1 : 0;
      u.uSunFrac.value = 1 / opts.field;
      u.uEdge.value = opts.field;
      u.uCenter.value.set(opts.centre.x, opts.centre.y);
      u.uOpacity.value = opts.opacity;
      u.uLuma.value = opts.luma ? 1 : 0;
      u.uFlipY.value = opts.flipY ? 1 : 0;
    }
    // A coronagraph has no disc to show: its occulter covers exactly the part
    // a sphere would draw. Drawing one anyway paints the occulter's flat grey
    // over the limb.
    layer.sphere.visible = !!texture && !opts.coronagraph;
    layer.plane.visible = !!texture;
    layer.planeUniforms.uHasSphere.value = layer.sphere.visible ? 1 : 0;

    const additive = opts.mode === 'add' || opts.mode === 'lumaAdd';
    for (const mesh of [layer.sphere, layer.plane]) {
      mesh.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
      mesh.material.needsUpdate = true;
    }
  }

  function clearLayer(layer) {
    if (layer.texture) { layer.texture.dispose(); layer.texture = null; }
    layer.sphere.visible = layer.plane.visible = false;
    layer.sphereUniforms.uHasMap.value = 0;
    layer.planeUniforms.uHasMap.value = 0;
    layer.meta = null;
  }

  function setGlowVisible(on) { glow.visible = on; }

  function setVisible(on) { group.visible = on; }

  /* Read back what the scene is actually showing, rather than what the code
     last intended to show. A flag on a detached object still reads true — the
     cloud shell taught that in session 47 — so this reports membership, not
     intent. */
  function state() {
    return {
      inScene: !!group.parent,
      visible: group.visible,
      worldR: SUN_WORLD_R,
      slots: layers.map(l => ({
        index: l.index,
        sourceId: l.sourceId,
        hasTexture: !!l.texture,
        sphereVisible: l.sphere.visible,
        planeVisible: l.plane.visible,
        field: l.sphereUniforms.uEdge.value,
        opacity: l.sphereUniforms.uOpacity.value
      })),
      glow: glow.visible,
      earth: earth.visible
    };
  }

  return {
    group, layers, earth,
    setLayerTexture, clearLayer, setGlowVisible, setVisible, state
  };
}
