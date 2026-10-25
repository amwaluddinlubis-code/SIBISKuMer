# 02 — Arsitektur & Desain Perangkat Lunak (SDD)

> **Status:** Aktif · **Revisi:** 2026-10-25

## 1. Tumpukan Teknologi

| Lapisan | Teknologi | Keterangan |
|---------|-----------|------------|
| UI | React 19 + Vite 6 + Tailwind CSS 4 + lucide-react + motion | SPA, `src/main.tsx` → `src/App.tsx`; code-splitting per tab/modal (`lazyView` + `Suspense` di `App.tsx`); design system di `src/index.css` (token `@theme` navy/gold + kelas `.ui-*`: kartu, tombol, input, badge, tabel, avatar, animasi) |
| Data lokal (mode lokal) | IndexedDB (API `indexedDB` mentah, tanpa ORM) + fallback localStorage (di-scope per-DB multi-sekolah) + cache memori sesi `memFallback` | `src/utils/db.ts`, DB `BukuInduk_Merdeka_DB` v5 (tambahan: `BukuInduk_Merdeka_DB_<schoolId>`) — jalur masa tenggang, dicabut pada Fase S6 |
| Data server (mode server) | SQLite via `node:sqlite` (bawaan Node 24, tanpa dependensi native) — satu berkas per sekolah + registry, WAL | `server/db.ts` (folder data: env `SIBISKUMER_DATA_DIR`, bawaan `<cwd>/data`; desktop: `<userData>/data`), skema di `03-model-data.md` §2b |
| Mode data | Saklar **Mode Utama** `lokal`/`server` (`src/utils/modeData.ts`); pada mode server fungsi inti `db.ts` dirutekan ke klien API (`src/utils/dataApi.ts`) dengan tanda tangan yang sama | Bawaan: `server` pada kemasan desktop, `lokal` pada browser web; saklar per layar S2 (`dasbor`/`siswa`) hanya relevan pada mode lokal |
| Backend | Express 4 (disajikan bersama Vite dev / statis `dist/` saat produksi) + API data `/api/v1` (auth sesi & otorisasi server, `server/auth.ts`, `server/api.ts`) | `server.ts`, port 3000 (`vite` hanya diimpor dinamis saat dev agar bundel produksi bebas vite); folder statis produksi dicari relatif terhadap berkas server terbundel (`__dirname`), bukan `cwd` |
| Desktop | Electron 44 (Windows .exe: installer NSIS + portable) | `electron/main.ts` (port bebas → atur `SIBISKUMER_DATA_DIR=<userData>/data` → require `dist/server.cjs`) + `preload.ts` (mengekspos `window.appDesktop` untuk deteksi kemasan); config `electron-builder.yml` |
| PWA | `vite-plugin-pwa` (generateSW, autoUpdate) | `vite.config.ts`, `public/*.png` (+ `icon.svg`, `apple-touch-icon.png`), `src/hooks/usePWAInstall.ts` |
| Opsional | Firebase Auth + Google Drive API (backup cloud, scope `drive.file`) | `src/utils/googleDriveAuth.ts`, `googleDriveService.ts`, `firebase-applet-config.json` |
| Kualitas | `tsc --noEmit` (`npm run lint`), `vite build` + esbuild server | `@types/react` + `@types/react-dom` **tersedia** (lihat ADR-05 revisi) |

## 2. Diagram Konteks (C4 Level 1)

```text
                +------------------ Dapodik Desktop (port 5774) ---------------+
                | WebService: getSekolah/getPesertaDidik/getRombonganBelajar/  |
                |             getGtk(getPTK)/getPengguna?npsn=...               |
                +---------------------------^---------------------------------+
                                             | HTTP (server-to-server, proxy)
    +-----------------+        +-------------+-------------+        +------------------+
    | Kepala/Dinas    |<------>|  SIBISKuMer (port 3000)   |<------>| Google Drive API |
    | (rekap & cetak) |  HTML  | Express + SPA + SQLite   |  HTTPS | (backup opsional)|
    |                 |        | (/api/v1) · IndexedDB (lokal)|       |                  |
    +-----------------+        +------+------+-------------+        +------------------+
                                      |      |                     +------------------+
                                      |      +-------------------->| Firebase gratis  |
                                      |        Firestore via        | (sinkron antar-  |
                                      |        cloudSync.ts         | perangkat, P15)  |
                                      | file                       +---------+--------+
                                      v                                       (tanpa kartu kredit)
                               Backup JSON lokal
```

## 3. Kontainer (C4 Level 2)

```text
Browser (SPA)                              Node (server.ts)                        Dapodik
+---------------------------+              +---------------------------+           +---------+
| Views: SiswaList,         |  fetch()     | GET/POST                  |  fetch()  | WS      |
| NilaiRaportView,          +------------->| /api/dapodik/*            +---------->| :5774   |
| DapodikSyncView, Rekap,   |  JSON        | /api/v1/* (auth + data    |  JSON     |         |
| Cetak, Referensi,         |              |  SQLite, sesi cookie)     |           +---------+
| Pengaturan, Users, Backup |              | /api/health               |
| utils/db (rute API        |              +------+------+--------------+
|  / IndexedDB per mode)    |                     | dist/ statis (prod)
+---------------------------+                     | / Vite middleware (dev)
                                                  +---------------------------+
```

## 4. Komponen Frontend (C4 Level 3)

```text
App.tsx (15 tab via TAB_META: dasbor|siswa|raport|leger|rekap|cetak|referensi|gtk + admin: dapodik|pengaturan|users|backup|audit)
 + lazyView() + <Suspense>: 22 view/modal di-split per chunk (entry 387KB; firebase hanya di chunk Backup)
 + PageHeader.tsx (kepala halaman konsisten per tab via TAB_META)
 + PageHeader.tsx (kepala halaman konsisten per tab via TAB_META)
 + Navbar.tsx (sidebar 7 menu utama + topbar terang, admin via dropdown pengguna, drawer mobile, ganti password, impersonate banner, collapse persisten)
 + OperatorDashboard.tsx (dasbor operasional: sapaan, antrean data, jalan pintas) + DashboardStats.tsx (kartu hero navy + ring kelengkapan + bilah fase + status Dapodik)
 + utils/dashboard.ts (Issue #2, FUNGSI MURNI + teruji): predikat kondisi, filter roster, ringkasan, tugas tertunda, arus, tenggat — dipakai dasbor & Master Siswa agar angka dan daftar tujuan selalu sepakat; drill-down via preset filter (`SiswaPresetFilter` + nonce) dari App.tsx
 + SiswaList.tsx (filter memo + pagination default 20 via PageControl + ekspor CSV + avatar inisial + upload foto kolom aksi via `utils/photo.ts`) — dalam <ErrorBoundary>
 + SiswaFormModal.tsx (wizard 7 langkah + bilah kemajuan + draft otomatis localStorage + validasi utils/validation.ts)
 + SiswaDetailModal.tsx + CetakBukuInduk.tsx (mode buku-induk|raport|kartu-pelajar)
  + NilaiRaportView.tsx (form raport + promosi massal)
  + LegerNilaiView.tsx (matriks leger tahun+semester+rombel, rata-rata + peringkat)
  + MutasiWizard.tsx (modal wizard mutasi masuk/keluar, dipicu dari SiswaList)
 + DapodikSyncView.tsx (preview baru/berbeda/sama + bulk-select + buat akun + SyncProgressBar)
 + RekapitulasiView.tsx (agregasi murni dari props)
 + ReferensiView.tsx (rombel/ptk hasil sinkron) + GtkView.tsx (klasifikasi Guru/Tendik + CRUD manual savePtkRef/deletePtkRef + CSV)
 + PengaturanSekolahView.tsx (kartu multi-sekolah + sinkron registry) + BackupRestoreModule.tsx (lokal + Drive, per-DB aktif) + UserManagementView.tsx
 + SchoolSwitcher.tsx (pemilih topbar admin) + SchoolManagerModal.tsx (tambah/aktif/hapus + lencana jumlah siswa)
 + ArsipView.tsx (tahun terkunci + roster + wizard tutup tahun & promosi)
 + PemetaanKelasView.tsx (CRUD rombel resmi per tahun ajaran, khusus admin; saran target di wizard arsip)
 + PemeriksaDataView.tsx (temuan prioritas + filter/cari + status penanganan + pratinjau impor CSV)
 + PageControl.tsx (pagination bersama) + OfflineIndicator.tsx + PWAInstallButton.tsx + SyncProgressBar.tsx
 + TopProgressBar.tsx (bar atas tiap boot/reload/ganti-tab/simpan) + ToastHost.tsx + ConfirmDialogHost.tsx (sistem umpan balik global)
Lintas: utils/db.ts (CRUD+authz+multi-sekolah+arsip `tutup_tahun` v4 + audit `audit_logs` & snapshot `auto_backup` v7) · utils/dapodikSync.ts (konversi + flag arsip) · utils/arsip.ts (snapshot/roster/kunci) · utils/raportUtils.ts
        (fase/mapel/predikat/deskripsi) · utils/notify.ts (toast/confirm event bus) · utils/validation.ts
        (wajib/format per form) · utils/pemeriksaData.ts (mesin pemeriksa
        Issue #3: aturan terkonfigurasi + status + banding impor, murni/tanpa IO) · utils/progress.ts (bus progres atas) · utils/pagination.ts
        · utils/password.ts (hash PBKDF2 + fallback SHA-256) · utils/security.ts (kunci login)
        · utils/audit.ts (penulis audit) · utils/autoBackup.ts (penjadwal snapshot)
        · utils/firebaseApp.ts (app/auth/Firestore/Storage bersama) · utils/cloudSync.ts
        (merge LWW + tombstone + foto Storage) · utils/tombstone.ts (tanpa Firebase,
        agar bundel utama ramping)
```

Navigasi adalah state `activeTab` di `App.tsx` (bukan router URL). 16 tab terdaftar di
`TAB_META` (`dasbor, siswa, raport, leger, rekap, cetak, referensi, gtk, arsip, pemeriksa` untuk semua
peran + 6 admin `dapodik, pemetaan, pengaturan, backup, users, audit`); sidebar menampilkan 10 menu utama, 6 menu admin
hanya lewat dropdown pengguna topbar dan dijaga
`handleNavigateTab` + `AccessDeniedNotice`. Tab `cetak` memakai pencarian +
`PageControl` sendiri (default 9/kartu), tab `siswa` memakai `PageControl` (default 20).

**Boot multi-sekolah:** `src/main.tsx` menjalankan `ensureSchoolsInit()` (mengadopsi
DB lama sebagai sekolah pertama bila registry kosong) → `initStorage()` (seed per-DB
aktif bila kosong) sebelum `createRoot(...).render`. `App.loadData()` memanggil
keduanya lalu memuat siswa/sekolah/config/logs/rombel/ptk milik DB aktif.
Seluruh akses IndexedDB memakai `activeDbName`; fallback localStorage di-scope
via `sk()` dan cache memori `memFallback` ber-scope DB. Siklus ganti sekolah
(`App.handleSwitchSchool` → `switchActiveSchool` → `loadData`): set registry,
`initStorage` DB target, validasi sesi (pertahankan bila username aktif di DB
target, bila tidak paksa login; impersonate selalu dibersihkan), reset tab ke
Dasbor + bersihkan modal/search. Sekolah baru diprovisi via
`createSchoolWithDatabase` → `provisionSchoolDatabase` (profil jenjang + config
NPSN + users selalu; siswa contoh opsional). Hapus memakai
`deleteSchoolEntry(id, {deletePhysical})` (registry saja vs + `deleteDatabase` IDB,
kunci LS ter-scope, cache memori).

## 5. Aliran Data Utama

**5.1 CRUD siswa:** Form → `validateIdentitasSiswa` → `onSave` (`App.handleSaveSiswa`
cek `canUserAccessRombel`) → `saveSiswa` → `loadData()` → toast sukses. Jalur tulis
`saveSiswa` bergantung mode utama: mode lokal → IndexedDB (fallback LS); mode server →
`POST/PUT /api/v1/data/siswa` dan otorisasi rombel ditegakkan ulang di server
(cek rombel lama & baru). Tanda tangan fungsi `db.ts` identik di kedua mode.

**5.2 Nilai raport:** `NilaiRaportView` → `saveSiswaRaport` (upsert raport + sinkron
`riwayatSemester`) → `onDataChanged()`. Promosi → `promoteSiswaKenaikanKelas`
(mencatat riwayat kondisi **lama**: tingkat aktif dari rombel + tahun ajaran terakhir) → toast.

**5.3 Sinkron Dapodik:** View → `POST /api/dapodik/*` (proxy) → parse toleran
(`extractDapodikJson`, retry 2x, `asList` normalisasi) → `compareDapodikWithExisting` →
checkbox pilih → `saveSiswa`/`saveSekolahProfile`/`saveRombelRefs`/`savePtkRefs`/`saveUser` →
`addSyncLog` → `onRefreshData()`.

**5.4 Hapus/konfirmasi:** `confirmDialog(...)` (promise, `ConfirmDialogHost`) → aksi →
`toast(...)` (`ToastHost`). Tidak ada `alert`/`confirm`/`prompt` native di `src/`.

**5.5 Backup:** `exportAllData` (v`1.3.0`, termasuk `tutupTahun` + blok
`integritas` SHA-256) → unduh JSON / unggah Drive; restore: pilih file →
pratinjau (`pratinjauBackup`: kompatibilitas + struktur + checksum) →
`confirmDialog` danger → `importBackupData` (snapshot pengaman pra-restore →
tulis → verifikasi pasca-restore → rollback otomatis bila gagal) →
`onDataChanged()`. Snapshot pengaman (`pengaman-restore`) dikecualikan dari
pruning snapshot otomatis. Detail: `docs/05-operasional.md` §4.

**5.7 Impor Excel/CSV siswa:** `ImporSiswaView` → baca berkas (CSV `parseCsv` / Excel `barisDariExcel`, sheet pertama) → `petakanKolomOtomatis` (label/alias; kolom asing ditandai) → `validasiSemuaBaris` (format + duplikat dalam berkas) → `rekonsiliasiImpor` (baru/sama/beda/konflik/error/ditolak-akses; `canUserAccessRombel`) → pilihan eksplisit pengguna (massal + per baris + checkbox persetujuan) → `jalankanAutoBackup` (snapshot pengaman) → `rencanaTerapkan` → `saveSiswaBulk` (satu transaksi atomik) → sidik jari SHA-256 dicatat (`bukuinduk_impor_sidik`) + audit `impor_siswa` → `onDataChanged()`. Tidak ada mutasi sebelum konfirmasi pratinjau.

**5.6 Arsip tahun ajaran:** `ArsipView` (wizard: susun rencana per rombel →
`App.handleTutupTahun`: `buildSnapshot` pra-promosi → `promoteSiswaKenaikanKelas`
per grup → `saveTutupTahun` → putar tahun aktif + semester gasal → `loadData()`).
Kunci ditegakkan di `NilaiRaportView` (tolak simpan & lewati promosi tahun
terkunci). Urutan baku tahun baru: tutup-kunci → tahun aktif baru → Sinkron
Dapodik (murid baru masuk; lulusan tak muncul di Dapodik dan tak tersentuh:
converter tak mengubah `statusSiswa`/rombel-tebakan; flag `arsip` menandai
baris cocok non-Aktif di preview).

**5.7 Generator Dokumen (Issue #4):** `GeneratorDokumen` (tab `dokumen`) hanya
menerima `visibleSiswa` (sudah terpotong hak rombel + sesi) → pilih template →
`bangunDokumenSurat` (modul murni `src/utils/suratDokumen.ts`: template,
penomoran, validasi, builder isi) → pratinjau langsung (field wajib kosong
= `[BELUM DIISI]` + cetak/ekspor diblokir) → cetak (`window.print`, lembar
`.print-sheet`) / ekspor Word (`unduhSuratWord`, `docx` lazy-load) / Excel
(`unduhDaftarRombelExcel`, khusus daftar rombel). Penomoran: pola +
`nomorTerakhir` dari `SekolahProfile.penomoran` (khusus administrator) atau
nomor manual operator; tanpa nomor karangan & tanpa tanda tangan karangan.

## 6. Keputusan Arsitektur (ADR ringkas)

| ID | Keputusan | Alasan | Konsekuensi |
|----|-----------|--------|-------------|
| ADR-01 | IndexedDB mentah + fallback localStorage, tanpa ORM | Nol dependensi, offline penuh, tahan iframe sandbox | Skema/migrasi ditulis manual (`onupgradeneeded`) — **status: berlaku untuk mode lokal (masa tenggang); jalur utama kini ADR-10** |
| ADR-02 | Express sebagai proxy Dapodik | Menghindari CORS + menyembunyikan token dari WS Dapodik; parsing toleran terpusat | Frontend & backend rilis bersamaan |
| ADR-03 | Data mock emulator (`mock-*` + `initialData.ts`) | Sekolah dapat mencoba alur penuh saat Dapodik offline | Mock harus dijaga realistis |
| ADR-04 | Event-bus untuk toast/confirm (`utils/notify.ts`) | Mengganti 35 titik native call tanpa prop-drilling | Host wajib terpasang di `App` |
| ADR-05 | `@types/react` + `@types/react-dom` tersedia (revisi 2026-09-15; klaim lama "tanpa @types" kedaluwarsa) | `package.json` devDeps; type-check komponen kelas/fungsi standar | `ErrorBoundary.tsx` memakai `Component<Props, State>` standar — tidak ada pola `ComponentBase` di kode |
| ADR-06 | State navigasi di `App`, bukan router | Sederhana untuk app satu-layar multi-tab | Deep-link URL belum didukung (backlog Tahap 2+) |
| ADR-07 | Multi-sekolah: satu DB IndexedDB per sekolah + registry ringan di localStorage | Satu laptop dipakai banyak sekolah ala Dapodik; isolasi penuh tanpa backend | Ganti sekolah = ganti `activeDbName`; backup/restore per-DB aktif |
| ADR-08 | Cache tiga lapis untuk referensi (IndexedDB → localStorage → memori sesi) | Tahan iframe sandbox ketat tempat IDB + LS sama-sama gagal | Tulis memakai gabung `putAllToStore`; hapus GTK via `deletePtkRef` membersihkan 3 lapis |
| ADR-09 | Arsip snapshot + kunci per tahun (`tutup_tahun`, DB v4) | Buku induk berlanjut 7→8→9→lulus; Dapodik tiap tahun meluluskan & mendatangkan murid baru | Snapshot roster pra-promosi; raport/promosi tahun terkunci ditolak; buka kunci tanpa rollback |
| ADR-10 | **Migrasi SQLite (Fase S0–S5, 2026-10-25)**: driver `node:sqlite`; satu berkas SQLite per sekolah di folder data server; API `/api/v1` meniru tanda tangan `db.ts`; auth + lockout di server (sesi cookie HttpOnly); Mode Utama lokal/server dengan masa tenggang satu rilis sebelum IndexedDB dicabut (S6); Sinkron Cloud dibekukan pada mode server; kemasan desktop menaruh data di `userData` dan berangkat pada mode server | Data sekolah butuh basis data berkas yang dapat dicadangkan/dipulihkan utuh, otorisasi yang ditegakkan server (bukan hanya UI), dan satu sumber kebenaran per instalasi — tanpa dependensi native (spike S0 membuktikan `node:sqlite` di Node terbundel Electron 44) | Dua jalur data hidup berdampingan selama tenggang (fungsi `db.ts` bercabang per mode); impor mode gabung belum dirutekan di mode server; registry banyak-sekolah di server belum dirutekan (resmi: satu instalasi = satu sekolah) |

## 7. Keamanan & Otorisasi (ringkas; detail di `05-operasional.md`)

- Peran `administrator | operator`; operator terikat `rombelAkses[]` (kosong = semua).
- Penegakan di `filterSiswaByAccess`, `canUserAccessRombel`, `isAdministrator` — dipakai di
  tampil, simpan, dan hapus (`App.tsx`).
- Tab admin disembunyikan dari operator + dijaga ulang saat render (`AccessDeniedNotice`).
- Impor Excel/CSV: penegakan di lapisan aplikasi (UI + rekonsiliasi + tulis) via `canUserAccessRombel` (lihat `05-operasional.md` §5b butir 10).
- **Mode server (ADR-10):** otorisasi ditegakkan ulang di server pada setiap endpoint `/api/v1` — baca siswa tersaring rombel akses sesi, tulis memeriksa rombel lama & baru, tulis config khusus admin/operator, users & snapshot berkas khusus admin; sesi cookie HttpOnly (`sibis_sesi`, 12 jam); kunci login server 5x gagal → 15 menit. Password tersimpan sebagai hash PBKDF2 (verifikasi menerima warisan plaintext hanya untuk migrasi transparan saat login).
