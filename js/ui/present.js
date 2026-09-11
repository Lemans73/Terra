/* ============================================================
   TERRA — Present · the clean view, and the frame you save from
   ------------------------------------------------------------
   No scene, no three.js, no network. This module owns a strip of DOM
   and asks `js/core/capture.js` where the frame goes and what it costs
   in pixels.

   WHY THE FRAME IS DRAWN FROM THE SAME PLAN THAT RENDERS
   `capture.plan()` returns the rectangle and the pixel size together.
   Were the frame to compute its own rectangle, the picture on screen
   and the picture in the file would be two answers to one question,
   and the promise this whole feature rests on — what you frame is what
   you get — would hold only by coincidence.

   WHY THE ON-SCREEN LABELS GO AWAY WITH THE PANELS
   Country names are WebGL sprites and land in the file. Earthquake
   labels are DOM and SVG drawn over the canvas, and cannot. Showing
   them inside a frame that will not contain them is the one lie this
   mode has to avoid, so they leave with the rest of the interface.
   `Show interface` brings the panels back for a look around; it does
   not bring back anything the file cannot hold.
   ============================================================ */

const RESOLUTIONS = [
  { key: 'large', label: 'Large' },
  { key: 'standard', label: 'Standard' }
];

export function createPresentMode(opts) {
  const capture = opts.capture;
  /* A function and not a list: which formats fit depends on the window, and the
     window changes — on rotation, on a resize, on the way into fullscreen. */
  const ratios = opts.ratios;
  /* Which frame counts this format can hold in this window, and the lookup that
     turns the chosen key back into a format. Both come from the same module
     that renders, so the bar can never offer something the render cannot make. */
  const frameOptions = opts.frameOptions;
  const ratioByKey = opts.ratioByKey;
  const quality = opts.quality;
  /* Which sizes this window may save at. A phone-sized window gets Standard
     only; the choice made in a larger window is kept, not overwritten. */
  const sizeOptions = opts.sizeOptions || (() => RESOLUTIONS.map((r) => r.key));
  const button = opts.button || null;
  const blocked = opts.blocked || (() => false);
  const fitFrame = opts.fitFrame || null;
  /* The drawing surface, so its real size can be watched rather than guessed. */
  const surface = opts.surface || null;
  const onToggle = opts.onToggle || (() => {});

  let open = false;
  let ratioKey = '16x9';
  let sizeKey = 'large';
  let frames = 1;
  let msgTimer = null;

  /* ---- the strip of DOM ------------------------------------------------ */
  const crop = document.createElement('div');
  crop.className = 'pm-crop';
  crop.id = 'present-crop';
  crop.setAttribute('aria-hidden', 'true');
  const box = document.createElement('div');
  box.className = 'pm-box';
  crop.appendChild(box);

  const bar = document.createElement('div');
  bar.className = 'pm-bar';
  bar.id = 'present-bar';
  bar.innerHTML =
    '<div class="pm-msg" id="pm-msg" role="status" aria-live="polite"></div>' +
    '<div class="pm-row">' +
      '<label class="pm-field"><span>Format</span>' +
        '<select id="pm-ratio" aria-label="Image format"></select></label>' +
      '<div class="pm-field" id="pm-frames-field" hidden><span>Frames</span>' +
        '<div class="pm-seg" id="pm-frames" role="group" aria-label="Number of frames"></div></div>' +
      '<label class="pm-field"><span>Size</span>' +
        '<select id="pm-size" aria-label="Image size"></select></label>' +
      '<span class="pm-px" id="pm-px"></span>' +
      '<span class="pm-sep"></span>' +
      '<button type="button" class="pm-btn" id="pm-fit" title="Move back until the frame fills the view">Fit frame</button>' +
      '<button type="button" class="pm-btn pm-go" id="pm-save">Save image</button>' +
      '<span class="pm-sep"></span>' +
      '<label class="pm-check"><input type="checkbox" id="pm-chrome"><span>Show interface</span></label>' +
      '<button type="button" class="pm-btn pm-exit" id="pm-exit" title="Leave presentation (Esc)">Exit</button>' +
    '</div>';

  document.body.appendChild(crop);
  document.body.appendChild(bar);

  const el = (id) => bar.querySelector('#' + id);
  const ratioSel = el('pm-ratio');
  const sizeSel = el('pm-size');
  const pxLabel = el('pm-px');
  const framesField = el('pm-frames-field');
  const framesSeg = el('pm-frames');
  const msg = el('pm-msg');
  const chromeBox = el('pm-chrome');

  sizeSel.innerHTML = RESOLUTIONS
    .map((r) => '<option value="' + r.key + '">' + r.label + '</option>')
    .join('');
  sizeSel.value = sizeKey;

  /* ---- the format list -------------------------------------------------
     Rebuilt only when it actually changed: replacing the options on every
     refresh would close the dropdown under the pointer of anyone browsing it
     while the window animates into fullscreen. */
  let listSignature = '';
  function fillRatios(view) {
    const list = ratios(view.w, view.h);
    const signature = list.map((r) => r.key).join(',');
    if (signature === listSignature) return list;
    listSignature = signature;
    ratioSel.innerHTML = list
      .map((r) => '<option value="' + r.key + '">' + r.label + '</option>')
      .join('');
    /* The chosen format can stop fitting — turn a phone upright and the sets
       go. Fall back to the first real format rather than leaving a select
       showing a value it no longer holds. */
    if (!list.some((r) => r.key === ratioKey)) {
      const first = list.find((r) => r.aspect !== null) || list[0];
      ratioKey = first.key;
    }
    ratioSel.value = ratioKey;
    return list;
  }
  /* ---- how many frames -------------------------------------------------
     THE ROW DISAPPEARS WHEN THERE IS NOTHING TO CHOOSE. On a phone, and on any
     upright window, a row of more than one frame cannot fit — and three buttons
     of which two are dead teach the visitor to ignore the control rather than
     to read it. */
  let framesSignature = '';
  function fillFrames(view) {
    const list = frameOptions(ratioByKey(ratioKey), view.w, view.h);
    const signature = list.join(',');
    if (signature !== framesSignature) {
      framesSignature = signature;
      framesSeg.innerHTML = list
        .map((n) => '<button type="button" data-n="' + n + '">' + n + '</button>')
        .join('');
    }
    /* The chosen count can stop fitting — switch from 1:1 to 16:9 in a laptop
       window and three no longer go in. Step down to the widest that does. */
    if (!list.includes(frames)) frames = list[list.length - 1];
    for (const b of framesSeg.children) {
      b.classList.toggle('on', Number(b.dataset.n) === frames);
      b.setAttribute('aria-pressed', Number(b.dataset.n) === frames ? 'true' : 'false');
    }
    framesField.hidden = list.length < 2;
    return list;
  }

  framesSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-n]');
    if (!b) return;
    frames = Number(b.dataset.n);
    refresh();
  });

  fillRatios(capture.viewSize());
  fillFrames(capture.viewSize());

  /* ---- the frame ------------------------------------------------------- */
  function refresh() {
    if (!open) return;
    const view = capture.viewSize();
    fillRatios(view);
    fillFrames(view);
    const p = capture.plan(ratioKey, quality[sizeKey], frames);

    /* A CONTROL THAT DOES NOTHING SAYS SO. Size sets the long edge of one
       frame, which leaves two cases where it has no effect: Window takes the
       size of the window, and a row drops to a fixed edge so the frames stay
       inside one render. Leaving it live there is a switch that lies.

       BEFORE the early return below, not after — that return is taken for
       exactly one of the two cases it has to describe. */
    const sizes = sizeOptions(view.w, view.h);
    const shown = sizes.includes(sizeKey) ? sizeKey : sizes[0];
    if (sizeSel.value !== shown) sizeSel.value = shown;
    const sizeApplies = p.ratio.aspect !== null && p.frames === 1 && sizes.length > 1;
    sizeSel.disabled = !sizeApplies;
    sizeSel.title = sizeApplies ? ''
      : p.ratio.aspect === null ? 'Window saves your screen in its own pixels'
      : p.frames > 1 ? 'A row uses a fixed frame size so it fits one render'
      : 'A window this small saves at Standard size';

    if (p.ratio.aspect === null) {
      crop.classList.remove('on');
      pxLabel.textContent = p.size.width + ' × ' + p.size.height + ' px';
      return;
    }
    crop.classList.add('on');
    box.style.left = p.rect.x + 'px';
    box.style.top = p.rect.y + 'px';
    box.style.width = p.rect.w + 'px';
    box.style.height = p.rect.h + 'px';

    /* The cut lines sit on the frame, not on the screen: they are where the
       files will be split, so they have to move with it. */
    box.querySelectorAll('.pm-cut').forEach((n) => n.remove());
    for (let i = 1; i < p.frames; i++) {
      const cut = document.createElement('div');
      cut.className = 'pm-cut';
      cut.style.left = (i * 100 / p.frames) + '%';
      box.appendChild(cut);
    }

    const each = p.size.frameW + ' × ' + p.size.frameH;
    pxLabel.textContent = (p.frames > 1 ? p.frames + ' × ' + each + ' px, seamless' : each + ' px')
                          + (p.capped ? ' (capped)' : '');
    /* A size the picker offers but the hardware cannot render would be a
       number that lies, so say it plainly rather than only in the file. */
    pxLabel.classList.toggle('warn', !!p.capped);
  }

  function say(kind, text) {
    msg.textContent = text;
    msg.className = 'pm-msg on ' + (kind === 'bad' ? 'bad' : 'ok');
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { msg.className = 'pm-msg'; }, 5200);
  }

  /* ---- opening and closing --------------------------------------------- */
  function setOpen(on) {
    if (on === open) return;
    /* A tour or the welcome screen owns the keyboard and the screen while it
       is up; entering here would hide the very panels they are pointing at. */
    if (on && blocked()) return;

    open = on;
    document.body.classList.toggle('presenting', on);
    if (!on) {
      document.body.classList.remove('chrome-on');
      chromeBox.checked = false;
      crop.classList.remove('on');
      msg.className = 'pm-msg';
    }
    if (button) {
      button.classList.toggle('active', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    if (on && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (!on && document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }

    onToggle(on);
    /* The viewport changes size on the way in and out of fullscreen, and the
       frame is measured in viewport pixels — so it is drawn again once the
       browser has settled rather than against the size we are leaving. */
    setTimeout(refresh, 80);
    refresh();
  }

  /* ---- wiring ---------------------------------------------------------- */
  ratioSel.addEventListener('change', () => { ratioKey = ratioSel.value; refresh(); });
  sizeSel.addEventListener('change', () => { sizeKey = sizeSel.value; refresh(); });
  el('pm-exit').addEventListener('click', () => setOpen(false));
  el('pm-fit').addEventListener('click', () => {
    if (!fitFrame) return;
    const p = capture.plan(ratioKey, quality[sizeKey], frames);
    if (p.ratio.aspect === null) return;
    fitFrame(p);
    setTimeout(refresh, 60);
  });
  el('pm-save').addEventListener('click', async () => {
    const btn = el('pm-save');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await capture.save(ratioKey, quality[sizeKey], frames);
    } catch (err) {
      say('bad', 'Saving failed: ' + (err && err.message ? err.message : err));
    }
    btn.disabled = false;
    btn.textContent = 'Save image';
  });
  chromeBox.addEventListener('change', () => {
    document.body.classList.toggle('chrome-on', chromeBox.checked);
    setTimeout(refresh, 60);
  });

  /* NOT `addEventListener('resize', refresh)` DIRECTLY, and this is measured.
     Listeners run in the order they were registered, and this module is built
     well before the app's own resize handler at the bottom of index.html — the
     one that resizes the canvas. Refreshing straight from the event therefore
     always reads the size the canvas is about to stop having, and the frame
     stays behind by exactly one resize. A zero timeout puts this after every
     synchronous listener of the same event, which is the earliest moment the
     canvas is right. */
  addEventListener('resize', () => setTimeout(refresh, 0));

  /* And a second route, because a resize event is not guaranteed: going
     fullscreen changes the surface in steps that do not all raise one. A
     ResizeObserver fires when the canvas has actually changed size, which is
     the only moment the frame can be redrawn correctly. */
  if (surface && typeof ResizeObserver === 'function') {
    const watcher = new ResizeObserver(() => { if (open) refresh(); });
    try { watcher.observe(surface()); } catch { /* no surface yet; the event above still covers it */ }
  }
  addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && open) setOpen(false);
    else setTimeout(refresh, 80);
  });

  /* F TOGGLES, Esc only closes. One key for one intention — you press F to
     get the clean view and F again to get your workspace back, without having
     to remember a second key. Escape stays because it is what every full-screen
     thing on the web answers to, and because the browser raises it anyway when
     it leaves fullscreen on its own.

     Typing in a field is typing and never a shortcut, and a tour or the welcome
     screen that owns the keyboard is caught by `blocked()` above. */
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
                         t.tagName === 'SELECT' || t.isContentEditable);
    if (typing) return;
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); setOpen(!open); }
    else if (open && e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  });

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    isOpen: () => open,
    refresh,
    say
  };
}
