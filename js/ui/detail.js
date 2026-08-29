/* ============================================================
   TERRA — Detail · het venster waarin je één ding leest
   ------------------------------------------------------------
   Geen kennis van lagen, bronnen, kleuren of eenheden. Deze module
   krijgt een KANT-EN-KLARE beschrijving en tekent die; wat er in
   staat en hoe het geformatteerd is, bepaalt de aanroeper.

   WAAROM DIT BESTAAT
   Tot sessie 24 was dit een `showDetail(d)` van negentig regels in
   `index.html`, en die zat aan één soort vast: een GEBEURTENIS uit een
   datalaag. De vier rijen stonden in de markup (Type · Value · Time ·
   Source), de kicker haalde zijn naam uit een `names`-map op `d.layer`
   en zijn kleur uit `COLORS[d.layer]`. Alles wat geen laag had, paste
   er dus niet in.

   En dat werd het probleem, want de regel die sessie 25 stuurt is:

     HET PANEEL IS WAAR JE IETS AAN- EN UITZET.
     DIT VENSTER IS WAAR JE DE GETALLEN OVER ÉÉN DING LEEST.

   Daarmee komen er twee soorten bij die geen laag hebben en geen
   gebeurtenis zijn: een PLANEET (zes heliocentrische of zeven
   geocentrische waarden) en het MAGNEETVELD (vier waarden plus een
   poolplot). Allebei stonden ze eerder als vaste blokken in een tab,
   waar ze het paneel lieten groeien met informatie die je maar zelden
   nodig hebt.

   WAT DE SOORT BEPAALT ZIT NIET HIER. `kind` reist mee als label voor
   de aanroeper en voor de tests, maar deze module doet er niets mee —
   hij tekent wat hij krijgt. Zou hij per soort gaan beslissen, dan was
   de `names`-map van hierboven gewoon verhuisd in plaats van opgelost.

   DE PLOT-HAAK. `#r-extra` deed alleen sleutel/waarde-rijen, en de
   poolplot van het magneetveld is een `<canvas>`. Vandaar `plot(el)`:
   een leeg element waar de aanroeper in mag tekenen. Dezelfde haak
   bedient later de maanfase-schijf.

   ------------------------------------------------------------
   ÉÉN ONDERGROND, EN DE SLUITKNOP WORDT EEN PIJL (sessie 26)

   Nieuw is dat een view onder een andere kan liggen. Aanleiding: de
   zonneactiviteit staat in dit venster, en een klik op een actief gebied
   VERVANGT die readings — waarna je terug wilt kunnen naar waar je
   vandaan kwam. Sluiten is dan de verkeerde uitgang.

   HET IS ÉÉN NIVEAU EN GEEN STAPEL. Eén klik terug, nog een klik dicht.
   Een echte stapel roept meteen de vraag op wanneer hij geleegd wordt,
   en maakt van deze knop een browser-history die niemand hier verwacht.

   WAT BEWAARD WORDT IS EEN BOUWER, GEEN VIEW. Een view is een
   momentopname: het magneetveld en een planeet worden herrekend zodra
   de tijd verschuift, en `rows` bevat echte DOM-Nodes die je dan tussen
   twee vensters heen en weer zou verhuizen. Een `() => void` roept de
   bestaande bouwfunctie opnieuw aan en levert per constructie verse
   getallen.

   DE SLUITKNOP HOORT HIER EN NIET IN index.html. Hij verandert van
   betekenis op grond van staat die alleen in deze module leeft. Zou de
   app hem bedienen, dan moest die na élke show/refresh/hide/back de
   knopstand bijwerken — een tweede waarheid, en precies wat
   `js/ui/panels.js` als les opschrijft: de knoppen volgen de stand.

   `refresh()` EN NIET `show(view, { replace: true })`. De aanroepers die
   zichzelf verversen staan al achter een `kind()`-guard die letterlijk
   "ik ververs mezelf" betekent; een optie die je moet ónthouden mee te
   geven, loopt bij vergeten stil vol. Bijvangst: `refresh()` slaat de
   in-animatie over, zodat het venster niet bij elke tijdstap opnieuw
   invliegt terwijl het al staat.

   DE VANGNETTEN BLIJVEN. GSAP hangt aan `requestAnimationFrame` en dat
   staat stil zodra het tabblad naar de achtergrond gaat. Een `fromTo`
   zet dan alleen de BEGINwaarde — opacity 0 — en er blijft een
   onzichtbaar venster staan dat door zijn `pointer-events` wél kliks
   opvangt. Erger dan geen venster. Beide `setTimeout`s hieronder zijn
   daarvoor, en ze zijn gemeten, niet geraden.
   ============================================================ */

/* ------------------------------------------------------------
   createDetailPanel(env)

   env:
     host           het venster-element (`#readout`)
     gsap           de animatiebibliotheek
     reducedMotion  bool: alleen invaden, niet verschuiven
     onShow()       optioneel, na het tonen (Terra pauzeert hier het draaien)
     onClose()      optioneel, NA een sluiting door de gebruiker zelf. Niet
                    vanuit `hide()`: die wordt ook door de app aangeroepen,
                    en dan zou dit een lus met `hideDetail()` opleveren
------------------------------------------------------------ */
export function createDetailPanel(env) {
  const { host, gsap, reducedMotion, onShow, onClose } = env;

  const kickerEl = host.querySelector('.kicker');
  const headEl   = host.querySelector('.headline');
  const rowsEl   = host.querySelector('.detail-rows');
  const plotEl   = host.querySelector('.detail-plot');
  const actEl    = host.querySelector('.detail-actions');
  const linkEl   = host.querySelector('.more-link');
  const closeBtn = host.querySelector('.readout-close');

  let open = false;
  let lastKind = null;
  let backTo = null;

  /* WIE ER LUISTERT NAAR WAT DIT VENSTER DOET (sessie 33).

     Aanleiding: de drie knoppen die een leesvenster openen — `Read the field`,
     `Read the activity`, `Read the conditions` — moeten `Close the readings`
     gaan zeggen zodra hun venster openstaat. Dat is een stand die alleen hier
     bekend is, en er zijn VIJF wegen waarlangs hij verandert: `show`, `hide`,
     `back`, het kruisje, en een aanroeper die `hide()` doet omdat de state
     wisselt.

     Zonder deze haak zou elke aanroeper na élke venstermutatie de knoppen
     moeten bijwerken — en dat is precies de tweede waarheid die js/ui/panels.js
     als les opschrijft: de knoppen volgen de stand, de stand volgt de knoppen
     niet. `refresh()` vuurt hem OOK, want daar kan `kind` van veranderen. */
  const luisteraars = [];
  const meld = () => { for (const fn of luisteraars) fn(open ? lastKind : null); };

  /* Een waarde mag tekst zijn, een link, of een kant-en-klare Node. Meer
     vormen zijn er niet, en `innerHTML` staat er bewust NIET bij: zodra dit
     HTML uit een string accepteert, gaat er ooit iets ongeschoond doorheen
     dat uit een API komt. Wie opmaak nodig heeft, bouwt zelf een Node — dan
     is het de aanroeper die de stukjes kiest, en niet een string uit een
     antwoord van derden. */
  function valueNode(v) {
    if (v instanceof Node) return v;
    if (v && typeof v === 'object' && v.href) {
      const a = document.createElement('a');
      a.href = v.href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = v.text != null ? v.text : v.href;
      return a;
    }
    return document.createTextNode(v == null || v === '' ? '—' : String(v));
  }

  /* EEN SECTIEKOP IS EEN RIJ ZONDER WAARDE (sessie 32).

     Aanleiding: de magnetosfeer heeft veertien uitleeswaarden en de INDELING
     ervan draagt betekenis — wat gemeten binnenkomt, wat daar meetkundig uit
     volgt, en wat niets kan tegenspreken. Veertien rijen achter elkaar maakt
     van die drie uitspraken één lijst.

     EXPLICIET EN NIET IMPLICIET. Een rij van lengte één, of een waarde die
     `undefined` is in plaats van `null`, zou hetzelfde doen en zou de volgende
     aanroeper stil in de val laten lopen: `[k, null]` moet een streepje geven en
     `[k]` een kop, en dat verschil ziet niemand terug op de plek waar hij het
     intikt. `{ section: '…' }` staat er als wat het is. */
  function drawRows(rows) {
    rowsEl.replaceChildren();
    for (const [k, v] of rows || []) {
      if (k && typeof k === 'object' && k.section) {
        const secEl = document.createElement('div');
        secEl.className = 'sec';
        secEl.textContent = k.section;
        rowsEl.appendChild(secEl);
        continue;
      }
      const rowEl = document.createElement('div');
      rowEl.className = 'row';
      const keyEl = document.createElement('span');
      keyEl.className = 'k';
      keyEl.textContent = k;
      const valEl = document.createElement('span');
      valEl.className = 'v';
      /* AFWEZIG IS EEN VORM EN GEEN WAARDE. `{ absent: true, text: 'no Bz' }`
         zegt: hier hoort een getal en er is er geen, en dít is de reden. Die
         tekst mag niet leiden als een meting, dus hij krijgt de bleke cursieve
         inkt — dezelfde afspraak als in de POC, waar het paneel over ontbrekende
         metingen de helft van zijn bestaansrecht ontleent. */
      if (v && typeof v === 'object' && v.absent) valEl.classList.add('absent');
      valEl.appendChild(valueNode(v && typeof v === 'object' && v.absent ? v.text : v));
      rowEl.append(keyEl, valEl);
      rowsEl.appendChild(rowEl);
    }
  }

  /* De knoppen onderaan: "naar de plek" en "naar het moment". Ze staan er
     alleen als de beschrijving ze meegeeft — een AQI-station heeft geen
     gebeurtenistijd, een planeet geen registratiemoment, en een knop die
     niets kan doen is erger dan geen knop. */
  function drawActions(actions) {
    actEl.replaceChildren();
    const list = actions || [];
    actEl.hidden = list.length === 0;
    for (const a of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'detail-act';
      if (a.title) b.title = a.title;
      if (a.icon) b.insertAdjacentHTML('beforeend', a.icon);
      const s = document.createElement('span');
      s.textContent = a.label;
      b.appendChild(s);
      b.addEventListener('click', a.run);
      actEl.appendChild(b);
    }
  }

  /* Eén schrijver voor drie dingen tegelijk: welk teken je ziet, wat de
     tooltip zegt, en wat een schermlezer voorleest. Uit elkaar getrokken
     gaan die drie een keer uit de pas lopen. */
  function syncCloseButton() {
    if (!closeBtn) return;
    const terug = !!backTo;
    closeBtn.dataset.mode = terug ? 'back' : 'close';
    closeBtn.title = terug ? 'Back' : 'Close';
    closeBtn.setAttribute('aria-label', terug ? 'Back to the previous reading' : 'Close detail panel');
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (backTo) { back(); return; }
      hide();
      if (onClose) onClose();
    });
  }

  /* De inhoud tekenen. Apart van `show()` omdat `refresh()` precies dit doet
     en verder niets — geen animatie, geen ondergrond, geen `onShow`. */
  function draw(view) {
    lastKind = view.kind || 'event';
    kickerEl.textContent = view.kicker || '';
    kickerEl.style.color = view.color || '';
    kickerEl.dataset.kind = lastKind;
    headEl.textContent = view.headline || '';

    drawRows(view.rows);

    // De plot krijgt elke keer een LEEG element. Hergebruiken zou de aanroeper
    // dwingen zijn eigen vorige tekening op te ruimen, en dat is precies het
    // soort schoonmaakwerk dat een keer wordt vergeten.
    plotEl.replaceChildren();
    plotEl.hidden = !view.plot;
    if (view.plot) view.plot(plotEl);

    drawActions(view.actions);

    /* A FILE AND A PAGE ARE NOT THE SAME BUTTON (session 42). `download` marks
       a link that saves a file instead of opening a page: it gets a ⤓ and the
       download attribute, so the browser saves rather than navigating away.
       The attribute is REMOVED again on a page link — the element is reused
       across views, and a leftover `download` would turn every later link into
       a save. */
    if (view.link && view.link.href) {
      linkEl.href = view.link.href;
      linkEl.textContent = (view.link.label || 'More info') + (view.link.download ? ' ⤓' : ' ↗');
      if (view.link.download) linkEl.setAttribute('download', '');
      else linkEl.removeAttribute('download');
      linkEl.hidden = false;
    } else {
      linkEl.hidden = true;
    }
  }

  /* ----------------------------------------------------------
     view:
       kind      'event' | 'body' | 'field' | 'solar'   (label; zie de kop)
       kicker    tekst bovenaan
       color     kleur van die tekst
       headline  de naam van het ding
       rows      [[label, waarde], …]   waarde: string, {text, href} of Node.
                 Een rij `[{ section: 'Kop' }]` tekent een sectiekop in plaats
                 van een sleutel/waarde-paar; een waarde
                 `{ absent: true, text: '…' }` tekent bleek en cursief. Zie
                 drawRows.
       plot      (el) => void           optioneel, tekent in een leeg element
       actions   [{label, title, icon, run}]  optioneel
       link      { href, label }        optioneel, de "meer info"-link

     opts:
       backTo    () => void   optioneel. De bouwer van de view die HIERONDER
                              ligt. Zolang hij er is toont de sluitknop een
                              pijl en brengt hij je daarheen terug.
  ---------------------------------------------------------- */
  function show(view, opts) {
    backTo = (opts && opts.backTo) || null;
    draw(view);
    syncCloseButton();

    host.style.pointerEvents = 'auto';   // de links moeten aanklikbaar zijn
    open = true;
    if (reducedMotion) {
      gsap.fromTo(host, { opacity: 0 }, { opacity: 1, duration: 0.2, overwrite: true });
    } else {
      gsap.fromTo(host, { opacity: 0, y: 16, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'back.out(1.4)', overwrite: true });
    }
    setTimeout(() => { if (open) gsap.set(host, { opacity: 1, y: 0, scale: 1 }); }, 700);
    if (onShow) onShow();
    meld();
  }

  /* Hertekenen wat er al staat. Voor de LEVENDE soorten: het magneetveld en een
     planeet worden herrekend zodra de tijd verschuift, en die update-functies
     komen hier per tijdstap langs. Twee dingen die `show()` wél doet en dit
     bewust niet: de ondergrond aanraken (die hoort bij hoe je hier kwam, niet
     bij de getallen) en opnieuw invliegen (een venster dat al staat hoort niet
     te flikkeren terwijl je aan de slider trekt). */
  function refresh(view) {
    if (!open) return false;
    const was = lastKind;
    draw(view);
    if (lastKind !== was) meld();
    return true;
  }

  /* Sluiten: terug naar de begintoestand uit css/app.css (opacity 0, geen
     pointer-events). GSAP mag hier alleen `opacity` en `y` aanraken; de
     plaatsing komt uit left/right/bottom en niet uit een transform. Zou de
     plaatsing ooit een transform worden, dan schiet dit venster net zo weg
     als de mode-switch in sessie 12. */
  function hide() {
    if (!open) return;
    open = false;
    backTo = null;
    syncCloseButton();
    host.style.pointerEvents = 'none';   // meteen, wacht niet op de animatie
    const settle = () => { if (!open) gsap.set(host, { opacity: 0, y: 0 }); };
    if (reducedMotion) {
      gsap.to(host, { opacity: 0, duration: 0.15, overwrite: true, onComplete: settle });
    } else {
      gsap.to(host, { opacity: 0, y: 10, duration: 0.22, ease: 'power2.in', overwrite: true, onComplete: settle });
    }
    setTimeout(settle, 500);   // vangnet, zie de kop
    meld();
  }

  /* Eén stap terug. `backTo` gaat op null vóór de aanroep, zodat de bouwer
     desgewenst zelf weer een nieuwe ondergrond mag zetten zonder dat wij die
     er meteen weer afhalen. Het venster blijft open — dat is het verschil met
     sluiten, en de reden dat `onClose` hier niet langskomt. */
  function back() {
    if (!backTo) return false;
    const herstel = backTo;
    backTo = null;
    herstel();
    syncCloseButton();
    meld();
    return true;
  }

  /* `kind()` bestaat voor de LEVENDE soorten. Een gebeurtenis is een momentopname
     en verandert niet meer, maar het magneetveld en een planeet worden opnieuw
     berekend zodra de tijd verschuift. Hun update-functies moeten dus kunnen
     vragen: sta ik nog in beeld? Zonder dit zouden ze in het wilde weg schrijven
     in een venster dat inmiddels iets heel anders toont. */
  return {
    show, refresh, hide, back,
    /* Meldt de HUIDIGE soort, of null als het venster dicht is. Precies wat een
       knop moet weten om te beslissen of hij "open" of "sluit" zegt. */
    onChange: (fn) => { luisteraars.push(fn); fn(open ? lastKind : null); return fn; },
    isOpen: () => open,
    canGoBack: () => !!backTo,
    kind: () => (open ? lastKind : null),
    element: host
  };
}
