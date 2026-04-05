# ESP32 WROOM Bridge

Bu firmware oddiy `ESP32-WROOM` ni browser bilan `bot.py` orasidagi ko'prik qiladi.

Ishlash tartibi:
- sayt `POST /command` bilan `start` yoki `stop` yuboradi
- ESP32 buyruqni qabul qiladi
- `start` kelganda ESP32 o'zi interval bo'yicha `BOT_ENDPOINT` ga xabar yuboradi
- `stop` kelganda loop to'xtaydi va stop xabari bir marta jo'natiladi

Kerakli kutubxonalar:
- `WiFi`
- `WebServer`
- `HTTPClient`
- `WiFiClientSecure`

Arduino IDE sozlamasi:
- Board: `ESP32 Dev Module`

O'zgartiriladigan joylar:
- `WIFI_SSID`
- `WIFI_PASSWORD`
- `BOT_ENDPOINT`

Saqlanib qoladigan sozlamalar:
- `start/stop` holati
- `intervalMs`

Sayt orqali yangi buyruq kelsa, ESP32 uni xotirada saqlab qoladi va qayta yoqilgandan keyin ham shu oxirgi holat bilan ishlaydi.

Frontend ulanishi:
- `esp/src/App.jsx` ichidagi `ESP_DEVICE_URL` ga ESP32 IP manzilini yozing
- misol: `http://192.168.1.150`

Endpointlar:
- `GET /status`
- `POST /command`

`POST /command` body misoli:

```json
{
  "message": "race.x299_299_1",
  "intervalMs": 10000
}
```
