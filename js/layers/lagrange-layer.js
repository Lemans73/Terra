/* ============================================================
   TERRA — Lagrange-laag (three.js-adapter)
   ------------------------------------------------------------
   De vijf punten van het zon-aardestelsel waar zwaartekracht en
   middelpuntvliedende kracht elkaar opheffen, zodat iets er meedraait
   zonder aandrijving. Terra tekent er vier: L3 ligt achter de zon en is
   onbereikbaar en onbewoond.

   WAAROM IN EEN GEOFYSISCH DASHBOARD: op L1 staan DSCOVR en ACE, en zij
   meten de zonnewind VOORDAT hij de aarde bereikt. Elke
   ruimteweer-waarschuwing hangt daaraan — inclusief de NOAA-gegevens die
   deze app al toont. L2 huisvest James Webb, Gaia en Euclid.

   ------------------------------------------------------------
   DE SCHAAL IS HIER EEN LEUGEN, EN DAT STAAT ERBIJ
   ------------------------------------------------------------
   L1 en L2 liggen op 1,497 miljoen km: EEN PROCENT van de zonafstand.
   Op Terra's zoncompressie (1 : 5591, want de zon staat op 420 in
   plaats van 2.348.107) komen ze uit op 4,2 eenheden van het
   middelpunt — de globe heeft straal 100, dus ze zouden binnen de aarde
   liggen. Doorgerekend in sessie 22.

   Ze krijgen daarom een eigen straal, en de laag geeft de ware afstand
   terug zodat de readout die kan tonen. L4 en L5 liggen wel gewoon op
   de zonafstand en gaan dus op de zonschil — die twee zijn eerlijk.

   Wie dit ooit "op schaal" wil zetten: dat kan niet zonder de zon mee
   te verplaatsen, en dan past de zon niet meer in beeld. Het is geen
   slordigheid maar een keuze tussen twee onmogelijkheden.
   ============================================================ */

import { lagrangeDirections, LAGRANGE_INFO, L1_L2_KM } from '../compute/frames.js';
import { createLabelSprite, scaleToPixels, occludedByGlobe } from '../core/label-sprite.js';

export const LAGRANGE_POINTS = ['L1', 'L2', 'L4', 'L5'];

export function createLagrangeLayer(THREE, opts = {}) {
  const cfg = Object.assign({
    sunDistance:    420,     // moet gelijk zijn aan PARAMS.sunDistance
    innerRadius:  150,     // waar L1 en L2 komen te staan (symbolisch)
    markerRadius:    3.4,
    color:      0x8fd0ff,
    labelHeightPx:  22,
    // DEZE LAAG STAAT OM DE AARDE, en die dekt zijn eigen punten af: L2 ligt
    // van de zon af en valt dus regelmatig achter de bol. De heliocentrische
    // L-punten zitten in orbits-layer.js en hebben dit niet nodig — daar is de
    // globe verborgen.
    earthRadius:    100
  }, opts);

  const group = new THREE.Group();
  group.name = 'lagrange';
  group.visible = false;

  // Het label-canvas is smaller dan bij de planeten: "L1" is twee tekens
  // en een breed canvas zou de tekst alleen maar kleiner maken bij dezelfde
  // schermhoogte. De opbouw zelf staat sinds sessie 23 in core/label-sprite.js.
  const makeLabel = (tekst) =>
    createLabelSprite(THREE, tekst, cfg.color, { height: 56, font: 40 });

  // Kladvector voor de horizontoets in redrawLabels(), boven zijn gebruiker.
  const _world = new THREE.Vector3();

  const points = {};
  for (const k of LAGRANGE_POINTS) {
    // Een ruit en geen bol: dit is geen lichaam maar een plek. Een
    // octaeder van drie eenheden leest als een merkteken.
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(cfg.markerRadius),
      new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true,
                                    opacity: 0.9, wireframe: true }));
    const label = makeLabel(k);
    group.add(mesh, label);
    points[k] = { mesh, label, distanceKm: 0, onScale: false };
  }

  function update(date, camera) {
    if (!group.visible) return null;
    const r = lagrangeDirections(date);
    for (const k of LAGRANGE_POINTS) {
      const p = points[k], d = r[k];
      const radius = d.onSunShell ? cfg.sunDistance : cfg.innerRadius;
      p.mesh.position.set(d.direction.x * radius, d.direction.y * radius, d.direction.z * radius);
      p.label.position.copy(p.mesh.position).multiplyScalar(1.05);
      p.distanceKm = d.distanceKm;
      p.onScale = d.onSunShell;
      if (camera) placeLabel(p, camera);
    }
    return r;
  }

  /* Schermvast, zelfde reden als bij de planeetlabels: het zoombereik van deze
     scene is te groot voor een vaste wereldmaat.

     EN DE HORIZONTOETS ZIT ER IN, niet naast: `update()` en `redrawLabels()`
     moeten allebei dezelfde uitkomst geven. Zou alleen `redrawLabels()` hem
     doen, dan blijft een L-punt dat door de tijdstap achter de bol schuift
     zichtbaar tot de bezoeker toevallig zoomt.

     De toets hangt aan het MERKTEKEN en niet aan het label: de ruit bepaalt of
     dit punt boven de horizon staat, het label hoort daarbij. De ruit zelf
     wordt al door de gewone diepte-toets geklipt; het label niet, want dat is
     een sprite op `depthTest: false`. In sky-disks.js staat uitgeschreven
     waarom dit een aparte toets is en niet gewoon die diepte-toets. */
  const placeLabel = (p, camera) => {
    p.label.visible = !occludedByGlobe(p.mesh.getWorldPosition(_world),
                                       camera.position, cfg.earthRadius);
    if (p.label.visible) scaleToPixels(THREE, p.label, camera, cfg.labelHeightPx);
  };

  function setVisible(aan, date, camera) {
    group.visible = !!aan;
    if (aan && date) update(date, camera);
  }

  return {
    group, update, setVisible, points, config: cfg,
    info: LAGRANGE_INFO,
    distanceKm: L1_L2_KM,
    redrawLabels: (camera) => {
      if (!group.visible) return;
      for (const k of LAGRANGE_POINTS) placeLabel(points[k], camera);
    },
    isZichtbaar: () => group.visible
  };
}
