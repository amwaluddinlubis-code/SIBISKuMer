// Regresi gerbang S4 (migrasi otomatis): payload rakitan tangan untuk
// impor server WAJIB lolos validasi kompatibilitas + struktur server.
// (Kegagalan nyata 25 Okt 2026: app 'BukuInduk_Merdeka' + version '2'
// ditolak validator — migrasi gagal diam-diam.)
import test from 'node:test';
import assert from 'node:assert/strict';

(globalThis as any).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const { eksporDataLokalSaja } = await import('../src/utils/db');
const { validasiKompatibilitas, validasiStrukturBackup, BACKUP_APP_NAME, BACKUP_FORMAT_VERSION } =
  await import('../src/utils/backupIntegrity');

test('eksporDataLokalSaja: header kanonis & lolos validasi impor server', async () => {
  const p: any = await eksporDataLokalSaja();
  assert.equal(p.app, BACKUP_APP_NAME);
  assert.equal(p.version, BACKUP_FORMAT_VERSION);
  assert.ok(Array.isArray(p.siswa));
  assert.deepEqual(validasiKompatibilitas(p), []);
  assert.deepEqual(validasiStrukturBackup(p), []);
});
