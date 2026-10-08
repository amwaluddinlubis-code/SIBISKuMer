// ---------------- Dokumen Lembar Induk: Excel (.xlsx) + Word (.docx) ----------------
// Satu builder data (murni, dapat diuji) dipakai dua renderer agar isi
// Excel & Word selalu sama dengan lembar cetak. Library berat (xlsx, docx)
// dimuat dinamis → chunk terpisah.

import type { Siswa, SekolahProfile } from '../types';
import { getRaportList, getNilaiList } from './raportUtils';
import { unduhExcel, type LembarExcel } from './excel';

export interface BagianInduk {
  judul: string;
  baris: [string, string][];
}

function tglIndo(iso?: string): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

const strip = (v: unknown): string => String(v ?? '').trim() || '-';

/** Susun bagian-bagian lembar induk dari data siswa (murni). */
export function bangunLembarInduk(siswa: Siswa, sekolah: SekolahProfile): BagianInduk[] {
  const alamatLengkap = [siswa.alamat, siswa.dusun && `Dusun ${siswa.dusun}`, siswa.kelurahan, siswa.kecamatan, siswa.kabupatenKota, siswa.provinsi, siswa.kodePos && `Kode Pos ${siswa.kodePos}`]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(', ');

  const riwayatThn = [...(siswa.riwayatTahunAjaran || [])].sort((a, b) => (a.tahunAjaran || '').localeCompare(b.tahunAjaran || ''));
  const rapots = [...getRaportList(siswa)].sort(
    (a, b) => `${a.tahunAjaran || ''}-${a.semester || ''}`.localeCompare(`${b.tahunAjaran || ''}-${b.semester || ''}`)
  );

  return [
    {
      judul: 'A. Identitas Siswa',
      baris: [
        ['Nama Lengkap', strip(siswa.namaLengkap)],
        ['Nama Panggilan', strip(siswa.namaPanggilan)],
        ['Jenis Kelamin', siswa.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan'],
        ['NISN', strip(siswa.nisn)],
        ['NIPD', strip(siswa.nipd)],
        ['NIK', strip(siswa.nik)],
        ['No. Kartu Keluarga', strip(siswa.noKk)],
        ['No. Akta Lahir', strip(siswa.noAktaLahir)],
        ['Tempat, Tanggal Lahir', `${strip(siswa.tempatLahir)}, ${tglIndo(siswa.tanggalLahir)}`],
        ['Agama', strip(siswa.agama)],
        ['Kewarganegaraan', strip(siswa.kewarganegaraan)],
        ['Anak Ke', String(siswa.anakKe || '-')],
        ['Jumlah Saudara (Kandung/Tiri/Angkat)', `${siswa.jumlahSaudaraKandung ?? '-'}/${siswa.jumlahSaudaraTiri ?? '-'}/${siswa.jumlahSaudaraAngkat ?? '-'}`],
        ['Status dalam Keluarga', strip(siswa.statusDalamKeluarga)],
        ['Bahasa Sehari-hari', strip(siswa.bahasaSehariHari)],
      ],
    },
    {
      judul: 'B. Kondisi Jasmani & Kesehatan',
      baris: [
        ['Golongan Darah', strip(siswa.golonganDarah)],
        ['Tinggi / Berat Badan', `${siswa.tinggiBadan || '-'} cm / ${siswa.beratBadan || '-'} kg`],
        ['Riwayat Penyakit', strip(siswa.riwayatPenyakit)],
        ['Kelainan Fisik', strip(siswa.kelainanFisik)],
        ['Kebutuhan Khusus', strip(siswa.kebutuhanKhusus)],
      ],
    },
    {
      judul: 'C. Tempat Tinggal',
      baris: [
        ['Alamat Lengkap', strip(alamatLengkap)],
        ['RT / RW', `${strip(siswa.rt)} / ${strip(siswa.rw)}`],
        ['Tinggal Dengan', strip(siswa.tinggalDengan)],
        ['Jarak ke Sekolah', siswa.jarakKeSekolahKm ? `${siswa.jarakKeSekolahKm} km` : '-'],
        ['Transportasi', strip(siswa.transportasiKeSekolah)],
      ],
    },
    {
      judul: 'D. Orang Tua & Wali',
      baris: [
        ['Nama Ayah', strip(siswa.ayah?.nama)],
        ['NIK Ayah', strip(siswa.ayah?.nik)],
        ['Pekerjaan Ayah', strip(siswa.ayah?.pekerjaan)],
        ['Nama Ibu', strip(siswa.ibu?.nama)],
        ['NIK Ibu', strip(siswa.ibu?.nik)],
        ['Pekerjaan Ibu', strip(siswa.ibu?.pekerjaan)],
        ['Nama Wali', strip(siswa.wali?.nama)],
      ],
    },
    {
      judul: 'E. Asal Sekolah',
      baris: [
        ['Asal SD/MI', strip(siswa.asalSdMi)],
        ['NPSN Asal', strip(siswa.npsnSdMi)],
        ['No. Ijazah SD', strip(siswa.noIjazahSd)],
        ['Tahun Lulus SD', strip(siswa.tahunLulusSd)],
        ['Lama Belajar SD', siswa.lamaBelajarSd ? `${siswa.lamaBelajarSd} tahun` : '-'],
      ],
    },
    {
      judul: 'F. Penerimaan di Sekolah Ini',
      baris: [
        ['Tanggal Diterima', tglIndo(siswa.tanggalDiterima)],
        ['Diterima di Tingkat/Rombel', `Kelas ${strip(siswa.diterimaDiTingkat)} / ${strip(siswa.diterimaDiRombel)}`],
        ['Rombel Saat Ini', strip(siswa.rombelSaatIni)],
        ['Jalur Masuk', strip(siswa.jalurMasuk)],
        ['Jenis Pendaftaran', strip(siswa.jenisPendaftaran)],
        ['Status Siswa', strip(siswa.statusSiswa)],
      ],
    },
    {
      judul: 'G. P5, Ekstrakurikuler & Prestasi',
      baris: [
        ['Projek P5', (siswa.p5Projects || []).map((p) => `${p.judulProjek} (${p.tahunAjaran} Sem ${p.semester})`).join('; ') || '-'],
        ['Ekstrakurikuler', (siswa.ekstrakurikuler || []).map((e) => `${e.nama} (${e.predikat})`).join('; ') || '-'],
        ['Prestasi', (siswa.prestasi || []).map((p) => `${p.namaLomba} — ${p.peringkat} (${p.tingkat}, ${p.tahun})`).join('; ') || '-'],
      ],
    },
    {
      judul: 'H. Riwayat Kenaikan Tingkat',
      baris: riwayatThn.length > 0
        ? riwayatThn.map((r): [string, string] => [
            `TA ${r.tahunAjaran}`,
            `Kelas ${strip(r.tingkat)} ${strip(r.rombel)} — ${strip(r.statusKenaikan || r.statusAkhirTahun)}${r.catatan ? ` (${r.catatan})` : ''}`,
          ])
        : [['Riwayat', '-']],
    },
    {
      judul: 'I. Ringkasan Nilai Raport',
      baris: rapots.length > 0
        ? rapots.map((r): [string, string] => {
            const rata = r.rataRataNilai ?? (() => {
              const vals = getNilaiList(r).map((n) => Number(n.nilaiAkhir) || 0);
              return vals.length > 0 ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)) : 0;
            })();
            return [`TA ${r.tahunAjaran} Sem ${r.semester} (Kelas ${strip(r.tingkat)} ${strip(r.rombel)})`, `Rata-rata ${rata}`];
          })
        : [['Raport', '-']],
    },
  ];
}

/** Unduh lembar induk 1 siswa sebagai Excel. */
export async function unduhIndukExcel(siswa: Siswa, sekolah: SekolahProfile): Promise<void> {
  const bagian = bangunLembarInduk(siswa, sekolah);
  const judul = `LEMBAR INDUK — ${siswa.namaLengkap || ''} — ${sekolah.nama || ''}`;
  const baris: (string | number)[][] = [
    [judul], [],
    ...bagian.flatMap((b) => [[b.judul], ...b.baris.map(([k, v]) => [k, v]), []]),
  ];
  const namaFile = `LembarInduk_${(siswa.namaLengkap || 'siswa').replace(/[^a-zA-Z0-9]+/g, '_')}_${(siswa.nisn || '').trim() || 'nonisn'}`;
  await unduhExcel(namaFile, [{ nama: 'Lembar Induk', baris, lebar: [34, 90] }]);
}

/** Unduh lembar induk 1 siswa sebagai Word (.docx, A4 portrait). */
export async function unduhIndukWord(siswa: Siswa, sekolah: SekolahProfile): Promise<void> {
  const { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, HeadingLevel, AlignmentType, WidthType } = await import('docx');
  const bagian = bangunLembarInduk(siswa, sekolah);
  const anak: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [];

  const judulSekolah = new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'LEMBAR BUKU INDUK SISWA', bold: true, size: 32 })],
  });
  const subJudul = new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text: `${sekolah.nama || ''}`, bold: true, size: 24 }),
      new TextRun({ text: `\n${siswa.namaLengkap || ''} — NISN ${siswa.nisn || '-'}`, size: 22 }),
    ],
  });
  anak.push(judulSekolah, subJudul);

  for (const b of bagian) {
    anak.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: b.judul, bold: true, size: 24 })],
      })
    );
    const rows = b.baris.map(
      ([k, v]) =>
        new TableRow({
          children: [
            new TableCell({ width: { size: 32, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, size: 20 })] })] }),
            new TableCell({ width: { size: 68, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: v, size: 20 })] })] }),
          ],
        })
    );
    anak.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows,
      })
    );
  }

  anak.push(
    new Paragraph({ text: '', spacing: { before: 400 } }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Dicetak: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, size: 20 })] })
  );

  const doc = new Document({ sections: [{ children: anak }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `LembarInduk_${(siswa.namaLengkap || 'siswa').replace(/[^a-zA-Z0-9]+/g, '_')}_${(siswa.nisn || '').trim() || 'nonisn'}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
