/* ============================================================
   TERRA — tekenlaag (kern)
   ------------------------------------------------------------
   Annotaties leven NIET in de aardtextuur maar als data. Ze worden getekend op
   een equirectangular flatmap (2048x1024) en gebakken naar een CanvasTexture die
   als tweede bol over de aarde ligt. Dezelfde UV-mapping als de aardtextuur, dus
   de uitlijning is exact en er valt niets te oriënteren.

   Overgenomen uit de proof of concept (logs/terra-tekenlaag-poc/), met vier
   afwijkingen:

     1. GEEN EIGEN THREE-SCENE. De PoC bouwde een eigen bol met three r128 uit een
        script-tag. Hier komt THREE binnen als argument, uit Terra's gepinde import
        map, en de overlaybol wordt een KIND van de bestaande aarde-mesh — precies
        zoals de wolkenschil. Dat erft de -90 graden draai van three-globe, en
        daarmee valt de flatmap vanzelf samen met de aardtextuur.

     2. GEEN `alert()` bij een leesfout. Terra heeft toasts.

     3. PERSISTENTIE. De PoC verloor alles bij een refresh; hier gaat de tekening
        naar localStorage, met dezelfde try/catch als de textuurkwaliteit.

     4. DEZE MODULE WORDT NOOIT STATISCH GEIMPORTEERD. index.html haalt hem met
        `await import()` op, en dat is wat de standalone-build hem laat missen:
        `collectModules()` daar leest alleen statische import-statements. Zie de
        SKETCH-markers in tools/build-standalone.mjs.

   TEKENVLAK. Alles wordt rond de oorsprong (0,0) opgebouwd; de transform in
   `drawShapeAt` doet positie, rotatie en schaal. Objecten dicht bij de datumgrens
   worden een tweede keer getekend met een verschuiving van een hele kaartbreedte,
   zodat ze op de bol doorlopen in plaats van bij lengte 180 af te kappen.
   ============================================================ */

export const MAP_W = 2048;
export const MAP_H = 1024;
const BASE_R = 62;    // basisstraal van een object op schaal 1
const SEAM   = 260;   // marge waarbinnen objecten dubbel getekend worden
const STORAGE_KEY = 'terra-sketch';
const FORMAT = 'terra.annotation-layer';

/* ============================== STORE ==================================== */
/* Pure data, serialiseerbaar. De undo-historie bewaart JSON-snapshots: bij een
   paar honderd objecten is dat verwaarloosbaar, en het maakt elke bewerking
   ongedaan te maken zonder per gereedschap een tegenbewerking te schrijven. */

export const Store = {
  shapes: [],
  selectedId: null,
  seq: 1,
  history: [],

  snapshot() {
    this.history.push(JSON.stringify(this.shapes));
    if (this.history.length > 80) this.history.shift();
  },
  undo() {
    const prev = this.history.pop();
    if (prev === undefined) return false;
    this.shapes = JSON.parse(prev);
    if (!this.get(this.selectedId)) this.selectedId = null;
    return true;
  },
  add(shape) { this.snapshot(); this.shapes.push(shape); this.selectedId = shape.id; },
  remove(id) {
    this.snapshot();
    this.shapes = this.shapes.filter(s => s.id !== id);
    if (this.selectedId === id) this.selectedId = null;
  },
  get(id) { return this.shapes.find(s => s.id === id) || null; },
  selected() { return this.get(this.selectedId); },
  clear() { this.snapshot(); this.shapes = []; this.selectedId = null; },
  raise(id) {
    const s = this.get(id); if (!s) return;
    this.snapshot();
    this.shapes = this.shapes.filter(x => x.id !== id).concat([s]);
  },
  serialize() {
    return JSON.stringify({
      format: FORMAT,
      version: 1,
      map: { width: MAP_W, height: MAP_H, projection: 'equirectangular' },
      shapes: this.shapes
    }, null, 2);
  },
  load(json) {
    const data = JSON.parse(json);
    if (!Array.isArray(data.shapes)) throw new Error('no shapes found');
    this.snapshot();
    this.shapes = data.shapes;
    this.selectedId = null;
    // Doortellen vanaf het hoogste bestaande nummer, anders botsen nieuwe id's
    // met geimporteerde.
    this.seq = this.shapes.reduce(
      (m, s) => Math.max(m, parseInt(String(s.id).slice(1), 10) || 0), 0) + 1;
  }
};

export function makeShape(type, x, y, style) {
  const s = {
    id: 's' + (Store.seq++),
    type, x, y,
    scale: 1,
    rotation: 0,
    color: style.color,
    width: style.width
  };
  if (type === 'free') s.points = [];
  return s;
}

/* ============================== PRIMITIEVEN ============================== */

const Primitives = {
  arrow(ctx) {
    const L = 62, hl = 30, hw = 19;
    ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(L - hl + 2, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(L - hl, -hw); ctx.lineTo(L - hl, hw);
    ctx.closePath(); ctx.fill();
  },
  circle(ctx) {
    ctx.beginPath(); ctx.arc(0, 0, BASE_R * 0.78, 0, Math.PI * 2); ctx.stroke();
  },
  cross(ctx) {
    const a = BASE_R * 0.62;
    ctx.beginPath();
    ctx.moveTo(-a, -a); ctx.lineTo(a, a);
    ctx.moveTo(-a,  a); ctx.lineTo(a, -a);
    ctx.stroke();
  },
  free(ctx, s) {
    const p = s.points;
    if (!p || p.length < 2) return;
    ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
    ctx.stroke();
  }
};

function drawShapeAt(ctx, s, offsetX) {
  ctx.save();
  ctx.translate(s.x + offsetX, s.y);
  ctx.rotate(s.rotation);
  ctx.scale(s.scale, s.scale);
  ctx.strokeStyle = s.color;
  ctx.fillStyle   = s.color;
  ctx.lineWidth   = s.width;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  (Primitives[s.type] || Primitives.circle)(ctx, s);
  ctx.restore();
}

// Datumgrens: een object binnen SEAM van de rand wordt ook een kaartbreedte
// verderop getekend. Op het platte vlak valt die kopie buiten beeld, op de bol
// is het exact dezelfde plek — dus de vorm loopt door in plaats van af te kappen.
export function drawShape(ctx, s) {
  drawShapeAt(ctx, s, 0);
  if (s.x < SEAM)          drawShapeAt(ctx, s,  MAP_W);
  if (s.x > MAP_W - SEAM)  drawShapeAt(ctx, s, -MAP_W);
}

export function shapeRadius(s) {
  if (s.type !== 'free') return BASE_R;
  let r = 24;
  for (const p of (s.points || [])) r = Math.max(r, Math.hypot(p[0], p[1]));
  return r + 10;
}

// Kaartcoordinaten naar de lokale ruimte van een object: rotatie en schaal eruit
// rekenen, zodat een treffer tegen de onbewerkte vorm getoetst kan worden.
export function toLocal(s, mx, my) {
  const dx = mx - s.x, dy = my - s.y;
  const c = Math.cos(-s.rotation), sn = Math.sin(-s.rotation);
  return [(dx * c - dy * sn) / s.scale, (dx * sn + dy * c) / s.scale];
}

// Van boven naar beneden door de stapel, zodat het bovenste object wint. De drie
// verschuivingen vangen objecten die over de datumgrens heen zichtbaar zijn.
export function hitTest(mx, my) {
  for (let i = Store.shapes.length - 1; i >= 0; i--) {
    const s = Store.shapes[i];
    for (const off of [0, -MAP_W, MAP_W]) {
      const [lx, ly] = toLocal(s, mx + off, my);
      if (s.type === 'free') {
        const tol = 12 + s.width;
        for (const p of s.points) if (Math.hypot(p[0] - lx, p[1] - ly) < tol) return s;
      } else if (Math.hypot(lx, ly) < BASE_R + 10) return s;
    }
  }
  return null;
}

/* ============================== LAAG ===================================== */

const canvas = Object.assign(document.createElement('canvas'), { width: MAP_W, height: MAP_H });
let ctx2d = null;
export function layerCanvas() { return canvas; }
function ctx() { return ctx2d || (ctx2d = canvas.getContext('2d')); }

let texture = null;
let mesh = null;
let onBake = null;   // callback naar de UI (objectteller)

// Bakt de datalaag naar het canvas. Alleen hier wordt `needsUpdate` gezet: een
// CanvasTexture die elke frame opnieuw naar de GPU gaat kost bandbreedte voor
// niets, en de inhoud verandert alleen bij een bewerking.
export function bake() {
  const c = ctx();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, MAP_W, MAP_H);
  for (const s of Store.shapes) drawShape(c, s);
  if (texture) texture.needsUpdate = true;
  if (onBake) onBake(Store.shapes.length);
}

/* ============================== BOL-OVERLAY ============================== */
/*
   De mesh wordt een KIND van de aarde-mesh. Dat is niet alleen gemak: het is de
   enige manier waarop de UV's zonder rekenwerk samenvallen. three-globe draait de
   aarde-mesh -90 graden zodat textuur-lengte 0 op +Z ligt; een kind erft die draai
   en spreekt dus hetzelfde frame als de aardtextuur eronder. Precies het patroon
   van setupCloudSphere() in index.html.

   MeshBasicMaterial, dus ongelicht: annotaties blijven leesbaar op de nachtzijde
   en in een eclipsschaduw. Dat is een keuze — dit is een informatielaag, geen
   simulatielaag, dezelfde redenering als bij de schemeringslijnen.
*/
export function createSketchMesh(THREE, opts = {}) {
  const cfg = Object.assign({ earthRadius: 100, altitude: 0.012, opacity: 1 }, opts);

  if (!texture) {
    texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = cfg.anisotropy || 1;
    // Kleurruimte gelijktrekken met de aardtexturen, anders komt de gekozen kleur
    // er lichter uit dan in de kleurkiezer.
    if ('colorSpace' in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  }
  if (mesh) return mesh;

  const R = cfg.earthRadius * (1 + cfg.altitude);
  mesh = new THREE.Mesh(
    new THREE.SphereGeometry(R, 96, 64),
    new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false, opacity: cfg.opacity
    })
  );
  mesh.name = 'terra-sketch';
  mesh.renderOrder = 3;
  return mesh;
}

export function sketchMesh() { return mesh; }
export function setVisible(on) { if (mesh) mesh.visible = !!on; }
export function setOpacity(v) { if (mesh) mesh.material.opacity = Math.max(0, Math.min(1, v)); }
export function setOnBake(fn) { onBake = fn; }
export function count() { return Store.shapes.length; }

/* ============================== PERSISTENTIE ============================= */

export function save() {
  try {
    if (!Store.shapes.length) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, Store.serialize());
    return true;
  } catch { return false; }   // privacy-modus of vol quotum — niet fataal
}

export function restore() {
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch { return false; }
  if (!raw) return false;
  try { Store.load(raw); Store.history.length = 0; return true; }
  catch { return false; }
}

// Bestaat er iets om te herstellen? Bewust zonder JSON te parsen: dit draait bij
// het opstarten en beslist alleen of de module überhaupt geladen moet worden.
export function hasStored() {
  try { return !!localStorage.getItem(STORAGE_KEY); } catch { return false; }
}

/* ============================== DELEN ==================================== */

export function exportFile() {
  const blob = new Blob([Store.serialize()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'terra-sketch.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

// Leest een bestand en geeft het aantal ingelezen objecten terug. Gooit met een
// leesbare melding; de aanroeper zet die in een toast.
export function importFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('could not read the file'));
    r.onload = () => {
      try {
        Store.load(r.result);
        bake();
        save();
        resolve(Store.shapes.length);
      } catch (err) {
        reject(new Error(err.message || 'not a valid sketch file'));
      }
    };
    r.readAsText(file);
  });
}
