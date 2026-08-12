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
    onProgress("Airport data unavailable — map remains available.");
  }

  onProgress("Loading UK airspace…");
  try {
    result.airspace = await loadGeoJsonOrXml(
      DATA_URLS.airspace,
      DATA_URLS.airspaceXml,
      parseOpenAipAirspaceXml
    );
    onProgress(`Loaded ${result.airspace.features.length.toLocaleString()} UK airspaces`);
  } catch (error) {
    console.warn("AviMap airspace data failed:", error);
    onProgress("UK airspace data unavailable.");
  }

  onProgress("Loading UK reporting points…");
  try {
    result.reportingPoints = await loadGeoJsonOrXml(
      DATA_URLS.reportingPoints,
      DATA_URLS.reportingPointsXml,
      parseOpenAipPointsXml
    );
    onProgress(`Loaded ${result.reportingPoints.features.length.toLocaleString()} UK reporting points`);
  } catch (error) {
    console.warn("AviMap reporting point data failed:", error);
    onProgress("Reporting-point data unavailable.");
  }

  return result;
}

async function loadGeoJsonOrXml(geojsonUrl, xmlUrl, xmlParser) {
  try {
    const response = await fetchWithTimeout(geojsonUrl, 20000);
    assertOk(response);
    const text = await response.text();

    // Some endpoints return JSON with a normal application/json content type;
    // parsing the text makes this resilient to incorrect server MIME types.
    try {
      const json = JSON.parse(text);
      const geo = normaliseGeoJson(json);
      if (geo.features.length) return geo;
    } catch {
      // Try XML fallback below.
    }
  } catch (error) {
    console.warn("GeoJSON aviation export unavailable:", error);
  }

  const xml = await fetchWithTimeout(xmlUrl, 20000)
    .then(assertOk)
    .then(r => r.text());

  const parsed = xmlParser(xml);
  if (!parsed.features.length) {
    throw new Error("Aviation export loaded but contained zero recognised features");
  }
  return parsed;
}

function normaliseGeoJson(input) {
  if (!input) return emptyFeatureCollection();

  if (input.type === "FeatureCollection") {
    return {
      type: "FeatureCollection",
      features: (input.features || []).filter(Boolean).map((feature, i) => ({
        ...feature,
        properties: {
          ...(feature.properties || {}),
          name: feature.properties?.name ||
            feature.properties?.NAME ||
            feature.properties?.designator ||
            feature.properties?.DESIGNATOR ||
            `AREA ${i + 1}`,
          type: feature.properties?.type ||
            feature.properties?.category ||
            feature.properties?.CATEGORY ||
            feature.properties?.class ||
            feature.properties?.AC ||
            ""
        }
      }))
    };
  }

  // Be tolerant of a single GeoJSON feature.
  if (input.type === "Feature") {
    return {
      type: "FeatureCollection",
      features: [input]
    };
  }

  return emptyFeatureCollection();
}

function parseOpenAipAirspaceXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid OpenAIP XML");

  // Use local-name() so this continues to work if a namespace is introduced.
  const airspaces = [...doc.getElementsByTagNameNS("*", "ASP")];
  const features = [];

  for (const asp of airspaces) {
    const category = asp.getAttribute("CATEGORY") || "OTHER";
    const name = childText(asp, "NAME") || category;
    const id = childText(asp, "ID") || `${category}-${features.length}`;

    const polygons = [...asp.getElementsByTagNameNS("*", "POLYGON")];
    for (const polygon of polygons) {
      const coords = parseCoordinateList(polygon.textContent);
      if (coords.length < 3) continue;

      features.push({
        type: "Feature",
        properties: {
          id,
          name,
          category,
          type: category,
          country: childText(asp, "COUNTRY") || "GB",
          top: formatAltLimit(asp, "ALTLIMIT_TOP"),
          bottom: formatAltLimit(asp, "ALTLIMIT_BOTTOM")
        },
        geometry: {
          type: "Polygon",
          coordinates: [ensureClosed(coords)]
        }
      });
    }
  }

  return { type: "FeatureCollection", features };
}

function parseOpenAipPointsXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid OpenAIP XML");

  const candidates = [
    ...doc.getElementsByTagNameNS("*", "WAYPOINT"),
    ...doc.getElementsByTagNameNS("*", "REPORTINGPOINT"),
    ...doc.getElementsByTagNameNS("*", "REPORTING_POINT")
  ];

  const features = [];
  for (const point of candidates) {
    const lat = Number(childText(point, "LAT"));
    const lon = Number(childText(point, "LON"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const name = childText(point, "NAME") ||
      childText(point, "IDENT") ||
      childText(point, "DESIGNATOR") || "VRP";

    features.push({
      type: "Feature",
      properties: {
        name,
        ident: childText(point, "IDENT") || name,
        country: childText(point, "COUNTRY") || "GB"
      },
      geometry: { type: "Point", coordinates: [lon, lat] }
    });
  }

  return { type: "FeatureCollection", features };
}

function childText(parent, localName) {
  const nodes = parent.getElementsByTagNameNS("*", localName);
  return nodes[0]?.textContent?.trim() || "";
}

function parseCoordinateList(text) {
  return String(text).split(",")
    .map(pair => pair.trim().split(/\s+/).map(Number))
    .filter(p => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(p => [p[0], p[1]]);
}

function ensureClosed(coords) {
  const first = coords[0];
  const last = coords[coords.length - 1];
  return first[0] === last[0] && first[1] === last[1]
    ? coords
    : [...coords, [...first]];
}

function formatAltLimit(asp, name) {
  const nodes = asp.getElementsByTagNameNS("*", name);
  const alt = nodes[0]?.getElementsByTagNameNS("*", "ALT")?.[0];
  return alt
    ? `${alt.textContent.trim()} ${alt.getAttribute("UNIT") || ""}`.trim()
    : "";
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
