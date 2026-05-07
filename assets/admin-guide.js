const ADMIN_TOKEN_HANDOFF_KEY = "country-pack-review-admin-token-handoff-20260507a";

const guideAdminTokenInput = document.getElementById("guide-admin-token");
const guideOpenReviewButton = document.getElementById("guide-open-review");
const guideTokenStatus = document.getElementById("guide-token-status");

function setGuideTokenStatus(message, isError = false) {
  if (!guideTokenStatus) {
    return;
  }

  guideTokenStatus.textContent = message;
  guideTokenStatus.classList.toggle("error", Boolean(isError));
}

guideAdminTokenInput?.addEventListener("input", () => {
  setGuideTokenStatus("This token stays in this browser tab only and is passed straight into the review desk.");
});

guideOpenReviewButton?.addEventListener("click", () => {
  const token = (guideAdminTokenInput?.value || "").trim();
  if (!token) {
    setGuideTokenStatus("Paste the GitHub token first.", true);
    guideAdminTokenInput?.focus();
    return;
  }

  try {
    window.sessionStorage.setItem(ADMIN_TOKEN_HANDOFF_KEY, token);
    window.location.href = "./index.html#admin-panel";
  } catch {
    setGuideTokenStatus("Could not hand the token to the review desk. Paste it manually there instead.", true);
  }
});