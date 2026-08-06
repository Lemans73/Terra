// ============================================================
//  eop.js — Earth Orientation Parameters, oftewel waar de pool werkelijk staat
//
//  Pure datamodule: geen three.js, geen DOM. Zelfde tweedeling als
//  sunmoon.js / geomag.js — dit is met `node` te toetsen zonder browser.
//
//  WAT POLAR MOTION IS. De rotatie-as ligt niet stil in de aardkorst. Hij
//  beschrijft een spiraal rond een gemiddelde stand: de Chandler-wobble (periode
//  1,19 jaar, een vrije nutatie van de niet-starre aarde) en een jaarlijkse term
//  van massaverplaatsing — water, sneeuw, lucht. Daar bovenop drijft de gemiddelde
//  pool langzaam weg.
//
//  DE SCHAAL, want die bepaalt alles aan deze module (gemeten 2026-08-06 op de
//  echte reeksen, niet overgenomen uit literatuur):
//
//    1 boogseconde = 30,888 m aan het oppervlak, dus 1 mas = 30,9 mm
//    grootste uitwijking ooit t.o.v. de oorsprong   624 mas = 19,3 m
//    afgelegde weg laatste 51 dagen                  54 mas =  1,7 m
//    afgelegde weg laatste jaar                     473 mas = 14,6 m
//    seculaire drift 1900s -> 2020s                 339 mas = 10,5 m
//
//  De pool rijdt dus zo'n 25 meter per jaar maar komt nooit verder dan 20 meter
//  van huis: een spiraal in een cirkel van 40 m doorsnede.
//
//  DAAROM ZIT DIT NIET IN DE GEOMETRIE, en dat is een besluit uit sessie 16 dat
//  hier alleen bevestigd wordt. Bij maximale inzoom is één pixel 8527 m, dus de
//  volle wobble is 1/1055 pixel — zestig keer kleiner dan Terra's eigen
//  zonpositiefout van 500 m. Deze module levert data voor een PLOT op zijn eigen
//  schaal, precies zoals IERS en USNO die zelf tekenen. Wie hier ooit een
//  ascorrectie op wil bouwen: meet eerst opnieuw, want het antwoord is nee.
//
//  BRON. IERS/USNO, gedistribueerd door CelesTrak. De reden voor die omweg is
//  hard gemeten: datacenter.iers.org stuurt géén CORS-header en
//  maia.usno.navy.mil is helemaal onbereikbaar, terwijl CelesTrak dezelfde reeks
//  serveert mét `access-control-allow-origin: *`. Dat het werkelijk dezelfde
//  reeks is, is nagerekend tegen twee gepubliceerde plots: over 51 dagen tot
//  2026-08-06 geeft dit bestand een padlengte van 54,3 mas tegen USNO's 53,7 en
//  een netto verplaatsing van 49,79 tegen 49,7.
// ============================================================

import { asset } from './config.js';

// ---- Schaal -----------------------------------------------------------------

// Meter aan het aardoppervlak per boogseconde poolverplaatsing. R/206264,806 met
// R de gemiddelde aardstraal van de IUGG. Deze constante is de enige reden dat een
// plot van dit verschijnsel iets betekent; zonder omrekening naar meters is een
// getal in mas een abstractie.
export const AARDSTRAAL_M = 6371008.7714;
export const M_PER_ARCSEC = AARDSTRAAL_M / 206264.806;   // 30,888 m
export const MM_PER_MAS = M_PER_ARCSEC;                  // dezelfde noemer, andere eenheid

// ---- Bronnen ----------------------------------------------------------------

// De vijfjaarsreeks en niet EOP-All.csv: die laatste is 2,4 MB tegen 225 KB en
// begint in 1962. Voor het lange verhaal is er het gebakken jaargemiddelde
// hieronder, dat 2,8 KB kost en tot 1900 teruggaat.
export const CELESTRAK_URL = 'https://celestrak.org/SpaceData/EOP-Last5Years.csv';
export const LANG_SPOOR_URL = 'assets/geo/pole-mean-1900.csv';

// Zes uur. De reeks wordt één keer per dag bijgewerkt, dus vaker halen levert
// niets en 225 KB is geen kleinigheid op een telefoon.
const VERVERS_MS = 6 * 3600 * 1000;
// Na een mislukte poging niet blijven rammen, maar ook niet definitief opgeven:
// een gebruiker die even geen netwerk had verdient een tweede kans.
const OPNIEUW_NA_FOUT_MS = 60 * 1000;

// ---- Staat ------------------------------------------------------------------

let staat = 'leeg';        // leeg | laden | ok | fout
let rijen = null;          // dagelijkse punten, oplopend
let mjd0 = 0;              // MJD van rijen[0], zodat opzoeken O(1) is
let laatsteObs = null;     // laatste rij met type 'observed'
let opgehaaldOp = 0;
let mislukteOp = 0;
let lopend = null;         // de lopende fetch, zodat er nooit twee tegelijk zijn
let langSpoor = null;      // jaargemiddelden 1900-nu
let langLopend = null;

export function eopStatus() {
  return {
    staat,
    punten: rijen ? rijen.length : 0,
    laatsteObservatie: laatsteObs ? laatsteObs.datum : null,
    van: rijen ? rijen[0].datum : null,
    tot: rijen ? rijen[rijen.length - 1].datum : null
  };
}

// ---- Laden ------------------------------------------------------------------

// LUI, en dat is een ontwerpkeuze: 225 KB hoort niet in de opstartkost van een app
// die al 2,5 MB aan texturen laadt. Deze functie wordt aangeroepen als de sectie
// opengaat of de laag aangaat, niet bij init.
export async function laadEOP() {
  const nu = Date.now();
  if (staat === 'ok' && nu - opgehaaldOp < VERVERS_MS) return true;
  if (staat === 'fout' && nu - mislukteOp < OPNIEUW_NA_FOUT_MS) return false;
  if (lopend) return lopend;

  staat = rijen ? staat : 'laden';
  lopend = (async () => {
    try {
      const r = await fetch(CELESTRAK_URL, { cache: 'default' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const ontleed = ontleedCelestrak(await r.text());
      if (!ontleed.length) throw new Error('lege reeks');
      rijen = ontleed;
      mjd0 = rijen[0].mjd;
      laatsteObs = [...rijen].reverse().find(p => p.type === 'observed') || null;
      opgehaaldOp = Date.now();
      staat = 'ok';
      return true;
    } catch (e) {
      // Alleen naar 'fout' als er nog niets ligt. Een mislukte verversing mag een
      // werkende reeks van zes uur oud niet wegvagen; oude data is hier veel beter
      // dan geen data, want de pool beweegt 1 mas per dag.
      if (!rijen) staat = 'fout';
      mislukteOp = Date.now();
      return false;
    } finally {
      lopend = null;
    }
  })();
  return lopend;
}

// LET OP: het CSV van CelesTrak heeft CRLF-regeleindes. De laatste kolom DATA_TYPE
// is daardoor "O\r" en elke vergelijking op 'O' faalt STIL — de eerste meting op
// 2026-08-06 telde zo 0 waarnemingen van 2225. Vandaar de replace vóór het splitsen.
export function ontleedCelestrak(tekst) {
  const regels = tekst.replace(/\r/g, '').trim().split('\n');
  const kop = regels[0].split(',');
  const kX = kop.indexOf('X'), kY = kop.indexOf('Y'), kD = kop.indexOf('DATE');
  const kM = kop.indexOf('MJD'), kL = kop.indexOf('LOD'), kU = kop.indexOf('UT1-UTC');
  const kT = kop.indexOf('DATA_TYPE');
  if (kX < 0 || kY < 0 || kM < 0) return [];

  const uit = [];
  for (let i = 1; i < regels.length; i++) {
    const c = regels[i].split(',');
    if (c.length < kop.length) continue;
    const x = +c[kX], y = +c[kY];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    uit.push({
      datum: c[kD],
      mjd: +c[kM],
      x, y,                       // boogseconden
      lod: kL >= 0 ? +c[kL] : NaN, // seconden bovenop 86400
      ut1utc: kU >= 0 ? +c[kU] : NaN,
      // 'O' = observed, 'P' = predicted. Dat onderscheid is echt: de reeks loopt
      // een half jaar vooruit, en een voorspelde poolstand hoort niet als meting
      // gepresenteerd te worden.
      type: kT >= 0 && c[kT] === 'P' ? 'predicted' : 'observed'
    });
  }
  return uit;
}

// ---- Opzoeken ---------------------------------------------------------------

// Modified Julian Date uit een JS-datum. 40587 is de MJD van 1970-01-01, het
// Unix-nulpunt. UTC en niets anders: EOP is per definitie in UTC, en de
// UTC-schakelaar van sessie 18 mag alleen de weergave raken, nooit de natuurkunde.
export function toMJD(date) {
  return date.getTime() / 86400000 + 40587;
}

// De poolstand op een moment. Lineair tussen de twee omliggende dagen — de reeks is
// dagelijks en de pool legt ongeveer 1 mas per dag af, dus een dagsprong zou in de
// plot als een trap te zien zijn.
//
// Geeft `null` buiten het bereik van de reeks. Dat is met opzet geen klemming: bij
// een moment van vóór 2021 is "de poolstand van 2021-01-01" geen benadering maar
// een onwaarheid, en de readout hoort dan gewoon te zeggen dat het niet bekend is.
export function polarMotionAt(date) {
  if (!rijen || !rijen.length) return null;
  const mjd = toMJD(date);
  const i = Math.floor(mjd - mjd0);
  if (i < 0 || i >= rijen.length - 1) {
    // De laatste dag zelf mag nog exact.
    if (i === rijen.length - 1) return { ...rijen[i], binnenBereik: true };
    return null;
  }
  const a = rijen[i], b = rijen[i + 1];
  const f = mjd - mjd0 - i;
  return {
    datum: a.datum,
    mjd,
    x: a.x + f * (b.x - a.x),
    y: a.y + f * (b.y - a.y),
    lod: a.lod + f * (b.lod - a.lod),
    ut1utc: a.ut1utc + f * (b.ut1utc - a.ut1utc),
    // WAAROM NIET "een van beide punten is voorspeld, dus voorspeld": de laatste
    // waarneming draagt de datum van vandaag 00:00 UT, dus élk moment later op de
    // dag interpoleert al deels naar het eerste voorspelde punt. Met die strenge
    // regel staat de melding voor het HEDEN permanent op amber, en dan zegt hij
    // niets meer. De grens ligt daarom een etmaal na de laatste waarneming: tot dan
    // is er een meting die deze dag dekt.
    type: laatsteObs && mjd > laatsteObs.mjd + 1 ? 'predicted' : 'observed',
    binnenBereik: true
  };
}

// De punten tussen twee momenten, voor de plot. Geeft de rijen zelf terug en geen
// kopieën: de plot leest alleen.
export function eopReeks(vanDate, totDate) {
  if (!rijen) return [];
  const a = toMJD(vanDate), b = toMJD(totDate);
  return rijen.filter(p => p.mjd >= a && p.mjd <= b);
}

// De afgelegde weg langs het spoor, in boogseconden. Dit is het getal dat het
// verschijnsel echt uitlegt: de verplaatsing is klein, de weg is dat niet.
export function eopPadLengte(punten) {
  let som = 0;
  for (let i = 1; i < punten.length; i++) {
    som += Math.hypot(punten[i].x - punten[i - 1].x, punten[i].y - punten[i - 1].y);
  }
  return som;
}

// ---- Het lange spoor --------------------------------------------------------

// Jaargemiddelden uit IERS EOP C01, gebakken tot een statisch bestand van 2,8 KB.
// Waarom gemiddelden: op de oorspronkelijke stap van 0,05 jaar overheerst de
// Chandler-wobble het beeld volledig en zie je 126 jaar spaghetti in plaats van de
// drift. Het jaargemiddelde middelt zowel de Chandler-periode van 1,19 jaar als de
// jaarlijkse term grotendeels weg en laat over wat er werkelijk wegdrijft.
//
// Via asset(), dus in de standalone komt hij van jsDelivr.
export async function laadLangSpoor() {
  if (langSpoor) return langSpoor;
  if (langLopend) return langLopend;
  langLopend = (async () => {
    try {
      const r = await fetch(asset(LANG_SPOOR_URL), { cache: 'default' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      langSpoor = ontleedLangSpoor(await r.text());
      return langSpoor;
    } catch (e) {
      return null;
    } finally {
      langLopend = null;
    }
  })();
  return langLopend;
}

export function ontleedLangSpoor(tekst) {
  const uit = [];
  for (const l of tekst.replace(/\r/g, '').split('\n')) {
    if (!l || l[0] === '#' || l.startsWith('year')) continue;
    const [j, x, y] = l.split(',');
    if (!Number.isFinite(+j)) continue;
    uit.push({ jaar: +j, x: +x, y: +y });
  }
  return uit;
}

export function langSpoorNu() { return langSpoor; }

// Hoe ver de GEMIDDELDE pool is weggedreven, van het eerste decennium naar het
// laatste. Decennia en niet losse jaren: één jaargemiddelde bevat nog een restje
// wobble, en rond 1900 bovendien een meetfout van 30 mas per punt. Het verschil is
// niet cosmetisch — jaar-op-jaar geeft 12,3 m, decennium-op-decennium 10,5 m, en
// alleen die tweede is een drift in plaats van een toevallige stand.
export function langSpoorDrift(spoor = langSpoor) {
  if (!spoor || spoor.length < 20) return null;
  const gem = (a) => ({
    x: a.reduce((s, p) => s + p.x, 0) / a.length,
    y: a.reduce((s, p) => s + p.y, 0) / a.length
  });
  const eerste = gem(spoor.slice(0, 10));
  const laatste = gem(spoor.slice(-10));
  const dx = laatste.x - eerste.x, dy = laatste.y - eerste.y;
  return {
    arcsec: Math.hypot(dx, dy),
    meter: Math.hypot(dx, dy) * M_PER_ARCSEC,
    // De lengtegraad waarheen hij schuift. x wijst naar Greenwich, y naar 90 graden
    // WEST, dus het teken van dy draait om voor een gewone oostelijke lengte.
    richting: Math.atan2(-dy, dx) * 180 / Math.PI,
    vanJaar: spoor[0].jaar, totJaar: spoor[spoor.length - 1].jaar
  };
}

// ---- Daglengte --------------------------------------------------------------

// LOD staat in dezelfde download en kost dus niets extra. De waarde is het
// OVERSCHOT op 86400 seconden, in seconden; in de praktijk enkele tienden van een
// milliseconde, en tegenwoordig geregeld negatief — de aarde draait sinds 2020
// sneller dan de definitie van de seconde, wat de reden is dat er over een negatieve
// schrikkelseconde wordt gesproken.
export function daglengteMs(date) {
  const p = polarMotionAt(date);
  if (!p || !Number.isFinite(p.lod)) return null;
  return p.lod * 1000;
}
