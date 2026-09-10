/* ============================================================
   TERRA — Sun · the bare sun, as a photosphere
   ------------------------------------------------------------
   WHAT THIS IS FOR. Before any frame has been fetched the view shows
   Terra's own sun. It used to be one flat colour well above 1 per
   channel, so that the bloom had something to take hold of — and that
   bloom then washed out the NOAA region caps drawn on top of it. The
   caps were there; nothing could be seen of them.

   Giving the sphere a surface fixes that at the source: the caps now
   have something to be darker THAN.

   IT IS A DRAWING, NOT AN OBSERVATION, and the difference matters here
   more than anywhere else in this layer. Everything else on this sphere
   comes from an instrument. This does not — so it must not be able to
   pass for one.

   Two rules keep it on the right side of that line, and they pull in
   opposite directions on purpose:

     LIMB DARKENING IS REAL, so it is modelled properly. I(mu)/I(0) =
     1 - u(1 - mu), u = 0.6 for white light. It is what makes a sun read
     as a sphere rather than as a disc, and it is a law rather than a
     texture, so it invents nothing.

     GRANULATION IS NOT REAL HERE, so it stays under the resolution at
     which anyone could mistake it for structure. Real granules are
     about 1000 km against a radius of 695700 — roughly one part in 700,
     which at any sane screen size is below a pixel. What is drawn is a
     coarser cell pattern at very low contrast: enough for the surface to
     stop reading as flat paint, far too little to read as detail. No
     feature in it corresponds to anything on the sun, and none of it
     ever lines up with a region.

   NO SPOTS ARE DRAWN HERE. The dark caps stay what they have always
   been: NOAA's measured positions, drawn by spots.js. A shader that
   painted its own spots would be inventing measurements, which is the
   one thing this whole state exists to avoid.
   ============================================================ */

export const PHOTOSPHERE_VERT = `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/* The hash is the usual sin-fract one. It is not a good random number
   generator and does not need to be: what it feeds is a low-contrast wash,
   where a repeat nobody can see costs nothing and a real noise texture would
   cost a fetch. */
export const PHOTOSPHERE_FRAG = `
uniform vec3  uColor;
uniform float uLimb;      // limb darkening coefficient, 0.6 for white light
uniform float uGrain;     // granulation contrast, 0 turns it off entirely
uniform float uScale;     // cells across one radius
varying vec3 vPos;

float hash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

/* Value noise on a 3d lattice. On the sphere rather than in screen space, so
   the pattern belongs to the surface and does not swim when the camera moves. */
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
             mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}

void main() {
  vec3 n = normalize(vPos);

  /* Orthographic projection, so the view direction is +z everywhere and mu is
     simply the z of the normal. Under perspective this would need the real eye
     vector; here that would be the same number with extra steps. */
  float mu = clamp(n.z, 0.0, 1.0);
  float limb = 1.0 - uLimb * (1.0 - mu);

  // Two octaves. A third adds cost and nothing the eye can find at this contrast.
  float g = noise(n * uScale) * 0.65 + noise(n * uScale * 2.7) * 0.35;
  float grain = 1.0 + (g - 0.5) * uGrain;

  gl_FragColor = vec4(uColor * limb * grain, 1.0);
}
`;

/* The colour sits just above 1 so the bloom still has something to take, but
   nowhere near the 2.6 of the flat version — that was what erased the caps.
   The value is deliberately paired with spots.js's cap colour: see the
   measurement note there. */
export function photosphereUniforms(THREE) {
  return {
    uColor: { value: new THREE.Color().setRGB(1.35, 1.22, 1.05) },
    uLimb:  { value: 0.6 },
    uGrain: { value: 0.055 },
    uScale: { value: 46 }
  };
}
