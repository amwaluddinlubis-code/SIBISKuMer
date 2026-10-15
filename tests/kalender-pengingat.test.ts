/**
 * Tes regresi Kalender & Pengingat Tenggat — Issue #8.
 * Dijalankan dengan `npm test` (tsx + node:test).
 * Hanya menguji logika murni (src/utils/kalender.ts): tidak menyentuh
 * IndexedDB / localStorage / jaringan. Tidak ada data siswa sungguhan.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AppUser, PengaturanKalender, TugasAdministrasi } from '../src/types';
import {
  bolehKelolaTenggat,
  bolehUbahStatusTenggat,
  cariDuplikatTugas,
  hariIniDiZona,
  hitungJumlahPengingatAktif,
  hitungPengingat,
  kunciPengingat,
  labelStatusTenggat,
  normalisasiPengaturanKalender,
  pengaturanKalenderBawaan,
  selisihHariKalender,
  statusTenggat,
  tanggalDiZona,
  tanggalKalenderValid,
  tugasTerlihat,
  validasiTugas,
  zonaWaktuValid,
} from '../src/utils/kalender';

const ADMIN: AppUser = {
  id: 'u-admin',
  username: 'administrator',
  namaLengkap: 'Admin',
  role: 'administrator',
  email: 'admin@sekolah.test',
  status: 'aktif',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const OPERATOR: AppUser = {
  id: 'u-op',
  username: 'operator_bukuinduk',
  namaLengkap: 'Operator',
  role: 'operator',
  email: 'op@sekolah.test',
  rombelAkses: ['7A'],
  status: 'aktif',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const OPERATOR_LAIN: AppUser = {
  ...OPERATOR,
  id: 'u-op2',
  username: 'operator_kesiswaan',
  namaLengkap: 'Operator Lain',
};

function tugas(over: Partial<TugasAdministrasi> = {}): TugasAdministrasi {
  return {
    id: 'tgs-1',
    judul: 'Kirim laporan BOS',
    tanggalJatuhTempo: '2026-10-20',
    status: 'belum',
    dibuatOleh: 'administrator',
    dibuatPada: '2026-10-15T00:00:00.000Z',
    diubahPada: '2026-10-15T00:00:00.000Z',
    ...over,
  };
}

function pengaturan(over: Partial<PengaturanKalender> = {}): PengaturanKalender {
  return { zonaWaktu: 'Asia/Jakarta', ingatkanHariSebelum: 3, ingatkanTerlambat: true, kanal: 'dalam_aplikasi', ...over };
}

describe('zona waktu', () => {
  test('zona IANA valid diterima, zona asal ditolak', () => {
    assert.equal(zonaWaktuValid('Asia/Jakarta'), true);
    assert.equal(zonaWaktuValid('Asia/Makassar'), true);
    assert.equal(zonaWaktuValid('UTC'), true);
    assert.equal(zonaWaktuValid('Bukan/Zona'), false);
    assert.equal(zonaWaktuValid(''), false);
  });

  test('tengah malam UTC = pagi yang sama di WIB, hari berbeda di zona UTC-5', () => {
    // 2026-10-15T00:30:00Z → 07:30 WIB (15 Okt) vs 20:30 New York (14 Okt).
    const d = new Date('2026-10-15T00:30:00.000Z');
    assert.equal(tanggalDiZona(d, 'Asia/Jakarta'), '2026-10-15');
    assert.equal(tanggalDiZona(d, 'America/New_York'), '2026-10-14');
    assert.equal(hariIniDiZona('Asia/Jakarta', d), '2026-10-15');
  });

  test('batas hari: tenggat "hari ini" di WIB belum "hari ini" di UTC pada dini hari', () => {
    // 2026-10-15T17:30:00Z = 00:30 WIB tanggal 16, masih 17:30 UTC tanggal 15.
    const sekarang = new Date('2026-10-15T17:30:00.000Z');
    const t = tugas({ tanggalJatuhTempo: '2026-10-16' });
    assert.equal(statusTenggat(t, pengaturan({ zonaWaktu: 'Asia/Jakarta' }), sekarang), 'jatuh_tempo_hari_ini');
    assert.equal(statusTenggat(t, pengaturan({ zonaWaktu: 'UTC' }), sekarang), 'segera');
  });

  test('pengaturan rusak dinormalisasi: zona invalid → bawaan, lead dijepit 0–30, kanal dipaksa dalam_aplikasi', () => {
    const n = normalisasiPengaturanKalender({
      zonaWaktu: 'Bukan/Zona',
      ingatkanHariSebelum: 99,
      ingatkanTerlambat: false,
      kanal: 'email',
    });
    assert.equal(zonaWaktuValid(n.zonaWaktu), true);
    assert.equal(n.ingatkanHariSebelum, 30);
    assert.equal(n.ingatkanTerlambat, false);
    assert.equal(n.kanal, 'dalam_aplikasi');
    const n2 = normalisasiPengaturanKalender({ ingatkanHariSebelum: -5 });
    assert.equal(n2.ingatkanHariSebelum, 0);
    const n3 = normalisasiPengaturanKalender(null);
    assert.deepEqual(n3, pengaturanKalenderBawaan());
  });
});

describe('tanggal batas & status tenggat', () => {
  test('tanggal kalender nyata diterima; 30 Feb / bulan 13 ditolak', () => {
    assert.equal(tanggalKalenderValid('2026-02-28'), true);
    assert.equal(tanggalKalenderValid('2024-02-29'), true); // kabisat
    assert.equal(tanggalKalenderValid('2026-02-30'), false);
    assert.equal(tanggalKalenderValid('2026-13-01'), false);
    assert.equal(tanggalKalenderValid('2026-00-10'), false);
    assert.equal(tanggalKalenderValid('15-10-2026'), false);
    assert.equal(tanggalKalenderValid(''), false);
  });

  test('selisih hari kalender: batas bulan & tahun', () => {
    assert.equal(selisihHariKalender('2026-10-20', '2026-10-15'), 5);
    assert.equal(selisihHariKalender('2026-11-01', '2026-10-31'), 1);
    assert.equal(selisihHariKalender('2027-01-01', '2026-12-31'), 1);
    assert.equal(selisihHariKalender('2026-10-15', '2026-10-15'), 0);
    assert.equal(selisihHariKalender('2026-10-14', '2026-10-15'), -1);
  });

  test('status: terlambat / hari ini / segera (tepat di ambang) / mendatang / selesai / tanpa tenggat', () => {
    const sekarang = new Date('2026-10-15T02:00:00.000Z'); // 09:00 WIB 15 Okt
    const cfg = pengaturan();
    assert.equal(statusTenggat(tugas({ tanggalJatuhTempo: '2026-10-14' }), cfg, sekarang), 'terlambat');
    assert.equal(statusTenggat(tugas({ tanggalJatuhTempo: '2026-10-15' }), cfg, sekarang), 'jatuh_tempo_hari_ini');
    // Ambang lead = 3: selisih 3 = segera, selisih 4 = mendatang.
    assert.equal(statusTenggat(tugas({ tanggalJatuhTempo: '2026-10-18' }), cfg, sekarang), 'segera');
    assert.equal(statusTenggat(tugas({ tanggalJatuhTempo: '2026-10-19' }), cfg, sekarang), 'mendatang');
    assert.equal(statusTenggat(tugas({ tanggalJatuhTempo: '2026-10-14', status: 'selesai' }), cfg, sekarang), 'selesai');
    assert.equal(statusTenggat(tugas({ tanggalJatuhTempo: '' }), cfg, sekarang), 'tanpa_tenggat');
    // lead 0: besok sudah mendatang, bukan segera.
    assert.equal(
      statusTenggat(tugas({ tanggalJatuhTempo: '2026-10-16' }), pengaturan({ ingatkanHariSebelum: 0 }), sekarang),
      'mendatang'
    );
  });

  test('label status tersedia untuk semua status', () => {
    for (const s of ['selesai', 'tanpa_tenggat', 'terlambat', 'jatuh_tempo_hari_ini', 'segera', 'mendatang'] as const) {
      assert.ok(labelStatusTenggat(s).length > 0, s);
    }
  });
});

describe('validasi tugas', () => {
  test('judul wajib & maks 120; tanggal invalid ditolak; kategori & prioritas dibatasi', () => {
    assert.ok(validasiTugas({ judul: '  ' }).some((e) => /judul/i.test(e)));
    assert.ok(validasiTugas({ judul: 'x'.repeat(121) }).length > 0);
    assert.ok(validasiTugas({ judul: 'OK', tanggalJatuhTempo: '2026-02-30' }).some((e) => /tanggal/i.test(e)));
    assert.ok(validasiTugas({ judul: 'OK', kategori: 'x'.repeat(41) }).length > 0);
    assert.ok(validasiTugas({ judul: 'OK', prioritas: 'super' }).length > 0);
    assert.deepEqual(validasiTugas({ judul: ' Kirim laporan ', tanggalJatuhTempo: '2026-10-20', prioritas: 'tinggi' }), []);
    assert.deepEqual(validasiTugas({ judul: 'Tanpa tenggat' }), []);
  });
});

describe('otorisasi', () => {
  test('kelola (buat/ubah/hapus): hanya administrator', () => {
    assert.equal(bolehKelolaTenggat(ADMIN), true);
    assert.equal(bolehKelolaTenggat(OPERATOR), false);
    assert.equal(bolehKelolaTenggat(null), false);
    assert.equal(bolehKelolaTenggat(undefined), false);
  });

  test('ubah status: admin semua; operator hanya tugas yang ditugaskan kepadanya', () => {
    const milikOperator = tugas({ penanggungJawab: 'operator_bukuinduk' });
    const milikLain = tugas({ penanggungJawab: 'operator_kesiswaan' });
    const umum = tugas({ penanggungJawab: '' });
    assert.equal(bolehUbahStatusTenggat(ADMIN, milikOperator), true);
    assert.equal(bolehUbahStatusTenggat(OPERATOR, milikOperator), true);
    assert.equal(bolehUbahStatusTenggat(OPERATOR, milikLain), false);
    // Tugas umum tidak dapat diselesaikan operator — hanya admin.
    assert.equal(bolehUbahStatusTenggat(OPERATOR, umum), false);
    assert.equal(bolehUbahStatusTenggat(null, milikOperator), false);
  });

  test('visibilitas: operator melihat tugasnya + tugas umum, bukan tugas operator lain', () => {
    assert.equal(tugasTerlihat(ADMIN, tugas({ penanggungJawab: 'siapa_pun' })), true);
    assert.equal(tugasTerlihat(OPERATOR, tugas({ penanggungJawab: 'operator_bukuinduk' })), true);
    assert.equal(tugasTerlihat(OPERATOR, tugas({ penanggungJawab: '' })), true);
    assert.equal(tugasTerlihat(OPERATOR, tugas({ penanggungJawab: 'operator_kesiswaan' })), false);
    assert.equal(tugasTerlihat(OPERATOR_LAIN, tugas({ penanggungJawab: 'operator_bukuinduk' })), false);
    // Pencocokan username tak peduli kapitalisasi.
    assert.equal(tugasTerlihat(OPERATOR, tugas({ penanggungJawab: 'Operator_BukuInduk' })), true);
  });
});

describe('pengingat & anti-duplikat', () => {
  const sekarang = new Date('2026-10-15T02:00:00.000Z'); // 09:00 WIB 15 Okt
  const cfg = pengaturan();

  test('pengingat muncul untuk terlambat, hari ini, dan dalam jendela lead — tidak untuk mendatang/selesai/tanpa tenggat', () => {
    const daftar = [
      tugas({ id: 't-terlambat', tanggalJatuhTempo: '2026-10-14' }),
      tugas({ id: 't-hari-ini', tanggalJatuhTempo: '2026-10-15' }),
      tugas({ id: 't-segera', tanggalJatuhTempo: '2026-10-17' }),
      tugas({ id: 't-mendatang', tanggalJatuhTempo: '2026-10-25' }),
      tugas({ id: 't-selesai', tanggalJatuhTempo: '2026-10-14', status: 'selesai' }),
      tugas({ id: 't-tanpa', tanggalJatuhTempo: '' }),
    ];
    const hasil = hitungPengingat(daftar, cfg, new Set(), sekarang);
    assert.deepEqual(hasil.map((h) => h.tugas.id), ['t-terlambat', 't-hari-ini', 't-segera']);
    assert.deepEqual(hasil.map((h) => h.urgensi), ['terlambat', 'hari_ini', 'segera']);
  });

  test('duplikasi: kunci yang sudah disampaikan tidak dihitung lagi (pengingat kedua kosong)', () => {
    const daftar = [tugas({ id: 't-1', tanggalJatuhTempo: '2026-10-15' })];
    const pertama = hitungPengingat(daftar, cfg, new Set(), sekarang);
    assert.equal(pertama.length, 1);
    const terkirim = new Set([pertama[0].kunci]);
    assert.equal(hitungPengingat(daftar, cfg, terkirim, sekarang).length, 0);
    // Kunci stabil: tugas + tenggat + ambang yang sama → kunci sama.
    assert.equal(kunciPengingat('t-1', '2026-10-15', 0), pertama[0].kunci);
    assert.notEqual(kunciPengingat('t-1', '2026-10-16', 0), pertama[0].kunci);
    assert.notEqual(kunciPengingat('t-2', '2026-10-15', 0), pertama[0].kunci);
  });

  test('mengubah tenggat menghasilkan kunci baru → pengingat baru (bukan duplikat lama)', () => {
    const lama = tugas({ id: 't-1', tanggalJatuhTempo: '2026-10-15' });
    const pertama = hitungPengingat([lama], cfg, new Set(), sekarang);
    const terkirim = new Set([pertama[0].kunci]);
    const diubah = tugas({ id: 't-1', tanggalJatuhTempo: '2026-10-16' });
    const kedua = hitungPengingat([diubah], cfg, terkirim, sekarang);
    assert.equal(kedua.length, 1);
    assert.notEqual(kedua[0].kunci, pertama[0].kunci);
  });

  test('ingatkanTerlambat=false menekan pengingat terlambat saja', () => {
    const daftar = [
      tugas({ id: 't-terlambat', tanggalJatuhTempo: '2026-10-14' }),
      tugas({ id: 't-hari-ini', tanggalJatuhTempo: '2026-10-15' }),
    ];
    const hasil = hitungPengingat(daftar, pengaturan({ ingatkanTerlambat: false }), new Set(), sekarang);
    assert.deepEqual(hasil.map((h) => h.tugas.id), ['t-hari-ini']);
  });

  test('jumlah pengingat aktif = terlambat + hari ini + segera (selesai/tanpa tenggat dikecualikan)', () => {
    const daftar = [
      tugas({ id: 'a', tanggalJatuhTempo: '2026-10-14' }),
      tugas({ id: 'b', tanggalJatuhTempo: '2026-10-15' }),
      tugas({ id: 'c', tanggalJatuhTempo: '2026-10-17' }),
      tugas({ id: 'd', tanggalJatuhTempo: '2026-10-25' }),
      tugas({ id: 'e', tanggalJatuhTempo: '2026-10-14', status: 'selesai' }),
      tugas({ id: 'f', tanggalJatuhTempo: '' }),
    ];
    assert.equal(hitungJumlahPengingatAktif(daftar, cfg, sekarang), 3);
  });
});

describe('pencegahan duplikat tugas', () => {
  test('judul sama + tenggat sama + PJ sama → duplikat; beda tanggal / PJ / kapitalisasi spasi tidak', () => {
    const daftar = [tugas({ id: 't-1', judul: 'Kirim Laporan BOS', tanggalJatuhTempo: '2026-10-20', penanggungJawab: 'operator_bukuinduk' })];
    assert.equal(
      cariDuplikatTugas(daftar, { judul: 'kirim  laporan   bos', tanggalJatuhTempo: '2026-10-20', penanggungJawab: 'operator_bukuinduk' }).length,
      1
    );
    assert.equal(
      cariDuplikatTugas(daftar, { judul: 'Kirim Laporan BOS', tanggalJatuhTempo: '2026-10-21', penanggungJawab: 'operator_bukuinduk' }).length,
      0
    );
    assert.equal(
      cariDuplikatTugas(daftar, { judul: 'Kirim Laporan BOS', tanggalJatuhTempo: '2026-10-20', penanggungJawab: 'operator_kesiswaan' }).length,
      0
    );
    assert.equal(
      cariDuplikatTugas(daftar, { judul: 'Kirim Laporan BOS', tanggalJatuhTempo: '2026-10-20', penanggungJawab: 'operator_bukuinduk' }, 't-1').length,
      0,
      'edit tugas yang sama bukan duplikat dirinya sendiri'
    );
    // Tugas selesai tidak dihitung sebagai duplikat.
    const selesai = [tugas({ id: 't-9', judul: 'Kirim Laporan BOS', tanggalJatuhTempo: '2026-10-20', penanggungJawab: 'operator_bukuinduk', status: 'selesai' })];
    assert.equal(
      cariDuplikatTugas(selesai, { judul: 'Kirim Laporan BOS', tanggalJatuhTempo: '2026-10-20', penanggungJawab: 'operator_bukuinduk' }).length,
      0
    );
  });
});
