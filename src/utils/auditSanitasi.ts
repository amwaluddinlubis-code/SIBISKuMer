// ---------------- SANITASI AUDIT (issue #9) ----------------
// Fungsi MURNI (tanpa impor modul lain) agar dapat dipakai dari
// `audit.ts` (penulis) maupun `db.ts` (filter restore) tanpa siklus impor,
// dan mudah diuji di Node tanpa DOM/IndexedDB.
//
// Prinsip: audit log TIDAK PERNAH menyimpan rahasia atau data pribadi
// berlebihan — hanya jejak operasional (siapa, apa, entitas mana, kapan,
// hasil, dan perubahan field operasional secukupnya).

/** Kunci yang selalu disensor bila muncul di objek sebelum/sesudah. */
const KUNCI_SENSITIF =
  /token|password|kata.?sandi|sandi|secret|pin|otp|nik|nisn|nipd|no.?kk|akta|foto|tanggal.?lahir|tempat.?lahir|alamat|telepon|telp|handphone|\bhp\b|email|nama.?ibu|nama.?ayah|golongan.?darah|tinggi.?badan|berat.?badan|penyakit|kelainan|kebutuhan.?khusus/i;

/** Pola `token = ...` / `password: ...` di dalam teks bebas (detail/error). */
const POLA_RAHASIA_TEKS = /(token|password|kata\s*sandi|secret)\s*[:=]\s*[^\s;,}"]+/gi;

export const NILAI_DISENSOR = '[disensor]';

/** Sensor satu nilai secara rekursif (objek/array/primitif). */
export function sanitasiNilaiAudit(nilai: unknown, dalam = 0): unknown {
  if (nilai === null || nilai === undefined) return nilai;
  if (dalam > 4) return NILAI_DISENSOR;
  if (Array.isArray(nilai)) {
    return nilai.slice(0, 50).map((v) => sanitasiNilaiAudit(v, dalam + 1));
  }
  if (typeof nilai === 'object') {
    const hasil: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(nilai as Record<string, unknown>)) {
      if (KUNCI_SENSITIF.test(k)) {
        hasil[k] = NILAI_DISENSOR;
      } else {
        hasil[k] = sanitasiNilaiAudit(v, dalam + 1);
      }
    }
    return hasil;
  }
  if (typeof nilai === 'string') return sanitasiTeksAudit(nilai);
  return nilai;
}

/** Sensor pasangan kunci rahasia di dalam teks bebas. */
export function sanitasiTeksAudit(teks: string): string {
  if (!teks) return teks;
  return teks.replace(POLA_RAHASIA_TEKS, `$1: ${NILAI_DISENSOR}`);
}

/** Perbandingan nilai lewat JSON (cukup untuk field operasional audit). */
function sama(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Diff perubahan operasional: hanya field dalam allowlist DAN nilainya
 * berubah yang dicatat. Nilai melewati sanitasi. Kembalikan `undefined`
 * bila tidak ada perubahan yang layak catat.
 */
export function diffAudit(
  sebelum: object | undefined | null,
  sesudah: object | undefined | null,
  allowlist: readonly string[]
): { sebelum?: Record<string, unknown>; sesudah?: Record<string, unknown> } | undefined {
  const lama: Record<string, unknown> = {};
  const baru: Record<string, unknown> = {};
  let berubah = false;
  const sLama = (sebelum ?? {}) as Record<string, unknown>;
  const sBaru = (sesudah ?? {}) as Record<string, unknown>;
  for (const kunci of allowlist) {
    const a = sLama[kunci];
    const b = sBaru[kunci];
    if (!sama(a, b)) {
      lama[kunci] = sanitasiNilaiAudit(a);
      baru[kunci] = sanitasiNilaiAudit(b);
      berubah = true;
    }
  }
  if (!berubah) return undefined;
  return { sebelum: lama, sesudah: baru };
}

/**
 * Filter impor audit saat restore backup (anti-bocor antar-sekolah):
 * - Entri ber-`sekolahId` hanya diterima bila cocok dengan sekolah aktif.
 * - Entri lawas tanpa `sekolahId` diterima hanya bila NPSN berkas sama
 *   dengan NPSN sekolah aktif (backup sekolah yang sama, dibuat sebelum
 *   penandaan sekolahId ada).
 * - Selain itu (termasuk entri sekolah lain yang lolos konfirmasi restore
 *   data) DITOLAK — audit sekolah lain tidak boleh masuk ke database ini.
 */
export function bolehImporEntriAudit(
  entri: { sekolahId?: string } | null | undefined,
  sekolahIdAktif: string | null | undefined,
  npsnBerkas: string,
  npsnAktif: string
): boolean {
  if (!entri) return false;
  const cap = typeof entri.sekolahId === 'string' ? entri.sekolahId.trim() : '';
  if (cap) return !!sekolahIdAktif && cap === sekolahIdAktif;
  const nb = (npsnBerkas || '').trim();
  const na = (npsnAktif || '').trim();
  return !!nb && !!na && nb === na;
}
