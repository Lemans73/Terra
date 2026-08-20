/* ============================================================
   TERRA — Het Re-raster van de magnetosfeer
   ------------------------------------------------------------
   Een vlak raster in aardstralen, in het vlak waarin de vaste stand
   kijkt. Het vervangt de sterrenhemel daar: Meridian en Top zijn geen
   uitzicht maar een DOORSNEDE, en een sterrenveld erachter suggereert
   dat je ergens vandaan kijkt.

   WAAROM IN 3D EN NIET OP EEN TWEEDE CANVAS.
   De PoC tekent zijn raster met `overlay.js` op een 2D-canvas, met echte
   getallen langs de assen — scherper dan wat WebGL van tekst maakt. Dat
   bestand ligt hier ook (js/compute/magnetosphere/overlay.js), maar het
   is niet zomaar aan te sluiten: zijn hele registratie gaat uit van een
   ORTHOGRAFISCHE camera. `Registration.pxPerRe` is `h / (dist * 0,9)` en
   `Registration.frustum` bouwt een orthografisch beeldveld. Terra heeft
   de perspectiefcamera van globe.gl; die twee tegen elkaar aanleggen
   geeft een overlay die er goed uitziet en stil uit de pas loopt — en de
   PoC toetst juist dat die registratie tot op de pixel klopt.

   Dus tekent dit raster in de scene zelf, waar three.js de projectie
   doet en er per constructie niets kan drijven. De prijs is dat er geen
   getallen bij staan. Een raster zonder eenheid is een decoratie (de
   PoC's eigen woorden), dus de maat hoort in de legenda te komen te
   staan zolang die getallen er niet zijn.

   HET FRAME. Deze groep hangt ONDER de grensvlakgroep en erft dus zijn
   rotatie: dezelfde omzetting Terra-x <- GSM-y, Terra-y <- GSM-z,
   Terra-z <- GSM-x. Alle coördinaten hieronder zijn daarom lokaal, en
   het raster staat vanzelf stil ten opzichte van de holte terwijl de
   aarde erin draait.
   ============================================================ */

/* De stap in aardstralen. Tien is de maat waarop deze vorm iets doet: de
   magnetopauze staat op ongeveer tien Re, dus de eerste lijn valt bij
   benadering op de neus. Vijf zou een net geven waar je doorheen kijkt,
   twintig zegt niets meer over de neus. */
export const MSPHERE_GRID_STEP_RE = 10;

export function createMagnetosphereGrid(THREE, opts) {
  const { RE, drawMax } = opts;

  const group = new THREE.Group();
  group.name = 'terra-msphere-grid';
  group.visible = false;

  /* Twee inkten: de assen door de oorsprong dragen meer, want zij zeggen
     waar de aarde staat en waar de zonlijn loopt. Dezelfde keuze als in
     overlay.js, dat `axisInk` en `gridInk` uit elkaar houdt. */
  const RASTER_INKT = { raster: 0.55, as: 0.85 };

  const matRaster = new THREE.LineBasicMaterial({
    color: new THREE.Color(0x2b3d52), transparent: true,
    opacity: RASTER_INKT.raster, depthWrite: false
  });
  const matAs = new THREE.LineBasicMaterial({
    color: new THREE.Color(0x46617f), transparent: true,
    opacity: RASTER_INKT.as, depthWrite: false
  });

  const raster = new THREE.LineSegments(new THREE.BufferGeometry(), matRaster);
  const assen = new THREE.LineSegments(new THREE.BufferGeometry(), matAs);
  for (const l of [raster, assen]) {
    // De staart loopt ver buiten elke redelijke bounding sphere; three zou hem
    // anders wegcullen zodra de camera dichtbij staat. Zelfde reden als bij de
    // grensvlakken.
    l.frustumCulled = false;
    group.add(l);
  }
  raster.name = 'msphere:grid';
  assen.name = 'msphere:grid-axes';

  /* Het bereik. Langs de zonlijn asymmetrisch, want de vorm is dat ook: hij
     loopt van +10 Re aan de zonzijde tot -60 in de staart. Dwars erop
     symmetrisch, ruim genoeg om de flank te omvatten. */
  const X_VAN = -drawMax, X_TOT = 20;         // GSM x, in Re
  const DWARS = 30;                            // de andere as, in Re

  /* Van een punt in het vlak naar lokale coördinaten.

     Meridian kijkt langs GSM Y, dus zijn vlak is GSM X-Z — lokaal (z, y).
     Top kijkt langs GSM Z, dus zijn vlak is GSM X-Y — lokaal (z, x).
     `langs` is altijd de zonlijn; `dwars` de andere as van het vlak. */
  function naarLokaal(vlak, langs, dwars, uit) {
    if (vlak === 'top') return uit.set(dwars * RE, 0, langs * RE);
    return uit.set(0, dwars * RE, langs * RE);
  }

  const _p = new THREE.Vector3();
  function bouw(vlak) {
    const rasterPunten = [], asPunten = [];
    const duw = (lijst, langs, dwars) => {
      naarLokaal(vlak, langs, dwars, _p);
      lijst.push(_p.x, _p.y, _p.z);
    };
    const S = MSPHERE_GRID_STEP_RE;

    // Lijnen van constante GSM x: dwars op de zonlijn.
    for (let x = Math.ceil(X_VAN / S) * S; x <= X_TOT; x += S) {
      const lijst = x === 0 ? asPunten : rasterPunten;
      duw(lijst, x, -DWARS); duw(lijst, x, DWARS);
    }
    // Lijnen van constante dwarsafstand: evenwijdig aan de zonlijn.
    for (let d = -DWARS; d <= DWARS; d += S) {
      const lijst = d === 0 ? asPunten : rasterPunten;
      duw(lijst, X_VAN, d); duw(lijst, X_TOT, d);
    }

    for (const [lijn, punten] of [[raster, rasterPunten], [assen, asPunten]]) {
      lijn.geometry.dispose();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(punten, 3));
      lijn.geometry = geo;
    }
    return { rasterLijnen: rasterPunten.length / 6, asLijnen: asPunten.length / 6 };
  }

  let huidigVlak = null;

  /* `null` zet hem uit. Opnieuw bouwen gebeurt alleen bij een ANDER vlak:
     een viewwissel heen en terug hoeft geen twee keer hetzelfde net op te
     bouwen. */
  function setPlane(vlak) {
    if (!vlak) { group.visible = false; return null; }
    let stat = null;
    if (vlak !== huidigVlak) { stat = bouw(vlak); huidigVlak = vlak; }
    group.visible = true;
    return stat;
  }

  /* De kruisvervaging van een standwissel (sessie 31). Het vlak van een raster
     wisselt in één keer — Meridian heeft GSM X-Z en Top X-Y, en daar zit geen
     tussenrooster tussen. Dus zakt de inkt naar nul, wisselt het vlak in dat
     dal, en komt hij weer op. Zelfde afweging als bij de grensvlakken, zie de
     noot bij setFade() in boundary-layer.js. */
  let vervaging = 1;

  function setFade(f) {
    const n = Math.max(0, Math.min(1, Number.isFinite(f) ? f : 1));
    if (n === vervaging) return;
    vervaging = n;
    matRaster.opacity = RASTER_INKT.raster * n;
    matAs.opacity = RASTER_INKT.as * n;
  }

  function dispose() {
    for (const l of [raster, assen]) { l.geometry.dispose(); l.material.dispose(); }
    group.clear();
  }

  return { group, setPlane, setFade, dispose,
           stepRe: MSPHERE_GRID_STEP_RE,
           fade: () => vervaging,
           plane: () => huidigVlak,
           parts: { raster, assen } };
}
