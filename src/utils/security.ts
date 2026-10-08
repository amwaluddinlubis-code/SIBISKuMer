// ---------------- KUNCI LOGIN (brute-force protection, sisi klien) ----------------
// Kebijakan: 5x gagal → akun dikunci 15 menit (per database sekolah).
// Status disimpan di localStorage ter-scope DB agar bertahan saat reload.
// Catatan: ini pengaman lapisan UI — bukan pengganti kontrol server.

import { scopedStorageKey, storageKeys } from './db';

export const LOGIN_MAX_GAGAL = 5;
export const LOGIN_KUNCI_MENIT = 15;

interface CatatanKunci {
  gagal: number;
  kunciSampai: number; // epoch ms, 0 = tidak dikunci
}

type PetaKunci = Record<string, CatatanKunci>;

function bacaPeta(): PetaKunci {
  try {
    const raw = localStorage.getItem(scopedStorageKey(storageKeys.LOCKOUT));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as PetaKunci) : {};
  } catch {
    return {};
  }
}

function tulisPeta(peta: PetaKunci): void {
  try {
    localStorage.setItem(scopedStorageKey(storageKeys.LOCKOUT), JSON.stringify(peta));
  } catch {
    /* abaikan */
  }
}

function normalisasi(username: unknown): string {
  return String(username || '').trim().toLowerCase();
}

export interface StatusKunci {
  terkunci: boolean;
  /** Sisa menit pembulatan ke atas (0 bila tidak dikunci). */
  sisaMenit: number;
  /** Sisa upaya sebelum dikunci (0 bila sudah dikunci). */
  sisaUpaya: number;
}

/** Cek status kunci sebuah username (tanpa efek samping). */
export function cekKunciLogin(username: unknown): StatusKunci {
  const kunci = normalisasi(username);
  if (!kunci) return { terkunci: false, sisaMenit: 0, sisaUpaya: LOGIN_MAX_GAGAL };
  const cat = bacaPeta()[kunci];
  if (!cat) return { terkunci: false, sisaMenit: 0, sisaUpaya: LOGIN_MAX_GAGAL };
  if (cat.kunciSampai && cat.kunciSampai > Date.now()) {
    return {
      terkunci: true,
      sisaMenit: Math.max(1, Math.ceil((cat.kunciSampai - Date.now()) / 60000)),
      sisaUpaya: 0,
    };
  }
  return { terkunci: false, sisaMenit: 0, sisaUpaya: Math.max(0, LOGIN_MAX_GAGAL - (cat.gagal || 0)) };
}

/** Catat satu kegagalan login. Mengembalikan status terbaru (mungkin baru dikunci). */
export function catatGagalLogin(username: unknown): StatusKunci {
  const kunci = normalisasi(username);
  const peta = bacaPeta();
  const cat: CatatanKunci = peta[kunci] || { gagal: 0, kunciSampai: 0 };
  // Kunci kedaluwarsa → hitungan diulang dari 1.
  const gagalBaru = cat.kunciSampai && cat.kunciSampai <= Date.now() ? 1 : (cat.gagal || 0) + 1;
  const berikutnya: CatatanKunci = { gagal: gagalBaru, kunciSampai: cat.kunciSampai || 0 };
  if (gagalBaru >= LOGIN_MAX_GAGAL) {
    berikutnya.kunciSampai = Date.now() + LOGIN_KUNCI_MENIT * 60000;
  }
  peta[kunci] = berikutnya;
  tulisPeta(peta);
  return cekKunciLogin(username);
}

/** Catat login sukses — menghapus hitungan gagal username tersebut. */
export function catatSuksesLogin(username: unknown): void {
  const kunci = normalisasi(username);
  if (!kunci) return;
  const peta = bacaPeta();
  if (peta[kunci]) {
    delete peta[kunci];
    tulisPeta(peta);
  }
}

/** Buka kunci paksa (dipakai admin saat reset password). */
export function bukaKunciLogin(username: unknown): void {
  catatSuksesLogin(username);
}
