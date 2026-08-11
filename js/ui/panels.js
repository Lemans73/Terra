/* ============================================================
   TERRA — Panels · welk zwevend paneel er open staat
   ------------------------------------------------------------
   Geen DOM-kennis buiten de knoppen die hij markeert. Elk paneel
   meldt zichzelf aan met drie functies; deze module bepaalt alleen
   WELK paneel open mag zijn en houdt de knoppen in de pas.

   WAAROM DIT BESTAAT
   Tot sessie 24 had elk zwevend venster zijn eigen open/dicht-logica:
   `setPanelOpen()` voor het lagenpaneel, `showDetail()/hideDetail()`
   voor het detailvenster, en de bel en de bevingenlijst elk hun eigen
   klasse-toggle. Vier vensters, vier modellen, en de regel "er past er
   maar een" stond drie keer apart uitgeschreven — een keer zelfs als
   `if (isNarrow())` middenin `showDetail()`.

   DRIE SLUITWEGEN, en alle drie komen hier uit:
     1. het kruisje in het paneel
     2. nog een keer op de knop die hem opende
     3. een andere knop UIT DEZELFDE GROEP

   PANELEN SLUITEN ELKAAR NIET — ZE STAPELEN (sessie 25, Terry).
   Tot deze sessie sloot op een smal scherm alles alles, en dat is
   precies waarom er drie plekken waren die de knoppenrij wegzetten:
   een venster dat tot de onderrand loopt moest de knop wel afdekken.
   De nieuwe regel is dat niets verdwijnt. Wat elkaar in de weg zit
   wordt opgelost met een vaste z-volgorde in `css/app.css` en met
   geometrie die zorgt dat er niets belangrijks onder ligt.

   Wat daarvan hier terechtkomt is één woord: `exclusive` (een
   boolean, alles of niets) is `group` geworden (een naam).

     group: 'dock'    Layers & filters · Navigate · Details
                      linksonder, dezelfde plek, dus een tegelijk
     group: 'top'     Notificaties · Bevingenlijst · Instellingen
                      rechtsboven, dezelfde hoek, dus een tegelijk
     group: null      sluit niets en wordt door niets gesloten.
                      Het tijdpaneel en het detailvenster: die hebben
                      een eigen laag en horen niet weg te vallen
                      omdat je iets anders opende.

   ER STAAT GEEN `isNarrow()` MEER IN DEZE MODULE, en dat moet zo
   blijven. Die tak was het mechanisme achter `setDockVisible()`, en
   een module die de schermbreedte kent, kent ook een tweede
   breedtegrens die uit de pas gaat lopen met de media query.

   WAT DEZE MODULE NIET DOET: animeren, plaatsen, of weten hoe een
   paneel eruitziet. Dat blijft bij het paneel zelf. Hij vervangt de
   bestaande open/dicht-functies dus niet, hij roept ze aan — daardoor
   blijven de gemeten vangnetten in `setPanelOpen()` (de `setTimeout`
   voor een stilstaande `requestAnimationFrame`) precies waar ze staan.
   ============================================================ */

export function createPanelManager() {
  const panels = new Map();
  const listeners = [];

  /* Een paneel aanmelden.

     api:
       open()      het paneel tonen
       close()     het paneel verbergen
       isOpen()    staat hij open? VERPLICHT — zonder deze telt het
                   paneel permanent als dicht en wordt zijn knop nooit
                   gemarkeerd
       button      knopelement dat hem bedient (optioneel, voor de markering)
       group       met wie hij zijn plek deelt (optioneel; zonder
                   groep sluit hij niets en wordt hij door niets gesloten) */
  function register(key, api) {
    panels.set(key, Object.assign({ group: null }, api));
  }

  const isOpen = (key) => {
    const p = panels.get(key);
    return !!(p && p.isOpen && p.isOpen());
  };

  /* De eerste open sleutel in registratievolgorde, of `null`. Sinds er
     meerdere panelen tegelijk open mogen staan is dit niet meer "het"
     open paneel — gebruik `openKeys()` wanneer je ze allemaal nodig hebt. */
  const openKey = () => {
    for (const [key] of panels) if (isOpen(key)) return key;
    return null;
  };

  const openKeys = () => [...panels.keys()].filter(isOpen);

  function open(key) {
    const p = panels.get(key);
    if (!p) return false;
    // Weg 3: een andere knop uit dezelfde groep. Panelen zonder groep
    // raken hier niemand, en worden hier door niemand geraakt.
    if (p.group) {
      for (const [other, o] of panels) {
        if (other !== key && o.group === p.group && isOpen(other)) o.close();
      }
    }
    p.open();
    sync();
    return true;
  }

  function close(key) {
    const p = panels.get(key);
    if (!p) return false;
    p.close();
    sync();
    return true;
  }

  // Weg 2: nog een keer op dezelfde knop.
  const toggle = (key) => (isOpen(key) ? close(key) : open(key));

  /* De knoppen volgen de stand, niet andersom. Een knop die zijn eigen
     `active`-klasse bijhoudt gaat uit de pas zodra iets anders het paneel
     sluit — en dat gebeurt hier per ontwerp, want een andere knop doet dat. */
  function sync() {
    for (const [key, p] of panels) {
      if (!p.button) continue;
      const aan = isOpen(key);
      p.button.classList.toggle('active', aan);
      p.button.setAttribute('aria-pressed', aan ? 'true' : 'false');
    }
    const keys = openKeys();
    for (const fn of listeners) fn(keys);
  }

  return {
    register, open, close, toggle, isOpen, openKey, openKeys, sync,
    onChange: (fn) => { listeners.push(fn); return fn; }
  };
}
