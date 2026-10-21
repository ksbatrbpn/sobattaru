# interfitur
Web Gis Informasi Ruang Kabupaten Sumbawa Barat

Versi ini menambahkan layer tematik **Kawasan Hutan Kemenhut (SIGAP)** ke
kelompok **Peta Tematik**. Data utama berupa poligon GeoJSON dari layanan Query
resmi SIGAP. Salinan raster tetap disimpan hanya sebagai cadangan ketika layanan
vektor bermasalah. Layer tidak aktif saat aplikasi dibuka.

Sumber:
https://geoportal.menlhk.go.id/server/rest/services/SIGAP_Interaktif/Kawasan_Hutan/MapServer

Sumber vektor:
https://geoportal.menlhk.go.id/server/rest/services/SIGAP_AnalisisSpasial/kh/MapServer/0

## Menjalankan dan memperbarui SIGAP

1. Klik dua kali pintasan `SOBAT TARU`.
2. Sobat Taru akan terbuka otomatis di browser.
3. Sistem mencoba sinkronisasi SIGAP secara otomatis saat dibuka.
4. Jika server SIGAP bermasalah, gunakan tombol **Sinkronkan SIGAP** untuk
   mencoba kembali.

Jika SIGAP tidak dapat dihubungi, aplikasi tetap memakai salinan peta terakhir.
Pintasan berjalan tanpa menampilkan jendela CMD.

## Fungsi SIGAP

- Legenda fungsi kawasan tersedia langsung pada layer.
- Klik peta menampilkan kategori, nama objek, nomor SK, dan keterangan.
- Analisis bidang memakai irisan poligon vektor dan menampilkan luas serta
  persentase setiap fungsi kawasan.
- Waktu pembaruan dan status sinkronisasi ditampilkan pada legenda.
- Hasil merupakan identifikasi awal dan perlu dikonfirmasi dengan dokumen
  penetapan kawasan hutan yang berlaku.

## GitHub Pages

Saat seluruh isi folder ini diunggah sebagai repositori GitHub:

- GitHub Actions menjalankan sinkronisasi SIGAP otomatis setiap 6 jam.
- Tombol **Sinkronkan** di web memeriksa status dan memuat ulang data terbaru
  tanpa membuka atau memindahkan pengguna ke repositori.
- Pengelola repositori tetap dapat menjalankan workflow **Sinkronkan SIGAP**
  secara manual dari GitHub bila membutuhkan pembaruan sumber segera.
- Jika SIGAP menolak koneksi, status kegagalan ditampilkan pada legenda dan
  data terakhir yang berhasil tetap digunakan.
- Layer SIGAP tidak aktif saat awal dibuka. Analisis SIGAP tetap bekerja dari
  GeoJSON yang dimuat di belakang layar meskipun layer visual belum dicentang.
- Perhitungan irisan memakai geometri vektor SIGAP skala 1:250.000. Raster hanya
  digunakan sebagai cadangan apabila data vektor gagal dimuat.

## Sinkronisasi layer dari Bale Ruang NTB

Layer RDTR Maluk, RDTR Taliwang, RTRW Sumbawa Barat, RTRW Provinsi NTB, LSD,
LP2B, LBS dan PIPPIB 2025 diambil langsung dari repositori Bale Ruang NTB
(https://github.com/atrbpnproject/baleruangntb) dan disaring ke wilayah
Kabupaten Sumbawa Barat. Geometri dipakai apa adanya, tanpa penyederhanaan.

- GitHub Actions **Sinkronkan Bale Ruang** memeriksa Bale Ruang setiap 6 jam
  dan hanya memperbarui data bila Bale Ruang berubah.
- Workflow juga bisa dijalankan manual dari tab **Actions**, atau dipicu dari
  Bale Ruang lewat `repository_dispatch` dengan tipe `baleruang-updated`.
- Bila jumlah fitur suatu layer turun drastis (di bawah 30% data lama), data
  lama dipertahankan dan alasannya dicatat di `data/baleruang_status.json`.
- Sinkron manual di komputer: `python scripts/sync_baleruang.py`
  (atau `--source "D:\DATA KSB\APLIKASI\BALE-RUANG-NTB-GITHUB"` untuk memakai
  salinan lokal Bale Ruang).
