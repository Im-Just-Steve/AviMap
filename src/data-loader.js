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
    const response = await fetchWithTimeout(DATA_URLS.airspace, 20000);
    assertOk(response);
    result.airspace = normaliseGeoJson(await response.json());
    if (!result.airspace.features.length) throw new Error("Local UK airspace file contains zero features");
    onProgress(`Loaded ${result.airspace.features.length.toLocaleString()} UK airspaces`);
  } catch (error) {
    console.error("AviMap local airspace data failed:", error);
    onProgress("UK airspace data unavailable — map remains available.");
  }

  onProgress("Loading UK VRPs / reporting points…");
  try {
    const response = await fetchWithTimeout(DATA_URLS.reportingPoints, 20000);
    assertOk(response);
    result.reportingPoints = normaliseGeoJson(await response.json());
    if (!result.reportingPoints.features.length) {
      throw new Error("Local UK reporting-point file contains zero features");
    }
    onProgress(`Loaded ${result.reportingPoints.features.length.toLocaleString()} UK VRPs`);
  } catch (error) {
    console.error("AviMap reporting-point data failed:", error);
    onProgress("UK VRP data unavailable — map remains available.");
  }

  return result;
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
