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
   Ratios, not platform names. Platform specs age inside your code and a
   ratio does not. `frames: 3` means the set is cut into three files that
   sit side by side as one continuous picture. */
export const RATIOS = [
  { key: 'win',   label: 'Window',  aspect: null, frames: 1 },
  { key: '16x9',  label: '16:9',    aspect: 16 / 9, frames: 1 },
  { key: '9x16',  label: '9:16',    aspect: 9 / 16, frames: 1 },
  { key: '1x1',   label: '1:1',     aspect: 1,      frames: 1 },
  { key: '4x5',   label: '4:5',     aspect: 4 / 5,  frames: 1 },
  { key: '4x3',   label: '4:3',     aspect: 4 / 3,  frames: 1 },
  { key: '1x1x3', label: '1:1 ×3',  aspect: 1,      frames: 3, note: 'seamless set' },
  { key: '4x5x3', label: '4:5 ×3',  aspect: 4 / 5,  frames: 3, note: 'seamless set' },
  { key: '9x16x3', label: '9:16 ×3', aspect: 9 / 16, frames: 3, note: 'seamless set' }
];

/* Long edge of a single frame. A set stays at STANDARD even when the
   picker says LARGE: three LARGE frames would ask for one render of
   11520 px, and that is over the buffer limit of plenty of hardware. */
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

/* Total aspect of a ratio entry, frames included. */
export function totalAspect(ratio, viewW, viewH) {
  if (ratio.aspect === null) return viewW / viewH;
  return ratio.aspect * ratio.frames;
}

/* Pixel sizes: one frame, and the wide render the frames are cut from.
   The wide render is an exact multiple of the frame width, otherwise the
   cut would land between pixels and the seam would blur. */
export function exportSize(ratio, longEdge) {
  return defaultExportSize(ratio, longEdge);
}

function defaultExportSize(ratio, longEdge) {
  const a = ratio.aspect === null ? 1 : ratio.aspect;
  const frameW = a >= 1 ? longEdge : Math.round(longEdge * a);
  const frameH = a >= 1 ? Math.round(longEdge / a) : longEdge;
  return {
    frameW, frameH, frames: ratio.frames,
    width: frameW * ratio.frames, height: frameH
  };
}

/* A file name that sorts by time and says which slice it is. */
export function fileName(parts) {
  const stamp = (parts.date || new Date()).toISOString().slice(0, 16).replace(/[:T-]/g, '');
  const where = String(parts.view || 'earth').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const tail = parts.frames > 1 ? '-' + parts.index + 'of' + parts.frames : '';
  return 'terra-' + where + '-' + stamp + '-' + parts.key + tail + '.png';
}

/* ---- The caption ---------------------------------------------------------
   Three parts, and for a set they land on three different frames: the
   wordmark on the first, what and when on the second, the credit on the
   third. Same height, same gradient, so swiping through the carousel
   reads as one bar under one picture. Repeating the full credit on every
   frame would break the very illusion the set is built for. */
export function captionSlots(parts, frames) {
  if (frames < 3) return [{ brand: true, title: parts.title, credit: parts.credit }];
  return [
    { brand: true, title: '', credit: '' },
    { brand: false, title: parts.title, credit: '' },
    { brand: false, title: '', credit: parts.credit }
  ];
}

export function drawCaption(ctx, W, H, slot) {
  const k = Math.max(W, H) / 1600;
  const pad = Math.round(44 * k);
  const base = H - pad;
  const band = Math.round(180 * k);

  const grad = ctx.createLinearGradient(0, H - band, 0, H);
  grad.addColorStop(0, 'rgba(5,7,13,0)');
  grad.addColorStop(1, 'rgba(5,7,13,0.86)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, H - band, W, band);

  ctx.textAlign = 'left';
  if (slot.credit) {
    ctx.fillStyle = 'rgba(125,138,160,1)';
    ctx.font = Math.round(15 * k) + 'px Inter, Helvetica, Arial, sans-serif';
    ctx.fillText(slot.credit, pad, base);
  }
  if (slot.title) {
    ctx.fillStyle = 'rgba(232,238,247,1)';
    ctx.font = '600 ' + Math.round(18 * k) + 'px Inter, Helvetica, Arial, sans-serif';
    ctx.fillText(slot.title, pad, slot.credit ? base - Math.round(26 * k) : base);
  }
  if (slot.brand) {
    ctx.textAlign = 'right';
    ctx.font = '700 ' + Math.round(19 * k) + 'px Inter, Helvetica, Arial, sans-serif';
    const dot = ctx.measureText('.').width;
    ctx.fillStyle = '#ff6b3d';
    ctx.fillText('.', W - pad, base);
    ctx.fillStyle = 'rgba(232,238,247,0.95)';
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
  const bad = [];
  const near = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-9);

  for (const r of RATIOS) {
    if (r.aspect === null) continue;
    for (const [vw, vh] of [[1600, 900], [900, 1600], [1200, 1200], [2560, 1080]]) {
      const a = totalAspect(r, vw, vh);
      const f = frameRect(a, vw, vh);
      if (f.w > vw + 1e-9 || f.h > vh + 1e-9) {
        bad.push(r.key + ' at ' + vw + 'x' + vh + ': frame leaves the viewport');
      }
      if (!near(f.w / f.h, a, 1e-9)) {
        bad.push(r.key + ' at ' + vw + 'x' + vh + ': frame is not that aspect');
      }
      if (!near(f.x * 2 + f.w, vw, 1e-6) || !near(f.y * 2 + f.h, vh, 1e-6)) {
        bad.push(r.key + ' at ' + vw + 'x' + vh + ': frame is not centred');
      }
      /* The frame has to touch at least one pair of edges, or it is not the
         LARGEST rectangle that fits and we are throwing away resolution. */
      if (!near(f.w, vw, 1e-6) && !near(f.h, vh, 1e-6)) {
        bad.push(r.key + ' at ' + vw + 'x' + vh + ': frame touches no edge');
      }
    }
  }

  for (const r of RATIOS) {
    if (r.aspect === null) continue;
    const s = exportSize(r, r.frames > 1 ? SET_LONG_EDGE : QUALITY.large);
    if (s.width !== s.frameW * s.frames) bad.push(r.key + ': wide render is not a whole number of frames');
    if (!near(s.frameW / s.frameH, r.aspect, 0.002)) bad.push(r.key + ': frame pixels are not that aspect');
    if (Math.max(s.width, s.height) > 8192) bad.push(r.key + ': render exceeds 8192 px');
  }

  const slots = captionSlots({ title: 'T', credit: 'C' }, 3);
  if (slots.length !== 3) bad.push('a set needs three caption slots');
  if (slots.filter((s) => s.brand).length !== 1) bad.push('the wordmark belongs on exactly one frame');
  if (slots.filter((s) => s.credit).length !== 1) bad.push('the credit belongs on exactly one frame');

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
  function plan(ratioKey, longEdge) {
    const ratio = ratioByKey(ratioKey);
    const view = viewSize();
    const whole = totalAspect(ratio, view.w, view.h);
    const rect = frameRect(ratio.aspect === null ? null : whole, view.w, view.h);

    let edge = ratio.frames > 1 ? SET_LONG_EDGE : longEdge;
    let size = ratio.aspect === null
      ? { frameW: Math.round(view.w), frameH: Math.round(view.h), frames: 1,
          width: Math.round(view.w), height: Math.round(view.h) }
      : exportSize(ratio, edge);

    let capped = false;
    const cap = limit();
    if (Math.max(size.width, size.height) > cap) {
      const k = cap / Math.max(size.width, size.height);
      edge = Math.max(512, Math.floor(edge * k));
      size = exportSize(ratio, edge);
      capped = true;
    }
    return { ratio, rect, size, longEdge: edge, capped, view };
  }

  /* One render, at the requested pixel size, through the same composer the
     screen uses. A second render path would export a different picture than
     the one you are looking at.

     Everything is put back inside this call, before the browser paints: the
     canvas keeps its CSS size throughout (`setSize(w, h, false)`), so nothing
     reflows and nothing flashes. */
  function renderWide(p) {
    const r = renderer(), c = composer(), cam = camera();
    const view = p.view;
    const prevRatio = r.getPixelRatio();
    const hasRatio = typeof c.setPixelRatio === 'function';

    r.setPixelRatio(1);
    r.setSize(p.size.width, p.size.height, false);
    if (hasRatio) c.setPixelRatio(1);
    c.setSize(p.size.width, p.size.height);

    /* The camera keeps the aspect of the SCREEN. setViewOffset then cuts the
       frame out of that full picture, which is why the file matches the frame
       instead of merely having the same shape. */
    cam.aspect = view.w / view.h;
    if (p.ratio.aspect !== null) {
      cam.setViewOffset(view.w, view.h, p.rect.x, p.rect.y, p.rect.w, p.rect.h);
    }
    cam.updateProjectionMatrix();
    c.render();

    const wide = document.createElement('canvas');
    wide.width = p.size.width;
    wide.height = p.size.height;
    const g = wide.getContext('2d');
    g.fillStyle = BACKDROP;
    g.fillRect(0, 0, wide.width, wide.height);
    g.drawImage(r.domElement, 0, 0, wide.width, wide.height);

    cam.clearViewOffset();
    cam.aspect = view.w / view.h;
    cam.updateProjectionMatrix();
    r.setPixelRatio(prevRatio);
    r.setSize(view.w, view.h, false);
    if (hasRatio) c.setPixelRatio(prevRatio);
    c.setSize(view.w, view.h);
    c.render();

    return wide;
  }

  function toBlob(canvas) {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function save(ratioKey, longEdge) {
    const p = plan(ratioKey, longEdge);
    const text = credits();
    const slots = captionSlots(text, p.ratio.frames);
    const stamp = new Date();
    const wide = renderWide(p);
    const names = [];

    for (let i = 0; i < p.ratio.frames; i++) {
      const frame = document.createElement('canvas');
      frame.width = p.size.frameW;
      frame.height = p.size.frameH;
      const g = frame.getContext('2d');
      g.drawImage(wide, i * p.size.frameW, 0, p.size.frameW, p.size.frameH,
                  0, 0, p.size.frameW, p.size.frameH);
      drawCaption(g, frame.width, frame.height, slots[i] || slots[slots.length - 1]);

      const blob = await toBlob(frame);
      if (!blob) {
        onStatus('bad', 'Saving failed — the canvas could not be read.');
        return null;
      }
      const name = fileName({
        view: viewName(), date: stamp, key: p.ratio.key,
        index: i + 1, frames: p.ratio.frames
      });
      download(blob, name);
      names.push(name);
      /* A browser asks before letting a page save more than one file. Spacing
         the clicks keeps that to a single prompt instead of three. */
      if (i < p.ratio.frames - 1) await new Promise((r) => setTimeout(r, 350));
    }

    const size = p.size.frameW + '×' + p.size.frameH;
    onStatus('ok', p.ratio.frames > 1
      ? 'Saved ' + p.ratio.frames + ' frames of ' + size + ', in order.'
      : 'Saved ' + names[0] + ' (' + size + ').');
    return names;
  }

  return { plan, save, limit, renderWide };
}
