/* ============================================================
   TERRA — Texture bitmaps · one decoder for every image texture
   ------------------------------------------------------------
   three.js uploads a texture with `flipY`, and WebGL ignores that flag
   for an ImageBitmap. A bitmap decoded as it comes lands with its top
   row at v = 0, and every surface that reads higher v as further up
   then shows the picture upside down — with nothing in the scene, the
   uniforms or the console to say so.

   SO THE PICTURE IS TURNED OVER WHILE IT IS DECODED, and a texture made
   from this bitmap sets `flipY = false`. Never in a shader: a browser
   that did honour the texture flag would then turn it twice.

   MEASURED on the sun state, session 53: a frame decoded without the
   turn correlates 0.957 with its source upside down and 0.261 with the
   source as it is, and the NOAA regions drawn over it sit no closer to
   the sunspots than random points do.

   Every image texture goes through here — the tile shell, the sun's
   slots, the flipbook frames — so the rule is kept in one place.
   tools/check-texture-bitmap.mjs holds every caller to it.
   ============================================================ */

/**
 * A bitmap for a texture that does not flip: its first row is the bottom row
 * of the picture.
 *
 * @param {Blob|HTMLCanvasElement|ImageBitmap} source
 * @returns {Promise<ImageBitmap>}
 */
export async function decodeTextureBitmap(source) {
  try {
    return await createImageBitmap(source, { imageOrientation: 'flipY' });
  } catch {
    /* An engine that throws on the option: decode as it comes, then turn it
       over in a canvas. An engine that ignores the option without throwing is
       not caught here, and would show the picture upside down. */
    const plain = await createImageBitmap(source);
    const canvas = document.createElement('canvas');
    canvas.width = plain.width;
    canvas.height = plain.height;
    const g = canvas.getContext('2d');
    g.translate(0, plain.height);
    g.scale(1, -1);
    g.drawImage(plain, 0, 0);
    plain.close();
    return createImageBitmap(canvas);
  }
}
