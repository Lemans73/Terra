/* ============================================================
   TERRA — De camerastand, in het chroom en niet in een paneel
   ------------------------------------------------------------
   Geen three.js, geen scene-kennis, geen netwerk. Deze module kent
   alleen `viewStates` en een stuk DOM — dezelfde snede als js/ui/nav.js.

   WAAROM DIT BESTAAT (sessie 31, na Terry's test op een telefoon).
   Een besturing die verandert hoe de scene ERUITZIET, mag niet op een
   vlak staan dat de scene bedekt. Op 375x812 dekt een open paneel de
   scene op een strook van ~47 px na, en de camerastand zat in zo'n
   paneel: openen, wisselen, sluiten, kijken — en tijdens het wisselen
   zie je precies niet wat je aan het wisselen bent.

   Terra kende dat onderscheid al. `.mode-switch` en de knoppenrij zijn
   chroom; ze staan er altijd en bedekken niets. De camerastand viel
   daarbuiten doordat `nav.js` zichzelf uit het register bouwt — goed
   voor vindbaarheid, verkeerd voor iets wat je vaak gebruikt.

   ÉÉN GLEUF, ÉÉN BETEKENIS: WELKE WEERGAVE VAN HET ONDERWERP.
   Bovenaan het midden stond de bolweergave (Realistic/Expert). Die
   gleuf is in de magnetosfeer al leeg en in Space zegt hij niets — de
   bol is daar weg. Hij draagt nu de camerastand zodra de actieve state
   standen heeft, en anders de bolweergave. Geen nieuwe schermruimte,
   geen vierde onderrand om te onderhouden.

   TWEE BESTURINGEN OP HETZELFDE REGISTER IS GEEN TWEEDE WAARHEID.
   Navigate houdt zijn standenrijen. Beide lezen `viewStates` en beide
   schrijven via `goToView`; beide hangen aan `onChange`. Wat wél een
   tweede waarheid zou zijn, is een van de twee die zijn eigen stand
   bijhoudt — en dat gebeurt hier niet, want er wordt herbouwd en niet
   bijgewerkt. Zelfde afweging als in nav.js.
   ============================================================ */

export function createViewSwitch(opts) {
  const { viewStates, host } = opts;
  if (!host) return null;

  /* HERBOUWEN, NIET BIJWERKEN. Het zijn hooguit vier knoppen, dus per
     wijziging opnieuw opbouwen kost niets en scheelt een tweede waarheid over
     welke stand nu actief is. */
  function bouw(actief, view) {
    const def = actief ? viewStates.list().find((s) => s.key === actief) : null;
    const views = def && def.views ? def.views : [];

    /* MINDER DAN TWEE STANDEN IS GEEN KEUZE. De zon heeft er geen; een state
       met er één zou een knop krijgen die alleen zichzelf kan aanwijzen. In
       beide gevallen blijft de gleuf leeg en valt de bolweergave terug op zijn
       eigen regel in de stylesheet. */
    host.textContent = '';
    if (views.length < 2) { host.hidden = true; return; }
    host.hidden = false;

    for (const v of views) {
      const aan = v.name === view;
      const knop = document.createElement('button');
      knop.type = 'button';
      knop.className = 'mode-opt' + (aan ? ' active' : '');
      knop.dataset.view = v.name;
      knop.setAttribute('aria-pressed', aan ? 'true' : 'false');
      // De noot van de view is de uitleg die het paneel er ook bij zet
      // ("Locked to the GSM frame — drag to pan, scroll to zoom").
      if (v.note) knop.title = v.note;

      /* HET LABEL BLIJFT STAAN, OOK OP EEN TELEFOON, en dat is het verschil met
         de bolweergave die deze gleuf verder deelt. Die heeft iconen (◐ en ▦) en
         kan zijn tekst missen; een camerastand heeft er geen — Meridian en Top
         zijn allebei "recht op een vlak" en alleen het woord zegt op wélk vlak.
         Daar bestaat geen icoon voor dat dat verschil draagt.

         Dat de rij daarmee niet in de mastheadrij past, is een kwestie voor de
         stylesheet: die zet hem op een smal scherm een rij lager, waar 355 px
         staat in plaats van 145. Zie css/app.css. */
      const tekst = document.createElement('span');
      tekst.className = 'mode-text';
      tekst.textContent = v.label;
      knop.appendChild(tekst);

      knop.addEventListener('click', () => {
        if (!aan) viewStates.goToView(v.name);
      });
      host.appendChild(knop);
    }
  }

  /* Aan `onChange` en niet aan de klik: die haak dekt óók de wegen waarlangs de
     stand verandert zonder dat hier geklikt is — het Navigate-paneel, het
     binnenkomen van een state, en Back to Earth. */
  viewStates.onChange(bouw);
  bouw(viewStates.activeState(), viewStates.currentView());

  return { refresh: () => bouw(viewStates.activeState(), viewStates.currentView()) };
}
