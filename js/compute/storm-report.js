/* JTWC WARNING REPORTS (.tcw) — fetch and parse.
   ===========================================================================

   EONET points a tropical storm at the Joint Typhoon Warning Center's own
   warning file. It is served as `binary/octet-stream`, so a browser downloads
   it instead of showing it — but it is plain text, and JTWC sends
   `access-control-allow-origin: *`, so we can read it ourselves.

   THE FILE IS USUALLY GONE, AND THAT IS THE NORMAL CASE. JTWC removes the
   product once it stops issuing warnings for a system; EONET keeps the url for
   as long as the event is open. Measured on 2026-08-28: at 09:00 two of six
   open storms still had a file, by 12:15 all six answered 403 with an S3
   AccessDenied page. So `gone` is the main road here, not the exception — and
   it is also why the download button has to disappear when it happens: it was
   handing people an XML error page named `.tcw`.

   WHAT IS PARSED. The prose block for the values a reader recognises (winds,
   movement, fix accuracy) and the compact `T` lines at the top for the track,
   because those are regular where the prose is not. The trailing coordinate
   table is the historical track — not used yet, and a candidate for drawing on
   the globe some day.
   =========================================================================== */

const KT_TO_KMH = 1.852;   // one knot is one nautical mile per hour
const NM_TO_KM  = 1.852;

export const knotsToKmh = (kt) => Math.round(kt * KT_TO_KMH);
export const nmToKm     = (nm) => Math.round(nm * NM_TO_KM);

/* A JTWC coordinate carries its tenths without a separator: `381N` is 38.1 N and
   `1791W` is 179.1 W. Longitudes have one digit more than latitudes, so the
   split is on the hemisphere letter and not on a fixed width. */
function coord(raw) {
  const m = /^(\d+)([NSEW])$/.exec(raw || '');
  if (!m) return null;
  const value = parseInt(m[1], 10) / 10;
  return { value, hemi: m[2], text: value.toFixed(1) + '°' + m[2] };
}

// `2026082806` -> a Date in UTC. Returns null on anything that is not ten digits.
function stampToDate(raw) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})$/.exec(raw || '');
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4]));
}

/* THE WIND RADII, from the tail of a `T` line:

     T000 381N 1791W 035 R034 100 NE QD 080 SE QD 000 SW QD 080 NW QD

   `R034` opens a group and the four numbers after it are the radius of that
   wind speed in each quadrant, in nautical miles. A warning carries R034 (gale
   force), and a stronger system also R050 and R064.

   THE QUADRANTS ARE GENUINELY DIFFERENT, and that is the point of showing them:
   LALA had NE 100, SE 80, NW 80 and SW 0 — no wind of that strength on its
   south-west side at all. A single radius would hide exactly the thing that
   makes a storm's footprint informative.

   Returns { 34: {ne, se, sw, nw}, … } in NM, or null when the line has no radii. */
function parseRadii(tail) {
  if (!tail) return null;
  const uit = {};
  for (const groep of tail.matchAll(/R(\d{3})((?:\s+\d{3}\s+(?:NE|SE|SW|NW)\s+QD)+)/g)) {
    const kt = parseInt(groep[1], 10);
    const per = {};
    for (const q of groep[2].matchAll(/(\d{3})\s+(NE|SE|SW|NW)\s+QD/g)) {
      per[q[2].toLowerCase()] = parseInt(q[1], 10);
    }
    if (Object.keys(per).length === 4) uit[kt] = per;
  }
  return Object.keys(uit).length ? uit : null;
}

/* Turn the report into an object, or null when the text is not a JTWC warning.
   NULL AND NOT A HALF-FILLED OBJECT: a partial parse would render a panel with
   empty rows, and that reads as "no wind" rather than "not understood". The
   test is the SUBJ line, which every warning carries. */
export function parseJtwcWarning(text) {
  if (typeof text !== 'string' || text.length < 40) return null;
  const subj = /^SUBJ:\s+(.+?)\s+WARNING NR\s+(\d+)/m.exec(text);
  if (!subj) return null;

  const out = {
    subject: subj[1].trim(),
    warningNr: parseInt(subj[2], 10),
    issued: null, position: null, movement: null,
    accuracyNm: null, basis: null, winds: null, gusts: null, radii: null,
    forecast: [], remarks: ''
  };

  // The third header line: issue stamp, cyclone id, name, warning number.
  const head = /^(\d{10})\s+(\S+)\s+(\S+)/m.exec(text);
  if (head) out.issued = stampToDate(head[1]);

  const pos = /WARNING POSITION:\s*\n\s*(\d{6}Z)\s*-+\s*NEAR\s+([\d.]+[NS])\s+([\d.]+[EW])/.exec(text);
  if (pos) out.position = { time: pos[1], lat: pos[2], lng: pos[3] };

  const mov = /MOVEMENT PAST SIX HOURS\s*-\s*(\d+)\s+DEGREES AT\s+(\d+)\s+KTS/.exec(text);
  if (mov) out.movement = { bearing: parseInt(mov[1], 10), knots: parseInt(mov[2], 10) };

  const acc = /POSITION ACCURATE TO WITHIN\s+(\d+)\s+NM/.exec(text);
  if (acc) out.accuracyNm = parseInt(acc[1], 10);

  /* HOW THE CENTRE WAS FIXED, and it runs over more than one line: "CENTER
     LOCATED BY A COMBINATION OF\n     SATELLITE AND RADAR". Read until the next
     indented capitalised field or the `---` separator, then collapse the
     whitespace. */
  const bas = /POSITION BASED ON\s+([\s\S]*?)(?=\n\s*[A-Z][A-Z ]{4,}:|\n\s*---)/.exec(text);
  if (bas) {
    /* "CENTER LOCATED BY" COMES OFF. The row is already called Fix, so those
       four words repeat the label and push the rest across three lines in a
       280 px panel. What is left is where the fix came from. */
    out.basis = bas[1].replace(/\s+/g, ' ').trim().toLowerCase()
                      .replace(/^center located by\s+/, '');
  }

  // The FIRST occurrence is the present wind; the forecast blocks repeat the line.
  const wind = /MAX SUSTAINED WINDS\s*-\s*(\d+)\s*KT,\s*GUSTS\s*(\d+)\s*KT/.exec(text);
  if (wind) { out.winds = parseInt(wind[1], 10); out.gusts = parseInt(wind[2], 10); }

  /* THE TRACK COMES FROM THE `T` LINES and not from the prose. Same numbers,
     but one regular shape instead of a paragraph per lead time: `T012 385N
     1798E 030` is tau 12 hours, 38.5N 179.8E, 30 knots. */
  for (const m of text.matchAll(/^T(\d{3})\s+(\d+[NS])\s+(\d+[EW])\s+(\d+)(.*)$/gm)) {
    out.forecast.push({
      tau: parseInt(m[1], 10),
      lat: coord(m[2]), lng: coord(m[3]),
      knots: parseInt(m[4], 10),
      radii: parseRadii(m[5])
    });
  }

  /* THE REMARKS, up to the `//` that closes the prose. "FOR SIX-HOURLY
     UPDATES." is boilerplate that the file repeats up to four times; it says
     nothing about this storm and goes. */
  const rem = /^REMARKS:\s*\n([\s\S]*?)(?=^\/\/\s*$|^NNNN\s*$)/m.exec(text);
  // The radii for NOW, because the footprint hangs off them. Absent from every
  // T line, this stays null and the layer draws only the track.
  const nu = out.forecast.find(f => f.tau === 0);
  out.radii = (nu && nu.radii) || null;

  if (rem) {
    out.remarks = rem[1]
      .split('\n')
      .filter(l => !/^\s*FOR SIX-HOURLY UPDATES\.?\s*$/i.test(l))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return out;
}

/* ---- Ophalen --------------------------------------------------------------

   Drie uitkomsten en geen twee: `ok` met een rapport, `gone` als JTWC het
   bestand heeft ingetrokken, en `error` voor al het andere. Die drie staan er
   apart omdat het paneel ze verschillend toont — een ingetrokken bestand is
   geen storing en hoort niet als storing te lezen.

   GECACHET PER URL, want hetzelfde venster gaat vaak meermaals open en het
   bestand verandert hooguit zes keer per etmaal. De cache bewaart ook een
   mislukking: opnieuw proberen bij elke klik zou een dode url zes keer per
   minuut aantikken. */
/* A NAME OF ITS OWN, because the standalone build pours every module into ONE
   scope. A bare `cache` collides with the next module that also has one; the
   build caught exactly that. */
const reportCache = new Map();

/* THE CACHE MAY BE READ SYNCHRONOUSLY, and that is a requirement rather than a
   convenience. The detail panel draws synchronously; without this peek it would
   have to wait again on every redraw, and the handling of that wait calls the
   panel again — a loop. Now the panel takes what is there and only fetches when
   there is nothing yet. */
export function peekStormReport(url) { return reportCache.get(url); }

export async function fetchStormReport(url, opts = {}) {
  if (!url) return { state: 'error' };
  if (reportCache.has(url)) return reportCache.get(url);

  const timeoutMs = opts.timeoutMs || 12000;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let uit;
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (res.status === 403 || res.status === 404) uit = { state: 'gone' };
    else if (!res.ok) uit = { state: 'error' };
    else {
      const tekst = await res.text();
      const rapport = parseJtwcWarning(tekst);
      /* A 200 CARRYING AN ERROR PAGE IS ALSO "GONE". The bucket sometimes
         answers with an AccessDenied XML under a 200; that does not parse as a
         warning and would otherwise read as a failure. */
      uit = rapport ? { state: 'ok', report: rapport }
                    : { state: /AccessDenied|<Error>/i.test(tekst) ? 'gone' : 'error' };
    }
  } catch {
    uit = { state: 'error' };
  } finally {
    clearTimeout(timer);
  }
  reportCache.set(url, uit);
  return uit;
}

// For measurements only: empty the cache so one reading does not pick up the
// answer of the previous.
export function clearStormReportCache() { reportCache.clear(); }
