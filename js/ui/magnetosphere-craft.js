/* ============================================================
   TERRA — De GOES-toestellen, waar dit project het veld MEET
   ------------------------------------------------------------
   Twee stippen op 6,62 Re, en ze zijn geen versiering. Alles
   verder in deze scene is IGRF, T89 of Shue: een model dat zegt
   waar het veld hoort te liggen. Deze twee punten zijn het enige
   plek waar een INSTRUMENT het veld werkelijk gemeten heeft.

   De uitlezing noemt dat al met de rij `Beyond 6.62 Re · x% of
   the line length`: dat percentage is het deel van de tekening
   dat voorbij het laatste ligt dat hem kan tegenspreken. Zonder
   de toestellen erbij is die horizon een getal zonder plek.

   WAAROM EEN 2D-CANVAS EN GEEN OBJECTEN IN DE SCENE.
   Dezelfde reden als bij `magnetosphere-scale.js`, en één erbij.
   De gedeelde reden: wat hier op het scherm komt draagt TEKST, en
   tekst in WebGL kost een textuur per label en wordt wazig zodra
   hij niet op een hele pixel valt. De reden erbij is deze state:
   de vaste standen draaien op een ORTHOGRAFISCHE camera, en
   `scaleToPixels()` in js/core/label-sprite.js rekent met
   `camera.fov` — die bestaat daar niet. Ook `gl_PointSize` zou
   hier drie uitzonderingen vragen (apparaatpixels, geen zinnige
   attenuatie onder ortho, een aparte maat per stand).

   Op een canvas is elk van die drie dingen één regel, en de
   plaatsbepaling loopt via `Vector3.project(world.camera())`:
   per constructie dezelfde matrix die de lijnen eronder tekent,
   in alle drie de standen én tijdens de projectiemenging van een
   standwissel.

   DE VORM KOMT UIT DE POC, HET UITWIJKEN NIET.
   `TerraOverlay.craft` staat byte-identiek in
   js/compute/magnetosphere/, en de maten hieronder zijn letterlijk
   de zijne: 3,5 px voor het primaire toestel en 2,8 voor het
   tweede, dekking 1 tegen 0,65, lijnbreedte 1,2, de arcjet-ring op
   r + 3 met dekking 0,5, en het label op (x + 7, y + 3).

   Wat er NIET uit overgenomen kon worden is de tekenlus zelf, en
   dat is een meting en geen smaak. GEMETEN over 24 uur: de twee
   toestellen staan in de doorsnede mediaan 4,94 Re uit elkaar
   (Meridian) en 6,74 Re (Top). Bij de ~8 px/Re van een volle
   kadrering is dat 40 tot 55 px, en één label meet er 200. De twee
   labels vallen dus STRUCTUREEL over elkaar heen, en dan staat er
   op de enige plek waar dit project het veld meet een getal dat
   niemand kan lezen.

   De PoC heeft dat probleem niet in dezelfde mate: die kent één
   doorsnede en tekent op een ander formaat. Deze lus wijkt uit met
   een GEMETEN labelbreedte (`measureText`, niet geraden — de les
   van sessie 26) en trekt een haarlijn naar de stip zodra een
   label van zijn plek moest. Alles daarbuiten is de PoC.

   `craftLabel` komt om dezelfde reden niet mee: die is Nederlands
   en de scene van Terra is Engels. Dezelfde snede die de legenda
   met de registry maakt — de registry zegt WELKE er zijn, Terra
   levert de woorden.

   HET VLAK BEPAALT WELKE AS UIT HET BEELD WIJST, EN DAT IS NIET
   ALTIJD y. De PoC kent één doorsnede (meridian) en noemt daarom
   overal de y-component. Terra heeft er twee:

     Meridian   GSM X-Z   ->  uit het vlak is GSM y
     Top        GSM X-Y   ->  uit het vlak is GSM z
     vrij       geen vlak ->  geen uitspraak, de stip is vol

   EN IN TOP LIGT HIJ ER OOK NAAST — dat was mijn eerste aanname
   niet, en de meting corrigeerde hem. Het GSM X-Y-vlak is NIET het
   geografische equatorvlak: GSM-Z ligt in het vlak van de
   dipoolas, dus het equatorvlak van dit frame kantelt mee met de
   dipool en met het uur. GEMETEN over 24 uur, beide toestellen,
   48 monsters:

     Meridian   mediaan 4,70 Re uit het vlak   45 van 48 boven 0,5
     Top        mediaan 1,16 Re                39 van 48 boven 0,5

   De baan kantelt 0,1 tot 15,2 graden weg van het GSM-equatorvlak.
   De stip is dus in BEIDE doorsneden meestal hol, en wat de twee
   standen onderscheidt is het GETAL: in Top ligt de tekening vier
   keer dichter bij waar het toestel werkelijk is. Dat is precies
   wat er in het label hoort te staan in plaats van in een aanname.

   HOL IS EEN UITSPRAAK. Een volle stip beweert dat het toestel
   staat waar je hem ziet. Boven een halve aardstraal uit het vlak
   is dat niet waar, en dan wordt hij een open cirkel met de
   afwijking als GETAL erbij — meetbaar, niet als indruk.
   ============================================================ */

/* Boven deze afstand uit het tekenvlak is de stip hol. Een halve aardstraal:
   ruim binnen wat je op deze schaal (60 Re in beeld) nog een projectiefout
   zou kunnen noemen, en het is de waarde die registry.js al noemt. */
const MCRAFT_UIT_VLAK_RE = 0.5;

/* De rand waarbuiten een toestel niet meer getekend wordt. Ruimer dan het
   scherm, want de stip mag half buiten vallen; de PoC gebruikt dezelfde marges
   en om dezelfde reden — een label dat net over de rand begint is leesbaarder
   dan een dat plotseling verdwijnt. */
const MCRAFT_MARGE = { x: 40, y: 20 };

export function createMagnetosphereCraft(THREE, opts) {
  const { canvas, world, boundary, Core, Data, RE, toTerra } = opts;
  if (!canvas || !boundary || !Core || !Data || !toTerra) return null;

  /* HOE OUD EEN SAMPLE MAG ZIJN, EN VANAF WANNEER DAT ERBIJ STAAT. Allebei van
     de aanroeper, uit dezelfde constante die de uitlezing leest — zie de noot
     bij `msphereGoesRij` in index.html. Een eigen getal hier zou de marker en
     het paneel op hetzelfde moment iets anders laten zeggen.

     De terugvallen zijn die van de PoC (`Data.Goes.at` staat zelf op 120 s),
     zodat deze module zonder de twee opties nog steeds klopt in plaats van
     stil een uur oud sample te tonen. */
  const TOL_MS = Number.isFinite(opts.tolMs) ? opts.tolMs : 120_000;
  const OUD_MS = Number.isFinite(opts.oudMs) ? opts.oudMs : 120_000;

  const ctx = canvas.getContext('2d');
  const _p = new THREE.Vector3(), _o = new THREE.Vector3(), _r = new THREE.Vector3();
  /* Drie schermpunten die per frame hergebruikt worden. Ze staan hier en niet
     in `teken`: die loopt in de renderlus, en drie objecten per frame zijn er
     drie te veel voor iets wat nooit van vorm verandert. */
  const _mid = { x: 0, y: 0, z: 0 }, _rand = { x: 0, y: 0, z: 0 },
        _punt = { x: 0, y: 0, z: 0 };

  let vlak = null;            // 'meridian' | 'top' | null — bepaalt hol/vol
  let zichtbaar = true;       // de paneelschakelaar
  let vervaging = 1;
  let toestellen = [];        // wat `update` uitrekende: lokale positie + label
  let handtekening = '';
  /* TWEE METINGEN EN NIET ÉÉN, want ze horen bij twee verschillende momenten:
     `update` draait bij een herbouw en `teken` per verschoven projectie. Eén
     veld zou betekenen dat de laatste herbouw de tekenstatistiek wist — en dan
     leest een meetluik "twee toestellen" terwijl er nul getekend zijn. Precies
     het soort vals-groen dat deze codebase overal uitsluit. */
  let laatsteBron = null, laatsteTekening = null;

  const mono = getComputedStyle(document.documentElement)
    .getPropertyValue('--mono').trim() ||
    'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  const token = (naam, terugval) =>
    getComputedStyle(document.documentElement).getPropertyValue(naam).trim() || terugval;

  /* DE MATEN VAN DE POC, hier één keer opgeschreven zodat ze naast elkaar te
     lezen zijn in plaats van verspreid door de lus. Ze komen letterlijk uit
     `TerraOverlay.craft`; wijzigt dat bestand ze, dan hoort dit mee. */
  const MC = { rPrim: 3.5, rTweede: 2.8, aPrim: 1, aTweede: 0.65,
               lijn: 1.2, ringExtra: 3, ringAlpha: 0.5,
               labelDx: 7, labelDy: 3, font: '9px ' };

  /* De regelhoogte waarmee een label uitwijkt, en de marge waarbinnen twee
     labels als botsend gelden. 12 px op 9 px tekst: één regel plus wat lucht,
     zodat twee regels naast elkaar niet aan elkaar plakken. */
  const MC_REGEL = 12;

  /* Het label, in het Engels en met een ontbrekende meting die WEGVALT. Nul zou
     een meting van nul beweren, en dat is precies het onderscheid dat data.js
     saniteert door NaN naar null te brengen. De Nederlandse tegenhanger staat
     in TerraOverlay.craftLabel; die blijft daar. */
  function craftLabel(g) {
    let s = 'GOES-' + g.satellite;
    if (Number.isFinite(g.ext)) s += '  ' + g.ext.toFixed(0) + ' nT';
    /* HOE OUD DIT SAMPLE IS, en alleen boven de oude grens van 120 s. Daaronder
       verandert er niets aan wat er stond, dus de ruimere tolerantie voegt toe
       en neemt niets weg. PER MARKER en niet één keer voor beide: de twee
       toestellen publiceren onafhankelijk, en elke marker heeft hier zijn eigen
       plek om het te zeggen. In het paneel staat de oudste van de twee. */
    if (Number.isFinite(g.ouderdom) && g.ouderdom > OUD_MS) {
      s += '  ' + Math.round(g.ouderdom / 60_000) + ' min old';
    }
    if (g.arcjet) s += '  arcjet';
    if (g.offPlane) s += '  (out of plane, ' + g.offAxis + ' ' +
                         g.offset.toFixed(1) + ' Re)';
    return s;
  }

  /* WAAR ELK LABEL KOMT TE STAAN.

     Van boven naar beneden, en elk label dat horizontaal over een eerder label
     valt zakt eronder. De breedte wordt GEMETEN en niet geraden: `measureText`
     weet precies hoe breed "GOES-19  9 nT  (out of plane, y 3.1 Re)" is, en een
     geraden waarde zou labels laten wijken die elkaar nooit raken — of erger,
     ze laten staan waar ze elkaar wél raken. Dat is de les van sessie 26, waar
     71 van de 110 px van een spritelabel doorzichtig bleek.

     Alleen de VERTICALE plek beweegt. Horizontaal opschuiven zou het label van
     zijn stip weg trekken zonder dat er iets naast staat om het aan te
     koppelen; omlaag blijft het eronder hangen, en boven een paar pixels
     verschuiving komt er een haarlijn bij die zegt welke stip erbij hoort. */
  function plaatsLabels(c, lijst) {
    const uit = [];
    const gesorteerd = lijst.map((g, i) => ({ g, i }))
                            .sort((a, b) => a.g.y - b.g.y);
    for (const { g, i } of gesorteerd) {
      const tekst = craftLabel(g);
      const breedte = c.measureText(tekst).width;
      const x = g.x + MC.labelDx;
      let y = g.y + MC.labelDy;
      for (const eerder of uit) {
        const overlaptX = x < eerder.x + eerder.breedte && eerder.x < x + breedte;
        if (overlaptX && Math.abs(y - eerder.y) < MC_REGEL) {
          y = eerder.y + MC_REGEL;
        }
      }
      uit.push({ i, tekst, breedte, x, y, week: Math.abs(y - (g.y + MC.labelDy)) > 4 });
    }
    // Terug in de oorspronkelijke volgorde: de aanroeper telt op index.
    return uit.sort((a, b) => a.i - b.i);
  }

  /* De lus zelf. Vorm van de PoC, uitwijken van hier. */
  function tekenToestellen(c, lijst, kleuren) {
    if (!lijst.length) return [];
    c.save();
    c.font = MC.font + mono;
    c.textBaseline = 'middle';
    c.textAlign = 'left';

    const zichtbaar = lijst.filter((g) => g.visible);
    const plekken = plaatsLabels(c, zichtbaar);

    for (let k = 0; k < zichtbaar.length; k++) {
      const g = zichtbaar[k], plek = plekken[k];
      const r = g.primary ? MC.rPrim : MC.rTweede;
      const alfa = g.primary ? MC.aPrim : MC.aTweede;

      c.globalAlpha = alfa;
      c.strokeStyle = c.fillStyle = g.arcjet ? kleuren.arcjet : kleuren.goes;
      c.lineWidth = MC.lijn;

      // HOL ALS HIJ NAAST HET VLAK STAAT: een omtrek in plaats van een vulling.
      c.beginPath(); c.arc(g.x, g.y, r, 0, Math.PI * 2);
      if (g.offPlane) c.stroke(); else c.fill();

      // De arcjet-ring: de stuurmotor stond aan en de magnetometer mat hem mee.
      if (g.arcjet) {
        c.globalAlpha = MC.ringAlpha;
        c.beginPath(); c.arc(g.x, g.y, r + MC.ringExtra, 0, Math.PI * 2); c.stroke();
        c.globalAlpha = alfa;
      }

      /* De haarlijn naar een uitgeweken label. Zonder deze staat er een tekst
         onder een stip die er niet bij hoort, en dat is erger dan twee labels
         over elkaar: dan lees je een verkeerd getal bij een toestel in plaats
         van geen getal. */
      if (plek.week) {
        c.globalAlpha = alfa * 0.45;
        c.beginPath();
        c.moveTo(g.x + r + 1, g.y);
        c.lineTo(plek.x - 2, plek.y);
        c.lineWidth = 0.8;
        c.stroke();
        c.globalAlpha = alfa;
        c.lineWidth = MC.lijn;
      }

      c.fillText(plek.tekst, plek.x, plek.y);
    }
    c.restore();
    return plekken;
  }

  function wis() {
    if (canvas.width) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  /* Een LOKAAL punt van de grensvlakgroep naar schermpixels. Diezelfde weg als
     magnetosphere-scale.js: de groep draagt de framerotatie, dus localToWorld
     doet de rest en er wordt hier over frames niets gerekend.

     De NDC-diepte gaat mee terug. Die is onder BEIDE projecties monotoon in de
     afstand tot de camera, en daarop rust de occlusietoets hieronder. */
  function naarScherm(v, w, h, uit) {
    _p.copy(v);
    boundary.group.localToWorld(_p);
    _p.project(world.camera());
    uit.x = (_p.x * 0.5 + 0.5) * w;
    uit.y = (-_p.y * 0.5 + 0.5) * h;
    uit.z = _p.z;
    return uit;
  }

  /* ------------------------------------------------------------
     VALT DIT PUNT ACHTER DE AARDE, GEMETEN OP HET SCHERM?

     De PoC toetst dit in wereldruimte, met de kortste afstand van de kijklijn
     `camera -> punt` tot de oorsprong (terra.html, behindEarth). Dat klopt
     onder een PERSPECTIEFcamera, waar elke kijklijn uit één punt vertrekt.
     Onder de orthografische camera van de doorsneden vertrekken ze allemaal
     evenwijdig, en dan bestaat die lijn niet. Ook `occludedByGlobe()` uit
     js/core/label-sprite.js gaat van een perspectiefcamera uit.

     Op het SCHERM verdwijnt dat onderscheid. De aarde is daar een schijf, en
     de vraag is of het punt erbinnen valt EN erachter ligt:

       verborgen  <=>  |marker - midden| < straal   en   zMarker > zMidden

     De straal komt uit een tweede projectie: de oorsprong plus de camera-as
     naar rechts, maal één aardstraal. Dat is de schijf zoals hij werkelijk
     getekend staat, in welke projectie dan ook — één formule voor drie
     standen, in plaats van een aanname per stand. Dezelfde les als bij
     `gl_PointSize` in wind-layer.js. */
  function aardschijf(w, h) {
    // Het middelpunt: de aarde staat op de WERELDoorsprong, en naarScherm wil
    // een lokaal punt van de grensvlakgroep.
    _o.set(0, 0, 0);
    boundary.group.worldToLocal(_o);
    naarScherm(_o, w, h, _mid);

    /* En een punt op de rand van de schijf: de wereldoorsprong plus de as van
       de camera naar rechts, maal één aardstraal. Die as is kolom 0 van zijn
       wereldmatrix, en hij staat per definitie loodrecht op de kijkrichting —
       dus dit is de rand zoals hij werkelijk getekend staat, onder welke
       projectie dan ook. */
    const m = world.camera().matrixWorld.elements;
    _r.set(m[0], m[1], m[2]).normalize().multiplyScalar(RE);
    boundary.group.worldToLocal(_r);
    naarScherm(_r, w, h, _rand);

    return { x: _mid.x, y: _mid.y, z: _mid.z,
             r: Math.hypot(_rand.x - _mid.x, _rand.y - _mid.y) };
  }

  /* WAT ER TE TEKENEN VALT, uitgerekend uit de feed en het frame.

     Dit is de tegenhanger van `craftScreen` in de PoC, met één verschil: daar
     staat de projectie erin, hier niet. De projectie verandert bij elke
     muisbeweging en de POSITIE alleen bij een nieuw moment — dus wordt dit
     gescheiden, net als bij de schaal. `update` bij een herbouw, `tick` per
     frame.

     `basis` en `coeff` komen uit `gsmAssen()`, dus er wordt hier geen tweede
     keer IGRF geëvalueerd voor iets wat de state al heeft. */
  function update(lijst, tijd, basis, coeff) {
    toestellen = [];
    if (!Array.isArray(lijst) || !lijst.length || !basis) {
      handtekening = '';
      return (laatsteBron = { toestellen: 0, gemeten: 0 });
    }

    let gemeten = 0;
    for (let i = 0; i < lijst.length; i++) {
      const craft = lijst[i];
      if (!Number.isFinite(craft.longitude)) continue;

      /* Een vaste LENGTEGRAAD op 6,62 Re is een aardvaste positie; GSM draait
         daar elk uur onderuit. De basis die hem draait is dezelfde die de
         aarde en de veldlijnen draait — één plaats waar geroteerd wordt. */
      const geo = Core.geoPoint(0, craft.longitude, Core.CONST.GEOSTATIONARY_RE);
      const gsm = Core.Frames.toGsm(geo, basis);

      /* De externe restterm, en langs dezelfde functie als de uitlezing:
         gemeten min het interne veld op die plek. Ontbreekt de rij of de
         component, dan blijft dit null en valt het getal uit het label. */
      let ext = null, ouderdom = null;
      const rij = Data.Goes.at(craft, tijd, TOL_MS);
      if (rij && coeff) {
        const rest = Core.Goes.residual(rij, craft.longitude, coeff);
        if (Number.isFinite(rest.Hp)) {
          ext = rest.Hp; gemeten++;
          // De afstand tot het moment dat de scene toont, niet tot de wandklok:
          // op een teruggezette tijdlijn is dat een heel ander getal.
          ouderdom = tijd - rij.time;
        }
      }

      toestellen.push({
        satellite: craft.satellite,
        // Lokaal in de grensvlakgroep: de PoC-permutatie, maal de schaal.
        lokaal: toTerra(THREE, gsm, new THREE.Vector3()).multiplyScalar(RE),
        // De twee componenten die uit een tekenvlak kunnen wijzen, in Re.
        uitMeridian: gsm.y,
        uitTop: gsm.z,
        ext, ouderdom,
        arcjet: !!(rij && rij.arcjet),
        // Het eerste toestel is de primaire en krijgt de vollere inkt.
        primary: i === 0
      });
    }

    // De projectie is niet veranderd maar de INHOUD wel: opnieuw tekenen.
    handtekening = '';
    return (laatsteBron = { toestellen: toestellen.length, gemeten,
      // De leeftijd per sample, in seconden. Zonder dit is niet te toetsen of
      // de ruimere tolerantie werkelijk iets binnenhaalt dat er eerst uit viel.
      ouderdomS: toestellen.map((t) => Number.isFinite(t.ouderdom)
        ? Math.round(t.ouderdom / 1000) : null),
      tolS: Math.round(TOL_MS / 1000) });
  }

  /* De handtekening: twee geprojecteerde ijkpunten. Beweegt de camera, dan
     bewegen ze; staat alles stil, dan kost dit twee matrixvermenigvuldigingen
     en verder niets. De inhoud zit er niet in — `update` wist hem zelf. */
  function maakHandtekening(w, h) {
    if (!toestellen.length) return '';
    const a = naarScherm(toestellen[0].lokaal, w, h, _mid);
    return [vlak || '-', w, h, vervaging.toFixed(2),
            a.x.toFixed(1), a.y.toFixed(1), a.z.toFixed(4)].join('|');
  }

  function teken(force) {
    const doos = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(doos.width), h = Math.round(doos.height);
    if (!zichtbaar || !toestellen.length || !(w > 0) || !(h > 0) || vervaging <= 0.01) {
      wis(); handtekening = ''; laatsteTekening = null; return null;
    }

    const hs = maakHandtekening(w, h);
    if (!force && hs === handtekening && canvas.width === Math.round(w * dpr)) return null;
    handtekening = hs;

    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    /* EEN CANVAS DAT VAN FORMAAT VERANDERT WIST ZIJN HELE CONTEXTTOESTAND —
       transform, font, alles. Vandaar dat de transform hier ná de maat staat en
       niet één keer bij het opzetten. Dezelfde val als bij de schaal. */
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const schijf = aardschijf(w, h);
    const lijst = [];
    let verborgen = 0, hol = 0;

    for (const t of toestellen) {
      naarScherm(t.lokaal, w, h, _punt);

      /* De component uit HET VLAK DAT ER NU IS. In de vrije stand is er geen,
         en dan is er ook niets over een projectie te zeggen. */
      const offset = vlak === 'meridian' ? t.uitMeridian
                   : vlak === 'top'      ? t.uitTop : 0;
      const offPlane = !!vlak && Math.abs(offset) > MCRAFT_UIT_VLAK_RE;
      if (offPlane) hol++;

      const achterAarde = Math.hypot(_punt.x - schijf.x, _punt.y - schijf.y) < schijf.r
                       && _punt.z > schijf.z;
      if (achterAarde) verborgen++;

      lijst.push({
        satellite: t.satellite, x: _punt.x, y: _punt.y,
        ext: t.ext, ouderdom: t.ouderdom, arcjet: t.arcjet, primary: t.primary,
        offPlane, offset, offAxis: vlak === 'top' ? 'z' : 'y',
        visible: !achterAarde
              && _punt.z > -1 && _punt.z < 1
              && _punt.x > -MCRAFT_MARGE.x && _punt.x < w + MCRAFT_MARGE.x
              && _punt.y > -MCRAFT_MARGE.y && _punt.y < h + MCRAFT_MARGE.y
      });
    }

    /* DE VERVAGING GAAT OVER DE HELE TEKENING EN NIET PER STIP. De lus zet
       `globalAlpha` zelf per toestel — dat is het onderscheid tussen het
       primaire en het secundaire — dus een tweede alpha ernaast zou de eerste
       overschrijven. Een canvas dat als geheel doorschijnend wordt, is precies
       wat een kruisvervaging is. */
    canvas.style.opacity = vervaging < 1 ? String(vervaging) : '';

    const plekken = tekenToestellen(ctx, lijst, {
      goes: token('--msphere-goes', '#ffd166'),
      arcjet: token('--msphere-saa', '#d4564f')
    });

    laatsteTekening = { getekend: lijst.filter((g) => g.visible).length,
                        verborgen, hol, vlak, w, h, dpr,
                        aardschijfPx: +schijf.r.toFixed(2),
                        // De y/z-afwijking per toestel, zodat de hol-vlag te
                        // toetsen is tegen het getal waar hij uit volgt.
                        uitVlak: lijst.map((g) => +g.offset.toFixed(3)),
                        /* EN DE LABELS ZELF. Een ontbrekende meting hoort uit
                           het label te VALLEN en niet als nul te verschijnen,
                           en dat is alleen te toetsen als de tekst opvraagbaar
                           is — op een canvas valt er verder niets te lezen. */
                        labels: plekken.map((p) => p.tekst),
                        // Waar het label WERKELIJK staat, en of het moest wijken.
                        labelXY: plekken.map((p) => [Math.round(p.x), Math.round(p.y)]),
                        geweken: plekken.filter((p) => p.week).length,
                        /* HOEVEEL LABELPAREN ELKAAR NOG RAKEN. Nul is de eis, en
                           dit is de enige manier om hem te toetsen: op een
                           canvas valt er verder niets te lezen. */
                        botsingen: (() => {
                          let n = 0;
                          for (let i = 0; i < plekken.length; i++)
                            for (let j = i + 1; j < plekken.length; j++) {
                              const a = plekken[i], b = plekken[j];
                              if (a.x < b.x + b.breedte && b.x < a.x + a.breedte &&
                                  Math.abs(a.y - b.y) < MC_REGEL) n++;
                            }
                          return n;
                        })(),
                        xy: lijst.filter((g) => g.visible)
                                 .map((g) => [Math.round(g.x), Math.round(g.y)]) };
    return laatsteTekening;
  }

  return {
    update,
    /* Welk vlak, of null. Dezelfde vorm als grid.setPlane en scale.setPlane, en
       met opzet: wie hier een derde bron voor "welk vlak" maakt, krijgt een
       tekening die bij een andere doorsnede hoort. */
    setPlane(v) { vlak = v || null; handtekening = ''; },
    setVisible(aan) { zichtbaar = !!aan; handtekening = ''; if (!zichtbaar) wis(); },
    setFade(f) { vervaging = Math.max(0, Math.min(1, Number.isFinite(f) ? f : 1)); },
    /* Alles weg, en de gegevens erbij. Voor `exit()`: laat de lijst staan, en
       de eerste tik na een terugkeer tekent twee toestellen op een frame dat
       er niet meer is. */
    clear() { toestellen = []; handtekening = ''; laatsteBron = laatsteTekening = null; wis(); },
    tick: () => teken(false),
    redraw: () => teken(true),
    plane: () => vlak,
    colors: { goes: token('--msphere-goes', '#ffd166'),
              arcjet: token('--msphere-saa', '#d4564f') },
    stats: () => ({ bron: laatsteBron, tekening: laatsteTekening }),
    element: canvas
  };
}
