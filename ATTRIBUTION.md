# Attribution

Terra is released under the MIT license (see `LICENSE`). That license covers the
source code only. The imagery, map data, live feeds and libraries listed below
carry their own terms, and several of them require credit. This file is that
credit.

Verified on 2026-07-30.

---

## Imagery

### Earth and star textures

**Solar System Scope** &nbsp;·&nbsp; [solarsystemscope.com/textures](https://www.solarsystemscope.com/textures/)
&nbsp;·&nbsp; **CC BY 4.0**

> Textures by [Solar System Scope](https://www.solarsystemscope.com/textures/),
> licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Every texture the application loads comes from this source, in both the 2K and
the 8K set: day map, night map, clouds, normal map, specular map and the Milky
Way starfield.

The normal and specular maps in `assets/earth/` are format conversions (TIFF to
PNG) of the originals, which are distributed as TIFF. The source TIFFs are not
included in this repository — browsers cannot display them, so shipping them
would add roughly 11 MB that no visitor would ever load. They remain available
from Solar System Scope at the link above. CC BY 4.0 permits adaptation as long
as attribution is given, which it is here and in the application interface.

---

## Map data

### Tectonic plate boundaries

**PB2002** &nbsp;·&nbsp; [github.com/fraxen/tectonicplates](https://github.com/fraxen/tectonicplates)
&nbsp;·&nbsp; **ODC-BY 1.0**

Original data: Peter Bird (2003), *An updated digital model of plate boundaries*,
Geochemistry Geophysics Geosystems 4(3).
GeoJSON conversion and packaging: Hugo Ahlenius, [Nordpil](https://nordpil.com/).

Distributed under the
[Open Data Commons Attribution License 1.0](https://opendatacommons.org/licenses/by/1.0/),
which requires attribution to the source.

File: `assets/geo/PB2002_boundaries.json`

### Country borders, country labels and coastlines

**Natural Earth** &nbsp;·&nbsp; [naturalearthdata.com](https://www.naturalearthdata.com/)
&nbsp;·&nbsp; **Public domain**

Natural Earth explicitly states that no permission is needed and that crediting
the authors is unnecessary. It is credited here anyway, following their suggested
citation: *Made with Natural Earth.*

Files: `assets/geo/ne_110m_admin_0_countries.geojson`, `assets/geo/ne_110m_land.geojson`

---

## Live data sources

### Earthquakes

**USGS Earthquake Hazards Program** &nbsp;·&nbsp; [earthquake.usgs.gov](https://earthquake.usgs.gov/)

Work of the United States Geological Survey, a US government agency. Public
domain, no restriction on use.

### Volcanoes, wildfires, storms and sea ice

**NASA EONET** (Earth Observatory Natural Event Tracker) &nbsp;·&nbsp;
[eonet.gsfc.nasa.gov](https://eonet.gsfc.nasa.gov/)

NASA content is generally not copyrighted and may be used freely. EONET
aggregates events from partner sources; those partners are named in the API
response and shown in the application whenever they are supplied.

### Air quality

**World Air Quality Index Project** &nbsp;·&nbsp; [aqicn.org](https://aqicn.org/)

Attribution to the World Air Quality Index Project and to the originating
environmental agency is mandatory under their API terms, and both are shown in
the readout panel for every station.

Their terms restrict use to non-commercial purposes: the data may not be sold,
included in sold packages, or used in paid applications or services, and it may
not be redistributed as cached or archived content. Terra queries the API live,
stores nothing, and is published as a free, non-commercial demonstration.

### Lightning

**Blitzortung.org** &nbsp;·&nbsp; [blitzortung.org](https://www.blitzortung.org/)

A volunteer network of station operators. Their data is available for
non-commercial use only, and access requires contributing station data.

The lightning layer is **not part of this repository and not part of the public
demo.** It depends on a permanently connected WebSocket relay, which cannot run
on serverless hosting, and it therefore only exists in the local development
setup. It is listed here for completeness.

---

## Libraries

All loaded from [esm.sh](https://esm.sh/) at pinned versions, declared in the
import map in `index.html`.

| Library | Version | License | Author |
|---|---|---|---|
| [three.js](https://threejs.org/) | 0.184.0 | MIT | mrdoob and contributors |
| [globe.gl](https://github.com/vasturiano/globe.gl) | 2.46.1 | MIT | Vasco Asturiano |
| [three-globe](https://github.com/vasturiano/three-globe) | via globe.gl | MIT | Vasco Asturiano |
| [GSAP](https://gsap.com/) | 3.15.0 | Standard "No Charge" GSAP license | Webflow |

GSAP has been free for commercial and open source use since 30 April 2025, with
no attribution requirement. It is credited here as a courtesy.

---

## A note on scope

Terra is a non-commercial demonstration project. It sells nothing, serves no
advertising and collects no visitor data. Two of the live sources above (WAQI and
Blitzortung) permit non-commercial use only, and that boundary is the reason this
distinction is stated explicitly rather than left implicit.

Questions about attribution or licensing: Nimbus Agency.nl | Interactive Media.
