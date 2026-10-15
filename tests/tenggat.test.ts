/**
 * Tes regresi Kalender & Tenggat administrasi — Issue #8.
 * Dijalankan dengan `npm test` (tsx + node:test).
 * Hanya menguji logika murni `src/utils/tenggat.ts` (tanpa DOM/IndexedDB),
 * sehingga deterministik termasuk kasus lintas zona waktu.
 * TIDAK memakai data siswa nyata — tugas tidak memiliki field data siswa.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PENGATURAN_PENGINGAT_BAWAAN,
  geserTanggalKalender,
  isTanggalKalenderValid,
  isZonaWaktuValid,
  kunciPengingatUntukTugas,
  normalisasiPengaturanPengingat,
  normalisasiTenggat,
  pengingatJatuhTempo,
  ringkasanTenggat,
  selisihHariKalender,
  statusTurunan,
  tanggalDiZonaWaktu,
  tugasMendesak,
  urutkanTenggat,
  validasiTenggat,
} from '../src/utils/tenggat';
import type { PengaturanPengingat, TugasTenggat } from '../src/types';

function tugas(over: Partial<TugasTenggat> = {}): TugasTenggat {
  return {
    id: 'tenggat-1',
    judul: 'Kirim laporan BOS',
    kategori: 'laporan',
    status: 'terbuka',
    prioritas: 2,
    tanggalJatuhTempo: '2026-10-20',
    dibuatOleh: 'administrator',
    dibuatPada: '2026-10-15T00:00:00.000Z',
    diubahPada: '2026-10-15T00:00:00.000Z',
    ...over,
  };
}

const PENGATURAN: PengaturanPengingat = {
  zonaWaktu: 'Asia/Jakarta',
  kanal: 'in-app',
  aktif: true,
  hariSebelum: [7, 3, 1, 0],
  pengingatTerlambatHarian: true,
};

describe('validasi tanggal kalender', () => {
  test('menerima tanggal nyata, menolak tanggal fiktif & format salah', () => {
    assert.equal(isTanggalKalenderValid('2026-10-20'), true);
    assert.equal(isTanggalKalenderValid('2024-02-29'), true); // kabisat
    assert.equal(isTanggalKalenderValid('2026-02-30'), false);
    assert.equal(isTanggalKalenderValid('2026-13-01'), false);
    assert.equal(isTanggalKalenderValid('20-10-2026'), false);
    assert.equal(isTanggalKalenderValid(''), false);
  });

  test('menggeser tanggal melewati batas bulan & tahun', () => {
    assert.equal(geserTanggalKalender('2026-01-01', -1), '2025-12-31');
    assert.equal(geserTanggalKalender('2026-03-01', -1), '2026-02-28');
    assert.equal(geserTanggalKalender('2026-10-15', 7), '2026-10-22');
    assert.equal(selisihHariKalender('2026-10-15', '2026-10-20'), 5);
    assert.equal(selisihHariKalender('2026-10-20', '2026-10-15'), -5);
  });
});

describe('zona waktu', () => {
  test('momen yang sama = tanggal berbeda di tiap zona waktu', () => {
    // 2026-10-15 17:00 UTC = 16 Okt 00:00 WIB = 16 Okt 02:00 WIT.
    const saat = new Date('2026-10-15T17:00:00.000Z');
    assert.equal(tanggalDiZonaWaktu('UTC', saat), '2026-10-15');
    assert.equal(tanggalDiZonaWaktu('Asia/Jakarta', saat), '2026-10-16');
    assert.equal(tanggalDiZonaWaktu('Asia/Jayapura', saat), '2026-10-16');
  });

  test('zona tak dikenal ditolak & jatuh ke bawaan Asia/Jakarta', () => {
    assert.equal(isZonaWaktuValid('Asia/Jakarta'), true);
    assert.equal(isZonaWaktuValid('Bukan/Zona'), false);
    assert.equal(isZonaWaktuValid(''), false);
    assert.equal(tanggalDiZonaWaktu('Bukan/Zona', new Date('2026-10-15T17:00:00.000Z')), '2026-10-16');
  });

  test('normalisasi pengaturan: zona rusak → Jakarta, kanal dipaksa in-app', () => {
    const hasil = normalisasiPengaturanPengingat({
      zonaWaktu: 'Bukan/Zona',
      kanal: 'email',
      hariSebelum: [7, 7, 99, 3],
    });
    assert.equal(hasil.zonaWaktu, 'Asia/Jakarta');
    assert.equal(hasil.kanal, 'in-app');
    assert.deepEqual(hasil.hariSebelum, [7, 3]); // duplikat & nilai liar dibuang
    assert.equal(PENGATURAN_PENGINGAT_BAWAAN.kanal, 'in-app');
  });
});

describe('validasi tugas', () => {
  test('tugas lengkap lolos; judul kosong & tanggal fiktif ditolak', () => {
    assert.deepEqual(validasiTenggat(tugas()), []);
    assert.ok(validasiTenggat(tugas({ judul: '   ' })).some((e) => e.field === 'judul'));
    assert.ok(validasiTenggat(tugas({ judul: 'x'.repeat(121) })).some((e) => e.field === 'judul'));
    assert.ok(validasiTenggat(tugas({ tanggalJatuhTempo: '2026-02-30' })).some((e) => e.field === 'tanggalJatuhTempo'));
    assert.ok(validasiTenggat(tugas({ deskripsi: 'x'.repeat(501) })).some((e) => e.field === 'deskripsi'));
  });

  test('kategori, prioritas & tautan tindakan liar ditolak', () => {
    assert.ok(validasiTenggat(tugas({ kategori: 'ngawur' as never })).some((e) => e.field === 'kategori'));
    assert.ok(validasiTenggat(tugas({ prioritas: 9 as never })).some((e) => e.field === 'prioritas'));
    assert.ok(
      validasiTenggat(tugas({ tautanTindakan: { tab: 'halaman-tidak-ada' as never } })).some(
        (e) => e.field === 'tautanTindakan',
      ),
    );
    assert.deepEqual(validasiTenggat(tugas({ tautanTindakan: { tab: 'siswa', label: 'Buka Master Siswa' } })), []);
    assert.deepEqual(validasiTenggat(tugas({ tautanTindakan: null })), []);
  });
});

describe('normalisasi record (restore backup)', () => {
  test('membuang field tak dikenal — termasuk field data siswa bila terselip', () => {
    const hasil = normalisasiTenggat({
      ...tugas(),
      nisn: '1234567890',
      nik: '1234567890123456',
      namaSiswa: 'Budi',
      fieldLiar: true,
    });
    assert.ok(hasil);
    assert.equal('nisn' in hasil!, false);
    assert.equal('nik' in hasil!, false);
    assert.equal('namaSiswa' in hasil!, false);
    assert.equal('fieldLiar' in hasil!, false);
  });

  test('menolak record tanpa id / tanggal tak valid, memberi bawaan aman', () => {
    assert.equal(normalisasiTenggat({ ...tugas(), id: '' }), null);
    assert.equal(normalisasiTenggat({ ...tugas(), tanggalJatuhTempo: 'kemarin' }), null);
    assert.equal(normalisasiTenggat(null), null);
    const hasil = normalisasiTenggat({ ...tugas(), kategori: undefined, prioritas: undefined });
    assert.equal(hasil?.kategori, 'lainnya');
    assert.equal(hasil?.prioritas, 2);
  });
});

describe('status turunan & urutan', () => {
  test('terbuka diklasifikasikan terhadap hari ini; selesai/dibatalkan tak pernah terlambat', () => {
    const hariIni = '2026-10-15';
    assert.equal(statusTurunan(tugas({ tanggalJatuhTempo: '2026-10-10' }), hariIni), 'terlambat');
    assert.equal(statusTurunan(tugas({ tanggalJatuhTempo: '2026-10-15' }), hariIni), 'hari-ini');
    assert.equal(statusTurunan(tugas({ tanggalJatuhTempo: '2026-10-16' }), hariIni), 'besok');
    assert.equal(statusTurunan(tugas({ tanggalJatuhTempo: '2026-12-01' }), hariIni), 'mendatang');
    assert.equal(statusTurunan(tugas({ status: 'selesai', tanggalJatuhTempo: '2026-10-10' }), hariIni), 'selesai');
    assert.equal(statusTurunan(tugas({ status: 'dibatalkan', tanggalJatuhTempo: '2026-10-10' }), hariIni), 'dibatalkan');
  });

  test('mendesak = terlambat atau hari ini saja', () => {
    assert.equal(tugasMendesak(tugas({ tanggalJatuhTempo: '2026-10-10' }), '2026-10-15'), true);
    assert.equal(tugasMendesak(tugas({ tanggalJatuhTempo: '2026-10-15' }), '2026-10-15'), true);
    assert.equal(tugasMendesak(tugas({ tanggalJatuhTempo: '2026-10-16' }), '2026-10-15'), false);
  });

  test('urut: terlambat → hari ini → terdekat → selesai/dibatalkan terakhir', () => {
    const daftar = [
      tugas({ id: 'selesai', status: 'selesai', tanggalJatuhTempo: '2026-10-01' }),
      tugas({ id: 'mendatang', tanggalJatuhTempo: '2026-11-01' }),
      tugas({ id: 'hari-ini', tanggalJatuhTempo: '2026-10-15' }),
      tugas({ id: 'terlambat', tanggalJatuhTempo: '2026-10-10' }),
      tugas({ id: 'batal', status: 'dibatalkan', tanggalJatuhTempo: '2026-10-01' }),
    ];
    assert.deepEqual(
      urutkanTenggat(daftar, '2026-10-15').map((t) => t.id),
      ['terlambat', 'hari-ini', 'mendatang', 'selesai', 'batal'],
    );
  });

  test('ringkasan menghitung tiap status', () => {
    const daftar = [
      tugas({ id: 'a', tanggalJatuhTempo: '2026-10-10' }),
      tugas({ id: 'b', tanggalJatuhTempo: '2026-10-15' }),
      tugas({ id: 'c', tanggalJatuhTempo: '2026-10-20' }),
      tugas({ id: 'd', status: 'selesai', tanggalJatuhTempo: '2026-10-01' }),
      tugas({ id: 'e', status: 'dibatalkan', tanggalJatuhTempo: '2026-10-01' }),
    ];
    assert.deepEqual(ringkasanTenggat(daftar, '2026-10-15'), {
      total: 5,
      terbuka: 3,
      terlambat: 1,
      hariIni: 1,
      selesai: 1,
      dibatalkan: 1,
    });
  });
});

describe('pengingat & dedup', () => {
  test('tepat H-7: satu pengingat; terkirim tidak diulang', () => {
    const t = tugas({ tanggalJatuhTempo: '2026-10-22' }); // H-7 dari 15 Okt
    const pertama = pengingatJatuhTempo([t], PENGATURAN, [], '2026-10-15');
    assert.equal(pertama.baru.length, 1);
    assert.equal(pertama.baru[0].jenis, 'h-minus');
    assert.equal(pertama.baru[0].hariSebelum, 7);
    assert.equal(pertama.baru[0].kunci, 'tenggat-1:H7');
    const kedua = pengingatJatuhTempo([t], PENGATURAN, new Set(pertama.kunciBaru), '2026-10-15');
    assert.equal(kedua.baru.length, 0);
  });

  test('catch-up: aplikasi tak dibuka berhari-hari → satu pengingat paling mendesak', () => {
    const t = tugas({ tanggalJatuhTempo: '2026-10-17' }); // H-7 & H-3 terlewat
    const hasil = pengingatJatuhTempo([t], PENGATURAN, [], '2026-10-15');
    assert.equal(hasil.baru.length, 1);
    assert.equal(hasil.baru[0].hariSebelum, 3);
    assert.equal(hasil.baru[0].kunci, 'tenggat-1:H3');
  });

  test('hari-H memakai pengingat H-0; besok memakai H-1', () => {
    const hariH = pengingatJatuhTempo([tugas({ tanggalJatuhTempo: '2026-10-15' })], PENGATURAN, [], '2026-10-15');
    assert.equal(hariH.baru.length, 1);
    assert.equal(hariH.baru[0].jenis, 'hari-ini');
    assert.equal(hariH.baru[0].hariSebelum, 0);
    const besok = pengingatJatuhTempo([tugas({ tanggalJatuhTempo: '2026-10-16' })], PENGATURAN, [], '2026-10-15');
    assert.equal(besok.baru.length, 1);
    assert.equal(besok.baru[0].hariSebelum, 1);
  });

  test('terlambat: satu pengingat per hari, kunci memuat tanggal', () => {
    const t = tugas({ tanggalJatuhTempo: '2026-10-10' });
    const hari1 = pengingatJatuhTempo([t], PENGATURAN, [], '2026-10-15');
    assert.equal(hari1.baru.length, 1);
    assert.equal(hari1.baru[0].jenis, 'terlambat');
    assert.equal(hari1.baru[0].kunci, 'tenggat-1:terlambat:2026-10-15');
    // Hari yang sama, sudah terkirim → diam.
    assert.equal(pengingatJatuhTempo([t], PENGATURAN, new Set(hari1.kunciBaru), '2026-10-15').baru.length, 0);
    // Besok: kunci baru → mengingatkan lagi sekali.
    const hari2 = pengingatJatuhTempo([t], PENGATURAN, new Set(hari1.kunciBaru), '2026-10-16');
    assert.equal(hari2.baru.length, 1);
    assert.equal(hari2.baru[0].kunci, 'tenggat-1:terlambat:2026-10-16');
  });

  test('tugas selesai/dibatalkan & pengingat nonaktif tidak pernah mengingatkan', () => {
    const selesai = tugas({ status: 'selesai', tanggalJatuhTempo: '2026-10-15' });
    const batal = tugas({ id: 'x', status: 'dibatalkan', tanggalJatuhTempo: '2026-10-10' });
    assert.equal(pengingatJatuhTempo([selesai, batal], PENGATURAN, [], '2026-10-15').baru.length, 0);
    assert.equal(
      pengingatJatuhTempo([tugas({ tanggalJatuhTempo: '2026-10-15' })], { ...PENGATURAN, aktif: false }, [], '2026-10-15')
        .baru.length,
      0,
    );
    assert.equal(
      pengingatJatuhTempo([tugas({ tanggalJatuhTempo: '2026-10-10' })], { ...PENGATURAN, pengingatTerlambatHarian: false }, [], '2026-10-15')
        .baru.length,
      0,
    );
  });

  test('tugas jauh dari tenggat belum mengingatkan', () => {
    const jauh = pengingatJatuhTempo([tugas({ tanggalJatuhTempo: '2026-12-01' })], PENGATURAN, [], '2026-10-15');
    assert.equal(jauh.baru.length, 0);
  });

  test('kunci dedup tugas mencakup semua H-minus yang dikonfigurasi', () => {
    assert.deepEqual(kunciPengingatUntukTugas('tenggat-1', PENGATURAN), [
      'tenggat-1:H7',
      'tenggat-1:H3',
      'tenggat-1:H1',
      'tenggat-1:H0',
    ]);
  });
});
