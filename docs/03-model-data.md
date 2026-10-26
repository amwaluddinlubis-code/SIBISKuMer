# 03 — Model Data

> **Status:** Aktif · **Revisi:** 2026-10-25 · **Sumber kebenaran:** `src/types/index.ts`, `src/utils/db.ts`, `server/db.ts`

> **Catatan Issue #2 (Dasbor pusat kendali):** tidak ada perubahan model
> data. Dasbor hanya membaca field `Siswa` yang sudah ada
> (status/rombel/tanggal diterima & keluar/surat/dokumen/raport). Dua
> batasan model yang sengaja didokumentasikan, bukan ditambal dengan
> angka karangan: (a) tidak ada antrean persetujuan mutasi — mutasi
> langsung mengubah status; (b) tidak ada tanggal tenggat laporan yang
> tersimpan, jadi widget tenggat tidak menampilkan tanggal karangan.

## 1. ERD (tekstual)

```text
SekolahProfile (1) ----< Siswa (N) ----< RaportSemester (N) ----< NilaiMataPelajaran (N)
     |                        |----< P5Project (N), EkstrakurikulerItem (N),
     |                        |      PrestasiItem (N), RiwayatSemester (N),
     |                        |      RiwayatTahunAjaran (N)
     |                        |
     +---- DapodikConfig (1)  +---- statusSiswa (Aktif/Lulus/Mutasi Keluar/...)
     +---- DapodikSyncLog (N)
AppUser (N, independen; rombelAkses[] merujuk nama rombel pada Siswa.rombelSaatIni)
RombelRef (N) · PtkRef (N) — referensi hasil sinkron, dirujuk by-name oleh form;
           GTK manual (source 'manual') via savePtkRef/deletePtkRef
SchoolEntry (registry multi-sekolah, di localStorage — bukan IndexedDB)
```

Relasi bersifat logis (tanpa foreign key DB): `RaportSemester.siswaId → Siswa.id`,
`RombelRef.nama ↔ Siswa.rombelSaatIni`, `RombelRef.waliKelas ↔ PtkRef.nama`
(`getRombelBinaan`), `AppUser.rombelAkses[] ↔ Siswa.rombelSaatIni`.

## 2. Store IndexedDB (`BukuInduk_Merdeka_DB`, versi 8)

| Store | keyPath | Indeks | Isi |
|-------|---------|--------|-----|
| `siswa` | `id` | `nisn`, `nipd`, `rombelSaatIni`, `statusSiswa` | `Siswa[]` |
| `sekolah` | `id` (`'main'`) | — | Satu `SekolahProfile` |
| `config` | `id` (`'main'`) | — | Satu `DapodikConfig` |
| `sync_logs` | `id` | `timestamp` | `DapodikSyncLog[]` (terbaru dulu) |
| `users` | `id` | `username` (unique), `role` | `AppUser[]` |
| `rombel` | `id` | `nama` | `RombelRef[]` |
| `ptk` | `id` | `nama`, `nip` | `PtkRef[]` |
| `tutup_tahun` | `tahunAjaran` | — | `TutupTahunAjaran[]` (arsip terkunci per tahun) |
| `peta_kelas` | `id` | `tahunAjaran`, `rombel` | `PetaKelas[]` (rombel resmi per tahun) |
| `audit_logs` (DB v7) | `id` | `timestamp`, `aksi` | `AuditLog[]` (maks 2000 di IDB; cermin localStorage 300 terbaru) |
| `auto_backup` (DB v7) | `id` | `timestamp` | `AutoBackupSnapshot[]` (snapshot otomatis + pengaman pra-restore) |
| `tenggat_tugas` (DB v8) | `id` | `tanggalJatuhTempo`, `status` | `TugasAdministrasi[]` (kalender tenggat) |

> Riwayat versi: `audit_logs` + `auto_backup` masuk di v7, `tenggat_tugas`
> di v8. Upgrade IndexedDB menambah store baru tanpa menghapus store lama.

Fallback: `localStorage` kunci `bukuinduk_*` (siswa, sekolah, config, logs, users, rombel,
ptk, current_user, impersonate_from) + registry `bukuinduk_schools` /
`bukuinduk_active_school`. Kunci data di-scope per-DB via `sk()` (DB lama memakai
kunci global agar kompatibel). Cache lapis-3: memori sesi `memFallback`
(`<dbName>::<store>`) — dipakai bila IDB + LS sama-sama gagal (iframe sandbox).
Versi DB naik → tambah store/indeks di
`onupgradeneeded` (`src/utils/db.ts`), jangan menghapus store lama tanpa migrasi.

## 2a. Multi-Sekolah (`SchoolEntry`, bukan store IndexedDB)

| Field | Isi |
|-------|-----|
| `id` | `sch-<base36>-...` |
| `nama`, `npsn`, `jenjang`, `bentukPendidikan?` | Disalin dari `SekolahProfile`; dijaga selaras saat profil disimpan (`PengaturanSekolahView`, `App.handleUpdateSekolah`) |
| `dbName` | `BukuInduk_Merdeka_DB` (sekolah pertama/legacy) atau `BukuInduk_Merdeka_DB_<schoolId>` |
| `createdAt`, `updatedAt` | ISO string |

API: `getSchools`, `getActiveSchool(Id)`, `createSchoolEntry` (NPSN unik),
`createSchoolWithDatabase` + `provisionSchoolDatabase(entry, {withSample})`
(seed profil jenjang — SD memakai `presetSekolahSD` — + config NPSN + users;
siswa contoh opsional), `saveSchoolEntry`,
`deleteSchoolEntry(id, {deletePhysical})` (+ `deleteIndexedDatabase`,
`clearScopedLocalStorage`, `clearMemFallbackForDb`),
`setActiveSchool`, `switchActiveSchool` (set + `initStorage` + validasi sesi,
mengembalikan `{entry, keptSession}`), `ensureSchoolsInit` (adopsi DB lama bila registry kosong),
`getActiveDbName`, `getSchoolSiswaCount(dbName)`. Hapus fisik DB menyusul bila diminta eksplisit.

## 2b. Skema SQLite (mode server, Fase S1 — `server/db.ts`)

Penyimpanan mode server: driver `node:sqlite`, mode WAL + `synchronous NORMAL`,
`SKEMA_VERSI = 1`. Folder data dari env `SIBISKUMER_DATA_DIR` (bawaan `<cwd>/data`;
kemasan desktop: `<userData>/data`). Entitas berbentuk JSON utuh disimpan per baris —
kolom identitas diekstrak untuk indeks/penyaringan, isi entitas pada kolom payload.

**Registry** (`bukuinduk-registry.db`):

| Tabel | Isi |
|-------|-----|
| `sekolah_registry` | `id` (PK; sekolah bawaan `utama`), `nama`, `dibuat_pada` |
| `sesi` | `token` (PK, acak 32-byte hex), `sekolah_id`, `user_id`, `dibuat_pada`, `impersonator_id` (NULL bila bukan menyamar), `token_induk` (token sesi admin asal saat menyamar) |
| `kunci_login` | `sekolah_id` + `username` (PK gabungan), `gagal` (hitungan), `terkunci_sampai` (ISO; kunci 15 menit setelah 5x gagal) |
| `meta` | `kunci` (PK), `nilai` (JSON) |

**Per sekolah** (`bukuinduk-<idSekolah>.db`, id disanitasi `idSekolahAman`):

| Tabel | Isi |
|-------|-----|
| `meta` | `kunci` (PK), `nilai` (JSON): `profil_sekolah`, `config:<kunci>`, `seed_awal` (penanda penanaman awal), `skema`, `data_nyata` (penanda basis data sudah dipakai menulis — bersama `seed_awal` menentukan status `benihAwal` untuk penawaran migrasi) |
| `siswa` | `id` (PK), `nisn`, `rombel` (rombelSaatIni), `payload` (JSON `Siswa` utuh) |
| `users` | `id` (PK), `username` (unik), `payload` (JSON `AppUser` termasuk hash password — field password tidak pernah keluar API, dibuang `userPublik`) |
| `baris` | Koleksi generik: `entitas` (`rombel`/`ptk`/`peta_kelas`/`tutup_tahun`/`sync_logs`/`audit_logs`), `id`, `payload` (JSON); PK (`entitas`, `id`) |
| `snapshot` | Snapshot di dalam basis data (termasuk pengaman impor `pengaman-impor-<ts>` dan `pengaman-restore`): `id` (PK), `dibuat_pada`, `jumlah_siswa`, `payload` |

**Snapshot berkas** (bukan tabel): berkas `.db` hasil `VACUUM INTO` di
`snapshots/<idSekolah>/snap-<YYYYMMDD-HHMMSS>-<label>.db` (label: `otomatis`,
`pra-pulih`, atau nama pembuat); pemulihan mengganti berkas sekolah dan
membatalkan semua sesinya. Penanaman awal (`pastikanSiap` di `server/auth.ts`,
idempoten): registry `utama` + profil/config bawaan + users `initialUsersList`
(ter-hash) + siswa contoh — hanya bila penanda `seed_awal` belum ada.

## 3. Kamus Entitas

### 3.1 `Siswa` — segmen A–I (ledger dinas)

> **Aturan kejujuran data (QA Fase 0, Okt 2026):** field faktual yang belum
> diisi bernilai kosong (`''` / `0` / `[]`) — BUKAN nilai karangan. Ketiga
> jalur pembuatan siswa (form wizard, impor CSV/Excel, sinkronisasi Dapodik)
> dilarang mengisi bawaan faktual seperti tanggal lahir `2011-01-01`, RT/RW
> `01`, pekerjaan orang tua, status hidup orang tua, jalur masuk, agama,
> riwayat kesehatan `Tidak ada`, ukuran badan, maupun penilaian P5/ekskul
> beserta predikatnya. Tipe `agama`, `statusDalamKeluarga`, `tinggalDengan`,
> `transportasiKeSekolah`, `jalurMasuk`, dan `status` orang tua secara resmi
> mengizinkan `''` (= belum diisi); tampilan/cetak menampilkan `—`/`-` untuk
> nilai kosong. Placeholder form hanyalah contoh berawalan "Contoh:", bukan nilai.

| Segmen | Field kunci |
|--------|-------------|
| A. Identitas | `namaLengkap`, `namaPanggilan`, `jenisKelamin` (L/P), `nisn` (10 digit, unik), `nipd` (unik), `nik` (16 digit, unik bila diisi), `noKk`, `noAktaLahir`, ttl, `agama` (Select kode Dapodik 1–7/99 + `Lainnya`), kewarganegaraan, anak-ke/saudara, status keluarga, bahasa, `fotoUrl` (dataURL/URL) |
| B. Fisik | `golonganDarah`, `tinggiBadan`, `beratBadan`, `lingkarKepala?`, riwayat penyakit, kelainan, kebutuhan khusus |
| C. Alamat | jalan, rt/rw, dusun, kelurahan–provinsi, kode pos, `tinggalDengan` (Select kode 1–5/10/99 + Pesantren), jarak, `transportasiKeSekolah` (Select kode Dapodik 1/3–8/11–14/99) |
| D. Ortu/wali | `ayah{}` + `ibu{}` (nama, nik, tahun lahir, `pendidikan` Select kode D, `pekerjaan` Select kode E, `penghasilan` Select kode F, telepon, status hidup); `wali?` (+ hubungan, alamat) |
| E. Asal sekolah | `asalSdMi`, `npsnSdMi`, `noIjazahSd`, `tahunLulusSd`, `lamaBelajarSd` (label adaptif TK/PAUD untuk SD) |
| F. Penerimaan | `tanggalDiterima`, `diterimaDiTingkat/Rombel`, **`rombelSaatIni`** (otorisasi + filter), `jalurMasuk`, `jenisPendaftaran?` (Select: Siswa Baru/Pindahan/Kembali Bersekolah), mutasi? |
| G. Kumer | `hobi?`/`citaCita?` (Select kode G/H), `p5Projects[]` (tema, fase, dimensi 6 predikat, catatan), `ekstrakurikuler[]`, `prestasi[]` |

Tabel kode di `src/data/referensi.ts`, Select bersama di `src/components/KodeSelect.tsx`
(label "kode – uraian"; nilai lama tak dikenal tetap tampil sebagai "(data lama)").
| H. Semester/raport | `riwayatSemester[]`, `nilaiRaport[]` (`RaportSemester`), `riwayatTahunAjaran[]` |
| I. Status akhir | `statusSiswa`, tanggal/alasan keluar, sekolah tujuan, surat mutasi, ijazah |
| Meta | `dapodikId?`, `createdAt`, `updatedAt`, `lastSyncedWithDapodik?` |

### 3.2 `RaportSemester`

`id`, `siswaId`, `tahunAjaran` (mis. `2026/2027`), `semester` (1/2), `tingkat`, `rombel`,
`fase?`, wali kelas + NIP, `tanggalRaport`, `nilaiMapel[]` (`mataPelajaran`, `kategori`
Wajib/Pilihan/Muatan Lokal, `nilaiAkhir` 0–100, `predikat` A/B/C/D, `capaianTertinggi`,
`capaianPerluPeningkatan`), `rataRataNilai?`, ekstrakurikuler ringkas, `kehadiran{S,I,A}`,
`catatanWaliKelas?`, `statusKenaikan?`, `naikKeTingkat?`. Unik logis per
(siswa, tahunAjaran, semester) — `saveSiswaRaport` melakukan upsert.

### 3.3 Riwayat

- `RiwayatSemester`: S/I/A + `statusKenaikan` (Belum Ditentukan/Naik/Tinggal/Lulus/Tidak Lulus) + catatan wali. Disinkron otomatis dari raport.
- `RiwayatTahunAjaran`: `tahunAjaran`, `tingkat`, `rombel`, `waliKelas?`, `statusAkhirTahun?`/`statusKenaikan?`, `catatan?`. **Mencatat kondisi sebelum promosi** (hasil perbaikan Tahap 1).

### 3.4 `SekolahProfile`

nama, npsn, nss, `jenjang?` (SD/SMP), bentuk, status Negeri/Swasta, alamat–kodepos,
telepon/email/website, kepala sekolah + NIP, petugas buku induk + NIP, `logoUrl?`,
`semesterAktif`, `tahunAjaran`, `lastSyncedWithDapodik?`, `syncSource?`,
`kop?` (`KopSurat` — ikut backup/restore & multi-sekolah per-DB; profil lama tanpa
kop memakai bawaan `resolveKop`),
`penomoran?` (`PenomoranDokumen` — aturan penomoran dokumen surat per template,
Issue #4; lihat §3.4b),
`tema?` (`TemaKustom { mode: otomatis|biru|maroon }` — hanya administrator yang
mengubah; resolver `resolveTemaEfektif` di `utils/tema.ts`).

### 3.4a `KopSurat` (kop surat cetakan — `src/utils/kop.ts`, `KopSuratView.tsx`)

`baris1?`/`baris2?` (kosong = otomatis; baris 1 mengikuti `otoritas`
`kabupaten|kota|provinsi`, cth. `PEMERINTAH KABUPATEN MANDAILING NATAL`),
`fontJudul` (`serif` tegas standar dinas / `sans`), `tampilBaris1/2`,
`logoKiriUrl?` (dataURL ≤ 500 KB via `processLogoImage`, kosong = emblem generik;
transparansi dipertahankan sebagai PNG — hanya bila tetap tidak muat diekspor
JPEG bermatte putih agar menyatu dengan kertas; tampil setinggi blok judul),
`tampilLogoKiri`, `logoKananMode` (`badge|gambar|sembunyi`, bawaan `sembunyi`
ala kop dinas) + `logoKananUrl?`,
`tampilAlamat/Kontak/Website` (format dinas: `Alamat : … Kec. … Kab. … Prov. …` /
`NPSN : … Email : … Kode Pos. …`), `garis` (`ganda|tunggal|tanpa`),
`ukuranNama` (`normal|besar`). Dipakai: lembar induk, transkrip raport, cetak
raport, rekapitulasi (logo kartu pelajar ikut logo kiri bila ada).

### 3.4b `PenomoranDokumen` (aturan penomoran surat — Issue #4)

`SekolahProfile.penomoran?`: per template surat (`keterangan-aktif` |
`pindah-keluar` | `panggilan-ortu` | `daftar-rombel`) berisi
`PenomoranTemplate { pola, nomorTerakhir }`. `pola` memakai placeholder
`{no}` (nomor urut apa adanya), `{no3}` (nomor urut 3 digit),
`{bulan}` (2 digit), `{bulanRomawi}`, `{tahun}` (dari tanggal surat).
Pola bawaan (contoh awal, wajib disesuaikan sekolah):
`{no}/SK-AKTIF/{bulanRomawi}/{tahun}`, `{no}/SK-PINDAH/{bulanRomawi}/{tahun}`,
`{no}/SP-ORTU/{bulanRomawi}/{tahun}`, `{no}/DAFTAR-ROMBEL/{bulanRomawi}/{tahun}`.
Saran nomor = `nomorTerakhir + 1`; tombol “Tandai nomor terpakai” (khusus
administrator) menaikkan `nomorTerakhir` dan tidak pernah menurunkannya.
Selain pola, operator dapat menulis nomor lengkap manual (untuk cetak ulang
dengan nomor tercatat). Profil lama tanpa `penomoran` memakai bawaan.

### 3.5 `AppUser` / `DapodikConfig` / `DapodikSyncLog` / Referensi / Multi-Sekolah

- `AppUser`: `username` (unik, lowercase), `password` (⚠️ plaintext — lihat roadmap),
  `namaLengkap`, `role`, email/telepon/jabatan, `rombelAkses?[]`, `status`, login terakhir.
- `DapodikConfig`: `ip` (default `localhost`), `port` (default 5774), `npsn`, `token`,
  `semesterId` (default `20261`), `autoSync`. Nilai seed: `localhost:5774`,
  NPSN `20104567` (`src/data/initialData.ts : defaultDapodikConfig`).
- `DapodikSyncLog`: `timestamp`, `status` (success/warning/error), `totalDapodik`,
  `ditambahkan`, `diperbarui`, `dilewati`, `pesan`, `detail?`.
- `RombelRef`/`PtkRef`: `dapodikId?`, nama/nip/nik/jenis, `source` (`dapodik|manual`), `updatedAt`. Tulis gabung via `putAllToStore` (baca-gabung-tulis satu siklus agar IDB konsisten dengan LS); GTK manual via `savePtkRef` (normalisasi id `ptk-manual-*` + `updatedAt`) dan `deletePtkRef` (membersihkan IDB + LS + memori).

### 3.6 Format backup (`BackupPayload`, versi `1.3.0`)

`{ app, version, exportedAt, integritas?, sekolah, dapodikConfig, siswa[], syncLogs[], users?[], rombel?[], ptk?[], tutupTahun?[], petaKelas?[] }`.

- **`integritas?`** (Issue #10): `{ algoritma: 'SHA-256', checksum, jumlah, dibuatPada }`.
  Checksum = SHA-256 (hex) atas string kanonik payload tanpa blok integritas
  (`src/utils/backupIntegrity.ts`: kunci objek terurut, array tetap berurutan);
  `jumlah` = jumlah record per koleksi saat ekspor. Backup lama tanpa blok ini
  tetap terbaca (status `tanpa-checksum` + peringatan).
- **Restore menolak sebelum mutasi apa pun** (`importBackupData`, fail-fast):
  file terenkripsi, bukan JSON, `app` bukan SIBISKuMer, `version` hilang /
  bukan semver / lebih baru dari format yang didukung, struktur tidak valid
  (tanpa array siswa, duplikat id siswa / username), checksum atau jumlah
  tercatat tidak cocok, NPSN beda tanpa konfirmasi, atau snapshot pengaman
  gagal dibuat. `tutupTahun`/`petaKelas` opsional (backup lama tetap terbaca).
- **Snapshot pengaman & rollback:** sebelum mutasi, kondisi saat ini disimpan
  sebagai snapshot auto-backup berlabel `pengaman-restore` (hanya yang terbaru
  dipertahankan; tidak pernah digusur pruning snapshot otomatis). Bila tulis
  atau verifikasi pasca-restore gagal, rollback otomatis ke snapshot pengaman
  (`RestoreResult.rollback`); verifikasi membandingkan jumlah siswa, id yang
  diharapkan hadir, dan kecocokan NPSN profil (`RestoreResult.verifikasi`).
  Restore selektif (`importSelectiveSiswa`) memakai perlindungan yang sama
  (checksum bila ada + snapshot pengaman + rollback).

### 3.7 `TutupTahunAjaran` / `RosterArsip` (arsip terkunci)

- `TutupTahunAjaran`: `tahunAjaran` (kunci, `2026/2027`), `ditutupPada`, `ditutupOleh?`,
  `tahunAktifBaru?`, `ringkasan` (`totalSiswa`, `perTingkat`, `perRombel`, `lulus/naik/tinggal/mutasi`),
  `roster[]` (potret pra-promosi: `siswaId`, nama, nisn, tingkat, rombel, status).
- CRUD: `getTutupTahun` / `saveTutupTahun` / `deleteTutupTahun` (buka kunci; tanpa rollback promosi).
- Kunci dipakai `NilaiRaportView` (`tahunTerkunci`) dan helper `isTahunTerkunci` (`utils/arsip.ts`;
  plus `tahunBerikutnya`, `tingkatAkhir`, `rombelTarget`, `buildSnapshot`).

### 3.8 `PetaKelas` (pemetaan rombel resmi per tahun)

`id`, `tahunAjaran`, `tingkat`, `rombel` (unik per tahun, uppercase),
`waliKelas?`, `updatedAt`, `source` (`manual|generate`). CRUD:
`getAllPetaKelas` / `savePetaKelasList` / `savePetaKelas` / `deletePetaKelas`.
Dipakai wizard arsip sebagai saran target (`ArsipView : saranRombelBaru`).

### 3.9 `TugasAdministrasi` / `PengaturanKalender` (kalender tenggat — Issue #8)

`TugasAdministrasi`: `id`, `judul` (≤120), `deskripsi?` (tanpa data pribadi
siswa), `tanggalJatuhTempo` (`YYYY-MM-DD`; `''` = tanpa tenggat),
`kategori?`, `status` (`belum|selesai`), `penanggungJawab?` (username),
`rombel?`, `tautanAksi?` (id tab internal), `prioritas?`, `dibuatOleh`,
`dibuatPada`, `diubahPada`, `selesaiPada?`, `selesaiOleh?`. CRUD:
`getAllTenggat` / `saveTenggat` / `deleteTenggat` (store `tenggat_tugas`,
DB v8 + cermin localStorage ter-scope). Logika murni di
`src/utils/kalender.ts` (status, pengingat, otorisasi, anti-duplikat).

`PengaturanKalender` (per perangkat, localStorage ter-scope, bukan backup):
`zonaWaktu` (IANA), `ingatkanHariSebelum` (0–30), `ingatkanTerlambat`,
`kanal` (selalu `'dalam_aplikasi'`). Kunci pengingat terkirim
(`PengingatTerkirim`, maks 500): `getPengingatTerkirim` /
`tambahPengingatTerkirim` (idempoten).

### 3.10 `RiwayatMutasi` (riwayat mutasi & status — Issue #5)
`RiwayatMutasi` (di `src/types/index.ts`, logika murni di
`src/utils/mutasi.ts`): `id`, `siswaId`, `jenis` (`masuk` | `keluar` |
`ubah_status` | `lulus` | `batal`), `statusSebelum` (null untuk `masuk`),
`statusSesudah`, `tanggalEfektif` (`YYYY-MM-DD`), `alasan` (wajib),
`sekolahAsal?`, `sekolahTujuan?`, `noSurat?`, `dokumen` (referensi dokumen
pendukung), `operatorId?`, `operatorNama?`, `dicatatPada` (ISO, waktu
pencatatan — dapat berbeda dari tanggal efektif bila dicatat susulan),
`kunciIdempotensi`, `dibatalkanOleh?`, `dibatalkanPada?`,
`membatalkanId?` (untuk jenis `batal`).

Penyimpanan: **menempel di record `Siswa`** (`siswa.riwayatMutasi`), BUKAN
store baru — sehingga berlaku di kedua mode tanpa migrasi (IndexedDB:
satu `put` per record; server: payload JSON utuh). Status baru + entri
riwayat selalu ditulis dalam SATU objek siswa (satu `saveSiswa`): gagal
simpan = tidak ada perubahan sama sekali (tanpa kegagalan parsial).

Aturan yang dipegang:
- **Append-only.** Entri lama tidak pernah diubah/dihapus. Satu-satunya
  penanda yang boleh ditambahkan kemudian adalah `dibatalkanOleh` /
  `dibatalkanPada` pada entri yang dibatalkan.
- **Transisi diizinkan** (`TRANSISI_DIIZINKAN`): `Aktif` → `Mutasi Keluar` /
  `Mengundurkan Diri` / `Meninggal Dunia` / `Lulus`. Status non-Aktif
  bersifat final; hanya entri `batal` yang mengembalikan ke `Aktif`.
- **Idempotensi.** Kunci = `siswaId|jenis|tanggalEfektif|statusSesudah|noSurat`
  (noSurat dinormalisasi huruf kecil). Pengiriman ulang dengan kunci sama
  adalah no-op (dikembalikan sebagai `sudahAda`), bukan duplikat.
- **Tanggal batas.** Tanggal efektif wajib format valid, tidak melebihi
  hari ini (WIB), dan — bila sesi aktif tersedia — memetakan ke tahun
  ajaran sesi tersebut (batas 1 Juli: 30 Juni = TA lama, 1 Juli = TA baru).
- **Laporan periode lalu tidak berubah.** Fungsi mutasi tidak pernah
  menyentuh `riwayatTahunAjaran` / `riwayatSemester` yang sudah ada.
  Pembatalan tidak menghapus entri tahun berjalan; jejaknya hanya ada di
  `riwayatMutasi` + Log Audit.
- **Duplikasi.** NISN ganda ditolak saat mutasi masuk (diperiksa di wizard
  DAN diulang saat apply); nomor surat mutasi yang sudah dipakai siswa
  lain ditolak (nomor dari entri yang sudah dibatalkan bebas dipakai lagi).
- **Audit.** Setiap peristiwa menulis Log Audit: `mutasi_masuk`,
  `mutasi_keluar`, `mutasi_status`, `mutasi_batal` (dengan sebelum/sesudah).
  Bila audit gagal setelah siswa tersimpan, aplikasi menampilkan
  peringatan (tidak diam) — riwayat di record siswa menjadi jejak
  rekonsiliasi.

### 3.11 Rencana promosi & rollback (Issue #6)

Logika murni di `src/utils/promosi.ts`; rencana (`RencanaRombel` di
`ArsipView.tsx`) per rombel lama: `tingkat`, `rombel`, `ids` (siswa),
`status` (`Naik Kelas` | `Tinggal di Kelas` | `Lulus`), `nextTingkat`,
`nextRombel`, `kecuali?` (pengecualian: `{ id, alasan }`).

Aturan yang dipegang:
- **Validasi sebelum tulis** (`validasiRencanaPromosi`, dijalankan di
  wizard sebagai kotak validasi live DAN diulang handler terhadap data
  segar): id ganda antar rombel, id tak dikenal (isolasi tenant: id
  sekolah lain tidak diterapkan), siswa non-Aktif dalam rencana, siswa
  aktif yang belum ditempatkan (bukan pengecualian), rombel kosong,
  tingkat/rombel baru invalid, tingkat akhir hanya Lulus (Naik dilarang),
  non-akhir dilarang Lulus, satu rombel tujuan hanya untuk satu tingkat,
  dan kapasitas (bila `PetaKelas.kapasitas` tersedia untuk rombel tujuan
  tahun baru). Error memblokir tombol eksekusi dan penerapan.
- **Pengecualian.** Siswa yang ditahan/dikecualikan (dengan alasan wajib)
  tetap Aktif di rombel lama dan tidak dihitung hilang.
- **Kapasitas.** `PetaKelas.kapasitas?` (opsional; tanpa nilai = tidak
  dibatasi), diisi di form Pemetaan Kelas dan dipakai validator untuk
  rombel tujuan tahun baru.
- **Idempoten.** Entri promosi dikenali dari pola catatan
  `Kenaikan ke rombel … TP <tahunBaru>` + `tahunAjaran` = tahun yang
  ditutup. Penerapan ulang melewati siswa yang sudah dipromosi (tanpa
  entri ganda) dan tetap dapat mengunci tahun yang gagal terkunci.
- **Rollback** (`batalkanPromosi`): menghapus entri promosi tahun
  tersebut, mengembalikan rombel lama & status Aktif. Siswa yang
  statusnya berubah non-Aktif setelah promosi tidak disentuh. Syarat
  handler: hanya administrator, hanya dalam sesi tahun yang dibatalkan,
  dan hanya bila belum ada promosi tahun yang lebih baru (tahun aktif
  masih `tahunAktifBaru` kunci tersebut). Rollback mengembalikan tahun
  aktif ke tahun yang dibatalkan; semester tidak diubah (operator
  menyesuaikan bila perlu). Pemetaan Kelas tahun baru tidak disentuh.
- **Riwayat lama tidak berubah.** Penerapan hanya menambah satu entri
  `riwayatTahunAjaran` per siswa; rollback hanya menghapus entri
  promosi tahun itu; entri tahun lain dan roster arsip tidak disentuh.

## 4. Aturan Validasi (`src/utils/validation.ts`)

Impor Excel/CSV memakai aturan yang sama + aturan berkas (`src/utils/imporSiswa.ts`):
maks 5 MB / 2000 baris; rombel wajib format `7A`; sel kosong pada perbarui =
"tidak diubah"; duplikat kunci di dalam berkas ditolak; konflik identitas
(NISN vs NIK menunjuk siswa berbeda) dilewati.

| Field | Aturan |
|-------|--------|
| `namaLengkap` | wajib, disimpan uppercase |
| `nisn` | wajib, tepat 10 digit angka, unik |
| `nik` | opsional; bila diisi 16 digit angka + unik |
| `nipd` | opsional; 3–20 karakter + unik bila diisi |
| `noKk` | opsional; bila diisi 16 digit angka |
| Umum | mode edit mengecualikan record sendiri; error tampil inline + toast pertama |

### 4a. Aturan Pemeriksa Data (`src/utils/pemeriksaData.ts`, Issue #3)

Satu-satunya sumber kebenaran aturan adalah konstanta `ATURAN_PEMERIKSA` di
`src/utils/pemeriksaData.ts` (ID, kategori, prioritas, judul, penjelasan).
Pengguna dapat menonaktifkan aturan per sekolah aktif dari tab Pemeriksa Data
(tersimpan di localStorage, kunci `bukuinduk_pemeriksa_konfig_<NPSN>`); tidak
ada aturan tersembunyi di UI. Cek per-record hanya untuk siswa **Aktif**
(arsip historis dikecualikan); cek duplikat berlaku untuk **semua** record.

| ID aturan | Kategori | Prioritas | Aturan |
|-----------|----------|-----------|--------|
| `nama-kosong` | wajib | tinggi | Nama lengkap kosong |
| `nisn-kosong` | wajib | tinggi | NISN kosong |
| `nisn-format` | format | tinggi | NISN bukan tepat 10 digit angka |
| `nik-format` | format | sedang | NIK bukan 16 digit angka bila diisi |
| `nokk-format` | format | rendah | No. KK bukan 16 digit angka bila diisi |
| `nipd-format` | format | rendah | NIPD di luar 3–20 karakter bila diisi |
| `nik-ortu-format` | format | rendah | NIK ayah/ibu bukan 16 digit angka bila diisi |
| `tgl-lahir-kosong` | wajib | sedang | Tanggal lahir kosong |
| `tgl-lahir-format` | format | tinggi | Tanggal lahir tidak valid (YYYY-MM-DD) atau masa depan |
| `rombel-kosong` | wajib | sedang | Rombel saat ini kosong |
| `alamat-kosong` | wajib | rendah | Alamat kosong |
| `kodepos-format` | format | rendah | Kode pos bukan 5 digit angka bila diisi |
| `lahir-setelah-diterima` | konflik | tinggi | Tanggal lahir setelah tanggal diterima |
| `usia-diterima-tidak-wajar` | konflik | sedang | Usia saat diterima di luar 4–18 tahun |
| `tanggal-keluar-aktif` | konflik | sedang | Status Aktif tetapi tanggal keluar terisi |
| `pindahan-tanpa-asal` | konflik | sedang | Pindahan tetapi asal mutasi kosong |
| `nik-ortu-sama` | konflik | sedang | NIK ayah sama dengan NIK ibu |
| `anakke-rentang` | rentang | rendah | Anak ke di luar 1–30 |
| `fisik-rentang` | rentang | rendah | Tinggi 50–220 cm / berat 5–200 kg |
| `jarak-rentang` | rentang | rendah | Jarak ke sekolah di luar 0–150 km |
| `lama-sd-rentang` | rentang | rendah | Lama belajar SD di luar 0–12 tahun |
| `tahun-lahir-ortu-rentang` | rentang | rendah | Tahun lahir ortu di luar 1900–tahun berjalan |
| `duplikat-nisn` | duplikat | tinggi | NISN sama persis pada 2 record |
| `duplikat-nik` | duplikat | tinggi | NIK sama persis pada 2 record |
| `duplikat-nipd` | duplikat | sedang | NIPD sama persis pada 2 record |
| `duplikat-kemungkinan` | duplikat | sedang | Nama persis + tanggal lahir sama, NISN berbeda |
| `duplikat-nama-mirip` | duplikat | sedang | Nama beda ≤2 huruf (Levenshtein) + tanggal lahir sama |

Temuan duplikat selalu berstatus "kemungkinan" — aplikasi tidak pernah
menggabungkan/menghapus otomatis. Keterbatasan yang diketahui: nama umum
Indonesia + tanggal lahir sama bisa menandai dua anak berbeda (mis. kembar
dengan nama mirip); karena itu tanggal lahir wajib sama persis dan nama saja
tidak pernah cukup untuk temuan duplikat. Status penanganan temuan disimpan
di localStorage (`bukuinduk_pemeriksa_status_<NPSN>`): hanya ID temuan +
status + alasan — tanpa nama/NISN/NIK siswa (privasi, lihat §4e
`docs/05-operasional.md`).

## 5. Data Seed (`src/data/initialData.ts`) — terverifikasi

5 siswa contoh (`sis-001`…; lintas rombel + raport multi-semester), 3 akun
(`administrator` / `administrator`, `operator_bukuinduk` rombel 7A,7B,8A,8B,9A,9B,
`operator_kesiswaan` rombel 7A,7B — password `operator123`),
profil SMP (`SMP NEGERI 1 MERDEKA BELAJAR`, NPSN `20104567`) + preset SD
(`presetSekolahSD`), serta data mock Dapodik (5 peserta didik, 4 rombel, 3 PTK,
2 pengguna — sesuai `mockDapodikPesertaDidik/Rombel/Ptk/Pengguna`).
