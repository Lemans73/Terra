/* ============================================================
   TERRA — Tile sources · the data contract for imagery
   ------------------------------------------------------------
   A source is DATA: which grid it sits on, how deep it goes, the
   URL template, its attribution, and what to fall back to. No
   three.js here and no network — this file is read by the
   quadtree, by the loader and by the credits panel alike.

   THREE RULES THAT ARE NOT NEGOTIABLE, and each one cost a day
   in the proof of concept:

     1  THE GRID BELONGS TO THE SOURCE, not to the app. Switching
        source rebuilds the tree, because the same z/x/y means a
        different piece of earth on a different grid.

     2  FALLING BACK IS ONLY ALLOWED WITHIN THE SAME GRID. EOX
        uses 180-degree tiles and GIBS 288-degree ones. Falling
        back across that boundary shows the wrong place and says
        nothing about it. checkSources() below refuses it, and
        tools/check-tile-sources.mjs refuses it before it ships.

     3  NEVER ASK DEEPER THAN maxLevel. Below that the four
        sibling tiles would each request the very same ancestor,
        four times over. Climb to the ancestor and let the shader
        magnify, the way every map does.

   NAMES ARE PREFIXED because tools/build-standalone.mjs pours
   every module into ONE scope: `SOURCES` is already taken by the
   magnetosphere registry and `DEG` by js/sunmoon.js.
   ============================================================ */

export const TILE_DEG = Math.PI / 180;

/* A grid is rectangular on purpose: not every source uses square tiles, and a
   single equirectangular texture is simply a grid of 360 by 180 degrees with one
   tile at level 0. That is what lets the world texture be a SOURCE rather than a
   second render path. */
export const TILE_GRIDS = {
  // Standard WMTS WGS84: level 0 is 2 x 1 tiles of 180 degrees.
  wgs84: { originLon: -180, originLat: 90, spanLon0: 180, spanLat0: 180, tileSize: 256 },
  /* GIBS: bounding box -180, 90, 396, -198. Level 0 is 2 x 1 tiles of 288
     degrees, of which only part is real earth. Assuming 180 here means resampling
     every tile out of two GIBS tiles, with seams and double the traffic. */
  gibs: { originLon: -180, originLat: 90, spanLon0: 288, spanLat0: 288, tileSize: 512 },
  /* One texture over the whole world. `tileSize` is the width of the file and is
     set when it is known, because that is what decides the geometric error. */
  single: { originLon: -180, originLat: 90, spanLon0: 360, spanLat0: 180, tileSize: 2048 }
};

/* The EOX layer identifiers, from their GetCapabilities. The 2016 vintage is
   called `s2cloudless` WITHOUT a year — with a year the server answers 400.

   LICENCE PER VINTAGE, and it matters: 2016 and 2017 are CC BY 4.0 and may be
   used commercially, 2018 onward are CC BY-NC-SA 4.0 and may not. Terra is free,
   so the newest is fine — but the moment Terra earns anything this whole block
   has to be revisited. */
export const EOX_VINTAGES = [
  { year: '2016', layer: 's2cloudless',      licence: 'CC BY 4.0',        commercial: true },
  { year: '2017', layer: 's2cloudless-2017', licence: 'CC BY 4.0',        commercial: true },
  { year: '2018', layer: 's2cloudless-2018', licence: 'CC BY-NC-SA 4.0',  commercial: false },
  { year: '2020', layer: 's2cloudless-2020', licence: 'CC BY-NC-SA 4.0',  commercial: false },
  { year: '2022', layer: 's2cloudless-2022', licence: 'CC BY-NC-SA 4.0',  commercial: false },
  { year: '2024', layer: 's2cloudless-2024', licence: 'CC BY-NC-SA 4.0',  commercial: false },
  { year: '2025', layer: 's2cloudless-2025', licence: 'CC BY-NC-SA 4.0',  commercial: false }
];

export const EOX_DEFAULT_VINTAGE = '2025';

export const TILE_SOURCES = {
  /* The world texture the app already loads, as a source with maxLevel 0. The
     quadtree asks for tile (0,0,0) and (0,1,0) and gets two UV cutouts of one
     image; splitting stops there because the source says there is nothing
     deeper.

     THIS IS WHAT MAKES ONE RENDER PATH POSSIBLE instead of two. It is also the
     control: with this source the shell has to look exactly like the sphere it
     covers, and any difference is a bug in the shell and not in the imagery. */
  'world-texture': {
    label: 'Terra world texture',
    grid: 'single', minLevel: 0, maxLevel: 0, kind: 'local',
    fallback: null, subdomains: null, url: null,
    attribution: {
      name: 'Blue Marble Next Generation', by: 'NASA Earth Observatory',
      url: 'https://visibleearth.nasa.gov/', licence: 'Public domain, credit requested',
      note: 'Bathymetry from GEBCO'
    }
  },

  'eox-cloudless': {
    label: 'Sentinel-2 cloudless (10 m, cloud-free)',
    grid: 'wgs84', minLevel: 1, maxLevel: 13, kind: 'yearly',
    /* EOX Blue Marble sits on the SAME grid, so here a per-tile fallback is
       allowed. Against GIBS it would not be — see rule 2 at the top. */
    fallback: 'eox-bluemarble', subdomains: null,
    url: 'https://tiles.maps.eox.at/wmts/1.0.0/{layer}/default/WGS84/{z}/{y}/{x}.jpg',
    attribution: {
      name: 'Sentinel-2 cloudless', by: 'EOX IT Services GmbH', url: 'https://s2maps.eu',
      licence: 'CC BY-NC-SA 4.0', note: 'Contains modified Copernicus Sentinel data'
    }
  },

  'eox-bluemarble': {
    label: 'Blue Marble (500 m, static)',
    grid: 'wgs84', minLevel: 1, maxLevel: 8, kind: 'static',
    fallback: null, subdomains: null,
    url: 'https://tiles.maps.eox.at/wmts/1.0.0/bluemarble/default/WGS84/{z}/{y}/{x}.jpg',
    attribution: {
      name: 'Blue Marble', by: 'EOX IT Services GmbH', url: 'https://maps.eox.at',
      licence: 'Credit required', note: 'Imagery: NASA'
    }
  }
};

/* ------------------------------------------------------------
   GRID ARITHMETIC. The grid is passed in rather than read from a
   module-level `current`: two sources with different grids can be
   alive at once during a switch, and a hidden global would then
   answer for the wrong one.
------------------------------------------------------------ */

export const tileSpanLon = (g, level) => g.spanLon0 / Math.pow(2, level);
export const tileSpanLat = (g, level) => g.spanLat0 / Math.pow(2, level);
export const tileCountX = (g, level) => Math.ceil(360 / tileSpanLon(g, level));
export const tileCountY = (g, level) => Math.ceil(180 / tileSpanLat(g, level));

export function tileBounds(g, level, x, y) {
  const sx = tileSpanLon(g, level), sy = tileSpanLat(g, level);
  return {
    west: g.originLon + x * sx, east: g.originLon + (x + 1) * sx,
    north: g.originLat - y * sy, south: g.originLat - (y + 1) * sy
  };
}

/* Tiles that hang over the edge of the world get trimmed for their GEOMETRY
   while keeping their original UVs — the image still covers the full tile. Tiles
   entirely outside simply do not exist and are never created. */
export function clipToWorld(b) {
  const c = {
    west: Math.max(b.west, -180), east: Math.min(b.east, 180),
    north: Math.min(b.north, 90), south: Math.max(b.south, -90)
  };
  return (c.east - c.west <= 1e-9 || c.north - c.south <= 1e-9) ? null : c;
}

/* Longitude/latitude to a point on the globe, in three-globe's world frame.

   MEASURED against world.getCoords(), which is the existing truth in this app:
   longitude 0 lies on +Z and longitude 90 on +X. Any other arrangement puts the
   tiles somewhere else than every marker, path and label in the scene, and it
   looks plausible while being wrong — the globe is a sphere, so a rotated one is
   still a globe. checkFrame() in the shell verifies this against getCoords. */
export function lonLatToVec3(lon, lat, r, out) {
  const la = lat * TILE_DEG, lo = lon * TILE_DEG, c = Math.cos(la);
  return out.set(r * c * Math.sin(lo), r * Math.sin(la), r * c * Math.cos(lo));
}

export function tileUrl(src, z, x, y, opts = {}) {
  if (!src.url) return null;
  const vintage = EOX_VINTAGES.find((v) => v.year === (opts.vintage || EOX_DEFAULT_VINTAGE));
  let u = src.url
    .replace('{z}', z).replace('{x}', x).replace('{y}', y)
    .replace('{layer}', vintage ? vintage.layer : '');
  if (src.subdomains) u = u.replace('{s}', src.subdomains[(x + y) % src.subdomains.length]);
  return u;
}

/* What the credits panel needs: the active source plus everything it can fall
   back to, deduplicated, in the order the visitor would meet them. Structured
   and not HTML — the panel decides how it looks. */
export function tileAttribution(sourceId) {
  const seen = new Map();
  let id = sourceId, guard = 0;
  while (id && TILE_SOURCES[id] && guard++ < 4) {
    seen.set(id, { id, ...TILE_SOURCES[id].attribution });
    id = TILE_SOURCES[id].fallback;
  }
  return [...seen.values()];
}

/* THE GUARD RAIL, AT STARTUP AND IN THE BUILD. Rule 2 is an agreement that no
   type checker enforces, so it is checked here as well: a fallback across grids
   is silently wrong, and silently wrong is the worst kind.

   Returns a list of problems — empty means sound. */
export function checkSources(sources = TILE_SOURCES, grids = TILE_GRIDS) {
  const fouten = [];
  for (const [id, s] of Object.entries(sources)) {
    if (!grids[s.grid]) fouten.push(`${id}: unknown grid "${s.grid}"`);
    if (s.maxLevel < s.minLevel) fouten.push(`${id}: maxLevel ${s.maxLevel} below minLevel ${s.minLevel}`);
    if (s.fallback) {
      const f = sources[s.fallback];
      if (!f) fouten.push(`${id}: fallback "${s.fallback}" does not exist`);
      else if (f.grid !== s.grid) fouten.push(`${id}: falls back to "${s.fallback}" on grid "${f.grid}" instead of "${s.grid}"`);
    }
    const a = s.attribution;
    if (!a || !a.name) fouten.push(`${id}: no attribution.name`);
    else if (!a.licence) fouten.push(`${id}: no attribution.licence`);
  }
  return fouten;
}
