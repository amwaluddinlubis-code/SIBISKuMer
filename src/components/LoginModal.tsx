import React, { useState, useEffect, useRef } from 'react';
import { Shield, KeyRound, UserCheck, AlertCircle, LogIn, School, Users, Award, RefreshCw, BarChart3, Printer, Database, WifiOff, CalendarRange, ArrowLeft } from 'lucide-react';
import { AppUser } from '../types';
import { getAllUsers, saveUser, getSekolahProfile, getTutupTahun, getAllPetaKelas, setSessionTahunAjaran, getSessionTahunAjaran } from '../utils/db';
import { verifyPassword, hashPassword } from '../utils/password';
import { cekKunciLoginAsync, catatGagalLoginAsync, catatSuksesLoginAsync, LOGIN_MAX_GAGAL } from '../utils/security';
import { catatAudit } from '../utils/audit';
import { getDaftarTahunAjaran, getTahunDiizinkan } from '../utils/tahunAjaran';
import { toast } from '../utils/notify';
import { adaLayarServer, pakaiServer } from '../utils/modeData';
import { loginKeServer, masukServer, gantiSandiServer, verifikasiTotpServer } from '../utils/dataApi';
import { initialUsersList } from '../data/initialData';

interface LoginModalProps {
  users?: AppUser[];
  isOpen?: boolean;
  tahunOptions?: string[];
  defaultTahun?: string;
  onLogin?: (user: AppUser, tahunAjaran?: string) => void;
  onLoginSuccess?: (user: AppUser, tahunAjaran?: string) => void;
  onClose?: () => void;
  canClose?: boolean;
}

const HIGHLIGHTS = [
  { icon: Users, text: 'Ledger digital A–I ala dinas' },
  { icon: Award, text: 'Raport Kumer + deskripsi otomatis' },
  { icon: RefreshCw, text: 'Sinkron Dapodik lokal' },
  { icon: BarChart3, text: 'Rekap dinas & akreditasi' },
  { icon: Printer, text: 'Cetak induk + kartu pelajar' },
  { icon: Database, text: 'Offline-first + backup JSON' },
];

// S8: pesan generik yang SAMA PERSIS untuk "username tak terdaftar" maupun
// "password salah" agar tidak bisa dipakai enumerasi username. Audit internal
// (catatAudit) boleh tetap spesifik, tapi pesan ke pengguna harus identik.
const PESAN_KREDENSIAL_SALAH = 'Username atau kata sandi salah.';

export const LoginModal: React.FC<LoginModalProps> = ({
  users,
  isOpen = true,
  tahunOptions,
  defaultTahun,
  onLogin,
  onLoginSuccess,
  onClose,
  canClose = false
}) => {
  const [internalUsers, setInternalUsers] = useState<AppUser[]>(users || initialUsersList);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Langkah 2: pilih tahun ajaran sesi
  const [step, setStep] = useState<'akun' | 'tahun'>('akun');
  const [verifiedUser, setVerifiedUser] = useState<AppUser | null>(null);
  // Wajib ganti kata sandi bawaan sebelum masuk (S1)
  const [wajibGanti, setWajibGanti] = useState<AppUser | null>(null);
  // Langkah Authenticator (2FA mode server): kata sandi sudah benar,
  // menunggu kode sebelum sesi diterbitkan server.
  const [menungguTotp, setMenungguTotp] = useState<string | null>(null);
  const [kodeTotp, setKodeTotp] = useState('');
  const [passBaru, setPassBaru] = useState('');
  const [passBaru2, setPassBaru2] = useState('');
  const [daftarTA, setDaftarTA] = useState<string[]>([]);
  const [tahunDipilih, setTahunDipilih] = useState('');
  const [loadingTA, setLoadingTA] = useState(false);
  // S2 migrasi SQLite: kata sandi final (hasil ketik / hasil ganti paksa)
  // disimpan sesaat di ref agar sesi server dapat dibuka dengan kredensial
  // yang sama persis; dibersihkan begitu dipakai.
  // WAJIB di atas `if (!isOpen) return null` — hook di bawah early return
  // menyebabkan "Rendered fewer hooks than expected" (layar putih total)
  // saat modal ditutup seusai login berhasil.
  const kataSandiFinalRef = useRef('');

  useEffect(() => {
    if (users && users.length > 0) {
      setInternalUsers(users);
    } else {
      getAllUsers()
        .then((res) => {
          if (res && res.length > 0) {
            setInternalUsers(res);
          } else {
            setInternalUsers(initialUsersList);
          }
        })
        .catch(() => {
          setInternalUsers(initialUsersList);
        });
    }
  }, [users]);

  if (!isOpen) {
    return null;
  }

  const notifyLogin = (user: AppUser, tahunAjaran?: string) => {
    if (onLoginSuccess) {
      onLoginSuccess(user, tahunAjaran);
    } else if (onLogin) {
      onLogin(user, tahunAjaran);
    }
  };

  /** Bangun daftar TA sesi setelah kredensial terverifikasi. */
  const masukKePilihTahun = async (user: AppUser) => {
    if (adaLayarServer() && kataSandiFinalRef.current) {
      // Sesi server untuk layar mode server; gagal tidak menggagalkan
      // login lokal (layar jatuh kembali ke data lokal).
      await loginKeServer(user.username, kataSandiFinalRef.current);
      kataSandiFinalRef.current = '';
    }
    setLoadingTA(true);
    try {
      const [profil, tutup, peta] = await Promise.all([
        getSekolahProfile().catch(() => null),
        getTutupTahun().catch(() => []),
        getAllPetaKelas().catch(() => []),
      ]);
      const daftar = getDaftarTahunAjaran({
        sekolah: profil,
        tutup: (tutup || []) as { tahunAjaran: string }[],
        peta: (peta || []) as { tahunAjaran: string }[],
        fallback: [...(tahunOptions || []), defaultTahun || '', profil?.tahunAjaran || ''],
      });
      const diizinkan = getTahunDiizinkan(user, daftar);
      if (diizinkan.length === 0) {
        const butuh = (user.tahunAkses || []).join(', ') || '-';
        setError(
          `Akun @${user.username} dibatasi ke tahun ajaran ${butuh}, tetapi data tahun tersebut belum tersedia. Hubungi Administrator.`
        );
        toast('Akses tahun ajaran ditolak untuk akun ini.', 'error');
        setLoadingTA(false);
        return;
      }
      setVerifiedUser({ ...user, terakhirLogin: new Date().toISOString() });
      setDaftarTA(diizinkan);
      // Default: tahun aktif sekolah bila diizinkan, sonst terbaru.
      const def =
        defaultTahun && diizinkan.includes(defaultTahun)
          ? defaultTahun
          : profil?.tahunAjaran && diizinkan.includes(profil.tahunAjaran)
            ? profil.tahunAjaran
            : getSessionTahunAjaran() && diizinkan.includes(getSessionTahunAjaran() as string)
              ? (getSessionTahunAjaran() as string)
              : diizinkan[0];
      setTahunDipilih(def);
      setStep('tahun');
    } finally {
      setLoadingTA(false);
    }
  };

  /** Jalur login MODE SERVER PENUH (Fase S3): server adalah otoritas —
   *  verifikasi, kunci login, dan ganti sandi paksa semuanya di server.
   *  Tidak ada verifikasi lokal dan tidak ada fallback diam-diam. */
  /** Kelanjutan sesudah sesi server PENUH terbit (dipakai login biasa &
   *  sesudah verifikasi Authenticator): ganti sandi paksa atau pilih TA. */
  const selesaikanLoginServer = (hasil: { user: any; mustChangePassword?: boolean }) => {
    const userServer = hasil.user as AppUser;
    if (hasil.mustChangePassword) {
      // Sesi server sudah terbuka; form ganti sandi memakai endpoint
      // ganti-sandi (cabang server di handleGantiPasswordBawaan).
      setWajibGanti({ ...userServer, password: '' });
      setPassBaru('');
      setPassBaru2('');
      return;
    }
    void masukKePilihTahun(userServer);
  };

  const loginViaServer = async (cleanUser: string, cleanPass: string) => {
    setIsLoading(true);
    try {
      const hasil = await masukServer(cleanUser, cleanPass);
      setIsLoading(false);
      if (hasil.perluTotp) {
        // Kata sandi benar; server menahan sesi sampai kode diverifikasi.
        setMenungguTotp(cleanUser);
        setKodeTotp('');
        setError(null);
        return;
      }
      selesaikanLoginServer(hasil);
    } catch (e: any) {
      setIsLoading(false);
      setError(e?.message || 'Tidak dapat masuk melalui server. Periksa koneksi server aplikasi.');
      toast('Gagal masuk (mode server).', 'error');
    }
  };

  /** Langkah kedua login Authenticator: kirim kode 6 digit dari aplikasi
   *  authenticator (atau satu kode pemulihan) ke server. */
  const handleVerifikasiTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kodeTotp.trim() || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const hasil = await verifikasiTotpServer(kodeTotp.trim());
      setIsLoading(false);
      setMenungguTotp(null);
      setKodeTotp('');
      selesaikanLoginServer(hasil);
    } catch (err: any) {
      setIsLoading(false);
      setError(err?.message || 'Kode Authenticator tidak cocok.');
    }
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (pakaiServer()) {
      void loginViaServer(username.trim().toLowerCase(), password);
      return;
    }

    setTimeout(() => {
      void (async () => {
      const cleanUser = username.trim().toLowerCase();
      // S10: password TIDAK di-trim — "rahasia " dan "rahasia" adalah password berbeda.
      // (trim hanya untuk username). Kompatibilitas hash lama ditangani verifyPassword.
      const cleanPass = password;

      const userList = internalUsers && internalUsers.length > 0 ? internalUsers : initialUsersList;
      const matchedUser = userList.find(
        (u) => u.username.toLowerCase() === cleanUser
      );

      if (!matchedUser) {
        // S8: pesan generik — sama persis dengan kasus password salah.
        setError(PESAN_KREDENSIAL_SALAH);
        toast('Gagal masuk: username atau kata sandi salah.', 'error');
        setIsLoading(false);
        return;
      }

      if (matchedUser.status === 'nonaktif') {
        setError('Akun ini sedang dinonaktifkan oleh Administrator. Hubungi pihak Tata Usaha.');
        toast('Gagal masuk: akun dinonaktifkan.', 'error');
        setIsLoading(false);
        return;
      }

      // Kunci login: tolak sebelum verifikasi bila masih dalam masa kunci.
      // S12: cek gabungan localStorage + IndexedDB (async).
      const statusKunci = await cekKunciLoginAsync(cleanUser);
      if (statusKunci.terkunci) {
        setError(`Akun dikunci sementara karena ${LOGIN_MAX_GAGAL}x salah kata sandi. Coba lagi dalam ±${statusKunci.sisaMenit} menit.`);
        toast('Akun dikunci sementara. Coba lagi nanti.', 'error');
        catatAudit('login_terkunci', {
          entitas: 'sesi',
          entitasId: matchedUser.id,
          ringkasan: `Upaya masuk saat terkunci: @${matchedUser.username}`,
          aktor: matchedUser.username,
          peran: matchedUser.role,
        });
        setIsLoading(false);
        return;
      }

      // Verifikasi hash (PBKDF2/SHA-256) atau legacy plaintext — tanpa backdoor/hardcoded.
      // Password default awal ada di initialUsersList; setelah admin mengganti
      // password, password lama otomatis tidak berlaku lagi.
      let loginUser = matchedUser;
      try {
        const hasil = await verifyPassword(cleanPass, matchedUser.password);
        if (!hasil.ok) {
          // S12: catat ke localStorage + IndexedDB (async).
          const sesudah = await catatGagalLoginAsync(cleanUser);
          if (sesudah.terkunci) {
            setError(`Salah kata sandi ${LOGIN_MAX_GAGAL}x — akun dikunci ±${sesudah.sisaMenit} menit.`);
            toast('Akun dikunci sementara karena terlalu banyak upaya gagal.', 'error');
          } else {
            // S8: pesan generik — sama persis dengan kasus username tak terdaftar.
            setError(PESAN_KREDENSIAL_SALAH);
            toast('Gagal masuk: username atau kata sandi salah.', 'error');
          }
          catatAudit('login_gagal', {
            entitas: 'sesi',
            entitasId: matchedUser.id,
            ringkasan: `Gagal masuk: @${matchedUser.username}${sesudah.terkunci ? ' (dikunci)' : ''}`,
            aktor: matchedUser.username,
            peran: matchedUser.role,
          });
          setIsLoading(false);
          return;
        }
        await catatSuksesLoginAsync(cleanUser); // S12: hapus hitungan di kedua lapisan
        kataSandiFinalRef.current = cleanPass; // S2: untuk sesi server
        if (hasil.legacy || hasil.perluRehash) {
          // Migrasi transparan: plaintext lama ATAU hash lama (format trim, S10)
          // yang cocok langsung di-hash ulang ke format baru (tanpa trim).
          try {
            loginUser = { ...matchedUser, password: await hashPassword(cleanPass) };
            await saveUser(loginUser);
            setInternalUsers((prev) => prev.map((u) => (u.id === loginUser.id ? loginUser : u)));
          } catch {
            /* login tetap lanjut walau migrasi gagal */
          }
        }
      } catch {
        setError('Verifikasi kata sandi gagal. Coba lagi.');
        toast('Gagal masuk: verifikasi kata sandi gagal.', 'error');
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      // S1: akun bawaan wajib mengganti kata sandi default sebelum lanjut.
      if (loginUser.mustChangePassword) {
        setWajibGanti(loginUser);
        setPassBaru('');
        setPassBaru2('');
        return;
      }
      // Lanjut ke langkah 2: pilih tahun ajaran sesi (dibatasi tahunAkses).
      void masukKePilihTahun(loginUser);
      })();
    }, 250);
  };

  const handleGantiPasswordBawaan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wajibGanti) return;
    setError(null);
    // S10: password baru tidak di-trim (spasi adalah bagian password yang sah).
    const p1 = passBaru;
    if (p1.length < 8) {
      setError('Kata sandi baru minimal 8 karakter.');
      return;
    }
    if (p1 !== passBaru2) {
      setError('Konfirmasi kata sandi tidak sama.');
      return;
    }
    if (pakaiServer()) {
      // Mode server: ganti sandi dilakukan di server (sesi sudah terbuka
      // dari masukServer). Jalur saveUser lokal TIDAK dipakai — record
      // wajibGanti di sini tidak membawa kata sandi lama.
      setIsLoading(true);
      try {
        const hasil = await gantiSandiServer(p1);
        const updated = ((hasil?.user || wajibGanti) as AppUser);
        setWajibGanti(null);
        setPassBaru('');
        setPassBaru2('');
        toast('Kata sandi berhasil diganti di server. Silakan lanjutkan masuk.', 'success');
        catatAudit('ganti_password_bawaan', {
          entitas: 'pengguna',
          entitasId: updated.id,
          ringkasan: `Kata sandi bawaan diganti (server): @${updated.username}`,
          aktor: updated.username,
          peran: updated.role,
        });
        setIsLoading(false);
        void masukKePilihTahun({ ...updated, mustChangePassword: false });
      } catch (e: any) {
        setIsLoading(false);
        setError(e?.message || 'Gagal mengganti kata sandi di server. Coba lagi.');
      }
      return;
    }
    setIsLoading(true);
    try {
      const updated: AppUser = {
        ...wajibGanti,
        password: await hashPassword(p1),
        mustChangePassword: false,
        updatedAt: new Date().toISOString(),
      };
      await saveUser(updated);
      kataSandiFinalRef.current = p1; // S2: sandi BARU untuk sesi server
      setInternalUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setWajibGanti(null);
      setPassBaru('');
      setPassBaru2('');
      toast('Kata sandi berhasil diganti. Silakan lanjutkan masuk.', 'success');
      catatAudit('ganti_password_bawaan', {
        entitas: 'pengguna',
        entitasId: updated.id,
        ringkasan: `Kata sandi bawaan diganti: @${updated.username}`,
        aktor: updated.username,
        peran: updated.role,
      });
      setIsLoading(false);
      void masukKePilihTahun(updated);
    } catch {
      setIsLoading(false);
      setError('Gagal menyimpan kata sandi baru. Coba lagi.');
    }
  };

  const handleKonfirmasiTahun = () => {
    if (!verifiedUser) return;
    const t = (tahunDipilih || '').trim();
    if (!t) {
      setError('Pilih tahun ajaran sesi terlebih dahulu.');
      return;
    }
    const diizinkan = getTahunDiizinkan(verifiedUser, daftarTA.length > 0 ? daftarTA : [t]);
    if (!diizinkan.includes(t)) {
      setError(`Akun @${verifiedUser.username} tidak memiliki akses ke tahun ${t}.`);
      toast('Akses tahun ajaran ditolak untuk akun ini.', 'error');
      return;
    }
    setSessionTahunAjaran(t);
    setError(null);
    toast(`Selamat datang, ${verifiedUser.namaLengkap} • Sesi TA ${t}.`, 'success');
    notifyLogin(verifiedUser, t);
  };

  const handleKembaliKeAkun = () => {
    setStep('akun');
    setVerifiedUser(null);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center md:justify-end p-4 sm:p-6 lg:pr-16 overflow-y-auto bg-navy-950">
      {/* Wallpaper halaman masuk: pemandangan sekolah + Gordang Sambilan (9) */}
      <img src="/login-wallpaper.jpg" alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-l from-navy-950/50 via-navy-950/15 to-transparent" />
      {/* Judul aplikasi — teks CSS di dalam lencana kaca (border radius + blur) di atas wallpaper */}
      <div className="absolute inset-x-0 top-6 sm:top-9 px-4 flex justify-center pointer-events-none select-none">
        <div className="inline-flex flex-col items-center text-center rounded-[2rem] border border-white/25 bg-navy-950/30 px-6 py-3.5 sm:px-10 sm:py-4 shadow-2xl backdrop-blur-md">
          <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl font-bold tracking-wide text-white [text-shadow:0_1px_3px_rgba(2,16,48,0.45)]">
            <span className="text-gold-300">e-</span>Buku Induk Siswa
          </h1>
          <p className="mt-1.5 text-[11px] sm:text-sm font-medium text-white/90">
            created by : <span className="font-bold text-gold-300">@iamlubis</span>
          </p>
        </div>
      </div>
      <div className="relative w-full max-w-md bg-white/75 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 overflow-hidden my-8 anim-scale-in">

        {/* Panel form */}
        <div className="p-6 sm:p-7">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-navy-900 flex items-center justify-center shadow-md shrink-0">
              <School className="w-5 h-5 text-gold-300" />
            </div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-700">Buku Induk Siswa</p>
              <h2 className="text-base font-extrabold text-slate-900 leading-tight">Kurikulum Merdeka SD & SMP</h2>
            </div>
          </div>

          <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
            {step === 'tahun' ? 'Pilih Tahun Ajaran Sesi' : 'Masuk ke Sistem'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">
            {step === 'tahun'
              ? `Akun @${verifiedUser?.username || ''} terverifikasi — pilih tahun ajaran untuk sesi kerja ini.`
              : 'Gunakan akun administrator atau operator Anda.'}
          </p>

          {error && (
            <div className="flex items-start gap-2.5 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 mb-4 anim-fade-up">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Gagal Masuk</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {wajibGanti ? (
            <form onSubmit={handleGantiPasswordBawaan} className="space-y-3.5">
              <div className="flex items-center gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <span className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900">Kata sandi bawaan harus diganti</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    Akun @{wajibGanti.username} masih memakai kata sandi awal. Buat kata sandi baru (min. 8 karakter) untuk melanjutkan.
                  </p>
                </div>
              </div>
              <div>
                <label className="ui-label" htmlFor="login-passbaru">Kata sandi baru</label>
                <input
                  id="login-passbaru"
                  type="password"
                  autoComplete="new-password"
                  className="ui-input mt-1"
                  value={passBaru}
                  onChange={(e) => setPassBaru(e.target.value)}
                  placeholder="Minimal 8 karakter"
                />
              </div>
              <div>
                <label className="ui-label" htmlFor="login-passbaru2">Konfirmasi kata sandi baru</label>
                <input
                  id="login-passbaru2"
                  type="password"
                  autoComplete="new-password"
                  className="ui-input mt-1"
                  value={passBaru2}
                  onChange={(e) => setPassBaru2(e.target.value)}
                  placeholder="Ulangi kata sandi baru"
                />
              </div>
              <button type="submit" disabled={isLoading} className="ui-btn-primary w-full">
                {isLoading ? 'Menyimpan…' : 'Simpan & Lanjutkan Masuk'}
              </button>
            </form>
          ) : menungguTotp ? (
            <form onSubmit={handleVerifikasiTotp} className="space-y-3.5">
              <div className="flex items-center gap-2.5 p-3 bg-sky-50 border border-sky-200 rounded-xl">
                <span className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900">Verifikasi Authenticator</p>
                  <p className="text-[11px] text-slate-500">
                    Kata sandi @{menungguTotp} benar. Masukkan kode 6 digit dari aplikasi
                    Authenticator Anda (berganti tiap 30 detik), atau satu kode pemulihan
                    bila HP tidak tersedia.
                  </p>
                </div>
              </div>
              <div>
                <label className="ui-label" htmlFor="login-kode-totp">Kode Authenticator</label>
                <input
                  id="login-kode-totp"
                  type="text"
                  inputMode="text"
                  autoComplete="one-time-code"
                  autoFocus
                  className="ui-input mt-1 text-center font-mono text-lg tracking-[0.3em]"
                  value={kodeTotp}
                  onChange={(e) => setKodeTotp(e.target.value)}
                  placeholder="000000"
                />
              </div>
              <button type="submit" disabled={isLoading || !kodeTotp.trim()} className="ui-btn-primary w-full">
                {isLoading ? 'Memverifikasi…' : 'Verifikasi & Masuk'}
              </button>
              <button
                type="button"
                onClick={() => { setMenungguTotp(null); setKodeTotp(''); setError(null); }}
                className="w-full text-center text-[11px] font-semibold text-slate-500 hover:text-slate-700"
              >
                Kembali ke formulir masuk
              </button>
            </form>
          ) : step === 'tahun' ? (
            <div className="space-y-3.5">
              <div className="flex items-center gap-2.5 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <span className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <UserCheck className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">{verifiedUser?.namaLengkap}</p>
                  <p className="text-[11px] text-slate-500 font-mono truncate">
                    @{verifiedUser?.username} • {verifiedUser?.role}
                    {(verifiedUser?.tahunAkses || []).length > 0
                      ? ` • dibatasi: ${(verifiedUser?.tahunAkses || []).join(', ')}`
                      : ' • semua TA'}
                  </p>
                </div>
              </div>

              <div>
                <label className="ui-label" htmlFor="login-tahun">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarRange className="w-3.5 h-3.5" />
                    Tahun ajaran sesi
                  </span>
                </label>
                {loadingTA ? (
                  <p className="text-xs text-slate-500 italic py-2">Memuat daftar tahun ajaran...</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {daftarTA.map((t) => {
                      const aktif = tahunDipilih === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTahunDipilih(t)}
                          className={`px-3 py-2.5 rounded-xl border text-xs font-mono font-bold transition cursor-pointer ${
                            aktif
                              ? 'bg-navy-900 text-white border-navy-900 shadow-md'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-navy-400 hover:bg-blue-50/50'
                          }`}
                        >
                          {t}
                          {aktif && <span className="block text-[10px] font-sans font-semibold opacity-80">sesi aktif</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Data raport & arsip mengikuti sesi ini. Operator hanya melihat TA yang dicentang admin di Manajemen Pengguna.
                </p>
              </div>

              <button
                type="button"
                onClick={handleKonfirmasiTahun}
                disabled={loadingTA || !tahunDipilih}
                className="ui-btn ui-btn-primary w-full !py-3 !text-sm disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                <span>Masuk dengan TA {tahunDipilih || '...'}</span>
              </button>
              <button
                type="button"
                onClick={handleKembaliKeAkun}
                className="ui-btn ui-btn-ghost w-full !py-2 !text-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Ganti akun</span>
              </button>
            </div>
          ) : (
          <>
          <form onSubmit={handleLoginSubmit} className="space-y-3.5">
            <div>
              <label className="ui-label" htmlFor="login-username">Username</label>
              <div className="relative">
                <input
                  id="login-username"
                  type="text"
                  required
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Contoh: administrator"
                  className="ui-input !pl-9 !py-2.5"
                />
                <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>

            <div>
              <label className="ui-label" htmlFor="login-password">Kata sandi</label>
              <div className="relative">
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi..."
                  className="ui-input !pl-9 !py-2.5"
                />
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="ui-btn ui-btn-primary w-full !py-3 !text-sm"
            >
              <LogIn className="w-4 h-4" />
              <span>{isLoading ? 'Memverifikasi...' : 'Masuk ke Sistem'}</span>
            </button>
          </form>

{canClose && onClose && step === 'akun' && (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 mt-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
            >
              Batal
            </button>
          )}
          </>
          )}
        </div>

        {/* Sorotan fitur — ringkas di kaki panel kaca */}
        <div className="px-6 sm:px-7 pb-6">
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-4 border-t border-slate-900/10">
            {HIGHLIGHTS.map((h) => (
              <li key={h.text} className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                <span className="w-6 h-6 rounded-md bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                  <h.icon className="w-3 h-3 text-blue-700" />
                </span>
                {h.text}
              </li>
            ))}
          </ul>
          <p className="mt-3.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            <WifiOff className="w-3.5 h-3.5" />
            Dapat berjalan offline penuh (PWA + IndexedDB)
          </p>
        </div>
      </div>
    </div>
  );
};
