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
