import React, { useMemo, useState } from 'react';
import { Printer, X, IdCard } from 'lucide-react';
import { Siswa, SekolahProfile, TingkatKelas } from '../types';
import { getFaseKurikulum, getTingkatDariRombel } from '../utils/raportUtils';
import { KartuDepan, KartuBelakang, TemplateKartu, TEMPLATE_KARTU } from './KartuPelajar';

interface CetakKartuMassalProps {
  siswa: Siswa[];
  sekolah: SekolahProfile;
  jenjang: string;
  onClose: () => void;
}

/** KARTU_PER_HALAMAN: A4 portrait muat 2 kolom × 5 baris kartu CR80. */
export const KARTU_PER_HALAMAN = 10;

function faseSiswa(s: Siswa, jenjang: string): string {
  const t = getTingkatDariRombel(s.rombelSaatIni || '');
  if (t && ['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(t)) {
    try {
      return getFaseKurikulum(t as TingkatKelas);
    } catch {
      /* fallback di bawah */
    }
  }
  return jenjang === 'SD' ? 'Fase A/B/C' : 'Fase D';
}

/** Pratinjau + cetak kartu pelajar massal di kertas A4 (10 kartu/halaman). */
export const CetakKartuMassal: React.FC<CetakKartuMassalProps> = ({ siswa, sekolah, jenjang, onClose }) => {
  const [template, setTemplate] = useState<TemplateKartu>('dinas');
  const [sertakanBelakang, setSertakanBelakang] = useState(false);

  const daftar = useMemo(
    () => [...(siswa || [])].sort((a, b) => (a.namaLengkap || '').localeCompare(b.namaLengkap || '')),
    [siswa]
  );

  const halaman: Siswa[][] = useMemo(() => {
    // Bila sisi belakang ikut, tiap siswa memakai 2 slot → 5 siswa/halaman.
    const perHalaman = sertakanBelakang ? KARTU_PER_HALAMAN / 2 : KARTU_PER_HALAMAN;
    const pages: Siswa[][] = [];
    for (let i = 0; i < daftar.length; i += perHalaman) pages.push(daftar.slice(i, i + perHalaman));
    return pages;
  }, [daftar, sertakanBelakang]);

  return (
    <div className="kartu-massal-root fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs overflow-y-auto p-2 sm:p-6 print:p-0 print:bg-white print:static">
      <div className="max-w-4xl mx-auto space-y-4 print:max-w-none print:space-y-0">
        {/* Toolbar (tidak ikut cetak) */}
        <div className="bg-white rounded-xl shadow-xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 border border-slate-200 print:hidden sticky top-2 z-20">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer">
              <X className="w-4 h-4" /> Kembali
            </button>
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <IdCard className="w-4 h-4 text-blue-700" />
              Kartu Massal — {daftar.length} siswa ({halaman.length} halaman A4)
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] font-bold text-slate-600" htmlFor="massal-template">Template:</label>
            <select id="massal-template" value={template} onChange={(e) => setTemplate(e.target.value as TemplateKartu)} className="ui-input !w-auto !py-1.5">
              {(Object.keys(TEMPLATE_KARTU) as TemplateKartu[]).map((t) => (
                <option key={t} value={t}>{TEMPLATE_KARTU[t].judul}</option>
              ))}
            </select>
            <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={sertakanBelakang} onChange={(e) => setSertakanBelakang(e.target.checked)} className="rounded border-slate-300" />
              Sisi belakang
            </label>
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow-sm transition cursor-pointer">
              <Printer className="w-4 h-4" /> Cetak A4
            </button>
          </div>
        </div>

        {/* Halaman-halaman A4 */}
        <div className="kartu-massal space-y-4 print:space-y-0">
          {halaman.map((page, pi) => (
            <div key={pi} className="kartu-a4">
              {page.map((s) => (
                <React.Fragment key={s.id}>
                  <div className="kartu-slot">
                    <KartuDepan siswa={s} sekolah={sekolah} jenjang={jenjang} faseLabel={faseSiswa(s, jenjang)} template={template} />
                  </div>
                  {sertakanBelakang && (
                    <div className="kartu-slot">
                      <KartuBelakang siswa={s} sekolah={sekolah} jenjang={jenjang} faseLabel={faseSiswa(s, jenjang)} template={template} />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
