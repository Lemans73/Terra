/* ============================================================
   TERRA — View states · een camerastand die de app overneemt
   ------------------------------------------------------------
   Geen three.js-import, geen DOM-aannames buiten de knop, geen
   netwerk. Alles wat deze module van de app nodig heeft krijgt hij
   bij het opzetten aangereikt.

   WAAROM DIT BESTAAT
   Terra had in sessie 21 drie states — het toenmalige magneto-
   perspectief, sun-view en straks space — en elk daarvan voerde
   LETTERLIJK hetzelfde ritueel uit, met een eigen kopie van
   dezelfde zeven velden:

     let xView = false
     const _xPrev = { pos, target, min, max, labels, autoRotate }
     setXView(on):  snapshot -> labels uit -> autoRotate uit
                    -> flyCamera heen -> body-class -> knoptekst
                    -> en bij uit alles in omgekeerde volgorde terug

   Een vierde state zou daar de derde kopie van maken. Wat per state
   werkelijk verschilt is klein: waar de camera heen gaat, welke
   zoomgrenzen daarbij horen, en wat er nog meer aan of uit moet.
   Dat is wat een state hier opgeeft; de rest doet deze module.

   HET REGISTER IS OOK DE NAVIGATIE (sessie 24). `list()` geeft de
   aangemelde states in registratievolgorde, mét hun `label` en `icon`.
   `js/ui/nav.js` bouwt het Navigate-paneel daaruit, zodat een nieuwe
   state nul regels navigatiecode kost. Wie hier een state aanmeldt
   zonder label of icoon krijgt hem dus wel, maar naamloos — vandaar
   dat die twee in het contract staan en niet in de UI.

   TWEE CONCEPTEN
   1. DE STATE       — de app neemt een andere gedaante aan
   2. VIEWS ERIN     — vaste camerastandpunten binnen die gedaante
                       (Top, Edge, Side, vrij), elk met een camera()
                       en een vlag of hij vastgezet is

   PANNEN BLIJFT TOEGESTAAN IN EEN VASTGEZETTE VIEW, en dat is het
   verschil met de state waar dit uit voortkomt: het magneto-
   perspectief van sessie 18 stond op "zoom only", en dan kun je een
   uitvergroot beeld niet verschuiven — wat precies dan knelt wanneer
   je iets van dichtbij wilt bekijken. Vastzetten hoort de ORIENTATIE
   te bewaken, niet de bewegingsvrijheid binnen die orientatie.

   Die state is in sessie 29 gesloopt om zijn naam vrij te maken voor
   de magnetosfeer, die uit een eigen PoC komt. Wat ervan overleeft is
   de vorm hierboven, en die regel.

   DE VIEW WORDT GEZET BIJ HET KIEZEN, NIET ELK FRAME AFGEDWONGEN.
   Dat is wat pannen mogelijk maakt: een view die zichzelf per frame
   herstelt, wist elke verschuiving die de gebruiker maakt. De prijs
   is dat een view langzaam veroudert als zijn referentie beweegt
   (de zonrichting schuift een graad per dag); dat is aanvaardbaar
   omdat de gebruiker de view opnieuw kan aanklikken, en het
   alternatief kost de bediening.

   IDENTIFIERS ZIJN ENGELS SINDS SESSIE 24 (besluit B10). Het
   commentaar blijft Nederlands. Wie hier iets toevoegt: `camera()`
   en niet `target()`, want dat laatste botst met het `target`-veld
   ín zijn eigen antwoord.
   ============================================================ */

/* ------------------------------------------------------------
   createViewStates(env)

   `env` verbindt deze module met de inline module, waar de
   scene-globals leven. Ze worden als functies doorgegeven en niet
   als waarden, om twee redenen die allebei eerder zijn ingelopen:

   - `labelsOn` en `autoRotateWanted` zijn `let`-bindingen in een
     andere module. Een geimporteerde waarde is een momentopname;
     een getter leest de stand van nu. Zelfde val als de
     `window.__test`-haak uit sessie 14, die een snapshot vastlegde
     en daardoor `null` teruggaf.
   - Alles wat hier binnenkomt is daarmee te vervangen in een test,
     zonder dat er een browser aan te pas komt.

   Verwacht:
     world           globe.gl-instantie (voor camera() en controls())
     flyCamera(cam, ctl, pos, target, {min, max})
     stopFlight()    een lopende vlucht afbreken
     labels          { get(), set(bool) }
     autoRotate      { get(), set(bool), pause() }
     syncToggles()   de schakelaars in Instellingen bijwerken
------------------------------------------------------------ */
export function createViewStates(env) {
  const { world, flyCamera, stopFlight, labels, autoRotate, syncToggles } = env;

  const definitions = new Map();
  let activeKey = null;
  let activeView = null;

  // Wat de state bij binnenkomst overneemt en bij vertrek teruggeeft.
  // Een enkel object volstaat: er kan er per definitie maar een state
  // tegelijk actief zijn, en een geneste state zou de vorige stand van
  // de een met die van de ander overschrijven.
  const saved = {
    pos: null, target: null, min: 0, max: 0,
    labels: true, autoRotate: false,
    rotate: true, pan: true,
    // `camera.up` hoort hier ook bij. Een state die hem kantelt en niet
    // terugzet, laat de gebruiker achter met een aardbol die scheef draait
    // zonder zichtbare oorzaak — dezelfde klasse fout als een vastgezette
    // view die na vertrek blijft staan.
    up: null
  };

  /* Een state aanmelden.

     def:
       body        klassenaam voor <body>, bv. 'space-on'
       label       zichtbare naam in de navigatie, bv. 'Space'
       icon        inline SVG-markup voor de navigatie (optioneel)
       button      id van een knopelement (optioneel, legacy)
       buttonOn    tekst als de state actief is
       buttonOff   tekst als hij dat niet is
       camera()    -> { pos, target, min, max }   waar de camera heen gaat
       enter()     state-specifieke dingen aanzetten (optioneel)
       exit()      ze weer uitzetten (optioneel)
       views       { naam: { camera() -> {pos, target, min, max, up?}, locked } }
       initialView welke view bij binnenkomst geldt (optioneel)
       keepLabels     laat de labels met rust (standaard: uit)
       keepRotation   laat auto-rotate met rust (standaard: uit)
  */
  function register(key, def) {
    definitions.set(key, def);
  }

  /* Het register uitlezen, in registratievolgorde — `Map` bewaart die.
     Dit is wat `js/ui/nav.js` gebruikt; teruggegeven wordt een kopie van
     de lijst, niet de Map zelf, zodat niemand er per ongeluk in schrijft. */
  function list() {
    return [...definitions.entries()].map(([key, def]) => ({
      key,
      label: def.label || key,
      icon: def.icon || '',
      views: def.views
        ? Object.entries(def.views).map(([name, v]) => ({
            name, label: v.label || name, locked: !!v.locked, note: v.note || ''
          }))
        : []
    }));
  }

  /* De noot bij de ACTIEVE view — "vastgezet, maar pannen en zoomen werken
     nog" tegenover "vrij". Die tekst hoort bij de view en niet bij de UI:
     twee vaste strings in een `if` werken voor één state en breken bij de
     tweede. */
  function viewNote() {
    const def = definitions.get(activeKey);
    const v = def && def.views && def.views[activeView];
    return (v && v.note) || '';
  }

  const isActive = (key) => activeKey === key;
  const currentView = () => activeView;

  /* ----------------------------------------------------------
     De state aan- of uitzetten.

     TWEE OPTIES DIE JE NIET MOET VERWARREN — ze zaten in de oude
     sun-view samen in één vlag `fly: false`, en die betekende
     daardoor twee dingen:

       fly: false          plaats de camera DIRECT, zonder animatie.
                           Bij vertrek gaat hij dus wel degelijk terug
                           naar waar hij vandaan kwam, alleen zonder
                           vlucht. Dit is wat je wilt zonder
                           `requestAnimationFrame` — in een test, of
                           bij `prefers-reduced-motion`.

       handedOver: true    RAAK DE CAMERA NIET AAN, want iemand anders
                           zet hem al. Zo verlaat een klik op een
                           melding het zonaanzicht: `flyTo()` vliegt
                           zelf naar de aarde, en een tweede schrijver
                           zou daar dwars doorheen fietsen.

     Zonder de tweede uitgang bleef de oude sun-view op `true` staan
     terwijl je de aarde zag: het draaipunt bleef vastgeklonken, de
     knop zei nog "Back to Earth", en eruit kwam je niet meer. Die
     uitgang moest dus blijven — alleen niet langer onder dezelfde
     naam als "spring er meteen heen".
  ---------------------------------------------------------- */
  function set(key, on, options) {
    const def = definitions.get(key);
    if (!def) return false;
    if (on === isActive(key)) return false;
    // Twee states tegelijk kan niet: de tweede zou het snapshot van de
    // eerste overschrijven en de weg terug wissen.
    if (on && activeKey) set(activeKey, false, { handedOver: true });

    const fly = !options || options.fly !== false;
    const handedOver = !!(options && options.handedOver);
    const ctl = world.controls(), cam = world.camera();

    if (on) {
      saved.pos = cam.position.clone();
      saved.target = ctl.target.clone();
      saved.min = ctl.minDistance;
      saved.max = ctl.maxDistance;
      saved.rotate = ctl.enableRotate;
      saved.pan = ctl.enablePan;
      saved.up = cam.up.clone();
      saved.labels = labels.get();
      saved.autoRotate = autoRotate.get();

      autoRotate.pause();
      if (!def.keepLabels) labels.set(false);
      if (!def.keepRotation) autoRotate.set(false);
      syncToggles();

      activeKey = key;
      if (def.enter) def.enter();

      const view = def.initialView || (def.views ? Object.keys(def.views)[0] : null);
      if (view) {
        goToView(view, { fly });
      } else {
        const d = def.camera();
        if (fly) flyCamera(cam, ctl, d.pos, d.target, { min: d.min, max: d.max });
        else placeDirect(cam, ctl, d);
      }
    } else {
      if (def.exit) def.exit();
      labels.set(saved.labels);
      autoRotate.set(saved.autoRotate);
      syncToggles();

      // De besturing komt onvoorwaardelijk terug. Zou een vastgezette
      // view blijven staan nadat de state weg is, dan zit de gebruiker
      // met een bol die niet meer draait en geen zichtbare oorzaak.
      ctl.enableRotate = saved.rotate;
      ctl.enablePan = saved.pan;
      if (saved.up) cam.up.copy(saved.up);

      if (handedOver) {
        // Alleen de grenzen en het draaipunt teruggeven; wie het overneemt
        // schrijft zelf in `camera.position`. Het draaipunt MOET hier terug,
        // want dat zat aan de zon vastgeklonken en globe.gl's eigen vlucht
        // rekent vanaf het middelpunt.
        stopFlight();
        ctl.minDistance = saved.min;
        ctl.maxDistance = saved.max;
        ctl.target.copy(saved.target);
      } else if (fly) {
        flyCamera(cam, ctl, saved.pos, saved.target,
                  { min: saved.min, max: saved.max });
      } else {
        placeDirect(cam, ctl, { pos: saved.pos, target: saved.target,
                                min: saved.min, max: saved.max });
      }
      activeKey = null;
      activeView = null;
    }

    document.body.classList.toggle(def.body, on);
    const btn = def.button && document.getElementById(def.button);
    if (btn) btn.textContent = on ? def.buttonOn : def.buttonOff;
    notify();
    return true;
  }

  function placeDirect(cam, ctl, d) {
    stopFlight();
    cam.position.copy(d.pos);
    ctl.target.copy(d.target);
    ctl.minDistance = d.min;
    ctl.maxDistance = d.max;
  }

  /* ----------------------------------------------------------
     Naar een view binnen de actieve state.

     Een vastgezette view schakelt ROTEREN uit en laat pannen en
     zoomen staan — zie de kop. Een vrije view geeft alles terug.
  ---------------------------------------------------------- */
  function goToView(name, options) {
    if (!activeKey) return false;
    const def = definitions.get(activeKey);
    const view = def.views && def.views[name];
    if (!view) return false;

    const ctl = world.controls(), cam = world.camera();
    const d = view.camera();
    activeView = name;

    ctl.enableRotate = !view.locked;
    ctl.enablePan = true;      // ook vastgezet: de orientatie staat vast, het beeld niet

    /* EEN VIEW MAG ZIJN EIGEN "OMHOOG" OPGEVEN, en dat moet VÓÓR de
       camerabeweging gebeuren: OrbitControls leest `camera.up` bij het
       opbouwen van zijn eigen assenstelsel, dus achteraf zetten geeft een
       beeld dat pas bij de volgende muisbeweging rechttrekt.

       WAAROM DIT BESTAAT. Zonder dit staat "omhoog" altijd op Terra's
       noordpool (0,1,0). Voor een view in een ANDER frame — het GSM-frame van
       de magnetosfeer staat er tientallen graden vanaf — betekent dat: je
       kijkt wel loodrecht op het juiste vlak, maar het beeld hangt scheef.
       Een "zijaanzicht" dat gekanteld is, is geen zijaanzicht. */
    if (d.up) cam.up.copy(d.up).normalize();

    if (!options || options.fly !== false) {
      flyCamera(cam, ctl, d.pos, d.target, { min: d.min, max: d.max });
    } else {
      placeDirect(cam, ctl, d);
    }
    notify();
    return true;
  }

  const viewIsLocked = (name) => {
    const def = definitions.get(activeKey);
    return !!(def && def.views && def.views[name] && def.views[name].locked);
  };

  /* ----------------------------------------------------------
     ABONNEES (sessie 24). Het Navigate-paneel moet weten wanneer de
     state of de view verandert, en dat gebeurt op vier plekken: een
     klik in dat paneel zelf, de Back to Earth-knop, de sprong naar
     een eclips, en de `handedOver`-uitgang wanneer een klik op een
     melding het zonaanzicht verlaat.

     Een callback is daarom de enige manier die alle vier dekt. De UI
     laten pollen zou werken zolang `requestAnimationFrame` loopt, en
     dat is precies de aanname die in dit project drie keer eerder
     misging.
  ---------------------------------------------------------- */
  const listeners = [];
  const onChange = (fn) => { listeners.push(fn); return fn; };
  function notify() {
    for (const fn of listeners) fn(activeKey, activeView);
  }

  return { register, list, set, isActive, currentView, goToView, viewIsLocked,
           viewNote, onChange, activeState: () => activeKey };
}
