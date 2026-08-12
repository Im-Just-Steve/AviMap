# AviMap PWA v1.0.1

This is the **PWA-only** AviMap package.

There is no Windows Companion, .NET project, SimConnect code, or PowerShell
build requirement in this ZIP.

## v1.0.1 startup fix

The previous version waited for all UK aviation datasets to load before
creating the map. If one data endpoint was slow or unavailable, AviMap could
remain on:

> Loading UK aviation data…

with no map visible.

v1.0.1 fixes this.

The startup sequence is now:

```text
Open AviMap
   ↓
Create basemap immediately
   ↓
Map becomes visible
   ↓
Load airports independently
   ↓
Load UK airspace independently
   ↓
Load UK reporting points independently
   ↓
Add each overlay when available
```

Each aviation-data request has a timeout and failure is non-fatal. The map
therefore remains usable even if an external aviation dataset cannot be
reached.

## Run locally

Do not double-click `index.html`.

Use a local static server, for example:

```powershell
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## GitHub Pages

The application is designed to work at:

```text
https://im-just-steve.github.io/AviMap/
```

The PWA uses relative paths so it works from the `/AviMap/` repository path.

## Current functionality

- UK airport/aerodrome data
- UK airspace overlay
- UK reporting points / VRPs
- Blank route on startup
- Tap an airport or VRP to start a route
- Tap a destination to complete the route
- Aviation-magenta route line
- Touch-friendly controls
- Lightweight MapLibre configuration
- PWA/service-worker support

## Windows Companion

The Companion is deliberately NOT included here.

Use the separate:

```text
AviMap-Windows-Companion-v1.0.1
```

package for the MSFS 2024 connector.

## Important aviation-data note

The current prototype uses OurAirports for the initial airport catalogue and
OpenAIP community data for the aviation overlays. These are suitable for
development, but they are not a substitute for current UK AIP/AIS,
NOTAMs or other authoritative operational information.

AviMap is not currently an approved navigation product.


## v1.0.2 fixes

- Restored map drag/pan and touch zoom behaviour.
- Enabled MapLibre dragPan, scrollZoom and touchZoomRotate.
- Fixed the aircraft marker so MapLibre retains control of its geographic
  positioning transform. Heading rotation is now applied to an inner icon,
  preventing repeated telemetry updates from producing marker rendering
  artefacts or a stack of markers.


## v1.0.3 airspace fix

The previous build assumed an OpenAIP GeoJSON export. OpenAIP's documented
airspace export format uses XML/AIP 1.1 with `AIRSPACES > ASP`, `CATEGORY`,
`NAME`, altitude limits and `GEOMETRY > POLYGON`. AviMap v1.0.3 now loads the
UK `gb_asp.xml` export and converts its polygons to GeoJSON before rendering
them in MapLibre.

The airspace layer also recognises the OpenAIP `CATEGORY` field and uses a
stronger fill/outline so the overlay is visible at normal UK map scales.

The current source is development data and is not a substitute for current
UK AIP/AIS or NOTAM information.


## v1.0.4 airspace loading

The status message now counts only successfully parsed features. The loader
tries the documented OpenAIP `gb_asp.geojson` country/object export first and
falls back to `gb_asp.xml`. It also accepts a normal GeoJSON FeatureCollection
and is namespace-tolerant when parsing XML.

OpenAIP documents its daily export naming convention as
`country_type.format`, including `asp` for airspace and `geojson`, `json`,
`ndgeojson`, and `xml` formats. citeturn0search0

If both sources load but AviMap still reports zero airspaces, the next useful
step is to inspect the browser console/network response rather than changing
the map renderer again: that would tell us whether the current UK export is
being returned with a changed schema or blocked by the host.


## v1.0.5 airspace loader

The loader now handles all four OpenAIP daily export forms that are useful
here: GeoJSON, ND-GeoJSON, JSON and the older XML export. OpenAIP's published
export guidance lists these formats and the `asp` object type for airspace.
citeturn0search0

It also handles JSON response wrappers such as `items`, `data`, `results`,
`airspaces` and `features`, and recognises nested `geometry` objects.

The browser console now reports which export actually supplied the features,
or why each source failed.


## v1.0.6: CORS and telemetry fix

The browser cannot directly fetch the OpenAIP Google Cloud Storage export from
GitHub Pages because that bucket does not return an
`Access-Control-Allow-Origin` header for the AviMap origin. The browser
console confirmed this.

AviMap v1.0.6 therefore does **not** fetch OpenAIP airspace from the browser.
A GitHub Actions job downloads the UK airspace export server-side and stores
it as `data/uk-airspace.geojson`. The PWA then loads that local repository file
with the same origin as the app.

OpenAIP documents the country/object export naming convention, including
`gb_asp.geojson` for Great Britain airspace. citeturn0search0

The MSFS telemetry path is also hardened: incomplete latitude/longitude
values are ignored rather than passed to MapLibre, which was causing the
repeated `Invalid LngLat object: (NaN, NaN)` errors.


## v1.0.7 deployment

The OpenAIP → GitHub Actions pipeline has now been successfully tested.

The PWA reads UK airspace only from:

```text
./data/uk-airspace.geojson
```

The OpenAIP API key is never used by the browser.

### Important

Do **not** delete or replace `data/uk-airspace.geojson` when copying the PWA
files into the GitHub repository. The file is intentionally not included in
this PWA ZIP because GitHub Actions owns and updates it.

The included workflow is the corrected working version using
`actions/checkout@v5`.

After deployment, the PWA should report a non-zero UK airspace count.


## v1.0.8 airspace colours

Airspace display now follows the ICAO aeronautical-chart colour convention:
Class A is red, while Classes B through G are blue. Prohibited, restricted
and danger areas are also displayed in red to distinguish navigation-warning
airspace. ICAO chart-harmonisation guidance supports the red/blue distinction,
with B-G shown blue and Class A red. citeturn2search24turn0search23

TMZ and RMZ are not ICAO airspace classes, so AviMap keeps them visually
distinct rather than pretending they are part of the A-G class palette.


## v1.0.9 UK VFR airspace styling

The previous colour classifier expected textual values such as `Class A`.
OpenAIP actually stores `icaoClass` and `type` as numeric enums. v1.0.9 uses
the documented OpenAIP mappings directly.

OpenAIP type mappings include Restricted=1, Danger=2, Prohibited=3, CTR=4,
TMZ=5, RMZ=6, TMA=7, ATZ=13, MATZ=14 and CTA=26. ICAO class mappings include
A=0, B=1, C=2, D=3, E=4, F=5, G=6 and SUA/unclassified=8. citeturn2search1

The visual treatment is now inspired by current UK VFR chart conventions:
Class A/TMA Class A uses magenta, controlled airspace and ATZ/MATZ use blue,
and prohibited/restricted/danger areas use purple. The CAA confirms that
UK VFR charts use blue for CTA boundaries and magenta for Class A TMA
boundaries, while P/R/D areas use bold purple cross-hatched boundaries.
citeturn0search2turn3search0turn3search1

ATZs are shown with a blue dashed boundary, consistent with UK VFR
depictions. citeturn4search2


## v1.0.10 colour correction

Updated to the requested UK VFR colour reference:

- Class A: magenta
- ATZ: magenta
- TMZ: magenta
- Controlled airspace: blue
- MATZ: blue
- RMZ: blue
- Prohibited / Restricted / Danger: purple
- Class G / other: grey


## v1.0.11 revised airspace palette

Requested presentation:
- Class A: purple (same reference colour previously used for P/R/D)
- Prohibited / Restricted / Danger: red
- ATZ: magenta
- TMZ: magenta with dashed boundary
- MATZ / RMZ / controlled airspace: blue


## v1.0.12 explicit airspace styling

The requested styling is now the authoritative AviMap specification:

| Airspace | Colour | Boundary |
| --- | --- | --- |
| Class A | Purple | Solid |
| Prohibited / Restricted / Danger | Red | Solid |
| ATZ | Purple | Dashed |
| TMZ | Purple | Dashed |
| Controlled airspace | Blue | Solid |
| MATZ | Blue | Dashed |
| RMZ | Blue | Dashed |
| Other / Class G | Grey | Solid |

The renderer preserves the original OpenAIP `type` and `icaoClass` values and
adds explicit `avimapColor`, `avimapDashed` and `avimapCategory` properties.
P/R/D and the named special zones are evaluated before generic ICAO class
classification.


## v1.0.13 Companion discovery

The PWA now automatically tries:
1. `ws://127.0.0.1:49001/ws` for same-PC testing.
2. `ws://avimap.local:49001/ws` for a Windows Companion on the same LAN.

The Companion advertises `avimap.local` using mDNS.

The browser may still enforce secure-page/local-network permissions depending
on browser and device. If Chrome/iPadOS blocks the local WebSocket, the next
step is to add a secure local transport rather than hard-coding an IP address.

The aircraft marker was also fixed: the marker element is now explicitly
created before MapLibre receives the first valid telemetry position.
