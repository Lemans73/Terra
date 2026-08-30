/* ============================================================
   TERRA — the quake labels
   ------------------------------------------------------------
   Placement, clustering and the leader lines for the earthquake
   labels.

   FOUR THINGS CARRY THIS LAYER

   1  THE DIRECTION IS CONTINUOUS. An earlier version had eight
      fixed positions each with its own alignment; here there is
      one unit vector and one line of geometry. Put the CENTRE of
      the label at

          C = indicator + n * (off + edge(n, w, h))

      with edge the distance from the centre to the label border
      along n. Then the BORDER always sits exactly `off` pixels
      from the indicator at any angle, and the attachment point
      slides along that border. That point is exactly
      indicator + n*off, so the leader line needs no angle maths.

   2  CLUSTERING. In a swarm the LIST belongs to the GROUP instead
      of each label to one dot. Then the question of which label
      belongs to which indicator no longer exists.

   3  THE ACCORDION. Hovering does not break a group up; it opens
      one row INSIDE the label. Placement keeps using the CLOSED
      size, so the hovered row stays put and only what is below it
      moves down.

   4  THE STACKED POSITION. The shader moves an indicator that sits
      on a storey; computing from the real position in JavaScript
      misses systematically. MEASURED: 257 of 450 events shifted
      43 px on average, up to 141 px.
   ============================================================ */

export function createQuakeLabels(THREE, opts = {}) {
  const P = opts.params;
  const depthRGB = opts.depthRGB;
  const getCoords = opts.getCoords;
  const getCamera = opts.getCamera;
  const getViewport = opts.getViewport;
  const getIndicator = opts.getIndicator || (() => null);
  const momentNow = opts.momentNow || (() => new Date());
  /* ON/OFF AND THE BUDGET ARE READ, not set. Both live in index.html as let
     bindings: labelsOn hangs off the switch in Settings and off the view
     states, labelBudget off the slider. They are written in five places, and
     every place that would also have to forward it to this layer is a place
     that can forget. This way there is one source. */
  const getEnabled = opts.getEnabled || (() => true);
  const getBudget = opts.getBudget || (() => null);
  const onSelect = opts.onSelect || (() => {});
  /* WHAT HAPPENS WHEN THE MOUSE ENTERS A LABEL ROW. This layer knows which
     event it is; the indicator layer does not. The callback brings the two
     together without either having to know the other. */
  const onHover = opts.onHover || (() => {});
  if (!P || !depthRGB || !getCoords || !getCamera || !getViewport) {
    throw new Error('createQuakeLabels: params, depthRGB, getCoords, getCamera en getViewport zijn verplicht');
  }

  const GLOBE_R = 100;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ---- the layer in the DOM ----------------------------------------------

  /* THE OVERLAY LAYER COMES FROM OUTSIDE. Terra already has one, #quake-labels,
     and it is SHARED: the solar regions (.rlabel) and the axis labels (.alabel)
     hang in it too, with their leader lines in the same #label-lines SVG. A
     second layer beside it would open a second z-index story about exactly the
     same kind of content.

     Without a host this module makes one itself; that is the route for a
     proefopstelling. */
  const eigenHost = !opts.host;
  const host = opts.host || (() => {
    const d = document.createElement('div');
    d.id = 'quake-labels';
    document.body.appendChild(d);
    return d;
  })();
  const svg = opts.svg || (() => {
    const s = document.createElementNS(SVG_NS, 'svg');
    s.id = 'label-lines';
    host.appendChild(s);
    return s;
  })();

  const css = document.createElement('style');
  css.textContent = /* css */`
/* The layer itself and the SVG get NO rules here: those live in css/app.css and
   are shared with the solar regions and the axis labels. Everything below hangs
   off .ql-* and therefore touches only this layer. */
#quake-labels .ql-wrap { position: absolute; inset: 0; pointer-events: none; }
#quake-labels .ql-box {
  position: absolute; left: 0; top: 0;
  pointer-events: auto; cursor: pointer;
  white-space: nowrap; will-change: transform;
}
#quake-labels .ql-box .rij {
  font: 600 13px/1.32 -apple-system, system-ui, sans-serif; letter-spacing: 0.1em;
}
#quake-labels .ql-box .rij .t {
  font: 500 9px/1 ui-monospace, Menlo, monospace; letter-spacing: 0.12em;
  opacity: 0.7; margin-left: 6px;
}
#quake-labels .ql-box .live { margin-left: 6px; font-size: 9px; letter-spacing: 0.2em; color: #4dd0e1; }
#quake-labels .ql-box .extra { padding-left: 1px; }
#quake-labels .ql-box .dep { font-size: 10px; letter-spacing: 0.14em; }
#quake-labels .ql-box .loc { font-size: 10px; color: var(--ink-dim, #7d8aa0); letter-spacing: 0.04em; }
#quake-labels .ql-box .tim { font-size: 10px; color: var(--ink-faint, #525d72); letter-spacing: 0.1em; }
#quake-labels .ql-box .rij:hover, #quake-labels .ql-box.actief { filter: brightness(1.35); }
#quake-labels .ql-box .rij.op { text-shadow: 0 1px 10px rgba(0,0,0,0.95), 0 0 14px currentColor; }
#quake-labels .ql-box.actief { text-shadow: 0 1px 10px rgba(0,0,0,0.95), 0 0 14px currentColor; }
/* THE DEPTH ROW GOES WHITE ON HOVER TOO. The .dep row had no colour of its own
   and inherited the one above it: the DEPTH COLOUR. On an opened label "Depth:
   565 KM" therefore read in the same purple as the ring, while the place name
   and the time beside it already went white. Exactly at the deepest quakes,
   where that colour is darkest, that row was the least readable. It now follows
   .loc and .tim.

   GEEN BACKTICKS IN DIT BLOK. Dit commentaar staat IN de CSS-template-literal
   hierboven, en een backtick sluit die string. Bij een even aantal parseert het
   bestand nog gewoon door — het wordt dan een property-access plus een tagged
   template — en dan is er geen syntaxfout, alleen een halve stylesheet en een
   app die verderop omvalt met "Cannot access X before initialization". */
#quake-labels .ql-box.actief .loc, #quake-labels .ql-box.actief .tim,
#quake-labels .ql-box.actief .dep { color: var(--ink, #e8eef7); }
#quake-labels .ql-box.omlijnd { -webkit-text-stroke: var(--ql-stroke) #000; paint-order: stroke fill; }
#quake-labels .ql-box.wit, #quake-labels .ql-box.wit .rij { color: #fff !important; }
`;
  document.head.appendChild(css);

  /* HOVER AND CLICK ON THE LAYER ITSELF and not per row. One listener for all
     labels together: the rows are rewritten every frame, and a listener per row
     would have to be reattached every frame. */
  let hoveredId = null, selectedId = null;
  const idVan = (e) => {
    const rij = e.target.closest && e.target.closest('[data-id]');
    return rij ? rij.getAttribute('data-id') : null;
  };
  /* HOVERING A LABEL ROW IS HOVERING ITS INDICATOR. Session 41 passed the
     other members of the same label block along so only those would dim;
     session 42 dropped that — a label and an indicator now do the same thing,
     and everything but the hovered quake dims either way. */
  host.addEventListener('pointermove', (e) => {
    const id = idVan(e);
    if (id === hoveredId) return;
    hoveredId = id;
    onHover(id);
  });
  host.addEventListener('pointerleave', () => { hoveredId = null; onHover(null); });
  host.addEventListener('click', (e) => {
    const id = idVan(e);
    if (!id) return;
    e.stopPropagation();
    const q = events.find(x => x.id === id);
    /* CLICKING OPENS THE DETAIL PANEL, and the panel sets `selectedId` back on
       this layer through setSelected(). Writing it here as well would make this
       layer a second writer of a state the app already owns — and then a click
       on the indicator and a click on a label would leave it in different
       places. Hover gives the summary, a click gives the rest. */
    if (q) onSelect(q);
  });

  // ---- the nodes ---------------------------------------------------------

  const pool = [];
  function makeNode() {
    const wrap = document.createElement('div');
    wrap.className = 'ql-wrap';
    const box = document.createElement('div');
    box.className = 'ql-box';
    wrap.appendChild(box);
    host.appendChild(wrap);
    const line = document.createElementNS(SVG_NS, 'line');
    const dot = document.createElementNS(SVG_NS, 'circle');
    svg.appendChild(line);
    svg.appendChild(dot);
    /* The content is rebuilt each time rather than filled into fixed fields: a
       node carries either one row per quake (a cluster) or the four rows of an
       opened event. That alternates, so fixed fields get in the way. */
    return { wrap, box, line, dot, sleutel: null, maat: null, openEl: null };
  }

  const verberg = (n) => {
    n.wrap.style.display = 'none';
    n.line.style.display = 'none';
    n.dot.style.display = 'none';
  };

  // ---- the content -------------------------------------------------------

  // "3H AGO" / "2D AGO", from the CHOSEN moment. With the wall clock a time
  // trip would show "720H AGO" for a quake that was an hour old back then.
  function formatAgo(ms) {
    const min = (momentNow().getTime() - ms) / 60000;
    if (min < 60) return Math.max(0, Math.round(min)) + 'M AGO';
    if (min < 1440) return Math.round(min / 60) + 'H AGO';
    return Math.round(min / 1440) + 'D AGO';
  }

  const kleurVan = (q) => 'rgb(' + depthRGB(q.depth).join(',') + ')';

  const plaatsVan = (q) => {
    if (P.quakeLabelCoords) {
      const ns = q.lat >= 0 ? 'N' : 'S', ew = q.lng >= 0 ? 'E' : 'W';
      return Math.abs(q.lat).toFixed(2) + ns + ' ' + Math.abs(q.lng).toFixed(2) + ew;
    }
    // Terra's place name often carries a country behind it; the first half is
    // the location, and that is what you want to read on a label.
    return (q.label || '').split(',')[0].replace(/^\d+\s*km\s+[\w-]+\s+of\s+/i, '');
  };

  /* The content of one label. Two shapes:

     OVERVIEW  one row per quake, magnitude only. Nothing more is needed to see
               where something happened and how heavy, and the block is three
               times smaller for it — which saves the avoidance work.
     OPENED    four rows, with depth, location and time. Only for the event you
               HOVER.

     ONE BUILD FOR BOTH. Every quake is the same row; hovering hangs
     alleen velden ONDER. Daardoor is de regel die je leest in beide gedaanten
     even hoog en even breed — de eis van de accordeon, want anders schuift hij
     weg onder de muis. */
  function vulLabel(n, leden, open) {
    const openLijst = open && open.size ? [...open].sort().join('+') : '';
    const sleutel = leden.map(q => q.id).join(',') + '|' + openLijst + '|' +
      P.quakeLabelDepth + P.quakeLabelPlace + P.quakeLabelTime + P.quakeLabelCoords;
    if (n.sleutel === sleutel) return;
    n.sleutel = sleutel;
    n.maat = null;

    // Most recent on top: in a swarm unfolding over days that is what you want
    // to know, not which one happened to be the heaviest.
    const gesorteerd = [...leden].sort((a, b) => (b.time || 0) - (a.time || 0));
    const nu = momentNow().getTime();
    n.box.innerHTML = gesorteerd.map(q => {
      const vers = nu - (q.time || 0) < 3600e3;
      const uit = !!(open && open.has(q.id));
      // data-id makes every row hoverable; in a cluster that is the only way to
      // pick one quake out of the group.
      let h = '<div class="rij' + (uit ? ' op' : '') + '" data-id="' + q.id +
              '" style="color:' + kleurVan(q) + '">M' + (q.value != null ? q.value.toFixed(1) : '?') +
              (vers ? '<span class="live">LIVE</span>'
                    : (gesorteerd.length > 1 ? '<span class="t">' + formatAgo(q.time) + '</span>' : '')) +
              '</div>';
      /* The opened fields carry THE SAME data-id as their row. Without that the
         hover drops as soon as the mouse moves over "Depth", the label closes,
         the mouse lands on the row again, it opens — and then it flickers
         the label. */
      if (uit) {
        const d = ' data-id="' + q.id + '"';
        if (P.quakeLabelDepth && q.depth != null) h += '<div class="extra dep"' + d + '>Depth: ' + Math.round(q.depth) + ' KM</div>';
        if (P.quakeLabelPlace) h += '<div class="extra loc"' + d + '>' + plaatsVan(q) + '</div>';
        if (P.quakeLabelTime && q.time) h += '<div class="extra tim"' + d + '>' + formatAgo(q.time) + '</div>';
      }
      return h;
    }).join('');
    n.openEl = n.box.querySelector('.rij.op');
  }

  // ---- geometry ----------------------------------------------------------

  /* The distance from the centre of a w by h rectangle to its border, along the
     unit vector n. Which of the two sides sets the border depends on the angle;
     the smaller of the two wins. The clamp at 1e-6 catches the axes where one
     component is zero — there the division runs to infinity and min() takes the
     other side, which is exactly right. */
  function randAfstand(nx, ny, w, h) {
    const ax = Math.abs(nx), ay = Math.abs(ny);
    const tx = ax > 1e-6 ? (w * 0.5) / ax : Infinity;
    const ty = ay > 1e-6 ? (h * 0.5) / ay : Infinity;
    return Math.min(tx, ty);
  }

  const botst = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  const smoothstepJS = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / Math.max(1e-6, b - a)));
    return t * t * (3 - 2 * t);
  };

  // Reused vectors: these functions run per label per frame and must not
  // allocate.
  const _n = new THREE.Vector3();
  const _p = new THREE.Vector3();
  const _c = new THREE.Vector3();
  const _u = new THREE.Vector3();
  const _u2 = new THREE.Vector3();

  // The unit normal of an event, through Terra's own conversion.
  function normaalVan(q, doel) {
    const c = getCoords(q.lat, q.lng, 0);
    return doel.set(c.x, c.y, c.z).normalize();
  }

  /* The remembered state per quake: last frame's direction (to freeze when the
     axis gets too short) and last frame's position (to glide towards). Keyed on
     the ANCHOR id and not on the node — nodes swap events as soon as the budget
     shifts. */
  const state = new Map();

  /* DE RICHTING WAARIN HET LABEL HANGT.

     upright  → de geprojecteerde radiale as: waar het event heen zou steken als
                er nog een staaf stond.
     outward  → van het schermmiddelpunt van de bol af.
     geen     → vast rechtsboven.

     DE AS WORDT ALTIJD GEMETEN, ook als de RICHTING ergens anders vandaan komt.
     De aslengte is een eigenschap van het EVENT, dus `axisOffset` hoort ook te
     werken met `upright` uit. Stond die berekening binnen de upright-tak, dan
     was de aslengte daar nul en deed de schuif stilletjes niets. */
  function labelRichting(q, qIndex, sx, sy, midX, midY, W, H, camLen, lift, st) {
    const cam = getCamera();
    normaalVan(q, _u);
    const qi = getIndicator();
    const asLift = qi ? qi.stackedNormalJS(qIndex, _u, camLen, _u2) : (_u2.copy(_u), 0);
    _u2.multiplyScalar(GLOBE_R + lift + asLift + 8).project(cam);
    const asX = (_u2.x + 1) / 2 * W - sx;
    const asY = (1 - (_u2.y + 1) / 2) * H - sy;
    const asPx = Math.hypot(asX, asY);

    let ux = 0, uy = 0, geldig = false;
    if (P.quakeLabelUpright) {
      ux = asX; uy = asY;
      geldig = asPx >= P.quakeLabelUprightMinPx;
      /* TOO SHORT: the axis points at the camera and its direction is noise.
         Freeze on last frame — otherwise the label spins as soon as you look
         straight down on it. The LENGTH does not freeze with it: that one is
         reliable (near zero) and should pull the label towards its indicator. */
      if (!geldig && st && st.nx !== undefined) return { nx: st.nx, ny: st.ny, asPx };
    }
    if (!geldig && P.quakeLabelOutward) {
      ux = sx - midX; uy = sy - midY;
      geldig = Math.hypot(ux, uy) >= 30;
    }
    if (!geldig) { ux = 0.82; uy = -0.58; }
    const len = Math.hypot(ux, uy) || 1;
    return { nx: ux / len, ny: uy / len, asPx };
  }

  // ---- the loop ----------------------------------------------------------

  let events = [];
  let vorigeTijd = 0, frame = 0, sprong = 0;


  function setEvents(list) {
    events = list || [];
    /* DE STAAT OPRUIMEN. Hij groeit anders onbegrensd: elke camerastand levert
       nieuwe ankers op en er werd nooit iets weggegooid. Bij een live stroom
       over uren is dat een langzaam lek — een open punt sinds sessie 39. */
    if (state.size > events.length * 2 + 64) {
      const levend = new Set(events.map(q => q.id));
      for (const id of state.keys()) if (!levend.has(id)) state.delete(id);
    }
  }

  function update(nowMs) {
    if (!getEnabled() || !events.length) { for (const n of pool) verberg(n); return; }
    const cam = getCamera();
    const vp = getViewport();
    const W = vp.w, H = vp.h;
    if (!W || !H) return;

    /* THE REAL dt, and not an assumption. At 60 fps the step is 16.7 ms; a
       damping computed from an invented dt glides too fast or too slow at any
       other refresh rate. */
    const nu = nowMs || (vorigeTijd + 16);
    const dtMs = Math.min(100, Math.max(0, nu - vorigeTijd)) || 16;
    vorigeTijd = nu;

    const camLen = cam.position.length();
    const horizon = GLOBE_R / Math.max(camLen, GLOBE_R + 0.001);
    _c.copy(cam.position).normalize();
    const qi = getIndicator();
    const lift = qi ? qi.ringMat.uniforms.uLift.value : 0;

    /* The edge margin scales with the visible cap: the horizon runs from 0.22
       at distance 450 to 0.952 at 105, and a fixed margin would eat more than
       half of that cap. */
    const randMarge = horizon + 0.04 * (1 - horizon);

    const ver = Math.max(P.quakeLabelZoomFar, P.quakeLabelZoomNear + 1);
    const dichtbij = Math.min(P.quakeLabelZoomNear, ver - 1);
    const t = 1 - smoothstepJS(dichtbij, ver, camLen);
    const minMag = P.quakeLabelMinMag + (P.quakeLabelZoomMinMag - P.quakeLabelMinMag) * t;
    const gevraagd = getBudget();
    const basisBudget = gevraagd == null ? P.quakeLabelBudget : Math.max(0, gevraagd);
    const budgetNu = Math.round(basisBudget + (P.quakeLabelZoomBudget - basisBudget) * t);

    /* First strike out what is off screen, then apply the budget — the other
       way round the budget acts as a hidden magnitude threshold. And also
       whether the point really falls inside the view: the horizon only says an
       event is on the near side of the globe, which zoomed in is not the same
       thing. */
    const bMarge = 0.12;
    const zichtbaar = [];
    for (let i = 0; i < events.length; i++) {
      const q = events[i];
      if ((q.value || 0) < minMag) continue;
      normaalVan(q, _n);
      if (_n.dot(_c) < randMarge) continue;
      /* THE STACKED POSITION, not the real one. With stacking on the shader
         pushes this indicator sideways and up; a label computing from the real
         position then hangs tens of pixels away from its own dot. The index i
         runs in step with the instance attributes, because uploadEvents fills
         them in the same order. */
      const eigenLift = qi ? qi.stackedNormalJS(i, _n, camLen, _p) : (_p.copy(_n), 0);
      _p.multiplyScalar(GLOBE_R + lift + eigenLift).project(cam);
      if (Math.abs(_p.x) > 1 + bMarge || Math.abs(_p.y) > 1 + bMarge) continue;
      zichtbaar.push({ q, i, x: (_p.x + 1) / 2 * W, y: (1 - (_p.y + 1) / 2) * H });
    }
    zichtbaar.sort((a, b) => (b.q.value || 0) - (a.q.value || 0));

    const aandacht = new Set();
    for (const id of [selectedId, hoveredId]) if (id) aandacht.add(id);

    /* HOVERING DOES NOT BREAK THE GROUP UP. An earlier version pulled the
       hovered event out of the list and put it back as a separate label; the
       remaining members then recluster greedily from the heaviest, so the whole
       group jumps and after one frame the mouse is on nothing. The rule now:
       hovering only promotes what has NO label yet; whatever already has one
       opens INSIDE that label. */
    const rest = zichtbaar.slice(0, Math.max(0, budgetNu));

    /* THE CLUSTER DISTANCE SHRINKS WITH THE ZOOM, but no longer to zero. Zoomed
       in there is usually room enough and every quake should have its own label
       — except in a swarm, and a swarm is exactly what you zoom into. The floor
       keeps the list together there. t is the same zoom factor that drives the
       threshold and the budget above: 0 far away, 1 fully zoomed in. See the
       note at quakeLabelClusterPxNear in js/config.js. */
    const clusterVer = P.quakeLabelClusterPx;
    const clusterNabij = Math.min(P.quakeLabelClusterPxNear, clusterVer);
    const clusterPx = clusterNabij + (clusterVer - clusterNabij) * (1 - t);
    const groepen = [];
    if (P.quakeLabelCluster && clusterPx > 1) {
      const gedaan = new Set();
      for (const z of rest) {
        if (gedaan.has(z.q.id)) continue;
        const leden = [z];
        gedaan.add(z.q.id);
        for (const a of rest) {
          if (gedaan.has(a.q.id)) continue;
          if (Math.hypot(a.x - z.x, a.y - z.y) > clusterPx) continue;
          if (leden.length >= P.quakeLabelClusterMax) break;
          leden.push(a); gedaan.add(a.q.id);
        }
        /* THE DOT GOES ON THE ANCHOR, not on the centroid of the group. The
           centroid looked tidier, but the centroid of two indicators is a place
           where nothing stands — the leader line then pointed at emptiness. The
           anchor is the heaviest of the group and therefore a real indicator.
           THE SCREEN POSITION OF EVERY MEMBER COMES ALONG, or the line could
           only ever point at the anchor, even when another member is hovered. */
        groepen.push({ leden: leden.map(l => l.q), idx: z.i, x: z.x, y: z.y,
                       anker: z.q, open: null,
                       pos: new Map(leden.map(l => [l.q.id, [l.x, l.y]])) });
      }
    } else {
      for (const z of rest) groepen.push({ leden: [z.q], idx: z.i, x: z.x, y: z.y,
                                           anker: z.q, open: null,
                                           pos: new Map([[z.q.id, [z.x, z.y]]]) });
    }

    const alGelabeld = new Set();
    for (const g of groepen) {
      for (const q of g.leden) {
        alGelabeld.add(q.id);
        if (aandacht.has(q.id)) (g.open || (g.open = new Set())).add(q.id);
      }
    }

    /* Whatever has NO label yet still gets one: above the budget and above the
       threshold. Whoever hovers an indicator wants to know what it is, even at
       M2.9 and even with ten labels already on screen. */
    const los = [];
    for (const id of aandacht) {
      if (alGelabeld.has(id)) continue;
      const idx = events.findIndex(x => x.id === id);
      if (idx < 0) continue;
      const q = events[idx];
      normaalVan(q, _n);
      if (_n.dot(_c) < horizon) continue;
      const losLift = qi ? qi.stackedNormalJS(idx, _n, camLen, _p) : (_p.copy(_n), 0);
      _p.multiplyScalar(GLOBE_R + lift + losLift).project(cam);
      if (Math.abs(_p.x) > 1 + bMarge || Math.abs(_p.y) > 1 + bMarge) continue;
      const lx = (_p.x + 1) / 2 * W, ly = (1 - (_p.y + 1) / 2) * H;
      los.push({ leden: [q], idx, x: lx, y: ly, anker: q, open: new Set([id]),
                 pos: new Map([[id, [lx, ly]]]) });
    }

    const alles = [...los, ...groepen];
    while (pool.length < alles.length) pool.push(makeNode());

    for (let i = 0; i < pool.length; i++) {
      const n = pool[i], g = alles[i];
      if (!g) { verberg(n); continue; }
      n.wrap.style.display = '';
      n.line.style.display = '';
      n.dot.style.display = '';
      vulLabel(n, g.leden, g.open);
    }
    // Measure AFTER writing: one reflow instead of one per label.
    for (const n of pool) {
      if (n.wrap.style.display === 'none' || n.maat) continue;
      const r = n.box.getBoundingClientRect();
      n.maat = { w: r.width, h: r.height };
    }

    const bezet = [];
    const pad = P.quakeLabelPad;

    _p.set(0, 0, 0).project(cam);
    const midX = (_p.x + 1) / 2 * W, midY = (1 - (_p.y + 1) / 2) * H;
    // The projected globe radius in pixels: element [5] of the projection
    // matrix is 1/tan(half fov), the same route as everywhere else.
    const bolHoek = Math.asin(Math.min(1, GLOBE_R / Math.max(camLen, GLOBE_R + 0.001)));
    const bolPx = Math.tan(bolHoek) * cam.projectionMatrix.elements[5] * (H * 0.5);

    sprong = 0;

    for (let i = 0; i < pool.length; i++) {
      const n = pool[i], g = alles[i];
      if (!g) continue;

      const sx = g.x, sy = g.y;
      const mf = Math.max(0, Math.min(1,
        ((g.anker.value || 0) - P.quakeMagMin) / Math.max(0.1, P.quakeMagMax - P.quakeMagMin)));
      const ringPx = ringRadiusInPixels(mf, camLen, H);
      const actief = !!(g.open && g.open.size);

      // WHICH EVENT DOES THE LINE POINT AT? The hovered member if there is one,
      // otherwise the anchor. Three things hang off it: the dot, the line end
      // and the colour.
      const openId = actief ? [...g.open].find(id => g.pos && g.pos.has(id)) : null;
      const doelQ = (openId && g.leden.find(q => q.id === openId)) || g.anker;
      const doelPos = (openId && g.pos.get(openId)) || [sx, sy];
      const dx0 = doelPos[0], dy0 = doelPos[1];

      let st = state.get(g.anker.id);
      if (!st) { st = {}; state.set(g.anker.id, st); }

      /* PLACEMENT USES THE CLOSED SIZE, and that is the heart of the accordion.
         Computing from the opened size would shift the whole block as soon as
         fields appear, sliding the row out from under the mouse. The closed size
         comes from the STATE and not from a subtraction: a label has always been
         closed before you can hover it. */
      if (!actief && n.maat) st.maatDicht = n.maat;
      const maat = (actief && st.maatDicht) || n.maat || { w: 60, h: 18 };

      let off = P.quakeLabelOffset + ringPx * P.quakeLabelRingClear;

      /* OUTSIDE THE GLOBE'S EDGE. Pointing AWAY from the centre is not the same
         as standing outside the globe. Only what lies near the edge: a quake you
         look straight down on sits in the middle of the projected globe, and
         pushing that outwards gives a leader line half a planet long.

         THE TRANSITION IS SMOOTH, and that was a repair.
         Hier stond `camLen >= quakeLabelOutsideFrom`, en die drempel is hard:
         gemeten sprong de offset van een randlabel bij het passeren van
         afstand 200 van 21,4 naar 61,4 pixels — veertig pixels in één frame,
         en bij terugzoomen net zo hard terug. Dat is het uitschieten van de
         leader-lines dat in de schematische weergave opviel; daar kom je die
         afstand vaker tegen omdat je er tot 102 mag inzoomen tegen 120 in de
         realistische.

         `quakeLabelOutsideFade` is de breedte van de band waarover het effect
         opkomt. Op 0 is het weer de oude harde drempel — dat is met opzet: zo
         is de oude staat nog te kiezen zonder de code te wijzigen. */
      if (P.quakeLabelOutside) {
        const fade = Math.max(0, P.quakeLabelOutsideFade || 0);
        const rauw = fade > 0
          ? (camLen - P.quakeLabelOutsideFrom) / fade
          : (camLen >= P.quakeLabelOutsideFrom ? 1 : 0);
        const t = Math.min(1, Math.max(0, rauw));
        // smoothstep: no kink at the start or the end of the band
        const mate = t * t * (3 - 2 * t);
        if (mate > 0) {
          const vanMidden = Math.hypot(sx - midX, sy - midY);
          if (vanMidden > bolPx * P.quakeLabelOutsideKern) {
            const nodig = bolPx - vanMidden + P.quakeLabelOutsidePad;
            if (nodig > off) {
              const doel = Math.min(nodig, off + P.quakeLabelOutsideMax);
              off += (doel - off) * mate;
            }
          }
        }
      }

      const richting = labelRichting(g.anker, g.idx, sx, sy, midX, midY, W, H, camLen, lift, st);
      st.nx = richting.nx; st.ny = richting.ny;
      off += (richting.asPx || 0) * P.quakeLabelAxisOffset;

      /* PLACED ALONG ONE CONTINUOUS AXIS. First the axis itself at increasing
         distance; if it does not fit there, the label fans out over a continuous
         angular range, nearest first and alternating left and right. That last
         part is the escape: without it you trade "sometimes an odd direction"
         for "sometimes no label". */
      const zetNeer = (nx, ny, uit) => {
        const rand = P.quakeLabelOffsetToEdge ? randAfstand(nx, ny, maat.w, maat.h) : 0;
        const cx = sx + nx * (uit + rand), cy = sy + ny * (uit + rand);
        return { x: cx - maat.w * 0.5, y: cy - maat.h * 0.5,
                 hx: sx + nx * uit, hy: sy + ny * uit };
      };

      let gekozen = null;
      const ringen = Math.max(1, Math.round(P.quakeLabelAvoidRings));
      if (P.quakeLabelAvoid && !actief) {
        zoek:
        for (let r = 0; r < ringen; r++) {
          const uit = off * (1 + r * 0.55);
          const stap = Math.max(1, P.quakeLabelFanStep);
          const maxK = Math.floor(Math.max(0, P.quakeLabelFanDeg) / stap);
          for (let k = 0; k <= maxK; k++) {
            for (const teken of (k === 0 ? [0] : [1, -1])) {
              const a = teken * k * stap * Math.PI / 180;
              const c = Math.cos(a), s = Math.sin(a);
              const nx = richting.nx * c - richting.ny * s;
              const ny = richting.nx * s + richting.ny * c;
              const p = zetNeer(nx, ny, uit);
              if (p.x < 0 || p.y < 0 || p.x + maat.w > W || p.y + maat.h > H) continue;
              const doos = { x: p.x - pad, y: p.y - pad, w: maat.w + pad * 2, h: maat.h + pad * 2 };
              if (bezet.some(b => botst(doos, b))) continue;
              gekozen = { ...p, doos };
              break zoek;
            }
          }
        }
      }
      if (!gekozen) {
        const mag = !(P.quakeLabelAvoid && P.quakeLabelDropBlocked && !actief);
        if (!mag) { verberg(n); continue; }
        const p = zetNeer(richting.nx, richting.ny, off);
        if (!actief && (p.x < -maat.w * 0.5 || p.y < -maat.h * 0.5 ||
                        p.x + maat.w * 0.5 > W || p.y + maat.h * 0.5 > H)) {
          verberg(n); continue;
        }
        gekozen = { ...p, doos: { x: p.x - pad, y: p.y - pad, w: maat.w + pad * 2, h: maat.h + pad * 2 } };
      }

      /* THE BOX USES THE CLOSED SIZE, even for an opened label. The opened part
         may therefore fall across a neighbouring label. That is a deliberate
         trade: growing the box would push the group forwards or backwards in
         the race for space, and then it jumps anyway. */
      bezet.push(gekozen.doos);

      /* GLIDING. Even with a continuous axis a label still jumps when the
         avoidance changes ring or a cluster changes composition. A label that is
         NEW or swaps event starts ON its target — not at the previous place, or
         it shoots across the screen. */
      let px = gekozen.x, py = gekozen.y;
      const tau = Math.max(0, P.quakeLabelEaseMs);
      if (tau > 0 && st.px !== undefined && st.frame === frame - 1) {
        const k = 1 - Math.exp(-dtMs / tau);
        px = st.px + (gekozen.x - st.px) * k;
        py = st.py + (gekozen.y - st.py) * k;
      }
      /* MEASURE THE JUMP, BUT ONLY OVER ONE FRAME. st is keyed on the ANCHOR id,
         and an anchor that had no label for a while still carries its position
         from back then. Without this check you measure the movement across all
         the frames in between: at 0.35 degrees per frame that gave outliers up
         to 990 px for a label that simply appeared in its place.

         The same condition the gliding above already uses, and for the same
         reason. */
      if (st.px !== undefined && st.frame === frame - 1) {
        const d = Math.hypot(px - st.px, py - st.py);
        if (d > sprong) sprong = d;
      }
      st.px = px; st.py = py; st.frame = frame;

      /* THE LINE CONNECTS TWO THINGS AND BOTH HAVE TO BE RIGHT. The GLOBE end
         hoort op de indicator van het event dat je aanwijst — stond dat op het
         anchor, the line ran from one quake's row to another quake's indicator.
         The LABEL end belongs on the row you are reading, and both measured
         against the same size. */
      const schuifX = px - gekozen.x, schuifY = py - gekozen.y;
      let hechtX = gekozen.hx + schuifX, hechtY = gekozen.hy + schuifY;
      if (actief && n.openEl) {
        const bw = n.maat ? n.maat.w : maat.w;
        hechtX = (dx0 < px + bw * 0.5) ? px : px + bw;
        hechtY = py + n.openEl.offsetTop + n.openEl.offsetHeight * 0.5;
      }

      // For the measurement hook: which event the dot marks, and which is the anchor.
      n.doelId = doelQ.id;
      n.ankerId = g.anker.id;

      const kleur = kleurVan(doelQ);
      const dm = P.quakeLabelDotSize;
      n.dot.setAttribute('cx', dx0);
      n.dot.setAttribute('cy', dy0);
      n.dot.setAttribute('r', dm / 2);
      n.dot.setAttribute('fill', kleur);
      n.dot.setAttribute('stroke', actief ? 'rgba(255,255,255,0.45)' : 'none');
      n.dot.setAttribute('stroke-width', actief ? 3 : 0);

      /* NO LINE WHEN THE INDICATOR SITS INSIDE THE LABEL. With offset and
         ringClear at zero the label falls over its own indicator, and then a
         leader line runs straight through the text — it joins two things that
         already coincide.

         AND NO LINE AT ALL AT OPACITY ZERO (session 42, Terry). The hover branch
         used to force 1 there, which is why turning the line off did not stick.
         Zero now means gone, hover included; the placement maths above is
         untouched, only the drawing is skipped. */
      const bw = n.maat ? n.maat.w : maat.w, bh = n.maat ? n.maat.h : maat.h;
      const marge = 4;
      const inHetLabel = dx0 > px - marge && dx0 < px + bw + marge &&
                         dy0 > py - marge && dy0 < py + bh + marge;
      if (P.quakeLabelLineOpacity <= 0 || inHetLabel ||
          Math.hypot(hechtX - dx0, hechtY - dy0) < 2) {
        n.line.setAttribute('stroke-opacity', '0');
      } else {
        n.line.setAttribute('x1', dx0); n.line.setAttribute('y1', dy0);
        n.line.setAttribute('x2', hechtX); n.line.setAttribute('y2', hechtY);
        n.line.setAttribute('stroke', kleur);
        n.line.setAttribute('stroke-width', P.quakeLabelLineWidth);
        n.line.setAttribute('stroke-opacity', actief ? 1 : P.quakeLabelLineOpacity);
      }

      n.box.style.transform = 'translate(' + px + 'px,' + py + 'px)';
      n.box.style.color = kleurVan(g.anker);
      // The hovered one lies on top. The wrap is positioned (inset: 0), so
      // z-index actually does something here.
      n.wrap.style.zIndex = actief ? '20' : '';
      n.box.classList.toggle('actief', actief);
      n.box.classList.toggle('omlijnd', P.quakeLabelOutline > 0);
      n.box.classList.toggle('wit', !!P.quakeLabelWhite);
      if (P.quakeLabelOutline > 0) n.box.style.setProperty('--ql-stroke', P.quakeLabelOutline + 'px');
    }
    frame++;
  }

  /* The ring radius in screen pixels, along the same route as the shader. If
     this formula ever drifts from the GLSL, both the labels and the picking miss
     — which is why it comes from the indicator layer and is not repeated here. */
  function ringRadiusInPixels(magFrac, camLen, viewH) {
    const qi = getIndicator();
    if (!qi) return 0;
    const wereld = qi.ringWorldRadius(magFrac) * qi.iconScaleJS(camLen);
    return wereld * getCamera().projectionMatrix.elements[5] * (viewH * 0.5)
         / Math.max(camLen - GLOBE_R, 1);
  }

  /* PICKING BY HAND and not with THREE.Raycaster: the shader decides where every
     vertex ends up, so the geometry in memory sits somewhere other than what you
     see. A raycast would work perfectly and miss systematically. This walks the
     same route as the shader. */
  function pickAt(px, py) {
    if (!events.length) return null;
    const cam = getCamera(), vp = getViewport();
    const qi = getIndicator();
    const camLen = cam.position.length();
    const horizon = GLOBE_R / Math.max(camLen, GLOBE_R + 0.001);
    _c.copy(cam.position).normalize();
    const lift = qi ? qi.ringMat.uniforms.uLift.value : 0;
    const span = Math.max(0.1, P.quakeMagMax - P.quakeMagMin);

    let best = null, bestAfstand = Infinity;
    for (let i = 0; i < events.length; i++) {
      const q = events[i];
      normaalVan(q, _n);
      /* The horizon test uses the REAL position, the hit area the stacked one:
         an event does not disappear behind the globe because its stack pushed it
         sideways, but you do click where it STANDS. */
      if (_n.dot(_c) < horizon) continue;
      const eigenLift = qi ? qi.stackedNormalJS(i, _n, camLen, _p) : (_p.copy(_n), 0);
      _p.multiplyScalar(GLOBE_R + lift + eigenLift).project(cam);
      const sx = (_p.x + 1) / 2 * vp.w, sy = (1 - (_p.y + 1) / 2) * vp.h;
      const d = Math.hypot(sx - px, sy - py);
      const mf = Math.max(0, Math.min(1, ((q.value || 0) - P.quakeMagMin) / span));
      const treffer = Math.max(P.quakeLabelPickRadius, ringRadiusInPixels(mf, camLen, vp.h) * 0.95);
      if (d > treffer) continue;
      // On overlap the NEAREST wins and not the heaviest: whoever points at a
      // small ring that falls inside a large one means the small one.
      if (d < bestAfstand) { bestAfstand = d; best = q; }
    }
    return best;
  }

  /* MEASUREMENT HOOK: which event belongs to which dot. Without it the link can
     only be made on TEXT — and "M5.7" occurs more than once, which produced
     800 px jumps that did not exist. The layer knows, so the layer says so. */
  function zichtbareLabels() {
    const uit = [];
    for (let i = 0; i < pool.length; i++) {
      const n = pool[i];
      if (n.wrap.style.display === "none") continue;
      const cx = n.dot.getAttribute("cx"), cy = n.dot.getAttribute("cy");
      if (cx == null) continue;
      uit.push({
        // The event the DOT sits on — the hovered member if there is one,
        // otherwise the anchor. Exactly what the line points at.
        id: n.doelId || null,
        ankerId: n.ankerId || null,
        stip: [+cx, +cy],
        blok: n.box.style.transform,
        regels: n.box.querySelectorAll(".rij").length
      });
    }
    return uit;
  }

  return {
    host, svg,
    setEvents, update, pickAt, zichtbareLabels,
    setHovered(id) { hoveredId = id; },
    setSelected(id) { selectedId = id; },
    get hoveredId() { return hoveredId; },
    get selectedId() { return selectedId; },
    get sprong() { return sprong; },
    get stateSize() { return state.size; },
    dispose() {
      // Only clean up what we made ourselves: the host is usually shared.
      for (const n of pool) { n.wrap.remove(); n.line.remove(); n.dot.remove(); }
      if (eigenHost) host.remove();
      css.remove(); pool.length = 0; state.clear();
    }
  };
}
