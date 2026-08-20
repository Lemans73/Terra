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

  /* ==========================================================
     DE KLEUR ZEGT WAT ER BINNENKOMT (sessie 34, Terry).

     De VORM draagt de krimping al — dat is letterlijk wat de neus doet — dus
     een kleur die hetzelfde zegt, zegt niets nieuws. Wat de kleur hier draagt
     is de IMPACT: hoeveel van die wind werkelijk naar binnen komt.

     DRIE KANALEN, EN ZE DRAGEN DRIE VERSCHILLENDE GROOTHEDEN.

       tint      de Bz-toestand, uit `Core.Boundary.tintOf` — noordwaarts,
                 zuidwaarts, of sterk zuidwaarts onder -10 nT. Die functie
                 staat in de byte-identieke fysicalaag en `TINTS.mp-bz` in
                 registry.js legt de betekenis vast, dus Terra krijgt hier
                 GEEN tweede drempelstelsel naast een dat er al is.
       diepte    de koppeling (`Physics.entryRate`), geklemd op 8x normaal.
                 Dat is de enige grootheid in dit beeld die zegt HOEVEEL er
                 binnenkomt; r0 staat al drie keer op het scherm.
       verloop   de lokale druk: cos^2 van de hoek tussen de normaal en de
                 zonlijn. De Newtoniaanse drukwet, en precies waarom de NEUS
                 de standoff draagt — daar komt de wind loodrecht aan, op de
                 flank alleen de component langs de normaal.

     VERDIEPEN IS VERZADIGEN EN NIET VERDONKEREN. Op een donkere achtergrond
     leest een lagere lichtheid als wegzakken, en dat is het tegendeel van
     meer impact. De diepe tinten zijn dezelfde hue op volle verzadiging en
     hoger uit.

     DE BASISTINTEN ZIJN DIE VAN DE REGISTRY EN BLIJVEN DAT. Alleen het diepe
     eind is nieuw. Een eerdere poging verschoof ook de basis omlaag — dat gaf
     een bredere ramp, maar de grens werd op een gewone dag 24 % stiller en bij
     sterk zuidwaartse Bz zelfs 59 %, en dat is de hoofdvorm van dit hele beeld.
     GEMETEN tegen de achtergrond (#05070d) op een mediaan moment: deze ramp
     houdt 0,92 tot 1,05x de helderheid die de grens vandaag heeft.

     HOE VER DE RAMP MOET REIKEN IS GEMETEN EN NIET GEKOZEN, op de 9861 rijen
     van de gemeten week. Een eerste poging hield de verdieping op 1,15x
     luminantie, en toen haalde de ZUID-staat — juist de interessante — over
     de hele ramp maar dE 4,2 en op een mediaan moment 1,2: onzichtbaar. Deze
     ramp geeft vol dE 18 tot 24 en op een mediaan moment 5,7 tot 7,3, ruim
     boven de drempel van ongeveer 2,3 waarop een groot vlak van kleur
     verandert.

     EN DE DRIE STATEN BEZETTEN ELK EEN ANDER STUK VAN DIE RAMP, wat precies
     is waarom hue en diepte samen meer zeggen dan elk apart:

       north          38,3 % van de week, koppeling mediaan 0,22 · max 1,68
                      -> komt nooit voorbij de helft van zijn ramp
       south          61,3 %,             mediaan 1,18 · max 4,76
       strong-south    0,4 %,             mediaan 2,91 · max 4,86
                      -> arriveert vrijwel vol, en dat is de storm

     Ondiep cyaan is rustig, half oranje is gewone koppeling, vol roze is
     storm. Geen van die drie uitspraken staat in de vorm alleen.

     DE SCHOK KLEURT NIET MEE. Hij hangt volledig aan r0 en voegt geen eigen
     meting toe; hem laten meekleuren zou twee oppervlakken hetzelfde laten
     zeggen. Zijn `uImpact` staat daarom op nul, en niet zijn tint op zichzelf.

     GEEN Bz IS GEEN TOESTAND. Dan valt de grens terug op de neutrale tint —
     de vorm staat er nog (die hangt aan pdyn), maar over open of dicht is er
     niets te zeggen. Dat is dezelfde scheiding die de veldlijnen maken met
     `bounded: false`.
  ========================================================== */
  const MSPHERE_TINTEN = {
    'north':        { basis: 0x4fd1c5, diep: 0x00fff0 },
    'south':        { basis: 0xf2a33c, diep: 0xffd24a },
    'strong-south': { basis: 0xe85a9b, diep: 0xff7ad0 },
    /* De neutrale stand krijgt óók een diep eind, en het wordt nooit getoond:
       zonder Bz geeft `entryRate` null en staat de impact op nul. Het staat er
       omdat een tint zonder tegenhanger de enige uitzondering in de tabel zou
       zijn, en de volgende lezer dan moet uitzoeken of dat opzet is. */
    'none':         { basis: 0x6ea8ff, diep: 0x9ec9ff }
  };

  /* Hoe hard de koppeling moet lopen voor de volle diepe tint.

     DRIE, EN DAT IS EEN KWANTIEL EN GEEN ROND GETAL. `entryRate` klemt zelf op
     8x normaal, maar die bovenkant is een uitschieter: over de gemeten week
     ligt de mediaan op 0,81x, p90 op 1,97 en p99 op 3,54, en boven de 3 zit
     2,3 % van alle monsters. Op 3 vol betekent dus: een gewone dag staat een
     kwart de ramp in, een drukke dag tweederde, en een storm helemaal. Zou dit
     op 8 staan — de klem van de functie zelf — dan zat 97,7 % van de week in
     de onderste helft en deed het kanaal niets. */
  const MSPHERE_KOPPELING_VOL = 3;

  /* HOEVEEL VERDIEPING HET HELE OPPERVLAK SOWIESO KRIJGT.

     Het drukverloop is cos^2 van de hoek met de zonlijn, en over de GETEKENDE
     vorm is dat scheef: gemiddeld 0,209, want de staart loopt tot 60 Re en telt
     1584 van de punten waar de neus er 144 heeft. Als kaal gewicht kost het
     verloop dus een deel van het kanaal dat de intentie was.

     GEMETEN, bij volle impact en met de schok uit, als totale luminantie over
     het beeld (nulmeting zonder de schil eraf):

       zonder verloop      +204 %      het hele oppervlak verdiept
       bodem 0,00          +151 %      74 % daarvan blijft over
       bodem 0,35          ~+186 %     ~82 %
       bodem 0,55          +180 %      88 %

     En het verloop zelf, als helderheid van de neus tegen die van de staart:
     1,68 bij bodem 0 · 1,49 bij 0,35 · 1,40 bij 0,55, tegen 1,23 met het
     verloop helemaal uit — die 1,23 is de doorkijk en de vorm, niet de druk.
     Bodem 0,35 houdt dus ruwweg 82 % van de impact en 60 % van het
     verloopcontrast, en dat is de verhouding die Terry's twee woorden
     beschrijven: de impact is de intentie, de lokale druk de toevoeging.

     TWEE WAARSCHUWINGEN BIJ DIE GETALLEN, allebei omdat ze anders te stellig
     lezen. Het staartvakje bevat maar 12 pixels — de trend is monotoon en over
     vijf standen consistent, maar het is geen scherpe meting. En een eerdere
     ronde gaf hier +4,4 %, wat tot een bodem van 0,55 leidde; die meting stond
     op een camera die bij het opstarten op een 0x0-canvas NaN was geworden, dus
     hij mat een leeg beeld. Dezelfde faalvorm als de twee van sessie 33: een
     echte meting op een foute opstelling leest als een echt resultaat. */
  const MSPHERE_DRUKBODEM = 0.35;

  function bouwOppervlak(kleur, opacity) {
    const geo = new THREE.BufferGeometry();
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor:   { value: new THREE.Color(kleur).convertSRGBToLinear() },
        /* De diepe tegenhanger van diezelfde kleur. Begint gelijk aan de
           basis, zodat een oppervlak dat nooit een tint krijgt (de schok)
           per constructie niets doet in plaats van iets onbedoelds. */
        uDeep:    { value: new THREE.Color(kleur).convertSRGBToLinear() },
        uImpact:  { value: 0 },
        uPressure:{ value: 1 },
        /* De BODEM van het drukverloop: hoeveel van de verdieping het hele
           oppervlak sowieso krijgt, ook waar de wind er langs scheert in
           plaats van op te botsen. Zie de noot bij MSPHERE_DRUKBODEM. */
        uFloor:   { value: MSPHERE_DRUKBODEM },
        uOpacity: { value: opacity },
        /* Eén op eén betekent GEEN doorkijk. Dat is de stand voor de vlakke
           standen: daar is het oppervlak al tot zijn omtrek teruggebracht en is
           er niets om doorheen te kijken. Zie schrijfInkt(). */
        uNear:    { value: MSPHERE_NABIJ }
      },
      vertexShader: `
        varying float vFade;
        varying float vPress;
        uniform float uNear;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 n = normalize(normalMatrix * normal);
          float toward = dot(n, normalize(-mv.xyz));
          vFade = mix(1.0, uNear, smoothstep(-0.15, 0.35, toward));
          /* DE ZONLIJN IS IN DEZE GEOMETRIE DE LOKALE +Z, en dat is geen
             toeval maar de permutatie uit vulOppervlak: Terra-z <- GSM-x.
             Dus normal.z IS de component van de normaal langs de zonlijn,
             zonder één extra uniform of matrixvermenigvuldiging. Ongedraaid
             en dus onafhankelijk van waar de camera staat — dit is een
             eigenschap van het oppervlak, niet van het uitzicht. */
          float c = max(0.0, normal.z);
          vPress = c * c;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform vec3 uDeep;
        uniform float uImpact; uniform float uPressure; uniform float uFloor;
        uniform float uOpacity;
        varying float vFade; varying float vPress;
        void main() {
          /* De druk MODULEERT de impact en knijpt hem niet af. Het verschil is
             gemeten en het was groot: met een kaal vPress als gewicht voegde de
             impact bij vol kanaal nog maar 4,4 % licht toe waar hij vlak 33 %
             geeft, want de staart telt tien keer zoveel punten als de neus en
             staat daar op nul. De bodem laat het hele oppervlak meedoen; wat
             het verloop erbovenop doet is de neus eruit tillen.

             uPressure op nul zet het verloop uit zonder de shader te
             herschrijven, en dan kleurt het oppervlak overal gelijk. */
          float p = mix(1.0, mix(uFloor, 1.0, vPress), uPressure);
          gl_FragColor = vec4(mix(uColor, uDeep, uImpact * p), uOpacity * vFade);
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
     niet klopt.

     DE SCHOK KREEG MINDER DEKKING TOEN HIJ ROOD WERD, en dat is precies het
     omgekeerde van wat ik had UITGEREKEND. De redenering was: rood is bij
     gelijke verzadiging ongeveer half zo licht als het oranje dat hier stond
     (lineaire luminantie 0,4631 tegen 0,2763), dus de dekking moet mee omhoog
     om "rooder" niet stilzwijgend "zwakker" te laten betekenen. Dat gaf 0,57.

     GEMETEN GAF DAT 2,61x ZOVEEL LICHT, en de schok overstemde de
     magnetopauze — verhouding 0,94 waar hij 2,44 hoort te zijn. De oorzaak is
     de bloom-pass: die heeft een DREMPEL, en #ff5340 heeft zijn rode kanaal op
     255 waar #e8a86f nergens boven 232 komt. Het rood slaat er dus doorheen en
     het bleke oranje niet. Een luminantiemodel kan dat niet zien, want het is
     niet lineair. Dit is waarom er in dit project via de composer gemeten wordt
     en niet via de renderer.

     Dus gemeten in plaats van gerekend, drempelvrij (de som van de luminantie
     over het hele beeld, met een nulmeting zonder de schil eraf) en per set:

       vol net     oud #e8a86f @0,55 -> 0,143.  Rood haalt dat op 0,25.
       doorsnede   oud #e8a86f @0,75 -> 0,0244. Rood haalt dat op 0,70.

     Twee verschillende factoren, en dat is geen ruis: in het volle net kruisen
     4560 lijnstukken elkaar en bouwt de helderheid zich op tot boven die
     bloomdrempel, in de doorsnede ligt er per plek precies één lijn en gebeurt
     dat nauwelijks. Daarom staan hier twee sets en niet één met een factor.

     De verhouding blijft waar hij hoort: de magnetopauze houdt 2,4x zoveel
     licht in het volle net en 1,8x in de doorsnede, dus hij blijft de
     hoofdvorm. Wat er veranderde is de KLEUR en niets anders — precies wat er
     gevraagd is. */
  const INKT = {
    net:  { mp: 0.55, shock: 0.25 },
    lijn: { mp: 1.00, shock: 0.70 }
  };

  /* De twee inkten staan hier als getal en NERGENS anders. De legenda (blok B5)
     vraagt ze op via `colors` hieronder in plaats van ze in CSS over te tikken:
     een swatch die de kleur van het oppervlak zegt te zijn en het niet is, is
     erger dan geen swatch.

     DE BOEGSCHOK IS ROOD GEWORDEN (sessie 34, Terry): #e8a86f -> #ff5340. Niet
     alleen omdat hij in werkelijkheid dichter bij rood staat, maar omdat blok 2
     de magnetopauze het oranje #f2a33c laat lenen bij zuidwaartse Bz — en de
     twee oppervlakken liggen genesteld, een paar Re uit elkaar. GEMETEN in
     CIE76 tegen alle vier de tinten die de grens kan aannemen: #e8a86f zat op
     24 van het zuid-oranje, #ff5340 op 48, en op minstens 48 van elk van de
     andere drie. De dipoolas (#ff7a4d) staat dichterbij in hue, maar die is een
     stompje IN de aarde met dertig Re en twee oppervlakken ertussen — buren
     wegen naar waar ze staan, niet naar waar ze in een tabel staan. */
  const MP_INK = MSPHERE_TINTEN.none.basis, SHOCK_INK = 0xff5340;

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
  /* De Bz-toestand van dit moment en hoe hard de koppeling loopt. Ze staan
     hier als toestand en niet als argument van `schrijfInkt`, om precies de
     reden die hierboven staat: één schrijver per uniform. */
  let tintStaat = 'none', impact = 0, bzNu = null;

  /* ==========================================================
     DE TINT WISSELT VLOEIEND EN NIET MET EEN KLIK.

     `tintOf` schakelt hard op Bz = 0 en op -10 nT, en dat zijn de goede
     drempels — noord tegen zuid is werkelijk de scheiding die telt. Maar Bz
     SCHOMMELT om die nul heen, en een harde snede maakt van die ruis een
     gebeurtenis. GEMETEN over de reeks van zeven dagen: 662 tintwissels in 168
     uur, gemiddeld 3,95 per uur en 15 in het drukste, terwijl 23,9 % van alle
     monsters binnen 1 nT van de drempel ligt. Bij afspelen op 10 min/s klapt de
     hoofdvorm van dit beeld dan meermaals per seconde van cyaan naar oranje, op
     een verschil dat er niet is.

     Dus een BAND om elke drempel, waarbinnen de twee tinten in elkaar
     overlopen. Buiten de band staat er exact de kleur die de registry noemt;
     erbinnen een mengsel. Cyaan en oranje liggen bijna tegenover elkaar, dus
     dat mengsel is bleek — en dat is juist wat er te zeggen valt: op Bz nul is
     de toestand werkelijk onbeslist, en een bleke grens zegt dat. Dezelfde
     uitspraak die de sectorlane doet met `onbeslist`.

     DE BREEDTE IS DE RUIS EN GEEN ROND GETAL. Tussen twee opeenvolgende
     monsters verspringt Bz mediaan 0,24 nT (p75 0,59 · p90 1,30). Een band van
     1 nT is daar ruwweg vier keer zo breed, dus een gewone stap verplaatst de
     kleur een achtste van de ramp — te klein om als klik te lezen. Breder mag
     niet zomaar: op ±1 staat 24,6 % van de monsters in het mengsel, op ±2 is
     dat 45,8 %, en dan is de hoofdvorm van dit beeld bijna de helft van de tijd
     bleek. Op ±0,5 is het 12,7 %, maar dan is de band nog maar twee mediane
     stappen breed en komt het klikken terug.

     `tintOf` BLIJFT DE AUTORITEIT OVER HET WOORD. Wat hier zachter wordt is de
     VERF, niet de uitspraak: de legenda, de uitlezing en `tint()` lezen nog
     steeds de discrete staat. Een tekening die tussen twee waarden in zit mag
     dat laten zien; een bewering mag dat niet.
  ========================================================== */
  const MSPHERE_TINTBAND = 1;

  const _a = new THREE.Color(), _b = new THREE.Color();

  /* De twee kleuren van dit moment — basis en diep — als lineaire THREE.Color.
     Mengen gebeurt in de LINEAIRE ruimte omdat de shader daar ook rekent. */
  function tintPaar(bz, uitBasis, uitDiep) {
    const T = MSPHERE_TINTEN, B = MSPHERE_TINTBAND;
    const zet = (k, uitB, uitD) => {
      uitB.setHex(T[k].basis).convertSRGBToLinear();
      uitD.setHex(T[k].diep).convertSRGBToLinear();
    };
    if (!Number.isFinite(bz)) { zet('none', uitBasis, uitDiep); return; }
    const meng = (k1, k2, t) => {
      zet(k1, uitBasis, uitDiep); zet(k2, _a, _b);
      uitBasis.lerp(_a, t); uitDiep.lerp(_b, t);
    };
    // Rond de nul: noord <-> zuid.
    if (bz >= B) zet('north', uitBasis, uitDiep);
    else if (bz > -B) meng('north', 'south', (B - bz) / (2 * B));
    // Rond de -10: zuid <-> sterk zuid.
    else if (bz >= Core.Boundary.STRONG_SOUTH_NT + B) zet('south', uitBasis, uitDiep);
    else if (bz > Core.Boundary.STRONG_SOUTH_NT - B)
      meng('south', 'strong-south',
           (Core.Boundary.STRONG_SOUTH_NT + B - bz) / (2 * B));
    else zet('strong-south', uitBasis, uitDiep);
  }

  function schrijfInkt() {
    const inkt = doorsnedeVlak ? INKT.lijn : INKT.net;
    // Eén betekent GEEN doorkijk: in een doorsnede is er niets om doorheen te
    // kijken, want daar staat alleen de omtrek.
    const nabij = doorsnedeVlak ? 1 : MSPHERE_NABIJ;
    mp.material.uniforms.uOpacity.value = inkt.mp * vervaging;
    shock.material.uniforms.uOpacity.value = inkt.shock * vervaging;
    mp.material.uniforms.uNear.value = nabij;
    shock.material.uniforms.uNear.value = nabij;

    tintPaar(bzNu, mp.material.uniforms.uColor.value,
                   mp.material.uniforms.uDeep.value);
    mp.material.uniforms.uImpact.value = impact;
    /* IN DE DOORSNEDE VERVALT HET DRUKVERLOOP. Daar staat alleen de omtrek,
       en die loopt van de neus tot de staart: het verloop zou dan als een
       gradiënt LANGS een lijn lezen in plaats van als druk OVER een oppervlak.
       De impact blijft wel staan — die is een eigenschap van het moment en
       niet van de weergave. */
    mp.material.uniforms.uPressure.value = doorsnedeVlak ? 0 : 1;
  }

  /* DE TOESTAND VAN DIT MOMENT, ALS TINT EN DIEPTE.

     `bz` in nT en `koppeling` als veelvoud van normaal (`Physics.entryRate`).
     Allebei mogen ze ontbreken, en dat is dan geen nul maar een toestandloze
     grens: `tintOf` geeft null zonder Bz-meting en de tint valt terug op
     neutraal — de vorm staat er nog, want die hangt aan pdyn, maar over wat er
     binnenkomt is niets te zeggen. Nul zou "rustig" beweren. */
  function setTint(bz, koppeling) {
    bzNu = Number.isFinite(bz) ? bz : null;
    tintStaat = Core.Boundary.tintOf(bz) || 'none';
    impact = Number.isFinite(koppeling)
      ? Math.max(0, Math.min(1, koppeling / MSPHERE_KOPPELING_VOL)) : 0;
    schrijfInkt();
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

  const css = (n) => '#' + n.toString(16).padStart(6, '0');

  return { group, update, orient, setVisible, setPartVisible, setOutline, setFade,
           setTint, dispose,
           /* Voor de legenda: wat er werkelijk getekend wordt, als CSS-kleur.
              `mp` is de NEUTRALE tint — de stand zonder Bz-meting — en `tints`
              draagt de vier ramps waar de legenda zijn verloopjes uit bouwt.
              Eén bron, zodat een swatch niet kan gaan afwijken van de scene. */
           colors: { mp: css(MP_INK), shock: css(SHOCK_INK) },
           tints: Object.fromEntries(Object.entries(MSPHERE_TINTEN).map(
             ([k, v]) => [k, { basis: css(v.basis), diep: css(v.diep) }])),
           tint: () => tintStaat,
           impact: () => impact,
           outline: () => doorsnedeVlak,
           fade: () => vervaging,
           parts: { mp, shock } };
}
