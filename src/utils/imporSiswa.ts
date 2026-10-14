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

// ---------------- Definisi kolom yang dikenal ----------------

export type TipeKolomImpor = 'teks' | 'angka' | 'tanggal' | 'pilihan';

export interface DefinisiKolomImpor {
  field: string;
  /** Header kanonis pada template. */
  label: string;
  /** Nama header alternatif yang dikenali saat pemetaan otomatis. */
  alias: string[];
  tipe: TipeKolomImpor;
  /** Nilai yang diizinkan (tipe 'pilihan'); pencocokan tidak sensitif huruf. */
  pilihan?: string[];
  wajib?: boolean;
  keterangan: string;
}

const AGAMA = ['Islam', 'Kristen', 'Katholik', 'Hindu', 'Buddha', 'Khonghucu', 'Kepercayaan', 'Lainnya'];
const TINGGAL_DENGAN = ['Orang Tua', 'Wali', 'Asrama', 'Kost', 'Panti Asuhan', 'Pesantren', 'Lainnya'];
const TRANSPORTASI = [
  'Jalan Kaki', 'Sepeda', 'Sepeda Motor', 'Angkutan Umum', 'Antar Jemput',
  'Angkutan umum/bus/pete-pete', 'Mobil/bus antar jemput', 'Kereta api', 'Ojek',
  'Andong/bendi/sado/dokar/delman/becak', 'Perahu penyeberangan/rakit/getek',
  'Kuda', 'Mobil Pribadi', 'Lainnya',
];
const JALUR_MASUK = ['Zonasi', 'Afirmasi', 'Prestasi', 'Perpindahan Tugas Orang Tua', 'Mutasi/Pindahan'];
const STATUS_SISWA = ['Aktif', 'Lulus', 'Mutasi Keluar', 'Mengundurkan Diri', 'Meninggal Dunia'];

export const KOLOM_IMPOR: DefinisiKolomImpor[] = [
  { field: 'namaLengkap', label: 'Nama Lengkap', alias: ['nama', 'nama siswa', 'nama peserta didik'], tipe: 'teks', wajib: true, keterangan: 'Nama lengkap sesuai akta / Dapodik. Wajib.' },
  { field: 'namaPanggilan', label: 'Nama Panggilan', alias: ['panggilan', 'nama panggilan siswa'], tipe: 'teks', keterangan: 'Bila kosong, diisi kata pertama nama lengkap.' },
  { field: 'jenisKelamin', label: 'Jenis Kelamin (L/P)', alias: ['jk', 'jenis kelamin', 'kelamin', 'l/p'], tipe: 'pilihan', pilihan: ['L', 'P'], keterangan: 'L atau P. "Laki-laki"/"Perempuan" diterima dan dinormalisasi.' },
  { field: 'nisn', label: 'NISN', alias: ['nisn'], tipe: 'teks', wajib: true, keterangan: 'Tepat 10 digit angka. Kunci pencocokan utama. Wajib.' },
  { field: 'nipd', label: 'NIPD', alias: ['nipd', 'no induk'], tipe: 'teks', keterangan: 'Nomor induk peserta didik di sekolah (3-20 karakter).' },
  { field: 'nik', label: 'NIK', alias: ['nik', 'no nik', 'nik siswa'], tipe: 'teks', keterangan: '16 digit angka bila diisi. Kunci pencocokan kedua.' },
  { field: 'noKk', label: 'No. KK', alias: ['no kk', 'kk', 'nomor kk', 'no kartu keluarga'], tipe: 'teks', keterangan: '16 digit angka bila diisi.' },
  { field: 'noAktaLahir', label: 'No. Akta Lahir', alias: ['no akta', 'akta lahir', 'no akta lahir'], tipe: 'teks', keterangan: 'Nomor akta kelahiran bila ada.' },
  { field: 'tempatLahir', label: 'Tempat Lahir', alias: ['tempat lahir', 'ttl'], tipe: 'teks', keterangan: 'Kota/kabupaten kelahiran.' },
  { field: 'tanggalLahir', label: 'Tanggal Lahir (YYYY-MM-DD)', alias: ['tanggal lahir', 'tgl lahir', 'ttl tanggal', 'tanggal_lahir'], tipe: 'tanggal', keterangan: 'Format YYYY-MM-DD (cth. 2014-05-02). DD/MM/YYYY dan nomor seri tanggal Excel juga diterima.' },
  { field: 'agama', label: 'Agama', alias: ['agama'], tipe: 'pilihan', pilihan: AGAMA, keterangan: 'Salah satu dari daftar agama.' },
  { field: 'kewarganegaraan', label: 'Kewarganegaraan', alias: ['kewarganegaraan', 'warga negara'], tipe: 'pilihan', pilihan: ['WNI', 'WNA'], keterangan: 'WNI atau WNA.' },
  { field: 'anakKe', label: 'Anak Ke', alias: ['anak ke', 'anak keberapa'], tipe: 'angka', keterangan: 'Bilangan bulat 1-30.' },
  { field: 'jumlahSaudaraKandung', label: 'Jumlah Saudara Kandung', alias: ['saudara kandung', 'jml saudara kandung'], tipe: 'angka', keterangan: 'Bilangan bulat 0-30.' },
  { field: 'jumlahSaudaraTiri', label: 'Jumlah Saudara Tiri', alias: ['saudara tiri', 'jml saudara tiri'], tipe: 'angka', keterangan: 'Bilangan bulat 0-30.' },
  { field: 'jumlahSaudaraAngkat', label: 'Jumlah Saudara Angkat', alias: ['saudara angkat', 'jml saudara angkat'], tipe: 'angka', keterangan: 'Bilangan bulat 0-30.' },
  { field: 'statusDalamKeluarga', label: 'Status Dalam Keluarga', alias: ['status dalam keluarga', 'status keluarga'], tipe: 'pilihan', pilihan: ['Anak Kandung', 'Anak Tiri', 'Anak Angkat'], keterangan: 'Salah satu dari tiga status.' },
  { field: 'bahasaSehariHari', label: 'Bahasa Sehari-hari', alias: ['bahasa', 'bahasa sehari hari', 'bahasa sehari-hari'], tipe: 'teks', keterangan: 'Bahasa yang dipakai sehari-hari di rumah.' },
  { field: 'golonganDarah', label: 'Golongan Darah', alias: ['golongan darah', 'gol darah'], tipe: 'pilihan', pilihan: ['A', 'B', 'AB', 'O', '-'], keterangan: 'A / B / AB / O / - (tidak diketahui).' },
  { field: 'tinggiBadan', label: 'Tinggi Badan (cm)', alias: ['tinggi badan', 'tinggi', 'tb'], tipe: 'angka', keterangan: 'Sentimeter, 50-250.' },
  { field: 'beratBadan', label: 'Berat Badan (kg)', alias: ['berat badan', 'berat', 'bb'], tipe: 'angka', keterangan: 'Kilogram, 5-200 (boleh desimal, cth. 32,5).' },
  { field: 'riwayatPenyakit', label: 'Riwayat Penyakit', alias: ['riwayat penyakit', 'penyakit'], tipe: 'teks', keterangan: 'Tulis "Tidak ada" bila tidak ada riwayat.' },
  { field: 'kelainanFisik', label: 'Kelainan Fisik', alias: ['kelainan fisik'], tipe: 'teks', keterangan: 'Tulis "Tidak ada" bila tidak ada.' },
  { field: 'kebutuhanKhusus', label: 'Kebutuhan Khusus', alias: ['kebutuhan khusus', 'berkebutuhan khusus'], tipe: 'teks', keterangan: 'Tulis "Tidak ada" bila tidak ada.' },
  { field: 'alamat', label: 'Alamat', alias: ['alamat', 'alamat jalan', 'jalan'], tipe: 'teks', keterangan: 'Alamat jalan tempat tinggal (tanpa RT/RW).' },
  { field: 'rt', label: 'RT', alias: ['rt'], tipe: 'teks', keterangan: 'Nomor RT, cth. 01.' },
  { field: 'rw', label: 'RW', alias: ['rw'], tipe: 'teks', keterangan: 'Nomor RW, cth. 02.' },
  { field: 'dusun', label: 'Dusun', alias: ['dusun', 'nama dusun'], tipe: 'teks', keterangan: 'Nama dusun / lingkungan.' },
  { field: 'kelurahan', label: 'Kelurahan / Desa', alias: ['kelurahan', 'desa', 'desa kelurahan', 'desa/kelurahan'], tipe: 'teks', keterangan: 'Nama kelurahan atau desa.' },
  { field: 'kecamatan', label: 'Kecamatan', alias: ['kecamatan'], tipe: 'teks', keterangan: 'Nama kecamatan.' },
  { field: 'kabupatenKota', label: 'Kabupaten / Kota', alias: ['kabupaten', 'kota', 'kabupaten kota', 'kabupaten/kota'], tipe: 'teks', keterangan: 'Nama kabupaten atau kota.' },
  { field: 'provinsi', label: 'Provinsi', alias: ['provinsi'], tipe: 'teks', keterangan: 'Nama provinsi.' },
  { field: 'kodePos', label: 'Kode Pos', alias: ['kode pos', 'kodepos'], tipe: 'teks', keterangan: '5 digit angka bila diisi.' },
  { field: 'tinggalDengan', label: 'Tinggal Dengan', alias: ['tinggal dengan', 'tinggal bersama'], tipe: 'pilihan', pilihan: TINGGAL_DENGAN, keterangan: 'Salah satu dari daftar tempat tinggal.' },
  { field: 'jarakKeSekolahKm', label: 'Jarak ke Sekolah (km)', alias: ['jarak ke sekolah', 'jarak', 'jarak sekolah', 'jarak ke sekolah km'], tipe: 'angka', keterangan: 'Kilometer, 0-500 (boleh desimal, cth. 1,5).' },
  { field: 'transportasiKeSekolah', label: 'Transportasi ke Sekolah', alias: ['transportasi', 'transportasi ke sekolah', 'kendaraan'], tipe: 'pilihan', pilihan: TRANSPORTASI, keterangan: 'Salah satu dari daftar moda transportasi.' },
  { field: 'hobi', label: 'Hobi', alias: ['hobi', 'minat'], tipe: 'teks', keterangan: 'Minat / hobi siswa.' },
  { field: 'citaCita', label: 'Cita-cita', alias: ['cita cita', 'cita-cita', 'cita-cita siswa'], tipe: 'teks', keterangan: 'Cita-cita siswa.' },
  { field: 'ayahNama', label: 'Nama Ayah', alias: ['nama ayah', 'ayah', 'nama bapak'], tipe: 'teks', keterangan: 'Nama lengkap ayah.' },
  { field: 'ayahNik', label: 'NIK Ayah', alias: ['nik ayah', 'nik bapak'], tipe: 'teks', keterangan: '16 digit angka bila diisi.' },
  { field: 'ayahTahunLahir', label: 'Tahun Lahir Ayah', alias: ['tahun lahir ayah'], tipe: 'teks', keterangan: 'Tahun 4 digit, cth. 1985.' },
  { field: 'ayahPendidikan', label: 'Pendidikan Ayah', alias: ['pendidikan ayah'], tipe: 'teks', keterangan: 'Jenjang pendidikan terakhir ayah.' },
  { field: 'ayahPekerjaan', label: 'Pekerjaan Ayah', alias: ['pekerjaan ayah'], tipe: 'teks', keterangan: 'Pekerjaan ayah.' },
  { field: 'ayahPenghasilan', label: 'Penghasilan Ayah', alias: ['penghasilan ayah'], tipe: 'teks', keterangan: 'Rentang penghasilan ayah (teks bebas).' },
  { field: 'ayahNoTelepon', label: 'No. Telepon Ayah', alias: ['no telepon ayah', 'telepon ayah', 'hp ayah'], tipe: 'teks', keterangan: 'Nomor telepon/HP ayah.' },
  { field: 'ayahStatus', label: 'Status Ayah', alias: ['status ayah'], tipe: 'pilihan', pilihan: ['Masih Hidup', 'Meninggal Dunia'], keterangan: 'Masih Hidup atau Meninggal Dunia.' },
  { field: 'ibuNama', label: 'Nama Ibu', alias: ['nama ibu', 'ibu'], tipe: 'teks', keterangan: 'Nama lengkap ibu.' },
  { field: 'ibuNik', label: 'NIK Ibu', alias: ['nik ibu'], tipe: 'teks', keterangan: '16 digit angka bila diisi.' },
  { field: 'ibuTahunLahir', label: 'Tahun Lahir Ibu', alias: ['tahun lahir ibu'], tipe: 'teks', keterangan: 'Tahun 4 digit, cth. 1988.' },
  { field: 'ibuPendidikan', label: 'Pendidikan Ibu', alias: ['pendidikan ibu'], tipe: 'teks', keterangan: 'Jenjang pendidikan terakhir ibu.' },
  { field: 'ibuPekerjaan', label: 'Pekerjaan Ibu', alias: ['pekerjaan ibu'], tipe: 'teks', keterangan: 'Pekerjaan ibu.' },
  { field: 'ibuPenghasilan', label: 'Penghasilan Ibu', alias: ['penghasilan ibu'], tipe: 'teks', keterangan: 'Rentang penghasilan ibu (teks bebas).' },
  { field: 'ibuNoTelepon', label: 'No. Telepon Ibu', alias: ['no telepon ibu', 'telepon ibu', 'hp ibu'], tipe: 'teks', keterangan: 'Nomor telepon/HP ibu.' },
  { field: 'ibuStatus', label: 'Status Ibu', alias: ['status ibu'], tipe: 'pilihan', pilihan: ['Masih Hidup', 'Meninggal Dunia'], keterangan: 'Masih Hidup atau Meninggal Dunia.' },
  { field: 'asalSdMi', label: 'Asal SD/MI', alias: ['asal sd', 'asal sd/mi', 'asal sekolah', 'sekolah asal', 'asal tk/paud'], tipe: 'teks', keterangan: 'Nama sekolah asal (SD/MI; untuk SD: TK/PAUD).' },
  { field: 'npsnSdMi', label: 'NPSN SD/MI', alias: ['npsn sd', 'npsn sd/mi', 'npsn sekolah asal'], tipe: 'teks', keterangan: 'NPSN sekolah asal bila ada.' },
  { field: 'noIjazahSd', label: 'No. Ijazah SD', alias: ['no ijazah sd', 'ijazah sd'], tipe: 'teks', keterangan: 'Nomor ijazah SD bila ada.' },
  { field: 'tahunLulusSd', label: 'Tahun Lulus SD', alias: ['tahun lulus sd', 'lulus sd'], tipe: 'teks', keterangan: 'Tahun 4 digit.' },
  { field: 'lamaBelajarSd', label: 'Lama Belajar SD (tahun)', alias: ['lama belajar sd', 'lama belajar'], tipe: 'angka', keterangan: 'Bilangan bulat 0-12.' },
  { field: 'tanggalDiterima', label: 'Tanggal Diterima (YYYY-MM-DD)', alias: ['tanggal diterima', 'tgl diterima', 'tanggal masuk'], tipe: 'tanggal', keterangan: 'Tanggal siswa diterima di sekolah ini.' },
  { field: 'diterimaDiTingkat', label: 'Diterima di Tingkat', alias: ['diterima di tingkat', 'tingkat diterima', 'kelas diterima'], tipe: 'teks', keterangan: 'Tingkat saat diterima: 1-9.' },
  { field: 'diterimaDiRombel', label: 'Diterima di Rombel', alias: ['diterima di rombel', 'rombel diterima'], tipe: 'teks', keterangan: 'Rombel saat diterima, cth. 7A.' },
  { field: 'rombelSaatIni', label: 'Rombel Saat Ini', alias: ['rombel', 'rombel saat ini', 'kelas', 'rombel aktif', 'kelas saat ini'], tipe: 'teks', wajib: true, keterangan: 'Rombel tujuan, cth. 7A. Wajib — menentukan hak akses operator.' },
  { field: 'jalurMasuk', label: 'Jalur Masuk', alias: ['jalur masuk', 'jalur ppdb', 'jalur'], tipe: 'pilihan', pilihan: JALUR_MASUK, keterangan: 'Salah satu dari daftar jalur masuk.' },
  { field: 'jenisPendaftaran', label: 'Jenis Pendaftaran', alias: ['jenis pendaftaran', 'pendaftaran'], tipe: 'pilihan', pilihan: ['Siswa Baru', 'Pindahan', 'Kembali Bersekolah'], keterangan: 'Siswa Baru / Pindahan / Kembali Bersekolah.' },
  { field: 'statusSiswa', label: 'Status Siswa', alias: ['status siswa', 'status'], tipe: 'pilihan', pilihan: STATUS_SISWA, keterangan: 'Status akhir siswa (default: Aktif).' },
];

export const KOLOM_IMPOR_BY_FIELD = new Map(KOLOM_IMPOR.map((k) => [k.field, k]));

/** Normalisasi header: huruf kecil, tanpa diakritik, tanpa pemisah/spasi. */
export function normalisasiHeader(header: string): string {
  return (header || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// ---------------- Parsing CSV ----------------

/**
 * Parser CSV murni: dukung delimiter ',' atau ';' (deteksi otomatis dari
 * baris pertama), kutip ganda, escaped '""', dan baris baru di dalam kutip.
 * Melempar Error bila karakter pengganti U+FFFD ditemukan (tanda berkas
 * bukan UTF-8 / encoding salah — minta simpan ulang sebagai UTF-8).
 */
export function parseCsv(teks: string): string[][] {
  const bersih = (teks || '').replace(/^\uFEFF/, '');
  if (bersih.includes('�')) {
    throw new Error(
      'Encoding berkas tidak dapat dibaca (karakter rusak terdeteksi). ' +
        'Simpan ulang berkas sebagai CSV UTF-8 (di Excel: Save As -> CSV UTF-8), lalu unggah lagi.'
    );
  }
  // Deteksi delimiter dari baris header (di luar kutip).
  const barisPertama = bersih.split(/\r?\n/)[0] || '';
  const hitungDiLuarKutip = (delim: string): number => {
    let n = 0;
    let dalamKutip = false;
    for (let i = 0; i < barisPertama.length; i++) {
      const ch = barisPertama[i];
      if (ch === '"') {
        if (dalamKutip && barisPertama[i + 1] === '"') i++;
        else dalamKutip = !dalamKutip;
      } else if (ch === delim && !dalamKutip) n++;
    }
    return n;
  };
  const delim = hitungDiLuarKutip(';') > hitungDiLuarKutip(',') ? ';' : ',';
  const baris: string[][] = [];
  let sel = '';
  let barisAktif: string[] = [];
  let dalamKutip = false;
  for (let i = 0; i < bersih.length; i++) {
    const ch = bersih[i];
    if (dalamKutip) {
      if (ch === '"') {
        if (bersih[i + 1] === '"') {
          sel += '"';
          i++;
        } else {
          dalamKutip = false;
        }
      } else {
        sel += ch;
      }
    } else if (ch === '"') {
      dalamKutip = true;
    } else if (ch === delim) {
      barisAktif.push(sel);
      sel = '';
    } else if (ch === '\r') {
      // Abaikan; '\n' berikut menutup baris.
    } else if (ch === '\n') {
      barisAktif.push(sel);
      sel = '';
      baris.push(barisAktif);
      barisAktif = [];
    } else {
      sel += ch;
    }
  }
  if (dalamKutip) {
    throw new Error('Format CSV tidak valid: tanda kutip tidak berpasangan. Periksa berkas dan unggah lagi.');
  }
  if (sel !== '' || barisAktif.length > 0) {
    barisAktif.push(sel);
    baris.push(barisAktif);
  }
  return baris;
}

/** Ambil baris header + baris data dari matriks mentah (buang baris kosong). */
export function pisahHeaderDanData(barisMentah: string[][]): { header: string[]; data: string[][] } {
  const takKosong = (barisMentah || []).filter((r) =>
    (r || []).some((c) => String(c ?? '').trim() !== '')
  );
  if (takKosong.length === 0) {
    throw new Error('Berkas tidak berisi data (hanya header/kosong).');
  }
  const header = (takKosong[0] || []).map((c) => String(c ?? '').trim());
  const data = takKosong.slice(1);
  if (data.length === 0) {
    throw new Error('Berkas hanya berisi header — tidak ada baris data.');
  }
  if (data.length > IMPOR_MAX_BARIS) {
    throw new Error(
      `Terlalu banyak baris (${data.length}). Maksimal ${IMPOR_MAX_BARIS} baris per berkas — bagi berkas menjadi beberapa bagian.`
    );
  }
  return { header, data };
}

// ---------------- Parsing Excel (.xlsx) ----------------

/** Antarmuka minimal SheetJS yang dipakai — diinjeksikan agar dapat diuji tanpa SheetJS. */
export interface XlsxMinimal {
  read: (data: ArrayBuffer, opts: Record<string, unknown>) => {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: {
    sheet_to_json: (ws: unknown, opts: Record<string, unknown>) => unknown[][];
  };
}

/**
 * Baca sheet PERTAMA workbook menjadi matriks string. Sheet lain diabaikan
 * (diberitahu lewat namaSheet + jumlah sheet bila > 1).
 */
export function barisDariExcel(
  buf: ArrayBuffer,
  xlsx: XlsxMinimal
): { namaSheet: string; jumlahSheet: number; barisMentah: string[][] } {
  let wb;
  try {
    wb = xlsx.read(buf, { type: 'array', cellDates: true });
  } catch {
    throw new Error(
      'Berkas Excel tidak dapat dibaca (mungkin rusak atau bukan .xlsx). ' +
        'Coba simpan ulang dari Excel/LibreOffice, atau unggah sebagai CSV.'
    );
  }
  const namaSheet = (wb.SheetNames || [])[0];
  if (!namaSheet) throw new Error('Berkas Excel tidak memiliki sheet.');
  const matriks = xlsx.utils.sheet_to_json(wb.Sheets[namaSheet], { header: 1, raw: true, defval: '' });
  const barisMentah = (matriks || []).map((r) => (Array.isArray(r) ? r : []).map((c) => nilaiSelKeTeks(c)));
  return { namaSheet, jumlahSheet: (wb.SheetNames || []).length, barisMentah };
}

/** Konversi nilai sel Excel mentah ke teks (tanggal -> YYYY-MM-DD). */
export function nilaiSelKeTeks(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    return formatYmd(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '';
    return String(v);
  }
  if (typeof v === 'boolean') return '';
  return String(v).trim();
}

export function formatYmd(y: number, m: number, d: number): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${y}-${p(m)}-${p(d)}`;
}

/** Cek tanggal kalender nyata (tolak 2026-02-30 dst). */
function tanggalNyata(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/**
 * Normalisasi tanggal dari berbagai bentuk ke YYYY-MM-DD; null bila invalid.
 * Diterima: YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY,
 * objek Date, dan nomor seri tanggal Excel (hari sejak 1899-12-30).
 * Tahun 2 digit DITOLAK (ambigu) — minta 4 digit.
 */
export function normalisasiTanggal(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return formatYmd(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v <= 0) return null;
    // Nomor seri Excel: 1 = 1900-01-01 (dengan bug leap-year 1900).
    // Hanya terima rentang wajar 2000-01-01 s.d. 2100-12-31.
    const serial = Math.floor(v);
    const dasar = Date.UTC(1899, 11, 30);
    const ms = dasar + serial * 86400000;
    const dt = new Date(ms);
    const ymd = formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    if (ymd < '2000-01-01' || ymd > '2100-12-31') return null;
    return ymd;
  }
  const s = String(v).trim();
  if (!s) return null;
  // Ambil bagian tanggal bila ada jam (cth. "2014-05-02 00:00:00").
  const hanyaTanggal = s.split(/\s+/)[0];
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(hanyaTanggal);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!tanggalNyata(y, mo, d)) return null;
    return formatYmd(y, mo, d);
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(hanyaTanggal);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = Number(m[3]);
    if (!tanggalNyata(y, mo, d)) return null;
    return formatYmd(y, mo, d);
  }
  return null;
}

// ---------------- Pemetaan kolom ----------------

export interface HasilPemetaan {
  /** field per indeks header; null = kolom diabaikan. */
  pemetaan: (string | null)[];
  /** Header yang tidak dikenali (harus dipetakan manual / diabaikan). */
  takDikenal: { index: number; header: string }[];
  /** Field wajib yang belum terpetakan. */
  wajibHilang: string[];
  /** Peringatan pemetaan (cth. dua kolom ke satu field). */
  peringatan: string[];
}

/** Pemetaan otomatis header -> field lewat label/alias (normalisasi). */
export function petakanKolomOtomatis(header: string[]): HasilPemetaan {
  const byNorm = new Map<string, string>();
  for (const def of KOLOM_IMPOR) {
    byNorm.set(normalisasiHeader(def.label), def.field);
    for (const a of def.alias) {
      if (!byNorm.has(normalisasiHeader(a))) byNorm.set(normalisasiHeader(a), def.field);
    }
  }
  const pemetaan: (string | null)[] = [];
  const takDikenal: { index: number; header: string }[] = [];
  const peringatan: string[] = [];
  const terpakai = new Set<string>();
  header.forEach((h, i) => {
    const field = byNorm.get(normalisasiHeader(h));
    if (!field) {
      pemetaan.push(null);
      takDikenal.push({ index: i, header: h });
      return;
    }
    if (terpakai.has(field)) {
      pemetaan.push(null);
      peringatan.push(
        `Kolom "${h}" memetakan ke field yang sama dengan kolom sebelumnya — kolom ini diabaikan.`
      );
      return;
    }
    terpakai.add(field);
    pemetaan.push(field);
  });
  const wajibHilang = KOLOM_IMPOR.filter((d) => d.wajib && !terpakai.has(d.field)).map((d) => d.label);
  return { pemetaan, takDikenal, wajibHilang, peringatan };
}

/** Terapkan pemetaan ke satu baris data mentah -> nilai per field. */
export function barisKeNilai(baris: string[], pemetaan: (string | null)[]): Record<string, string> {
  const nilai: Record<string, string> = {};
  pemetaan.forEach((field, i) => {
    if (!field) return;
    const mentah = baris[i] ?? '';
    const def = KOLOM_IMPOR_BY_FIELD.get(field);
    if (!def) return;
    nilai[field] = normalisasiNilaiKolom(String(mentah ?? ''), def);
  });
  return nilai;
}

/** Normalisasi nilai satu sel sesuai tipe kolom (tanggal/angka/pilihan). */
export function normalisasiNilaiKolom(mentah: string, def: DefinisiKolomImpor): string {
  const s = (mentah ?? '').trim();
  if (!s) return '';
  if (def.tipe === 'tanggal') {
    // Angka murni bisa jadi nomor seri Excel (CSV dari ekspor Excel).
    const sebagaiAngka = Number(s.replace(',', '.'));
    const tgl = /^\d+$/.test(s) ? normalisasiTanggal(sebagaiAngka) : normalisasiTanggal(s);
    return tgl ?? s; // biarkan apa adanya agar validasi memberi pesan jelas
  }
  if (def.tipe === 'angka') {
    const n = Number(s.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(n)) return s;
    return String(n);
  }
  if (def.tipe === 'pilihan' && def.pilihan) {
    const rendah = s.toLowerCase();
    if (def.field === 'jenisKelamin') {
      if (['l', 'laki-laki', 'laki', 'male'].includes(rendah)) return 'L';
      if (['p', 'perempuan', 'female'].includes(rendah)) return 'P';
    }
    if (def.field === 'agama' && rendah === 'katolik') return 'Katholik';
    const cocok = def.pilihan.find((p) => p.toLowerCase() === rendah);
    return cocok ?? s;
  }
  return s;
}

// ---------------- Validasi per baris ----------------

export interface BarisImporTervalidasi {
  nomorBaris: number;
  nilai: Record<string, string>;
  errors: string[];
  warnings: string[];
}

const ROMBEL_RE = /^[1-9][A-Za-z]$/;
const TINGKAT_RE = /^[1-9]$/;
const TAHUN_RE = /^\d{4}$/;

function cekAngka(nilai: Record<string, string>, field: string, label: string, min: number, max: number, bulat: boolean, errors: string[]): void {
  const raw = (nilai[field] || '').trim();
  if (!raw) return;
  const n = Number(raw);
  if (!Number.isFinite(n) || (bulat && !Number.isInteger(n)) || n < min || n > max) {
    errors.push(`${label} tidak valid ("${raw}") — harus angka ${bulat ? 'bulat ' : ''}${min}-${max}.`);
  }
}

/** Validasi satu baris (format + aturan bisnis). Duplikat dalam file ditangani
 *  di validasiSemuaBaris (butuh konteks antar-baris). */
export function validasiBarisImpor(nilai: Record<string, string>, nomorBaris: number): BarisImporTervalidasi {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Identitas: format + wajib (tanpa cek duplikat vs data lama — itu urusan
  // rekonsiliasi, karena NISN yang cocok = siswa yang sama, bukan duplikat).
  const identitas = validateIdentitasSiswa(
    {
      id: '',
      namaLengkap: nilai.namaLengkap || '',
      nisn: nilai.nisn || '',
      nik: nilai.nik || '',
      nipd: nilai.nipd || '',
      noKk: nilai.noKk || '',
      tanggalLahir: nilai.tanggalLahir || '',
      tanggalDiterima: nilai.tanggalDiterima || '',
    },
    []
  );
  for (const iss of identitas) errors.push(`${iss.message} (baris ${nomorBaris})`);
  for (const w of identitas.warnings || []) warnings.push(`${w.message} (baris ${nomorBaris})`);

  // Rombel wajib (menentukan hak akses operator) + format.
  if (!(nilai.rombelSaatIni || '').trim()) {
    errors.push(`Rombel Saat Ini wajib diisi (baris ${nomorBaris}).`);
  } else if (!ROMBEL_RE.test((nilai.rombelSaatIni || '').trim())) {
    errors.push(`Rombel Saat Ini "${nilai.rombelSaatIni}" tidak valid — pakai format cth. 7A (baris ${nomorBaris}).`);
  }

  // Pilihan: nilai yang tidak ada di daftar ditolak dengan daftar yang sah.
  for (const def of KOLOM_IMPOR) {
    if (def.tipe !== 'pilihan' || !def.pilihan) continue;
    const v = (nilai[def.field] || '').trim();
    if (!v) continue;
    if (!def.pilihan.includes(v)) {
      errors.push(`${def.label} "${v}" tidak dikenal — pilih salah satu: ${def.pilihan.join(', ')} (baris ${nomorBaris}).`);
    }
  }

  // Tanggal: format harus lolos normalisasi (nilai mentah yang gagal
  // normalisasi masih tersimpan apa adanya di normalisasiNilaiKolom).
  for (const field of ['tanggalLahir', 'tanggalDiterima'] as const) {
    const v = (nilai[field] || '').trim();
    if (v && !normalisasiTanggal(v)) {
      errors.push(
        `Tanggal ${field === 'tanggalLahir' ? 'Lahir' : 'Diterima'} "${v}" tidak valid — pakai YYYY-MM-DD (baris ${nomorBaris}).`
      );
    }
  }
  // Tanggal lahir tidak boleh setelah tanggal diterima (bila keduanya valid).
  const lahir = normalisasiTanggal(nilai.tanggalLahir || '');
  const diterima = normalisasiTanggal(nilai.tanggalDiterima || '');
  if (lahir && diterima && lahir > diterima) {
    errors.push(`Tanggal Lahir tidak boleh setelah Tanggal Diterima (baris ${nomorBaris}).`);
  }

  // Angka.
  cekAngka(nilai, 'anakKe', 'Anak Ke', 1, 30, true, errors);
  cekAngka(nilai, 'jumlahSaudaraKandung', 'Jumlah Saudara Kandung', 0, 30, true, errors);
  cekAngka(nilai, 'jumlahSaudaraTiri', 'Jumlah Saudara Tiri', 0, 30, true, errors);
  cekAngka(nilai, 'jumlahSaudaraAngkat', 'Jumlah Saudara Angkat', 0, 30, true, errors);
  cekAngka(nilai, 'tinggiBadan', 'Tinggi Badan', 50, 250, false, errors);
  cekAngka(nilai, 'beratBadan', 'Berat Badan', 5, 200, false, errors);
  cekAngka(nilai, 'jarakKeSekolahKm', 'Jarak ke Sekolah', 0, 500, false, errors);
  cekAngka(nilai, 'lamaBelajarSd', 'Lama Belajar SD', 0, 12, true, errors);

  // NIK orang tua, tahun, kode pos, tingkat/rombel diterima.
  for (const [field, label] of [['ayahNik', 'NIK Ayah'], ['ibuNik', 'NIK Ibu']] as const) {
    const v = (nilai[field] || '').trim();
    if (v && !/^\d{16}$/.test(v)) errors.push(`${label} harus 16 digit angka bila diisi (baris ${nomorBaris}).`);
  }
  for (const [field, label] of [['ayahTahunLahir', 'Tahun Lahir Ayah'], ['ibuTahunLahir', 'Tahun Lahir Ibu'], ['tahunLulusSd', 'Tahun Lulus SD']] as const) {
    const v = (nilai[field] || '').trim();
    if (v && !TAHUN_RE.test(v)) errors.push(`${label} "${v}" harus 4 digit tahun (baris ${nomorBaris}).`);
  }
  const kodePos = (nilai.kodePos || '').trim();
  if (kodePos && !/^\d{5}$/.test(kodePos)) errors.push(`Kode Pos "${kodePos}" harus 5 digit angka (baris ${nomorBaris}).`);
  const tingkat = (nilai.diterimaDiTingkat || '').trim();
  if (tingkat && !TINGKAT_RE.test(tingkat)) errors.push(`Diterima di Tingkat "${tingkat}" harus 1-9 (baris ${nomorBaris}).`);
  const rombelDiterima = (nilai.diterimaDiRombel || '').trim();
  if (rombelDiterima && !ROMBEL_RE.test(rombelDiterima)) errors.push(`Diterima di Rombel "${rombelDiterima}" harus format cth. 7A (baris ${nomorBaris}).`);

  return { nomorBaris, nilai, errors, warnings };
}

/** Validasi seluruh baris + deteksi duplikat kunci di DALAM berkas. */
export function validasiSemuaBaris(daftarNilai: Record<string, string>[]): BarisImporTervalidasi[] {
  const hasil = daftarNilai.map((nilai, i) => validasiBarisImpor(nilai, i + 2));
  const terlihat: Record<'nisn' | 'nik' | 'nipd', Map<string, number>> = {
    nisn: new Map(),
    nik: new Map(),
    nipd: new Map(),
  };
  const labelKunci = { nisn: 'NISN', nik: 'NIK', nipd: 'NIPD' } as const;
  for (const baris of hasil) {
    for (const k of ['nisn', 'nik', 'nipd'] as const) {
      const v = (baris.nilai[k] || '').trim();
      if (!v) continue;
      const pertama = terlihat[k].get(v);
      if (pertama !== undefined) {
        baris.errors.push(
          `${labelKunci[k]} "${v}" duplikat dalam berkas (sudah ada di baris ${pertama}) — perbaiki salah satu baris.`
        );
      } else {
        terlihat[k].set(v, baris.nomorBaris);
      }
    }
  }
  return hasil;
}

// ---------------- Akses nilai Siswa per field ----------------

/** Ambil nilai Siswa untuk satu field impor (dinormalisasi ke teks). */
export function ambilNilaiSiswa(s: Siswa, field: string): string {
  const teks = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
  switch (field) {
    case 'namaLengkap': return teks(s.namaLengkap);
    case 'namaPanggilan': return teks(s.namaPanggilan);
    case 'jenisKelamin': return teks(s.jenisKelamin);
    case 'nisn': return teks(s.nisn);
    case 'nipd': return teks(s.nipd);
    case 'nik': return teks(s.nik);
    case 'noKk': return teks(s.noKk);
    case 'noAktaLahir': return teks(s.noAktaLahir);
    case 'tempatLahir': return teks(s.tempatLahir);
    case 'tanggalLahir': return teks(s.tanggalLahir);
    case 'agama': return teks(s.agama);
    case 'kewarganegaraan': return teks(s.kewarganegaraan);
    case 'anakKe': return s.anakKe === undefined || s.anakKe === null ? '' : String(s.anakKe);
    case 'jumlahSaudaraKandung': return s.jumlahSaudaraKandung === undefined || s.jumlahSaudaraKandung === null ? '' : String(s.jumlahSaudaraKandung);
    case 'jumlahSaudaraTiri': return s.jumlahSaudaraTiri === undefined || s.jumlahSaudaraTiri === null ? '' : String(s.jumlahSaudaraTiri);
    case 'jumlahSaudaraAngkat': return s.jumlahSaudaraAngkat === undefined || s.jumlahSaudaraAngkat === null ? '' : String(s.jumlahSaudaraAngkat);
    case 'statusDalamKeluarga': return teks(s.statusDalamKeluarga);
    case 'bahasaSehariHari': return teks(s.bahasaSehariHari);
    case 'golonganDarah': return teks(s.golonganDarah);
    case 'tinggiBadan': return s.tinggiBadan === undefined || s.tinggiBadan === null ? '' : String(s.tinggiBadan);
    case 'beratBadan': return s.beratBadan === undefined || s.beratBadan === null ? '' : String(s.beratBadan);
    case 'riwayatPenyakit': return teks(s.riwayatPenyakit);
    case 'kelainanFisik': return teks(s.kelainanFisik);
    case 'kebutuhanKhusus': return teks(s.kebutuhanKhusus);
    case 'alamat': return teks(s.alamat);
    case 'rt': return teks(s.rt);
    case 'rw': return teks(s.rw);
    case 'dusun': return teks(s.dusun);
    case 'kelurahan': return teks(s.kelurahan);
    case 'kecamatan': return teks(s.kecamatan);
    case 'kabupatenKota': return teks(s.kabupatenKota);
    case 'provinsi': return teks(s.provinsi);
    case 'kodePos': return teks(s.kodePos);
    case 'tinggalDengan': return teks(s.tinggalDengan);
    case 'jarakKeSekolahKm': return s.jarakKeSekolahKm === undefined || s.jarakKeSekolahKm === null ? '' : String(s.jarakKeSekolahKm);
    case 'transportasiKeSekolah': return teks(s.transportasiKeSekolah);
    case 'hobi': return teks(s.hobi);
    case 'citaCita': return teks(s.citaCita);
    case 'ayahNama': return teks(s.ayah?.nama);
    case 'ayahNik': return teks(s.ayah?.nik);
    case 'ayahTahunLahir': return teks(s.ayah?.tahunLahir);
    case 'ayahPendidikan': return teks(s.ayah?.pendidikan);
    case 'ayahPekerjaan': return teks(s.ayah?.pekerjaan);
    case 'ayahPenghasilan': return teks(s.ayah?.penghasilan);
    case 'ayahNoTelepon': return teks(s.ayah?.noTelepon);
    case 'ayahStatus': return teks(s.ayah?.status);
    case 'ibuNama': return teks(s.ibu?.nama);
    case 'ibuNik': return teks(s.ibu?.nik);
    case 'ibuTahunLahir': return teks(s.ibu?.tahunLahir);
    case 'ibuPendidikan': return teks(s.ibu?.pendidikan);
    case 'ibuPekerjaan': return teks(s.ibu?.pekerjaan);
    case 'ibuPenghasilan': return teks(s.ibu?.penghasilan);
    case 'ibuNoTelepon': return teks(s.ibu?.noTelepon);
    case 'ibuStatus': return teks(s.ibu?.status);
    case 'asalSdMi': return teks(s.asalSdMi);
    case 'npsnSdMi': return teks(s.npsnSdMi);
    case 'noIjazahSd': return teks(s.noIjazahSd);
    case 'tahunLulusSd': return teks(s.tahunLulusSd);
    case 'lamaBelajarSd': return s.lamaBelajarSd === undefined || s.lamaBelajarSd === null ? '' : String(s.lamaBelajarSd);
    case 'tanggalDiterima': return teks(s.tanggalDiterima);
    case 'diterimaDiTingkat': return teks(s.diterimaDiTingkat);
    case 'diterimaDiRombel': return teks(s.diterimaDiRombel);
    case 'rombelSaatIni': return teks(s.rombelSaatIni);
    case 'jalurMasuk': return teks(s.jalurMasuk);
    case 'jenisPendaftaran': return teks(s.jenisPendaftaran);
    case 'statusSiswa': return teks(s.statusSiswa);
    default: return '';
  }
}

/** Samakan dua nilai untuk keperluan diff (teks: case-insensitive; angka: numerik). */
function nilaiSama(field: string, lama: string, baru: string): boolean {
  const def = KOLOM_IMPOR_BY_FIELD.get(field);
  const a = (lama || '').trim();
  const b = (baru || '').trim();
  if (def?.tipe === 'angka') return Number(a) === Number(b);
  if (def?.tipe === 'tanggal') return (normalisasiTanggal(a) || a) === (normalisasiTanggal(b) || b);
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Terapkan nilai impor ke salinan Siswa. HANYA field yang ada di `nilai`
 * dengan sel tidak kosong yang diubah; sisanya dipertahankan persis.
 * Mengembalikan objek BARU (input tidak dimutasi).
 */
export function terapkanNilaiKeSiswa(dasar: Siswa, nilai: Record<string, string>, sekarangIso: string): Siswa {
  const salin: Siswa = {
    ...dasar,
    ayah: { ...dasar.ayah },
    ibu: { ...dasar.ibu },
    updatedAt: sekarangIso,
  };
  const set = (field: string, v: string): void => {
    if (v === '') return;
    switch (field) {
      case 'namaLengkap': salin.namaLengkap = v; break;
      case 'namaPanggilan': salin.namaPanggilan = v; break;
      case 'jenisKelamin': salin.jenisKelamin = v as Siswa['jenisKelamin']; break;
      case 'nisn': salin.nisn = v; break;
      case 'nipd': salin.nipd = v; break;
      case 'nik': salin.nik = v; break;
      case 'noKk': salin.noKk = v; break;
      case 'noAktaLahir': salin.noAktaLahir = v; break;
      case 'tempatLahir': salin.tempatLahir = v; break;
      case 'tanggalLahir': salin.tanggalLahir = v; break;
      case 'agama': salin.agama = v as Siswa['agama']; break;
      case 'kewarganegaraan': salin.kewarganegaraan = v as Siswa['kewarganegaraan']; break;
      case 'anakKe': salin.anakKe = Number(v); break;
      case 'jumlahSaudaraKandung': salin.jumlahSaudaraKandung = Number(v); break;
      case 'jumlahSaudaraTiri': salin.jumlahSaudaraTiri = Number(v); break;
      case 'jumlahSaudaraAngkat': salin.jumlahSaudaraAngkat = Number(v); break;
      case 'statusDalamKeluarga': salin.statusDalamKeluarga = v as Siswa['statusDalamKeluarga']; break;
      case 'bahasaSehariHari': salin.bahasaSehariHari = v; break;
      case 'golonganDarah': salin.golonganDarah = v as Siswa['golonganDarah']; break;
      case 'tinggiBadan': salin.tinggiBadan = Number(v); break;
      case 'beratBadan': salin.beratBadan = Number(v); break;
      case 'riwayatPenyakit': salin.riwayatPenyakit = v; break;
      case 'kelainanFisik': salin.kelainanFisik = v; break;
      case 'kebutuhanKhusus': salin.kebutuhanKhusus = v; break;
      case 'alamat': salin.alamat = v; break;
      case 'rt': salin.rt = v; break;
      case 'rw': salin.rw = v; break;
      case 'dusun': salin.dusun = v; break;
      case 'kelurahan': salin.kelurahan = v; break;
      case 'kecamatan': salin.kecamatan = v; break;
      case 'kabupatenKota': salin.kabupatenKota = v; break;
      case 'provinsi': salin.provinsi = v; break;
      case 'kodePos': salin.kodePos = v; break;
      case 'tinggalDengan': salin.tinggalDengan = v as Siswa['tinggalDengan']; break;
      case 'jarakKeSekolahKm': salin.jarakKeSekolahKm = Number(v); break;
      case 'transportasiKeSekolah': salin.transportasiKeSekolah = v as Siswa['transportasiKeSekolah']; break;
      case 'hobi': salin.hobi = v; break;
      case 'citaCita': salin.citaCita = v; break;
      case 'ayahNama': salin.ayah.nama = v; break;
      case 'ayahNik': salin.ayah.nik = v; break;
      case 'ayahTahunLahir': salin.ayah.tahunLahir = v; break;
      case 'ayahPendidikan': salin.ayah.pendidikan = v; break;
      case 'ayahPekerjaan': salin.ayah.pekerjaan = v; break;
      case 'ayahPenghasilan': salin.ayah.penghasilan = v; break;
      case 'ayahNoTelepon': salin.ayah.noTelepon = v; break;
      case 'ayahStatus': salin.ayah.status = v as Siswa['ayah']['status']; break;
      case 'ibuNama': salin.ibu.nama = v; break;
      case 'ibuNik': salin.ibu.nik = v; break;
      case 'ibuTahunLahir': salin.ibu.tahunLahir = v; break;
      case 'ibuPendidikan': salin.ibu.pendidikan = v; break;
      case 'ibuPekerjaan': salin.ibu.pekerjaan = v; break;
      case 'ibuPenghasilan': salin.ibu.penghasilan = v; break;
      case 'ibuNoTelepon': salin.ibu.noTelepon = v; break;
      case 'ibuStatus': salin.ibu.status = v as Siswa['ibu']['status']; break;
      case 'asalSdMi': salin.asalSdMi = v; break;
      case 'npsnSdMi': salin.npsnSdMi = v; break;
      case 'noIjazahSd': salin.noIjazahSd = v; break;
      case 'tahunLulusSd': salin.tahunLulusSd = v; break;
      case 'lamaBelajarSd': salin.lamaBelajarSd = Number(v); break;
      case 'tanggalDiterima': salin.tanggalDiterima = v; break;
      case 'diterimaDiTingkat': salin.diterimaDiTingkat = v as Siswa['diterimaDiTingkat']; break;
      case 'diterimaDiRombel': salin.diterimaDiRombel = v; break;
      case 'rombelSaatIni': salin.rombelSaatIni = v; break;
      case 'jalurMasuk': salin.jalurMasuk = v as Siswa['jalurMasuk']; break;
      case 'jenisPendaftaran': salin.jenisPendaftaran = v as Siswa['jenisPendaftaran']; break;
      case 'statusSiswa': salin.statusSiswa = v as Siswa['statusSiswa']; break;
      default: break;
    }
  };
  for (const [field, v] of Object.entries(nilai)) set(field, (v || '').trim());
  return salin;
}

// ---------------- Rekonsiliasi ----------------

export type KlasifikasiImpor = 'baru' | 'sama' | 'beda' | 'konflik' | 'error' | 'ditolak-akses';
export type KeputusanImpor = 'tambah' | 'perbarui' | 'lewati';

export interface PerbedaanImpor {
  field: string;
  label: string;
  lama: string;
  baru: string;
}

export interface BarisRekonsiliasi {
  nomorBaris: number;
  nilai: Record<string, string>;
  klasifikasi: KlasifikasiImpor;
  /** Keputusan awal: baru -> tambah; lainnya -> lewati (beda TIDAK auto-merge). */
  keputusan: KeputusanImpor;
  /** Alasan bila konflik / error / ditolak-akses (pesan lengkap untuk laporan). */
  alasan?: string;
  /** Daftar perbedaan vs data lama (kosong untuk ditolak-akses: nilai lama tidak ditampilkan). */
  perbedaan: PerbedaanImpor[];
  siswaCocokId?: string;
}

export const LABEL_KLASIFIKASI: Record<KlasifikasiImpor, string> = {
  baru: 'Baru — akan ditambah',
  sama: 'Sama — tidak ada perubahan',
  beda: 'Berbeda — perlu pilihan',
  konflik: 'Konflik — dilewati',
  error: 'Error — dilewati',
  'ditolak-akses': 'Di luar kewenangan — dilewati',
};

function cariCocok(nilai: Record<string, string>, existing: Siswa[]): { nisn?: Siswa; nik?: Siswa; nipd?: Siswa } {
  const nisn = (nilai.nisn || '').trim();
  const nik = (nilai.nik || '').trim();
  const nipd = (nilai.nipd || '').trim();
  const hasil: { nisn?: Siswa; nik?: Siswa; nipd?: Siswa } = {};
  if (nisn) hasil.nisn = existing.find((s) => (s.nisn || '').trim() === nisn);
  if (nik) hasil.nik = existing.find((s) => (s.nik || '').trim() === nik);
  if (nipd) hasil.nipd = existing.find((s) => (s.nipd || '').trim() === nipd);
  return hasil;
}

/**
 * Klasifikasikan tiap baris tervalidasi terhadap data yang ada.
 * `bolehAkses(rombel)` = hak rombel pengguna (canUserAccessRombel).
 * Untuk baris di luar akses, perbedaan TIDAK dihitung/ditampilkan.
 */
export function rekonsiliasiImpor(
  tervalidasi: BarisImporTervalidasi[],
  existing: Siswa[],
  bolehAkses: (rombel: string) => boolean
): BarisRekonsiliasi[] {
  return tervalidasi.map((baris) => {
    const { nilai, nomorBaris } = baris;
    if (baris.errors.length > 0) {
      return {
        nomorBaris, nilai, klasifikasi: 'error', keputusan: 'lewati',
        alasan: baris.errors.join(' '),
        perbedaan: [],
      };
    }
    const rombelFile = (nilai.rombelSaatIni || '').trim();
    const cocok = cariCocok(nilai, existing);
    const kandidat = [cocok.nisn, cocok.nik, cocok.nipd].filter(Boolean) as Siswa[];
    const idUnik = [...new Set(kandidat.map((s) => s.id))];
    if (idUnik.length > 1) {
      const siapa = (s?: Siswa) => (s ? `"${s.namaLengkap}" (${s.rombelSaatIni || '-'})` : '-');
      return {
        nomorBaris, nilai, klasifikasi: 'konflik', keputusan: 'lewati',
        alasan:
          'Konflik identitas: NISN/NIK/NIPD di baris ini menunjuk ke siswa yang berbeda di database ' +
          `(${siapa(cocok.nisn)} vs ${siapa(cocok.nik)} vs ${siapa(cocok.nipd)}). ` +
          'Baris dilewati — perbaiki kunci identitas di berkas atau koreksi data lama, lalu impor ulang baris ini.',
        perbedaan: [],
      };
    }
    const lama = kandidat[0];
    if (!lama) {
      // Siswa baru: rombel tujuan harus dalam kewenangan pengguna.
      if (!bolehAkses(rombelFile)) {
        return {
          nomorBaris, nilai, klasifikasi: 'ditolak-akses', keputusan: 'lewati',
          alasan: `Rombel tujuan ${rombelFile} di luar kewenangan rombel Anda — baris dilewati.`,
          perbedaan: [],
        };
      }
      return { nomorBaris, nilai, klasifikasi: 'baru', keputusan: 'tambah', perbedaan: [] };
    }
    // Siswa lama: BAIK rombel lama MAUPUN rombel tujuan harus dalam kewenangan.
    if (!bolehAkses((lama.rombelSaatIni || '').trim()) || !bolehAkses(rombelFile)) {
      return {
        nomorBaris, nilai, klasifikasi: 'ditolak-akses', keputusan: 'lewati',
        alasan: 'Siswa atau rombel tujuan di luar kewenangan rombel Anda — baris dilewati (nilai lama tidak ditampilkan).',
        perbedaan: [],
        siswaCocokId: lama.id,
      };
    }
    const perbedaan: PerbedaanImpor[] = [];
    for (const [field, baru] of Object.entries(nilai)) {
      const baruTrim = (baru || '').trim();
      if (!baruTrim) continue; // sel kosong = tidak diubah
      const lamaVal = ambilNilaiSiswa(lama, field);
      if (!nilaiSama(field, lamaVal, baruTrim)) {
        const def = KOLOM_IMPOR_BY_FIELD.get(field);
        perbedaan.push({ field, label: def?.label || field, lama: lamaVal, baru: baruTrim });
      }
    }
    if (perbedaan.length === 0) {
      return { nomorBaris, nilai, klasifikasi: 'sama', keputusan: 'lewati', perbedaan: [], siswaCocokId: lama.id };
    }
    return { nomorBaris, nilai, klasifikasi: 'beda', keputusan: 'lewati', perbedaan, siswaCocokId: lama.id };
  });
}

/** Ringkasan jumlah per klasifikasi + keputusan efektif. */
export function ringkasanImpor(baris: BarisRekonsiliasi[]): {
  total: number;
  baru: number;
  sama: number;
  beda: number;
  konflik: number;
  error: number;
  ditolakAkses: number;
  akanTambah: number;
  akanPerbarui: number;
  akanLewati: number;
} {
  const hitung = (k: KlasifikasiImpor) => baris.filter((b) => b.klasifikasi === k).length;
  return {
    total: baris.length,
    baru: hitung('baru'),
    sama: hitung('sama'),
    beda: hitung('beda'),
    konflik: hitung('konflik'),
    error: hitung('error'),
    ditolakAkses: hitung('ditolak-akses'),
    akanTambah: baris.filter((b) => b.keputusan === 'tambah').length,
    akanPerbarui: baris.filter((b) => b.keputusan === 'perbarui').length,
    akanLewati: baris.filter((b) => b.keputusan === 'lewati').length,
  };
}

// ---------------- Pembangunan Siswa baru & rencana terapkan ----------------

export interface KonteksBangunSiswa {
  /** Jenjang sekolah aktif ('SD' | 'SMP') — untuk default tingkat/rombel. */
  jenjang: 'SD' | 'SMP';
  /** Tahun ajaran aktif profil (cth. "2026/2027"). */
  tahunAjaran: string;
  /** Cap waktu ISO untuk createdAt/updatedAt. */
  sekarangIso: string;
}

/**
 * Bangun record Siswa penuh dari satu baris impor.
 * - Field kosong -> default jujur ('' / 0 / default form), BUKAN data karangan:
 *   P5/ekskul/prestasi/riwayat dibiarkan KOSONG (tidak dibuatkan projek
 *   P5 fiktif) — operator melengkapi lewat form/raport seperti biasa.
 * - Nama panggilan kosong -> kata pertama nama lengkap.
 */
export function bangunSiswaBaru(
  nilai: Record<string, string>,
  ctx: KonteksBangunSiswa,
  akhiranIdUnik: string
): Siswa {
  const ambil = (f: string): string => (nilai[f] || '').trim();
  const taBerjalan = /^\d{4}\/\d{4}$/.test((ctx.tahunAjaran || '').trim()) ? ctx.tahunAjaran.trim() : '2026/2027';
  const tahunMulai = taBerjalan.slice(0, 4);
  const defTingkat = ctx.jenjang === 'SD' ? '1' : '7';
  const rombel = ambil('rombelSaatIni');
  const tingkatDariRombel = /^[1-9]/.test(rombel) ? rombel.charAt(0) : defTingkat;
  const nama = ambil('namaLengkap');
  const dasar: Siswa = {
    id: `sis-imp-${Date.now().toString(36)}-${akhiranIdUnik}`,
    namaLengkap: nama,
    namaPanggilan: ambil('namaPanggilan') || nama.split(/\s+/)[0] || '',
    jenisKelamin: (ambil('jenisKelamin') || 'L') as Siswa['jenisKelamin'],
    nisn: ambil('nisn'),
    nipd: ambil('nipd'),
    nik: ambil('nik'),
    noKk: ambil('noKk'),
    noAktaLahir: ambil('noAktaLahir'),
    tempatLahir: ambil('tempatLahir'),
    tanggalLahir: ambil('tanggalLahir'),
    agama: (ambil('agama') || 'Islam') as Siswa['agama'],
    kewarganegaraan: (ambil('kewarganegaraan') || 'WNI') as Siswa['kewarganegaraan'],
    anakKe: Number(ambil('anakKe') || '1') || 1,
    jumlahSaudaraKandung: Number(ambil('jumlahSaudaraKandung') || '0') || 0,
    jumlahSaudaraTiri: Number(ambil('jumlahSaudaraTiri') || '0') || 0,
    jumlahSaudaraAngkat: Number(ambil('jumlahSaudaraAngkat') || '0') || 0,
    statusDalamKeluarga: (ambil('statusDalamKeluarga') || 'Anak Kandung') as Siswa['statusDalamKeluarga'],
    bahasaSehariHari: ambil('bahasaSehariHari') || 'Bahasa Indonesia',
    golonganDarah: (ambil('golonganDarah') || '-') as Siswa['golonganDarah'],
    tinggiBadan: Number(ambil('tinggiBadan') || '0') || 0,
    beratBadan: Number(ambil('beratBadan') || '0') || 0,
    riwayatPenyakit: ambil('riwayatPenyakit') || 'Tidak ada',
    kelainanFisik: ambil('kelainanFisik') || 'Tidak ada',
    kebutuhanKhusus: ambil('kebutuhanKhusus') || 'Tidak ada',
    alamat: ambil('alamat'),
    rt: ambil('rt') || '01',
    rw: ambil('rw') || '01',
    dusun: ambil('dusun'),
    kelurahan: ambil('kelurahan'),
    kecamatan: ambil('kecamatan'),
    kabupatenKota: ambil('kabupatenKota'),
    provinsi: ambil('provinsi'),
    kodePos: ambil('kodePos'),
    tinggalDengan: (ambil('tinggalDengan') || 'Orang Tua') as Siswa['tinggalDengan'],
    jarakKeSekolahKm: Number(ambil('jarakKeSekolahKm') || '0') || 0,
    transportasiKeSekolah: (ambil('transportasiKeSekolah') || 'Jalan Kaki') as Siswa['transportasiKeSekolah'],
    hobi: ambil('hobi'),
    citaCita: ambil('citaCita'),
    ayah: {
      nama: ambil('ayahNama'),
      nik: ambil('ayahNik'),
      tahunLahir: ambil('ayahTahunLahir'),
      pendidikan: ambil('ayahPendidikan'),
      pekerjaan: ambil('ayahPekerjaan'),
      penghasilan: ambil('ayahPenghasilan'),
      noTelepon: ambil('ayahNoTelepon'),
      status: (ambil('ayahStatus') || 'Masih Hidup') as Siswa['ayah']['status'],
    },
    ibu: {
      nama: ambil('ibuNama'),
      nik: ambil('ibuNik'),
      tahunLahir: ambil('ibuTahunLahir'),
      pendidikan: ambil('ibuPendidikan'),
      pekerjaan: ambil('ibuPekerjaan'),
      penghasilan: ambil('ibuPenghasilan'),
      noTelepon: ambil('ibuNoTelepon'),
      status: (ambil('ibuStatus') || 'Masih Hidup') as Siswa['ibu']['status'],
    },
    asalSdMi: ambil('asalSdMi'),
    npsnSdMi: ambil('npsnSdMi'),
    noIjazahSd: ambil('noIjazahSd'),
    tahunLulusSd: ambil('tahunLulusSd') || tahunMulai,
    lamaBelajarSd: Number(ambil('lamaBelajarSd') || '6') || 6,
    tanggalDiterima: ambil('tanggalDiterima') || `${tahunMulai}-07-15`,
    diterimaDiTingkat: (ambil('diterimaDiTingkat') || tingkatDariRombel) as Siswa['diterimaDiTingkat'],
    diterimaDiRombel: ambil('diterimaDiRombel') || rombel,
    rombelSaatIni: rombel,
    jalurMasuk: (ambil('jalurMasuk') || 'Zonasi') as Siswa['jalurMasuk'],
    jenisPendaftaran: (ambil('jenisPendaftaran') || 'Siswa Baru') as Siswa['jenisPendaftaran'],
    p5Projects: [],
    ekstrakurikuler: [],
    prestasi: [],
    riwayatSemester: [],
    statusSiswa: (ambil('statusSiswa') || 'Aktif') as Siswa['statusSiswa'],
    createdAt: ctx.sekarangIso,
    updatedAt: ctx.sekarangIso,
  };
  return dasar;
}

/**
 * Susun daftar Siswa hasil penerapan keputusan pengguna.
 * Murni: tidak mengubah `existing` maupun `baris` (membuat salinan baru).
 * Hanya baris berkeputusan tambah/perbarui yang diproses.
 */
export function rencanaTerapkan(
  baris: BarisRekonsiliasi[],
  existing: Siswa[],
  ctx: KonteksBangunSiswa
): { tambah: Siswa[]; perbarui: Siswa[] } {
  const tambah: Siswa[] = [];
  const perbarui: Siswa[] = [];
  const byId = new Map(existing.map((s) => [s.id, s]));
  baris.forEach((b, idx) => {
    if (b.keputusan === 'tambah' && b.klasifikasi === 'baru') {
      tambah.push(bangunSiswaBaru(b.nilai, ctx, `${idx}-${Math.random().toString(36).slice(2, 7)}`));
    } else if (b.keputusan === 'perbarui' && b.klasifikasi === 'beda' && b.siswaCocokId) {
      const lama = byId.get(b.siswaCocokId);
      if (lama) perbarui.push(terapkanNilaiKeSiswa(lama, b.nilai, ctx.sekarangIso));
    }
  });
  return { tambah, perbarui };
}

// ---------------- Laporan error (CSV unduhan) ----------------

/** Cegah formula injection di laporan (sel diawali = + - @ diberi prefix '). */
function amanDariFormulaCsv(v: string): string {
  return /^[=+\-@]/.test(v) ? `'${v}` : v;
}

function selCsv(v: string): string {
  const bersih = amanDariFormulaCsv(String(v ?? '').replace(/\r?\n/g, ' '));
  return `"${bersih.replace(/"/g, '""')}"`;
}

/** Bangun isi CSV laporan baris yang tidak diterapkan (error/konflik/ditolak). */
export function laporanErrorCsv(baris: BarisRekonsiliasi[]): string {
  const ditolak = baris.filter((b) =>
    b.klasifikasi === 'error' || b.klasifikasi === 'konflik' || b.klasifikasi === 'ditolak-akses'
  );
  const header = ['Baris', 'Nama', 'NISN', 'Status', 'Pesan'];
  const rows = ditolak.map((b) => [
    String(b.nomorBaris),
    (b.nilai.namaLengkap || '').trim(),
    (b.nilai.nisn || '').trim(),
    LABEL_KLASIFIKASI[b.klasifikasi],
    (b.alasan || '').trim(),
  ]);
  return `\uFEFF${[header, ...rows].map((r) => r.map(selCsv).join(';')).join('\r\n')}\r\n`;
}

// ---------------- Sidik jari berkas (cegah unggah ulang) ----------------

export interface CatatanImpor {
  sidik: string;
  namaFile: string;
  diterapkanPada: string;
  tambah: number;
  perbarui: number;
  lewati: number;
}

export interface PenyimpananSidik {
  baca(): string | null;
  tulis(raw: string): void;
}

const SIDIK_MAKS_CATATAN = 50;

/** SHA-256 hex dari isi berkas (WebCrypto; fallback FNV bila tak tersedia). */
export async function hitungSidikJari(data: ArrayBuffer | string): Promise<string> {
  try {
    const buf = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buf as BufferSource);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback best-effort (lingkungan tanpa WebCrypto): FNV-1a 32-bit.
    const teks = typeof data === 'string' ? data : new TextDecoder().decode(data);
    let h = 0x811c9dc5;
    for (let i = 0; i < teks.length; i++) {
      h ^= teks.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return `fnv-${(h >>> 0).toString(16)}`;
  }
}

function bacaCatatanImpor(penyimpanan: PenyimpananSidik): CatatanImpor[] {
  try {
    const raw = penyimpanan.baca();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CatatanImpor[]) : [];
  } catch {
    return [];
  }
}

/** Kembalikan catatan bila sidik berkas ini PERNAH diterapkan; null bila belum. */
export function sidikSudahDiterapkan(sidik: string, penyimpanan: PenyimpananSidik): CatatanImpor | null {
  return bacaCatatanImpor(penyimpanan).find((c) => c.sidik === sidik) || null;
}

/** Catat sidik berkas yang baru diterapkan (maks 50 catatan terbaru). */
export function catatSidikImpor(catatan: CatatanImpor, penyimpanan: PenyimpananSidik): void {
  try {
    const list = bacaCatatanImpor(penyimpanan).filter((c) => c.sidik !== catatan.sidik);
    list.unshift(catatan);
    penyimpanan.tulis(JSON.stringify(list.slice(0, SIDIK_MAKS_CATATAN)));
  } catch {
    /* pencatatan sidik best-effort — jangan gagalkan impor */
  }
}

// ---------------- Template impor ----------------

/** Subset kolom template (yang paling sering dipakai); pemetaan mendukung SEMUA field KOLOM_IMPOR. */
export const TEMPLATE_FIELDS = [
  'namaLengkap', 'namaPanggilan', 'jenisKelamin', 'nisn', 'nipd', 'nik', 'noKk',
  'tempatLahir', 'tanggalLahir', 'agama', 'alamat', 'rt', 'rw', 'kelurahan',
  'kecamatan', 'kodePos', 'ayahNama', 'ayahNik', 'ayahNoTelepon', 'ibuNama',
  'ibuNik', 'ibuNoTelepon', 'asalSdMi', 'rombelSaatIni', 'jalurMasuk',
  'jenisPendaftaran', 'statusSiswa', 'tanggalDiterima',
];

/** Dua baris contoh FIKTIF (tanpa data pribadi nyata) sejajar TEMPLATE_FIELDS. */
export const CONTOH_BARIS_TEMPLATE: string[][] = [
  [
    'Budi Santoso', 'Budi', 'L', '0091234567', '1001', '3201010101010001', '3201010101010001',
    'Natal', '2014-05-02', 'Islam', 'Jl. Merdeka No. 12', '01', '02', 'Pasar Natal',
    'Natal', '22987', 'Ahmad Santoso', '3201010101010002', '081200000001', 'Siti Aminah',
    '3201010101010003', '081200000002', 'SD Negeri 01 Natal', '7A', 'Zonasi',
    'Siswa Baru', 'Aktif', '2026-07-15',
  ],
  [
    'Citra Lestari', 'Citra', 'P', '0091234568', '1002', '', '3201010101010004',
    'Panyabungan', '2014-08-19', 'Islam', 'Jl. Sudirman No. 5', '03', '01', 'Panyabungan',
    'Panyabungan', '22911', 'Dedi Lestari', '', '', 'Rina Wati',
    '', '', 'SD Negeri 02 Panyabungan', '7A', 'Zonasi',
    'Siswa Baru', 'Aktif', '2026-07-15',
  ],
];

/** Header kanonis template (label per TEMPLATE_FIELDS). */
export function headerTemplate(): string[] {
  return TEMPLATE_FIELDS.map((f) => KOLOM_IMPOR_BY_FIELD.get(f)?.label || f);
}

/** Isi CSV template (tanpa BOM; pemanggil menambahkan BOM saat unduh). */
export function bangunCsvTemplate(): string {
  const semua = [headerTemplate(), ...CONTOH_BARIS_TEMPLATE];
  return (
    semua
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n') + '\r\n'
  );
}

/** Baris sheet "Template" untuk workbook .xlsx (header + contoh). */
export function barisXlsxTemplate(): string[][] {
  return [headerTemplate(), ...CONTOH_BARIS_TEMPLATE];
}

/** Baris sheet "Panduan" untuk workbook .xlsx (field, wajib, keterangan). */
export function barisXlsxPanduan(): string[][] {
  return [
    ['Kolom (header)', 'Wajib?', 'Keterangan'],
    ...KOLOM_IMPOR.map((d) => [d.label, d.wajib ? 'Ya' : 'Tidak', d.keterangan]),
    [],
    ['Catatan: header dikenali dari nama kolom (label/alias). Kolom yang tidak dikenal akan ditandai "kolom asing" — petakan manual atau abaikan.'],
    ['Sel kosong pada baris PERBARUI berarti "tidak diubah" — tidak pernah mengosongkan data lama.'],
    ['Format tanggal: YYYY-MM-DD (cth. 2014-05-02). CSV harus UTF-8, delimiter ";" atau ",".'],
  ];
}
