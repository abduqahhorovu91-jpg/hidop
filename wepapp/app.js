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
let toastTimerId = null;

// Error handling for missing elements
window.addEventListener('error', function(e) {
  console.error('JavaScript error:', e.error);
});

// Toggle video play/pause function
function toggleVideo(button) {
  const thumb = button.closest('.thumb');
  const video = thumb.querySelector('video');
  
  if (video) {
    if (video.paused) {
      // Optimize video loading
      video.currentTime = 0;
      
      // Preload video for faster loading
      video.preload = 'auto';
      
      // Set optimal loading strategy
      video.load();
      
      // Try to play with optimizations
      const playPromise = video.play();
      
      if (playPromise !== undefined) {
        playPromise.then(() => {
          button.style.display = 'none';
          console.log('Video playing successfully');
        }).catch(err => {
          console.log('Video play error:', err);
          
          // Fallback strategies
          if (err.name === 'NotAllowedError') {
            // Try muted autoplay
            video.muted = true;
            video.play().then(() => {
              button.style.display = 'none';
              console.log('Video playing muted');
            });
          } else if (err.name === 'NotSupportedError') {
            console.log('Video format not supported');
          } else {
            // Try with lower quality
            video.style.width = '50%';
            video.play().then(() => {
              button.style.display = 'none';
              video.style.width = '100%'; // Restore full size
            });
          }
        });
      }
    } else {
      video.pause();
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
  tg.setHeaderColor("#102318");
  tg.setBackgroundColor("#102318");
}

// Auto-save Telegram user ID if available
if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
  const telegramUserId = tg.initDataUnsafe.user.id.toString();
  if (telegramUserId) {
    selectedTargetUserId = telegramUserId;
    localStorage.setItem(TARGET_USER_STORAGE_KEY, telegramUserId);
    console.log("Telegram user ID auto-saved:", telegramUserId);
  }
}

const playlistEl = document.getElementById("playlist");
const filtersEl = document.getElementById("filters");
const statsEl = document.getElementById("stats");
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
const topToastEl = document.getElementById("topToast");

// Check URL parameters for auto-fill ID
const urlParams = new URLSearchParams(window.location.search);
const autoId = urlParams.get('id');
if (autoId && profileInputEl) {
  profileInputEl.value = autoId;
}

const demoItems = [
  {
    id: 1,
    title: "Merlin 1-QISM",
    comment: "Fantastik serial",
    category: "HOME",
    duration: 2618,
    ageLabel: "3 oy oldin",
    palette: "night",
    preview_url: "",
  },
  {
    id: 2,
    title: "Merlin 2-QISM",
    comment: "Musiqa",
    category: "HOME",
    duration: 28,
    ageLabel: "1 hafta oldin",
    palette: "instagram",
    preview_url: "",
  },
  {
    id: 3,
    title: "Merlin 3-QISM",
    comment: "Travel",
    category: "HOME",
    duration: 64,
    ageLabel: "2 kun oldin",
    palette: "youtube",
    preview_url: "",
  },
  {
    id: 4,
    title: "Merlin 4-QISM",
    comment: "City life",
    category: "HOME",
    duration: 42,
    ageLabel: "Kecha",
    palette: "night",
    preview_url: "",
  },
];

function formatDuration(seconds = 0) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function buildVideoFileUrl(itemId) {
  return `${API_BASE_URL}/api/video-file?video_id=${encodeURIComponent(itemId)}`;
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
      preview_url: item.preview_url || "",
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
    return Array.isArray(payload?.items) ? payload.items : [];
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

function buildStats(items) {
  if (!statsEl) return;

  const total = items.length;
  const totalDuration = items.reduce((sum, item) => sum + Number(item.duration || 0), 0);
  const categories = new Set(items.map((item) => item.category).filter(Boolean));

  statsEl.innerHTML = "";
  [
    `${total} ta video`,
    `${categories.size} ta bo'lim`,
    `${Math.max(1, Math.round(totalDuration / 60))} daqiqa kontent`,
  ].forEach((label) => {
    const pill = document.createElement("div");
    pill.className = "stat-pill";
    pill.textContent = label;
    statsEl.appendChild(pill);
  });
}

function buildFilters(items) {
  if (!filtersEl) return;
  
  // Always show both HOME and OMBOR filters
  const orderedCategories = categoryOrder;
  
  filtersEl.innerHTML = "";
  orderedCategories.forEach((category) => {
    const button = document.createElement("button");
    button.className = "filter-chip";
    button.type = "button";
    button.textContent = category;
    button.classList.toggle("is-active", category === activeCategory);
    button.addEventListener("click", () => {
      // If clicking OMBOR but no user ID, open profile modal
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

function getPlatformColor(category) {
  if (category === "Ombor") return "#ff5353";
  return "#f4f0dc";
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

function deleteSavedVideo(item) {
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
      savedItems = savedItems.filter((savedItem) => Number(savedItem.id) !== Number(item.id));
      render();
      renderLibrary();
      showTopToast("ombordan olib tashlandi ✅");
    })
    .catch(() => {
      window.alert("Video o'chirishda xatolik bo'ldi.");
    });
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

function renderLibrary() {
  if (!libraryListEl || !libraryCountEl || !libraryEmptyEl || !libraryTitleEl || !libraryUserInfoEl) {
    return;
  }

  let sourceItems;
  if (activeCategory === "Ombor") {
    sourceItems = savedItems;
  } else {
    sourceItems = catalogItems;
  }
  
  const filteredCatalog = sourceItems.filter((item) => {
    const categoryOk = activeCategory === "HOME" || item.category === activeCategory;
    return categoryOk && matchesSearch(item);
  });
  const orderedCatalog = sortBySearchRelevance(filteredCatalog);

  // Update library title and user info
  if (activeCategory === "Ombor") {
    libraryTitleEl.textContent = "Pleylist 📁";
    if (selectedTargetUserId && currentUserIdEl) {
      libraryUserInfoEl.style.display = "flex";
      currentUserIdEl.textContent = selectedTargetUserId;
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

  orderedCatalog.forEach((item) => {
    const row = document.createElement("article");
    row.className = "library-item";
    row.innerHTML = `
      <div class="library-item__id">#${item.id ?? "?"}</div>
      <div>
        <h3 class="library-item__title">${item.saved_name || item.title || "Sarlavha topilmadi"}</h3>
      </div>
      <div class="library-item__actions">
        <button class="send-button" type="button">Yuborish</button>
        ${activeCategory === "Ombor" ? '<button class="more-button" type="button">…</button>' : ""}
      </div>
      <div class="library-item__duration">${formatDuration(item.duration)}</div>
    `;
    row.querySelector(".send-button")?.addEventListener("click", (event) => {
      event.stopPropagation();
      sendVideoToBot(item);
    });
    row.querySelector(".more-button")?.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteSavedVideo(item);
    });
    row.addEventListener("click", () => {
      if (tg) {
        tg.sendData(JSON.stringify({ type: "catalog_item", video_id: item.id, title: item.title }));
      }
    });
    libraryListEl.appendChild(row);
  });
}

function render() {
  let sourceItems;
  if (activeCategory === "Ombor") {
    sourceItems = savedItems;
  } else {
    sourceItems = allItems;
  }
  
  const filtered = sourceItems.filter((item) => {
    const categoryOk = activeCategory === "HOME" || item.category === activeCategory;
    return categoryOk && matchesSearch(item);
  });
  const ordered = sortBySearchRelevance(filtered);

  // Always show videos, hide empty state
  playlistEl.innerHTML = "";
  emptyStateEl.classList.add("is-hidden");

  ordered.forEach((item, index) => {
    // Remove promo badge functionality
    
    const duration = formatDuration(item.duration || 0);
    const category = item.category || detectCategory(item);
    const platformColor = getPlatformColor(category);
    const ageLabel = "Yangi";
    const card = document.createElement("article");
    card.className = "card";
    card.style.animationDelay = `${Math.min(260, index * 60)}ms`;
    card.innerHTML = `
      <div class="thumb thumb--${item.palette || "night"}${item.preview_url ? " has-video" : ""}">
        ${item.preview_url ? `<video src="${item.preview_url}" muted loop playsinline preload="none"></video>` : ""}
        ${item.preview_url ? `<div class="play-button" onclick="toggleVideo(this)">▶</div>` : ""}
        <div class="thumb__label">${item.saved_name || item.title || "Sarlavha topilmadi"}</div>
        <div class="thumb__badge">${formatDuration(item.duration)}</div>
        <div class="thumb__platform" style="color:${platformColor}">
          <span class="thumb__platform-dot"></span>
          ${item.category || "Media"}
        </div>
      </div>
      <div class="meta">
        <div class="avatar" aria-hidden="true">·</div>
        <div class="meta__content">
          <div class="meta__top">
            <h3>${item.saved_name || item.title || "Sarlavha topilmadi"}</h3>
            <div class="meta__actions">
              <button class="send-button" type="button">Yuborish</button>
              ${activeCategory === "Ombor" ? '<button class="delete-button" type="button">O\'chirish</button>' : ""}
            </div>
          </div>
          <p>${item.comment || item.category} • ${item.ageLabel}</p>
        </div>
      </div>
    `;
    card.querySelector(".send-button")?.addEventListener("click", (event) => {
      event.stopPropagation();
      sendVideoToBot(item);
    });
    card.querySelector(".delete-button")?.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteSavedVideo(item);
    });
    card.addEventListener("click", () => {
      if (tg) {
        tg.sendData(JSON.stringify({ type: "playlist_item", video_id: item.id, title: item.title }));
      }
      
      // Open video in fullscreen modal
      openVideoModal(item);
    });
    playlistEl.appendChild(card);
  });
}

// Video modal functions
async function openVideoModal(item) {
  // Create modal overlay
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.95);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  `;
  
  // Create video container
  const videoContainer = document.createElement('div');
  videoContainer.style.cssText = `
    width: 90%;
    max-width: 800px;
    height: 80%;
    background: #000;
    border-radius: 12px;
    overflow: hidden;
    position: relative;
  `;
  
  // Create video element
  const video = document.createElement('video');
  video.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: contain;
  `;
  video.controls = true;
  video.autoplay = true;
  video.muted = false;
  
  // Create title
  const title = document.createElement('div');
  title.textContent = item.title || 'Video';
  title.style.cssText = `
    position: absolute;
    top: 10px;
    left: 10px;
    color: white;
    background: rgba(0, 0, 0, 0.7);
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 14px;
    z-index: 10;
  `;
  
  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '✕';
  closeBtn.style.cssText = `
    position: absolute;
    top: 10px;
    right: 10px;
    width: 32px;
    height: 32px;
    background: rgba(255, 255, 255, 0.2);
    border: none;
    border-radius: 50%;
    color: white;
    font-size: 18px;
    cursor: pointer;
    z-index: 10;
  `;
  
  const videoUrl = item.preview_url || (item.id ? buildVideoFileUrl(item.id) : "");

  if (videoUrl) {
    video.src = videoUrl;
  } else {
    // Fallback - show video info
    video.style.display = 'none';
    const info = document.createElement('div');
    info.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: white;
      font-size: 18px;
    `;
    info.textContent = `Video ID: ${item.id}\n${item.title || 'No title'}`;
    videoContainer.appendChild(info);
  }
  
  // Assemble modal
  videoContainer.appendChild(title);
  videoContainer.appendChild(closeBtn);
  videoContainer.appendChild(video);
  modal.appendChild(videoContainer);
  
  // Event handlers
  const closeModal = () => {
    document.body.removeChild(modal);
    video.pause();
    document.removeEventListener('keydown', handleKeydown);
  };
  
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Keyboard handler
  const handleKeydown = (e) => {
    if (e.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', handleKeydown);
  
  // Add to DOM
  document.body.appendChild(modal);
  
  // Cleanup on video end
  video.addEventListener('ended', () => {
    setTimeout(closeModal, 1000);
  });
  
  // Handle video load errors
  video.addEventListener('error', () => {
    console.error('Video loading error');
    video.style.display = 'none';
    const errorInfo = document.createElement('div');
    errorInfo.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: white;
      font-size: 18px;
      text-align: center;
    `;
    errorInfo.textContent = `Video: ${item.title}\n\nVideo yuklanmadi\nTelegram bot orqali ko'ring`;
    videoContainer.appendChild(errorInfo);
  });
}

searchToggleEl.addEventListener("click", () => {
  searchRowEl.classList.toggle("is-hidden");
  if (!searchRowEl.classList.contains("is-hidden")) {
    searchInputEl.focus();
  } else {
    searchInputEl.value = "";
    activeQuery = "";
    render();
    renderLibrary();
  }
});

searchInputEl.addEventListener("input", (event) => {
  activeQuery = event.target.value.trim().toLowerCase();
  render();
  renderLibrary();
});

function openProfileModal() {
  syncProfileUi();
  profileModalEl?.classList.remove("is-hidden");
  profileInputEl?.focus();
}

function closeProfileModal() {
  profileModalEl?.classList.add("is-hidden");
}

function showTopToast(message) {
  if (!topToastEl) return;
  topToastEl.textContent = message;
  topToastEl.classList.remove("is-hidden");
  if (toastTimerId) {
    window.clearTimeout(toastTimerId);
  }
  toastTimerId = window.setTimeout(() => {
    topToastEl.classList.add("is-hidden");
  }, 2200);
}

function syncProfileUi() {
  if (!profileInputEl || !profileSubmitEl) return;
  profileInputEl.value = selectedTargetUserId;
  profileInputEl.readOnly = Boolean(selectedTargetUserId);
  profileInputEl.placeholder = selectedTargetUserId ? "ID saqlangan" : "ID ingizni kiriting";
  profileSubmitEl.textContent = selectedTargetUserId ? "O'CHIRISH" : "KIRISH";
  profileSubmitEl.classList.toggle("profile-card__submit--danger", Boolean(selectedTargetUserId));
}

function loadStoredTargetUserId() {
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
  if (selectedTargetUserId) {
    const wasInOmbor = activeCategory === "Ombor";
    selectedTargetUserId = "";
    persistTargetUserId("");
    savedItems = [];
    if (wasInOmbor) {
      activeCategory = "HOME";
    }
    syncProfileUi();
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
  persistTargetUserId(rawValue);
  syncProfileUi();
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

// Initialize the app
async function initializeApp() {
  loadStoredTargetUserId();
  
  allItems = await loadItems();
  
  await refreshSavedItems();
  
  buildStats(allItems);
  buildFilters(allItems);
  render();
  renderLibrary();
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
