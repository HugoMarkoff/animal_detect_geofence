const countrySelect = document.getElementById("countryIso3");
const browserTitle = document.getElementById("browser-title");
const countrySummary = document.getElementById("country-summary");
const groupChips = document.getElementById("group-chips");
const speciesFilterInput = document.getElementById("speciesFilter");
const speciesList = document.getElementById("species-list");
const ticketForm = document.getElementById("ticket-form");
const speciesSelectionGrid = document.getElementById("species-selection-grid");
const currentSpeciesField = document.getElementById("current-species-field");
const currentSpeciesInput = document.getElementById("currentSpeciesLabel");
const currentSpeciesToggle = document.getElementById("current-species-toggle");
const currentSpeciesItemIdInput = document.getElementById("currentSpeciesItemId");
const currentSpeciesOptions = document.getElementById("current-species-options");
const proposedSpeciesField = document.getElementById("proposed-species-field");
const proposedSpeciesInput = document.getElementById("proposedSpeciesLabel");
const proposedSpeciesToggle = document.getElementById("proposed-species-toggle");
const proposedSpeciesItemIdInput = document.getElementById("proposedSpeciesItemId");
const animalOptions = document.getElementById("animal-options");
const scopeField = document.getElementById("scope-field");
const scopeSelect = document.getElementById("scope");
const mapHint = document.getElementById("map-hint");
const suggestionGuidance = document.getElementById("suggestion-guidance");
const requestNotificationInput = document.getElementById("requestNotification");
const notificationEmailField = document.getElementById("notification-email-field");
const notificationEmailInput = document.getElementById("notificationEmail");
const clearDrawingButton = document.getElementById("clear-drawing");
const regionalHelpCard = document.getElementById("regional-help-card");
const dismissRegionalHelpButton = document.getElementById("dismiss-regional-help");
const statusLine = document.getElementById("status-line");
const ticketTitleInput = document.getElementById("ticket-title");
const ticketBodyInput = document.getElementById("ticket-body");
const copyMarkdownButton = document.getElementById("copy-markdown");
const openTicketLink = document.getElementById("open-ticket");
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
const DEFAULT_TICKET_REPOSITORY = "HugoMarkoff/animal_detect_geofence";
const DATA_ROOT = "./data";
const MAX_TICKET_URL_LENGTH = 7000;
const NOTIFICATION_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const REGIONAL_HELP_SEEN_SESSION_KEY = "country-pack-review.regional-help.v1";
const STATUS_TO_BUCKET = {
  likely_true_one_source: "Likely Valid",
  likely_false: "Needs Review",
  new_record: "New",
};
const FOOTPRINT_DEFAULTS = {
  countrywide: {
    label: "National footprint",
    short: "National",
    note: "This species is currently treated as national coverage in the selected country.",
  },
  regional: {
    label: "Regional footprint",
    short: "Regional",
    note: "This species is currently restricted to one or more mapped regional areas.",
  },
  no_points: {
    label: "No mapped points",
    short: "No points",
    note: "No mapped coordinates are stored for this species in the current pack.",
  },
  needs_review: {
    label: "Needs review",
    short: "Review",
    note: "This species is still flagged for manual review in the current pack.",
  },
  country_pack_only: {
    label: "Country pack only",
    short: "Country-level",
    note: "This country currently only has country-level membership in the precomputed pack, without national or regional footprint geometry.",
  },
  unscored: {
    label: "No footprint yet",
    short: "Unscored",
    note: "This entry has no stored national or regional footprint in the current pack.",
  },
};
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
const currentSpeciesLabelIndex = new Map();
const animalLabelIndex = new Map();
const animalById = new Map();
const countryPackCache = new Map();

let animalCatalogCache = null;
let countryCatalogCache = null;

const CURRENT_REGIONAL_STYLE = {
  color: "#2d9046",
  weight: 1.2,
  opacity: 0.94,
  fillColor: "#a4ee16",
  fillOpacity: 0.18,
};
const CURRENT_NATIONAL_STYLE = {
  color: "#75b94b",
  weight: 1,
  opacity: 0.56,
  fillColor: "#a4ee16",
  fillOpacity: 0.1,
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
let currentNationalOverlayLayer;
let currentRegionalOverlayLayer;
let currentRegionalEntries = [];
let currentRegionalHoverTooltip;
let hoveredRegionalLayers = [];
let selectedRegionalLayers = [];
let suggestionDrawLayer;
let worldCountryGeometryIndexPromise;
let openComboKey = null;
let currentCountryGeometry = null;

const comboBoxes = {
  current: {
    key: "current",
    root: document.getElementById("current-species-combobox"),
    input: currentSpeciesInput,
    toggle: currentSpeciesToggle,
    menu: currentSpeciesOptions,
    hiddenInput: currentSpeciesItemIdInput,
    options: [],
    filteredOptions: [],
    highlightedItemId: "",
    keyboardMode: false,
    emptyText: "No matching species in this country pack.",
  },
  proposed: {
    key: "proposed",
    root: document.getElementById("proposed-species-combobox"),
    input: proposedSpeciesInput,
    toggle: proposedSpeciesToggle,
    menu: animalOptions,
    hiddenInput: proposedSpeciesItemIdInput,
    options: [],
    filteredOptions: [],
    highlightedItemId: "",
    keyboardMode: false,
    emptyText: "No matching species in the catalog.",
  },
};

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

function sortKey(value) {
  return cleanText(value).toLocaleLowerCase();
}

function searchableText(values) {
  return values.filter(Boolean).join(" ").toLocaleLowerCase();
}

function statusToBucket(status) {
  return STATUS_TO_BUCKET[status || ""] || "Needs Review";
}

function sanitizePolygon(rawPolygon) {
  if (!Array.isArray(rawPolygon)) {
    return [];
  }

  const polygon = rawPolygon
    .filter((point) => Array.isArray(point) && point.length >= 2)
    .map((point) => [Number(point[0]), Number(point[1])])
    .filter(([latitude, longitude]) => Number.isFinite(latitude) && Number.isFinite(longitude))
    .filter(([latitude, longitude]) => latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180)
    .map(([latitude, longitude]) => [roundCoordinate(latitude), roundCoordinate(longitude)]);

  return polygon.length >= 3 ? polygon : [];
}

function sanitizePolygons(rawPolygons) {
  if (!Array.isArray(rawPolygons)) {
    return [];
  }
  return rawPolygons.map((polygon) => sanitizePolygon(polygon)).filter((polygon) => polygon.length >= 3);
}

function speciesLabel(animal, fallback = "Unknown species") {
  if (!animal) {
    return fallback;
  }

  const commonName = cleanText(animal.commonName);
  const binomial = cleanText(animal.binomial);
  if (commonName && binomial) {
    return `${commonName} (${binomial})`;
  }
  return commonName || binomial || fallback;
}

function latLngPolygonToGeoJsonRing(polygon) {
  const ring = polygon.map((point) => [point[1], point[0]]);
  if (ring.length) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([first[0], first[1]]);
    }
  }
  return ring;
}

function resolveObservationProfile(entry, packMode) {
  const rawProfile = entry.observationProfile || {};
  const code = cleanText(rawProfile.code) || (packMode === "baseline" ? "country_pack_only" : "unscored");
  const defaults = FOOTPRINT_DEFAULTS[code] || FOOTPRINT_DEFAULTS.unscored;
  const polygon = sanitizePolygon(rawProfile.footprintPolygonLatLngs || []);

  return {
    code,
    label: cleanText(rawProfile.label) || defaults.label,
    short: cleanText(rawProfile.short) || defaults.short,
    note: cleanText(rawProfile.note) || defaults.note,
    footprintPolygonLatLngs: polygon,
    significant: Boolean(rawProfile.significant),
  };
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

async function loadAnimalCatalog() {
  if (animalCatalogCache) {
    return animalCatalogCache;
  }

  const dataset = await fetchJson(`${DATA_ROOT}/animals-global.json`);
  animalCatalogCache = (dataset.items || [])
    .filter((item) => cleanText(item.id))
    .map((item) => {
      animalById.set(item.id, item);
      return {
        itemId: item.id,
        commonName: item.commonName,
        binomial: item.binomial,
        classLabel: item.classLabel,
        label: speciesLabel(item),
      };
    })
    .sort((left, right) => {
      return sortKey(left.commonName).localeCompare(sortKey(right.commonName)) || sortKey(left.binomial).localeCompare(sortKey(right.binomial));
    });

  return animalCatalogCache;
}

async function loadCountryCatalog() {
  if (countryCatalogCache) {
    return countryCatalogCache;
  }

  const payload = await fetchJson(`${DATA_ROOT}/precomputed-countries/index.json`);
  countryCatalogCache = (payload.countries || []).slice().sort((left, right) => sortKey(left.countryName).localeCompare(sortKey(right.countryName)));
  return countryCatalogCache;
}

async function loadCountryPack(iso3) {
  const normalizedIso3 = cleanText(iso3).toUpperCase();
  if (!normalizedIso3) {
    throw new Error("Country is required.");
  }

  if (!countryPackCache.has(normalizedIso3)) {
    countryPackCache.set(normalizedIso3, fetchJson(`${DATA_ROOT}/precomputed-countries/${encodeURIComponent(normalizedIso3)}.json`));
  }

  try {
    return await countryPackCache.get(normalizedIso3);
  } catch (error) {
    countryPackCache.delete(normalizedIso3);
    throw error;
  }
}

async function loadCountryData(iso3) {
  const normalizedIso3 = cleanText(iso3).toUpperCase();
  await loadAnimalCatalog();
  const pack = await loadCountryPack(normalizedIso3);
  const species = [];
  const groups = {};

  (pack.entries || []).forEach((rawEntry) => {
    const itemId = cleanText(rawEntry.itemId);
    if (!itemId) {
      return;
    }

    const animal = animalById.get(itemId) || {};
    const observationProfile = resolveObservationProfile(rawEntry, pack.precomputeMode);
    const footprintCode = observationProfile.code;
    groups[footprintCode] = (groups[footprintCode] || 0) + 1;

    species.push({
      itemId,
      label: speciesLabel(animal),
      commonName: animal.commonName,
      binomial: animal.binomial,
      classLabel: animal.classLabel,
      status: rawEntry.status,
      bucket: statusToBucket(rawEntry.status),
      expected: rawEntry.expected,
      footprintCode,
      footprintLabel: observationProfile.label,
      footprintShort: observationProfile.short,
      footprintNote: observationProfile.note,
      polygonLatLngs: observationProfile.footprintPolygonLatLngs,
      hasPolygon: observationProfile.footprintPolygonLatLngs.length >= 3,
    });
  });

  species.sort((left, right) => sortKey(left.commonName).localeCompare(sortKey(right.commonName)) || sortKey(left.binomial).localeCompare(sortKey(right.binomial)));

  return {
    iso3: normalizedIso3,
    countryName: pack.countryName || normalizedIso3,
    precomputeMode: pack.precomputeMode || "unknown",
    summary: pack.summary || {
      total: species.length,
      statusCounts: {},
      bucketCounts: {},
    },
    groups,
    species,
  };
}

function buildRegionalOverlayCollection(countryData) {
  const grouped = new Map();

  (countryData?.species || []).forEach((entry) => {
    if (entry.footprintCode !== "regional") {
      return;
    }
    const polygon = sanitizePolygon(entry.polygonLatLngs || []);
    if (polygon.length < 3) {
      return;
    }

    const polygonKey = JSON.stringify(polygon);
    if (!grouped.has(polygonKey)) {
      grouped.set(polygonKey, { polygon, species: [] });
    }

    grouped.get(polygonKey).species.push({
      itemId: entry.itemId,
      label: entry.label,
      commonName: entry.commonName,
      binomial: entry.binomial,
      classLabel: entry.classLabel,
      bucket: entry.bucket,
    });
  });

  const features = Array.from(grouped.values()).map((entry) => ({
    type: "Feature",
    properties: {
      countryIso3: countryData.iso3,
      countryName: countryData.countryName,
      species: entry.species.sort((left, right) => sortKey(left.commonName).localeCompare(sortKey(right.commonName)) || sortKey(left.binomial).localeCompare(sortKey(right.binomial))),
      speciesCount: entry.species.length,
    },
    geometry: {
      type: "Polygon",
      coordinates: [latLngPolygonToGeoJsonRing(entry.polygon)],
    },
  }));

  return {
    type: "FeatureCollection",
    features,
  };
}

function buildProposedSpecies(payload) {
  const itemId = cleanText(payload.proposedSpeciesItemId);
  const animal = itemId ? animalById.get(itemId) : null;
  const customLabel = cleanText(payload.proposedSpeciesLabel);

  if (animal) {
    return {
      itemId,
      label: speciesLabel(animal),
      commonName: animal.commonName,
      binomial: animal.binomial,
      classLabel: animal.classLabel,
      isKnown: true,
    };
  }

  if (customLabel) {
    return {
      itemId: null,
      label: customLabel,
      commonName: null,
      binomial: null,
      classLabel: null,
      isKnown: false,
    };
  }

  return {
    itemId: null,
    label: "",
    commonName: null,
    binomial: null,
    classLabel: null,
    isKnown: false,
  };
}

function buildTicketFromPayload(payload) {
  const countryIso3 = cleanText(payload.countryIso3).toUpperCase();
  if (!countryIso3) {
    throw new Error("Country is required.");
  }

  if (!state.currentCountry || state.currentCountry.iso3 !== countryIso3) {
    throw new Error("Country pack is not loaded yet.");
  }

  const suggestion = cleanText(payload.suggestionType).toLowerCase();
  if (!["addition", "correction", "removal"].includes(suggestion)) {
    throw new Error("Suggestion type must be addition, correction, or removal.");
  }

  const notifyOnFix = Boolean(payload.notifyOnFix);
  const notificationEmail = cleanText(payload.notificationEmail);
  if (notifyOnFix && !notificationEmail) {
    throw new Error("Enter an email if you want a notification when the issue is fixed.");
  }
  if (notificationEmail && !NOTIFICATION_EMAIL_PATTERN.test(notificationEmail)) {
    throw new Error("Enter a valid email address for notifications.");
  }

  const speciesIndex = new Map((state.currentCountry.species || []).map((entry) => [entry.itemId, entry]));
  const currentSpecies = speciesIndex.get(cleanText(payload.currentSpeciesItemId)) || null;
  if (["correction", "removal"].includes(suggestion) && !currentSpecies) {
    throw new Error("Select a current species from the chosen country.");
  }

  let scope = null;
  let scopeLabel = null;
  let polygons = [];
  let proposedSpecies = {
    itemId: null,
    label: "",
    commonName: null,
    binomial: null,
    classLabel: null,
    isKnown: false,
  };

  if (suggestion !== "removal") {
    scope = cleanText(payload.scope).toLowerCase();
    if (!["national", "regional"].includes(scope)) {
      throw new Error("Choose national or regional coverage for additions and corrections.");
    }

    if (suggestion === "addition") {
      proposedSpecies = buildProposedSpecies(payload);
      if (!proposedSpecies.label) {
        throw new Error("Choose or type the species for the proposed update.");
      }
    }

    polygons = sanitizePolygons(payload.polygons);
    if (scope === "regional" && !polygons.length) {
      throw new Error("Draw at least one regional area before building the ticket.");
    }

    scopeLabel = scope === "regional" ? "Regional" : "National";
  }

  const explanation = buildRequestedActionText({
    suggestionType: suggestion,
    countryName: state.currentCountry.countryName,
    currentSpecies,
    proposedSpecies,
    scopeLabel,
    polygons,
  });

  return {
    countryIso3,
    countryName: state.currentCountry.countryName,
    countryPrecomputeMode: state.currentCountry.precomputeMode,
    countrySummary: state.currentCountry.summary,
    countryGroups: state.currentCountry.groups,
    githubRepo: cleanText(payload.githubRepo),
    suggestionType: suggestion,
    suggestionTypeLabel: suggestion.charAt(0).toUpperCase() + suggestion.slice(1),
    scope,
    scopeLabel,
    explanation,
    notifyOnFix,
    notificationEmail: notifyOnFix ? notificationEmail : "",
    currentSpecies,
    proposedSpecies,
    polygons,
  };
}

function buildTicketSummary(ticket) {
  const countryName = ticket.countryName;
  const coverage = ticket.scopeLabel ? `${ticket.scopeLabel.toLowerCase()} coverage` : "";

  if (ticket.suggestionType === "removal") {
    return `Removing ${ticket.currentSpecies.label} from ${countryName}`;
  }
  if (ticket.suggestionType === "addition") {
    return `Adding ${ticket.proposedSpecies.label} to ${coverage} in ${countryName}`;
  }
  return `Updating ${ticket.currentSpecies.label} to ${coverage} in ${countryName}`;
}

function buildRequestedActionText(ticketLike) {
  if (ticketLike.suggestionType === "removal") {
    return `Please remove ${ticketLike.currentSpecies.label} from the ${ticketLike.countryName} country pack.`;
  }

  if (ticketLike.suggestionType === "addition") {
    const polygonNote = ticketLike.scopeLabel === "Regional" && ticketLike.polygons.length
      ? " The selected regional areas show the requested footprint."
      : "";
    return `Please add ${ticketLike.proposedSpecies.label} with ${ticketLike.scopeLabel.toLowerCase()} coverage in ${ticketLike.countryName}.${polygonNote}`;
  }

  const correctionPolygonNote = ticketLike.scopeLabel === "Regional" && ticketLike.polygons.length
    ? " The selected regional areas show the requested corrected footprint."
    : "";
  return `Please update ${ticketLike.currentSpecies.label} to ${ticketLike.scopeLabel.toLowerCase()} coverage in ${ticketLike.countryName}.${correctionPolygonNote}`;
}

function buildSuggestionGuidanceText() {
  const countryName = state.currentCountry?.countryName || "the selected country";

  if (suggestionType() === "addition") {
    if (scopeSelect.value === "regional") {
      return `Addition: search the full species catalog, choose the species you want to add, and draw one or more regional areas in ${countryName}.`;
    }
    return `Addition: search the full species catalog and choose whether the species should be added as national coverage in ${countryName}.`;
  }

  if (suggestionType() === "correction") {
    if (scopeSelect.value === "regional") {
      return `Correction: choose a species that already exists in ${countryName}, switch it to regional coverage, and draw the regional area you want applied.`;
    }
    return `Correction: choose a species that already exists in ${countryName} and change its coverage to national.`;
  }

  return `Removal: choose a species that already exists in ${countryName} to open an issue asking for its removal from the current pack. No drawing is needed.`;
}

function updateSuggestionGuidance() {
  suggestionGuidance.textContent = buildSuggestionGuidanceText();
}

function buildIssueTitle(ticket) {
  const prefix = `[${ticket.countryIso3}]`;
  return `${prefix} ${buildTicketSummary(ticket)}`;
}

function buildIssueBody(ticket) {
  const lines = [
    "## Requested update",
    `- Summary: ${buildTicketSummary(ticket)}`,
    `- Country: ${ticket.countryName} (${ticket.countryIso3})`,
    `- Pack mode: ${ticket.countryPrecomputeMode}`,
    `- Suggestion type: ${ticket.suggestionTypeLabel}`,
  ];

  if (ticket.currentSpecies) {
    lines.push(`- Current species: ${ticket.currentSpecies.label}`);
    lines.push(`- Current footprint: ${ticket.currentSpecies.footprintLabel}`);
    lines.push(`- Current status bucket: ${ticket.currentSpecies.bucket}`);
  }

  if (ticket.suggestionType === "addition" && ticket.proposedSpecies.label) {
    lines.push(`- Proposed species: ${ticket.proposedSpecies.label}`);
  }

  if (ticket.scopeLabel) {
    lines.push(`- Requested coverage: ${ticket.scopeLabel}`);
  }

  if (ticket.notifyOnFix) {
    lines.push(`- Fix notification requested: Yes`);
    lines.push(`- Notification email: ${ticket.notificationEmail}`);
  }

  const summary = ticket.countrySummary || {};
  lines.push(`- Country pack total: ${summary.total || 0}`);
  lines.push(`- Regional species currently mapped: ${ticket.countryGroups?.regional || 0}`);
  lines.push("", "## Requested action", ticket.explanation);

  if (ticket.polygons.length) {
    lines.push(
      "",
      "## Proposed regional areas",
      "Coordinates are in `[latitude, longitude]` order.",
      "```json",
      JSON.stringify(ticket.polygons, null, 2),
      "```"
    );
  }

  if (ticket.currentSpecies?.polygonLatLngs?.length) {
    lines.push(
      "",
      "## Current stored polygon",
      "```json",
      JSON.stringify(ticket.currentSpecies.polygonLatLngs, null, 2),
      "```"
    );
  }

  lines.push(
    "",
    "## Notes",
    "- This request is based on the currently loaded country pack."
  );

  return lines.join("\n").trim();
}

function buildIssueUrl(repository, title, body) {
  if (!repository) {
    return null;
  }

  const baseUrl = `https://github.com/${repository}/issues/new`;
  const fullParams = new URLSearchParams({ title, body });
  const fullUrl = `${baseUrl}?${fullParams.toString()}`;
  if (fullUrl.length <= MAX_TICKET_URL_LENGTH) {
    return {
      url: fullUrl,
      includesBody: true,
    };
  }

  const titleOnlyParams = new URLSearchParams({ title });
  return {
    url: `${baseUrl}?${titleOnlyParams.toString()}`,
    includesBody: false,
  };
}

function buildTicketPreviewData(payload) {
  const ticket = buildTicketFromPayload(payload);
  const title = buildIssueTitle(ticket);
  const body = buildIssueBody(ticket);
  const issueLink = buildIssueUrl(DEFAULT_TICKET_REPOSITORY, title, body);
  const warnings = [];

  if (!issueLink) {
    warnings.push("GitHub issue opening is unavailable right now. Use Copy Ticket instead.");
  } else if (!issueLink.includesBody) {
    warnings.push("GitHub will open with the title only. Use Copy Ticket to paste the full ticket details.");
  }

  return {
    title,
    body,
    issueUrl: issueLink?.url || null,
    warnings,
    ticket,
  };
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

function pointInGeoJson(latlng, geoJson) {
  if (!geoJson) {
    return false;
  }

  if (geoJson.type === "FeatureCollection") {
    return (geoJson.features || []).some((feature) => pointInFeatureGeometry(latlng, feature.geometry));
  }

  if (geoJson.type === "Feature") {
    return pointInFeatureGeometry(latlng, geoJson.geometry);
  }

  return pointInFeatureGeometry(latlng, geoJson);
}

function formatSpeciesList(species) {
  return species
    .map((item) => escapeHtml(item.label || item.commonName || item.binomial || "Unknown species"))
    .join("<br>");
}

function currentNationalSpecies() {
  return (state.currentCountry?.species || [])
    .filter((entry) => entry.footprintCode === "countrywide")
    .slice()
    .sort((left, right) => speciesSortName(left).localeCompare(speciesSortName(right)));
}

function buildMapHoverTooltipHtml(entries, nationalSpecies = []) {
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

  const nationalCount = nationalSpecies.length;
  const countryName = escapeHtml(state.currentCountry?.countryName || "this country");

  if (!species.length && !nationalCount) {
    return "";
  }

  if (!species.length) {
    return `
      <div class="footprint-tooltip">
        <strong>${nationalCount} national species</strong>
        <div class="footprint-tooltip-note">These species cover all of ${countryName}.</div>
      </div>
    `;
  }

  const nationalNote = nationalCount
    ? `<div class="footprint-tooltip-note">And ${nationalCount} species are marked national across ${countryName}.</div>`
    : "";

  return `
    <div class="footprint-tooltip">
      <strong>${species.length} regional species</strong>
      <div class="footprint-tooltip-list">${formatSpeciesList(species)}</div>
      ${nationalNote}
    </div>
  `;
}

function syncMapLayerOrder() {
  if (currentNationalOverlayLayer?.bringToBack) {
    currentNationalOverlayLayer.bringToBack();
  }
  if (currentRegionalOverlayLayer?.bringToFront) {
    currentRegionalOverlayLayer.bringToFront();
  }
  if (suggestionDrawLayer?.bringToFront) {
    suggestionDrawLayer.bringToFront();
  }
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

  syncMapLayerOrder();
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
  if (currentNationalOverlayLayer) {
    reviewMap.removeLayer(currentNationalOverlayLayer);
    currentNationalOverlayLayer = null;
  }
  if (currentRegionalOverlayLayer) {
    reviewMap.removeLayer(currentRegionalOverlayLayer);
    currentRegionalOverlayLayer = null;
  }
  currentCountryGeometry = null;
  currentRegionalEntries = [];
  hoveredRegionalLayers = [];
  selectedRegionalLayers = [];
  if (currentRegionalHoverTooltip) {
    reviewMap.removeLayer(currentRegionalHoverTooltip);
    currentRegionalHoverTooltip = null;
  }
}

function handleMapOverlayHover(event) {
  const hits = currentRegionalEntries.filter(({ feature }) => pointInFeatureGeometry(event.latlng, feature.geometry));
  const nationalSpecies = currentNationalSpecies();
  const showNationalSummary = nationalSpecies.length && pointInGeoJson(event.latlng, currentCountryGeometry) && (hits.length || !currentRegionalEntries.length);

  if (!hits.length && !showNationalSummary) {
    resetRegionalHoverState();
    return;
  }

  hoveredRegionalLayers = hits.map(({ layer }) => layer);
  refreshRegionalLayerStyles();

  if (!currentRegionalHoverTooltip) {
    currentRegionalHoverTooltip = L.tooltip({ direction: "top", opacity: 0.96, sticky: true });
  }

  const tooltipHtml = buildMapHoverTooltipHtml(hits, showNationalSummary ? nationalSpecies : []);
  if (!tooltipHtml) {
    resetRegionalHoverState();
    return;
  }

  currentRegionalHoverTooltip.setLatLng(event.latlng).setContent(tooltipHtml);
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
    const [countryGeometry] = await Promise.all([
      fetchCountryGeometry(countrySelect.value),
    ]);
    currentCountryGeometry = countryGeometry;
    const overlayData = buildRegionalOverlayCollection(state.currentCountry);
    const nationalSpecies = currentNationalSpecies();

    if (countryGeometry && nationalSpecies.length) {
      currentNationalOverlayLayer = L.geoJSON(countryGeometry, {
        style: CURRENT_NATIONAL_STYLE,
        interactive: false,
      }).addTo(reviewMap);
    }

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

    syncMapLayerOrder();

    await focusSelectedCountry(countryGeometry);
    updateSelectedRegionalLayers(false);
    updateMapSummary();
  } catch (error) {
    console.error(error);
    mapSummary.textContent = "Could not load the current map overlay.";
  }
}

function configureDrawToolCopy() {
  if (!window.L?.drawLocal) {
    return;
  }

  window.L.drawLocal.draw.toolbar.buttons.polygon = "Draw an area";
  window.L.drawLocal.edit.toolbar.buttons.edit = "Edit drawn areas";
  window.L.drawLocal.edit.toolbar.buttons.remove = "Remove drawn areas";

  if (window.L.drawLocal.draw.handlers?.polygon?.tooltip) {
    window.L.drawLocal.draw.handlers.polygon.tooltip.start = "Click on the map to start drawing an area.";
    window.L.drawLocal.draw.handlers.polygon.tooltip.cont = "Click to keep drawing the area.";
    window.L.drawLocal.draw.handlers.polygon.tooltip.end = "Click the first point to finish the area.";
  }

  if (window.L.drawLocal.edit.handlers?.edit?.tooltip) {
    window.L.drawLocal.edit.handlers.edit.tooltip.text = "Drag handles to edit a drawn area.";
    window.L.drawLocal.edit.handlers.edit.tooltip.subtext = "Click save when you are done.";
  }

  if (window.L.drawLocal.edit.handlers?.remove?.tooltip) {
    window.L.drawLocal.edit.handlers.remove.tooltip.text = "Select a drawn area to remove it.";
  }
}

function initializeMap() {
  configureDrawToolCopy();

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
  reviewMap.on("mousemove", handleMapOverlayHover);
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
  comboBoxes.proposed.options = animals.map((animal) => {
    animalLabelIndex.set(animal.label, animal.itemId);
    return {
      itemId: animal.itemId,
      label: animal.label,
      meta: cleanText(animal.classLabel),
      searchText: searchableText([animal.label, animal.commonName, animal.binomial, animal.classLabel]),
    };
  });

  if (openComboKey === "proposed") {
    renderComboOptions("proposed");
  }
}

function setProposedSpeciesValue(label, itemId = "") {
  proposedSpeciesInput.value = label;
  proposedSpeciesItemIdInput.value = itemId;

  if (openComboKey === "proposed") {
    renderComboOptions("proposed");
  }
}

function setCurrentSpeciesValue(label, itemId = "") {
  currentSpeciesInput.value = label;
  currentSpeciesItemIdInput.value = itemId;

  if (openComboKey === "current") {
    renderComboOptions("current");
  }
}

function populateCurrentSpeciesOptions(species) {
  const previous = currentSpeciesItemIdInput.value;
  currentSpeciesLabelIndex.clear();

  comboBoxes.current.options = species.map((entry) => {
    currentSpeciesLabelIndex.set(entry.label, entry.itemId);
    return {
      itemId: entry.itemId,
      label: entry.label,
      meta: cleanText(entry.footprintShort),
      searchText: searchableText([
        entry.label,
        entry.commonName,
        entry.binomial,
        entry.footprintShort,
        entry.footprintLabel,
      ]),
    };
  });

  const previousEntry = species.find((entry) => entry.itemId === previous) || null;
  setCurrentSpeciesValue(previousEntry?.label || "", previousEntry?.itemId || "");

  if (openComboKey === "current") {
    renderComboOptions("current");
  }
}

function isComboBoxOpen(key) {
  return openComboKey === key && !comboBoxes[key].menu.hidden;
}

function filteredComboOptions(combo) {
  const query = cleanText(combo.input.value).toLocaleLowerCase();
  if (!query) {
    return combo.options;
  }
  return combo.options.filter((option) => option.searchText.includes(query));
}

function updateComboBoxLayout(key) {
  const combo = comboBoxes[key];
  if (!combo || combo.menu.hidden) {
    return;
  }

  const rect = combo.root.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const spaceBelow = viewportHeight - rect.bottom - 12;
  const spaceAbove = rect.top - 12;
  const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
  const availableSpace = Math.max(96, (openUp ? spaceAbove : spaceBelow) - 8);
  const maxHeight = Math.min(360, Math.round(viewportHeight * 0.42), availableSpace);

  combo.root.classList.toggle("open-up", openUp);
  combo.root.style.setProperty("--combo-menu-max-height", `${Math.max(96, maxHeight)}px`);
}

function closeComboBox(key) {
  const combo = comboBoxes[key];
  if (!combo) {
    return;
  }

  combo.root.classList.remove("open", "open-up");
  combo.menu.hidden = true;
  combo.input.setAttribute("aria-expanded", "false");
  combo.filteredOptions = [];
  combo.highlightedItemId = "";
  combo.keyboardMode = false;

  if (openComboKey === key) {
    openComboKey = null;
  }
}

function closeAllComboBoxes(exceptKey = "") {
  Object.keys(comboBoxes).forEach((key) => {
    if (key !== exceptKey) {
      closeComboBox(key);
    }
  });
}

function scrollActiveComboOptionIntoView(combo) {
  combo.menu.querySelector(".combo-option.active")?.scrollIntoView({ block: "nearest" });
}

function renderComboOptions(key) {
  const combo = comboBoxes[key];
  if (!combo) {
    return;
  }

  const selectedItemId = combo.hiddenInput.value;
  const filteredOptions = filteredComboOptions(combo);
  combo.filteredOptions = filteredOptions;

  if (!filteredOptions.length) {
    combo.highlightedItemId = "";
    combo.menu.innerHTML = `<div class="combo-empty">${escapeHtml(combo.emptyText)}</div>`;
    updateComboBoxLayout(key);
    return;
  }

  if (!filteredOptions.some((option) => option.itemId === combo.highlightedItemId)) {
    combo.highlightedItemId = filteredOptions.find((option) => option.itemId === selectedItemId)?.itemId || filteredOptions[0].itemId;
  }

  combo.menu.innerHTML = filteredOptions.map((option) => {
    const classes = ["combo-option"];
    if (option.itemId === selectedItemId) {
      classes.push("selected");
    }
    if (option.itemId === combo.highlightedItemId) {
      classes.push("active");
    }

    const meta = option.meta ? `<span class="combo-option-meta">${escapeHtml(option.meta)}</span>` : "";
    return `
      <button
        class="${classes.join(" ")}"
        type="button"
        role="option"
        aria-selected="${option.itemId === selectedItemId}"
        data-item-id="${escapeHtml(option.itemId)}"
      >
        <span class="combo-option-label">${escapeHtml(option.label)}</span>
        ${meta}
      </button>
    `;
  }).join("");

  updateComboBoxLayout(key);
  requestAnimationFrame(() => {
    scrollActiveComboOptionIntoView(combo);
  });
}

function openComboBox(key) {
  const combo = comboBoxes[key];
  if (!combo) {
    return;
  }

  closeAllComboBoxes(key);
  combo.menu.hidden = false;
  combo.root.classList.add("open");
  combo.input.setAttribute("aria-expanded", "true");
  combo.keyboardMode = false;
  openComboKey = key;
  renderComboOptions(key);
}

function moveComboHighlight(key, direction) {
  const combo = comboBoxes[key];
  if (!combo) {
    return;
  }

  if (!isComboBoxOpen(key)) {
    openComboBox(key);
    return;
  }

  const options = combo.filteredOptions;
  if (!options.length) {
    return;
  }

  const currentIndex = options.findIndex((option) => option.itemId === combo.highlightedItemId);
  const nextIndex = currentIndex < 0
    ? 0
    : Math.max(0, Math.min(options.length - 1, currentIndex + direction));

  combo.highlightedItemId = options[nextIndex].itemId;
  combo.keyboardMode = true;
  renderComboOptions(key);
}

function selectComboOption(key, itemId) {
  const option = comboBoxes[key]?.options.find((candidate) => candidate.itemId === itemId);
  if (!option) {
    return;
  }

  if (key === "current") {
    applySpeciesSelection(option.itemId, false);
  } else {
    setProposedSpeciesValue(option.label, option.itemId);
    clearTicketPreview();
  }

  closeComboBox(key);
}

function toggleComboBox(key) {
  if (isComboBoxOpen(key)) {
    closeComboBox(key);
    return;
  }

  comboBoxes[key].input.focus();
  openComboBox(key);
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

  if (state.groupFilter === "all") {
    const allEntries = entries.slice().sort((left, right) => speciesSortName(left).localeCompare(speciesSortName(right)));
    speciesList.innerHTML = `
      <section class="species-group">
        <div class="species-group-head">
          <h3>${escapeHtml(GROUP_LABELS.all)}</h3>
          <span class="species-group-count">${allEntries.length}</span>
        </div>
        <div class="species-stack">
          ${allEntries.map((entry) => renderSpeciesCard(entry)).join("")}
        </div>
      </section>
    `;
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
    const currentEntry = currentSpeciesById(itemId);
    setCurrentSpeciesValue(currentEntry?.label || "", itemId || "");
  }

  closeComboBox("current");

  clearTicketPreview();
}

function updateMapSummary() {
  const nationalCount = currentNationalSpecies().length;
  const regionalCount = state.currentCountry?.groups?.regional || 0;
  const drawnCount = state.drawnPolygons.length;
  const pieces = [
    `${nationalCount} national species`,
    `${regionalCount} regional species`,
  ];

  if (drawnCount) {
    pieces.push(`${drawnCount} drawn area${drawnCount === 1 ? "" : "s"}`);
  }

  mapSummary.textContent = `Map overlay: ${pieces.join(" · ")}`;
}

function updateMapHint() {
  if (suggestionType() === "removal") {
    mapHint.textContent = "Map overlay: use the current country coverage as reference. No drawing is needed.";
    clearDrawingButton.disabled = true;
    return;
  }

  if (scopeSelect.value !== "regional") {
    mapHint.textContent = "Map overlay: national coverage uses the full country outline. No drawing is needed.";
    clearDrawingButton.disabled = true;
    return;
  }

  if (!state.drawnPolygons.length) {
    mapHint.textContent = "Map overlay: use the map tools to draw one or more regional areas.";
  } else {
    mapHint.textContent = `Map overlay: ${state.drawnPolygons.length} regional area${state.drawnPolygons.length === 1 ? "" : "s"} ready. You can edit or remove them from the map toolbar.`;
  }
  clearDrawingButton.disabled = false;
}

function hasSeenRegionalHelp() {
  try {
    return window.sessionStorage.getItem(REGIONAL_HELP_SEEN_SESSION_KEY) === "seen";
  } catch {
    return false;
  }
}

function rememberRegionalHelpSeen() {
  try {
    window.sessionStorage.setItem(REGIONAL_HELP_SEEN_SESSION_KEY, "seen");
  } catch {
    // Ignore storage failures and keep the guide ephemeral.
  }
}

function hideRegionalHelp() {
  if (regionalHelpCard) {
    regionalHelpCard.hidden = true;
  }
}

function maybeShowRegionalHelp() {
  if (!regionalHelpCard) {
    return;
  }

  if (suggestionType() === "removal" || scopeSelect.value !== "regional") {
    hideRegionalHelp();
    return;
  }

  if (hasSeenRegionalHelp()) {
    hideRegionalHelp();
    return;
  }

  regionalHelpCard.hidden = false;
  rememberRegionalHelpSeen();
}

function updateFormVisibility() {
  const type = suggestionType();
  const showCurrentSpecies = type !== "addition";
  const showProposedSpecies = type === "addition";
  const showScope = type !== "removal";
  const drawingEnabled = showScope && scopeSelect.value === "regional";

  currentSpeciesField.hidden = !showCurrentSpecies;
  proposedSpeciesField.hidden = !showProposedSpecies;
  scopeField.hidden = !showScope;
  speciesSelectionGrid.classList.toggle("single-field", showCurrentSpecies !== showProposedSpecies);

  if (!showCurrentSpecies) {
    closeComboBox("current");
  }
  if (!showProposedSpecies) {
    closeComboBox("proposed");
  }

  currentSpeciesInput.required = showCurrentSpecies;
  proposedSpeciesInput.required = showProposedSpecies;
  scopeSelect.required = showScope;

  enableDrawing(drawingEnabled);
  updateMapHint();
  updateSuggestionGuidance();
  maybeShowRegionalHelp();
}

function syncCurrentSpeciesLookup() {
  const label = cleanText(currentSpeciesInput.value);
  const itemId = currentSpeciesLabelIndex.get(label) || "";
  currentSpeciesItemIdInput.value = itemId;
  state.highlightedSpeciesId = itemId;
  renderSpeciesList();
  updateSelectedRegionalLayers(false);
  clearTicketPreview();

  if (document.activeElement === currentSpeciesInput || isComboBoxOpen("current")) {
    openComboBox("current");
  }
}

function syncProposedSpeciesLookup() {
  const label = cleanText(proposedSpeciesInput.value);
  proposedSpeciesItemIdInput.value = animalLabelIndex.get(label) || "";
  clearTicketPreview();

  if (document.activeElement === proposedSpeciesInput || isComboBoxOpen("proposed")) {
    openComboBox("proposed");
  }
}

function clearTicketPreview() {
  state.preview = null;
  ticketTitleInput.value = "";
  ticketBodyInput.value = "";
  ticketWarnings.hidden = true;
  ticketWarnings.innerHTML = "";
  copyMarkdownButton.disabled = true;
  openTicketLink.href = "#";
  openTicketLink.classList.add("disabled");
}

function renderTicketPreview(preview) {
  state.preview = preview;
  ticketTitleInput.value = preview.title || "";
  ticketBodyInput.value = preview.body || "";
  copyMarkdownButton.disabled = !preview.title || !preview.body;

  if (preview.issueUrl) {
    openTicketLink.href = preview.issueUrl;
    openTicketLink.classList.remove("disabled");
  } else {
    openTicketLink.href = "#";
    openTicketLink.classList.add("disabled");
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
    countryIso3: countrySelect.value,
    suggestionType: suggestionType(),
    currentSpeciesItemId: currentSpeciesItemIdInput.value,
    proposedSpeciesItemId: proposedSpeciesItemIdInput.value,
    proposedSpeciesLabel: cleanText(proposedSpeciesInput.value),
    scope: scopeSelect.value,
    notifyOnFix: requestNotificationInput.checked,
    notificationEmail: cleanText(notificationEmailInput.value),
    polygons: state.drawnPolygons,
  };
}

function updateNotificationPreference(clearValue = false) {
  const showNotificationEmail = requestNotificationInput.checked;
  notificationEmailField.hidden = !showNotificationEmail;
  notificationEmailInput.required = showNotificationEmail;

  if (!showNotificationEmail && clearValue) {
    notificationEmailInput.value = "";
  }
}

async function loadCountry(iso3) {
  if (!iso3) {
    return;
  }

  setStatus("Loading country pack...");
  closeAllComboBoxes();
  clearDrawnPolygons();
  state.highlightedSpeciesId = "";

  try {
    const countryData = await loadCountryData(iso3);
    state.currentCountry = countryData;
    updateSuggestionGuidance();
    renderCountryHeader();
    populateCurrentSpeciesOptions(countryData.species || []);
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
    const preview = buildTicketPreviewData(buildTicketPayload());

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
  updateNotificationPreference();
  updateSuggestionGuidance();

  try {
    const [animals, countries] = await Promise.all([
      loadAnimalCatalog(),
      loadCountryCatalog(),
    ]);

    populateAnimalOptions(animals || []);
    populateCountrySelect(countries || []);
    await loadCountry(countrySelect.value);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not initialize the review desk.", true);
  }
}

function handleSuggestionTypeChange() {
  closeAllComboBoxes();

  if (suggestionType() === "addition") {
    setCurrentSpeciesValue("", "");
    state.highlightedSpeciesId = "";
    updateSelectedRegionalLayers(false);
    renderSpeciesList();
  }

  updateFormVisibility();
  clearTicketPreview();
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
  input.addEventListener("change", handleSuggestionTypeChange);
});

document.querySelectorAll(".segment-option").forEach((option) => {
  option.addEventListener("click", () => {
    requestAnimationFrame(handleSuggestionTypeChange);
  });
});

Object.entries(comboBoxes).forEach(([key, combo]) => {
  combo.toggle.addEventListener("click", (event) => {
    event.preventDefault();
    toggleComboBox(key);
  });

  combo.input.addEventListener("focus", () => {
    openComboBox(key);
  });

  combo.input.addEventListener("click", () => {
    openComboBox(key);
  });

  combo.input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveComboHighlight(key, 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveComboHighlight(key, -1);
      return;
    }

    if (event.key === "Escape") {
      closeComboBox(key);
      return;
    }

    if (event.key === "Enter" && isComboBoxOpen(key) && combo.keyboardMode && combo.highlightedItemId) {
      event.preventDefault();
      selectComboOption(key, combo.highlightedItemId);
      return;
    }

    combo.keyboardMode = false;
  });

  combo.menu.addEventListener("click", (event) => {
    const option = event.target.closest("[data-item-id]");
    if (!option) {
      return;
    }
    selectComboOption(key, option.dataset.itemId);
  });
});

document.addEventListener("pointerdown", (event) => {
  if (!openComboKey) {
    return;
  }

  const combo = comboBoxes[openComboKey];
  if (combo.root.contains(event.target)) {
    return;
  }

  closeAllComboBoxes();
});

document.addEventListener("focusin", (event) => {
  if (!openComboKey) {
    return;
  }

  const combo = comboBoxes[openComboKey];
  if (combo.root.contains(event.target)) {
    return;
  }

  closeAllComboBoxes();
});

currentSpeciesInput.addEventListener("input", syncCurrentSpeciesLookup);
currentSpeciesInput.addEventListener("change", syncCurrentSpeciesLookup);

scopeSelect.addEventListener("change", () => {
  updateFormVisibility();
  clearTicketPreview();
});

proposedSpeciesInput.addEventListener("input", syncProposedSpeciesLookup);
requestNotificationInput.addEventListener("change", () => {
  updateNotificationPreference(true);
  clearTicketPreview();
});
notificationEmailInput.addEventListener("input", clearTicketPreview);

clearDrawingButton.addEventListener("click", () => {
  clearDrawnPolygons();
});

dismissRegionalHelpButton?.addEventListener("click", () => {
  hideRegionalHelp();
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

  if (openComboKey) {
    updateComboBoxLayout(openComboKey);
  }
});

window.addEventListener("scroll", () => {
  if (openComboKey) {
    updateComboBoxLayout(openComboKey);
  }
}, true);

initialize();