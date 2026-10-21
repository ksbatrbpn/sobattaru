(function () {
  'use strict';
  var pending = Object.create(null);
  function load(id) {
    var cache = window.__NTB_ADMIN_FEATURES__ || {};
    if (cache[id]) return Promise.resolve(cache[id]);
    if (pending[id]) return pending[id];
    pending[id] = new Promise(function (resolve, reject) {
      var script = document.createElement('script'), timer;
      function finish(error) {
        clearTimeout(timer); script.remove();
        if (error) { delete pending[id]; reject(error); }
        else resolve(window.__NTB_ADMIN_FEATURES__[id]);
      }
      script.src = 'data/admin-index/' + id + '.js';
      script.onload = function () { finish(window.__NTB_ADMIN_FEATURES__ && window.__NTB_ADMIN_FEATURES__[id] ? null : new Error('Data administrasi kosong')); };
      script.onerror = function () { finish(new Error('Data administrasi lokal tidak tersedia')); };
      timer = setTimeout(function () { finish(new Error('Waktu baca administrasi lokal habis')); }, 8000);
      document.head.appendChild(script);
    });
    return pending[id];
  }
  window.ntbAdminLoadFeature = load;
  window.ntbAdminFeaturesInBounds = async function (bbox) {
    var index = window.__NTB_ADMIN_INDEX__;
    if (!index) throw new Error('Indeks administrasi lokal tidak tersedia');
    var candidates = index.filter(function (entry) { var b = entry.bbox; return b[0] <= bbox[2] && b[2] >= bbox[0] && b[1] <= bbox[3] && b[3] >= bbox[1]; });
    var features = [];
    for (var start = 0; start < candidates.length; start += 6) {
      var batch = await Promise.all(candidates.slice(start, start + 6).map(function (entry) { return load(entry.id); }));
      features = features.concat(batch.filter(Boolean));
    }
    return features;
  };
  async function legacyLookup(lng, lat, contains) {
    var index = window.__NTB_ADMIN_INDEX__;
    if (!index) throw new Error('Indeks administrasi lokal tidak tersedia');
    var candidates = index.filter(function (entry) { var b = entry.bbox; return lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3]; });
    var hits = [], seen = new Set();
    // At most two intact village features in flight. No province-wide geometry parse.
    for (var start = 0; start < candidates.length; start += 2) {
      var features = await Promise.all(candidates.slice(start, start + 2).map(function (entry) { return load(entry.id); }));
      features.forEach(function (feature) { var id=feature.id==null?(feature.properties||{}).OBJECTID:feature.id;if(seen.has(id))return;seen.add(id);if (contains(feature.geometry, lng, lat)) hits.push(feature); });
    }
    return hits;
  }

  // INDEKS TITIK BATAS DESA: desa kecil dibaca utuh seperti biasa; desa besar (garis pantai/hutan sangat rinci) diuji lewat
  // potongan per sub-grid 0.02° sehingga tidak perlu mengunduh berkas desa berukuran megabyte. Atribut desa tetap dari sumber.
  var PIDX_VERSION = '20261011-v2', PIDX_EPS = 1e-9, gzCache = Object.create(null), cellList = null;
  function fetchGzJson(src) {
    if (gzCache[src]) return gzCache[src];
    gzCache[src] = fetch(src).then(function (response) {
      if (!response.ok) throw new Error('Indeks batas desa gagal dimuat: ' + response.status);
      return response.arrayBuffer();
    }).then(function (buffer) {
      var bytes = new Uint8Array(buffer);
      if (!(bytes.length > 2 && bytes[0] === 31 && bytes[1] === 139)) return JSON.parse(new TextDecoder().decode(bytes));
      if (typeof DecompressionStream === 'undefined') throw new Error('Browser belum mendukung paket terkompresi');
      return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text().then(JSON.parse);
    });
    gzCache[src].catch(function () { delete gzCache[src]; });
    return gzCache[src];
  }
  function pidxCells() {
    // SOBAT TARU tidak membawa indeks titik (pidx) Bale Ruang; pencarian langsung memakai berkas desa utuh.
    if (!window.__NTB_ADMIN_PIDX__) return Promise.reject(new Error('Indeks titik tidak tersedia'));
    if (!cellList) cellList = fetchGzJson('data/admin-index/pidx/cells.json?v=' + PIDX_VERSION).then(function (list) { var set = Object.create(null); list.forEach(function (c) { set[c] = true; }); return set; });
    cellList.catch(function () { cellList = null; });
    return cellList;
  }
  async function pidxLookup(lng, lat, contains) {
    var G = 0.1, cell = Math.floor(lng / G) + ':' + Math.floor(lat / G), cells = await pidxCells();
    if (!cells[cell]) return [];
    var base = 'data/admin-index/pidx/' + cell.replace(':', '_m'), version = '?v=' + PIDX_VERSION;
    var P = await fetchGzJson(base + '.json.gz' + version);
    var sub = G / P.sub, sx = Math.floor(lng / sub), sy = Math.floor(lat / sub), sk = sx + ':' + sy, found = [], needExt = false;
    (P.g || []).forEach(function (g, gi) { var piece = g.x && g.x[sk]; if (!piece) return; if (piece === 2) needExt = true; found.push({ order: g.id, big: g, gi: gi, piece: piece }); });
    (P.s || []).forEach(function (e) { if (lng >= e[1] && lng <= e[3] && lat >= e[2] && lat <= e[4]) found.push({ order: e[0], small: e[0] }); });
    var ext = needExt ? await fetchGzJson(base + '/' + sk.replace(/-/g, 'm').replace(':', '_') + '.json.gz' + version) : null;
    var x0 = sx * sub - PIDX_EPS, y0 = sy * sub - PIDX_EPS, x1 = (sx + 1) * sub + PIDX_EPS, y1 = (sy + 1) * sub + PIDX_EPS;
    var smalls = found.filter(function (item) { return item.small != null; });
    for (var start = 0; start < smalls.length; start += 4) {
      await Promise.all(smalls.slice(start, start + 4).map(function (item) { return load(item.small).then(function (feature) { item.feature = feature; }); }));
    }
    found.sort(function (a, b) { return a.order - b.order; });
    var hits = [], seen = new Set();
    found.forEach(function (item) {
      var feature = item.feature;
      if (!feature) {
        var piece = item.piece === 2 ? (ext && ext[item.gi]) : item.piece;
        if (!piece) throw new Error('Potongan batas desa tidak lengkap');
        feature = { type: 'Feature', id: item.big.fid, properties: item.big.p || {}, geometry: piece === 1 ? { type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] } : { type: 'MultiPolygon', coordinates: piece }, __adminId: item.big.id };
      }
      var id = feature.id == null ? (feature.properties || {}).OBJECTID : feature.id;
      if (seen.has(id)) return; seen.add(id);
      if (contains(feature.geometry, lng, lat)) hits.push(feature);
    });
    return hits;
  }
  window.ntbAdminLookup = function (lng, lat, contains) {
    return pidxLookup(lng, lat, contains).catch(function () { return legacyLookup(lng, lat, contains); });
  };
})();
