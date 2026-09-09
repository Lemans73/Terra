/* check-helioviewer-policy.mjs — is the proxy still a proxy and not a passthrough?
 *
 *   node tools/check-helioviewer-policy.mjs
 *   node tools/check-helioviewer-policy.mjs --selftest
 *
 * WHY THIS EXISTS.
 * api/_helioviewer-policy.mjs decides what Terra's server will fetch on a
 * stranger's behalf. Every way it can go wrong produces a working application:
 * accept an unknown parameter and the images still load, accept an unknown
 * endpoint and the images still load, drop the size ceiling and the images
 * still load — larger, and at four megabytes each against a fixed monthly
 * budget. None of that shows up on screen, which is exactly why it needs a
 * check rather than a review.
 *
 * SEVEN CHECKS, and `--selftest` breaks the policy on purpose to see each one
 * fire. A suite that stays green while the thing it guards is broken is not a
 * suite; the injections below are the only evidence these checks work at all.
 *
 *   1  every allowed endpoint accepts a valid request
 *   2  an unknown endpoint is refused
 *   3  an unknown parameter is refused          <- proxy vs. passthrough
 *   4  a missing required parameter is refused
 *   5  a malformed value is refused, per type
 *   6  width and height above the ceiling are refused
 *   7  every built URL points at the fixed upstream, and carries a cache window
 */

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const POLICY = join(ROOT, 'api/_helioviewer-policy.mjs');
const UPSTREAM = 'https://api.helioviewer.org/v2/';

const selftest = process.argv.includes('--selftest');
let failures = 0;

function report(kind, text, extra) {
  const mark = kind === 'ok' ? '  ok   ' : kind === 'skip' ? '  n/a  ' : '  FAIL ';
  console.log(mark + ' ' + text + (extra ? '\n         ' + extra : ''));
  if (kind === 'fail') failures++;
}

/* A request as the proxy receives it: the endpoint plus a bag of parameters.
   Shaped like URLSearchParams because that is what both callers hand in. */
function ask(planRequest, endpoint, params) {
  const map = new Map(Object.entries(params));
  return planRequest(endpoint, k => (map.has(k) ? map.get(k) : null), map.keys());
}

const VALID = {
  getClosestImage: { date: '2026-09-08T12:00:33Z', sourceId: '10' },
  takeScreenshot: {
    date: '2026-09-08T12:00:33Z', imageScale: '1.2006', layers: '[10,1,100]',
    x0: '0', y0: '0', width: '1024', height: '1024',
    display: 'true', watermark: 'false'
  },
  getJP2Header: { id: '191864193' },
  getDataSources: {}
};

async function run(mod, label) {
  const { planRequest, ALLOWED_ENDPOINTS, MAX_IMAGE_PX } = mod;
  const results = [];
  const check = (n, ok, detail) => results.push({ n, ok, detail });

  // 1 — every allowed endpoint accepts a valid request.
  {
    const bad = ALLOWED_ENDPOINTS.filter(e => !ask(planRequest, e, VALID[e]).ok);
    check(1, bad.length === 0, bad.length ? 'refused: ' + bad.join(', ') : '');
  }

  // 2 — an unknown endpoint is refused. `getTile` is real upstream and
  // deliberately not on our list, so this also catches "allow everything real".
  {
    const tries = ['getTile', 'postMovie', 'downloadScreenshot', '', '../v2/getTile'];
    const through = tries.filter(e => ask(planRequest, e, {}).ok);
    check(2, through.length === 0, through.length ? 'allowed: ' + through.join(', ') : '');
  }

  // 3 — an unknown parameter is refused. The difference between a proxy and a
  // passthrough is whether it answers a request it does not fully understand.
  {
    const through = [];
    for (const [endpoint, base] of Object.entries(VALID)) {
      for (const extra of ['callback', 'json', 'redirect', 'proxy', 'url']) {
        if (ask(planRequest, endpoint, { ...base, [extra]: 'x' }).ok) {
          through.push(endpoint + '?' + extra);
        }
      }
    }
    check(3, through.length === 0, through.length ? 'allowed: ' + through.join(', ') : '');
  }

  // 4 — a missing required parameter is refused, one at a time.
  {
    const through = [];
    for (const [endpoint, base] of Object.entries(VALID)) {
      for (const key of Object.keys(base)) {
        // Only required keys must fail; the optional ones legitimately may not.
        const without = { ...base }; delete without[key];
        const wasRequired = !['display', 'watermark'].includes(key);
        if (wasRequired && ask(planRequest, endpoint, without).ok) {
          through.push(endpoint + ' without ' + key);
        }
      }
    }
    check(4, through.length === 0, through.length ? 'allowed: ' + through.join(', ') : '');
  }

  // 5 — a malformed value is refused. One case per shape the policy knows.
  {
    const cases = [
      ['getClosestImage', { date: '2026-09-08 12:00:33' }],   // space, not T/Z
      ['getClosestImage', { date: 'now' }],
      ['getClosestImage', { sourceId: '10; DROP' }],
      ['getClosestImage', { sourceId: '-1' }],
      ['takeScreenshot',  { layers: '[10,1,100],evil' }],
      ['takeScreenshot',  { layers: 'SDO,AIA,171' }],         // observatory form
      ['takeScreenshot',  { imageScale: 'NaN' }],
      ['takeScreenshot',  { imageScale: '0' }],               // would divide by zero
      ['takeScreenshot',  { watermark: '1' }],                // not a bool literal
      ['takeScreenshot',  { x0: '1e9' }],
      ['getJP2Header',    { id: 'abc' }]
    ];
    const through = cases
      .filter(([e, patch]) => ask(planRequest, e, { ...VALID[e], ...patch }).ok)
      .map(([e, patch]) => e + ' ' + JSON.stringify(patch));
    check(5, through.length === 0, through.length ? 'allowed: ' + through.join(', ') : '');
  }

  // 6 — the size ceiling holds, at the value written here and not at whatever
  // the policy currently claims. Reading MAX_IMAGE_PX and testing one above it
  // would follow the module upward: raise the ceiling to 16384 and the check
  // would dutifully test 16385 and stay green while thirty times the bytes went
  // out the door. The number lives in two places on purpose — agreeing is the
  // thing being checked.
  {
    const CEILING = 2048;
    const wrong = [];
    if (MAX_IMAGE_PX !== CEILING) {
      wrong.push('MAX_IMAGE_PX is ' + MAX_IMAGE_PX + ', expected ' + CEILING);
    }
    for (const dim of ['width', 'height']) {
      const over = { ...VALID.takeScreenshot, [dim]: String(CEILING + 1) };
      if (ask(planRequest, 'takeScreenshot', over).ok) wrong.push(dim + ' above ' + CEILING);
    }
    // The ceiling itself must stay reachable, or check 6 could pass by refusing
    // everything.
    const atLimit = ask(planRequest, 'takeScreenshot', {
      ...VALID.takeScreenshot, width: String(CEILING), height: String(CEILING)
    }).ok;
    if (!atLimit) wrong.push('the ceiling itself was refused');
    check(6, wrong.length === 0, wrong.join('; '));
  }

  // 7 — every accepted request points at the fixed upstream and carries a cache
  // window, because Helioviewer sends none of its own.
  {
    const wrong = [];
    for (const [endpoint, base] of Object.entries(VALID)) {
      const plan = ask(planRequest, endpoint, base);
      if (!plan.ok) continue;
      if (!plan.url.startsWith(UPSTREAM + endpoint + '/?')) {
        wrong.push(endpoint + ' -> ' + plan.url.slice(0, 60));
      }
      if (!/^public, s-maxage=\d+/.test(plan.cacheControl || '')) {
        wrong.push(endpoint + ' has no cache window');
      }
    }
    check(7, wrong.length === 0, wrong.length ? wrong.join('; ') : '');
  }

  if (!selftest) {
    for (const r of results) {
      report(r.ok ? 'ok' : 'fail', 'check ' + r.n + ' — ' + DESCRIPTIONS[r.n], r.detail);
    }
  }
  return results;
}

const DESCRIPTIONS = {
  1: 'every allowed endpoint accepts a valid request',
  2: 'an unknown endpoint is refused',
  3: 'an unknown parameter is refused',
  4: 'a missing required parameter is refused',
  5: 'a malformed value is refused',
  6: 'the size ceiling holds',
  7: 'fixed upstream, and a cache window on every plan'
};

/* ---- The checks on the checks --------------------------------------------
   Each entry rewrites the policy so that exactly one guarantee is gone, then
   demands that the matching check goes red. An injection that changes nothing
   is itself the finding: it means the check never had teeth. */
const BREAKS = [
  {
    n: 3, what: 'accept unknown parameters instead of refusing them',
    edit: s => s.replace(
      "if (!check) return { ok: false, status: 400, error: 'unexpected parameter' };",
      'if (!check) continue;')
  },
  {
    n: 4, what: 'stop demanding the required parameters',
    edit: s => s.replace(
      "if (!out.has(key)) return { ok: false, status: 400, error: 'missing parameter' };",
      'if (false) return null;')
  },
  {
    n: 6, what: 'raise the size ceiling',
    edit: s => s.replace('export const MAX_IMAGE_PX = 2048;',
                         'export const MAX_IMAGE_PX = 16384;')
  },
  {
    n: 5, what: 'let any string pass as a timestamp',
    edit: s => s.replace(/const isoInstant = .*?;\n/s, 'const isoInstant = () => true;\n')
  },
  {
    n: 2, what: 'treat any endpoint name as known',
    edit: s => s.replace(
      '  const spec = Object.prototype.hasOwnProperty.call(ENDPOINTS, endpoint)\n' +
      '    ? ENDPOINTS[endpoint] : null;',
      '  const spec = ENDPOINTS[endpoint] || { required: {}, optional: {} };')
  },
  {
    n: 7, what: 'point the upstream somewhere else',
    edit: s => s.replace("const UPSTREAM = 'https://api.helioviewer.org/v2/';",
                         "const UPSTREAM = 'https://example.invalid/v2/';")
  },
  {
    n: 7, what: 'drop a cache window',
    edit: s => s.replace(/^\s*takeScreenshot:\s+'public, s-maxage=86400.*$/m,
                         '  takeScreenshot:  undefined,')
  }
];

async function main() {
  const original = await readFile(POLICY, 'utf8');

  if (!selftest) {
    console.log('check-helioviewer-policy — the proxy against its own rules\n');
    const mod = await import(POLICY + '?v=' + Date.now());
    await run(mod, 'live');
    console.log(failures ? '\n' + failures + ' failed' : '\nall seven green');
    process.exit(failures ? 1 : 0);
  }

  console.log('check-helioviewer-policy --selftest — every break must show\n');
  const baseline = await run(await import(POLICY + '?v=' + Date.now()), 'baseline');
  const stillGreen = baseline.filter(r => !r.ok);
  if (stillGreen.length) {
    console.log('  FAIL  the unmodified policy is already red — fix that first');
    process.exit(1);
  }

  let missed = 0;
  for (const brk of BREAKS) {
    const broken = brk.edit(original);
    if (broken === original) {
      report('fail', 'break "' + brk.what + '" changed nothing',
             'the injection no longer matches the source');
      missed++;
      continue;
    }
    await writeFile(POLICY, broken);
    let caught = false;
    try {
      const mod = await import(POLICY + '?v=' + Date.now() + Math.random());
      const results = await run(mod, brk.what);
      caught = results.some(r => r.n === brk.n && !r.ok);
    } catch {
      // A break that makes the module unloadable also counts as caught: the
      // guard rail fires either way.
      caught = true;
    } finally {
      await writeFile(POLICY, original);
    }
    if (caught) {
      report('ok', 'check ' + brk.n + ' catches: ' + brk.what);
    } else {
      report('fail', 'check ' + brk.n + ' MISSED: ' + brk.what);
      missed++;
    }
  }

  // Leave the file exactly as we found it, whatever happened above.
  await readFile(POLICY, 'utf8').then(async now => {
    if (now !== original) await writeFile(POLICY, original);
  });
  await unlink(POLICY + '.bak').catch(() => {});

  console.log(missed ? '\n' + missed + ' break(s) went unnoticed' : '\nall breaks seen');
  process.exit(missed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
