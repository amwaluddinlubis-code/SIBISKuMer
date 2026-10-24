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
import { pakaiServer } from './modeData';
import { buatSnapshotBerkasServer } from './dataApi';

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
  if (pakaiServer()) {
    // S4: snapshot = berkas .db di server (VACUUM INTO), bukan JSON di
    // IndexedDB. Penjadwal berkala di mode server dijalankan server
    // sendiri (harian); fungsi ini melayani tombol manual.
    try {
      const meta = await buatSnapshotBerkasServer(dibuatOleh === 'penjadwal' ? 'otomatis' : dibuatOleh);
      const jumlah = meta.hitungan?.siswa ?? 0;
      simpanAutoBackupSetting({
        terakhirJalan: meta.dibuatPada,
        terakhirStatus: `OK (server) — ${jumlah} siswa`,
      });
      return { jalan: true, snapshotId: meta.nama, pesan: `Snapshot berkas server tersimpan (${jumlah} siswa).` };
    } catch (err: unknown) {
      const pesan = err instanceof Error ? err.message : String(err);
      simpanAutoBackupSetting({ terakhirStatus: `Gagal (server): ${pesan.slice(0, 80)}` });
      return { jalan: false, pesan };
    }
  }
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
  // Mode server: snapshot berkala dibuat server (harian) — penjadwal
  // peramban tidak membuat duplikat di IndexedDB.
  if (pakaiServer()) return null;
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

export interface StatusBackupTerakhir {
  /** ISO waktu backup terakhir dari SUMBER TUNGGAL: snapshot IndexedDB
   *  terbaru; catatan setting hanya cadangan bila snapshot kosong. */
  waktu: string | null;
  /** Jumlah siswa di dalam snapshot terakhir (null = tak ada snapshot). */
  jumlahSiswaSnapshot: number | null;
  status: string | null;
}

/**
 * SATU SUMBER status backup (QA Fase 1.6): Dasbor, modul Backup, dan
 * gerbang Tutup Tahun membaca fungsi ini — bukan sumber masing-masing.
 * Dulu Dasbor hanya membaca catatan setting di localStorage sehingga bisa
 * menyatakan "belum pernah ada backup" padahal snapshot IndexedDB ada
 * (dan sebaliknya tidak tahu snapshot sudah kedaluwarsa oleh perubahan
 * jumlah siswa).
 */
export async function statusBackupTerakhir(): Promise<StatusBackupTerakhir> {
  const cfg = bacaAutoBackupSetting();
  const snaps = await daftarSnapshot();
  const terbaru = snaps[0];
  if (terbaru) {
    return {
      waktu: terbaru.timestamp,
      jumlahSiswaSnapshot: terbaru.jumlahSiswa,
      status: cfg.terakhirStatus ?? null,
    };
  }
  return {
    waktu: cfg.terakhirJalan ?? null,
    jumlahSiswaSnapshot: null,
    status: cfg.terakhirStatus ?? null,
  };
}
