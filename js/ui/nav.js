/* ============================================================
   TERRA — Navigate · het paneel dat zichzelf uit het register bouwt
   ------------------------------------------------------------
   Geen three.js, geen scene-kennis, geen netwerk. Deze module kent
   alleen `viewStates` en een stuk DOM.

   WAAROM DIT GEGENEREERD WORDT EN NIET GESCHREVEN
   Tot sessie 24 had elke state zijn eigen ingang in het infopaneel:
   `Enter space view` in de Space-accordeon, `Observe the Sun` bij de
   zon, en het magneto-perspectief had er ook een. Drie knoppen, drie
   plekken, drie keer dezelfde tekstwissel tussen "erheen" en "Back to
   Earth" — en je moest eerst weten in welke tab de knop stond om
   terug te kunnen.

   `js/core/view-state.js` is een register, dus die lijst bestaat al.
   `list()` geeft hem in registratievolgorde, mét label, icoon en de
   camerastanden. Een state die zich aanmeldt verschijnt daarmee
   vanzelf in de navigatie; de magnetosfeer kost straks nul regels hier.

   EARTH IS GEEN GEREGISTREERDE STATE MAAR DE AFWEZIGHEID ERVAN.
   Hij staat als eerste rij en schakelt met `set(actief, false)`. Dat
   is meteen de "Back to Earth" die overal moet werken: er is maar één
   uitgang en die kent het register al.

   HERBOUWEN, NIET BIJWERKEN. De lijst is hooguit een handvol rijen,
   dus per wijziging opnieuw opbouwen kost niets en scheelt een tweede
   waarheid over welke rij nu actief is. Dat is dezelfde afweging als
   bij de planetenlijst, en de reden dat er hier geen `active`-vlaggen
   rondslingeren.
   ============================================================ */

export function createNavPanel(opts) {
  const { viewStates, host, base } = opts;
  if (!host) return null;

  /* Earth is geen state, dus zijn label en icoon komen van de aanroeper.
     Hardcoderen zou betekenen dat deze module weet wat de basisweergave
     van de app is, en dat weet hij juist niet. */
  const earth = Object.assign({
    label: 'Earth',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
          'stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/>' +
          '<path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>'
  }, base || {});

  host.classList.add('nav-panel');
  host.innerHTML =
    '<div class="nav-head"><span>Navigate</span>' +
    '<button class="nav-close" type="button" title="Close" aria-label="Close navigation">&#215;</button>' +
    '</div><div class="nav-body"></div>';
  const body = host.querySelector('.nav-body');
  const closeBtn = host.querySelector('.nav-close');

  const rij = (key, label, icon, actief) =>
    '<button class="nav-state' + (actief ? ' active' : '') + '" type="button" ' +
    'data-state="' + key + '" aria-pressed="' + (actief ? 'true' : 'false') + '">' +
    '<span class="nav-icon">' + icon + '</span><span>' + label + '</span></button>';

  function render() {
    const actief = viewStates.activeState();
    const huidigeView = viewStates.currentView();
    let html = rij('', earth.label, earth.icon, !actief);

    for (const s of viewStates.list()) {
      html += rij(s.key, s.label, s.icon, actief === s.key);
      // De camerastanden verschijnen ALLEEN onder de state die aan staat.
      // Standen van een state waar je niet in zit hebben niets te besturen,
      // en ze zouden hun eigen state stilzwijgend moeten aanzetten om iets
      // te doen — dat is een tweede ingang naar dezelfde plek.
      if (actief === s.key && s.views.length) {
        html += '<div class="nav-views">' + s.views.map(v =>
          '<button class="preset' + (v.name === huidigeView ? ' active' : '') + '" ' +
          'type="button" data-view="' + v.name + '">' + v.label + '</button>').join('') +
          '</div>';
      }
    }

    const noot = actief ? viewStates.viewNote() : '';
    if (noot) html += '<p class="nav-note">' + noot + '</p>';
    body.innerHTML = html;
  }

  /* EEN handler op de body, geen handler per knop. De inhoud wordt bij elke
     wijziging herbouwd, dus per-knop-handlers zouden elke keer opnieuw
     aangehangen moeten worden — en één vergeten `removeEventListener` is
     een lek dat pas na tientallen wisselingen opvalt. */
  body.addEventListener('click', (e) => {
    const stateBtn = e.target.closest('.nav-state');
    if (stateBtn) {
      const key = stateBtn.dataset.state;
      const actief = viewStates.activeState();
      if (!key) { if (actief) viewStates.set(actief, false); }
      else if (key !== actief) viewStates.set(key, true);
      render();
      return;
    }
    const viewBtn = e.target.closest('.nav-views .preset');
    if (viewBtn) { viewStates.goToView(viewBtn.dataset.view); render(); }
  });

  // Het register meldt zelf wanneer de state of de view verandert. Dat dekt
  // ook de wegen die NIET door dit paneel lopen: de sprong naar de eerstvolgende
  // eclips, en de klik op een melding die het zonaanzicht via `handedOver`
  // verlaat. Zonder dit abonnement zou het paneel daar stil verouderen.
  viewStates.onChange(render);

  render();
  return {
    element: host,
    render,
    onClose: (fn) => closeBtn.addEventListener('click', fn)
  };
}
