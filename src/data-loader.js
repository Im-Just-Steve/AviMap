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
      .then(assertOk)
      .then(r => r.text());
    result.airports = parseAirports(airportsCsv);
    onProgress(`Loaded ${result.airports.length.toLocaleString()} UK airports / aerodromes`);
  } catch (error) {
    console.warn("AviMap airport data failed:", error);
    onProgress("Airport data unavailable — map remains available.");
  }

  // These are deliberately independent. A problem with one aviation dataset
  // must never prevent the basemap from appearing.
  onProgress("Loading UK airspace…");
  try {
    result.airspace = await fetchWithTimeout(DATA_URLS.airspace, 15000)
      .then(assertOk)
      .then(r => r.json());
    onProgress(`Loaded ${result.airspace.features?.length ?? 0} airspace areas`);
  } catch (error) {
    console.warn("AviMap airspace data failed:", error);
    onProgress("UK airspace data unavailable.");
  }

  onProgress("Loading UK reporting points…");
  try {
    result.reportingPoints = await fetchWithTimeout(DATA_URLS.reportingPoints, 15000)
      .then(assertOk)
      .then(r => r.json());
    onProgress(`Loaded ${result.reportingPoints.features?.length ?? 0} reporting points`);
  } catch (error) {
    console.warn("AviMap reporting point data failed:", error);
    onProgress("Reporting-point data unavailable.");
  }

  return result;
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
