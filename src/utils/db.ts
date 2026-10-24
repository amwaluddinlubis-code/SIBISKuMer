import { Siswa, SekolahProfile, DapodikConfig, DapodikSyncLog, AppUser, RaportSemester, TingkatKelas, RiwayatSemester, RombelRef, PtkRef, SchoolEntry, JenjangSekolah, TutupTahunAjaran, PetaKelas, AuditLog, AutoBackupSnapshot } from '../types';
import { defaultSekolahProfile, defaultDapodikConfig, initialSiswaList, initialUsersList, presetSekolahSD } from '../data/initialData';
import { hashPassword, isHashedPassword, withHashedPasswords } from './password';
import { toast } from './notify';
// D15(b): baca/tulis tombstone lokal untuk rekonsiliasi pasca-restore.
// Aman dari siklus impor: kedua modul hanya memakai binding satu sama lain
// di dalam badan fungsi (tidak saat evaluasi modul).
import { muatTombstoneLokal, simpanTombstoneLokal } from './tombstone';
import { bolehImporEntriAudit } from './auditSanitasi';
// Fase S3 migrasi SQLite: pada mode utama 'server', fungsi inti di bawah
// dirutekan ke API SQLite (modul dataApi) — tanda tangan & semantik untuk
// pemanggil tidak berubah. Mode 'lokal' (bawaan) tidak tersentuh sama sekali.
import { pakaiServer } from './modeData';
import * as api from './dataApi';
// Issue #10 — integritas (SHA-256), kompatibilitas & validasi struktur backup.
import {
  BACKUP_FORMAT_VERSION,
  deteksiCadanganTerenkripsi,
  periksaIntegritas,
  periksaRelasiBackup,
  tambahIntegritas,
  validasiKompatibilitas,
  validasiStrukturBackup,
  type HasilPeriksaIntegritas,
  type IntegritasBackup,
} from './backupIntegrity';

const DB_NAME = 'BukuInduk_Merdeka_DB';
// Naikkan versi setiap kali ada store baru agar database lama di browser
// pengguna ikut ter-upgrade (onupgradeneeded). v7 = store audit_logs &
// auto_backup (Tahap 5: audit log + cadangan otomatis).
const DB_VERSION = 7;

const STORES = {
  SISWA: 'siswa',
  SEKOLAH: 'sekolah',
  CONFIG: 'config',
  LOGS: 'sync_logs',
  USERS: 'users',
  ROMBEL: 'rombel',
  PTK: 'ptk',
  TUTUP: 'tutup_tahun',
  PETA: 'peta_kelas',
  AUDIT: 'audit_logs',
  AUTOBACKUP: 'auto_backup'
};

// ---------------- Konteks sekolah aktif (multi-sekolah) ----------------
// Semua fungsi CRUD memakai database milik sekolah aktif tanpa perlu
// mengubah signature. Default = database lama (kompatibel ke belakang).
let activeDbName: string = DB_NAME;

export function getActiveDbName(): string {
  return activeDbName;
}

function setActiveDbName(name: string): void {
  activeDbName = name && name.trim() ? name.trim() : DB_NAME;
}

// D11 — Kunci operasi panjang. Impor backup (importBackupData) dan apply
// sync Dapodik memegang kunci ini selama berjalan; ganti sekolah aktif
// DITOLAK selama kunci aktif agar operasi yang berjalan tidak menulis ke
// database sekolah yang salah bila user beralih sekolah di tengah jalan.
let operasiPanjangBerjalan = false;

/** true bila ada impor backup / apply sync Dapodik yang sedang berjalan. */
export function isOperasiPanjangBerjalan(): boolean {
  return operasiPanjangBerjalan;
}

/** Tandai mulai operasi panjang. Pemanggil WAJIB melepas di finally. */
export function kunciOperasiPanjang(): void {
  operasiPanjangBerjalan = true;
}

/** Lepaskan kunci operasi panjang (selalu dipanggil di finally). */
export function bukaKunciOperasiPanjang(): void {
  operasiPanjangBerjalan = false;
}

function openDB(name?: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Browser tidak mendukung IndexedDB'));
      return;
    }

    const request = indexedDB.open(name || activeDbName, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORES.SISWA)) {
        const siswaStore = db.createObjectStore(STORES.SISWA, { keyPath: 'id' });
        siswaStore.createIndex('nisn', 'nisn', { unique: false });
        siswaStore.createIndex('nipd', 'nipd', { unique: false });
        siswaStore.createIndex('rombelSaatIni', 'rombelSaatIni', { unique: false });
        siswaStore.createIndex('statusSiswa', 'statusSiswa', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.SEKOLAH)) {
        db.createObjectStore(STORES.SEKOLAH, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.CONFIG)) {
        db.createObjectStore(STORES.CONFIG, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.LOGS)) {
        const logStore = db.createObjectStore(STORES.LOGS, { keyPath: 'id' });
        logStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.USERS)) {
        const userStore = db.createObjectStore(STORES.USERS, { keyPath: 'id' });
        userStore.createIndex('username', 'username', { unique: true });
        userStore.createIndex('role', 'role', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.ROMBEL)) {
        const rombelStore = db.createObjectStore(STORES.ROMBEL, { keyPath: 'id' });
        rombelStore.createIndex('nama', 'nama', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.PTK)) {
        const ptkStore = db.createObjectStore(STORES.PTK, { keyPath: 'id' });
        ptkStore.createIndex('nama', 'nama', { unique: false });
        ptkStore.createIndex('nip', 'nip', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.TUTUP)) {
        db.createObjectStore(STORES.TUTUP, { keyPath: 'tahunAjaran' });
      }
      if (!db.objectStoreNames.contains(STORES.PETA)) {
        const petaStore = db.createObjectStore(STORES.PETA, { keyPath: 'id' });
        petaStore.createIndex('tahunAjaran', 'tahunAjaran', { unique: false });
        petaStore.createIndex('rombel', 'rombel', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.AUDIT)) {
        const auditStore = db.createObjectStore(STORES.AUDIT, { keyPath: 'id' });
        auditStore.createIndex('timestamp', 'timestamp', { unique: false });
        auditStore.createIndex('aksi', 'aksi', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.AUTOBACKUP)) {
        const snapStore = db.createObjectStore(STORES.AUTOBACKUP, { keyPath: 'id' });
        snapStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Fallback to localStorage keys if indexedDB fails in sandboxed iframe
const LS_KEYS = {
  SISWA: 'bukuinduk_siswa',
  SEKOLAH: 'bukuinduk_sekolah',
  CONFIG: 'bukuinduk_config',
  LOGS: 'bukuinduk_logs',
  USERS: 'bukuinduk_users',
  ROMBEL: 'bukuinduk_rombel',
  PTK: 'bukuinduk_ptk',
  TUTUP: 'bukuinduk_tutup_tahun',
  PETA: 'bukuinduk_peta_kelas',
  AUDIT: 'bukuinduk_audit',
  AUTOBACKUP: 'bukuinduk_autobackup_snap',
  LOCKOUT: 'bukuinduk_login_lock',
  AUTOBACKUP_CFG: 'bukuinduk_autobackup_cfg',
  TOMBSTONE: 'bukuinduk_tombstone',
  /** Sidik jari (SHA-256) berkas impor Excel/CSV yang sudah diterapkan (Issue #11). */
  IMPOR_SIDIK: 'bukuinduk_impor_sidik',
  CLOUDSYNC: 'bukuinduk_cloudsync',
  SCHOOLS: 'bukuinduk_schools',
  ACTIVE_SCHOOL: 'bukuinduk_active_school',
  CURRENT_USER: 'bukuinduk_current_user',
  SESSION_TAHUN: 'bukuinduk_tahun_sesi',
  IMPERSONATE: 'bukuinduk_impersonate_from'
};

/** Kunci localStorage di-scope per database sekolah agar fallback
 *  antar-sekolah tidak tercampur. Database lama memakai kunci global
 *  (kompatibel dengan data yang sudah ada). */
function sk(baseKey: string): string {
  return activeDbName === DB_NAME ? baseKey : `${baseKey}__${activeDbName}`;
}

/** Kunci penyimpanan di-scope per database (dipakai security.ts & autoBackup.ts). */
export function scopedStorageKey(baseKey: string): string {
  return sk(baseKey);
}

/** Akses nama kunci LS dari luar (tanpa membuka sk()). */
export const storageKeys = LS_KEYS;

// ---------------- Registry multi-sekolah ----------------

function readSchools(): SchoolEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEYS.SCHOOLS);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function persistSchools(list: SchoolEntry[]): void {
  localStorage.setItem(LS_KEYS.SCHOOLS, JSON.stringify(list));
}

export function getSchools(): SchoolEntry[] {
  return readSchools();
}

export function getActiveSchoolId(): string | null {
  try {
    return localStorage.getItem(LS_KEYS.ACTIVE_SCHOOL);
  } catch {
    return null;
  }
}

export function getActiveSchool(): SchoolEntry | null {
  const list = readSchools();
  const id = getActiveSchoolId();
  return list.find((s) => s.id === id) || list[0] || null;
}

/** Buat entri sekolah baru (database dibuat malas saat pertama dipakai).
 *  NPSN non-kosong harus unik antar-sekolah — melempar Error bila duplikat. */
export function createSchoolEntry(input: { nama: string; npsn: string; jenjang: JenjangSekolah; bentukPendidikan?: string }): SchoolEntry {
  const normalizedNpsn = (input.npsn || '').trim();
  if (normalizedNpsn) {
    const dup = readSchools().find((s) => (s.npsn || '').trim() === normalizedNpsn);
    if (dup) throw new Error(`NPSN ${normalizedNpsn} sudah dipakai oleh "${dup.nama}".`);
  }
  const now = new Date().toISOString();
  const id = `sch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const entry: SchoolEntry = {
    id,
    nama: (input.nama || 'Sekolah Baru').trim(),
    npsn: normalizedNpsn,
    jenjang: input.jenjang || 'SMP',
    bentukPendidikan: input.bentukPendidikan,
    dbName: `${DB_NAME}_${id}`,
    createdAt: now,
    updatedAt: now,
  };
  const list = readSchools();
  list.push(entry);
  persistSchools(list);
  return entry;
}

export function saveSchoolEntry(entry: SchoolEntry): SchoolEntry[] {
  const list = readSchools();
  const idx = list.findIndex((s) => s.id === entry.id);
  const normalized = { ...entry, updatedAt: new Date().toISOString() };
  if (idx >= 0) list[idx] = normalized;
  else list.push(normalized);
  persistSchools(list);
  return list;
}

/** Hapus entri dari registry. Secara default file IndexedDB + cache dibiarkan
 *  (aman); teruskan `{ deletePhysical: true }` untuk menghapus permanen
 *  database IDB, kunci localStorage ter-scope, dan cache memori sekolah itu. */
export function deleteSchoolEntry(id: string, opts?: { deletePhysical?: boolean }): SchoolEntry[] {
  const target = readSchools().find((s) => s.id === id);
  const remaining = readSchools().filter((s) => s.id !== id);
  persistSchools(remaining);
  if (target && opts?.deletePhysical) {
    void deleteIndexedDatabase(target.dbName);
    clearScopedLocalStorage(target.dbName);
    clearMemFallbackForDb(target.dbName);
  }
  if (getActiveSchoolId() === id) {
    const next = remaining[0] || null;
    if (next) {
      localStorage.setItem(LS_KEYS.ACTIVE_SCHOOL, next.id);
      setActiveDbName(next.dbName);
    } else {
      localStorage.removeItem(LS_KEYS.ACTIVE_SCHOOL);
      setActiveDbName(DB_NAME);
    }
  }
  return remaining;
}

export async function setActiveSchool(id: string): Promise<SchoolEntry | null> {
  // D11: tolak ganti sekolah selama operasi panjang (impor/sync) berjalan.
  if (operasiPanjangBerjalan) {
    toast('Tunggu operasi selesai: impor backup / sinkronisasi Dapodik masih berjalan.', 'warning');
    return null;
  }
  const found = readSchools().find((s) => s.id === id) || null;
  if (!found) return null;
  localStorage.setItem(LS_KEYS.ACTIVE_SCHOOL, found.id);
  setActiveDbName(found.dbName);
  return found;
}

/** Hapus file IndexedDB (best-effort, aman bila browser menolak). */
function deleteIndexedDatabase(dbName: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (!('indexedDB' in window) || typeof indexedDB.deleteDatabase !== 'function') {
        resolve();
        return;
      }
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Bersihkan seluruh kunci localStorage milik satu database sekolah. */
function clearScopedLocalStorage(dbName: string): void {
  if (dbName === DB_NAME) return; // jangan hapus kunci global legacy
  const suffix = `__${dbName}`;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.endsWith(suffix)) doomed.push(k);
    }
    for (const k of doomed) localStorage.removeItem(k);
  } catch {
    /* abaikan */
  }
}

function clearMemFallbackForDb(dbName: string): void {
  const prefix = `${dbName}::`;
  for (const k of [...memFallback.keys()]) {
    if (k.startsWith(prefix)) memFallback.delete(k);
  }
}

/** Profil seed sesuai jenjang (nama/NPSN di-override dari entri). */
function seedProfileForEntry(entry: SchoolEntry): SekolahProfile {
  const base = entry.jenjang === 'SD' ? presetSekolahSD : defaultSekolahProfile;
  return {
    ...base,
    nama: entry.nama || base.nama,
    npsn: entry.npsn || base.npsn,
    jenjang: entry.jenjang,
    bentukPendidikan: entry.bentukPendidikan || entry.jenjang,
  };
}

/** Provisi database sekolah baru: buat store + seed profil/config/users
 *  sesuai jenjang. `withSample=true` ikut menyalin 5 siswa contoh. */
export async function provisionSchoolDatabase(
  entry: SchoolEntry,
  opts?: { withSample?: boolean }
): Promise<void> {
  const previous = activeDbName;
  setActiveDbName(entry.dbName);
  try {
    const db = await openDB(entry.dbName);
    const [siswaCount, userCount, sekolahCount, configCount] = await Promise.all([
      countStore(db, STORES.SISWA),
      countStore(db, STORES.USERS),
      countStore(db, STORES.SEKOLAH),
      countStore(db, STORES.CONFIG),
    ]);
    const profile = seedProfileForEntry(entry);
    const config: DapodikConfig = { ...defaultDapodikConfig, npsn: entry.npsn || defaultDapodikConfig.npsn };
    const tx = db.transaction([STORES.SISWA, STORES.SEKOLAH, STORES.CONFIG, STORES.LOGS, STORES.USERS], 'readwrite');
    if (sekolahCount === 0) tx.objectStore(STORES.SEKOLAH).put({ id: 'main', ...profile });
    if (configCount === 0) tx.objectStore(STORES.CONFIG).put({ id: 'main', ...config });
    if (userCount === 0) {
      const us = tx.objectStore(STORES.USERS);
      for (const u of await withHashedPasswords(initialUsersList)) us.put(u);
    }
    if (siswaCount === 0 && opts?.withSample) {
      const ss = tx.objectStore(STORES.SISWA);
      for (const s of initialSiswaList) ss.put(s);
    }
    await new Promise<void>((res) => {
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
    // Cerminkan users ke fallback LS ter-scope agar login tetap bisa saat IDB gagal
    try {
      localStorage.setItem(sk(LS_KEYS.USERS), JSON.stringify(await withHashedPasswords(initialUsersList)));
    } catch {
      /* abaikan */
    }
  } catch {
    // Fallback localStorage ter-scope
    const p = seedProfileForEntry(entry);
    if (!localStorage.getItem(sk(LS_KEYS.SEKOLAH))) {
      localStorage.setItem(sk(LS_KEYS.SEKOLAH), JSON.stringify(p));
      localStorage.setItem(sk(LS_KEYS.CONFIG), JSON.stringify({ ...defaultDapodikConfig, npsn: entry.npsn || defaultDapodikConfig.npsn }));
      localStorage.setItem(sk(LS_KEYS.USERS), JSON.stringify(await withHashedPasswords(initialUsersList)));
      localStorage.setItem(sk(LS_KEYS.SISWA), JSON.stringify(opts?.withSample ? initialSiswaList : []));
      localStorage.setItem(sk(LS_KEYS.LOGS), JSON.stringify([]));
    }
  } finally {
    setActiveDbName(previous);
  }
}

/** Buat entri + langsung provisi databasenya (satu panggilan untuk UI). */
export async function createSchoolWithDatabase(input: {
  nama: string;
  npsn: string;
  jenjang: JenjangSekolah;
  bentukPendidikan?: string;
  withSample?: boolean;
}): Promise<SchoolEntry> {
  const entry = createSchoolEntry(input);
  await provisionSchoolDatabase(entry, { withSample: input.withSample });
  return entry;
}

/** Ganti sekolah aktif: set registry → init storage DB target → pertahankan sesi
 *  bila username yang sama ada di DB target, selain itu paksa login ulang.
 *  Mengembalikan entri + flag apakah sesi dipertahankan. */
export async function switchActiveSchool(id: string): Promise<{ entry: SchoolEntry | null; keptSession: boolean }> {
  // D11: tolak sejak awal (sebelum sesi dibersihkan) bila operasi panjang berjalan.
  if (operasiPanjangBerjalan) {
    toast('Tunggu operasi selesai: impor backup / sinkronisasi Dapodik masih berjalan.', 'warning');
    return { entry: null, keptSession: false };
  }
  const prevSession = getCurrentUserSession();
  clearImpersonateSession();
  clearSessionTahunAjaran();
  const entry = await setActiveSchool(id);
  if (!entry) return { entry: null, keptSession: false };
  await initStorage();
  let keptSession = false;
  if (prevSession?.username) {
    try {
      const users = await getAllUsers();
      const match = users.find((u) => u.username.toLowerCase() === prevSession.username.toLowerCase());
      if (match && match.status === 'aktif') {
        setCurrentUserSession(match);
        keptSession = true;
      } else {
        clearCurrentUserSession();
      }
    } catch {
      clearCurrentUserSession();
    }
  } else {
    clearCurrentUserSession();
  }
  return { entry, keptSession };
}

/** Hapus TOTAL semua database sekolah KECUALI database utama (DB_NAME).
 *  - Menghapus file IndexedDB + cache localStorage ter-scope + cache memori
 *    milik setiap database non-utama (terdaftar maupun yatim/tak terdaftar).
 *  - Registry direset ke satu entri utama (dibuat bila belum ada, mengadopsi
 *    profil database yang sedang aktif).
 *  - Database utama dijadikan aktif + init struktural + validasi sesi login
 *    (seperti switchActiveSchool).
 *  CATATAN: panggil `window.location.reload()` setelahnya agar koneksi IDB
 *  yang masih terbuka tertutup dan penghapusan fisik tuntas. */
export async function resetToSingleMainDatabase(): Promise<{ entry: SchoolEntry; keptSession: boolean; removed: number }> {
  // 1. Pastikan entri utama ada (adopsi profil aktif bila registry tak punya).
  const list = readSchools();
  let main = list.find((s) => s.dbName === DB_NAME) || null;
  if (!main) {
    let profil = defaultSekolahProfile;
    try {
      profil = await getSekolahProfile();
    } catch {
      /* pakai default */
    }
    const now = new Date().toISOString();
    main = {
      id: `sch-main-${Date.now().toString(36)}`,
      nama: profil.nama || 'Sekolah Utama',
      npsn: profil.npsn || '',
      jenjang: profil.jenjang || 'SMP',
      bentukPendidikan: profil.bentukPendidikan,
      dbName: DB_NAME,
      createdAt: now,
      updatedAt: now,
    };
  }

  // 2. Kumpulkan semua database non-utama: terdaftar + yatim (fisik ada,
  //    tak ada di registry — cth. sisa hapus manual sebelumnya).
  const doomed = new Set<string>();
  for (const s of list) {
    if (s.dbName && s.dbName !== DB_NAME) doomed.add(s.dbName);
  }
  try {
    const idb = indexedDB as unknown as { databases?: () => Promise<{ name?: string | null }[]> };
    const dbs = typeof idb.databases === 'function' ? await idb.databases() : undefined;
    if (Array.isArray(dbs)) {
      for (const d of dbs) {
        const n = (d?.name || '').trim();
        if (n && n !== DB_NAME && n.startsWith(DB_NAME)) doomed.add(n);
      }
    }
  } catch {
    /* API tidak tersedia — lewati penyapuan yatim */
  }
  for (const name of doomed) {
    await deleteIndexedDatabase(name);
    clearScopedLocalStorage(name);
    clearMemFallbackForDb(name);
  }

  // 3. Registry tinggal satu entri utama + jadikan aktif.
  persistSchools([main]);
  try {
    localStorage.setItem(LS_KEYS.ACTIVE_SCHOOL, main.id);
  } catch {
    /* abaikan */
  }
  setActiveDbName(main.dbName);
  await initStorage();

  // 4. Validasi sesi login terhadap database utama.
  const prevSession = getCurrentUserSession();
  clearImpersonateSession();
  clearSessionTahunAjaran();
  let keptSession = false;
  if (prevSession?.username) {
    try {
      const users = await getAllUsers();
      const match = users.find((u) => u.username.toLowerCase() === prevSession.username.toLowerCase());
      if (match && match.status === 'aktif') {
        setCurrentUserSession(match);
        keptSession = true;
      } else {
        clearCurrentUserSession();
      }
    } catch {
      clearCurrentUserSession();
    }
  } else {
    clearCurrentUserSession();
  }
  return { entry: main, keptSession, removed: doomed.size };
}

/** Hitung jumlah siswa satu database (untuk lencana pemilih sekolah). */
export async function getSchoolSiswaCount(dbName: string): Promise<number | null> {
  try {
    const db = await openDB(dbName);
    return await countStore(db, STORES.SISWA);
  } catch {
    try {
      const key = dbName === DB_NAME ? LS_KEYS.SISWA : `${LS_KEYS.SISWA}__${dbName}`;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.length : null;
    } catch {
      return null;
    }
  }
}

/** Inisialisasi registry. Pada instalasi lama (belum ada registry),
 *  database tunggal yang ada diadopsi sebagai sekolah pertama —
 *  profilnya dibaca untuk nama/NPSN/jenjang. Idempoten. */
export async function ensureSchoolsInit(): Promise<{ schools: SchoolEntry[]; active: SchoolEntry }> {
  const existing = readSchools();
  if (existing.length > 0) {
    const active = existing.find((s) => s.id === getActiveSchoolId()) || existing[0];
    localStorage.setItem(LS_KEYS.ACTIVE_SCHOOL, active.id);
    setActiveDbName(active.dbName);
    return { schools: existing, active };
  }

  let legacy: SekolahProfile = defaultSekolahProfile;
  try {
    setActiveDbName(DB_NAME);
    legacy = await getSekolahProfile();
  } catch {
    /* pakai default */
  }

  const now = new Date().toISOString();
  const first: SchoolEntry = {
    id: `sch-${Date.now().toString(36)}`,
    nama: legacy.nama || 'Sekolah Saya',
    npsn: legacy.npsn || '',
    jenjang: legacy.jenjang || 'SMP',
    bentukPendidikan: legacy.bentukPendidikan,
    dbName: DB_NAME,
    createdAt: now,
    updatedAt: now,
  };
  persistSchools([first]);
  localStorage.setItem(LS_KEYS.ACTIVE_SCHOOL, first.id);
  setActiveDbName(first.dbName);
  return { schools: [first], active: first };
}

export async function initStorage(): Promise<void> {
  try {
    const db = await openDB();
    const [userCount, sekolahCount, configCount] = await Promise.all([
      countStore(db, STORES.USERS),
      countStore(db, STORES.SEKOLAH),
      countStore(db, STORES.CONFIG),
    ]);
    // Hanya seed STRUKTURAL (profil, config, akun). Siswa contoh TIDAK
    // dimuat otomatis agar database baru benar-benar kosong — admin mengisi
    // lewat Sinkron Dapodik (wizard penyiapan) atau "Muat Data Contoh".
    if (userCount === 0 || sekolahCount === 0 || configCount === 0) {
    await seedDefaultData(db, { withSample: true });
    }
    // Migrasi satu-kali: password plaintext lama (bila ada) di-hash ulang.
    await migrateUserPasswordsToHash().catch(() => undefined);
  } catch {
    // LocalStorage fallback check
    if (!localStorage.getItem(sk(LS_KEYS.USERS))) {
      localStorage.setItem(sk(LS_KEYS.USERS), JSON.stringify(await withHashedPasswords(initialUsersList)));
    }
    if (!localStorage.getItem(sk(LS_KEYS.SEKOLAH))) {
      localStorage.setItem(sk(LS_KEYS.SEKOLAH), JSON.stringify(defaultSekolahProfile));
    }
    if (!localStorage.getItem(sk(LS_KEYS.CONFIG))) {
      localStorage.setItem(sk(LS_KEYS.CONFIG), JSON.stringify(defaultDapodikConfig));
    }
    if (!localStorage.getItem(sk(LS_KEYS.SISWA))) {
      localStorage.setItem(sk(LS_KEYS.SISWA), JSON.stringify([]));
    }
    if (!localStorage.getItem(sk(LS_KEYS.LOGS))) {
      localStorage.setItem(sk(LS_KEYS.LOGS), JSON.stringify([]));
    }
  }
}

function countStore(db: IDBDatabase, storeName: string): Promise<number> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    } catch {
      resolve(0);
    }
  });
}

async function seedDefaultData(db: IDBDatabase, opts?: { withSample?: boolean }): Promise<void> {
  const tx = db.transaction([STORES.SISWA, STORES.SEKOLAH, STORES.CONFIG, STORES.LOGS, STORES.USERS], 'readwrite');
  // Data contoh siswa HANYA bila diminta eksplisit (tombol "Muat Data Contoh").
  if (opts?.withSample) {
    const siswaStore = tx.objectStore(STORES.SISWA);
    for (const s of initialSiswaList) {
      siswaStore.put(s);
    }
  }
  const sekolahStore = tx.objectStore(STORES.SEKOLAH);
  sekolahStore.put({ id: 'main', ...defaultSekolahProfile });

  const configStore = tx.objectStore(STORES.CONFIG);
  configStore.put({ id: 'main', ...defaultDapodikConfig });

  const userStore = tx.objectStore(STORES.USERS);
  for (const u of await withHashedPasswords(initialUsersList)) {
    userStore.put(u);
  }

  if (opts?.withSample) {
    const logStore = tx.objectStore(STORES.LOGS);
    logStore.put({
      id: 'log-init',
      timestamp: new Date().toISOString(),
      status: 'success',
      totalDapodik: 5,
      ditambahkan: 5,
      diperbarui: 0,
      dilewati: 0,
      pesan: 'Inisialisasi Database Buku Induk Siswa Kurikulum Merdeka (Data Awal Sukses Dimuat).'
    });
  }

  localStorage.setItem(sk(LS_KEYS.USERS), JSON.stringify(await withHashedPasswords(initialUsersList)));

  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// ---------------- SISWA CRUD ----------------

export async function getAllSiswa(): Promise<Siswa[]> {
  if (pakaiServer()) return api.ambilSiswaDariServer();
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SISWA, 'readonly');
      const store = tx.objectStore(STORES.SISWA);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    // D5: baca IDB gagal karena ERROR → fallback ke localStorage ter-scope.
    // Cache LS kosong = kembalikan [] (jangan memunculkan data contoh).
    const raw = localStorage.getItem(sk(LS_KEYS.SISWA));
    // Salin agar pemanggil tidak memutasi konstanta modul (anti-bocor antar-sekolah).
    return raw ? JSON.parse(raw) : [];
  }
}

export async function getSiswaById(id: string): Promise<Siswa | null> {
  if (pakaiServer()) return api.ambilSiswaSatuDariServer(id);
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SISWA, 'readonly');
      const store = tx.objectStore(STORES.SISWA);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    const all = await getAllSiswa();
    return (all || []).find((s) => s.id === id) || null;
  }
}

/** D6 — True bila error IndexedDB menandakan DATA buruk (record tanpa id /
 *  kunci tak valid / pelanggaran constraint). Error semacam ini takkan pernah
 *  pulih dengan menulis ke localStorage, jadi harus dilempar — bukan dibungkam. */
function isIdbDataError(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name === 'DataError' || name === 'ConstraintError';
}

export async function saveSiswa(siswa: Siswa): Promise<void> {
  // D6: record tanpa id adalah error data — lempar segera dengan pesan jelas,
  // jangan ditulis diam-diam ke localStorage (takkan pernah terbaca lagi).
  if (!siswa || typeof siswa.id !== 'string' || !siswa.id.trim()) {
    throw new Error('saveSiswa dibatalkan: data siswa tanpa id yang valid (id wajib diisi).');
  }
  if (pakaiServer()) {
    await api.simpanSiswaKeServer(siswa);
    return;
  }
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORES.SISWA, 'readwrite');
      const store = tx.objectStore(STORES.SISWA);
      const req = store.put(siswa);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.onabort = () => reject(tx.error || req.error || new Error('Transaksi IndexedDB dibatalkan.'));
    });
  } catch (err) {
    // D6: error data (DataError/ConstraintError) → lempar Error yang jelas.
    if (isIdbDataError(err)) {
      const nama = (err as { name?: string })?.name || 'DataError';
      const detail = (err as Error)?.message ? `: ${(err as Error).message}` : '';
      throw new Error(
        `saveSiswa gagal: data siswa "${siswa.id}" ditolak IndexedDB (${nama}${detail}). ` +
        `Periksa struktur data siswa — tidak ditulis ke localStorage agar tidak hilang diam-diam.`
      );
    }
    // Hanya error yang menandakan IDB tak tersedia (open gagal / koneksi
    // putus / transaksi abort) yang fallback ke localStorage ter-scope.
    const all = await getAllSiswa();
    const idx = all.findIndex((s) => s.id === siswa.id);
    if (idx >= 0) {
      all[idx] = siswa;
    } else {
      all.unshift(siswa);
    }
    localStorage.setItem(sk(LS_KEYS.SISWA), JSON.stringify(all));
  }
}

export async function deleteSiswa(id: string): Promise<void> {
  if (pakaiServer()) {
    await api.hapusSiswaDariServer(id);
    return;
  }
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SISWA, 'readwrite');
      const store = tx.objectStore(STORES.SISWA);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    const all = await getAllSiswa();
    const filtered = all.filter((s) => s.id !== id);
    localStorage.setItem(sk(LS_KEYS.SISWA), JSON.stringify(filtered));
  }
}

/**
 * Simpan banyak siswa dalam SATU transaksi (restore massal, target <10 dtk
 * untuk 500 siswa). Fallback: tulis gabung sekali ke localStorage.
 */
export async function saveSiswaBulk(daftar: Siswa[]): Promise<void> {
  if (!daftar || daftar.length === 0) return;
  if (pakaiServer()) {
    await api.simpanSiswaBulkKeServer(daftar);
    return;
  }
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(STORES.SISWA, 'readwrite');
        const store = tx.objectStore(STORES.SISWA);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
        for (const s of daftar) {
          if (s && s.id) store.put(s);
        }
      } catch (e) {
        reject(e);
      }
    });
  } catch {
    const all = await getAllSiswa();
    const byId = new Map(all.map((s) => [s.id, s]));
    for (const s of daftar) {
      if (s && s.id) byId.set(s.id, s);
    }
    localStorage.setItem(sk(LS_KEYS.SISWA), JSON.stringify([...byId.values()]));
  }
}

/** Ringkasan rombel dari payload (dipakai pratinjau & restore selektif). */
function ringkasRombel(data: BackupPayload): Array<{ rombel: string; jumlah: number }> {
  const hitung = new Map<string, number>();
  for (const s of data.siswa) {
    const r = (s?.rombelSaatIni || 'Tanpa Rombel').toString().trim() || 'Tanpa Rombel';
    hitung.set(r, (hitung.get(r) || 0) + 1);
  }
  return [...hitung.entries()]
    .map(([rombel, jumlah]) => ({ rombel, jumlah }))
    .sort((a, b) => a.rombel.localeCompare(b.rombel));
}

/**
 * Urai file backup JSON menjadi payload + ringkasan rombel (untuk restore selektif).
 * Issue #10 — melempar Error dengan pesan jelas bila: file terenkripsi,
 * bukan JSON valid, tidak kompatibel (app/versi), atau struktur tidak valid.
 */
export function parseBackupPayload(jsonString: string): {
  payload: BackupPayload;
  totalSiswa: number;
  rombel: Array<{ rombel: string; jumlah: number }>;
  /** true bila file membawa blok integritas (checksum) — jika false, UI
   *  menampilkan peringatan "backup lama tanpa checksum". */
  punyaIntegritas: boolean;
  /** Peringatan relasi non-fatal (mis. rombel tak dikenal, NISN ganda). */
  peringatanRelasi: string[];
} {
  if (deteksiCadanganTerenkripsi(jsonString)) {
    throw new Error(
      'File cadangan terenkripsi (butuh password) — pemulihan file terenkripsi belum didukung di tab ini.'
    );
  }
  let data: BackupPayload;
  try {
    data = JSON.parse(jsonString);
  } catch {
    throw new Error('File bukan JSON yang valid — kemungkinan rusak atau terpotong saat diunduh.');
  }
  const masalahKompat = validasiKompatibilitas(data);
  if (masalahKompat.length > 0) throw new Error(masalahKompat.join(' '));
  const masalahStruktur = validasiStrukturBackup(data);
  if (masalahStruktur.length > 0) {
    throw new Error(`Struktur backup tidak valid: ${masalahStruktur.join(' ')}`);
  }
  return {
    payload: data,
    totalSiswa: data.siswa.length,
    rombel: ringkasRombel(data),
    punyaIntegritas: !!data.integritas,
    peringatanRelasi: periksaRelasiBackup(data),
  };
}

/** Issue #10 — hasil pratinjau file backup (dipakai panel pratinjau restore). */
export interface HasilPratinjauBackup {
  payload: BackupPayload;
  totalSiswa: number;
  rombel: Array<{ rombel: string; jumlah: number }>;
  integritas: HasilPeriksaIntegritas;
  peringatanRelasi: string[];
}

/**
 * Issue #10 — pratinjau file backup SEBELUM restore: parse + validasi
 * kompatibilitas/struktur + periksa checksum SHA-256. Melempar Error dengan
 * pesan jelas bila file ditolak (rusak / tidak kompatibel / checksum tidak
 * cocok). Backup lama tanpa checksum TIDAK ditolak — statusnya
 * 'tanpa-checksum' dan UI menampilkan peringatan.
 */
export async function pratinjauBackup(jsonString: string): Promise<HasilPratinjauBackup> {
  const { payload, totalSiswa, rombel, peringatanRelasi } = parseBackupPayload(jsonString);
  const integritas = await periksaIntegritas(payload);
  if (integritas.status === 'tidak-cocok' || integritas.status === 'tidak-valid') {
    throw new Error(integritas.alasan || 'Integritas backup tidak valid — file ditolak.');
  }
  return { payload, totalSiswa, rombel, integritas, peringatanRelasi };
}

/**
 * Restore selektif: hanya siswa dari rombel terpilih (upsert per id).
 * Mengembalikan { ditambahkan, diperbarui }.
 * Issue #10 — sebelum menulis: periksa checksum bila ada (tolak bila tidak
 * cocok), lalu buat snapshot pengaman. Bila tulis gagal, rollback otomatis
 * ke snapshot pengaman dan Error menyebutkan hasil rollback.
 */
export async function importSelectiveSiswa(
  data: BackupPayload,
  rombelTerpilih: string[]
): Promise<{ ditambahkan: number; diperbarui: number; total: number }> {
  const masalahStruktur = validasiStrukturBackup(data);
  if (masalahStruktur.length > 0) {
    throw new Error(`Struktur backup tidak valid: ${masalahStruktur.join(' ')}`);
  }
  const integritas = await periksaIntegritas(data);
  if (integritas.status === 'tidak-cocok' || integritas.status === 'tidak-valid') {
    throw new Error(integritas.alasan || 'Integritas backup tidak valid — restore selektif dibatalkan.');
  }
  const pilih = new Set((rombelTerpilih || []).map((r) => r.trim()));
  const cocok = (data.siswa || []).filter((s) =>
    pilih.has(((s?.rombelSaatIni || 'Tanpa Rombel').toString().trim() || 'Tanpa Rombel'))
  );
  if (cocok.length === 0) throw new Error('Tidak ada siswa pada rombel terpilih.');
  // Snapshot pengaman SEBELUM mutasi apa pun (fail-closed: bila gagal dibuat,
  // restore selektif dibatalkan agar data saat ini tetap aman).
  let pengaman: SnapshotPengaman;
  try {
    const payloadPengaman = await exportAllData();
    const jumlahSaatIni = (await getAllSiswa()).length;
    const id = await simpanSnapshotPengaman(payloadPengaman, jumlahSaatIni);
    pengaman = { id, timestamp: new Date().toISOString(), jumlahSiswa: jumlahSaatIni, payload: payloadPengaman };
  } catch (e) {
    throw new Error(
      `Restore selektif dibatalkan: gagal membuat snapshot pengaman kondisi saat ini ` +
        `(${e instanceof Error ? e.message : String(e)}). Data saat ini TIDAK diubah.`
    );
  }
  const ada = new Set((await getAllSiswa()).map((s) => s.id));
  let ditambahkan = 0;
  for (const s of cocok) {
    if (!ada.has(s.id)) {
      ditambahkan++;
      ada.add(s.id);
    }
  }
  try {
    await saveSiswaBulk(cocok);
  } catch (e) {
    const rollback = await cobaRollback(pengaman);
    throw new Error(
      `Restore selektif GAGAL (${e instanceof Error ? e.message : String(e)}). ` +
        `${rollback.pesan || 'Rollback tidak dilakukan.'}`
    );
  }
  return { ditambahkan, diperbarui: cocok.length - ditambahkan, total: cocok.length };
}

// ---------------- RAPORT & MULTI-YEAR HELPERS ----------------

export async function saveSiswaRaport(siswaId: string, raport: RaportSemester): Promise<void> {
  const siswa = await getSiswaById(siswaId);
  if (!siswa) throw new Error('Data siswa tidak ditemukan.');

  // Normalisasi alias ganda (nilaiMapel <-> nilaiMataPelajaran) agar semua
  // pembaca (Cetak, Form, NilaiRaport) melihat data yang sama.
  const normalizedInput: RaportSemester = {
    ...raport,
    nilaiMapel: [...(raport.nilaiMapel || raport.nilaiMataPelajaran || [])],
  };
  normalizedInput.nilaiMataPelajaran = [...normalizedInput.nilaiMapel];

  const existingRaports = [...(siswa.nilaiRaport || []), ...((siswa as Siswa).raportSemester || [])];
  // Deduplikasi berdasar id / tahun+semester agar daftar gabungan tidak ganda.
  const seen = new Set<string>();
  const deduped: RaportSemester[] = [];
  for (const r of existingRaports) {
    const key = r?.id || `${r?.tahunAjaran}-${r?.semester}`;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    deduped.push(r);
  }
  const index = deduped.findIndex(
    (r) => r.id === normalizedInput.id || (r.tahunAjaran === normalizedInput.tahunAjaran && r.semester === normalizedInput.semester)
  );

  let updatedRaports: RaportSemester[];
  if (index >= 0) {
    updatedRaports = [...deduped];
    updatedRaports[index] = { ...normalizedInput };
  } else {
    updatedRaports = [...deduped, normalizedInput];
  }

  // Also sync or create corresponding entry in riwayatSemester
  const existingRiwayat = siswa.riwayatSemester || [];
  const riwayatIdx = existingRiwayat.findIndex(
    (r) => r.tahunAjaran === raport.tahunAjaran && r.semester === raport.semester
  );
  const riwayatItem: RiwayatSemester = {
    id: `rs-${raport.tahunAjaran.replace(/\//g, '-')}-${raport.semester}`,
    semester: raport.semester,
    tingkat: raport.tingkat,
    tahunAjaran: raport.tahunAjaran,
    sakit: raport.kehadiran?.sakit ?? 0,
    izin: raport.kehadiran?.izin ?? 0,
    alpa: raport.kehadiran?.alpa ?? 0,
    statusKenaikan: raport.statusKenaikan || 'Belum Ditentukan',
    catatanWaliKelas: raport.catatanWaliKelas || ''
  };

  let updatedRiwayat: RiwayatSemester[];
  if (riwayatIdx >= 0) {
    updatedRiwayat = [...existingRiwayat];
    updatedRiwayat[riwayatIdx] = riwayatItem;
  } else {
    updatedRiwayat = [...existingRiwayat, riwayatItem];
  }

  await saveSiswa({
    ...siswa,
    nilaiRaport: updatedRaports,
    raportSemester: updatedRaports,
    riwayatSemester: updatedRiwayat
  });
}

export async function deleteSiswaRaport(siswaId: string, raportId: string): Promise<void> {
  const siswa = await getSiswaById(siswaId);
  if (!siswa) return;
  const updatedRaports = (siswa.nilaiRaport || []).filter((r) => r.id !== raportId);
  await saveSiswa({
    ...siswa,
    nilaiRaport: updatedRaports,
    raportSemester: updatedRaports
  });
}

/** Ambil tingkat aktif siswa dari rombel saat ini, fallback ke riwayat terakhir. */
export function getTingkatAktifSiswa(s: Siswa): TingkatKelas {
  const fromRombel = (s.rombelSaatIni || '').trim().charAt(0);
  if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(fromRombel)) {
    return fromRombel as TingkatKelas;
  }
  const allRaports = [...(s.nilaiRaport || []), ...(s.raportSemester || [])];
  const lastRaport = allRaports[allRaports.length - 1];
  if (lastRaport?.tingkat) return lastRaport.tingkat;
  const lastRiwayat = (s.riwayatSemester || [])[(s.riwayatSemester || []).length - 1];
  if (lastRiwayat?.tingkat) return lastRiwayat.tingkat;
  return s.diterimaDiTingkat;
}

/** Ambil tahun ajaran terakhir yang tercatat pada siswa. */
export function getTahunAjaranTerakhirSiswa(s: Siswa): string {
  const allRaports = [...(s.nilaiRaport || []), ...(s.raportSemester || [])];
  const lastRaport = allRaports[allRaports.length - 1];
  if (lastRaport?.tahunAjaran) return lastRaport.tahunAjaran;
  const lastRiwayat = (s.riwayatSemester || [])[(s.riwayatSemester || []).length - 1];
  if (lastRiwayat?.tahunAjaran) return lastRiwayat.tahunAjaran;
  const lastHistory = (s.riwayatTahunAjaran || [])[(s.riwayatTahunAjaran || []).length - 1];
  if (lastHistory?.tahunAjaran) return lastHistory.tahunAjaran;
  return '';
}

/** F1 — Tahun ajaran SEBELUM tahun tujuan (format TAHUN/TAHUN).
 *  Dipakai pemanggil promosi agar baris riwayat memakai tahun sesi promosi
 *  yang sedang berjalan (tahun yang ditutup), bukan tebakan dari data terakhir
 *  yang rusak pada promosi beruntun. '' bila format tak valid. */
export function tahunAjaranSebelumnya(tahunAjaran: string): string {
  const m = /^(\d{4})\/(\d{4})$/.exec(String(tahunAjaran || '').trim());
  if (!m) return '';
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (b !== a + 1) return '';
  return `${a - 1}/${a}`;
}

export async function promoteSiswaKenaikanKelas(
  siswaIds: string[],
  nextTahunAjaran: string,
  nextTingkat: TingkatKelas,
  nextRombel: string,
  status: 'Naik Kelas' | 'Lulus' | 'Tinggal di Kelas' = 'Naik Kelas',
  // F1: tahun sesi promosi yang sedang berjalan (tahun yang DITUTUP), dipakai
  // sebagai tahunLama baris riwayat. WAJIB diisi pemanggil agar promosi
  // beruntun tak menulis dua baris riwayat dengan tahunAjaran yang sama:
  //  - pemanggil tutup-tahun massal: teruskan tahun yang ditutup (args.tahunTutup);
  //  - pemanggil promosi manual: teruskan tahunAjaranSebelumnya(targetTahun).
  // Bila kosong, perilaku lama dipakai (tebakan getTahunAjaranTerakhirSiswa).
  tahunSesiLama?: string
): Promise<number> {
  let count = 0;
  const nowIso = new Date().toISOString();
  for (const id of siswaIds) {
    const s = await getSiswaById(id);
    if (!s) continue;

    // Tingkat & rombel SEBELUM promosi (riwayat harus mencatat kondisi lama,
    // bukan diterimaDiTingkat yang bisa sudah bertahun-tahun lalu).
    const tingkatLama = getTingkatAktifSiswa(s);
    const rombelLama = s.rombelSaatIni;
    // F1: tahunLama = tahun sesi promosi yang sedang berjalan (eksplisit),
    // bukan tebakan dari raport/riwayat terakhir.
    const tahunLama = (tahunSesiLama || '').trim() || getTahunAjaranTerakhirSiswa(s) || nextTahunAjaran;

    const existingHistory = s.riwayatTahunAjaran || [];
    const prevYearHistory = {
      id: `rth-${Date.now()}-${s.id}-${count}`,
      tahunAjaran: tahunLama,
      tingkat: tingkatLama,
      rombel: rombelLama,
      statusAkhirTahun: status,
      statusKenaikan: status,
      catatan: `Kenaikan ke rombel ${nextRombel} TP ${nextTahunAjaran}`
    };

    const updatedSiswa: Siswa = {
      ...s,
      rombelSaatIni: status === 'Lulus' ? s.rombelSaatIni : nextRombel,
      statusSiswa: status === 'Lulus' ? 'Lulus' : 'Aktif',
      riwayatTahunAjaran: [...existingHistory, prevYearHistory],
      updatedAt: nowIso
    };

    await saveSiswa(updatedSiswa);
    count++;
  }
  return count;
}

// ---------------- SEKOLAH PROFILE ----------------

export async function getSekolahProfile(): Promise<SekolahProfile> {
  if (pakaiServer()) {
    return (await api.ambilProfilDariServer<SekolahProfile>()) ?? { ...defaultSekolahProfile };
  }
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.SEKOLAH, 'readonly');
      const store = tx.objectStore(STORES.SEKOLAH);
      const req = store.get('main');
      req.onsuccess = () => {
        if (req.result) {
          const { id: _, ...rest } = req.result;
          resolve(rest);
        } else {
          resolve(defaultSekolahProfile);
        }
      };
      req.onerror = () => resolve(defaultSekolahProfile);
    });
  } catch {
    const raw = localStorage.getItem(sk(LS_KEYS.SEKOLAH));
    return raw ? JSON.parse(raw) : { ...defaultSekolahProfile };
  }
}

export async function saveSekolahProfile(profile: SekolahProfile): Promise<void> {
  if (pakaiServer()) {
    await api.simpanProfilKeServer(profile);
    return;
  }
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SEKOLAH, 'readwrite');
      const store = tx.objectStore(STORES.SEKOLAH);
      const req = store.put({ id: 'main', ...profile });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    localStorage.setItem(sk(LS_KEYS.SEKOLAH), JSON.stringify(profile));
  }
}

// ---------------- DAPODIK CONFIG ----------------

export async function getDapodikConfig(): Promise<DapodikConfig> {
  if (pakaiServer()) {
    return (await api.ambilConfigDariServer<DapodikConfig>('dapodik')) ?? { ...defaultDapodikConfig };
  }
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.CONFIG, 'readonly');
      const store = tx.objectStore(STORES.CONFIG);
      const req = store.get('main');
      req.onsuccess = () => {
        if (req.result) {
          const { id: _, ...rest } = req.result;
          resolve(rest);
        } else {
          resolve(defaultDapodikConfig);
        }
      };
      req.onerror = () => resolve(defaultDapodikConfig);
    });
  } catch {
    const raw = localStorage.getItem(sk(LS_KEYS.CONFIG));
    return raw ? JSON.parse(raw) : { ...defaultDapodikConfig };
  }
}

export async function saveDapodikConfig(cfg: DapodikConfig): Promise<void> {
  if (pakaiServer()) {
    await api.simpanConfigKeServer('dapodik', cfg);
    return;
  }
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.CONFIG, 'readwrite');
      const store = tx.objectStore(STORES.CONFIG);
      const req = store.put({ id: 'main', ...cfg });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    localStorage.setItem(sk(LS_KEYS.CONFIG), JSON.stringify(cfg));
  }
}

// ---------------- SYNC LOGS ----------------

export async function getSyncLogs(): Promise<DapodikSyncLog[]> {
  if (pakaiServer()) {
    const rows = await api.ambilKoleksiDariServer<DapodikSyncLog>('sync_logs');
    return rows.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.LOGS, 'readonly');
      const store = tx.objectStore(STORES.LOGS);
      const req = store.getAll();
      req.onsuccess = () => {
        const sorted = (req.result || []).sort(
          (a: DapodikSyncLog, b: DapodikSyncLog) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        resolve(sorted);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    const raw = localStorage.getItem(sk(LS_KEYS.LOGS));
    return raw ? JSON.parse(raw) : [];
  }
}

export async function addSyncLog(log: DapodikSyncLog): Promise<void> {
  if (pakaiServer()) {
    await api.simpanKoleksiSatuKeServer('sync_logs', log);
    return;
  }
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.LOGS, 'readwrite');
      const store = tx.objectStore(STORES.LOGS);
      const req = store.put(log);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    const logs = await getSyncLogs();
    logs.unshift(log);
    localStorage.setItem(sk(LS_KEYS.LOGS), JSON.stringify(logs.slice(0, 100)));
  }
}

// ---------------- AUDIT LOG (jejak siapa-ubah-apa, maks 2000 entri) ----------------

const AUDIT_MAX = 2000;
const AUDIT_LS_MIRROR_MAX = 300;

export async function getAuditLogs(limit = 500): Promise<AuditLog[]> {
  if (pakaiServer()) {
    const rows = await api.ambilKoleksiDariServer<AuditLog>('audit_logs');
    return rows
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, Math.max(1, limit));
  }
  try {
    const db = await openDB();
    const rows: AuditLog[] = await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORES.AUDIT, 'readonly');
        const req = tx.objectStore(STORES.AUDIT).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
    const sorted = rows.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return sorted.slice(0, Math.max(1, limit));
  } catch {
    try {
      const raw = localStorage.getItem(sk(LS_KEYS.AUDIT));
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(0, Math.max(1, limit)) : [];
    } catch {
      return [];
    }
  }
}

export async function addAuditLog(entry: AuditLog): Promise<void> {
  if (pakaiServer()) {
    await api.simpanKoleksiSatuKeServer('audit_logs', entry);
    return;
  }
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(STORES.AUDIT, 'readwrite');
        const store = tx.objectStore(STORES.AUDIT);
        const putReq = store.put(entry);
        putReq.onerror = () => reject(putReq.error);
        // Pangkas entri tertua melampaui batas (cursor timestamp ascending).
        putReq.onsuccess = () => {
          try {
            const idx = store.index('timestamp');
            const countReq = store.count();
            countReq.onsuccess = () => {
              const over = (countReq.result || 0) - AUDIT_MAX;
              if (over <= 0) return resolve();
              let deleted = 0;
              const cur = idx.openCursor();
              cur.onsuccess = () => {
                const c = cur.result;
                if (c && deleted < over) {
                  deleted++;
                  c.delete();
                  c.continue();
                } else {
                  resolve();
                }
              };
              cur.onerror = () => resolve();
            };
            countReq.onerror = () => resolve();
          } catch {
            resolve();
          }
        };
      } catch (e) {
        reject(e);
      }
    });
  } catch {
    /* IDB gagal — lanjut ke cermin LS di bawah */
  }
  try {
    const raw = localStorage.getItem(sk(LS_KEYS.AUDIT));
    const parsed = raw ? JSON.parse(raw) : [];
    const list: AuditLog[] = Array.isArray(parsed) ? parsed : [];
    const idxLama = list.findIndex((l) => l && l.id === entry.id);
    if (idxLama >= 0) list.splice(idxLama, 1);
    list.unshift(entry);
    localStorage.setItem(sk(LS_KEYS.AUDIT), JSON.stringify(list.slice(0, AUDIT_LS_MIRROR_MAX)));
  } catch {
    /* abaikan */
  }
}

// Audit log append-only: tidak ada API penghapusan entri individual.

// ---------------- CADANGAN OTOMATIS (snapshot di IndexedDB, maks 5) ----------------

const AUTOBACKUP_KEEP = 5;

export async function getAutoSnapshots(): Promise<AutoBackupSnapshot[]> {
  if (pakaiServer()) {
    // S4: snapshot adalah BERKAS .db di server. payload dikosongkan —
    // pemulihan berjalan lewat endpoint pulihkan berkas (lihat modul
    // Backup), bukan lewat impor payload.
    const daftar = await api.daftarSnapshotBerkasServer();
    return daftar.map((s) => ({
      id: s.nama,
      timestamp: s.dibuatPada,
      dibuatOleh: s.label,
      ukuranBytes: s.ukuran,
      jumlahSiswa: s.hitungan?.siswa ?? 0,
      payload: '',
    }));
  }
  try {
    const db = await openDB();
    const rows: AutoBackupSnapshot[] = await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORES.AUTOBACKUP, 'readonly');
        const req = tx.objectStore(STORES.AUTOBACKUP).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
    return rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch {
    return [];
  }
}

export async function saveAutoSnapshot(snap: AutoBackupSnapshot): Promise<void> {
  if (pakaiServer()) {
    await api.buatSnapshotBerkasServer(snap.dibuatOleh || 'manual');
    return;
  }
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.AUTOBACKUP, 'readwrite');
      const store = tx.objectStore(STORES.AUTOBACKUP);
      const putReq = store.put(snap);
      putReq.onerror = () => reject(putReq.error);
      putReq.onsuccess = () => {
        // Pertahankan hanya N terbaru — KECUALI snapshot pengaman pra-restore
        // (Issue #10): snapshot pengaman tidak pernah digusur penjadwal
        // otomatis; hanya snapshot pengaman terbaru yang dipertahankan
        // (dikelola simpanSnapshotPengaman).
        try {
          const allReq = store.getAll();
          allReq.onsuccess = () => {
            const rows: AutoBackupSnapshot[] = (allReq.result || []).sort(
              (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
            const extra = rows.filter((r) => r.dibuatOleh !== PENGAMAN_RESTORE_OLEH).slice(AUTOBACKUP_KEEP);
            if (extra.length === 0) return resolve();
            let done = 0;
            for (const r of extra) {
              const del = store.delete(r.id);
              del.onsuccess = del.onerror = () => {
                done++;
                if (done >= extra.length) resolve();
              };
            }
          };
          allReq.onerror = () => resolve();
        } catch {
          resolve();
        }
      };
    } catch (e) {
      reject(e);
    }
  });
}

export async function deleteAutoSnapshot(id: string): Promise<void> {
  if (pakaiServer()) {
    await api.hapusSnapshotBerkasServer(id);
    return;
  }
  const db = await openDB();
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORES.AUTOBACKUP, 'readwrite');
      const req = tx.objectStore(STORES.AUTOBACKUP).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Issue #10 — simpan snapshot pengaman kondisi saat ini. Hanya snapshot
 * pengaman TERBARU yang dipertahankan (yang lama dihapus dulu), dan snapshot
 * pengaman tidak pernah digusur pruning snapshot otomatis (lihat
 * saveAutoSnapshot). Mengembalikan id snapshot.
 */
export async function simpanSnapshotPengaman(payload: string, jumlahSiswa: number): Promise<string> {
  const timestamp = new Date().toISOString();
  const id = `pengaman-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const lama = (await getAutoSnapshots()).filter((s) => s.dibuatOleh === PENGAMAN_RESTORE_OLEH);
  for (const s of lama) {
    try {
      await deleteAutoSnapshot(s.id);
    } catch {
      /* lanjut — snapshot lama yang gagal dihapus tidak menggagalkan pengaman baru */
    }
  }
  await saveAutoSnapshot({
    id,
    timestamp,
    dibuatOleh: PENGAMAN_RESTORE_OLEH,
    ukuranBytes: new Blob([payload]).size,
    jumlahSiswa,
    payload,
  });
  return id;
}

// ---------------- ARSIP TAHUN AJARAN (tutup tahun, terkunci) ----------------

export async function getTutupTahun(): Promise<TutupTahunAjaran[]> {
  if (pakaiServer()) {
    const rows = await api.ambilKoleksiDariServer<TutupTahunAjaran>('tutup_tahun');
    return rows.sort((a, b) => b.tahunAjaran.localeCompare(a.tahunAjaran));
  }
  try {
    const db = await openDB();
    const rows: TutupTahunAjaran[] = await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORES.TUTUP, 'readonly');
        const req = tx.objectStore(STORES.TUTUP).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
    if (rows.length > 0) return rows.sort((a, b) => b.tahunAjaran.localeCompare(a.tahunAjaran));
    try {
      const raw = localStorage.getItem(sk(LS_KEYS.TUTUP));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      /* abaikan */
    }
    return (memFallback.get(memKey(STORES.TUTUP)) as TutupTahunAjaran[]) || [];
  } catch {
    try {
      const raw = localStorage.getItem(sk(LS_KEYS.TUTUP));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      /* abaikan */
    }
    return (memFallback.get(memKey(STORES.TUTUP)) as TutupTahunAjaran[]) || [];
  }
}

export async function saveTutupTahun(entry: TutupTahunAjaran): Promise<void> {
  const normalized: TutupTahunAjaran = { ...entry, tahunAjaran: entry.tahunAjaran.trim() };
  if (!normalized.tahunAjaran) throw new Error('Tahun ajaran arsip wajib diisi.');
  if (pakaiServer()) {
    await api.simpanKoleksiSatuKeServer('tutup_tahun', normalized);
    return;
  }
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORES.TUTUP, 'readwrite');
      tx.objectStore(STORES.TUTUP).put(normalized);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* lanjut ke fallback */
  }
  try {
    const list = await getTutupTahun();
    const idx = list.findIndex((t) => t.tahunAjaran === normalized.tahunAjaran);
    if (idx >= 0) list[idx] = normalized;
    else list.push(normalized);
    list.sort((a, b) => b.tahunAjaran.localeCompare(a.tahunAjaran));
    localStorage.setItem(sk(LS_KEYS.TUTUP), JSON.stringify(list));
  } catch {
    /* abaikan */
  }
  memFallback.set(memKey(STORES.TUTUP), await getTutupTahun().catch(() => [normalized]));
}

/** Buka kunci tahun ajaran (pembatalan administratif; TIDAK mengembalikan
 *  promosi/rombel — perbaiki manual bila perlu). */
export async function deleteTutupTahun(tahunAjaran: string): Promise<void> {
  if (pakaiServer()) {
    await api.hapusKoleksiDariServer('tutup_tahun', tahunAjaran);
    return;
  }
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORES.TUTUP, 'readwrite');
      tx.objectStore(STORES.TUTUP).delete(tahunAjaran);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* lanjut ke fallback */
  }
  try {
    const list = (await getTutupTahun()).filter((t) => t.tahunAjaran !== tahunAjaran);
    localStorage.setItem(sk(LS_KEYS.TUTUP), JSON.stringify(list));
    memFallback.set(memKey(STORES.TUTUP), list);
  } catch {
    /* abaikan */
  }
}

// ---------------- PEMETAAN KELAS PER TAHUN AJARAN ----------------

export function getAllPetaKelas(): Promise<PetaKelas[]> {
  if (pakaiServer()) return api.ambilKoleksiDariServer<PetaKelas>('peta_kelas');
  return getAllFromStore<PetaKelas>(STORES.PETA, sk(LS_KEYS.PETA));
}

export function savePetaKelasList(items: PetaKelas[]): Promise<void> {
  if (pakaiServer()) return api.gantiKoleksiDiServer('peta_kelas', items);
  return putAllToStore<PetaKelas>(STORES.PETA, sk(LS_KEYS.PETA), items);
}

/** Simpan satu baris pemetaan (tambah/edit). */
export function savePetaKelas(item: PetaKelas): Promise<void> {
  const normalized: PetaKelas = {
    ...item,
    id: item.id || `peta-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    tahunAjaran: (item.tahunAjaran || '').trim(),
    tingkat: item.tingkat,
    rombel: (item.rombel || '').trim().toUpperCase(),
    waliKelas: (item.waliKelas || '').trim().toUpperCase(),
    source: item.source || 'manual',
    anggotaIds: Array.isArray(item.anggotaIds) ? [...item.anggotaIds] : undefined,
    updatedAt: new Date().toISOString(),
  };
  if (!normalized.tahunAjaran) return Promise.reject(new Error('Tahun ajaran wajib diisi.'));
  if (!normalized.rombel) return Promise.reject(new Error('Nama rombel wajib diisi.'));
  if (pakaiServer()) return api.simpanKoleksiSatuKeServer('peta_kelas', normalized);
  return putAllToStore<PetaKelas>(STORES.PETA, sk(LS_KEYS.PETA), [normalized]);
}

/** Hapus satu baris pemetaan dari IndexedDB + cache localStorage. */
export async function deletePetaKelas(id: string): Promise<void> {
  if (pakaiServer()) {
    await api.hapusKoleksiDariServer('peta_kelas', id);
    return;
  }
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORES.PETA, 'readwrite');
      tx.objectStore(STORES.PETA).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* IndexedDB tidak tersedia — lanjut ke localStorage */
  }
  try {
    const raw = localStorage.getItem(sk(LS_KEYS.PETA));
    if (raw) {
      const list: PetaKelas[] = JSON.parse(raw);
      localStorage.setItem(sk(LS_KEYS.PETA), JSON.stringify(list.filter((p) => p.id !== id)));
    }
  } catch {
    /* abaikan */
  }
  const mem = memFallback.get(memKey(STORES.PETA)) as PetaKelas[] | undefined;
  if (mem) memFallback.set(memKey(STORES.PETA), mem.filter((p) => p.id !== id));
}

// ---------------- ROMBEL & PTK REFERENCE (hasil sinkron Dapodik) ----------------

// Cache memori sesi — penyelamat bila IndexedDB DAN localStorage sama-sama
// tidak tersedia (mis. iframe sandbox ketat). Tanpa ini, sinkronisasi
// dilaporkan "berhasil" padahal data hilang dan modul GTK tetap kosong.
const memFallback = new Map<string, unknown[]>();

/** Kunci cache memori selalu mencakup database aktif (isolasi antar-sekolah). */
function memKey(storeName: string): string {
  return `${activeDbName}::${storeName}`;
}

async function getAllFromStore<T>(storeName: string, lsKey: string): Promise<T[]> {
  // D5: baca IndexedDB gagal karena ERROR (req.onerror / throw sinkron) BUKAN
  // berarti data kosong — selalu fallback ke localStorage ter-scope (lsKey
  // sudah di-scope per sekolah oleh pemanggil via sk()), lalu memori sesi.
  // Tidak pernah mengembalikan data contoh/akun default dari sini.
  try {
    const db = await openDB();
    const fromIdb: T[] = await new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
    if (fromIdb.length > 0) return fromIdb;
    // IndexedDB kosong — coba localStorage, lalu memori sesi.
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      /* lanjut ke memori */
    }
    return (memFallback.get(memKey(storeName)) as T[]) || [];
  } catch {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      /* lanjut ke memori */
    }
    return (memFallback.get(memKey(storeName)) as T[]) || [];
  }
}

async function putAllToStore<T extends { id: string }>(
  storeName: string,
  lsKey: string,
  items: T[]
): Promise<void> {
  // Gabungkan dengan cache localStorage dulu (satu kali baca),
  // lalu tulis ke IndexedDB + localStorage secara konsisten.
  let merged: T[];
  try {
    const raw = localStorage.getItem(lsKey);
    const cached: T[] = raw ? JSON.parse(raw) : [];
    const map = new Map<string, T>();
    for (const e of cached) map.set(e.id, e);
    for (const item of items) map.set(item.id, item);
    merged = [...map.values()];
  } catch {
    merged = [...items];
  }

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      // Tulis hasil gabungan (merged) agar IndexedDB konsisten dengan localStorage.
      for (const item of merged) store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB tidak tersedia (mis. iframe sandbox) — localStorage jadi sumber utama.
  }

  try {
    localStorage.setItem(lsKey, JSON.stringify(merged));
  } catch {
    /* abaikan kegagalan penyimpanan lokal */
  }

  // Selalu cerminkan ke memori sesi agar data tidak hilang bila
  // IndexedDB + localStorage sama-sama tidak tersedia.
  memFallback.set(memKey(storeName), merged);
}

export function getAllRombelRefs(): Promise<RombelRef[]> {
  if (pakaiServer()) return api.ambilKoleksiDariServer<RombelRef>('rombel');
  return getAllFromStore<RombelRef>(STORES.ROMBEL, sk(LS_KEYS.ROMBEL));
}

export function saveRombelRefs(items: RombelRef[]): Promise<void> {
  if (pakaiServer()) return api.gantiKoleksiDiServer('rombel', items);
  return putAllToStore<RombelRef>(STORES.ROMBEL, sk(LS_KEYS.ROMBEL), items);
}

export function getAllPtkRefs(): Promise<PtkRef[]> {
  if (pakaiServer()) return api.ambilKoleksiDariServer<PtkRef>('ptk');
  return getAllFromStore<PtkRef>(STORES.PTK, sk(LS_KEYS.PTK));
}

export function savePtkRefs(items: PtkRef[]): Promise<void> {
  if (pakaiServer()) return api.gantiKoleksiDiServer('ptk', items);
  return putAllToStore<PtkRef>(STORES.PTK, sk(LS_KEYS.PTK), items);
}

/** Simpan satu GTK (tambah/edit manual) — menandai source 'manual' bila baru. */
export function savePtkRef(item: PtkRef): Promise<void> {
  const normalized: PtkRef = {
    ...item,
    id: item.id || `ptk-manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    source: item.source || 'manual',
    updatedAt: new Date().toISOString(),
  };
  if (pakaiServer()) return api.simpanKoleksiSatuKeServer('ptk', normalized);
  return putAllToStore<PtkRef>(STORES.PTK, sk(LS_KEYS.PTK), [normalized]);
}

/** Hapus satu GTK dari IndexedDB + cache localStorage. */
export async function deletePtkRef(id: string): Promise<void> {
  if (pakaiServer()) {
    await api.hapusKoleksiDariServer('ptk', id);
    return;
  }
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORES.PTK, 'readwrite');
      tx.objectStore(STORES.PTK).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* IndexedDB tidak tersedia — lanjut ke localStorage */
  }
  try {
    const raw = localStorage.getItem(sk(LS_KEYS.PTK));
    if (raw) {
      const list: PtkRef[] = JSON.parse(raw);
      localStorage.setItem(sk(LS_KEYS.PTK), JSON.stringify(list.filter((p) => p.id !== id)));
    }
  } catch {
    /* abaikan */
  }
  const mem = memFallback.get(memKey(STORES.PTK)) as PtkRef[] | undefined;
  if (mem) memFallback.set(memKey(STORES.PTK), mem.filter((p) => p.id !== id));
}

// ---------------- USER CRUD & AUTH ----------------

/** D5 — Baca daftar user dari cache localStorage ter-scope.
 *  Dipakai saat baca IndexedDB gagal karena ERROR. Cache kosong → [].
 *  JANGAN kembalikan initialUsersList di sini: akun default
 *  (administrator/operator123) yang muncul saat IDB error adalah bug keamanan. */
function readUsersFromScopedLS(): AppUser[] {
  try {
    const raw = localStorage.getItem(sk(LS_KEYS.USERS));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as AppUser[];
    }
  } catch {
    /* abaikan — kembalikan [] */
  }
  return [];
}

export async function getAllUsers(): Promise<AppUser[]> {
  if (pakaiServer()) return api.ambilUsersDariServer<AppUser>();
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.USERS, 'readonly');
      const store = tx.objectStore(STORES.USERS);
      const req = store.getAll();
      req.onsuccess = () => {
        const users: AppUser[] = req.result || [];
        if (users.length === 0) {
          // Database benar-benar kosong (pra-seed): akun bawaan agar admin
          // bisa login pertama kali. BUKAN fallback saat IDB error.
          resolve(initialUsersList);
        } else {
          resolve(users);
        }
      };
      // D5: IDB error → fallback ke localStorage ter-scope, bukan akun default.
      req.onerror = () => resolve(readUsersFromScopedLS());
    });
  } catch {
    // D5: openDB gagal → fallback ke localStorage ter-scope; kosong → [].
    return readUsersFromScopedLS();
  }
}

export async function saveUser(user: AppUser): Promise<void> {
  if (pakaiServer()) {
    await api.simpanUserKeServer(user);
    return;
  }
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.USERS, 'readwrite');
      const store = tx.objectStore(STORES.USERS);
      const req = store.put(user);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // fallback
  } finally {
    const users = await getAllUsers();
    const idx = users.findIndex((u) => u.id === user.id);
    if (idx >= 0) {
      users[idx] = user;
    } else {
      users.push(user);
    }
    localStorage.setItem(sk(LS_KEYS.USERS), JSON.stringify(users));
  }
}

/**
 * Migrasi satu-kali password legacy (plaintext) ke hash.
 * Dijalankan saat boot (`initStorage`) dan setelah restore backup lama.
 * Mengembalikan jumlah akun yang dimigrasi. Idempoten & aman dipanggil ulang.
 */
export async function migrateUserPasswordsToHash(): Promise<number> {
  const users = await getAllUsers();
  let migrated = 0;
  for (const u of users) {
    if (u && u.password && !isHashedPassword(u.password)) {
      try {
        await saveUser({ ...u, password: await hashPassword(u.password) });
        migrated++;
      } catch {
        /* lanjutkan akun berikutnya */
      }
    }
  }
  return migrated;
}

export async function deleteUser(id: string): Promise<void> {
  if (pakaiServer()) {
    await api.hapusUserDariServer(id);
    return;
  }
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORES.USERS, 'readwrite');
      const store = tx.objectStore(STORES.USERS);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // fallback
  } finally {
    const users = await getAllUsers();
    const filtered = users.filter((u) => u.id !== id);
    localStorage.setItem(sk(LS_KEYS.USERS), JSON.stringify(filtered));
  }
}

export function getCurrentUserSession(): AppUser | null {
  try {
    const raw = localStorage.getItem(LS_KEYS.CURRENT_USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCurrentUserSession(user: AppUser | null): void {
  if (user) {
    // Jangan simpan hash kata sandi di sesi — tidak pernah dibaca dari sini.
    const { password: _pw, ...tanpaPassword } = user;
    localStorage.setItem(LS_KEYS.CURRENT_USER, JSON.stringify(tanpaPassword));
  } else {
    localStorage.removeItem(LS_KEYS.CURRENT_USER);
  }
}

export function getImpersonateSession(): AppUser | null {
  try {
    const raw = localStorage.getItem(LS_KEYS.IMPERSONATE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setImpersonateSession(adminUser: AppUser | null, targetOperator?: AppUser): void {
  if (adminUser) {
    const { password: _pw, ...adminTanpaPassword } = adminUser;
    localStorage.setItem(LS_KEYS.IMPERSONATE, JSON.stringify(adminTanpaPassword));
    if (targetOperator) {
      setCurrentUserSession(targetOperator);
    }
  } else {
    localStorage.removeItem(LS_KEYS.IMPERSONATE);
  }
}

export function clearImpersonateSession(): void {
  localStorage.removeItem(LS_KEYS.IMPERSONATE);
}

export function clearCurrentUserSession(): void {
  localStorage.removeItem(LS_KEYS.CURRENT_USER);
}

/** Tahun ajaran sesi login (dipilih saat login, dibatasi tahunAkses user). */
export function getSessionTahunAjaran(): string | null {
  try {
    const v = (localStorage.getItem(LS_KEYS.SESSION_TAHUN) || '').trim();
    return v || null;
  } catch {
    return null;
  }
}

export function setSessionTahunAjaran(tahun: string | null): void {
  try {
    if (tahun && tahun.trim()) localStorage.setItem(LS_KEYS.SESSION_TAHUN, tahun.trim());
    else localStorage.removeItem(LS_KEYS.SESSION_TAHUN);
  } catch {
    /* abaikan */
  }
}

export function clearSessionTahunAjaran(): void {
  try {
    localStorage.removeItem(LS_KEYS.SESSION_TAHUN);
  } catch {
    /* abaikan */
  }
}

// ---------------- BACKUP & RESTORE ----------------

/** Issue #10 — nilai `dibuatOleh` snapshot pengaman pra-restore. */
export const PENGAMAN_RESTORE_OLEH = 'pengaman-restore';

/** Issue #10 — snapshot kondisi saat ini yang dibuat otomatis sebelum restore. */
export interface SnapshotPengaman {
  id: string;
  timestamp: string;
  jumlahSiswa: number;
  payload: string;
  /** Token lokal Dapodik untuk memulihkan konfigurasi persis setelah rollback. */
  tokenDapodikSebelumnya?: string;
}

/** D3 — Mode restore backup. */
export type RestoreMode = 'gabung' | 'ganti-total';

/** D3 — Opsi restore backup. */
export interface RestoreOptions {
  /** 'gabung' (default): upsert ke data yang ada. 'ganti-total': hapus dulu
   *  seluruh data sekolah aktif, lalu restore dari file. */
  mode?: RestoreMode;
  /** true = user mencentang "saya paham ini data sekolah lain" — mengizinkan
   *  restore file yang NPSN-nya berbeda dari sekolah aktif. */
  konfirmasiSekolahLain?: boolean;
  /** D15(a) — true = user secara eksplisit mengizinkan akun administrator
   *  yang sudah ada ditimpa oleh data dari file backup. Default (false):
   *  administrator yang sudah ada TIDAK PERNAH ditimpa backup. */
  konfirmasiTimpaAdmin?: boolean;
  /** Issue #10 (internal) — true = lewati pembuatan snapshot pengaman
   *  (dipakai jalur rollback, yang SUDAH memegang snapshot pengaman). */
  lewatiSnapshotPengaman?: boolean;
  /** Issue #10 (internal rollback) — hapus akun hasil restore gagal sebelum replay snapshot. */
  hapusPenggunaSaatRestore?: boolean;
}

/** Issue #10 — hasil verifikasi pasca-restore (jumlah/relasi). */
export interface VerifikasiRestore {
  ok: boolean;
  /** Jumlah siswa yang seharusnya ada setelah restore (memperhitungkan
   *  rekonsiliasi tombstone). */
  jumlahSiswaDiharapkan: number;
  /** Jumlah siswa yang benar-benar terbaca dari database setelah restore. */
  jumlahSiswaAktual: number;
  /** Id siswa yang diharapkan ada tetapi hilang setelah restore (maks 10). */
  idHilang: string[];
  /** true bila profil sekolah hasil restore cocok dengan NPSN file backup. */
  profilCocok: boolean;
  pesan: string;
}

/** Issue #10 — hasil upaya rollback ke snapshot pengaman. */
export interface RollbackRestore {
  dilakukan: boolean;
  berhasil?: boolean;
  pesan?: string;
}

/** D3 — Hasil restore yang jelas. Field success/message/count dipertahankan
 *  demi kompatibilitas pemanggil lama (BackupRestoreModule, PengaturanSekolahView). */
export interface RestoreResult {
  status: 'ditolak' | 'digabung' | 'diganti';
  alasan?: string;
  success: boolean;
  message: string;
  count: number;
  /** D15 — peringatan non-fatal selama restore (mis. admin dilewati,
   *  record yang tetap dipertahankan terhapus karena tombstone). */
  peringatan?: string[];
  /** Issue #10 — id snapshot pengaman kondisi sebelum restore (dapat
   *  dipulihkan manual dari daftar snapshot bila perlu). */
  snapshotPengamanId?: string;
  /** Issue #10 — hasil verifikasi jumlah/relasi pasca-restore. */
  verifikasi?: VerifikasiRestore;
  /** Issue #10 — hasil rollback otomatis bila restore / verifikasi gagal. */
  rollback?: RollbackRestore;
}

export interface BackupPayload {
  app: string;
  version: string;
  exportedAt: string;
  /** Issue #10 — blok integritas SHA-256 + jumlah record (dibuat saat ekspor).
   *  Backup lama tidak punya blok ini (diperlakukan sebagai 'tanpa-checksum'). */
  integritas?: IntegritasBackup;
  sekolah: SekolahProfile;
  dapodikConfig: DapodikConfig;
  siswa: Siswa[];
  syncLogs: DapodikSyncLog[];
  users?: AppUser[];
  rombel?: RombelRef[];
  ptk?: PtkRef[];
  tutupTahun?: TutupTahunAjaran[];
  petaKelas?: PetaKelas[];
  audit?: AuditLog[];
}

/** Baca satu store IndexedDB apa adanya (TANPA perutean server) — dipakai
 *  migrasi otomatis Fase S4 untuk membaca data lokal lama. */
async function bacaStoreMentah<T>(store: string): Promise<T[]> {
  try {
    const db = await openDB();
    return await new Promise<T[]>((resolve) => {
      try {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve((req.result || []) as T[]);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  } catch {
    return [];
  }
}

/** Rakit BackupPayload dari IndexedDB LOKAL apa adanya (mengabaikan mode
 *  server) — bahan impor migrasi otomatis instalasi lama ke server. */
export async function eksporDataLokalSaja(): Promise<BackupPayload> {
  const [siswa, users, rombel, ptk, petaKelas, tutupTahun, syncLogs, audit, profilMentah, configMentah] =
    await Promise.all([
      bacaStoreMentah<Siswa>(STORES.SISWA),
      bacaStoreMentah<AppUser>(STORES.USERS),
      getAllFromStore<RombelRef>(STORES.ROMBEL, sk(LS_KEYS.ROMBEL)),
      getAllFromStore<PtkRef>(STORES.PTK, sk(LS_KEYS.PTK)),
      getAllFromStore<PetaKelas>(STORES.PETA, sk(LS_KEYS.PETA)),
      bacaStoreMentah<TutupTahunAjaran>(STORES.TUTUP),
      bacaStoreMentah<DapodikSyncLog>(STORES.LOGS),
      bacaStoreMentah<AuditLog>(STORES.AUDIT),
      bacaStoreMentah<any>(STORES.SEKOLAH),
      bacaStoreMentah<any>(STORES.CONFIG),
    ]);
  const profilRow = (profilMentah as any[])[0];
  const { id: _abaikanP, ...profil } = profilRow || {};
  const configRow = (configMentah as any[])[0];
  const { id: _abaikanC, ...config } = configRow || {};
  return {
    app: 'BukuInduk_Merdeka',
    version: '2',
    exportedAt: new Date().toISOString(),
    sekolah: (profil && Object.keys(profil).length ? profil : defaultSekolahProfile) as SekolahProfile,
    dapodikConfig: (config && Object.keys(config).length ? config : defaultDapodikConfig) as DapodikConfig,
    siswa,
    syncLogs,
    users: users.length ? users : initialUsersList,
    rombel,
    ptk,
    tutupTahun,
    petaKelas,
    audit,
  };
}

export async function exportAllData(): Promise<string> {
  if (pakaiServer()) {
    return JSON.stringify(await api.ambilEksporDariServer(), null, 2);
  }
  const [siswa, sekolah, dapodikConfig, syncLogs, users, rombel, ptk, tutupTahun, petaKelas, audit] = await Promise.all([
    getAllSiswa(),
    getSekolahProfile(),
    getDapodikConfig(),
    getSyncLogs(),
    getAllUsers(),
    getAllRombelRefs(),
    getAllPtkRefs(),
    getTutupTahun(),
    getAllPetaKelas(),
    getAuditLogs(500)
  ]);

  const payload: BackupPayload = {
    app: 'Buku Induk Siswa Kurikulum Merdeka',
    // Issue #10 — versi format terpusat di backupIntegrity.BACKUP_FORMAT_VERSION.
    version: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    sekolah,
    // S7: token Web Service Dapodik TIDAK ikut ke file backup. Token tersimpan
    // plaintext di perangkat; membawanya ke file JSON (yang bisa diunduh /
    // diunggah ke Drive / dibagikan) sama dengan membocorkan kredensial Web
    // Service sekolah. Setelah restore, operator memasukkan ulang token di
    // menu Sinkronisasi Dapodik.
    dapodikConfig: { ...dapodikConfig, token: '' },
    siswa,
    syncLogs,
    users,
    rombel,
    ptk,
    tutupTahun,
    petaKelas,
    audit
  };

  // Issue #10 — tempelkan blok integritas (checksum SHA-256 + jumlah record)
  // agar restore dapat membuktikan file tidak rusak/diubah. Bila WebCrypto
  // tidak tersedia, ekspor tetap berjalan tanpa blok (restore akan memberi
  // peringatan 'tanpa-checksum') — ekspor tidak boleh gagal hanya karena itu.
  try {
    return JSON.stringify(await tambahIntegritas(payload), null, 2);
  } catch {
    return JSON.stringify(payload, null, 2);
  }
}

/**
 * Issue #10 — verifikasi pasca-restore: baca ulang database dan bandingkan
 * dengan yang diharapkan (id backup ∪ id sebelumnya, dikurangi yang
 * dihapus-ulang tombstone). Juga cek profil sekolah cocok dengan NPSN backup.
 * Mengembalikan ok=false bila ada id hilang, jumlah tidak cocok, atau profil
 * tidak cocok — pemanggil lalu me-rollback.
 */
async function verifikasiPascaRestore(
  data: BackupPayload,
  mode: RestoreMode,
  idSebelumnya: Set<string>,
  siswaTombDihapus: string[]
): Promise<VerifikasiRestore> {
  const sesudah = await getAllSiswa();
  const idSesudah = new Set(sesudah.map((s) => s.id));
  const diharapkan = new Set<string>();
  if (mode !== 'ganti-total') {
    idSebelumnya.forEach((id) => diharapkan.add(id));
  }
  for (const s of data.siswa) {
    if (s?.id) diharapkan.add(s.id);
  }
  for (const id of siswaTombDihapus) diharapkan.delete(id);
  const idHilang = [...diharapkan].filter((id) => !idSesudah.has(id)).slice(0, 10);
  let profilCocok = true;
  const npsnBackup = String(data.sekolah?.npsn || '').trim();
  if (npsnBackup) {
    try {
      profilCocok = String((await getSekolahProfile())?.npsn || '').trim() === npsnBackup;
    } catch {
      profilCocok = false;
    }
  }
  const ok = idHilang.length === 0 && sesudah.length === diharapkan.size && profilCocok;
  const pesan =
    `Verifikasi: ${sesudah.length}/${diharapkan.size} siswa hadir` +
    (idHilang.length > 0 ? `; ${idHilang.length} id hilang` : '') +
    (profilCocok ? '; profil sekolah cocok.' : '; profil sekolah TIDAK cocok dengan file backup.');
  return {
    ok,
    jumlahSiswaDiharapkan: diharapkan.size,
    jumlahSiswaAktual: sesudah.length,
    idHilang,
    profilCocok,
    pesan,
  };
}

/**
 * Issue #10 — rollback ke snapshot pengaman: pulihkan kondisi sebelum restore
 * dengan restore 'ganti-total' dari payload pengaman (tanpa membuat snapshot
 * pengaman baru — jalur ini SUDAH memegang snapshotnya), lalu simpan ulang
 * record snapshot pengaman (clearDatabase di dalamnya ikut menghapus store
 * snapshot). Mengembalikan hasil rollback untuk dilaporkan ke user.
 */
async function cobaRollback(pengaman: SnapshotPengaman | undefined): Promise<RollbackRestore> {
  if (!pengaman) {
    return { dilakukan: false, pesan: 'Tidak ada snapshot pengaman untuk rollback.' };
  }
  try {
    const hasil = await importBackupData(pengaman.payload, {
      mode: 'ganti-total',
      lewatiSnapshotPengaman: true,
      konfirmasiSekolahLain: true,
      hapusPenggunaSaatRestore: true,
    });
    // Token sengaja tidak pernah dimasukkan ke file/snapshot JSON yang dapat
    // diunduh. Simpan token lokal lama di state rollback dan pulihkan setelah
    // payload snapshot yang sudah disanitasi selesai direplay.
    if (hasil.success && pengaman.tokenDapodikSebelumnya !== undefined) {
      const cfg = await getDapodikConfig();
      await saveDapodikConfig({ ...cfg, token: pengaman.tokenDapodikSebelumnya });
    }
    try {
      await saveAutoSnapshot({
        id: pengaman.id,
        timestamp: pengaman.timestamp,
        dibuatOleh: PENGAMAN_RESTORE_OLEH,
        ukuranBytes: new Blob([pengaman.payload]).size,
        jumlahSiswa: pengaman.jumlahSiswa,
        payload: pengaman.payload,
      });
    } catch {
      /* record snapshot hilang, tetapi data sudah dipulihkan */
    }
    if (hasil.success) {
      return {
        dilakukan: true,
        berhasil: true,
        pesan: 'Kondisi sebelum restore berhasil dipulihkan dari snapshot pengaman.',
      };
    }
    return {
      dilakukan: true,
      berhasil: false,
      pesan:
        `Rollback berjalan tetapi verifikasi kondisi tidak cocok (${hasil.message}). ` +
        'Pulihkan manual dari snapshot pengaman di daftar snapshot bila perlu.',
    };
  } catch (e) {
    return {
      dilakukan: true,
      berhasil: false,
      pesan:
        `Rollback GAGAL (${e instanceof Error ? e.message : String(e)}). ` +
        'Data mungkin parsial — pulihkan manual dari snapshot pengaman di daftar snapshot.',
    };
  }
}

/**
 * D3 — Restore file backup JSON.
 * - mode 'gabung' (default): perilaku lama, upsert ke data yang ada.
 * - mode 'ganti-total': hapus dulu seluruh data sekolah aktif, lalu restore.
 * - Restore DITOLAK bila NPSN di file ≠ NPSN sekolah aktif, kecuali pemanggil
 *   menyetel konfirmasiSekolahLain: true (user mencentang "saya paham ini
 *   data sekolah lain").
 * Issue #10 — alur: FASE 1 validasi fail-fast (terenkripsi → JSON →
 * kompatibilitas → struktur → checksum SHA-256 → NPSN) → FASE 2 snapshot
 * pengaman kondisi saat ini (fail-closed) → FASE 3 tulis → FASE 4 verifikasi
 * pasca-restore (jumlah/id/profil) → bila tulis/verifikasi gagal, rollback
 * otomatis ke snapshot pengaman. Hasil: RestoreResult (+verifikasi, +rollback,
 * +snapshotPengamanId).
 */
export async function importBackupData(
  jsonString: string,
  opts?: RestoreOptions
): Promise<RestoreResult> {
  const mode: RestoreMode = opts?.mode === 'ganti-total' ? 'ganti-total' : 'gabung';
  if (pakaiServer()) {
    // S3 Tahap 1: mode server mendukung PENGGANTIAN TOTAL via API
    // (transaksi tunggal + snapshot pengaman di server). Mode gabung
    // belum dirutekan — ditolak dengan pesan jelas, bukan dikerjakan
    // diam-diam dengan semantik yang salah.
    if (mode !== 'ganti-total') {
      return {
        status: 'ditolak',
        alasan: 'Mode gabung belum tersedia pada mode server. Gunakan mode Ganti Total, atau matikan Mode Server di Pengaturan untuk penggabungan lokal.',
        success: false,
        message: 'Mode gabung belum tersedia pada mode server. Gunakan mode Ganti Total, atau matikan Mode Server di Pengaturan untuk penggabungan lokal.',
        count: 0,
      };
    }
    let payloadImpor: unknown;
    try {
      payloadImpor = JSON.parse(jsonString);
    } catch {
      return {
        status: 'ditolak',
        alasan: 'File cadangan bukan JSON yang valid.',
        success: false,
        message: 'File cadangan bukan JSON yang valid.',
        count: 0,
      };
    }
    const hasil = await api.imporKeServer(payloadImpor);
    const jumlah = hasil?.hitungan?.siswa ?? 0;
    return {
      status: 'diganti',
      success: true,
      message: `Pemulihan server selesai: ${jumlah} siswa terimpor (snapshot pengaman dibuat otomatis di server).`,
      count: jumlah,
    };
  }
  const tolak = (alasan: string): RestoreResult => ({
    status: 'ditolak',
    alasan,
    success: false,
    message: alasan,
    count: 0,
  });
  // D11: kunci operasi panjang — ganti sekolah aktif ditolak selama restore.
  kunciOperasiPanjang();
  const peringatan: string[] = [];
  // Issue #10 — state untuk rollback: diisi FASE 2/3, dipakai catch + verifikasi.
  let pengaman: SnapshotPengaman | undefined;
  let faseTulis = false;
  let idSebelumnya = new Set<string>();
  try {
    // Issue #10 — FASE 1: validasi SEBELUM mutasi apa pun (fail-fast).
    // Urutan: terenkripsi → JSON → kompatibilitas → struktur → checksum → NPSN.
    if (deteksiCadanganTerenkripsi(jsonString)) {
      return tolak('File cadangan terenkripsi (butuh password) — pemulihan file terenkripsi belum didukung di tab ini.');
    }
    let data: BackupPayload;
    try {
      data = JSON.parse(jsonString);
    } catch {
      return tolak('File bukan JSON yang valid — kemungkinan rusak atau terpotong saat diunduh.');
    }
    const masalahKompat = validasiKompatibilitas(data);
    if (masalahKompat.length > 0) return tolak(masalahKompat.join(' '));
    const masalahStruktur = validasiStrukturBackup(data);
    if (masalahStruktur.length > 0) {
      return tolak(`Struktur backup tidak valid: ${masalahStruktur.join(' ')}`);
    }
    const hasilIntegritas = await periksaIntegritas(data);
    if (hasilIntegritas.status === 'tidak-cocok' || hasilIntegritas.status === 'tidak-valid') {
      return tolak(hasilIntegritas.alasan || 'Integritas backup tidak valid — file ditolak.');
    }
    if (hasilIntegritas.status === 'tanpa-checksum') {
      peringatan.push(hasilIntegritas.alasan || 'Backup lama tanpa checksum — integritas isi tidak dapat dibuktikan.');
    }
    peringatan.push(...periksaRelasiBackup(data));

    // D3: cegah profil/data sekolah lain menimpa sekolah aktif tanpa sadar.
    const npsnBackup = String(data.sekolah?.npsn || '').trim();
    let npsnSekolahSebelumRestore = '';
    try {
      npsnSekolahSebelumRestore = String((await getSekolahProfile())?.npsn || '').trim();
    } catch {
      /* profil tak terbaca — hanya entri audit ber-sekolahId cocok yang dapat lolos */
    }
    if (npsnBackup && npsnSekolahSebelumRestore &&
        npsnBackup !== npsnSekolahSebelumRestore && !opts?.konfirmasiSekolahLain && !opts?.lewatiSnapshotPengaman) {
      return tolak(
        `Restore ditolak: file cadangan milik sekolah lain (NPSN ${npsnBackup}), ` +
        `sedangkan sekolah aktif bernpsn ${npsnSekolahSebelumRestore}. ` +
        `Centang "saya paham ini data sekolah lain" untuk melanjutkan.`
      );
    }

    // Issue #10 — FASE 2: snapshot pengaman kondisi saat ini SEBELUM mutasi.
    // Fail-closed: bila snapshot pengaman gagal dibuat, restore dibatalkan
    // agar data saat ini tetap aman (tidak ada mutasi apa pun).
    const siswaSebelumnya = await getAllSiswa();
    idSebelumnya = new Set(siswaSebelumnya.map((s) => s.id));
    if (!opts?.lewatiSnapshotPengaman) {
      try {
        const payloadPengaman = await exportAllData();
        const idPengaman = await simpanSnapshotPengaman(payloadPengaman, siswaSebelumnya.length);
        const dapodikSebelumnya = await getDapodikConfig();
        pengaman = {
          id: idPengaman,
          timestamp: new Date().toISOString(),
          jumlahSiswa: siswaSebelumnya.length,
          payload: payloadPengaman,
          tokenDapodikSebelumnya: dapodikSebelumnya.token,
        };
      } catch (e) {
        return tolak(
          `Restore dibatalkan: gagal membuat snapshot pengaman kondisi saat ini ` +
            `(${e instanceof Error ? e.message : String(e)}). Data saat ini TIDAK diubah.`
        );
      }
    }

    // FASE 3: tulis — mulai dari sini, kegagalan memicu rollback (lihat catch).
    faseTulis = true;
    if (mode === 'ganti-total') {
      await clearDatabase();
      // clearDatabase ikut menghapus store snapshot — simpan ulang snapshot
      // pengaman agar tetap tersedia untuk rollback / pemulihan manual.
      if (pengaman) {
        try {
          await saveAutoSnapshot({
            id: pengaman.id,
            timestamp: pengaman.timestamp,
            dibuatOleh: PENGAMAN_RESTORE_OLEH,
            ukuranBytes: new Blob([pengaman.payload]).size,
            jumlahSiswa: pengaman.jumlahSiswa,
            payload: pengaman.payload,
          });
        } catch {
          /* snapshot pengaman tetap ada di memori untuk rollback */
        }
      }
    }

    if (data.sekolah) {
      await saveSekolahProfile(data.sekolah);
    }
    if (data.dapodikConfig) {
      await saveDapodikConfig(data.dapodikConfig);
    }

    for (const s of data.siswa) {
      await saveSiswa(s);
    }

    if (data.users && Array.isArray(data.users)) {
      // Rollback internal harus mengembalikan himpunan akun secara persis,
      // termasuk menghapus akun baru yang sempat masuk dari backup gagal.
      if (opts?.hapusPenggunaSaatRestore) {
        for (const user of await getAllUsers()) {
          await deleteUser(user.id);
        }
      }
      // D15(a): file backup jahat bisa menyisipkan akun administrator.
      // Administrator yang SUDAH ADA tidak pernah ditimpa dari backup kecuali
      // user memberi konfirmasi eksplisit (opts.konfirmasiTimpaAdmin).
      // User BARU dari backup otomatis ditandai mustChangePassword.
      const existingUsers = await getAllUsers();
      const adaById = new Map(existingUsers.map((u) => [u.id, u]));
      const adaByUsername = new Map(existingUsers.map((u) => [String(u.username || '').trim().toLowerCase(), u]));
      let adminDilewati = 0;
      for (const u of data.users) {
        if (!u || !u.username) continue;
        const ada = adaById.get(u.id) || adaByUsername.get(String(u.username).trim().toLowerCase());
        if (ada) {
          if (ada.role === 'administrator' && !opts?.konfirmasiTimpaAdmin) {
            adminDilewati++;
            continue;
          }
          await saveUser({ ...u, id: ada.id, username: ada.username });
        } else {
          await saveUser({ ...u, mustChangePassword: true });
        }
      }
      if (adminDilewati > 0) {
        peringatan.push(`${adminDilewati} akun administrator tidak ditimpa dari backup (tanpa konfirmasi eksplisit).`);
      }
      // Backup lama menyimpan plaintext — migrasikan ke hash.
      await migrateUserPasswordsToHash().catch(() => undefined);
    } else if (mode === 'ganti-total') {
      // D3: 'ganti-total' menghapus akun juga — pastikan admin bawaan tersedia
      // bila file backup tidak membawa daftar user, agar tak terkunci keluar.
      for (const u of await withHashedPasswords(initialUsersList)) {
        await saveUser(u);
      }
    }

    if (data.rombel && Array.isArray(data.rombel)) {
      await saveRombelRefs(data.rombel);
    }

    if (data.ptk && Array.isArray(data.ptk)) {
      await savePtkRefs(data.ptk);
    }

    if (data.tutupTahun && Array.isArray(data.tutupTahun)) {
      for (const t of data.tutupTahun) {
        await saveTutupTahun(t);
      }
    }

    if (data.petaKelas && Array.isArray(data.petaKelas)) {
      await savePetaKelasList(data.petaKelas);
    }

    if (data.audit && Array.isArray(data.audit)) {
      const npsnAktifRestore = npsnSekolahSebelumRestore;
      const sekolahIdAktif = getActiveSchoolId();
      let auditDitolak = 0;
      for (const a of data.audit.slice(0, 500)) {
        if (!a || !a.id || !a.timestamp || !a.aksi) continue;
        if (!bolehImporEntriAudit(a as AuditLog, sekolahIdAktif, npsnBackup, npsnAktifRestore)) {
          auditDitolak++;
          continue;
        }
        await addAuditLog(a as AuditLog);
      }
      if (auditDitolak > 0) peringatan.push(
        `${auditDitolak} entri audit dari sekolah lain tidak diimpor (isolasi audit antar-sekolah).`
      );
    }

    // D15(b): rekonsiliasi tombstone — record hasil restore yang masih punya
    // tombstone aktif (dihapus SETELAH isi backup dibuat) harus TETAP terhapus,
    // agar tidak "hidup lagi" lalu terunggah ulang ke cloud.
    // Aturan per record: bandingkan timestamp. Bila isi backup LEBIH BARU dari
    // tombstone, tombstone dianggap basi → dibuang. Bila tidak, record hasil
    // restore dihapus lagi (penghapusan dipertahankan) dan tombstone dibiarkan
    // agar sync berikutnya tidak menghidupkannya lagi.
    // Dipilih dibanding sekadar menandai "dilewati": tanpa hapus-ulang, record
    // hasil restore akan terunggah sebagai "baru" oleh cloudSync.
    // Issue #10 — id siswa yang dihapus-ulang oleh rekonsiliasi tombstone
    // (dipakai verifikasi pasca-restore: mereka TIDAK diharapkan hadir).
    let siswaTombDihapus: string[] = [];
    const tombAktif = muatTombstoneLokal();
    if (tombAktif.length > 0) {
      const kunciTomb = (coll: string, id: string) => `${coll}:${id}`;
      const petaTomb = new Map(tombAktif.map((t) => [kunciTomb(t.coll, t.id), t]));
      let dipertahankanHapus = 0;
      const waktuRecord = (v: unknown): number => {
        const t = typeof v === 'string' ? Date.parse(v) : NaN;
        return Number.isFinite(t) ? (t as number) : 0;
      };
      const rekonsiliasi = async (
        coll: string,
        id: string,
        tsRecord: number,
        hapusLagi: (rid: string) => Promise<void>
      ): Promise<boolean> => {
        const tomb = petaTomb.get(kunciTomb(coll, id));
        if (!tomb) return false;
        if (tsRecord > waktuRecord(tomb.ts)) {
          // Isi backup lebih baru dari penghapusan → tombstone basi, buang.
          petaTomb.delete(kunciTomb(coll, id));
          return false;
        } else {
          // Penghapusan lebih baru → pertahankan: hapus lagi record restore.
          try {
            await hapusLagi(id);
            dipertahankanHapus++;
            return true;
          } catch {
            /* biarkan record apa adanya; tombstone tetap melindunginya dari sync */
            return false;
          }
        }
      };
      for (const s of data.siswa) {
        if (s?.id && (await rekonsiliasi('siswa', s.id, waktuRecord(s.updatedAt), deleteSiswa))) {
          siswaTombDihapus.push(s.id);
        }
      }
      for (const r of data.ptk || []) {
        if (r?.id) await rekonsiliasi('ptk', r.id, waktuRecord(r.updatedAt), deletePtkRef);
      }
      for (const p of data.petaKelas || []) {
        if (p?.id) await rekonsiliasi('peta', p.id, waktuRecord(p.updatedAt), deletePetaKelas);
      }
      for (const t of data.tutupTahun || []) {
        if (t?.tahunAjaran) await rekonsiliasi('tutup', t.tahunAjaran, waktuRecord(t.ditutupPada), deleteTutupTahun);
      }
      // User: sertakan juga, tapi JANGAN pernah menghapus akun sesi aktif
      // (mencegah restore mengunci operator keluar).
      const sesiAktif = getCurrentUserSession();
      for (const u of data.users || []) {
        if (!u?.id || (sesiAktif && u.id === sesiAktif.id)) continue;
        await rekonsiliasi('pengguna', u.id, waktuRecord(u.updatedAt), deleteUser);
      }
      // Tulis balik daftar tombstone (yang basi sudah dibuang).
      simpanTombstoneLokal([...petaTomb.values()]);
      if (dipertahankanHapus > 0) {
        peringatan.push(
          `${dipertahankanHapus} record hasil restore tetap dipertahankan terhapus ` +
          `(ada catatan hapus yang lebih baru dari isi backup).`
        );
      }
    }

    // Issue #10 — FASE 4: verifikasi pasca-restore (jumlah/relasi).
    // Verifikasi GAGAL → rollback otomatis ke snapshot pengaman + laporkan.
    const verifikasi = await verifikasiPascaRestore(data, mode, idSebelumnya, siswaTombDihapus);
    if (!verifikasi.ok) {
      const rollback = await cobaRollback(pengaman);
      const pesanGagal =
        `Verifikasi pasca-restore GAGAL: ${verifikasi.pesan} ` +
        `${rollback.pesan || 'Rollback tidak dilakukan.'}`;
      return {
        status: 'ditolak',
        alasan: pesanGagal,
        success: false,
        message: pesanGagal,
        count: 0,
        peringatan,
        snapshotPengamanId: pengaman?.id,
        verifikasi,
        rollback,
      };
    }

    return {
      status: mode === 'ganti-total' ? 'diganti' : 'digabung',
      success: true,
      message:
        `Berhasil memulihkan data ${data.siswa.length} siswa dan konfigurasi sistem. ` +
        `${verifikasi.pesan}` +
        (peringatan.length > 0 ? ` Perhatian: ${peringatan.join(' ')}` : ''),
      count: data.siswa.length,
      peringatan,
      snapshotPengamanId: pengaman?.id,
      verifikasi,
    };
  } catch (err: any) {
    const alasan = err.message || 'Gagal memproses file JSON cadangan';
    // Issue #10 — bila gagal SETELAH mutasi dimulai, jangan tinggalkan data
    // parsial: rollback otomatis ke snapshot pengaman, lalu laporkan hasilnya.
    let rollback: RollbackRestore | undefined;
    if (faseTulis && pengaman) {
      rollback = await cobaRollback(pengaman);
    }
    const pesan = alasan + (rollback?.pesan ? ` ${rollback.pesan}` : '');
    return {
      status: 'ditolak',
      alasan: pesan,
      success: false,
      message: pesan,
      count: 0,
      peringatan,
      snapshotPengamanId: pengaman?.id,
      rollback,
    };
  } finally {
    // D11: selalu lepas kunci operasi panjang.
    bukaKunciOperasiPanjang();
  }
}

/** Payload "pabrik" untuk reset mode server: setara keadaan instalasi
 *  baru (profil & config bawaan + akun bawaan; siswa contoh opsional).
 *  Dikirim sebagai impor ganti-total ke API — server membuat snapshot
 *  pengaman sebelum menimpa. */
function payloadPabrik(sertakanContoh: boolean): Record<string, unknown> {
  return {
    app: 'BukuInduk_Merdeka',
    version: 2,
    exportedAt: new Date().toISOString(),
    sekolah: defaultSekolahProfile,
    dapodikConfig: { ...defaultDapodikConfig, wsToken: '' },
    siswa: sertakanContoh ? initialSiswaList : [],
    syncLogs: [],
    users: initialUsersList,
    rombel: [],
    ptk: [],
    tutupTahun: [],
    petaKelas: [],
    audit: [],
  };
}

export async function resetToSampleData(): Promise<void> {
  if (pakaiServer()) {
    await api.imporKeServer(payloadPabrik(true));
    return;
  }
  const wanted = [STORES.SISWA, STORES.SEKOLAH, STORES.CONFIG, STORES.LOGS, STORES.USERS, STORES.ROMBEL, STORES.PTK, STORES.TUTUP, STORES.PETA, STORES.AUDIT, STORES.AUTOBACKUP];
  try {
    const db = await openDB();
    // Hanya store yang benar-benar ada (database lama mungkin belum ter-upgrade).
    const names = wanted.filter((n) => {
      try {
        return db.objectStoreNames.contains(n);
      } catch {
        return false;
      }
    });
    if (names.length > 0) {
      const tx = db.transaction(names, 'readwrite');
      for (const n of names) tx.objectStore(n).clear();
      await new Promise<void>((res) => {
        tx.oncomplete = () => res();
        tx.onerror = () => res();
        tx.onabort = () => res();
      });
    }
    await seedDefaultData(db);
  } catch {
    /* IndexedDB gagal — lanjut ke pembersihan fallback di bawah */
  }
  try {
    localStorage.removeItem(sk(LS_KEYS.SISWA));
    localStorage.removeItem(sk(LS_KEYS.SEKOLAH));
    localStorage.removeItem(sk(LS_KEYS.CONFIG));
    localStorage.removeItem(sk(LS_KEYS.LOGS));
    localStorage.removeItem(sk(LS_KEYS.USERS));
    localStorage.removeItem(sk(LS_KEYS.ROMBEL));
    localStorage.removeItem(sk(LS_KEYS.PTK));
    localStorage.removeItem(sk(LS_KEYS.TUTUP));
    localStorage.removeItem(sk(LS_KEYS.PETA));
    localStorage.removeItem(sk(LS_KEYS.AUDIT));
  } catch {
    /* abaikan */
  }
  clearMemFallbackForDb(activeDbName);
  // Pastikan seed juga tersedia bila IDB tidak bisa dipakai sama sekali.
  try {
    await initStorage();
  } catch {
    /* abaikan */
  }
}

export async function clearDatabase(): Promise<void> {
  if (pakaiServer()) {
    await api.imporKeServer(payloadPabrik(false));
    return;
  }
  const wanted = [STORES.SISWA, STORES.SEKOLAH, STORES.CONFIG, STORES.LOGS, STORES.ROMBEL, STORES.PTK, STORES.TUTUP, STORES.PETA, STORES.AUDIT, STORES.AUTOBACKUP];
  try {
    const db = await openDB();
    // Hanya store yang benar-benar ada (database lama mungkin belum ter-upgrade).
    const names = wanted.filter((n) => {
      try {
        return db.objectStoreNames.contains(n);
      } catch {
        return false;
      }
    });
    if (names.length > 0) {
      const tx = db.transaction(names, 'readwrite');
      for (const n of names) tx.objectStore(n).clear();
      await new Promise<void>((res) => {
        tx.oncomplete = () => res();
        tx.onerror = () => res();
        tx.onabort = () => res();
      });
    }
  } catch {
    /* IndexedDB gagal — lanjut ke pembersihan fallback di bawah */
  }
  try {
    localStorage.removeItem(sk(LS_KEYS.SISWA));
    localStorage.removeItem(sk(LS_KEYS.SEKOLAH));
    localStorage.removeItem(sk(LS_KEYS.CONFIG));
    localStorage.removeItem(sk(LS_KEYS.LOGS));
    localStorage.removeItem(sk(LS_KEYS.ROMBEL));
    localStorage.removeItem(sk(LS_KEYS.PTK));
    localStorage.removeItem(sk(LS_KEYS.TUTUP));
    localStorage.removeItem(sk(LS_KEYS.PETA));
    localStorage.removeItem(sk(LS_KEYS.AUDIT));
  } catch {
    /* abaikan */
  }
  clearMemFallbackForDb(activeDbName);
}

export const exportDatabaseBackup = exportAllData;
export const importDatabaseBackup = importBackupData;
export const resetToInitialData = resetToSampleData;

// ---------------- ACCESS CONTROL (multi-user) ----------------

export function isAdministrator(user: AppUser | null | undefined): boolean {
  return !!user && user.role === 'administrator';
}

/** Operator hanya boleh mengakses rombel yang terdaftar di rombelAkses.
 *  Array kosong / undefined = akses semua rombel. Administrator = semua. */
export function canUserAccessRombel(user: AppUser | null | undefined, rombel?: string): boolean {
  if (!user || user.role === 'administrator') return true;
  const akses = user.rombelAkses;
  if (!akses || akses.length === 0) return true;
  return !!rombel && akses.includes(rombel);
}

export function filterSiswaByAccess(siswa: Siswa[], user: AppUser | null | undefined): Siswa[] {
  if (!user || user.role === 'administrator') return siswa;
  const akses = user.rombelAkses;
  if (!akses || akses.length === 0) return siswa;
  // F16: siswa TANPA rombel (legacy / impor lama) tetap terlihat operator.
  // Tanpa rombelSaatIni tidak ada pembatasan yang bisa diterapkan, jadi
  // record semacam ini selalu lolos filter (UI dapat menampilkannya di grup
  // "Belum ada rombel").
  return (siswa || []).filter((s) => !s.rombelSaatIni || akses.includes(s.rombelSaatIni));
}

/** Operator hanya boleh login ke TA yang terdaftar di tahunAkses.
 *  Array kosong / undefined = semua tahun. Administrator = semua. */
export function canUserAccessTahun(
  user: AppUser | null | undefined,
  tahun?: string | null
): boolean {
  if (!tahun || !String(tahun).trim()) return true;
  if (!user || user.role === 'administrator') return true;
  const akses = (user.tahunAkses || []).map((t) => String(t).trim()).filter(Boolean);
  if (akses.length === 0) return true;
  return akses.includes(String(tahun).trim());
}

