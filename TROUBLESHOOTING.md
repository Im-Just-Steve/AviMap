# Troubleshooting v1.0.1

## If you see the map but no aviation overlays

Open Chrome DevTools → Console.

You may see warnings for:

- OurAirports
- NATS AIS
- CORS
- network timeout

This is expected to be non-fatal in v1.0.1.

## If there is no map at all

Check that:

- the app is served over `http://localhost` or GitHub Pages, not `file://`
- the MapLibre CDN is reachable
- the OpenFreeMap style endpoint is reachable

The map no longer waits for aviation data.

## If the companion is connected

AviMap's connection indicator should change from:

CONNECTING

to:

CONNECTED

The companion only supplies aircraft telemetry. It is not responsible for
loading the map or aviation datasets.
