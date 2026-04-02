import { useEffect, useRef, useState } from "react";

const tg = window.Telegram?.WebApp;
const IS_LOCAL_HOST =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const API_BASE_URL = IS_LOCAL_HOST ? "http://127.0.0.1:8001" : "";
const DEFAULT_POSTER_URL = "/posters/merlin.jpg";
const DEFAULT_TRAILER_URL = "/trailers/merlin.mp4";
const TARGET_USER_STORAGE_KEY = "hidop_target_user_id";
const THEME_STORAGE_KEY = "hidop_theme";
const PROFILE_DETAILS_STORAGE_KEY = "hidop_profile_details";
const THEME_OPTIONS = [
  { id: "default", label: "Tungi" },
  { id: "sunset", label: "Sunset" },
  { id: "ocean", label: "Ocean" },
  { id: "forest", label: "Forest" },
  { id: "aurora", label: "Aurora" },
  { id: "horor", label: "Horor" },
];
const THEMES = THEME_OPTIONS.map((theme) => theme.id);

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

function normalizeApiUrl(url) {
  const rawUrl = String(url || "").trim();
  if (!rawUrl) return "";
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  if (rawUrl.startsWith("/")) return `${API_BASE_URL}${rawUrl}`;
  return `${API_BASE_URL}/${rawUrl.replace(/^\.?\//, "")}`;
}

function buildVideoFileUrl(itemId) {
  return `${API_BASE_URL}/api/video/${encodeURIComponent(itemId)}/play`;
}

function getPosterUrl(item) {
  const explicitPosterUrl = String(item?.poster_url || item?.preview_url || "").trim();
  if (explicitPosterUrl) {
    return normalizeApiUrl(explicitPosterUrl);
  }
  return DEFAULT_POSTER_URL;
}

function getTrailerUrl(item) {
  const explicitTrailerUrl = String(item?.trailer_url || "").trim();
  if (explicitTrailerUrl) {
    return normalizeApiUrl(explicitTrailerUrl);
  }
  return DEFAULT_TRAILER_URL;
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
  ) {
    return "Pleylist";
  }
  return "HOME";
}

function detectPalette(item) {
  return detectCategory(item) === "Pleylist" ? "instagram" : "night";
}

function getDisplayTitle(item) {
  return item?.saved_name || item?.title || "Sarlavha topilmadi";
}

function getDisplayDescription(item) {
  return item?.comment || item?.category || "Video tafsilotlari mavjud emas";
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

function getInitials(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "U";
  const parts = normalized.split(/\s+/).filter(Boolean);
  const joined = parts
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("");
  return (joined || normalized.slice(0, 1)).toUpperCase();
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

function getThemeStorageKey(userId) {
  const normalizedUserId = String(userId || "").trim();
  return normalizedUserId ? `${THEME_STORAGE_KEY}:${normalizedUserId}` : THEME_STORAGE_KEY;
}

function getSearchScore(item, activeQuery) {
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

function matchesSearch(item, activeQuery) {
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
  if (haystack.includes(normalizedQuery)) return true;

  const words = fields
    .flatMap((field) => field.split(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff]+/i))
    .filter(Boolean);

  if (words.some((word) => word.startsWith(normalizedQuery))) return true;
  if (normalizedQuery.length <= 2) {
    return words.some((word) => word[0] === normalizedQuery[0]);
  }
  return false;
}

function sortBySearchRelevance(items, activeQuery) {
  const naturalCollator = new Intl.Collator("uz", {
    numeric: true,
    sensitivity: "base",
  });

  return items.slice().sort((left, right) => {
    const scoreDiff = getSearchScore(right, activeQuery) - getSearchScore(left, activeQuery);
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

function ScrollingText({ text, className }) {
  return (
    <span className={className}>
      <span>{text}</span>
      <span aria-hidden="true">{text}</span>
    </span>
  );
}

function Avatar({ className, photoUrl, fallbackText, alt = "Profil rasmi" }) {
  return photoUrl ? (
    <span className={`${className} has-photo`}>
      <img className="profile-avatar-image" src={photoUrl} alt={alt} />
    </span>
  ) : (
    <span className={className}>{fallbackText}</span>
  );
}

export default function App() {
  const telegramUserId = getTelegramUserId();
  const [theme, setTheme] = useState("default");
  const [themePanelOpen, setThemePanelOpen] = useState(false);
  const [catalogItems, setCatalogItems] = useState([]);
  const [savedItems, setSavedItems] = useState([]);
  const [activeCategory, setActiveCategory] = useState("LANDING");
  const [activeQuery, setActiveQuery] = useState("");
  const [selectedTargetUserId, setSelectedTargetUserId] = useState("");
  const [isAutoDetectedUserId, setIsAutoDetectedUserId] = useState(false);
  const [telegramProfilePhotoUrl, setTelegramProfilePhotoUrl] = useState("");
  const [sharedProfileUsers, setSharedProfileUsers] = useState([]);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileInputValue, setProfileInputValue] = useState("");
  const [profileDetails, setProfileDetails] = useState({});
  const [topToastMessage, setTopToastMessage] = useState("");
  const [soonBadgeVisible, setSoonBadgeVisible] = useState(false);
  const [modalItem, setModalItem] = useState(null);
  const [modalVideoUrl, setModalVideoUrl] = useState("");
  const [modalVideoReady, setModalVideoReady] = useState(false);
  const [modalVideoMessage, setModalVideoMessage] = useState("Video tayyorlanmoqda...");
  const [modalReactionState, setModalReactionState] = useState({
    likes: 0,
    dislikes: 0,
    user_reaction: null,
  });
  const modalVideoRef = useRef(null);
  const videoStatusCacheRef = useRef(new Map());
  const topToastTimerRef = useRef(null);
  const soonBadgeTimerRef = useRef(null);
  const refreshIntervalRef = useRef(null);
  const catalogRefreshInFlightRef = useRef(false);
  const selectedTargetUserIdRef = useRef("");
  const profileInputRef = useRef(null);
  const holoInputRef = useRef(null);
  const pendingSendVideoIdsRef = useRef(new Set());

  selectedTargetUserIdRef.current = selectedTargetUserId;

  const photoUrl = String(
    telegramProfilePhotoUrl || tg?.initDataUnsafe?.user?.photo_url || "",
  ).trim();
  const profileBadgeText = (() => {
    const firstName = String(tg?.initDataUnsafe?.user?.first_name || "").trim();
    if (selectedTargetUserId) return selectedTargetUserId.slice(-2);
    if (firstName) return firstName.slice(0, 1).toUpperCase();
    return "U";
  })();

  const lookupKey = selectedTargetUserId || getTelegramUserId() || "guest";
  const shortProfileName =
    profileDetails.saved && profileDetails.firstName && profileDetails.lastName
      ? `${String(profileDetails.lastName).trim().slice(0, 1).toUpperCase()}.${String(profileDetails.firstName).trim()}`
      : "";
  const profileDisplayName = shortProfileName || (selectedTargetUserId ? `ID ${selectedTargetUserId}` : "HIDOP BOT User");
  const activeOwnerId = selectedTargetUserId || telegramUserId || "";
  const themeStorageKey = getThemeStorageKey(telegramUserId || "guest");

  const visibleSourceItems =
    activeCategory === "LANDING" || activeCategory === "PROFILE"
      ? []
      : activeCategory === "EMPTY"
        ? activeQuery.trim()
          ? catalogItems
          : []
        : activeCategory === "Pleylist"
          ? savedItems
          : catalogItems;
  const filteredItems = sortBySearchRelevance(
    visibleSourceItems.filter((item) => matchesSearch(item, activeQuery)),
    activeQuery,
  );

  const showCatalogChrome =
    !((activeCategory === "LANDING" || activeCategory === "EMPTY") && !activeQuery) &&
    activeCategory !== "PROFILE";
  const showEmptyState = !(
    (activeCategory === "LANDING" || activeCategory === "EMPTY" || activeCategory === "PROFILE") &&
    !activeQuery
  );

  useEffect(() => {
    if (tg) {
      tg.ready();
      tg.expand();
      tg.setHeaderColor("#101725");
      tg.setBackgroundColor("#101725");
    }
  }, []);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(themeStorageKey) || "default";
    setTheme(THEMES.includes(savedTheme) ? savedTheme : "default");

    if (telegramUserId) {
      setSelectedTargetUserId(telegramUserId);
      setProfileInputValue(telegramUserId);
      setIsAutoDetectedUserId(true);
    } else {
      const savedTarget = window.localStorage.getItem(TARGET_USER_STORAGE_KEY) || "";
      const normalizedTarget = /^\d+$/.test(savedTarget) ? savedTarget : "";
      setSelectedTargetUserId(normalizedTarget);
      setProfileInputValue(normalizedTarget);
    }
  }, [telegramUserId, themeStorageKey]);

  useEffect(() => {
    document.body.dataset.theme = THEMES.includes(theme) ? theme : "default";
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme, themeStorageKey]);

  useEffect(() => {
    document.body.dataset.category = activeCategory.toLowerCase();
  }, [activeCategory]);

  useEffect(() => {
    document.body.classList.toggle("has-overlay", profileModalOpen || Boolean(modalItem));
  }, [profileModalOpen, modalItem]);

  useEffect(() => {
    const raw = window.localStorage.getItem(`${PROFILE_DETAILS_STORAGE_KEY}:${lookupKey}`) || "";
    try {
      const parsed = raw ? JSON.parse(raw) : {};
      setProfileDetails(typeof parsed === "object" && parsed ? parsed : {});
    } catch {
      setProfileDetails({});
    }
  }, [lookupKey]);

  useEffect(() => {
    const handleClick = (event) => {
      if (!event.target.closest?.(".telegram-bar__theme")) {
        setThemePanelOpen(false);
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  useEffect(() => {
    if (!topToastMessage) return undefined;
    if (topToastTimerRef.current) {
      window.clearTimeout(topToastTimerRef.current);
    }
    topToastTimerRef.current = window.setTimeout(() => {
      setTopToastMessage("");
      topToastTimerRef.current = null;
    }, 2600);
    return () => {
      if (topToastTimerRef.current) {
        window.clearTimeout(topToastTimerRef.current);
        topToastTimerRef.current = null;
      }
    };
  }, [topToastMessage]);

  useEffect(() => {
    if (!soonBadgeVisible) return undefined;
    if (soonBadgeTimerRef.current) {
      window.clearTimeout(soonBadgeTimerRef.current);
    }
    soonBadgeTimerRef.current = window.setTimeout(() => {
      setSoonBadgeVisible(false);
      soonBadgeTimerRef.current = null;
    }, 1800);
    return () => {
      if (soonBadgeTimerRef.current) {
        window.clearTimeout(soonBadgeTimerRef.current);
        soonBadgeTimerRef.current = null;
      }
    };
  }, [soonBadgeVisible]);

  useEffect(() => {
    if (!profileModalOpen) return;
    profileInputRef.current?.focus();
  }, [profileModalOpen]);

  useEffect(() => {
    if (activeCategory === "EMPTY") {
      holoInputRef.current?.focus();
    }
  }, [activeCategory]);

  useEffect(() => {
    async function loadCatalog() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/catalog`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const items = Array.isArray(payload?.items) ? payload.items : [];
        setCatalogItems(
          items.map((item) => ({
            id: Number(item.id || 0),
            title: item.title || "Sarlavha topilmadi",
            comment: item.comment || "",
            category: item.category || detectCategory(item),
            duration: Number(item.duration || 0),
            ageLabel: item.ageLabel || "Kutubxonada",
            palette: item.palette || detectPalette(item),
            preview_url: normalizeApiUrl(item.preview_url || (item.id ? buildVideoFileUrl(item.id) : "")),
            poster_url: getPosterUrl(item),
            trailer_url: getTrailerUrl(item),
            added_at: item.added_at || "",
            web_streamable: typeof item.web_streamable === "boolean" ? item.web_streamable : null,
            web_stream_error: item.web_stream_error || "",
            web_stream_message: item.web_stream_message || "",
            web_stream_source: item.web_stream_source || "",
            file_size: Number(item.file_size || 0),
          })),
        );
      } catch (error) {
        console.error("Failed to load videos:", error);
        setCatalogItems([]);
      }
    }

    loadCatalog();
  }, []);

  useEffect(() => {
    async function loadSaved() {
      if (!activeOwnerId) {
        setSavedItems([]);
        return;
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/saved-videos?owner_id=${encodeURIComponent(activeOwnerId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("saved videos topilmadi");
        const payload = await response.json();
        const items = Array.isArray(payload?.items) ? payload.items : [];
        setSavedItems(
          items.map((item) => ({
            ...item,
            preview_url: normalizeApiUrl(item.preview_url || (item.id ? buildVideoFileUrl(item.id) : "")),
            poster_url: getPosterUrl(item),
            trailer_url: getTrailerUrl(item),
            web_streamable: typeof item.web_streamable === "boolean" ? item.web_streamable : null,
            web_stream_error: item.web_stream_error || "",
            web_stream_message: item.web_stream_message || "",
            web_stream_source: item.web_stream_source || "",
            file_size: Number(item.file_size || 0),
          })),
        );
      } catch {
        setSavedItems([]);
      }
    }

    loadSaved();
  }, [activeOwnerId]);

  useEffect(() => {
    async function loadProfileData() {
      const avatarUserId = Number(selectedTargetUserId || getTelegramUserId() || 0);
      if (!avatarUserId) {
        setTelegramProfilePhotoUrl("");
        return;
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/user-profile-photo?user_id=${encodeURIComponent(avatarUserId)}`,
          { cache: "no-store" },
        );
        const payload = await response.json().catch(() => ({}));
        if (response.ok && payload?.ok && payload?.photo_url) {
          setTelegramProfilePhotoUrl(String(payload.photo_url).trim());
        } else {
          setTelegramProfilePhotoUrl("");
        }
      } catch (error) {
        console.error("Telegram profil rasmi yuklanmadi:", error);
        setTelegramProfilePhotoUrl("");
      }
    }

    async function loadSharedUsers() {
      const lookupUserId = Number(selectedTargetUserId || getTelegramUserId() || 0);
      if (!lookupUserId) {
        setSharedProfileUsers([]);
        return;
      }
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/shared-users?user_id=${encodeURIComponent(lookupUserId)}`,
          { cache: "no-store" },
        );
        const payload = await response.json().catch(() => ({}));
        if (response.ok && payload?.ok && Array.isArray(payload.items)) {
          setSharedProfileUsers(payload.items);
        } else {
          setSharedProfileUsers([]);
        }
      } catch (error) {
        console.error("Shared users yuklanmadi:", error);
        setSharedProfileUsers([]);
      }
    }

    loadProfileData();
    loadSharedUsers();
  }, [selectedTargetUserId]);

  useEffect(() => {
    async function refreshCatalogView() {
      if (catalogRefreshInFlightRef.current) return;
      catalogRefreshInFlightRef.current = true;
      try {
        const response = await fetch(`${API_BASE_URL}/api/catalog`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        const items = Array.isArray(payload?.items) ? payload.items : [];
        setCatalogItems(
          items.map((item) => ({
            id: Number(item.id || 0),
            title: item.title || "Sarlavha topilmadi",
            comment: item.comment || "",
            category: item.category || detectCategory(item),
            duration: Number(item.duration || 0),
            ageLabel: item.ageLabel || "Kutubxonada",
            palette: item.palette || detectPalette(item),
            preview_url: normalizeApiUrl(item.preview_url || (item.id ? buildVideoFileUrl(item.id) : "")),
            poster_url: getPosterUrl(item),
            trailer_url: getTrailerUrl(item),
            added_at: item.added_at || "",
            web_streamable: typeof item.web_streamable === "boolean" ? item.web_streamable : null,
            web_stream_error: item.web_stream_error || "",
            web_stream_message: item.web_stream_message || "",
            web_stream_source: item.web_stream_source || "",
            file_size: Number(item.file_size || 0),
          })),
        );
      } catch (error) {
        console.error("Catalog refresh failed:", error);
      } finally {
        catalogRefreshInFlightRef.current = false;
      }
    }

    refreshIntervalRef.current = window.setInterval(refreshCatalogView, 20000);
    const onFocus = () => {
      refreshCatalogView();
    };
    const onVisibility = () => {
      if (!document.hidden) {
        refreshCatalogView();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (refreshIntervalRef.current) {
        window.clearInterval(refreshIntervalRef.current);
      }
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!modalItem) return undefined;

    let cancelled = false;

    async function loadModalState() {
      const reactionParams = new URLSearchParams({ video_id: String(modalItem.id) });
      if (selectedTargetUserIdRef.current) {
        reactionParams.set("user_id", selectedTargetUserIdRef.current);
      }

      try {
        const reactionResponse = await fetch(
          `${API_BASE_URL}/api/video-reactions?${reactionParams.toString()}`,
          { cache: "no-store" },
        );
        const reactionPayload = await reactionResponse.json().catch(() => ({}));
        if (!cancelled && reactionPayload?.ok) {
          setModalReactionState({
            likes: Number(reactionPayload.likes || 0),
            dislikes: Number(reactionPayload.dislikes || 0),
            user_reaction: reactionPayload.user_reaction || null,
          });
        }
      } catch {
        if (!cancelled) {
          setModalReactionState({ likes: 0, dislikes: 0, user_reaction: null });
        }
      }

      if (cancelled) return;
      setModalVideoUrl(DEFAULT_TRAILER_URL);
      setModalVideoReady(true);
      setModalVideoMessage("Treyler tayyorlanmoqda...");
    }

    loadModalState();

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        closeVideoModal();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelled = true;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [modalItem]);

  useEffect(() => {
    const video = modalVideoRef.current;
    if (!video || !modalVideoUrl || !modalVideoReady) return;
    video.muted = false;
    video.volume = 1;
    video.load();
    video
      .play()
      .catch((error) => {
        console.error("Modal video autoplay failed:", error);
      });
  }, [modalVideoReady, modalVideoUrl]);

  function showAppAlert(message) {
    const text = String(message || "").trim() || "Xatolik yuz berdi.";
    if (tg?.showAlert) {
      tg.showAlert(text);
      return;
    }
    window.alert(text);
  }

  function showTopToast(message) {
    const normalized = String(message || "").trim();
    if (!normalized) return;

    const lower = normalized.toLowerCase();
    let text = normalized;
    if (lower.includes("saqlandi")) {
      text = "✅ Saqlandi. Playlistingizni /playlist orqali ko'ring.";
    } else if (lower.includes("yuborildi")) {
      text = "📤 Yuborildi.";
    } else if (lower.includes("yoqtirildi")) {
      text = "👍 Yoqtirildi.";
    } else if (
      lower.includes("o'chirildi") ||
      lower.includes("ombordan olib tashlandi") ||
      lower.includes("pleylistdan olib tashlandi")
    ) {
      text = "🗑️ O'chirildi.";
    }
    setTopToastMessage(text);
  }

  async function fetchVideoStatus(item, { force = false } = {}) {
    if (!item?.id) {
      return { playable: false, reason: "not_found", message: "Video topilmadi.", stream_url: "" };
    }

    if (item.trailer_url) {
      const result = {
        playable: true,
        reason: "",
        message: "",
        stream_url: normalizeApiUrl(item.trailer_url),
      };
      videoStatusCacheRef.current.set(item.id, result);
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

    if (!force && videoStatusCacheRef.current.has(item.id)) {
      return videoStatusCacheRef.current.get(item.id);
    }

    const fallbackUrl = normalizeApiUrl(
      item.trailer_url || item.preview_url || buildVideoFileUrl(item.id),
    );
    if (item.web_stream_source === "external" && fallbackUrl) {
      const result = { playable: true, reason: "", message: "", stream_url: fallbackUrl };
      videoStatusCacheRef.current.set(item.id, result);
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
      if (result.reason === "temporary_error" && !result.playable) {
        videoStatusCacheRef.current.delete(item.id);
      } else {
        videoStatusCacheRef.current.set(item.id, result);
      }
      return result;
    } catch {
      return { playable: true, reason: "", message: "", stream_url: fallbackUrl };
    }
  }

  function openProfileModal() {
    if (isAutoDetectedUserId) return;
    setProfileInputValue(selectedTargetUserId);
    setProfileModalOpen(true);
  }

  function closeProfileModal() {
    setProfileModalOpen(false);
  }

  async function submitProfileId() {
    if (isAutoDetectedUserId) {
      closeProfileModal();
      return;
    }

    if (selectedTargetUserId) {
      const wasInPlaylist = activeCategory === "Pleylist";
      setSelectedTargetUserId("");
      setProfileInputValue("");
      setTelegramProfilePhotoUrl("");
      setSharedProfileUsers([]);
      window.localStorage.removeItem(TARGET_USER_STORAGE_KEY);
      setSavedItems([]);
      if (wasInPlaylist) {
        setActiveCategory("LANDING");
      }
      showTopToast("o'chirildi ✅");
      return;
    }

    const rawValue = String(profileInputValue || "").trim();
    if (!/^\d+$/.test(rawValue)) {
      showAppAlert("ID raqam bo'lishi kerak.");
      return;
    }

    setSelectedTargetUserId(rawValue);
    setIsAutoDetectedUserId(false);
    window.localStorage.setItem(TARGET_USER_STORAGE_KEY, rawValue);
    setProfileModalOpen(false);
    setActiveCategory("Pleylist");
    showTopToast("saqlandi ✅");
  }

  async function sendVideoToBot(item) {
    if (!item) return;
    const targetUserId = selectedTargetUserId || getTelegramUserId();
    if (!targetUserId) {
      openProfileModal();
      return;
    }
    if (pendingSendVideoIdsRef.current.has(item.id)) {
      showTopToast("yuborilmoqda...");
      return;
    }

    pendingSendVideoIdsRef.current.add(item.id);
    showTopToast("yuborilmoqda...");
    try {
      const response = await fetch(`${API_BASE_URL}/api/send-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "send_video",
          video_id: item.id,
          title: item.saved_name || item.title || "",
          source: activeCategory,
          target_user_id: targetUserId,
        }),
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
      pendingSendVideoIdsRef.current.delete(item.id);
    }
  }

  async function saveVideoToProfile(item) {
    const ownerId = selectedTargetUserId || getTelegramUserId();
    if (!ownerId || !item?.id) {
      openProfileModal();
      return false;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/save-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_id: ownerId, video_id: item.id }),
      });
      const result = await response.json();
      if (!result?.ok) {
        showAppAlert(result?.message || result?.error || "Video saqlanmadi.");
        return false;
      }

      const savedResponse = await fetch(
        `${API_BASE_URL}/api/saved-videos?owner_id=${encodeURIComponent(ownerId)}`,
        { cache: "no-store" },
      );
      const savedPayload = await savedResponse.json().catch(() => ({}));
      const items = Array.isArray(savedPayload?.items) ? savedPayload.items : [];
      setSavedItems(
        items.map((savedItem) => ({
          ...savedItem,
          preview_url: normalizeApiUrl(
            savedItem.preview_url || (savedItem.id ? buildVideoFileUrl(savedItem.id) : ""),
          ),
          poster_url: getPosterUrl(savedItem),
          trailer_url: getTrailerUrl(savedItem),
          web_streamable:
            typeof savedItem.web_streamable === "boolean" ? savedItem.web_streamable : null,
          web_stream_error: savedItem.web_stream_error || "",
          web_stream_message: savedItem.web_stream_message || "",
          web_stream_source: savedItem.web_stream_source || "",
          file_size: Number(savedItem.file_size || 0),
        })),
      );
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

  async function deleteSavedVideo(item) {
    if (!item?.id || !activeOwnerId) {
      openProfileModal();
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/delete-saved-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_id: activeOwnerId, video_id: item.id }),
      });
      const result = await response.json();
      if (!result?.ok) {
        showAppAlert(result?.message || result?.error || "Video o'chirilmadi.");
        return;
      }
      setSavedItems((current) =>
        current.filter((savedItem) => Number(savedItem.id) !== Number(item.id)),
      );
      showTopToast("pleylistdan olib tashlandi ✅");
    } catch {
      showAppAlert("Video o'chirishda xatolik bo'ldi.");
    }
  }

  async function reactToVideo(item) {
    const ownerId = selectedTargetUserId || getTelegramUserId();
    if (!ownerId || !item?.id) {
      openProfileModal();
      return;
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
        return;
      }
      setModalReactionState(result);
      showTopToast("yoqtirildi 👍");
    } catch {
      showAppAlert("Like qo'yishda xatolik bo'ldi.");
    }
  }

  function closeVideoModal() {
    if (modalVideoRef.current) {
      modalVideoRef.current.pause();
      modalVideoRef.current.removeAttribute("src");
      modalVideoRef.current.load();
    }
    setModalItem(null);
    setModalVideoUrl("");
    setModalVideoReady(false);
    setModalVideoMessage("Video tayyorlanmoqda...");
    setModalReactionState({ likes: 0, dislikes: 0, user_reaction: null });
  }

  function handleBottomDock(category) {
    if (category === "Pleylist" && !activeOwnerId) {
      openProfileModal();
      return;
    }
    if (category !== "EMPTY") {
      setActiveQuery("");
    }
    setActiveCategory(category);
  }

  const sectionTitle = activeQuery
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
  const sectionMeta = activeQuery
    ? `${filteredItems.length} ta natija`
    : activeCategory === "LANDING"
      ? "Bo'lim tanlang"
      : activeCategory === "PROFILE"
        ? "Foydalanuvchi oynasi"
        : activeCategory === "EMPTY"
          ? "Interfeys tayyor"
          : `${filteredItems.length} ta video`;
  const emptyText = activeQuery
    ? "Qidiruv bo'yicha hech narsa topilmadi."
    : activeCategory === "Pleylist"
      ? "Pleylistda hali video yo'q."
      : "Katalogda hozircha video topilmadi.";

  const activeDock = profileModalOpen
    ? "profile"
    : activeCategory === "PROFILE"
      ? "profile"
      : activeCategory === "EMPTY"
        ? "empty"
        : activeCategory === "Pleylist"
          ? "saved"
          : activeCategory === "HOME"
            ? "playlist"
            : "home";
  const showTopBar =
    activeCategory === "LANDING" || activeCategory === "HOME" || activeCategory === "Pleylist";
  const topBarTitle =
    activeCategory === "HOME"
      ? "Barcha kinolar"
      : activeCategory === "Pleylist"
        ? "Siz saqlagan videolar"
        : "Hidop_bot";
  const showCompactTopBar = activeCategory === "HOME" || activeCategory === "Pleylist";
  const topBarCount = activeCategory === "HOME" ? catalogItems.length : savedItems.length;

  return (
    <div className="app-shell">
      <div className={`top-toast ${topToastMessage ? "is-visible" : "is-hidden"}`} role="status" aria-live="polite">
        {topToastMessage || "saqlandi ✅"}
      </div>

      <header className="telegram-bar" style={{ display: showTopBar ? "" : "none" }}>
        <div className="telegram-bar__brand">
          {showCompactTopBar ? null : (
            <div className="telegram-bar__theme">
              <button
                className="telegram-bar__logo"
                type="button"
                aria-label="Rang tanlash"
                aria-expanded={themePanelOpen}
                onClick={(event) => {
                  event.stopPropagation();
                  setThemePanelOpen((current) => !current);
                }}
              >
                H
              </button>
              <div className={`theme-panel ${themePanelOpen ? "" : "is-hidden"}`} aria-label="Rang variantlari">
                {THEME_OPTIONS.map(({ id, label }) => (
                  <button
                    key={id}
                    className={`theme-panel__option ${theme === id ? "is-active" : ""}`}
                    type="button"
                    data-theme={id}
                    onClick={(event) => {
                      event.stopPropagation();
                      setTheme(id);
                      setThemePanelOpen(false);
                    }}
                  >
                    <span className={`theme-panel__swatch theme-panel__swatch--${id}`}></span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="telegram-bar__content">
            <strong>{topBarTitle}</strong>
          </div>
          {showCompactTopBar ? (
            <div className="telegram-bar__count" aria-label={`Jami ${topBarCount} ta`}>
              {topBarCount} ta
            </div>
          ) : (
            <div className="telegram-bar__actions">
              <button
                className={`telegram-bar__icon telegram-bar__profile ${photoUrl ? "has-photo-avatar" : ""}`}
                type="button"
                aria-label={selectedTargetUserId ? `Profil ${selectedTargetUserId}` : "Profil"}
                onClick={openProfileModal}
              >
                <Avatar className="profile-badge" photoUrl={photoUrl} fallbackText={profileBadgeText} />
              </button>
            </div>
          )}
        </div>
      </header>

      <div className={`profile-modal ${profileModalOpen ? "" : "is-hidden"}`} aria-hidden={!profileModalOpen}>
        <div className="profile-modal__backdrop" onClick={closeProfileModal}></div>
        <div className="profile-card" role="dialog" aria-modal="true" aria-labelledby="profileModalTitle">
          <button className="profile-card__close" type="button" aria-label="Yopish" onClick={closeProfileModal}>
            ×
          </button>
          <Avatar className="profile-card__badge" photoUrl={photoUrl} fallbackText={profileBadgeText} />
          <p className="profile-card__eyebrow">Profil</p>
          <h2 id="profileModalTitle">{profileDisplayName}</h2>
          <p className="profile-card__description">
            Pleylist, like va yuborish funksiyalarini profil ID bilan ulang.
          </p>
          <label className="profile-card__field" htmlFor="profileInput">
            <input
              id="profileInput"
              ref={profileInputRef}
              type="text"
              placeholder="ID ingizni kiriting"
              inputMode="numeric"
              value={profileInputValue}
              readOnly={Boolean(selectedTargetUserId) || isAutoDetectedUserId}
              onChange={(event) => setProfileInputValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitProfileId();
                }
              }}
            />
          </label>
          <button
            className={`profile-card__submit ${selectedTargetUserId && !isAutoDetectedUserId ? "profile-card__submit--danger" : ""}`}
            type="button"
            disabled={isAutoDetectedUserId}
            onClick={submitProfileId}
          >
            {isAutoDetectedUserId
              ? "TELEGRAM ORQALI ULANGAN"
              : selectedTargetUserId
                ? "O'CHIRISH"
                : "KIRISH"}
          </button>
        </div>
      </div>

      <div className="save-success-modal is-hidden" aria-hidden="true">
        <div className="save-success-card" role="dialog" aria-modal="true">
          <h3 className="save-success-card__title">Telegram</h3>
          <p className="save-success-card__status">✅ Saqlandi!</p>
          <p className="save-success-card__description">Playlistingizni /playlist orqali ko'ring.</p>
          <button className="save-success-card__button" type="button">
            OK
          </button>
        </div>
      </div>

      <section className="sheet">
        <main className="content">
          <section className="content-block">
            <div className="section-heading" style={{ display: showCatalogChrome ? "" : "none" }}>
              <div>
                <p className="section-heading__eyebrow">Katalog</p>
                <h2>{sectionTitle}</h2>
              </div>
              <p className="section-heading__meta">{sectionMeta}</p>
            </div>

            <section className={`holo-panel ${activeCategory === "EMPTY" ? "" : "is-hidden"}`} aria-label="Maxsus qidiruv">
              <div className="input-container">
                <div className="input-field-container">
                  <input
                    ref={holoInputRef}
                    type="text"
                    className="holo-input"
                    placeholder="Kino nomi yoki ID"
                    value={activeQuery}
                    onChange={(event) => setActiveQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setActiveQuery("");
                      }
                    }}
                  />
                  <div
                    className={`holo-results-count ${activeCategory === "EMPTY" && activeQuery.trim() ? "" : "is-hidden"}`}
                  >
                    {filteredItems.length} ta natija
                  </div>
                  <div className="input-border"></div>
                  <div className="holo-scan-line"></div>
                  <div className="input-glow"></div>
                  <div className="input-active-indicator"></div>
                  <div className="input-label">Qidiruv paneli</div>
                  <div className="input-data-visualization">
                    {Array.from({ length: 20 }).map((_, index) => (
                      <div key={index} className="data-segment" style={{ "--index": index + 1 }}></div>
                    ))}
                  </div>
                  <div className="input-particles">
                    {[
                      { top: "20%", left: "10%" },
                      { top: "65%", left: "25%" },
                      { top: "40%", left: "40%" },
                      { top: "75%", left: "60%" },
                      { top: "30%", left: "75%" },
                      { top: "60%", left: "90%" },
                    ].map((position, index) => (
                      <div
                        key={index}
                        className="input-particle"
                        style={{ "--index": index + 1, top: position.top, left: position.left }}
                      ></div>
                    ))}
                  </div>
                  <div className="input-holo-overlay"></div>
                  <div className="interface-lines">
                    <div className="interface-line"></div>
                    <div className="interface-line"></div>
                    <div className="interface-line"></div>
                    <div className="interface-line"></div>
                  </div>
                  <div className="hex-decoration"></div>
                  <div className="input-status">Ready for input</div>
                  <div className="power-indicator"></div>
                  <div className="input-decoration">
                    <div className="decoration-dot"></div>
                    <div className="decoration-line"></div>
                    <div className="decoration-dot"></div>
                    <div className="decoration-line"></div>
                    <div className="decoration-dot"></div>
                    <div className="decoration-line"></div>
                    <div className="decoration-dot"></div>
                  </div>
                </div>
              </div>
            </section>

            <section className={`landing-panel ${activeCategory === "LANDING" ? "" : "is-hidden"}`} aria-label="Bot haqida">
              <div className="landing-panel__hero">
                <p className="landing-panel__eyebrow">Hidop Bot</p>
                <h3 className="landing-panel__title">
                  Kinolarni tez topish, saqlash va botga yuborish uchun qulay joy.
                </h3>
              </div>
            </section>
            <section
              className={`profile-showcase ${activeCategory === "PROFILE" ? "" : "is-hidden"}`}
              aria-label="Profil oynasi"
            >
              <div className="profile-showcase__card">
                <Avatar
                  className="profile-showcase__avatar"
                  photoUrl={photoUrl}
                  fallbackText={profileBadgeText}
                />
                <p className="profile-showcase__eyebrow">Profil</p>
                <p className={`profile-showcase__name ${shortProfileName ? "" : "is-hidden"}`}>
                  {shortProfileName || "A.umidjon"}
                </p>
                <h3 className="profile-showcase__title">
                  {profileDisplayName}
                </h3>
                <p className="profile-showcase__meta">
                  {shortProfileName
                    ? "Sizga ism-familyangiz qisqartirilgan ko'rinishda murojaat qilinadi."
                    : selectedTargetUserId
                      ? "Telegram profilingiz shu bo'limda ko'rinadi."
                    : "Profil rasmini ko'rish uchun Telegram profilingizdan foydalaniladi."}
                </p>
                <div className={`profile-showcase__shared ${sharedProfileUsers.length ? "" : "is-hidden"}`}>
                  <p className="profile-showcase__shared-label">
                    {sharedProfileUsers.length} ta odamga ulashilgan
                  </p>
                  <div className="profile-showcase__shared-list">
                    {sharedProfileUsers.map((item, index) =>
                      item?.photo_url ? (
                        <span
                          key={`${item.user_id || index}`}
                          className="profile-showcase__shared-avatar has-photo"
                          title={item?.title || `ID ${item?.user_id || ""}`}
                        >
                          <img src={item.photo_url} alt={item?.title || `ID ${item?.user_id || ""}`} />
                        </span>
                      ) : (
                        <span
                          key={`${item.user_id || index}`}
                          className="profile-showcase__shared-avatar"
                          title={item?.title || `ID ${item?.user_id || ""}`}
                        >
                          {getInitials(item?.title || item?.user_id)}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="playlist">
              {filteredItems.map((item) => {
                const posterUrl = DEFAULT_POSTER_URL;
                const palette = ["night", "instagram", "youtube"].includes(item.palette)
                  ? item.palette
                  : "night";
                return (
                  <article
                    key={item.id}
                    className="card"
                    style={{ "--card-edge": item.palette === "instagram"
                      ? "linear-gradient(135deg, #ffbb6f 0%, #ff6c87 45%, #885cff 100%)"
                      : item.palette === "youtube"
                        ? "linear-gradient(135deg, #ff8b6d 0%, #ff5573 44%, #ffc35b 100%)"
                        : "linear-gradient(135deg, #77f1cf 0%, #6f9bff 52%, #a7c6ff 100%)" }}
                    onClick={() => setModalItem(item)}
                  >
                    <div className="card__frame">
                      <div className={`thumb thumb--${palette}`} data-video-id={item.id}>
                        {posterUrl ? (
                          <div className="thumb__poster" style={{ backgroundImage: `url('${posterUrl}')` }}></div>
                        ) : null}
                        <div className="thumb__overlay">
                          <div className="thumb__head">
                            <div className="thumb__badge thumb__badge--title">
                              <ScrollingText text={getDisplayTitle(item)} className="thumb__marquee" />
                            </div>
                            <div className="thumb__badge thumb__badge--time">
                              {formatDuration(item.duration || 0)}
                            </div>
                          </div>
                          <div className="thumb__content">
                            <div className="meta__buttons thumb__buttons">
                              {activeCategory !== "Pleylist" ? (
                                <button
                                  className="save-button"
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    saveVideoToProfile(item);
                                  }}
                                >
                                  Saqlash
                                </button>
                              ) : null}
                              <button
                                className="send-button"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  sendVideoToBot(item);
                                }}
                              >
                                Yuborish
                              </button>
                              {activeCategory === "Pleylist" ? (
                                <button
                                  className="delete-button"
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    deleteSavedVideo(item);
                                  }}
                                >
                                  O&apos;chirish
                                </button>
                              ) : null}
                            </div>
                            <div className="thumb__label-wrap">
                              <div className="thumb__sub">
                                <ScrollingText
                                  text={getDisplayDescription(item)}
                                  className="thumb__sub-marquee"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
            <p className={`empty ${showEmptyState && !filteredItems.length ? "" : "is-hidden"}`}>
              {showEmptyState ? emptyText : "Hech narsa topilmadi."}
            </p>
          </section>
        </main>
      </section>

      <nav className="bottom-dock" aria-label="Pastki navigatsiya">
        <button
          className={`bottom-dock__item ${activeDock === "home" ? "is-active" : ""}`}
          type="button"
          aria-label="Bosh sahifa"
          onClick={() => handleBottomDock("LANDING")}
        >
          <span className="bottom-dock__icon bottom-dock__icon--home"></span>
        </button>
        <button
          className="bottom-dock__item"
          type="button"
          aria-label="Videolar tezkor tugmasi"
          onClick={() => setSoonBadgeVisible(true)}
        >
          <span className={`bottom-dock__soon ${soonBadgeVisible ? "is-visible" : ""}`}>Tez orada</span>
          <span className="bottom-dock__icon bottom-dock__icon--reels-outline"></span>
        </button>
        <button
          className={`bottom-dock__item ${activeDock === "playlist" ? "is-active" : ""}`}
          type="button"
          aria-label="Videolar"
          onClick={() => handleBottomDock("HOME")}
        >
          <span className={`bottom-dock__count ${activeDock === "playlist" ? "" : "is-hidden"}`}>{catalogItems.length}</span>
          <span className="bottom-dock__icon bottom-dock__icon--reels"></span>
        </button>
        <button
          className={`bottom-dock__item ${activeDock === "saved" ? "is-active" : ""}`}
          type="button"
          aria-label="Saqlangan videolar"
          onClick={() => handleBottomDock("Pleylist")}
        >
          <span className={`bottom-dock__count bottom-dock__count--saved ${activeDock === "saved" ? "" : "is-hidden"}`}>
            {savedItems.length}
          </span>
          <span className="bottom-dock__icon bottom-dock__icon--saved"></span>
        </button>
        <button
          className={`bottom-dock__item bottom-dock__item--empty ${activeDock === "empty" ? "is-active" : ""}`}
          type="button"
          aria-label="Qidiruv paneli"
          onClick={() => handleBottomDock("EMPTY")}
        >
          <span
            className={`bottom-dock__count bottom-dock__count--results ${activeDock === "empty" && activeCategory === "EMPTY" && activeQuery.trim() ? "" : "is-hidden"}`}
          >
            {filteredItems.length}
          </span>
          <span className="bottom-dock__icon bottom-dock__icon--search" aria-hidden="true"></span>
        </button>
        <button
          className={`bottom-dock__item bottom-dock__item--profile ${photoUrl ? "has-photo-avatar" : ""} ${activeDock === "profile" ? "is-active" : ""}`}
          type="button"
          aria-label={selectedTargetUserId ? `Profil ${selectedTargetUserId}` : "Profil"}
          onClick={() => handleBottomDock("PROFILE")}
        >
          <Avatar className="bottom-dock__avatar" photoUrl={photoUrl} fallbackText={profileBadgeText} />
        </button>
      </nav>

      {modalItem ? (
        <div className="video-modal" data-item-id={modalItem.id} onClick={closeVideoModal}>
          <div className="video-modal__dialog" onClick={(event) => event.stopPropagation()}>
            <div className="video-modal__header">
              <div>
                <p className="video-modal__eyebrow">Preview</p>
                <h3>{getDisplayTitle(modalItem)}</h3>
                <p className="video-modal__meta">
                  {(modalItem.category || detectCategory(modalItem))} • {formatDuration(Number(modalItem.duration || 0))} •{" "}
                  {getDisplayDescription(modalItem)}
                </p>
              </div>
              <button className="video-modal__close" type="button" aria-label="Yopish" onClick={closeVideoModal}>
                ×
              </button>
            </div>
            <div className="video-modal__body">
              <div className={`video-modal__status ${modalVideoReady ? "is-hidden" : ""}`}>{modalVideoMessage}</div>
              <video
                ref={modalVideoRef}
                className="video-modal__video"
                controls
                autoPlay
                defaultMuted={false}
                preload="auto"
                playsInline
                style={{ display: modalVideoReady ? "" : "none" }}
                src={modalVideoUrl}
                poster={DEFAULT_POSTER_URL}
                onLoadedData={() => {
                  setModalVideoReady(true);
                }}
                onError={() => {
                  setModalVideoReady(false);
                  setModalVideoUrl(DEFAULT_TRAILER_URL);
                  setModalVideoMessage("Treyler yuklanmadi.");
                }}
              ></video>
            </div>
            <div className="video-modal__actions">
              <button
                className="video-modal__button video-modal__button--ghost"
                type="button"
                onClick={() => saveVideoToProfile(modalItem)}
              >
                Saqlash
              </button>
              <button
                className="video-modal__button video-modal__button--primary"
                type="button"
                onClick={() => sendVideoToBot(modalItem)}
              >
                Yuborish
              </button>
              <button
                className={`video-modal__button video-modal__button--ghost video-modal__button--like ${modalReactionState.user_reaction === "likes" ? "is-active" : ""}`}
                type="button"
                onClick={() => reactToVideo(modalItem)}
              >
                👍 {Number(modalReactionState.likes || 0)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
