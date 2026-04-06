from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

BASE_DIR = Path(__file__).resolve().parent
DEVICE_FILE = BASE_DIR / "device_state.json"
COMMAND_FILE = BASE_DIR / "command_state.json"
HEARTBEAT_TIMEOUT_SECONDS = 35

app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")
CORS(app)


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def load_json(path: Path, fallback: dict) -> dict:
    try:
        if path.exists():
            with path.open("r", encoding="utf-8") as file:
                payload = json.load(file)
            if isinstance(payload, dict):
                return payload
    except Exception:
        pass
    return dict(fallback)


def save_json(path: Path, payload: dict) -> dict:
    with path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
    return payload


def default_device_state() -> dict:
    return {
        "url": "",
        "updated_at": "",
        "running": False,
        "botConnected": False,
        "sendCount": 0,
        "messageCount": 0,
        "lastReply": "",
        "lastStatus": "nofaol",
        "lastCommand": "",
        "intervalMs": 10000,
        "commandId": 0,
        "replyHistory": [],
        "messageHistory": [],
    }


def default_command_state() -> dict:
    return {
        "id": 0,
        "message": "",
        "intervalMs": 10000,
        "created_at": "",
    }


def load_device_state() -> dict:
    return load_json(DEVICE_FILE, default_device_state())


def save_device_state(payload: dict) -> dict:
    state = default_device_state()
    state.update(payload)
    return save_json(DEVICE_FILE, state)


def load_command_state() -> dict:
    return load_json(COMMAND_FILE, default_command_state())


def save_command_state(payload: dict) -> dict:
    state = default_command_state()
    state.update(payload)
    return save_json(COMMAND_FILE, state)


def is_device_online(updated_at: str) -> bool:
    if not updated_at:
        return False
    try:
        updated = datetime.fromisoformat(updated_at)
    except ValueError:
        return False
    return datetime.now() - updated <= timedelta(seconds=HEARTBEAT_TIMEOUT_SECONDS)


@app.get("/api/device-url")
def get_device_url():
    state = load_device_state()
    return jsonify(
        {
            "ok": True,
            "url": str(state.get("url", "") or "").strip(),
            "updated_at": str(state.get("updated_at", "") or "").strip(),
            "online": is_device_online(str(state.get("updated_at", "") or "").strip()),
        }
    )


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

    state = load_device_state()
    state["url"] = device_url
    state["updated_at"] = now_iso()
    save_device_state(state)
    return jsonify({"ok": True, "url": state["url"], "updated_at": state["updated_at"]})


@app.post("/api/device-state")
def set_device_state():
    payload = request.get_json(silent=True) or {}
    state = load_device_state()

    url = str(payload.get("deviceUrl", payload.get("url", "")) or "").strip().rstrip("/")
    if url:
        state["url"] = url

    if "running" in payload:
        state["running"] = bool(payload.get("running"))
    if "botConnected" in payload:
        state["botConnected"] = bool(payload.get("botConnected"))
    if "sendCount" in payload:
        try:
            state["sendCount"] = int(payload.get("sendCount") or 0)
        except (TypeError, ValueError):
            pass
    if "messageCount" in payload:
        try:
            state["messageCount"] = int(payload.get("messageCount") or 0)
        except (TypeError, ValueError):
            pass
    if "intervalMs" in payload:
        try:
            state["intervalMs"] = int(payload.get("intervalMs") or 10000)
        except (TypeError, ValueError):
            pass

    state["lastReply"] = str(payload.get("lastReply", state.get("lastReply", "")) or "").strip()
    state["lastStatus"] = str(payload.get("lastStatus", state.get("lastStatus", "nofaol")) or "").strip()
    state["lastCommand"] = str(payload.get("lastCommand", state.get("lastCommand", "")) or "").strip()

    if "commandId" in payload:
        try:
            state["commandId"] = int(payload.get("commandId") or 0)
        except (TypeError, ValueError):
            pass

    reply_history = payload.get("replyHistory")
    if isinstance(reply_history, list):
        cleaned_history = []
        for item in reply_history[:10]:
            text = str(item or "").strip()
            if text:
                cleaned_history.append(text)
        state["replyHistory"] = cleaned_history

    message_history = payload.get("messageHistory")
    if isinstance(message_history, list):
        cleaned_history = []
        for item in message_history[:10]:
            text = str(item or "").strip()
            if text:
                cleaned_history.append(text)
        state["messageHistory"] = cleaned_history

    state["updated_at"] = now_iso()
    save_device_state(state)
    return jsonify({"ok": True, "device": state})


@app.get("/api/device-status")
def get_device_status():
    state = load_device_state()
    updated_at = str(state.get("updated_at", "") or "").strip()
    online = is_device_online(updated_at)
    state["online"] = online
    if not online:
        state["botConnected"] = False
        state["running"] = False
        if not state.get("lastStatus"):
            state["lastStatus"] = "nofaol"
    return jsonify({"ok": True, "device": state})


@app.post("/api/esp-command")
def send_esp_command():
    payload = request.get_json(silent=True) or {}
    message = str(payload.get("message", "") or "").strip()

    if not message:
        return jsonify({"ok": False, "error": "message kerak"}), 400

    try:
        interval_ms = int(payload.get("intervalMs") or 10000)
    except (TypeError, ValueError):
        interval_ms = 10000

    current = load_command_state()
    next_id = int(current.get("id") or 0) + 1
    command = {
        "id": next_id,
        "message": message,
        "intervalMs": interval_ms,
        "created_at": now_iso(),
    }
    save_command_state(command)
    return jsonify({"ok": True, "command": command})


@app.get("/api/device-command")
def get_device_command():
    try:
        after_id = int(request.args.get("after_id", "0") or "0")
    except ValueError:
        after_id = 0

    command = load_command_state()
    command_id = int(command.get("id") or 0)
    if command_id <= after_id:
        return jsonify({"ok": True, "pending": False})

    return jsonify(
        {
            "ok": True,
            "pending": True,
            "command": command,
        }
    )


@app.get("/")
def serve_index():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/<path:path>")
def serve_static(path: str):
    target = BASE_DIR / path
    if target.exists():
        return send_from_directory(BASE_DIR, path)
    return send_from_directory(BASE_DIR, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8002, debug=True)
