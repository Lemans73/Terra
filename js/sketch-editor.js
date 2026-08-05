/* ============================================================
   TERRA — tekenlaag (flatmap-editor)
   ------------------------------------------------------------
   De bewerkkant van de tekenlaag: een equirectangular kaart met de dagtextuur als
   onderlaag, waarop je objecten plaatst, verschuift, draait en schaalt. Bewust
   een platte kaart en niet de bol: je ziet de projectievervorming terwijl je
   tekent, en dat is precies wat een annotatie op een bol doet.

   Overgenomen uit de proof of concept, met drie afwijkingen:

     1. SNELTOETSEN ZIJN GESCOPED. De PoC bond ze aan `window` en controleerde bij
        elke aanslag of de editor open stond. Hier worden de listeners bij het
        openen aangehangen en bij het sluiten weer weggehaald, zodat een `C` in
        Terra's eigen interface nooit per ongeluk hier landt.

     2. DE ONDERLAAG KOMT UIT assets/. De PoC droeg een base64-textuur van 248 KB
        met zich mee omdat hij één bestand moest blijven.

     3. GEEN EIGEN KLEUR- EN MAATVARIABELEN. Alles hangt aan Terra's CSS.

   Deze module importeert sketch.js STATISCH, en dat mag: index.html haalt alleen
   deze module dynamisch op, dus de standalone-build ziet geen van beide.
   ============================================================ */

import {
  Store, MAP_W, MAP_H, makeShape, drawShape, shapeRadius, toLocal, hitTest,
  bake, save
} from './sketch.js';

const SWATCH = ['#e8b13c', '#e2603f', '#e9e5da', '#48c9a9', '#5b9bf0', '#c86ee0'];
const NAMES  = { arrow: 'Arrow', circle: 'Circle', cross: 'Cross', free: 'Freehand' };

const State = { tool: 'select', color: '#e8b13c', width: 8, grid: false, dim: false };

const Editor = {
  canvas: null, ctx: null, img: null, imgSrc: null,
  view: { base: 1, zoom: 1, panX: 0, panY: 0 },
  drag: null, spaceDown: false, backup: null,
  dpr: 1, cssW: 0, cssH: 0,
  bound: false,

  init(imgSrc) {
    this.canvas = document.getElementById('sketch-map');
    if (!this.canvas) return false;
    this.ctx = this.canvas.getContext('2d');

    // De onderlaag is ALTIJD de textuur die op de bol ligt. Dat is een uitgangspunt
    // en geen extraatje: wie de oceaanbodem aanzet — of straks zijn eigen kaart
    // laadt — moet op díé kaart tekenen en niet op een andere.
    //
    // Vandaar de vergelijking op `imgSrc`. De afbeelding werd één keer geladen en
    // daarna hergebruikt; zonder deze toets zou je na het omzetten van de
    // oceaanbodem nog steeds de oude kaart zien.
    if (!this.img || this.imgSrc !== imgSrc) {
      this.img = new Image();
      // De dagtextuur komt bij een standalone van jsDelivr; zonder deze vlag raakt
      // een canvas dat hem tekent tainted. Hier lezen we het canvas niet uit, maar
      // de vlag kost niets en houdt de regel uit sessie 12 overal hetzelfde.
      this.img.crossOrigin = 'anonymous';
      this.img.onload = () => this.render();
      this.img.src = imgSrc;
      this.imgSrc = imgSrc;
    }

    if (!this.bound) {
      const cv = this.canvas;
      cv.addEventListener('pointerdown', e => this.onDown(e));
      cv.addEventListener('pointermove', e => this.onMove(e));
      cv.addEventListener('pointerup', e => this.onUp(e));
      cv.addEventListener('pointercancel', e => this.onUp(e));
      cv.addEventListener('contextmenu', e => e.preventDefault());
      cv.addEventListener('wheel', e => this.onWheel(e), { passive: false });
      this.bound = true;
    }
    return true;
  },

  /* -- viewport -- */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.canvas.width  = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.dpr = dpr; this.cssW = r.width; this.cssH = r.height;
  },
  fit() {
    this.resize();
    const v = this.view;
    v.base = Math.min(this.cssW / MAP_W, this.cssH / MAP_H) * 0.94;
    v.zoom = 1;
    v.panX = (this.cssW - MAP_W * v.base) / 2;
    v.panY = (this.cssH - MAP_H * v.base) / 2;
    this.render();
  },
  k() { return this.view.base * this.view.zoom; },
  toMap(sx, sy) { const k = this.k(); return [(sx - this.view.panX) / k, (sy - this.view.panY) / k]; },
  pointer(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  },

  // De twee grepen om een geselecteerd object: draaien (boven) en schalen
  // (rechtsonder), allebei meedraaiend met het object zelf.
  handles(s) {
    const k = this.k();
    const R = shapeRadius(s) * s.scale;
    const gap = 26 / k;
    const rot = s.rotation;
    return {
      R,
      rotate: [s.x + Math.cos(rot - Math.PI / 2) * (R + gap), s.y + Math.sin(rot - Math.PI / 2) * (R + gap)],
      scale:  [s.x + Math.cos(rot + Math.PI / 4) * R,         s.y + Math.sin(rot + Math.PI / 4) * R]
    };
  },

  /* -- invoer -- */
  onDown(e) {
    // Vastpakken zodat een sleep buiten het canvas doorloopt. Gooit bij een
    // pointerId die het element niet kent, en dan zou de rest van deze handler
    // overgeslagen worden — het vastpakken is comfort, niet de functie.
    try { this.canvas.setPointerCapture(e.pointerId); } catch {}
    const [sx, sy] = this.pointer(e);
    const [mx, my] = this.toMap(sx, sy);
    const k = this.k();

    if (e.button === 1 || e.button === 2 || this.spaceDown || State.tool === 'pan') {
      this.drag = { mode: 'pan', sx, sy, px: this.view.panX, py: this.view.panY };
      this.canvas.classList.add('panning');
      return;
    }

    const sel = Store.selected();
    if (sel) {
      const h = this.handles(sel), tol = 13 / k;
      if (Math.hypot(mx - h.rotate[0], my - h.rotate[1]) < tol) {
        Store.snapshot(); this.drag = { mode: 'rotate', id: sel.id }; return;
      }
      if (Math.hypot(mx - h.scale[0], my - h.scale[1]) < tol) {
        Store.snapshot(); this.drag = { mode: 'scale', id: sel.id }; return;
      }
    }

    if (State.tool === 'select') {
      const hit = hitTest(mx, my);
      Store.selectedId = hit ? hit.id : null;
      if (hit) {
        Store.snapshot();
        // Bij een treffer over de datumgrens ligt het object een kaartbreedte
        // verderop; zonder deze correctie springt het bij de eerste beweging.
        let dx = mx - hit.x;
        if (dx >  MAP_W / 2) dx -= MAP_W;
        if (dx < -MAP_W / 2) dx += MAP_W;
        this.drag = { mode: 'move', id: hit.id, dx, dy: my - hit.y };
      }
      UI.syncInspector(); this.render(); return;
    }

    if (State.tool === 'pen') {
      this.drag = { mode: 'draw', pts: [[mx, my]] };
      return;
    }

    // Plaatsen: het nieuwe object hangt meteen aan de cursor, zodat plaatsen en
    // positioneren één gebaar zijn.
    const s = makeShape(State.tool, mx, my, State);
    Store.add(s);
    this.drag = { mode: 'move', id: s.id, dx: 0, dy: 0 };
    UI.syncInspector();
    this.render();
  },

  onMove(e) {
    const [sx, sy] = this.pointer(e);
    const [mx, my] = this.toMap(sx, sy);
    UI.syncCoords(mx, my);

    const d = this.drag;
    if (!d) return;

    if (d.mode === 'pan') {
      this.view.panX = d.px + (sx - d.sx);
      this.view.panY = d.py + (sy - d.sy);
    } else if (d.mode === 'move') {
      const s = Store.get(d.id); if (!s) return;
      // Lengte wikkelt rond, breedte niet: over de pool kun je niet schuiven.
      s.x = ((mx - d.dx) % MAP_W + MAP_W) % MAP_W;
      s.y = Math.max(0, Math.min(MAP_H, my - d.dy));
    } else if (d.mode === 'rotate') {
      const s = Store.get(d.id); if (!s) return;
      s.rotation = Math.atan2(my - s.y, mx - s.x) + Math.PI / 2;
      if (e.shiftKey) s.rotation = Math.round(s.rotation / (Math.PI / 12)) * (Math.PI / 12);
    } else if (d.mode === 'scale') {
      const s = Store.get(d.id); if (!s) return;
      const dist = Math.hypot(mx - s.x, my - s.y);
      s.scale = Math.max(0.15, Math.min(8, dist / shapeRadius(s)));
    } else if (d.mode === 'draw') {
      // Punten pas overnemen vanaf een minimale afstand: dat scheelt honderden
      // punten bij een langzame haal en levert een vloeiendere lijn.
      const last = d.pts[d.pts.length - 1];
      if (Math.hypot(mx - last[0], my - last[1]) > 3.5) d.pts.push([mx, my]);
    }

    if (d.mode === 'rotate' || d.mode === 'scale') UI.syncInspectorValues();
    this.render();
  },

  onUp() {
    const d = this.drag;
    this.drag = null;
    this.canvas.classList.remove('panning');
    if (!d) return;

    if (d.mode === 'draw') {
      const pts = d.pts;
      if (pts.length < 2) { this.render(); return; }
      // Punten worden relatief aan hun eigen middelpunt opgeslagen, zodat de
      // vrije lijn daarna net zo verschuift, draait en schaalt als de rest.
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (const p of pts) {
        minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]);
        miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]);
      }
      const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
      const s = makeShape('free', cx, cy, State);
      s.points = pts.map(p => [p[0] - cx, p[1] - cy]);
      Store.add(s);
      UI.syncInspector();
    }
    this.render();
  },

  onWheel(e) {
    e.preventDefault();
    const [sx, sy] = this.pointer(e);
    const [mx, my] = this.toMap(sx, sy);
    const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.view.zoom = Math.max(0.4, Math.min(10, this.view.zoom * f));
    // Pan bijstellen zodat het punt onder de cursor daar blijft staan.
    const k = this.k();
    this.view.panX = sx - mx * k;
    this.view.panY = sy - my * k;
    this.render();
  },

  /* -- tekenen -- */
  render() {
    if (!this.ctx || !this.cssW) return;
    const ctx = this.ctx, dpr = this.dpr, k = this.k();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#080d14';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * this.view.panX, dpr * this.view.panY);

    if (this.img.complete && this.img.naturalWidth) ctx.drawImage(this.img, 0, 0, MAP_W, MAP_H);
    if (State.dim) { ctx.fillStyle = 'rgba(6,13,22,0.55)'; ctx.fillRect(0, 0, MAP_W, MAP_H); }
    if (State.grid) this.drawGraticule(ctx, k);

    for (const s of Store.shapes) drawShape(ctx, s);

    const sel = Store.selected();
    if (sel) this.drawHandles(ctx, sel, k);

    // Lijnbreedtes worden door de schaal gedeeld, zodat ze op elk zoomniveau
    // even dik op het scherm staan.
    ctx.lineWidth = 1 / k;
    ctx.strokeStyle = 'rgba(232,177,60,0.45)';
    ctx.strokeRect(0, 0, MAP_W, MAP_H);
  },

  drawGraticule(ctx, k) {
    ctx.save();
    ctx.lineWidth = 1 / k;
    ctx.strokeStyle = 'rgba(233,229,218,0.22)';
    ctx.beginPath();
    for (let lon = -180; lon <= 180; lon += 30) {
      const x = (lon + 180) / 360 * MAP_W;
      ctx.moveTo(x, 0); ctx.lineTo(x, MAP_H);
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const y = (90 - lat) / 180 * MAP_H;
      ctx.moveTo(0, y); ctx.lineTo(MAP_W, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(232,177,60,0.55)';
    ctx.beginPath();
    ctx.moveTo(0, MAP_H / 2); ctx.lineTo(MAP_W, MAP_H / 2);
    ctx.moveTo(MAP_W / 2, 0); ctx.lineTo(MAP_W / 2, MAP_H);
    ctx.stroke();
    ctx.restore();
  },

  drawHandles(ctx, s, k) {
    const h = this.handles(s);
    ctx.save();
    ctx.lineWidth = 1.5 / k;
    ctx.strokeStyle = 'rgba(232,177,60,0.85)';
    ctx.setLineDash([6 / k, 5 / k]);
    ctx.beginPath(); ctx.arc(s.x, s.y, h.R, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(s.x + Math.cos(s.rotation - Math.PI / 2) * h.R,
               s.y + Math.sin(s.rotation - Math.PI / 2) * h.R);
    ctx.lineTo(h.rotate[0], h.rotate[1]);
    ctx.stroke();

    const dot = (p, fill) => {
      ctx.beginPath(); ctx.arc(p[0], p[1], 6 / k, 0, Math.PI * 2);
      ctx.fillStyle = fill; ctx.fill();
      ctx.lineWidth = 1.5 / k; ctx.strokeStyle = '#060d16'; ctx.stroke();
    };
    dot(h.rotate, '#e8b13c');
    dot(h.scale,  '#e9e5da');
    ctx.restore();
  }
};

/* ============================== BEDIENING ================================ */

const UI = {
  wired: false,
  onClose: null,
  keyHandlers: null,

  wire() {
    if (this.wired) return;
    this.wired = true;

    document.querySelectorAll('#sketch-tools .tool').forEach(btn => {
      btn.addEventListener('click', () => this.setTool(btn.dataset.tool));
    });
    document.getElementById('sketch-fit')?.addEventListener('click', () => Editor.fit());
    document.getElementById('sketch-save')?.addEventListener('click', () => this.close(true));
    document.getElementById('sketch-cancel')?.addEventListener('click', () => this.close(false));
    document.getElementById('sketch-grid')?.addEventListener('change', e => {
      State.grid = e.target.checked; Editor.render();
    });
    document.getElementById('sketch-dim')?.addEventListener('change', e => {
      State.dim = e.target.checked; Editor.render();
    });
    document.getElementById('sketch-clear')?.addEventListener('click', () => {
      Store.clear(); this.syncInspector(); Editor.render();
    });

    window.addEventListener('resize', () => {
      if (!document.getElementById('sketch-editor').hidden) { Editor.resize(); Editor.render(); }
    });
  },

  // Sneltoetsen leven alleen zolang de editor open is. De PoC hing ze aan window
  // en filterde per aanslag; hier kan een toets in Terra's eigen interface dus
  // per constructie niet in de editor belanden.
  bindKeys() {
    if (this.keyHandlers) return;
    const down = e => this.onKey(e, true);
    const up   = e => this.onKey(e, false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    this.keyHandlers = { down, up };
  },
  unbindKeys() {
    if (!this.keyHandlers) return;
    window.removeEventListener('keydown', this.keyHandlers.down);
    window.removeEventListener('keyup', this.keyHandlers.up);
    this.keyHandlers = null;
    Editor.spaceDown = false;
  },

  onKey(e, down) {
    if (e.code === 'Space') { Editor.spaceDown = down; if (down) e.preventDefault(); }
    if (!down) return;
    const t = e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA') return;

    const map = { KeyV: 'select', KeyA: 'arrow', KeyC: 'circle', KeyX: 'cross', KeyP: 'pen' };
    if (map[e.code] && !e.ctrlKey && !e.metaKey) { this.setTool(map[e.code]); return; }

    if ((e.key === 'Delete' || e.key === 'Backspace') && Store.selectedId) {
      e.preventDefault(); Store.remove(Store.selectedId); this.syncInspector(); Editor.render();
    }
    if (e.key === 'Escape') { Store.selectedId = null; this.syncInspector(); Editor.render(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault(); Store.undo(); this.syncInspector(); Editor.render();
    }
  },

  setTool(tool) {
    State.tool = tool;
    document.querySelectorAll('#sketch-tools .tool').forEach(
      b => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
    Editor.canvas.classList.toggle('tool-select', tool === 'select');
    if (tool !== 'select') { Store.selectedId = null; this.syncInspector(); Editor.render(); }
  },

  open(imgSrc) {
    if (!Editor.init(imgSrc)) return;
    this.wire();
    Editor.backup = JSON.stringify(Store.shapes);
    document.getElementById('sketch-editor').hidden = false;
    document.body.classList.add('sketch-editing');
    this.bindKeys();
    this.syncInspector();
    // Een frame wachten: vóór de reflow heeft het canvas nog geen afmetingen en
    // zou fit() door nul delen.
    requestAnimationFrame(() => Editor.fit());
  },

  close(keep) {
    if (!keep && Editor.backup !== null) {
      Store.shapes = JSON.parse(Editor.backup);
      Store.selectedId = null;
    }
    document.getElementById('sketch-editor').hidden = true;
    document.body.classList.remove('sketch-editing');
    this.unbindKeys();
    bake();
    if (keep) save();
    if (this.onClose) this.onClose(keep);
  },

  syncCoords(mx, my) {
    const el = document.getElementById('sketch-coord');
    if (!el) return;
    if (mx < 0 || mx > MAP_W || my < 0 || my > MAP_H) { el.innerHTML = '&mdash;<i>&nbsp;</i>'; return; }
    const lon = mx / MAP_W * 360 - 180;
    const lat = 90 - my / MAP_H * 180;
    el.innerHTML =
      Math.abs(lat).toFixed(1) + '&deg; <i>' + (lat >= 0 ? 'N' : 'S') + '</i> &nbsp; ' +
      Math.abs(lon).toFixed(1) + '&deg; <i>' + (lon >= 0 ? 'E' : 'W') + '</i>';
  },

  // Tijdens het slepen alleen de waarden bijwerken. Het hele paneel opnieuw
  // opbouwen zou de listeners elke muisbeweging vervangen.
  syncInspectorValues() {
    const s = Store.selected(); if (!s) return;
    const sc = document.getElementById('sk-scale');
    if (sc) { sc.value = Math.round(s.scale * 100); sc.nextElementSibling.value = s.scale.toFixed(2) + '×'; }
    const rt = document.getElementById('sk-rot');
    if (rt) {
      const deg = Math.round(((s.rotation * 180 / Math.PI) % 360 + 360) % 360);
      rt.value = deg; rt.nextElementSibling.innerHTML = deg + '&deg;';
    }
  },

  syncInspector() {
    const s = Store.selected();
    const title = document.getElementById('sketch-insp-title');
    const body  = document.getElementById('sketch-insp-body');
    if (!title || !body) return;

    const swatches = (active) => SWATCH.map(c =>
      `<button class="sk-swatch" data-c="${c}" style="background:${c}" aria-pressed="${c === active}" title="${c}"></button>`).join('');

    if (!s) {
      title.textContent = 'New object';
      body.innerHTML = `
        <div class="sk-field">
          <label for="sk-new-color">Colour</label>
          <input type="color" id="sk-new-color" value="${State.color}">
          <div class="sk-swatches">${swatches(State.color)}</div>
        </div>
        <div class="sk-field">
          <label for="sk-new-width">Line width</label>
          <div class="sk-row"><input type="range" class="range" id="sk-new-width" min="2" max="24" value="${State.width}">
          <output>${State.width}</output></div>
        </div>
        <p class="sk-empty">Pick a tool on the left and click the map. Then press <code>V</code> and click an object to edit it.</p>`;
      body.querySelector('#sk-new-color').addEventListener('input', e => {
        State.color = e.target.value; this.syncInspector();
      });
      body.querySelector('#sk-new-width').addEventListener('input', e => {
        State.width = +e.target.value; e.target.nextElementSibling.value = State.width;
      });
      body.querySelectorAll('.sk-swatch').forEach(b => b.addEventListener('click', () => {
        State.color = b.dataset.c; this.syncInspector();
      }));
      return;
    }

    const deg = Math.round((s.rotation * 180 / Math.PI + 360) % 360);
    title.textContent = NAMES[s.type] || 'Object';
    body.innerHTML = `
      <div class="sk-field">
        <label for="sk-color">Colour</label>
        <input type="color" id="sk-color" value="${s.color}">
        <div class="sk-swatches">${swatches(s.color)}</div>
      </div>
      <div class="sk-field">
        <label for="sk-width">Line width</label>
        <div class="sk-row"><input type="range" class="range" id="sk-width" min="2" max="24" value="${s.width}"><output>${s.width}</output></div>
      </div>
      <div class="sk-field">
        <label for="sk-scale">Scale</label>
        <div class="sk-row"><input type="range" class="range" id="sk-scale" min="15" max="500" value="${Math.round(s.scale * 100)}">
        <output>${s.scale.toFixed(2)}×</output></div>
      </div>
      <div class="sk-field">
        <label for="sk-rot">Rotation</label>
        <div class="sk-row"><input type="range" class="range" id="sk-rot" min="0" max="359" value="${deg}">
        <output>${deg}&deg;</output></div>
      </div>
      <div class="sk-stack">
        <button class="sk-btn" id="sk-front">Bring to front</button>
        <button class="sk-btn" id="sk-dup">Duplicate</button>
        <button class="sk-btn danger" id="sk-del">Delete</button>
      </div>`;

    const live = (id, fn) => body.querySelector(id).addEventListener('input', e => {
      fn(e.target.value, e.target);
      Editor.render();
    });
    body.querySelector('#sk-color').addEventListener('input', e => {
      s.color = e.target.value; State.color = e.target.value; Editor.render();
    });
    body.querySelectorAll('.sk-swatch').forEach(b => b.addEventListener('click', () => {
      s.color = b.dataset.c; State.color = b.dataset.c; this.syncInspector(); Editor.render();
    }));
    live('#sk-width', (v, el) => { s.width = +v; State.width = +v; el.nextElementSibling.value = v; });
    live('#sk-scale', (v, el) => { s.scale = v / 100; el.nextElementSibling.value = s.scale.toFixed(2) + '×'; });
    live('#sk-rot',   (v, el) => { s.rotation = v * Math.PI / 180; el.nextElementSibling.innerHTML = v + '&deg;'; });

    body.querySelector('#sk-front').addEventListener('click', () => { Store.raise(s.id); Editor.render(); });
    body.querySelector('#sk-dup').addEventListener('click', () => {
      const c = JSON.parse(JSON.stringify(s));
      c.id = 's' + (Store.seq++); c.x += 60; c.y += 60;
      Store.add(c); this.syncInspector(); Editor.render();
    });
    body.querySelector('#sk-del').addEventListener('click', () => {
      Store.remove(s.id); this.syncInspector(); Editor.render();
    });
  }
};

export function openEditor(imgSrc, onClose) {
  UI.onClose = onClose || null;
  UI.open(imgSrc);
}
