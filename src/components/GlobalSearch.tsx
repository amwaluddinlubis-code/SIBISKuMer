import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { Siswa } from '../types';
import { useGlobalSearch } from '../hooks/useGlobalSearch';

interface GlobalSearchProps {
  onPilihSiswa: (siswa: Siswa) => void;
}

/**
 * Modal pencarian global cepat (Ctrl+K / Cmd+K).
 * Input autofocus, navigasi ArrowUp/ArrowDown + Enter, klik hasil untuk memilih,
 * Esc atau klik backdrop untuk menutup.
 */
export default function GlobalSearch({ onPilihSiswa }: GlobalSearchProps) {
  const {
    terbuka,
    tutup,
    query,
    setQuery,
    hasil,
    indexAktif,
    pilihIndex,
  } = useGlobalSearch();
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus setiap modal dibuka
  useEffect(() => {
    if (terbuka) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [terbuka]);

  if (!terbuka) return null;

  const pilih = (siswa: Siswa) => {
    onPilihSiswa(siswa);
    tutup();
  };

  const onInputKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      pilihIndex(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      pilihIndex(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const aktif = hasil[indexAktif];
      if (aktif) pilih(aktif);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-navy-950/60 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={tutup}
      role="dialog"
      aria-modal="true"
      aria-label="Pencarian cepat siswa"
    >
      <div
        className="ui-card w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-navy-100 px-4 py-3">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Cari nama, NISN, NIPD…  (Ctrl+K)"
            className="ui-input w-full !border-0 !shadow-none text-base"
            aria-label="Kata kunci pencarian siswa"
          />
        </div>

        <div className="max-h-[40vh] overflow-y-auto p-2">
          {query.trim().length > 0 && hasil.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-navy-500">
              Tidak ditemukan siswa yang cocok.
            </p>
          )}
          {hasil.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => pilih(s)}
              onMouseEnter={() => pilihIndex(i - indexAktif)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                i === indexAktif
                  ? 'bg-gold-100 text-navy-900'
                  : 'text-navy-800 hover:bg-navy-50'
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {s.namaLengkap}
                </span>
                <span className="block truncate text-xs opacity-70">
                  NISN {s.nisn || '–'} · NIPD {s.nipd || '–'}
                </span>
              </span>
              {s.rombelSaatIni && (
                <span className="ui-badge ui-badge-blue shrink-0">
                  {s.rombelSaatIni}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 border-t border-navy-100 px-4 py-2 text-[11px] text-navy-500">
          <span>
            <kbd className="rounded bg-navy-100 px-1">↑</kbd>
            <kbd className="rounded bg-navy-100 px-1">↓</kbd> navigasi
          </span>
          <span>
            <kbd className="rounded bg-navy-100 px-1">Enter</kbd> pilih
          </span>
          <span>
            <kbd className="rounded bg-navy-100 px-1">Esc</kbd> tutup
          </span>
        </div>
      </div>
    </div>
  );
}
