// Klien API v1 SIBISKuMer (Fase S2 migrasi SQLite).
//
// Berbicara ke endpoint server /api/v1/* (lapisan SQLite Fase S1) pada
// origin yang sama. Sesi dijaga cookie HttpOnly yang diterbitkan server
// saat login — modul ini tidak menyimpan token apa pun di JavaScript.
import type { Siswa } from '../types';

interface Amplop<T> {
  ok: boolean;
  data?: T;
  pesan?: string;
}

async function panggil<T>(
  metode: string,
  jalur: string,
  body?: unknown,
  timeoutMs = 8000
): Promise<T> {
  const res = await fetch(`/api/v1${jalur}`, {
    method: metode,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const amplop = (await res.json().catch(() => null)) as Amplop<T> | null;
  if (!res.ok || !amplop || amplop.ok !== true) {
    throw new Error(amplop?.pesan || `Permintaan ke server gagal (HTTP ${res.status}).`);
  }
  return amplop.data as T;
}

/** Id sekolah di server. Entri sekolah UTAMA klien selalu ber-id hasil
 *  bangkitan (sch-...) tetapi dbName-nya adalah database bawaan
 *  'BukuInduk_Merdeka_DB' — entri itulah yang dipetakan ke 'utama' di
 *  server. Sekolah tambahan (dbName lain) memakai id entrinya sendiri.
 *  (Temuan QA pasangan S2: memetakan dari id aktif mentah membuat login
 *  server membuka database kosong sehingga sesi tidak pernah terbentuk.) */
export function sekolahIdServer(): string {
  try {
    const aktifId = (localStorage.getItem('bukuinduk_active_school') || '').trim();
    if (!aktifId) return 'utama';
    const daftar = JSON.parse(localStorage.getItem('bukuinduk_schools') || '[]');
    const entri = Array.isArray(daftar)
      ? daftar.find((s: any) => s && s.id === aktifId)
      : null;
    if (!entri) return 'utama';
    if (!entri.dbName || entri.dbName === 'BukuInduk_Merdeka_DB') return 'utama';
    return String(entri.id);
  } catch {
    return 'utama';
  }
}

export interface HasilMasukServer {
  user: any;
  sekolahId: string;
  mustChangePassword: boolean;
  /** True bila basis data server masih benih awal (gerbang migrasi S4). */
  benihAwal?: boolean;
}

/** Masuk ke server dan kembalikan sesi + user. Melempar Error berpesan
 *  jelas (termasuk pesan kunci login) bila ditolak — dipakai jalur login
 *  utama pada mode server penuh (Fase S3). */
export async function masukServer(username: string, password: string): Promise<HasilMasukServer> {
  return panggil<HasilMasukServer>('POST', '/auth/login', {
    sekolahId: sekolahIdServer(),
    username,
    password,
  });
}

/** Buka sesi server dengan kredensial yang sama seperti login lokal.
 *  Kegagalan TIDAK menggagalkan login lokal — layar mode server akan
 *  jatuh kembali ke data lokal bila sesi tidak ada. */
export async function loginKeServer(username: string, password: string): Promise<boolean> {
  try {
    await masukServer(username, password);
    return true;
  } catch {
    return false;
  }
}

export async function keluarDariServer(): Promise<void> {
  try {
    await panggil('POST', '/auth/logout', {});
  } catch {
    /* abaikan — sesi server kedaluwarsa sendiri */
  }
}

/** Daftar siswa dari SQLite server (sudah tersaring kewenangan rombel
 *  oleh server). Melempar Error bila sesi tidak ada / server tak terjangkau. */
export async function ambilSiswaDariServer(): Promise<Siswa[]> {
  return panggil<Siswa[]>('GET', '/data/siswa');
}

/** Hasil endpoint Asisten AI server (Issue #13). */
export interface HasilAiServer {
  teks: string;
  sumber: 'lokal' | 'eksternal';
  peringatan?: string;
}

/** Minta Asisten AI server (mode server saja). Timeout 45 detik agar fallback
 *  provider server (30 detik) sempat menjawab lebih dulu. */
export async function mintaAiServer(body: unknown): Promise<HasilAiServer> {
  return panggil<HasilAiServer>('POST', '/ai/generate', body, 45000);
}

/** True bila sesi impersonate lokal sedang aktif (tampilan menyamar) —
 *  dalam keadaan ini layar pilot TIDAK memakai data server karena sesi
 *  server adalah milik impersonator, bukan akun yang disamarkan. */
export function sedangMenyamar(): boolean {
  try {
    return !!localStorage.getItem('bukuinduk_impersonate_from');
  } catch {
    return false;
  }
}

// ---------------- Metode inti Fase S3 (cermin fungsi db.ts) ----------------

const seg = (v: string): string => encodeURIComponent(v);

export async function ambilSiswaSatuDariServer(id: string): Promise<Siswa | null> {
  try {
    return await panggil<Siswa>('GET', `/data/siswa/${seg(id)}`);
  } catch {
    return null;
  }
}

export async function simpanSiswaKeServer(siswa: Siswa): Promise<void> {
  await panggil('PUT', `/data/siswa/${seg(siswa.id)}`, siswa);
}

export async function hapusSiswaDariServer(id: string): Promise<void> {
  await panggil('DELETE', `/data/siswa/${seg(id)}`);
}

export async function simpanSiswaBulkKeServer(items: Siswa[]): Promise<void> {
  await panggil('POST', '/data/siswa/bulk', { items });
}

export async function ambilUsersDariServer<T = any>(): Promise<T[]> {
  return panggil<T[]>('GET', '/data/users');
}

export async function simpanUserKeServer(user: any): Promise<void> {
  await panggil('PUT', `/data/users/${seg(user.id)}`, user);
}

export async function hapusUserDariServer(id: string): Promise<void> {
  await panggil('DELETE', `/data/users/${seg(id)}`);
}

export async function ambilProfilDariServer<T = any>(): Promise<T> {
  return panggil<T>('GET', '/data/profil');
}

export async function simpanProfilKeServer(profil: unknown): Promise<void> {
  await panggil('PUT', '/data/profil', profil);
}

export async function ambilConfigDariServer<T = any>(kunci: string): Promise<T> {
  return panggil<T>('GET', `/data/config/${seg(kunci)}`);
}

export async function simpanConfigKeServer(kunci: string, nilai: unknown): Promise<void> {
  await panggil('PUT', `/data/config/${seg(kunci)}`, nilai);
}

export async function ambilKoleksiDariServer<T = any>(entitas: string): Promise<T[]> {
  return panggil<T[]>('GET', `/data/koleksi/${seg(entitas)}`);
}

export async function simpanKoleksiSatuKeServer(entitas: string, item: any): Promise<void> {
  const id = entitas === 'tutup_tahun' ? String(item.tahunAjaran || item.id || '') : String(item.id || '');
  await panggil('PUT', `/data/koleksi/${seg(entitas)}/${seg(id)}`, item);
}

export async function gantiKoleksiDiServer(entitas: string, items: any[]): Promise<void> {
  await panggil('POST', `/data/koleksi/${seg(entitas)}/bulk`, { mode: 'ganti', items });
}

export async function hapusKoleksiDariServer(entitas: string, id: string): Promise<void> {
  await panggil('DELETE', `/data/koleksi/${seg(entitas)}/${seg(id)}`);
}

export async function ambilEksporDariServer<T = any>(): Promise<T> {
  return panggil<T>('GET', '/backup/ekspor');
}

export async function imporKeServer(payload: unknown): Promise<any> {
  return panggil('POST', '/backup/impor', { payload });
}

export async function gantiSandiServer(passwordBaru: string): Promise<any> {
  return panggil('POST', '/auth/ganti-sandi', { passwordBaru });
}

export async function ambilSesiServer(): Promise<any> {
  return panggil('GET', '/auth/sesi');
}

export async function mulaiImpersonateServer(userId: string): Promise<any> {
  return panggil('POST', '/auth/impersonate', { userId });
}

// ---------------- Snapshot berkas (Fase S4) ----------------

export interface MetaSnapshotBerkasApi {
  nama: string;
  label: string;
  dibuatPada: string;
  ukuran: number;
  hitungan: { siswa: number; users: number } | null;
}

export async function daftarSnapshotBerkasServer(): Promise<MetaSnapshotBerkasApi[]> {
  return panggil<MetaSnapshotBerkasApi[]>('GET', '/snapshot/berkas');
}

export async function buatSnapshotBerkasServer(label: string): Promise<MetaSnapshotBerkasApi> {
  return panggil<MetaSnapshotBerkasApi>('POST', '/snapshot/berkas', { label });
}

export async function pulihkanSnapshotBerkasServer(nama: string): Promise<any> {
  return panggil('POST', `/snapshot/berkas/${seg(nama)}/pulihkan`, {});
}

export async function hapusSnapshotBerkasServer(nama: string): Promise<void> {
  await panggil('DELETE', `/snapshot/berkas/${seg(nama)}`);
}

/** URL unduh berkas basis data aktif (.db) — dipakai sebagai href
 *  tautan unduh (cookie sesi same-origin ikut terkirim). */
export function urlUnduhDbServer(): string {
  return '/api/v1/backup/unduh-db';
}

export async function berhentiImpersonateServer(): Promise<any> {
  return panggil('POST', '/auth/impersonate/berhenti', {});
}
