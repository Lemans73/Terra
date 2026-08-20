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

/* HET VENSTER SCHUIFT DOORLOPEND MEE EN VERSPRINGT NIET (sessie 31, Terry).

   Eerst bleef het staan tot de cursor de rand raakte en sprong het dan 90 %
   verder. Dat leest als haperen en niet als scrollen — en scrollen is wat het
   is: de schuiver van de transportbalk beslaat de hele week, de tijdlijn toont
   er een venster op.

   Nu duwt de cursor het venster zodra hij binnen deze marge van een rand komt,
   en geen pixel eerder. Een tiende, dus je houdt 80 % van het venster om in
   rond te kijken voordat er iets beweegt.

   BETAALBAAR, EN DAT IS GEMETEN. Elke verschuiving is een spec-herbouw:
   mediaan 3,1 ms bij 24 h en 8,7 ms bij 7 D — en dat laatste venster is de hele
   reeks en schuift dus nooit. Met de rem van 20 Hz is dat 62 ms rekenwerk per
   seconde slepen, 6 % van een kern. */
const MSPS_MARGE = 0.1;

/* ---------- De marges van het tekenvlak ----------------------------------

   `Chart.PAD` is 52 en byte-identiek, dus daar valt niets aan te draaien. Wat
   Terra wél kan is het tekenvlak VERSCHUIVEN: chart.js zet de asgetallen rechts
   uitgelijnd op `PAD - 5`, dus alles links van het breedste getal is loze
   ruimte. GEMETEN op de huidige lanes: het breedste getal is 21,7 px breed en er
   bleef 25,3 px leeg.

   Die ruimte wordt per herbouw OPNIEUW gemeten en niet als constante gezet: een
   lane die vandaag tot -100 loopt kan morgen -1000 halen, en een vaste
   verschuiving snijdt dat getal dan af — precies het soort fout dat je pas ziet
   als hij er al staat. `MSPS_LINKS_MIN` is wat er sowieso vrij blijft;
   `MSPS_RECHTS` is de lucht na de laatste meetwaarde, want daar stond de data
   tegen de rand. */
const MSPS_LINKS_MIN = 4;
const MSPS_RECHTS = 10;

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
  'saa':       '--msphere-saa',
  'band-ink':  '--msphere-band-ink'
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
  /* `inkt` OVERSCHRIJFT `lane.color`, en dat veld is bij chart.js precies één
     ding: de kleur van het LANE-LABEL (`c.fillStyle = lane.color || spec.ink`).
     Voor een balkenlane doet het verder niets — de balken tekenen uit
     `series[].color`. De sector is de enige lane waarvan het label altijd op een
     gekleurde band ligt, en daar is Terra's gewone inkt onleesbaar. */
  sector: { label: 'IMF sector',   beyond: 'no Bx or Bt', inkt: 'band-ink',
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

/* ---------- De sector in het Engels ---------------------------------------

   `data.js` bepaalt de sector en geeft hem terug als NEDERLANDSE tekst — dat
   bestand blijft byte-identiek, dus de vertaling gebeurt hier. Voor de LANE
   volstond `MSPS_TEKST.sector.series` (dat zijn twee vaste posities), maar de
   HOVER niet: `Strip.runAt` geeft de run terug zoals `sectorRuns` hem maakte,
   met zijn waarde als sleutel, en `Strip.draw` zet die waarde rechtstreeks in
   de captie.

   GEMETEN met een onderschepping op `fillText`: bij een gewone hertekening nul
   Nederlandse strings, bij een HOVER wél — en dat is precies waarom het pas na
   een sessie opviel. Wie hier iets toetst zonder de muis over de lane te bewegen,
   ziet niets.

   Deze tabel is ook de tabel die de uitlezing in index.html gebruikt; hij staat
   hier omdat de rest van de Engelse teksten hier al staat. Twee kopieën van
   dezelfde drie woorden lopen bij de eerste wijziging uit de pas. */
export const MSPHERE_SECTOR_TEKST = {
  'naar de zon':   'toward the Sun',
  'van de zon af': 'away from the Sun',
  'onbeslist':     'undecided'
};

export function createMagnetosphereStrip(deps) {
  /* `onMoment` IS DE TEGENHANGER VAN `onCursor` IN DE TRANSPORTBALK. Die balk
     was tot nu toe de enige die de cursor verzette en meldde het daarom als
     enige; sinds je de playhead kunt slepen is deze strip de tweede. Zonder
     deze haak blijft de schuiver staan waar hij stond terwijl het moment al
     verschoven is — twee besturingen die hetzelfde tonen en uit elkaar lopen. */
  const { state, feed, Core, Chart, Sector, StripLanes, moment,
          stopAfspelen, onMoment } = deps;

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
  /* De rechterrand van het venster, als geheugen. Zonder dat zou "meeschuiven"
     niet te onderscheiden zijn van "opnieuw uitrekenen": het venster moet
     kunnen BLIJVEN staan zolang de cursor er ruim in zit. `null` betekent nog
     niet geplaatst — dan hangt hij aan het nieuwste monster. */
  let vensterTot = null;

  /* Staat er een sleep in de tijdlijn zelf? Dan verschuift het venster NIET.

     GEMETEN, en het was de enige fout in dit blok: `timeAtX` klemt op
     [from, to], dus aan de linkerrand levert elke volgende beweging opnieuw
     `from` op — en de meeschuifregel duwt het venster dan bij elke stap een
     stukje verder. Over vijf stappen kroop het 7,4 uur weg, terwijl slepen
     juist NIET mag scrollen (Terry). De schuiver van de transportbalk is waar
     je door de week loopt; hierbinnen kies je een moment in wat er staat. */
  let sleept = false;

  function venster(rows) {
    const breedte = huidigVenster().ms;
    const eerste = rows[0].time, laatste = rows[rows.length - 1].time;
    const marge = breedte * MSPS_MARGE;
    const cursorTijd = rows[state.cursor()] ? rows[state.cursor()].time : laatste;

    if (vensterTot === null) vensterTot = laatste;
    // Komt de cursor binnen de marge van een rand, dan duwt hij het venster mee.
    // Tenzij de bezoeker in de tijdlijn zelf sleept — zie de noot bij `sleept`.
    if (!sleept) {
      if (cursorTijd > vensterTot - marge) vensterTot = cursorTijd + marge;
      else if (cursorTijd < vensterTot - breedte + marge) {
        vensterTot = cursorTijd + breedte - marge;
      }
    }
    /* En hij loopt niet buiten de reeks. De BOVENgrens eerst en de ondergrens
       daarna: bij een reeks die korter is dan het venster wint die laatste, en
       dan staat het venster op de hele reeks in plaats van erbuiten. */
    vensterTot = Math.min(vensterTot, laatste);
    vensterTot = Math.max(vensterTot, Math.min(laatste, eerste + breedte));

    const tot = vensterTot;
    return { van: Math.max(eerste, tot - breedte), tot };
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

  /* HOEVEEL HET TEKENVLAK NAAR LINKS MAG, gemeten en niet geschat.

     chart.js zet de asgetallen RECHTS uitgelijnd op `PAD - 5`, in 9px mono.
     Alles links van het breedste getal is loze ruimte. Meet dus dat getal en
     geef terug wat er weg kan, met `MSPS_LINKS_MIN` als wat sowieso vrij blijft.

     Waarom niet één keer bij het opzetten: de schalen hangen aan de DATA. Een
     lane die vandaag tot -100 loopt kan morgen -1000 halen, en een vaste
     verschuiving snijdt dat getal dan af — precies het soort fout dat je pas
     ziet als het te laat is. Dit kost één measureText per lane per herbouw. */
  function linkerSchuif(spec) {
    ctx.save();
    ctx.font = '9px ' + mono;
    let breedste = 0;
    for (const lane of spec.lanes) {
      const sc = lane.fixedScale;
      if (!sc) continue;
      for (const v of [sc.lo, sc.hi]) {
        const t = Chart.fmt ? Chart.fmt(v, sc.tick) : String(v);
        const w = ctx.measureText(String(t)).width;
        if (w > breedste) breedste = w;
      }
    }
    ctx.restore();
    const vrij = (Chart.PAD || 52) - 5 - breedste;
    return Math.max(0, vrij - MSPS_LINKS_MIN);
  }

  /* De verschuiving van de HUIDIGE tekening. Nodig buiten het tekenen om, want
     de muis wijst in canvascoördinaten en de grafiek staat verschoven. */
  let schuif = 0;

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

    /* DE BREEDTE WORDT NA DE BOUW BIJGESTELD, en dat mag omdat de twee dingen
       die eraan hangen niet dezelfde gevoeligheid hebben. Bij het BOUWEN stuurt
       `width` alleen de decimatie (hoeveel bakjes er in de plotbreedte passen),
       en die verandert hier met 11 px op 648 — anderhalve procent, ver onder
       één bakje. Bij het TEKENEN bepaalt hij waar de rechterrand ligt, en dát
       is wat we willen verzetten. Eén bouw dus, en niet twee: die tweede kostte
       3,1 ms voor anderhalve procent nauwkeuriger decimatie. */
    schuif = linkerSchuif(spec);
    spec.width = S.w + schuif - MSPS_RECHTS;
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
      if (t.inkt && palet[t.inkt + '_hex']) lane.color = palet[t.inkt + '_hex'];
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
    /* De sectorruns, voor de captie bij het aanwijzen. Hun waarde ÍS de sleutel
       waarmee `Strip.draw` de kleur opzoekt (`sectorTint[run.v]`), dus die map
       moet mee — anders staat er straks Engels in de captie met een streepje
       ervoor in plaats van de bandkleur.

       GOOIEN BIJ EEN ONBEKENDE WAARDE. `data.js` kent er drie en `sectorRuns`
       levert er twee; komt er ooit een vierde, dan is dat een sector die dit
       bestand niet kent, en die hoort op te vallen in plaats van in het
       Nederlands door te lekken. */
    const ov = spec.overlay;
    if (ov && ov.sectorRuns) {
      for (const run of ov.sectorRuns) {
        const en = MSPHERE_SECTOR_TEKST[run.v];
        if (!en) throw new Error('unknown IMF sector state: ' + run.v);
        run.v = en;
      }
      if (ov.sectorTint) {
        const tint = {};
        for (const [nl, kleur] of Object.entries(ov.sectorTint)) {
          tint[MSPHERE_SECTOR_TEKST[nl] || nl] = kleur;
        }
        ov.sectorTint = tint;
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
    if (spec.overlay) spec.overlay.hoverX = S.hoverX === null ? null : S.hoverX + schuif;
    /* WISSEN IN CANVASCOÖRDINATEN, TEKENEN IN GRAFIEKCOÖRDINATEN. De volgorde
       is niet vrij: na de translate ligt x = 0 buiten het canvas en zou
       clearRect een strook laten staan. */
    ctx.clearRect(0, 0, S.w, S.h);
    ctx.save();
    ctx.translate(-schuif, 0);
    StripLanes.draw(Chart, ctx, spec);
    ctx.restore();
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
    // Een andere breedte is een ander venster: opnieuw aanhaken op het nieuwste
    // monster in plaats van de oude rechterrand aanhouden.
    vensterTot = null;
    ongeldig();
    teken();
  }

  knopVenster?.addEventListener('click', () => zetVenster(vensterIndex + 1));

  /* ----------------------------------------------------------
     DE MUIS DOET TWEE DINGEN, EN HET VERSCHIL IS DE KNOP.

     Bewegen zonder knop is AANWIJZEN: de captie leest per lane uit wat er onder
     de cursor staat. Bewegen mét knop is HET MOMENT KIEZEN — de playhead volgt
     de vinger.

     SLEPEN SCROLT NIET (Terry, expliciet). `Chart.timeAtX` klemt zelf op
     [from, to], dus een sleep buiten het venster levert de rand op en niet een
     tijd erbuiten. Het venster verschuift dus niet mee; daar is de schuiver van
     de transportbalk voor.

     `clientX` MINUS DE DOOS EN NIET `offsetX`. Dat laatste stond er eerst en het
     is GEMETEN fout: in een paneel met een afwijkende schaalfactor liep `offsetX`
     op de halve snelheid mee en werd hij links van het midden zelfs negatief —
     bij een cursor 628 px in het element gaf hij 156. `getBoundingClientRect()`
     staat in dezelfde eenheden als `clientX`, dus dat verschil klopt per
     constructie, wat de pagina ook doet met zoom of schaal.

     Plus `schuif`, want de grafiek staat verschoven getekend — zie tekenNu.
  ---------------------------------------------------------- */
  function momentBijX(x) {
    const spec = S.spec, rows = feed.rows();
    if (!spec || !rows || !rows.length) return;
    const pad = Chart.PAD || 52;
    const t = Chart.timeAtX(x + schuif, spec.from, spec.to, pad, spec.width - pad);
    const i = feed.indexAt(t);
    if (i >= 0 && i !== state.cursor()) {
      // Wie zelf aanwijst, volgt niet meer automatisch het nieuwste monster.
      state.volgtNu(false);
      state.zetCursor(i);
      if (onMoment) onMoment();
    }
  }

  // De doos in dezelfde eenheden als `clientX`. Per gebeurtenis opgevraagd: hij
  // verandert bij elke resize, bij het openen van een paneel en bij het scrollen
  // van de pagina, en een gecachte waarde is dan stil fout.
  const xVanEvent = (e) => e.clientX - canvas.getBoundingClientRect().left;

  canvas.addEventListener('pointerdown', (e) => {
    sleept = true;
    /* Zonder capture raakt de sleep los zodra je buiten het canvas komt, en dat
       gebeurt bij een strip van 132 px hoog voortdurend. In een try: een
       pointerId die niet actief is (een nagebootste gebeurtenis in een toets)
       laat dit gooien, en dat mag de sleep niet meenemen. */
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* geen capture */ }
    if (stopAfspelen) stopAfspelen();
    const x = xVanEvent(e);
    S.hoverX = x;
    momentBijX(x);
    teken();
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    const x = xVanEvent(e);
    S.hoverX = x;
    if (sleept) momentBijX(x);
    teken();
  });

  const losLaten = (e) => {
    if (!sleept) return;
    sleept = false;
    if (canvas.releasePointerCapture && e && e.pointerId !== undefined) {
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* al los */ }
    }
  };
  canvas.addEventListener('pointerup', losLaten);
  canvas.addEventListener('pointercancel', losLaten);

  canvas.addEventListener('pointerleave', () => {
    if (sleept || S.hoverX === null) return;
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
    /* WELK STUK VAN DE DEKKING ER IN BEELD STAAT. De transportbalk tekent dat
       als bereik op zijn baan: die baan beslaat de hele reeks en het venster
       een deel ervan, en zonder dat beeld leest "24h gekozen, schuiver spant
       zeven dagen" als een fout in plaats van als een uitsnede. */
    bereik() {
      const rows = feed.rows();
      if (!rows || !rows.length || !S.spec) return null;
      return { van: S.spec.from, tot: S.spec.to,
               eerste: rows[0].time, laatste: rows[rows.length - 1].time };
    },
    // Voor het meetluik: de spec is de dure helft en moet te tellen zijn.
    spec: () => S.spec
  };
}
