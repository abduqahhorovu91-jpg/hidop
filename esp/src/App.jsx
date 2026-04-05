import { useEffect, useRef, useState } from "react";

const ESP_DEVICE_URL_API = "/api/esp-device-url";
const ESP_COMMAND_PATH = "/command";
const ESP_STATUS_PATH = "/status";
const ESP_STATE_STORAGE_KEY = "hidop-esp-runtime-state";
const START_MESSAGE = "race.x299_299_1";
const STOP_MESSAGE = "race.x299_299_2";
const REQUEST_TIMEOUT_MS = 15_000;
const INTERVAL_OPTIONS = [
  { label: "10 sekund", value: 10_000 },
  { label: "30 sekund", value: 30_000 },
  { label: "1 daqiqa", value: 60_000 },
];

function decodeReplyText(value) {
  const text = String(value || "");
  if (!text.includes("\\u")) {
    return text;
  }

  try {
    return JSON.parse(`"${text.replace(/"/g, '\\"')}"`);
  } catch {
    return text;
  }
}

export default function App() {
  const intervalRef = useRef(null);
  const liveStatusIntervalRef = useRef(null);
  const [espDeviceUrl, setEspDeviceUrl] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      const raw = window.localStorage.getItem(ESP_STATE_STORAGE_KEY) || "";
      const parsed = raw ? JSON.parse(raw) : {};
      return String(parsed.espDeviceUrl || "").trim();
    } catch {
      return "";
    }
  });
  const [isEspLive, setIsEspLive] = useState(false);
  const [isRunning, setIsRunning] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const raw = window.localStorage.getItem(ESP_STATE_STORAGE_KEY) || "";
      const parsed = raw ? JSON.parse(raw) : {};
      return Boolean(parsed.isRunning);
    } catch {
      return false;
    }
  });
  const [sendCount, setSendCount] = useState(() => {
    if (typeof window === "undefined") return 0;
    try {
      const raw = window.localStorage.getItem(ESP_STATE_STORAGE_KEY) || "";
      const parsed = raw ? JSON.parse(raw) : {};
      return Number(parsed.sendCount) || 0;
    } catch {
      return 0;
    }
  });
  const [statusText, setStatusText] = useState(() => {
    if (typeof window === "undefined") return "Tayyor";
    try {
      const raw = window.localStorage.getItem(ESP_STATE_STORAGE_KEY) || "";
      const parsed = raw ? JSON.parse(raw) : {};
      return String(parsed.statusText || "Tayyor");
    } catch {
      return "Tayyor";
    }
  });
  const [replyText, setReplyText] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      const raw = window.localStorage.getItem(ESP_STATE_STORAGE_KEY) || "";
      const parsed = raw ? JSON.parse(raw) : {};
      return String(parsed.replyText || "");
    } catch {
      return "";
    }
  });
  const [selectedIntervalMs, setSelectedIntervalMs] = useState(() => {
    if (typeof window === "undefined") return INTERVAL_OPTIONS[0].value;
    try {
      const raw = window.localStorage.getItem(ESP_STATE_STORAGE_KEY) || "";
      const parsed = raw ? JSON.parse(raw) : {};
      const nextValue = Number(parsed.selectedIntervalMs);
      return Number.isFinite(nextValue) && nextValue >= 1000
        ? nextValue
        : INTERVAL_OPTIONS[0].value;
    } catch {
      return INTERVAL_OPTIONS[0].value;
    }
  });
  const [isStopConfirming, setIsStopConfirming] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [pageAlert, setPageAlert] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      ESP_STATE_STORAGE_KEY,
      JSON.stringify({
        espDeviceUrl,
        isRunning,
        sendCount,
        statusText,
        replyText,
        selectedIntervalMs,
      }),
    );
  }, [espDeviceUrl, isRunning, sendCount, statusText, replyText, selectedIntervalMs]);

  useEffect(() => {
    async function loadEspRuntimeStatus(deviceUrl) {
      if (!deviceUrl) {
        return false;
      }

      try {
        const response = await fetch(`${deviceUrl}${ESP_STATUS_PATH}`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload) {
          return false;
        }

        const nextIntervalMs = Number(payload.intervalMs);
        if (Number.isFinite(nextIntervalMs) && nextIntervalMs >= 1000) {
          setSelectedIntervalMs(nextIntervalMs);
        }

        setIsRunning(Boolean(payload.running));
        setSendCount(Number(payload.sendCount) || 0);

        const nextStatus = String(payload.lastStatus || "").trim();
        const nextReply = String(payload.lastReply || "").trim();

        if (nextStatus) {
          setStatusText(nextStatus === "running" ? "Ishga tushgan" : nextStatus);
        }

        if (nextReply) {
          setReplyText(decodeReplyText(nextReply));
        }
        return true;
      } catch {
        // ESP32 statusini o'qib bo'lmasa, mavjud UI holatini saqlab qolamiz.
        return false;
      }
    }

    async function loadEspDeviceUrl() {
      const storedUrl = espDeviceUrl.trim();

      try {
        const response = await fetch(ESP_DEVICE_URL_API, { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        const nextUrl =
          payload && typeof payload.url === "string" ? payload.url.trim() : "";
        const nextLive = Boolean(payload && payload.live);

        setIsEspLive(nextLive);

        if (nextUrl) {
          const normalizedUrl = nextUrl.replace(/\/+$/, "");
          setEspDeviceUrl(normalizedUrl);
          const statusLoaded = await loadEspRuntimeStatus(normalizedUrl);
          if (!statusLoaded) {
            setStatusText("ESP32 topildi");
          }
          return;
        }

        if (storedUrl) {
          const statusLoaded = await loadEspRuntimeStatus(storedUrl);
          if (statusLoaded) {
            setStatusText("ESP32 topildi");
            return;
          }
        }

        setStatusText("ESP32 URL hali kelmadi");
        setReplyText("ESP32 ishga tushgach manzil avtomatik chiqadi");
      } catch {
        if (storedUrl) {
          const statusLoaded = await loadEspRuntimeStatus(storedUrl);
          if (statusLoaded) {
            setStatusText("ESP32 topildi");
            return;
          }
        }

        setStatusText("URL olinmadi");
        setReplyText("Backenddan ESP32 manzili olinmadi");
        setIsEspLive(false);
      }
    }

    loadEspDeviceUrl();

    liveStatusIntervalRef.current = window.setInterval(() => {
      loadEspDeviceUrl();
    }, 5000);

    return () => {
      if (liveStatusIntervalRef.current) {
        window.clearInterval(liveStatusIntervalRef.current);
        liveStatusIntervalRef.current = null;
      }
    };
  }, [espDeviceUrl]);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
      setStatusText("Internet uzildi");
      setReplyText("Qurilma hozir offline holatda");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isRunning) {
      return undefined;
    }

    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
    }

    intervalRef.current = window.setInterval(() => {
      sendMessage(START_MESSAGE);
    }, selectedIntervalMs);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, selectedIntervalMs]);

  async function postToEsp(path, requestPayload) {
    if (!isOnline) {
      throw new Error("Internet ulanmagani uchun yuborilmadi");
    }

    if (!espDeviceUrl) {
      throw new Error("ESP32 ulanmagan");
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${espDeviceUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify(requestPayload),
      });

      const responsePayload = await response.json().catch(() => null);

      if (!response.ok) {
        const replyMessage =
          responsePayload &&
          typeof responsePayload.reply === "string" &&
          responsePayload.reply.trim()
            ? responsePayload.reply
            : `HTTP ${response.status}`;
        throw new Error(replyMessage);
      }

      return responsePayload;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Noma'lum xatolik";

      const visibleMessage =
        error instanceof DOMException && error.name === "AbortError"
          ? "Server javob bermadi"
          : errorMessage;
      throw new Error(visibleMessage);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function sendMessage(message) {
    setStatusText("Yuborilyapti...");
    setPageAlert("");

    try {
      const payload = await postToEsp(ESP_COMMAND_PATH, {
        message,
        intervalMs: selectedIntervalMs,
      });

      setSendCount((current) => current + 1);
      setStatusText("Yuborildi");
      setReplyText(
        payload && typeof payload.reply === "string" && payload.reply.trim()
          ? decodeReplyText(payload.reply)
          : "ESP32 ga yuborildi",
      );
    } catch (error) {
      const visibleMessage =
        error instanceof Error ? error.message : "Noma'lum xatolik";
      setStatusText(`Yuborilmadi: ${visibleMessage}`);
      setReplyText(visibleMessage);
      setPageAlert(`ESP bilan aloqa yo'q: ${visibleMessage}`);
    }
  }

  function handleStart() {
    if (intervalRef.current) {
      return;
    }

    setIsStopConfirming(false);
    setIsRunning(true);
    setStatusText("Ishga tushdi");
    setReplyText("");
    sendMessage(START_MESSAGE);
  }

  async function handleStop() {
    if (!isStopConfirming) {
      setIsStopConfirming(true);
      setStatusText("To'xtatishni tasdiqlang");
      setReplyText("Stop ni yana bir marta bossangiz to'xtaydi");
      return;
    }

    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setIsStopConfirming(false);
    setIsRunning(false);
    setStatusText("To'xtatildi");
    await sendMessage(STOP_MESSAGE);
  }

  return (
    <div className="page-shell">
      {pageAlert ? <div className="page-alert">{pageAlert}</div> : null}
      <div className="top-block">
        <p className="top-line">
          Interval:{" "}
          {INTERVAL_OPTIONS.find((item) => item.value === selectedIntervalMs)
            ?.label || "10 sekund"}
        </p>
        <p className="top-line">Yuborilgan: {sendCount} marta</p>
        <p className="top-line top-line-url">{espDeviceUrl || "ESP32 URL kutilmoqda..."}</p>
        {isEspLive ? <p className="top-live">live...</p> : null}
        <p className="top-status">{statusText}</p>
        {replyText ? <p className="top-reply">{replyText}</p> : null}
      </div>
      <div className="interval-card">
        <p className="section-label">Interval</p>
        <div className="interval-row">
          {INTERVAL_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`chip-button${selectedIntervalMs === option.value ? " is-active" : ""}`}
              onClick={() => setSelectedIntervalMs(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="button-row">
        <button
          type="button"
          className={`action-button${isStopConfirming ? " is-danger" : ""}`}
          onClick={handleStop}
        >
          {isStopConfirming ? "tasdiqla" : "stop"}
        </button>
        <button type="button" className="action-button" onClick={handleStart}>
          start
        </button>
      </div>
    </div>
  );
}
