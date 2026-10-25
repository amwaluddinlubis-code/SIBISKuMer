# 05 — Operasional & SOP

> **Status:** Aktif · **Revisi:** 2026-10-25

## 1. Prasyarat & Instalasi

- Node.js 20+ (dev memakai `tsx`), browser Chrome/Edge terbaru.
- `npm install` → salin `.env.example` menjadi `.env` bila memakai fitur cloud
  (`GEMINI_API_KEY`, `APP_URL` — hanya untuk integrasi AI Studio/Drive; inti aplikasi
  berjalan tanpa env).

## 1a. Aplikasi Desktop Windows (.exe) — tanpa install Node di laptop tujuan

Sekali build di satu komputer Windows, hasilnya 2 file di `release/` yang tinggal
klik di laptop mana pun (tidak perlu Node/npm):

| Perintah | Hasil |
|----------|-------|
| `npm run dist:win` | `BukuInduk-Setup-1.0.0.exe` (installer) + `BukuInduk-Portable.exe` (tanpa instal) |
| `npm run electron:dev` | Uji desktop (butuh `npm run dev` di terminal lain) |

Cara kerja: `electron/main.ts` mencari port bebas → menjalankan `dist/server.cjs`
(Express produksi) di dalam aplikasi → window membuka `http://127.0.0.1:PORT`.
Satu instance saja (dibuka 2x = window lama difokuskan).

Sejak migrasi SQLite (Fase S1–S5), data aplikasi desktop tersimpan di berkas
SQLite yang dilayani server terbundel — **bukan** lagi IndexedDB. Kemasan
desktop otomatis mulai pada **Mode Utama: Server Penuh**; instalasi lama yang
datanya masih di IndexedDB ditawari migrasi otomatis pada masuk pertama
(data contoh server digantikan oleh data perangkat, snapshot pengaman dibuat
server lebih dulu). Rincian lokasi & pemulihan: §1b.

## 1b. Lokasi Data, Cadangan & Pemulihan (era SQLite)

**Lokasi folder data** (satu berkas SQLite per sekolah: `bukuinduk-<id>.db`,
plus `bukuinduk-registry.db` dan subfolder `snapshots/`):

| Cara menjalankan | Folder data |
|---|---|
| Aplikasi desktop (.exe) | `%APPDATA%\Buku Induk Siswa Merdeka\data\` (folder userData Electron; diatur `electron/main.ts` lewat env `SIBISKUMER_DATA_DIR`) |
| Server manual / dev (`npm start`, `npm run dev`) | Folder `data\` di direktori kerja proses, atau env `SIBISKUMER_DATA_DIR` bila diatur |

**Cadangan resmi** (urutan kekuatan):
1. **Salin seluruh folder data** saat aplikasi tertutup — cadangan paling
   lengkap (basis data + registry + semua snapshot berkas).
2. Tombol **Unduh .db** di modul Backup (mode server) — satu berkas basis
   data sekolah aktif yang konsisten.
3. Ekspor **File JSON** (BackupPayload) — portabel antar-instalasi; impornya
   membuat snapshot pengaman `pengaman-impor-…` di dalam basis data tujuan.

**Snapshot berkas otomatis**: server membuat snapshot harian per sekolah
(subfolder `snapshots\<sekolah>\`, maks. 10 berkas label `otomatis`) dan
snapshot pengaman `pra-pulih` setiap pemulihan. Pemulihan snapshot berkas
membatalkan semua sesi (pengguna masuk ulang).

**Lupa kata sandi administrator** (prosedur resmi): tutup aplikasi →
ganti nama folder data (mis. `data` → `data-cadangan`) → nyalakan aplikasi
(server menanam benih awal; masuk `administrator / administrator` dan ganti
kata sandi saat diminta) → impor File JSON cadangan terakhir dari folder
lama lewat modul Backup. Folder lama jangan dihapus sebelum impor terverifikasi.

**Catatan multi-sekolah**: mode server saat ini memetakan sekolah bawaan
(`utama`); pengelolaan banyak sekolah pada satu instalasi server penuh
belum dirutekan (registry sekolah masih per perangkat). Satu instalasi =
satu sekolah adalah konfigurasi yang didukung resmi.

## 2. Skrip (`package.json`)

| Perintah | Fungsi |
|----------|--------|
| `npm run dev` | `tsx server.ts` — Express + Vite middleware, port 3000 |
| `npm run build` | `vite build` + bundle `server.ts` → `dist/` |
| `npm start` | `node dist/server.cjs` (produksi) |
| `npm run preview` | Pratinjau `dist/` |
| `npm run lint` | `tsc --noEmit` — **wajib lolos tiap perubahan** |
| `npm run clean` | Hapus `dist/` dan `server.js` (`rm -rf dist server.js`) |

## 3. Matriks Peran & Akses

| Kemampuan | Administrator | Operator (rombongan X) |
|-----------|:---:|:---:|
| Dasbor Operasional, Master Siswa, Nilai Raport, Rekap, Cetak, Referensi + GTK (lihat; GTK manual hanya admin) | ✅ semua rombel | ✅ hanya rombel X |
| Tambah/ubah/hapus siswa + wizard mutasi masuk/keluar + leger nilai | ✅ | ✅ hanya rombel X (`canUserAccessRombel`) |
| Impor Excel/CSV siswa (pemetaan + pratinjau + rekonsiliasi) | ✅ semua rombel | ✅ hanya rombel X (baris di luar kewenangan dilewati) |
| Sinkron Dapodik, Profil Sekolah, Backup, Manajemen Pengguna, Pemetaan Kelas, Tutup Tahun, Tema Tampilan, Log Audit | ✅ (via dropdown pengguna topbar) | ❌ (notice `AccessDeniedNotice` + redirect Dasbor) |
| Arsip tahun ajaran (lihat roster terkunci) | ✅ | ✅ (sebatas rombel kewenangan) |
| Impersonate (lihat sebagai operator) | ✅ | ❌ |
| Ganti password sendiri (dropdown topbar) | ✅ | ✅ |

Sidebar memuat 9 menu utama (`dasbor, siswa, raport, leger, rekap, cetak,
referensi, gtk, arsip`); 6 menu admin disembunyikan dari sidebar dan hanya ada di
dropdown pengguna (`src/components/Navbar.tsx : adminMenu`).

Akun bawaan (seed `src/data/initialData.ts : initialUsersList`):
`administrator / administrator` (penuh),
`operator_bukuinduk / operator123` (rombel 7A,7B,8A,8B,9A,9B),
`operator_kesiswaan / operator123` (rombel 7A, 7B). **Ganti password bawaan saat serah terima.**
Password tersimpan sebagai hash (bukan plaintext); 5x salah login mengunci akun
15 menit per database — tercatat di tab **Log Audit** (khusus administrator).

## 3a. Panduan Dasbor Pusat Kendali (Issue #2)

Tab **Dasbor** menampilkan angka dari data nyata dalam kewenangan Anda
(`visibleSiswa`: sudah terpotong rombel akses + sesi) — bukan angka contoh.

- **Filter Dasbor** (tahun ajaran / rombel / status) mempersempit SEMUA kartu
  dasbor. Rentang tanggal di widget **Arus Siswa** hanya membatasi arus
  penerimaan/keluar (berdasarkan tanggal diterima/keluar), bukan roster.
- **Setiap angka dapat dibuka**: klik angka/kartu untuk membuka daftar data
  sumber pembentuknya di Master Siswa (atau Nilai Raport untuk raport).
  Daftar tujuan memakai predikat yang sama dengan angka dasbor.
- **Antrean Tugas**: data wajib kosong, data tidak valid, dokumen belum
  lengkap, belum ditempatkan ke rombel, raport semester berjalan belum ada,
  mutasi keluar tanpa surat. Satu siswa bisa muncul di beberapa tugas.
- **Tenggat & Kewajiban**: backup kedaluwarsa/belum pernah + kewajiban
  raport berjalan. Aplikasi belum menyimpan tanggal tenggat laporan, jadi
  widget ini sengaja TIDAK menampilkan tanggal tenggat karangan.
- **Batasan**: aplikasi tidak punya antrean persetujuan mutasi (MutasiWizard
  langsung mengubah status). "Mutasi keluar tanpa surat" adalah tindak
  lanjut dokumen, bukan antrean persetujuan.

## 4. SOP Backup & Restore

### 4.0 Cakupan data yang dicadangkan (tegas)

Satu file backup JSON (`BackupPayload` v`1.3.0`) berisi **seluruh database
sekolah aktif**: profil sekolah, siswa (termasuk foto `fotoUrl`/`fotoMini`
yang tersimpan di record), nilai raport, riwayat, akun pengguna (password
dalam bentuk hash), referensi rombel, PTK, tutup tahun, peta kelas, log
sinkron, dan log audit (maks 500 entri terbaru). Sumber backup mengikuti
mode utama: pada **mode server**, isi berkas berasal dari basis data SQLite
server (ekspor dirakit server; token Dapodik dikosongkan) dan server juga
menyediakan cadangan berkas `.db` + snapshot (§1b); pada **mode lokal**,
yang dicadangkan adalah IndexedDB per-DB sekolah aktif di browser/perangkat.

**Yang TIDAK ikut backup:** token Web Service Dapodik (dieksklusi saat ekspor
— masukkan ulang setelah restore), snapshot auto-backup itu sendiri,
tombstone sinkron cloud, sesi login, dan pengaturan per-mesin (koneksi
Dapodik, PIN cloud). File backup berlaku per-DB aktif — untuk multi-sekolah,
backup tiap sekolah secara terpisah.

### 4.1 Membuat backup

1. **Otomatis (penjadwal):** aktif bawaan tiap 60 menit (diubah di tab Backup →
   Cadangan Otomatis: 15/30/60/120/240/mati); 5 snapshot terbaru tersimpan di
   perangkat dan dapat diunduh/dipulihkan/dihapus per snapshot. Snapshot hanya
   dibuat bila database berisi siswa. Setiap snapshot membawa blok integritas
   (lihat §4.3).
2. **Rutin (mingguan):** Backup → unduh JSON (`Backup_BukuInduk_<sekolah>_<tgl>.json`);
   simpan 2 salinan (laptop TU + flashdisk/Drive). Periksa file hasil unduh:
   ukuran > 0 dan dapat dibuka sebagai JSON; bila unduhan terpotong, file
   akan ditolak saat restore (checksum tidak cocok) — unduh ulang.
3. **Penyimpanan aman:** file backup berisi data pribadi siswa + hash password
   akun — simpan di media milik sekolah, jangan dibagikan lewat chat/medsos,
   jangan diberi nama yang memuat data siswa. File di Google Drive hanya
   terbaca oleh akun Google yang mengunggahnya (scope `drive.file`). Bila
   file pernah terekspos ke pihak tak dipercaya, anggap bocor: ganti password
   semua akun setelah restore di perangkat aman, dan buat backup baru.

### 4.2 Restore

1. Backup → pilih file → **pratinjau** (nama sekolah, NPSN berkas vs aktif,
   jumlah siswa, **status integritas**: checksum SHA-256 terverifikasi ATAU
   peringatan "backup lama tanpa checksum") → pilih mode **Gabung**
   (tambah/upsert, bawaan) atau **Ganti total** (hapus dulu seluruh data
   sekolah aktif, lalu restore) → bila NPSN berkas ≠ NPSN sekolah aktif,
   wajib centang "Saya paham file ini berisi data sekolah lain" → konfirmasi
   → tunggu status + **laporan verifikasi** (jumlah siswa diharapkan vs aktual,
   profil cocok) → verifikasi jumlah siswa.
2. **Sebelum restore, kondisi saat ini otomatis disimpan sebagai snapshot
   pengaman** (label "Pengaman restore" di daftar snapshot, tidak pernah
   digusur pruning snapshot otomatis; hanya pengaman terbaru yang
   dipertahankan). Bila restore gagal — baik saat tulis maupun saat
   verifikasi — aplikasi **rollback otomatis** ke snapshot pengaman dan
   melaporkan hasilnya. Bila rollback otomatis juga gagal, pulihkan manual:
   pilih snapshot berlabel "Pengaman restore" → Pulihkan.
3. **File ditolak (tidak ada mutasi apa pun)** bila: bukan JSON valid, bukan
   cadangan SIBISKuMer, versi format lebih baru dari aplikasi, struktur
   tidak valid (mis. tanpa array siswa, id/username ganda), checksum SHA-256
   tidak cocok (file rusak/terpotong/diubah), NPSN beda tanpa konfirmasi,
   atau snapshot pengaman gagal dibuat. Pesan penolakan menyebutkan alasan
   spesifiknya. File terenkripsi (envelope password) saat ini ditolak dengan
   pesan jelas — pemulihan file terenkripsi belum didukung di tab ini.
4. **Awal tahun ajaran (ritme Dapodik — urutan baku):** (a) backup penuh;
   (b) buka tab **Arsip → Tutup Tahun Ajaran**: susun rencana (Lulus/Naik/Tinggal
   per rombel, target terisi otomatis) → tutup, promosikan & kunci → tahun aktif
   berputar otomatis ke semester gasal; (c) verifikasi roster arsip + backup lagi;
   (d) **baru** Sinkron Dapodik untuk murid baru (lulusan tak muncul di Dapodik dan
   tak tersentuh arsip). Promosi manual susulan di Nilai Raport melewati siswa
   yang tahun terakhirnya terkunci.
5. **Reset contoh / kosongkan DB** hanya oleh administrator dan selalu dengan dialog
   konfirmasi danger; kosongkan DB bersifat permanen. Semua aksi tercatat di Log Audit.

### 4.3 Integritas & verifikasi (Issue #10)

Setiap backup baru membawa blok `integritas`: `{ algoritma: 'SHA-256',
checksum, jumlah, dibuatPada }`. Checksum = SHA-256 atas isi payload tanpa
blok integritas (kanonik: kunci terurut), sehingga perubahan satu byte pun
terdeteksi. Saat restore: (1) pratinjau memverifikasi checksum + jumlah
tercatat vs isi file; (2) setelah tulis, aplikasi membaca ulang database dan
memverifikasi jumlah siswa, kehadiran semua id yang diharapkan, dan
kecocokan profil sekolah — hasilnya ditampilkan di panel "Laporan Pemulihan
Terakhir". Backup lama tanpa blok integritas tetap dapat dipulihkan
(kompatibel ke belakang) tetapi ditandai peringatan "tanpa checksum".

### 4d. Uji pemulihan berkala (wajib tiap awal semester, disarankan bulanan)

Jangan percaya backup yang belum pernah diuji dipulihkan. Prosedur uji
(±10 menit, di profil browser / perangkat uji — JANGAN di database produksi):

1. Unduh backup terbaru dari perangkat produksi (atau salin file backup).
2. Di perangkat/profil uji: buka aplikasi → tab Backup → pilih file →
   pastikan pratinjau menampilkan "Integritas terverifikasi" → restore mode
   **Ganti total** → tunggu laporan verifikasi.
3. Bandingkan: jumlah siswa hasil verifikasi = jumlah di produksi; buka 2–3
   siswa acak (nama, NISN, rombel, nilai raport) dan cocokkan dengan produksi;
   cek profil sekolah (NPSN) cocok.
4. Bila gagal (checksum tidak cocok / verifikasi gagal): backup tersebut
   TIDAK SAH — buat backup baru, unduh ulang, ulangi uji. Catat hasil uji
   (tanggal, file, jumlah siswa, berhasil/gagal) di Log Audit perangkat uji
   atau buku agenda TU.
5. Bila uji di perangkat produksi tidak dapat dihindari, lakukan SETELAH
   backup terbaru dibuat — snapshot pengaman akan melindungi kondisi saat ini
   bila restore uji bermasalah.

## 4a. SOP Mutasi & Leger

1. **Mutasi keluar:** Master Siswa → Mutasi → Mutasi Keluar → pilih siswa aktif →
   isi sekolah tujuan (wajib) + tanggal + no. surat → konfirmasi. Status menjadi
   non-aktif; lengkapi alasan bila perlu.
2. **Mutasi masuk:** Mutasi → Mutasi Masuk → identitas → sekolah asal + tanggal
   diterima + rombel tujuan → konfirmasi. Terdaftar sebagai Pindahan; lengkapi
   data lain via Edit.
3. **Leger:** tab Leger Nilai → pilih tahun + semester + tingkat/rombel → periksa
   rata-rata & peringkat → Ekspor CSV / Cetak. Nilai <70 ditandai merah.

## 4b. SOP Sinkron Cloud Antar-Perangkat (Firebase gratis, tanpa kartu kredit)
**Disiapkan sekali oleh administrator (di console.firebase.google.com,
project sesuai `firebase-applet-config.json`):**

1. Build → Authentication → aktifkan provider **Google**.
2. Build → Firestore Database → buat database (mode production) → Rules →
   tempel isi `firestore.rules` → Publish.
   (Storage TIDAK dipakai — butuh upgrade; foto sinkron sebagai mini ≤60KB.)

**Pakai (tiap perangkat, khusus administrator, tab Backup → MODUL 5):**

1. Masuk dengan Google (akun sekolah mana pun boleh, yang penting sama-sama
   login).
2. Cek Cloud → perangkat pertama: buat PIN (min 4 karakter, catat!) → Sinkron
   Penuh. Perangkat lain: Cek Cloud → masukkan PIN yang sama → Sinkron Penuh.
3. Berikutnya cukup Sinkron Penuh berkala. Konflik: versi terbaru menang;
   hapus merambat ≤30 hari; foto ikut versi mini (asli penuh tetap per perangkat).
4. Kuota gratis (acuan 2026): 50rb baca + 20rb tulis/hari — satu sinkron penuh
   hanya menulis yang berubah. Tidak ikut sinkron: koneksi Dapodik per-mesin
   (atur manual tiap laptop), log sinkron/audit, snapshot auto-backup.

## 4c. Aturan Sesi Aktif (tahun kerja)

1. Sesi = batas atas data: yang tampil hanya tahun ≤ sesi (sesi login, fallback
   tahun aktif profil). Data masa depan muncul setelah sesi dipindah ke sana.
2. Input (nilai, promosi, pemetaan, mutasi bertanggal) hanya pada tahun sesi —
   pesan akan meminta pindah sesi bila tidak sesuai.
3. Koreksi tahun lama: pindah sesi ke tahun tersebut → edit → kembali. Tutup/
   buka tahun hanya dalam sesi tahun yang ditutup/dibuka.
4. Siswa baru manual selalu dikonfirmasi masuk TA sesi (riwayat awal = sesi).
5. Sinkron Dapodik: Terapkan diblokir bila sesi di bawah tahun aktif database
   (preview & tes koneksi tetap boleh). Pindah sesi tercatat di Log Audit.

## 4e. SOP Pemeriksa Data (Issue #3)

Tab **Pemeriksa Data** (semua peran; operator hanya melihat temuan rombelnya
karena daftar yang diperiksa adalah `visibleSiswa` yang sudah terfilter hak
akses). Alur kerja:

1. **Pindai:** buka tab — temuan dihitung dari data saat ini tiap render
   (tidak ada data turunan yang bisa basi). Ringkasan menampilkan total per
   prioritas dan per status penanganan.
2. **Tinjau:** filter per prioritas/kategori/status + cari nama/NISN/judul.
   Tiap temuan menampilkan prioritas, alasan, sumber (`data lokal`), dan
   siswa yang terlibat.
3. **Perbaiki:** tombol "Perbaiki di formulir" membuka formulir siswa
   bersangkutan (atau "Perbaiki record kedua" untuk pasangan duplikat).
   Perbaikan dilakukan lewat jalur simpan normal — termasuk validasi
   `validateIdentitasSiswa` dan kunci field tetap Dapodik.
4. **Tandai:** setelah diperbaiki, tandai "Diperbaiki" — atau "Abaikan…"
   dengan **alasan wajib** (mis. "Nama kembar, sudah dikonfirmasi berbeda").
   Temuan yang sudah tidak muncul pada pemindaian berikutnya berarti datanya
   sudah benar (temuan hilang = teratasi).
5. **Aturan:** panel "Lihat & atur aturan" mengaktifkan/menonaktifkan
   aturan per sekolah aktif (tersimpan di perangkat ini). Daftar aturan
   lengkap ada di `docs/03-model-data.md` §4a.
6. **Pratinjau impor:** unggah CSV (`nisn,nama,tanggalLahir,rombel,nik`)
   untuk melihat status tiap baris — baru / sama / berbeda / konflik /
   tanpa-kunci — **tanpa mengubah data**. Baris konflik (NIK milik siswa
   lain) tidak boleh diterapkan tanpa tinjauan manual; penerapan tetap
   satu per satu lewat formulir. Untuk perbedaan Dapodik, pakai tab
   Sinkron Dapodik (pratinjau baru/berbeda/sama + konflik NISN) — lihat §5.

Privasi: status penanganan temuan hanya menyimpan ID temuan + status +
alasan di localStorage; tidak ada nama/NISN/NIK siswa di dalamnya, dan
temuan tidak pernah ditulis ke log apa pun.

## 5. SOP Sinkron Dapodik

1. Pastikan aplikasi Dapodik desktop berjalan dan Web Service aktif (default `:5774`).
2. Daftarkan IP + token di Dapodik → Pengaturan → Web Service, lalu **restart Dapodik**.
3. Isi host/port/NPSN/token (+ `semesterId`, default `20261`) → Tes Koneksi → Tarik (atau Simulasi bila offline).
4. Periksa tab Baru/Berbeda/Sama (+ progres `SyncProgressBar`) → centang → Terapkan → catat `sync_logs`.
   - Pencocokan tanpa ID/NISN/NIK memakai **nama + tanggal lahir** (keduanya harus
     cocok); NISN lokal yang sudah terisi **tidak pernah** ditimpa NISN Dapodik yang
     berbeda — dicatat sebagai **konflik** untuk ditinjau manual.
   - Bila tahun ajaran/semester dari Dapodik berbeda dengan profil aktif, aplikasi
     meminta konfirmasi eksplisit sebelum mengubah (bawaan: tidak diubah).
5. Bila respons kosong untuk rombel/PTK, coba alias method (`getGtk` ↔ `getPTK`) via `wsMethod`.

## 5b. SOP Impor Excel/CSV Siswa (alternatif Dapodik offline, Issue #11)

Tombol **Impor Excel/CSV** di toolbar Master Siswa (administrator + operator).
Alur: Pilih berkas → Pemetaan kolom → Pratinjau & rekonsiliasi → Konfirmasi → Hasil.

1. **Template:** unduh Template CSV / Excel (.xlsx, sheet Template + Panduan) dari
   langkah 1, atau salin `docs/contoh-impor-siswa.csv` (2 baris contoh fiktif).
   Baris pertama WAJIB header. Field wajib: **Nama Lengkap, NISN, Rombel Saat Ini**.
2. **Batasan berkas:** hanya `.csv` / `.xlsx`, maks **5 MB**, maks **2000 baris**
   per berkas (bagi berkas bila lebih). CSV harus **UTF-8** (Excel: Save As →
   CSV UTF-8), delimiter `;` atau `,` (terdeteksi otomatis). Excel: hanya sheet
   pertama yang dibaca.
3. **Pemetaan:** header dikenali otomatis dari label/alias (cth. `Nama`, `Rombel`,
   `NIK Ayah`). Kolom yang tidak dikenal ditandai **kolom asing** — petakan
   manual ke field yang dikenal atau biarkan "Abaikan". Dua kolom tidak boleh
   memetakan ke field yang sama.
4. **Validasi per baris:** NISN 10 digit, NIK/No.KK 16 digit bila diisi,
   enum (jenis kelamin, agama, jalur, status, dst.), angka, tanggal, format
   rombel (`7A`). Duplikat NISN/NIK/NIPD **di dalam berkas** ditandai error.
   Tanggal diterima: `YYYY-MM-DD` (juga diterima `DD/MM/YYYY`, `DD-MM-YYYY`,
   dan tanggal Excel). Tahun 2 digit ditolak.
5. **Rekonsiliasi:** tiap baris diklasifikasikan `baru` / `sama` / `beda` /
   `konflik` / `error` / `ditolak-akses`. Pencocokan: NISN → NIK → NIPD.
   Bila NISN menunjuk siswa A tetapi NIK menunjuk siswa B = **konflik**,
   baris dilewati (perbaiki kunci identitas, impor ulang baris itu).
   Baris `beda` menampilkan perbedaan lama → baru; default **lewati**
   (tidak ada penggabungan otomatis). Pengguna memilih massal (lewati /
   perbarui semua yang berbeda) + override per baris, lalu mencentang
   persetujuan. **Sel kosong pada baris perbarui = "tidak diubah"** — tidak
   pernah mengosongkan data lama.
6. **Hak akses:** operator hanya dapat menambah/mengubah siswa pada rombel
   dalam `rombelAkses`-nya (`canUserAccessRombel`). Baris di luar kewenangan
   dilewati dan nilai lamanya tidak ditampilkan di pratinjau.
7. **Keamanan penerapan:** sebelum tulis dibuat **snapshot pengaman**
   (auto-backup; dapat dipulihkan dari menu Backup). Tulis memakai satu
   transaksi (`saveSiswaBulk`) — bila gagal, tidak ada data yang berubah.
   Tercatat di Log Audit sebagai `impor_siswa` (hanya hitungan, tanpa data
   siswa). Siswa baru hasil impor memiliki P5/ekskul/prestasi/riwayat KOSONG
   (tidak dibuatkan data karangan) — lengkapi lewat form/raport seperti biasa.
8. **Cegah unggah ulang:** sidik jari (SHA-256) berkas yang sudah diterapkan
   disimpan per database (maks 50 catatan, kunci `bukuinduk_impor_sidik`).
   Mengunggah berkas yang sama lagi menampilkan peringatan + wajib mencentang
   "impor ulang" untuk melanjutkan.
9. **Laporan error:** tombol "Unduh Laporan Error (.csv)" berisi baris
   konflik / error / di luar kewenangan beserta alasannya — perbaiki di
   berkas, lalu impor ulang (baris yang sudah masuk akan terklasifikasi
   `sama` / `beda`, tidak ganda).
10. **Batasan jujur — otorisasi:** penegakan impor dilakukan di lapisan
    aplikasi (UI + rekonsiliasi + tulis) memakai aturan peran yang sama
    dengan input manual (`canUserAccessRombel`, `filterSiswaByAccess`) —
    berkas impor bukan jalur yang melewati hak akses. Pada **mode server**,
    tulis hasil impor (bulk) selain itu divalidasi ulang oleh server
    (kewenangan rombel per baris, lihat `04-api.md` §1A); pada **mode lokal**
    tidak ada lapisan server di antara aplikasi dan IndexedDB.

## 5a. Multi-Sekolah (satu laptop, banyak DB) — khusus Administrator

Registry di `bukuinduk_schools` / `bukuinduk_active_school` (localStorage).
Instalasi lama otomatis diadopsi sebagai sekolah pertama (`ensureSchoolsInit` di
`src/main.tsx`). Backup/restore JSON (`BackupPayload` v`1.3.0`, dengan blok
integritas SHA-256 — lihat §4.3) berlaku per-DB aktif. SOP:

1. **Beralih:** pemilih di topbar / sidebar / kartu Profil Sekolah → pilih sekolah
   → tab kembali ke Dasbor; sesi dipertahankan bila username sama aktif di DB
   tujuan, bila tidak tampilkan login.
2. **Tambah:** Kelola multi-sekolah → isi nama (wajib, disimpan uppercase), NPSN
   (unik bila diisi), jenjang; centang data contoh bila ingin 5 siswa sampel —
   database diprovisi sesuai jenjang (SD memakai preset SD).
3. **Hapus:** pilih hapus registry saja atau hapus permanen database fisik
   (default fisik: IDB + cache lokal ter-scope + memori). Sekolah terakhir tidak
   dapat dihapus. Bila yang dihapus adalah sekolah aktif, aplikasi beralih ke
   sekolah pertama dan memvalidasi ulang sesi.

## 6. Troubleshooting

| Gejala | Penyebab umum | Tindakan |
|--------|---------------|----------|
| `Dapodik menolak ... pastikan token/IP ... restart` | Token/IP belum terdaftar | Daftarkan ulang di Dapodik, restart, tes lagi |
| Respons tanpa JSON / method tak dikenal | Versi Dapodik beda | Coba alias `wsMethod`, pakai simulasi/impor |
| Data tidak tampil setelah restore | File bukan backup valid | Lihat pesan error spesifik (checksum tidak cocok / versi tidak didukung / NPSN beda); file rusak → unduh ulang backup; verifikasi di panel "Laporan Pemulihan Terakhir" |
| Layar panel kosong + tombol Coba Lagi | Crash render terisolasi | Klik Coba Lagi; lapor pesan error ke admin |
| Akun dikunci ±15 menit | 5x salah kata sandi | Tunggu masa kunci habis; reset via admin (Reset Kata Sandi) bila mendesak |
| PWA tidak terinstal | Ikon/service worker | Gunakan `PWAInstallButton`; pastikan akses via HTTPS/localhost |
| Google Drive gagal | OAuth/Firebase belum dikonfigurasi | Pakai backup JSON lokal (jalur utama) |

## 7. Keamanan Operasional (minimum)

- **Kata sandi bawaan wajib diganti** saat login pertama (akun `administrator` /
  `operator_bukuinduk` / `operator_kesiswaan` tidak bisa dipakai sebelum diganti,
  min. 8 karakter; tercatat di Log Audit).
- **Logout otomatis** setelah 30 menit tidak ada aktivitas.
- Sesi login divalidasi ulang ke database saat aplikasi dibuka; akun yang sudah
  dinonaktifkan tidak bisa memakai sesi lama.
- Batas `rombelAkses` per operator; backup tersimpan terbatas akses; jangan
  membagikan token Web Service Dapodik. Token **ditampilkan tersamar** di layar
  Sinkronisasi Dapodik (tombol mata hanya untuk melihat sesaat); nilainya di
  perangkat tersimpan plaintext pada IndexedDB, jadi amankan perangkatnya.
- **Pesan login generik**: "Username atau kata sandi salah." untuk semua kasus
  gagal (anti-enumerasi username).
- **Kata sandi tidak lagi di-trim**: spasi di awal/akhir kini dianggap bagian dari
  kata sandi. Hash lama (dibuat dari versi trim) tetap bisa login sekali, lalu
  otomatis di-hash ulang ke format baru.
- **Kunci brute-force ganda**: hitungan gagal disimpan di localStorage DAN
  IndexedDB — menghapus localStorage saja tidak membuka kunci.
- **Token Dapodik tidak ikut file backup** (dieksklusi saat ekspor); token
  tersimpan plaintext di perangkat — jangan bagikan file profil/DB mentah.
- **Rekapitulasi**: hanya siswa Aktif yang dihitung; jenis kelamin kosong masuk
  kolom "Belum Diisi" (tidak lagi dihitung Perempuan).
- **Nilai kosong = "belum dinilai"** (null), bukan 0; rata-rata memakai pembulatan
  tunggal 1 desimal di simpan/cetak/ekspor.
- **Keputusan "Lulus" di raport** meminta konfirmasi lalu mengubah status siswa +
  menulis riwayat (tidak diam-diam).
- **Tutup tahun**: promosi ditulis sekaligus; tahun hanya dikunci bila semua
  promosi berhasil.
- **Ganti NPSN via sinkron Dapodik** selalu meminta konfirmasi eksplisit.
- **Ganti sekolah ditolak** selama impor backup / sinkronisasi Dapodik berjalan
  (mencegah tulis ke DB sekolah yang salah).

### 7a. Proxy Dapodik (server.ts) — variabel env

| Env | Fungsi |
|-----|--------|
| `DAPODIK_PROXY_SECRET` | **Wajib di server** bila fitur proxy dipakai — tanpa ini semua request `/api/dapodik/*` ditolak 503. Nilai harus sama dengan `VITE_DAPODIK_PROXY_SECRET` di frontend. Lihat §7b untuk cara setel dan rotasi. |
| `VITE_DAPODIK_PROXY_SECRET` | Secret yang dikirim frontend via header `x-dapodik-secret`. |
| `DAPODIK_ALLOW_HOSTS` | **Kanonis.** Daftar host Dapodik tambahan yang diizinkan (comma-separated). `localhost`/`127.0.0.1`/`::1` selalu diizinkan; host publik selalu ditolak (anti-SSRF). |
| `DAPODIK_ALLOWED_HOSTS` | **Alias lama (deprecated).** Nama dari README lama yang tidak pernah dibaca aplikasi sebelum perbaikan #14. Tetap didukung untuk kompatibilitas: dipakai hanya bila `DAPODIK_ALLOW_HOSTS` tidak diatur. Bila keduanya diatur dengan nilai berbeda, yang kanonis menang dan server mencatat peringatan saat startup. Pindahkan ke nama kanonis. |
| `HOST` | Bind address server (bawaan `127.0.0.1`; set `0.0.0.0` hanya bila perlu diakses dari LAN dan sudah memahami risikonya). |
| `PORT` | Port server (angka 1–65535). |

Konfigurasi proxy dibaca sekali saat startup (snapshot); perubahan env butuh
restart server. Saat startup, server memvalidasi konfigurasi dan mencatat
peringatan operator (tanpa pernah menampilkan nilai secret) bila:
`DAPODIK_PROXY_SECRET` belum diatur, alias lama dipakai, kedua variabel
allowlist diatur dengan nilai berbeda, atau `DAPODIK_ALLOW_HOSTS` tidak
berisi host yang valid.

### 7b. Secret proxy Dapodik — konfigurasi, rotasi, dan arti kegagalan

**Kapan secret dibutuhkan.** Setiap request ke `/api/dapodik/*`
(fetch-sekolah, fetch-peserta-didik, fetch-rombel, fetch-ptk,
fetch-pengguna, test-connection) melewati guard proxy. Guard menolak
request sebelum menyentuh Dapodik bila secret tidak terkonfigurasi atau
header tidak cocok.

**Cara menyetel (server).** Set `DAPODIK_PROXY_SECRET` di env server ke
nilai acak yang kuat (minimal 32 karakter, mis. hasil
`openssl rand -hex 32`), samakan `VITE_DAPODIK_PROXY_SECRET` di env
frontend, rebuild frontend, lalu restart server. Contoh placeholder ada di
`.env.example` — jangan pernah commit nilai sungguhan ke repository.

**Rotasi.** (1) Set nilai baru di env server. (2) Samakan
`VITE_DAPODIK_PROXY_SECRET` di frontend dan rebuild. (3) Restart server.
Sejak restart, secret lama langsung tidak berlaku. Rotasi wajib dilakukan
bila secret pernah terekspos (mis. bundle frontend dibagikan ke pihak
yang tidak dipercaya, atau nilai tersalin ke log/chat).

**Arti kegagalan konfigurasi.**

| Status | Arti | Tindakan operator |
|--------|------|-------------------|
| 503 | `DAPODIK_PROXY_SECRET` belum diatur di server — proxy dinonaktifkan. | Set secret, restart server. |
| 403 | Header `x-dapodik-secret` tidak ada atau tidak cocok. | Samakan `VITE_DAPODIK_PROXY_SECRET` frontend dengan server, rebuild, restart bila perlu. |
| 403 | Host Dapodik tidak diizinkan. | Tambahkan host ke `DAPODIK_ALLOW_HOSTS`, restart server. |
| 400 | Port tidak valid (bukan integer 1–65535). | Perbaiki nilai port di request. |

Pesan error tidak pernah memuat nilai secret — hanya nama variabel dan
statusnya.

**Batasan yang perlu dipahami.** Karena browser harus mengirim secret ini,
salinan frontend-nya (`VITE_DAPODIK_PROXY_SECRET`) secara teknis tertanam
di client bundle. Artinya secret ini adalah rahasia bersama khusus LAN,
bukan kredensial kuat: biarkan server bind ke `127.0.0.1` (bawaan), jangan
pakai nilai yang sama untuk keperluan lain, dan rotasi bila bundle pernah
terekspos. Menghilangkan secret dari bundle sepenuhnya butuh desain ulang
autentikasi (mis. sesi server-side) — di luar cakupan perbaikan #15.
