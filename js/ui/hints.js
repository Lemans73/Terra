/* ============================================================
   TERRA — Where things are, once, on the first visit
   ------------------------------------------------------------
   No three.js, no scene knowledge, no network. This module knows a
   preference register and a list of element ids it points at — the same
   cut as js/ui/nav.js and js/ui/onboarding.js.

   WHY THIS EXISTS. Terra puts its controls in four corners and gives
   none of them a label until you hover. That is the right trade for
   someone who knows the app and wants the scene unobstructed, and the
   wrong one for someone arriving for the first time: the earth is
   obvious, the six things you can do with it are not.

   IT OPENS WHAT IT POINTS AT, AND PUTS IT BACK. Pointing at a closed
   button says where a thing is; opening it says what is inside, which
   is the part a first visit actually needs. Each step opens its own
   panel and closes the one before it, so only ever one is on screen.

   PUTTING IT BACK IS THE HALF THAT IS EASY TO SKIP. The state the app
   was in when the tour started is captured before the first step and
   restored when it ends — however it ends, including the close button
   and Escape. A tour that leaves the app rearranged has spent the
   visitor's state on its own explanation.

   TWO SENTENCES PER STEP, AND THAT IS A CEILING NOT A TARGET. What a
   control does, and the one thing about it that is not obvious from the
   icon. Anything more is documentation, and documentation on top of the
   screen you are trying to look at gets skipped wholesale — including
   the two sentences that would have landed.

   THE COUNT IS OF STEPS THAT WILL ACTUALLY RUN. Anchors are resolved
   first and missing ones dropped, and only then are the dots drawn. A
   tour that promises six and delivers five has miscounted in front of
   the visitor, which is worse than showing five.

   SEPARATE FROM THE WELCOME SCREEN, on its own marker. Dismissing that
   one says "I have made my choice"; dismissing this one says "I know my
   way around". They are not the same statement and they do not share a
   flag.
   ============================================================ */

/* THE ANCHORS ARE IDS IN index.html AND NOTHING CHECKS THAT AT RUNTIME —
   a renamed element makes its step disappear in silence, leaving a tour
   that is quietly incomplete. tools/check-hint-anchors.mjs is what
   catches that, and it reads this array. Keep it importable in Node:
   nothing at module level may touch `document`.

   `reveal` is a name the app resolves to a panel; the module never
   learns what a panel is. A step without one points at a control that
   has nothing to open — the view switch is two buttons and no drawer.

   The order walks the screen the way a visitor does: the two dock
   buttons on the left, the one on the right, the bar along the bottom,
   then up to the two controls in the top chrome. */
export const HINT_STEPS = [
  {
    anchor: 'panel-open',
    reveal: 'layers',
    label: 'Layers',
    title: 'Layers & filters',
    text: 'Everything drawn on the globe is switched on and off here: earthquakes, storms, wildfires, the magnetic field. Filters for magnitude and time sit in the same panel.'
  },
  {
    anchor: 'details-open',
    reveal: 'details',
    label: 'Details',
    title: 'Details',
    text: 'Click anything on the globe and its measurements open here. Every figure names the source it came from.'
  },
  {
    anchor: 'nav-open',
    reveal: 'nav',
    label: 'Navigate',
    title: 'Navigate',
    text: 'Drag to turn the Earth and scroll to zoom. This button jumps straight to a place, an event, or another view.'
  },
  {
    anchor: 'time-island',
    reveal: 'time',
    label: 'Time',
    title: 'The time bar',
    text: 'This drives the whole scene, not just a clock. Slide or play it and the sun, the day-night line and the events on screen all move with it.'
  },
  {
    anchor: 'mode-switch',
    label: 'View',
    title: 'Two views',
    text: 'Realistic shows the planet as it looks from space. Schematic strips it back to the map underneath, where the data reads more clearly.'
  },
  {
    anchor: 'settings-open',
    reveal: 'settings',
    label: 'Settings',
    title: 'Settings',
    text: 'Everything Terra remembers between visits lives here, including the imagery quality you just chose. It is also where you can start this tour again.'
  }
];

/* How much room the cut-out leaves around the element, and how far the
   card stays clear of it. Small enough that the highlight still reads as
   "this control" rather than "this corner". */
const HINT_PAD = 8;
const HINT_GAP = 14;
const HINT_EDGE = 12;

export function createHints(opts) {
  const { prefs, steps = HINT_STEPS, version = 1, onClose,
          reveal, restore } = opts;

  let root = null, hole = null, card = null;
  let live = [];
  let at = 0;
  let lastFocus = null;
  let shown = null;        // the element the current step revealed, if any
  let settle = null;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* RESOLVE FIRST, COUNT AFTER. An element can be missing because the
     markup changed, or present but not laid out — the mode switch is
     empty and zero-sized in some views. Both mean the step cannot be
     pointed at, and neither should reach the dots. */
  function resolve() {
    return steps
      .map((s) => ({ ...s, el: document.getElementById(s.anchor) }))
      .filter((s) => {
        if (!s.el) return false;
        const r = s.el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
  }

  /* THE CUT-OUT COVERS THE BUTTON AND WHAT IT OPENED, as one rectangle.
     Lighting only the button while its panel sits dimmed beside it would
     point at the handle and hide the thing — and the panel is what the
     step is about. */
  function frame() {
    const r = live[at].el.getBoundingClientRect();
    if (!shown) return r;
    const p = shown.getBoundingClientRect();
    if (!p.width || !p.height) return r;
    const left = Math.min(r.left, p.left), top = Math.min(r.top, p.top);
    return {
      left, top,
      right: Math.max(r.right, p.right),
      bottom: Math.max(r.bottom, p.bottom),
      width: Math.max(r.right, p.right) - left,
      height: Math.max(r.bottom, p.bottom) - top
    };
  }

  /* VIER KANTEN EN NIET TWEE, en de volgorde hangt af van waar het paneel staat
     (Terry, sessie 46).

     Hier stonden alleen boven en onder, en dat werkt zolang de uitsnede klein
     is. Met een paneel open is de uitsnede 296 bij 774 op een scherm van 812
     hoog: er is dan geen kant meer over, de klem hield de kaart in beeld, en
     hij landde bovenop het ding waar hij naar wijst. Een kaart die bedekt wat
     hij uitlegt, legt niets uit.

     DE VOLGORDE VOLGT DE PLEK. Terra's panelen staan tegen een rand: een paneel
     links laat rechts ruimte over, een paneel rechts laat links ruimte over, en
     iets in het midden heeft boven en onder. Vandaar drie volgordes in plaats
     van één regel.

     EN ALS NIETS PAST, wint de kant met de MINSTE overlap. Dat is nog steeds
     niet mooi, maar het is een keuze in plaats van een bijwerking van de klem —
     en `meet()` hieronder maakt hem telbaar. */
  let laatsteOverlap = 0;

  const OVERLAP = (a, b) =>
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

  function place() {
    const step = live[at];
    if (!step || !root) return;
    const r = frame();

    const gat = { left: r.left - HINT_PAD, top: r.top - HINT_PAD,
                  right: r.right + HINT_PAD, bottom: r.bottom + HINT_PAD };
    hole.style.left = gat.left + 'px';
    hole.style.top = gat.top + 'px';
    hole.style.width = (gat.right - gat.left) + 'px';
    hole.style.height = (gat.bottom - gat.top) + 'px';

    const cw = card.offsetWidth, ch = card.offsetHeight;
    const klemX = (v) => Math.max(HINT_EDGE, Math.min(v, innerWidth - cw - HINT_EDGE));
    const klemY = (v) => Math.max(HINT_EDGE, Math.min(v, innerHeight - ch - HINT_EDGE));

    const midX = (gat.left + gat.right) / 2;
    const links = midX < innerWidth / 3;
    const rechts = midX > innerWidth * 2 / 3;
    const volgorde = links  ? ['right', 'below', 'above', 'left']
                   : rechts ? ['left', 'below', 'above', 'right']
                            : ['below', 'above', 'right', 'left'];

    const kandidaat = (zijde) => {
      if (zijde === 'right')  return { left: klemX(gat.right + HINT_GAP), top: klemY(gat.top + (gat.bottom - gat.top) / 2 - ch / 2) };
      if (zijde === 'left')   return { left: klemX(gat.left - HINT_GAP - cw), top: klemY(gat.top + (gat.bottom - gat.top) / 2 - ch / 2) };
      if (zijde === 'below')  return { left: klemX(midX - cw / 2), top: klemY(gat.bottom + HINT_GAP) };
      return { left: klemX(midX - cw / 2), top: klemY(gat.top - HINT_GAP - ch) };
    };

    let beste = null;
    for (const zijde of volgorde) {
      const p = kandidaat(zijde);
      const vak = { left: p.left, top: p.top, right: p.left + cw, bottom: p.top + ch };
      const ov = OVERLAP(vak, gat);
      if (ov === 0) { beste = { ...p, zijde, overlap: 0 }; break; }
      if (!beste || ov < beste.overlap) beste = { ...p, zijde, overlap: ov };
    }

    card.style.left = beste.left + 'px';
    card.style.top = beste.top + 'px';
    card.dataset.side = beste.zijde;
    laatsteOverlap = beste.overlap;
  }


  /* A PANEL SLIDES; ITS FINAL SIZE IS NOT THERE ON THE FRAME IT OPENS.
     Measuring once gives a cut-out around whatever width it had halfway
     through. Re-measuring while the animation runs costs nothing and
     ends on the real geometry. */
  function placeWhileSettling() {
    clearInterval(settle);
    place();
    const until = Date.now() + 500;
    settle = setInterval(() => {
      if (!root || Date.now() > until) { clearInterval(settle); settle = null; return; }
      place();
    }, 60);
  }

  function draw() {
    const step = live[at];

    /* ASK FIRST, MEASURE AFTER. The app closes whatever the previous step
       opened and opens this one's, then hands back the element it put on
       screen — or nothing, for a step with no drawer. */
    shown = reveal ? (reveal(step.reveal || null) || null) : null;

    card.innerHTML = '';

    const close = el('button', 'ht-close');
    close.type = 'button';
    close.innerHTML = '&#215;';
    close.title = 'Close';
    close.setAttribute('aria-label', 'Close the tour');
    close.addEventListener('click', finish);
    card.appendChild(close);

    card.appendChild(el('h3', 'ht-title', step.title));
    card.appendChild(el('p', 'ht-text', step.text));

    const foot = el('div', 'ht-foot');

    /* THE DOTS CARRY THE COUNT, and each one is also a way there. Six
       stops is few enough that jumping is useful and not a menu. */
    const dots = el('div', 'ht-dots');
    dots.setAttribute('role', 'tablist');
    dots.setAttribute('aria-label', 'Tour steps');
    live.forEach((s, i) => {
      const d = el('button', 'ht-dot');
      d.type = 'button';
      d.title = s.title;
      d.setAttribute('aria-label', 'Step ' + (i + 1) + ' of ' + live.length + ': ' + s.title);
      if (i === at) { d.classList.add('on'); d.setAttribute('aria-current', 'step'); }
      d.addEventListener('click', () => go(i));
      dots.appendChild(d);
    });
    foot.appendChild(dots);

    /* THE STEP BUTTONS NAME WHERE THEY GO, rather than saying Back and
       Next. The label is the destination, so a visitor can decide
       whether the next stop is worth the click before making it. */
    const nav = el('div', 'ht-nav');
    if (at > 0) {
      const prev = el('button', 'ht-step');
      prev.type = 'button';
      prev.innerHTML = '<span aria-hidden="true">&#8592;</span> ' + live[at - 1].label;
      prev.addEventListener('click', () => go(at - 1));
      nav.appendChild(prev);
    }
    const next = el('button', 'ht-step ht-step-next');
    next.type = 'button';
    if (at < live.length - 1) {
      next.innerHTML = live[at + 1].label + ' <span aria-hidden="true">&#8594;</span>';
      next.addEventListener('click', () => go(at + 1));
    } else {
      next.textContent = 'Done';
      next.classList.add('ht-step-done');
      next.addEventListener('click', finish);
    }
    nav.appendChild(next);
    foot.appendChild(nav);

    card.appendChild(foot);
    placeWhileSettling();
    next.focus();
  }

  function go(i) {
    if (i < 0 || i >= live.length) return;
    at = i;
    draw();
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); finish(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); }
  }

  const onResize = () => place();

  function finish() {
    if (!root) return;
    prefs.set('pref.hintsVersion', version);
    clearInterval(settle);
    settle = null;
    document.removeEventListener('keydown', onKey, true);
    removeEventListener('resize', onResize);
    removeEventListener('scroll', onResize, true);
    root.classList.add('done');
    const gone = root;
    root = null;
    shown = null;
    setTimeout(() => gone.remove(), 300);
    /* PUT THE APP BACK BEFORE HANDING BACK FOCUS. This runs on every exit
       — the close button, Escape, and the last step — because those are
       three ways out of one tour and not three kinds of ending. */
    if (restore) { try { restore(); } catch { /* the app owns its own panels */ } }
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch {} }
    if (onClose) onClose();
  }

  function open() {
    if (root) return;
    live = resolve();
    /* Nothing to point at is not a failure worth showing. Mark it done
       and stay out of the way — a tour with zero stops would be an
       overlay the visitor has to dismiss for no reason. */
    if (!live.length) { prefs.set('pref.hintsVersion', version); return; }

    lastFocus = document.activeElement;
    at = 0;

    root = el('div', 'ht');
    root.id = 'hints';
    hole = el('div', 'ht-hole');
    card = el('div', 'ht-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Getting around Terra');
    root.appendChild(hole);
    root.appendChild(card);
    document.body.appendChild(root);

    draw();
    document.addEventListener('keydown', onKey, true);
    addEventListener('resize', onResize);
    addEventListener('scroll', onResize, true);
  }

  function due() {
    return (prefs.get('pref.hintsVersion') || 0) < version;
  }

  /* WAT DE LAATSTE PLAATSING KOSTTE, en de rechthoeken erbij. Nul overlap is de
     eis; alles daarboven is een stop waar de kaart zijn eigen onderwerp bedekt.
     Naar buiten omdat dit alleen in een ECHTE layout te meten is: een verborgen
     browserpane geeft een viewport van 0 bij 0, en dan is elke rechthoek onzin.
     Lees daarom altijd `viewport` mee voordat je `overlap` gelooft. */
  function meet() {
    const k = card && card.getBoundingClientRect();
    const g = hole && hole.getBoundingClientRect();
    return {
      viewport: [innerWidth, innerHeight],
      stap: at + 1, van: live.length,
      anker: live[at] && live[at].anchor,
      zijde: card && card.dataset.side,
      overlap: laatsteOverlap,
      kaart: k && [Math.round(k.left), Math.round(k.top), Math.round(k.width), Math.round(k.height)],
      gat: g && [Math.round(g.left), Math.round(g.top), Math.round(g.width), Math.round(g.height)]
    };
  }

  return { open, due, close: finish, meet, steps: () => live.map((s) => s.anchor) };
}
