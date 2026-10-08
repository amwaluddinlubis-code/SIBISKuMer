import { Siswa, SekolahProfile, DapodikConfig, AppUser, RaportSemester } from '../types';

/** Hasil validasi satu field identitas. */
export interface FieldIssue {
  field: 'namaLengkap' | 'nisn' | 'nik' | 'nipd' | 'noKk';
  message: string;
}

const ONLY_DIGITS = /^[0-9]+$/;

export function isValidNISN(nisn: string): boolean {
  const v = (nisn || '').trim();
  return v.length === 10 && ONLY_DIGITS.test(v);
}

export function isValidNIK(nik: string): boolean {
  const v = (nik || '').trim();
  // NIK 16 digit; izinkan kosong (belum punya) tapi kalau diisi harus valid
  if (!v) return true;
  return v.length === 16 && ONLY_DIGITS.test(v);
}

export function isValidNIPD(nipd: string): boolean {
  const v = (nipd || '').trim();
  if (!v) return true;
  return v.length >= 3 && v.length <= 20;
}

export function isValidNoKk(noKk: string): boolean {
  const v = (noKk || '').trim();
  if (!v) return true;
  return v.length === 16 && ONLY_DIGITS.test(v);
}

function findDuplicate(
  list: Siswa[],
  field: 'nisn' | 'nik' | 'nipd',
  value: string,
  excludeId?: string
): Siswa | undefined {
  const v = (value || '').trim();
  if (!v) return undefined;
  return (list || []).find((s) => {
    if (excludeId && s.id === excludeId) return false;
    const sv = ((s as unknown as Record<string, string>)[field] || '').trim();
    return sv !== '' && sv === v;
  });
}

/**
 * Validasi identitas unik + format.
 * Dipakai SiswaFormModal sebelum onSave, dan bisa dipakai ulang saat impor/sinkron.
 */
export function validateIdentitasSiswa(
  data: Pick<Siswa, 'id' | 'namaLengkap' | 'nisn' | 'nik' | 'nipd' | 'noKk'>,
  existing: Siswa[] = []
): FieldIssue[] {
  const issues: FieldIssue[] = [];

  if (!data.namaLengkap || !data.namaLengkap.trim()) {
    issues.push({ field: 'namaLengkap', message: 'Nama lengkap siswa wajib diisi.' });
  }

  if (!data.nisn || !data.nisn.trim()) {
    issues.push({ field: 'nisn', message: 'NISN siswa wajib diisi (10 digit angka).' });
  } else if (!isValidNISN(data.nisn)) {
    issues.push({ field: 'nisn', message: 'NISN harus tepat 10 digit angka (contoh: 0091234567).' });
  } else {
    const dup = findDuplicate(existing, 'nisn', data.nisn, data.id);
    if (dup) {
      issues.push({ field: 'nisn', message: `NISN sudah dipakai oleh "${dup.namaLengkap}".` });
    }
  }

  if (data.nik && data.nik.trim() && !isValidNIK(data.nik)) {
    issues.push({ field: 'nik', message: 'NIK harus 16 digit angka bila diisi.' });
  } else if (data.nik && data.nik.trim()) {
    const dup = findDuplicate(existing, 'nik', data.nik, data.id);
    if (dup) {
      issues.push({ field: 'nik', message: `NIK sudah dipakai oleh "${dup.namaLengkap}".` });
    }
  }

  if (data.nipd && data.nipd.trim() && !isValidNIPD(data.nipd)) {
    issues.push({ field: 'nipd', message: 'NIPD 3–20 karakter bila diisi.' });
  } else if (data.nipd && data.nipd.trim()) {
    const dup = findDuplicate(existing, 'nipd', data.nipd, data.id);
    if (dup) {
      issues.push({ field: 'nipd', message: `NIPD sudah dipakai oleh "${dup.namaLengkap}".` });
    }
  }

  if (data.noKk && data.noKk.trim() && !isValidNoKk(data.noKk)) {
    issues.push({ field: 'noKk', message: 'No. KK harus 16 digit angka bila diisi.' });
  }

  return issues;
}

// ---------------- Validasi form umum (wajib / format) ----------------
// Setiap fungsi mengembalikan daftar pesan ringkas; kosong = valid.
// Dipakai semua form sebelum simpan, selalu dipasangkan dengan toast error
// (pesan pertama) + penanda inline di field.

/** Cek satu nilai wajib. */
export function wajib(value: unknown, label: string): string | null {
  const s = typeof value === 'string' ? value.trim() : value;
  if (s === undefined || s === null || s === '') return `${label} wajib diisi.`;
  return null;
}

export function validateSekolahProfile(p: SekolahProfile): string[] {
  const errs: string[] = [];
  const push = (m: string | null) => {
    if (m) errs.push(m);
  };
  push(wajib(p.nama, 'Nama sekolah'));
  push(wajib(p.npsn, 'NPSN'));
  if (p.npsn && !/^[0-9]{8}$/.test(p.npsn.trim())) errs.push('NPSN harus 8 digit angka.');
  push(wajib(p.jenjang, 'Jenjang sekolah'));
  push(wajib(p.tahunAjaran, 'Tahun ajaran'));
  if (p.tahunAjaran && !/^\d{4}\/\d{4}$/.test(p.tahunAjaran.trim()))
    errs.push('Tahun ajaran harus berformat TAHUN/TAHUN (cth. 2026/2027).');
  push(wajib(p.semesterAktif, 'Semester aktif'));
  push(wajib(p.kepalaSekolah, 'Nama kepala sekolah'));
  if (p.email && p.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim()))
    errs.push('Email sekolah tidak valid.');
  return errs;
}

export function validateDapodikConfig(cfg: Pick<DapodikConfig, 'ip' | 'port' | 'npsn' | 'token'>): string[] {
  const errs: string[] = [];
  const push = (m: string | null) => {
    if (m) errs.push(m);
  };
  push(wajib(cfg.ip, 'Host Dapodik'));
  if (cfg.port === undefined || cfg.port === null || Number(cfg.port) <= 0)
    errs.push('Port Dapodik wajib diisi (cth. 5774).');
  push(wajib(cfg.npsn, 'NPSN'));
  push(wajib(cfg.token, 'Token Web Service'));
  return errs;
}

export function validateAppUserInput(
  data: { username?: string; namaLengkap?: string; password?: string; role?: string },
  existingUsernames: string[] = [],
  opts?: { isEdit?: boolean; excludeUsername?: string }
): string[] {
  const errs: string[] = [];
  const push = (m: string | null) => {
    if (m) errs.push(m);
  };
  push(wajib(data.username, 'Username'));
  if (data.username && !/^[a-z0-9._-]{3,30}$/i.test(data.username.trim()))
    errs.push('Username 3–30 karakter (huruf, angka, titik, strip, underscore).');
  push(wajib(data.namaLengkap, 'Nama lengkap'));
  push(wajib(data.role, 'Peran pengguna'));
  if (data.role && !['administrator', 'operator'].includes(data.role))
    errs.push('Peran pengguna tidak dikenal.');
  const dup = (existingUsernames || []).some(
    (u) => u.toLowerCase() === (data.username || '').trim().toLowerCase() &&
      u.toLowerCase() !== (opts?.excludeUsername || '').toLowerCase()
  );
  if (dup) errs.push(`Username "${data.username}" sudah digunakan.`);
  // Password wajib untuk akun baru; opsional saat ubah (kosong = tidak diganti).
  if (!opts?.isEdit) {
    push(wajib(data.password, 'Kata sandi'));
    if (data.password && data.password.trim().length < 6)
      errs.push('Kata sandi minimal 6 karakter.');
  } else if (data.password && data.password.trim() && data.password.trim().length < 6) {
    errs.push('Kata sandi baru minimal 6 karakter.');
  }
  return errs;
}

export function validateGtkInput(data: { nama?: string; nip?: string; nik?: string; nuptk?: string }): string[] {
  const errs: string[] = [];
  const push = (m: string | null) => {
    if (m) errs.push(m);
  };
  push(wajib(data.nama, 'Nama GTK'));
  if (data.nik && data.nik.trim() && !isValidNIK(data.nik))
    errs.push('NIK GTK harus 16 digit angka bila diisi.');
  if (data.nip && data.nip.trim() && data.nip.trim().length < 9)
    errs.push('NIP minimal 9 karakter bila diisi.');
  if (data.nuptk && data.nuptk.trim() && data.nuptk.trim().length < 8)
    errs.push('NUPTK minimal 8 karakter bila diisi.');
  return errs;
}

export function validateRaportForm(r: {
  tahunAjaran?: string;
  semester?: string;
  tingkat?: string;
  rombel?: string;
  nilaiMapel?: { mataPelajaran?: string; nilaiAkhir?: number }[];
}): string[] {
  const errs: string[] = [];
  const push = (m: string | null) => {
    if (m) errs.push(m);
  };
  push(wajib(r.tahunAjaran, 'Tahun ajaran raport'));
  if (r.tahunAjaran && !/^\d{4}\/\d{4}$/.test(r.tahunAjaran.trim()))
    errs.push('Tahun ajaran raport harus berformat TAHUN/TAHUN (cth. 2026/2027).');
  push(wajib(r.semester, 'Semester raport'));
  if (r.semester && !['1', '2'].includes(r.semester)) errs.push('Semester raport harus 1 atau 2.');
  push(wajib(r.tingkat, 'Tingkat kelas'));
  push(wajib(r.rombel, 'Rombel raport'));
  if (!r.nilaiMapel || r.nilaiMapel.length === 0) {
    errs.push('Minimal satu mata pelajaran wajib ada pada raport.');
  } else {
    r.nilaiMapel.forEach((m, i) => {
      if (!m.mataPelajaran || !m.mataPelajaran.trim())
        errs.push(`Nama mapel baris ${i + 1} wajib diisi.`);
      const n = Number(m.nilaiAkhir);
      if (!Number.isFinite(n) || n < 0 || n > 100)
        errs.push(`Nilai "${m.mataPelajaran || `baris ${i + 1}`}" harus 0–100.`);
    });
  }
  return errs;
}

export function validateSchoolEntryInput(
  data: { nama?: string; npsn?: string },
  existingNpsns: string[] = []
): string[] {
  const errs: string[] = [];
  const push = (m: string | null) => {
    if (m) errs.push(m);
  };
  push(wajib(data.nama, 'Nama sekolah'));
  if (data.npsn && data.npsn.trim()) {
    if (!/^[0-9]{1,12}$/.test(data.npsn.trim())) errs.push('NPSN hanya boleh angka.');
    else if (existingNpsns.some((n) => n.trim() === data.npsn!.trim()))
      errs.push(`NPSN ${data.npsn.trim()} sudah dipakai sekolah lain.`);
  }
  return errs;
}
