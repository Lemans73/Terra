/* US WILDFIRE FACTS — looked up at NIFC by the IRWIN identifier.
   ===========================================================================

   EONET's only source for a wildfire in the United States is IRWIN, and
   irwin.doi.gov is a login wall. The button to it was removed in session 42
   because a button that cannot work is worse than no button. This is what
   those fires get instead.

   THE IDENTIFIER IS ALREADY IN THE URL WE THREW AWAY:

       https://irwin.doi.gov/observer/incidents/2026-NVHTF-020624
                                               ^^^^^^^^^^^^^^^^^^

   That is the `UniqueFireIdentifier`, and NIFC publishes the same incidents
   openly through an ArcGIS feature service that answers with
   `access-control-allow-origin: *`. No proxy, no key.

   IT DOES NOT ALWAYS RESOLVE, and that is expected rather than a fault. The
   `Current` layer holds active incidents; a fire whose season is over has moved
   on. Measured on three real EONET ids: two hit, one missed. A miss adds no
   rows at all — better a short panel than a row saying "unknown".
   =========================================================================== */

const SERVICE = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/' +
                'WFIGS_Incident_Locations_Current/FeatureServer/0/query';
const FIELDS = ['IncidentName', 'IncidentSize', 'PercentContained', 'FireCause',
                'FireDiscoveryDateTime', 'POOState', 'IncidentShortDescription'].join(',');

const ACRE_TO_HA = 0.404685642;
export const acresToHectares = (a) => a * ACRE_TO_HA;

/* THE IDENTIFIER OUT OF THE URL, AND STRICTLY.

   It is pasted into a `where` clause, so what comes back from EONET is not
   allowed to carry a quote, a space or anything else — a crafted url would
   otherwise write the query. Only the shape the identifier actually has gets
   through: a year, a unit code and a local number, in upper case, joined by
   hyphens (`2026-NMN2S-27-2057027` is a real one, so the middle may repeat).
   Anything else returns null and the lookup simply does not happen. */
export function irwinIdFromUrl(url) {
  if (!url) return null;
  let pad;
  try { pad = new URL(url).pathname; } catch { return null; }
  const m = /\/incidents\/([A-Z0-9-]{6,40})$/.exec(pad);
  if (!m) return null;
  return /^\d{4}(?:-[A-Z0-9]+)+$/.test(m[1]) ? m[1] : null;
}

/* EIGEN NAAM: zie de noot bij reportCache in js/compute/storm-report.js. De
   standalone-build deelt een scope, dus een kale `cache` botst. */
const factsCache = new Map();

// Zie de noot bij peekStormReport: het venster tekent synchroon en mag geen lus
// maken van zijn eigen wachten.
export function peekWildfireFacts(id) { return factsCache.get(id); }

export async function fetchWildfireFacts(id, opts = {}) {
  if (!id) return { state: 'error' };
  if (factsCache.has(id)) return factsCache.get(id);

  const url = SERVICE +
    '?where=' + encodeURIComponent("UniqueFireIdentifier='" + id + "'") +
    '&outFields=' + encodeURIComponent(FIELDS) +
    '&returnGeometry=false&f=json';

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs || 12000);
  let uit;
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) uit = { state: 'error' };
    else {
      const json = await res.json();
      /* ARCGIS MELDT EEN FOUT ONDER EEN 200. Een verkeerde veldnaam of een
         kapotte query komt terug als `{error:{...}}` met status 200; zonder
         deze toets zou dat als "niet gevonden" lezen en zouden we een echte
         storing stil wegmoffelen. */
      if (json && json.error) uit = { state: 'error' };
      else {
        const a = json && json.features && json.features[0] && json.features[0].attributes;
        uit = a ? { state: 'ok', facts: normaliseIncident(a) } : { state: 'none' };
      }
    }
  } catch {
    uit = { state: 'error' };
  } finally {
    clearTimeout(timer);
  }
  factsCache.set(id, uit);
  return uit;
}

/* Eigen naam om dezelfde reden als factsCache hierboven: er staat elders al
   een `normalise` (een vector normaliseren), en de standalone deelt de scope. */
function normaliseIncident(a) {
  return {
    name: a.IncidentName || null,
    acres: typeof a.IncidentSize === 'number' ? a.IncidentSize : null,
    contained: typeof a.PercentContained === 'number' ? a.PercentContained : null,
    cause: a.FireCause || null,
    // ArcGIS levert epoch-milliseconden.
    discovered: typeof a.FireDiscoveryDateTime === 'number' ? new Date(a.FireDiscoveryDateTime) : null,
    // "US-NV" -> "NV"; het land staat al in de titel van het event.
    state: a.POOState ? String(a.POOState).replace(/^US-/, '') : null,
    where: a.IncidentShortDescription || null
  };
}

export function clearWildfireFactsCache() { factsCache.clear(); }
