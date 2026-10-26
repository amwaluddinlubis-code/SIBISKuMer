// ---------------- MATRIKS HAK AKSES BERBASIS PERAN (Issue #12) ----------------
// Satu-satunya sumber kebenaran matriks izin di klien. Server (server/api.ts)
// mencerminkan matriks ini lewat gate perluAdmin/perluTulis dan gate
// per-entitas koleksi — server adalah batas enforcement di mode server;
// guard handler di App/views adalah pertahanan lapis kedua di mode lokal
// (di perangkat sendiri, IndexedDB memang tidak bisa dibentengi dari
// pemilik perangkat; yang dibentengi adalah akun lain via server).
//
// Keputusan arsitektur (didokumentasikan sesuai permintaan issue):
// - SATU peran per akun. Dimensi pembatas tambahan adalah rombelAkses dan
//   tahunAkses, bukan peran ganda. Orang dengan dua topi memakai akun
//   berperingkat lebih tinggi, atau dua akun (mis. operator + pimpinan).
//   Alasannya: sesi server menyimpan satu `peran`, seluruh gate memeriksa
//   satu peran, dan peran ganda akan memaksa migrasi users + sesi + semua
//   gate tanpa manfaat nyata — rombelAkses/tahunAkses sudah menutup
//   kebutuhan pembatasan yang ditemui di sekolah.
// - `pimpinan` HANYA membaca: tidak ada tambah/ubah/hapus/kelola di sumber
//   mana pun. `ekspor` (unduh/cetak laporan & daftar) diizinkan karena
//   ekspor tidak mengubah data tersimpan.
// - `wali_kelas` = operator yang DIBATASI rombelAkses. Beda krusial dari
//   operator: rombelAkses kosong berarti TIDAK ADA akses (least privilege),
//   sedangkan operator dengan rombelAkses kosong berarti semua rombel
//   (perilaku lama dipertahankan).
// - `audit` tidak punya aksi pengguna: penulisan log audit adalah jalur
//   sistem (transport), bukan izin pengguna. Pembacaan log audit hanya
//   administrator. Lihat gate koleksi audit_logs di server/api.ts.
import type { AppUser, UserRole } from '../types';

export type AksiAkses = 'baca' | 'tambah' | 'ubah' | 'hapus' | 'ekspor' | 'kelola';
export type SumberAkses =
  | 'siswa'
  | 'mutasi'
  | 'rombel'
  | 'ptk'
  | 'peta_kelas'
  | 'dokumen'
  | 'template_word'
  | 'laporan'
  | 'impor'
  | 'backup'
  | 'audit'
  | 'pengguna'
  | 'tutup_tahun'
  | 'profil'
  | 'config'
  | 'kalender'
  | 'dapodik'
  | 'asisten';

export const PERAN_LABEL: Record<UserRole, string> = {
  administrator: 'Administrator',
  operator: 'Operator',
  wali_kelas: 'Wali Kelas',
  pimpinan: 'Pimpinan',
};

/** Label peran untuk UI; peran tak dikenal → 'Pengguna' (fail closed di gate, bukan di label). */
export function labelPeran(role?: string | null): string {
  if (!role) return 'Pengguna';
  return PERAN_LABEL[role as UserRole] || 'Pengguna';
}

const SEMUA_AKSI: AksiAkses[] = ['baca', 'tambah', 'ubah', 'hapus', 'ekspor', 'kelola'];

/** Matriks izin. Tambah sumber baru di sini = TypeScript memaksa pengisian keempat peran. */
export const IZIN_PERAN: Record<UserRole, Record<SumberAkses, AksiAkses[]>> = {
  administrator: {
    siswa: [...SEMUA_AKSI],
    mutasi: [...SEMUA_AKSI],
    rombel: [...SEMUA_AKSI],
    ptk: [...SEMUA_AKSI],
    peta_kelas: [...SEMUA_AKSI],
    dokumen: [...SEMUA_AKSI],
    template_word: [...SEMUA_AKSI],
    laporan: [...SEMUA_AKSI],
    impor: [...SEMUA_AKSI],
    backup: [...SEMUA_AKSI],
    audit: ['baca'],
    pengguna: [...SEMUA_AKSI],
    tutup_tahun: [...SEMUA_AKSI],
    profil: [...SEMUA_AKSI],
    config: [...SEMUA_AKSI],
    kalender: [...SEMUA_AKSI],
    dapodik: [...SEMUA_AKSI],
    asisten: [...SEMUA_AKSI],
  },
  operator: {
    siswa: ['baca', 'tambah', 'ubah', 'hapus', 'ekspor'],
    mutasi: ['baca', 'tambah', 'ubah'],
    rombel: ['baca'],
    ptk: ['baca'],
    peta_kelas: [],
    dokumen: ['baca', 'tambah', 'ekspor'],
    template_word: ['baca', 'tambah', 'ekspor'],
    laporan: ['baca', 'ekspor'],
    impor: ['tambah', 'ubah'],
    backup: [],
    audit: [],
    pengguna: [],
    tutup_tahun: [],
    profil: ['baca'],
    config: ['baca', 'ubah'],
    kalender: ['baca', 'ubah'],
    dapodik: [],
    asisten: ['baca', 'tambah', 'ekspor'],
  },
  wali_kelas: {
    siswa: ['baca', 'tambah', 'ubah', 'hapus', 'ekspor'],
    mutasi: ['baca', 'tambah', 'ubah'],
    rombel: ['baca'],
    ptk: ['baca'],
    peta_kelas: [],
    dokumen: ['baca', 'tambah', 'ekspor'],
    template_word: ['baca', 'tambah', 'ekspor'],
    laporan: ['baca', 'ekspor'],
    impor: ['tambah', 'ubah'],
    backup: [],
    audit: [],
    pengguna: [],
    tutup_tahun: [],
    profil: ['baca'],
    config: ['baca'],
    kalender: ['baca', 'ubah'],
    dapodik: [],
    asisten: ['baca', 'tambah', 'ekspor'],
  },
  pimpinan: {
    siswa: ['baca', 'ekspor'],
    mutasi: ['baca'],
    rombel: ['baca'],
    ptk: ['baca'],
    peta_kelas: [],
    dokumen: ['baca', 'ekspor'],
    template_word: ['baca', 'ekspor'],
    laporan: ['baca', 'ekspor'],
    impor: [],
    backup: [],
    audit: [],
    pengguna: [],
    tutup_tahun: [],
    profil: ['baca'],
    config: ['baca'],
    kalender: ['baca', 'ubah'],
    dapodik: [],
    asisten: ['baca'],
  },
};

/** Cek matriks. Pengguna null / peran tak dikenal → false (fail closed). */
export function bolehAksi(
  user: AppUser | null | undefined,
  sumber: SumberAkses,
  aksi: AksiAkses
): boolean {
  if (!user) return false;
  const izin = IZIN_PERAN[user.role as UserRole];
  if (!izin) return false;
  return izin[sumber].includes(aksi);
}

/** Boleh mengubah data apa pun: administrator, operator, wali_kelas. Pimpinan tidak. */
export function bolehTulis(user: AppUser | null | undefined): boolean {
  if (!user) return false;
  return user.role === 'administrator' || user.role === 'operator' || user.role === 'wali_kelas';
}

/** Aksi pengelolaan sistem (tutup/buka tahun, batal promosi, profil sekolah): hanya administrator. */
export function bolehKelolaAdmin(user: AppUser | null | undefined): boolean {
  return !!user && user.role === 'administrator';
}

/**
 * Cakupan rombel untuk pengguna TERAUTENTIKASI (fail closed: null → false).
 * - administrator & pimpinan: semua rombel (pimpinan membaca se-sekolah).
 * - operator: rombelAkses kosong = semua rombel (perilaku lama).
 * - wali_kelas: HANYA rombelAkses; kosong = tidak ada akses.
 * Siswa tanpa rombel (F16) tetap terlihat semua peran baca — pembatasan
 * berlaku saat TULIS (server menolak rombel '' untuk pengguna terbatas).
 */
export function rombelTerlihat(user: AppUser | null | undefined, rombel?: string | null): boolean {
  if (!user) return false;
  if (user.role === 'administrator' || user.role === 'pimpinan') return true;
  const akses = user.rombelAkses || [];
  if (user.role === 'wali_kelas') return !!rombel && akses.includes(rombel);
  if (akses.length === 0) return true;
  return !!rombel && akses.includes(rombel);
}
