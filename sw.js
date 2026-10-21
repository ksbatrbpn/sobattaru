/* SOBAT TARU — service worker ringan (mengikuti Bale Ruang NTB).
   - Halaman (navigasi): ambil dari jaringan dulu, cadangan dari cache bila offline.
   - Berkas tampilan (js/css/gambar/font): cepat dari cache, diperbarui di latar.
   - Data tata ruang (data/...) & peta dasar: selalu dari jaringan (tidak disimpan, agar memori HP tidak penuh). */
var VERSION = 'sobat-taru-20261021a';
// Ikon & pustaka yang jarang berubah disimpan di cache terpisah agar tidak ikut terhapus setiap pembaruan versi.
var STATIC = 'sobat-taru-static-v1';
var STATIC_FILES = ['css/fontawesome-all.min.css', 'webfonts/fa-solid-900.woff2'];
function isStatic(p) { return /\/webfonts\/|fontawesome-all\.min\.css$/.test(p); }
var SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/leaflet.css', 'js/leaflet.js',
  'assets/sobat-taru-logo.svg', 'assets/app/icon-192.png', 'assets/app/icon-512.png'];
self.addEventListener('install', function (event) {
  event.waitUntil(Promise.all([
    caches.open(VERSION).then(function (cache) { return cache.addAll(SHELL); }).catch(function () {}),
    caches.open(STATIC).then(function (cache) { return cache.addAll(STATIC_FILES); }).catch(function () {})
  ]));
  self.skipWaiting();
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION && k !== STATIC; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // peta dasar, layanan luar: biarkan browser
  if (url.pathname.indexOf('/data/') >= 0) return;           // data tata ruang: selalu dari jaringan
  if (url.pathname.indexOf('/regulasi/') >= 0) return;       // dokumen regulasi (PDF): langsung dari jaringan
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(function (res) {
      var type = res.headers.get('content-type') || '';
      if (res.ok && type.indexOf('text/html') >= 0) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put('index.html', copy); }); }
      return res;
    }).catch(function () { return caches.match('index.html').then(function (r) { return r || caches.match('./'); }); }));
    return;
  }
  if (/\.(?:js|css|png|jpg|jpeg|svg|webp|woff2?|ttf|webmanifest)$/i.test(url.pathname)) {
    var st = isStatic(url.pathname);
    event.respondWith(caches.open(st ? STATIC : VERSION).then(function (cache) {
      return cache.match(req, st ? { ignoreSearch: true } : undefined).then(function (hit) {
        if (hit && st) return hit;                                 // ikon: langsung dari cache, tanpa unduh ulang
        var net = fetch(req).then(function (res) { if (res && res.ok) cache.put(req, res.clone()); return res; });
        if (hit) { net.catch(function () {}); return hit; }
        return net.catch(function () { return fetch(req); });     // jaringan putus sesaat: coba sekali lagi
      });
    }));
  }
});
