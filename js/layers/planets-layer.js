/* ============================================================
   TERRA — planetenlaag (three.js-adapter)
   ------------------------------------------------------------
   Hangt uitsluitend af van de THREE-instance die je meegeeft — zelfde
   afspraak als js/sunmoon-layer.js, en om dezelfde reden: deze module
   heeft geen mening over de three-versie en kan de CDN-drift van
   2026-06-26 niet opnieuw veroorzaken.

   COORDINATENFRAME — gedeeld met sunmoon-layer, world.getCoords() en de
   shader. Lengte 0 op +Z, 90 oost op +X, noordpool op +Y. Numeriek
   bewezen tot 6e-16 in sessie 14; niet opnieuw uitzoeken.

   ------------------------------------------------------------
   DRIE ONTWERPKEUZES DIE JE NIET PER ONGELUK MOET TERUGDRAAIEN
   ------------------------------------------------------------

   1. ALLE PLANETEN HEBBEN DEZELFDE STRAAL. Elke andere keuze
      suggereert een verhouding die niet klopt. Aan de hemel is
      Venus op zijn grootst 60 boogseconden en Jupiter 46 — de
      kleinste planeet lijkt dus de grootste, en dat is precies zo
      contra-intuitief als het klinkt. Grootte naar WARE straal is
      even fout: dan draagt het beeld een afstandsverhouding die de
      schil al niet heeft. De informatie zit in de helderheid.

   2. DE DEKKING VOLGT DE SCHIJNBARE MAGNITUDE, niet een
      ontwerpregel. Venus staat op -4, Neptunus op +8: twaalf
      magnituden is een factor 63.000 in helderheid, en dat is
      waarom de een opvalt en de ander nooit met het blote oog
      gezien is. De gradatie is daarmee een waarheid en geen stijl,
      en hij beweegt mee met de tijdkiezer — schuif naar een
      Mars-oppositie en Mars wordt zichtbaar helderder.
      ONDERGRENS 0,35: eerlijk doorgetrokken zou Neptunus onzichtbaar
      zijn, en dan heb je hem toegevoegd zonder hem te tonen.

   3. GEEN GRONDSPOOR. Het subplanetaire punt van Jupiter loopt 15
      graden per uur westwaarts, en dat is de draaiing van de AARDE.
      Een grondspoor tekent hier dus de aardrotatie en niets over de
      planeet. Wat wel alles zegt is het pad in RA/dec — daar zit de
      retrograde lus in. Zie hemelspoor() in compute/planets.js.
   ============================================================ */

import { planeetEfemeriden, PLANETEN, PLANEET_INFO } from '../compute/planets.js';
import { latLonToUnit } from '../sunmoon.js';

export function createPlanetsLayer(THREE, opts = {}) {
  const cfg = Object.assign({
    earthRadius:     100,
    schilBinnen:     330,   // Mercurius — ruim boven de maan (300)
    schilBuiten:     400,   // Neptunus  — ruim onder de zon (420)
    bolStraal:         6,
    subAltitude:    1.02,   // straal 102: boven de 101 van de schematische polygonen
    dekkingMin:     0.35,
    magHelder:      -4.5,   // Venus op zijn helderst
    magZwak:         8.0,   // Neptunus
    labelAfstandPx:   54,   // botsingsdrempel voor labels, in schermpixels
    labelHoogtePx:    26    // schermvast; zie schaalLabel()
  }, opts);

  const group = new THREE.Group();
  group.name = 'planets';

  /* ----------------------------------------------------------
     DE SCHIL — ware volgorde, sterk afgevlakte spreiding.

     Lineair op de halve lange as zou Mercurius t/m Mars in de
     eerste 5% van de ruimte proppen (Neptunus staat 78x verder dan
     Mercurius). De wortel comprimeert dat tot een factor 8,8: de
     ordening blijft afleesbaar en de binnenplaneten blijven uit
     elkaar te houden. Het is nadrukkelijk GEEN afstandsschaal — de
     readout geeft de ware afstand in AE, daar hoort dat getal.
  ---------------------------------------------------------- */
  const HALVE_LANGE_AS = {
    mercury: 0.387, venus: 0.723, mars: 1.524, jupiter: 5.203,
    saturn: 9.537, uranus: 19.19, neptune: 30.07
  };
  const wMin = Math.sqrt(HALVE_LANGE_AS.mercury);
  const wMax = Math.sqrt(HALVE_LANGE_AS.neptune);
  const schilVan = (k) => cfg.schilBinnen +
    (cfg.schilBuiten - cfg.schilBinnen) *
    (Math.sqrt(HALVE_LANGE_AS[k]) - wMin) / (wMax - wMin);

  /* HET LABEL-CANVAS. Staat hier en niet bij `maakLabel()`, want de lus
     hieronder roept die functie aan en zou deze `const` dan nog niet kunnen
     lezen: een functiedeclaratie is hoisted, een `const` niet. Dat is de
     temporal dead zone, en dit project is er nu zeven keer ingelopen — de
     module stopt, het bootscherm blijft staan, en de fout wijst naar een
     regel die er niets aan kan doen. Constanten die door de opbouw gelezen
     worden horen bóven die opbouw.

     HET CANVAS WORDT VOLGEMAAKT en dat is niet cosmetisch: eerst stond er
     22px tekst op een canvas van 64px hoog, en na schaling naar de sprite
     bleef daar 3,7 px van over — gemeten, volstrekt onleesbaar, terwijl elke
     controle keurig "label zichtbaar: true" meldde. Hoe voller het canvas,
     hoe meer schermpixels de tekst bij dezelfde spritehoogte krijgt. */
  const LABEL_CANVAS = { breed: 256, hoog: 56, font: 40 };

  /* ----------------------------------------------------------
     PER PLANEET: bol, subpunt op de bol, leader line, label.

     Het materiaal krijgt de kleur als BEGINWAARDE en niet als
     eindstation: `map` blijft leeg en kan later een textuur krijgen
     zonder dat deze laag opengebroken hoeft te worden. Dat is een
     eis uit het plan van sessie 22 (B3), niet een toevalligheid.
  ---------------------------------------------------------- */
  const lichamen = {};

  for (const k of PLANETEN) {
    const info = PLANEET_INFO[k];

    const bolMat = new THREE.MeshBasicMaterial({
      color: info.kleur, transparent: true, opacity: 1, map: null
    });
    const bol = new THREE.Mesh(new THREE.SphereGeometry(cfg.bolStraal, 24, 16), bolMat);

    // Het subplanetaire punt: waar hij loodrecht boven staat. Een platte
    // ring en geen bol, zodat hij op het oppervlak leest en niet erin.
    const subMat = new THREE.MeshBasicMaterial({
      color: info.kleur, transparent: true, opacity: 1,
      side: THREE.DoubleSide, depthWrite: false
    });
    const sub = new THREE.Mesh(new THREE.RingGeometry(1.4, 2.2, 24), subMat);

    // De leader line verbindt subpunt en lichaam. Twee vaste punten in
    // een hergebruikte buffer — nooit per frame een nieuwe geometrie,
    // dat is de les uit sessie 9 over de landnamen.
    const lijnMat = new THREE.LineBasicMaterial({
      color: info.kleur, transparent: true, opacity: 0.5
    });
    const lijnGeo = new THREE.BufferGeometry();
    lijnGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const lijn = new THREE.Line(lijnGeo, lijnMat);

    const label = maakLabel(THREE, info.naam, info.kleur);

    group.add(bol, sub, lijn, label);
    lichamen[k] = { bol, bolMat, sub, subMat, lijn, lijnGeo, lijnMat, label,
                    schil: schilVan(k), zichtbaar: true, dekking: 1, scherm: null };
  }

  /* Een label is een sprite met een canvas-textuur. Zelfde aanpak als de
     rest van Terra: geen tekstgeometrie, want die kostte in sessie 9 een
     p90 van 357 ms bij de landnamen. De maten staan in LABEL_CANVAS, boven
     de lus die deze functie aanroept — zie de noot daar. */
  function maakLabel(THREE, tekst, kleur) {
    const cv = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = LABEL_CANVAS.breed * dpr; cv.height = LABEL_CANVAS.hoog * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.font = '600 ' + LABEL_CANVAS.font + 'px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(tekst, LABEL_CANVAS.breed / 2, LABEL_CANVAS.hoog / 2);
    ctx.fillStyle = '#' + kleur.toString(16).padStart(6, '0');
    ctx.fillText(tekst, LABEL_CANVAS.breed / 2, LABEL_CANVAS.hoog / 2);
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(1, LABEL_CANVAS.hoog / LABEL_CANVAS.breed, 1);  // schaalLabel() zet de maat
    return sp;
  }

  /* SCHERMVAST, net als de icoonschaling elders in Terra. Een vaste
     wereldmaat werkt hier niet: het zoombereik van deze state loopt van de
     aarde tot voorbij Neptunus, en een sprite die daar leesbaar is bedekt
     van dichtbij het halve scherm. De maat wordt dus per update uit de
     camera-afstand teruggerekend naar het aantal pixels dat we willen. */
  function schaalLabel(L, camera) {
    const d = camera.position.distanceTo(L.label.position);
    const perPixel = 2 * d * Math.tan(camera.fov / 2 * Math.PI / 180) / window.innerHeight;
    const h = cfg.labelHoogtePx * perPixel;
    L.label.scale.set(h * LABEL_CANVAS.breed / LABEL_CANVAS.hoog, h, 1);
  }

  /* ----------------------------------------------------------
     DEKKING UIT MAGNITUDE.

     Magnitude is zelf al logaritmisch in helderheid, dus een
     lineaire afbeelding hierop is de juiste: gelijke stappen in
     magnitude geven gelijke stappen in dekking.
  ---------------------------------------------------------- */
  function dekkingVan(mag) {
    const t = (mag - cfg.magHelder) / (cfg.magZwak - cfg.magHelder);
    const k = 1 - Math.max(0, Math.min(1, t)) * (1 - cfg.dekkingMin);
    return Math.max(cfg.dekkingMin, Math.min(1, k));
  }

  const _v = new THREE.Vector3();
  let focus = null;          // sleutel van het lichaam in focus, of null
  let laatsteEph = null;

  /* ----------------------------------------------------------
     UPDATE — de posities op een moment.

     Wordt aangeroepen door de state, niet per frame. De efemeriden
     kosten microseconden, maar de labelbotsing vraagt een projectie
     per lichaam en die hoort niet in de renderlus thuis.
  ---------------------------------------------------------- */
  function update(date, camera) {
    const eph = planeetEfemeriden(date);
    laatsteEph = eph;

    for (const k of PLANETEN) {
      const L = lichamen[k], p = eph[k];
      const u = latLonToUnit(p.sub.lat, p.sub.lon);

      L.bol.position.set(u.x * L.schil, u.y * L.schil, u.z * L.schil);

      const rs = cfg.earthRadius * cfg.subAltitude;
      L.sub.position.set(u.x * rs, u.y * rs, u.z * rs);
      // Radiaal naar BUITEN richten. `lookAt(0,0,0)` legt +Z naar binnen
      // en laat de ring in de aarde verdwijnen — zie de glyph-noot in
      // het geheugen van sessie 4.
      L.sub.lookAt(L.sub.position.clone().multiplyScalar(2));

      const pos = L.lijnGeo.attributes.position;
      pos.setXYZ(0, u.x * rs, u.y * rs, u.z * rs);
      pos.setXYZ(1, L.bol.position.x, L.bol.position.y, L.bol.position.z);
      pos.needsUpdate = true;

      L.label.position.copy(L.bol.position).multiplyScalar(1.06);

      L.dekking = dekkingVan(p.magnitude);
      pasDekkingToe(k);
    }

    if (camera) regelLabels(camera);
    return eph;
  }

  /* Dekking per lichaam. Het lichaam in focus staat altijd vol; de rest
     volgt zijn helderheid. De leader line en het subpunt zijn nog eens
     de helft zwakker dan het lichaam zelf: ze verbinden en dringen niet
     op de voorgrond. */
  function pasDekkingToe(k) {
    const L = lichamen[k];
    const vol = focus === k;
    const d = vol ? 1 : L.dekking;
    L.bolMat.opacity = d;
    L.subMat.opacity = vol ? 0.9 : d * 0.55;
    L.lijnMat.opacity = vol ? 0.75 : d * 0.4;
    L.label.material.opacity = vol ? 1 : d;
  }

  /* ----------------------------------------------------------
     LABELBOTSING — zeven labels op halve dekking zijn nog steeds
     zeven labels, en daar ontstaat de wirwar. Dit is dezelfde
     afweging die sessie 9 voor de landnamen maakte: niet de rang
     bepaalt wie er staat, maar of er ruimte is.

     Bij een botsing wint de HELDERSTE. Dat is dezelfde regel als
     bij de dekking, dus het beeld blijft consistent: wat opvalt aan
     de hemel valt hier ook op.
  ---------------------------------------------------------- */
  function regelLabels(camera) {
    const zichtbaar = [];
    for (const k of PLANETEN) {
      const L = lichamen[k];
      if (!L.zichtbaar) { L.label.visible = false; continue; }
      _v.copy(L.bol.position).project(camera);
      // Achter de camera: project() spiegelt dan, dus expliciet weg.
      if (_v.z > 1) { L.label.visible = false; L.scherm = null; continue; }
      L.scherm = { x: (_v.x + 1) / 2 * window.innerWidth,
                   y: (1 - _v.y) / 2 * window.innerHeight };
      schaalLabel(L, camera);
      zichtbaar.push(k);
    }
    // Helderste eerst: die claimt zijn plek en de rest wijkt.
    zichtbaar.sort((a, b) => laatsteEph[a].magnitude - laatsteEph[b].magnitude);
    const bezet = [];
    for (const k of zichtbaar) {
      const L = lichamen[k];
      const botst = bezet.some(b =>
        Math.hypot(b.x - L.scherm.x, b.y - L.scherm.y) < cfg.labelAfstandPx);
      // Het lichaam in focus wijkt nooit — dat is waar de gebruiker naar kijkt.
      L.label.visible = !botst || focus === k;
      if (L.label.visible) bezet.push(L.scherm);
    }
  }

  function setFocus(sleutel) {
    focus = sleutel && lichamen[sleutel] ? sleutel : null;
    for (const k of PLANETEN) pasDekkingToe(k);
    return focus;
  }

  function setVisible(aan) {
    group.visible = !!aan;
  }

  /* Een enkele planeet aan of uit. De laag houdt de vlag zelf bij zodat
     regelLabels() niet naar meshes hoeft te kijken die er niet zijn. */
  function setPlaneetVisible(sleutel, aan) {
    const L = lichamen[sleutel];
    if (!L) return;
    L.zichtbaar = !!aan;
    L.bol.visible = L.sub.visible = L.lijn.visible = L.zichtbaar;
    if (!L.zichtbaar) L.label.visible = false;
  }

  /* Welke planeet ligt het dichtst bij een schermpunt? Voor klikken.
     Geen raycaster: de bollen zijn klein en de labels tellen mee, dus
     een schermafstand is hier zowel goedkoper als vergevingsgezinder. */
  function raakPunt(x, y, marge = 34) {
    let best = null, bestD = marge;
    for (const k of PLANETEN) {
      const L = lichamen[k];
      if (!L.zichtbaar || !L.scherm) continue;
      const d = Math.hypot(L.scherm.x - x, L.scherm.y - y);
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
  }

  return {
    group, update, setVisible, setPlaneetVisible, setFocus, raakPunt,
    // Alleen de labels opnieuw meten en schalen, zonder de efemeriden aan te
    // raken. Hangt aan de zoom: de maat is schermvast, dus hij moet mee met de
    // camera-afstand. LET OP bij het aankoppelen — `world.onZoom` is een SETTER
    // en geen abonnement; een tweede toewijzing vervangt de eerste stil. Haak
    // hierop aan in de bestaande handler, maak er geen nieuwe.
    hertekenLabels: (camera) => { if (group.visible && laatsteEph) regelLabels(camera); },
    config: cfg,
    lichamen,
    efemeriden: () => laatsteEph,
    focus: () => focus
  };
}
