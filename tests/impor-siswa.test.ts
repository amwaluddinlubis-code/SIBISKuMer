/**
 * Tes regresi impor Excel/CSV siswa — Issue #11.
 * Dijalankan dengan `npm test` (tsx + node:test).
 * SEMUA data fiktif (nama/NISN/NIK karangan) — tanpa data pribadi nyata.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Siswa } from '../src/types';
import {
  IMPOR_MAX_BARIS,
  KOLOM_IMPOR,
  TEMPLATE_FIELDS,
  CONTOH_BARIS_TEMPLATE,
  barisDariExcel,
  barisKeNilai,
  bangunCsvTemplate,
  bangunSiswaBaru,
  catatSidikImpor,
  headerTemplate,
  hitungSidikJari,
  laporanErrorCsv,
  normalisasiNilaiKolom,
  normalisasiTanggal,
  parseCsv,
  petakanKolomOtomatis,
  pisahHeaderDanData,
  rekonsiliasiImpor,
  rencanaTerapkan,
  sidikSudahDiterapkan,
  validasiFileImpor,
  validasiSemuaBaris,
} from '../src/utils/imporSiswa';

/** Siswa fiktif lengkap untuk fixture rekonsiliasi. */
function siswaFiktif(over: Partial<Siswa> = {}): Siswa {
  const dasar: Siswa = {
    id: 'sis-fiktif-1',
    namaLengkap: 'BUDI SANTOSO',
    namaPanggilan: 'Budi',
    jenisKelamin: 'L',
    nisn: '0091234567',
    nipd: '1001',
    nik: '3201010101010001',
    noKk: '3201010101010001',
    noAktaLahir: '',
    tempatLahir: 'Natal',
    tanggalLahir: '2014-05-02',
    agama: 'Islam',
    kewarganegaraan: 'WNI',
    anakKe: 1,
    jumlahSaudaraKandung: 0,
    jumlahSaudaraTiri: 0,
    jumlahSaudaraAngkat: 0,
    statusDalamKeluarga: 'Anak Kandung',
    bahasaSehariHari: 'Bahasa Indonesia',
    golonganDarah: '-',
    tinggiBadan: 0,
    beratBadan: 0,
    riwayatPenyakit: 'Tidak ada',
    kelainanFisik: 'Tidak ada',
    kebutuhanKhusus: 'Tidak ada',
    alamat: 'Jl. Merdeka No. 12',
    rt: '01',
    rw: '02',
    dusun: '',
    kelurahan: 'Pasar Natal',
    kecamatan: 'Natal',
    kabupatenKota: '',
    provinsi: '',
    kodePos: '22987',
    tinggalDengan: 'Orang Tua',
    jarakKeSekolahKm: 1,
    transportasiKeSekolah: 'Jalan Kaki',
    ayah: { nama: 'Ahmad Santoso', nik: '', tahunLahir: '', pendidikan: '', pekerjaan: '', penghasilan: '', noTelepon: '', status: 'Masih Hidup' },
    ibu: { nama: 'Siti Aminah', nik: '', tahunLahir: '', pendidikan: '', pekerjaan: '', penghasilan: '', noTelepon: '', status: 'Masih Hidup' },
    asalSdMi: 'SD Negeri 01 Natal',
    npsnSdMi: '',
    noIjazahSd: '',
    tahunLulusSd: '2026',
    lamaBelajarSd: 6,
    tanggalDiterima: '2026-07-15',
    diterimaDiTingkat: '7',
    diterimaDiRombel: '7A',
    rombelSaatIni: '7A',
    jalurMasuk: 'Zonasi',
    jenisPendaftaran: 'Siswa Baru',
    p5Projects: [],
    ekstrakurikuler: [],
    prestasi: [],
    riwayatSemester: [],
    statusSiswa: 'Aktif',
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  };
  return { ...dasar, ...over };
}

function penyimpananMap() {
  const map = new Map<string, string>();
  return {
    baca: () => map.get('sidik') ?? null,
    tulis: (raw: string) => {
      map.set('sidik', raw);
    },
  };
}

describe('validasiFileImpor', () => {
  test('tolak format tidak didukung, berkas kosong, dan berkas > 5 MB', () => {
    assert.ok(validasiFileImpor('data.pdf', 100).length > 0);
    assert.ok(validasiFileImpor('data.docx', 100).length > 0);
    assert.ok(validasiFileImpor('data.csv', 0).length > 0);
    assert.ok(validasiFileImpor('data.xlsx', 6 * 1024 * 1024).length > 0);
  });
  test('terima .csv dan .xlsx dalam batas', () => {
    assert.deepEqual(validasiFileImpor('siswa.CSV', 1000), []);
    assert.deepEqual(validasiFileImpor('siswa.xlsx', 1000), []);
  });
});

describe('parseCsv', () => {
  test('delimiter titik-koma, kutip berisi koma, dan baris baru dalam kutip', () => {
    const rows = parseCsv('"Nama";"Alamat"\n"Andi, Jr.";"Jl. A\nNo. 1"\n');
    assert.deepEqual(rows, [['Nama', 'Alamat'], ['Andi, Jr.', 'Jl. A\nNo. 1']]);
  });
  test('delimiter koma bila titik-koma tidak dominan + BOM dibuang', () => {
    const rows = parseCsv('\uFEFFNama,NISN\nBudi,0091234567\n');
    assert.deepEqual(rows[0], ['Nama', 'NISN']);
  });
  test('encoding rusak (U+FFFD) ditolak dengan pesan jelas', () => {
    assert.throws(() => parseCsv('Nama\nBud�\n'), /Encoding berkas/);
  });
  test('kutip tak berpasangan ditolak', () => {
    assert.throws(() => parseCsv('"Nama\nBudi\n'), /kutip tidak berpasangan/);
  });
});

describe('pisahHeaderDanData', () => {
  test('buang baris kosong dan tolak berkas tanpa data', () => {
    assert.throws(() => pisahHeaderDanData([['Nama'], [], ['  ']]), /hanya berisi header/);
    assert.throws(() => pisahHeaderDanData([]), /tidak berisi data/);
  });
  test('tolak lebih dari batas baris', () => {
    const mentah = [['Nama'], ...Array.from({ length: IMPOR_MAX_BARIS + 1 }, () => ['Budi'])];
    assert.throws(() => pisahHeaderDanData(mentah), /Terlalu banyak baris/);
  });
});

describe('normalisasiTanggal', () => {
  test('terima YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, dan objek Date', () => {
    assert.equal(normalisasiTanggal('2014-05-02'), '2014-05-02');
    assert.equal(normalisasiTanggal('02/05/2014'), '2014-05-02');
    assert.equal(normalisasiTanggal('02-05-2014'), '2014-05-02');
    assert.equal(normalisasiTanggal(new Date(2014, 4, 2)), '2014-05-02');
  });
  test('terima nomor seri tanggal Excel (44927 = 2023-01-01)', () => {
    assert.equal(normalisasiTanggal(44927), '2023-01-01');
  });
  test('tolak tanggal tak ada, tahun 2 digit, dan teks bebas', () => {
    assert.equal(normalisasiTanggal('2026-02-30'), null);
    assert.equal(normalisasiTanggal('02/05/14'), null);
    assert.equal(normalisasiTanggal('kemarin'), null);
    assert.equal(normalisasiTanggal(''), null);
  });
});

describe('pemetaan kolom', () => {
  test('otomatis lewat label dan alias; kolom asing ditandai', () => {
    const hasil = petakanKolomOtomatis(['Nama', 'NISN', 'Rombel', 'Kolom Aneh XYZ', 'Nama Lengkap']);
    assert.equal(hasil.pemetaan[0], 'namaLengkap');
    assert.equal(hasil.pemetaan[1], 'nisn');
    assert.equal(hasil.pemetaan[2], 'rombelSaatIni');
    assert.equal(hasil.pemetaan[3], null);
    assert.equal(hasil.takDikenal.length, 1);
    assert.equal(hasil.takDikenal[0].header, 'Kolom Aneh XYZ');
    // 'Nama Lengkap' duplikat field namaLengkap -> diabaikan + peringatan
    assert.equal(hasil.pemetaan[4], null);
    assert.ok(hasil.peringatan.length > 0);
  });
  test('field wajib yang hilang dilaporkan', () => {
    const hasil = petakanKolomOtomatis(['Nama']);
    assert.ok(hasil.wajibHilang.includes('NISN'));
    assert.ok(hasil.wajibHilang.includes('Rombel Saat Ini'));
  });
  test('normalisasi nilai: Laki-laki -> L, katolik -> Katholik, koma desimal', () => {
    const defJk = KOLOM_IMPOR.find((d) => d.field === 'jenisKelamin')!;
    const defAgama = KOLOM_IMPOR.find((d) => d.field === 'agama')!;
    const defJarak = KOLOM_IMPOR.find((d) => d.field === 'jarakKeSekolahKm')!;
    assert.equal(normalisasiNilaiKolom('Laki-laki', defJk), 'L');
    assert.equal(normalisasiNilaiKolom('katolik', defAgama), 'Katholik');
    assert.equal(normalisasiNilaiKolom('1,5', defJarak), '1.5');
  });
  test('barisKeNilai hanya memetakan kolom terpetakan', () => {
    const pemetaan = ['namaLengkap', 'nisn', null];
    assert.deepEqual(barisKeNilai(['Budi', '0091234567', 'abaikan'], pemetaan), {
      namaLengkap: 'Budi',
      nisn: '0091234567',
    });
  });
});

describe('validasi per baris', () => {
  test('baris valid lolos tanpa error', () => {
    const [b] = validasiSemuaBaris([
      { namaLengkap: 'Budi Santoso', nisn: '0091234567', rombelSaatIni: '7A', jenisKelamin: 'L' },
    ]);
    assert.deepEqual(b.errors, []);
  });
  test('NISN salah format, rombel salah format, pilihan tak dikenal ditolak', () => {
    const [b] = validasiSemuaBaris([
      { namaLengkap: 'Budi', nisn: '123', rombelSaatIni: 'Kelas 7', agama: 'Ateis' },
    ]);
    assert.ok(b.errors.some((e) => e.includes('NISN')));
    assert.ok(b.errors.some((e) => e.includes('Rombel')));
    assert.ok(b.errors.some((e) => e.includes('Agama')));
  });
  test('NISN duplikat dalam berkas hanya menandai baris kedua', () => {
    const hasil = validasiSemuaBaris([
      { namaLengkap: 'Budi', nisn: '0091234567', rombelSaatIni: '7A' },
      { namaLengkap: 'Andi', nisn: '0091234567', rombelSaatIni: '7A' },
    ]);
    assert.deepEqual(hasil[0].errors, []);
    assert.ok(hasil[1].errors.some((e) => e.includes('duplikat dalam berkas')));
  });
  test('tanggal lahir masa depan dan tanggal lahir setelah diterima ditolak', () => {
    const [b] = validasiSemuaBaris([
      { namaLengkap: 'Budi', nisn: '0091234567', rombelSaatIni: '7A', tanggalLahir: '2999-01-01' },
    ]);
    assert.ok(b.errors.some((e) => e.includes('masa depan')));
    const [c] = validasiSemuaBaris([
      { namaLengkap: 'Budi', nisn: '0091234567', rombelSaatIni: '7A', tanggalLahir: '2020-01-01', tanggalDiterima: '2019-07-15' },
    ]);
    assert.ok(c.errors.some((e) => e.includes('setelah Tanggal Diterima')));
  });
  test('rombel wajib diisi', () => {
    const [b] = validasiSemuaBaris([{ namaLengkap: 'Budi', nisn: '0091234567' }]);
    assert.ok(b.errors.some((e) => e.includes('Rombel Saat Ini wajib')));
  });
});

describe('rekonsiliasi', () => {
  const bolehSemua = () => true;
  const bolehHanya7A = (rombel: string) => rombel === '7A';
  const lama = [siswaFiktif()];

  test('baris tanpa kecocokan = baru (keputusan tambah)', () => {
    const [r] = rekonsiliasiImpor(
      validasiSemuaBaris([{ namaLengkap: 'Andi', nisn: '0091234568', rombelSaatIni: '7A' }]),
      lama, bolehSemua
    );
    assert.equal(r.klasifikasi, 'baru');
    assert.equal(r.keputusan, 'tambah');
  });
  test('baris identik = sama (keputusan lewati, tanpa perbedaan)', () => {
    const [r] = rekonsiliasiImpor(
      validasiSemuaBaris([{
        namaLengkap: 'BUDI SANTOSO', nisn: '0091234567', rombelSaatIni: '7A',
        alamat: 'Jl. Merdeka No. 12',
      }]),
      lama, bolehSemua
    );
    assert.equal(r.klasifikasi, 'sama');
    assert.deepEqual(r.perbedaan, []);
  });
  test('baris berbeda = beda, default TIDAK auto-merge (lewati), sel kosong bukan perbedaan', () => {
    const [r] = rekonsiliasiImpor(
      validasiSemuaBaris([{
        namaLengkap: 'BUDI SANTOSO', nisn: '0091234567', rombelSaatIni: '7A',
        alamat: 'Jl. Baru No. 99', nik: '',
      }]),
      lama, bolehSemua
    );
    assert.equal(r.klasifikasi, 'beda');
    assert.equal(r.keputusan, 'lewati');
    assert.equal(r.perbedaan.length, 1);
    assert.equal(r.perbedaan[0].field, 'alamat');
  });
  test('NISN cocok siswa A tetapi NIK cocok siswa B = konflik', () => {
    const dua = [siswaFiktif(), siswaFiktif({ id: 'sis-fiktif-2', namaLengkap: 'ANDI', nisn: '0091234568', nik: '3201010101010009', rombelSaatIni: '7B' })];
    const [r] = rekonsiliasiImpor(
      validasiSemuaBaris([{ namaLengkap: 'X', nisn: '0091234567', nik: '3201010101010009', rombelSaatIni: '7A' }]),
      dua, bolehSemua
    );
    assert.equal(r.klasifikasi, 'konflik');
    assert.equal(r.keputusan, 'lewati');
  });
  test('baris error tidak direkonsiliasi (klasifikasi error)', () => {
    const [r] = rekonsiliasiImpor(
      validasiSemuaBaris([{ namaLengkap: 'Budi', nisn: '123', rombelSaatIni: '7A' }]),
      lama, bolehSemua
    );
    assert.equal(r.klasifikasi, 'error');
  });
  test('rombel di luar kewenangan = ditolak-akses TANPA menampilkan nilai lama', () => {
    const [r] = rekonsiliasiImpor(
      validasiSemuaBaris([{ namaLengkap: 'Budi Baru', nisn: '0091234569', rombelSaatIni: '8A' }]),
      lama, bolehHanya7A
    );
    assert.equal(r.klasifikasi, 'ditolak-akses');
    assert.deepEqual(r.perbedaan, []);
    // Siswa lama di rombel 7A yang dipindah ke 8A juga ditolak
    const [r2] = rekonsiliasiImpor(
      validasiSemuaBaris([{ namaLengkap: 'BUDI SANTOSO', nisn: '0091234567', rombelSaatIni: '8A' }]),
      lama, bolehHanya7A
    );
    assert.equal(r2.klasifikasi, 'ditolak-akses');
    assert.deepEqual(r2.perbedaan, []);
  });
});

describe('rencanaTerapkan', () => {
  test('tidak memutasi input; tambah memakai default jujur; perbarui hanya field terisi', () => {
    const lama = [siswaFiktif()];
    const sebelum = JSON.stringify(lama);
    const tervalidasi = validasiSemuaBaris([
      { namaLengkap: 'Andi Baru', nisn: '0091234568', rombelSaatIni: '7A' },
      { namaLengkap: 'BUDI SANTOSO', nisn: '0091234567', rombelSaatIni: '7A', alamat: 'Jl. Baru No. 99', nik: '' },
    ]);
    const rekons = rekonsiliasiImpor(tervalidasi, lama, () => true);
    rekons[1].keputusan = 'perbarui';
    const sebelumRekons = JSON.stringify(rekons);
    const { tambah, perbarui } = rencanaTerapkan(rekons, lama, {
      jenjang: 'SMP',
      tahunAjaran: '2026/2027',
      sekarangIso: '2026-10-15T00:00:00.000Z',
    });
    assert.equal(tambah.length, 1);
    assert.equal(tambah[0].namaLengkap, 'Andi Baru');
    assert.deepEqual(tambah[0].p5Projects, []);
    assert.deepEqual(tambah[0].riwayatSemester, []);
    assert.equal(perbarui.length, 1);
    assert.equal(perbarui[0].alamat, 'Jl. Baru No. 99');
    // NIK lama dipertahankan (sel kosong = tidak diubah)
    assert.equal(perbarui[0].nik, '3201010101010001');
    assert.equal(JSON.stringify(lama), sebelum);
    assert.equal(JSON.stringify(rekons), sebelumRekons);
  });
  test('bangunSiswaBaru: nama panggilan dari kata pertama bila kosong', () => {
    const s = bangunSiswaBaru(
      { namaLengkap: 'Budi Santoso', nisn: '0091234567', rombelSaatIni: '7A' },
      { jenjang: 'SMP', tahunAjaran: '2026/2027', sekarangIso: '2026-10-15T00:00:00.000Z' },
      'tes'
    );
    assert.equal(s.namaPanggilan, 'Budi');
    assert.equal(s.diterimaDiTingkat, '7');
    assert.equal(s.statusSiswa, 'Aktif');
  });
});

describe('laporanErrorCsv', () => {
  test('laporan meng-escape kutip dan menetralkan formula injection', () => {
    const rekons = rekonsiliasiImpor(
      validasiSemuaBaris([{ namaLengkap: '=CMD()', nisn: '123', rombelSaatIni: '7A' }]),
      [], () => true
    );
    const csv = laporanErrorCsv(rekons);
    assert.ok(csv.startsWith('\uFEFF'));
    assert.ok(csv.includes("'=CMD()"));
    assert.ok(csv.includes('"Baris";"Nama";"NISN";"Status";"Pesan"'));
  });
});

describe('sidik jari berkas', () => {
  test('deterministik, berbeda untuk isi berbeda, dan tercatat sekali', async () => {
    const a = await hitungSidikJari('isi-yang-sama');
    const b = await hitungSidikJari('isi-yang-sama');
    const c = await hitungSidikJari('isi-berbeda');
    assert.equal(a, b);
    assert.notEqual(a, c);
    const simpan = penyimpananMap();
    assert.equal(sidikSudahDiterapkan(a, simpan), null);
    catatSidikImpor({ sidik: a, namaFile: 'siswa.csv', diterapkanPada: '2026-10-15T00:00:00.000Z', tambah: 2, perbarui: 0, lewati: 0 }, simpan);
    assert.equal(sidikSudahDiterapkan(a, simpan)?.namaFile, 'siswa.csv');
    assert.equal(sidikSudahDiterapkan(c, simpan), null);
  });
});

describe('template impor', () => {
  test('header dan contoh baris sejajar; CSV template dapat diparsing kembali', () => {
    const header = headerTemplate();
    assert.equal(header.length, TEMPLATE_FIELDS.length);
    for (const baris of CONTOH_BARIS_TEMPLATE) {
      assert.equal(baris.length, TEMPLATE_FIELDS.length);
    }
    const parsed = parseCsv(bangunCsvTemplate());
    assert.deepEqual(parsed[0], header);
    assert.equal(parsed.length, 1 + CONTOH_BARIS_TEMPLATE.length);
  });
  test('contoh baris template lolos validasi (data fiktif valid)', () => {
    const pemetaan = TEMPLATE_FIELDS.map((f) => f);
    const nilai = CONTOH_BARIS_TEMPLATE.map((baris) => barisKeNilai(baris, pemetaan));
    const hasil = validasiSemuaBaris(nilai);
    for (const b of hasil) assert.deepEqual(b.errors, [], JSON.stringify(b.errors));
  });
});

describe('barisDariExcel', () => {
  test('sheet pertama dibaca; sel tanggal Date -> YYYY-MM-DD', () => {
    const fakeXlsx = {
      read: () => ({ SheetNames: ['Siswa', 'Lain'], Sheets: { Siswa: {} } }),
      utils: {
        sheet_to_json: () => [
          ['Nama', 'Tanggal Lahir'],
          ['Budi', new Date(2014, 4, 2)],
        ],
      },
    };
    const { namaSheet, jumlahSheet, barisMentah } = barisDariExcel(new ArrayBuffer(8), fakeXlsx);
    assert.equal(namaSheet, 'Siswa');
    assert.equal(jumlahSheet, 2);
    assert.deepEqual(barisMentah[1], ['Budi', '2014-05-02']);
  });
  test('berkas Excel rusak ditolak dengan pesan jelas', () => {
    const fakeRusak = {
      read: () => {
        throw new Error('boom');
      },
      utils: { sheet_to_json: () => [] },
    };
    assert.throws(() => barisDariExcel(new ArrayBuffer(8), fakeRusak), /tidak dapat dibaca/);
  });
});
