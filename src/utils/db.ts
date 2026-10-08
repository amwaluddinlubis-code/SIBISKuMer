import { Siswa, SekolahProfile, DapodikConfig, DapodikSyncLog, AppUser, RaportSemester, TingkatKelas, RiwayatSemester, RombelRef, PtkRef, SchoolEntry, JenjangSekolah, TutupTahunAjaran, PetaKelas, AuditLog, AutoBackupSnapshot } from '../types';
import { defaultSekolahProfile, defaultDapodikConfig, initialSiswaList, initialUsersList, presetSekolahSD } from '../data/initialData';
import { hashPassword, isHashedPassword, withHashedPasswords } from './password';

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
    const raw = localStorage.getItem(sk(LS_KEYS.SISWA));
    // Salin agar pemanggil tidak memutasi konstanta modul (anti-bocor antar-sekolah).
    return raw ? JSON.parse(raw) : [...initialSiswaList];
  }
}

export async function getSiswaById(id: string): Promise<Siswa | null> {
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

export async function saveSiswa(siswa: Siswa): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SISWA, 'readwrite');
      const store = tx.objectStore(STORES.SISWA);
      const req = store.put(siswa);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
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

/** Urai file backup JSON menjadi payload + ringkasan rombel (untuk restore selektif). */
export function parseBackupPayload(jsonString: string): {
  payload: BackupPayload;
  totalSiswa: number;
  rombel: Array<{ rombel: string; jumlah: number }>;
} {
  const data: BackupPayload = JSON.parse(jsonString);
  if (!data.siswa || !Array.isArray(data.siswa)) {
    throw new Error('Format data cadangan tidak valid (tidak ada array siswa).');
  }
  const hitung = new Map<string, number>();
  for (const s of data.siswa) {
    const r = (s?.rombelSaatIni || 'Tanpa Rombel').toString().trim() || 'Tanpa Rombel';
    hitung.set(r, (hitung.get(r) || 0) + 1);
  }
  const rombel = [...hitung.entries()]
    .map(([rombel, jumlah]) => ({ rombel, jumlah }))
    .sort((a, b) => a.rombel.localeCompare(b.rombel));
  return { payload: data, totalSiswa: data.siswa.length, rombel };
}

/**
 * Restore selektif: hanya siswa dari rombel terpilih (upsert per id).
 * Mengembalikan { ditambahkan, diperbarui }.
 */
export async function importSelectiveSiswa(
  data: BackupPayload,
  rombelTerpilih: string[]
): Promise<{ ditambahkan: number; diperbarui: number; total: number }> {
  const pilih = new Set((rombelTerpilih || []).map((r) => r.trim()));
  const cocok = (data.siswa || []).filter((s) =>
    pilih.has(((s?.rombelSaatIni || 'Tanpa Rombel').toString().trim() || 'Tanpa Rombel'))
  );
  if (cocok.length === 0) throw new Error('Tidak ada siswa pada rombel terpilih.');
  const ada = new Set((await getAllSiswa()).map((s) => s.id));
  let ditambahkan = 0;
  for (const s of cocok) {
    if (!ada.has(s.id)) {
      ditambahkan++;
      ada.add(s.id);
    }
  }
  await saveSiswaBulk(cocok);
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

export async function promoteSiswaKenaikanKelas(
  siswaIds: string[],
  nextTahunAjaran: string,
  nextTingkat: TingkatKelas,
  nextRombel: string,
  status: 'Naik Kelas' | 'Lulus' | 'Tinggal di Kelas' = 'Naik Kelas'
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
    const tahunLama = getTahunAjaranTerakhirSiswa(s) || nextTahunAjaran;

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
    list.unshift(entry);
    localStorage.setItem(sk(LS_KEYS.AUDIT), JSON.stringify(list.slice(0, AUDIT_LS_MIRROR_MAX)));
  } catch {
    /* abaikan */
  }
}

export async function clearAuditLogs(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORES.AUDIT, 'readwrite');
        const req = tx.objectStore(STORES.AUDIT).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    /* abaikan */
  }
  try {
    localStorage.removeItem(sk(LS_KEYS.AUDIT));
  } catch {
    /* abaikan */
  }
}

// ---------------- CADANGAN OTOMATIS (snapshot di IndexedDB, maks 5) ----------------

const AUTOBACKUP_KEEP = 5;

export async function getAutoSnapshots(): Promise<AutoBackupSnapshot[]> {
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
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.AUTOBACKUP, 'readwrite');
      const store = tx.objectStore(STORES.AUTOBACKUP);
      const putReq = store.put(snap);
      putReq.onerror = () => reject(putReq.error);
      putReq.onsuccess = () => {
        // Pertahankan hanya N terbaru.
        try {
          const allReq = store.getAll();
          allReq.onsuccess = () => {
            const rows: AutoBackupSnapshot[] = (allReq.result || []).sort(
              (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
            const extra = rows.slice(AUTOBACKUP_KEEP);
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

// ---------------- ARSIP TAHUN AJARAN (tutup tahun, terkunci) ----------------

export async function getTutupTahun(): Promise<TutupTahunAjaran[]> {
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
  return getAllFromStore<PetaKelas>(STORES.PETA, sk(LS_KEYS.PETA));
}

export function savePetaKelasList(items: PetaKelas[]): Promise<void> {
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
  return putAllToStore<PetaKelas>(STORES.PETA, sk(LS_KEYS.PETA), [normalized]);
}

/** Hapus satu baris pemetaan dari IndexedDB + cache localStorage. */
export async function deletePetaKelas(id: string): Promise<void> {
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
  return getAllFromStore<RombelRef>(STORES.ROMBEL, sk(LS_KEYS.ROMBEL));
}

export function saveRombelRefs(items: RombelRef[]): Promise<void> {
  return putAllToStore<RombelRef>(STORES.ROMBEL, sk(LS_KEYS.ROMBEL), items);
}

export function getAllPtkRefs(): Promise<PtkRef[]> {
  return getAllFromStore<PtkRef>(STORES.PTK, sk(LS_KEYS.PTK));
}

export function savePtkRefs(items: PtkRef[]): Promise<void> {
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
  return putAllToStore<PtkRef>(STORES.PTK, sk(LS_KEYS.PTK), [normalized]);
}

/** Hapus satu GTK dari IndexedDB + cache localStorage. */
export async function deletePtkRef(id: string): Promise<void> {
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

export async function getAllUsers(): Promise<AppUser[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.USERS, 'readonly');
      const store = tx.objectStore(STORES.USERS);
      const req = store.getAll();
      req.onsuccess = () => {
        const users: AppUser[] = req.result || [];
        if (users.length === 0) {
          resolve(initialUsersList);
        } else {
          resolve(users);
        }
      };
      req.onerror = () => resolve([...initialUsersList]);
    });
  } catch {
    const raw = localStorage.getItem(sk(LS_KEYS.USERS));
    return raw ? JSON.parse(raw) : [...initialUsersList];
  }
}

export async function saveUser(user: AppUser): Promise<void> {
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

export interface BackupPayload {
  app: string;
  version: string;
  exportedAt: string;
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

export async function exportAllData(): Promise<string> {
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
    version: '1.3.0',
    exportedAt: new Date().toISOString(),
    sekolah,
    dapodikConfig,
    siswa,
    syncLogs,
    users,
    rombel,
    ptk,
    tutupTahun,
    petaKelas,
    audit
  };

  return JSON.stringify(payload, null, 2);
}

export async function importBackupData(jsonString: string): Promise<{ success: boolean; message: string; count: number }> {
  try {
    const data: BackupPayload = JSON.parse(jsonString);
    if (!data.siswa || !Array.isArray(data.siswa)) {
      throw new Error('Format data cadangan tidak valid (tidak ada array siswa).');
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
      for (const u of data.users) {
        await saveUser(u);
      }
      // Backup lama menyimpan plaintext — migrasikan ke hash.
      await migrateUserPasswordsToHash().catch(() => undefined);
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
      for (const a of data.audit.slice(0, 500)) {
        if (a && a.id && a.timestamp && a.aksi) await addAuditLog(a as AuditLog);
      }
    }

    return {
      success: true,
      message: `Berhasil memulihkan data ${data.siswa.length} siswa dan konfigurasi sistem.`,
      count: data.siswa.length
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Gagal memproses file JSON cadangan',
      count: 0
    };
  }
}

export async function resetToSampleData(): Promise<void> {
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
  return (siswa || []).filter((s) => !!s.rombelSaatIni && akses.includes(s.rombelSaatIni));
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

