const countrySelect = document.getElementById("countryIso3");
const browserTitle = document.getElementById("browser-title");
const countrySummary = document.getElementById("country-summary");
const groupChips = document.getElementById("group-chips");
const speciesFilterInput = document.getElementById("speciesFilter");
const speciesList = document.getElementById("species-list");
const ticketForm = document.getElementById("ticket-form");
const githubRepoInput = document.getElementById("githubRepo");
const currentSpeciesField = document.getElementById("current-species-field");
const currentSpeciesSelect = document.getElementById("currentSpeciesItemId");
const proposedSpeciesField = document.getElementById("proposed-species-field");
const proposedSpeciesInput = document.getElementById("proposedSpeciesLabel");
const proposedSpeciesItemIdInput = document.getElementById("proposedSpeciesItemId");
const animalOptions = document.getElementById("animal-options");
const scopeField = document.getElementById("scope-field");
const scopeSelect = document.getElementById("scope");
const mapHint = document.getElementById("map-hint");
const explanationInput = document.getElementById("explanation");
const clearDrawingButton = document.getElementById("clear-drawing");
const statusLine = document.getElementById("status-line");
const ticketTitleInput = document.getElementById("ticket-title");
const ticketBodyInput = document.getElementById("ticket-body");
const copyMarkdownButton = document.getElementById("copy-markdown");
const openGithubLink = document.getElementById("open-github");
const ticketWarnings = document.getElementById("ticket-warnings");
const mapSummary = document.getElementById("map-summary");

const DEFAULT_MAP_CENTER = [24, 10];
const DEFAULT_MAP_ZOOM = 2;
const DEG_TO_RAD = Math.PI / 180;
const LATITUDE_KM_PER_DEGREE = 110.574;
const LONGITUDE_KM_PER_DEGREE = 111.32;
const COASTLINE_SNAP_DISTANCE_KM = 8;
const COASTLINE_FILL_BUFFER_KM = 4;
const GEOBOUNDARIES_API_ROOT = "https://www.geoboundaries.org/api/current/gbOpen";
const GEOBOUNDARIES_FULL_GEOMETRY_VERTEX_LIMIT = 50000;
const GITHUB_REPO_STORAGE_KEY = "animal-detect-geofence.githubRepo.v1";
const GROUP_ORDER = ["countrywide", "regional", "country_pack_only", "needs_review", "no_points", "unscored"];
const GROUP_LABELS = {
  all: "All species",
  countrywide: "National",
  regional: "Regional",
  country_pack_only: "Country-level",
  needs_review: "Review",
  no_points: "No points",
  unscored: "Unscored",
};

const countryCenterCache = new Map();
const countryGeometryCache = new Map();
const countryBoundarySegmentCache = new WeakMap();
const animalLabelIndex = new Map();

const CURRENT_REGIONAL_STYLE = {
  color: "#2d9046",
  weight: 1.2,
  opacity: 0.94,
  fillColor: "#a4ee16",
  fillOpacity: 0.18,
};
const CURRENT_REGIONAL_HOVER_STYLE = {
  color: "#181c1f",
  weight: 2,
  opacity: 1,
  fillColor: "#2d9046",
  fillOpacity: 0.22,
};
const CURRENT_REGIONAL_SELECTED_STYLE = {
  color: "#181c1f",
  weight: 2.4,
  opacity: 1,
  fillColor: "#a4ee16",
  fillOpacity: 0.3,
};
const DRAFT_POLYGON_STYLE = {
  color: "#181c1f",
  weight: 2,
  opacity: 0.95,
  fillColor: "#a4ee16",
  fillOpacity: 0.2,
  dashArray: "8 5",
};

const state = {
  currentCountry: null,
  groupFilter: "all",
  speciesFilter: "",
  highlightedSpeciesId: "",
  preview: null,
  drawnPolygons: [],
};

let reviewMap;
let drawControl = null;
let currentRegionalOverlayLayer;
let currentRegionalEntries = [];
let currentRegionalHoverTooltip;
let hoveredRegionalLayers = [];
let selectedRegionalLayers = [];
let suggestionDrawLayer;
let worldCountryGeometryIndexPromise;

function suggestionType() {
  const selected = document.querySelector('input[name="suggestionType"]:checked');
  return selected?.value || "addition";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function speciesSortName(entry) {
  return (entry.commonName || entry.binomial || entry.label || "").toLocaleLowerCase();
}

function roundCoordinate(value) {
  return Math.round(Number(value) * 1e6) / 1e6;
}

function setStatus(message, isError = false) {
  statusLine.textContent = message;
  statusLine.classList.toggle("error", Boolean(isError));
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  return payload;
}

function geoBoundariesMediaUrl(url) {
  if (!url || typeof url !== "string") {
    return null;
  }

  if (url.startsWith("https://github.com/")) {
    return url.replace("https://github.com/", "https://media.githubusercontent.com/media/").replace("/raw/", "/");
  }

  return url;
}

async function fetchCountryGeometryFromGeoBoundaries(iso3) {
  const metadata = await fetchJson(`${GEOBOUNDARIES_API_ROOT}/${encodeURIComponent(iso3)}/ADM0/`);
  const meanVertices = Number(metadata?.meanVertices);
  const preferFullGeometry = Number.isFinite(meanVertices) && meanVertices <= GEOBOUNDARIES_FULL_GEOMETRY_VERTEX_LIMIT;
  const downloadUrl = geoBoundariesMediaUrl(
    preferFullGeometry
      ? metadata?.gjDownloadURL || metadata?.simplifiedGeometryGeoJSON
      : metadata?.simplifiedGeometryGeoJSON || metadata?.gjDownloadURL
  );

  if (!downloadUrl) {
    throw new Error(`No geoBoundaries download URL available for ${iso3}.`);
  }

  return fetchJson(downloadUrl);
}

async function fetchCountryGeometry(iso3) {
  if (!iso3) {
    return null;
  }
  if (countryGeometryCache.has(iso3)) {
    return countryGeometryCache.get(iso3);
  }

  try {
    const geoboundariesGeometry = await fetchCountryGeometryFromGeoBoundaries(iso3);
    countryGeometryCache.set(iso3, geoboundariesGeometry);
    return geoboundariesGeometry;
  } catch {
    // Fall through to lighter public sources.
  }

  try {
    if (!worldCountryGeometryIndexPromise) {
      worldCountryGeometryIndexPromise = fetchJson(
        "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
      )
        .then((payload) => {
          const index = new Map();
          (payload?.features || []).forEach((feature) => {
            const featureIso3 = feature?.properties?.["ISO3166-1-Alpha-3"];
            if (!featureIso3 || index.has(featureIso3)) {
              return;
            }
            index.set(featureIso3, {
              type: "FeatureCollection",
              features: [feature],
            });
          });
          return index;
        })
        .catch((error) => {
          worldCountryGeometryIndexPromise = null;
          throw error;
        });
    }

    const index = await worldCountryGeometryIndexPromise;
    const indexed = index.get(iso3) || null;
    if (indexed) {
      countryGeometryCache.set(iso3, indexed);
      return indexed;
    }
  } catch {
    // Fall through to direct country file.
  }

  try {
    const direct = await fetchJson(
      `https://raw.githubusercontent.com/johan/world.geo.json/master/countries/${encodeURIComponent(iso3)}.geo.json`
    );
    countryGeometryCache.set(iso3, direct);
    return direct;
  } catch {
    countryGeometryCache.set(iso3, null);
    return null;
  }
}

async function getCountryCenter(iso3) {
  if (!iso3) {
    return null;
  }
  if (countryCenterCache.has(iso3)) {
    return countryCenterCache.get(iso3);
  }

  try {
    const payload = await fetchJson(
      `https://restcountries.com/v3.1/alpha/${encodeURIComponent(iso3)}?fields=latlng,area`
    );
    const country = Array.isArray(payload) ? payload[0] : payload;
    if (!Array.isArray(country?.latlng) || country.latlng.length !== 2) {
      countryCenterCache.set(iso3, null);
      return null;
    }

    const area = Number(country.area);
    const zoom = area < 2000 ? 9 : area < 20000 ? 8 : area < 100000 ? 7 : area < 500000 ? 6 : area < 1500000 ? 5 : 4;
    const value = {
      latlng: [country.latlng[0], country.latlng[1]],
      zoom,
    };
    countryCenterCache.set(iso3, value);
    return value;
  } catch {
    countryCenterCache.set(iso3, null);
    return null;
  }
}

function closeCoordinateRing(ring) {
  if (!Array.isArray(ring) || ring.length < 3) {
    return [];
  }

  const nextRing = ring.map((point) => [Number(point[0]), Number(point[1])]);
  const first = nextRing[0];
  const last = nextRing[nextRing.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    nextRing.push([first[0], first[1]]);
  }
  return nextRing;
}

function geoJsonToClipMultiPolygon(geoJson) {
  if (!geoJson) {
    return [];
  }

  const features = geoJson.type === "FeatureCollection"
    ? geoJson.features || []
    : geoJson.type === "Feature"
      ? [geoJson]
      : [{ type: "Feature", geometry: geoJson, properties: {} }];

  const polygons = [];
  features.forEach((feature) => {
    const geometry = feature?.geometry;
    if (!geometry) {
      return;
    }
    if (geometry.type === "Polygon") {
      const polygon = geometry.coordinates.map(closeCoordinateRing).filter((ring) => ring.length >= 4);
      if (polygon.length) {
        polygons.push(polygon);
      }
      return;
    }
    if (geometry.type === "MultiPolygon") {
      geometry.coordinates.forEach((candidate) => {
        const polygon = candidate.map(closeCoordinateRing).filter((ring) => ring.length >= 4);
        if (polygon.length) {
          polygons.push(polygon);
        }
      });
    }
  });

  return polygons;
}

function pointsEqual(pointA, pointB, tolerance = 1e-9) {
  return Math.abs(pointA[0] - pointB[0]) <= tolerance && Math.abs(pointA[1] - pointB[1]) <= tolerance;
}

function projectLngLatToKilometers(point, referenceLatitude) {
  const longitudeScale = LONGITUDE_KM_PER_DEGREE * Math.cos(referenceLatitude * DEG_TO_RAD);
  return [
    point[0] * longitudeScale,
    point[1] * LATITUDE_KM_PER_DEGREE,
  ];
}

function nearestPointOnBoundarySegment(point, segmentStart, segmentEnd) {
  const referenceLatitude = (point[1] + segmentStart[1] + segmentEnd[1]) / 3;
  const [pointX, pointY] = projectLngLatToKilometers(point, referenceLatitude);
  const [startX, startY] = projectLngLatToKilometers(segmentStart, referenceLatitude);
  const [endX, endY] = projectLngLatToKilometers(segmentEnd, referenceLatitude);
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const denominator = deltaX * deltaX + deltaY * deltaY;
  const ratio = denominator === 0
    ? 0
    : Math.max(0, Math.min(1, ((pointX - startX) * deltaX + (pointY - startY) * deltaY) / denominator));
  const snappedPoint = [
    segmentStart[0] + (segmentEnd[0] - segmentStart[0]) * ratio,
    segmentStart[1] + (segmentEnd[1] - segmentStart[1]) * ratio,
  ];
  const [snappedX, snappedY] = projectLngLatToKilometers(snappedPoint, referenceLatitude);

  return {
    distanceKm: Math.hypot(pointX - snappedX, pointY - snappedY),
    point: snappedPoint,
  };
}

function getCountryBoundarySegments(countryGeometry) {
  if (!countryGeometry) {
    return [];
  }
  if (countryBoundarySegmentCache.has(countryGeometry)) {
    return countryBoundarySegmentCache.get(countryGeometry);
  }

  const polygons = geoJsonToClipMultiPolygon(countryGeometry);
  const segments = [];

  polygons.forEach((polygon) => {
    const outerRing = polygon[0] || [];
    for (let index = 0; index < outerRing.length - 1; index += 1) {
      segments.push(Object.assign([outerRing[index], outerRing[index + 1]], {
        ring: outerRing,
        startIndex: index,
      }));
    }
  });

  countryBoundarySegmentCache.set(countryGeometry, segments);
  return segments;
}

function distanceBetweenLngLatPoints(pointA, pointB) {
  const referenceLatitude = (pointA[1] + pointB[1]) / 2;
  const [pointAX, pointAY] = projectLngLatToKilometers(pointA, referenceLatitude);
  const [pointBX, pointBY] = projectLngLatToKilometers(pointB, referenceLatitude);
  return Math.hypot(pointAX - pointBX, pointAY - pointBY);
}

function midpointBetweenLngLatPoints(pointA, pointB) {
  return [
    (pointA[0] + pointB[0]) / 2,
    (pointA[1] + pointB[1]) / 2,
  ];
}

function dedupeConsecutivePoints(points) {
  return points.filter((point, index) => index === 0 || !pointsEqual(point, points[index - 1]));
}

function nearestCountryBoundaryPoint(point, countryBoundarySegments) {
  let bestMatch = null;
  countryBoundarySegments.forEach((segment) => {
    const candidate = nearestPointOnBoundarySegment(point, segment[0], segment[1]);
    if (!bestMatch || candidate.distanceKm < bestMatch.distanceKm) {
      bestMatch = {
        ...candidate,
        segment,
      };
    }
  });
  return bestMatch;
}

function buildForwardBoundaryPath(fromMatch, toMatch) {
  if (!fromMatch?.segment?.ring || fromMatch.segment.ring !== toMatch?.segment?.ring) {
    return null;
  }

  const baseRing = fromMatch.segment.ring.slice(0, -1);
  const pointCount = baseRing.length;
  if (!pointCount) {
    return null;
  }

  const path = [fromMatch.point];
  let index = (fromMatch.segment.startIndex + 1) % pointCount;
  const stopIndex = (toMatch.segment.startIndex + 1) % pointCount;
  let guard = 0;

  while (index !== stopIndex && guard <= pointCount) {
    path.push(baseRing[index]);
    index = (index + 1) % pointCount;
    guard += 1;
  }

  path.push(toMatch.point);
  return dedupeConsecutivePoints(path);
}

function boundaryPathLengthKm(path) {
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    total += distanceBetweenLngLatPoints(path[index], path[index + 1]);
  }
  return total;
}

function shortestBoundaryPath(fromMatch, toMatch) {
  const forwardPath = buildForwardBoundaryPath(fromMatch, toMatch);
  const reverseSeed = buildForwardBoundaryPath(toMatch, fromMatch);
  if (!forwardPath || !reverseSeed) {
    return forwardPath || reverseSeed || null;
  }

  const reversePath = dedupeConsecutivePoints(reverseSeed.slice().reverse());
  return boundaryPathLengthKm(forwardPath) <= boundaryPathLengthKm(reversePath) ? forwardPath : reversePath;
}

function buildCoastlineBridgePolygon(edgeStart, edgeEnd, countryBoundarySegments, maxDistanceKm = COASTLINE_SNAP_DISTANCE_KM) {
  const startMatch = nearestCountryBoundaryPoint(edgeStart, countryBoundarySegments);
  const endMatch = nearestCountryBoundaryPoint(edgeEnd, countryBoundarySegments);
  const midpointMatch = nearestCountryBoundaryPoint(midpointBetweenLngLatPoints(edgeStart, edgeEnd), countryBoundarySegments);

  if (!startMatch || !endMatch || !midpointMatch) {
    return null;
  }
  if (startMatch.distanceKm > maxDistanceKm || endMatch.distanceKm > maxDistanceKm || midpointMatch.distanceKm > maxDistanceKm) {
    return null;
  }
  if (startMatch.segment.ring !== endMatch.segment.ring || startMatch.segment.ring !== midpointMatch.segment.ring) {
    return null;
  }

  const coastlinePath = shortestBoundaryPath(endMatch, startMatch);
  if (!coastlinePath || coastlinePath.length < 2) {
    return null;
  }

  const edgeLengthKm = distanceBetweenLngLatPoints(edgeStart, edgeEnd);
  const coastlinePathKm = boundaryPathLengthKm(coastlinePath);
  if (coastlinePathKm > Math.max(maxDistanceKm * 4, edgeLengthKm * 3)) {
    return null;
  }

  const bridgeRing = closeCoordinateRing(dedupeConsecutivePoints([edgeStart, edgeEnd, ...coastlinePath]));
  return bridgeRing.length >= 4 ? [[bridgeRing]] : null;
}

function footprintHasNearbyCoastline(footprint, countryBoundarySegments, maxDistanceKm = COASTLINE_SNAP_DISTANCE_KM) {
  return footprint.some((polygon) => {
    const outerRing = polygon[0] || [];
    for (let index = 0; index < outerRing.length - 1; index += 1) {
      const edgeStart = outerRing[index];
      const edgeEnd = outerRing[index + 1];
      const startMatch = nearestCountryBoundaryPoint(edgeStart, countryBoundarySegments);
      const endMatch = nearestCountryBoundaryPoint(edgeEnd, countryBoundarySegments);
      const midpointMatch = nearestCountryBoundaryPoint(midpointBetweenLngLatPoints(edgeStart, edgeEnd), countryBoundarySegments);
      if (startMatch?.distanceKm <= maxDistanceKm || endMatch?.distanceKm <= maxDistanceKm || midpointMatch?.distanceKm <= maxDistanceKm) {
        return true;
      }
    }
    return false;
  });
}

function footprintToGeoJsonFeature(footprint) {
  if (!Array.isArray(footprint) || !footprint.length) {
    return null;
  }

  return {
    type: "Feature",
    properties: {},
    geometry: footprint.length === 1
      ? { type: "Polygon", coordinates: footprint[0] }
      : { type: "MultiPolygon", coordinates: footprint },
  };
}

function bufferFootprintTowardCoastline(footprint, country, countryBoundarySegments) {
  const clipper = window.polygonClipping;
  const turf = window.turf;

  if (!clipper?.intersection || !turf?.buffer || !footprintHasNearbyCoastline(footprint, countryBoundarySegments)) {
    return null;
  }

  try {
    const footprintFeature = footprintToGeoJsonFeature(footprint);
    const bufferedFeature = turf.buffer(footprintFeature, COASTLINE_FILL_BUFFER_KM, { units: "kilometers" });
    const bufferedFootprint = geoJsonToClipMultiPolygon(bufferedFeature);
    const clipped = clipper.intersection(bufferedFootprint, country);
    return Array.isArray(clipped) && clipped.length ? clipped : null;
  } catch {
    return null;
  }
}

function snapFootprintTowardCoastline(footprint, countryGeometry) {
  const clipper = window.polygonClipping;
  const countryBoundarySegments = getCountryBoundarySegments(countryGeometry);
  const country = geoJsonToClipMultiPolygon(countryGeometry);

  if (!footprint.length || !country.length || !countryBoundarySegments.length || !clipper?.union) {
    return footprint;
  }

  const bufferedFootprint = bufferFootprintTowardCoastline(footprint, country, countryBoundarySegments);
  if (bufferedFootprint) {
    return bufferedFootprint;
  }

  const coastlineBridgePolygons = [];
  footprint.forEach((polygon) => {
    const outerRing = polygon[0] || [];
    for (let index = 0; index < outerRing.length - 1; index += 1) {
      const bridgePolygon = buildCoastlineBridgePolygon(outerRing[index], outerRing[index + 1], countryBoundarySegments);
      if (bridgePolygon) {
        coastlineBridgePolygons.push(bridgePolygon);
      }
    }
  });

  if (!coastlineBridgePolygons.length) {
    return footprint;
  }

  try {
    return coastlineBridgePolygons.reduce((expandedFootprint, bridgePolygon) => {
      const nextExpandedFootprint = clipper.union(expandedFootprint, bridgePolygon);
      return Array.isArray(nextExpandedFootprint) && nextExpandedFootprint.length ? nextExpandedFootprint : expandedFootprint;
    }, footprint);
  } catch {
    return footprint;
  }
}

function clipFeatureToCountry(feature, countryGeometry) {
  const clipper = window.polygonClipping;
  const footprint = geoJsonToClipMultiPolygon(feature);
  const country = geoJsonToClipMultiPolygon(countryGeometry);

  if (!footprint.length || !country.length || !clipper?.intersection) {
    return [feature];
  }

  try {
    const expandedFootprint = snapFootprintTowardCoastline(footprint, countryGeometry);
    const clipped = clipper.intersection(expandedFootprint, country);
    if (!Array.isArray(clipped) || !clipped.length) {
      return [];
    }

    return clipped.map((coordinates) => ({
      type: "Feature",
      properties: { ...(feature.properties || {}) },
      geometry: {
        type: "Polygon",
        coordinates,
      },
    }));
  } catch {
    return [feature];
  }
}

function pointOnSegment(px, py, ax, ay, bx, by) {
  const cross = (py - ay) * (bx - ax) - (px - ax) * (by - ay);
  if (Math.abs(cross) > 1e-9) {
    return false;
  }
  const minX = Math.min(ax, bx) - 1e-9;
  const maxX = Math.max(ax, bx) + 1e-9;
  const minY = Math.min(ay, by) - 1e-9;
  const maxY = Math.max(ay, by) + 1e-9;
  return minX <= px && px <= maxX && minY <= py && py <= maxY;
}

function pointInRing(latlng, ring) {
  if (!Array.isArray(ring) || ring.length < 4) {
    return false;
  }

  const testX = latlng.lng;
  const testY = latlng.lat;
  let inside = false;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const [ax, ay] = ring[index];
    const [bx, by] = ring[index + 1];

    if (pointOnSegment(testX, testY, ax, ay, bx, by)) {
      return true;
    }

    const intersects = ((ay > testY) !== (by > testY)) &&
      testX < ((bx - ax) * (testY - ay)) / ((by - ay) || 1e-12) + ax;
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function pointInPolygonGeometry(latlng, coordinates) {
  if (!Array.isArray(coordinates) || !coordinates.length) {
    return false;
  }

  const [outerRing, ...holes] = coordinates;
  if (!pointInRing(latlng, outerRing)) {
    return false;
  }

  return !holes.some((hole) => pointInRing(latlng, hole));
}

function pointInFeatureGeometry(latlng, geometry) {
  if (!geometry) {
    return false;
  }
  if (geometry.type === "Polygon") {
    return pointInPolygonGeometry(latlng, geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygonGeometry(latlng, polygon));
  }
  return false;
}

function formatSpeciesList(species) {
  return species
    .map((item) => escapeHtml(item.label || item.commonName || item.binomial || "Unknown species"))
    .join("<br>");
}

function buildRegionalHoverTooltipHtml(entries) {
  const speciesById = new Map();
  entries.forEach(({ feature }) => {
    (feature.properties?.species || []).forEach((species) => {
      const key = species.itemId || species.label;
      if (!speciesById.has(key)) {
        speciesById.set(key, species);
      }
    });
  });

  const species = Array.from(speciesById.values()).sort((left, right) => {
    return (left.commonName || left.binomial || left.label || "").localeCompare(right.commonName || right.binomial || right.label || "");
  });

  return `
    <div class="footprint-tooltip">
      <strong>${species.length} regional species</strong>
      <div>${formatSpeciesList(species)}</div>
    </div>
  `;
}

function refreshRegionalLayerStyles() {
  const hovered = new Set(hoveredRegionalLayers);
  const selected = new Set(selectedRegionalLayers);

  currentRegionalEntries.forEach(({ layer }) => {
    if (hovered.has(layer)) {
      layer.setStyle(CURRENT_REGIONAL_HOVER_STYLE);
      if (layer.bringToFront) {
        layer.bringToFront();
      }
      return;
    }
    if (selected.has(layer)) {
      layer.setStyle(CURRENT_REGIONAL_SELECTED_STYLE);
      if (layer.bringToFront) {
        layer.bringToFront();
      }
      return;
    }
    layer.setStyle(CURRENT_REGIONAL_STYLE);
  });
}

function resetRegionalHoverState() {
  hoveredRegionalLayers = [];
  if (currentRegionalHoverTooltip) {
    reviewMap.removeLayer(currentRegionalHoverTooltip);
    currentRegionalHoverTooltip = null;
  }
  refreshRegionalLayerStyles();
}

function clearRegionalOverlays() {
  if (currentRegionalOverlayLayer) {
    reviewMap.removeLayer(currentRegionalOverlayLayer);
    currentRegionalOverlayLayer = null;
  }
  currentRegionalEntries = [];
  hoveredRegionalLayers = [];
  selectedRegionalLayers = [];
  if (currentRegionalHoverTooltip) {
    reviewMap.removeLayer(currentRegionalHoverTooltip);
    currentRegionalHoverTooltip = null;
  }
}

function handleRegionalOverlayHover(event) {
  if (!currentRegionalEntries.length) {
    resetRegionalHoverState();
    return;
  }

  const hits = currentRegionalEntries.filter(({ feature }) => pointInFeatureGeometry(event.latlng, feature.geometry));
  if (!hits.length) {
    resetRegionalHoverState();
    return;
  }

  hoveredRegionalLayers = hits.map(({ layer }) => layer);
  refreshRegionalLayerStyles();

  if (!currentRegionalHoverTooltip) {
    currentRegionalHoverTooltip = L.tooltip({ direction: "top", opacity: 0.96, sticky: true });
  }

  currentRegionalHoverTooltip.setLatLng(event.latlng).setContent(buildRegionalHoverTooltipHtml(hits));
  if (!reviewMap.hasLayer(currentRegionalHoverTooltip)) {
    currentRegionalHoverTooltip.addTo(reviewMap);
  }
}

function fitGeoJsonBounds(geoJson) {
  if (!geoJson) {
    return false;
  }
  const bounds = L.geoJSON(geoJson).getBounds();
  if (!bounds.isValid()) {
    return false;
  }
  reviewMap.fitBounds(bounds.pad(0.06), { animate: false });
  return true;
}

async function focusSelectedCountry(countryGeometry = null) {
  if (countryGeometry && fitGeoJsonBounds(countryGeometry)) {
    return;
  }

  const focus = await getCountryCenter(countrySelect.value);
  if (focus) {
    reviewMap.setView(focus.latlng, focus.zoom, { animate: false });
    return;
  }

  reviewMap.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, { animate: false });
}

async function loadRegionalOverlays() {
  if (!countrySelect.value) {
    clearRegionalOverlays();
    updateMapSummary();
    return;
  }

  clearRegionalOverlays();

  try {
    const [overlayData, countryGeometry] = await Promise.all([
      fetchJson(`/api/countries/${encodeURIComponent(countrySelect.value)}/regional-overlays`),
      fetchCountryGeometry(countrySelect.value),
    ]);

    const features = (overlayData.features || []).flatMap((feature) =>
      countryGeometry ? clipFeatureToCountry(feature, countryGeometry) : [feature]
    );

    if (features.length) {
      currentRegionalOverlayLayer = L.geoJSON({ type: "FeatureCollection", features }, {
        style: CURRENT_REGIONAL_STYLE,
        onEachFeature: (feature, layer) => {
          currentRegionalEntries.push({ feature, layer });
          layer.on("click", () => {
            const species = feature.properties?.species || [];
            if (species.length === 1) {
              applySpeciesSelection(species[0].itemId, true);
            }
          });
        },
      }).addTo(reviewMap);
    }

    await focusSelectedCountry(countryGeometry);
    updateSelectedRegionalLayers(false);
    updateMapSummary();
  } catch (error) {
    console.error(error);
    mapSummary.textContent = "Could not load the current regional overlays.";
  }
}

function initializeMap() {
  reviewMap = L.map("review-map", {
    zoomControl: true,
    worldCopyJump: true,
    minZoom: 2,
  }).setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(reviewMap);

  suggestionDrawLayer = new L.FeatureGroup();
  reviewMap.addLayer(suggestionDrawLayer);
  reviewMap.on("mousemove", handleRegionalOverlayHover);
  reviewMap.on("mouseout", resetRegionalHoverState);

  reviewMap.on(L.Draw.Event.CREATED, (event) => {
    suggestionDrawLayer.addLayer(event.layer);
    syncDrawnPolygons();
  });
  reviewMap.on(L.Draw.Event.EDITED, () => {
    syncDrawnPolygons();
  });
  reviewMap.on(L.Draw.Event.DELETED, () => {
    syncDrawnPolygons();
  });

  requestAnimationFrame(() => {
    reviewMap.invalidateSize();
  });
}

function enableDrawing(enabled) {
  if (!reviewMap) {
    return;
  }

  if (drawControl) {
    reviewMap.removeControl(drawControl);
    drawControl = null;
  }

  if (!enabled) {
    return;
  }

  drawControl = new L.Control.Draw({
    position: "topright",
    draw: {
      polygon: {
        allowIntersection: false,
        showArea: true,
        shapeOptions: DRAFT_POLYGON_STYLE,
      },
      polyline: false,
      rectangle: false,
      circle: false,
      marker: false,
      circlemarker: false,
    },
    edit: {
      featureGroup: suggestionDrawLayer,
      edit: true,
      remove: true,
    },
  });

  reviewMap.addControl(drawControl);
}

function extractPolygonLatLngs(layer) {
  const latLngs = layer.getLatLngs();
  const ring = Array.isArray(latLngs?.[0]) ? latLngs[0] : latLngs;
  if (!Array.isArray(ring)) {
    return null;
  }

  const polygon = ring.map((point) => [roundCoordinate(point.lat), roundCoordinate(point.lng)]);
  if (polygon.length > 1) {
    const first = polygon[0];
    const last = polygon[polygon.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      polygon.pop();
    }
  }
  return polygon.length >= 3 ? polygon : null;
}

function syncDrawnPolygons() {
  state.drawnPolygons = suggestionDrawLayer.getLayers()
    .map((layer) => extractPolygonLatLngs(layer))
    .filter(Boolean);
  clearTicketPreview();
  updateMapHint();
  updateMapSummary();
}

function clearDrawnPolygons() {
  suggestionDrawLayer.clearLayers();
  state.drawnPolygons = [];
  clearTicketPreview();
  updateMapHint();
  updateMapSummary();
}

function populateCountrySelect(countries) {
  const options = countries.map((country) => {
    const option = document.createElement("option");
    option.value = country.iso3;
    option.textContent = country.countryName;
    return option;
  });

  countrySelect.replaceChildren(...options);
  countrySelect.value = countries.some((country) => country.iso3 === "DNK") ? "DNK" : countries[0]?.iso3 || "";
}

function populateAnimalOptions(animals) {
  animalLabelIndex.clear();
  const options = animals.map((animal) => {
    animalLabelIndex.set(animal.label, animal.itemId);
    const option = document.createElement("option");
    option.value = animal.label;
    return option;
  });

  animalOptions.replaceChildren(...options);
}

function populateCurrentSpeciesSelect(species) {
  const previous = currentSpeciesSelect.value;
  const options = [
    Object.assign(document.createElement("option"), {
      value: "",
      textContent: "Select from current country pack",
    }),
    ...species.map((entry) => {
      const option = document.createElement("option");
      option.value = entry.itemId;
      option.textContent = `${entry.label} · ${entry.footprintShort}`;
      return option;
    }),
  ];

  currentSpeciesSelect.replaceChildren(...options);
  currentSpeciesSelect.value = species.some((entry) => entry.itemId === previous) ? previous : "";
}

function currentSpeciesById(itemId) {
  return state.currentCountry?.species?.find((entry) => entry.itemId === itemId) || null;
}

function buildSummaryText(country) {
  const summary = country.summary || {};
  const total = summary.total || country.species.length || 0;
  const bucketCounts = summary.bucketCounts || {};
  const pieces = [`${total} species`, `${country.precomputeMode} pack`];

  if (bucketCounts["Likely Valid"]) {
    pieces.push(`${bucketCounts["Likely Valid"]} likely valid`);
  }
  if (bucketCounts["Needs Review"]) {
    pieces.push(`${bucketCounts["Needs Review"]} review`);
  }
  if (bucketCounts.New) {
    pieces.push(`${bucketCounts.New} new`);
  }

  if (country.groups?.regional) {
    pieces.push(`${country.groups.regional} regional`);
  }

  return pieces.join(" · ");
}

function renderCountryHeader() {
  if (!state.currentCountry) {
    browserTitle.textContent = "No country loaded";
    countrySummary.textContent = "";
    return;
  }

  browserTitle.textContent = state.currentCountry.countryName;
  countrySummary.textContent = buildSummaryText(state.currentCountry);
}

function renderGroupChips() {
  if (!state.currentCountry) {
    groupChips.innerHTML = "";
    return;
  }

  const buttons = [];
  const total = state.currentCountry.species.length;
  buttons.push(`
    <button class="chip ${state.groupFilter === "all" ? "active" : ""}" data-group="all" type="button">
      ${GROUP_LABELS.all} (${total})
    </button>
  `);

  GROUP_ORDER.forEach((groupKey) => {
    const count = state.currentCountry.groups?.[groupKey] || 0;
    if (!count) {
      return;
    }
    buttons.push(`
      <button class="chip ${state.groupFilter === groupKey ? "active" : ""}" data-group="${groupKey}" type="button">
        ${GROUP_LABELS[groupKey] || groupKey} (${count})
      </button>
    `);
  });

  groupChips.innerHTML = buttons.join("");
}

function filteredSpecies() {
  if (!state.currentCountry) {
    return [];
  }

  const search = state.speciesFilter.toLocaleLowerCase();
  return state.currentCountry.species.filter((entry) => {
    if (state.groupFilter !== "all" && entry.footprintCode !== state.groupFilter) {
      return false;
    }
    if (!search) {
      return true;
    }

    const haystack = [entry.label, entry.commonName, entry.binomial, entry.footprintLabel]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    return haystack.includes(search);
  });
}

function renderSpeciesCard(entry) {
  const selectedClass = state.highlightedSpeciesId === entry.itemId ? "selected" : "";
  return `
    <button class="species-card ${selectedClass}" type="button" data-item-id="${entry.itemId}">
      <div class="species-card-main">
        <div>
          <strong>${escapeHtml(entry.commonName || entry.label)}</strong>
          ${entry.binomial ? `<em>${escapeHtml(entry.binomial)}</em>` : ""}
        </div>
      </div>
      <div class="species-card-meta">
        <span class="badge badge-footprint">${escapeHtml(entry.footprintShort)}</span>
        <span class="badge badge-bucket">${escapeHtml(entry.bucket)}</span>
      </div>
    </button>
  `;
}

function renderSpeciesList() {
  const entries = filteredSpecies();
  if (!entries.length) {
    speciesList.innerHTML = '<article class="empty-card">No species match the current filters.</article>';
    return;
  }

  const groups = new Map();
  GROUP_ORDER.forEach((groupKey) => groups.set(groupKey, []));
  entries.forEach((entry) => {
    const bucket = groups.get(entry.footprintCode) || [];
    bucket.push(entry);
    groups.set(entry.footprintCode, bucket);
  });

  const sections = GROUP_ORDER
    .map((groupKey) => {
      const groupEntries = (groups.get(groupKey) || []).slice().sort((left, right) => speciesSortName(left).localeCompare(speciesSortName(right)));
      if (!groupEntries.length) {
        return "";
      }
      return `
        <section class="species-group">
          <div class="species-group-head">
            <h3>${escapeHtml(GROUP_LABELS[groupKey] || groupKey)}</h3>
            <span class="species-group-count">${groupEntries.length}</span>
          </div>
          <div class="species-stack">
            ${groupEntries.map((entry) => renderSpeciesCard(entry)).join("")}
          </div>
        </section>
      `;
    })
    .filter(Boolean);

  speciesList.innerHTML = sections.join("");
}

function updateSelectedRegionalLayers(fitToSelection) {
  if (!state.highlightedSpeciesId) {
    selectedRegionalLayers = [];
    refreshRegionalLayerStyles();
    return;
  }

  selectedRegionalLayers = currentRegionalEntries
    .filter(({ feature }) => (feature.properties?.species || []).some((species) => species.itemId === state.highlightedSpeciesId))
    .map(({ layer }) => layer);

  refreshRegionalLayerStyles();

  if (fitToSelection && selectedRegionalLayers.length) {
    const bounds = L.featureGroup(selectedRegionalLayers).getBounds();
    if (bounds.isValid()) {
      reviewMap.fitBounds(bounds.pad(0.08), { animate: true });
    }
  }
}

function applySpeciesSelection(itemId, fitToMap = false) {
  state.highlightedSpeciesId = itemId || "";
  renderSpeciesList();
  updateSelectedRegionalLayers(fitToMap);

  if (suggestionType() !== "addition") {
    currentSpeciesSelect.value = itemId || "";
  }

  if (suggestionType() === "correction") {
    const currentEntry = currentSpeciesById(itemId);
    if (currentEntry && !cleanText(proposedSpeciesInput.value)) {
      proposedSpeciesInput.value = currentEntry.label;
      proposedSpeciesItemIdInput.value = currentEntry.itemId;
    }
  }

  clearTicketPreview();
}

function updateMapSummary() {
  const regionalCount = state.currentCountry?.groups?.regional || 0;
  const draftCount = state.drawnPolygons.length;
  mapSummary.textContent = `${regionalCount} current regional species · ${draftCount} drawn draft polygon${draftCount === 1 ? "" : "s"}`;
}

function updateMapHint() {
  if (suggestionType() === "removal") {
    mapHint.textContent = "Removal suggestions do not use draft polygons.";
    clearDrawingButton.disabled = true;
    return;
  }

  if (scopeSelect.value !== "regional") {
    mapHint.textContent = "National suggestions do not need polygons.";
    clearDrawingButton.disabled = true;
    return;
  }

  if (!state.drawnPolygons.length) {
    mapHint.textContent = "Draw one or more regional polygons on the map.";
  } else {
    mapHint.textContent = `${state.drawnPolygons.length} regional polygon${state.drawnPolygons.length === 1 ? "" : "s"} ready.`;
  }
  clearDrawingButton.disabled = false;
}

function updateFormVisibility() {
  const type = suggestionType();
  const showCurrentSpecies = type !== "addition";
  const showProposedSpecies = type !== "removal";
  const showScope = type !== "removal";
  const drawingEnabled = showScope && scopeSelect.value === "regional";

  currentSpeciesField.hidden = !showCurrentSpecies;
  proposedSpeciesField.hidden = !showProposedSpecies;
  scopeField.hidden = !showScope;

  currentSpeciesSelect.required = showCurrentSpecies;
  proposedSpeciesInput.required = showProposedSpecies;
  scopeSelect.required = showScope;

  enableDrawing(drawingEnabled);
  updateMapHint();
}

function syncProposedSpeciesLookup() {
  const label = cleanText(proposedSpeciesInput.value);
  proposedSpeciesItemIdInput.value = animalLabelIndex.get(label) || "";
  clearTicketPreview();
}

function clearTicketPreview() {
  state.preview = null;
  ticketTitleInput.value = "";
  ticketBodyInput.value = "";
  ticketWarnings.hidden = true;
  ticketWarnings.innerHTML = "";
  copyMarkdownButton.disabled = true;
  openGithubLink.href = "#";
  openGithubLink.classList.add("disabled");
}

function renderTicketPreview(preview) {
  state.preview = preview;
  ticketTitleInput.value = preview.title || "";
  ticketBodyInput.value = preview.body || "";
  copyMarkdownButton.disabled = !preview.title || !preview.body;

  if (preview.githubIssueUrl) {
    openGithubLink.href = preview.githubIssueUrl;
    openGithubLink.classList.remove("disabled");
  } else {
    openGithubLink.href = "#";
    openGithubLink.classList.add("disabled");
  }

  const warnings = preview.warnings || [];
  if (warnings.length) {
    ticketWarnings.hidden = false;
    ticketWarnings.innerHTML = warnings.map((warning) => `<div class="warning-item">${escapeHtml(warning)}</div>`).join("");
  } else {
    ticketWarnings.hidden = true;
    ticketWarnings.innerHTML = "";
  }
}

function buildTicketPayload() {
  return {
    githubRepo: cleanText(githubRepoInput.value),
    countryIso3: countrySelect.value,
    suggestionType: suggestionType(),
    currentSpeciesItemId: currentSpeciesSelect.value,
    proposedSpeciesItemId: proposedSpeciesItemIdInput.value,
    proposedSpeciesLabel: cleanText(proposedSpeciesInput.value),
    scope: scopeSelect.value,
    explanation: cleanText(explanationInput.value),
    polygons: state.drawnPolygons,
  };
}

async function loadCountry(iso3) {
  if (!iso3) {
    return;
  }

  setStatus("Loading country pack...");
  clearDrawnPolygons();
  state.highlightedSpeciesId = "";

  try {
    const countryData = await fetchJson(`/api/countries/${encodeURIComponent(iso3)}/species`);
    state.currentCountry = countryData;
    renderCountryHeader();
    populateCurrentSpeciesSelect(countryData.species || []);
    renderGroupChips();
    renderSpeciesList();
    updateMapSummary();
    clearTicketPreview();
    await loadRegionalOverlays();
    setStatus("Ready.");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not load country pack.", true);
  }
}

async function buildTicketPreview() {
  setStatus("Building ticket...");
  try {
    const preview = await fetchJson("/api/tickets/preview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildTicketPayload()),
    });

    renderTicketPreview(preview);
    setStatus("Ticket ready.");
  } catch (error) {
    clearTicketPreview();
    setStatus(error.message || "Could not build ticket.", true);
  }
}

async function copyMarkdownPreview() {
  if (!state.preview?.title || !state.preview?.body) {
    return;
  }

  const payload = `Title: ${state.preview.title}\n\n${state.preview.body}`;
  try {
    await navigator.clipboard.writeText(payload);
    setStatus("Ticket copied.");
  } catch {
    setStatus("Could not copy ticket.", true);
  }
}

async function initialize() {
  initializeMap();
  updateFormVisibility();

  try {
    const [settings, animals, countries] = await Promise.all([
      fetchJson("/api/settings"),
      fetchJson("/api/animals"),
      fetchJson("/api/countries"),
    ]);

    const storedRepo = window.localStorage.getItem(GITHUB_REPO_STORAGE_KEY) || "";
    githubRepoInput.value = storedRepo && storedRepo !== "owner/repo"
      ? storedRepo
      : settings.defaultGithubRepo || storedRepo || "";

    populateAnimalOptions(animals.animals || []);
    populateCountrySelect(countries.countries || []);
    await loadCountry(countrySelect.value);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not initialize the review desk.", true);
  }
}

groupChips.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-group]");
  if (!chip) {
    return;
  }
  state.groupFilter = chip.dataset.group || "all";
  renderGroupChips();
  renderSpeciesList();
});

speciesList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-item-id]");
  if (!card) {
    return;
  }
  applySpeciesSelection(card.dataset.itemId, true);
});

countrySelect.addEventListener("change", () => {
  loadCountry(countrySelect.value);
});

speciesFilterInput.addEventListener("input", () => {
  state.speciesFilter = speciesFilterInput.value;
  renderSpeciesList();
});

document.querySelectorAll('input[name="suggestionType"]').forEach((input) => {
  input.addEventListener("change", () => {
    if (suggestionType() === "addition") {
      currentSpeciesSelect.value = "";
      state.highlightedSpeciesId = "";
      updateSelectedRegionalLayers(false);
      renderSpeciesList();
    }
    updateFormVisibility();
    clearTicketPreview();
  });
});

currentSpeciesSelect.addEventListener("change", () => {
  applySpeciesSelection(currentSpeciesSelect.value, false);
});

scopeSelect.addEventListener("change", () => {
  updateFormVisibility();
  clearTicketPreview();
});

proposedSpeciesInput.addEventListener("input", syncProposedSpeciesLookup);
explanationInput.addEventListener("input", clearTicketPreview);

githubRepoInput.addEventListener("input", () => {
  window.localStorage.setItem(GITHUB_REPO_STORAGE_KEY, cleanText(githubRepoInput.value));
  clearTicketPreview();
});

clearDrawingButton.addEventListener("click", () => {
  clearDrawnPolygons();
});

ticketForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await buildTicketPreview();
});

copyMarkdownButton.addEventListener("click", async () => {
  await copyMarkdownPreview();
});

window.addEventListener("resize", () => {
  if (reviewMap) {
    reviewMap.invalidateSize();
  }
});

initialize();