import { loadAviationData } from "./data-loader.js";
import {
  createMap, updateAviationData, drawRoute, setLayerVisible, setAircraft, centerOn,
  zoom, routeSummary, routeMetrics, routeDistanceText
} from "./map.js";
import { Connector } from "./connector.js";

const state = {
  data: null,
  route: [],
  routeMode: "idle",
  pendingStart: null,
  aircraft: null
};

const els = {
  connection: document.querySelector("#connectionStatus"),
  routeStatus: document.querySelector("#routeStatus"),
  routeInstruction: document.querySelector("#routeInstruction"),
  position: document.querySelector("#positionValue"),
  altitude: document.querySelector("#altitudeValue"),
  speed: document.querySelector("#speedValue"),
  heading: document.querySelector("#headingValue"),
  toast: document.querySelector("#toast"),
  selectionSheet: document.querySelector("#selectionSheet"),
  selectionType: document.querySelector("#selectionType"),
  selectionTitle: document.querySelector("#selectionTitle"),
  selectionSubtitle: document.querySelector("#selectionSubtitle"),
  startButton: document.querySelector("#selectStartButton"),
  destinationButton: document.querySelector("#selectDestinationButton"),
  settingsSheet: document.querySelector("#settingsSheet")
};

init();

async function init() {
  bindUI();

  // IMPORTANT: create the basemap immediately. Aviation data is an overlay,
  // not a prerequisite for showing the map.
  const emptyData = {
    airports: [],
    airspace: { type: "FeatureCollection", features: [] },
    reportingPoints: { type: "FeatureCollection", features: [] }
  };

  createMap({
    data: emptyData,
    onSelect: handleMapFeature,
    onReady: () => {
      drawRoute(state.route);
      setTimeout(() => loadDataInBackground(), 0);
    }
  });

  updateRouteUI();

  const connector = new Connector({
    onState: setConnectionState,
    onPosition: updateAircraft,
    onError: error => console.warn("AviMap connector:", error)
  });
  connector.connect();
}

async function loadDataInBackground() {
  showToast("Loading UK aviation data…");

  try {
    const data = await loadAviationData(message => {
      els.routeInstruction.textContent = message;
    });

    state.data = data;
    updateAviationData(data);
    updateRouteUI();

    const airportCount = data.airports?.length ?? 0;
    const airspaceCount = data.airspace?.features?.length ?? 0;
    const vrpCount = data.reportingPoints?.features?.length ?? 0;

    if (airportCount || airspaceCount || vrpCount) {
      showToast(`Aviation data ready · ${airportCount.toLocaleString()} airports · ${airspaceCount.toLocaleString()} airspace areas`);
    } else {
      showToast("Map ready, but aviation data could not be loaded.");
    }
  } catch (error) {
    console.error(error);
    showToast("Map ready — aviation data could not be loaded.");
  }
}

function bindUI() {
  document.querySelector("#settingsButton").addEventListener("pointerup", () => {
    els.settingsSheet.classList.remove("hidden");
  });
  document.querySelector("#settingsClose").addEventListener("pointerup", closeSettings);

  document.querySelector("#selectionClose").addEventListener("pointerup", closeSelection);

  els.startButton.addEventListener("pointerup", () => {
    if (!state.pendingStart) return;
    state.route = [state.pendingStart];
    state.routeMode = "awaiting-destination";
    closeSelection();
    drawRoute(state.route);
    updateRouteUI();
  });

  els.destinationButton.addEventListener("pointerup", () => {
    if (!state.pendingStart) return;
    const destination = state.pendingStart;
    if (state.routeMode === "awaiting-destination") {
      state.route = [state.route[0], destination];
      state.routeMode = "complete";
      drawRoute(state.route);
      updateRouteUI();
      closeSelection();
    }
  });

  document.querySelector("#clearRouteButton").addEventListener("pointerup", () => {
    state.route = [];
    state.routeMode = "idle";
    state.pendingStart = null;
    drawRoute(state.route);
    updateRouteUI();
  });

  document.querySelector("#locateButton").addEventListener("pointerup", () => {
    if (state.aircraft) centerOn(state.aircraft);
    else showToast("Waiting for the Windows AviMap Companion.");
  });

  document.querySelector("#zoomInButton").addEventListener("pointerup", () => zoom(.7));
  document.querySelector("#zoomOutButton").addEventListener("pointerup", () => zoom(-.7));

  document.querySelector("#airspaceToggle").addEventListener("change", e => setLayerVisible("airspace", e.target.checked));
  document.querySelector("#airportToggle").addEventListener("change", e => setLayerVisible("airports", e.target.checked));
  document.querySelector("#vrpToggle").addEventListener("change", e => setLayerVisible("vrps", e.target.checked));

  // Pointer events make the navigation/control model reliable on iPad and
  // also work for mouse/pen input on Windows.
  for (const sheet of [els.selectionSheet, els.settingsSheet]) {
    sheet.addEventListener("pointerup", e => {
      if (e.target === sheet) sheet.classList.add("hidden");
    });
  }
}

function handleMapFeature(feature) {
  if (feature.kind === "airspace") {
    showAirspaceInfo(feature);
    return;
  }

  if (!state.data) {
    showToast("Aviation data is still loading.");
    return;
  }

  const item = feature.kind === "airport"
    ? findAirport(feature.properties)
    : findVrp(feature.properties, feature.coordinates);

  if (!item) return;

  state.pendingStart = item;

  if (state.routeMode === "idle") {
    openSelection(
      feature.kind === "airport" ? "AIRPORT" : "VRP",
      item.ident,
      item.name || "",
      true
    );
    return;
  }

  if (state.routeMode === "awaiting-destination") {
    openSelection(
      feature.kind === "airport" ? "DESTINATION AIRPORT" : "DESTINATION VRP",
      item.ident,
      item.name || "",
      false
    );
  }
}

function findAirport(properties) {
  return state.data.airports.find(a =>
    String(a.id) === String(properties.id)
  );
}

function findVrp(properties, coordinates) {
  return {
    ident: properties.name || properties.designator || "VRP",
    name: properties.name || properties.designator || "Reporting point",
    lat: coordinates?.[1] ?? 0,
    lon: coordinates?.[0] ?? 0,
    type: "vrp"
  };
}

function openSelection(type, title, subtitle, isStart) {
  els.selectionType.textContent = type;
  els.selectionTitle.textContent = title;
  els.selectionSubtitle.textContent = subtitle;
  els.startButton.classList.toggle("hidden", !isStart);
  els.destinationButton.classList.toggle("hidden", isStart);
  els.selectionSheet.classList.remove("hidden");
}

function showAirspaceInfo(feature) {
  const name = feature.properties.name || feature.properties.designator || "Airspace";
  const type = feature.properties.type || "Airspace";
  showToast(`${name} · ${type}`);
}

function closeSelection() {
  els.selectionSheet.classList.add("hidden");
}

function closeSettings() {
  els.settingsSheet.classList.add("hidden");
}

function updateRouteUI() {
  els.routeStatus.textContent = state.route.length
    ? `${routeSummary(state.route)} · ${routeDistanceText(state.route)}`
    : "NO ROUTE";

  if (state.routeMode === "awaiting-destination") {
    els.routeInstruction.textContent = "Now tap the destination airport or VRP.";
  } else if (state.routeMode === "complete") {
    const metrics = routeMetrics(state.route);
    els.routeInstruction.textContent =
      `${Math.round(metrics.legs[0]?.bearing ?? 0)}° initial track · ${routeDistanceText(state.route)}`;
  } else {
    els.routeInstruction.textContent = "Tap an airport or VRP to start.";
  }
}

function updateAircraft(data) {
  state.aircraft = data;
  setAircraft(data);

  els.position.textContent = `${data.lat.toFixed(4)} / ${data.lon.toFixed(4)}`;
  els.altitude.textContent = `${Math.round(data.altitude).toLocaleString()} FT`;
  els.speed.textContent = `${Math.round(data.groundspeed)} KT`;
  els.heading.textContent = `${Math.round(data.heading)}°`;
}

function setConnectionState(status) {
  els.connection.classList.remove("connected", "error");
  if (status === "CONNECTED") els.connection.classList.add("connected");
  if (status === "UNAVAILABLE" || status === "DISCONNECTED") els.connection.classList.add("error");
  els.connection.querySelector("span").textContent = status;
}

let toastTimer;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 5000);
}
function hideToast() {
  els.toast.classList.add("hidden");
}
