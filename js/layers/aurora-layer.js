/* ============================================================
   TERRA — Aurora-laag (three.js-adapter)
   ------------------------------------------------------------
   De poollichtovaal van NOAA's OVATION-model: een schil om de bol
   die per graadcel de kans op zichtbare aurora toont, dertig
   minuten vooruit. Het is het enige ruimteweer dat je met het
   blote oog kunt zien, en daarmee de laag die het dichtst bij de
   kijker staat van alles wat deze app van de zon laat zien.

   ------------------------------------------------------------
   DEZE MODULE BEZIT DRIE DINGEN EN VERDER NIETS
   ------------------------------------------------------------
   Het raster (een Uint8Array van 360 x 181), de textuur die dat
   raster naar de GPU brengt, en de mesh. Hij kent geen `active`,
   geen adapters en geen sloten — dat blijft in index.html, net als
   bij de andere lagen.

   ------------------------------------------------------------
   DE MESH MOET EEN KIND VAN DE AARDE WORDEN
   ------------------------------------------------------------
   Niet van `world.scene()`. three-globe draait de aarde-mesh -90
   graden zodat textuur-lengte 0 op +Z ligt; een kind erft die draai
   en spreekt dus hetzelfde frame als de dagtextuur eronder. Hang je
   hem in de scene, dan staat de ovaal een kwartslag verkeerd en is
   er geen instelling die dat rechtzet.

   Ophangen dus via `whenEarthMeshReady()`, want globe.gl past een
   nieuw globe-materiaal pas bij de volgende render-tick toe. Zie de
   tekenlaag voor hetzelfde patroon.

   ------------------------------------------------------------
   HET RASTER GAAT NIET IN `store`
   ------------------------------------------------------------
   65.160 cellen zijn geen 65.160 gebeurtenissen. De adapter schrijft
   hier binnen en geeft een lege array terug, precies zoals de vier
   andere SWPC-adapters dat met de zonneactiviteit doen.
   ============================================================ */

import { AURORA_VERT, AURORA_FRAG } from '../shaders.js';

// Het OVATION-raster is één cel per graad: 360 lengtes, 181 breedtes
// (-90 tot en met +90, dus inclusief beide polen).
export const AURORA_W = 360;
export const AURORA_H = 181;

export function createAuroraLayer(THREE, opts = {}) {
  const cfg = Object.assign({
    earthRadius: 100,
    altitude: 0.027,      // straal 102,7 — boven de wolken (102), fysiek ~170 km
    segments: 128,        // in de breedte; de hoogte is de helft
    renderOrder: 4,       // zie de noot bij de mesh
    // De zon-uniform van de aarde-shader komt van buiten binnen, als GEDEELDE
    // referentie. Dan loopt de dagzijde van de aurora synchroon met de
    // terminator zonder dat iemand ze hoeft bij te werken.
    sunUniform: null,
    params: {}
  }, opts);

  // Het raster. Eén byte per cel: OVATION levert hele procenten, dus een float
  // zou vier keer zoveel geheugen kosten voor precisie die er niet is.
  const grid = new Uint8Array(AURORA_W * AURORA_H);
  let peakValue = null;   // hoogste kans in het laatste raster, 0..100
  let forecastTime = null;

  const texture = new THREE.DataTexture(grid, AURORA_W, AURORA_H, THREE.RedFormat, THREE.UnsignedByteType);
  // LinearFilter is geen sierbeslissing: de default van DataTexture is
  // NearestFilter, en dan zie je het raster als blokken van één graad.
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  // In de lengte loopt het raster rond, in de breedte niet — bij de polen
  // doortrekken in plaats van terugvouwen.
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  // `flipY` NIET omzetten. DataTexture zet hem op false (anders dan
  // TextureLoader, die true heeft), en daardoor landt rij 0 op v=0 = de
  // zuidpool. Dat is precies goed, want OVATION's breedtes lopen op vanaf -90.
  texture.needsUpdate = true;

  const uniforms = {
    auroraMap:      { value: texture },
    sunPosition:    cfg.sunUniform || { value: new THREE.Vector2(0, 0) },
    auroraOpacity:  { value: 0.85 },
    auroraGamma:    { value: 2.4 },
    auroraFloor:    { value: 0.02 },
    auroraDayFloor: { value: 0.25 },
    auroraRedFrom:  { value: 0.55 },
    auroraLow:      { value: new THREE.Color('#1fbf5a') },
    auroraMid:      { value: new THREE.Color('#8fe36b') },
    auroraHigh:     { value: new THREE.Color('#e8483a') }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: AURORA_VERT,
    fragmentShader: AURORA_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    // FrontSide en niet DoubleSide: de binnenkant van deze schil zie je nooit,
    // en additief zou hij de gloed aan de limbus dubbel optellen.
    side: THREE.FrontSide
  });

  const R = cfg.earthRadius * (1 + cfg.altitude);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(R, cfg.segments, cfg.segments >> 1), material);
  mesh.name = 'terra-aurora';
  mesh.visible = false;
  // Expliciete renderOrder. Alle bolschillen delen hun bounding-middelpunt met
  // de atmosfeer op straal 120, dus three kan ze niet op diepte sorteren en valt
  // terug op objectvolgorde — dezelfde val die bij de hemelschijven beschreven staat.
  mesh.renderOrder = cfg.renderOrder;

  applyParams(cfg.params);

  // Neem de bespeelbare waarden over uit PARAMS. Losse functie omdat de laag bij
  // het bouwen nog niet weet welke er gelden en een moduswissel ze opnieuw kan zetten.
  function applyParams(p = {}) {
    if (p.auroraOpacity   != null) uniforms.auroraOpacity.value   = p.auroraOpacity;
    if (p.auroraGamma     != null) uniforms.auroraGamma.value     = p.auroraGamma;
    if (p.auroraFloor     != null) uniforms.auroraFloor.value     = p.auroraFloor;
    if (p.auroraDayFloor  != null) uniforms.auroraDayFloor.value  = p.auroraDayFloor;
    if (p.auroraRedFrom   != null) uniforms.auroraRedFrom.value   = p.auroraRedFrom;
    if (p.auroraLow)  uniforms.auroraLow.value.set(p.auroraLow);
    if (p.auroraMid)  uniforms.auroraMid.value.set(p.auroraMid);
    if (p.auroraHigh) uniforms.auroraHigh.value.set(p.auroraHigh);
  }

  /* Het raster vullen uit de OVATION-JSON.

     `coordinates` is een array van [lengte, breedte, kans] met lengte 0..359,
     breedte -90..90 en kans 0..100. De volgorde is lengte-hoofdzakelijk (eerst
     alle 181 breedtes van lengte 0), maar daar rekenen we NIET op: de index komt
     uit de waarden zelf, zodat een herordening aan de bron niets breekt.

     De kans wordt geschaald naar 0..255 omdat de shader hem als 0..1 leest.
     Geeft de piek terug (0..100), die de laagrij als teller toont. */
  function setData(coordinates, meta = {}) {
    if (!Array.isArray(coordinates)) return null;
    grid.fill(0);
    let peak = 0;
    for (const c of coordinates) {
      const lon = c[0] | 0;
      const y = (c[1] | 0) + 90;
      const v = c[2];
      if (lon < 0 || lon >= AURORA_W || y < 0 || y >= AURORA_H) continue;
      if (v > peak) peak = v;
      grid[y * AURORA_W + lon] = v > 100 ? 255 : Math.round(v * 2.55);
    }
    // ALLEEN HIER. Een textuur die elke frame opnieuw naar de GPU gaat kost
    // bandbreedte voor niets — het raster verandert eens per vijf minuten.
    texture.needsUpdate = true;
    peakValue = peak;
    forecastTime = meta.forecastTime || null;
    return peak;
  }

  function setVisible(on) { mesh.visible = !!on; }

  function dispose() {
    if (mesh.parent) mesh.parent.remove(mesh);
    mesh.geometry.dispose();
    material.dispose();
    texture.dispose();
  }

  return {
    mesh,
    setData,
    setVisible,
    applyParams,
    dispose,
    peak: () => peakValue,
    forecast: () => forecastTime,
    get visible() { return mesh.visible; }
  };
}
