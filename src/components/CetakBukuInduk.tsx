import React, { useEffect, useRef, useState } from 'react';
import { Printer, Download, ArrowLeft, CreditCard, FileText, Award, BookOpen, Calendar, CheckCircle2 } from 'lucide-react';
import { Siswa, SekolahProfile } from '../types';
import { getFaseKurikulum, getRaportList, getNilaiList, hitungRataRataNilai } from '../utils/raportUtils';
import { tahanMaksSesi } from '../utils/sesi';
import { KopSuratView } from './KopSuratView';
import { KartuPelajar, TemplateKartu, TEMPLATE_KARTU } from './KartuPelajar';
import { unduhIndukExcel, unduhIndukWord } from '../utils/dokumenInduk';
import { toast } from '../utils/notify';

interface CetakBukuIndukProps {
  siswa: Siswa;
  sekolah: SekolahProfile;
  /** Sesi tahun ajaran login — transkrip raport dibuka pada tahun sesi. */
  sessionTahun?: string | null;
  onClose: () => void;
}

export const CetakBukuInduk: React.FC<CetakBukuIndukProps> = ({
  siswa,
  sekolah,
  sessionTahun,
  onClose
}) => {
  const [printMode, setPrintMode] = useState<'buku-induk' | 'raport' | 'kartu-pelajar'>('buku-induk');
  const [selectedSemesterId, setSelectedSemesterId] = useState<string>('all');
  const [templateKartu, setTemplateKartu] = useState<TemplateKartu>('dinas');
  const [exportingInduk, setExportingInduk] = useState<null | 'excel' | 'word'>(null);

  const handleExportInduk = async (format: 'excel' | 'word') => {
    setExportingInduk(format);
    try {
      if (format === 'excel') {
        await unduhIndukExcel(siswa, sekolah);
      } else {
        await unduhIndukWord(siswa, sekolah);
      }
      toast(`Lembar induk "${siswa.namaLengkap}" diunduh (${format === 'excel' ? '.xlsx' : '.docx'}).`, 'success');
    } catch (err: unknown) {
      toast(`Gagal mengekspor: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setExportingInduk(null);
    }
  };
  const printRef = useRef<HTMLDivElement>(null);

  // Fondasi sesi: transkrip dibuka pada raport tahun sesi (bila ada).
  const [sesiDiterapkan, setSesiDiterapkan] = useState(false);
  useEffect(() => {
    if (!sesiDiterapkan && (sessionTahun || '').trim()) {
      const cocok = getRaportList(siswa).find((r) => (r.tahunAjaran || '').trim() === (sessionTahun || '').trim());
      if (cocok) setSelectedSemesterId(cocok.id);
      setSesiDiterapkan(true);
    }
  }, [sesiDiterapkan, sessionTahun, siswa]);

  const handlePrint = () => {
    window.print();
  };

  const formatDateIndo = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const jenjang = sekolah.jenjang || 'SMP';
  // Cutoff sesi: baris raport/riwayat di atas sesi aktif tidak dicetak.
  const sesiEfektif = (sessionTahun || sekolah.tahunAjaran || '').trim();
  const raportList = tahanMaksSesi(getRaportList(siswa), (r) => r.tahunAjaran, sesiEfektif);
  const riwayatTampil = tahanMaksSesi(siswa.riwayatTahunAjaran || [], (rw) => rw.tahunAjaran, sesiEfektif);
  const faseLabel = jenjang === 'SD' ? 'Fase A/B/C' : 'Fase D';
  const tingkatSiswa = (siswa.rombelSaatIni || siswa.diterimaDiTingkat || (jenjang === 'SD' ? '1' : '7')).charAt(0);
  const faseSiswa = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(tingkatSiswa)
    ? getFaseKurikulum(tingkatSiswa as '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9')
    : faseLabel;
  const asalTitle = jenjang === 'SD' ? 'TK/PAUD/RA' : 'SD/MI';
  const ijazahLabel = jenjang === 'SD' ? 'No. SKL / Ijazah (jika ada)' : 'No. Ijazah SD';

  return (
    <div className="print-sheet-root fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs overflow-y-auto flex flex-col items-center justify-start p-2 sm:p-6 print:p-0 print:bg-white print:static">
      {/* Top Floating Action Bar (Hidden when printing) */}
      <div className="w-full max-w-4xl bg-white rounded-xl shadow-xl p-3 sm:p-4 mb-4 flex flex-wrap items-center justify-between gap-3 border border-slate-200 print:hidden sticky top-2 z-20">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali
          </button>
          <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setPrintMode('buku-induk')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
                printMode === 'buku-induk'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Lembar Buku Induk
            </button>
            <button
              onClick={() => setPrintMode('raport')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
                printMode === 'raport'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              Transkrip Nilai Raport
            </button>
            <button
              onClick={() => setPrintMode('kartu-pelajar')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
                printMode === 'kartu-pelajar'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              Kartu Pelajar
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {sessionTahun && (
            <span className="hidden sm:inline-block text-[11px] font-mono font-extrabold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
              Sesi {sessionTahun}
            </span>
          )}
          {printMode === 'raport' && raportList.length > 0 && (
            <select
              value={selectedSemesterId}
              onChange={(e) => setSelectedSemesterId(e.target.value)}
              className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-medium"
            >
              <option value="all">Semua Semester (Multi-Tahun)</option>
              {raportList.map((r) => (
                <option key={r.id} value={r.id}>
                  Kelas {r.tingkat} Sem. {r.semester} ({r.tahunAjaran})
                </option>
              ))}
            </select>
          )}

          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Cetak Dokumen (Print / PDF)
          </button>
          {printMode === 'buku-induk' && (
            <>
              <button
                onClick={() => void handleExportInduk('excel')}
                disabled={exportingInduk !== null}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-60"
                title="Unduh lembar induk sebagai Excel (.xlsx)"
              >
                <Download className="w-4 h-4" />
                {exportingInduk === 'excel' ? 'Menyiapkan…' : 'Excel'}
              </button>
              <button
                onClick={() => void handleExportInduk('word')}
                disabled={exportingInduk !== null}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-60"
                title="Unduh lembar induk sebagai Word (.docx)"
              >
                <Download className="w-4 h-4" />
                {exportingInduk === 'word' ? 'Menyiapkan…' : 'Word'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Printable Document */}
      <div
        ref={printRef}
        className="print-sheet w-full max-w-4xl bg-white text-slate-900 shadow-2xl rounded-xl sm:rounded-none p-6 sm:p-12 print:p-4 print:shadow-none print:max-w-none print:w-full print:rounded-none border border-slate-200 print:border-none font-sans text-xs"
      >
        {printMode === 'buku-induk' ? (
          <div className="space-y-6">
            {/* Kop Resmi Sekolah (diatur di Profil Sekolah → Kop Surat) */}
            <KopSuratView sekolah={sekolah} />

            {/* Judul Lembar Buku Induk */}
            <div className="text-center my-3">
              <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-widest text-slate-900 underline underline-offset-4">
                LEMBAR BUKU INDUK SISWA
              </h2>
              <p className="text-[11px] font-semibold text-slate-600 mt-1 uppercase">
                {jenjang === 'SD' ? 'SEKOLAH DASAR (SD)' : 'SEKOLAH MENENGAH PERTAMA (SMP)'} - {faseLabel.toUpperCase()} KURIKULUM MERDEKA
              </p>
            </div>

            {/* Header Mini Status / Nomor Pokok */}
            <div className="flex flex-wrap items-center justify-between bg-slate-50 border border-slate-300 p-2.5 rounded text-[11px]">
              <div>
                <span>Nomor Induk Siswa (NIPD): </span>
                <strong className="text-slate-900 font-mono text-xs">{siswa.nipd || '-'}</strong>
              </div>
              <div>
                <span>Nomor Induk Siswa Nasional (NISN): </span>
                <strong className="text-slate-900 font-mono text-xs">{siswa.nisn || '-'}</strong>
              </div>
              <div>
                <span>Status Siswa: </span>
                <span className="font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded text-[10px]">
                  {siswa.statusSiswa}
                </span>
              </div>
            </div>

            {/* Section A: Identitas Siswa & Pas Foto */}
            <div className="border border-slate-300 rounded overflow-hidden">
              <div className="bg-slate-800 text-white font-bold px-3 py-1.5 text-[11px] uppercase tracking-wide flex items-center justify-between">
                <span>A. KETERANGAN TENTANG DIRI PESERTA DIDIK</span>
                <span className="text-[10px] font-normal text-slate-300">Bagian 1</span>
              </div>

              <div className="p-3 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-3 space-y-1.5 text-[11px]">
                  <div className="grid grid-cols-3 py-1 border-b border-slate-100">
                    <span className="text-slate-600">1. Nama Lengkap</span>
                    <span className="col-span-2 font-bold uppercase text-slate-900">{siswa.namaLengkap}</span>
                  </div>
                  <div className="grid grid-cols-3 py-1 border-b border-slate-100">
                    <span className="text-slate-600">2. Nama Panggilan</span>
                    <span className="col-span-2 text-slate-800">{siswa.namaPanggilan || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 py-1 border-b border-slate-100">
                    <span className="text-slate-600">3. Jenis Kelamin</span>
                    <span className="col-span-2 text-slate-800">
                      {siswa.jenisKelamin === 'L' ? 'Laki-laki (L)' : 'Perempuan (P)'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 py-1 border-b border-slate-100">
                    <span className="text-slate-600">4. Tempat, Tanggal Lahir</span>
                    <span className="col-span-2 text-slate-800">
                      {siswa.tempatLahir}, {formatDateIndo(siswa.tanggalLahir)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 py-1 border-b border-slate-100">
                    <span className="text-slate-600">5. Agama & Kepercayaan</span>
                    <span className="col-span-2 text-slate-800">{siswa.agama}</span>
                  </div>
                  <div className="grid grid-cols-3 py-1 border-b border-slate-100">
                    <span className="text-slate-600">6. Kewarganegaraan</span>
                    <span className="col-span-2 text-slate-800">{siswa.kewarganegaraan}</span>
                  </div>
                  <div className="grid grid-cols-3 py-1 border-b border-slate-100">
                    <span className="text-slate-600">7. NIK / No. KTP Anak</span>
                    <span className="col-span-2 font-mono text-slate-900">{siswa.nik || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 py-1 border-b border-slate-100">
                    <span className="text-slate-600">8. No. Kartu Keluarga (KK)</span>
                    <span className="col-span-2 font-mono text-slate-900">{siswa.noKk || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 py-1 border-b border-slate-100">
                    <span className="text-slate-600">9. Anak Ke- / Dari</span>
                    <span className="col-span-2 text-slate-800">
                      Anak ke-{siswa.anakKe} dari {siswa.jumlahSaudaraKandung + 1} bersaudara
                    </span>
                  </div>
                  <div className="grid grid-cols-3 py-1 border-b border-slate-100">
                    <span className="text-slate-600">10. Status dalam Keluarga</span>
                    <span className="col-span-2 text-slate-800">{siswa.statusDalamKeluarga}</span>
                  </div>
                  <div className="grid grid-cols-3 py-1">
                    <span className="text-slate-600">11. Bahasa Sehari-hari</span>
                    <span className="col-span-2 text-slate-800">{siswa.bahasaSehariHari}</span>
                  </div>
                </div>

                {/* Pas Foto Box */}
                <div className="flex flex-col items-center justify-center p-2 border-l border-slate-200">
                  <div className="w-28 h-36 border-2 border-dashed border-slate-400 rounded bg-slate-50 flex flex-col items-center justify-center text-center p-2 relative overflow-hidden">
                    {siswa.fotoUrl ? (
                      <img
                        src={siswa.fotoUrl}
                        alt={siswa.namaLengkap}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <>
                        <span className="text-[10px] font-bold text-slate-400">PAS FOTO SISWA</span>
                        <span className="text-[9px] text-slate-400 mt-1">3 x 4 cm</span>
                        <div className="absolute inset-x-0 bottom-2 text-center text-[7px] text-slate-400 border-t border-slate-200 pt-1">
                          Cap Sekolah
                        </div>
                      </>
                    )}
                  </div>
                  <span className="text-[9px] text-slate-400 mt-2">Ditempel pada buku fisik</span>
                </div>
              </div>
            </div>

            {/* Section B & C: Kondisi Jasmani & Tempat Tinggal */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Section B */}
              <div className="border border-slate-300 rounded overflow-hidden">
                <div className="bg-slate-800 text-white font-bold px-3 py-1 text-[11px] uppercase">
                  B. KONDISI JASMANI & KESEHATAN
                </div>
                <div className="p-3 space-y-1.5 text-[11px]">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">1. Golongan Darah</span>
                    <span className="font-bold text-slate-900">{siswa.golonganDarah}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">2. Tinggi / Berat Badan</span>
                    <span className="font-semibold text-slate-900">{siswa.tinggiBadan} cm / {siswa.beratBadan} kg</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">3. Riwayat Penyakit</span>
                    <span className="text-slate-800 text-right">{siswa.riwayatPenyakit || 'Tidak ada'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">4. Kelainan Jasmani</span>
                    <span className="text-slate-800">{siswa.kelainanFisik || 'Tidak ada'}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-600">5. Kebutuhan Khusus</span>
                    <span className="text-slate-800">{siswa.kebutuhanKhusus || 'Tidak ada'}</span>
                  </div>
                </div>
              </div>

              {/* Section C */}
              <div className="border border-slate-300 rounded overflow-hidden">
                <div className="bg-slate-800 text-white font-bold px-3 py-1 text-[11px] uppercase">
                  C. KETERANGAN TEMPAT TINGGAL
                </div>
                <div className="p-3 space-y-1.5 text-[11px]">
                  <div className="py-1 border-b border-slate-100">
                    <span className="text-slate-600 block">1. Alamat Lengkap:</span>
                    <span className="font-medium text-slate-900">
                      {siswa.alamat} {siswa.rt && `RT ${siswa.rt}`} {siswa.rw && `RW ${siswa.rw}`}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 py-1 border-b border-slate-100">
                    <div>
                      <span className="text-slate-600 block">Desa/Kelurahan:</span>
                      <span className="text-slate-900 font-medium">{siswa.kelurahan || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-600 block">Kecamatan:</span>
                      <span className="text-slate-900 font-medium">{siswa.kecamatan || '-'}</span>
                    </div>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">2. Tinggal Bersama</span>
                    <span className="font-medium text-slate-900">{siswa.tinggalDengan}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-600">3. Jarak & Transportasi</span>
                    <span className="font-medium text-slate-900">{siswa.jarakKeSekolahKm} km ({siswa.transportasiKeSekolah})</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Section D: Orang Tua & Wali */}
            <div className="border border-slate-300 rounded overflow-hidden">
              <div className="bg-slate-800 text-white font-bold px-3 py-1.5 text-[11px] uppercase">
                D. KETERANGAN ORANG TUA KANDUNG & WALI
              </div>
              <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px]">
                {/* Data Ayah */}
                <div className="space-y-1.5 border-r border-slate-200 pr-2">
                  <span className="font-bold text-blue-900 text-xs block border-b border-blue-100 pb-1">
                    1. AYAH KANDUNG
                  </span>
                  <div className="grid grid-cols-3 py-0.5">
                    <span className="text-slate-600">Nama Lengkap</span>
                    <span className="col-span-2 font-semibold text-slate-900">{siswa.ayah?.nama || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 py-0.5">
                    <span className="text-slate-600">NIK Ayah</span>
                    <span className="col-span-2 font-mono text-slate-800">{siswa.ayah?.nik || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 py-0.5">
                    <span className="text-slate-600">Tahun Lahir</span>
                    <span className="col-span-2 text-slate-800">{siswa.ayah?.tahunLahir || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 py-0.5">
                    <span className="text-slate-600">Pendidikan</span>
                    <span className="col-span-2 text-slate-800">{siswa.ayah?.pendidikan || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 py-0.5">
                    <span className="text-slate-600">Pekerjaan</span>
                    <span className="col-span-2 text-slate-800">{siswa.ayah?.pekerjaan || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 py-0.5">
                    <span className="text-slate-600">Penghasilan</span>
                    <span className="col-span-2 text-slate-800">{siswa.ayah?.penghasilan || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 py-0.5">
                    <span className="text-slate-600">No. Telepon/WA</span>
                    <span className="col-span-2 font-mono text-slate-800">{siswa.ayah?.noTelepon || '-'}</span>
                  </div>
                </div>

                {/* Data Ibu */}
                <div className="space-y-1.5 pl-2">
                  <span className="font-bold text-rose-900 text-xs block border-b border-rose-100 pb-1">
                    2. IBU KANDUNG
                  </span>
                  <div className="grid grid-cols-3 py-0.5">
                    <span className="text-slate-600">Nama Lengkap</span>
                    <span className="col-span-2 font-semibold text-slate-900">{siswa.ibu?.nama || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 py-0.5">
                    <span className="text-slate-600">NIK Ibu</span>
                    <span className="col-span-2 font-mono text-slate-800">{siswa.ibu?.nik || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 py-0.5">
                    <span className="text-slate-600">Tahun Lahir</span>
                    <span className="col-span-2 text-slate-800">{siswa.ibu?.tahunLahir || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 py-0.5">
                    <span className="text-slate-600">Pendidikan</span>
                    <span className="col-span-2 text-slate-800">{siswa.ibu?.pendidikan || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 py-0.5">
                    <span className="text-slate-600">Pekerjaan</span>
                    <span className="col-span-2 text-slate-800">{siswa.ibu?.pekerjaan || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 py-0.5">
                    <span className="text-slate-600">Penghasilan</span>
                    <span className="col-span-2 text-slate-800">{siswa.ibu?.penghasilan || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 py-0.5">
                    <span className="text-slate-600">No. Telepon/WA</span>
                    <span className="col-span-2 font-mono text-slate-800">{siswa.ibu?.noTelepon || '-'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Section E & F: Pendidikan Sebelumnya & Penerimaan */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-slate-300 rounded overflow-hidden">
                <div className="bg-slate-800 text-white font-bold px-3 py-1 text-[11px] uppercase">
                  E. PENDIDIKAN SEBELUMNYA ({asalTitle})
                </div>
                <div className="p-3 space-y-1 text-[11px]">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">Sekolah Asal</span>
                    <span className="font-semibold text-slate-900">{siswa.asalSdMi || '-'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">NPSN Sekolah Asal</span>
                    <span className="font-mono text-slate-800">{siswa.npsnSdMi || '-'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">{ijazahLabel}</span>
                    <span className="font-mono text-slate-800">{siswa.noIjazahSd || '-'}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-600">Tahun Lulus</span>
                    <span className="text-slate-800">{siswa.tahunLulusSd} ({siswa.lamaBelajarSd} Tahun Belajar)</span>
                  </div>
                </div>
              </div>

              <div className="border border-slate-300 rounded overflow-hidden">
                <div className="bg-slate-800 text-white font-bold px-3 py-1 text-[11px] uppercase">
                  F. PENERIMAAN DI {jenjang} INI
                </div>
                <div className="p-3 space-y-1 text-[11px]">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">Tanggal Diterima</span>
                    <span className="font-semibold text-slate-900">{formatDateIndo(siswa.tanggalDiterima)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">Di Tingkat / Rombel</span>
                    <span className="font-bold text-blue-900">Kelas {siswa.diterimaDiTingkat} (Rombel {siswa.diterimaDiRombel})</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">Jalur Penerimaan (PPDB)</span>
                    <span className="font-medium text-slate-900">{siswa.jalurMasuk}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-600">Rombel Saat Ini</span>
                    <span className="font-bold text-slate-900">{siswa.rombelSaatIni} ({faseSiswa})</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Section G: Kurikulum Merdeka P5 & Ekstrakurikuler */}
            <div className="border border-slate-300 rounded overflow-hidden page-break-inside-avoid">
              <div className="bg-slate-800 text-white font-bold px-3 py-1.5 text-[11px] uppercase tracking-wide flex items-center justify-between">
                <span>G. PROJEK PENGUATAN PROFIL PELAJAR PANCASILA (P5) & EKSTRAKURIKULER</span>
                <span className="text-[10px] text-amber-300 font-normal">Karakter Profil Pelajar Pancasila</span>
              </div>
              <div className="p-3 space-y-3 text-[11px]">
                {siswa.p5Projects && siswa.p5Projects.length > 0 ? (
                  <div className="space-y-2">
                    {siswa.p5Projects.map((p, idx) => (
                      <div key={p.id || idx} className="bg-slate-50 p-2.5 rounded border border-slate-200">
                        <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                          <span className="font-bold text-slate-900 text-xs">
                            Projek {idx + 1}: {p.judulProjek}
                          </span>
                          <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-medium">
                            Tema: {p.tema} ({p.tahunAjaran} Sem. {p.semester})
                          </span>
                        </div>
                        <p className="text-slate-600 text-[10px] italic mb-2">
                          Catatan Perkembangan: {p.catatanProses || 'Menunjukkan proses pembelajaran projek yang kolaboratif.'}
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[10px]">
                          <div className="border border-slate-200 bg-white p-1 rounded">
                            <span className="text-slate-500 block">Beriman & Bertakwa:</span>
                            <span className="font-semibold text-slate-800">{p.dimensi.berimanBertakwa}</span>
                          </div>
                          <div className="border border-slate-200 bg-white p-1 rounded">
                            <span className="text-slate-500 block">Berkebinekaan Global:</span>
                            <span className="font-semibold text-slate-800">{p.dimensi.berkebinekaanGlobal}</span>
                          </div>
                          <div className="border border-slate-200 bg-white p-1 rounded">
                            <span className="text-slate-500 block">Bergotong Royong:</span>
                            <span className="font-semibold text-slate-800">{p.dimensi.bergotongRoyong}</span>
                          </div>
                          <div className="border border-slate-200 bg-white p-1 rounded">
                            <span className="text-slate-500 block">Mandiri:</span>
                            <span className="font-semibold text-slate-800">{p.dimensi.mandiri}</span>
                          </div>
                          <div className="border border-slate-200 bg-white p-1 rounded">
                            <span className="text-slate-500 block">Bernalar Kritis:</span>
                            <span className="font-semibold text-slate-800">{p.dimensi.bernalarKritis}</span>
                          </div>
                          <div className="border border-slate-200 bg-white p-1 rounded">
                            <span className="text-slate-500 block">Kreatif:</span>
                            <span className="font-semibold text-slate-800">{p.dimensi.kreatif}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 italic text-[10px]">Belum ada catatan projek P5.</p>
                )}

                {/* Ekstrakurikuler & Prestasi */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                  <div>
                    <span className="font-bold text-slate-800 text-[11px] block mb-1">Ekstrakurikuler yang Diikuti:</span>
                    {siswa.ekstrakurikuler && siswa.ekstrakurikuler.length > 0 ? (
                      <ul className="list-disc list-inside text-[10px] text-slate-700 space-y-0.5">
                        {siswa.ekstrakurikuler.map((e, idx) => (
                          <li key={idx}>
                            <strong>{e.nama}</strong> - Predikat: {e.predikat} ({e.keterangan})
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-[10px] text-slate-500 italic">Pramuka Wajib</span>
                    )}
                  </div>
                  <div>
                    <span className="font-bold text-slate-800 text-[11px] block mb-1">Prestasi yang Diraih:</span>
                    {siswa.prestasi && siswa.prestasi.length > 0 ? (
                      <ul className="list-disc list-inside text-[10px] text-slate-700 space-y-0.5">
                        {siswa.prestasi.map((pr, idx) => (
                          <li key={idx}>
                            <strong>{pr.peringkat}</strong> {pr.namaLomba} (Tingkat {pr.tingkat}, {pr.tahun})
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-[10px] text-slate-500 italic">Belum ada catatan prestasi formal</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* BAGIAN E: REKAPITULASI CAPAIAN NILAI RAPORT & RIWAYAT TAHUN AJARAN */}
            <div className="space-y-3 page-break-inside-avoid">
              <div className="border-b border-slate-400 pb-1 flex items-center justify-between">
                <h3 className="font-extrabold text-slate-900 text-xs uppercase tracking-wide">
                  E. REKAPITULASI NILAI RAPOR & RIWAYAT TAHUN AJARAN
                </h3>
                <span className="text-[10px] text-slate-500 italic">
                  Kurikulum Merdeka {faseLabel}
                </span>
              </div>

              {/* Tabel Riwayat Kenaikan Tingkat */}
              <div>
                <span className="font-bold text-slate-800 text-[11px] block mb-1">
                  1. Riwayat Kenaikan Tingkat & Status Akhir Tahun:
                </span>
                {riwayatTampil && riwayatTampil.length > 0 ? (
                  <table className="w-full border-collapse border border-slate-400 text-[10px] mb-2">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="border border-slate-300 px-2 py-1 text-left">Tahun Ajaran</th>
                        <th className="border border-slate-300 px-2 py-1 text-center">Tingkat</th>
                        <th className="border border-slate-300 px-2 py-1 text-center">Rombel</th>
                        <th className="border border-slate-300 px-2 py-1 text-left">Wali Kelas</th>
                        <th className="border border-slate-300 px-2 py-1 text-center font-bold">Status Kenaikan</th>
                        <th className="border border-slate-300 px-2 py-1 text-left">Catatan Perkembangan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {riwayatTampil.map((rw, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="border border-slate-300 px-2 py-1 font-mono font-medium">{rw.tahunAjaran}</td>
                          <td className="border border-slate-300 px-2 py-1 text-center">Kelas {rw.tingkat}</td>
                          <td className="border border-slate-300 px-2 py-1 text-center font-bold text-blue-900">{rw.rombel}</td>
                          <td className="border border-slate-300 px-2 py-1">{rw.waliKelas || '-'}</td>
                          <td className="border border-slate-300 px-2 py-1 text-center font-bold">
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-100 text-emerald-800">
                              {rw.statusKenaikan}
                            </span>
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-slate-600">{rw.catatan || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-[10px] text-slate-500 italic mb-2">
                    Belum ada riwayat kenaikan tahun ajaran sebelumnya.
                  </p>
                )}
              </div>

              {/* Tabel Ringkasan Nilai Raport Multi-Semester */}
              <div>
                <span className="font-bold text-slate-800 text-[11px] block mb-1">
                  2. Ringkasan Capaian Nilai Rapor per Semester:
                </span>
                {raportList.length > 0 ? (
                  <table className="w-full border-collapse border border-slate-400 text-[10px]">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="border border-slate-300 px-2 py-1 text-left">Semester / TA</th>
                        <th className="border border-slate-300 px-2 py-1 text-center">Kelas</th>
                        <th className="border border-slate-300 px-2 py-1 text-center">Rata-rata Nilai</th>
                        <th className="border border-slate-300 px-2 py-1 text-center">Nilai Tertinggi</th>
                        <th className="border border-slate-300 px-2 py-1 text-center">Nilai Terendah</th>
                        <th className="border border-slate-300 px-2 py-1 text-center">Absensi (S/I/A)</th>
                        <th className="border border-slate-300 px-2 py-1 text-left">Fase</th>
                      </tr>
                    </thead>
                    <tbody>
                      {raportList.map((rp, idx) => {
                        const nilaiList = getNilaiList(rp);
                        // F7: rata-rata memakai helper tunggal (1 desimal) agar sama
                        // dengan angka tersimpan; F14: nilai null ("belum dinilai") diabaikan.
                        const avg = hitungRataRataNilai(nilaiList);
                        const scores = nilaiList.map(m => Number(m.nilaiAkhir) || 0);
                        const max = scores.length > 0 ? Math.max(...scores) : 0;
                        const min = scores.length > 0 ? Math.min(...scores) : 0;
                        return (
                          <tr key={rp.id || idx} className="hover:bg-slate-50">
                            <td className="border border-slate-300 px-2 py-1 font-semibold">
                              Semester {rp.semester} ({rp.tahunAjaran})
                            </td>
                            <td className="border border-slate-300 px-2 py-1 text-center font-bold">
                              {rp.tingkat} ({rp.rombel})
                            </td>
                            <td className="border border-slate-300 px-2 py-1 text-center font-bold text-blue-900 font-mono">
                              {avg}
                            </td>
                            <td className="border border-slate-300 px-2 py-1 text-center text-emerald-700 font-mono">
                              {max}
                            </td>
                            <td className="border border-slate-300 px-2 py-1 text-center text-amber-700 font-mono">
                              {min}
                            </td>
                            <td className="border border-slate-300 px-2 py-1 text-center font-mono">
                              {/* F13: raport legacy bisa tanpa objek kehadiran — guard + fallback '-'. */}
                              {rp.kehadiran?.sakit ?? '-'}/{rp.kehadiran?.izin ?? '-'}/{rp.kehadiran?.alpa ?? '-'}
                            </td>
                            <td className="border border-slate-300 px-2 py-1 text-slate-600 font-medium">
                              Fase {rp.fase}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-[10px] text-slate-500 italic">
                    Belum ada nilai raport tersimpan. Silakan masukkan nilai melalui menu Nilai Raport.
                  </p>
                )}
              </div>
            </div>

            {/* Kolom Pengesahan & Tanda Tangan */}
            <div className="pt-4 border-t border-slate-300 grid grid-cols-2 gap-8 text-center text-[11px] break-inside-avoid">
              <div>
                <p className="text-slate-600">Mengetahui,</p>
                <p className="font-bold text-slate-900">Kepala {sekolah.nama || jenjang}</p>
                <div className="h-16 flex items-center justify-center text-slate-300 italic text-[10px]">
                  (Tanda Tangan & Cap Sekolah)
                </div>
                <p className="font-bold text-slate-900 underline">{sekolah.kepalaSekolah}</p>
                <p className="text-slate-600 font-mono text-[10px]">NIP. {sekolah.nipKepalaSekolah}</p>
              </div>

              <div>
                <p className="text-slate-600">{sekolah.kabupatenKota}, {formatDateIndo(new Date().toISOString())}</p>
                <p className="font-bold text-slate-900">Petugas Pengelola Buku Induk</p>
                <div className="h-16 flex items-center justify-center text-slate-300 italic text-[10px]">
                  (Tanda Tangan)
                </div>
                <p className="font-bold text-slate-900 underline">{sekolah.petugasBukuInduk}</p>
                <p className="text-slate-600 font-mono text-[10px]">NIP. {sekolah.nipPetugas}</p>
              </div>
            </div>
          </div>
        ) : printMode === 'raport' ? (
          /* Transkrip Nilai Raport Kurikulum Merdeka (Per-Semester / Multi-Tahun) */
          <div className="space-y-6">
            {/* Kop Resmi Sekolah (diatur di Profil Sekolah → Kop Surat) */}
            <KopSuratView sekolah={sekolah} />

            {/* Judul Transkrip Nilai Raport */}
            <div className="text-center my-3">
              <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-widest text-slate-900 underline underline-offset-4">
                TRANSKRIP LAPORAN HASIL BELAJAR (RAPOR)
              </h2>
              <p className="text-[11px] font-semibold text-slate-600 mt-1 uppercase">
                {jenjang === 'SD' ? 'SEKOLAH DASAR (SD)' : 'SEKOLAH MENENGAH PERTAMA (SMP)'} - {faseLabel.toUpperCase()} KURIKULUM MERDEKA
              </p>
            </div>

            {/* Identitas Siswa Raport */}
            <div className="bg-slate-50 border border-slate-300 p-3 rounded text-[11px] grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <span className="text-slate-500 block">Nama Peserta Didik:</span>
                <strong className="text-slate-900 text-xs">{siswa.namaLengkap}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">NISN / NIPD:</span>
                <strong className="font-mono text-slate-900">{siswa.nisn || '-'} / {siswa.nipd || '-'}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Rombel Saat Ini:</span>
                <strong className="text-blue-900 font-bold">{siswa.rombelSaatIni}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Fase Kurikulum:</span>
                <strong className="text-slate-900">{faseLabel}</strong>
              </div>
            </div>

            {/* Semester Nilai Render Loop */}
            {(raportList.length === 0) ? (
              <div className="p-8 text-center text-slate-400 italic bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                Belum ada catatan nilai raport untuk siswa ini. Tambahkan nilai melalui menu 'Nilai Raport'.
              </div>
            ) : (
              raportList
                .filter((r) => selectedSemesterId === 'all' || r.id === selectedSemesterId)
                .map((sem, sIdx) => {
                  const nilaiList = getNilaiList(sem);
                  // F7: rata-rata memakai helper tunggal (1 desimal) agar sama
                  // dengan angka tersimpan; F14: nilai null ("belum dinilai") diabaikan.
                  const avg = hitungRataRataNilai(nilaiList);
                  return (
                    <div key={sem.id || sIdx} className="space-y-3 pt-4 border-t border-slate-200 page-break-inside-avoid">
                      {/* Sub-Header Semester */}
                      <div className="flex flex-wrap items-center justify-between bg-blue-900 text-white px-3 py-1.5 rounded">
                        <span className="font-bold text-xs uppercase tracking-wide">
                          Kelas {sem.tingkat} ({sem.rombel}) • Semester {sem.semester} ({sem.tahunAjaran})
                        </span>
                        <span className="text-[11px] text-blue-200 font-mono">
                          Wali Kelas: {sem.waliKelas || '-'} | Rata-rata: <strong>{avg}</strong>
                        </span>
                      </div>

                      {/* Tabel Capaian Kompetensi Mapel */}
                      <table className="w-full border-collapse border border-slate-400 text-[10px]">
                        <thead className="bg-slate-100 text-slate-900">
                          <tr>
                            <th className="border border-slate-400 px-2 py-1 text-center w-8">No</th>
                            <th className="border border-slate-400 px-2 py-1 text-left w-48">Mata Pelajaran</th>
                            <th className="border border-slate-400 px-2 py-1 text-center w-16">Nilai Akhir</th>
                            <th className="border border-slate-400 px-2 py-1 text-left">Capaian Kompetensi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {nilaiList.map((m, mIdx) => (
                            <tr key={m.id || mIdx} className="hover:bg-slate-50">
                              <td className="border border-slate-300 px-2 py-1 text-center">{mIdx + 1}</td>
                              <td className="border border-slate-300 px-2 py-1 font-semibold">{m.mataPelajaran || m.namaMapel}</td>
                              <td className="border border-slate-300 px-2 py-1 text-center font-bold text-blue-900 font-mono text-[11px]">
                                {m.nilaiAkhir}
                              </td>
                              <td className="border border-slate-300 px-2 py-1 text-[9.5px] leading-snug text-slate-700">
                                <div><strong className="text-emerald-800">Menunjukkan penguasaan:</strong> {m.capaianTertinggi || '-'}</div>
                                {m.capaianPerluPeningkatan && (
                                  <div className="mt-0.5 text-slate-500"><strong className="text-amber-800">Perlu ditingkatkan:</strong> {m.capaianPerluPeningkatan}</div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* Kehadiran & Catatan */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10px]">
                        <div className="border border-slate-300 p-2 rounded bg-slate-50">
                          <span className="font-bold text-slate-800 block mb-1">Ketidakhadiran:</span>
                          <div className="grid grid-cols-3 text-center gap-1 font-mono">
                            {/* F13: raport legacy bisa tanpa objek kehadiran — guard + fallback '-'. */}
                            <div className="bg-white p-1 rounded border">Sakit: <strong>{sem.kehadiran?.sakit ?? '-'}</strong> hari</div>
                            <div className="bg-white p-1 rounded border">Izin: <strong>{sem.kehadiran?.izin ?? '-'}</strong> hari</div>
                            <div className="bg-white p-1 rounded border">Tanpa Ket: <strong>{sem.kehadiran?.alpa ?? '-'}</strong> hari</div>
                          </div>
                        </div>

                        <div className="border border-slate-300 p-2 rounded bg-slate-50">
                          <span className="font-bold text-slate-800 block mb-1">Catatan Wali Kelas:</span>
                          <p className="italic text-slate-700">{sem.catatanWaliKelas || 'Tingkatkan terus prestasi belajarmu dan pertahankan karakter Profil Pelajar Pancasila.'}</p>
                          {sem.keteranganKenaikan && (
                            <p className="mt-1 font-bold text-blue-950">
                              Keputusan: <span className="underline">{sem.keteranganKenaikan}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Tanda Tangan Semester */}
                      <div className="pt-2 grid grid-cols-3 text-center text-[10px] text-slate-700 break-inside-avoid">
                        <div>
                          <p>Orang Tua / Wali,</p>
                          <div className="h-12" />
                          <p className="font-bold text-slate-900">(..........................................)</p>
                        </div>
                        <div>
                          <p>Mengetahui, Kepala Sekolah</p>
                          <div className="h-12" />
                          <p className="font-bold text-slate-900 underline">{sekolah.kepalaSekolah}</p>
                          <p className="font-mono text-[9px]">NIP. {sekolah.nipKepalaSekolah}</p>
                        </div>
                        <div>
                          <p>{sekolah.kabupatenKota}, {formatDateIndo(sem.tanggalRaport || new Date().toISOString())}</p>
                          <p>Wali Kelas,</p>
                          <div className="h-12" />
                          <p className="font-bold text-slate-900 underline">{sem.waliKelas || 'Wali Kelas'}</p>
                          <p className="font-mono text-[9px]">NIP. {sem.nipWaliKelas || '-'}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        ) : (
          /* Kartu Tanda Pelajar (Depan & Belakang, 3 template) */
          <div className="max-w-md mx-auto space-y-6">
            <div className="text-center mb-2 print:hidden space-y-2">
              <h3 className="font-bold text-base text-slate-900">
                Pratinjau Kartu Pelajar {jenjang}
              </h3>
              <p className="text-xs text-slate-500">Standar ID Card Pelajar Kurikulum Merdeka</p>
              <div className="flex items-center justify-center gap-2">
                <label className="text-[11px] font-bold text-slate-600" htmlFor="template-kartu">Template:</label>
                <select
                  id="template-kartu"
                  value={templateKartu}
                  onChange={(e) => setTemplateKartu(e.target.value as TemplateKartu)}
                  className="ui-input !w-auto !py-1.5"
                >
                  {(Object.keys(TEMPLATE_KARTU) as TemplateKartu[]).map((t) => (
                    <option key={t} value={t}>{TEMPLATE_KARTU[t].judul} — {TEMPLATE_KARTU[t].desc}</option>
                  ))}
                </select>
              </div>
            </div>

            <KartuPelajar
              siswa={siswa}
              sekolah={sekolah}
              jenjang={jenjang}
              faseLabel={faseLabel}
              template={templateKartu}
            />
          </div>
        )}
      </div>
    </div>
  );
};
