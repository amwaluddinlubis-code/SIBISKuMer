// Auth server SIBISKuMer (Fase S1): sesi berbasis token di registry,
// kunci login server, dan aturan akses rombel — meniru persis semantik
// sisi klien saat ini (utils/security.ts & utils/db.ts) agar perilaku
// tidak berubah saat jalur data berpindah ke server.
//
// Kebijakan kunci: 5x gagal -> kunci 15 menit (LOGIN_MAX_GAGAL /
// LOGIN_KUNCI_MENIT di src/utils/security.ts).
import { randomBytes } from 'node:crypto';
import {
  dbRegistry,
  dbSekolah,
  simpanEntriSekolah,
  userByUsername,
  userById,
  simpanUser,
  semuaUsers,
  semuaSiswa,
  simpanSiswa,
  ambilMeta,
  simpanMeta,
  SEKOLAH_BAWAAN_ID,
} from './db';
import { verifyPassword, hashPassword, isHashedPassword } from '../src/utils/password';
import {
  defaultSekolahProfile,
  defaultDapodikConfig,
  initialUsersList,
  initialSiswaList,
} from '../src/data/initialData';

export const LOGIN_MAX_GAGAL = 5;
export const LOGIN_KUNCI_MENIT = 15;
const SESI_JAM = 12;

export interface SesiServer {
  token: string;
  sekolahId: string;
  userId: string;
  username: string;
  peran: string;
  impersonatorId: string | null;
}

// ---------------- Penyiapan sekolah bawaan ----------------

let janjiSiap: Promise<void> | null = null;

/** Pastikan sekolah bawaan ('utama') ada + ter-seed seperti instalasi
 *  baru sisi klien: profil bawaan, config Dapodik, dan akun bawaan
 *  (kata sandi langsung tersimpan sebagai hash). Idempoten. */
export function pastikanSiap(): Promise<void> {
  if (!janjiSiap) {
    janjiSiap = (async () => {
      const reg = dbRegistry();
      const ada = reg.prepare('SELECT id FROM sekolah_registry WHERE id = ?').get(SEKOLAH_BAWAAN_ID);
      if (!ada) {
        simpanEntriSekolah({
          id: SEKOLAH_BAWAAN_ID,
          nama: defaultSekolahProfile.nama,
          npsn: defaultSekolahProfile.npsn || '',
          jenjang: defaultSekolahProfile.jenjang || '',
          payload: { id: SEKOLAH_BAWAAN_ID, dibuat: 'server-s1' },
        });
      }
      const db = dbSekolah(SEKOLAH_BAWAAN_ID);
      if (!ambilMeta(db, 'profil_sekolah')) {
        simpanMeta(db, 'profil_sekolah', defaultSekolahProfile);
      }
      if (!ambilMeta(db, 'config_dapodik')) {
        simpanMeta(db, 'config_dapodik', defaultDapodikConfig);
      }
      if (semuaUsers(db).length === 0) {
        for (const u of initialUsersList) {
          const salinan: any = { ...u };
          if (!isHashedPassword(salinan.password)) {
            salinan.password = await hashPassword(String(salinan.password || ''));
          }
          simpanUser(db, salinan);
        }
      }
      // Paritas first-run klien: database sekolah yang benar-benar baru
      // menerima data contoh awal yang sama (ditandai meta agar tidak
      // pernah ditanam ulang setelah sekolah mengosongkan datanya).
      if (!ambilMeta(db, 'seed_awal')) {
        if (semuaSiswa(db).length === 0) {
          for (const s of initialSiswaList) simpanSiswa(db, s as any);
        }
        simpanMeta(db, 'seed_awal', { pada: new Date().toISOString() });
      }
    })();
  }
  return janjiSiap;
}

/** True bila basis data sekolah masih berstatus benih awal (baru
 *  ter-seed & belum pernah menerima impor data nyata) — gerbang
 *  penawaran migrasi otomatis Fase S4 di klien. */
export function apakahBenihAwal(sekolahId: string): boolean {
  const db = dbSekolah(sekolahId);
  return !!ambilMeta(db, 'seed_awal') && !ambilMeta(db, 'data_nyata');
}

// ---------------- Kunci login ----------------

export function statusKunci(sekolahId: string, username: string): { terkunci: boolean; sisaMenit: number } {
  const db = dbRegistry();
  const b = db.prepare('SELECT gagal, kunci_sampai FROM kunci_login WHERE sekolah_id = ? AND username = ?')
    .get(sekolahId, username) as any;
  if (!b || !b.kunci_sampai) return { terkunci: false, sisaMenit: 0 };
  const sampai = new Date(b.kunci_sampai).getTime();
  const sisaMs = sampai - Date.now();
  if (sisaMs <= 0) return { terkunci: false, sisaMenit: 0 };
  return { terkunci: true, sisaMenit: Math.max(1, Math.ceil(sisaMs / 60000)) };
}

/** Catat satu kegagalan; mengembalikan status kunci sesudahnya. */
export function catatGagal(sekolahId: string, username: string): { terkunci: boolean; sisaMenit: number } {
  const db = dbRegistry();
  const b = db.prepare('SELECT gagal FROM kunci_login WHERE sekolah_id = ? AND username = ?')
    .get(sekolahId, username) as any;
  const gagal = (b ? Number(b.gagal) : 0) + 1;
  const kunciSampai = gagal >= LOGIN_MAX_GAGAL
    ? new Date(Date.now() + LOGIN_KUNCI_MENIT * 60000).toISOString()
    : null;
  db.prepare(
    'INSERT INTO kunci_login (sekolah_id, username, gagal, kunci_sampai) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT(sekolah_id, username) DO UPDATE SET gagal = excluded.gagal, kunci_sampai = excluded.kunci_sampai'
  ).run(sekolahId, username, gagal, kunciSampai);
  return statusKunci(sekolahId, username);
}

export function catatSukses(sekolahId: string, username: string): void {
  dbRegistry().prepare('DELETE FROM kunci_login WHERE sekolah_id = ? AND username = ?')
    .run(sekolahId, username);
}

// ---------------- Login ----------------

export type HasilLogin =
  | { ok: true; sesi: SesiServer; user: any }
  | { ok: false; pesan: string; terkunci?: boolean };

/** Bentuk user yang aman dikirim ke klien (tanpa kata sandi). */
export function userPublik(u: any): any {
  if (!u) return u;
  const { password, ...sisa } = u;
  return sisa;
}

export async function loginServer(
  sekolahId: string,
  usernameMentah: string,
  password: string
): Promise<HasilLogin> {
  await pastikanSiap();
  const username = (usernameMentah || '').trim().toLowerCase();
  const db = dbSekolah(sekolahId);
  const user: any = userByUsername(db, username) ||
    semuaUsers(db).find((u) => String(u.username || '').toLowerCase() === username) ||
    null;
  // Pesan generik yang sama untuk username tak dikenal & sandi salah (S8 klien).
  if (!user) return { ok: false, pesan: 'Username atau kata sandi salah.' };
  if (user.status === 'nonaktif') {
    return { ok: false, pesan: 'Akun ini sedang dinonaktifkan oleh Administrator.' };
  }
  const kunci = statusKunci(sekolahId, username);
  if (kunci.terkunci) {
    return {
      ok: false,
      terkunci: true,
      pesan: `Akun dikunci sementara karena ${LOGIN_MAX_GAGAL}x salah kata sandi. Coba lagi dalam ±${kunci.sisaMenit} menit.`,
    };
  }
  const hasil = await verifyPassword(password, user.password);
  if (!hasil.ok) {
    const sesudah = catatGagal(sekolahId, username);
    if (sesudah.terkunci) {
      return {
        ok: false,
        terkunci: true,
        pesan: `Salah kata sandi ${LOGIN_MAX_GAGAL}x — akun dikunci ±${sesudah.sisaMenit} menit.`,
      };
    }
    return { ok: false, pesan: 'Username atau kata sandi salah.' };
  }
  catatSukses(sekolahId, username);
  // Migrasi transparan: plaintext/hash lama -> hash format berjalan.
  if (hasil.legacy || hasil.perluRehash) {
    user.password = await hashPassword(password);
    simpanUser(db, user);
  }
  const token = randomBytes(32).toString('hex');
  const dibuat = new Date();
  const kedaluwarsa = new Date(dibuat.getTime() + SESI_JAM * 3600 * 1000);
  dbRegistry().prepare(
    'INSERT INTO sesi (token, sekolah_id, user_id, username, peran, impersonator_id, dibuat_pada, kedaluwarsa_pada) ' +
    'VALUES (?, ?, ?, ?, ?, NULL, ?, ?)'
  ).run(token, sekolahId, user.id, user.username, user.role, dibuat.toISOString(), kedaluwarsa.toISOString());
  return {
    ok: true,
    sesi: {
      token,
      sekolahId,
      userId: user.id,
      username: user.username,
      peran: user.role,
      impersonatorId: null,
    },
    user,
  };
}

// ---------------- Sesi ----------------

export function sesiDariToken(token: string | null | undefined): SesiServer | null {
  if (!token) return null;
  const b = dbRegistry().prepare(
    'SELECT token, sekolah_id, user_id, username, peran, impersonator_id, kedaluwarsa_pada FROM sesi WHERE token = ?'
  ).get(token) as any;
  if (!b) return null;
  if (new Date(b.kedaluwarsa_pada).getTime() <= Date.now()) {
    dbRegistry().prepare('DELETE FROM sesi WHERE token = ?').run(token);
    return null;
  }
  return {
    token: b.token,
    sekolahId: b.sekolah_id,
    userId: b.user_id,
    username: b.username,
    peran: b.peran,
    impersonatorId: b.impersonator_id || null,
  };
}

export function akhiriSesi(token: string): void {
  dbRegistry().prepare('DELETE FROM sesi WHERE token = ?').run(token);
}

// ---------------- Ganti kata sandi (sesi sendiri) ----------------

/** Ganti kata sandi pemilik sesi (dipakai alur ganti-paksa & menu akun
 *  pada mode server). Menghapus mustChangePassword. */
export async function gantiSandiSesi(sesi: SesiServer, passwordBaru: string): Promise<any> {
  const db = dbSekolah(sesi.sekolahId);
  const user = userById(db, sesi.userId);
  if (!user) throw new Error('Pengguna sesi tidak ditemukan.');
  user.password = await hashPassword(passwordBaru);
  user.mustChangePassword = false;
  user.updatedAt = new Date().toISOString();
  simpanUser(db, user);
  return user;
}

// ---------------- Impersonate (Fase S3) ----------------

/** Buat sesi impersonate: sesi BARU untuk user target yang mencatat
 *  impersonator + token induk, agar berhenti-impersonate dapat
 *  mengembalikan cookie ke sesi admin tanpa token admin pernah
 *  meninggalkan server. */
export function buatSesiImpersonate(
  sesiAdmin: SesiServer,
  target: any
): SesiServer {
  const token = randomBytes(32).toString('hex');
  const dibuat = new Date();
  const kedaluwarsa = new Date(dibuat.getTime() + SESI_JAM * 3600 * 1000);
  dbRegistry().prepare(
    'INSERT INTO sesi (token, sekolah_id, user_id, username, peran, impersonator_id, token_induk, dibuat_pada, kedaluwarsa_pada) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    token,
    sesiAdmin.sekolahId,
    target.id,
    target.username,
    target.role,
    sesiAdmin.userId,
    sesiAdmin.token,
    dibuat.toISOString(),
    kedaluwarsa.toISOString()
  );
  return {
    token,
    sekolahId: sesiAdmin.sekolahId,
    userId: target.id,
    username: target.username,
    peran: target.role,
    impersonatorId: sesiAdmin.userId,
  };
}

/** Akhiri sesi impersonate dan kembalikan token induk (admin), atau
 *  null bila sesi ini bukan sesi impersonate / induk sudah tidak sah. */
export function akhiriImpersonate(sesi: SesiServer): string | null {
  const b = dbRegistry().prepare('SELECT token_induk FROM sesi WHERE token = ?')
    .get(sesi.token) as any;
  const induk: string | null = b?.token_induk || null;
  akhiriSesi(sesi.token);
  if (!induk) return null;
  return sesiDariToken(induk) ? induk : null;
}

// ---------------- Aturan akses (cermin utils/db.ts klien) ----------------

export function bolehAksesRombel(user: any, rombel?: string): boolean {
  if (!user || user.role === 'administrator') return true;
  const akses: string[] | undefined = user.rombelAkses;
  if (!akses || akses.length === 0) return true;
  return !!rombel && akses.includes(rombel);
}

/** Siswa tanpa rombel tetap terlihat operator (F16 klien). */
export function siswaTerlihat(user: any, siswa: any): boolean {
  if (!user || user.role === 'administrator') return true;
  const akses: string[] | undefined = user.rombelAkses;
  if (!akses || akses.length === 0) return true;
  return !siswa.rombelSaatIni || akses.includes(siswa.rombelSaatIni);
}

export function adalahAdmin(user: any): boolean {
  return !!user && user.role === 'administrator';
}
