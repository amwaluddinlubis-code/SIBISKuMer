import React from 'react';
import { BarChart3, Printer, Users, Award, MapPin, Compass, ShieldCheck } from 'lucide-react';
import { Siswa, SekolahProfile } from '../types';

interface RekapitulasiViewProps {
  siswa: Siswa[];
  sekolah: SekolahProfile;
}

export const RekapitulasiView: React.FC<RekapitulasiViewProps> = ({ siswa, sekolah }) => {
  const total = siswa.length;

  // 1. Group by Rombel
  const rombelMap: Record<string, { L: number; P: number; total: number }> = {};
  siswa.forEach((s) => {
    const r = s.rombelSaatIni || 'Belum Ada';
    if (!rombelMap[r]) rombelMap[r] = { L: 0, P: 0, total: 0 };
    if (s.jenisKelamin === 'L') rombelMap[r].L++;
    else rombelMap[r].P++;
    rombelMap[r].total++;
  });
  const rombelList = Object.entries(rombelMap).sort((a, b) => a[0].localeCompare(b[0]));

  // 2. Group by Agama
  const agamaMap: Record<string, number> = {};
  siswa.forEach((s) => {
    const ag = s.agama || 'Lainnya';
    agamaMap[ag] = (agamaMap[ag] || 0) + 1;
  });

  // 3. Group by Jalur Masuk
  const jalurMap: Record<string, number> = {};
  siswa.forEach((s) => {
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

  siswa.forEach((s) => {
    s.p5Projects?.forEach((p) => {
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

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-700" />
            Rekapitulasi Keadaan Siswa Buku Induk (Fase D SMP)
          </h2>
          <p className="text-xs text-slate-500">
            Laporan statistik berkala per semester untuk Dinas Pendidikan & Akreditasi Sekolah
          </p>
        </div>

        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs shadow-sm transition"
        >
          <Printer className="w-4 h-4" />
          Cetak Rekapitulasi (PDF / Cetak)
        </button>
      </div>

      {/* Main Printable Area */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6 print:p-0 print:border-none print:shadow-none">
        {/* Print Header */}
        <div className="text-center border-b border-slate-200 pb-4">
          <h3 className="text-xs uppercase font-bold text-slate-500 tracking-wider">
            LAPORAN REKAPITULASI BUKU INDUK SISWA
          </h3>
          <h2 className="text-base sm:text-lg font-black text-slate-900 uppercase">
            {sekolah.nama || 'SMP NEGERI 1 MERDEKA BELAJAR'}
          </h2>
          <p className="text-xs text-slate-600">
            NPSN: {sekolah.npsn} | Tahun Ajaran {sekolah.tahunAjaran} Semester {sekolah.semesterAktif}
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
                      {rombel.startsWith('7') ? 'Fase D (Tingkat 7)' : rombel.startsWith('8') ? 'Fase D (Tingkat 8)' : 'Fase D (Tingkat 9)'}
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
            Penilaian perkembangan 6 dimensi karakter siswa dalam pelaksanaan projek penguatan profil pelajar pancasila tingkat SMP.
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
        <div className="pt-6 grid grid-cols-2 gap-8 text-center text-xs">
          <div>
            <p className="text-slate-600">Mengetahui,</p>
            <p className="font-bold text-slate-900">Kepala {sekolah.nama || 'SMP'}</p>
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
