import React, { useState } from 'react';
import { ShieldCheck, UserCheck, Eye, Printer, X } from 'lucide-react';
import { Siswa, SekolahProfile } from '../types';

export type TemplateKartu = 'dinas' | 'modern' | 'minimal';

export const TEMPLATE_KARTU: Record<TemplateKartu, { judul: string; desc: string }> = {
  dinas: { judul: 'Dinas (Navy-Emas)', desc: 'Formal gradien navy, standar saat ini.' },
  modern: { judul: 'Modern (Terang)', desc: 'Putih bersih dengan pita warna.' },
  minimal: { judul: 'Minimal (Monokrom)', desc: 'Hemat tinta, bingkai ganda.' },
};

export interface KartuProps {
  siswa: Siswa;
  sekolah: SekolahProfile;
  jenjang: string;
  faseLabel: string;
  template: TemplateKartu;
  /** Sembunyikan tombol pratinjau internal (mis. saat dirender di dalam overlay pratinjau lain). */
  sembunyikanPratinjau?: boolean;
}

function formatTgl(dateStr?: string): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function LogoSekolah({ sekolah, gelap }: { sekolah: SekolahProfile; gelap?: boolean }) {
  return (
    <div className="w-8 h-8 rounded-full bg-white p-1 shrink-0 flex items-center justify-center shadow-xs overflow-hidden">
      {sekolah.kop?.logoKiriUrl ? (
        <img src={sekolah.kop.logoKiriUrl} alt="Logo sekolah" className="w-full h-full object-contain" />
      ) : (
        <ShieldCheck className={`w-5 h-5 ${gelap ? 'text-slate-800' : 'text-blue-900'}`} />
      )}
    </div>
  );
}

function FotoSiswa({ siswa, terang }: { siswa: Siswa; terang?: boolean }) {
  const box = terang ? 'bg-slate-200 border-slate-300' : 'bg-white/20 border-white/40';
  return (
    <div className={`w-16 h-20 rounded border overflow-hidden flex items-center justify-center shrink-0 ${box}`}>
      {siswa.fotoUrl ? (
        <img src={siswa.fotoUrl} alt={siswa.namaLengkap} className="w-full h-full object-cover" />
      ) : (
        <UserCheck className={`w-8 h-8 ${terang ? 'text-slate-400' : 'text-white/60'}`} />
      )}
    </div>
  );
}

function BarcodeNisn({ nisn, terang }: { nisn?: string; terang?: boolean }) {
  return (
    <div className={`font-mono tracking-widest text-[9px] px-1.5 py-0.5 rounded ${terang ? 'bg-slate-900 text-white' : 'bg-white text-black'}`}>
      ||| | | |||| | ||| | {nisn || '0091234567'}
    </div>
  );
}

function Ketentuan({ sekolah, terang, aksen }: { sekolah: SekolahProfile; terang?: boolean; aksen: string }) {
  const list = [
    `Kartu ini adalah identitas sah peserta didik ${sekolah.nama}.`,
    'Dapat digunakan untuk layanan perpustakaan dan kegiatan sekolah.',
    'Apabila kartu ini hilang/rusak, segera lapor ke bagian Tata Usaha.',
    'Bagi yang menemukan kartu ini, harap mengembalikan ke alamat sekolah.',
  ];
  return (
    <>
      <div>
        <h5 className={`font-bold text-center uppercase text-[9px] border-b pb-1 ${aksen}`}>
          KETENTUAN PEMEGANG KARTU
        </h5>
        <ol className={`list-decimal list-inside space-y-1 mt-1.5 leading-snug ${terang ? 'text-slate-600' : 'text-slate-300'}`}>
          {list.map((k, i) => <li key={i}>{k}</li>)}
        </ol>
      </div>
      <div className={`flex items-end justify-between border-t pt-1 text-[7px] ${terang ? 'text-slate-500 border-slate-200' : 'text-slate-400 border-slate-800'}`}>
        <div><p>{sekolah.alamat}</p><p>Telp: {sekolah.telepon}</p></div>
        <div className="text-center">
          <p>Kepala Sekolah</p>
          <p className={`font-bold mt-3 underline ${terang ? 'text-slate-900' : 'text-white'}`}>{sekolah.kepalaSekolah}</p>
          <p>NIP. {sekolah.nipKepalaSekolah}</p>
        </div>
      </div>
    </>
  );
}

/** Sisi depan kartu (ukuran CR80: 85.6 × 53.98 mm). */
export const KartuDepan: React.FC<KartuProps> = ({ siswa, sekolah, jenjang, faseLabel, template }) => {
  if (template === 'modern') {
    return (
      <div className="w-[85.6mm] h-[53.98mm] mx-auto bg-white text-slate-900 rounded-xl shadow-xl overflow-hidden border border-slate-200 flex flex-col">
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-900 text-white px-3 py-1.5 flex items-center gap-2">
          <LogoSekolah sekolah={sekolah} />
          <div className="leading-none">
            <h4 className="text-[10px] font-extrabold uppercase tracking-wide">Kartu Tanda Pelajar</h4>
            <p className="text-[8px] font-bold uppercase truncate">{sekolah.nama || `SATUAN PENDIDIKAN ${jenjang}`}</p>
          </div>
          <span className="ml-auto text-[7px] font-mono bg-white/20 rounded px-1.5 py-0.5">NPSN {sekolah.npsn}</span>
        </div>
        <div className="flex gap-2.5 items-center px-3 my-auto">
          <FotoSiswa siswa={siswa} terang />
          <div className="text-[9px] leading-tight space-y-0.5 min-w-0">
            <p className="font-extrabold text-[11px] uppercase truncate">{siswa.namaLengkap}</p>
            <p><span className="inline-block px-1.5 py-px rounded bg-amber-100 text-amber-900 font-mono font-bold">NISN {siswa.nisn || '-'}</span></p>
            <p className="text-slate-600">NIPD <span className="font-mono">{siswa.nipd || '-'}</span> • Kelas <strong className="text-slate-900">{siswa.rombelSaatIni}</strong> ({faseLabel})</p>
            <p className="text-slate-600 truncate">TTL: {siswa.tempatLahir}, {formatTgl(siswa.tanggalLahir)}</p>
          </div>
        </div>
        <div className="flex items-center justify-between px-3 pb-1.5">
          <BarcodeNisn nisn={siswa.nisn} terang />
          <span className="text-[7px] text-slate-500">Berlaku Selama Menjadi Siswa • Kab. {sekolah.kabupatenKota}</span>
        </div>
      </div>
    );
  }

  if (template === 'minimal') {
    return (
      <div className="w-[85.6mm] h-[53.98mm] mx-auto bg-white text-slate-900 rounded-md shadow-xl overflow-hidden p-2.5 border-2 border-double border-slate-800 flex flex-col">
        <div className="text-center leading-none border-b-2 border-amber-500 pb-1">
          <h4 className="text-[9px] font-extrabold uppercase tracking-[0.2em]">Kartu Pelajar</h4>
          <p className="text-[8px] font-bold uppercase truncate mt-0.5">{sekolah.nama || `SATUAN PENDIDIKAN ${jenjang}`}</p>
        </div>
        <div className="flex gap-2 items-center my-auto pt-1">
          <div className="text-[8px] leading-tight space-y-0.5 flex-1 min-w-0">
            <p className="font-extrabold text-[10px] uppercase truncate">{siswa.namaLengkap}</p>
            <p>NISN: <span className="font-mono font-bold">{siswa.nisn || '-'}</span></p>
            <p>NIPD: <span className="font-mono">{siswa.nipd || '-'}</span> • Kls: <strong>{siswa.rombelSaatIni}</strong></p>
            <p className="truncate">TTL: {siswa.tempatLahir}, {formatTgl(siswa.tanggalLahir)}</p>
            <p className="font-mono text-[7px] text-slate-500">NPSN {sekolah.npsn} • {faseLabel}</p>
          </div>
          <FotoSiswa siswa={siswa} terang />
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-slate-300">
          <BarcodeNisn nisn={siswa.nisn} terang />
          <span className="text-[7px] text-slate-500">Berlaku Selama Menjadi Siswa</span>
        </div>
      </div>
    );
  }

  // dinas (navy-emas, desain baku)
  return (
    <div className="w-[85.6mm] h-[53.98mm] mx-auto bg-gradient-to-br from-blue-900 via-indigo-900 to-slate-900 text-white rounded-xl shadow-xl overflow-hidden p-3 border border-blue-400/40 relative flex flex-col justify-between">
      <div className="flex items-center gap-2 border-b border-blue-400/30 pb-1.5">
        <LogoSekolah sekolah={sekolah} />
        <div className="leading-none">
          <h4 className="text-[10px] font-extrabold uppercase tracking-wide text-amber-300">KARTU TANDA PELAJAR</h4>
          <p className="text-[9px] font-bold text-white uppercase truncate">{sekolah.nama || `SATUAN PENDIDIKAN ${jenjang}`}</p>
          <p className="text-[7px] text-blue-200">NPSN: {sekolah.npsn} | Kab. {sekolah.kabupatenKota}</p>
        </div>
      </div>
      <div className="flex gap-2.5 items-center my-auto">
        <FotoSiswa siswa={siswa} />
        <div className="text-[9px] leading-tight space-y-0.5">
          <p className="font-extrabold text-[10px] text-amber-200 uppercase truncate max-w-[150px]">{siswa.namaLengkap}</p>
          <p className="text-white">NISN: <span className="font-mono font-bold">{siswa.nisn || '-'}</span></p>
          <p className="text-white">NIPD: <span className="font-mono">{siswa.nipd || '-'}</span></p>
          <p className="text-white">Kelas: <strong>{siswa.rombelSaatIni}</strong> ({faseLabel})</p>
          <p className="text-white truncate max-w-[150px]">TTL: {siswa.tempatLahir}, {formatTgl(siswa.tanggalLahir)}</p>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-blue-400/30 pt-1 text-[8px] text-blue-200">
        <BarcodeNisn nisn={siswa.nisn} />
        <span className="text-[7px]">Berlaku Selama Menjadi Siswa</span>
      </div>
    </div>
  );
};

/** Sisi belakang kartu. */
export const KartuBelakang: React.FC<KartuProps> = ({ sekolah, template }) => {
  if (template === 'modern') {
    return (
      <div className="w-[85.6mm] h-[53.98mm] mx-auto bg-white text-slate-800 rounded-xl shadow-xl overflow-hidden border border-slate-200 p-3 flex flex-col justify-between text-[8px]">
        <Ketentuan sekolah={sekolah} terang aksen="text-indigo-800 border-indigo-100" />
      </div>
    );
  }
  if (template === 'minimal') {
    return (
      <div className="w-[85.6mm] h-[53.98mm] mx-auto bg-white text-slate-800 rounded-md shadow-xl overflow-hidden p-3 border-2 border-double border-slate-800 flex flex-col justify-between text-[8px]">
        <Ketentuan sekolah={sekolah} terang aksen="border-slate-300" />
      </div>
    );
  }
  return (
    <div className="w-[85.6mm] h-[53.98mm] mx-auto bg-slate-900 text-white rounded-xl shadow-xl overflow-hidden p-3 border border-slate-700 flex flex-col justify-between text-[8px]">
      <Ketentuan sekolah={sekolah} aksen="text-amber-300 border-slate-700" />
    </div>
  );
};

/** Kartu Tanda Pelajar depan-belakang, dengan pratinjau WYSIWYG per-siswa.
 *  Pratinjau selalu menampilkan kartu milik `siswa` yang sedang diproses
 *  (berguna saat komponen dipakai per-siswa dalam daftar/cetak massal). */
export const KartuPelajar: React.FC<KartuProps> = (props) => {
  const [pratinjau, setPratinjau] = useState(false);
  const { sembunyikanPratinjau, ...kartuProps } = props;

  /** Cetak dari pratinjau: tutup overlay dulu agar kartu tidak terduplikasi saat print. */
  const cetakDariPratinjau = () => {
    setPratinjau(false);
    window.setTimeout(() => window.print(), 200);
  };

  return (
    <>
      {!sembunyikanPratinjau && (
        <div className="flex justify-center print:hidden">
          <button
            type="button"
            onClick={() => setPratinjau(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-white bg-slate-700 hover:bg-slate-800 rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
            title="Pratinjau kartu sebelum mencetak"
          >
            <Eye className="w-3.5 h-3.5" />
            Pratinjau Kartu
          </button>
        </div>
      )}
      <KartuDepan {...kartuProps} />
      <KartuBelakang {...kartuProps} />
      {pratinjau && (
        <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-xs flex flex-col print:hidden">
          <div className="shrink-0 bg-slate-950/90 border-b border-white/10 px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Eye className="w-4 h-4 text-amber-300 shrink-0" />
              <h3 className="text-sm font-bold text-white truncate">
                Pratinjau Kartu — {props.siswa.namaLengkap}
              </h3>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={cetakDariPratinjau}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Cetak
              </button>
              <button
                type="button"
                onClick={() => setPratinjau(false)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-200 bg-white/10 hover:bg-white/20 rounded-lg transition active:scale-95 cursor-pointer"
              >
                <X className="w-4 h-4" />
                Tutup
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-8">
            <div className="flex flex-col items-center gap-6">
              <div>
                <p className="text-[10px] font-bold text-slate-400 text-center mb-1 uppercase tracking-widest">Depan</p>
                <KartuDepan {...kartuProps} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 text-center mb-1 uppercase tracking-widest">Belakang</p>
                <KartuBelakang {...kartuProps} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
