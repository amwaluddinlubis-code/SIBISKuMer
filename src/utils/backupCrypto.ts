// Enkripsi file cadangan (backup) SIBISKuMer dengan password.
// Algoritma: PBKDF2-SHA256 (250.000 iterasi) -> AES-GCM 256-bit.
// Format envelope JSON: { v:1, alg, iter, salt(b64), iv(b64), data(b64) }.

const ITERATIONS = 250_000;

function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64decode(b64: string): Uint8Array {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

function ensureSubtle(): SubtleCrypto {
  if (!crypto?.subtle) {
    throw new Error('WebCrypto tidak tersedia. Buka aplikasi via HTTPS atau http://localhost.');
  }
  return crypto.subtle;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = ensureSubtle();
  const baseKey = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Enkripsi teks (JSON backup) menjadi envelope string. */
export async function encryptBackup(plainText: string, password: string): Promise<string> {
  if (!password || password.length < 8) {
    throw new Error('Password enkripsi minimal 8 karakter.');
  }
  const subtle = ensureSubtle();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipher = await subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(plainText));
  const envelope = {
    v: 1,
    alg: 'PBKDF2-SHA256_AES-GCM-256',
    iter: ITERATIONS,
    salt: b64encode(salt),
    iv: b64encode(iv),
    data: b64encode(cipher),
    app: 'SIBISKuMer',
    encryptedAt: new Date().toISOString(),
  };
  return JSON.stringify(envelope);
}

/** Dekripsi envelope kembali menjadi teks asli. Gagal bila password salah. */
export async function decryptBackup(envelopeText: string, password: string): Promise<string> {
  const subtle = ensureSubtle();
  let env: any;
  try {
    env = JSON.parse(envelopeText);
  } catch {
    throw new Error('File bukan cadangan terenkripsi yang valid.');
  }
  if (!env || env.v !== 1 || !env.salt || !env.iv || !env.data) {
    throw new Error('Format cadangan terenkripsi tidak dikenali.');
  }
  const key = await deriveKey(password, b64decode(env.salt));
  try {
    const plain = await subtle.decrypt(
      { name: 'AES-GCM', iv: b64decode(env.iv) as BufferSource },
      key,
      b64decode(env.data) as BufferSource
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error('Password salah atau file rusak.');
  }
}

/** Deteksi apakah teks adalah cadangan terenkripsi (bukan JSON backup biasa). */
export function isEncryptedBackup(text: string): boolean {
  try {
    const env = JSON.parse(text);
    return !!env && env.v === 1 && typeof env.data === 'string' && typeof env.salt === 'string';
  } catch {
    return false;
  }
}
