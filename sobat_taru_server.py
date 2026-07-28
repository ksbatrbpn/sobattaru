import json
import os
import ssl
import tempfile
import threading
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image


ROOT = os.path.dirname(os.path.abspath(__file__))
HOST = "127.0.0.1"
PORT = 8765
SIGAP_IMAGE = os.path.join(ROOT, "data", "kawasan_hutan_sigap_ksb.png")
SIGAP_RAW_IMAGE = os.path.join(ROOT, "data", "kawasan_hutan_sigap_ksb_raw.png")
SIGAP_STATUS_FILE = os.path.join(ROOT, "data", "sigap_status.json")
SIGAP_EXPORT = (
    "https://geoportal.menlhk.go.id/server/rest/services/"
    "SIGAP_Interaktif/Kawasan_Hutan/MapServer/export"
)
SYNC_LOCK = threading.Lock()
SYNC_STATE = {
    "status": "idle",
    "message": "Belum melakukan sinkronisasi.",
    "updatedAt": None,
    "automatic": False,
}


def save_status():
    temporary_path = SIGAP_STATUS_FILE + ".tmp"
    with open(temporary_path, "w", encoding="utf-8") as output:
        json.dump(SYNC_STATE, output, ensure_ascii=False, indent=2)
    os.replace(temporary_path, SIGAP_STATUS_FILE)


def load_status():
    if not os.path.exists(SIGAP_STATUS_FILE):
        return
    try:
        with open(SIGAP_STATUS_FILE, "r", encoding="utf-8") as source:
            previous = json.load(source)
        SYNC_STATE["updatedAt"] = previous.get("updatedAt")
    except (OSError, ValueError):
        pass


def sync_sigap():
    params = {
        "bbox": "116.55,-9.15,117.25,-8.35",
        "bboxSR": "4326",
        "imageSR": "4326",
        "size": "2100,2400",
        "format": "png32",
        "transparent": "true",
        "layers": "show:0",
        "f": "image",
    }
    url = SIGAP_EXPORT + "?" + urllib.parse.urlencode(params)
    context = ssl._create_unverified_context()
    request = urllib.request.Request(url, headers={"User-Agent": "SOBAT-TARU/1.0"})
    with urllib.request.urlopen(request, context=context, timeout=120) as response:
        data = response.read()
        content_type = response.headers.get("Content-Type", "")

    if "image/png" not in content_type or not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError("SIGAP tidak mengirim citra peta yang valid.")

    os.makedirs(os.path.dirname(SIGAP_IMAGE), exist_ok=True)
    handle, temporary_path = tempfile.mkstemp(
        prefix="sigap-", suffix=".png", dir=os.path.dirname(SIGAP_IMAGE)
    )
    try:
        with os.fdopen(handle, "wb") as output:
            output.write(data)
        raw_handle, raw_temporary_path = tempfile.mkstemp(
            prefix="sigap-raw-", suffix=".png", dir=os.path.dirname(SIGAP_RAW_IMAGE)
        )
        try:
            with os.fdopen(raw_handle, "wb") as raw_output:
                raw_output.write(data)
            os.replace(raw_temporary_path, SIGAP_RAW_IMAGE)
        finally:
            if os.path.exists(raw_temporary_path):
                os.remove(raw_temporary_path)
        image = Image.open(temporary_path).convert("RGBA")
        cleaned_pixels = []
        for red, green, blue, alpha in image.get_flattened_data():
            if red >= 245 and green >= 245 and blue >= 245:
                cleaned_pixels.append((255, 255, 255, 0))
            else:
                cleaned_pixels.append((red, green, blue, alpha))
        image.putdata(cleaned_pixels)
        image.save(temporary_path, optimize=True)
        os.replace(temporary_path, SIGAP_IMAGE)
    finally:
        if os.path.exists(temporary_path):
            os.remove(temporary_path)

    return len(data)


def run_sync(automatic):
    if not SYNC_LOCK.acquire(blocking=False):
        return False
    try:
        SYNC_STATE.update(
            {
                "status": "syncing",
                "message": "Mengambil peta kawasan hutan terbaru dari SIGAP.",
                "automatic": automatic,
            }
        )
        try:
            byte_count = sync_sigap()
            SYNC_STATE.update(
                {
                    "status": "success",
                    "message": "Peta kawasan hutan SIGAP berhasil diperbarui.",
                    "updatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
                    "automatic": automatic,
                    "bytes": byte_count,
                }
            )
            save_status()
            return True
        except Exception as error:
            SYNC_STATE.update(
                {
                    "status": "error",
                    "message": (
                        "Server SIGAP sedang bermasalah. Peta lokal terakhir tetap "
                        "digunakan; coba tombol Sinkronkan SIGAP."
                    ),
                    "automatic": automatic,
                    "detail": str(error),
                }
            )
            return False
    finally:
        SYNC_LOCK.release()


class SobatTaruHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_POST(self):
        if self.path != "/api/sync-sigap":
            self.send_error(404)
            return

        try:
            success = run_sync(automatic=False)
            if not success:
                raise RuntimeError(SYNC_STATE.get("message"))
            self.send_json(
                200,
                {
                    "ok": True,
                    **SYNC_STATE,
                },
            )
        except Exception as error:
            self.send_json(
                502,
                {
                    "ok": False,
                    "message": SYNC_STATE.get("message"),
                    "detail": str(error),
                },
            )

    def do_GET(self):
        if self.path == "/api/sigap-status":
            self.send_json(200, {"ok": True, **SYNC_STATE})
            return
        super().do_GET()

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def open_app():
    webbrowser.open(f"http://{HOST}:{PORT}/Index.html")


if __name__ == "__main__":
    load_status()
    server = ThreadingHTTPServer((HOST, PORT), SobatTaruHandler)
    threading.Thread(target=run_sync, args=(True,), daemon=True).start()
    threading.Timer(1.0, open_app).start()
    print("SOBAT TARU aktif. Jendela ini boleh diminimalkan.")
    print("Tutup jendela ini untuk menghentikan aplikasi.")
    server.serve_forever()
