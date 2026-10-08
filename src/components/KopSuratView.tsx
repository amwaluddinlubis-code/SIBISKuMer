import React from 'react';
import { SekolahProfile } from '../types';
import { resolveKop } from '../utils/kop';

interface KopSuratViewProps {
  sekolah: SekolahProfile;
  /** Varian ringkas untuk rekap (tanpa logo kanan badge). */
  ringkas?: boolean;
}

/** Emblem generik bila sekolah belum mengunggah logo. */
export const KopEmblemGenerik: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className || 'w-14 h-14 text-blue-900'} viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">
    <path d="M50 10 L85 25 L50 40 L15 25 Z" />
    <path d="M25 35 V60 C25 75 50 90 50 90 C50 90 75 75 75 60 V35" fill="none" stroke="currentColor" strokeWidth="6" />
    <circle cx="50" cy="55" r="14" fill="#d97706" />
  </svg>
);

/** Kop surat resmi tunggal untuk seluruh cetakan (induk, raport, rekap).
 *  Gaya bawaan menyerupai kop dinas standar: logo kiri + tiga judul hitam tegas
 *  (serif) bertingkat + alamat/kontak format dinas. */
export const KopSuratView: React.FC<KopSuratViewProps> = ({ sekolah, ringkas = false }) => {
  const jenjang = sekolah.jenjang || 'SMP';
  const { kop, baris1, baris2, alamat, kontak } = resolveKop(sekolah);
  const serif = kop.fontJudul === 'serif';
  const besar = kop.ukuranNama === 'besar';

  // Tingkat ukuran judul ala kop dinas: baris dinas paling besar,
  // diikuti baris pemerintah & nama sekolah.
  const clsBaris1 = serif
    ? besar ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl'
    : 'text-xs';
  const clsBaris2 = serif
    ? besar ? 'text-2xl sm:text-[1.7rem]' : 'text-xl sm:text-2xl'
    : 'text-xs';
  const clsNama = serif
    ? besar ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'
    : besar ? 'text-base sm:text-lg' : 'text-sm sm:text-base';

  return (
    <div className="border-b-2 border-slate-900 pb-3 text-center relative">
      <div className="flex items-center justify-between">
        <div className="w-20 sm:w-24 shrink-0 flex items-center justify-center overflow-hidden">
          {kop.tampilLogoKiri ? (
            kop.logoKiriUrl ? (
              <img src={kop.logoKiriUrl} alt="Logo sekolah" className="h-28 sm:h-32 w-auto max-w-full object-contain" />
            ) : (
              <KopEmblemGenerik className="h-28 sm:h-32 w-auto text-blue-900" />
            )
          ) : null}
        </div>

        <div className="flex-1 px-4 text-center">
          {kop.tampilBaris1 && (
            <h3
              className={`font-bold uppercase text-black leading-tight ${clsBaris1} ${serif ? '' : 'tracking-wider text-slate-700 font-semibold'}`}
              style={serif ? { fontFamily: '"Times New Roman", Georgia, serif' } : undefined}
            >
              {baris1}
            </h3>
          )}
          {kop.tampilBaris2 && (
            <h2
              className={`font-black uppercase text-black leading-tight ${clsBaris2} ${serif ? '' : 'tracking-wide text-slate-800'}`}
              style={serif ? { fontFamily: '"Times New Roman", Georgia, serif' } : undefined}
            >
              {baris2}
            </h2>
          )}
          <h1
            className={`font-black uppercase text-black leading-tight my-0.5 ${clsNama} ${serif ? '' : 'tracking-wider text-blue-950'}`}
            style={serif ? { fontFamily: '"Times New Roman", Georgia, serif' } : undefined}
          >
            {sekolah.nama || `SEKOLAH ${jenjang}`}
          </h1>
          {kop.tampilAlamat && alamat && (
            <p className="text-[10px] text-slate-800 leading-tight mt-0.5">{alamat}</p>
          )}
          {kop.tampilKontak && kontak && (
            <p className="text-[10px] text-slate-800">{kontak}</p>
          )}
        </div>

        <div className="w-20 sm:w-24 shrink-0 flex items-center justify-center overflow-hidden">
          {kop.logoKananMode === 'gambar' && kop.logoKananUrl ? (
            <img src={kop.logoKananUrl} alt="Logo kanan" className="h-28 sm:h-32 w-auto max-w-full object-contain" />
          ) : kop.logoKananMode === 'badge' && !ringkas ? (
            <div className="h-28 sm:h-32 aspect-square max-w-full rounded-full border-2 border-blue-900 flex items-center justify-center font-bold text-[9px] text-blue-900 text-center leading-tight">
              {jenjang}<br />KURIKULUM<br />MERDEKA
            </div>
          ) : null}
        </div>
      </div>
      {kop.garis === 'ganda' && (
        <>
          <div className="h-0.5 bg-slate-900 mt-2" />
          <div className="h-px bg-slate-900 mt-0.5" />
        </>
      )}
      {kop.garis === 'tunggal' && <div className="h-0.5 bg-slate-900 mt-2" />}
    </div>
  );
};
