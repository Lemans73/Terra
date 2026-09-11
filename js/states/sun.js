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
import { createSpotLayer } from '../layers/sun/spots.js';
import { noaaReferenceTime } from '../layers/sun/frame.js';
import { orthoBounds } from '../core/ortho-bounds.js';

/* THE INSTRUMENT HALF IS NOT IMPORTED HERE, IT IS HANDED IN.

   What this file draws — a photosphere with limb darkening, the NOAA regions on
   their measured longitudes, the earth to scale — needs nothing from the
   network. What it FETCHES does: `fetch.js` talks to a proxy that is a Vercel
   Edge Function, and `source.js` describes the instruments behind it.

   The standalone has no proxy, so it gets the drawn sun and no fetching. That
   split has to happen at the IMPORT, not behind a flag: tools/build-standalone
   walks the static import graph, and a module that is imported here comes along
   however carefully the call sites are guarded. The two imports therefore live
   in index.html between SOLAR markers, and arrive as `env.imagery`.

   A dynamic `import()` would do the same job and cost a 404 in the network tab
   of exactly the file you hand to someone else. */

/* The default view: 1.65 solar radii, which is SUVI's field. Wide enough that
   the corona has somewhere to go, tight enough that the disc still carries the
   picture. */
export const VIEW_R_DEFAULT = 1.65;
/* HOE DICHT JE MAG KOMEN, EN WAT DAT KOST (Terry, sessie 50).

   Dit stond op 1.02: de zonneschijf vult dan precies de schermhoogte en verder
   inzoomen kon niet. Dat is dichterbij dan de oude zon-state toeliet noch verder
   — die kwam met een perspectiefcamera tot ongeveer 0,75 — en het knelde twee
   dingen tegelijk af. Je kon geen gebied van dichtbij bekijken, en de
   scherpte-indicator kon zijn eigen amberdrempel niet halen: de verhouding liep
   tot 1,01 waar amber bij 1,25 begint.

   DE LADDER, doorgerekend met fieldFor/textureSize/sharpness zelf, voor AIA
   (rsun = 1589 bronpixels per zonsstraal, plafond 2048 texels):

     schermbuffer 1994 px   groen tot 0,75 · rood vanaf ~0,63
     schermbuffer 1080 px   groen tot 0,40 · rood vanaf ~0,25

   Tot VIEW_R ≈ 0,52 blijft de verhouding na opnieuw ophalen constant, want het
   texelplafond en het 1,25× ruimere veld schalen allebei mee met de zoom: elke
   keer opnieuw ophalen levert dan echt meer detail. Daaronder haal je de bron op
   ware resolutie en is 1589 wat er is; verder inzoomen vergroot texels.

   0,25 IS BEWUST VOORBIJ DAT PUNT (Terry, sessie 50): op die stand breng je een
   flare fatsoenlijk in kaart, en de zachtheid stoort daarbij niet. De indicator
   zegt er eerlijk bij dat je voorbij de bron zit — zelfde regel als bij het
   zwarte gat van de coronagraaf: liever waar en onprettig dan glad en onwaar.

   LET OP BIJ EEN CORONAGRAAF. Zo diep zit je ruim binnen de occulter — C3 blankt
   tot 4,67 R☉ — en dan is elke pixel zwart. Dat was op 1,02 ook al zo; wat het
   draaglijk maakt is dat js/ui/solar-orient.js het benoemt in plaats van je
   ernaar te laten raden. Zonder die regel is dit het zwarte scherm dat sessie 49
   een halve sessie kostte. */
const VIEW_R_MIN = 0.25;
const VIEW_R_MAX = 32;

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

/* Depth is linear under an orthographic projection, so a slab this generous
   costs nothing. Under perspective the same range would be exactly the
   z-fighting that keeps `near` small.

   IT IS DERIVED FROM THE ZOOM RANGE, not from the sun. The camera distance IS
   the zoom, so at VIEW_R_MAX the camera stands at distanceFor(32) = 12800 world
   units while the layers stay at the origin. A fixed slab of SUN_WORLD_R * 40
   covered only 4000 of that, so everything past VIEW_R 10 fell outside the
   depth range and the screen went black — with every uniform, every texture and
   every transform still reading correct. Measured on LASCO C3, whose preset
   frames at 15: the plane drew six times per second and produced no pixel, and
   a solid red test shader in its place produced none either.

   The margin on top carries the meshes that do not sit at z = 0. */
const DEPTH = distanceFor(VIEW_R_MAX) + SUN_WORLD_R * 40;

export function createSunState(THREE, env) {
  const { world, layers, viewStates } = env;

  /* Destructured with null defaults so every call site below reads the way it
     did when these were imports. Absent means bare: `api` is null, loadSlot
     refuses, and describeSlot never reaches them — it returns early on a slot
     without metadata, and without fetching there is none. */
  const {
    createSunFetch = null, imageScaleFor = null,
    SOURCE_BY_ID = null, isCoronagraph = null, deriveGeometry = null,
    textureSize = null, sharpness = null, earthInTexels = null,
    minimumField = null, fieldFor = null
  } = env.imagery || {};

  /* THE BARE SUN SAYS SO ON THE BODY, and it says it by looking at what arrived
     rather than at where it is running. A `location.protocol` test would be a
     second opinion about the same fact, and it would be wrong the moment
     somebody serves the standalone over http. One writer, set once: the answer
     cannot change during a session. */
  document.body.classList.toggle('solar-bare', !createSunFetch);

  const scene = createSunScene(THREE);
  const api = createSunFetch ? createSunFetch(env.fetchOptions) : null;
  const maxImagePx = env.maxImagePx || 2048;

  /* The NOAA regions live in their own group inside the sun scene, so they
     survive a texture swap: measured data does not disappear because an image
     was loaded over it. That is the whole point of 3c. */
  const spots = createSpotLayer(THREE, scene.group);
  let spotsWanted = true;
  /* Which day's NOAA list the spots are standing on, or null when the moment
     falls outside the month NOAA keeps. The readout says so rather than showing
     an empty sun without a reason. */
  let regionDay = null;
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

  /* THE CONTROLS PAN IN A PROJECTION WE DO NOT USE.

     OrbitControls turns pixels into world units with its own perspective
     formula — `2 · d · tan(fov/2) / height` — because the camera IS a
     PerspectiveCamera; only its matrix is orthographic, and a matrix built by
     hand is not something it can read. Measured at rest, VIEW_R 1.65: our own
     half-height is 165 world units where its formula gives 307.76. The image
     would slide 1.865 times as far as the cursor, which is exactly the kind of
     wrong that looks deliberate.

     `panSpeed` scales its pixel delta, so this makes the conversion equal to our
     extent instead of arguing with it. DERIVED and not typed in: fov, zoom and
     window shape all sit in the two terms, so it follows all three.

     ONE SCALAR IS ENOUGH FOR BOTH AXES, and that is a result rather than luck.
     OrbitControls uses `clientHeight` for x as well as y; our extents put the
     aspect on whichever side is wider. Both come out at the same world-per-pixel
     either way.

     CAMERA_K could have been changed instead — at 1/tan(fov/2) the two would
     coincide — but that constant also carries the zoom limits and the depth
     slab, and this is a problem about panning alone. */
  function syncPan() {
    const cam = world.camera(), ctl = world.controls();
    if (!cam || !ctl || !cam.fov) return;
    const d = cam.position.distanceTo(ctl.target);
    const persp = d * Math.tan((cam.fov / 2) * Math.PI / 180);
    if (!(persp > 0)) return;
    ctl.panSpeed = extents().hh / persp;
  }

  function syncProjection() {
    if (!originalUpdate) return false;
    const cam = world.camera(), ctl = world.controls();
    if (!cam || !ctl) return false;
    /* VOOR de afstandspoort hieronder: die slaat een pan juist over — daar
       verandert de afstand niet — en dan zou de snelheid nooit bijgewerkt worden
       na een venstermaat die wél veranderde. */
    syncPan();
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
      /* Through orthoBounds, or an export frame (setViewOffset) is ignored and
         the file holds the whole screen stretched into its shape. */
      const b = orthoBounds(hw, hh, this.view);
      this.projectionMatrix.makeOrthographic(b.left, b.right, b.top, b.bottom, -DEPTH, DEPTH);
      this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
    };
    lastDistance = null;
    cam.updateProjectionMatrix();
    syncPan();
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
      /* A FLIGHT STILL RUNNING WRITES THE CAMERA EVERY FRAME, and this state's
         zoom IS that distance — so a distance set here is overwritten on the
         very next frame. Measured in session 49, from the entry flight: the
         preset set 6000 and the flight walked it back to 660 over the following
         second, in a smooth curve. The layers arrived, the zoom did not, and
         LASCO framed at 15 then showed nothing but its own occulter.

         An explicit choice by the visitor outranks an animation that is still
         running, so the flight is cut rather than waited out. The limits come
         back by hand: a flight opens them to 0.01 and Infinity and only
         restores them on arrival, which is an arrival that no longer happens. */
      if (env.stopFlight) {
        env.stopFlight();
        ctl.minDistance = distanceFor(VIEW_R_MIN);
        ctl.maxDistance = distanceFor(VIEW_R_MAX);
      }
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
     THE NOAA REGIONS.

     `env.solar()` hands in whatever the app already fetched — the same feed the
     ordinary earth view uses, so there is no second request and no second
     truth. `env.b0(when)` gives the heliographic latitude of the disc centre
     for a moment, out of solarPhysical().

     P IS ZERO, and that is measured: Helioviewer serves solar north up. See the
     header of js/layers/sun/frame.js for the numbers. It stays a parameter
     because another source may orient differently.
  ---------------------------------------------------------------------- */
  function refreshSpots(when) {
    if (!env.solar || !env.b0) return null;

    /* WHICH MOMENT THE SPOTS BELONG TO. When a frame is loaded it is that
       frame's observation time, so the measured positions and the photograph
       are the same instant; with an empty view it is the chosen moment. The
       lowest loaded slot decides, because that is the layer the disc itself
       comes from. */
    const shown = scene.layers.find(l => l.texture && l.meta);
    const target = shown
      ? Date.parse(shown.meta.date.replace(' ', 'T') + 'Z')
      : (when || (env.moment ? env.moment() : new Date())).getTime();

    /* AND WHICH DAY'S LIST. NOAA publishes a list per day and keeps a month of
       them; the day nearest the target is the one that describes this sun. The
       old code took today's list and turned it back, which put a region that
       emerged yesterday on a sun of five days ago. Outside the month there is
       no list, and then there are no regions rather than the wrong ones. */
    const day = env.solarAt ? env.solarAt(target) : env.solar();
    const list = (day && day.regions) || [];
    // Undefined means nothing has arrived from NOAA at all; null means lists
    // arrived and none of them covers this moment. Only the second is a finding.
    regionDay = day ? day.date : (day === undefined ? undefined : null);
    spots.setRegions(list);

    const b0 = env.b0(new Date(target));
    if (b0 == null) return null;
    // Rings over an instrument frame, filled caps on the bare sun. Derived from
    // whether a slot holds a texture, so it cannot disagree with what is drawn.
    spots.setOutline(scene.layers.some(l => !!l.texture));

    const ref = noaaReferenceTime(regionDay);
    const drawn = spots.place(b0, 0, ref, target);
    spots.setVisible(spotsWanted && drawn > 0);
    return { regions: list.length, drawn, b0: +b0.toFixed(4),
             noaaDate: regionDay,
             target: new Date(target).toISOString(),
             lonShift: spots.state().lonShift };
  }

  function setSpotsVisible(on) {
    spotsWanted = !!on;
    spots.setVisible(spotsWanted && spots.state().drawn > 0);
    return spotsWanted;
  }

  /* ----------------------------------------------------------------------
     DRAGGING THE EARTH.

     The earth to scale is the one thing in this view you want to put next to
     something: beside an active region, inside a coronal hole, against a
     prominence. A fixed corner makes the comparison you happen to get rather
     than the one you want, and it is five pixels — nudging it is the whole
     interaction.

     GRAB RADIUS SCALES WITH THE ZOOM (VIEW_R * 0.045, from the proof of
     concept). A radius in world units would be unmissable when zoomed out and
     unhittable when zoomed in; this one stays about the same on screen.

     ORBITCONTROLS GOES QUIET WHILE DRAGGING, and comes back on release. Without
     that, one gesture both moves the earth and pans the camera, and the earth
     appears to lag behind the pointer by exactly the pan.
  ---------------------------------------------------------------------- */
  let dragging = false;
  let panWasEnabled = true;
  let listenersOn = false;
  /* Wat de bediening deed voordat deze state hem verzette. Bewaren en teruggeven,
     dezelfde vorm als `panWasEnabled` hieronder — de aardweergave draait om de
     bol en heeft links op ROTATE nodig. */
  let mouseWas = null, touchWas = null, panSpeedWas = null;

  /* SLEPEN MOET PANNEN, WANT DRAAIEN BESTAAT HIER NIET.

     OrbitControls bindt links en één vinger standaard aan ROTATE, en die tak
     staat in deze state uit: de kijkrichting ís het instrument. Gemeten gevolg:
     `enablePan` stond op true, rechtsslepen pande netjes, en het gebaar dat
     iedereen als eerste probeert deed niets.

     Het slepen van de aarde blijft voorgaan. `onPointerDown` vangt met
     `capture: true` af vóór OrbitControls en zet `enablePan` uit zolang je
     vasthoudt — precies het conflict waar die regel al voor bestond. */
  function bindPanGesture(on) {
    const ctl = world.controls();
    if (!ctl) return;
    if (on) {
      if (mouseWas) return;
      mouseWas = { ...ctl.mouseButtons };
      touchWas = { ...ctl.touches };
      /* OOK DE SNELHEID TERUGGEVEN. `syncPan()` zet hem op onze eigen maat, en
         die maat geldt alleen hier — de aardweergave pant met een echte
         perspectiefprojectie en zou anders 46 % te traag schuiven. Gemeten:
         0,536 bleef staan na vertrek. */
      panSpeedWas = ctl.panSpeed;
      ctl.mouseButtons = { ...ctl.mouseButtons, LEFT: THREE.MOUSE.PAN };
      ctl.touches = { ...ctl.touches, ONE: THREE.TOUCH.PAN };
    } else {
      if (mouseWas) ctl.mouseButtons = mouseWas;
      if (touchWas) ctl.touches = touchWas;
      if (panSpeedWas != null) ctl.panSpeed = panSpeedWas;
      mouseWas = touchWas = panSpeedWas = null;
    }
  }

  /* Screen point to world point on the z = 0 plane. Uses unproject rather than
     arithmetic on the extents, so it stays correct however OrbitControls has
     panned or zoomed since. */
  function pointerToWorld(ev) {
    const cam = world.camera(), el = world.renderer().domElement;
    const r = el.getBoundingClientRect();
    const ndc = new THREE.Vector3(
      ((ev.clientX - r.left) / r.width) * 2 - 1,
      -((ev.clientY - r.top) / r.height) * 2 + 1,
      0
    );
    ndc.unproject(cam);
    return ndc;
  }

  function onPointerDown(ev) {
    if (!scene.earth.visible) return;
    const w = pointerToWorld(ev);
    const grab = currentViewR() * 0.045 * SUN_WORLD_R;
    const dx = w.x - scene.earth.position.x * SUN_WORLD_R;
    const dy = w.y - scene.earth.position.y * SUN_WORLD_R;
    if (Math.hypot(dx, dy) > grab) return;

    dragging = true;
    const ctl = world.controls();
    panWasEnabled = ctl.enablePan;
    ctl.enablePan = false;
    world.renderer().domElement.setPointerCapture(ev.pointerId);
    ev.stopPropagation();
  }

  function onPointerMove(ev) {
    if (!dragging) return;
    const w = pointerToWorld(ev);
    // Back into the group's own units: the group is scaled by SUN_WORLD_R, so
    // its children count in solar radii.
    scene.earth.position.x = w.x / SUN_WORLD_R;
    scene.earth.position.y = w.y / SUN_WORLD_R;
    ev.stopPropagation();
  }

  function onPointerUp(ev) {
    if (!dragging) return;
    dragging = false;
    world.controls().enablePan = panWasEnabled;
    try { world.renderer().domElement.releasePointerCapture(ev.pointerId); } catch {}
  }

  /* Bound on entry and unbound on exit. A listener that outlives its state is a
     listener that fires in a view it knows nothing about — and `capture: true`
     means this one runs before OrbitControls sees the event, which is the only
     way to keep a drag from also panning. */
  function bindDrag(on) {
    const el = world.renderer() && world.renderer().domElement;
    if (!el || on === listenersOn) return;
    const method = on ? 'addEventListener' : 'removeEventListener';
    el[method]('pointerdown', onPointerDown, true);
    el[method]('pointermove', onPointerMove, true);
    el[method]('pointerup', onPointerUp, true);
    el[method]('pointercancel', onPointerUp, true);
    listenersOn = on;
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
    if (!api) throw new Error('sun state: no imagery half, nothing to fetch');
    const layer = scene.layers[index];
    if (!layer) throw new Error('no slot ' + index);

    const corona = isCoronagraph(sourceId);
    const meta = await api.closestImage(sourceId, when || new Date());
    const geom = deriveGeometry(meta, corona);

    /* What to fetch. The rule lives in fieldFor() so it can be checked without
       a browser; what belongs here is when a load counts as the FIRST one.

       That is per slot and per source, not per session: putting a different
       instrument into a slot is a first look at that instrument, however many
       frames came before it. `!layer.texture` covers the slot that was cleared
       and refilled with the same source, which is a first look again.

       Session 49, and neither half was found by measuring. The floor came from
       Terry noticing that the presets worked and picking the same two sources
       by hand did not — the presets set VIEW_R to 15 first, and that was the
       only difference between the paths. At the default 1.65 the old formula
       asked for 2.06 radii of LASCO C3, entirely inside a 4.67 occulter: every
       pixel black, no error, and a request that reads as perfectly sensible.
       The first-load rule came from him noticing what was left afterwards — a
       crop narrower than what the instrument actually serves. */
    const firstLoad = layer.sourceId !== sourceId || !layer.texture;
    const field = opts.field != null
      ? opts.field
      : fieldFor(geom.nativeField, viewR, sourceId, firstLoad);

    /* AND THE CAMERA HAS TO BE ABLE TO SEE IT. Fetching past the occulter is
       half the job: with the camera still inside that hole the frame arrives,
       costs its seconds and megabytes, and shows nothing at all.

       THE TEST IS THE OCCULTER, NOT THE FETCH FLOOR. Those are different
       numbers and using the wrong one overreaches: framed at 6 radii of LASCO
       C3 you are looking at the ring from 4.67 outwards, which is real data
       and a perfectly reasonable thing to want. Only a view that would show
       nothing at all gets moved.

       Raised only, never lowered — someone who has zoomed out stays there. */
    const occulter = (SOURCE_BY_ID.get(sourceId) || {}).occulter;
    if (occulter && viewR <= occulter * 1.05) setViewR(minimumField(sourceId));

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
    refreshSpots();

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
      /* The occulter belongs with the slot, not with the caller. It is the one
         hardcoded number in this layer — the metadata describes the detector,
         not the disc in front of it — and whoever reports a black centre needs
         to be able to say how big it is. */
      occulter: src.occulter || null,
      // Wie het beeld bezit. Helioviewer levert het, deze naam maakte het.
      owner: src.owner || null,
      sharpness: sharpness(layer.texPx, layer.field, screenPx, viewR, layer.geometry.rsun),
      earthTexels: +earthInTexels(layer.texPx, layer.field).toFixed(2)
    };
  }

  function clearSlot(index) {
    const layer = scene.layers[index];
    if (layer) scene.clearLayer(layer);
    scene.setGlowVisible(!scene.layers.some(l => l.texture && l.coronagraph));
    refreshSpots();
  }

  /* THE KEY IS `sun`, AND THIS IS THE ONLY STATE THAT ANSWERS TO IT.

     Terra used to register a second state under that key: a flight to its own
     sun mesh at radius 420, carrying the same NOAA regions. Two entries in
     Navigate for one subject, and two answers to `isActive('sun')`. That state
     is gone; this one took the key.

     The body class stays `solar-on`. It names the module rather than the menu
     entry, every rule in app.css hangs off it, and the standalone cut keys on
     the same word. */
  const definition = {
    body: 'solar-on',
    label: 'Sun',
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
      /* Before anything else: a playback still running from the earth view
         would keep moving the moment while the time island is hidden, and the
         next Fetch would ask for wherever it had drifted to. */
      if (env.stopPlayback) env.stopPlayback();
      /* The strip takes over the clock here and not in a change listener: those
         fire after the next state's enter, and a state that saves the clock on
         the way in would save the sun's moment as the visitor's. */
      const strip = env.timeStrip ? env.timeStrip() : null;
      if (strip) strip.enter();
      attach();
      bindPanGesture(true);
      layers.eventsOff();
      layers.environmentOff();
      scene.setVisible(true);
      // Derived, not assumed: re-entering with slots still loaded must not put a
      // bare sun behind an instrument frame.
      scene.syncBare();
      refreshSpots();
      holdProjection();
      bindDrag(true);
    },

    exit() {
      // First, so the visitor's moment is back before anything else reads it.
      const strip = env.timeStrip ? env.timeStrip() : null;
      if (strip) strip.exit();
      bindPanGesture(false);
      bindDrag(false);
      releaseProjection();
      scene.setVisible(false);
      layers.environmentRestore();
      layers.eventsRestore();
    }
  };

  if (viewStates) viewStates.register('sun', definition);

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
    spots,
    /* For the region labels in index.html: where each visible region sits, in
       world coordinates. A getter and not a stored list — the spots move with
       every refresh, and a list handed out once is a list that goes stale
       without saying so. */
    labelAnchors: () => spots.labelAnchors(),
    refreshSpots,
    setSpotsVisible,
    /* Where the earth stands, and a way to put it back. Both in solar radii. */
    earthPosition: () => ({ x: scene.earth.position.x, y: scene.earth.position.y }),
    setEarthPosition: (x, y) => scene.earth.position.set(x, y, scene.earth.position.z),
    extents,
    /* A measurement hook, not a control. It reports what the scene is, not what
       the code meant it to be. */
    state: () => ({
      ...scene.state(),
      spots: spots.state(),
      regionDay,
      cameraDistance: (() => {
        const c = world.camera(), k = world.controls();
        return c && k ? +c.position.distanceTo(k.target).toFixed(1) : null;
      })(),
      slotDetail: scene.layers.map((l, i) => describeSlot(i)),
      queue: api ? api.stats() : null,
      viewR: currentViewR(),
      /* WAAR HET VENSTER STAAT, IN ZONSSTRALEN. De uitsnede is niet meer per se
         gecentreerd sinds er gepand kan worden, en een tekenaar die het midden
         aanneemt tekent een kader dat altijd klopt en nooit iets zegt. Uit de
         controls en de extents, dus het is wat er STAAT en niet wat er bedoeld
         was. */
      viewCentre: (() => {
        const k = world.controls();
        return k ? { x: k.target.x / SUN_WORLD_R, y: k.target.y / SUN_WORLD_R } : { x: 0, y: 0 };
      })(),
      viewHalf: (() => {
        const e = extents();
        return { w: e.hw / SUN_WORLD_R, h: e.hh / SUN_WORLD_R };
      })(),
      projectionHeld: !!originalUpdate,
      aspect: safeAspect()
    })
  };
}
