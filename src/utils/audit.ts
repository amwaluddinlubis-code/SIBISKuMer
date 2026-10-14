// ---------------- AUDIT LOG (jejak siapa-ubah-apa) ----------------
// Penulis tunggal ke store audit_logs (`db.ts`). Aktor diambil dari sesi aktif;
// aman dipanggil kapan pun (gagal tulis = diabaikan, tidak melempar).
//
// Jaminan issue #9:
// - Append-only: TIDAK ada API ubah/hapus entri (fungsi clear dihapus).
// - Tiap entri dicap `sekolahId` sekolah aktif (isolasi antar-sekolah).
// - `sebelum`/`sesudah` hanya berisi field operasional allowlist yang
//   berubah, dan selalu melewati sanitasi (tanpa rahasia / data pribadi
//   berlebihan) — lihat `auditSanitasi.ts`.

import type { AppUser, AuditAksi, AuditLog } from '../types';
import { addAuditLog, getActiveSchoolId, getCurrentUserSession, isAdministrator } from './db';
import { diffAudit, sanitasiNilaiAudit, sanitasiTeksAudit } from './auditSanitasi';

export { diffAudit };

function aktorAktif(): { aktor: string; peran?: string } {
  try {
    const u: AppUser | null = getCurrentUserSession();
    if (u && u.username) return { aktor: u.username, peran: u.role };
  } catch {
    /* abaikan */
  }
  return { aktor: 'sistem' };
}

function idBaru(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `${prefix}-${(crypto as Crypto).randomUUID()}`;
    }
  } catch {
    /* fallback di bawah */
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface CatatAuditOpsi {
  entitas: string;
  entitasId?: string;
  ringkasan: string;
  detail?: string;
  /** Timpa aktor otomatis (mis. username yang gagal login). */
  aktor?: string;
  peran?: string;
  /** Hasil tindakan; default 'berhasil'. Kegagalan relevan WAJIB 'gagal'. */
  hasil?: 'berhasil' | 'gagal';
  /** Nilai sebelum/sesudah perubahan — WAJIB sudah hasil `diffAudit`
   *  (allowlist + tersanitasi). Nilai mentah di sini tetap disanitasi
   *  sebagai pertahanan berlapis, tapi field di luar allowlist tidak
   *  dipangkas di sini — tanggung jawab pemanggil memakai `diffAudit`. */
  sebelum?: Record<string, unknown>;
  sesudah?: Record<string, unknown>;
}

/** Catat satu peristiwa audit. Tidak pernah melempar. */
export function catatAudit(aksi: AuditAksi, opsi: CatatAuditOpsi): void {
  try {
    const auto = aktorAktif();
    let sekolahId: string | undefined;
    try {
      sekolahId = getActiveSchoolId() || undefined;
    } catch {
      sekolahId = undefined;
    }
    const entry: AuditLog = {
      id: idBaru('aud'),
      timestamp: new Date().toISOString(),
      aktor: opsi.aktor || auto.aktor,
      peran: opsi.peran !== undefined ? opsi.peran : auto.peran,
      aksi,
      entitas: opsi.entitas,
      entitasId: opsi.entitasId,
      ringkasan: sanitasiTeksAudit(opsi.ringkasan),
      detail: opsi.detail !== undefined ? sanitasiTeksAudit(opsi.detail) : undefined,
      sekolahId,
      hasil: opsi.hasil || 'berhasil',
      sebelum:
        opsi.sebelum !== undefined
          ? (sanitasiNilaiAudit(opsi.sebelum) as Record<string, unknown>)
          : undefined,
      sesudah:
        opsi.sesudah !== undefined
          ? (sanitasiNilaiAudit(opsi.sesudah) as Record<string, unknown>)
          : undefined,
    };
    void addAuditLog(entry).catch(() => undefined);
  } catch {
    /* audit tidak boleh merusak alur utama */
  }
}

/**
 * Gerbang akses baca audit log: HANYA administrator. Dipakai App.tsx
 * untuk menampilkan tab Log Audit dan diuji regresi di `tests/`.
 */
export function bolehMelihatAuditLog(user: AppUser | null | undefined): boolean {
  return isAdministrator(user);
}
