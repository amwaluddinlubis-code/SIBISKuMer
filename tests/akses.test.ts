// Matriks hak akses berbasis peran (Issue #12) — modul murni, tanpa IO.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IZIN_PERAN,
  bolehAksi,
  bolehTulis,
  bolehKelolaAdmin,
  rombelTerlihat,
  labelPeran,
  type SumberAkses,
  type AksiAkses,
} from '../src/utils/akses';
import type { AppUser, UserRole } from '../src/types';

function pengguna(role: string, rombelAkses?: string[]): AppUser {
  return {
    id: 'u-1',
    username: 'uji',
    namaLengkap: 'Pengguna Uji',
    role: role as UserRole,
    email: 'uji@sekolah.id',
    status: 'aktif',
    rombelAkses,
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
  };
}

const SEMUA_SUMBER = Object.keys(IZIN_PERAN.administrator) as SumberAkses[];
const AKSI_TULIS: AksiAkses[] = ['tambah', 'ubah', 'hapus', 'kelola'];

test('pimpinan tidak punya aksi tulis/kelola di sumber mana pun (kecuali tandai selesai kalender)', () => {
  const pim = pengguna('pimpinan');
  assert.ok(SEMUA_SUMBER.length >= 16);
  for (const s of SEMUA_SUMBER) {
    for (const a of AKSI_TULIS) {
      // Pengecualian disengaja: `ubah` kalender = tandai selesai tugas yang
      // ditugaskan kepadanya (bolehUbahStatusTenggat berbasis username, bukan peran).
      if (s === 'kalender' && a === 'ubah') continue;
      assert.equal(bolehAksi(pim, s, a), false, `pimpinan ${a} ${s}`);
    }
  }
  assert.equal(bolehAksi(pim, 'kalender', 'ubah'), true);
  assert.equal(bolehAksi(pim, 'kalender', 'tambah'), false);
  assert.equal(bolehAksi(pim, 'kalender', 'hapus'), false);
  assert.equal(bolehAksi(pim, 'kalender', 'kelola'), false);
  assert.equal(bolehTulis(pim), false);
  assert.equal(bolehKelolaAdmin(pim), false);
});

test('pimpinan boleh baca + ekspor laporan/siswa, tapi tidak impor/backup/pengguna/tutup/audit', () => {
  const pim = pengguna('pimpinan');
  assert.equal(bolehAksi(pim, 'laporan', 'baca'), true);
  assert.equal(bolehAksi(pim, 'laporan', 'ekspor'), true);
  assert.equal(bolehAksi(pim, 'siswa', 'baca'), true);
  assert.equal(bolehAksi(pim, 'siswa', 'ekspor'), true);
  assert.equal(bolehAksi(pim, 'impor', 'tambah'), false);
  assert.equal(bolehAksi(pim, 'backup', 'baca'), false);
  assert.equal(bolehAksi(pim, 'pengguna', 'kelola'), false);
  assert.equal(bolehAksi(pim, 'tutup_tahun', 'kelola'), false);
  assert.equal(bolehAksi(pim, 'audit', 'baca'), false);
});

test('administrator boleh semua aksi di semua sumber (audit: baca saja, tanpa aksi pengguna)', () => {
  const adm = pengguna('administrator');
  const semua: AksiAkses[] = ['baca', 'tambah', 'ubah', 'hapus', 'ekspor', 'kelola'];
  for (const s of SEMUA_SUMBER) {
    for (const a of semua) {
      // Audit tidak punya aksi pengguna: penulisan log adalah jalur sistem, bukan izin.
      if (s === 'audit' && a !== 'baca') continue;
      assert.equal(bolehAksi(adm, s, a), true, `admin ${a} ${s}`);
    }
  }
  assert.equal(bolehAksi(adm, 'audit', 'baca'), true);
  assert.equal(bolehTulis(adm), true);
  assert.equal(bolehKelolaAdmin(adm), true);
});

test('operator vs wali_kelas: matriks sama kecuali config; cakupan rombel berbeda', () => {
  const op = pengguna('operator');
  const wali = pengguna('wali_kelas', ['7A']);
  assert.equal(bolehAksi(op, 'config', 'ubah'), true);
  assert.equal(bolehAksi(wali, 'config', 'ubah'), false);
  assert.equal(bolehAksi(wali, 'config', 'baca'), true);
  assert.equal(bolehAksi(op, 'siswa', 'hapus'), true);
  assert.equal(bolehAksi(wali, 'siswa', 'hapus'), true);
  assert.equal(bolehAksi(wali, 'backup', 'baca'), false);
  assert.equal(bolehAksi(wali, 'tutup_tahun', 'kelola'), false);
  assert.equal(bolehTulis(op), true);
  assert.equal(bolehTulis(wali), true);
  // Cakupan rombel (Issue #12).
  assert.equal(rombelTerlihat(op, '9Z'), true); // operator tanpa batas = semua
  assert.equal(rombelTerlihat(pengguna('operator', ['7A']), '8A'), false);
  assert.equal(rombelTerlihat(pengguna('operator', ['7A']), '7A'), true);
  assert.equal(rombelTerlihat(wali, '7A'), true);
  assert.equal(rombelTerlihat(wali, '8A'), false);
  assert.equal(rombelTerlihat(pengguna('wali_kelas', []), '7A'), false); // kosong = tanpa akses
  assert.equal(rombelTerlihat(pengguna('wali_kelas'), '7A'), false);
  assert.equal(rombelTerlihat(pengguna('pimpinan', ['7A']), '9Z'), true); // pimpinan se-sekolah
  assert.equal(rombelTerlihat(pengguna('administrator', ['7A']), '9Z'), true);
  assert.equal(rombelTerlihat(null, '7A'), false); // fail closed
});

test('pengguna null / peran tak dikenal ditolak (fail closed)', () => {
  assert.equal(bolehAksi(null, 'siswa', 'baca'), false);
  assert.equal(bolehAksi(pengguna('superuser'), 'siswa', 'baca'), false);
  assert.equal(bolehTulis(null), false);
  assert.equal(bolehTulis(undefined), false);
  assert.equal(bolehKelolaAdmin(pengguna('operator')), false);
  assert.equal(bolehKelolaAdmin(pengguna('wali_kelas')), false);
  assert.equal(labelPeran('pimpinan'), 'Pimpinan');
  assert.equal(labelPeran('wali_kelas'), 'Wali Kelas');
  assert.equal(labelPeran('operator'), 'Operator');
  assert.equal(labelPeran('administrator'), 'Administrator');
  assert.equal(labelPeran('aneh'), 'Pengguna');
  assert.equal(labelPeran(null), 'Pengguna');
});
