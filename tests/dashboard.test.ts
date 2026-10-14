/**
 * Tes regresi Dasbor Pusat Kendali — Issue #2.
 * Dijalankan dengan `npm test` (tsx + node:test).
 *
 * Yang diuji: fungsi murni di src/utils/dashboard.ts — ringkasan, filter,
 * tugas tertunda, arus, tenggat, predikat drill-down, dan kontrak hak
 * akses (dasbor hanya mempersempit daftar yang diterimanya, tidak pernah
 * memperlebar; App.tsx hanya meneruskan visibleSiswa yang sudah terpotong
 * filterSiswaByAccess + sesi).
 *
 * TIDAK ada angka contoh: setiap angka yang diasersikan dihitung dari
 * fixture di bawah ini. TIDAK ada data siswa nyata — semua fixture fiktif.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Siswa } from '../src/types';
import {
  DEFAULT_DASHBOARD_FILTER,
  ROMBEL_KOSONG,
  alasanDokumenBelumLengkap,
  cocokKondisi,
  dataWajibKosong,
  dokumenBelumLengkap,
  hitungArus,
  hitungRingkasan,
  hitungTenggat,
  hitungTugas,
  identitasTidakValid,
  mutasiPerluTindakLanjut,
  parseTanggalYmd,
  raportBelum,
  rentangTanggalValid,
  terapkanFilterDasbor,
  tanpaRombel,
  type DashboardFilter,
} from '../src/utils/dashboard';

let n = 0;

/** Fixture siswa fiktif minimal; override per tes. */
function buatSiswa(over: Partial<Siswa> = {}): Siswa {
  n += 1;
  const dasar = {
    id: `siswa-${n}`,
    namaLengkap: `Siswa Fiktif ${n}`,
    nisn: String(1000000000 + n).slice(0, 10),
    nik: String(1000000000000000 + n).slice(0, 16),
    nipd: `NIPD${n}`,
    noKk: String(2000000000000000 + n).slice(0, 16),
    tanggalLahir: '2014-05-06',
    tanggalDiterima: '2026-07-14',
    jenisKelamin: 'L',
    statusSiswa: 'Aktif',
    rombelSaatIni: '7A',
    diterimaDiTingkat: '7',
    jalurMasuk: 'Zonasi',
    jenisPendaftaran: 'Siswa Baru',
    asalSdMi: 'SD Fiktif 01',
    ayah: { nama: 'Ayah Fiktif', nik: '', tahunLahir: '', pendidikan: '', pekerjaan: '', penghasilan: '', noTelepon: '', status: 'Masih Hidup' },
    ibu: { nama: 'Ibu Fiktif', nik: '', tahunLahir: '', pendidikan: '', pekerjaan: '', penghasilan: '', noTelepon: '', status: 'Masih Hidup' },
    fotoUrl: 'data:image/png;base64,fiktif',
    p5Projects: [],
    ekstrakurikuler: [],
    prestasi: [],
    riwayatSemester: [{ tahunAjaran: '2026/2027', semester: '1' }],
    nilaiRaport: [],
    raportSemester: [],
    riwayatTahunAjaran: [],
    createdAt: '2026-07-14',
    updatedAt: '2026-07-14',
  } as unknown as Siswa;
  return { ...dasar, ...over } as Siswa;
}

function filter(over: Partial<DashboardFilter> = {}): DashboardFilter {
  return { ...DEFAULT_DASHBOARD_FILTER, ...over };
}

describe('kondisi kosong', () => {
  test('daftar kosong -> semua angka nol + tugas nol + arus nol (tanpa angka contoh)', () => {
    const ringkasan = hitungRingkasan([]);
    assert.equal(ringkasan.total, 0);
    assert.equal(ringkasan.laki, 0);
    assert.equal(ringkasan.perempuan, 0);
    assert.deepEqual(ringkasan.perRombel, []);
    for (const v of Object.values(ringkasan.perStatus)) assert.equal(v, 0);
    const tugas = hitungTugas([], { tahunAktif: '2026/2027', semesterAktif: '1' });
    assert.ok(tugas.length > 0);
    for (const t of tugas) assert.equal(t.jumlah, 0);
    const arus = hitungArus([], '', '');
    assert.deepEqual([arus.diterima, arus.keluar], [0, 0]);
    assert.equal(terapkanFilterDasbor([], filter()).length, 0);
    assert.equal(terapkanFilterDasbor(null, filter()).length, 0);
    assert.equal(terapkanFilterDasbor(undefined, null).length, 0);
  });

  test('tugas raport dilewati bila tahun/semester tak tersedia (bukan ditebak)', () => {
    const ids = hitungTugas([buatSiswa()]).map((t) => t.id);
    assert.ok(!ids.includes('raport-belum'));
    assert.ok(hitungTugas([buatSiswa()], { tahunAktif: '2026/2027', semesterAktif: '1' }).some((t) => t.id === 'raport-belum'));
  });
});

describe('ringkasan', () => {
  test('total, L/P, per-status, per-rombel, tanpa-rombel', () => {
    const list = [
      buatSiswa({ jenisKelamin: 'L', statusSiswa: 'Aktif', rombelSaatIni: '7A' }),
      buatSiswa({ jenisKelamin: 'P', statusSiswa: 'Aktif', rombelSaatIni: '7A' }),
      buatSiswa({ jenisKelamin: 'P', statusSiswa: 'Lulus', rombelSaatIni: '9C' }),
      buatSiswa({ jenisKelamin: 'L', statusSiswa: 'Mutasi Keluar', rombelSaatIni: '', noSuratMutasi: '421/1/2026' }),
      buatSiswa({ jenisKelamin: 'P', statusSiswa: 'Mengundurkan Diri', rombelSaatIni: '8B' }),
      buatSiswa({ jenisKelamin: 'L', statusSiswa: 'Meninggal Dunia', rombelSaatIni: '8B' }),
    ];
    const r = hitungRingkasan(list);
    assert.equal(r.total, 6);
    assert.equal(r.laki, 3);
    assert.equal(r.perempuan, 3);
    assert.equal(r.perStatus['Aktif'], 2);
    assert.equal(r.perStatus['Lulus'], 1);
    assert.equal(r.perStatus['Mutasi Keluar'], 1);
    assert.equal(r.perStatus['Mengundurkan Diri'], 1);
    assert.equal(r.perStatus['Meninggal Dunia'], 1);
    assert.equal(r.tanpaRombel, 1);
    assert.deepEqual(
      r.perRombel.map((x) => [x.nama, x.total]),
      [['7A', 2], ['8B', 2], ['9C', 1], ['Tanpa Rombel', 1]],
    );
  });

  test('status tak dikenal tetap dihitung di total, tidak masuk perStatus', () => {
    const r = hitungRingkasan([buatSiswa({ statusSiswa: 'StatusAneh' as never })]);
    assert.equal(r.total, 1);
    assert.equal(Object.values(r.perStatus).reduce((a, b) => a + b, 0), 0);
  });
});

describe('filter roster', () => {
  const list = [
    buatSiswa({ rombelSaatIni: '7A', statusSiswa: 'Aktif', riwayatSemester: [{ tahunAjaran: '2026/2027', semester: '1' }] }),
    buatSiswa({ rombelSaatIni: '7B', statusSiswa: 'Aktif', riwayatSemester: [{ tahunAjaran: '2025/2026', semester: '2' }] }),
    buatSiswa({ rombelSaatIni: '8A', statusSiswa: 'Lulus', riwayatSemester: [{ tahunAjaran: '2026/2027', semester: '1' }] }),
    buatSiswa({ rombelSaatIni: '', statusSiswa: 'Aktif', riwayatSemester: [{ tahunAjaran: '2026/2027', semester: '1' }] }),
  ];

  test('tahun memakai keterlibatan tahun (riwayat/raport), bukan hanya rombel berjalan', () => {
    const out = terapkanFilterDasbor(list, filter({ tahun: '2025/2026' }));
    assert.equal(out.length, 1);
    assert.equal(out[0].rombelSaatIni, '7B');
  });

  test('rombel, status, dan kombinasi mempersempit (AND)', () => {
    assert.equal(terapkanFilterDasbor(list, filter({ rombel: '7A' })).length, 1);
    assert.equal(terapkanFilterDasbor(list, filter({ status: 'Lulus' })).length, 1);
    assert.equal(terapkanFilterDasbor(list, filter({ rombel: ROMBEL_KOSONG })).length, 1);
    assert.equal(terapkanFilterDasbor(list, filter({ tahun: '2026/2027', status: 'Aktif' })).length, 2);
    assert.equal(terapkanFilterDasbor(list, filter({ tahun: '2026/2027', rombel: '7B' })).length, 0);
  });

  test('tahun tak valid diperlakukan sebagai semua (aturan dasbor sendiri)', () => {
    assert.equal(terapkanFilterDasbor(list, filter({ tahun: 'bukan-tahun' })).length, 4);
  });

  test('filter tidak pernah memperlebar: hasil selalu subset input', () => {
    const ids = new Set(list.map((s) => s.id));
    for (const f of [filter({ tahun: '2026/2027' }), filter({ rombel: '7A' }), filter({ status: 'Aktif' })]) {
      for (const s of terapkanFilterDasbor(list, f)) assert.ok(ids.has(s.id));
    }
  });
});

describe('predikat kondisi', () => {
  test('data wajib kosong: salah satu field wajib kosong', () => {
    assert.equal(dataWajibKosong(buatSiswa()), false);
    assert.equal(dataWajibKosong(buatSiswa({ nik: '' })), true);
    assert.equal(dataWajibKosong(buatSiswa({ ayah: { nama: '' } as never })), true);
    assert.equal(dataWajibKosong(buatSiswa({ asalSdMi: '' })), true);
  });

  test('data tidak valid: format NISN/NIK, duplikat, tanggal lahir', () => {
    assert.equal(identitasTidakValid(buatSiswa()), false);
    assert.equal(identitasTidakValid(buatSiswa({ nisn: '123' })), true);
    assert.equal(identitasTidakValid(buatSiswa({ nik: '123456789012345' })), true);
    assert.equal(identitasTidakValid(buatSiswa({ tanggalLahir: '2999-01-01' })), true);
    assert.equal(identitasTidakValid(buatSiswa({ tanggalLahir: '2026-08-01', tanggalDiterima: '2026-07-14' })), true);
    // Duplikat NISN terhadap daftar penuh.
    const a = buatSiswa({ nisn: '0091234567' });
    const b = buatSiswa({ nisn: '0091234567' });
    assert.equal(identitasTidakValid(b, [a, b]), true);
    // Peringatan non-blokir (tanggal lahir kosong) bukan "tidak valid".
    assert.equal(identitasTidakValid(buatSiswa({ tanggalLahir: '' })), false);
  });

  test('dokumen belum lengkap: 4 aturan dari field nyata', () => {
    assert.deepEqual(alasanDokumenBelumLengkap(buatSiswa()), []);
    assert.ok(alasanDokumenBelumLengkap(buatSiswa({ fotoUrl: '' })).includes('Foto (kartu pelajar)'));
    assert.ok(
      alasanDokumenBelumLengkap(
        buatSiswa({ jenisPendaftaran: 'Pindahan', jalurMasuk: 'Mutasi/Pindahan', noSuratPenerimaan: '' }),
      ).includes('Surat penerimaan (pindahan)'),
    );
    assert.ok(
      alasanDokumenBelumLengkap(buatSiswa({ statusSiswa: 'Mutasi Keluar', noSuratMutasi: '' })).includes('Surat mutasi keluar'),
    );
    assert.ok(
      alasanDokumenBelumLengkap(buatSiswa({ statusSiswa: 'Lulus', noIjazahSmp: '' })).includes('Ijazah SMP'),
    );
    assert.equal(dokumenBelumLengkap(buatSiswa({ statusSiswa: 'Mutasi Keluar', noSuratMutasi: '421/1/2026' })), false);
  });

  test('mutasi perlu tindak lanjut = Mutasi Keluar tanpa surat (bukan antrean persetujuan)', () => {
    assert.equal(mutasiPerluTindakLanjut(buatSiswa({ statusSiswa: 'Mutasi Keluar', noSuratMutasi: '' })), true);
    assert.equal(mutasiPerluTindakLanjut(buatSiswa({ statusSiswa: 'Mutasi Keluar', noSuratMutasi: '421/1/2026' })), false);
    assert.equal(mutasiPerluTindakLanjut(buatSiswa({ statusSiswa: 'Aktif' })), false);
  });

  test('raport belum: hanya Aktif + cocok tahun/semester; non-Aktif tidak dihitung', () => {
    const tanpaRaport = buatSiswa({ statusSiswa: 'Aktif' });
    const denganRaport = buatSiswa({
      statusSiswa: 'Aktif',
      nilaiRaport: [{ id: 'r1', tahunAjaran: '2026/2027', semester: '1' } as never],
    });
    assert.equal(raportBelum(tanpaRaport, '2026/2027', '1'), true);
    assert.equal(raportBelum(denganRaport, '2026/2027', '1'), false);
    assert.equal(raportBelum(denganRaport, '2026/2027', '2'), true);
    assert.equal(raportBelum(buatSiswa({ statusSiswa: 'Lulus' }), '2026/2027', '1'), false);
  });

  test('tanpa rombel', () => {
    assert.equal(tanpaRombel(buatSiswa({ rombelSaatIni: '' })), true);
    assert.equal(tanpaRombel(buatSiswa({ rombelSaatIni: '  ' })), true);
    assert.equal(tanpaRombel(buatSiswa({ rombelSaatIni: '7A' })), false);
  });
});

describe('tugas tertunda', () => {
  test('angka tugas == jumlah predikat; ids tugas == daftar pembentuk angka', () => {
    const list = [
      buatSiswa({ nik: '' }),
      buatSiswa({ nisn: '123' }),
      buatSiswa({ fotoUrl: '' }),
      buatSiswa({ rombelSaatIni: '' }),
      buatSiswa({ statusSiswa: 'Mutasi Keluar', noSuratMutasi: '' }),
      buatSiswa({ statusSiswa: 'Aktif' }),
    ];
    const ctx = { semua: list, tahun: '2026/2027', semester: '1' as const };
    const tugas = hitungTugas(list, { tahunAktif: '2026/2027', semesterAktif: '1' });
    for (const t of tugas) {
      const cocok = list.filter((s) => cocokKondisi(s, t.id, ctx));
      assert.equal(t.jumlah, cocok.length, `tugas ${t.id}`);
      assert.deepEqual([...t.ids].sort(), cocok.map((s) => s.id).sort(), `ids ${t.id}`);
    }
    const byId = Object.fromEntries(tugas.map((t) => [t.id, t.jumlah]));
    assert.equal(byId['data-kosong'], 1);
    assert.equal(byId['data-tidak-valid'], 1);
    assert.equal(byId['dokumen'], 2); // tanpa foto + mutasi tanpa surat
    assert.equal(byId['tanpa-rombel'], 1);
    assert.equal(byId['mutasi-surat'], 1);
    assert.equal(byId['raport-belum'], 5); // semua Aktif tanpa raport sem 1
  });
});

describe('arus siswa (rentang tanggal)', () => {
  const list = [
    buatSiswa({ tanggalDiterima: '2026-07-14', tanggalKeluar: '' }),
    buatSiswa({ tanggalDiterima: '2026-07-20', tanggalKeluar: '2026-09-01', statusSiswa: 'Mutasi Keluar' }),
    buatSiswa({ tanggalDiterima: '2025-07-14', tanggalKeluar: '2026-08-15', statusSiswa: 'Lulus' }),
    buatSiswa({ tanggalDiterima: 'tanggal-rusak', tanggalKeluar: '2026-02-30' }),
  ];

  test('rentang inklusif di kedua ujung; tanggal rusak diabaikan', () => {
    const a = hitungArus(list, '2026-07-14', '2026-07-20');
    assert.equal(a.rentangValid, true);
    assert.equal(a.diterima, 2);
    assert.equal(a.keluar, 0);
    const b = hitungArus(list, '2026-08-01', '2026-09-30');
    assert.equal(b.keluar, 2);
    assert.equal(b.keluarPerStatus['Mutasi Keluar'], 1);
    assert.equal(b.keluarPerStatus['Lulus'], 1);
  });

  test('tanpa rentang = seluruh riwayat', () => {
    const a = hitungArus(list, '', '');
    assert.equal(a.rentangAktif, false);
    assert.equal(a.diterima, 3);
    assert.equal(a.keluar, 2);
  });

  test('rentang tak valid -> angka nol + flag, bukan crash', () => {
    assert.equal(hitungArus(list, '2026-09-01', '2026-07-01').rentangValid, false);
    assert.equal(hitungArus(list, 'bukan-tanggal', '').rentangValid, false);
    assert.equal(rentangTanggalValid('2026-09-01', '2026-07-01'), false);
    assert.equal(rentangTanggalValid('', ''), true);
    assert.equal(parseTanggalYmd('2026-02-30'), null);
    assert.equal(parseTanggalYmd('2026-13-01'), null);
  });
});

describe('tenggat laporan', () => {
  test('backup belum pernah / kedaluwarsa / segar', () => {
    assert.ok(hitungTenggat({ hariSejakBackup: null, raportBelum: 0, raportTotal: 0 }).some((i) => i.id === 'backup-belum-pernah'));
    assert.ok(hitungTenggat({ hariSejakBackup: 20, raportBelum: 0, raportTotal: 0 }).some((i) => i.id === 'backup-kedaluwarsa'));
    assert.ok(!hitungTenggat({ hariSejakBackup: 3, raportBelum: 0, raportTotal: 0 }).some((i) => i.tujuan === 'backup'));
  });

  test('kewajiban raport berjalan: cakupan dari data nyata, TANPA tanggal karangan', () => {
    const items = hitungTenggat({
      hariSejakBackup: 3, raportBelum: 2, raportTotal: 5,
      tahunAktif: '2026/2027', semesterAktif: '1',
    });
    const raport = items.find((i) => i.id === 'raport-berjalan');
    assert.ok(raport);
    assert.match(raport.detail, /3 dari 5/);
    // Tidak ada tanggal tenggat yang dikarang: semua item tanpa tanggal.
    for (const i of items) assert.equal(i.tanggal, undefined);
  });

  test('tanpa tahun/semester, kewajiban raport tidak muncul', () => {
    assert.ok(!hitungTenggat({ hariSejakBackup: 3, raportBelum: 2, raportTotal: 5 }).some((i) => i.tujuan === 'raport'));
  });
});

describe('kontrak hak akses', () => {
  test('dasbor menghormati cakupan yang diterimanya: daftar operator hanya 7A + tanpa rombel', () => {
    // Simulasi hasil filterSiswaByAccess untuk operator rombelAkses ['7A']
    // (aturan F16: siswa tanpa rombel tetap terlihat) — dasbor menerima
    // daftar yang SUDAH terpotong ini dan tidak boleh menambah cakupan.
    const scoped = [
      buatSiswa({ rombelSaatIni: '7A', statusSiswa: 'Aktif' }),
      buatSiswa({ rombelSaatIni: '7A', statusSiswa: 'Aktif' }),
      buatSiswa({ rombelSaatIni: '', statusSiswa: 'Aktif' }),
    ];
    const r = hitungRingkasan(scoped);
    assert.equal(r.total, 3);
    assert.deepEqual(r.perRombel.map((x) => x.nama), ['7A', 'Tanpa Rombel']);
    // Drill-down dari angka dasbor tidak keluar dari cakupan.
    const tugas = hitungTugas(scoped, { tahunAktif: '2026/2027', semesterAktif: '1' });
    const idsScoped = new Set(scoped.map((s) => s.id));
    for (const t of tugas) for (const id of t.ids) assert.ok(idsScoped.has(id));
  });

  test('admin (daftar penuh) melihat semua; operator (daftar terpotong) melihat subset', () => {
    const penuh = [
      buatSiswa({ rombelSaatIni: '7A' }),
      buatSiswa({ rombelSaatIni: '7B' }),
      buatSiswa({ rombelSaatIni: '8A' }),
    ];
    const terpotong = penuh.slice(0, 1);
    assert.equal(hitungRingkasan(penuh).total, 3);
    assert.equal(hitungRingkasan(terpotong).total, 1);
  });
});

describe('data besar', () => {
  test('5000 siswa: hitungan tepat', () => {
    const list: Siswa[] = [];
    for (let i = 0; i < 5000; i += 1) {
      list.push(
        buatSiswa({
          jenisKelamin: i % 2 === 0 ? 'L' : 'P',
          statusSiswa: i % 10 === 0 ? 'Lulus' : 'Aktif',
          rombelSaatIni: `7${String.fromCharCode(65 + (i % 4))}`,
          tanggalDiterima: '2026-07-14',
        }),
      );
    }
    const r = hitungRingkasan(list);
    assert.equal(r.total, 5000);
    assert.equal(r.laki, 2500);
    assert.equal(r.perStatus['Lulus'], 500);
    assert.equal(r.perRombel.length, 4);
    const tugas = hitungTugas(list, { tahunAktif: '2026/2027', semesterAktif: '1' });
    const raport = tugas.find((t) => t.id === 'raport-belum');
    assert.equal(raport?.jumlah, 4500); // hanya Aktif
    const arus = hitungArus(list, '2026-07-01', '2026-07-31');
    assert.equal(arus.diterima, 5000);
  });
});
