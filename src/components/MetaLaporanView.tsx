import React from 'react';
import { MetaLaporan } from '../utils/laporan';

/**
 * Blok metadata laporan (Issue #7): parameter filter, waktu pembuatan,
 * dan sumber/periode data — WAJIB tercetak di setiap laporan (pratinjau,
 * cetak, dan file ekspor). Dipakai Pusat Laporan & Rekapitulasi.
 */
export const MetaLaporanView: React.FC<{ meta: MetaLaporan }> = ({ meta }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
    <p>
      <span className="font-bold text-slate-800">Parameter laporan: </span>
      <span className="break-words">{meta.parameter}</span>
    </p>
    <p>
      <span className="font-bold text-slate-800">Dibuat: </span>
      {meta.dibuatPadaLabel}
      <span className="mx-1.5 text-slate-300">|</span>
      <span className="font-bold text-slate-800">Periode: </span>
      {meta.periode}
    </p>
    <p>
      <span className="font-bold text-slate-800">Sumber data: </span>
      <span className="break-words">{meta.sumber}</span>
    </p>
  </div>
);
