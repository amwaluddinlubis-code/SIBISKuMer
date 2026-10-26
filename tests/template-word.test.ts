/**
 * Tes mesin template surat Word (fitur unggah .docx).
 * Hanya fungsi MURNI dari src/utils/templateWord.ts (tanpa DOM/IndexedDB).
 * Dokumen .docx minimal dibangun di dalam tes via PizZip — TIDAK memakai
 * data siswa nyata, semua fixture fiktif.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import PizZip from 'pizzip';
import type { SekolahProfile, Siswa } from '../src/types';
import {
  PLACEHOLDER_KOSONG,
  TEMPLATE_WORD_MAKS_BITA,
  deteksiPlaceholderDariBase64,
  isiTemplateWord,
  nilaiPlaceholder,
  saranPemetaan,
  validasiBerkasTemplate,
} from '../src/utils/templateWord';

const CONTENT_TYPES =
  '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
const RELS =
  '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';

function docxBase64(isiDokumen: string, isiHeader?: string): string {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', RELS);
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${isiDokumen}</w:body></w:document>`,
  );
  if (isiHeader !== undefined) {
    zip.file(
      'word/header1.xml',
      `<?xml version="1.0"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${isiHeader}</w:hdr>`,
    );
  }
  return zip.generate({ type: 'base64' });
}

function run(teks: string): string {
  return `<w:p><w:r><w:t>${teks}</w:t></w:r></w:p>`;
}

const siswaFiktif = {
  namaLengkap: 'Budi Santoso',
  nisn: '0012345678',
  nipd: '1001',
  rombelSaatIni: '7A',
  tempatLahir: 'Panyabungan',
  tanggalLahir: '2013-05-02',
  jenisKelamin: 'L',
  alamat: 'Jl. Merdeka No. 1',
  statusSiswa: 'Aktif',
} as unknown as Siswa;

const sekolahFiktif = {
  nama: 'SMP Negeri 3 Sinunukan Satap',
  npsn: '10234567',
  alamat: 'Jl. Pendidikan No. 9',
  tahunAjaran: '2026/2027',
  kepalaSekolah: 'Dewi Lestari',
  nipKepalaSekolah: '198001012005012001',
} as unknown as SekolahProfile;

describe('deteksi placeholder', () => {
  test('menemukan placeholder, menggabung potongan antar-run, dedup & urut', () => {
    // {{na + ma}} terpotong jadi dua run (penyakit khas file Word asli).
    const base64 = docxBase64(
      `<w:p><w:r><w:t>Halo {{na</w:t></w:r><w:r><w:t>ma}}, NISN {{nisn}}, {{nama}} lagi.</w:t></w:r></w:p>`,
      `<w:p><w:r><w:t>Kop {{sekolah}}</w:t></w:r></w:p>`,
    );
    assert.deepEqual(deteksiPlaceholderDariBase64(base64), ['nama', 'nisn', 'sekolah']);
  });

  test('menolak berkas bukan docx', () => {
    assert.throws(
      () => deteksiPlaceholderDariBase64(Buffer.from('bukan zip').toString('base64')),
      /bukan dokumen Word/,
    );
  });

  test('menolak docx tanpa placeholder', () => {
    const base64 = docxBase64(run('Surat biasa tanpa isian.'));
    assert.throws(() => deteksiPlaceholderDariBase64(base64), /Tidak ditemukan placeholder/);
  });
});

describe('saran pemetaan', () => {
  test('nama dikenal dipetakan ke sumber data nyata', () => {
    assert.deepEqual(saranPemetaan('nama'), { sumber: 'siswa', kunci: 'namaLengkap' });
    assert.deepEqual(saranPemetaan('NISN'), { sumber: 'siswa', kunci: 'nisn' });
    assert.deepEqual(saranPemetaan('nomor_surat'), { sumber: 'surat', kunci: 'nomorSurat' });
    assert.deepEqual(saranPemetaan('tanggal'), { sumber: 'surat', kunci: 'tanggalSurat' });
    assert.deepEqual(saranPemetaan('nama_sekolah'), { sumber: 'sekolah', kunci: 'nama' });
    assert.deepEqual(saranPemetaan('nip_kepsek'), { sumber: 'sekolah', kunci: 'nipKepalaSekolah' });
  });

  test('nama tak dikenal menjadi isian bebas', () => {
    assert.deepEqual(saranPemetaan('keperluan'), { sumber: 'bebas', kunci: 'keperluan' });
  });
});

describe('nilai placeholder', () => {
  test('mengisi dari siswa, sekolah, surat, dan isian bebas', () => {
    const nilai = nilaiPlaceholder(
      {
        nama: { sumber: 'siswa', kunci: 'namaLengkap' },
        lahir: { sumber: 'siswa', kunci: 'tanggalLahir' },
        sekolah: { sumber: 'sekolah', kunci: 'nama' },
        nomor: { sumber: 'surat', kunci: 'nomorSurat' },
        tanggal: { sumber: 'surat', kunci: 'tanggalSurat' },
        keperluan: { sumber: 'bebas', kunci: 'keperluan' },
      },
      {
        siswa: siswaFiktif,
        sekolah: sekolahFiktif,
        nomorSurat: '12/SK/2026',
        tanggalSurat: '2026-10-27',
        bebas: { keperluan: 'pengajuan beasiswa' },
      },
    );
    assert.equal(nilai.nama, 'Budi Santoso');
    assert.equal(nilai.lahir, '2 Mei 2013');
    assert.equal(nilai.sekolah, 'SMP Negeri 3 Sinunukan Satap');
    assert.equal(nilai.nomor, '12/SK/2026');
    assert.equal(nilai.tanggal, '27 Oktober 2026');
    assert.equal(nilai.keperluan, 'pengajuan beasiswa');
  });

  test('nilai kosong menjadi penanda, bukan bolong', () => {
    const nilai = nilaiPlaceholder(
      {
        nama: { sumber: 'siswa', kunci: 'namaLengkap' },
        keperluan: { sumber: 'bebas', kunci: 'keperluan' },
      },
      {
        siswa: null,
        sekolah: sekolahFiktif,
        nomorSurat: '',
        tanggalSurat: '',
        bebas: {},
      },
    );
    assert.equal(nilai.nama, PLACEHOLDER_KOSONG);
    assert.equal(nilai.keperluan, PLACEHOLDER_KOSONG);
  });
});

describe('render docx', () => {
  test('mengisi placeholder terpotong antar-run; yang hilang jadi penanda', async () => {
    const base64 = docxBase64(
      `<w:p><w:r><w:t>Halo {{na</w:t></w:r><w:r><w:t>ma}}, NISN {{nisn}}, kosong {{tidakAda}}.</w:t></w:r></w:p>`,
    );
    const blob = await isiTemplateWord(base64, { nama: 'Budi Santoso', nisn: '0012345678' });
    const buf = Buffer.from(await blob.arrayBuffer());
    const keluar = new PizZip(buf).file('word/document.xml')!.asText();
    assert.match(keluar, /Budi Santoso/);
    assert.match(keluar, /0012345678/);
    assert.match(keluar, /\[BELUM DIISI\]/);
    assert.doesNotMatch(keluar, /\{\{/);
  });
});

describe('validasi berkas', () => {
  test('menolak bukan .docx dan berkas di atas batas', () => {
    assert.match(validasiBerkasTemplate('surat.pdf', 100) || '', /\.docx/);
    assert.match(
      validasiBerkasTemplate('surat.docx', TEMPLATE_WORD_MAKS_BITA + 1) || '',
      /melebihi batas/,
    );
    assert.equal(validasiBerkasTemplate('surat.docx', 100), null);
  });
});
