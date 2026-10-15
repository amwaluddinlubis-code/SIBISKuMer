// ---------------- KALENDER & PENGINGAT TENGGAT (Issue #8) ----------------
// Logika MURNI (tanpa window / IndexedDB) agar mudah diuji dengan node:test.
// - Tanggal jatuh tempo = tanggal kalender `YYYY-MM-DD` di zona waktu yang
//   dikonfigurasi (bukan timestamp), sehingga tidak bergeser saat zona diubah.
// - Pengingat HANYA dalam aplikasi: tidak ada kanal eksternal yang diklaim.
// - Anti-duplikat: satu pengingat = satu kunci
//   `${tugasId}|${tanggalJatuhTempo}|${ambangHari}`; kunci yang sudah
//   disampaikan tidak dihitung lagi sampai tugas berubah.

import type { AppUser, PengaturanKalender, TugasAdministrasi } from '../types';

/** Zona waktu yang ditawarkan di pengaturan (IANA). */
export const ZONA_WAKTU_PILIHAN: Array<{ id: string; label: string }> = [
  { id: 'Asia/Jakarta', label: 'WIB — Asia/Jakarta (UTC+7)' },
  { id: 'Asia/Makassar', label: 'WITA — Asia/Makassar (UTC+8)' },
  { id: 'Asia/Jayapura', label: 'WIT — Asia/Jayapura (UTC+9)' },
  { id: 'Asia/Singapore', label: 'Asia/Singapore (UTC+8)' },
  { id: 'UTC', label: 'UTC' },
];

export const ZONA_WAKTU_BAWAAN = 'Asia/Jakarta';
export const INGATKAN_MAKS_HARI = 30;

/** Kanal yang benar-benar tersedia vs yang BELUM tersedia (jujur). */
export const KANAL_TERSEDIA: Array<{ id: 'dalam_aplikasi'; label: string; keterangan: string }> = [
  {
    id: 'dalam_aplikasi',
    label: 'Dalam aplikasi',
    keterangan: 'Lencana jumlah + toast saat aplikasi dibuka. Tidak mengirim ke luar.',
  },
];
export const KANAL_BELUM_TERSEDIA: Array<{ id: string; label: string; keterangan: string }> = [
  { id: 'email', label: 'Email', keterangan: 'Belum terkonfigurasi — tidak ada email yang dikirim.' },
  { id: 'whatsapp', label: 'WhatsApp', keterangan: 'Belum terkonfigurasi — tidak ada pesan yang dikirim.' },
  { id: 'push', label: 'Push notification', keterangan: 'Belum terkonfigurasi — tidak ada push yang dikirim.' },
];

/** Zona waktu valid? (Intl melempar RangeError untuk zona tak dikenal.) */
export function zonaWaktuValid(zona: string): boolean {
  try {
    Intl.DateTimeFormat('en-CA', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

/** Zona waktu perangkat saat ini (fallback ke bawaan bila tak terbaca). */
export function zonaWaktuPerangkat(): string {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (z && zonaWaktuValid(z)) return z;
  } catch {
    /* abaikan */
  }
  return ZONA_WAKTU_BAWAAN;
}

export function pengaturanKalenderBawaan(): PengaturanKalender {
  return {
    zonaWaktu: zonaWaktuPerangkat(),
    ingatkanHariSebelum: 3,
    ingatkanTerlambat: true,
    kanal: 'dalam_aplikasi',
  };
}

/** Normalisasi pengaturan dari penyimpanan (nilai rusak → bawaan yang aman). */
export function normalisasiPengaturanKalender(raw: unknown): PengaturanKalender {
  const bawaan = pengaturanKalenderBawaan();
  if (!raw || typeof raw !== 'object') return bawaan;
  const r = raw as Record<string, unknown>;
  const zona = typeof r.zonaWaktu === 'string' && zonaWaktuValid(r.zonaWaktu) ? r.zonaWaktu : bawaan.zonaWaktu;
  const hari = Number(r.ingatkanHariSebelum);
  return {
    zonaWaktu: zona,
    ingatkanHariSebelum: Number.isFinite(hari)
      ? Math.min(INGATKAN_MAKS_HARI, Math.max(0, Math.floor(hari)))
      : bawaan.ingatkanHariSebelum,
    ingatkanTerlambat: r.ingatkanTerlambat !== false,
    // Kanal dipaksa ke satu-satunya yang tersedia: input luar tidak bisa
    // mengaktifkan kanal eksternal yang belum terkonfigurasi.
    kanal: 'dalam_aplikasi',
  };
}

/** Format tanggal kalender `YYYY-MM-DD` untuk sebuah Date di zona tertentu. */
export function tanggalDiZona(date: Date, zonaWaktu: string): string {
  const zona = zonaWaktuValid(zonaWaktu) ? zonaWaktu : ZONA_WAKTU_BAWAAN;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: zona,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Tanggal kalender hari ini di zona yang dikonfigurasi. */
export function hariIniDiZona(zonaWaktu: string, sekarang = new Date()): string {
  return tanggalDiZona(sekarang, zonaWaktu);
}

const POLA_TANGGAL = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Tanggal kalender nyata? Menolak '2026-02-30', '2026-13-01', dsb. */
export function tanggalKalenderValid(tanggal: string): boolean {
  const m = POLA_TANGGAL.exec((tanggal || '').trim());
  if (!m) return false;
  const tahun = Number(m[1]);
  const bulan = Number(m[2]);
  const hari = Number(m[3]);
  if (bulan < 1 || bulan > 12 || hari < 1 || hari > 31) return false;
  const d = new Date(Date.UTC(tahun, bulan - 1, hari));
  return d.getUTCFullYear() === tahun && d.getUTCMonth() === bulan - 1 && d.getUTCDate() === hari;
}

/** Selisih hari kalender (tanggal - acuan) dalam hari bilangan bulat. */
export function selisihHariKalender(tanggal: string, acuan: string): number {
  const a = Date.parse(`${tanggal}T00:00:00Z`);
  const b = Date.parse(`${acuan}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN;
  return Math.round((a - b) / 86400000);
}

export type StatusTenggat =
  | 'selesai'
  | 'tanpa_tenggat'
  | 'terlambat'
  | 'jatuh_tempo_hari_ini'
  | 'segera'
  | 'mendatang';

/** Status tenggat terhadap hari ini (di zona pengaturan). */
export function statusTenggat(
  tugas: TugasAdministrasi,
  pengaturan: PengaturanKalender,
  sekarang = new Date()
): StatusTenggat {
  if (tugas.status === 'selesai') return 'selesai';
  if (!tugas.tanggalJatuhTempo) return 'tanpa_tenggat';
  const hariIni = hariIniDiZona(pengaturan.zonaWaktu, sekarang);
  const selisih = selisihHariKalender(tugas.tanggalJatuhTempo, hariIni);
  if (selisih < 0) return 'terlambat';
  if (selisih === 0) return 'jatuh_tempo_hari_ini';
  if (selisih <= pengaturan.ingatkanHariSebelum) return 'segera';
  return 'mendatang';
}

export function labelStatusTenggat(status: StatusTenggat): string {
  switch (status) {
    case 'selesai':
      return 'Selesai';
    case 'tanpa_tenggat':
      return 'Tanpa tenggat';
    case 'terlambat':
      return 'Terlambat';
    case 'jatuh_tempo_hari_ini':
      return 'Jatuh tempo hari ini';
    case 'segera':
      return 'Segera jatuh tempo';
    case 'mendatang':
      return 'Mendatang';
  }
}

// ---------------- Validasi ----------------

export interface TugasInput {
  judul: string;
  deskripsi?: string;
  tanggalJatuhTempo?: string;
  kategori?: string;
  penanggungJawab?: string;
  rombel?: string;
  tautanAksi?: string;
  prioritas?: string;
}

/** Validasi input form. Mengembalikan daftar pesan error (kosong = valid). */
export function validasiTugas(input: TugasInput): string[] {
  const errs: string[] = [];
  const judul = (input.judul || '').trim();
  if (!judul) errs.push('Judul tugas wajib diisi.');
  else if (judul.length > 120) errs.push('Judul tugas maksimal 120 karakter.');
  const tgl = (input.tanggalJatuhTempo || '').trim();
  if (tgl && !tanggalKalenderValid(tgl)) {
    errs.push('Tanggal jatuh tempo tidak valid. Gunakan tanggal kalender nyata (YYYY-MM-DD).');
  }
  if (input.kategori !== undefined && input.kategori.length > 40) {
    errs.push('Kategori maksimal 40 karakter.');
  }
  if (input.prioritas !== undefined && !['rendah', 'normal', 'tinggi'].includes(input.prioritas)) {
    errs.push('Prioritas tidak dikenal.');
  }
  return errs;
}

// ---------------- Otorisasi ----------------

/** Buat/ubah/hapus tenggat: hanya administrator. */
export function bolehKelolaTenggat(user: AppUser | null | undefined): boolean {
  return !!user && user.role === 'administrator';
}

/**
 * Tandai selesai / batalkan selesai: administrator, atau operator yang
 * ditunjuk sebagai penanggung jawab tugas itu.
 */
export function bolehUbahStatusTenggat(user: AppUser | null | undefined, tugas: TugasAdministrasi): boolean {
  if (!user) return false;
  if (user.role === 'administrator') return true;
  const pj = (tugas.penanggungJawab || '').trim();
  return !!pj && pj.toLowerCase() === (user.username || '').toLowerCase();
}

/** Tugas yang terlihat oleh pengguna: admin semua; operator hanya yang
 *  ditugaskan kepadanya atau tugas umum (tanpa penanggung jawab). */
export function tugasTerlihat(user: AppUser | null | undefined, tugas: TugasAdministrasi): boolean {
  if (!user || user.role === 'administrator') return true;
  const pj = (tugas.penanggungJawab || '').trim();
  if (!pj) return true;
  return pj.toLowerCase() === (user.username || '').toLowerCase();
}

// ---------------- Pengingat & anti-duplikat ----------------

/** Kunci anti-duplikat satu pengingat: tugas + tenggat + ambang pengingat. */
export function kunciPengingat(tugasId: string, tanggalJatuhTempo: string, ambangHari: number): string {
  return `${tugasId}|${tanggalJatuhTempo}|${ambangHari}`;
}

export interface PengingatJatuhTempo {
  tugas: TugasAdministrasi;
  kunci: string;
  urgensi: 'terlambat' | 'hari_ini' | 'segera';
  selisihHari: number;
}

/**
 * Hitung pengingat yang JATUH TEMPO sekarang: tugas belum selesai, punya
 * tenggat, selisih hari masuk jendela pengingat, dan kuncinya belum ada di
 * `kunciTerkirim`. Tugas selesai / tanpa tenggat / di luar jendela tidak
 * pernah menghasilkan pengingat.
 */
export function hitungPengingat(
  daftar: TugasAdministrasi[],
  pengaturan: PengaturanKalender,
  kunciTerkirim: ReadonlySet<string>,
  sekarang = new Date()
): PengingatJatuhTempo[] {
  const hariIni = hariIniDiZona(pengaturan.zonaWaktu, sekarang);
  const hasil: PengingatJatuhTempo[] = [];
  for (const tugas of daftar || []) {
    if (tugas.status === 'selesai') continue;
    if (!tugas.tanggalJatuhTempo || !tanggalKalenderValid(tugas.tanggalJatuhTempo)) continue;
    const selisih = selisihHariKalender(tugas.tanggalJatuhTempo, hariIni);
    let urgensi: PengingatJatuhTempo['urgensi'] | null = null;
    let ambang = 0;
    if (selisih < 0) {
      if (!pengaturan.ingatkanTerlambat) continue;
      urgensi = 'terlambat';
      ambang = 0;
    } else if (selisih === 0) {
      urgensi = 'hari_ini';
      ambang = 0;
    } else if (selisih <= pengaturan.ingatkanHariSebelum) {
      urgensi = 'segera';
      ambang = selisih;
    } else {
      continue;
    }
    const kunci = kunciPengingat(tugas.id, tugas.tanggalJatuhTempo, ambang);
    if (kunciTerkirim.has(kunci)) continue;
    hasil.push({ tugas, kunci, urgensi, selisihHari: selisih });
  }
  // Terlambat dulu, lalu yang paling dekat tenggatnya.
  return hasil.sort((a, b) => a.selisihHari - b.selisihHari);
}

/** Jumlah pengingat aktif (untuk lencana): belum selesai + terlambat / hari ini / segera. */
export function hitungJumlahPengingatAktif(
  daftar: TugasAdministrasi[],
  pengaturan: PengaturanKalender,
  sekarang = new Date()
): number {
  let n = 0;
  for (const tugas of daftar || []) {
    const s = statusTenggat(tugas, pengaturan, sekarang);
    if (s === 'terlambat' || s === 'jatuh_tempo_hari_ini' || s === 'segera') n++;
  }
  return n;
}

// ---------------- Pencegahan duplikat tugas ----------------

function normalisasiJudul(judul: string): string {
  return (judul || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Cari tugas yang kemungkinan duplikat dari kandidat baru: judul sama
 * (abaikan kapitalisasi/spasi ganda) + tanggal jatuh tempo sama +
 * penanggung jawab sama. Dipakai untuk peringatan, bukan blokir keras —
 * tugas dengan judul sama tapi tanggal berbeda tetap diizinkan.
 */
export function cariDuplikatTugas(
  daftar: TugasAdministrasi[],
  kandidat: { judul: string; tanggalJatuhTempo?: string; penanggungJawab?: string },
  kecualikanId?: string
): TugasAdministrasi[] {
  const judul = normalisasiJudul(kandidat.judul);
  if (!judul) return [];
  const tgl = (kandidat.tanggalJatuhTempo || '').trim();
  const pj = (kandidat.penanggungJawab || '').trim().toLowerCase();
  return (daftar || []).filter(
    (t) =>
      t.id !== kecualikanId &&
      t.status !== 'selesai' &&
      normalisasiJudul(t.judul) === judul &&
      (t.tanggalJatuhTempo || '').trim() === tgl &&
      (t.penanggungJawab || '').trim().toLowerCase() === pj
  );
}

/** ID baru untuk tugas kalender. */
export function idTugasBaru(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `tgs-${(crypto as Crypto).randomUUID()}`;
    }
  } catch {
    /* fallback di bawah */
  }
  return `tgs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
