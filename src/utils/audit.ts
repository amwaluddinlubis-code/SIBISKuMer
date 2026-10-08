// ---------------- AUDIT LOG (jejak siapa-ubah-apa) ----------------
// Penulis tunggal ke store audit_logs (`db.ts`). Aktor diambil dari sesi aktif;
// aman dipanggil kapan pun (gagal tulis = diabaikan, tidak melempar).

import type { AppUser, AuditAksi, AuditLog } from '../types';
import { addAuditLog, getCurrentUserSession } from './db';

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
}

/** Catat satu peristiwa audit. Tidak pernah melempar. */
export function catatAudit(aksi: AuditAksi, opsi: CatatAuditOpsi): void {
  try {
    const auto = aktorAktif();
    const entry: AuditLog = {
      id: idBaru('aud'),
      timestamp: new Date().toISOString(),
      aktor: opsi.aktor || auto.aktor,
      peran: opsi.peran !== undefined ? opsi.peran : auto.peran,
      aksi,
      entitas: opsi.entitas,
      entitasId: opsi.entitasId,
      ringkasan: opsi.ringkasan,
      detail: opsi.detail,
    };
    void addAuditLog(entry).catch(() => undefined);
  } catch {
    /* audit tidak boleh merusak alur utama */
  }
}
