// ---------------- PEMERIKSA DATA SISWA (Issue #3) ----------------
// Mesin pemeriksa kelengkapan, validitas, inkonsistensi, dan duplikasi
// data siswa. MURNI (tanpa IO / DOM / IndexedDB) agar mudah diuji.
//
// Prinsip:
//  1. TIDAK PERNAH mengubah/menghapus data — hanya menghasilkan daftar
//     temuan untuk ditinjau dan diperbaiki manual lewat formulir.
//  2. Duplikat hanya "kemungkinan" — tidak ada penggabungan/penghapusan
//     otomatis. Temuan duplikat selalu butuh keputusan manusia.
//  3. Aturan terkonfigurasi (daftar ATURAN_PEMERIKSA di bawah adalah
//     satu-satunya sumber kebenaran) dan didokumentasikan di
//     docs/03-model-data.md §4a + docs/05-operasional.md §4e.
//  4. Privasi: temuan hanya menyimpan ID siswa + ID aturan + status
//     penanganan — TIDAK menyimpan nama/NISN/NIK atau data pribadi lain.
//     Nama ditampilkan di UI dengan resolve dari daftar siswa yang sudah
//     terfilter hak akses pemanggil.
//  5. Pemeriksaan per-record (wajib/format/rentang/konflik) hanya berlaku
//     untuk siswa Aktif — record non-aktif (Lulus/Mutasi/...) adalah arsip
//     historis dan tidak dibebani kelengkapan. Pemeriksaan duplikat
//     berlaku untuk SEMUA record karena identitas ganda tetap bermasalah
//     meski salah satunya arsip.

import type { Siswa } from '../types';

export type PrioritasTemuan = 'tinggi' | 'sedang' | 'rendah';
export type KategoriTemuan = 'wajib' | 'format' | 'rentang' | 'konflik' | 'duplikat' | 'impor';
export type StatusTemuan = 'belum-diperiksa' | 'diperbaiki' | 'diabaikan';

/** Satu aturan pemeriksaan. `aktif` = bawaan (dapat diubah pengguna). */
export interface AturanPemeriksa {
  id: string;
  kategori: Exclude<KategoriTemuan, 'impor'>;
  prioritas: PrioritasTemuan;
  judul: string;
  /** Penjelasan aturan dalam bahasa pengguna (tampil di UI + docs). */
  penjelasan: string;
  aktif: boolean;
}

export const ATURAN_PEMERIKSA: AturanPemeriksa[] = [
  { id: 'nama-kosong', kategori: 'wajib', prioritas: 'tinggi', judul: 'Nama lengkap kosong', penjelasan: 'Nama lengkap wajib diisi untuk setiap siswa aktif.', aktif: true },
  { id: 'nisn-kosong', kategori: 'wajib', prioritas: 'tinggi', judul: 'NISN kosong', penjelasan: 'NISN wajib diisi untuk setiap siswa aktif.', aktif: true },
  { id: 'nisn-format', kategori: 'format', prioritas: 'tinggi', judul: 'NISN bukan 10 digit angka', penjelasan: 'NISN harus tepat 10 digit angka bila diisi.', aktif: true },
  { id: 'nik-format', kategori: 'format', prioritas: 'sedang', judul: 'NIK bukan 16 digit angka', penjelasan: 'NIK harus 16 digit angka bila diisi.', aktif: true },
  { id: 'nokk-format', kategori: 'format', prioritas: 'rendah', judul: 'No. KK bukan 16 digit angka', penjelasan: 'Nomor Kartu Keluarga harus 16 digit angka bila diisi.', aktif: true },
  { id: 'nipd-format', kategori: 'format', prioritas: 'rendah', judul: 'NIPD di luar 3–20 karakter', penjelasan: 'NIPD harus 3–20 karakter bila diisi.', aktif: true },
  { id: 'nik-ortu-format', kategori: 'format', prioritas: 'rendah', judul: 'NIK orang tua bukan 16 digit angka', penjelasan: 'NIK ayah/ibu harus 16 digit angka bila diisi.', aktif: true },
  { id: 'tgl-lahir-kosong', kategori: 'wajib', prioritas: 'sedang', judul: 'Tanggal lahir kosong', penjelasan: 'Tanggal lahir wajib diisi untuk setiap siswa aktif.', aktif: true },
  { id: 'tgl-lahir-format', kategori: 'format', prioritas: 'tinggi', judul: 'Tanggal lahir tidak valid / masa depan', penjelasan: 'Tanggal lahir harus tanggal kalender yang valid (YYYY-MM-DD) dan tidak boleh di masa depan.', aktif: true },
  { id: 'rombel-kosong', kategori: 'wajib', prioritas: 'sedang', judul: 'Rombel saat ini kosong', penjelasan: 'Siswa aktif harus terdaftar di satu rombel.', aktif: true },
  { id: 'alamat-kosong', kategori: 'wajib', prioritas: 'rendah', judul: 'Alamat kosong', penjelasan: 'Alamat tempat tinggal sebaiknya diisi untuk setiap siswa aktif.', aktif: true },
  { id: 'kodepos-format', kategori: 'format', prioritas: 'rendah', judul: 'Kode pos bukan 5 digit angka', penjelasan: 'Kode pos harus 5 digit angka bila diisi.', aktif: true },
  { id: 'lahir-setelah-diterima', kategori: 'konflik', prioritas: 'tinggi', judul: 'Tanggal lahir setelah tanggal diterima', penjelasan: 'Tanggal lahir tidak boleh setelah tanggal diterima di sekolah.', aktif: true },
  { id: 'usia-diterima-tidak-wajar', kategori: 'konflik', prioritas: 'sedang', judul: 'Usia saat diterima di luar rentang wajar', penjelasan: 'Usia saat diterima dihitung dari tanggal lahir ke tanggal diterima; di luar 4–18 tahun dianggap tidak wajar dan perlu dicek (kemungkinan salah ketik tahun).', aktif: true },
  { id: 'tanggal-keluar-aktif', kategori: 'konflik', prioritas: 'sedang', judul: 'Siswa aktif tetapi punya tanggal keluar', penjelasan: 'Tanggal keluar hanya untuk siswa berstatus non-aktif; kosongkan bila siswa masih aktif.', aktif: true },
  { id: 'pindahan-tanpa-asal', kategori: 'konflik', prioritas: 'sedang', judul: 'Pindahan tanpa asal mutasi', penjelasan: 'Siswa dengan jenis pendaftaran Pindahan wajib mencantumkan asal mutasi.', aktif: true },
  { id: 'nik-ortu-sama', kategori: 'konflik', prioritas: 'sedang', judul: 'NIK ayah sama dengan NIK ibu', penjelasan: 'NIK ayah dan ibu tidak boleh sama; kemungkinan salah salin.', aktif: true },
  { id: 'anakke-rentang', kategori: 'rentang', prioritas: 'rendah', judul: 'Anak ke di luar rentang wajar', penjelasan: 'Anak ke harus 1–30.', aktif: true },
  { id: 'fisik-rentang', kategori: 'rentang', prioritas: 'rendah', judul: 'Tinggi/berat badan di luar rentang wajar', penjelasan: 'Tinggi badan 50–220 cm dan berat badan 5–200 kg; di luar itu kemungkinan salah satuan/salah ketik.', aktif: true },
  { id: 'jarak-rentang', kategori: 'rentang', prioritas: 'rendah', judul: 'Jarak ke sekolah di luar rentang wajar', penjelasan: 'Jarak ke sekolah 0–150 km; di luar itu kemungkinan salah satuan/salah ketik.', aktif: true },
  { id: 'lama-sd-rentang', kategori: 'rentang', prioritas: 'rendah', judul: 'Lama belajar SD di luar rentang wajar', penjelasan: 'Lama belajar di SD/MI 0–12 tahun.', aktif: true },
  { id: 'tahun-lahir-ortu-rentang', kategori: 'rentang', prioritas: 'rendah', judul: 'Tahun lahir orang tua di luar rentang wajar', penjelasan: 'Tahun lahir ayah/ibu harus 4 digit tahun 1900 sampai tahun berjalan bila diisi.', aktif: true },
  { id: 'duplikat-nisn', kategori: 'duplikat', prioritas: 'tinggi', judul: 'NISN dipakai lebih dari satu siswa', penjelasan: 'NISN harus unik. Dua record dengan NISN sama adalah kemungkinan duplikat — periksa dan perbaiki manual, jangan digabung otomatis.', aktif: true },
  { id: 'duplikat-nik', kategori: 'duplikat', prioritas: 'tinggi', judul: 'NIK dipakai lebih dari satu siswa', penjelasan: 'NIK harus unik. Dua record dengan NIK sama adalah kemungkinan duplikat — periksa manual.', aktif: true },
  { id: 'duplikat-nipd', kategori: 'duplikat', prioritas: 'sedang', judul: 'NIPD dipakai lebih dari satu siswa', penjelasan: 'NIPD harus unik dalam satu sekolah. Dua record dengan NIPD sama adalah kemungkinan duplikat — periksa manual.', aktif: true },
  { id: 'duplikat-kemungkinan', kategori: 'duplikat', prioritas: 'sedang', judul: 'Kemungkinan siswa duplikat (nama + tanggal lahir sama)', penjelasan: 'Nama dan tanggal lahir sama tetapi NISN berbeda. Bisa jadi siswa yang sama tercatat dua kali, atau dua anak berbeda (mis. kembar) — selalu periksa manual, jangan digabung otomatis.', aktif: true },
  { id: 'duplikat-nama-mirip', kategori: 'duplikat', prioritas: 'sedang', judul: 'Kemungkinan siswa duplikat (nama mirip + tanggal lahir sama)', penjelasan: 'Nama hampir sama (beda ≤2 huruf, mis. salah ketik) dengan tanggal lahir yang sama. Kemungkinan salah ketik nama pada record ganda — periksa manual.', aktif: true },
];

/** Override konfigurasi aturan: { [aturanId]: aktif }. Hanya ID yang dikenal dipakai. */
export type KonfigurasiAturan = Record<string, boolean>;

export function aturanYangAktif(konfig?: KonfigurasiAturan): AturanPemeriksa[] {
  if (!konfig) return ATURAN_PEMERIKSA.filter((a) => a.aktif);
  return ATURAN_PEMERIKSA.filter((a) => (konfig[a.id] ?? a.aktif) === true);
}

export function aturanDikenal(id: string): boolean {
  return ATURAN_PEMERIKSA.some((a) => a.id === id);
}

export interface TemuanPemeriksa {
  /** Kunci stabil: `${aturanId}:${siswaId}` atau pasangan duplikat terurut. */
  id: string;
  aturanId: string;
  kategori: KategoriTemuan;
  prioritas: PrioritasTemuan;
  judul: string;
  /** Alasan temuan dalam bahasa pengguna (tanpa data pribadi). */
  alasan: string;
  /** Sumber temuan. */
  sumber: 'data-lokal' | 'impor';
  /** Siswa yang bermasalah. */
  siswaId: string;
  /** Siswa kedua pada temuan duplikat berpasangan. */
  siswaIdLain?: string;
}

interface KonteksAturan {
  aturan: Map<string, AturanPemeriksa>;
  aktif: (id: string) => boolean;
}

function konteks(konfig?: KonfigurasiAturan): KonteksAturan {
  const aktifList = aturanYangAktif(konfig);
  return {
    aturan: new Map(ATURAN_PEMERIKSA.map((a) => [a.id, a])),
    aktif: (id: string) => aktifList.some((a) => a.id === id),
  };
}

function buatTemuan(
  ctx: KonteksAturan,
  aturanId: string,
  siswaId: string,
  alasan: string,
  siswaIdLain?: string
): TemuanPemeriksa | null {
  const aturan = ctx.aturan.get(aturanId);
  if (!aturan || !ctx.aktif(aturanId)) return null;
  const id = siswaIdLain
    ? `${aturanId}:${[siswaId, siswaIdLain].sort().join(':')}`
    : `${aturanId}:${siswaId}`;
  return {
    id,
    aturanId,
    kategori: aturan.kategori,
    prioritas: aturan.prioritas,
    judul: aturan.judul,
    alasan,
    sumber: 'data-lokal',
    siswaId,
    ...(siswaIdLain ? { siswaIdLain } : {}),
  };
}

function dorong(list: TemuanPemeriksa[], t: TemuanPemeriksa | null): void {
  if (t) list.push(t);
}

/** Normalisasi nama untuk pencocokan duplikat: uppercase, tanpa gelar/tanda baca. */
export function normalisasiNama(nama: string): string {
  return (nama || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Jarak Levenshtein (dibatasi: berhenti bila > batas). */
export function jarakLevenshtein(a: string, b: string, batas = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > batas) return batas + 1;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let cur0 = i;
    const cur: number[] = [i];
    let minBaris = i;
    for (let j = 1; j <= b.length; j++) {
      const biaya = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur0 + 1, prev[j - 1] + biaya);
      cur.push(v);
      cur0 = v;
      if (v < minBaris) minBaris = v;
    }
    if (minBaris > batas) return batas + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Parse 'YYYY-MM-DD' sebagai tanggal lokal; null bila format/tanggal tak valid. */
export function parseTanggalYmd(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((v || '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

const HANYA_DIGIT = /^[0-9]+$/;

function hanyaDigit(v: string, panjang: number): boolean {
  const t = (v || '').trim();
  return t.length === panjang && HANYA_DIGIT.test(t);
}

function umurPada(lahir: Date, pada: Date): number {
  let umur = pada.getFullYear() - lahir.getFullYear();
  if (
    pada.getMonth() < lahir.getMonth() ||
    (pada.getMonth() === lahir.getMonth() && pada.getDate() < lahir.getDate())
  ) {
    umur -= 1;
  }
  return umur;
}

/**
 * Periksa satu daftar siswa (pemanggil WAJIB mengirim daftar yang sudah
 * terfilter hak akses — mis. visibleSiswa — agar operator hanya melihat
 * temuan rombelnya). Tidak mengubah input; mengembalikan temuan baru.
 */
export function periksaDataSiswa(daftar: Siswa[], konfig?: KonfigurasiAturan): TemuanPemeriksa[] {
  const ctx = konteks(konfig);
  const hasil: TemuanPemeriksa[] = [];
  const list = Array.isArray(daftar) ? daftar : [];
  const hariIni = new Date();
  hariIni.setHours(0, 0, 0, 0);
  const tahunBerjalan = hariIni.getFullYear();

  // --- Per-record: hanya siswa Aktif (arsip historis dikecualikan). ---
  for (const s of list) {
    if (s.statusSiswa !== 'Aktif') continue;
    const nama = (s.namaLengkap || '').trim();
    const nisn = (s.nisn || '').trim();
    const nik = (s.nik || '').trim();
    const noKk = (s.noKk || '').trim();
    const nipd = (s.nipd || '').trim();
    const tglLahirRaw = (s.tanggalLahir || '').trim();
    const tglDiterimaRaw = (s.tanggalDiterima || '').trim();

    if (!nama) dorong(hasil, buatTemuan(ctx, 'nama-kosong', s.id, 'Nama lengkap kosong.'));
    if (!nisn) dorong(hasil, buatTemuan(ctx, 'nisn-kosong', s.id, 'NISN kosong.'));
    else if (!hanyaDigit(nisn, 10)) dorong(hasil, buatTemuan(ctx, 'nisn-format', s.id, 'NISN harus tepat 10 digit angka.'));
    if (nik && !hanyaDigit(nik, 16)) dorong(hasil, buatTemuan(ctx, 'nik-format', s.id, 'NIK harus 16 digit angka bila diisi.'));
    if (noKk && !hanyaDigit(noKk, 16)) dorong(hasil, buatTemuan(ctx, 'nokk-format', s.id, 'No. KK harus 16 digit angka bila diisi.'));
    if (nipd && (nipd.length < 3 || nipd.length > 20)) dorong(hasil, buatTemuan(ctx, 'nipd-format', s.id, 'NIPD harus 3–20 karakter bila diisi.'));
    const nikAyah = (s.ayah?.nik || '').trim();
    const nikIbu = (s.ibu?.nik || '').trim();
    if ((nikAyah && !hanyaDigit(nikAyah, 16)) || (nikIbu && !hanyaDigit(nikIbu, 16))) {
      dorong(hasil, buatTemuan(ctx, 'nik-ortu-format', s.id, 'NIK ayah/ibu harus 16 digit angka bila diisi.'));
    }
    if (nikAyah && nikIbu && nikAyah === nikIbu) {
      dorong(hasil, buatTemuan(ctx, 'nik-ortu-sama', s.id, 'NIK ayah sama dengan NIK ibu.'));
    }

    let lahir: Date | null = null;
    if (!tglLahirRaw) {
      dorong(hasil, buatTemuan(ctx, 'tgl-lahir-kosong', s.id, 'Tanggal lahir kosong.'));
    } else {
      lahir = parseTanggalYmd(tglLahirRaw);
      if (!lahir) {
        dorong(hasil, buatTemuan(ctx, 'tgl-lahir-format', s.id, 'Tanggal lahir tidak valid (gunakan format YYYY-MM-DD).'));
      } else if (lahir.getTime() > hariIni.getTime()) {
        dorong(hasil, buatTemuan(ctx, 'tgl-lahir-format', s.id, 'Tanggal lahir di masa depan.'));
      }
    }
    if (!(s.rombelSaatIni || '').trim()) {
      dorong(hasil, buatTemuan(ctx, 'rombel-kosong', s.id, 'Rombel saat ini kosong.'));
    }
    if (!(s.alamat || '').trim()) {
      dorong(hasil, buatTemuan(ctx, 'alamat-kosong', s.id, 'Alamat tempat tinggal kosong.'));
    }
    const kodePos = (s.kodePos || '').trim();
    if (kodePos && !hanyaDigit(kodePos, 5)) {
      dorong(hasil, buatTemuan(ctx, 'kodepos-format', s.id, 'Kode pos harus 5 digit angka bila diisi.'));
    }

    const diterima = tglDiterimaRaw ? parseTanggalYmd(tglDiterimaRaw) : null;
    if (lahir && diterima) {
      if (lahir.getTime() > diterima.getTime()) {
        dorong(hasil, buatTemuan(ctx, 'lahir-setelah-diterima', s.id, 'Tanggal lahir setelah tanggal diterima di sekolah.'));
      } else {
        const umur = umurPada(lahir, diterima);
        if (umur < 4 || umur > 18) {
          dorong(hasil, buatTemuan(ctx, 'usia-diterima-tidak-wajar', s.id, `Usia saat diterima ${umur} tahun (di luar 4–18 tahun).`));
        }
      }
    }
    if ((s.tanggalKeluar || '').trim()) {
      dorong(hasil, buatTemuan(ctx, 'tanggal-keluar-aktif', s.id, 'Siswa berstatus Aktif tetapi tanggal keluar terisi.'));
    }
    if (s.jenisPendaftaran === 'Pindahan' && !(s.asalMutasi || '').trim()) {
      dorong(hasil, buatTemuan(ctx, 'pindahan-tanpa-asal', s.id, 'Jenis pendaftaran Pindahan tetapi asal mutasi kosong.'));
    }
    if (typeof s.anakKe === 'number' && (s.anakKe < 1 || s.anakKe > 30)) {
      dorong(hasil, buatTemuan(ctx, 'anakke-rentang', s.id, 'Anak ke di luar 1–30.'));
    }
    const tb = Number(s.tinggiBadan);
    const bb = Number(s.beratBadan);
    if ((Number.isFinite(tb) && tb > 0 && (tb < 50 || tb > 220)) || (Number.isFinite(bb) && bb > 0 && (bb < 5 || bb > 200))) {
      dorong(hasil, buatTemuan(ctx, 'fisik-rentang', s.id, 'Tinggi/berat badan di luar rentang wajar.'));
    }
    const jarak = Number(s.jarakKeSekolahKm);
    if (Number.isFinite(jarak) && (jarak < 0 || jarak > 150)) {
      dorong(hasil, buatTemuan(ctx, 'jarak-rentang', s.id, 'Jarak ke sekolah di luar 0–150 km.'));
    }
    const lamaSd = Number(s.lamaBelajarSd);
    if (Number.isFinite(lamaSd) && (lamaSd < 0 || lamaSd > 12)) {
      dorong(hasil, buatTemuan(ctx, 'lama-sd-rentang', s.id, 'Lama belajar SD di luar 0–12 tahun.'));
    }
    for (const [label, thn] of [['ayah', s.ayah?.tahunLahir], ['ibu', s.ibu?.tahunLahir]] as const) {
      const t = (thn || '').trim();
      if (t) {
        const n = Number(t);
        if (!/^\d{4}$/.test(t) || n < 1900 || n > tahunBerjalan) {
          dorong(hasil, buatTemuan(ctx, 'tahun-lahir-ortu-rentang', s.id, `Tahun lahir ${label} di luar 1900–${tahunBerjalan}.`));
          break;
        }
      }
    }
  }

  // --- Duplikat: semua record (Aktif + arsip). Satu temuan per pasangan. ---
  const kelompok = (field: 'nisn' | 'nik' | 'nipd', aturanId: string, label: string) => {
    const peta = new Map<string, Siswa[]>();
    for (const s of list) {
      const v = ((s as unknown as Record<string, string>)[field] || '').trim();
      if (!v) continue;
      const arr = peta.get(v) || [];
      arr.push(s);
      peta.set(v, arr);
    }
    for (const [nilai, grup] of peta) {
      for (let i = 0; i < grup.length; i++) {
        for (let j = i + 1; j < grup.length; j++) {
          void nilai;
          dorong(hasil, buatTemuan(ctx, aturanId, grup[i].id, `${label} yang sama dipakai dua record. Periksa manual — jangan digabung otomatis.`, grup[j].id));
        }
      }
    }
  };
  kelompok('nisn', 'duplikat-nisn', 'NISN');
  kelompok('nik', 'duplikat-nik', 'NIK');
  kelompok('nipd', 'duplikat-nipd', 'NIPD');

  // Kemungkinan duplikat: nama (persis / mirip) + tanggal lahir sama, NISN berbeda.
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const ttlA = (a.tanggalLahir || '').trim();
      const ttlB = (b.tanggalLahir || '').trim();
      if (!ttlA || ttlA !== ttlB) continue;
      const namaA = normalisasiNama(a.namaLengkap);
      const namaB = normalisasiNama(b.namaLengkap);
      if (!namaA || !namaB) continue;
      if (namaA === namaB) {
        const nisnA = (a.nisn || '').trim();
        const nisnB = (b.nisn || '').trim();
        if (nisnA && nisnB && nisnA !== nisnB) {
          dorong(hasil, buatTemuan(ctx, 'duplikat-kemungkinan', a.id, 'Nama dan tanggal lahir sama, tetapi NISN berbeda. Kemungkinan record ganda — periksa manual.', b.id));
        }
      } else if (namaA.length >= 4 && namaB.length >= 4 && jarakLevenshtein(namaA, namaB, 2) <= 2) {
        dorong(hasil, buatTemuan(ctx, 'duplikat-nama-mirip', a.id, 'Nama hampir sama (beda ≤2 huruf) dengan tanggal lahir yang sama. Kemungkinan salah ketik pada record ganda — periksa manual.', b.id));
      }
    }
  }

  return hasil;
}

// ---------------- Status penanganan temuan ----------------
// Disimpan di localStorage per-database sekolah (kunci di PemeriksaDataView).
// Hanya ID temuan + status + alasan — tanpa data pribadi siswa.

export interface StatusPenanganan {
  status: StatusTemuan;
  /** Wajib diisi bila status = 'diabaikan'. */
  alasan?: string;
  /** ISO timestamp penanganan terakhir. */
  pada: string;
}

export type PetaStatusTemuan = Record<string, StatusPenanganan>;

export function statusEfektifTemuan(temuan: TemuanPemeriksa, peta: PetaStatusTemuan): StatusTemuan {
  return peta[temuan.id]?.status || 'belum-diperiksa';
}

/**
 * Kembalikan peta status baru dengan satu temuan ditandai.
 * Mengabaikan temuan tanpa alasan ditolak (Error) — alasan wajib agar
 * pengabaian dapat dipertanggungjawabkan.
 */
export function tandaiTemuan(
  peta: PetaStatusTemuan,
  temuanId: string,
  status: StatusTemuan,
  alasan?: string
): PetaStatusTemuan {
  if (status === 'diabaikan' && !(alasan || '').trim()) {
    throw new Error('Alasan wajib diisi saat mengabaikan temuan.');
  }
  return {
    ...peta,
    [temuanId]: { status, alasan: (alasan || '').trim() || undefined, pada: new Date().toISOString() },
  };
}

export interface RingkasanPemeriksa {
  total: number;
  tinggi: number;
  sedang: number;
  rendah: number;
  belumDiperiksa: number;
  diperbaiki: number;
  diabaikan: number;
}

export function ringkasanTemuan(temuan: TemuanPemeriksa[], peta: PetaStatusTemuan): RingkasanPemeriksa {
  const r: RingkasanPemeriksa = { total: temuan.length, tinggi: 0, sedang: 0, rendah: 0, belumDiperiksa: 0, diperbaiki: 0, diabaikan: 0 };
  for (const t of temuan) {
    if (t.prioritas === 'tinggi') r.tinggi += 1;
    else if (t.prioritas === 'sedang') r.sedang += 1;
    else r.rendah += 1;
    const st = statusEfektifTemuan(t, peta);
    if (st === 'diperbaiki') r.diperbaiki += 1;
    else if (st === 'diabaikan') r.diabaikan += 1;
    else r.belumDiperiksa += 1;
  }
  return r;
}

// ---------------- Perbandingan data impor vs data saat ini ----------------
// Dipakai untuk pratinjau impor (CSV) SEBELUM data apa pun ditulis.
// Tidak mengubah/menghapus data. Hasilnya hanya daftar perbedaan untuk ditinjau.

export interface BarisImpor {
  nisn: string;
  namaLengkap: string;
  tanggalLahir?: string;
  rombelSaatIni?: string;
  nik?: string;
}

export type HasilBandingImpor = 'baru' | 'sama' | 'berbeda' | 'konflik' | 'tanpa-kunci';

export interface TemuanImpor {
  /** NISN baris impor (kosong bila tanpa-kunci). */
  nisn: string;
  namaImpor: string;
  status: HasilBandingImpor;
  /** Daftar perbedaan "Field: lama -> baru" (tanpa nilai bila sama). */
  perubahan: string[];
  /** ID siswa lokal yang cocok (bila ada). */
  siswaId?: string;
  alasan: string;
}

function bedaField(label: string, lama: string, baru: string, perubahan: string[]): void {
  if ((lama || '').trim() !== (baru || '').trim()) {
    perubahan.push(`${label}: "${lama || '-'}" -> "${baru || '-'}"`);
  }
}

/**
 * Bandingkan baris impor dengan data saat ini, dicocokkan lewat NISN.
 * Konflik = NIK baris impor milik siswa lain (dua identitas bertabrakan)
 * — baris seperti ini TIDAK BOLEH diterapkan tanpa tinjauan manual.
 */
export function bandingkanDenganImpor(impor: BarisImpor[], existing: Siswa[]): TemuanImpor[] {
  const byNisn = new Map<string, Siswa>();
  const byNik = new Map<string, Siswa>();
  for (const s of existing) {
    if ((s.nisn || '').trim()) byNisn.set(s.nisn.trim(), s);
    if ((s.nik || '').trim()) byNik.set(s.nik.trim(), s);
  }
  const hasil: TemuanImpor[] = [];
  for (const baris of impor || []) {
    const nisn = (baris.nisn || '').trim();
    const nama = (baris.namaLengkap || '').trim();
    if (!nisn) {
      hasil.push({ nisn: '', namaImpor: nama, status: 'tanpa-kunci', perubahan: [], alasan: 'Baris tanpa NISN tidak dapat dicocokkan ke data saat ini — lengkapi NISN atau masukkan manual.' });
      continue;
    }
    const cocok = byNisn.get(nisn);
    const nikBaru = (baris.nik || '').trim();
    const pemilikNik = nikBaru ? byNik.get(nikBaru) : undefined;
    if (cocok && pemilikNik && pemilikNik.id !== cocok.id) {
      hasil.push({
        nisn, namaImpor: nama, status: 'konflik', perubahan: [`NIK "${nikBaru}" milik siswa lain`],
        siswaId: cocok.id,
        alasan: 'KONFLIK: NIK baris impor milik siswa lain. Jangan terapkan tanpa tinjauan manual.',
      });
      continue;
    }
    if (!cocok) {
      hasil.push({ nisn, namaImpor: nama, status: 'baru', perubahan: [], alasan: 'NISN belum ada di data saat ini — siswa baru.' });
      continue;
    }
    const perubahan: string[] = [];
    bedaField('Nama', cocok.namaLengkap, nama, perubahan);
    bedaField('Tanggal lahir', cocok.tanggalLahir, baris.tanggalLahir || '', perubahan);
    bedaField('Rombel', cocok.rombelSaatIni, baris.rombelSaatIni || '', perubahan);
    bedaField('NIK', cocok.nik, nikBaru, perubahan);
    if (perubahan.length === 0) {
      hasil.push({ nisn, namaImpor: nama, status: 'sama', perubahan: [], siswaId: cocok.id, alasan: 'Sama dengan data saat ini — tidak ada perubahan.' });
    } else {
      hasil.push({ nisn, namaImpor: nama, status: 'berbeda', perubahan, siswaId: cocok.id, alasan: 'Berbeda dengan data saat ini — tinjau sebelum menerapkan.' });
    }
  }
  return hasil;
}

/** Parser CSV kecil (header + baris, dukung field ber-quote & CRLF). Tanpa dependensi. */
export function parseCsvImpor(teks: string): BarisImpor[] {
  const baris: string[][] = [];
  let field = '';
  let row: string[] = [];
  let dalamKutip = false;
  const src = (teks || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (dalamKutip) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else dalamKutip = false;
      } else field += c;
    } else if (c === '"') dalamKutip = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); baris.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); baris.push(row); }
  const bersih = baris.filter((r) => r.some((c) => c.trim() !== ''));
  if (bersih.length === 0) return [];
  const header = bersih[0].map((h) => h.trim().toLowerCase());
  const idx = (nama: string[], fallback = -1): number => {
    for (const n of nama) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return fallback;
  };
  const iNisn = idx(['nisn']);
  if (iNisn < 0) throw new Error('Kolom NISN tidak ditemukan di header CSV. Header yang diharapkan: nisn,nama,tanggalLahir,rombel,nik');
  const iNama = idx(['nama', 'namalengkap', 'nama_lengkap']);
  const iTgl = idx(['tanggallahir', 'tanggal_lahir', 'tanggal lahir']);
  const iRombel = idx(['rombel', 'rombelsaatini', 'rombel_saat_ini']);
  const iNik = idx(['nik']);
  const ambil = (r: string[], i: number): string => (i >= 0 ? (r[i] || '').trim() : '');
  return bersih.slice(1).map((r) => ({
    nisn: ambil(r, iNisn),
    namaLengkap: ambil(r, iNama),
    tanggalLahir: ambil(r, iTgl),
    rombelSaatIni: ambil(r, iRombel),
    nik: ambil(r, iNik),
  }));
}
