/* ============================================================
   TERRA — Antipode-laag (three.js)
   ------------------------------------------------------------
   De koorde dwars door de aarde van een gebeurtenis naar zijn
   tegenpunt, met een markering en de coördinaat aan de andere
   kant. Aanleiding: twee bevingen van vergelijkbare kracht in
   dezelfde week, in Colombia en Indonesië, vrijwel antipodaal.

   ------------------------------------------------------------
   DIT IS EEN WEERGAVE EN GEEN BEWERING
   ------------------------------------------------------------
   Antipodale bevingen hebben niets met elkaar te maken; de aarde
   is geen doorgeefluik. De laag tekent daarom een meetkundig
   feit en verder niets — geen afstand, geen "opmerkelijk", geen
   duiding. Wie hier een regel tekst bij wil zetten, bedenke dat
   elke regel een uitspraak is.

   ------------------------------------------------------------
   DEZE MODULE BEZIT ÉÉN GROEP EN VERDER NIETS
   ------------------------------------------------------------
   Hij kent geen bevingen, geen detailvenster en geen wireframe.
   Wie hem aanzet, zet zelf de wireframe aan — zonder doorkijk
   loopt de koorde binnen een ondoorzichtige bol en zie je niets.

   ------------------------------------------------------------
   DE GROEP HANGT IN DE SCENE, NIET AAN DE AARDE-MESH
   ------------------------------------------------------------
   Twee redenen, en ze wijzen dezelfde kant op:

   (1) `earthMesh.visible = false` — precies wat de wireframe doet —
       neemt in three ÉLK kind mee. Een kind van de aarde-mesh zou
       dus onzichtbaar zijn op het enige moment dat deze laag telt.
       Dat is de bug die de aurora in sessie 27 had.
   (2) De aanroeper geeft posities aan als `world.getCoords()`-
       vectoren, en dat frame is het SCENE-frame — hetzelfde dat
       sunmoon-layer, planets-layer en de indicatoren delen. Zeven
       lagen hangen hun groep om die reden rechtstreeks in
       `world.scene()`; dit is de achtste.

   De aurora is wél een zusje mét de yaw van de aarde-mesh, en dat
   is geen tegenspraak: die laag legt een TEXTUUR over de bol en
   moet daarvoor in het textuurframe staan. Een punt op lengte en
   breedte heeft dat niet nodig — `getCoords()` doet die omrekening
   al.
   ============================================================ */

import { createLabelSprite, scaleToPixels } from '../core/label-sprite.js';

/* Het tegenpunt. Beide gevallen op de naad kloppen: lengte 0 geeft +180 en
   lengte 180 geeft 0, allebei correct. Handmatige ijking, tevens de aanleiding
   van deze laag: Bogotá (4,7 N · 74,1 W) → 4,7 Z · 105,9 O, in de Indische
   Oceaan ten zuidwesten van Sumatra. */
export function antipodeOf(lat, lng) {
  return { lat: -lat, lng: lng > 0 ? lng - 180 : lng + 180 };
}

/* De coördinaat zoals hij op het label komt. Halfrond-letters in plaats van een
   minteken, want een label dat "-4.7, 105.9" zegt vraagt de lezer om te weten
   welk teken welke kant op wijst. */
export function formatCoord(lat, lng) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(1)}° ${ns} · ${Math.abs(lng).toFixed(1)}° ${ew}`;
}

export function createAntipodeLayer(THREE, opts = {}) {
  const cfg = Object.assign({
    earthRadius: 100,
    color: '#6fe3ff',
    chordRadius: 0.45,   // straal van de koorde-cilinder in wereld-eenheden
    markerRadius: 2.4,   // buitenstraal van de ring op het tegenpunt
    labelHeightPx: 20,
    labelGapPx: 10,
    labelLiftMaxPx: 90,  // zoals bij de planeetlabels: niet meelopen tot in het absurde
    renderOrder: 5
  }, opts);

  const group = new THREE.Group();
  group.visible = false;

  const kleur = new THREE.Color(cfg.color);

  /* DE KOORDE IS EEN CILINDER EN GEEN `THREE.Line`. Een lijn is op vrijwel elk
     platform precies één pixel breed — `linewidth` wordt door de WebGL-renderer
     genegeerd — en één pixel verdwijnt tussen de roosterlijnen van de wireframe.
     De cilinder loopt van oppervlak tot oppervlak, dus zijn lengte is de
     diameter en zijn midden is de oorsprong. Dat laatste is geen toeval maar de
     definitie van een antipode: de verbinding gaat door het middelpunt. */
  const chord = new THREE.Mesh(
    new THREE.CylinderGeometry(cfg.chordRadius, cfg.chordRadius, cfg.earthRadius * 2, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: kleur, transparent: true, opacity: 0.85, depthWrite: false })
  );
  chord.renderOrder = cfg.renderOrder;
  group.add(chord);

  /* De markering op het tegenpunt: een platte ring die op het oppervlak ligt,
     radiaal naar buiten gericht. Geen bol — die leest als een object dat ergens
     zweeft, terwijl dit een PLEK is. */
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(cfg.markerRadius * 0.55, cfg.markerRadius, 32),
    new THREE.MeshBasicMaterial({ color: kleur, transparent: true, opacity: 0.95,
                                  side: THREE.DoubleSide, depthWrite: false })
  );
  marker.renderOrder = cfg.renderOrder + 1;
  group.add(marker);

  const label = createLabelSprite(THREE, '—', cfg.color, { height: 44, font: 30 });
  label.renderOrder = cfg.renderOrder + 2;
  group.add(label);

  // Hergebruikte vectoren: deze laag draait in de renderlus en mag daar niets
  // toewijzen.
  const _dir = new THREE.Vector3();
  const _up  = new THREE.Vector3(0, 1, 0);
  const _fwd = new THREE.Vector3(0, 0, 1);

  let aan = false;
  let punt = null;   // { lat, lng } van het TEGENpunt, voor wie het wil weten

  /* `from` en `to` komen als wereldvectoren binnen — de aanroeper heeft
     `world.getCoords()` en die kent het frame. Deze module rekent geen lengte en
     breedte om naar 3D: dat zou een tweede omrekening in de codebase zetten die
     stilletjes uit de pas kan lopen met de eerste. */
  function show(from, to, coord) {
    // De koorde: middelpunt op de oorsprong, en de cilinder-as (+Y) naar de
    // richting van het tegenpunt draaien. `setFromUnitVectors` oriënteert LOKAAL;
    // `lookAt()` zou hier de camera erbij halen, en die hoort er niet bij.
    _dir.copy(to).normalize();
    chord.position.set(0, 0, 0);
    chord.quaternion.setFromUnitVectors(_up, _dir);

    // De ring op het oppervlak, met zijn vlak loodrecht op de straal. Een
    // RingGeometry ligt in het XY-vlak en kijkt dus langs +Z; die as naar buiten
    // draaien legt hem plat op de bol.
    marker.position.copy(to);
    marker.quaternion.setFromUnitVectors(_fwd, _dir);

    label.position.copy(to);
    zetLabel(coord);

    punt = coord;
    aan = true;
    group.visible = true;
  }

  function zetLabel(coord) {
    const tekst = formatCoord(coord.lat, coord.lng);
    if (label.userData.tekst === tekst) return;   // hetzelfde canvas niet opnieuw tekenen
    const nieuw = createLabelSprite(THREE, tekst, cfg.color, { height: 44, font: 30 });
    label.material.map.dispose();
    label.material.map = nieuw.material.map;
    label.material.needsUpdate = true;
    label.userData.labelCanvas = nieuw.userData.labelCanvas;
    label.userData.tekst = tekst;
    nieuw.material.dispose();
  }

  function hide() {
    aan = false;
    group.visible = false;
  }

  /* SCHERMVAST, elke frame. Het label hangt op het tegenpunt zelf en wordt in
     SCHERMruimte omhoog geduwd met `sprite.center` — de enige "omhoog" die in
     elke camerastand hetzelfde betekent (sessie 26). Een wereldlift langs de
     straal zou in de stand waarin je pal op het tegenpunt kijkt naar de camera
     wijzen in plaats van omhoog. */
  function update(camera) {
    if (!aan || !camera) return;
    const h = scaleToPixels(THREE, label, camera, cfg.labelHeightPx);
    const perPixel = h / cfg.labelHeightPx;
    const markerPx = Math.min(cfg.markerRadius / perPixel, cfg.labelLiftMaxPx);
    label.center.set(0.5, -(markerPx + cfg.labelGapPx) / cfg.labelHeightPx);
  }

  function dispose() {
    group.removeFromParent();
    chord.geometry.dispose();  chord.material.dispose();
    marker.geometry.dispose(); marker.material.dispose();
    if (label.material.map) label.material.map.dispose();
    label.material.dispose();
  }

  return { group, show, hide, update, dispose,
           isOn: () => aan,
           point: () => punt };
}
