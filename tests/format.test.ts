/**
 * Tes regresi Fase 2/3 QA UI/UX — util format & label bersama.
 * Dijalankan dengan `npm test` (tsx + node:test). Fixture fiktif.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTanggalIndo,
  sensorNilai,
  alamatTanpaRtRw,
  formatAlamatLengkap,
} from '../src/utils/format';
import { AKSI_LABEL, labelAksi, labelEntitas } from '../src/utils/auditLabel';
import { singkatanMapel } from '../src/utils/raportUtils';
import type { AuditAksi } from '../src/types';

describe('formatTanggalIndo', () => {
  test('ISO menjadi tanggal Indonesia ringkas, bukan mentah', () => {
    assert.equal(formatTanggalIndo('2010-04-15'), '15 Apr 2010');
    assert.notEqual(formatTanggalIndo('2010-04-15'), '2010-04-15');
  });
  test('kosong menjadi "-" dan tak valid apa adanya', () => {
    assert.equal(formatTanggalIndo(''), '-');
    assert.equal(formatTanggalIndo(undefined), '-');
    assert.equal(formatTanggalIndo('bukan-tanggal'), 'bukan-tanggal');
  });
});

describe('sensorNilai (privasi pratinjau)', () => {
  test('NIK 16 digit hanya membuka 4 digit terakhir', () => {
    const s = sensorNilai('3201234567890001');
    assert.ok(s.endsWith('0001'));
    assert.ok(!s.includes('3201'));
    assert.equal(s.length, 16);
  });
  test('nomor telepon disensor serupa; kosong menjadi "-"', () => {
    assert.ok(sensorNilai('081234567890').endsWith('7890'));
    assert.equal(sensorNilai(''), '-');
    assert.equal(sensorNilai(null), '-');
  });
});

describe('alamat satu sumber (anti RT/RW dobel)', () => {
  test('ekor RT/RW pada alamat bebas dibuang, termasuk bentuk rapat', () => {
    assert.equal(alamatTanpaRtRw('Jl. Merdeka No. 5 RT 03 RW 05'), 'Jl. Merdeka No. 5');
    assert.equal(alamatTanpaRtRw('Jl. Merdeka RT03RW05'), 'Jl. Merdeka');
    assert.equal(alamatTanpaRtRw('Jl. Merdeka RT 03 RW 05RT03RW05'), 'Jl. Merdeka');
  });
  test('alamat lengkap tidak menggandakan RT/RW', () => {
    const hasil = formatAlamatLengkap({
      alamat: 'Jl. Merdeka No. 5 RT 03 RW 05',
      rt: '03',
      rw: '05',
      kelurahan: 'Sukamaju',
      kecamatan: 'Cianjur',
    });
    assert.equal(hasil, 'Jl. Merdeka No. 5, RT 03 RW 05, Kel. Sukamaju, Kec. Cianjur');
    assert.equal(hasil.match(/RT 03/g)?.length, 1);
  });
});

describe('kamus label audit', () => {
  test('SEMUA aksi AuditAksi punya label manusiawi (termasuk ganti_password_bawaan)', () => {
    const semuaAksi: AuditAksi[] = [
      'login', 'logout', 'sesi_pindah', 'login_gagal', 'login_terkunci',
      'akun_buat', 'akun_ubah', 'akun_hapus', 'password_ubah', 'password_reset',
      'ganti_password_bawaan', 'impersonate_mulai', 'impersonate_selesai',
      'siswa_tambah', 'siswa_ubah', 'siswa_hapus', 'data_sensitif_dilihat',
      'mutasi_masuk', 'mutasi_keluar', 'tutup_tahun', 'buka_tahun',
      'sinkron_terapkan', 'impor_siswa', 'backup_buat', 'backup_pulihkan',
      'backup_reset', 'laporan_ekspor', 'cloud_unggah', 'cloud_unduh',
      'cloud_sinkron', 'rombel_ubah', 'dokumen_ekspor', 'pengaturan_ubah', 'gtk_ubah',
    ];
    for (const a of semuaAksi) {
      assert.ok(AKSI_LABEL[a], `label hilang untuk ${a}`);
      assert.ok(!AKSI_LABEL[a].includes('_'), `label ${a} masih snake_case`);
    }
    assert.equal(labelAksi('ganti_password_bawaan'), 'Ganti kata sandi bawaan');
  });
  test('entitas teknis diterjemahkan', () => {
    assert.equal(labelEntitas('sesi'), 'Sesi');
    assert.equal(labelEntitas('gtk'), 'GTK');
  });
});

describe('singkatanMapel (header Leger)', () => {
  test('mapel panjang disingkat, nama pendek dibiarkan', () => {
    assert.equal(singkatanMapel('Pendidikan Agama dan Budi Pekerti'), 'PABP');
    assert.equal(singkatanMapel('Bahasa Indonesia'), 'B. Indo');
    assert.equal(singkatanMapel('Pendidikan Jasmani, Olahraga, dan Kesehatan'), 'PJOK');
    assert.equal(singkatanMapel('Matematika'), 'MTK');
    assert.equal(singkatanMapel('Seni'), 'Seni');
  });
});
