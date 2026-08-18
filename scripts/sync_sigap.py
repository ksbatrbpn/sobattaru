import json
import os
import ssl
import tempfile
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from PIL import Image


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
DISPLAY_IMAGE = os.path.join(DATA_DIR, "kawasan_hutan_sigap_ksb.png")
RAW_IMAGE = os.path.join(DATA_DIR, "kawasan_hutan_sigap_ksb_raw.png")
STATUS_FILE = os.path.join(DATA_DIR, "sigap_status.json")
STATUS_JS_FILE = os.path.join(DATA_DIR, "sigap_status.js")
VECTOR_FILE = os.path.join(DATA_DIR, "kawasan_hutan_sigap_ksb.geojson")
VECTOR_JS_FILE = os.path.join(DATA_DIR, "kawasan_hutan_sigap_ksb.js")
EXPORT_URL = (
    "https://geoportal.menlhk.go.id/server/rest/services/"
    "SIGAP_Interaktif/Kawasan_Hutan/MapServer/export"
)
VECTOR_QUERY_URL = (
    "https://geoportal.menlhk.go.id/server/rest/services/"
    "SIGAP_AnalisisSpasial/kh/MapServer/0/query"
)


def previous_update():
    try:
        with open(STATUS_FILE, "r", encoding="utf-8") as source:
            return json.load(source).get("updatedAt")
    except (OSError, ValueError):
        return None


def write_json(path, payload):
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as output:
        json.dump(payload, output, ensure_ascii=False, indent=2)
        output.write("\n")
    os.replace(temporary, path)
    if path == STATUS_FILE:
        status_json = json.dumps(
            payload, ensure_ascii=False, separators=(",", ":")
        ).replace("</", "<\\/")
        write_bytes(
            STATUS_JS_FILE,
            ("window.SIGAP_SYNC_STATUS=" + status_json + ";\n").encode("utf-8"),
        )


def write_bytes(path, content):
    suffix = os.path.splitext(path)[1]
    handle, temporary = tempfile.mkstemp(prefix="sigap-", suffix=suffix, dir=DATA_DIR)
    try:
        with os.fdopen(handle, "wb") as output:
            output.write(content)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.remove(temporary)


def download(url, timeout=120):
    request = urllib.request.Request(
        url, headers={"User-Agent": "SOBAT-TARU-GitHub-Sync/2.0"}
    )
    context = ssl._create_unverified_context()
    with urllib.request.urlopen(request, context=context, timeout=timeout) as response:
        return response.read(), response.headers.get("Content-Type", "")


def synchronize_vector():
    params = {
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
    content, _ = download(
        VECTOR_QUERY_URL + "?" + urllib.parse.urlencode(params), timeout=240
    )
    payload = json.loads(content.decode("utf-8"))
    features = payload.get("features")
    if payload.get("type") != "FeatureCollection" or not features:
        raise RuntimeError("SIGAP tidak mengirim poligon vektor yang valid.")
    if len(features) < 50:
        raise RuntimeError(
            f"Jumlah poligon SIGAP tidak wajar ({len(features)} fitur); data lama dipertahankan."
        )
    write_bytes(
        VECTOR_FILE,
        (json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n").encode(
            "utf-8"
        ),
    )
    vector_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace(
        "</", "<\\/"
    )
    write_bytes(
        VECTOR_JS_FILE,
        ("window.SIGAP_VECTOR_DATA=" + vector_json + ";\n").encode("utf-8"),
    )
    return len(features), len(content)


def synchronize_raster():
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
    content, content_type = download(
        EXPORT_URL + "?" + urllib.parse.urlencode(params), timeout=120
    )

    if "image/png" not in content_type or not content.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError("SIGAP tidak mengirim citra PNG yang valid.")

    write_bytes(RAW_IMAGE, content)

    image = Image.open(RAW_IMAGE).convert("RGBA")
    pixels = []
    for red, green, blue, alpha in image.get_flattened_data():
        if red >= 245 and green >= 245 and blue >= 245:
            pixels.append((255, 255, 255, 0))
        else:
            pixels.append((red, green, blue, alpha))
    image.putdata(pixels)
    image.save(DISPLAY_IMAGE, optimize=True)

    return len(content)


def synchronize():
    feature_count, vector_bytes = synchronize_vector()
    raster_bytes = synchronize_raster()
    updated_at = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    write_json(
        STATUS_FILE,
        {
            "status": "success",
            "message": f"Sinkronisasi vektor SIGAP berhasil ({feature_count} poligon).",
            "updatedAt": updated_at,
            "automatic": True,
            "sourceType": "vector",
            "featureCount": feature_count,
            "vectorBytes": vector_bytes,
            "rasterBytes": raster_bytes,
            "pippibFeatureCount": 818,
            "pippibSourceType": "vector",
            "pippibPeriod": "2025 Periode I",
            "pippibImportedAt": "2026-07-29",
            "pippibSource": "File resmi lokal PIPPIB NTB, Keputusan Menteri Kehutanan Nomor 554 Tahun 2025",
        },
    )


if __name__ == "__main__":
    os.makedirs(DATA_DIR, exist_ok=True)
    last_update = previous_update()
    try:
        synchronize()
        print("Sinkronisasi SIGAP berhasil.")
    except Exception as error:
        write_json(
            STATUS_FILE,
            {
                "status": "error",
                "message": (
                    "Server SIGAP menolak atau tidak dapat melayani sinkronisasi. "
                    "Data terakhir tetap digunakan."
                ),
                "updatedAt": last_update,
                "automatic": True,
                "detail": str(error),
            },
        )
        print(f"Sinkronisasi SIGAP gagal: {error}")
