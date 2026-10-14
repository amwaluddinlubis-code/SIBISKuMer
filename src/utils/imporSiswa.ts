// ---------------- IMPOR EXCEL/CSV SISWA (Issue #11) ----------------
// Modul MURNI (tanpa DOM / IndexedDB / toast) agar dapat diuji di Node:
// parsing CSV, pemetaan kolom, validasi per baris, rekonsiliasi terhadap
// data yang ada, rencana penerapan, laporan error, dan template impor.
//
// Kontrak penting (sesuai issue):
// - TIDAK ADA mutasi data di sini: fungsi-fungsi hanya menghitung. Mutasi
//   hanya terjadi di komponen UI setelah pengguna mengonfirmasi pratinjau,
//   lewat saveSiswaBulk dalam satu transaksi + snapshot pengaman.
// - Perbarui HANYA field yang terpetakan DAN sel file-nya tidak kosong
//   (sel kosong = "tidak diubah", tidak pernah mengosongkan data lama).
// - "Beda" (data lama vs file berbeda) TIDAK pernah digabung otomatis:
//   keputusan default = lewati; pengguna memilih eksplisit per baris atau
//   massal di pratinjau.
// - Tidak ada log data siswa di sini (jangan console.log baris impor).

import type { Siswa } from '../types';
import { validateIdentitasSiswa } from './validation';

// ---------------- Batasan berkas ----------------

/** Maksimal ukuran berkas impor: 5 MB (cukup untuk ~2000 baris). */
export const IMPOR_MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Maksimal baris data per berkas (di luar header). */
export const IMPOR_MAX_BARIS = 2000;
export const IMPOR_EKSTENSI_DIDUKUNG = ['.csv', '.xlsx'] as const;

/** Validasi nama + ukuran berkas SEBELUM dibaca. Daftar pesan; kosong = OK. */
export function validasiFileImpor(namaFile: string, ukuranBytes: number): string[] {
  const errs: string[] = [];
  const nama = (namaFile || '').trim().toLowerCase();
  const ekstensi = IMPOR_EKSTENSI_DIDUKUNG.find((e) => nama.endsWith(e));
  if (!ekstensi) {
    errs.push(
      `Format berkas tidak didukung: "${namaFile || '(tanpa nama)'}". ` +
        `Hanya ${IMPOR_EKSTENSI_DIDUKUNG.join(' dan ')} yang diterima.`
    );
  }
  if (!Number.isFinite(ukuranBytes) || ukuranBytes <= 0) {
    errs.push('Berkas kosong (0 byte) — tidak ada data untuk diimpor.');
  } else if (ukuranBytes > IMPOR_MAX_FILE_BYTES) {
    errs.push(
      `Berkas terlalu besar (${(ukuranBytes / 1024 / 1024).toFixed(1)} MB). ` +
        `Maksimal ${IMPOR_MAX_FILE_BYTES / 1024 / 1024} MB — bagi berkas menjadi beberapa bagian.`
    );
  }
  return errs;
}
