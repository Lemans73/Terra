/* ============================================================
   TERRA — Graticule (het lengte/breedte-rooster van de doorkijk)
   ------------------------------------------------------------
   Een bol van meridianen en parallellen, als losse lijnstukken.

   ------------------------------------------------------------
   WAAROM DIT NIET `new SphereGeometry(..., { wireframe: true })` IS
   ------------------------------------------------------------
   Dat was het tot sessie 28, en het gaf een rooster met DIAGONALEN.
   Dat is geen instelling die verkeerd stond: three tekent een
   wireframe als de randen van de DRIEHOEKEN waaruit de mesh bestaat,
   en elk vierhoekje van een bol is opgedeeld in twee driehoeken. De
   schuine lijn ertussen hoort dus onlosmakelijk bij die aanpak.

   Voor een testlaag was dat prima. Zodra je er dwars doorheen kijkt
   naar iets anders — de antipode-koorde, de indicatoren aan de
   achterkant — telt elke lijn die geen betekenis draagt dubbel: je
   ziet hem twee keer, want de voor- én de achterkant van de bol
   staan in beeld. Een echte graticule tekent alleen lijnen die iets
   betekenen: deze meridiaan is die lengte, deze parallel is die
   breedte.

   ------------------------------------------------------------
   DE OMREKENING KOMT VAN BUITEN
   ------------------------------------------------------------
   `coords(lat, lng)` moet dezelfde functie zijn die de rest van de
   app gebruikt (`world.getCoords`). Zelf een bolformule opschrijven
   zou een TWEEDE omrekening in de codebase zetten, en die loopt ooit
   uit de pas met de eerste — dan staat het rooster een kwartslag
   naast de kustlijnen en is er geen instelling die dat rechtzet.
   ============================================================ */

/* De stappen zijn 15 graden, niet 10 of 30. Bij 30 vallen de keerkringen
   (23,4) en de poolcirkels (66,6) tussen twee lijnen in en verliest het rooster
   zijn functie als schaalverdeling; bij 10 staan er 36 meridianen en loopt de
   bol op de limbus dicht — precies waar je doorheen wilt kijken. Bij 15 zijn het
   er 24, één per uur van de aardrotatie. */
/* GRID_ en niet kaal `DEFAULTS`: `label-sprite.js` heeft er ook een, en de
   standalone-build gooit alle modules in ÉÉN scope. De vangrail ving dit
   (`Identifier 'DEFAULTS' has already been declared`) — vandaar de voorvoegsel-regel. */
const GRID_DEFAULTS = { latStep: 15, lngStep: 15, arcSegments: 4 };

/* Lijnstukken en geen doorlopende lijnen: `LineSegments` neemt de punten twee
   aan twee, dus elk paar is een eigen stukje en er lopen geen sprongen van het
   einde van de ene meridiaan naar het begin van de volgende. Dat scheelt een
   `Line`-object per meridiaan — 35 draw calls tegen één. */
export function graticuleGeometry(THREE, coords, opts = {}) {
  const cfg = Object.assign({}, GRID_DEFAULTS, opts);
  const pos = [];

  // `arcSegments` is het aantal stukjes per 15 graden boog. Vier is genoeg: een
  // koorde over 3,75 graden wijkt 0,05% van de bol af, ruim onder een pixel op
  // elke zoomstand die deze app toelaat.
  const stap = cfg.latStep / cfg.arcSegments;

  const zet = (lat, lng) => {
    const c = coords(lat, lng);
    pos.push(c.x, c.y, c.z);
  };

  // Meridianen: van pool tot pool, één per `lngStep`.
  for (let lng = -180; lng < 180; lng += cfg.lngStep) {
    for (let lat = -90; lat < 90; lat += stap) {
      zet(lat, lng);
      zet(Math.min(90, lat + stap), lng);
    }
  }

  // Parallellen: hele cirkels, de polen overgeslagen (daar is de cirkel een punt).
  for (let lat = -90 + cfg.latStep; lat <= 90 - cfg.latStep; lat += cfg.latStep) {
    for (let lng = -180; lng < 180; lng += stap) {
      const volgend = lng + stap;
      zet(lat, lng);
      // Op de naad terug naar -180 in plaats van doorlopen naar 180: dat is
      // dezelfde meridiaan, maar `getCoords` mag er een andere kant van kiezen.
      zet(lat, volgend >= 180 ? -180 : volgend);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}
