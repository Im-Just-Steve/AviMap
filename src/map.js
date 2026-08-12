import * as maplibregl from "https://cdn.jsdelivr.net/npm/maplibre-gl@6.0.0/+esm";
import { DEFAULT_CENTER, DEFAULT_ZOOM, AIRCRAFT_CENTRE_ZOOM } from "./data.js";
import { haversineNm, bearingDegrees, formatNm } from "./geo.js";

let map;
let aircraftTrail = [];
let aircraftTrailSourceAdded = false;
let aircraftTrailPending = false;
const AIRCRAFT_TRAIL_COLOR = "#2A9D8F";

let aircraftMarker;
let aircraftFollowMode = true;
let aircraftHasInitialCentre = false;
let suppressManualMapInteraction = false;
let selectedFeature;
let dataState;
let onFeatureSelect;
let onMapReady;

export function createMap({ data, onSelect, onReady }) {
  dataState = data;
  onFeatureSelect = onSelect;
  onMapReady = onReady;

  map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/bright",
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    attributionControl: true,
    repaint: false,
    fadeDuration: 0,
    refreshExpiredTiles: false,
    renderWorldCopies: false,
    maxPitch: 0,
    dragRotate: false,
    touchPitch: false,
    boxZoom: false,
    keyboard: false,
    doubleClickZoom: true,
    dragPan: true,
    scrollZoom: true,
    touchZoomRotate: true,
    crossSourceCollisions: false,
    validateStyle: false,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
    canvasContextAttributes: {
      antialias: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance"
    }
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

  // Aircraft-follow mode remains active until the pilot manually pans or zooms.
  // Programmatic centring is explicitly suppressed so it does not disable follow mode.
  map.on("dragstart", () => {
    if (!suppressManualMapInteraction) {
      aircraftFollowMode = false;
    }
  });

  map.on("moveend", () => {
    suppressManualMapInteraction = false;
  });

  map.on("load", () => {
    addAirspace();
    addAirports();
    addReportingPoints();
    map.on("click", "avimap-airports", e => selectRendered(e, "airport"));
    map.on("click", "avimap-vrps", e => selectRendered(e, "vrp"));
    map.on("click", "avimap-airspace-fill", e => selectRendered(e, "airspace"));
    map.on("mouseenter", "avimap-airports", () => map.getCanvas().style.cursor = "pointer");
    map.on("mouseleave", "avimap-airports", () => map.getCanvas().style.cursor = "");
    map.on("mouseenter", "avimap-vrps", () => map.getCanvas().style.cursor = "pointer");
    map.on("mouseleave", "avimap-vrps", () => map.getCanvas().style.cursor = "");
    map.on("mouseenter", "avimap-airspace-fill", () => map.getCanvas().style.cursor = "pointer");
    map.on("mouseleave", "avimap-airspace-fill", () => map.getCanvas().style.cursor = "");
    onMapReady?.();

    if (aircraftTrailPending && aircraftTrail.length) {
      aircraftTrailPending = false;
      renderAircraftTrail();
    }
  });
}

function selectRendered(event, kind) {
  const feature = event.features?.[0];
  if (!feature) return;
  selectedFeature = { kind, properties: feature.properties, coordinates: [event.lngLat.lng, event.lngLat.lat] };
  onFeatureSelect?.(selectedFeature);
}

function addAirports() {
  const features = (dataState.airports || []).map(a => ({
    type: "Feature",
    properties: {
      id: a.id, ident: a.ident, icao: a.icao, iata: a.iata,
      name: a.name, type: a.type, municipality: a.municipality
    },
    geometry: { type: "Point", coordinates: [a.lon, a.lat] }
  }));

  map.addSource("avimap-airports-source", {
    type: "geojson",
    data: { type: "FeatureCollection", features }
  });

  map.addLayer({
    id: "avimap-airports",
    type: "circle",
    source: "avimap-airports-source",
    minzoom: 5,
    paint: {
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"], 5, 2.5, 8, 4, 12, 6
      ],
      "circle-color": "#ffffff",
      "circle-stroke-color": "#294946",
      "circle-stroke-width": 1.3
    }
  });

  map.addLayer({
    id: "avimap-airport-labels",
    type: "symbol",
    source: "avimap-airports-source",
    minzoom: 7.5,
    layout: {
      "text-field": ["coalesce", ["get", "icao"], ["get", "ident"]],
      "text-size": 10,
      "text-offset": [0, 1],
      "text-anchor": "top"
    },
    paint: {
      "text-color": "#243b38",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.2
    }
  });
}

function addReportingPoints() {
  const sourceData = normaliseReportingPoints(
    dataState.reportingPoints || { type: "FeatureCollection", features: [] }
  );

  map.addSource("avimap-vrp-source", { type: "geojson", data: sourceData });

  // Use a native circle layer so VRPs do not depend on a particular
  // basemap sprite sheet containing a named icon.
  map.addLayer({
    id: "avimap-vrps",
    type: "circle",
    source: "avimap-vrp-source",
    minzoom: 6,
    paint: {
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        6, 3,
        9, 4,
        13, 5
      ],
      "circle-color": "#8b2c83",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5
    }
  });

  map.addLayer({
    id: "avimap-vrp-labels",
    type: "symbol",
    source: "avimap-vrp-source",
    minzoom: 7,
    layout: {
      "text-field": [
        "coalesce",
        ["get", "ident"],
        ["get", "name"],
        ["get", "designator"],
        "VRP"
      ],
      "text-size": 10,
      "text-offset": [0, 1.15],
      "text-anchor": "top",
      "text-allow-overlap": false
    },
    paint: {
      "text-color": "#8b2c83",
      "text-halo-color": "#fff",
      "text-halo-width": 1.2
    }
  });
}

function normaliseReportingPoints(input) {
  const fc = normaliseGeoJson(input);

  return {
    type: "FeatureCollection",
    features: fc.features
      .map((feature, index) => {
        const properties = feature.properties || {};
        const geometry = feature.geometry;

        if (!geometry) return null;

        let coordinates = geometry.coordinates;

        // Some exports can contain a Point as expected; retain only point
        // features for the VRP layer so the map cannot silently discard them.
        if (geometry.type !== "Point" || !Array.isArray(coordinates) || coordinates.length < 2) {
          return null;
        }

        const lon = Number(coordinates[0]);
        const lat = Number(coordinates[1]);

        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

        return {
          ...feature,
          properties: {
            ...properties,
            ident:
              properties.ident ||
              properties.designator ||
              properties.code ||
              properties.name ||
              `VRP ${index + 1}`,
            name:
              properties.name ||
              properties.designator ||
              properties.ident ||
              properties.code ||
              `VRP ${index + 1}`
          },
          geometry: {
            type: "Point",
            coordinates: [lon, lat]
          }
        };
      })
      .filter(Boolean)
  };
}

function addAirspace() {
  const sourceData = normaliseGeoJson(
    dataState.airspace || { type: "FeatureCollection", features: [] }
  );

  map.addSource("avimap-airspace-source", {
    type: "geojson",
    data: sourceData
  });

  const colorExpression = [
    "match", ["get", "avimapColor"],
    "red", "#c62828",
    "purple", "#8b2c83",
    "blue", "#1769aa",
    "grey", "#66706f",
    "#66706f"
  ];

  map.addLayer({
    id: "avimap-airspace-fill",
    type: "fill",
    source: "avimap-airspace-source",
    paint: {
      "fill-color": colorExpression,
      "fill-opacity": [
        "match", ["get", "avimapColor"],
        "red", 0.08,
        "purple", 0.08,
        "blue", 0.07,
        "grey", 0.035,
        0.04
      ]
    }
  });

  map.addLayer({
    id: "avimap-airspace-line",
    type: "line",
    source: "avimap-airspace-source",
    paint: {
      "line-color": colorExpression,
      "line-width": [
        "match", ["get", "avimapColor"],
        "red", 2.0,
        "purple", 1.9,
        "blue", 1.7,
        "grey", 1.1,
        1.2
      ],
      "line-opacity": 0.95,
      "line-dasharray": [
        "case",
        ["get", "avimapDashed"],
        ["literal", [2.5, 2.5]],
        ["literal", [1, 0]]
      ]
    }
  });

  map.addLayer({
    id: "avimap-airspace-labels",
    type: "symbol",
    source: "avimap-airspace-source",
    minzoom: 7,
    layout: {
      "text-field": ["coalesce", ["get", "name"], ["get", "designator"], ""],
      "text-size": 9,
      "text-max-width": 10
    },
    paint: {
      "text-color": colorExpression,
      "text-halo-color": "#fff",
      "text-halo-width": 1
    }
  });
}

function classifyAirspaceStyle(properties = {}) {
  /*
   * AviMap UK airspace styling.
   *
   * The GitHub data pipeline normalises the authoritative NATS AIXM
   * airspace type/class into `category`, so the renderer does not depend
   * on a provider-specific numeric enum.
   *
   * Class A                  -> purple / solid
   * Prohibited/Restricted/Danger -> red / solid
   * ATZ                      -> purple / dashed
   * TMZ                      -> purple / dashed
   * Controlled airspace     -> blue / solid
   * MATZ                     -> blue / dashed
   * RMZ                      -> blue / dashed
   * Other / Class G          -> grey / solid
   */

  const category = String(
    properties.category || ""
  ).trim().toUpperCase();

  if (category === "P/R/D") {
    return {
      color: "red",
      dash: false,
      category: "P/R/D"
    };
  }

  if (category === "ATZ" || category === "TMZ") {
    return {
      color: "purple",
      dash: true,
      category
    };
  }

  if (category === "MATZ" || category === "RMZ") {
    return {
      color: "blue",
      dash: true,
      category
    };
  }

  if (category === "CLASS A") {
    return {
      color: "purple",
      dash: false,
      category: "Class A"
    };
  }

  if (category === "CONTROLLED") {
    return {
      color: "blue",
      dash: false,
      category: "Controlled"
    };
  }

  return {
    color: "grey",
    dash: false,
    category: "Other"
  };
}

function normaliseGeoJson(input) {
  if (!input) {
    return { type: "FeatureCollection", features: [] };
  }

  if (input.type === "Feature") {
    input = {
      type: "FeatureCollection",
      features: [input]
    };
  }

  if (input.type !== "FeatureCollection") {
    return { type: "FeatureCollection", features: [] };
  }

  return {
    type: "FeatureCollection",
    features: (input.features || []).filter(Boolean).map((feature, index) => {
      const properties = {
        ...(feature.properties || {})
      };

      const style = classifyAirspaceStyle(properties);

      return {
        ...feature,
        properties: {
          ...properties,
          name:
            properties.name ||
            properties.designator ||
            properties.identifier ||
            `AREA ${index + 1}`,

          // Preserve source fields for inspection.
          type: properties.type ?? null,
          icaoClass:
            properties.icaoClass ??
            properties.icaoclass ??
            properties.class ??
            null,

          // Explicit AviMap rendering fields.
          avimapColor: style.color,
          avimapDashed: style.dash,
          avimapCategory: style.category
        }
      };
    })
  };
}


export function updateAviationData(data) {
  if (!map || !data || !map.loaded()) return;
  dataState = data;

  const airportFeatures = (data.airports || []).map(a => ({
    type: "Feature",
    properties: {
      id: a.id, ident: a.ident, icao: a.icao, iata: a.iata,
      name: a.name, type: a.type, municipality: a.municipality
    },
    geometry: { type: "Point", coordinates: [a.lon, a.lat] }
  }));

  const airportSource = map.getSource("avimap-airports-source");
  if (airportSource) {
    airportSource.setData({
      type: "FeatureCollection",
      features: airportFeatures
    });
  }

  const vrpSource = map.getSource("avimap-vrp-source");
  if (vrpSource) vrpSource.setData(normaliseReportingPoints(data.reportingPoints));

  const airspaceSource = map.getSource("avimap-airspace-source");
  if (airspaceSource) airspaceSource.setData(normaliseGeoJson(data.airspace));
}


export function drawRoute(route) {
  if (!map) return;

  const coordinates = route.map(p => [p.lon, p.lat]);
  const geo = {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates }
  };

  if (!route.length) {
    if (map.getSource("avimap-route-source")) {
      map.getSource("avimap-route-source").setData({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: [] }
      });
      map.getSource("avimap-route-points-source").setData({
        type: "FeatureCollection",
        features: []
      });
    }
    return;
  }

  if (map.getSource("avimap-route-source")) {
    map.getSource("avimap-route-source").setData(geo);
    map.getSource("avimap-route-points-source").setData({
      type: "FeatureCollection",
      features: route.map(p => ({
        type: "Feature",
        properties: { ident: p.ident, name: p.name },
        geometry: { type: "Point", coordinates: [p.lon, p.lat] }
      }))
    });
  } else {
    map.addSource("avimap-route-source", { type: "geojson", data: geo });
    map.addLayer({
      id: "avimap-route-casing",
      type: "line",
      source: "avimap-route-source",
      paint: { "line-color": "#fff", "line-width": 8, "line-opacity": .88 }
    });
    map.addLayer({
      id: "avimap-route",
      type: "line",
      source: "avimap-route-source",
      paint: { "line-color": "#d400a5", "line-width": 4, "line-opacity": 1 }
    });

    map.addSource("avimap-route-points-source", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: route.map(p => ({
          type: "Feature",
          properties: { ident: p.ident, name: p.name },
          geometry: { type: "Point", coordinates: [p.lon, p.lat] }
        }))
      }
    });

    map.addLayer({
      id: "avimap-route-points",
      type: "circle",
      source: "avimap-route-points-source",
      paint: {
        "circle-radius": 4,
        "circle-color": "#fff",
        "circle-stroke-color": "#d400a5",
        "circle-stroke-width": 2
      }
    });
  }
}

export function setLayerVisible(prefix, visible) {
  const ids = {
    airspace: ["avimap-airspace-fill", "avimap-airspace-line", "avimap-airspace-labels"],
    airports: ["avimap-airports", "avimap-airport-labels"],
    vrps: ["avimap-vrps", "avimap-vrp-labels"]
  }[prefix] || [];

  ids.forEach(id => {
    if (map?.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  });
}

function createAircraftElement() {
  const wrapper = document.createElement("div");
  wrapper.className = "aircraft-marker";
  wrapper.setAttribute("aria-label", "Aircraft position");

  const icon = document.createElement("img");
  icon.className = "aircraft-icon";
  icon.src = "./assets/aircraft-marker.png";
  icon.alt = "";
  icon.draggable = false;
  icon.decoding = "async";

  wrapper.appendChild(icon);
  return wrapper;
}

export function setAircraft(data) {
  const lat = Number(data?.lat);
  const lon = Number(data?.lon);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 || lat > 90 ||
    lon < -180 || lon > 180
  ) {
    return false;
  }

  if (!aircraftMarker) {
    const el = createAircraftElement();
    aircraftMarker = new maplibregl.Marker({
      element: el,
      rotationAlignment: "map",
      pitchAlignment: "map"
    })
      .setLngLat([lon, lat])
      .addTo(map);
  } else {
    aircraftMarker.setLngLat([lon, lat]);
  }

  if (Number.isFinite(Number(data.heading))) {
    aircraftMarker.setRotation(Number(data.heading));
  }

  updateAircraftTrail(lon, lat);

  // Follow the aircraft on every valid telemetry update unless the pilot
  // has manually panned the map. Manual zooming deliberately keeps tracking
  // active, so the user's chosen zoom is preserved.
  if (aircraftFollowMode) {
    if (!aircraftHasInitialCentre) {
      aircraftHasInitialCentre = true;
      centreOnAircraft([lon, lat], AIRCRAFT_CENTRE_ZOOM);
    } else {
      centreOnAircraft([lon, lat], map.getZoom());
    }
  }

  return true;
}

function updateAircraftTrail(lon, lat) {
  const point = [lon, lat];

  const previous = aircraftTrail[aircraftTrail.length - 1];
  if (
    previous &&
    Math.abs(previous[0] - lon) < 0.000001 &&
    Math.abs(previous[1] - lat) < 0.000001
  ) {
    return;
  }

  aircraftTrail.push(point);

  if (aircraftTrail.length > 50000) {
    aircraftTrail.splice(0, aircraftTrail.length - 50000);
  }

  // Telemetry can arrive before the MapLibre style has finished loading.
  // Keep the points and render them once the map's load event has fired.
  if (!map.loaded()) {
    aircraftTrailPending = true;
    return;
  }

  renderAircraftTrail();
}

function renderAircraftTrail() {
  if (!map || !map.loaded()) {
    aircraftTrailPending = true;
    return;
  }

  const feature = {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: aircraftTrail
    },
    properties: {}
  };

  const source = map.getSource("aircraft-trail");
  if (source) {
    source.setData(feature);
    aircraftTrailSourceAdded = true;
    return;
  }

  map.addSource("aircraft-trail", {
    type: "geojson",
    data: feature
  });

  map.addLayer({
    id: "aircraft-trail",
    type: "line",
    source: "aircraft-trail",
    layout: {
      "line-cap": "round",
      "line-join": "round"
    },
    paint: {
      "line-color": AIRCRAFT_TRAIL_COLOR,
      "line-width": 4,
      "line-opacity": 0.95
    }
  });

  aircraftTrailSourceAdded = true;
}

export function clearAircraftTrail() {
  aircraftTrail = [];

  const source = map.getSource("aircraft-trail");
  if (source) {
    source.setData({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: []
      },
      properties: {}
    });
  }
}


function centreOnAircraft(center, zoom) {
  if (!map) return;
  suppressManualMapInteraction = true;
  map.easeTo({ center, zoom, duration: 300, essential: true });
}

function isAtAircraftCentreZoom() {
  if (!map) return false;
  return Math.abs(map.getZoom() - AIRCRAFT_CENTRE_ZOOM) < 0.08;
}

export function centerOn(position) {
  if (!map || !position) return;

  // If we're already following and already at the standard 10 NM view,
  // the target button deliberately does nothing.
  if (aircraftFollowMode && isAtAircraftCentreZoom()) {
    return;
  }

  // Otherwise the target button restores normal aircraft tracking and
  // the standard approximately-10-NM-radius view.
  aircraftFollowMode = true;
  aircraftHasInitialCentre = true;
  centreOnAircraft(
    [position.lon, position.lat],
    AIRCRAFT_CENTRE_ZOOM
  );
}

export function zoom(delta) {
  if (!map) return;

  // Manual zooming does NOT disable aircraft tracking.
  // The next telemetry update will therefore keep the aircraft centred
  // at the user's chosen zoom level.
  map.zoomTo(
    Math.max(4, Math.min(14, map.getZoom() + delta)),
    { duration: 180 }
  );
}

export function getMap() {
  return map;
}

export function routeMetrics(route) {
  let distance = 0;
  const legs = [];
  for (let i = 0; i < route.length - 1; i++) {
    const d = haversineNm(route[i], route[i + 1]);
    const b = bearingDegrees(route[i], route[i + 1]);
    distance += d;
    legs.push({ distance: d, bearing: b });
  }
  return { distance, legs };
}

export function routeSummary(route) {
  if (!route.length) return "NO ROUTE";
  if (route.length === 1) return route[0].ident;
  return `${route[0].ident} → ${route.at(-1).ident}`;
}

export function routeDistanceText(route) {
  return formatNm(routeMetrics(route).distance);
}
