/* ============================================================
   TERRA — View states · een camerastand die de app overneemt
   ------------------------------------------------------------
   Geen three.js-import, geen DOM-aannames buiten de knop, geen
   netwerk. Alles wat deze module van de app nodig heeft krijgt hij
   bij het opzetten aangereikt.

   WAAROM DIT BESTAAT
   Terra had in sessie 21 drie states — magneto, sun-view en straks
   space — en elk daarvan voerde LETTERLIJK hetzelfde ritueel uit,
   met een eigen kopie van dezelfde zeven velden:

     let xView = false
     const _xPrev = { pos, target, min, max, labels, autoRotate }
     setXView(on):  snapshot -> labels uit -> autoRotate uit
                    -> flyCamera heen -> body-class -> knoptekst
                    -> en bij uit alles in omgekeerde volgorde terug

   Een vierde state zou daar de derde kopie van maken. Wat per state
   werkelijk verschilt is klein: waar de camera heen gaat, welke
   zoomgrenzen daarbij horen, en wat er nog meer aan of uit moet.
   Dat is wat een state hier opgeeft; de rest doet deze module.

   TWEE CONCEPTEN
   1. DE STATE       — de app neemt een andere gedaante aan
   2. STANDEN ERIN   — vaste camerastandpunten binnen die gedaante
                       (Top, Left, Right, vrij), elk met een doel en
                       een vlag of hij vastgezet is

   PANNEN BLIJFT TOEGESTAAN IN EEN VASTGEZETTE STAND, en dat is het
   verschil met de magneto-implementatie waar dit uit voortkomt.
   Daar staat "zoom only" en kun je een uitvergroot beeld niet
   verschuiven, wat precies dan knelt wanneer je iets van dichtbij
   wilt bekijken. Vastzetten hoort de ORIENTATIE te bewaken, niet de
   bewegingsvrijheid binnen die orientatie. Magneto erft dit zodra
   hij hier op migreert.

   DE STAND WORDT GEZET BIJ HET KIEZEN, NIET ELK FRAME AFGEDWONGEN.
   Dat is wat pannen mogelijk maakt: een stand die zichzelf per frame
   herstelt, wist elke verschuiving die de gebruiker maakt. De prijs
   is dat een stand langzaam veroudert als zijn referentie beweegt
   (de zonrichting schuift een graad per dag); dat is aanvaardbaar
   omdat de gebruiker de stand opnieuw kan aanklikken, en het
   alternatief kost de bediening.
   ============================================================ */

/* ------------------------------------------------------------
   maakViewStates(omgeving)

   `omgeving` verbindt deze module met de inline module, waar de
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
     labels          { lees(), schrijf(bool) }
     autoRotate      { lees(), schrijf(bool), pauzeer() }
     syncToggles()   de schakelaars in Instellingen bijwerken
------------------------------------------------------------ */
export function maakViewStates(omgeving) {
  const { world, flyCamera, stopFlight, labels, autoRotate, syncToggles } = omgeving;

  const definities = new Map();
  let actieveSleutel = null;
  let actieveStand = null;

  // Wat de state bij binnenkomst overneemt en bij vertrek teruggeeft.
  // Een enkel object volstaat: er kan er per definitie maar een state
  // tegelijk actief zijn, en een geneste state zou de vorige stand van
  // de een met die van de ander overschrijven.
  const bewaard = {
    pos: null, target: null, min: 0, max: 0,
    labels: true, autoRotate: false,
    rotate: true, pan: true
  };

  /* Een state aanmelden.

     def:
       body        klassenaam voor <body>, bv. 'space-on'
       knop        id van de knopelement (optioneel)
       knopAan     tekst als de state actief is
       knopUit     tekst als hij dat niet is
       doel()      -> { pos, target, min, max }   waar de camera heen gaat
       binnen()    state-specifieke dingen aanzetten (optioneel)
       buiten()    ze weer uitzetten (optioneel)
       standen     { naam: { doel() -> {pos, target, min, max}, vast } }
       beginstand  welke stand bij binnenkomst geldt (optioneel)
       behoudLabels    laat de labels met rust (standaard: uit)
       behoudRotatie   laat auto-rotate met rust (standaard: uit)
  */
  function registreer(sleutel, def) {
    definities.set(sleutel, def);
  }

  const isActief = (sleutel) => actieveSleutel === sleutel;
  const huidigeStand = () => actieveStand;

  /* ----------------------------------------------------------
     De state aan- of uitzetten.

     TWEE OPTIES DIE JE NIET MOET VERWARREN — ze zaten in de oude
     sun-view samen in één vlag `vlieg: false`, en die betekende
     daardoor twee dingen:

       vlieg: false        plaats de camera DIRECT, zonder animatie.
                           Bij vertrek gaat hij dus wel degelijk terug
                           naar waar hij vandaan kwam, alleen zonder
                           vlucht. Dit is wat je wilt zonder
                           `requestAnimationFrame` — in een test, of
                           bij `prefers-reduced-motion`.

       overgenomen: true   RAAK DE CAMERA NIET AAN, want iemand anders
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
  function zet(sleutel, aan, opties) {
    const def = definities.get(sleutel);
    if (!def) return false;
    if (aan === isActief(sleutel)) return false;
    // Twee states tegelijk kan niet: de tweede zou het snapshot van de
    // eerste overschrijven en de weg terug wissen.
    if (aan && actieveSleutel) zet(actieveSleutel, false, { overgenomen: true });

    const vlieg = !opties || opties.vlieg !== false;
    const overgenomen = !!(opties && opties.overgenomen);
    const ctl = world.controls(), cam = world.camera();

    if (aan) {
      bewaard.pos = cam.position.clone();
      bewaard.target = ctl.target.clone();
      bewaard.min = ctl.minDistance;
      bewaard.max = ctl.maxDistance;
      bewaard.rotate = ctl.enableRotate;
      bewaard.pan = ctl.enablePan;
      bewaard.labels = labels.lees();
      bewaard.autoRotate = autoRotate.lees();

      autoRotate.pauzeer();
      if (!def.behoudLabels) labels.schrijf(false);
      if (!def.behoudRotatie) autoRotate.schrijf(false);
      syncToggles();

      actieveSleutel = sleutel;
      if (def.binnen) def.binnen();

      const stand = def.beginstand || (def.standen ? Object.keys(def.standen)[0] : null);
      if (stand) {
        gaNaarStand(stand, { vlieg });
      } else {
        const d = def.doel();
        if (vlieg) flyCamera(cam, ctl, d.pos, d.target, { min: d.min, max: d.max });
        else plaatsDirect(cam, ctl, d);
      }
    } else {
      if (def.buiten) def.buiten();
      labels.schrijf(bewaard.labels);
      autoRotate.schrijf(bewaard.autoRotate);
      syncToggles();

      // De besturing komt onvoorwaardelijk terug. Zou een vastgezette
      // stand blijven staan nadat de state weg is, dan zit de gebruiker
      // met een bol die niet meer draait en geen zichtbare oorzaak.
      ctl.enableRotate = bewaard.rotate;
      ctl.enablePan = bewaard.pan;

      if (overgenomen) {
        // Alleen de grenzen en het draaipunt teruggeven; wie het overneemt
        // schrijft zelf in `camera.position`. Het draaipunt MOET hier terug,
        // want dat zat aan de zon vastgeklonken en globe.gl's eigen vlucht
        // rekent vanaf het middelpunt.
        stopFlight();
        ctl.minDistance = bewaard.min;
        ctl.maxDistance = bewaard.max;
        ctl.target.copy(bewaard.target);
      } else if (vlieg) {
        flyCamera(cam, ctl, bewaard.pos, bewaard.target,
                  { min: bewaard.min, max: bewaard.max });
      } else {
        plaatsDirect(cam, ctl, { pos: bewaard.pos, target: bewaard.target,
                                 min: bewaard.min, max: bewaard.max });
      }
      actieveSleutel = null;
      actieveStand = null;
    }

    document.body.classList.toggle(def.body, aan);
    const btn = def.knop && document.getElementById(def.knop);
    if (btn) btn.textContent = aan ? def.knopAan : def.knopUit;
    return true;
  }

  function plaatsDirect(cam, ctl, d) {
    stopFlight();
    cam.position.copy(d.pos);
    ctl.target.copy(d.target);
    ctl.minDistance = d.min;
    ctl.maxDistance = d.max;
  }

  /* ----------------------------------------------------------
     Naar een stand binnen de actieve state.

     Een vastgezette stand schakelt ROTEREN uit en laat pannen en
     zoomen staan — zie de kop. Een vrije stand geeft alles terug.
  ---------------------------------------------------------- */
  function gaNaarStand(naam, opties) {
    if (!actieveSleutel) return false;
    const def = definities.get(actieveSleutel);
    const stand = def.standen && def.standen[naam];
    if (!stand) return false;

    const ctl = world.controls(), cam = world.camera();
    const d = stand.doel();
    actieveStand = naam;

    ctl.enableRotate = !stand.vast;
    ctl.enablePan = true;      // ook vastgezet: de orientatie staat vast, het beeld niet

    if (!opties || opties.vlieg !== false) {
      flyCamera(cam, ctl, d.pos, d.target, { min: d.min, max: d.max });
    } else {
      plaatsDirect(cam, ctl, d);
    }
    return true;
  }

  const standIsVast = (naam) => {
    const def = definities.get(actieveSleutel);
    return !!(def && def.standen && def.standen[naam] && def.standen[naam].vast);
  };

  return { registreer, zet, isActief, huidigeStand, gaNaarStand, standIsVast,
           actieveState: () => actieveSleutel };
}
