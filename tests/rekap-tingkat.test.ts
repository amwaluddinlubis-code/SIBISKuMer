/**
 * Tes rekap jumlah siswa per tingkat (src/utils/rekapTingkat.ts).
 * Agregasi dari rekap per rombel milik RekapitulasiView: L/P/X tidak boleh
 * tercampur, rombel se-tingkat tergabung, urutan tingkat menaik, dan
 * rombel tanpa tingkat terbaca ('Belum Ada') selalu paling akhir.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { rekapPerTingkat, tingkatDariRombel, type HitungRombel } from '../src/utils/rekapTingkat';

const h = (L: number, P: number, X = 0): HitungRombel => ({ L, P, X, total: L + P + X });

describe('tingkatDariRombel', () => {
  test('karakter pertama angka 1-9 menjadi tingkat', () => {
    assert.equal(tingkatDariRombel('7 A'), '7');
    assert.equal(tingkatDariRombel('9'), '9');
    assert.equal(tingkatDariRombel('  3 B'), '3');
  });

  test('selain itu null', () => {
    assert.equal(tingkatDariRombel('Belum Ada'), null);
    assert.equal(tingkatDariRombel('VII A'), null);
    assert.equal(tingkatDariRombel(''), null);
  });
});

describe('rekapPerTingkat', () => {
  test('rombel se-tingkat tergabung; L/P/X dan jumlah rombel benar', () => {
    const hasil = rekapPerTingkat([
      ['7 A', h(10, 12)],
      ['7 B', h(11, 9, 1)],
      ['8 A', h(14, 13)],
      ['9 A', h(8, 16)],
    ]);
    assert.deepEqual(hasil, [
      { tingkat: '7', jumlahRombel: 2, L: 21, P: 21, X: 1, total: 43 },
      { tingkat: '8', jumlahRombel: 1, L: 14, P: 13, X: 0, total: 27 },
      { tingkat: '9', jumlahRombel: 1, L: 8, P: 16, X: 0, total: 24 },
    ]);
  });

  test('terurut menaik walau masukan acak; tanpa tingkat paling akhir', () => {
    const hasil = rekapPerTingkat([
      ['9 A', h(1, 1)],
      ['Belum Ada', h(2, 0)],
      ['7 A', h(3, 3)],
    ]);
    assert.deepEqual(
      hasil.map((b) => b.tingkat),
      ['7', '9', null],
    );
    assert.equal(hasil[2].total, 2);
  });

  test('daftar kosong menghasilkan daftar kosong', () => {
    assert.deepEqual(rekapPerTingkat([]), []);
  });

  test('total keseluruhan sama dengan jumlah semua rombel', () => {
    const masukan: Array<[string, HitungRombel]> = [
      ['1 A', h(15, 14)],
      ['2 A', h(13, 15, 2)],
      ['Belum Ada', h(1, 1)],
    ];
    const hasil = rekapPerTingkat(masukan);
    assert.equal(
      hasil.reduce((a, b) => a + b.total, 0),
      masukan.reduce((a, [, c]) => a + c.total, 0),
    );
  });
});
