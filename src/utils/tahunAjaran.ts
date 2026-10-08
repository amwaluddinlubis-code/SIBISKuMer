import { AppUser, Siswa, SekolahProfile, TutupTahunAjaran, PetaKelas } from '../types';

export const TAHUN_REGEX = /^\d{4}\/\d{4}$/;

export function normalizeTahun(v: unknown): string {
  return String(v ?? '').trim();
}

export function isValidTahun(v: unknown): boolean {
  return TAHUN_REGEX.test(normalizeTahun(v));
}

/** Daftar tahun ajaran gabungan dari profil + arsip + peta + riwayat siswa. Sort desc. */
export function getDaftarTahunAjaran(args: {
  sekolah?: Pick<SekolahProfile, 'tahunAjaran'> | null;
  tutup?: Pick<TutupTahunAjaran, 'tahunAjaran'>[] | null;
  peta?: Pick<PetaKelas, 'tahunAjaran'>[] | null;
  siswa?: Pick<Siswa, 'riwayatSemester' | 'nilaiRaport' | 'raportSemester' | 'riwayatTahunAjaran'>[] | null;
  fallback?: string[];
}): string[] {
  const set = new Set<string>();
  const add = (v: unknown) => {
    const t = normalizeTahun(v);
    if (t && isValidTahun(t)) set.add(t);
  };
  if (args.sekolah?.tahunAjaran) add(args.sekolah.tahunAjaran);
  for (const t of args.tutup || []) add(t.tahunAjaran);
  for (const p of args.peta || []) add(p.tahunAjaran);
  for (const s of args.siswa || []) {
    for (const r of s.riwayatSemester || []) add((r as { tahunAjaran?: string }).tahunAjaran);
    for (const r of (s.nilaiRaport || []) as { tahunAjaran?: string }[]) add(r.tahunAjaran);
    for (const r of ((s as Siswa).raportSemester || []) as { tahunAjaran?: string }[]) add(r.tahunAjaran);
    for (const r of (s.riwayatTahunAjaran || []) as { tahunAjaran?: string }[]) add(r.tahunAjaran);
  }
  for (const f of args.fallback || []) add(f);
  // Database kosong: kembalikan apa adanya (bisa kosong) agar pilihan TA
  // tidak memunculkan tahun lama yang tidak ada datanya. Profil sekolah
  // struktural selalu membawa tahun aktif (2026/2027) sebagai satu-satunya opsi.
  return [...set].sort().reverse();
}

/** Administrator = semua tahun. Operator kosong/undefined = semua tahun. */
export function getTahunDiizinkan(user: AppUser | null | undefined, daftar: string[]): string[] {
  if (!user || user.role === 'administrator') return [...daftar];
  const akses = (user.tahunAkses || []).map(normalizeTahun).filter(isValidTahun);
  if (akses.length === 0) return [...daftar];
  const allowed = new Set(akses);
  return daftar.filter((t) => allowed.has(t));
}

export function canUserAccessTahun(
  user: AppUser | null | undefined,
  tahun?: string | null
): boolean {
  if (!tahun || !normalizeTahun(tahun)) return true;
  const t = normalizeTahun(tahun);
  if (!user || user.role === 'administrator') return true;
  const akses = (user.tahunAkses || []).map(normalizeTahun).filter(isValidTahun);
  if (akses.length === 0) return true;
  return akses.includes(t);
}

/** Normalisasi tahunAkses sebelum simpan: trim, valid, unik, sort desc. */
export function normalizeTahunAkses(list?: string[] | null): string[] {
  const set = new Set<string>();
  for (const v of list || []) {
    const t = normalizeTahun(v);
    if (t && isValidTahun(t)) set.add(t);
  }
  return [...set].sort().reverse();
}

/** Tahun ajaran sekolah dari tanggal ISO (YYYY-MM-DD): Juli–Juni.
 *  Cth. 2026-08-01 → "2026/2027"; 2026-03-01 → "2025/2026". '' bila invalid. */
export function tahunAjaranDariTanggal(iso: unknown): string {
  const m = /^(\d{4})-(\d{2})-\d{2}/.exec(String(iso || '').trim());
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12) return '';
  return mo >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}
