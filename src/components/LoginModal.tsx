import React, { useState, useEffect } from 'react';
import { Shield, KeyRound, UserCheck, AlertCircle, LogIn, Sparkles, School, Users, Award, RefreshCw, BarChart3, Printer, Database, WifiOff, CalendarRange, ArrowLeft } from 'lucide-react';
import { AppUser } from '../types';
import { getAllUsers, saveUser, getSekolahProfile, getTutupTahun, getAllPetaKelas, setSessionTahunAjaran, getSessionTahunAjaran } from '../utils/db';
import { verifyPassword, hashPassword } from '../utils/password';
import { cekKunciLogin, catatGagalLogin, catatSuksesLogin, LOGIN_MAX_GAGAL } from '../utils/security';
import { catatAudit } from '../utils/audit';
import { getDaftarTahunAjaran, getTahunDiizinkan } from '../utils/tahunAjaran';
import { toast } from '../utils/notify';
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
  const [passBaru, setPassBaru] = useState('');
  const [passBaru2, setPassBaru2] = useState('');
  const [daftarTA, setDaftarTA] = useState<string[]>([]);
  const [tahunDipilih, setTahunDipilih] = useState('');
  const [loadingTA, setLoadingTA] = useState(false);

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

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    setTimeout(() => {
      void (async () => {
      const cleanUser = username.trim().toLowerCase();
      const cleanPass = password.trim();

      const userList = internalUsers && internalUsers.length > 0 ? internalUsers : initialUsersList;
      const matchedUser = userList.find(
        (u) => u.username.toLowerCase() === cleanUser
      );

      if (!matchedUser) {
        setError('Username tidak terdaftar dalam sistem.');
        toast('Gagal masuk: username tidak terdaftar.', 'error');
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
      const statusKunci = cekKunciLogin(cleanUser);
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
          const sesudah = catatGagalLogin(cleanUser);
          if (sesudah.terkunci) {
            setError(`Salah kata sandi ${LOGIN_MAX_GAGAL}x — akun dikunci ±${sesudah.sisaMenit} menit.`);
            toast('Akun dikunci sementara karena terlalu banyak upaya gagal.', 'error');
          } else {
            setError(`Kata sandi (password) salah. Sisa ${sesudah.sisaUpaya}x upaya sebelum dikunci.`);
            toast('Gagal masuk: kata sandi salah.', 'error');
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
        catatSuksesLogin(cleanUser);
        if (hasil.legacy) {
          // Migrasi transparan: plaintext lama yang cocok langsung di-hash.
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
    const p1 = passBaru.trim();
    if (p1.length < 8) {
      setError('Kata sandi baru minimal 8 karakter.');
      return;
    }
    if (p1 !== passBaru2.trim()) {
      setError('Konfirmasi kata sandi tidak sama.');
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

  // Tombol akun hanya mengisi form — pengguna tetap harus menekan
  // "Masuk ke Sistem" agar password selalu diverifikasi (tidak ada bypass).
  const handleQuickLogin = (targetUsername: string) => {
    const userList = internalUsers && internalUsers.length > 0 ? internalUsers : initialUsersList;
    const matched = userList.find((u) => u.username.toLowerCase() === targetUsername.toLowerCase());
    if (matched) {
      setUsername(matched.username);
      setError(null);
      document.getElementById('login-password')?.focus();
    }
  };

  const quickAccounts = [
    {
      username: 'administrator',
      title: 'Administrator',
      sub: 'Hak akses penuh & CRUD',
      badge: 'administrator',
      avatarBg: 'bg-gradient-to-br from-purple-500 to-purple-700',
      icon: Shield,
      hover: 'hover:border-purple-300 hover:bg-purple-50/60',
    },
    {
      username: 'operator_bukuinduk',
      title: 'Siti Rahmawati, S.Kom.',
      sub: 'operator_bukuinduk • Petugas Buku Induk',
      badge: 'operator',
      avatarBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
      icon: UserCheck,
      hover: 'hover:border-emerald-300 hover:bg-emerald-50/60',
    },
    {
      username: 'operator_kesiswaan',
      title: 'Budi Santoso, S.Pd.',
      sub: 'operator_kesiswaan • Staf Kesiswaan',
      badge: 'operator',
      avatarBg: 'bg-gradient-to-br from-amber-500 to-orange-600',
      icon: UserCheck,
      hover: 'hover:border-amber-300 hover:bg-amber-50/60',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-white/20 overflow-hidden my-8 anim-scale-in grid md:grid-cols-[1fr_1.1fr]">
        {/* Panel branding */}
        <div className="hidden md:flex flex-col justify-between relative overflow-hidden bg-gradient-to-b from-navy-800 via-navy-900 to-[#0b1e4b] text-white p-7">
          <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="absolute -bottom-20 -left-10 w-56 h-56 rounded-full bg-gold-400/10 blur-3xl" />
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-gold-500 via-gold-300 to-gold-500" />
          <div className="relative">
            <div className="w-13 h-13 p-3 rounded-2xl bg-white/10 border border-white/15 inline-flex shadow-lg">
              <School className="w-7 h-7 text-gold-300" />
            </div>
            <p className="mt-4 text-[11px] font-extrabold uppercase tracking-[0.2em] text-gold-300">
              Sistem Buku Induk Siswa
            </p>
            <h2 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight">
              Kurikulum<br />Merdeka
            </h2>
            <p className="mt-1 text-xs text-slate-300 font-semibold">
              SD & SMP • Fase A–D • Standar Dinas
            </p>
          </div>
          <ul className="relative mt-6 space-y-2.5">
            {HIGHLIGHTS.map((h) => (
              <li key={h.text} className="flex items-center gap-2.5 text-xs font-semibold text-slate-200">
                <span className="w-7 h-7 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center shrink-0">
                  <h.icon className="w-3.5 h-3.5 text-gold-300" />
                </span>
                {h.text}
              </li>
            ))}
          </ul>
          <p className="relative mt-6 flex items-center gap-1.5 text-[11px] text-slate-400">
            <WifiOff className="w-3.5 h-3.5" />
            Dapat berjalan offline penuh (PWA + IndexedDB)
          </p>
        </div>

        {/* Panel form */}
        <div className="p-6 sm:p-7">
          <div className="md:hidden flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-navy-900 flex items-center justify-center shadow-md shrink-0">
              <School className="w-5 h-5 text-gold-300" />
            </div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-700">Buku Induk Siswa</p>
              <h2 className="text-base font-extrabold text-slate-900 leading-tight">Kurikulum Merdeka SD & SMP</h2>
            </div>
          </div>

          <h2 className="hidden md:block text-lg font-extrabold text-slate-900 tracking-tight">
            {step === 'tahun' ? 'Pilih Tahun Ajaran Sesi' : 'Masuk ke Sistem'}
          </h2>
          <p className="hidden md:block text-xs text-slate-500 mt-0.5 mb-4">
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

          <div className="mt-5 pt-4 border-t border-slate-100">
            <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-gold-500" />
              Isi cepat — klik akun
            </p>
            <div className="space-y-2">
              {quickAccounts.map((a) => (
                <button
                  key={a.username}
                  type="button"
                  onClick={() => {
                    handleQuickLogin(a.username);
                  }}
                  className={`w-full text-left p-2.5 bg-slate-50/70 border border-slate-200 rounded-xl flex items-center gap-2.5 transition group cursor-pointer ${a.hover}`}
                  title="Isi username ke form, lalu masukkan kata sandi dan tekan Masuk"
                >
                  <div className={`w-8 h-8 rounded-lg ${a.avatarBg} text-white flex items-center justify-center shrink-0 shadow-sm`}>
                    <a.icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-800 truncate">
                      {a.title}
                      <span className="ml-1.5 px-1.5 py-px rounded text-[10px] bg-slate-200/70 text-slate-600 font-bold font-mono">
                        {a.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate font-mono">{a.sub}</p>
                  </div>
                  <span className="text-xs font-bold text-slate-400 group-hover:text-navy-800 group-hover:translate-x-0.5 transition-all shrink-0">
                    Isi →
                  </span>
                </button>
              ))}
            </div>
          </div>

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
      </div>
    </div>
  );
};
