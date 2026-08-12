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
