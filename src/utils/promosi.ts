/**
 * Logika murni kenaikan kelas & pembentukan rombel — Issue #6.
 *
 * Dijalankan dengan `npm test` (tsx + node:test). Modul ini TIDAK menyentuh
 * IndexedDB, localStorage, server, maupun DOM: semua fungsi menerima data
 * sebagai argumen dan mengembalikan data baru (input tidak pernah dimutasi).
 *
 * Prinsip yang dijaga (acceptance criteria issue #6):
 * - Tidak ada perubahan massal tanpa validasi: rencana HARUS lolos
 *   validasiRencanaPromosi (tanpa error) sebelum diterapkan — termasuk
 *   saat handler memanggil ulang validasi terhadap data segar, karena
 *   rencana bisa basi antara pratinjau dan penerapan.
 * - Tidak ada siswa ganda atau hilang: id duplikat antar rombel, id tak
 *   dikenal, siswa non-Aktif dalam rencana, dan siswa aktif yang tidak
 *   terencana (bukan pengecualian) semuanya error.
 * - Pengecualian eksplisit: siswa yang ditahan/dikecualikan tercatat
 *   dengan alasan dan TIDAK dihitung hilang — ia tetap Aktif di rombel lama.
 * - Idempoten: siswa yang sudah membawa entri promosi tahun yang ditutup
 *   dilewati saat penerapan ulang (tanpa entri riwayat ganda); penerapan
 *   ulang penuh tetap dapat mengunci tahun yang gagal terkunci.
 * - Riwayat lama tidak berubah: penerapan hanya MENAMBAH satu entri
 *   riwayatTahunAjaran per siswa; rollback hanya MENGHAPUS entri promosi
 *   tahun tersebut dan mengembalikan rombel/status — entri tahun lain
 *   tidak disentuh.
 * - Isolasi tenant: fungsi hanya bekerja pada daftar yang diberikan
 *   pemanggil (satu sekolah); id dari sekolah lain dilaporkan tak dikenal,
 *   bukan diterapkan.
 */
import type { RiwayatTahunAjaran, Siswa, TingkatKelas } from '../types';

export type StatusRencana = 'Naik Kelas' | 'Tinggal di Kelas' | 'Lulus';

export interface PengecualianPromosi {
  id: string;
  alasan: string;
}

/** Bentuk rencana yang diterima validator/penerap (kompatibel struktural
 *  dengan RencanaRombel di ArsipView). */
export interface RencanaPromosi {
  key?: string;
  tingkat: string;
  rombel: string;
  ids: string[];
  status: StatusRencana;
  nextTingkat: string;
  nextRombel: string;
  kecuali?: PengecualianPromosi[];
}

/** Awalan catatan entri riwayat yang ditulis alur tutup tahun. Dipakai
 *  untuk mengenali entri promosi (idempotensi & rollback). */
export const CATATAN_PROMOSI_PREFIX = 'Kenaikan ke rombel';

export function isEntriPromosi(
  e: RiwayatTahunAjaran,
  tahunTutup: string,
  tahunBaru?: string,
): boolean {
  if (e.tahunAjaran !== tahunTutup) return false;
  const c = (e.catatan || '').trim();
  if (!c.startsWith(CATATAN_PROMOSI_PREFIX)) return false;
  if (tahunBaru && !c.endsWith(`TP ${tahunBaru.trim()}`)) return false;
  return true;
}

/** Apakah siswa sudah dipromosi untuk tahun yang ditutup (penerapan ulang
 *  harus melewatinya, bukan menulis entri kedua). */
export function siswaSudahDipromosi(s: Siswa, tahunTutup: string, tahunBaru?: string): boolean {
  return (s.riwayatTahunAjaran || []).some((e) => isEntriPromosi(e, tahunTutup, tahunBaru));
}

export interface RingkasanRencana {
  lulus: number;
  naik: number;
  tinggal: number;
  dikecualikan: number;
  totalRencana: number;
  /** Jumlah siswa per rombel tujuan (hanya non-Lulus). */
  targetPerRombel: Record<string, number>;
}

export interface HasilValidasiRencana {
  errors: string[];
  peringatan: string[];
  ringkasan: RingkasanRencana;
  /** Siswa aktif yang tidak ada di rencana maupun pengecualian. */
  takTertempat: string[];
  /** Id yang muncul di lebih dari satu rombel rencana. */
  ganda: string[];
  /** Id rencana yang tidak ada di daftar aktif. */
  takDikenal: string[];
  /** Siswa yang sudah dipromosi untuk tahun ini (penerapan ulang aman). */
  sudahDipromosi: string[];
}

/**
 * Validasi rencana promosi terhadap daftar siswa aktif SATU sekolah.
 * Kapasitas: peta rombel tujuan → kapasitas maks; rombel tanpa kapasitas
 * tidak dibatasi (tidak memblokir). Tingkat akhir jenjang: hanya Lulus
 * (atau Tinggal bila diulang — ditangani pemanggil lewat status grup).
 */
export function validasiRencanaPromosi(args: {
  plan: RencanaPromosi[];
  siswaAktif: Siswa[];
  tingkatAkhir: string;
  kapasitas?: Record<string, number>;
  tahunTutup?: string;
  tahunBaru?: string;
}): HasilValidasiRencana {
  const errors: string[] = [];
  const peringatan: string[] = [];
  const { plan, siswaAktif, tingkatAkhir } = args;
  const aktifById = new Map<string, Siswa>();
  for (const s of siswaAktif || []) if (s.id) aktifById.set(s.id, s);

  const terlihat = new Map<string, string>(); // id -> rombel rencana pertama
  const ganda: string[] = [];
  const takDikenal: string[] = [];
  const kecualiIds = new Set<string>();
  const ringkasan: RingkasanRencana = {
    lulus: 0,
    naik: 0,
    tinggal: 0,
    dikecualikan: 0,
    totalRencana: 0,
    targetPerRombel: {},
  };

  for (const g of plan || []) {
    if (g.status === 'Lulus') {
      if (g.tingkat !== tingkatAkhir) {
        errors.push(`Rombel ${g.rombel || '?'}: status Lulus hanya untuk tingkat akhir (${tingkatAkhir}).`);
      }
    } else {
      if (g.tingkat === tingkatAkhir && g.status === 'Naik Kelas') {
        errors.push(`Rombel ${g.rombel || '?'}: tingkat akhir (${tingkatAkhir}) tidak dapat Naik Kelas.`);
      }
      if (!['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes((g.nextTingkat || '').trim())) {
        errors.push(`Tingkat baru rombel ${g.rombel || '?'} tidak valid.`);
      }
      if (!g.nextRombel || !g.nextRombel.trim()) {
        errors.push(`Rombel baru untuk ${g.rombel || '?'} wajib diisi.`);
      }
    }
    if (g.ids.length === 0) {
      errors.push(`Rombel ${g.rombel || '?'} kosong — tidak ada yang dipromosi.`);
    }
    for (const id of g.ids) {
      if (terlihat.has(id)) {
        if (!ganda.includes(id)) ganda.push(id);
      } else {
        terlihat.set(id, g.rombel);
      }
      const s = aktifById.get(id);
      if (!s) {
        if (!takDikenal.includes(id)) takDikenal.push(id);
      } else if (s.statusSiswa !== 'Aktif') {
        errors.push(`Siswa ${s.namaLengkap} (${id}) sudah berstatus ${s.statusSiswa} — tidak dapat dipromosi.`);
      }
    }
    for (const k of g.kecuali || []) {
      kecualiIds.add(k.id);
      const s = aktifById.get(k.id);
      if (!s) {
        errors.push(`Pengecualian ${k.id}: siswa tidak ditemukan di daftar aktif.`);
      } else if (s.statusSiswa !== 'Aktif') {
        errors.push(`Pengecualian ${s.namaLengkap}: siswa sudah berstatus ${s.statusSiswa}.`);
      }
      if (g.ids.includes(k.id)) {
        errors.push(`Siswa ${k.id} sekaligus direncanakan dan dikecualikan di rombel ${g.rombel || '?'}.`);
      }
      if (!k.alasan || !k.alasan.trim()) {
        errors.push(`Pengecualian ${k.id} wajib disertai alasan.`);
      }
    }
    if (g.status === 'Lulus') ringkasan.lulus += g.ids.length;
    else if (g.status === 'Naik Kelas') ringkasan.naik += g.ids.length;
    else ringkasan.tinggal += g.ids.length;
    ringkasan.dikecualikan += (g.kecuali || []).length;
    ringkasan.totalRencana += g.ids.length;
    if (g.status !== 'Lulus' && g.nextRombel && g.nextRombel.trim()) {
      const t = g.nextRombel.trim().toUpperCase();
      ringkasan.targetPerRombel[t] = (ringkasan.targetPerRombel[t] || 0) + g.ids.length;
    }
  }

  if (ganda.length > 0) {
    errors.push(`Siswa ditempatkan ganda di lebih dari satu rombel rencana: ${ganda.slice(0, 5).join(', ')}${ganda.length > 5 ? ` (+${ganda.length - 5} lagi)` : ''}.`);
  }
  if (takDikenal.length > 0) {
    errors.push(`Id rencana tidak ditemukan di daftar aktif: ${takDikenal.slice(0, 5).join(', ')}${takDikenal.length > 5 ? ` (+${takDikenal.length - 5} lagi)` : ''}.`);
  }

  // Siswa hilang: aktif tapi tidak direncanakan dan tidak dikecualikan.
  const takTertempat: string[] = [];
  for (const s of siswaAktif || []) {
    if (!terlihat.has(s.id) && !kecualiIds.has(s.id)) takTertempat.push(s.id);
  }
  if (takTertempat.length > 0) {
    errors.push(
      `${takTertempat.length} siswa aktif belum ditempatkan di rencana mana pun (bukan pengecualian): ${takTertempat.slice(0, 5).join(', ')}${takTertempat.length > 5 ? ` (+${takTertempat.length - 5} lagi)` : ''}. Susun ulang rencana atau kecualikan dengan alasan.`,
    );
  }

  // Konsistensi target: satu rombel tujuan tidak boleh menampung dua tingkat berbeda.
  const tingkatPerTarget = new Map<string, string>();
  for (const g of plan || []) {
    if (g.status === 'Lulus') continue;
    const t = (g.nextRombel || '').trim().toUpperCase();
    if (!t) continue;
    const prev = tingkatPerTarget.get(t);
    if (prev && prev !== g.nextTingkat) {
      errors.push(`Rombel tujuan ${t} dicampur dari tingkat ${prev} dan ${g.nextTingkat} — satu rombel tujuan hanya untuk satu tingkat.`);
    } else {
      tingkatPerTarget.set(t, g.nextTingkat);
    }
  }

  // Kapasitas: hanya bila data kapasitas tersedia untuk rombel tujuan.
  const kapasitas = args.kapasitas || {};
  for (const [rombel, jumlah] of Object.entries(ringkasan.targetPerRombel)) {
    const kap = kapasitas[rombel];
    if (typeof kap === 'number' && kap >= 0 && jumlah > kap) {
      errors.push(`Rombel tujuan ${rombel} melebihi kapasitas: ${jumlah} siswa direncanakan, kapasitas ${kap}.`);
    }
  }

  // Sudah dipromosi (info idempotensi, bukan error).
  const sudahDipromosi: string[] = [];
  if (args.tahunTutup) {
    for (const id of terlihat.keys()) {
      const s = aktifById.get(id);
      if (s && siswaSudahDipromosi(s, args.tahunTutup, args.tahunBaru)) sudahDipromosi.push(id);
    }
    if (sudahDipromosi.length > 0) {
      peringatan.push(`${sudahDipromosi.length} siswa sudah dipromosi untuk ${args.tahunTutup} — penerapan ulang akan melewati mereka (tanpa entri ganda).`);
    }
  }

  return { errors, peringatan, ringkasan, takTertempat, ganda, takDikenal, sudahDipromosi };
}

export interface HasilTerapPromosi {
  /** Siswa baru (satu entri riwayat promosi ditambahkan per siswa). */
  promosiBaru: Siswa[];
  /** Id yang dilewati karena sudah dipromosi (idempoten). */
  dilewatiSudahDipromosi: string[];
  /** Id yang dilewati karena tidak lagi Aktif saat penerapan. */
  dilewatiTidakAktif: string[];
  ringkasan: RingkasanRencana;
}

/**
 * Terapkan rencana ke daftar siswa (murni & imutabel). Melewati siswa yang
 * sudah dipromosi untuk tahun ini dan yang tidak lagi Aktif — keduanya
 * dilaporkan, bukan ditulis ganda. Pemanggil WAJIB memvalidasi dulu dengan
 * validasiRencanaPromosi; fungsi ini tidak melempar untuk kasus tersebut.
 */
export function terapkanRencanaPromosi(
  daftar: Siswa[],
  plan: RencanaPromosi[],
  args: { tahunTutup: string; tahunBaru: string; tebakTingkat?: (s: Siswa) => string },
): HasilTerapPromosi {
  const byId = new Map<string, Siswa>();
  for (const s of daftar || []) if (s.id) byId.set(s.id, s);
  const promosiBaru: Siswa[] = [];
  const dilewatiSudahDipromosi: string[] = [];
  const dilewatiTidakAktif: string[] = [];
  const ringkasan: RingkasanRencana = {
    lulus: 0,
    naik: 0,
    tinggal: 0,
    dikecualikan: 0,
    totalRencana: 0,
    targetPerRombel: {},
  };
  const nowIso = new Date().toISOString();

  for (const g of plan || []) {
    ringkasan.dikecualikan += (g.kecuali || []).length;
    const nextRombel = g.status === 'Lulus' ? g.rombel : g.nextRombel.trim().toUpperCase();
    for (const id of g.ids) {
      const s = byId.get(id);
      if (!s) continue;
      if (s.statusSiswa !== 'Aktif') {
        dilewatiTidakAktif.push(id);
        continue;
      }
      if (siswaSudahDipromosi(s, args.tahunTutup, args.tahunBaru)) {
        dilewatiSudahDipromosi.push(id);
        continue;
      }
      const tingkatLama = args.tebakTingkat ? args.tebakTingkat(s) : (s.rombelSaatIni || '').trim().charAt(0) || '';
      const riwayat: RiwayatTahunAjaran = {
        id: `rth-promosi-${Date.now().toString(36)}-${s.id}-${promosiBaru.length}`,
        tahunAjaran: args.tahunTutup.trim(),
        tingkat: tingkatLama as TingkatKelas,
        rombel: s.rombelSaatIni,
        statusAkhirTahun: g.status,
        statusKenaikan: g.status,
        catatan: `Kenaikan ke rombel ${nextRombel} TP ${args.tahunBaru}`,
      };
      promosiBaru.push({
        ...s,
        rombelSaatIni: g.status === 'Lulus' ? s.rombelSaatIni : nextRombel,
        statusSiswa: g.status === 'Lulus' ? 'Lulus' : 'Aktif',
        riwayatTahunAjaran: [...(s.riwayatTahunAjaran || []), riwayat],
        updatedAt: nowIso,
      });
      if (g.status === 'Lulus') ringkasan.lulus += 1;
      else if (g.status === 'Naik Kelas') ringkasan.naik += 1;
      else ringkasan.tinggal += 1;
      ringkasan.totalRencana += 1;
      if (g.status !== 'Lulus') {
        ringkasan.targetPerRombel[nextRombel] = (ringkasan.targetPerRombel[nextRombel] || 0) + 1;
      }
    }
  }
  return { promosiBaru, dilewatiSudahDipromosi, dilewatiTidakAktif, ringkasan };
}

export interface HasilBatalPromosi {
  /** Siswa yang dikembalikan (entri promosi dihapus, rombel/status pulih). */
  siswa: Siswa[];
  /** Id yang dilewati beserta alasannya (tidak diubah). */
  dilewati: { id: string; alasan: string }[];
}

/**
 * Batalkan promosi tahun yang ditutup (rollback). Hanya membalikkan efek
 * mekanis promosi: entri promosi tahun tersebut dihapus, rombel kembali ke
 * rombel lama, status kembali Aktif. Siswa yang statusnya berubah menjadi
 * non-Aktif setelah promosi (mutasi/dll) TIDAK disentuh. Entri riwayat
 * tahun lain tidak disentuh. Pemanggil bertanggung jawab atas penjagaan
 * tahun (mis. hanya bila tidak ada promosi tahun yang lebih baru).
 */
export function batalkanPromosi(
  daftar: Siswa[],
  args: { tahunTutup: string; tahunBaru: string },
): HasilBatalPromosi {
  const siswa: Siswa[] = [];
  const dilewati: { id: string; alasan: string }[] = [];
  const nowIso = new Date().toISOString();
  for (const s of daftar || []) {
    const entri = (s.riwayatTahunAjaran || []).filter((e) => isEntriPromosi(e, args.tahunTutup, args.tahunBaru));
    if (entri.length === 0) continue;
    if (s.statusSiswa === 'Mutasi Keluar' || s.statusSiswa === 'Mengundurkan Diri' || s.statusSiswa === 'Meninggal Dunia') {
      dilewati.push({ id: s.id, alasan: `status ${s.statusSiswa} setelah promosi — tidak dikembalikan` });
      continue;
    }
    const terakhir = entri[entri.length - 1];
    siswa.push({
      ...s,
      rombelSaatIni: terakhir.rombel,
      statusSiswa: 'Aktif',
      riwayatTahunAjaran: (s.riwayatTahunAjaran || []).filter((e) => !isEntriPromosi(e, args.tahunTutup, args.tahunBaru)),
      updatedAt: nowIso,
    });
  }
  return { siswa, dilewati };
}
