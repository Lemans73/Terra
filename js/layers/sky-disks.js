/* ============================================================
   TERRA — Sky disks · de ecliptica en de hemelequator als vlak
   ------------------------------------------------------------
   Hangt uitsluitend af van de THREE-instance die je meegeeft — zelfde
   afspraak als de andere lagen. Vervangt `layers/ecliptic-layer.js`.

   WAT DIT TEKENT
   Twee vlakken door het aardmiddelpunt, elk als een halftransparante
   band om de bol:

     · de ECLIPTICA — het vlak van de aardbaan, en daarmee ongeveer het
       vlak waarin het hele zonnestelsel ligt. Op de bol slingert hij
       tussen 23,44 graden noord en zuid: precies de band tussen de
       keerkringen, want daar staat de zon loodrecht.
     · de HEMELEQUATOR — het vlak van de aardrotatie, met een verdeling
       in rechte klimming van 0 tot 24 uur.

   EN DE TWEE SNIJPUNTEN ZIJN DE EQUINOXEN. Dat is de reden dat ze
   allebei getekend worden en niet één van beide: de hoek tussen deze
   vlakken IS de scheefstand die de seizoenen maakt, en de plek waar ze
   elkaar kruisen is het lentepunt. Een figuur die dat laat zien legt in
   één beeld uit wat drie alinea's tekst niet doen.

   ------------------------------------------------------------
   WAAROM EEN BAND EN GEEN LIJN (Terry, sessie 23)
   Een lijn toont een cirkel; een band toont een VLAK. En dat is wat er
   te begrijpen valt: de planeten liggen niet op een cirkel maar in een
   vlak, en de hoek tussen twee vlakken is af te lezen zodra je ze allebei
   ziet. De band waaiert naar BUITEN uit vanaf straal 101,5 met een
   alfa-verloop — naar binnen zou hij een plaat dwars door de aarde
   trekken.

   WAAROM BEIDE OP DEZELFDE STRAAL, met `depthWrite: false` en een
   expliciete `renderOrder`. Ongelijke stralen lossen z-fighting ook op,
   maar dan is het snijpunt visueel geen snijpunt meer: twee concentrische
   ringen op verschillende afstand kruisen elkaar nergens, en dan is de
   enige uitleg die deze figuur te bieden heeft precies weg. Met
   `depthWrite: false` schrijft geen van beide in de dieptebuffer, dus er
   valt niets te betwisten en de tekenvolgorde ligt vast in `renderOrder`.
   `depthTest` blijft AAN: de bol is ondoorzichtig en hoort de achterste
   helft van beide banden weg te klippen.

   `renderOrder` is hier VERPLICHT en niet netjes: globe.gl's
   atmosfeer-gloed staat op straal 120 — midden in de radiale spanwijdte
   van deze banden — en heeft hetzelfde bounding-middelpunt, dus three
   kan de drie niet op diepte sorteren en valt terug op objectvolgorde.

   ------------------------------------------------------------
   DE OPBOUW: EEN KEER BOUWEN, PER TIK ALLEEN DRAAIEN.

     group.quaternion = rotY(-gast)        +Y = hemelpool, +Z = lentepunt
     ├── equatorband, RA-ticks in UREN, equinox-markers   (statisch)
     └── ecliptica.quaternion = rotZ(+eps)   +Y = ecliptica-pool, +Z = lentepunt
         ├── eclipticaband
         └── gradenverdeling in GRADEN

   De hele inhoud is statisch in dat frame; alleen de twee quaternions
   veranderen. Dat is ordegrootte dertig bewerkingen per tik, tegen de
   241 vertices die de oude ecliptica-laag herschreef — waarmee de smoring
   van 0,02 graden die daar zat overbodig is geworden, en de `gebouwd`-
   boolean ernaast mee kon verdwijnen.

   RA 0 STAAT OP GEOGRAFISCHE LENGTE -gast, dus de hele verdeling schuift
   met 15,041 graden per uur westwaarts over de aarde. Dat is de siderische
   dag, en het is precies wat deze figuur te vertellen heeft: het lentepunt
   staat elk uur boven een andere meridiaan.

   HOOGTE: binnenrand op straal 101,5. De ondergrens is 101, want de
   schematische weergave legt de land-polygonen op `polygonAltitude(0.01)`
   en alles daaronder verdwijnt eronder — gemeten met een A/B in sessie 14.
   ============================================================ */

import { skyFrame } from '../compute/frames.js';
import { createSkyOrientation } from '../core/sky-orientation.js';
import { createLabelSprite, scaleToPixels } from '../core/label-sprite.js';

export function createSkyDisksLayer(THREE, opts = {}) {
  const cfg = Object.assign({
    earthRadius:      100,
    inner:          101.5,   // binnenrand: dit ís de lijn die er eerst stond
    outer:            145,
    rings:              5,   // radiale segmenten; elk krijgt zijn eigen alfa
    segments:         180,
    eclipticColor: 0xffc14d, // dezelfde warme tint als de andere zonzaken
    equatorColor:  0x8fb4d8, // koel, zodat de twee vlakken uit elkaar te houden zijn
    opacity:         0.42,
    /* TWEE VERDELINGEN MET VERSCHILLENDE EENHEDEN, en dat is geen slordigheid
       maar de conventie. Rechte klimming wordt in UREN gemeten (0h..24h, 1h =
       15 graden) omdat de hemel 15 graden per uur draait: een telescoop-
       instelcirkel en elke sterrencatalogus doen het zo. Ecliptische lengte
       wordt in GRADEN gemeten (0..360) vanaf hetzelfde lentepunt — dat is de
       verdeling waar de dierenriem op gebouwd is, twaalf tekens van 30 graden.

       Ze delen hun NULPUNT: bij het lentepunt staat 0h en 0 graden, en vanaf
       daar lopen ze uit elkaar omdat de vlakken 23,44 graden schelen. Dat is
       precies wat de figuur te vertellen heeft.

       De ecliptica krijgt de BINNENSTE ring en de equator de buitenste, zodat
       ze bij de snijpunten niet in elkaar overlopen. */
    eclTickInner:     106,
    eclTickOuter:     114,
    eclTickLong:      119,
    tickInner:        132,
    tickOuter:        140,
    tickLong:         147,
    equinoxColor:  0xffffff,
    labelHeightPx:     18
  }, opts);

  const group = new THREE.Group();
  group.name = 'sky-disks';
  group.visible = false;

  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };
  const orientation = createSkyOrientation(THREE);

  /* ---- de band ----
     `RingGeometry` ligt in het lokale XY-vlak met normaal +Z; we draaien de
     GEOMETRIE een kwartslag zodat hij in XZ ligt met normaal +Y, en dan valt
     hij samen met het frame uit core/sky-orientation.js.

     Het alfa-verloop gaat via VERTEX COLORS met itemSize 4 — three zet dan
     `USE_COLOR_ALPHA` aan. Dat patroon staat al twee keer in deze codebase
     (de ground tracks in sunmoon-layer.js en de pooldrift in geomag-layer.js);
     een vierde handgeschreven ShaderMaterial zou meer kosten en niets extra's
     opleveren. De straal per vertex komt uit `Math.hypot(x, z)` en niet uit de
     generatie-volgorde: dat blijft kloppen als RingGeometry ooit anders
     nummert. */
  function makeBand(color) {
    const geo = track(new THREE.RingGeometry(cfg.inner, cfg.outer, cfg.segments, cfg.rings));
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 4);
    const c = new THREE.Color(color);
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      const t = (r - cfg.inner) / (cfg.outer - cfg.inner);   // 0 binnen, 1 buiten
      // Kwadratisch uitdovend: de binnenrand blijft een scherpe lijn, de rest
      // suggereert het vlak zonder de bol te overstemmen.
      col[i * 4]     = c.r;
      col[i * 4 + 1] = c.g;
      col[i * 4 + 2] = c.b;
      col[i * 4 + 3] = (1 - t) * (1 - t);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));

    const mat = track(new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: cfg.opacity,
      side: THREE.DoubleSide, depthWrite: false, depthTest: true
    }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.raycast = () => {};
    return mesh;
  }

  /* ---- de hemelequator + zijn verdeling ----
     Alles hierin is statisch in het equatoriale frame: RA 0 ligt op lokaal +Z
     en verandert daar nooit. Wat beweegt is de groep eromheen. */
  const equatorBand = makeBand(cfg.equatorColor);
  equatorBand.renderOrder = 2;
  group.add(equatorBand);

  // 36 radiale streepjes van 10 graden; elke derde (dus elke 30 graden = 2 uur)
  // langer, en die krijgt ook een label.
  const gradGroup = new THREE.Group();
  gradGroup.name = 'ra-graduation';
  const tickPts = [];
  const raLabels = [];
  for (let d = 0; d < 360; d += 10) {
    const a = d * Math.PI / 180;
    const lang = d % 30 === 0;
    const r0 = cfg.tickInner, r1 = lang ? cfg.tickLong : cfg.tickOuter;
    // lokaal +Z is RA 0, en RA loopt naar +X (90 graden oost in dit frame)
    const sx = Math.sin(a), sz = Math.cos(a);
    tickPts.push(sx * r0, 0, sz * r0, sx * r1, 0, sz * r1);

    if (lang) {
      const uur = d / 15;
      const sp = createLabelSprite(THREE, uur + 'h', cfg.equatorColor,
                                   { width: 96, height: 56, font: 40 });
      sp.position.set(sx * (cfg.tickLong + 8), 0, sz * (cfg.tickLong + 8));
      sp.renderOrder = 4;
      gradGroup.add(sp);
      raLabels.push(sp);
    }
  }
  const tickGeo = track(new THREE.BufferGeometry());
  tickGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tickPts), 3));
  const tickLine = new THREE.LineSegments(tickGeo, track(new THREE.LineBasicMaterial({
    color: cfg.equatorColor, transparent: true, opacity: 0.7, depthWrite: false
  })));
  tickLine.renderOrder = 4;
  tickLine.raycast = () => {};
  gradGroup.add(tickLine);
  group.add(gradGroup);

  /* De twee equinoxen: lokaal +Z (lentepunt) en -Z (herfstpunt). Ze staan hier
     in het EQUATORIALE frame, en dat is geen benadering — een equinox is per
     definitie het snijpunt van beide vlakken, en dat snijpunt ligt op de as
     waar rotZ(+eps) omheen draait. Ze vallen dus per constructie samen met de
     snijlijn van de twee banden. */
  const equinoxGroup = new THREE.Group();
  for (const [naam, teken] of [['Vernal', 1], ['Autumnal', -1]]) {
    const m = new THREE.Mesh(
      track(new THREE.OctahedronGeometry(2.4)),
      track(new THREE.MeshBasicMaterial({ color: cfg.equinoxColor, transparent: true,
                                          opacity: 0.9, wireframe: true })));
    m.position.set(0, 0, teken * cfg.inner);
    m.raycast = () => {};
    m.renderOrder = 4;
    equinoxGroup.add(m);
    const sp = createLabelSprite(THREE, naam, cfg.equinoxColor,
                                 { width: 192, height: 56, font: 36 });
    sp.position.set(0, 6, teken * cfg.inner);
    sp.renderOrder = 4;
    equinoxGroup.add(sp);
    raLabels.push(sp);
  }
  group.add(equinoxGroup);

  /* ---- de ecliptica, in een eigen subgroep die alleen nog kantelt ---- */
  const eclipticGroup = new THREE.Group();
  eclipticGroup.name = 'ecliptic';
  const eclipticBand = makeBand(cfg.eclipticColor);
  eclipticBand.renderOrder = 3;
  eclipticGroup.add(eclipticBand);
  group.add(eclipticGroup);

  /* ---- de gradenverdeling van de ecliptica ----
     Hij hangt IN `eclipticGroup` en erft dus de kanteling; daarmee ligt hij per
     constructie in het eclipticavlak en niet in het equatorvlak.

     Het nulpunt is lokaal +Z, en dat is dezelfde richting als bij de uren:
     `rotZ(+eps)` draait om de Z-as en laat +Z dus ongemoeid. Het lentepunt is
     daarmee het nulpunt van BEIDE schalen, zonder dat daar iets voor uitgelijnd
     hoeft te worden. Lokaal +X is ecliptische lengte 90 — de derde as van een
     rechtshandig frame met +Y op de ecliptica-pool en +Z op het lentepunt. */
  const eclipticGradGroup = new THREE.Group();
  eclipticGradGroup.name = 'ecliptic-graduation';
  const eclTickPts = [];
  for (let d = 0; d < 360; d += 10) {
    const a = d * Math.PI / 180;
    const lang = d % 30 === 0;
    const r0 = cfg.eclTickInner, r1 = lang ? cfg.eclTickLong : cfg.eclTickOuter;
    const sx = Math.sin(a), sz = Math.cos(a);
    eclTickPts.push(sx * r0, 0, sz * r0, sx * r1, 0, sz * r1);

    if (lang) {
      const sp = createLabelSprite(THREE, d + '°', cfg.eclipticColor,
                                   { width: 128, height: 56, font: 40 });
      sp.position.set(sx * (cfg.eclTickLong + 7), 0, sz * (cfg.eclTickLong + 7));
      sp.renderOrder = 4;
      eclipticGradGroup.add(sp);
      raLabels.push(sp);
    }
  }
  const eclTickGeo = track(new THREE.BufferGeometry());
  eclTickGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(eclTickPts), 3));
  const eclTickLine = new THREE.LineSegments(eclTickGeo, track(new THREE.LineBasicMaterial({
    color: cfg.eclipticColor, transparent: true, opacity: 0.7, depthWrite: false
  })));
  eclTickLine.renderOrder = 4;
  eclTickLine.raycast = () => {};
  eclipticGradGroup.add(eclTickLine);
  eclipticGroup.add(eclipticGradGroup);

  /* ---- bijwerken ----
     Twee quaternions, meer niet. Geen vertex-herschrijving, dus ook geen
     smoring: de dot-vergelijking die de oude laag gebruikte om werk te
     vermijden kost hier meer dan het werk zelf. */
  let lastEps = null;
  const _axisZ = new THREE.Vector3(0, 0, 1);   // boven update(); `const` is niet hoisted

  function update(date, camera) {
    if (!group.visible) return false;
    const f = skyFrame(date);
    orientation.equatorial(group.quaternion, f.gast);
    // De scheefstand verloopt 0,013 graden per eeuw; hem elke tik opnieuw
    // zetten is goedkoop, maar hem overslaan als hij niet meetbaar veranderde
    // scheelt een quaternion-vermenigvuldiging en houdt de rotatie exact stil.
    if (lastEps === null || Math.abs(f.eps - lastEps) > 1e-9) {
      eclipticGroup.quaternion.setFromAxisAngle(_axisZ, f.eps * Math.PI / 180);
      lastEps = f.eps;
    }
    group.updateMatrixWorld(true);
    if (camera) redrawLabels(camera);
    return true;
  }

  function redrawLabels(camera) {
    if (!group.visible || !camera) return;
    for (const sp of raLabels) scaleToPixels(THREE, sp, camera, cfg.labelHeightPx);
  }

  /* `setVisible` neemt een object, want deze laag draagt drie dingen die los
     schakelbaar zijn. Weglaten = ongemoeid laten, zodat een aanroeper die
     alleen de equator omzet de ecliptica niet stilletjes meesleept. */
  function setVisible(which = {}, date, camera) {
    //  is het KANTELFRAME en staat altijd aan; wat schakelt zijn
    // zijn kinderen. Anders zou de gradenverdeling meeverdwijnen zodra iemand
    // alleen de band uitzet, en die twee zijn los bedienbaar.
    if ('ecliptic' in which) eclipticBand.visible = !!which.ecliptic;
    if ('equator' in which) equatorBand.visible = !!which.equator;
    if ('graduation' in which) gradGroup.visible = !!which.graduation;
    if ('eclipticGraduation' in which) eclipticGradGroup.visible = !!which.eclipticGraduation;
    // De equinox-markers horen bij BEIDE verdelingen: het zijn de nulpunten van
    // allebei de schalen, en de plek waar de twee vlakken elkaar snijden.
    equinoxGroup.visible = gradGroup.visible || eclipticGradGroup.visible;
    // De groep zelf staat aan zodra er íéts in zichtbaar is; scheelt een
    // traverse per frame wanneer alles uit staat.
    group.visible = eclipticBand.visible || equatorBand.visible ||
                    gradGroup.visible || eclipticGradGroup.visible;
    // De orientatie wordt pas in update() gezet, dus een toggle moet die zelf
    // aanroepen — anders gebeurt er niets zichtbaars tot de volgende tik van
    // dertig seconden. Dezelfde val als bij setVisible() van de zon/maan-laag
    // in sessie 14.
    if (group.visible && date) update(date, camera);
    return group.visible;
  }

  // Beginstand: alles uit, elk onderdeel heeft zijn eigen schakelaar. Het
  // kantelframe zelf blijft aan — dat is geen zichtbaar ding maar een rotatie.
  eclipticBand.visible = false;
  eclipticGradGroup.visible = false;
  equatorBand.visible = false;
  gradGroup.visible = false;
  equinoxGroup.visible = false;

  const _v = new THREE.Vector3();
  const equinoxDirections = () => ({
    vernal:    _v.set(0, 0, 1).applyQuaternion(group.quaternion).clone(),
    autumnal:  _v.set(0, 0, -1).applyQuaternion(group.quaternion).clone()
  });

  function dispose() {
    disposables.forEach(o => o.dispose && o.dispose());
    if (group.parent) group.parent.remove(group);
  }

  return {
    group, update, setVisible, redrawLabels, equinoxDirections, dispose,
    config: cfg,
    meshes: { equatorBand, eclipticBand, eclipticGroup, gradGroup,
              eclipticGradGroup, equinoxGroup },
    isVisible: () => group.visible
  };
}
