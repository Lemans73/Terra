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
  function bouwOppervlak(kleur, opacity) {
    const geo = new THREE.BufferGeometry();
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(kleur), transparent: true, opacity,
      depthWrite: false
    });
    const lijn = new THREE.LineSegments(geo, mat);
    // De staart loopt ver buiten elke redelijke bounding sphere; three zou hem
    // dan wegcullen zodra de camera dichtbij staat.
    lijn.frustumCulled = false;
    group.add(lijn);
    return lijn;
  }

  const mp = bouwOppervlak(0x6fd3e8, 0.55);
  mp.name = 'msphere:magnetopause';
  const shock = bouwOppervlak(0xe8a86f, 0.34);
  shock.name = 'msphere:bowshock';

  /* De punten van één omwentelingsoppervlak, als lijnstukken.

     `straalBijHoek` is een functie zodat dezelfde bouwer de magnetopauze
     én de boegschok kan maken: die twee delen hun vorm en verschillen
     alleen in hun straal. */
  function vulOppervlak(lijn, thetas, straalBijHoek) {
    const nT = thetas.length, punten = [];
    // Het net: één ring per theta, één meridiaan per roll.
    const P = new Float32Array(nT * N_ROLL * 3);
    for (let i = 0; i < nT; i++) {
      const th = thetas[i];
      const r = straalBijHoek(th);
      // In GSM: x langs de zonlijn, de rest op een cirkel eromheen.
      const x = r * Math.cos(th), rho = r * Math.sin(th);
      for (let j = 0; j < N_ROLL; j++) {
        const a = (j / N_ROLL) * Math.PI * 2;
        const k = (i * N_ROLL + j) * 3;
        // GSM (x, y, z) -> Terra (y, z, x). Zie pocNaarTerra; hier
        // uitgeschreven omdat het per punt gebeurt en een Vector3 per punt
        // 3456 objecten per herbouw zou kosten.
        P[k]     = rho * Math.sin(a) * MSPHERE_RE;   // Terra x  <- GSM y
        P[k + 1] = rho * Math.cos(a) * MSPHERE_RE;   // Terra y  <- GSM z
        P[k + 2] = x * MSPHERE_RE;                   // Terra z  <- GSM x
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
    geo.setIndex(idx);
    lijn.geometry = geo;
    return { punten: nT * N_ROLL, lijnstukken: idx.length / 2 };
  }

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
    const mpStat = vulOppervlak(mp, thetas, (th) => P.magnetopauseRadius(th, r0, alpha));

    // De boegschok is dezelfde vorm, opgeblazen tot zijn eigen standoff.
    const rbs = P.bowShockStandoff(r0, mach);
    const schaal = rbs / r0;
    const shockStat = vulOppervlak(shock, thetas,
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

  return { group, update, orient, setVisible, setPartVisible, dispose,
           parts: { mp, shock } };
}
