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
    oceanMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(PARAMS.expertOcean),
      /* DE BOL STAAT ACHTERAAN IN DE DIEPTEBUFFER, en dat is hier nodig omdat
         alles wat erop ligt precies erop ligt. Het raster van globe.gl wordt
         gebouwd op straal 100 — dezelfde straal als deze bol — en met
         `camera.near` op 0,05 gaat de dieptestap als z²/(near·2²⁴): 0,012
         vlakbij, maar 0,241 op camera-afstand 450. Ver uitgezoomd kan de
         dieptebuffer die twee dus niet uit elkaar houden en wint er per pixel
         willekeurig één, wat als vlekken leest en wegtrekt zodra je inzoomt.

         DE BOL TERUGDUWEN EN NIET DE LIJNEN OPTILLEN. polygonOffset werkt
         alleen op vlakken, niet op lijnen, dus het raster zelf is er niet mee te
         helpen — deze bol wél, en dat lost meteen élke laag op die op straal 100
         ligt in plaats van alleen het raster.

         GEMETEN op afstand 450, als het aantal pixels dat verandert wanneer je
         `camera.near` van 0,05 naar 0,5 zet: 3.527 zonder, 1.367 met. Sterker
         afstellen (2/4) gaf 1.428 en dus niets extra's. */
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 2
    });
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
