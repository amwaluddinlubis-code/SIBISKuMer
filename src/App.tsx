import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import {
  getAllSiswa,
  getSekolahProfile,
  getDapodikConfig,
  getSyncLogs,
  saveSiswa,
  deleteSiswa,
  resetToInitialData,
  initStorage,
  ensureSchoolsInit,
  getCurrentUserSession,
  setCurrentUserSession,
  getImpersonateSession,
  setImpersonateSession,
  clearImpersonateSession,
  clearCurrentUserSession,
  getSessionTahunAjaran,
  setSessionTahunAjaran,
  clearSessionTahunAjaran,
  canUserAccessTahun,
  saveSekolahProfile,
  filterSiswaByAccess,
  canUserAccessRombel,
  isAdministrator,
  getAllRombelRefs,
  getAllPtkRefs,
  getActiveSchool,
  saveSchoolEntry,
  getSchools,
  getActiveSchoolId,
  switchActiveSchool,
  createSchoolWithDatabase,
  deleteSchoolEntry,
  getSchoolSiswaCount,
  getAllUsers,
  getTutupTahun,
  saveTutupTahun,
  deleteTutupTahun,
  saveSiswaBulk,
  getSiswaById,
  getTingkatAktifSiswa,
  getTahunAjaranTerakhirSiswa,
  getAllPetaKelas,
  resetToSingleMainDatabase
} from './utils/db';
import { Siswa, SekolahProfile, DapodikConfig, DapodikSyncLog, AppUser, RombelRef, PtkRef, SchoolEntry, JenjangSekolah, TutupTahunAjaran, PetaKelas, ModeTampilan, RiwayatTahunAjaran } from './types';
import { buildSnapshot } from './utils/arsip';
import { useIdleLogout } from './hooks/useIdleLogout';
import { resolveTemaEfektif, bacaModeTampilan, simpanModeTampilan, terapkanModeTampilan, modeBerikutnya } from './utils/tema';
import { getDaftarTahunAjaran, getTahunDiizinkan } from './utils/tahunAjaran';
import { tahunSesiEfektif, siswaTerlihatSesi } from './utils/sesi';
import { initialSekolahProfile, initialDapodikConfig } from './data/initialData';
import { Navbar } from './components/Navbar';
// Code-splitting: tiap tab & modal dimuat on-demand agar bundel awal kecil.
// (Backlog: bundel ~1MB → chunk terpisah per view; firebase hanya ikut chunk Backup.)
function lazyView(
  loader: () => Promise<any>,
  name: string
): React.LazyExoticComponent<React.ComponentType<any>> {
  return lazy(() => loader().then((m) => ({ default: m[name] })));
}
const SetupWizard = lazyView(() => import('./components/SetupWizard'), 'SetupWizard');
const DashboardStats = lazyView(() => import('./components/DashboardStats'), 'DashboardStats');
const SiswaList = lazyView(() => import('./components/SiswaList'), 'SiswaList');
const DapodikSyncView = lazyView(() => import('./components/DapodikSyncView'), 'DapodikSyncView');
const RekapitulasiView = lazyView(() => import('./components/RekapitulasiView'), 'RekapitulasiView');
const PengaturanSekolahView = lazyView(() => import('./components/PengaturanSekolahView'), 'PengaturanSekolahView');
const CetakBukuInduk = lazyView(() => import('./components/CetakBukuInduk'), 'CetakBukuInduk');
const SiswaFormModal = lazyView(() => import('./components/SiswaFormModal'), 'SiswaFormModal');
const MutasiWizard = lazyView(() => import('./components/MutasiWizard'), 'MutasiWizard');
const SiswaDetailModal = lazyView(() => import('./components/SiswaDetailModal'), 'SiswaDetailModal');
const LoginModal = lazyView(() => import('./components/LoginModal'), 'LoginModal');
const UserManagementView = lazyView(() => import('./components/UserManagementView'), 'UserManagementView');
const NilaiRaportView = lazyView(() => import('./components/NilaiRaportView'), 'NilaiRaportView');
const BackupRestoreModule = lazyView(() => import('./components/BackupRestoreModule'), 'BackupRestoreModule');
const ReferensiView = lazyView(() => import('./components/ReferensiView'), 'ReferensiView');
const GtkView = lazyView(() => import('./components/GtkView'), 'GtkView');
const OperatorDashboard = lazyView(() => import('./components/OperatorDashboard'), 'OperatorDashboard');
const ArsipView = lazyView(() => import('./components/ArsipView'), 'ArsipView');
const AuditLogView = lazyView(() => import('./components/AuditLogView'), 'AuditLogView');
const LegerNilaiView = lazyView(() => import('./components/LegerNilaiView'), 'LegerNilaiView');
const PemetaanKelasView = lazyView(() => import('./components/PemetaanKelasView'), 'PemetaanKelasView');
const SchoolManagerModal = lazyView(() => import('./components/SchoolManagerModal'), 'SchoolManagerModal');
const CetakKartuMassal = lazyView(() => import('./components/CetakKartuMassal'), 'CetakKartuMassal');
import type { RencanaRombel } from './components/ArsipView';
import type { DokumenMutasiKeluar } from './components/MutasiWizard';
import { ToastHost } from './components/ToastHost';
import { ConfirmDialogHost } from './components/ConfirmDialogHost';
import { ErrorBoundary } from './components/ErrorBoundary';
import { toast, confirmDialog } from './utils/notify';
import { FileText, Search, User, Printer, Eye, Lock, Users, Award, RefreshCw, BarChart3, Layers, Settings, UserCog, Database, GraduationCap, Contact, LayoutDashboard, Archive, LayoutGrid, ScrollText, Table } from 'lucide-react';
import { PageHeader } from './components/PageHeader';
import { PageControl } from './components/PageControl';
import { SchoolSwitcher } from './components/SchoolSwitcher';
import { TopProgressBar } from './components/TopProgressBar';
import { startTopProgress, doneTopProgress } from './utils/progress';
import { catatAudit } from './utils/audit';
import { catatHapusCloud } from './utils/tombstone';
import { centangAutoBackup } from './utils/autoBackup';
import { validateSchoolEntryInput } from './utils/validation';

const TAB_META: Record<string, { title: string; subtitle: string; accent: 'blue' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'purple' | 'slate'; icon: typeof Users }> = {
  dasbor: { title: 'Dasbor Operasional', subtitle: 'Antrean tugas & ringkasan kerja operator hari ini', accent: 'blue', icon: LayoutDashboard },
  siswa: { title: 'Master Siswa', subtitle: 'Kelola ledger digital A–I seluruh peserta didik aktif', accent: 'blue', icon: Users },
  raport: { title: 'Nilai Raport', subtitle: 'Input nilai Kurikulum Merdeka + promosi kenaikan multi-tahun', accent: 'indigo', icon: Award },
  leger: { title: 'Leger Nilai', subtitle: 'Rekap gabungan nilai per mapel + peringkat per rombel', accent: 'indigo', icon: Table },
  dapodik: { title: 'Sinkron Dapodik', subtitle: 'Tarik peserta didik & profil sekolah dari Web Service lokal', accent: 'amber', icon: RefreshCw },
  rekap: { title: 'Rekapitulasi', subtitle: 'Statistik rombel, agama, PPDB & capaian P5 untuk dinas', accent: 'emerald', icon: BarChart3 },
  cetak: { title: 'Pusat Cetak', subtitle: 'Lembar buku induk standar dinas & kartu pelajar', accent: 'slate', icon: Printer },
  referensi: { title: 'Data Referensi', subtitle: 'Rombel, PTK & profil sekolah hasil sinkronisasi', accent: 'purple', icon: Layers },
  gtk: { title: 'Data GTK', subtitle: 'Guru & tendik hasil sinkronisasi Dapodik (getGtk/getPTK)', accent: 'indigo', icon: Contact },
  arsip: { title: 'Arsip Tahun Ajaran', subtitle: 'Potret terkunci per tahun + tutup tahun & promosi massal', accent: 'slate', icon: Archive },
  pemetaan: { title: 'Pemetaan Kelas', subtitle: 'Daftar rombel resmi per tahun ajaran', accent: 'amber', icon: LayoutGrid },
  pengaturan: { title: 'Profil Sekolah', subtitle: 'Identitas, periode aktif & konfigurasi layanan', accent: 'slate', icon: Settings },
  users: { title: 'Manajemen Pengguna', subtitle: 'Akun administrator & operator beserta batas rombel', accent: 'purple', icon: UserCog },
  backup: { title: 'Backup & Restore', subtitle: 'Cadangan JSON lokal & Google Drive', accent: 'rose', icon: Database },
  audit: { title: 'Log Audit', subtitle: 'Jejak siapa-ubah-apa di database ini', accent: 'slate', icon: ScrollText },
};

/** Fallback saat chunk tab/modal diunduh (sekaligus menjawab backlog skeleton loading). */
function TabLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-3 anim-fade-up" aria-live="polite">
      <div className="w-8 h-8 border-[3px] border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-xs text-slate-500 font-medium">Memuat halaman…</p>
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [impersonator, setImpersonator] = useState<AppUser | null>(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  // Wizard penyiapan: tampil kapan pun database kosong. "Lewati" hanya
  // berlaku sesi ini (in-memory) — reload/ganti sekolah menampilkan lagi.
  const [skippedSetup, setSkippedSetup] = useState<boolean>(false);
  const [sessionTahun, setSessionTahun] = useState<string | null>(() => {
    try {
      return getSessionTahunAjaran();
    } catch {
      return null;
    }
  });

  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [sekolah, setSekolah] = useState<SekolahProfile>(initialSekolahProfile);
  const [dapodikConfig, setDapodikConfig] = useState<DapodikConfig>(initialDapodikConfig);
  const [syncLogs, setSyncLogs] = useState<DapodikSyncLog[]>([]);
  const [rombelRefs, setRombelRefs] = useState<RombelRef[]>([]);
  const [ptkRefs, setPtkRefs] = useState<PtkRef[]>([]);
  const [tutupTahun, setTutupTahun] = useState<TutupTahunAjaran[]>([]);
  const [petaKelas, setPetaKelas] = useState<PetaKelas[]>([]);
  const [loading, setLoading] = useState(true);

  // Active navigation tab: 'dasbor' | 'siswa' | 'dapodik' | 'rekap' | 'cetak' | 'pengaturan' | 'users'
  const [activeTab, setActiveTab] = useState<string>('dasbor');

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSiswa, setEditingSiswa] = useState<Siswa | null>(null);
  const [detailSiswa, setDetailSiswa] = useState<Siswa | null>(null);
  const [printSiswa, setPrintSiswa] = useState<Siswa | null>(null);
  const [mutasiOpen, setMutasiOpen] = useState(false);

  // Search + pagination state for 'cetak' tab student selector
  const [cetakSearch, setCetakSearch] = useState('');
  const [cetakPage, setCetakPage] = useState(1);
  const [cetakPageSize, setCetakPageSize] = useState(9);
  const [cetakPilih, setCetakPilih] = useState<string[]>([]);
  const [kartuMassalOpen, setKartuMassalOpen] = useState(false);

  // ----- Multi-sekolah / multi-database -----
  const [schools, setSchools] = useState<SchoolEntry[]>([]);
  const [activeSchoolId, setActiveSchoolId] = useState<string | null>(null);
  const [schoolManagerOpen, setSchoolManagerOpen] = useState(false);
  const [switchingSchoolId, setSwitchingSchoolId] = useState<string | null>(null);
  const [schoolSiswaCounts, setSchoolSiswaCounts] = useState<Record<string, number | null>>({});

  // Sidebar collapse state (persisted, so it isn't forgotten)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('bukuinduk_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });

  const handleToggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      try {
        localStorage.setItem('bukuinduk_sidebar_collapsed', prev ? '0' : '1');
      } catch {
        /* ignore storage errors */
      }
      return !prev;
    });
  };

  // ----- Multi-user access control -----
  const isAdmin = isAdministrator(currentUser);
  // Sesi efektif = batas atas data (sesi login menang atas tahun aktif profil).
  const sesiEfektif = useMemo(
    () => tahunSesiEfektif(sessionTahun, sekolah.tahunAjaran),
    [sessionTahun, sekolah.tahunAjaran]
  );
  // Operator hanya melihat data rombel yang ditugaskan (rombelAkses);
  // semua peran hanya melihat data ≤ sesi aktif (cutoff ke atas).
  const visibleSiswa = useMemo(
    () => filterSiswaByAccess(siswaList, currentUser).filter((s) => siswaTerlihatSesi(s, sesiEfektif)),
    [siswaList, currentUser, sesiEfektif]
  );
  const adminOnlyTabs = ['dapodik', 'pengaturan', 'backup', 'users', 'pemetaan', 'audit'];

  // Daftar cetak terfilter + pagination (setelah visibleSiswa tersedia)
  const cetakFiltered = useMemo(() => {
    const q = cetakSearch.trim().toLowerCase();
    if (!q) return visibleSiswa;
    return visibleSiswa.filter(
      (s) =>
        s.namaLengkap.toLowerCase().includes(q) ||
        s.nisn?.includes(q) ||
        s.rombelSaatIni?.toLowerCase().includes(q)
    );
  }, [visibleSiswa, cetakSearch]);

  // Kembali ke halaman 1 setiap pencarian/data berubah
  useEffect(() => {
    setCetakPage(1);
  }, [cetakSearch, visibleSiswa.length]);

  const cetakTotalPages = Math.max(1, Math.ceil(cetakFiltered.length / cetakPageSize));
  const cetakSafePage = Math.min(cetakPage, cetakTotalPages);
  const cetakPaged = useMemo(() => {
    const start = (cetakSafePage - 1) * cetakPageSize;
    return cetakFiltered.slice(start, start + cetakPageSize);
  }, [cetakFiltered, cetakSafePage, cetakPageSize]);

  // Penjaga navigasi: operator tidak boleh masuk tab khusus administrator.
  // Menu admin hanya ada di dropdown pengguna navbar (tidak di sidebar),
  // dan setiap upaya akses langsung ditolak + dikembalikan ke Dasbor.
  const handleNavigateTab = useCallback((tab: string) => {
    if (!isAdministrator(currentUser) && adminOnlyTabs.includes(tab)) {
      toast('Akses ditolak: halaman ini khusus Administrator.', 'error');
      setActiveTab('dasbor');
      return;
    }
    // Progres atas tiap pindah halaman agar reload tab selalu terlihat.
    startTopProgress();
    setActiveTab(tab);
    window.setTimeout(() => doneTopProgress(), 450);
  }, [currentUser]);

  // Jika peran berubah (mis. selesai impersonate / ganti akun), pastikan
  // operator tidak tertinggal di halaman admin.
  useEffect(() => {
    if (currentUser && !isAdministrator(currentUser) && adminOnlyTabs.includes(activeTab)) {
      setActiveTab('dasbor');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const AccessDeniedNotice = (
    <div className="ui-card p-10 text-center space-y-3 anim-fade-up">
      <div className="mx-auto w-12 h-12 rounded bg-gradient-to-br from-rose-500 to-rose-700 text-white flex items-center justify-center shadow-md">
        <Lock className="w-6 h-6" />
      </div>
      <h2 className="text-base font-extrabold text-slate-900">Akses Ditolak</h2>
      <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
        Halaman ini khusus Administrator. Akun operator hanya dapat mengakses Master Siswa, Nilai Raport,
        Rekapitulasi, dan Cetak untuk rombel yang ditugaskan kepadanya
        {currentUser?.rombelAkses && currentUser.rombelAkses.length > 0
          ? `: ${currentUser.rombelAkses.join(', ')}`
          : ''}
        .
      </p>
      <button
        onClick={() => setActiveTab('dasbor')}
        className="ui-btn ui-btn-primary"
      >
        Kembali ke Dasbor
      </button>
    </div>
  );

  // Check initial user authentication session (+ sesi tahun ajaran)
  // S2: sesi dari localStorage TIDAK langsung dipercaya — divalidasi ulang ke
  // database (user harus ADA & status 'aktif'), dan role/nama diambil dari DB.
  useEffect(() => {
    const sessionUser = getCurrentUserSession();
    const impUser = getImpersonateSession();
    const sessionTA = getSessionTahunAjaran();

    // Pesan tunda sehabis reset total database (sebelum reload).
    try {
      const pending = sessionStorage.getItem('bukuinduk_post_reset');
      if (pending) {
        sessionStorage.removeItem('bukuinduk_post_reset');
        window.setTimeout(() => toast(pending, 'success'), 600);
      }
    } catch {
      /* abaikan */
    }

    if (!sessionUser) {
      clearSessionTahunAjaran();
      setSessionTahun(null);
      setIsLoginOpen(true);
      return;
    }

    // S2: validasi sesi ke database sebelum peran dari localStorage dipakai.
    (async () => {
      try {
        const users = await getAllUsers();
        const dbUser =
          users.find((u) => u.id === sessionUser.id) ??
          users.find((u) => u.username.toLowerCase() === sessionUser.username.toLowerCase());
        if (!dbUser || dbUser.status !== 'aktif') {
          // S2: akun tidak ada / dinonaktifkan → paksa logout, jangan restore sesi.
          clearCurrentUserSession();
          clearImpersonateSession();
          clearSessionTahunAjaran();
          setCurrentUser(null);
          setImpersonator(null);
          setSessionTahun(null);
          setIsLoginOpen(true);
          toast('Sesi berakhir: akun tidak ditemukan atau dinonaktifkan.', 'error');
          return;
        }
        // Sesi lama tanpa TA: tetap izinkan masuk, TA akan dilengkapi
        // setelah data dimuat (efek validasi di bawah).
        setCurrentUserSession(dbUser); // S2: sinkronkan sesi tersimpan dengan data DB
        setCurrentUser(dbUser); // S2: pakai role/nama dari DB, bukan dari sesi
        setImpersonator(impUser);
        setSessionTahun(sessionTA);
        setIsLoginOpen(false);
      } catch {
        // S2: gagal membaca DB saat boot → tolak sesi, jangan percaya peran buta.
        clearCurrentUserSession();
        clearImpersonateSession();
        setCurrentUser(null);
        setImpersonator(null);
        setIsLoginOpen(true);
        toast('Gagal memvalidasi sesi. Silakan masuk kembali.', 'error');
      }
    })();
  }, []);

  // Penjadwal cadangan otomatis: centang tiap menit, snapshot bila jatuh tempo.
  // Diam (tanpa toast) agar tidak mengganggu; status terlihat di tab Backup.
  useEffect(() => {
    let berhenti = false;
    const centang = () => {
      if (berhenti) return;
      void centangAutoBackup().catch(() => null);
    };
    const timer = window.setInterval(centang, 60000);
    // Tunda centang pertama 60 dtk agar boot tidak terbebani ekspor.
    return () => {
      berhenti = true;
      window.clearInterval(timer);
    };
  }, []);

  // Load initial data from IndexedDB (sekolah aktif)
  const loadData = useCallback(async () => {
    startTopProgress();
    try {
      setLoading(true);
      await ensureSchoolsInit().catch(() => null);
      await initStorage();
      const [siswa, sek, cfg, logs, rombel, ptk, tutup, peta] = await Promise.all([
        getAllSiswa(),
        getSekolahProfile(),
        getDapodikConfig(),
        getSyncLogs(),
        getAllRombelRefs(),
        getAllPtkRefs(),
        getTutupTahun(),
        getAllPetaKelas()
      ]);
      setSiswaList(siswa);
      setSekolah(sek);
      setDapodikConfig(cfg);
      setSyncLogs(logs);
      setRombelRefs(rombel);
      setPtkRefs(ptk);
      setTutupTahun(tutup);
      setPetaKelas(peta);
      try {
        setSchools(getSchools());
        setActiveSchoolId(getActiveSchoolId());
      } catch {
        /* abaikan */
      }
    } catch (err) {
      console.error('Failed loading data from IndexedDB:', err);
      toast('Gagal memuat database. Coba muat ulang halaman.', 'error');
    } finally {
      setLoading(false);
      doneTopProgress();
    }
  }, []);

  // Hitung jumlah siswa per database untuk lencana pemilih sekolah
  const refreshSchoolCounts = useCallback(async (list: SchoolEntry[]) => {
    const entries = await Promise.all(
      (list || []).map(async (s) => {
        const c = await getSchoolSiswaCount(s.dbName).catch(() => null);
        return [s.id, c] as const;
      })
    );
    setSchoolSiswaCounts(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    if (schools.length > 0) void refreshSchoolCounts(schools);
  }, [schools, siswaList.length, refreshSchoolCounts]);

  const handleSwitchSchool = useCallback(async (id: string) => {
    if (switchingSchoolId) return;
    setSwitchingSchoolId(id);
    try {
      const { entry, keptSession } = await switchActiveSchool(id);
      if (!entry) {
        toast('Sekolah tidak ditemukan di registry.', 'error');
        return;
      }
      // Bersihkan state tampilan agar tidak bocor antar-database
      setEditingSiswa(null);
      setDetailSiswa(null);
      setPrintSiswa(null);
      setCetakSearch('');
      setCetakPage(1);
      setActiveTab('dasbor');
      setSkippedSetup(false);
      await loadData();
      if (!keptSession) {
        setCurrentUser(null);
        setImpersonator(null);
        setSessionTahun(null);
        setIsLoginOpen(true);
        toast(`Beralih ke "${entry.nama}". Silakan masuk dengan akun sekolah tersebut.`, 'warning');
      } else {
        const fresh = getCurrentUserSession();
        if (fresh) setCurrentUser(fresh);
        setSessionTahun(getSessionTahunAjaran());
        toast(`Sekolah aktif: ${entry.nama} (${entry.jenjang}).`, 'success');
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Gagal beralih sekolah.', 'error');
    } finally {
      setSwitchingSchoolId(null);
    }
  }, [loadData, switchingSchoolId]);

  const handleCreateSchool = useCallback(async (input: { nama: string; npsn: string; jenjang: JenjangSekolah; withSample: boolean }) => {
    const issues = validateSchoolEntryInput(
      input,
      getSchools().map((s) => s.npsn || '').filter(Boolean)
    );
    if (issues.length > 0) {
      toast(issues[0], 'error');
      throw new Error(issues[0]);
    }
    startTopProgress();
    try {
      const entry = await createSchoolWithDatabase(input);
      setSchools(getSchools());
      await refreshSchoolCounts(getSchools());
      toast(`Sekolah "${entry.nama}" ditambahkan dengan database sendiri.`, 'success');
    } catch (err: unknown) {
      toast(`Gagal menambah sekolah: ${err instanceof Error ? err.message : String(err)}`, 'error');
      throw err;
    } finally {
      doneTopProgress();
    }
  }, [refreshSchoolCounts]);

  // ----- Tutup & arsip tahun ajaran (ritme Dapodik: tutup dulu, sinkron kemudian) -----
  const tahunTerkunci = useMemo(() => tutupTahun.map((t) => t.tahunAjaran), [tutupTahun]);

  // ----- Login per tahun ajaran: daftar TA + validasi sesi -----
  const daftarTahunAjaran = useMemo(
    () =>
      getDaftarTahunAjaran({
        sekolah: { tahunAjaran: sekolah.tahunAjaran },
        tutup: tutupTahun,
        peta: petaKelas,
        siswa: siswaList,
      }),
    [sekolah.tahunAjaran, tutupTahun, petaKelas, siswaList]
  );

  const tahunDiizinkan = useMemo(
    () => getTahunDiizinkan(currentUser, daftarTahunAjaran),
    [currentUser, daftarTahunAjaran]
  );

  // Validasi sesi TA setiap data/user berubah:
  // - lengkapi sesi lama yang belum punya TA (default = TA aktif bila diizinkan)
  // - paksa login ulang bila sesi TA di luar hak tahunAkses operator
  useEffect(() => {
    if (loading) return;
    if (!currentUser) return;
    const sesi = getSessionTahunAjaran();
    if (sesi && canUserAccessTahun(currentUser, sesi)) {
      if (sesi !== sessionTahun) setSessionTahun(sesi);
      return;
    }
    if (sesi && !canUserAccessTahun(currentUser, sesi)) {
      clearSessionTahunAjaran();
      clearImpersonateSession();
      clearCurrentUserSession();
      setCurrentUser(null);
      setImpersonator(null);
      setSessionTahun(null);
      setIsLoginOpen(true);
      toast('Sesi tahun ajaran Anda tidak lagi diizinkan. Silakan masuk ulang.', 'warning');
      return;
    }
    // Sesi lama tanpa TA → lengkapi otomatis tanpa memaksa login ulang.
    const def =
      sekolah.tahunAjaran && canUserAccessTahun(currentUser, sekolah.tahunAjaran)
        ? sekolah.tahunAjaran
        : getTahunDiizinkan(currentUser, daftarTahunAjaran)[0] || null;
    if (def) {
      setSessionTahunAjaran(def);
      setSessionTahun(def);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, currentUser, sekolah.tahunAjaran, daftarTahunAjaran]);

  const handleTutupTahun = useCallback(async (args: {
    tahunTutup: string;
    tahunBaru: string;
    groups: RencanaRombel[];
  }) => {
    // Ritual tutup tahun hanya dalam sesi tahun yang ditutup.
    const sesi = tahunSesiEfektif(sessionTahun, sekolah.tahunAjaran);
    if (sesi && args.tahunTutup.trim() !== sesi) {
      toast(`Tutup tahun hanya dalam sesi tahun yang ditutup (sesi aktif TA ${sesi}). Pindah sesi dulu.`, 'error');
      return;
    }
    if (!canUserAccessTahun(currentUser, args.tahunTutup.trim())) {
      toast(`Akses ditolak: akun @${currentUser?.username} tidak memiliki akses ke tahun ${args.tahunTutup}.`, 'error');
      return;
    }
    if (!canUserAccessTahun(currentUser, args.tahunBaru.trim())) {
      toast(`Akses ditolak: akun @${currentUser?.username} tidak memiliki akses ke tahun ${args.tahunBaru}.`, 'error');
      return;
    }
    // Validasi rencana promosi
    for (const g of args.groups) {
      if (g.status !== 'Lulus') {
        if (!g.nextTingkat || !['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(g.nextTingkat)) {
          toast(`Tingkat baru rombel ${g.rombel || '?'} tidak valid.`, 'error');
          return;
        }
        if (!g.nextRombel || !g.nextRombel.trim()) {
          toast(`Rombel baru untuk ${g.rombel || '?'} wajib diisi.`, 'error');
          return;
        }
      }
      if (g.ids.length === 0) {
        toast(`Rombel ${g.rombel || '?'} kosong — tidak ada yang dipromosi.`, 'warning');
        return;
      }
    }
    startTopProgress();
    try {
      // 1. Potret arsip SEBELUM promosi (roster = keadaan saat penutupan)
      const lulus = args.groups.filter((g) => g.status === 'Lulus').reduce((n, g) => n + g.ids.length, 0);
      const naik = args.groups.filter((g) => g.status === 'Naik Kelas').reduce((n, g) => n + g.ids.length, 0);
      const tinggal = args.groups.filter((g) => g.status === 'Tinggal di Kelas').reduce((n, g) => n + g.ids.length, 0);
      const { ringkasan, roster } = buildSnapshot(siswaList, { lulus, naik, tinggal });

      // 2. Promosikan per rombel (menulis riwayat tahun lama, bukan menimpa)
      // F15: DUA FASE agar tutup tahun tidak setengah jalan —
      //   (a) KUMPUL: baca semua siswa & hitung rekaman baru dulu, TANPA tulis;
      //   (b) TULIS: saveSiswaBulk sekaligus (satu transaksi IDB; fallback LS
      //       juga menimpa seluruh array sekaligus).
      // Penguncian tahun (langkah 3) hanya jalan bila fase (b) sukses penuh.
      // Bila fase (b) gagal: tahun TIDAK dikunci, error jelas ditampilkan.
      // Catatan: rollback manual penuh tidak mungkin tanpa transaksi IDB
      // lintas-store, jadi operator harus verifikasi daftar siswa bila ini
      // terjadi sebelum mencoba tutup tahun ulang.
      const nowIso = new Date().toISOString();
      const promosiBaru: Siswa[] = [];
      for (const g of args.groups) {
        const nextRombel = g.status === 'Lulus' ? g.rombel : g.nextRombel.trim().toUpperCase();
        for (const id of g.ids) {
          const s = await getSiswaById(id); // F15(a): hanya baca
          if (!s) continue;
          const tingkatLama = getTingkatAktifSiswa(s);
          const rombelLama = s.rombelSaatIni;
          // F1: tahunLama = tahun sesi yang ditutup (eksplisit).
          const tahunLama =
            args.tahunTutup.trim() || getTahunAjaranTerakhirSiswa(s) || args.tahunBaru;
          const riwayat: RiwayatTahunAjaran = {
            id: `rth-${Date.now()}-${s.id}-${promosiBaru.length}`,
            tahunAjaran: tahunLama,
            tingkat: tingkatLama,
            rombel: rombelLama,
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
        }
      }
      // F15(b): satu kali tulis; gagal → lempar, tahun tidak dikunci.
      await saveSiswaBulk(promosiBaru);

      // 3. Kunci tahun + putar tahun aktif ke semester gasal tahun baru
      await saveTutupTahun({
        tahunAjaran: args.tahunTutup,
        ditutupPada: new Date().toISOString(),
        ditutupOleh: currentUser?.namaLengkap || currentUser?.username,
        tahunAktifBaru: args.tahunBaru,
        ringkasan,
        roster,
      });
      const profilBaru: SekolahProfile = {
        ...sekolah,
        tahunAjaran: args.tahunBaru,
        semesterAktif: '1 (Ganjil)',
      };
      await saveSekolahProfile(profilBaru);
      setSekolah(profilBaru);

      await loadData();
      // Fondasi sesi: sesi mengikuti tahun aktif baru bila diizinkan user.
      if (canUserAccessTahun(currentUser, args.tahunBaru.trim())) {
        setSessionTahunAjaran(args.tahunBaru.trim());
        setSessionTahun(args.tahunBaru.trim());
      }
      catatAudit('tutup_tahun', {
        entitas: 'tahun',
        entitasId: args.tahunTutup,
        ringkasan: `Tutup ${args.tahunTutup} → ${args.tahunBaru} (Lulus: ${lulus}, Naik: ${naik}, Tinggal: ${tinggal})`,
      });
      toast(
        `Tahun ${args.tahunTutup} ditutup & dikunci. Lulus: ${lulus}, Naik: ${naik}, Tinggal: ${tinggal}. Tahun aktif: ${args.tahunBaru}. Lanjutkan Sinkron Dapodik untuk murid baru.`,
        'success'
      );
    } catch (err: unknown) {
      toast(`Gagal menutup tahun: ${err instanceof Error ? err.message : String(err)}`, 'error');
      throw err;
    } finally {
      doneTopProgress();
    }
  }, [siswaList, sekolah, currentUser, loadData, sessionTahun]);

  const handleBukaTahun = useCallback(async (tahunAjaran: string) => {
    // Buka kunci hanya dalam sesi tahun tersebut.
    const sesi = tahunSesiEfektif(sessionTahun, sekolah.tahunAjaran);
    if (sesi && tahunAjaran.trim() !== sesi) {
      toast(`Buka kunci hanya dalam sesi tahun tersebut (sesi aktif TA ${sesi}). Pindah sesi dulu.`, 'error');
      throw new Error(`Di luar sesi aktif (TA ${sesi}).`);
    }
    startTopProgress();
    try {
      await deleteTutupTahun(tahunAjaran);
      await loadData();
      catatHapusCloud('tutup', tahunAjaran);
      catatAudit('buka_tahun', {
        entitas: 'tahun',
        entitasId: tahunAjaran,
        ringkasan: `Buka kunci tahun ${tahunAjaran}`,
      });      toast(
        `Kunci tahun ${tahunAjaran} dibuka. Catatan: promosi/rombel TIDAK dikembalikan otomatis.`,
        'warning'
      );
    } catch (err: unknown) {
      toast(`Gagal membuka kunci: ${err instanceof Error ? err.message : String(err)}`, 'error');
      throw err;
    } finally {
      doneTopProgress();
    }
  }, [loadData, sessionTahun, sekolah]);

  const handleDeleteSchool = useCallback(async (id: string, deletePhysical: boolean) => {
    const target = getSchools().find((s) => s.id === id);
    const wasActive = getActiveSchoolId() === id;
    deleteSchoolEntry(id, { deletePhysical });
    const remaining = getSchools();
    setSchools(remaining);
    await refreshSchoolCounts(remaining);
    if (wasActive) {
      setEditingSiswa(null);
      setDetailSiswa(null);
      setPrintSiswa(null);
      setActiveTab('dasbor');
      setSkippedSetup(false);
      await loadData();
      // Validasi sesi terhadap database pengganti
      try {
        const users = await getAllUsers();
        const sess = getCurrentUserSession();
        const stillThere = sess && users.some((u) => u.username.toLowerCase() === sess.username.toLowerCase());
        if (!stillThere) {
          setCurrentUser(null);
          setImpersonator(null);
          setIsLoginOpen(true);
        }
      } catch {
        /* abaikan */
      }
    }
    toast(`Sekolah "${target?.nama || ''}" dihapus${deletePhysical ? ' beserta database fisiknya' : ''}.`, 'success');
  }, [loadData, refreshSchoolCounts]);

  const [resettingMain, setResettingMain] = useState(false);

  // Hapus TOTAL semua database kecuali utama → reload agar hapus fisik tuntas.
  const handleResetToMain = useCallback(async () => {
    if (resettingMain) return;
    setResettingMain(true);
    startTopProgress();
    try {
      const { entry, removed } = await resetToSingleMainDatabase();
      try {
        sessionStorage.setItem(
          'bukuinduk_post_reset',
          removed > 0
            ? `Beres: ${removed} database non-utama dihapus. Tersisa database utama "${entry.nama}".`
            : `Beres: tidak ada database lain. Database utama "${entry.nama}" tetap aktif.`
        );
      } catch {
        /* abaikan */
      }
      window.location.reload();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Gagal mereset database.', 'error');
      setResettingMain(false);
      doneTopProgress();
    }
  }, [resettingMain]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Tema warna: biru (SMP) / maroon (SD), otomatis ikut jenjang bila tak dikunci.
  useEffect(() => {
    try {
      document.documentElement.dataset.tema = resolveTemaEfektif(sekolah);
    } catch {
      /* abaikan */
    }
  }, [sekolah]);

  // Mode tampilan gelap/terang per perangkat (semua peran).
  const [modeTampilan, setModeTampilan] = useState<ModeTampilan>(() => bacaModeTampilan());
  useEffect(() => {
    terapkanModeTampilan(modeTampilan);
  }, [modeTampilan]);
  const handleGantiMode = useCallback(() => {
    setModeTampilan((prev) => {
      const next = modeBerikutnya(prev);
      simpanModeTampilan(next);
      return next;
    });
  }, []);

  // Auth Handlers (login per tahun ajaran)
  const handleLoginSuccess = (user: AppUser, tahunAjaran?: string) => {
    const sesi = (tahunAjaran || getSessionTahunAjaran() || '').trim();
    if (sesi && !canUserAccessTahun(user, sesi)) {
      toast(`Akun @${user.username} tidak memiliki akses ke tahun ${sesi}.`, 'error');
      clearSessionTahunAjaran();
      setSessionTahun(null);
      setIsLoginOpen(true);
      return;
    }
    if (sesi) {
      setSessionTahunAjaran(sesi);
      setSessionTahun(sesi);
    }
    setCurrentUserSession(user);
    setCurrentUser(user);
    setImpersonator(null);
    setIsLoginOpen(false);
    catatAudit('login', {
      entitas: 'sesi',
      entitasId: user.id,
      ringkasan: `@${user.username} masuk • Sesi TA ${sesi || '-'}`,
    });
  };

  const handleLogout = () => {
    if (currentUser) {
      catatAudit('logout', {
        entitas: 'sesi',
        entitasId: currentUser.id,
        ringkasan: `@${currentUser.username} keluar`,
      });
    }
    clearImpersonateSession();
    clearCurrentUserSession();
    clearSessionTahunAjaran();
    setCurrentUser(null);
    setImpersonator(null);
    setSessionTahun(null);
    setSkippedSetup(false);
    setIsLoginOpen(true);
  };

  // S3: logout otomatis setelah 30 menit tanpa aktivitas (perangkat bersama di
  // sekolah tidak boleh membiarkan sesi terbuka). Timer di-reset pada setiap
  // aktivitas user dan dibersihkan saat logout/unmount oleh hook.
  useIdleLogout(
    () => {
      toast('Anda keluar otomatis karena 30 menit tidak aktif.', 'warning');
      handleLogout();
    },
    30 * 60 * 1000,
    !!currentUser
  );

  const handleSwitchTahun = useCallback((tahun: string) => {
    const t = (tahun || '').trim();
    if (!t) return;
    if (!daftarTahunAjaran.includes(t)) {
      toast(`Tahun ${t} tidak dikenal di database ini.`, 'error');
      return;
    }
    if (!canUserAccessTahun(currentUser, t)) {
      toast(`Akses ditolak: akun @${currentUser?.username} tidak memiliki akses ke tahun ${t}.`, 'error');
      return;
    }
    setSessionTahunAjaran(t);
    setSessionTahun(t);
    catatAudit('sesi_pindah', {
      entitas: 'sesi',
      ringkasan: `Pindah sesi ke TA ${t}`,
    });
    toast(`Sesi tahun ajaran: ${t}.`, 'success');
  }, [currentUser, daftarTahunAjaran]);

  // S2: izin impersonate diverifikasi dari data database — peran administrator
  // dicek ulang terhadap record DB yang masih aktif, bukan dari memori.
  const handleStartImpersonate = async (operatorUser: AppUser) => {
    if (!currentUser) return;
    let bolehMenyamar = false;
    try {
      const users = await getAllUsers();
      const dbSelf =
        users.find((u) => u.id === currentUser.id) ??
        users.find((u) => u.username.toLowerCase() === currentUser.username.toLowerCase());
      bolehMenyamar = !!dbSelf && dbSelf.status === 'aktif' && isAdministrator(dbSelf); // S2
    } catch {
      bolehMenyamar = false;
    }
    if (!bolehMenyamar) {
      toast('Akses ditolak: impersonate hanya untuk Administrator yang masih aktif.', 'error');
      return;
    }
    if (sessionTahun && !canUserAccessTahun(operatorUser, sessionTahun)) {
      toast(`Operator @${operatorUser.username} tidak memiliki akses ke sesi TA ${sessionTahun}.`, 'error');
      return;
    }
    setImpersonateSession(currentUser, operatorUser);
    setImpersonator(currentUser);
    setCurrentUser(operatorUser);
    setActiveTab('dasbor');
    catatAudit('impersonate_mulai', {
      entitas: 'akun',
      entitasId: operatorUser.id,
      ringkasan: `@${currentUser.username} menyamar sebagai @${operatorUser.username}`,
    });
  };

  const handleStopImpersonating = () => {
    if (!impersonator) return;
    catatAudit('impersonate_selesai', {
      entitas: 'akun',
      entitasId: currentUser?.id,
      ringkasan: `@${impersonator.username} selesai menyamar`,
    });
    clearImpersonateSession();
    setCurrentUser(impersonator);
    setImpersonator(null);
    setActiveTab('users');
  };

  // Handle Save Siswa (Add or Edit) — operator hanya boleh simpan rombel aksesnya.
  // Tahap 2J: field tetap Dapodik (NISN/NIPD/NIK/KK/Akta/TTL/JK/NIK ortu) dipertahankan
  // dari record lama bila sudah terisi (anti-bypass devtools); sinkron Dapodik tetap
  // berkuasa via convertDapodikToSiswa.
  const handleSaveSiswa = async (siswaData: Siswa) => {
    if (!canUserAccessRombel(currentUser, siswaData.rombelSaatIni)) {
      toast(`Akses ditolak: rombel ${siswaData.rombelSaatIni} di luar kewenangan Anda.`, 'error');
      return;
    }
    const prev = (siswaList || []).find((s) => s.id === siswaData.id);
    // Input manual: siswa baru dikonfirmasi masuk ke tahun sesi aktif.
    if (!prev) {
      const sesiLabel = sesiEfektif || sessionTahun || sekolah.tahunAjaran || '-';
      const ok = await confirmDialog(
        `"${(siswaData.namaLengkap || 'Siswa baru').trim()}" akan didaftarkan pada tahun sesi aktif (TA ${sesiLabel}). Lanjutkan?`,
        { confirmLabel: 'Ya, Daftarkan' }
      );
      if (!ok) return;
    }
    const keep = (oldV: unknown, newV: unknown) =>
      String(oldV ?? '').trim() !== '' ? oldV : newV;
    const locked: Siswa = prev
      ? {
          ...siswaData,
          nisn: keep(prev.nisn, siswaData.nisn) as string,
          nipd: keep(prev.nipd, siswaData.nipd) as string,
          nik: keep(prev.nik, siswaData.nik) as string,
          noKk: keep(prev.noKk, siswaData.noKk) as string,
          noAktaLahir: keep(prev.noAktaLahir, siswaData.noAktaLahir) as string,
          tempatLahir: keep(prev.tempatLahir, siswaData.tempatLahir) as string,
          tanggalLahir: keep(prev.tanggalLahir, siswaData.tanggalLahir) as string,
          jenisKelamin: (prev.jenisKelamin || siswaData.jenisKelamin) as Siswa['jenisKelamin'],
          ayah: { ...siswaData.ayah, nik: keep(prev.ayah?.nik, siswaData.ayah?.nik) as string },
          ibu: { ...siswaData.ibu, nik: keep(prev.ibu?.nik, siswaData.ibu?.nik) as string },
        }
      : siswaData;
    startTopProgress();
    try {
      await saveSiswa(locked);
      await loadData();
      setIsFormOpen(false);
      setEditingSiswa(null);
      catatAudit(prev ? 'siswa_ubah' : 'siswa_tambah', {
        entitas: 'siswa',
        entitasId: locked.id,
        ringkasan: `${prev ? 'Ubah' : 'Tambah'} siswa "${(siswaData.namaLengkap || '').trim()}" (${locked.rombelSaatIni || '-'})`,
      });
      toast(`Data "${(siswaData.namaLengkap || 'siswa').trim()}" berhasil disimpan.`, 'success');
    } catch (err: unknown) {
      toast(`Gagal menyimpan data siswa: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      doneTopProgress();
    }
  };

  // Handle Update Foto Siswa dari kolom aksi (crop 4:6, maks 500 KB sudah di proses di caller).
  // Sukses/gagal dinotifikasi oleh pemanggil (SiswaList); handler ini hanya melempar Error.
  const handleUpdateFoto = async (siswa: Siswa, fotoUrl: string) => {
    if (!canUserAccessRombel(currentUser, siswa.rombelSaatIni)) {
      throw new Error('Akses ditolak: data ini di luar kewenangan rombel Anda.');
    }
    startTopProgress();
    try {
      const fresh = (siswaList || []).find((x) => x.id === siswa.id) || siswa;
      await saveSiswa({ ...fresh, fotoUrl, updatedAt: new Date().toISOString() });
      await loadData();
    } finally {
      doneTopProgress();
    }
  };

  // Handle Mutasi Masuk (dari wizard): registrasi pindahan ringkas.
  const handleApplyMutasiMasuk = async (baru: Siswa) => {
    if (!canUserAccessRombel(currentUser, baru.rombelSaatIni)) {
      toast(`Akses ditolak: rombel ${baru.rombelSaatIni} di luar kewenangan Anda.`, 'error');
      return;
    }
    const sesiLabel = sesiEfektif || sessionTahun || sekolah.tahunAjaran || '-';
    const ok = await confirmDialog(
      `"${baru.namaLengkap.trim()}" (pindahan dari ${baru.asalMutasi || '-'}) akan didaftarkan pada tahun sesi aktif (TA ${sesiLabel}). Lanjutkan?`,
      { confirmLabel: 'Ya, Daftarkan' }
    );
    if (!ok) return;
    startTopProgress();
    try {
      await saveSiswa(baru);
      await loadData();
      catatAudit('mutasi_masuk', {
        entitas: 'siswa',
        entitasId: baru.id,
        ringkasan: `Mutasi masuk "${baru.namaLengkap}" dari ${baru.asalMutasi || '-'} → ${baru.rombelSaatIni}`,
      });
      toast(`Siswa pindahan "${baru.namaLengkap}" terdaftar di ${baru.rombelSaatIni}.`, 'success');
    } catch (err: unknown) {
      toast(`Gagal mendaftarkan siswa pindahan: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      doneTopProgress();
    }
  };

  // Handle Mutasi Keluar (dari wizard): status + dokumen serah terima.
  const handleApplyMutasiKeluar = async (id: string, dok: DokumenMutasiKeluar) => {
    const student = (siswaList || []).find((s) => s.id === id);
    if (!student) {
      toast('Data siswa tidak ditemukan.', 'error');
      return;
    }
    if (!canUserAccessRombel(currentUser, student.rombelSaatIni)) {
      toast('Akses ditolak: data ini di luar kewenangan rombel Anda.', 'error');
      return;
    }
    startTopProgress();
    try {
      // F8: tulis entri riwayat tahun ajaran berjalan (status 'Mutasi Keluar')
      // agar riwayat tidak berlubang — mutasi keluar sebelumnya hanya mengisi
      // tanggalKeluar/sekolahTujuan tanpa menyentuh riwayatTahunAjaran.
      const taBerjalan = (sesiEfektif || sessionTahun || sekolah.tahunAjaran || '').trim();
      const sudahTercatat = taBerjalan
        ? (student.riwayatTahunAjaran || []).some(
            (r) =>
              r.tahunAjaran === taBerjalan &&
              (r.statusAkhirTahun === 'Mutasi Keluar' || r.statusKenaikan === 'Mutasi Keluar')
          )
        : true; // tanpa tahun sesi yang jelas → jangan tulis entri tanpa tahun
      const riwayatBaru: RiwayatTahunAjaran[] = sudahTercatat
        ? student.riwayatTahunAjaran || []
        : [
            ...(student.riwayatTahunAjaran || []),
            {
              id: `rth-mutasi-${Date.now()}-${student.id}`,
              tahunAjaran: taBerjalan,
              tingkat: getTingkatAktifSiswa(student),
              rombel: student.rombelSaatIni,
              statusAkhirTahun: 'Mutasi Keluar',
              statusKenaikan: 'Mutasi Keluar',
              catatan: `Mutasi keluar ke ${dok.sekolahTujuan || '-'} (${dok.tanggalKeluar || '-'})`,
            } as RiwayatTahunAjaran,
          ];
      await saveSiswa({
        ...student,
        statusSiswa: 'Mutasi Keluar',
        tanggalKeluar: dok.tanggalKeluar,
        sekolahTujuan: dok.sekolahTujuan,
        noSuratMutasi: dok.noSuratMutasi,
        alasanKeluar: dok.alasanKeluar,
        riwayatTahunAjaran: riwayatBaru,
        updatedAt: new Date().toISOString(),
      });
      await loadData();
      catatAudit('mutasi_keluar', {
        entitas: 'siswa',
        entitasId: id,
        ringkasan: `Mutasi keluar "${student.namaLengkap}" → ${dok.sekolahTujuan}`,
        detail: dok.noSuratMutasi ? `No. surat: ${dok.noSuratMutasi}` : undefined,
      });
      toast(`"${student.namaLengkap}" dimutasi keluar ke ${dok.sekolahTujuan}.`, 'success');
    } catch (err: unknown) {
      toast(`Gagal memproses mutasi keluar: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      doneTopProgress();
    }
  };

  // Handle Delete Siswa — operator hanya boleh hapus rombel aksesnya
  const handleDeleteSiswa = async (id: string) => {
    const student = (siswaList || []).find((s) => s.id === id);
    if (!canUserAccessRombel(currentUser, student?.rombelSaatIni)) {
      toast('Akses ditolak: data ini di luar kewenangan rombel Anda.', 'error');
      return;
    }
    const nama = student?.namaLengkap || 'siswa';
    const ok = await confirmDialog(`Apakah Anda yakin ingin menghapus data "${nama}" dari Buku Induk?`, {
      confirmLabel: 'Ya, Hapus',
      danger: true,
    });
    if (ok) {
      startTopProgress();
      try {
        await deleteSiswa(id);
        await loadData();
        catatHapusCloud('siswa', id);
        catatAudit('siswa_hapus', {
          entitas: 'siswa',
          entitasId: id,
          ringkasan: `Hapus siswa "${nama}" (${student?.rombelSaatIni || '-'})`,
        });
        toast(`Data "${nama}" berhasil dihapus.`, 'success');
        if (detailSiswa?.id === id) setDetailSiswa(null);
        if (printSiswa?.id === id) setPrintSiswa(null);
      } catch (err: unknown) {
        toast(`Gagal menghapus data: ${err instanceof Error ? err.message : String(err)}`, 'error');
      } finally {
        doneTopProgress();
      }
    }
  };

  // Handle Reset to Sample Data
  const handleResetSample = async () => {
    startTopProgress();
    try {
      await resetToInitialData();
      await loadData();
      toast('Data contoh berhasil dimuat ulang.', 'success');
    } catch (err: unknown) {
      toast(`Gagal memuat data contoh: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      doneTopProgress();
    }
  };

  // ----- Wizard penyiapan: database kosong → form tambah sekolah + sinkron -----
  const handleSetupFinish = useCallback(() => {
    setSkippedSetup(true);
    setActiveTab('dasbor');
  }, []);

  const handleSetupLoadSample = useCallback(async () => {
    startTopProgress();
    try {
      await resetToInitialData();
      await loadData();
      toast('Data contoh berhasil dimuat untuk latihan.', 'success');
    } catch (err: unknown) {
      toast(`Gagal memuat data contoh: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      doneTopProgress();
    }
  }, [loadData]);

  // Database kosong = belum ada siswa DAN belum ada log sinkron.
  const dbEmpty = siswaList.length === 0 && syncLogs.length === 0;
  const needSetup = !loading && !!currentUser && isAdmin && dbEmpty && !skippedSetup;
  const operatorEmptyDb =
    !loading && !!currentUser && !isAdmin && dbEmpty;

  const handleUpdateSekolah = async (updated: SekolahProfile) => {
    startTopProgress();
    try {
      setSekolah(updated);
      await saveSekolahProfile(updated);
      const active = getActiveSchool();
      if (active) {
        saveSchoolEntry({
          ...active,
          nama: updated.nama,
          npsn: updated.npsn,
          jenjang: updated.jenjang || active.jenjang,
          bentukPendidikan: updated.bentukPendidikan,
        });
        setSchools(getSchools());
      }
      toast('Profil sekolah berhasil disimpan.', 'success');
    } catch (err: unknown) {
      toast(`Gagal menyimpan profil sekolah: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      doneTopProgress();
    }
  };

  return (
    <div className="min-h-screen text-slate-900 font-sans antialiased">
      <TopProgressBar />
      {/* Sidebar Navigation + Fixed Top Navbar */}
      <Navbar
        sekolah={sekolah}
        activeTab={activeTab}
        setActiveTab={handleNavigateTab}
        siswaCount={visibleSiswa.length}
        currentUser={currentUser}
        impersonator={impersonator}
        onLogout={handleLogout}
        onStopImpersonating={handleStopImpersonating}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
        schools={schools}
        activeSchoolId={activeSchoolId}
        schoolSiswaCounts={schoolSiswaCounts}
        switchingSchoolId={switchingSchoolId}
        onSwitchSchool={(id) => void handleSwitchSchool(id)}
        onManageSchools={() => setSchoolManagerOpen(true)}
        sessionTahun={sessionTahun}
        tahunOptions={daftarTahunAjaran}
        tahunDiizinkan={tahunDiizinkan}
        onSwitchTahun={handleSwitchTahun}
        modeTampilan={modeTampilan}
        onGantiMode={handleGantiMode}
      />

      {/* Content Column (offset for fixed topbar + sidebar width; bottom pad for fixed footer) */}
      <div className={`flex flex-col min-h-screen min-w-0 pt-16 pb-32 sm:pb-24 ${sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-64'}`}>
      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        <Suspense fallback={<TabLoading />}>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <div className="w-12 h-12 rounded bg-gradient-to-br from-blue-600 to-navy-900 flex items-center justify-center shadow-md animate-pulse">
              <GraduationCap className="w-6 h-6 text-gold-300" />
            </div>
            <div className="w-8 h-8 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Memuat basis data Buku Induk Siswa...</p>
          </div>
        ) : needSetup ? (
          <ErrorBoundary fallbackTitle="Penyiapan gagal dimuat">
            <SetupWizard
              sekolah={sekolah}
              dapodikConfig={dapodikConfig}
              siswaList={siswaList}
              syncLogs={syncLogs}
              sessionTahun={sessionTahun}
              currentUser={currentUser}
              onSaveSekolah={handleUpdateSekolah}
              onConfigChange={setDapodikConfig}
              onRefreshData={loadData}
              onLoadSample={handleSetupLoadSample}
              onFinish={handleSetupFinish}
            />
          </ErrorBoundary>
        ) : operatorEmptyDb ? (
          <div className="ui-card p-10 text-center space-y-3 anim-fade-up">
            <div className="mx-auto w-12 h-12 rounded bg-gradient-to-br from-blue-600 to-navy-900 flex items-center justify-center shadow-md">
              <Database className="w-6 h-6 text-gold-300" />
            </div>
            <h2 className="text-base font-extrabold text-slate-900">Database Masih Kosong</h2>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              Halo {currentUser?.namaLengkap || 'Operator'}, database {sekolah.nama || 'sekolah'} (TP{' '}
              {sessionTahun || sekolah.tahunAjaran || '2026/2027'}) belum berisi data. Sinkronisasi Dapodik
              hanya dapat dilakukan oleh Administrator — hubungi admin sekolah Anda.
            </p>
          </div>
        ) : (
          <>
            {/* Kepala halaman konsisten per tab */}
            {(() => {
              const meta = TAB_META[activeTab] || TAB_META.siswa;
              return (
                <PageHeader
                  icon={meta.icon}
                  title={meta.title}
                  subtitle={`${meta.subtitle} • ${sekolah.nama || ''}${sessionTahun ? ` • Sesi TA ${sessionTahun}` : ''}`}
                  accent={meta.accent}
                />
              );
            })()}

            {/* 4 kartu utama — hanya di Dasbor */}
            {activeTab === 'dasbor' && (
              <DashboardStats
                siswa={visibleSiswa}
                jenjang={sekolah.jenjang || 'SMP'}
                lastSyncLog={syncLogs[0]}
                isAdmin={isAdmin}
                sessionTahun={sessionTahun}
                tahunAktif={sekolah.tahunAjaran}
                onOpenSync={() => handleNavigateTab('dapodik')}
              />
            )}

            {/* View: Dasbor Operasional */}
            {activeTab === 'dasbor' && (
              <ErrorBoundary fallbackTitle="Dasbor gagal dimuat">
                <OperatorDashboard
                  siswa={visibleSiswa}
                  sekolah={sekolah}
                  syncLogs={syncLogs}
                  rombelRefs={rombelRefs}
                  gtkCount={ptkRefs.length}
                  currentUser={currentUser}
                  isAdmin={isAdmin}
                  sessionTahun={sessionTahun}
                  onNavigate={handleNavigateTab}
                  onAddSiswa={() => {
                    setEditingSiswa(null);
                    setIsFormOpen(true);
                  }}
                  onEditSiswa={(s) => {
                    setEditingSiswa(s);
                    setIsFormOpen(true);
                  }}
                  onViewSiswa={(s) => setDetailSiswa(s)}
                  onPrintLembar={(s) => setPrintSiswa(s)}
                />
              </ErrorBoundary>
            )}

            {/* View: 1. Master Siswa */}
            {activeTab === 'siswa' && (
              <ErrorBoundary fallbackTitle="Daftar siswa gagal dimuat">
              <SiswaList
                siswa={visibleSiswa}
                sekolah={sekolah}
                onAddSiswa={() => {
                  setEditingSiswa(null);
                  setIsFormOpen(true);
                }}
                onEditSiswa={(s) => {
                  setEditingSiswa(s);
                  setIsFormOpen(true);
                }}
                onViewSiswa={(s) => setDetailSiswa(s)}
                onPrintLembar={(s) => setPrintSiswa(s)}
                onDeleteSiswa={handleDeleteSiswa}
                onUpdateFoto={handleUpdateFoto}
                onOpenSync={() => handleNavigateTab('dapodik')}
                onResetSampleData={handleResetSample}
                onOpenMutasi={() => setMutasiOpen(true)}
                isAdmin={isAdmin}
                sessionTahun={sessionTahun}
                tahunOptions={daftarTahunAjaran}
              />
              </ErrorBoundary>
            )}

            {/* View: Nilai Raport Kurikulum Merdeka */}
            {activeTab === 'raport' && (
              <NilaiRaportView
                siswaList={visibleSiswa}
                sekolah={sekolah}
                currentUser={currentUser || undefined}
                tahunTerkunci={tahunTerkunci}
                ptk={ptkRefs}
                onDataChanged={loadData}
                sessionTahun={sessionTahun}
              />
            )}

            {/* View: Leger Nilai (semua peran, sebatas rombel kewenangan) */}
            {activeTab === 'leger' && (
              <LegerNilaiView
                siswaList={visibleSiswa}
                sekolah={sekolah}
                currentUser={currentUser}
                sessionTahun={sessionTahun}
                tahunOptions={daftarTahunAjaran}
              />
            )}

            {/* View: 2. Sinkron Dapodik (Administrator Only) */}
            {activeTab === 'dapodik' && (
              isAdmin ? (
              <DapodikSyncView
                config={dapodikConfig}
                sekolah={sekolah}
                onUpdateSekolah={handleUpdateSekolah}
                onConfigChange={setDapodikConfig}
                existingSiswa={siswaList}
                syncLogs={syncLogs}
                sessionTahun={sessionTahun}
                onRefreshData={loadData}
              />
              ) : AccessDeniedNotice
            )}

            {/* View: 3. Rekapitulasi */}
            {activeTab === 'rekap' && (
              <RekapitulasiView
                siswa={visibleSiswa}
                sekolah={sekolah}
                sessionTahun={sessionTahun}
              />
            )}

            {/* View: 4. Cetak Lembar Induk & Kartu Pelajar (Cetak Tab) */}
            {activeTab === 'cetak' && (
              <div className="space-y-6">
                <div className="ui-card p-5 anim-fade-up">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
                    <div>
                      <h2 className="ui-section-title !normal-case !tracking-normal !text-sm">
                        <FileText className="w-5 h-5" />
                        Pusat Cetak Dokumen Buku Induk & Kartu Pelajar
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        Pilih siswa di bawah ini untuk mencetak Lembar Buku Induk Standar Dinas atau Kartu Pelajar {sekolah.jenjang || 'SMP'}.
                      </p>
                    </div>

                    <div className="relative w-full sm:w-72">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={cetakSearch}
                        onChange={(e) => setCetakSearch(e.target.value)}
                        placeholder="Cari siswa untuk dicetak..."
                        className="ui-input !pl-9"
                        aria-label="Cari siswa untuk dicetak"
                      />
                    </div>
                  </div>

                  {/* Bulk kartu massal */}
                  <div className="flex flex-wrap items-center gap-2 p-3 rounded border border-slate-200 bg-slate-50">
                    <span className="text-xs text-slate-600">
                      <strong className="text-slate-900 tabular-nums">{cetakPilih.length}</strong> dipilih
                    </span>
                    <button
                      onClick={() => setCetakPilih(cetakFiltered.map((s) => s.id))}
                      className="ui-btn ui-btn-outline !py-1.5"
                    >
                      Pilih semua hasil
                    </button>
                    <button
                      onClick={() => setCetakPilih([])}
                      className="ui-btn ui-btn-ghost !py-1.5"
                    >
                      Bersihkan
                    </button>
                    <button
                      onClick={() => { if (cetakPilih.length === 0) { toast('Pilih minimal satu siswa untuk kartu massal.', 'warning'); } else { setKartuMassalOpen(true); } }}
                      className="ui-btn ui-btn-primary !py-1.5"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Kartu Massal A4 ({cetakPilih.length})
                    </button>
                  </div>

                  {/* Student Cards Grid for Printing */}
                  {cetakFiltered.length === 0 ? (
                    <p className="py-10 text-center text-xs text-slate-400 italic">
                      Tidak ada siswa yang cocok dengan pencarian.
                    </p>
                  ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {cetakPaged
                      .map((s) => (
                        <div
                          key={s.id}
                          className="bg-slate-50 hover:bg-blue-50/40 p-3.5 rounded border border-slate-200 hover:border-blue-300 transition flex items-center justify-between gap-3"
                        >
                          <input
                            type="checkbox"
                            checked={cetakPilih.includes(s.id)}
                            onChange={() => setCetakPilih((prev) => (prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]))}
                            aria-label={'Pilih ' + s.namaLengkap + ' untuk kartu massal'}
                            title="Pilih untuk kartu massal"
                            className="rounded border-slate-300 shrink-0"
                          />
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className="w-10 h-12 rounded bg-white border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                              {s.fotoUrl ? (
                                <img src={s.fotoUrl} alt={s.namaLengkap} className="w-full h-full object-cover" />
                              ) : (
                                <User className="w-5 h-5 text-slate-400" />
                              )}
                            </div>
                            <div className="overflow-hidden">
                              <h4 className="font-bold text-slate-900 text-xs truncate">
                                {s.namaLengkap}
                              </h4>
                              <p className="text-[11px] text-slate-500 font-mono">
                                NISN: {s.nisn || '-'}
                              </p>
                              <span className="ui-badge ui-badge-blue mt-1">
                                Rombel {s.rombelSaatIni}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col gap-1.5 shrink-0">
                            <button
                              onClick={() => setPrintSiswa(s)}
                              className="ui-btn ui-btn-primary !px-3"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              Cetak
                            </button>
                            <button
                              onClick={() => setDetailSiswa(s)}
                              className="ui-btn ui-btn-outline !px-3"
                            >
                              <Eye className="w-3 h-3" />
                              Detail
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                  )}
                  {cetakFiltered.length > 0 && (
                    <div className="mt-4 -mx-5 -mb-5 rounded-b border-t border-slate-100 overflow-hidden">
                      <PageControl
                        page={cetakSafePage}
                        totalPages={cetakTotalPages}
                        totalItems={cetakFiltered.length}
                        pageSize={cetakPageSize}
                        pageSizeOptions={[9, 18, 36]}
                        itemName="siswa"
                        onPageChange={(p) => setCetakPage(p)}
                        onPageSizeChange={(s) => { setCetakPageSize(s); setCetakPage(1); }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* View: Data Referensi (Rombel, PTK, Profil Sekolah) */}
            {activeTab === 'referensi' && (
              <ReferensiView
                rombel={rombelRefs}
                ptk={ptkRefs}
                sekolah={sekolah}
                siswa={visibleSiswa}
                isAdmin={isAdmin}
                sessionTahun={sessionTahun}
                onEditSekolah={() => handleNavigateTab('pengaturan')}
                onOpenSync={() => handleNavigateTab('dapodik')}
                onDataChanged={loadData}
                onOpenGtk={() => handleNavigateTab('gtk')}
              />
            )}

            {/* View: Modul GTK (Guru & Tendik) */}
            {activeTab === 'gtk' && (
              <GtkView
                ptk={ptkRefs}
                rombel={rombelRefs}
                isAdmin={isAdmin}
                onOpenSync={() => handleNavigateTab('dapodik')}
                onDataChanged={loadData}
              />
            )}

            {/* View: Arsip Tahun Ajaran (semua peran lihat; kelola khusus admin) */}
            {activeTab === 'arsip' && (
              <ErrorBoundary fallbackTitle="Arsip gagal dimuat">
                <ArsipView
                  siswa={visibleSiswa}
                  sekolah={sekolah}
                  tutup={tutupTahun}
                  isAdmin={isAdmin}
                  userName={currentUser?.namaLengkap || currentUser?.username}
                  currentUser={currentUser}
                  sessionTahun={sessionTahun}
                  rombelAkses={currentUser?.rombelAkses}
                  busy={false}
                  petaKelas={petaKelas}
                  onTutupTahun={handleTutupTahun}
                  onBukaTahun={handleBukaTahun}
                />
              </ErrorBoundary>
            )}

            {/* View: Pemetaan Kelas (Administrator Only) */}
            {activeTab === 'pemetaan' && (
              isAdmin ? (
              <PemetaanKelasView
                peta={petaKelas}
                siswa={visibleSiswa}
                sekolah={sekolah}
                ptk={ptkRefs}
                tahunTerkunci={tahunTerkunci}
                currentUser={currentUser}
                sessionTahun={sessionTahun}
                onDataChanged={loadData}
                rombelRefs={rombelRefs}
              />
              ) : AccessDeniedNotice
            )}

            {/* View: 5. Profil Sekolah (Administrator Only) */}
            {activeTab === 'pengaturan' && (
              isAdmin ? (
              <PengaturanSekolahView
                sekolah={sekolah}
                currentUser={currentUser || undefined}
                dapodikConfig={dapodikConfig}
                sessionTahun={sessionTahun}
                onUpdateSekolah={handleUpdateSekolah}
                onDataChanged={loadData}
                schools={schools}
                activeSchoolId={activeSchoolId}
                schoolSiswaCounts={schoolSiswaCounts}
                switchingSchoolId={switchingSchoolId}
                onSwitchSchool={(id) => void handleSwitchSchool(id)}
                onManageSchools={() => setSchoolManagerOpen(true)}
              />
              ) : AccessDeniedNotice
            )}

            {/* View: 6. Manajemen Pengguna & Operator (Administrator Only) */}
            {activeTab === 'users' && (
              isAdmin ? (
              <UserManagementView
                currentUser={currentUser!}
                jenjang={sekolah.jenjang || 'SMP'}
                tahunOptions={daftarTahunAjaran}
                onImpersonate={handleStartImpersonate}
              />
              ) : AccessDeniedNotice
            )}

            {/* View: 7. Backup & Restore (Administrator Only) */}
            {activeTab === 'backup' && (
              isAdmin ? (
              <BackupRestoreModule
                sekolah={sekolah}
                currentUser={currentUser}
                onDataChanged={loadData}
              />
              ) : AccessDeniedNotice
            )}

            {/* View: 8. Log Audit (Administrator Only) */}
            {activeTab === 'audit' && (
              isAdmin ? <AuditLogView /> : AccessDeniedNotice
            )}
          </>
        )}
        </Suspense>
      </main>

      {/* Footer — freeze di bawah viewport */}
      <footer className={`fixed bottom-0 right-0 left-0 z-30 border-t border-slate-200/80 bg-white/90 backdrop-blur px-4 sm:px-6 py-3 print:hidden transition-[left] duration-200 ${sidebarCollapsed ? 'lg:left-[76px]' : 'lg:left-64'}`}>
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <p className="flex items-center gap-2 text-slate-600">
            <span className="w-6 h-6 rounded bg-gradient-to-br from-blue-600 to-navy-900 text-gold-300 flex items-center justify-center shrink-0">
              <GraduationCap className="w-3.5 h-3.5" />
            </span>
            <span>
              Buku Induk Siswa {sekolah.jenjang || 'SMP'} • <strong className="text-slate-800">Kurikulum Merdeka {sekolah.jenjang === 'SD' ? '(Fase A, B, C)' : '(Fase D)'}</strong>
            </span>
          </p>
          <p className="flex items-center gap-2 text-slate-400 text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Offline-first (IndexedDB PWA) • Sinkron Dapodik Lokal • Standar Kemdikbudristek RI
          </p>
        </div>
      </footer>
      </div>{/* End Content Column */}

      {/* Authentication Modal Gate */}
      <Suspense fallback={null}>
      <LoginModal
        isOpen={isLoginOpen}
        tahunOptions={daftarTahunAjaran}
        defaultTahun={sekolah.tahunAjaran}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Modals */}
      {isFormOpen && (
        <SiswaFormModal
          initialData={editingSiswa}
          jenjang={sekolah.jenjang || 'SMP'}
          existingSiswa={siswaList}
          tahunAjaran={sessionTahun || sekolah.tahunAjaran}
          onSave={handleSaveSiswa}
          onClose={() => {
            setIsFormOpen(false);
            setEditingSiswa(null);
          }}
        />
      )}

      {detailSiswa && (
        <SiswaDetailModal
          siswa={detailSiswa}
          sekolah={sekolah}
          onClose={() => setDetailSiswa(null)}
          onEdit={(s) => {
            setDetailSiswa(null);
            setEditingSiswa(s);
            setIsFormOpen(true);
          }}
          onPrintLembar={(s) => {
            setDetailSiswa(null);
            setPrintSiswa(s);
          }}
          onDelete={handleDeleteSiswa}
        />
      )}

      {kartuMassalOpen && (
        <Suspense fallback={null}>
          <CetakKartuMassal
            siswa={cetakFiltered.filter((s) => cetakPilih.includes(s.id))}
            sekolah={sekolah}
            jenjang={sekolah.jenjang || 'SMP'}
            onClose={() => setKartuMassalOpen(false)}
          />
        </Suspense>
      )}

      {printSiswa && (
        <CetakBukuInduk
          siswa={printSiswa}
          sekolah={sekolah}
          sessionTahun={sessionTahun}
          onClose={() => setPrintSiswa(null)}
        />
      )}

      {mutasiOpen && (
        <MutasiWizard
          siswa={siswaList}
          currentUser={currentUser}
          jenjang={sekolah.jenjang || 'SMP'}
          tahunAjaran={sessionTahun || sekolah.tahunAjaran}
          onApplyMasuk={handleApplyMutasiMasuk}
          onApplyKeluar={handleApplyMutasiKeluar}
          onClose={() => setMutasiOpen(false)}
        />
      )}

      {/* Global toast & konfirmasi (pengganti alert/confirm native) */}
      <ToastHost />
      <ConfirmDialogHost />

      {/* Multi-sekolah manager (admin) */}
      {isAdmin && (
        <SchoolManagerModal
          isOpen={schoolManagerOpen}
          schools={schools}
          activeId={activeSchoolId}
          siswaCounts={schoolSiswaCounts}
          switchingId={switchingSchoolId}
          resetting={resettingMain}
          onClose={() => setSchoolManagerOpen(false)}
          onSwitch={(id) => void handleSwitchSchool(id)}
          onCreate={handleCreateSchool}
          onDelete={handleDeleteSchool}
          onResetToMain={handleResetToMain}
        />
      )}
      </Suspense>
    </div>
  );
}
