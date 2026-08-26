/* ============================================================
   TERRA — De beving-labels
   ------------------------------------------------------------
   De plaatsingswiskunde uit logs/indicator-workbench.html
   (sessie 38-39), waar hij in twee ronden is afgesteld. Vervangt
   de oude laag in index.html: rebuildLabels, positionLabels en
   het hover-label.

   WAT DEZE LAAG ANDERS DOET DAN ZIJN VOORGANGER

   1  DE RICHTING IS CONTINU. Er stonden acht vaste plekken met
      een eigen uitlijning per stuk; nu is er één eenheidsvector
      en één regel meetkunde. Zet het MIDDELPUNT van het label op

          C = indicator + n * (off + rand(n, w, h))

      met `rand` de afstand van het middelpunt tot de labelrand
      langs n. Dan ligt de RAND altijd precies `off` pixels van de
      indicator, bij elke hoek, en glijdt het aanhechtpunt over
      die rand mee. Dat punt is bovendien exact `indicator + n*off`,
      dus de leader-line heeft geen hoekberekening nodig.

   2  CLUSTEREN. Bij een zwerm hoort de LIJST bij de GROEP in
      plaats van elk label bij één stip. Dan bestaat de vraag welk
      label bij welke indicator hoort niet meer.

   3  DE ACCORDEON. Aanwijzen breekt een groep niet op maar klapt
      één regel BINNEN het label uit. De plaatsing rekent daarbij
      met de DICHTE maat, zodat de aangewezen regel stil blijft
      staan en alleen wat eronder zit opschuift.

   4  DE GESTAPELDE PLEK. De shader verplaatst een indicator die
      op een verdieping staat; wie in JavaScript met de echte plek
      rekent mikt stelselmatig mis. GEMETEN in de workbench: 257
      van de 450 events verschoven gemiddeld 43 px, tot 141 px.

   VIER DINGEN ZIJN OMGEZET BIJ HET VERHUIZEN
     - de veldnamen: q.mag/q.lon/q.place worden q.value/q.lng/q.label
     - de leeftijd komt van het GEKOZEN moment, niet van Date.now()
     - de leader-lines zijn SVG in plaats van gedraaide div's
     - klikken opent Terra's detailscherm
   ============================================================ */

export function createQuakeLabels(THREE, opts = {}) {
  const P = opts.params;
  const depthRGB = opts.depthRGB;
  const getCoords = opts.getCoords;
  const getCamera = opts.getCamera;
  const getViewport = opts.getViewport;
  const getIndicator = opts.getIndicator || (() => null);
  const momentNow = opts.momentNow || (() => new Date());
  /* AAN/UIT EN HET BUDGET WORDEN GELEZEN, niet gezet. Beide leven in index.html
     als `let`-binding: `labelsOn` hangt aan de schakelaar in Settings én aan de
     view-states, `labelBudget` aan de schuif. Ze worden op vijf plekken
     geschreven, en elke plek die het óók aan deze laag zou moeten doorgeven is
     een plek die het kan vergeten. Zo is er één bron. */
  const getEnabled = opts.getEnabled || (() => true);
  const getBudget = opts.getBudget || (() => null);
  const onSelect = opts.onSelect || (() => {});
  if (!P || !depthRGB || !getCoords || !getCamera || !getViewport) {
    throw new Error('createQuakeLabels: params, depthRGB, getCoords, getCamera en getViewport zijn verplicht');
  }

  const GLOBE_R = 100;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ---- de laag in de DOM -------------------------------------------------

  /* DE OVERLAY-LAAG KOMT VAN BUITEN. Terra heeft er al een — `#quake-labels` —
     en die is GEDEELD: de zonnegebieden (.rlabel) en de aslabels (.alabel)
     hangen er ook in, met hun leader-lines in dezelfde `#label-lines`-SVG. Een
     tweede laag ernaast zou een tweede z-index-verhaal openen over precies
     dezelfde soort inhoud.

     Zonder host maakt deze module er zelf een; dat is de weg voor een losse
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
  css.textContent = `
/* De laag zelf en de SVG krijgen hier GEEN regels: die staan in css/app.css en
   worden gedeeld met de zonnegebieden en de aslabels. Alles hieronder hangt aan
   .ql-* en raakt dus alleen deze laag. */
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
#quake-labels .ql-box.actief .loc, #quake-labels .ql-box.actief .tim { color: var(--ink, #e8eef7); }
#quake-labels .ql-box.omlijnd { -webkit-text-stroke: var(--ql-stroke) #000; paint-order: stroke fill; }
#quake-labels .ql-box.wit, #quake-labels .ql-box.wit .rij { color: #fff !important; }
`;
  document.head.appendChild(css);

  /* AANWIJZEN EN KLIKKEN op de laag zelf en niet per regel. Eén luisteraar voor
     alle labels samen: de regels worden per frame opnieuw geschreven, en een
     luisteraar per regel zou dan per frame opnieuw gehangen moeten worden. */
  let hoveredId = null, selectedId = null;
  const idVan = (e) => {
    const rij = e.target.closest && e.target.closest('[data-id]');
    return rij ? rij.getAttribute('data-id') : null;
  };
  host.addEventListener('pointermove', (e) => { hoveredId = idVan(e); });
  host.addEventListener('pointerleave', () => { hoveredId = null; });
  host.addEventListener('click', (e) => {
    const id = idVan(e);
    if (!id) return;
    e.stopPropagation();
    const q = events.find(x => x.id === id);
    // KLIKKEN OPENT HET DETAILSCHERM. In de workbench zette dit `selectedId`;
    // hier is dat Terra's eigen paneel, hetzelfde dat een klik op de indicator
    // opent. Hover geeft de samenvatting, klik de rest.
    if (q) { selectedId = id; onSelect(q); }
  });

  // ---- de knooppunten ----------------------------------------------------

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
    /* De inhoud wordt per keer opgebouwd en niet uit vaste velden gevuld: een
       knooppunt draagt óf één regel per beving (een cluster), óf de vier regels
       van een uitgeklapt event. Dat wisselt, dus vaste velden zitten in de weg. */
    return { wrap, box, line, dot, sleutel: null, maat: null, openEl: null };
  }

  const verberg = (n) => {
    n.wrap.style.display = 'none';
    n.line.style.display = 'none';
    n.dot.style.display = 'none';
  };

  // ---- de inhoud ---------------------------------------------------------

  // "3H AGO" / "2D AGO", vanaf het GEKOZEN moment. Met de wandklok zou er na een
  // tijdreis "720H AGO" staan bij een beving die op dat moment een uur oud was.
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
    // Terra's plaatsnaam draagt vaak een land erachter; de eerste helft is de
    // ligging en dat is wat je op een label wilt lezen.
    return (q.label || '').split(',')[0].replace(/^\d+\s*km\s+[\w-]+\s+of\s+/i, '');
  };

  /* De inhoud van één label. Twee gedaanten:

     OVERZICHT   één regel per beving, alleen de magnitude. Meer hoeft niet om
                 te zien waar iets gebeurde en hoe zwaar, en het blok wordt er
                 drie keer kleiner van — dat scheelt de ontwijking werk.
     UITGEKLAPT  vier regels, met diepte, ligging en tijd. Alleen van het event
                 dat je AANWIJST.

     ÉÉN OPBOUW VOOR BEIDE. Elke beving is dezelfde regel; aanwijzen hangt er
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

    // Meest recente bovenaan: bij een zwerm die zich over dagen ontrolt is dat
    // wat je wilt weten, en niet welke er toevallig het zwaarst was.
    const gesorteerd = [...leden].sort((a, b) => (b.time || 0) - (a.time || 0));
    const nu = momentNow().getTime();
    n.box.innerHTML = gesorteerd.map(q => {
      const vers = nu - (q.time || 0) < 3600e3;
      const uit = !!(open && open.has(q.id));
      // data-id maakt elke regel aanwijsbaar; bij een cluster is dat de enige
      // manier om één beving uit de groep te kiezen.
      let h = '<div class="rij' + (uit ? ' op' : '') + '" data-id="' + q.id +
              '" style="color:' + kleurVan(q) + '">M' + (q.value != null ? q.value.toFixed(1) : '?') +
              (vers ? '<span class="live">LIVE</span>'
                    : (gesorteerd.length > 1 ? '<span class="t">' + formatAgo(q.time) + '</span>' : '')) +
              '</div>';
      /* De uitgeklapte velden dragen HETZELFDE data-id als hun regel. Zonder dat
         valt de hover weg zodra de muis over "Depth" schuift, klapt het label
         dicht, komt de muis weer op de regel, klapt het open — en dan knippert
         het label. */
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

  // ---- meetkunde ---------------------------------------------------------

  /* De afstand van het middelpunt van een w x h-rechthoek tot zijn rand, langs
     de eenheidsvector n. Welke van de twee zijden de rand bepaalt hangt van de
     hoek af; de kleinste van de twee wint. De klem op 1e-6 vangt de assen waar
     één component nul is — daar loopt de deling naar oneindig en pakt `min` de
     andere kant, wat precies goed is. */
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

  // Hergebruikte vectoren: deze functies draaien per label per frame en mogen
  // niets aanmaken.
  const _n = new THREE.Vector3();
  const _p = new THREE.Vector3();
  const _c = new THREE.Vector3();
  const _u = new THREE.Vector3();
  const _u2 = new THREE.Vector3();

  // De eenheidsnormaal van een event, langs Terra's eigen omrekening.
  function normaalVan(q, doel) {
    const c = getCoords(q.lat, q.lng, 0);
    return doel.set(c.x, c.y, c.z).normalize();
  }

  /* De onthouden staat per beving: de richting van vorig frame (om te bevriezen
     als de as te kort wordt) en de positie van vorig frame (om naartoe te
     glijden). Op de ANKER-id en niet op het knooppunt — die wisselen van event
     zodra het budget schuift. */
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
      /* TE KORT: de as wijst naar de camera en zijn richting is ruis. Bevriezen
         op vorig frame — anders tolt het label rond zodra je er recht op
         uitkijkt. De LENGTE bevriest niet mee: die is juist wel betrouwbaar
         (bijna nul) en hoort het label naar zijn indicator toe te trekken. */
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

  // ---- de lus ------------------------------------------------------------

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

    /* DE ECHTE dt, en niet een aanname. Bij 60 fps is de stap 16,7 ms; een
       demping die op een verzonnen dt rekent glijdt bij een andere verversing
       te snel of te traag. */
    const nu = nowMs || (vorigeTijd + 16);
    const dtMs = Math.min(100, Math.max(0, nu - vorigeTijd)) || 16;
    vorigeTijd = nu;

    const camLen = cam.position.length();
    const horizon = GLOBE_R / Math.max(camLen, GLOBE_R + 0.001);
    _c.copy(cam.position).normalize();
    const qi = getIndicator();
    const lift = qi ? qi.ringMat.uniforms.uLift.value : 0;

    /* De randmarge schaalt mee met de zichtbare kap: de horizon loopt van 0,22
       op afstand 450 naar 0,952 op 105, en een vaste marge snoept daar meer dan
       de helft van de kap weg. */
    const randMarge = horizon + 0.04 * (1 - horizon);

    const ver = Math.max(P.quakeLabelZoomFar, P.quakeLabelZoomNear + 1);
    const dichtbij = Math.min(P.quakeLabelZoomNear, ver - 1);
    const t = 1 - smoothstepJS(dichtbij, ver, camLen);
    const minMag = P.quakeLabelMinMag + (P.quakeLabelZoomMinMag - P.quakeLabelMinMag) * t;
    const gevraagd = getBudget();
    const basisBudget = gevraagd == null ? P.quakeLabelBudget : Math.max(0, gevraagd);
    const budgetNu = Math.round(basisBudget + (P.quakeLabelZoomBudget - basisBudget) * t);

    /* Eerst wegstrepen wat niet in beeld staat, dan pas het budget — andersom
       werkt het budget als een verborgen magnitudedrempel. En ook of het punt
       écht in beeld valt: de horizon zegt alleen dat een event op de voorkant
       van de bol staat, en dat is diep ingezoomd iets anders. */
    const bMarge = 0.12;
    const zichtbaar = [];
    for (let i = 0; i < events.length; i++) {
      const q = events[i];
      if ((q.value || 0) < minMag) continue;
      normaalVan(q, _n);
      if (_n.dot(_c) < randMarge) continue;
      /* DE GESTAPELDE PLEK, niet de echte. Staat het stapelen aan, dan schuift
         de shader deze indicator opzij en omhoog; een label dat met de echte
         plek rekent hangt dan tientallen pixels naast zijn eigen stip. De index
         `i` loopt gelijk met de instance-attributen, want uploadEvents vult ze
         in dezelfde volgorde. */
      const eigenLift = qi ? qi.stackedNormalJS(i, _n, camLen, _p) : (_p.copy(_n), 0);
      _p.multiplyScalar(GLOBE_R + lift + eigenLift).project(cam);
      if (Math.abs(_p.x) > 1 + bMarge || Math.abs(_p.y) > 1 + bMarge) continue;
      zichtbaar.push({ q, i, x: (_p.x + 1) / 2 * W, y: (1 - (_p.y + 1) / 2) * H });
    }
    zichtbaar.sort((a, b) => (b.q.value || 0) - (a.q.value || 0));

    const aandacht = new Set();
    for (const id of [selectedId, hoveredId]) if (id) aandacht.add(id);

    /* AANWIJZEN BREEKT DE GROEP NIET OP. Tot sessie 38 werd het aangewezen event
       uit de rij gehaald en als los label teruggezet; de overgebleven leden
       herclusteren dan greedy vanaf de zwaarste, dus verspringt de hele groep en
       stond de muis na één frame op niets meer. De nieuwe regel: aanwijzen
       promoveert alleen wat nog GEEN label heeft; wie er al een heeft klapt
       BINNEN dat label uit. */
    const rest = zichtbaar.slice(0, Math.max(0, budgetNu));

    /* DE CLUSTERAFSTAND KRIMPT MET DE ZOOM, maar niet meer naar nul. Diep
       ingezoomd is er meestal ruimte genoeg en hoort elke beving zijn eigen
       label te hebben — behalve bij een zwerm, en juist daar zoom je in. De
       ondergrens houdt de lijst daar bij elkaar. `t` is dezelfde zoomfactor die
       hierboven de drempel en het budget stuurt: 0 ver weg, 1 volledig
       ingezoomd. Zie de noot bij quakeLabelClusterPxNear in js/config.js. */
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
        /* DE STIP KOMT OP HET ANKER, niet op het zwaartepunt van de groep. Dat
           leek netter, maar het zwaartepunt van twee indicatoren is een plek
           waar niets staat — de leader-line wees dan naar leegte. Het anker is
           de zwaarste van de groep en dus een echte indicator.
           DE SCHERMPOSITIE VAN ELK LID GAAT MEE, anders kan de lijn niet anders
           dan naar het anker wijzen, ook als je een ander lid aanwijst. */
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

    /* Wat nog GEEN label heeft komt er alsnog bij: boven het budget en boven de
       drempel. Wie een indicator aanwijst wil weten wat het is, ook als het een
       M2,9 is en ook als er al tien labels staan. */
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
    // Meten NA het schrijven: één reflow in plaats van één per label.
    for (const n of pool) {
      if (n.wrap.style.display === 'none' || n.maat) continue;
      const r = n.box.getBoundingClientRect();
      n.maat = { w: r.width, h: r.height };
    }

    const bezet = [];
    const pad = P.quakeLabelPad;

    _p.set(0, 0, 0).project(cam);
    const midX = (_p.x + 1) / 2 * W, midY = (1 - (_p.y + 1) / 2) * H;
    // De geprojecteerde bolstraal in pixels: element [5] van de projectiematrix
    // is 1/tan(halve fov), dezelfde weg als overal elders.
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

      // WELK EVENT WIJST DE LIJN AAN? Het aangewezen lid als er een is, anders
      // het anker. Daaraan hangen drie dingen: de stip, het lijneinde en de kleur.
      const openId = actief ? [...g.open].find(id => g.pos && g.pos.has(id)) : null;
      const doelQ = (openId && g.leden.find(q => q.id === openId)) || g.anker;
      const doelPos = (openId && g.pos.get(openId)) || [sx, sy];
      const dx0 = doelPos[0], dy0 = doelPos[1];

      let st = state.get(g.anker.id);
      if (!st) { st = {}; state.set(g.anker.id, st); }

      /* DE PLAATSING REKENT MET DE DICHTE MAAT, en dat is de kern van de
         accordeon. Zou hij met de uitgeklapte maat rekenen, dan verschuift het
         hele blok zodra er velden bijkomen en glijdt de regel onder de muis weg.
         De dichte maat komt uit de STAAT en niet uit een aftreksom: een label is
         altijd eerst dicht geweest voordat je het kunt aanwijzen. */
      if (!actief && n.maat) st.maatDicht = n.maat;
      const maat = (actief && st.maatDicht) || n.maat || { w: 60, h: 18 };

      let off = P.quakeLabelOffset + ringPx * P.quakeLabelRingClear;

      /* BUITEN DE BOLRAND. Van het middelpunt AF wijzen is niet hetzelfde als
         buiten de bol staan. Alleen wat aan de rand ligt: een beving waar je
         recht op uitkijkt zit midden op de geprojecteerde bol, en die naar
         buiten duwen levert een leader-line zo lang als de halve planeet. */
      if (P.quakeLabelOutside && camLen >= P.quakeLabelOutsideFrom) {
        const vanMidden = Math.hypot(sx - midX, sy - midY);
        if (vanMidden > bolPx * P.quakeLabelOutsideKern) {
          const nodig = bolPx - vanMidden + P.quakeLabelOutsidePad;
          if (nodig > off) off = Math.min(nodig, off + P.quakeLabelOutsideMax);
        }
      }

      const richting = labelRichting(g.anker, g.idx, sx, sy, midX, midY, W, H, camLen, lift, st);
      st.nx = richting.nx; st.ny = richting.ny;
      off += (richting.asPx || 0) * P.quakeLabelAxisOffset;

      /* PLAATSEN LANGS ÉÉN CONTINUE AS. Eerst de as zelf op oplopende afstand;
         past het daar niet, dan waaiert het label uit over een continu
         hoekbereik, dichtstbij eerst en om en om links en rechts. Dat laatste is
         de uitweg: zonder hem ruil je "soms een rare richting" in voor "soms
         geen label". */
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

      /* DE DOOS GEBRUIKT DE DICHTE MAAT, ook bij een uitgeklapt label. Het
         uitgeklapte deel mag dus over een buurlabel vallen. Dat is een bewuste
         ruil: de doos oprekken zou de groep in de wedloop om ruimte vooruit of
         achteruit duwen, en dan verspringt hij alsnog. */
      bezet.push(gekozen.doos);

      /* NAGLIJDEN. Ook met een continue as springt een label nog als de
         ontwijking van ring wisselt of een cluster van samenstelling verandert.
         Een label dat NIEUW is of van event wisselt begint OP zijn doel — niet
         op de vorige plek, want dan schiet het over het scherm. */
      let px = gekozen.x, py = gekozen.y;
      const tau = Math.max(0, P.quakeLabelEaseMs);
      if (tau > 0 && st.px !== undefined && st.frame === frame - 1) {
        const k = 1 - Math.exp(-dtMs / tau);
        px = st.px + (gekozen.x - st.px) * k;
        py = st.py + (gekozen.y - st.py) * k;
      }
      /* DE SPRONG METEN, MAAR ALLEEN OVER ÉÉN FRAME. `st` hangt aan de ANKER-id,
         en een anker dat een tijd geen label had draagt nog zijn positie van
         toen. Zonder deze check meet je dan de verplaatsing over alle frames
         daartussen: bij 0,35 graden per frame gaf dat uitschieters tot 990 px
         voor een label dat gewoon op zijn plek verscheen.

         Dezelfde voorwaarde die het naglijden hieronder al gebruikt, en om
         dezelfde reden. Ze hoorden vanaf het begin bij elkaar. */
      if (st.px !== undefined && st.frame === frame - 1) {
        const d = Math.hypot(px - st.px, py - st.py);
        if (d > sprong) sprong = d;
      }
      st.px = px; st.py = py; st.frame = frame;

      /* DE LIJN VERBINDT TWEE DINGEN EN ALLEBEI MOETEN KLOPPEN. Het BOL-uiteinde
         hoort op de indicator van het event dat je aanwijst — stond dat op het
         anker, dan liep de lijn van de regel van de ene beving naar de indicator
         van een andere. Het LABEL-uiteinde hoort op de regel die je leest, en
         allebei op dezelfde maat gemeten. */
      const schuifX = px - gekozen.x, schuifY = py - gekozen.y;
      let hechtX = gekozen.hx + schuifX, hechtY = gekozen.hy + schuifY;
      if (actief && n.openEl) {
        const bw = n.maat ? n.maat.w : maat.w;
        hechtX = (dx0 < px + bw * 0.5) ? px : px + bw;
        hechtY = py + n.openEl.offsetTop + n.openEl.offsetHeight * 0.5;
      }

      // Voor de meethaak: welk event de stip aanwijst, en welk event het anker is.
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

      /* GEEN LIJN ALS DE INDICATOR IN HET LABEL LIGT. Met offset en ringClear op
         nul valt het label over zijn eigen indicator, en dan steekt een
         leader-line dwars door de tekst — hij verbindt twee dingen die al op
         elkaar liggen. */
      const bw = n.maat ? n.maat.w : maat.w, bh = n.maat ? n.maat.h : maat.h;
      const marge = 4;
      const inHetLabel = dx0 > px - marge && dx0 < px + bw + marge &&
                         dy0 > py - marge && dy0 < py + bh + marge;
      if (inHetLabel || Math.hypot(hechtX - dx0, hechtY - dy0) < 2) {
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
      // Aangewezen ligt bovenop. De wrap is gepositioneerd (inset: 0), dus
      // z-index doet hier ook echt iets.
      n.wrap.style.zIndex = actief ? '20' : '';
      n.box.classList.toggle('actief', actief);
      n.box.classList.toggle('omlijnd', P.quakeLabelOutline > 0);
      n.box.classList.toggle('wit', !!P.quakeLabelWhite);
      if (P.quakeLabelOutline > 0) n.box.style.setProperty('--ql-stroke', P.quakeLabelOutline + 'px');
    }
    frame++;
  }

  /* De ringstraal in schermpixels, langs dezelfde weg als de shader. Loopt deze
     formule ooit uiteen met de GLSL, dan mikken de labels én het aanwijzen mis —
     daarom komt hij van de indicatorlaag en staat hij hier niet nog eens. */
  function ringRadiusInPixels(magFrac, camLen, viewH) {
    const qi = getIndicator();
    if (!qi) return 0;
    const wereld = qi.ringWorldRadius(magFrac) * qi.iconScaleJS(camLen);
    return wereld * getCamera().projectionMatrix.elements[5] * (viewH * 0.5)
         / Math.max(camLen - GLOBE_R, 1);
  }

  /* Aanwijzen MET DE HAND en niet met THREE.Raycaster: de shader bepaalt zelf
     waar elk hoekpunt terechtkomt, dus de geometrie in het geheugen staat ergens
     anders dan wat je ziet. Een raycast zou keurig werken en stelselmatig mis
     mikken. Hier wordt dezelfde weg gelopen als de shader. */
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
      /* De horizontoets gaat op de ECHTE ligging, de trefplek op de gestapelde:
         een event verdwijnt niet achter de bol doordat zijn stapel hem opzij
         duwt, maar je wijst wel aan waar hij STAAT. */
      if (_n.dot(_c) < horizon) continue;
      const eigenLift = qi ? qi.stackedNormalJS(i, _n, camLen, _p) : (_p.copy(_n), 0);
      _p.multiplyScalar(GLOBE_R + lift + eigenLift).project(cam);
      const sx = (_p.x + 1) / 2 * vp.w, sy = (1 - (_p.y + 1) / 2) * vp.h;
      const d = Math.hypot(sx - px, sy - py);
      const mf = Math.max(0, Math.min(1, ((q.value || 0) - P.quakeMagMin) / span));
      const treffer = Math.max(P.quakeLabelPickRadius, ringRadiusInPixels(mf, camLen, vp.h) * 0.95);
      if (d > treffer) continue;
      // Bij overlap wint de DICHTSTBIJZIJNDE en niet de zwaarste: wie een klein
      // ringetje aanwijst dat binnen een grote ring valt, bedoelt dat kleine.
      if (d < bestAfstand) { bestAfstand = d; best = q; }
    }
    return best;
  }

  /* MEETHAAK: welk event hoort bij welke stip. Zonder dit valt de koppeling
     alleen op TEKST te maken — en "M5.7" komt meermaals voor, wat in sessie 39
     sprongen van 800 px opleverde die niet bestonden. De laag weet het zelf, dus
     hij zegt het zelf. */
  function zichtbareLabels() {
    const uit = [];
    for (let i = 0; i < pool.length; i++) {
      const n = pool[i];
      if (n.wrap.style.display === "none") continue;
      const cx = n.dot.getAttribute("cx"), cy = n.dot.getAttribute("cy");
      if (cx == null) continue;
      uit.push({
        // Het event waar de STIP op staat — het aangewezen lid als er een is,
        // anders het anker. Precies wat de lijn aanwijst.
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
      // Alleen opruimen wat we zelf hebben gemaakt: de host is meestal gedeeld.
      for (const n of pool) { n.wrap.remove(); n.line.remove(); n.dot.remove(); }
      if (eigenHost) host.remove();
      css.remove(); pool.length = 0; state.clear();
    }
  };
}
