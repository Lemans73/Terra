/* ============================================================
   TERRA — Sun · the NOAA regions, on top of whatever is showing
   ------------------------------------------------------------
   WHY THIS LAYER IS THE INTERESTING ONE.

   Everything else in the solar state is image data: projected,
   colour-coded, through a processing chain, and outside Terra's
   measurability rule. These are not. NOAA publishes each active region
   with a heliographic latitude and longitude, a spot count and an area
   — numbers you can check, from the same feed that carries the X-ray
   flux.

   Drawing them ON the instrument frame is what makes that difference
   visible instead of merely stated. A visitor sees measured positions
   sitting on a photograph, and can judge for themselves whether they
   agree. On HMI continuum they should land on the dark spots; on AIA
   171 there is nothing dark to land on, and what they mark is where
   the coronal loops are rooted.

   CAPS, NOT DISCS — the same reasoning as in js/sunmoon-layer.js. A
   flat disc touches the sphere at one point and leaves it from there,
   so near the limb it sticks out past the silhouette and a spot hangs
   visibly beside the sun. A cap of the same sphere follows the
   curvature exactly, cannot leave the silhouette, and foreshortens
   into the ellipse a real spot shows there.

   THE SIZE IS CALIBRATED, not chosen to look right: sqrt(area)/12,
   measured in session 12 against the SDO/HMI continuum of 2026-08-02.
   `extent` looked like the better field — it is literally the extent in
   degrees — but it predicts the visible spot poorly, because it covers
   the whole active region while `area` covers only the dark part.
   ============================================================ */

import { solarFrame, spotDirection, isFacing } from './frame.js';

/* Same expression and the same bounds as sunmoon-layer.js. Duplicated rather
   than imported because that module is a three.js layer bound to the earth
   scene, and importing it here would drag the whole sun-and-moon apparatus into
   a state that needs one number from it. If the calibration ever changes it
   changes in two places, which is why it says so here.

   THE UNITS ARE THE OLD LAYER'S, NOT SOLAR RADII. That expression was
   calibrated against a scene where the sun has radius 22, so it returns 0.30 to
   2.2 in those units — and here the sun has radius 1. Dividing by 22 is what
   converts it, and leaving it out makes every cap a 64-degree hemisphere:
   asin(min(0.9, 1.15)) rather than asin(1.15 / 22). The result was a green rim
   all the way round the limb and no spots anywhere, which reads as a depth
   problem rather than as a scale one. */
const SUNMOON_SUN_RADIUS = 22;

const spotRadius = s =>
  Math.max(0.30, Math.min(2.2, Math.sqrt(Math.max(s.area || 0, 10)) / 12))
  / SUNMOON_SUN_RADIUS;

/* Slightly outside the unit sphere, so the cap wins the depth comparison
   against the disc it sits on without needing depth writes. */
const SHELL = 1.002;

export function createSpotLayer(THREE, parent) {
  const group = new THREE.Group();
  group.name = 'sun-spots';
  group.visible = false;
  parent.add(group);

  const meshes = [];
  let regions = [];
  let frame = null;
  /* TRANSPARENT, AND THAT IS NOT ABOUT OPACITY.

     three.js renders every opaque object first and every transparent one after,
     and `renderOrder` only sorts WITHIN one of those lists. The solar disc is a
     ShaderMaterial with transparent: true, so an opaque cap — however high its
     renderOrder — is drawn in the first pass and then painted over by the disc
     in the second. Measured: renderOrder 60 against the disc's 1, depthTest off
     on both, and a 34-degree cap still produced zero pixels.

     Marking the caps transparent puts them in the same list as the disc, where
     renderOrder means what it says. */
  const filled = new THREE.MeshBasicMaterial({
    color: 0x2b1508, transparent: true, depthTest: false, depthWrite: false
  });
  /* The ring carries Terra's own region colour (COLORS.region, the warm orange
     of the photosphere) rather than the spot's near-black: over a bright
     continuum frame a dark ring would read as another spot instead of as a
     mark. */
  const outlined = new THREE.MeshBasicMaterial({
    color: 0xffb347, transparent: true, opacity: 0.85,
    depthTest: false, depthWrite: false, side: THREE.DoubleSide
  });
  let outline = false;

  /* TWO SHAPES, AND WHICH ONE IS SHOWING SAYS WHAT THE LAYER IS DOING.

     On the bare sun there is nothing underneath, so a filled cap IS the spot —
     that is what the earth view has always drawn.

     Over an instrument frame a filled cap is wrong in a way that is easy to
     miss: it hides the very pixels a viewer would use to judge whether the
     measured position agrees with the photograph. Measured data laid over image
     data has to point, not cover. So there it becomes a ring — the same cap
     with its middle taken out, still following the curvature, still
     foreshortening at the limb.

     A ring on a sphere is a band of latitude on that sphere, which is why this
     is a thetaStart/thetaLength pair rather than a RingGeometry: a flat ring
     would leave the surface exactly the way a flat disc does. */
  function capGeometry(radius) {
    const alpha = Math.asin(Math.min(0.9, radius));
    return new THREE.SphereGeometry(SHELL, 24, 12, 0, Math.PI * 2, 0, alpha);
  }

  function ringGeometry(radius) {
    // A little wider than the cap, so the measured position is circled rather
    // than covered, with the line thin enough to read as an annotation.
    const alpha = Math.asin(Math.min(0.9, radius * 1.6));
    return new THREE.SphereGeometry(SHELL, 32, 2, 0, Math.PI * 2, alpha * 0.78, alpha * 0.22);
  }

  /* The cap is built around +Y, so placing it is one rotation and no
     translation. Not `lookAt`: that works in world space through a parent matrix
     which may be a frame out of date, and a quaternion between two unit vectors
     says exactly what is meant. Same trap as session 12's 12-degree tilt in the
     standalone build. */
  const _Y = new THREE.Vector3(0, 1, 0);
  const _dir = new THREE.Vector3();

  function setRegions(list) {
    regions = Array.isArray(list) ? list.filter(r => r.lat != null && r.lon != null) : [];

    while (meshes.length < regions.length) {
      const m = new THREE.Mesh(capGeometry(1), outline ? outlined : filled);
      m.renderOrder = 60;      // over the disc, under the earth marker
      meshes.push(m);
      group.add(m);
    }
    meshes.forEach((m, i) => {
      m.visible = i < regions.length;
      if (!m.visible) return;
      m.geometry.dispose();
      const r = spotRadius(regions[i]);
      m.geometry = outline ? ringGeometry(r) : capGeometry(r);
      m.material = outline ? outlined : filled;
      m.userData.region = regions[i].region;
      m.userData.radius = r;
    });
    place();
    return regions.length;
  }

  /**
   * Put every region where it belongs for this B0 and P.
   *
   * A region on the far side is hidden rather than drawn: under an orthographic
   * projection a cap at z < 0 lands on the near hemisphere mirrored, which is a
   * spot in a place where there is no spot — the exact failure this layer exists
   * to make checkable.
   */
  function place(b0Deg, pDeg) {
    if (b0Deg != null) frame = solarFrame(b0Deg, pDeg || 0);
    if (!frame) return 0;
    let shown = 0;
    for (let i = 0; i < regions.length; i++) {
      const m = meshes[i];
      if (!m) continue;
      const v = spotDirection(frame, regions[i].lat, regions[i].lon);
      if (!isFacing(v)) { m.visible = false; continue; }
      m.visible = true;
      _dir.set(v.x, v.y, v.z).normalize();
      m.quaternion.setFromUnitVectors(_Y, _dir);
      m.userData.dir = { x: v.x, y: v.y, z: v.z };
      shown++;
    }
    return shown;
  }

  function setVisible(on) { group.visible = !!on; }

  /** Filled caps on the bare sun, rings over an instrument frame. */
  function setOutline(on) {
    if (outline === !!on) return outline;
    outline = !!on;
    for (const m of meshes) {
      if (!m.userData.radius) continue;
      m.geometry.dispose();
      m.geometry = outline ? ringGeometry(m.userData.radius) : capGeometry(m.userData.radius);
      m.material = outline ? outlined : filled;
    }
    return outline;
  }

  /* Reads the scene rather than the intent: how many caps are actually in the
     group, actually visible, and where they sit. A count that comes from
     `regions.length` would report success while nothing was drawn. */
  function state() {
    const visible = meshes.filter(m => m.visible && m.parent === group);
    return {
      layerVisible: group.visible,
      inScene: !!group.parent,
      regions: regions.length,
      drawn: visible.length,
      b0: frame ? +frame.b0.toFixed(4) : null,
      p: frame ? frame.p : null,
      outline,
      positions: visible.slice(0, 12).map(m => ({
        region: m.userData.region,
        x: +m.userData.dir.x.toFixed(4),
        y: +m.userData.dir.y.toFixed(4),
        z: +m.userData.dir.z.toFixed(4)
      }))
    };
  }

  return { group, setRegions, place, setVisible, setOutline, state, frame: () => frame };
}
