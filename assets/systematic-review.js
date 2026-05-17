const DEFAULT_GITHUB_REPO = "HugoMarkoff/animal_detect_geofence";
const DEFAULT_GITHUB_BRANCH = "main";
const GITHUB_API_ROOT = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const ASSET_VERSION = "20260517e";
const POINTER_DRAG_THRESHOLD_PX = 8;
const SYSTEMATIC_DATA_ROOT = "../data/systematic-review";
const COUNTRY_INDEX_PATH = "../data/precomputed-countries/index.json";
const SYSTEMATIC_REVIEW_PROPOSALS_PATH = "data/systematic-review/proposals.json";
const SYSTEMATIC_REVIEW_LOG_PATH = "data/systematic-review/log.json";
const ADMIN_GEOFENCE_TRACKING_PATH = "data/review-overrides/geofence-binary-overrides.json";
const ADMIN_CHANGE_LOG_PATH = "data/review-overrides/change-log.json";
const COUNTRY_OVERRIDE_ROOT = "data/review-overrides/countries";
const ADMIN_TOKEN_HANDOFF_KEY = "country-pack-review-admin-token-handoff-20260507a";
const ADMIN_SESSION_TOKEN_KEY = "country-pack-review-admin-session-token-20260507a";
const ADMIN_PERSISTENT_TOKEN_KEY = "country-pack-review-admin-persistent-token-20260507a";
const GEOFENCE_TRACKING_SCHEMA_VERSION = 1;
const CHANGE_LOG_SCHEMA_VERSION = 1;
const GITHUB_BLOB_WRITE_CONCURRENCY = 8;
const numberFormat = new Intl.NumberFormat();

const state = {
  rankings: [],
  issues: [],
  proposalsPayload: {
    schemaVersion: 1,
    updatedAtUtc: null,
    issues: [],
  },
  logPayload: {
    schemaVersion: 1,
    updatedAtUtc: null,
    entries: [],
  },
  flaggedByItem: {},
  catalogById: new Map(),
  selectedItemId: "",
  selectedDetail: null,
  countries: [],
  countryByIso: new Map(),
  countryByName: new Map(),
  bucketDraft: {
    keep: [],
    remove: [],
    add: [],
  },
  activeAddBucket: null,
  draggedCountry: null,
  pointerDrag: null,
  hasUnsavedDraft: false,
  settings: {
    defaultReviewer: "github-review",
  },
  admin: {
    token: "",
    login: "",
    canWrite: false,
    permissionLabel: "",
    isConnecting: false,
    isApplying: false,
    lastCommitUrl: "",
    message: "",
    messageIsError: false,
  },
};

const elements = {
  reviewWorkspace: document.querySelector(".review-workspace"),
  reviewQueuePanel: document.querySelector(".review-queue-panel"),
  reviewDetailPanel: document.querySelector(".review-detail-panel"),
  queueSummary: document.querySelector("#queue-summary"),
  reviewQueue: document.querySelector("#review-queue"),
  issueTitle: document.querySelector("#issue-title"),
  issueStatus: document.querySelector("#issue-status"),
  issueSummary: document.querySelector("#issue-summary"),
  flaggedCount: document.querySelector("#flagged-count"),
  keepCount: document.querySelector("#keep-count"),
  removeCount: document.querySelector("#remove-count"),
  addCount: document.querySelector("#add-count"),
  researchSummary: document.querySelector("#research-summary"),
  evidenceList: document.querySelector("#evidence-list"),
  ebirdSpeciesCode: document.querySelector("#ebird-species-code"),
  ebirdSpeciesName: document.querySelector("#ebird-species-name"),
  inatObservations: document.querySelector("#inat-observations"),
  inatTaxon: document.querySelector("#inat-taxon"),
  gbifTaxonomy: document.querySelector("#gbif-taxonomy"),
  gbifTopCountries: document.querySelector("#gbif-top-countries"),
  keepHeadCount: document.querySelector("#keep-head-count"),
  removeHeadCount: document.querySelector("#remove-head-count"),
  addHeadCount: document.querySelector("#add-head-count"),
  keepAddRow: document.querySelector("#keep-add-row"),
  removeAddRow: document.querySelector("#remove-add-row"),
  addAddRow: document.querySelector("#add-add-row"),
  keepCountries: document.querySelector("#keep-countries"),
  removeCountries: document.querySelector("#remove-countries"),
  addCountries: document.querySelector("#add-countries"),
  countryOptions: document.querySelector("#country-options"),
  reviewer: document.querySelector("#reviewer"),
  decisionNote: document.querySelector("#decision-note"),
  saveDraft: document.querySelector("#save-draft"),
  acceptIssue: document.querySelector("#accept-issue"),
  rejectIssue: document.querySelector("#reject-issue"),
  decisionStatus: document.querySelector("#decision-status"),
  adminPanel: document.querySelector("#admin-panel"),
  adminTokenField: document.querySelector("#admin-token-field"),
  adminTokenInput: document.querySelector("#admin-token"),
  adminConnectButton: document.querySelector("#admin-connect"),
  adminDisconnectButton: document.querySelector("#admin-disconnect"),
  adminLastCommitLink: document.querySelector("#admin-last-commit"),
  adminAuthStatus: document.querySelector("#admin-auth-status"),
};

let reviewStageSyncFrame = 0;
let reviewStageResizeObserver = null;
const reviewStageBreakpoint = window.matchMedia("(max-width: 1180px)");

function cleanText(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function withVersion(path) {
  return `${path}${path.includes("?") ? "&" : "?"}v=${ASSET_VERSION}`;
}

function formatCount(value) {
  return numberFormat.format(Number(value || 0));
}

function nowUtcIso() {
  return new Date().toISOString();
}

function statusClass(status) {
  const normalized = String(status || "unseeded").toLowerCase();
  if (["pending", "accepted", "rejected", "unseeded"].includes(normalized)) {
    return normalized;
  }
  return "unseeded";
}

function statusLabel(status) {
  const normalized = String(status || "unseeded").toLowerCase();
  if (normalized === "accepted") {
    return "Accepted";
  }
  if (normalized === "rejected") {
    return "Rejected";
  }
  if (normalized === "pending") {
    return "Pending";
  }
  return "Unseeded";
}

function hasReviewAccess() {
  return Boolean(state.admin.login && state.admin.canWrite);
}

function bucketLabel(bucket) {
  if (bucket === "keep") {
    return "Move to Keep";
  }
  if (bucket === "remove") {
    return "Move to Remove";
  }
  if (bucket === "add") {
    return "Move to Add";
  }
  return String(bucket || "");
}

function setDecisionStatus(message, isError = false) {
  elements.decisionStatus.textContent = message;
  elements.decisionStatus.classList.toggle("error", Boolean(isError));
}

function normalizeCountries(countries) {
  return [...countries].sort((left, right) => {
    const leftName = String(left.countryName || left.iso3 || "").toLowerCase();
    const rightName = String(right.countryName || right.iso3 || "").toLowerCase();
    return leftName.localeCompare(rightName) || String(left.iso3 || "").localeCompare(String(right.iso3 || ""));
  });
}

function normalizeCountryCodes(rawCodes) {
  if (!Array.isArray(rawCodes)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];
  for (const value of rawCodes) {
    const iso3 = cleanText(value).toUpperCase();
    if (iso3.length !== 3 || seen.has(iso3)) {
      continue;
    }
    seen.add(iso3);
    normalized.push(iso3);
  }
  return normalized;
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

function buildCountryDescriptors(countryCodes) {
  return normalizeCountries(
    normalizeCountryCodes(countryCodes).map((iso3) => {
      const country = state.countryByIso.get(iso3);
      return {
        iso3,
        countryName: cleanText(country?.countryName) || iso3,
      };
    }),
  );
}

function proposalIndex() {
  return new Map(
    (Array.isArray(state.proposalsPayload?.issues) ? state.proposalsPayload.issues : [])
      .map((issue) => [cleanText(issue?.itemId), issue])
      .filter(([itemId]) => itemId),
  );
}

function currentExpectedCountriesForItem(itemId) {
  const animal = state.catalogById.get(itemId) || {};
  return normalizeCountryCodes(animal.expectedCountries);
}

function flaggedReviewCountriesForItem(itemId) {
  return normalizeCountryCodes(state.flaggedByItem[itemId] || []);
}

function reviewScopeCountriesForItem(itemId) {
  const currentExpected = currentExpectedCountriesForItem(itemId);
  const currentExpectedSet = new Set(currentExpected);
  const flagged = flaggedReviewCountriesForItem(itemId).filter((iso3) => currentExpectedSet.has(iso3));
  return flagged.length ? flagged : currentExpected;
}

function normalizeSystematicCountryPlan(itemId, keepCountries, removeCountries, addCountries) {
  const allowedCountries = new Set(state.countries.map((country) => country.iso3));
  const currentExpected = new Set(currentExpectedCountriesForItem(itemId));
  const reviewScope = new Set(reviewScopeCountriesForItem(itemId));
  const keepSet = new Set(normalizeCountryCodes(keepCountries).filter((iso3) => allowedCountries.has(iso3)));
  const removeSet = new Set(normalizeCountryCodes(removeCountries).filter((iso3) => allowedCountries.has(iso3)));
  const addSet = new Set(normalizeCountryCodes(addCountries).filter((iso3) => allowedCountries.has(iso3)));

  const invalidKeep = [...keepSet].filter((iso3) => !reviewScope.has(iso3)).sort();
  const invalidRemove = [...removeSet].filter((iso3) => !reviewScope.has(iso3)).sort();
  const invalidAdd = [...addSet].filter((iso3) => currentExpected.has(iso3)).sort();

  if (invalidKeep.length) {
    throw new Error(`Keep only accepts countries currently flagged for review. Invalid keep countries: ${invalidKeep.slice(0, 6).join(", ")}.`);
  }

  if (invalidRemove.length) {
    throw new Error(`Remove only accepts countries currently flagged for review. Invalid remove countries: ${invalidRemove.slice(0, 6).join(", ")}.`);
  }

  if (invalidAdd.length) {
    throw new Error(`Add only accepts countries outside the current expected list. Invalid add countries: ${invalidAdd.slice(0, 6).join(", ")}.`);
  }

  for (const iso3 of [...addSet]) {
    if (currentExpected.has(iso3)) {
      addSet.delete(iso3);
    }
  }

  for (const iso3 of [...keepSet]) {
    if (!reviewScope.has(iso3)) {
      keepSet.delete(iso3);
    }
  }

  for (const iso3 of [...removeSet]) {
    if (!reviewScope.has(iso3)) {
      removeSet.delete(iso3);
    }
  }

  if (keepSet.size) {
    for (const iso3 of reviewScope) {
      if (!keepSet.has(iso3)) {
        removeSet.add(iso3);
      }
    }
  }

  for (const iso3 of removeSet) {
    addSet.delete(iso3);
  }

  const normalizedKeep = [...reviewScope].filter((iso3) => !removeSet.has(iso3)).sort();
  return {
    keepCountries: normalizedKeep,
    removeCountries: [...removeSet].sort(),
    addCountries: [...addSet].filter((iso3) => !currentExpected.has(iso3)).sort(),
  };
}

function deriveSystematicCountryPlan(itemId, issue) {
  const currentExpected = currentExpectedCountriesForItem(itemId);
  const proposal = issue && typeof issue === "object" ? issue.proposal || {} : {};
  const keepCountries = new Set(normalizeCountryCodes(proposal.keepCountries));
  const removeCountries = new Set(normalizeCountryCodes(proposal.removeCountries));
  const addCountries = new Set(normalizeCountryCodes(proposal.addCountries));
  const currentExpectedSet = new Set(currentExpected);
  const reviewScope = new Set(reviewScopeCountriesForItem(itemId));

  for (const iso3 of [...keepCountries]) {
    if (!reviewScope.has(iso3)) {
      keepCountries.delete(iso3);
    }
  }

  for (const iso3 of [...removeCountries]) {
    if (!reviewScope.has(iso3)) {
      removeCountries.delete(iso3);
    }
  }

  if (keepCountries.size) {
    for (const iso3 of reviewScope) {
      if (!keepCountries.has(iso3)) {
        removeCountries.add(iso3);
      }
    }
  }

  for (const iso3 of addCountries) {
    removeCountries.delete(iso3);
  }

  const derivedKeep = [...reviewScope].filter((iso3) => !removeCountries.has(iso3));
  return {
    currentExpectedCountries: currentExpected,
    reviewScopeCountries: [...reviewScope].sort(),
    implicitKeepCountries: [...currentExpectedSet].filter((iso3) => !reviewScope.has(iso3)).sort(),
    keepCountries: derivedKeep.sort(),
    removeCountries: [...removeCountries].sort(),
    addCountries: [...addCountries].filter((iso3) => !currentExpectedSet.has(iso3)).sort(),
  };
}

function buildSystematicReviewSummary(itemId) {
  const ranking = state.rankings.find((entry) => entry.itemId === itemId) || null;
  const proposal = proposalIndex().get(itemId) || null;
  const animal = state.catalogById.get(itemId) || null;
  const currentExpected = currentExpectedCountriesForItem(itemId);
  const reviewScope = reviewScopeCountriesForItem(itemId);

  if (!ranking && !proposal && !animal) {
    return null;
  }

  const fallback = cleanText(ranking?.commonName) || cleanText(ranking?.binomial) || itemId;
  const summary = {
    rank: ranking?.rank || 0,
    itemId,
    commonName: cleanText(animal?.commonName) || cleanText(ranking?.commonName),
    binomial: cleanText(animal?.binomial) || cleanText(ranking?.binomial),
    label: speciesLabel(animal, fallback),
    countryCount: reviewScope.length || Number(ranking?.countryCount || 0),
    proposalReady: Boolean(proposal),
    status: cleanText(proposal?.status) || (proposal ? "pending" : "unseeded"),
    proposalSummary: cleanText(proposal?.proposalSummary),
    currentExpectedCountryCount: currentExpected.length,
    reviewScopeCountryCount: reviewScope.length,
    implicitKeepCountryCount: Math.max(0, currentExpected.length - reviewScope.length),
    proposedKeepCount: 0,
    proposedRemoveCount: 0,
    proposedAddCount: 0,
  };

  if (proposal) {
    const plan = deriveSystematicCountryPlan(itemId, proposal);
    summary.proposedKeepCount = plan.keepCountries.length;
    summary.proposedRemoveCount = plan.removeCountries.length;
    summary.proposedAddCount = plan.addCountries.length;
  }

  return summary;
}

function buildSystematicReviewQueue(includeResolved = false) {
  const queue = state.rankings.map((entry) => buildSystematicReviewSummary(entry.itemId)).filter(Boolean);
  if (includeResolved) {
    return queue;
  }
  return queue.filter((entry) => !["accepted", "rejected"].includes(entry.status));
}

function buildSystematicReviewDetail(itemId) {
  const summary = buildSystematicReviewSummary(itemId);
  const proposal = proposalIndex().get(itemId) || null;
  if (!summary) {
    return null;
  }

  const plan = deriveSystematicCountryPlan(itemId, proposal);
  const evidence = proposal && typeof proposal === "object" ? proposal.evidence || {} : {};

  let autoSeedNote = "";
  if (plan.reviewScopeCountries.length && !plan.keepCountries.length && !plan.addCountries.length) {
    if (!Boolean(proposal?.gbifPlanTrusted)) {
      autoSeedNote = "No trusted keep/add countries were seeded automatically for this issue. The current draft leaves every flagged country in remove until a reviewer moves supported countries back into keep or add.";
    } else {
      autoSeedNote = "This draft currently keeps no flagged countries. Accepting it would remove the species from every flagged review country unless you move supported countries back into keep or add.";
    }
  }

  let reviewScopeNote = "";
  if (plan.implicitKeepCountries.length) {
    reviewScopeNote = `This pass only edits the ${plan.reviewScopeCountries.length} countries currently flagged as Needs Review. Another ${plan.implicitKeepCountries.length} currently expected countries were not flagged and stay outside this bucket review.`;
  }

  return {
    summary,
    status: cleanText(proposal?.status) || "unseeded",
    editable: !["accepted", "rejected"].includes(cleanText(proposal?.status)),
    proposalSummary: cleanText(proposal?.proposalSummary) || defaultSystematicProposalSummary(itemId),
    researchSummary: cleanText(proposal?.researchSummary) || defaultSystematicResearchSummary(itemId),
    proposalReason: cleanText(proposal?.proposal?.reason) || defaultSystematicProposalReason(),
    evidenceSummary: Array.isArray(evidence?.summary) ? evidence.summary.map((line) => cleanText(line)).filter(Boolean) : [],
    autoSeedNote,
    reviewScopeNote,
    ebird: evidence?.ebird || {},
    inat: evidence?.inat || {},
    gbif: evidence?.gbif || {},
    countries: {
      currentExpected: buildCountryDescriptors(plan.currentExpectedCountries),
      reviewScope: buildCountryDescriptors(plan.reviewScopeCountries),
      implicitKeep: buildCountryDescriptors(plan.implicitKeepCountries),
      keep: buildCountryDescriptors(plan.keepCountries),
      remove: buildCountryDescriptors(plan.removeCountries),
      add: buildCountryDescriptors(plan.addCountries),
    },
  };
}

function hydrateDraftFromDetail(detail) {
  state.selectedDetail = detail;
  state.bucketDraft = {
    keep: normalizeCountries([...(detail?.countries?.keep || [])]),
    remove: normalizeCountries([...(detail?.countries?.remove || [])]),
    add: normalizeCountries([...(detail?.countries?.add || [])]),
  };
}

function updateCountryOptions() {
  elements.countryOptions.innerHTML = state.countries
    .map((country) => `<option value="${escapeHtml(country.iso3)}">${escapeHtml(country.countryName)}</option>`)
    .join("");
}

function draftCountryIsoSet() {
  return new Set([
    ...state.bucketDraft.keep.map((country) => country.iso3),
    ...state.bucketDraft.remove.map((country) => country.iso3),
    ...state.bucketDraft.add.map((country) => country.iso3),
  ]);
}

function currentExpectedIsoSet() {
  return new Set((state.selectedDetail?.countries?.currentExpected || []).map((country) => country.iso3));
}

function reviewScopeIsoSet() {
  return new Set((state.selectedDetail?.countries?.reviewScope || []).map((country) => country.iso3));
}

function candidateCountriesForBucket(bucket) {
  const assigned = draftCountryIsoSet();
  const currentExpected = currentExpectedIsoSet();
  const reviewScope = reviewScopeIsoSet();

  if (bucket === "add") {
    return state.countries.filter((country) => !currentExpected.has(country.iso3) && !assigned.has(country.iso3));
  }

  return state.countries.filter((country) => reviewScope.has(country.iso3) && !state.bucketDraft[bucket].some((entry) => entry.iso3 === country.iso3));
}

function resolveCountryValue(value) {
  const normalized = cleanText(value);
  if (!normalized) {
    return null;
  }

  const exactIso = state.countryByIso.get(normalized.toUpperCase());
  if (exactIso) {
    return exactIso;
  }

  const exactName = state.countryByName.get(normalized.toLowerCase());
  if (exactName) {
    return exactName;
  }

  return null;
}

function findCountryInDraft(iso3) {
  for (const bucket of ["keep", "remove", "add"]) {
    const found = state.bucketDraft[bucket].find((country) => country.iso3 === iso3);
    if (found) {
      return found;
    }
  }
  return state.countryByIso.get(iso3) || null;
}

function incompatibleBucketMessage(iso3, targetBucket) {
  const currentExpected = currentExpectedIsoSet();
  const reviewScope = reviewScopeIsoSet();
  const isReviewScopeCountry = reviewScope.has(iso3);

  if (currentExpected.has(iso3) && targetBucket === "add") {
    return "Add is only for countries outside the current expected list. Flagged review countries can move only between Keep and Remove.";
  }

  if (!isReviewScopeCountry && targetBucket !== "add") {
    return "Only countries currently flagged for review belong in Keep or Remove. Countries outside that flagged set can only go into Add.";
  }

  return "";
}

function moveCountryToBucket(iso3, targetBucket) {
  const country = findCountryInDraft(iso3);
  if (!country || !["keep", "remove", "add"].includes(targetBucket)) {
    return false;
  }

  for (const bucket of ["keep", "remove", "add"]) {
    state.bucketDraft[bucket] = state.bucketDraft[bucket].filter((entry) => entry.iso3 !== iso3);
  }

  state.bucketDraft[targetBucket] = normalizeCountries([...state.bucketDraft[targetBucket], country]);
  state.hasUnsavedDraft = true;
  return true;
}

function availableMoveTargetsForCountry(iso3, currentBucket) {
  return ["keep", "remove", "add"].filter((targetBucket) => {
    return targetBucket !== currentBucket && !incompatibleBucketMessage(iso3, targetBucket);
  });
}

function applyCountryMove(iso3, targetBucket, options = {}) {
  const { closeAddRow = false } = options;
  const incompatibleMessage = incompatibleBucketMessage(iso3, targetBucket);
  if (incompatibleMessage) {
    setDecisionStatus(incompatibleMessage, true);
    return false;
  }

  if (!moveCountryToBucket(iso3, targetBucket)) {
    setDecisionStatus("That country could not be moved.", true);
    return false;
  }

  if (closeAddRow) {
    state.activeAddBucket = null;
  }

  renderDetail(state.selectedDetail);
  const country = state.countryByIso.get(iso3);
  setDecisionStatus(localDraftStatusMessage(`Moved ${country?.countryName || iso3} into ${targetBucket}.`));
  return true;
}

function renderCountryPills(container, countries, emptyText, editable) {
  const bucket = container.dataset.bucket;
  if (!countries.length) {
    container.innerHTML = `<p class="empty-inline">${escapeHtml(emptyText)}</p>`;
    return;
  }

  container.innerHTML = countries
    .map((country) => {
      const moveTargets = editable ? availableMoveTargetsForCountry(country.iso3, bucket) : [];
      return `
        <div
          class="country-pill country-pill-card"
          draggable="${editable}"
          data-country-iso3="${escapeHtml(country.iso3)}"
          data-bucket="${escapeHtml(bucket)}"
        >
          <span class="country-pill-copy">
            <strong>${escapeHtml(country.iso3)}</strong>
            <span>${escapeHtml(country.countryName)}</span>
          </span>
          ${moveTargets.length ? `
            <span class="country-pill-actions">
              ${moveTargets
                .map(
                  (targetBucket) => `
                    <button
                      type="button"
                      class="country-pill-move"
                      data-country-move-iso3="${escapeHtml(country.iso3)}"
                      data-country-move-target="${escapeHtml(targetBucket)}"
                    >${escapeHtml(bucketLabel(targetBucket))}</button>
                  `,
                )
                .join("")}
            </span>
          ` : ""}
        </div>
      `;
    })
    .join("");
}

function renderBucketAddRows(editable) {
  const buckets = [
    ["keep", elements.keepAddRow],
    ["remove", elements.removeAddRow],
    ["add", elements.addAddRow],
  ];

  for (const [bucket, container] of buckets) {
    const isOpen = editable && state.activeAddBucket === bucket;
    container.hidden = !isOpen;
    if (!isOpen) {
      container.innerHTML = "";
      continue;
    }

    const candidates = candidateCountriesForBucket(bucket);
    const placeholder = bucket === "add"
      ? "Type ISO3 or country name to add"
      : `Type ISO3 or country name to move into ${bucket}`;

    container.innerHTML = `
      <input
        class="bucket-add-input"
        data-bucket-input="${bucket}"
        list="country-options"
        placeholder="${escapeHtml(placeholder)}"
      >
      <button type="button" data-bucket-confirm="${bucket}">Add</button>
      <button type="button" class="secondary-button" data-bucket-cancel="${bucket}">Cancel</button>
      <p class="bucket-add-hint">${escapeHtml(formatCount(candidates.length))} candidates available.</p>
    `;
  }

  if (state.activeAddBucket) {
    const input = document.querySelector(`[data-bucket-input="${state.activeAddBucket}"]`);
    if (input) {
      requestAnimationFrame(() => input.focus());
    }
  }
}

function renderEvidenceList(lines) {
  if (!lines.length) {
    elements.evidenceList.innerHTML = "<li>No evidence summary saved yet.</li>";
    return;
  }

  elements.evidenceList.innerHTML = lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
}

function canEditLocalDraft() {
  return hasReviewAccess() && Boolean(state.selectedDetail?.editable) && !state.admin.isApplying;
}

function localDraftStatusMessage(actionMessage) {
  return `${actionMessage} Accept And Apply to commit.`;
}

function bucketContainerFor(bucket) {
  if (bucket === "keep") {
    return elements.keepCountries;
  }
  if (bucket === "remove") {
    return elements.removeCountries;
  }
  if (bucket === "add") {
    return elements.addCountries;
  }
  return null;
}

function clearBucketDropTargets() {
  [elements.keepCountries, elements.removeCountries, elements.addCountries].forEach((container) => {
    container?.classList.remove("drag-target");
  });
}

function dropBucketFromPoint(clientX, clientY) {
  return document.elementFromPoint(clientX, clientY)?.closest(".country-pill-grid[data-bucket]")?.dataset.bucket || "";
}

function clearPointerDragState() {
  if (state.pointerDrag?.element) {
    state.pointerDrag.element.classList.remove("dragging");
  }
  document.body.classList.remove("review-pointer-dragging");
  clearBucketDropTargets();
  state.pointerDrag = null;
}

function syncReviewStageHeight() {
  if (!elements.reviewWorkspace || !elements.reviewQueuePanel || !elements.reviewDetailPanel) {
    return;
  }

  if (reviewStageBreakpoint.matches) {
    elements.reviewWorkspace.style.removeProperty("--review-stage-height");
    return;
  }

  const detailHeight = Math.ceil(elements.reviewDetailPanel.getBoundingClientRect().height);
  if (!detailHeight) {
    elements.reviewWorkspace.style.removeProperty("--review-stage-height");
    return;
  }

  elements.reviewWorkspace.style.setProperty("--review-stage-height", `${detailHeight}px`);
}

function scheduleReviewStageHeightSync() {
  if (reviewStageSyncFrame) {
    cancelAnimationFrame(reviewStageSyncFrame);
  }

  reviewStageSyncFrame = requestAnimationFrame(() => {
    reviewStageSyncFrame = 0;
    syncReviewStageHeight();
  });
}

function setupReviewStageSync() {
  if (!elements.reviewWorkspace || !elements.reviewQueuePanel || !elements.reviewDetailPanel) {
    return;
  }

  if ("ResizeObserver" in window) {
    reviewStageResizeObserver?.disconnect();
    reviewStageResizeObserver = new ResizeObserver(() => {
      scheduleReviewStageHeightSync();
    });
    reviewStageResizeObserver.observe(elements.reviewDetailPanel);
  }

  window.addEventListener("resize", scheduleReviewStageHeightSync, { passive: true });
  if (reviewStageBreakpoint.addEventListener) {
    reviewStageBreakpoint.addEventListener("change", scheduleReviewStageHeightSync);
  } else {
    reviewStageBreakpoint.addListener(scheduleReviewStageHeightSync);
  }

  scheduleReviewStageHeightSync();
}

function renderQueue() {
  elements.queueSummary.textContent = `${formatCount(state.issues.length)} active ranked issues loaded from the 248-country needs-review report.`;

  if (!state.issues.length) {
    elements.reviewQueue.innerHTML = '<article class="empty-card">No systematic-review issues found.</article>';
    return;
  }

  elements.reviewQueue.innerHTML = state.issues
    .map((issue) => {
      const isSelected = issue.itemId === state.selectedItemId;
      const summary = issue.proposalSummary || "No curated proposal yet for this issue.";
      return `
        <button type="button" class="species-card review-issue-card ${isSelected ? "selected" : ""}" data-item-id="${escapeHtml(issue.itemId)}">
          <div class="species-card-main">
            <div>
              <strong>${escapeHtml(issue.label)}</strong>
              <em>#${formatCount(issue.rank)} in the 248-country queue</em>
            </div>
            <span class="status-pill ${statusClass(issue.status)}">${escapeHtml(statusLabel(issue.status))}</span>
          </div>
          <div class="issue-metrics">
            <span class="badge badge-bucket">${formatCount(issue.countryCount)} flagged</span>
            ${issue.proposalReady ? `<span class="badge badge-footprint">${formatCount(issue.proposedRemoveCount)} remove</span>` : '<span class="badge">Unseeded</span>'}
            ${issue.proposalReady ? `<span class="badge badge-footprint">${formatCount(issue.proposedKeepCount)} keep</span>` : ""}
            ${issue.proposalReady && issue.proposedAddCount ? `<span class="badge badge-footprint">${formatCount(issue.proposedAddCount)} add</span>` : ""}
          </div>
          <p class="queue-meta">${escapeHtml(summary)}</p>
        </button>
      `;
    })
    .join("");

  scheduleReviewStageHeightSync();
}

function renderDetail(detail) {
  state.selectedDetail = detail;
  const summary = detail.summary || {};
  const keepCountries = state.bucketDraft.keep;
  const removeCountries = state.bucketDraft.remove;
  const addCountries = state.bucketDraft.add;
  const topGbifCountries = Array.isArray(detail.gbif?.countryCounts)
    ? detail.gbif.countryCounts.slice(0, 6).map((entry) => `${entry.iso3} ${formatCount(entry.count)}`).join(", ")
    : "";
  const accessGranted = hasReviewAccess();
  const editable = Boolean(detail.editable) && accessGranted && !state.admin.isApplying;

  elements.issueTitle.textContent = summary.label || "Unknown issue";
  elements.issueStatus.className = `status-pill ${statusClass(detail.status)}`;
  elements.issueStatus.textContent = statusLabel(detail.status);
  const proposalSummary = detail.proposalSummary || "No proposal summary saved yet.";
  elements.issueSummary.textContent = detail.reviewScopeNote ? `${proposalSummary} ${detail.reviewScopeNote}` : proposalSummary;
  elements.flaggedCount.textContent = formatCount(summary.countryCount);
  elements.keepCount.textContent = formatCount(keepCountries.length);
  elements.removeCount.textContent = formatCount(removeCountries.length);
  elements.addCount.textContent = formatCount(addCountries.length);
  elements.keepHeadCount.textContent = `${formatCount(keepCountries.length)} countries`;
  elements.removeHeadCount.textContent = `${formatCount(removeCountries.length)} countries`;
  elements.addHeadCount.textContent = `${formatCount(addCountries.length)} countries`;
  const researchSummary = detail.researchSummary || "No research summary saved yet.";
  elements.researchSummary.textContent = detail.autoSeedNote ? `${researchSummary} ${detail.autoSeedNote}` : researchSummary;
  renderEvidenceList(detail.evidenceSummary || []);

  elements.ebirdSpeciesCode.textContent = detail.ebird?.speciesCode || "-";
  elements.ebirdSpeciesName.textContent = detail.ebird?.commonName
    ? `${detail.ebird.commonName}${detail.ebird?.scientificName ? ` (${detail.ebird.scientificName})` : ""}`
    : detail.ebird?.scientificName || "No eBird species recorded.";
  elements.inatObservations.textContent = formatCount(detail.inat?.observationsCount);
  elements.inatTaxon.textContent = detail.inat?.taxonId ? `Taxon ${detail.inat.taxonId}` : "No iNaturalist taxon recorded.";
  elements.gbifTaxonomy.textContent = detail.gbif?.taxonKey ? `Taxon ${detail.gbif.taxonKey}` : "No GBIF taxon recorded.";
  elements.gbifTopCountries.textContent = topGbifCountries || "No GBIF country facet saved.";

  renderCountryPills(elements.keepCountries, keepCountries, "No keep countries saved.", editable);
  renderCountryPills(elements.removeCountries, removeCountries, "No removal countries saved.", editable);
  renderCountryPills(elements.addCountries, addCountries, "No explicit additions.", editable);
  renderBucketAddRows(editable);

  elements.saveDraft.disabled = true;
  elements.acceptIssue.disabled = !detail.editable || !accessGranted || state.admin.isApplying;
  elements.rejectIssue.disabled = !detail.editable || !accessGranted || state.admin.isApplying;
  document.querySelectorAll("[data-bucket-add]").forEach((button) => {
    button.disabled = !editable;
  });

  if (!detail.editable) {
    setDecisionStatus(`This issue is already marked as ${statusLabel(detail.status).toLowerCase()}.`);
    return;
  }

  if (!accessGranted) {
    setDecisionStatus("Open systematic review from Country Desk after connecting GitHub there.", true);
    return;
  }

  if (state.hasUnsavedDraft) {
    setDecisionStatus("Bucket layout changed locally. Accept And Apply commits the current Keep / Remove / Add plan.");
    return;
  }

  if (!summary.proposalReady) {
    setDecisionStatus("This issue has no seeded proposal yet. Accept And Apply will commit the current Keep / Remove / Add bucket layout directly.");
    return;
  }

  if (!state.admin.isApplying) {
    setDecisionStatus("Drag the pill body, or use Move to Remove and Move to Keep. Use Add only for countries outside the current expected list.");
  }

  scheduleReviewStageHeightSync();
}

function renderEmptyDetail() {
  state.selectedDetail = null;
  state.selectedItemId = "";
  state.hasUnsavedDraft = false;
  elements.issueTitle.textContent = "No active issues";
  elements.issueStatus.className = "status-pill accepted";
  elements.issueStatus.textContent = "Done";
  elements.issueSummary.textContent = "Every active issue in the loaded queue has been resolved or filtered out.";
  elements.flaggedCount.textContent = "0";
  elements.keepCount.textContent = "0";
  elements.removeCount.textContent = "0";
  elements.addCount.textContent = "0";
  elements.keepHeadCount.textContent = "0 countries";
  elements.removeHeadCount.textContent = "0 countries";
  elements.addHeadCount.textContent = "0 countries";
  elements.researchSummary.textContent = "No active proposal selected.";
  elements.evidenceList.innerHTML = "<li>No active proposal selected.</li>";
  elements.ebirdSpeciesCode.textContent = "-";
  elements.ebirdSpeciesName.textContent = "No eBird species recorded.";
  elements.inatObservations.textContent = "0";
  elements.inatTaxon.textContent = "No iNaturalist taxon recorded.";
  elements.gbifTaxonomy.textContent = "No GBIF taxon recorded.";
  elements.gbifTopCountries.textContent = "No GBIF country facet saved.";
  elements.keepCountries.innerHTML = '<p class="empty-inline">No keep countries.</p>';
  elements.removeCountries.innerHTML = '<p class="empty-inline">No remove countries.</p>';
  elements.addCountries.innerHTML = '<p class="empty-inline">No add countries.</p>';
  elements.keepAddRow.hidden = true;
  elements.removeAddRow.hidden = true;
  elements.addAddRow.hidden = true;
  elements.saveDraft.disabled = true;
  elements.acceptIssue.disabled = true;
  elements.rejectIssue.disabled = true;
  document.querySelectorAll("[data-bucket-add]").forEach((button) => {
    button.disabled = true;
  });
  setDecisionStatus("No pending issues remain in the active queue.");
  scheduleReviewStageHeightSync();
}

function applySelection(itemId) {
  if (!itemId) {
    renderQueue();
    renderEmptyDetail();
    return;
  }

  const detail = buildSystematicReviewDetail(itemId);
  if (!detail) {
    renderQueue();
    renderEmptyDetail();
    return;
  }

  state.selectedItemId = itemId;
  state.activeAddBucket = null;
  state.hasUnsavedDraft = false;
  hydrateDraftFromDetail(detail);
  window.history.replaceState({}, "", `#${itemId}`);
  renderQueue();
  renderDetail(detail);
}

function syncSelection(preferredItemId = state.selectedItemId) {
  state.issues = buildSystematicReviewQueue(false);
  const hashItemId = cleanText(window.location.hash.slice(1));
  const seeded = state.issues.find((issue) => issue.proposalReady);
  const nextItemId = [preferredItemId, hashItemId, state.issues[0]?.itemId, seeded?.itemId].find(
    (candidate) => candidate && state.issues.some((issue) => issue.itemId === candidate),
  ) || "";

  if (!nextItemId) {
    renderQueue();
    renderEmptyDetail();
    return;
  }

  applySelection(nextItemId);
}

function showResolvedSelection(itemId) {
  state.issues = buildSystematicReviewQueue(false);
  const detail = buildSystematicReviewDetail(itemId);
  if (!detail) {
    syncSelection();
    return;
  }

  state.selectedItemId = itemId;
  state.activeAddBucket = null;
  state.hasUnsavedDraft = false;
  hydrateDraftFromDetail(detail);
  window.history.replaceState({}, "", `#${itemId}`);
  renderQueue();
  renderDetail(detail);
}

function maybeDiscardUnsavedDraft(nextItemId) {
  if (!state.hasUnsavedDraft || !state.selectedItemId || state.selectedItemId === nextItemId) {
    return true;
  }
  return window.confirm("Discard the unsaved bucket changes for the current issue?");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}.`);
  }
  return payload;
}

function encodeGitHubPath(path) {
  return String(path || "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function parseGitHubRepo(value) {
  const normalized = cleanText(value);
  const [owner, repo] = normalized.split("/");
  if (!owner || !repo) {
    throw new Error(`GitHub repo must look like owner/repo. Received: ${normalized || "(empty)"}.`);
  }
  return { owner, repo };
}

function serializeJsonFile(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`;
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
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

async function readGitHubBlobUtf8(owner, repo, sha, token) {
  const normalizedSha = cleanText(sha);
  if (!normalizedSha) {
    return "";
  }

  const blob = await fetchGitHubJson(`/repos/${owner}/${repo}/git/blobs/${normalizedSha}`, { token });
  if (cleanText(blob?.encoding).toLowerCase() === "base64") {
    return fromBase64Utf8(blob.content || "");
  }
  return cleanText(blob?.content);
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

  let decoded = fromBase64Utf8(contents.content || "");
  if (!cleanText(decoded) && cleanText(contents?.encoding).toLowerCase() === "none") {
    decoded = await readGitHubBlobUtf8(owner, repo, contents?.sha, token);
  }
  if (!cleanText(decoded)) {
    throw new Error(`GitHub returned no readable content for ${path}.`);
  }

  try {
    return JSON.parse(decoded);
  } catch (error) {
    throw new Error(`Could not parse ${path}: ${error.message || error}`);
  }
}

async function createGitHubTreeEntries(owner, repo, fileEntries, token) {
  const tree = new Array(fileEntries.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < fileEntries.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const fileEntry = fileEntries[currentIndex];
      const blob = await fetchGitHubJson(`/repos/${owner}/${repo}/git/blobs`, {
        method: "POST",
        token,
        body: {
          content: fileEntry.content,
          encoding: "utf-8",
        },
      });

      tree[currentIndex] = {
        path: fileEntry.path,
        mode: "100644",
        type: "blob",
        sha: cleanText(blob?.sha),
      };
    }
  }

  const workerCount = Math.min(GITHUB_BLOB_WRITE_CONCURRENCY, Math.max(fileEntries.length, 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return tree;
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
    throw new Error("Could not resolve the current Git tree for the commit.");
  }

  const tree = await createGitHubTreeEntries(owner, repo, fileEntries, token);

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

function createEmptyProposalsPayload() {
  return {
    schemaVersion: 1,
    updatedAtUtc: null,
    issues: [],
  };
}

function createEmptySystematicLogPayload() {
  return {
    schemaVersion: 1,
    updatedAtUtc: null,
    entries: [],
  };
}

function createEmptyGeofenceTrackingPayload() {
  return {
    schemaVersion: GEOFENCE_TRACKING_SCHEMA_VERSION,
    updatedAtUtc: null,
    items: {},
  };
}

function createEmptyChangeLogPayload() {
  return {
    schemaVersion: CHANGE_LOG_SCHEMA_VERSION,
    updatedAtUtc: null,
    entries: [],
  };
}

function countryNameForIso3(iso3) {
  return cleanText(state.countryByIso.get(iso3)?.countryName) || iso3;
}

function buildSystematicCountryReason(action, itemId, countryIso3, note) {
  const summary = buildSystematicReviewSummary(itemId);
  const proposal = proposalIndex().get(itemId) || {};
  const proposalReason = cleanText(proposal?.proposal?.reason) || "Applied from the current systematic review Keep / Remove / Add bucket layout.";
  const parts = [
    `Systematic review approval: ${action} ${(summary || {}).label || itemId} for ${countryNameForIso3(countryIso3)} (${countryIso3}).`,
    proposalReason,
  ];
  if (note) {
    parts.push(`Reviewer note: ${note}`);
  }
  return parts.filter(Boolean).join(" ");
}

function buildLikelyValidPatch() {
  return {
    status: "likely_true_one_source",
    expected: true,
    observationProfile: {
      code: "countrywide",
      label: "National footprint",
      short: "National",
      note: "Approved from the systematic review queue.",
    },
  };
}

function defaultSystematicProposalSummary(itemId) {
  return `Apply the current systematic Keep / Remove / Add bucket plan for ${reviewLabel(itemId)}.`;
}

function defaultSystematicResearchSummary(itemId) {
  const summary = buildSystematicReviewSummary(itemId);
  return `No seeded systematic proposal exists yet. Accept And Apply will commit the current bucket layout for ${summary?.countryCount || 0} flagged countries on ${reviewLabel(itemId)}.`;
}

function defaultSystematicProposalReason() {
  return "Generated from the current systematic review Keep / Remove / Add bucket layout.";
}

function ensureProposalIssueRecord(proposalsPayload, itemId) {
  const issues = Array.isArray(proposalsPayload?.issues) ? proposalsPayload.issues : [];
  proposalsPayload.issues = issues;

  for (const issue of issues) {
    if (cleanText(issue?.itemId) !== itemId) {
      continue;
    }

    issue.proposal ||= {};
    issue.evidence ||= {};
    issue.proposal.reason = cleanText(issue.proposal.reason) || defaultSystematicProposalReason();
    issue.proposalSummary = cleanText(issue.proposalSummary) || defaultSystematicProposalSummary(itemId);
    issue.researchSummary = cleanText(issue.researchSummary) || defaultSystematicResearchSummary(itemId);
    return issue;
  }

  const issue = {
    itemId,
    status: "pending",
    kind: "country_allowlist",
    proposalSummary: defaultSystematicProposalSummary(itemId),
    researchSummary: defaultSystematicResearchSummary(itemId),
    evidence: {
      summary: [],
      ebird: {},
      inat: {},
      gbif: {},
    },
    proposal: {
      reason: defaultSystematicProposalReason(),
      keepCountries: [],
      removeCountries: [],
      addCountries: [],
    },
  };
  issues.push(issue);
  return issue;
}

function updateProposalPlan(proposalsPayload, itemId, reviewer, keepCountries, removeCountries, addCountries) {
  const updatedAtUtc = nowUtcIso();
  const issue = ensureProposalIssueRecord(proposalsPayload, itemId);
  const status = cleanText(issue?.status) || "pending";
  if (["accepted", "rejected"].includes(status)) {
    throw new Error(`This issue is already marked as ${status} and can no longer be edited.`);
  }

  const normalizedPlan = normalizeSystematicCountryPlan(itemId, keepCountries, removeCountries, addCountries);
  issue.proposal.keepCountries = normalizedPlan.keepCountries;
  issue.proposal.removeCountries = normalizedPlan.removeCountries;
  issue.proposal.addCountries = normalizedPlan.addCountries;
  issue.lastEditedBy = reviewer;
  issue.lastEditedAtUtc = updatedAtUtc;
  proposalsPayload.updatedAtUtc = updatedAtUtc;
  return {
    issue,
    normalizedPlan,
    updatedAtUtc,
  };
}

function markProposalDecision(proposalsPayload, itemId, decision, reviewer, note, applySummary) {
  const targetStatus = decision === "accept" ? "accepted" : "rejected";
  const updatedAtUtc = nowUtcIso();
  const issue = ensureProposalIssueRecord(proposalsPayload, itemId);
  const currentStatus = cleanText(issue?.status) || "pending";
  if (currentStatus === targetStatus) {
    throw new Error(`This issue is already marked as ${targetStatus}.`);
  }

  issue.status = targetStatus;
  issue.decidedBy = reviewer;
  issue.decidedAtUtc = updatedAtUtc;
  issue.decisionNote = note;
  if (applySummary?.updatedAtUtc) {
    issue.lastAppliedAtUtc = applySummary.updatedAtUtc;
  }
  proposalsPayload.updatedAtUtc = updatedAtUtc;
  return {
    targetStatus,
    updatedAtUtc,
  };
}

function appendSystematicReviewLogEntry(logPayload, entry) {
  const entries = Array.isArray(logPayload?.entries) ? logPayload.entries : [];
  entries.push(entry);
  logPayload.entries = entries;
  logPayload.updatedAtUtc = entry.updatedAtUtc;
}

function appendPublishedChangeLogEntries(changeLogPayload, itemId, reviewer, note, updatedAtUtc, countryFiles, plan) {
  const animal = state.catalogById.get(itemId) || {};
  const entries = Array.isArray(changeLogPayload?.entries) ? changeLogPayload.entries : [];

  for (const iso3 of plan.keepCountries) {
    entries.push({
      id: `${updatedAtUtc}__${iso3}__${itemId}__likely_valid`,
      updatedAtUtc,
      updatedBy: reviewer,
      countryIso3: iso3,
      countryName: countryNameForIso3(iso3),
      suggestionType: "likely_valid",
      requestedCoverage: "national",
      itemId,
      matchedKey: cleanText(animal.matchedKey),
      speciesLabel: speciesLabel(animal, itemId),
      sourceDataset: "systematic_review_proposals.json",
      files: [...(countryFiles[iso3] || []), ADMIN_GEOFENCE_TRACKING_PATH],
      reason: buildSystematicCountryReason("keep", itemId, iso3, note),
    });
  }

  for (const iso3 of plan.removeCountries) {
    entries.push({
      id: `${updatedAtUtc}__${iso3}__${itemId}__removal`,
      updatedAtUtc,
      updatedBy: reviewer,
      countryIso3: iso3,
      countryName: countryNameForIso3(iso3),
      suggestionType: "removal",
      requestedCoverage: "removed",
      itemId,
      matchedKey: cleanText(animal.matchedKey),
      speciesLabel: speciesLabel(animal, itemId),
      sourceDataset: "systematic_review_proposals.json",
      files: [...(countryFiles[iso3] || []), ADMIN_GEOFENCE_TRACKING_PATH],
      reason: buildSystematicCountryReason("remove", itemId, iso3, note),
    });
  }

  for (const iso3 of plan.addCountries) {
    entries.push({
      id: `${updatedAtUtc}__${iso3}__${itemId}__addition`,
      updatedAtUtc,
      updatedBy: reviewer,
      countryIso3: iso3,
      countryName: countryNameForIso3(iso3),
      suggestionType: "addition",
      requestedCoverage: "national",
      itemId,
      matchedKey: cleanText(animal.matchedKey),
      speciesLabel: speciesLabel(animal, itemId),
      sourceDataset: "systematic_review_proposals.json",
      files: [...(countryFiles[iso3] || []), ADMIN_GEOFENCE_TRACKING_PATH],
      reason: buildSystematicCountryReason("add", itemId, iso3, note),
    });
  }

  changeLogPayload.entries = entries;
  changeLogPayload.updatedAtUtc = updatedAtUtc;
}

function applySystematicAcceptance(geofenceTrackingPayload, changeLogPayload, itemId, reviewer, note, plan) {
  const animal = state.catalogById.get(itemId) || {};
  const updatedAtUtc = nowUtcIso();
  const changedFiles = [];
  const countryFiles = {};
  const fileEntries = [];

  for (const iso3 of plan.keepCountries) {
    const path = `${COUNTRY_OVERRIDE_ROOT}/${iso3}/${itemId}.json`;
    const payload = {
      countryIso3: iso3,
      itemId,
      action: "upsert",
      updatedBy: reviewer,
      updatedAtUtc,
      reason: buildSystematicCountryReason("keep", itemId, iso3, note),
      patch: buildLikelyValidPatch(),
    };
    fileEntries.push({
      path,
      content: serializeJsonFile(payload),
    });
    changedFiles.push(path);
    countryFiles[iso3] = [...(countryFiles[iso3] || []), path];
  }

  for (const iso3 of plan.removeCountries) {
    const path = `${COUNTRY_OVERRIDE_ROOT}/${iso3}/${itemId}.json`;
    const payload = {
      countryIso3: iso3,
      itemId,
      action: "remove",
      updatedBy: reviewer,
      updatedAtUtc,
      reason: buildSystematicCountryReason("remove", itemId, iso3, note),
    };
    fileEntries.push({
      path,
      content: serializeJsonFile(payload),
    });
    changedFiles.push(path);
    countryFiles[iso3] = [...(countryFiles[iso3] || []), path];
  }

  for (const iso3 of plan.addCountries) {
    const path = `${COUNTRY_OVERRIDE_ROOT}/${iso3}/${itemId}.json`;
    const payload = {
      countryIso3: iso3,
      itemId,
      action: "upsert",
      updatedBy: reviewer,
      updatedAtUtc,
      reason: buildSystematicCountryReason("add", itemId, iso3, note),
      patch: buildLikelyValidPatch(),
    };
    fileEntries.push({
      path,
      content: serializeJsonFile(payload),
    });
    changedFiles.push(path);
    countryFiles[iso3] = [...(countryFiles[iso3] || []), path];
  }

  const items = geofenceTrackingPayload.items && typeof geofenceTrackingPayload.items === "object"
    ? geofenceTrackingPayload.items
    : {};
  let itemTracking = items[itemId];
  if (!itemTracking || typeof itemTracking !== "object") {
    itemTracking = {
      itemId,
      matchedKey: cleanText(animal.matchedKey),
      speciesLabel: speciesLabel(animal, itemId),
      commonName: cleanText(animal.commonName),
      binomial: cleanText(animal.binomial),
      classLabel: cleanText(animal.classLabel),
      sourceDataset: "systematic_review_proposals.json",
      allow: {},
      block: {},
      allow_regional: {},
      metadata: {},
    };
  }

  const allow = itemTracking.allow && typeof itemTracking.allow === "object" ? itemTracking.allow : {};
  const block = itemTracking.block && typeof itemTracking.block === "object" ? itemTracking.block : {};
  const allowRegional = itemTracking.allow_regional && typeof itemTracking.allow_regional === "object" ? itemTracking.allow_regional : {};
  const metadata = itemTracking.metadata && typeof itemTracking.metadata === "object" ? itemTracking.metadata : {};

  for (const iso3 of plan.keepCountries) {
    const path = `${COUNTRY_OVERRIDE_ROOT}/${iso3}/${itemId}.json`;
    allow[iso3] = true;
    delete block[iso3];
    delete allowRegional[iso3];
    metadata[iso3] = {
      decision: "allow",
      coverage: "national",
      overridePath: path,
      updatedBy: reviewer,
      updatedAtUtc,
      reason: buildSystematicCountryReason("keep", itemId, iso3, note),
    };
  }

  for (const iso3 of plan.removeCountries) {
    const path = `${COUNTRY_OVERRIDE_ROOT}/${iso3}/${itemId}.json`;
    block[iso3] = true;
    delete allow[iso3];
    delete allowRegional[iso3];
    metadata[iso3] = {
      decision: "block",
      coverage: "removed",
      overridePath: path,
      updatedBy: reviewer,
      updatedAtUtc,
      reason: buildSystematicCountryReason("remove", itemId, iso3, note),
    };
  }

  for (const iso3 of plan.addCountries) {
    const path = `${COUNTRY_OVERRIDE_ROOT}/${iso3}/${itemId}.json`;
    allow[iso3] = true;
    delete block[iso3];
    delete allowRegional[iso3];
    metadata[iso3] = {
      decision: "allow",
      coverage: "national",
      overridePath: path,
      updatedBy: reviewer,
      updatedAtUtc,
      reason: buildSystematicCountryReason("add", itemId, iso3, note),
    };
  }

  itemTracking.allow = allow;
  itemTracking.block = block;
  itemTracking.allow_regional = allowRegional;
  itemTracking.metadata = metadata;
  items[itemId] = itemTracking;
  geofenceTrackingPayload.items = items;
  geofenceTrackingPayload.updatedAtUtc = updatedAtUtc;

  appendPublishedChangeLogEntries(changeLogPayload, itemId, reviewer, note, updatedAtUtc, countryFiles, plan);

  changedFiles.push(ADMIN_GEOFENCE_TRACKING_PATH);
  changedFiles.push(ADMIN_CHANGE_LOG_PATH);
  fileEntries.push({
    path: ADMIN_GEOFENCE_TRACKING_PATH,
    content: serializeJsonFile(geofenceTrackingPayload),
  });
  fileEntries.push({
    path: ADMIN_CHANGE_LOG_PATH,
    content: serializeJsonFile(changeLogPayload),
  });

  return {
    updatedAtUtc,
    changedFiles,
    fileEntries,
    plan,
  };
}

function reviewLabel(itemId) {
  return buildSystematicReviewSummary(itemId)?.label || itemId;
}

function summarizePromptCountries(iso3List, limit = 8) {
  if (!Array.isArray(iso3List) || !iso3List.length) {
    return "none";
  }

  const labels = iso3List.map((iso3) => countryNameForIso3(iso3) || iso3);
  const visible = labels.slice(0, limit);
  const remainder = labels.length - visible.length;
  if (remainder > 0) {
    return `${visible.join(", ")}, +${formatCount(remainder)} more`;
  }
  return visible.join(", ");
}

function buildSystematicDecisionPrompt(decision, itemId, plan, note) {
  const trimmedNote = cleanText(note);
  const noteLine = trimmedNote ? `Reviewer note: ${trimmedNote}` : "Reviewer note: none";
  const label = reviewLabel(itemId);

  if (decision === "reject") {
    return [
      label,
      "",
      `Current bucket layout: Keep ${formatCount(plan.keepCountries.length)}, Remove ${formatCount(plan.removeCountries.length)}, Add ${formatCount(plan.addCountries.length)}.`,
      noteLine,
      "",
      `This will reject the issue by updating ${SYSTEMATIC_REVIEW_PROPOSALS_PATH} and ${SYSTEMATIC_REVIEW_LOG_PATH} in ${DEFAULT_GITHUB_REPO}.`,
      "Continue?",
    ].join("\n");
  }

  const countryOverrideCount = plan.keepCountries.length + plan.removeCountries.length + plan.addCountries.length;
  const countryOverrideLabel = `${formatCount(countryOverrideCount)} country override ${countryOverrideCount === 1 ? "file" : "files"}`;

  return [
    label,
    "",
    `Keep (${formatCount(plan.keepCountries.length)}): ${summarizePromptCountries(plan.keepCountries)}`,
    `Remove (${formatCount(plan.removeCountries.length)}): ${summarizePromptCountries(plan.removeCountries)}`,
    `Add (${formatCount(plan.addCountries.length)}): ${summarizePromptCountries(plan.addCountries)}`,
    "",
    noteLine,
    "",
    `This will commit the current systematic review decision directly to GitHub for ${DEFAULT_GITHUB_REPO}.`,
    `Files written: ${countryOverrideLabel}; ${SYSTEMATIC_REVIEW_PROPOSALS_PATH}; ${SYSTEMATIC_REVIEW_LOG_PATH}; ${ADMIN_GEOFENCE_TRACKING_PATH}; ${ADMIN_CHANGE_LOG_PATH}.`,
    "Continue?",
  ].join("\n");
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
    // Ignore storage failures.
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

function setAdminMessage(message, isError = false) {
  state.admin.message = message;
  state.admin.messageIsError = Boolean(isError);
}

function clearAdminMessage() {
  state.admin.message = "";
  state.admin.messageIsError = false;
}

function derivedAdminMessage() {
  if (state.admin.message) {
    return {
      message: state.admin.message,
      isError: state.admin.messageIsError,
    };
  }

  if (state.admin.isConnecting) {
    return {
      message: "Checking the GitHub review session carried from Country Desk.",
      isError: false,
    };
  }

  if (!hasReviewAccess()) {
    return {
      message: "Open this page from Country Desk after connecting GitHub there.",
      isError: true,
    };
  }

  return {
    message: `Signed in as @${state.admin.login}. Review session ready.`,
    isError: false,
  };
}

function renderAdminState() {
  const accessState = state.admin.isConnecting ? "checking" : hasReviewAccess() ? "granted" : "blocked";
  const status = derivedAdminMessage();

  document.body.dataset.reviewAccess = accessState;

  if (elements.adminTokenField) {
    elements.adminTokenField.hidden = true;
  }
  if (elements.adminConnectButton) {
    elements.adminConnectButton.hidden = true;
    elements.adminConnectButton.disabled = state.admin.isConnecting || state.admin.isApplying;
    elements.adminConnectButton.textContent = state.admin.isConnecting ? "Connecting..." : "Connect GitHub";
  }
  if (elements.adminDisconnectButton) {
    elements.adminDisconnectButton.hidden = true;
    elements.adminDisconnectButton.disabled = state.admin.isConnecting || state.admin.isApplying;
  }

  elements.adminAuthStatus.textContent = status.message;
  elements.adminAuthStatus.classList.toggle("error", Boolean(status.isError));

  elements.adminLastCommitLink.hidden = !state.admin.lastCommitUrl || accessState !== "granted";
  elements.adminLastCommitLink.href = state.admin.lastCommitUrl || "#";

  if (accessState === "granted" && state.selectedDetail) {
    renderDetail(state.selectedDetail);
  } else if (accessState === "granted") {
    renderEmptyDetail();
  } else {
    scheduleReviewStageHeightSync();
  }
}

async function connectAdminSession(tokenOverride = "") {
  const token = cleanText(tokenOverride || elements.adminTokenInput?.value);
  if (!token) {
    setAdminMessage("Open systematic review from Country Desk after connecting GitHub there.", true);
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
    if (elements.adminTokenInput) {
      elements.adminTokenInput.value = "";
    }

    if (!elements.reviewer.value.trim()) {
      elements.reviewer.value = state.admin.login;
    }

    if (!canWrite) {
      setAdminMessage("This GitHub account does not have access to systematic review. Open it from an approved Country Desk session.", true);
    }
  } catch (error) {
    state.admin.token = "";
    state.admin.login = "";
    state.admin.canWrite = false;
    state.admin.permissionLabel = "";
    state.admin.lastCommitUrl = "";
    clearPersistedAdminToken();
    setAdminMessage(error.message || "Could not connect the GitHub admin session.", true);
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
  clearAdminMessage();
  if (elements.adminTokenInput) {
    elements.adminTokenInput.value = "";
  }
  renderAdminState();
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

  void connectAdminSession(token);
}

function restorePersistedAdminSession() {
  const token = readPersistedAdminToken();
  if (!token || state.admin.login || state.admin.isConnecting) {
    return;
  }
  void connectAdminSession(token);
}

function resolveReviewer() {
  return cleanText(elements.reviewer.value) || cleanText(state.admin.login) || state.settings.defaultReviewer;
}

function currentDraftPlan() {
  if (!state.selectedItemId) {
    throw new Error("No systematic-review issue is selected.");
  }
  return normalizeSystematicCountryPlan(
    state.selectedItemId,
    state.bucketDraft.keep.map((country) => country.iso3),
    state.bucketDraft.remove.map((country) => country.iso3),
    state.bucketDraft.add.map((country) => country.iso3),
  );
}

async function saveDraftToGitHub() {
  if (!state.selectedItemId || !state.selectedDetail?.editable) {
    return;
  }

  if (!hasReviewAccess()) {
    setDecisionStatus("Open systematic review from Country Desk after connecting GitHub there.", true);
    return;
  }

  if (!state.hasUnsavedDraft) {
    setDecisionStatus("Draft already matches the published proposal.");
    return;
  }

  state.admin.isApplying = true;
  state.admin.lastCommitUrl = "";
  clearAdminMessage();
  setDecisionStatus("Saving draft to GitHub...");
  renderAdminState();

  let finalStatusMessage = "";
  let finalStatusIsError = false;

  try {
    const reviewer = resolveReviewer();
    const plan = currentDraftPlan();
    const { owner, repo } = parseGitHubRepo(DEFAULT_GITHUB_REPO);
    const proposalsPayload = await readGitHubContentsJson(owner, repo, SYSTEMATIC_REVIEW_PROPOSALS_PATH, state.admin.token, createEmptyProposalsPayload);
    updateProposalPlan(proposalsPayload, state.selectedItemId, reviewer, plan.keepCountries, plan.removeCountries, plan.addCountries);
    const result = await commitGitHubFiles(
      owner,
      repo,
      DEFAULT_GITHUB_BRANCH,
      `Update systematic review draft for ${reviewLabel(state.selectedItemId)}`,
      [{ path: SYSTEMATIC_REVIEW_PROPOSALS_PATH, content: serializeJsonFile(proposalsPayload) }],
      state.admin.token,
    );

    state.proposalsPayload = proposalsPayload;
    state.admin.lastCommitUrl = cleanText(result.htmlUrl);
    syncSelection(state.selectedItemId);
    finalStatusMessage = "Draft saved to GitHub.";
  } catch (error) {
    finalStatusMessage = error.message || "Failed to save draft.";
    finalStatusIsError = true;
  } finally {
    state.admin.isApplying = false;
    renderAdminState();
    if (finalStatusMessage) {
      setDecisionStatus(finalStatusMessage, finalStatusIsError);
    }
  }
}

async function submitDecision(decision) {
  if (!state.selectedItemId || !state.selectedDetail?.editable) {
    return;
  }

  if (!hasReviewAccess()) {
    setDecisionStatus("Open systematic review from Country Desk after connecting GitHub there.", true);
    return;
  }

  const note = cleanText(elements.decisionNote.value);
  const plan = currentDraftPlan();
  if (!window.confirm(buildSystematicDecisionPrompt(decision, state.selectedItemId, plan, note))) {
    setDecisionStatus(decision === "accept" ? "Accept And Apply cancelled." : "Reject cancelled.");
    return;
  }

  state.admin.isApplying = true;
  state.admin.lastCommitUrl = "";
  clearAdminMessage();
  setDecisionStatus(decision === "accept" ? "Applying accepted proposal..." : "Saving rejection...");
  renderAdminState();

  let finalStatusMessage = "";
  let finalStatusIsError = false;

  try {
    const reviewer = resolveReviewer();
    const { owner, repo } = parseGitHubRepo(DEFAULT_GITHUB_REPO);

    const fetches = [
      readGitHubContentsJson(owner, repo, SYSTEMATIC_REVIEW_PROPOSALS_PATH, state.admin.token, createEmptyProposalsPayload),
      readGitHubContentsJson(owner, repo, SYSTEMATIC_REVIEW_LOG_PATH, state.admin.token, createEmptySystematicLogPayload),
    ];
    if (decision === "accept") {
      fetches.push(readGitHubContentsJson(owner, repo, ADMIN_GEOFENCE_TRACKING_PATH, state.admin.token, createEmptyGeofenceTrackingPayload));
      fetches.push(readGitHubContentsJson(owner, repo, ADMIN_CHANGE_LOG_PATH, state.admin.token, createEmptyChangeLogPayload));
    }

    const [proposalsPayload, logPayload, geofenceTrackingPayload, changeLogPayload] = await Promise.all(fetches);
    updateProposalPlan(proposalsPayload, state.selectedItemId, reviewer, plan.keepCountries, plan.removeCountries, plan.addCountries);

    let applySummary = null;
    const fileEntries = [];

    if (decision === "accept") {
      applySummary = applySystematicAcceptance(
        geofenceTrackingPayload,
        changeLogPayload,
        state.selectedItemId,
        reviewer,
        note,
        plan,
      );
      fileEntries.push(...applySummary.fileEntries);
    }

    const { targetStatus } = markProposalDecision(proposalsPayload, state.selectedItemId, decision, reviewer, note, applySummary);
    const logEntryUpdatedAt = nowUtcIso();
    appendSystematicReviewLogEntry(logPayload, {
      id: `${state.selectedItemId}:${targetStatus}:${logEntryUpdatedAt}`,
      itemId: state.selectedItemId,
      decision: targetStatus,
      updatedBy: reviewer,
      updatedAtUtc: logEntryUpdatedAt,
      note,
      issue: {
        label: reviewLabel(state.selectedItemId),
        countryCount: buildSystematicReviewSummary(state.selectedItemId)?.countryCount || 0,
      },
      plan,
      changedFiles: applySummary?.changedFiles || [],
    });

    fileEntries.push({
      path: SYSTEMATIC_REVIEW_PROPOSALS_PATH,
      content: serializeJsonFile(proposalsPayload),
    });
    fileEntries.push({
      path: SYSTEMATIC_REVIEW_LOG_PATH,
      content: serializeJsonFile(logPayload),
    });

    setDecisionStatus(`Committing ${formatCount(fileEntries.length)} files to GitHub...`);

    const result = await commitGitHubFiles(
      owner,
      repo,
      DEFAULT_GITHUB_BRANCH,
      `${decision === "accept" ? "Accept" : "Reject"} systematic review for ${reviewLabel(state.selectedItemId)}`,
      fileEntries,
      state.admin.token,
    );

    state.proposalsPayload = proposalsPayload;
    state.logPayload = logPayload;
    state.admin.lastCommitUrl = cleanText(result.htmlUrl);

    const previousItemId = state.selectedItemId;
    showResolvedSelection(previousItemId);
    if (decision === "accept") {
      finalStatusMessage = `Accepted and committed. ${formatCount(applySummary?.changedFiles?.length || 0)} published files queued for rebuild. Select the next issue when ready.`;
    } else {
      finalStatusMessage = "Rejected and logged. Select the next issue when ready.";
    }
  } catch (error) {
    finalStatusMessage = error.message || "Decision failed.";
    finalStatusIsError = true;
  } finally {
    state.admin.isApplying = false;
    renderAdminState();
    if (finalStatusMessage) {
      setDecisionStatus(finalStatusMessage, finalStatusIsError);
    }
  }
}

async function addCountryToBucket(bucket, rawValue) {
  const country = resolveCountryValue(rawValue);
  if (!country) {
    setDecisionStatus("Choose a valid ISO3 code or exact country name from the loaded catalog.", true);
    return;
  }

  applyCountryMove(country.iso3, bucket, { closeAddRow: true });
}

async function init() {
  try {
    const [rankingsPayload, proposalsPayload, logPayload, flaggedPayload, catalogPayload, countriesPayload] = await Promise.all([
      fetchJson(withVersion(`${SYSTEMATIC_DATA_ROOT}/rankings.json`)),
      fetchJson(withVersion(`${SYSTEMATIC_DATA_ROOT}/proposals.json`)),
      fetchJson(withVersion(`${SYSTEMATIC_DATA_ROOT}/log.json`)),
      fetchJson(withVersion(`${SYSTEMATIC_DATA_ROOT}/flagged-review-countries.json`)),
      fetchJson(withVersion(`${SYSTEMATIC_DATA_ROOT}/catalog.json`)),
      fetchJson(withVersion(COUNTRY_INDEX_PATH)),
    ]);

    state.rankings = Array.isArray(rankingsPayload?.issues) ? rankingsPayload.issues : [];
    state.proposalsPayload = proposalsPayload && typeof proposalsPayload === "object" ? proposalsPayload : createEmptyProposalsPayload();
    state.logPayload = logPayload && typeof logPayload === "object" ? logPayload : createEmptySystematicLogPayload();
    state.flaggedByItem = flaggedPayload?.items && typeof flaggedPayload.items === "object" ? flaggedPayload.items : {};
    state.catalogById = new Map(
      (Array.isArray(catalogPayload?.items) ? catalogPayload.items : [])
        .map((item) => [cleanText(item?.itemId), item])
        .filter(([itemId]) => itemId),
    );

    state.countries = normalizeCountries(
      (Array.isArray(countriesPayload?.countries) ? countriesPayload.countries : [])
        .filter((country) => cleanText(country?.iso3).length === 3)
        .map((country) => ({
          iso3: cleanText(country.iso3).toUpperCase(),
          countryName: cleanText(country.countryName) || cleanText(country.iso3).toUpperCase(),
        })),
    );
    state.countryByIso = new Map(state.countries.map((country) => [country.iso3, country]));
    state.countryByName = new Map(state.countries.map((country) => [country.countryName.toLowerCase(), country]));
    updateCountryOptions();
    elements.reviewer.value = state.settings.defaultReviewer;
    syncSelection("");
    setupReviewStageSync();
    consumeAdminTokenHandoff();
    restorePersistedAdminSession();
    renderAdminState();
  } catch (error) {
    elements.queueSummary.textContent = error.message || "Failed to load queue.";
    elements.reviewQueue.innerHTML = `<article class="empty-card">${escapeHtml(error.message || "Failed to load queue.")}</article>`;
    setDecisionStatus(error.message || "Failed to load queue.", true);
  }
}

elements.reviewQueue.addEventListener("click", (event) => {
  const button = event.target.closest("[data-item-id]");
  if (!button) {
    return;
  }

  const { itemId } = button.dataset;
  if (!itemId || itemId === state.selectedItemId || !maybeDiscardUnsavedDraft(itemId)) {
    return;
  }

  applySelection(itemId);
});

document.addEventListener("click", (event) => {
  const moveButton = event.target.closest("[data-country-move-target]");
  if (moveButton) {
    if (!canEditLocalDraft()) {
      return;
    }

    applyCountryMove(moveButton.dataset.countryMoveIso3, moveButton.dataset.countryMoveTarget);
    return;
  }

  const addButton = event.target.closest("[data-bucket-add]");
  if (addButton) {
    if (!canEditLocalDraft()) {
      return;
    }
    const bucket = addButton.dataset.bucketAdd;
    state.activeAddBucket = state.activeAddBucket === bucket ? null : bucket;
    renderDetail(state.selectedDetail);
    return;
  }

  const cancelButton = event.target.closest("[data-bucket-cancel]");
  if (cancelButton) {
    state.activeAddBucket = null;
    renderDetail(state.selectedDetail);
    return;
  }

  const confirmButton = event.target.closest("[data-bucket-confirm]");
  if (confirmButton) {
    const bucket = confirmButton.dataset.bucketConfirm;
    const input = document.querySelector(`[data-bucket-input="${bucket}"]`);
    void addCountryToBucket(bucket, input?.value || "");
  }
});

document.addEventListener("keydown", (event) => {
  const input = event.target.closest("[data-bucket-input]");
  if (!input || event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  void addCountryToBucket(input.dataset.bucketInput, input.value);
});

document.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !canEditLocalDraft()) {
    return;
  }

  if (event.target.closest(".country-pill-move")) {
    return;
  }

  const pill = event.target.closest("[data-country-iso3][draggable='true']");
  if (!pill) {
    return;
  }

  state.pointerDrag = {
    pointerId: event.pointerId,
    iso3: pill.dataset.countryIso3,
    sourceBucket: pill.dataset.bucket,
    startX: event.clientX,
    startY: event.clientY,
    targetBucket: "",
    active: false,
    element: pill,
  };

  event.preventDefault();
});

document.addEventListener("pointermove", (event) => {
  const drag = state.pointerDrag;
  if (!drag || drag.pointerId !== event.pointerId || !canEditLocalDraft()) {
    return;
  }

  if (!drag.active) {
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (distance < POINTER_DRAG_THRESHOLD_PX) {
      return;
    }

    drag.active = true;
    drag.element?.classList.add("dragging");
    document.body.classList.add("review-pointer-dragging");
  }

  const targetBucket = dropBucketFromPoint(event.clientX, event.clientY);
  if (!targetBucket || targetBucket === drag.sourceBucket || incompatibleBucketMessage(drag.iso3, targetBucket)) {
    drag.targetBucket = "";
    clearBucketDropTargets();
    event.preventDefault();
    return;
  }

  drag.targetBucket = targetBucket;
  clearBucketDropTargets();
  bucketContainerFor(targetBucket)?.classList.add("drag-target");
  event.preventDefault();
});

document.addEventListener("pointerup", (event) => {
  const drag = state.pointerDrag;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }

  const { active, iso3, sourceBucket, targetBucket } = drag;
  clearPointerDragState();

  if (!active || !targetBucket || targetBucket === sourceBucket) {
    return;
  }

  applyCountryMove(iso3, targetBucket);
  event.preventDefault();
});

document.addEventListener("pointercancel", () => {
  clearPointerDragState();
});

document.addEventListener("dragstart", (event) => {
  const pill = event.target.closest("[data-country-iso3][draggable='true']");
  if (!pill || !canEditLocalDraft()) {
    return;
  }

  state.draggedCountry = {
    iso3: pill.dataset.countryIso3,
    sourceBucket: pill.dataset.bucket,
  };
  pill.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", pill.dataset.countryIso3 || "");
});

document.addEventListener("dragend", (event) => {
  const pill = event.target.closest("[data-country-iso3]");
  pill?.classList.remove("dragging");
  state.draggedCountry = null;
  clearBucketDropTargets();
});

[elements.keepCountries, elements.removeCountries, elements.addCountries].forEach((container) => {
  container.addEventListener("dragover", (event) => {
    if (!state.draggedCountry || !canEditLocalDraft()) {
      return;
    }

    event.preventDefault();
    clearBucketDropTargets();
    container.classList.add("drag-target");
  });

  container.addEventListener("dragleave", () => {
    container.classList.remove("drag-target");
  });

  container.addEventListener("drop", (event) => {
    if (!state.draggedCountry || !canEditLocalDraft()) {
      return;
    }

    event.preventDefault();
    container.classList.remove("drag-target");
    const targetBucket = container.dataset.bucket;
    if (!targetBucket || state.draggedCountry.sourceBucket === targetBucket) {
      return;
    }

    applyCountryMove(state.draggedCountry.iso3, targetBucket);
  });
});

elements.adminConnectButton?.addEventListener("click", () => {
  void connectAdminSession();
});

elements.adminDisconnectButton?.addEventListener("click", () => {
  disconnectAdminSession();
});

elements.saveDraft?.addEventListener("click", () => {
  void saveDraftToGitHub();
});

elements.acceptIssue.addEventListener("click", () => {
  void submitDecision("accept");
});

elements.rejectIssue.addEventListener("click", () => {
  void submitDecision("reject");
});

init();