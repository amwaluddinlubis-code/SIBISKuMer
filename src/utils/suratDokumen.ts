// ---------------- Generator Dokumen Administrasi (Issue #4) ----------------
// Modul MURNI (tanpa DOM/IndexedDB): template surat, penomoran, validasi,
// dan builder isi dokumen. Dipakai komponen GeneratorDokumen (UI) dan
// diuji langsung di Node via tests/generator-dokumen.test.ts.
//
// Prinsip:
// - Nomor TIDAK PERNAH dikarang: berasal dari aturan penomoran sekolah
//   (SekolahProfile.penomoran) atau ditulis manual oleh operator.
// - Tanda tangan TIDAK PERNAH dikarang: blok penandatangan hanya memakai
//   nama + NIP Kepala Sekolah dari profil; bila kosong, dokumen ditandai
//   belum lengkap (validasi) dan cetak/ekspor diblokir.
// - Data dokumen hanya dari siswa yang diteruskan pemanggil (App meneruskan
//   visibleSiswa yang sudah terpotong hak rombel + sesi) — modul ini tidak
//   pernah membaca database sendiri.

import type { PenomoranDokumen, PenomoranTemplate, SekolahProfile, Siswa, TemplateSuratId } from '../types';
import { resolveKop } from './kop';
import { unduhExcel } from './excel';

export type { TemplateSuratId };

// ---------------- Tanggal Indonesia (tanpa Intl — deterministik di Node) ----------------

const BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const BULAN_ROMAWI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** '2026-10-15' → '15 Oktober 2026'. Input tak valid dikembalikan apa adanya. */
export function tanggalIndo(iso?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim());
  if (!m) return (iso || '').trim();
  const tahun = Number(m[1]);
  const bulan = Number(m[2]);
  const hari = Number(m[3]);
  if (bulan < 1 || bulan > 12 || hari < 1 || hari > 31 || tahun < 1) return (iso || '').trim();
  return `${hari} ${BULAN_ID[bulan - 1]} ${tahun}`;
}

/** 1 → 'I', 10 → 'X', 12 → 'XII'. Di luar 1–12 → ''. */
export function bulanRomawi(bulan: number): string {
  if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) return '';
  return BULAN_ROMAWI[bulan - 1];
}

/** Kota + tanggal, cth. 'Mandailing Natal, 15 Oktober 2026'. */
export function kotaTanggal(sekolah: SekolahProfile, tanggalISO: string): string {
  const kota = (sekolah.kabupatenKota || '').trim().replace(/^(kab\.?|kota)\s+/i, '');
  const tgl = tanggalIndo(tanggalISO);
  if (!kota) return tgl;
  if (!tgl) return kota;
  return `${kota}, ${tgl}`;
}

// ---------------- Template ----------------

export interface FieldSurat {
  kunci: string;
  label: string;
  /** Penjelasan singkat untuk operator (tampil di form & docs). */
  deskripsi: string;
  wajib: boolean;
  multiline?: boolean;
  tipe?: 'teks' | 'tanggal' | 'jam';
}

export interface TemplateSuratMeta {
  id: TemplateSuratId;
  judul: string;
  deskripsi: string;
  /** Baris Perihal pada surat. */
  perihal: string;
  /** Butuh 1 siswa dipilih (surat per-siswa). */
  butuhSiswa: boolean;
  /** Butuh 1 rombel dipilih (daftar massal). */
  butuhRombel: boolean;
  /** Nomor surat wajib (surat resmi). Daftar rombel: nomor opsional. */
  perluNomor: boolean;
  field: FieldSurat[];
}

export const TEMPLATE_SURAT: Record<TemplateSuratId, TemplateSuratMeta> = {
  'keterangan-aktif': {
    id: 'keterangan-aktif',
    judul: 'Surat Keterangan Siswa Aktif',
    deskripsi: 'Menerangkan bahwa siswa tercatat aktif di sekolah ini.',
    perihal: 'Surat Keterangan Siswa Aktif',
    butuhSiswa: true,
    butuhRombel: false,
    perluNomor: true,
    field: [
      { kunci: 'keperluan', label: 'Keperluan', deskripsi: 'Tujuan penggunaan surat, cth. "pengajuan beasiswa".', wajib: true, multiline: true },
      { kunci: 'catatan', label: 'Catatan tambahan', deskripsi: 'Opsional. Muncul sebagai kalimat tambahan bila diisi.', wajib: false, multiline: true },
    ],
  },
  'pindah-keluar': {
    id: 'pindah-keluar',
    judul: 'Surat Keterangan Pindah / Mutasi Keluar',
    deskripsi: 'Menerangkan siswa telah pindah/keluar ke sekolah tujuan.',
    perihal: 'Surat Keterangan Pindah / Mutasi Keluar',
    butuhSiswa: true,
    butuhRombel: false,
    perluNomor: true,
    field: [
      { kunci: 'sekolahTujuan', label: 'Sekolah tujuan', deskripsi: 'Nama sekolah tujuan pindah.', wajib: true },
      { kunci: 'tanggalKeluar', label: 'Tanggal keluar', deskripsi: 'Tanggal efektif pindah/keluar.', wajib: true, tipe: 'tanggal' },
      { kunci: 'alasan', label: 'Alasan', deskripsi: 'Cth. "Pindah mengikuti orang tua".', wajib: true },
    ],
  },
  'panggilan-ortu': {
    id: 'panggilan-ortu',
    judul: 'Surat Panggilan Orang Tua / Wali',
    deskripsi: 'Memanggil orang tua/wali siswa untuk hadir ke sekolah.',
    perihal: 'Surat Panggilan Orang Tua / Wali',
    butuhSiswa: true,
    butuhRombel: false,
    perluNomor: true,
    field: [
      { kunci: 'penerima', label: 'Penerima', deskripsi: 'Siapa yang dipanggil: Ayah, Ibu, Wali, atau Orang Tua/Wali.', wajib: true },
      { kunci: 'keperluan', label: 'Keperluan', deskripsi: 'Alasan pemanggilan, cth. "membahas perkembangan belajar".', wajib: true, multiline: true },
      { kunci: 'tanggalPertemuan', label: 'Tanggal pertemuan', deskripsi: 'Tanggal orang tua/wali diharapkan hadir.', wajib: true, tipe: 'tanggal' },
      { kunci: 'jamPertemuan', label: 'Jam pertemuan', deskripsi: 'Cth. "09:00".', wajib: true, tipe: 'jam' },
      { kunci: 'tempat', label: 'Tempat', deskripsi: 'Cth. "Ruang Kepala Sekolah".', wajib: true },
      { kunci: 'catatan', label: 'Catatan tambahan', deskripsi: 'Opsional. Cth. "Harap membawa kartu keluarga".', wajib: false, multiline: true },
    ],
  },
  'daftar-rombel': {
    id: 'daftar-rombel',
    judul: 'Daftar Siswa per Kelas / Rombel',
    deskripsi: 'Daftar nama siswa aktif satu rombel untuk lampiran administrasi.',
    perihal: 'Daftar Siswa Rombel',
    butuhSiswa: false,
    butuhRombel: true,
    perluNomor: false,
    field: [
      { kunci: 'catatan', label: 'Catatan tambahan', deskripsi: 'Opsional. Muncul di bawah tabel bila diisi.', wajib: false, multiline: true },
    ],
  },
};

export const DAFTAR_TEMPLATE_SURAT: TemplateSuratMeta[] = Object.values(TEMPLATE_SURAT);

// ---------------- Penomoran ----------------

/** Pola bawaan — CONTOH AWAL yang wajib disesuaikan sekolah di pengaturan.
 *  Placeholder: {no} nomor urut apa adanya, {no3} nomor urut 3 digit,
 *  {bulan} bulan 2 digit, {bulanRomawi} bulan Romawi, {tahun} tahun surat. */
export function defaultPenomoran(): PenomoranDokumen {
  return {
    'keterangan-aktif': { pola: '{no}/SK-AKTIF/{bulanRomawi}/{tahun}', nomorTerakhir: 0 },
    'pindah-keluar': { pola: '{no}/SK-PINDAH/{bulanRomawi}/{tahun}', nomorTerakhir: 0 },
    'panggilan-ortu': { pola: '{no}/SP-ORTU/{bulanRomawi}/{tahun}', nomorTerakhir: 0 },
    'daftar-rombel': { pola: '{no}/DAFTAR-ROMBEL/{bulanRomawi}/{tahun}', nomorTerakhir: 0 },
  };
}

/** Penomoran efektif: bawaan + timpa konfigurasi sekolah (profil lama valid). */
export function getPenomoran(sekolah: SekolahProfile, id: TemplateSuratId): PenomoranTemplate {
  const bawaan = defaultPenomoran()[id] as PenomoranTemplate;
  const simpan = (sekolah.penomoran || {})[id];
  return { ...bawaan, ...(simpan || {}) };
}

/** Saran nomor urut berikutnya = nomorTerakhir + 1. */
export function saranNomorUrut(penomoran: PenomoranTemplate): number {
  const terakhir = Number.isFinite(penomoran.nomorTerakhir) ? penomoran.nomorTerakhir : 0;
  return Math.max(1, Math.floor(terakhir) + 1);
}

/**
 * Susun nomor surat dari pola. Placeholder tak dikenal dibiarkan apa adanya
 * agar salah konfigurasi TERLIHAT di pratinjau, bukan hilang diam-diam.
 */
export function formatNomorSurat(pola: string, nomorUrut: number, tanggalISO: string): string {
  const p = (pola || '').trim();
  if (!p) return String(nomorUrut);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((tanggalISO || '').trim());
  const tahun = m ? m[1] : '';
  const bulan = m ? Number(m[2]) : 0;
  return p
    .replaceAll('{no3}', String(nomorUrut).padStart(3, '0'))
    .replaceAll('{no}', String(nomorUrut))
    .replaceAll('{bulanRomawi}', bulanRomawi(bulan))
    .replaceAll('{bulan}', m ? m[2] : '')
    .replaceAll('{tahun}', tahun);
}

/** Penomoran baru setelah nomor urut dipakai (tidak pernah mundur). */
export function tandaiNomorTerpakai(penomoran: PenomoranTemplate, nomorUrut: number): PenomoranTemplate {
  return { ...penomoran, nomorTerakhir: Math.max(penomoran.nomorTerakhir || 0, nomorUrut) };
}

/** Profil baru dengan penomoran template diperbarui (murni, tanpa mutasi). */
export function terapkanPenomoran(sekolah: SekolahProfile, id: TemplateSuratId, nomorUrut: number): SekolahProfile {
  return {
    ...sekolah,
    penomoran: {
      ...(sekolah.penomoran || {}),
      [id]: tandaiNomorTerpakai(getPenomoran(sekolah, id), nomorUrut),
    },
  };
}

// ---------------- Input & validasi ----------------

export interface InputSurat {
  /** Nomor urut (0 = tanpa nomor; hanya daftar rombel yang membolehkan). */
  nomorUrut: number;
  /** Bila diisi, dipakai apa adanya — untuk mencetak ulang dengan nomor
   *  tercatat (mis. nomor dari data mutasi) yang tidak mengikuti pola. */
  nomorManual?: string;
  /** Tanggal surat, format YYYY-MM-DD. */
  tanggalSurat: string;
  /** Nilai field template, keyed by FieldSurat.kunci. */
  field: Record<string, string>;
}

/** Kandidat siswa untuk template: hanya status yang relevan.
 *  Surat pindah menerima siswa Aktif (diproses) & Mutasi Keluar (cetak
 *  ulang dari data mutasi tercatat). Template lain hanya siswa Aktif. */
export function siswaUntukTemplate(siswaList: Siswa[], templateId: TemplateSuratId): Siswa[] {
  if (templateId === 'pindah-keluar') {
    return (siswaList || []).filter((s) => s.statusSiswa === 'Aktif' || s.statusSiswa === 'Mutasi Keluar');
  }
  return (siswaList || []).filter((s) => s.statusSiswa === 'Aktif');
}

/** Nilai awal field dari data siswa (prefill — BUKAN karangan).
 *  Surat pindah mengambil sekolah tujuan / tanggal / alasan dari data
 *  mutasi tercatat bila ada; field lain kosong (operator mengisi). */
export function prefillField(templateId: TemplateSuratId, siswa: Siswa | null): Record<string, string> {
  if (!siswa) return {};
  if (templateId === 'pindah-keluar') {
    return {
      sekolahTujuan: siswa.sekolahTujuan || '',
      tanggalKeluar: siswa.tanggalKeluar || '',
      alasan: siswa.alasanKeluar || '',
    };
  }
  return {};
}

/** Label field wajib yang masih kosong (dipakai pratinjau + blokir cetak).
 *  Mengembalikan label manusiawi, BUKAN kunci field. */
export function validasiSurat(
  templateId: TemplateSuratId,
  input: InputSurat,
  siswa: Siswa | null,
  rombel: string,
  daftarRombel: Siswa[],
  sekolah: SekolahProfile,
): string[] {
  const meta = TEMPLATE_SURAT[templateId];
  const hilang: string[] = [];

  if (meta.butuhSiswa && !siswa) hilang.push('Siswa');
  if (meta.butuhRombel) {
    if (!rombel.trim()) hilang.push('Rombel');
    else if (daftarRombel.length === 0) hilang.push('Daftar siswa rombel (tidak ada siswa aktif di rombel ini)');
  }

  const nomorManual = (input.nomorManual || '').trim();
  if (meta.perluNomor) {
    if (!nomorManual && (!Number.isInteger(input.nomorUrut) || input.nomorUrut < 1)) {
      hilang.push('Nomor urut surat');
    }
  }
  if (!input.tanggalSurat.trim()) hilang.push('Tanggal surat');

  for (const f of meta.field) {
    if (f.wajib && !(input.field[f.kunci] || '').trim()) hilang.push(f.label);
  }

  // Blok penandatangan: nama Kepala Sekolah dari profil — tidak dikarang.
  if (!(sekolah.kepalaSekolah || '').trim()) hilang.push('Nama Kepala Sekolah (di Profil Sekolah)');

  return hilang;
}

// ---------------- Builder dokumen ----------------

export interface DokumenSurat {
  templateId: TemplateSuratId;
  judul: string;
  perihal: string;
  /** Nomor lengkap ('' bila tanpa nomor). */
  nomor: string;
  tanggalSurat: string;
  /** 'Kota, 15 Oktober 2026'. */
  kotaTanggal: string;
  /** Baris 'Kepada Yth.' (hanya surat panggilan). */
  kepada: string[];
  pembuka: string;
  /** Paragraf isi (tanda '[BELUM DIISI]' untuk field wajib kosong — pratinjau menandainya). */
  paragraf: string[];
  /** Tabel isi (biodata / daftar rombel). */
  tabel?: { header: string[]; baris: string[][] };
  penutup: string;
  penandatangan: { jabatan: string; nama: string; nip: string };
}

const BELUM = '[BELUM DIISI]';

function atauBelum(v: string | undefined | null): string {
  const s = (v ?? '').trim();
  return s || BELUM;
}

function jenisKelaminPanjang(jk: string): string {
  return jk === 'L' ? 'Laki-laki' : jk === 'P' ? 'Perempuan' : '-';
}

function biodataTabel(siswa: Siswa): { header: string[]; baris: string[][] } {
  return {
    header: ['Keterangan', 'Data Siswa'],
    baris: [
      ['Nama Lengkap', siswa.namaLengkap || BELUM],
      ['NISN', siswa.nisn || '-'],
      ['NIPD', siswa.nipd || '-'],
      ['Tempat, Tanggal Lahir', `${siswa.tempatLahir || ''}, ${tanggalIndo(siswa.tanggalLahir) || ''}`.trim().replace(/^,|,$/g, '').trim() || '-'],
      ['Jenis Kelamin', jenisKelaminPanjang(siswa.jenisKelamin)],
      ['Kelas / Rombel', siswa.rombelSaatIni || '-'],
      ['Alamat', siswa.alamat || '-'],
    ],
  };
}

function penandatanganDari(sekolah: SekolahProfile): DokumenSurat['penandatangan'] {
  return {
    jabatan: `Kepala ${sekolah.nama || 'Sekolah'}`,
    nama: sekolah.kepalaSekolah || '',
    nip: sekolah.nipKepalaSekolah || '',
  };
}

/**
 * Susun isi dokumen dari input + data. TIDAK PERNAH mengarang: nilai kosong
 * dibiarkan sebagai penanda [BELUM DIISI] (pratinjau menandainya & cetak
 * diblokir oleh validasiSurat) — bukan diisi tebakan.
 */
export function bangunDokumenSurat(
  templateId: TemplateSuratId,
  input: InputSurat,
  siswa: Siswa | null,
  rombel: string,
  daftarRombel: Siswa[],
  sekolah: SekolahProfile,
): DokumenSurat {
  const meta = TEMPLATE_SURAT[templateId];
  const penomoran = getPenomoran(sekolah, templateId);
  const nomorManual = (input.nomorManual || '').trim();
  const nomor = nomorManual || (input.nomorUrut >= 1 ? formatNomorSurat(penomoran.pola, input.nomorUrut, input.tanggalSurat) : '');
  const dasar = {
    templateId,
    judul: meta.judul,
    perihal: meta.perihal,
    nomor,
    tanggalSurat: input.tanggalSurat,
    kotaTanggal: kotaTanggal(sekolah, input.tanggalSurat),
    kepada: [] as string[],
    penandatangan: penandatanganDari(sekolah),
  };

  if (templateId === 'keterangan-aktif') {
    const keperluan = atauBelum(input.field.keperluan);
    const catatan = (input.field.catatan || '').trim();
    return {
      ...dasar,
      pembuka: `Yang bertanda tangan di bawah ini, Kepala ${sekolah.nama || 'Sekolah'}, menerangkan bahwa:`,
      paragraf: [
        `Bahwa yang bersangkutan adalah benar-benar siswa aktif di ${sekolah.nama || 'sekolah ini'} pada Tahun Ajaran ${sekolah.tahunAjaran || '-'}, dan surat keterangan ini dibuat untuk keperluan ${keperluan}.`,
        ...(catatan ? [catatan] : []),
      ],
      tabel: siswa ? biodataTabel(siswa) : undefined,
      penutup: 'Demikian surat keterangan ini dibuat untuk dapat dipergunakan sebagaimana mestinya.',
    };
  }

  if (templateId === 'pindah-keluar') {
    const tujuan = atauBelum(input.field.sekolahTujuan);
    const tglKeluar = tanggalIndo(input.field.tanggalKeluar) || atauBelum(input.field.tanggalKeluar);
    const alasan = atauBelum(input.field.alasan);
    const barisTambahan = siswa
      ? [
          ['Sekolah Tujuan', tujuan],
          ['Tanggal Keluar', tglKeluar],
          ['Alasan', alasan],
        ]
      : [];
    return {
      ...dasar,
      pembuka: `Yang bertanda tangan di bawah ini, Kepala ${sekolah.nama || 'Sekolah'}, menerangkan bahwa:`,
      paragraf: [
        `Bahwa yang bersangkutan telah pindah / keluar dari ${sekolah.nama || 'sekolah ini'} ke ${tujuan} terhitung mulai tanggal ${tglKeluar} dengan alasan ${alasan}.`,
      ],
      tabel: siswa ? { header: ['Keterangan', 'Data Siswa'], baris: [...biodataTabel(siswa).baris, ...barisTambahan] } : undefined,
      penutup: 'Demikian surat keterangan ini dibuat untuk dapat dipergunakan sebagaimana mestinya.',
    };
  }

  if (templateId === 'panggilan-ortu') {
    const penerima = atauBelum(input.field.penerima);
    const keperluan = atauBelum(input.field.keperluan);
    const tglPertemuan = tanggalIndo(input.field.tanggalPertemuan) || atauBelum(input.field.tanggalPertemuan);
    const jam = atauBelum(input.field.jamPertemuan);
    const tempat = atauBelum(input.field.tempat);
    const catatan = (input.field.catatan || '').trim();
    return {
      ...dasar,
      kepada: [`Yth. ${penerima} dari ${siswa ? siswa.namaLengkap : BELUM}`, 'di Tempat'],
      pembuka: 'Dengan hormat,',
      paragraf: [
        `Sehubungan dengan ${keperluan}, kami mengharapkan kehadiran Bapak/Ibu ${penerima} dari siswa ${siswa ? siswa.namaLengkap : BELUM} pada:`,
        ...(catatan ? [catatan] : []),
      ],
      tabel: {
        header: ['Keterangan', 'Jadwal'],
        baris: [
          ['Hari / Tanggal', tglPertemuan],
          ['Pukul', `${jam} WIB`],
          ['Tempat', tempat],
          ['Keperluan', keperluan],
        ],
      },
      penutup: 'Atas perhatian dan kehadiran Bapak/Ibu, kami mengucapkan terima kasih.',
    };
  }

  // daftar-rombel
  const urut = [...daftarRombel].sort((a, b) => (a.namaLengkap || '').localeCompare(b.namaLengkap || '', 'id'));
  return {
    ...dasar,
    pembuka: `Daftar siswa aktif Rombel ${rombel || BELUM} Tahun Ajaran ${sekolah.tahunAjaran || '-'}:`,
    paragraf: [
      `Jumlah siswa: ${urut.length} siswa. Daftar ini dibuat untuk keperluan lampiran administrasi.`,
      ...((input.field.catatan || '').trim() ? [(input.field.catatan || '').trim()] : []),
    ],
    tabel: {
      header: ['No', 'Nama Lengkap', 'NISN', 'NIPD', 'L/P', 'Tempat, Tanggal Lahir'],
      baris: urut.map((s, i) => [
        String(i + 1),
        s.namaLengkap || '-',
        s.nisn || '-',
        s.nipd || '-',
        s.jenisKelamin || '-',
        `${s.tempatLahir || ''}, ${tanggalIndo(s.tanggalLahir) || ''}`.trim().replace(/^,|,$/g, '').trim() || '-',
      ]),
    },
    penutup: 'Demikian daftar ini dibuat untuk dipergunakan sebagaimana mestinya.',
  };
}

// ---------------- Ekspor ----------------

/** Unduh surat (3 template surat + daftar rombel) sebagai Word (.docx, A4).
 *  Kop memakai TEKS kop resmi (resolveKop) — logo tidak disematkan ke DOCX
 *  (keterbatasan yang didokumentasikan; cetak via browser memakai kop
 *  lengkap termasuk logo). */
export async function unduhSuratWord(dok: DokumenSurat, sekolah: SekolahProfile): Promise<void> {
  const { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, HeadingLevel, AlignmentType, WidthType } = await import('docx');
  const { baris1, baris2, alamat, kontak } = resolveKop(sekolah);
  const anak: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [];

  const kopTeks = [baris1, baris2, sekolah.nama || '', alamat, kontak].filter((t) => t && t.trim());
  for (const [i, teks] of kopTeks.entries()) {
    anak.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: teks, bold: i < 3, size: 22 })],
      })
    );
  }
  anak.push(new Paragraph({ text: '' }));

  anak.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: dok.judul.toUpperCase(), bold: true, size: 26 })],
    })
  );
  if (dok.nomor) {
    anak.push(new Paragraph({ children: [new TextRun({ text: `Nomor : ${dok.nomor}`, size: 22 })] }));
  }
  anak.push(
    new Paragraph({ children: [new TextRun({ text: `Perihal : ${dok.perihal}`, size: 22 })] }),
    new Paragraph({ text: '' })
  );

  for (const baris of dok.kepada) {
    anak.push(new Paragraph({ children: [new TextRun({ text: baris, size: 22 })] }));
  }
  if (dok.kepada.length > 0) anak.push(new Paragraph({ text: '' }));

  anak.push(new Paragraph({ alignment: AlignmentType.JUSTIFY, children: [new TextRun({ text: dok.pembuka, size: 22 })] }));

  if (dok.tabel) {
    const headerRow = new TableRow({
      children: dok.tabel.header.map(
        (h) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20 })] })] })
      ),
    });
    const rows = dok.tabel.baris.map(
      (r) =>
        new TableRow({
          children: r.map(
            (c) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: c, size: 20 })] })] })
          ),
        })
    );
    anak.push(new Paragraph({ text: '' }), new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...rows] }), new Paragraph({ text: '' }));
  }

  for (const p of dok.paragraf) {
    anak.push(new Paragraph({ alignment: AlignmentType.JUSTIFY, children: [new TextRun({ text: p, size: 22 })] }));
  }
  anak.push(
    new Paragraph({ alignment: AlignmentType.JUSTIFY, children: [new TextRun({ text: dok.penutup, size: 22 })] }),
    new Paragraph({ text: '' }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: dok.kotaTanggal, size: 22 })] }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: dok.penandatangan.jabatan, size: 22 })] }),
    new Paragraph({ text: '' }),
    new Paragraph({ text: '' }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: dok.penandatangan.nama, bold: true, size: 22 })] }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: dok.penandatangan.nip ? `NIP. ${dok.penandatangan.nip}` : '', size: 22 })] })
  );

  const doc = new Document({ sections: [{ children: anak }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const aman = dok.judul.replace(/[^a-zA-Z0-9]+/g, '_');
  a.download = `${aman}_${(dok.tanggalSurat || 'tanpa-tanggal')}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Unduh daftar rombel sebagai Excel (.xlsx) — isi sama dengan pratinjau. */
export async function unduhDaftarRombelExcel(dok: DokumenSurat, sekolah: SekolahProfile, rombel: string): Promise<void> {
  if (!dok.tabel) throw new Error('Tidak ada tabel untuk diekspor.');
  const judul = `${dok.judul.toUpperCase()} — ${sekolah.nama || ''}`;
  const baris: (string | number)[][] = [
    [judul],
    [dok.nomor ? `Nomor : ${dok.nomor}` : '', dok.kotaTanggal],
    [],
    dok.tabel.header,
    ...dok.tabel.baris,
    [],
    [`Jumlah siswa: ${dok.tabel.baris.length} siswa`],
  ];
  const namaFile = `DaftarSiswa_${rombel.replace(/[^a-zA-Z0-9]+/g, '_')}_${(dok.tanggalSurat || 'tanpa-tanggal')}`;
  await unduhExcel(namaFile, [{ nama: `Rombel ${rombel}`, baris, lebar: [6, 40, 16, 16, 6, 34] }]);
}
