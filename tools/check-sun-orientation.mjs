/* check-sun-orientation.mjs — does the on-screen readout say the right thing?
 *
 *   node tools/check-sun-orientation.mjs
 *   node tools/check-sun-orientation.mjs --selftest
 *
 * WHY THIS EXISTS.
 * This block is the only place in Terra that tells a viewer, without being
 * asked, that what they are looking at is a photograph and not a measurement.
 * Every way of getting it wrong produces a screen that looks fine:
 *
 *   - The wrong kicker turns a drawing into "image data", or an instrument
 *     frame into a drawing. Both are false, in opposite directions.
 *   - The occulter number. C2 blanks 2.40 R☉ and C3 blanks 4.67; stacked, the
 *     inner one fills the outer one's hole and what stays blank is 2.40. Take
 *     the largest instead of the smallest and the line states a wrong number
 *     with complete confidence — and it will be wrong by two solar radii.
 *   - The occulter line at all, next to a disc source. AIA images the disc, so
 *     there is no blank centre; announcing one sends the viewer looking for a
 *     hole that is not there.
 *   - The sharpness verdict. Two slots, one green and one red, is a red
 *     picture: the weakest layer is the one that misleads.
 *
 *   1  no frames                → drawn sun, region count
 *   2  a disc frame             → image data, provenance, sharpness, texels
 *   3  coronagraphs only        → the SMALLEST occulter
 *   4  coronagraph + disc       → no occulter line at all
 *   5  mixed verdicts           → the worst one wins
 *   6  a film frame             → which frame and its pixels, and no verdict
 *   7  a failed fetch           → one amber line with the reason
 *
 * AND THE STYLESHEET HAS TO LET IT BE READ, in the sun state and nowhere else.
 * These go wrong just as quietly:
 *
 *   8  hidden hides it          → a class that sets display beats the hidden
 *                                 attribute, and the sun's line stays up over
 *                                 the earth, space and the magnetosphere
 *   9  it spans the screen      → left: 50% with translateX(-50%) gives a fixed
 *                                 block half the screen at most, whatever its
 *                                 max-width: 188 px on a phone 375 px wide
 *  10  one line per row         → a row that may wrap jumps between one line
 *                                 and two while a film counts its frames
 *
 * THE STATES BELOW ARE HAND-BUILT AND THAT IS THE POINT. They carry the numbers
 * measured in session 49 — C2 at 2.40, C3 at 4.67 — so the check fails if the
 * rule stops matching the instruments rather than if the code stops matching
 * itself.
 *
 * Run:  node tools/check-sun-orientation.mjs            (exit 0 = green)
 *       node tools/check-sun-orientation.mjs --selftest (every break must show)
 */

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = 'js/ui/solar-orient.js';
const STYLES = 'css/app.css';

const selftest = process.argv.includes('--selftest');

function report(ok, text, extra) {
  console.log((ok ? '  ok   ' : '  FAIL ') + ' ' + text + (extra ? ' — ' + extra : ''));
  return ok ? 0 : 1;
}

const slot = (over) => ({
  name: 'AIA 193',
  observed: '2026-09-10T14:47:29.000Z',
  ageMinutes: 45,
  coronagraph: false,
  occulter: null,
  earthTexels: 15.2,
  sharpness: { verdict: 'green', ratio: 0.6, wanted: 500, supplied: 800, ceiling: 1589 },
  ...over
});

const C2 = slot({ name: 'LASCO C2', coronagraph: true, occulter: 2.40, earthTexels: 0.4 });
const C3 = slot({ name: 'LASCO C3', coronagraph: true, occulter: 4.67, earthTexels: 0.1,
                  sharpness: { verdict: 'red', ratio: 3.2, wanted: 800, supplied: 250, ceiling: 35 } });

const text = (rows) => rows.map(r => r.text).join(' | ');

function run(orientLines) {
  let bad = 0;

  // 1 — nothing fetched. The drawn sun is a model and the caps on it are not.
  {
    const rows = orientLines({ spots: { drawn: 9 }, slotDetail: [null, null, null] });
    const t = text(rows);
    bad += report(/DRAWN SUN/.test(t) && /9 active regions/.test(t) && !/IMAGE DATA/.test(t),
                  'no frames → drawn sun and the region count', t);
  }

  // 2 — one disc frame. Everything a viewer needs without opening a panel.
  {
    const t = text(orientLines({ spots: { drawn: 9 }, slotDetail: [slot({}), null, null] }));
    bad += report(/IMAGE DATA/.test(t) && /AIA 193 · 14:47 UTC · 45 min old/.test(t)
                  && /sharp at this zoom/.test(t) && /Earth ≈ 15 texels/.test(t)
                  && !/occulter/.test(t),
                  'a disc frame → image data, provenance, sharpness, texels', t);
  }

  // 3 — the stacked coronagraphs. 2.40 and not 4.67.
  {
    const t = text(orientLines({ spots: { drawn: 9 }, slotDetail: [C3, C2, null] }));
    bad += report(/Blank within 2\.4 R☉/.test(t) && !/4\.7/.test(t),
                  'coronagraphs only → the smallest occulter (2.4)', t);
  }

  // 4 — a disc in the stack fills the hole, so there is nothing to explain.
  {
    const t = text(orientLines({ spots: { drawn: 9 }, slotDetail: [C3, C2, slot({})] }));
    bad += report(!/occulter/.test(t) && /Earth ≈ 15 texels/.test(t),
                  'coronagraph + disc → no occulter line', t);
  }

  // 5 — one red layer makes a red picture.
  {
    const t = text(orientLines({ spots: { drawn: 9 }, slotDetail: [slot({}), C3, null] }));
    bad += report(/zoomed past what the source holds/.test(t) && !/sharp at this zoom/.test(t),
                  'mixed verdicts → the worst one wins', t);
  }

  // 6 — a film frame says which frame it is, and is not judged on sharpness: a
  //     verdict would tell the viewer to fetch again in the middle of a film.
  {
    const frame = slot({ film: { index: 11, count: 24 }, texPx: 640,
                         sharpness: { verdict: 'red', ratio: 4.1, wanted: 2600, supplied: 430, ceiling: 1589 } });
    const t = text(orientLines({ spots: { drawn: 9 }, slotDetail: [frame, null, null] }));
    bad += report(/AIA 193 · frame 12\/24 · 14:47 UTC · 640 px/.test(t) && /a film frame of 640 px/.test(t)
                  && !/zoomed past|fetch again|sharp at this zoom|min old/.test(t),
                  'a film frame → which frame and its pixels, and no verdict', t);
  }

  // 7 — a fetch that did not come through says why, under the drawn sun and under
  //     image data alike, and nothing is said when nothing went wrong.
  {
    const trouble = 'Helioviewer is busy · try again in a minute';
    const drawn = orientLines({ spots: { drawn: 9 }, slotDetail: [null, null, null], notice: trouble });
    const shown = orientLines({ spots: { drawn: 9 }, slotDetail: [slot({}), null, null], notice: trouble });
    const quiet = text(orientLines({ spots: { drawn: 9 }, slotDetail: [slot({}), null, null] }));
    const warns = rows => rows.filter(r => r.cls === 'so-warn' && r.text === trouble).length;
    bad += report(warns(drawn) === 1 && warns(shown) === 1 && !/Helioviewer/.test(quiet),
                  'a failed fetch → one amber line with the reason, and none without', text(shown));
  }

  return bad;
}

/* ---- The stylesheet ------------------------------------------------------ */

/* Every plain rule in a stylesheet: its selectors, whether an at-rule holds it,
   and its declarations. Comments go first, so a selector named in a note is not
   taken for a rule. */
function cssRules(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const open = [];
  let from = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '{') {
      const head = src.slice(from, i);
      open.push({ head: head.slice(head.lastIndexOf(';') + 1).trim(), body: i + 1 });
      from = i + 1;
    } else if (src[i] === '}') {
      const block = open.pop();
      if (block && !block.head.startsWith('@')) {
        const decls = {};
        for (const part of src.slice(block.body, i).split(';')) {
          const colon = part.indexOf(':');
          if (colon > 0) decls[part.slice(0, colon).trim().toLowerCase()] = part.slice(colon + 1).trim();
        }
        rules.push({
          selectors: block.head.split(',').map(s => s.trim().replace(/\s+/g, ' ')),
          inAtRule: open.some(b => b.head.startsWith('@')),
          decls
        });
      }
      from = i + 1;
    }
  }
  return rules;
}

/* The element a selector styles is named by its last compound. */
const subject = sel => sel.split(/\s*[\s>+~]\s*/).pop();
const stylesBlock = sel => /[.#]solar-orient(?![\w-])/.test(subject(sel));

function runStyles(css) {
  const rules = cssRules(css);
  let bad = 0;

  // 8 — the hidden attribute has to win over the class that lays the block out.
  {
    const hide = rules.find(r => !r.inAtRule && r.selectors.some(s => /^[.#]solar-orient\[hidden\]$/.test(s)));
    bad += report(!!hide && /^none\b/.test(hide.decls.display || ''),
                  'hidden hides the block → .solar-orient[hidden] sets display: none',
                  hide ? 'display: ' + (hide.decls.display || 'not set') : 'no such rule');
  }

  // 9 — two insets give the block its width and auto margins centre it. With
  //     left: 50% and translateX(-50%) it gets half the screen at most.
  {
    const own = rules.filter(r => r.selectors.some(stylesBlock));
    const base = own.find(r => !r.inAtRule && r.selectors.includes('.solar-orient') && r.decls.position === 'fixed');
    const set = v => v !== undefined && v !== 'auto';
    const wrong = [];
    if (!base) wrong.push('no fixed .solar-orient rule');
    else {
      if (!set(base.decls.left) || !set(base.decls.right)) wrong.push('left and right are not both set');
      if (base.decls['margin-inline'] !== 'auto' &&
          !(base.decls['margin-left'] === 'auto' && base.decls['margin-right'] === 'auto')) {
        wrong.push('its margins do not centre it');
      }
    }
    for (const r of own) {
      const d = r.decls, name = r.selectors.join(', ');
      if (d.left === '50%' || d.right === '50%') wrong.push(name + ' sets an inset of 50%');
      if (/-50%/.test((d.transform || '') + ' ' + (d.translate || ''))) wrong.push(name + ' translates by -50%');
      if (r.inAtRule && (d.left === 'auto' || d.right === 'auto')) wrong.push(name + ' drops an inset');
    }
    bad += report(!wrong.length, 'the block spans between two insets and centres itself, with no left: 50%',
                  wrong.join('; '));
  }

  // 10 — a row stays on one line; a row that may wrap is what jumped.
  {
    const nowrap = rules.some(r => !r.inAtRule && r.decls['white-space'] === 'nowrap' &&
                                   r.selectors.some(s => /^[.#]solar-orient ?> ?(\*|div)$/.test(s)));
    const undo = rules.filter(r => r.decls['white-space'] && r.decls['white-space'] !== 'nowrap' &&
                                   r.selectors.some(s => /solar-orient/.test(s) && /\.so-/.test(subject(s))));
    bad += report(nowrap && !undo.length, 'every row stays on one line → white-space: nowrap, and no row class undoes it',
                  !nowrap ? 'no rule gives the rows nowrap' : undo.map(r => r.selectors.join(', ')).join('; '));
  }

  return bad;
}

/* THE CHECK ON THE CHECK. Every break below MUST show. The breaks go on a COPY
   of the module, so an interrupted selftest leaves nothing damaged behind; the
   stylesheet is broken in memory only. A break whose anchor is gone counts as
   unseen, so it cannot pass by breaking nothing. */
async function selftestRun() {
  const src = await readFile(join(ROOT, MODULE), 'utf8');
  const css = await readFile(join(ROOT, STYLES), 'utf8');
  const tmp = 'js/ui/__orient-selftest.js';

  const breaks = [
    { name: 'the largest occulter instead of the smallest',
      edit: (s) => s.replace('Math.min(...occs)', 'Math.max(...occs)') },
    { name: 'the occulter line next to a disc source',
      edit: (s) => s.replace('if (!discs.length && occs.length)', 'if (occs.length)') },
    { name: 'the best sharpness verdict instead of the worst',
      edit: (s) => s.replace('> VERDICT_RANK[a]', '< VERDICT_RANK[a]') },
    { name: 'the drawn sun calling itself image data',
      edit: (s) => s.replace("text: 'DRAWN SUN — MEASURED REGIONS'",
                             "text: 'IMAGE DATA — NOT MEASUREMENTS'") },
    { name: 'the age dropped from the provenance line',
      edit: (s) => s.replace(" + ' · ' + ageText(d.ageMinutes)", '') },
    { name: 'a film frame judged on sharpness',
      edit: (s) => s.replace('const film = shown.find(d => d.film);', 'const film = null;') },
    { name: 'a failed fetch left unsaid',
      edit: (s) => s.replace("s.notice ? [{ cls: 'so-warn', text: s.notice }] : []", '[]') }
  ];

  const styleBreaks = [
    { name: 'no rule that hides the block',
      edit: (s) => s.replace('  .solar-orient[hidden] { display: none; }\n', '') },
    { name: 'the block centred with left: 50% and translateX(-50%)',
      edit: (s) => s.replace('top: 22px; left: 12px; right: 12px;', 'top: 22px; left: 50%; transform: translateX(-50%);') },
    { name: 'the right inset dropped',
      edit: (s) => s.replace('top: 22px; left: 12px; right: 12px;', 'top: 22px; left: 12px;') },
    { name: 'rows that may wrap',
      edit: (s) => s.replace('  .solar-orient > div {\n    white-space: nowrap;', '  .solar-orient > div {\n    white-space: normal;') },
    { name: 'a row class that wraps again',
      edit: (s) => s.replace('.solar-orient .so-row { color: var(--ink-3, #8b95a4); }',
                             '.solar-orient .so-row { color: var(--ink-3, #8b95a4); white-space: normal; }') }
  ];

  let missed = 0;
  for (const b of breaks) {
    const edited = b.edit(src);
    if (edited === src) { console.log('  FAIL  break has no anchor: ' + b.name + '\n'); missed++; continue; }
    await writeFile(join(ROOT, tmp), edited);
    let bad = 0;
    try {
      const mod = await import('../' + tmp + '?v=' + Date.now());
      bad = run(mod.orientLines);
    } catch { bad = 1; }
    finally { await unlink(join(ROOT, tmp)).catch(() => {}); }
    if (bad) console.log('  ok    break seen: ' + b.name + '\n');
    else { console.log('  FAIL  break NOT seen: ' + b.name + '\n'); missed++; }
  }
  for (const b of styleBreaks) {
    const edited = b.edit(css);
    if (edited === css) { console.log('  FAIL  break has no anchor: ' + b.name + '\n'); missed++; continue; }
    if (runStyles(edited)) console.log('  ok    break seen: ' + b.name + '\n');
    else { console.log('  FAIL  break NOT seen: ' + b.name + '\n'); missed++; }
  }
  return missed;
}

if (selftest) {
  console.log('selftest — every break must show\n');
  const missed = await selftestRun();
  console.log(missed ? `\n${missed} break(s) went unnoticed` : '\nall breaks seen');
  process.exit(missed ? 1 : 0);
} else {
  const { orientLines } = await import('../' + MODULE);
  const css = await readFile(join(ROOT, STYLES), 'utf8');
  process.exit((run(orientLines) + runStyles(css)) ? 1 : 0);
}
