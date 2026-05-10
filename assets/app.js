const countrySelect = document.getElementById("countryIso3");
const countryInput = document.getElementById("countryLabel");
const countryToggle = document.getElementById("country-toggle");
const countryOptions = document.getElementById("country-options");
const stateField = document.getElementById("state-field");
const stateSelect = document.getElementById("stateIso");
const stateInput = document.getElementById("stateLabel");
const stateToggle = document.getElementById("state-toggle");
const stateOptions = document.getElementById("state-options");
const browserTitle = document.getElementById("browser-title");
const countrySummary = document.getElementById("country-summary");
const groupChips = document.getElementById("group-chips");
const browserPanel = document.querySelector(".browser-panel");
const mapPanel = document.querySelector(".map-panel");
const ticketPanel = document.querySelector(".ticket-panel");
const speciesFilterInput = document.getElementById("speciesFilter");
const speciesList = document.getElementById("species-list");
const ticketForm = document.getElementById("ticket-form");
const speciesSelectionGrid = document.getElementById("species-selection-grid");
const acceptNewOption = document.getElementById("accept-new-option");
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
const openOnboardingButton = document.getElementById("open-onboarding");
const onboardingOverlay = document.getElementById("onboarding-overlay");
const onboardingSpotlight = document.getElementById("onboarding-spotlight");
const onboardingShell = document.querySelector(".onboarding-shell");
const onboardingCard = document.querySelector(".onboarding-card");
const onboardingStepLabel = document.getElementById("onboarding-step-label");
const onboardingTitle = document.getElementById("onboarding-title");
const onboardingBody = document.getElementById("onboarding-body");
const onboardingBackButton = document.getElementById("onboarding-back");
const onboardingSkipButton = document.getElementById("onboarding-skip");
const onboardingNextButton = document.getElementById("onboarding-next");
const statusLine = document.getElementById("status-line");
const ticketTitleInput = document.getElementById("ticket-title");
const ticketBodyInput = document.getElementById("ticket-body");
const ticketPreviewPanel = document.getElementById("ticket-preview-panel");
const ticketPreviewGate = document.getElementById("ticket-preview-gate");
const ticketPreviewGateMessage = document.getElementById("ticket-preview-gate-message");
const copyMarkdownButton = document.getElementById("copy-markdown");
const openTicketLink = document.getElementById("open-ticket");
const openGithubLink = document.getElementById("open-github");
const adminAuthStatus = document.getElementById("admin-auth-status");
const adminTokenField = document.getElementById("admin-token-field");
const adminTokenInput = document.getElementById("admin-token");
const adminConnectButton = document.getElementById("admin-connect");
const adminDisconnectButton = document.getElementById("admin-disconnect");
const adminApplyButton = document.getElementById("admin-apply");
const adminLastCommitLink = document.getElementById("admin-last-commit");
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
const GEOBOUNDARIES_OUTLINE_ONLY_VERTEX_LIMIT = 200000;
const COUNTRY_FIT_PAD = 0.03;
const DEFAULT_TICKET_EMAIL = "hugo@animaldetect.com";
const DEFAULT_GITHUB_REPO = "HugoMarkoff/animal_detect_geofence";
const DEFAULT_GITHUB_BRANCH = "main";
const GITHUB_API_ROOT = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const DATA_ROOT = "./data";
const DATA_VERSION = "20260510b";
const ADMIN_GEOFENCE_TRACKING_PATH = "data/review-overrides/geofence-binary-overrides.json";
const ADMIN_SIMPLE_GEOFENCE_PATH = "data/geofence-simple.json";
const ADMIN_CHANGE_LOG_PATH = "data/review-overrides/change-log.json";
const ADMIN_GEOFENCE_TRACKING_SCHEMA_VERSION = 1;
const ADMIN_CHANGE_LOG_SCHEMA_VERSION = 1;
const MAX_TICKET_URL_LENGTH = 7000;
const NOTIFICATION_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const ONBOARDING_SEEN_KEY = "country-pack-review-onboarding-20260510g";
const ADMIN_TOKEN_HANDOFF_KEY = "country-pack-review-admin-token-handoff-20260507a";
const ADMIN_SESSION_TOKEN_KEY = "country-pack-review-admin-session-token-20260507a";
const ADMIN_PERSISTENT_TOKEN_KEY = "country-pack-review-admin-persistent-token-20260507a";
const ONBOARDING_SCROLL_LOCK_CLASS = "onboarding-scroll-locked";
const ONBOARDING_LIVE_TARGET_CLASS = "onboarding-live-target";
const ADMIN_OVERRIDE_NOTE = "Manual admin override applied from the review desk.";
const STATUS_TO_BUCKET = {
  likely_true_one_source: "Likely Valid",
  likely_true_both: "Likely Valid",
  likely_false: "Needs Review",
  new_record: "New",
  unlisted: "Unlisted",
};
const SUGGESTION_TYPE_LABELS = {
  addition: "Addition",
  accept_new: "Accept new",
  correction: "Correction",
  removal: "Removal",
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
const GROUP_ORDER = ["all", "countrywide", "regional", "likely_valid", "needs_review", "new"];
const GROUP_LABELS = {
  all: "All species",
  countrywide: "National",
  regional: "Regional",
  likely_valid: "Likely Valid",
  needs_review: "Needs Review",
  new: "New",
};
const ONBOARDING_STEPS = [
  {
    intro: true,
    hideSpotlight: true,
    scrollToTop: true,
    fullScreen: true,
    stepLabel: "Welcome",
    nextLabel: "Continue to guide",
    skipLabel: "Exit",
    title: "Welcome To The Review Desk",
    bodyHtml: `
      <p><strong>Welcome.</strong> Please spend a minute reading this before you start reviewing countries.</p>
      <p>This page is used to <strong>add</strong>, <strong>remove</strong>, or <strong>correct</strong> species in the country packs used by Animal Detect.</p>
      <p>The current geofencing is based on human observations and machine-validated records, but it is not perfect. This review desk exists so you can suggest where the country packs should change.</p>
      <ul class="onboarding-list">
        <li>The model currently works with <strong>2019 species</strong>.</li>
        <li>Each country is limited to species that could reasonably be detected there, so the model can fall back to a higher taxonomic level instead of forcing a wrong species label.</li>
        <li>That country-level filter is called <strong>geofencing</strong>.</li>
        <li><strong>National</strong> means the species should be allowed across most of the country.</li>
        <li><strong>Regional</strong> means the species should be allowed only in one or a few limited areas.</li>
        <li><strong>Examples:</strong> Moose in Denmark is regional because rewilded animals are concentrated in Lille Vildmose rather than across Denmark. Migratory birds are often regional because they are seen in specific stopover areas instead of nationwide.</li>
        <li>Suggest a change when a species should be <strong>added</strong>, <strong>removed</strong>, or kept with different coverage.</li>
        <li>Accepted changes are implemented in the <strong>Animal Detect API within 24 hours</strong>.</li>
      </ul>
      <p class="onboarding-note">Rule of thumb: if a species could realistically appear on a camera trap in the wild in that country, it should usually be in scope. There is some gray area for semi-domestic species if they roam public land and can still pass camera traps.</p>
      <p class="onboarding-note">Requests with GPS latitude and longitude can match both national and regional species. Requests with only a 3-letter ISO country code use national species only. Accepted national changes are also candidates for SpeciesNet follow-up. For the United States, you can review either the whole country or switch into individual state packs.</p>
    `,
  },
  {
    targetKey: "browser",
    targetSelector: ".browser-panel",
    title: "What The Review Buckets Mean",
    bodyHtml: `
      <ul class="onboarding-list">
        <li><strong>New</strong> = ask to add a species to the current country list.</li>
        <li><strong>Needs Review</strong> = ask whether a listed species should stay or be removed.</li>
        <li><strong>Likely Valid</strong> = the current listing still looks fine.</li>
      </ul>
      <p class="onboarding-note">Example: African wildcat is <strong>Needs Review</strong>. A missing Denmark entry for raccoon dog would show up as <strong>New</strong>.</p>
    `,
  },
  {
    targetKey: "map",
    targetSelector: "#review-map",
    title: "Try A Regional Example",
    nextAction: "map-regional",
    bodyHtml: `
      <ul class="onboarding-list">
        <li><strong>Regional</strong> means the species is concentrated in one local area instead of the whole country.</li>
        <li>Press <strong>Next</strong> to load a real regional example.</li>
      </ul>
      <p class="onboarding-note onboarding-demo-status" data-onboarding-demo-status>Next will filter Denmark to <strong>moose</strong> and zoom to Lille Vildmose.</p>
    `,
  },
  {
    targetKey: "ticket",
    targetSelector: "#ticket-form .segmented-control",
    title: "Choose The Change Type",
    nextAction: "ticket-removal-select",
    bodyHtml: `
      <ul class="onboarding-list">
        <li><strong>Addition</strong> = add a species that is missing from the country pack.</li>
        <li><strong>Correction</strong> = keep the species, but change its coverage.</li>
        <li><strong>Removal</strong> = remove a species that should not stay in the pack.</li>
      </ul>
      <p>Press <strong>Next</strong> to switch the live form to a real <strong>Removal</strong> example.</p>
      <p class="onboarding-note onboarding-demo-status" data-onboarding-demo-status>Next will switch to <strong>Removal</strong> and select <strong>African wildcat</strong> in the current country pack.</p>
    `,
  },
  {
    targetKey: "ticket",
    targetSelector: "#ticket-preview-content",
    title: "Preview Fills In Automatically",
    bodyHtml: `
      <p>As soon as the fields describe a valid change, the ticket preview fills in automatically here.</p>
      <p class="onboarding-note">For this example, choosing <strong>Removal</strong> and selecting <strong>African wildcat</strong> should already fill the title and body below.</p>
    `,
  },
  {
    targetKey: "ticket",
    targetSelector: "#ticket-submit-panel",
    title: "Then Submit It",
    bodyHtml: `
      <p>After the preview is built, this is where you send it.</p>
      <p class="onboarding-note">Use <strong>Send Email</strong> for a prefilled mail draft or <strong>Make GitHub Issue</strong> to open the same ticket in GitHub.</p>
    `,
  },
  {
    targetKey: "groups",
    shellTargetKey: "ticket",
    targetSelector: "#group-chips",
    hideSpotlight: true,
    scrollToTop: true,
    title: "Fast Review Flow",
    bodyHtml: `
      <ol class="onboarding-list">
        <li>Pick a country.</li>
        <li>Use <strong>New</strong> or <strong>Needs Review</strong>.</li>
        <li>Check the map.</li>
        <li>Preview the ticket and send it.</li>
      </ol>
      <p class="onboarding-note">You can reopen this any time from <strong>Guide</strong>.</p>
    `,
  },
];

const ONBOARDING_GUIDE_STEPS = ONBOARDING_STEPS.filter((step) => !step.intro);

const countryCenterCache = new Map();
const countryGeometryCache = new Map();
const countryBoundarySegmentCache = new WeakMap();
const countryClipContextCache = new WeakMap();
const currentSpeciesLabelIndex = new Map();
const animalLabelIndex = new Map();
const animalById = new Map();
const countryPackCache = new Map();

let animalCatalogCache = null;
let countryCatalogCache = null;
let globalDatasetInfo = null;

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
  admin: {
    token: "",
    login: "",
    canWrite: false,
    permissionLabel: "",
    isConnecting: false,
    isApplying: false,
    message: "",
    messageIsError: false,
    lastCommitUrl: "",
  },
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
let currentOverlayLoadId = 0;
let hasShownCorrectionRegionalHelp = false;
let onboardingStepIndex = 0;
let onboardingCompletedActions = new Set();
let onboardingOriginalSpeciesFilter = "";
let onboardingDemoSpeciesFilter = "";
let onboardingAutoActionKey = "";
let onboardingDemoPlaybackId = 0;
let onboardingViewportTarget = null;
let onboardingViewportFollowsTarget = false;
let ticketPreviewRefreshFrame = 0;

const comboBoxes = {
  country: {
    key: "country",
    root: document.getElementById("country-combobox"),
    input: countryInput,
    toggle: countryToggle,
    menu: countryOptions,
    hiddenInput: countrySelect,
    options: [],
    filteredOptions: [],
    highlightedItemId: "",
    keyboardMode: false,
    emptyText: "No matching country or region pack.",
    strictSelection: true,
    showAllOnOpen: false,
  },
  state: {
    key: "state",
    root: document.getElementById("state-combobox"),
    input: stateInput,
    toggle: stateToggle,
    menu: stateOptions,
    hiddenInput: stateSelect,
    options: [],
    filteredOptions: [],
    highlightedItemId: "",
    keyboardMode: false,
    emptyText: "No matching state.",
    strictSelection: true,
    showAllOnOpen: true,
  },
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

function normalizePackKey(value) {
  return cleanText(value).toUpperCase();
}

function countryPackSubdivisionName(entry) {
  return cleanText(entry?.regionName || entry?.stateName || entry?.subdivisionName);
}

function countryPackKey(entry) {
  const explicitKey = normalizePackKey(entry?.packId || entry?.packKey || entry?.id || entry?.iso3);
  if (explicitKey) {
    return explicitKey;
  }

  const relativePath = cleanText(entry?.path).replace(/^\.\//, "");
  if (!relativePath) {
    return "";
  }

  const stem = relativePath.split("/").pop()?.replace(/\.json$/i, "") || "";
  return normalizePackKey(stem);
}

function countryPackLabel(entry) {
  const displayName = cleanText(entry?.displayName || entry?.label || entry?.name);
  if (displayName) {
    return displayName;
  }

  const countryName = cleanText(entry?.countryName);
  const subdivisionName = countryPackSubdivisionName(entry);
  if (countryName && subdivisionName) {
    return `${countryName} (${subdivisionName})`;
  }

  return countryName || countryPackKey(entry);
}

function countryPackMeta(entry) {
  const unitType = cleanText(entry?.unitType || entry?.regionType || entry?.scopeLabel).replaceAll("_", " ");
  if (unitType) {
    return unitType;
  }

  if (countryPackSubdivisionName(entry)) {
    return "Region";
  }

  return cleanText(entry?.iso3) || cleanText(entry?.parentIso3);
}

function countryPackAliases(entry) {
  const aliases = new Set();
  const label = countryPackLabel(entry);
  const key = countryPackKey(entry);
  const countryName = cleanText(entry?.countryName);
  const subdivisionName = countryPackSubdivisionName(entry);

  [key, countryName, label, subdivisionName, entry?.displayName, entry?.parentCountryName, entry?.parentIso3]
    .map((value) => cleanText(value))
    .filter(Boolean)
    .forEach((value) => aliases.add(value));

  if (key === "USA" || /united states/i.test(label) || /united states/i.test(countryName)) {
    ["USA", "US", "U.S.", "America", "United States"].forEach((value) => aliases.add(value));
  }

  return Array.from(aliases);
}

function countryPackPath(entry, packKey) {
  const relativePath = cleanText(entry?.path).replace(/^\.\//, "");
  if (relativePath) {
    return relativePath;
  }
  return `${normalizePackKey(packKey)}.json`;
}

function searchableText(values) {
  return values.filter(Boolean).join(" ").toLocaleLowerCase();
}

function dataUrl(path) {
  return `${DATA_ROOT}/${path}?v=${encodeURIComponent(DATA_VERSION)}`;
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

function isNewDiscovery(entry) {
  return Boolean(entry) && (entry.status === "new_record" || entry.bucket === "New");
}

function suggestionTypeLabel(value) {
  return SUGGESTION_TYPE_LABELS[value] || (cleanText(value).charAt(0).toUpperCase() + cleanText(value).slice(1));
}

function currentCountryNewSpecies() {
  return (state.currentCountry?.species || []).filter((entry) => isNewDiscovery(entry));
}

function canAcceptNewSuggestions() {
  return currentCountryNewSpecies().length > 0;
}

function syncSuggestionTypeAvailability() {
  if (!acceptNewOption) {
    return false;
  }

  const showAcceptNew = canAcceptNewSuggestions();
  acceptNewOption.hidden = !showAcceptNew;

  if (!showAcceptNew && suggestionType() === "accept_new") {
    const additionOption = document.querySelector('input[name="suggestionType"][value="addition"]');
    if (additionOption) {
      additionOption.checked = true;
    }
    return true;
  }

  return false;
}

function effectiveBucket(entry) {
  if (!entry) {
    return "Needs Review";
  }
  const explicitBucket = cleanText(entry.bucket) || statusToBucket(entry.status);
  if (explicitBucket) {
    return explicitBucket;
  }
  if (isNewDiscovery(entry)) {
    return "New";
  }
  if (entry.footprintCode === "no_points" || entry.footprintCode === "needs_review") {
    return "Needs Review";
  }
  return "Needs Review";
}

function isVisibleSpecies(entry) {
  return effectiveBucket(entry) !== "Unlisted";
}

function matchesGroupFilter(entry, groupKey) {
  if (!isVisibleSpecies(entry)) {
    return false;
  }
  switch (groupKey) {
    case "all":
      return true;
    case "countrywide":
      return entry.footprintCode === "countrywide";
    case "regional":
      return entry.footprintCode === "regional";
    case "likely_valid":
      return effectiveBucket(entry) === "Likely Valid";
    case "needs_review":
      return effectiveBucket(entry) === "Needs Review";
    case "new":
      return effectiveBucket(entry) === "New";
    default:
      return true;
  }
}

function groupCount(country, groupKey) {
  return (country?.species || []).filter((entry) => matchesGroupFilter(entry, groupKey)).length;
}

function visibleSpecies(country) {
  return (country?.species || []).filter((entry) => isVisibleSpecies(entry));
}

function roundCoordinate(value) {
  return Math.round(Number(value) * 1e6) / 1e6;
}

function setStatus(message, isError = false) {
  statusLine.textContent = message;
  statusLine.classList.toggle("error", Boolean(isError));
}

function cancelTicketPreviewRefresh() {
  if (!ticketPreviewRefreshFrame) {
    return;
  }

  cancelAnimationFrame(ticketPreviewRefreshFrame);
  ticketPreviewRefreshFrame = 0;
}

function scheduleTicketPreviewRefresh() {
  cancelTicketPreviewRefresh();
  ticketPreviewRefreshFrame = requestAnimationFrame(() => {
    ticketPreviewRefreshFrame = 0;
    void buildTicketPreview({ announce: false, silentIncomplete: true });
  });
}

function yieldToBrowser() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      window.setTimeout(resolve, 0);
    });
  });
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

  const dataset = await fetchJson(dataUrl("animals-global.json"));
  globalDatasetInfo = {
    dataset: cleanText(dataset?.dataset),
    sourceMode: cleanText(dataset?.sourceMode),
    sourceFiles: {
      taxonomy: cleanText(dataset?.sourceFiles?.taxonomy),
      geofence: cleanText(dataset?.sourceFiles?.geofence),
    },
  };
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

  const payload = await fetchJson(dataUrl("precomputed-countries/index.json"));
  countryCatalogCache = (payload.countries || [])
    .filter((entry) => countryPackKey(entry))
    .slice()
    .sort((left, right) => sortKey(countryPackLabel(left)).localeCompare(sortKey(countryPackLabel(right))));
  return countryCatalogCache;
}

async function loadCountryPack(packKey) {
  const normalizedPackKey = normalizePackKey(packKey);
  if (!normalizedPackKey) {
    throw new Error("Country is required.");
  }

  if (!countryPackCache.has(normalizedPackKey)) {
    const countries = await loadCountryCatalog();
    const entry = countries.find((candidate) => countryPackKey(candidate) === normalizedPackKey) || null;
    const relativePath = countryPackPath(entry, normalizedPackKey);
    countryPackCache.set(normalizedPackKey, fetchJson(dataUrl(`precomputed-countries/${relativePath}`)));
  }

  try {
    return await countryPackCache.get(normalizedPackKey);
  } catch (error) {
    countryPackCache.delete(normalizedPackKey);
    throw error;
  }
}

function buildCountrySpeciesEntry(rawEntry, packMode) {
  const itemId = cleanText(rawEntry?.itemId);
  if (!itemId) {
    return null;
  }

  const bucket = cleanText(rawEntry?.bucket) || statusToBucket(rawEntry.status);
  if (bucket === "Unlisted") {
    return null;
  }

  const animal = animalById.get(itemId) || {};
  const observationProfile = resolveObservationProfile(rawEntry, packMode);
  const footprintCode = observationProfile.code;
  const tags = Array.isArray(rawEntry?.tags)
    ? rawEntry.tags.map((tag) => cleanText(tag)).filter(Boolean)
    : [];

  return {
    itemId,
    label: speciesLabel(animal),
    commonName: animal.commonName,
    binomial: animal.binomial,
    classLabel: animal.classLabel,
    status: rawEntry.status,
    bucket,
    expected: rawEntry.expected,
    footprintCode,
    footprintLabel: observationProfile.label,
    footprintShort: observationProfile.short,
    footprintNote: observationProfile.note,
    polygonLatLngs: observationProfile.footprintPolygonLatLngs,
    hasPolygon: observationProfile.footprintPolygonLatLngs.length >= 3,
    tags,
  };
}

function rebuildCountryDerivedState(country) {
  const groups = {};
  const summary = {
    total: 0,
    statusCounts: {},
    bucketCounts: {},
  };
  const species = (country?.species || [])
    .filter((entry) => isVisibleSpecies(entry))
    .slice()
    .sort((left, right) => speciesSortName(left).localeCompare(speciesSortName(right)));

  species.forEach((entry) => {
    entry.bucket = effectiveBucket(entry);
    groups[entry.footprintCode] = (groups[entry.footprintCode] || 0) + 1;
    summary.total += 1;
    if (cleanText(entry.status)) {
      summary.statusCounts[entry.status] = (summary.statusCounts[entry.status] || 0) + 1;
    }
    summary.bucketCounts[entry.bucket] = (summary.bucketCounts[entry.bucket] || 0) + 1;
  });

  country.species = species;
  country.groups = groups;
  country.summary = summary;
  return country;
}

async function loadCountryData(packKey) {
  const normalizedPackKey = normalizePackKey(packKey);
  await loadAnimalCatalog();
  const countries = await loadCountryCatalog();
  const catalogEntry = countries.find((entry) => countryPackKey(entry) === normalizedPackKey) || null;
  const pack = await loadCountryPack(normalizedPackKey);
  const species = (pack.entries || [])
    .map((rawEntry) => buildCountrySpeciesEntry(rawEntry, pack.precomputeMode))
    .filter(Boolean);

  return rebuildCountryDerivedState({
    iso3: normalizedPackKey,
    countryName: countryPackLabel(catalogEntry) || pack.countryName || normalizedPackKey,
    precomputeMode: pack.precomputeMode || "unknown",
    species,
  });
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
  if (!["addition", "accept_new", "correction", "removal"].includes(suggestion)) {
    throw new Error("Suggestion type must be addition, accept new, correction, or removal.");
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
  if (["accept_new", "correction", "removal"].includes(suggestion) && !currentSpecies) {
    throw new Error("Select a current species from the chosen country.");
  }
  if (suggestion === "accept_new" && !isNewDiscovery(currentSpecies)) {
    throw new Error("Accept new only works for species currently marked New in this country.");
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

  if (!["accept_new", "removal"].includes(suggestion)) {
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
    suggestionTypeLabel: suggestionTypeLabel(suggestion),
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
  if (ticket.suggestionType === "accept_new") {
    return `Approving ${ticket.currentSpecies.label} for the permanent ${countryName} list`;
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

  if (ticketLike.suggestionType === "accept_new") {
    const footprint = cleanText(ticketLike.currentSpecies?.footprintLabel || "current").toLowerCase();
    return `Please accept ${ticketLike.currentSpecies.label} into the permanent ${ticketLike.countryName} country pack and keep its current ${footprint} coverage.`;
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

  if (suggestionType() === "accept_new") {
    return `Accept new: choose one of the species currently marked New in ${countryName} to approve it into the permanent country pack without changing its existing coverage.`;
  }

  if (suggestionType() === "correction") {
    if (scopeSelect.value === "regional") {
      return `Correction: choose a species that already exists in ${countryName}, switch it to regional coverage, and draw the regional area you want applied.`;
    }
    return `Correction: choose a species that already exists in ${countryName} and change its coverage to national.`;
  }

  return `Removal: choose a species that already exists in ${countryName} to send a ticket asking for its removal from the current pack. No drawing is needed.`;
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

  const fileInstructions = buildFileInstructions(ticket);
  lines.push("", "## Files to update");
  fileInstructions.files.forEach((fileEntry) => {
    lines.push(`- ${fileEntry}`);
  });

  lines.push("", "## Update instructions");
  fileInstructions.instructions.forEach((instruction) => {
    lines.push(`- ${instruction}`);
  });

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

function buildEmailUrl(recipient, title, body) {
  if (!recipient) {
    return null;
  }

  const baseUrl = `mailto:${recipient}`;
  const fullUrl = `${baseUrl}?subject=${encodeMailtoComponent(title)}&body=${encodeMailtoComponent(body)}`;
  if (fullUrl.length <= MAX_TICKET_URL_LENGTH) {
    return {
      url: fullUrl,
      includesBody: true,
    };
  }

  return {
    url: `${baseUrl}?subject=${encodeMailtoComponent(title)}`,
    includesBody: false,
  };
}

function buildGitHubIssueUrl(repository, title, body) {
  if (!repository) {
    return null;
  }

  const baseUrl = `https://github.com/${repository}/issues/new`;
  const params = new URLSearchParams({ title, body });
  const url = `${baseUrl}?${params.toString()}`;
  return url.length <= MAX_TICKET_URL_LENGTH ? url : null;
}

function buildTicketPreviewData(payload) {
  const ticket = buildTicketFromPayload(payload);
  const title = buildIssueTitle(ticket);
  const body = buildIssueBody(ticket);
  const emailLink = buildEmailUrl(DEFAULT_TICKET_EMAIL, title, body);
  const githubIssueUrl = buildGitHubIssueUrl(DEFAULT_GITHUB_REPO, title, body);
  const warnings = [];

  if (!emailLink) {
    warnings.push("Email draft opening is unavailable right now. Use Copy Ticket instead.");
  } else if (!emailLink.includesBody) {
    warnings.push("Your email app will open with the subject only. Use Copy Ticket to paste the full ticket details.");
  }

  if (!githubIssueUrl) {
    warnings.push("The GitHub issue draft URL is too long right now. Use Copy Ticket or Send Email instead.");
  }

  return {
    title,
    body,
    issueUrl: emailLink?.url || null,
    githubIssueUrl,
    warnings,
    ticket,
  };
}

function encodeMailtoComponent(value) {
  return encodeURIComponent(String(value ?? "")).replace(/%20/g, "+");
}

function sourceGeofencePath() {
  return cleanText(globalDatasetInfo?.sourceFiles?.geofence) || "geofence_new.json";
}

function sourceTaxonomyPath() {
  return cleanText(globalDatasetInfo?.sourceFiles?.taxonomy) || "taxonomy_release.txt";
}

function adminTrackedSpecies(ticket, options = {}) {
  const { requireCatalog = true } = options;
  const target = adminOverrideTarget(ticket, { strict: requireCatalog });
  const itemId = cleanText(target.itemId);
  const fallbackLabel = cleanText(ticket.proposedSpecies?.label || ticket.currentSpecies?.label || "Selected species");
  const fallbackCommonName = cleanText(ticket.proposedSpecies?.commonName || ticket.currentSpecies?.commonName);
  const fallbackBinomial = cleanText(ticket.proposedSpecies?.binomial || ticket.currentSpecies?.binomial);

  if (!itemId) {
    return {
      itemId: "",
      matchedKey: "",
      label: fallbackLabel,
      commonName: fallbackCommonName,
      binomial: fallbackBinomial,
      classLabel: cleanText(ticket.proposedSpecies?.classLabel || ticket.currentSpecies?.classLabel),
      expectedCountries: [],
    };
  }

  const animal = animalById.get(itemId) || null;
  if (!animal) {
    if (requireCatalog) {
      throw new Error("Could not resolve the selected species in the global catalog.");
    }
    return {
      itemId,
      matchedKey: "",
      label: fallbackLabel,
      commonName: fallbackCommonName,
      binomial: fallbackBinomial,
      classLabel: cleanText(ticket.proposedSpecies?.classLabel || ticket.currentSpecies?.classLabel),
      expectedCountries: [],
    };
  }

  const matchedKey = cleanText(animal.matchedKey);
  if (!matchedKey && requireCatalog) {
    throw new Error("The selected species does not expose a geofence matchedKey in the current global catalog.");
  }

  return {
    itemId,
    matchedKey,
    label: speciesLabel(animal),
    commonName: cleanText(animal.commonName),
    binomial: cleanText(animal.binomial),
    classLabel: cleanText(animal.classLabel),
    expectedCountries: Array.isArray(animal.expectedCountries) ? animal.expectedCountries.map((iso3) => cleanText(iso3).toUpperCase()).filter(Boolean) : [],
  };
}

function adminRequestedCoverage(ticket) {
  if (ticket.suggestionType === "removal") {
    return "removed";
  }

  if (ticket.scope === "regional" || ticket.currentSpecies?.footprintCode === "regional") {
    return "regional";
  }

  return "national";
}

function buildFileInstructions(ticket) {
  const trackedSpecies = adminTrackedSpecies(ticket, { requireCatalog: false });
  const overridePath = adminOverrideTarget(ticket, { strict: false }).path;
  const requestedCoverage = adminRequestedCoverage(ticket);
  const itemIdText = trackedSpecies.itemId || "<CATALOG_ITEM_ID>";
  const files = [
    ADMIN_SIMPLE_GEOFENCE_PATH,
    ADMIN_GEOFENCE_TRACKING_PATH,
    overridePath,
    ADMIN_CHANGE_LOG_PATH,
  ];
  const instructions = [];
  const matchedKeyText = trackedSpecies.matchedKey || "<MATCHED_KEY_FROM_ANIMALS_GLOBAL>";
  const trackedLabel = trackedSpecies.label || matchedKeyText;

  if (ticket.suggestionType === "removal") {
    instructions.push(`In ${ADMIN_GEOFENCE_TRACKING_PATH}, set ${itemIdText} (${trackedLabel}) so ${ticket.countryIso3} is blocked and not marked in allow_regional.`);
    instructions.push(`After the rebuild, ${ADMIN_SIMPLE_GEOFENCE_PATH} should no longer list ${ticket.countryIso3} in expectedCountries for ${trackedLabel}.`);
    instructions.push(`In ${overridePath}, keep the remove action so the published country pack drops ${trackedSpecies.label}.`);
  } else {
    instructions.push(`In ${ADMIN_GEOFENCE_TRACKING_PATH}, mirror the binary allow decision for ${itemIdText} (${matchedKeyText}) and ${ticket.countryIso3}.`);
    if (requestedCoverage === "regional") {
      instructions.push(`After the rebuild, ${ADMIN_SIMPLE_GEOFENCE_PATH} should list ${ticket.countryIso3} in both expectedCountries and allowRegionalCountries for ${trackedLabel}.`);
      instructions.push(`In ${overridePath}, keep the regional observationProfile and the approved polygon for ${trackedSpecies.label}.`);
    } else {
      instructions.push(`After the rebuild, ${ADMIN_SIMPLE_GEOFENCE_PATH} should list ${ticket.countryIso3} in expectedCountries but not allowRegionalCountries for ${trackedLabel}.`);
      instructions.push(`In ${overridePath}, keep ${trackedSpecies.label} as national coverage with no polygon.`);
    }
  }

  instructions.push(`In ${ADMIN_CHANGE_LOG_PATH}, append this review change so later rebuilds and audits can trace who changed what.`);
  instructions.push(`The workflow rebuilds ${ADMIN_SIMPLE_GEOFENCE_PATH}, data/animals-global.json, and the country packs from ${ADMIN_GEOFENCE_TRACKING_PATH} + override files.`);
  instructions.push(`The upstream source dataset is still ${sourceTaxonomyPath()} + ${sourceGeofencePath()}, but this repo keeps the generated simple geofence snapshot in ${ADMIN_SIMPLE_GEOFENCE_PATH}.`);

  return { files, instructions };
}

function createEmptyGeofenceTrackingPayload() {
  return {
    schemaVersion: ADMIN_GEOFENCE_TRACKING_SCHEMA_VERSION,
    updatedAtUtc: new Date().toISOString(),
    items: {},
  };
}

function createEmptyChangeLogPayload() {
  return {
    schemaVersion: ADMIN_CHANGE_LOG_SCHEMA_VERSION,
    updatedAtUtc: new Date().toISOString(),
    entries: [],
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function applyGeofenceDecision(trackingPayload, ticket, login) {
  const payload = cloneJson(trackingPayload || createEmptyGeofenceTrackingPayload());
  const trackedSpecies = adminTrackedSpecies(ticket);
  const requestedCoverage = adminRequestedCoverage(ticket);
  const iso3 = ticket.countryIso3;
  const updatedAtUtc = new Date().toISOString();

  payload.schemaVersion = ADMIN_GEOFENCE_TRACKING_SCHEMA_VERSION;
  payload.updatedAtUtc = updatedAtUtc;
  payload.items ||= {};
  payload.items[trackedSpecies.itemId] ||= {
    itemId: trackedSpecies.itemId,
    matchedKey: trackedSpecies.matchedKey,
    speciesLabel: trackedSpecies.label,
    commonName: trackedSpecies.commonName,
    binomial: trackedSpecies.binomial,
    classLabel: trackedSpecies.classLabel,
    sourceDataset: cleanText(globalDatasetInfo?.dataset),
    allow: {},
    block: {},
    allow_regional: {},
    metadata: {},
  };

  const entry = payload.items[trackedSpecies.itemId];
  entry.matchedKey = trackedSpecies.matchedKey;
  entry.speciesLabel = trackedSpecies.label;
  entry.commonName = trackedSpecies.commonName;
  entry.binomial = trackedSpecies.binomial;
  entry.classLabel = trackedSpecies.classLabel;
  entry.sourceDataset = cleanText(globalDatasetInfo?.dataset);
  entry.allow ||= {};
  entry.block ||= {};
  entry.allow_regional ||= {};
  entry.metadata ||= {};

  delete entry.allow[iso3];
  delete entry.block[iso3];
  delete entry.allow_regional[iso3];

  if (ticket.suggestionType === "removal") {
    entry.block[iso3] = true;
    entry.metadata[iso3] = {
      decision: "block",
      coverage: requestedCoverage,
      overridePath: adminOverrideTarget(ticket).path,
      updatedBy: login,
      updatedAtUtc,
      reason: ticket.explanation,
    };
  } else {
    entry.allow[iso3] = true;
    if (requestedCoverage === "regional") {
      entry.allow_regional[iso3] = true;
    }
    entry.metadata[iso3] = {
      decision: "allow",
      coverage: requestedCoverage,
      overridePath: adminOverrideTarget(ticket).path,
      updatedBy: login,
      updatedAtUtc,
      reason: ticket.explanation,
    };
  }

  return payload;
}

function appendChangeLog(changeLogPayload, ticket, login) {
  const payload = cloneJson(changeLogPayload || createEmptyChangeLogPayload());
  const trackedSpecies = adminTrackedSpecies(ticket);
  const updatedAtUtc = new Date().toISOString();

  payload.schemaVersion = ADMIN_CHANGE_LOG_SCHEMA_VERSION;
  payload.updatedAtUtc = updatedAtUtc;
  payload.entries = Array.isArray(payload.entries) ? payload.entries : [];
  payload.entries.push({
    id: `${updatedAtUtc}__${ticket.countryIso3}__${trackedSpecies.itemId}__${ticket.suggestionType}`,
    updatedAtUtc,
    updatedBy: login,
    countryIso3: ticket.countryIso3,
    countryName: ticket.countryName,
    suggestionType: ticket.suggestionType,
    requestedCoverage: adminRequestedCoverage(ticket),
    itemId: trackedSpecies.itemId,
    matchedKey: trackedSpecies.matchedKey,
    speciesLabel: trackedSpecies.label,
    sourceDataset: cleanText(globalDatasetInfo?.dataset),
    files: [
      adminOverrideTarget(ticket).path,
      ADMIN_GEOFENCE_TRACKING_PATH,
    ],
    reason: ticket.explanation,
  });
  return payload;
}

function parseGitHubRepo(repository) {
  const [owner, repo] = cleanText(repository).split("/");
  if (!owner || !repo) {
    throw new Error("GitHub repository must use the owner/repo format.");
  }

  return { owner, repo };
}

function encodeGitHubPath(path) {
  return cleanText(path)
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function toBase64Utf8(value) {
  const bytes = new TextEncoder().encode(String(value ?? ""));
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

async function fetchGitHubJson(path, options = {}) {
  const {
    method = "GET",
    token = "",
    body = null,
    allowNotFound = false,
  } = options;

  const response = await fetch(`${GITHUB_API_ROOT}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (allowNotFound && response.status === 404) {
    return null;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || `GitHub request failed with ${response.status}.`);
  }

  return payload;
}

function fromBase64Utf8(value) {
  const normalized = cleanText(value).replace(/\n/g, "");
  if (!normalized) {
    return "";
  }

  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function readGitHubContentsJson(owner, repo, path, token, createFallback) {
  const encodedPath = encodeGitHubPath(path);
  const contents = await fetchGitHubJson(`/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(DEFAULT_GITHUB_BRANCH)}`, {
    token,
    allowNotFound: true,
  });

  if (!contents) {
    return createFallback();
  }

  const decoded = fromBase64Utf8(contents.content || "");
  if (!cleanText(decoded)) {
    return createFallback();
  }

  try {
    return JSON.parse(decoded);
  } catch (error) {
    throw new Error(`Could not parse ${path}: ${error.message || error}`);
  }
}

async function commitGitHubFiles(owner, repo, branch, message, fileEntries, token) {
  const ref = await fetchGitHubJson(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { token });
  const parentSha = cleanText(ref?.object?.sha);
  if (!parentSha) {
    throw new Error(`Could not resolve the current ${branch} branch head.`);
  }

  const parentCommit = await fetchGitHubJson(`/repos/${owner}/${repo}/git/commits/${parentSha}`, { token });
  const baseTreeSha = cleanText(parentCommit?.tree?.sha);
  if (!baseTreeSha) {
    throw new Error("Could not resolve the current Git tree for the admin commit.");
  }

  const tree = [];
  for (const fileEntry of fileEntries) {
    const blob = await fetchGitHubJson(`/repos/${owner}/${repo}/git/blobs`, {
      method: "POST",
      token,
      body: {
        content: fileEntry.content,
        encoding: "utf-8",
      },
    });

    tree.push({
      path: fileEntry.path,
      mode: "100644",
      type: "blob",
      sha: cleanText(blob?.sha),
    });
  }

  const nextTree = await fetchGitHubJson(`/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    token,
    body: {
      base_tree: baseTreeSha,
      tree,
    },
  });

  const nextCommit = await fetchGitHubJson(`/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    token,
    body: {
      message,
      tree: cleanText(nextTree?.sha),
      parents: [parentSha],
    },
  });

  await fetchGitHubJson(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "PATCH",
    token,
    body: {
      sha: cleanText(nextCommit?.sha),
      force: false,
    },
  });

  return {
    sha: cleanText(nextCommit?.sha),
    htmlUrl: cleanText(nextCommit?.html_url) || `https://github.com/${owner}/${repo}/commit/${cleanText(nextCommit?.sha)}`,
  };
}

function adminOverrideTarget(ticket, options = {}) {
  const { strict = true } = options;
  const itemId = ticket.suggestionType === "addition"
    ? cleanText(ticket.proposedSpecies?.itemId)
    : cleanText(ticket.currentSpecies?.itemId);

  if (!itemId) {
    if (!strict) {
      return {
        itemId: "",
        path: `data/review-overrides/countries/${ticket.countryIso3}/<CATALOG_ITEM_ID>.json`,
      };
    }
    throw new Error("Admin apply needs a real catalog species selection.");
  }

  return {
    itemId,
    path: `data/review-overrides/countries/${ticket.countryIso3}/${itemId}.json`,
  };
}

function adminOverrideStatus(ticket) {
  if (ticket.suggestionType === "accept_new") {
    return "likely_true_one_source";
  }

  if (ticket.suggestionType === "addition") {
    return "likely_true_one_source";
  }

  const currentStatus = cleanText(ticket.currentSpecies?.status);
  if (["likely_true_both", "likely_true_one_source"].includes(currentStatus)) {
    return currentStatus;
  }

  return "likely_true_one_source";
}

function adminObservationProfile(ticket) {
  if (ticket.scope === "regional") {
    return {
      code: "regional",
      label: "Regional footprint",
      short: "Regional",
      note: ADMIN_OVERRIDE_NOTE,
      significant: true,
      footprintPolygonLatLngs: sanitizePolygon(ticket.polygons[0] || []),
    };
  }

  return {
    code: "countrywide",
    label: "National footprint",
    short: "National",
    note: ADMIN_OVERRIDE_NOTE,
    significant: true,
    footprintPolygonLatLngs: [],
  };
}

function adminObservationProfileForCurrentSpecies(entry) {
  const code = cleanText(entry?.footprintCode) || "unscored";
  const defaults = FOOTPRINT_DEFAULTS[code] || FOOTPRINT_DEFAULTS.unscored;
  return {
    code,
    label: cleanText(entry?.footprintLabel) || defaults.label,
    short: cleanText(entry?.footprintShort) || defaults.short,
    note: ADMIN_OVERRIDE_NOTE,
    significant: code === "countrywide" || code === "regional",
    footprintPolygonLatLngs: code === "regional" ? sanitizePolygon(entry?.polygonLatLngs || []) : [],
  };
}

function validateAdminTicket(ticket) {
  if (!ticket) {
    return {
      ok: false,
      message: "Build a ticket preview to enable Apply Changes.",
    };
  }

  if (ticket.suggestionType === "addition" && !ticket.proposedSpecies?.itemId) {
    return {
      ok: false,
      message: "Admin apply currently needs a species from the catalog. Use Make GitHub Issue for custom typed species.",
    };
  }

  if (ticket.suggestionType === "accept_new" && !isNewDiscovery(ticket.currentSpecies)) {
    return {
      ok: false,
      message: "Accept new only works for species that are still marked New in the current pack.",
    };
  }

  if (ticket.scope === "regional" && ticket.polygons.length !== 1) {
    return {
      ok: false,
      message: "Admin apply currently supports exactly one regional polygon. Keep one area or use Make GitHub Issue.",
    };
  }

  return {
    ok: true,
    message: "Apply Changes is ready.",
  };
}

function buildAdminOverridePayload(ticket, login) {
  const target = adminOverrideTarget(ticket);
  const updatedAtUtc = new Date().toISOString();

  if (ticket.suggestionType === "removal") {
    return {
      countryIso3: ticket.countryIso3,
      itemId: target.itemId,
      action: "remove",
      updatedBy: login,
      updatedAtUtc,
      reason: `${ticket.explanation} Applied from the admin panel.`,
    };
  }

  if (ticket.suggestionType === "accept_new") {
    return {
      countryIso3: ticket.countryIso3,
      itemId: target.itemId,
      action: "upsert",
      updatedBy: login,
      updatedAtUtc,
      reason: `${ticket.explanation} Applied from the admin panel.`,
      patch: {
        status: adminOverrideStatus(ticket),
        expected: Boolean(ticket.currentSpecies?.expected),
        observationProfile: adminObservationProfileForCurrentSpecies(ticket.currentSpecies),
      },
    };
  }

  return {
    countryIso3: ticket.countryIso3,
    itemId: target.itemId,
    action: "upsert",
    updatedBy: login,
    updatedAtUtc,
    reason: `${ticket.explanation} Applied from the admin panel.`,
    patch: {
      status: adminOverrideStatus(ticket),
      expected: ticket.suggestionType === "addition" ? true : Boolean(ticket.currentSpecies?.expected),
      observationProfile: adminObservationProfile(ticket),
    },
  };
}

function serializeJsonFile(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

async function buildAdminFileEntries(owner, repo, ticket, login, token) {
  const geofenceTrackingPayload = applyGeofenceDecision(
    await readGitHubContentsJson(owner, repo, ADMIN_GEOFENCE_TRACKING_PATH, token, createEmptyGeofenceTrackingPayload),
    ticket,
    login,
  );
  const changeLogPayload = appendChangeLog(
    await readGitHubContentsJson(owner, repo, ADMIN_CHANGE_LOG_PATH, token, createEmptyChangeLogPayload),
    ticket,
    login,
  );

  return [
    {
      path: adminOverrideTarget(ticket).path,
      content: serializeJsonFile(buildAdminOverridePayload(ticket, login)),
    },
    {
      path: ADMIN_GEOFENCE_TRACKING_PATH,
      content: serializeJsonFile(geofenceTrackingPayload),
    },
    {
      path: ADMIN_CHANGE_LOG_PATH,
      content: serializeJsonFile(changeLogPayload),
    },
  ];
}

function adminCommitMessage(ticket) {
  const summary = buildTicketSummary(ticket);
  return `Apply admin review files for ${ticket.countryIso3}: ${summary}`;
}

function buildAdminSessionSpeciesEntry(ticket) {
  if (!state.currentCountry) {
    return null;
  }

  const itemId = adminOverrideTarget(ticket).itemId;
  const observationProfile = ticket.suggestionType === "accept_new"
    ? adminObservationProfileForCurrentSpecies(ticket.currentSpecies)
    : adminObservationProfile(ticket);

  return buildCountrySpeciesEntry({
    itemId,
    status: adminOverrideStatus(ticket),
    expected: ticket.suggestionType === "addition" ? true : Boolean(ticket.currentSpecies?.expected),
    observationProfile,
  }, state.currentCountry.precomputeMode);
}

async function applyAdminOverrideLocally(ticket) {
  if (!state.currentCountry || state.currentCountry.iso3 !== ticket.countryIso3) {
    return false;
  }

  const target = adminOverrideTarget(ticket);
  const nextSpecies = (state.currentCountry.species || []).filter((entry) => entry.itemId !== target.itemId);

  if (ticket.suggestionType === "removal") {
    if (state.highlightedSpeciesId === target.itemId) {
      state.highlightedSpeciesId = "";
    }
  } else {
    const nextEntry = buildAdminSessionSpeciesEntry(ticket);
    if (!nextEntry) {
      return false;
    }
    nextSpecies.push(nextEntry);
    state.highlightedSpeciesId = target.itemId;
  }

  state.currentCountry = rebuildCountryDerivedState({
    ...state.currentCountry,
    species: nextSpecies,
  });

  syncSuggestionTypeAvailability();
  updateCurrentSpeciesOptions();
  updateFormVisibility();
  renderCountryHeader();
  renderGroupChips();
  renderSpeciesList();
  updateMapSummary();
  clearTicketPreview();
  await loadRegionalOverlays();
  updateTicketPreviewGate();
  scheduleTicketPreviewRefresh();
  return true;
}

function setAdminMessage(message, isError = false) {
  state.admin.message = message;
  state.admin.messageIsError = Boolean(isError);
}

function clearAdminMessage() {
  state.admin.message = "";
  state.admin.messageIsError = false;
}

function adminApplyState() {
  if (state.admin.isConnecting) {
    return {
      canApply: false,
      message: "Connecting GitHub admin session...",
      isError: false,
    };
  }

  if (!state.admin.login) {
    return {
      canApply: false,
      message: "Connect a GitHub admin session to write override files directly.",
      isError: false,
    };
  }

  if (!state.admin.canWrite) {
    return {
      canApply: false,
      message: `@${state.admin.login} does not have write access to ${DEFAULT_GITHUB_REPO}.`,
      isError: true,
    };
  }

  if (state.admin.isApplying) {
    return {
      canApply: false,
      message: "Applying admin override...",
      isError: false,
    };
  }

  const validation = validateAdminTicket(state.preview?.ticket || null);
  return {
    canApply: validation.ok,
    message: validation.message,
    isError: !validation.ok,
  };
}

function derivedAdminMessage() {
  const applyState = adminApplyState();
  if (state.admin.message) {
    return {
      message: state.admin.message,
      isError: state.admin.messageIsError,
      canApply: applyState.canApply,
    };
  }

  if (!state.admin.login) {
    return applyState;
  }

  const permissionText = state.admin.canWrite
    ? `Connected as @${state.admin.login} with ${state.admin.permissionLabel || "write"} access to ${DEFAULT_GITHUB_REPO}.`
    : `Connected as @${state.admin.login}, but this account cannot push to ${DEFAULT_GITHUB_REPO}.`;

  return {
    message: applyState.canApply ? `${permissionText} ${applyState.message}` : `${permissionText} ${applyState.message}`,
    isError: applyState.isError,
    canApply: applyState.canApply,
  };
}

function renderAdminState() {
  const connected = Boolean(state.admin.login);
  const status = derivedAdminMessage();

  adminTokenField.hidden = connected;
  adminConnectButton.hidden = connected;
  adminConnectButton.disabled = state.admin.isConnecting || state.admin.isApplying;
  adminConnectButton.textContent = state.admin.isConnecting ? "Connecting..." : "Connect GitHub";

  adminDisconnectButton.hidden = !connected;
  adminDisconnectButton.disabled = state.admin.isConnecting || state.admin.isApplying;

  adminApplyButton.hidden = !connected;
  adminApplyButton.disabled = !status.canApply || state.admin.isConnecting || state.admin.isApplying;
  adminApplyButton.textContent = state.admin.isApplying ? "Applying..." : "Apply Changes (Admin)";

  adminAuthStatus.textContent = status.message;
  adminAuthStatus.classList.toggle("error", Boolean(status.isError));

  adminLastCommitLink.hidden = !state.admin.lastCommitUrl;
  if (state.admin.lastCommitUrl) {
    adminLastCommitLink.href = state.admin.lastCommitUrl;
  } else {
    adminLastCommitLink.href = "#";
  }
}

function readPersistedAdminToken() {
  try {
    return cleanText(window.localStorage.getItem(ADMIN_PERSISTENT_TOKEN_KEY) || window.sessionStorage.getItem(ADMIN_SESSION_TOKEN_KEY) || "");
  } catch {
    return "";
  }
}

function persistAdminToken(token) {
  try {
    window.sessionStorage.setItem(ADMIN_SESSION_TOKEN_KEY, token);
    window.localStorage.setItem(ADMIN_PERSISTENT_TOKEN_KEY, token);
  } catch {
    // Ignore storage failures and continue with in-memory auth.
  }
}

function clearPersistedAdminToken() {
  try {
    window.sessionStorage.removeItem(ADMIN_SESSION_TOKEN_KEY);
    window.localStorage.removeItem(ADMIN_PERSISTENT_TOKEN_KEY);
  } catch {
    // Ignore storage failures.
  }
}

async function connectAdminSession() {
  const token = cleanText(adminTokenInput.value);
  if (!token) {
    setAdminMessage("Paste a GitHub fine-grained token first.", true);
    renderAdminState();
    return;
  }

  state.admin.isConnecting = true;
  state.admin.lastCommitUrl = "";
  clearAdminMessage();
  renderAdminState();

  try {
    const { owner, repo } = parseGitHubRepo(DEFAULT_GITHUB_REPO);
    const [user, repository] = await Promise.all([
      fetchGitHubJson("/user", { token }),
      fetchGitHubJson(`/repos/${owner}/${repo}`, { token }),
    ]);

    const permissions = repository.permissions || {};
    const canWrite = Boolean(permissions.admin || permissions.maintain || permissions.push);
    const permissionLabel = permissions.admin ? "admin" : permissions.maintain ? "maintain" : permissions.push ? "write" : permissions.pull ? "read" : "no";

    state.admin.token = token;
    state.admin.login = cleanText(user.login);
    state.admin.canWrite = canWrite;
    state.admin.permissionLabel = permissionLabel;
    persistAdminToken(token);
    clearAdminMessage();
    adminTokenInput.value = "";

    if (!canWrite) {
      setAdminMessage(`@${state.admin.login} is connected, but this account cannot push to ${DEFAULT_GITHUB_REPO}.`, true);
    }

    setStatus(canWrite ? `Admin session connected as @${state.admin.login}.` : `Admin session connected as @${state.admin.login}, but push access is missing.`, !canWrite);
  } catch (error) {
    state.admin.token = "";
    state.admin.login = "";
    state.admin.canWrite = false;
    state.admin.permissionLabel = "";
    state.admin.lastCommitUrl = "";
    clearPersistedAdminToken();
    setAdminMessage(error.message || "Could not connect the GitHub admin session.", true);
    setStatus(error.message || "Could not connect the GitHub admin session.", true);
  } finally {
    state.admin.isConnecting = false;
    renderAdminState();
  }
}

function disconnectAdminSession() {
  state.admin.token = "";
  state.admin.login = "";
  state.admin.canWrite = false;
  state.admin.permissionLabel = "";
  state.admin.isConnecting = false;
  state.admin.isApplying = false;
  state.admin.lastCommitUrl = "";
  clearPersistedAdminToken();
  adminTokenInput.value = "";
  clearAdminMessage();
  renderAdminState();
  setStatus("Admin session disconnected.");
}

function consumeAdminTokenHandoff() {
  let token = "";

  try {
    token = cleanText(window.sessionStorage.getItem(ADMIN_TOKEN_HANDOFF_KEY) || "");
    window.sessionStorage.removeItem(ADMIN_TOKEN_HANDOFF_KEY);
  } catch {
    return;
  }

  if (!token || state.admin.login) {
    return;
  }

  adminTokenInput.value = token;
  void connectAdminSession();

  requestAnimationFrame(() => {
    document.getElementById("admin-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function restorePersistedAdminSession() {
  const token = readPersistedAdminToken();
  if (!token || state.admin.login || state.admin.isConnecting) {
    return;
  }

  adminTokenInput.value = token;
  void connectAdminSession();
}

async function applyAdminChanges() {
  const applyState = adminApplyState();
  if (!applyState.canApply || !state.preview?.ticket) {
    setAdminMessage(applyState.message, applyState.isError);
    renderAdminState();
    return;
  }

  state.admin.isApplying = true;
  state.admin.lastCommitUrl = "";
  clearAdminMessage();
  renderAdminState();
  setStatus("Committing admin override to GitHub...");

  try {
    const ticket = state.preview.ticket;
    const { owner, repo } = parseGitHubRepo(DEFAULT_GITHUB_REPO);
    const target = adminOverrideTarget(ticket);
    const fileEntries = await buildAdminFileEntries(owner, repo, ticket, state.admin.login, state.admin.token);
    const result = await commitGitHubFiles(owner, repo, DEFAULT_GITHUB_BRANCH, adminCommitMessage(ticket), fileEntries, state.admin.token);

    state.admin.lastCommitUrl = cleanText(result?.htmlUrl);
    let sessionUpdated = false;
    try {
      sessionUpdated = await applyAdminOverrideLocally(ticket);
    } catch (localError) {
      console.error(localError);
    }

    const publishedNote = "The country override, binary geofence tracking file, and change log were committed. The published country pack updates after the rebuild step commits regenerated pack files.";
    if (sessionUpdated) {
      setAdminMessage(`Override committed for ${target.itemId}. This browser session now shows the change. ${publishedNote}`);
      setStatus("Admin override committed. This browser session now shows the change.");
    } else {
      setAdminMessage(`Override committed for ${target.itemId}. ${publishedNote}`);
      setStatus("Admin override committed.");
    }
  } catch (error) {
    setAdminMessage(error.message || "Could not commit the admin override.", true);
    setStatus(error.message || "Could not commit the admin override.", true);
  } finally {
    state.admin.isApplying = false;
    renderAdminState();
  }
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
  if (Number.isFinite(meanVertices) && meanVertices >= GEOBOUNDARIES_OUTLINE_ONLY_VERTEX_LIMIT) {
    return null;
  }
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

async function fetchWorldCountryGeometry(iso3) {
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
  return index.get(iso3) || null;
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
    if (geoboundariesGeometry) {
      countryGeometryCache.set(iso3, geoboundariesGeometry);
      return geoboundariesGeometry;
    }
  } catch {
    // Fall through to lighter public sources.
  }

  try {
    const indexed = await fetchWorldCountryGeometry(iso3);
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

function getCountryBoundarySegments(countryGeometry, countryPolygons = null) {
  if (!countryGeometry) {
    return [];
  }
  if (countryBoundarySegmentCache.has(countryGeometry)) {
    return countryBoundarySegmentCache.get(countryGeometry);
  }

  const polygons = countryPolygons || geoJsonToClipMultiPolygon(countryGeometry);
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

function getCountryClipContext(countryGeometry) {
  if (!countryGeometry) {
    return null;
  }
  if (countryClipContextCache.has(countryGeometry)) {
    return countryClipContextCache.get(countryGeometry);
  }

  const country = geoJsonToClipMultiPolygon(countryGeometry);
  const countryBoundarySegments = getCountryBoundarySegments(countryGeometry, country);
  const clipContext = {
    country,
    countryBoundarySegments,
  };

  countryClipContextCache.set(countryGeometry, clipContext);
  return clipContext;
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

function snapFootprintTowardCoastline(footprint, countryClipContext) {
  const clipper = window.polygonClipping;
  const countryBoundarySegments = countryClipContext?.countryBoundarySegments || [];
  const country = countryClipContext?.country || [];

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

function clipFeatureToCountry(feature, countryGeometryOrContext) {
  const clipper = window.polygonClipping;
  const footprint = geoJsonToClipMultiPolygon(feature);
  const countryClipContext = countryGeometryOrContext?.country
    ? countryGeometryOrContext
    : getCountryClipContext(countryGeometryOrContext);
  const country = countryClipContext?.country || [];

  if (!footprint.length || !country.length || !clipper?.intersection) {
    return [feature];
  }

  try {
    const expandedFootprint = snapFootprintTowardCoastline(footprint, countryClipContext);
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
    .map((item) => {
      const displayName = cleanText(item.commonName) || cleanText(item.binomial) || cleanText(item.label) || "Unknown species";
      return `<div class="footprint-tooltip-item" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</div>`;
    })
    .join("");
}

function currentNationalSpecies() {
  return (state.currentCountry?.species || [])
    .filter((entry) => isVisibleSpecies(entry) && entry.footprintCode === "countrywide")
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

  const regionalCount = species.length;
  const nationalCount = nationalSpecies.length;

  if (!regionalCount && !nationalCount) {
    return "";
  }

  if (!regionalCount) {
    return `
      <div class="footprint-tooltip">
        <strong>${nationalCount} national species</strong>
      </div>
    `;
  }

  const nationalNote = nationalCount
    ? `<div class="footprint-tooltip-note">${nationalCount} national species</div>`
    : "";

  return `
    <div class="footprint-tooltip">
      <strong>${regionalCount} regional species</strong>
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
  const showNationalSummary = nationalSpecies.length && pointInGeoJson(event.latlng, currentCountryGeometry);

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
  reviewMap.fitBounds(bounds.pad(COUNTRY_FIT_PAD), { animate: false });
  return true;
}

function countryGeometryBoundsView(countryGeometry) {
  if (!countryGeometry || !reviewMap) {
    return null;
  }

  const bounds = L.geoJSON(countryGeometry).getBounds();
  if (!bounds.isValid()) {
    return null;
  }

  const paddedBounds = bounds.pad(COUNTRY_FIT_PAD);
  return {
    bounds: paddedBounds,
  };
}

async function focusSelectedCountry(countryGeometry = null, options = {}) {
  const { animate = false } = options;

  if (countryGeometry) {
    const geometryView = countryGeometryBoundsView(countryGeometry);
    if (geometryView) {
      reviewMap.fitBounds(geometryView.bounds, { animate });
      return;
    }
  }

  const focus = await getCountryCenter(countrySelect.value);
  if (focus) {
    reviewMap.setView(focus.latlng, focus.zoom, { animate });
    return;
  }

  reviewMap.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, { animate });
}

async function loadRegionalOverlays() {
  const overlayLoadId = ++currentOverlayLoadId;
  if (!countrySelect.value) {
    clearRegionalOverlays();
    updateMapSummary();
    return;
  }

  clearRegionalOverlays();
  mapSummary.textContent = "Map overlay: moving to country...";

  try {
    await focusSelectedCountry();
    if (overlayLoadId !== currentOverlayLoadId) {
      return;
    }

    await yieldToBrowser();
    if (overlayLoadId !== currentOverlayLoadId) {
      return;
    }

    mapSummary.textContent = "Map overlay: loading country outline...";
    const countryGeometry = await fetchCountryGeometry(countrySelect.value);
    if (overlayLoadId !== currentOverlayLoadId) {
      return;
    }

    currentCountryGeometry = countryGeometry;
    await focusSelectedCountry(countryGeometry);
    if (overlayLoadId !== currentOverlayLoadId) {
      return;
    }

    await yieldToBrowser();
    if (overlayLoadId !== currentOverlayLoadId) {
      return;
    }

    const overlayData = buildRegionalOverlayCollection(state.currentCountry);
    const nationalSpecies = currentNationalSpecies();

    if (countryGeometry && nationalSpecies.length) {
      mapSummary.textContent = "Map overlay: drawing national coverage...";
      await yieldToBrowser();
      if (overlayLoadId !== currentOverlayLoadId) {
        return;
      }

      currentNationalOverlayLayer = L.geoJSON(countryGeometry, {
        style: CURRENT_NATIONAL_STYLE,
        interactive: false,
      }).addTo(reviewMap);
    }

    let features = overlayData.features || [];
    if (countryGeometry && features.length) {
      mapSummary.textContent = "Map overlay: clipping regional areas...";
      await yieldToBrowser();
      if (overlayLoadId !== currentOverlayLoadId) {
        return;
      }

      const countryClipContext = getCountryClipContext(countryGeometry);
      features = features.flatMap((feature) => clipFeatureToCountry(feature, countryClipContext));
    }

    if (features.length) {
      mapSummary.textContent = "Map overlay: drawing regional areas...";
      await yieldToBrowser();
      if (overlayLoadId !== currentOverlayLoadId) {
        return;
      }

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

    if (overlayLoadId !== currentOverlayLoadId) {
      return;
    }

    updateSelectedRegionalLayers(false);
    updateMapSummary();
  } catch (error) {
    if (overlayLoadId !== currentOverlayLoadId) {
      return;
    }
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
    zoomSnap: 0.1,
    zoomDelta: 0.5,
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
  scheduleTicketPreviewRefresh();
}

function clearDrawnPolygons(refreshPreview = true) {
  suggestionDrawLayer.clearLayers();
  state.drawnPolygons = [];
  clearTicketPreview();
  updateMapHint();
  updateMapSummary();
  if (refreshPreview) {
    scheduleTicketPreviewRefresh();
  }
}

function populateCountrySelect(countries) {
  // Exclude state-level entries from country combobox; they appear via state dropdown
  const topLevelCountries = countries.filter((c) => !countryPackKey(c).startsWith("USA-"));
  comboBoxes.country.options = topLevelCountries.map((country) => {
    const itemId = countryPackKey(country);
    const label = countryPackLabel(country);
    const aliases = countryPackAliases(country);
    return {
      itemId,
      label,
      meta: countryPackMeta(country),
      aliases,
      searchText: searchableText([
        label,
        ...aliases,
        country?.unitType,
        country?.regionType,
        country?.scopeLabel,
      ]),
    };
  });

  // Populate state dropdown with USA-* entries
  const stateEntries = countries.filter((c) => countryPackKey(c).startsWith("USA-"));
  comboBoxes.state.options = [
    { itemId: "", label: "All states (whole USA)", meta: "", searchText: "all usa united states" },
    ...stateEntries.map((s) => {
      const itemId = countryPackKey(s);
      const stateCode = itemId.replace("USA-", "");
      const stateNameFull = (s.countryName || "").replace("United States \u2013 ", "").replace("United States - ", "");
      return {
        itemId,
        label: stateNameFull,
        meta: stateCode,
        searchText: searchableText([stateNameFull, stateCode, "USA", "United States"]),
      };
    }),
  ];

  const defaultOption = comboBoxes.country.options.find((option) => option.itemId === "DNK") || comboBoxes.country.options[0] || null;
  setCountryValue(defaultOption?.label || "", defaultOption?.itemId || "");

  if (openComboKey === "country") {
    renderComboOptions("country");
  }
}

function updateStateFieldVisibility() {
  const selectedCountry = countrySelect.value;
  if (selectedCountry === "USA") {
    stateField.hidden = false;
  } else {
    stateField.hidden = true;
    stateSelect.value = "";
    stateInput.value = "";
  }
}

function setCountryValue(label, itemId = "") {
  countryInput.value = label;
  countrySelect.value = itemId;

  if (openComboKey === "country") {
    renderComboOptions("country");
  }
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

function updateCurrentSpeciesOptions() {
  comboBoxes.current.emptyText = suggestionType() === "accept_new"
    ? "No new species are waiting for approval in this country."
    : "No matching species in this country pack.";
  populateCurrentSpeciesOptions(suggestionType() === "accept_new" ? currentCountryNewSpecies() : (state.currentCountry?.species || []));
}

function isComboBoxOpen(key) {
  return openComboKey === key && !comboBoxes[key].menu.hidden;
}

function comboSelectedOption(combo) {
  if (!combo) {
    return null;
  }
  return combo.options.find((option) => option.itemId === combo.hiddenInput.value) || null;
}

function filteredComboOptions(combo) {
  const query = combo.showAllOnOpen ? "" : cleanText(combo.input.value).toLocaleLowerCase();
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

  if (combo.strictSelection) {
    const selectedOption = comboSelectedOption(combo);
    combo.input.value = selectedOption?.label || "";
  }

  combo.root.classList.remove("open", "open-up");
  combo.menu.hidden = true;
  combo.input.setAttribute("aria-expanded", "false");
  combo.filteredOptions = [];
  combo.highlightedItemId = "";
  combo.keyboardMode = false;
  combo.showAllOnOpen = false;

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
  const selectedOption = comboSelectedOption(combo);
  combo.showAllOnOpen = Boolean(
    combo.strictSelection
      && selectedOption
      && sortKey(combo.input.value) === sortKey(selectedOption.label)
  );
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

  if (key === "country") {
    const hasChanged = countrySelect.value !== option.itemId;
    setCountryValue(option.label, option.itemId);
    closeComboBox(key);
    if (hasChanged) {
      countrySelect.dispatchEvent(new Event("change"));
    }
    return;
  }

  if (key === "state") {
    const hasChanged = stateSelect.value !== option.itemId;
    stateInput.value = option.label;
    stateSelect.value = option.itemId;
    closeComboBox(key);
    if (hasChanged) {
      stateSelect.dispatchEvent(new Event("change"));
    }
    return;
  }

  if (key === "current") {
    applySpeciesSelection(option.itemId, false);
  } else {
    setProposedSpeciesValue(option.label, option.itemId);
    clearTicketPreview();
    scheduleTicketPreviewRefresh();
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

function adminShortcutState(entry, suggestion) {
  if (!state.currentCountry) {
    return {
      ok: false,
      message: "Load a country pack before using admin shortcuts.",
    };
  }

  if (!state.admin.login) {
    return {
      ok: false,
      message: "Connect a GitHub admin session to use admin shortcuts.",
    };
  }

  if (!state.admin.canWrite) {
    return {
      ok: false,
      message: `@${state.admin.login} does not have write access to ${DEFAULT_GITHUB_REPO}.`,
    };
  }

  if (state.admin.isConnecting) {
    return {
      ok: false,
      message: "Wait for the GitHub admin session to finish connecting.",
    };
  }

  if (state.admin.isApplying) {
    return {
      ok: false,
      message: "Another admin change is already being committed.",
    };
  }

  if (!entry) {
    return {
      ok: false,
      message: "Choose a species from the current pack first.",
    };
  }

  if (suggestion === "accept_new" && !isNewDiscovery(entry)) {
    return {
      ok: false,
      message: "Approve is only available for species currently marked New.",
    };
  }

  return {
    ok: true,
    message: "Admin shortcut ready.",
  };
}

function buildAdminShortcutPayload(entry, suggestion) {
  return {
    countryIso3: state.currentCountry?.iso3 || "",
    suggestionType: suggestion,
    currentSpeciesItemId: entry.itemId,
    proposedSpeciesItemId: "",
    proposedSpeciesLabel: "",
    scope: normalizedScopeForSpecies(entry),
    notifyOnFix: false,
    notificationEmail: "",
    polygons: [],
  };
}

function adminShortcutPrompt(ticket) {
  let actionText = "remove this species from the current pack";
  if (ticket.suggestionType === "accept_new") {
    actionText = "approve this species into the permanent pack";
  } else if (ticket.suggestionType === "correction") {
    actionText = "move this species into Likely Valid with its current coverage";
  }
  return `${buildTicketSummary(ticket)}\n\nThis will ${actionText} by committing the admin override files directly to GitHub for ${ticket.countryIso3}. Continue?`;
}

async function runAdminShortcutAction(itemId, suggestion) {
  const entry = currentSpeciesById(cleanText(itemId));
  const shortcutState = adminShortcutState(entry, suggestion);
  if (!shortcutState.ok) {
    setAdminMessage(shortcutState.message, true);
    setStatus(shortcutState.message, true);
    renderAdminState();
    return;
  }

  setSuggestionTypeValue(suggestion);
  applySpeciesSelection(entry.itemId, true);

  try {
    cancelTicketPreviewRefresh();
    const preview = buildTicketPreviewData(buildAdminShortcutPayload(entry, suggestion));
    renderTicketPreview(preview);

    if (!window.confirm(adminShortcutPrompt(preview.ticket))) {
      setStatus("Admin shortcut cancelled.");
      return;
    }

    await applyAdminChanges();
  } catch (error) {
    setAdminMessage(error.message || "Could not prepare the admin shortcut.", true);
    setStatus(error.message || "Could not prepare the admin shortcut.", true);
    renderAdminState();
  }
}

function renderSpeciesAdminActions(entry) {
  if (!state.admin.login) {
    return "";
  }

  const disabled = !state.admin.canWrite || state.admin.isConnecting || state.admin.isApplying;
  const disabledAttr = disabled ? " disabled" : "";
  const safeLabel = escapeHtml(entry.commonName || entry.label);
  const buttons = [];
  const isNew = isNewDiscovery(entry);
  const isNeedsReview = effectiveBucket(entry) === "Needs Review";

  if (isNew || isNeedsReview) {
    const shortcut = isNew ? "accept_new" : "correction";
    const actionLabel = isNew
      ? `Approve ${safeLabel} into the permanent pack`
      : `Move ${safeLabel} to Likely Valid`;
    buttons.push(`
      <button class="species-card-action species-card-action-accept" type="button" data-admin-shortcut="${shortcut}" data-item-id="${entry.itemId}" title="${actionLabel}" aria-label="${actionLabel}"${disabledAttr}>
        &#10003;
      </button>
    `);
  }

  buttons.push(`
    <button class="species-card-action species-card-action-remove" type="button" data-admin-shortcut="removal" data-item-id="${entry.itemId}" title="Remove ${safeLabel} from the current pack" aria-label="Remove ${safeLabel} from the current pack"${disabledAttr}>
      &#10005;
    </button>
  `);

  return `
    <div class="species-card-actions">
      ${buttons.join("")}
    </div>
  `;
}

function buildSummaryText(country) {
  const total = visibleSpecies(country).length || country.summary?.total || 0;
  const likelyValidCount = groupCount(country, "likely_valid");
  const needsReviewCount = groupCount(country, "needs_review");
  const newCount = groupCount(country, "new");
  const regionalCount = groupCount(country, "regional");
  const pieces = [`${total} species`, `${country.precomputeMode} pack`];

  if (likelyValidCount) {
    pieces.push(`${likelyValidCount} likely valid`);
  }
  if (needsReviewCount) {
    pieces.push(`${needsReviewCount} review`);
  }
  if (newCount) {
    pieces.push(`${newCount} new`);
  }

  if (regionalCount) {
    pieces.push(`${regionalCount} regional`);
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

  const buttons = GROUP_ORDER.map((groupKey) => {
    const count = groupCount(state.currentCountry, groupKey);
    return `
      <button class="chip ${state.groupFilter === groupKey ? "active" : ""}" data-group="${groupKey}" type="button">
        ${GROUP_LABELS[groupKey] || groupKey} (${count})
      </button>
    `;
  });

  groupChips.innerHTML = buttons.join("");
}

function filteredSpecies() {
  if (!state.currentCountry) {
    return [];
  }

  const search = state.speciesFilter.toLocaleLowerCase();
  return visibleSpecies(state.currentCountry).filter((entry) => {
    if (!matchesGroupFilter(entry, state.groupFilter)) {
      return false;
    }
    if (!search) {
      return true;
    }

    const haystack = [entry.label, entry.commonName, entry.binomial, entry.footprintLabel, ...(entry.tags || [])]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    return haystack.includes(search);
  });
}

function renderSpeciesCard(entry) {
  const selectedClass = state.highlightedSpeciesId === entry.itemId ? "selected" : "";
  const classBadge = cleanText(entry.classLabel)
    ? `<span class="badge badge-class">${escapeHtml(entry.classLabel)}</span>`
    : "";
  const bucketBadge = effectiveBucket(entry);
  const tagBadges = (entry.tags || [])
    .filter((tag) => !(entry.expected === false && cleanText(tag).toLocaleLowerCase() === "not in geofence"))
    .map((tag) => `<span class="badge badge-tag">${escapeHtml(tag)}</span>`)
    .join("");
  const adminActions = renderSpeciesAdminActions(entry);
  return `
    <article class="species-card ${selectedClass}">
      <button class="species-card-select" type="button" data-item-id="${entry.itemId}">
        <div class="species-card-main">
          <div>
            <strong>${escapeHtml(entry.commonName || entry.label)}</strong>
            ${entry.binomial ? `<em>${escapeHtml(entry.binomial)}</em>` : ""}
          </div>
        </div>
        <div class="species-card-meta">
          ${classBadge}
          <span class="badge badge-footprint">${escapeHtml(entry.footprintShort)}</span>
          <span class="badge badge-bucket">${escapeHtml(bucketBadge)}</span>
          ${tagBadges}
        </div>
      </button>
      ${adminActions}
    </article>
  `;
}

function renderSpeciesList() {
  const entries = filteredSpecies();
  if (!entries.length) {
    speciesList.innerHTML = '<article class="empty-card">No species match the current filters.</article>';
    return;
  }

  const sortedEntries = entries.slice().sort((left, right) => speciesSortName(left).localeCompare(speciesSortName(right)));
  const heading = GROUP_LABELS[state.groupFilter] || GROUP_LABELS.all;
  speciesList.innerHTML = `
    <section class="species-group">
      <div class="species-group-head">
        <h3>${escapeHtml(heading)}</h3>
        <span class="species-group-count">${sortedEntries.length}</span>
      </div>
      <div class="species-stack">
        ${sortedEntries.map((entry) => renderSpeciesCard(entry)).join("")}
      </div>
    </section>
  `;
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
    return;
  }

  if (fitToSelection) {
    const selectedEntry = currentSpeciesById(state.highlightedSpeciesId);
    if (selectedEntry?.footprintCode === "countrywide") {
      void focusSelectedCountry(currentCountryGeometry, { animate: true });
    }
  }
}

function applySpeciesSelection(itemId, fitToMap = false) {
  state.highlightedSpeciesId = itemId || "";
  renderSpeciesList();
  updateSelectedRegionalLayers(fitToMap);

  if (suggestionType() !== "addition") {
    const currentEntry = currentSpeciesById(itemId);
    const isSelectable = suggestionType() !== "accept_new" || isNewDiscovery(currentEntry);
    setCurrentSpeciesValue(isSelectable ? currentEntry?.label || "" : "", isSelectable ? itemId || "" : "");
  }

  closeComboBox("current");

  clearTicketPreview();
  scheduleTicketPreviewRefresh();
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
  if (["accept_new", "removal"].includes(suggestionType())) {
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

function hideRegionalHelp() {
  if (regionalHelpCard) {
    regionalHelpCard.hidden = true;
  }
}

function maybeShowRegionalHelp() {
  if (!regionalHelpCard) {
    return;
  }

  if (onboardingIsOpen()) {
    hideRegionalHelp();
    return;
  }

  if (suggestionType() !== "correction" || scopeSelect.value !== "regional") {
    hideRegionalHelp();
    return;
  }

  if (hasShownCorrectionRegionalHelp) {
    hideRegionalHelp();
    return;
  }

  regionalHelpCard.hidden = false;
  hasShownCorrectionRegionalHelp = true;
}

function hasSeenOnboarding() {
  try {
    return window.localStorage.getItem(ONBOARDING_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markOnboardingSeen() {
  try {
    window.localStorage.setItem(ONBOARDING_SEEN_KEY, "1");
  } catch {
    // Ignore storage failures.
  }
}

function onboardingIsOpen() {
  return Boolean(onboardingOverlay) && !onboardingOverlay.hidden;
}

function onboardingTargetElement(step) {
  if (step?.targetSelector) {
    const selectedTarget = document.querySelector(step.targetSelector);
    if (selectedTarget) {
      return selectedTarget;
    }
  }

  switch (step?.targetKey) {
    case "browser":
      return browserPanel;
    case "groups":
      return groupChips;
    case "map":
      return mapPanel;
    case "ticket":
      return ticketPanel;
    default:
      return null;
  }
}

function onboardingViewportBaseTarget(step) {
  if (step?.hideSpotlight) {
    return null;
  }

  return onboardingTargetElement(step);
}

function onboardingShellTargetKey(step) {
  return step?.shellTargetKey || step?.targetKey || "";
}

function hideOnboardingSpotlight() {
  if (onboardingSpotlight) {
    onboardingSpotlight.hidden = true;
  }
}

function positionOnboardingSpotlight(target) {
  if (!onboardingSpotlight || !target) {
    hideOnboardingSpotlight();
    return;
  }

  const rect = target.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width < 1 || rect.height < 1) {
    hideOnboardingSpotlight();
    return;
  }

  const padding = 12;
  const top = Math.max(12, rect.top - padding);
  const left = Math.max(12, rect.left - padding);
  const maxWidth = Math.max(40, window.innerWidth - left - 12);
  const maxHeight = Math.max(40, window.innerHeight - top - 12);

  onboardingSpotlight.style.top = `${top}px`;
  onboardingSpotlight.style.left = `${left}px`;
  onboardingSpotlight.style.width = `${Math.min(rect.width + padding * 2, maxWidth)}px`;
  onboardingSpotlight.style.height = `${Math.min(rect.height + padding * 2, maxHeight)}px`;
  onboardingSpotlight.hidden = false;
}

function setOnboardingScrollLock(locked) {
  document.documentElement.classList.toggle(ONBOARDING_SCROLL_LOCK_CLASS, locked);
  document.body.classList.toggle(ONBOARDING_SCROLL_LOCK_CLASS, locked);
}

function resetOnboardingCardPosition() {
  if (!onboardingShell) {
    return;
  }

  onboardingShell.classList.remove("following-target");
  onboardingShell.style.removeProperty("--onboarding-card-top");
  onboardingShell.style.removeProperty("--onboarding-card-left");
  onboardingShell.style.removeProperty("--onboarding-card-width");
  onboardingShell.style.removeProperty("--onboarding-card-max-height");
}

function positionOnboardingCardNearTarget(target) {
  if (!onboardingShell || !onboardingCard || !target) {
    resetOnboardingCardPosition();
    return;
  }

  const rect = target.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width < 1 || rect.height < 1) {
    resetOnboardingCardPosition();
    return;
  }

  const viewportPadding = 16;
  const gap = 18;
  const cardRect = onboardingCard.getBoundingClientRect();
  const cardWidth = Math.min(cardRect.width || 460, Math.max(280, window.innerWidth - viewportPadding * 2));
  const cardHeight = Math.min(cardRect.height || 360, Math.max(200, window.innerHeight - viewportPadding * 2));
  const spaceRight = window.innerWidth - rect.right - gap - viewportPadding;
  const spaceLeft = rect.left - gap - viewportPadding;
  const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
  const spaceAbove = rect.top - gap - viewportPadding;

  let left = rect.right + gap;
  let top = rect.top + rect.height / 2 - cardHeight / 2;

  if (spaceRight >= Math.min(280, cardWidth)) {
    left = rect.right + gap;
  } else if (spaceLeft >= Math.min(280, cardWidth)) {
    left = rect.left - gap - cardWidth;
  } else if (spaceBelow >= spaceAbove) {
    left = rect.left + rect.width / 2 - cardWidth / 2;
    top = rect.bottom + gap;
  } else {
    left = rect.left + rect.width / 2 - cardWidth / 2;
    top = rect.top - gap - cardHeight;
  }

  left = Math.max(viewportPadding, Math.min(left, window.innerWidth - cardWidth - viewportPadding));
  top = Math.max(viewportPadding, Math.min(top, window.innerHeight - cardHeight - viewportPadding));

  onboardingShell.classList.add("following-target");
  onboardingShell.style.setProperty("--onboarding-card-top", `${Math.round(top)}px`);
  onboardingShell.style.setProperty("--onboarding-card-left", `${Math.round(left)}px`);
  onboardingShell.style.setProperty("--onboarding-card-width", `${Math.round(cardWidth)}px`);
  onboardingShell.style.setProperty("--onboarding-card-max-height", `${Math.round(window.innerHeight - viewportPadding * 2)}px`);
}

function setOnboardingViewportTarget(target, followsTarget = false) {
  onboardingViewportTarget = target || null;
  onboardingViewportFollowsTarget = Boolean(target && followsTarget);
  refreshOnboardingViewportState(onboardingViewportTarget);
}

function clearOnboardingLiveTargets() {
  document.querySelectorAll(`.${ONBOARDING_LIVE_TARGET_CLASS}`).forEach((element) => {
    element.classList.remove(ONBOARDING_LIVE_TARGET_CLASS);
  });
}

function shouldLockOnboardingScroll(target) {
  return true;
}

function refreshOnboardingViewportState(target = onboardingViewportTarget) {
  positionOnboardingSpotlight(target);
  if (onboardingViewportFollowsTarget && target) {
    positionOnboardingCardNearTarget(target);
  } else {
    resetOnboardingCardPosition();
  }
  setOnboardingScrollLock(shouldLockOnboardingScroll(target));
}

function onboardingTargetNeedsScroll(target) {
  if (!target) {
    return false;
  }

  const rect = target.getBoundingClientRect();
  const verticalMargin = 96;
  const horizontalMargin = 32;

  return rect.top < verticalMargin
    || rect.bottom > window.innerHeight - verticalMargin
    || rect.left < horizontalMargin
    || rect.right > window.innerWidth - horizontalMargin;
}

function scrollOnboardingTargetIntoView(target) {
  if (!target) {
    return;
  }

  if (!onboardingTargetNeedsScroll(target)) {
    return;
  }

  target.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
}

function scrollOnboardingStepIntoView(step, target) {
  if (step?.scrollToTop) {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    return;
  }

  scrollOnboardingTargetIntoView(target);
}

function onboardingStepComplete(step) {
  const requiredActions = step?.requiredActions || [];
  if (!requiredActions.length) {
    return true;
  }

  if (step.completionMode === "all") {
    return requiredActions.every((action) => onboardingCompletedActions.has(action));
  }

  return requiredActions.some((action) => onboardingCompletedActions.has(action));
}

function updateOnboardingStepControls(step) {
  const requiredActions = step?.requiredActions || [];
  onboardingNextButton.hidden = false;
  onboardingNextButton.disabled = false;
  onboardingBackButton.disabled = false;
  onboardingSkipButton.textContent = step?.skipLabel || "Stop guide";
  onboardingNextButton.textContent = step?.nextLabel || (onboardingStepIndex === ONBOARDING_STEPS.length - 1 ? "Start reviewing" : "Next");
  onboardingBody?.querySelectorAll("[data-demo-action]").forEach((button) => {
    const action = button.dataset.demoAction || "";
    const isRequired = requiredActions.includes(action);
    const isDone = onboardingCompletedActions.has(action);
    button.classList.toggle("onboarding-action-required", isRequired && !isDone);
  });
}

function renderOnboardingStep() {
  if (!onboardingOverlay || onboardingOverlay.hidden) {
    return;
  }

  const step = ONBOARDING_STEPS[onboardingStepIndex];
  if (!step) {
    return;
  }

  const guideStepIndex = ONBOARDING_GUIDE_STEPS.indexOf(step);
  onboardingStepLabel.textContent = step.stepLabel || `Quick guide · ${guideStepIndex + 1} of ${ONBOARDING_GUIDE_STEPS.length}`;
  onboardingTitle.textContent = step.title;
  onboardingBody.innerHTML = step.bodyHtml;
  onboardingBackButton.hidden = onboardingStepIndex === 0;
  clearOnboardingLiveTargets();
  onboardingViewportTarget = null;
  onboardingViewportFollowsTarget = false;
  updateOnboardingStepControls(step);
  if (onboardingShell) {
    onboardingShell.dataset.target = onboardingShellTargetKey(step);
    onboardingShell.classList.toggle("is-welcome", Boolean(step.fullScreen));
  }

  const target = onboardingTargetElement(step);
  const viewportTarget = onboardingViewportBaseTarget(step);
  setOnboardingScrollLock(false);
  scrollOnboardingStepIntoView(step, target);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const currentStep = ONBOARDING_STEPS[onboardingStepIndex];
      setOnboardingViewportTarget(onboardingViewportBaseTarget(currentStep), false);
    });
  });
}

function closeOnboarding(markSeen = true) {
  if (!onboardingOverlay) {
    return;
  }

  onboardingAutoActionKey = "";
  onboardingDemoPlaybackId += 1;

  const shouldRestoreSpeciesFilter = Boolean(
    onboardingDemoSpeciesFilter
    && cleanText(state.speciesFilter).toLocaleLowerCase() === cleanText(onboardingDemoSpeciesFilter).toLocaleLowerCase(),
  );

  onboardingOverlay.hidden = true;
  hideOnboardingSpotlight();
  resetOnboardingCardPosition();
  onboardingShell?.classList.remove("is-welcome");
  onboardingViewportTarget = null;
  onboardingViewportFollowsTarget = false;
  setOnboardingScrollLock(false);
  clearOnboardingLiveTargets();
  if (shouldRestoreSpeciesFilter) {
    setSpeciesFilterValue(onboardingOriginalSpeciesFilter);
  }
  onboardingOriginalSpeciesFilter = "";
  onboardingDemoSpeciesFilter = "";
  if (markSeen) {
    markOnboardingSeen();
  }
}

function openOnboarding(stepIndex = 0) {
  if (!onboardingOverlay) {
    return;
  }

  onboardingAutoActionKey = "";
  onboardingDemoPlaybackId += 1;
  onboardingStepIndex = Math.max(0, Math.min(stepIndex, ONBOARDING_STEPS.length - 1));
  onboardingCompletedActions = new Set();
  onboardingOriginalSpeciesFilter = state.speciesFilter;
  onboardingDemoSpeciesFilter = "";
  hideRegionalHelp();
  onboardingOverlay.hidden = false;
  renderOnboardingStep();
}

function advanceOnboarding(stepOffset) {
  const nextIndex = onboardingStepIndex + stepOffset;
  if (nextIndex < 0) {
    return;
  }

  if (nextIndex >= ONBOARDING_STEPS.length) {
    closeOnboarding(true);
    return;
  }

  onboardingAutoActionKey = "";
  onboardingDemoPlaybackId += 1;
  onboardingStepIndex = nextIndex;
  renderOnboardingStep();
}

function setOnboardingDemoStatus(message, isError = false) {
  const status = onboardingBody?.querySelector("[data-onboarding-demo-status]");
  if (!status) {
    return;
  }

  status.textContent = message;
  status.classList.toggle("error", Boolean(isError));
}

function startOnboardingDemoPlayback() {
  onboardingDemoPlaybackId += 1;
  clearOnboardingLiveTargets();
  return onboardingDemoPlaybackId;
}

function onboardingDemoPlaybackActive(playbackId) {
  return playbackId === onboardingDemoPlaybackId && !onboardingOverlay?.hidden;
}

async function pauseOnboardingDemo(durationMs, playbackId) {
  await new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
  return onboardingDemoPlaybackActive(playbackId);
}

function setOnboardingLiveTarget(target) {
  clearOnboardingLiveTargets();
  if (!target) {
    setOnboardingViewportTarget(onboardingViewportBaseTarget(ONBOARDING_STEPS[onboardingStepIndex]), false);
    return;
  }

  target.classList.add(ONBOARDING_LIVE_TARGET_CLASS);
  target.scrollIntoView({ block: "center", inline: "nearest" });
  setOnboardingViewportTarget(target, true);
}

async function typeOnboardingInputValue(input, value, playbackId, stepDelayMs = 52) {
  input.focus();
  input.value = "";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await yieldToBrowser();

  for (const character of value) {
    if (!onboardingDemoPlaybackActive(playbackId)) {
      return false;
    }

    input.value += character;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await yieldToBrowser();

    if (!(await pauseOnboardingDemo(stepDelayMs, playbackId))) {
      return false;
    }
  }

  return onboardingDemoPlaybackActive(playbackId);
}

async function playOnboardingRemovalSelectionDemo() {
  const playbackId = startOnboardingDemoPlayback();

  setOnboardingDemoStatus("Loading Denmark so the live form uses the real country pack...");
  await ensureCountryLoaded("DNK");
  if (!onboardingDemoPlaybackActive(playbackId)) {
    return false;
  }

  setGroupFilterValue("needs_review");

  const removalEntry = findSpeciesEntry(
    ["african wild cat", "felis silvestris lybica"],
    () => true,
  );
  if (!removalEntry) {
    throw new Error("Could not find African wildcat in the Denmark pack.");
  }

  const removalOption = document
    .querySelector('input[name="suggestionType"][value="removal"]')
    ?.closest(".segment-option")
    ?.querySelector("span");
  if (!removalOption) {
    throw new Error("Could not find the Removal option in the live form.");
  }

  const currentSpeciesControl = document.querySelector("#current-species-combobox .combo-input-shell") || currentSpeciesField;
  const currentSpeciesGuideTarget = currentSpeciesToggle || currentSpeciesControl;

  onboardingDemoSpeciesFilter = "";
  setOnboardingLiveTarget(removalOption);
  setOnboardingDemoStatus("First, the guide zooms to the live Removal option...");
  if (!(await pauseOnboardingDemo(860, playbackId))) {
    return false;
  }

  removalOption.click();
  await yieldToBrowser();
  setOnboardingDemoStatus("Now switch the live form from Addition to Removal...");
  if (!(await pauseOnboardingDemo(700, playbackId))) {
    return false;
  }

  setOnboardingLiveTarget(currentSpeciesGuideTarget);
  setOnboardingDemoStatus("Next, the guide moves to Current species...");
  if (!(await pauseOnboardingDemo(720, playbackId))) {
    return false;
  }

  openComboBox("current");
  currentSpeciesInput.focus();
  currentSpeciesInput.select();
  await yieldToBrowser();
  setOnboardingDemoStatus("Open the Current species selector...");
  if (!(await pauseOnboardingDemo(560, playbackId))) {
    return false;
  }

  setOnboardingDemoStatus("Type african wild cat into the live selector...");
  if (!(await typeOnboardingInputValue(currentSpeciesInput, "african wild cat", playbackId, 96))) {
    return false;
  }

  openComboBox("current");
  await yieldToBrowser();
  const optionButton = currentSpeciesOptions.querySelector(`[data-item-id="${removalEntry.itemId}"]`);
  if (!optionButton) {
    throw new Error("Could not find African wildcat in the live selector results.");
  }

  setOnboardingLiveTarget(currentSpeciesGuideTarget);
  setOnboardingDemoStatus("Select African wildcat from the live results...");
  if (!(await pauseOnboardingDemo(620, playbackId))) {
    return false;
  }

  optionButton.click();
  await yieldToBrowser();
  if (!(await pauseOnboardingDemo(520, playbackId))) {
    return false;
  }

  setOnboardingLiveTarget(currentSpeciesGuideTarget);
  setOnboardingDemoStatus("African wildcat is now selected as the current species. The preview below updates automatically.");
  return true;
}

function setSuggestionTypeValue(type) {
  const input = document.querySelector(`input[name="suggestionType"][value="${type}"]`);
  if (!input) {
    return;
  }

  input.checked = true;
  handleSuggestionTypeChange();
}

function setScopeValue(scope) {
  if (scopeSelect.value === scope) {
    updateFormVisibility();
    clearTicketPreview();
    scheduleTicketPreviewRefresh();
    return;
  }

  scopeSelect.value = scope;
  updateFormVisibility();
  clearTicketPreview();
  scheduleTicketPreviewRefresh();
}

function setGroupFilterValue(groupKey) {
  state.groupFilter = groupKey;
  renderGroupChips();
  renderSpeciesList();
}

async function ensureCountryLoaded(iso3) {
  if (!iso3) {
    return;
  }

  if (countrySelect.value !== iso3 || state.currentCountry?.countryIso3 !== iso3) {
    const option = comboBoxes.country.options.find((candidate) => candidate.itemId === iso3);
    if (option) {
      setCountryValue(option.label, option.itemId);
    }
    await loadCountry(iso3);
  }
}

function speciesMatchesQuery(entry, query) {
  const value = sortKey(query);
  if (!value || !entry) {
    return false;
  }

  return [entry.label, entry.commonName, entry.binomial].some((candidate) => sortKey(candidate).includes(value));
}

function findSpeciesEntry(preferredQueries, predicate) {
  const species = state.currentCountry?.species || [];
  for (const query of preferredQueries) {
    const match = species.find((entry) => predicate(entry) && speciesMatchesQuery(entry, query));
    if (match) {
      return match;
    }
  }
  return species.find((entry) => predicate(entry)) || null;
}

function setSpeciesFilterValue(value) {
  speciesFilterInput.value = value;
  state.speciesFilter = value;
  renderSpeciesList();
}

function clickSpeciesCard(itemId) {
  const card = speciesList.querySelector(`[data-item-id="${itemId}"]`);
  if (!card) {
    return false;
  }

  card.click();
  return true;
}

function completeOnboardingAction(action) {
  if (!action) {
    return;
  }

  onboardingCompletedActions.add(action);
  updateOnboardingStepControls(ONBOARDING_STEPS[onboardingStepIndex]);
}

async function runOnboardingGuideAction(action) {
  const success = await runOnboardingDemo(action);
  if (success) {
    completeOnboardingAction(action);
  }
  return success;
}

async function handleOnboardingNext() {
  if (!onboardingIsOpen()) {
    return;
  }

  const step = ONBOARDING_STEPS[onboardingStepIndex];
  const nextAction = step?.nextAction || "";
  if (!nextAction || onboardingCompletedActions.has(nextAction)) {
    advanceOnboarding(1);
    return;
  }

  onboardingNextButton.disabled = true;
  onboardingBackButton.disabled = true;

  const success = await runOnboardingGuideAction(nextAction);
  if (!success) {
    onboardingNextButton.disabled = false;
    onboardingBackButton.disabled = false;
    return;
  }

  onboardingNextButton.disabled = false;
  onboardingBackButton.disabled = false;
}

async function loadOnboardingRemovalExample({ buildPreview = false } = {}) {
  await ensureCountryLoaded("DNK");
  setGroupFilterValue("needs_review");
  setSuggestionTypeValue("removal");

  const removalEntry = findSpeciesEntry(
    ["african wild cat", "felis silvestris lybica"],
    () => true,
  );

  if (!removalEntry) {
    throw new Error("Could not find African wildcat in the Denmark pack.");
  }

  onboardingDemoSpeciesFilter = "african wild cat";
  setSpeciesFilterValue("african wild cat");
  if (!clickSpeciesCard(removalEntry.itemId)) {
    applySpeciesSelection(removalEntry.itemId, true);
  }

  if (buildPreview) {
    await buildTicketPreview();
  }

  return removalEntry;
}

async function runOnboardingDemo(action) {
  try {
    if (action === "map-national") {
      setOnboardingDemoStatus("Searching Denmark for red deer and selecting it from the live list...");
      await ensureCountryLoaded("DNK");
      setGroupFilterValue("all");
      setSuggestionTypeValue("correction");
      setScopeValue("national");

      const nationalEntry = findSpeciesEntry(
        ["red deer", "cervus elaphus"],
        (entry) => entry.footprintCode === "countrywide",
      );

      if (!nationalEntry) {
        throw new Error("Could not find red deer in the Denmark pack.");
      }

      setSpeciesFilterValue("red deer");
      if (!clickSpeciesCard(nationalEntry.itemId)) {
        applySpeciesSelection(nationalEntry.itemId, true);
      }

      setOnboardingDemoStatus("Loaded red deer and switched the map to national coverage.");
      return true;
    }

    if (action === "map-regional") {
      setOnboardingDemoStatus("Searching Denmark for moose and selecting it from the live list...");
      await ensureCountryLoaded("DNK");
      setGroupFilterValue("all");
      setSuggestionTypeValue("correction");
      setScopeValue("regional");

      const regionalEntry = findSpeciesEntry(
        ["moose", "alces alces"],
        (entry) => entry.footprintCode === "regional",
      );

      if (!regionalEntry) {
        throw new Error("Could not find moose in the Denmark pack.");
      }

      setSpeciesFilterValue("moose");
      if (!clickSpeciesCard(regionalEntry.itemId)) {
        applySpeciesSelection(regionalEntry.itemId, true);
      }

      setOnboardingDemoStatus("Loaded moose and zoomed to the Lille Vildmose regional footprint. Press Next to continue.");
      return true;
    }

    if (action === "ticket-removal") {
      setOnboardingDemoStatus("Loading the Denmark African wildcat removal demo...");
      await loadOnboardingRemovalExample({ buildPreview: true });
      setOnboardingDemoStatus("Loaded Denmark + African wildcat and built the removal preview below.");
      return true;
    }

    if (action === "ticket-removal-select") {
      setOnboardingDemoStatus("Switching the live form to Removal and selecting African wildcat...");
      await loadOnboardingRemovalExample({ buildPreview: false });
      await yieldToBrowser();
      await yieldToBrowser();
      setOnboardingDemoStatus("Selected African wildcat as a live Removal example. Press Next to continue.");
      return true;
    }

    if (action === "ticket-removal-preview") {
      setOnboardingDemoStatus("Building the live removal preview...");
      await loadOnboardingRemovalExample({ buildPreview: true });
      setOnboardingDemoStatus("Built the African wildcat removal preview below.");
      return true;
    }

    if (action === "ticket-submit-email") {
      if (openTicketLink.classList.contains("disabled")) {
        throw new Error("Wait for the ticket preview to fill in first.");
      }

      clearOnboardingLiveTargets();
      openTicketLink.classList.add(ONBOARDING_LIVE_TARGET_CLASS);
      openTicketLink.scrollIntoView({ block: "center", inline: "nearest" });
      setOnboardingDemoStatus("Use Send Email below to open a prefilled mail draft.");
      return true;
    }

    if (action === "ticket-submit-github") {
      if (openGithubLink.classList.contains("disabled")) {
        throw new Error("Wait for the ticket preview to fill in first.");
      }

      clearOnboardingLiveTargets();
      openGithubLink.classList.add(ONBOARDING_LIVE_TARGET_CLASS);
      openGithubLink.scrollIntoView({ block: "center", inline: "nearest" });
      setOnboardingDemoStatus("Use Make GitHub Issue below to open a prefilled GitHub issue.");
      return true;
    }
  } catch (error) {
    console.error(error);
    setOnboardingDemoStatus(error.message || "Could not load the onboarding demo.", true);
    return false;
  }

  return false;
}

function normalizedScopeForSpecies(entry) {
  if (!entry) {
    return "";
  }

  if (entry.footprintCode === "countrywide") {
    return "national";
  }

  if (entry.footprintCode === "regional") {
    return "regional";
  }

  return "";
}

function currentPackHasSpecies(label, itemId = "") {
  const normalizedLabel = sortKey(label);
  return (state.currentCountry?.species || []).some((entry) => {
    if (itemId && entry.itemId === itemId) {
      return true;
    }
    return normalizedLabel && sortKey(entry.label) === normalizedLabel;
  });
}

function ticketBuildState() {
  if (!state.currentCountry) {
    return {
      canBuild: false,
      message: "Load a country pack to preview a ticket.",
    };
  }

  if (requestNotificationInput.checked) {
    const notificationEmail = cleanText(notificationEmailInput.value);
    if (!notificationEmail) {
      return {
        canBuild: false,
        message: "Add an email address to include notifications in the preview.",
      };
    }

    if (!NOTIFICATION_EMAIL_PATTERN.test(notificationEmail)) {
      return {
        canBuild: false,
        message: "Enter a valid notification email to preview the ticket.",
      };
    }
  }

  if (suggestionType() === "addition") {
    const proposedLabel = cleanText(proposedSpeciesInput.value);
    const proposedItemId = cleanText(proposedSpeciesItemIdInput.value);

    if (!proposedLabel) {
      return {
        canBuild: false,
        message: "Choose a species to preview the ticket.",
      };
    }

    if (currentPackHasSpecies(proposedLabel, proposedItemId)) {
      return {
        canBuild: false,
        message: "That species is already in the current pack. Use Correction or Removal instead.",
      };
    }

    if (scopeSelect.value === "regional" && !state.drawnPolygons.length) {
      return {
        canBuild: false,
        message: "Draw at least one regional area to preview the ticket.",
      };
    }

    return {
      canBuild: true,
      message: "The ticket preview updates automatically for this addition.",
    };
  }

  if (suggestionType() === "accept_new") {
    const currentEntry = currentSpeciesById(currentSpeciesItemIdInput.value);
    if (!currentEntry) {
      return {
        canBuild: false,
        message: "Choose a species from the current New list to preview the ticket.",
      };
    }

    if (!isNewDiscovery(currentEntry)) {
      return {
        canBuild: false,
        message: "Accept new only works for species currently marked New in this country.",
      };
    }

    return {
      canBuild: true,
      message: "The ticket preview updates automatically for this approval.",
    };
  }

  if (suggestionType() === "correction") {
    const currentEntry = currentSpeciesById(currentSpeciesItemIdInput.value);
    if (!currentEntry) {
      return {
        canBuild: false,
        message: "Choose a current species to preview the ticket.",
      };
    }

    if (scopeSelect.value === "regional" && !state.drawnPolygons.length) {
      return {
        canBuild: false,
        message: "Draw at least one regional area to preview the ticket.",
      };
    }

    const currentScope = normalizedScopeForSpecies(currentEntry);
    if (currentScope === scopeSelect.value) {
      if (scopeSelect.value === "regional" && state.drawnPolygons.length) {
        return {
          canBuild: true,
          message: "The ticket preview updates automatically for this regional correction.",
        };
      }

      return {
        canBuild: false,
        message: "Choose a different coverage or draw a new regional area to preview the ticket.",
      };
    }

    return {
      canBuild: true,
      message: "The ticket preview updates automatically for this correction.",
    };
  }

  if (!currentSpeciesById(currentSpeciesItemIdInput.value)) {
    return {
      canBuild: false,
      message: "Choose a current species to preview the ticket.",
    };
  }

  return {
    canBuild: true,
    message: "The ticket preview updates automatically for this removal.",
  };
}

function updateTicketPreviewGate() {
  const buildState = ticketBuildState();
  const hasPreview = Boolean(state.preview?.title || state.preview?.body);

  ticketPreviewPanel.classList.toggle("locked", !hasPreview);
  ticketPreviewGate.hidden = hasPreview;
  ticketPreviewGateMessage.textContent = buildState.message;
  renderAdminState();
}

function updateFormVisibility() {
  const type = suggestionType();
  const showCurrentSpecies = type !== "addition";
  const showProposedSpecies = type === "addition";
  const showScope = !["accept_new", "removal"].includes(type);
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
  updateTicketPreviewGate();
}

function syncCurrentSpeciesLookup() {
  const label = cleanText(currentSpeciesInput.value);
  const itemId = currentSpeciesLabelIndex.get(label) || "";
  currentSpeciesItemIdInput.value = itemId;
  state.highlightedSpeciesId = itemId;
  renderSpeciesList();
  updateSelectedRegionalLayers(false);
  clearTicketPreview();
  scheduleTicketPreviewRefresh();

  if (document.activeElement === currentSpeciesInput || isComboBoxOpen("current")) {
    openComboBox("current");
  }
}

function findCountryOptionByQuery(value) {
  const query = sortKey(value);
  if (!query) {
    return null;
  }

  return comboBoxes.country.options.find((option) => {
    if (sortKey(option.label) === query) {
      return true;
    }
    return (option.aliases || []).some((alias) => sortKey(alias) === query);
  }) || null;
}

function syncCountryLookup(commitSelection = false) {
  const comboIsOpen = isComboBoxOpen("country");

  if (document.activeElement === countryInput || comboIsOpen) {
    openComboBox("country");

    const exactMatch = findCountryOptionByQuery(countryInput.value);
    if (!commitSelection && exactMatch) {
      comboBoxes.country.highlightedItemId = exactMatch.itemId;
      renderComboOptions("country");
    }
  }

  if (!commitSelection) {
    return;
  }

  const match = findCountryOptionByQuery(countryInput.value);
  if (!match) {
    if (!comboIsOpen) {
      closeComboBox("country");
    }
    return;
  }

  const hasChanged = countrySelect.value !== match.itemId;
  setCountryValue(match.label, match.itemId);
  closeComboBox("country");
  if (hasChanged) {
    countrySelect.dispatchEvent(new Event("change"));
  }
}

function syncProposedSpeciesLookup() {
  const label = cleanText(proposedSpeciesInput.value);
  proposedSpeciesItemIdInput.value = animalLabelIndex.get(label) || "";
  clearTicketPreview();
  scheduleTicketPreviewRefresh();

  if (document.activeElement === proposedSpeciesInput || isComboBoxOpen("proposed")) {
    openComboBox("proposed");
  }
}

function clearTicketPreview() {
  cancelTicketPreviewRefresh();
  state.preview = null;
  ticketTitleInput.value = "";
  ticketBodyInput.value = "";
  ticketWarnings.hidden = true;
  ticketWarnings.innerHTML = "";
  copyMarkdownButton.disabled = true;
  openTicketLink.href = "#";
  openTicketLink.classList.add("disabled");
  openGithubLink.href = "#";
  openGithubLink.classList.add("disabled");
  updateTicketPreviewGate();
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

  updateTicketPreviewGate();
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
  clearDrawnPolygons(false);
  state.highlightedSpeciesId = "";

  try {
    const countryData = await loadCountryData(iso3);
    state.currentCountry = countryData;
    syncSuggestionTypeAvailability();
    updateCurrentSpeciesOptions();
    updateSuggestionGuidance();
    renderCountryHeader();
    renderGroupChips();
    renderSpeciesList();
    updateFormVisibility();
    updateMapSummary();
    clearTicketPreview();
    setStatus("Loading map overlay...");
    await loadRegionalOverlays();
    updateTicketPreviewGate();
    scheduleTicketPreviewRefresh();
    renderOnboardingStep();
    setStatus("Ready.");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not load country pack.", true);
  }
}

async function buildTicketPreview(options = {}) {
  const { announce = true, silentIncomplete = false } = options;
  const buildState = ticketBuildState();
  if (!buildState.canBuild) {
    clearTicketPreview();
    updateTicketPreviewGate();
    if (!silentIncomplete) {
      setStatus(buildState.message, true);
    }
    return false;
  }

  if (announce) {
    setStatus(state.preview ? "Updating ticket preview..." : "Building ticket...");
  }
  try {
    const preview = buildTicketPreviewData(buildTicketPayload());

    renderTicketPreview(preview);
    if (announce) {
      setStatus("Ticket ready.");
    }
    return true;
  } catch (error) {
    clearTicketPreview();
    setStatus(error.message || "Could not build ticket.", true);
    return false;
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
  updateTicketPreviewGate();
  renderAdminState();
  consumeAdminTokenHandoff();
  restorePersistedAdminSession();

  try {
    const [animals, countries] = await Promise.all([
      loadAnimalCatalog(),
      loadCountryCatalog(),
    ]);

    populateAnimalOptions(animals || []);
    populateCountrySelect(countries || []);
    updateStateFieldVisibility();
    await loadCountry(countrySelect.value);
    if (!hasSeenOnboarding()) {
      openOnboarding();
    }
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

  updateCurrentSpeciesOptions();

  updateFormVisibility();
  clearTicketPreview();
  scheduleTicketPreviewRefresh();
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
  const shortcutButton = event.target.closest("[data-admin-shortcut]");
  if (shortcutButton) {
    event.preventDefault();
    event.stopPropagation();
    void runAdminShortcutAction(shortcutButton.dataset.itemId, shortcutButton.dataset.adminShortcut);
    return;
  }

  const card = event.target.closest("[data-item-id]");
  if (!card) {
    return;
  }
  applySpeciesSelection(card.dataset.itemId, true);
});

countrySelect.addEventListener("change", () => {
  updateStateFieldVisibility();
  // If USA is selected and a state is already chosen, load that state pack
  const activeKey = (stateSelect.value && countrySelect.value === "USA") ? stateSelect.value : countrySelect.value;
  loadCountry(activeKey);
});

stateSelect.addEventListener("change", () => {
  const activeKey = stateSelect.value || "USA";
  loadCountry(activeKey);
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
    if (combo.showAllOnOpen) {
      requestAnimationFrame(() => {
        combo.input.select();
      });
    }
  });

  combo.input.addEventListener("click", () => {
    openComboBox(key);
    if (combo.showAllOnOpen) {
      requestAnimationFrame(() => {
        combo.input.select();
      });
    }
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

    if (event.key === "Enter" && isComboBoxOpen(key) && combo.highlightedItemId && (combo.keyboardMode || combo.strictSelection)) {
      event.preventDefault();
      selectComboOption(key, combo.highlightedItemId);
      return;
    }

    combo.keyboardMode = false;
  });

  const handleMenuSelection = (event) => {
    const option = event.target.closest("[data-item-id]");
    if (!option) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    selectComboOption(key, option.dataset.itemId);
  };

  combo.menu.addEventListener("pointerdown", handleMenuSelection);
  combo.menu.addEventListener("click", handleMenuSelection);
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
countryInput.addEventListener("input", () => {
  syncCountryLookup(false);
});
countryInput.addEventListener("change", () => {
  syncCountryLookup(true);
});

scopeSelect.addEventListener("change", () => {
  updateFormVisibility();
  clearTicketPreview();
  scheduleTicketPreviewRefresh();
});

proposedSpeciesInput.addEventListener("input", syncProposedSpeciesLookup);
requestNotificationInput.addEventListener("change", () => {
  updateNotificationPreference(true);
  clearTicketPreview();
  scheduleTicketPreviewRefresh();
});
notificationEmailInput.addEventListener("input", () => {
  clearTicketPreview();
  scheduleTicketPreviewRefresh();
});

clearDrawingButton.addEventListener("click", () => {
  clearDrawnPolygons();
});

dismissRegionalHelpButton?.addEventListener("click", () => {
  hideRegionalHelp();
});

openOnboardingButton?.addEventListener("click", () => {
  openOnboarding();
});

onboardingBackButton?.addEventListener("click", () => {
  advanceOnboarding(-1);
});

onboardingNextButton?.addEventListener("click", () => {
  void handleOnboardingNext();
});

onboardingSkipButton?.addEventListener("click", () => {
  closeOnboarding(true);
});

onboardingBody?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-demo-action]");
  if (!button) {
    return;
  }

  event.preventDefault();
  const action = button.dataset.demoAction || "";
  void (async () => {
    await runOnboardingGuideAction(action);
  })();
});

ticketForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await buildTicketPreview({ announce: true, silentIncomplete: false });
});

copyMarkdownButton.addEventListener("click", async () => {
  await copyMarkdownPreview();
});

adminConnectButton?.addEventListener("click", () => {
  void connectAdminSession();
});

adminDisconnectButton?.addEventListener("click", () => {
  disconnectAdminSession();
});

adminApplyButton?.addEventListener("click", () => {
  void applyAdminChanges();
});

window.addEventListener("resize", () => {
  if (reviewMap) {
    reviewMap.invalidateSize();
  }

  if (onboardingIsOpen()) {
    refreshOnboardingViewportState(onboardingViewportTarget || onboardingViewportBaseTarget(ONBOARDING_STEPS[onboardingStepIndex]));
  }

  if (openComboKey) {
    updateComboBoxLayout(openComboKey);
  }
});

window.addEventListener("scroll", () => {
  if (onboardingIsOpen()) {
    refreshOnboardingViewportState(onboardingViewportTarget || onboardingViewportBaseTarget(ONBOARDING_STEPS[onboardingStepIndex]));
  }

  if (openComboKey) {
    updateComboBoxLayout(openComboKey);
  }
}, true);

document.addEventListener("keydown", (event) => {
  if (!onboardingIsOpen()) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
  }
});

initialize();