"""Sinkronkan layer tata ruang SOBAT TARU dari Bale Ruang NTB.

Bale Ruang NTB menyimpan setiap layer sebagai paket grid 0,1 derajat
(data/analysis/<folder>/cells + packs/*.js.gz). Skrip ini mengunduh hanya
sel yang menyentuh Kabupaten Sumbawa Barat, menggabungkan paketnya, menyaring
fitur ke wilayah KSB, lalu menulis ulang berkas data/*.js SOBAT TARU dengan
nama variabel yang sama sehingga index.html tidak perlu diubah.

Geometri dipakai apa adanya (tanpa simplify/round/clip), mengikuti kebijakan
Bale Ruang.

Pemakaian:
  python scripts/sync_baleruang.py                       # dari GitHub (main)
  python scripts/sync_baleruang.py --ref <commit-sha>    # versi tertentu
  python scripts/sync_baleruang.py --source D:/path/baleruangntb   # salinan lokal
"""

import argparse
import concurrent.futures
import datetime
import gzip
import json
import math
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
REPO = "atrbpnproject/baleruangntb"
BOUNDARY = os.path.join(DATA, "batas_kecamatan_ksb.geojson")
STATUS_JSON = os.path.join(DATA, "baleruang_status.json")
STATUS_JS = os.path.join(DATA, "baleruang_status.js")

# key = kunci layer pada data/analysis/index.js Bale Ruang.
# filter: None (layer khusus KSB), ("attr", field, nilai) atau "spatial".
LAYERS = [
    {"key": "rdtr-maluk", "file": "RDTRMALUK_1.js", "var": "json_RDTRMALUK_1",
     "label": "RDTR Maluk", "filter": None},
    {"key": "rdtr-taliwang", "file": "RDTRTALIWANG_2.js", "var": "json_RDTRTALIWANG_2",
     "label": "RDTR Taliwang", "filter": None},
    {"key": "rtrw-sumbawa-barat", "file": "RTRWSUMBAWABARAT20202040_3.js",
     "var": "json_RTRWSUMBAWABARAT20202040_3", "label": "RTRW Sumbawa Barat", "filter": None},
    {"key": "rtrw", "file": "RTRWPROVINSINTB20242044_7.js",
     "var": "json_RTRWPROVINSINTB20242044_7", "label": "RTRW Provinsi NTB", "filter": "spatial"},
    {"key": "lsd", "file": "LSD_Kabupaten_Sumbawa_Barat_4.js",
     "var": "json_LSD_Kabupaten_Sumbawa_Barat_4", "label": "LSD", "filter": "spatial"},
    {"key": "lp2b", "file": "LP2BSUMBAWABARAT_5.js", "var": "json_LP2BSUMBAWABARAT_5",
     "label": "LP2B", "filter": ("attr", "KABKOTA", "Kab. Sumbawa Barat")},
    {"key": "lbs", "file": "LBS_Kabupaten_Sumbawa_Barat_6.js",
     "var": "json_LBS_Kabupaten_Sumbawa_Barat_6", "label": "LBS",
     "filter": ("attr", "WADMKK", "Sumbawa Barat")},
    {"key": "pippib", "file": "pippib_2025_ntb.js", "var": "window.PIPPIB_VECTOR_DATA",
     "geojson": "pippib_2025_ntb.geojson", "label": "PIPPIB 2025", "filter": "spatial"},
]


def compat_properties(key, props):
    """Tambahkan atribut lama yang dibaca analisis SOBAT TARU (index.html)."""
    if key == "lp2b":
        props.setdefault("Keterangan", props.get("KELAS") or "LP2B")
    elif key == "lbs":
        props.setdefault("Keterangan", "Lahan Baku Sawah Kabupaten Sumbawa Barat")
    elif key == "lsd":
        props["LSD"] = props.get("LSD") or "LSD"
    return props


def keep_feature(key, feature):
    props = feature.get("properties") or {}
    if key == "lp2b":
        return props.get("KELAS", "LP2B") == "LP2B"
    if key == "rtrw":
        # Daratan kabupaten lain (mis. Kab. Sumbawa) dibuang; perairan yang menyentuh KSB tetap ikut.
        region = str(props.get("WADMKK") or "")
        return not region.startswith("Kabupaten ") or region == "Kabupaten Sumbawa Barat"
    return True


class Source:
    def __init__(self, local=None, ref="main"):
        self.local = local
        self.base = "https://raw.githubusercontent.com/%s/%s/" % (REPO, ref)

    def read(self, path):
        if self.local:
            with open(os.path.join(self.local, path), "rb") as handle:
                raw = handle.read()
        else:
            raw = None
            for attempt in range(4):
                try:
                    request = urllib.request.Request(self.base + path, headers={"User-Agent": "sobat-taru-sync"})
                    with urllib.request.urlopen(request, timeout=120) as response:
                        raw = response.read()
                    break
                except Exception:
                    if attempt == 3:
                        raise
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        return raw.decode("utf-8")


def assigned_value(code):
    """Ambil nilai JSON dari baris `window.X[...]=<json>;` terakhir."""
    start = code.rindex("]=") + 2
    return json.loads(code[start:].strip().rstrip(";"))


def assigned_object(code):
    """Ambil nilai JSON dari `window.X=<json>;`."""
    return json.loads(code[code.index("=") + 1:].strip().rstrip(";"))


def rings_of(geometry):
    if not geometry:
        return []
    kind, coords = geometry.get("type"), geometry.get("coordinates") or []
    if kind == "Polygon":
        return [coords]
    if kind == "MultiPolygon":
        return coords
    if kind == "GeometryCollection":
        polys = []
        for part in geometry.get("geometries") or []:
            polys.extend(rings_of(part))
        return polys
    return []


def bounds_of(polys):
    xs, ys = [], []
    for poly in polys:
        for ring in poly[:1]:
            for point in ring:
                xs.append(point[0])
                ys.append(point[1])
    if not xs:
        return None
    return (min(xs), min(ys), max(xs), max(ys))


def point_in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def point_in_polys(x, y, polys):
    for poly in polys:
        if poly and point_in_ring(x, y, poly[0]) and not any(point_in_ring(x, y, hole) for hole in poly[1:]):
            return True
    return False


def overlaps(a, b):
    return a[0] <= b[2] and a[2] >= b[0] and a[1] <= b[3] and a[3] >= b[1]


class Boundary:
    """Batas KSB sebagai raster 0,002 derajat (~220 m) agar uji titik cepat.

    Sel yang dilalui garis batas ikut dihitung "di dalam", jadi fitur yang
    hanya menyentuh tepi batas tetap ikut (lebih baik lebih dari kurang).
    """

    CELL = 0.002

    def __init__(self, path):
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
        self.polys = []
        for feature in data["features"]:
            self.polys.extend(rings_of(feature.get("geometry")))
        self.bbox = bounds_of(self.polys)
        west, south, east, north = self.bbox
        self.cols = int(math.ceil((east - west) / self.CELL)) + 1
        self.rows = int(math.ceil((north - south) / self.CELL)) + 1
        self.mask = set()
        rings = [ring for poly in self.polys for ring in poly]
        for row in range(self.rows):
            y = south + (row + 0.5) * self.CELL
            xs = []
            for ring in rings:
                for i in range(len(ring) - 1):
                    (x1, y1), (x2, y2) = ring[i][:2], ring[i + 1][:2]
                    if (y1 > y) != (y2 > y):
                        xs.append(x1 + (y - y1) * (x2 - x1) / (y2 - y1))
            xs.sort()
            for a, b in zip(xs[0::2], xs[1::2]):
                for col in range(int((a - west) / self.CELL), int((b - west) / self.CELL) + 1):
                    self.mask.add((col, row))
        for ring in rings:
            for point in ring:
                self.mask.add(self.cell(point[0], point[1]))
        self.samples = [(west + (c + 0.5) * self.CELL, south + (r + 0.5) * self.CELL)
                        for c, r in sorted(self.mask)[::max(1, len(self.mask) // 3000)]]

    def cell(self, x, y):
        return (int((x - self.bbox[0]) / self.CELL), int((y - self.bbox[1]) / self.CELL))

    def touches(self, feature):
        polys = rings_of(feature.get("geometry"))
        bbox = bounds_of(polys)
        if not bbox or not overlaps(bbox, self.bbox):
            return False
        for poly in polys:
            for point in poly[0]:
                if self.cell(point[0], point[1]) in self.mask:
                    return True
        # Poligon besar (mis. PIPPIB) yang menutupi KSB tanpa titik sudut di dalamnya.
        return any(point_in_polys(x, y, polys) for x, y in self.samples
                   if bbox[0] <= x <= bbox[2] and bbox[1] <= y <= bbox[3])


def load_layer(source, catalog, layer, boundary, pool):
    key = layer["key"]
    entry = catalog[key]
    grid = entry["grid"]
    cells = entry["cells"]
    if layer["filter"] is not None:
        west, south, east, north = boundary.bbox
        wanted = set()
        for x in range(math.floor(west / grid), math.floor(east / grid) + 1):
            for y in range(math.floor(south / grid), math.floor(north / grid) + 1):
                if "%d:%d" % (x, y) in cells:
                    wanted.add("%d:%d" % (x, y))
    else:
        wanted = set(cells)
    cell_codes = pool.map(lambda cell: source.read("data/analysis/" + cells[cell]), sorted(wanted))
    packs = set()
    direct = []
    for code in cell_codes:
        if "__LONTAR_ANALYSIS_REFS__" in code:
            packs.update(assigned_value(code))
        else:
            direct.append(assigned_value(code))
    folder = entry["folder"]
    paths = ["data/analysis/%s/packs/%s.js.gz" % (folder, pack.replace(":", "_m")) for pack in sorted(packs)]
    collections = direct + [assigned_value(code) for code in pool.map(source.read, paths)]

    # Satu fitur disimpan di satu paket; tetap buang duplikat bila ada.
    seen, features = set(), []
    for collection in collections:
        for feature in collection.get("features") or []:
            ident = json.dumps([feature.get("id"), feature.get("properties"),
                                bounds_of(rings_of(feature.get("geometry")))], sort_keys=True)
            if ident in seen:
                continue
            seen.add(ident)
            features.append(feature)

    rule = layer["filter"]
    if isinstance(rule, tuple):
        features = [f for f in features if (f.get("properties") or {}).get(rule[1]) == rule[2]]
    elif rule == "spatial":
        features = [f for f in features if boundary.touches(f)]
    features = [f for f in features if keep_feature(key, f)]
    for feature in features:
        feature["properties"] = compat_properties(key, dict(feature.get("properties") or {}))
    return entry, features


def existing_count(path, layer, boundary):
    """Jumlah fitur data lama di wilayah KSB, untuk pembanding yang setara."""
    try:
        with open(path, encoding="utf-8") as handle:
            features = assigned_object(handle.read()).get("features") or []
    except Exception:
        return 0
    if layer["filter"] == "spatial":
        return sum(1 for f in features if boundary.touches(f))
    return len(features)


def write_layer(layer, features):
    name = layer["file"][:-3]
    collection = {"type": "FeatureCollection", "name": name,
                  "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
                  "features": features}
    body = json.dumps(collection, ensure_ascii=False, separators=(",", ":"))
    prefix = layer["var"] + "=" if layer["var"].startswith("window.") else "var " + layer["var"] + " = "
    with open(os.path.join(DATA, layer["file"]), "w", encoding="utf-8", newline="\n") as handle:
        handle.write(prefix + body + ";\n")
    if layer.get("geojson"):
        with open(os.path.join(DATA, layer["geojson"]), "w", encoding="utf-8", newline="\n") as handle:
            handle.write(body)


def write_status(status):
    body = json.dumps(status, ensure_ascii=False, indent=2)
    with open(STATUS_JSON, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(body + "\n")
    with open(STATUS_JS, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("window.BALERUANG_SYNC_STATUS=" + json.dumps(status, ensure_ascii=False) + ";\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", help="folder salinan lokal repositori Bale Ruang NTB")
    parser.add_argument("--ref", default=os.environ.get("BALERUANG_REF", "main"),
                        help="branch atau commit Bale Ruang (bawaan: main)")
    parser.add_argument("--min-ratio", type=float, default=0.3,
                        help="tolak hasil bila jumlah fitur turun di bawah rasio ini dari data lama")
    args = parser.parse_args()

    source = Source(args.source, args.ref)
    catalog = assigned_object(source.read("data/analysis/index.js"))
    boundary = Boundary(BOUNDARY)
    results, problems = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
        for layer in LAYERS:
            if layer["key"] not in catalog:
                problems.append("%s: layer '%s' tidak ada di Bale Ruang" % (layer["label"], layer["key"]))
                continue
            entry, features = load_layer(source, catalog, layer, boundary, pool)
            before = existing_count(os.path.join(DATA, layer["file"]), layer, boundary)
            if not features or (before and len(features) < before * args.min_ratio):
                problems.append("%s: %d fitur (sebelumnya %d), data lama dipertahankan" % (layer["label"], len(features), before))
                continue
            write_layer(layer, features)
            results.append({"layer": layer["label"], "key": layer["key"], "file": layer["file"],
                            "features": len(features), "previous": before, "source": entry.get("source", "")})
            print("%-20s %6d fitur (sebelumnya %d)" % (layer["label"], len(features), before))

    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).replace(microsecond=0)
    write_status({
        "status": "success" if not problems else ("partial" if results else "failed"),
        "message": "Layer disinkronkan dari Bale Ruang NTB." if not problems else "; ".join(problems),
        "updatedAt": now.isoformat(),
        "source": "https://github.com/%s" % REPO,
        "ref": args.source and "local" or args.ref,
        "layers": results,
    })
    for problem in problems:
        print("PERINGATAN:", problem, file=sys.stderr)
    return 1 if problems and not results else 0


if __name__ == "__main__":
    sys.exit(main())
