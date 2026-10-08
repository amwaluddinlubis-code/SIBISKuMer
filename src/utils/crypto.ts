// Utilitas kriptografi sisi-klien untuk SIBISKuMer.
// Catatan jujur: aplikasi ini berjalan penuh di browser (PWA offline-first),
// sehingga hashing di sini melindungi dari pembacaan kasual (DevTools/file DB),
// BUKAN pengganti autentikasi server. Jangan pernah menyimpan password plaintext.
//
// S9: fungsi hash SHA-256 SATU-ITERASI (tanpa KDF) beserta verifikasinya DIHAPUS
// dari modul ini — dead code berbahaya. Seluruh hashing password kini hanya
// lewat utils/password.ts (PBKDF2-HMAC-SHA256 100rb iterasi + jalur fallback
// iterasi). Tidak ada importir fungsi lama (terverifikasi), jadi penghapusan aman.
import { hashPassword as hashPasswordKuat } from './password';
import type { AppUser } from '../types';

/**
 * Migrasi akun lama yang masih menyimpan password plaintext
 * menjadi hash PBKDF2. Mengembalikan objek user baru (tanpa field password).
 */
export async function ensurePasswordHash(
  user: AppUser
): Promise<AppUser & { passwordHash?: string }> {
  const u = user as AppUser & { passwordHash?: string };
  if (u.passwordHash) return u;
  if (u.password) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _legacy, ...rest } = u;
    // S9: memakai KDF yang kuat (PBKDF2 100rb iterasi), bukan SHA-256 1x.
    return { ...rest, passwordHash: await hashPasswordKuat(u.password) };
  }
  return u;
}
