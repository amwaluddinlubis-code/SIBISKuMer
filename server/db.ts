// Lapisan data server SIBISKuMer — SQLite (Fase S1 migrasi).
//
// Satu berkas SQLite per sekolah di folder data (env SIBISKUMER_DATA_DIR,
// bawaan <cwd>/data), ditambah satu berkas registry untuk daftar sekolah,
// sesi login, dan kunci login. Skema mengikuti Rencana Migrasi §6:
// entitas kaya (siswa, users) berupa kolom identitas + payload JSON utuh
// agar perilaku aplikasi identik dengan model IndexedDB sebelumnya.
//
// ATURAN S0: jalur berkas dirumuskan dari __dirname/env — JANGAN memakai
// import.meta.url (bundle produksi adalah CJS).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const SKEMA_VERSI = 1;
export const SEKOLAH_BAWAAN_ID = 'utama';

export function folderData(): string {
  const dariEnv = (process.env.SIBISKUMER_DATA_DIR || '').trim();
  return dariEnv || path.join(process.cwd(), 'data');
}

function berkasUntuk(nama: string): string {
  const dir = folderData();
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, nama);
}

/** Sanitasi id sekolah menjadi nama berkas yang aman. */
export function idSekolahAman(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

const tangani = new Map<string, DatabaseSync>();

function bukaDb(namaBerkas: string): DatabaseSync {
  const kunci = berkasUntuk(namaBerkas);
  const ada = tangani.get(kunci);
  if (ada) return ada;
  const db = new DatabaseSync(kunci);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  tangani.set(kunci, db);
  return db;
}

/** Tutup semua koneksi (dipakai test & shutdown rapi). */
export function tutupSemuaDb(): void {
  for (const db of tangani.values()) {
    try { db.close(); } catch { /* abaikan */ }
  }
  tangani.clear();
}

// ---------------- Registry ----------------

export interface EntriSekolah {
  id: string;
  nama: string;
  npsn: string;
  jenjang: string;
}

export function dbRegistry(): DatabaseSync {
  const db = bukaDb('bukuinduk-registry.db');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sekolah_registry (
      id TEXT PRIMARY KEY, nama TEXT NOT NULL, npsn TEXT NOT NULL DEFAULT '',
      jenjang TEXT NOT NULL DEFAULT '', payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sesi (
      token TEXT PRIMARY KEY, sekolah_id TEXT NOT NULL, user_id TEXT NOT NULL,
      username TEXT NOT NULL, peran TEXT NOT NULL, impersonator_id TEXT,
      token_induk TEXT,
      dibuat_pada TEXT NOT NULL, kedaluwarsa_pada TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kunci_login (
      sekolah_id TEXT NOT NULL, username TEXT NOT NULL,
      gagal INTEGER NOT NULL DEFAULT 0, kunci_sampai TEXT,
      PRIMARY KEY (sekolah_id, username)
    );
    CREATE TABLE IF NOT EXISTS meta (
      kunci TEXT PRIMARY KEY, nilai TEXT NOT NULL
    );
  `);
  // Migrasi skema ringan: kolom token_induk untuk sesi impersonate pada
  // registry yang dibuat sebelum Fase S3.
  const kolom = db.prepare("SELECT name FROM pragma_table_info('sesi')").all() as any[];
  if (!kolom.some((k) => k.name === 'token_induk')) {
    db.exec('ALTER TABLE sesi ADD COLUMN token_induk TEXT');
  }
  return db;
}

export function daftarSekolah(): EntriSekolah[] {
  const db = dbRegistry();
  const baris = db.prepare('SELECT id, nama, npsn, jenjang FROM sekolah_registry ORDER BY nama').all() as any[];
  return baris.map((b) => ({ id: b.id, nama: b.nama, npsn: b.npsn, jenjang: b.jenjang }));
}

export function simpanEntriSekolah(entri: EntriSekolah & { payload?: unknown }): void {
  const db = dbRegistry();
  db.prepare(
    'INSERT INTO sekolah_registry (id, nama, npsn, jenjang, payload) VALUES (?, ?, ?, ?, ?) ' +
    'ON CONFLICT(id) DO UPDATE SET nama = excluded.nama, npsn = excluded.npsn, jenjang = excluded.jenjang, payload = excluded.payload'
  ).run(entri.id, entri.nama, entri.npsn || '', entri.jenjang || '', JSON.stringify(entri.payload ?? entri));
}

// ---------------- Database per sekolah ----------------

export function dbSekolah(sekolahId: string): DatabaseSync {
  const db = bukaDb(`bukuinduk-${idSekolahAman(sekolahId)}.db`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      kunci TEXT PRIMARY KEY, nilai TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS siswa (
      id TEXT PRIMARY KEY, nisn TEXT NOT NULL DEFAULT '', nama TEXT NOT NULL DEFAULT '',
      rombel_saat_ini TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_siswa_nisn ON siswa(nisn);
    CREATE INDEX IF NOT EXISTS idx_siswa_rombel ON siswa(rombel_saat_ini);
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'aktif',
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE TABLE IF NOT EXISTS baris (
      entitas TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL,
      PRIMARY KEY (entitas, id)
    );
    CREATE TABLE IF NOT EXISTS snapshot (
      id TEXT PRIMARY KEY, dibuat_pada TEXT NOT NULL,
      jumlah_siswa INTEGER NOT NULL DEFAULT 0, payload TEXT NOT NULL
    );
  `);
  const v = db.prepare("SELECT nilai FROM meta WHERE kunci = 'schema_version'").get() as any;
  if (!v) {
    db.prepare("INSERT INTO meta (kunci, nilai) VALUES ('schema_version', ?)").run(String(SKEMA_VERSI));
  }
  return db;
}

// ---------------- Meta / config ----------------

export function ambilMeta(db: DatabaseSync, kunci: string): unknown {
  const b = db.prepare('SELECT nilai FROM meta WHERE kunci = ?').get(kunci) as any;
  if (!b) return null;
  try { return JSON.parse(b.nilai); } catch { return null; }
}

export function simpanMeta(db: DatabaseSync, kunci: string, nilai: unknown): void {
  db.prepare(
    'INSERT INTO meta (kunci, nilai) VALUES (?, ?) ON CONFLICT(kunci) DO UPDATE SET nilai = excluded.nilai'
  ).run(kunci, JSON.stringify(nilai ?? null));
}

// ---------------- Siswa ----------------

export function semuaSiswa(db: DatabaseSync): any[] {
  // Urutan meniru IndexedDB store.getAll() klien: menaik menurut kunci (id).
  // (QA pasangan S2: ORDER BY nama membuat urutan baris Master Siswa
  // berbeda dari mode lokal walau isinya identik.)
  const baris = db.prepare('SELECT payload FROM siswa ORDER BY id').all() as any[];
  return baris.map((b) => JSON.parse(b.payload));
}

export function siswaById(db: DatabaseSync, id: string): any | null {
  const b = db.prepare('SELECT payload FROM siswa WHERE id = ?').get(id) as any;
  return b ? JSON.parse(b.payload) : null;
}

export function simpanSiswa(db: DatabaseSync, s: any): void {
  db.prepare(
    'INSERT INTO siswa (id, nisn, nama, rombel_saat_ini, status, payload) VALUES (?, ?, ?, ?, ?, ?) ' +
    'ON CONFLICT(id) DO UPDATE SET nisn = excluded.nisn, nama = excluded.nama, ' +
    'rombel_saat_ini = excluded.rombel_saat_ini, status = excluded.status, payload = excluded.payload'
  ).run(s.id, s.nisn || '', s.namaLengkap || '', s.rombelSaatIni || '', s.statusSiswa || '', JSON.stringify(s));
}

export function hapusSiswa(db: DatabaseSync, id: string): boolean {
  const r = db.prepare('DELETE FROM siswa WHERE id = ?').run(id) as any;
  return Number(r.changes) > 0;
}

export function jumlahSiswa(db: DatabaseSync): number {
  const b = db.prepare('SELECT COUNT(*) AS n FROM siswa').get() as any;
  return Number(b.n);
}

// ---------------- Users ----------------

export function semuaUsers(db: DatabaseSync): any[] {
  // Sama seperti siswa: urutan kunci (id), meniru getAll() IndexedDB klien.
  const baris = db.prepare('SELECT payload FROM users ORDER BY id').all() as any[];
  return baris.map((b) => JSON.parse(b.payload));
}

export function userByUsername(db: DatabaseSync, username: string): any | null {
  const b = db.prepare('SELECT payload FROM users WHERE username = ?').get(username) as any;
  return b ? JSON.parse(b.payload) : null;
}

export function userById(db: DatabaseSync, id: string): any | null {
  const b = db.prepare('SELECT payload FROM users WHERE id = ?').get(id) as any;
  return b ? JSON.parse(b.payload) : null;
}

export function simpanUser(db: DatabaseSync, u: any): void {
  db.prepare(
    'INSERT INTO users (id, username, status, payload) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT(id) DO UPDATE SET username = excluded.username, status = excluded.status, payload = excluded.payload'
  ).run(u.id, u.username || '', u.status || 'aktif', JSON.stringify(u));
}

export function hapusUser(db: DatabaseSync, id: string): boolean {
  const r = db.prepare('DELETE FROM users WHERE id = ?').run(id) as any;
  return Number(r.changes) > 0;
}

// ---------------- Koleksi generik (baris) ----------------

export const ENTITAS_KOLEKSI = ['rombel', 'ptk', 'peta_kelas', 'tutup_tahun', 'sync_logs', 'audit_logs'] as const;
export type EntitasKoleksi = (typeof ENTITAS_KOLEKSI)[number];

/** Id stabil per entitas koleksi (meniru keyPath store IndexedDB lama). */
export function idKoleksi(entitas: string, item: any): string {
  if (entitas === 'tutup_tahun') return String(item.tahunAjaran || item.id || '');
  return String(item.id || '');
}

export function semuaKoleksi(db: DatabaseSync, entitas: string): any[] {
  const baris = db.prepare('SELECT payload FROM baris WHERE entitas = ? ORDER BY id').all(entitas) as any[];
  return baris.map((b) => JSON.parse(b.payload));
}

export function simpanKoleksi(db: DatabaseSync, entitas: string, item: any): void {
  db.prepare(
    'INSERT INTO baris (entitas, id, payload) VALUES (?, ?, ?) ' +
    'ON CONFLICT(entitas, id) DO UPDATE SET payload = excluded.payload'
  ).run(entitas, idKoleksi(entitas, item), JSON.stringify(item));
}

export function hapusKoleksi(db: DatabaseSync, entitas: string, id: string): boolean {
  const r = db.prepare('DELETE FROM baris WHERE entitas = ? AND id = ?').run(entitas, id) as any;
  return Number(r.changes) > 0;
}

export function gantiKoleksi(db: DatabaseSync, entitas: string, items: any[]): void {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM baris WHERE entitas = ?').run(entitas);
    for (const item of items) simpanKoleksi(db, entitas, item);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ---------------- Snapshot ----------------

export function daftarSnapshot(db: DatabaseSync): Array<{ id: string; dibuatPada: string; jumlahSiswa: number }> {
  const baris = db.prepare('SELECT id, dibuat_pada, jumlah_siswa FROM snapshot ORDER BY dibuat_pada DESC').all() as any[];
  return baris.map((b) => ({ id: b.id, dibuatPada: b.dibuat_pada, jumlahSiswa: Number(b.jumlah_siswa) }));
}

export function simpanSnapshot(db: DatabaseSync, id: string, payload: string, jumlah: number): void {
  db.prepare(
    'INSERT INTO snapshot (id, dibuat_pada, jumlah_siswa, payload) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, jumlah_siswa = excluded.jumlah_siswa'
  ).run(id, new Date().toISOString(), jumlah, payload);
}

export function ambilSnapshot(db: DatabaseSync, id: string): string | null {
  const b = db.prepare('SELECT payload FROM snapshot WHERE id = ?').get(id) as any;
  return b ? b.payload : null;
}

export function hapusSnapshot(db: DatabaseSync, id: string): boolean {
  const r = db.prepare('DELETE FROM snapshot WHERE id = ?').run(id) as any;
  return Number(r.changes) > 0;
}

// ---------------- Transaksi ----------------

/** Jalankan fungsi dalam satu transaksi SQLite (rollback bila melempar). */
export function dalamTransaksi<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const hasil = fn();
    db.exec('COMMIT');
    return hasil;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* abaikan */ }
    throw e;
  }
}
