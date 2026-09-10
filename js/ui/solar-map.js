/* solar-map.js — where in the sun you are looking.
 *
 * WHY IT ONLY EARNED ITS PLACE ONCE PANNING WORKED.
 * Zoomed out, this drawing says nothing you cannot see: the whole source is on
 * screen and the frame is the screen. It matters the moment the view is a crop
 * that can sit anywhere — which is what dragging made possible. So it appears
 * when the crop is genuinely smaller than the source, and stays away otherwise.
 *
 * FOUR THINGS, AND EACH ONE IS A MEASUREMENT.
 *   - the solar disc at 1 R☉, the only fixed reference in the picture
 *   - the occulter, when a coronagraph is holding one up
 *   - the outer edge of what was actually fetched
 *   - the frame of what is on screen right now
 *
 * NOTHING HERE IS DERIVED TWICE. `state()` in js/states/sun.js reports the view
 * centre and half-extents in solar radii, because the state owns that geometry.
 * A drawing that recomputed it from the camera would be a second answer to the
 * same question, and the two would drift the first time the projection changed.
 */

/* Bare — no source fetched — still deserves a reference, and the limb plus a
   margin is the honest one. Anything larger would draw empty space and call it
   a field. */
const BARE_OUTER = 1.4;

/* Below this the frame and the source edge are the same picture. Drawing both
   would put two rings within a pixel of each other and claim they mean
   different things. */
const USEFUL_BELOW = 0.9;

const INK = 'rgba(185,194,207,0.85)';
const DIM = 'rgba(139,149,164,0.45)';
const DISC = 'rgba(255,179,71,0.30)';
const FRAME = '#ffb347';

export function createSolarMap(env) {
  const { state, active } = env;
  const canvas = document.getElementById('solar-map');
  const ctx = canvas ? canvas.getContext('2d') : null;

  /* What the drawing has to span: the widest thing worth showing. The fetched
     field rather than the instrument's own, because that is the picture that is
     actually on the screen. */
  function outerRadius(s) {
    const shown = (s.slotDetail || []).filter(Boolean);
    return shown.reduce((m, d) => Math.max(m, d.field || 0), BARE_OUTER);
  }

  function occulterRadius(s) {
    const shown = (s.slotDetail || []).filter(Boolean);
    if (shown.some(d => !d.coronagraph)) return 0;   // a disc source fills the centre
    const occs = shown.filter(d => d.occulter).map(d => d.occulter);
    return occs.length ? Math.min(...occs) : 0;
  }

  function draw() {
    if (!ctx || !canvas) return;
    const s = active() ? state() : null;
    if (!s || !s.viewHalf) { canvas.hidden = true; return; }

    const outer = outerRadius(s);
    const half = Math.max(s.viewHalf.w, s.viewHalf.h);
    if (!(half < outer * USEFUL_BELOW)) { canvas.hidden = true; return; }
    canvas.hidden = false;

    /* THE BUFFER IS SET HERE AND THE BOX IN CSS. A canvas is a replaced element:
       without a CSS box it falls back on its width attribute, and without the
       attribute it draws 300x150 whatever the box says. Both, every time, and
       the ratio between them is the device pixel ratio. */
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const css = canvas.clientWidth || 104;
    if (canvas.width !== Math.round(css * dpr)) {
      canvas.width = canvas.height = Math.round(css * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, css, css);

    const c = css / 2;
    const pad = 3;
    const k = (c - pad) / outer;          // pixels per solar radius
    // Screen y counts down, the sun's frame counts up.
    const px = (x) => c + x * k;
    const py = (y) => c - y * k;

    // The disc. Filled rather than outlined: it is the thing everything else is
    // measured against, not another ring competing with them.
    ctx.beginPath();
    ctx.arc(c, c, Math.max(1.5, k), 0, Math.PI * 2);
    ctx.fillStyle = DISC;
    ctx.fill();

    const occ = occulterRadius(s);
    if (occ) {
      ctx.beginPath();
      ctx.arc(c, c, occ * k, 0, Math.PI * 2);
      ctx.strokeStyle = DIM;
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // The outer edge of what was fetched.
    ctx.beginPath();
    ctx.arc(c, c, outer * k, 0, Math.PI * 2);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.stroke();

    // And the frame. Drawn last so it sits over everything it is describing.
    const w = s.viewHalf.w * k, h = s.viewHalf.h * k;
    ctx.strokeStyle = FRAME;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px(s.viewCentre.x) - w, py(s.viewCentre.y) - h, w * 2, h * 2);
  }

  return { draw };
}
