#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char* DEVICE_URL_ENDPOINT = "https://esp-esp-esp.onrender.com/api/device-url";
const char* DEVICE_STATE_ENDPOINT = "https://esp-esp-esp.onrender.com/api/device-state";
const char* DEVICE_COMMAND_ENDPOINT = "https://esp-esp-esp.onrender.com/api/device-command";
const char* RENDER_KEEPALIVE_ENDPOINT = "https://esp-esp-esp.onrender.com";
const char* BOT_ENDPOINT = "https://hidop.onrender.com/api/esp-message";
const char* BOT_STATUS_ENDPOINT = "https://hidop.onrender.com/api/esp-status";

const char* START_MESSAGE = "race.x299_299_1";
const char* STOP_MESSAGE = "race.x299_299_2";

const unsigned long DEFAULT_INTERVAL_MS = 10000;
const unsigned long WIFI_RETRY_DELAY_MS = 500;
const unsigned long COMMAND_POLL_INTERVAL_MS = 4000;
const unsigned long STATE_REPORT_INTERVAL_MS = 5000;
const unsigned long RENDER_KEEPALIVE_INTERVAL_MS = 1000;
const unsigned long BOT_STATUS_POLL_INTERVAL_MS = 3000;

Preferences preferences;

bool isLoopRunning = false;
bool botConnected = false;
bool startupReported = false;

String loopMessage = START_MESSAGE;
String lastReply = "";
String lastStatus = "nofaol";
String lastCommand = "";

unsigned long loopIntervalMs = DEFAULT_INTERVAL_MS;
unsigned long lastLoopTickMs = 0;
unsigned long lastCommandPollMs = 0;
unsigned long lastStateReportMs = 0;
unsigned long lastKeepAliveMs = 0;
unsigned long lastBotStatusPollMs = 0;
long lastCommandId = 0;

String escapeJson(const String& value) {
  String escaped = value;
  escaped.replace("\\", "\\\\");
  escaped.replace("\"", "\\\"");
  escaped.replace("\n", "\\n");
  escaped.replace("\r", "\\r");
  return escaped;
}

String currentDeviceUrl() {
  return "http://" + WiFi.localIP().toString();
}

void saveRuntimeState() {
  preferences.putBool("running", isLoopRunning);
  preferences.putBool("bot_connected", botConnected);
  preferences.putULong("interval", loopIntervalMs);
  preferences.putString("loop_msg", loopMessage);
  preferences.putString("last_reply", lastReply);
  preferences.putString("last_status", lastStatus);
  preferences.putString("last_command", lastCommand);
  preferences.putLong("last_command_id", lastCommandId);
}

void loadRuntimeState() {
  isLoopRunning = preferences.getBool("running", false);
  botConnected = preferences.getBool("bot_connected", false);
  loopIntervalMs = preferences.getULong("interval", DEFAULT_INTERVAL_MS);
  loopMessage = preferences.getString("loop_msg", START_MESSAGE);
  lastReply = preferences.getString("last_reply", "");
  lastStatus = preferences.getString("last_status", "nofaol");
  lastCommand = preferences.getString("last_command", "");
  lastCommandId = preferences.getLong("last_command_id", 0);

  if (loopIntervalMs < 1000) {
    loopIntervalMs = DEFAULT_INTERVAL_MS;
  }
  if (loopMessage.isEmpty()) {
    loopMessage = START_MESSAGE;
  }
}

void updatePresenceState() {
  if (isLoopRunning && botConnected) {
    lastStatus = "faol";
  } else if (isLoopRunning) {
    lastStatus = "tayyor";
  } else {
    lastStatus = "nofaol";
  }
}

void connectToWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(WIFI_RETRY_DELAY_MS);
  }
}

String extractJsonString(const String& body, const String& key) {
  const String pattern = "\"" + key + "\"";
  const int keyIndex = body.indexOf(pattern);
  if (keyIndex < 0) return "";

  const int colonIndex = body.indexOf(':', keyIndex + pattern.length());
  if (colonIndex < 0) return "";

  const int firstQuote = body.indexOf('"', colonIndex + 1);
  if (firstQuote < 0) return "";

  int secondQuote = firstQuote + 1;
  while (secondQuote < body.length()) {
    secondQuote = body.indexOf('"', secondQuote);
    if (secondQuote < 0) return "";
    if (body.charAt(secondQuote - 1) != '\\') break;
    secondQuote += 1;
  }

  String value = body.substring(firstQuote + 1, secondQuote);
  value.replace("\\\"", "\"");
  value.replace("\\n", "\n");
  value.replace("\\r", "\r");
  value.replace("\\\\", "\\");
  return value;
}

long extractJsonLong(const String& body, const String& key, long fallbackValue) {
  const String pattern = "\"" + key + "\"";
  const int keyIndex = body.indexOf(pattern);
  if (keyIndex < 0) return fallbackValue;

  const int colonIndex = body.indexOf(':', keyIndex + pattern.length());
  if (colonIndex < 0) return fallbackValue;

  int valueStart = colonIndex + 1;
  while (valueStart < body.length() && (body.charAt(valueStart) == ' ' || body.charAt(valueStart) == '\n')) {
    valueStart += 1;
  }

  int valueEnd = valueStart;
  if (valueEnd < body.length() && body.charAt(valueEnd) == '-') {
    valueEnd += 1;
  }
  while (valueEnd < body.length() && isDigit(body.charAt(valueEnd))) {
    valueEnd += 1;
  }

  if (valueEnd == valueStart) return fallbackValue;
  return strtol(body.substring(valueStart, valueEnd).c_str(), nullptr, 10);
}

bool postJson(const char* endpoint, const String& payload, String& responseText) {
  if (WiFi.status() != WL_CONNECTED) {
    responseText = "Wi-Fi ulanmagan";
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  if (!http.begin(client, endpoint)) {
    responseText = "HTTP ulanish ochilmadi";
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  const int statusCode = http.POST(payload);
  responseText = http.getString();
  http.end();

  return statusCode >= 200 && statusCode < 300;
}

bool getJson(const char* endpoint, String& responseText) {
  if (WiFi.status() != WL_CONNECTED) {
    responseText = "Wi-Fi ulanmagan";
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  if (!http.begin(client, endpoint)) {
    responseText = "HTTP ulanish ochilmadi";
    return false;
  }

  const int statusCode = http.GET();
  responseText = http.getString();
  http.end();

  return statusCode >= 200 && statusCode < 300;
}

void pingRenderKeepAlive() {
  if (!isLoopRunning) {
    return;
  }
  if (millis() - lastKeepAliveMs < RENDER_KEEPALIVE_INTERVAL_MS) {
    return;
  }
  lastKeepAliveMs = millis();

  String responseText;
  getJson(RENDER_KEEPALIVE_ENDPOINT, responseText);
}

void syncBotStatus() {
  if (millis() - lastBotStatusPollMs < BOT_STATUS_POLL_INTERVAL_MS) {
    return;
  }
  lastBotStatusPollMs = millis();

  String responseText;
  if (!getJson(BOT_STATUS_ENDPOINT, responseText)) {
    return;
  }

  const String status = extractJsonString(responseText, "status");
  const String reply = extractJsonString(responseText, "reply");

  if (status == "active") {
    botConnected = true;
  } else if (status == "deactive" || status == "noactive") {
    botConnected = false;
  }

  if (!reply.isEmpty()) {
    lastReply = reply;
  }

  updatePresenceState();
  saveRuntimeState();
  reportDeviceState();
}

void reportDeviceUrl() {
  String responseText;
  const String payload = "{\"url\":\"" + escapeJson(currentDeviceUrl()) + "\"}";
  postJson(DEVICE_URL_ENDPOINT, payload, responseText);
}

void reportDeviceState() {
  updatePresenceState();

  String payload = "{";
  payload += "\"deviceUrl\":\"" + escapeJson(currentDeviceUrl()) + "\",";
  payload += "\"running\":" + String(isLoopRunning ? "true" : "false") + ",";
  payload += "\"botConnected\":" + String(botConnected ? "true" : "false") + ",";
  payload += "\"lastReply\":\"" + escapeJson(lastReply) + "\",";
  payload += "\"lastStatus\":\"" + escapeJson(lastStatus) + "\",";
  payload += "\"lastCommand\":\"" + escapeJson(lastCommand) + "\",";
  payload += "\"intervalMs\":" + String(loopIntervalMs) + ",";
  payload += "\"commandId\":" + String(lastCommandId);
  payload += "}";

  String responseText;
  postJson(DEVICE_STATE_ENDPOINT, payload, responseText);
}

void handleStartCommand(long commandId, long intervalMs) {
  isLoopRunning = true;
  botConnected = false;
  loopMessage = START_MESSAGE;
  lastCommand = "start";
  lastReply = "ESP32 bot.py ga xabar yuborishni boshladi";
  lastCommandId = commandId;
  if (intervalMs >= 1000) {
    loopIntervalMs = (unsigned long)intervalMs;
  }
  lastLoopTickMs = millis() - loopIntervalMs;
  updatePresenceState();
  saveRuntimeState();
  reportDeviceState();
}

void handleStopCommand(long commandId) {
  isLoopRunning = false;
  botConnected = false;
  lastCommand = "stop";
  lastReply = "bot to'xtatildi";
  lastCommandId = commandId;
  updatePresenceState();
  saveRuntimeState();
  reportDeviceState();
}

void pollCommand() {
  if (millis() - lastCommandPollMs < COMMAND_POLL_INTERVAL_MS) {
    return;
  }
  lastCommandPollMs = millis();

  String endpoint = String(DEVICE_COMMAND_ENDPOINT) + "?after_id=" + String(lastCommandId);
  String responseText;
  if (!getJson(endpoint.c_str(), responseText)) {
    return;
  }

  if (responseText.indexOf("\"pending\":true") < 0) {
    return;
  }

  const long commandId = extractJsonLong(responseText, "id", lastCommandId);
  const String message = extractJsonString(responseText, "message");
  const long intervalMs = extractJsonLong(responseText, "intervalMs", loopIntervalMs);

  if (message == STOP_MESSAGE) {
    handleStopCommand(commandId);
    return;
  }

  handleStartCommand(commandId, intervalMs);
}

void pingBot() {
  if (!isLoopRunning) {
    return;
  }
  if (millis() - lastLoopTickMs < loopIntervalMs) {
    return;
  }
  lastLoopTickMs = millis();

  String payload = "{";
  payload += "\"message\":\"" + escapeJson(loopMessage) + "\",";
  payload += "\"intervalMs\":" + String(loopIntervalMs) + ",";
  payload += "\"deviceUrl\":\"" + escapeJson(currentDeviceUrl()) + "\"";
  payload += "}";
  String responseText;
  const bool ok = postJson(BOT_ENDPOINT, payload, responseText);

  botConnected = ok;
  if (ok) {
    String reply = extractJsonString(responseText, "reply");
    lastReply = reply.isEmpty() ? "Bot active" : reply;
  } else {
    lastReply = "Bot javobi kelmadi";
  }
  updatePresenceState();
  saveRuntimeState();
  reportDeviceState();
}

void heartbeat() {
  if (!startupReported) {
    reportDeviceUrl();
    reportDeviceState();
    startupReported = true;
  }

  if (millis() - lastStateReportMs < STATE_REPORT_INTERVAL_MS) {
    return;
  }
  lastStateReportMs = millis();
  reportDeviceState();
}

void setup() {
  Serial.begin(115200);
  preferences.begin("esp-state", false);
  loadRuntimeState();
  connectToWiFi();
  reportDeviceUrl();
  reportDeviceState();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectToWiFi();
    reportDeviceUrl();
  }

  heartbeat();
  pollCommand();
  pingRenderKeepAlive();
  pingBot();
  syncBotStatus();
  delay(50);
}
