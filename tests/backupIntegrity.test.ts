// Tes regresi Issue #10 — integritas & kompatibilitas cadangan.
// Modul murni (tanpa IndexedDB/DOM) sehingga dapat diuji dengan tsx --test.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_FORMAT_VERSION,
  bandingkanVersi,
  deteksiCadanganTerenkripsi,
  hitungChecksumBackup,
  periksaIntegritas,
  periksaRelasiBackup,
  stringifyKanonik,
  tambahIntegritas,
  validasiKompatibilitas,
  validasiStrukturBackup,
} from '../src/utils/backupIntegrity';

function backupDasar() {
  return {
    app: 'Buku Induk Siswa Kurikulum Merdeka',
    version: BACKUP_FORMAT_VERSION,
    exportedAt: '2026-10-15T00:00:00.000Z',
    sekolah: { npsn: '20104567', nama: 'SD Contoh' },
    dapodikConfig: { token: '' },
    siswa: [
      { id: 's1', namaLengkap: 'ANI', nisn: '1234567890', rombelSaatIni: '1A', updatedAt: '2026-10-01T00:00:00.000Z' },
      { id: 's2', namaLengkap: 'BUDI', nisn: '1234567891', rombelSaatIni: '1A', updatedAt: '2026-10-01T00:00:00.000Z' },
    ],
    syncLogs: [],
    users: [{ id: 'u1', username: 'admin', role: 'administrator' }],
    rombel: [{ id: 'r1', nama: '1A' }],
    ptk: [],
    tutupTahun: [],
    petaKelas: [],
    audit: [],
  };
}

describe('stringifyKanonik', () => {
  it('stabil terhadap urutan kunci, peka terhadap urutan array', () => {
    assert.equal(stringifyKanonik({ b: 1, a: { d: 4, c: 3 } }), stringifyKanonik({ a: { c: 3, d: 4 }, b: 1 }));
    assert.notEqual(stringifyKanonik([1, 2]), stringifyKanonik([2, 1]));
  });
});

describe('checksum & blok integritas', () => {
  it('round-trip: tambahIntegritas lalu periksaIntegritas = terverifikasi', async () => {
    const berintegritas = await tambahIntegritas(backupDasar());
    assert.equal(berintegritas.integritas.algoritma, 'SHA-256');
    assert.match(berintegritas.integritas.checksum, /^[0-9a-f]{64}$/);
    assert.equal(berintegritas.integritas.jumlah.siswa, 2);
    const hasil = await periksaIntegritas(berintegritas);
    assert.equal(hasil.status, 'terverifikasi');
  });

  it('checksum stabil: dua kali tambah pada isi sama menghasilkan checksum sama', async () => {
    const a = await tambahIntegritas(backupDasar());
    const b = await tambahIntegritas(backupDasar());
    assert.equal(a.integritas.checksum, b.integritas.checksum);
  });

  it('mengubah satu field siswa terdeteksi sebagai tidak-cocok', async () => {
    const berintegritas = await tambahIntegritas(backupDasar());
    const rusak = JSON.parse(JSON.stringify(berintegritas)) as ReturnType<typeof backupDasar> & {
      integritas: { checksum: string };
    };
    (rusak.siswa[0] as { namaLengkap: string }).namaLengkap = 'ANI DIUBAH';
    const hasil = await periksaIntegritas(rusak);
    assert.equal(hasil.status, 'tidak-cocok');
    assert.match(hasil.alasan || '', /Checksum/);
  });

  it('mengubah jumlah tercatat terdeteksi sebagai tidak-cocok', async () => {
    const berintegritas = await tambahIntegritas(backupDasar());
    (berintegritas.integritas.jumlah as Record<string, number>).siswa = 99;
    const hasil = await periksaIntegritas(berintegritas);
    assert.equal(hasil.status, 'tidak-cocok');
    assert.match(hasil.alasan || '', /Jumlah tercatat/);
  });

  it('backup lama tanpa blok integritas = tanpa-checksum (tidak ditolak)', async () => {
    const hasil = await periksaIntegritas(backupDasar());
    assert.equal(hasil.status, 'tanpa-checksum');
  });

  it('blok integritas malformasi = tidak-valid', async () => {
    const hasil = await periksaIntegritas({
      ...backupDasar(),
      integritas: { algoritma: 'SHA-256', checksum: 'bukan-hex', jumlah: {}, dibuatPada: '' },
    });
    assert.equal(hasil.status, 'tidak-valid');
  });

  it('payload bukan objek = tidak-valid', async () => {
    const hasil = await periksaIntegritas('bukan-objek');
    assert.equal(hasil.status, 'tidak-valid');
  });

  it('hitungChecksumBackup mengecualikan blok integritas itu sendiri', async () => {
    const dasar = backupDasar();
    const berintegritas = await tambahIntegritas(dasar);
    assert.equal(await hitungChecksumBackup(berintegritas), await hitungChecksumBackup(dasar));
  });
});

describe('validasiKompatibilitas', () => {
  it('payload valid dari versi saat ini = kompatibel', () => {
    assert.deepEqual(validasiKompatibilitas(backupDasar()), []);
  });

  it('backup versi lebih lama tetap diterima (kompatibel ke belakang)', () => {
    assert.deepEqual(validasiKompatibilitas({ ...backupDasar(), version: '1.1.0' }), []);
  });
  it('menerima identifier aplikasi dari exporter v1.0 lama', () => {
    const lama = { ...backupDasar(), app: 'Buku Induk Siswa SMP Kurikulum Merdeka', version: '1.0.0' };
    assert.deepEqual(validasiKompatibilitas(lama), []);
  });

  it('app bukan SIBISKuMer ditolak', () => {
    const masalah = validasiKompatibilitas({ ...backupDasar(), app: 'Aplikasi Lain' });
    assert.equal(masalah.length, 1);
    assert.match(masalah[0], /Bukan cadangan SIBISKuMer/);
  });

  it('versi hilang ditolak', () => {
    const { version: _buang, ...tanpaVersi } = backupDasar() as Record<string, unknown>;
    void _buang;
    assert.ok(validasiKompatibilitas(tanpaVersi).some((m) => m.includes('version')));
  });

  it('versi dari aplikasi lebih baru ditolak tegas', () => {
    const masalah = validasiKompatibilitas({ ...backupDasar(), version: '9.9.9' });
    assert.ok(masalah.some((m) => m.includes('LEBIH BARU')));
  });

  it('payload bukan objek ditolak', () => {
    assert.ok(validasiKompatibilitas(null).length > 0);
  });
});

describe('bandingkanVersi', () => {
  it('mengurutkan semver dengan benar', () => {
    assert.ok(bandingkanVersi('1.1.0', '1.3.0') < 0);
    assert.equal(bandingkanVersi('1.3.0', '1.3.0'), 0);
    assert.ok(bandingkanVersi('1.10.0', '1.3.0') > 0);
  });
});

describe('validasiStrukturBackup', () => {
  it('payload valid = tanpa masalah', () => {
    assert.deepEqual(validasiStrukturBackup(backupDasar()), []);
  });

  it('tanpa array siswa ditolak', () => {
    const { siswa: _buang, ...tanpaSiswa } = backupDasar() as Record<string, unknown>;
    void _buang;
    assert.ok(validasiStrukturBackup(tanpaSiswa).some((m) => m.includes('siswa')));
  });

  it('duplikat id siswa ditolak', () => {
    const b = backupDasar();
    b.siswa.push({ ...b.siswa[0] });
    assert.ok(validasiStrukturBackup(b).some((m) => m.includes('Duplikat id siswa')));
  });

  it('siswa tanpa id ditolak', () => {
    const b = backupDasar();
    (b.siswa as unknown[]).push({ namaLengkap: 'TANPA ID' });
    assert.ok(validasiStrukturBackup(b).some((m) => m.includes('tanpa id')));
  });

  it('duplikat username (case-insensitive) ditolak', () => {
    const b = backupDasar();
    b.users.push({ id: 'u2', username: 'ADMIN', role: 'operator' });
    assert.ok(validasiStrukturBackup(b).some((m) => m.includes('Duplikat username')));
  });

  it('koleksi bukan array ditolak', () => {
    const b = { ...backupDasar(), rombel: 'bukan-array' };
    assert.ok(validasiStrukturBackup(b).some((m) => m.includes('rombel')));
  });
});

describe('periksaRelasiBackup (peringatan non-fatal)', () => {
  it('payload bersih = tanpa peringatan', () => {
    assert.deepEqual(periksaRelasiBackup(backupDasar()), []);
  });

  it('siswa merujuk rombel tak dikenal memberi peringatan, bukan penolakan', () => {
    const b = backupDasar();
    (b.siswa[0] as { rombelSaatIni: string }).rombelSaatIni = '9Z';
    const peringatan = periksaRelasiBackup(b);
    assert.equal(peringatan.length, 1);
    assert.match(peringatan[0], /rombel/);
  });

  it('NISN ganda memberi peringatan', () => {
    const b = backupDasar();
    (b.siswa[1] as { nisn: string }).nisn = '1234567890';
    assert.ok(periksaRelasiBackup(b).some((p) => p.includes('NISN')));
  });
});

describe('deteksiCadanganTerenkripsi', () => {
  it('envelope terenkripsi v1 terdeteksi', () => {
    const envelope = JSON.stringify({ v: 1, alg: 'x', salt: 'c2FsdA==', iv: 'aXY=', data: 'ZGF0YQ==' });
    assert.equal(deteksiCadanganTerenkripsi(envelope), true);
  });

  it('JSON backup biasa bukan terenkripsi', () => {
    assert.equal(deteksiCadanganTerenkripsi(JSON.stringify(backupDasar())), false);
  });

  it('teks sampah bukan terenkripsi', () => {
    assert.equal(deteksiCadanganTerenkripsi('bukan json {{{'), false);
  });
});
