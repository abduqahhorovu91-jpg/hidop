#include <HTTPClient.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char* BOT_ENDPOINT = "https://hidop.onrender.com/api/esp-message";
const char* BOT_DEVICE_URL_ENDPOINT = "https://hidop.onrender.com/api/esp-device-url";
const char* TELEGRAM_BOT_TOKEN = "8704209013:AAEbRNh1ofyyaPGaXc5HzUCXOKhSQHeoMcw";
const char* TELEGRAM_CHAT_ID = "8239140931";
const char* START_MESSAGE = "race.x299_299_1";
const char* STOP_MESSAGE = "race.x299_299_2";

const unsigned long DEFAULT_INTERVAL_MS = 10000;
const unsigned long WIFI_RETRY_DELAY_MS = 500;

WebServer server(80);
Preferences preferences;

bool isLoopRunning = false;
String loopMessage = START_MESSAGE;
String pendingMessage = "";
String lastReply = "Tayyor";
String lastStatus = "idle";
String lastCommand = "";
unsigned long sendCount = 0;
unsigned long loopIntervalMs = DEFAULT_INTERVAL_MS;
unsigned long lastLoopTickMs = 0;
bool hasPendingMessage = false;
String lastAnnouncedIp = "";

void saveRuntimeState() {
  preferences.putBool("running", isLoopRunning);
  preferences.putULong("interval", loopIntervalMs);
  preferences.putString("loop_msg", loopMessage);
}

void loadRuntimeState() {
  isLoopRunning = preferences.getBool("running", false);
  loopIntervalMs = preferences.getULong("interval", DEFAULT_INTERVAL_MS);
  loopMessage = preferences.getString("loop_msg", START_MESSAGE);

  if (loopIntervalMs < 1000) {
    loopIntervalMs = DEFAULT_INTERVAL_MS;
  }

  if (loopMessage.isEmpty()) {
    loopMessage = START_MESSAGE;
  }

  pendingMessage = "";
  hasPendingMessage = false;
}

String escapeJson(const String& value) {
  String escaped = value;
  escaped.replace("\\", "\\\\");
  escaped.replace("\"", "\\\"");
  escaped.replace("\n", "\\n");
  escaped.replace("\r", "\\r");
  return escaped;
}

void sendCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  server.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

String extractJsonString(const String& body, const String& key) {
  const String pattern = "\"" + key + "\"";
  const int keyIndex = body.indexOf(pattern);
  if (keyIndex < 0) {
    return "";
  }

  const int colonIndex = body.indexOf(':', keyIndex + pattern.length());
  if (colonIndex < 0) {
    return "";
  }

  const int firstQuote = body.indexOf('"', colonIndex + 1);
  if (firstQuote < 0) {
    return "";
  }

  int secondQuote = firstQuote + 1;
  while (secondQuote < body.length()) {
    secondQuote = body.indexOf('"', secondQuote);
    if (secondQuote < 0) {
      return "";
    }

    if (body.charAt(secondQuote - 1) != '\\') {
      break;
    }

    secondQuote += 1;
  }

  if (secondQuote < 0) {
    return "";
  }

  String value = body.substring(firstQuote + 1, secondQuote);
  value.replace("\\\"", "\"");
  value.replace("\\n", "\n");
  value.replace("\\r", "\r");
  value.replace("\\\\", "\\");
  return value;
}

unsigned long extractJsonUnsignedLong(const String& body, const String& key, unsigned long fallbackValue) {
  const String pattern = "\"" + key + "\"";
  const int keyIndex = body.indexOf(pattern);
  if (keyIndex < 0) {
    return fallbackValue;
  }

  const int colonIndex = body.indexOf(':', keyIndex + pattern.length());
  if (colonIndex < 0) {
    return fallbackValue;
  }

  int valueStart = colonIndex + 1;
  while (valueStart < body.length() && (body.charAt(valueStart) == ' ' || body.charAt(valueStart) == '\n')) {
    valueStart += 1;
  }

  int valueEnd = valueStart;
  while (valueEnd < body.length() && isDigit(body.charAt(valueEnd))) {
    valueEnd += 1;
  }

  if (valueEnd == valueStart) {
    return fallbackValue;
  }

  return strtoul(body.substring(valueStart, valueEnd).c_str(), nullptr, 10);
}

bool sendMessageToBot(const String& message, String& responseText) {
  if (WiFi.status() != WL_CONNECTED) {
    responseText = "Wi-Fi ulanmagan";
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  if (!http.begin(client, BOT_ENDPOINT)) {
    responseText = "HTTP ulanishi ochilmadi";
    return false;
  }

  http.setTimeout(15000);
  http.addHeader("Content-Type", "application/json");

  const String payload = "{\"message\":\"" + escapeJson(message) + "\"}";
  const int statusCode = http.POST(payload);
  const String responseBody = http.getString();
  http.end();

  if (statusCode <= 0) {
    responseText = "HTTP xatolik";
    return false;
  }

  String reply = extractJsonString(responseBody, "reply");
  if (reply.isEmpty()) {
    reply = responseBody;
  }

  responseText = reply;
  return statusCode >= 200 && statusCode < 300;
}

bool sendTelegramMessage(const String& text) {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  const String telegramUrl =
    String("https://api.telegram.org/bot") + TELEGRAM_BOT_TOKEN + "/sendMessage";

  if (!http.begin(client, telegramUrl)) {
    return false;
  }

  http.setTimeout(15000);
  http.addHeader("Content-Type", "application/json");

  const String payload =
    String("{\"chat_id\":\"") + TELEGRAM_CHAT_ID + "\",\"text\":\"" + escapeJson(text) + "\"}";

  const int statusCode = http.POST(payload);
  http.getString();
  http.end();

  return statusCode >= 200 && statusCode < 300;
}

bool sendDeviceUrlToBot(const String& deviceUrl) {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  if (!http.begin(client, BOT_DEVICE_URL_ENDPOINT)) {
    return false;
  }

  http.setTimeout(15000);
  http.addHeader("Content-Type", "application/json");

  const String payload = String("{\"url\":\"") + escapeJson(deviceUrl) + "\"}";
  const int statusCode = http.POST(payload);
  http.getString();
  http.end();

  return statusCode >= 200 && statusCode < 300;
}

void announceDeviceUrlIfNeeded() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  const String currentIp = WiFi.localIP().toString();
  if (currentIp.isEmpty() || currentIp == lastAnnouncedIp) {
    return;
  }

  const String message = String("http://") + currentIp;
  const bool botUpdated = sendDeviceUrlToBot(message);
  const bool telegramUpdated = sendTelegramMessage(message);

  if (botUpdated || telegramUpdated) {
    lastAnnouncedIp = currentIp;
  }
}

void handleStatus() {
  sendCorsHeaders();

  String body = "{";
  body += "\"ok\":true,";
  body += "\"running\":" + String(isLoopRunning ? "true" : "false") + ",";
  body += "\"wifiConnected\":" + String(WiFi.status() == WL_CONNECTED ? "true" : "false") + ",";
  body += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  body += "\"intervalMs\":" + String(loopIntervalMs) + ",";
  body += "\"sendCount\":" + String(sendCount) + ",";
  body += "\"lastCommand\":\"" + escapeJson(lastCommand) + "\",";
  body += "\"lastStatus\":\"" + escapeJson(lastStatus) + "\",";
  body += "\"lastReply\":\"" + escapeJson(lastReply) + "\"";
  body += "}";

  server.send(200, "application/json", body);
}

void handleOptions() {
  sendCorsHeaders();
  server.send(204);
}

void handleCommand() {
  sendCorsHeaders();

  const String body = server.arg("plain");
  const String message = extractJsonString(body, "message");
  unsigned long requestedIntervalMs = extractJsonUnsignedLong(body, "intervalMs", loopIntervalMs);

  if (message.isEmpty()) {
    server.send(400, "application/json", "{\"ok\":false,\"reply\":\"message topilmadi\"}");
    return;
  }

  if (requestedIntervalMs < 1000) {
    requestedIntervalMs = DEFAULT_INTERVAL_MS;
  }

  if (message == STOP_MESSAGE) {
    isLoopRunning = false;
    loopMessage = START_MESSAGE;
    loopIntervalMs = requestedIntervalMs;
    pendingMessage = message;
    hasPendingMessage = true;
    lastCommand = "stop";
  } else if (message == START_MESSAGE) {
    loopMessage = message;
    loopIntervalMs = requestedIntervalMs;
    isLoopRunning = true;
    lastLoopTickMs = millis();
    pendingMessage = message;
    hasPendingMessage = true;
    lastCommand = "start";
  } else {
    pendingMessage = message;
    hasPendingMessage = true;
    lastCommand = "single";
  }

  saveRuntimeState();
  lastStatus = isLoopRunning ? "running" : "stopped";
  lastReply = hasPendingMessage ? "Buyruq saqlandi" : "Tayyor";
  server.send(
    200,
    "application/json",
    "{\"ok\":true,\"reply\":\"" + escapeJson(lastReply) + "\",\"running\":" + String(isLoopRunning ? "true" : "false") + "}"
  );
}

void connectToWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(WIFI_RETRY_DELAY_MS);
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);

  preferences.begin("hidop-esp", false);
  loadRuntimeState();

  connectToWiFi();

  server.on("/status", HTTP_GET, handleStatus);
  server.on("/status", HTTP_OPTIONS, handleOptions);
  server.on("/command", HTTP_POST, handleCommand);
  server.on("/command", HTTP_OPTIONS, handleOptions);
  server.begin();

  lastStatus = isLoopRunning ? "running" : "idle";
  lastReply = isLoopRunning ? "Saqlangan rejim tiklandi" : "Tayyor";
  lastLoopTickMs = millis();

  Serial.print("ESP32 ready. IP: ");
  Serial.println(WiFi.localIP());
  announceDeviceUrlIfNeeded();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectToWiFi();
  }

  announceDeviceUrlIfNeeded();

  server.handleClient();

  if (hasPendingMessage) {
    String reply = "";
    const bool success = sendMessageToBot(pendingMessage, reply);
    if (success) {
      sendCount += 1;
      lastStatus = isLoopRunning ? "running" : "stopped";
      lastReply = reply.isEmpty() ? "Yuborildi" : reply;
      hasPendingMessage = false;
      pendingMessage = "";
    } else {
      lastStatus = "error";
      lastReply = reply.isEmpty() ? "Buyruq yuborilmadi" : reply;
    }
  }

  if (!isLoopRunning) {
    return;
  }

  const unsigned long now = millis();
  if (now - lastLoopTickMs < loopIntervalMs) {
    return;
  }

  lastLoopTickMs = now;

  String reply = "";
  const bool success = sendMessageToBot(loopMessage, reply);
  if (success) {
    sendCount += 1;
    lastStatus = "running";
    lastReply = reply.isEmpty() ? "Yuborildi" : reply;
  } else {
    lastStatus = "error";
    lastReply = reply.isEmpty() ? "Loop xatoligi" : reply;
  }
}
