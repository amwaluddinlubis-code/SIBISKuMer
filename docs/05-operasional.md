# 05 — Operasional & SOP

> **Status:** Aktif · **Revisi:** 2026-09-16

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
Satu instance saja (dibuka 2x = window lama difokuskan). Data tetap di
IndexedDB per laptop; sinkron antar-laptop via Sinkron Cloud (§4b), bukan via exe.

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

## 4. SOP Backup & Restore

1. **Otomatis (penjadwal):** aktif bawaan tiap 60 menit (diubah di tab Backup →
   Cadangan Otomatis: 15/30/60/120/240/mati); 5 snapshot terbaru tersimpan di
   perangkat dan dapat diunduh/dipulihkan/dihapus per snapshot. Snapshot hanya
   dibuat bila database berisi siswa.
2. **Rutin (mingguan):** Backup → unduh JSON (`Backup_BukuInduk_<sekolah>_<tgl>.json`);
   simpan 2 salinan (laptop TU + flashdisk/Drive).
3. **Restore:** Backup → pilih file → pratinjau (nama sekolah, NPSN berkas vs aktif,
   jumlah siswa) → pilih mode **Gabung** (tambah/upsert, bawaan) atau **Ganti total**
   (hapus dulu seluruh data sekolah aktif, lalu restore) → bila NPSN berkas ≠ NPSN
   sekolah aktif, wajib centang "Saya paham file ini berisi data sekolah lain" →
   konfirmasi → tunggu status (ditolak/digabung/diganti + alasan) → verifikasi jumlah
   siswa. File invalid atau NPSN beda tanpa konfirmasi ditolak otomatis.
4. **Awal tahun ajaran (ritme Dapodik — urutan baku):** (a) backup penuh;
   (b) buka tab **Arsip → Tutup Tahun Ajaran**: susun rencana (Lulus/Naik/Tinggal
   per rombel, target terisi otomatis) → tutup, promosikan & kunci → tahun aktif
   berputar otomatis ke semester gasal; (c) verifikasi roster arsip + backup lagi;
   (d) **baru** Sinkron Dapodik untuk murid baru (lulusan tak muncul di Dapodik dan
   tak tersentuh arsip). Promosi manual susulan di Nilai Raport melewati siswa
   yang tahun terakhirnya terkunci.
4. **Reset contoh / kosongkan DB** hanya oleh administrator dan selalu dengan dialog
   konfirmasi danger; kosongkan DB bersifat permanen. Semua aksi tercatat di Log Audit.

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

## 5a. Multi-Sekolah (satu laptop, banyak DB) — khusus Administrator

Registry di `bukuinduk_schools` / `bukuinduk_active_school` (localStorage).
Instalasi lama otomatis diadopsi sebagai sekolah pertama (`ensureSchoolsInit` di
`src/main.tsx`). Backup/restore JSON (`BackupPayload` v`1.1.0`) berlaku per-DB
aktif. SOP:

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
| Data tidak tampil setelah restore | File bukan backup valid | Pastikan ada array `siswa`; lihat pesan error |
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
  membagikan token Web Service Dapodik.

### 7a. Proxy Dapodik (server.ts) — variabel env

| Env | Fungsi |
|-----|--------|
| `DAPODIK_PROXY_SECRET` | **Wajib di server** bila fitur proxy dipakai — tanpa ini semua request `/api/dapodik/*` ditolak 503. Nilai harus sama dengan `VITE_DAPODIK_PROXY_SECRET` di frontend. |
| `VITE_DAPODIK_PROXY_SECRET` | Secret yang dikirim frontend via header `x-dapodik-secret`. |
| `DAPODIK_ALLOW_HOSTS` | Daftar host Dapodik tambahan yang diizinkan (comma-separated). `localhost`/`127.0.0.1`/`::1` selalu diizinkan; host publik selalu ditolak (anti-SSRF). |
| `HOST` | Bind address server (bawaan `127.0.0.1`; set `0.0.0.0` hanya bila perlu diakses dari LAN dan sudah memahami risikonya). |
| `PORT` | Port server (angka 1–65535). |
