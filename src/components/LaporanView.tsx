import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { AppUser, SekolahProfile, Siswa, StatusSiswa } from '../types';
import {
  bangunLaporan,
  bangunStatistik,
  barisMetaEkspor,
  cekKonsistensiStatistik,
  daftarRombelLaporan,
  daftarTahunLaporan,
  FilterLaporan,
  JENIS_LAPORAN,
  JenisLaporan,
  judulLaporan,
  keCsv,
  metaLaporan,
  namaFileLaporan,
  ringkasanEkspor,
  saringLaporan,
  tahunFilter,
} from '../utils/laporan';
import { unduhExcel } from '../utils/excel';
import { toast } from '../utils/notify';
import { labelSesi } from '../utils/sesi';
import { KopSuratView } from './KopSuratView';
import { MetaLaporanView } from './MetaLaporanView';
import { PageControl } from './PageControl';

interface LaporanViewProps {
  /** Siswa yang SUDAH tersaring hak akses pemakai (visibleSiswa dari App). */
  siswa: Siswa[];
  sekolah: SekolahProfile;
  sessionTahun?: string | null;
  currentUser?: AppUser | null;
  /** Dipanggil setelah ekspor berhasil — App memakainya untuk audit log. */
  onEkspor?: (info: { jenis: JenisLaporan; format: string; jumlahBaris: number; parameter: string }) => void;
}

const STATUS_OPSI: Array<'semua' | StatusSiswa> = ['semua', 'Aktif', 'Lulus', 'Mutasi Keluar', 'Mengundurkan Diri', 'Meninggal Dunia'];

export const LaporanView: React.FC<LaporanViewProps> = ({ siswa, sekolah, sessionTahun, currentUser, onEkspor }) => {
  const tahunAktifDatabase = sekolah.tahunAjaran || '';
  const [filter, setFilter] = useState<FilterLaporan>(() => ({
    jenis: 'statistik',
    tahunAjaran: (sessionTahun || tahunAktifDatabase || '').trim() || 'semua',
    rombel: 'semua',
    status: 'Aktif',
  }));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  // Waktu pembuatan laporan: diperbarui tiap filter/jenis berubah, dipakai
  // bersama oleh pratinjau, cetak, Excel, dan CSV (satu cap waktu).
  const [dibuatPada, setDibuatPada] = useState(() => new Date());

  const tahunOpsi = useMemo(() => daftarTahunLaporan(siswa, tahunAktifDatabase), [siswa, tahunAktifDatabase]);
  const rombelOpsi = useMemo(
    () => daftarRombelLaporan(siswa, tahunFilter(filter), tahunAktifDatabase),
    [siswa, filter, tahunAktifDatabase]
  );

  // Reset rombel bila tidak tersedia pada tahun yang dipilih; segarkan
  // cap waktu + halaman tiap filter/jenis berubah.
  useEffect(() => {
    setFilter((f) => (f.rombel !== 'semua' && !rombelOpsi.includes(f.rombel) ? { ...f, rombel: 'semua' } : f));
    setPage(1);
    setDibuatPada(new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.jenis, filter.tahunAjaran, filter.status]);

  const tersaring = useMemo(
    () => saringLaporan(siswa, filter, { tahunAktif: tahunAktifDatabase, rombelAkses: currentUser?.rombelAkses }),
    [siswa, filter, tahunAktifDatabase, currentUser?.rombelAkses]
  );
  const ctx = useMemo(
    () => ({ tahun: tahunFilter(filter), tahunAktif: tahunAktifDatabase, semuaSiswa: siswa }),
    [filter, tahunAktifDatabase, siswa]
  );
  const stat = useMemo(
    () => (filter.jenis === 'statistik' ? bangunStatistik(tersaring, ctx) : null),
    [filter.jenis, tersaring, ctx]
  );
  const laporan = useMemo(
    () => (filter.jenis === 'statistik' ? null : bangunLaporan(filter.jenis, tersaring, ctx)),
    [filter.jenis, tersaring, ctx]
  );
  const jumlahBaris = filter.jenis === 'statistik' ? stat?.total || 0 : laporan?.baris.length || 0;
  const meta = useMemo(
    () =>
      metaLaporan({
        judul: `LAPORAN ${judulLaporan(filter.jenis).toUpperCase()}`,
        filter,
        jumlahBaris,
        sekolah,
        dibuatOleh: currentUser?.username,
        dibuatPada,
      }),
    [filter, jumlahBaris, sekolah, currentUser?.username, dibuatPada]
  );
  const masalahStat = stat ? cekKonsistensiStatistik(stat) : [];

  const totalPages = Math.max(1, Math.ceil(jumlahBaris / pageSize));
  const halaman = Math.min(page, totalPages);
  const barisHalaman = laporan ? laporan.baris.slice((halaman - 1) * pageSize, halaman * pageSize) : [];

  const set = <K extends keyof FilterLaporan>(key: K, value: FilterLaporan[K]) =>
    setFilter((f) => ({ ...f, [key]: value }));

  const catatEkspor = (format: string) => {
    onEkspor?.({ jenis: filter.jenis, format, jumlahBaris, parameter: meta.parameter });
  };

  const handleCetak = () => {
    if (jumlahBaris === 0) {
      toast('Tidak ada data untuk dicetak pada filter ini.', 'warning');
      return;
    }
    window.print();
  };

  const handleExcel = async () => {
    if (jumlahBaris === 0) {
      toast('Tidak ada data untuk diekspor pada filter ini.', 'warning');
      return;
    }
    try {
      const metaBaris = barisMetaEkspor(meta);
      if (stat) {
        await unduhExcel(namaFileLaporan(filter.jenis, filter, dibuatPada), [
          { nama: 'Rombel', baris: [...metaBaris, ['Rombel', 'Laki-laki (L)', 'Perempuan (P)', 'JK Belum Diisi (X)', 'Jumlah Total'], ...stat.perRombel.map((r) => [r.rombel, r.L, r.P, r.X, r.total]), ['TOTAL', stat.perRombel.reduce((a, c) => a + c.L, 0), stat.perRombel.reduce((a, c) => a + c.P, 0), stat.perRombel.reduce((a, c) => a + c.X, 0), stat.total]] },
          { nama: 'Agama', baris: [...metaBaris, ['Agama', 'Jumlah', 'Persentase (%)'], ...stat.perAgama.map((r) => [r.label, r.jumlah, r.persen])] },
          { nama: 'Jalur PPDB', baris: [...metaBaris, ['Jalur Penerimaan (PPDB)', 'Jumlah', 'Persentase (%)'], ...stat.perJalur.map((r) => [r.label, r.jumlah, r.persen])] },
          { nama: 'Status', baris: [...metaBaris, ['Status Siswa', 'Jumlah', 'Persentase (%)'], ...stat.perStatus.map((r) => [r.label, r.jumlah, r.persen])] },
        ]);
      } else if (laporan) {
        await unduhExcel(namaFileLaporan(filter.jenis, filter, dibuatPada), [
          { nama: 'Laporan', baris: [...metaBaris, laporan.header, ...laporan.baris] },
        ]);
      }
      toast(`Laporan ${judulLaporan(filter.jenis)} (${jumlahBaris} baris) diekspor ke Excel.`, 'success');
      catatEkspor('Excel (.xlsx)');
    } catch (err: unknown) {
      toast(`Gagal mengekspor Excel: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const handleCsv = () => {
    if (jumlahBaris === 0) {
      toast('Tidak ada data untuk diekspor pada filter ini.', 'warning');
      return;
    }
    try {
      const metaBaris = barisMetaEkspor(meta);
      let isi: (string | number)[][];
      if (stat) {
        isi = [
          ...metaBaris,
          ['Rombel', 'Laki-laki (L)', 'Perempuan (P)', 'JK Belum Diisi (X)', 'Jumlah Total'],
          ...stat.perRombel.map((r) => [r.rombel, r.L, r.P, r.X, r.total]),
          ['TOTAL', stat.perRombel.reduce((a, c) => a + c.L, 0), stat.perRombel.reduce((a, c) => a + c.P, 0), stat.perRombel.reduce((a, c) => a + c.X, 0), stat.total],
        ];
      } else if (laporan) {
        isi = [...metaBaris, laporan.header, ...laporan.baris];
      } else {
        return;
      }
      const blob = new Blob([keCsv(isi)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${namaFileLaporan(filter.jenis, filter, dibuatPada)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast(`Laporan ${judulLaporan(filter.jenis)} (${jumlahBaris} baris) diekspor ke CSV.`, 'success');
      catatEkspor('CSV');
    } catch (err: unknown) {
      toast(`Gagal mengekspor CSV: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const renderTabelDaftar = (baris: (string | number)[][], header: string[]) => (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-[10px] border-b border-slate-200">
          <tr>
            {header.map((h) => (
              <th key={h} className="p-2.5">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {baris.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50">
              {r.map((c, j) => (
                <td key={j} className="p-2.5 text-slate-700 break-words">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header + filter (tidak ikut tercetak) */}
      <div className="ui-card p-4 space-y-4 print:hidden">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-700" />
            Pusat Laporan
          </h2>
          <p className="text-xs text-slate-500">
            Laporan administratif siap cetak: pratinjau dulu, lalu cetak atau ekspor. Isi laporan selalu sama
            dengan pratinjau untuk filter yang sama. PDF dibuat lewat dialog cetak browser (Cetak → Save as PDF) —
            aplikasi tidak memiliki generator PDF native.
          </p>
          <p className="text-[11px]">
            <span className="font-mono font-extrabold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
              {labelSesi(sessionTahun, tahunAktifDatabase)}
            </span>
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-600">Jenis laporan</span>
            <select value={filter.jenis} onChange={(e) => set('jenis', e.target.value as JenisLaporan)} className="ui-select mt-1" aria-label="Jenis laporan">
              {JENIS_LAPORAN.map((j) => (
                <option key={j.jenis} value={j.jenis} title={j.deskripsi}>{j.judul}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-600">Tahun ajaran (periode)</span>
            <select value={filter.tahunAjaran} onChange={(e) => set('tahunAjaran', e.target.value)} className="ui-select mt-1" aria-label="Tahun ajaran">
              <option value="semua">Semua tahun ajaran</option>
              {tahunOpsi.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-600">Kelas / rombel</span>
            <select value={filter.rombel} onChange={(e) => set('rombel', e.target.value)} className="ui-select mt-1" aria-label="Rombel">
              <option value="semua">Semua rombel</option>
              {rombelOpsi.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-600">Status siswa</span>
            <select value={filter.status} onChange={(e) => set('status', e.target.value as FilterLaporan['status'])} className="ui-select mt-1" aria-label="Status siswa">
              {STATUS_OPSI.map((s) => (
                <option key={s} value={s}>{s === 'semua' ? 'Semua status' : s}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-600 mr-auto">
            {ringkasanEkspor(meta, 'Cetak / PDF')}
            {filter.jenis === 'statistik' && filter.status === 'semua' && (
              <span className="block text-amber-700">Catatan: status “Semua status” berarti siswa non-Aktif ikut terhitung di Statistik (berbeda dari Rekapitulasi yang kohortnya selalu Aktif).</span>
            )}
            {currentUser?.rombelAkses && currentUser.rombelAkses.length > 0 && (
              <span className="block text-slate-500">Laporan ini hanya memuat rombel kewenangan Anda ({currentUser.rombelAkses.join(', ')}) — data rombel lain tidak ditampilkan maupun diekspor.</span>
            )}
          </p>
          <button onClick={handleCetak} disabled={jumlahBaris === 0} className="ui-btn ui-btn-primary disabled:opacity-50" title="Buka dialog cetak browser — pilih Save as PDF untuk PDF">
            <Printer className="w-4 h-4" /> Cetak / PDF
          </button>
          <button onClick={() => void handleExcel()} disabled={jumlahBaris === 0} className="ui-btn ui-btn-outline disabled:opacity-50" title="Ekspor ke Excel (.xlsx)">
            <FileSpreadsheet className="w-4 h-4" /> Ekspor Excel
          </button>
          <button onClick={handleCsv} disabled={jumlahBaris === 0} className="ui-btn ui-btn-outline disabled:opacity-50" title="Ekspor ke CSV (UTF-8 + BOM)">
            <Download className="w-4 h-4" /> Ekspor CSV
          </button>
        </div>
      </div>

      {/* Pratinjau cetak: satu-satunya yang tercetak (kelas print-sheet) */}
      <div className="print-sheet bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6 print:p-0 print:border-none print:shadow-none">
        <KopSuratView sekolah={sekolah} />
        <div className="text-center pt-1">
          <h3 className="text-xs uppercase font-bold text-slate-500 tracking-wider">LAPORAN {judulLaporan(filter.jenis).toUpperCase()}</h3>
          <p className="text-xs text-slate-600">{meta.periode}</p>
        </div>
        <MetaLaporanView meta={meta} />
        {masalahStat.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Peringatan konsistensi: {masalahStat.join(' ')}
          </div>
        )}
        {jumlahBaris === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
            <BarChart3 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            Tidak ada data untuk filter ini. Ubah jenis laporan, tahun ajaran, rombel, atau status di atas.
          </div>
        ) : stat ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <h4 className="font-bold text-xs uppercase tracking-wide text-blue-950">1. Rekapitulasi per Rombel</h4>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-[10px] border-b border-slate-200">
                    <tr><th className="p-2.5">Rombel</th><th className="p-2.5 text-center">Laki-laki (L)</th><th className="p-2.5 text-center">Perempuan (P)</th><th className="p-2.5 text-center">JK Belum Diisi (X)</th><th className="p-2.5 text-center">Jumlah Total</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stat.perRombel.map((r) => (
                      <tr key={r.rombel}><td className="p-2.5 font-bold text-slate-900">{r.rombel}</td><td className="p-2.5 text-center text-blue-700 font-semibold">{r.L}</td><td className="p-2.5 text-center text-rose-700 font-semibold">{r.P}</td><td className="p-2.5 text-center text-amber-700 font-semibold">{r.X}</td><td className="p-2.5 text-center font-bold text-slate-900">{r.total}</td></tr>
                    ))}
                    <tr className="bg-slate-100 font-black text-slate-900"><td className="p-2.5 uppercase">TOTAL</td><td className="p-2.5 text-center">{stat.perRombel.reduce((a, c) => a + c.L, 0)}</td><td className="p-2.5 text-center">{stat.perRombel.reduce((a, c) => a + c.P, 0)}</td><td className="p-2.5 text-center">{stat.perRombel.reduce((a, c) => a + c.X, 0)}</td><td className="p-2.5 text-center">{stat.total}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            {[
              { judul: '2. Rekapitulasi Agama', data: stat.perAgama },
              { judul: '3. Rekapitulasi Jalur Penerimaan (PPDB)', data: stat.perJalur },
              { judul: '4. Rekapitulasi Status Siswa', data: stat.perStatus },
            ].map((blok) => (
              <div key={blok.judul} className="space-y-2">
                <h4 className="font-bold text-xs uppercase tracking-wide text-slate-900">{blok.judul}</h4>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-[10px] border-b border-slate-200">
                      <tr><th className="p-2.5">Kategori</th><th className="p-2.5 text-center">Jumlah</th><th className="p-2.5 text-center">Persentase</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {blok.data.map((r) => (
                        <tr key={r.label}><td className="p-2.5 text-slate-700 break-words">{r.label}</td><td className="p-2.5 text-center font-bold text-slate-900">{r.jumlah}</td><td className="p-2.5 text-center text-slate-500">{r.persen}%</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : laporan ? (
          <div className="space-y-2">
            {/* Pratinjau layar: halaman berjalan. Cetak: seluruh baris. */}
            <div className="print:hidden">
              {renderTabelDaftar(barisHalaman, laporan.header)}
            </div>
            <div className="hidden print:block">
              {renderTabelDaftar(laporan.baris, laporan.header)}
            </div>
          </div>
        ) : null}
        <div className="pt-6 grid grid-cols-2 gap-8 text-center text-xs break-inside-avoid">
          <div>
            <p className="text-slate-600">Mengetahui,</p>
            <p className="font-bold text-slate-900">Kepala {sekolah.nama || 'Sekolah'}</p>
            <div className="h-16" />
            <p className="font-bold text-slate-900 underline">{sekolah.kepalaSekolah}</p>
            <p className="text-slate-600 font-mono text-[10px]">NIP. {sekolah.nipKepalaSekolah}</p>
          </div>
          <div>
            <p className="text-slate-600">{sekolah.kabupatenKota}, {new Date(dibuatPada).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            <p className="font-bold text-slate-900">Petugas Pengelola Buku Induk</p>
            <div className="h-16" />
            <p className="font-bold text-slate-900 underline">{sekolah.petugasBukuInduk}</p>
            <p className="text-slate-600 font-mono text-[10px]">NIP. {sekolah.nipPetugas}</p>
          </div>
        </div>
      </div>

      {/* Pagination pratinjau (tidak ikut tercetak) */}
      {laporan && jumlahBaris > 0 && (
        <div className="print:hidden">
          <PageControl
            page={halaman}
            totalPages={totalPages}
            totalItems={jumlahBaris}
            pageSize={pageSize}
            pageSizeOptions={[10, 20, 50, 100]}
            itemName="baris"
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
          />
        </div>
      )}
    </div>
  );
};
