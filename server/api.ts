// Router API v1 SIBISKuMer (Fase S1 migrasi SQLite).
//
// Kontrak respons seragam: { ok: true, data } atau { ok: false, pesan }.
// Semua endpoint data mensyaratkan sesi server (cookie HttpOnly
// 'sibis_sesi'); otorisasi peran + rombel ditegakkan DI SINI, di server,
// meniru aturan klien (filterSiswaByAccess / canUserAccessRombel).
import { Router, type Request, type Response, type NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  dbSekolah,
  daftarSekolah,
  simpanEntriSekolah,
  ambilMeta,
  simpanMeta,
  semuaSiswa,
  siswaById,
  simpanSiswa,
  hapusSiswa,
  jumlahSiswa,
  semuaUsers,
  userById,
  simpanUser,
  hapusUser,
  semuaKoleksi,
  simpanKoleksi,
  hapusKoleksi,
  gantiKoleksi,
  daftarSnapshot,
  simpanSnapshot,
  ambilSnapshot,
  hapusSnapshot,
  buatSnapshotBerkas,
  daftarSnapshotBerkas,
  pulihkanSnapshotBerkas,
  hapusSnapshotBerkas,
  lokasiSnapshotBerkas,
  berkasUnduhDb,
  dalamTransaksi,
  idSekolahAman,
  ENTITAS_KOLEKSI,
  SKEMA_VERSI,
} from './db';
import {
  pastikanSiap,
  loginServer,
  sesiDariToken,
  akhiriSesi,
  gantiSandiSesi,
  buatSesiImpersonate,
  akhiriImpersonate,
  apakahBenihAwal,
  userPublik,
  bolehAksesRombel,
  siswaTerlihat,
  adalahAdmin,
  type SesiServer,
} from './auth';
import { hashPassword, isHashedPassword } from '../src/utils/password';
import {
  tambahIntegritas,
  periksaIntegritas,
  validasiStrukturBackup,
  validasiKompatibilitas,
  BACKUP_FORMAT_VERSION,
} from '../src/utils/backupIntegrity';
import { defaultDapodikConfig } from '../src/data/initialData';

const COOKIE_SESI = 'sibis_sesi';

interface ReqBersesi extends Request {
  sesi?: SesiServer;
  user?: any;
}

function kirimOk(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ ok: true, data });
}

function kirimGagal(res: Response, status: number, pesan: string): void {
  res.status(status).json({ ok: false, pesan });
}

function tokenDariReq(req: Request): string | null {
  const mentah = req.headers.cookie || '';
  for (const bagian of mentah.split(';')) {
    const [k, ...sisa] = bagian.trim().split('=');
    if (k === COOKIE_SESI) return decodeURIComponent(sisa.join('=') || '');
  }
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

function pasangCookieSesi(res: Response, token: string): void {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_SESI}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${12 * 3600}`
  );
}

function hapusCookieSesi(res: Response): void {
  res.setHeader('Set-Cookie', `${COOKIE_SESI}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

async function perluSesi(req: ReqBersesi, res: Response, next: NextFunction): Promise<void> {
  await pastikanSiap();
  const sesi = sesiDariToken(tokenDariReq(req));
  if (!sesi) {
    kirimGagal(res, 401, 'Sesi tidak ditemukan atau sudah kedaluwarsa. Silakan masuk kembali.');
    return;
  }
  const user = userById(dbSekolah(sesi.sekolahId), sesi.userId);
  if (!user || user.status === 'nonaktif') {
    kirimGagal(res, 401, 'Akun sesi tidak lagi aktif.');
    return;
  }
  req.sesi = sesi;
  req.user = user;
  next();
}

function perluAdmin(req: ReqBersesi, res: Response, next: NextFunction): void {
  if (!adalahAdmin(req.user)) {
    kirimGagal(res, 403, 'Hanya administrator yang dapat melakukan tindakan ini.');
    return;
  }
  next();
}

/** Rakit payload backup dari SQLite — bentuk identik exportAllData klien. */
export async function rakitPayloadBackup(sekolahId: string): Promise<any> {
  const db = dbSekolah(sekolahId);
  const profil = ambilMeta(db, 'profil_sekolah');
  const cfgDapodik: any = ambilMeta(db, 'config_dapodik') || { ...defaultDapodikConfig };
  const audit = semuaKoleksi(db, 'audit_logs')
    .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
    .slice(0, 500);
  const payload: any = {
    app: 'Buku Induk Siswa Kurikulum Merdeka',
    version: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    sekolah: profil,
    // S7: token Web Service Dapodik TIDAK ikut ke berkas backup.
    dapodikConfig: { ...cfgDapodik, token: '' },
    siswa: semuaSiswa(db),
    syncLogs: semuaKoleksi(db, 'sync_logs'),
    users: semuaUsers(db),
    rombel: semuaKoleksi(db, 'rombel'),
    ptk: semuaKoleksi(db, 'ptk'),
    tutupTahun: semuaKoleksi(db, 'tutup_tahun'),
    petaKelas: semuaKoleksi(db, 'peta_kelas'),
    audit,
  };
  try {
    return await tambahIntegritas(payload);
  } catch {
    return payload;
  }
}

/** Tulis payload backup ke SQLite dalam SATU transaksi (pengganti total
 *  data sekolah). Mengembalikan ringkasan hitungan. Token Dapodik lama
 *  dipertahankan bila payload tidak membawanya (ekspor memang
 *  mengosongkannya). */
export function tulisPayloadBackup(sekolahId: string, payload: any): Record<string, number> {
  // Impor menandai basis data sebagai berisi data nyata (gerbang
  // migrasi otomatis Fase S4 berhenti menawarkan). Penanda seed_awal
  // TIDAK dihapus — pastikanSiap memakainya agar benih tidak ditanam
  // ulang; status benih-awal dihitung dari kedua penanda ini.
  try {
    simpanMeta(dbSekolah(sekolahId), 'data_nyata', { pada: new Date().toISOString() });
  } catch {
    /* abaikan */
  }
  const db = dbSekolah(sekolahId);
  const hitungan: Record<string, number> = {};
  dalamTransaksi(db, () => {
    // Snapshot pengaman keadaan sebelumnya.
    const idPengaman = `pengaman-impor-${Date.now()}`;
    const payloadLamaJson = JSON.stringify({
      siswa: semuaSiswa(db),
      users: semuaUsers(db),
    });
    simpanSnapshot(db, idPengaman, payloadLamaJson, jumlahSiswa(db));

    db.prepare('DELETE FROM siswa').run();
    db.prepare('DELETE FROM users').run();
    db.prepare('DELETE FROM baris').run();

    for (const s of payload.siswa || []) simpanSiswa(db, s);
    for (const u of payload.users || []) simpanUser(db, u);
    for (const r of payload.rombel || []) simpanKoleksi(db, 'rombel', r);
    for (const p of payload.ptk || []) simpanKoleksi(db, 'ptk', p);
    for (const t of payload.tutupTahun || []) simpanKoleksi(db, 'tutup_tahun', t);
    for (const p of payload.petaKelas || []) simpanKoleksi(db, 'peta_kelas', p);
    for (const l of payload.syncLogs || []) simpanKoleksi(db, 'sync_logs', l);
    for (const a of payload.audit || []) simpanKoleksi(db, 'audit_logs', a);
    if (payload.sekolah) simpanMeta(db, 'profil_sekolah', payload.sekolah);
    if (payload.dapodikConfig) {
      const cfgLama: any = ambilMeta(db, 'config_dapodik') || {};
      const cfgBaru = { ...payload.dapodikConfig };
      if (!cfgBaru.token && cfgLama.token) cfgBaru.token = cfgLama.token;
      simpanMeta(db, 'config_dapodik', cfgBaru);
    }
    hitungan.siswa = (payload.siswa || []).length;
    hitungan.users = (payload.users || []).length;
    hitungan.rombel = (payload.rombel || []).length;
    hitungan.ptk = (payload.ptk || []).length;
    hitungan.tutupTahun = (payload.tutupTahun || []).length;
    hitungan.petaKelas = (payload.petaKelas || []).length;
    hitungan.audit = (payload.audit || []).length;
    hitungan.syncLogs = (payload.syncLogs || []).length;
  });
  return hitungan;
}

export function buatRouterV1(): Router {
  const r = Router();

  r.get('/health', async (_req, res) => {
    await pastikanSiap();
    kirimOk(res, { status: 'ok', skema: SKEMA_VERSI, sekolah: daftarSekolah().length });
  });

  // ---------- Sekolah (daftar bersifat publik untuk layar pilih sekolah) ----------
  r.get('/sekolah', async (_req, res) => {
    await pastikanSiap();
    kirimOk(res, daftarSekolah());
  });

  r.post('/sekolah', perluSesi, perluAdmin, (req: ReqBersesi, res) => {
    const { nama, npsn, jenjang } = req.body || {};
    if (!nama || !String(nama).trim()) return kirimGagal(res, 400, 'Nama sekolah wajib diisi.');
    const id = `sk${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
    const entri = { id, nama: String(nama).trim(), npsn: String(npsn || ''), jenjang: String(jenjang || '') };
    simpanEntriSekolah(entri);
    const db = dbSekolah(id);
    simpanMeta(db, 'profil_sekolah', {
      nama: entri.nama,
      npsn: entri.npsn,
      jenjang: entri.jenjang,
    });
    simpanMeta(db, 'config_dapodik', { ...defaultDapodikConfig, npsn: entri.npsn });
    kirimOk(res, entri, 201);
  });

  // ---------- Auth ----------
  r.post('/auth/login', async (req, res) => {
    const { sekolahId, username, password } = req.body || {};
    if (!username || typeof password !== 'string') {
      return kirimGagal(res, 400, 'Username dan kata sandi wajib diisi.');
    }
    const id = typeof sekolahId === 'string' && sekolahId ? idSekolahAman(sekolahId) : 'utama';
    const hasil = await loginServer(id, String(username), password);
    if (hasil.ok === false) {
      return kirimGagal(res, hasil.terkunci ? 423 : 401, hasil.pesan);
    }
    pasangCookieSesi(res, hasil.sesi.token);
    kirimOk(res, {
      user: userPublik(hasil.user),
      sekolahId: hasil.sesi.sekolahId,
      mustChangePassword: !!hasil.user.mustChangePassword,
      benihAwal: apakahBenihAwal(hasil.sesi.sekolahId),
    });
  });

  r.post('/auth/logout', perluSesi, (req: ReqBersesi, res) => {
    if (req.sesi) akhiriSesi(req.sesi.token);
    hapusCookieSesi(res);
    kirimOk(res, { keluar: true });
  });

  r.get('/auth/sesi', perluSesi, (req: ReqBersesi, res) => {
    let impersonator: any = null;
    if (req.sesi!.impersonatorId) {
      const induk = userById(dbSekolah(req.sesi!.sekolahId), req.sesi!.impersonatorId);
      impersonator = induk ? userPublik(induk) : null;
    }
    kirimOk(res, {
      user: userPublik(req.user),
      sekolahId: req.sesi!.sekolahId,
      impersonatorId: req.sesi!.impersonatorId,
      impersonator,
      benihAwal: apakahBenihAwal(req.sesi!.sekolahId),
    });
  });

  r.post('/auth/ganti-sandi', perluSesi, async (req: ReqBersesi, res) => {
    const { passwordBaru } = req.body || {};
    if (typeof passwordBaru !== 'string' || passwordBaru.length < 8) {
      return kirimGagal(res, 400, 'Kata sandi baru minimal 8 karakter.');
    }
    try {
      const user = await gantiSandiSesi(req.sesi!, passwordBaru);
      kirimOk(res, { user: userPublik(user), mustChangePassword: false });
    } catch (e: any) {
      kirimGagal(res, 400, e?.message || 'Gagal mengganti kata sandi.');
    }
  });

  r.post('/auth/impersonate', perluSesi, perluAdmin, (req: ReqBersesi, res) => {
    const { userId } = req.body || {};
    const db = dbSekolah(req.sesi!.sekolahId);
    const target = typeof userId === 'string' ? userById(db, userId) : null;
    if (!target) return kirimGagal(res, 404, 'Pengguna tujuan tidak ditemukan.');
    if (target.id === req.user.id) {
      return kirimGagal(res, 400, 'Anda tidak dapat menyamar sebagai diri sendiri.');
    }
    if (target.role === 'administrator') {
      return kirimGagal(res, 400, 'Akun administrator tidak dapat disamarkan.');
    }
    if (target.status === 'nonaktif') {
      return kirimGagal(res, 400, 'Akun tujuan sedang nonaktif.');
    }
    const sesi = buatSesiImpersonate(req.sesi!, target);
    pasangCookieSesi(res, sesi.token);
    kirimOk(res, {
      user: userPublik(target),
      sekolahId: sesi.sekolahId,
      impersonatorId: sesi.impersonatorId,
      impersonator: userPublik(req.user),
    });
  });

  r.post('/auth/impersonate/berhenti', perluSesi, (req: ReqBersesi, res) => {
    if (!req.sesi!.impersonatorId) {
      return kirimGagal(res, 400, 'Sesi ini bukan sesi impersonate.');
    }
    const tokenInduk = akhiriImpersonate(req.sesi!);
    if (!tokenInduk) {
      hapusCookieSesi(res);
      return kirimGagal(res, 401, 'Sesi administrator asal sudah tidak sah. Silakan masuk kembali.');
    }
    pasangCookieSesi(res, tokenInduk);
    const admin = userById(dbSekolah(req.sesi!.sekolahId), req.sesi!.impersonatorId);
    kirimOk(res, { user: admin ? userPublik(admin) : null, sekolahId: req.sesi!.sekolahId });
  });

  // Fase S4: tulis data nyata apa pun (mutasi /data atau /snapshot)
  // mengakhiri status benih-awal sekolah itu — gerbang penawaran
  // migrasi hanya untuk server yang benar-benar belum pernah dipakai.
  // Wajib terdaftar SEBELUM rute-rute data di bawah.
  r.use(['/data', '/snapshot'], (req: ReqBersesi, _res, next) => {
    // Entri audit dikecualikan: aplikasi menulis audit pada SETIAP login,
    // sehingga menghitungnya sebagai "pemakaian nyata" akan mematikan
    // status benih sebelum penawaran migrasi sempat diperiksa (regresi
    // terbukti pada QA ulang S4, 25 Okt 2026).
    // NB: req.path di dalam use('/data') bersifat relatif terhadap titik
    // pasang (awalan /data sudah dilepas Express).
    const jalurAudit = /^\/koleksi\/audit_logs(\/|$)/.test(req.path);
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && !jalurAudit) {
      try {
        const token = tokenDariReq(req);
        const sesi = token ? sesiDariToken(token) : null;
        if (sesi) {
          const db = dbSekolah(sesi.sekolahId);
          if (!ambilMeta(db, 'data_nyata')) {
            simpanMeta(db, 'data_nyata', { pada: new Date().toISOString(), via: 'tulis-api' });
          }
        }
      } catch {
        /* penanda tidak boleh menggagalkan permintaan */
      }
    }
    next();
  });

  // ---------- Data: siswa ----------
  r.get('/data/siswa', perluSesi, (req: ReqBersesi, res) => {
    const db = dbSekolah(req.sesi!.sekolahId);
    kirimOk(res, semuaSiswa(db).filter((s) => siswaTerlihat(req.user, s)));
  });

  r.get('/data/siswa/:id', perluSesi, (req: ReqBersesi, res) => {
    const db = dbSekolah(req.sesi!.sekolahId);
    const s = siswaById(db, req.params.id);
    if (!s || !siswaTerlihat(req.user, s)) return kirimGagal(res, 404, 'Siswa tidak ditemukan.');
    kirimOk(res, s);
  });

  r.put('/data/siswa/:id', perluSesi, (req: ReqBersesi, res) => {
    const db = dbSekolah(req.sesi!.sekolahId);
    const siswa = { ...(req.body || {}), id: req.params.id };
    if (!siswa.namaLengkap) return kirimGagal(res, 400, 'Data siswa tidak lengkap (nama kosong).');
    const lama = siswaById(db, req.params.id);
    if (lama && !siswaTerlihat(req.user, lama)) {
      return kirimGagal(res, 403, 'Siswa ini di luar kewenangan rombel Anda.');
    }
    if (!bolehAksesRombel(req.user, siswa.rombelSaatIni)) {
      return kirimGagal(res, 403, `Rombel ${siswa.rombelSaatIni || '-'} di luar kewenangan Anda.`);
    }
    simpanSiswa(db, siswa);
    kirimOk(res, siswaById(db, req.params.id));
  });

  r.post('/data/siswa/bulk', perluSesi, (req: ReqBersesi, res) => {
    const db = dbSekolah(req.sesi!.sekolahId);
    const items: any[] = Array.isArray(req.body?.items) ? req.body.items : [];
    for (const s of items) {
      if (!bolehAksesRombel(req.user, s.rombelSaatIni)) {
        return kirimGagal(res, 403, `Rombel ${s.rombelSaatIni || '-'} di luar kewenangan Anda.`);
      }
    }
    dalamTransaksi(db, () => {
      for (const s of items) simpanSiswa(db, s);
    });
    kirimOk(res, { tersimpan: items.length });
  });

  r.delete('/data/siswa/:id', perluSesi, (req: ReqBersesi, res) => {
    const db = dbSekolah(req.sesi!.sekolahId);
    const lama = siswaById(db, req.params.id);
    if (!lama) return kirimGagal(res, 404, 'Siswa tidak ditemukan.');
    if (!siswaTerlihat(req.user, lama)) {
      return kirimGagal(res, 403, 'Siswa ini di luar kewenangan rombel Anda.');
    }
    hapusSiswa(db, req.params.id);
    kirimOk(res, { terhapus: true });
  });

  // ---------- Data: koleksi generik ----------
  r.get('/data/koleksi/:entitas', perluSesi, (req: ReqBersesi, res) => {
    const entitas = req.params.entitas;
    if (!(ENTITAS_KOLEKSI as readonly string[]).includes(entitas)) {
      return kirimGagal(res, 404, 'Entitas tidak dikenal.');
    }
    kirimOk(res, semuaKoleksi(dbSekolah(req.sesi!.sekolahId), entitas));
  });

  r.put('/data/koleksi/:entitas/:id', perluSesi, (req: ReqBersesi, res) => {
    const entitas = req.params.entitas;
    if (!(ENTITAS_KOLEKSI as readonly string[]).includes(entitas)) {
      return kirimGagal(res, 404, 'Entitas tidak dikenal.');
    }
    simpanKoleksi(dbSekolah(req.sesi!.sekolahId), entitas, { ...(req.body || {}) });
    kirimOk(res, { tersimpan: true });
  });

  r.post('/data/koleksi/:entitas/bulk', perluSesi, (req: ReqBersesi, res) => {
    const entitas = req.params.entitas;
    if (!(ENTITAS_KOLEKSI as readonly string[]).includes(entitas)) {
      return kirimGagal(res, 404, 'Entitas tidak dikenal.');
    }
    const items: any[] = Array.isArray(req.body?.items) ? req.body.items : [];
    const db = dbSekolah(req.sesi!.sekolahId);
    if (req.body?.mode === 'ganti') {
      gantiKoleksi(db, entitas, items);
    } else {
      dalamTransaksi(db, () => {
        for (const item of items) simpanKoleksi(db, entitas, item);
      });
    }
    kirimOk(res, { tersimpan: items.length });
  });

  r.delete('/data/koleksi/:entitas/:id', perluSesi, (req: ReqBersesi, res) => {
    const entitas = req.params.entitas;
    if (!(ENTITAS_KOLEKSI as readonly string[]).includes(entitas)) {
      return kirimGagal(res, 404, 'Entitas tidak dikenal.');
    }
    hapusKoleksi(dbSekolah(req.sesi!.sekolahId), entitas, req.params.id);
    kirimOk(res, { terhapus: true });
  });

  // ---------- Data: profil & config ----------
  r.get('/data/profil', perluSesi, (req: ReqBersesi, res) => {
    kirimOk(res, ambilMeta(dbSekolah(req.sesi!.sekolahId), 'profil_sekolah'));
  });

  r.put('/data/profil', perluSesi, perluAdmin, (req: ReqBersesi, res) => {
    const db = dbSekolah(req.sesi!.sekolahId);
    simpanMeta(db, 'profil_sekolah', req.body || {});
    kirimOk(res, ambilMeta(db, 'profil_sekolah'));
  });

  // Config: BACA untuk semua sesi (operator Dapodik membutuhkan host/port/
  // semester untuk sinkronisasi — setara keadaan lokal hari ini di mana
  // config berada di perangkat yang sama). TULIS: admin atau operator
  // (form pengaturan Dapodik memang dipakai operator Dapodik).
  r.get('/data/config/:kunci', perluSesi, (req: ReqBersesi, res) => {
    kirimOk(res, ambilMeta(dbSekolah(req.sesi!.sekolahId), `config_${req.params.kunci}`));
  });

  r.put('/data/config/:kunci', perluSesi, (req: ReqBersesi, res, next) => {
    if (adalahAdmin(req.user) || req.user?.role === 'operator') return next();
    kirimGagal(res, 403, 'Peran Anda tidak berhak mengubah konfigurasi.');
  }, (req: ReqBersesi, res) => {
    const db = dbSekolah(req.sesi!.sekolahId);
    simpanMeta(db, `config_${req.params.kunci}`, req.body || {});
    kirimOk(res, ambilMeta(db, `config_${req.params.kunci}`));
  });

  // ---------- Data: users (admin) ----------
  r.get('/data/users', perluSesi, perluAdmin, (req: ReqBersesi, res) => {
    kirimOk(res, semuaUsers(dbSekolah(req.sesi!.sekolahId)).map(userPublik));
  });

  r.put('/data/users/:id', perluSesi, perluAdmin, async (req: ReqBersesi, res) => {
    const db = dbSekolah(req.sesi!.sekolahId);
    const user = { ...(req.body || {}), id: req.params.id };
    if (!user.username) return kirimGagal(res, 400, 'Username wajib diisi.');
    if (user.password && !isHashedPassword(user.password)) {
      user.password = await hashPassword(String(user.password));
    }
    if (!user.password) {
      const lama = userById(db, req.params.id);
      if (lama) user.password = lama.password;
    }
    simpanUser(db, user);
    kirimOk(res, userPublik(userById(db, req.params.id)));
  });

  r.delete('/data/users/:id', perluSesi, perluAdmin, (req: ReqBersesi, res) => {
    const db = dbSekolah(req.sesi!.sekolahId);
    if (req.params.id === req.user.id) {
      return kirimGagal(res, 400, 'Anda tidak dapat menghapus akun Anda sendiri.');
    }
    const target = userById(db, req.params.id);
    if (!target) return kirimGagal(res, 404, 'Pengguna tidak ditemukan.');
    if (target.role === 'administrator') {
      const adminLain = semuaUsers(db).some((u) => u.role === 'administrator' && u.id !== target.id && u.status === 'aktif');
      if (!adminLain) return kirimGagal(res, 400, 'Tidak dapat menghapus administrator aktif terakhir.');
    }
    hapusUser(db, req.params.id);
    kirimOk(res, { terhapus: true });
  });

  // ---------- Snapshot berkas (Fase S4) ----------
  // Daftar boleh dibaca semua sesi (dasbor operator menampilkan status
  // backup); buat/pulih/hapus/unduh khusus admin.
  r.get('/snapshot/berkas', perluSesi, (req: ReqBersesi, res) => {
    kirimOk(res, daftarSnapshotBerkas(req.sesi!.sekolahId));
  });

  r.post('/snapshot/berkas', perluSesi, perluAdmin, (req: ReqBersesi, res) => {
    try {
      const meta = buatSnapshotBerkas(req.sesi!.sekolahId, String(req.body?.label || 'manual'));
      kirimOk(res, meta);
    } catch (e: any) {
      kirimGagal(res, 500, e?.message || 'Gagal membuat snapshot berkas.');
    }
  });

  r.post('/snapshot/berkas/:nama/pulihkan', perluSesi, perluAdmin, (req: ReqBersesi, res) => {
    try {
      const hasil = pulihkanSnapshotBerkas(req.sesi!.sekolahId, req.params.nama);
      kirimOk(res, hasil);
    } catch (e: any) {
      kirimGagal(res, 400, e?.message || 'Gagal memulihkan snapshot berkas.');
    }
  });

  r.delete('/snapshot/berkas/:nama', perluSesi, perluAdmin, (req: ReqBersesi, res) => {
    try {
      hapusSnapshotBerkas(req.sesi!.sekolahId, req.params.nama);
      kirimOk(res, { terhapus: true });
    } catch (e: any) {
      kirimGagal(res, 400, e?.message || 'Gagal menghapus snapshot berkas.');
    }
  });

  r.get('/snapshot/berkas/:nama/unduh', perluSesi, perluAdmin, (req: ReqBersesi, res) => {
    try {
      const lokasi = lokasiSnapshotBerkas(req.sesi!.sekolahId, req.params.nama);
      res.download(lokasi, req.params.nama);
    } catch (e: any) {
      kirimGagal(res, 404, e?.message || 'Berkas snapshot tidak ditemukan.');
    }
  });

  r.get('/backup/unduh-db', perluSesi, perluAdmin, (req: ReqBersesi, res) => {
    try {
      const lokasi = berkasUnduhDb(req.sesi!.sekolahId);
      res.download(lokasi, path.basename(lokasi), () => {
        try { fs.unlinkSync(lokasi); } catch { /* abaikan */ }
      });
    } catch (e: any) {
      kirimGagal(res, 500, e?.message || 'Gagal menyiapkan berkas basis data.');
    }
  });

  // ---------- Snapshot ----------
  r.get('/data/snapshot', perluSesi, (req: ReqBersesi, res) => {
    kirimOk(res, daftarSnapshot(dbSekolah(req.sesi!.sekolahId)));
  });

  r.post('/data/snapshot', perluSesi, (req: ReqBersesi, res) => {
    const db = dbSekolah(req.sesi!.sekolahId);
    const { id, payload, jumlahSiswa: js } = req.body || {};
    if (!id || typeof payload !== 'string') return kirimGagal(res, 400, 'Snapshot tidak lengkap.');
    simpanSnapshot(db, String(id), payload, Number(js) || 0);
    kirimOk(res, { tersimpan: true });
  });

  r.post('/data/snapshot/:id/pulihkan', perluSesi, perluAdmin, (req: ReqBersesi, res) => {
    const db = dbSekolah(req.sesi!.sekolahId);
    const mentah = ambilSnapshot(db, req.params.id);
    if (!mentah) return kirimGagal(res, 404, 'Snapshot tidak ditemukan.');
    let payload: any;
    try {
      payload = JSON.parse(mentah);
    } catch {
      return kirimGagal(res, 400, 'Isi snapshot rusak (bukan JSON).');
    }
    const hitungan = tulisPayloadBackup(req.sesi!.sekolahId, payload);
    kirimOk(res, { dipulihkan: true, hitungan });
  });

  r.delete('/data/snapshot/:id', perluSesi, perluAdmin, (req: ReqBersesi, res) => {
    hapusSnapshot(dbSekolah(req.sesi!.sekolahId), req.params.id);
    kirimOk(res, { terhapus: true });
  });

  // ---------- Backup ----------
  r.get('/backup/ekspor', perluSesi, async (req: ReqBersesi, res) => {
    const payload = await rakitPayloadBackup(req.sesi!.sekolahId);
    kirimOk(res, payload);
  });

  r.post('/backup/impor', perluSesi, perluAdmin, async (req: ReqBersesi, res) => {
    const payload = req.body?.payload ?? req.body;
    if (!payload || typeof payload !== 'object') {
      return kirimGagal(res, 400, 'Payload backup tidak ada.');
    }
    const struktur = validasiStrukturBackup(payload);
    if (struktur.length > 0) return kirimGagal(res, 400, `Struktur backup tidak valid: ${struktur[0]}`);
    const kompat = validasiKompatibilitas(payload);
    if (kompat.length > 0) return kirimGagal(res, 400, `Backup tidak kompatibel: ${kompat[0]}`);
    const integritas = await periksaIntegritas(payload);
    if (integritas.status === 'tidak-cocok' || integritas.status === 'tidak-valid') {
      return kirimGagal(res, 400, 'Checksum backup tidak cocok — berkas ditolak demi keamanan data.');
    }
    const hitungan = tulisPayloadBackup(req.sesi!.sekolahId, payload);
    kirimOk(res, { terimpor: true, hitungan, integritas: integritas.status });
  });

  return r;
}
