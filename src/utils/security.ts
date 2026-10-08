// ---------------- KUNCI LOGIN (brute-force protection, sisi klien) ----------------
// Kebijakan: 5x gagal → akun dikunci 15 menit (per database sekolah).
// Status disimpan di DUA lapisan:
//   1. localStorage ter-scope DB (bertahan saat reload), dan
//   2. IndexedDB (database kecil terpisah 'BukuInduk_Security_DB') — S12.
// Lapisan IndexedDB lebih sulit dihapus pengguna awam dibanding kunci
// localStorage. Kebijakan kunci = GABUNGAN keduanya: terkunci bila SALAH SATU
// lapisan mengatakan terkunci.
// Catatan jujur: ini pengaman lapisan UI — bukan pengganti kontrol server.
// Aplikasi ini offline-first tanpa backend, jadi tidak ada rate-limit sisi
// server; lapisan ganda ini hanya menaikkan biaya serangan kasual, bukan
// pertahanan terhadap penyerang yang paham DevTools/IndexedDB.

import { scopedStorageKey, storageKeys, getActiveDbName } from './db';

export const LOGIN_MAX_GAGAL = 5;
export const LOGIN_KUNCI_MENIT = 15;

interface CatatanKunci {
  gagal: number;
  kunciSampai: number; // epoch ms, 0 = tidak dikunci
}

type PetaKunci = Record<string, CatatanKunci>;

// ---------- Lapisan 1: localStorage ----------
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

// ---------- Lapisan 2: IndexedDB (S12) ----------
// Database terpisah dari DB utama agar tidak perlu menaikkan DB_VERSION /
// mengubah onupgradeneeded di db.ts, dan agar sulit ditemukan pengguna awam.
const IDB_NAMA_DB = 'BukuInduk_Security_DB';
const IDB_NAMA_STORE = 'lockout';
let idbJanji: Promise<IDBDatabase> | null = null;

function bukaIdbKeamanan(): Promise<IDBDatabase> {
  if (idbJanji) return idbJanji;
  idbJanji = new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB tidak tersedia'));
        return;
      }
      const req = indexedDB.open(IDB_NAMA_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_NAMA_STORE)) {
          db.createObjectStore(IDB_NAMA_STORE, { keyPath: 'kunci' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Gagal membuka IndexedDB keamanan'));
    } catch (e) {
      reject(e);
    }
  });
  // Jangan cache kegagalan — pemanggilan berikut boleh mencoba lagi.
  void idbJanji.catch(() => {
    idbJanji = null;
  });
  return idbJanji;
}

/** Kunci record di-scope per database sekolah, cermin dari scopedStorageKey. */
function kunciIdb(username: string): string {
  return `${getActiveDbName()}::${username}`;
}

interface CatatanIdb extends CatatanKunci {
  kunci: string;
}

/** Best-effort: null bila IDB tak tersedia / record tak ada. */
async function bacaCatatanIdb(username: unknown): Promise<CatatanKunci | null> {
  try {
    const kunci = normalisasi(username);
    if (!kunci) return null;
    const db = await bukaIdbKeamanan();
    const hasil: CatatanIdb | undefined = await new Promise((resolve, reject) => {
      const req = db.transaction(IDB_NAMA_STORE, 'readonly').objectStore(IDB_NAMA_STORE).get(kunciIdb(kunci));
      req.onsuccess = () => resolve(req.result as CatatanIdb | undefined);
      req.onerror = () => reject(req.error);
    });
    return hasil ? { gagal: hasil.gagal || 0, kunciSampai: hasil.kunciSampai || 0 } : null;
  } catch {
    return null;
  }
}

/** Best-effort: melempar hanya bila pemanggil tidak menangkap. */
async function tulisCatatanIdb(username: string, cat: CatatanKunci): Promise<void> {
  const db = await bukaIdbKeamanan();
  await new Promise<void>((resolve, reject) => {
    const req = db
      .transaction(IDB_NAMA_STORE, 'readwrite')
      .objectStore(IDB_NAMA_STORE)
      .put({ kunci: kunciIdb(username), gagal: cat.gagal, kunciSampai: cat.kunciSampai } as CatatanIdb);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Best-effort: melempar hanya bila pemanggil tidak menangkap. */
async function hapusCatatanIdb(username: string): Promise<void> {
  const db = await bukaIdbKeamanan();
  await new Promise<void>((resolve, reject) => {
    const req = db
      .transaction(IDB_NAMA_STORE, 'readwrite')
      .objectStore(IDB_NAMA_STORE)
      .delete(kunciIdb(username));
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------- Logika status ----------
export interface StatusKunci {
  terkunci: boolean;
  /** Sisa menit pembulatan ke atas (0 bila tidak dikunci). */
  sisaMenit: number;
  /** Sisa upaya sebelum dikunci (0 bila sudah dikunci). */
  sisaUpaya: number;
}

function statusDariCatatan(cat: CatatanKunci | null | undefined): StatusKunci {
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

/** S12: gabungan dua lapisan — terkunci bila SALAH SATU mengatakan terkunci. */
function gabungStatus(a: StatusKunci, b: StatusKunci): StatusKunci {
  return {
    terkunci: a.terkunci || b.terkunci,
    sisaMenit: Math.max(a.sisaMenit, b.sisaMenit),
    sisaUpaya: Math.min(a.sisaUpaya, b.sisaUpaya),
  };
}

function hitungBerikutnya(cat: CatatanKunci | undefined): CatatanKunci {
  const c = cat || { gagal: 0, kunciSampai: 0 };
  // Kunci kedaluwarsa → hitungan diulang dari 1.
  const gagalBaru = c.kunciSampai && c.kunciSampai <= Date.now() ? 1 : (c.gagal || 0) + 1;
  const berikutnya: CatatanKunci = { gagal: gagalBaru, kunciSampai: c.kunciSampai || 0 };
  if (gagalBaru >= LOGIN_MAX_GAGAL) {
    berikutnya.kunciSampai = Date.now() + LOGIN_KUNCI_MENIT * 60000;
  }
  return berikutnya;
}

/** Cek status kunci sebuah username (lapisan localStorage saja, tanpa efek samping). */
export function cekKunciLogin(username: unknown): StatusKunci {
  const kunci = normalisasi(username);
  if (!kunci) return { terkunci: false, sisaMenit: 0, sisaUpaya: LOGIN_MAX_GAGAL };
  return statusDariCatatan(bacaPeta()[kunci]);
}

/** S12: cek status kunci GABUNGAN localStorage + IndexedDB (tanpa efek samping). */
export async function cekKunciLoginAsync(username: unknown): Promise<StatusKunci> {
  const dariLS = cekKunciLogin(username);
  const catIdb = await bacaCatatanIdb(username);
  return gabungStatus(dariLS, statusDariCatatan(catIdb));
}

/** Catat satu kegagalan login. Mengembalikan status terbaru (mungkin baru dikunci). */
export function catatGagalLogin(username: unknown): StatusKunci {
  const kunci = normalisasi(username);
  const peta = bacaPeta();
  const berikutnya = hitungBerikutnya(peta[kunci]);
  peta[kunci] = berikutnya;
  tulisPeta(peta);
  // S12: cerminkan ke IndexedDB (best-effort, tanpa memblokir alur sinkron).
  if (kunci) void tulisCatatanIdb(kunci, berikutnya).catch(() => {});
  return cekKunciLogin(username);
}

/** S12: catat kegagalan ke KEDUA lapisan, lalu kembalikan status gabungan. */
export async function catatGagalLoginAsync(username: unknown): Promise<StatusKunci> {
  const kunci = normalisasi(username);
  const peta = bacaPeta();
  const berikutnya = hitungBerikutnya(peta[kunci]);
  peta[kunci] = berikutnya;
  tulisPeta(peta);
  if (kunci) {
    // Pastikan tulisan IDB selesai sebelum status gabungan dibaca.
    await tulisCatatanIdb(kunci, berikutnya).catch(() => {});
  }
  return cekKunciLoginAsync(username);
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
  // S12: hapus juga catatan IndexedDB (best-effort, tanpa memblokir).
  void hapusCatatanIdb(kunci).catch(() => {});
}

/** S12: hapus hitungan gagal di KEDUA lapisan. */
export async function catatSuksesLoginAsync(username: unknown): Promise<void> {
  catatSuksesLogin(username);
  const kunci = normalisasi(username);
  if (kunci) {
    await hapusCatatanIdb(kunci).catch(() => {});
  }
}

/** Buka kunci paksa (dipakai admin saat reset password). */
export function bukaKunciLogin(username: unknown): void {
  catatSuksesLogin(username);
}
