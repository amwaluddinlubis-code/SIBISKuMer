/**
 * Tes regresi Manajemen Mutasi & Riwayat Status — Issue #5.
 * Dijalankan dengan `npm test` (tsx + node:test).
 * Hanya menguji logika murni (src/utils/mutasi.ts): tidak menyentuh
 * IndexedDB / localStorage / server / jaringan. Tidak ada data siswa sungguhan.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Siswa, StatusSiswa } from '../src/types';
import {
  batalkanMutasiTerakhir,
  bolehTransisi,
  buatEntriMutasiMasuk,
  entriDapatDibatalkan,
  hariIniWIB,
  kunciIdempotensiMutasi,
  labelJenisMutasi,
  nisnSudahTerdaftar,
  noSuratTerpakai,
  tanggalIsoValid,
  terapkanMutasiKeSiswa,
  validasiMutasi,
} from '../src/utils/mutasi';
import type { InputMutasi } from '../src/utils/mutasi';

const HARI_INI = '2026-10-26';
const OPERATOR = { id: 'op-1', nama: 'Operator Sekolah' };

function siswaAktif(over: Partial<Siswa> = {}): Siswa {
  return {
    id: 'sis-1',
    namaLengkap: 'Budi Santoso',
    statusSiswa: 'Aktif',
    nisn: '1234567890',
    rombelSaatIni: 'VII-A',
    riwayatMutasi: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...over,
  } as unknown as Siswa;
}

function inputKeluar(over: Partial<InputMutasi> = {}): InputMutasi {
  return {
    siswaId: 'sis-1',
    jenis: 'keluar',
    statusSebelum: 'Aktif',
    statusSesudah: 'Mutasi Keluar',
    tanggalEfektif: '2026-10-20',
    alasan: 'Pindah mengikuti orang tua',
    sekolahTujuan: 'SMP Negeri 1 Natal',
    noSurat: '421/100/SMPN3/X/2026',
    ...over,
  };
}

describe('transisi status', () => {
  test('Aktif boleh ke Mutasi Keluar, Mengundurkan Diri, Meninggal Dunia, Lulus', () => {
    for (const ke of ['Mutasi Keluar', 'Mengundurkan Diri', 'Meninggal Dunia', 'Lulus'] as StatusSiswa[]) {
      assert.equal(bolehTransisi('Aktif', ke), true);
    }
  });

  test('status non-Aktif bersifat final (hanya pembatalan yang mengembalikan)', () => {
    for (const dari of ['Lulus', 'Mutasi Keluar', 'Mengundurkan Diri', 'Meninggal Dunia'] as StatusSiswa[]) {
      for (const ke of ['Aktif', 'Lulus', 'Mutasi Keluar'] as StatusSiswa[]) {
        assert.equal(bolehTransisi(dari, ke), false);
      }
    }
  });

  test('menerapkan transisi terlarang melempar error dan tidak mengubah siswa', () => {
    const s = siswaAktif({ statusSiswa: 'Lulus' });
    assert.throws(
      () => terapkanMutasiKeSiswa(s, inputKeluar({ statusSebelum: 'Lulus' }), OPERATOR, { hariIni: HARI_INI }),
      /tidak diizinkan/,
    );
    assert.equal(s.statusSiswa, 'Lulus');
    assert.equal((s.riwayatMutasi || []).length, 0);
  });

  test('status sebelum tidak cocok melempar error', () => {
    const s = siswaAktif();
    assert.throws(
      () => terapkanMutasiKeSiswa(s, inputKeluar({ statusSebelum: 'Lulus' }), OPERATOR, { hariIni: HARI_INI }),
      /tidak sesuai/,
    );
  });
});

describe('validasi tanggal & dokumen', () => {
  test('format tanggal tidak valid ditolak', () => {
    assert.equal(tanggalIsoValid('2026-13-01'), false);
    assert.equal(tanggalIsoValid('2026-02-30'), false);
    assert.equal(tanggalIsoValid('20-10-2026'), false);
    assert.equal(tanggalIsoValid(''), false);
    assert.equal(tanggalIsoValid('2026-10-20'), true);
  });

  test('tanggal masa depan ditolak, hari ini diterima', () => {
    const besok = validasiMutasi(inputKeluar({ tanggalEfektif: '2026-10-27' }), { hariIni: HARI_INI });
    assert.ok(besok.some((e) => e.includes('melebihi hari ini')));
    assert.deepEqual(validasiMutasi(inputKeluar({ tanggalEfektif: '2026-10-26' }), { hariIni: HARI_INI }), []);
  });

  test('tanggal batas sesi: 30 Juni vs 1 Juli memetakan ke TA berbeda', () => {
    // Tahun ajaran berganti tiap 1 Juli: Juni = TA lama, Juli = TA baru.
    const juni = validasiMutasi(inputKeluar({ tanggalEfektif: '2026-06-30' }), { hariIni: HARI_INI, sesiAktif: '2026/2027' });
    assert.ok(juni.some((e) => e.includes('di luar sesi aktif')));
    assert.deepEqual(validasiMutasi(inputKeluar({ tanggalEfektif: '2026-06-30' }), { hariIni: HARI_INI, sesiAktif: '2025/2026' }), []);
    assert.deepEqual(validasiMutasi(inputKeluar({ tanggalEfektif: '2026-07-01' }), { hariIni: HARI_INI, sesiAktif: '2026/2027' }), []);
  });

  test('alasan wajib; keluar wajib sekolah tujuan; ubah_status terbatas targetnya', () => {
    assert.ok(validasiMutasi(inputKeluar({ alasan: '  ' }), { hariIni: HARI_INI }).length > 0);
    assert.ok(validasiMutasi(inputKeluar({ sekolahTujuan: '' }), { hariIni: HARI_INI }).length > 0);
    assert.ok(
      validasiMutasi(
        { siswaId: 'sis-1', jenis: 'ubah_status', statusSebelum: 'Aktif', statusSesudah: 'Aktif', tanggalEfektif: '2026-10-20', alasan: 'x' },
        { hariIni: HARI_INI },
      ).length > 0,
    );
    assert.deepEqual(
      validasiMutasi(
        { siswaId: 'sis-1', jenis: 'ubah_status', statusSebelum: 'Aktif', statusSesudah: 'Mengundurkan Diri', tanggalEfektif: '2026-10-20', alasan: 'Pindah ke pesantren' },
        { hariIni: HARI_INI },
      ),
      [],
    );
  });

  test('pembatalan lewat validator ditolak (wajib lewat batalkanMutasiTerakhir)', () => {
    const err = validasiMutasi(
      { siswaId: 'sis-1', jenis: 'batal', statusSebelum: 'Mutasi Keluar', statusSesudah: 'Aktif', tanggalEfektif: '2026-10-26', alasan: 'x' },
      { hariIni: HARI_INI },
    );
    assert.ok(err.some((e) => e.includes('batalkanMutasiTerakhir')));
  });
});

describe('penerapan mutasi & idempotensi', () => {
  test('mutasi keluar mengubah status + field keluar + menambah satu entri', () => {
    const s = siswaAktif();
    const { siswa, entri, sudahAda } = terapkanMutasiKeSiswa(s, inputKeluar(), OPERATOR, { hariIni: HARI_INI, sesiAktif: '2026/2027' });
    assert.equal(sudahAda, false);
    assert.equal(siswa.statusSiswa, 'Mutasi Keluar');
    assert.equal(siswa.tanggalKeluar, '2026-10-20');
    assert.equal(siswa.sekolahTujuan, 'SMP Negeri 1 Natal');
    assert.equal(siswa.noSuratMutasi, '421/100/SMPN3/X/2026');
    assert.equal(siswa.riwayatMutasi?.length, 1);
    assert.equal(entri.jenis, 'keluar');
    assert.equal(entri.operatorNama, 'Operator Sekolah');
    assert.ok(entri.dokumen.includes('421/100/SMPN3/X/2026'));
    // Input tidak dimutasi (satu write = objek baru).
    assert.equal(s.statusSiswa, 'Aktif');
    assert.equal((s.riwayatMutasi || []).length, 0);
  });

  test('pengiriman ulang dengan kunci sama adalah no-op, bukan duplikat', () => {
    const s = siswaAktif();
    const pertama = terapkanMutasiKeSiswa(s, inputKeluar(), OPERATOR, { hariIni: HARI_INI });
    const kedua = terapkanMutasiKeSiswa(pertama.siswa, inputKeluar(), OPERATOR, { hariIni: HARI_INI });
    assert.equal(kedua.sudahAda, true);
    assert.equal(kedua.entri.id, pertama.entri.id);
    assert.equal(kedua.siswa.riwayatMutasi?.length, 1);
  });

  test('kunci idempotensi deterministik dan peka terhadap no surat', () => {
    const k1 = kunciIdempotensiMutasi({ siswaId: 'sis-1', jenis: 'keluar', tanggalEfektif: '2026-10-20', statusSesudah: 'Mutasi Keluar', noSurat: 'A/1' });
    const k2 = kunciIdempotensiMutasi({ siswaId: 'sis-1', jenis: 'keluar', tanggalEfektif: '2026-10-20', statusSesudah: 'Mutasi Keluar', noSurat: 'A/1' });
    const k3 = kunciIdempotensiMutasi({ siswaId: 'sis-1', jenis: 'keluar', tanggalEfektif: '2026-10-20', statusSesudah: 'Mutasi Keluar', noSurat: 'A/2' });
    assert.equal(k1, k2);
    assert.notEqual(k1, k3);
  });

  test('sudah berstatus tujuan dengan data berbeda melempar error', () => {
    const s = siswaAktif({ statusSiswa: 'Mutasi Keluar' });
    assert.throws(
      () =>
        terapkanMutasiKeSiswa(
          s,
          inputKeluar({ statusSebelum: 'Mutasi Keluar', tanggalEfektif: '2026-10-21', noSurat: 'LAIN/2' }),
          OPERATOR,
          { hariIni: HARI_INI },
        ),
      /sudah berstatus/,
    );
  });

  test('entri lama tidak berubah saat mutasi baru ditambahkan (append-only)', () => {
    const s = siswaAktif();
    const pertama = terapkanMutasiKeSiswa(s, inputKeluar(), OPERATOR, { hariIni: HARI_INI });
    const sebelum = JSON.stringify(pertama.siswa.riwayatMutasi);
    const dibatalkan = batalkanMutasiTerakhir(pertama.siswa, OPERATOR, { hariIni: HARI_INI });
    const entriAsal = dibatalkan.siswa.riwayatMutasi?.[0];
    assert.equal(entriAsal?.jenis, 'keluar');
    assert.equal(entriAsal?.tanggalEfektif, '2026-10-20');
    assert.equal(entriAsal?.sekolahTujuan, 'SMP Negeri 1 Natal');
    assert.ok(JSON.parse(sebelum)[0].id === entriAsal?.id);
  });

  test('mutasi masuk: statusSebelum null, status Aktif, satu entri', () => {
    const baru = siswaAktif({ id: 'sis-2', nisn: '0987654321' });
    const { siswa, entri } = buatEntriMutasiMasuk(
      baru,
      { tanggalEfektif: '2026-10-20', alasan: 'Pindahan dari SDN 1', sekolahAsal: 'SDN 1 Natal', noSurat: 'B/9' },
      OPERATOR,
      { hariIni: HARI_INI },
    );
    assert.equal(entri.jenis, 'masuk');
    assert.equal(entri.statusSebelum, null);
    assert.equal(entri.statusSesudah, 'Aktif');
    assert.equal(siswa.riwayatMutasi?.length, 1);
  });
});

describe('pembatalan mutasi', () => {
  test('batal keluar: status kembali Aktif, field keluar dibersihkan, asal ditandai', () => {
    const s = siswaAktif();
    const keluar = terapkanMutasiKeSiswa(s, inputKeluar(), OPERATOR, { hariIni: HARI_INI });
    const { siswa, entri, dibatalkan } = batalkanMutasiTerakhir(keluar.siswa, OPERATOR, { hariIni: HARI_INI });
    assert.equal(siswa.statusSiswa, 'Aktif');
    assert.equal(siswa.tanggalKeluar, undefined);
    assert.equal(siswa.sekolahTujuan, undefined);
    assert.equal(entri.jenis, 'batal');
    assert.equal(entri.statusSesudah, 'Aktif');
    assert.equal(entri.membatalkanId, dibatalkan.id);
    assert.equal(siswa.riwayatMutasi?.[0].dibatalkanOleh, entri.id);
    assert.equal(entriDapatDibatalkan(siswa), null);
  });

  test('batal kedua kali melempar error (tidak ada yang dapat dibatalkan)', () => {
    const s = siswaAktif();
    const keluar = terapkanMutasiKeSiswa(s, inputKeluar(), OPERATOR, { hariIni: HARI_INI });
    const batal = batalkanMutasiTerakhir(keluar.siswa, OPERATOR, { hariIni: HARI_INI });
    assert.throws(() => batalkanMutasiTerakhir(batal.siswa, OPERATOR, { hariIni: HARI_INI }), /Tidak ada mutasi/);
  });

  test('mutasi masuk tidak dapat dibatalkan', () => {
    const baru = siswaAktif({ id: 'sis-2' });
    const { siswa } = buatEntriMutasiMasuk(
      baru,
      { tanggalEfektif: '2026-10-20', alasan: 'Pindahan', sekolahAsal: 'SDN 1' },
      OPERATOR,
      { hariIni: HARI_INI },
    );
    assert.equal(entriDapatDibatalkan(siswa), null);
    assert.throws(() => batalkanMutasiTerakhir(siswa, OPERATOR, { hariIni: HARI_INI }), /Tidak ada mutasi/);
  });

  test('pembatalan tidak menyentuh riwayat tahun ajaran', () => {
    const tahun = [{ id: 'rth-1', tahunAjaran: '2026/2027', statusAkhirTahun: 'Mutasi Keluar' }];
    const s = siswaAktif({ riwayatTahunAjaran: tahun } as Partial<Siswa>);
    const keluar = terapkanMutasiKeSiswa(s, inputKeluar(), OPERATOR, { hariIni: HARI_INI });
    const batal = batalkanMutasiTerakhir(keluar.siswa, OPERATOR, { hariIni: HARI_INI });
    assert.deepEqual(batal.siswa.riwayatTahunAjaran, tahun);
  });
});

describe('duplikasi', () => {
  test('NISN sudah terdaftar terdeteksi, kecuali siswa itu sendiri', () => {
    const daftar = [siswaAktif(), siswaAktif({ id: 'sis-2', nisn: '1111111111' })];
    assert.equal(nisnSudahTerdaftar(daftar, '1234567890'), true);
    assert.equal(nisnSudahTerdaftar(daftar, '1234567890', 'sis-1'), false);
    assert.equal(nisnSudahTerdaftar(daftar, '9999999999'), false);
    assert.equal(nisnSudahTerdaftar(daftar, ''), false);
  });

  test('no surat terpakai terdeteksi dari field siswa dan dari riwayat', () => {
    const keluar = terapkanMutasiKeSiswa(siswaAktif(), inputKeluar(), OPERATOR, { hariIni: HARI_INI });
    const daftar = [keluar.siswa, siswaAktif({ id: 'sis-2', noSuratMutasi: 'C/3' } as Partial<Siswa>)];
    assert.equal(noSuratTerpakai(daftar, '421/100/SMPN3/X/2026'), true);
    assert.equal(noSuratTerpakai(daftar, 'C/3'), true);
    assert.equal(noSuratTerpakai(daftar, 'C/3', 'sis-2'), false);
    assert.equal(noSuratTerpakai(daftar, 'belum-ada'), false);
  });

  test('no surat dari entri yang sudah dibatalkan tidak lagi terhitung terpakai', () => {
    const keluar = terapkanMutasiKeSiswa(siswaAktif(), inputKeluar(), OPERATOR, { hariIni: HARI_INI });
    const batal = batalkanMutasiTerakhir(keluar.siswa, OPERATOR, { hariIni: HARI_INI });
    assert.equal(noSuratTerpakai([batal.siswa], '421/100/SMPN3/X/2026'), false);
  });
});

describe('label & utilitas', () => {
  test('label jenis mutasi', () => {
    assert.equal(labelJenisMutasi('masuk'), 'Mutasi masuk');
    assert.equal(labelJenisMutasi('keluar'), 'Mutasi keluar');
    assert.equal(labelJenisMutasi('ubah_status'), 'Perubahan status');
    assert.equal(labelJenisMutasi('lulus'), 'Lulus');
    assert.equal(labelJenisMutasi('batal'), 'Pembatalan mutasi');
  });

  test('hariIniWIB mengembalikan format YYYY-MM-DD', () => {
    assert.match(hariIniWIB(new Date('2026-10-26T01:00:00Z')), /^\d{4}-\d{2}-\d{2}$/);
  });
});
