/**
 * Tes regresi Pusat Laporan — Issue #7.
 * Dijalankan dengan `npm test` (tsx + node:test).
 * TIDAK memakai data siswa nyata — semua fixture fiktif.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SekolahProfile, Siswa } from '../src/types';
import {
  bangunBarisDaftarSiswa,
  bangunBarisMutasiKeluar,
  bangunBarisMutasiMasuk,
  bangunBarisTemuan,
  bangunLaporan,
  bangunStatistik,
  cekKelengkapanSiswa,
  cekKonsistensiStatistik,
  daftarTahunLaporan,
  FilterLaporan,
  keCsv,
  metaLaporan,
  namaFileLaporan,
  ringkasanEkspor,
  saringLaporan,
} from '../src/utils/laporan';

let n = 0;
function siswa(partial: Record<string, unknown> = {}): Siswa {
  n += 1;
  const dasar = {
    id: `siswa-${n}`,
    namaLengkap: `Siswa Fiktif ${n}`,
    namaPanggilan: `Siswa ${n}`,
    jenisKelamin: 'L',
    nisn: String(1000000000 + n),
    nipd: `NIPD${n}`,
    nik: '',
    noKk: '',
    noAktaLahir: '',
    tempatLahir: 'Natal',
    tanggalLahir: '2015-01-01',
    agama: 'Islam',
    kewarganegaraan: 'WNI',
    anakKe: 1,
    jumlahSaudaraKandung: 0,
    jumlahSaudaraTiri: 0,
    jumlahSaudaraAngkat: 0,
    statusDalamKeluarga: 'Anak Kandung',
    bahasaSehariHari: 'Indonesia',
    golonganDarah: '-',
    tinggiBadan: 120,
    beratBadan: 25,
    riwayatPenyakit: '',
    kelainanFisik: '',
    kebutuhanKhusus: '',
    alamat: 'Jl. Contoh 1',
    rt: '001',
    rw: '001',
    dusun: '',
    kelurahan: '',
    kecamatan: 'Natal',
    kabupatenKota: 'Mandailing Natal',
    provinsi: 'Sumatera Utara',
    kodePos: '22987',
    tinggalDengan: 'Orang Tua',
    jarakKeSekolahKm: 1,
    transportasiKeSekolah: 'Jalan Kaki',
    ayah: { nama: 'Ayah Fiktif', nik: '', tahunLahir: '1980', pendidikan: '', pekerjaan: '', penghasilan: '', noTelepon: '', status: 'Masih Hidup' },
    ibu: { nama: 'Ibu Fiktif', nik: '', tahunLahir: '1980', pendidikan: '', pekerjaan: '', penghasilan: '', noTelepon: '', status: 'Masih Hidup' },
    asalSdMi: '',
    npsnSdMi: '',
    noIjazahSd: '',
    tahunLulusSd: '',
    lamaBelajarSd: 0,
    tanggalDiterima: '2026-07-01',
    diterimaDiTingkat: '7',
    diterimaDiRombel: '7A',
    rombelSaatIni: '7A',
    jalurMasuk: 'Zonasi',
    p5Projects: [],
    ekstrakurikuler: [],
    prestasi: [],
    riwayatSemester: [],
    riwayatTahunAjaran: [],
    statusSiswa: 'Aktif',
    createdAt: '2026-07-01',
    updatedAt: '2026-07-01',
  };
  return { ...dasar, ...partial } as unknown as Siswa;
}

const sekolah: SekolahProfile = {
  nama: 'SD Fiktif Contoh',
  npsn: '12345678',
  nss: '',
  bentukPendidikan: 'SD',
  statusSekolah: 'Negeri',
  alamat: '',
  desaKelurahan: '',
  kecamatan: 'Natal',
  kabupatenKota: 'Mandailing Natal',
  provinsi: 'Sumatera Utara',
  kodePos: '',
  telepon: '',
  email: '',
  website: '',
  kepalaSekolah: 'Kepala Fiktif',
  nipKepalaSekolah: '',
  petugasBukuInduk: 'Petugas Fiktif',
  nipPetugas: '',
  semesterAktif: '1 (Ganjil)',
  tahunAjaran: '2026/2027',
};

const ctx = { tahun: '2026/2027', tahunAktif: '2026/2027', semuaSiswa: [] as Siswa[] };

describe('saringLaporan: filter tahun/rombel/status', () => {
  test('tahun: hanya siswa terlibat tahun itu + siswa tanpa catatan (netral)', () => {
    const a = siswa({ riwayatTahunAjaran: [{ id: 'r1', tahunAjaran: '2026/2027', tingkat: '7', rombel: '7A' }] });
    const b = siswa({ riwayatTahunAjaran: [{ id: 'r2', tahunAjaran: '2025/2026', tingkat: '7', rombel: '7A' }] });
    const c = siswa({}); // tanpa catatan tahun -> netral
    const hasil = saringLaporan([a, b, c], { jenis: 'daftar-siswa', tahunAjaran: '2026/2027', rombel: 'semua', status: 'semua' }, { tahunAktif: '2026/2027' });
    assert.deepEqual(hasil.map((s) => s.id).sort(), [a.id, c.id].sort());
  });

  test('rombel: memakai rombel PADA tahun filter, bukan rombel berjalan', () => {
    const a = siswa({ rombelSaatIni: '8A', riwayatTahunAjaran: [{ id: 'r1', tahunAjaran: '2026/2027', tingkat: '7', rombel: '7A' }] });
    const f: FilterLaporan = { jenis: 'daftar-siswa', tahunAjaran: '2026/2027', rombel: '7A', status: 'semua' };
    assert.equal(saringLaporan([a], f, { tahunAktif: '2026/2027' }).length, 1);
    assert.equal(saringLaporan([a], { ...f, rombel: '8A' }, { tahunAktif: '2026/2027' }).length, 0);
  });

  test('status: Aktif menyaring keluar siswa Mutasi Keluar; semua memasukkan', () => {
    const keluar = siswa({ statusSiswa: 'Mutasi Keluar' });
    const aktif = siswa({});
    const dasar = { jenis: 'daftar-siswa' as const, tahunAjaran: 'semua', rombel: 'semua' };
    assert.equal(saringLaporan([keluar, aktif], { ...dasar, status: 'Aktif' }, { tahunAktif: '2026/2027' }).length, 1);
    assert.equal(saringLaporan([keluar, aktif], { ...dasar, status: 'Mutasi Keluar' }, { tahunAktif: '2026/2027' }).length, 1);
    assert.equal(saringLaporan([keluar, aktif], { ...dasar, status: 'semua' }, { tahunAktif: '2026/2027' }).length, 2);
  });
});

describe('saringLaporan: otorisasi rombel (tidak bocor lintas rombel)', () => {
  test('operator rombel 7A hanya melihat 7A + siswa tanpa rombel', () => {
    const a = siswa({ rombelSaatIni: '7A' });
    const b = siswa({ rombelSaatIni: '7B' });
    const c = siswa({ rombelSaatIni: '' });
    const hasil = saringLaporan(
      [a, b, c],
      { jenis: 'daftar-siswa', tahunAjaran: 'semua', rombel: 'semua', status: 'semua' },
      { tahunAktif: '2026/2027', rombelAkses: ['7A'] }
    );
    assert.deepEqual(hasil.map((s) => s.id).sort(), [a.id, c.id].sort());
  });

  test('tanpa rombelAkses (admin) melihat semua', () => {
    const daftar = [siswa({ rombelSaatIni: '7A' }), siswa({ rombelSaatIni: '7B' })];
    assert.equal(
      saringLaporan(daftar, { jenis: 'daftar-siswa', tahunAjaran: 'semua', rombel: 'semua', status: 'semua' }, { tahunAktif: '2026/2027' }).length,
      2
    );
  });
});

describe('bangunStatistik: total & konsistensi', () => {
  test('dataset kosong -> nol semua, tanpa masalah konsistensi', () => {
    const stat = bangunStatistik([], ctx);
    assert.equal(stat.total, 0);
    assert.deepEqual(stat.perRombel, []);
    assert.deepEqual(cekKonsistensiStatistik(stat), []);
  });

  test('L/P/X dihitung benar; JK kosong masuk X, bukan P', () => {
    const daftar = [
      siswa({ jenisKelamin: 'L', rombelSaatIni: '7A' }),
      siswa({ jenisKelamin: 'P', rombelSaatIni: '7A' }),
      siswa({ jenisKelamin: '', rombelSaatIni: '7A' }),
      siswa({ jenisKelamin: 'L', rombelSaatIni: '7B' }),
    ];
    const stat = bangunStatistik(daftar, ctx);
    assert.equal(stat.total, 4);
    assert.deepEqual(stat.perRombel.find((r) => r.rombel === '7A'), { rombel: '7A', L: 1, P: 1, X: 1, total: 3 });
    assert.deepEqual(cekKonsistensiStatistik(stat), []);
  });

  test('dataset besar (2000 siswa): jumlah kelompok = total', () => {
    const besar: Siswa[] = [];
    for (let i = 0; i < 2000; i += 1) {
      besar.push(siswa({ jenisKelamin: i % 3 === 0 ? 'P' : 'L', rombelSaatIni: `7${String.fromCharCode(65 + (i % 4))}`, agama: i % 2 === 0 ? 'Islam' : 'Kristen' }));
    }
    const t0 = Date.now();
    const stat = bangunStatistik(besar, ctx);
    assert.equal(stat.total, 2000);
    assert.deepEqual(cekKonsistensiStatistik(stat), []);
    assert.ok(Date.now() - t0 < 5000, 'agregasi 2000 siswa harus < 5 detik');
  });
});

describe('laporan mutasi', () => {
  test('mutasi masuk: Pindahan / jalur Mutasi-Pindahan, tanpa duplikasi', () => {
    const a = siswa({ jenisPendaftaran: 'Pindahan', jalurMasuk: 'Mutasi/Pindahan', asalMutasi: 'SD Asal' });
    const b = siswa({ jenisPendaftaran: 'Pindahan', jalurMasuk: 'Zonasi' });
    const c = siswa({ jalurMasuk: 'Zonasi' });
    const baris = bangunBarisMutasiMasuk([a, b, c], ctx);
    assert.equal(baris.length, 2);
    assert.ok(baris.some((r) => String(r[4]).includes('SD Asal')));
  });

  test('mutasi keluar: hanya status Mutasi Keluar + dokumennya', () => {
    const a = siswa({ statusSiswa: 'Mutasi Keluar', sekolahTujuan: 'SMP Tujuan', noSuratMutasi: 'SURAT/1', alasanKeluar: 'Pindah domisili' });
    const b = siswa({ statusSiswa: 'Lulus' });
    const baris = bangunBarisMutasiKeluar([a, b], ctx);
    assert.equal(baris.length, 1);
    assert.ok(baris[0].includes('SMP Tujuan'));
    assert.ok(baris[0].includes('SURAT/1'));
  });
});

describe('temuan kelengkapan & validasi', () => {
  test('belum-lengkap: field kosong masuk; temuan-validasi: format/duplikat masuk', () => {
    const kosong = siswa({ alamat: '', tempatLahir: '' });
    const rusak = siswa({ nisn: '123' }); // NISN tidak 10 digit -> validasi
    const duplikat = siswa({ nisn: kosong.nisn });
    const semua = [kosong, rusak, duplikat];
    const ctxPenuh = { ...ctx, semuaSiswa: semua };
    const temuanKosong = cekKelengkapanSiswa(kosong, semua, ctxPenuh);
    assert.ok(temuanKosong.some((t) => t.kategori === 'belum-lengkap' && t.bidang === 'alamat'));
    assert.ok(temuanKosong.some((t) => t.kategori === 'validasi' && /sudah dipakai/.test(t.pesan)), 'duplikat NISN adalah temuan validasi');
    const barisBelum = bangunBarisTemuan([kosong, rusak], semua, ctxPenuh, true);
    assert.ok(barisBelum.length > 0);
    assert.ok(barisBelum.every((r) => !String(r[6]).includes('10 digit')), 'belum-lengkap tidak boleh memuat temuan format');
    const barisSemua = bangunBarisTemuan([kosong, rusak], semua, ctxPenuh, false);
    assert.ok(barisSemua.length > barisBelum.length);
  });

  test('siswa lengkap tidak menghasilkan temuan', () => {
    const lengkap = siswa({});
    assert.deepEqual(cekKelengkapanSiswa(lengkap, [lengkap], ctx), []);
  });
});

describe('privasi: laporan tidak memuat NIK / No. KK / alamat / telepon', () => {
  test('semua jenis laporan bebas data sensitif', () => {
    const sensitif = siswa({
      nik: '3171010101010001',
      noKk: '3171010101010002',
      alamat: 'Jl. Rahasia Sekali 99',
      ayah: { nama: 'Ayah', nik: '3171010101010003', tahunLahir: '1980', pendidikan: '', pekerjaan: '', penghasilan: '', noTelepon: '081200000001', status: 'Masih Hidup' },
    });
    const daftar = [sensitif];
    const ctxPenuh = { ...ctx, semuaSiswa: daftar };
    const teks = (jenis: Parameters<typeof bangunLaporan>[0]) =>
      JSON.stringify(bangunLaporan(jenis, daftar, ctxPenuh));
    for (const jenis of ['daftar-siswa', 'mutasi-masuk', 'mutasi-keluar', 'belum-lengkap', 'temuan-validasi'] as const) {
      const t = teks(jenis);
      assert.ok(!t.includes('3171010101010001'), `${jenis} membocorkan NIK`);
      assert.ok(!t.includes('3171010101010002'), `${jenis} membocorkan No. KK`);
      assert.ok(!t.includes('Jl. Rahasia Sekali 99'), `${jenis} membocorkan alamat`);
      assert.ok(!t.includes('081200000001'), `${jenis} membocorkan telepon`);
    }
    assert.ok(!JSON.stringify(bangunStatistik(daftar, ctx)).includes('3171010101010001'));
  });
});

describe('pratinjau == ekspor: satu sumber builder', () => {
  test('dua pemanggilan builder yang sama menghasilkan isi identik', () => {
    const daftar = [siswa({}), siswa({ jenisKelamin: 'P' })];
    const tersaring = saringLaporan(daftar, { jenis: 'daftar-siswa', tahunAjaran: 'semua', rombel: 'semua', status: 'semua' }, { tahunAktif: '2026/2027' });
    const ctxPenuh = { ...ctx, semuaSiswa: daftar };
    assert.deepEqual(bangunLaporan('daftar-siswa', tersaring, ctxPenuh), bangunLaporan('daftar-siswa', tersaring, ctxPenuh));
    assert.equal(bangunBarisDaftarSiswa(tersaring, ctx).length, tersaring.length);
  });
});

describe('CSV & metadata', () => {
  test('keCsv: BOM UTF-8, quoting koma/kutip/baris baru, UTF-8 utuh', () => {
    const csv = keCsv([['Nama', 'Catatan'], ['Budi, "Si Kuat"', 'baris1\nbaris2'], ['Siti é', 'biasa']]);
    assert.ok(csv.startsWith('\uFEFF'), 'CSV harus diawali BOM UTF-8');
    assert.ok(csv.includes('"Budi, ""Si Kuat"""'), 'koma & kutip harus di-quote ganda');
    assert.ok(csv.includes('"baris1\nbaris2"'), 'baris baru dalam sel harus di-quote');
    assert.ok(csv.includes('Siti é'), 'karakter UTF-8 tidak boleh rusak');
  });

  test('keCsv: sel formula di-prefix kutip (anti formula injection, cermin S11)', () => {
    const csv = keCsv([['Nilai'], ['=1+1'], ['+cmd'], ['-cmd'], ['@cmd'], ['normal']]);
    assert.ok(csv.includes("'=1+1"));
    assert.ok(csv.includes("'+cmd"));
    assert.ok(csv.includes("'-cmd"));
    assert.ok(csv.includes("'@cmd"));
    assert.ok(csv.includes('normal') && !csv.includes("'normal"));
  });

  test('metaLaporan: parameter, sumber NPSN, periode', () => {
    const meta = metaLaporan({
      judul: 'LAPORAN DAFTAR SISWA',
      filter: { jenis: 'daftar-siswa', tahunAjaran: '2026/2027', rombel: '7A', status: 'Aktif' },
      jumlahBaris: 3,
      sekolah,
      dibuatOleh: 'operator_bukuinduk',
    });
    assert.ok(meta.parameter.includes('2026/2027'));
    assert.ok(meta.parameter.includes('7A'));
    assert.ok(meta.parameter.includes('Aktif'));
    assert.ok(meta.parameter.includes('operator_bukuinduk'));
    assert.ok(meta.sumber.includes('SD Fiktif Contoh'));
    assert.ok(meta.sumber.includes('12345678'));
    assert.ok(meta.periode.includes('2026/2027'));
    assert.ok(meta.dibuatPadaLabel.length > 0);
  });

  test('namaFileLaporan: tanpa karakter path (garis miring tahun disanitasi)', () => {
    const nama = namaFileLaporan('daftar-siswa', { jenis: 'daftar-siswa', tahunAjaran: '2026/2027', rombel: 'semua', status: 'semua' });
    assert.ok(!nama.includes('/'), nama);
    assert.ok(nama.startsWith('Laporan_daftar-siswa_2026-2027_'));
  });

  test('ringkasanEkspor: dataset kosong memberi pesan jelas', () => {
    const meta = metaLaporan({ judul: 'X', filter: { jenis: 'daftar-siswa', tahunAjaran: 'semua', rombel: 'semua', status: 'semua' }, jumlahBaris: 0, sekolah });
    assert.ok(ringkasanEkspor(meta, 'CSV').includes('Tidak ada baris'));
    const metaIsi = { ...meta, jumlahBaris: 5 };
    assert.ok(ringkasanEkspor(metaIsi, 'CSV').includes('5 baris'));
  });

  test('daftarTahunLaporan: mengumpulkan tahun dari catatan + tahun aktif, menurun', () => {
    const a = siswa({ riwayatTahunAjaran: [{ id: 'r1', tahunAjaran: '2025/2026', tingkat: '7', rombel: '7A' }] });
    const b = siswa({ riwayatSemester: [{ id: 'r2', semester: '1', tingkat: '7', tahunAjaran: '2024/2025', sakit: 0, izin: 0, alpa: 0, statusKenaikan: 'Belum Ditentukan', catatanWaliKelas: '' }] });
    assert.deepEqual(daftarTahunLaporan([a, b], '2026/2027'), ['2026/2027', '2025/2026', '2024/2025']);
  });
});
