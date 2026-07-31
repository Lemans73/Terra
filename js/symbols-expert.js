/* ============================================================
   TERRA — schematische datalaag-symbolen ("Deskundig" modus)
   ------------------------------------------------------------
   Vakgebied-herkenbare symbolen i.p.v. de realistische gloed-
   glyphs: harde randen, vlakke kleuren, géén AdditiveBlending,
   géén gloed/puls. Alles wordt in het lokale XY-vlak gebouwd;
   customThreeObjectUpdate oriënteert +Z radiaal naar buiten,
   dus de platte symbolen liggen tangentieel op de kaart.

   Elk symbool krijgt een dunne lichte "casing" (contrast-rand):
   een iets grotere kopie van dezelfde geometrie in PARAMS.expertEdge,
   net achter het symbool (richting bol-centrum). Cartografische
   conventie → élk symbool blijft leesbaar op de donkere kaart,
   maar de rand blijft hard (geometrie, geen gloed).

   buildExpertGlyph is puur: het bouwt en retourneert
   { group, inner, parts, noAnim }. Het inline-script doet de
   bookkeeping (glyphList, userData, animateIn). THREE + depthHex
   worden geïnjecteerd; COLORS/PARAMS/aqiHex uit config.
   ============================================================ */

import { COLORS, PARAMS, aqiHex, magHex } from './config.js';

// ---- vlakke-vorm helpers (lokaal XY-vlak, dubbelzijdig, ongelicht) ----
// depthWrite:false → symbolen schrijven geen diepte en vechten dus niet onderling
// (geen z-fighting/"kam"-artefacten op drukke locaties). depthTest blijft aan, dus
// de bol occludeert nog steeds de symbolen aan de achterkant. Zelfde patroon als
// de realistische glyphs.
function basicMat(T, color, opts = {}) {
  return new T.MeshBasicMaterial({ color, side: T.DoubleSide, depthWrite: false, ...opts });
}
function discGeo(T, r, segs = 32) { return new T.CircleGeometry(r, segs); }
function ringGeo(T, rInner, rOuter, segs = 48) { return new T.RingGeometry(rInner, rOuter, segs); }
function triGeo(T, r) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(new Float32Array([
    0,         r,        0,
    -r * 0.87, -r * 0.5, 0,
     r * 0.87, -r * 0.5, 0
  ]), 3));
  return g;
}
function squareGeo(T, half) { return new T.PlaneGeometry(half * 2, half * 2); }
function boltGeo(T, s = 3.6) {
  const sh = new T.Shape();
  sh.moveTo(0.18 * s,  0.50 * s);
  sh.lineTo(-0.22 * s, 0.04 * s);
  sh.lineTo(-0.02 * s, 0.04 * s);
  sh.lineTo(-0.18 * s, -0.50 * s);
  sh.lineTo(0.24 * s,  0.08 * s);
  sh.lineTo(0.04 * s,  0.08 * s);
  sh.lineTo(0.22 * s,  0.50 * s);
  sh.closePath();
  return new T.ShapeGeometry(sh);
}

// Voeg een platte vorm + zijn dunne contrast-rand ("casing") toe aan `target`.
// De rand is dezelfde geometrie, met een ABSOLUTE breedte (PARAMS.expertEdgeWidth)
// ongeacht de symboolgrootte → consistente, subtiele high-end rand. `r` is de
// karakteristieke straal van de vorm (waaruit de schaalfactor wordt afgeleid).
function addShape(T, target, geo, color, { r = 1, dz = 0.05, rotZ = 0 } = {}) {
  const k = (r + PARAMS.expertEdgeWidth) / r;
  const edge = new T.Mesh(geo, basicMat(T, PARAMS.expertEdge));
  edge.scale.set(k, k, 1); edge.position.z = -dz; if (rotZ) edge.rotation.z = rotZ;
  const fill = new T.Mesh(geo, basicMat(T, color));
  if (rotZ) fill.rotation.z = rotZ;
  target.add(edge); target.add(fill);
  return fill;
}

// Bouw het schematische symbool voor één datum.
export function buildExpertGlyph(d, { THREE: T, depthHex }) {
  const group = new T.Group();
  const inner = new T.Group();
  group.add(inner);
  const parts = {};
  let noAnim = false;
  const L = d.layer;

  if (L === 'quake') {
    // Seismische conventie (deskundig): ring + staaf samen.
    //   kleur (ring+staaf) = magnitude · ring-straal = magnitude · staaf-hoogte = diepte
    // Zo lees je de KRACHT in één oogopslag (kleur + ringgrootte) en de DIEPTE aan de
    // staafhoogte (sqrt-schaal → ook ondiepe bevingen krijgen onderling onderscheid).
    const mag = d.value || 1.5;
    const col = magHex(mag);
    // ring: magnitude-"footprint" op het oppervlak
    const rOuter = PARAMS.expertQuakeRingBase + mag * PARAMS.expertQuakeRingPerMag;
    const rInner = Math.max(0.3, rOuter - PARAMS.expertQuakeRingBand);
    addShape(T, inner, ringGeo(T, rInner, rOuter, 48), col, { r: rOuter });
    // staaf: hoogte ∝ diepte (radiaal naar buiten vanaf het epicentrum)
    const depth = (d.depth == null || isNaN(d.depth)) ? 0 : Math.max(0, d.depth);
    const h = PARAMS.expertQuakeBarBase + Math.sqrt(Math.min(depth, 700) / 700) * PARAMS.expertQuakeBarDepth;
    const rad = PARAMS.expertQuakeRadius;
    const bar = new T.Mesh(new T.CylinderGeometry(rad, rad, h, 12), basicMat(T, col));
    bar.geometry.rotateX(Math.PI / 2);   // as +Y → +Z (radiaal naar buiten)
    bar.geometry.translate(0, 0, h / 2); // basis op het oppervlak
    inner.add(bar);
    addShape(T, inner, discGeo(T, rad * 1.3, 16), col, { r: rad * 1.3 }); // epicentrum-stip
  } else if (L === 'volcano') {
    addShape(T, inner, triGeo(T, 2.8), COLORS.volcano, { r: 2.8 });   // ▲ geologisch symbool
  } else if (L === 'aqi') {
    addShape(T, inner, squareGeo(T, 2.2), aqiHex(d.value), { r: 2.2 }); // ■ EPA-bandkleur
  } else if (L === 'storm') {
    // cycloon: twee dunne harde armen + centrum (blijft draaien via parts.spin)
    const col = COLORS.storm;
    const mat = basicMat(T, col);
    const steps = 40, size = PARAMS.stormSize;
    for (let arm = 0; arm < 2; arm++) {
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const tt = i / steps;
        const th = tt * 1.6 * Math.PI * 2 + arm * Math.PI;
        const rr = size * Math.pow(tt, 0.82);
        pts.push(new T.Vector3(Math.cos(th) * rr, Math.sin(th) * rr, 0));
      }
      const curve = new T.CatmullRomCurve3(pts);
      inner.add(new T.Mesh(new T.TubeGeometry(curve, steps, 0.13, 5, false), mat));
    }
    addShape(T, inner, discGeo(T, 0.6, 16), col, { r: 0.6 });
    parts.spin = inner; parts.spinSpeed = PARAMS.stormSpinSpeed;
  } else if (L === 'ice') {
    addShape(T, inner, ringGeo(T, 2.0, 2.7, 6), COLORS.ice, { r: 2.7 }); // ⬡ zeshoek-omtrek
  } else if (L === 'wildfire') {
    addShape(T, inner, squareGeo(T, 1.8), COLORS.wildfire, { r: 1.8, rotZ: Math.PI / 4 }); // ◆ ruit
  } else if (L === 'lightning') {
    addShape(T, inner, boltGeo(T, 3.6), COLORS.lightning, { r: 1.8 }); // ϟ hard symbool, statisch
    noAnim = true;
  } else {
    addShape(T, inner, discGeo(T, 1.0, 16), COLORS[L] || '#ffffff', { r: 1.0 }); // onbekend → stip
  }

  return { group, inner, parts, noAnim };
}
