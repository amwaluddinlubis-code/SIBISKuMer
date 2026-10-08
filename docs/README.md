# Dokumentasi Pengembangan — Buku Induk Siswa Kurikulum Merdeka (SD & SMP)

> Aplikasi pengganti buku induk fisik menjadi aplikasi digital untuk jenjang SD & SMP
> Kurikulum Merdeka. Dokumen ini adalah pintu masuk seluruh dokumentasi teknis.

## Daftar Dokumen

| No | Dokumen | Isi | Pembaca utama |
|----|---------|-----|---------------|
| 01 | [Spesifikasi Kebutuhan (SRS)](01-srs.md) | Tujuan, ruang lingkup 7 pilar, kebutuhan fungsional + kriteria terima, kebutuhan non-fungsional, batasan, glosarium | Semua pihak |
| 02 | [Arsitektur & Desain (SDD)](02-arsitektur.md) | Tumpukan teknologi, diagram konteks/kontainer/komponen (13 tab + Dasbor Operasional + GTK + Arsip + Pemetaan), aliran data, multi-sekolah, keputusan arsitektur (ADR) | Pengembang |
| 03 | [Model Data](03-model-data.md) | ERD, skema IndexedDB v4, kamus entitas A–I + SchoolEntry multi-sekolah + arsip TutupTahunAjaran, aturan validasi, versi & migrasi DB | Pengembang |
| 04 | [Kontrak API Backend](04-api.md) | Endpoint Express, param semesterId, format request/response, error handling, metode Web Service Dapodik | Pengembang, integrasi |
| 05 | [Operasional & SOP](05-operasional.md) | Instalasi, env, skrip, SOP backup/restore, SOP tutup tahun ajaran (ritme Dapodik), matriks peran, troubleshooting Dapodik | Operator, admin |
| 06 | [Roadmap Pengembangan](06-roadmap.md) | Status Tahap 1–2 (selesai, termasuk Dasbor/GTK/multi-sekolah), backlog Tahap 3–5, definisi selesai (DoD) | Pengembang, pemilik produk |

## Konvensi Dokumen

- **Status tiap dokumen:** `Aktif` (selalu diperbarui saat kode berubah) — cantumkan tanggal revisi di kepala tiap file.
- **Bahasa:** Indonesia. Istilah teknis Inggris ditulis apa adanya (`store`, `endpoint`, `build`).
- **Acuan kode:** setiap klaim perilaku wajib menyebut path file + nama fungsi/komponen (mis. `src/utils/db.ts : promoteSiswaKenaikanKelas`).
- **Aturan perubahan:** ubah kode → perbarui dokumen terkait dalam PR yang sama. Dokumen yang kedaluwarsa diberi label `KEDALUWARSA` di kepala file.
- **Verifikasi baku:** setiap perubahan kode wajib lolos `npm run lint` (`tsc --noEmit`) dan `npm run build`.

## Ringkasan 7 Pilar (tujuan utama aplikasi)

1. **Master data siswa** — ledger digital A–I ala dinas.
2. **Nilai raport Kumer** — per mapel + deskripsi capaian otomatis, multi-tahun.
3. **Sinkron Dapodik lokal** — tarik data via Web Service (port 5774) + mode simulasi.
4. **Rekapitulasi** — statistik rombel/agama/PPDB/P5 untuk dinas & akreditasi.
5. **Cetak standar dinas** — lembar buku induk, kartu pelajar, raport.
6. **Multi-user** — administrator vs operator (batas rombel) + impersonate.
7. **Offline-first** — IndexedDB + PWA + backup/restore JSON (& Google Drive).

Rincian tiap pilar ada di `01-srs.md` (kebutuhan) dan `02-arsitektur.md` (realisasi teknis).

> **Catatan kondisi aktual (2026-09-16, terverifikasi dari kode):** navigasi kini 15 tab
> (`dasbor, siswa, raport, leger, rekap, cetak, referensi, gtk, arsip` untuk semua peran +
> `dapodik, pemetaan, pengaturan, backup, users, audit` khusus administrator via dropdown topbar —
> `src/components/Navbar.tsx`, `src/App.tsx : TAB_META`); ada modul **Dasbor Operasional**
> (`OperatorDashboard.tsx`), **Data GTK** (`GtkView.tsx` + CRUD manual
> `savePtkRef`/`deletePtkRef`), **Arsip Tahun Ajaran** (`ArsipView.tsx`: tutup tahun,
> promosi massal, roster terkunci, ritme tutup-dulu-sinkron-kemudian), kontrol pagination bersama (`PageControl.tsx`),
> serta **multi-sekolah** (satu laptop banyak DB — `SchoolEntry`, `ensureSchoolsInit`,
> `src/utils/db.ts`, `src/main.tsx`). Repo kini **menyertakan `@types/react` +
> `@types/react-dom`** sehingga klaim lama "tanpa @types/react / pola ComponentBase"
> sudah kedaluwarsa — `ErrorBoundary.tsx` memakai `Component` React standar.
