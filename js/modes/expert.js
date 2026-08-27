/* ============================================================
   TERRA — "Deskundig" (schematische) weergavemodus
   ------------------------------------------------------------
   Vector-ondergrond i.p.v. de realistische geshaderde aarde:
   effen oceaan-bol + vlak land-vlak + harde kustlijnen + een
   lat/lng-graticule. Geen bloom, geen gloed, geen atmosfeer —
   de vakgebied-herkenbare, "platte" kaart-look.

   Pure functies met dependency-injection: alles wat ze nodig
   hebben (world, THREE, de post-processing-passes, PARAMS, de
   land-features) komt als argument binnen. Geen gedeelde app-
   globals → laag regressie-risico. enter/exit zijn idempotent.
   ============================================================ */

let oceanMat = null; // gecachet vlak oceaan-materiaal (één keer bouwen)

// Schakel naar de schematische weergave.
export function enterExpertMode({ world, THREE, bloomPass, gradePass, PARAMS }) {
  // 1. post-processing uit — geen bloom/gloed/aberratie in deskundig modus
  if (bloomPass) bloomPass.enabled = false;
  if (gradePass) gradePass.enabled = false;

  // 2. atmosfeer + sterren uit → platte, rustige achtergrond
  if (world.showAtmosphere) world.showAtmosphere(false);
  world.backgroundImageUrl(null);
  if (world.backgroundColor) world.backgroundColor(PARAMS.expertBg || '#0b0e14');

  // 3. vlakke oceaan-bol (MeshBasic = ongelicht, geen reliëf/glinster)
  if (!oceanMat) {
    oceanMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PARAMS.expertOcean) });
  } else {
    oceanMat.color.set(PARAMS.expertOcean);
  }
  world.globeMaterial(oceanMat);

  // 4. het land tekent deze module NIET meer (sessie 28). `polygonsData` had twee
  //    schrijvers gekregen — deze modus én de wireframe-doorkijk, die dezelfde
  //    kustlijnen nodig heeft — en dan wist de `polygonsData([])` van exitExpertMode
  //    stilletjes de omtrek van de ander. Zelfde klasse als `world.onZoom`, dat ook
  //    een setter is en geen abonnement (sessie 7). Er is nu één schrijver:
  //    `syncLandPolygons()` in index.html, die uit `globeMode` en `wireframeOn`
  //    afleidt welke van de drie standen geldt. Wie hier weer een polygon-regel
  //    neerzet, verliest hem bij de eerstvolgende moduswissel.

  // 5. lat/lng-raster
  if (world.showGraticules) world.showGraticules(true);
}

// Schakel terug naar realistisch: maak alle expert-wijzigingen ongedaan.
// Het globe-materiaal zelf wordt door de realistische tak weer op de shader gezet.
/* `bloomAan` komt van de aanroeper en is niet optioneel-met-terugval-op-true.
   Sinds sessie 41 is de gloed een VOORKEUR, en een vaste `true` hier zou hem
   stil omzetten zodra iemand één keer door de schematische weergave heen loopt —
   de rij zegt dan "off" en het beeld gloeit. Dezelfde val als bij
   nightBrightness in sessie 35. */
export function exitExpertMode({ world, bloomPass, gradePass, starsUrl, bloomAan }) {
  if (typeof bloomAan !== 'boolean') {
    throw new Error('exitExpertMode: bloomAan is verplicht (de voorkeur, niet true)');
  }
  if (bloomPass) bloomPass.enabled = bloomAan;
  if (gradePass) gradePass.enabled = true;
  if (world.showAtmosphere) world.showAtmosphere(true);
  // starsUrl komt mee omdat de sterrenhemel bij de gekozen textuurkwaliteit hoort.
  if (starsUrl) world.backgroundImageUrl(starsUrl);
  // Het land wordt hier NIET leeggemaakt — zie de noot bij stap 4 van enterExpertMode.
  // De aanroeper draait `syncLandPolygons()` en die beslist of er nog kustlijnen
  // moeten staan (dat is zo zodra de wireframe aan is).
  if (world.showGraticules) world.showGraticules(false);
}
