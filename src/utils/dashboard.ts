/**
 * Logika Dasbor Pusat Kendali (Issue #2) — FUNGSI MURNI, tanpa I/O.
 *
 * Prinsip:
 * - Setiap angka berasal dari daftar siswa yang DITERIMA sebagai argumen.
 *   Pemanggil (App.tsx) hanya meneruskan `visibleSiswa` — daftar yang SUDAH
 *   dipotong hak akses (`filterSiswaByAccess`) + sesi (`siswaTerlihatSesi`).
 *   Modul ini TIDAK PERNAH memperlebar cakupan: filter di sini hanya
 *   mempersempit (tahun/rombel/status/kondisi). Hak akses tetap ditegakkan
 *   di hulu (db.ts) + aturan Firestore untuk sinkron cloud; menyembunyikan
 *   komponen di UI bukan satu-satunya pertahanan.
 * - TIDAK ADA angka contoh: daftar kosong menghasilkan angka nol + status
 *   kosong yang eksplisit, bukan angka palsu.
 * - Tugas-tugas BOLEH tumpang tindih (satu siswa bisa muncul di beberapa
 *   tugas). Angka tiap tugas = jumlah siswa yang memenuhi predikat tugas
 *   itu, bukan partisi.
 * - Batasan jujur yang didokumentasikan:
 *   (a) Aplikasi TIDAK punya antrean persetujuan mutasi — MutasiWizard
 *       langsung mengubah status. "Mutasi perlu tindak lanjut" di sini
 *       berarti siswa berstatus Mutasi Keluar yang surat mutasinya belum
 *       dilengkapi (noSuratMutasi kosong), yaitu tindak lanjut dokumen
 *       yang benar-benar dapat diturunkan dari data.
 *   (b) Model data TIDAK menyimpan tanggal tenggat laporan apa pun, jadi
 *       widget tenggat TIDAK mengarang tanggal. Item tenggat hanya berasal
 *       dari data nyata (terakhir backup) + kewajiban berjalan (raport
 *       semester berjalan) yang ditandai tanpa tanggal tersimpan.
 */
import type { Siswa, StatusSiswa } from '../types';
import { siswaTerlibatTahun } from './sesi';
import { isValidTahun, normalizeTahun } from './tahunAjaran';
import { getRaportList } from './raportUtils';
import { validateIdentitasSiswa } from './validation';

/** Semua nilai StatusSiswa yang dikenal (urutan tampil). */
export const STATUS_SISWA_OPTIONS: StatusSiswa[] = [
  'Aktif',
  'Lulus',
  'Mutasi Keluar',
  'Mengundurkan Diri',
  'Meninggal Dunia',
];

/** Sentinel nilai filter rombel untuk "Tanpa Rombel". */
export const ROMBEL_KOSONG = 'TANPA_ROMBEL';

/** Filter roster dasbor: tahun keterlibatan + rombel + status. */
export interface DashboardFilter {
  /** Tahun ajaran ('all' = semua). Nilai tak valid diperlakukan sebagai 'all'. */
  tahun: string;
  /** Rombel persis, ROMBEL_KOSONG, atau 'all'. */
  rombel: string;
  /** Status siswa persis atau 'all'. */
  status: string;
}

export const DEFAULT_DASHBOARD_FILTER: DashboardFilter = {
  tahun: 'all',
  rombel: 'all',
  status: 'all',
};

/** Kondisi drill-down: satu predikat yang dipakai dasbor DAN Master Siswa,
 *  sehingga angka di dasbor selalu sama dengan isi daftar tujuannya. */
export type KondisiDrillDown =
  | 'semua'
  | 'data-kosong'
  | 'data-tidak-valid'
  | 'dokumen'
  | 'tanpa-rombel'
  | 'tanpa-nisn'
  | 'tanpa-tanggal-lahir'
  | 'tanpa-foto'
  | 'mutasi-surat'
  | 'raport-belum'
  | 'diterima-rentang'
  | 'keluar-rentang';

export const KONDISI_LABELS: Record<KondisiDrillDown, string> = {
  semua: 'Semua siswa',
  'data-kosong': 'Data wajib kosong',
  'data-tidak-valid': 'Data tidak valid',
  dokumen: 'Dokumen belum lengkap',
  'tanpa-rombel': 'Belum ditempatkan ke rombel',
  'tanpa-nisn': 'Tanpa NISN',
  'tanpa-tanggal-lahir': 'Tanpa tanggal lahir',
  'tanpa-foto': 'Tanpa foto',
  'mutasi-surat': 'Mutasi tanpa surat',
  'raport-belum': 'Raport semester berjalan belum ada',
  'diterima-rentang': 'Diterima dalam rentang tanggal',
  'keluar-rentang': 'Keluar dalam rentang tanggal',
};

/** Konteks predikat kondisi (daftar penuh untuk deteksi duplikat, dsb.). */
export interface KonteksKondisi {
  /** Daftar penuh (sudah terpotong hak akses) — dipakai deteksi duplikat NISN/NIK/NIPD. */
  semua?: Siswa[];
  tahun?: string | null;
  semester?: '1' | '2' | null;
  dari?: string;
  sampai?: string;
}

/** Filter yang diteruskan dasbor -> Master Siswa / Raport (preset). */
export interface SiswaPresetFilter {
  rombel?: string;
  tingkat?: string;
  status?: string;
  tahun?: string;
  kondisi?: KondisiDrillDown;
  dari?: string;
  sampai?: string;
}

// ---------------- Predikat dasar (satu sumber kebenaran) ----------------

function teks(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Data wajib kosong — field yang sama dengan cek kelengkapan lama
 *  (OperatorDashboard / DashboardStats): nama, NISN, NIK, nama ayah, nama
 *  ibu, asal SD/MI. */
export function dataWajibKosong(s: Siswa): boolean {
  if (!s) return true;
  return !(
    teks(s.namaLengkap) &&
    teks(s.nisn) &&
    teks(s.nik) &&
    teks(s.ayah?.nama) &&
    teks(s.ibu?.nama) &&
    teks(s.asalSdMi)
  );
}

/** Data tidak valid menurut aturan identitas yang sama dengan form
 *  (validateIdentitasSiswa): format NISN/NIK/NIPD/No.KK, duplikat, dan
 *  tanggal lahir (masa depan / setelah tanggal diterima). Peringatan
 *  non-blokir (mis. tanggal lahir kosong) TIDAK dihitung sebagai tidak
 *  valid — kekosongan ditangkap tugas "data wajib kosong" / "tanpa
 *  tanggal lahir". */
export function identitasTidakValid(s: Siswa, semua: Siswa[] = []): boolean {
  if (!s) return true;
  try {
    return validateIdentitasSiswa(s, semua).length > 0;
  } catch {
    return false;
  }
}

export function tanpaNisn(s: Siswa): boolean {
  return !teks(s?.nisn);
}

export function tanpaTanggalLahir(s: Siswa): boolean {
  return !teks(s?.tanggalLahir);
}

export function tanpaRombel(s: Siswa): boolean {
  return !teks(s?.rombelSaatIni);
}

export function tanpaFoto(s: Siswa): boolean {
  return !teks(s?.fotoUrl);
}

/** Alasan dokumen belum lengkap (kosong = dokumen lengkap).
 *  Aturan diturunkan dari field yang benar-benar ada:
 *  - foto kosong -> kartu pelajar tak bisa dicetak;
 *  - siswa pindahan tanpa noSuratPenerimaan;
 *  - siswa Mutasi Keluar tanpa noSuratMutasi;
 *  - siswa Lulus tanpa noIjazahSmp. */
export function alasanDokumenBelumLengkap(s: Siswa): string[] {
  if (!s) return ['Data siswa tidak terbaca'];
  const alasan: string[] = [];
  if (!teks(s.fotoUrl)) alasan.push('Foto (kartu pelajar)');
  const pindahan =
    s.jenisPendaftaran === 'Pindahan' || s.jalurMasuk === 'Mutasi/Pindahan';
  if (pindahan && !teks(s.noSuratPenerimaan)) {
    alasan.push('Surat penerimaan (pindahan)');
  }
  if (s.statusSiswa === 'Mutasi Keluar' && !teks(s.noSuratMutasi)) {
    alasan.push('Surat mutasi keluar');
  }
  if (s.statusSiswa === 'Lulus' && !teks(s.noIjazahSmp)) {
    alasan.push('Ijazah SMP');
  }
  return alasan;
}

export function dokumenBelumLengkap(s: Siswa): boolean {
  return alasanDokumenBelumLengkap(s).length > 0;
}

/** Mutasi perlu tindak lanjut: status Mutasi Keluar tetapi surat mutasi
 *  belum dilengkapi. (Bukan antrean persetujuan — antrean itu tidak ada
 *  di model data; lihat catatan kepala berkas.) */
export function mutasiPerluTindakLanjut(s: Siswa): boolean {
  return !!s && s.statusSiswa === 'Mutasi Keluar' && !teks(s.noSuratMutasi);
}

/** Raport semester berjalan belum ada (hanya siswa Aktif). */
export function raportBelum(s: Siswa, tahun?: string | null, semester?: '1' | '2' | null): boolean {
  if (!s || s.statusSiswa !== 'Aktif') return false;
  const t = normalizeTahun(tahun);
  if (!t || (semester !== '1' && semester !== '2')) return false;
  try {
    return !getRaportList(s).some(
      (r) => normalizeTahun(r.tahunAjaran) === t && r.semester === semester
    );
  } catch {
    return false;
  }
}

// ---------------- Tanggal ----------------

/** Parse 'YYYY-MM-DD' sebagai tanggal lokal; null bila tak valid
 *  (termasuk tanggal tak ada seperti 2026-02-30). */
export function parseTanggalYmd(v: unknown): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(teks(v));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function tanggalDalamRentang(v: unknown, dari: string, sampai: string): boolean {
  const d = parseTanggalYmd(v);
  if (!d) return false;
  const a = parseTanggalYmd(dari);
  const b = parseTanggalYmd(sampai);
  if (a && d.getTime() < a.getTime()) return false;
  if (b && d.getTime() > b.getTime()) return false;
  return true;
}

/** Rentang valid bila kedua ujung diisi tanggal valid dan dari <= sampai.
 *  Rentang kosong (keduanya kosong) = tidak ada pembatasan, dianggap valid. */
export function rentangTanggalValid(dari: string, sampai: string): boolean {
  const a = teks(dari);
  const b = teks(sampai);
  if (!a && !b) return true;
  const da = parseTanggalYmd(a);
  const db = parseTanggalYmd(b);
  if (a && !da) return false;
  if (b && !db) return false;
  if (da && db && da.getTime() > db.getTime()) return false;
  return true;
}

// ---------------- Predikat kondisi gabungan ----------------

/** Satu predikat untuk satu kondisi drill-down. Dipakai dasbor (hitung
 *  angka) dan Master Siswa (saring daftar) agar keduanya selalu sepakat. */
export function cocokKondisi(s: Siswa, kondisi: KondisiDrillDown, ctx: KonteksKondisi = {}): boolean {
  switch (kondisi) {
    case 'semua':
      return true;
    case 'data-kosong':
      return dataWajibKosong(s);
    case 'data-tidak-valid':
      return identitasTidakValid(s, ctx.semua || []);
    case 'dokumen':
      return dokumenBelumLengkap(s);
    case 'tanpa-rombel':
      return tanpaRombel(s);
    case 'tanpa-nisn':
      return tanpaNisn(s);
    case 'tanpa-tanggal-lahir':
      return tanpaTanggalLahir(s);
    case 'tanpa-foto':
      return tanpaFoto(s);
    case 'mutasi-surat':
      return mutasiPerluTindakLanjut(s);
    case 'raport-belum':
      return raportBelum(s, ctx.tahun, ctx.semester);
    case 'diterima-rentang':
      return tanggalDalamRentang(s?.tanggalDiterima, ctx.dari || '', ctx.sampai || '');
    case 'keluar-rentang':
      return tanggalDalamRentang(s?.tanggalKeluar, ctx.dari || '', ctx.sampai || '');
    default:
      return false;
  }
}

// ---------------- Filter roster ----------------

function daftarBersih(siswa: Siswa[] | null | undefined): Siswa[] {
  return (siswa || []).filter(Boolean);
}

/** Terapkan filter roster dasbor. Rentang tanggal TIDAK memengaruhi roster:
 *  roster adalah potret keadaan sekarang, sedangkan rentang tanggal hanya
 *  membatasi widget Arus (penerimaan/keluar). */
export function terapkanFilterDasbor(
  siswa: Siswa[] | null | undefined,
  filter: DashboardFilter | null | undefined
): Siswa[] {
  const list = daftarBersih(siswa);
  if (!filter) return list;
  // 'all' = tanpa filter tahun. Nilai tak valid (bukan 'all' dan bukan
  // format TAHUN/TAHUN) juga diperlakukan sebagai 'all' — JANGAN teruskan
  // mentah ke siswaTerlibatTahun karena string apa pun yang tak cocok
  // dengan catatan tahun siswa akan membuang SELURUH daftar.
  const tahunRaw = teks(filter.tahun);
  const tahun = tahunRaw === 'all' ? '' : isValidTahun(tahunRaw) ? normalizeTahun(tahunRaw) : '';
  const rombel = teks(filter.rombel);
  const status = teks(filter.status);
  return list.filter((s) => {
    if (tahun && !siswaTerlibatTahun(s, tahun)) return false;
    if (rombel && rombel !== 'all') {
      if (rombel === ROMBEL_KOSONG) {
        if (!tanpaRombel(s)) return false;
      } else if (teks(s.rombelSaatIni) !== rombel) {
        return false;
      }
    }
    if (status && status !== 'all' && s.statusSiswa !== status) return false;
    return true;
  });
}

// ---------------- Ringkasan ----------------

export interface RingkasanPerRombel {
  nama: string;
  total: number;
  laki: number;
  perempuan: number;
}

export interface RingkasanDashboard {
  total: number;
  laki: number;
  perempuan: number;
  perStatus: Record<StatusSiswa, number>;
  perRombel: RingkasanPerRombel[];
  tanpaRombel: number;
}

/** Ringkasan roster (sudah terfilter). Status tak dikenal tetap dihitung
 *  di total, tetapi tidak masuk perStatus (perStatus hanya 5 status sah). */
export function hitungRingkasan(siswa: Siswa[] | null | undefined): RingkasanDashboard {
  const list = daftarBersih(siswa);
  const perStatus = {} as Record<StatusSiswa, number>;
  for (const st of STATUS_SISWA_OPTIONS) perStatus[st] = 0;
  const perRombelMap = new Map<string, RingkasanPerRombel>();
  let laki = 0;
  for (const s of list) {
    if (s.jenisKelamin === 'L') laki += 1;
    if (s.statusSiswa && s.statusSiswa in perStatus) {
      perStatus[s.statusSiswa as StatusSiswa] += 1;
    }
    const nama = teks(s.rombelSaatIni) || 'Tanpa Rombel';
    const row = perRombelMap.get(nama) || { nama, total: 0, laki: 0, perempuan: 0 };
    row.total += 1;
    if (s.jenisKelamin === 'L') row.laki += 1;
    else row.perempuan += 1;
    perRombelMap.set(nama, row);
  }
  const perRombel = [...perRombelMap.values()].sort((a, b) => a.nama.localeCompare(b.nama));
  return {
    total: list.length,
    laki,
    perempuan: list.length - laki,
    perStatus,
    perRombel,
    tanpaRombel: list.filter(tanpaRombel).length,
  };
}

// ---------------- Arus siswa (rentang tanggal) ----------------

export interface ArusSiswa {
  diterima: number;
  keluar: number;
  keluarPerStatus: Partial<Record<StatusSiswa, number>>;
  /** false bila rentang tak valid (dari > sampai / format salah) — pemanggil
   *  menampilkan pesan, bukan angka. */
  rentangValid: boolean;
  /** true bila rentang diisi (membatasi arus); false = seluruh riwayat. */
  rentangAktif: boolean;
}

/** Penerimaan (tanggalDiterima) & keluar (tanggalKeluar) dalam rentang.
 *  Tanpa rentang = seluruh riwayat. Tanggal kosong/tak valid diabaikan
 *  (tidak dihitung), bukan ditebak. */
export function hitungArus(
  siswa: Siswa[] | null | undefined,
  dari: string,
  sampai: string
): ArusSiswa {
  const list = daftarBersih(siswa);
  const rentangValid = rentangTanggalValid(dari, sampai);
  const rentangAktif = !!(teks(dari) || teks(sampai));
  if (!rentangValid) {
    return { diterima: 0, keluar: 0, keluarPerStatus: {}, rentangValid, rentangAktif };
  }
  let diterima = 0;
  let keluar = 0;
  const keluarPerStatus: Partial<Record<StatusSiswa, number>> = {};
  for (const s of list) {
    if (tanggalDalamRentang(s.tanggalDiterima, dari, sampai)) diterima += 1;
    if (tanggalDalamRentang(s.tanggalKeluar, dari, sampai)) {
      keluar += 1;
      const st = s.statusSiswa as StatusSiswa;
      if (st) keluarPerStatus[st] = (keluarPerStatus[st] || 0) + 1;
    }
  }
  return { diterima, keluar, keluarPerStatus, rentangValid, rentangAktif };
}

// ---------------- Tugas tertunda ----------------

export interface TugasTertunda {
  id: KondisiDrillDown;
  judul: string;
  deskripsi: string;
  jumlah: number;
  /** Id siswa pembentuk angka — drill-down membuka persis daftar ini. */
  ids: string[];
  /** Tab tujuan drill-down. */
  tujuan: 'siswa' | 'raport';
}

export interface OpsiTugas {
  tahunAktif?: string | null;
  semesterAktif?: '1' | '2' | null;
}

/** Widget pekerjaan tertunda dari data nyata. Tugas 'raport-belum' hanya
 *  muncul bila tahun+semester tersedia; bila tidak, tugas itu dilewati
 *  (bukan diisi angka tebakan). */
export function hitungTugas(
  siswa: Siswa[] | null | undefined,
  opts: OpsiTugas = {}
): TugasTertunda[] {
  const list = daftarBersih(siswa);
  const ctx: KonteksKondisi = { semua: list, tahun: opts.tahunAktif, semester: opts.semesterAktif };
  const definisi: Array<{
    id: KondisiDrillDown;
    judul: string;
    deskripsi: string;
    tujuan: 'siswa' | 'raport';
    tampil: boolean;
  }> = [
    {
      id: 'data-kosong',
      judul: 'Data wajib kosong',
      deskripsi: 'Nama, NISN, NIK, nama orang tua, atau asal sekolah masih kosong.',
      tujuan: 'siswa',
      tampil: true,
    },
    {
      id: 'data-tidak-valid',
      judul: 'Data tidak valid',
      deskripsi: 'Format NISN/NIK/NIPD/No. KK salah, duplikat, atau tanggal lahir tak masuk akal.',
      tujuan: 'siswa',
      tampil: true,
    },
    {
      id: 'dokumen',
      judul: 'Dokumen belum lengkap',
      deskripsi: 'Foto, surat penerimaan pindahan, surat mutasi, atau ijazah belum dilengkapi.',
      tujuan: 'siswa',
      tampil: true,
    },
    {
      id: 'tanpa-rombel',
      judul: 'Siswa belum ditempatkan ke rombel',
      deskripsi: 'Belum punya rombel belajar — tempatkan via Master Siswa / Pemetaan Kelas.',
      tujuan: 'siswa',
      tampil: true,
    },
    {
      id: 'raport-belum',
      judul: 'Raport semester berjalan belum ada',
      deskripsi: 'Siswa aktif tanpa nilai semester berjalan.',
      tujuan: 'raport',
      tampil: !!(normalizeTahun(opts.tahunAktif) && (opts.semesterAktif === '1' || opts.semesterAktif === '2')),
    },
    {
      id: 'mutasi-surat',
      judul: 'Mutasi keluar tanpa surat',
      deskripsi: 'Sudah berstatus Mutasi Keluar tetapi nomor surat mutasi belum diisi.',
      tujuan: 'siswa',
      tampil: true,
    },
  ];
  const hasil: TugasTertunda[] = [];
  for (const d of definisi) {
    if (!d.tampil) continue;
    const anggota = list.filter((s) => cocokKondisi(s, d.id, ctx));
    hasil.push({
      id: d.id,
      judul: d.judul,
      deskripsi: d.deskripsi,
      jumlah: anggota.length,
      ids: anggota.map((s) => s.id).filter(Boolean),
      tujuan: d.tujuan,
    });
  }
  return hasil;
}

// ---------------- Tenggat laporan ----------------

export interface ItemTenggat {
  id: string;
  judul: string;
  detail: string;
  /** Tanggal tenggat bila tersimpan di data. SELALU undefined saat ini:
   *  model data tidak menyimpan tanggal tenggat (lihat catatan kepala
   *  berkas) — UI wajib menampilkan item tanpa tanggal, bukan mengarang. */
  tanggal?: string;
  tujuan: 'backup' | 'raport';
  mendesak: boolean;
}

export interface OpsiTenggat {
  /** Hari sejak backup terakhir; null = belum pernah. */
  hariSejakBackup: number | null;
  raportBelum: number;
  raportTotal: number;
  tahunAktif?: string | null;
  semesterAktif?: '1' | '2' | null;
}

/** Tenggat & kewajiban laporan mendatang dari data nyata saja. */
export function hitungTenggat(opts: OpsiTenggat): ItemTenggat[] {
  const items: ItemTenggat[] = [];
  const { hariSejakBackup } = opts;
  if (hariSejakBackup === null) {
    items.push({
      id: 'backup-belum-pernah',
      judul: 'Backup belum pernah berjalan',
      detail: 'Belum ada backup otomatis yang tercatat. Jalankan backup di tab Backup.',
      tujuan: 'backup',
      mendesak: true,
    });
  } else if (hariSejakBackup > 14) {
    items.push({
      id: 'backup-kedaluwarsa',
      judul: 'Backup terakhir sudah lama',
      detail: `Backup terakhir ${hariSejakBackup} hari lalu (batas sehat: 14 hari).`,
      tujuan: 'backup',
      mendesak: true,
    });
  }
  const tahun = normalizeTahun(opts.tahunAktif);
  if (tahun && (opts.semesterAktif === '1' || opts.semesterAktif === '2')) {
    const sudah = Math.max(0, opts.raportTotal - opts.raportBelum);
    items.push({
      id: 'raport-berjalan',
      judul: `Laporan raport TP ${tahun} Semester ${opts.semesterAktif}`,
      detail:
        opts.raportTotal > 0
          ? `${sudah} dari ${opts.raportTotal} siswa aktif sudah punya nilai semester berjalan.`
          : 'Belum ada siswa aktif pada semester berjalan.',
      tujuan: 'raport',
      mendesak: opts.raportBelum > 0,
    });
  }
  return items;
}
