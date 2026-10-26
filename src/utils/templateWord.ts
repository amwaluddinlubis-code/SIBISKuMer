/** Mesin template surat Word (fitur unggah .docx).
 *
 *  Alur: operator mengunggah .docx jadi → placeholder {{...}} dideteksi →
 *  tiap placeholder dipetakan ke data siswa / sekolah / surat / isian bebas →
 *  saat dipakai, docxtemplater mengisi berkas dan hasilnya diunduh.
 *
 *  Aturan yang dijaga (sama seperti template bawaan):
 *  - Nomor tidak pernah dikarang: nomor diisi operator dari penomoran nyata.
 *  - Nilai kosong TIDAK dibiarkan bolong: diganti '[BELUM DIISI]'.
 *  - Placeholder ditulis {{nama}} (kurung ganda); pemisah potongan teks Word
 *    (satu placeholder terpotong jadi beberapa run) ditangani saat deteksi
 *    (gabung isi <w:t>) dan saat render (docxtemplater).
 */
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import type {
  PemetaanPlaceholder,
  SekolahProfile,
  Siswa,
} from '../types/index';
import { tanggalIndo } from './suratDokumen';

/** Batas unggah: melindungi kuota localStorage (berkas disimpan base64). */
export const TEMPLATE_WORD_MAKS_BITA = 2 * 1024 * 1024;

/** Penanda nilai kosong — sama seperti template bawaan. */
export const PLACEHOLDER_KOSONG = '[BELUM DIISI]';

/** Nama placeholder yang valid: huruf, angka, garis bawah, titik, strip. */
const POLA_PLACEHOLDER = /\{\{\s*([A-Za-z0-9_.\-]+)\s*\}\}/g;

/** Kunci data siswa yang bisa dipetakan ke placeholder. */
export const KUNCI_SISWA: readonly { kunci: string; label: string }[] = [
  { kunci: 'namaLengkap', label: 'Nama lengkap' },
  { kunci: 'nisn', label: 'NISN' },
  { kunci: 'nipd', label: 'NIPD' },
  { kunci: 'rombelSaatIni', label: 'Rombel' },
  { kunci: 'tempatLahir', label: 'Tempat lahir' },
  { kunci: 'tanggalLahir', label: 'Tanggal lahir' },
  { kunci: 'jenisKelamin', label: 'Jenis kelamin' },
  { kunci: 'alamat', label: 'Alamat siswa' },
  { kunci: 'statusSiswa', label: 'Status siswa' },
];

/** Kunci data sekolah yang bisa dipetakan ke placeholder. */
export const KUNCI_SEKOLAH: readonly { kunci: string; label: string }[] = [
  { kunci: 'nama', label: 'Nama sekolah' },
  { kunci: 'npsn', label: 'NPSN' },
  { kunci: 'alamat', label: 'Alamat sekolah' },
  { kunci: 'desaKelurahan', label: 'Desa / kelurahan' },
  { kunci: 'kecamatan', label: 'Kecamatan' },
  { kunci: 'kabupatenKota', label: 'Kabupaten / kota' },
  { kunci: 'provinsi', label: 'Provinsi' },
  { kunci: 'tahunAjaran', label: 'Tahun ajaran' },
  { kunci: 'kepalaSekolah', label: 'Kepala sekolah' },
  { kunci: 'nipKepalaSekolah', label: 'NIP kepala sekolah' },
];

/** Kunci data surat yang bisa dipetakan ke placeholder. */
export const KUNCI_SURAT: readonly { kunci: string; label: string }[] = [
  { kunci: 'nomorSurat', label: 'Nomor surat' },
  { kunci: 'tanggalSurat', label: 'Tanggal surat' },
];

/** Tebakan pemetaan dari nama placeholder (dinormalisasi: huruf kecil,
 *  tanpa pemisah). Nama tak dikenal → 'bebas' (diisi operator tiap pakai). */
export function saranPemetaan(nama: string): PemetaanPlaceholder {
  const kunci = (nama || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const peta: Record<string, PemetaanPlaceholder> = {
    nama: { sumber: 'siswa', kunci: 'namaLengkap' },
    namalengkap: { sumber: 'siswa', kunci: 'namaLengkap' },
    namasiswa: { sumber: 'siswa', kunci: 'namaLengkap' },
    nisn: { sumber: 'siswa', kunci: 'nisn' },
    nipd: { sumber: 'siswa', kunci: 'nipd' },
    rombel: { sumber: 'siswa', kunci: 'rombelSaatIni' },
    kelas: { sumber: 'siswa', kunci: 'rombelSaatIni' },
    tempatlahir: { sumber: 'siswa', kunci: 'tempatLahir' },
    tanggallahir: { sumber: 'siswa', kunci: 'tanggalLahir' },
    jk: { sumber: 'siswa', kunci: 'jenisKelamin' },
    jeniskelamin: { sumber: 'siswa', kunci: 'jenisKelamin' },
    alamat: { sumber: 'siswa', kunci: 'alamat' },
    alamatsiswa: { sumber: 'siswa', kunci: 'alamat' },
    statussiswa: { sumber: 'siswa', kunci: 'statusSiswa' },
    sekolah: { sumber: 'sekolah', kunci: 'nama' },
    namasekolah: { sumber: 'sekolah', kunci: 'nama' },
    npsn: { sumber: 'sekolah', kunci: 'npsn' },
    alamatsekolah: { sumber: 'sekolah', kunci: 'alamat' },
    desakelurahan: { sumber: 'sekolah', kunci: 'desaKelurahan' },
    kecamatan: { sumber: 'sekolah', kunci: 'kecamatan' },
    kabupatenkota: { sumber: 'sekolah', kunci: 'kabupatenKota' },
    kabupaten: { sumber: 'sekolah', kunci: 'kabupatenKota' },
    provinsi: { sumber: 'sekolah', kunci: 'provinsi' },
    tahunajaran: { sumber: 'sekolah', kunci: 'tahunAjaran' },
    kepalasekolah: { sumber: 'sekolah', kunci: 'kepalaSekolah' },
    nipkepsek: { sumber: 'sekolah', kunci: 'nipKepalaSekolah' },
    nipkepalasekolah: { sumber: 'sekolah', kunci: 'nipKepalaSekolah' },
    nomor: { sumber: 'surat', kunci: 'nomorSurat' },
    nomorsurat: { sumber: 'surat', kunci: 'nomorSurat' },
    tanggal: { sumber: 'surat', kunci: 'tanggalSurat' },
    tanggalsurat: { sumber: 'surat', kunci: 'tanggalSurat' },
  };
  return peta[kunci] || { sumber: 'bebas', kunci: nama };
}

/** Ambil teks mentah satu bagian .docx (gabung semua isi <w:t> berurutan,
 *  sehingga placeholder yang terpotong antar-run kembali menyatu). */
function teksBagian(zip: PizZip, namaBagian: string): string {
  const berkas = zip.file(namaBagian);
  if (!berkas) return '';
  const xml = berkas.asText();
  const potong: string[] = [];
  const pola = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let cocok: RegExpExecArray | null;
  while ((cocok = pola.exec(xml)) !== null) potong.push(cocok[1]);
  return potong.join('');
}

/** Deteksi placeholder {{...}} di berkas .docx (base64).
 *  Memeriksa isi, header, dan footer. Melempar Error ramah bila berkas
 *  bukan .docx valid atau tidak mengandung placeholder apa pun. */
export function deteksiPlaceholderDariBase64(base64: string): string[] {
  let zip: PizZip;
  try {
    zip = new PizZip(base64, { base64: true });
  } catch {
    throw new Error('Berkas bukan dokumen Word (.docx) yang valid.');
  }
  const bagian = ['word/document.xml'];
  Object.keys(zip.files).forEach((nama) => {
    if (/^word\/(header|footer)\d+\.xml$/.test(nama)) bagian.push(nama);
  });
  const teks = bagian.map((b) => teksBagian(zip, b)).join('\n');
  const temu = new Set<string>();
  let cocok: RegExpExecArray | null;
  POLA_PLACEHOLDER.lastIndex = 0;
  while ((cocok = POLA_PLACEHOLDER.exec(teks)) !== null) temu.add(cocok[1]);
  if (!zip.file('word/document.xml')) {
    throw new Error('Berkas bukan dokumen Word (.docx) yang valid.');
  }
  if (temu.size === 0) {
    throw new Error(
      'Tidak ditemukan placeholder {{...}} di berkas ini. Tulis placeholder seperti {{nama}} di dokumen Word, lalu unggah ulang.',
    );
  }
  return [...temu].sort((a, b) => a.localeCompare(b, 'id'));
}

/** Validasi berkas sebelum unggah; mengembalikan pesan error atau null. */
export function validasiBerkasTemplate(namaBerkas: string, ukuranBita: number): string | null {
  if (!/\.docx$/i.test(namaBerkas || '')) return 'Berkas harus berformat .docx.';
  if (ukuranBita > TEMPLATE_WORD_MAKS_BITA) {
    return `Ukuran berkas melebihi batas ${TEMPLATE_WORD_MAKS_BITA / 1024 / 1024} MB.`;
  }
  return null;
}

function atauKosong(nilai: unknown): string {
  const teks = nilai === undefined || nilai === null ? '' : String(nilai);
  return teks.trim() ? teks : PLACEHOLDER_KOSONG;
}

export interface KonteksIsiTemplate {
  siswa: Siswa | null;
  sekolah: SekolahProfile;
  nomorSurat: string;
  /** Tanggal surat ISO (YYYY-MM-DD). */
  tanggalSurat: string;
  /** Isian bebas operator, keyed by nama placeholder. */
  bebas: Record<string, string>;
}

/** Hitung nilai tiap placeholder dari pemetaannya. Nilai kosong menjadi
 *  '[BELUM DIISI]' — tidak pernah dibiarkan bolong diam-diam. */
export function nilaiPlaceholder(
  pemetaan: Record<string, PemetaanPlaceholder>,
  konteks: KonteksIsiTemplate,
): Record<string, string> {
  const hasil: Record<string, string> = {};
  for (const [nama, peta] of Object.entries(pemetaan)) {
    if (peta.sumber === 'siswa') {
      const mentah = konteks.siswa
        ? (konteks.siswa as unknown as Record<string, unknown>)[peta.kunci]
        : undefined;
      hasil[nama] = atauKosong(
        peta.kunci === 'tanggalLahir' && typeof mentah === 'string' && mentah
          ? tanggalIndo(mentah)
          : mentah,
      );
    } else if (peta.sumber === 'sekolah') {
      hasil[nama] = atauKosong(
        (konteks.sekolah as unknown as Record<string, unknown>)[peta.kunci],
      );
    } else if (peta.sumber === 'surat') {
      hasil[nama] = atauKosong(
        peta.kunci === 'tanggalSurat'
          ? konteks.tanggalSurat
            ? tanggalIndo(konteks.tanggalSurat)
            : ''
          : konteks.nomorSurat,
      );
    } else {
      hasil[nama] = atauKosong(konteks.bebas[nama]);
    }
  }
  return hasil;
}

/** Isi template Word dengan nilai placeholder; mengembalikan Blob .docx.
 *  Placeholder yang nilainya tak tersedia tetap diganti '[BELUM DIISI]'
 *  lewat nullGetter, sehingga hasil unduhan tidak pernah bolong diam-diam. */
export async function isiTemplateWord(
  berkasBase64: string,
  nilai: Record<string, string>,
): Promise<Blob> {
  let zip: PizZip;
  try {
    zip = new PizZip(berkasBase64, { base64: true });
  } catch {
    throw new Error('Berkas template rusak atau bukan dokumen Word (.docx).');
  }
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => PLACEHOLDER_KOSONG,
  });
  try {
    doc.render(nilai);
  } catch (err) {
    const pesan = err instanceof Error ? err.message : '';
    if (/unclosed|tag/i.test(pesan)) {
      throw new Error(
        'Template mengandung placeholder yang tidak tertutup (mis. {{nama tanpa }}). Perbaiki di Word, lalu unggah ulang.',
      );
    }
    throw new Error(`Template gagal diisi: ${pesan || 'kesalahan tidak diketahui.'}`);
  }
  return doc.getZip().generate({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
