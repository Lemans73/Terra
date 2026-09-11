/* solar-orient.js — what you are looking at, on screen rather than in a panel.
 *
 * WHY THIS IS CHROME AND NOT A PANEL SECTION.
 * Three things about this view have to be true for a viewer who never opens
 * anything: that the disc is a PHOTOGRAPH and the circled regions are not, how
 * old that photograph is, and whether the zoom has gone past what the source
 * actually holds. A panel answers those questions to whoever asks them. Nobody
 * asks a question they do not know they have.
 *
 * IT DESCRIBES THE SCENE, NOT THE BUILD.
 * The first line changes with what is on screen and not with which version is
 * running. Load an instrument frame and it says so; look at the drawn sun and it
 * says that instead. The standalone gets the second case permanently because it
 * has no fetching, but that falls out of the rule rather than being a rule of
 * its own — and the full version shows exactly the same thing before the first
 * fetch, which is where a build-flag version would have quietly lied.
 *
 * EVERY NUMBER HERE IS READ, NEVER COMPUTED.
 * `describeSlot()` in js/states/sun.js already derives instrument, observation
 * time, age, sharpness and the earth in texels. A second derivation here would
 * be a second answer to the same question, and the two would drift.
 */

/* Below two texels a source cannot resolve the earth at all. That is the number
   that makes resolution mean something in one line, so it is the number the line
   switches on. */
const EARTH_TEXEL_FLOOR = 2;

const VERDICT_TEXT = {
  green: 'sharp at this zoom',
  amber: 'fetch again for more detail',
  /* The only line here that warns rather than informs. Past the ceiling the
     extra pixels are invention — the same rule that keeps a "sharpen" button out
     of this view altogether. */
  red: 'zoomed past what the source holds'
};

/* Worst wins. Two slots, one green and one red, is a red picture: the viewer
   sees one image and the weakest layer is the one that misleads. */
const VERDICT_RANK = { green: 0, amber: 1, red: 2 };

/* NOAA keeps a month of region lists. Past that edge the sun has no circles on
   it, and the difference between "nothing was active" and "nobody wrote it
   down" is the whole point of saying this. */
const NO_REGION_LIST = 'no region list for this date · NOAA SWPC';

function utcStamp(iso) {
  // "2026-09-10T14:47:29.000Z" → "14:47 UTC". The date lives in the readout; what
  // belongs here is the time of day, next to the age it produces.
  return iso.slice(11, 16) + ' UTC';
}

/* HOW OLD, IN A UNIT SOMEONE READS. Minutes up to an hour and a half, then
   hours — and past two days, days, because a picture of last week said "168
   hours old" and nobody counts that back. The strip can put the view a month
   back, so the ladder has to reach that far. */
export function ageText(minutes) {
  if (minutes < 1) return 'just now';
  if (minutes < 90) return minutes + ' min old';
  const h = minutes / 60;
  if (h < 48) return Math.round(h) + (Math.round(h) === 1 ? ' hour old' : ' hours old');
  const d = h / 24;
  if (d < 365) return Math.round(d) + ' days old';
  const y = d / 365.25;
  return (y < 10 ? y.toFixed(1) : Math.round(y)) + (y < 2 ? ' year old' : ' years old');
}

/* THE RULE LIVES HERE SO IT CAN BE CHECKED WITHOUT A BROWSER, the same reason
   fieldFor() sits in source.js. It takes the state object and returns rows;
   everything below it is DOM. */
export function orientLines(s) {
  if (!s) return null;
  const shown = (s.slotDetail || []).filter(Boolean);
  const out = [];

  if (!shown.length) {
    /* NO FRAME IS ALSO SOMETHING TO SAY. The drawn sun is a model — limb
       darkening from a law, granulation below the scale anyone could mistake
       for structure — and the caps on it are NOAA's measurement. Calling that
       "image data" would be false in the other direction. */
    out.push({ cls: 'so-kicker', text: 'DRAWN SUN — MEASURED REGIONS' });
    const drawn = s.spots && s.spots.drawn;
    if (drawn) out.push({ text: drawn + (drawn === 1 ? ' active region' : ' active regions') + ' · NOAA SWPC' });
    else if (s.regionDay === null) out.push({ text: NO_REGION_LIST });
    return out;
  }

  out.push({ cls: 'so-kicker', text: 'IMAGE DATA — NOT MEASUREMENTS' });
  for (const d of shown) {
    out.push({ text: d.name + ' · ' + utcStamp(d.observed) + ' · ' + ageText(d.ageMinutes) });
  }

  // A frame from before NOAA's month has no circles, and that needs saying here
  // too: an empty disc otherwise reads as a sun without active regions.
  if (s.regionDay === null) out.push({ text: NO_REGION_LIST });

  const worst = shown.reduce((a, d) =>
    (d.sharpness && VERDICT_RANK[d.sharpness.verdict] > VERDICT_RANK[a]) ? d.sharpness.verdict : a,
    'green');
  out.push({ cls: 'so-sharp so-' + worst, text: VERDICT_TEXT[worst], dot: true });

  /* The earth in texels, from the sharpest slot rather than an average: it
     answers "can this source see something that size", and one source that can
     is the answer. */
  const texels = shown.reduce((m, d) => Math.max(m, d.earthTexels || 0), 0);
  if (texels > 0) {
    out.push({
      text: texels < EARTH_TEXEL_FLOOR
        ? 'Earth under ' + EARTH_TEXEL_FLOOR + ' texels — this source cannot resolve it'
        : 'Earth ≈ ' + Math.round(texels) + ' texels wide'
    });
  }

  /* THE BLACK DISC IS THE INSTRUMENT, NOT A GAP. A coronagraph holds an
     occulter in front of the sun so the corona is not drowned by it; without
     this line, several solar radii of nothing reads as a failed load.

     THE SMALLEST OCCULTER WINS, NOT THE LARGEST, and getting that backwards
     states a wrong number with full confidence. C2 runs 2.40 to 6.40 R☉ and C3
     runs 4.67 to 31.13; stacked, the inner one fills the outer one's hole and
     what stays blank is C2's 2.40. Load C3 alone and it is 4.67. Either way it
     is the smallest occulter on screen.

     AND NOT AT ALL IF A DISC SOURCE IS LOADED. AIA and HMI image the disc
     itself, so with one of those in the stack there is no blank centre to
     explain — announcing one would send the viewer looking for a hole that is
     not there. */
  const discs = shown.filter(d => !d.coronagraph);
  const occs = shown.filter(d => d.coronagraph && d.occulter).map(d => d.occulter);
  if (!discs.length && occs.length) {
    const occ = Math.min(...occs);
    out.push({ text: 'Blank within ' + occ.toFixed(1) + ' R☉ — the occulter, not a gap' });
  }
  return out;

}

export function createSolarOrient(env) {
  const { state, active } = env;
  const el = document.getElementById('solar-orient');
  let last = null;

  /* Written only when it changed. This runs on every camera change and on the
     one-second clock, and an unchanged innerHTML write still costs a layout. */
  function refresh() {
    if (!el) return;
    if (!active()) { el.hidden = true; last = null; return; }
    const rows = orientLines(state());
    if (!rows || !rows.length) { el.hidden = true; last = null; return; }
    const html = rows.map(r =>
      '<div class="' + (r.cls || 'so-row') + '">' +
      (r.dot ? '<span class="so-dot"></span>' : '') +
      r.text.replace(/&/g, '&amp;').replace(/</g, '&lt;') +
      '</div>').join('');
    if (html === last) { el.hidden = false; return; }
    last = html;
    el.innerHTML = html;
    el.hidden = false;
  }

  return { refresh };
}
