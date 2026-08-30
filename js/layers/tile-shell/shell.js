/* ============================================================
   TERRA — Tile shell · the earth as tiles, beside globe.gl
   ------------------------------------------------------------
   A THREE.Group of its own next to globe.gl's sphere, on a radius
   a hair above it. Hiding the group is the complete fallback:
   the sphere underneath never went anywhere.

   WHY BESIDE AND NOT INSTEAD. GlobeLayerKapsule.update() sets
   `globeObj.visible` on EVERY prop change of that layer, so a
   hidden sphere comes back on its own. And the cloud shell, the
   fog shell, the aurora and the atmosphere all hang off
   whenEarthMeshReady(). Replacing the sphere means rebuilding all
   of that; covering it means one flag.

   THE UNIFORMS ARE SHARED BY REFERENCE with the sphere's
   material. Every slider, the sun position, the cloud drift and
   the eclipse therefore land on the tiles without a single line
   of syncing — they are literally the same objects. Only the day
   map and the three UV uniforms are per tile.

   RADIUS 100.01 AND NOT 100. Exactly equal means z-fighting.
   Measured elsewhere in this project: the depth resolution at the
   surface is about 0.004 units on a 24-bit buffer, so 0.01 clears
   it with margin while being 6 metres of real height — invisible.
   ============================================================ */

import { TILE_GRIDS, TILE_SOURCES, tileAttribution, checkSources } from './sources.js';
import { createQuadtree } from './quadtree.js';

export function createTileShell(THREE, opts = {}) {
  const getMaterial = opts.getMaterial;
  const getCoords = opts.getCoords;
  if (!getMaterial) throw new Error('createTileShell: getMaterial is verplicht');

  const GLOBE_RADIUS = opts.globeRadius || 100;
  const LIFT = opts.lift === undefined ? 0.01 : opts.lift;
  const radius = GLOBE_RADIUS + LIFT;

  let sourceId = opts.sourceId || 'world-texture';
  let source = TILE_SOURCES[sourceId];
  let grid = TILE_GRIDS[source.grid];

  /* THE CONTRACT IS CHECKED AT STARTUP AND NOT ONLY IN THE BUILD. A fallback
     across grids shows the wrong piece of earth and says nothing about it; that
     is exactly the kind of thing that survives a review. */
  const problemen = checkSources();
  if (problemen.length) console.warn('[tile-shell] source contract:', problemen);

  const group = new THREE.Group();
  group.name = 'tile-shell';
  group.visible = false;          // pas zichtbaar als er iets te tonen is

  const quadtree = createQuadtree(THREE, { grid, source, radius, segments: opts.segments || 16 });

  /* ---- materials --------------------------------------------------------
     One material per visible tile. That sounds expensive and is not: they all
     compile to the SAME program, so three reuses it and the only per-tile cost
     is a handful of uniform uploads per draw. What they must not share is the
     day texture and its three UV uniforms — those are what makes a tile a tile. */
  const materials = [];
  let wireframe = false;

  function makeTileMaterial() {
    const base = getMaterial();
    if (!base) return null;
    const u = { ...base.uniforms };            // gedeelde referenties, zie de kop
    u.dayTexture = { value: base.uniforms.dayTexture.value };
    u.uvOffset = { value: new THREE.Vector2(0, 0) };
    u.uvScale = { value: 1 };
    u.uvInset = { value: 0 };
    const m = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: base.vertexShader,
      fragmentShader: base.fragmentShader,
      defines: { TILE_MODE: 1 }
    });
    m.wireframe = wireframe;      // een tegel die er later bij komt erft de stand
    materials.push(m);
    return m;
  }

  /* ---- textures ---------------------------------------------------------
     For the world-texture source there is exactly one image, at level 0, and it
     is the sphere's own day map. The loader of block 2 fills this same map with
     real tiles; nothing above it changes. */
  const textures = new Map();

  function texKey(level, x, y) { return `${sourceId}/${level}/${x}/${y}`; }

  function syncLocalTexture() {
    if (source.kind !== 'local') return;
    const base = getMaterial();
    if (!base) return;
    const tex = base.uniforms.dayTexture.value;
    if (tex) textures.set(texKey(0, 0, 0), tex);
  }

  /* Climb to the nearest ancestor that HAS an image and work out which part of it
     belongs to this node. Without this the globe flashes white while zooming:
     the coarse image stays up until the sharp one arrives. */
  function resolveTexture(node) {
    let n = node;
    while (n) {
      const tex = textures.get(texKey(n.level, n.x, n.y));
      if (tex) {
        const d = node.level - n.level;
        const scale = 1 / Math.pow(2, d);
        const ox = (node.x - (n.x * Math.pow(2, d))) * scale;
        // v runs bottom to top, tile rows top to bottom — hence the flip.
        const oy = (Math.pow(2, d) - 1 - (node.y - (n.y * Math.pow(2, d)))) * scale;
        return { tex, scale, ox, oy, depth: d };
      }
      n = n.parent;
    }
    return null;
  }

  /* ---- the live meshes --------------------------------------------------- */

  const liveMeshes = new Map();
  let selected = [];
  let onParent = 0;

  function disposeNode(node) {
    if (!node.mesh) return;
    group.remove(node.mesh);
    quadtree.releaseGeometry(node.mesh.geometry);
    node.mesh.material.dispose();
    const i = materials.indexOf(node.mesh.material);
    if (i >= 0) materials.splice(i, 1);
    node.mesh = null; node.idle = 0;
    liveMeshes.delete(`${node.level}/${node.x}/${node.y}`);
  }

  function update(camera, screenHeight, threshold) {
    if (!group.visible) return;
    const base = getMaterial();
    if (!base) return;
    syncLocalTexture();

    quadtree.tick();
    quadtree.setView(camera, screenHeight);
    selected = quadtree.select(threshold === undefined ? 1.5 : threshold);

    onParent = 0;
    const keep = new Set();

    for (const node of selected) {
      const id = `${node.level}/${node.x}/${node.y}`;
      keep.add(id);
      if (!node.mesh) {
        const mat = makeTileMaterial();
        if (!mat) return;
        const g = quadtree.fillGeometry(quadtree.acquireGeometry(), node.clip, node.bounds);
        g.boundingSphere.center.copy(node.center);
        g.boundingSphere.radius = node.boundRadius;
        const mesh = new THREE.Mesh(g, mat);
        // De boom cullt zelf, en scherper: three kent de horizon niet.
        mesh.frustumCulled = false;
        node.mesh = mesh;
        group.add(mesh);
        liveMeshes.set(id, node);
      }
      node.idle = 0;
      node.mesh.visible = true;

      const u = node.mesh.material.uniforms;
      const t = resolveTexture(node);
      if (t) {
        u.dayTexture.value = t.tex;
        u.uvOffset.value.set(t.ox, t.oy);
        u.uvScale.value = t.scale;
        if (t.depth > 0) onParent++;
      }
      // Geen beeld? Dan tekent deze tegel niets in plaats van iets verkeerds.
      node.mesh.visible = !!t;
    }

    for (const [id, node] of liveMeshes) {
      if (keep.has(id)) continue;
      node.mesh.visible = false;
      if (++node.idle > 90 || liveMeshes.size > 900) disposeNode(node);
    }

    if (quadtree.frame() % 120 === 0) quadtree.prune();
  }

  function setVisible(v) {
    group.visible = !!v;
    if (!v) for (const node of [...liveMeshes.values()]) disposeNode(node);
  }

  /* WIREFRAME, en dat is geen speeltje maar het enige wat de schil ZICHTBAAR
     maakt. Als hij goed werkt is hij per constructie niet van de bol eronder te
     onderscheiden — dat is het doel — en dan valt er met het oog niets te
     controleren. De tegelranden tonen wel meteen of de boom splitst waar hij
     hoort te splitsen. Kost niets als hij uit staat. */
  function setWireframe(v) {
    wireframe = !!v;
    for (const m of materials) m.wireframe = wireframe;
  }

  /* THE FRAME CHECK. The tile positions have to agree with world.getCoords(),
     because every marker, path and label in this app is placed with that. A
     rotated globe is still a globe, so this cannot be spotted by looking —
     hence a number. Returns the largest deviation in units, or null when there
     is nothing to compare against. */
  function checkFrame() {
    if (!getCoords) return null;
    const proefpunten = [[0, 0], [90, 0], [-90, 0], [0, 45], [139.7, 35.7], [-74, 40.7]];
    const p = new THREE.Vector3();
    let grootste = 0;
    for (const [lon, lat] of proefpunten) {
      const c = getCoords(lat, lon, LIFT / GLOBE_RADIUS);
      const la = lat * Math.PI / 180, lo = lon * Math.PI / 180, k = Math.cos(la);
      p.set(radius * k * Math.sin(lo), radius * Math.sin(la), radius * k * Math.cos(lo));
      grootste = Math.max(grootste, Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z));
    }
    return grootste;
  }

  return {
    group,
    update,
    setVisible,
    setWireframe,
    isVisible: () => group.visible,
    checkFrame,
    attribution: () => tileAttribution(sourceId),
    sourceId: () => sourceId,
    stats: () => ({
      ...quadtree.stats(), selected: selected.length,
      meshes: liveMeshes.size, onParent, textures: textures.size, materials: materials.length
    })
  };
}
