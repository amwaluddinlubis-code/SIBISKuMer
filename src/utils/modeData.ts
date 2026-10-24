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

// ---------------- Mode utama (Fase S3) ----------------
// 'lokal'  : seluruh data dari IndexedDB perangkat ini (perilaku bawaan).
// 'server' : MODE SERVER PENUH — login, baca, dan tulis melalui API
//            SQLite; IndexedDB hanya menjadi salinan cadangan lokal.
// Saklar per layar di atas hanya relevan pada mode utama 'lokal'.
export const MODE_UTAMA_KEY = 'bukuinduk_mode_utama';

/** True bila berjalan di dalam kemasan desktop Electron (preload
 *  mengekspos window.appDesktop). Di browser biasa selalu false. */
export function adalahDesktop(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      (window as unknown as { appDesktop?: { isDesktop?: boolean } }).appDesktop
        ?.isDesktop === true
    );
  } catch {
    return false;
  }
}

export function modeUtama(): ModeData {
  try {
    const tersimpan = localStorage.getItem(MODE_UTAMA_KEY);
    if (tersimpan === 'server') return 'server';
    if (tersimpan === 'lokal') return 'lokal';
    // Belum pernah diatur: kemasan desktop membawa server SQLite terbundel,
    // jadi mode server adalah bawaannya (Fase S5). Instalasi desktop lama
    // yang datanya masih di IndexedDB akan ditawari migrasi otomatis oleh
    // penawaran Fase S4 pada masuk pertama. Browser web tetap lokal.
    return adalahDesktop() ? 'server' : 'lokal';
  } catch {
    return 'lokal';
  }
}

export function aturModeUtama(mode: ModeData): void {
  try {
    localStorage.setItem(MODE_UTAMA_KEY, mode);
  } catch {
    /* abaikan */
  }
}

/** True bila jalur data harus melalui server (mode utama server). */
export function pakaiServer(): boolean {
  return modeUtama() === 'server';
}
