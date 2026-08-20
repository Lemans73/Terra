/* ============================================================
   TERRA — De zonnewind die op de holte aan komt vliegen
   ------------------------------------------------------------
   Deeltjes die vanuit de zon het beeld in stromen, om de
   magnetopauze heen buigen, en aan de nachtzijde weer verdwijnen.

   DIT IS EEN STROOMRICHTING MET EEN GEMETEN TEMPO EN GEEN
   DEELTJESBAAN. De registry zegt het bij `wind-flow` al: de snelheid
   schaalt met de gemeten v, het aantal met de gemeten n, en de
   afbuiging om de grens heen is echt — maar de exacte baan is
   getekend en niet opgelost. Dit is geen MHD.

   WAT ER NIET IN ZIT, EN DAT IS OPZET. De PoC heeft hier ook een
   gyratie om het gemeten veld, staarten onder additief mengen, en
   invang op de open veldlijnen (`wind-capture`). Die drie hangen
   allemaal aan een gebakken veldraster van tientallen KB's en aan de
   veldlijnengeometrie. Ze komen later; wat hier staat is de vorm die
   Terry als voorwaarde noemde — deeltjes die vanuit de zon komen
   aanvliegen — en niets erbij.

   EN HET REKENWERK KOMT UIT DE FYSICALAAG DIE ER AL STOND.
   `Core.Flow.sheathVel` is de afbuiging, `Core.Flow.windDir` de
   aanstroomrichting, `Core.Flow.shockAt` de schokstraal op een hoek en
   `Core.Physics.magnetopauseRadius` de grens zelf. Alle vier byte-
   identiek uit de PoC. Deze laag rekent niets uit wat daar al staat.

   DE DEELTJES LEVEN IN GSM EN IN AARDSTRALEN. De buffer krijgt ze met
   dezelfde permutatie als de grens — Terra-x <- GSM-y, Terra-y <- GSM-z,
   Terra-z <- GSM-x — en maal MSPHERE_RE. De groep hangt onder die van
   de grens en erft daarmee de framerotatie, dus er is geen tweede plek
   waar dezelfde rotatie berekend wordt.
   ============================================================ */

import { MSPHERE_RE } from './boundary-layer.js';

/* DE ARM VAN DE AFBUIGING IS 0,15 EN NIET DE POC-WAARDE 0,6.

   Dat is geen keuze maar een meting die al gedaan is, en de registry legt hem
   vast bij `wind-flow`: met 0,6 begint de duw naar buiten al BUITEN de schok,
   en dan werd 96 % van alle sheath-deeltjes in de buitenste tiende gehouden.
   De stroom scheerde dan langs de bow shock in plaats van langs de
   magnetopauze — en het is juist die tweede die dit beeld gaat. */
const WIND_REIKWIJDTE = 0.15;

/* Waar de bundel begint en hoe breed hij is, in Re.

   DE BUNDEL IS BREDER DAN DE GRENS, want anders zie je de stroom niet LANGS de
   magnetosfeer gaan maar er alleen tegenaan. En hij is een SCHIJF en geen vlak:
   plat op y = 0 zaaien geeft elk deeltje de holte pal voor zich, dus buigt
   alles omhoog of omlaag en krijg je twee bundels in plaats van een stroom. Met
   een echte schijf gaat een deel er in y naast, en die passeren op het scherm
   dwars door het midden — precies zoals ze in werkelijkheid doen.

   DAT GELDT OOK IN DE VLAKKE STANDEN (Terry, PoC). Meridian kijkt
   orthografisch langs y, dus de camera projecteert de schijf zelf plat; er
   hoeft niets afgevlakt te worden en het zou de stroom juist kapotmaken.

   `sqrt(random)` houdt de dichtheid over de schijf gelijk — zonder die wortel
   klontert alles op de as. */
const WIND_BRON_X = 26, WIND_BRON_DX = 8, WIND_BRON_R = 36;

/* Waar een deeltje wordt opgeruimd en opnieuw bij de bron begint. Ruimer dan de
   bron, anders is de verbreding een no-op: alles buiten de bronstraal zou bij
   de eerste stap al teruggezet worden en de rand van de bundel bleef
   onzichtbaar. */
const WIND_WEG_X = -46, WIND_WEG_R = 46;

/* Hoeveel deeltjes bij welke dichtheid. Genormaliseerd op 5 /cm3 — een gewone
   waarde — en geklemd, want n loopt in een storm naar de tientallen en dan
   slibt het beeld dicht. De ONDERgrens is er om de andere reden: een heel
   dunne wind hoort ijl te zijn maar niet weg. */
const WIND_BIJ_N5 = 1200, WIND_MIN = 200, WIND_MAX = 2400;

/* De grootste tijdstap die in één keer gelopen wordt.

   EEN VERBORGEN TABBLAD LEVERT BIJ TERUGKEER EEN dt VAN SECONDEN, en dan legt
   elk deeltje in één frame tientallen Re af: de hele bundel teleporteert door
   de holte heen, dwars door de afbuiging waar het hier om gaat. Klemmen is hier
   juister dan onderverdelen — wat er tijdens het wegkijken gebeurde is niet
   getekend en hoeft niet ingehaald te worden. */
const WIND_MAX_DT = 0.05;

/* De stipmaat in CSS-pixels, en dus een SCHERMMAAT en geen wereldmaat.

   Een eerste versie liet de maat met de afstand krimpen, zoals three's
   `sizeAttenuation` doet: `uSize * 900 / -mv.z`. Die 900 was op niets geijkt.
   GEMETEN in de vrije stand staat de camera op 10534 eenheden, en dan is de
   stip 0,19 pixel groot — de bundel was er wel en was onzichtbaar.

   Een vaste schermmaat is hier bovendien juister dan een attenuatie, om twee
   redenen. De scene meet 100 eenheden per aardstraal en loopt tot 60 Re, dus
   het diepteverschil binnen de bundel is enorm en een echte attenuatie zou de
   staart wegknijpen. En onder de ORTHOGRAFISCHE camera van de vlakke standen
   is `-mv.z` helemaal geen afstand maar een plek in een diepteplak van 200000
   eenheden — daar betekent attenuatie niets. Eén formule voor alle drie de
   standen dus, en geen uitzondering die uit de pas kan lopen.

   Maal de pixelratio, want `gl_PointSize` rekent in APPARAATpixels: op een
   scherm met ratio 2 zou 2,4 anders als 1,2 lezen. */
const WIND_STIP = 2.4;

export function createWindLayer(THREE, deps) {
  const { Core } = deps;
  const group = new THREE.Group();
  group.name = 'terra-msphere-wind';
  group.visible = false;

  /* De deeltjestoestand leeft in GSM en in Re; de BUFFER krijgt Terra-eenheden.
     Twee stelsels dus, en ze staan bewust uit elkaar: het rekenwerk hoort in de
     eenheden waarin de fysicalaag geformuleerd is, en de scene in de zijne. */
  const cap = WIND_MAX;
  const px = new Float64Array(cap), py = new Float64Array(cap), pz = new Float64Array(cap);
  const pa = new Float32Array(cap);            // eigen helderheid per deeltje
  const pos = new Float32Array(cap * 3);       // wat de GPU leest
  const alfa = new Float32Array(cap);          // idem
  let levend = 0;                              // hoeveel er nu meedoen

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alfa, 1));
  geo.setDrawRange(0, 0);
  // De bundel loopt ver buiten elke redelijke bounding sphere.
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);

  /* DE KLEUR IS DIE VAN DE MEETKLASSE EN NIET EEN NIEUWE.
     De wind is `MEASURED` in v en n en `MODEL` in zijn baan; hij leent de tint
     van de gemeten klasse omdat dat is wat hem aandrijft. Eén getal, en de
     legenda leest hem hier op. */
  const WIND_INK = 0x9fd8e8;

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(WIND_INK).convertSRGBToLinear() },
      uSize:  { value: WIND_STIP },
      uFade:  { value: 1 }
    },
    vertexShader: `
      attribute float aAlpha;
      varying float vA;
      uniform float uSize;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize;
        vA = aAlpha;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uFade;
      varying float vA;
      void main() {
        /* Een ronde stip en geen vierkantje: gl_PointCoord loopt van 0 tot 1
           over de sprite, dus de afstand tot het midden is de radius. Zachte
           rand, anders zie je bij deze maten de vier hoeken. */
        float d = length(gl_PointCoord - vec2(0.5));
        float a = smoothstep(0.5, 0.15, d) * vA * uFade;
        if (a <= 0.001) discard;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.AdditiveBlending
  });

  const punten = new THREE.Points(geo, mat);
  punten.name = 'msphere:wind';
  punten.frustumCulled = false;
  group.add(punten);

  /* De windstand van dit moment. ALLE VIER MOETEN ZE ER ZIJN, en zolang dat
     niet zo is beweegt en tekent deze laag niets — zie `stroomt`. */
  let r0 = null, flaring = null, rbs = null, snelheid = 0;
  const richting = { x: -1, y: 0, z: 0 };

  const stroomt = () => Number.isFinite(r0) && Number.isFinite(flaring)
                     && Number.isFinite(rbs) && snelheid > 0 && levend > 0;

  function zaai(i) {
    // Gelijke dichtheid over de schijf: sqrt haalt de klontering op de as weg.
    const rad = WIND_BRON_R * Math.sqrt(Math.random());
    const hoek = Math.random() * Math.PI * 2;
    px[i] = WIND_BRON_X + Math.random() * WIND_BRON_DX;
    py[i] = rad * Math.cos(hoek);
    pz[i] = rad * Math.sin(hoek);
    pa[i] = 0.45 + Math.random() * 0.5;
  }

  /* Hoeveel deeltjes er horen te zijn, en het bijvullen of afromen daarvan.
     Nieuwe deeltjes worden bij de BRON gezaaid en niet op een willekeurige
     plek: ze horen het beeld in te stromen, niet erin te verschijnen. */
  function zetAantal(n) {
    const wil = Math.max(0, Math.min(cap, n | 0));
    for (let i = levend; i < wil; i++) zaai(i);
    levend = wil;
  }

  /* De windstand overnemen. `rij` is het monster van dit moment en `bouw` wat
     de grenslaag eruit maakte — r0, alpha en rbs. Ontbreekt er iets, dan valt
     deze laag stil in plaats van iets aan te nemen: de `inertWhen` van
     `wind-flow` in de registry zegt precies dit. Zonder r0 is er geen oppervlak
     om omheen te buigen, en een rechte stroom dwars door de magnetosfeer
     beweert het tegendeel van wat er gebeurt. */
  function update(rij, bouw) {
    const ok = !!(rij && bouw && bouw.ok
                  && Number.isFinite(bouw.r0) && Number.isFinite(bouw.alpha)
                  && Number.isFinite(bouw.rbs) && Number.isFinite(rij.v));
    if (!ok) {
      r0 = flaring = rbs = null; snelheid = 0; zetAantal(0);
      geo.setDrawRange(0, 0);
      return { stroomt: false, aantal: 0 };
    }
    r0 = bouw.r0; flaring = bouw.alpha; rbs = bouw.rbs;
    /* HET TEMPO IS DE GEMETEN v EN GEEN VAST GETAL, en dat is een val waar dit
       project al eens in gelopen is: de PoC gaf elk deeltje een willekeurige
       snelheid, en wat er tijdens een event veranderde was alleen het AANTAL —
       wat als "sneller" gelezen werd. Op deze schaal gaat 700 km/s werkelijk
       1,75x zo snel als 400. */
    snelheid = (rij.v / 400) * 7;
    const wd = Core.Flow.windDir(rij.vx, rij.vy, rij.vz);
    richting.x = wd.x; richting.y = wd.y; richting.z = wd.z;
    /* HET AANTAL IS DE GEMETEN DICHTHEID. Een dunne wind hoort er dun uit te
       zien; zonder meting valt hij terug op de waarde bij 5 /cm3, want de
       stroom bestaat dan nog steeds — alleen weten we niet hoe dicht hij is. */
    const n = Number.isFinite(rij.n) ? rij.n : 5;
    zetAantal(Math.max(WIND_MIN, Math.min(WIND_MAX,
      Math.round(WIND_BIJ_N5 * n / 5))));
    return { stroomt: stroomt(), aantal: levend };
  }

  /* Eén stap. `dt` in seconden, geklemd — zie WIND_MAX_DT. */
  function step(dt) {
    if (!group.visible || !stroomt()) { geo.setDrawRange(0, 0); return 0; }
    const h = Math.min(Math.max(dt, 0), WIND_MAX_DT);
    if (!(h > 0)) return levend;
    const P = Core.Physics, F = Core.Flow;
    let n = 0;
    for (let i = 0; i < levend; i++) {
      const rho = Math.hypot(py[i], pz[i]);
      const r = Math.hypot(px[i], rho);
      const th = Math.acos(Math.max(-1, Math.min(1, px[i] / Math.max(r, 1e-9))));
      const rmp = P.magnetopauseRadius(th, r0, flaring);
      const rShock = F.shockAt(rmp, r0, rbs);

      let nabij = 0;
      if (r < rShock) {
        // In de sheath: de afbuiging bepaalt de richting, niet de aanstroom.
        const v = F.sheathVel(px[i], rho, rmp, snelheid, WIND_REIKWIJDTE);
        px[i] += v.vx * h;
        /* De radiale duw over y en z verdeeld, zodat hij in 3D om de as heen
           buigt in plaats van alleen in het tekenvlak. Op rho = 0 — pal op de
           neuslijn — is er geen richting om naar uit te wijken; dat deeltje
           loopt door tot het de grens raakt en wordt daar opgeruimd. */
        if (rho > 1e-6) {
          py[i] += v.vrho * h * (py[i] / rho);
          pz[i] += v.vrho * h * (pz[i] / rho);
        }
        /* DE STROOM LICHT OP WAAR HIJ LANGS DE MAGNETOPAUZE SCHEERT, en dat is
           geen effect maar dezelfde grootheid die de afbuiging stuurt: de duw
           naar buiten schaalt met de nabijheid tot de grens, en daar is de
           compressie ook werkelijk het hoogst. Vrije wind blijft ijl — dat is
           de populatie waar dit model het minst over te zeggen heeft, en hij
           hoort de rest niet te overstemmen. */
        nabij = Math.max(0, Math.min(1, 1 - (r - rmp) / Math.max(rmp * 0.6, 1)));
      } else {
        // Vrije aanstroom: de GEMETEN vector, niet zomaar de zonlijn.
        px[i] += richting.x * snelheid * h;
        py[i] += richting.y * snelheid * h;
        pz[i] += richting.z * snelheid * h;
      }

      /* Opruimen op drie voorwaarden: voorbij de staart, te ver uit de as, of
         BINNEN de grens — dat laatste hoort niet te kunnen en betekent dat de
         afbuiging het niet hield. */
      const nRho = Math.hypot(py[i], pz[i]);
      if (px[i] < WIND_WEG_X || nRho > WIND_WEG_R || r < rmp * 0.98) {
        zaai(i);
        continue;   // pas volgende stap tekenen: één frame, en dus onzichtbaar
      }

      const k = n * 3;
      pos[k]     = py[i] * MSPHERE_RE;    // Terra x  <- GSM y
      pos[k + 1] = pz[i] * MSPHERE_RE;    // Terra y  <- GSM z
      pos[k + 2] = px[i] * MSPHERE_RE;    // Terra z  <- GSM x
      alfa[n] = Math.min(1, pa[i] * (0.45 + nabij * 0.85));
      n++;
    }
    geo.setDrawRange(0, n);
    geo.getAttribute('position').needsUpdate = true;
    geo.getAttribute('aAlpha').needsUpdate = true;
    return n;
  }

  /* De stipmaat opnieuw zetten. Hij hangt aan de PIXELRATIO en niet aan de
     stand, dus dit hoeft alleen bij een resize — en bij het opstarten, want
     dan is de ratio pas bekend. */
  function syncResolution() {
    const dpr = deps.renderer ? (deps.renderer.getPixelRatio() || 1) : 1;
    mat.uniforms.uSize.value = WIND_STIP * dpr;
  }
  syncResolution();

  /* De stand doet niets meer aan de maat — zie WIND_STIP. Deze haak blijft
     bestaan omdat de state hem aanroept naast die van de grens, en een laag die
     stilzwijgend niets doet bij een standwissel is beter dan een aanroeper die
     moet weten welke lagen er iets mee moeten. */
  function setOutline() {}

  /* De kruisvervaging van een standwissel, net als bij de grens. */
  function setFade(f) {
    mat.uniforms.uFade.value =
      Math.max(0, Math.min(1, Number.isFinite(f) ? f : 1));
  }

  const setVisible = (aan) => { group.visible = !!aan; };

  function dispose() { geo.dispose(); mat.dispose(); group.clear(); }

  return { group, update, step, setVisible, setOutline, setFade, dispose,
           // Voor de legenda: wat er werkelijk getekend wordt, als CSS-kleur.
           colors: { wind: '#' + WIND_INK.toString(16).padStart(6, '0') },
           stats: () => ({ levend, stroomt: stroomt(), snelheid,
                           getekend: geo.drawRange.count }) };
}
