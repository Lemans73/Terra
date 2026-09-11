/* ============================================================
   TERRA — Labels that let a drag through
   ------------------------------------------------------------
   The labels live in one overlay above the canvas (#quake-labels): the
   earthquake rows, the solar regions, and whatever is added there next.
   A label takes the pointer, which is what makes it clickable — and it
   was also the end of the gesture. OrbitControls listens on the canvas,
   never saw the press, and a drag that happened to start on a label did
   nothing at all.

   A PRESS ON A LABEL IS HANDED TO THE CANVAS AS WELL. Not bubbled: the
   copy is dispatched on the canvas alone, so OrbitControls and the sun
   state's own drag handler see an ordinary press, while the click
   detection on the globe container (index.html, `downInfo`) never hears
   of it and cannot turn the same gesture into a second selection of
   whatever lies underneath the label.

   THE LABEL GETS ITS CLICK ONLY WHEN THE POINTER BARELY MOVED. Once
   OrbitControls captures the pointer, the release lands on the canvas
   and the browser's own click no longer reaches the label. So the click
   comes from here, and the browser's click inside the overlay is
   stopped: one source for it, whichever element ended up holding the
   pointer.

   TOUCH-ACTION IS OFF ON THE OVERLAY. A finger that starts on a label
   would otherwise begin a browser gesture — a scroll, a pinch-zoom of
   the page — and the browser answers that with a pointercancel, which
   ends the drag that was just handed over.
   ============================================================ */

/* How far a press may travel and still count as a click, in CSS pixels. The
   globe's own click detection uses the same number, so a label and the globe
   beneath it draw the line between a click and a drag in the same place. */
export const CLICK_SLOP_PX = 6;

/* The fields OrbitControls and the drag handlers read, copied one by one: an
   event is not a plain object, and spreading one copies nothing. */
function pointerInit(ev) {
  return {
    bubbles: false, cancelable: true, composed: true, view: window,
    pointerId: ev.pointerId, pointerType: ev.pointerType, isPrimary: ev.isPrimary,
    width: ev.width, height: ev.height, pressure: ev.pressure,
    tiltX: ev.tiltX, tiltY: ev.tiltY,
    clientX: ev.clientX, clientY: ev.clientY,
    screenX: ev.screenX, screenY: ev.screenY,
    button: ev.button, buttons: ev.buttons,
    ctrlKey: ev.ctrlKey, shiftKey: ev.shiftKey, altKey: ev.altKey, metaKey: ev.metaKey
  };
}

/**
 * Let drags that start on a label reach the canvas.
 *
 * @param {HTMLElement} layer  the label overlay
 * @param {() => HTMLElement|null} getCanvas  the renderer's canvas, read on
 *        every press rather than once, so it is never a stale reference
 */
export function passDragsThrough(layer, getCanvas) {
  // One entry per pointer that went down on a label and may still become a click.
  const presses = new Map();
  let forwarded = 0, clicks = 0;

  layer.style.touchAction = 'none';

  function onDown(ev) {
    // Our own copies, and anything else that did not come from the user, pass.
    if (!ev.isTrusted || ev.target === layer) return;
    const canvas = getCanvas();
    if (!canvas) return;
    canvas.dispatchEvent(new PointerEvent('pointerdown', pointerInit(ev)));
    forwarded++;
    // A second finger turns the gesture into a pinch, and nothing in a pinch is
    // a click. The same goes for any button but the primary one.
    for (const p of presses.values()) p.moved = true;
    presses.set(ev.pointerId, {
      target: ev.target,
      x: ev.clientX, y: ev.clientY,
      moved: presses.size > 0 || ev.button !== 0
    });
  }

  // Tracked along the way, so a drag that returns to where it started is still
  // a drag.
  function onMove(ev) {
    const p = presses.get(ev.pointerId);
    if (p && !p.moved && Math.hypot(ev.clientX - p.x, ev.clientY - p.y) >= CLICK_SLOP_PX) {
      p.moved = true;
    }
  }

  function onUp(ev) {
    const p = presses.get(ev.pointerId);
    if (!p) return;
    presses.delete(ev.pointerId);
    // A label rebuilt during the press is not the label that was pressed.
    if (p.moved || !p.target.isConnected) return;
    clicks++;
    p.target.dispatchEvent(new MouseEvent('click', {
      bubbles: true, cancelable: true, composed: true, view: window,
      clientX: ev.clientX, clientY: ev.clientY, button: 0
    }));
  }

  function onCancel(ev) { presses.delete(ev.pointerId); }

  // The browser's own click inside the overlay. Ours are untrusted and pass.
  function onClick(ev) {
    if (!ev.isTrusted) return;
    ev.stopPropagation();
    ev.preventDefault();
  }

  layer.addEventListener('pointerdown', onDown, true);
  layer.addEventListener('click', onClick, true);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onCancel, true);

  return {
    /* A measurement hook: how many presses were handed to the canvas, and how
       many of them ended as a click. */
    stats: () => ({ forwarded, clicks, pending: presses.size })
  };
}
