// Asisten AI (Issue #13) — modul murni: redaksi, agregat, penjelasan, draf, validasi.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  redaksiTeks,
  mengandungIdentitas,
  payloadMengandungIdentitas,
  ringkasanAgregat,
  susunNarasiRingkasan,
  jelaskanAturan,
  susunDrafSurat,
  validasiKeluaran,
  PLACEHOLDER_NOMOR_SURAT,
} from '../src/utils/asistenAi';
import type { TemuanPemeriksa } from '../src/utils/pemeriksaData';

function temuan(
  aturanId: string,
  siswaId: string,
  kategori: TemuanPemeriksa['kategori'],
  prioritas: TemuanPemeriksa['prioritas'],
  judul: string
): TemuanPemeriksa {
  return {
    id: `${aturanId}:${siswaId}`,
    aturanId,
    kategori,
    prioritas,
    judul,
    alasan: 'alasan contoh',
    sumber: 'data-lokal',
    siswaId,
  };
}

test('redaksi: NIK, NISN, telepon, email disensor; teks biasa utuh', () => {
  assert.equal(
    redaksiTeks('NIK 1234567890123456 dan NISN 0123456789 hubungi 081234567890 atau a@b.co'),
    'NIK [NIK] dan NISN [NISN] hubungi [TELEPON] atau [EMAIL]'
  );
  assert.equal(redaksiTeks('SMP Negeri 1 Panyabungan'), 'SMP Negeri 1 Panyabungan');
  assert.equal(mengandungIdentitas('ada 1234567890123456 di sini'), true);
  assert.equal(mengandungIdentitas('tidak ada identitas'), false);
  assert.equal(payloadMengandungIdentitas({ keperluan: 'beasiswa' }), false);
  assert.equal(payloadMengandungIdentitas({ nisn: '0123456789' }), true);
  assert.equal(payloadMengandungIdentitas({ NISN: '0123456789' }), true);
  assert.equal(payloadMengandungIdentitas({ nama: 'Budi' }), true);
});

test('ringkasan agregat: hitungan benar, tanpa identitas di keluaran', () => {
  const daftar = [
    temuan('nama-kosong', 's-1', 'wajib', 'tinggi', 'Nama lengkap kosong'),
    temuan('nisn-kosong', 's-1', 'wajib', 'tinggi', 'NISN kosong'),
    temuan('nisn-format', 's-2', 'format', 'tinggi', 'NISN bukan 10 digit angka'),
  ];
  const ring = ringkasanAgregat(daftar);
  assert.equal(ring.totalTemuan, 3);
  assert.equal(ring.totalSiswaTerdampak, 2);
  assert.equal(ring.perKategori['wajib'], 2);
  assert.equal(ring.perKategori['format'], 1);
  assert.equal(ring.perPrioritas['tinggi'], 3);
  assert.equal(ring.aturanTeratas[0].aturanId, 'nama-kosong');
  assert.ok(ring.saran.length > 0);
  const json = JSON.stringify(ring);
  assert.ok(!json.includes('s-1') && !json.includes('s-2'), 'tidak ada ID siswa di ringkasan');
  const narasi = susunNarasiRingkasan(ring);
  assert.ok(narasi.includes('3 temuan pada 2 siswa'));
  assert.ok(narasi.includes('tidak memuat nama atau identitas siswa'));
  assert.equal(susunNarasiRingkasan(ringkasanAgregat([])).includes('tidak ditemukan temuan'), true);
});

test('jelaskan aturan: dikenal → penjelasan + langkah; tak dikenal → null', () => {
  const jelas = jelaskanAturan('nama-kosong');
  assert.ok(jelas);
  assert.equal(jelas.aturanId, 'nama-kosong');
  assert.ok(jelas.penjelasan.length > 0);
  assert.ok(jelas.langkah.length > 0);
  assert.equal(jelaskanAturan('aturan-tidak-ada'), null);
});

test('draf surat: nomor tidak pernah dikarang; field wajib divalidasi', () => {
  const draf = susunDrafSurat(
    'keterangan-aktif',
    { keperluan: 'pengajuan beasiswa' },
    'SMP Negeri 1',
    '2026-10-26'
  );
  assert.ok(draf.includes('Surat Keterangan Siswa Aktif'));
  assert.ok(draf.includes('pengajuan beasiswa'));
  assert.ok(draf.includes(PLACEHOLDER_NOMOR_SURAT));
  const bernomor = susunDrafSurat(
    'keterangan-aktif',
    { keperluan: 'pengajuan beasiswa', nomorSurat: '421/100/X/2026' },
    'SMP Negeri 1',
    '2026-10-26'
  );
  assert.ok(bernomor.includes('421/100/X/2026'));
  assert.ok(!bernomor.includes(PLACEHOLDER_NOMOR_SURAT));
  assert.throws(() => susunDrafSurat('keterangan-aktif', {}, 'SMP Negeri 1', '2026-10-26'), /Field wajib/);
  assert.throws(() => susunDrafSurat('template-tidak-ada', {}, 'SMP Negeri 1', '2026-10-26'), /tidak dikenal/);
});

test('validasi keluaran: kosong dan berlebih ditolak', () => {
  assert.equal(validasiKeluaran('').ok, false);
  assert.equal(validasiKeluaran('   ').ok, false);
  assert.equal(validasiKeluaran('x'.repeat(8001)).ok, false);
  assert.equal(validasiKeluaran('halo').ok, true);
  assert.equal(validasiKeluaran(123).ok, false);
});
