/* check-present-chrome.mjs — does presentation mode still hide everything?
 *
 *   node tools/check-present-chrome.mjs
 *   node tools/check-present-chrome.mjs --selftest
 *
 * WHY THIS EXISTS.
 * Presentation mode hides the interface by naming it, one selector per panel.
 * A panel added later is simply not on that list, and nothing anywhere reports
 * it: the app works, the mode works, and the panel quietly rides along on
 * somebody's wallpaper. The failure is invisible in code and obvious in public,
 * which is the worst place to find it.
 *
 * FOUR CHECKS. Each says whether it had anything to test — a check over an
 * empty set reports "ok" and proves nothing, hence `n/a` as a separate outcome.
 *
 *   1  the markup parses into top-level elements   break: empty the body
 *   2  the CSS carries a presenting block          break: rename the class
 *   3  every top-level element is hidden or kept   break: add a panel
 *   4  every KEEP entry still exists               break: remove one
 *
 * KEEP IS DELIBERATELY SHORT. Anything on it stays visible while presenting,
 * so each entry needs a reason, not a shrug.
 *
 * Run:  node tools/check-present-chrome.mjs            (exit 0 = green)
 *       node tools/check-present-chrome.mjs --selftest (every break must show)
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARKUP = join(ROOT, 'index.html');
const STYLE = join(ROOT, 'css/app.css');

const wantSelftest = process.argv.includes('--selftest');

/* Stays on screen while presenting, with the reason it may. */
const KEEP = {
  globe: 'the picture itself',
  boot: 'the loading screen — there is nothing to present until it is gone',
  'sketch-file': 'an invisible file input',
  'ctex-file': 'an invisible file input'
};

function say(outcome, text, extra) {
  const mark = outcome === 'ok' ? '  ok   ' : outcome === 'na' ? '  n/a  ' : '  FAIL ';
  console.log(mark + ' ' + text);
  if (extra) for (const line of [].concat(extra)) console.log('        ' + line);
}

/* Top-level elements are the ones indented by exactly two spaces between
   <body> and the module script. That is a claim about how this file is
   written, and if someone re-indents it this check falls over — which is
   the right outcome, because then the list below cannot be trusted either. */
export function topLevel(html) {
  const lines = html.split('\n');
  const from = lines.findIndex((l) => l.startsWith('<body'));
  const to = lines.findIndex((l) => l.includes('<script type="module"'));
  if (from < 0 || to < 0 || to <= from) return [];
  const out = [];
  for (let i = from + 1; i < to; i++) {
    const m = /^ {2}<([a-zA-Z][\w-]*)(.*)$/.exec(lines[i]);
    if (!m) continue;
    const tag = m[1];
    if (tag === 'script' || tag === 'style' || tag === 'template') continue;
    const id = /id="([^"]+)"/.exec(m[2]);
    const cls = /class="([^"]+)"/.exec(m[2]);
    out.push({
      line: i + 1, tag,
      id: id ? id[1] : '',
      classes: cls ? cls[1].split(/\s+/) : []
    });
  }
  return out;
}

/* Every selector in every rule that hides the interface.
   ALL of them, not just the first: one panel sits in a rule of its own because
   the standalone build cuts that layer out, and a scanner that stopped at the
   first rule would report it missing forever after. */
export function hiddenSelectors(css) {
  const out = [];
  const rule = /body\.presenting:not\(\.chrome-on\)[^{]*\{/g;
  let m;
  while ((m = rule.exec(css)) !== null) {
    /* Up to the opening brace, not the closing one: the last selector in a rule
       sits against the `{`, and reading past it swallows that selector whole. */
    for (const part of m[0].slice(0, -1).split(',')) {
      const sel = part.replace(/body\.presenting:not\(\.chrome-on\)/g, '').trim();
      if (sel) out.push(sel);
    }
  }
  return out;
}

export function analyse(html, css) {
  const tops = topLevel(html);
  const hidden = new Set(hiddenSelectors(css));
  const missing = [];
  for (const el of tops) {
    if (KEEP[el.id]) continue;
    const covered = (el.id && hidden.has('#' + el.id)) ||
                    el.classes.some((c) => hidden.has('.' + c));
    if (!covered) {
      missing.push('line ' + el.line + ': <' + el.tag + '>' +
                   (el.id ? ' #' + el.id : '') +
                   (el.classes.length ? ' .' + el.classes.join('.') : ''));
    }
  }
  return { tops, hidden, missing };
}

async function run(html, css, quiet) {
  let failed = 0;
  const log = quiet ? () => {} : say;

  const tops = topLevel(html);
  if (tops.length >= 8) log('ok', tops.length + ' top-level elements found in the markup');
  else { log('fail', 'only ' + tops.length + ' top-level elements — the markup did not parse'); failed++; }

  const hidden = hiddenSelectors(css);
  if (hidden.length) log('ok', hidden.length + ' selectors in the presenting block');
  else { log('fail', 'no presenting block in the stylesheet'); failed++; }

  if (!tops.length) log('na', 'nothing to hold against the stylesheet');
  else {
    const { missing } = analyse(html, css);
    if (!missing.length) log('ok', 'every top-level element is hidden or on KEEP');
    else { log('fail', missing.length + ' element(s) neither hidden nor kept', missing); failed++; }
  }

  const gone = Object.keys(KEEP).filter((id) => !tops.some((t) => t.id === id));
  if (!gone.length) log('ok', 'all ' + Object.keys(KEEP).length + ' KEEP entries still exist');
  else { log('fail', 'KEEP names something that is gone', gone); failed++; }

  return failed;
}

/* The check on this file: each break must make run() come back non-zero.
   Nothing is written to disk — the breaks happen in the strings, so a
   cancelled run cannot leave the repository in a broken state. */
async function proveItCanFail(html, css) {
  const breaks = [
    ['a new panel nobody hid',
     [html.replace(/^  <div class="dock" id="dock">/m,
                   '  <div class="brand-new" id="brand-new-panel"></div>\n  <div class="dock" id="dock">'), css]],
    ['the presenting block renamed away',
     [html, css.replace(/body\.presenting:not\(\.chrome-on\)/g, 'body.showtime:not(.chrome-on)')]],
    ['one panel dropped from the list',
     [html, css.replace(/\n  body\.presenting:not\(\.chrome-on\) #dock,/, '')]],
    ['a KEEP entry that no longer exists',
     [html.replace(/^  <div id="globe"><\/div>/m, '  <div id="globe-v2"></div>'), css]],
    ['a body that no longer parses',
     [html.replace(/^<body[^\n]*\n/m, ''), css]]
  ];

  let missed = 0;
  for (const [name, [h, c]] of breaks) {
    const failed = await run(h, c, true);
    if (failed) console.log('  ok    break seen: ' + name);
    else { console.log('  FAIL  break NOT seen: ' + name); missed++; }
  }
  return missed;
}

const html = await readFile(MARKUP, 'utf8');
const css = await readFile(STYLE, 'utf8');

if (wantSelftest) {
  console.log('selftest — every break must show\n');
  const missed = await proveItCanFail(html, css);
  console.log(missed ? '\n' + missed + ' break(s) went unnoticed' : '\nall breaks seen');
  process.exit(missed ? 1 : 0);
} else {
  const failed = await run(html, css);
  process.exit(failed ? 1 : 0);
}
