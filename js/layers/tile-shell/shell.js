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
import { createTileLoader } from './loader.js';
import { createTileCache } from './cache.js';

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

  /* De schijfcache en de loader. Allebei optioneel: zonder cache gaat alles naar
     het netwerk, en een bron zonder `url` (de wereldtextuur) raakt de loader
     nooit aan. */
  const schijf = createTileCache({ budgetMB: opts.cacheBudgetMB || 200 });
  schijf.init();
  const loader = createTileLoader(THREE, {
    fetch: opts.fetch,
    cache: schijf,
    getSource: () => source,
    getGrid: () => grid,
    vintage: opts.vintage,
    maxAnisotropy: opts.maxAnisotropy,
    textureBudgetMB: opts.textureBudgetMB || 384,
    maxConcurrent: opts.maxConcurrent,
    ratePerSec: opts.ratePerSec
  });

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
  /* De textuur van deze tegel, of van de dichtstbijzijnde voorouder die er wel
     een heeft. Eerst de eigen map (daar zit de wereldtextuur), dan de loader. */
  function vindTextuur(level, x, y) {
    return textures.get(texKey(level, x, y))
        || loader.getTexture(loader.texKey(sourceId, level, x, y));
  }

  function resolveTexture(node) {
    let n = node;
    while (n) {
      const tex = vindTextuur(n.level, n.x, n.y);
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

  /* ---- aanvragen ---------------------------------------------------------
     Welke tegels er nodig zijn, en met welke voorrang. Van het midden van het
     scherm naar buiten: wat je aankijkt komt eerst.

     ALLEEN LADEN BIJ STILSTAND. Tijdens draaien en zoomen is het overgrote deel
     van wat je zou opvragen twee frames in beeld en daarna nooit meer; de
     voorouder-textuur overbrugt die tijd. Dat scheelt de bron het meeste
     verkeer van alle maatregelen hier, en de bezoeker merkt er niets van. */
  const _vorigeCam = new THREE.Vector3();
  let stilSinds = 0;
  let laatsteVraag = 0;

  function vraagTegels(camera, nodes, nu) {
    if (source.kind === 'local' || !source.url) return;

    const gewenst = new Set();
    const vragen = [];
    for (const node of nodes) {
      const doel = quadtree.clampNode(node);
      const key = loader.texKey(sourceId, doel.level, doel.x, doel.y);
      const afstand = camera.position.distanceTo(node.center);
      if (!gewenst.has(key)) { gewenst.add(key); vragen.push({ n: doel, prio: afstand }); }

      /* Niets om op terug te vallen? Vraag dan ook de OUDER. Die dekt vier buren
         tegelijk, dus dat is goedkoper dan het lijkt, en het geeft de vertrouwde
         opbouw van grof naar scherp in plaats van wit knipperen. */
      if (!resolveTexture(node) && doel.parent) {
        const a = doel.parent;
        const ak = loader.texKey(sourceId, a.level, a.x, a.y);
        if (!gewenst.has(ak)) { gewenst.add(ak); vragen.push({ n: a, prio: afstand - 0.01 }); }
      }
    }

    loader.setWanted(gewenst);
    const stil = nu - stilSinds > (opts.settleMs || 150);
    if (stil) for (const v of vragen) loader.request(sourceId, v.n.level, v.n.x, v.n.y, v.prio);
    loader.pump();
  }

  function update(camera, screenHeight, threshold) {
    if (!group.visible) return;
    const base = getMaterial();
    if (!base) return;
    syncLocalTexture();

    const nu = Date.now();
    if (!camera.position.equals(_vorigeCam)) { _vorigeCam.copy(camera.position); stilSinds = nu; }

    quadtree.tick();
    quadtree.setView(camera, screenHeight);
    selected = quadtree.select(threshold === undefined ? 1.5 : threshold);
    vraagTegels(camera, selected, nu);

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

  /* DE VOORLADING. De wortels van de boom, meteen bij het aanzetten: dat is voor
     EOX level 1, en dat zijn precies acht tegels van 90 graden — vier per
     halfrond. GEMETEN op 2026-08-30: samen 63 kB, tegen 540 kB voor de
     2K-dagkaart die ze vervangen.

     Ze worden BUITEN de stilstandregel om gevraagd. Die regel bestaat om te
     voorkomen dat je laadt wat twee frames later weg is; de wortels zijn juist
     wat er ALTIJD staat, op elke camerastand. */
  function preload() {
    if (source.kind === 'local' || !source.url) return 0;
    const wortels = quadtree.roots();
    const gewenst = new Set();
    for (const r of wortels) {
      gewenst.add(loader.texKey(sourceId, r.level, r.x, r.y));
      loader.request(sourceId, r.level, r.x, r.y, -1);   // -1: vóór alles anders
    }
    loader.pump();
    return wortels.length;
  }

  /* VAN BRON WISSELEN HERBOUWT DE BOOM, want het raster hoort bij de bron: op een
     ander raster is dezelfde z/x/y een ander stuk aarde. Wat er onderweg was
     wordt afgebroken; de schijfcache blijft, die is per URL. */
  function setSource(nieuweBron) {
    if (!TILE_SOURCES[nieuweBron] || nieuweBron === sourceId) return false;
    loader.clear();
    for (const node of [...liveMeshes.values()]) disposeNode(node);
    sourceId = nieuweBron;
    source = TILE_SOURCES[sourceId];
    grid = TILE_GRIDS[source.grid];
    textures.clear();
    quadtree.setSource(source, grid);
    return true;
  }

  return {
    group,
    update,
    setVisible,
    setWireframe,
    setSource,
    preload,
    loader,
    cache: schijf,
    isVisible: () => group.visible,
    checkFrame,
    attribution: () => tileAttribution(sourceId),
    sourceId: () => sourceId,
    stats: () => ({
      ...quadtree.stats(), bron: sourceId, selected: selected.length,
      meshes: liveMeshes.size, onParent, textures: textures.size, materials: materials.length,
      net: loader.stats(), schijf: schijf.stats()
    })
  };
}
