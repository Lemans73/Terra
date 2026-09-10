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

import { solarFrame, spotDirection, isFacing, longitudeAt } from './frame.js';

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
  /* UMBRA AND PENUMBRA, and that is not decoration.

     A flat dark cap the size of a real spot group is a handful of pixels of one
     colour, and against a bright photosphere it antialiases into the background
     until it reads as a warm speck rather than as a spot. Terry's session 49
     screenshot is exactly that: nine caps present, none of them legible.

     A real spot is not flat either — a dark umbra inside a lighter penumbra —
     so the shape that carries the meaning is also the shape that is true. The
     gradient buys the legibility that a bigger cap would have bought by lying
     about the size.

     `vUv.y` runs from the pole of the cap to its edge, so it IS the radial
     coordinate here; no second attribute is needed. The edge fades to nothing
     rather than ending on a hard rim, which at this size would alias into a
     ring and read as the annotation the outlined variant is for. */
  const filled = new THREE.ShaderMaterial({
    uniforms: {
      uUmbra:    { value: new THREE.Color(0x180a03) },
      uPenumbra: { value: new THREE.Color(0x6b3a15) }
    },
    vertexShader:
      'varying vec2 vUv;' +
      'void main(){ vUv = uv;' +
      ' gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:
      'uniform vec3 uUmbra;' +
      'uniform vec3 uPenumbra;' +
      'varying vec2 vUv;' +
      'void main(){' +
      '  float r = clamp(vUv.y, 0.0, 1.0);' +
      '  vec3 c = mix(uUmbra, uPenumbra, smoothstep(0.30, 0.92, r));' +
      '  float a = 1.0 - smoothstep(0.86, 1.0, r);' +
      '  gl_FragColor = vec4(c, a);' +
      '}',
    transparent: true, depthTest: false, depthWrite: false
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
  function place(b0Deg, pDeg, refMs, targetMs) {
    if (b0Deg != null) frame = solarFrame(b0Deg, pDeg || 0);
    if (!frame) return 0;
    let shown = 0;
    for (let i = 0; i < regions.length; i++) {
      const m = meshes[i];
      if (!m) continue;
      /* CARRIED FORWARD FROM NOAA'S OWN INSTANT to the one being drawn — see
         longitudeAt() in frame.js for why that instant is the end of
         observed_date and not its start. Without it every spot sits where it
         was up to a day ago, which still lands on the disc at the right
         latitude and so reads as correct. */
      const lon = longitudeAt(regions[i].lat, regions[i].lon, refMs, targetMs);
      const v = spotDirection(frame, regions[i].lat, lon);
      if (!isFacing(v)) { m.visible = false; continue; }
      m.visible = true;
      _dir.set(v.x, v.y, v.z).normalize();
      m.quaternion.setFromUnitVectors(_Y, _dir);
      m.userData.dir = { x: v.x, y: v.y, z: v.z };
      m.userData.lonShift = lon - regions[i].lon;
      shown++;
    }
    return shown;
  }

  /* WHERE THE LABELS GO, asked rather than recomputed.

     index.html draws the region labels — an HTML element with a leader line per
     spot, and a click that opens the NOAA detail card. It used to derive their
     positions itself from the earth view's sun: that sun's centre, that sun's
     radius, that sun's basis. None of those exist here, where the sun sits at
     the origin with radius 1 inside a group that is scaled to world units.

     So the layer answers the question instead of the caller guessing at it.
     WORLD coordinates via matrixWorld, because that is what a caller needs to
     project, and it stays right if the group is ever moved or rescaled.

     `facing` is the layer's own visibility test rather than a threshold the
     caller picks. Under this orthographic view the observer looks down +z, so
     it is a different test from the earth view's — and a borrowed threshold is
     how session 48 lost an afternoon to spot radii from another scene. */
  const _anchor = new THREE.Vector3();
  function labelAnchors() {
    const out = [];
    group.updateWorldMatrix(true, false);
    for (let i = 0; i < regions.length; i++) {
      const m = meshes[i];
      if (!m || !m.visible || !m.userData.dir) continue;
      const d = m.userData.dir;
      _anchor.set(d.x, d.y, d.z).normalize().multiplyScalar(SHELL)
             .applyMatrix4(group.matrixWorld);
      out.push({
        region: regions[i].region,
        data: regions[i],
        world: { x: _anchor.x, y: _anchor.y, z: _anchor.z },
        dir: { x: d.x, y: d.y, z: d.z },
        // Een functie, zodat beide zonnen dezelfde vorm teruggeven. Hier hangt
        // hij niet van de camera af: de waarnemer kijkt per constructie langs
        // +z, dus de zichtbare helft is z > 0 en niets anders.
        facing: () => d.z > 0
      });
    }
    return out;
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
      /* The applied rotation, so it can be READ rather than inferred. A
         correction nobody can see the size of is a correction nobody can check,
         and this one moves every spot by nearly the same amount — which is
         exactly the kind of error that still looks deliberate. */
      lonShift: visible.length && visible[0].userData.lonShift != null
        ? +visible[0].userData.lonShift.toFixed(2) : null,
      positions: visible.slice(0, 12).map(m => ({
        region: m.userData.region,
        x: +m.userData.dir.x.toFixed(4),
        y: +m.userData.dir.y.toFixed(4),
        z: +m.userData.dir.z.toFixed(4)
      }))
    };
  }

  return { group, setRegions, place, setVisible, setOutline, state,
           labelAnchors, frame: () => frame };
}
