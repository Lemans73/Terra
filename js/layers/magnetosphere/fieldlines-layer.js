/* ============================================================
   TERRA — De veldlijnen van de magnetosfeer
   ------------------------------------------------------------
   IGRF binnen, T89 buiten, en per lijn de vraag of hij de
   magnetopauze kruist. `Core.Build.run` doet dat rekenwerk en
   levert een CSR: één puntenbuffer met een startindex per lijn,
   plus per lijn zijn afloop (dicht · open · onopgelost) en het
   halfrond waar hij de aarde verlaat. Deze module tekent dat.

   HET FRAME, EN DE VAL DIE ERIN ZIT. `Core.Trace._dir` draagt de kop
   "de veldrichting in het EARTH-FIXED frame", en dat klopt: de
   INTEGRATIE loopt daar. Maar de punten die worden weggeschreven zijn
   iets anders — `Trace.line` zet per stap `pts[o] = pgx` en dat is de
   GSM-versie van het punt. Wat `Build.run` teruggeeft staat dus in
   GSM, net als het grensvlak.

   GEMETEN, want dit is precies het soort verschil dat je niet ziet:
   het zaad van lijn 0 ligt 2,3e-8 van zijn GSM-coördinaat en 2,4e-1
   van zijn Earth-fixed coördinaat. Op een eerste poging hing deze
   groep NAAST het grensvlak, en dat gaf lijnen die er plausibel
   uitzagen, keurig een dipool vormden, en fout stonden.

   Deze groep hangt daarom ONDER `boundary.group`, dezelfde plek als
   het Re-raster, en erft zo de framerotatie. Wat hier per punt wél
   nog moet gebeuren is de assenwissel naar Terra: (x,y,z) -> (y,z,x),
   dezelfde die boundary-layer.js in zijn eigen geometrie bakt. Dat is
   `pocNaarTerra`, hier uitgeschreven omdat een Vector3 per punt bij
   50.000 punten per herbouw 50.000 allocaties is; zie daar waarom die
   permutatie een rotatie is en geen spiegeling — B is een
   pseudovector, en onder een spiegeling klapt hij om.

   ------------------------------------------------------------
   TWEE TEKENOBJECTEN, EN DAT ZIJN ER TWEE

   `LineBasicMaterial` negeert `linewidth` op elk platform dat
   ertoe doet en kan geen streepjes. Juist de code UNRESOLVED zou
   daardoor samenvallen met de andere twee, en dat is de code die
   dit project weigert eruit te laten zien als een fysische
   toestand. Dus `LineSegments2`: schermbreedte, kleur per vertex,
   streepjes — en instanced onder de motorkap, dus nog steeds één
   draw call per object.

   DE DRIE KLASSEN KOMEN BINNEN ALS PARAMETER, net als `THREE` zelf.
   Ze STONDEN hier even als `import ... from 'three/examples/jsm/…'`,
   en dat bouwde een standalone die "geslaagd" meldde en bij het
   openen `LineSegments2 is not defined` gaf: `deModule()` in
   tools/build-standalone.mjs stript élke importregel uit een
   ingelijnde module, ook een die naar een CDN wijst, en er was geen
   enkele module die dat tot nu toe deed. Precies de stille faalvorm
   die dit project overal dichtzet. De build weigert het nu, en de
   CDN-imports staan waar ze in deze app altijd al stonden: in
   index.html. Zie ook `?external=three` daar — een tweede
   three-instantie uit zich als onzichtbare lijnen ZONDER
   foutmelding.

   `LineMaterial` heeft zijn eigen valstrik: hij rekent de
   lijnbreedte uit in NDC en heeft daarvoor de schermmaat nodig.
   Staat `resolution` verkeerd, dan zijn de lijnen te dik of
   onzichtbaar. Vandaar `syncResolution()`, en de aanroeper roept
   hem aan bij elke herbouw én bij een resize.
   ============================================================ */

/* De plafonds van de tekenbuffers, in SEGMENTEN (twee punten elk).

   Gemeten in de POC bij `tolCoef` 0,0006 en de zwaarste windstand: 5622 punten
   over 80 lijnen, en 394 gestreepte segmenten. Terra zaait er minder — 52 in de
   vrije stand, 20 in een doorsnede — dus 64K is ruim een factor tien marge. Het
   kost 64K × 6 × 4 bytes × 2 arrays = 3,1 MB, en dat is de reden dat de buffers
   zo groot MOGEN zijn: er gaat per herbouw alleen het gebruikte stuk naar de
   GPU, niet de hele allocatie.

   HET PLAFOND TELT MEE IN PLAATS VAN STIL AF TE KAPPEN. Een lijn die halverwege
   ophoudt ziet er precies zo uit als een lijn die daar eindigt. `core.js` heeft
   voor die faalvorm al een `capped`-melding; deze buffers hadden er geen. */
const FL_MAX_SEG = 64 * 1024;
const FL_DASH_SEG = 8192;

/* De vier inkten, als CSS-variabele. Drie staten plus de neutrale, en die
   laatste is met opzet GEEN vierde legendaregel: hij bestaat alleen als er geen
   magnetopauze is, en dan is er niets geclassificeerd om te verklaren.
   `--msphere-unres` hergebruiken zou hem als "onopgelost" laten lezen, en dat
   woord gaat over de integratie. */
const FL_PALET = {
  closed: '--msphere-closed',
  open:   '--msphere-open',
  unres:  '--msphere-unres',
  plain:  '--ink-dim'
};

/* DE HALFRONDTINT, EN WAAROM HIJ ASYMMETRISCH IS (sessie 32, na Terry's blik).

   SUBTIEL IS EEN EIS. De drie staten zijn de uitspraak waar de hele legenda om
   draait; liggen noord en zuid net zo ver uit elkaar als open en dicht, dan
   leest het beeld als zes categorieën in plaats van drie met een nuance.

   De POC's ±12 % haalde dat niet, en op Terra's zwart nog minder. GEMETEN over
   de negen tinten:

     zuid-onopgelost #3b666b   contrast 3,15 op de scene-achtergrond, tegen
                               7,5 tot 8,3 voor alle andere — onzichtbaar dus,
                               precies wat Terry meldde
     zuid-dicht vs noord-onopgelost   0,194, terwijl de BASISkleuren van die
                               twee staten 0,307 uit elkaar liggen: de nuance
                               was de staat aan het overstemmen
     open noord vs zuid        0,338, groter dan het verschil tussen dicht en
                               onopgelost — "het rode aan de bovenkant tegen de
                               lijnen onderaan", ook Terry

   Dus: OMHOOG MEER DAN OMLAAG. Een schil die donkerder wordt verdwijnt in het
   zwart; een die lichter wordt niet. Met +8 % en −4 % blijft de richting
   ("lichter en warmer is noord") volledig overeind terwijl de donkerste tint van
   3,15 naar 8,93 contrast gaat en de spreiding binnen een staat onder de 0,20
   zakt — een vijfde van het verschil tussen dicht en open.

   WARM IS EEN PLEK EN GEEN OFFSET. `hue + dh` voor noord is meetbaar fout: de
   drie staten liggen op verschillende plekken van de kleurcirkel, dus dezelfde
   offset maakt cyaan blauwer en oranje geler — noord zou dan bij de ene staat
   warmer en bij de andere koeler worden. Vandaar de kortste weg naar h = 0. */
const FL_HEMI_LIFT_N = 0.08;
const FL_HEMI_LIFT_Z = 0.04;
const FL_HEMI_HUE = 0.012;

function flNaarWarm(h) {
  let d = -h;
  if (d < -0.5) d += 1;
  if (d > 0.5) d -= 1;
  return d < 0 ? -1 : 1;
}

export function createFieldlinesLayer(THREE, opts) {
  const { RE, renderer, lines } = opts;
  const { LineSegments2, LineSegmentsGeometry, LineMaterial } = lines || {};
  if (!LineSegments2 || !LineSegmentsGeometry || !LineMaterial) {
    throw new Error('field lines: the three.js line classes were not supplied');
  }

  /* De inkt uit de stylesheet, één keer. GOOIEN EN NIET TERUGVALLEN, dezelfde
     afweging als bij de tijdlijn: een ontbrekende kleur tekent zwart, en zwarte
     lijnen op een zwarte hemel mist niemand. Een laag die er niet is, wél. */
  const kleuren = (() => {
    const cs = getComputedStyle(document.documentElement);
    const uit = {}, ontbreekt = [];
    for (const [sleutel, css] of Object.entries(FL_PALET)) {
      const rauw = cs.getPropertyValue(css).trim();
      if (!rauw) { ontbreekt.push(css); continue; }
      uit[sleutel] = new THREE.Color(rauw);
    }
    if (ontbreekt.length) {
      throw new Error('the field-line palette is incomplete: ' + ontbreekt.join(', '));
    }
    return uit;
  })();

  /* Per staat twee tinten, vooraf uitgerekend en in LINEAIRE ruimte gezet —
     `vertexColors` gaat rechtstreeks naar de shader en die rekent lineair.
     Een hemi die geen +1 of -1 is valt terug op de vlakke kleur in plaats van
     op een willekeurige helft. */
  const tinten = {};
  for (const sleutel of Object.keys(kleuren)) {
    const basis = kleuren[sleutel];
    const hsl = {};
    basis.getHSL(hsl);
    const warm = flNaarWarm(hsl.h) * FL_HEMI_HUE;
    const noord = basis.clone().offsetHSL(warm, 0, FL_HEMI_LIFT_N);
    const zuid = basis.clone().offsetHSL(-warm, 0, -FL_HEMI_LIFT_Z);
    tinten[sleutel] = {
      vlak: basis.clone().convertSRGBToLinear(),
      1: noord.convertSRGBToLinear(),
      '-1': zuid.convertSRGBToLinear()
    };
  }

  const group = new THREE.Group();
  group.name = 'terra-msphere-fieldlines';
  group.visible = false;

  const segPos = new Float32Array(FL_MAX_SEG * 6);
  const segCol = new Float32Array(FL_MAX_SEG * 6);
  const dashPos = new Float32Array(FL_DASH_SEG * 6);

  /* De inkt in rust. De gestreepte lijn is DUNNER en bleker dan de andere twee:
     onopgelost is een uitspraak over de integratie en mag niet de aandacht
     trekken die een fysische toestand krijgt.

     `worldUnits: false` — in wereldeenheden zou `linewidth` 1,7 Re betekenen en
     dat maakt van één onopgeloste lijn een trap van blokken langs de staart.
     `dashSize`/`gapSize` blijven WEL wereldeenheden: een streepjespatroon dat
     met de zoom meeschaalt leest als een schaalbalk die er niet is. */
  const FL_INKT = { vol: 0.95, streep: 0.75 };

  const matVol = new LineMaterial({
    vertexColors: true, linewidth: 1.7, transparent: true,
    opacity: FL_INKT.vol, dashed: false, worldUnits: false,
    depthWrite: false
  });
  const matStreep = new LineMaterial({
    color: kleuren.unres, linewidth: 1.0, transparent: true,
    opacity: FL_INKT.streep, dashed: true,
    dashSize: 0.55 * RE, gapSize: 0.45 * RE, worldUnits: false,
    depthWrite: false
  });

  /* De begrenzingsbol met de hand: de buffers zijn voor het PLAFOND
     gealloceerd, dus een berekende bol zou de ongebruikte nullen meetellen en
     alles rond de oorsprong vastzetten. `frustumCulled = false` maakt hem
     verder onschadelijk. */
  function maakObject(mat, pos, metKleur) {
    const g = new LineSegmentsGeometry();
    g.setPositions(pos);
    if (metKleur) g.setColors(segCol);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 80 * RE);
    const o = new LineSegments2(g, mat);
    o.frustumCulled = false;
    o.renderOrder = 1;
    group.add(o);
    return o;
  }

  const vol = maakObject(matVol, segPos, true);
  const streep = maakObject(matStreep, dashPos, false);
  streep.visible = false;

  /* LineMaterial rekent zijn breedte in NDC en heeft daarvoor de schermmaat
     nodig. Fout gezet betekent te dikke of onzichtbare lijnen — en dat is
     precies zo'n stille fout, want de geometrie klopt intussen. */
  const _res = new THREE.Vector2();
  function syncResolution() {
    if (!renderer) return null;
    renderer.getSize(_res);
    matVol.resolution.copy(_res);
    matStreep.resolution.copy(_res);
    return { w: _res.x, h: _res.y };
  }
  syncResolution();

  let laatste = null;

  /* ----------------------------------------------------------
     De CSR uitvouwen naar segmentparen, in één doorloop.

     Drie dingen tegelijk, en dat is met opzet: de framewissel, de schaal en de
     kleur. Ze los doen zou drie doorlopen over dezelfde 50.000 punten zijn.
  ---------------------------------------------------------- */
  function upload(geom) {
    if (!geom || !geom.nLines) {
      vol.geometry.instanceCount = 0;
      streep.geometry.instanceCount = 0;
      streep.visible = false;
      laatste = { solid: 0, dashed: 0, segOver: 0, dashOver: 0, bounded: false };
      return laatste;
    }

    const gp = geom.pos;
    let s = 0, d = 0, segOver = 0, dashOver = 0;

    for (let i = 0; i < geom.nLines; i++) {
      const a = geom.start[i], b = geom.start[i + 1];
      const e = geom.ending[i];

      /* ZONDER GRENS IS ER GEEN TOPOLOGIE, en dan mag geen enkele lijn een van
         de drie staten dragen. De tracer levert dan alleen CLOSED en
         UNRESOLVED — niet omdat de magnetosfeer dicht is, maar omdat er niets
         was om te kruisen. Die uitkomst inkleuren zou de legenda laten liegen:
         `dicht` betekent daar "beide voeten op aarde" en `onopgelost` "de
         integratie, niet de magnetosfeer". Eén neutrale staat dus. */
      const begrensd = geom.bounded !== false;
      const gestreept = begrensd && e === 2;                   // ENDING.UNRESOLVED
      const sleutel = !begrensd ? 'plain'
                    : gestreept ? 'unres'
                    : (e === 1 ? 'open' : 'closed');           // ENDING.OPEN
      const t = tinten[sleutel];
      const c = t[geom.hemi[i]] || t.vlak;
      const cr = c.r, cg = c.g, cb = c.b;

      for (let k = a; k + 1 < b; k++) {
        /* (x, y, z) -> (y, z, x), maal de aardstraal in Terra-eenheden. Zie de
           kop: dit IS pocNaarTerra, uitgeschreven om 50.000 Vector3'en per
           herbouw te vermijden. */
        const ax = gp[k * 3 + 1] * RE, ay = gp[k * 3 + 2] * RE, az = gp[k * 3] * RE;
        const bx = gp[(k + 1) * 3 + 1] * RE, by = gp[(k + 1) * 3 + 2] * RE,
              bz = gp[(k + 1) * 3] * RE;

        if (gestreept) {
          if (d >= FL_DASH_SEG) { dashOver++; continue; }
          const o = d * 6;
          dashPos[o] = ax; dashPos[o + 1] = ay; dashPos[o + 2] = az;
          dashPos[o + 3] = bx; dashPos[o + 4] = by; dashPos[o + 5] = bz;
          d++;
        } else {
          if (s >= FL_MAX_SEG) { segOver++; continue; }
          const o = s * 6;
          segPos[o] = ax; segPos[o + 1] = ay; segPos[o + 2] = az;
          segPos[o + 3] = bx; segPos[o + 4] = by; segPos[o + 5] = bz;
          segCol[o] = cr; segCol[o + 1] = cg; segCol[o + 2] = cb;
          segCol[o + 3] = cr; segCol[o + 4] = cg; segCol[o + 5] = cb;
          s++;
        }
      }
    }

    /* ALLEEN HET GEBRUIKTE STUK UPLOADEN. De buffers zijn voor het plafond
       gealloceerd; `needsUpdate = true` zou 3 MB naar de GPU sturen terwijl er
       typisch 40 KB in staat. Dat is geen microoptimalisatie — dit is de enige
       plek in de hele lus waar per herbouw megabytes zouden bewegen.
       `addUpdateRange` bestaat sinds three r159; op ouder valt dit terug op de
       volle upload in plaats van stil niets te doen. */
    const zet = (buf, aantal) => {
      if (buf.clearUpdateRanges) { buf.clearUpdateRanges(); buf.addUpdateRange(0, aantal); }
      buf.needsUpdate = true;
    };
    zet(vol.geometry.attributes.instanceStart.data, s * 6);
    zet(vol.geometry.attributes.instanceColorStart.data, s * 6);
    vol.geometry.instanceCount = s;

    zet(streep.geometry.attributes.instanceStart.data, d * 6);
    streep.geometry.instanceCount = d;
    if (d > 0) streep.computeLineDistances();
    streep.visible = d > 0;

    syncResolution();
    laatste = { solid: s, dashed: d, segOver, dashOver,
                bounded: geom.bounded !== false };
    return laatste;
  }

  const setVisible = (aan) => { group.visible = !!aan; };

  /* De kruisvervaging van een standwissel (sessie 31). De zaden verschillen per
     stand — twee lengtegraden in een doorsnede, acht in de vrije stand — en
     daar zit geen tussenvorm tussen. Dus zakt de inkt naar nul, wisselt de
     geometrie in dat dal, en komt hij weer op. Zelfde afweging als bij het
     grensvlak en het raster. */
  let vervaging = 1;

  function setFade(f) {
    const n = Math.max(0, Math.min(1, Number.isFinite(f) ? f : 1));
    if (n === vervaging) return;
    vervaging = n;
    matVol.opacity = FL_INKT.vol * n;
    matStreep.opacity = FL_INKT.streep * n;
  }

  function dispose() {
    for (const o of [vol, streep]) { o.geometry.dispose(); o.material.dispose(); }
    group.clear();
  }

  return { group, upload, setVisible, setFade, syncResolution, dispose,
           stats: () => laatste,
           fade: () => vervaging,
           colors: kleuren,
           parts: { vol, streep } };
}
