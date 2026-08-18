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
SIGAP_STATUS_JS_FILE = os.path.join(ROOT, "data", "sigap_status.js")
SIGAP_VECTOR_FILE = os.path.join(ROOT, "data", "kawasan_hutan_sigap_ksb.geojson")
SIGAP_VECTOR_JS_FILE = os.path.join(ROOT, "data", "kawasan_hutan_sigap_ksb.js")
SIGAP_PIPPIB_VECTOR_FILE = os.path.join(ROOT, "data", "pippib_2025_ksb.geojson")
SIGAP_PIPPIB_VECTOR_JS_FILE = os.path.join(ROOT, "data", "pippib_2025_ksb.js")
SIGAP_EXPORT = (
    "https://geoportal.menlhk.go.id/server/rest/services/"
    "SIGAP_Interaktif/Kawasan_Hutan/MapServer/export"
)
SIGAP_VECTOR_QUERY = (
    "https://geoportal.menlhk.go.id/server/rest/services/"
    "SIGAP_AnalisisSpasial/kh/MapServer/0/query"
)
SIGAP_PIPPIB_QUERY = (
    "https://geoportal.menlhk.go.id/server/rest/services/"
    "SIGAP_AnalisisSpasial/pippib_h/MapServer/0/query"
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
    status_json = json.dumps(
        SYNC_STATE, ensure_ascii=False, separators=(",", ":")
    ).replace("</", "<\\/")
    js_temporary_path = SIGAP_STATUS_JS_FILE + ".tmp"
    with open(js_temporary_path, "w", encoding="utf-8") as output:
        output.write("window.SIGAP_SYNC_STATUS=" + status_json + ";\n")
    os.replace(js_temporary_path, SIGAP_STATUS_JS_FILE)


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
    vector_params = {
        "where": "upper(wadmkk) like '%SUMBAWA BARAT%'",
        "geometry": "116.55,-9.15,117.25,-8.35",
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": (
            "objectid,namobj,remark,wadmkk,wadmpr,fungsikws,noskpnjk,"
            "tglskpnjk,lskpnjk,keterangan,luas_cyl"
        ),
        "returnGeometry": "true",
        "outSR": "4326",
        "f": "geojson",
    }
    context = ssl._create_unverified_context()
    vector_request = urllib.request.Request(
        SIGAP_VECTOR_QUERY + "?" + urllib.parse.urlencode(vector_params),
        headers={"User-Agent": "SOBAT-TARU/2.0"},
    )
    with urllib.request.urlopen(vector_request, context=context, timeout=240) as response:
        vector_data = response.read()
    vector_payload = json.loads(vector_data.decode("utf-8"))
    feature_count = len(vector_payload.get("features", []))
    if vector_payload.get("type") != "FeatureCollection" or feature_count < 50:
        raise RuntimeError("SIGAP tidak mengirim kumpulan poligon vektor yang valid.")
    vector_handle, vector_temp = tempfile.mkstemp(
        prefix="sigap-vector-", suffix=".geojson", dir=os.path.dirname(SIGAP_VECTOR_FILE)
    )
    try:
        with os.fdopen(vector_handle, "wb") as output:
            output.write(vector_data)
        os.replace(vector_temp, SIGAP_VECTOR_FILE)
    finally:
        if os.path.exists(vector_temp):
            os.remove(vector_temp)
    vector_json = json.dumps(
        vector_payload, ensure_ascii=False, separators=(",", ":")
    ).replace("</", "<\\/")
    js_handle, js_temp = tempfile.mkstemp(
        prefix="sigap-vector-", suffix=".js", dir=os.path.dirname(SIGAP_VECTOR_JS_FILE)
    )
    try:
        with os.fdopen(js_handle, "w", encoding="utf-8") as output:
            output.write("window.SIGAP_VECTOR_DATA=" + vector_json + ";\n")
        os.replace(js_temp, SIGAP_VECTOR_JS_FILE)
    finally:
        if os.path.exists(js_temp):
            os.remove(js_temp)

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

    pippib_params = {
        "where": "1=1",
        "geometry": "116.55,-9.15,117.25,-8.35",
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "*",
        "returnGeometry": "true",
        "outSR": "4326",
        "geometryPrecision": "6",
        "f": "geojson",
    }
    pippib_request = urllib.request.Request(
        SIGAP_PIPPIB_QUERY + "?" + urllib.parse.urlencode(pippib_params),
        headers={"User-Agent": "SOBAT-TARU/2.0"},
    )
    with urllib.request.urlopen(pippib_request, context=context, timeout=300) as response:
        pippib_data = response.read()
    pippib_payload = json.loads(pippib_data.decode("utf-8"))
    pippib_features = pippib_payload.get("features", [])
    if pippib_payload.get("type") != "FeatureCollection" or not pippib_features:
        raise RuntimeError("SIGAP tidak mengirim kumpulan poligon vektor PIPPIB yang valid.")
    if any(
        not feature.get("geometry")
        or feature["geometry"].get("type") not in ("Polygon", "MultiPolygon")
        for feature in pippib_features
    ):
        raise RuntimeError("Data PIPPIB berisi geometri selain poligon.")
    pippib_handle, pippib_temp = tempfile.mkstemp(
        prefix="pippib-vector-",
        suffix=".geojson",
        dir=os.path.dirname(SIGAP_PIPPIB_VECTOR_FILE),
    )
    try:
        with os.fdopen(pippib_handle, "wb") as output:
            output.write(pippib_data)
        os.replace(pippib_temp, SIGAP_PIPPIB_VECTOR_FILE)
    finally:
        if os.path.exists(pippib_temp):
            os.remove(pippib_temp)
    pippib_json = json.dumps(
        pippib_payload, ensure_ascii=False, separators=(",", ":")
    ).replace("</", "<\\/")
    pippib_js_handle, pippib_js_temp = tempfile.mkstemp(
        prefix="pippib-vector-",
        suffix=".js",
        dir=os.path.dirname(SIGAP_PIPPIB_VECTOR_JS_FILE),
    )
    try:
        with os.fdopen(pippib_js_handle, "w", encoding="utf-8") as output:
            output.write("window.PIPPIB_VECTOR_DATA=" + pippib_json + ";\n")
        os.replace(pippib_js_temp, SIGAP_PIPPIB_VECTOR_JS_FILE)
    finally:
        if os.path.exists(pippib_js_temp):
            os.remove(pippib_js_temp)

    return {
        "bytes": len(data),
        "vectorBytes": len(vector_data),
        "featureCount": feature_count,
        "pippibBytes": len(pippib_data),
        "pippibFeatureCount": len(pippib_features),
        "pippibSourceType": "vector",
    }


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
            sync_result = sync_sigap()
            SYNC_STATE.update(
                {
                    "status": "success",
                    "message": (
                        "Vektor kawasan hutan SIGAP berhasil diperbarui "
                        f"({sync_result['featureCount']} poligon)."
                    ),
                    "updatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
                    "automatic": automatic,
                    "sourceType": "vector",
                    **sync_result,
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
