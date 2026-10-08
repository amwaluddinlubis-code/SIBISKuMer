import { SekolahProfile, TemaMode, ModeTampilan } from '../types';

export type TemaEfektif = 'biru' | 'maroon';

/** Aksen biru untuk SMP, maroon untuk SD; `otomatis` mengikuti jenjang. */
export function resolveTemaEfektif(
  sekolah: Pick<SekolahProfile, 'jenjang' | 'tema'>
): TemaEfektif {
  const mode: TemaMode = sekolah.tema?.mode || 'otomatis';
  if (mode === 'biru') return 'biru';
  if (mode === 'maroon') return 'maroon';
  return sekolah.jenjang === 'SD' ? 'maroon' : 'biru';
}

export const TEMA_LABEL: Record<TemaMode, { judul: string; desc: string }> = {
  otomatis: {
    judul: 'Otomatis (ikut jenjang)',
    desc: 'SMP memakai aksen biru, SD memakai aksen maroon.',
  },
  biru: { judul: 'Biru (SMP)', desc: 'Aksen biru navy dinas.' },
  maroon: { judul: 'Maroon (SD)', desc: 'Aksen maroon.' },
};

// ---------------- Mode tampilan gelap/terang (data-mode) ----------------
// Disimpan per perangkat (bukan per sekolah). 'otomatis' mengikuti
// prefers-color-scheme sistem + diperbarui live saat sistem berubah.

const KUNCI_MODE = 'bukuinduk_mode_tampilan';

export const MODE_LABEL: Record<ModeTampilan, string> = {
  terang: 'Terang',
  gelap: 'Gelap',
  otomatis: 'Otomatis (ikut sistem)',
};

export function bacaModeTampilan(): ModeTampilan {
  try {
    const v = localStorage.getItem(KUNCI_MODE);
    if (v === 'gelap' || v === 'otomatis' || v === 'terang') return v;
  } catch {
    /* abaikan */
  }
  return 'terang';
}

export function simpanModeTampilan(mode: ModeTampilan): void {
  try {
    localStorage.setItem(KUNCI_MODE, mode);
  } catch {
    /* abaikan */
  }
}

function sistemGelap(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function modeGelapAktif(mode: ModeTampilan): boolean {
  if (mode === 'gelap') return true;
  if (mode === 'otomatis') return sistemGelap();
  return false;
}

let mqlTerpasang: MediaQueryList | null = null;
let mqlHandler: ((e: MediaQueryListEvent) => void) | null = null;

/** Terapkan ke <html data-mode>. Idempoten; aman dipanggil tiap render. */
export function terapkanModeTampilan(mode: ModeTampilan): void {
  try {
    document.documentElement.dataset.mode = modeGelapAktif(mode) ? 'dark' : 'light';
  } catch {
    /* abaikan */
  }
  // Dengarkan perubahan sistem hanya saat mode otomatis.
  try {
    if (mqlHandler && mqlTerpasang) {
      mqlTerpasang.removeEventListener('change', mqlHandler);
      mqlHandler = null;
      mqlTerpasang = null;
    }
    if (mode === 'otomatis' && typeof window.matchMedia === 'function') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      mqlHandler = () => {
        try {
          document.documentElement.dataset.mode = mql.matches ? 'dark' : 'light';
        } catch {
          /* abaikan */
        }
      };
      mql.addEventListener('change', mqlHandler);
      mqlTerpasang = mql;
    }
  } catch {
    /* abaikan */
  }
}

/** Siklus tombol toggle: terang → gelap → otomatis → terang. */
export function modeBerikutnya(mode: ModeTampilan): ModeTampilan {
  if (mode === 'terang') return 'gelap';
  if (mode === 'gelap') return 'otomatis';
  return 'terang';
}
