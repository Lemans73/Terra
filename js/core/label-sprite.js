/* ============================================================
   TERRA — Label sprite · tekst die op elke zoomstand leesbaar blijft
   ------------------------------------------------------------
   THREE komt als argument binnen, niet als import: dat is de afspraak
   voor alles onder `layers/` en `core/` in dit project.

   WAAROM EEN SPRITE MET EEN CANVAS EN GEEN TEKSTGEOMETRIE
   Sessie 9, gemeten: three-globe bouwt landnamen als echte geometrie en
   herbouwt die bij elke maatwijziging — p90 van 357 ms tijdens zoomen,
   tegen 8,7 ms met de labels uit. Een canvas-textuur kost dat één keer
   bij het opbouwen en daarna niets meer.

   WAAROM DIT NU EEN GEDEELDE MODULE IS
   `planets-layer.js` en `lagrange-layer.js` hadden allebei hun eigen
   `LABEL_CANVAS` + `maakLabel` + `schaalLabel`, met verschillende
   canvasbreedtes en dezelfde bug-geschiedenis. De baanlaag en de
   hemelschijven zouden de derde en vierde kopie worden.

   DE GEMETEN VAL DIE HIERIN ZIT OPGESLOTEN (sessie 22): een label kan
   `visible: true` zijn en tóch onleesbaar. 22px tekst op een canvas van
   64px hoog werd na schaling naar de sprite 3,7 px — elke controle
   meldde keurig dat het label er stond. Hoe voller het canvas, hoe meer
   schermpixels de tekst bij dezelfde spritehoogte krijgt. Meet bij een
   sprite dus altijd de schermmaat van de INHOUD, niet de vlag.
   ============================================================ */

const DEFAULTS = { width: 256, height: 56, font: 40, weight: 600, stroke: 'rgba(0,0,0,0.8)' };

/* Een label als sprite. `color` mag een hex-getal (0x8fd0ff) of een
   CSS-string ('#8fd0ff') zijn — de twee bestaande aanroepers deden het
   ieder op hun eigen manier en allebei is redelijk.

   De maten komen op `sprite.userData.labelCanvas` te staan, want
   `scaleToPixels()` heeft de verhouding nodig en die uit de textuur
   terugrekenen zou van `devicePixelRatio` afhangen. */
export function createLabelSprite(THREE, text, color, opts = {}) {
  const cfg = Object.assign({}, DEFAULTS, opts);
  const cv = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = cfg.width * dpr;
  cv.height = cfg.height * dpr;

  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.font = cfg.weight + ' ' + cfg.font + 'px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = cfg.stroke;
  ctx.strokeText(text, cfg.width / 2, cfg.height / 2);
  ctx.fillStyle = typeof color === 'number'
    ? '#' + color.toString(16).padStart(6, '0')
    : (color || '#ffffff');
  ctx.fillText(text, cfg.width / 2, cfg.height / 2);

  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false
  }));
  sprite.userData.labelCanvas = { width: cfg.width, height: cfg.height };
  sprite.scale.set(1, cfg.height / cfg.width, 1);   // scaleToPixels() zet de echte maat
  return sprite;
}

/* SCHERMVAST. Een vaste wereldmaat werkt hier niet: het zoombereik van
   deze scenes loopt van de aarde tot voorbij Neptunus, en een sprite die
   daar leesbaar is bedekt van dichtbij het halve scherm. De maat wordt
   dus per update uit de camera-afstand teruggerekend naar het aantal
   pixels dat we willen.

   DE AFSTAND MOET IN WERELDRUIMTE, en dat is niet vanzelfsprekend: eerder
   stond hier `camera.position.distanceTo(sprite.position)`. Dat klopt
   zolang de ouder van de sprite op identiteit staat — bij de planeten- en
   Lagrange-laag is dat zo, dus het viel nooit op. De baanlaag hangt in een
   GEDRAAIDE groep, en daar vergelijkt die regel een wereldpositie met een
   lokale. GEMETEN gevolg: Neptunus' label werd 36,5 px waar 24 hoorde, een
   fout van 52%, terwijl Venus op 20,5 uitkwam — labels die schermvast
   heten en het zichtbaar niet zijn.

   `getWorldPosition()` werkt de matrix zelf bij, dus dit blijft ook kloppen
   als de aanroeper vóór de eerstvolgende render meet.

   `_scratch` staat BOVEN zijn gebruiker — deze module is klein genoeg om de
   TDZ te overleven, maar de regel in dit project is dat een `const` boven de
   code staat die hem leest, en die geldt ook als het net goed zou gaan. */
let _tmp = null;
const _scratch = (THREE) => (_tmp || (_tmp = new THREE.Vector3()));

export function scaleToPixels(THREE, sprite, camera, heightPx) {
  const c = sprite.userData.labelCanvas || DEFAULTS;
  const wp = sprite.getWorldPosition(_scratch(THREE));
  const d = camera.position.distanceTo(wp);
  const perPixel = 2 * d * Math.tan(camera.fov / 2 * Math.PI / 180) / window.innerHeight;
  const h = heightPx * perPixel;
  sprite.scale.set(h * c.width / c.height, h, 1);
  return h;
}

/* ------------------------------------------------------------
   VALT DIT PUNT ACHTER DE BOL, gezien vanaf de camera?

   De toets die hier eerder stond — `richting · cameraRichting > R/|cam|` —
   klopt alleen voor punten ÓP het oppervlak. Een label op straal 130
   steekt over de horizon heen en is nog een flink stuk voorbij de limbus
   zichtbaar: bij een camera op 300 is dat 39,7 graden, en met de oude
   toets zou je daar 39% van de ring tonen waar 61% hoort.

   De juiste voorwaarde, met a = R/|P| en b = R/|C|:

     verborgen  <=>  cos∠(P,C)  <  a·b − sqrt(1−a²)·sqrt(1−b²)

   In woorden: het punt is verborgen zodra de hoek tussen punt en camera
   groter is dan de som van hun beide horizon-hoeken, acos(a) + acos(b).
   Voor een punt op het oppervlak is a = 1 en valt het terug op de oude
   toets — dat is meteen de controle dat de generalisatie klopt.

   Ligt een van beide binnen de bol, dan is er geen horizon te berekenen;
   we klemmen op 1 en behandelen dat als "op het oppervlak".

   DE DREMPEL STAAT APART omdat niet elke aanroeper een positie heeft. Wie een
   hele pool labels op DEZELFDE straal plaatst — de beving-labels, de as-labels —
   heeft per label alleen een richting, en de drempel is dan één getal voor het
   hele frame. Die uitrekenen per label zou tweemaal `Math.hypot` per label per
   frame kosten voor een waarde die niet verandert. Vandaar drie scalars in en
   een scalar uit: geen allocatie, geen three.js, en dezelfde wiskunde.
------------------------------------------------------------ */
export function limbThreshold(R, pointRadius, cameraDist) {
  const a = Math.min(1, R / pointRadius);
  const b = Math.min(1, R / cameraDist);
  return a * b - Math.sqrt(1 - a * a) * Math.sqrt(1 - b * b);
}

export function occludedByGlobe(position, cameraPos, R) {
  const lp = Math.hypot(position.x, position.y, position.z);
  const lc = Math.hypot(cameraPos.x, cameraPos.y, cameraPos.z);
  if (!lp || !lc) return false;

  const cosPC = (position.x * cameraPos.x + position.y * cameraPos.y
               + position.z * cameraPos.z) / (lp * lc);

  return cosPC < limbThreshold(R, lp, lc);
}
