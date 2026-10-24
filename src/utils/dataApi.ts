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

/** Id sekolah di server: sekolah bawaan lokal dipetakan ke 'utama';
 *  sekolah lain memakai id entrinya (kunci LS 'bukuinduk_active_school'
 *  menyimpan id entri sekolah aktif; server membersihkan karakter
 *  nama berkas). */
export function sekolahIdServer(): string {
  try {
    const aktif = (localStorage.getItem('bukuinduk_active_school') || '').trim();
    return aktif || 'utama';
  } catch {
    return 'utama';
  }
}

/** Buka sesi server dengan kredensial yang sama seperti login lokal.
 *  Kegagalan TIDAK menggagalkan login lokal — layar mode server akan
 *  jatuh kembali ke data lokal bila sesi tidak ada. */
export async function loginKeServer(username: string, password: string): Promise<boolean> {
  try {
    await panggil('POST', '/auth/login', {
      sekolahId: sekolahIdServer(),
      username,
      password,
    });
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
