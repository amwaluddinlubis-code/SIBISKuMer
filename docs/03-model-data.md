# 03 — Model Data

> **Status:** Aktif · **Revisi:** 2026-09-15 · **Sumber kebenaran:** `src/types/index.ts`, `src/utils/db.ts`

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

## 2. Store IndexedDB (`BukuInduk_Merdeka_DB`, versi 5)

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

## 3. Kamus Entitas

### 3.1 `Siswa` — segmen A–I (ledger dinas)

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

`{ app, version, exportedAt, sekolah, dapodikConfig, siswa[], syncLogs[], users?[], rombel?[], ptk?[], tutupTahun?[], petaKelas?[] }`.
Restore menolak payload tanpa array `siswa` yang valid; `tutupTahun`/`petaKelas` opsional (backup lama tetap terbaca).

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

## 4. Aturan Validasi (`src/utils/validation.ts`)

| Field | Aturan |
|-------|--------|
| `namaLengkap` | wajib, disimpan uppercase |
| `nisn` | wajib, tepat 10 digit angka, unik |
| `nik` | opsional; bila diisi 16 digit angka + unik |
| `nipd` | opsional; 3–20 karakter + unik bila diisi |
| `noKk` | opsional; bila diisi 16 digit angka |
| Umum | mode edit mengecualikan record sendiri; error tampil inline + toast pertama |

## 5. Data Seed (`src/data/initialData.ts`) — terverifikasi

5 siswa contoh (`sis-001`…; lintas rombel + raport multi-semester), 3 akun
(`administrator` / `administrator`, `operator_bukuinduk` rombel 7A,7B,8A,8B,9A,9B,
`operator_kesiswaan` rombel 7A,7B — password `operator123`),
profil SMP (`SMP NEGERI 1 MERDEKA BELAJAR`, NPSN `20104567`) + preset SD
(`presetSekolahSD`), serta data mock Dapodik (5 peserta didik, 4 rombel, 3 PTK,
2 pengguna — sesuai `mockDapodikPesertaDidik/Rombel/Ptk/Pengguna`).
