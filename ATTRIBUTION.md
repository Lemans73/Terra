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

In both the 2K and the 8K set: day map, night map, clouds, normal map, specular
map and the Milky Way starfield. Everything except the ocean floor variant below.

The normal and specular maps in `assets/earth/` are format conversions (TIFF to
PNG) of the originals, which are distributed as TIFF. The source TIFFs are not
included in this repository — browsers cannot display them, so shipping them
would add roughly 11 MB that no visitor would ever load. They remain available
from Solar System Scope at the link above. CC BY 4.0 permits adaptation as long
as attribution is given, which it is here and in the application interface.

### Ocean floor

**NASA Earth Observatory** &nbsp;·&nbsp; Blue Marble Next Generation
&nbsp;·&nbsp; [visibleearth.nasa.gov](https://visibleearth.nasa.gov/)

> Blue Marble Next Generation, NASA Earth Observatory (Reto Stöckli).
> Ocean bathymetry from [GEBCO](https://www.gebco.net/).

Turning on **Ocean floor** in Settings replaces the day map with
`*_earth_daymap_bathy.jpg`. Those two files are composites, not NASA's image as
published: the land is the Solar System Scope day map above, unchanged, and only
the ocean comes from NASA's topography-and-bathymetry release
(`world.topo.bathy.200409`, September 2004). The two are joined along the
specular map, which already serves as the land/sea mask in the shader.

The reason for compositing rather than substituting: NASA's image is a different
month than the Solar System Scope one, so using it whole would also change snow
line, vegetation and colour balance across every continent — a setting called
"Ocean floor" should change the ocean floor. Alignment was verified before
compositing: the best-fitting offset between the two sources is zero pixels at
8192×4096.

NASA imagery is free to use with attribution. The source images are not in this
repository — they are 27 MB and 23 MB, and only the derived composites are ever
loaded.

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

**EMSC-CSEM** (European-Mediterranean Seismological Centre) &nbsp;·&nbsp;
[emsc-csem.org](https://www.emsc-csem.org/) &nbsp;·&nbsp; via the FDSN event
service on [seismicportal.eu](https://www.seismicportal.eu/)

A non-profit that aggregates the real-time solutions of national seismological
institutes across Europe and beyond. Free access for non-commercial use, with
attribution. The contributing institute is named per event in the `auth` field
and is shown in the readout — "EMSC · BMKG" credits both the aggregator and the
agency that made the measurement.

### Volcanoes, wildfires, storms and sea ice

**NASA EONET** (Earth Observatory Natural Event Tracker) &nbsp;·&nbsp;
[eonet.gsfc.nasa.gov](https://eonet.gsfc.nasa.gov/)

NASA content is generally not copyrighted and may be used freely. EONET
aggregates events from partner sources; those partners are named in the API
response and shown in the application whenever they are supplied.

### Solar activity

**NOAA Space Weather Prediction Center** &nbsp;·&nbsp;
[swpc.noaa.gov](https://www.swpc.noaa.gov/) &nbsp;·&nbsp; data via
[services.swpc.noaa.gov](https://services.swpc.noaa.gov/)

Work of the National Oceanic and Atmospheric Administration, a US government
agency. Public domain, no restriction on use. Four products are used: the daily
solar region summary (sunspot groups, their heliographic position, area and
classification), the flare probabilities, the GOES X-ray flare summary and the
10.7 cm solar flux.

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

## Algorithms

### Positions of the Sun and the Moon

**Jean Meeus**, *Astronomical Algorithms*, 2nd edition (Willmann-Bell, 1998)

The Sun and Moon positions in `js/sunmoon.js` are computed from the methods in
that book: chapter 12 (sidereal time), chapter 22 (nutation and obliquity),
chapter 25 (solar coordinates), chapter 47 (lunar position, a truncated form of
ELP-2000/82) and chapter 48 (illuminated fraction of the Moon). Delta-T uses the
polynomial published by Fred Espenak and Jean Meeus for the years 2005 to 2050.

Mathematical methods are not copyrightable and no permission is required to
implement them. The credit is given because the work deserves it and because
knowing which reference an implementation follows is what makes it checkable.

The implementation is verified against Meeus' own worked examples and against
published events: solar right ascension and declination within 0.5 arcseconds,
lunar longitude within 2 arcseconds, the new moon of 18 January 2026 within one
minute, and an eclipse gamma of 0.9015 against a published 0.8977. On the ground
that is roughly 2 km of positional error, well under one pixel at any zoom level
Terra allows.

No network request and no API key is involved: the positions are calculated in
the browser.

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

Questions about attribution or licensing: NimbusAgency.nl | Interactive Media.
