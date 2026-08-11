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
------------------------------------------------------------ */
export function createDetailPanel(env) {
  const { host, gsap, reducedMotion, onShow } = env;

  const kickerEl = host.querySelector('.kicker');
  const headEl   = host.querySelector('.headline');
  const rowsEl   = host.querySelector('.detail-rows');
  const plotEl   = host.querySelector('.detail-plot');
  const actEl    = host.querySelector('.detail-actions');
  const linkEl   = host.querySelector('.more-link');

  let open = false;
  let laatsteSoort = null;

  /* Een waarde mag tekst zijn, een link, of een kant-en-klare Node. Meer
     vormen zijn er niet, en `innerHTML` staat er bewust NIET bij: zodra dit
     HTML uit een string accepteert, gaat er ooit iets ongeschoond doorheen
     dat uit een API komt. Wie opmaak nodig heeft, bouwt zelf een Node — dan
     is het de aanroeper die de stukjes kiest, en niet een string uit een
     antwoord van derden. */
  function waardeNode(v) {
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

  function tekenRijen(rows) {
    rowsEl.replaceChildren();
    for (const [k, v] of rows || []) {
      const rij = document.createElement('div');
      rij.className = 'row';
      const ks = document.createElement('span');
      ks.className = 'k';
      ks.textContent = k;
      const vs = document.createElement('span');
      vs.className = 'v';
      vs.appendChild(waardeNode(v));
      rij.append(ks, vs);
      rowsEl.appendChild(rij);
    }
  }

  /* De knoppen onderaan: "naar de plek" en "naar het moment". Ze staan er
     alleen als de beschrijving ze meegeeft — een AQI-station heeft geen
     gebeurtenistijd, een planeet geen registratiemoment, en een knop die
     niets kan doen is erger dan geen knop. */
  function tekenActies(actions) {
    actEl.replaceChildren();
    const lijst = actions || [];
    actEl.hidden = lijst.length === 0;
    for (const a of lijst) {
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

  /* ----------------------------------------------------------
     view:
       kind      'event' | 'body' | 'field'   (label; zie de kop)
       kicker    tekst bovenaan
       color     kleur van die tekst
       headline  de naam van het ding
       rows      [[label, waarde], …]   waarde: string of {text, href}
       plot      (el) => void           optioneel, tekent in een leeg element
       actions   [{label, title, icon, run}]  optioneel
       link      { href, label }        optioneel, de "meer info"-link
  ---------------------------------------------------------- */
  function show(view) {
    laatsteSoort = view.kind || 'event';
    kickerEl.textContent = view.kicker || '';
    kickerEl.style.color = view.color || '';
    kickerEl.dataset.kind = laatsteSoort;
    headEl.textContent = view.headline || '';

    tekenRijen(view.rows);

    // De plot krijgt elke keer een LEEG element. Hergebruiken zou de aanroeper
    // dwingen zijn eigen vorige tekening op te ruimen, en dat is precies het
    // soort schoonmaakwerk dat een keer wordt vergeten.
    plotEl.replaceChildren();
    plotEl.hidden = !view.plot;
    if (view.plot) view.plot(plotEl);

    tekenActies(view.actions);

    if (view.link && view.link.href) {
      linkEl.href = view.link.href;
      linkEl.textContent = (view.link.label || 'More info') + ' ↗';
      linkEl.hidden = false;
    } else {
      linkEl.hidden = true;
    }

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
  }

  /* Sluiten: terug naar de begintoestand uit css/app.css (opacity 0, geen
     pointer-events). GSAP mag hier alleen `opacity` en `y` aanraken; de
     plaatsing komt uit left/right/bottom en niet uit een transform. Zou de
     plaatsing ooit een transform worden, dan schiet dit venster net zo weg
     als de mode-switch in sessie 12. */
  function hide() {
    if (!open) return;
    open = false;
    host.style.pointerEvents = 'none';   // meteen, wacht niet op de animatie
    const settle = () => { if (!open) gsap.set(host, { opacity: 0, y: 0 }); };
    if (reducedMotion) {
      gsap.to(host, { opacity: 0, duration: 0.15, overwrite: true, onComplete: settle });
    } else {
      gsap.to(host, { opacity: 0, y: 10, duration: 0.22, ease: 'power2.in', overwrite: true, onComplete: settle });
    }
    setTimeout(settle, 500);   // vangnet, zie de kop
  }

  /* `kind()` bestaat voor de LEVENDE soorten. Een gebeurtenis is een momentopname
     en verandert niet meer, maar het magneetveld en een planeet worden opnieuw
     berekend zodra de tijd verschuift. Hun update-functies moeten dus kunnen
     vragen: sta ik nog in beeld? Zonder dit zouden ze in het wilde weg schrijven
     in een venster dat inmiddels iets heel anders toont. */
  return { show, hide, isOpen: () => open, kind: () => (open ? laatsteSoort : null), element: host };
}
