/* ============================================================
   TERRA — quake indicator · the shaders
   ------------------------------------------------------------
   Pure shader strings, no THREE and no DOM — the same contract as
   js/shaders.js.

   A FILE OF THEIR OWN AND NOT js/shaders.js, because that already
   holds a SHOCK_VERT and a SHOCK_FRAG. Two pairs of shaders under
   one name in one module is the second source of truth this
   project closes off everywhere. The QUAKE_ prefix also says which
   layer they belong to.

   POSITIONS GO THROUGH modelViewMatrix AND vWorld THROUGH
   modelMatrix, not through projectionMatrix * viewMatrix. The
   layer hangs inside globe.gl's tree (js/core/globe-root.js) and
   that tree has intermediate transforms, so its model matrix is
   not the identity. Doing it this way is correct wherever the
   group hangs, instead of correct because we looked.

   NO BACKTICKS IN THE GLSL COMMENTS. The shaders live in template
   literals, so one backtick in here closes the literal and the
   module stops loading — no scene, and no error pointing at the
   line. An even number is worse: it parses, the build passes, and
   the app falls over somewhere else entirely. Guarded by
   tools/check-template-backticks.mjs.
   ============================================================ */

/* ---- Stacking -------------------------------------------------------------
   Shared by the ring and the shockwave so the two layers compute the same spot
   by construction. Its JS mirror is stackedNormalJS in quake-indicator.js;
   those two belong changed together. */
export const QUAKE_STACK_GLSL = /* glsl */`
attribute vec3  aRoot;
attribute float aLayer;

uniform float uStackOn;
uniform float uStackNear;
uniform float uStackFar;
uniform float uStackLift;
uniform float uStackSpread;
uniform float uRadius;

// How much is stacked right now: 0 = everything on its own spot.
float stackAmount(float camDist) {
  return uStackOn * smoothstep(uStackNear, uStackFar, camDist);
}

/* The shifted direction of this event. The BASE of a stack (layer 0) never
   moves — it sits where the strongest quake actually happened. */
vec3 stackedNormal(vec3 n, float amt) {
  if (amt < 0.001 || aLayer < 0.5) return n;

  /* THE DIRECTION STAYS, ONLY THE DISTANCE GROWS.

     An earlier version pulled each event towards its base and put it back at
     the golden angle — a sunflower pattern that looks tidy from above and
     throws away the REAL arrangement. A quake north of its neighbour could end
     up south of it, and zooming in snapped it back: two quakes visibly swapped
     places. An indicator has to say WHERE something happened. Pushing apart is
     allowed, rearranging is not.

     sqrt(aLayer) puts storeys that happen to point the same way at different
     distances, so they do not cover each other there either. */
  vec3 tang = n - aRoot * dot(n, aRoot);      // the sideways part of n
  float d = length(tang);

  if (d < 1e-6) {
    /* Exactly on the base — only possible for two events on the same
       coordinate. There is no own direction to preserve, so pick one. */
    vec3 up = abs(aRoot.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    tang = normalize(cross(up, aRoot));
    d = 0.0;
  } else {
    tang /= d;
  }

  float want = uStackSpread * sqrt(aLayer) / uRadius;   // desired angular distance
  float grown = mix(d, max(d, want), amt);
  return normalize(aRoot + tang * grown);
}

/* How far this storey rises above the surface — TIMES THE ICON SCALE.

   Without that factor the stack exists but is invisible: at a lift of 1.1 units
   with the camera at 300 a storey gains 5 pixels, and the rings still lie on
   top of each other. Measured with it missing: stacking ON produced MORE
   saturated pixels than off, because the rings crept together without ever
   moving apart.

   The scale is passed in rather than computed here: iconScale() lives in each
   shader separately and is only defined after this block. */
float stackLift(float amt, float sc) {
  return aLayer * uStackLift * amt * sc;
}
`;

/* ---- Hover ---------------------------------------------------------------
   Which instance sits under the mouse. The picking itself happens in JS
   (quake-labels.js: pickAt) because the shader moves the vertices and a raycast
   would systematically miss; all that happens here is the HIGHLIGHT.

   AN INDEX ATTRIBUTE OF OUR OWN, NOT gl_InstanceID. That only exists in GLSL ES
   3.00, and the rest of this file is deliberately 1.00-safe: a shader that
   fails to compile makes the whole layer silently invisible.

   uHoverIdx at -1 means nothing is hovered. The comparison has a half-unit
   margin, because a float does not come back exactly from an attribute. */
const PICK_GLSL = /* glsl */`
attribute float aIndex;
uniform float uHoverIdx;
uniform float uHoverBoost;
uniform float uDimOthers;

float aangewezen() {
  return abs(aIndex - uHoverIdx) < 0.5 ? 1.0 : 0.0;
}

/* ONE RULE: everything except the hovered one dims. Session 41 also had a
   stack-only mode (dim just the neighbours in the same label block); session 42
   dropped it — hovering a label now does exactly what hovering an indicator
   does. */
float dempFactor() {
  float actief = step(-0.5, uHoverIdx);
  return mix(1.0, mix(1.0, 1.0 - uDimOthers, 1.0 - aangewezen()), actief);
}
`;

/* ---- The screen-fixed icon scale ------------------------------------------
   The same shape as Terra's shared scale in animateShader(), but on ITS OWN
   parameters (quakeIconScale*). Terra's iconScale* drives every glyph in the
   app — volcanoes, lightning, wildfires — and those must not change size
   because of this layer.

   Both pow bases are clamped. uCamDist and uScaleRef are positive, but the
   max() is there so that no pow in this file runs on good faith: pow() with a
   negative base is undefined in GLSL and the answer is NaN. That pattern has
   cost this project a black screen three times. */
const ICON_SCALE_GLSL = /* glsl */`
uniform float uScaleRef;
uniform float uScalePow;
uniform float uScaleMin;
uniform float uScaleMax;
uniform float uNearPerUnit;
uniform float uNearFloor;
uniform float uSizeBoost;

float iconScale(float camDist) {
  float base = max(camDist, 1.0) / max(uScaleRef, 1.0);
  float s = clamp(pow(max(base, 1e-6), uScalePow), uScaleMin, uScaleMax);
  // The clamp measures the height ABOVE the glyph shell and not to the centre —
  // that is what actually sets the angular size.
  float h = max(0.001, camDist - uNearFloor);
  return min(s, uNearPerUnit * h);
}
`;

/* ===========================================================================
   THE RING

   The whole indicator is made here, including its POSITION and its SCALE. As
   long as the size is set in JavaScript, every frame needs a loop over all
   events to update it. Here the shader gets the camera distance as a uniform
   and every vertex works out its own place, so the per-frame JS is one line.

   What goes in per instance: the unit normal of the event, the magnitude as a
   fraction, the depth COLOUR (not the depth itself — depthRGB runs in JS so
   there is one source of truth), the age, and a seed for the phase.
   =========================================================================== */

export const QUAKE_RING_VERT = /* glsl */`
precision highp float;
${QUAKE_STACK_GLSL}
${ICON_SCALE_GLSL}
${PICK_GLSL}
attribute vec3  aNormal;   // eenheidsvector naar het event
attribute vec3  aColor;    // diepte-kleur, al door depthRGB gehaald
attribute float aMagFrac;  // 0 bij magMin, 1 bij magMax
attribute float aAge;      // 0 = zojuist, 1 = aan het eind van het venster
attribute float aSeed;

uniform float uCamDist;
uniform float uLift;              // uRadius comes from the stacking block
uniform float uRingLo;
uniform float uRingHi;
uniform float uRingPow;

varying vec2  vUv;
varying vec3  vColor;
varying float vMagFrac;
varying float vAge;
varying float vSeed;
varying vec3  vWorld;
varying vec3  vN;
varying float vHover;
varying float vDemp;

void main() {
  vUv      = uv;
  vHover   = aangewezen();
  vDemp    = dempFactor();
  vColor   = aColor;
  vMagFrac = aMagFrac;
  vAge     = aAge;
  vSeed    = aSeed;

  float amt = stackAmount(uCamDist);
  float stackSc = iconScale(uCamDist) * uSizeBoost;
  vec3 n = stackedNormal(normalize(aNormal), amt);
  float lift = uLift + stackLift(amt, stackSc);

  // Tangential basis. The choice of helper vector avoids a degenerate cross
  // product at the poles.
  vec3 up = abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 tx = normalize(cross(up, n));
  vec3 ty = normalize(cross(n, tx));

  // Magnitude to world radius, then the screen-fixed scale on top.
  float mf = clamp(aMagFrac, 0.0, 1.0);
  float worldR = mix(uRingLo, uRingHi, pow(max(mf, 0.0), max(uRingPow, 0.01)));
  float s = worldR * iconScale(uCamDist) * uSizeBoost;

  // PROJECTED onto the globe instead of laid down as a flat plane: the disc
  // follows the curvature and never pokes through the surface, not even at the
  // large magnitudes.
  vec3 planar = n * uRadius + tx * position.x * s + ty * position.y * s;
  vec3 local = normalize(planar) * (uRadius + lift);

  /* THE VIEWING ANGLE IS COMPUTED IN THE FRAGMENT SHADER, not here. A large
     disc near the limb has noticeably different viewing angles across its own
     surface, and four vertices cannot capture that.

     vWorld goes through modelMatrix because cameraPosition in the fragment
     shader is WORLD space. See the head of this file. */
  vWorld = (modelMatrix * vec4(local, 1.0)).xyz;
  vN = normalize(mat3(modelMatrix) * n);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
}
`;

export const QUAKE_RING_FRAG = /* glsl */`
precision highp float;

uniform float uCountLo;
uniform float uCountHi;
uniform float uLineLo;
uniform float uLineHi;
uniform float uFill;
uniform float uCore;
uniform float uFalloff;
uniform float uOpacity;
uniform float uLineMinPx;
uniform float uRingGapPx;
uniform float uFitRings;
uniform float uRingEdge;
uniform float uRingVolume;
uniform float uRingShine;
/* THE HOVER UNIFORMS HAVE TO BE REPEATED HERE. PICK_GLSL is only spliced into
   the VERTEX shaders — that is where the attribute belongs — but a uniform is
   per SHADER, not per program. Without these three lines the fragment shader
   does not compile, and then the whole ring layer draws nothing while the beam
   beside it carries on. That reads as "the ring is gone for a moment" and not
   as a fault: the console says so, the image does not. */
uniform float uHoverIdx;
uniform float uHoverBoost;
uniform float uDimOthers;

varying vec2  vUv;
varying vec3  vColor;
varying float vMagFrac;
varying float vAge;
varying float vSeed;
varying vec3  vWorld;
varying vec3  vN;
varying float vHover;
varying float vDemp;

/* ---- The horizon, in the fragment shader ----------------------------------
   These layers draw with depthTest OFF. They sit on radius 100 — exactly on the
   surface — where the depth buffer would have them fight the globe, the map
   lines and the land polygons.

   WHY THEY HAVE TO SIT ON THE SURFACE: parallax. An indicator floating above
   the ground drifts away from the spot it points at under an oblique view, and
   that runs away as you zoom in. MEASURED, drift at lift 0.8, 15 degrees off
   centre:

       camera    450    260    200    150    120    105
       drift     0.49   1.33   2.56   7.25   30.8   222   pixels

   On radius 100 that is zero by construction.

   But with the depth test off, what the globe used to do also disappears:
   hiding the BACK. That is what this block does. Per FRAGMENT and not per
   instance, because a large disc near the limb lies partly in front of and
   partly behind the horizon; a test per event would make it jump all at once. */
uniform vec2 uHorizonBand;

/* THE LIMB AS A BAND, NOT A CUT-OFF (session 42, Terry). An indicator turning
   around the globe used to vanish in a single frame; it is now full until a few
   degrees before the horizon and gone a few degrees past it.

   uHorizonBand is computed in JS once per frame: x = the cosine where the fade
   ends (gone), y = where it begins (still full). That keeps acos() out of the
   fragment shader and puts the clamp against NaN in one place instead of three. */
float limbFade(vec3 wereldPunt) {
  return smoothstep(uHorizonBand.x, uHorizonBand.y,
                    dot(normalize(wereldPunt), normalize(cameraPosition)));
}

uniform float uRingOn;

void main() {
  // The whole layer off without removing the mesh, so the draw call stays. This
  // is a switch to SEE what is left without rings, not a way to save anything.
  if (uRingOn < 0.5) discard;
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  // The limb, as a factor. discard only once nothing is left, so a fragment in
  // the band still draws — that is the whole point of the band.
  float limb = limbFade(vWorld);
  if (limb <= 0.0) discard;

  float mf = clamp(vMagFrac, 0.0, 1.0);

  // Heavier = more rings: the count reads as a scale rather than decoration.
  // Whether the LINE gets thinner or thicker with it is a separate choice,
  // adjustable either way through uLineLo against uLineHi.

  /* THE LINE WIDTH GETS A FLOOR IN SCREEN PIXELS, and that is a repair rather
     than a refinement. MEASURED: with the width as a fixed fraction of the disc
     radius, a ring line is 0.21 to 0.29 PIXEL wide across the whole usual zoom
     range:

         distance     450    300    260    200    155    125
         ring radius  27.9   28.6   28.7   30.6   37.4   38.7  px
         line width   0.21   0.22   0.22   0.23   0.28   0.29  px

     Such a line does not exist as a line. Antialiasing smears it into a grey
     wash whose brightness depends on where the pixel grid happens to fall — and
     that showed: the measured angular radius jumped between 0.73 and 2.14
     degrees at practically the same distance.

     fwidth(r) says how much r changes across one pixel. The width may not drop
     below that. Zoomed in, the configured fraction wins again on its own. */
  float pw = fwidth(r);
  float w  = max(mix(uLineLo, uLineHi, mf), pw * uLineMinPx);

  /* THE RING COUNT FOLLOWS THE SCREEN SPACE AVAILABLE.

     MEASURED at Terra's scale in an 800 px window:

         magnitude   4.5    5.5    6.5    7.4    9.0
         ring radius 6.0   11.0   16.1   20.6   28.7  px
         rings        4     4.8    5.6    6.3    7.5
         per ring    1.34   2.08   2.60   2.96   3.44  px
         line fills   97%    63%    50%    44%    38%

     At M4.5 the line fills 97% of the gap between two rings: no ring pattern
     left, just a silted-up blob. And by Gutenberg-Richter M4.5 is by far the
     most common quake, so that is what the globe shows — dots, not rings.

     A shader does know how many pixels it has. Here the ring count adapts:
     never more rings than fit with a readable gap. A heavy quake keeps its full
     count, a light one drops to two or three and stays readable as a ring. */
  float nWant = mix(uCountLo, uCountHi, mf);
  float nFit  = 0.90 / max(pw * uRingGapPx, 1e-5);
  float nRings = uFitRings > 0.5 ? min(nWant, max(1.0, nFit)) : nWant;

  /* EDGE SHARPNESS, taken from the shockwave. There the line is a SOLID core
     with a soft rim around it — smoothstep(width, width+edge) — while the ring
     only had a gradient from its heart outwards, smoothstep(0, width). That
     difference is exactly why the shockwave reads sharper than the rings.

     uRingEdge is the FRACTION of the line width that is soft. At 1.0 the
     behaviour is identical to what it was; lower makes the core solid and the
     line sharper. The floor keeps smoothstep out of its degenerate case where
     both edges coincide. */
  float soft  = clamp(uRingEdge, 0.0, 1.0);
  float inner = min(w * (1.0 - soft), w - 1e-5);

  /* VOLUME: THE LINE AS A TUBE INSTEAD OF A STROKE.

     Take u as the position across the line width: 0 at the heart, 1 at the
     edge. A half-round cross section has height h = sqrt(1 - u*u) there, and
     the normal of that surface is (radial direction times u, h) — sideways at
     the flanks, straight up at the heart. Lit from a direction fixed relative
     to the SCREEN, because the disc is a billboard: the light stays put while
     the globe turns, exactly as it would on real geometry.

     SHAPE AND LIGHT ARE SEPARATE. The rings accumulator carries the coverage
     and stays exactly what it was; only ringsLit carries the profile into the
     colour. Otherwise the line would also get thinner or more transparent with
     the volume and the ring spacing would no longer hold.

     At uRingVolume = 0, shade is exactly 1.0 and ringsLit equals rings, so the
     shader draws pixel for pixel what it drew without this. IT IS 0 IN TERRA:
     the effect only shows on thicker lines, and this set runs on thin ones.

     No pow() with a base that can go negative: dif is clamped at 0 and sqrt
     gets a max() under it. */
  vec2 rad = p / max(r, 1e-5);
  vec3 L = normalize(vec3(-0.42, 0.55, 0.72));   // vast t.o.v. het scherm

  float rings = 0.0;      // de VORM, en dus de dekking
  float ringsLit = 0.0;   // dezelfde vorm, maar belicht
  for (int i = 0; i < 8; i++) {
    if (float(i) >= nRings) break;
    float ri   = (float(i) + 1.0) / nRings * 0.90;
    float d    = abs(r - ri);
    float line = 1.0 - smoothstep(inner, w, d);
    float wf   = 1.0 - ri * uFalloff;
    rings += line * wf;

    float u  = clamp(d / max(w, 1e-5), 0.0, 1.0);
    float h  = sqrt(max(0.0, 1.0 - u * u));
    vec3  nT = normalize(vec3(rad * (sign(r - ri) * u), max(h, 1e-3)));
    float dif  = max(dot(nT, L), 0.0);
    float spec = pow(dif, 26.0) * uRingShine;
    /* 0.45 as a floor: a tube may be darker on its shadow side but must not
       disappear — the ring has to stay readable all the way round. */
    float shade = mix(1.0, 0.45 + 0.55 * dif + spec, uRingVolume);
    ringsLit += line * wf * shade;
  }

  float fill = (1.0 - smoothstep(0.0, 0.88, r)) * uFill;
  float core = exp(-r * r * 80.0) * uCore;   // exp(-q*q), geen pow
  float envelope = 1.0 - smoothstep(0.82, 1.0, r);

  /* How obliquely are we looking at this disc? Near the limb a flat disc turns
     into a line; without this fade it pinches into a bright streak there. */
  vec3 viewDir = normalize(cameraPosition - vWorld);
  vec3 nn = normalize(vN);
#ifdef UNSAFE_POW
  /* THE COUNTER-MEASUREMENT — literally the pattern that cost this project a
     black screen three times: max() without an UPPER bound, after which a dot
     product that rounds to 1.0000001 puts a negative base under pow(). In GLSL
     that is undefined, and the answer is NaN.

     Turn this define on and the ring should go black. If it does not, the
     measurement setup is not measuring what it thinks it is. */
  float ndv = max(dot(nn, viewDir), 0.0);
  float graze = pow(1.0 - ndv, 0.55);
#else
  float ndv = clamp(dot(nn, viewDir), 0.0, 1.0);
  float graze = pow(max(1.0 - ndv, 0.0), 0.55);
#endif
  // Not all the way to zero: seen from straight above the ring must not vanish.
  graze = 0.35 + 0.65 * (1.0 - graze);

  float lum   = ringsLit * 1.15 + fill + core;
  float alpha = (rings + fill + core * 0.95) * envelope * uOpacity * graze;

  /* THE HOVERED ONE LIFTS, THE REST DIM. Two channels, because they do
     different things: uHoverBoost raises the hovered ring, uDimOthers pulls the
     others down. The second is what picks a single quake out of a swarm — only
     lifting does not work there, since the neighbours are just as bright.

     uDimOthers applies ONLY when something is hovered. Without that condition
     the whole layer would sit permanently dimmed as soon as the value rises
     above zero. */
  float opTil = 1.0 + uHoverBoost * vHover;
  gl_FragColor = vec4(vColor * lum * opTil, clamp(alpha * vDemp * opTil * limb, 0.0, 1.0));
}
`;

/* ===========================================================================
   THE SHOCKWAVE

   A layer of its own and not a term in the ring shader: separately switchable,
   its own much wider size, and the ring shader stays readable. Same geometry as
   the ring — a disc projected onto the globe.

   THE AGE COMES FROM THE CHOSEN MOMENT and not from the wall clock. That is
   enforced in quake-indicator.js; this file only says what the shader does with
   it. See the note at uploadEvents().
   =========================================================================== */

export const QUAKE_SHOCK_VERT = /* glsl */`
precision highp float;
${QUAKE_STACK_GLSL}
${ICON_SCALE_GLSL}
${PICK_GLSL}
attribute vec3  aNormal;
attribute vec3  aColor;
attribute float aMagFrac;
attribute float aAgeH;     // age in HOURS
attribute float aSeed;

uniform float uCamDist;
uniform float uLift;              // uRadius comes from the stacking block
/* THE SAME THREE AS THE RING, and that is a repair.

   The shockwave used to have its own lo/hi/pow. Sounds right, but it means the
   two drift apart the moment either one is adjusted. Which happened: the ring
   went to 10..30 with pow 0.95 while the shockwave stayed at 2.8..20 with pow
   2. MEASURED:

       magnitude    2.5    4.5    6.5    9.5
       ring        10.0   16.1   21.8   30.0  units
       shockwave    2.8    4.2    8.4   20.0
       ratio       0.28   0.26   0.39   0.67

   So at EVERY magnitude the pulse fell inside its own indicator, and with the
   rings on you never saw it. The ratio also varying per magnitude makes that
   impossible to fix with one slider.

   Now there is one size: the shockwave IS the ring radius, times uShockScale. A
   wave expanding PAST its indicator needs a factor above 1. Change the ring and
   the pulse follows by construction. */
uniform float uRadLo, uRadHi, uRadPow;
uniform float uShockScale;
uniform float uAgeLo, uAgeHi;

varying vec2  vUv;
varying vec3  vColor;
varying float vSeed;
varying float vFresh;
varying vec3  vWorld;

void main() {
  vUv = uv;
  vColor = aColor;
  vSeed = aSeed;

  /* The age envelope. Fresh pulses at full strength, then fades; past uAgeHi
     nothing is drawn at all. Without that limit the whole world pulses all the
     time and a pulse stops meaning anything. */
  vFresh = 1.0 - smoothstep(uAgeLo, max(uAgeHi, uAgeLo + 0.01), aAgeH);

  float amt = stackAmount(uCamDist);
  float stackSc = iconScale(uCamDist) * uSizeBoost;
  vec3 n = stackedNormal(normalize(aNormal), amt);
  float lift = uLift + stackLift(amt, stackSc);
  vec3 up = abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 tx = normalize(cross(up, n));
  vec3 ty = normalize(cross(n, tx));

  float mf = clamp(aMagFrac, 0.0, 1.0);
  float worldR = mix(uRadLo, uRadHi, pow(max(mf, 0.0), max(uRadPow, 0.01))) * uShockScale;
  float s = worldR * iconScale(uCamDist) * uSizeBoost;

  // Projected onto the globe, like the ring — otherwise the disc pokes through
  // the surface at the large magnitudes. See the note at the 16x16 grid in
  // quake-indicator.js.
  vec3 planar = n * uRadius + tx * position.x * s + ty * position.y * s;
  vec3 local = normalize(planar) * (uRadius + lift);
  // Through modelMatrix, because the horizon test in the fragment shader
  // compares against cameraPosition, which is world space. See the file head.
  vWorld = (modelMatrix * vec4(local, 1.0)).xyz;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
}
`;

export const QUAKE_SHOCK_FRAG = /* glsl */`
precision highp float;

uniform float uTime;
uniform float uWaves, uSpeed, uThickness, uEdge, uOpacity;

varying vec2  vUv;
varying vec3  vColor;
varying float vSeed;
varying float vFresh;
varying vec3  vWorld;

/* ---- The horizon, in the fragment shader ----------------------------------
   These layers draw with depthTest OFF. They sit on radius 100 — exactly on the
   surface — where the depth buffer would have them fight the globe, the map
   lines and the land polygons.

   WHY THEY HAVE TO SIT ON THE SURFACE: parallax. An indicator floating above
   the ground drifts away from the spot it points at under an oblique view, and
   that runs away as you zoom in. MEASURED, drift at lift 0.8, 15 degrees off
   centre:

       camera    450    260    200    150    120    105
       drift     0.49   1.33   2.56   7.25   30.8   222   pixels

   On radius 100 that is zero by construction.

   But with the depth test off, what the globe used to do also disappears:
   hiding the BACK. That is what this block does. Per FRAGMENT and not per
   instance, because a large disc near the limb lies partly in front of and
   partly behind the horizon; a test per event would make it jump all at once. */
uniform vec2 uHorizonBand;

/* THE LIMB AS A BAND, NOT A CUT-OFF (session 42, Terry). An indicator turning
   around the globe used to vanish in a single frame; it is now full until a few
   degrees before the horizon and gone a few degrees past it.

   uHorizonBand is computed in JS once per frame: x = the cosine where the fade
   ends (gone), y = where it begins (still full). That keeps acos() out of the
   fragment shader and puts the clamp against NaN in one place instead of three. */
float limbFade(vec3 wereldPunt) {
  return smoothstep(uHorizonBand.x, uHorizonBand.y,
                    dot(normalize(wereldPunt), normalize(cameraPosition)));
}

void main() {
  if (vFresh <= 0.002) discard;
  float limb = limbFade(vWorld);
  if (limb <= 0.0) discard;

  float d = length(vUv * 2.0 - 1.0);      // 0 = heart, 1 = edge
  if (d > 1.0) discard;

  /* Each wave runs from the heart to the edge and fades on the way; the phase
     offset keeps them evenly spaced. The count is adjustable rather than fixed
     at three. */
  float a = 0.0;
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uWaves) break;
    float ph = fract(uTime * uSpeed + float(i) / max(uWaves, 1.0) + vSeed);
    float dd = abs(d - ph);
    float band = 1.0 - smoothstep(uThickness, uThickness + uEdge, dd);
    a += band * (1.0 - ph);               // fade as it expands
  }

  // Close off the heart and the rim cleanly.
  a *= smoothstep(0.0, 0.07, d) * smoothstep(1.0, 0.6, d);
  a *= vFresh * uOpacity;
  if (a < 0.004) discard;

  gl_FragColor = vec4(vColor, clamp(a * limb, 0.0, 1.0));
}
`;

/* ===========================================================================
   THE BEAM

   The shaft does something the ring cannot do by construction: TWO quantities
   in two channels that do not compete. The ring puts magnitude into its radius,
   and radius competes with readability — in a swarm the circles overlap.
   Height does not: shafts side by side stay separately readable.

   HEIGHT = MAGNITUDE, COLOUR = DEPTH, from beamBase plus magnitude squared
   times beamMultiplier.

   A QUAD AND NOT A CYLINDER. The old version built a CylinderGeometry of 16
   segments plus a second cylinder around it for the glow, per event, in
   JavaScript — that is where 1409 draw calls came from. This is one instanced
   quad of two triangles that turns towards the camera in the vertex shader.
   Blended additively a billboard looks the same as a cylinder, because there is
   no lighting that would give the curvature away.

   THE FOOT STAYS ON RADIUS 100, and that is the condition under which this
   layer was allowed back. Height costs parallax: at camera distance 105 a
   floating indicator drifted 222 px from the spot it pointed at. A beam solves
   that without giving up its height — the FOOT does the pointing and stays on
   the surface, only the top sticks out. It is also why the label hangs at the
   foot and not at the top.
   =========================================================================== */

export const QUAKE_BEAM_VERT = /* glsl */`
precision highp float;
${QUAKE_STACK_GLSL}
${ICON_SCALE_GLSL}
${PICK_GLSL}
attribute vec3  aNormal;
attribute vec3  aColor;
attribute float aMagFrac;
attribute float aAge;
attribute float aSeed;

uniform float uCamDist;
uniform float uLift;              // uRadius comes from the stacking block
uniform float uBeamSink;
uniform float uBeamBase;
uniform float uBeamPerMag;
uniform float uBeamWidth;
uniform float uMagMin;
uniform float uMagSpan;
uniform float uBeamScaleWithZoom;
/* THE CAMERA IN LOCAL SPACE, AS A UNIFORM. */
uniform vec3 uCamLocal;

varying vec3  vColor;
varying float vAge;
varying float vSeed;
varying float vLangs;
varying float vDwars;
varying vec3  vWorld;
varying float vHover;
varying float vDemp;

void main() {
  vColor = aColor;
  vHover = aangewezen();
  vDemp  = dempFactor();
  vAge   = aAge;
  vSeed  = aSeed;
  // the uv of the base quad: x across, y along the shaft
  vDwars = uv.x * 2.0 - 1.0;
  vLangs = uv.y;

  float amt = stackAmount(uCamDist);
  float sc  = iconScale(uCamDist);
  vec3 n = stackedNormal(normalize(aNormal), amt);

  /* THE MAGNITUDE BACK OUT OF THE FRACTION. aMagFrac is normalised over
     [quakeMagMin, quakeMagMax] because that is where the ring takes its radius
     from; the beam wants the raw number, because the formula squares it and a
     fraction squared is something else entirely. */
  float mag = uMagMin + clamp(aMagFrac, 0.0, 1.0) * uMagSpan;
  float hoogte = (uBeamBase + mag * mag * uBeamPerMag);
  // Scaling with the zoom is a CHOICE and lives on a uniform: a screen-fixed
  // shaft stays readable, a world-sized one tells you the scale of the planet.
  hoogte *= mix(1.0, sc, clamp(uBeamScaleWithZoom, 0.0, 1.0));

  /* uLift HAS TO BE INCLUDED. It is the height the VIEW MODE sets — the ring in
     schematic view sits 1.3 above the surface — and the ring does
     uLift + stackLift. Leave it out and the beam foot starts 1.3 units lower,
     visible as a streak under the indicator.

     uBeamSink lets the foot start a little BELOW that spot, so no seam falls
     between the beam and the indicator. It has to stay small: whatever sticks
     out below belongs inside the core of the ring and must not read as a
     separate streak.

     AND IT SCALES WITH THE ZOOM, exactly like the height (session 42, Terry).
     Without that it is a fixed world distance while the indicator is screen
     sized, so zooming in grows it relative to the ring. Measured as
     sink / ring radius: 0.019 at camera 450, 0.038 at 200, 0.199 at 120 and
     1.263 at 104 — a full ring radius below the indicator, which is the streak
     that showed up in the schematic view. Schematic is the only place it was
     visible because realistic stops at 120. */
  float lift = uLift + stackLift(amt, sc);
  float sink = uBeamSink * mix(1.0, sc, clamp(uBeamScaleWithZoom, 0.0, 1.0));
  vec3 voet = n * (uRadius + lift);

  /* TURN TOWARDS THE CAMERA. The shaft runs along n; the width has to be
     staan op n EN op de blikrichting, anders kijk je er op zijn smalst tegenaan
     en verdwijnt hij. cameraPosition is wereldruimte, dus de kijkrichting wordt
     hier in lokale ruimte gehaald via de inverse modelMatrix — de laag hangt
     onder de globe-wortel en die draait. */
  vec3 kijk = normalize(uCamLocal - voet);
  vec3 dwars = cross(n, kijk);
  float len = length(dwars);
  // Looking straight along the shaft makes the cross product degenerate: pick
  // an arbitrary perpendicular instead of producing a NaN.
  if (len < 1e-4) {
    vec3 up = abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    dwars = normalize(cross(n, up));
  } else {
    dwars /= len;
  }

  float halveBreedte = uBeamWidth * sc * (0.35 + 0.65 * clamp(aMagFrac, 0.0, 1.0));
  vec3 lokaal = voet + n * (hoogte * vLangs - sink) + dwars * (halveBreedte * vDwars);

  vWorld = (modelMatrix * vec4(lokaal, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(lokaal, 1.0);
}
`;

export const QUAKE_BEAM_FRAG = /* glsl */`
precision highp float;

uniform float uOpacity;
uniform float uBeamCore;
uniform float uBeamFalloff;
uniform vec2 uHorizonBand;
uniform float uBeamOn;
uniform float uHoverIdx;
uniform float uHoverBoost;
uniform float uDimOthers;

varying vec3  vColor;
varying float vAge;
varying float vSeed;
varying float vLangs;
varying float vDwars;
varying vec3  vWorld;
varying float vHover;
varying float vDemp;

/* The same limb band as the ring and the shockwave. Repeated here and not
   shared, because every shader is its own program; the shape has to stay equal
   to the one in QUAKE_RING_FRAG. */
float limbFade(vec3 wereldPunt) {
  return smoothstep(uHorizonBand.x, uHorizonBand.y,
                    dot(normalize(wereldPunt), normalize(cameraPosition)));
}

void main() {
  if (uBeamOn < 0.5) discard;
  /* THE FOOT IS NOT CLIPPED BY THE HORIZON, the rest is. A shaft at the edge of
     the globe sticks outwards and should stay visible there — that is exactly
     where it reads best. Only what stands BEHIND the globe disappears, and we
     test that on the point itself. */
  float limb = limbFade(vWorld);
  if (limb <= 0.0) discard;

  // cross profile: bright heart, soft flanks
  float d = abs(vDwars);
  float kern = pow(max(1.0 - d, 0.0), max(uBeamCore, 0.01));
  // length profile: full at the foot, fading towards the top
  float langs = pow(max(1.0 - vLangs, 0.0), max(uBeamFalloff, 0.01));
  float a = kern * langs * uOpacity * (1.0 - 0.55 * clamp(vAge, 0.0, 1.0));
  // The same two channels as the ring; see the note there.
  float opTil = 1.0 + uHoverBoost * vHover;
  a *= vDemp * opTil;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * (0.75 + 0.85 * kern) * opTil, clamp(a * limb, 0.0, 1.0));
}
`;
