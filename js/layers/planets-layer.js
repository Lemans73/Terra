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

import { planetEphemerides, skyTrack, projectedOrbit, PLANETS,
         PLANET_INFO } from '../compute/planets.js';
import { latLonToUnit, ephemeris, norm180 } from '../sunmoon.js';
import { gastFrom } from '../compute/frames.js';
import { createLabelSprite, scaleToPixels } from '../core/label-sprite.js';

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

  /* HET LABEL-CANVAS. Staat hier en niet verderop, want de opbouwlus
     hieronder leest het en zou deze `const` dan nog niet kunnen zien: een
     functiedeclaratie is hoisted, een `const` niet. Dat is de temporal dead
     zone, en dit project is er nu zeven keer ingelopen — de module stopt,
     het bootscherm blijft staan, en de fout wijst naar een regel die er
     niets aan kan doen. Constanten die door de opbouw gelezen worden horen
     bóven die opbouw.

     HET CANVAS WORDT VOLGEMAAKT en dat is niet cosmetisch: eerst stond er
     22px tekst op een canvas van 64px hoog, en na schaling naar de sprite
     bleef daar 3,7 px van over — gemeten, volstrekt onleesbaar, terwijl elke
     controle keurig "label zichtbaar: true" meldde. Hoe voller het canvas,
     hoe meer schermpixels de tekst bij dezelfde spritehoogte krijgt.

     De opbouw zelf staat sinds sessie 23 in core/label-sprite.js; deze
     maten blijven hier omdat ze bij DEZE laag horen — planeetnamen zijn
     langer dan "L1" en vragen een breder canvas. */
  const LABEL_CANVAS = { width: 256, height: 56, font: 40 };

  /* Een label is een sprite met een canvas-textuur, en schermvast geschaald.
     Beide staan sinds sessie 23 in core/label-sprite.js met de gemeten uitleg
     erbij; hier blijven alleen de twee aanroepen die de maten van DEZE laag
     meegeven.

     EN ZE STAAN BOVEN DE LUS, om exact de reden die er twee alinea's hoger
     staat: dit waren functiedeclaraties en zijn nu `const`. Hoisting valt
     daarmee weg, en de opbouwlus roept `maakLabel()` aan. Onderaan gezet is
     dit een temporal dead zone en een leeg bootscherm — voor de achtste keer. */
  const maakLabel = (THREE_, tekst, kleur) =>
    createLabelSprite(THREE_, tekst, kleur, LABEL_CANVAS);

  const schaalLabel = (L, camera) =>
    scaleToPixels(THREE, L.label, camera, cfg.labelHoogtePx);

  /* ----------------------------------------------------------
     PER PLANEET: bol, subpunt op de bol, leader line, label.

     Het materiaal krijgt de kleur als BEGINWAARDE en niet als
     eindstation: `map` blijft leeg en kan later een textuur krijgen
     zonder dat deze laag opengebroken hoeft te worden. Dat is een
     eis uit het plan van sessie 22 (B3), niet een toevalligheid.
  ---------------------------------------------------------- */
  const lichamen = {};

  for (const k of PLANETS) {
    const info = PLANET_INFO[k];

    const bolMat = new THREE.MeshBasicMaterial({
      color: info.color, transparent: true, opacity: 1, map: null
    });
    const bol = new THREE.Mesh(new THREE.SphereGeometry(cfg.bolStraal, 24, 16), bolMat);

    // Het subplanetaire punt: waar hij loodrecht boven staat. Een platte
    // ring en geen bol, zodat hij op het oppervlak leest en niet erin.
    const subMat = new THREE.MeshBasicMaterial({
      color: info.color, transparent: true, opacity: 1,
      side: THREE.DoubleSide, depthWrite: false
    });
    const sub = new THREE.Mesh(new THREE.RingGeometry(1.4, 2.2, 24), subMat);

    // De leader line verbindt subpunt en lichaam. Twee vaste punten in
    // een hergebruikte buffer — nooit per frame een nieuwe geometrie,
    // dat is de les uit sessie 9 over de landnamen.
    const lijnMat = new THREE.LineBasicMaterial({
      color: info.color, transparent: true, opacity: 0.5
    });
    const lijnGeo = new THREE.BufferGeometry();
    lijnGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const lijn = new THREE.Line(lijnGeo, lijnMat);

    const label = maakLabel(THREE, info.name, info.color);

    group.add(bol, sub, lijn, label);
    lichamen[k] = { bol, bolMat, sub, subMat, lijn, lijnGeo, lijnMat, label,
                    schil: schilVan(k), zichtbaar: true, dekking: 1, scherm: null };
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
    const eph = planetEphemerides(date);
    laatsteEph = eph;

    for (const k of PLANETS) {
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
    // Het spoor hoort bij het moment: schuift de tijdkiezer, dan schuift de
    // lus mee. Gesmoord, want dit zijn 160 efemeriden per herbouw.
    if (spoorDagen && focus) planSpoor(date, focus);
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
    for (const k of PLANETS) {
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

  /* ==========================================================
     HET HEMELSPOOR — met de retrograde lus erin.

     WAT DIT LAAT ZIEN. Een planeet loopt maandenlang oostwaarts langs
     de sterren, staat dan stil, loopt een tijd ACHTERUIT, en gaat weer
     verder. Mars doet dat rond elke oppositie. Er is geen manier om die
     lus te verklaren met een planeet die om de aarde draait — hij
     ontstaat doordat de aarde hem aan de binnenkant inhaalt. Dit is dus
     niet alleen het mooiste planeetfenomeen dat er is, het is ook wat
     deze hele geocentrische weergave eerlijk houdt: je ziet de banen
     niet, maar je ziet wel het bewijs dat ze niet om ons heen lopen.

     EEN VASTE STERRENTIJD VOOR HET HELE SPOOR, en dat is de hele truc.
     Neem je per punt de `gast` van dat moment, dan draait de aarde
     onder het pad door en krijg je een spiraal van 90 windingen die
     uitsluitend de AARDROTATIE toont — precies het grondspoor dat hier
     niets zegt. Met een bevroren sterrentijd staat de hemel stil en
     beweegt alleen de planeet. Het spoor ligt daarmee in het frame van
     de sterren, niet in dat van de grond.
  ========================================================== */
  const spoorMat = new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.55
  });
  const spoorGeo = new THREE.BufferGeometry();
  const spoorLijn = new THREE.Line(spoorGeo, spoorMat);
  spoorLijn.visible = false;
  spoorLijn.frustumCulled = false;
  group.add(spoorLijn);

  let spoorDagen = 0;              // 0 = uit
  let spoorTimer = null;
  let spoorVoor = null;            // voor welke planeet het er ligt

  /* HET VENSTER 'orbit' IS IETS ANDERS DAN EEN LANG DAGVENSTER, en dat
     verschil is de reden dat het bestaat. Het pad van Neptunus over één
     omlooptijd is 165 retrograde lussen; met 160 monsterpunten aliassen die
     tot een gladde cirkel — het juiste plaatje om de verkeerde reden, en voor
     Mars een onleesbare kluwen. `projectedOrbit()` houdt de aarde stil en laat
     alleen de planeet zijn baan rondgaan: geen pad over tijd maar het antwoord
     op "waar KAN dit lichaam aan de hemel staan". Voor Mercurius en Venus is
     dat een lus om de zon waarvan de wijdte hun grootste elongatie is; voor de
     buitenplaneten iets dat dicht bij de ecliptica blijft.

     Het is bovendien exact dezelfde baan die de heliocentrische weergave als
     ring tekent — dezelfde `orbitBasis`/`orbitPoint`, van de andere kant
     bekeken. Dat is precies wat de twee weergaven naast elkaar moeten zeggen. */
  function bouwSpoor(date, sleutel) {
    if (!sleutel || !spoorDagen) { spoorLijn.visible = false; spoorVoor = null; return; }
    const L = lichamen[sleutel];
    const gast = gastFrom(ephemeris(date));          // BEVROREN, zie de noot hierboven
    const punten = spoorDagen === 'orbit'
      ? projectedOrbit(date, sleutel, 240)
      : skyTrack(date, sleutel, spoorDagen, 160);
    const arr = new Float32Array(punten.length * 3);
    for (let i = 0; i < punten.length; i++) {
      const u = latLonToUnit(punten[i].dec, norm180(punten[i].ra - gast));
      arr[i * 3]     = u.x * L.schil;
      arr[i * 3 + 1] = u.y * L.schil;
      arr[i * 3 + 2] = u.z * L.schil;
    }
    spoorGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    spoorGeo.computeBoundingSphere();
    spoorMat.color.setHex(PLANET_INFO[sleutel].color);
    spoorLijn.visible = true;
    spoorVoor = sleutel;
  }

  /* Gesmoord op 120 ms, hetzelfde patroon en dezelfde reden als bij de
     ground tracks in sessie 14: die maten daar 6,9 ms mediaan met
     uitschieters naar 29 ms, en dit zijn 160 volledige efemeriden per
     herbouw. Tijdens het slepen van de tijdslider hoort er niets te
     gebeuren. */
  function planSpoor(date, sleutel) {
    clearTimeout(spoorTimer);
    spoorTimer = setTimeout(() => bouwSpoor(date, sleutel), 120);
  }

  /* `dagen` is een getal of de string 'orbit'. Die laatste overleeft de `|| 0`
     hieronder omdat een niet-lege string truthy is — geen toeval, maar wel iets
     om te weten als hier ooit een lege waarde bij komt. */
  function setSpoorVenster(dagen, date) {
    spoorDagen = dagen || 0;
    if (!spoorDagen) { spoorLijn.visible = false; spoorVoor = null; return; }
    if (focus && date) bouwSpoor(date, focus);
  }

  function setFocus(sleutel, date) {
    focus = sleutel && lichamen[sleutel] ? sleutel : null;
    for (const k of PLANETS) pasDekkingToe(k);
    if (spoorDagen && date) bouwSpoor(date, focus);
    else if (!focus) { spoorLijn.visible = false; spoorVoor = null; }
    return focus;
  }

  /* setVisible() zet alleen een vlag; de posities worden in update() gezet, en
     die slaat alles over zolang de laag verborgen is. Zonder deze aanroep
     gebeurt er dus niets zichtbaars tot de volgende tik van dertig seconden.
     Dezelfde val als bij de zon/maan-laag in sessie 14. */
  function setVisible(aan, date, camera) {
    group.visible = !!aan;
    if (group.visible && date) update(date, camera);
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
    for (const k of PLANETS) {
      const L = lichamen[k];
      if (!L.zichtbaar || !L.scherm) continue;
      const d = Math.hypot(L.scherm.x - x, L.scherm.y - y);
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
  }

  return {
    group, update, setVisible, setPlaneetVisible, setFocus, raakPunt,
    setSpoorVenster,
    spoorVenster: () => spoorDagen,
    spoorVoor: () => spoorVoor,
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
