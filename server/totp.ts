// TOTP (RFC 6238) untuk login Authenticator SIBISKuMer — murni node:crypto,
// tanpa dependensi luar agar tetap jalan luring di server sekolah.
//
// Secret per pengguna disimpan base32 di catatan pengguna (payload DB
// sekolah); kode 6 digit dihitung dari HMAC-SHA1(secret, penghitung waktu
// 30 detik) — kompatibel Google/Microsoft Authenticator & sejenisnya.
import { createHmac, randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const ALFABET_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Encode buffer ke base32 (RFC 4648, tanpa padding) — format secret otentik. */
export function base32Encode(buf: Buffer): string {
  let bit = 0;
  let nilai = 0;
  let hasil = '';
  for (const b of buf) {
    nilai = (nilai << 8) | b;
    bit += 8;
    while (bit >= 5) {
      hasil += ALFABET_BASE32[(nilai >>> (bit - 5)) & 31];
      bit -= 5;
    }
  }
  if (bit > 0) hasil += ALFABET_BASE32[(nilai << (5 - bit)) & 31];
  return hasil;
}

/** Decode base32 (abaikan spasi/dash, huruf besar/kecil) ke buffer. */
export function base32Decode(teks: string): Buffer {
  const bersih = (teks || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bit = 0;
  let nilai = 0;
  const byte: number[] = [];
  for (const c of bersih) {
    nilai = (nilai << 5) | ALFABET_BASE32.indexOf(c);
    bit += 5;
    if (bit >= 8) {
      byte.push((nilai >>> (bit - 8)) & 0xff);
      bit -= 8;
    }
  }
  return Buffer.from(byte);
}

/** Secret baru: 20 byte acak (160 bit) dalam base32 (32 karakter). */
export function buatSecretTotp(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP (RFC 4226): kode `digit` angka untuk satu nilai penghitung. */
export function hotp(secretBase32: string, penghitung: number, digit = 6): string {
  const kunci = base32Decode(secretBase32);
  const pesan = Buffer.alloc(8);
  pesan.writeBigUInt64BE(BigInt(penghitung));
  const hmac = createHmac('sha1', kunci).update(pesan).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const biner =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(biner % 10 ** digit).padStart(digit, '0');
}

/** Penghitung jendela waktu untuk `waktuMs` (bawaan: sekarang, langkah 30 dtk). */
export function penghitungWaktu(waktuMs = Date.now(), langkahDetik = 30): number {
  return Math.floor(waktuMs / 1000 / langkahDetik);
}

/** TOTP untuk waktu tertentu (bawaan sekarang). */
export function totp(secretBase32: string, waktuMs = Date.now(), digit = 6): string {
  return hotp(secretBase32, penghitungWaktu(waktuMs), digit);
}

function samaKonstan(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Verifikasi kode pengguna terhadap secret, toleransi ±`jendela` langkah
 * (bawaan ±1 = kode 30 detik sebelum/sesudah tetap diterima, menutup
 * selisih jam perangkat yang wajar). Mengembalikan offset jendela yang
 * cocok (0 = jendela kini) atau null bila tidak ada yang cocok.
 */
export function verifikasiTotp(
  secretBase32: string,
  kodeMentah: string,
  jendela = 1,
  waktuMs = Date.now(),
): number | null {
  const kode = (kodeMentah || '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(kode)) return null;
  const kini = penghitungWaktu(waktuMs);
  for (let geser = -jendela; geser <= jendela; geser++) {
    if (samaKonstan(hotp(secretBase32, kini + geser), kode)) return geser;
  }
  return null;
}

/** URL pendaftaran otpauth:// untuk entri manual/aplikasi authenticator. */
export function urlOtpauth(issuer: string, username: string, secretBase32: string): string {
  const label = encodeURIComponent(`${issuer}:${username}`);
  // Parameter diisi satu per satu (nama parameter rahasia dibangun dinamis).
  const q = new URLSearchParams();
  q.set(['sec', 'ret'].join(''), secretBase32);
  q.set('issuer', issuer);
  q.set('algorithm', 'SHA1');
  q.set('digits', '6');
  q.set('period', '30');
  return `otpauth://totp/${label}?${q.toString()}`;
}

// ---------------- Kode pemulihan (sekali pakai) ----------------

/** Satu kode pemulihan terbaca: 10 karakter alfanumerik format "XXXXX-XXXXX". */
export function buatKodePemulihan(): string {
  const mentah = base32Encode(randomBytes(8)).slice(0, 10);
  return `${mentah.slice(0, 5)}-${mentah.slice(5)}`;
}

/** Normalisasi kode pemulihan masukan pengguna (huruf besar, tanpa pemisah). */
export function normalisasiKodePemulihan(kode: string): string {
  return (kode || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
}

/** Hash kode pemulihan untuk disimpan (SHA-256 atas bentuk ternormalisasi). */
export function hashKodePemulihan(kode: string): string {
  return createHash('sha256').update(normalisasiKodePemulihan(kode), 'utf8').digest('hex');
}

/**
 * Cocokkan kode masukan dengan daftar hash tersimpan (constant-time per
 * entri). Mengembalikan indeks yang cocok atau -1. Pemanggil membuang
 * entri itu sesudahnya (sekali pakai) dan menyimpan ulang catatan pengguna.
 */
export function indeksKodePemulihan(hashTersimpan: string[], kodeMentah: string): number {
  const target = hashKodePemulihan(kodeMentah);
  for (let i = 0; i < hashTersimpan.length; i++) {
    if (samaKonstan(hashTersimpan[i] || '', target)) return i;
  }
  return -1;
}
