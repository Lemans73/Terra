// ============================================================
//  geomag-layer.js — de twee assen door de aarde, als three-objecten
//
//  THREE komt als ARGUMENT binnen en wordt hier niet geïmporteerd. Zelfde
//  afspraak als in sunmoon-layer.js, en om dezelfde reden: één instantie van
//  three in de hele app, en geen tweede kopie die via een eigen import
//  binnenkomt.
//
//  Wat deze laag tekent:
//    - de geografische rotatie-as: de lijn +Y naar -Y, met een schijf op elke pool
//    - de geomagnetische dipoolas: dezelfde vorm, ongeveer 9,4 graden gekanteld,
//      plus de geomagnetische equator als grootcirkel loodrecht op die as
//    - het driftspoor van de geomagnetische noordpool van 1900 tot 2030
//
//  DE AS ZIT GROTENDEELS IN DE AARDE. Een ondoorzichtige bol laat alleen de
//  uitstekende einden zien, en juist de hoek tussen de twee assen is het verhaal.
//  Vandaar per as twee onderdelen: massieve cylinders buiten de bol (gewone
//  dieptetoets, dus de maan schuift er correct voor langs) en één gestippelde
//  koorde dwars door de bol met `depthTest: false`, die als doorsnedetekening
//  leest. Valt dat röntgenbeeld tegen, dan kan `setVisible({ chords: false })`
//  eraf zonder dat de rest iets mist.
//
//  HOOGTES. Alles op het oppervlak moet boven straal 101 blijven: de schematische
//  weergave legt de land-polygons daar neer en slikt wat eronder ligt. Zie de
//  noot bij twilightAltitude in sunmoon-layer.js.
// ============================================================

import { dipole, dipoleAxis, poleDriftTrack, latLonToUnit, MODEL_RANGE } from './geomag.js';

export function createGeomagLayer(THREE, opts = {}) {
  const cfg = Object.assign({
    earthRadius: 100,
    // Hoe ver de as buiten de bol uitsteekt, als fractie van de straal.
    stubLength: 0.34,
    stubRadius: 0.55,
    // De schijf op elke pool. Boven 101 (land-polygons) en zo laag mogelijk,
    // zelfde klem als subPointAltitude in de zon/maan-laag.
    // Kleiner dan de subpunt-markers van zon en maan (2,6) en dat is met opzet:
    // het einde van het driftspoor komt hier binnen, en een grotere schijf legde
    // de laatste decennia van dat spoor toe zodra je inzoomde.
    poleMarkerRadius: 1.6,
    poleAltitude: 0.016,
    // Grootcirkel loodrecht op de dipoolas.
    equatorAltitude: 0.016,
    // Het driftspoor: boven de schemeringslijnen (101,4), onder de ground
    // tracks (101,8), zodat de lagen elkaar niet doorsnijden.
    trailAltitude: 0.017,
    // Middelhelder houden: de UnrealBloomPass pakt alles boven de drempel op en
    // maakt er dan gloeiende vlekken van in plaats van lijnen.
    rotationColor: 0x8fa3bd,
    dipoleColor: 0xff7a4d,
    trailColor: 0xffb08a,
    equatorColor: 0xff7a4d
  }, opts);

  const R = cfg.earthRadius;
  const group = new THREE.Group();
  group.name = 'terra-geomag';

  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  const vec = (u, r = 1, target = new THREE.Vector3()) => target.set(u.x * r, u.y * r, u.z * r);
  const fromLatLon = (lat, lon, r = 1, target = new THREE.Vector3()) =>
    vec(latLonToUnit(lat, lon), r, target);

  /* ---- de uitstekende einden ----
     Een CylinderGeometry staat langs +Y. `setFromUnitVectors` draait hem naar de
     as toe; dat is de goedkoopste route en hij raakt geen enkele matrixWorld aan,
     wat bij `lookAt()` juist de valkuil is (sessie 15). */
  const stubLen = R * cfg.stubLength;
  const _as = new THREE.Vector3();
  const _op = new THREE.Vector3(0, 1, 0);

  function makeStub(color) {
    const m = new THREE.Mesh(
      track(new THREE.CylinderGeometry(cfg.stubRadius, cfg.stubRadius, stubLen, 12)),
      track(new THREE.MeshBasicMaterial({ color }))
    );
    m.frustumCulled = false;
    return m;
  }

  // Zet een cylinder op het uiteinde van de as. `teken` is +1 voor de noordkant
  // en -1 voor de zuidkant; het midden van de cylinder ligt een halve lengte
  // buiten de bol, zodat hij precies aansluit op het oppervlak.
  function plaatsStub(mesh, as, teken) {
    _as.copy(as).multiplyScalar(teken);
    mesh.quaternion.setFromUnitVectors(_op, _as);
    mesh.position.copy(_as).multiplyScalar(R + stubLen / 2);
  }

  /* ---- de koorde door de bol ----
     depthTest uit én renderOrder HOOG, en die twee horen bij elkaar. Alleen
     depthTest uitzetten is niet genoeg: met een lage renderOrder tekent de lijn
     vóór de aarde en schildert de bol hem daarna gewoon weer over. Gemeten: met
     renderOrder -1 was er niets te zien. Hij moet als laatste, dán ligt hij als
     doorsnedelijn over de bol heen. De lage opacity houdt het een aanwijzing en
     geen streep dwars door het beeld. */
  function makeChord(color) {
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const m = track(new THREE.LineDashedMaterial({
      color, dashSize: 4, gapSize: 4, transparent: true, opacity: 0.32,
      depthTest: false, depthWrite: false
    }));
    const l = new THREE.Line(g, m);
    l.computeLineDistances();
    l.frustumCulled = false;
    l.renderOrder = 4;
    return l;
  }

  // Hergebruikte buffer. computeLineDistances() is verplicht na élke
  // positiewijziging, anders houdt three het streepjespatroon van de vorige stand.
  function setSegments(line, a, b) {
    const arr = line.geometry.attributes.position.array;
    arr[0] = a.x; arr[1] = a.y; arr[2] = a.z;
    arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
    line.geometry.attributes.position.needsUpdate = true;
    line.geometry.computeBoundingSphere();
    line.computeLineDistances();
  }

  /* ---- poolschijven ----
     Platte schijven en geen bollen, en radiaal naar buiten gericht met
     lookAt(2 * positie). lookAt(0,0,0) zou +Z naar binnen richten en de schijf in
     de bol laten verdwijnen — dezelfde gotcha als bij de subpunt-markers. */
  function makeDisc(color, size) {
    const m = new THREE.Mesh(
      track(new THREE.CircleGeometry(size, 32)),
      track(new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.9, depthWrite: false
      }))
    );
    m.renderOrder = 2;
    return m;
  }
  const _look = new THREE.Vector3();
  function legPlat(mesh) {
    mesh.lookAt(_look.copy(mesh.position).multiplyScalar(2));
  }

  // ---- rotatie-as (statisch) ----
  const rotGroup = new THREE.Group();
  const rotN = makeStub(cfg.rotationColor);
  const rotS = makeStub(cfg.rotationColor);
  const rotChord = makeChord(cfg.rotationColor);
  const rotDiscN = makeDisc(cfg.rotationColor, cfg.poleMarkerRadius);
  const rotDiscS = makeDisc(cfg.rotationColor, cfg.poleMarkerRadius);
  rotGroup.add(rotN, rotS, rotChord, rotDiscN, rotDiscS);
  group.add(rotGroup);

  // ---- dipoolas (volgt het moment) ----
  const dipGroup = new THREE.Group();
  const dipN = makeStub(cfg.dipoleColor);
  const dipS = makeStub(cfg.dipoleColor);
  const dipChord = makeChord(cfg.dipoleColor);
  const dipDiscN = makeDisc(cfg.dipoleColor, cfg.poleMarkerRadius);
  const dipDiscS = makeDisc(cfg.dipoleColor, cfg.poleMarkerRadius);
  dipGroup.add(dipN, dipS, dipChord, dipDiscN, dipDiscS);

  // De geomagnetische equator: de grootcirkel loodrecht op de dipoolas. Zelfde
  // orthonormale-basis-truc als updateSmallCircle() in de zon/maan-laag, mét de
  // degeneratie-check — en die is hier écht nodig, want de dipoolas ligt op
  // ongeveer 9 graden van +Y en het naïeve referentievlak zou ontaarden.
  const SEG = 240;
  const equatorLine = (() => {
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 3), 3));
    const l = new THREE.LineLoop(g, track(new THREE.LineBasicMaterial({
      color: cfg.equatorColor, transparent: true, opacity: 0.5
    })));
    l.frustumCulled = false;
    return l;
  })();
  dipGroup.add(equatorLine);
  group.add(dipGroup);

  const _u = new THREE.Vector3(), _v = new THREE.Vector3(), _ref = new THREE.Vector3();
  function updateGreatCircle(line, axis, radius) {
    _ref.set(0, 1, 0);
    if (Math.abs(axis.y) > 0.9) _ref.set(1, 0, 0);
    _u.crossVectors(axis, _ref).normalize();
    _v.crossVectors(axis, _u).normalize();
    const arr = line.geometry.attributes.position.array;
    for (let i = 0; i <= SEG; i++) {
      const t = (i / SEG) * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
      arr[i * 3]     = (_u.x * ct + _v.x * st) * radius;
      arr[i * 3 + 1] = (_u.y * ct + _v.y * st) * radius;
      arr[i * 3 + 2] = (_u.z * ct + _v.z * st) * radius;
    }
    line.geometry.attributes.position.needsUpdate = true;
    line.geometry.computeBoundingSphere();
  }

  /* ---- het driftspoor ----
     STATISCH: het pad van 1900 tot 2030 hangt niet van het gekozen moment af, dus
     dit wordt één keer gebouwd en daarna nooit meer. Geen smoring nodig, anders
     dan bij de ground tracks van de zon en de maan, die wél met de tijdkiezer
     meebewegen en daarom een debounce hebben. */
  const trailLine = new THREE.Line(
    track(new THREE.BufferGeometry()),
    track(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }))
  );
  trailLine.frustumCulled = false;
  const trailTicks = new THREE.Points(
    track(new THREE.BufferGeometry()),
    track(new THREE.PointsMaterial({
      color: cfg.trailColor, size: 1.5, sizeAttenuation: true, transparent: true, opacity: 0.85
    }))
  );
  trailTicks.frustumCulled = false;
  const trailGroup = new THREE.Group();
  trailGroup.add(trailLine, trailTicks);
  group.add(trailGroup);

  function buildTrail() {
    const punten = poleDriftTrack();
    const r = R * (1 + cfg.trailAltitude);
    const n = punten.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color(cfg.trailColor);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      fromLatLon(punten[i].lat, punten[i].lon, r, v);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      // Zelfde ramp als de ground tracks: het verleden gedimd, het heden helder.
      const k = 0.20 + 0.80 * (i / (n - 1));
      col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
    }
    trailLine.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    trailLine.geometry = g;

    // Eén stip per epoche uit de tabel, dus elke vijf jaar: dat geeft het spoor
    // een schaal, anders is het een lijn zonder maat.
    const tikken = [];
    for (let jaar = MODEL_RANGE[0]; jaar <= MODEL_RANGE[1] + 1e-9; jaar += 5) {
      const p = punten.find(q => q.jaar >= jaar - 1e-9) || punten[punten.length - 1];
      fromLatLon(p.lat, p.lon, r * 1.003, v);
      tikken.push(v.x, v.y, v.z);
    }
    trailTicks.geometry.dispose();
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tikken), 3));
    trailTicks.geometry = tg;
  }
  buildTrail();

  // ---- de rotatie-as staat vast, dus één keer plaatsen ----
  const rotAxis = new THREE.Vector3(0, 1, 0);
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  (function plaatsRotatieAs() {
    plaatsStub(rotN, rotAxis, 1);
    plaatsStub(rotS, rotAxis, -1);
    setSegments(rotChord,
      _a.copy(rotAxis).multiplyScalar(R),
      _b.copy(rotAxis).multiplyScalar(-R));
    const rp = R * (1 + cfg.poleAltitude);
    rotDiscN.position.copy(rotAxis).multiplyScalar(rp); legPlat(rotDiscN);
    rotDiscS.position.copy(rotAxis).multiplyScalar(-rp); legPlat(rotDiscS);
  })();

  // ---- per moment ----
  const dipAxis = new THREE.Vector3();
  let laatste = null;

  function update(date) {
    // De stand zelf is drie floating-point-bewerkingen en wordt ALTIJD berekend,
    // ook met de laag uit: de readout in het paneel leest hem. Het tekenwerk
    // eronder slaan we wel over zolang er niets te zien is.
    const d = dipole(date);
    vec(dipoleAxis(d), 1, dipAxis);
    laatste = d;
    if (!dipGroup.visible) return d;
    plaatsStub(dipN, dipAxis, 1);
    plaatsStub(dipS, dipAxis, -1);
    setSegments(dipChord,
      _a.copy(dipAxis).multiplyScalar(R),
      _b.copy(dipAxis).multiplyScalar(-R));
    const dp = R * (1 + cfg.poleAltitude);
    dipDiscN.position.copy(dipAxis).multiplyScalar(dp); legPlat(dipDiscN);
    dipDiscS.position.copy(dipAxis).multiplyScalar(-dp); legPlat(dipDiscS);
    if (equatorLine.visible) updateGreatCircle(equatorLine, dipAxis, R * (1 + cfg.equatorAltitude));
    return d;
  }

  // ---- zichtbaarheid ----
  const targets = {
    rotation: [rotGroup],
    dipole: [dipGroup],
    trail: [trailGroup],
    equator: [equatorLine],
    chords: [rotChord, dipChord]
  };

  function setVisible(what) {
    for (const [k, aan] of Object.entries(what)) {
      (targets[k] || []).forEach(o => { o.visible = aan; });
      // De equator wordt alleen bijgewerkt als hij zichtbaar is, dus na het
      // aanzetten moet hij één keer alsnog gebouwd worden.
      if (k === 'equator' && aan && laatste) {
        updateGreatCircle(equatorLine, dipAxis, R * (1 + cfg.equatorAltitude));
      }
    }
  }

  function dispose() {
    disposables.forEach(o => o.dispose && o.dispose());
    group.traverse(o => {
      if (o.geometry && o.geometry.dispose) o.geometry.dispose();
      if (o.material && o.material.dispose) o.material.dispose();
    });
    if (group.parent) group.parent.remove(group);
  }

  // Beginstand. MOET overeenkomen met de klasse `on` in de markup en met de
  // `start`-parameter van de toggles in index.html — drie plekken, één verhaal.
  // Alles uit: dit is een laag die je erbij zet, niet een die er altijd hoort.
  setVisible({ rotation: false, dipole: false, trail: false, equator: true, chords: true });

  return {
    group, update, setVisible, dispose, config: cfg,
    get last() { return laatste; },
    // Levende referenties, geen kopieën: `dipAxis` wordt in update() ter plekke
    // bijgewerkt, en wie de N/S-labels plaatst wil de stand van dit moment.
    dipoleAxisVector: dipAxis,
    rotationAxisVector: rotAxis,
    // Waar het uiteinde van een as ligt. Staat hier zodat index.html die rekensom
    // niet hoeft over te schrijven; verandert `stubLength`, dan schuiven de labels
    // vanzelf mee.
    axisTipRadius: R + stubLen,
    meshes: { rotGroup, dipGroup, trailGroup, equatorLine, rotChord, dipChord }
  };
}
