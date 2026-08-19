/* ============================================================
   TERRA — Globe root · de aardbol omkeerbaar wegzetten
   ------------------------------------------------------------
   Geen three.js-import: deze module raakt alleen `visible`-vlaggen
   aan op objecten die de aanroeper aanlevert.

   WAAROM DIT BESTAAT
   Een state kan de aarde uit beeld willen hebben — space wordt
   heliocentrisch en heeft helemaal geen aardbol nodig, en het
   magneto-perspectief tekende tot sessie 29 zijn eigen bol. Wie hem
   wegzet moet hem daarna teruggeven precies zoals hij hem aantrof. Dat is meer dan een vlag omzetten:
   er hangen zes losse lagen naast de bol in de scene, en die hadden
   allemaal al hun eigen stand die de bezoeker zelf gekozen kan hebben.

   TERUGZETTEN IS NIET "ALLES AAN". Dat is de val die deze module
   dichttimmert. Wie bij vertrek `visible = true` schrijft, zet lagen
   aan die de bezoeker vóór het binnengaan bewust had uitgezet — en
   dat leest als een bug in de schakelaar, niet in de state. We
   onthouden dus per object wat er stond, en schrijven dat terug.
   ============================================================ */

/* globe.gl's ThreeGlobe heeft geen enkele marker op zijn root; alleen een groep
   diep erin draagt `__globeObjType === 'globe'`. GEMETEN, en niet zoals verwacht:
   die groep zit NIET direct onder de wortel maar onder een tussenlaag, en de
   lagen met paden en indicatoren hangen aan weer een andere ouder. Alleen die
   tussenlaag verbergen laat de landgrenzen en de bevingen gewoon staan.

   Daarom klimmen we door tot het directe kind van de scene. Dat is de enige
   ondubbelzinnige greep: hoe globe.gl zijn binnenkant ook indeelt, alles van hem
   hangt onder dat ene object.

   EN VERBERG NOOIT DE AARDE-MESH ZELF. `GlobeLayerKapsule.update()` begint met
   `state.tileEngine.visible = !(state.globeObj.visible = !state.globeTileEngineUrl)`
   en draait bij ELKE prop-wijziging van die laag. `enterExpertMode()` doet
   `world.showGraticules(true)` en zet de mesh daarmee ongevraagd terug op
   zichtbaar. De wortel is immuun: three-globe schrijft daar na `init()` niet
   meer in. */
export function findGlobeRoot(world) {
  const scene = world.scene();
  let found = null;
  scene.traverse(o => { if (!found && o.__globeObjType === 'globe') found = o; });
  if (!found) return null;
  while (found.parent && found.parent !== scene) found = found.parent;
  return found.parent === scene ? found : null;
}

/* De omgevingsschakelaar. `hide(groups)` zet de globe-wortel plus elke
   meegegeven groep weg en onthoudt hun vorige stand; `restore()` geeft die
   stand terug. Beide zijn idempotent — een tweede `hide()` mag het snapshot
   niet overschrijven met de stand die hij zelf net heeft gezet.

   NIET GEDEKT en dat is bewust: de camera, de zoomgrenzen en het paneel. Die
   liggen bij `js/core/view-state.js`, en twee plekken die hetzelfde bewaren
   lopen gegarandeerd uiteen. */
export function createEnvironmentToggle(world) {
  let snapshot = null;

  /* three's Raycaster toetst alleen `object.layers`, NIET `visible` — zie
     three/src/core/Raycaster.js. Een verborgen aarde blijft dus gewoon raakbaar,
     en globe.gl toont dan tooltips van de tektonische platen van een bol die er
     niet staat. Pointer-interactie moet daarom apart uit. */
  const readPointer = () => {
    if (typeof world.enablePointerInteraction !== 'function') return null;
    const v = world.enablePointerInteraction();
    return typeof v === 'boolean' ? v : true;
  };

  /* `opts.includeGlobe` (standaard true) bepaalt of de aardbol zelf meegaat.
     De heliocentrische weergave wil hem weg — daar is de aarde een stip in een
     baan. De zon-weergave juist NIET: daar kijk je van vlakbij de zon, en een
     aarde in de verte is dan geen storing maar de schaal van het beeld. Wat er
     in beide gevallen wél uit moet is de aardgebonden versiering: assen,
     planeetindicatoren, hemelschijven. */
  function hide(groups = [], opts = {}) {
    if (snapshot) return false;
    const root = opts.includeGlobe === false ? null : findGlobeRoot(world);
    const items = [root, ...groups].filter(Boolean);
    snapshot = { items: items.map(o => ({ o, visible: o.visible })), pointer: readPointer() };
    snapshot.items.forEach(s => { s.o.visible = false; });
    if (snapshot.pointer !== null) world.enablePointerInteraction(false);
    return true;
  }

  function restore() {
    if (!snapshot) return false;
    snapshot.items.forEach(s => { s.o.visible = s.visible; });
    if (snapshot.pointer !== null) world.enablePointerInteraction(snapshot.pointer);
    snapshot = null;
    return true;
  }

  return { hide, restore, isHidden: () => !!snapshot };
}
