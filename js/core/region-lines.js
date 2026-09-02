/* region-lines.js — de onderverdeling binnen een land als ÉÉN buffer.
 *
 * WAAROM DIT NIET VIA globe.gl's `pathsData` GAAT, en dat is gemeten.
 * Die laag maakt één `Line2`-object per pad. Admin-1 heeft 8646 ringen, en met
 * een casing eronder zijn dat 17.292 objecten. GEMETEN op 2026-09-02:
 *
 *     regio's uit    30,2 ms per frame   (33 fps)
 *     regio's aan   108,3 ms per frame   ( 9 fps)   17.962 draw calls
 *
 * Dezelfde lijnen als één `LineSegments` zijn één draw call. Dat is precies de
 * afweging die graticule.js al maakt — zie de noot daar over 35 draw calls tegen
 * één — en dit bestand past hem toe op geografie in plaats van op een raster.
 *
 * WAT JE ERVOOR INLEVERT: geen casing en geen lijndikte boven één pixel, want
 * `LineBasicMaterial` kan dat niet. Voor deze laag is dat geen verlies maar de
 * bedoeling: regio's staan onder de landgrenzen in de hiërarchie, en een dunne
 * ingetogen lijn is wat die plek vraagt.
 *
 * DE OMREKENING KOMT VAN BUITEN. `coords` is `world.getCoords`, net als bij de
 * graticule: een tweede bolformule in deze codebase loopt ooit uit de pas met de
 * eerste.
 */

/* Hoe lang een recht stukje mag zijn, in graden. Admin-1 is al vereenvoudigd tot
   ongeveer 2 km (zie tools/simplify-admin1.mjs), dus de brondichtheid is hier de
   bindende factor en niet dit getal — het vangt alleen de enkele lange rechte
   stukken op, zoals de 49e breedtegraad tussen Canada en de VS, die anders als
   koorde dwars door de bol zouden snijden. */
const MAX_BOOG_DEG = 3.75;

/* Alle ringen van een FeatureCollection als lijnstukken-paren.
 *
 * DE RINGEN WORDEN NIET GESLOTEN toegevoegd en ook niet ontdubbeld. GeoJSON
 * herhaalt het eerste punt aan het eind, dus de ring sluit vanzelf; en twee
 * buurregio's delen hun grens, dus die lijn wordt twee keer getekend. Dat kost
 * geen extra draw call en het ontdubbelen zou een topologie-analyse vragen over
 * 248.565 punten. */
export function regionLinesGeometry(THREE, coords, geo) {
  const pos = [];
  const _a = { x: 0, y: 0, z: 0 };

  const zet = (lng, lat) => {
    const c = coords(lat, lng);
    pos.push(c.x, c.y, c.z);
  };

  /* Een stuk tussen twee punten, opgedeeld zodra het te lang wordt. Lineair in
     lengte/breedte en niet over de grootcirkel: de bron is een kaartlijn en die
     is in dezelfde ruimte gedefinieerd, dus interpoleren langs de grootcirkel
     zou de lijn juist van zijn eigen bron af bewegen. */
  const stuk = (p, q) => {
    let dLng = q[0] - p[0];
    // De datumlijn: een sprong van bijna 360 graden is een naad, geen lijn.
    if (Math.abs(dLng) > 180) return;
    const dLat = q[1] - p[1];
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dLng), Math.abs(dLat)) / MAX_BOOG_DEG));
    let vLng = p[0], vLat = p[1];
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const nLng = p[0] + dLng * t, nLat = p[1] + dLat * t;
      zet(vLng, vLat);
      zet(nLng, nLat);
      vLng = nLng; vLat = nLat;
    }
  };

  const ring = (r) => { for (let i = 0; i + 1 < r.length; i++) stuk(r[i], r[i + 1]); };
  const loop = (a) => {
    if (!a || !a.length) return;
    if (typeof a[0][0] === 'number') ring(a);
    else a.forEach(loop);
  };

  let ringen = 0;
  const telRingen = (a) => {
    if (!a || !a.length) return;
    if (typeof a[0][0] === 'number') ringen++;
    else a.forEach(telRingen);
  };

  for (const f of (geo.features || [])) {
    if (!f.geometry) continue;
    telRingen(f.geometry.coordinates);
    loop(f.geometry.coordinates);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  /* DE TELLING GAAT MEE NAAR BUITEN, want dit is de enige plek die weet hoeveel
     ringen erin gingen. Een laag die stil de helft kwijtraakt ziet er precies zo
     uit als een laag die klopt. */
  g.userData.ringen = ringen;
  g.userData.segmenten = pos.length / 6;
  return g;
}
