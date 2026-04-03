import { useEffect, useRef, useState } from "react";

const TARGET_URL = "https://hidop.onrender.com/api/esp-message";
const START_MESSAGE = "race.x299_299_1";
const STOP_MESSAGE = "race.x299_299_2";
const REQUEST_TIMEOUT_MS = 15_000;
const ALERT_BOT_TOKEN = "8704209013:AAEbRNh1ofyyaPGaXc5HzUCXOKhSQHeoMcw";
const ALERT_CHAT_ID = "8239140931";
const ALERT_TEXT = "❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌";
const INTERVAL_OPTIONS = [
  { label: "10 sekund", value: 10_000 },
  { label: "30 sekund", value: 30_000 },
  { label: "1 daqiqa", value: 60_000 },
];

export default function App() {
  const intervalRef = useRef(null);
  const isSendingAlertRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);
  const [sendCount, setSendCount] = useState(0);
  const [statusText, setStatusText] = useState("Tayyor");
  const [replyText, setReplyText] = useState("");
  const [selectedIntervalMs, setSelectedIntervalMs] = useState(
    INTERVAL_OPTIONS[0].value,
  );
  const [isStopConfirming, setIsStopConfirming] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

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

  async function sendFailureAlertBatch() {
    if (isSendingAlertRef.current) {
      return;
    }

    isSendingAlertRef.current = true;

    try {
      for (let index = 0; index < 3; index += 1) {
        await fetch(`https://api.telegram.org/bot${ALERT_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: ALERT_CHAT_ID,
            text: ALERT_TEXT,
          }),
        }).catch(() => null);
      }
    } finally {
      isSendingAlertRef.current = false;
    }
  }

  async function sendMessage(message) {
    if (!isOnline) {
      setStatusText("Yuborilmadi: offline");
      setReplyText("Internet ulanmagani uchun yuborilmadi");
      return;
    }

    setStatusText("Yuborilyapti...");

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(TARGET_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          message,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const replyMessage =
          payload && typeof payload.reply === "string" && payload.reply.trim()
            ? payload.reply
            : `HTTP ${response.status}`;
        throw new Error(replyMessage);
      }

      setSendCount((current) => current + 1);
      setStatusText("Yuborildi");
      setReplyText(
        payload && typeof payload.reply === "string" && payload.reply.trim()
          ? payload.reply
          : "",
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Noma'lum xatolik";
      const shouldAlert =
        error instanceof DOMException && error.name === "AbortError"
          ? true
          : /failed to fetch|networkerror|load failed/i.test(errorMessage);

      if (shouldAlert) {
        void sendFailureAlertBatch();
      }

      const visibleMessage =
        error instanceof DOMException && error.name === "AbortError"
          ? "Server javob bermadi"
          : errorMessage;

      setStatusText(`Yuborilmadi: ${visibleMessage}`);
      setReplyText(visibleMessage);
    } finally {
      window.clearTimeout(timeoutId);
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
      <div className="top-block">
        <p className="top-line">Holat: {isRunning ? "aktiv" : "to'xtagan"}</p>
        <p className="top-line">
          Internet: {isOnline ? "online" : "offline"}
        </p>
        <p className="top-line">
          Interval:{" "}
          {INTERVAL_OPTIONS.find((item) => item.value === selectedIntervalMs)
            ?.label || "10 sekund"}
        </p>
        <p className="top-line">Yuborilgan: {sendCount} marta</p>
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
