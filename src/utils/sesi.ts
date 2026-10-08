// ---------------- FONDASI SESI: user | sekolah | tahun ajaran ----------------
// Badge "Sesi" di topbar adalah sesi data aktif. Seluruh halaman WAJIB memakai
// helper di berkas ini agar baca & tulis data selalu terikat pada tiga sumbu:
//
//   user     → hak rombel (rombelAkses) + hak tahun (tahunAkses)
//   sekolah  → database aktif (isolasi per dbName) + tahun aktif profil
//   tahun    → sessionTahun hasil login per-TA (default filter & guard tulis)
//
// Aturan:
// - Entitas berdimensi tahun (raport, riwayat, peta kelas, arsip, rombel ref)
//   difilter/ditulis pada tahun sesi efektif.
// - Tulis ke tahun di luar hak user atau tahun terkunci arsip DITOLAK.
// - Roster siswa adalah lingkup SEKOLAH (bukan tahun); kepatuhannya lewat
//   hak rombel + indikator sesi + filter keterlibatan tahun (opsional).

import { AppUser, Siswa } from '../types';
import { canUserAccessTahun, isValidTahun, normalizeTahun } from './tahunAjaran';
import { getRaportList } from './raportUtils';

/** Tahun sesi efektif: sesi login menang atas tahun aktif profil. */
export function tahunSesiEfektif(
  sessionTahun: string | null | undefined,
  tahunAktif: string | null | undefined
): string {
  const sesi = normalizeTahun(sessionTahun);
  if (sesi && isValidTahun(sesi)) return sesi;
  const aktif = normalizeTahun(tahunAktif);
  if (aktif && isValidTahun(aktif)) return aktif;
  return '';
}

/**
 * Guard tunggal untuk SEMUA operasi tulis berdimensi tahun.
 * Mengembalikan pesan error (string) bila ditolak, atau null bila boleh.
 * Administrator lolos cek tahunAkses tetapi tetap terikat kunci arsip.
 * Bila sesiEfektif diisi: tulis HANYA boleh tepat pada tahun sesi
 * (input di luar sesi aktif ditolak — pindah sesi dulu untuk koreksi).
 */
export function cekTulisTahun(
  user: AppUser | null | undefined,
  tahun: string | null | undefined,
  tahunTerkunci?: string[] | null,
  sesiEfektif?: string | null
): string | null {
  const t = normalizeTahun(tahun);
  if (!t) return 'Tahun ajaran wajib diisi (format TAHUN/TAHUN).';
  if (!isValidTahun(t)) return `Format tahun "${t}" tidak valid (cth. 2026/2027).`;
  if ((tahunTerkunci || []).map(normalizeTahun).includes(t)) {
    return `Tahun ${t} terkunci arsip. Buka kuncinya di Arsip bila memang perlu dikoreksi.`;
  }
  const sesi = normalizeTahun(sesiEfektif);
  if (sesi && isValidTahun(sesi) && t !== sesi) {
    return `Di luar sesi aktif (TA ${sesi}). Pindah sesi ke ${t} untuk input tahun tersebut.`;
  }
  if (!canUserAccessTahun(user, t)) {
    return `Akses ditolak: akun @${user?.username || '?'} tidak memiliki akses ke tahun ${t}.`;
  }
  return null;
}

/** True bila tahun (format TAHUN/TAHUN) berada di atas sesi efektif. */
export function diAtasSesi(tahun: unknown, sesiEfektif: unknown): boolean {
  const t = normalizeTahun(tahun);
  const s = normalizeTahun(sesiEfektif);
  if (!t || !isValidTahun(t) || !s || !isValidTahun(s)) return false;
  return t > s;
}

/** Saring daftar berdimensi tahun ke ≤ sesi (tanpa tahun = lolos/netral). */
export function tahanMaksSesi<T>(daftar: T[] | null | undefined, ambilTahun: (r: T) => unknown, sesiEfektif: unknown): T[] {
  const s = normalizeTahun(sesiEfektif);
  if (!s || !isValidTahun(s)) return daftar || [];
  return (daftar || []).filter((r) => !diAtasSesi(ambilTahun(r), s));
}

/** Saring opsi tahun dropdown ke ≤ sesi (tidak dikenal = ikut). */
export function opsiTahunMaksSesi(daftar: string[] | null | undefined, sesiEfektif: unknown): string[] {
  const s = normalizeTahun(sesiEfektif);
  if (!s || !isValidTahun(s)) return daftar || [];
  return (daftar || []).filter((t) => {
    const n = normalizeTahun(t);
    return !isValidTahun(n) || n <= s;
  });
}

/**
 * Apakah siswa boleh tampil pada sesi: punya ≥1 catatan tahun ≤ sesi,
 * atau tanpa catatan tahun sama sekali (netral — mis. impor lama).
 */
export function siswaTerlihatSesi(s: Siswa, sesiEfektif: unknown): boolean {
  const daftar = tahunSiswa(s);
  if (daftar.length === 0) return true;
  const sesi = normalizeTahun(sesiEfektif);
  if (!sesi || !isValidTahun(sesi)) return true;
  return daftar.some((t) => t <= sesi);
}
/** Seluruh tahun ajaran yang tercatat pada seorang siswa (sort desc). */
export function tahunSiswa(s: Siswa): string[] {
  const set = new Set<string>();
  const add = (v: unknown) => {
    const t = normalizeTahun(v);
    if (t && isValidTahun(t)) set.add(t);
  };
  for (const r of s.riwayatSemester || []) add((r as { tahunAjaran?: string }).tahunAjaran);
  for (const r of getRaportList(s)) add((r as { tahunAjaran?: string }).tahunAjaran);
  for (const r of s.riwayatTahunAjaran || []) add((r as { tahunAjaran?: string }).tahunAjaran);
  return [...set].sort().reverse();
}

/**
 * Apakah siswa terlibat pada tahun tertentu (ada riwayat/raport tahun itu).
 * Siswa tanpa catatan tahun sama sekali dianggap netral (ikut roster aktif)
 * agar tidak hilang dari filter — roster adalah lingkup sekolah.
 */
export function siswaTerlibatTahun(s: Siswa, tahun: string | null | undefined): boolean {
  const t = normalizeTahun(tahun);
  if (!t) return true;
  const daftar = tahunSiswa(s);
  if (daftar.length === 0) return true;
  return daftar.includes(t);
}

/** Filter daftar siswa ke kohort satu tahun sesi (netral untuk tanpa-catatan). */
export function filterSiswaSesi(siswa: Siswa[], tahun: string | null | undefined): Siswa[] {
  const t = normalizeTahun(tahun);
  if (!t) return siswa || [];
  return (siswa || []).filter((s) => siswaTerlibatTahun(s, t));
}

/**
 * Rombel siswa pada tahun tertentu: dari riwayat tahun bila ada,
 * sonst rombel berjalan bila tahun = tahun aktif, sonst '-'.
 */
export function rombelPadaTahun(
  s: Siswa,
  tahun: string | null | undefined,
  tahunAktif: string | null | undefined
): string {
  const t = normalizeTahun(tahun);
  if (!t) return s.rombelSaatIni || '-';
  const riw = (s.riwayatTahunAjaran || []).find((r) => normalizeTahun(r.tahunAjaran) === t);
  if (riw?.rombel) return riw.rombel;
  const rap = getRaportList(s).find((r) => normalizeTahun(r.tahunAjaran) === t);
  if (rap?.rombel) return rap.rombel;
  if (t === normalizeTahun(tahunAktif)) return s.rombelSaatIni || '-';
  return '-';
}

/** Label sesi untuk kop/cetak: "Sesi TA x" + penanda bila beda dari aktif. */
export function labelSesi(
  sessionTahun: string | null | undefined,
  tahunAktif: string | null | undefined
): string {
  const sesi = normalizeTahun(sessionTahun);
  const aktif = normalizeTahun(tahunAktif);
  if (sesi && aktif && sesi !== aktif) return `Sesi TA ${sesi} (aktif: ${aktif})`;
  if (sesi) return `Sesi TA ${sesi}`;
  if (aktif) return `TA ${aktif}`;
  return '-';
}
