// Label & aturan sesi tahun ajaran — modul murni, tanpa IO.
// Mengunci perbaikan konsistensi label sesi (audit 28 Okt 2026):
// label baku labelSesi(), prioritas sesi atas tahun aktif profil,
// cutoff dropdown ≤ sesi, guard tulis tepat pada sesi, dan netralitas
// siswa hasil impor (tanpa riwayat tahun = terlihat di semua sesi).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cekTulisTahun,
  labelSesi,
  opsiTahunMaksSesi,
  tahunSesiEfektif,
} from '../src/utils/sesi';
import {
  rekonsiliasiImpor,
  rencanaTerapkan,
  validasiSemuaBaris,
} from '../src/utils/imporSiswa';

test('labelSesi: format baku, penanda aktif hanya bila sesi beda dari database', () => {
  assert.equal(labelSesi('2026/2027', '2026/2027'), 'Sesi TA 2026/2027');
  assert.equal(
    labelSesi('2025/2026', '2026/2027'),
    'Sesi TA 2025/2026 (aktif: 2026/2027)'
  );
  assert.equal(labelSesi(null, '2026/2027'), 'TA 2026/2027');
  assert.equal(labelSesi(' 2026/2027 ', '2026/2027'), 'Sesi TA 2026/2027');
  assert.equal(labelSesi(null, null), '-');
});

test('tahunSesiEfektif: sesi login menang; sesi invalid jatuh ke tahun aktif profil', () => {
  assert.equal(tahunSesiEfektif('2025/2026', '2026/2027'), '2025/2026');
  assert.equal(tahunSesiEfektif(null, '2026/2027'), '2026/2027');
  assert.equal(tahunSesiEfektif('bukan-tahun', '2026/2027'), '2026/2027');
  assert.equal(tahunSesiEfektif(null, null), '');
});

test('opsiTahunMaksSesi: opsi di atas sesi dibuang; sesi invalid tidak menyaring', () => {
  assert.deepEqual(
    opsiTahunMaksSesi(['2027/2028', '2026/2027', '2025/2026'], '2026/2027'),
    ['2026/2027', '2025/2026']
  );
  assert.deepEqual(
    opsiTahunMaksSesi(['2027/2028', '2026/2027'], null),
    ['2027/2028', '2026/2027']
  );
});

test('cekTulisTahun: tulis hanya tepat pada sesi; luar sesi & tahun terkunci ditolak', () => {
  assert.equal(cekTulisTahun(null, '2026/2027', [], '2026/2027'), null);
  const luar = cekTulisTahun(null, '2025/2026', [], '2026/2027');
  assert.match(luar || '', /Di luar sesi aktif/);
  const kunci = cekTulisTahun(null, '2025/2026', ['2025/2026'], '2025/2026');
  assert.match(kunci || '', /terkunci arsip/);
  assert.match(cekTulisTahun(null, '', [], '2026/2027') || '', /wajib diisi/);
});

test('rencanaTerapkan: siswa baru impor netral tahun (tanpa riwayat) apa pun ctx.tahunAjaran', () => {
  const bangun = (ctxTahun: string) => {
    const tervalidasi = validasiSemuaBaris([
      { namaLengkap: 'Andi Baru', nisn: '0091234568', rombelSaatIni: '7A' },
    ]);
    const rekons = rekonsiliasiImpor(tervalidasi, [], () => true);
    rekons[0].keputusan = 'tambah';
    const { tambah } = rencanaTerapkan(rekons, [], {
      jenjang: 'SMP',
      tahunAjaran: ctxTahun,
      sekarangIso: '2026-10-28T00:00:00.000Z',
    });
    return tambah;
  };
  for (const ctxTahun of ['2026/2027', '2025/2026']) {
    const tambah = bangun(ctxTahun);
    assert.equal(tambah.length, 1);
    // Netral: tanpa riwayat tahun sehingga terlihat di semua sesi (sesi.ts).
    assert.deepEqual(tambah[0].riwayatSemester, []);
    assert.equal(tambah[0].riwayatTahunAjaran, undefined);
  }
});
