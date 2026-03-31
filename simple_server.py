#!/usr/bin/env python3
"""
Simple HTTP server for Hidop Bot without Flask
"""
import http.server
import socketserver
import json
import os
import shutil
from pathlib import Path
from urllib.parse import urlparse, parse_qs

# Load environment variables
def load_env():
    env_file = Path('.env')
    if env_file.exists():
        with open(env_file, 'r') as f:
            for line in f:
                if '=' in line and not line.strip().startswith('#'):
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value

load_env()

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DATA_DIR = BASE_DIR / "data"
DATA_DIR_ENV = os.getenv("DATA_DIR", "").strip()
DATA_FILES = ("videos.json", "saved_videos.json")


def resolve_data_dir(raw_value: str) -> Path:
    if not raw_value:
        return DEFAULT_DATA_DIR
    candidate = Path(raw_value).expanduser()
    if not candidate.is_absolute():
        candidate = BASE_DIR / candidate
    return candidate


DATA_DIR = resolve_data_dir(DATA_DIR_ENV)


def ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if DATA_DIR == BASE_DIR:
        return

    for filename in DATA_FILES:
        source = BASE_DIR / filename
        target = DATA_DIR / filename
        if target.exists() or not source.exists():
            continue
        shutil.copy2(source, target)


def data_file(filename: str) -> Path:
    ensure_data_dir()
    return DATA_DIR / filename


# Database file paths
VIDEOS_FILE = data_file("videos.json")
SAVED_VIDEOS_FILE = data_file("saved_videos.json")

# Load video catalog
def load_video_catalog():
    try:
        if VIDEOS_FILE.exists():
            with open(VIDEOS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {"next_id": 1, "items": []}
    except Exception:
        return {"next_id": 1, "items": []}

# Load saved videos
def load_saved_videos():
    try:
        if SAVED_VIDEOS_FILE.exists():
            with open(SAVED_VIDEOS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {}
    except Exception:
        return {}

VIDEO_CATALOG = load_video_catalog()
SAVED_VIDEOS = load_saved_videos()

class HidopHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory="wepapp", **kwargs)
    
    def do_GET(self):
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/api/catalog':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            response = {"success": True, "items": VIDEO_CATALOG.get("items", [])}
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))
            return
        
        elif parsed_path.path.startswith('/api/search'):
            query = parse_qs(parsed_path.query).get('q', [''])[0]
            # Simple search implementation
            results = []
            search_query = query.lower().strip()
            
            for item in VIDEO_CATALOG.get("items", []):
                title = str(item.get("title", "")).lower()
                if search_query in title:
                    results.append(item)
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            response = {"success": True, "items": results}
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))
            return
        
        elif parsed_path.path.startswith('/api/bot-token'):
            # Return bot token for video access
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            # Get token from environment
            bot_token = os.getenv('BOT_TOKEN', '')
            response = {"success": True, "token": bot_token}
            self.wfile.write(json.dumps(response).encode('utf-8'))
            return
        
        elif parsed_path.path.startswith('/api/saved-videos'):
            # Get user_id from query parameters (frontend sends owner_id)
            user_id = parse_qs(parsed_path.query).get('owner_id', [''])[0]
            if not user_id:
                user_id = parse_qs(parsed_path.query).get('user_id', [''])[0]
            
            if not user_id:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                response = {"success": False, "error": "user_id required"}
                self.wfile.write(json.dumps(response).encode('utf-8'))
                return
            
            # Get saved videos for this user
            user_saved = SAVED_VIDEOS.get(user_id, [])
            
            # Get full video info for saved videos
            saved_videos = []
            for saved_item in user_saved:
                video_id = saved_item.get("video_id")
                video = None
                for item in VIDEO_CATALOG.get("items", []):
                    if item.get("id") == video_id:
                        video = item
                        break
                
                if video:
                    video_copy = video.copy()
                    video_copy["saved_at"] = saved_item.get("saved_at")
                    video_copy["name"] = saved_item.get("name")
                    video_copy["saved_id"] = saved_item.get("saved_id")
                    saved_videos.append(video_copy)
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            response = {"success": True, "items": saved_videos}
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))
            return
        
        # Default: serve static files
        super().do_GET()
    
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

def run_server(port=8000):
    handler = HidopHandler
    
    with socketserver.TCPServer(("", port), handler) as httpd:
        print(f"Starting Hidop Bot web server on port {port}...")
        print(f"Open http://localhost:{port} in your browser")
        print(f"Videos loaded: {len(VIDEO_CATALOG.get('items', []))}")
        httpd.serve_forever()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    run_server(port)
