# Hidop Bot

Render'da ma'lumotlar yo'qolmasligi uchun `DATA_DIR` ishlatiladi.

Tavsiya:
- Render service'ga `Persistent Disk` ulang
- `DATA_DIR=/var/data/hidop` qilib qo'ying
- start command sifatida `python3 bot.py` ishlating

Kod `DATA_DIR` ichida fayl bo'lmasa, boshlang'ich JSON'larni avtomatik `data/` papkadan ko'chiradi.

Frontend React + Vite bilan yozilgan.
- source fayllar: `src/`
- build natijasi: `wepapp/`
- build buyrug'i: `npm run build`
