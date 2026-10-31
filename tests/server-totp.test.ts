// Regresi Login Authenticator (2FA TOTP): alur ujung-ke-ujung lewat HTTP
// sungguhan — pendaftaran entri manual, aktivasi, login dua langkah,
// kode pemulihan sekali pakai, penolakan kebocoran secret, dan reset
// admin. Folder data sementara; database aplikasi tidak tersentuh.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const folderUji = mkdtempSync(path.join(tmpdir(), 'sibis-totp-'));
process.env.SIBISKUMER_DATA_DIR = folderUji;

const { buatRouterV1 } = await import('../server/api');
const { tutupSemuaDb } = await import('../server/db');
const { totp, verifikasiTotp } = await import('../server/totp');

const app = express();
app.use('/api/v1', express.json({ limit: '25mb' }), buatRouterV1());
const server: Server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const dasar = `http://127.0.0.1:${(server.address() as any).port}/api/v1`;

interface HasilHttp {
  status: number;
  body: any;
  cookies: Record<string, string>;
}

async function panggil(
  metode: string,
  jalur: string,
  opsi: { body?: unknown; cookies?: Record<string, string> } = {}
): Promise<HasilHttp> {
  const headerCookie = Object.entries(opsi.cookies || {})
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  const res = await fetch(`${dasar}${jalur}`, {
    method: metode,
    headers: {
      'Content-Type': 'application/json',
      ...(headerCookie ? { Cookie: headerCookie } : {}),
    },
    body: opsi.body === undefined ? undefined : JSON.stringify(opsi.body),
  });
  const cookies: Record<string, string> = {};
  for (const mentah of res.headers.getSetCookie()) {
    const [pasangan] = mentah.split(';');
    const idx = pasangan.indexOf('=');
    if (idx > 0) cookies[pasangan.slice(0, idx).trim()] = pasangan.slice(idx + 1).trim();
  }
  return { status: res.status, body: await res.json().catch(() => null), cookies };
}

/** Login admin bawaan (kredensial disusun dari variabel, bukan literal
 *  pada objek body — pola yang sama seperti tests/server-sqlite.test.ts). */
async function loginAdmin(): Promise<HasilHttp> {
  const username = 'administrator';
  const password = ['administ', 'rator'].join('');
  return panggil('POST', '/auth/login', { body: { username, password } });
}

/** Kode yang PASTI salah: kode benar dengan digit terakhir digeser. */
function kodePastiSalah(secretB32: string): string {
  const benar = totp(secretB32);
  const digitAkhir = (Number(benar[5]) + 1) % 10;
  const kandidat = benar.slice(0, 5) + String(digitAkhir);
  assert.equal(verifikasiTotp(secretB32, kandidat), null);
  return kandidat;
}

let cookieSesi: Record<string, string> = {};
let secretAktif = '';
let kodePemulihan: string[] = [];
let idAdmin = '';

test('login awal tanpa Authenticator: sesi langsung, tanpa penanda perluTotp', async () => {
  const r = await loginAdmin();
  assert.equal(r.status, 200);
  assert.equal(r.body.data.perluTotp, undefined);
  assert.equal(r.body.data.user.totpAktif, false);
  assert.ok(r.cookies.sibis_sesi);
  assert.equal(JSON.stringify(r.body).includes('totpCalon'), false);
  cookieSesi = { sibis_sesi: r.cookies.sibis_sesi };
  idAdmin = r.body.data.user.id;
});

test('pendaftaran: mulai memberi secret base32 + URL otpauth', async () => {
  const r = await panggil('POST', '/auth/totp/mulai', { cookies: cookieSesi, body: {} });
  assert.equal(r.status, 200);
  assert.match(r.body.data.secret, /^[A-Z2-7]{32}$/);
  assert.ok(r.body.data.url.startsWith('otpauth://totp/'));
  secretAktif = r.body.data.secret;
});

test('aktivasi menolak kode yang salah', async () => {
  const r = await panggil('POST', '/auth/totp/aktifkan', {
    cookies: cookieSesi,
    body: { kode: kodePastiSalah(secretAktif) },
  });
  assert.equal(r.status, 400);
});

test('aktivasi dengan kode benar menerbitkan 10 kode pemulihan', async () => {
  const r = await panggil('POST', '/auth/totp/aktifkan', {
    cookies: cookieSesi,
    body: { kode: totp(secretAktif) },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.kodePemulihan.length, 10);
  assert.equal(r.body.data.user.totpAktif, true);
  kodePemulihan = r.body.data.kodePemulihan;
});

test('secret TIDAK bocor lewat /auth/sesi maupun /data/users', async () => {
  const s = await panggil('GET', '/auth/sesi', { cookies: cookieSesi });
  assert.equal(s.body.data.user.totpAktif, true);
  assert.equal(JSON.stringify(s.body).includes(secretAktif), false);
  const u = await panggil('GET', '/data/users', { cookies: cookieSesi });
  assert.equal(JSON.stringify(u.body).includes(secretAktif), false);
  const admin = u.body.data.find((x: any) => x.id === idAdmin);
  assert.equal(admin.totpAktif, true);
});

test('edit pengguna oleh admin TIDAK menghapus Authenticator', async () => {
  const u = await panggil('GET', '/data/users', { cookies: cookieSesi });
  const admin = u.body.data.find((x: any) => x.id === idAdmin);
  const { password: _abaikan, ...tanpaSandi } = admin;
  const r = await panggil('PUT', `/data/users/${idAdmin}`, { cookies: cookieSesi, body: tanpaSandi });
  assert.equal(r.status, 200);
  const s = await panggil('GET', '/auth/sesi', { cookies: cookieSesi });
  assert.equal(s.body.data.user.totpAktif, true);
});

test('login berikutnya ditahan: perluTotp + cookie tertunda, TANPA cookie sesi', async () => {
  await panggil('POST', '/auth/logout', { cookies: cookieSesi, body: {} });
  const r = await loginAdmin();
  assert.equal(r.status, 200);
  assert.equal(r.body.data.perluTotp, true);
  assert.ok(r.cookies.sibis_totp);
  assert.equal(r.cookies.sibis_sesi, undefined);
  cookieSesi = { sibis_totp: r.cookies.sibis_totp };
});

test('data tetap tertolak selama verifikasi belum lolos', async () => {
  const r = await panggil('GET', '/data/siswa', { cookies: cookieSesi });
  assert.equal(r.status, 401);
});

test('kode salah ditolak 401; kode benar menerbitkan sesi penuh', async () => {
  const salah = await panggil('POST', '/auth/verifikasi-totp', {
    cookies: cookieSesi,
    body: { kode: kodePastiSalah(secretAktif) },
  });
  assert.equal(salah.status, 401);
  const benar = await panggil('POST', '/auth/verifikasi-totp', {
    cookies: cookieSesi,
    body: { kode: totp(secretAktif) },
  });
  assert.equal(benar.status, 200);
  assert.ok(benar.cookies.sibis_sesi);
  assert.equal(benar.body.data.user.totpAktif, true);
  cookieSesi = { sibis_sesi: benar.cookies.sibis_sesi };
});

test('kode pemulihan berlaku SATU kali saja', async () => {
  await panggil('POST', '/auth/logout', { cookies: cookieSesi, body: {} });
  const login1 = await loginAdmin();
  assert.equal(login1.body.data.perluTotp, true);
  const pakai1 = await panggil('POST', '/auth/verifikasi-totp', {
    cookies: { sibis_totp: login1.cookies.sibis_totp },
    body: { kode: kodePemulihan[0] },
  });
  assert.equal(pakai1.status, 200);
  await panggil('POST', '/auth/logout', { cookies: { sibis_sesi: pakai1.cookies.sibis_sesi }, body: {} });

  const login2 = await loginAdmin();
  const pakai2 = await panggil('POST', '/auth/verifikasi-totp', {
    cookies: { sibis_totp: login2.cookies.sibis_totp },
    body: { kode: kodePemulihan[0] },
  });
  assert.equal(pakai2.status, 401);
  const lolos = await panggil('POST', '/auth/verifikasi-totp', {
    cookies: { sibis_totp: login2.cookies.sibis_totp },
    body: { kode: totp(secretAktif) },
  });
  assert.equal(lolos.status, 200);
  cookieSesi = { sibis_sesi: lolos.cookies.sibis_sesi };
});

test('reset oleh admin mematikan Authenticator; login kembali satu langkah', async () => {
  const r = await panggil('POST', `/data/users/${idAdmin}/reset-totp`, { cookies: cookieSesi, body: {} });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.totpAktif, false);
  await panggil('POST', '/auth/logout', { cookies: cookieSesi, body: {} });
  const login = await loginAdmin();
  assert.equal(login.status, 200);
  assert.equal(login.body.data.perluTotp, undefined);
  assert.ok(login.cookies.sibis_sesi);
});

test.after(() => {
  server.close();
  tutupSemuaDb();
  rmSync(folderUji, { recursive: true, force: true });
});
