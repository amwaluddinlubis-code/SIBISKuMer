import { Siswa, SekolahProfile, DapodikConfig, DapodikSyncLog, AppUser, RaportSemester, TingkatKelas, RiwayatSemester } from '../types';
import { defaultSekolahProfile, defaultDapodikConfig, initialSiswaList, initialUsersList } from '../data/initialData';
import { ensurePasswordHash } from './crypto';

const DB_NAME = 'BukuIndukSMP_Merdeka_DB';
const DB_VERSION = 2;

const STORES = {
  SISWA: 'siswa',
  SEKOLAH: 'sekolah',
  CONFIG: 'config',
  LOGS: 'sync_logs',
  USERS: 'users'
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Browser tidak mendukung IndexedDB'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

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
  CURRENT_USER: 'bukuinduk_current_user',
  IMPERSONATE: 'bukuinduk_impersonate_from'
};

export async function initStorage(): Promise<void> {
  try {
    const db = await openDB();
    const siswaCount = await countStore(db, STORES.SISWA);
    const userCount = await countStore(db, STORES.USERS);
    if (siswaCount === 0 || userCount === 0) {
      await seedDefaultData(db);
    }
  } catch {
    // LocalStorage fallback check
    if (!localStorage.getItem(LS_KEYS.SISWA)) {
      localStorage.setItem(LS_KEYS.SISWA, JSON.stringify(initialSiswaList));
      localStorage.setItem(LS_KEYS.SEKOLAH, JSON.stringify(defaultSekolahProfile));
      localStorage.setItem(LS_KEYS.CONFIG, JSON.stringify(defaultDapodikConfig));
      localStorage.setItem(LS_KEYS.LOGS, JSON.stringify([]));
      localStorage.setItem(LS_KEYS.USERS, JSON.stringify(await Promise.all(initialUsersList.map(ensurePasswordHash))));
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

async function seedDefaultData(db: IDBDatabase): Promise<void> {
  const tx = db.transaction([STORES.SISWA, STORES.SEKOLAH, STORES.CONFIG, STORES.LOGS, STORES.USERS], 'readwrite');
  const siswaStore = tx.objectStore(STORES.SISWA);
  for (const s of initialSiswaList) {
    siswaStore.put(s);
  }
  const sekolahStore = tx.objectStore(STORES.SEKOLAH);
  sekolahStore.put({ id: 'main', ...defaultSekolahProfile });

  const configStore = tx.objectStore(STORES.CONFIG);
  configStore.put({ id: 'main', ...defaultDapodikConfig });

  const userStore = tx.objectStore(STORES.USERS);
  for (const u of initialUsersList) {
    // Password seed langsung di-hash; tidak pernah tersimpan plaintext
    userStore.put(await ensurePasswordHash(u));
  }

  const logStore = tx.objectStore(STORES.LOGS);
  logStore.put({
    id: 'log-init',
    timestamp: new Date().toISOString(),
    status: 'success',
    totalDapodik: 5,
    ditambahkan: 5,
    diperbarui: 0,
    dilewati: 0,
    pesan: 'Inisialisasi Database Buku Induk Siswa SMP Kurikulum Merdeka (Data Awal Sukses Dimuat).'
  });

  localStorage.setItem(LS_KEYS.USERS, JSON.stringify(await Promise.all(initialUsersList.map(ensurePasswordHash))));

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
    const raw = localStorage.getItem(LS_KEYS.SISWA);
    return raw ? JSON.parse(raw) : initialSiswaList;
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
    localStorage.setItem(LS_KEYS.SISWA, JSON.stringify(all));
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
    localStorage.setItem(LS_KEYS.SISWA, JSON.stringify(filtered));
  }
}

// ---------------- RAPORT & MULTI-YEAR HELPERS ----------------

export async function saveSiswaRaport(siswaId: string, raport: RaportSemester): Promise<void> {
  const siswa = await getSiswaById(siswaId);
  if (!siswa) throw new Error('Data siswa tidak ditemukan.');

  const existingRaports = siswa.nilaiRaport || [];
  const index = existingRaports.findIndex(
    (r) => r.id === raport.id || (r.tahunAjaran === raport.tahunAjaran && r.semester === raport.semester)
  );

  let updatedRaports: RaportSemester[];
  if (index >= 0) {
    updatedRaports = [...existingRaports];
    updatedRaports[index] = { ...raport };
  } else {
    updatedRaports = [...existingRaports, raport];
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
    riwayatSemester: updatedRiwayat
  });
}

export async function deleteSiswaRaport(siswaId: string, raportId: string): Promise<void> {
  const siswa = await getSiswaById(siswaId);
  if (!siswa) return;
  const updatedRaports = (siswa.nilaiRaport || []).filter((r) => r.id !== raportId);
  await saveSiswa({
    ...siswa,
    nilaiRaport: updatedRaports
  });
}

export async function promoteSiswaKenaikanKelas(
  siswaIds: string[],
  nextTahunAjaran: string,
  nextTingkat: TingkatKelas,
  nextRombel: string,
  status: 'Naik Kelas' | 'Lulus' | 'Tinggal di Kelas' = 'Naik Kelas'
): Promise<number> {
  let count = 0;
  for (const id of siswaIds) {
    const s = await getSiswaById(id);
    if (!s) continue;

    const existingHistory = s.riwayatTahunAjaran || [];
    const prevYearHistory = {
      id: `rth-${Date.now()}-${count}`,
      tahunAjaran: s.riwayatSemester?.[s.riwayatSemester.length - 1]?.tahunAjaran || 'Tahun Lalu',
      tingkat: s.diterimaDiTingkat,
      rombel: s.rombelSaatIni,
      statusAkhirTahun: status,
      catatan: `Kenaikan ke rombel ${nextRombel} TP ${nextTahunAjaran}`
    };

    const updatedSiswa: Siswa = {
      ...s,
      rombelSaatIni: status === 'Lulus' ? s.rombelSaatIni : nextRombel,
      statusSiswa: status === 'Lulus' ? 'Lulus' : 'Aktif',
      riwayatTahunAjaran: [...existingHistory, prevYearHistory],
      updatedAt: new Date().toISOString()
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
    const raw = localStorage.getItem(LS_KEYS.SEKOLAH);
    return raw ? JSON.parse(raw) : defaultSekolahProfile;
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
    localStorage.setItem(LS_KEYS.SEKOLAH, JSON.stringify(profile));
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
    const raw = localStorage.getItem(LS_KEYS.CONFIG);
    return raw ? JSON.parse(raw) : defaultDapodikConfig;
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
    localStorage.setItem(LS_KEYS.CONFIG, JSON.stringify(cfg));
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
    const raw = localStorage.getItem(LS_KEYS.LOGS);
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
    localStorage.setItem(LS_KEYS.LOGS, JSON.stringify(logs.slice(0, 100)));
  }
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
      req.onerror = () => resolve(initialUsersList);
    });
  } catch {
    const raw = localStorage.getItem(LS_KEYS.USERS);
    return raw ? JSON.parse(raw) : initialUsersList;
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
    localStorage.setItem(LS_KEYS.USERS, JSON.stringify(users));
  }
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
    localStorage.setItem(LS_KEYS.USERS, JSON.stringify(filtered));
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

/** Buang field sensitif (hash password) sebelum disimpan sebagai sesi. */
function sanitizeSessionUser(user: AppUser): AppUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _h, password: _p, ...rest } = user;
  return rest as AppUser;
}

export function setCurrentUserSession(user: AppUser | null): void {
  if (user) {
    localStorage.setItem(LS_KEYS.CURRENT_USER, JSON.stringify(sanitizeSessionUser(user)));
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
    localStorage.setItem(LS_KEYS.IMPERSONATE, JSON.stringify(sanitizeSessionUser(adminUser)));
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
}

export async function exportAllData(): Promise<string> {
  const [siswa, sekolah, dapodikConfig, syncLogs, users] = await Promise.all([
    getAllSiswa(),
    getSekolahProfile(),
    getDapodikConfig(),
    getSyncLogs(),
    getAllUsers()
  ]);

  const payload: BackupPayload = {
    app: 'Buku Induk Siswa SMP Kurikulum Merdeka',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    sekolah,
    dapodikConfig,
    siswa,
    syncLogs,
    users
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
  const db = await openDB();
  const tx = db.transaction([STORES.SISWA, STORES.SEKOLAH, STORES.CONFIG, STORES.LOGS, STORES.USERS], 'readwrite');
  
  tx.objectStore(STORES.SISWA).clear();
  tx.objectStore(STORES.SEKOLAH).clear();
  tx.objectStore(STORES.CONFIG).clear();
  tx.objectStore(STORES.LOGS).clear();
  tx.objectStore(STORES.USERS).clear();

  await new Promise<void>((res) => {
    tx.oncomplete = () => res();
  });

  await seedDefaultData(db);
}

export async function clearDatabase(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction([STORES.SISWA, STORES.SEKOLAH, STORES.CONFIG, STORES.LOGS], 'readwrite');
  tx.objectStore(STORES.SISWA).clear();
  tx.objectStore(STORES.SEKOLAH).clear();
  tx.objectStore(STORES.CONFIG).clear();
  tx.objectStore(STORES.LOGS).clear();
  localStorage.removeItem(LS_KEYS.SISWA);
  localStorage.removeItem(LS_KEYS.SEKOLAH);
  localStorage.removeItem(LS_KEYS.CONFIG);
  localStorage.removeItem(LS_KEYS.LOGS);
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export const exportDatabaseBackup = exportAllData;
export const importDatabaseBackup = importBackupData;
export const resetToInitialData = resetToSampleData;

