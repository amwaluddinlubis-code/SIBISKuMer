/**
 * Rekap jumlah siswa per tingkat — agregasi dari rekap per rombel.
 *
 * Tingkat diturunkan dari nama rombel dengan konvensi yang sama seperti
 * `faseOfRombel`/`getTingkatAktifSiswa`: karakter pertama nama rombel
 * adalah angka tingkat ('1'..'9'), mis. "7 A" → tingkat '7'. Rombel yang
 * tidak diawali angka tingkat (termasuk 'Belum Ada') dikelompokkan ke
 * baris tanpa tingkat (tingkat = null) dan diletakkan paling akhir.
 */

export interface HitungRombel {
  L: number;
  P: number;
  /** Jenis kelamin belum diisi — TIDAK dihitung sebagai Perempuan. */
  X: number;
  total: number;
}

export interface BarisRekapTingkat extends HitungRombel {
  /** '1'..'9', atau null untuk rombel tanpa tingkat yang terbaca. */
  tingkat: string | null;
  /** Banyaknya rombel yang tergabung pada baris ini. */
  jumlahRombel: number;
}

const TINGKAT_VALID = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Tingkat dari nama rombel; null bila karakter pertama bukan angka 1-9. */
export function tingkatDariRombel(rombel: string): string | null {
  const t = (rombel || '').trim().charAt(0);
  return TINGKAT_VALID.includes(t) ? t : null;
}

/**
 * Gabungkan daftar [namaRombel, hitungan] menjadi baris per tingkat,
 * terurut tingkat menaik; baris tanpa tingkat (bila ada isinya) terakhir.
 */
export function rekapPerTingkat(
  rombelList: Array<readonly [string, HitungRombel]>,
): BarisRekapTingkat[] {
  const perTingkat = new Map<string | null, BarisRekapTingkat>();
  for (const [rombel, counts] of rombelList) {
    const tingkat = tingkatDariRombel(rombel);
    let baris = perTingkat.get(tingkat);
    if (!baris) {
      baris = { tingkat, jumlahRombel: 0, L: 0, P: 0, X: 0, total: 0 };
      perTingkat.set(tingkat, baris);
    }
    baris.jumlahRombel++;
    baris.L += counts.L;
    baris.P += counts.P;
    baris.X += counts.X;
    baris.total += counts.total;
  }
  return [...perTingkat.values()].sort((a, b) => {
    if (a.tingkat === null) return 1;
    if (b.tingkat === null) return -1;
    return Number(a.tingkat) - Number(b.tingkat);
  });
}
