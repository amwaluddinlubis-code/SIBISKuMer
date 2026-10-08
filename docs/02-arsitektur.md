# 02 — Arsitektur & Desain Perangkat Lunak (SDD)

> **Status:** Aktif · **Revisi:** 2026-09-16

## 1. Tumpukan Teknologi

| Lapisan | Teknologi | Keterangan |
|---------|-----------|------------|
| UI | React 19 + Vite 6 + Tailwind CSS 4 + lucide-react + motion | SPA, `src/main.tsx` → `src/App.tsx`; code-splitting per tab/modal (`lazyView` + `Suspense` di `App.tsx`); design system di `src/index.css` (token `@theme` navy/gold + kelas `.ui-*`: kartu, tombol, input, badge, tabel, avatar, animasi) |
| Data lokal | IndexedDB (API `indexedDB` mentah, tanpa ORM) + fallback localStorage (di-scope per-DB multi-sekolah) + cache memori sesi `memFallback` | `src/utils/db.ts`, DB `BukuInduk_Merdeka_DB` v5 (tambahan: `BukuInduk_Merdeka_DB_<schoolId>`) |
| Backend | Express 4 (disajikan bersama Vite dev / statis `dist/` saat produksi) | `server.ts`, port 3000 (`vite` hanya diimpor dinamis saat dev agar bundel produksi bebas vite) |
| Desktop | Electron 44 (Windows .exe: installer NSIS + portable) | `electron/main.ts` (port bebas → require `dist/server.cjs`) + `preload.ts`; config `electron-builder.yml` |
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
    | (rekap & cetak) |  HTML  |  Express + SPA + IndexedDB|  HTTPS | (backup opsional)|
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
| DapodikSyncView, Rekap,   |  JSON        | /api/health               |  JSON     |         |
| Cetak, Referensi,         |              +------+------+--------------+           +---------+
| Pengaturan, Users, Backup |                     | dist/ statis (prod)
| utils/db (IndexedDB)      |                     | / Vite middleware (dev)
+---------------------------+                     +---------------------------+
```

## 4. Komponen Frontend (C4 Level 3)

```text
App.tsx (15 tab via TAB_META: dasbor|siswa|raport|leger|rekap|cetak|referensi|gtk + admin: dapodik|pengaturan|users|backup|audit)
 + lazyView() + <Suspense>: 22 view/modal di-split per chunk (entry 387KB; firebase hanya di chunk Backup)
 + PageHeader.tsx (kepala halaman konsisten per tab via TAB_META)
 + PageHeader.tsx (kepala halaman konsisten per tab via TAB_META)
 + Navbar.tsx (sidebar 7 menu utama + topbar terang, admin via dropdown pengguna, drawer mobile, ganti password, impersonate banner, collapse persisten)
 + OperatorDashboard.tsx (dasbor operasional: sapaan, antrean data, jalan pintas) + DashboardStats.tsx (kartu hero navy + ring kelengkapan + bilah fase + status Dapodik)
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
 + PageControl.tsx (pagination bersama) + OfflineIndicator.tsx + PWAInstallButton.tsx + SyncProgressBar.tsx
 + TopProgressBar.tsx (bar atas tiap boot/reload/ganti-tab/simpan) + ToastHost.tsx + ConfirmDialogHost.tsx (sistem umpan balik global)
Lintas: utils/db.ts (CRUD+authz+multi-sekolah+arsip `tutup_tahun` v4 + audit `audit_logs` & snapshot `auto_backup` v7) · utils/dapodikSync.ts (konversi + flag arsip) · utils/arsip.ts (snapshot/roster/kunci) · utils/raportUtils.ts
        (fase/mapel/predikat/deskripsi) · utils/notify.ts (toast/confirm event bus) · utils/validation.ts
        (wajib/format per form) · utils/progress.ts (bus progres atas) · utils/pagination.ts
        · utils/password.ts (hash PBKDF2 + fallback SHA-256) · utils/security.ts (kunci login)
        · utils/audit.ts (penulis audit) · utils/autoBackup.ts (penjadwal snapshot)
        · utils/firebaseApp.ts (app/auth/Firestore/Storage bersama) · utils/cloudSync.ts
        (merge LWW + tombstone + foto Storage) · utils/tombstone.ts (tanpa Firebase,
        agar bundel utama ramping)
```

Navigasi adalah state `activeTab` di `App.tsx` (bukan router URL). 15 tab terdaftar di
`TAB_META` (`dasbor, siswa, raport, leger, rekap, cetak, referensi, gtk, arsip` untuk semua
peran + 6 admin `dapodik, pemetaan, pengaturan, backup, users, audit`); sidebar menampilkan 9 menu utama, 6 menu admin
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

**5.1 CRUD siswa (offline):** Form → `validateIdentitasSiswa` → `onSave` (`App.handleSaveSiswa`
cek `canUserAccessRombel`) → `saveSiswa` (IndexedDB, fallback LS) → `loadData()` → toast sukses.

**5.2 Nilai raport:** `NilaiRaportView` → `saveSiswaRaport` (upsert raport + sinkron
`riwayatSemester`) → `onDataChanged()`. Promosi → `promoteSiswaKenaikanKelas`
(mencatat riwayat kondisi **lama**: tingkat aktif dari rombel + tahun ajaran terakhir) → toast.

**5.3 Sinkron Dapodik:** View → `POST /api/dapodik/*` (proxy) → parse toleran
(`extractDapodikJson`, retry 2x, `asList` normalisasi) → `compareDapodikWithExisting` →
checkbox pilih → `saveSiswa`/`saveSekolahProfile`/`saveRombelRefs`/`savePtkRefs`/`saveUser` →
`addSyncLog` → `onRefreshData()`.

**5.4 Hapus/konfirmasi:** `confirmDialog(...)` (promise, `ConfirmDialogHost`) → aksi →
`toast(...)` (`ToastHost`). Tidak ada `alert`/`confirm`/`prompt` native di `src/`.

**5.5 Backup:** `exportAllData` (v`1.2.0`, termasuk `tutupTahun`) → unduh JSON / unggah Drive; restore: pilih file →
`confirmDialog` danger → `importBackupData` (validasi array `siswa`) → `onDataChanged()`.

**5.6 Arsip tahun ajaran:** `ArsipView` (wizard: susun rencana per rombel →
`App.handleTutupTahun`: `buildSnapshot` pra-promosi → `promoteSiswaKenaikanKelas`
per grup → `saveTutupTahun` → putar tahun aktif + semester gasal → `loadData()`).
Kunci ditegakkan di `NilaiRaportView` (tolak simpan & lewati promosi tahun
terkunci). Urutan baku tahun baru: tutup-kunci → tahun aktif baru → Sinkron
Dapodik (murid baru masuk; lulusan tak muncul di Dapodik dan tak tersentuh:
converter tak mengubah `statusSiswa`/rombel-tebakan; flag `arsip` menandai
baris cocok non-Aktif di preview).

## 6. Keputusan Arsitektur (ADR ringkas)

| ID | Keputusan | Alasan | Konsekuensi |
|----|-----------|--------|-------------|
| ADR-01 | IndexedDB mentah + fallback localStorage, tanpa ORM | Nol dependensi, offline penuh, tahan iframe sandbox | Skema/migrasi ditulis manual (`onupgradeneeded`) |
| ADR-02 | Express sebagai proxy Dapodik | Menghindari CORS + menyembunyikan token dari WS Dapodik; parsing toleran terpusat | Frontend & backend rilis bersamaan |
| ADR-03 | Data mock emulator (`mock-*` + `initialData.ts`) | Sekolah dapat mencoba alur penuh saat Dapodik offline | Mock harus dijaga realistis |
| ADR-04 | Event-bus untuk toast/confirm (`utils/notify.ts`) | Mengganti 35 titik native call tanpa prop-drilling | Host wajib terpasang di `App` |
| ADR-05 | `@types/react` + `@types/react-dom` tersedia (revisi 2026-09-15; klaim lama "tanpa @types" kedaluwarsa) | `package.json` devDeps; type-check komponen kelas/fungsi standar | `ErrorBoundary.tsx` memakai `Component<Props, State>` standar — tidak ada pola `ComponentBase` di kode |
| ADR-06 | State navigasi di `App`, bukan router | Sederhana untuk app satu-layar multi-tab | Deep-link URL belum didukung (backlog Tahap 2+) |
| ADR-07 | Multi-sekolah: satu DB IndexedDB per sekolah + registry ringan di localStorage | Satu laptop dipakai banyak sekolah ala Dapodik; isolasi penuh tanpa backend | Ganti sekolah = ganti `activeDbName`; backup/restore per-DB aktif |
| ADR-08 | Cache tiga lapis untuk referensi (IndexedDB → localStorage → memori sesi) | Tahan iframe sandbox ketat tempat IDB + LS sama-sama gagal | Tulis memakai gabung `putAllToStore`; hapus GTK via `deletePtkRef` membersihkan 3 lapis |
| ADR-09 | Arsip snapshot + kunci per tahun (`tutup_tahun`, DB v4) | Buku induk berlanjut 7→8→9→lulus; Dapodik tiap tahun meluluskan & mendatangkan murid baru | Snapshot roster pra-promosi; raport/promosi tahun terkunci ditolak; buka kunci tanpa rollback |

## 7. Keamanan & Otorisasi (ringkas; detail di `05-operasional.md`)

- Peran `administrator | operator`; operator terikat `rombelAkses[]` (kosong = semua).
- Penegakan di `filterSiswaByAccess`, `canUserAccessRombel`, `isAdministrator` — dipakai di
  tampil, simpan, dan hapus (`App.tsx`).
- Tab admin disembunyikan dari operator + dijaga ulang saat render (`AccessDeniedNotice`).
- Diketahui belum aman: password plaintext (lihat NFR-03 / roadmap Tahap 5).
