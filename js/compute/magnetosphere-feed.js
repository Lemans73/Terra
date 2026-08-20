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
  const supply = { wind: null, kpRows: null, nonNumbers: 0,
                   // GOES (B4): de lengtegraden en de twee slots apart, want ze
                   // komen uit drie bestanden en in willekeurige volgorde binnen.
                   goesLon: null, goesMag: { primary: null, secondary: null } };
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


  /* ==========================================================
     GOES — DE METING WAAR HET MODEL TEGENAAN LIGT (B4, sessie 31).

     Drie adapters, en ze voeden de TIJDLIJN en niet de vorm. `Series.derive`
     kent GOES niet: Shue rekent met pdyn en Bz, en het magnetometersignaal op
     6,6 Re is waar je die uitkomst aan kunt houden. Daarom stond dit blok in
     sessie 30 bewust nog niet in de feed — het is driekwart van al het
     verkeer voor iets wat de magnetopauze niet verplaatst.

     DE PARSERS KOMEN UIT DE PoC, DE WEG NAAR BUITEN NIET. `Data.Goes.parseLon`
     en `parseMag` worden hier aangeroepen; `Data.Goes.read()` niet, want die
     haalt met `Net.json` op en gaat daarmee langs Terra's `pull()` heen — dan
     staat er een bron in de app die in het verbindingenpaneel niet bestaat.

     HET VENSTER STUURT WELK BESTAND, en dat is gemeten (sessie 30):
       7 dagen  1.828.308 B      1 dag  260.406 B      6 uur  65.419 B
     Dus 24 h haalt het dagbestand — 520 KB voor twee toestellen — en 3 D en
     7 D het weekbestand. Het interval staat op een KWARTIER en niet op vijf
     minuten: deze lane is context bij een venster van een dag tot een week, en
     de variatie binnen een kwartier is niet waar je naar kijkt. Wie hem ooit
     scherper wil hebben zonder het verkeer: het bestand van zes uur is 65 KB
     en dekt de rechterrand.
  ========================================================== */
  /* EENRICHTING, EN DAT IS MET OPZET. Wie het weekbestand eenmaal heeft, houdt
     het: het dekt het dagvenster ook, dus terugschakelen zou 520 KB kosten om
     mínder te weten. Zonder deze regel klappert het tussen 3,5 MB en 520 KB bij
     elke klik op de vensterkiezer. */
  let goesBestand = '1-day';

  /* De URL komt uit de bouwer van de PoC met het venster erin gewisseld, en
     niet uit een eigen samenstelling: dan kan het pad hier niet uit de pas gaan
     lopen met de kopie zodra SWPC iets verhuist. */
  const goesUrl = (slot) => Data.Goes.urlMag(slot).replace('7-day', goesBestand);

  function goesAdapter(slot) {
    return {
      layers: [], healthId: MSPHERE_HEALTH_ID, interval: 15 * 60_000,
      enabled: false, optional: true,
      offlineNote: 'GOES ' + slot + ' unreachable',
      // Een GETTER, want `pull()` leest `adapter.url` als waarde op het moment
      // van ophalen. Een vaste string zou het venster van bij het opzetten
      // vasthouden.
      get url() { return goesUrl(slot); },
      parseText,
      normalize(json) {
        supply.goesMag[slot] = Data.Goes.parseMag(json);
        goesBinnen();
        return [];
      },
      health: healthNoot
    };
  }

  /* GOES RAAKT DE REEKS NIET, dus geen `herleid()` — die rekent 10.008 rijen
     opnieuw door voor een lane die er niet in voorkomt. Alleen een seintje dat
     er iets te hertekenen is. */
  function goesBinnen() { if (onUpdate) onUpdate(); }

  /* De toestellen, samengesteld zoals `Data.Goes.read()` dat doet: lengtegraad
     erbij, terugval op de gepubliceerde slotpositie, en één keer per satelliet.
     Twee slots kunnen hetzelfde toestel zijn. */
  function goesLijst() {
    const lons = supply.goesLon || {};
    const uit = [];
    for (const slot of ['primary', 'secondary']) {
      const b = supply.goesMag[slot];
      if (!b) continue;
      let lon = lons[b.satellite];
      // GEPUBLICEERD ALS GRADEN WEST, POSITIEF — `parseLon` heeft ze al ontkend.
      // Letterlijk nemen zet het toestel 145 graden mis; dat bleef onzichtbaar
      // zolang alleen Hp gebruikt werd en viel om zodra He erbij kwam.
      if (!Number.isFinite(lon)) lon = Data.Goes.FALLBACK_LON[b.satellite];
      if (!Number.isFinite(lon)) continue;
      if (uit.some((o) => o.satellite === b.satellite)) continue;
      uit.push({ satellite: b.satellite, longitude: lon, rows: b.rows });
    }
    return uit;
  }

  /* De vensterkiezer vraagt hier om een breder bestand. Geeft terug of er iets
     in gang gezet is, zodat de aanroeper weet dat er data onderweg is.

     DE OUDE RIJEN BLIJVEN STAAN tot de nieuwe binnen zijn. Wissen zou de lane
     leeg maken gedurende de 3,5 MB die eronder wegloopt, en een lege lane leest
     als een instrument dat stilviel — precies de verwarring waar de
     `beyond`-arcering voor bestaat. */
  function zetGoesBreed() {
    if (goesBestand === '7-day') return false;
    goesBestand = '7-day';
    pull(adapters.msphereGoesPrimary);
    pull(adapters.msphereGoesSecondary);
    return true;
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
    },

    /* DE LENGTEGRAADFEED IS 307 BYTES EN VERANDERT ZELDEN — zes uur is royaal.
       Valt hij weg, dan neemt goesLijst() de gepubliceerde slotposities. Dat is
       geen verzinsel maar de tabel die NOAA zelf noemt, en zonder lengtegraad
       is er geen instrumentframe en dus geen lane. */
    msphereGoesLon: {
      layers: [], healthId: MSPHERE_HEALTH_ID, interval: 6 * 60 * 60_000,
      enabled: false, optional: true,
      offlineNote: 'GOES longitudes unreachable',
      url: Data.Goes.urlLon,
      parseText,
      normalize(json) {
        supply.goesLon = Data.Goes.parseLon(json);
        goesBinnen();
        return [];
      },
      health: healthNoot
    },

    msphereGoesPrimary: goesAdapter('primary'),
    msphereGoesSecondary: goesAdapter('secondary')
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

    /* WAT DE TIJDLIJN NODIG HEEFT EN DE SCENE NIET (B4).

       Ze stonden alle drie al binnen; ze kwamen alleen niet naar buiten. De
       reeks draagt pdyn, r0 en de sector, maar de Kp-lane tekent BLOKKEN uit de
       ruwe index (een stapfunctie van drie uur mag geen helling krijgen) en de
       GOES-lane heeft de rijen per toestel nodig. `KpIndex` gaat mee omdat
       `Strip.spec` hem aanroept voor de scheiding tussen gepubliceerd en nog
       vullend — twee soorten zekerheid die niet dezelfde inkt horen te krijgen. */
    kpRows: () => supply.kpRows,
    goes: goesLijst,
    KpIndex: Data.KpIndex,

    /* De vensterkiezer van de tijdlijn vraagt hierom zodra hij voorbij 24 uur
       gaat. Zie de noot bij goesBestand: eenrichting. */
    zetGoesBreed,
    goesBestand: () => goesBestand,

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
