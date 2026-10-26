/**
 * Tes regresi Kenaikan Kelas & Pembentukan Rombel — Issue #6.
 * Dijalankan dengan `npm test` (tsx + node:test).
 * Hanya menguji logika murni (src/utils/promosi.ts): tidak menyentuh
 * IndexedDB / localStorage / server / jaringan. Tidak ada data siswa sungguhan.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { RiwayatTahunAjaran, Siswa } from '../src/types';
import {
  batalkanPromosi,
  isEntriPromosi,
  siswaSudahDipromosi,
  terapkanRencanaPromosi,
  validasiRencanaPromosi,
} from '../src/utils/promosi';
import type { RencanaPromosi } from '../src/utils/promosi';

function siswa(id: string, rombel: string, over: Partial<Siswa> = {}): Siswa {
  return {
    id,
    namaLengkap: `Siswa ${id}`,
    statusSiswa: 'Aktif',
    rombelSaatIni: rombel,
    riwayatTahunAjaran: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...over,
  } as unknown as Siswa;
}

function grup(over: Partial<RencanaPromosi> = {}): RencanaPromosi {
  return {
    key: '7::7A',
    tingkat: '7',
    rombel: '7A',
    ids: [],
    status: 'Naik Kelas',
    nextTingkat: '8',
    nextRombel: '8A',
    ...over,
  };
}

const AKTIF = [
  siswa('s1', '7A'),
  siswa('s2', '7A'),
  siswa('s3', '7B'),
  siswa('s4', '9A'),
];

function rencanaDasar(): RencanaPromosi[] {
  return [
    grup({ key: '7::7A', tingkat: '7', rombel: '7A', ids: ['s1', 's2'] }),
    grup({ key: '7::7B', tingkat: '7', rombel: '7B', ids: ['s3'], nextRombel: '8B' }),
    grup({ key: '9::9A', tingkat: '9', rombel: '9A', ids: ['s4'], status: 'Lulus', nextTingkat: '9', nextRombel: '9A' }),
  ];
}

describe('validasi rencana promosi', () => {
  test('rencana valid lolos tanpa error', () => {
    const v = validasiRencanaPromosi({ plan: rencanaDasar(), siswaAktif: AKTIF, tingkatAkhir: '9' });
    assert.deepEqual(v.errors, []);
    assert.equal(v.ringkasan.lulus, 1);
    assert.equal(v.ringkasan.naik, 3);
    assert.equal(v.ringkasan.totalRencana, 4);
    assert.deepEqual(v.takTertempat, []);
  });

  test('siswa ganda antar rombel dilaporkan', () => {
    const plan = rencanaDasar();
    plan[1].ids.push('s1');
    const v = validasiRencanaPromosi({ plan, siswaAktif: AKTIF, tingkatAkhir: '9' });
    assert.ok(v.errors.some((e) => e.includes('ganda')));
    assert.deepEqual(v.ganda, ['s1']);
  });

  test('id tak dikenal dilaporkan (isolasi tenant: id sekolah lain tidak diterapkan)', () => {
    const plan = rencanaDasar();
    plan[0].ids.push('sekolah-lain-99');
    const v = validasiRencanaPromosi({ plan, siswaAktif: AKTIF, tingkatAkhir: '9' });
    assert.ok(v.errors.some((e) => e.includes('tidak ditemukan')));
    assert.deepEqual(v.takDikenal, ['sekolah-lain-99']);
  });

  test('siswa non-Aktif dalam rencana ditolak', () => {
    const daftar = [siswa('s1', '7A'), siswa('s2', '7A', { statusSiswa: 'Mutasi Keluar' }), siswa('s3', '7B'), siswa('s4', '9A')];
    const v = validasiRencanaPromosi({ plan: rencanaDasar(), siswaAktif: daftar, tingkatAkhir: '9' });
    assert.ok(v.errors.some((e) => e.includes('Mutasi Keluar')));
  });

  test('siswa aktif tanpa rombel tujuan dilaporkan hilang', () => {
    const plan = rencanaDasar();
    plan[0].ids = ['s1']; // s2 tidak direncanakan
    const v = validasiRencanaPromosi({ plan, siswaAktif: AKTIF, tingkatAkhir: '9' });
    assert.ok(v.errors.some((e) => e.includes('belum ditempatkan')));
    assert.deepEqual(v.takTertempat, ['s2']);
  });

  test('pengecualian beralasan membebaskan dari hilang; tanpa alasan ditolak', () => {
    const plan = rencanaDasar();
    plan[0].ids = ['s1'];
    plan[0].kecuali = [{ id: 's2', alasan: 'Tinggal karena sakit panjang' }];
    const v = validasiRencanaPromosi({ plan, siswaAktif: AKTIF, tingkatAkhir: '9' });
    assert.deepEqual(v.errors, []);
    assert.deepEqual(v.takTertempat, []);
    assert.equal(v.ringkasan.dikecualikan, 1);

    const plan2 = rencanaDasar();
    plan2[0].ids = ['s1'];
    plan2[0].kecuali = [{ id: 's2', alasan: '  ' }];
    const v2 = validasiRencanaPromosi({ plan: plan2, siswaAktif: AKTIF, tingkatAkhir: '9' });
    assert.ok(v2.errors.some((e) => e.includes('alasan')));
  });

  test('siswa sekaligus direncanakan dan dikecualikan ditolak', () => {
    const plan = rencanaDasar();
    plan[0].kecuali = [{ id: 's1', alasan: 'x' }];
    const v = validasiRencanaPromosi({ plan, siswaAktif: AKTIF, tingkatAkhir: '9' });
    assert.ok(v.errors.some((e) => e.includes('sekaligus')));
  });

  test('rombel kosong, tingkat baru invalid, rombel baru kosong ditolak', () => {
    const v = validasiRencanaPromosi({
      plan: [grup({ ids: [] }), grup({ key: '7::7B', rombel: '7B', ids: ['s3'], nextTingkat: '10' }), grup({ key: '9::9A', tingkat: '9', rombel: '9A', ids: ['s4'], status: 'Lulus', nextRombel: '' })],
      siswaAktif: AKTIF,
      tingkatAkhir: '9',
    });
    assert.ok(v.errors.some((e) => e.includes('kosong')));
    assert.ok(v.errors.some((e) => e.includes('Tingkat baru')));
  });

  test('tingkat akhir tidak boleh Naik; non-akhir tidak boleh Lulus', () => {
    const v1 = validasiRencanaPromosi({
      plan: [grup({ key: '9::9A', tingkat: '9', rombel: '9A', ids: ['s4'], status: 'Naik Kelas', nextTingkat: '10', nextRombel: '10A' })],
      siswaAktif: [siswa('s4', '9A')],
      tingkatAkhir: '9',
    });
    assert.ok(v1.errors.some((e) => e.includes('tidak dapat Naik')));
    const v2 = validasiRencanaPromosi({
      plan: [grup({ key: '7::7A', tingkat: '7', rombel: '7A', ids: ['s1'], status: 'Lulus' })],
      siswaAktif: [siswa('s1', '7A')],
      tingkatAkhir: '9',
    });
    assert.ok(v2.errors.some((e) => e.includes('hanya untuk tingkat akhir')));
  });

  test('kapasitas: rombel tujuan melebihi kapasitas ditolak; tanpa data kapasitas lolos', () => {
    const v = validasiRencanaPromosi({
      plan: rencanaDasar(),
      siswaAktif: AKTIF,
      tingkatAkhir: '9',
      kapasitas: { '8A': 1 },
    });
    assert.ok(v.errors.some((e) => e.includes('melebihi kapasitas') && e.includes('8A')));
    const v2 = validasiRencanaPromosi({
      plan: rencanaDasar(),
      siswaAktif: AKTIF,
      tingkatAkhir: '9',
      kapasitas: { '8A': 2, '8B': 5 },
    });
    assert.deepEqual(v2.errors, []);
  });

  test('satu rombel tujuan dari dua tingkat berbeda ditolak', () => {
    const plan = rencanaDasar();
    plan[1].nextRombel = '8A'; // 7B juga ke 8A, tapi nextTingkat tetap 8 — ubah satu:
    plan[1].nextTingkat = '7'; // seolah tinggal tapi status Naik ke rombel 8A
    const v = validasiRencanaPromosi({ plan, siswaAktif: AKTIF, tingkatAkhir: '9' });
    assert.ok(v.errors.some((e) => e.includes('dicampur')));
  });
});

describe('penerapan idempoten', () => {
  function sudahDipromosi(): Siswa {
    return siswa('s1', '8A', {
      statusSiswa: 'Aktif',
      riwayatTahunAjaran: [
        {
          id: 'rth-1',
          tahunAjaran: '2026/2027',
          tingkat: '7',
          rombel: '7A',
          statusAkhirTahun: 'Naik Kelas',
          statusKenaikan: 'Naik Kelas',
          catatan: 'Kenaikan ke rombel 8A TP 2027/2028',
        },
      ],
    });
  }

  test('deteksi sudah dipromosi dan penerapan ulang melewati tanpa ganda', () => {
    const s = sudahDipromosi();
    assert.equal(siswaSudahDipromosi(s, '2026/2027', '2027/2028'), true);
    assert.equal(siswaSudahDipromosi(s, '2025/2026', '2026/2027'), false);
    const daftar = [s, siswa('s2', '7A')];
    const plan = [grup({ ids: ['s1', 's2'] })];
    const v = validasiRencanaPromosi({ plan, siswaAktif: daftar, tingkatAkhir: '9', tahunTutup: '2026/2027', tahunBaru: '2027/2028' });
    assert.deepEqual(v.errors, []);
    assert.deepEqual(v.sudahDipromosi, ['s1']);
    assert.ok(v.peringatan.length > 0);
    const terap = terapkanRencanaPromosi(daftar, plan, { tahunTutup: '2026/2027', tahunBaru: '2027/2028' });
    assert.deepEqual(terap.dilewatiSudahDipromosi, ['s1']);
    assert.equal(terap.promosiBaru.length, 1);
    assert.equal(terap.promosiBaru[0].id, 's2');
    // Input tidak dimutasi.
    assert.equal((s.riwayatTahunAjaran || []).length, 1);
  });

  test('penerapan mengubah rombel/status dan menambah satu entri; riwayat lama utuh', () => {
    const lama: RiwayatTahunAjaran = {
      id: 'rth-lama',
      tahunAjaran: '2025/2026',
      tingkat: '6',
      rombel: '6A',
      statusAkhirTahun: 'Naik Kelas',
      statusKenaikan: 'Naik Kelas',
      catatan: 'Kenaikan ke rombel 7A TP 2026/2027',
    };
    const daftar = [siswa('s1', '7A', { riwayatTahunAjaran: [lama] }), siswa('s2', '7A'), siswa('s3', '7B'), siswa('s4', '9A', {})];
    const terap = terapkanRencanaPromosi(daftar, rencanaDasar(), { tahunTutup: '2026/2027', tahunBaru: '2027/2028' });
    assert.equal(terap.promosiBaru.length, 4);
    const s1 = terap.promosiBaru.find((x) => x.id === 's1')!;
    assert.equal(s1.rombelSaatIni, '8A');
    assert.equal(s1.statusSiswa, 'Aktif');
    assert.equal(s1.riwayatTahunAjaran?.length, 2);
    assert.equal(s1.riwayatTahunAjaran?.[0], lama);
    assert.equal(s1.riwayatTahunAjaran?.[1].tahunAjaran, '2026/2027');
    const s4 = terap.promosiBaru.find((x) => x.id === 's4')!;
    assert.equal(s4.statusSiswa, 'Lulus');
    assert.equal(s4.rombelSaatIni, '9A'); // lulus: rombel dipertahankan
    assert.equal(terap.ringkasan.lulus, 1);
    assert.equal(terap.ringkasan.naik, 3);
  });

  test('siswa tidak lagi Aktif saat penerapan dilewati dan dilaporkan', () => {
    const daftar = [siswa('s1', '7A', { statusSiswa: 'Mutasi Keluar' }), siswa('s2', '7A')];
    const terap = terapkanRencanaPromosi(daftar, [grup({ ids: ['s1', 's2'] })], { tahunTutup: '2026/2027', tahunBaru: '2027/2028' });
    assert.deepEqual(terap.dilewatiTidakAktif, ['s1']);
    assert.equal(terap.promosiBaru.length, 1);
  });
});

describe('rollback promosi', () => {
  test('membalikkan rombel/status dan menghapus hanya entri promosi tahun itu', () => {
    const lama: RiwayatTahunAjaran = {
      id: 'rth-lama',
      tahunAjaran: '2025/2026',
      tingkat: '6',
      rombel: '6A',
      statusAkhirTahun: 'Naik Kelas',
      statusKenaikan: 'Naik Kelas',
      catatan: 'Kenaikan ke rombel 7A TP 2026/2027',
    };
    const promosi: RiwayatTahunAjaran = {
      id: 'rth-baru',
      tahunAjaran: '2026/2027',
      tingkat: '7',
      rombel: '7A',
      statusAkhirTahun: 'Naik Kelas',
      statusKenaikan: 'Naik Kelas',
      catatan: 'Kenaikan ke rombel 8A TP 2027/2028',
    };
    const daftar = [
      siswa('s1', '8A', { riwayatTahunAjaran: [lama, promosi] }),
      siswa('s2', '8A', { riwayatTahunAjaran: [lama] }),
    ];
    const hasil = batalkanPromosi(daftar, { tahunTutup: '2026/2027', tahunBaru: '2027/2028' });
    assert.equal(hasil.siswa.length, 1);
    assert.equal(hasil.siswa[0].id, 's1');
    assert.equal(hasil.siswa[0].rombelSaatIni, '7A');
    assert.equal(hasil.siswa[0].statusSiswa, 'Aktif');
    assert.deepEqual(hasil.siswa[0].riwayatTahunAjaran, [lama]);
    assert.deepEqual(hasil.dilewati, []);
  });

  test('siswa yang bermutasi keluar setelah promosi tidak disentuh rollback', () => {
    const promosi: RiwayatTahunAjaran = {
      id: 'rth-baru',
      tahunAjaran: '2026/2027',
      tingkat: '7',
      rombel: '7A',
      statusAkhirTahun: 'Naik Kelas',
      statusKenaikan: 'Naik Kelas',
      catatan: 'Kenaikan ke rombel 8A TP 2027/2028',
    };
    const daftar = [siswa('s1', '8A', { statusSiswa: 'Mutasi Keluar', riwayatTahunAjaran: [promosi] })];
    const hasil = batalkanPromosi(daftar, { tahunTutup: '2026/2027', tahunBaru: '2027/2028' });
    assert.equal(hasil.siswa.length, 0);
    assert.equal(hasil.dilewati.length, 1);
    assert.equal(hasil.dilewati[0].id, 's1');
  });

  test('lulusan dikembalikan ke Aktif; entri promosi ganda tahun sama ikut terhapus', () => {
    const mk = (id: string): RiwayatTahunAjaran => ({
      id,
      tahunAjaran: '2026/2027',
      tingkat: '9',
      rombel: '9A',
      statusAkhirTahun: 'Lulus',
      statusKenaikan: 'Lulus',
      catatan: 'Kenaikan ke rombel 9A TP 2027/2028',
    });
    const daftar = [siswa('s4', '9A', { statusSiswa: 'Lulus', riwayatTahunAjaran: [mk('a'), mk('b')] })];
    const hasil = batalkanPromosi(daftar, { tahunTutup: '2026/2027', tahunBaru: '2027/2028' });
    assert.equal(hasil.siswa.length, 1);
    assert.equal(hasil.siswa[0].statusSiswa, 'Aktif');
    assert.equal(hasil.siswa[0].rombelSaatIni, '9A');
    assert.deepEqual(hasil.siswa[0].riwayatTahunAjaran, []);
  });

  test('isEntriPromosi mengenali pola catatan dan tahun', () => {
    const e = {
      id: 'x',
      tahunAjaran: '2026/2027',
      tingkat: '7',
      rombel: '7A',
      statusAkhirTahun: 'Naik Kelas',
      statusKenaikan: 'Naik Kelas',
      catatan: 'Kenaikan ke rombel 8A TP 2027/2028',
    } as unknown as import('../src/types').RiwayatTahunAjaran;
    assert.equal(isEntriPromosi(e, '2026/2027', '2027/2028'), true);
    assert.equal(isEntriPromosi(e, '2026/2027', '2028/2029'), false);
    assert.equal(isEntriPromosi({ ...e, catatan: 'Mutasi keluar ke SMPN 1' }, '2026/2027'), false);
  });
});
