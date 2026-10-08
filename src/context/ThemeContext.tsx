import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/** Mode tampilan: terang (bawaan) atau gelap (mode malam). */
export type ModeTema = 'terang' | 'gelap';
/** Ukuran huruf antarmuka. */
export type UkuranFont = 'normal' | 'besar' | 'sangat-besar';

/**
 * Kunci penyimpanan TEMA — cakupan PERANGKAT (bukan per sekolah),
 * sehingga preferensi tampilan konsisten di semua database sekolah.
 */
const KUNCI_TEMA = 'sibiskumer_tema';

const SKALA_FONT: Record<UkuranFont, number> = {
  normal: 1,
  besar: 1.125,
  'sangat-besar': 1.25,
};

interface TemaTersimpan {
  mode?: unknown;
  ukuranFont?: unknown;
}

function bacaTersimpan(): { mode: ModeTema; ukuranFont: UkuranFont } {
  let parsed: TemaTersimpan = {};
  try {
    const raw = localStorage.getItem(KUNCI_TEMA);
    if (raw) parsed = (JSON.parse(raw) as TemaTersimpan) || {};
  } catch {
    /* abaikan — pakai bawaan */
  }
  const mode: ModeTema = parsed.mode === 'gelap' ? 'gelap' : 'terang';
  const ukuranFont: UkuranFont =
    parsed.ukuranFont === 'besar' || parsed.ukuranFont === 'sangat-besar'
      ? parsed.ukuranFont
      : 'normal';
  return { mode, ukuranFont };
}

export interface ThemeState {
  mode: ModeTema;
  ukuranFont: UkuranFont;
  setMode: (mode: ModeTema) => void;
  setUkuranFont: (ukuran: UkuranFont) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tersimpan] = useState(bacaTersimpan);
  const [mode, setModeState] = useState<ModeTema>(tersimpan.mode);
  const [ukuranFont, setUkuranFontState] = useState<UkuranFont>(tersimpan.ukuranFont);

  // Persist ke localStorage setiap ada perubahan.
  useEffect(() => {
    try {
      localStorage.setItem(KUNCI_TEMA, JSON.stringify({ mode, ukuranFont }));
    } catch {
      /* abaikan */
    }
  }, [mode, ukuranFont]);

  // Terapkan ke dokumen: kelas .dark untuk Tailwind class strategy,
  // dan var --skala-font untuk penskalaan ukuran huruf (dipakai index.css).
  useEffect(() => {
    try {
      document.documentElement.classList.toggle('dark', mode === 'gelap');
      document.documentElement.style.setProperty('--skala-font', String(SKALA_FONT[ukuranFont]));
    } catch {
      /* abaikan */
    }
  }, [mode, ukuranFont]);

  const setMode = useCallback((m: ModeTema) => setModeState(m), []);
  const setUkuranFont = useCallback((u: UkuranFont) => setUkuranFontState(u), []);
  const toggleMode = useCallback(
    () => setModeState((m) => (m === 'gelap' ? 'terang' : 'gelap')),
    []
  );

  const value = useMemo<ThemeState>(
    () => ({ mode, ukuranFont, setMode, setUkuranFont, toggleMode }),
    [mode, ukuranFont, setMode, setUkuranFont, toggleMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme harus dipakai di dalam <ThemeProvider>.');
  return ctx;
}
