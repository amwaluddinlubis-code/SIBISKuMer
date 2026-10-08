import React from 'react';
import { BarChart3, Printer, Users, Award, MapPin, Compass, ShieldCheck } from 'lucide-react';
import { Siswa, SekolahProfile } from '../types';
import { getFaseKurikulum, getTingkatOptions } from '../utils/raportUtils';
import { rombelPadaTahun, siswaTerlibatTahun } from '../utils/sesi';
import { KopSuratView } from './KopSuratView';
import { unduhExcel } from '../utils/excel';
import { toast } from '../utils/notify';

interface RekapitulasiViewProps {
  siswa: Siswa[];
  sekolah: SekolahProfile;
  /** Sesi tahun ajaran login — rekap dibatasi pada kohort sesi ini. */
  sessionTahun?: string | null;
}

export const RekapitulasiView: React.FC<RekapitulasiViewProps> = ({ siswa, sekolah, sessionTahun }) => {
  // Fondasi sesi: kohort = siswa yang terlibat pada tahun sesi
  // (riwayat/raport/riwayat-tahun cocok, atau tanpa catatan = roster berjalan).
  const sesi = (sessionTahun || sekolah.tahunAjaran || '').trim();
  const kohort = sesi ? siswa.filter((s) => siswaTerlibatTahun(s, sesi)) : siswa;
  const total = kohort.length;
  const jenjang = sekolah.jenjang || (sekolah.bentukPendidikan?.toUpperCase().includes('SD') ? 'SD' : 'SMP');
  const faseHeader = jenjang === 'SD' ? 'Fase A–C SD' : 'Fase D SMP';
  const faseOfRombel = (rombel: string) => {
    const t = (rombel || '').charAt(0);
    if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(t)) {
      return `${getFaseKurikulum(t as '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9')} (Tingkat ${t})`;
    }
    return jenjang === 'SD' ? 'Fase A–C' : 'Fase D';
  };

  // 1. Group by Rombel (rombel siswa PADA tahun sesi)
  const rombelMap: Record<string, { L: number; P: number; total: number }> = {};
  kohort.forEach((s) => {
    const r = rombelPadaTahun(s, sesi || null, sekolah.tahunAjaran) || 'Belum Ada';
    if (!rombelMap[r]) rombelMap[r] = { L: 0, P: 0, total: 0 };
    if (s.jenisKelamin === 'L') rombelMap[r].L++;
    else rombelMap[r].P++;
    rombelMap[r].total++;
  });
  const rombelList = Object.entries(rombelMap).sort((a, b) => a[0].localeCompare(b[0]));

  // 2. Group by Agama
  const agamaMap: Record<string, number> = {};
  kohort.forEach((s) => {
    const ag = s.agama || 'Lainnya';
    agamaMap[ag] = (agamaMap[ag] || 0) + 1;
  });

  // 3. Group by Jalur Masuk
  const jalurMap: Record<string, number> = {};
  kohort.forEach((s) => {
    const j = s.jalurMasuk || 'Zonasi';
    jalurMap[j] = (jalurMap[j] || 0) + 1;
  });

  // 4. P5 Dimensions tally
  const p5Dimensi = {
    berimanBertakwa: { SB: 0, BSH: 0, MB: 0, BB: 0 },
    bergotongRoyong: { SB: 0, BSH: 0, MB: 0, BB: 0 },
    mandiri: { SB: 0, BSH: 0, MB: 0, BB: 0 },
    bernalarKritis: { SB: 0, BSH: 0, MB: 0, BB: 0 },
    kreatif: { SB: 0, BSH: 0, MB: 0, BB: 0 },
    berkebinekaanGlobal: { SB: 0, BSH: 0, MB: 0, BB: 0 }
  };

  kohort.forEach((s) => {
    s.p5Projects?.forEach((p) => {
      // P5 hanya dihitung bila proyeknya pada tahun sesi (bila sesi diketahui)
      if (sesi && (p.tahunAjaran || '').trim() !== sesi) return;
      const tally = (field: keyof typeof p5Dimensi, val: string) => {
        if (val === 'Sangat Berkembang') p5Dimensi[field].SB++;
        else if (val === 'Berkembang Sesuai Harapan') p5Dimensi[field].BSH++;
        else if (val === 'Mulai Berkembang') p5Dimensi[field].MB++;
        else p5Dimensi[field].BB++;
      };
      tally('berimanBertakwa', p.dimensi.berimanBertakwa);
      tally('bergotongRoyong', p.dimensi.bergotongRoyong);
      tally('mandiri', p.dimensi.mandiri);
      tally('bernalarKritis', p.dimensi.bernalarKritis);
      tally('kreatif', p.dimensi.kreatif);
      tally('berkebinekaanGlobal', p.dimensi.berkebinekaanGlobal);
    });
  });

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = async () => {
    if (total === 0) {
      toast('Tidak ada data rekap untuk diekspor.', 'warning');
      return;
    }
    try {
      const judul = `REKAPITULASI BUKU INDUK — ${sekolah.nama || ''} — TA ${sesi || sekolah.tahunAjaran}`;
      const sheetRombel = [
        [judul], [],
        ['Rombel', 'Laki-laki (L)', 'Perempuan (P)', 'Jumlah Total', 'Keterangan Fase'],
        ...rombelList.map(([rombel, c]) => [`Rombel ${rombel}`, c.L, c.P, c.total, faseOfRombel(rombel)]),
        ['TOTAL KESELURUHAN', rombelList.reduce((a, c) => a + c[1].L, 0), rombelList.reduce((a, c) => a + c[1].P, 0), total, '100% Terdaftar'],
      ];
      const sheetAgama = [
        [judul], [],
        ['Agama', 'Jumlah', 'Persentase'],
        ...Object.entries(agamaMap).map(([ag, count]) => [ag, count, `${total > 0 ? Math.round((count / total) * 100) : 0}%`]),
      ];
      const sheetJalur = [
        [judul], [],
        ['Jalur Penerimaan (PPDB)', 'Jumlah', 'Persentase'],
        ...Object.entries(jalurMap).map(([j, count]) => [j, count, `${total > 0 ? Math.round((count / total) * 100) : 0}%`]),
      ];
      const dimensiNama: Array<[string, keyof typeof p5Dimensi]> = [
        ['Beriman, Bertakwa & Berakhlak Mulia', 'berimanBertakwa'],
        ['Berkebinekaan Global', 'berkebinekaanGlobal'],
        ['Bergotong Royong', 'bergotongRoyong'],
        ['Mandiri', 'mandiri'],
        ['Bernalar Kritis', 'bernalarKritis'],
        ['Kreatif', 'kreatif'],
      ];
      const sheetP5 = [
        [judul], [],
        ['Dimensi Karakter Pancasila', 'Sangat Berkembang (SB)', 'Sesuai Harapan (BSH)', 'Mulai Berkembang (MB)', 'Belum Berkembang (BB)'],
        ...dimensiNama.map(([nama, k]) => [nama, p5Dimensi[k].SB, p5Dimensi[k].BSH, p5Dimensi[k].MB, p5Dimensi[k].BB]),
      ];
      await unduhExcel(`Rekap_${(sesi || sekolah.tahunAjaran || '').replace('/', '-')}_${sekolah.nama || jenjang}`, [
        { nama: 'Rombel', baris: sheetRombel },
        { nama: 'Agama', baris: sheetAgama },
        { nama: 'Jalur PPDB', baris: sheetJalur },
        { nama: 'P5', baris: sheetP5 },
      ]);
      toast(`Rekapitulasi ${total} siswa diekspor ke Excel (4 sheet).`, 'success');
    } catch (err: unknown) {
      toast(`Gagal mengekspor Excel: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-700" />
            Rekapitulasi Keadaan Siswa Buku Induk ({faseHeader})
          </h2>
          <p className="text-xs text-slate-500">
            Laporan statistik berkala per semester untuk Dinas Pendidikan & Akreditasi Sekolah
            {sesi && (
              <span className="ml-1.5 font-mono font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                Sesi TA {sesi}
              </span>
            )}
            <span className="ml-1.5 text-slate-400">• kohort {total} siswa</span>
          </p>
        </div>

        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs shadow-sm transition"
        >
          <Printer className="w-4 h-4" />
          Cetak Rekapitulasi (PDF / Cetak)
        </button>

        <button
          onClick={() => void handleExportExcel()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs shadow-sm transition"
          title="Ekspor rekap ke Excel (.xlsx, 4 sheet)"
        >
          <BarChart3 className="w-4 h-4" />
          Ekspor Excel
        </button>
      </div>

      {/* Main Printable Area */}
      <div className="print-sheet bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6 print:p-0 print:border-none print:shadow-none">
        {/* Kop resmi + judul laporan */}
        <KopSuratView sekolah={sekolah} />
        <div className="text-center pt-1">
          <h3 className="text-xs uppercase font-bold text-slate-500 tracking-wider">
            LAPORAN REKAPITULASI BUKU INDUK SISWA
          </h3>
          <p className="text-xs text-slate-600">
            Tahun Ajaran {sesi || sekolah.tahunAjaran} Semester {sekolah.semesterAktif}
            {sessionTahun && sekolah.tahunAjaran && sessionTahun.trim() !== sekolah.tahunAjaran.trim() && (
              <span className="text-amber-700"> (sesi login; aktif database {sekolah.tahunAjaran})</span>
            )}
          </p>
        </div>

        {/* 1. Rekapitulasi per Rombel */}
        <div className="space-y-2">
          <h4 className="font-bold text-xs uppercase tracking-wide text-blue-950 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-blue-700" />
            1. Rekapitulasi Berdasarkan Rombongan Belajar (Rombel)
          </h4>
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-[10px] border-b border-slate-200">
                <tr>
                  <th className="p-2.5">Tingkat / Rombel</th>
                  <th className="p-2.5 text-center">Laki-laki (L)</th>
                  <th className="p-2.5 text-center">Perempuan (P)</th>
                  <th className="p-2.5 text-center">Jumlah Total</th>
                  <th className="p-2.5">Keterangan Fase</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rombelList.map(([rombel, counts]) => (
                  <tr key={rombel} className="hover:bg-slate-50">
                    <td className="p-2.5 font-bold text-slate-900">Rombel {rombel}</td>
                    <td className="p-2.5 text-center text-blue-700 font-semibold">{counts.L}</td>
                    <td className="p-2.5 text-center text-rose-700 font-semibold">{counts.P}</td>
                    <td className="p-2.5 text-center font-bold text-slate-900">{counts.total}</td>
                    <td className="p-2.5 text-slate-500 text-[11px]">
                      {faseOfRombel(rombel)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-100 font-black text-slate-900">
                  <td className="p-2.5 uppercase">TOTAL KESELURUHAN</td>
                  <td className="p-2.5 text-center text-blue-900">
                    {rombelList.reduce((acc, curr) => acc + curr[1].L, 0)}
                  </td>
                  <td className="p-2.5 text-center text-rose-900">
                    {rombelList.reduce((acc, curr) => acc + curr[1].P, 0)}
                  </td>
                  <td className="p-2.5 text-center text-slate-900">{total}</td>
                  <td className="p-2.5 text-[11px] text-slate-600">100% Terdaftar</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 2. Grid: Agama & Jalur Masuk */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Agama */}
          <div className="border border-slate-200 rounded-lg p-4 space-y-2">
            <h4 className="font-bold text-xs uppercase tracking-wide text-slate-900 flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-emerald-700" />
              2. Rekapitulasi Agama Siswa
            </h4>
            <div className="space-y-1.5 text-xs">
              {Object.entries(agamaMap).map(([ag, count]) => {
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={ag} className="flex items-center justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-700">{ag}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{count}</span>
                      <span className="text-slate-400 text-[10px]">({pct}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Jalur Masuk PPDB */}
          <div className="border border-slate-200 rounded-lg p-4 space-y-2">
            <h4 className="font-bold text-xs uppercase tracking-wide text-slate-900 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-700" />
              3. Rekapitulasi Jalur Penerimaan (PPDB)
            </h4>
            <div className="space-y-1.5 text-xs">
              {Object.entries(jalurMap).map(([j, count]) => {
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={j} className="flex items-center justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-700">{j}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{count}</span>
                      <span className="text-slate-400 text-[10px]">({pct}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 3. Capaian Profil Pelajar Pancasila (P5) */}
        <div className="border border-slate-200 rounded-lg p-4 space-y-3">
          <h4 className="font-bold text-xs uppercase tracking-wide text-slate-900 flex items-center gap-1.5">
            <Award className="w-4 h-4 text-amber-600" />
            4. Distribusi Capaian Dimensi Profil Pelajar Pancasila (P5 Kurikulum Merdeka)
          </h4>
          <p className="text-[11px] text-slate-500">
            Penilaian perkembangan 6 dimensi karakter siswa dalam pelaksanaan projek penguatan profil pelajar pancasila tingkat {jenjang}.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-[10px] border-b border-slate-200">
                <tr>
                  <th className="p-2">Dimensi Karakter Pancasila</th>
                  <th className="p-2 text-center text-emerald-800">Sangat Berkembang (SB)</th>
                  <th className="p-2 text-center text-blue-800">Sesuai Harapan (BSH)</th>
                  <th className="p-2 text-center text-amber-800">Mulai Berkembang (MB)</th>
                  <th className="p-2 text-center text-slate-600">Belum Berkembang (BB)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  { name: 'Beriman, Bertakwa kepada Tuhan YME, & Berakhlak Mulia', key: 'berimanBertakwa' as const },
                  { name: 'Berkebinekaan Global', key: 'berkebinekaanGlobal' as const },
                  { name: 'Bergotong Royong', key: 'bergotongRoyong' as const },
                  { name: 'Mandiri', key: 'mandiri' as const },
                  { name: 'Bernalar Kritis', key: 'bernalarKritis' as const },
                  { name: 'Kreatif', key: 'kreatif' as const },
                ].map((d) => (
                  <tr key={d.key}>
                    <td className="p-2 font-medium text-slate-800">{d.name}</td>
                    <td className="p-2 text-center font-bold text-emerald-700">{p5Dimensi[d.key].SB}</td>
                    <td className="p-2 text-center font-bold text-blue-700">{p5Dimensi[d.key].BSH}</td>
                    <td className="p-2 text-center font-bold text-amber-700">{p5Dimensi[d.key].MB}</td>
                    <td className="p-2 text-center font-bold text-slate-500">{p5Dimensi[d.key].BB}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tanda Tangan Rekapitulasi */}
        <div className="pt-6 grid grid-cols-2 gap-8 text-center text-xs break-inside-avoid">
          <div>
            <p className="text-slate-600">Mengetahui,</p>
            <p className="font-bold text-slate-900">Kepala {sekolah.nama || `Sekolah (${jenjang})`}</p>
            <div className="h-16" />
            <p className="font-bold text-slate-900 underline">{sekolah.kepalaSekolah}</p>
            <p className="text-slate-600 font-mono text-[10px]">NIP. {sekolah.nipKepalaSekolah}</p>
          </div>

          <div>
            <p className="text-slate-600">{sekolah.kabupatenKota}, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            <p className="font-bold text-slate-900">Petugas Pengelola Buku Induk</p>
            <div className="h-16" />
            <p className="font-bold text-slate-900 underline">{sekolah.petugasBukuInduk}</p>
            <p className="text-slate-600 font-mono text-[10px]">NIP. {sekolah.nipPetugas}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
