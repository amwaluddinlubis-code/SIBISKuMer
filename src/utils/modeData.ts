// Saklar sumber data per layar (Fase S2 migrasi SQLite).
//
// Setiap layar pilot dapat membaca dari 'lokal' (IndexedDB, bawaan) atau
// 'server' (API SQLite). Saklar disimpan di localStorage agar admin dapat
// membandingkan pasangan layar (mode lama vs baru) tanpa mengubah kode.
// Mode server pada S2 bersifat BACA SAJA untuk pengujian paritas —
// penulisan tetap melalui jalur lokal sampai Fase S3.
export type LayarPilot = 'dasbor' | 'siswa';
export type ModeData = 'lokal' | 'server';

export const MODE_DATA_KEY = 'bukuinduk_mode_data';

const LAYAR_PILOT: LayarPilot[] = ['dasbor', 'siswa'];

function bacaPeta(): Partial<Record<LayarPilot, ModeData>> {
  try {
    const mentah = localStorage.getItem(MODE_DATA_KEY);
    if (!mentah) return {};
    const parsed = JSON.parse(mentah);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function modeLayar(layar: LayarPilot): ModeData {
  return bacaPeta()[layar] === 'server' ? 'server' : 'lokal';
}

export function aturModeLayar(layar: LayarPilot, mode: ModeData): void {
  try {
    const peta = bacaPeta();
    peta[layar] = mode;
    localStorage.setItem(MODE_DATA_KEY, JSON.stringify(peta));
  } catch {
    /* penyimpanan tidak tersedia — saklar diabaikan */
  }
}

/** True bila ada layar yang sedang membaca dari server (perlu sesi server). */
export function adaLayarServer(): boolean {
  return LAYAR_PILOT.some((l) => modeLayar(l) === 'server');
}

export function daftarLayarPilot(): Array<{ layar: LayarPilot; label: string }> {
  return [
    { layar: 'dasbor', label: 'Dasbor' },
    { layar: 'siswa', label: 'Master Siswa' },
  ];
}
