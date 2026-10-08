// ---------------- Tombstone hapus (LS ter-scope, tanpa dependensi) ----------------
// Dipisah dari cloudSync agar pencatat hapus (App, UserManagementView) tidak
// ikut menyeret Firebase SDK ke bundel utama. CloudSync membaca/menulis
// lewat fungsi yang sama.

import { scopedStorageKey, storageKeys } from './db';

export interface Tombstone {
  coll: string;
  id: string;
  ts: string;
}

export const UMUR_TOMBSTONE_HARI = 30;

export function muatTombstoneLokal(): Tombstone[] {
  try {
    const raw = localStorage.getItem(scopedStorageKey(storageKeys.TOMBSTONE));
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    const batas = Date.now() - UMUR_TOMBSTONE_HARI * 86400000;
    return list.filter(
      (t) => t && t.coll && t.id && t.ts && new Date(t.ts).getTime() >= batas
    );
  } catch {
    return [];
  }
}

export function simpanTombstoneLokal(list: Tombstone[]): void {
  try {
    localStorage.setItem(scopedStorageKey(storageKeys.TOMBSTONE), JSON.stringify(list.slice(0, 2000)));
  } catch {
    /* abaikan */
  }
}

/** Catat hapus agar dirambatkan ke perangkat lain (dipanggil tiap delete). */
export function catatHapusCloud(coll: string, id: string): void {
  if (!coll || !id) return;
  const list = muatTombstoneLokal().filter((t) => !(t.coll === coll && t.id === id));
  list.unshift({ coll, id, ts: new Date().toISOString() });
  simpanTombstoneLokal(list);
}
