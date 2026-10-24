// Regresi Fase S1 (migrasi SQLite): lapisan data server end-to-end lewat
// HTTP sungguhan — login + kunci login, impor/ekspor backup, CRUD siswa
// dengan otorisasi rombel, koleksi, dan snapshot. Memakai folder data
// sementara yang dibuang sesudahnya; database aplikasi tidak tersentuh.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const folderUji = mkdtempSync(path.join(tmpdir(), 'sibis-s1-'));
process.env.SIBISKUMER_DATA_DIR = folderUji;

const { buatRouterV1 } = await import('../server/api');
const { tutupSemuaDb } = await import('../server/db');
const { initialSiswaList, initialUsersList, defaultSekolahProfile, defaultDapodikConfig } =
  await import('../src/data/initialData');
const { tambahIntegritas, periksaIntegritas, BACKUP_FORMAT_VERSION } =
  await import('../src/utils/backupIntegrity');

const app = express();
app.use('/api/v1', express.json({ limit: '25mb' }), buatRouterV1());
const server: Server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const dasar = `http://127.0.0.1:${(server.address() as any).port}/api/v1`;

interface HasilHttp {
  status: number;
  body: any;
  cookie: string | null;
}

async function panggil(
  metode: string,
  jalur: string,
  opsi: { body?: unknown; cookie?: string } = {}
): Promise<HasilHttp> {
  const res = await fetch(`${dasar}${jalur}`, {
    method: metode,
    headers: {
      'Content-Type': 'application/json',
      ...(opsi.cookie ? { Cookie: opsi.cookie } : {}),
    },
    body: opsi.body === undefined ? undefined : JSON.stringify(opsi.body),
  });
  const setCookie = res.headers.get('set-cookie');
  return {
    status: res.status,
    body: await res.json().catch(() => null),
    cookie: setCookie ? setCookie.split(';')[0] : null,
  };
}

async function login(username: string, password: string): Promise<HasilHttp> {
  return panggil('POST', '/auth/login', { body: { username, password } });
}

let cookieAdmin = '';
let cookieOp = '';

test('health v1 menjawab & sekolah bawaan tersedia', async () => {
  const h = await panggil('GET', '/health');
  assert.equal(h.status, 200);
  assert.equal(h.body.ok, true);
  const s = await panggil('GET', '/sekolah');
  assert.equal(s.body.data.length, 1);
  assert.equal(s.body.data[0].id, 'utama');
});

test('endpoint data menolak tanpa sesi (401)', async () => {
  const r = await panggil('GET', '/data/siswa');
  assert.equal(r.status, 401);
  assert.equal(r.body.ok, false);
});

test('login admin bawaan berhasil, user tanpa kata sandi', async () => {
  const r = await login('administrator', 'administrator');
  assert.equal(r.status, 200);
  assert.ok(r.cookie, 'cookie sesi terbit');
  assert.equal(r.body.data.user.username, 'administrator');
  assert.equal(r.body.data.user.password, undefined);
  assert.equal(r.body.data.mustChangePassword, true);
  cookieAdmin = r.cookie!;
});

test('login sandi salah ditolak 401', async () => {
  const r = await login('administrator', 'salah-total');
  assert.equal(r.status, 401);
});

test('paritas first-run: sekolah baru ter-seed data contoh yang sama', async () => {
  const daftar = await panggil('GET', '/data/siswa', { cookie: cookieAdmin });
  assert.equal(daftar.body.data.length, initialSiswaList.length);
});

test('impor backup asli oleh admin: hitungan cocok, token tidak ikut', async () => {
  const payloadMentah: any = {
    app: 'Buku Induk Siswa Kurikulum Merdeka',
    version: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    sekolah: defaultSekolahProfile,
    dapodikConfig: { ...defaultDapodikConfig, token: '' },
    siswa: initialSiswaList,
    syncLogs: [],
    users: initialUsersList,
    rombel: [],
    ptk: [],
    tutupTahun: [],
    petaKelas: [],
    audit: [],
  };
  const payload = await tambahIntegritas(payloadMentah);
  const r = await panggil('POST', '/backup/impor', { body: { payload }, cookie: cookieAdmin });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.hitungan.siswa, initialSiswaList.length);
  assert.equal(r.body.data.hitungan.users, initialUsersList.length);
  assert.equal(r.body.data.integritas, 'terverifikasi');

  const daftar = await panggil('GET', '/data/siswa', { cookie: cookieAdmin });
  assert.equal(daftar.body.data.length, initialSiswaList.length);
});

test('ekspor dari SQLite setara & checksum terverifikasi', async () => {
  const r = await panggil('GET', '/backup/ekspor', { cookie: cookieAdmin });
  assert.equal(r.status, 200);
  const payload = r.body.data;
  assert.equal(payload.siswa.length, initialSiswaList.length);
  assert.equal(payload.dapodikConfig.token, '');
  const cek = await periksaIntegritas(payload);
  assert.equal(cek.status, 'terverifikasi');
  const asli = [...initialSiswaList].sort((a: any, b: any) => a.id.localeCompare(b.id));
  const hasil = [...payload.siswa].sort((a: any, b: any) => a.id.localeCompare(b.id));
  assert.equal(JSON.stringify(hasil[0]), JSON.stringify(asli[0]));
});

test('operator terikat rombelAkses: baca tersaring, tulis di luar akses 403', async () => {
  const buat = await panggil('PUT', '/data/users/op-uji', {
    cookie: cookieAdmin,
    body: {
      id: 'op-uji',
      username: 'opuji',
      password: 'rahasia123',
      nama: 'Operator Uji',
      role: 'operator',
      status: 'aktif',
      rombelAkses: ['7A'],
    },
  });
  assert.equal(buat.status, 200);
  const masuk = await login('opuji', 'rahasia123');
  assert.equal(masuk.status, 200);
  cookieOp = masuk.cookie!;

  const terlihat = initialSiswaList.filter(
    (s: any) => !s.rombelSaatIni || s.rombelSaatIni === '7A'
  ).length;
  const daftar = await panggil('GET', '/data/siswa', { cookie: cookieOp });
  assert.equal(daftar.body.data.length, terlihat);
  assert.ok(daftar.body.data.every((s: any) => !s.rombelSaatIni || s.rombelSaatIni === '7A'));

  const diLuar = initialSiswaList.find((s: any) => s.rombelSaatIni && s.rombelSaatIni !== '7A');
  if (diLuar) {
    const ambil = await panggil('GET', `/data/siswa/${diLuar.id}`, { cookie: cookieOp });
    assert.equal(ambil.status, 404);
    const tulis = await panggil('PUT', `/data/siswa/${diLuar.id}`, {
      cookie: cookieOp,
      body: { ...diLuar, namaLengkap: 'Diubah Paksa' },
    });
    assert.equal(tulis.status, 403);
  }

  const boleh = await panggil('PUT', '/data/siswa/s-baru-7a', {
    cookie: cookieOp,
    body: { id: 's-baru-7a', namaLengkap: 'Siswa Baru 7A', nisn: '0099', rombelSaatIni: '7A' },
  });
  assert.equal(boleh.status, 200);
  const tolak = await panggil('PUT', '/data/siswa/s-baru-8a', {
    cookie: cookieOp,
    body: { id: 's-baru-8a', namaLengkap: 'Siswa Baru 8A', nisn: '0088', rombelSaatIni: '8A' },
  });
  assert.equal(tolak.status, 403);
});

test('operator bukan admin: impor backup & daftar users ditolak 403', async () => {
  const u = await panggil('GET', '/data/users', { cookie: cookieOp });
  assert.equal(u.status, 403);
  const i = await panggil('POST', '/backup/impor', { body: { payload: {} }, cookie: cookieOp });
  assert.equal(i.status, 403);
});

test('koleksi rombel: simpan, baca, ganti massal', async () => {
  const satu = await panggil('PUT', '/data/koleksi/rombel/rbl-7a', {
    cookie: cookieAdmin,
    body: { id: 'rbl-7a', nama: '7A', tingkat: 7 },
  });
  assert.equal(satu.status, 200);
  const ganti = await panggil('POST', '/data/koleksi/rombel/bulk', {
    cookie: cookieAdmin,
    body: { mode: 'ganti', items: [{ id: 'rbl-8a', nama: '8A', tingkat: 8 }] },
  });
  assert.equal(ganti.status, 200);
  const daftar = await panggil('GET', '/data/koleksi/rombel', { cookie: cookieAdmin });
  assert.equal(daftar.body.data.length, 1);
  assert.equal(daftar.body.data[0].id, 'rbl-8a');
  const asing = await panggil('GET', '/data/koleksi/tidak_ada', { cookie: cookieAdmin });
  assert.equal(asing.status, 404);
});

test('snapshot: buat, daftar, pulihkan (admin)', async () => {
  const payloadSnapshot = {
    app: 'Buku Induk Siswa Kurikulum Merdeka',
    version: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    sekolah: defaultSekolahProfile,
    dapodikConfig: defaultDapodikConfig,
    siswa: [initialSiswaList[0]],
    syncLogs: [],
    users: initialUsersList,
    rombel: [],
    ptk: [],
    tutupTahun: [],
    petaKelas: [],
    audit: [],
  };
  const buat = await panggil('POST', '/data/snapshot', {
    cookie: cookieAdmin,
    body: { id: 'snap-uji', payload: JSON.stringify(payloadSnapshot), jumlahSiswa: 1 },
  });
  assert.equal(buat.status, 200);
  const daftar = await panggil('GET', '/data/snapshot', { cookie: cookieAdmin });
  assert.ok(daftar.body.data.some((s: any) => s.id === 'snap-uji'));
  const pulih = await panggil('POST', '/data/snapshot/snap-uji/pulihkan', {
    cookie: cookieAdmin,
    body: {},
  });
  assert.equal(pulih.status, 200);
  assert.equal(pulih.body.data.hitungan.siswa, 1);
  const siswa = await panggil('GET', '/data/siswa', { cookie: cookieAdmin });
  assert.equal(siswa.body.data.length, 1);
});

test('kunci login: 5x salah -> terkunci, sandi benar pun ditolak', async () => {
  await panggil('PUT', '/data/users/kunci-uji', {
    cookie: cookieAdmin,
    body: {
      id: 'kunci-uji',
      username: 'kunciuji',
      password: 'benar123',
      nama: 'Uji Kunci',
      role: 'operator',
      status: 'aktif',
    },
  });
  for (let i = 1; i <= 4; i++) {
    const r = await login('kunciuji', 'salah');
    assert.equal(r.status, 401, `percobaan ${i}`);
  }
  const kelima = await login('kunciuji', 'salah');
  assert.equal(kelima.status, 423);
  const benar = await login('kunciuji', 'benar123');
  assert.equal(benar.status, 423);
});

test('logout mengakhiri sesi', async () => {
  // Login segar (akun op-uji sah terhapus oleh pemulihan snapshot di atas —
  // perilaku restore yang benar), lalu logout dan pastikan sesi mati.
  const masuk = await login('administrator', 'administrator');
  assert.equal(masuk.status, 200);
  const keluar = await panggil('POST', '/auth/logout', { cookie: masuk.cookie!, body: {} });
  assert.equal(keluar.status, 200);
  const sesi = await panggil('GET', '/auth/sesi', { cookie: masuk.cookie! });
  assert.equal(sesi.status, 401);
});

test.after(() => {
  server.close();
  tutupSemuaDb();
  rmSync(folderUji, { recursive: true, force: true });
});
