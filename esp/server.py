from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

BASE_DIR = Path(__file__).resolve().parent
DIST_DIR = BASE_DIR / "dist"
STATE_FILE = BASE_DIR / "device_url.json"

app = Flask(__name__, static_folder=str(DIST_DIR), static_url_path="")
CORS(app)


def load_state() -> dict[str, str]:
    try:
        if STATE_FILE.exists():
            with STATE_FILE.open("r", encoding="utf-8") as file:
                payload = json.load(file)
            if isinstance(payload, dict):
                return {
                    "url": str(payload.get("url", "") or "").strip(),
                    "updated_at": str(payload.get("updated_at", "") or "").strip(),
                }
    except Exception:
        pass
    return {"url": "", "updated_at": ""}


def save_state(url: str) -> dict[str, str]:
    payload = {
        "url": url.strip(),
        "updated_at": datetime.now().isoformat(timespec="seconds"),
    }
    with STATE_FILE.open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
    return payload


def request_device_json(path: str, *, method: str = "GET", payload: dict | None = None) -> tuple[dict | None, str | None]:
    state = load_state()
    device_url = str(state.get("url", "") or "").strip().rstrip("/")
    if not device_url:
        return None, "ESP32 URL hali kelmagan"

    target_url = f"{device_url}{path}"
    request_body = None
    headers = {}
    if payload is not None:
        request_body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = Request(target_url, data=request_body, headers=headers, method=method)

    try:
        with urlopen(req, timeout=8) as response:
            raw = response.read().decode("utf-8")
        parsed = json.loads(raw) if raw else {}
        return parsed if isinstance(parsed, dict) else {}, None
    except HTTPError as exc:
        return None, f"ESP32 HTTP {exc.code}"
    except URLError:
        return None, "ESP32 ga ulanib bo'lmadi"
    except Exception:
        return None, "ESP32 javobi o'qilmadi"


@app.get("/api/device-url")
def get_device_url():
    state = load_state()
    return jsonify({"ok": True, **state})


@app.post("/api/device-url")
def set_device_url():
    payload = request.get_json(silent=True) or {}
    device_url = str(payload.get("url", "") or "").strip().rstrip("/")

    if not device_url:
        device_url = str(request.form.get("url", "") or "").strip().rstrip("/")
    if not device_url:
        device_url = request.get_data(as_text=True).strip().rstrip("/")

    if not device_url:
        return jsonify({"ok": False, "error": "url topilmadi"}), 400

    state = save_state(device_url)
    return jsonify({"ok": True, **state})


@app.get("/api/device-status")
def get_device_status():
    payload, error = request_device_json("/status")
    if error:
        return jsonify({"ok": False, "error": error}), 503
    return jsonify({"ok": True, "device": payload or {}})


@app.post("/api/esp-command")
def send_esp_command():
    payload = request.get_json(silent=True) or {}
    message = str(payload.get("message", "") or "").strip()
    interval_ms = int(payload.get("intervalMs") or 0)

    if not message:
        return jsonify({"ok": False, "error": "message kerak"}), 400

    device_payload, error = request_device_json(
        "/command",
        method="POST",
        payload={
            "message": message,
            "intervalMs": interval_ms,
        },
    )
    if error:
        return jsonify({"ok": False, "error": error}), 503
    return jsonify({"ok": True, "device": device_payload or {}})


@app.get("/")
def serve_index():
    return send_from_directory(DIST_DIR, "index.html")


@app.get("/<path:path>")
def serve_static(path: str):
    target = DIST_DIR / path
    if target.exists():
        return send_from_directory(DIST_DIR, path)
    return send_from_directory(DIST_DIR, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8002, debug=True)
