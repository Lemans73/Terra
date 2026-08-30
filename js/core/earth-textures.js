/* ============================================================
   TERRA — Earth textures · loading, swapping and owning them
   ------------------------------------------------------------
   Everything about how the earth gets its pixels: the quality
   level, the five maps behind it, the swap between sets, and the
   visitor's own day/night upload. One place, because these all
   read and write the same five uniforms — split over two files
   they would need a third to keep them in step.

   WHAT THIS MODULE OWNS
     texQuality          which set is active, and what is stored
     customTex           the visitor's own day and night map
     cloudsTexture       shared with the floating cloud shell
     the #texq and #ctex panel rows, including their notes

   WHAT IT DOES NOT OWN: the material itself. index.html holds
   `shaderMaterial`, because applyGlobeMode() decides when the
   earth is built at all and this module is only asked for the
   parts. It reaches it through `getMaterial`.

   THE THREE HOOKS ARE GETTERS AND NOT VALUES, and that is the
   ORDER. This factory runs BEFORE the globe is constructed — the
   star background reads texQuality the moment the globe is
   built, so the quality has to be known first. A value passed in
   here would be in the temporal dead zone; a getter is only
   called later, when everything exists. Same trap as the tuning
   panel's `getEarthMaterial`.

   THREE COMES IN AS A PARAMETER and is not imported. globe.gl is
   loaded with ?external=three so the app has exactly one three
   instance, and an import here would be a second route to it.
   ============================================================ */

import { TEXTURE_SETS, DEFAULT_QUALITY, assetsFor, textureSetSize, imageryMeta, PARAMS } from '../config.js';
import { dayNightShader } from '../shaders.js';
import { Prefs } from './prefs.js';

export function createEarthTextures(THREE, opts = {}) {
  const getWorld = opts.getWorld;
  const getMaterial = opts.getMaterial;
  const onLayerStatus = opts.onLayerStatus;
  /* De trapwissel melden aan de app. Alleen `tiles` doet daar iets mee — de
     tegelschil aan of uit — maar de module weet niets van die schil en hoort dat
     ook niet te weten. */
  const onImagery = opts.onImagery;
  if (!getWorld || !getMaterial || !onLayerStatus) {
    throw new Error('createEarthTextures: getWorld, getMaterial en onLayerStatus zijn verplicht');
  }

  /* DE TRAP EN DE TEXTUURSET ZIJN NIET HETZELFDE, en dat onderscheid draagt de
     hele sectie Imagery & data.

       trap `2k`      wereldkaart van 2048 px          set 2k
       trap `8k`      wereldkaart van 8192 px          set 8k
       trap `tiles`   satellietbeeld uit de tegelschil set 2k

     Bij `tiles` komt de DAGKAART uit de tegels; wat er dan nog uit een
     wereldtextuur komt zijn de vier hulpkaarten — nacht, wolken, specular en
     reliëf — en die hebben op 2K genoeg. Vandaar dat de zwaarste trap de KLEINE
     set laadt, wat op het eerste gezicht omgekeerd lijkt.

     ÉÉN BEWAARDE WAARDE, want twee zouden uit elkaar kunnen lopen. `texQuality`
     hieronder is afgeleid en wordt nooit apart opgeslagen.

     LET OP: dit moet vóór de globe staan — de sterrenachtergrond leest de set
     meteen bij het bouwen. */
  const IMAGERY_TRAPPEN = ['2k', '8k', 'tiles'];
  const setVoorTrap = (t) => (t === 'tiles' ? DEFAULT_QUALITY : t);

  let imagery = (() => {
    const bewaard = Prefs.get('pref.texQuality');
    return IMAGERY_TRAPPEN.includes(bewaard) ? bewaard : DEFAULT_QUALITY;
  })();
  let texQuality = setVoorTrap(imagery);

  // ---- Eigen texturen -------------------------------------------------------
  //
  // Alleen de DAG- en NACHTkaart zijn te vervangen. De normal map en de specular
  // map blijven van ons, en dat is een bewuste beperking met een prijs: die twee
  // horen bij ónze aarde, dus bij een eigen kaart klopt het reliëf en het
  // watermasker alleen als die kaart dezelfde equirectangulaire projectie en
  // dezelfde kustlijnen heeft. Bij een echte aardtextuur is dat zo; bij een
  // fantasiekaart glinstert het water op de verkeerde plek. Dat staat zo in de
  // uitleg bij de knoppen.
  //
  // GEEN PERSISTENTIE, en dat is een keuze. Een blob-URL overleeft een herlaadbeurt
  // niet, en de bestanden in localStorage bewaren zou megabytes aan dataURL kosten
  // op een quotum van ongeveer 5 MB. IndexedDB zou het kunnen, maar juist in de
  // standalone — waar dit het meeste nut heeft — draait de app onder `file:` en is
  // die opslag vaak afgeschermd. Eén sessie is eerlijker dan iets dat soms werkt.
  const customTex = { day: null, night: null };   // { url, naam, bytes } of null

  /* Eén plek die bepaalt welke dagtextuur geldt: een eigen kaart wint van die van
     de set. Tot sessie 41 stond er een derde mogelijkheid tussen — de
     `bathyDay`-variant achter de schakelaar `Ocean floor`. Die is vervallen omdat
     de nieuwe dagtexturen altijd bathymetrie hebben; er viel niets meer te kiezen. */
  function dayUrlFor(quality) {
    if (customTex.day) return customTex.day.url;
    return assetsFor(quality).day;
  }

  // Idem voor de nachtzijde. Bestond nog niet omdat er tot nu toe niets te kiezen
  // viel; nu er wél iets te kiezen valt, hoort het langs dezelfde ene plek te gaan.
  function nightUrlFor(quality) {
    if (customTex.night) return customTex.night.url;
    return assetsFor(quality).night;
  }

  /* The shared cloud texture. The floating cloud shell in index.html checks
     cloudsTexture() to see whether there is one; the shell itself then takes the
     UNIFORM reference, so a quality swap lands there on its own. */
  let cloudsTexture = null;

  /* The set the visitor actually chose, parked until the earth exists. Read and
     cleared by upgradeIfNeeded(); null means the stored quality is what runs. */
  let wachtendeUpgrade = null;

  function buildRealisticMaterial() {
    const loader = new THREE.TextureLoader();
    // Expliciet, ook al is dit three's eigen standaard. Zodra ASSET_BASE naar een CDN
    // wijst (de standalone-variant) is deze vlag het verschil tussen een aarde en een
    // zwarte bol: zonder CORS-toestemming laadt het plaatje wel, maar raakt het canvas
    // tainted en weigert WebGL het als texture. Gemeten op 2026-08-01.
    loader.setCrossOrigin('anonymous');
    const load = url => loader.loadAsync ? loader.loadAsync(url) : new Promise(res => loader.load(url, res));

    /* EEN MISLUKTE TEXTUUR MAG DE AARDE NIET ZWART LATEN (session 42, Terry).

       Wat er gebeurde: `day` en `night` hadden geen catch en de keten hierna geen
       enkele, dus een enkel plaatje dat niet binnenkwam gooide een UNHANDLED
       rejection. `shaderMaterial` bleef daardoor null — een zwarte bol — en elke
       weg terug was dicht, want setTextureQuality() en de eigen-textuurknop
       beginnen allebei met `if (!shaderMaterial) return`. De bezoeker kon dus niet
       eens naar 2K terug om zich eruit te redden.

       Op de productie-host gebeurde dat met de 8K-set: 29,7 MB, en de console gaf
       ERR_HTTP2_PING_FAILED op twee bestanden. Lokaal viel het nooit op omdat de
       schijf niet faalt.

       DE HERSTELWEG IS DE KLEINERE SET. Lukt de gevraagde set niet, dan die van
       DEFAULT_QUALITY; lukt die ook niet, dan `null` en valt de aanroeper terug op
       de schematische kaart. De bewaarde VOORKEUR blijft staan: een haperende
       verbinding is geen keuze van de bezoeker, en de volgende keer kan het weer
       gewoon lukken. Wat er wél gebeurt is dat het paneel het zegt. */
    const laadSet = (q) => {
      const A = assetsFor(q);
      return Promise.all([
        load(dayUrlFor(q)),
        load(nightUrlFor(q)),
        load(A.clouds).catch(() => null),
        load(A.specular).catch(() => null),
        load(A.normal).catch(() => null)
      ]);
    };
    /* THE EARTH IS ALWAYS BUILT WITH THE SMALL SET, whatever quality is stored,
       and the heavier one slides in afterwards through upgradeIfNeeded().

       WHY, MEASURED on this machine against a 5 ms baseline render: uploading an
       8K map to the GPU costs 765 ms and a 2K map 47 ms. The full 8K set is
       therefore 3.8 seconds in which the page answers nothing — and the loading
       screen waits for all of it before the earth appears. Starting small turns
       that into 235 ms, after which there is an earth to look at.

       IT IS ALSO THE RECOVERY PATH. The requested set failing used to be caught
       here with a retry on the smaller one; now the small set IS the first
       attempt, so a failing 8K leaves a working earth behind instead of a black
       ball. Only the small set failing is fatal, and then the caller falls back
       to the schematic map. */
    if (texQuality !== DEFAULT_QUALITY) {
      wachtendeUpgrade = texQuality;
      texQuality = DEFAULT_QUALITY;
    }
    return laadSet(DEFAULT_QUALITY)
      .catch(() => null)
      .then((texturen) => {
        // Mislukt: de aanroeper ziet `null` en valt terug op de kaart.
        if (!texturen) return null;
        return texturen;
      })
      .then((texturen) => {
      if (!texturen) return null;
      const [dayTex, nightTex, cloudsTex, specTex, normalTex] = texturen;
      // rapporteer welke lagen succesvol geladen zijn voor de UI-indicatie
      onLayerStatus({
        day: !!dayTex, night: !!nightTex, clouds: !!cloudsTex,
        specular: !!specTex, normal: !!normalTex
      });
      // color-textures naar sRGB zodat ze niet uitgewassen ogen in recente three.
      // normal/specular zijn data-maps → laat die lineair (geen sRGB).
      // wolken horizontaal kunnen herhalen zodat ze naadloos kunnen driften
      if (cloudsTex) cloudsTex.wrapS = THREE.RepeatWrapping;
      cloudsTexture = cloudsTex; // bewaren voor de zwevende wolkenschil
      [dayTex, nightTex, cloudsTex].forEach(t => {
        if (t && 'colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
        else if (t && 'encoding' in t && THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
      });
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          dayTexture:   { value: dayTex },
          nightTexture: { value: nightTex },
          cloudsTexture:   { value: cloudsTex || dayTex },
          specularTexture: { value: specTex || dayTex },
          normalTexture:   { value: normalTex || dayTex },
          hasClouds:   { value: cloudsTex ? 1 : 0 },
          hasSpecular: { value: specTex ? 1 : 0 },
          hasNormal:   { value: normalTex ? 1 : 0 },
          dayEnabled:   { value: 1 },
          dayNightCycle: { value: 1 },
          /* UIT HET REGISTER EN NIET UIT EEN LITERAL (sessie 35). Dit materiaal
             wordt in een `.then()` gebouwd, ná het laden van vijf texturen, en dus
             ruim ná het blok dat de bewaarde voorkeuren toepast. Een vaste 0,12
             hier overschreef daarom stilletjes de stand die de bezoeker had
             gekozen: de schuif zei 20 %, de scene toonde 12. */
          nightBrightness: { value: Prefs.get('pref.nightGlow') / 100 },
          /* UIT PARAMS EN NIET UIT EEN LITERAL (sessie 40), om dezelfde reden als
             `nightBrightness` hierboven: dit materiaal wordt in een `.then()`
             gebouwd, dus een vast getal hier overschrijft stil wat er elders is
             gezet. Zie de noot bij `reliefStrength` in js/config.js voor wat
             deze drie doen. */
          normalStrength: { value: PARAMS.normalStrength },
          reliefStrength: { value: PARAMS.reliefStrength },
          /* De helderheid van de dagkaart, uit PARAMS om dezelfde reden als de
             regels erboven: dit materiaal wordt in een `.then()` gebouwd. Zie de
             noot bij `dayGain` in js/shaders.js voor waarom dit een
             vermenigvuldiging is en `dayLift` een optelling. */
          dayGain:        { value: PARAMS.dayGain },
          dayLift:        { value: PARAMS.dayLift },
          dayGamma:       { value: PARAMS.dayGamma },
          dayKnee:        { value: PARAMS.dayKnee },
          macroAmbient:   { value: PARAMS.macroAmbient },
          macroSun:       { value: PARAMS.macroSun },
          glintStrength:  { value: PARAMS.glintStrength }, // sterkte zonneglinster
          waterRipple:    { value: PARAMS.waterRipple },
          cloudDrift:    { value: 0 },     // horizontale wolken-offset (drift)
          cloudShadow:   { value: PARAMS.cloudShadow }, // sterkte wolk-schaduw op oppervlak
          // De fade op wolken EN wolkenschaduw. Hier is de bron; de wolkenschil pakt
          // dezelfde referenties over, zodat de tik ze op één plek bijwerkt en schil en
          // schaduw per constructie nooit uit elkaar kunnen lopen.
          cloudFadeNear: { value: 0 },
          cloudFadeFar:  { value: 1 },
          cloudFadeGate: { value: 0 },
          time:          { value: 0 },
          sunPosition:   { value: new THREE.Vector2() },
          globeRotation: { value: new THREE.Vector2() },
          // Zonsverduistering. `moonPosition` is [lng, lat] van het sublunaire punt,
          // net als sunPosition, zodat hij dezelfde omzetting en camera-rotatie
          // ondergaat. De afstanden zijn echte kilometers.
          moonPosition:   { value: new THREE.Vector2() },
          sunDistanceKm:  { value: 149597870.7 },
          moonDistanceKm: { value: 384400 },
          eclipseEnabled: { value: 0 },
          atmosphereDayColor:      { value: new THREE.Color('#6bb3ff') },
          atmosphereTwilightColor: { value: new THREE.Color('#ff6b3d') }
        },
        vertexShader: dayNightShader.vertexShader,
        fragmentShader: dayNightShader.fragmentShader
      });
      return mat;
    });
  }

  // ---- Textuurkwaliteit (2K standaard ⇄ 8K op verzoek) ----
  // Het materiaal wordt NIET opnieuw gebouwd: we vervangen alleen de waarden in de
  // bestaande uniforms. De zwevende wolkenschil deelt diezelfde uniform-referenties
  // (zie buildCloudShell) en synct daardoor vanzelf mee.
  const texqNote = document.getElementById('texq-note');
  const texqBtns = [...document.querySelectorAll('.texq-opt')];
  /* DE GROOTTES KOMEN UIT `textureSetSize()` EN NIET UIT DE MARKUP (sessie 41).
     Ze stonden er als "~2.5 MB" en "~31 MB" bij, en die getallen liepen achter
     zodra een set veranderde — precies wat er deze sessie gebeurde: de 2K-set
     ging naar 4,6 MB en de markup bleef 2,5 zeggen. Een cijfer dat over iemands
     eigen download gaat, hoort niet op twee plekken te staan. `imageryMeta()` in
     js/config.js maakt de hele regel, inclusief het onderscheid tussen `once` en
     `per visit`. */
  const TEXQ_NOTE_IDLE = 'Satellite fetches imagery while you look, and lets you zoom in further.';

  /* DE ACTIEVE KNOP VOLGT DE TRAP EN NIET DE SET. Die twee lopen bij `tiles`
     uiteen: daar draait de 2K-set, en zou de knop op Standard springen terwijl de
     bezoeker Satellite koos. */
  function updateTexqUI() {
    texqBtns.forEach(b => b.classList.toggle('active', b.dataset.q === imagery));
    document.querySelectorAll('[data-texq-size]').forEach(el => {
      el.textContent = imageryMeta(el.dataset.texqSize);
    });
  }

  /* Welke set NIET geladen kon worden, of null. Gezet door
     buildRealisticMaterial() wanneer die op DEFAULT_QUALITY moest terugvallen; het
     paneel leest hem zodat de bezoeker niet hoeft te raden waarom hij 2K ziet
     terwijl er 8K staat ingesteld. */
  let texQualityFallback = null;

  function meldTexqTerugval() {
    if (!texQualityFallback) return;
    const naam = (TEXTURE_SETS[texQualityFallback] || {}).label || texQualityFallback;
    if (texqNote) {
      texqNote.textContent = naam + ' could not be loaded — ' +
        (TEXTURE_SETS[DEFAULT_QUALITY] || {}).label + ' is active. Try again to retry.';
    }
    if (typeof updateTexqUI === 'function') updateTexqUI();
  }

  /* WAIT FOR A FRAME, BUT NEVER HANG. rAF does not fire in a hidden tab, and
     then the swap loop below would stall forever with half the maps replaced —
     a half-8K, half-2K earth. The timer is the safety net: that one does fire. */
  const volgendFrame = () => new Promise((res) => {
    let klaar = false;
    const af = () => { if (!klaar) { klaar = true; res(); } };
    requestAnimationFrame(af);
    setTimeout(af, 250);
  });

  let texqBusy = false;
  /* WISSELT EEN TRAP, NIET EEN TEXTUURSET. Vaak vallen die samen; bij `tiles`
     niet, want die deelt zijn set met `2k`. Dan is er niets te downloaden en
     verschuift alleen wat er getekend wordt — dat mag geen laadscherm opleveren. */
  async function setTextureQuality(q) {
    if (texqBusy || !IMAGERY_TRAPPEN.includes(q)) return;
    /* ER IS WERK ALS DE TRAP ÓF DE SET VERSCHILT, en niet alleen bij een andere
       trap. Bij het opstarten lopen die twee juist uiteen: de trap staat op de
       bewaarde keuze terwijl de kleine set draait, en dat is precies het moment
       waarop upgradeIfNeeded() de zwaardere set komt halen. Alleen op de trap
       toetsen liet die upgrade er stil uit vallen. */
    const doelSetVooraf = setVoorTrap(q);
    if (q === imagery && doelSetVooraf === texQuality) return;
    /* ZONDER SHADERMATERIAAL VALT ER NIETS TE WISSELEN, maar stil niets doen is
       wat de bezoeker opsloot: hij drukt op 2K om zich uit een zwarte bol te
       redden en er gebeurt niets. Nu zegt de knop tenminste waarom. */
    if (!getMaterial()) {
      if (texqNote) texqNote.textContent = 'The earth material is not built — reload the page.';
      return;
    }

    const doelSet = doelSetVooraf;

    /* Zelfde set: alleen de trap verschuift. Geen netwerk, geen knoppen op slot. */
    if (doelSet === texQuality) {
      imagery = q;
      texQualityFallback = null;
      Prefs.set('pref.texQuality', q);
      updateTexqUI();
      if (onImagery) onImagery(q);
      return;
    }

    texqBusy = true;
    texqBtns.forEach(b => b.disabled = true);
    texqNote.classList.add('busy');
    texqNote.textContent = 'Loading… fetching ' + textureSetSize(doelSet);

    const A = assetsFor(doelSet);
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');          // zie de toelichting bij de andere loader
    const load = url => loader.loadAsync(url);
    /* EEN HANGENDE VERBINDING MAG DE KNOPPEN NIET OPSLUITEN (session 42, Terry).

       Een afbeelding die niet aankomt geeft niet altijd een `error`: bij een
       gestrande HTTP/2-verbinding blijft de request minutenlang open en lost de
       promise nooit op. `texqBusy` bleef dan true en beide knoppen disabled — het
       paneel stond op "Loading… fetching 29,7 MB" met de tol, en er was geen weg
       terug. Deze race maakt daar een gewone mislukking van. Het onderliggende
       verzoek loopt door; alleen wacht de interface er niet meer op. */
    const OPHAALGRENS_MS = 90_000;
    let tolTimer = null;
    const metGrens = (p) => Promise.race([
      p,
      new Promise((_, af) => { tolTimer = setTimeout(() => af(new Error('timeout')), OPHAALGRENS_MS); })
    ]);
    try {
      const [day, night, clouds, spec, normal] = await metGrens(Promise.all([
        load(dayUrlFor(doelSet)), load(nightUrlFor(doelSet)),
        load(A.clouds).catch(() => null),
        load(A.specular).catch(() => null),
        load(A.normal).catch(() => null)
      ]));
      // kleurtexturen naar sRGB; normal/specular zijn datamaps en blijven lineair
      [day, night, clouds].forEach(t => { if (t) t.colorSpace = THREE.SRGBColorSpace; });
      if (clouds) clouds.wrapS = THREE.RepeatWrapping;

      const u = getMaterial().uniforms;
      const swap = (uniform, tex) => {
        if (!tex) return;
        const old = uniform.value;
        uniform.value = tex;
        // alleen weggooien als de oude textuur nergens anders meer hangt
        if (old && old !== tex && old.dispose) old.dispose();
      };
      /* ONE MAP PER FRAME, and that is the whole point of this loop.
         Setting a uniform costs nothing; the cost lands on the next render, when
         texSubImage2D pushes the pixels to the GPU. Swapping all five at once
         puts that in ONE render.

         MEASURED on this machine, against a 5 ms baseline render: an 8K map
         costs 765 ms to upload and a 2K map 47 ms — sixteen times apart, exactly
         their pixel ratio. Mipmaps make no measurable difference, and neither
         does decoding beforehand: the upload is the cost. So the full 8K set is
         3.8 seconds of frozen main thread in a single frame.

         Yielding between maps does not make it faster — it makes it INTERRUPTIBLE.
         Five stalls of 765 ms with a frame in between beats one of 3.8 s, because
         the page answers clicks and scrolls in between. */
      for (const [uniform, tex] of [[u.dayTexture, day], [u.nightTexture, night],
                                    [u.cloudsTexture, clouds], [u.specularTexture, spec],
                                    [u.normalTexture, normal]]) {
        swap(uniform, tex);
        await volgendFrame();
      }
      if (clouds) cloudsTexture = clouds;
      getWorld().backgroundImageUrl(A.stars);

      imagery = q;
      texQuality = doelSet;
      texQualityFallback = null;   // gelukt, dus de standing notice hoort weg
      Prefs.set('pref.texQuality', q);
      updateTexqUI();
      texqNote.textContent = A.label + ' actief.';
      if (onImagery) onImagery(q);
    } catch (e) {
      texqNote.textContent = e && e.message === 'timeout'
        ? 'Loading timed out — the previous textures remain active.'
        : 'Loading failed — the previous textures remain active.';
    } finally {
      clearTimeout(tolTimer);
      texqBusy = false;
      texqBtns.forEach(b => b.disabled = false);
      texqNote.classList.remove('busy');
      /* A STANDING FALLBACK NOTICE OUTLIVES THIS TIMER. The visitor asked for 8K
         and is looking at 2K; wiping that explanation after four seconds leaves
         them with a button that disagrees with what they chose and no reason
         why. Anything else fades, as it should. */
      setTimeout(() => {
        if (!texqBusy && !texQualityFallback) texqNote.textContent = TEXQ_NOTE_IDLE;
      }, 4000);
    }
  }

  texqBtns.forEach(b => b.addEventListener('click', () => setTextureQuality(b.dataset.q)));
  /* En de noot ook bij het opstarten uit dezelfde bron. Stond hij alleen in de
     markup, dan zou het getal daar opnieuw kunnen gaan afwijken. */
  if (texqNote) texqNote.textContent = TEXQ_NOTE_IDLE;
  updateTexqUI();

  // ---- Eigen texturen: kiezen, toepassen en weer weghalen --------------------
  // Zie de noot bij `customTex` bovenaan voor het waarom van alleen dag/nacht en
  // van het ontbreken van persistentie.
  const ctexFile = document.getElementById('ctex-file');
  const ctexResetBtn = document.getElementById('ctex-reset');
  const ctexNoteEl = document.getElementById('ctex-note');
  const CTEX_NOTE_IDLE = ctexNoteEl?.textContent.replace(/\s+/g, ' ').trim() || '';
  let ctexBusy = false;

  function ctexKort(naam) {
    // Lange bestandsnamen duwen de rij uit elkaar; de staart zegt meestal het meeste.
    return naam.length <= 22 ? naam : naam.slice(0, 10) + '…' + naam.slice(-10);
  }

  function updateCtexUI() {
    for (const slot of ['day', 'night']) {
      const gekozen = customTex[slot];
      const val = document.getElementById('ctex-' + slot + '-value');
      const clr = document.querySelector('.ctex-clear[data-clear="' + slot + '"]');
      if (val) {
        val.textContent = gekozen ? ctexKort(gekozen.naam) : 'default';
        val.classList.toggle('custom', !!gekozen);
        val.title = gekozen ? gekozen.naam + ' · ' + Math.round(gekozen.bytes / 1024) + ' KB' : '';
      }
      if (clr) clr.hidden = !gekozen;
    }
    const iets = !!(customTex.day || customTex.night);
    if (ctexResetBtn) ctexResetBtn.hidden = !iets;
    document.querySelectorAll('.ctex-pick').forEach(b => b.disabled = ctexBusy);
  }

  function ctexMelding(tekst) {
    if (!ctexNoteEl) return;
    ctexNoteEl.textContent = tekst;
    clearTimeout(ctexMelding._t);
    ctexMelding._t = setTimeout(() => { ctexNoteEl.textContent = CTEX_NOTE_IDLE; }, 7000);
  }

  // Zet één sleuf en laadt de bijbehorende uniform opnieuw. `bron` is null om terug
  // te vallen op onze eigen kaart.
  async function setCustomTexture(slot, bron) {
    if (!getMaterial()) return;
    ctexBusy = true; updateCtexUI();

    const vorige = customTex[slot];
    customTex[slot] = bron;
    const url = slot === 'day' ? dayUrlFor(texQuality) : nightUrlFor(texQuality);
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');   // zie de toelichting bij de andere loaders
    try {
      const tex = await loader.loadAsync(url);
      tex.colorSpace = THREE.SRGBColorSpace;  // kleurtextuur, geen datamap
      const u = getMaterial().uniforms;
      const doel = slot === 'day' ? u.dayTexture : u.nightTexture;
      const oud = doel.value;
      doel.value = tex;
      // De dagtextuur dient ook als terugval voor ontbrekende maps; alleen weggooien
      // als hij nergens anders meer aan hangt. Zelfde toets als bij de oceaanbodem.
      const nogInGebruik = [u.cloudsTexture, u.specularTexture, u.normalTexture, u.dayTexture, u.nightTexture]
        .some(sl => sl.value === oud);
      if (oud && oud !== tex && !nogInGebruik && oud.dispose) oud.dispose();

      // Pas hier de oude blob vrijgeven: eerder zou de loader hem nog nodig hebben.
      if (vorige && vorige.url.startsWith('blob:')) URL.revokeObjectURL(vorige.url);
      if (bron) {
        ctexMelding('Loaded ' + bron.naam + (bron.waarschuwing ? ' — ' + bron.waarschuwing : ''));
      } else {
        ctexMelding('Back to Terra\'s own ' + slot + ' map.');
      }
    } catch {
      // Terugdraaien: de vorige keuze blijft staan én zichtbaar.
      customTex[slot] = vorige;
      if (bron && bron.url.startsWith('blob:')) URL.revokeObjectURL(bron.url);
      ctexMelding('That image could not be loaded.');
    } finally {
      ctexBusy = false;
      updateCtexUI();
    }
  }

  // Meet de afmetingen vóór we hem als textuur aanbieden. Niet om te blokkeren —
  // iemand mag best een rare verhouding proberen — maar om te kunnen zeggen wat
  // eraan scheelt wanneer het er vreemd uitziet.
  function meetAfbeelding(url) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => res(null);
      img.src = url;
    });
  }

  document.querySelectorAll('.ctex-pick').forEach(btn => {
    btn.addEventListener('click', () => {
      ctexFile.dataset.slot = btn.dataset.pick;
      ctexFile.click();
    });
  });

  ctexFile?.addEventListener('change', async () => {
    const f = ctexFile.files[0];
    const slot = ctexFile.dataset.slot;
    ctexFile.value = '';                   // hetzelfde bestand nog eens kiezen moet vuren
    if (!f || !slot) return;
    if (!f.type.startsWith('image/')) { ctexMelding('That is not an image.'); return; }

    const url = URL.createObjectURL(f);
    const maat = await meetAfbeelding(url);
    if (!maat) { URL.revokeObjectURL(url); ctexMelding('That image could not be read.'); return; }
    // 2:1 is de equirectangulaire verhouding waar de hele bol op rekent. Een kleine
    // afwijking is onschuldig; een grote betekent dat de kaart uitgerekt op de bol komt.
    const verhouding = maat.w / maat.h;
    const waarschuwing = Math.abs(verhouding - 2) > 0.02
      ? maat.w + '×' + maat.h + ' is not 2:1, so it will be stretched'
      : null;
    await setCustomTexture(slot, { url, naam: f.name, bytes: f.size, waarschuwing });
  });

  document.querySelectorAll('.ctex-clear').forEach(btn => {
    btn.addEventListener('click', () => setCustomTexture(btn.dataset.clear, null));
  });

  ctexResetBtn?.addEventListener('click', async () => {
    if (customTex.day) await setCustomTexture('day', null);
    if (customTex.night) await setCustomTexture('night', null);
    ctexMelding('All custom textures removed.');
  });

  updateCtexUI();

  /* THE UPGRADE TO THE CHOSEN SET, once there is an earth to upgrade. index.html
     calls this straight after it assigns shaderMaterial — not on a timer, because
     this module has no way of knowing when that assignment happened.

     FAILING IS NOT FATAL AND NOT SILENT: the small set stays on screen and the
     panel names the set that did not arrive. The stored preference is left alone,
     because a bad connection is not a choice the visitor made. */
  function upgradeIfNeeded() {
    if (!wachtendeUpgrade) return null;
    const wil = wachtendeUpgrade;
    wachtendeUpgrade = null;
    return setTextureQuality(wil).then(() => {
      if (texQuality !== wil) { texQualityFallback = wil; meldTexqTerugval(); }
    });
  }

  /* WHAT THE APP GETS BACK. Deliberately narrow: the panel rows and their
     notes are bound in here, so nothing outside needs to reach them. */
  return {
    quality: () => texQuality,          // de textuurSET (2k of 8k)
    imagery: () => imagery,             // de gekozen TRAP (2k, 8k of tiles)
    setImagery: setTextureQuality,
    setQuality: setTextureQuality,
    buildMaterial: buildRealisticMaterial,
    upgradeIfNeeded,
    cloudsTexture: () => cloudsTexture,
    /* The annotation layer draws on top of the day map and needs the same URL
       the earth uses, including one the visitor picked themselves.

       (Do not write that layer's English name here: the build checks for it and
       cannot tell a mention from a leftover — rightly strict. See
       tools/build-standalone.mjs.) */
    dayUrl: dayUrlFor,
    customDay: () => customTex.day,
    customNight: () => customTex.night
  };
}
