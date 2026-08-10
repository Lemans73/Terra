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
     3. een andere knop

   WAT DEZE MODULE NIET DOET: animeren, plaatsen, of weten hoe een
   paneel eruitziet. Dat blijft bij het paneel zelf. Hij vervangt de
   bestaande open/dicht-functies dus niet, hij roept ze aan — daardoor
   blijven de gemeten vangnetten in `setPanelOpen()` (de `setTimeout`
   voor een stilstaande `requestAnimationFrame`) precies waar ze staan.

   SESSIE 24 REGISTREERT ER TWEE: het lagenpaneel en Navigate. Het
   detailvenster, de bel en de bevingenlijst komen in fase 2 — die
   vragen elk nog een verbouwing aan hun eigen kant, en half migreren
   levert precies de twee modellen op die dit moest opheffen.
   ============================================================ */

export function createPanelManager() {
  const panels = new Map();
  const listeners = [];

  /* Een paneel aanmelden.

     api:
       open()      het paneel tonen
       close()     het paneel verbergen
       button      knopelement dat hem bedient (optioneel, voor de markering)
       exclusive   mag hij naast een ander open staan? (standaard: nee) */
  function register(key, api) {
    panels.set(key, Object.assign({ exclusive: true }, api));
  }

  const isOpen = (key) => {
    const p = panels.get(key);
    return !!(p && p.isOpen && p.isOpen());
  };

  const openKey = () => {
    for (const [key] of panels) if (isOpen(key)) return key;
    return null;
  };

  function open(key) {
    const p = panels.get(key);
    if (!p) return false;
    // Weg 3: een andere knop. Sluit alles wat niet naast dit paneel mag staan.
    if (p.exclusive) {
      for (const [other, o] of panels) {
        if (other !== key && o.exclusive && isOpen(other)) o.close();
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
    const k = openKey();
    for (const fn of listeners) fn(k);
  }

  return {
    register, open, close, toggle, isOpen, openKey, sync,
    onChange: (fn) => { listeners.push(fn); return fn; }
  };
}
