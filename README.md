# AviMap

AviMap is an aviation moving-map PWA prototype with a Windows companion for
Microsoft Flight Simulator telemetry.

## Current data architecture

UK aviation overlay data is sourced centrally from NATS AIS:

- UK ICAO AIP Dataset — AIXM 5.1 XML, updated on AIRAC effective dates.
- UK Visual Reference Points List — NATS VRP dataset.

GitHub Actions downloads the current effective NATS datasets, converts them to
local GeoJSON, validates the generated feature counts, and commits only valid
changes. The PWA then reads the committed local files.

Airport/aerodrome catalogue data currently comes from the public-domain
OurAirports dataset.

## Airspace portrayal

AviMap currently uses these map categories:

| Airspace | Colour | Boundary |
|---|---|---|
| Class A | Purple | Solid |
| Prohibited / Restricted / Danger | Red | Solid |
| ATZ | Purple | Dashed |
| TMZ | Purple | Dashed |
| Controlled airspace | Blue | Solid |
| MATZ | Blue | Dashed |
| RMZ | Blue | Dashed |
| Other / Class G | Grey | Solid |

The data pipeline normalises the NATS AIXM airspace type/class into these
categories before the PWA renders them.

## Moving map

- The map follows the aircraft by default.
- Manual panning disables aircraft tracking.
- Manual zooming does not disable tracking.
- The Centre button restores aircraft tracking and the default aircraft view.
- Aircraft telemetry is supplied by the Windows companion over the local
  network.

## UK aviation data workflow

Run:

**GitHub → Actions → Update UK aviation data → Run workflow**

The workflow refuses to commit an empty airspace or VRP dataset.

## Important

AviMap is a development project and is not a substitute for the current UK
AIP, NOTAMs, or other official operational flight information. Verify current
information before real-world flight.
