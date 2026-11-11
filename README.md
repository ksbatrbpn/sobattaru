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

## Peta Telaah Spasial

Menu **Eksplorasi Bidang** memiliki tombol **Buat Peta Telaah Spasial** pada kartu bidang
terpilih, serta **Buat Peta Telaah Spasial** dan **Telaah dari Excel Koordinat** di Pusat Analisis Data.

1. Unggah ZIP SHP bidang di sekitar lokasi (lebih dari satu poligon) lewat Unggah SHP/KML.
2. Pilih sumber bidang yang ditelaah:
   - **Dari SHP (NIB)**: pilih NIB pada daftar, peta, atau kolom NIB di dialog.
   - **Dari Excel koordinat**: untuk bidang yang belum diukur/belum ber-NIB. Unduh template
     (`.xlsx`, kolom No, X, Y, Keterangan), isi titik batas berurutan, lalu unggah
     (`.xlsx`, `.xls`, atau `.csv`, maks 5 MB dan 2.000 titik). Sistem koordinat dideteksi
     otomatis (UTM 50S, TM-3 50.1/50.2, geografis desimal, atau derajat-menit-detik) dan bisa
     dipilih manual. Titik di luar Sumbawa Barat ditolak; poligon yang memotong dirinya diberi peringatan.
3. Isi jenis permohonan, nama pemohon, luas tekstual, penelaah, dan pejabat yang mengetahui.
4. Butir **Hasil Analisis** disusun otomatis dari kawasan hutan (SIGAP), PIPPIB, pola ruang
   (RDTR/RTRW), LSD, LP2B, sempadan, selisih luas, dan tumpang tindih dengan bidang lain di SHP.
   Semua butir bisa disunting.
5. Pilih **tema tata letak** (Tema 1 — Original, atau Tema 2 — Rapi dengan kop, peta indeks
   kecamatan, grid derajat dan UTM, legenda dua kolom) dan **ukuran kertas** (A4, F4, A3, A2;
   lanskap).
6. Halaman yang dicetak: latar citra, latar pola ruang, dan satu halaman untuk setiap faktor
   pembatas selain RTRW yang beririsan dengan bidang (LSD, LP2B, PIPPIB, kawasan hutan,
   sempadan sungai/pantai). Setiap halaman bisa dimatikan sebelum mencetak.
7. Cetak dengan ukuran kertas yang sama, margin tidak ada, skala 100%.

Bidang lain di SHP tampil sebagai Bidang Sandingan berlabel NIB (5 digit terakhir atau lengkap).
Nama penelaah, pejabat, kantor, tema, dan kertas diingat di perangkat untuk cetakan berikutnya.
