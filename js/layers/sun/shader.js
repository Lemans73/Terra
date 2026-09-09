/* ============================================================
   TERRA — Sun · one shader for the sphere and the plane
   ------------------------------------------------------------
   THE WHOLE POINT, IN ONE SENTENCE
   Under an orthographic projection a sphere and a plane perpendicular
   to the view direction land on exactly the same screen coordinates.
   The UV formula below depends only on xy and never on z, so both
   meshes read the same texel at every pixel. There is no seam between
   the disc and the layer outside the limb, because there is nothing to
   seam: the plane coincides, by construction, with what it replaces.

   That buys three things at once. The sphere occludes whatever is drawn
   behind it. The plane brings back the prominences and the coronal
   material outside the limb, which a sphere alone throws away. And the
   fade between them is a fade into the same picture rather than into
   black.

   THE PLANE MUST FADE COMPLEMENTARY TO THE SPHERE. Both are drawn, both
   are transparent, so inside the disc their alphas add. Left alone, an
   additive stack counts the disc twice and the sun grows a bright ring
   at the limb. `1 - smoothstep(...)` against the sphere's own
   `smoothstep(...)` makes the pair sum to exactly 1 everywhere.

   WORLD SPACE, NOT VIEW SPACE. An earlier version computed the lookup
   from view-space xy. That holds until you pan: view-space xy is then no
   longer world xy, and the texture slides along with the camera instead
   of staying on the sun.

   THE UV NEEDS A SOFT EDGE. Without one, ClampToEdge smears the border
   texel across the whole surface as soon as you pan outside the fetched
   crop — a full-screen wash of one colour, which reads as a broken
   shader rather than as an empty region.

   WHAT IS DELIBERATELY ABSENT
   The proof of concept carried a scale and rotation trim per layer. They
   are gone: a control that lets you make a layer agree when it does not
   agree is a control that produces a false picture. When those sliders
   ran into their end stops, that was the diagnosis — the misfit between
   a coronagraph and a disc instrument is a coordinate transform, not a
   calibration. Coronagraphs run solo instead.
   ============================================================ */

export const SUN_VERT = `
varying vec3 vNormalView;
varying vec3 vWorld;

void main() {
  vNormalView = normalMatrix * normal;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const SUN_FRAG = `
uniform sampler2D uMap;
uniform vec2  uCenter;     // crop centre, in solar radii
uniform float uSunFrac;    // 1 / field radius
uniform float uEdge;       // field radius, in solar radii
uniform float uFade;       // mu threshold at the limb
uniform float uOpacity;
uniform float uLuma;       // 1 = key black out, for coronagraphs
uniform float uMask;       // 1 = circular mask at the field edge
uniform float uWorldR;     // one solar radius, in world units
uniform float uIsSphere;
uniform float uHasSphere;  // does this layer have a sphere as well?
uniform float uHasMap;
uniform float uFlipY;

varying vec3 vNormalView;
varying vec3 vWorld;

void main() {
  if (uHasMap < 0.5) discard;

  // Back to solar radii. The group is scaled to Terra's world units so that
  // globe.gl's camera distances still mean something; everything from here on
  // is in radii, the way every quantity from the metadata is.
  vec2 obs = vWorld.xy / uWorldR;

  vec2  d = obs - uCenter;
  float r = length(d);

  vec2 p = d * uSunFrac * 0.5;
  if (uFlipY > 0.5) p.y = -p.y;
  vec2 uv = vec2(0.5) + p;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;

  vec3  c = texture2D(uMap, uv).rgb;
  float a = uOpacity;

  if (uIsSphere > 0.5) {
    // Orthographic: the view direction is +z, and the sphere is the unit
    // sphere about the origin, so its world position is its own normal.
    float mu = normalize(vWorld / uWorldR).z;
    if (mu <= 0.0) discard;
    a *= smoothstep(0.0, uFade, mu);

    vec2 e = min(uv, 1.0 - uv);
    a *= smoothstep(0.0, 0.004, min(e.x, e.y));
  } else {
    if (uMask > 0.5) a *= 1.0 - smoothstep(uEdge * 0.86, uEdge * 0.995, r);

    // The complementary fade. Inside the disc the sphere contributes
    // smoothstep(0, uFade, mu); this is one minus that, so the two always
    // sum to exactly 1 and an additive stack cannot double-count.
    if (uHasSphere > 0.5 && r < 1.0) {
      float mu = sqrt(max(0.0, 1.0 - r * r));
      a *= 1.0 - smoothstep(0.0, uFade, mu);
    }
  }

  if (uLuma > 0.5) {
    float L = dot(c, vec3(0.299, 0.587, 0.114));
    a *= smoothstep(0.015, 0.20, L);
  }

  if (a <= 0.002) discard;
  gl_FragColor = vec4(c, a);
}
`;

/* The limb fade is fixed at 0.28. It was a slider while we were finding out
   what it did; it is not a question the reader of a solar image should be
   asked. */
export const SUN_FADE = 0.28;

export function sunUniforms(THREE, isSphere, worldR) {
  return {
    uMap:       { value: null },
    uCenter:    { value: new THREE.Vector2(0, 0) },
    uSunFrac:   { value: 1 },
    uEdge:      { value: 1.65 },
    uFade:      { value: SUN_FADE },
    uOpacity:   { value: 1 },
    uLuma:      { value: 0 },
    uMask:      { value: 1 },
    uWorldR:    { value: worldR },
    uIsSphere:  { value: isSphere ? 1 : 0 },
    uHasSphere: { value: 1 },
    uHasMap:    { value: 0 },
    uFlipY:     { value: 0 }
  };
}
