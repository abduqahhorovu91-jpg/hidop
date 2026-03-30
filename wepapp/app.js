const tg = window.Telegram?.WebApp;
const IS_LOCAL_HOST = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const API_BASE_URL = IS_LOCAL_HOST
  ? `http://127.0.0.1:8000`
  : ""; // Empty string means same origin (current domain)
const TARGET_USER_STORAGE_KEY = "hidop_target_user_id";
const categoryOrder = ["HOME", "Ombor"];
let allItems = [];
let activeCategory = "HOME";
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

// Show play button when video is paused
document.addEventListener('DOMContentLoaded', function() {
  document.addEventListener('click', function(e) {
    if (e.target.tagName === 'VIDEO') {
      const thumb = e.target.closest('.thumb');
      const button = thumb.querySelector('.play-button');
      
      if (e.target.paused) {
        if (button) button.style.display = 'flex';
      } else {
        if (button) button.style.display = 'none';
      }
    }
  });
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
const filtersEl = document.getElementById("filters");
const libraryListEl = document.getElementById("libraryList");
const libraryCountEl = document.getElementById("libraryCount");
const libraryEmptyEl = document.getElementById("libraryEmpty");
const libraryTitleEl = document.getElementById("libraryTitle");
const libraryUserInfoEl = document.getElementById("libraryUserInfo");
const currentUserIdEl = document.getElementById("currentUserId");
const changeUserBtnEl = document.getElementById("changeUserBtn");
const searchInputEl = document.getElementById("searchInput");
const searchRowEl = document.getElementById("searchRow");
const searchToggleEl = document.getElementById("searchToggle");
const emptyStateEl = document.getElementById("emptyState");
const profileModalEl = document.getElementById("profileModal");
const profileModalBackdropEl = document.getElementById("profileModalBackdrop");
const profileModalCloseEl = document.getElementById("profileModalClose");
const profileButtonEl = document.querySelector(".telegram-bar__profile");
const profileInputEl = document.getElementById("profileInput");
const profileSubmitEl = document.getElementById("profileSubmit");
const saveSuccessModalEl = document.getElementById("saveSuccessModal");
const saveSuccessStatusEl = document.getElementById("saveSuccessStatus");
const saveSuccessDescriptionEl = document.getElementById("saveSuccessDescription");
const saveSuccessButtonEl = document.getElementById("saveSuccessButton");
const randomToggleEl = document.getElementById("randomToggle");
const profileBadgeEl = document.querySelector(".profile-badge");
const profileCardBadgeEl = document.querySelector(".profile-card__badge");
const profileModalTitleEl = document.getElementById("profileModalTitle");
const heroDescriptionEl = document.getElementById("heroDescription");
const heroCatalogCountEl = document.getElementById("heroCatalogCount");
const heroSavedCountEl = document.getElementById("heroSavedCount");
const heroProfileStateEl = document.getElementById("heroProfileState");
const heroActiveCategoryEl = document.getElementById("heroActiveCategory");
const filterSummaryEl = document.getElementById("filterSummary");
const sectionTitleEl = document.getElementById("sectionTitle");
const sectionMetaEl = document.getElementById("sectionMeta");

const demoItems = [
  {
      "id": 1,
      "file_id": "BAACAgEAAxkBAAIu8Gm3vu0Dvp9swEyiSwst554j836hAAL8AQACrKmZRnTp4jk1Ax14OgQ",
      "title": "Merlin 1-𝑸𝑰𝑺𝑴🔮✨",
      "added_by": 8239140931,
      "added_at": "2026-03-16T13:28:32",
      "comment": "Ajdarho chaqiruvi 🐉",
      "duration": 2560
    },
    {
      "id": 2,
      "file_id": "BAACAgEAAxkBAAIu-2m3v0hhr487En89rfzwcDRjBLx0AAL9AQACrKmZRks-q5eB0CQDOgQ",
      "title": "Merlin 2-𝑸𝑰𝑺𝑴🔮✨",
      "added_by": 8239140931,
      "added_at": "2026-03-16T13:31:21",
      "comment": "Dovyurak ritsar ⚔️",
      "duration": 2682
    },
    {
      "id": 3,
      "file_id": "BAACAgEAAxkBAAIvBGm3v-YzCbUw_URmvI_86KP6RNXoAAL-AQACrKmZRkue2CBG41c7OgQ",
      "title": "Merlin 3-𝑸𝑰𝑺𝑴🔮✨",
      "added_by": 8239140931,
      "added_at": "2026-03-16T13:35:37",
      "comment": "Nimue tamgʻasi 🔮",
      "duration": 2627
    },
    {
      "id": 4,
      "file_id": "BAACAgEAAxkBAAIvEGm3wQE238obCOmv3pO0bY496oLZAAL_AQACrKmZRjFwCCeP2ZJtOgQ",
      "title": "Merlin 4-𝑸𝑰𝑺𝑴🔮✨",
      "added_by": 8239140931,
      "added_at": "2026-03-16T13:37:48",
      "comment": "Zaharlangan qadaq 🍺",
      "duration": 2669
    },
    {
      "id": 5,
      "file_id": "BAACAgEAAxkBAAIvGWm3wWhPHcsTnUqe_sUVtehuGHrmAAMCAAKsqZlGAAHL5a2-VsY6OgQ",
      "title": "Merlin 5-𝑸𝑰𝑺𝑴🔮✨",
      "added_by": 8239140931,
      "added_at": "2026-03-16T13:39:58",
      "comment": "Lancelot 🗡️",
      "duration": 2644
    },
];

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

function applyProfileAvatarState(element, fallbackText) {
  if (!element) return;

  const photoUrl = getTelegramUserPhotoUrl();
  element.textContent = fallbackText;
  element.classList.toggle("has-photo", Boolean(photoUrl));
  element.closest(".telegram-bar__profile")?.classList.toggle("has-photo-avatar", Boolean(photoUrl));

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

function getVisibleSourceItems() {
  return activeCategory === "Ombor" ? savedItems : allItems;
}

function getLibrarySourceItems() {
  return activeCategory === "Ombor" ? savedItems : catalogItems;
}

function getFilteredItems(items = getVisibleSourceItems()) {
  return items.filter((item) => {
    const categoryOk = activeCategory === "HOME" || item.category === activeCategory;
    return categoryOk && matchesSearch(item);
  });
}

function syncBodyOverlayState() {
  const profileOpen = Boolean(profileModalEl && !profileModalEl.classList.contains("is-hidden"));
  const saveSuccessOpen = Boolean(saveSuccessModalEl && !saveSuccessModalEl.classList.contains("is-hidden"));
  document.body.classList.toggle("has-overlay", profileOpen || Boolean(currentModal) || saveSuccessOpen);
}

function syncSearchState() {
  if (!searchRowEl || !searchToggleEl) return;
  const isOpen = !searchRowEl.classList.contains("is-hidden");
  searchToggleEl.setAttribute("aria-expanded", String(isOpen));
  document.body.classList.toggle("search-open", isOpen);
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
  if (heroCatalogCountEl) {
    heroCatalogCountEl.textContent = String(catalogItems.length);
  }
  if (heroSavedCountEl) {
    heroSavedCountEl.textContent = String(savedItems.length);
  }
  if (heroProfileStateEl) {
    heroProfileStateEl.textContent = selectedTargetUserId ? `#${selectedTargetUserId}` : "Ulanmagan";
  }
  if (heroActiveCategoryEl) {
    heroActiveCategoryEl.textContent = activeCategory;
  }
  if (filterSummaryEl) {
    filterSummaryEl.textContent = activeQuery
      ? `Qidiruv: ${activeQuery}`
      : activeCategory === "Ombor"
        ? "Shaxsiy ombor"
        : "Asosiy katalog";
  }
  if (heroDescriptionEl) {
    heroDescriptionEl.textContent = activeQuery
      ? `"${activeQuery}" bo'yicha topilgan videolar saralanmoqda.`
      : activeCategory === "Ombor"
        ? (selectedTargetUserId
          ? "Saqlangan videolar, like va yuborish oqimi shu yerda jamlandi."
          : "Omborni ko'rish uchun profilingizni ulang.")
        : "Katalogdagi videolarni preview qiling, saqlang va botga yuboring.";
  }
  if (sectionTitleEl) {
    sectionTitleEl.textContent = activeQuery
      ? "Qidiruv natijalari"
      : activeCategory === "Ombor"
        ? "Saqlangan videolar"
        : "So'nggi videolar";
  }
  if (sectionMetaEl) {
    sectionMetaEl.textContent = activeQuery
      ? `${visibleItems.length} ta natija`
      : `${visibleItems.length} ta video`;
  }
  if (emptyStateEl) {
    emptyStateEl.textContent = activeQuery
      ? "Qidiruv bo'yicha hech narsa topilmadi."
      : activeCategory === "Ombor"
        ? "Omborda hali video yo'q."
        : "Katalogda hozircha video topilmadi.";
  }
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
    haystack.includes("ombor")
  ) return "Ombor";
  return "HOME";
}

function detectPalette(item) {
  switch (detectCategory(item)) {
    case "Ombor":
      return "instagram";
    default:
      return "night";
  }
}

async function loadItems() {
  try {
    console.log("Fetching videos from API...");
    const response = await fetch(`${API_BASE_URL}/api/catalog`, { cache: "no-store" });
    console.log("API response:", response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const payload = await response.json();
    console.log("API payload:", payload);
    
    const items = Array.isArray(payload?.items) ? payload.items : [];
    console.log("Items from API:", items.length);
    
    if (items.length === 0) {
      console.log("No videos found, using demo items");
      catalogItems = [...demoItems];
      return demoItems;
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
      poster_url: normalizeApiUrl(item.poster_url || ""),
      trailer_url: normalizeApiUrl(item.trailer_url || ""),
      added_at: item.added_at || "",
      web_streamable: typeof item.web_streamable === "boolean" ? item.web_streamable : null,
      web_stream_error: item.web_stream_error || "",
      web_stream_message: item.web_stream_message || "",
      web_stream_source: item.web_stream_source || "",
      file_size: Number(item.file_size || 0),
    }));
    
    console.log("Processed catalog items:", catalogItems.length);
    return catalogItems;
    
  } catch (error) {
    console.error("Failed to load videos:", error);
    console.log("Using demo items as fallback");
    catalogItems = [...demoItems];
    return demoItems;
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
      poster_url: normalizeApiUrl(item.poster_url || ""),
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
  return selectedTargetUserId || "";
}

async function refreshSavedItems() {
  savedItems = await loadSavedItems();
}

function buildFilters(items) {
  if (!filtersEl) return;

  const orderedCategories = categoryOrder;
  const counts = {
    HOME: catalogItems.length,
    Ombor: savedItems.length,
  };

  filtersEl.innerHTML = "";
  orderedCategories.forEach((category) => {
    const button = document.createElement("button");
    button.className = "filter-chip";
    button.type = "button";
    button.classList.toggle("is-active", category === activeCategory);
    button.classList.toggle("is-locked", category === "Ombor" && !selectedTargetUserId);
    button.setAttribute("aria-pressed", String(category === activeCategory));
    button.innerHTML = `<span>${category}</span><strong>${counts[category] || 0}</strong>`;
    button.addEventListener("click", () => {
      if (category === "Ombor" && !selectedTargetUserId) {
        openProfileModal();
        profileInputEl?.focus();
        return;
      }
      activeCategory = category;
      buildFilters(items);
      render();
      renderLibrary();
    });
    filtersEl.appendChild(button);
  });
}

function refreshView() {
  buildFilters(allItems);
  render();
  renderLibrary();
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
  if (category === "Ombor") return "#ffba56";
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

function sendVideoToBot(item) {
  if (!item) return;
  if (!selectedTargetUserId) {
    openProfileModal();
    profileInputEl?.focus();
    return;
  }
  const payload = {
    type: "send_video",
    video_id: item.id,
    title: item.saved_name || item.title || "",
    source: activeCategory,
    target_user_id: selectedTargetUserId,
  };

  if (tg) {
    try {
      fetch(`${API_BASE_URL}/api/send-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((response) => response.json())
        .then((result) => {
          if (result?.ok) {
            showTopToast("yuborildi ✅");
            return;
          }
          window.alert(result?.message || result?.error || "Video yuborilmadi.");
        })
        .catch(() => {
          window.alert("Video yuborishda xatolik bo'ldi.");
        });
      showTopToast("yuborilmoqda ✅");
      return;
    } catch (_) {
      window.alert("Video yuborishda xatolik bo'ldi.");
      return;
    }
  }

  fetch(`${API_BASE_URL}/api/send-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then((response) => response.json())
    .then((result) => {
      if (result?.ok) {
        showTopToast("yuborildi ✅");
        return;
      }
      window.alert(result?.message || result?.error || "Video yuborilmadi.");
    })
    .catch(() => {
      window.alert("Video yuborishda xatolik bo'ldi.");
    });
}

function removeSavedVideoFromUi(itemId, triggerElement = null) {
  savedItems = savedItems.filter((savedItem) => Number(savedItem.id) !== Number(itemId));

  const card = triggerElement?.closest(".card");
  const row = triggerElement?.closest(".library-item");
  card?.remove();
  row?.remove();

  const visibleItems = sortBySearchRelevance(getFilteredItems(getVisibleSourceItems()));
  updateDashboard(visibleItems);

  if (libraryCountEl) {
    const libraryItems = sortBySearchRelevance(getFilteredItems(getLibrarySourceItems()));
    libraryCountEl.textContent = `${libraryItems.length} ta`;
    libraryEmptyEl?.classList.toggle("is-hidden", libraryItems.length > 0);
  }

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
        window.alert(result?.message || result?.error || "Video o'chirilmadi.");
        return;
      }
      removeSavedVideoFromUi(item.id, triggerElement);
      showTopToast("ombordan olib tashlandi ✅");
    })
    .catch(() => {
      window.alert("Video o'chirishda xatolik bo'ldi.");
    });
}

function ensureTargetUserId() {
  if (selectedTargetUserId) {
    return selectedTargetUserId;
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
      window.alert(result?.message || result?.error || "Video saqlanmadi.");
      return false;
    }
    await refreshSavedItems();
    rerenderPreservingScroll(() => {
      render();
      renderLibrary();
    });
    openSaveRedirectModal({
      title: result?.already_saved ? "Allaqachon saqlangan!" : "Saqlandi!",
      description: "Playlistingizni /playlist orqali ko'ring.",
      buttonText: "OK",
    });
    return true;
  } catch {
    window.alert("Video saqlashda xatolik bo'ldi.");
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
      window.alert(result?.message || result?.error || "Like qo'yilmadi.");
      return null;
    }
    showTopToast("yoqtirildi 👍");
    return result;
  } catch {
    window.alert("Like qo'yishda xatolik bo'ldi.");
    return null;
  }
}

function matchesSearch(item) {
  if (!activeQuery) return true;
  const haystack = [
    item.title || "",
    item.comment || "",
    item.category || "",
    String(item.id ?? ""),
  ].join(" ").toLowerCase();
  return haystack.includes(activeQuery);
}

function getSearchScore(item) {
  if (!activeQuery) return 0;

  const title = String(item.title || "").toLowerCase().trim();
  const comment = String(item.comment || "").toLowerCase().trim();
  const category = String(item.category || "").toLowerCase().trim();
  const idText = String(item.id ?? "").toLowerCase().trim();

  if (title === activeQuery) return 1000;
  if (idText === activeQuery) return 950;
  if (title.startsWith(activeQuery)) return 900 - Math.min(title.length, 200);

  const titleWords = title.split(/\s+/).filter(Boolean);
  if (titleWords.some((word) => word.startsWith(activeQuery))) return 820;

  if (comment.startsWith(activeQuery) || category.startsWith(activeQuery)) return 760;
  if (title.includes(activeQuery)) return 680;
  if (comment.includes(activeQuery) || category.includes(activeQuery)) return 560;
  if (idText.includes(activeQuery)) return 520;

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

function pickRandomItem(items, excludedItemId = null) {
  const sourceItems = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!sourceItems.length) {
    return null;
  }

  const filteredItems = sourceItems.filter((item) => Number(item?.id || 0) !== Number(excludedItemId || 0));
  const candidates = filteredItems.length ? filteredItems : sourceItems;
  return candidates[Math.floor(Math.random() * candidates.length)] || null;
}

function renderLibrary() {
  if (!libraryListEl || !libraryCountEl || !libraryEmptyEl || !libraryTitleEl || !libraryUserInfoEl) {
    return;
  }

  const sourceItems = getLibrarySourceItems();
  const orderedCatalog = sortBySearchRelevance(getFilteredItems(sourceItems));

  if (activeCategory === "Ombor") {
    libraryTitleEl.textContent = "Shaxsiy ombor";
    if (selectedTargetUserId && currentUserIdEl) {
      libraryUserInfoEl.style.display = "flex";
      currentUserIdEl.textContent = `ID ${selectedTargetUserId}`;
    } else {
      libraryUserInfoEl.style.display = "none";
    }
  } else {
    libraryTitleEl.textContent = "Botga qo'shilgan videolar";
    libraryUserInfoEl.style.display = "none";
  }

  libraryListEl.innerHTML = "";
  libraryCountEl.textContent = `${orderedCatalog.length} ta`;
  libraryEmptyEl.classList.toggle("is-hidden", orderedCatalog.length > 0);
  libraryEmptyEl.textContent = activeCategory === "Ombor"
    ? "Omborda hali video yo'q."
    : "Katalog ro'yxatida hozircha video yo'q.";

  orderedCatalog.forEach((item) => {
    const safeId = escapeHtml(item.id ?? "?");
    const title = escapeHtml(getDisplayTitle(item));
    const description = escapeHtml(getDisplayDescription(item));
    const category = escapeHtml(item.category || detectCategory(item));
    const ageLabel = escapeHtml(item.ageLabel || "Kutubxonada");
    const posterUrl = normalizeApiUrl(item.poster_url || item.preview_url || "");
    const row = document.createElement("article");
    row.className = "library-item";
    row.innerHTML = `
      <div class="library-item__poster"${posterUrl ? ` style="background-image: url('${escapeHtml(posterUrl)}')"` : ""}>
        <div class="library-item__id">#${safeId}</div>
      </div>
      <div class="library-item__body">
        <div class="library-item__top">
          <h3 class="library-item__title">${title}</h3>
          <span class="library-item__chip">${category}</span>
        </div>
        <p class="library-item__meta">${description} • ${ageLabel}</p>
      </div>
      <div class="library-item__side">
        <div class="library-item__duration">${formatDuration(Number(item.duration || 0))}</div>
        <div class="library-item__actions">
          <button class="send-button" type="button">Yuborish</button>
          ${activeCategory === "Ombor" ? '<button class="more-button" type="button">O\'chirish</button>' : ""}
        </div>
      </div>
    `;
    row.querySelector(".send-button")?.addEventListener("click", (event) => {
      event.stopPropagation();
      sendVideoToBot(item);
    });
    row.querySelector(".more-button")?.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteSavedVideo(item, event.currentTarget);
    });
    row.addEventListener("click", () => {
      openVideoModal(item);
    });
    libraryListEl.appendChild(row);
  });
}

function render() {
  const sourceItems = getVisibleSourceItems();
  const ordered = sortBySearchRelevance(getFilteredItems(sourceItems));

  playlistEl.innerHTML = "";
  emptyStateEl.classList.toggle("is-hidden", ordered.length > 0);
  updateDashboard(ordered);

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
    const posterUrl = normalizeApiUrl(item.poster_url || "");
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
                ${activeCategory === "Ombor" ? '<button class="delete-button" type="button">O\'chirish</button>' : ""}
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

searchToggleEl?.addEventListener("click", () => {
  searchRowEl.classList.toggle("is-hidden");
  syncSearchState();
  if (!searchRowEl.classList.contains("is-hidden")) {
    searchInputEl.focus();
  } else {
    searchInputEl.value = "";
    activeQuery = "";
    render();
    renderLibrary();
  }
});

searchInputEl?.addEventListener("input", (event) => {
  activeQuery = event.target.value.trim().toLowerCase();
  render();
  renderLibrary();
});

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
  if (!normalized) return;

  const lower = normalized.toLowerCase();
  let title = normalized;
  let description = "";

  if (lower.includes("saqlandi")) {
    title = "✅ Saqlandi!";
    description = "Playlistingizni /playlist orqali ko'ring.";
  } else if (lower.includes("yuborildi")) {
    title = "📤 Yuborildi!";
  } else if (lower.includes("yoqtirildi")) {
    title = "👍 Yoqtirildi!";
  } else if (lower.includes("o'chirildi") || lower.includes("ombordan olib tashlandi")) {
    title = "🗑️ O'chirildi!";
  }

  openSaveRedirectModal({
    dialogTitle: "Telegram",
    title,
    description,
    buttonText: "OK",
  });
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
  if (profileModalTitleEl) {
    profileModalTitleEl.textContent = selectedTargetUserId ? `ID ${selectedTargetUserId}` : "HIDOP BOT User";
  }
  if (profileButtonEl) {
    profileButtonEl.setAttribute("aria-label", selectedTargetUserId ? `Profil ${selectedTargetUserId}` : "Profil");
  }
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
    const wasInOmbor = activeCategory === "Ombor";
    selectedTargetUserId = "";
    telegramProfilePhotoUrl = "";
    persistTargetUserId("");
    savedItems = [];
    if (wasInOmbor) {
      activeCategory = "HOME";
    }
    syncProfileUi();
    await loadTelegramProfilePhoto();
    buildFilters(allItems);
    render();
    renderLibrary();
    showTopToast("o'chirildi ✅");
    return;
  }

  const rawValue = String(profileInputEl?.value || "").trim();
  if (!/^\d+$/.test(rawValue)) {
    window.alert("ID raqam bo'lishi kerak.");
    profileInputEl?.focus();
    return;
  }

  selectedTargetUserId = rawValue;
  isAutoDetectedUserId = false;
  persistTargetUserId(rawValue);
  telegramProfilePhotoUrl = "";
  syncProfileUi();
  await loadTelegramProfilePhoto();
  await refreshSavedItems();
  activeCategory = "Ombor";
  buildFilters(allItems);
  render();
  renderLibrary();
  closeProfileModal();
  showTopToast("saqlandi ✅");
}

profileButtonEl?.addEventListener("click", openProfileModal);
profileModalBackdropEl?.addEventListener("click", closeProfileModal);
profileModalCloseEl?.addEventListener("click", closeProfileModal);
profileSubmitEl?.addEventListener("click", submitProfileId);
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

changeUserBtnEl?.addEventListener("click", () => {
  openProfileModal();
  profileInputEl?.focus();
});

randomToggleEl?.addEventListener("click", () => {
  const allCards = document.querySelectorAll(".card");
  allCards.forEach((card, index) => {
    card.style.transition = "transform 0.5s ease, opacity 0.5s ease";
    card.style.transform = "rotateY(360deg) scale(0.94)";
    card.style.opacity = "0.7";

    setTimeout(() => {
      card.style.transform = "rotateY(720deg) scale(1)";
      card.style.opacity = "1";
    }, index * 100);
  });

  setTimeout(() => {
    const randomItem = pickRandomItem(getFilteredItems(getVisibleSourceItems()));
    if (!randomItem) {
      showTopToast("Video topilmadi.");
      allCards.forEach((card) => {
        card.style.transform = "";
        card.style.opacity = "";
      });
      return;
    }
    openVideoModal(randomItem);

    setTimeout(() => {
      allCards.forEach((card) => {
        card.style.transform = "";
        card.style.opacity = "";
      });
    }, 500);
  }, allCards.length * 100 + 500);
});

// Initialize the app
async function initializeApp() {
  loadStoredTargetUserId();
  syncSearchState();
  syncBodyOverlayState();
  await loadTelegramProfilePhoto();

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
