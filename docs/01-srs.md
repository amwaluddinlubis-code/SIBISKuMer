# 01 — Spesifikasi Kebutuhan Perangkat Lunak (SRS)

> **Status:** Aktif · **Revisi:** 2026-09-16 · **Acuan standar:** IEEE 830 (ringkas, disesuaikan proyek kecil)
> **Aplikasi:** Buku Induk Siswa Kurikulum Merdeka (SD & SMP) — `metadata.json`, `package.json`

## 1. Tujuan

Menggantikan buku induk fisik dengan aplikasi digital untuk SD & SMP Kurikulum Merdeka,
sehingga data siswa tercatat lengkap, konsisten dengan Dapodik, dapat direkap untuk
dinas/akreditasi, dan dapat dicetak sesuai standar — sambil tetap bisa dipakai offline
di lingkungan sekolah dengan koneksi terbatas.

## 2. Ruang Lingkup

**Masuk lingkup (7 pilar):**

| ID | Pilar | Inti |
|----|-------|------|
| P1 | Master data siswa | Identitas lengkap A–I ala ledger dinas |
| P2 | Nilai raport Kumer | Per mapel + deskripsi capaian otomatis, multi-tahun, kenaikan kelas |
| P3 | Sinkron Dapodik lokal | Tarik peserta didik + profil sekolah via Web Service Dapodik; mode simulasi saat offline |
| P4 | Rekapitulasi | Statistik rombel, agama, jalur PPDB, capaian P5 |
| P5 | Cetak standar dinas | Lembar buku induk, kartu pelajar, raport |
| P6 | Multi-user | Administrator vs operator (batas rombel) + impersonate |
| P7 | Offline-first | IndexedDB + PWA + backup/restore JSON (& Google Drive) |

**Di luar lingkup:** e-rapor resmi Dapodik/ARD, PPDB online, pembayaran/SPP, absensi harian
real-time, aplikasi mobile native.

**Catatan implementasi aktual (terverifikasi 2026-09-15):** di luar 7 pilar di atas,
kode sudah memuat (a) tab **Dasbor Operasional** (`OperatorDashboard.tsx` — antrean
tugas, sapaan, kelengkapan data, jalan pintas), (b) tab **Data GTK**
(`GtkView.tsx` — klasifikasi Guru/Tendik, rombel binaan, CRUD manual, ekspor CSV),
(c) **multi-sekolah** satu laptop banyak database (`SchoolEntry`, registry
`bukuinduk_schools`/`bukuinduk_active_school`, `ensureSchoolsInit`), dan
(d) dukungan `semesterId` pada seluruh proksi Dapodik (`withSemester`, `server.ts`).
Fitur-fitur ini didokumentasikan sebagai kebutuhan tambahan P8–P10 di bawah.

## 3. Definisi & Singkatan

- **Buku Induk:** ledger resmi berisi riwayat tiap siswa selama bersekolah.
- **Dapodik:** Data Pokok Pendidikan; Web Service lokal biasanya di `http://localhost:5774`.
- **Rombel:** rombongan belajar (mis. `7A`, `8B`).
- **P5:** Projek Penguatan Profil Pelajar Pancasila (6 dimensi).
- **Fase:** A (kls 1–2), B (3–4), C (5–6) untuk SD; D (7–9) untuk SMP.
- **Operator:** pengguna non-admin yang aksesnya dibatasi ke rombel tertentu.

## 4. Stakeholder

| Peran | Kepentingan |
|-------|-------------|
| Kepala sekolah | Data valid, rekap dinas/akreditasi, tanda tangan dokumen |
| Petugas buku induk / operator | Input cepat, tidak input ulang (sinkron Dapodik) |
| Administrator (IT/TU) | Kelola akun, backup, konfigurasi sinkron |
| Dinas pendidikan / asesor | Rekap statistik + cetakan standar |
| Wali kelas | Nilai raport + catatan + kenaikan kelas |

## 5. Kebutuhan Fungsional

### P1 — Master Data Siswa (`src/components/SiswaList.tsx`, `SiswaFormModal.tsx`, `SiswaDetailModal.tsx`)

| ID | Kebutuhan | Kriteria terima |
|----|-----------|-----------------|
| FR-P1-01 | CRUD siswa dengan segmen A–I: identitas, fisik/kesehatan, alamat, ayah/ibu/wali, asal sekolah, penerimaan, P5/ekskul/prestasi, riwayat semester, status akhir/mutasi | Semua segmen tersimpan ke `siswa` store dan tampil di detail |
| FR-P1-02 | Pencarian (nama/NISN/NIPD/NIK/nama ortu) + filter tingkat/rombel/gender/status | Hasil < 1 detik untuk 500 data (dengan pagination) |
| FR-P1-03 | Validasi identitas: NISN wajib 10 digit; NIK/No.KK 16 digit bila diisi; tolak NISN/NIK/NIPD duplikat (`src/utils/validation.ts`) | Pesan inline di field + toast; data duplikat tidak tersimpan |
| FR-P1-04 | Pagination 10/20/50 (default 20), nomor urut berkelanjutan, empty-state ganda (DB kosong vs filter kosong) | Navigasi halaman tidak me-reset filter |
| FR-P1-05 | Ekspor CSV daftar tersaring | File terunduh berisi baris sesuai filter |
| FR-P1-06 | Upload foto langsung dari kolom aksi (`SiswaList.tsx` tombol kamera + `src/utils/photo.ts`): crop tengah rasio 4:6 (maks 480×720 JPEG), kompres hingga ≤ 500 KB; hormati batas rombel operator; toast sukses/gagal | Foto tampil 4:6 di tabel/cetak; file mentah bukan gambar atau > 8 MB ditolak dengan pesan |

### P2 — Nilai Raport Kumer (`src/components/NilaiRaportView.tsx`, `src/utils/raportUtils.ts`, `src/utils/db.ts`)

| ID | Kebutuhan | Kriteria terima |
|----|-----------|-----------------|
| FR-P2-01 | Input nilai per mapel (0–100) + predikat otomatis (A ≥90, B ≥80, C ≥70, D <70) | Predikat terkalkulasi via `calculatePredikat` |
| FR-P2-02 | Deskripsi capaian tertinggi & perlu-peningkatan otomatis per mapel berdasar template SD Fase A / SD Fase B–C / SMP Fase D (`generateDeskripsiOtomatis`) | Deskripsi terisi dan dapat diedit manual |
| FR-P2-03 | Multi-tahun: raport per tahun ajaran + semester + tingkat + rombel; sinkron ke `riwayatSemester` saat simpan (`saveSiswaRaport`) | Riwayat semester konsisten dengan raport |
| FR-P2-04 | Promosi kenaikan massal (`promoteSiswaKenaikanKelas`): Naik/Tinggal/Lulus ke rombel & tahun ajaran target; riwayat mencatat tingkat+rombel+tahun **sebelum** promosi | Riwayat benar untuk siswa lama (bukan `diterimaDiTingkat`) |
| FR-P2-05 | Ekstrakurikuler, kehadiran (S/I/A), catatan wali, status kenaikan per raport | Tercetak pada lembar raport |

### P3 — Sinkron Dapodik Lokal (`src/components/DapodikSyncView.tsx`, `src/utils/dapodikSync.ts`, `server.ts`)

| ID | Kebutuhan | Kriteria terima |
|----|-----------|-----------------|
| FR-P3-01 | Konfigurasi host/port/NPSN/token/semester + tes koneksi + simpan | Pesan sukses/gagal jelas (toast + status inline) |
| FR-P3-02 | Tarik peserta didik + profil sekolah + rombel + PTK + pengguna; preview perbandingan baru/berbeda/sama sebelum diterapkan | Tidak ada data tertimpa tanpa pilihan eksplisit |
| FR-P3-03 | Terapkan pilihan: tambah siswa baru, perbarui yang berubah, simpan referensi rombel/PTK, buat akun operator dari pengguna Dapodik, catat `sync_logs` | Log memuat ditambahkan/diperbarui/dilewati; rombel lokal **tidak** ditimpa bila baris Dapodik tak membawa info rombel (`convertDapodikToSiswa` hanya menimpa `rombelSaatIni` bila `nama_rombel`/`rombongan_belajar` terisi) |
| FR-P3-04 | Mode simulasi (data mock) saat Dapodik offline | Alur identik dengan mode live |
| FR-P3-05 | Penanganan khas Dapodik: error terbungkus teks `HTTP/1.0 403…` + JSON, HTTP 200 palsu, alias method (`getGtk`/`getPTK`) | Pesan Indonesia yang menunjuk ke solusi (cek token/IP, restart Dapodik) |

### P4 — Rekapitulasi (`src/components/RekapitulasiView.tsx`)

| ID | Kebutuhan | Kriteria terima |
|----|-----------|-----------------|
| FR-P4-01 | Rekap per rombel (L/P/total + keterangan fase) | Total = jumlah data |
| FR-P4-02 | Rekap agama + jalur PPDB (jumlah + %) | Persentase konsisten |
| FR-P4-03 | Distribusi 6 dimensi P5 (SB/BSH/MB/BB) | Menghitung seluruh projek semua siswa pada cakupan akses user |
| FR-P4-04 | Kop + tanda tangan kepala sekolah & petugas; tombol cetak | Layout cetak rapi |

### P5 — Cetak Standar Dinas (`src/components/CetakBukuInduk.tsx`, tab `cetak` di `App.tsx`)

| ID | Kebutuhan | Kriteria terima |
|----|-----------|-----------------|
| FR-P5-01 | Mode cetak: lembar buku induk, raport per semester, kartu pelajar (3 template: dinas navy-emas, modern terang, minimal monokrom — pilih di pratinjau, `KartuPelajar.tsx`) | Pilihan mode + `window.print()` |
| FR-P5-05 | Ekspor Excel `.xlsx` via SheetJS lazy-load (`src/utils/excel.ts`, chunk terpisah): Master Siswa, Leger (matriks + rata-rata + peringkat), Rekap (4 sheet: Rombel/Agama/PPDB/P5), GTK — angka tetap numerik, lebar kolom otomatis | File terunduh; tanpa membengkakkan bundel utama |
| FR-P5-06 | Lembar induk per siswa ke Excel + Word (`src/utils/dokumenInduk.ts`, builder data tunggal A–I; `docx` lazy-load chunk terpisah): tombol Excel/Word di mode buku-induk | Tabel anti-terpotong, bisa diedit/dicetak ulang dari Office |
| FR-P5-07 | Kartu pelajar massal: centang siswa di Pusat Cetak → pratinjau A4 (10 kartu/halaman, 2×5 CR80) → template pilihan + toggle sisi belakang → Cetak (`CetakKartuMassal.tsx`, reusable `KartuDepan/Belakang`) | Potong rapi per kartu; seleksi lintas halaman | `.xlsx` via SheetJS lazy-load (`src/utils/excel.ts`, chunk terpisah): Master Siswa, Leger (matriks + rata-rata + peringkat), Rekap (4 sheet: Rombel/Agama/PPDB/P5), GTK — angka tetap numerik, lebar kolom otomatis | File terunduh; tanpa membengkakkan bundel utama |
| FR-P5-02 | Label adaptif SD/SMP (asal sekolah, ijazah, fase) | SD memakai istilah TK/PAUD & Fase A–C |
| FR-P5-03 | Pusat cetak: cari siswa → cetak/detail per kartu | Menghormati batas rombel operator |
| FR-P5-04 | Kop surat terpusat gaya dinas (`KopSurat` di profil + `KopSuratView.tsx` + `utils/kop.ts`): cukup unggah logo — baris 1/2 otomatis (otoritas kabupaten/kota/provinsi), judul hitam serif tegas bertingkat, alamat/kontak format dinas; opsional: teks custom, logo kanan, toggle elemen, garis, ukuran & font | Satu komponen dipakai lembar induk, transkrip raport, cetak raport & rekap; logo kartu pelajar ikut logo kiri bila ada |

### P6 — Multi-User (`src/components/LoginModal.tsx`, `UserManagementView.tsx`, `Navbar.tsx`, `src/utils/db.ts` akses)

| ID | Kebutuhan | Kriteria terima |
|----|-----------|-----------------|
| FR-P6-01 | Login username+password; akun seed: `administrator`, `operator_bukuinduk`, `operator_kesiswaan` | Sesi tersimpan; logout membersihkan sesi |
| FR-P6-02 | Operator dibatasi `rombelAkses` (kosong = semua); tab admin (`dapodik`, `pengaturan`, `backup`, `users`, `audit`) tertutup + ada notice akses ditolak | `canUserAccessRombel`/`filterSiswaByAccess` ditegakkan di simpan/hapus/tampil |
| FR-P6-03 | CRUD akun + reset password + cegah hapus administrator utama & akun sendiri | Validasi duplikat username |
| FR-P6-04 | Impersonate: admin dapat melihat sebagai operator; ada banner + tombol kembali | Sesi admin asli pulih utuh; mulai/selesai tercatat di audit |
| FR-P6-05 | Ganti password mandiri dari navbar | — |
| FR-P6-06 | Kunci login: 5x salah kata sandi → akun dikunci 15 menit (`src/utils/security.ts`); tampil sisa upaya & masa kunci di `LoginModal.tsx` | Kunci per database; sukses me-reset hitungan; upaya tercatat di audit |

### P13 — Audit Log & Cadangan Otomatis (`src/components/AuditLogView.tsx`, `BackupRestoreModule.tsx`, `src/utils/audit.ts`, `autoBackup.ts`, `src/utils/db.ts` store `audit_logs` + `auto_backup`, DB v7)

| ID | Kebutuhan | Kriteria terima |
|----|-----------|-----------------|
| FR-P13-01 | Audit otomatis: login/logout/gagal/dikunci, CRUD akun + password, impersonate, tambah/ubah/hapus siswa, tutup/buka tahun, sinkron terapkan, backup/restore/reset | Tiap aksi tercatat (aktor, waktu, ringkasan); maks 2000 entri, ikut backup/restore |
| FR-P13-02 | Tab Log Audit (admin): filter aksi/entitas/pencarian + pagination + ekspor CSV + kosongkan (konfirmasi danger) | Operator ditolak + kembali ke Dasbor |
| FR-P13-03 | Auto-backup: snapshot JSON penuh tiap interval (default aktif 60 menit, pilihan 15/30/60/120/240), maks 5 terbaru, penjadwal diam di `App.tsx` | Snapshot dapat diunduh/dipulihkan/dihapus dari kartu Backup; DB kosong dilewati |

### P14 — Mutasi, Leger & Restore Selektif (`src/components/MutasiWizard.tsx`, `LegerNilaiView.tsx`, `BackupRestoreModule.tsx` MODUL 4, `src/utils/db.ts`)

| ID | Kebutuhan | Kriteria terima |
|----|-----------|-----------------|
| FR-P14-01 | Wizard mutasi keluar: pilih siswa aktif → dokumen (sekolah tujuan wajib, tanggal, no. surat, alasan) → konfirmasi; status jadi `Mutasi Keluar` + dokumen tersimpan | Siswa keluar tak muncul di roster aktif; tercatat di audit |
| FR-P14-02 | Wizard mutasi masuk: identitas (nama wajib, NISN 10 digit unik, NIK 16 digit unik bila diisi) → asal & penerimaan (`jenisPendaftaran: 'Pindahan'`, `jalurMasuk: 'Mutasi/Pindahan'`, rombel tujuan) → konfirmasi | Siswa baru Aktif di rombel tujuan; tercatat di audit |
| FR-P14-03 | Wizard menghormati batas rombel operator (pilihan & target disaring `canUserAccessRombel`) | Operator tak bisa mutasi di luar rombelnya |
| FR-P14-04 | Leger nilai (tab semua peran): filter tahun+semester+tingkat+rombel; matriks siswa × mapel (template + aktual), rata-rata, peringkat kompetisi, predikat; ekspor CSV + cetak | Nilai <70 ditandai; tanpa raport = baris kosong + tanpa peringkat |
| FR-P14-05 | Restore selektif: pilih file backup → ringkasan rombel + jumlah → centang → upsert per id dalam satu transaksi (`saveSiswaBulk`) | Dilaporkan +baru/~diperbarui; non-pilihan tak tersentuh; tercatat di audit |

### P15 — Sinkron Cloud Antar-Perangkat (`src/utils/cloudSync.ts`, `firebaseApp.ts`, `tombstone.ts`, MODUL 5 Backup, `firestore.rules`, `storage.rules`)

Satu data untuk semua laptop via Firebase tier gratis (tanpa kartu kredit).
Rumah cloud `cloud/{NPSN-penuh-atau-nama-DB}`; konflik last-write-wins per record.

| ID | Kebutuhan | Kriteria terima |
|----|-----------|-----------------|
| FR-P15-01 | Verifikasi 2 lapis: login Google + PIN sekolah (hash PBKDF2, min 4 karakter); PIN per sesi tab | Tanpa keduanya tombol sinkron nonaktif; PIN salah ditolak |
| FR-P15-02 | Unggah/Unduh/Sinkron Penuh + progres: siswa, akun, rombel, PTK, tutup tahun, peta kelas, profil | Hanya yang baru/berubah ditulis (baca-banding dulu, batch ≤400) |
| FR-P15-03 | Hapus merambat via tombstone 30 hari (`catatHapusCloud` di tiap delete) | Data terhapus tak hidup lagi; edit sesudah-hapus menghidupkan lagi |
| FR-P15-04 | Foto data-URL dikecilkan jadi mini JPEG ≤60KB (`fotoMini`, tanpa Storage); dokumen >900KB dilewati + peringatan | Foto asli penuh tetap di perangkat; perangkat tanpa foto memakai mini sebagai fallback tampil |
| FR-P15-05 | TIDAK ikut sinkron: config Dapodik (per-mesin), sync_logs, audit_logs, snapshot, kunci login | Tercantum di UI + tercatat di audit (`cloud_unggah/unduh/sinkron`) |

### P7 — Offline-First & Backup (`src/utils/db.ts`, `BackupRestoreModule.tsx`, `PengaturanSekolahView.tsx`)

| ID | Kebutuhan | Kriteria terima |
|----|-----------|-----------------|
| FR-P7-01 | Seluruh data di IndexedDB (`BukuInduk_Merdeka_DB` v3) + fallback localStorage | Aplikasi dapat dibuka & dipakai tanpa internet |
| FR-P7-02 | PWA terinstal (manifest `BukuInduk`, service worker generateSW) | Ikon + mode standalone |
| FR-P7-03 | Backup JSON lokal (unduh) + restore (impor) + reset contoh + kosongkan DB (konfirmasi danger) | Restore invalid ditolak dengan pesan |
| FR-P7-04 | Backup/restore via Google Drive (Firebase Auth + scope `drive.file`, `src/utils/googleDriveAuth.ts`, `googleDriveService.ts`, config `firebase-applet-config.json`) | Gagal auth menampilkan pesan, bukan crash |
| FR-P7-05 | Indikator offline + tombol instal PWA (`OfflineIndicator.tsx`, `PWAInstallButton.tsx`, `useOnlineStatus.ts`, `usePWAInstall.ts`) | — |

### P8 — Dasbor Operasional & GTK (`src/components/OperatorDashboard.tsx`, `GtkView.tsx`, `DashboardStats.tsx`)

| ID | Kebutuhan | Kriteria terima |
|----|-----------|-----------------|
| FR-P8-01 | Dasbor Operasional: sapaan waktu, antrean (data belum lengkap, raport semester aktif kosong, tanpa foto), jalan pintas tambah/lihat/cetak, ringkasan sinkron terakhir | Angka konsisten dengan `visibleSiswa` + `syncLogs[0]` |
| FR-P8-02 | Data GTK: daftar PTK hasil sinkron, klasifikasi Guru/Tendik (`getGtkKategori`), rombel binaan (`getRombelBinaan`), tambah/ubah/hapus manual (`savePtkRef`/`deletePtkRef`, source `manual`), ekspor CSV | CRUD manual bertahan di IndexedDB + localStorage + cache memori |
| FR-P8-03 | Navigasi 12 tab (`TAB_META` di `App.tsx`): `dasbor, siswa, raport, rekap, cetak, referensi, gtk, arsip` (semua peran) + `dapodik, pengaturan, backup, users` (admin via dropdown topbar, sidebar 8 menu utama) | Operator yang memaksa URL/tab admin ditolak + dikembalikan ke Dasbor (`AccessDeniedNotice`) |

### P9 — Multi-Sekolah (`src/utils/db.ts`, `src/main.tsx`, `PengaturanSekolahView.tsx`)

| ID | Kebutuhan | Kriteria terima |
|----|-----------|-----------------|
| FR-P9-01 | Registry `SchoolEntry` (`id, nama, npsn, jenjang, dbName, createdAt/updatedAt`) di localStorage `bukuinduk_schools`; sekolah aktif di `bukuinduk_active_school`; NPSN non-kosong unik (validasi UI + `createSchoolEntry`) | `getSchools`/`getActiveSchool`/`createSchoolEntry`/`setActiveSchool` berfungsi; duplikat ditolak dengan pesan |
| FR-P9-02 | Tiap sekolah punya database IndexedDB sendiri (`BukuInduk_Merdeka_DB` untuk sekolah pertama/legacy, `BukuInduk_Merdeka_DB_<schoolId>` untuk tambahan); fallback localStorage di-scope per-DB; hapus fisik opsional (IDB + kunci ter-scope + cache memori) | Data antar-sekolah tidak tercampur; `deleteSchoolEntry(id, {deletePhysical})` membersihkan tuntas |
| FR-P9-03 | Boot: `main.tsx` menjalankan `ensureSchoolsInit()` (mengadopsi DB lama sebagai sekolah pertama) → `initStorage()` sebelum render; provisi DB baru sesuai jenjang (`provisionSchoolDatabase`, SD memakai `presetSekolahSD`) + opsi data contoh | Instalasi lama tetap terbaca; sekolah SD baru ter-seed profil SD |
| FR-P9-04 | UI khusus administrator: pemilih di topbar + sidebar + kartu Profil Sekolah (`SchoolSwitcher.tsx`, `SchoolManagerModal.tsx`); tambah (nama/NPSN/jenjang + opsi contoh), jadikan aktif, hapus (registry/fisik); lencana jumlah siswa per-DB (`getSchoolSiswaCount`) | Operator tidak melihat pemilih; ganti sekolah mereset tab ke Dasbor + membersihkan modal |
| FR-P9-05 | Sesi lintas-sekolah: `switchActiveSchool()` mempertahankan login bila username sama aktif di DB target, selain itu paksa login ulang; impersonate selalu dibersihkan | Tidak ada kebocoran akun operator antar-sekolah |

### P10 — Arsip Tahun Ajaran (`src/components/ArsipView.tsx`, `src/utils/arsip.ts`, `src/utils/db.ts` store `tutup_tahun`)

Ritme Dapodik tiap tahun: ada yang lulus, ada murid baru. NISN/NIK/NIPD stabil;
rombel & status bergerak. Aturannya: tutup & kunci tahun lama **dahulu** (lulusan
diabadikan, kelas berjalan dipromosi), **kemudian** sinkron Dapodik (murid baru
masuk; lulusan tak lagi muncul di Dapodik dan tidak terhapus/terubah).

| ID | Kebutuhan | Kriteria terima |
|----|-----------|-----------------|
| FR-P10-01 | Tutup tahun (admin): pilih tahun tutup + tahun aktif baru, rencana promosi per rombel (Lulus otomatis tingkat akhir 6/9, Naik/Tinggal dapat diubah, target rombel terisi otomatis preserving-huruf) | Snapshot roster+ringkasan tersimpan SEBELUM promosi; promosi menulis riwayat tahun lama |
| FR-P10-02 | Kunci arsip: simpan raport tahun terkunci ditolak (toast + chip gembok); promosi melewati siswa yang tahun terakhirnya terkunci; buka kunci hanya admin (tanpa rollback otomatis) | Data arsip tak berubah retroaktif |
| FR-P10-03 | Tab Arsip (semua peran lihat; operator sebatas rombelnya): daftar tahun terkunci + ringkasan + roster terpaginasi + cetak; ritme Dapodik dijelaskan di panel | Cetak arsip hanya berisi roster tahun itu |
| FR-P10-04 | Sinkron sadar-arsip: flag `arsip` pada baris cocok/berbeda yang berstatus non-Aktif (chip + catatan); converter tak pernah mengubah `statusSiswa` dan tak menimpa rombel tanpa info Dapodik; siswa baru bawaan `jenisPendaftaran: 'Siswa Baru'` | Lulusan tak "hidup kembali" / pindah kelas akibat sync |

### P11 — Pemetaan Kelas (`src/components/PemetaanKelasView.tsx`, store `peta_kelas`, khusus administrator)

Daftar rombel resmi per tahun ajaran (tahun + kelas + wali). Acuan target promosi
di wizard arsip (saran + penanda di luar pemetaan) dan validasi rombel.

| ID | Kebutuhan | Kriteria terima |
|----|-----------|-----------------|
| FR-P11-01 | CRUD baris (tahun `YYYY/YYYY`, tingkat, rombel unik per tahun, wali kelas autocomplete dari data GTK, opsional) + tombol tambah/salin/generate | Duplikat rombel per tahun ditolak; toast sukses/gagal tiap aksi |
| FR-P11-02 | Salin tahun lain ke tahun tujuan (lewati yang sudah ada) + bangkitkan dari rombel data siswa | Jumlah disalin/dilewati dilaporkan |
| FR-P11-03 | Tahun terkunci arsip tidak dapat diubah (tambah/ubah/hapus/salin-masuk/generate ditolak) | Kunci `tutup_tahun` dihormati |
| FR-P11-04 | Tab khusus admin (dropdown topbar + `adminOnlyTabs`); ikut backup/restore per-DB | Operator ditolak + kembali ke Dasbor |
| FR-P11-05 | Pemilihan siswa pada kelas terpilih: klik baris → panel anggota (nama, NISN, NIPD, rombel) + pencarian + pilih banyak + pindahkan ke kelas tujuan (konfirmasi, hormat tahun terkunci) | Rombel anggota diperbarui + toast ringkasan pindah/ditahan |
| FR-P11-06 | Petakan mundur (rekonstruksi kohort): dari roster tahun sumber, bangkitkan baris N tahun sebelumnya; tingkat digeser turun, huruf rombel dipertahankan (`9A`→`8A`→`7A`); di bawah minimal (SD 1 / SMP 7) tidak dipetakan; preview badge per baris + konfirmasi; sumber wajib = sesi aktif (target masa lalu dikecualikan dari guard sesi) | Duplikat per tahun dilewati; tahun terkunci ditolak; wali dikosongkan; toast merinci dibuat/dilewati |
| FR-P11-07 | Anggota arsip otomatis + koreksi individu dua arah: baris hasil Petakan Mundur langsung terisi anggota + cap riwayat personal; Tambah anggota mencap bila belum tercatat; Keluarkan membuang cap rekonstruksi tahun itu (catatan asli seperti raport tak pernah disentuh) — panel arsip tanpa mengubah rombel aktif siswa | Cetak/arsip tahun lalu punya roster; kunci arsip dihormati |

### P12 — Tema Tampilan (`src/utils/tema.ts`, `src/index.css`, kartu di `PengaturanSekolahView.tsx`)

Aksen biru untuk SMP, maroon untuk SD. Otomatis mengikuti jenjang, dapat dikunci
manual. Hanya administrator yang dapat mengubah (kartu pengaturan ada di Profil
Sekolah yang memang khusus admin). Hanya berlaku di layar; cetakan tidak ikut.

| ID | Kebutuhan | Kriteria terima |
|----|-----------|-----------------|
| FR-P12-01 | Resolver `resolveTemaEfektif`: `biru`/`maroon` manual menang, `otomatis` → SD maroon / SMP biru; diterapkan via `data-tema` di root | Ganti jenjang/pengaturan langsung mengubah seluruh aksen tanpa reload |
| FR-P12-02 | Blok CSS maroon (`@media screen`, `:root[data-tema="maroon"]`): tombol primer, badge, sidebar, utilitas blue/navy/indigo → maroon; emas dipertahankan | Tidak ada aksen biru tersisa di layar pada tema maroon |
| FR-P12-03 | Mode tampilan terang/gelap/otomatis (`src/utils/tema.ts`, blok `:root[data-mode="dark"]` di `src/index.css`, khusus `@media screen`): toggle topbar untuk semua peran (terang→gelap→otomatis), preferensi per perangkat, otomatis mengikuti sistem secara live | Cetakan tidak ikut gelap; default terang (tanpa perubahan perilaku lama) |

### Aturan Sesi Aktif — cutoff data (lintas pilar, `src/utils/sesi.ts`)

Sesi efektif = sesi login, fallback tahun aktif profil. Semua yang bertahun di
atas sesi tidak tampil; tulis berdimensi tahun hanya tepat pada sesi.

| ID | Kebutuhan | Kriteria terima |
|----|-----------|-----------------|
| FR-S01 | Roster: siswa yang seluruh catatannya > sesi disembunyikan; campuran tampil; tanpa catatan tampil (netral) | `siswaTerlihatSesi` di `visibleSiswa` |
| FR-S02 | Dropdown & record tahun (raport, leger, arsip, pemetaan, cetak, histori) dibatasi ≤ sesi | `tahanMaksSesi` / `opsiTahunMaksSesi`; opsi masa depan hilang |
| FR-S03 | Tulis ditolak bila tahun ≠ sesi (`cekTulisTahun` + pesan "pindah sesi dulu"): simpan/promosi raport, baris pemetaan — kecuali Petakan Mundur yang sumbernya wajib = sesi dan targetnya memang masa lalu | Koreksi tahun lama = turunkan sesi dulu |
| FR-S04 | Siswa baru manual: dialog konfirmasi masuk ke TA sesi + cap riwayat awal = sesi; wizard mutasi: tanggal wajib satu TA dengan sesi | Tanpa data "nyasar tahun" diam-diam |
| FR-S05 | Tutup/buka tahun hanya dalam sesi tahun tersebut; Terapkan-Dapodik diblokir bila sesi < tahun aktif profil (preview/test tetap boleh) | Ritual tahun terkunci pada tahunnya |
| FR-S06 | Pindah sesi dicatat di audit (`sesi_pindah`); operator boleh pindah sesi, tampilan tetap ≤ sesi | Jejak perpindahan tahun tersedia |

## 6. Kebutuhan Non-Fungsional

| ID | Kategori | Target |
|----|----------|--------|
| NFR-01 | Kinerja | Daftar 500 siswa tetap responsif (pagination + filter termemo) |
| NFR-02 | Keandalan | Crash satu panel tidak mematikan app (`ErrorBoundary`); `lint` + `build` wajib lolos tiap perubahan |
| NFR-03 | Keamanan | Password tersimpan sebagai hash PBKDF2-HMAC-SHA256 (`src/utils/password.ts`: fallback SHA-256 iterasi di konteks non-aman); migrasi transparan dari plaintext lama saat boot/login/restore; hash tidak disimpan di sesi (`src/utils/db.ts : setCurrentUserSession`); proteksi rombel di semua jalur tulis |
| NFR-04 | Usability | Tanpa `alert`/`confirm`/`prompt` native — memakai toast + dialog konfirmasi (`src/utils/notify.ts`); setiap form wajib: (a) validasi input wajib sebelum simpan (`src/utils/validation.ts`: identitas, profil sekolah, akun, GTK, raport, Dapodik, entri sekolah), (b) toast sukses/gagal tiap aksi simpan/hapus, (c) atribut `required` + penanda `*` pada input wajib; progres atas (`TopProgressBar` + `src/utils/progress.ts`) tampil tiap boot/reload/ganti tab |
| NFR-05 | Portabilitas | Chrome/Edge terbaru, desktop + mobile 360px; cetak A4/F4 |
| NFR-06 | Keterpeliharaan | Perubahan kode memperbarui dokumen terkait dalam PR yang sama (lihat `docs/README.md`) |

## 7. Batasan & Asumsi

1. Web Service Dapodik hanya dapat dijangkau dari mesin yang menjalankan Dapodik (Express bertindak sebagai proxy agar bebas CORS). Seluruh endpoint proksi mendukung `semesterId` opsional via `withSemester` (`server.ts`).
2. Skema respons Dapodik berbeda antar versi → konverter memakai banyak alias field (`toDapodikList`, `unwrapDapodikRecord`, `asList`, `asSingleObject`); respons kosong dicatat sebagai warning/console.warn, bukan error.
3. Password tersimpan sebagai hash (`src/utils/password.ts`); kredensial bawaan di
   `initialUsersList` di-hash saat seed/migrasi — tetap ganti password bawaan saat serah terima.
4. Repo **sudah menyertakan `@types/react` + `@types/react-dom`** (`package.json` — terverifikasi). `ErrorBoundary.tsx` memakai `Component` + `ReactNode` standar dari `react`; tidak ada pola `ComponentBase` di kode saat ini.

## 8. Glosarium

Ledger, Rombel, NPSN/NSS, NISN/NIPD/NIK, P5, Fase A–D, PPDB (Zonasi/Afirmasi/Prestasi/Perpindahan), Semester Ganjil/Genap, Impersonate.
