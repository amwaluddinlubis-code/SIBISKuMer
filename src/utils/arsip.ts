import { Siswa, TutupTahunAjaran, RingkasanTutupTahun, RosterArsip } from '../types';

/** Tahun ajaran berikut: "2026/2027" -> "2027/2028". */
export function tahunBerikutnya(tahun: string): string {
  const m = (tahun || '').trim().match(/^(\d{4})\/(\d{4})$/);
  if (!m) return '';
  return `${Number(m[1]) + 1}/${Number(m[2]) + 1}`;
}

export function isTahunTerkunci(tutup: TutupTahunAjaran[], tahunAjaran?: string): boolean {
  const t = (tahunAjaran || '').trim();
  if (!t) return false;
  return (tutup || []).some((x) => x.tahunAjaran === t);
}

/** Tingkat akhir tiap jenjang (yang diluluskan saat tutup tahun). */
export function tingkatAkhir(jenjang: 'SD' | 'SMP'): string {
  return jenjang === 'SD' ? '6' : '9';
}

/** Tebak tingkat aktif dari rombel (fallback riwayat terakhir). */
export function tingkatAktifSiswa(s: Siswa): string {
  const c = (s.rombelSaatIni || '').trim().charAt(0);
  if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(c)) return c;
  const allRaport = [...(s.nilaiRaport || []), ...(s.raportSemester || [])];
  const last = allRaport[allRaport.length - 1];
  if (last?.tingkat) return String(last.tingkat);
  const lastR = (s.riwayatSemester || [])[(s.riwayatSemester || []).length - 1];
  if (lastR?.tingkat) return String(lastR.tingkat);
  return String(s.diterimaDiTingkat || '');
}

/** Rombel target kenaikan: pertahankan huruf (7A -> 8A); lulus tanpa target. */
export function rombelTarget(rombelSaatIni: string, tingkatBaru: string): string {
  const suffix = (rombelSaatIni || '').trim().slice(1) || 'A';
  return `${tingkatBaru}${suffix}`;
}

/** Bangun potret roster + ringkasan SEBELUM promosi dijalankan. */
export function buildSnapshot(
  siswaList: Siswa[],
  hasilPromosi: { lulus: number; naik: number; tinggal: number }
): { ringkasan: RingkasanTutupTahun; roster: RosterArsip[] } {
  const roster: RosterArsip[] = (siswaList || []).map((s) => ({
    siswaId: s.id,
    namaLengkap: s.namaLengkap,
    nisn: s.nisn || '',
    tingkat: tingkatAktifSiswa(s),
    rombel: s.rombelSaatIni || '',
    status: s.statusSiswa || 'Aktif',
  }));
  const perTingkat: Record<string, number> = {};
  const perRombel: Record<string, number> = {};
  for (const r of roster) {
    if (r.tingkat) perTingkat[r.tingkat] = (perTingkat[r.tingkat] || 0) + 1;
    if (r.rombel) perRombel[r.rombel] = (perRombel[r.rombel] || 0) + 1;
  }
  const mutasi = roster.filter((r) =>
    ['Mutasi Keluar', 'Mengundurkan Diri', 'Meninggal Dunia'].includes(r.status)
  ).length;
  return {
    ringkasan: {
      totalSiswa: roster.length,
      perTingkat,
      perRombel,
      lulus: hasilPromosi.lulus,
      naik: hasilPromosi.naik,
      tinggal: hasilPromosi.tinggal,
      mutasi,
    },
    roster: roster.sort((a, b) =>
      a.rombel.localeCompare(b.rombel) || a.namaLengkap.localeCompare(b.namaLengkap)
    ),
  };
}
