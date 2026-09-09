/* ============================================================
   TERRA — Sun · the sun itself, in instrument images
   ------------------------------------------------------------
   A state, not a layer. It hides the globe and everything attached to
   it, puts an orthographic camera on the observer's line of sight, and
   shows what SDO and its neighbours actually recorded. What it draws
   itself is nothing: js/layers/sun/scene.js owns the meshes.

   THIS IS IMAGE DATA, NOT MEASURED DATA, and the interface has to say
   so. Everything else in Terra shows numbers you can check. These are
   projected, colour-coded frames that have been through a processing
   chain. That is fine, and it is outside Terra's measurability rule, so
   it gets a label rather than a footnote. The one exception is the HEK
   event layer, which is numeric — and which is not in this state yet.

   ------------------------------------------------------------
   THE CAMERA IS ORTHOGRAPHIC, AND IT IS NOT A SECOND CAMERA.

   From 1 AU the sun spans about 0.53 degrees. That is what the
   instruments see, so that is what the projection has to be — a
   perspective camera would put a curvature in the disc that no
   instrument recorded.

   But globe.gl owns the camera, and OrbitControls holds a reference to
   it. Swapping in an OrthographicCamera means both of them are then
   driving something else. The magnetosphere solved this in session 31
   by overriding `updateProjectionMatrix` on the camera that is already
   there, and this state does the same, minus the blend: the sun is
   never half perspective.

   VIEW_R IS THE GUARANTEED HALF-EXTENT IN THE NARROWEST DIRECTION.
   Tie it to the height instead and the sun falls out of frame left and
   right on a portrait window — which is what 9:16 is, and what a narrow
   browser window already is.

   THE SUN IS ALWAYS EXACTLY 1 R IN WORLD UNITS, so a fixed camera
   extent makes it the same size whatever the source. That is why the
   camera extent and the fetched field are two separate numbers: tying
   them together made EUI FSI shrink to a dot, because Solar Orbiter
   moves between 0.28 and 0.9 AU and its field in solar radii breathes
   with the orbit.
   ============================================================ */

import { createSunScene, SUN_WORLD_R } from '../layers/sun/scene.js';
import { createSunFetch, imageScaleFor } from '../layers/sun/fetch.js';
import {
  SOURCE_BY_ID, isCoronagraph, deriveGeometry, textureSize, sharpness, earthInTexels
} from '../layers/sun/source.js';

/* The default view: 1.65 solar radii, which is SUVI's field. Wide enough that
   the corona has somewhere to go, tight enough that the disc still carries the
   picture. */
export const VIEW_R_DEFAULT = 1.65;
const VIEW_R_MIN = 1.02;
const VIEW_R_MAX = 32;

/* Depth is linear under an orthographic projection, so a slab this generous
   costs nothing. Under perspective the same range would be exactly the
   z-fighting that keeps `near` small. */
const DEPTH = SUN_WORLD_R * 40;

/* ZOOM RIDES ON THE CAMERA DISTANCE, and that is not a detour.

   Under an orthographic projection the distance does nothing to the size — the
   extent does that — so a state could simply pin the camera and drive VIEW_R
   from its own control. But then the scroll wheel, the pinch gesture and every
   other thing OrbitControls already handles would do nothing, and each would
   have to be re-implemented against the same controls that were told to sit
   still.

   Instead the distance stays the single quantity the controls own, and VIEW_R
   is read from it. distance = VIEW_R * SUN_WORLD_R * CAMERA_K, so the zoom
   limits below are the view limits expressed in the units the controls use.

   THE LIMITS ARE NOT OPTIONAL. view-state.js copies `min` and `max` from the
   definition straight into ctl.minDistance and ctl.maxDistance. Leave them out
   and both become undefined, every distance clamp turns into NaN, and the
   camera position goes NaN with it — the scene then renders black and no
   uniform on earth will bring it back. Session 47 spent real time on exactly
   this, from the same cause. */
const CAMERA_K = 4;
const distanceFor = r => r * SUN_WORLD_R * CAMERA_K;

export function createSunState(THREE, env) {
  const { world, layers, viewStates } = env;

  const scene = createSunScene(THREE);
  const api = createSunFetch(env.fetchOptions);
  const maxImagePx = env.maxImagePx || 2048;
  let viewR = VIEW_R_DEFAULT;
  let attached = false;
  let originalUpdate = null;

  /* A canvas of zero gives aspect = 0/0 = NaN, and one NaN in an orthographic
     matrix makes every point NaN: the scene goes black and stays black. Session
     30 measured exactly that in a hidden browser pane. */
  const safeAspect = () => {
    const a = world.camera().aspect;
    return Number.isFinite(a) && a > 0 ? a : 1;
  };

  /* VIEW_R as the camera currently stands. Read rather than stored, so panning
     and scrolling need no listener of their own — and a listener on the
     controls' `change` would fire on drags and auto-rotate too, which is a
     gate that has to be got right rather than added. */
  function currentViewR() {
    const cam = world.camera(), ctl = world.controls();
    if (!cam || !ctl) return viewR;
    const d = cam.position.distanceTo(ctl.target);
    if (!Number.isFinite(d) || d <= 0) return viewR;
    return Math.min(VIEW_R_MAX, Math.max(VIEW_R_MIN, d / (SUN_WORLD_R * CAMERA_K)));
  }

  /* The half-extents that belong to the current window. VIEW_R holds in the
     narrow direction; the wide one grows. */
  function extents() {
    const a = safeAspect();
    const r = currentViewR() * SUN_WORLD_R;
    return a >= 1 ? { hw: r * a, hh: r } : { hw: r, hh: r / a };
  }

  /* NOBODY ASKS A PERSPECTIVE CAMERA FOR A NEW MATRIX, and that is the trap
     here. three.js rebuilds `projectionMatrix` only on request, and
     OrbitControls does not make that request when it dollies a perspective
     camera — it moves the position and leaves the projection alone, because for
     a perspective camera the projection does not depend on distance.

     Ours does: VIEW_R is read from the distance. So the override alone gets
     installed once, runs once, and then holds whatever extent the camera had at
     that instant. Measured: after the entry flight the matrix still described
     VIEW_R 1.02 from mid-flight while the camera stood at 1.65, and the sun
     rendered 392 px across where 242 belonged — a wrong picture that looks
     entirely deliberate.

     `syncProjection` closes that, and it is gated on the DISTANCE rather than on
     "are the controls doing something". A handler that fires on every change
     also fires on drags and on auto-rotate, and rebuilding the matrix on a pure
     rotation is work that cannot change its outcome. */
  let lastDistance = null;

  function syncProjection() {
    if (!originalUpdate) return false;
    const cam = world.camera(), ctl = world.controls();
    if (!cam || !ctl) return false;
    const d = cam.position.distanceTo(ctl.target);
    if (!Number.isFinite(d)) return false;
    if (lastDistance !== null && Math.abs(d - lastDistance) < 1e-6) return false;
    lastDistance = d;
    cam.updateProjectionMatrix();
    return true;
  }

  function holdProjection() {
    const cam = world.camera();
    if (originalUpdate) { cam.updateProjectionMatrix(); return; }
    originalUpdate = cam.updateProjectionMatrix.bind(cam);
    cam.updateProjectionMatrix = function () {
      const { hw, hh } = extents();
      this.projectionMatrix.makeOrthographic(-hw, hw, hh, -hh, -DEPTH, DEPTH);
      this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
    };
    lastDistance = null;
    cam.updateProjectionMatrix();
  }

  function releaseProjection() {
    const cam = world.camera();
    lastDistance = null;
    if (!originalUpdate) return;
    cam.updateProjectionMatrix = originalUpdate;
    originalUpdate = null;
    cam.updateProjectionMatrix();
  }

  /* The camera sits on the line of sight and looks at the origin. Distance is
     irrelevant to the size under an orthographic projection — the extent does
     that — but it still has to sit outside the sphere, and OrbitControls needs
     somewhere to orbit around. */
  function cameraStand() {
    return {
      pos: { x: 0, y: 0, z: distanceFor(VIEW_R_DEFAULT) },
      target: { x: 0, y: 0, z: 0 },
      min: distanceFor(VIEW_R_MIN),
      max: distanceFor(VIEW_R_MAX)
    };
  }

  /* Setting VIEW_R moves the camera, because the camera distance is what VIEW_R
     is read from. Writing the field without moving the camera would leave the
     two disagreeing until the next scroll silently overruled it. */
  function setViewR(r) {
    viewR = Math.min(VIEW_R_MAX, Math.max(VIEW_R_MIN, r));
    const cam = world.camera(), ctl = world.controls();
    if (cam && ctl) {
      const dir = cam.position.clone().sub(ctl.target);
      // A zero vector has no direction, and setLength on one produces NaN —
      // which is how session 47's black screen started.
      if (dir.lengthSq() < 1e-12) dir.set(0, 0, 1);
      cam.position.copy(ctl.target).add(dir.setLength(distanceFor(viewR)));
      cam.updateProjectionMatrix();
    }
    return viewR;
  }

  /* Attach on first entry rather than at construction. The scene object a
     state hangs from does not exist yet when the modules are imported, and a
     group added to nothing is a group that reads as present and draws
     nothing. */
  function attach() {
    if (attached) return;
    const parent = world.scene();
    if (!parent) return;
    parent.add(scene.group);
    attached = true;
  }

  /* ----------------------------------------------------------------------
     LOADING A SLOT: the whole chain, in the order it has to happen.

     1. getClosestImage at the requested moment. Cheap, and it answers with the
        REAL observation time — which is what step 3 then asks for, so that two
        visitors within the same cadence window request the same image.
     2. Everything else is derived from that response. Not one number here is
        typed in.
     3. takeScreenshot for the field we want, at a texture size that is one
        texel per source pixel within reason.

     The crop is asked for in arcsec about the sun's centre, and `y0` counts
     positive DOWNWARD while our world counts upward. fetch.js carries that
     minus sign; it is mentioned here because it is the kind of thing that
     produces a perfectly good image of the wrong half.
  ---------------------------------------------------------------------- */
  async function loadSlot(index, sourceId, when, opts = {}) {
    const layer = scene.layers[index];
    if (!layer) throw new Error('no slot ' + index);

    const corona = isCoronagraph(sourceId);
    const meta = await api.closestImage(sourceId, when || new Date());
    const geom = deriveGeometry(meta, corona);

    // What to fetch: the source's own field, unless the camera is zoomed in
    // far enough that a tighter crop buys real detail.
    const field = opts.field != null
      ? opts.field
      : Math.min(geom.nativeField, Math.max(viewR * 1.25, 0.2));

    const px = textureSize(field, geom.rsun, maxImagePx);
    const scale = imageScaleFor(field, px, geom.radiusArcsec);
    const centre = opts.centre || { x: 0, y: 0 };

    const blob = await api.screenshot({
      sourceId,
      date: meta.date,                       // the observation time, not the clock
      imageScale: scale.toFixed(6),
      x0: (centre.x * geom.radiusArcsec).toFixed(2),
      y0: (centre.y * geom.radiusArcsec).toFixed(2),
      px
    });

    const bitmap = await createImageBitmap(blob);
    const texture = new THREE.Texture(bitmap);
    texture.needsUpdate = true;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    if (layer.texture) layer.texture.dispose();

    layer.sourceId = sourceId;
    layer.meta = meta;
    layer.geometry = geom;
    layer.field = field;
    layer.texPx = px;
    layer.coronagraph = corona;

    scene.setLayerTexture(layer, texture, {
      field,
      centre,
      opacity: opts.opacity == null ? 1 : opts.opacity,
      luma: opts.mode === 'luma' || opts.mode === 'lumaAdd' || corona,
      mode: opts.mode || 'normal',
      coronagraph: corona,
      flipY: false
    });

    // A coronagraph's occulter would be lit from behind by the glow.
    scene.setGlowVisible(!scene.layers.some(l => l.texture && l.coronagraph));

    return describeSlot(index);
  }

  /* What a slot is showing, in the terms the provenance block needs: which
     instrument, when, how old, and how sharp. `ageMinutes` is the one that
     belongs on screen rather than in a panel — AIA runs about fifty minutes
     behind, and that is the processing chain, not the instrument. */
  function describeSlot(index) {
    const layer = scene.layers[index];
    if (!layer || !layer.meta) return null;
    const src = SOURCE_BY_ID.get(layer.sourceId) || {};
    const observed = new Date(layer.meta.date.replace(' ', 'T') + 'Z');
    const screenPx = world.renderer()
      ? Math.min(world.renderer().domElement.height || 0,
                 world.renderer().domElement.width || 0) || 900
      : 900;
    return {
      slot: index,
      sourceId: layer.sourceId,
      name: src.name || layer.meta.name,
      what: src.what || null,
      observed: observed.toISOString(),
      ageMinutes: Math.round((Date.now() - observed.getTime()) / 60000),
      field: +layer.field.toFixed(4),
      nativeField: +layer.geometry.nativeField.toFixed(4),
      texPx: layer.texPx,
      distanceAu: +layer.geometry.distanceAu.toFixed(4),
      radiusArcsec: +layer.geometry.radiusArcsec.toFixed(2),
      pxPerRadius: +layer.geometry.pxPerRadius.toFixed(1),
      coronagraph: layer.coronagraph,
      sharpness: sharpness(layer.texPx, layer.field, screenPx, viewR, layer.geometry.rsun),
      earthTexels: +earthInTexels(layer.texPx, layer.field).toFixed(2)
    };
  }

  function clearSlot(index) {
    const layer = scene.layers[index];
    if (layer) scene.clearLayer(layer);
    scene.setGlowVisible(!scene.layers.some(l => l.texture && l.coronagraph));
  }

  /* THE KEY IS `solar`, NOT `sun`, AND THAT IS NOT A PREFERENCE.

     Terra already registers a state under `sun`: it flies the camera to
     Terra's own sun mesh at radius 420, the one carrying the NOAA sunspots
     placed on their measured longitudes. That is a different thing from this
     — a body in Terra's scene, versus instrument frames on a projection of
     their own — and it is real measured data, so it does not get quietly
     replaced by whichever module registers last.

     Whether the two should stay side by side, or one should absorb the other,
     is a product decision and not a technical one. Until it is made, this
     state takes a key of its own and breaks nothing. */
  const definition = {
    body: 'solar-on',
    label: 'Solar imagery',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round"><circle cx="12" cy="12" r="4.5" fill="currentColor" ' +
          'stroke="none"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2' +
          'M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/></svg>',

    /* THE FLIGHT WRITES THE CAMERA DIRECTLY, so `change` does not fire for it.
       OrbitControls raises that event from its own `update()`, and a flight that
       copies into `camera.position` never goes through it — which leaves the
       projection describing whatever VIEW_R the camera had when the flight
       started. Measured: the sun rendered 392 px across where 242 belonged, and
       it stayed that way until something else happened to move the camera.

       `transition` is view-state.js's own hook for exactly this: `step` runs on
       every frame of the flight and `end` when it lands, so the extent follows
       the camera down instead of jumping when it arrives. */
    transition: {
      step: () => { syncProjection(); },
      end: () => { syncProjection(); }
    },

    views: {
      disc: {
        locked: true,
        label: 'Disc',
        note: 'The instrument’s own line of sight — pan and zoom still work.',
        camera: cameraStand
      }
    },
    initialView: 'disc',
    camera: cameraStand,

    enter() {
      attach();
      layers.eventsOff();
      layers.environmentOff();
      scene.setVisible(true);
      holdProjection();
    },

    exit() {
      releaseProjection();
      scene.setVisible(false);
      layers.environmentRestore();
      layers.eventsRestore();
    }
  };

  if (viewStates) viewStates.register('solar', definition);

  return {
    definition,
    scene,
    api,
    /* Called once per frame by the app's own loop, alongside the other states.
       Cheap when nothing moved: it compares one distance and returns. */
    tick: syncProjection,
    loadSlot,
    clearSlot,
    describeSlot,
    setViewR,
    viewR: () => viewR,
    extents,
    /* A measurement hook, not a control. It reports what the scene is, not what
       the code meant it to be. */
    state: () => ({
      ...scene.state(),
      cameraDistance: (() => {
        const c = world.camera(), k = world.controls();
        return c && k ? +c.position.distanceTo(k.target).toFixed(1) : null;
      })(),
      slotDetail: scene.layers.map((l, i) => describeSlot(i)),
      queue: api.stats(),
      viewR: currentViewR(),
      projectionHeld: !!originalUpdate,
      aspect: safeAspect()
    })
  };
}
