// Utilitas kriptografi sisi-klien untuk SIBISKuMer.
// Catatan jujur: aplikasi ini berjalan penuh di browser (PWA offline-first),
// sehingga hashing di sini melindungi dari pembacaan kasual (DevTools/file DB),
// BUKAN pengganti autentikasi server. Jangan pernah menyimpan password plaintext.
import { AppUser } from '../types';

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function ensureSubtle(): SubtleCrypto {
  if (!crypto?.subtle) {
    throw new Error(
      'WebCrypto tidak tersedia. Buka aplikasi via HTTPS atau http://localhost agar fitur keamanan aktif.'
    );
  }
  return crypto.subtle;
}

/** Hash password dengan SHA-256 + salt acak. Format: "sha256$<saltHex>$<hashHex>". */
export async function hashPassword(password: string): Promise<string> {
  const subtle = ensureSubtle();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const data = new TextEncoder().encode(`${toHex(salt)}:${password}`);
  const hash = await subtle.digest('SHA-256', data);
  return `sha256$${toHex(salt)}$${toHex(hash)}`;
}

/** Verifikasi password terhadap hash (perbandingan waktu-konstan). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const subtle = ensureSubtle();
    const parts = stored.split('$');
    if (parts.length !== 3 || parts[0] !== 'sha256') return false;
    const data = new TextEncoder().encode(`${parts[1]}:${password}`);
    const hash = await subtle.digest('SHA-256', data);
    const a = toHex(hash);
    const b = parts[2];
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

/**
 * Migrasi akun lama yang masih menyimpan password plaintext
 * menjadi passwordHash. Mengembalikan objek user baru (tanpa field password).
 */
export async function ensurePasswordHash(user: AppUser): Promise<AppUser> {
  if (user.passwordHash) return user;
  if (user.password) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _legacy, ...rest } = user;
    return { ...rest, passwordHash: await hashPassword(user.password) };
  }
  return user;
}
