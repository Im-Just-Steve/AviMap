import { DATA_URLS } from "./data.js";

export async function loadAviationData(onProgress = () => {}) {
  const result = {
    airports: [],
    airspace: emptyFeatureCollection(),
    reportingPoints: emptyFeatureCollection()
  };

  onProgress("Loading UK airport database…");
  try {
    const airportsCsv = await fetchWithTimeout(DATA_URLS.airports, 20000)
      .then(assertOk).then(r => r.text());
    result.airports = parseAirports(airportsCsv);
    onProgress(`Loaded ${result.airports.length.toLocaleString()} UK airports / aerodromes`);
  } catch (error) {
    console.warn("AviMap airport data failed:", error);
  }

  onProgress("Loading UK airspace…");
  try {
    result.airspace = await loadAirspace();
    if (!result.airspace.features.length) throw new Error("No airspace features recognised");
    onProgress(`Loaded ${result.airspace.features.length.toLocaleString()} UK airspaces`);
  } catch (error) {
    console.error("AviMap airspace load failed:", error);
    onProgress("UK airspace unavailable — map remains available.");
  }

  // Reporting points are not allowed to block airspace.
  try {
    result.reportingPoints = await loadOptionalGeoJson(DATA_URLS.airspaceJson);
  } catch {}

  return result;
}

async function loadAirspace() {
  const attempts = [
    ["GeoJSON", DATA_URLS.airspace, "json"],
    ["ND-GeoJSON", DATA_URLS.airspaceNd, "ndjson"],
    ["JSON", DATA_URLS.airspaceJson, "json"],
    ["XML", DATA_URLS.airspaceXml, "xml"]
  ];

  const errors = [];

  for (const [label, url, format] of attempts) {
    try {
      const response = await fetchWithTimeout(url, 20000);
      assertOk(response);
      const text = await response.text();

      let parsed;
      if (format === "ndjson") {
        parsed = parseNdJsonAirspace(text);
      } else if (format === "xml") {
        parsed = parseOpenAipAirspaceXml(text);
      } else {
        parsed = parseJsonAirspace(text);
      }

      if (parsed.features.length) {
        console.info(`AviMap: ${label} airspace export supplied ${parsed.features.length} features.`);
        return parsed;
      }

      errors.push(`${label}: zero features`);
    } catch (error) {
      errors.push(`${label}: ${error.message}`);
    }
  }

  throw new Error(errors.join(" | "));
}

async function loadOptionalGeoJson(url) {
  const response = await fetchWithTimeout(url, 10000);
  assertOk(response);
  return normaliseGeoJson(JSON.parse(await response.text()));
}

function parseJsonAirspace(text) {
  const data = JSON.parse(text);

  // Standard GeoJSON FeatureCollection / Feature.
  const standard = normaliseGeoJson(data);
  if (standard.features.length) return standard;

  // OpenAIP JSON may be a response object containing an array.
  const candidates = [];
  for (const key of ["items", "data", "results", "airspaces", "features"]) {
    if (Array.isArray(data?.[key])) candidates.push(...data[key]);
  }
  if (Array.isArray(data)) candidates.push(...data);

  return normaliseAirspaceObjects(candidates);
}

function parseNdJsonAirspace(text) {
  const objects = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try { objects.push(JSON.parse(trimmed)); } catch {}
  }
  return normaliseAirspaceObjects(objects);
}

function normaliseGeoJson(input) {
  if (!input) return emptyFeatureCollection();

  if (input.type === "FeatureCollection") {
    return {
      type: "FeatureCollection",
      features: (input.features || []).filter(f => f?.geometry).map((f, i) => ({
        ...f,
        properties: {
          ...(f.properties || {}),
          name: f.properties?.name || f.properties?.NAME || `AIRSPACE ${i + 1}`,
          type: f.properties?.type || f.properties?.category ||
            f.properties?.CATEGORY || f.properties?.class || ""
        }
      }))
    };
  }

  if (input.type === "Feature" && input.geometry) {
    return { type: "FeatureCollection", features: [input] };
  }

  return emptyFeatureCollection();
}

function normaliseAirspaceObjects(items) {
  const features = [];

  for (const item of items || []) {
    if (!item) continue;

    if (item.type === "Feature" && item.geometry) {
      features.push(item);
      continue;
    }

    const geometry = item.geometry || item.geojson || item.geoJson || item.location?.geometry;
    if (geometry?.type && geometry?.coordinates) {
      features.push({
        type: "Feature",
        id: item.id || item._id,
        properties: {
          ...item,
          name: item.name || item.designator || item.identifier || item._id || "Airspace",
          type: item.type || item.category || item.airspaceType || item.class || ""
        },
        geometry
      });
      continue;
    }

    // Some APIs return the geometry as a nested GeoJSON Feature.
    const nested = item.feature || item.geoJsonFeature;
    if (nested?.geometry) features.push(nested);
  }

  return { type: "FeatureCollection", features: features.filter(f => validGeometry(f.geometry)) };
}

function validGeometry(g) {
  return g && ["Polygon", "MultiPolygon", "LineString", "MultiLineString"].includes(g.type) &&
    Array.isArray(g.coordinates) && g.coordinates.length > 0;
}

function parseOpenAipAirspaceXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid OpenAIP XML");

  const features = [];
  const airspaces = [...doc.getElementsByTagNameNS("*", "ASP")];

  for (const asp of airspaces) {
    const category = asp.getAttribute("CATEGORY") || "OTHER";
    const name = childText(asp, "NAME") || category;

    for (const polygon of [...asp.getElementsByTagNameNS("*", "POLYGON")]) {
      const coords = parseCoordinateList(polygon.textContent);
      if (coords.length < 3) continue;

      features.push({
        type: "Feature",
        properties: { name, category, type: category },
        geometry: { type: "Polygon", coordinates: [ensureClosed(coords)] }
      });
    }
  }

  return { type: "FeatureCollection", features };
}

function childText(parent, name) {
  return parent.getElementsByTagNameNS("*", name)[0]?.textContent?.trim() || "";
}

function parseCoordinateList(text) {
  return String(text).split(",")
    .map(p => p.trim().split(/\s+/).map(Number))
    .filter(p => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(p => [p[0], p[1]]);
}

function ensureClosed(coords) {
  const a = coords[0], b = coords[coords.length - 1];
  return a[0] === b[0] && a[1] === b[1] ? coords : [...coords, [...a]];
}

function parseAirports(csv) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    const next = csv[i + 1];

    if (quoted) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  const header = rows.shift().map(x => x.trim());
  const idx = Object.fromEntries(header.map((name, i) => [name, i]));
  const wanted = [];

  for (const r of rows) {
    const country = r[idx.iso_country];
    const type = r[idx.type];
    const lat = Number(r[idx.latitude_deg]);
    const lon = Number(r[idx.longitude_deg]);
    if (country !== "GB" || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (type === "closed") continue;

    wanted.push({
      id: r[idx.id],
      ident: r[idx.ident] || r[idx.gps_code] || r[idx.local_code] || `OA-${r[idx.id]}`,
      icao: r[idx.icao_code] || r[idx.gps_code] || "",
      iata: r[idx.iata_code] || "",
      type,
      name: r[idx.name] || "Unnamed aerodrome",
      lat, lon,
      elevation: Number(r[idx.elevation_ft]) || null,
      municipality: r[idx.municipality] || ""
    });
  }

  return wanted;
}

function emptyFeatureCollection() {
  return { type: "FeatureCollection", features: [] };
}

function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  return fetch(url, { cache: "no-store", signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

function assertOk(response) {
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response;
}
