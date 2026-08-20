/* ============================================================
   TERRA — Magnetopauze en boegschok
   ------------------------------------------------------------
   De twee oppervlakken waar de zonnewind op de magnetosfeer stuit.
   Beide komen uit Shue et al. 1998, en beide worden GEDREVEN DOOR
   MEETWAARDEN: de dynamische druk en Bz van dit moment. Verandert de
   wind, dan verandert de vorm — dat is de hele reden dat ze hier staan
   en niet als plaatje.

   WAAROM DE GEOMETRIE IN GSM STAAT EN DE GROEP DRAAIT
   Shue is een omwentelingsoppervlak om de zonlijn: r(theta) hangt
   alleen van de hoek met die lijn af. In GSM is dat per definitie de
   +X-as, dus daar is de vorm één formule. Zou de laag zelf naar de zon
   wijzen, dan moest elk punt per frame opnieuw gedraaid worden — en dat
   is de `obj.lookAt()`-val uit sessie 12: een indicator die zichzelf
   richt, verliest zijn eigen frame. Hier draagt de GROEP de rotatie
   (één quaternion) en blijft de geometrie stilstaan zolang de wind
   niet verandert.

   DE PUNTEN STAAN GELIJK IN BOOGLENGTE, NIET IN THETA.
   `Core.Boundary.arcThetas` doet dat rekenwerk. Op de neus loopt de
   grens vlak en in de staart steil, dus gelijke hoekstappen geven daar
   een grove en hier een verspilde bemonstering. Dat is PoC-werk dat
   hier ongewijzigd wordt gebruikt — zie js/compute/magnetosphere/SYNC.md.

   DE STAART IS AFGESNEDEN, NIET AF. Shue divergeert achter de aarde:
   bij theta -> 180 graden loopt r naar oneindig. `drawMax` kapt dat af
   op een afstand die in beeld past. Dat is een TEKENGRENS en geen
   fysische grens, en daarom draagt de laag hem als parameter in plaats
   van hem te verstoppen.
   ============================================================ */

// Terra's aardbol heeft straal 100, dus één aardstraal is 100 eenheden.
// Deze factor staat hier één keer; wie hem ergens anders nog eens intikt,
// krijgt een magnetosfeer die niet bij zijn eigen aarde past.
export const MSPHERE_RE = 100;

// Hoe ver de staart getekend wordt, in Re. Voorbij ~60 Re is er niets
// meer te zien wat de vorm nog verduidelijkt, en Shue zelf is daar al
// lang buiten het gebied waarvoor hij gepast is.
export const MSPHERE_DRAW_MAX = 60;

/* De GSM-basis, uitgedrukt in Terra's assen.

   De PoC rekent geofysisch — lengte 0 op +X, 90 oost op +Y, noordpool op
   +Z. Terra doet lengte 0 op +Z, 90 oost op +X, noordpool op +Y. De
   afbeelding is dus (x, y, z) -> (y, z, x).

   DAT IS EEN CYCLISCHE PERMUTATIE EN DUS EEN ECHTE ROTATIE (determinant
   +1), geen spiegeling. Dat is geen detail: B is een pseudovector, en
   onder een spiegeling klapt hij om. Gemeten in sessie 29 — de omgezette
   dipoolas komt op 3,5e-17 van Terra's eigen berekening, en X x Y geeft
   Z en niet -Z. */
export const pocNaarTerra = (THREE, p, uit) =>
  (uit || new THREE.Vector3()).set(p.y, p.z, p.x);

export function createBoundaryLayer(THREE, deps) {
  const { Core } = deps;
  const group = new THREE.Group();
  group.name = 'terra-msphere-boundary';
  group.visible = false;

  // Hoeveel punten langs de doorsnede en hoeveel keer rondgedraaid. De PoC
  // draait op 96 x 48; dat is hier ruim, want Terra tekent geen deeltjes die
  // ertegenaan lopen — alleen het oppervlak zelf.
  const N_THETA = 72, N_ROLL = 48;

  /* Eén omwentelingsoppervlak als wireframe.

     Waarom LineSegments en geen mesh met `wireframe: true`: die laatste
     tekent ook de diagonaal van elk vlak, en dan lees je een driehoeksnet
     in plaats van een rooster van meridianen en ringen. Precies de fout
     die het aarde-rooster in sessie 28 dichter deed lijken dan het was. */
  /* ==========================================================
     DE DOORKIJK: DE NABIJE WAND VERVAAGT (sessie 33, Terry).

     Het volle net is 4560 lijnstukken die elkaar overal kruisen. Van binnenuit
     staan er tralies over de aarde en de veldlijnen, en zie je wél DÁT er een
     grens is maar niet meer waar. Alleen de verre wand leest als een kom.

     `side: BackSide` zou dit voor een MESH oplossen, maar met de diagonalen
     eruit zijn dit lijnen — er valt niets weg te cullen. Dus per VERTEX, met de
     analytische normaal tegen de richting naar de camera. Dat is bovendien een
     betere oplossing dan BackSide: die snijdt hard op de silhouetlijn, waar de
     schil élke rib tegelijk verliest en de omtrek dus flikkert bij het draaien.
     Een smoothstep over dezelfde grootheid laat de overgang lopen.

     NAAR DE CAMERA TOE, NIET DE KIJKRICHTING VAN DE CAMERA. Bij een
     perspectiefcamera verschillen die twee aan de rand van het beeld, en juist
     daar vult deze schil het hele scherm.

     `MSPHERE_NABIJ` IS 0,10 EN GEEN 0. De nabije wand helemaal weglaten is
     precies wat BackSide doet, en dan is de NEUS het stuk dat ontbreekt — waar je
     recht op de schil kijkt staat de normaal per definitie naar je toe. Net het
     stuk dat de standoff draagt. Een tiende laat de vorm daar doorschemeren
     zonder dat er tralies ontstaan.

     `#include <colorspace_fragment>` IS GEEN NETHEID MAAR DE HELFT VAN DE
     HELDERHEID. Three rekent lineair en codeert bij het schrijven naar sRGB; een
     eigen shader die alleen `gl_FragColor` zet slaat die stap over. De PoC mat
     dat dat ruwweg een factor twee kost, precies in het bereik waar deze laag
     leeft — getekend, gemeten, en niet te zien.
  ========================================================== */
  const MSPHERE_NABIJ = 0.10;

  function bouwOppervlak(kleur, opacity) {
    const geo = new THREE.BufferGeometry();
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor:   { value: new THREE.Color(kleur).convertSRGBToLinear() },
        uOpacity: { value: opacity },
        /* Eén op eén betekent GEEN doorkijk. Dat is de stand voor de vlakke
           standen: daar is het oppervlak al tot zijn omtrek teruggebracht en is
           er niets om doorheen te kijken. Zie schrijfInkt(). */
        uNear:    { value: MSPHERE_NABIJ }
      },
      vertexShader: `
        varying float vFade;
        uniform float uNear;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 n = normalize(normalMatrix * normal);
          float toward = dot(n, normalize(-mv.xyz));
          vFade = mix(1.0, uNear, smoothstep(-0.15, 0.35, toward));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uOpacity; varying float vFade;
        void main() {
          gl_FragColor = vec4(uColor, uOpacity * vFade);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false
    });
    const lijn = new THREE.LineSegments(geo, mat);
    // De staart loopt ver buiten elke redelijke bounding sphere; three zou hem
    // dan wegcullen zodra de camera dichtbij staat.
    lijn.frustumCulled = false;
    group.add(lijn);
    return lijn;
  }

  /* HOEVEEL INKT EEN LIJN KRIJGT, HANGT AF VAN HOEVEEL LIJNEN ER ZIJN.

     Het volle net is 4560 lijnstukken die elkaar overal kruisen; daar bouwt
     de dekking zich op en is 0,55 al stevig. De doorsnede is 142 lijnstukken
     en op elke plek precies één lijn — dezelfde 0,55 leest daar als een
     spookje. Gemeten via de post-processing composer (en dat is de enige
     meting die telt, want de grade-pass dempt): met het volle net kwam 1,36 %
     van de pixels boven de achtergrond uit, met de kale doorsnede 0,06 %.

     Dus twee sets waarden, en niet één compromis dat in beide gevallen net
     niet klopt. */
  const INKT = {
    net:  { mp: 0.55, shock: 0.34 },
    lijn: { mp: 1.00, shock: 0.75 }
  };

  /* De twee inkten staan hier als getal en NERGENS anders. De legenda (blok B5)
     vraagt ze op via `colors` hieronder in plaats van ze in CSS over te tikken:
     een swatch die de kleur van het oppervlak zegt te zijn en het niet is, is
     erger dan geen swatch. */
  const MP_INK = 0x6fd3e8, SHOCK_INK = 0xe8a86f;

  const mp = bouwOppervlak(MP_INK, INKT.net.mp);
  mp.name = 'msphere:magnetopause';
  const shock = bouwOppervlak(SHOCK_INK, INKT.net.shock);
  shock.name = 'msphere:bowshock';

  /* De punten van één omwentelingsoppervlak, als lijnstukken.

     `straalBijHoek` is een functie zodat dezelfde bouwer de magnetopauze
     én de boegschok kan maken: die twee delen hun vorm en verschillen
     alleen in hun straal. */
  /* DE NORMAAL VAN EEN OMWENTELINGSOPPERVLAK, ANALYTISCH.

     De doorkijk-shader heeft er één per vertex nodig, en het oppervlak geeft hem
     zonder rekenwerk prijs: het is r(theta), rondgedraaid om de zonlijn. Met

       A = dr/dtheta * cos(theta) - r * sin(theta)     (dx/dtheta)
       B = dr/dtheta * sin(theta) + r * cos(theta)     (drho/dtheta)

     is het kruisproduct van de twee raakvectoren evenredig met
     `(B, -A*sin a, -A*cos a)` in GSM. Twee ijkpunten die dat sluitend maken:

       neus (theta 0)   dr = 0, dus (r0, 0, 0) — pal naar de zon, en dat is
                        precies waar de neus naartoe wijst
       flank (90 graden) A = -r, B = dr, dus (dr, r sin a, r cos a) — radiaal
                        naar buiten, met een sunwaartse kanteling omdat de
                        staart openflaart

     `dr/dtheta` NUMERIEK en niet analytisch: `straalBijHoek` is een closure die
     ook de boegschok bedient (dezelfde vorm, andere schaal), en een tweede
     afgeleide-formule zou bij de eerste wijziging van Shue uit de pas lopen. Een
     centrale differentie over 1e-4 rad is hier ruim nauwkeuriger dan een
     normaal die alleen een vervaging stuurt. */
  const MSPHERE_DTHETA = 1e-4;

  function vulOppervlak(lijn, thetas, straalBijHoek) {
    const nT = thetas.length, punten = [];
    // Het net: één ring per theta, één meridiaan per roll.
    const P = new Float32Array(nT * N_ROLL * 3);
    const N = new Float32Array(nT * N_ROLL * 3);
    for (let i = 0; i < nT; i++) {
      const th = thetas[i];
      const r = straalBijHoek(th);
      // In GSM: x langs de zonlijn, de rest op een cirkel eromheen.
      const x = r * Math.cos(th), rho = r * Math.sin(th);
      // Centrale differentie, eenzijdig op de neus waar theta niet negatief mag.
      const t0 = Math.max(th - MSPHERE_DTHETA, 0), t1 = th + MSPHERE_DTHETA;
      const dr = (straalBijHoek(t1) - straalBijHoek(t0)) / (t1 - t0);
      const A = dr * Math.cos(th) - r * Math.sin(th);
      const B = dr * Math.sin(th) + r * Math.cos(th);
      for (let j = 0; j < N_ROLL; j++) {
        const a = (j / N_ROLL) * Math.PI * 2;
        const sa = Math.sin(a), ca = Math.cos(a);
        const k = (i * N_ROLL + j) * 3;
        // GSM (x, y, z) -> Terra (y, z, x). Zie pocNaarTerra; hier
        // uitgeschreven omdat het per punt gebeurt en een Vector3 per punt
        // 3456 objecten per herbouw zou kosten.
        P[k]     = rho * sa * MSPHERE_RE;            // Terra x  <- GSM y
        P[k + 1] = rho * ca * MSPHERE_RE;            // Terra y  <- GSM z
        P[k + 2] = x * MSPHERE_RE;                   // Terra z  <- GSM x
        // Dezelfde permutatie op de normaal, en die is schaalvrij.
        const nx = -A * sa, ny = -A * ca, nz = B;
        const L = Math.hypot(nx, ny, nz) || 1;
        N[k] = nx / L; N[k + 1] = ny / L; N[k + 2] = nz / L;
      }
    }
    // Meridianen (langs theta) en ringen (rond de as), zonder diagonalen.
    const idx = [];
    for (let i = 0; i < nT - 1; i++)
      for (let j = 0; j < N_ROLL; j++)
        idx.push(i * N_ROLL + j, (i + 1) * N_ROLL + j);
    // De ringen mogen ijler: ze staan dicht op elkaar aan de neus en dragen
    // daar weinig bij aan het beeld.
    for (let i = 0; i < nT; i += 3)
      for (let j = 0; j < N_ROLL; j++)
        idx.push(i * N_ROLL + j, i * N_ROLL + ((j + 1) % N_ROLL));

    lijn.geometry.dispose();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setIndex(idx);
    lijn.geometry = geo;
    return { punten: nT * N_ROLL, lijnstukken: idx.length / 2 };
  }

  /* ==========================================================
     ALLEEN DE DOORSNEDE, VOOR DE VLAKKE STANDEN.

     Meridian en Top kijken loodrecht op een vlak door de zonlijn. Bij een
     OMWENTELINGSOPPERVLAK is de doorsnede in dat vlak precies de omtrek die
     je ziet — de rest van het net ligt eromheen en zegt daar niets meer.
     Het volle net (3456 punten, 4560 lijnstukken per oppervlak) maakt van een
     doorsnede juist weer een driedimensionaal ding, en dat is precies wat een
     doorsnede niet is.

     Twee krommen per oppervlak dus, en welke twee hangt van het vlak af.
     De geometrie hieronder zet een punt op GSM-y = rho*sin(a) en GSM-z =
     rho*cos(a):

       meridian (het GSM X-Z-vlak) vraagt GSM-y = 0  ->  a = 0 en a = pi
       top      (het GSM X-Y-vlak) vraagt GSM-z = 0  ->  a = pi/2 en 3pi/2

     Dat is geen benadering van de omtrek maar de omtrek zelf, want een
     omwentelingsoppervlak heeft geen silhouet dat van de kijkhoek afwijkt
     zolang je loodrecht op zijn as staat.
  ========================================================== */
  let doorsnedeVlak = null;
  const ROLLEN = {
    meridian: [0, Math.PI],
    top: [Math.PI / 2, 3 * Math.PI / 2]
  };

  /* DE DOORSNEDE KRIJGT ÓÓK NORMALEN, en niet omdat ze hier iets doen: `uNear`
     staat in deze stand op 1 en de vervaging is dus vlak. Maar de shader draait
     wél, en `normalize(vec3(0.0))` is een deling door nul — in GLSL geen fout
     maar NaN, en een NaN in `vFade` maakt de hele lijn onzichtbaar zonder dat
     er iets gemeld wordt. Precies de faalvorm die deze codebase telkens weer
     vangt, dus liever twaalf regels rekenwerk dan een lege doorsnede. */
  function vulDoorsnede(lijn, thetas, straalBijHoek, vlak) {
    const nT = thetas.length, rollen = ROLLEN[vlak] || ROLLEN.meridian;
    const P = new Float32Array(nT * rollen.length * 3);
    const N = new Float32Array(nT * rollen.length * 3);
    for (let j = 0; j < rollen.length; j++) {
      const a = rollen[j], sa = Math.sin(a), ca = Math.cos(a);
      for (let i = 0; i < nT; i++) {
        const th = thetas[i], r = straalBijHoek(th);
        const x = r * Math.cos(th), rho = r * Math.sin(th);
        const t0 = Math.max(th - MSPHERE_DTHETA, 0), t1 = th + MSPHERE_DTHETA;
        const dr = (straalBijHoek(t1) - straalBijHoek(t0)) / (t1 - t0);
        const A = dr * Math.cos(th) - r * Math.sin(th);
        const B = dr * Math.sin(th) + r * Math.cos(th);
        const k = (j * nT + i) * 3;
        P[k]     = rho * sa * MSPHERE_RE;            // Terra x  <- GSM y
        P[k + 1] = rho * ca * MSPHERE_RE;            // Terra y  <- GSM z
        P[k + 2] = x * MSPHERE_RE;                   // Terra z  <- GSM x
        const nx = -A * sa, ny = -A * ca, nz = B;
        const L = Math.hypot(nx, ny, nz) || 1;
        N[k] = nx / L; N[k + 1] = ny / L; N[k + 2] = nz / L;
      }
    }
    // Elke kromme als aaneengesloten lijnstukken; de twee krommen raken elkaar
    // op de neus (theta 0) maar worden NIET verbonden — dan zou de laatste
    // punt van de ene naar de eerste van de andere springen.
    const idx = [];
    for (let j = 0; j < rollen.length; j++)
      for (let i = 0; i < nT - 1; i++) idx.push(j * nT + i, j * nT + i + 1);

    lijn.geometry.dispose();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setIndex(idx);
    lijn.geometry = geo;
    return { punten: nT * rollen.length, lijnstukken: idx.length / 2 };
  }

  /* Het vlak waarin de doorsnede getekend wordt, of null voor het volle net.
     Geeft terug of er iets veranderde, zodat de aanroeper weet of er herbouwd
     moet worden. */
  /* DE INKT HEEFT TWEE SCHRIJVERS EN DAAROM EEN FUNCTIE.

     `setOutline` bepaalt WELKE set inkt erbij hoort (net of doorsnede),
     `setFade` bepaalt hoeveel ervan je op dit moment ziet. Zou elk van de
     twee zijn eigen `material.opacity =` hebben, dan wiste de laatste
     schrijver de ander uit en was het toeval wie je zag. Een halverwege
     vervaagde grens die zijn weergave wisselt, is precies het geval waarin
     dat gebeurt — en dat is nu net het geval waarvoor de vervaging bestaat. */
  let vervaging = 1;

  /* DRIE SCHRIJVERS OP DEZELFDE TWEE GETALLEN, en daarom één functie.

     `setOutline` bepaalt welke set inkt erbij hoort (net of doorsnede),
     `setFade` hoeveel je daar op dit moment van ziet, en sinds sessie 33 hangt
     de DOORKIJK aan dezelfde wissel — hij bestaat alleen in het volle net. Zou
     elk van de drie zijn eigen toekenning hebben, dan wiste de laatste schrijver
     de andere uit en was het toeval wie je zag.

     De waarden gaan naar UNIFORMS en niet naar `material.opacity`: dit is sinds
     de doorkijk een ShaderMaterial, en die leest zijn eigen dekking uit de
     shader. `material.opacity` zetten zou stil niets doen — dezelfde val die de
     PoC beschrijft bij `tintBoundary`. */
  function schrijfInkt() {
    const inkt = doorsnedeVlak ? INKT.lijn : INKT.net;
    // Eén betekent GEEN doorkijk: in een doorsnede is er niets om doorheen te
    // kijken, want daar staat alleen de omtrek.
    const nabij = doorsnedeVlak ? 1 : MSPHERE_NABIJ;
    mp.material.uniforms.uOpacity.value = inkt.mp * vervaging;
    shock.material.uniforms.uOpacity.value = inkt.shock * vervaging;
    mp.material.uniforms.uNear.value = nabij;
    shock.material.uniforms.uNear.value = nabij;
  }

  function setOutline(vlak) {
    if (vlak === doorsnedeVlak) return false;
    doorsnedeVlak = vlak;
    schrijfInkt();
    return true;
  }

  /* De kruisvervaging van een standwissel (sessie 31).

     Tussen doorsnede en vol net zit geen tussenvorm: 142 lijnstukken worden
     er 4560, en die geometrie wisselt in één keer. Wat er WEL tussen zit is
     hoeveel je ervan ziet, dus zakt de inkt naar nul, wisselt de vorm in dat
     dal, en komt hij weer op. Zichtbaarheid is hier het enige dat continu kan
     zijn, dus is dat waar de overgang op rijdt. */
  function setFade(f) {
    const n = Math.max(0, Math.min(1, Number.isFinite(f) ? f : 1));
    if (n === vervaging) return;
    vervaging = n;
    schrijfInkt();
  }

  const vul = (lijn, thetas, straalBijHoek) => doorsnedeVlak
    ? vulDoorsnede(lijn, thetas, straalBijHoek, doorsnedeVlak)
    : vulOppervlak(lijn, thetas, straalBijHoek);

  /* Herbouwen uit een windstand.

     `pdyn` in nPa en `bz` in nT zijn METINGEN; r0, alpha en de boegschok
     volgen daaruit via Shue. Er wordt hier niets gekozen — verandert de
     wind niet, dan verandert dit oppervlak niet. */
  function update(pdyn, bz, mach) {
    const P = Core.Physics, B = Core.Boundary;
    const r0 = P.standoff(pdyn, bz);
    // TWEE argumenten, en dat is geen detail: `flaring(pdyn, bz)`. Met alleen
    // `bz` erin wordt pdyn = bz en bz = undefined, en alpha is dan NaN — een
    // oppervlak dat nergens meer staat, zonder dat er iets fout gaat.
    const alpha = P.flaring(pdyn, bz);
    const thetas = B.arcThetas(r0, alpha, MSPHERE_DRAW_MAX, N_THETA);
    const mpStat = vul(mp, thetas, (th) => P.magnetopauseRadius(th, r0, alpha));

    /* GEEN MACH IS GEEN BOEGSCHOK, en die regel staat hier omdat de formule
       hem niet kan dragen. `bowShockStandoff` begint met `Math.max(mach, 1.2)`
       — een numeriek vangnet tegen de singulariteit bij Mach 1, geen fysische
       ondergrens. Een ontbrekende mach glipt daar doorheen als 1,2.

       GEMETEN 2026-08-19: bowShockStandoff(10, null) geeft 37,75 Re, tot op de
       cijfers gelijk aan Mach 1,2, waar de gemeten week tussen Mach 2,9 en 8,0
       ligt. Dat is bijna vier keer te ver, zonder één foutmelding — dezelfde
       faalvorm als de standoff van 23 Re uit een ontbrekende dichtheid.

       Latent en niet acuut: in de gemeten week hadden 0 van de 10.008 rijen een
       onvolledige mach. Dat is geen reden om het te laten staan, het is de reden
       dat niemand het ooit had zien gebeuren.

       De magnetopauze blijft wél staan: die hangt aan pdyn en Bz, en die zijn er.
       Een halve waarheid tonen is hier juist, want de helft die ontbreekt is
       zichtbaar afwezig. */
    if (!Number.isFinite(mach)) {
      shock.visible = false;
      return { r0, alpha, rbs: null, ...mpStat, shockLijnstukken: 0 };
    }
    shock.visible = true;

    // De boegschok is dezelfde vorm, opgeblazen tot zijn eigen standoff.
    const rbs = P.bowShockStandoff(r0, mach);
    const schaal = rbs / r0;
    const shockStat = vul(shock, thetas,
      (th) => P.magnetopauseRadius(th, r0, alpha) * schaal);

    return { r0, alpha, rbs, ...mpStat, shockLijnstukken: shockStat.lijnstukken };
  }

  /* De groep in het GSM-frame zetten.

     `sunDir` en `dipoleAxis` komen in TERRA-coördinaten binnen — de
     aanroeper heeft ze al omgezet. Deze module bouwt daar de basis uit op
     en zet hem als quaternion op de groep. Eén rotatie voor het hele
     oppervlak, en niets dat per frame hoeft. */
  const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  function orient(sunDir, dipoleAxis) {
    // GSM: X naar de zon, Y = M x X, Z = X x Y.
    _x.copy(sunDir).normalize();
    _y.crossVectors(dipoleAxis, _x);
    if (_y.lengthSq() < 1e-12) _y.set(0, 1, 0);     // dipool langs de zonlijn
    _y.normalize();
    _z.crossVectors(_x, _y).normalize();
    // De geometrie is gebouwd met Terra-x <- GSM-y, Terra-y <- GSM-z,
    // Terra-z <- GSM-x. De kolommen staan dus in die volgorde.
    _m.makeBasis(_y, _z, _x);
    group.quaternion.setFromRotationMatrix(_m);
  }

  const setVisible = (aan) => { group.visible = !!aan; };
  const setPartVisible = (deel, aan) => {
    if (deel === 'magnetopause') mp.visible = !!aan;
    if (deel === 'bowshock') shock.visible = !!aan;
  };

  function dispose() {
    for (const l of [mp, shock]) { l.geometry.dispose(); l.material.dispose(); }
    group.clear();
  }

  return { group, update, orient, setVisible, setPartVisible, setOutline, setFade,
           dispose,
           // Voor de legenda: wat er werkelijk getekend wordt, als CSS-kleur.
           colors: { mp: '#' + MP_INK.toString(16).padStart(6, '0'),
                     shock: '#' + SHOCK_INK.toString(16).padStart(6, '0') },
           outline: () => doorsnedeVlak,
           fade: () => vervaging,
           parts: { mp, shock } };
}
