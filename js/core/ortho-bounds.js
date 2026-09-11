/* ============================================================
   TERRA — Ortho bounds · an orthographic frustum that honours a view offset
   ------------------------------------------------------------
   Two states draw through an orthographic matrix built by hand on a
   perspective camera (js/states/sun.js, js/states/magnetosphere.js).
   `camera.setViewOffset()` asks a camera to draw one window out of the
   full picture, and the export frame is exactly that request. Three's own
   cameras honour it in `updateProjectionMatrix()`; a matrix built by hand
   does not unless it is told, and then an export draws the whole screen
   stretched into the shape of the file.

   The arithmetic is OrthographicCamera's, for a frustum centred on zero
   with a zoom of one. No dependencies, so tools/check-ortho-bounds.mjs
   runs it in Node.
   ============================================================ */

export function orthoBounds(halfW, halfH, view) {
  return defaultOrthoBounds(halfW, halfH, view);
}

function defaultOrthoBounds(halfW, halfH, view) {
  if (!view || !view.enabled) {
    return { left: -halfW, right: halfW, top: halfH, bottom: -halfH };
  }
  const scaleW = (2 * halfW) / view.fullWidth;
  const scaleH = (2 * halfH) / view.fullHeight;
  const left = -halfW + scaleW * view.offsetX;
  const top = halfH - scaleH * view.offsetY;
  return { left, right: left + scaleW * view.width, top, bottom: top - scaleH * view.height };
}

/* ---- The self test -------------------------------------------------------
   The implementation comes in through an argument, so the guard rail can hand
   in a broken one and require complaints. A screen of 945×993 pixels whose
   full frustum has that same shape, as it does in both states. */
export function orthoBoundsSelftest(impl) {
  const bounds = (impl && impl.orthoBounds) || defaultOrthoBounds;
  const bad = [];
  const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  const W = 945, H = 993;
  const hh = 3, hw = hh * W / H;
  const cut = (x, y, w, h) => ({ enabled: true, fullWidth: W, fullHeight: H, offsetX: x, offsetY: y, width: w, height: h });
  const same = (a, b) => near(a.left, b.left) && near(a.right, b.right) && near(a.top, b.top) && near(a.bottom, b.bottom);

  const whole = bounds(hw, hh, null);
  if (!same(whole, { left: -hw, right: hw, top: hh, bottom: -hh })) bad.push('without a view the frustum is not symmetric');
  if (!same(bounds(hw, hh, { ...cut(10, 10, 100, 100), enabled: false }), whole)) bad.push('a cleared view still cuts');
  if (!same(bounds(hw, hh, cut(0, 0, W, H)), whole)) bad.push('a view of the whole screen is not the whole frustum');

  /* THE PROMISE: a frame keeps its own shape. World units per pixel must be
     the same across and down, or the file is stretched. */
  for (const [x, y, w, h] of [[0, 24, 945, 945], [193, 0, 559, 993], [0, 231, 945, 532], [300, 400, 10, 50]]) {
    const b = bounds(hw, hh, cut(x, y, w, h));
    const across = (b.right - b.left) / w, down = (b.top - b.bottom) / h;
    if (!near(across, down)) bad.push('a ' + w + 'x' + h + ' frame is stretched: ' + (across / down).toFixed(4));
  }

  /* A centred frame is centred; a frame at the top of the screen touches the
     top of the frustum, because a view offset counts from the top down. */
  const centred = bounds(hw, hh, cut(0, 24, 945, 945));
  if (!near(centred.left + centred.right, 0) || !near(centred.top + centred.bottom, 0)) bad.push('a centred frame is off centre');
  const high = bounds(hw, hh, cut(0, 0, 945, 100));
  if (!near(high.top, hh)) bad.push('a frame at the top of the screen does not reach the top');
  if (!(high.bottom > 0)) bad.push('a frame at the top of the screen reaches below the middle');

  /* Two halves meet without a gap and together make the whole. */
  const l = bounds(hw, hh, cut(0, 0, 472.5, H)), r = bounds(hw, hh, cut(472.5, 0, 472.5, H));
  if (!near(l.right, r.left)) bad.push('two halves leave a gap or overlap');
  if (!near(l.left, -hw) || !near(r.right, hw)) bad.push('two halves do not span the whole');

  return bad;
}
