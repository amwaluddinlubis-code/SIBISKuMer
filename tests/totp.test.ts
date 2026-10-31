/**
 * Tes TOTP login Authenticator (server/totp.ts) terhadap vektor uji resmi
 * RFC 6238 Appendix B (seed ASCII "12345678901234567890", SHA-1, 8 digit)
 * + perilaku jendela toleransi dan kode pemulihan sekali pakai.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  base32Encode,
  base32Decode,
  buatSecretTotp,
  hotp,
  totp,
  verifikasiTotp,
  urlOtpauth,
  buatKodePemulihan,
  hashKodePemulihan,
  indeksKodePemulihan,
  normalisasiKodePemulihan,
} from '../server/totp';

const SEED_B32 = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('base32', () => {
  test('encode seed RFC 6238 + decode pulang-pergi', () => {
    assert.equal(SEED_B32, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    assert.equal(base32Decode(SEED_B32).toString('ascii'), '12345678901234567890');
    assert.equal(base32Decode('gezd gnbv-gy3tqojq').length > 0, true);
  });

  test('secret baru 32 karakter base32 dan unik', () => {
    const a = buatSecretTotp();
    const b = buatSecretTotp();
    assert.match(a, /^[A-Z2-7]{32}$/);
    assert.notEqual(a, b);
  });
});

describe('TOTP vektor RFC 6238 (SHA-1, 8 digit)', () => {
  const vektor: Array<[number, string]> = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];
  for (const [detik, kode] of vektor) {
    test(`T=${detik} -> ${kode}`, () => {
      assert.equal(totp(SEED_B32, detik * 1000, 8), kode);
    });
  }

  test('hotp penghitung 1 sama dengan T=59', () => {
    assert.equal(hotp(SEED_B32, 1, 8), '94287082');
  });
});

describe('verifikasiTotp', () => {
  const t0 = 1700000000 * 1000; // jendela bulat sembarang
  test('kode jendela kini diterima (offset 0), 6 digit', () => {
    const kode = totp(SEED_B32, t0);
    assert.equal(kode.length, 6);
    assert.equal(verifikasiTotp(SEED_B32, kode, 1, t0), 0);
  });

  test('kode jendela sebelum/sesudah diterima dalam toleransi ±1', () => {
    const sebelum = totp(SEED_B32, t0 - 30000);
    const sesudah = totp(SEED_B32, t0 + 30000);
    assert.equal(verifikasiTotp(SEED_B32, sebelum, 1, t0), -1);
    assert.equal(verifikasiTotp(SEED_B32, sesudah, 1, t0), 1);
  });

  test('kode dua jendela jauhnya ditolak; kode acak ditolak; format salah ditolak', () => {
    const jauh = totp(SEED_B32, t0 + 60000);
    assert.equal(verifikasiTotp(SEED_B32, jauh, 1, t0), null);
    assert.equal(verifikasiTotp(SEED_B32, '000000', 1, t0) === null || totp(SEED_B32, t0) === '000000', true);
    assert.equal(verifikasiTotp(SEED_B32, '12ab', 1, t0), null);
    assert.equal(verifikasiTotp(SEED_B32, '', 1, t0), null);
  });

  test('spasi pada kode ditoleransi', () => {
    const kode = totp(SEED_B32, t0);
    assert.equal(verifikasiTotp(SEED_B32, `${kode.slice(0, 3)} ${kode.slice(3)}`, 1, t0), 0);
  });
});

describe('urlOtpauth', () => {
  test('memuat secret, issuer, dan label ter-encode', () => {
    const url = urlOtpauth('e-Buku Induk Siswa', 'administrator', SEED_B32);
    assert.ok(url.startsWith('otpauth://totp/'));
    assert.ok(url.includes(`secret=${SEED_B32}`));
    assert.ok(url.includes('issuer=e-Buku+Induk+Siswa'));
    assert.ok(url.includes('digits=6'));
  });
});

describe('kode pemulihan', () => {
  test('format XXXXX-XXXXX + hash stabil terhadap normalisasi', () => {
    const kode = buatKodePemulihan();
    assert.match(kode, /^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
    assert.equal(normalisasiKodePemulihan(kode.toLowerCase()), normalisasiKodePemulihan(kode));
    assert.equal(hashKodePemulihan(kode), hashKodePemulihan(kode.toLowerCase().replace('-', ' ')));
  });

  test('indeksKodePemulihan menemukan dan menolak yang asing', () => {
    const daftar = ['AAAAA-AAAAA', 'BBBBB-BBBBB', 'CCCCC-CCCCC'].map(hashKodePemulihan);
    assert.equal(indeksKodePemulihan(daftar, 'bbbbb-bbbbb'), 1);
    assert.equal(indeksKodePemulihan(daftar, 'ZZZZZ-ZZZZZ'), -1);
  });
});
