/* ============================================================
   TERRA — De transportbalk van de magnetosfeer
   ------------------------------------------------------------
   Een schuiver en afspeelknoppen die niet over TIJD gaan maar over de
   GEMETEN REEKS. Dat is het verschil met het tijd-eiland, en het is de
   reden dat er twee zijn in plaats van één met een uitzondering erin.

   Het eiland zet een moment: elk moment, van 1985 tot ver in de toekomst,
   en de hele scene volgt. Hier bestaat maar één ding om door te lopen —
   de rijen die NOAA heeft gemeten, zeven dagen terug tot nu. Buiten die
   rijen is er geen magnetosfeer om te tonen, dus is er ook geen stand van
   de schuiver om erheen te wijzen. De grenzen van de baan ZIJN de
   dekking van de data, en dat is precies wat je van een baan wil kunnen
   aflezen.

   DE BAAN STOPT BIJ HET LAATSTE AANGEKOMEN MONSTER EN NIET BIJ HET LAATSTE
   MONSTER. De reeks loopt zo'n uur verder: de zonnewind is gepropageerd,
   dus de nieuwste metingen zijn gedaan maar nog onderweg. Ze staan in de
   data en de tijdlijn (B4) laat ze zien als staart — maar de holte tekenen
   op wind die de aarde nog niet bereikt heeft, is de toekomst tonen. Dat
   is een forecast, en die blijft er in v1 uit.

   HIJ HERGEBRUIKT DE KLASSEN VAN HET EILAND (`.ti-row`, `.ti-play`,
   `.play-btn`, `.range`) en niet zijn eigen stijl. Twee bedieningen die op
   dezelfde plek verschijnen en er anders uitzien, lezen als twee apps.
   Alle rooster- en mobielcorrecties van sessie 20, 25 en 26 gelden daarmee
   hier ook, zonder ze over te schrijven.
   ============================================================ */

/* DE DRIE STANDEN VAN DE PoC, IN DATA-MINUTEN PER SECONDE.

   Niet uur per seconde, en dat is meer dan een eenheid. Bij 6 h/s schuift het
   getoonde moment 360 minuten per seconde op: dan zie je een week voorbijkomen
   en geen magnetosfeer ademen. Bij 10 min/s duurt één omwenteling van de aarde
   veertien seconden, en dát is de schaal waarop de vorm iets doet.

   Het las bovendien als een TIJDSCHAAL — "24 h" naast "3 D" en "7 D" in de
   tijdlijn zegt hoe BREED het venster is, niet hoe snel het loopt. Twee dingen
   die op elkaar lijken en iets anders betekenen.

   De reeks staat op één rij per minuut, dus minuten/s IS rijen/s.
   Waarden en standaard uit de PoC: 1 / 10 / 20, standaard 10. */
const MSPT_SNELHEDEN = [1, 10, 20];     // data-minuten per seconde
const MSPT_STANDAARD = 1;               // index van 10 min/s

export function createMagnetosphereTransport(deps) {
  const { state, feed, fmtStamp, formatOffset } = deps;

  const el = (id) => document.getElementById(id);
  const wortel = el('msphere-time');
  if (!wortel) return null;

  const schuif = el('msp-slider');
  const knopTerug = el('msp-back');
  const knopPauze = el('msp-pause');
  const knopVooruit = el('msp-fwd');
  const knopMoment = el('msp-val');
  const knopSnelheid = el('msp-rate');

  let richting = 0;
  let snelheid = MSPT_STANDAARD;        // index in MSPT_SNELHEDEN
  let raf = null;
  let vorigeTijd = 0;

  const minPerSec = () => MSPT_SNELHEDEN[snelheid];

  /* Waar de baan ophoudt. Niet rows.length - 1: zie de kop. */
  function eindeBaan() {
    const i = feed.arrivedEnd();
    return i >= 0 ? i : 0;
  }

  /* ----------------------------------------------------------
     Afspelen.

     Dezelfde vorm als playStap() in index.html — rAF, een dt die na een
     tabwissel geklemd wordt, en de stand in de knop. Wat verschilt is de
     grens: daar loopt hij rond omdat een dag/nachtcyclus doorgaat, hier
     STOPT hij. Voorbij het laatste aangekomen monster is er niets meer
     gemeten, en rondlopen naar zeven dagen geleden zou een sprong zijn die
     zich voordoet als een stap.
  ---------------------------------------------------------- */
  function stap(nu) {
    if (!richting) return;
    const dt = Math.min(0.1, (nu - vorigeTijd) / 1000);
    vorigeTijd = nu;
    // Eén rij is één minuut op de aankomstklok, dus minuten/s IS rijen/s.
    const doel = state.cursor() + richting * minPerSec() * dt;
    const max = eindeBaan();
    if (doel <= 0 || doel >= max) {
      state.zetCursor(doel <= 0 ? 0 : max);
      // Aan de rand houdt het op, en de knop laat dat zien. Stilletjes blijven
      // draaien op een cursor die niet meer beweegt leest als een hapering.
      zetRichting(0);
      toon();
      return;
    }
    state.zetCursor(doel);
    toon();
    raf = requestAnimationFrame(stap);
  }

  function zetRichting(d) {
    richting = d;
    knopTerug?.classList.toggle('active', d === -1);
    knopVooruit?.classList.toggle('active', d === 1);
    if (knopPauze) knopPauze.disabled = d === 0;
    cancelAnimationFrame(raf);
    raf = null;
    // Wie zelf afspeelt, volgt niet meer automatisch het nieuwste monster —
    // anders trekt de eerstvolgende ronde van de feed je terug naar nu.
    if (d !== 0) {
      state.volgtNu(false);
      vorigeTijd = performance.now();
      raf = requestAnimationFrame(stap);
    }
  }

  /* ----------------------------------------------------------
     De balk bijwerken uit de stand van de state. ÉÉN RICHTING: de state
     bezit de cursor, deze balk toont hem. Andersom zou de schuiver een
     tweede waarheid worden, en dan is er altijd een pad waarlangs ze uit
     elkaar lopen.
  ---------------------------------------------------------- */
  function toon() {
    const rows = feed.rows();
    const max = eindeBaan();
    if (schuif) {
      schuif.max = String(max);
      schuif.value = String(state.cursor());
      schuif.disabled = !rows || max <= 0;
    }
    if (knopSnelheid) knopSnelheid.textContent = minPerSec() + ' min/s';

    if (!knopMoment) return;
    if (!rows) { knopMoment.textContent = 'no data'; return; }
    const rij = rows[state.cursor()];
    const nuRij = rows[max];
    if (!rij || !nuRij) { knopMoment.textContent = '—'; return; }
    // Het verschil met het laatste AANGEKOMEN monster, in dezelfde taal als
    // het eiland — daar is "now" ook het nulpunt en niet een absolute tijd.
    const off = rij.time - nuRij.time;
    const stamp = fmtStamp(new Date(rij.time),
      { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    knopMoment.textContent = off === 0 ? 'now' : `${formatOffset(off)} · ${stamp}`;
    knopMoment.classList.toggle('shifted', off !== 0);
  }

  /* Terug naar het nieuwste monster, en het automatisch meelopen weer aan.
     Twee dingen in één knop, en dat is hier juist: "nu" betekent voor een
     nowcast allebei. */
  function naarNu() {
    zetRichting(0);
    state.volgtNu(true);
    state.zetCursor(eindeBaan());
    toon();
  }

  schuif?.addEventListener('input', () => {
    zetRichting(0);
    state.volgtNu(false);
    state.zetCursor(parseInt(schuif.value, 10));
    toon();
  });
  knopTerug?.addEventListener('click', () => { zetRichting(richting === -1 ? 0 : -1); toon(); });
  knopVooruit?.addEventListener('click', () => { zetRichting(richting === 1 ? 0 : 1); toon(); });
  knopPauze?.addEventListener('click', () => { zetRichting(0); toon(); });
  knopMoment?.addEventListener('click', naarNu);
  knopSnelheid?.addEventListener('click', () => {
    snelheid = (snelheid + 1) % MSPT_SNELHEDEN.length;
    toon();
  });

  return {
    toon,
    /* Bij het verlaten van de state moet het afspelen stoppen. Zonder dit
       blijft de rAF-lus de cursor verzetten terwijl niemand kijkt — en die
       cursor stuurt de klok van de hele app. */
    stop: () => { zetRichting(0); toon(); }
  };
}
