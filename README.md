# Terra

I wanted to know whether the earthquakes that make the news are the big ones.

Terra is an interactive Three.js/WebGL globe that plots geophysical data on Earth:
earthquakes, volcanoes, wildfires, storms and sea ice, each as its own layer
with its own 3D indicator.

There is also a view that leaves the surface behind. The magnetosphere is the
cavity the Earth's magnetic field carves out of the solar wind, and Terra draws
it from the wind that is arriving right now: the boundary where the two press
against each other, the bow shock outside it, the field lines traced through
the cavity, and the wind itself flowing around the nose.

It does not only show now. A time control moves the whole scene — sunlight,
the Moon, the Earth's axis and the events themselves — to any moment the
sources can reach, which for earthquakes is 1900. Layers that cannot follow say
so instead of quietly showing today's data under an old date.

It is static HTML. No build step, no bundler, no framework. Open the file and
it runs. **[Download terra.html](https://github.com/Lemans73/Terra/releases/latest/download/terra.html)**

Updates to come!

![Terra plotting live earthquakes on a shaded globe](docs/screenshot.jpg)

**[Live demo](https://terra.terryelemans.nl)** · **[Download terra.html](https://github.com/Lemans73/Terra/releases/latest/download/terra.html)**
— one file, no install, no clone. Details under [Running it
locally](#running-it-locally).

Earthquakes (USGS or EMSC), natural events (NASA EONET) and everything Terra
computes for itself work out of the box with no API key. Air quality and
lightning need your own key or a local relay, see below.

## Layers and sources

Observed — fetched from somewhere:

| Layer | Source | Travels back to | Notes |
|---|---|---|---|
| Earthquakes | [USGS](https://earthquake.usgs.gov/fdsnws/event/1/) or [EMSC](https://www.seismicportal.eu/fdsn-wsevent.html) | 1900 / 1998 | magnitude-scaled; the app switches source when one does not cover the moment |
| Volcanoes | [NASA EONET](https://eonet.gsfc.nasa.gov/) | 1980 | |
| Wildfires | NASA EONET | 2015 | global only from 2024, and published a few days late — see limitations |
| Storms | NASA EONET | 2000 | |
| Sea ice | NASA EONET | 2011 | |
| Sun activity | [NOAA SWPC](https://services.swpc.noaa.gov/) | — | sunspot regions, flares, 10.7 cm flux; present conditions only |
| Air quality | [WAQI](https://waqi.info/) | — | needs a key, follows the camera, present only |
| Lightning | [Blitzortung](https://www.blitzortung.org/) | — | needs a relay you run yourself, present only |
| Solar wind | [NOAA SWPC](https://services.swpc.noaa.gov/) propagated wind, plus GOES magnetometers | 7 days | speed, density, IMF Bz, Kp; drives the whole magnetosphere view |

Computed — no network, no key, and therefore no year they cannot reach:

| Layer | Basis | Notes |
|---|---|---|
| Sun and Moon | Meeus, in `js/sunmoon.js` | positions, ground tracks, phase, twilight bands, solar eclipses |
| Rotation axis | geometry | with the 23.44° obliquity |
| Magnetic axis · pole drift 1900–2030 | [IGRF-14](https://www.ncei.noaa.gov/products/international-geomagnetic-reference-field) | a dipole fit; a model, not a measurement, and extrapolated past 2025 |
| Polar motion | IERS/USNO via [CelesTrak](https://celestrak.org/SpaceData/) | a plot, not geometry: the pole stays inside a circle 40 m across, which at full zoom is a hundredth of a pixel |
| Magnetopause and bow shock | Shue et al. 1998 | shape follows the measured pressure and IMF Bz of the moment; the colour follows how much of the wind is coupling in |
| Field lines | IGRF-14 inside, T89c outside | traced from the surface and classified against the boundary above as open, closed or unresolved |
| Quiet reference | textbook dipole | where the same shells would lie with no wind pressing on them, so the two can be compared |
| Solar wind flow | Shue geometry plus a sheath deflection | particles arriving from the Sun and bending around the cavity, at the measured speed and density |

Plus three vector overlays: tectonic plate boundaries, country borders and
country labels.

Two display modes. **Realistic** is the shaded Earth with volumetric
indicators. **Schematic** is a flat vector map with discipline-specific symbols
and no bloom.

The panel follows one rule: **Layers** holds what you switch on and see on the
globe, **Almanac** holds what the calculations tell you. Both are ordered from
near to far — the ground, then the axes, then the Sun and Moon.

## Running it locally

Three ways in, from least to most involved. Pick the first one that fits.

### 1. Download one file and open it

[**terra.html**](https://github.com/Lemans73/Terra/releases/latest/download/terra.html)
from the latest release. Double-click it. That is the whole procedure — no
clone, no server, no install.

It needs an internet connection: the map textures and the live feeds come over
the network. Two layers are locked in this build and cannot be otherwise — air
quality needs a token behind a server route, and lightning needs a relay holding
a WebSocket open. Neither of those exists in a file on your desktop.

### 2. Clone and serve

For reading the source, changing it, or running the optional layers:

```bash
git clone https://github.com/Lemans73/Terra.git
cd Terra
node serve.mjs
```

Then open `http://localhost:8771`.

Node 18 or newer. Nothing to install — `package.json` exists only to mark the
project as ESM and has no `dependencies` block.

**Opening `index.html` directly will not work.** The application uses ES
modules, which browsers refuse to load over `file://`. That is what the server
is for, and it is also why option 1 is a separate build rather than this same
file renamed.

### 3. Build the single file yourself

```bash
node tools/build-standalone.mjs
```

That writes `terra.html`, the same artefact the release carries. It inlines the
CSS and the local modules and points the textures and GeoJSON at jsDelivr, which
serves this repository with the CORS headers a `file://` page needs. It is
generated and git-ignored: edit `index.html` and `js/*.js`, then rebuild.

## Bring your own data

Terra's fetch loop knows nothing about any specific layer. Adding a source
means writing an adapter object and registering it — you never touch the loop
itself.

**Required:**

| Property | Meaning |
|---|---|
| `layers` | the layer keys this adapter feeds |
| `url` | endpoint — a string, or a getter if it depends on camera state |
| `interval` | poll interval in milliseconds |
| `normalize(json)` | turn the response into `{ id, layer, lat, lng, value, label, time, source }` items |

**Optional, for the awkward cases:**

| Property | For |
|---|---|
| `merge(prev, fresh)` | sources that accumulate history rather than replace it — lightning uses this |
| `health(json)` | sources where "reachable" and "returning data" are different questions |
| `healthId` | share one status indicator across several adapters — the four EONET categories do |
| `keepOnEmpty` | treat an empty response as a hiccup rather than as truth |
| `optional` | on failure, padlock the layer instead of reporting the whole app degraded |
| `offlineNote` | the text shown inside that padlock |
| `venster()` | the time span this source should fetch — see below |
| `dagen` / `days` | how far back that span reaches: a fixed number of days, or one per time-window preset |
| `dekkingVanaf` | the first year this source actually holds data |
| `blijftOpen` | this source leaves events open indefinitely, so silence does not mean the event ended |
| `sluitAdministratief` | this source's closing date is bookkeeping, not an ending — see below |

An adapter marked `optional` that fails puts its layers behind a padlock with
an expandable panel explaining how to connect a backend. When the source comes
back, the padlock lifts and the layer restores its previous state.

### Following the chosen moment

Terra's time control can move the whole scene to any moment within ±7 days of a
chosen date. An adapter that defines `venster()` travels with it; one that does
not simply keeps showing the present. Nothing else is needed — the fetch policy,
the coverage check and the padlocks all key off that one hook.

The policy is deliberately stingy, because the slider steps every 10 minutes and
playback runs up to 48 hours per second: if the visible span still falls inside
what was last loaded, nothing is fetched; if it falls outside, one request goes
out 600 ms after the movement stops; during playback, none at all. Each request
covers the visible span plus 25% on both sides.

### Adding an API key

Air quality needs a free WAQI token. The key never reaches the browser: it
lives in the `WAQI_TOKEN` environment variable and is read server-side by
`api/waqi.js`, which returns only the data.

**We do not distribute keys.** To get air quality in your own deployment:

1. Request a free token at [aqicn.org/data-platform/token](https://aqicn.org/data-platform/token/)
2. Deploy this repository to Vercel (or any host that runs serverless functions)
3. Set `WAQI_TOKEN` in your project's environment variables

Locally, put it in a `.env.local` file at the repository root:

```
WAQI_TOKEN=your_token_here
```

That file is git-ignored. Note that `serve.mjs` reads it once at startup —
change it and you must restart the server.

Without a token, `/api/waqi` returns 404 and the layer shows a padlock. That is
the expected state, not an error.

### Lightning

Lightning comes from Blitzortung over a WebSocket, which serverless platforms
cannot hold open. The relay in `relay/relay.mjs` is a separate process you run
yourself:

```bash
node relay/relay.mjs
```

It listens on port 8772 and has no dependencies. The globe detects a relay on
localhost automatically; to point at one elsewhere, set `RELAY_URL` in
`js/config.js`. Without a relay, the lightning layer is padlocked.

## Configuration

`js/config.js` is the single source of truth for defaults: `PARAMS` holds every
tunable value, `COLORS` the palette, `TEXTURE_SETS` the imagery. Most visual
behaviour can be changed there without touching application code.

A few flags in the same file decide what a given deployment shows:

| Flag | Effect |
|---|---|
| `RELAY_URL` | where to find a lightning relay that is not on localhost |
| `ANALYTICS_HOSTS` | hostnames that load Vercel Web Analytics — a list, not a boolean, so a fork does not request a script that is not there |
| `LOCK_DETAILS` | whether a padlock expands into a panel explaining how to connect a backend |
| `ASSET_BASE` | where textures and GeoJSON are loaded from; the standalone build points this at jsDelivr |

## Limitations, honestly

- **Wildfire coverage changes shape in 2024.** NASA EONET's doing, not ours,
  and worth knowing before you read anything into a sparse map. Measured events
  per year, and the share outside North America: 2023 → 97 events, 0% ·
  2024 → 5636, 56% · 2025 → 4062, 64%. Before 2024 the catalogue is small and
  effectively North American; from 2024 it is global and roughly fifty times
  denser. That is a change in what was watched, not in what burned — the app
  says as much next to the layer when you travel back.
- **The fire feed runs a few days behind.** Measured on 2026-08-09: nothing at
  all had been published in the previous 24 hours, and the most recent report
  outside North America was 2.7 days old. A fire burning right now is usually
  not here yet, wherever it is.
- **Coverage differs per layer, by a lot.** EONET's volcano record starts
  around 1980, storms in 2000, sea ice in 2011, wildfires in 2015. Below its own
  start year a layer is padlocked rather than shown empty.
- **What is computed has no such limit, but is not measurement either.** Sun and
  Moon come from Meeus and are good to well under a kilometre; the magnetic axis
  comes from IGRF-14, which is a model, and past epoch 2025.0 it is
  extrapolation. The app marks that in the readout.
- **The magnetosphere only covers the measured week.** It hangs on NOAA's
  propagated solar wind, which reaches about seven days back and roughly an
  hour forward, so inside that view the time control is bounded there instead
  of running to 1900. The wind of last month was not measured, and neither was
  tomorrow's.
- **Most of the magnetosphere lies past anything that could contradict it.**
  The only independent measurement of the field out there is at geosynchronous
  orbit, 6.62 Earth radii up, and the readout prints how much of the drawn line
  length sits beyond it. The shape is Shue et al. 1998 evaluated on
  measurements, so a missing measurement means no surface at all: the app draws
  nothing rather than filling the gap with a plausible number.
- **The solar wind particles are a flow, not solved trajectories.** Their speed
  scales with the measured velocity and their number with the measured density,
  and the way they bend around the boundary is right in direction. The path
  itself comes from a formula rather than from magnetohydrodynamics.
- **Lightning needs a process you run yourself.** There is no hosted relay.
- **WAQI and Blitzortung permit non-commercial use only.** Terra is therefore a
  free demonstration and will stay one. If you fork it, that constraint travels
  with those two sources.
- **The `document.hidden` trap.** In headless browsers and background tabs,
  `requestAnimationFrame` does not fire, so animations freeze and the poll loop
  skips. Expected behaviour, not a bug worth reporting.
- **Comments in the source are in Dutch**, apart from the configuration file,
  the adapter contract and the server files, which are English. The interface
  itself is entirely English.

## A note on scope

Terra is a demo, built in spare time. It works and it is honest about what it
cannot do, but it is not a maintained product and there is no roadmap. Updates
arrive when they arrive.

You are welcome to fork it, take it apart, or connect your own sources — that
is much of why it is here. Issues and questions are read, and answered when
there is time for them. Just don't plan around a fix landing this week.

## Attribution

Imagery, map data and feeds carry their own licenses, several of which require
credit. See [ATTRIBUTION.md](ATTRIBUTION.md) for the full list — in short:
textures from [Solar System Scope](https://www.solarsystemscope.com/textures/)
under CC BY 4.0, plate boundaries from
[PB2002](https://github.com/fraxen/tectonicplates) under ODC-BY 1.0, and
Natural Earth in the public domain.

## License

MIT for the source code — see [LICENSE](LICENSE). The data and imagery are
under their own terms, listed in `ATTRIBUTION.md`.

Built by NimbusAgency.nl | Interactive Media.
