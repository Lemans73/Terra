/* ============================================================
   TERRA — De feed onder de magnetosfeer
   ------------------------------------------------------------
   Twee bronnen van NOAA SWPC, als gewone Terra-adapters:

     propagated solar wind   drijft pdyn, Bz, By, Bt en de sector
     planetary Kp            drijft de T89-band, en dus de geometrie

   WAAROM DIT BESTAND NAAST js/compute/magnetosphere/ STAAT EN NIET ERIN.
   Die map is een BYTE-IDENTIEKE kopie uit de PoC, en
   tools/check-magnetosphere-sync.mjs rekent elk .js-bestand daar dat niet in
   zijn herkomsttabel staat als drift. Terecht: het is een kopie, geen
   werkplaats. Dit bestand is van Terra en hoort er dus buiten.

   HET LEEST TerraData, HET VERVANGT HET NIET. `Data.Wind.parse`,
   `Data.KpIndex.parse` en `Data.Series.*` worden hier aangeroepen, niet
   overgeschreven — de 1498 asserties van de PoC toetsen precies die functies.
   Wat hier wél staat is de weg naar buiten: Terra haalt op via zijn eigen
   `pull()`, met zijn eigen timeout, zijn eigen verbindingsregel en zijn eigen
   poort. `Data.Net` doet dat ook, maar dan langs Terra heen — en dan staat er
   een bron in de app die in het verbindingenpaneel niet bestaat.

   ÉÉN DING DOET Data.Net WEL EN fetch().json() NIET: SWPC stuurt af en toe
   letterlijke NaN in JSON. Dat is geen geldige JSON en doodt het hele
   document. `Data.Net.sanitize` maakt er null van — nooit nul, want nul is een
   meting en null de afwezigheid ervan. Die stap komt hier terug als
   `parseText`, de haak die pull() daarvoor heeft.

   GEMETEN 2026-08-19, en de intervallen volgen eruit:
     propagated-solar-wind.json    1.188.231 B   etag + last-modified, max-age 60
     noaa-planetary-k-index.json       4.795 B   idem
   Beide met access-control-allow-origin: *.

   GOES ZIT HIER NIET IN, en dat is gemeten en geen vergetelheid. De
   magnetometerbestanden zijn 1,74 MB per toestel — driekwart van al het
   verkeer voor iets wat de VORM niet raakt: GOES is de meting waar het model
   tegenaan ligt, en dat is een lane in de tijdlijn (B4), geen invoer van Shue.
   Voor wie hem daar ophaalt: 7 dagen 1.828.308 B · 1 dag 260.406 B ·
   6 uur 65.419 B, alle drie op json/goes/<slot>/magnetometers-<venster>.json.
   ============================================================ */

/* Eén verbindingsregel voor beide bronnen, net als de vier swpc-adapters er
   één delen. Een eigen id en niet het gedeelde 'swpc': deze twee staan
   standaard UIT en schrijven dan `switched off` naar hun health-id — op de
   zonnevlekkenregel zou dat permanent verkeerd staan. Dezelfde reden die
   OVATION zijn eigen regel gaf. */
export const MSPHERE_HEALTH_ID = 'msphere';

export function createMagnetosphereFeed(deps) {
  const { Data, Physics, pull, setHealth, onUpdate } = deps;

  /* De voorraad, en daarnaast de afgeleide reeks. Hetzelfde patroon als
     `solarState` + `applySolarState()`: elke adapter schrijft in de voorraad en
     roept `herleid()`, zodat de volgorde waarin de twee antwoorden binnenkomen
     niet uitmaakt. */
  const supply = { wind: null, kpRows: null, nonNumbers: 0 };
  let series = null;

  /* De reeks: één rij per minuut op de AANKOMSTKLOK, met pdyn, r0 en de sector
     er al bij. `derive` weigert waar de meting ontbreekt — zie de lange noot in
     data.js: `null * v * v` is nul in JavaScript, en standoff(0, bz) geeft 23 Re
     uit een dichtheid die niet gemeten is.

     Zonder wind is er geen reeks. Niet een lege, maar géén: een lege reeks is
     een uitspraak ("er was niets") en dit is er geen. */
  function herleid() {
    series = supply.wind
      ? Data.Series.derive(Data.Series.build(supply.wind, supply.kpRows || []), Physics)
      : null;
    if (onUpdate) onUpdate();
  }

  /* De sanitizer van de PoC, als pull()-haak. De teller wordt bijgehouden en
     niet weggegooid: een bron die dit doet, doet het morgen weer, en dan hoor
     je het te weten. Hij komt in de verbindingsregel te staan. */
  function parseText(tekst) {
    const s = Data.Net.sanitize(tekst);
    if (s.nonNumbers) supply.nonNumbers += s.nonNumbers;
    return JSON.parse(s.text);
  }

  /* ÉÉN REGEL, ÉÉN TEKST — EN NIET DIE VAN WIE TOEVALLIG ALS LAATSTE SCHREEF.

     Beide adapters delen `healthId`, dus setHealth() overschrijft elkaar. Dat
     de wind won kwam alleen doordat hij 1,13 MB is en Kp 4,7 KB: het grote
     bestand landt later. Dat is geen ontwerp maar een gevolg, en het draait om
     zodra SWPC één keer traag is met het kleine bestand.

     Dus stelt de FEED de regel samen uit zijn eigen voorraad, en geven beide
     `health()`-haken hem terug. Wie er als laatste schrijft doet er dan niet
     meer toe.

     ÉÉN GEVAL BLIJFT BUITEN DEZE REGEL OM: valt een fetch om, dan schrijft
     pull() zelf `offline` naar de gedeelde id, met `offlineNote`. Een
     wegvallende Kp zet de regel dus vijf minuten op rood met de tekst
     "Kp unreachable" — waar tot de volgende windronde blijft staan. Waar,
     alleen met een zwaardere kleur dan het verdient. Dat is de prijs van één
     regel voor twee bronnen, en die is hier lager dan een tweede regel voor
     4,7 KB. */
  function healthNoot() {
    if (!supply.wind) return { state: 'offline', note: 'no solar wind — no model' };
    const n = supply.wind.rows.length;
    const reis = Math.round(supply.wind.medianTravelMin);
    let kern = n + ' min · ' + reis + ' min travel';
    if (supply.nonNumbers) kern += ' · ' + supply.nonNumbers + ' NaN repaired';
    // Zonder Kp valt T89 terug op band 2. Dat is een huiswaarde en hoort
    // gezegd te worden, ook al staat de vorm er gewoon.
    if (!supply.kpRows) return { state: 'warn', note: kern + ' · no Kp (T89 band 2)' };
    const laatste = supply.kpRows[supply.kpRows.length - 1];
    return { state: 'live', note: kern + ' · Kp ' + laatste.kp.toFixed(2) };
  }

  const adapters = {
    /* DE WIND IS DE ENIGE BRON DIE NIET OPTIONEEL IS. Zonder pdyn en Bz is er
       geen r0 en dus geen magnetopauze — dan hoort de app "limited
       connectivity" te melden en niet stilletjes iets anders te tonen. Dat is
       dezelfde snede die de PoC maakt: alleen `!out.wind` stopt het model.

       VIJF MINUTEN, EN DAT IS RUIMER DAN HET LIJKT. De feed is gepropageerd:
       elk monster draagt het moment waarop het de magnetosfeer BEREIKT, ~40 tot
       70 minuten na de meting op L1. Het monster dat bij "nu" hoort, zat dus al
       in de vorige download — toen was het nog onderweg. Opnieuw ophalen
       verlengt de staart vóór de wandklok en verandert niets aan wat je op dit
       moment ziet. 1,13 MB per ronde, en alleen zolang de state open staat. */
    msphereWind: {
      layers: [], healthId: MSPHERE_HEALTH_ID, interval: 5 * 60_000,
      enabled: false,
      url: Data.Wind.url,
      parseText,
      normalize(json) {
        // `parse` geeft null bij een onleesbare payload. Dat is geen fout om te
        // gooien — pull() zou hem dan als netwerkstoring melden — maar iets wat
        // `health` hieronder benoemt.
        supply.wind = Data.Wind.parse(json);
        herleid();
        return [];
      },
      // Draait ná normalize (pull() roept ze in die volgorde aan), dus hij leest
      // wat er zojuist is opgeslagen.
      health: healthNoot
    },

    /* KP IS WEL OPTIONEEL. T89 valt zonder Kp terug op band 2, en de PoC zet
       een ontbrekende Kp in `out.errors` zonder het model te stoppen. Drie uur
       per blok, dus een kwartier tussen de rondes is al royaal — 4,7 KB. */
    msphereKp: {
      layers: [], healthId: MSPHERE_HEALTH_ID, interval: 15 * 60_000,
      enabled: false, optional: true,
      offlineNote: 'Kp unreachable',
      url: Data.KpIndex.url,
      parseText,
      normalize(json) {
        supply.kpRows = Data.KpIndex.parse(json);
        herleid();
        return [];
      },
      health: healthNoot
    }
  };

  /* DE POORT. Zelfde vorm als syncAuroraLayer() in index.html, en om dezelfde
     reden: pull() slaat een adapter niet over omdat niemand ernaar kijkt —
     `active` komt in het hele haalpad niet voor. Zonder deze poort haalt Terra
     bij elke paginastart 1,19 MB op voor een state die dicht staat.

     Idempotent: alleen een echte overgang zet een verzoek in gang. Bij het
     uitzetten meteen de verbindingsregel bijwerken, anders blijft daar `live`
     staan tot het interval langskomt — een regel die zegt dat we een bron
     bevragen die we net hebben losgelaten. */
  function setEnabled(aan) {
    const wil = !!aan;
    for (const ad of Object.values(adapters)) {
      const was = ad.enabled !== false;
      ad.enabled = wil;
      if (wil && !was) pull(ad);
      if (!wil && was) setHealth(ad.healthId || ad.id, 'warn', 'switched off');
    }
  }

  return {
    adapters,
    setEnabled,

    /* De reeks, of null als er geen wind is. NIET een lege array: het verschil
       tussen "niets gemeten" en "gemeten dat er niets was" is precies waar dit
       hele blok over gaat. */
    rows: () => series,
    rowAt: (i) => (series && i >= 0 && i < series.length ? series[i] : null),

    /* Waar de METING ophoudt en de staart begint — alles daarna is gemeten maar
       nog onderweg. Dit is het monster waar de state op binnenkomt. */
    arrivedEnd: () => (series ? Data.Series.arrivedEnd(series) : -1),

    /* KLEMT AAN BEIDE KANTEN, en dat is de aanname van Data.Series.indexAt.
       Een tijd vóór de reeks geeft dus index 0 en niet "niets" — wie wil weten
       of een moment binnen het venster valt, vraagt `span()`. */
    indexAt: (t) => (series && series.length ? Data.Series.indexAt(series, t) : -1),

    span: () => (series && series.length
      ? { van: series[0].time, tot: series[series.length - 1].time }
      : null),

    status: () => ({
      wind: !!supply.wind,
      kp: !!supply.kpRows,
      rows: series ? series.length : 0,
      nonNumbers: supply.nonNumbers
    })
  };
}
