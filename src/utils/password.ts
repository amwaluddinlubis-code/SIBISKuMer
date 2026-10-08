// ---------------- HASH KATA SANDI ----------------
// PBKDF2-HMAC-SHA256 via WebCrypto bila tersedia (konteks aman: localhost/HTTPS).
// Fallback SHA-256 iterasi murni-TypeScript bila `crypto.subtle` tidak ada
// (mis. diakses via http://IP-LAN yang bukan konteks aman) — tanpa dependensi.
//
// Format simpan:
//   "pbkdf2-sha256$<iter>$<saltB64>$<hashB64>"  (jalur utama)
//   "sha256-iter$<iter>$<saltHex>$<hashHex>"    (jalur fallback)
// Nilai lain (tanpa prefix) dianggap LEGACY plaintext dan tetap diterima saat
// verifikasi agar database lama termigrasi transparan (lihat `verifyPassword`).
//
// Modul ini bebas-dependensi (hanya tipe) agar dapat dipakai db.ts tanpa siklus impor.

import type { AppUser } from '../types';

const PBKDF2_ITER = 100000;
const FALLBACK_ITER = 20000;
const SALT_LEN = 16;

function hasSubtle(): boolean {
  try {
    return (
      typeof crypto !== 'undefined' &&
      !!crypto.subtle &&
      typeof crypto.subtle.importKey === 'function'
    );
  } catch {
    return false;
  }
}

function randomBytes(len: number): Uint8Array {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return buf;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    const h = bytes[i].toString(16);
    s += h.length === 1 ? '0' + h : h;
  }
  return s;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function strToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function constTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- SHA-256 murni (untuk jalur fallback) ----------
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function sha256Bytes(data: Uint8Array): Uint8Array {
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const bitLenHi = Math.floor(data.length / 0x20000000);
  const bitLenLo = data.length * 8;
  const paddedLen = (((data.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[data.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(paddedLen - 8, bitLenHi >>> 0, false);
  dv.setUint32(paddedLen - 4, bitLenLo >>> 0, false);

  const w = new Uint32Array(64);
  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 =
        ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^
        ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^
        (w[i - 15] >>> 3);
      const s1 =
        ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^
        ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^
        (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + SHA256_K[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, h0 >>> 0, false);
  odv.setUint32(4, h1 >>> 0, false);
  odv.setUint32(8, h2 >>> 0, false);
  odv.setUint32(12, h3 >>> 0, false);
  odv.setUint32(16, h4 >>> 0, false);
  odv.setUint32(20, h5 >>> 0, false);
  odv.setUint32(24, h6 >>> 0, false);
  odv.setUint32(28, h7 >>> 0, false);
  return out;
}

function sha256HexString(s: string): string {
  return bytesToHex(sha256Bytes(strToBytes(s)));
}

// ---------- API publik ----------

/** True bila nilai sudah dalam format hash (pbkdf2 / fallback), bukan plaintext. */
export function isHashedPassword(v: unknown): boolean {
  if (typeof v !== 'string' || !v) return false;
  return v.startsWith('pbkdf2-sha256$') || v.startsWith('sha256-iter$');
}

async function hashPbkdf2(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await crypto.subtle.importKey('raw', strToBytes(plain), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    key,
    256
  );
  return `pbkdf2-sha256$${PBKDF2_ITER}$${bytesToB64(salt)}$${bytesToB64(new Uint8Array(bits))}`;
}

function hashFallback(plain: string): string {
  const saltHex = bytesToHex(randomBytes(SALT_LEN));
  let h = sha256HexString(saltHex + '$' + plain);
  for (let i = 1; i < FALLBACK_ITER; i++) h = sha256HexString(h + '$' + saltHex + '$' + plain);
  return `sha256-iter$${FALLBACK_ITER}$${saltHex}$${h}`;
}

/** Hash kata sandi baru. Melempar bila kosong. */
export async function hashPassword(plain: string): Promise<string> {
  const pw = (plain || '').trim();
  if (!pw) throw new Error('Kata sandi tidak boleh kosong.');
  if (hasSubtle()) return hashPbkdf2(pw);
  return hashFallback(pw);
}

async function verifyPbkdf2(plain: string, iter: number, saltB64: string, hashB64: string): Promise<boolean> {
  try {
    const salt = b64ToBytes(saltB64);
    const key = await crypto.subtle.importKey('raw', strToBytes(plain), 'PBKDF2', false, [
      'deriveBits',
    ]);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
      key,
      256
    );
    return constTimeEqualHex(bytesToB64(new Uint8Array(bits)), hashB64);
  } catch {
    return false;
  }
}

function verifyFallback(plain: string, iter: number, saltHex: string, hashHex: string): boolean {
  try {
    let h = sha256HexString(saltHex + '$' + plain);
    for (let i = 1; i < iter; i++) h = sha256HexString(h + '$' + saltHex + '$' + plain);
    return constTimeEqualHex(h, hashHex);
  } catch {
    return false;
  }
}

export interface VerifyResult {
  ok: boolean;
  /** True bila cocok sebagai LEGACY plaintext — panggil `hashPassword` lalu simpan ulang. */
  legacy: boolean;
}

/**
 * Verifikasi kata sandi terhadap nilai tersimpan (hash modern ATAU legacy plaintext).
 * Tidak pernah melempar untuk input normal; return { ok:false } bila tidak cocok.
 */
export async function verifyPassword(plain: unknown, stored: unknown): Promise<VerifyResult> {
  const pw = typeof plain === 'string' ? plain.trim() : '';
  if (!pw || typeof stored !== 'string' || !stored) return { ok: false, legacy: false };
  if (stored.startsWith('pbkdf2-sha256$')) {
    if (!hasSubtle()) return { ok: false, legacy: false };
    const [, iterS, saltB64, hashB64] = stored.split('$');
    const iter = Number(iterS) || PBKDF2_ITER;
    const ok = await verifyPbkdf2(pw, iter, saltB64 || '', hashB64 || '');
    return { ok, legacy: false };
  }
  if (stored.startsWith('sha256-iter$')) {
    const [, iterS, saltHex, hashHex] = stored.split('$');
    const iter = Number(iterS) || FALLBACK_ITER;
    const ok = verifyFallback(pw, iter, saltHex || '', hashHex || '');
    return { ok, legacy: false };
  }
  // LEGACY: plaintext lama — cocokkan langsung agar migrasi transparan.
  return { ok: stored === pw, legacy: stored === pw };
}

/**
 * Siapkan daftar user untuk disimpan: yang masih plaintext di-hash,
 * yang sudah hash dibiarkan. Mengembalikan salinan baru (input tidak diubah).
 */
export async function withHashedPasswords(users: AppUser[]): Promise<AppUser[]> {
  const out: AppUser[] = [];
  for (const u of users || []) {
    if (!u) continue;
    if (u.password && !isHashedPassword(u.password)) {
      out.push({ ...u, password: await hashPassword(u.password) });
    } else {
      out.push(u);
    }
  }
  return out;
}
