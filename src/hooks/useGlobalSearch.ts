import { useCallback, useEffect, useRef, useState } from 'react';
import type { Siswa } from '../types';
import { getAllSiswa } from '../utils/db';

const DEBOUNCE_MS = 200;
const MAX_HASIL = 8;

/**
 * Hook pencarian global cepat (Ctrl+K / Cmd+K).
 *
 * - Mendengarkan Ctrl+K / Cmd+K untuk membuka, Escape untuk menutup.
 * - Mencari di seluruh data siswa (IndexedDB) dengan debounce 200ms;
 *   filter namaLengkap / namaPanggilan / NISN / NIPD (case-insensitive),
 *   dibatasi 8 hasil.
 */
export function useGlobalSearch() {
  const [terbuka, setTerbuka] = useState(false);
  const [query, setQuery] = useState('');
  const [hasil, setHasil] = useState<Siswa[]>([]);
  const [indexAktif, setIndexAktif] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buka = useCallback(() => setTerbuka(true), []);
  const tutup = useCallback(() => {
    setTerbuka(false);
    setQuery('');
    setHasil([]);
    setIndexAktif(0);
  }, []);

  // Shortcut keyboard: Ctrl+K / Cmd+K buka, Esc tutup
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setTerbuka((prev) => !prev);
      } else if (e.key === 'Escape') {
        setTerbuka(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Pencarian debounce 200ms setiap query berubah
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    const q = query.trim().toLowerCase();
    if (q.length === 0) {
      setHasil([]);
      setIndexAktif(0);
      return;
    }

    timerRef.current = setTimeout(async () => {
      try {
        const semua = await getAllSiswa();
        const cocok = semua
          .filter((s) =>
            [s.namaLengkap, s.namaPanggilan, s.nisn, s.nipd].some((f) =>
              (f ?? '').toLowerCase().includes(q)
            )
          )
          .slice(0, MAX_HASIL);
        setHasil(cocok);
        setIndexAktif(0);
      } catch {
        setHasil([]);
        setIndexAktif(0);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  /** Geser indeks aktif sebanyak delta (±1), dijepit pada rentang hasil. */
  const pilihIndex = useCallback(
    (delta: number) => {
      setIndexAktif((prev) => {
        if (hasil.length === 0) return 0;
        return Math.min(hasil.length - 1, Math.max(0, prev + delta));
      });
    },
    [hasil.length]
  );

  return {
    terbuka,
    buka,
    tutup,
    query,
    setQuery,
    hasil,
    indexAktif,
    pilihIndex,
  };
}

export type UseGlobalSearchReturn = ReturnType<typeof useGlobalSearch>;
