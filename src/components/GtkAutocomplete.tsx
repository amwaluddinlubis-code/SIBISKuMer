import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, UserCheck } from 'lucide-react';
import { PtkRef } from '../types';

interface GtkAutocompleteProps {
  id?: string;
  value: string;
  ptk: PtkRef[];
  onChange: (nama: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

/** Isian nama dengan saran autocomplete dari data GTK (PTK hasil sinkron/manual).
 *  Tetap mengizinkan ketikan bebas bila nama belum terdaftar di GTK. */
export const GtkAutocomplete: React.FC<GtkAutocompleteProps> = ({
  id,
  value,
  ptk,
  onChange,
  placeholder,
  className,
  ariaLabel,
  disabled,
}) => {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const saran = useMemo(() => {
    const q = (value || '').trim().toUpperCase();
    const list = ptk || [];
    if (!q) return list.slice(0, 8);
    return list
      .filter(
        (p) =>
          p.nama.toUpperCase().includes(q) ||
          (p.nip || '').includes(q) ||
          (p.mapelAjar || '').toUpperCase().includes(q)
      )
      .slice(0, 8);
  }, [ptk, value]);

  useEffect(() => {
    setHighlight(0);
  }, [value]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pilih = (nama: string) => {
    onChange(nama);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        placeholder={placeholder || 'Ketik untuk mencari di data GTK…'}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, Math.max(0, saran.length - 1)));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter' && open && saran[highlight]) {
            e.preventDefault();
            pilih(saran[highlight].nama);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className={className || 'w-full px-3 py-2 border border-slate-300 rounded-xl bg-white uppercase focus:ring-2 focus:ring-blue-600 focus:outline-none'}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Tampilkan saran GTK"
        onClick={() => setOpen((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-blue-700 transition"
      >
        <ChevronDown className="w-4 h-4" />
      </button>
      {open && !disabled && (
        <div className="absolute left-0 right-0 mt-1 rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 overflow-hidden z-50 max-h-56 overflow-y-auto">
          {saran.length === 0 ? (
            <p className="px-3 py-2.5 text-[11px] text-slate-400 italic">
              {(ptk || []).length === 0
                ? 'Data GTK kosong — sinkron Dapodik atau tambah manual di modul GTK.'
                : 'Tidak cocok — tekan Enter untuk memakai ketikan.'}
            </p>
          ) : (
            saran.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pilih(p.nama)}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition cursor-pointer ${
                  i === highlight ? 'bg-blue-50' : 'hover:bg-slate-50'
                }`}
              >
                <span className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <UserCheck className="w-3.5 h-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-slate-900 truncate">{p.nama}</span>
                  <span className="block text-[10px] text-slate-500 truncate">
                    {p.jenisPtk || 'GTK'}{p.nip ? ` • NIP ${p.nip}` : ''}{p.mapelAjar ? ` • ${p.mapelAjar}` : ''}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
