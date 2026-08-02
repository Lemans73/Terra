/* ============================================================
   TERRA — GLSL shader-bronnen
   ------------------------------------------------------------
   Pure shader-strings, geëxtraheerd uit index.html (Stap 0).
   Geen THREE/DOM-afhankelijkheid. Het inline-script importeert
   deze en stopt ze in ShaderMaterial/ShaderPass.
   ============================================================ */

// Shockwave-ring: zachte radiale gloed die naar buiten uitdijt en vervaagt
// (ShaderMaterial). Meerdere ringen tegelijk → dikke, levende band.
export const SHOCK_VERT = `
  varying vec2 vUv;
  void main() { vUv = uv - 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
export const SHOCK_FRAG = `
  precision highp float;
  uniform float time; uniform vec3 color; uniform float speed; uniform float seed; uniform float opacity; uniform float edge; uniform float thickness;
  varying vec2 vUv;
  void main() {
    float d = length(vUv) * 2.0;            // 0 = centrum, 1 = rand
    float a = 0.0;
    for (int i = 0; i < 3; i++) {
      float ph = fract(time * speed + float(i) * 0.333 + seed);
      float dd = abs(d - ph);
      // ring met een solide kern (thickness) en een zachte rand (edge)
      float band = 1.0 - smoothstep(thickness, thickness + edge, dd);
      a += band * (1.0 - ph);               // vervaag terwijl hij uitdijt
    }
    a *= smoothstep(0.0, 0.07, d) * smoothstep(1.0, 0.6, d); // centrum + rand-fade
    if (a < 0.015) discard;
    gl_FragColor = vec4(color, a * opacity);
  }
`;

// day-night-cycle voorbeeld, uitgebreid met clouds + specular + fresnel.

export const dayNightShader = {
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vWorldNormal;
    varying vec2 vUv;
    varying vec3 vViewDir;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      // De normaal in ECHTE WERELDRUIMTE, zonder de camera erin. Nodig voor de
      // eclipsschaduw: die rekent met posities in kilometers en moet exact
      // uitlijnen met de zon- en maanrichting. De terminator kan toe met de
      // view-space-benadering hierboven (een paar graden scheef valt niet op in een
      // verloop van duizenden kilometers), maar een umbra van 66 km beslaat 0,6
      // graden — daar is diezelfde benadering het verschil tussen raak en mis.
      //
      // modelMatrix bevat de -90 graden draai die three-globe op de aarde-mesh zet,
      // en die brengt textuur-lengte 0 precies op +Z: dezelfde conventie waarin
      // Polar2Cartesian rekent. Beide zijden spreken hier dus hetzelfde frame.
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      vUv = uv;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewDir = normalize(-mvPosition.xyz);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    #define PI 3.141592653589793
    uniform sampler2D dayTexture;
    uniform sampler2D nightTexture;
    uniform sampler2D cloudsTexture;
    uniform sampler2D specularTexture;
    uniform sampler2D normalTexture;
    uniform float hasClouds;
    uniform float hasSpecular;
    uniform float hasNormal;
    uniform float dayEnabled;
    uniform float nightEnabled;
    uniform float nightBrightness;
    uniform float cloudDrift;
    uniform float cloudShadow;
    uniform float normalStrength;
    uniform float reliefStrength;
    uniform float glintStrength;
    uniform float waterRipple;
    uniform float time;
    uniform vec2 sunPosition;
    uniform vec2 globeRotation;
    uniform vec3 atmosphereDayColor;
    uniform vec3 atmosphereTwilightColor;
    // ---- zonsverduistering ----
    // moonPosition is het sublunaire punt in [lng, lat], precies zoals sunPosition.
    // Daardoor ondergaat hij dezelfde Polar2Cartesian plus camera-rotatie en zit hij
    // gegarandeerd in hetzelfde frame — dat is waarom de schaduw vanzelf uitlijnt.
    // De afstanden zijn ECHTE kilometers, niet de gecomprimeerde scene-afstanden:
    // of de schaduw de aarde raakt hangt af van de werkelijke 384.400 km.
    uniform vec2 moonPosition;
    uniform float sunDistanceKm;
    uniform float moonDistanceKm;
    uniform float eclipseEnabled;
    varying vec3 vNormal;
    varying vec3 vWorldNormal;
    varying vec2 vUv;
    varying vec3 vViewDir;

    float toRad(in float a) { return a * PI / 180.0; }

    vec3 Polar2Cartesian(in vec2 c) { // [lng, lat]
      float theta = toRad(90.0 - c.x);
      float phi = toRad(90.0 - c.y);
      return vec3(sin(phi) * cos(theta), cos(phi), sin(phi) * sin(theta));
    }

    // ---- procedurele waarde-ruis (voor de levende waterglinster) ----
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float valueNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0;
      float amp = 0.5;
      for (int i = 0; i < 5; i++) {   // 5 octaven → meer fijn golfdetail
        v += amp * valueNoise(p);
        p *= 2.0;
        amp *= 0.5;
      }
      return v;
    }

    void main() {
      float invLon = toRad(globeRotation.x);
      float invLat = -toRad(globeRotation.y);
      mat3 rotX = mat3(1, 0, 0, 0, cos(invLat), -sin(invLat), 0, sin(invLat), cos(invLat));
      mat3 rotY = mat3(cos(invLon), 0, sin(invLon), 0, 1, 0, -sin(invLon), 0, cos(invLon));
      vec3 sunDir = normalize(rotX * rotY * Polar2Cartesian(sunPosition));

      vec3 baseNormal = normalize(vNormal);

      // tangent-basis op de sphere (uv-uitgelijnd) — gedeeld door normal-map én water-rimpel
      vec3 up = abs(baseNormal.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
      vec3 tangent = normalize(cross(up, baseNormal));
      vec3 bitangent = normalize(cross(baseNormal, tangent));
      mat3 TBN = mat3(tangent, bitangent, baseNormal);

      vec4 dayColor = texture2D(dayTexture, vUv);
      vec4 nightColor = texture2D(nightTexture, vUv);

      // ---- reliëf uit echte normal map ----
      // De normal map codeert oppervlaktenormalen in RGB (tangent space). We
      // overdrijven de helling (normalStrength) en bouwen de geperturbeerde
      // normaal zodat bergketens het licht merkbaar breken.
      vec3 normal = baseNormal;
      if (hasNormal > 0.5) {
        vec3 nTex = texture2D(normalTexture, vUv).rgb * 2.0 - 1.0;
        nTex.xy *= normalStrength;   // overdrijf de helling → bergen vangen meer licht
        nTex = normalize(nTex);
        normal = normalize(TBN * nTex);
      }

      float baseIntensity = dot(baseNormal, sunDir); // gladde bol → terminator
      float bumpIntensity = dot(normal, sunDir);     // mét reliëf

      /* ---- zonsverduistering ----
         De schaduwas loopt van het middelpunt van de zon door dat van de maan. Voor
         elk punt op aarde meten we de LOODRECHTE AFSTAND tot die as, en vergelijken
         die met de straal van de umbra- en penumbrakegel op diezelfde hoogte.

         WAAROM ZO EN NIET ALS CIRKEL ROND HET SCHADUWCENTRUM: de schaduw valt bijna
         nooit loodrecht op het oppervlak. Op 12 augustus 2026 is de invalshoek 65
         graden, waardoor de vlek tot ruim twee keer wordt uitgerekt. Een cirkel met
         een vaste hoekstraal klopt dan zichtbaar niet. Door per fragment de afstand
         tot de as te meten ontstaat de doorsnede van kegel en bol vanzelf — de
         ellips is gratis, en met haar de juiste oriëntatie.

         De variabele t is de afstand langs de as vanaf de maan. Negatief betekent
         dat het punt vóór de maan ligt, aan de zonkant; daar valt niets te
         verduisteren.

         LET OP: geen backticks in dit commentaar. Deze shader is een JS template
         literal, dus elke backtick sluit hem af en de module breekt met een
         verwarrende SyntaxError op een GLSL-naam. */
      float eclipse = 0.0;
      if (eclipseEnabled > 0.5) {
        // ALLES HIER IN WERELDRUIMTE, dus zonder rotX/rotY en met vWorldNormal.
        // Zie de noot in de vertex shader waarom de view-space-variant hier niet
        // volstaat.
        vec3 moonDirW = normalize(Polar2Cartesian(moonPosition));
        vec3 sunDirW  = normalize(Polar2Cartesian(sunPosition));
        vec3 M = moonDirW * moonDistanceKm;
        vec3 S = sunDirW * sunDistanceKm;
        vec3 SM = M - S;
        float dSM = length(SM);
        vec3 axis = SM / dSM;

        vec3 v = normalize(vWorldNormal) * 6371.0 - M;   // aardstraal in km
        float t = dot(v, axis);
        if (t > 0.0) {
          float d = length(v - axis * t);
          // Umbra convergeert (zon groter dan maan), penumbra divergeert. Voorbij de
          // punt van de umbrakegel wordt de straal negatief: dan is de eclips
          // ringvormig, en abs() geeft de antumbra die daarbij hoort.
          float rU = abs(1737.4 - ((695700.0 - 1737.4) / dSM) * t);
          float rP = 1737.4 + ((695700.0 + 1737.4) / dSM) * t;
          eclipse = 1.0 - smoothstep(rU, rP, d);
        }
      }

      // ---- terminator + nachtzijde ----
      // De grenzen zijn de ECHTE grenzen van dag en nacht, uitgedrukt in
      // cos(hoekafstand tot het subsolaire punt) — wat exact baseIntensity is.
      // (Let op: GEEN backticks in dit commentaar. Deze shader is een JS template
      //  literal, dus een backtick sluit hem af en de hele module breekt.)
      //
      //   -0.0145 = cos(90.83 graden) → de zon gaat onder
      //             Niet 0 maar -0,83 graden: atmosferische refractie tilt het beeld
      //             van de zon ~0,57 graden op, en de bovenrand van de schijf zakt
      //             een halve diameter later weg. Dezelfde -0,83 die elke
      //             zonsondergangstabel gebruikt.
      //   -0.309  = cos(108 graden) → einde astronomische schemering, echte nacht
      //
      // Hiervóór stond hier smoothstep(-0.15, 0.25), en dat legde het verloop
      // grotendeels BOVEN de horizon: op de terminator zelf was dayMix 0,316, dus
      // 68% donker terwijl de zon daar nog precies op de horizon staat. Gemeten in
      // sessie 14 en daarom rechtgezet — de verlichting hoort samen te vallen met de
      // zon/maan-logica die de rest van de scene aanstuurt.
      //
      // Op de vier schemeringslijnen die js/sunmoon-layer.js tekent geeft dit nu
      // 1,000 / 0,734 / 0,251 / 0,000 op 0, -6, -12 en -18 graden zonhoogte.
      float dayMix = smoothstep(-0.309, -0.0145, baseIntensity);
      // De verduistering neemt zonlicht weg, dus hij werkt op dezelfde dayMix die
      // dag en nacht mengt. Gevolg: onder de umbra verschijnen de stadslichten van
      // de nachttextuur — precies wat er in het echt gebeurt wanneer het overdag
      // donker wordt. Niet naar 0 dimmen: bij totaliteit blijft de corona zichtbaar
      // en is het schemerdonker, geen holle nacht.
      dayMix *= 1.0 - 0.94 * eclipse;
      // Macro-belichting van de bol; micro-emboss van het reliëf eroverheen.
      // We nemen het *verschil* tussen bobbel- en bol-normaal en vergroten dat
      // uit (reliefStrength) → echte schaduw/highlight op hellingen i.p.v. een
      // wegvallende multiplier. Emboss faseert weg over de terminator.
      float macro = clamp(0.55 + 0.75 * max(baseIntensity, 0.0), 0.0, 1.4);
      float emboss = (bumpIntensity - baseIntensity) * reliefStrength;
      float relief = clamp(macro + emboss * dayMix, 0.2, 1.7);
      vec3 dayLayer = dayColor.rgb * relief * dayEnabled;
      // nachtzijde: stadslichten + instelbare ambient zodat het oppervlak zichtbaar blijft
      vec3 nightAmbient = dayColor.rgb * nightBrightness; // gedimd dag-oppervlak als "maanlicht"
      vec3 nightLayer = (nightColor.rgb + nightAmbient) * nightEnabled;
      vec3 surface = mix(nightLayer, dayLayer, dayMix);

      // ---- gerimpelde waterreflectie met procedurele ruis (zonneglinster) ----
      if (hasSpecular > 0.5) {
        float spec = texture2D(specularTexture, vUv).r; // 1 = water, 0 = land
        // De glinster moet met de eclips mee doven: zonder deze factor blijft het
        // water schitteren midden in een schaduw waar de zon bedekt is.
        float water = spec * smoothstep(-0.05, 0.2, baseIntensity) * (1.0 - eclipse);

        // bewegende rimpel: ruis-gradiënt verstoort de wateroppervlaknormaal,
        // zodat de zon op een levend oppervlak breekt i.p.v. een gladde highlight.
        vec2 rc = vUv * vec2(2600.0, 1300.0);  // hogere frequentie → kleinere golven
        float t = time * 0.45;
        float e = 0.6;
        float h0 = fbm(rc + t);
        float rx = fbm(rc + vec2(e, 0.0) + t) - h0;
        float ry = fbm(rc + vec2(0.0, e) + t) - h0;
        vec3 waterN = normalize(normal + (tangent * rx + bitangent * ry) * waterRipple * water);

        vec3 viewN = normalize(vViewDir);
        vec3 halfVec = normalize(sunDir + viewN);
        float glint = pow(max(dot(waterN, halfVec), 0.0), 80.0);
        float sheen = pow(max(dot(reflect(-sunDir, waterN), viewN), 0.0), 14.0);

        // fijne fonkel-ruis bovenop de glinster → glinsterend wateroppervlak
        float sparkle = smoothstep(0.6, 0.95, valueNoise(rc * 1.3 + t * 1.5));

        vec3 glintColor = vec3(1.0, 0.95, 0.82);
        vec3 sheenColor = vec3(0.45, 0.62, 0.85);
        surface += glintColor * glint * water * (1.4 + 1.6 * sparkle) * glintStrength;
        surface += sheenColor * sheen * water * 0.4 * glintStrength;
      }

      // wolken-schaduw: de losse zwevende wolkenschil dimt het oppervlak eronder
      // (alleen dagzijde). De heldere wolken zelf zitten op de aparte schil-mesh.
      if (hasClouds > 0.5) {
        float cloud = texture2D(cloudsTexture, vec2(vUv.x + cloudDrift, vUv.y)).r;
        surface *= (1.0 - cloudShadow * cloud * dayMix);
      }

      // fresnel-atmosfeer aan de rand, getint naar zon-positie
      float fresnel = pow(1.0 - max(dot(baseNormal, normalize(vViewDir)), 0.0), 2.5);
      float twilight = smoothstep(-0.4, 0.2, baseIntensity) * (1.0 - smoothstep(0.2, 0.6, baseIntensity));
      vec3 atmColor = mix(atmosphereDayColor, atmosphereTwilightColor, twilight);
      surface += atmColor * fresnel * (0.3 + 0.7 * dayMix);

      gl_FragColor = vec4(surface, 1.0);
    }
  `
};

// ---- Zwevende wolkenschil ----
// Aparte transparante bol op iets grotere straal dan de aarde, zodat de wolken
// aan de rand van de bol zichtbaar "zweven". Day/night-belichting deelt dezelfde
// zon-uniforms als de aarde-shader; drift via dezelfde cloudDrift-uniform, zodat
// de schaduw op het oppervlak meeloopt. Door de hogere straal ontstaat aan de
// limbus parallax tussen wolk en schaduw → het zweef-effect.
export const CLOUD_VERT = `
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    // Wereldruimte-normaal voor de eclipsschaduw; zie de noot in dayNightShader.
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
export const CLOUD_FRAG = `
  #define PI 3.141592653589793
  uniform sampler2D cloudsTexture;
  uniform float cloudDrift;
  uniform float cloudOpacity;
  uniform vec2 sunPosition;
  uniform vec2 globeRotation;
  // Zonsverduistering — zie dayNightShader. De wolkenschil is een APARTE mesh en
  // kende de eclips eerst niet, waardoor de wolken boven de umbra vrolijk verlicht
  // bleven en de schaduw eronder half wegviel. Wolken vangen het zonlicht als
  // eerste; als dat licht wegvalt, doven zij ook.
  uniform vec2 moonPosition;
  uniform float sunDistanceKm;
  uniform float moonDistanceKm;
  uniform float eclipseEnabled;
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  float toRad(in float a) { return a * PI / 180.0; }
  vec3 Polar2Cartesian(in vec2 c) {
    float theta = toRad(90.0 - c.x);
    float phi = toRad(90.0 - c.y);
    return vec3(sin(phi) * cos(theta), cos(phi), sin(phi) * sin(theta));
  }
  void main() {
    float invLon = toRad(globeRotation.x);
    float invLat = -toRad(globeRotation.y);
    mat3 rotX = mat3(1.0, 0.0, 0.0, 0.0, cos(invLat), -sin(invLat), 0.0, sin(invLat), cos(invLat));
    mat3 rotY = mat3(cos(invLon), 0.0, sin(invLon), 0.0, 1.0, 0.0, -sin(invLon), 0.0, cos(invLon));
    vec3 sunDir = normalize(rotX * rotY * Polar2Cartesian(sunPosition));
    float intensity = dot(normalize(vNormal), sunDir);
    // Wolken lopen ACHTER op het oppervlak, en dat is de reden dat de lucht na
    // zonsondergang nog kleurt: op 10 km hoogte ligt de horizon 3,21 graden lager,
    // dus een wolk vangt nog zonlicht terwijl de grond eronder al in de schaduw ligt.
    // De band van het oppervlak (zie dayNightShader) met die 3,21 graden verschoven:
    //   -0.0704 = cos(94.04) → dag tot zonhoogte -4,04 (= -0,83 refractie - 3,21 dip)
    //   -0.3618 = cos(111.21) → nacht vanaf -21,21
    // Hiervóór stond hier smoothstep(-0.25, 0.3), wat wolken al vanaf zonhoogte
    // +17,46 liet verduisteren — ruim vóór het oppervlak in plaats van erna.
    float dayF = smoothstep(-0.3618, -0.0704, intensity);

    // Zonsverduistering, identiek aan dayNightShader: wereldruimte, afstand tot de
    // schaduwas. De wolkenschil ligt 0,5 eenheden boven het oppervlak, wat op deze
    // schaal ruim binnen de umbra valt — de aardstraal van 6371 volstaat dus.
    if (eclipseEnabled > 0.5) {
      vec3 M = normalize(Polar2Cartesian(moonPosition)) * moonDistanceKm;
      vec3 S = normalize(Polar2Cartesian(sunPosition)) * sunDistanceKm;
      vec3 SM = M - S;
      float dSM = length(SM);
      vec3 axis = SM / dSM;
      vec3 v = normalize(vWorldNormal) * 6371.0 - M;
      float t = dot(v, axis);
      if (t > 0.0) {
        float d = length(v - axis * t);
        float rU = abs(1737.4 - ((695700.0 - 1737.4) / dSM) * t);
        float rP = 1737.4 + ((695700.0 + 1737.4) / dSM) * t;
        dayF *= 1.0 - 0.94 * (1.0 - smoothstep(rU, rP, d));
      }
    }

    float cloud = texture2D(cloudsTexture, vec2(vUv.x + cloudDrift, vUv.y)).r;
    float alpha = cloud * cloudOpacity * (0.2 + 0.8 * dayF); // 's nachts bijna transparant
    if (alpha < 0.01) discard;
    vec3 col = mix(vec3(0.05, 0.06, 0.09), vec3(1.0), dayF); // donker 's nachts, wit overdag
    gl_FragColor = vec4(col, alpha);
  }
`;

// ---- Mist-schil ----
// Een fresnel-waas op een schil net boven het oppervlak: helder in het midden
// (kijkrichting recht op het oppervlak) en steeds dichter naar de randen toe
// (scherende kijkhoek) → het kaartje wordt aan de limbus "mistig".
export const FOG_VERT = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
export const FOG_FRAG = `
  uniform vec3 fogColor;
  uniform float fogStrength;
  uniform float fogPower;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    float f = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), fogPower);
    float a = clamp(f * fogStrength, 0.0, 1.0);
    if (a < 0.002) discard;
    gl_FragColor = vec4(fogColor, a);
  }
`;
