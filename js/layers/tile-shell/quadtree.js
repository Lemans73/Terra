/* ============================================================
   TERRA — Tile quadtree · which tiles are worth drawing
   ------------------------------------------------------------
   Owns the tree and the geometry pool, and nothing else. It does
   not know about materials, textures or the network: it answers
   one question per frame — given this camera, which nodes should
   be on screen — and hands back the geometry for them.

   TWO THINGS IN HERE COST A DAY EACH IN THE PROOF OF CONCEPT,
   and both are silent when you get them wrong:

   HORIZON CULLING GOES OVER THE BOUNDING SPHERE, not over sampled
   points. With large tiles every sampled point (corners plus
   centre) can sit behind the horizon while the INSIDE of the tile
   is straight below the camera. The result was a black screen at
   exactly one altitude — around 2470 km in the proof of concept.
   The maximum of dot(P, C) over a sphere with centre Bc and
   radius Br is dot(Bc, C) + Br * |C|, and that is what is tested.

   SIXTEEN BY SIXTEEN SEGMENTS, not one. A tile is a curved patch
   on a sphere; the triangles between its vertices stay flat and
   run under the surface as a chord. Too few segments and the
   middle of a tile sinks into the globe.

   THE GEOMETRY MAY SPLIT DEEPER THAN THE SOURCE GOES. A sphere
   made of one texture still needs enough triangles to look round.
   Requests are capped separately, in clampNode.
   ============================================================ */

import {
  TILE_DEG, tileBounds, clipToWorld, tileCountX, tileCountY,
  tileSpanLon, lonLatToVec3
} from './sources.js';

export function createQuadtree(THREE, opts = {}) {
  const radius = opts.radius || 100;
  const segments = opts.segments || 16;
  let grid = opts.grid;
  let source = opts.source;
  if (!grid || !source) throw new Error('createQuadtree: grid en source zijn verplicht');

  const klem = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /* ---- geometry pool ----------------------------------------------------
     Tiles come and go every frame while the camera moves. Allocating a fresh
     BufferGeometry each time is what turns smooth panning into stutter, so used
     geometries go back on a stack and are refilled in place. The INDEX is shared
     across all of them — it only depends on the segment count. */
  const indexCache = new Map();
  const geoPool = [];
  const _v = new THREE.Vector3();

  function sharedIndex(seg) {
    if (indexCache.has(seg)) return indexCache.get(seg);
    const idx = [];
    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < seg; i++) {
        const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const attr = new THREE.BufferAttribute(new Uint32Array(idx), 1);
    indexCache.set(seg, attr);
    return attr;
  }

  /* GEEN SKIRTS, en dat is gemeten en niet aangenomen. Tussen twee tegels van
     verschillend niveau ontstaat wiskundig een T-junctie: de fijnere heeft daar
     vertices die de grovere niet heeft, en daartussen loopt de grovere als een
     rechte koorde onder het oppervlak door. Dat is de klassieke reden voor een
     randje langs elke tegel.

     ALLEEN: die koorde zakt op level 2 hooguit 0,12 eenheden weg, en dat is op
     camera-afstand 235 nog geen halve beeldpixel. GEMETEN met de tegels fel
     gekleurd, alles eromheen weg, en geteld binnen de bolomtrek: NUL ongedekte
     pixels — met skirt en zonder, op 71 tegels over zes niveaus. Dieper splitsen
     maakt de tegels fijner en de fout kleiner, dus het loopt niet weg.

     Een skirt zou 25 % meer vertices per tegel kosten voor niets. Komt er ooit een
     zichtbare naad, dan is dit de plek: een extra ring in dit raster op een iets
     kleinere straal. */
  function acquireGeometry() {
    if (geoPool.length) return geoPool.pop();
    const n = (segments + 1) * (segments + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    /* A second UV set, on longitude and latitude. The world maps — night,
       clouds, specular, relief — are ONE texture each and do not sit on the tile
       grid, so they are sampled on this one no matter which grid is underneath. */
    g.setAttribute('worldUv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    /* THE NORMAL IS NOT OPTIONAL, however obvious it looks that it is: on a
       sphere centred at the origin the normal IS the normalised position, so it
       feels like the shader could work it out. It does not — it reads the
       `normal` ATTRIBUTE, and a missing attribute is (0,0,0), not an error.

       MEASURED what that costs: the day/night terminator, the fresnel rim and
       every lighting term collapse, and the shell renders at mean brightness
       32.8 against the sphere's 12.1. It looks like a lit earth, just the wrong
       one — which is why only a pixel comparison catches it. */
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setIndex(sharedIndex(segments));
    g.boundingSphere = new THREE.Sphere();
    return g;
  }

  function releaseGeometry(g) { geoPool.push(g); }

  /* `clip` is the trimmed shape that gets drawn, `full` the untrimmed tile the
     IMAGE covers. Keeping them apart is what lets a tile hang over the edge of
     the world without its texture sliding. */
  function fillGeometry(g, clip, full) {
    const pos = g.attributes.position.array;
    const nrm = g.attributes.normal.array;
    const uv = g.attributes.uv.array;
    const wuv = g.attributes.worldUv.array;
    const fullLon = full.east - full.west, fullLat = full.north - full.south;
    const clipLon = clip.east - clip.west, clipLat = clip.north - clip.south;
    let k = 0, m = 0;
    for (let j = 0; j <= segments; j++) {
      const lat = clip.north - (j / segments) * clipLat;
      for (let i = 0; i <= segments; i++) {
        const lon = clip.west + (i / segments) * clipLon;
        lonLatToVec3(lon, lat, radius, _v);
        pos[k] = _v.x; pos[k + 1] = _v.y; pos[k + 2] = _v.z;
        nrm[k] = _v.x / radius; nrm[k + 1] = _v.y / radius; nrm[k + 2] = _v.z / radius;
        uv[m] = (lon - full.west) / fullLon;
        uv[m + 1] = 1 - (full.north - lat) / fullLat;
        wuv[m] = (lon + 180) / 360;
        wuv[m + 1] = (lat + 90) / 180;
        k += 3; m += 2;
      }
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.attributes.uv.needsUpdate = true;
    g.attributes.worldUv.needsUpdate = true;
    return g;
  }

  /* ---- the tree --------------------------------------------------------- */

  let nodeCount = 0;
  let frameId = 0;
  const roots = [];

  class QuadNode {
    constructor(level, x, y, parent) {
      this.level = level; this.x = x; this.y = y;
      this.parent = parent || null;
      this.bounds = tileBounds(grid, level, x, y);
      this.clip = clipToWorld(this.bounds);
      this.children = null; this.mesh = null; this.idle = 0; this.lastVisited = 0;

      const c = this.clip || this.bounds;
      this.center = lonLatToVec3((c.west + c.east) / 2, (c.north + c.south) / 2, radius, new THREE.Vector3());
      const corners = [
        lonLatToVec3(c.west, c.north, radius, new THREE.Vector3()),
        lonLatToVec3(c.east, c.north, radius, new THREE.Vector3()),
        lonLatToVec3(c.west, c.south, radius, new THREE.Vector3()),
        lonLatToVec3(c.east, c.south, radius, new THREE.Vector3())
      ];
      this.boundRadius = Math.max(...corners.map((p) => p.distanceTo(this.center))) || radius * 0.01;
      this.texelSize = (tileSpanLon(grid, level) * TILE_DEG * radius) / grid.tileSize;
    }

    ensureChildren() {
      if (this.children) return this.children;
      const l = this.level + 1, x = this.x * 2, y = this.y * 2;
      this.children = [];
      for (const [cx, cy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) {
        const child = new QuadNode(l, cx, cy, this);
        if (child.clip) { this.children.push(child); nodeCount++; }
      }
      return this.children;
    }
  }

  function buildRoots() {
    roots.length = 0; nodeCount = 0;
    const l = source.minLevel;
    for (let x = 0; x < tileCountX(grid, l); x++) {
      for (let y = 0; y < tileCountY(grid, l); y++) {
        const node = new QuadNode(l, x, y, null);
        if (node.clip) { roots.push(node); nodeCount++; }
      }
    }
    return roots;
  }

  /* ---- selection -------------------------------------------------------- */

  const view = {
    position: new THREE.Vector3(),
    frustum: new THREE.Frustum(),
    screenHeight: 1,
    tanHalfFov: 1
  };
  const _sphere = new THREE.Sphere();
  const _mat4 = new THREE.Matrix4();

  function setView(camera, screenHeight) {
    view.position.copy(camera.position);
    view.screenHeight = screenHeight;
    view.tanHalfFov = Math.tan((camera.fov * TILE_DEG) / 2);
    _mat4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    view.frustum.setFromProjectionMatrix(_mat4);
  }

  function isVisible(node) {
    const c = view.position;
    // Conservative: see the note at the top about why this is the whole sphere.
    if (node.center.dot(c) + node.boundRadius * c.length() < radius * radius) return false;
    _sphere.center.copy(node.center);
    _sphere.radius = node.boundRadius;
    return view.frustum.intersectsSphere(_sphere);
  }

  /* Screen space error: how many screen pixels one texel of this tile covers.
     Above the threshold the tile is too coarse for where the camera is and it
     splits. This is the ONE place where "how sharp" is defined, and it is the
     direct bandwidth knob — the cost scales with its square. */
  function screenError(node) {
    const dist = Math.max(view.position.distanceTo(node.center) - node.boundRadius, 1e-7);
    return (node.texelSize * view.screenHeight) / (dist * 2 * view.tanHalfFov);
  }

  const geometryMaxLevel = () => klem(source.maxLevel + 2, 6, 18);

  /* A FLOOR UNDER THE SPLITTING, and it is not about sharpness but about SHAPE.
     Screen space error asks how coarse the IMAGE is; a source with one world
     texture answers "fine enough" while the sphere is still made of a handful of
     flat patches. Measured chord error — how far the middle of a triangle sinks
     below the surface — on radius 100 with 16 segments, in screen pixels at
     camera distance 350:

         level 0   22.50 deg/segment   1.921 units   7.93 px
         level 1   11.25 deg/segment   0.482 units   1.99 px
         level 2    5.63 deg/segment   0.120 units   0.50 px   <- first sub-pixel
         level 3    2.81 deg/segment   0.030 units   0.12 px

     Level 2 is therefore the floor, with margin. It costs 8 root patches that
     always exist; below it the globe reads as a polyhedron when zoomed out. */
  const minSplitLevel = opts.minSplitLevel === undefined ? 2 : opts.minSplitLevel;

  function visit(node, out, maxLevel, threshold) {
    if (!isVisible(node)) return;
    node.lastVisited = frameId;
    const teGrof = node.level < minSplitLevel || screenError(node) > threshold;
    if (node.level >= maxLevel || !teGrof) { out.push(node); return; }
    for (const child of node.ensureChildren()) visit(child, out, maxLevel, threshold);
  }

  function select(threshold) {
    const out = [];
    const maxLevel = geometryMaxLevel();
    for (const root of roots) visit(root, out, maxLevel, threshold);
    return out;
  }

  /* Never ask deeper than the source delivers: climb to the deepest ancestor the
     source actually has and let the shader magnify. Without this, four sibling
     tiles each request the very same ancestor. */
  function clampNode(node) {
    let n = node;
    while (n.parent && n.level > source.maxLevel) n = n.parent;
    return n;
  }

  /* Pruning branches, not just meshes. A tree that only ever drops its meshes
     keeps every QuadNode it has ever visited, and after a few minutes of flying
     around that is tens of thousands of objects holding vectors. */
  function pruneNode(node, cutoff) {
    if (!node.children) return;
    let keep = false;
    for (const child of node.children) {
      pruneNode(child, cutoff);
      if (child.children || child.mesh || child.lastVisited > cutoff) keep = true;
    }
    if (!keep && node.lastVisited <= cutoff) { nodeCount -= node.children.length; node.children = null; }
  }

  function prune(ageFrames = 600) {
    const cutoff = frameId - ageFrames;
    for (const root of roots) pruneNode(root, cutoff);
  }

  function setSource(nextSource, nextGrid) {
    source = nextSource;
    grid = nextGrid;
    buildRoots();
  }

  buildRoots();

  return {
    setView, select, clampNode, prune, buildRoots, setSource,
    roots: () => roots.slice(),
    acquireGeometry, releaseGeometry, fillGeometry,
    tick: () => ++frameId,
    frame: () => frameId,
    stats: () => ({ nodeCount, roots: roots.length, geoPool: geoPool.length }),
    geometryMaxLevel
  };
}
