/* ============================================================
   TERRA — The welcome screen, and the layer it opens on
   ------------------------------------------------------------
   No three.js, no scene knowledge, no network. This module knows a
   preference register, a stretch of DOM it builds itself, and one
   callback that sets the imagery tier — the same cut as js/ui/nav.js
   and js/ui/view-switch.js.

   WHY THERE IS A FIRST SCREEN AT ALL. Every setting in Terra until now
   was free: switch a layer on, switch it off, nothing leaves your
   device that was not already coming. The satellite tier is the first
   one that KEEPS COSTING while you look — it fetches imagery for the
   place you are watching. Making that choice for someone on a phone
   tethered to a hotspot is not a default we get to pick, so it is
   asked once, before anything heavy is fetched.

   ONE QUESTION AND ONE ROW, NOT THREE QUESTIONS. Two of the three
   questions this screen was drafted with turned out to have nothing
   behind them:

     colour blindness  Depth already runs on a LIGHTNESS ramp (the L*
                       values sit in the palette itself) and magnitude
                       is carried by ring RADIUS, not by hue. There is
                       no switch to offer because the problem is
                       answered at the source.
     units             `pref.utc` exists; km/miles and °C/°F do not,
                       anywhere in the app. Offering them would be a
                       control that changes nothing.

   A question that changes nothing costs trust, because the visitor
   finds out. So the screen carries the imagery tier, and the one unit
   row that does have behaviour behind it.

   DETECT WHAT IS DETECTABLE, THEN ASK FOR CONFIRMATION. What the
   system already says — data saver, connection type, device memory,
   what the GPU can hold — is read and pre-selected, with the reason
   shown as a statement rather than a question. What cannot be measured
   is intent: someone on fast wifi may still be paying by the megabyte.
   That is the part worth one screen.

   DISMISSING COUNTS AS ANSWERING. Escape, the close button and both
   buttons all write `pref.onboardingVersion`. Someone who waves it
   away gets the factory setting and is not asked again — the same deal
   as someone who read every word. A screen that returns until you
   engage with it is a screen that has stopped being a choice.
   ============================================================ */

/* The tiers in the order they are offered: cheapest first, and the one
   that keeps costing last. `imageryMeta()` supplies the line underneath
   each name, so the megabytes here are the same megabytes the settings
   panel shows. Two sources for one number drift apart. */
/* GEEN GEDACHTESTREEPJES IN WAT DE BEZOEKER LEEST (Terry, sessie 46). Ze lezen
   als een terzijde van de schrijver, en op een scherm dat om één beslissing
   vraagt hoort elke zin recht op zijn doel af te gaan. In commentaar mogen ze
   blijven; dat is voor ons. */
const TIERS = [
  { id: '2k',    name: 'Standard',        note: 'Basic textures. Cached locally after a single download.' },
  { id: '8k',    name: 'High resolution', note: 'Crisp textures for a better visual experience. Cached locally after a single download.' },
  /* WIFI IS HET SCHARNIER, niet de hoeveelheid en niet het apparaat (Terry,
     sessie 46). Gemeten tijdens echt gebruik: een sessie satellietbeeld blijft
     ruim onder de 31 MB, testen meegerekend. Op een vaste lijn is dat niets; op
     een bundel is het geld. Vandaar dat de detectie hieronder op de VERBINDING
     kiest en niet op wat voor apparaat het is. */
  { id: 'tiles', name: 'Satellite',       note: 'Photorealistic imagery fetched as you explore. Unlocks maximum zoom (best on Wi-Fi).' }
];

/* WHAT THE SYSTEM ALREADY TOLD US, and the sentence that goes with it.

   Every branch returns a REASON as well as a tier. A pre-selection
   without a reason reads as an arbitrary default, and the visitor has
   no way to judge whether it fits them. With the reason attached it
   becomes a statement they can correct.

   The order is deliberate: an explicit "save data" beats a guess from
   connection type, which beats a guess from memory. Each rung is a
   stronger signal about intent than the one below it. */
const TIER_NAAM = (id) => (TIERS.find((t) => t.id === id) || {}).name || id;
const omdat = (grond, tier) => ({ tier, reason: 'Based on ' + grond + ', ' + TIER_NAAM(tier) + ' is pre-selected.' });

function detect(caps) {
  const conn = (typeof navigator !== 'undefined' && navigator.connection) || null;
  const mem = (typeof navigator !== 'undefined' && navigator.deviceMemory) || 0;

  // Eerst de drie signalen die zeggen "houd het klein". Volgorde is sterkte:
  // een uitgesproken wens wint van een gok over de verbinding, die wint van een
  // gok over het geheugen.
  if (conn && conn.saveData) return omdat('your data saver setting', '2k');
  const eff = conn && conn.effectiveType;
  if (eff === 'slow-2g' || eff === '2g' || eff === '3g') return omdat('your connection speed', '2k');
  if (mem && mem <= 2) return omdat("this device's memory", '2k');
  if (!caps.high) return omdat('what this device can hold', '2k');

  /* EN DAN DE VERBINDING, want dat is waar het om draait. `connection.type` is
     het enige veld dat wifi van mobiel scheidt, en het bestaat lang niet
     overal: Safari en Firefox geven de hele API niet. Waar het er is, is het
     stellig genoeg om op te varen. */
  const soort = conn && conn.type;
  if (soort === 'cellular') return omdat('your mobile connection', '8k');
  if (caps.tiles && (soort === 'wifi' || soort === 'ethernet')) return omdat('your Wi-Fi connection', 'tiles');

  /* ZONDER DAT VELD MOETEN WE GOKKEN, en de gok gaat op de vorm van het
     apparaat: een aanraakscherm dat smal is, is meestal een telefoon en dus
     vaker op een bundel. Fout gokken is hier goedkoop, want de reden staat
     eronder en de knoppen staan ernaast. */
  const smalTouch = typeof navigator !== 'undefined'
    && (navigator.maxTouchPoints || 0) > 0
    && typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 600;
  if (smalTouch) return omdat('this device', '8k');
  if (caps.tiles) return omdat('your network speed', 'tiles');
  return omdat('your network speed', '8k');
}

/* WHY A TIER MAY NOT BE ON OFFER, in the visitor's words rather than
   ours. Grey out, do not hide: a hidden option reads as "does not
   exist" and generates questions, while a greyed one with the reason
   beside it teaches how the app works. */
function unavailableReason(id, caps) {
  if (id === '8k' && !caps.high) return 'This device cannot hold a map this large.';
  if (id === 'tiles' && !caps.tiles) return 'Needs storage this browser is not offering.';
  return null;
}

/* WHAT THE DEVICE CAN ACTUALLY DO.

   `maxTextureSize` is the hard ceiling on the 8K map: a device that
   reports less than 8192 will not hold it, and asking anyway gives a
   silently downscaled or dropped texture. Reading it costs a throwaway
   context, so it happens once.

   The Cache API is what the tile store is built on. Without it the
   satellite tier still renders, but every visit pays full price — so it
   is offered only where it can keep its promise. */
function readCaps() {
  let high = true;
  try {
    const cv = document.createElement('canvas');
    const gl = cv.getContext('webgl2') || cv.getContext('webgl');
    if (gl) {
      const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      high = !(max > 0 && max < 8192);
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
  } catch { /* no context to read: assume it fits, the texture path has its own fallback */ }

  const tiles = typeof caches !== 'undefined' && typeof window !== 'undefined'
    && window.isSecureContext !== false;

  return { high, tiles };
}

export function createOnboarding(opts) {
  const { prefs, imageryMeta, currentImagery, setImagery,
          currentUtc, setUtc, version = 1, reopen = false, onClose } = opts;

  let root = null;
  let lastFocus = null;
  let chosen = null;

  const caps = readCaps();
  const suggestion = detect(caps);

  /* The suggestion has to be one of the tiers actually on offer. A
     pre-selection pointing at a greyed-out button is a screen that
     recommends something it will not let you have.

     DE REDEN MOET MEE, en dat is nieuw sinds de reden de trap bij naam noemt.
     Alleen `tier` verzetten laat een zin staan die een andere trap aanwijst dan
     er oplicht. `detect()` toetst de beschikbaarheid zelf al, dus deze tak hoort
     niet meer te vuren; hij staat er als vangnet en moet dan wél kloppen. */
  if (unavailableReason(suggestion.tier, caps)) {
    suggestion.tier = '2k';
    suggestion.reason = 'Based on what this device can hold, ' + TIER_NAAM('2k') + ' is pre-selected.';
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function markTier(id) {
    chosen = id;
    root.querySelectorAll('.ob-tier').forEach((b) => {
      const on = b.dataset.tier === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    /* HET ACCENT VOLGT DE SELECTIE, zie de noot bij de knoppen. Eén van de twee
       draagt het altijd: een scherm zonder hoofdhandeling laat de bezoeker
       zoeken welke knop de gewone weg vooruit is. */
    const zelfdeAlsAanbeveling = suggestion && id === suggestion.tier;
    const knoppen = root.querySelectorAll('.ob-acts .ob-btn');
    if (knoppen.length === 2) {
      knoppen[0].classList.toggle('ob-btn-primary', !!zelfdeAlsAanbeveling);
      knoppen[1].classList.toggle('ob-btn-primary', !zelfdeAlsAanbeveling);
    }
  }

  function build() {
    /* WHICH TIER STARTS LIT, decided before anything is drawn because two
       things downstream depend on it: the button that gets the accent and
       the line that explains why.

       ON A REOPEN THAT IS THE VISITOR'S OWN CHOICE, not ours. They have
       been here before and set this deliberately; showing the detection
       instead would read as the app having forgotten. On a first visit
       there is no choice yet, so the detection stands. Either way the
       recommended button keeps pointing at the detection — that is what
       it is for, and it stays there for someone who wants to go back. */
    const gekozenStart = reopen ? (currentImagery() || suggestion.tier) : suggestion.tier;
    const start = unavailableReason(gekozenStart, caps) ? suggestion.tier : gekozenStart;

    root = el('div', 'ob');
    root.id = 'onboarding';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'ob-title');

    const card = el('div', 'ob-card');

    const close = el('button', 'ob-close');
    close.type = 'button';
    close.innerHTML = '&#215;';
    close.title = 'Close';
    close.setAttribute('aria-label', 'Close welcome screen');
    close.addEventListener('click', () => finish(chosen));
    card.appendChild(close);

    const title = el('h2', 'ob-title', 'Explore Terra');
    title.id = 'ob-title';
    card.appendChild(title);

    card.appendChild(el('p', 'ob-lead',
      'Experience Earth through live telemetry. First, let\u2019s set your map '
      + 'resolution to manage your data usage.'));

    /* ---- The tiers ---- */
    const row = el('div', 'ob-tiers');
    for (const t of TIERS) {
      const why = unavailableReason(t.id, caps);
      const b = el('button', 'ob-tier');
      b.type = 'button';
      b.dataset.tier = t.id;
      b.appendChild(el('span', 'ob-tier-name', t.name));
      b.appendChild(el('span', 'ob-tier-meta', imageryMeta(t.id)));
      b.appendChild(el('span', 'ob-tier-note', why || t.note));
      if (why) {
        b.disabled = true;
        b.classList.add('off');
      } else {
        b.addEventListener('click', () => markTier(t.id));
      }
      row.appendChild(b);
    }
    card.appendChild(row);

    /* THE LINE HAS TO MATCH THE BUTTON THAT IS LIT. On a first visit the
       pre-selection IS the detection, so the detection's reason explains
       it. On a reopen the pre-selection is the visitor's own choice, and
       the same sentence would then claim we picked something we did not
       light up — so it says whose choice it is, and what the recommended
       button would do instead. */
    const anders = reopen && start !== suggestion.tier;
    const aanbevolen = (TIERS.find((t) => t.id === suggestion.tier) || {}).name;
    card.appendChild(el('p', 'ob-reason', anders
      ? 'This is your current setting. Use best settings would switch to '
        + aanbevolen + '.'
      : suggestion.reason));

    /* ---- Times ----
       One row and not a question, because there are only two answers and
       both are one word. The locale gives the pre-selection; someone with
       an English system language on mainland Europe is exactly who this
       gets wrong, which is why it is visible rather than silent. */
    const times = el('div', 'ob-row');
    times.appendChild(el('span', 'ob-row-label', 'Times'));
    const seg = el('div', 'ob-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Time display');
    for (const o of [{ v: false, t: 'Local' }, { v: true, t: 'UTC' }]) {
      const b = el('button', 'ob-seg-opt', o.t);
      b.type = 'button';
      b.dataset.utc = o.v ? '1' : '0';
      b.addEventListener('click', () => markUtc(o.v));
      seg.appendChild(b);
    }
    times.appendChild(seg);
    card.appendChild(times);

    /* ---- De twee knoppen ----

       DE KNOP NOEMT WAT HIJ GAAT DOEN (Terry, sessie 46). Hij heette `Use
       recommended settings`, en dat was vaag én misleidend: zolang je niets
       aanraakt doet hij hetzelfde als `Continue`, maar zodra je zelf een trap
       kiest zet hij hem TERUG naar de detectie. De opvallendste knop op het
       scherm maakte dus ongedaan wat je net koos, zonder dat te zeggen. Met de
       trapnaam erin is dat geen val meer maar een aanbod.

       EN HET ACCENT VOLGT DE SELECTIE. Zolang die met de aanbeveling samenvalt
       doen beide knoppen hetzelfde en hoort het accent op de aanbeveling. Zodra
       de bezoeker iets anders koos, hoort het op de knop die dát uitvoert. */
    const acts = el('div', 'ob-acts');

    const rec = el('button', 'ob-btn', 'Use best settings: ' + TIER_NAAM(suggestion.tier));
    rec.type = 'button';
    rec.addEventListener('click', () => finish(suggestion.tier));
    acts.appendChild(rec);

    const go = el('button', 'ob-btn', 'Continue');
    go.type = 'button';
    go.addEventListener('click', () => finish(chosen));
    acts.appendChild(go);

    card.appendChild(acts);

    card.appendChild(el('p', 'ob-foot',
      'Preferences can be adjusted anytime in Settings.'));

    root.appendChild(card);
    document.body.appendChild(root);

    markTier(start);
    markUtc(currentUtc ? !!currentUtc() : !!prefs.get('pref.utc'));
  }

  function markUtc(on) {
    root.querySelectorAll('.ob-seg-opt').forEach((b) => {
      const hit = (b.dataset.utc === '1') === on;
      b.classList.toggle('on', hit);
      b.setAttribute('aria-pressed', hit ? 'true' : 'false');
    });
    root.dataset.utc = on ? '1' : '0';
  }

  /* THE FOCUS TRAP. A dialog that lets Tab walk out of it leaves a
     keyboard visitor on controls they cannot see, behind a layer they
     cannot reach. Wrapping at both ends keeps every stop inside the
     card until it closes. */
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); finish(chosen); return; }
    if (e.key !== 'Tab') return;
    const stops = [...root.querySelectorAll('button:not([disabled])')];
    if (!stops.length) return;
    const first = stops[0], last = stops[stops.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function finish(tier) {
    if (!root) return;

    /* WRITE THE MARKER FIRST. Everything after this line can fail — a
       tier that will not load, a callback that throws — and none of it
       should bring the screen back on the next visit. The visitor
       answered; that fact is not conditional on the answer working. */
    prefs.set('pref.onboardingVersion', version);

    /* BOTH SETTINGS GO THROUGH THE APP'S OWN PATH, never straight into
       the register. Writing `pref.utc` here would store the preference
       without applying it: the clock, the date field and both existing
       switches all hang off one function that also refreshes them.
       A stored value nobody read is a control that lies.

       Only on an actual change. Calling the setter with the value it
       already has drags a full ephemeris refresh through startup for
       nothing. */
    const utc = root.dataset.utc === '1';
    if (setUtc && currentUtc && utc !== currentUtc()) {
      try { setUtc(utc); } catch { /* the time path reports its own failures */ }
    }

    const want = tier || suggestion.tier;
    if (want && want !== currentImagery()) {
      try { setImagery(want); } catch { /* the texture path reports its own failures */ }
    }

    document.removeEventListener('keydown', onKey, true);
    root.classList.add('done');
    const gone = root;
    root = null;
    setTimeout(() => gone.remove(), 400);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch {} }
    if (onClose) onClose();
  }

  function open() {
    if (root) return;
    lastFocus = document.activeElement;
    build();
    document.addEventListener('keydown', onKey, true);
    /* Focus the recommended button, not the first tier: it is both the
       way out and the answer most people want. */
    const rec = root.querySelector('.ob-btn-primary');
    if (rec) rec.focus();
  }

  /* WHO SEES THIS. Anyone without the marker — which includes an
     existing visitor who never changed a setting, because the register
     only stores deviations and they have nothing stored. For the
     imagery choice they are new too, so that is the right answer
     rather than a gap to patch. */
  function due() {
    return (prefs.get('pref.onboardingVersion') || 0) < version;
  }

  return { open, due, close: () => finish(chosen), suggestion, caps };
}
