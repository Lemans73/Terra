/* ============================================================
   TERRA — Het TERRA MODEL-venster: de tijdlijn onder de scene
   ------------------------------------------------------------
   Zes lanes die samen één vraag beantwoorden, en het is de enige vraag
   die de 3D-scene niet kan stellen: WAAROM staat de magnetopauze daar?
   De scene toont één moment; deze strip toont wat er aan dat moment
   voorafging, en in welke volgorde. Bz eerst, dan de druk, dan de grens
   die eruit volgt.

   WAT HIER STAAT IS DE KOPPELING EN NIET DE TEKENING. De lanes leven in
   js/compute/magnetosphere/strip.js en de tekentaal in chart.js — allebei
   BYTE-IDENTIEK aan de PoC, en tools/check-magnetosphere-sync.mjs bewaakt
   dat. Wat Terra moet leveren is: een canvas met een maat, een palet, een
   venster, wanneer er hertekend wordt, en de muis.

   DE ZES LANES, en de IMF-sector ÍS er een van — niet een zevende:
     Bz          MEASURED   het teken draagt de hele fysica
     IMF-sector  MEASURED   categorisch, met een derde toestand die een
                            WEIGERING is en dus geen derde kleur krijgt
     dyn. druk   DERIVED    volgt uit dichtheid maal snelheid in het kwadraat
     standoff r0 MODEL      Shue, en het getal dat de scene tekent
     GOES extern MEASURED   de meting waar dat model tegenaan ligt
     Kp          MEASURED   een STAPFUNCTIE — een lijn tussen blokmiddens
                            verzint een helling van drie uur die niet bestaat

   DE SPEC IS EEN FUNCTIE VAN DE DATA, DE PLAYHEAD VAN DE INTERACTIE.
   Die twee horen niet in dezelfde bouwstap. De PoC mat 14,2 ms van de
   17,4 ms in het bouwen van ~100.000 puntobjecten, en die veranderen niet
   als de cursor beweegt. Alleen een nieuwe reeks, een ander venster of een
   andere canvasmaat maakt de spec ongeldig.
   ============================================================ */

/* ---------- Het venster ---------------------------------------------------

   DRIE BREEDTES, EN ZE KOSTEN NIET HETZELFDE. GOES ligt bij SWPC in drie
   bestanden: 7 dagen 1.828.308 B · 1 dag 260.406 B · 6 uur 65.419 B (gemeten
   sessie 30). Bij 24 h volstaat het dagbestand; 3 D en 7 D vragen het
   weekbestand, en dat is zeven keer zoveel verkeer. Vandaar dat de kiezer de
   feed erom VRAAGT in plaats van het altijd op te halen — zie zetGoesBreed
   in js/compute/magnetosphere-feed.js, en let op dat die escalatie
   eenrichting is.

   `24h` en niet `24 h`: naast de snelheidsknop ("10 min/s") moet in één
   oogopslag duidelijk zijn dat dit een BREEDTE is en geen tempo. Dat de twee
   op elkaar lijken is precies waarom de snelheidsknop in sessie 30 van uren
   naar minuten per seconde ging. */
const MSPS_VENSTERS = [
  { id: '24h', label: '24h', ms: 24 * 3600e3,     breed: false },
  { id: '3d',  label: '3d',  ms: 3 * 24 * 3600e3, breed: true  },
  { id: '7d',  label: '7d',  ms: 7 * 24 * 3600e3, breed: true  }
];
const MSPS_STANDAARD = 0;

/* Waar het venster de cursor kwijtraakt, schuift het mee — en dan komt de
   cursor op een tiende van de linkerrand te staan. Niet op de rand zelf: dan
   herankert hij bij elke volgende stap opnieuw, en een spec-herbouw kost meer
   dan de hele tekening. */
const MSPS_MARGE = 0.1;

/* ---------- Het palet -----------------------------------------------------

   `strip.js` vraagt elf sleutels. Drie ervan zijn Terra's eigen inkt
   (`--ink`, `--ink-dim`, `--ink-faint`); de acht andere zijn van deze state en
   dragen daarom een voorvoegsel — een globale `--model` of `--edge` zou in een
   app met dertig lagen vroeg of laat iets anders gaan betekenen.

   EEN ONTBREKENDE KLEUR TEKENT ZWART, EN DAT IS STIL. Vandaar dat dit hard
   stopt in plaats van terug te vallen: een lane die er is maar onzichtbaar
   blijft, is erger dan een lane die ontbreekt met een melding erbij. Dezelfde
   afweging die de PoC maakt. */
const MSPS_PALET = {
  'ink':       '--ink',
  'ink-dim':   '--ink-dim',
  'ink-faint': '--ink-faint',
  'edge':      '--msphere-edge',
  'measured':  '--msphere-measured',
  'derived':   '--msphere-derived',
  'model':     '--msphere-model',
  'goes':      '--msphere-goes',
  'open':      '--msphere-open',
  'mp':        '--msphere-mp',
  'saa':       '--msphere-saa'
};

/* ---------- De Engelse teksten -------------------------------------------

   De lanes in strip.js zijn Nederlands, en dat bestand blijft byte-identiek —
   hernoemen zou er een fork van maken en dan toetsen de 1498 PoC-asserties
   iets anders dan Terra draait. Dus overschrijft Terra de teksten NA `spec()`.

   Vier soorten tekst komen op het scherm: het lane-label, de `beyond`-zin (die
   in de captie belandt), de serielabels van de twee balklanes, en het merkteken
   op de r0-lane. Wie hier een lane toevoegt en dit vergeet, ziet Nederlands in
   een Engelse app — zichtbaar, en dus niet stil. */
const MSPS_TEKST = {
  bz:     { label: 'Bz',           beyond: 'no solar wind' },
  sector: { label: 'IMF sector',   beyond: 'no Bx or Bt',
            series: ['toward the Sun', 'away from the Sun'] },
  pdyn:   { label: 'Dyn. pressure', beyond: 'no density or speed' },
  r0:     { label: 'Standoff r₀',  beyond: 'no model without wind',
            marks: ['GOES 6.62 Re'] },
  goes:   { label: 'GOES external',
            beyond: 'the magnetosphere is not measured in the future' },
  kp:     { label: 'Kp',
            beyond: 'index not published yet · T89 falls back to band 2',
            series: ['published', 'still filling'] }
};

/* ONDER DEZE PLOTBREEDTE VERVALLEN DE SERIELABELS.

   chart.js zet ze op een rij bovenin de lane, en de GOES-lane heeft er zes:
   "G19 Hp G19 He G19 Hn G18 Hp G18 He G18 Hn". Op een monospace van tien pixels
   is dat ruim 380 px plus tussenruimte — het past op de 596 px die een breed
   scherm overhoudt, en op de 303 px van een telefoon in portret loopt het dwars
   over de meetlijnen heen. Gemeten op 375x812: onleesbaar.

   Ze vervallen en de LANE-labels niet, en dat is de hele afweging. Een serielabel
   is legenda — welke van de zes lijnen is welke — en legenda hoort op een smal
   scherm in de Details-tab (B5), niet over de data gestempeld. Een lane-label
   zegt WAT je ziet, en zonder dat is een grafiek een decoratie.

   De `beyond`-zinnen blijven ook: die zeggen waarom een lane STOPT, en dat is
   precies wat je anders voor een stilgevallen instrument aanziet. chart.js laat
   ze zelf weg als ze niet passen. */
const MSPS_LABELS_VANAF = 450;

export function createMagnetosphereStrip(deps) {
  const { state, feed, Core, Chart, Sector, StripLanes, moment } = deps;

  const canvas = document.getElementById('msphere-strip');
  const knopVenster = document.getElementById('msp-window');
  if (!canvas || !Chart || !StripLanes) return null;

  const ctx = canvas.getContext('2d');

  /* Het palet, één keer bij het opzetten. `getComputedStyle` op de wortel leest
     de variabelen zoals de stylesheet ze uiteindelijk zet — niet zoals ze in
     een regel staan die misschien overschreven is. */
  const palet = (() => {
    const cs = getComputedStyle(document.documentElement);
    const uit = {}, ontbreekt = [];
    for (const [sleutel, css] of Object.entries(MSPS_PALET)) {
      const rauw = cs.getPropertyValue(css).trim();
      if (!rauw) { ontbreekt.push(css); continue; }
      uit[sleutel + '_hex'] = rauw;
    }
    /* GOOIEN EN NIET TERUGVALLEN. De aanroeper vangt hem en schrijft hem naar
       de console; wat de bezoeker ziet is een leeg vlak waar de tijdlijn hoort.
       Dat gat is de eigenlijke vangrail — een lane die er is maar in het zwart
       tekent, mist niemand. */
    if (ontbreekt.length) {
      throw new Error('the timeline palette is incomplete: ' + ontbreekt.join(', '));
    }
    return uit;
  })();

  const mono = getComputedStyle(document.documentElement)
    .getPropertyValue('--mono').trim() ||
    'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  let vensterIndex = MSPS_STANDAARD;
  const huidigVenster = () => MSPS_VENSTERS[vensterIndex];

  /* ----------------------------------------------------------
     De staat van het tekenen. `spec` is de dure helft en wordt bewaard;
     `vuil` zegt alleen dat er hertekend moet worden.
  ---------------------------------------------------------- */
  const S = { spec: null, vuil: true, hoverX: null, w: 0, h: 0, dpr: 0,
              laatsteTeken: 0, wachtend: null };

  const ongeldig = () => { S.spec = null; S.vuil = true; };

  /* ----------------------------------------------------------
     HET VENSTER, EN WAAR HET AAN HANGT.

     Het eindigt op het laatste monster van de reeks — inclusief de staart die
     nog onderweg is, want die is gemeten en hoort in beeld. Valt de cursor
     erbuiten omdat de bezoeker terugschuift, dan schuift het venster mee.

     Bij 7 D schuift er dus nooit iets: dat venster is de hele reeks.
  ---------------------------------------------------------- */
  function venster(rows) {
    const breedte = huidigVenster().ms;
    const eerste = rows[0].time, laatste = rows[rows.length - 1].time;
    let tot = laatste, van = tot - breedte;
    const cursorTijd = rows[state.cursor()] ? rows[state.cursor()].time : laatste;
    if (cursorTijd < van) {
      van = cursorTijd - breedte * MSPS_MARGE;
      tot = van + breedte;
    }
    if (van < eerste) { van = eerste; tot = Math.min(laatste, van + breedte); }
    return { van, tot };
  }

  /* DE RIJEN WORDEN GESNEDEN EN NIET ALLEEN BEGRENSD.

     `spec()` neemt `from` en `to`, maar `pluck()` in strip.js zet ÉLKE rij om en
     `decimateMinMax` verdeelt daarna de plotbreedte over alles wat het krijgt.
     Geef je de volle 10.008 rijen mee met een venster van 24 uur, dan gaan zes
     zevende van de bakjes naar meetwaarden die buiten beeld vallen en houdt het
     zichtbare etmaal er nog een zevende over. `goesSeries` filtert wél zelf —
     dat is de uitzondering, niet de regel. */
  function snijd(rows, van, tot) {
    let a = 0, b = rows.length - 1;
    while (a < rows.length && rows[a].time < van) a++;
    while (b >= 0 && rows[b].time > tot) b--;
    return rows.slice(a, b + 1);
  }

  /* ----------------------------------------------------------
     De canvasmaat. Een canvas is een VERVANGEN ELEMENT: zonder expliciete
     CSS-doos valt hij terug op zijn intrinsieke breedte — het attribuut dat we
     hier net op w × dpr zetten. De doos staat daarom in de stylesheet en het
     bufferattribuut hier, en `setTransform` brengt de tekencoördinaten terug
     naar CSS-pixels.
  ---------------------------------------------------------- */
  function meetCanvas() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w === S.w && h === S.h && dpr === S.dpr) return;
    S.w = w; S.h = h; S.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    // Een resize wist de contexttoestand, dus de transform moet hierna.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ongeldig();
  }

  function bouwSpec(rows) {
    const { van, tot } = venster(rows);
    const inVenster = snijd(rows, van, tot);
    const d = moment ? moment() : new Date();
    const coeff = Core.IGRF.atYear(Core.Frames.decimalYear(d));

    const spec = StripLanes.spec({
      rows: inVenster,
      kpRows: feed.kpRows(), KpIndex: feed.KpIndex,
      goes: feed.goes(),
      Core, Sector, Chart, coeff,
      palette: palet,
      width: S.w, height: S.h,
      from: van, to: tot
    });
    spec.fmtTick = StripLanes.fmtTick;
    spec.fmtTime = StripLanes.fmtTime;
    spec.mono = mono;
    vertaal(spec);
    return spec;
  }

  /* De Engelse teksten eroverheen. Op `id` en niet op volgorde: een lane die in
     strip.js verschuift, mag hier niet stilzwijgend het label van zijn buurman
     krijgen. */
  function vertaal(spec) {
    const smal = (spec.width - (Chart.PAD || 52)) < MSPS_LABELS_VANAF;
    for (const lane of spec.lanes) {
      const t = MSPS_TEKST[lane.id];
      if (!t) continue;
      if (t.label) lane.label = t.label;
      if (t.beyond) lane.beyond = t.beyond;
      if (smal && lane.series) {
        for (const serie of lane.series) if (serie.label) serie.label = '';
      } else if (t.series && lane.series) {
        for (let i = 0; i < lane.series.length && i < t.series.length; i++) {
          if (lane.series[i].label) lane.series[i].label = t.series[i];
        }
      }
      if (t.marks && lane.marks) {
        for (let i = 0; i < lane.marks.length && i < t.marks.length; i++) {
          lane.marks[i].label = t.marks[i];
        }
      }
    }
    // De captie leest uit `overlay.notes`, met een eigen kopie van label en zin.
    const notes = spec.overlay && spec.overlay.notes;
    if (!notes) return;
    for (const n of notes) {
      const t = MSPS_TEKST[n.id];
      if (!t) continue;
      if (t.label) n.label = t.label;
      if (t.beyond) n.beyond = t.beyond;
    }
  }

  /* ----------------------------------------------------------
     TEKENEN, MET EEN NASLEPENDE REM VAN 20 Hz.

     Tijdens afspelen verschuift de cursor elke frame, dus zonder rem hertekent
     hij zestig keer per seconde een grafiek waarvan alleen de playhead beweegt.
     Maar de rem MAG NIETS LATEN VALLEN: een enkele klik op de schuiver die
     toevallig binnen 50 ms van de vorige tekening valt, moet alsnog op het
     scherm komen. Vandaar naslepend en niet weggooiend — er staat altijd nog
     één tekening gepland.
  ---------------------------------------------------------- */
  const MSPS_REM_MS = 50;

  function teken() {
    const rows = feed.rows();
    if (!rows || !rows.length) return;
    meetCanvas();
    if (S.w < 40) return;

    const nu = performance.now();
    const sinds = nu - S.laatsteTeken;
    if (sinds < MSPS_REM_MS) {
      if (!S.wachtend) {
        S.wachtend = setTimeout(() => { S.wachtend = null; teken(); },
                                MSPS_REM_MS - sinds);
      }
      return;
    }
    S.laatsteTeken = nu;

    if (!S.spec) S.spec = bouwSpec(rows);
    const spec = S.spec;

    /* Het venster kan verschoven zijn doordat de cursor eruit liep. Dat is een
       ANDERE spec en geen andere playhead, dus hier opnieuw bouwen — één keer,
       en daarna staat hij weer stil tot de cursor de rand weer haalt. */
    const w = venster(rows);
    if (w.van !== spec.from || w.tot !== spec.to) {
      S.spec = bouwSpec(rows);
      return tekenNu();
    }
    tekenNu();
  }

  function tekenNu() {
    const rows = feed.rows();
    const spec = S.spec;
    if (!spec || !rows) return;
    spec.playhead = rows[state.cursor()] ? rows[state.cursor()].time : null;
    /* In `overlay` en niet in `spec.hoverX`: dat laatste veld laat chart.js zijn
       eigen uitleesvenster tekenen, en de waarden staan hier per lane. */
    if (spec.overlay) spec.overlay.hoverX = S.hoverX;
    ctx.clearRect(0, 0, S.w, S.h);
    StripLanes.draw(Chart, ctx, spec);
    S.vuil = false;
  }

  /* ----------------------------------------------------------
     De bediening.
  ---------------------------------------------------------- */
  function zetVenster(i) {
    vensterIndex = ((i % MSPS_VENSTERS.length) + MSPS_VENSTERS.length) % MSPS_VENSTERS.length;
    const v = huidigVenster();
    if (knopVenster) knopVenster.textContent = v.label;
    // Voorbij een etmaal heeft de GOES-lane het weekbestand nodig. De feed
    // beslist zelf of er iets op te halen valt; escalatie is eenrichting.
    if (v.breed && feed.zetGoesBreed) feed.zetGoesBreed();
    ongeldig();
    teken();
  }

  knopVenster?.addEventListener('click', () => zetVenster(vensterIndex + 1));

  /* De muis. `offsetX` en niet clientX minus de doos: dat eerste rekent de
     schaal van het element al mee, en dit canvas is op een telefoon smaller dan
     zijn buffer. */
  canvas.addEventListener('pointermove', (e) => {
    S.hoverX = e.offsetX;
    teken();
  });
  canvas.addEventListener('pointerleave', () => {
    if (S.hoverX === null) return;
    S.hoverX = null;
    teken();
  });

  window.addEventListener('resize', () => { meetCanvas(); teken(); });

  return {
    /* De cursor is verzet, of er is nieuwe data. Beide gaan langs `teken()`:
       de eerste hertekent alleen de playhead, de tweede bouwt de spec opnieuw
       omdat `nieuweData` hem via `ongeldig()` heeft weggegooid. */
    toon: teken,
    nieuweData() { ongeldig(); teken(); },
    /* Bij het verlaten van de state: de naslepende tekening mag niet doorlopen
       op een state die dicht staat. */
    stop() {
      if (S.wachtend) { clearTimeout(S.wachtend); S.wachtend = null; }
      S.hoverX = null;
    },
    zetVenster,
    venster: () => huidigVenster().id,
    // Voor het meetluik: de spec is de dure helft en moet te tellen zijn.
    spec: () => S.spec
  };
}
