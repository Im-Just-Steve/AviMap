import * as maplibregl from "https://cdn.jsdelivr.net/npm/maplibre-gl@6.0.0/+esm";
import { DEFAULT_CENTER, DEFAULT_ZOOM } from "./data.js";
import { haversineNm, bearingDegrees, formatNm } from "./geo.js";

let map;
let aircraftMarker;
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
  const sourceData = normaliseGeoJson(dataState.reportingPoints || { type: "FeatureCollection", features: [] });
  map.addSource("avimap-vrp-source", { type: "geojson", data: sourceData });

  map.addLayer({
    id: "avimap-vrps",
    type: "circle",
    source: "avimap-vrp-source",
    minzoom: 7,
    paint: {
      "circle-radius": 4,
      "circle-color": "#fff",
      "circle-stroke-color": "#7b3f8f",
      "circle-stroke-width": 1.5
    }
  });

  map.addLayer({
    id: "avimap-vrp-labels",
    type: "symbol",
    source: "avimap-vrp-source",
    minzoom: 8,
    layout: {
      "text-field": ["get", "name"],
      "text-size": 9,
      "text-offset": [0, 1],
      "text-anchor": "top"
    },
    paint: {
      "text-color": "#6c397e",
      "text-halo-color": "#fff",
      "text-halo-width": 1
    }
  });
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
   * AviMap airspace styling specification:
   *
   * Class A                         -> purple / solid
   * Prohibited / Restricted / Danger -> red / solid
   * ATZ                            -> purple / dashed
   * TMZ                            -> purple / dashed
   * Controlled airspace            -> blue / solid
   * MATZ                           -> blue / dashed
   * RMZ                            -> blue / dashed
   * Other / Class G                -> grey / solid
   *
   * IMPORTANT:
   * Classification uses the actual OpenAIP numeric fields. We do not infer
   * airspace type from its name/designator.
   */

  const type = Number(properties.type);
  const icaoClass = Number(
    properties.icaoClass ??
    properties.icaoclass ??
    properties.class
  );

  // OpenAIP type values used by the current data pipeline.
  const TYPE_RESTRICTED = 1;
  const TYPE_DANGER = 2;
  const TYPE_PROHIBITED = 3;
  const TYPE_CTR = 4;
  const TYPE_TMZ = 5;
  const TYPE_RMZ = 6;
  const TYPE_TMA = 7;
  const TYPE_ATZ = 13;
  const TYPE_MATZ = 14;
  const TYPE_AIRWAY = 15;
  const TYPE_CTA = 26;

  // OpenAIP ICAO class values.
  const ICAO_CLASS_A = 0;
  const ICAO_CLASSES_CONTROLLED = new Set([1, 2, 3, 4, 5]);

  // P/R/D always take priority over class information.
  if (
    type === TYPE_PROHIBITED ||
    type === TYPE_RESTRICTED ||
    type === TYPE_DANGER
  ) {
    return {
      color: "red",
      dash: false,
      category: "P/R/D"
    };
  }

  // ATZ and TMZ are purple and dashed.
  if (type === TYPE_ATZ || type === TYPE_TMZ) {
    return {
      color: "purple",
      dash: true,
      category: type === TYPE_ATZ ? "ATZ" : "TMZ"
    };
  }

  // MATZ and RMZ are blue and dashed.
  if (type === TYPE_MATZ || type === TYPE_RMZ) {
    return {
      color: "blue",
      dash: true,
      category: type === TYPE_MATZ ? "MATZ" : "RMZ"
    };
  }

  // Class A is purple and solid.
  if (icaoClass === ICAO_CLASS_A) {
    return {
      color: "purple",
      dash: false,
      category: "Class A"
    };
  }

  // Remaining controlled airspace is blue and solid.
  if (
    ICAO_CLASSES_CONTROLLED.has(icaoClass) ||
    type === TYPE_CTR ||
    type === TYPE_TMA ||
    type === TYPE_AIRWAY ||
    type === TYPE_CTA
  ) {
    return {
      color: "blue",
      dash: false,
      category: "Controlled"
    };
  }

  // Class G / unknown / other.
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

          // Preserve the original OpenAIP fields untouched.
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
  if (!map || !data) return;
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
  if (vrpSource) vrpSource.setData(normaliseGeoJson(data.reportingPoints));

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

export function setAircraft(position) {
  const lon = Number(position?.lon);
  const lat = Number(position?.lat);
  const heading = Number.isFinite(Number(position?.heading))
    ? Number(position.heading)
    : 0;

  // Never pass NaN/undefined into MapLibre. SimConnect can briefly emit
  // incomplete values while the connection is initialising.
  if (!Number.isFinite(lon) || !Number.isFinite(lat) ||
      lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    return false;
  }

  if (!aircraftMarker) {
    aircraftMarker = new maplibregl.Marker({ element: createAircraftElement() })
      .setLngLat([lon, lat])
      .addTo(map);
  } else {
    aircraftMarker.setLngLat([lon, lat]);
  }

  const icon = aircraftMarker.getElement().querySelector(".aircraft-icon");
  if (icon) icon.style.transform = `rotate(${heading}deg)`;
  return true;
}

export function centerOn(position) {
  if (!map || !position) return;
  map.easeTo({ center: [position.lon, position.lat], zoom: Math.max(map.getZoom(), 8), duration: 350 });
}

export function zoom(delta) {
  if (!map) return;
  map.zoomTo(Math.max(4, Math.min(14, map.getZoom() + delta)), { duration: 180 });
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
