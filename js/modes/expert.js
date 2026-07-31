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
export function enterExpertMode({ world, THREE, bloomPass, gradePass, PARAMS, landFeatures }) {
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

  // 4. land-polygons met effen fill + harde kustlijn-stroke (globe.gl native).
  //    Hogere lift (0.01) → ruime z-buffer-scheiding van de oceaan-bol, anders ontstaat
  //    bij grazende kijkhoeken (polen/limbus) z-fighting = donkere "smudge"-vlekken.
  world.polygonsData(landFeatures || [])
    .polygonCapColor(() => PARAMS.expertLand)
    .polygonSideColor(() => 'rgba(0,0,0,0)') // geen zichtbare extrusie-zijkanten
    .polygonStrokeColor(() => PARAMS.expertCoast)
    .polygonAltitude(() => 0.01);

  // 5. lat/lng-raster
  if (world.showGraticules) world.showGraticules(true);
}

// Schakel terug naar realistisch: maak alle expert-wijzigingen ongedaan.
// Het globe-materiaal zelf wordt door de realistische tak weer op de shader gezet.
export function exitExpertMode({ world, bloomPass, gradePass, starsUrl }) {
  if (bloomPass) bloomPass.enabled = true;
  if (gradePass) gradePass.enabled = true;
  if (world.showAtmosphere) world.showAtmosphere(true);
  // starsUrl komt mee omdat de sterrenhemel bij de gekozen textuurkwaliteit hoort.
  if (starsUrl) world.backgroundImageUrl(starsUrl);
  world.polygonsData([]);
  if (world.showGraticules) world.showGraticules(false);
}
