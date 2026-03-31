const tg = window.Telegram?.WebApp;
const IS_LOCAL_HOST = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const API_BASE_URL = IS_LOCAL_HOST
  ? `http://127.0.0.1:8000`
  : ""; // Empty string means same origin (current domain)
const TARGET_USER_STORAGE_KEY = "hidop_target_user_id";
const THEME_STORAGE_KEY = "hidop_theme";
const PROFILE_DETAILS_STORAGE_KEY = "hidop_profile_details";
const categoryOrder = ["HOME", "Pleylist"];
let allItems = [];
let activeCategory = "LANDING";
let activeQuery = "";
let catalogItems = [];
let savedItems = [];
let selectedTargetUserId = "";
let isAutoDetectedUserId = false;
let catalogRefreshTimerId = null;
let catalogRefreshInFlight = false;
const videoStatusCache = new Map();
let activePreviewVideo = null;
let currentModalKeydownHandler = null;
let telegramProfilePhotoUrl = "";
let sharedProfileUsers = [];
let isProfileDetailsEditing = false;
let topToastTimerId = null;
const pendingSendVideoIds = new Set();

// Error handling for missing elements
window.addEventListener('error', function(e) {
  console.error('JavaScript error:', e.error);
});

// Toggle video play/pause function
async function toggleVideo(button, event) {
  event?.stopPropagation();
  const thumb = button.closest('.thumb');
  const video = thumb?.querySelector('video');
  const card = thumb?.closest('.card');
  const itemId = Number(card?.dataset.videoId || thumb?.dataset.videoId || 0);
  const item = findItemById(itemId);
  
  if (video) {
    if (video.paused) {
      const streamState = await ensureVideoElementSource(video, item);
      if (!streamState.playable) {
        showTopToast(streamState.message || "Bu video webda ochilmaydi.");
        return;
      }

      pauseOtherPreviewVideos(video);
      video.currentTime = 0;
      video.preload = 'metadata';
      const playPromise = video.play();
      
      if (playPromise !== undefined) {
        playPromise.then(() => {
          activePreviewVideo = video;
          button.style.display = 'none';
        }).catch(err => {
          if (err.name === 'NotAllowedError') {
            video.muted = true;
            video.play().then(() => {
              activePreviewVideo = video;
              button.style.display = 'none';
            });
          } else {
            showTopToast("Video ochilmadi. Uni botga yuborib ko'ring.");
          }
        });
      }
    } else {
      video.pause();
      if (activePreviewVideo === video) {
        activePreviewVideo = null;
      }
      button.style.display = 'flex';
    }
  }
}

document.addEventListener("click", (event) => {
  if (event.target.tagName !== "VIDEO") {
    const clickedInsideTheme = event.target.closest?.(".telegram-bar__theme");
    if (!clickedInsideTheme) {
      closeThemePanel();
    }
    return;
  }
  const thumb = event.target.closest(".thumb");
  const button = thumb?.querySelector(".play-button");

  if (button) {
    button.style.display = event.target.paused ? "flex" : "none";
  }
});

window.addEventListener('unhandledrejection', function(e) {
  console.error('Unhandled promise rejection:', e.reason);
});

if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor("#101725");
  tg.setBackgroundColor("#101725");
}

const playlistEl = document.getElementById("playlist");
const telegramBarEl = document.querySelector(".telegram-bar");
const brandTitleEl = document.getElementById("brandTitle");
const themeToggleEl = document.getElementById("themeToggle");
const themePanelEl = document.getElementById("themePanel");
const themeOptionEls = Array.from(document.querySelectorAll(".theme-panel__option"));
const emptyStateEl = document.getElementById("emptyState");
const sectionHeadingEl = document.getElementById("sectionHeading");
const landingPanelEl = document.getElementById("landingPanel");
const holoPanelEl = document.getElementById("holoPanel");
const holoInputEl = document.querySelector(".holo-input");
const holoResultsCountEl = document.getElementById("holoResultsCount");
const profileShowcaseEl = document.getElementById("profileShowcase");
const profileShowcaseAvatarEl = document.getElementById("profileShowcaseAvatar");
const profileShowcaseTitleEl = document.getElementById("profileShowcaseTitle");
const profileShowcaseNameEl = document.getElementById("profileShowcaseName");
const profileShowcaseMetaEl = document.getElementById("profileShowcaseMeta");
const profileShowcaseSharedEl = document.getElementById("profileShowcaseShared");
const profileShowcaseSharedLabelEl = document.getElementById("profileShowcaseSharedLabel");
const profileShowcaseSharedListEl = document.getElementById("profileShowcaseSharedList");
const profileShowcaseMenuEl = document.getElementById("profileShowcaseMenu");
const profileDetailsCardEl = document.querySelector(".profile-showcase__details-card");
const profileDetailsFirstNameEl = document.getElementById("profileDetailsFirstName");
const profileDetailsLastNameEl = document.getElementById("profileDetailsLastName");
const profileDetailsSaveEl = document.getElementById("profileDetailsSave");
const profileModalEl = document.getElementById("profileModal");
const profileModalBackdropEl = document.getElementById("profileModalBackdrop");
const profileModalCloseEl = document.getElementById("profileModalClose");
const profileButtonEl = document.querySelector(".telegram-bar__profile");
const profileInputEl = document.getElementById("profileInput");
const profileSubmitEl = document.getElementById("profileSubmit");
const topToastEl = document.getElementById("topToast");
const saveSuccessModalEl = document.getElementById("saveSuccessModal");
const saveSuccessStatusEl = document.getElementById("saveSuccessStatus");
const saveSuccessDescriptionEl = document.getElementById("saveSuccessDescription");
const saveSuccessButtonEl = document.getElementById("saveSuccessButton");
const profileBadgeEl = document.querySelector(".profile-badge");
const profileCardBadgeEl = document.querySelector(".profile-card__badge");
const profileModalTitleEl = document.getElementById("profileModalTitle");
const sectionTitleEl = document.getElementById("sectionTitle");
const sectionMetaEl = document.getElementById("sectionMeta");
const bottomDockHomeEl = document.getElementById("bottomDockHome");
const bottomDockPlaylistEl = document.getElementById("bottomDockPlaylist");
const bottomDockCreateEl = document.getElementById("bottomDockCreate");
const bottomDockSearchEl = document.getElementById("bottomDockSearch");
const bottomDockProfileEl = document.getElementById("bottomDockProfile");
const bottomDockAvatarEl = document.getElementById("bottomDockAvatar");
const bottomDockCatalogCountEl = document.getElementById("bottomDockCatalogCount");
const bottomDockSavedCountEl = document.getElementById("bottomDockSavedCount");
const bottomDockResultsCountEl = document.getElementById("bottomDockResultsCount");

function formatDuration(seconds = 0) {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function showAppAlert(message) {
  const text = String(message || "").trim() || "Xatolik yuz berdi.";
  if (tg?.showAlert) {
    tg.showAlert(text);
    return;
  }
  window.alert(text);
}

function applyTheme(themeName = "default") {
  const normalizedTheme = ["default", "sunset", "ocean", "forest", "summer"].includes(themeName) ? themeName : "default";
  document.body.dataset.theme = normalizedTheme;
  themeOptionEls.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.theme === normalizedTheme);
  });
}

function loadStoredTheme() {
  try {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY) || "default";
    applyTheme(savedTheme);
  } catch {
    applyTheme("default");
  }
}

function persistTheme(themeName) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeName);
  } catch {
    // Ignore storage issues.
  }
}

function closeThemePanel() {
  themePanelEl?.classList.add("is-hidden");
  themeToggleEl?.setAttribute("aria-expanded", "false");
}

function toggleThemePanel() {
  if (!themePanelEl || !themeToggleEl) {
    return;
  }
  const willOpen = themePanelEl.classList.contains("is-hidden");
  themePanelEl.classList.toggle("is-hidden", !willOpen);
  themeToggleEl.setAttribute("aria-expanded", String(willOpen));
}

function buildVideoFileUrl(itemId) {
  return `${API_BASE_URL}/api/video/${encodeURIComponent(itemId)}/play`;
}

function normalizeApiUrl(url) {
  const rawUrl = String(url || "").trim();
  if (!rawUrl) return "";
  if (/^https?:\/\//i.test(rawUrl)) {
    return rawUrl;
  }
  if (rawUrl.startsWith("/")) {
    return `${API_BASE_URL}${rawUrl}`;
  }
  return `${API_BASE_URL}/${rawUrl.replace(/^\.?\//, "")}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function getDisplayTitle(item) {
  return item?.saved_name || item?.title || "Sarlavha topilmadi";
}

function getDisplayDescription(item) {
  return item?.comment || item?.category || "Video tafsilotlari mavjud emas";
}

function renderScrollingText(text, className) {
  const safeText = escapeHtml(text);
  return `
    <span class="${className}">
      <span>${safeText}</span>
      <span aria-hidden="true">${safeText}</span>
    </span>
  `;
}

function getProfileBadgeText() {
  const firstName = String(tg?.initDataUnsafe?.user?.first_name || "").trim();
  if (selectedTargetUserId) {
    return selectedTargetUserId.slice(-2);
  }
  if (firstName) {
    return firstName.slice(0, 1).toUpperCase();
  }
  return "U";
}

function getTelegramUserId() {
  const rawUserId = tg?.initDataUnsafe?.user?.id;
  if (typeof rawUserId === "number" && Number.isFinite(rawUserId) && rawUserId > 0) {
    return String(rawUserId);
  }
  if (typeof rawUserId === "string" && /^\d+$/.test(rawUserId.trim())) {
    return rawUserId.trim();
  }
  return "";
}

function getAvatarLookupUserId() {
  const selectedId = Number(selectedTargetUserId || 0);
  if (selectedId) {
    return selectedId;
  }
  return Number(tg?.initDataUnsafe?.user?.id || 0);
}

function getTelegramContactLabel() {
  const username = String(tg?.initDataUnsafe?.user?.username || "").trim();
  if (username) {
    return `@${username}`;
  }

  return "@hidop_user";
}

function getTelegramUserPhotoUrl() {
  const photoUrl = telegramProfilePhotoUrl || tg?.initDataUnsafe?.user?.photo_url || "";
  return String(photoUrl).trim();
}

function getProfileDetailsLookupKey() {
  return selectedTargetUserId || getTelegramUserId() || "guest";
}

function loadProfileDetailsPayload() {
  const lookupKey = getProfileDetailsLookupKey();
  try {
    const raw = window.localStorage.getItem(`${PROFILE_DETAILS_STORAGE_KEY}:${lookupKey}`) || "";
    const parsed = raw ? JSON.parse(raw) : {};
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function persistProfileDetailsPayload(payload) {
  const lookupKey = getProfileDetailsLookupKey();
  try {
    window.localStorage.setItem(`${PROFILE_DETAILS_STORAGE_KEY}:${lookupKey}`, JSON.stringify(payload));
  } catch {
    // Ignore storage issues.
  }
}

function formatProfileShortName(payload = loadProfileDetailsPayload()) {
  const firstName = String(payload.firstName || "").trim();
  const lastName = String(payload.lastName || "").trim();
  if (!firstName || !lastName) {
    return "";
  }
  return `${lastName.slice(0, 1).toUpperCase()}.${firstName}`;
}

function syncProfileDetailsUi() {
  if (!profileDetailsCardEl || !profileDetailsFirstNameEl || !profileDetailsLastNameEl || !profileDetailsSaveEl) {
    return;
  }

  const payload = loadProfileDetailsPayload();
  const firstName = String(payload.firstName || "");
  const lastName = String(payload.lastName || "");
  const saved = Boolean(payload.saved);

  profileDetailsFirstNameEl.value = firstName;
  profileDetailsLastNameEl.value = lastName;
  profileDetailsCardEl.classList.toggle("is-hidden", saved && !isProfileDetailsEditing);
  if (profileShowcaseNameEl) {
    const shortName = saved ? formatProfileShortName(payload) : "";
    profileShowcaseNameEl.textContent = shortName;
    profileShowcaseNameEl.classList.toggle("is-hidden", !shortName);
  }
}

function openProfileDetailsEditor() {
  isProfileDetailsEditing = true;
  syncProfileDetailsUi();
  profileDetailsFirstNameEl?.focus();
}

function saveProfileDetails() {
  if (!profileDetailsCardEl || !profileDetailsFirstNameEl || !profileDetailsLastNameEl) {
    return;
  }

  const firstName = String(profileDetailsFirstNameEl.value || "").trim();
  const lastName = String(profileDetailsLastNameEl.value || "").trim();

  if (!firstName || !lastName) {
    showAppAlert("Ism va familyani kiriting.");
    return;
  }

  persistProfileDetailsPayload({
    firstName,
    lastName,
    saved: true,
  });
  isProfileDetailsEditing = false;
  syncProfileDetailsUi();
  showTopToast("saqlandi ✅");
}

function getSharedUsersLookupUserId() {
  const selectedId = Number(selectedTargetUserId || 0);
  if (selectedId > 0) {
    return selectedId;
  }
  const telegramId = Number(getTelegramUserId() || 0);
  return telegramId > 0 ? telegramId : 0;
}

function getInitials(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "U";
  const parts = normalized.split(/\s+/).filter(Boolean);
  const joined = parts.slice(0, 2).map((part) => part[0] || "").join("");
  return (joined || normalized.slice(0, 1)).toUpperCase();
}

function renderSharedProfileUsers() {
  if (!profileShowcaseSharedEl || !profileShowcaseSharedLabelEl || !profileShowcaseSharedListEl) {
    return;
  }

  const count = sharedProfileUsers.length;
  profileShowcaseSharedEl.classList.toggle("is-hidden", count === 0);
  profileShowcaseSharedLabelEl.textContent = `${count} ta odamga ulashilgan`;

  if (!count) {
    profileShowcaseSharedListEl.innerHTML = "";
    return;
  }

  profileShowcaseSharedListEl.innerHTML = sharedProfileUsers.map((item) => {
    const title = String(item?.title || "").trim();
    const photoUrl = String(item?.photo_url || "").trim();
    const fallback = getInitials(title || item?.user_id);
    const safeTitle = escapeHtml(title || `ID ${item?.user_id || ""}`);
    const safePhoto = photoUrl.replace(/"/g, "&quot;");

    return `
      <span class="profile-showcase__shared-avatar ${photoUrl ? "has-photo" : ""}" title="${safeTitle}" aria-label="${safeTitle}">
        ${photoUrl ? `<img src="${safePhoto}" alt="${safeTitle}" />` : escapeHtml(fallback)}
      </span>
    `;
  }).join("");
}

function applyProfileAvatarState(element, fallbackText) {
  if (!element) return;

  const photoUrl = getTelegramUserPhotoUrl();
  element.textContent = fallbackText;
  element.classList.toggle("has-photo", Boolean(photoUrl));
  element.closest(".telegram-bar__profile, .bottom-dock__item--profile")?.classList.toggle("has-photo-avatar", Boolean(photoUrl));

  if (photoUrl) {
    element.innerHTML = `<img class="profile-avatar-image" src="${photoUrl.replace(/"/g, "&quot;")}" alt="Profil rasmi" />`;
  } else {
    element.textContent = fallbackText;
  }
}

async function loadTelegramProfilePhoto() {
  const avatarUserId = getAvatarLookupUserId();
  if (!avatarUserId) {
    syncProfileUi();
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/user-profile-photo?user_id=${encodeURIComponent(avatarUserId)}`, {
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload?.ok && payload?.photo_url) {
      telegramProfilePhotoUrl = String(payload.photo_url).trim();
    } else {
      telegramProfilePhotoUrl = "";
    }
  } catch (error) {
    console.error("Telegram profil rasmi yuklanmadi:", error);
    telegramProfilePhotoUrl = "";
  }

  syncProfileUi();
}

async function loadSharedProfileUsers() {
  const lookupUserId = getSharedUsersLookupUserId();
  if (!lookupUserId) {
    sharedProfileUsers = [];
    renderSharedProfileUsers();
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/shared-users?user_id=${encodeURIComponent(lookupUserId)}`, {
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload?.ok && Array.isArray(payload.items)) {
      sharedProfileUsers = payload.items;
    } else {
      sharedProfileUsers = [];
    }
  } catch (error) {
    console.error("Shared users yuklanmadi:", error);
    sharedProfileUsers = [];
  }

  renderSharedProfileUsers();
}

function getVisibleSourceItems() {
  if (activeCategory === "LANDING") {
    return [];
  }
  if (activeCategory === "EMPTY") {
    return allItems;
  }
  if (activeCategory === "PROFILE") {
    return [];
  }
  return activeCategory === "Pleylist" ? savedItems : allItems;
}

function getFilteredItems(items = getVisibleSourceItems()) {
  return items.filter((item) => {
    const itemCategory = String(item?.category || "").trim();
    const isPlaylistItem = itemCategory === "Pleylist" || itemCategory === "Ombor";
    const categoryOk = activeCategory === "EMPTY"
      || activeCategory === "HOME"
      || activeCategory === "Pleylist"
      || itemCategory === activeCategory
      || (activeCategory === "Pleylist" && isPlaylistItem);
    return categoryOk && matchesSearch(item);
  });
}

function syncBodyOverlayState() {
  const profileOpen = Boolean(profileModalEl && !profileModalEl.classList.contains("is-hidden"));
  document.body.classList.toggle("has-overlay", profileOpen || Boolean(currentModal));
}

function syncSearchState() {
  document.body.classList.remove("search-open");
  bottomDockSearchEl?.classList.remove("is-active");
}

function syncBottomDockState() {
  const profileOpen = Boolean(profileModalEl && !profileModalEl.classList.contains("is-hidden"));
  let activeDock = "home";

  if (profileOpen) {
    activeDock = "profile";
  } else if (activeCategory === "PROFILE") {
    activeDock = "profile";
  } else if (activeCategory === "EMPTY") {
    activeDock = "empty";
  } else if (activeCategory === "Pleylist") {
    activeDock = "saved";
  } else if (activeCategory === "HOME") {
    activeDock = "playlist";
  }

  bottomDockHomeEl?.classList.toggle("is-active", activeDock === "home");
  bottomDockPlaylistEl?.classList.toggle("is-active", activeDock === "playlist");
  bottomDockCreateEl?.classList.toggle("is-active", activeDock === "saved");
  bottomDockSearchEl?.classList.toggle("is-active", activeDock === "empty");
  bottomDockProfileEl?.classList.toggle("is-active", activeDock === "profile");
}

function syncBottomDockCounts() {
  if (bottomDockCatalogCountEl) {
    bottomDockCatalogCountEl.textContent = String(catalogItems.length);
  }
  if (bottomDockSavedCountEl) {
    bottomDockSavedCountEl.textContent = String(savedItems.length);
  }
}

function setActiveCategory(category) {
  if (category === "Pleylist" && !selectedTargetUserId) {
    openProfileModal();
    profileInputEl?.focus();
    return;
  }
  activeCategory = category;
  if (category !== "EMPTY" && holoInputEl) {
    holoInputEl.value = "";
  }
  if (category !== "EMPTY") {
    activeQuery = "";
  }
  buildFilters(allItems);
  render();
  syncBottomDockState();
}

function openSearch() {
  showTopToast("Qidiruv keyin qo'shiladi.");
}

function closeSearch({ clearQuery = true } = {}) {
  if (clearQuery) {
    activeQuery = "";
    render();
  }
  syncSearchState();
}

function toggleSearch() {
  openSearch();
}

function rerenderPreservingScroll(callback) {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  callback();
  window.requestAnimationFrame(() => {
    window.scrollTo(scrollX, scrollY);
  });
}

function updateDashboard(visibleItems = getFilteredItems()) {
  const showCatalogChrome = !((activeCategory === "LANDING" || activeCategory === "EMPTY") && !activeQuery);
  if (holoPanelEl) {
    holoPanelEl.classList.toggle("is-hidden", activeCategory !== "EMPTY");
  }
  if (landingPanelEl) {
    landingPanelEl.classList.toggle("is-hidden", activeCategory !== "LANDING");
  }
  if (profileShowcaseEl) {
    profileShowcaseEl.classList.toggle("is-hidden", activeCategory !== "PROFILE");
  }
  if (holoResultsCountEl) {
    const showResultsCount = activeCategory === "EMPTY" && Boolean(activeQuery.trim());
    holoResultsCountEl.classList.toggle("is-hidden", !showResultsCount);
    if (showResultsCount) {
      holoResultsCountEl.textContent = `${visibleItems.length} ta natija`;
    }
  }
  if (bottomDockResultsCountEl) {
    const showResultsCount = activeCategory === "EMPTY" && Boolean(activeQuery.trim());
    bottomDockResultsCountEl.classList.toggle("is-hidden", !showResultsCount);
    if (showResultsCount) {
      bottomDockResultsCountEl.textContent = String(visibleItems.length);
    }
  }
  if (telegramBarEl) {
    telegramBarEl.style.display = activeCategory === "LANDING" ? "" : "none";
  }
  if (sectionHeadingEl) {
    sectionHeadingEl.style.display = (showCatalogChrome && activeCategory !== "PROFILE") ? "" : "none";
  }
  if (sectionTitleEl) {
    sectionTitleEl.textContent = activeQuery
      ? "Qidiruv natijalari"
      : activeCategory === "LANDING"
        ? "Bosh sahifa"
      : activeCategory === "PROFILE"
        ? "Profil"
      : activeCategory === "EMPTY"
        ? "Maxsus panel"
      : activeCategory === "Pleylist"
        ? "Saqlangan videolar"
        : "So'nggi videolar";
  }
  if (sectionMetaEl) {
    sectionMetaEl.textContent = activeQuery
      ? `${visibleItems.length} ta natija`
      : activeCategory === "LANDING"
        ? "Bo'lim tanlang"
      : activeCategory === "PROFILE"
        ? "Foydalanuvchi oynasi"
      : activeCategory === "EMPTY"
        ? "Interfeys tayyor"
      : `${visibleItems.length} ta video`;
  }
  if (emptyStateEl) {
    emptyStateEl.textContent = activeQuery
      ? "Qidiruv bo'yicha hech narsa topilmadi."
      : activeCategory === "LANDING"
        ? ""
      : activeCategory === "PROFILE"
        ? ""
      : activeCategory === "EMPTY"
        ? ""
      : activeCategory === "Pleylist"
        ? "Pleylistda hali video yo'q."
        : "Katalogda hozircha video topilmadi.";
  }
  if (holoInputEl && activeCategory === "EMPTY" && holoInputEl.value !== activeQuery) {
    holoInputEl.value = activeQuery;
  }
  if (profileShowcaseTitleEl) {
    profileShowcaseTitleEl.textContent = selectedTargetUserId ? `ID ${selectedTargetUserId}` : "HIDOP BOT USER";
  }
  if (profileShowcaseMetaEl) {
    profileShowcaseMetaEl.textContent = selectedTargetUserId
      ? "Telegram profilingiz shu bo'limda ko'rinadi."
      : "Profil rasmini ko'rish uchun Telegram profilingizdan foydalaniladi.";
  }
  renderSharedProfileUsers();
  syncProfileDetailsUi();
  document.body.dataset.category = activeCategory.toLowerCase();
}

function findItemById(itemId) {
  if (!itemId) return null;
  return [...catalogItems, ...savedItems].find((item) => Number(item.id) === Number(itemId)) || null;
}

function pauseOtherPreviewVideos(exceptVideo) {
  document.querySelectorAll(".thumb video").forEach((video) => {
    if (video === exceptVideo) {
      return;
    }
    video.pause();
    const thumb = video.closest(".thumb");
    const button = thumb?.querySelector(".play-button");
    if (button) {
      button.style.display = "flex";
    }
  });
}

async function fetchVideoStatus(item, { force = false } = {}) {
  if (!item?.id) {
    return {
      playable: false,
      reason: "not_found",
      message: "Video topilmadi.",
      stream_url: "",
    };
  }

  if (item.trailer_url) {
    const result = {
      playable: true,
      reason: "",
      message: "",
      stream_url: normalizeApiUrl(item.trailer_url),
    };
    videoStatusCache.set(item.id, result);
    return result;
  }

  if (item.web_streamable === false) {
    return {
      playable: false,
      reason: item.web_stream_error || "file_too_big",
      message: item.web_stream_message || "Bu video webda ochilmaydi. Uni botga yuboring.",
      stream_url: "",
    };
  }

  if (!force && videoStatusCache.has(item.id)) {
    return videoStatusCache.get(item.id);
  }

  const fallbackUrl = normalizeApiUrl(item.trailer_url || item.preview_url || buildVideoFileUrl(item.id));
  if (item.web_stream_source === "external" && fallbackUrl) {
    const result = {
      playable: true,
      reason: "",
      message: "",
      stream_url: fallbackUrl,
    };
    videoStatusCache.set(item.id, result);
    return result;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/video/${encodeURIComponent(item.id)}/status`, {
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    const result = {
      playable: payload?.playable !== false,
      reason: payload?.reason || "",
      message: payload?.message || "",
      stream_url: normalizeApiUrl(payload?.stream_url || fallbackUrl),
    };

    if (!response.ok) {
      result.playable = false;
    }

    item.web_streamable = result.reason === "temporary_error" ? null : result.playable;
    item.web_stream_error = result.reason;
    item.web_stream_message = result.message;
    if (result.stream_url) {
      item.preview_url = result.stream_url;
    }

    if (result.reason === "temporary_error" && !result.playable) {
      videoStatusCache.delete(item.id);
    } else {
      videoStatusCache.set(item.id, result);
    }
    return result;
  } catch {
    return {
      playable: true,
      reason: "",
      message: "",
      stream_url: fallbackUrl,
    };
  }
}

async function ensureVideoElementSource(video, item) {
  if (video.dataset.ready === "true" && video.src) {
    return {
      playable: true,
      reason: "",
      message: "",
      stream_url: video.src,
    };
  }

  const status = await fetchVideoStatus(item);
  if (!status.playable) {
    return status;
  }

  const resolvedUrl = status.stream_url || normalizeApiUrl(video.dataset.src || "");
  if (!resolvedUrl) {
    return {
      playable: false,
      reason: "missing_file",
      message: "Video manbasi topilmadi.",
      stream_url: "",
    };
  }

  video.src = resolvedUrl;
  video.dataset.ready = "true";
  video.preload = "metadata";
  video.load();

  return {
    playable: true,
    reason: "",
    message: "",
    stream_url: resolvedUrl,
  };
}

function detectCategory(item) {
  const haystack = `${item.title || ""} ${item.comment || ""}`.toLowerCase();
  if (
    haystack.includes("tiktok") ||
    haystack.includes("instagram") ||
    haystack.includes("youtube") ||
    haystack.includes("youtu") ||
    haystack.includes("ombor") ||
    haystack.includes("pleylist")
  ) return "Pleylist";
  return "HOME";
}

function detectPalette(item) {
  switch (detectCategory(item)) {
    case "Pleylist":
      return "instagram";
    default:
      return "night";
  }
}

async function loadItems() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/catalog`, { cache: "no-store" });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const payload = await response.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    
    if (items.length === 0) {
      catalogItems = [];
      return [];
    }
    
    catalogItems = items.map((item) => ({
      id: Number(item.id || 0),
      title: item.title || "Sarlavha topilmadi",
      comment: item.comment || "",
      category: item.category || detectCategory(item),
      duration: Number(item.duration || 0),
      ageLabel: item.ageLabel || "Kutubxonada",
      palette: item.palette || detectPalette(item),
      preview_url: normalizeApiUrl(item.preview_url || (item.id ? buildVideoFileUrl(item.id) : "")),
      poster_url: normalizeApiUrl(item.poster_url || item.preview_url || ""),
      trailer_url: normalizeApiUrl(item.trailer_url || ""),
      added_at: item.added_at || "",
      web_streamable: typeof item.web_streamable === "boolean" ? item.web_streamable : null,
      web_stream_error: item.web_stream_error || "",
      web_stream_message: item.web_stream_message || "",
      web_stream_source: item.web_stream_source || "",
      file_size: Number(item.file_size || 0),
    }));
    
    return catalogItems;
    
  } catch (error) {
    console.error("Failed to load videos:", error);
    catalogItems = [];
    return [];
  }
}

async function loadSavedItems() {
  const ownerId = getActiveOwnerId();
  if (!ownerId) {
    return [];
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/saved-videos?owner_id=${encodeURIComponent(ownerId)}`,
      { cache: "no-store" }
    );
    if (!response.ok) {
      throw new Error("saved videos topilmadi");
    }
    const payload = await response.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return items.map((item) => ({
      ...item,
      preview_url: normalizeApiUrl(item.preview_url || (item.id ? buildVideoFileUrl(item.id) : "")),
      poster_url: normalizeApiUrl(item.poster_url || item.preview_url || ""),
      trailer_url: normalizeApiUrl(item.trailer_url || ""),
      web_streamable: typeof item.web_streamable === "boolean" ? item.web_streamable : null,
      web_stream_error: item.web_stream_error || "",
      web_stream_message: item.web_stream_message || "",
      web_stream_source: item.web_stream_source || "",
      file_size: Number(item.file_size || 0),
    }));
  } catch {
    return [];
  }
}

function getActiveOwnerId() {
  return selectedTargetUserId || getTelegramUserId() || "";
}

async function refreshSavedItems() {
  savedItems = await loadSavedItems();
  syncBottomDockCounts();
}

function buildFilters(items) {
  void items;
}

function refreshView() {
  buildFilters(allItems);
  syncBottomDockCounts();
  render();
  syncBottomDockState();
}

async function refreshCatalogView() {
  if (catalogRefreshInFlight) {
    return;
  }

  catalogRefreshInFlight = true;
  try {
    allItems = await loadItems();
    if (selectedTargetUserId) {
      await refreshSavedItems();
    }
    refreshView();
  } finally {
    catalogRefreshInFlight = false;
  }
}

function startCatalogAutoRefresh() {
  if (catalogRefreshTimerId) {
    return;
  }

  catalogRefreshTimerId = window.setInterval(() => {
    refreshCatalogView().catch((error) => {
      console.error("Catalog auto-refresh failed:", error);
    });
  }, 20000);
}

function getPlatformColor(category) {
  if (category === "Pleylist") return "#ffba56";
  return "#77f1cf";
}

function getCardAccent(item) {
  switch (item?.palette || detectPalette(item || {})) {
    case "instagram":
      return "linear-gradient(135deg, #ffbb6f 0%, #ff6c87 45%, #885cff 100%)";
    case "youtube":
      return "linear-gradient(135deg, #ff8b6d 0%, #ff5573 44%, #ffc35b 100%)";
    default:
      return "linear-gradient(135deg, #77f1cf 0%, #6f9bff 52%, #a7c6ff 100%)";
  }
}

async function sendVideoToBot(item) {
  if (!item) return;
  const targetUserId = selectedTargetUserId || getTelegramUserId();
  if (!targetUserId) {
    openProfileModal();
    profileInputEl?.focus();
    return;
  }
  if (pendingSendVideoIds.has(item.id)) {
    showTopToast("yuborilmoqda...");
    return;
  }
  const payload = {
    type: "send_video",
    video_id: item.id,
    title: item.saved_name || item.title || "",
    source: activeCategory,
    target_user_id: targetUserId,
  };

  pendingSendVideoIds.add(item.id);
  showTopToast("yuborilmoqda...");

  try {
    const response = await fetch(`${API_BASE_URL}/api/send-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));

    if (response.ok && result?.ok) {
      tg?.HapticFeedback?.notificationOccurred?.("success");
      showTopToast("yuborildi ✅");
      return;
    }

    tg?.HapticFeedback?.notificationOccurred?.("error");
    showAppAlert(result?.message || result?.error || "Video yuborilmadi.");
  } catch (error) {
    console.error("Video yuborishda xatolik:", error);
    tg?.HapticFeedback?.notificationOccurred?.("error");
    showAppAlert("Video yuborishda xatolik bo'ldi.");
  } finally {
    pendingSendVideoIds.delete(item.id);
  }
}

function removeSavedVideoFromUi(itemId, triggerElement = null) {
  savedItems = savedItems.filter((savedItem) => Number(savedItem.id) !== Number(itemId));

  const card = triggerElement?.closest(".card");
  card?.remove();

  const visibleItems = sortBySearchRelevance(getFilteredItems(getVisibleSourceItems()));
  updateDashboard(visibleItems);

  emptyStateEl?.classList.toggle("is-hidden", visibleItems.length > 0);
}

function deleteSavedVideo(item, triggerElement = null) {
  if (!item?.id) return;
  const ownerId = getActiveOwnerId();
  if (!ownerId) {
    openProfileModal();
    profileInputEl?.focus();
    return;
  }
  fetch(`${API_BASE_URL}/api/delete-saved-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner_id: ownerId,
      video_id: item.id,
    }),
  })
    .then((response) => response.json())
    .then((result) => {
      if (!result?.ok) {
        showAppAlert(result?.message || result?.error || "Video o'chirilmadi.");
        return;
      }
      removeSavedVideoFromUi(item.id, triggerElement);
      showTopToast("pleylistdan olib tashlandi ✅");
    })
    .catch(() => {
      showAppAlert("Video o'chirishda xatolik bo'ldi.");
    });
}

function ensureTargetUserId() {
  const ownerId = getActiveOwnerId();
  if (ownerId) {
    return ownerId;
  }
  openProfileModal();
  profileInputEl?.focus();
  return "";
}

async function saveVideoToProfile(item) {
  const ownerId = ensureTargetUserId();
  if (!ownerId || !item?.id) {
    return false;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/save-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner_id: ownerId,
        video_id: item.id,
      }),
    });
    const result = await response.json();
    if (!result?.ok) {
      showAppAlert(result?.message || result?.error || "Video saqlanmadi.");
      return false;
    }
    await refreshSavedItems();
    rerenderPreservingScroll(() => {
      render();
    });
    showTopToast(
      result?.already_saved
        ? "Allaqachon saqlangan. Playlistingizni /playlist orqali ko'ring."
        : "Saqlandi. Playlistingizni /playlist orqali ko'ring.",
    );
    return true;
  } catch {
    showAppAlert("Video saqlashda xatolik bo'ldi.");
    return false;
  }
}

function closeSaveRedirectModal() {
  saveSuccessModalEl?.classList.add("is-hidden");
  saveSuccessModalEl?.setAttribute("aria-hidden", "true");
  syncBodyOverlayState();
}

function openSaveRedirectModal({
  dialogTitle = "Telegram",
  title = "Saqlandi!",
  description = "Playlistingizni /playlist orqali ko'ring.",
  buttonText = "OK",
} = {}) {
  if (!saveSuccessModalEl) {
    redirectToSavedPlaylist();
    return;
  }

  const saveSuccessTitleEl = document.getElementById("saveSuccessTitle");
  if (saveSuccessTitleEl) {
    saveSuccessTitleEl.textContent = dialogTitle;
  }
  if (saveSuccessStatusEl) {
    saveSuccessStatusEl.textContent = title;
  }
  if (saveSuccessDescriptionEl) {
    saveSuccessDescriptionEl.textContent = description;
    saveSuccessDescriptionEl.classList.toggle("is-hidden", !description);
  }
  if (saveSuccessButtonEl) {
    saveSuccessButtonEl.textContent = buttonText;
  }

  saveSuccessModalEl.classList.remove("is-hidden");
  saveSuccessModalEl.setAttribute("aria-hidden", "false");
  syncBodyOverlayState();
}

async function loadVideoReactionState(item) {
  if (!item?.id) {
    return { likes: 0, dislikes: 0, user_reaction: null };
  }

  const params = new URLSearchParams({ video_id: String(item.id) });
  if (selectedTargetUserId) {
    params.set("user_id", selectedTargetUserId);
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/video-reactions?${params.toString()}`, {
      cache: "no-store",
    });
    const result = await response.json();
    if (!result?.ok) {
      return { likes: 0, dislikes: 0, user_reaction: null };
    }
    return {
      likes: Number(result.likes || 0),
      dislikes: Number(result.dislikes || 0),
      user_reaction: result.user_reaction || null,
    };
  } catch {
    return { likes: 0, dislikes: 0, user_reaction: null };
  }
}

async function likeVideoFromModal(item) {
  const ownerId = ensureTargetUserId();
  if (!ownerId || !item?.id) {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/react-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: ownerId,
        video_id: item.id,
        reaction: "likes",
      }),
    });
    const result = await response.json();
    if (!result?.ok) {
      showAppAlert(result?.message || result?.error || "Like qo'yilmadi.");
      return null;
    }
    showTopToast("yoqtirildi 👍");
    return result;
  } catch {
    showAppAlert("Like qo'yishda xatolik bo'ldi.");
    return null;
  }
}

function matchesSearch(item) {
  const query = activeQuery.trim();
  if (!query) return true;
  const normalizedQuery = query.toLowerCase();
  const idText = String(item.id ?? "").toLowerCase().trim();

  if (/^\d+$/.test(normalizedQuery)) {
    return idText === normalizedQuery;
  }

  const fields = [
    String(item.title || "").toLowerCase(),
    String(item.comment || "").toLowerCase(),
    String(item.category || "").toLowerCase(),
    idText,
  ];
  const haystack = fields.join(" ");
  if (haystack.includes(normalizedQuery)) {
    return true;
  }

  const words = fields
    .flatMap((field) => field.split(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff]+/i))
    .filter(Boolean);

  if (words.some((word) => word.startsWith(normalizedQuery))) {
    return true;
  }

  if (normalizedQuery.length <= 2) {
    return words.some((word) => word[0] === normalizedQuery[0]);
  }

  return false;
}

function getSearchScore(item) {
  const query = activeQuery.trim();
  if (!query) return 0;
  const normalizedQuery = query.toLowerCase();

  const title = String(item.title || "").toLowerCase().trim();
  const comment = String(item.comment || "").toLowerCase().trim();
  const category = String(item.category || "").toLowerCase().trim();
  const idText = String(item.id ?? "").toLowerCase().trim();

  if (/^\d+$/.test(normalizedQuery)) {
    return idText === normalizedQuery ? 2000 : -1;
  }

  if (title === normalizedQuery) return 1000;
  if (idText === normalizedQuery) return 950;
  if (title.startsWith(normalizedQuery)) return 900 - Math.min(title.length, 200);

  const titleWords = title.split(/\s+/).filter(Boolean);
  if (titleWords.some((word) => word.startsWith(normalizedQuery))) return 820;

  if (comment.startsWith(normalizedQuery) || category.startsWith(normalizedQuery)) return 760;
  if (title.includes(normalizedQuery)) return 680;
  if (comment.includes(normalizedQuery) || category.includes(normalizedQuery)) return 560;
  if (idText.includes(normalizedQuery)) return 520;

  return 0;
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEpisodeNumber(value) {
  const text = normalizeSearchText(value);
  const episodePatterns = [
    /(\d+)\s*-\s*qism\b/,
    /(\d+)\s*qism\b/,
    /\bqism\s*(\d+)\b/,
    /\bpart\s*(\d+)\b/,
    /\bep(?:isode)?\s*(\d+)\b/,
  ];

  for (const pattern of episodePatterns) {
    const match = text.match(pattern);
    if (match) {
      return Number(match[1]);
    }
  }

  const trailingNumber = text.match(/(\d+)(?!.*\d)/);
  return trailingNumber ? Number(trailingNumber[1]) : Number.POSITIVE_INFINITY;
}

function getTitleBase(value) {
  return normalizeSearchText(value)
    .replace(/\b\d+\s*-\s*qism\b/g, "")
    .replace(/\b\d+\s*qism\b/g, "")
    .replace(/\bqism\s*\d+\b/g, "")
    .replace(/\bpart\s*\d+\b/g, "")
    .replace(/\bep(?:isode)?\s*\d+\b/g, "")
    .replace(/\b\d+\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sortBySearchRelevance(items) {
  const naturalCollator = new Intl.Collator("uz", {
    numeric: true,
    sensitivity: "base",
  });

  return items.slice().sort((left, right) => {
    const scoreDiff = getSearchScore(right) - getSearchScore(left);
    if (scoreDiff !== 0) return scoreDiff;

    if (!activeQuery) {
      const leftAddedAt = Date.parse(left.added_at || "") || 0;
      const rightAddedAt = Date.parse(right.added_at || "") || 0;
      const addedAtDiff = rightAddedAt - leftAddedAt;
      if (addedAtDiff !== 0) return addedAtDiff;

      const idDiff = Number(right.id || 0) - Number(left.id || 0);
      if (idDiff !== 0) return idDiff;
    }

    const leftTitle = normalizeSearchText(left.saved_name || left.title || "");
    const rightTitle = normalizeSearchText(right.saved_name || right.title || "");
    const leftBase = getTitleBase(leftTitle);
    const rightBase = getTitleBase(rightTitle);

    if (activeQuery) {
      const leftBaseStarts = leftBase.startsWith(activeQuery);
      const rightBaseStarts = rightBase.startsWith(activeQuery);
      if (leftBaseStarts !== rightBaseStarts) return rightBaseStarts - leftBaseStarts;
    }

    const baseDiff = leftBase.localeCompare(rightBase);
    if (baseDiff !== 0) return baseDiff;

    const leftEpisode = extractEpisodeNumber(leftTitle);
    const rightEpisode = extractEpisodeNumber(rightTitle);
    const leftEpisodeRank = Number.isFinite(leftEpisode) ? leftEpisode : Number.MAX_SAFE_INTEGER;
    const rightEpisodeRank = Number.isFinite(rightEpisode) ? rightEpisode : Number.MAX_SAFE_INTEGER;
    const episodeDiff = leftEpisodeRank - rightEpisodeRank;
    if (episodeDiff !== 0) return episodeDiff;

    const titleDiff = naturalCollator.compare(leftTitle, rightTitle);
    if (titleDiff !== 0) return titleDiff;

    return Number(left.id || 0) - Number(right.id || 0);
  });
}

function render() {
  const sourceItems = getVisibleSourceItems();
  const ordered = sortBySearchRelevance(getFilteredItems(sourceItems));

  playlistEl.innerHTML = "";
  updateDashboard(ordered);

  if ((activeCategory === "LANDING" || activeCategory === "EMPTY" || activeCategory === "PROFILE") && !activeQuery) {
    emptyStateEl?.classList.add("is-hidden");
    return;
  }

  emptyStateEl.classList.toggle("is-hidden", ordered.length > 0);

  if (!ordered.length) {
    return;
  }

  ordered.forEach((item, index) => {
    const duration = formatDuration(item.duration || 0);
    const category = item.category || detectCategory(item);
    const safeId = escapeHtml(item.id ?? "?");
    const title = escapeHtml(getDisplayTitle(item));
    const description = escapeHtml(getDisplayDescription(item));
    const canPreviewInCard = Boolean(item.trailer_url) || (item.web_streamable !== false && Boolean(item.preview_url || item.id));
    const previewUrl = normalizeApiUrl(item.trailer_url || item.preview_url || (item.id ? buildVideoFileUrl(item.id) : ""));
    const posterUrl = normalizeApiUrl(item.poster_url || item.preview_url || "");
    const palette = ["night", "instagram", "youtube"].includes(item.palette) ? item.palette : "night";
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.videoId = String(item.id || "");
    card.style.animationDelay = `${Math.min(260, index * 60)}ms`;
    card.style.setProperty("--card-edge", getCardAccent(item));
    card.innerHTML = `
      <div class="card__frame">
        <div class="thumb thumb--${palette}${canPreviewInCard ? " has-video" : ""}" data-video-id="${item.id || ""}">
          ${posterUrl ? `<div class="thumb__poster" style="background-image: url('${escapeHtml(posterUrl)}')"></div>` : ""}
          ${canPreviewInCard ? `<video data-src="${escapeHtml(previewUrl)}" muted loop playsinline preload="none"></video>` : ""}
          ${canPreviewInCard ? `<div class="play-button" onclick="toggleVideo(this, event)" aria-label="Previewni ochish">▶</div>` : `<div class="thumb__notice">Botda oching</div>`}
          <div class="thumb__overlay">
            <div class="thumb__head">
              <div class="thumb__badge thumb__badge--title">${renderScrollingText(getDisplayTitle(item), "thumb__marquee")}</div>
              <div class="thumb__badge thumb__badge--time">${duration}</div>
            </div>
            <div class="thumb__content">
              <div class="meta__buttons thumb__buttons">
                <button class="save-button" type="button">Saqlash</button>
                <button class="send-button" type="button">Yuborish</button>
                ${activeCategory === "Pleylist" ? '<button class="delete-button" type="button">O\'chirish</button>' : ""}
              </div>
              <div class="thumb__label-wrap">
                <div class="thumb__sub">${renderScrollingText(getDisplayDescription(item), "thumb__sub-marquee")}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    card.querySelector(".save-button")?.addEventListener("click", async (event) => {
      event.stopPropagation();
      await saveVideoToProfile(item);
    });
    card.querySelector(".send-button")?.addEventListener("click", (event) => {
      event.stopPropagation();
      sendVideoToBot(item);
    });
    card.querySelector(".delete-button")?.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteSavedVideo(item, event.currentTarget);
    });

    const previewVideo = card.querySelector("video");
    if (previewVideo) {
      previewVideo.addEventListener("pause", () => {
        const button = card.querySelector(".play-button");
        if (button) {
          button.style.display = "flex";
        }
      });
      previewVideo.addEventListener("ended", () => {
        const button = card.querySelector(".play-button");
        if (button) {
          button.style.display = "flex";
        }
      });
      previewVideo.addEventListener("error", async () => {
        const status = await fetchVideoStatus(item, { force: true });
        if (!status.playable) {
          previewVideo.removeAttribute("src");
          previewVideo.dataset.ready = "false";
          const button = card.querySelector(".play-button");
          if (button) {
            button.style.display = "flex";
          }
        }
      });
    }

    card.addEventListener("click", () => {
      openVideoModal(item);
    });
    playlistEl.appendChild(card);
  });
}

// Video modal functions
let currentModal = null;
let currentModalVideo = null;

async function openVideoModal(item) {
  if (!item) {
    return;
  }

  if (currentModal) {
    closeVideoModal();
  }

  const title = getDisplayTitle(item);
  const description = getDisplayDescription(item);
  const category = item.category || detectCategory(item);
  const duration = formatDuration(Number(item.duration || 0));

  currentModal = document.createElement("div");
  currentModal.id = `video-modal-${item.id}`;
  currentModal.className = "video-modal";
  currentModal.dataset.itemId = String(item.id || "");

  const dialog = document.createElement("div");
  dialog.className = "video-modal__dialog";

  const header = document.createElement("div");
  header.className = "video-modal__header";

  const headerCopy = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "video-modal__eyebrow";
  eyebrow.textContent = "Preview";
  const titleEl = document.createElement("h3");
  titleEl.textContent = title;
  const metaEl = document.createElement("p");
  metaEl.className = "video-modal__meta";
  metaEl.textContent = `${category} • ${duration} • ${description}`;
  headerCopy.append(eyebrow, titleEl, metaEl);

  const closeBtn = document.createElement("button");
  closeBtn.className = "video-modal__close";
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Yopish");
  closeBtn.textContent = "×";

  const body = document.createElement("div");
  body.className = "video-modal__body";

  currentModalVideo = document.createElement("video");
  currentModalVideo.id = `modal-video-${item.id}`;
  currentModalVideo.className = "video-modal__video";
  currentModalVideo.controls = true;
  currentModalVideo.autoplay = true;
  currentModalVideo.muted = false;
  currentModalVideo.preload = "auto";
  currentModalVideo.playsInline = true;
  currentModalVideo.setAttribute("playsinline", "");
  currentModalVideo.setAttribute("webkit-playsinline", "");

  const info = document.createElement("div");
  info.className = "video-modal__status";
  info.textContent = "Video tayyorlanmoqda...";

  const actions = document.createElement("div");
  actions.className = "video-modal__actions";

  const saveBtn = document.createElement("button");
  saveBtn.className = "video-modal__button video-modal__button--ghost";
  saveBtn.type = "button";
  saveBtn.textContent = "Saqlash";

  const sendBtn = document.createElement("button");
  sendBtn.className = "video-modal__button video-modal__button--primary";
  sendBtn.type = "button";
  sendBtn.textContent = "Yuborish";

  const likeBtn = document.createElement("button");
  likeBtn.className = "video-modal__button video-modal__button--ghost video-modal__button--like";
  likeBtn.type = "button";
  likeBtn.textContent = "👍 0";

  body.append(info, currentModalVideo);
  actions.append(saveBtn, sendBtn, likeBtn);
  header.append(headerCopy, closeBtn);
  dialog.append(header, body, actions);
  currentModal.appendChild(dialog);

  const closeModal = () => {
    closeVideoModal();
  };

  closeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    closeModal();
  });
  currentModal.addEventListener("click", (event) => {
    if (event.target === currentModal) {
      closeModal();
    }
  });

  currentModalKeydownHandler = (event) => {
    if (event.key === "Escape") {
      closeModal();
    }
  };
  document.addEventListener("keydown", currentModalKeydownHandler);

  saveBtn.addEventListener("click", async (event) => {
    event.stopPropagation();
    const currentItem = getCurrentModalItem();
    if (currentItem) {
      await saveVideoToProfile(currentItem);
    }
  });

  sendBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const currentItem = getCurrentModalItem();
    if (currentItem) {
      sendVideoToBot(currentItem);
    }
  });

  document.body.appendChild(currentModal);
  syncBodyOverlayState();

  const applyReactionState = (state) => {
    if (!state) return;
    likeBtn.textContent = `👍 ${Number(state.likes || 0)}`;
    likeBtn.classList.toggle("is-active", state.user_reaction === "likes");
  };

  likeBtn.addEventListener("click", async (event) => {
    event.stopPropagation();
    const currentItem = getCurrentModalItem();
    if (currentItem) {
      const state = await likeVideoFromModal(currentItem);
      applyReactionState(state);
    }
  });

  loadVideoReactionState(item).then(applyReactionState);

  const status = await fetchVideoStatus(item);
  if (status.playable && status.stream_url) {
    currentModalVideo.src = status.stream_url;
    currentModalVideo.preload = "metadata";
    currentModalVideo.load();
    info.classList.add("is-hidden");
    const playPromise = currentModalVideo.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch((error) => {
        console.error("Modal video autoplay failed:", error);
      });
    }
  } else {
    currentModalVideo.style.display = "none";
    info.classList.remove("is-hidden");
    info.textContent = status.message || `Video: ${title}\n\nBu video webda ochilmaydi.\n"Yuborish" tugmasi bilan botga yuboring.`;
  }

  currentModalVideo.addEventListener("error", async () => {
    const refreshedStatus = await fetchVideoStatus(item, { force: true });
    currentModalVideo.style.display = "none";
    info.classList.remove("is-hidden");
    info.textContent =
      refreshedStatus.message || `Video: ${title}\n\nVideo yuklanmadi.\nUni botga yuborib ko'ring.`;
  });
}

function closeVideoModal() {
  if (currentModalVideo) {
    currentModalVideo.pause();
    currentModalVideo.removeAttribute("src");
    currentModalVideo.load();
  }
  if (currentModal?.parentNode) {
    currentModal.parentNode.removeChild(currentModal);
  }
  currentModal = null;
  currentModalVideo = null;
  if (currentModalKeydownHandler) {
    document.removeEventListener("keydown", currentModalKeydownHandler);
    currentModalKeydownHandler = null;
  }
  syncBodyOverlayState();
}

function getCurrentModalItem() {
  if (!currentModal || !currentModal.dataset.itemId) return null;
  const itemId = Number(currentModal.dataset.itemId);
  return findItemById(itemId);
}

function openProfileModal() {
  if (isAutoDetectedUserId) {
    return;
  }
  syncProfileUi();
  profileModalEl?.classList.remove("is-hidden");
  profileModalEl?.setAttribute("aria-hidden", "false");
  syncBodyOverlayState();
  profileInputEl?.focus();
}

function closeProfileModal() {
  profileModalEl?.classList.add("is-hidden");
  profileModalEl?.setAttribute("aria-hidden", "true");
  syncBodyOverlayState();
}

function showTopToast(message) {
  const normalized = String(message || "").trim();
  if (!normalized || !topToastEl) return;

  const lower = normalized.toLowerCase();
  let text = normalized;

  if (lower.includes("saqlandi")) {
    text = "✅ Saqlandi. Playlistingizni /playlist orqali ko'ring.";
  } else if (lower.includes("yuborildi")) {
    text = "📤 Yuborildi.";
  } else if (lower.includes("yoqtirildi")) {
    text = "👍 Yoqtirildi.";
  } else if (lower.includes("o'chirildi") || lower.includes("ombordan olib tashlandi") || lower.includes("pleylistdan olib tashlandi")) {
    text = "🗑️ O'chirildi.";
  }

  topToastEl.textContent = text;
  topToastEl.classList.remove("is-hidden");
  topToastEl.classList.add("is-visible");

  if (topToastTimerId) {
    window.clearTimeout(topToastTimerId);
  }

  topToastTimerId = window.setTimeout(() => {
    topToastEl.classList.remove("is-visible");
    topToastEl.classList.add("is-hidden");
    topToastTimerId = null;
  }, 2600);
}

function syncProfileUi() {
  if (!profileInputEl || !profileSubmitEl) return;
  profileInputEl.value = selectedTargetUserId;
  profileInputEl.readOnly = Boolean(selectedTargetUserId) || isAutoDetectedUserId;
  profileInputEl.placeholder = isAutoDetectedUserId
    ? "Telegram orqali avtomatik ulandi"
    : selectedTargetUserId
      ? "ID saqlangan"
      : "ID ingizni kiriting";
  profileSubmitEl.textContent = isAutoDetectedUserId ? "TELEGRAM ORQALI ULANGAN" : selectedTargetUserId ? "O'CHIRISH" : "KIRISH";
  profileSubmitEl.disabled = isAutoDetectedUserId;
  profileSubmitEl.classList.toggle("profile-card__submit--danger", Boolean(selectedTargetUserId) && !isAutoDetectedUserId);
  applyProfileAvatarState(profileBadgeEl, getProfileBadgeText());
  applyProfileAvatarState(profileCardBadgeEl, getProfileBadgeText());
  applyProfileAvatarState(bottomDockAvatarEl, getProfileBadgeText());
  applyProfileAvatarState(profileShowcaseAvatarEl, getProfileBadgeText());
  renderSharedProfileUsers();
  if (profileModalTitleEl) {
    profileModalTitleEl.textContent = selectedTargetUserId ? `ID ${selectedTargetUserId}` : "HIDOP BOT User";
  }
  if (profileButtonEl) {
    profileButtonEl.setAttribute("aria-label", selectedTargetUserId ? `Profil ${selectedTargetUserId}` : "Profil");
  }
  if (bottomDockProfileEl) {
    bottomDockProfileEl.setAttribute("aria-label", selectedTargetUserId ? `Profil ${selectedTargetUserId}` : "Profil");
  }
  syncProfileDetailsUi();
  syncBottomDockState();
}

function loadStoredTargetUserId() {
  const telegramUserId = getTelegramUserId();
  if (telegramUserId) {
    selectedTargetUserId = telegramUserId;
    isAutoDetectedUserId = true;
    syncProfileUi();
    return;
  }

  isAutoDetectedUserId = false;
  try {
    const savedValue = window.localStorage.getItem(TARGET_USER_STORAGE_KEY) || "";
    selectedTargetUserId = /^\d+$/.test(savedValue) ? savedValue : "";
  } catch {
    selectedTargetUserId = "";
  }
  syncProfileUi();
}

function persistTargetUserId(value) {
  try {
    if (value) {
      window.localStorage.setItem(TARGET_USER_STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(TARGET_USER_STORAGE_KEY);
    }
  } catch {
    // Ignore storage issues.
  }
}

async function submitProfileId() {
  if (isAutoDetectedUserId) {
    closeProfileModal();
    return;
  }

  if (selectedTargetUserId) {
    const wasInOmbor = activeCategory === "Pleylist";
    selectedTargetUserId = "";
    telegramProfilePhotoUrl = "";
    sharedProfileUsers = [];
    persistTargetUserId("");
    savedItems = [];
    if (wasInOmbor) {
      activeCategory = "LANDING";
    }
    syncProfileUi();
    await loadTelegramProfilePhoto();
    await loadSharedProfileUsers();
    buildFilters(allItems);
    render();
    showTopToast("o'chirildi ✅");
    return;
  }

  const rawValue = String(profileInputEl?.value || "").trim();
  if (!/^\d+$/.test(rawValue)) {
    showAppAlert("ID raqam bo'lishi kerak.");
    profileInputEl?.focus();
    return;
  }

  selectedTargetUserId = rawValue;
  isAutoDetectedUserId = false;
  persistTargetUserId(rawValue);
  telegramProfilePhotoUrl = "";
  syncProfileUi();
  await loadTelegramProfilePhoto();
  await loadSharedProfileUsers();
  await refreshSavedItems();
  activeCategory = "Pleylist";
  buildFilters(allItems);
  render();
  closeProfileModal();
  showTopToast("saqlandi ✅");
}

profileButtonEl?.addEventListener("click", openProfileModal);
bottomDockHomeEl?.addEventListener("click", () => {
  closeSearch({ clearQuery: false });
  setActiveCategory("LANDING");
});
bottomDockPlaylistEl?.addEventListener("click", () => {
  closeSearch({ clearQuery: false });
  setActiveCategory("HOME");
});
bottomDockCreateEl?.addEventListener("click", () => {
  closeSearch({ clearQuery: false });
  setActiveCategory("Pleylist");
});
bottomDockSearchEl?.addEventListener("click", () => {
  closeSearch({ clearQuery: false });
  setActiveCategory("EMPTY");
  holoInputEl?.focus();
});
bottomDockProfileEl?.addEventListener("click", () => {
  closeSearch({ clearQuery: false });
  setActiveCategory("PROFILE");
});
profileModalBackdropEl?.addEventListener("click", closeProfileModal);
profileModalCloseEl?.addEventListener("click", closeProfileModal);
profileSubmitEl?.addEventListener("click", submitProfileId);
profileShowcaseMenuEl?.addEventListener("click", openProfileDetailsEditor);
profileDetailsSaveEl?.addEventListener("click", saveProfileDetails);
saveSuccessButtonEl?.addEventListener("click", () => {
  closeSaveRedirectModal();
});
saveSuccessModalEl?.addEventListener("click", (event) => {
  if (event.target === saveSuccessModalEl) {
    closeSaveRedirectModal();
  }
});
profileInputEl?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitProfileId();
  }
});

profileDetailsLastNameEl?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    saveProfileDetails();
  }
});

themeToggleEl?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleThemePanel();
});
themeOptionEls.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const themeName = button.dataset.theme || "default";
    applyTheme(themeName);
    persistTheme(themeName);
    closeThemePanel();
  });
});

holoInputEl?.addEventListener("input", (event) => {
  activeQuery = String(event.target.value || "").toLowerCase();
  render();
});

holoInputEl?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    holoInputEl.value = "";
    activeQuery = "";
    render();
  }
});

// Initialize the app
async function initializeApp() {
  loadStoredTheme();
  loadStoredTargetUserId();
  syncSearchState();
  syncBodyOverlayState();
  await loadTelegramProfilePhoto();
  await loadSharedProfileUsers();

  allItems = await loadItems();
  await refreshSavedItems();

  refreshView();
  startCatalogAutoRefresh();
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

window.addEventListener("focus", () => {
  refreshCatalogView().catch((error) => {
    console.error("Catalog focus refresh failed:", error);
  });
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    return;
  }
  refreshCatalogView().catch((error) => {
    console.error("Catalog visibility refresh failed:", error);
  });
});
