/* ============================================================
   TERRA — Capture · turning the live view into an image file
   ------------------------------------------------------------
   THREE is not imported here. This module never touches the scene
   graph: it is handed a renderer, a composer and a camera, and it
   hands back pixels. That is also why the arithmetic at the top has
   no dependencies at all — `tools/check-capture.mjs` runs it in Node.

   WHAT THE FRAME MEANS, AND WHY IT IS MEASURED IN SCREEN PIXELS
   Terra looks through a perspective camera, so an export is not a
   crop of a flat picture but a sub-frustum of the one on screen.
   `camera.setViewOffset()` is exactly that: it tells the camera the
   full image is `viewW × viewH` and asks it to draw one window out of
   it. Feed that window the same rectangle the on-screen frame covers
   and the file holds precisely what the frame showed — at whatever
   resolution the renderer was set to.

   Working in screen pixels rather than world units has a second
   benefit: every claim about the frame is then directly measurable
   with a screenshot, which is what the guard rail does.

   ONE WIDE RENDER FOR A SET, NEVER THREE
   A three-frame set is drawn as a single wide image and cut afterwards.
   Rendering the frames separately is exact for geometry and wrong for
   bloom: a bright feature just outside frame 2 bleeds into frame 2 in
   the wide render and into nothing at all in a lone one. That shows up
   as a step at the seam — the one place this feature cannot afford one.
   ============================================================ */

/* ---- The catalogue -------------------------------------------------------
   Ratios, not platform names. Platform specs age inside your code and a ratio
   does not.

   THE FRAME COUNT IS NOT IN THIS LIST, and that is the whole point. Format and
   number of frames are two independent choices, so they are two controls; put
   them in one list and you get every combination as its own row, which is five
   formats times three counts of noise for two decisions. A set of one is
   already the plain format, so the list below covers `x1` without saying so. */
export const RATIOS = [
  { key: 'win',   label: 'Window', aspect: null },
  { key: '16x9',  label: '16:9',   aspect: 16 / 9 },
  { key: '9x16',  label: '9:16',   aspect: 9 / 16 },
  { key: '1x1',   label: '1:1',    aspect: 1 },
  { key: '4x5',   label: '4:5',    aspect: 4 / 5 },
  { key: '4x3',   label: '4:3',    aspect: 4 / 3 }
];

export const MAX_FRAMES = 3;

/* Long edge of a single frame. A set drops to SET_LONG_EDGE even when the
   picker says LARGE: three LARGE frames would ask for one render of 11520 px,
   over the buffer limit of plenty of hardware. */
export const QUALITY = { standard: 2560, large: 3840 };
export const SET_LONG_EDGE = 2048;

export function ratioByKey(key) {
  return RATIOS.find((r) => r.key === key) || RATIOS[0];
}

/* ---- The frame -----------------------------------------------------------
   The largest rectangle of the requested aspect that fits inside the
   viewport, centred. So what the frame shows is what the file holds —
   no surprises at the edges.

   `aspect` here is the aspect of the WHOLE picture: for a set of three
   1:1 frames that is 3, not 1. */
export function frameRect(aspect, viewW, viewH) {
  return defaultFrameRect(aspect, viewW, viewH);
}

function defaultFrameRect(aspect, viewW, viewH) {
  if (!aspect || !(viewW > 0) || !(viewH > 0)) {
    return { x: 0, y: 0, w: viewW, h: viewH };
  }
  const h = Math.min(viewH, viewW / aspect);
  const w = h * aspect;
  return { x: (viewW - w) / 2, y: (viewH - h) / 2, w, h };
}

/* ---- Which formats a window can actually hold ----------------------------
   A format is offered only when its frame keeps at least this much of the
   window's HEIGHT. Height and not area: on any screen it is the height a
   landscape crop eats, and a set of three eats the most of all.

   ONE MEASURABLE RULE, NOT A DEVICE TEST. A phone held upright drops 16:9,
   4:3 and every set on its own, because a 3:1 frame there is a 15% sliver you
   cannot compose in. A desktop keeps all nine. A narrow desktop window drops
   the sets too, which a user-agent check would have got wrong. Nothing here
   asks what the device is, so nothing here can be wrong about it. */
export const MIN_FRAME_HEIGHT = 0.4;

export function availableRatios(viewW, viewH, all) {
  return defaultAvailableRatios(viewW, viewH, all);
}

function defaultAvailableRatios(viewW, viewH, all) {
  const list = all || RATIOS;
  if (!(viewW > 0) || !(viewH > 0)) return list;
  return list.filter((r) => r.aspect === null || fits(r, 1, viewW, viewH));
}

/* How many frames this format can hold in this window. Always at least one —
   a single frame is the format itself and can never not fit.

   A ROW OF MORE THAN ONE ALSO NEEDS A LANDSCAPE WINDOW. Upright, a row is a
   sliver however generous the height rule is: it is the shape you would be
   composing in rather than the one you get. */
export function availableFrames(ratio, viewW, viewH) {
  return defaultAvailableFrames(ratio, viewW, viewH);
}

function defaultAvailableFrames(ratio, viewW, viewH) {
  const out = [1];
  if (!ratio || ratio.aspect === null) return out;      // Window is one picture
  if (!(viewW > viewH)) return out;
  for (let n = 2; n <= MAX_FRAMES; n++) {
    if (fits(ratio, n, viewW, viewH)) out.push(n);
  }
  return out;
}

function fits(ratio, frames, viewW, viewH) {
  return frameRect(totalAspect(ratio, frames, viewW, viewH), viewW, viewH).h
         >= viewH * MIN_FRAME_HEIGHT;
}

/* Aspect of the WHOLE picture: a row of three 1:1 frames is 3, not 1. */
export function totalAspect(ratio, frames, viewW, viewH) {
  const n = Math.max(1, frames || 1);
  if (ratio.aspect === null) return viewW / viewH;
  return ratio.aspect * n;
}

/* Pixel sizes: one frame, and the wide render the frames are cut from.
   The wide render is an exact multiple of the frame width, otherwise the
   cut would land between pixels and the seam would blur. */
export function exportSize(ratio, longEdge, frames) {
  return defaultExportSize(ratio, longEdge, frames);
}

function defaultExportSize(ratio, longEdge, frames) {
  const n = Math.max(1, frames || 1);
  const a = ratio.aspect === null ? 1 : ratio.aspect;
  const frameW = a >= 1 ? longEdge : Math.round(longEdge * a);
  const frameH = a >= 1 ? Math.round(longEdge / a) : longEdge;
  return { frameW, frameH, frames: n, width: frameW * n, height: frameH };
}

/* ---- How many pixels -----------------------------------------------------
   The size of the file, for a format, a size and a frame count in a window.

   WINDOW IS THE SCREEN, in the screen's own pixels: the size of the drawing
   buffer, CSS size times pixel ratio. On a phone that is what a wallpaper for
   that very phone needs, and the CSS size would be a ninth of it. Window also
   renders the way the screen does (see renderWide), so the file holds the
   screen's picture without the interface. `native` says so to the renderer.

   A format keeps its long edge, unless the hardware cannot hold the render;
   then the edge comes down and `capped` says so before anything is pressed. */
export function planSize(ratio, longEdge, frames, view, pixelRatio, maxSide) {
  return defaultPlanSize(ratio, longEdge, frames, view, pixelRatio, maxSide);
}

function defaultPlanSize(ratio, longEdge, frames, view, pixelRatio, maxSide) {
  if (ratio.aspect === null) {
    const pr = pixelRatio > 0 ? pixelRatio : 1;
    const w = Math.floor(view.w * pr), h = Math.floor(view.h * pr);
    return { size: { frameW: w, frameH: h, frames: 1, width: w, height: h },
             longEdge: Math.max(w, h), capped: false, native: true };
  }
  const n = Math.max(1, Math.min(MAX_FRAMES, frames || 1));
  let edge = n > 1 ? SET_LONG_EDGE : longEdge;
  let size = exportSize(ratio, edge, n);
  let capped = false;
  if (maxSide && Math.max(size.width, size.height) > maxSide) {
    const k = maxSide / Math.max(size.width, size.height);
    edge = Math.max(512, Math.floor(edge * k));
    size = exportSize(ratio, edge, n);
    capped = true;
  }
  return { size, longEdge: edge, capped, native: false };
}

/* ---- Reading the render back ---------------------------------------------
   The finished picture comes back in strips rather than in one piece: a
   3840 square read at once is a 59 MB array next to the 59 MB canvas it goes
   into, and on a phone that second copy is the one too many.

   GL COUNTS ROWS FROM THE BOTTOM, a canvas from the top. So every strip
   arrives upside down and lands at the mirrored height: the strip that starts
   at GL row y ends at canvas row H - y - rows. */
export const STRIP_ROWS = 256;

export function readbackStrips(height, rows) {
  return defaultReadbackStrips(height, rows);
}

function defaultReadbackStrips(height, rows) {
  const out = [];
  for (let y = 0; y < height; y += rows) {
    const n = Math.min(rows, height - y);
    out.push({ glY: y, rows: n, canvasY: height - y - n });
  }
  return out;
}

/* Turn one strip over: row r of `src` becomes row (rows - 1 - r) of `dst`. */
export function flipRows(src, dst, width, rows) {
  return defaultFlipRows(src, dst, width, rows);
}

function defaultFlipRows(src, dst, width, rows) {
  const stride = width * 4;
  for (let r = 0; r < rows; r++) {
    dst.set(src.subarray((rows - 1 - r) * stride, (rows - r) * stride), r * stride);
  }
  return dst;
}

/* A file name that sorts by time and says which slice it is. */
export function fileName(parts) {
  const stamp = (parts.date || new Date()).toISOString().slice(0, 16).replace(/[:T-]/g, '');
  const where = String(parts.view || 'earth').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const tail = parts.frames > 1 ? '-' + parts.index + 'of' + parts.frames : '';
  return 'terra-' + where + '-' + stamp + '-' + parts.key + tail + '.png';
}

/* ---- The caption ---------------------------------------------------------
   EVERY FRAME CARRIES THE WHOLE LINE, sets included. A frame from a set does
   not only exist beside its neighbours: it is opened on its own, saved on its
   own and reposted on its own, and at that moment it has to say what it shows
   and whose imagery it is. Spreading the three parts across three frames reads
   beautifully while you swipe and leaves two of the three files unattributed
   the moment anyone takes one out of the row.

   The sizes are deliberately restrained. A caption is a signature, not a
   headline: at 3800 px across, type that looks modest in a 1600 px preview is
   a banner. Everything scales from `base`, so one number moves them all. */
const CAPTION = {
  base: 1600,   // the width these sizes are drawn for; k scales from here
  pad: 38,
  band: 150,
  gap: 21,
  title: 13,
  credit: 11,
  brand: 14
};

export function captionSlots(parts, frames) {
  return defaultCaptionSlots(parts, frames);
}

function defaultCaptionSlots(parts, frames) {
  const whole = { brand: true, title: parts.title, credit: parts.credit };
  return Array.from({ length: Math.max(1, frames) }, () => ({ ...whole }));
}

export function drawCaption(ctx, W, H, slot) {
  const k = Math.max(W, H) / CAPTION.base;
  const pad = Math.round(CAPTION.pad * k);
  const base = H - pad;
  const band = Math.round(CAPTION.band * k);

  const grad = ctx.createLinearGradient(0, H - band, 0, H);
  grad.addColorStop(0, 'rgba(5,7,13,0)');
  grad.addColorStop(1, 'rgba(5,7,13,0.82)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, H - band, W, band);

  ctx.textAlign = 'left';
  if (slot.credit) {
    ctx.fillStyle = 'rgba(125,138,160,0.92)';
    ctx.font = Math.round(CAPTION.credit * k) + 'px Inter, Helvetica, Arial, sans-serif';
    ctx.fillText(slot.credit, pad, base);
  }
  if (slot.title) {
    ctx.fillStyle = 'rgba(232,238,247,0.95)';
    ctx.font = '600 ' + Math.round(CAPTION.title * k) + 'px Inter, Helvetica, Arial, sans-serif';
    ctx.fillText(slot.title, pad, slot.credit ? base - Math.round(CAPTION.gap * k) : base);
  }
  if (slot.brand) {
    ctx.textAlign = 'right';
    ctx.font = '700 ' + Math.round(CAPTION.brand * k) + 'px Inter, Helvetica, Arial, sans-serif';
    const dot = ctx.measureText('.').width;
    ctx.fillStyle = '#ff6b3d';
    ctx.fillText('.', W - pad, base);
    ctx.fillStyle = 'rgba(232,238,247,0.9)';
    ctx.fillText('TERRA', W - pad - dot, base);
  }
}

/* ---- The self test -------------------------------------------------------
   Runs in Node, so a broken frame is caught before a browser is opened.

   THE IMPLEMENTATIONS COME IN THROUGH AN ARGUMENT, and that is the whole
   point: a check that cannot fail proves nothing, so the guard rail hands
   this a deliberately broken `frameRect` or `exportSize` and requires the
   list to come back non-empty. Without that seam there is no way to tell a
   passing check from an absent one. */
export function selftest(impl) {
  const frameRect = (impl && impl.frameRect) || defaultFrameRect;
  const exportSize = (impl && impl.exportSize) || defaultExportSize;
  const captionSlots = (impl && impl.captionSlots) || defaultCaptionSlots;
  const availableRatios = (impl && impl.availableRatios) || defaultAvailableRatios;
  const availableFrames = (impl && impl.availableFrames) || defaultAvailableFrames;
  const bad = [];
  const near = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-9);
  const WINDOWS = [[1600, 900], [900, 1600], [1200, 1200], [2560, 1080]];

  /* The frame, for every format at every frame count on four windows. */
  for (const r of RATIOS) {
    if (r.aspect === null) continue;
    for (const [vw, vh] of WINDOWS) {
      for (let n = 1; n <= MAX_FRAMES; n++) {
        const a = totalAspect(r, n, vw, vh);
        const f = frameRect(a, vw, vh);
        const at = r.key + ' x' + n + ' at ' + vw + 'x' + vh + ': ';
        if (f.w > vw + 1e-9 || f.h > vh + 1e-9) bad.push(at + 'frame leaves the viewport');
        if (!near(f.w / f.h, a, 1e-9)) bad.push(at + 'frame is not that aspect');
        if (!near(f.x * 2 + f.w, vw, 1e-6) || !near(f.y * 2 + f.h, vh, 1e-6)) {
          bad.push(at + 'frame is not centred');
        }
        /* It has to touch at least one pair of edges, or it is not the LARGEST
           rectangle that fits and we are throwing away resolution. */
        if (!near(f.w, vw, 1e-6) && !near(f.h, vh, 1e-6)) bad.push(at + 'frame touches no edge');
      }
    }
  }

  /* The pixels. A row must be a whole number of frames, or the cut lands
     between pixels and the seam blurs. */
  for (const r of RATIOS) {
    if (r.aspect === null) continue;
    for (let n = 1; n <= MAX_FRAMES; n++) {
      const size = exportSize(r, n > 1 ? SET_LONG_EDGE : QUALITY.large, n);
      const at = r.key + ' x' + n + ': ';
      if (size.frames !== n) bad.push(at + 'asked for ' + n + ' frames, got ' + size.frames);
      if (size.width !== size.frameW * n) bad.push(at + 'row is not a whole number of frames');
      if (!near(size.frameW / size.frameH, r.aspect, 0.002)) bad.push(at + 'frame pixels are not that aspect');
      if (Math.max(size.width, size.height) > 8192) bad.push(at + 'render exceeds 8192 px');
    }
  }

  /* WHICH FORMATS, on the windows that decide the rule. A single frame always
     fits — it is the format itself — so a format that a window offers at all
     must offer at least one. */
  const keys = (list) => list.map((r) => r.key);
  const phone = availableRatios(390, 844);
  const desk = availableRatios(1440, 900);
  if (keys(phone).includes('16x9') || keys(phone).includes('4x3')) {
    bad.push('a phone is offered a landscape format');
  }
  for (const want of ['1x1', '4x5', '9x16']) {
    if (!keys(phone).includes(want)) bad.push('a phone lost ' + want + ', which it can hold');
  }
  if (desk.length !== RATIOS.length) bad.push('a desktop lost a format: ' + keys(desk).join(','));

  /* HOW MANY FRAMES. Upright windows get one and only one; a laptop gets a
     row of three out of a square. And the list is always a run starting at 1,
     because a control that offers 1 and 3 but not 2 has no honest reading. */
  const square = ratioByKey('1x1');
  const upright = availableFrames(square, 390, 844);
  const laptop = availableFrames(square, 1440, 900);
  const window = availableFrames(ratioByKey('win'), 1440, 900);
  if (upright.length !== 1) bad.push('an upright window is offered a row of frames');
  if (laptop.length !== MAX_FRAMES) bad.push('a laptop cannot make a row of three squares');
  if (window.length !== 1) bad.push('the window format is offered more than one frame');
  for (const [r, vw, vh] of [[square, 1440, 900], [square, 390, 844],
                             [ratioByKey('16x9'), 1440, 900], [ratioByKey('9x16'), 2560, 1080]]) {
    const list = availableFrames(r, vw, vh);
    if (list[0] !== 1) bad.push(r.key + ' at ' + vw + 'x' + vh + ': the list must start at one frame');
    for (let i = 1; i < list.length; i++) {
      if (list[i] !== list[i - 1] + 1) bad.push(r.key + ' at ' + vw + 'x' + vh + ': the frame counts skip a step');
    }
  }

  /* A frame taken out of a row must still say whose imagery it is, so all
     three parts belong on every frame — see the note at CAPTION. */
  const slots = captionSlots({ title: 'T', credit: 'C' }, 3);
  if (slots.length !== 3) bad.push('a row of three needs three caption slots');
  if (slots.some((s) => !s.brand)) bad.push('a frame without the wordmark');
  if (slots.some((s) => s.credit !== 'C')) bad.push('a frame without the credit');
  if (slots.some((s) => s.title !== 'T')) bad.push('a frame without the title');

  /* WINDOW IS THE SCREEN, in the screen's own pixels, fractional ratios
     included: the drawing buffer is the CSS size times the ratio, rounded
     down, and that is what the file must hold. */
  const planSize = (impl && impl.planSize) || defaultPlanSize;
  const win = ratioByKey('win');
  for (const [vw, vh, pr] of [[390, 844, 3], [1440, 900, 2], [411, 891, 2.625]]) {
    const s = planSize(win, QUALITY.large, 1, { w: vw, h: vh }, pr, 16384).size;
    const want = [Math.floor(vw * pr), Math.floor(vh * pr)];
    if (s.width !== want[0] || s.height !== want[1]) {
      bad.push('Window in ' + vw + 'x' + vh + ' at ' + pr + 'x saves ' + s.width + 'x' + s.height +
               ', the screen holds ' + want.join('x'));
    }
  }

  /* THE STRIPS. Every canvas row must hold exactly the GL row that belongs
     there, and be written once. 1000 rows is not a multiple of the strip
     height, so the short strip at the top is in the test too. */
  const strips = (impl && impl.readbackStrips) || defaultReadbackStrips;
  const flip = (impl && impl.flipRows) || defaultFlipRows;
  const SW = 2, SH = 1000;
  const glRows = new Uint8Array(SW * SH * 4);
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) glRows.set([y & 255, y >> 8, x, 255], (y * SW + x) * 4);
  }
  const canvasRows = new Uint8Array(SW * SH * 4);
  const written = new Uint8Array(SH);
  try {
    for (const s of strips(SH, STRIP_ROWS)) {
      const part = glRows.subarray(s.glY * SW * 4, (s.glY + s.rows) * SW * 4);
      const turned = new Uint8Array(part.length);
      flip(part, turned, SW, s.rows);
      canvasRows.set(turned, s.canvasY * SW * 4);
      for (let i = 0; i < s.rows; i++) written[s.canvasY + i]++;
    }
    for (let y = 0; y < SH; y++) {
      const holds = canvasRows[y * SW * 4] | (canvasRows[y * SW * 4 + 1] << 8);
      if (written[y] !== 1) { bad.push('canvas row ' + y + ' is written ' + written[y] + ' times'); break; }
      if (holds !== SH - 1 - y) { bad.push('canvas row ' + y + ' holds GL row ' + holds + ', not ' + (SH - 1 - y)); break; }
    }
  } catch (err) {
    bad.push('a strip lands outside the canvas: ' + (err && err.message));
  }

  return bad;
}

/* ---- The renderer side ---------------------------------------------------
   Everything below needs a browser. It is kept apart from the arithmetic
   above so the guard rail can reach that arithmetic from Node.

   ALL HOOKS ARE FUNCTIONS, never values — the same rule the rest of this
   project follows, and for the same reason: `world.camera()` hands back a
   different object once a state swaps it out, and a captured reference
   would then be drawing the previous scene. */
export function createCapture(opts) {
  const renderer = opts.renderer;
  const composer = opts.composer;
  const camera = opts.camera;
  const viewSize = opts.viewSize;
  /* An 8-bit render target of a given size, without depth. Handed in like the
     rest: this module does not import three. */
  const makeTarget = opts.renderTarget;
  const credits = opts.credits || (() => ({ title: '', credit: '' }));
  const viewName = opts.viewName || (() => 'earth');
  const onStatus = opts.onStatus || (() => {});
  const BACKDROP = '#05070d';

  /* What the hardware will actually allow. Asked once, and asked rather than
     assumed: 8192 is common, 4096 is not extinct, and a render that silently
     comes back blank is worse than one that came back smaller. */
  let maxSide = 0;
  function limit() {
    if (maxSide) return maxSide;
    try {
      const gl = renderer().getContext();
      maxSide = Math.min(
        gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096,
        gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 4096
      );
    } catch { maxSide = 4096; }
    return maxSide;
  }

  /* The plan for one save: which rectangle on screen, how many pixels, and
     whether the hardware forced the size down. The bar shows this before you
     press anything, so the number on screen is the number in the file. */
  function plan(ratioKey, longEdge, frames) {
    const ratio = ratioByKey(ratioKey);
    const view = viewSize();
    const n = ratio.aspect === null ? 1 : Math.max(1, Math.min(MAX_FRAMES, frames || 1));
    const whole = totalAspect(ratio, n, view.w, view.h);
    const rect = frameRect(ratio.aspect === null ? null : whole, view.w, view.h);
    const s = planSize(ratio, longEdge, n, view, renderer().getPixelRatio(), limit());
    return { ratio, frames: n, rect, size: s.size, longEdge: s.longEdge,
             capped: s.capped, native: s.native, view };
  }

  /* One render, at the requested pixel size, through the same composer the
     screen uses. A second render path would export a different picture than
     the one you are looking at.

     THE SCREEN CANVAS IS NEVER RESIZED. Resizing it cost more than the export
     itself: the canvas carries four samples per pixel and a depth buffer
     (antialias is on), while the scene never draws into it with those samples.
     Everything goes through the composer and only the last pass lands on the
     canvas, so at 3840×3840 that is some 530 MB for one full-screen quad: more
     than the composer and the bloom together.

     So three is told the export size and the canvas is not. For the length of
     the render, `width` and `height` on the canvas element are shadowed by
     plain properties that three writes into and the browser never sees. Three
     still has to hear the size, because points (`PointsMaterial`), fat lines
     (`renderer.getSize()`) and the wind (`getPixelRatio()`) are sized from it.
     The last pass then writes into an 8-bit target instead of the canvas, and
     that target is read back in strips.

     The shadow also closes the other trap. Three's `setPixelRatio()` calls
     `setSize()` with the size that is still set, so putting the ratio back
     before the size asks for the export size times the device ratio: a canvas
     of 7680×7680 on a laptop, 11520×11520 on a phone, for no picture at all. */
  function renderWide(p) {
    const r = renderer(), c = composer(), cam = camera();
    const view = p.view;
    const canvas = r.domElement;
    const prevRatio = r.getPixelRatio();
    const prevTarget = r.getRenderTarget();
    const hasRatio = typeof c.setPixelRatio === 'function';
    const W = p.size.width, H = p.size.height;
    /* Window renders exactly as the screen does: CSS size at the screen's own
       ratio. A format renders at its own pixel size with a ratio of one. */
    const logical = p.native ? { w: view.w, h: view.h, ratio: prevRatio }
                             : { w: W, h: H, ratio: 1 };

    const passes = c.passes.filter((pass) => pass.enabled);
    const last = passes[passes.length - 1];
    /* The last pass is redirected into the target through its output buffer.
       A pass that draws over its input instead (a render or bloom pass) would
       leave the target empty and the export black. */
    if (!last || !last.needsSwap) throw new Error('the last pass does not write into an output buffer');
    const prevScreen = c.renderToScreen;
    const prevLastScreen = last.renderToScreen;

    const target = makeTarget(W, H);
    let shadowW = canvas.width, shadowH = canvas.height;
    try {
      Object.defineProperty(canvas, 'width',
        { configurable: true, get: () => shadowW, set: (v) => { shadowW = v; } });
      Object.defineProperty(canvas, 'height',
        { configurable: true, get: () => shadowH, set: (v) => { shadowH = v; } });

      r.setDrawingBufferSize(logical.w, logical.h, logical.ratio);
      if (hasRatio) c.setPixelRatio(logical.ratio);
      c.setSize(logical.w, logical.h);

      /* The camera keeps the aspect of the SCREEN. setViewOffset then cuts the
         frame out of that full picture, which is why the file matches the frame
         instead of merely having the same shape. */
      cam.aspect = view.w / view.h;
      if (p.ratio.aspect !== null) {
        cam.setViewOffset(view.w, view.h, p.rect.x, p.rect.y, p.rect.w, p.rect.h);
      }
      cam.updateProjectionMatrix();

      last.enabled = false;
      c.renderToScreen = false;
      c.render();
      last.enabled = true;
      last.renderToScreen = false;
      last.render(r, target, c.readBuffer, 0, false);

      return readBack(r, target, W, H);
    } finally {
      last.enabled = true;
      last.renderToScreen = prevLastScreen;
      c.renderToScreen = prevScreen;
      /* Before the dispose, not after. The renderer remembers its last target,
         and the next render would build a disposed one up again: 59 MB at
         3840×3840, with the screen drawn into a texture nobody shows. */
      r.setRenderTarget(prevTarget);
      target.dispose();

      cam.clearViewOffset();
      cam.aspect = view.w / view.h;
      cam.updateProjectionMatrix();
      r.setDrawingBufferSize(view.w, view.h, prevRatio);
      delete canvas.width;
      delete canvas.height;
      /* Three and the canvas agree again, unless they already disagreed. */
      if (canvas.width !== shadowW) canvas.width = shadowW;
      if (canvas.height !== shadowH) canvas.height = shadowH;
      c.setSize(view.w, view.h);
      if (hasRatio) c.setPixelRatio(prevRatio);
      c.render();
    }
  }

  function readBack(r, target, W, H) {
    const wide = document.createElement('canvas');
    wide.width = W;
    wide.height = H;
    const g = wide.getContext('2d');
    const rows = new Uint8Array(W * Math.min(STRIP_ROWS, H) * 4);
    let strip = null;
    for (const s of readbackStrips(H, STRIP_ROWS)) {
      const part = rows.subarray(0, W * s.rows * 4);
      r.readRenderTargetPixels(target, 0, s.glY, W, s.rows, part);
      if (!strip || strip.height !== s.rows) strip = g.createImageData(W, s.rows);
      flipRows(part, strip.data, W, s.rows);
      g.putImageData(strip, 0, s.canvasY);
    }
    /* The render is opaque. Should a pass ever leave alpha below one, the
       frame still has no holes: the backdrop goes behind, not over. */
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = BACKDROP;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    return wide;
  }

  function toBlob(canvas) {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  /* iOS keeps a canvas's pixels until the garbage collector comes by, and
     counts them against the page until then. A size of zero gives them back
     at once. */
  function release(canvas) {
    canvas.width = 0;
    canvas.height = 0;
  }

  function cutFrame(wide, p, i) {
    const frame = document.createElement('canvas');
    frame.width = p.size.frameW;
    frame.height = p.size.frameH;
    frame.getContext('2d').drawImage(wide, i * p.size.frameW, 0, p.size.frameW, p.size.frameH,
                                     0, 0, p.size.frameW, p.size.frameH);
    return frame;
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function save(ratioKey, longEdge, frames) {
    const p = plan(ratioKey, longEdge, frames);
    const text = credits();
    const slots = captionSlots(text, p.frames);
    const stamp = new Date();
    const wide = renderWide(p);
    const names = [];

    try {
      for (let i = 0; i < p.frames; i++) {
        /* A SINGLE FRAME IS THE WIDE RENDER ITSELF. A second canvas of the same
           size would only be a copy, and at 3840×3840 a copy is 59 MB. */
        const frame = p.frames === 1 ? wide : cutFrame(wide, p, i);
        drawCaption(frame.getContext('2d'), frame.width, frame.height,
                    slots[i] || slots[slots.length - 1]);

        const blob = await toBlob(frame);
        if (frame !== wide) release(frame);
        if (!blob) {
          onStatus('bad', 'Saving failed — the canvas could not be read.');
          return null;
        }
        const name = fileName({
          view: viewName(), date: stamp, key: p.ratio.key,
          index: i + 1, frames: p.frames
        });
        download(blob, name);
        names.push(name);
        /* A browser asks before letting a page save more than one file. Spacing
           the clicks keeps that to a single prompt instead of three. */
        if (i < p.frames - 1) await new Promise((r) => setTimeout(r, 350));
      }
    } finally {
      release(wide);
    }

    const size = p.size.frameW + '×' + p.size.frameH;
    onStatus('ok', p.frames > 1
      ? 'Saved ' + p.frames + ' frames of ' + size + ', in order.'
      : 'Saved ' + names[0] + ' (' + size + ').');
    return names;
  }

  /* `credits` staat erbij om dezelfde reden als `renderWide`: anders is de enige
     manier om te toetsen wat er onder een beeld komt, een echte download per
     meting — en dan meet je vooral de downloadmap. Alleen lezen. */
  return { plan, save, limit, renderWide, viewSize, credits: () => credits() };
}
