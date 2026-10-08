# 06 — Roadmap Pengembangan

> **Status:** Aktif · **Revisi:** 2026-09-16

## Definisi Selesai / DoD (berlaku tiap tahap)

1. `npm run lint` dan `npm run build` lolos.
2. Kriteria terima tiap item terpenuhi dan diverifikasi manual.
3. Tidak ada `alert`/`confirm`/`prompt` native baru di `src/`.
4. Dokumen `docs/` terkait diperbarui dalam pekerjaan yang sama.

## Tahap 1 — Fondasi Stabil ✅ SELESAI (2026-09-16)

| Item | Realisasi (file) |
|------|------------------|
| Validasi NISN/NIK/NIPD + duplikat, error inline | `src/utils/validation.ts` (baru), `SiswaFormModal.tsx` |
| Perbaiki `promoteSiswaKenaikanKelas` (riwayat mencatat kondisi lama) | `src/utils/db.ts` |
| Rapikan `putAllToStore` (satu baca-gabung-tulis) | `src/utils/db.ts` |
| Pagination 10/20/50 + empty-state ganda + toast ekspor | `SiswaList.tsx` |
| Toast + dialog konfirmasi global; migrasi ±35 titik native | `src/utils/notify.ts`, `ToastHost.tsx`, `ConfirmDialogHost.tsx` (baru); `App.tsx` + 7 view |
| `ErrorBoundary` untuk panel Master Siswa | `src/components/ErrorBoundary.tsx` (baru) |
| Verifikasi `lint` + `build` | lolos |

## Tahap 2 — UI/UX & Fitur Inti ✅ SELESAI (2026-09-15 — gelombang lanjutan)

Selesai pada gelombang redesain UI + gelombang lanjutan (terverifikasi dari kode):

| # | Item | Realisasi (file) |
|---|------|------------------|
| 2.1 | Wizard formulir + draft otomatis | `SiswaFormModal.tsx`: stepper 7 langkah bernomor + bilah kemajuan + tombol Kembali/Lanjut (identitas divalidasi sebelum lanjut) + draft `bukuinduk_draft_siswa_v1` (autosave 800ms, pulihkan saat buka baru, buang via tombol penghapus, hapus saat simpan sukses) |
| 2.2 | Navigasi + kepala halaman konsisten | `Navbar.tsx`: sidebar 7 menu utama + 4 menu admin via dropdown topbar + drawer mobile + collapse persisten; `PageHeader.tsx` + `TAB_META` (11 tab) di `App.tsx` |
| 2.3a | Dashboard lebih informatif | `DashboardStats.tsx`: kartu hero navy L/P, bilah per-tingkat, ring SVG kelengkapan, status Dapodik + tombol aksi |
| 2.3b | Dasbor Operasional | `OperatorDashboard.tsx` (baru): sapaan waktu, antrean (belum lengkap, raport kosong, tanpa foto), jalan pintas, ringkasan sinkron — dipasang di tab `dasbor` dalam `<ErrorBoundary>` |
| 2.4a | Tabel & empty-state konsisten | `SiswaList.tsx`: tabel `.ui-table` (header gelap sticky, zebra), avatar inisial gradien, badge status, filter status berfungsi, pagination default 20 via `PageControl.tsx`; `LoginModal.tsx`: split-screen branding; design system `.ui-*` di `index.css` |
| 2.4c | Modul GTK | `GtkView.tsx` (baru): klasifikasi Guru/Tendik, rombel binaan, CRUD manual (`savePtkRef`/`deletePtkRef`), ekspor CSV, pagination `PageControl` |
| 2.4d | Multi-sekolah penuh (backend + UI) | `db.ts`: registry + `ensureSchoolsInit` + `provisionSchoolDatabase`/`createSchoolWithDatabase`/`switchActiveSchool`/`deleteSchoolEntry{deletePhysical}` + `getSchoolSiswaCount`; `SchoolSwitcher.tsx` + `SchoolManagerModal.tsx` (baru); `App` (state + handler switch/create/delete + validasi sesi); `Navbar` (topbar/sidebar/dropdown) + kartu `PengaturanSekolahView`; NPSN unik; seed jenjang (SD=preset SD) |
| 2.4e | Dukungan `semesterId` ujung-ke-ujung | `server.ts : withSemester` + seluruh endpoint POST; `DapodikConfig.semesterId` (default `20261`) |
| 2.4f | Validasi wajib + toast simpan/gagal + progres atas | `validation.ts` (profil/akun/GTK/raport/Dapodik/entri sekolah), toast sukses/gagal di Login, Raport, Profil, Pengguna, GTK, Backup, Dapodik, App; `required`+`*` di input wajib; `TopProgressBar` + `progress.ts` (boot/reload/tab/simpan) |
| 2.4g | Arsip tahun ajaran + ritme Dapodik | Tab `arsip` + `ArsipView` (roster terkunci + wizard tutup/promosi + buka kunci admin); store `tutup_tahun` (DB v4) + backup v1.2.0; kunci raport/promosi (`tahunTerkunci`); sync sadar-arsip (flag `arsip`, tak ubah status/rombel-tebakan, `jenisPendaftaran` bawaan); SOP tahun baru di `05-operasional.md` |
| 2.4h | Pemetaan Kelas per tahun ajaran (admin) | Tab `pemetaan` + `PemetaanKelasView` (CRUD/salin/generate + hormat kunci arsip); store `peta_kelas` (DB v5) + backup v1.3.0; saran target rombel di wizard arsip |
| 2.4i | Tema biru SMP / maroon SD (admin) | `resolveTemaEfektif` + `data-tema` di root + blok CSS maroon (layar saja); kartu Tema di Profil Sekolah (otomatis/biru/maroon) |

Tersisa backlog kecil (bukan penahan rilis):

| # | Item | Kriteria terima |
|---|------|-----------------|
| 2.3c | Dashboard: filter tahun ajaran + ringkas per-rombel | Angka konsisten dengan Rekap |
| 2.4b | Skeleton loading semua tab + pintasan keyboard | Tidak ada layar putih kosong |
| 2.5 | Impor Excel/CSV siswa (alternatif Dapodik offline) | Baris invalid dilaporkan per-baris, valid tetap masuk |

## Tahap 3 — Sinkron Dapodik Tangguh (SEBAGIAN SELESAI — fondasi sudah ada)

Sudah ada di kode: retry 1x + timeout 3,5–6 dtk + `SyncProgressBar`, bulk-select,
`lastSyncedWithDapodik` per-siswa, alias `wsMethod`, pesan Indonesia menunjuk
solusi, mode simulasi identik live (`server.ts`, `DapodikSyncView.tsx`,
`dapodikSync.ts`). Sisa: cache respons + undo bulk + panduan alias di UI.
Terima: 100+ siswa tanpa timeout; error berbahasa Indonesia
yang menunjuk solusi.

## Tahap 4 — Cetak & Ekspor (SEBAGIAN SELESAI)

Sudah ada: kop resmi terpusat (`KopSuratView`, diatur di Profil Sekolah),
isolasi cetak (`index.css` `@media print`: hanya `.print-sheet` yang tercetak —
tanpa sidebar/topbar/tombol/toast/backdrop/header-footer browser via
`@page A4 margin 0`), warna backgrounds dicetak persis (`print-color-adjust`),
tabel mengulang thead + baris/tanda tangan anti-terpotong. Sisa: cetak massal
per-rombel + nomor halaman, ekspor Excel rekap + PDF raport, kartu pelajar
bolak-balik + QR NISN. Terima: 1 siswa = 1 lembar induk utuh di Chrome/Edge.

## Tahap 5 — Keamanan & Skala

Hash password ✅ SELESAI (2026-09-16): PBKDF2-HMAC-SHA256 + fallback SHA-256
(`src/utils/password.ts`, terverifikasi 19 tes vs `node:crypto`); migrasi transparan
plaintext→hash saat boot/login/restore (`migrateUserPasswordsToHash`, `db.ts`);
hash di semua jalur tulis (buat/ubah/reset/ganti password, akun Dapodik);
celah bypass typo administrator di `Navbar.tsx` dihapus; hash tidak disimpan di sesi.

Kunci login ✅ SELESAI (2026-09-16): 5x gagal → dikunci 15 menit per database
(`src/utils/security.ts`, state LS ter-scope; pesan sisa upaya di `LoginModal.tsx`).

Audit log ✅ SELESAI (2026-09-16): store `audit_logs` (DB v7, maks 2000, ikut
backup/restore); penulis tunggal `catatAudit` (`src/utils/audit.ts`) terpasang di
login/logout/gagal/kunci, kelola akun + password, impersonate, CRUD siswa,
tutup/buka tahun, sinkron terapkan, backup/restore/reset; tab admin **Log Audit**
(`AuditLogView.tsx`: filter aksi/entitas/cari, pagination, ekspor CSV, kosongkan).

Auto-backup ✅ SELESAI (2026-09-16): snapshot JSON penuh ke store `auto_backup`
(DB v7, maks 5 terbaru); penjadwal tiap menit di `App.tsx` (default aktif 60 menit,
pilihan 15/30/60/120/240, diam tanpa toast); kartu kelola di `BackupRestoreModule.tsx`
(toggle, interval, snapshot manual, unduh/pulihkan/hapus per snapshot).

Sisa Tahap 5 ✅ SELESAI (2026-09-16):
restore selektif per-rombel (MODUL 4 di `BackupRestoreModule.tsx`: pilih file →
centang rombel → upsert; `parseBackupPayload` + `importSelectiveSiswa` +
`saveSiswaBulk` satu transaksi di `db.ts`), wizard mutasi masuk/keluar
(`MutasiWizard.tsx`: keluar = pilih siswa aktif + dokumen tujuan/surat/tanggal;
masuk = identitas + asal + `jenisPendaftaran: 'Pindahan'`; hormat batas rombel;
audit `mutasi_masuk`/`mutasi_keluar`), leger nilai gabungan (tab `leger` +
`LegerNilaiView.tsx`: matriks siswa × mapel per tahun+semester+tingkat+rombel,
rata-rata + peringkat kompetisi + predikat, ekspor CSV + cetak; hormat batas rombel).

Terima: tanpa password plaintext; restore massal satu transaksi (target <10 dtk untuk 500 siswa).

## Tahap 2J — Kunci Field Tetap Dapodik ❌ BELUM SELESAI (rencana 2026-09-16)

> **Kebijakan:** sumber data wajib Dapodik. Data identitas pokok yang sifatnya tetap
> (NISN, NIPD, NIK, No. KK, No. Akta Lahir, Tempat/Tanggal Lahir, Jenis Kelamin,
> NIK Ayah/Ibu) menjadi **readonly saat Edit** — hanya berubah via Sinkron Dapodik
> (`convertDapodikToSiswa`), bukan ketikan manual. Saat Tambah Baru tetap dapat diisi.

| # | Item | Kriteria terima |
|---|------|-----------------|
| 2J.1 | Kunci 10 field tetap di `SiswaFormModal.tsx` (mode Edit) | NISN, NIPD, NIK, No.KK, No.Akta, Tempat Lahir, Tanggal Lahir, Jenis Kelamin, NIK Ayah, NIK Ibu `readOnly/disabled` + hint "Terkunci Dapodik" |
| 2J.2 | Penegakan lapis data di `App.tsx : handleSaveSiswa` | Nilai field tetap diambil dari record lama bila mode edit (anti-bypass devtools) |
| 2J.3 | Sinkron tetap berkuasa | `convertDapodikToSiswa` tetap boleh memperbarui field tetap saat sinkron |

## Backlog Umum (di luar tahap)

Deep-link URL per tab, ~~code-splitting bundle (>500KB warning saat build)~~ ✅ SELESAI
(2026-09-16): 22 view/modal di `App.tsx` jadi `React.lazy` via helper `lazyView` +
`Suspense` (`TabLoading` untuk tab, `null` untuk modal) — entry `index` 999KB →
387KB; Firebase SDK diisolasi di chunk Backup (dimuat hanya saat tab Backup dibuka;
`tombstone.ts` dipisah agar App tak menyeret Firebase ke bundel utama);
bonus: `TabLoading` menutup sebagian backlog 2.4b (skeleton loading tiap tab).
Mode gelap ✅ SELESAI (2026-09-16): `ModeTampilan` terang/gelap/otomatis
(`src/utils/tema.ts`: persist per perangkat + live-follow sistem, 11 tes lulus);
toggle topbar semua peran (Sun/Moon/Monitor); blok `:root[data-mode="dark"]`
khusus `@media screen` (cetak tetap terang); maroon × gelap dapat dikombinasikan.

Template kartu + Excel ✅ SELESAI: 3 template Kartu Pelajar
(`KartuPelajar.tsx`: dinas navy-emas / modern terang / minimal monokrom,
pilih di pratinjau cetak); ekspor `.xlsx` SheetJS lazy-load (`src/utils/excel.ts`,
chunk 430KB terpisah, 6 tes lulus) di Master Siswa, Leger, Rekap (4 sheet),
GTK — angka numerik, lebar kolom otomatis.
Lembar induk Excel+Word ✅ SELESAI: builder tunggal A–I (`dokumenInduk.ts`, 8 tes lulus),
tombol di mode buku-induk, `docx` chunk terpisah.
Kartu massal A4 ✅ SELESAI: seleksi lintas halaman di Pusat Cetak + pratinjau
`CetakKartuMassal.tsx` (10/halaman, template + sisi belakang opsional) + CSS
cetak `.kartu-a4` (page-break per halaman).
Multi-bahasa.

Distribusi desktop ✅ SCAFFOLD SELESAI (2026-09-16): Electron (`electron/main.ts` +
`preload.ts`, `electron-builder.yml` → installer NSIS + portable di `release/`,
ikon dari PWA, single-instance, `vite` jadi dynamic-import agar bundel produksi
bebas vite). Status: seluruh tahap pra-paket terverifikasi (lint/build/server/
main/icon); paket `.exe` final + uji klik harus dijalankan di mesin Windows
(`npm run dist:win`) — di luar itu tidak ada perubahan kode aplikasi.

Sinkron antar-perangkat ✅ SELESAI V1 (2026-09-16): engine Firestore tier gratis
(`src/utils/cloudSync.ts`, `firebaseApp.ts`, `tombstone.ts`):
rumah cloud `cloud/{NPSN/dbName}`, PIN sekolah ter-hash, merge last-write-wins
(`gabungLww`, 9 tes lulus), hapus merambat via tombstone 30 hari, foto sebagai
mini JPEG ≤60KB di `fotoMini` (**tanpa Storage** — butuh upgrade, dicoret),
config Dapodik & audit & snapshot TIDAK ikut sinkron (disengaja); UI MODUL 5 di Backup (login Google → PIN → Unggah/Unduh/
Sinkron Penuh + progres); `firestore.rules` di repo (Storage dicoret — butuh upgrade).

Aturan sesi aktif (cutoff) ✅ SELESAI (2026-09-16): sesi = batas atas data
(`src/utils/sesi.ts`: `siswaTerlihatSesi`, `tahanMaksSesi`, `opsiTahunMaksSesi`,
`cekTulisTahun` menolak tulis ≠ sesi; 18 tes lulus). Roster + dropdown + record
(raport, leger, arsip, pemetaan, cetak, histori) ≤ sesi; siswa baru dikonfirmasi
masuk TA sesi + cap riwayat awal; tutup/buka tahun hanya di sesinya; Terapkan
Dapodik diblokir bila sesi < tahun aktif profil; pindah sesi diaudit
(`sesi_pindah`). Master data tak berdimensi tahun tetap dapat diubah.

## Tahap 5b — Hardening Temuan Analisis Ulang ✅ SELESAI (2026-10-09)

Analisis ulang read-only menemukan 43 temuan (3 kritis, 11 tinggi, 16 sedang,
13 rendah). 3 kritis diperbaiki lebih dulu, lalu 10 temuan tinggi pada gelombang ini.

| ID | Temuan | Perbaikan (file) |
|----|--------|------------------|
| S1 | Kredensial default hardcode | `LoginModal.tsx`: hapus `pass` tak-terpakai dari quickAccounts; `AppUser.mustChangePassword` + alur wajib ganti kata sandi saat login pertama (audit `ganti_password_bawaan`) |
| D1 | Sinkron cloud crash (TDZ `cloudIds`) | `cloudSync.ts`: deklarasi dipindah sebelum pemakaian |
| D2 | Aturan Firestore terbuka | `firestore.rules`: koleksi dibatasi, `pinHash` dikunci, root hanya dibuat dengan PIN (deploy ulang rules via `firebase deploy --only firestore:rules`) |
| S2 | Otorisasi role murni sisi klien | `App.tsx`: sesi divalidasi ulang ke DB saat boot (user harus ada & aktif, role dari DB); impersonate verifikasi admin ke DB; gagal → paksa logout |
| S3 | Idle logout tak terpasang | `App.tsx` + `useIdleLogout.ts`: logout otomatis 30 menit idle + toast |
| S4 | SSRF proxy Dapodik | `server.ts`: allowlist host, validasi port, header `x-dapodik-secret` wajib (env `DAPODIK_PROXY_SECRET`), bind bawaan `127.0.0.1`; frontend kirim secret via `VITE_DAPODIK_PROXY_SECRET` (`dapodikSync.ts`, `.env.example`) |
| F1 | Promosi ganda menulis riwayat tahun sama | `db.ts`: `promoteSiswaKenaikanKelas(..., tahunSesiLama?)`; `App.tsx` teruskan `args.tahunTutup`, `NilaiRaportView` teruskan `tahunAjaranSebelumnya(target)` |
| F2 | Siswa Lulus/Keluar "dibangkitkan" promosi | `NilaiRaportView.tsx`: kandidat promosi hanya status Aktif + guard eksplisit |
| F3 | Fallback nama-buta menimpa NISN | `dapodikSync.ts`: cocok nama + tgl lahir; NISN lokal tak pernah ditimpa; beda NISN → konflik manual |
| F4 | Tarik identitas menimpa tahun tanpa konfirmasi | `PengaturanSekolahView.tsx`: dialog konfirmasi bila tahun/semester Dapodik berbeda (bawaan: tidak diubah) |
| D3 | Restore = merge tanpa cek NPSN | `db.ts`: `importBackupData(json, {mode: 'gabung'|'ganti-total', konfirmasiSekolahLain})` → `{status: 'ditolak'|'digabung'|'diganti'}`; `BackupRestoreModule.tsx`: pratinjau + pilihan mode + checkbox sekolah lain |
| D5 | Baca IDB error mengabaikan cache LS | `db.ts`: fallback ke LS ter-scope; `initialUsersList` tidak lagi jadi fallback baca |
| D6 | `saveSiswa` salah mengira record rusak sebagai IDB mati | `db.ts`: record tanpa id langsung throw; hanya error IDB-tak-tersedia yang fallback ke LS |

Verifikasi: `npx tsc --noEmit` — nol error baru di semua file yang disentuh
(34 error pre-existing di file lain tidak berubah). Sisa 16 temuan sedang +
13 rendah belum dikerjakan.

## Tahap 5c — Perbaikan Sisa Temuan Analisis Ulang (Sedang + Rendah) ✅ SELESAI (2026-10-09)

16 temuan sedang + 13 rendah diperbaiki dalam satu gelombang (4 worker paralel).

| ID | Temuan | Perbaikan (file) |
|----|--------|------------------|
| S8 | Pesan error login membocorkan username valid | `LoginModal.tsx`: pesan disamakan menjadi "Username atau kata sandi salah." di kedua kasus; audit internal tetap spesifik |
| S9 | SHA-256 satu iterasi (dead code berbahaya) | `crypto.ts`: fungsi hash lemah dihapus; `ensurePasswordHash` kini di atas `password.ts` (PBKDF2) |
| S10 | Password di-trim sebelum hash | `password.ts`: `hashPassword` tak lagi trim; `verifyPassword` coba tanpa trim lalu fallback trim (hash lama) + flag `perluRehash` |
| S11 | Formula injection di ekspor Excel | `excel.ts`: helper `amanDariFormula` — sel `=`/`+`/`-`/`@` di-prefix `'` |
| S12 | Lockout brute-force hanya di localStorage | `security.ts`: lapisan kedua di IndexedDB terpisah; terkunci bila salah satu lapisan terkunci (bukan pengganti rate-limit server) |
| S5 | Restore sesi tak cek status user | Sudah tertangani S2 — diverifikasi, tidak diduplikasi |
| S7 | Token Dapodik plaintext + ikut ke backup | `db.ts`: token dieksklusi dari `exportAllData()`; `DapodikSyncView.tsx`: peringatan plaintext di UI |
| F5 | JK kosong dihitung Perempuan di rekap | `RekapitulasiView.tsx`: kategori ketiga "Belum diisi" |
| F6 | Rekap hitung siswa non-Aktif | `RekapitulasiView.tsx`: kohort difilter `statusSiswa === 'Aktif'` |
| F7 | Tiga pembulatan berbeda untuk rata-rata | `raportUtils.ts`: helper tunggal `bulatkanNilai()` (1 desimal) dipakai simpan/cetak/ekspor |
| F8 | Mutasi keluar tak menulis riwayat | `App.tsx`: tulis entri `riwayatTahunAjaran`; `SiswaFormModal.tsx`: konfirmasi ubah status langsung ke Lulus/Keluar |
| F9 | Draft form tak di-scope per sekolah | `SiswaFormModal.tsx`: `draftKey()` memakai `scopedStorageKey()` |
| F10 | Tanggal lahir tak divalidasi | `validation.ts`: tolak masa depan & lahir setelah tgl diterima; kosong → warning |
| F11 | Wizard mutasi langgar filter rombel | `MutasiWizard.tsx`: kandidat difilter `canUserAccessRombel` |
| F12 | Keputusan "Lulus" tak propagasi status | `NilaiRaportView.tsx`: konfirmasi → `statusSiswa='Lulus'` + riwayat + audit |
| F13 | Akses `kehadiran` tanpa guard → crash | `CetakBukuInduk.tsx`, `SiswaFormModal.tsx`: optional chaining + fallback `'-'` |
| F14 | Nilai dikosongkan tersimpan 0 | `NilaiRaportView.tsx`: `''` → `null` ("belum dinilai"); rata-rata abaikan null |
| F15 | Tutup tahun tak atomik | `App.tsx`: dua fase (hitung dulu, tulis via `saveSiswaBulk` satu transaksi); tahun dikunci hanya bila sukses |
| F16 | Siswa tanpa rombel tak terkelola operator | `db.ts`: `filterSiswaByAccess` sertakan siswa tanpa rombel |
| D7 | Hapus GTK/peta tak catat tombstone | `GtkView.tsx`, `PemetaanKelasView.tsx`: `catatHapusCloud('ptk'/'peta')`; `cloudSync.ts`: mapping diperluas |
| D8 | Dialog tinjauan Dapodik tak lengkap | `dapodikSync.ts`: `compareDapodikWithExisting` tampilkan SEMUA field per seksi |
| D11 | Isolasi sekolah via global mutable | `db.ts`: lock `operasiPanjangBerjalan`; ganti sekolah ditolak selama operasi berjalan |
| D12 | Tombstone tak pernah dibersihkan | `cloudSync.ts`: prune tombstone >90 hari |
| D14 | NPSN tertimpa diam-diam | `DapodikSyncView.tsx`: `konfirmasiUbahNpsn()` bila NPSN berbeda |
| D15 | Restore timpa admin + abaikan tombstone | `db.ts`: admin tak ditimpa tanpa konfirmasi; user baru `mustChangePassword=true`; rekonsiliasi tombstone pasca-restore |

Tidak diubah (keputusan sadar): D13 (foto mini — tradeoff terdokumentasi); `backupCrypto.ts` tidak dijadikan enkripsi penuh (terlalu berisiko); temuan rendah S11-excel-formula sudah termasuk di S11.

Verifikasi: `npx tsc --noEmit` — nol error baru di semua file yang disentuh (32 error pre-existing di file lain, pola `unknown`/modul hilang, tidak berubah).
