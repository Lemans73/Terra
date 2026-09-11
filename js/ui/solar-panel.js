/* ============================================================
   TERRA — Solar imagery · the layer stack panel
   ------------------------------------------------------------
   The one piece of interface in this state without a precedent
   elsewhere in Terra, so it stays as close as it can to the accordions
   next to it: same rows, same dot-and-status shape, same tab
   machinery. Sharper later, when there is something to judge.

   FETCHING IS BEHIND A BUTTON, and that is not politeness. One image is
   one to four megabytes and several seconds of someone else's rendering;
   a stack of three is eight requests. The same explicit gate the polar
   drift layer and the per-layer fetch of session 36 use.

   NO BLEND MODE CONTROL. The mode follows from which sources are
   stacked: a coronagraph gets a luminance key so its black becomes
   transparent, a second disc source adds. A control there would let you
   make a layer agree when it does not, which is the one thing the plan
   rules out.

   CORONAGRAPHS REFUSE TO STACK WITH DISC INSTRUMENTS, and the panel
   says why rather than just going quiet. They are not co-registered:
   the sun is off centre, the roll angle differs, SOHO sits at L1, and
   the frames are hours apart. That is a coordinate transform, not a
   calibration.
   ============================================================ */

import { SOURCES, PRESETS, isCoronagraph } from '../layers/sun/source.js';
// One ladder for "how old", shared with the line above the image.
import { ageText } from './solar-orient.js';

const $ = id => document.getElementById(id);

export function createSolarPanel(env) {
  const { state, onStatus } = env;
  const slots = [
    { sourceId: 10, opacity: 1 },
    { sourceId: 0, opacity: 1 },
    { sourceId: 0, opacity: 1 }
  ];
  let activePreset = 'quiet';
  let busy = false;
  let built = false;

  /* Which sources a slot may still offer, given what the other slots hold. The
     rule is symmetric — a coronagraph excludes disc instruments exactly as much
     as the other way round — so it is expressed once, over the others. */
  function blockedFor(index) {
    const others = slots.filter((s, i) => i !== index && s.sourceId);
    if (!others.length) return null;
    const anyCorona = others.some(s => isCoronagraph(s.sourceId));
    const anyDisc = others.some(s => !isCoronagraph(s.sourceId));
    if (anyCorona && anyDisc) return null;          // already mixed: nothing to add
    return anyCorona ? 'disc' : 'coronagraph';
  }

  function buildPresets() {
    const host = $('solar-presets');
    if (!host) return;
    host.innerHTML = '';
    for (const p of PRESETS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = p.label;
      b.dataset.preset = p.key;
      b.addEventListener('click', () => applyPreset(p.key));
      host.appendChild(b);
    }
  }

  function buildSlots() {
    const host = $('solar-slots');
    if (!host) return;
    host.innerHTML = '';
    slots.forEach((slot, i) => {
      const row = document.createElement('div');
      row.className = 'solar-slot';
      row.dataset.slot = String(i);

      const sel = document.createElement('select');
      sel.appendChild(new Option(i === 0 ? 'Choose a source' : 'None', '0'));
      for (const src of SOURCES) sel.appendChild(new Option(src.name, String(src.id)));
      sel.value = String(slot.sourceId);
      sel.addEventListener('change', () => {
        slot.sourceId = +sel.value;
        activePreset = null;
        refresh();
      });

      const op = document.createElement('input');
      op.type = 'range'; op.min = '0'; op.max = '100'; op.step = '5';
      op.value = String(Math.round(slot.opacity * 100));
      op.title = 'Opacity';
      // Opacity is a shader uniform on a texture already fetched, so this costs
      // nothing and applies immediately — no fetch, no button.
      op.addEventListener('input', () => {
        slot.opacity = +op.value / 100;
        env.setOpacity(i, slot.opacity);
      });

      row.append(sel, op);
      host.appendChild(row);
    });
  }

  /* Disable what cannot be chosen, with the reason on the option itself. A
     control that is simply gone leaves the visitor looking for it; one that says
     why is an explanation. */
  function refreshOptions() {
    const host = $('solar-slots');
    if (!host) return;
    slots.forEach((slot, i) => {
      const row = host.querySelector('[data-slot="' + i + '"]');
      if (!row) return;
      const sel = row.querySelector('select');
      const block = blockedFor(i);
      for (const opt of sel.options) {
        const id = +opt.value;
        if (!id) { opt.disabled = false; opt.title = ''; continue; }
        const bad = (block === 'disc' && !isCoronagraph(id)) ||
                    (block === 'coronagraph' && isCoronagraph(id));
        opt.disabled = bad;
        opt.title = bad
          ? 'Coronagraphs and disc instruments are not co-registered, so they do not stack'
          : '';
      }
      row.classList.toggle('blocked', !!block);
    });
  }

  function refreshPresets() {
    const host = $('solar-presets');
    if (!host) return;
    for (const b of host.querySelectorAll('button')) {
      b.classList.toggle('on', b.dataset.preset === activePreset);
    }
  }

  function applyPreset(key) {
    const p = PRESETS.find(x => x.key === key);
    if (!p) return;
    activePreset = key;
    slots.forEach((s, i) => {
      s.sourceId = p.layers[i] || 0;
      s.opacity = 1;
    });
    env.setViewR(p.viewR);
    buildSlots();
    refresh();
    fetchAll();
  }

  function status(text, warn) {
    const el = $('solar-status');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('warn', !!warn);
    if (onStatus) onStatus(text, warn);
  }

  /* The provenance line, assembled from what is actually on screen rather than
     typed. Same rule as the caption in the wallpaper maker: naming a source that
     is not showing is the one thing a credit must never do. */
  function refreshProvenance() {
    const el = $('solar-provenance');
    if (!el) return;
    const shown = state().slotDetail.filter(Boolean);
    if (!shown.length) { el.innerHTML = ''; return; }
    const parts = shown.map(d =>
      d.name + ' &#183; ' + new Date(d.observed).toISOString().replace('T', ' ').slice(0, 16) +
      ' UTC &#183; ' + ageText(d.ageMinutes));
    el.innerHTML = parts.join('<br />') +
      '<br />Image data: Helioviewer.org &#183; NASA/SDO' +
      (shown.some(d => d.coronagraph) ? ' &#183; ESA/NASA SOHO' : '');
  }

  async function fetchAll() {
    if (busy) return;
    const wanted = slots.map((s, i) => ({ i, id: s.sourceId })).filter(x => x.id);
    if (!wanted.length) { status('Choose a source first.', true); return; }

    busy = true;
    const btn = $('solar-fetch');
    if (btn) { btn.disabled = true; btn.textContent = 'Fetching…'; }
    let done = 0;
    try {
      for (let k = 0; k < slots.length; k++) {
        if (!slots[k].sourceId) { env.clearSlot(k); continue; }
      }
      for (const w of wanted) {
        status('Fetching ' + (done + 1) + ' of ' + wanted.length + '…');
        await env.loadSlot(w.i, w.id, { opacity: slots[w.i].opacity });
        done++;
      }
      status('');
      refreshProvenance();
    } catch (e) {
      status('Could not fetch: ' + (e && e.message ? e.message : 'unknown error'), true);
    } finally {
      busy = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Fetch images'; }
    }
  }

  function refresh() {
    refreshOptions();
    refreshPresets();
    refreshProvenance();
  }

  function bindSpotsToggle() {
    const row = $('solar-spots-toggle');
    if (!row) return;
    let on = true;
    const stat = $('es-solar-spots');
    row.classList.add('on');
    row.addEventListener('click', () => {
      on = !on;
      env.setSpotsVisible(on);
      row.classList.toggle('on', on);
      if (stat) stat.textContent = on ? 'on' : 'off';
    });
  }

  function mount() {
    if (built) return;
    if (!$('solar-slots')) return;      // markup not in this build (standalone)
    buildPresets();
    buildSlots();
    bindSpotsToggle();
    const btn = $('solar-fetch');
    if (btn) btn.addEventListener('click', fetchAll);
    built = true;
    refresh();
    refreshPresets();
  }

  return { mount, refresh, refreshProvenance, applyPreset, fetchAll,
           slots: () => slots.map(s => ({ ...s })) };
}
