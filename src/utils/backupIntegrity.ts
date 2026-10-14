// ---------------- INTEGRITAS & KOMPATIBILITAS CADANGAN (Issue #10) ----------------
// Modul MURNI (tanpa IndexedDB / DOM): mudah diuji regresi.
// Setiap backup baru membawa blok `integritas`:
//   { algoritma: 'SHA-256', checksum, jumlah: {...}, dibuatPada }
// Checksum = SHA-256 (hex) atas string kanonik payload TANPA blok integritas,
// sehingga perubahan satu byte apa pun pada isi backup terdeteksi saat restore.
// Backup lama tanpa blok integritas tetap dapat dipulihkan (kompatibel ke
// belakang), tetapi ditandai 'tanpa-checksum' + peringatan eksplisit di UI.

import { isEncryptedBackup } from './backupCrypto';

/** Versi format BackupPayload yang dihasilkan ekspor saat ini. */
export const BACKUP_FORMAT_VERSION = '1.3.0';
/** Nilai `app` yang wajib tercantum di setiap BackupPayload. */
export const BACKUP_APP_NAME = 'Buku Induk Siswa Kurikulum Merdeka';
export const BACKUP_INTEGRITY_ALG = 'SHA-256';

/** Blok integritas yang menempel pada BackupPayload. */
export interface IntegritasBackup {
  algoritma: 'SHA-256';
  /** SHA-256 hex atas payload tanpa blok integritas. */
  checksum: string;
  /** Jumlah record per koleksi saat backup dibuat (untuk verifikasi). */
  jumlah: Record<string, number>;
  dibuatPada: string;
}

export type StatusIntegritas = 'terverifikasi' | 'tanpa-checksum' | 'tidak-cocok' | 'tidak-valid';

export interface HasilPeriksaIntegritas {
  status: StatusIntegritas;
  /** Penjelasan manusiawi (khususnya untuk status selain 'terverifikasi'). */
  alasan?: string;
  jumlahTercatat?: Record<string, number>;
  jumlahAktual?: Record<string, number>;
}

/** Koleksi yang dihitung di blok `integritas.jumlah`. */
const KUNCI_JUMLAH = ['siswa', 'users', 'rombel', 'ptk', 'tutupTahun', 'petaKelas', 'audit', 'syncLogs'] as const;

/** JSON.stringify dengan kunci objek terurut rekursif (array tetap berurutan). */
export function stringifyKanonik(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        out[k] = (v as Record<string, unknown>)[k];
      }
      return out;
    }
    return v;
  });
}

/** Hitung jumlah record per koleksi dari sebuah payload (tanpa validasi). */
export function hitungJumlahBackup(payload: object): Record<string, number> {
  const p = payload as Record<string, unknown>;
  const jumlah: Record<string, number> = {};
  for (const k of KUNCI_JUMLAH) {
    const v = p[k];
    jumlah[k] = Array.isArray(v) ? v.length : 0;
  }
  return jumlah;
}

function keHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hitung checksum SHA-256 atas payload. Blok `integritas` (bila ada)
 * dikeluarkan dulu agar checksum stabil terhadap dirinya sendiri.
 * Melempar Error bila WebCrypto tidak tersedia di lingkungan ini.
 */
export async function hitungChecksumBackup(payload: object): Promise<string> {
  const { integritas: _buang, ...isi } = payload as Record<string, unknown> & { integritas?: unknown };
  void _buang;
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('WebCrypto (SHA-256) tidak tersedia di lingkungan ini — checksum tidak dapat dihitung.');
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(stringifyKanonik(isi)));
  return keHex(digest);
}

/** Tempelkan blok integritas pada payload (mengembalikan salinan baru). */
export async function tambahIntegritas<T extends object>(
  payload: T
): Promise<T & { integritas: IntegritasBackup }> {
  const checksum = await hitungChecksumBackup(payload);
  return {
    ...payload,
    integritas: {
      algoritma: BACKUP_INTEGRITY_ALG,
      checksum,
      jumlah: hitungJumlahBackup(payload),
      dibuatPada: new Date().toISOString(),
    },
  };
}

/**
 * Periksa blok integritas sebuah payload.
 * - 'terverifikasi': checksum cocok DAN jumlah tercatat cocok dengan aktual.
 * - 'tanpa-checksum': backup lama tanpa blok integritas (masih boleh restore,
 *   tetapi integritas isi tidak dapat dibuktikan).
 * - 'tidak-cocok': checksum / jumlah tidak sesuai → file rusak atau diubah.
 * - 'tidak-valid': blok integritas malformasi.
 */
export async function periksaIntegritas(payload: unknown): Promise<HasilPeriksaIntegritas> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { status: 'tidak-valid', alasan: 'Payload cadangan bukan objek JSON.' };
  }
  const p = payload as Record<string, unknown>;
  const integritas = p.integritas as IntegritasBackup | undefined;
  if (!integritas) {
    return {
      status: 'tanpa-checksum',
      alasan:
        'File ini backup lama tanpa checksum — integritas isi tidak dapat dibuktikan. ' +
        'Periksa jumlah siswa & relasi setelah restore.',
    };
  }
  if (
    integritas.algoritma !== BACKUP_INTEGRITY_ALG ||
    typeof integritas.checksum !== 'string' ||
    !/^[0-9a-f]{64}$/.test(integritas.checksum)
  ) {
    return {
      status: 'tidak-valid',
      alasan: 'Blok integritas backup malformasi (algoritma/checksum tidak dikenali). File ditolak.',
    };
  }
  const jumlahAktual = hitungJumlahBackup(p);
  const jumlahTercatat = integritas.jumlah;
  if (jumlahTercatat && typeof jumlahTercatat === 'object') {
    for (const k of KUNCI_JUMLAH) {
      if (typeof jumlahTercatat[k] === 'number' && jumlahTercatat[k] !== jumlahAktual[k]) {
        return {
          status: 'tidak-cocok',
          alasan:
            `Jumlah tercatat (${k}: ${jumlahTercatat[k]}) tidak sesuai isi file (${k}: ${jumlahAktual[k]}) — ` +
            'file rusak atau diubah setelah dibuat. File ditolak.',
          jumlahTercatat: jumlahTercatat as Record<string, number>,
          jumlahAktual,
        };
      }
    }
  }
  let checksumAktual: string;
  try {
    checksumAktual = await hitungChecksumBackup(p);
  } catch (e) {
    return { status: 'tidak-valid', alasan: e instanceof Error ? e.message : String(e) };
  }
  if (checksumAktual !== integritas.checksum) {
    return {
      status: 'tidak-cocok',
      alasan:
        'Checksum SHA-256 tidak cocok — file rusak (mis. terpotong saat unduh) atau diubah setelah dibuat. File ditolak.',
      jumlahTercatat: (jumlahTercatat || {}) as Record<string, number>,
      jumlahAktual,
    };
  }
  return { status: 'terverifikasi', jumlahTercatat: (jumlahTercatat || {}) as Record<string, number>, jumlahAktual };
}

/** Bandingkan dua versi semver `x.y.z`. <0 bila a<b, 0 bila sama, >0 bila a>b. */
export function bandingkanVersi(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number(n) || 0);
  const pb = b.split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/**
 * Validasi kompatibilitas payload. Mengembalikan daftar masalah (kosong =
 * kompatibel). Aturan: `app` harus SIBISKuMer, `version` harus semver dan
 * TIDAK lebih baru dari versi format saat ini (backup dari aplikasi lebih
 * baru ditolak tegas — skemanya bisa mengandung field yang belum dikenal).
 * Backup LEBIH LAMA diterima (kompatibel ke belakang, dengan peringatan
 * tanpa-checksum bila tak ada blok integritas).
 */
export function validasiKompatibilitas(payload: unknown): string[] {
  const masalah: string[] = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return ['File cadangan bukan objek JSON yang valid.'];
  }
  const p = payload as Record<string, unknown>;
  // v1.0 exporter used this exact identifier before the name was normalized.
  // Continue accepting it for legacy backups; app/version validation still
  // rejects unrelated applications and unsupported future formats.
  const namaAplikasiLegacy = 'Buku Induk Siswa SMP Kurikulum Merdeka';
  if (p.app !== undefined && p.app !== BACKUP_APP_NAME && p.app !== namaAplikasiLegacy) {
    masalah.push(`Bukan cadangan SIBISKuMer (app: ${JSON.stringify(p.app)}). File ditolak.`);
  } else if (p.app === undefined) {
    masalah.push('File cadangan tidak mencantumkan nama aplikasi (app). File ditolak.');
  }
  if (typeof p.version !== 'string' || !p.version.trim()) {
    masalah.push('File cadangan tidak mencantumkan versi format (version). File ditolak.');
  } else if (!/^\d+\.\d+\.\d+$/.test(p.version.trim())) {
    masalah.push(`Versi format tidak dikenali (${JSON.stringify(p.version)}). File ditolak.`);
  } else if (bandingkanVersi(p.version.trim(), BACKUP_FORMAT_VERSION) > 0) {
    masalah.push(
      `File cadangan dibuat aplikasi versi ${p.version} yang LEBIH BARU dari versi format yang didukung ` +
        `(${BACKUP_FORMAT_VERSION}). Perbarui aplikasi dulu, lalu ulangi restore. File ditolak.`
    );
  }
  return masalah;
}

const MAKS_MASALAH = 20;

/**
 * Validasi struktural payload (tanpa menyentuh database). Mengembalikan
 * daftar masalah (kosong = struktur OK). Dibatasi 20 masalah agar pesan
 * tetap terbaca; masalah pertama adalah yang paling penting.
 */
export function validasiStrukturBackup(payload: unknown): string[] {
  const masalah: string[] = [];
  const dorong = (m: string) => {
    if (masalah.length < MAKS_MASALAH) masalah.push(m);
  };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return ['File cadangan bukan objek JSON yang valid.'];
  }
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p.siswa)) {
    return ['Format data cadangan tidak valid (tidak ada array siswa).'];
  }
  const idSiswa = new Set<string>();
  for (const s of p.siswa as unknown[]) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) {
      dorong('Ditemukan record siswa yang bukan objek.');
      continue;
    }
    const id = (s as Record<string, unknown>).id;
    if (typeof id !== 'string' || !id.trim()) {
      dorong('Ditemukan record siswa tanpa id.');
    } else if (idSiswa.has(id)) {
      dorong(`Duplikat id siswa: ${id}.`);
    } else {
      idSiswa.add(id);
    }
  }
  if (p.sekolah !== undefined && (typeof p.sekolah !== 'object' || p.sekolah === null || Array.isArray(p.sekolah))) {
    dorong('Profil sekolah (sekolah) bukan objek.');
  }
  if (p.users !== undefined) {
    if (!Array.isArray(p.users)) {
      dorong('Daftar pengguna (users) bukan array.');
    } else {
      const idUser = new Set<string>();
      const namaUser = new Set<string>();
      for (const u of p.users as unknown[]) {
        if (!u || typeof u !== 'object' || Array.isArray(u)) {
          dorong('Ditemukan record pengguna yang bukan objek.');
          continue;
        }
        const rec = u as Record<string, unknown>;
        if (typeof rec.id === 'string' && rec.id) {
          if (idUser.has(rec.id)) dorong(`Duplikat id pengguna: ${rec.id}.`);
          else idUser.add(rec.id);
        }
        if (typeof rec.username === 'string' && rec.username.trim()) {
          const key = rec.username.trim().toLowerCase();
          if (namaUser.has(key)) dorong(`Duplikat username: ${rec.username}.`);
          else namaUser.add(key);
        } else {
          dorong('Ditemukan record pengguna tanpa username.');
        }
      }
    }
  }
  for (const k of ['rombel', 'ptk', 'petaKelas', 'audit', 'syncLogs'] as const) {
    if (p[k] !== undefined && !Array.isArray(p[k])) dorong(`Koleksi ${k} bukan array.`);
  }
  if (p.tutupTahun !== undefined) {
    if (!Array.isArray(p.tutupTahun)) {
      dorong('Koleksi tutupTahun bukan array.');
    } else {
      const tahun = new Set<string>();
      for (const t of p.tutupTahun as unknown[]) {
        const ta = (t as Record<string, unknown>)?.tahunAjaran;
        if (typeof ta === 'string' && ta) {
          if (tahun.has(ta)) dorong(`Duplikat tutup tahun: ${ta}.`);
          else tahun.add(ta);
        }
      }
    }
  }
  return masalah;
}

/**
 * Periksa relasi di dalam payload (peringatan NON-fatal — tidak menolak
 * restore, tetapi ditampilkan di pratinjau & hasil verifikasi):
 * - siswa yang rombelnya tidak ada di daftar referensi rombel;
 * - NISN ganda (non-kosong).
 */
export function periksaRelasiBackup(payload: unknown): string[] {
  const peringatan: string[] = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return peringatan;
  const p = payload as Record<string, unknown>;
  const siswa = Array.isArray(p.siswa) ? (p.siswa as Array<Record<string, unknown>>) : [];
  if (Array.isArray(p.rombel) && p.rombel.length > 0) {
    const namaRombel = new Set(
      (p.rombel as Array<Record<string, unknown>>)
        .map((r) => (typeof r?.nama === 'string' ? r.nama.trim() : ''))
        .filter(Boolean)
    );
    let takDikenal = 0;
    for (const s of siswa) {
      const r = typeof s?.rombelSaatIni === 'string' ? s.rombelSaatIni.trim() : '';
      if (r && !namaRombel.has(r)) takDikenal++;
    }
    if (takDikenal > 0) {
      peringatan.push(
        `${takDikenal} siswa merujuk rombel yang tidak ada di daftar referensi rombel backup — ` +
          'rombel akan tetap tersimpan apa adanya (nama rombel bebas).'
      );
    }
  }
  const nisn = new Map<string, number>();
  for (const s of siswa) {
    const n = typeof s?.nisn === 'string' ? s.nisn.trim() : '';
    if (n) nisn.set(n, (nisn.get(n) || 0) + 1);
  }
  const ganda = [...nisn.entries()].filter(([, c]) => c > 1);
  if (ganda.length > 0) {
    peringatan.push(`${ganda.length} NISN muncul lebih dari sekali di backup — periksa duplikasi setelah restore.`);
  }
  return peringatan;
}

/** true bila teks adalah cadangan terenkripsi (envelope v1), bukan JSON backup biasa. */
export function deteksiCadanganTerenkripsi(teks: string): boolean {
  return isEncryptedBackup(teks);
}
