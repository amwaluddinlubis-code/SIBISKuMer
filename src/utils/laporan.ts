// ---------------- PUSAT LAPORAN (Issue #7) ----------------
// Logika murni laporan administratif: filter, agregasi, baris ekspor,
// metadata laporan, dan builder CSV. Tanpa efek samping (tanpa DOM,
// tanpa unduhan) kecuali `unduhCsv` — sehingga seluruhnya dapat diuji
// di Node dengan `tsx --test`.
//
// Batasan yang ditegakkan di sini (bukan hanya di UI):
// - Otorisasi: `rombelAkses` diterapkan di `saringLaporan` pada
//   `rombelSaatIni`, cermin `filterSiswaByAccess` (db.ts, F16: siswa
//   tanpa rombel tetap terlihat operator). Daftar yang sudah tersaring
//   inilah satu-satunya sumber pratinjau & ekspor — ekspor tidak pernah
//   membaca daftar siswa mentah.
// - Privasi: TIDAK ADA kolom NIK, No. KK, alamat lengkap, atau nomor
//   telepon di baris laporan mana pun. Identitas yang tampil hanya
//   nama + NISN/NIPD + rombel — cukup untuk administrasi dinas.
// - Satu sumber kebenaran: pratinjau, cetak, Excel, dan CSV semuanya
//   dibangun dari `saringLaporan` + builder yang sama untuk filter yang
//   sama, sehingga isi laporan selalu cocok dengan yang ditampilkan.
// - Laporan di sini adalah agregat/daftar administratif, BUKAN surat
//   (generator dokumen/surat adalah scope issue #4 — tidak diduplikasi).
// - Laporan temuan validasi memakai validator yang SUDAH ADA
//   (`validateIdentitasSiswa`) + cek kelengkapan — bukan pemeriksa baru
//   (pemeriksa adalah scope issue #3 — tidak dibangun ulang).
// - PDF: tidak ada generator PDF native. "PDF" = dialog cetak browser
//   (Cetak → Save as PDF). Komponen UI wajib menulis keterangan ini
//   secara jujur, bukan mengklaim dukungan PDF native.

import { Siswa, SekolahProfile, StatusSiswa } from '../types';
import { validateIdentitasSiswa } from './validation';
import { rombelPadaTahun, siswaTerlibatTahun } from './sesi';

/** Jenis laporan yang didukung Pusat Laporan. */
export type JenisLaporan =
  | 'statistik'
  | 'daftar-siswa'
  | 'mutasi-masuk'
  | 'mutasi-keluar'
  | 'belum-lengkap'
  | 'temuan-validasi';

export const JENIS_LAPORAN: Array<{ jenis: JenisLaporan; judul: string; deskripsi: string }> = [
  { jenis: 'statistik', judul: 'Statistik Siswa', deskripsi: 'Rekap per rombel (L/P/X), agama, jalur PPDB, dan status.' },
  { jenis: 'daftar-siswa', judul: 'Daftar Siswa', deskripsi: 'Daftar siswa tersaring (nama, NISN, NIPD, rombel, status).' },
  { jenis: 'mutasi-masuk', judul: 'Mutasi Masuk', deskripsi: 'Siswa pindahan yang diterima (jenis pendaftaran Pindahan / jalur Mutasi/Pindahan).' },
  { jenis: 'mutasi-keluar', judul: 'Mutasi Keluar', deskripsi: 'Siswa berstatus Mutasi Keluar beserta sekolah tujuan & surat.' },
  { jenis: 'belum-lengkap', judul: 'Data Belum Lengkap', deskripsi: 'Field wajib yang masih kosong per siswa (untuk dilengkapi TU).' },
  { jenis: 'temuan-validasi', judul: 'Temuan Validasi', deskripsi: 'Semua temuan: data belum lengkap + format salah + duplikat + logika tanggal.' },
];

export function judulLaporan(jenis: JenisLaporan): string {
  return JENIS_LAPORAN.find((j) => j.jenis === jenis)?.judul || 'Laporan';
}

/** Filter laporan: nilai 'semua' berarti tanpa filter pada sumbu itu. */
export interface FilterLaporan {
  jenis: JenisLaporan;
  /** Tahun ajaran "2026/2027" atau 'semua'. */
  tahunAjaran: string;
  /** Nama rombel ("7A") atau 'semua'. */
  rombel: string;
  /** Status siswa atau 'semua'. */
  status: 'semua' | StatusSiswa;
}

/** Nilai awal filter: sesi login (atau tahun aktif) + semua rombel + Aktif. */
export function filterLaporanAwal(sessionTahun: string | null | undefined, tahunAktif: string): FilterLaporan {
  return { jenis: 'statistik', tahunAjaran: (sessionTahun || tahunAktif || '').trim() || 'semua', rombel: 'semua', status: 'Aktif' };
}

function normalisasi(v: string | undefined | null): string {
  return (v || '').trim();
}

/** Tahun ajaran efektif filter: '' = semua tahun. */
export function tahunFilter(filter: FilterLaporan): string {
  const t = normalisasi(filter.tahunAjaran);
  return t.toLowerCase() === 'semua' || t === '' ? '' : t;
}

/** Opsi tahun ajaran dari data siswa + tahun aktif (terurut menurun). */
export function daftarTahunLaporan(siswa: Siswa[], tahunAktif: string): string[] {
  const set = new Set<string>();
  const tambah = (v: unknown) => {
    const t = normalisasi(typeof v === 'string' ? v : '');
    if (/^\d{4}\/\d{4}$/.test(t)) set.add(t);
  };
  tambah(tahunAktif);
  for (const s of siswa || []) {
    for (const r of s.riwayatSemester || []) tambah((r as { tahunAjaran?: string }).tahunAjaran);
    for (const r of s.nilaiRaport || []) tambah((r as { tahunAjaran?: string }).tahunAjaran);
    for (const r of s.raportSemester || []) tambah((r as { tahunAjaran?: string }).tahunAjaran);
    for (const r of s.riwayatTahunAjaran || []) tambah((r as { tahunAjaran?: string }).tahunAjaran);
  }
  return [...set].sort().reverse();
}

/** Opsi rombel dari data siswa pada tahun filter (terurut). */
export function daftarRombelLaporan(siswa: Siswa[], tahun: string, tahunAktif: string): string[] {
  const set = new Set<string>();
  for (const s of siswa || []) {
    const r = rombelPadaTahun(s, tahun || null, tahunAktif);
    if (r && r !== '-') set.add(r);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * Saring siswa untuk laporan: (1) otorisasi rombel, (2) keterlibatan
 * tahun, (3) rombel pada tahun filter, (4) status. Urutan diurutkan
 * berdasarkan nama agar pratinjau & ekspor deterministik.
 */
export function saringLaporan(
  siswa: Siswa[],
  filter: FilterLaporan,
  opts: { tahunAktif: string; rombelAkses?: string[] }
): Siswa[] {
  const akses = (opts.rombelAkses || []).map((r) => normalisasi(r)).filter(Boolean);
  const tahun = tahunFilter(filter);
  const rombel = normalisasi(filter.rombel);
  const status = normalisasi(filter.status);
  const hasil = (siswa || []).filter((s) => {
    // (1) Otorisasi: operator hanya melihat rombelnya; siswa tanpa rombel
    // lolos (cermin F16 di filterSiswaByAccess) — tanpa ini ekspor
    // bisa membocorkan data lintas rombel/tenant.
    if (akses.length > 0 && s.rombelSaatIni && !akses.includes(s.rombelSaatIni)) return false;
    // (2) Tahun ajaran.
    if (tahun && !siswaTerlibatTahun(s, tahun)) return false;
    // (3) Rombel pada tahun filter.
    if (rombel && rombel.toLowerCase() !== 'semua') {
      if (rombelPadaTahun(s, tahun || null, opts.tahunAktif) !== rombel) return false;
    }
    // (4) Status.
    if (status && status.toLowerCase() !== 'semua') {
      if ((s.statusSiswa || 'Aktif') !== status) return false;
    }
    return true;
  });
  return hasil.sort((a, b) => (a.namaLengkap || '').localeCompare(b.namaLengkap || ''));
}

// ---------------- Metadata laporan ----------------

export interface MetaLaporan {
  judul: string;
  /** Parameter filter dalam satu baris, untuk dicetak di laporan. */
  parameter: string;
  dibuatPada: Date;
  /** Label waktu pembuatan (id-ID, lengkap). */
  dibuatPadaLabel: string;
  /** Sumber data: nama + NPSN sekolah + basis penyimpanan lokal. */
  sumber: string;
  /** Periode data (tahun ajaran / semua tahun). */
  periode: string;
  /** Jumlah baris isi laporan (untuk ringkasan ekspor). */
  jumlahBaris: number;
}

export function formatWaktuLaporan(d: Date): string {
  try {
    return d.toLocaleString('id-ID', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return d.toISOString();
  }
}

export function metaLaporan(args: {
  judul: string;
  filter: FilterLaporan;
  jumlahBaris: number;
  sekolah: SekolahProfile;
  dibuatOleh?: string;
  dibuatPada?: Date;
}): MetaLaporan {
  const tahun = tahunFilter(args.filter);
  const rombel = normalisasi(args.filter.rombel);
  const status = normalisasi(args.filter.status);
  const parameter = [
    `Tahun ajaran: ${tahun || 'Semua tahun ajaran'}`,
    `Rombel: ${!rombel || rombel.toLowerCase() === 'semua' ? 'Semua rombel' : rombel}`,
    `Status: ${!status || status.toLowerCase() === 'semua' ? 'Semua status' : status}`,
    ...(args.dibuatOleh ? [`Dibuat oleh: ${args.dibuatOleh}`] : []),
  ].join(' • ');
  const dibuatPada = args.dibuatPada || new Date();
  const namaSekolah = (args.sekolah.nama || 'Sekolah').trim();
  const npsn = (args.sekolah.npsn || '-').trim();
  return {
    judul: args.judul,
    parameter,
    dibuatPada,
    dibuatPadaLabel: formatWaktuLaporan(dibuatPada),
    sumber: `Database sekolah ${namaSekolah} (NPSN ${npsn}) — data lokal IndexedDB perangkat ini`,
    periode: tahun ? `Tahun ajaran ${tahun}` : 'Semua tahun ajaran',
    jumlahBaris: args.jumlahBaris,
  };
}

/** Ringkasan dampak ekspor (ditampilkan sebelum tombol ekspor). */
export function ringkasanEkspor(meta: MetaLaporan, format: 'Excel (.xlsx)' | 'CSV' | 'Cetak / PDF'): string {
  if (meta.jumlahBaris === 0) return `Tidak ada baris untuk diekspor — ubah filter atau pilih jenis laporan lain.`;
  return `${format}: ${meta.jumlahBaris} baris akan diekspor. Parameter: ${meta.parameter}.`;
}

/** Nama file aman (tanpa karakter path) untuk ekspor laporan. */
export function namaFileLaporan(jenis: JenisLaporan, filter: FilterLaporan, dibuatPada: Date = new Date()): string {
  const tahun = tahunFilter(filter).replace('/', '-') || 'SemuaTahun';
  const dasar = `Laporan_${jenis}_${tahun}_${dibuatPada.toISOString().slice(0, 10)}`;
  return dasar.replace(/[^A-Za-z0-9._-]+/g, '_');
}

// ---------------- Statistik ----------------

export interface StatistikLaporan {
  total: number;
  perRombel: Array<{ rombel: string; L: number; P: number; X: number; total: number }>;
  perAgama: Array<{ label: string; jumlah: number; persen: number }>;
  perJalur: Array<{ label: string; jumlah: number; persen: number }>;
  perStatus: Array<{ label: string; jumlah: number; persen: number }>;
}

function persen(jumlah: number, total: number): number {
  return total > 0 ? Math.round((jumlah / total) * 1000) / 10 : 0;
}

function kelompok(daftar: Siswa[], ambil: (s: Siswa) => string): Array<{ label: string; jumlah: number; persen: number }> {
  const map = new Map<string, number>();
  for (const s of daftar) map.set(ambil(s), (map.get(ambil(s)) || 0) + 1);
  return [...map.entries()]
    .map(([label, jumlah]) => ({ label, jumlah, persen: persen(jumlah, daftar.length) }))
    .sort((a, b) => b.jumlah - a.jumlah || String(a.label).localeCompare(String(b.label)));
}

/**
 * Agregat statistik atas daftar TERSARING (tanpa filter tersembunyi di
 * dalam builder): angka di pratinjau, Excel, dan CSV berasal dari
 * daftar yang sama persis. Catatan: bila filter status = 'semua',
 * siswa non-Aktif ikut terhitung di sini (berbeda dari Rekapitulasi
 * yang kohortnya selalu Aktif — lihat FR-P4-01). UI Pusat Laporan
 * memberi default status 'Aktif' agar konsisten dengan Rekapitulasi.
 */
export function bangunStatistik(tersaring: Siswa[], ctx: { tahun: string; tahunAktif: string }): StatistikLaporan {
  const rombelMap = new Map<string, { L: number; P: number; X: number; total: number }>();
  for (const s of tersaring) {
    const r = rombelPadaTahun(s, ctx.tahun || null, ctx.tahunAktif) || 'Belum Ada';
    const c = rombelMap.get(r) || { L: 0, P: 0, X: 0, total: 0 };
    if (s.jenisKelamin === 'L') c.L++;
    else if (s.jenisKelamin === 'P') c.P++;
    else c.X++;
    c.total++;
    rombelMap.set(r, c);
  }
  const perRombel = [...rombelMap.entries()]
    .map(([rombel, c]) => ({ rombel, ...c }))
    .sort((a, b) => a.rombel.localeCompare(b.rombel));
  return {
    total: tersaring.length,
    perRombel,
    // Nilai kosong dilaporkan apa adanya sebagai 'Belum Diisi' — jangan
    // dilabeli kategori nyata ('Lainnya'/'Zonasi') yang mengarang isi (Fase 0/1).
    perAgama: kelompok(tersaring, (s) => s.agama || 'Belum Diisi'),
    perJalur: kelompok(tersaring, (s) => s.jalurMasuk || 'Belum Diisi'),
    perStatus: kelompok(tersaring, (s) => s.statusSiswa || 'Aktif'),
  };
}

/** Invarian: jumlah tiap kelompok = total (dipakai tes + guard UI). */
export function cekKonsistensiStatistik(stat: StatistikLaporan): string[] {
  const masalah: string[] = [];
  const sum = (arr: Array<{ jumlah: number }>) => arr.reduce((a, c) => a + c.jumlah, 0);
  if (stat.perRombel.reduce((a, c) => a + c.total, 0) !== stat.total) masalah.push('Jumlah per rombel tidak sama dengan total.');
  if (sum(stat.perAgama) !== stat.total) masalah.push('Jumlah per agama tidak sama dengan total.');
  if (sum(stat.perJalur) !== stat.total) masalah.push('Jumlah per jalur PPDB tidak sama dengan total.');
  if (sum(stat.perStatus) !== stat.total) masalah.push('Jumlah per status tidak sama dengan total.');
  return masalah;
}

// ---------------- Baris laporan daftar ----------------

export type BarisLaporan = (string | number)[][];

function rombelBaris(s: Siswa, tahun: string, tahunAktif: string): string {
  return rombelPadaTahun(s, tahun || null, tahunAktif) || '-';
}

export function kolomLaporan(jenis: JenisLaporan): string[] {
  switch (jenis) {
    case 'statistik':
      return ['Rombel', 'Laki-laki (L)', 'Perempuan (P)', 'JK Belum Diisi (X)', 'Jumlah Total'];
    case 'daftar-siswa':
      return ['No', 'Nama Lengkap', 'NISN', 'NIPD', 'L/P', 'Rombel', 'Status', 'Tanggal Lahir', 'Agama', 'Jalur Masuk'];
    case 'mutasi-masuk':
      return ['No', 'Nama Lengkap', 'NISN', 'Tanggal Diterima', 'Asal Mutasi', 'Rombel Tujuan', 'Jalur Masuk'];
    case 'mutasi-keluar':
      return ['No', 'Nama Lengkap', 'NISN', 'Rombel Terakhir', 'Tanggal Keluar', 'Sekolah Tujuan', 'No. Surat Mutasi', 'Alasan'];
    case 'belum-lengkap':
    case 'temuan-validasi':
      return ['No', 'Nama Lengkap', 'NISN', 'Rombel', 'Bidang', 'Tingkat', 'Temuan'];
  }
}

export function bangunBarisDaftarSiswa(tersaring: Siswa[], ctx: { tahun: string; tahunAktif: string }): BarisLaporan {
  return tersaring.map((s, i) => [
    i + 1,
    s.namaLengkap || '-',
    s.nisn || '-',
    s.nipd || '-',
    s.jenisKelamin || '-',
    rombelBaris(s, ctx.tahun, ctx.tahunAktif),
    s.statusSiswa || 'Aktif',
    s.tanggalLahir || '-',
    s.agama || '-',
    s.jalurMasuk || '-',
  ]);
}

export function bangunBarisMutasiMasuk(tersaring: Siswa[], ctx: { tahun: string; tahunAktif: string }): BarisLaporan {
  const masuk = tersaring.filter(
    (s) => s.jenisPendaftaran === 'Pindahan' || s.jalurMasuk === 'Mutasi/Pindahan'
  );
  masuk.sort((a, b) => (b.tanggalDiterima || '').localeCompare(a.tanggalDiterima || '') || (a.namaLengkap || '').localeCompare(b.namaLengkap || ''));
  return masuk.map((s, i) => [
    i + 1,
    s.namaLengkap || '-',
    s.nisn || '-',
    s.tanggalDiterima || '-',
    s.asalMutasi || s.asalSdMi || '-',
    rombelBaris(s, ctx.tahun, ctx.tahunAktif),
    s.jalurMasuk || '-',
  ]);
}

export function bangunBarisMutasiKeluar(tersaring: Siswa[], ctx: { tahun: string; tahunAktif: string }): BarisLaporan {
  const keluar = tersaring.filter((s) => (s.statusSiswa || 'Aktif') === 'Mutasi Keluar');
  keluar.sort((a, b) => (b.tanggalKeluar || '').localeCompare(a.tanggalKeluar || '') || (a.namaLengkap || '').localeCompare(b.namaLengkap || ''));
  return keluar.map((s, i) => [
    i + 1,
    s.namaLengkap || '-',
    s.nisn || '-',
    rombelBaris(s, ctx.tahun, ctx.tahunAktif),
    s.tanggalKeluar || '-',
    s.sekolahTujuan || '-',
    s.noSuratMutasi || '-',
    s.alasanKeluar || '-',
  ]);
}

// ---------------- Temuan kelengkapan & validasi ----------------

export interface TemuanLaporan {
  siswaId: string;
  nama: string;
  nisn: string;
  rombel: string;
  bidang: string;
  tingkat: 'error' | 'peringatan';
  /** 'belum-lengkap' = field kosong; 'validasi' = format/duplikat/logika. */
  kategori: 'belum-lengkap' | 'validasi';
  pesan: string;
}

function kategoriDariValidator(pesan: string, isWarning: boolean): 'belum-lengkap' | 'validasi' {
  if (isWarning) return 'belum-lengkap';
  if (/wajib diisi/i.test(pesan)) return 'belum-lengkap';
  return 'validasi';
}

/**
 * Temuan untuk satu siswa: validator identitas yang sudah ada
 * (format, duplikat, logika tanggal) + cek field kosong lain
 * (tempat lahir, alamat, rombel, tanggal diterima, nama orang tua).
 * TIDAK menilai isi nilai/raport — itu ranah pemeriksa (issue #3).
 */
export function cekKelengkapanSiswa(s: Siswa, semua: Siswa[], ctx: { tahun: string; tahunAktif: string }): TemuanLaporan[] {
  const temuan: TemuanLaporan[] = [];
  const rombel = rombelBaris(s, ctx.tahun, ctx.tahunAktif);
  const dorong = (bidang: string, tingkat: 'error' | 'peringatan', kategori: 'belum-lengkap' | 'validasi', pesan: string) => {
    temuan.push({ siswaId: s.id, nama: s.namaLengkap || '-', nisn: s.nisn || '-', rombel, bidang, tingkat, kategori, pesan });
  };
  const hasil = validateIdentitasSiswa(
    { id: s.id, namaLengkap: s.namaLengkap, nisn: s.nisn, nik: s.nik, nipd: s.nipd, noKk: s.noKk, tanggalLahir: s.tanggalLahir, tanggalDiterima: s.tanggalDiterima },
    semua
  );
  for (const e of hasil) dorong(e.field, 'error', kategoriDariValidator(e.message, false), e.message);
  for (const w of hasil.warnings) dorong(w.field, 'peringatan', kategoriDariValidator(w.message, true), w.message);
  const kosong = (v: unknown): boolean => !(typeof v === 'string' ? v.trim() : v);
  if (kosong(s.tempatLahir)) dorong('tempatLahir', 'peringatan', 'belum-lengkap', 'Tempat lahir belum diisi.');
  if (kosong(s.alamat)) dorong('alamat', 'peringatan', 'belum-lengkap', 'Alamat belum diisi.');
  if (kosong(s.rombelSaatIni)) dorong('rombelSaatIni', 'peringatan', 'belum-lengkap', 'Rombel saat ini belum diisi.');
  if (kosong(s.tanggalDiterima)) dorong('tanggalDiterima', 'peringatan', 'belum-lengkap', 'Tanggal diterima belum diisi.');
  if (kosong(s.ayah?.nama)) dorong('ayah.nama', 'peringatan', 'belum-lengkap', 'Nama ayah belum diisi.');
  if (kosong(s.ibu?.nama)) dorong('ibu.nama', 'peringatan', 'belum-lengkap', 'Nama ibu belum diisi.');
  return temuan.sort((a, b) => (a.nama || '').localeCompare(b.nama || '') || a.bidang.localeCompare(b.bidang));
}

export function bangunBarisTemuan(tersaring: Siswa[], semua: Siswa[], ctx: { tahun: string; tahunAktif: string }, hanyaBelumLengkap: boolean): BarisLaporan {
  const semuaTemuan: TemuanLaporan[] = [];
  for (const s of tersaring) {
    for (const t of cekKelengkapanSiswa(s, semua, ctx)) {
      if (hanyaBelumLengkap && t.kategori !== 'belum-lengkap') continue;
      semuaTemuan.push(t);
    }
  }
  semuaTemuan.sort((a, b) => a.nama.localeCompare(b.nama) || a.bidang.localeCompare(b.bidang));
  return semuaTemuan.map((t, i) => [i + 1, t.nama, t.nisn, t.rombel, t.bidang, t.tingkat === 'error' ? 'Error' : 'Peringatan', t.pesan]);
}

/**
 * Bangun satu laporan daftar (selain statistik). Mengembalikan header +
 * baris dari daftar TERSARING yang sama dengan pratinjau — dipakai
 * pratinjau, cetak, Excel, dan CSV tanpa pengulangan logika.
 */
export function bangunLaporan(
  jenis: JenisLaporan,
  tersaring: Siswa[],
  ctx: { tahun: string; tahunAktif: string; semuaSiswa: Siswa[] }
): { header: string[]; baris: BarisLaporan } {
  switch (jenis) {
    case 'daftar-siswa':
      return { header: kolomLaporan(jenis), baris: bangunBarisDaftarSiswa(tersaring, ctx) };
    case 'mutasi-masuk':
      return { header: kolomLaporan(jenis), baris: bangunBarisMutasiMasuk(tersaring, ctx) };
    case 'mutasi-keluar':
      return { header: kolomLaporan(jenis), baris: bangunBarisMutasiKeluar(tersaring, ctx) };
    case 'belum-lengkap':
      return { header: kolomLaporan(jenis), baris: bangunBarisTemuan(tersaring, ctx.semuaSiswa, ctx, true) };
    case 'temuan-validasi':
      return { header: kolomLaporan(jenis), baris: bangunBarisTemuan(tersaring, ctx.semuaSiswa, ctx, false) };
    case 'statistik':
    default:
      return { header: kolomLaporan('statistik'), baris: [] };
  }
}

// ---------------- CSV ----------------

/** S11: cegah formula injection di CSV seperti di Excel (excel.ts). */
function amanDariFormulaCsv(v: string | number): string | number {
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return `'${v}`;
  return v;
}

function selCsv(v: string | number): string {
  const s = String(amanDariFormulaCsv(v) ?? '');
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV RFC 4180 + BOM UTF-8 (agar Excel membuka UTF-8 dengan benar,
 * termasuk karakter Indonesia: é, ñ, dll). Baris pertama dapat berupa
 * baris metadata laporan (judul/parameter/waktu/sumber).
 */
export function keCsv(baris: BarisLaporan): string {
  return `\uFEFF${baris.map((r) => r.map(selCsv).join(',')).join('\r\n')}\r\n`;
}

/** Baris metadata laporan untuk disisipkan di atas isi file ekspor. */
export function barisMetaEkspor(meta: MetaLaporan): BarisLaporan {
  return [
    [meta.judul],
    ['Parameter', meta.parameter],
    ['Dibuat', meta.dibuatPadaLabel],
    ['Sumber', meta.sumber],
    ['Periode', meta.periode],
    [],
  ];
}

/** Unduh CSV di browser (no-op aman di Node/tes). */
export function unduhCsv(namaFile: string, baris: BarisLaporan): void {
  if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([keCsv(baris)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = namaFile.endsWith('.csv') ? namaFile : `${namaFile}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
