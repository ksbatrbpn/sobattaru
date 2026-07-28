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
EXPORT_URL = (
    "https://geoportal.menlhk.go.id/server/rest/services/"
    "SIGAP_Interaktif/Kawasan_Hutan/MapServer/export"
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


def write_bytes(path, content):
    handle, temporary = tempfile.mkstemp(prefix="sigap-", suffix=".png", dir=DATA_DIR)
    try:
        with os.fdopen(handle, "wb") as output:
            output.write(content)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.remove(temporary)


def synchronize():
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
    request = urllib.request.Request(
        EXPORT_URL + "?" + urllib.parse.urlencode(params),
        headers={"User-Agent": "SOBAT-TARU-GitHub-Sync/1.0"},
    )
    context = ssl._create_unverified_context()
    with urllib.request.urlopen(request, context=context, timeout=120) as response:
        content = response.read()
        content_type = response.headers.get("Content-Type", "")

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

    write_json(
        STATUS_FILE,
        {
            "status": "success",
            "message": "Sinkronisasi otomatis SIGAP berhasil.",
            "updatedAt": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
            "automatic": True,
            "bytes": len(content),
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
