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

export const LAGRANGE_POINTS = ['L1', 'L2', 'L4', 'L5'];

export function createLagrangeLayer(THREE, opts = {}) {
  const cfg = Object.assign({
    sunDistance:    420,     // moet gelijk zijn aan PARAMS.sunDistance
    innerRadius:  150,     // waar L1 en L2 komen te staan (symbolisch)
    markerRadius:    3.4,
    color:      0x8fd0ff,
    labelHeightPx:  22
  }, opts);

  const group = new THREE.Group();
  group.name = 'lagrange';
  group.visible = false;

  const LABEL_CANVAS = { breed: 128, hoog: 56, font: 40 };

  function makeLabel(tekst) {
    const cv = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = LABEL_CANVAS.breed * dpr; cv.height = LABEL_CANVAS.hoog * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.font = '600 ' + LABEL_CANVAS.font + 'px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(tekst, LABEL_CANVAS.breed / 2, LABEL_CANVAS.hoog / 2);
    ctx.fillStyle = '#8fd0ff';
    ctx.fillText(tekst, LABEL_CANVAS.breed / 2, LABEL_CANVAS.hoog / 2);
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false }));
    sp.scale.set(1, LABEL_CANVAS.hoog / LABEL_CANVAS.breed, 1);
    return sp;
  }

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
      if (camera) scaleLabel(p, camera);
    }
    return r;
  }

  // Schermvast, zelfde reden als bij de planeetlabels: het zoombereik van
  // deze scene is te groot voor een vaste wereldmaat.
  function scaleLabel(p, camera) {
    const d = camera.position.distanceTo(p.label.position);
    const perPixel = 2 * d * Math.tan(camera.fov / 2 * Math.PI / 180) / window.innerHeight;
    const h = cfg.labelHeightPx * perPixel;
    p.label.scale.set(h * LABEL_CANVAS.breed / LABEL_CANVAS.hoog, h, 1);
  }

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
      for (const k of LAGRANGE_POINTS) scaleLabel(points[k], camera);
    },
    isZichtbaar: () => group.visible
  };
}
