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
    varying vec2 vUv;
    varying vec3 vViewDir;
    void main() {
      vNormal = normalize(normalMatrix * normal);
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
    varying vec3 vNormal;
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

      // ---- terminator + nachtzijde ----
      float dayMix = smoothstep(-0.15, 0.25, baseIntensity);
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
        float water = spec * smoothstep(-0.05, 0.2, baseIntensity);

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
  varying vec2 vUv;
  void main() {
    vNormal = normalize(normalMatrix * normal);
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
  varying vec3 vNormal;
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
    float dayF = smoothstep(-0.25, 0.3, intensity);
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
