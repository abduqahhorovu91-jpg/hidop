const DEVICE_STATUS_API = "/api/device-status";
const DEVICE_COMMAND_API = "/api/esp-command";

const intervalOptions = new Map([
  ["10000", "10 sekund"],
  ["30000", "30 sekund"],
  ["60000", "1 daqiqa"],
]);

const state = {
  selectedIntervalMs: "10000",
  isDeviceOnline: false,
  isBotActive: false,
  isRunning: false,
  sentCount: 0,
  sentLogs: [],
  lastCommand: "",
  lastReply: "",
  pendingCommand: "",
};

const elements = {
  topAlert: document.getElementById("top-alert"),
  deviceDot: document.getElementById("device-dot"),
  statusValue: document.getElementById("status-value"),
  deviceStateValue: document.getElementById("device-state-value"),
  replyStateValue: document.getElementById("reply-state-value"),
  messageLine: document.getElementById("message-line"),
  toggleButton: document.getElementById("toggle-button"),
};

function getPresenceLabel() {
  if (state.isRunning) return "faol";
  if (state.isDeviceOnline) return "tayyor";
  return "nofaol";
}

function getBotLabel() {
  if (state.lastReply.toLowerCase() === "deactive") return "deactive";
  if (state.isBotActive) return "active";
  if (state.isDeviceOnline) return "kutilyapti";
  return "noactive";
}

function getStatusMessage() {
  if (!state.isDeviceOnline) {
    return "ESP32 hali backendga ulanmagan";
  }
  if (state.pendingCommand === "start") {
    return "ESP32 ishga tushmoqda";
  }
  if (state.pendingCommand === "stop") {
    return "ESP32 to'xtamoqda";
  }
  if (state.isRunning && state.isBotActive) {
    return "ESP32 faol, bot ishlayapti";
  }
  if (state.isRunning) {
    return "ESP32 faol, bot javobi kutilyapti";
  }
  return "ESP32 ulangan va buyruq kutmoqda";
}

function render() {
  const statusMessage = getStatusMessage();
  const visibleMessage = state.lastReply || statusMessage;
  elements.statusValue.textContent = getPresenceLabel();
  elements.deviceDot.classList.toggle("is-live", state.isDeviceOnline);
  elements.deviceStateValue.textContent = state.isDeviceOnline ? "online" : "offline";
  elements.replyStateValue.textContent = getBotLabel();
  elements.messageLine.textContent = visibleMessage;
  showTopAlert(visibleMessage);

  const buttonActive = state.isDeviceOnline && state.pendingCommand !== "stop";
  elements.toggleButton.classList.toggle("is-on", buttonActive);
  elements.toggleButton.classList.toggle("is-off", !buttonActive);
  elements.toggleButton.disabled = Boolean(state.pendingCommand) || !state.isDeviceOnline;
  if (state.isRunning) {
    elements.toggleButton.textContent = "o'chirish";
  } else {
    elements.toggleButton.textContent = state.isDeviceOnline ? "yoqish" : "start";
  }
}

function showTopAlert(message) {
  if (!message) {
    elements.topAlert.textContent = "";
    elements.topAlert.classList.add("is-hidden");
    return;
  }

  elements.topAlert.textContent = message;
  elements.topAlert.classList.remove("is-hidden");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "So'rov bajarilmadi");
  }
  return payload;
}

function pushLog(message) {
  const text = String(message || "").trim();
  if (!text) return;
  if (state.sentLogs[0] === text) return;
  state.sentLogs = [text, ...state.sentLogs].slice(0, 6);
}

async function syncDeviceStatus() {
  const payload = await fetchJson(DEVICE_STATUS_API, { cache: "no-store" });
  const device = payload?.device || {};

  state.isDeviceOnline = Boolean(device?.online);
  state.isBotActive = Boolean(device?.botConnected);
  state.isRunning = Boolean(device?.running);
  state.sentCount = Number(device?.messageCount) || 0;

  const intervalMs = String(device?.intervalMs || state.selectedIntervalMs);
  if (intervalOptions.has(intervalMs)) {
    state.selectedIntervalMs = intervalMs;
  }

  state.lastCommand = String(device?.lastCommand || "").trim();
  if (Array.isArray(device?.messageHistory)) {
    state.sentLogs = device.messageHistory
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 10);
  }
  const reply = String(device?.lastReply || "").trim();
  state.lastReply = reply;
  if (reply) {
    if (reply.toLowerCase() === "bot to'xtatildi") {
      state.pendingCommand = "";
    } else if (state.isDeviceOnline && state.isBotActive) {
      state.pendingCommand = "";
    }
  }

  render();
}

async function sendCommand(message) {
  await fetchJson(DEVICE_COMMAND_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      intervalMs: Number(state.selectedIntervalMs),
    }),
  });

  if (message === "race.x299_299_2") {
    state.pendingCommand = "stop";
    state.lastReply = "";
  } else {
    state.pendingCommand = "start";
    state.lastReply = "";
  }
  render();
}

elements.toggleButton.addEventListener("click", async () => {
  const command = state.isRunning ? "race.x299_299_2" : "race.x299_299_1";
  const fallbackError = state.isRunning ? "Stop yuborilmadi" : "Start yuborilmadi";
  try {
    await sendCommand(command);
  } catch (error) {
    showTopAlert(error instanceof Error ? error.message : fallbackError);
  }
});

async function bootstrap() {
  render();

  try {
    await syncDeviceStatus();
  } catch {
    showTopAlert("ESP32 hali backendga ulanmagan");
    render();
  }

  window.setInterval(async () => {
    try {
      await syncDeviceStatus();
    } catch {
      state.isDeviceOnline = false;
      state.isBotActive = false;
      state.isRunning = false;
      state.lastReply = "";
      showTopAlert("ESP32 hali backendga ulanmagan");
      render();
    }
  }, 5000);
}

bootstrap();
