// ---------------- CADANGAN OTOMATIS (snapshot terjadwal di IndexedDB) ----------------
// Penjadwal dipanggil dari App (interval ringan tiap menit). Snapshot = JSON
// BackupPayload penuh; disimpan di store auto_backup (maks 5 terbaru).
// Browser tidak bisa menulis file diam-diam, sehingga snapshot internal +
// tombol unduh manual adalah pola yang andal.

import type { AutoBackupSetting, AutoBackupSnapshot } from '../types';
import {
  exportAllData,
  getAllSiswa,
  getAutoSnapshots,
  saveAutoSnapshot,
  scopedStorageKey,
  storageKeys,
} from './db';

export const AUTOBACKUP_PILIHAN_MENIT = [15, 30, 60, 120, 240];
export const AUTOBACKUP_DEFAULT_MENIT = 60;

export function bacaAutoBackupSetting(): AutoBackupSetting {
  const bawaan: AutoBackupSetting = { aktif: true, intervalMenit: AUTOBACKUP_DEFAULT_MENIT };
  try {
    const raw = localStorage.getItem(scopedStorageKey(storageKeys.AUTOBACKUP_CFG));
    if (!raw) return bawaan;
    const parsed = JSON.parse(raw) as Partial<AutoBackupSetting>;
    const interval = Number(parsed.intervalMenit);
    return {
      aktif: parsed.aktif !== false,
      intervalMenit: AUTOBACKUP_PILIHAN_MENIT.includes(interval) ? interval : AUTOBACKUP_DEFAULT_MENIT,
      terakhirJalan: typeof parsed.terakhirJalan === 'string' ? parsed.terakhirJalan : null,
      terakhirStatus: typeof parsed.terakhirStatus === 'string' ? parsed.terakhirStatus : null,
    };
  } catch {
    return bawaan;
  }
}

export function simpanAutoBackupSetting(patch: Partial<AutoBackupSetting>): AutoBackupSetting {
  const dasar = bacaAutoBackupSetting();
  const interval = Number(patch.intervalMenit);
  const berikutnya: AutoBackupSetting = {
    ...dasar,
    ...patch,
    intervalMenit:
      patch.intervalMenit === undefined
        ? dasar.intervalMenit
        : AUTOBACKUP_PILIHAN_MENIT.includes(interval)
          ? interval
          : AUTOBACKUP_DEFAULT_MENIT,
  };
  try {
    localStorage.setItem(scopedStorageKey(storageKeys.AUTOBACKUP_CFG), JSON.stringify(berikutnya));
  } catch {
    /* abaikan */
  }
  return berikutnya;
}

export interface HasilAutoBackup {
  jalan: boolean;
  snapshotId?: string;
  pesan: string;
}

function idBaru(): string {
  return `auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Buat satu snapshot sekarang (dipakai penjadwal & tombol manual). */
export async function jalankanAutoBackup(dibuatOleh = 'penjadwal'): Promise<HasilAutoBackup> {
  let siswa: Awaited<ReturnType<typeof getAllSiswa>> = [];
  try {
    siswa = await getAllSiswa();
  } catch {
    return { jalan: false, pesan: 'Database tidak dapat dibaca.' };
  }
  if (siswa.length === 0) {
    return { jalan: false, pesan: 'Database kosong — snapshot dilewati.' };
  }
  try {
    const payload = await exportAllData();
    const snap: AutoBackupSnapshot = {
      id: idBaru(),
      timestamp: new Date().toISOString(),
      dibuatOleh,
      ukuranBytes: new Blob([payload]).size,
      jumlahSiswa: siswa.length,
      payload,
    };
    await saveAutoSnapshot(snap);
    simpanAutoBackupSetting({
      terakhirJalan: snap.timestamp,
      terakhirStatus: `OK — ${siswa.length} siswa`,
    });
    return { jalan: true, snapshotId: snap.id, pesan: `Snapshot ${siswa.length} siswa tersimpan.` };
  } catch (err: unknown) {
    const pesan = err instanceof Error ? err.message : String(err);
    simpanAutoBackupSetting({ terakhirStatus: `Gagal: ${pesan.slice(0, 80)}` });
    return { jalan: false, pesan };
  }
}

/**
 * Dipanggil penjadwal tiap menit. Mengembalikan hasil bila snapshot dibuat,
 * atau null bila belum waktunya / nonaktif / tab tersembunyi.
 */
export async function centangAutoBackup(): Promise<HasilAutoBackup | null> {
  const cfg = bacaAutoBackupSetting();
  if (!cfg.aktif) return null;
  if (typeof document !== 'undefined' && document.hidden) return null;
  const terakhir = cfg.terakhirJalan ? new Date(cfg.terakhirJalan).getTime() : 0;
  if (Date.now() - terakhir < cfg.intervalMenit * 60000) return null;
  return jalankanAutoBackup('penjadwal');
}

export async function daftarSnapshot(): Promise<AutoBackupSnapshot[]> {
  try {
    return await getAutoSnapshots();
  } catch {
    return [];
  }
}
