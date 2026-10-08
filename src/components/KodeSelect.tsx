import React from 'react';
import { RefKode, labelKode } from '../data/referensi';

interface KodeSelectProps {
  id?: string;
  value: string;
  options: RefKode[];
  onChange: (nilai: string) => void;
  className?: string;
  ariaLabel?: string;
  required?: boolean;
}

/** Dropdown "kode – uraian" untuk tabel referensi Dapodik.
 *  Nilai lama yang tak ada di tabel tetap ditampilkan sebagai opsi
 *  "(data lama)" agar tidak hilang saat dibuka untuk diubah. */
export const KodeSelect: React.FC<KodeSelectProps> = ({
  id,
  value,
  options,
  onChange,
  className,
  ariaLabel,
  required,
}) => {
  const dikenal = options.some((o) => o.nilai === value);
  return (
    <select
      id={id}
      value={value}
      required={required}
      aria-required={required ? 'true' : undefined}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className={className || 'w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none'}
    >
      {!value && (
        <option value="">— Pilih —</option>
      )}
      {!dikenal && value && (
        <option value={value}>{value} (data lama)</option>
      )}
      {options.map((o) => (
        <option key={`${o.kode}-${o.nilai}`} value={o.nilai}>
          {labelKode(o)}
        </option>
      ))}
    </select>
  );
};
