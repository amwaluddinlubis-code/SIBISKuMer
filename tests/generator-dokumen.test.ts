/**
 * Tes regresi Generator Dokumen Administrasi — Issue #4.
 * Hanya fungsi MURNI dari src/utils/suratDokumen.ts (tanpa DOM/IndexedDB).
 * TIDAK memakai data siswa nyata — semua fixture fiktif.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SekolahProfile, Siswa } from '../src/types';
import {
  auditEksporDokumen,
  bangunDokumenSurat,
  bulanRomawi,
  DAFTAR_TEMPLATE_SURAT,
  defaultPenomoran,
  formatNomorSurat,
  getPenomoran,
  kotaTanggal,
  prefillField,
  saranNomorUrut,
  siswaUntukTemplate,
  tandaiNomorTerpakai,
  tanggalIndo,
  terapkanPenomoran,
  validasiSurat,
  type InputSurat,
} from '../src/utils/suratDokumen';

function buatSekolah(patch: Partial<SekolahProfile> = {}): SekolahProfile {
  return {
    nama: 'SMP NEGERI 1 CONTOH',
    npsn: '10200001',
    nss: '201060101001',
    jenjang: 'SMP',
    bentukPendidikan: 'SMP',
    statusSekolah: 'Negeri',
    alamat: 'Jl. Contoh No. 1',
    desaKelurahan: 'Desa Contoh',
    kecamatan: 'Contoh',
    kabupatenKota: 'Kab. Mandailing Natal',
    provinsi: 'Sumatera Utara',
    kodePos: '22900',
    telepon: '061234567',
    email: 'contoh@example.sch.id',
    website: '',
    kepalaSekolah: 'Drs. Contoh Kepala',
    nipKepalaSekolah: '196001011985031001',
    petugasBukuInduk: 'Contoh Petugas',
    nipPetugas: '198001011990031001',
    semesterAktif: '1 (Ganjil)',
    tahunAjaran: '2026/2027',
    ...patch,
  } as SekolahProfile;
}

function buatSiswa(patch: Partial<Siswa> = {}): Siswa {
  return {
    id: 'sis-1',
    namaLengkap: 'Andi Contoh Siswa',
    namaPanggilan: 'Andi',
    jenisKelamin: 'L',
    nisn: '0012345678',
    nipd: '1001',
    nik: '1201010101010001',
    tempatLahir: 'Panyabungan',
    tanggalLahir: '2013-05-10',
    agama: 'Islam',
    kewarganegaraan: 'WNI',
    anakKe: 1,
    jumlahSaudaraKandung: 1,
    jumlahSaudaraTiri: 0,
    jumlahSaudaraAngkat: 0,
    statusDalamKeluarga: 'Anak Kandung',
    bahasaSehariHari: 'Bahasa Indonesia',
    golonganDarah: 'O',
    tinggiBadan: 140,
    beratBadan: 35,
    riwayatPenyakit: '',
    kelainanFisik: '',
    kebutuhanKhusus: '',
    alamat: 'Jl. Contoh No. 2',
    rt: '001',
    rw: '002',
    dusun: '',
    kelurahan: 'Desa Contoh',
    kecamatan: 'Contoh',
    kabupatenKota: 'Kab. Mandailing Natal',
    provinsi: 'Sumatera Utara',
    kodePos: '22900',
    tinggalDengan: 'Orang Tua',
    jarakKeSekolahKm: 1,
    transportasiKeSekolah: 'Jalan Kaki',
    ayah: { nama: 'Ayah Contoh', nik: '', tahunLahir: '1980', pendidikan: 'SMA', pekerjaan: 'Petani', penghasilan: '', noTelepon: '', status: 'Masih Hidup' },
    ibu: { nama: 'Ibu Contoh', nik: '', tahunLahir: '1982', pendidikan: 'SMA', pekerjaan: 'Ibu Rumah Tangga', penghasilan: '', noTelepon: '', status: 'Masih Hidup' },
    asalSdMi: 'SDN 1 Contoh',
    npsnSdMi: '',
    noIjazahSd: '',
    tahunLulusSd: '2025',
    lamaBelajarSd: 6,
    tanggalDiterima: '2026-07-14',
    diterimaDiTingkat: '7',
    diterimaDiRombel: '7A',
    rombelSaatIni: '7A',
    jalurMasuk: 'Zonasi',
    p5Projects: [],
    ekstrakurikuler: [],
    prestasi: [],
    riwayatSemester: [],
    statusSiswa: 'Aktif',
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
    ...patch,
  } as unknown as Siswa;
}

const inputAktif = (field: Record<string, string> = {}): InputSurat => ({
  nomorUrut: 7,
  tanggalSurat: '2026-10-15',
  field: { keperluan: 'pengajuan beasiswa', ...field },
});

describe('tanggal & bulan', () => {
  test('tanggalIndo memakai nama bulan Indonesia', () => {
    assert.equal(tanggalIndo('2026-10-15'), '15 Oktober 2026');
    assert.equal(tanggalIndo('2026-02-03'), '3 Februari 2026');
  });
  test('tanggalIndo mengembalikan input tak valid apa adanya', () => {
    assert.equal(tanggalIndo('bukan-tanggal'), 'bukan-tanggal');
    assert.equal(tanggalIndo('2026-13-01'), '2026-13-01');
    assert.equal(tanggalIndo(''), '');
  });
  test('bulanRomawi 1→I, 10→X, 12→XII, tak valid→kosong', () => {
    assert.equal(bulanRomawi(1), 'I');
    assert.equal(bulanRomawi(10), 'X');
    assert.equal(bulanRomawi(12), 'XII');
    assert.equal(bulanRomawi(0), '');
    assert.equal(bulanRomawi(13), '');
  });
  test('kotaTanggal membuang awalan Kab./Kota', () => {
    assert.equal(kotaTanggal(buatSekolah(), '2026-10-15'), 'Mandailing Natal, 15 Oktober 2026');
  });
});

describe('penomoran', () => {
  test('formatNomorSurat mengganti semua placeholder', () => {
    assert.equal(formatNomorSurat('{no}/SK-AKTIF/{bulanRomawi}/{tahun}', 7, '2026-10-15'), '7/SK-AKTIF/X/2026');
    assert.equal(formatNomorSurat('{no3}/{bulan}/{tahun}', 7, '2026-10-15'), '007/10/2026');
  });
  test('placeholder tak dikenal dibiarkan (salah konfigurasi terlihat)', () => {
    assert.equal(formatNomorSurat('{no}/{kode}/{tahun}', 7, '2026-10-15'), '7/{kode}/2026');
  });
  test('pola kosong → nomor urut saja', () => {
    assert.equal(formatNomorSurat('', 7, '2026-10-15'), '7');
  });
  test('getPenomoran: profil lama tanpa penomoran memakai bawaan', () => {
    const p = getPenomoran(buatSekolah({ penomoran: undefined }), 'keterangan-aktif');
    assert.ok(p.pola.includes('{no}'));
    assert.equal(p.nomorTerakhir, 0);
  });
  test('getPenomoran: konfigurasi sekolah dipertahankan', () => {
    const p = getPenomoran(
      buatSekolah({ penomoran: { 'keterangan-aktif': { pola: '421/{no}/2026', nomorTerakhir: 12 } } }),
      'keterangan-aktif',
    );
    assert.equal(p.pola, '421/{no}/2026');
    assert.equal(p.nomorTerakhir, 12);
  });
  test('saranNomorUrut = nomorTerakhir + 1', () => {
    assert.equal(saranNomorUrut({ pola: 'x', nomorTerakhir: 12 }), 13);
    assert.equal(saranNomorUrut({ pola: 'x', nomorTerakhir: 0 }), 1);
  });
  test('tandaiNomorTerpakai tidak pernah mundur', () => {
    assert.equal(tandaiNomorTerpakai({ pola: 'x', nomorTerakhir: 5 }, 3).nomorTerakhir, 5);
    assert.equal(tandaiNomorTerpakai({ pola: 'x', nomorTerakhir: 5 }, 9).nomorTerakhir, 9);
  });
  test('terapkanPenomoran murni (profil lama tidak dimutasi)', () => {
    const lama = buatSekolah({ penomoran: undefined });
    const baru = terapkanPenomoran(lama, 'keterangan-aktif', 4);
    assert.equal(baru.penomoran?.['keterangan-aktif']?.nomorTerakhir, 4);
    assert.equal(lama.penomoran, undefined);
    assert.equal(defaultPenomoran()['keterangan-aktif']?.nomorTerakhir, 0);
  });
});

describe('kandidat siswa & prefill', () => {
  test('siswaUntukTemplate: surat pindah menerima Aktif + Mutasi Keluar, bukan Lulus', () => {
    const daftar = [
      buatSiswa({ id: 'a', statusSiswa: 'Aktif' }),
      buatSiswa({ id: 'b', statusSiswa: 'Mutasi Keluar' }),
      buatSiswa({ id: 'c', statusSiswa: 'Lulus' }),
    ];
    assert.deepEqual(siswaUntukTemplate(daftar, 'pindah-keluar').map((s) => s.id), ['a', 'b']);
    assert.deepEqual(siswaUntukTemplate(daftar, 'keterangan-aktif').map((s) => s.id), ['a']);
    assert.deepEqual(siswaUntukTemplate(daftar, 'panggilan-ortu').map((s) => s.id), ['a']);
  });
  test('prefillField pindah mengambil data mutasi tercatat', () => {
    const s = buatSiswa({
      statusSiswa: 'Mutasi Keluar',
      sekolahTujuan: 'SMPN 2 Contoh',
      tanggalKeluar: '2026-09-01',
      alasanKeluar: 'Pindah mengikuti orang tua',
    });
    assert.deepEqual(prefillField('pindah-keluar', s), {
      sekolahTujuan: 'SMPN 2 Contoh',
      tanggalKeluar: '2026-09-01',
      alasan: 'Pindah mengikuti orang tua',
    });
    assert.deepEqual(prefillField('keterangan-aktif', s), {});
    assert.deepEqual(prefillField('pindah-keluar', null), {});
  });
});

describe('validasiSurat', () => {
  const sekolah = buatSekolah();
  const siswa = buatSiswa();
  test('input lengkap → tanpa field hilang', () => {
    assert.deepEqual(validasiSurat('keterangan-aktif', inputAktif(), siswa, '', [], sekolah), []);
  });
  test('keperluan kosong ditandai; nomor urut < 1 ditandai', () => {
    const hilang = validasiSurat('keterangan-aktif', { ...inputAktif({ keperluan: '  ' }), nomorUrut: 0 }, siswa, '', [], sekolah);
    assert.ok(hilang.includes('Keperluan'));
    assert.ok(hilang.includes('Nomor urut surat'));
  });
  test('nama Kepala Sekolah kosong ditandai (tidak dikarang)', () => {
    const hilang = validasiSurat('keterangan-aktif', inputAktif(), siswa, '', [], buatSekolah({ kepalaSekolah: '' }));
    assert.ok(hilang.includes('Nama Kepala Sekolah (di Profil Sekolah)'));
  });
  test('tanpa siswa ditandai', () => {
    const hilang = validasiSurat('keterangan-aktif', inputAktif(), null, '', [], sekolah);
    assert.ok(hilang.includes('Siswa'));
  });
  test('daftar rombel: rombel kosong / tanpa siswa aktif ditandai; nomor boleh 0', () => {
    assert.ok(validasiSurat('daftar-rombel', { nomorUrut: 0, tanggalSurat: '2026-10-15', field: {} }, null, '', [], sekolah).includes('Rombel'));
    assert.ok(
      validasiSurat('daftar-rombel', { nomorUrut: 0, tanggalSurat: '2026-10-15', field: {} }, null, '7A', [], sekolah).some((h) =>
        h.startsWith('Daftar siswa rombel'),
      ),
    );
    assert.deepEqual(
      validasiSurat('daftar-rombel', { nomorUrut: 0, tanggalSurat: '2026-10-15', field: {} }, null, '7A', [siswa], sekolah),
      [],
    );
  });
});

describe('bangunDokumenSurat', () => {
  const sekolah = buatSekolah();
  test('keterangan aktif: memuat biodata, keperluan, nomor dari pola', () => {
    const dok = bangunDokumenSurat('keterangan-aktif', inputAktif(), buatSiswa(), '', [], sekolah);
    assert.equal(dok.nomor, '7/SK-AKTIF/X/2026');
    assert.equal(dok.perihal, 'Surat Keterangan Siswa Aktif');
    assert.ok(dok.tabel?.baris.some((r) => r[0] === 'Nama Lengkap' && r[1] === 'Andi Contoh Siswa'));
    assert.ok(dok.tabel?.baris.some((r) => r[0] === 'NISN' && r[1] === '0012345678'));
    assert.ok(dok.paragraf[0].includes('pengajuan beasiswa'));
    assert.ok(dok.paragraf[0].includes('2026/2027'));
    assert.equal(dok.penandatangan.nama, 'Drs. Contoh Kepala');
    assert.equal(dok.penandatangan.nip, '196001011985031001');
  });
  test('surat pindah: memuat tujuan, tanggal keluar Indonesia, alasan', () => {
    const dok = bangunDokumenSurat(
      'pindah-keluar',
      { nomorUrut: 3, tanggalSurat: '2026-10-15', field: { sekolahTujuan: 'SMPN 2 Contoh', tanggalKeluar: '2026-09-01', alasan: 'Pindah mengikuti orang tua' } },
      buatSiswa(),
      '',
      [],
      sekolah,
    );
    assert.equal(dok.nomor, '3/SK-PINDAH/X/2026'); // bulan dari TANGGAL SURAT (Oktober), bukan tanggal keluar
    assert.ok(dok.paragraf[0].includes('SMPN 2 Contoh'));
    assert.ok(dok.paragraf[0].includes('1 September 2026'));
    assert.ok(dok.paragraf[0].includes('Pindah mengikuti orang tua'));
  });
  test('surat panggilan: kepada + jadwal + keperluan', () => {
    const dok = bangunDokumenSurat(
      'panggilan-ortu',
      {
        nomorUrut: 5,
        tanggalSurat: '2026-10-15',
        field: { penerima: 'Orang Tua/Wali', keperluan: 'membahas perkembangan belajar', tanggalPertemuan: '2026-10-20', jamPertemuan: '09:00', tempat: 'Ruang Kepala Sekolah' },
      },
      buatSiswa(),
      '',
      [],
      sekolah,
    );
    assert.equal(dok.kepada[0], 'Yth. Orang Tua/Wali dari Andi Contoh Siswa');
    assert.ok(dok.tabel?.baris.some((r) => r[0] === 'Hari / Tanggal' && r[1] === '20 Oktober 2026'));
    assert.ok(dok.tabel?.baris.some((r) => r[0] === 'Pukul' && r[1] === '09:00 WIB'));
    assert.ok(dok.tabel?.baris.some((r) => r[0] === 'Tempat' && r[1] === 'Ruang Kepala Sekolah'));
  });
  test('nomor manual dipakai apa adanya (cetak ulang nomor tercatat)', () => {
    const dok = bangunDokumenSurat(
      'pindah-keluar',
      { nomorUrut: 99, nomorManual: '421/123/2026', tanggalSurat: '2026-10-15', field: { sekolahTujuan: 'SMPN 2 Contoh', tanggalKeluar: '2026-09-01', alasan: 'Pindah' } },
      buatSiswa(),
      '',
      [],
      sekolah,
    );
    assert.equal(dok.nomor, '421/123/2026');
  });
  test('daftar rombel: diurutkan nama, nomor kosong bila nomorUrut 0', () => {
    const daftar = [
      buatSiswa({ id: 'z', namaLengkap: 'Zainal Contoh', nisn: '0099999999' }),
      buatSiswa({ id: 'a', namaLengkap: 'Andi Contoh Siswa', nisn: '0012345678' }),
    ];
    const dok = bangunDokumenSurat('daftar-rombel', { nomorUrut: 0, tanggalSurat: '2026-10-15', field: {} }, null, '7A', daftar, sekolah);
    assert.equal(dok.nomor, '');
    assert.deepEqual(dok.tabel?.header, ['No', 'Nama Lengkap', 'NISN', 'NIPD', 'L/P', 'Tempat, Tanggal Lahir']);
    assert.equal(dok.tabel?.baris[0][1], 'Andi Contoh Siswa');
    assert.equal(dok.tabel?.baris[1][1], 'Zainal Contoh');
    assert.ok(dok.paragraf[0].includes('2 siswa'));
  });
  test('field wajib kosong → penanda [BELUM DIISI], bukan tebakan', () => {
    const dok = bangunDokumenSurat('keterangan-aktif', inputAktif({ keperluan: '' }), buatSiswa(), '', [], sekolah);
    assert.ok(dok.paragraf[0].includes('[BELUM DIISI]'));
  });
  test('data panjang & karakter Indonesia tidak terpotong', () => {
    const namaPanjang = 'Muhammad Andi Syaifuddin Al-Qadri Bin Contoh Panjang Sekali '.repeat(4).trim();
    const keperluanPanjang = 'pengajuan beasiswa prestasi dan bantuan biaya pendidikan bagi siswa kurang mampu '.repeat(12).trim();
    const dok = bangunDokumenSurat(
      'keterangan-aktif',
      inputAktif({ keperluan: keperluanPanjang }),
      buatSiswa({ namaLengkap: namaPanjang }),
      '',
      [],
      sekolah,
    );
    assert.equal(dok.tabel?.baris.find((r) => r[0] === 'Nama Lengkap')?.[1], namaPanjang);
    assert.ok(dok.paragraf[0].includes(keperluanPanjang));
    assert.ok(dok.paragraf[0].length >= keperluanPanjang.length);
  });
});

describe('audit ekspor dokumen (Issue #4 — perbaikan pencatatan)', () => {
  test('docx surat per siswa: judul template + ekstensi + nomor + jumlah 1', () => {
    const audit = auditEksporDokumen({ template: 'keterangan-aktif', format: 'docx', jumlah: 1, nomor: '421/100/X/2026', entitasId: 's-1' });
    assert.equal(audit.ringkasan, 'Dokumen "Surat Keterangan Siswa Aktif" diekspor (.docx)');
    assert.equal(audit.detail, 'nomor: 421/100/X/2026; jumlah: 1');
  });

  test('xlsx daftar rombel: jumlah siswa + nomor tercantum', () => {
    const audit = auditEksporDokumen({ template: 'daftar-rombel', format: 'xlsx', jumlah: 28, nomor: '421/101/X/2026', entitasId: 'rombel:7A' });
    assert.equal(audit.ringkasan, 'Dokumen "Daftar Siswa per Kelas / Rombel" diekspor (.xlsx)');
    assert.equal(audit.detail, 'nomor: 421/101/X/2026; jumlah: 28');
  });

  test('semua template memakai judul generik, bukan ID mentah', () => {
    for (const meta of DAFTAR_TEMPLATE_SURAT) {
      const audit = auditEksporDokumen({ template: meta.id, format: 'docx', jumlah: 1, nomor: 'N', entitasId: '' });
      assert.ok(audit.ringkasan.includes(`"${meta.judul}"`), meta.id);
    }
  });

  test('keluaran audit tidak memuat data pribadi apa pun', () => {
    // Helper tidak menerima nama/NISN sama sekali; kunci ini mengunci kontrak:
    // JSON keluaran tidak boleh mengandung field nama/nisn/nik/telepon.
    const audit = auditEksporDokumen({ template: 'panggilan-ortu', format: 'docx', jumlah: 1, nomor: '421/102/X/2026', entitasId: 's-9' });
    const json = JSON.stringify(audit);
    assert.ok(!/nama|nisn|nik|telepon|alamat/i.test(json));
    assert.ok(!json.includes('Budi') && !json.includes('0123456789'));
  });
});
