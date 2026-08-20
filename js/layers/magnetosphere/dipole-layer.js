/* ============================================================
   TERRA — De zuivere dipool, als rustreferentie
   ------------------------------------------------------------
   Waar het veld zou liggen als er NIETS tegenaan duwde.

   WAAROM DIT DE RUSTSTAAT IS EN EEN NOMINALE WIND NIET.
   Een eerder plan wilde hier een "rustige" wind neerzetten — 2 nPa,
   Bz 0, Mach 8 — en de holte tekenen die daarbij hoort. Dat zijn drie
   GEKOZEN getallen, en een referentie die zelf een keuze is, meet niets.
   De zuivere dipool heeft dat probleem niet: hij is geen fit en geen
   gemiddelde maar een IDENTITEIT uit het leerboek,

       r = L * cos^2(magnetische breedte)

   om de dipoolas heen. Er zit geen zonnewind in, geen Shue en geen T89.
   Het is letterlijk de nul-windlimiet, en daarmee precies de vraag die
   de bezoeker mist: is deze holte samengedrukt, en hoeveel?

   EN DUS BESTAAT HIJ ALLEEN UIT VELDLIJNEN. Zonder wind is er geen
   magnetopauze en geen boegschok om naast te leggen — dat IS het punt.
   Deze laag tekent daarom twee dingen niet die het vorige plan wel
   noemde, en dat is geen versimpeling maar het gevolg van de keuze.

   DEZELFDE L-SCHILLEN ALS DE GETRACEERDE LIJNEN, DUS DEZELFDE VOETEN.
   De tracer zaait op vaste breedtes op r = 1,01, en voor een dipool ligt
   daar L = 1,01 / cos^2(breedte) bij. Twee lijnen delen dan hun voetpunt
   en lopen daarvandaan uiteen — en dat uiteenlopen IS de hele uitspraak.
   Een eigen setje L-waarden zou twee families naast elkaar zetten die
   elkaar nergens raken, en dan valt er niets af te lezen.

   ALTIJD ALS MERIDIAAN-DOORSNEDE, ook in de vrije 3D-stand (Terry).
   Twee lengtegraden in plaats van acht: een platte plak door een
   driedimensionaal beeld is per constructie niet met de live bundel te
   verwarren. En het vlak is niet zomaar een vlak — de dipoolas ligt per
   DEFINITIE in het GSM X-Z-vlak, dus dat vlak bevat de hele familie.

   GESTIPPELD EN INGEHOUDEN, en dat is niet cosmetisch: het is hetzelfde
   onderscheid dat `unresolved` van `open` scheidt. Wat uit een formule
   komt mag er niet uitzien als wat getraceerd is.
   ============================================================ */

import { MSPHERE_RE, MSPHERE_DRAW_MAX } from './boundary-layer.js';

/* Waar de zaden staan die de tracer gebruikt. Zie de noot hierboven: dit getal
   moet gelijk zijn aan `seedR` in `veldSpec`, anders vallen de voetpunten van
   de twee families niet samen en vergelijkt de tekening twee dingen die niet
   op dezelfde plek beginnen. De state geeft de BREEDTES mee, zodat die maar op
   één plek staan; deze straal hoort bij dezelfde afspraak. */
const DIP_ZAAD_R = 1.01;

/* Hoeveel punten per halve schil. De kromme is glad en kort, dus dit is ruim;
   het kost eenmalig geheugen en per herbouw niets noemenswaardigs. */
const DIP_PUNTEN = 120;

/* De inkt van de MODEL-klasse (`--msphere-model`). Niet een eigen kleur: deze
   laag IS een model, en de app heeft daar al een tint voor die overal hetzelfde
   betekent. De legenda leest hem hier op. */
const DIP_INK = 0xb98cff;

/* De streeplengte in Terra-eenheden. 1 Re = 100, dus dit is een streepje van
   een halve aardstraal met een gat van een kwart — op de schaal van dit beeld
   (tot 60 Re) leest dat als een stippellijn en niet als een reeks streepjes. */
const DIP_STREEP = 50, DIP_GAT = 26;

/* Hoeveel inkt. Zie de noot bij het materiaal. */
const DIP_DEKKING = 0.85;

export function createDipoleLayer(THREE, deps) {
  const group = new THREE.Group();
  group.name = 'terra-msphere-dipole';
  group.visible = false;

  const geo = new THREE.BufferGeometry();
  const mat = new THREE.LineDashedMaterial({
    color: new THREE.Color(DIP_INK),
    dashSize: DIP_STREEP, gapSize: DIP_GAT,
    /* DE STIPPELING DRAAGT HET ONDERSCHEID, NIET DE FLAUWHEID. Een eerste
       versie stond op 0,55 en was dan dubbel gedempt — gestippeld én
       doorzichtig — en daarmee op de schaal van dit beeld niet meer te zien.
       Wat "dit komt uit een formule" zegt is de onderbroken lijn; die hoeft
       niet ook nog eens te fluisteren. */
    transparent: true, opacity: DIP_DEKKING, depthWrite: false
  });
  const lijn = new THREE.LineSegments(geo, mat);
  lijn.name = 'msphere:dipole';
  lijn.frustumCulled = false;
  group.add(lijn);

  const _perp = new THREE.Vector3(), _as = new THREE.Vector3();
  const _p = new THREE.Vector3(), _q = new THREE.Vector3();
  let laatsteSleutel = null, laatste = null;

  /* De L-schil die bij een zaadbreedte hoort. Voor een dipool geldt
     r = L cos^2(lat), dus een zaad op (DIP_ZAAD_R, lat) ligt op
     L = DIP_ZAAD_R / cos^2(lat). Bij 56 graden is dat 3,2 Re en bij 84 al
     92,4 — ver voorbij wat er getekend wordt, en dat is juist de uitspraak:
     zó ver zou die schil reiken als de wind hem niet platdrukte. */
  const schilVan = (latGraden) => {
    const c = Math.cos(latGraden * Math.PI / 180);
    return DIP_ZAAD_R / Math.max(c * c, 1e-9);
  };

  /* Herbouwen uit de dipoolas.

     `asLokaal` staat in het frame van DEZE groep — die hangt onder de
     grensvlakgroep, dus dat is het (gepermuteerde) GSM-frame. De aanroeper
     rekent hem daarheen; hier wordt niets meer geroteerd, want een tweede plek
     waar dezelfde rotatie gebeurt is een plek waar hij uit de pas kan lopen.

     `zonLokaal` is de zonrichting in datzelfde frame, en die bepaalt het VLAK:
     de doorsnede loopt door de as en door de zonlijn. Dat is het GSM X-Z-vlak,
     en de dipoolas ligt daar per definitie in — dus het vlak bevat de hele
     familie en niet een schuine snede erdoorheen. */
  function update(asLokaal, zonLokaal, lats) {
    const sleutel = [asLokaal.x, asLokaal.y, asLokaal.z]
      .map((v) => v.toFixed(4)).join(',') + '|' + lats.join(',');
    if (sleutel === laatsteSleutel) return laatste;
    laatsteSleutel = sleutel;

    _as.copy(asLokaal).normalize();
    /* De richting in het vlak die loodrecht op de as staat: de zonlijn met
       zijn component langs de as eruit. Valt hij weg — de as pal naar de zon —
       dan is er geen vlak meer aan te wijzen en pakken we een willekeurige
       loodrechte, want de vorm is dan rotatiesymmetrisch en het maakt niet uit
       welke. */
    _perp.copy(zonLokaal).addScaledVector(_as, -zonLokaal.dot(_as));
    if (_perp.lengthSq() < 1e-9) {
      _perp.set(1, 0, 0).addScaledVector(_as, -_as.x);
      if (_perp.lengthSq() < 1e-9) _perp.set(0, 1, 0);
    }
    _perp.normalize();

    const maxR = MSPHERE_DRAW_MAX;
    const punten = [];
    for (const lat of lats) {
      const L = schilVan(lat);
      /* Waar de schil OPHOUDT: op de zaadstraal van de tracer en niet op de
         eenheidsbol. Dat scheelt maar een procent, en het is precies het
         procent waar de hele vergelijking op rust — de twee families horen hun
         voetpunt te DELEN, en anders is dat een bewering die nét niet waar is.
         Met L = DIP_ZAAD_R / cos^2(zaadbreedte) komt dit per constructie uit op
         de zaadbreedte zelf: de formule sluit rond. GEMETEN vóór deze regel:
         voetpunt 1,0000 tegen de 1,0100 waar de tracer zaait. */
      const latMax = Math.acos(Math.min(1, Math.sqrt(DIP_ZAAD_R / L)));
      for (const teken of [1, -1]) {
        let vorigBinnen = false;
        for (let i = 0; i <= DIP_PUNTEN; i++) {
          const la = -latMax + (2 * latMax * i) / DIP_PUNTEN;
          const r = L * Math.cos(la) * Math.cos(la);
          _q.copy(_perp).multiplyScalar(teken * r * Math.cos(la))
            .addScaledVector(_as, r * Math.sin(la))
            .multiplyScalar(MSPHERE_RE);
          /* AFKAPPEN OP DE TEKENGRENS, net als de staart van Shue, en om
             dezelfde reden: dat is waar we ophouden met tekenen en niet waar
             de natuur ophoudt. Met LineSegments hoeft daar niets voor te
             gebeuren — een paar dat niet allebei binnen valt, wordt gewoon
             niet gezet, en dan valt er vanzelf een gat. */
          const binnen = r <= maxR;
          if (binnen && vorigBinnen) {
            punten.push(_p.x, _p.y, _p.z, _q.x, _q.y, _q.z);
          }
          _p.copy(_q); vorigBinnen = binnen;
        }
      }
    }

    geo.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(punten), 3));
    lijn.geometry = g;
    // ZONDER DIT TEKENT EEN DASHEDMATERIAL EEN DOORGETROKKEN LIJN, stil.
    lijn.computeLineDistances();
    laatste = { schillen: lats.length, lijnstukken: punten.length / 6,
                Ls: lats.map(schilVan) };
    return laatste;
  }

  const setVisible = (aan) => { group.visible = !!aan; };

  function setFade(f) {
    const n = Math.max(0, Math.min(1, Number.isFinite(f) ? f : 1));
    mat.opacity = DIP_DEKKING * n;
  }

  function dispose() {
    lijn.geometry.dispose(); mat.dispose(); group.clear();
  }

  return { group, update, setVisible, setFade, dispose,
           colors: { dipole: '#' + DIP_INK.toString(16).padStart(6, '0') },
           stats: () => laatste };
}
