/* ============================================================
   TERRA — zon/maan-laag (three.js-adapter)
   ------------------------------------------------------------
   Hangt uitsluitend af van de THREE-instance die je meegeeft, dus deze module
   heeft geen mening over de three-versie en kan de CDN-drift van 2026-06-26
   niet opnieuw veroorzaken. Zie de import map in index.html.

   Overgenomen uit deel 2 van het zon/maan-prototype
   (logs/earthsunmoon/earthglobe-v3.html), met vier bewuste afwijkingen:

     1. GEEN EIGEN LICHTEN (`addLights` staat standaard op false). globe.gl zet
        er zelf al twee neer: een AmbientLight van intensity PI en een
        DirectionalLight van 0,6·PI. Een derde licht wast de scene uit. Het
        aanroepende bestand richt die bestaande DirectionalLight op
        `sunDirection`, zodat de maanfase FYSIEK ontstaat.

     2. GEEN TERMINATOR EN GEEN SCHEMERINGSBANDEN. Terra tekent de terminator al
        in js/shaders.js. Twee terminators op een halve kilometer van elkaar is
        de slechtste uitkomst, dus die van het prototype gaat niet mee.

     3. TEXTUREN IN PLAATS VAN PROCEDURELE CANVASSEN voor zon en maan. Het
        prototype genereerde ze in code omdat het zonder bestanden moest kunnen;
        Terra heeft ze in assets/planets/. De gloed blijft wel procedureel — dat
        is een radiale gradiënt en daar is geen bestand voor nodig.

     4. `setSegments()` HERGEBRUIKT ZIJN BUFFER. Het prototype deed elke frame
        een `geometry.dispose()` plus een verse BufferGeometry voor drie lijnen.
        In een demo onschuldig; in Terra, waar we in sessie 9 juist een rebuild
        moesten smoren, hoort dat anders.

   COORDINATENFRAME — zie de lange noot bij `latLonToUnit` in js/sunmoon.js. Kort:
   deze laag, `world.getCoords()` en de zonrichting in de shader delen exact
   hetzelfde frame (numeriek bewezen tot op 6e-16). Lengte 0 ligt op +Z, 90 oost
   op +X, de noordpool op +Y.
   ============================================================ */

import { ephemeris, latLonToUnit, solarPhysical, DEG } from './sunmoon.js';

export function createSunMoonLayer(THREE, opts = {}) {
  const cfg = Object.assign({
    earthRadius:       100,
    sunDistance:       420,
    sunRadius:          22,
    moonDistance:      300,
    moonRadius:         15,
    moonDistanceSwing:  35,
    sunGlowScale:      5.5,
    moonGlowScale:     2.2,
    sunColorBoost:     [2.6, 2.25, 1.85],
    photosphereColor:  [1.15, 1.0, 0.82],   // zie de noot bij photosphereMaterial
    subPointRadius:    2.6,
    subPointAltitude: 0.025,
    trackAltitude:    0.018,   // ground tracks zweven net boven het oppervlak
    // GEMETEN, en dit was de oorzaak van de onzichtbare terminator in de
    // schematische weergave: die modus legt de land-polygons op
    // `polygonAltitude(0.01)`, oftewel straal 101. De schemeringslijnen stonden op
    // 100,6 en verdwenen er dus letterlijk ONDER — het sterkst bij de polen, waar
    // de kijkhoek scherend is en het land visueel het meeste oppervlak beslaat.
    // 0,014 legt ze boven het land (101) en onder de ground tracks (101,8), en dat
    // werkt in beide weergavemodi zonder z-fighting.
    twilightAltitude: 0.014,
    trackDays:           3,
    sunColor:     0xffcc22,
    moonColor:    0x88bbff,
    sunTextureUrl:  null,
    moonTextureUrl: null,
    // three.js-lichten werken scene-breed. De host heeft al belichting, dus
    // standaard uit — zie afwijking 1 in de kop.
    addLights: false
  }, opts);

  const R = cfg.earthRadius;
  const group = new THREE.Group();
  group.name = 'terra-sunmoon';

  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  const vec = (u, r = 1, target = new THREE.Vector3()) => target.set(u.x * r, u.y * r, u.z * r);
  const fromLatLon = (lat, lon, r = 1, target = new THREE.Vector3()) =>
    vec(latLonToUnit(lat, lon), r, target);

  /* ---- texturen ---- */

  const loader = new THREE.TextureLoader();
  // Zelfde reden als bij de aarde-texturen: zodra ASSET_BASE naar een CDN wijst
  // (de standalone-variant) is deze vlag het verschil tussen een zichtbaar
  // lichaam en een zwarte bol. Zonder CORS-toestemming laadt het plaatje wel,
  // maar raakt het canvas tainted en weigert WebGL het als texture.
  loader.setCrossOrigin('anonymous');

  function loadInto(url, material) {
    if (!url) return;
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        material.map = tex;
        material.needsUpdate = true;
        track(tex);
      },
      undefined,
      // Ontbreekt de textuur, dan blijft de effen basiskleur staan. Een lichaam
      // zonder plaatje is beter dan geen lichaam.
      () => console.warn(`[sunmoon] textuur niet geladen: ${url}`)
    );
  }

  // Radiale gloed als canvas-gradiënt. Geen bestand nodig.
  function glowTexture(inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0.00, inner);
    g.addColorStop(0.18, outer);
    g.addColorStop(1.00, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return track(t);
  }

  /* ---- de lichamen ---- */

  // De zon krijgt een MeshBasicMaterial: dat negeert alle lichten en is dus
  // altijd vol helder. Dat is precies het emissive gedrag dat een lichtbron
  // hoort te hebben — een material dat op licht reageert zou zijn eigen
  // nachtzijde tekenen, wat bij een ster onzin is.
  // De kleur staat BOVEN 1 per kanaal — zie de noot bij `sunColorBoost` in
  // js/config.js. Kort: de renderer draait zonder tonemapping, dus zonder die
  // boost blijft de zon onder de bloom-drempel en krijgt hij geen corona.
  // `setRGB` klemt niet, de hex-notatie zou dat wel doen.
  const sunGroup = new THREE.Group();
  const sunMaterial = track(new THREE.MeshBasicMaterial());
  sunMaterial.color.setRGB(...cfg.sunColorBoost);
  const sunCore = new THREE.Mesh(track(new THREE.SphereGeometry(cfg.sunRadius, 40, 24)), sunMaterial);
  // GEMETEN, en dit koste bijna de hele blok F: `depthTest: false` (zoals het
  // prototype had) laat de gloed-sprite ÓVER zijn eigen lichaam tekenen. De sprite
  // is groter dan de bol — bij de maan schaal 33 tegen een diameter van 30 — dus
  // het lichaam verdween volledig achter een egale gekleurde schijf. Bij de maan
  // betekende dat: geen textuur, geen reliëf en vooral geen zichtbare fase.
  // Met `depthTest: true` wordt de sprite achter het lichaam geklipt en blijft
  // alleen de halo rond de rand staan, wat ook is wat een corona hoort te doen.
  // `depthWrite` blijft uit: een transparante sprite hoort niet in de depth buffer.
  const sunGlow = new THREE.Sprite(track(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,247,214,0.95)', 'rgba(255,166,40,0.55)'),
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true
  })));
  sunGlow.scale.setScalar(cfg.sunRadius * cfg.sunGlowScale);
  sunGroup.add(sunCore, sunGlow);
  loadInto(cfg.sunTextureUrl, sunMaterial);

  /* ---- neutrale fotosfeer ----
     De zontextuur is een GESCHILDERDE zon, mét eigen vlekken. Echte, gemeten
     vlekken daar bovenop leggen geeft twee sets die niets met elkaar te maken
     hebben, en dan is niet meer te zien welke de waarneming is. Zodra de
     vlekkenlaag aan gaat wijkt de textuur dus voor dit oppervlak.

     Waarom een shader en geen egale kleur of een verlooptextuur: randverduistering
     hangt af van de KIJKHOEK, niet van een plek op de bol. Een radiale gradiënt in
     een textuur zou een donkere ring om een vast punt op het oppervlak leggen, die
     meedraait — precies verkeerd. `dot(normaal, blikrichting)` doet het wel goed en
     kost vier regels. De lineaire wet I/I0 = 1 - u(1 - mu) met u = 0,6 hoort bij
     zichtbaar licht rond 550 nm.

     De kleur houdt dezelfde boost boven 1 als het gewone materiaal, anders valt de
     zon onder de bloom-drempel en verliest hij zijn corona — zie de noot bij
     `sunColorBoost`. */
  const photosphereMaterial = track(new THREE.ShaderMaterial({
    // BEWUST VEEL ZWAKKER DAN `sunColorBoost`. Die boost bestaat om de zon vanaf
    // de aarde — een schijfje van een paar pixels — boven de bloom-drempel van
    // 0,75 te tillen. Van dichtbij werkt hij averechts: alles verzadigt naar wit
    // en de vlekken verdwijnen in de gloed. Met een piek van 1,15 in het midden
    // blijft het schijfmidden nog nét boven de drempel en gloeit dus, terwijl de
    // randverduistering het naar 0,46 brengt — onder de drempel, dus daar geen
    // bloom. Dat is precies het beeld dat een echte opname geeft.
    uniforms: { uColor: { value: new THREE.Color().setRGB(...cfg.photosphereColor) } },
    vertexShader: [
      'varying vec3 vN;',
      'varying vec3 vV;',
      'void main() {',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  vN = normalize(normalMatrix * normal);',
      '  vV = normalize(-mv.xyz);',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uColor;',
      'varying vec3 vN;',
      'varying vec3 vV;',
      'void main() {',
      '  float mu = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);',
      '  float f = 1.0 - 0.6 * (1.0 - mu);',
      '  gl_FragColor = vec4(uColor * f, 1.0);',
      '}'
    ].join('\n')
  }));

  // De maan krijgt een material dat WEL op licht reageert. Daar zit de winst:
  // de fase hoeft niet getekend te worden, hij ontstaat uit de belichting vanaf
  // de zonrichting. De controle daarop staat in de readout — de verlichte
  // fractie in beeld moet overeenkomen met `illumination.fraction`.
  const moonGroup = new THREE.Group();
  const moonMaterial = track(new THREE.MeshLambertMaterial({ color: 0xffffff }));
  const moonBody = new THREE.Mesh(track(new THREE.SphereGeometry(cfg.moonRadius, 48, 32)), moonMaterial);
  /* DE MAAN IS GEBONDEN AAN DE AARDE en keert ons altijd dezelfde kant toe. Zijn
     omwenteling om de eigen as duurt precies even lang als zijn omloop, dus de
     nearside — de kant met de grote donkere mare — wijst permanent naar ons.

     In de scene betekent dat: de mesh moet MEEDRAAIEN met zijn eigen positie. Deed
     hij dat niet (en dat was de eerste versie), dan staat de textuur vast in
     wereldruimte en hangt het van de toevallige stand van de maan af welk stuk we
     zien — soms de nearside, soms de achterkant. Dat leverde donkere mare-vlekken
     op een maan die volgens de readout bijna vol verlicht was.

     Twee stappen, en de tweede is de subtiele:
       1. `moonGroup.lookAt(0,0,0)` richt de +Z-as van de groep naar de aarde.
       2. De textuur heeft lengte 0 echter op +X, niet op +Z — dat volgt uit hoe
          three.js een SphereGeometry uitrolt (u=0,5 valt op +X). Een draai van
          -90 graden om Y brengt die +X op de +Z van de groep. Precies dezelfde
          correctie die three-globe op de aarde-mesh toepast, en om dezelfde reden.

     Niet meegenomen, bewust: de 6,7 graden helling van de maanas en de libratie
     (de maan wiebelt ~8 graden in lengte, waardoor we op termijn 59% van het
     oppervlak zien). Dat is verfijning boven op een effect dat nu klopt. */
  moonBody.rotation.y = -Math.PI / 2;
  // Zie de noot bij sunGlow: depthTest AAN, anders dekt de halo de fase af.
  const moonGlow = new THREE.Sprite(track(new THREE.SpriteMaterial({
    map: glowTexture('rgba(215,228,255,0.40)', 'rgba(140,175,255,0.16)'),
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true
  })));
  moonGlow.scale.setScalar(cfg.moonRadius * cfg.moonGlowScale);
  moonGroup.add(moonBody, moonGlow);
  loadInto(cfg.moonTextureUrl, moonMaterial);

  group.add(sunGroup, moonGroup);

  // Alleen als de host GEEN eigen belichting heeft. Terra heeft die wel.
  const ownLight = new THREE.DirectionalLight(0xfff4e0, 2.6);
  const ownAmbient = new THREE.AmbientLight(0x0b1020, 0.5);
  if (cfg.addLights) group.add(ownLight, ownAmbient);

  /* ---- zonnevlekken ----
     Actieve gebieden van NOAA SWPC, op hun echte plaats op de bol.

     HET FRAME. NOAA geeft de heliografische breedte en een lengte die gemeten is
     vanaf de CENTRALE MERIDIAAN zoals gezien vanaf de aarde. Dat is precies het
     frame dat we al hebben: de richting zon->aarde is `-sunDirection`. Daar zijn
     maar drie vectoren voor nodig:

        n  de rotatie-as van de zon        (solarPhysical -> latLonToUnit)
        p  de centrale meridiaan           (aardrichting, geprojecteerd op de evenaar)
        q  = n x p, de draairichting       (dus: naar het westen)

     Zet je de as zo neer, dan volgt de schuinstand B0 er VANZELF uit; hij hoeft
     nergens apart in de formule te staan. Geverifieerd: B0 uit deze vectoren valt
     tot in de vierde decimaal samen met de gesloten formule van Meeus, over het
     hele jaarbereik van -7,25 tot +7,25 graden.

     HET TEKEN. NOAA telt west NEGATIEF: `longitude: -3` staat in dezelfde regel
     als `location: "N15W03"`. En west is de kant waar de rotatie een vlek heen
     draagt, dus L_west = -longitude en die richting is +q.

     DE ACHTERKANT REGELT ZICHZELF. Een gebied voorbij de rand (vandaag regio 4494
     op 100 graden west) komt op de afgewende helft te liggen en verdwijnt achter de
     bol. Er is geen zichtbaarheidstoets — in 3D is dat geen uitzondering die je
     programmeert maar een gevolg.

     DE MAAT IS OVERDREVEN, en dat is een keuze. Een gebied van 120 miljoensten van
     de zonshelft heeft een straal van ongeveer 0,016 zonsstraal; op deze bol van 22
     eenheden is dat een derde van een eenheid en dus onzichtbaar. De schaal
     hieronder houdt de ONDERLINGE verhoudingen (wortel uit het oppervlak) intact
     maar tilt alles naar een leesbare maat. */
  const sunspotGroup = new THREE.Group();
  sunGroup.add(sunspotGroup);
  const spotMeshes = [];
  let sunspotData = [];
  const _Y = new THREE.Vector3(0, 1, 0);
  const _axis = new THREE.Vector3(), _toEarth = new THREE.Vector3(),
        _cm = new THREE.Vector3(), _west = new THREE.Vector3(), _spot = new THREE.Vector3();

  /* DE MAAT IS GEIJKT OP EEN ECHTE OPNAME, niet op wat er aardig uitziet.
     Gemeten op het SDO/HMI-continuüm van 2026-08-02 18:15 UT (schijfstraal 484 px):

       regio 4498, area 120  ->  groep 39 px breed
       regio 4501, area  90  ->  groep 28 px breed

     Dat is 0,081 respectievelijk 0,058 zonsstraal in doorsnede, en de wortel uit
     `area` volgt die verhouding netjes. De deler 12 legt de grootste groep van die
     dag op zijn werkelijke breedte.

     `extent` lag meer voor de hand — dat veld IS de uitgestrektheid in graden —
     maar het bleek de zichtbare vlek slecht te voorspellen: regio 4499 had met 8
     graden de grootste extent van de dag en was op de opname nauwelijks te vinden.
     Extent beslaat het hele actieve gebied, `area` alleen het donkere deel.

     Er blijft een lichte overdrijving in zitten: het equivalente cirkeltje bij area
     120 is 15 px, terwijl de groep 39 px beslaat. Dat verschil is echt — een groep
     is verstrooide vlekken, geen schijf — en wij tekenen die verstrooiing als één
     vlek. De ondergrens houdt de kleinste gebieden zichtbaar en aanklikbaar. */
  const spotRadius = (s) =>
    Math.max(0.30, Math.min(2.2, Math.sqrt(Math.max(s.area || 0, 10)) / 12));

  /* BOLKAPJES, GEEN PLATTE SCHIJVEN. Een schijf raakt de bol in één punt en loopt
     er verder vanaf; bij de rand steekt hij daardoor buiten de silhouetlijn uit en
     hangt een vlek zichtbaar naast de zon. Een kapje van dezelfde bol volgt de
     kromming exact, kan per definitie niet buiten het silhouet komen, en vertoont
     bij scherende inval vanzelf de ellipsvorm die een echte vlek daar ook heeft.
     Dezelfde redenering als bij de eclipsschaduw: laat de meetkunde het doen.

     De geometrie hangt aan de MAAT van de vlek en verandert dus alleen als NOAA
     een nieuwe dag publiceert — één keer per dag, niet per frame. */
  function capGeometry(sceneRadius) {
    // Hoekstraal op de bol. asin omdat de koorde naar de booghoek moet.
    const alpha = Math.asin(Math.min(0.9, sceneRadius / cfg.sunRadius));
    return new THREE.SphereGeometry(cfg.sunRadius * 1.002, 24, 12, 0, Math.PI * 2, 0, alpha);
  }

  function setSunspots(list) {
    sunspotData = Array.isArray(list) ? list : [];
    while (spotMeshes.length < sunspotData.length) {
      const m = new THREE.Mesh(
        capGeometry(1),
        track(new THREE.MeshBasicMaterial({ color: 0x2b1508 }))
      );
      m.renderOrder = 3;   // ná de gloed-sprite, anders wast die de vlek uit
      spotMeshes.push(m);
      sunspotGroup.add(m);
    }
    spotMeshes.forEach((m, i) => {
      m.visible = i < sunspotData.length;
      if (!m.visible) return;
      m.geometry.dispose();
      m.geometry = capGeometry(spotRadius(sunspotData[i]));
    });
  }

  // Plaatst de vlekken voor dit moment. `sunDirection` moet al bijgewerkt zijn.
  function placeSunspots(eph) {
    if (!sunspotData.length) return;
    const sp = solarPhysical(eph);
    vec(latLonToUnit(sp.pole.lat, sp.pole.lon), 1, _axis);
    _toEarth.copy(sunDirection).negate();
    _cm.copy(_toEarth).addScaledVector(_axis, -_toEarth.dot(_axis)).normalize();
    _west.crossVectors(_axis, _cm);
    for (let i = 0; i < sunspotData.length; i++) {
      const s = sunspotData[i], m = spotMeshes[i];
      const B = (s.lat || 0) * DEG, L = -(s.lon || 0) * DEG;
      _spot.copy(_cm).multiplyScalar(Math.cos(B) * Math.cos(L))
           .addScaledVector(_west, Math.cos(B) * Math.sin(L))
           .addScaledVector(_axis, Math.sin(B));
      // Het kapje ligt al op de goede straal en om de +Y-as; alleen draaien dus,
      // niet verplaatsen. Geen lookAt: sunspotGroup hangt onder sunGroup en een
      // quaternion tussen twee eenheidsvectoren is hier eenduidiger.
      m.quaternion.setFromUnitVectors(_Y, _spot);
      // De richting vanaf het zonnemiddelpunt, bewaard voor metingen en voor wat
      // er later aan aanwijzen of etiketten bij komt.
      (m.userData.dir || (m.userData.dir = new THREE.Vector3())).copy(_spot);
    }
  }

  /* ---- subpunt-markers ---- */
  // Waar het lichaam op dat moment exact recht boven de aarde staat.

  /* PLATTE SCHIJVEN, GEEN BOLLEN. Een bol op het oppervlak steekt van opzij gezien
     boven de aarde uit en leest dan als een zwevend object in plaats van als een
     plek op de kaart. Een CircleGeometry ligt in het XY-vlak met zijn normaal op +Z,
     dus `lookAt(2 * positie)` legt hem plat tegen het oppervlak, radiaal naar
     buiten. Dat is dezelfde oriëntatie-truc als bij de indicator-glyphs — en let op
     de gotcha daar: `lookAt(0,0,0)` zou +Z naar BINNEN richten en de schijf laten
     verdwijnen in de bol. */
  const marker = (color, size) => {
    const m = new THREE.Mesh(
      track(new THREE.CircleGeometry(size, 32)),
      track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95,
                                          depthWrite: false }))
    );
    m.renderOrder = 2;
    return m;
  };
  const sunMarker = marker(0xffee44, cfg.subPointRadius);
  const moonMarker = marker(0xaaccff, cfg.subPointRadius * 0.8);
  group.add(sunMarker, moonMarker);

  const _look = new THREE.Vector3();
  // Legt een schijf plat op de bol: eerst positioneren, dan radiaal naar buiten
  // draaien door naar het dubbele van de eigen positie te kijken.
  function legPlat(mesh) {
    mesh.lookAt(_look.copy(mesh.position).multiplyScalar(2));
  }

  /* ---- stippellijnen ----
     Van elk lichaam naar zijn eigen subpunt. In deel 1 zijn dit vooral
     controlelijnen: een spiegelverkeerd frame zie je hiermee in één blik, want
     de lijn steekt dan dwars door de aarde in plaats van er loodrecht op te
     staan. Standaard uit; `setVisible({ leaders: true })` zet ze aan.

     LineDashedMaterial vraagt na ELKE positiewijziging een
     computeLineDistances(), anders houdt three.js het streepjespatroon van de
     vorige frame vast. */

  function dashed(color, dashSize, gapSize, opacity = 0.85) {
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const m = track(new THREE.LineDashedMaterial({
      color, dashSize, gapSize, transparent: true, opacity, depthWrite: false
    }));
    const l = new THREE.Line(g, m);
    l.computeLineDistances();
    l.frustumCulled = false;
    return l;
  }
  const sunLeader = dashed(0xffcc22, 5, 3.5);
  const moonLeader = dashed(0x88bbff, 4, 3);
  /* Directe koorde van zon naar maan. Bewust NIET via het aardmiddelpunt: het
     zichtbare deel van een lijn zon-naar-middelpunt loopt van de zon tot het
     subsolaire punt, en daar gaat de leader-lijn al heen. De koorde is andere
     informatie — bij volle maan gaat hij dwars door de bol, bij nieuwe maan
     zwenkt hij er ruim omheen, en zijn lengte is
     |SM|^2 = dS^2 + dM^2 - 2 dS dM cos(elongatie). Eén doorlopende maat voor de
     stand van zon, aarde en maan ten opzichte van elkaar. */
  const alignLine = dashed(0x9aa7b8, 7, 5, 0.55);
  group.add(sunLeader, moonLeader, alignLine);

  // Hergebruikte buffer — zie afwijking 4 in de kop.
  function setSegments(line, a, b) {
    const arr = line.geometry.attributes.position.array;
    arr[0] = a.x; arr[1] = a.y; arr[2] = a.z;
    arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
    line.geometry.attributes.position.needsUpdate = true;
    line.geometry.computeBoundingSphere();
    line.computeLineDistances();
  }

  /* ---- ground tracks ----
     Waar stond de zon twaalf uur geleden, waar staat de maan morgen. De code
     staat er compleet in, maar in deel 1 blijft de zichtbaarheid uit; het
     tijdvenster en de bediening horen bij deel 2. */

  function makeTrack(color) {
    const l = new THREE.Line(
      track(new THREE.BufferGeometry()),
      track(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }))
    );
    l.frustumCulled = false;
    l.userData.color = new THREE.Color(color);
    return l;
  }
  function makeTicks(color) {
    const p = new THREE.Points(
      track(new THREE.BufferGeometry()),
      track(new THREE.PointsMaterial({
        color, size: 1.6, sizeAttenuation: true, transparent: true, opacity: 0.9
      }))
    );
    p.frustumCulled = false;
    return p;
  }
  const sunTrack = makeTrack(cfg.sunColor);
  const moonTrack = makeTrack(cfg.moonColor);
  const sunTicks = makeTicks(cfg.sunColor);
  const moonTicks = makeTicks(cfg.moonColor);
  group.add(sunTrack, moonTrack, sunTicks, moonTicks);

  let trackDays = cfg.trackDays;
  const trackR = R * (1 + cfg.trackAltitude);

  function buildTrack(line, ticks, which, date) {
    const samples = Math.min(1200, Math.max(240, Math.round(trackDays * 240)));
    const pts = [];
    const spanMs = trackDays * 86400000;
    const t0 = date.getTime() - spanMs / 2;
    for (let i = 0; i <= samples; i++) {
      const t = t0 + (i / samples) * spanMs;
      const e = ephemeris(new Date(t));
      const p = which === 'moon' ? e.subLunar : e.subSolar;
      pts.push({ lat: p.lat, lon: p.lon, t });
    }

    const pos = new Float32Array((samples + 1) * 3);
    const col = new Float32Array((samples + 1) * 3);
    const c = line.userData.color;
    const v = new THREE.Vector3();
    for (let i = 0; i <= samples; i++) {
      fromLatLon(pts[i].lat, pts[i].lon, trackR, v);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      const k = 0.20 + 0.80 * (i / samples);           // verleden gedimd, toekomst helder
      col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
    }
    line.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    line.geometry = g;

    // Eén stip per heel UTC-uur, of per 6 uur op de lange vensters — anders
    // wordt de bol een stippelbrij.
    const stepH = trackDays <= 3 ? 1 : trackDays <= 7 ? 6 : 24;
    const stepMs = stepH * 3600000;
    const tickPts = [];
    const first = Math.ceil(pts[0].t / stepMs) * stepMs;
    for (let t = first; t <= pts[samples].t; t += stepMs) {
      const e = ephemeris(new Date(t));
      const p = which === 'moon' ? e.subLunar : e.subSolar;
      fromLatLon(p.lat, p.lon, trackR * 1.004, v);
      tickPts.push(v.x, v.y, v.z);
    }
    ticks.geometry.dispose();
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tickPts), 3));
    ticks.geometry = tg;
  }

  /* ---- terminator- en schemeringslijnen ----
     Een kleine cirkel op hoekafstand `a` van het subsolaire punt. De terminator is
     a = 90 graden; civiele, nautische en astronomische schemering eindigen waar de
     zon 6, 12 en 18 graden onder de horizon staat.

     WAAROM DIT NAAST TERRA'S SHADER MAG (de vraag uit deel 1, beantwoord in deel 2):
     de shader tekent het dag/nacht-EFFECT, een zacht verloop. Deze lijnen zijn
     INFORMATIE: ze zeggen precies waar elke schemeringsfase eindigt. Sinds de
     shader in sessie 14 op de fysieke band staat
     (`smoothstep(-0.309, -0.0145)`) vallen ze bovendien op dayMix 1,000 / 0,734 /
     0,251 / 0,000 — lijn en gradiënt vertellen hetzelfde verhaal.

     Uitlijning vraagt geen enkele extra stap: de cirkels worden opgebouwd rond
     `sunDirection`, dezelfde vector die de zon-mesh en de DirectionalLight voeden. */

  const TWILIGHT = [
    { a: 90,  color: 0xffd166, opacity: 1.00 },   // zonsopgang / zonsondergang
    { a: 96,  color: 0x8fb4e8, opacity: 0.70 },   // einde civiele schemering
    { a: 102, color: 0x5d84c0, opacity: 0.55 },   // einde nautische schemering
    { a: 108, color: 0x3a5a8f, opacity: 0.45 }    // einde astronomische, echte nacht
  ];
  const SEG = 240;
  const twilightLines = TWILIGHT.map(t => {
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 3), 3));
    const l = new THREE.LineLoop(g, track(new THREE.LineBasicMaterial({
      color: t.color, transparent: true, opacity: t.opacity, depthWrite: false
    })));
    l.frustumCulled = false;
    return l;
  });
  const terminatorGroup = new THREE.Group();
  twilightLines.forEach(l => terminatorGroup.add(l));
  group.add(terminatorGroup);

  const _u = new THREE.Vector3(), _v = new THREE.Vector3(), _ref = new THREE.Vector3();
  function updateSmallCircle(line, axis, angleDeg, radius) {
    // orthonormale basis loodrecht op de as
    _ref.set(0, 1, 0);
    if (Math.abs(axis.y) > 0.9) _ref.set(1, 0, 0);
    _u.crossVectors(axis, _ref).normalize();
    _v.crossVectors(axis, _u).normalize();
    const ca = Math.cos(angleDeg * DEG), sa = Math.sin(angleDeg * DEG);
    const arr = line.geometry.attributes.position.array;
    for (let i = 0; i <= SEG; i++) {
      const t = (i / SEG) * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
      arr[i * 3]     = (axis.x * ca + (_u.x * ct + _v.x * st) * sa) * radius;
      arr[i * 3 + 1] = (axis.y * ca + (_u.y * ct + _v.y * st) * sa) * radius;
      arr[i * 3 + 2] = (axis.z * ca + (_u.z * ct + _v.z * st) * sa) * radius;
    }
    line.geometry.attributes.position.needsUpdate = true;
    line.geometry.computeBoundingSphere();
  }

  /* ---- eclips: umbra-ring en pad ----
     De shader tekent de verduistering zelf, maar de umbra is in beeld vrijwel
     onzichtbaar: 132 km op een aardschijf van 12.742 km. Wat je ziet is de
     penumbra, bijna zevenduizend kilometer breed en zacht. Deze ring markeert waar
     de totaliteit werkelijk is, en de lijn laat zien welke weg hij aflegt. */

  const umbraRing = new THREE.LineLoop(
    track(new THREE.BufferGeometry().setAttribute('position',
      new THREE.BufferAttribute(new Float32Array((64 + 1) * 3), 3))),
    track(new THREE.LineBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: 0.95, depthWrite: false }))
  );
  umbraRing.frustumCulled = false;
  const eclipsePathLine = new THREE.Line(
    track(new THREE.BufferGeometry()),
    track(new THREE.LineBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: 0.5, depthWrite: false }))
  );
  eclipsePathLine.frustumCulled = false;
  const eclipseGroup = new THREE.Group();
  eclipseGroup.add(umbraRing, eclipsePathLine);
  group.add(eclipseGroup);

  // De umbra is een cirkel op het oppervlak; we tekenen hem als kleine cirkel rond
  // het schaduwcentrum, met een minimum zodat hij ook bij een smalle umbra zichtbaar
  // blijft. Anders zou hij op de meeste zoomstanden onder één pixel duiken.
  const _ua = new THREE.Vector3(), _ub = new THREE.Vector3(), _uref = new THREE.Vector3();
  function setUmbra(lat, lon, straalKm) {
    const as = latLonToUnit(lat, lon);
    const axis = _ua.set(as.x, as.y, as.z).normalize();
    _uref.set(0, 1, 0);
    if (Math.abs(axis.y) > 0.9) _uref.set(1, 0, 0);
    const u = _ub.crossVectors(axis, _uref).normalize();
    const v2 = new THREE.Vector3().crossVectors(axis, u).normalize();
    // hoekstraal op de bol, met een ondergrens van 0,45 graden voor leesbaarheid
    const hoek = Math.max(0.45, (Math.abs(straalKm) / 6371) * 180 / Math.PI);
    const ca = Math.cos(hoek * DEG), sa = Math.sin(hoek * DEG);
    const rr = R * (1 + cfg.subPointAltitude);
    const arr = umbraRing.geometry.attributes.position.array;
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2, ct = Math.cos(a), st = Math.sin(a);
      arr[i*3]   = (axis.x * ca + (u.x * ct + v2.x * st) * sa) * rr;
      arr[i*3+1] = (axis.y * ca + (u.y * ct + v2.y * st) * sa) * rr;
      arr[i*3+2] = (axis.z * ca + (u.z * ct + v2.z * st) * sa) * rr;
    }
    umbraRing.geometry.attributes.position.needsUpdate = true;
    umbraRing.geometry.computeBoundingSphere();
  }

  function setEclipsePath(punten) {
    const n = punten.length;
    if (!n) { eclipsePathLine.visible = false; return; }
    // Altijd zichtbaar zetten: de GROEP regelt of de eclipslaag te zien is. Hier
    // `eclipseGroup.visible` overnemen ging mis, want deze functie draait vóór de
    // groep wordt aangezet — de lijn bleef dan onzichtbaar achter een zichtbare groep.
    eclipsePathLine.visible = true;
    const pos = new Float32Array(n * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      fromLatLon(punten[i].lat, punten[i].lon, R * (1 + cfg.subPointAltitude), v);
      pos[i*3] = v.x; pos[i*3+1] = v.y; pos[i*3+2] = v.z;
    }
    eclipsePathLine.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    eclipsePathLine.geometry = g;
  }

  /* ---- publieke toestand ---- */

  // De gedeelde zonrichting. De shader-uniform, de zon-mesh en de
  // DirectionalLight lezen alle drie hieruit — dat is de harde eis uit sessie 13.
  // Wijkt er één af, dan staat de zichtbare zon ergens anders dan waar het water
  // glinstert, en dat zie je meteen.
  const sunDirection = new THREE.Vector3(0, 0, 1);
  const moonDirection = new THREE.Vector3(0, 0, 1);
  let lastTrackKey = null;
  let tracksVisible = false;
  // Smoring van de track-rebuild; zie de noot in update().
  const TRACK_DEBOUNCE_MS = 120;
  let _trackTimer = null;
  let _pendingTrackDate = null;
  // Smoring voor de schemeringslijnen: vier lijnen van 241 punten is 964 punten per
  // herberekening. Bij 30 s tussen updates is dat niets, maar zodra de tijdkiezer
  // gesleept wordt draait het per frame. We herbouwen alleen als de zon echt
  // verschoven is — 0,02 graden is ruim onder een pixel op elke zoomstand.
  //
  // De "nog nooit gebouwd"-staat is een APARTE VLAG en geen onmogelijke vector.
  // Eerst stond hier `new Vector3(9,9,9)` als beginwaarde, maar een dot-product
  // daarmee is ~14,8 en dus altijd GROTER dan de drempel — de conditie sloeg nooit
  // aan en de cirkels bleven op (0,0,0) staan. Een dot-vergelijking veronderstelt
  // twee eenheidsvectoren; een sentinel die dat niet is, breekt hem stilzwijgend.
  const _lastSunDir = new THREE.Vector3();
  let twilightDirty = true;
  const TWILIGHT_EPS = Math.cos(0.02 * DEG);

  function update(date) {
    const eph = ephemeris(date);

    vec(latLonToUnit(eph.subSolar.lat, eph.subSolar.lon), 1, sunDirection);
    vec(latLonToUnit(eph.subLunar.lat, eph.subLunar.lon), 1, moonDirection);

    sunGroup.position.copy(sunDirection).multiplyScalar(cfg.sunDistance);
    if (sunspotGroup.visible) placeSunspots(eph);

    // De echte afstand stuurt de getekende afstand, zodat perigeum en apogeum
    // zichtbaar zijn. 356400 en 406700 km zijn de uitersten van de maanbaan.
    const f = (eph.moon.distanceKm - 356400) / (406700 - 356400);
    const md = cfg.moonDistance + (f - 0.5) * cfg.moonDistanceSwing;
    moonGroup.position.copy(moonDirection).multiplyScalar(md);
    // Gebonden rotatie: de nearside blijft naar de aarde wijzen. Zie de noot bij
    // `moonBody.rotation.y` waarom er twee draaiingen nodig zijn en niet één.
    moonGroup.lookAt(0, 0, 0);

    const markerR = R * (1 + cfg.subPointAltitude);
    fromLatLon(eph.subSolar.lat, eph.subSolar.lon, markerR, sunMarker.position);
    fromLatLon(eph.subLunar.lat, eph.subLunar.lon, markerR, moonMarker.position);
    legPlat(sunMarker);
    legPlat(moonMarker);

    if (sunLeader.visible)  setSegments(sunLeader, sunMarker.position, sunGroup.position);
    if (moonLeader.visible) setSegments(moonLeader, moonMarker.position, moonGroup.position);
    if (alignLine.visible)  setSegments(alignLine, sunGroup.position, moonGroup.position);

    // Schemeringslijnen: alleen herbouwen als de zon merkbaar verschoven is.
    if (terminatorGroup.visible && (twilightDirty || sunDirection.dot(_lastSunDir) < TWILIGHT_EPS)) {
      const r = R * (1 + cfg.twilightAltitude);
      TWILIGHT.forEach((t, i) => updateSmallCircle(twilightLines[i], sunDirection, t.a, r));
      _lastSunDir.copy(sunDirection);
      twilightDirty = false;
    }

    // Ground tracks: alleen herbouwen als het venster echt is opgeschoven, EN
    // gesmoord zodat slepen aan de tijdkiezer vloeiend blijft.
    //
    // GEMETEN (sessie 14, sleep van 120 stappen): zonder smoring kostte de rebuild
    // p90 14 ms bij een venster van 3 dagen en 15 ms bij een maand, met uitschieters
    // naar 29 ms — genoeg om frames te laten vallen. De rest van update() zit op
    // 0,1 ms, dus dit was praktisch de hele kost. Met de smoring eronder valt hij
    // tijdens het slepen helemaal weg en komt het spoort 120 ms na de laatste
    // beweging bij. Dat is hetzelfde patroon als `countryLabelRankDebounce` uit
    // sessie 9, en om dezelfde reden.
    if (tracksVisible) {
      const key = Math.round(date.getTime() / (trackDays * 86400000 * 0.004));
      if (key !== lastTrackKey) {
        lastTrackKey = key;
        _pendingTrackDate = date;
        clearTimeout(_trackTimer);
        _trackTimer = setTimeout(() => {
          buildTrack(sunTrack, sunTicks, 'sun', _pendingTrackDate);
          buildTrack(moonTrack, moonTicks, 'moon', _pendingTrackDate);
        }, TRACK_DEBOUNCE_MS);
      }
    }
    return eph;
  }

  function setTrackWindow(days) { trackDays = days; lastTrackKey = null; }

  const targets = {
    sun:       [sunGroup],
    moon:      [moonGroup],
    sunMark:   [sunMarker],
    moonMark:  [moonMarker],
    leaders:   [sunLeader, moonLeader],
    alignment: [alignLine],
    tracks:    [sunTrack, moonTrack],
    ticks:     [sunTicks, moonTicks],
    twilight:  [terminatorGroup],
    eclipse:   [eclipseGroup],
    sunspots:  [sunspotGroup]
  };
  function setVisible(what) {
    for (const [k, on] of Object.entries(what)) {
      (targets[k] || []).forEach(o => { o.visible = on; });
      // De vlekken en de geschilderde textuur sluiten elkaar uit — zie de noot
      // bij `photosphereMaterial`. Aanzetten wisselt het oppervlak om, uitzetten
      // legt de textuur terug.
      if (k === 'sunspots') sunCore.material = on ? photosphereMaterial : sunMaterial;
      // De tracks kosten rekenwerk, dus die bouwen we alleen als ze zichtbaar zijn.
      if (k === 'tracks') {
        tracksVisible = on;
        if (on) lastTrackKey = null;
        // Uitzetten mag geen rebuild achterlaten die alsnog afgaat.
        else { clearTimeout(_trackTimer); _trackTimer = null; }
      }
      // Bij aanzetten de smoring resetten, anders blijft de laatste stand staan.
      if (k === 'twilight' && on) twilightDirty = true;
    }
  }

  function dispose() {
    clearTimeout(_trackTimer);
    disposables.forEach(o => o.dispose && o.dispose());
    group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    if (group.parent) group.parent.remove(group);
  }

  // Beginstand. Zon en maan hebben geen schakelaar meer — die horen er altijd te
  // zijn. De eclipslaag blijft uit tot er werkelijk een verduistering is; dat
  // regelt de aanroepende code per moment.
  setVisible({
    sun: true, moon: true, sunMark: true, moonMark: true,
    leaders: true, alignment: true, tracks: true, ticks: true, twilight: true,
    eclipse: false, sunspots: true
  });

  return {
    group, update, setVisible, setTrackWindow, dispose,
    setUmbra, setEclipsePath, setSunspots,
    sunDirection, moonDirection, config: cfg,
    // handig voor het aanroepende bestand en voor metingen
    meshes: { sunGroup, moonGroup, sunMarker, moonMarker, sunMaterial, moonMaterial,
              sunGlow, sunspotGroup, spotMeshes, photosphereMaterial }
  };
}
