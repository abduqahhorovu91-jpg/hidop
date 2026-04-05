import { useEffect, useMemo, useState } from "react";

const intervalOptions = [
  { label: "10 sekund", value: "10s" },
  { label: "30 sekund", value: "30s" },
  { label: "1 daqiqa", value: "1m" },
];
const DEVICE_URL_API = "/api/device-url";
const DEVICE_STATUS_API = "/api/device-status";
const DEVICE_COMMAND_API = "/api/esp-command";

export default function App() {
  const [deviceUrl, setDeviceUrl] = useState("");
  const [selectedInterval, setSelectedInterval] = useState(intervalOptions[0].value);
  const [isRunning, setIsRunning] = useState(false);
  const [isDeviceOnline, setIsDeviceOnline] = useState(false);
  const [isBotActive, setIsBotActive] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [sentLogs, setSentLogs] = useState([]);
  const [topAlert, setTopAlert] = useState("");

  const statusLabel = useMemo(() => {
    if (!deviceUrl.trim()) return "ESP32 URL kutilmoqda";
    if (!isDeviceOnline || !isBotActive) return "nofaol";
    return isRunning ? "faol" : "tayyor";
  }, [deviceUrl, isBotActive, isDeviceOnline, isRunning]);

  useEffect(() => {
    let cancelled = false;

    async function syncDeviceUrlFromBackend() {
      try {
        const response = await fetch(DEVICE_URL_API, { cache: "no-store" });
        if (!response.ok) return;

        const payload = await response.json();
        if (cancelled) return;

        const nextUrl = String(payload?.url || "").trim();
        if (nextUrl && nextUrl !== deviceUrl) {
          setDeviceUrl(nextUrl);
        }
      } catch {
        // Backend bo'lmasa joriy holatni saqlaymiz.
      }
    }

    syncDeviceUrlFromBackend();
    const intervalId = window.setInterval(syncDeviceUrlFromBackend, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [deviceUrl]);

  useEffect(() => {
    let cancelled = false;

    async function syncDeviceStatus() {
      try {
        const response = await fetch(DEVICE_STATUS_API, { cache: "no-store" });
        if (!response.ok) return;

        const payload = await response.json();
        if (cancelled) return;

        const device = payload?.device || {};
        const nextUrl =
          String(device?.deviceUrl || "").trim() ||
          (device?.ip ? `http://${device.ip}` : "");

        if (nextUrl && nextUrl !== deviceUrl) {
          setDeviceUrl(nextUrl);
        }

        setIsDeviceOnline(true);
        setIsBotActive(Boolean(device?.botConnected));
        setIsRunning(Boolean(device?.running));
        setSentCount(Number(device?.sendCount) || 0);

        const reply = String(device?.lastReply || "").trim();
        if (reply) {
          if (reply.toLowerCase() === "bot to'xtatildi") {
            setTopAlert("bot to'xtatildi");
          }
          setSentLogs((current) => {
            if (current[0] === reply) {
              return current;
            }
            return [reply, ...current].slice(0, 6);
          });
        }
      } catch {
        if (!cancelled) {
          setIsDeviceOnline(false);
          setIsBotActive(false);
          setIsRunning(false);
        }
      }
    }

    syncDeviceStatus();
    const intervalId = window.setInterval(syncDeviceStatus, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [deviceUrl]);

  async function persistDeviceUrl(nextUrl) {
    try {
      await fetch(DEVICE_URL_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: nextUrl }),
      });
    } catch {
      // Front ishlashida to'siq qilmaymiz.
    }
  }

  async function postCommand(message) {
    const response = await fetch(DEVICE_COMMAND_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        intervalMs:
          selectedInterval === "10s" ? 10000 : selectedInterval === "30s" ? 30000 : 60000,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || "ESP32 javob bermadi");
    }

    return response.json();
  }

  async function handleStart() {
    if (!deviceUrl.trim()) return;

    try {
      const payload = await postCommand("race.x299_299_1");
      setIsDeviceOnline(true);
      const device = payload?.device || {};
      setIsBotActive(Boolean(device?.botConnected));
      setIsRunning(Boolean(device?.running ?? true));
      setSentCount(Number(device?.sendCount) || 0);
      setTopAlert("");
      if (device?.lastReply) {
        setSentLogs((current) => [device.lastReply, ...current].slice(0, 6));
      }
    } catch {
      setIsDeviceOnline(false);
      setIsBotActive(false);
      setIsRunning(false);
    }
  }

  async function handleStop() {
    try {
      const payload = await postCommand("race.x299_299_2");
      setIsDeviceOnline(true);
      const device = payload?.device || {};
      setIsBotActive(Boolean(device?.botConnected));
      setSentCount(Number(device?.sendCount) || 0);
      setTopAlert("bot to'xtatildi");
      if (device?.lastReply) {
        setSentLogs((current) => [device.lastReply, ...current].slice(0, 6));
      }
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <main className="page-shell">
      {topAlert ? <div className="top-alert">{topAlert}</div> : null}
      <section className="panel-grid">
        <article className="panel panel-primary">
          <div className="panel-head">
            <span className="panel-label">Qurilma</span>
            <span className={`dot${isBotActive ? " is-live" : ""}`} />
          </div>
          <div className="info-row">
            <div>
              <span className="meta-label">Interval</span>
              <strong>
                {intervalOptions.find((item) => item.value === selectedInterval)?.label}
              </strong>
            </div>
            <div>
              <span className="meta-label">Holati</span>
              <strong>{isBotActive ? "faol" : "nofaol"}</strong>
            </div>
            <div>
              <span className="meta-label">Yuborilgan</span>
              <strong>{sentCount} marta</strong>
            </div>
          </div>
          <div className="history-block">
            <span className="meta-label">Yuborilgan ro'yhat</span>
            <div className="history-list">
              {sentLogs.length > 0 ? (
                sentLogs.map((item) => <div key={item} className="history-item">{item}</div>)
              ) : (
                <div className="history-empty">Hali buyruq yuborilmagan</div>
              )}
            </div>
          </div>
        </article>

        <article className="panel">
          <span className="panel-label">Interval</span>
          <div className="chip-row">
            {intervalOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`chip${selectedInterval === option.value ? " is-active" : ""}`}
                onClick={() => setSelectedInterval(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="action-row">
            <button type="button" className="action-button is-muted" onClick={handleStop}>
              stop
            </button>
            <button type="button" className="action-button" onClick={handleStart}>
              start
            </button>
          </div>
        </article>
      </section>
    </main>
  );
}
