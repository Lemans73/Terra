/* ============================================================
   TERRA — De maat langs de assen van de magnetosfeer
   ------------------------------------------------------------
   Het Re-raster in de scene tekent lijnen en verder niets. Zijn
   eigen kop zegt waarom dat een probleem is: "een raster zonder
   eenheid is een decoratie" (de woorden van de PoC). Dit bestand
   zet er de getallen bij.

   WAAROM EEN TWEEDE CANVAS. Allebei de dingen die hier op het
   scherm komen dragen TEKST. Tekst in WebGL kost een texture per
   label en wordt wazig zodra hij niet op een hele pixel valt; op
   een 2D-canvas is het één `fillText`. De PoC tekent zijn overlay
   om precies die reden ook met canvas-2D.

   EN WAAROM DAT NIET DE OVERLAY VAN DE POC IS. `overlay.js` staat
   byte-identiek in js/compute/magnetosphere/, maar zijn hele
   plaatsbepaling gaat via `Core.Registration` — een eigen
   orthografische projectie die de PoC tot op 2,3e-13 px naast
   three.js legt. Terra heeft die toets niet, en twee projecties
   die uit elkaar lopen is precies de fout die dit project overal
   uitsluit. Dus gebruiken we van dat bestand alleen de PURE
   helpers (`ticks`, `label`) en laat three.js zelf projecteren:
   `Vector3.project(camera)` is per constructie dezelfde afbeelding
   als die de lijnen tekent, want het is dezelfde matrix.

   ALLEEN IN EEN VASTE STAND, en dat is de regel van de PoC. Een
   raster is een SCHAAL, en een perspectiefbeeld heeft er geen —
   daar is één pixel vooraan iets anders waard dan achteraan. In de
   vrije 3D-stand staat er dus geen raster en horen er ook geen
   getallen te staan.

   DE STAP IS DIE VAN HET RASTER EN WORDT NIET ZELF GEKOZEN. De PoC
   klikt zijn stap op de ladder 1-2-5 x 10^n zodat er ongeveer 90 px
   tussen twee labels valt. Dat is daar juist, want daar tekent
   dezelfde functie ook de lijnen. Hier niet: de lijnen komen uit
   grid-layer.js op een vaste stap van 10 Re, en een label op 20 zou
   dan naast een lijn staan die er niet is. Eén bron voor de plek,
   één voor de stap.
   ============================================================ */

/* Onder deze afstand tussen twee labels vallen ze weg. Niet omdat ze niet
   passen — het breedste getal meet ~22 px — maar omdat een schaal die je moet
   ontcijferen er geen is. Bij 34 px staat er tussen twee getallen nog een
   spatie van een halve tekenbreedte. */
const MSCALE_MIN_PX = 34;

/* De rand waarbinnen niets getekend wordt, als BEGINWAARDE. Boven en onder
   worden ze door de aanroeper gemeten: daar staat permanent chroom — de
   masthead met de wereldklok, en de tijdlijn met zijn bediening — en een getal
   dat daarachter valt is een getal dat er niet is. GEMETEN op 1300x881 vóór de
   correctie: de kopregel viel op 56 px, dwars over de klok, en de onderste rij
   op 867, achter de afspeelknoppen.

   Links en rechts blijven vast, en met opzet. Daar staan PANELEN, en die komen
   en gaan; een schaal die opzij springt zodra je een paneel opent, is een schaal
   die beweegt terwijl het beeld stilstaat. */
const MSCALE_INSET = { top: 46, right: 14, bottom: 26, left: 14 };

export function createMagnetosphereScale(THREE, opts) {
  const { canvas, world, boundary, grid, RE, Overlay, insets } = opts;
  if (!canvas || !grid || !boundary) return null;

  const ctx = canvas.getContext('2d');
  const _p = new THREE.Vector3();

  let vlak = null;          // 'meridian' | 'top' | null
  let handtekening = '';    // camerastand + maat; hertekenen alleen als die wijzigt
  let vervaging = 1;

  const mono = getComputedStyle(document.documentElement)
    .getPropertyValue('--mono').trim() ||
    'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  /* Een punt in het VLAK van het raster naar schermpixels. `langs` is de
     zonlijn, `dwars` de andere as — dezelfde twee die grid-layer gebruikt, via
     dezelfde omzetting. De groep draagt de framerotatie, dus localToWorld doet
     de rest; er wordt hier niets over frames gerekend. */
  function naarScherm(langs, dwars, w, h) {
    grid.toLocal(vlak, langs, dwars, _p);
    boundary.group.localToWorld(_p);
    _p.project(world.camera());
    return { x: (_p.x * 0.5 + 0.5) * w, y: (-_p.y * 0.5 + 0.5) * h,
             achter: _p.z > 1 };
  }

  function wis() {
    if (canvas.width) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  /* Wat er verandert als de camera beweegt: de projectie. Twee ijkpunten zijn
     genoeg om dat te merken, en ze kosten samen twee matrixvermenigvuldigingen —
     goedkoper dan het hertekenen dat we ermee vermijden. */
  function maakHandtekening(w, h) {
    if (!vlak) return '';
    const a = naarScherm(0, 0, w, h), b = naarScherm(10, 0, w, h);
    const ins = insets ? insets() : null;
    return [vlak, w, h, vervaging.toFixed(2),
            a.x.toFixed(1), a.y.toFixed(1), b.x.toFixed(1), b.y.toFixed(1),
            // Zonder dit blijft een verschoven chroom staan tot de camera beweegt.
            ins ? Math.round(ins.top) + ',' + Math.round(ins.bottom) : '-'].join('|');
  }

  function teken(force) {
    const doos = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(doos.width), h = Math.round(doos.height);
    if (!vlak || !(w > 0) || !(h > 0) || vervaging <= 0.01) { wis(); return null; }

    const hs = maakHandtekening(w, h);
    if (!force && hs === handtekening && canvas.width === Math.round(w * dpr)) return null;
    handtekening = hs;

    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    /* EEN CANVAS DAT VAN FORMAAT VERANDERT WIST ZIJN HELE CONTEXTTOESTAND — de
       transform, de font, alles. Vandaar dat beide hier ná de maat staan en niet
       één keer bij het opzetten; dat kostte in sessie 26 al een ronde. */
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '10px ' + mono;
    ctx.textBaseline = 'alphabetic';

    const cs = getComputedStyle(document.documentElement);
    const inkt = cs.getPropertyValue('--ink-faint').trim() || '#525d72';
    const inktAs = cs.getPropertyValue('--ink-dim').trim() || '#7d8aa0';
    ctx.globalAlpha = vervaging;

    const S = grid.stepRe, R = grid.range;
    const ins = { ...MSCALE_INSET, ...(insets ? insets() : null) };
    const links = ins.left, rechts = w - ins.right;
    const boven = ins.top, onder = h - ins.bottom;
    if (onder <= boven || rechts <= links) { return null; }

    let gezet = 0, overgeslagen = 0;

    /* De getallen langs de ZONLIJN, onderaan. `ticks` komt uit de POC en is daar
       los getoetst: een off-by-one hier is een schaal die één waarde mist, en dat
       valt op geen enkele schermafdruk op. */
    ctx.textAlign = 'center';
    let vorigeX = -Infinity;
    for (const v of Overlay.ticks(R.langsVan, R.langsTot, S)) {
      const p = naarScherm(v, 0, w, h);
      if (p.achter || p.x < links || p.x > rechts) { continue; }
      if (Math.abs(p.x - vorigeX) < MSCALE_MIN_PX) { overgeslagen++; continue; }
      vorigeX = p.x;
      ctx.fillStyle = Math.abs(v) < 1e-9 ? inktAs : inkt;
      ctx.fillText(Overlay.label(v), p.x, onder + 12);
      gezet++;
    }

    /* En dwars erop, links. NUL KRIJGT HIER GEEN LABEL: dat zou pal op de
       nul van de zonlijn vallen, en twee schalen die elkaar overschrijven leest
       als één schaal die niet klopt. Ook dit is de POC's keuze. */
    ctx.textAlign = 'left';
    let vorigeY = -Infinity;
    for (const v of Overlay.ticks(-R.dwars, R.dwars, S)) {
      if (Math.abs(v) < 1e-9) continue;
      const p = naarScherm(0, v, w, h);
      if (p.achter || p.y < boven || p.y > onder) continue;
      if (Math.abs(p.y - vorigeY) < MSCALE_MIN_PX * 0.6) { overgeslagen++; continue; }
      vorigeY = p.y;
      ctx.fillStyle = inkt;
      ctx.fillText(Overlay.label(v), links, p.y - 3);
      gezet++;
    }

    /* De maat zelf. Een raster zonder eenheid is een decoratie, en px/Re is het
       getal waarmee iemand deze tekening kan natrekken — precies de regel die de
       POC bovenaan zijn raster zet. Gemeten en niet aangenomen: het is de
       schermafstand tussen twee punten die tien Re uit elkaar liggen. */
    const a = naarScherm(0, 0, w, h), b = naarScherm(S, 0, w, h);
    const pxPerRe = Math.hypot(b.x - a.x, b.y - a.y) / S;
    ctx.fillStyle = inkt;
    ctx.textAlign = 'left';
    ctx.fillText('Re, GSM ' + (vlak === 'top' ? 'X-Y' : 'X-Z') +
                 '  ·  ' + pxPerRe.toFixed(2) + ' px/Re', links, boven + 10);
    ctx.globalAlpha = 1;

    return { vlak, gezet, overgeslagen, pxPerRe: +pxPerRe.toFixed(3), w, h, dpr };
  }

  return {
    /* Welk vlak, of null. Dezelfde aanroep als grid.setPlane en met opzet
       dezelfde vorm: wie hier een derde bron voor "welk vlak" maakt, krijgt een
       schaal die bij een ander raster hoort. */
    setPlane(v) { vlak = v || null; handtekening = ''; if (!vlak) wis(); },
    /* De kruisvervaging van een standwissel, net als bij het raster zelf. */
    setFade(f) { vervaging = Math.max(0, Math.min(1, Number.isFinite(f) ? f : 1)); },
    tick: () => teken(false),
    redraw: () => teken(true),
    plane: () => vlak,
    fade: () => vervaging,
    element: canvas
  };
}
