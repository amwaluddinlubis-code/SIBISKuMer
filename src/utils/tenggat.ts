// ---------------- KALENDER & TENGGAT ADMINISTRASI (Issue #8) ----------------
// Logika MURNI (tanpa DOM / localStorage / IndexedDB) agar dapat diuji dengan
// `npm test` di Node. Penyimpanan ada di `db.ts`, UI di `KalenderTenggatView`.
// Prinsip:
// - Tanggal tenggat disimpan sebagai tanggal kalender YYYY-MM-DD di zona waktu
//   sekolah (bukan timestamp), sehingga DST / perbedaan zona tidak menggeser
//   hari jatuh tempo.
// - "Hari ini" selalu dihitung dalam zona waktu yang dikonfigurasi, bukan zona
//   waktu perangkat — inilah yang membuat jadwal konsisten lintas perangkat.
// - Pengingat HANYA in-app (toast + lencana). Tidak ada kanal eksternal, jadi
//   tidak ada klaim pengiriman email/WA/dll.
// - Dedup: setiap pengingat punya kunci stabil; kunci yang sudah terkirim
//   tidak dikirim ulang (kecuali pengingat terlambat harian yang kuncinya
//   memuat tanggal, sehingga terkirim sekali per hari).

import type {
  PengaturanPengingat,
  PengingatTerkirim,
  TugasKategori,
  TugasTabTujuan,
  TugasTenggat,
} from '../types';

export const TENGGAT_KATEGORI: TugasKategori[] = ['laporan', 'verifikasi-data', 'administrasi', 'lainnya'];

export const TENGGAT_KATEGORI_LABEL: Record<TugasKategori, string> = {
  laporan: 'Laporan',
  'verifikasi-data': 'Verifikasi Data',
  administrasi: 'Administrasi',
  lainnya: 'Lainnya',
};

/** Tab yang boleh menjadi tujuan tautan tindakan (tab yang ada di App.tsx). */
export const TENGGAT_TAB_TUJUAN: TugasTabTujuan[] = [
  'dasbor',
  'siswa',
  'raport',
  'leger',
  'dapodik',
  'rekap',
  'cetak',
  'referensi',
  'gtk',
  'arsip',
  'pemetaan',
  'pengaturan',
  'users',
  'backup',
  'audit',
  'kalender',
];

export const TENGGAT_ZONA_WAKTU_BAWAAN = 'Asia/Jakarta';
export const TENGGAT_HARI_SEBELUM_PILIHAN = [0, 1, 2, 3, 5, 7, 14];

export const PENGATURAN_PENGINGAT_BAWAAN: PengaturanPengingat = {
  zonaWaktu: TENGGAT_ZONA_WAKTU_BAWAAN,
  kanal: 'in-app',
  aktif: true,
  hariSebelum: [7, 3, 1, 0],
  pengingatTerlambatHarian: true,
};

/** Tanggal valid: format YYYY-MM-DD dan tanggal kalender nyata. */
export function isTanggalKalenderValid(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Zona waktu IANA valid? (Intl melempar RangeError untuk zona tak dikenal.) */
export function isZonaWaktuValid(zona: string): boolean {
  if (!zona || typeof zona !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

/**
 * Tanggal kalender (YYYY-MM-DD) dari `saat` dalam `zonaWaktu`.
 * `saat` default = sekarang. Parameter `saat` memungkinkan tes deterministik
 * lintas zona waktu (satu momen yang sama = tanggal berbeda di tiap zona).
 */
export function tanggalDiZonaWaktu(zonaWaktu: string, saat: Date = new Date()): string {
  const zona = isZonaWaktuValid(zonaWaktu) ? zonaWaktu : TENGGAT_ZONA_WAKTU_BAWAAN;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(saat);
}

/** Geser tanggal kalender YYYY-MM-DD sebanyak `hari` (negatif = mundur). */
export function geserTanggalKalender(tanggal: string, hari: number): string {
  const [y, m, d] = tanggal.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + hari));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Selisih hari kalender: tanggalB - tanggalA (negatif bila B lebih awal). */
export function selisihHariKalender(tanggalA: string, tanggalB: string): number {
  const keHari = (t: string) => {
    const [y, m, d] = t.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / 86_400_000;
  };
  return Math.round(keHari(tanggalB) - keHari(tanggalA));
}

export interface TenggatError {
  field: string;
  message: string;
}

/** Validasi input form tugas. Mengembalikan daftar error (kosong = valid). */
export function validasiTenggat(input: Partial<TugasTenggat>): TenggatError[] {
  const errs: TenggatError[] = [];
  const judul = (input.judul || '').trim();
  if (!judul) errs.push({ field: 'judul', message: 'Judul tugas wajib diisi.' });
  else if (judul.length > 120) errs.push({ field: 'judul', message: 'Judul maksimal 120 karakter.' });
  if (input.deskripsi !== undefined && input.deskripsi !== null && input.deskripsi.length > 500) {
    errs.push({ field: 'deskripsi', message: 'Deskripsi maksimal 500 karakter.' });
  }
  if (input.kategori !== undefined && !TENGGAT_KATEGORI.includes(input.kategori as TugasKategori)) {
    errs.push({ field: 'kategori', message: 'Kategori tidak dikenal.' });
  }
  if (input.prioritas !== undefined && ![1, 2, 3].includes(Number(input.prioritas))) {
    errs.push({ field: 'prioritas', message: 'Prioritas harus 1 (rendah), 2 (normal), atau 3 (tinggi).' });
  }
  if (!input.tanggalJatuhTempo || !isTanggalKalenderValid(input.tanggalJatuhTempo)) {
    errs.push({ field: 'tanggalJatuhTempo', message: 'Tanggal jatuh tempo tidak valid (format YYYY-MM-DD).' });
  }
  if (input.penanggungJawab !== undefined && input.penanggungJawab !== null && input.penanggungJawab.trim().length > 100) {
    errs.push({ field: 'penanggungJawab', message: 'Penanggung jawab maksimal 100 karakter.' });
  }
  const tautan = input.tautanTindakan;
  if (tautan !== undefined && tautan !== null) {
    if (typeof tautan !== 'object' || !TENGGAT_TAB_TUJUAN.includes((tautan as { tab?: string }).tab as TugasTabTujuan)) {
      errs.push({ field: 'tautanTindakan', message: 'Tautan tindakan harus menunjuk ke halaman aplikasi yang tersedia.' });
    } else if (tautan.label !== undefined && tautan.label !== null && String(tautan.label).length > 80) {
      errs.push({ field: 'tautanTindakan', message: 'Label tautan maksimal 80 karakter.' });
    }
  }
  if (input.status !== undefined && !['terbuka', 'selesai', 'dibatalkan'].includes(input.status)) {
    errs.push({ field: 'status', message: 'Status tidak dikenal.' });
  }
  return errs;
}

/**
 * Normalisasi record tugas dari penyimpanan/backup: buang field tak dikenal
 * (termasuk field data siswa bila ada yang terselip), isi bawaan yang aman,
 * dan tolak record yang tidak valid. Mengembalikan null bila record ditolak.
 * Dipakai saat restore backup agar file lama/rusak tidak meracuni daftar.
 */
export function normalisasiTenggat(raw: unknown): TugasTenggat | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id.trim() : '';
  if (!id) return null;
  const kandidat: Partial<TugasTenggat> = {
    id,
    judul: typeof r.judul === 'string' ? r.judul : '',
    deskripsi: typeof r.deskripsi === 'string' ? r.deskripsi : undefined,
    kategori: (typeof r.kategori === 'string' ? r.kategori : 'lainnya') as TugasKategori,
    status: (typeof r.status === 'string' ? r.status : 'terbuka') as TugasTenggat['status'],
    prioritas: (r.prioritas === 1 || r.prioritas === 2 || r.prioritas === 3 ? r.prioritas : 2) as 1 | 2 | 3,
    tanggalJatuhTempo: typeof r.tanggalJatuhTempo === 'string' ? r.tanggalJatuhTempo : '',
    penanggungJawab: typeof r.penanggungJawab === 'string' ? r.penanggungJawab : undefined,
    tautanTindakan:
      r.tautanTindakan && typeof r.tautanTindakan === 'object'
        ? {
            tab: (r.tautanTindakan as { tab: string }).tab as TugasTabTujuan,
            label: typeof (r.tautanTindakan as { label?: unknown }).label === 'string'
              ? ((r.tautanTindakan as { label: string }).label as string)
              : undefined,
          }
        : null,
    dibuatOleh: typeof r.dibuatOleh === 'string' ? r.dibuatOleh : 'sistem',
    dibuatPada: typeof r.dibuatPada === 'string' ? r.dibuatPada : new Date(0).toISOString(),
    diubahPada: typeof r.diubahPada === 'string' ? r.diubahPada : new Date(0).toISOString(),
    selesaiPada: typeof r.selesaiPada === 'string' ? r.selesaiPada : null,
    selesaiOleh: typeof r.selesaiOleh === 'string' ? r.selesaiOleh : null,
  };
  if (validasiTenggat(kandidat).length > 0) return null;
  return kandidat as TugasTenggat;
}

export type StatusTenggatTurunan = 'selesai' | 'dibatalkan' | 'terlambat' | 'hari-ini' | 'besok' | 'mendatang';

/**
 * Status turunan untuk tampilan: tugas terbuka diklasifikasikan terhadap
 * `hariIni` (YYYY-MM-DD dalam zona waktu sekolah). Tugas selesai/dibatalkan
 * tidak pernah dilaporkan terlambat.
 */
export function statusTurunan(tugas: TugasTenggat, hariIni: string): StatusTenggatTurunan {
  if (tugas.status === 'selesai') return 'selesai';
  if (tugas.status === 'dibatalkan') return 'dibatalkan';
  const diff = selisihHariKalender(hariIni, tugas.tanggalJatuhTempo);
  if (diff < 0) return 'terlambat';
  if (diff === 0) return 'hari-ini';
  if (diff === 1) return 'besok';
  return 'mendatang';
}

/** Apakah tugas terbuka dan perlu perhatian (terlambat / jatuh tempo hari ini). */
export function tugasMendesak(tugas: TugasTenggat, hariIni: string): boolean {
  const s = statusTurunan(tugas, hariIni);
  return s === 'terlambat' || s === 'hari-ini';
}

/** Urutan baku: terbuka dulu (terlambat → hari ini → terdekat), lalu selesai/dibatalkan. */
export function urutkanTenggat(daftar: TugasTenggat[], hariIni: string): TugasTenggat[] {
  const bobotStatus: Record<StatusTenggatTurunan, number> = {
    terlambat: 0,
    'hari-ini': 1,
    besok: 2,
    mendatang: 3,
    selesai: 4,
    dibatalkan: 5,
  };
  return [...daftar].sort((a, b) => {
    const sa = statusTurunan(a, hariIni);
    const sb = statusTurunan(b, hariIni);
    if (bobotStatus[sa] !== bobotStatus[sb]) return bobotStatus[sa] - bobotStatus[sb];
    if (a.tanggalJatuhTempo !== b.tanggalJatuhTempo) return a.tanggalJatuhTempo.localeCompare(b.tanggalJatuhTempo);
    if (b.prioritas !== a.prioritas) return b.prioritas - a.prioritas;
    return a.judul.localeCompare(b.judul);
  });
}

export interface RingkasanTenggat {
  total: number;
  terbuka: number;
  terlambat: number;
  hariIni: number;
  selesai: number;
  dibatalkan: number;
}

export function ringkasanTenggat(daftar: TugasTenggat[], hariIni: string): RingkasanTenggat {
  const ringkasan: RingkasanTenggat = { total: daftar.length, terbuka: 0, terlambat: 0, hariIni: 0, selesai: 0, dibatalkan: 0 };
  for (const t of daftar) {
    const s = statusTurunan(t, hariIni);
    if (s === 'terlambat') { ringkasan.terlambat += 1; ringkasan.terbuka += 1; }
    else if (s === 'hari-ini') { ringkasan.hariIni += 1; ringkasan.terbuka += 1; }
    else if (s === 'besok' || s === 'mendatang') ringkasan.terbuka += 1;
    else if (s === 'selesai') ringkasan.selesai += 1;
    else if (s === 'dibatalkan') ringkasan.dibatalkan += 1;
  }
  return ringkasan;
}

/** Validasi + normalisasi pengaturan pengingat (fallback aman untuk nilai rusak). */
export function normalisasiPengaturanPengingat(raw: unknown): PengaturanPengingat {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const zona = typeof r.zonaWaktu === 'string' && isZonaWaktuValid(r.zonaWaktu) ? r.zonaWaktu : TENGGAT_ZONA_WAKTU_BAWAAN;
  const hari = Array.isArray(r.hariSebelum)
    ? [...new Set(r.hariSebelum.filter((n): n is number => typeof n === 'number' && TENGGAT_HARI_SEBELUM_PILIHAN.includes(n)))].sort((a, b) => b - a)
    : PENGATURAN_PENGINGAT_BAWAAN.hariSebelum;
  return {
    zonaWaktu: zona,
    // Kanal selalu 'in-app' — nilai lain dari file lama/rusak diabaikan (jujur: tidak ada kanal eksternal).
    kanal: 'in-app',
    aktif: r.aktif !== false,
    hariSebelum: hari.length > 0 ? hari : PENGATURAN_PENGINGAT_BAWAAN.hariSebelum,
    pengingatTerlambatHarian: r.pengingatTerlambatHarian !== false,
  };
}

export type JenisPengingat = 'h-minus' | 'hari-ini' | 'terlambat';

export interface PengingatJatuhTempo {
  tugas: TugasTenggat;
  jenis: JenisPengingat;
  /** H-minus yang memicu pengingat ini (0 = hari-H); null untuk pengingat terlambat. */
  hariSebelum: number | null;
  kunci: string;
  judul: string;
  pesan: string;
}

function kunciHMinus(tugasId: string, hariSebelum: number): string {
  return `${tugasId}:H${hariSebelum}`;
}

function kunciTerlambat(tugasId: string, hariIni: string): string {
  return `${tugasId}:terlambat:${hariIni}`;
}

function pesanPengingat(tugas: TugasTenggat, jenis: JenisPengingat, hariSebelum: number | null): string {
  const tgl = tugas.tanggalJatuhTempo;
  if (jenis === 'terlambat') return `Terlambat sejak ${tgl}. Segera tindak lanjuti.`;
  if (jenis === 'hari-ini' || hariSebelum === 0) return `Jatuh tempo hari ini (${tgl}).`;
  if (hariSebelum === 1) return `Jatuh tempo besok (${tgl}).`;
  return `Jatuh tempo dalam ${hariSebelum} hari (${tgl}).`;
}

/**
 * Hitung pengingat yang jatuh tempo SEKARANG dan belum terkirim (dedup).
 * - Paling banyak SATU pengingat per tugas per pengecekan: tepat pada tanggal
 *   pengingatnya (tenggat minus H), atau — bila aplikasi tidak dibuka pada
 *   tanggal tersebut — satu catch-up paling mendesak (H terkecil yang
 *   terlewat). Ini mencegah banjir toast untuk tugas yang baru dibuat
 *   dengan tenggat dekat (yang H-7 & H-3-nya sama-sama sudah lewat).
 * - Pengingat terlambat harian: sekali per hari selama tugas masih terbuka.
 * - Tugas selesai/dibatalkan tidak pernah memicu pengingat.
 * Mengembalikan daftar pengingat baru + kunci-kunci yang harus dicatat terkirim.
 * Catatan: pencatatan kunci dilakukan pemanggil SETELAH pengingat ditampilkan,
 * agar pengingat tidak hilang bila tampilnya gagal.
 */
export function pengingatJatuhTempo(
  daftar: TugasTenggat[],
  pengaturan: PengaturanPengingat,
  sudahTerkirim: ReadonlySet<string> | PengingatTerkirim[],
  hariIni: string,
): { baru: PengingatJatuhTempo[]; kunciBaru: string[] } {
  const terkirim = Array.isArray(sudahTerkirim)
    ? new Set(sudahTerkirim.map((p) => p.kunci))
    : new Set(sudahTerkirim);
  const baru: PengingatJatuhTempo[] = [];
  const kunciBaru: string[] = [];
  if (!pengaturan.aktif) return { baru, kunciBaru };
  for (const tugas of daftar) {
    if (tugas.status !== 'terbuka') continue;
    const diff = selisihHariKalender(hariIni, tugas.tanggalJatuhTempo);
    if (diff < 0) {
      // Terlambat: satu pengingat per hari (kunci memuat tanggal hari ini).
      if (pengaturan.pengingatTerlambatHarian) {
        const kunci = kunciTerlambat(tugas.id, hariIni);
        if (!terkirim.has(kunci)) {
          terkirim.add(kunci);
          kunciBaru.push(kunci);
          baru.push({ tugas, jenis: 'terlambat', hariSebelum: null, kunci, judul: tugas.judul, pesan: pesanPengingat(tugas, 'terlambat', null) });
        }
      }
      continue;
    }
    // Kumpulkan semua H yang sudah tiba; pilih satu: yang tepat hari ini
    // (diff === h) bila ada, sonst H terkecil yang terlewat (catch-up).
    const tiba = pengaturan.hariSebelum.filter((h) => diff <= h);
    if (tiba.length > 0) {
      const tepat = tiba.find((h) => h === diff);
      const dipilih = tepat !== undefined ? tepat : Math.min(...tiba);
      const kunci = kunciHMinus(tugas.id, dipilih);
      if (!terkirim.has(kunci)) {
        terkirim.add(kunci);
        kunciBaru.push(kunci);
        const jenis: JenisPengingat = dipilih === 0 ? 'hari-ini' : 'h-minus';
        baru.push({ tugas, jenis, hariSebelum: dipilih, kunci, judul: tugas.judul, pesan: pesanPengingat(tugas, jenis, dipilih) });
      }
    }
  }
  return { baru, kunciBaru };
}

/** Kunci dedup untuk satu tugas (dipakai saat menghapus tugas: bersihkan jejaknya). */
export function kunciPengingatUntukTugas(tugasId: string, pengaturan: PengaturanPengingat): string[] {
  return [
    ...pengaturan.hariSebelum.map((h) => kunciHMinus(tugasId, h)),
    // Kunci terlambat harian memuat tanggal — tidak dapat dienumerasi; pembersihan
    // memakai awalan `${tugasId}:terlambat:` di lapisan penyimpanan.
  ];
}
