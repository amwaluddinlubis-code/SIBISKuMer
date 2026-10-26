/**
 * Logika murni manajemen mutasi siswa & riwayat status lintas waktu — Issue #5.
 *
 * Dijalankan dengan `npm test` (tsx + node:test). Modul ini TIDAK menyentuh
 * IndexedDB, localStorage, server, maupun DOM: semua fungsi menerima data
 * sebagai argumen dan mengembalikan data baru (input tidak pernah dimutasi).
 *
 * Prinsip yang dijaga (acceptance criteria issue #5):
 * - Riwayat bersifat append-only: entri lama tidak pernah diubah/dihapus.
 *   Pembatalan menambah entri baru jenis 'batal' yang merujuk entri asal.
 * - Satu write: status baru + entri riwayat selalu berada dalam SATU objek
 *   siswa yang sama, sehingga pemanggil cukup memanggil saveSiswa sekali.
 *   Gagal simpan = tidak ada perubahan sama sekali (tanpa kegagalan parsial).
 * - Idempotensi: pengiriman ulang dengan kunci yang sama adalah no-op,
 *   bukan duplikat.
 * - Laporan periode lalu tidak berubah: fungsi-fungsi di sini tidak pernah
 *   menyentuh riwayatTahunAjaran / riwayatSemester yang sudah ada.
 */
import type { JenisMutasi, RiwayatMutasi, Siswa, StatusSiswa } from '../types';
import { tahunAjaranDariTanggal } from './tahunAjaran';

/** Transisi status yang diizinkan. Status non-Aktif bersifat final — hanya
 *  pembatalan (entri 'batal') yang dapat mengembalikannya ke Aktif. */
export const TRANSISI_DIIZINKAN: Record<StatusSiswa, StatusSiswa[]> = {
  Aktif: ['Mutasi Keluar', 'Mengundurkan Diri', 'Meninggal Dunia', 'Lulus'],
  Lulus: [],
  'Mutasi Keluar': [],
  'Mengundurkan Diri': [],
  'Meninggal Dunia': [],
};

export function bolehTransisi(dari: StatusSiswa, ke: StatusSiswa): boolean {
  return (TRANSISI_DIIZINKAN[dari] || []).includes(ke);
}

export function labelJenisMutasi(jenis: JenisMutasi): string {
  switch (jenis) {
    case 'masuk':
      return 'Mutasi masuk';
    case 'keluar':
      return 'Mutasi keluar';
    case 'ubah_status':
      return 'Perubahan status';
    case 'lulus':
      return 'Lulus';
    case 'batal':
      return 'Pembatalan mutasi';
  }
}

/** Hari ini (YYYY-MM-DD) di zona Asia/Jakarta, tanpa bergantung modul lain. */
export function hariIniWIB(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

/** YYYY-MM-DD dengan tanggal kalender yang nyata (2026-02-30 ditolak). */
export function tanggalIsoValid(t: unknown): boolean {
  if (typeof t !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t.trim());
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return false;
  const d = new Date(Date.UTC(y, mo - 1, da));
  return d.getUTCFullYear() === y && d.getUTCMonth() === mo - 1 && d.getUTCDate() === da;
}

export interface InputMutasi {
  siswaId: string;
  jenis: JenisMutasi;
  statusSebelum: StatusSiswa | null;
  statusSesudah: StatusSiswa;
  tanggalEfektif: string;
  alasan: string;
  sekolahAsal?: string;
  sekolahTujuan?: string;
  noSurat?: string;
  dokumen?: string[];
}

export interface OpsiValidasiMutasi {
  /** Tahun ajaran sesi aktif (mis. '2026/2027'). Bila diisi, tanggal
   *  efektif wajib memetakan ke sesi ini (aturan yang sama dengan wizard). */
  sesiAktif?: string;
  /** Hari ini (YYYY-MM-DD) untuk uji tanggal masa depan; default hari ini WIB. */
  hariIni?: string;
}

/** Kembalikan daftar pesan kesalahan; kosong = input valid. */
export function validasiMutasi(input: InputMutasi, opsi: OpsiValidasiMutasi = {}): string[] {
  const err: string[] = [];
  const hariIni = opsi.hariIni || hariIniWIB();
  if (!input.siswaId || !input.siswaId.trim()) err.push('ID siswa wajib diisi.');
  if (!tanggalIsoValid(input.tanggalEfektif)) {
    err.push('Tanggal efektif wajib format YYYY-MM-DD yang valid.');
  } else {
    if (input.tanggalEfektif > hariIni) {
      err.push('Tanggal efektif tidak boleh melebihi hari ini.');
    }
    if (opsi.sesiAktif && opsi.sesiAktif.trim()) {
      const ta = tahunAjaranDariTanggal(input.tanggalEfektif);
      if (ta && ta !== opsi.sesiAktif.trim()) {
        err.push(`Tanggal efektif (TA ${ta}) di luar sesi aktif (TA ${opsi.sesiAktif.trim()}).`);
      }
    }
  }
  if (!input.alasan || !input.alasan.trim()) err.push('Alasan mutasi wajib diisi.');
  switch (input.jenis) {
    case 'keluar':
      if (input.statusSesudah !== 'Mutasi Keluar') err.push('Mutasi keluar harus berakhir di status Mutasi Keluar.');
      if (!input.sekolahTujuan || !input.sekolahTujuan.trim()) err.push('Sekolah tujuan wajib diisi untuk mutasi keluar.');
      break;
    case 'ubah_status':
      if (input.statusSesudah !== 'Mengundurkan Diri' && input.statusSesudah !== 'Meninggal Dunia') {
        err.push('Perubahan status hanya ke Mengundurkan Diri atau Meninggal Dunia.');
      }
      break;
    case 'lulus':
      if (input.statusSesudah !== 'Lulus') err.push('Peristiwa lulus harus berakhir di status Lulus.');
      break;
    case 'masuk':
      if (input.statusSesudah !== 'Aktif') err.push('Mutasi masuk harus berakhir di status Aktif.');
      if (input.statusSebelum !== null) err.push('Mutasi masuk tidak memiliki status sebelum.');
      break;
    case 'batal':
      err.push('Pembatalan wajib lewat batalkanMutasiTerakhir, bukan validasi ini.');
      break;
  }
  return err;
}

/** Kunci idempotensi deterministik: pengiriman ulang yang sama persis
 *  menghasilkan kunci yang sama, sehingga dapat dikenali sebagai no-op. */
export function kunciIdempotensiMutasi(p: {
  siswaId: string;
  jenis: JenisMutasi;
  tanggalEfektif: string;
  statusSesudah: StatusSiswa;
  noSurat?: string;
}): string {
  return [p.siswaId.trim(), p.jenis, p.tanggalEfektif.trim(), p.statusSesudah, (p.noSurat || '').trim().toLowerCase()].join('|');
}

export interface OperatorMutasi {
  id?: string;
  nama?: string;
}

function idEntriMutasi(): string {
  return `rm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Bangun entri riwayat dari input yang sudah lolos validasi.
 *  Melempar Error dengan pesan jelas bila input tidak valid. */
export function buatEntriMutasi(
  input: InputMutasi,
  operator: OperatorMutasi = {},
  opsi: OpsiValidasiMutasi & { id?: string; dicatatPada?: string } = {},
): RiwayatMutasi {
  const err = validasiMutasi(input, opsi);
  if (err.length > 0) throw new Error(err.join(' '));
  const dokumen = (input.dokumen || []).map((d) => d.trim()).filter(Boolean);
  if (input.noSurat && input.noSurat.trim() && !dokumen.includes(input.noSurat.trim())) {
    dokumen.unshift(input.noSurat.trim());
  }
  return {
    id: opsi.id || idEntriMutasi(),
    siswaId: input.siswaId,
    jenis: input.jenis,
    statusSebelum: input.statusSebelum,
    statusSesudah: input.statusSesudah,
    tanggalEfektif: input.tanggalEfektif,
    alasan: input.alasan.trim(),
    sekolahAsal: input.sekolahAsal?.trim() || undefined,
    sekolahTujuan: input.sekolahTujuan?.trim() || undefined,
    noSurat: input.noSurat?.trim() || undefined,
    dokumen,
    operatorId: operator.id || undefined,
    operatorNama: operator.nama || undefined,
    dicatatPada: opsi.dicatatPada || new Date().toISOString(),
    kunciIdempotensi: kunciIdempotensiMutasi({
      siswaId: input.siswaId,
      jenis: input.jenis,
      tanggalEfektif: input.tanggalEfektif,
      statusSesudah: input.statusSesudah,
      noSurat: input.noSurat,
    }),
  };
}

export interface HasilTerapMutasi {
  siswa: Siswa;
  entri: RiwayatMutasi;
  /** true bila pengiriman ulang dikenali (tidak ada perubahan baru). */
  sudahAda: boolean;
}

/**
 * Terapkan satu peristiwa mutasi ke siswa. Murni & imutabel: siswa input
 * tidak diubah; yang dikembalikan adalah objek siswa BARU yang memuat
 * status baru + entri riwayat dalam satu kesatuan (satu saveSiswa).
 * Melempar Error bila transisi/validasi/idempotensi tidak lolos — dalam
 * hal ini pemanggil tidak boleh menyimpan apa pun.
 */
export function terapkanMutasiKeSiswa(
  siswa: Siswa,
  input: InputMutasi,
  operator: OperatorMutasi = {},
  opsi: OpsiValidasiMutasi = {},
): HasilTerapMutasi {
  if (input.jenis === 'batal') {
    throw new Error('Pembatalan wajib lewat batalkanMutasiTerakhir.');
  }
  const riwayatLama = siswa.riwayatMutasi || [];
  const kunci = kunciIdempotensiMutasi({
    siswaId: input.siswaId,
    jenis: input.jenis,
    tanggalEfektif: input.tanggalEfektif,
    statusSesudah: input.statusSesudah,
    noSurat: input.noSurat,
  });
  const entriLama = riwayatLama.find((e) => e.kunciIdempotensi === kunci && !e.dibatalkanOleh);
  if (entriLama) {
    return { siswa, entri: entriLama, sudahAda: true };
  }
  if (input.statusSebelum !== null && input.statusSebelum !== siswa.statusSiswa) {
    throw new Error(
      `Status siswa saat ini (${siswa.statusSiswa}) tidak sesuai dengan status sebelum (${input.statusSebelum}). Muat ulang data lalu coba lagi.`,
    );
  }
  if (siswa.statusSiswa === input.statusSesudah) {
    throw new Error(`Siswa sudah berstatus ${input.statusSesudah}; mutasi yang sama tidak dapat diterapkan dua kali dengan data berbeda.`);
  }
  if (!bolehTransisi(siswa.statusSiswa, input.statusSesudah)) {
    throw new Error(`Transisi status ${siswa.statusSiswa} → ${input.statusSesudah} tidak diizinkan.`);
  }
  const entri = buatEntriMutasi(input, operator, opsi);
  const updated: Siswa = {
    ...siswa,
    statusSiswa: input.statusSesudah,
    riwayatMutasi: [...riwayatLama, entri],
    updatedAt: new Date().toISOString(),
  };
  if (input.jenis === 'keluar') {
    updated.tanggalKeluar = input.tanggalEfektif;
    updated.sekolahTujuan = (input.sekolahTujuan || '').trim();
    updated.noSuratMutasi = (input.noSurat || '').trim();
    updated.alasanKeluar = input.alasan.trim();
  }
  return { siswa: updated, entri, sudahAda: false };
}

/**
 * Bangun entri 'masuk' untuk siswa pindahan yang baru dibuat.
 * Validasi duplikasi NISN tetap tanggung jawab pemanggil (wizard sudah
 * memeriksa, handler App memeriksa ulang saat apply).
 */
export function buatEntriMutasiMasuk(
  siswaBaru: Siswa,
  input: { tanggalEfektif: string; alasan: string; sekolahAsal: string; noSurat?: string; dokumen?: string[] },
  operator: OperatorMutasi = {},
  opsi: OpsiValidasiMutasi = {},
): HasilTerapMutasi {
  const entri = buatEntriMutasi(
    {
      siswaId: siswaBaru.id,
      jenis: 'masuk',
      statusSebelum: null,
      statusSesudah: 'Aktif',
      tanggalEfektif: input.tanggalEfektif,
      alasan: input.alasan,
      sekolahAsal: input.sekolahAsal,
      noSurat: input.noSurat,
      dokumen: input.dokumen,
    },
    operator,
    opsi,
  );
  return {
    siswa: { ...siswaBaru, riwayatMutasi: [...(siswaBaru.riwayatMutasi || []), entri] },
    entri,
    sudahAda: false,
  };
}

/** Entri terakhir yang masih dapat dibatalkan (keluar/ubah_status/lulus,
 *  belum dibatalkan). Null bila tidak ada. */
export function entriDapatDibatalkan(siswa: Siswa): RiwayatMutasi | null {
  const list = siswa.riwayatMutasi || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if ((e.jenis === 'keluar' || e.jenis === 'ubah_status' || e.jenis === 'lulus') && !e.dibatalkanOleh) {
      return e;
    }
  }
  return null;
}

export interface HasilBatalMutasi {
  siswa: Siswa;
  entri: RiwayatMutasi;
  dibatalkan: RiwayatMutasi;
}

/**
 * Batalkan peristiwa mutasi terakhir yang masih dapat dibatalkan.
 * Status kembali Aktif; field keluar (bila asal keluar) dibersihkan;
 * riwayatTahunAjaran / riwayatSemester TIDAK disentuh — laporan periode
 * lalu tidak berubah; pembatalan hanya tercatat di riwayatMutasi + audit.
 * Melempar Error bila tidak ada entri yang dapat dibatalkan.
 */
export function batalkanMutasiTerakhir(
  siswa: Siswa,
  operator: OperatorMutasi = {},
  opsi: { hariIni?: string; dicatatPada?: string; id?: string } = {},
): HasilBatalMutasi {
  const target = entriDapatDibatalkan(siswa);
  if (!target) throw new Error('Tidak ada mutasi yang dapat dibatalkan untuk siswa ini.');
  const hariIni = opsi.hariIni || hariIniWIB();
  const now = opsi.dicatatPada || new Date().toISOString();
  const entriBatal: RiwayatMutasi = {
    id: opsi.id || idEntriMutasi(),
    siswaId: siswa.id,
    jenis: 'batal',
    statusSebelum: siswa.statusSiswa,
    statusSesudah: 'Aktif',
    tanggalEfektif: hariIni,
    alasan: `Pembatalan ${labelJenisMutasi(target.jenis).toLowerCase()} tanggal ${target.tanggalEfektif}`,
    sekolahAsal: target.sekolahAsal,
    sekolahTujuan: target.sekolahTujuan,
    // Sengaja TIDAK menyalin noSurat asal: pembatalan bukan dokumen baru,
    // dan nomor surat asal harus bebas dipakai lagi (lihat noSuratTerpakai).
    noSurat: undefined,
    dokumen: [],
    operatorId: operator.id || undefined,
    operatorNama: operator.nama || undefined,
    dicatatPada: now,
    kunciIdempotensi: kunciIdempotensiMutasi({
      siswaId: siswa.id,
      jenis: 'batal',
      tanggalEfektif: hariIni,
      statusSesudah: 'Aktif',
      noSurat: '',
    }),
    membatalkanId: target.id,
  };
  const riwayatBaru = (siswa.riwayatMutasi || []).map((e) =>
    e.id === target.id ? { ...e, dibatalkanOleh: entriBatal.id, dibatalkanPada: now } : e,
  );
  riwayatBaru.push(entriBatal);
  const updated: Siswa = {
    ...siswa,
    statusSiswa: 'Aktif',
    riwayatMutasi: riwayatBaru,
    updatedAt: now,
  };
  if (target.jenis === 'keluar') {
    updated.tanggalKeluar = undefined;
    updated.sekolahTujuan = undefined;
    updated.noSuratMutasi = undefined;
    updated.alasanKeluar = undefined;
  }
  return { siswa: updated, entri: entriBatal, dibatalkan: target };
}

/** NISN sudah dipakai siswa lain (untuk cegah duplikasi saat mutasi masuk). */
export function nisnSudahTerdaftar(daftar: Siswa[], nisn: string, kecualiId?: string): boolean {
  const v = (nisn || '').trim();
  if (!v) return false;
  return daftar.some((s) => s.id !== kecualiId && (s.nisn || '').trim() === v);
}

/** Nomor surat mutasi sudah dipakai siswa lain (untuk cegah duplikasi dokumen). */
export function noSuratTerpakai(daftar: Siswa[], noSurat: string, kecualiId?: string): boolean {
  const v = (noSurat || '').trim().toLowerCase();
  if (!v) return false;
  return daftar.some(
    (s) =>
      s.id !== kecualiId &&
      ((s.noSuratMutasi || '').trim().toLowerCase() === v ||
        (s.riwayatMutasi || []).some((e) => (e.noSurat || '').trim().toLowerCase() === v && !e.dibatalkanOleh)),
  );
}
