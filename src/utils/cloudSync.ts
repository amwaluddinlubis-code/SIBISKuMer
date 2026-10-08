// ---------------- SINKRON CLOUD ANTAR-PERANGKAT (Firestore + Storage, tier gratis) ----------------
// Model: tiap database sekolah ↔ satu "rumah cloud" `cloud/{kunciSekolah}`.
// Konflik: last-write-wins per record (updatedAt ISO). Hapus dirambatkan via
// tombstone 30 hari. Foto data-URL dikecilkan jadi mini JPEG ≤60KB
// (field fotoMini, tanpa Storage) agar muat limit 1 MiB/dokumen Firestore.
//
// TIDAK disinkronkan (disengaja): config Dapodik (per-mesin), sync_logs,
// audit_logs, snapshot auto-backup, state kunci login & sesi.
//
// Kuota gratis (acuan 2026): 50rb baca + 20rb tulis/hari. Satu sinkron penuh
// ≈ baca sejumlah dokumen + tulis hanya yang berubah (baca-banding dulu).

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import type {
  Siswa,
  AppUser,
  SekolahProfile,
  RombelRef,
  PtkRef,
  TutupTahunAjaran,
  PetaKelas,
} from '../types';
import {
  getAllSiswa,
  saveSiswaBulk,
  deleteSiswa,
  getAllUsers,
  saveUser,
  deleteUser,
  getSekolahProfile,
  saveSekolahProfile,
  getAllRombelRefs,
  saveRombelRefs,
  getAllPtkRefs,
  savePtkRefs,
  getTutupTahun,
  saveTutupTahun,
  deleteTutupTahun,
  getAllPetaKelas,
  savePetaKelasList,
  getActiveSchool,
  getActiveDbName,
  scopedStorageKey,
  storageKeys,
} from './db';
import { firestoreDb, firebaseAuth } from './firebaseApp';
import { hashPassword, verifyPassword } from './password';
import { buatFotoMiniCloud } from './photo';
import {
  muatTombstoneLokal,
  type Tombstone,
} from './tombstone';

const BATAS_DOKUMEN = 900_000; // byte — jaga-jaga di bawah limit 1 MiB Firestore
const BATCH_TULIS = 400;

type Koleksi = 'siswa' | 'pengguna' | 'rombel' | 'ptk' | 'tutup' | 'peta';

export interface ProgresCloud {
  (tahap: string, persen: number): void;
}

export interface HasilCloud {
  diunduh: number;
  diunggah: number;
  dilewati: string[];
  peringatan: string[];
}

// ---------- Kunci sekolah & status ----------

/** Kunci rumah cloud: NPSN bila ada, sonst nama database (disanitasi). */
export function kunciSekolahCloud(): string {
  try {
    const sk = getActiveSchool();
    const mentah = (sk?.npsn || '').trim() || getActiveDbName();
    return mentah.replace(/[/\\#?[\]]/g, '_').slice(0, 120) || 'sekolah';
  } catch {
    return 'sekolah';
  }
}

function kunciLs(suffix: string): string {
  return scopedStorageKey(`${storageKeys.CLOUDSYNC}_${suffix}`);
}

function kunciPinSesi(): string {
  return `cloudPinOk_${kunciSekolahCloud()}`;
}

/** PIN terverifikasi di sesi tab ini? */
export function apakahPinTerverifikasi(): boolean {
  try {
    return sessionStorage.getItem(kunciPinSesi()) === '1';
  } catch {
    return false;
  }
}

function wajibLogin(): void {
  if (!firebaseAuth.currentUser) {
    throw new Error('Masuk dengan Google dulu sebelum sinkron cloud.');
  }
}

function wajibPin(): void {
  if (!apakahPinTerverifikasi()) {
    throw new Error('Verifikasi PIN sekolah dulu sebelum sinkron cloud.');
  }
}

// ---------- PIN sekolah (gerbang sisi klien) ----------

export async function adaCloudSekolah(): Promise<boolean> {
  wajibLogin();
  const snap = await getDoc(doc(firestoreDb, 'cloud', kunciSekolahCloud()));
  return snap.exists();
}

/**
 * Buat rumah cloud + PIN (perangkat pertama) ATAU verifikasi PIN (perangkat lain).
 * PIN tidak pernah disimpan plaintext — hanya hash PBKDF2.
 */
export async function siapkanPinCloud(pin: string): Promise<{ baru: boolean }> {
  wajibLogin();
  const p = (pin || '').trim();
  if (p.length < 4) throw new Error('PIN minimal 4 karakter.');
  const refRoot = doc(firestoreDb, 'cloud', kunciSekolahCloud());
  const snap = await getDoc(refRoot);
  if (!snap.exists()) {
    await setDoc(refRoot, {
      pinHash: await hashPassword(p),
      dibuatPada: new Date().toISOString(),
      dibuatOleh: firebaseAuth.currentUser?.email || 'perangkat',
    });
    try {
      sessionStorage.setItem(kunciPinSesi(), '1');
    } catch {
      /* abaikan */
    }
    return { baru: true };
  }
  const data = snap.data() as { pinHash?: string };
  const hasil = await verifyPassword(p, data.pinHash);
  // Kompatibel: rumah lama tanpa hash (tidak seharusnya ada) → adopsi PIN ini.
  if (!hasil.ok && !data.pinHash) {
    await setDoc(refRoot, { pinHash: await hashPassword(p) }, { merge: true });
  } else if (!hasil.ok) {
    throw new Error('PIN salah.');
  }
  try {
    sessionStorage.setItem(kunciPinSesi(), '1');
  } catch {
    /* abaikan */
  }
  return { baru: false };
}

// ---------- Tombstone: baca dari modul khusus (lihat tombstone.ts) ----------

// ---------- Merge murni (dapat diuji tanpa Firebase) ----------

export interface HasilGabung<T> {
  hasil: T[];
  menangCloud: T[];
  menangLokal: T[];
}

/**
 * Gabung last-write-wins berdasar stempel waktu. Record tanpa stempel
 * dianggap paling tua (kalah) — tidak pernah menimpa yang berstempel.
 */
export function gabungLww<T>(
  lokal: T[],
  cloud: T[],
  ambilId: (r: T) => string,
  ambilTs: (r: T) => string
): HasilGabung<T> {
  const peta = new Map<string, { l?: T; c?: T }>();
  for (const r of lokal || []) {
    const id = ambilId(r);
    if (id) peta.set(id, { ...(peta.get(id) || {}), l: r });
  }
  for (const r of cloud || []) {
    const id = ambilId(r);
    if (id) peta.set(id, { ...(peta.get(id) || {}), c: r });
  }
  const hasil: T[] = [];
  const menangCloud: T[] = [];
  const menangLokal: T[] = [];
  for (const { l, c } of peta.values()) {
    if (l && !c) {
      hasil.push(l);
      menangLokal.push(l);
    } else if (c && !l) {
      hasil.push(c);
      menangCloud.push(c);
    } else if (l && c) {
      const tl = ambilTs(l) || '';
      const tc = ambilTs(c) || '';
      if (tc > tl) {
        hasil.push(c);
        menangCloud.push(c);
      } else if (tl > tc) {
        hasil.push(l);
        menangLokal.push(l);
      } else {
        hasil.push(l); // seri → lokal menang (hindari tulis ulang)
      }
    }
  }
  return { hasil, menangCloud, menangLokal };
}

function tsOf(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function ukuranJson(v: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(v)).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function hashSederhana(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// ---------- Baca cloud ----------

interface PotretCloud {
  siswa: Siswa[];
  pengguna: AppUser[];
  rombel: RombelRef[];
  ptk: PtkRef[];
  tutup: TutupTahunAjaran[];
  peta: PetaKelas[];
  profil: { data: SekolahProfile; updatedAt: string } | null;
  hapus: Tombstone[];
}

async function ambilKoleksi<T>(key: string, coll: string): Promise<T[]> {
  const snap = await getDocs(collection(firestoreDb, 'cloud', key, coll));
  const out: T[] = [];
  snap.forEach((d) => {
    const data = d.data() as T;
    if (data && typeof data === 'object') out.push(data);
  });
  return out;
}

async function ambilCloud(key: string, laporkan?: ProgresCloud): Promise<PotretCloud> {
  laporkan?.('Membaca data cloud…', 5);
  const [siswa, pengguna, rombel, ptk, tutup, peta, hapus] = await Promise.all([
    ambilKoleksi<Siswa>(key, 'siswa'),
    ambilKoleksi<AppUser>(key, 'pengguna'),
    ambilKoleksi<RombelRef>(key, 'rombel'),
    ambilKoleksi<PtkRef>(key, 'ptk'),
    ambilKoleksi<TutupTahunAjaran>(key, 'tutup'),
    ambilKoleksi<PetaKelas>(key, 'peta'),
    ambilKoleksi<Tombstone>(key, 'hapus'),
  ]);
  let profil: PotretCloud['profil'] = null;
  try {
    const ps = await getDoc(doc(firestoreDb, 'cloud', key, 'meta', 'profil'));
    if (ps.exists()) profil = ps.data() as PotretCloud['profil'];
  } catch {
    /* profil opsional */
  }
  laporkan?.('Membaca data cloud…', 15);
  return { siswa, pengguna, rombel, ptk, tutup, peta, profil, hapus };
}

// ---------- Tulis batch ----------

async function tulisBatch(
  key: string,
  coll: string,
  records: Array<{ id: string; data: unknown }>,
  peringatan: string[]
): Promise<number> {
  let ditulis = 0;
  for (let i = 0; i < records.length; i += BATCH_TULIS) {
    const batch = writeBatch(firestoreDb);
    for (const r of records.slice(i, i + BATCH_TULIS)) {
      if (ukuranJson(r.data) > BATAS_DOKUMEN) {
        peringatan.push(`${coll}/${r.id} melebihi ~900KB — dilewati.`);
        continue;
      }
      batch.set(doc(firestoreDb, 'cloud', key, coll, r.id), r.data as Record<string, unknown>);
      ditulis++;
    }
    await batch.commit();
  }
  return ditulis;
}

async function hapusBatch(key: string, coll: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += BATCH_TULIS) {
    const batch = writeBatch(firestoreDb);
    for (const id of ids.slice(i, i + BATCH_TULIS)) {
      batch.delete(doc(firestoreDb, 'cloud', key, coll, id));
    }
    await batch.commit();
  }
}

// ---------- Foto mini via Firestore (tanpa Storage) ----------

function adalahDataUrl(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:image/');
}

/**
 * Siapkan salinan unggah: foto data-URL (hingga 500KB, jebol limit dokumen)
 * diganti mini JPEG ≤60KB di field fotoMini; fotoUrl data-URL dibuang dari
 * payload cloud. Record lokal TIDAK diubah (foto asli tetap di perangkat).
 */
async function siapkanFotoCloud(s: Siswa, peringatan: string[]): Promise<Siswa> {
  if (!adalahDataUrl(s.fotoUrl)) return s;
  const salin: Siswa = { ...s, fotoUrl: undefined };
  try {
    const mini = await buatFotoMiniCloud(s.fotoUrl);
    if (mini) {
      salin.fotoMini = mini.dataUrl;
    } else {
      peringatan.push(`Foto ${s.namaLengkap || s.id} terlalu besar untuk cloud — teks tetap disinkron.`);
    }
  } catch {
    peringatan.push(`Foto ${s.namaLengkap || s.id} gagal dikecilkan — teks tetap disinkron.`);
  }
  return salin;
}

/** Sambut record cloud: fotoMini jadi fotoUrl bila perangkat ini belum punya foto. */
function sambutFotoCloud<T extends Siswa>(daftar: T[]): T[] {
  return daftar.map((s) => {
    if (!adalahDataUrl(s.fotoUrl) && typeof s.fotoMini === 'string' && s.fotoMini.startsWith('data:image/')) {
      return { ...s, fotoUrl: s.fotoMini };
    }
    return s;
  });
}

// ---------- Tarik (cloud → lokal) ----------

async function gabungKeLokal(potret: PotretCloud, laporkan?: ProgresCloud): Promise<HasilCloud> {
  const hasil: HasilCloud = { diunduh: 0, diunggah: 0, dilewati: [], peringatan: [] };
  const tombLokal = muatTombstoneLokal();
  const tombCloud = (potret.hapus || []).filter((t) => t && t.coll && t.id && t.ts);
  const kunciTomb = (t: Tombstone) => `${t.coll}:${t.id}`;

  // 1. Terapkan tombstone cloud (hapus lokal yang kalah) + tentukan yang gugur.
  const tombCloudBerlaku: Tombstone[] = [];
  {
    const lokalSiswa = await getAllSiswa();
    const lokalUsers = await getAllUsers();
    const lokalTutup = await getTutupTahun();
    const hapusSiswa: string[] = [];
    const hapusUsers: string[] = [];
    const hapusTutup: string[] = [];
    const gugur = new Set<string>();
    for (const t of tombCloud) {
      if (t.coll === 'siswa') {
        const l = lokalSiswa.find((s) => s.id === t.id);
        if (!l) continue;
        if (tsOf((l as Siswa).updatedAt) > t.ts) gugur.add(kunciTomb(t)); // lokal diedit sesudah hapus → hidup lagi
        else hapusSiswa.push(t.id);
      } else if (t.coll === 'pengguna') {
        const l = lokalUsers.find((u) => u.id === t.id);
        if (!l) continue;
        if (tsOf(l.updatedAt) > t.ts) gugur.add(kunciTomb(t));
        else hapusUsers.push(t.id);
      } else if (t.coll === 'tutup') {
        const l = lokalTutup.find((x) => x.tahunAjaran === t.id);
        if (!l) continue;
        if (tsOf(l.ditutupPada) > t.ts) gugur.add(kunciTomb(t));
        else hapusTutup.push(t.id);
      }
    }
    for (const id of hapusSiswa) await deleteSiswa(id).catch(() => undefined);
    for (const id of hapusUsers) await deleteUser(id).catch(() => undefined);
    for (const id of hapusTutup) await deleteTutupTahun(id).catch(() => undefined);
    hasil.diunduh += hapusSiswa.length + hapusUsers.length + hapusTutup.length;
    for (const t of tombCloud) {
      if (!gugur.has(kunciTomb(t))) tombCloudBerlaku.push(t);
    }
    // Simpan daftar gugur untuk dihapus dari cloud saat dorong.
    (hasil as { gugurCloud?: Tombstone[] }).gugurCloud = tombCloud.filter((t) => gugur.has(kunciTomb(t)));
  }

  // 2. Merge koleksi (LWW) — tulis yang menang-cloud ke lokal.
  laporkan?.('Menggabungkan data…', 25);
  const setTombLokal = new Set(tombLokal.map(kunciTomb));
  const hidup = <T>(arr: T[], coll: string, ambilId: (r: T) => string): T[] =>
    arr.filter((r) => !setTombLokal.has(`${coll}:${ambilId(r)}`));

  const lokSiswa = hidup(await getAllSiswa(), 'siswa', (s) => s.id).filter(
    (s) => !tombCloudBerlaku.some((t) => t.coll === 'siswa' && t.id === s.id)
  );
  const gSiswa = gabungLww(lokSiswa, potret.siswa, (s) => s.id, (s) => tsOf(s.updatedAt));
  if (gSiswa.menangCloud.length > 0) {
    await saveSiswaBulk(sambutFotoCloud(gSiswa.menangCloud));
    hasil.diunduh += gSiswa.menangCloud.length;
  }

  const lokUsers = hidup(await getAllUsers(), 'pengguna', (u) => u.id).filter(
    (u) => !tombCloudBerlaku.some((t) => t.coll === 'pengguna' && t.id === u.id)
  );
  const gUsers = gabungLww(lokUsers, potret.pengguna, (u) => u.id, (u) => tsOf(u.updatedAt));
  for (const u of gUsers.menangCloud) await saveUser(u).catch(() => undefined);
  hasil.diunduh += gUsers.menangCloud.length;

  const gRombel = gabungLww(await getAllRombelRefs(), potret.rombel, (r) => r.id, (r) => tsOf(r.updatedAt));
  if (gRombel.menangCloud.length > 0) {
    await saveRombelRefs(gRombel.menangCloud);
    hasil.diunduh += gRombel.menangCloud.length;
  }

  const gPtk = gabungLww(await getAllPtkRefs(), potret.ptk, (r) => r.id, (r) => tsOf(r.updatedAt));
  if (gPtk.menangCloud.length > 0) {
    await savePtkRefs(gPtk.menangCloud);
    hasil.diunduh += gPtk.menangCloud.length;
  }

  const lokTutup = (await getTutupTahun()).filter(
    (t) => !tombCloudBerlaku.some((x) => x.coll === 'tutup' && x.id === t.tahunAjaran)
  );
  const gTutup = gabungLww(lokTutup, potret.tutup, (t) => t.tahunAjaran, (t) => tsOf(t.ditutupPada));
  for (const t of gTutup.menangCloud) await saveTutupTahun(t).catch(() => undefined);
  hasil.diunduh += gTutup.menangCloud.length;

  const gPeta = gabungLww(await getAllPetaKelas(), potret.peta, (p) => p.id, (p) => tsOf(p.updatedAt));
  if (gPeta.menangCloud.length > 0) {
    await savePetaKelasList(gPeta.menangCloud);
    hasil.diunduh += gPeta.menangCloud.length;
  }

  // 3. Profil sekolah (envelope + deteksi perubahan lokal via hash).
  try {
    const lokProfil = await getSekolahProfile();
    const hashLok = hashSederhana(JSON.stringify(lokProfil));
    const terakhir = localStorage.getItem(kunciLs('profilHash'));
    if (potret.profil && potret.profil.data) {
      const hashCloud = hashSederhana(JSON.stringify(potret.profil.data));
      const cloudBaru = (potret.profil.updatedAt || '') > (localStorage.getItem(kunciLs('profilTs')) || '');
      if (hashCloud !== hashLok && cloudBaru) {
        await saveSekolahProfile(potret.profil.data);
        localStorage.setItem(kunciLs('profilHash'), hashCloud);
        localStorage.setItem(kunciLs('profilTs'), potret.profil.updatedAt || new Date().toISOString());
        hasil.diunduh += 1;
      } else if (terakhir === null) {
        localStorage.setItem(kunciLs('profilHash'), hashLok);
      }
    } else if (terakhir === null) {
      localStorage.setItem(kunciLs('profilHash'), hashLok);
    }
  } catch {
    /* profil opsional */
  }

  // Simpan potret untuk fase dorong (hindari baca ulang).
  (hasil as { _gabung?: unknown })._gabung = {
    gSiswa,
    gUsers,
    gRombel,
    gPtk,
    gTutup,
    gPeta,
    tombLokal,
    tombCloudBerlaku,
  };
  return hasil;
}

// ---------- Dorong (lokal → cloud) ----------

async function dorongKeCloud(
  key: string,
  potret: PotretCloud,
  gabung: {
    gSiswa: HasilGabung<Siswa>;
    gUsers: HasilGabung<AppUser>;
    gRombel: HasilGabung<RombelRef>;
    gPtk: HasilGabung<PtkRef>;
    gTutup: HasilGabung<TutupTahunAjaran>;
    gPeta: HasilGabung<PetaKelas>;
    tombLokal: Tombstone[];
    tombCloudBerlaku: Tombstone[];
  },
  gugurCloud: Tombstone[],
  laporkan?: ProgresCloud
): Promise<HasilCloud> {
  const hasil: HasilCloud = { diunduh: 0, diunggah: 0, dilewati: [], peringatan: [] };
  laporkan?.('Mengunggah perubahan…', 60);

  // D1: dideklarasikan SEBELUM dipakai (sebelumnya TDZ ReferenceError).
  const cloudIds = {
    siswa: new Set(potret.siswa.map((s) => s.id)),
    pengguna: new Set(potret.pengguna.map((u) => u.id)),
    rombel: new Set(potret.rombel.map((r) => r.id)),
    ptk: new Set(potret.ptk.map((r) => r.id)),
    tutup: new Set(potret.tutup.map((t) => t.tahunAjaran)),
    peta: new Set(potret.peta.map((p) => p.id)),
  };

  // Foto dulu (mini via Firestore, di luar dokumen utama bila perlu).
  // Payload unggah = salinan (foto asli tetap di perangkat ini).
  // Berlaku untuk yang menang-lokal MAUPUN yang baru (keduanya bisa berfoto).
  const kandidatSiswa = [
    ...gabung.gSiswa.menangLokal,
    ...(await getAllSiswa()).filter((s) => !cloudIds.siswa.has(s.id)),
  ];
  const dilihat = new Set<string>();
  const naikSiswa: Siswa[] = [];
  for (const s of kandidatSiswa) {
    if (!s || !s.id || dilihat.has(s.id)) continue;
    dilihat.add(s.id);
    naikSiswa.push(await siapkanFotoCloud(s, hasil.peringatan));
  }

  // Unggah yang menang-lokal ATAU yang belum ada di cloud (baru).
  hasil.diunggah += await tulisBatch(
    key,
    'siswa',
    naikSiswa.map((s) => ({ id: s.id, data: s })),
    hasil.peringatan
  );

  laporkan?.('Mengunggah perubahan…', 72);
  const baruUsers = (await getAllUsers()).filter((u) => !cloudIds.pengguna.has(u.id));
  hasil.diunggah += await tulisBatch(
    key,
    'pengguna',
    [...gabung.gUsers.menangLokal, ...baruUsers].map((u) => ({ id: u.id, data: u })),
    hasil.peringatan
  );

  const baruRombel = (await getAllRombelRefs()).filter((r) => !cloudIds.rombel.has(r.id));
  hasil.diunggah += await tulisBatch(
    key,
    'rombel',
    [...gabung.gRombel.menangLokal, ...baruRombel].map((r) => ({ id: r.id, data: r })),
    hasil.peringatan
  );

  const baruPtk = (await getAllPtkRefs()).filter((r) => !cloudIds.ptk.has(r.id));
  hasil.diunggah += await tulisBatch(
    key,
    'ptk',
    [...gabung.gPtk.menangLokal, ...baruPtk].map((r) => ({ id: r.id, data: r })),
    hasil.peringatan
  );

  laporkan?.('Mengunggah perubahan…', 82);
  const baruTutup = (await getTutupTahun()).filter((t) => !cloudIds.tutup.has(t.tahunAjaran));
  hasil.diunggah += await tulisBatch(
    key,
    'tutup',
    [...gabung.gTutup.menangLokal, ...baruTutup].map((t) => ({ id: t.tahunAjaran, data: t })),
    hasil.peringatan
  );

  const baruPeta = (await getAllPetaKelas()).filter((p) => !cloudIds.peta.has(p.id));
  hasil.diunggah += await tulisBatch(
    key,
    'peta',
    [...gabung.gPeta.menangLokal, ...baruPeta].map((p) => ({ id: p.id, data: p })),
    hasil.peringatan
  );

  // Profil: unggah bila hash lokal berubah sejak sinkron terakhir.
  try {
    const lokProfil = await getSekolahProfile();
    const hashLok = hashSederhana(JSON.stringify(lokProfil));
    if (hashLok !== localStorage.getItem(kunciLs('profilHash'))) {
      const now = new Date().toISOString();
      await setDoc(doc(firestoreDb, 'cloud', key, 'meta', 'profil'), { data: lokProfil, updatedAt: now });
      localStorage.setItem(kunciLs('profilHash'), hashLok);
      localStorage.setItem(kunciLs('profilTs'), now);
      hasil.diunggah += 1;
    }
  } catch {
    /* profil opsional */
  }

  // Tombstone: unggah lokal (+ hapus dokumen cloud-nya agar tak hidup lagi)
  // + hapus tombstone yang gugur di cloud.
  laporkan?.('Menyelaraskan data hapus…', 92);
  const segar = muatTombstoneLokal();
  const collCloud: Record<string, string> = { siswa: 'siswa', pengguna: 'pengguna', tutup: 'tutup' };
  if (segar.length > 0) {
    await tulisBatch(
      key,
      'hapus',
      segar.map((t) => ({ id: `${t.coll}_${t.id}`, data: t })),
      hasil.peringatan
    );
    hasil.diunggah += segar.length;
    // Hapus dokumen aslinya per koleksi (hindari resurrect saat merge).
    const perColl = new Map<string, string[]>();
    for (const t of segar) {
      const cc = collCloud[t.coll];
      if (!cc) continue;
      if (!perColl.has(cc)) perColl.set(cc, []);
      perColl.get(cc)?.push(t.id);
    }
    for (const [cc, ids] of perColl) {
      await hapusBatch(key, cc, ids).catch(() => undefined);
    }
  }
  if (gugurCloud.length > 0) {
    await hapusBatch(
      key,
      'hapus',
      gugurCloud.map((t) => `${t.coll}_${t.id}`)
    ).catch(() => undefined);
  }
  return hasil;
}

// ---------- API publik ----------

function simpanStatusTerakhir(arah: string, ringkasan: string): void {
  try {
    localStorage.setItem(
      kunciLs('status'),
      JSON.stringify({ terakhirSinkron: new Date().toISOString(), arah, ringkasan })
    );
  } catch {
    /* abaikan */
  }
}

export function statusCloudTerakhir(): { terakhirSinkron?: string; arah?: string; ringkasan?: string } {
  try {
    const raw = localStorage.getItem(kunciLs('status'));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Unduh cloud → lokal (gabung LWW). */
export async function tarikCloud(laporkan?: ProgresCloud): Promise<HasilCloud> {
  wajibLogin();
  wajibPin();
  const key = kunciSekolahCloud();
  const potret = await ambilCloud(key, laporkan);
  const hasil = await gabungKeLokal(potret, laporkan);
  laporkan?.('Selesai.', 100);
  simpanStatusTerakhir('unduh', `↓ ${hasil.diunduh} diterapkan ke perangkat ini`);
  return hasil;
}

/** Unggah lokal → cloud (hanya yang baru/berubah). */
export async function unggahCloud(laporkan?: ProgresCloud): Promise<HasilCloud> {
  wajibLogin();
  wajibPin();
  const key = kunciSekolahCloud();
  const potret = await ambilCloud(key, laporkan);
  // Gabung dulu agar perbandingan akurat, tanpa menulis lokal dua kali:
  // (gabungKeLokal idempoten — menang-cloud sudah diterapkan di tarik terpisah.)
  const tarik = await gabungKeLokal(potret, laporkan);
  const g = (tarik as unknown as { _gabung: Parameters<typeof dorongKeCloud>[2] })._gabung;
  const gugur = (tarik as unknown as { gugurCloud?: Tombstone[] }).gugurCloud || [];
  const hasil = await dorongKeCloud(key, potret, g, gugur, laporkan);
  laporkan?.('Selesai.', 100);
  simpanStatusTerakhir('unggah', `↑ ${hasil.diunggah} diunggah ke cloud`);
  return { ...hasil, diunduh: tarik.diunduh, peringatan: [...tarik.peringatan, ...hasil.peringatan] };
}

/** Sinkron penuh: tarik lalu dorong dalam satu potret baca. */
export async function sinkronCloud(laporkan?: ProgresCloud): Promise<HasilCloud> {
  wajibLogin();
  wajibPin();
  const key = kunciSekolahCloud();
  const potret = await ambilCloud(key, laporkan);
  const tarik = await gabungKeLokal(potret, laporkan);
  const g = (tarik as unknown as { _gabung: Parameters<typeof dorongKeCloud>[2] })._gabung;
  const gugur = (tarik as unknown as { gugurCloud?: Tombstone[] }).gugurCloud || [];
  const dorong = await dorongKeCloud(key, potret, g, gugur, laporkan);
  laporkan?.('Selesai.', 100);
  const hasil: HasilCloud = {
    diunduh: tarik.diunduh,
    diunggah: dorong.diunggah,
    dilewati: [...tarik.dilewati, ...dorong.dilewati],
    peringatan: [...tarik.peringatan, ...dorong.peringatan],
  };
  simpanStatusTerakhir('sinkron', `↓ ${hasil.diunduh} • ↑ ${hasil.diunggah}`);
  return hasil;
}
