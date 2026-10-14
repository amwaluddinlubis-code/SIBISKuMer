/**
 * Tes regresi Pemeriksa Data Siswa — Issue #3.
 * Mencakup: data kosong, data valid, field wajib, format, rentang,
 * konflik antarkolom, duplikat (positif + negatif anti-false-positive),
 * konfigurasi aturan, status penanganan, dan perbandingan data impor.
 * TIDAK memakai data siswa nyata — semua fixture fiktif.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATURAN_PEMERIKSA,
  bandingkanDenganImpor,
  jarakLevenshtein,
  normalisasiNama,
  parseCsvImpor,
  periksaDataSiswa,
  ringkasanTemuan,
  statusEfektifTemuan,
  tandaiTemuan,
  type TemuanPemeriksa,
} from '../src/utils/pemeriksaData';
import type { Siswa } from '../src/types';

// Minimal Siswa fixture — cast karena banyak field opsional dalam praktiknya.
let seq = 0;
function siswa(over: Record<string, unknown> = {}): Siswa {
  seq += 1;
  const base: Record<string, unknown> = {
    id: `siswa-${seq}`,
    namaLengkap: 'BUDI SANTOSO',
    namaPanggilan: 'BUDI',
    jenisKelamin: 'L',
    nisn: '0012345678',
    nipd: '1001',
    nik: '3201010101010001',
    noKk: '3201010101010001',
    noAktaLahir: 'AKTA-1',
    tempatLahir: 'MEDAN',
    tanggalLahir: '2014-05-10',
    agama: 'Islam',
    kewarganegaraan: 'WNI',
    anakKe: 1,
    jumlahSaudaraKandung: 1,
    jumlahSaudaraTiri: 0,
    jumlahSaudaraAngkat: 0,
    statusDalamKeluarga: 'Anak Kandung',
    bahasaSehariHari: 'Indonesia',
    golonganDarah: '-',
    tinggiBadan: 130,
    beratBadan: 28,
    riwayatPenyakit: '',
    kelainanFisik: '',
    kebutuhanKhusus: '',
    alamat: 'Jl. Merdeka No. 1',
    rt: '001',
    rw: '002',
    dusun: '',
    kelurahan: 'Kelurahan A',
    kecamatan: 'Kecamatan A',
    kabupatenKota: 'Kabupaten A',
    provinsi: 'Sumatera Utara',
    kodePos: '22919',
    tinggalDengan: 'Orang Tua',
    jarakKeSekolahKm: 1,
    transportasiKeSekolah: 'Jalan Kaki',
    ayah: { nama: 'AYAH BUDI', nik: '3201010101010011', tahunLahir: '1985', pendidikan: 'SMA', pekerjaan: 'Petani', penghasilan: '', noTelepon: '', status: 'Masih Hidup' },
    ibu: { nama: 'IBU BUDI', nik: '3201010101010012', tahunLahir: '1986', pendidikan: 'SMA', pekerjaan: 'Ibu Rumah Tangga', penghasilan: '', noTelepon: '', status: 'Masih Hidup' },
    asalSdMi: '',
    npsnSdMi: '',
    noIjazahSd: '',
    tahunLulusSd: '',
    lamaBelajarSd: 6,
    tanggalDiterima: '2021-07-01',
    diterimaDiTingkat: '1',
    diterimaDiRombel: '1A',
    rombelSaatIni: '4A',
    jalurMasuk: 'Zonasi',
    jenisPendaftaran: 'Siswa Baru',
    asalMutasi: '',
    p5Projects: [],
    ekstrakurikuler: [],
    prestasi: [],
    riwayatSemester: [],
    statusSiswa: 'Aktif',
    createdAt: '2021-07-01',
    updatedAt: '2021-07-01',
  };
  return { ...base, ...over } as unknown as Siswa;
}

function aturanIds(temuan: { aturanId: string }[]): string[] {
  return temuan.map((t) => t.aturanId).sort();
}

describe('data kosong & data valid', () => {
  test('daftar kosong → tanpa temuan', () => {
    assert.deepEqual(periksaDataSiswa([]), []);
  });
  test('siswa valid → tanpa temuan', () => {
    assert.deepEqual(periksaDataSiswa([siswa()]), []);
  });
  test('semua aturan punya id unik + dokumentasi penjelasan', () => {
    const ids = ATURAN_PEMERIKSA.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const a of ATURAN_PEMERIKSA) {
      assert.ok(a.penjelasan.length > 10, a.id);
      assert.ok(['wajib', 'format', 'rentang', 'konflik', 'duplikat'].includes(a.kategori), a.id);
    }
  });
});

describe('field wajib & format', () => {
  test('nama + NISN + tanggal lahir + rombel + alamat kosong', () => {
    const t = periksaDataSiswa([siswa({ namaLengkap: '', nisn: '', tanggalLahir: '', rombelSaatIni: '', alamat: '' })]);
    const ids = aturanIds(t);
    for (const id of ['nama-kosong', 'nisn-kosong', 'tgl-lahir-kosong', 'rombel-kosong', 'alamat-kosong']) {
      assert.ok(ids.includes(id), `hilang: ${id} (dapat: ${ids.join(',')})`);
    }
  });
  test('format: NISN 9 digit, NIK 15 digit, KK huruf, NIPD 2 karakter, kode pos 4 digit', () => {
    const t = periksaDataSiswa([
      siswa({ nisn: '123456789', nik: '123456789012345', noKk: 'ABCDEFGHIJKLMNOP', nipd: 'AB', kodePos: '1234' }),
    ]);
    const ids = aturanIds(t);
    for (const id of ['nisn-format', 'nik-format', 'nokk-format', 'nipd-format', 'kodepos-format']) {
      assert.ok(ids.includes(id), `hilang: ${id}`);
    }
  });
  test('tanggal lahir masa depan & format tak valid (2021-02-30)', () => {
    const t1 = periksaDataSiswa([siswa({ tanggalLahir: '2999-01-01' })]);
    assert.ok(aturanIds(t1).includes('tgl-lahir-format'));
    const t2 = periksaDataSiswa([siswa({ tanggalLahir: '2021-02-30' })]);
    assert.ok(aturanIds(t2).includes('tgl-lahir-format'));
  });
  test('NIK orang tua bukan 16 digit → temuan', () => {
    const s = siswa();
    (s.ayah as { nik: string }).nik = '123';
    const t = periksaDataSiswa([s]);
    assert.ok(aturanIds(t).includes('nik-ortu-format'));
  });
});

describe('konflik antarkolom & rentang', () => {
  test('lahir setelah diterima → konflik', () => {
    const t = periksaDataSiswa([siswa({ tanggalLahir: '2022-01-01', tanggalDiterima: '2021-07-01' })]);
    assert.ok(aturanIds(t).includes('lahir-setelah-diterima'));
  });
  test('usia saat diterima 2 tahun → tidak wajar; 7 tahun → wajar', () => {
    const tMuda = periksaDataSiswa([siswa({ tanggalLahir: '2019-06-01', tanggalDiterima: '2021-07-01' })]);
    assert.ok(aturanIds(tMuda).includes('usia-diterima-tidak-wajar'));
    const tWajar = periksaDataSiswa([siswa({ tanggalLahir: '2014-05-10', tanggalDiterima: '2021-07-01' })]);
    assert.ok(!aturanIds(tWajar).includes('usia-diterima-tidak-wajar'));
  });
  test('siswa Aktif dengan tanggal keluar → konflik', () => {
    const t = periksaDataSiswa([siswa({ tanggalKeluar: '2024-06-01' })]);
    assert.ok(aturanIds(t).includes('tanggal-keluar-aktif'));
  });
  test('Pindahan tanpa asal mutasi → konflik; dengan asal → bersih', () => {
    const t1 = periksaDataSiswa([siswa({ jenisPendaftaran: 'Pindahan', asalMutasi: '' })]);
    assert.ok(aturanIds(t1).includes('pindahan-tanpa-asal'));
    const t2 = periksaDataSiswa([siswa({ jenisPendaftaran: 'Pindahan', asalMutasi: 'SDN 1' })]);
    assert.ok(!aturanIds(t2).includes('pindahan-tanpa-asal'));
  });
  test('NIK ayah == NIK ibu → konflik', () => {
    const s = siswa();
    (s.ibu as { nik: string }).nik = (s.ayah as { nik: string }).nik;
    const t = periksaDataSiswa([s]);
    assert.ok(aturanIds(t).includes('nik-ortu-sama'));
  });
  test('rentang: anak ke 0, tinggi 300 cm, jarak -1, lama SD 20, tahun lahir ortu 1800', () => {
    const s = siswa({ anakKe: 0, tinggiBadan: 300, jarakKeSekolahKm: -1, lamaBelajarSd: 20 });
    (s.ayah as { tahunLahir: string }).tahunLahir = '1800';
    const ids = aturanIds(periksaDataSiswa([s]));
    for (const id of ['anakke-rentang', 'fisik-rentang', 'jarak-rentang', 'lama-sd-rentang', 'tahun-lahir-ortu-rentang']) {
      assert.ok(ids.includes(id), `hilang: ${id}`);
    }
  });
  test('siswa non-Aktif dikecualikan dari cek per-record (arsip historis)', () => {
    const t = periksaDataSiswa([siswa({ statusSiswa: 'Lulus', namaLengkap: '', nisn: '', tanggalLahir: '' })]);
    assert.deepEqual(t, []);
  });
});

describe('duplikat: positif', () => {
  test('NISN sama persis → satu temuan duplikat-nisn per pasangan', () => {
    const a = siswa({ id: 'a', nisn: '0099999999' });
    const b = siswa({ id: 'b', nisn: '0099999999', namaLengkap: 'NAMA LAIN' });
    const t = periksaDataSiswa([a, b]);
    const dup = t.filter((x) => x.aturanId === 'duplikat-nisn');
    assert.equal(dup.length, 1);
    assert.deepEqual([dup[0].siswaId, dup[0].siswaIdLain].sort(), ['a', 'b']);
    // NISN sama + nama beda → bukan temuan fuzzy (sudah tertangkap exact)
    assert.ok(!t.some((x) => x.aturanId === 'duplikat-kemungkinan'));
  });
  test('NIK sama persis → duplikat-nik; NIPD sama → duplikat-nipd', () => {
    const a = siswa({ id: 'a', nisn: '0011111111', nik: '3201010101010099', nipd: '9001' });
    const b = siswa({ id: 'b', nisn: '0022222222', nik: '3201010101010099', nipd: '9001', namaLengkap: 'NAMA BEDA' });
    const ids = aturanIds(periksaDataSiswa([a, b]));
    assert.ok(ids.includes('duplikat-nik'));
    assert.ok(ids.includes('duplikat-nipd'));
  });
  test('nama + tanggal lahir sama, NISN beda → kemungkinan duplikat', () => {
    const a = siswa({ id: 'a', nisn: '0011111111' });
    const b = siswa({ id: 'b', nisn: '0022222222', nik: '3201010101010098', nipd: '9002' });
    const t = periksaDataSiswa([a, b]);
    assert.ok(t.some((x) => x.aturanId === 'duplikat-kemungkinan'));
  });
  test('nama mirip (beda 1 huruf, salah ketik) + tanggal lahir sama → duplikat-nama-mirip', () => {
    const a = siswa({ id: 'a', nisn: '0011111111', namaLengkap: 'MUHAMMAD RIZKY' });
    const b = siswa({ id: 'b', nisn: '0022222222', nik: '3201010101010098', nipd: '9002', namaLengkap: 'MUHAMMAD RISKY' });
    const t = periksaDataSiswa([a, b]);
    assert.ok(t.some((x) => x.aturanId === 'duplikat-nama-mirip'));
  });
  test('duplikat tetap terdeteksi bila salah satu record arsip (non-Aktif)', () => {
    const a = siswa({ id: 'a', nisn: '0011111111' });
    const b = siswa({ id: 'b', nisn: '0011111111', statusSiswa: 'Lulus', namaLengkap: 'NAMA LAIN' });
    const t = periksaDataSiswa([a, b]);
    assert.ok(t.some((x) => x.aturanId === 'duplikat-nisn'));
  });
  test('temuan duplikat tidak pernah menyarankan penggabungan otomatis', () => {
    const a = siswa({ id: 'a', nisn: '0011111111' });
    const b = siswa({ id: 'b', nisn: '0022222222', nik: '3201010101010098', nipd: '9002' });
    const t = periksaDataSiswa([a, b]);
    for (const x of t) {
      assert.ok(!/gabung|hapus otomatis/i.test(x.alasan), x.alasan);
      assert.ok(/manual/i.test(x.alasan), x.alasan);
    }
  });
});

describe('duplikat: negatif (anti false-positive)', () => {
  test('nama sama, tanggal lahir beda → BUKAN duplikat (nama umum Indonesia)', () => {
    const a = siswa({ id: 'a', nisn: '0011111111', namaLengkap: 'MUHAMMAD RIZKY', tanggalLahir: '2014-05-10' });
    const b = siswa({ id: 'b', nisn: '0022222222', nik: '3201010101010098', nipd: '9002', namaLengkap: 'MUHAMMAD RIZKY', tanggalLahir: '2015-03-02' });
    const t = periksaDataSiswa([a, b]);
    assert.ok(!t.some((x) => x.kategori === 'duplikat'), JSON.stringify(t));
  });
  test('tanggal lahir sama, nama jauh berbeda → BUKAN duplikat', () => {
    const a = siswa({ id: 'a', nisn: '0011111111', namaLengkap: 'BUDI SANTOSO' });
    const b = siswa({ id: 'b', nisn: '0022222222', nik: '3201010101010098', nipd: '9002', namaLengkap: 'SITI AMINAH RAHMAWATI' });
    const t = periksaDataSiswa([a, b]);
    assert.ok(!t.some((x) => x.kategori === 'duplikat'), JSON.stringify(t));
  });
  test('nama mirip tapi tanggal lahir beda → BUKAN duplikat', () => {
    const a = siswa({ id: 'a', nisn: '0011111111', namaLengkap: 'MUHAMMAD RIZKY', tanggalLahir: '2014-05-10' });
    const b = siswa({ id: 'b', nisn: '0022222222', nik: '3201010101010098', nipd: '9002', namaLengkap: 'MUHAMMAD RISKY', tanggalLahir: '2013-01-01' });
    const t = periksaDataSiswa([a, b]);
    assert.ok(!t.some((x) => x.kategori === 'duplikat'), JSON.stringify(t));
  });
  test('tiga siswa berbeda semua → tanpa temuan duplikat', () => {
    const list = [0, 1, 2].map((i) =>
      siswa({ id: `x${i}`, nisn: `001111111${i}`, nik: `32010101010100${i}0`, nipd: `900${i}`, namaLengkap: `SISWA KE ${i + 1} BEDA`, tanggalLahir: `201${3 + i}-05-10` })
    );
    const t = periksaDataSiswa(list);
    assert.ok(!t.some((x) => x.kategori === 'duplikat'));
  });
});

describe('normalisasi & jarak nama', () => {
  test('normalisasiNama membuang tanda baca & aksen', () => {
    assert.equal(normalisasiNama('  Budi, S.Pd. '), 'BUDI S PD');
    assert.equal(normalisasiNama('André'), 'ANDRE');
  });
  test('jarakLevenshtein', () => {
    assert.equal(jarakLevenshtein('RIZKY', 'RISKY'), 1);
    assert.equal(jarakLevenshtein('BUDI', 'SITI') > 2, true);
  });
});

describe('konfigurasi aturan', () => {
  test('menonaktifkan aturan menghilangkan temuannya saja', () => {
    const s = siswa({ nisn: '' });
    const semua = periksaDataSiswa([s]);
    assert.ok(semua.some((x) => x.aturanId === 'nisn-kosong'));
    const tanpa = periksaDataSiswa([s], { 'nisn-kosong': false });
    assert.ok(!tanpa.some((x) => x.aturanId === 'nisn-kosong'));
    // Aturan lain tetap jalan
    assert.ok(tanpa.some((x) => x.aturanId === 'alamat-kosong') === false); // alamat terisi → tidak ada
  });
  test('ID aturan tak dikenal di konfigurasi diabaikan', () => {
    const t = periksaDataSiswa([siswa({ nisn: '' })], { 'aturan-tidak-ada': false });
    assert.ok(t.some((x) => x.aturanId === 'nisn-kosong'));
  });
});

describe('status penanganan temuan', () => {
  test('default belum-diperiksa; tandai diperbaiki/diabaikan', () => {
    const [t] = periksaDataSiswa([siswa({ nisn: '' })]);
    assert.equal(statusEfektifTemuan(t, {}), 'belum-diperiksa');
    let peta = tandaiTemuan({}, t.id, 'diperbaiki');
    assert.equal(statusEfektifTemuan(t, peta), 'diperbaiki');
    peta = tandaiTemuan(peta, t.id, 'diabaikan', 'NISN sedang diurus ke Dapodik');
    assert.equal(statusEfektifTemuan(t, peta), 'diabaikan');
  });
  test('mengabaikan tanpa alasan ditolak', () => {
    assert.throws(() => tandaiTemuan({}, 'x', 'diabaikan'), /Alasan wajib/);
    assert.throws(() => tandaiTemuan({}, 'x', 'diabaikan', '   '), /Alasan wajib/);
  });
  test('ringkasan menghitung per prioritas & status', () => {
    const list = [siswa({ id: 'a', nisn: '' }), siswa({ id: 'b', nisn: '0022222222', nik: '3201010101010098', nipd: '9002' })];
    const t = periksaDataSiswa(list);
    const r = ringkasanTemuan(t, {});
    assert.equal(r.total, t.length);
    assert.equal(r.belumDiperiksa, t.length);
    assert.equal(r.tinggi + r.sedang + r.rendah, t.length);
    const peta = tandaiTemuan({}, t[0].id, 'diperbaiki');
    const r2 = ringkasanTemuan(t, peta);
    assert.equal(r2.diperbaiki, 1);
    assert.equal(r2.belumDiperiksa, t.length - 1);
  });
  test('status hanya menyimpan ID + alasan — tanpa nama/NISN siswa', () => {
    const [t] = periksaDataSiswa([siswa({ nisn: '' })]);
    const peta = tandaiTemuan({}, t.id, 'diabaikan', 'dalam pengurusan');
    const json = JSON.stringify(peta);
    assert.ok(!json.includes('BUDI'));
    assert.ok(!json.includes('0012345678'));
  });
});

describe('perbandingan data impor vs data saat ini', () => {
  const existing = [siswa({ id: 'lokal-1', nisn: '0012345678', namaLengkap: 'BUDI SANTOSO', tanggalLahir: '2014-05-10', rombelSaatIni: '4A', nik: '3201010101010001' })];
  test('baris baru, sama, dan berbeda', () => {
    const hasil = bandingkanDenganImpor(
      [
        { nisn: '0099999999', namaLengkap: 'SISWA BARU' },
        { nisn: '0012345678', namaLengkap: 'BUDI SANTOSO', tanggalLahir: '2014-05-10', rombelSaatIni: '4A', nik: '3201010101010001' },
        { nisn: '0012345678', namaLengkap: 'BUDI SANTOSO', tanggalLahir: '2014-05-10', rombelSaatIni: '4B', nik: '3201010101010001' },
      ],
      existing
    );
    assert.equal(hasil[0].status, 'baru');
    assert.equal(hasil[1].status, 'sama');
    assert.equal(hasil[2].status, 'berbeda');
    assert.ok(hasil[2].perubahan.some((p) => p.includes('Rombel')));
    assert.equal(hasil[2].siswaId, 'lokal-1');
  });
  test('NIK baris impor milik siswa lain → konflik', () => {
    const dua = [
      ...existing,
      siswa({ id: 'lokal-2', nisn: '0022222222', nik: '3201010101010099', nipd: '9002', namaLengkap: 'SISWA KEDUA' }),
    ];
    const hasil = bandingkanDenganImpor(
      [{ nisn: '0012345678', namaLengkap: 'BUDI SANTOSO', nik: '3201010101010099' }],
      dua
    );
    assert.equal(hasil[0].status, 'konflik');
  });
  test('baris tanpa NISN → tanpa-kunci, tidak dicocokkan paksa', () => {
    const hasil = bandingkanDenganImpor([{ nisn: '', namaLengkap: 'TANPA NISN' }], existing);
    assert.equal(hasil[0].status, 'tanpa-kunci');
  });
  test('impor tidak mengubah data existing (input tidak dimutasi)', () => {
    const sebelum = JSON.stringify(existing);
    bandingkanDenganImpor([{ nisn: '0012345678', namaLengkap: 'NAMA BERUBAH' }], existing);
    assert.equal(JSON.stringify(existing), sebelum);
  });
});

describe('parseCsvImpor', () => {
  test('header + baris biasa, CRLF, dan field ber-quote berisi koma', () => {
    const csv = 'nisn,nama,tanggalLahir,rombel,nik\r\n0012345678,"BUDI, SANTOSO",2014-05-10,4A,3201010101010001\r\n0099999999,SITI,2015-01-01,3B,';
    const baris = parseCsvImpor(csv);
    assert.equal(baris.length, 2);
    assert.equal(baris[0].namaLengkap, 'BUDI, SANTOSO');
    assert.equal(baris[0].rombelSaatIni, '4A');
    assert.equal(baris[1].nik, '');
  });
  test('tanpa kolom NISN → error jelas', () => {
    assert.throws(() => parseCsvImpor('nama,rombel\nBUDI,4A'), /Kolom NISN/);
  });
  test('teks kosong → tanpa baris', () => {
    assert.deepEqual(parseCsvImpor(''), []);
  });
});
