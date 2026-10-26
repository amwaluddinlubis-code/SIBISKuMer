import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense, lazy } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import GlobalSearch from './components/GlobalSearch';
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
  resetToSingleMainDatabase,
  eksporDataLokalSaja,
  getAllTenggat,
  getPengaturanKalender,
  getPengingatTerkirim,
  tambahPengingatTerkirim
} from './utils/db';
import { bolehTulis, bolehKelolaAdmin } from './utils/akses';
import { Siswa, SekolahProfile, DapodikConfig, DapodikSyncLog, AppUser, RombelRef, PtkRef, SchoolEntry, JenjangSekolah, TutupTahunAjaran, PetaKelas, ModeTampilan, RiwayatTahunAjaran, TugasAdministrasi, PengaturanKalender } from './types';
import { buildSnapshot, tingkatAkhir } from './utils/arsip';
import { batalkanPromosi, terapkanRencanaPromosi, validasiRencanaPromosi } from './utils/promosi';
import {
  DEFAULT_DASHBOARD_FILTER,
  ROMBEL_KOSONG,
  terapkanFilterDasbor,
  type DashboardFilter,
  type KondisiDrillDown,
  type SiswaPresetFilter,
} from './utils/dashboard';
import { useIdleLogout } from './hooks/useIdleLogout';
import { resolveTemaEfektif, bacaModeTampilan, simpanModeTampilan, terapkanModeTampilan, modeBerikutnya } from './utils/tema';
import { getDaftarTahunAjaran, getTahunDiizinkan } from './utils/tahunAjaran';
import { tahunSesiEfektif, siswaTerlihatSesi } from './utils/sesi';
import { initialSekolahProfile, initialDapodikConfig } from './data/initialData';
import { Navbar } from './components/Navbar';
// Versi aplikasi yang tampil di footer — samakan dengan "version" di package.json.
const APP_VERSION = '1.0.0';
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
const PemeriksaDataView = lazyView(() => import('./components/PemeriksaDataView'), 'PemeriksaDataView');
const SchoolManagerModal = lazyView(() => import('./components/SchoolManagerModal'), 'SchoolManagerModal');
const CetakKartuMassal = lazyView(() => import('./components/CetakKartuMassal'), 'CetakKartuMassal');
const LaporanView = lazyView(() => import('./components/LaporanView'), 'LaporanView');
const GeneratorDokumen = lazyView(() => import('./components/GeneratorDokumen'), 'GeneratorDokumen');
const ImporSiswaView = lazyView(() => import('./components/ImporSiswaView'), 'ImporSiswaView');
const KalenderTugasView = lazyView(() => import('./components/KalenderTugasView'), 'KalenderTugasView');
import type { RencanaRombel } from './components/ArsipView';
import type { DokumenMutasiKeluar, DokumenMutasiStatus } from './components/MutasiWizard';
import { ToastHost } from './components/ToastHost';
import { ConfirmDialogHost } from './components/ConfirmDialogHost';
import { ErrorBoundary } from './components/ErrorBoundary';
import { toast, confirmDialog } from './utils/notify';
import { keluarDariServer, mulaiImpersonateServer, berhentiImpersonateServer, ambilSesiServer, imporKeServer } from './utils/dataApi';
import { pakaiServer } from './utils/modeData';
import { FileText, Search, User, Printer, Eye, Lock, Users, Award, RefreshCw, BarChart3, Layers, Settings, UserCog, Database, GraduationCap, Contact, LayoutDashboard, Archive, LayoutGrid, ScrollText, Table, CalendarDays } from 'lucide-react';
import { PageHeader } from './components/PageHeader';
import { PageControl } from './components/PageControl';
import { SchoolSwitcher } from './components/SchoolSwitcher';
import { TopProgressBar } from './components/TopProgressBar';
import { startTopProgress, doneTopProgress } from './utils/progress';
import { catatAudit, diffAudit } from './utils/audit';
import { catatHapusCloud } from './utils/tombstone';
import { centangAutoBackup } from './utils/autoBackup';
import { hitungJumlahPengingatAktif, hitungPengingat, tugasTerlihat } from './utils/kalender';
import { batalkanMutasiTerakhir, buatEntriMutasiMasuk, nisnSudahTerdaftar, terapkanMutasiKeSiswa } from './utils/mutasi';
import { validateSchoolEntryInput } from './utils/validation';

const TAB_META: Record<string, { title: string; subtitle: string; accent: 'blue' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'purple' | 'slate'; icon: typeof Users }> = {
  dasbor: { title: 'Dasbor Operasional', subtitle: 'Antrean tugas & ringkasan kerja operator hari ini', accent: 'blue', icon: LayoutDashboard },
  siswa: { title: 'Master Siswa', subtitle: 'Kelola ledger digital A–I seluruh peserta didik aktif', accent: 'blue', icon: Users },
  raport: { title: 'Nilai Raport', subtitle: 'Input nilai Kurikulum Merdeka + promosi kenaikan multi-tahun', accent: 'indigo', icon: Award },
  leger: { title: 'Leger Nilai', subtitle: 'Rekap gabungan nilai per mapel + peringkat per rombel', accent: 'indigo', icon: Table },
  dapodik: { title: 'Sinkron Dapodik', subtitle: 'Tarik peserta didik & profil sekolah dari Web Service lokal', accent: 'amber', icon: RefreshCw },
  rekap: { title: 'Rekapitulasi', subtitle: 'Statistik rombel, agama, PPDB & capaian P5 untuk dinas', accent: 'emerald', icon: BarChart3 },
  laporan: { title: 'Pusat Laporan', subtitle: 'Laporan administratif siap cetak: statistik, daftar, mutasi, data belum lengkap & temuan validasi', accent: 'emerald', icon: FileText },
  cetak: { title: 'Pusat Cetak', subtitle: 'Lembar buku induk standar dinas & kartu pelajar', accent: 'slate', icon: Printer },
  dokumen: { title: 'Generator Dokumen', subtitle: 'Surat keterangan aktif, pindah, panggilan ortu & daftar rombel', accent: 'indigo', icon: FileText },
  referensi: { title: 'Data Referensi', subtitle: 'Rombel, PTK & profil sekolah hasil sinkronisasi', accent: 'purple', icon: Layers },
  gtk: { title: 'Data GTK', subtitle: 'Guru & tendik hasil sinkronisasi Dapodik (getGtk/getPTK)', accent: 'indigo', icon: Contact },
  arsip: { title: 'Arsip', subtitle: 'Arsip tahun ajaran: potret terkunci per tahun + tutup tahun & promosi massal', accent: 'slate', icon: Archive },
  pemeriksa: { title: 'Pemeriksa Data', subtitle: 'Kelengkapan, validitas, inkonsistensi & kemungkinan duplikat siswa', accent: 'emerald', icon: LayoutDashboard },
  pemetaan: { title: 'Pemetaan Kelas', subtitle: 'Daftar rombel resmi per tahun ajaran', accent: 'amber', icon: LayoutGrid },
  pengaturan: { title: 'Pengaturan', subtitle: 'Profil sekolah: identitas, periode aktif & konfigurasi layanan', accent: 'slate', icon: Settings },
  users: { title: 'Manajemen Pengguna', subtitle: 'Akun administrator & operator beserta batas rombel', accent: 'purple', icon: UserCog },
  backup: { title: 'Backup & Restore', subtitle: 'Cadangan JSON lokal & Google Drive', accent: 'rose', icon: Database },
  audit: { title: 'Log Audit', subtitle: 'Jejak siapa-ubah-apa di database ini', accent: 'slate', icon: ScrollText },
  kalender: { title: 'Kalender & Pengingat', subtitle: 'Tenggat tugas administrasi, jadwal & pengingat dalam aplikasi', accent: 'amber', icon: CalendarDays },
};

/** Fallback saat chunk tab/modal diunduh — Fase 3 §15: SKELETON halaman
 *  (kerangka kartu + baris tabel berdenyut) menggantikan spinner polos,
 *  agar perpindahan menu terasa seperti halaman yang sedang terbentuk. */
function TabLoading() {
  return (
    <div className="space-y-4 anim-fade-up" aria-live="polite" aria-label="Memuat halaman">
      <div className="ui-card p-4 space-y-3">
        <div className="h-4 w-48 rounded bg-slate-200 animate-pulse" />
        <div className="h-3 w-72 max-w-full rounded bg-slate-100 animate-pulse" />
        <div className="flex flex-wrap gap-2 pt-1">
          <div className="h-8 w-28 rounded-lg bg-slate-200 animate-pulse" />
          <div className="h-8 w-28 rounded-lg bg-slate-100 animate-pulse" />
          <div className="h-8 w-28 rounded-lg bg-slate-100 animate-pulse" />
        </div>
      </div>
      <div className="ui-card overflow-hidden">
        <div className="p-4 space-y-2.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-slate-200 animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 rounded bg-slate-200 animate-pulse" style={{ width: `${72 - i * 7}%` }} />
                <div className="h-2.5 rounded bg-slate-100 animate-pulse" style={{ width: `${48 - i * 4}%` }} />
              </div>
              <div className="h-5 w-14 rounded-full bg-slate-100 animate-pulse shrink-0" />
            </div>
          ))}
        </div>
      </div>
      <p className="text-center text-xs text-slate-400 font-medium">Memuat halaman…</p>
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
  const [tugasList, setTugasList] = useState<TugasAdministrasi[]>([]);
  const [pengaturanKalender, setPengaturanKalender] = useState<PengaturanKalender>(() => getPengaturanKalender());
  const [loading, setLoading] = useState(true);

  // Active navigation tab: 'dasbor' | 'siswa' | 'dapodik' | 'rekap' | 'cetak' | 'pengaturan' | 'users'
  const [activeTab, setActiveTab] = useState<string>('dasbor');

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSiswa, setEditingSiswa] = useState<Siswa | null>(null);
  const [detailSiswa, setDetailSiswa] = useState<Siswa | null>(null);
  const [printSiswa, setPrintSiswa] = useState<Siswa | null>(null);
  const [mutasiOpen, setMutasiOpen] = useState(false);
  const [imporSiswaOpen, setImporSiswaOpen] = useState(false);

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
  // ----- Dasbor pusat kendali (Issue #2) -----
  // Filter roster dasbor + preset drill-down. Dasbor HANYA menerima
  // `visibleSiswa` (sudah terpotong hak akses + sesi) — filter di sini
  // hanya mempersempit, tidak pernah memperlebar cakupan.
  const [dashboardFilter, setDashboardFilter] = useState<DashboardFilter>(DEFAULT_DASHBOARD_FILTER);
  const [siswaPreset, setSiswaPreset] = useState<SiswaPresetFilter | null>(null);
  const [siswaPresetNonce, setSiswaPresetNonce] = useState(0);
  const [raportPresetRombel, setRaportPresetRombel] = useState<string | null>(null);
  const [raportPresetNonce, setRaportPresetNonce] = useState(0);
  const dashboardSiswa = useMemo(
    () => terapkanFilterDasbor(visibleSiswa, dashboardFilter),
    [visibleSiswa, dashboardFilter]
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

  /** Drill-down: buka daftar data sumber pembentuk angka dasbor.
   *  Filter dasbor yang sedang aktif ikut diteruskan sebagai preset, jadi
   *  daftar tujuan selalu sepakat dengan angka yang diklik. */
  const handleDashboardDrillDown = useCallback(
    (kondisi: KondisiDrillDown, opts?: Partial<SiswaPresetFilter> & { tujuan?: 'siswa' | 'raport' }) => {
      const rombelDasbor = dashboardFilter.rombel !== 'all' ? dashboardFilter.rombel : undefined;
      const statusDasbor = dashboardFilter.status !== 'all' ? dashboardFilter.status : undefined;
      const tahunDasbor = dashboardFilter.tahun !== 'all' ? dashboardFilter.tahun : undefined;
      if (kondisi === 'raport-belum' || opts?.tujuan === 'raport') {
        // Tab Raport tak punya filter "Tanpa Rombel" — petakan ke semua rombel.
        const rombel = opts?.rombel ?? rombelDasbor;
        setRaportPresetRombel(rombel && rombel !== ROMBEL_KOSONG ? rombel : null);
        setRaportPresetNonce((v) => v + 1);
        handleNavigateTab('raport');
        return;
      }
      setSiswaPreset({
        rombel: opts?.rombel ?? rombelDasbor,
        tingkat: opts?.tingkat,
        status: opts?.status ?? statusDasbor,
        tahun: opts?.tahun ?? tahunDasbor,
        kondisi,
        dari: opts?.dari,
        sampai: opts?.sampai,
      });
      setSiswaPresetNonce((v) => v + 1);
      handleNavigateTab('siswa');
    },
    [dashboardFilter, handleNavigateTab]
  );

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

  // Pengingat tenggat (Issue #8): centang tiap menit + saat data berubah.
  // Hanya dalam aplikasi (toast + lencana): satu pengingat per kunci hanya
  // disampaikan sekali (anti-duplikat via tambahPengingatTerkirim).
  // Tidak ada pengiriman ke luar aplikasi.
  const tugasYangTerlihat = useMemo(
    () => tugasList.filter((t) => tugasTerlihat(currentUser, t)),
    [tugasList, currentUser]
  );
  useEffect(() => {
    if (!currentUser) return;
    let berhenti = false;
    const centang = () => {
      if (berhenti) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const terkirim = new Set(getPengingatTerkirim().map((p) => p.kunci));
        const jatuhTempo = hitungPengingat(tugasYangTerlihat, pengaturanKalender, terkirim);
        for (const p of jatuhTempo) {
          if (!tambahPengingatTerkirim(p.kunci, p.tugas.id)) continue;
          catatAudit('pengingat_kirim', {
            entitas: 'tenggat',
            entitasId: p.tugas.id,
            ringkasan: `Pengingat (dalam aplikasi): "${p.tugas.judul}" — ${p.urgensi === 'terlambat' ? 'terlambat' : p.urgensi === 'hari_ini' ? 'jatuh tempo hari ini' : `jatuh tempo dalam ${p.selisihHari} hari`}`,
          });
          toast(
            p.urgensi === 'terlambat'
              ? `Pengingat: "${p.tugas.judul}" sudah terlambat.`
              : p.urgensi === 'hari_ini'
                ? `Pengingat: "${p.tugas.judul}" jatuh tempo hari ini.`
                : `Pengingat: "${p.tugas.judul}" jatuh tempo dalam ${p.selisihHari} hari.`,
            p.urgensi === 'terlambat' ? 'error' : 'warning'
          );
        }
      } catch {
        /* pengingat tidak boleh merusak alur utama */
      }
    };
    centang();
    const timer = window.setInterval(centang, 60000);
    return () => {
      berhenti = true;
      window.clearInterval(timer);
    };
  }, [tugasYangTerlihat, pengaturanKalender, currentUser]);

  // Load initial data from IndexedDB (sekolah aktif)
  const loadData = useCallback(async () => {
    startTopProgress();
    try {
      setLoading(true);
      await ensureSchoolsInit().catch(() => null);
      await initStorage();
      const [siswa, sek, cfg, logs, rombel, ptk, tutup, peta, tugas] = await Promise.all([
        getAllSiswa(),
        getSekolahProfile(),
        getDapodikConfig(),
        getSyncLogs(),
        getAllRombelRefs(),
        getAllPtkRefs(),
        getTutupTahun(),
        getAllPetaKelas(),
        getAllTenggat()
      ]);
      setSiswaList(siswa);
      setSekolah(sek);
      setDapodikConfig(cfg);
      setSyncLogs(logs);
      setRombelRefs(rombel);
      setPtkRefs(ptk);
      setTutupTahun(tutup);
      setPetaKelas(peta);
      setTugasList(tugas);
      setPengaturanKalender(getPengaturanKalender());
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

  // Fase S4 — penawaran migrasi otomatis instalasi lama: bila basis data
  // server masih benih awal dan IndexedDB perangkat ini berisi data,
  // tawarkan impor sekali kepada administrator (keputusan disimpan per
  // perangkat agar tidak menagih berulang).
  const migrasiDicekRef = useRef(false);
  useEffect(() => {
    if (!currentUser || !pakaiServer() || migrasiDicekRef.current) return;
    if (!isAdministrator(currentUser)) return;
    migrasiDicekRef.current = true;
    (async () => {
      try {
        if (localStorage.getItem('bukuinduk_migrasi_server')) return;
        const sesi = await ambilSesiServer().catch(() => null);
        if (!sesi?.benihAwal) return;
        const lokal = await eksporDataLokalSaja();
        const jumlahLokal = lokal.siswa?.length || 0;
        if (jumlahLokal === 0) return;
        const ok = await confirmDialog(
          `Basis data server masih berisi data contoh, sedangkan perangkat ini menyimpan ${jumlahLokal} siswa dari instalasi sebelumnya. Impor data perangkat ini ke server sekarang? Data contoh di server akan digantikan (snapshot pengaman dibuat otomatis di server).`,
          { confirmLabel: 'Ya, Impor ke Server', cancelLabel: 'Nanti Saja' }
        );
        if (!ok) {
          try {
            localStorage.setItem('bukuinduk_migrasi_server', 'ditolak');
          } catch {
            /* abaikan */
          }
          return;
        }
        // Penanda hanya ditulis SETELAH impor berhasil — kegagalan
        // ditampilkan apa adanya dan penawaran boleh muncul lagi
        // (regresi gerbang S4: gagal diam-diam + penanda terlanjur).
        const hasil = await imporKeServer(lokal);
        try {
          localStorage.setItem('bukuinduk_migrasi_server', 'selesai');
        } catch {
          /* abaikan */
        }
        toast(
          `Migrasi selesai: ${hasil?.hitungan?.siswa ?? jumlahLokal} siswa kini tersimpan di server.`,
          'success'
        );
        await loadData();
      } catch (e: any) {
        toast(
          `Migrasi ke server gagal: ${e?.message || 'kesalahan tidak dikenal'}. Penawaran akan muncul lagi pada masuk berikutnya.`,
          'error'
        );
      }
    })();
  }, [currentUser, loadData]);

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
    // Issue #12: tutup tahun hanya administrator (matriks akses).
    if (!bolehKelolaAdmin(currentUser)) {
      toast('Hanya administrator yang dapat menutup tahun ajaran.', 'error');
      return;
    }
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
    // Issue #6: penjaga tingkat handler — tahun yang sudah terkunci tidak
    // boleh dipromosi ulang (UI sudah menjaga, handler tidak boleh longgar).
    if ((tutupTahun || []).some((t) => t.tahunAjaran === args.tahunTutup.trim())) {
      toast(`Tahun ${args.tahunTutup.trim()} sudah ditutup sebelumnya.`, 'error');
      return;
    }
    startTopProgress();
    try {
      // Issue #6: validasi ulang terhadap data SEGAR — rencana bisa basi
      // antara pratinjau dan penerapan (siswa pindah rombel / berubah
      // status). Cakupan, ganda, hilang, kapasitas diperiksa di sini.
      const segar = await getAllSiswa();
      const aktifSegar = segar.filter((x) => x.statusSiswa === 'Aktif');
      const kapasitas: Record<string, number> = {};
      for (const p of petaKelas || []) {
        if (p.tahunAjaran === args.tahunBaru.trim() && typeof p.kapasitas === 'number') {
          kapasitas[p.rombel.trim().toUpperCase()] = p.kapasitas;
        }
      }
      const validasi = validasiRencanaPromosi({
        plan: args.groups,
        siswaAktif: aktifSegar,
        tingkatAkhir: tingkatAkhir(sekolah.jenjang || 'SMP'),
        kapasitas,
        tahunTutup: args.tahunTutup.trim(),
        tahunBaru: args.tahunBaru.trim(),
      });
      if (validasi.errors.length > 0) {
        toast(`Rencana tidak valid: ${validasi.errors[0]}`, 'error');
        return;
      }

      // 1. Potret arsip SEBELUM promosi (roster = keadaan saat penutupan)
      // F15: DUA FASE agar tutup tahun tidak setengah jalan —
      //   (a) KUMPUL: hitung rekaman baru dulu, TANPA tulis;
      //   (b) TULIS: saveSiswaBulk sekaligus (satu transaksi IDB; fallback LS
      //       juga menimpa seluruh array sekaligus).
      // Penguncian tahun (langkah 3) hanya jalan bila fase (b) sukses penuh.
      // Bila fase (b) gagal: tahun TIDAK dikunci, error jelas ditampilkan.
      // Pemulihan dari kegagalan setelah tulis sukses: penerapan ulang
      // bersifat idempoten (siswa yang sudah dipromosi dilewati), atau
      // rollback lewat Batalkan Promosi lalu tutup ulang dari awal.
      const terap = terapkanRencanaPromosi(segar, args.groups, {
        tahunTutup: args.tahunTutup.trim(),
        tahunBaru: args.tahunBaru.trim(),
        tebakTingkat: getTingkatAktifSiswa,
      });
      const { ringkasan, roster } = buildSnapshot(segar, {
        lulus: terap.ringkasan.lulus,
        naik: terap.ringkasan.naik,
        tinggal: terap.ringkasan.tinggal,
      });

      // 2. Tulis sekaligus; gagal → lempar, tahun tidak dikunci.
      await saveSiswaBulk(terap.promosiBaru);

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
        ringkasan: `Tutup ${args.tahunTutup} → ${args.tahunBaru} (Lulus: ${terap.ringkasan.lulus}, Naik: ${terap.ringkasan.naik}, Tinggal: ${terap.ringkasan.tinggal}, Ditahan: ${terap.ringkasan.dikecualikan}, Dilewati: ${terap.dilewatiSudahDipromosi.length + terap.dilewatiTidakAktif.length})`,
      });
      toast(
        `Tahun ${args.tahunTutup} ditutup & dikunci. Lulus: ${terap.ringkasan.lulus}, Naik: ${terap.ringkasan.naik}, Tinggal: ${terap.ringkasan.tinggal}, Ditahan: ${terap.ringkasan.dikecualikan}${terap.dilewatiSudahDipromosi.length > 0 ? `, Dilewati (sudah dipromosi): ${terap.dilewatiSudahDipromosi.length}` : ''}${terap.dilewatiTidakAktif.length > 0 ? `, Dilewati (tidak lagi aktif): ${terap.dilewatiTidakAktif.length}` : ''}. Tahun aktif: ${args.tahunBaru}. Lanjutkan Sinkron Dapodik untuk murid baru.`,
        'success'
      );
    } catch (err: unknown) {
      catatAudit('tutup_tahun', {
        entitas: 'tahun',
        entitasId: args.tahunTutup,
        ringkasan: `Gagal tutup ${args.tahunTutup} → ${args.tahunBaru}`,
        hasil: 'gagal',
        detail: err instanceof Error ? err.message : String(err),
      });
      toast(`Gagal menutup tahun: ${err instanceof Error ? err.message : String(err)}`, 'error');
      throw err;
    } finally {
      doneTopProgress();
    }
  }, [sekolah, currentUser, loadData, sessionTahun, tutupTahun, petaKelas]);

  const handleBukaTahun = useCallback(async (tahunAjaran: string) => {
    // Issue #12: buka kunci hanya administrator (matriks akses).
    if (!bolehKelolaAdmin(currentUser)) {
      toast('Hanya administrator yang dapat membuka kunci tahun ajaran.', 'error');
      throw new Error('Bukan administrator.');
    }
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

  // Issue #6: rollback promosi — kembalikan rombel/status hasil promosi
  // tahun tersebut, lalu buka kuncinya. Hanya administrator, hanya dalam
  // sesi tahun yang dibatalkan, dan hanya bila belum ada promosi tahun
  // yang lebih baru (tahun aktif masih tahunAktifBaru kunci tersebut).
  const handleBatalkanPromosi = useCallback(async (tahunAjaran: string) => {
    if (!isAdmin) {
      toast('Hanya administrator yang dapat membatalkan promosi.', 'error');
      throw new Error('Bukan administrator.');
    }
    const sesi = tahunSesiEfektif(sessionTahun, sekolah.tahunAjaran);
    if (sesi && tahunAjaran.trim() !== sesi) {
      toast(`Batalkan promosi hanya dalam sesi tahun tersebut (sesi aktif TA ${sesi}). Pindah sesi dulu.`, 'error');
      throw new Error(`Di luar sesi aktif (TA ${sesi}).`);
    }
    const kunci = (tutupTahun || []).find((t) => t.tahunAjaran === tahunAjaran.trim());
    if (!kunci) {
      toast(`Tahun ${tahunAjaran.trim()} tidak terkunci — tidak ada promosi untuk dibatalkan.`, 'error');
      throw new Error('Tahun tidak terkunci.');
    }
    if (kunci.tahunAktifBaru && sekolah.tahunAjaran !== kunci.tahunAktifBaru) {
      toast(`Tidak dapat membatalkan: tahun aktif (${sekolah.tahunAjaran}) sudah bergerak dari ${kunci.tahunAktifBaru} — ada promosi tahun yang lebih baru.`, 'error');
      throw new Error('Sudah ada promosi tahun berikutnya.');
    }
    startTopProgress();
    try {
      const segar = await getAllSiswa();
      const hasil = batalkanPromosi(segar, { tahunTutup: tahunAjaran.trim(), tahunBaru: (kunci.tahunAktifBaru || '').trim() });
      if (hasil.siswa.length === 0) {
        toast(`Tidak ada siswa yang dapat dikembalikan untuk ${tahunAjaran.trim()}.`, 'warning');
        return;
      }
      await saveSiswaBulk(hasil.siswa);
      await deleteTutupTahun(tahunAjaran.trim());
      const profilBaru: SekolahProfile = { ...sekolah, tahunAjaran: tahunAjaran.trim() };
      await saveSekolahProfile(profilBaru);
      setSekolah(profilBaru);
      await loadData();
      if (canUserAccessTahun(currentUser, tahunAjaran.trim())) {
        setSessionTahunAjaran(tahunAjaran.trim());
        setSessionTahun(tahunAjaran.trim());
      }
      catatHapusCloud('tutup', tahunAjaran.trim());
      catatAudit('buka_tahun', {
        entitas: 'tahun',
        entitasId: tahunAjaran.trim(),
        ringkasan: `Batal promosi ${tahunAjaran.trim()}: ${hasil.siswa.length} siswa dikembalikan, ${hasil.dilewati.length} dilewati; tahun aktif kembali ke ${tahunAjaran.trim()}`,
      });
      toast(
        `Promosi ${tahunAjaran.trim()} dibatalkan: ${hasil.siswa.length} siswa dikembalikan ke rombel & status sebelum promosi${hasil.dilewati.length > 0 ? `, ${hasil.dilewati.length} dilewati (status berubah setelah promosi)` : ''}. Tahun aktif kembali ke ${tahunAjaran.trim()}.`,
        'success'
      );
    } catch (err: unknown) {
      toast(`Gagal membatalkan promosi: ${err instanceof Error ? err.message : String(err)}`, 'error');
      throw err;
    } finally {
      doneTopProgress();
    }
  }, [isAdmin, sessionTahun, sekolah, tutupTahun, currentUser, loadData]);

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
    // S2 migrasi SQLite: akhiri juga sesi server (bila ada).
    void keluarDariServer();
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
    if (pakaiServer()) {
      // S3: sesi server ikut berpindah ke akun tujuan (cookie diganti
      // server; token admin tersimpan di server untuk pemulihan).
      try {
        await mulaiImpersonateServer(operatorUser.id);
      } catch (e: any) {
        toast(e?.message || 'Impersonate server gagal. Coba lagi.', 'error');
        return;
      }
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

  const handleStopImpersonating = async () => {
    if (!impersonator) return;
    catatAudit('impersonate_selesai', {
      entitas: 'akun',
      entitasId: currentUser?.id,
      ringkasan: `@${impersonator.username} selesai menyamar`,
    });
    if (pakaiServer()) {
      // Kembalikan cookie ke sesi administrator asal (di server).
      try {
        await berhentiImpersonateServer();
      } catch {
        toast('Sesi server impersonate tidak dapat diakhiri; Anda mungkin perlu masuk kembali.', 'error');
      }
    }
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
    // Issue #12: peran pimpinan hanya membaca (matriks akses).
    if (!bolehTulis(currentUser)) {
      toast('Peran pimpinan hanya dapat membaca data.', 'error');
      throw new Error('__SIMPAN_DIBATALKAN__');
    }
    if (!canUserAccessRombel(currentUser, siswaData.rombelSaatIni)) {
      toast(`Akses ditolak: rombel ${siswaData.rombelSaatIni} di luar kewenangan Anda.`, 'error');
      // Lempar penanda batal agar form TIDAK ikut tertutup / membuang draft.
      throw new Error('__SIMPAN_DIBATALKAN__');
    }
    const prev = (siswaList || []).find((s) => s.id === siswaData.id);
    // Input manual: siswa baru dikonfirmasi masuk ke tahun sesi aktif.
    if (!prev) {
      const sesiLabel = sesiEfektif || sessionTahun || sekolah.tahunAjaran || '-';
      const ok = await confirmDialog(
        `"${(siswaData.namaLengkap || 'Siswa baru').trim()}" akan didaftarkan pada tahun sesi aktif (TA ${sesiLabel}). Lanjutkan?`,
        { confirmLabel: 'Ya, Daftarkan' }
      );
      if (!ok) throw new Error('__SIMPAN_DIBATALKAN__');
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
      const diffSiswa = prev
        ? diffAudit(prev, locked, ['statusSiswa', 'rombelSaatIni'])
        : undefined;
      catatAudit(prev ? 'siswa_ubah' : 'siswa_tambah', {
        entitas: 'siswa',
        entitasId: locked.id,
        ringkasan: `${prev ? 'Ubah' : 'Tambah'} siswa "${(siswaData.namaLengkap || '').trim()}" (${locked.rombelSaatIni || '-'})`,
        ...(diffSiswa || {}),
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
    // Issue #12: peran pimpinan hanya membaca (matriks akses).
    if (!bolehTulis(currentUser)) {
      throw new Error('Peran pimpinan hanya dapat membaca data.');
    }
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
    // Issue #12: peran pimpinan hanya membaca (matriks akses).
    if (!bolehTulis(currentUser)) {
      toast('Peran pimpinan hanya dapat membaca data.', 'error');
      return;
    }
    if (!canUserAccessRombel(currentUser, baru.rombelSaatIni)) {
      toast(`Akses ditolak: rombel ${baru.rombelSaatIni} di luar kewenangan Anda.`, 'error');
      return;
    }
    // Issue #5: pemeriksaan duplikasi diulang saat apply (bukan hanya di
    // wizard) agar pengiriman ulang / data yang berubah di tengah jalan
    // tidak menciptakan siswa ganda.
    if (baru.nisn && nisnSudahTerdaftar(siswaList || [], baru.nisn, baru.id)) {
      toast(`NISN ${baru.nisn} sudah terdaftar di database ini. Pendaftaran dibatalkan.`, 'error');
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
      // Satu write: siswa + entri riwayat mutasi 'masuk' dalam satu objek.
      const { siswa } = buatEntriMutasiMasuk(
        baru,
        {
          tanggalEfektif: baru.tanggalDiterima || new Date().toISOString().slice(0, 10),
          alasan: `Pindahan dari ${baru.asalMutasi || '-'}`,
          sekolahAsal: baru.asalMutasi || '',
          noSurat: baru.noSuratPenerimaan || '',
        },
        { id: currentUser?.id, nama: currentUser?.namaLengkap || currentUser?.username },
        { sesiAktif: sesiLabel !== '-' ? sesiLabel : undefined },
      );
      await saveSiswa(siswa);
      await loadData();
      try {
        catatAudit('mutasi_masuk', {
          entitas: 'siswa',
          entitasId: baru.id,
          ringkasan: `Mutasi masuk "${baru.namaLengkap}" dari ${baru.asalMutasi || '-'} → ${baru.rombelSaatIni}`,
        });
      } catch {
        // Audit gagal setelah siswa tersimpan: jangan diam — riwayat mutasi
        // di record siswa tetap menjadi jejak yang dapat direkonsiliasi.
        toast('Siswa tersimpan, tetapi log audit gagal ditulis. Periksa menu Audit Trail.', 'warning');
      }
      toast(`Siswa pindahan "${baru.namaLengkap}" terdaftar di ${baru.rombelSaatIni}.`, 'success');
    } catch (err: unknown) {
      toast(`Gagal mendaftarkan siswa pindahan: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      doneTopProgress();
    }
  };

  // Handle Mutasi Keluar (dari wizard): status + dokumen serah terima.
  // Issue #5: logika dipusatkan di terapkanMutasiKeSiswa — validasi transisi,
  // idempotensi, dan entri riwayat mutasi dalam SATU objek siswa (satu write).
  const handleApplyMutasiKeluar = async (id: string, dok: DokumenMutasiKeluar) => {
    // Issue #12: peran pimpinan hanya membaca (matriks akses).
    if (!bolehTulis(currentUser)) {
      toast('Peran pimpinan hanya dapat membaca data.', 'error');
      return;
    }
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
      const sesiAktif = (sesiEfektif || sessionTahun || sekolah.tahunAjaran || '').trim();
      const { siswa, sudahAda } = terapkanMutasiKeSiswa(
        student,
        {
          siswaId: id,
          jenis: 'keluar',
          statusSebelum: student.statusSiswa,
          statusSesudah: 'Mutasi Keluar',
          tanggalEfektif: dok.tanggalKeluar,
          alasan: dok.alasanKeluar,
          sekolahTujuan: dok.sekolahTujuan,
          noSurat: dok.noSuratMutasi,
        },
        { id: currentUser?.id, nama: currentUser?.namaLengkap || currentUser?.username },
        { sesiAktif: sesiAktif || undefined },
      );
      if (sudahAda) {
        toast(`Mutasi keluar "${student.namaLengkap}" sudah tercatat sebelumnya (pengiriman ulang diabaikan).`, 'warning');
        return;
      }
      // F8: tulis entri riwayat tahun ajaran berjalan (status 'Mutasi Keluar')
      // agar riwayat tidak berlubang — tanpa mengubah entri tahun lama.
      const taBerjalan = sesiAktif;
      const sudahTercatat = taBerjalan
        ? (siswa.riwayatTahunAjaran || []).some(
            (r) =>
              r.tahunAjaran === taBerjalan &&
              (r.statusAkhirTahun === 'Mutasi Keluar' || r.statusKenaikan === 'Mutasi Keluar')
          )
        : true;
      const siswaAkhir: Siswa = sudahTercatat
        ? siswa
        : {
            ...siswa,
            riwayatTahunAjaran: [
              ...(siswa.riwayatTahunAjaran || []),
              {
                id: `rth-mutasi-${Date.now()}-${student.id}`,
                tahunAjaran: taBerjalan,
                tingkat: getTingkatAktifSiswa(student),
                rombel: student.rombelSaatIni,
                statusAkhirTahun: 'Mutasi Keluar',
                statusKenaikan: 'Mutasi Keluar',
                catatan: `Mutasi keluar ke ${dok.sekolahTujuan || '-'} (${dok.tanggalKeluar || '-'})`,
              } as RiwayatTahunAjaran,
            ],
          };
      await saveSiswa(siswaAkhir);
      await loadData();
      try {
        catatAudit('mutasi_keluar', {
          entitas: 'siswa',
          entitasId: id,
          ringkasan: `Mutasi keluar "${student.namaLengkap}" → ${dok.sekolahTujuan}`,
          detail: dok.noSuratMutasi ? `No. surat: ${dok.noSuratMutasi}` : undefined,
          sebelum: { statusSiswa: student.statusSiswa },
          sesudah: { statusSiswa: 'Mutasi Keluar' },
        });
      } catch {
        toast('Mutasi tersimpan, tetapi log audit gagal ditulis. Jejak tersedia di Riwayat Mutasi siswa.', 'warning');
      }
      toast(`"${student.namaLengkap}" dimutasi keluar ke ${dok.sekolahTujuan}.`, 'success');
    } catch (err: unknown) {
      toast(`Gagal memproses mutasi keluar: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      doneTopProgress();
    }
  };

  // Handle Ubah Status (dari wizard, Issue #5): Mengundurkan Diri /
  // Meninggal Dunia / Lulus sebagai peristiwa mutasi dengan riwayat.
  const handleApplyMutasiStatus = async (id: string, dok: DokumenMutasiStatus) => {
    // Issue #12: peran pimpinan hanya membaca (matriks akses).
    if (!bolehTulis(currentUser)) {
      toast('Peran pimpinan hanya dapat membaca data.', 'error');
      return;
    }
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
      const sesiAktif = (sesiEfektif || sessionTahun || sekolah.tahunAjaran || '').trim();
      const jenis = dok.target === 'Lulus' ? 'lulus' : 'ubah_status';
      const { siswa, sudahAda } = terapkanMutasiKeSiswa(
        student,
        {
          siswaId: id,
          jenis,
          statusSebelum: student.statusSiswa,
          statusSesudah: dok.target,
          tanggalEfektif: dok.tanggalEfektif,
          alasan: dok.alasan,
          noSurat: dok.noSurat,
        },
        { id: currentUser?.id, nama: currentUser?.namaLengkap || currentUser?.username },
        { sesiAktif: sesiAktif || undefined },
      );
      if (sudahAda) {
        toast(`Perubahan status "${student.namaLengkap}" sudah tercatat sebelumnya (pengiriman ulang diabaikan).`, 'warning');
        return;
      }
      await saveSiswa(siswa);
      await loadData();
      try {
        catatAudit('mutasi_status', {
          entitas: 'siswa',
          entitasId: id,
          ringkasan: `Status "${student.namaLengkap}" → ${dok.target} (${dok.tanggalEfektif})`,
          detail: dok.noSurat ? `No. surat: ${dok.noSurat}` : undefined,
          sebelum: { statusSiswa: student.statusSiswa },
          sesudah: { statusSiswa: dok.target },
        });
      } catch {
        toast('Perubahan status tersimpan, tetapi log audit gagal ditulis. Jejak tersedia di Riwayat Mutasi siswa.', 'warning');
      }
      toast(`Status "${student.namaLengkap}" diubah menjadi ${dok.target}.`, 'success');
    } catch (err: unknown) {
      toast(`Gagal mengubah status: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      doneTopProgress();
    }
  };

  // Handle Batal Mutasi (dari detail siswa, Issue #5): kembalikan status
  // ke Aktif lewat entri 'batal' — riwayat lama tidak dihapus/diubah.
  const handleBatalkanMutasi = async (id: string) => {
    // Issue #12: peran pimpinan hanya membaca (matriks akses).
    if (!bolehTulis(currentUser)) {
      toast('Peran pimpinan hanya dapat membaca data.', 'error');
      return;
    }
    const student = (siswaList || []).find((s) => s.id === id);
    if (!student) {
      toast('Data siswa tidak ditemukan.', 'error');
      return;
    }
    if (!canUserAccessRombel(currentUser, student.rombelSaatIni)) {
      toast('Akses ditolak: data ini di luar kewenangan rombel Anda.', 'error');
      return;
    }
    const ok = await confirmDialog(
      `Batalkan mutasi terakhir "${student.namaLengkap}" dan kembalikan statusnya menjadi Aktif? Riwayat lama tetap tersimpan sebagai jejak.`,
      { confirmLabel: 'Ya, Batalkan' }
    );
    if (!ok) return;
    startTopProgress();
    try {
      const { siswa } = batalkanMutasiTerakhir(student, { id: currentUser?.id, nama: currentUser?.namaLengkap || currentUser?.username });
      await saveSiswa(siswa);
      await loadData();
      if (detailSiswa?.id === id) setDetailSiswa(siswa);
      try {
        catatAudit('mutasi_batal', {
          entitas: 'siswa',
          entitasId: id,
          ringkasan: `Mutasi "${student.namaLengkap}" dibatalkan; status kembali Aktif`,
          sebelum: { statusSiswa: student.statusSiswa },
          sesudah: { statusSiswa: 'Aktif' },
        });
      } catch {
        toast('Pembatalan tersimpan, tetapi log audit gagal ditulis. Jejak tersedia di Riwayat Mutasi siswa.', 'warning');
      }
      toast(`Mutasi "${student.namaLengkap}" dibatalkan; status kembali Aktif.`, 'success');
    } catch (err: unknown) {
      toast(`Gagal membatalkan mutasi: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      doneTopProgress();
    }
  };

  // Handle Delete Siswa — operator hanya boleh hapus rombel aksesnya
  const handleDeleteSiswa = async (id: string) => {
    // Issue #12: peran pimpinan hanya membaca (matriks akses).
    if (!bolehTulis(currentUser)) {
      toast('Peran pimpinan hanya dapat membaca data.', 'error');
      return;
    }
    const student = (siswaList || []).find((s) => s.id === id);
    if (!canUserAccessRombel(currentUser, student?.rombelSaatIni)) {
      toast('Akses ditolak: data ini di luar kewenangan rombel Anda.', 'error');
      return;
    }
    const nama = student?.namaLengkap || 'siswa';
    // Konfirmasi dua tahap (QA Fase 1): ketik NISN siswa (atau nama lengkap
    // bila NISN kosong) — menghapus data induk tidak boleh satu klik.
    const teksKonfirmasi = (student?.nisn || '').trim() || nama;
    const ok = await confirmDialog(
      `Hapus data "${nama}" dari Buku Induk secara permanen?\n\nTindakan ini tidak dapat dibatalkan. Untuk melanjutkan, ketik ${student?.nisn ? 'NISN siswa' : 'nama lengkap siswa'} pada kolom di bawah.`,
      {
        confirmLabel: 'Ya, Hapus Permanen',
        danger: true,
        requireText: teksKonfirmasi,
        requireTextLabel: student?.nisn ? `Ketik NISN ${teksKonfirmasi} untuk mengonfirmasi` : `Ketik nama lengkap "${teksKonfirmasi}" untuk mengonfirmasi`,
      }
    );
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
    // Issue #12: profil sekolah hanya diubah administrator (matriks akses).
    if (!bolehKelolaAdmin(currentUser)) {
      toast('Hanya administrator yang dapat mengubah profil sekolah.', 'error');
      return;
    }
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
    <ThemeProvider>
    <div className="min-h-screen text-slate-900 font-sans antialiased">
      <TopProgressBar />
      {/* Sidebar Navigation + Fixed Top Navbar */}
      <Navbar
        sekolah={sekolah}
        activeTab={activeTab}
        setActiveTab={handleNavigateTab}
        siswaCount={visibleSiswa.length}
        kalenderBadge={hitungJumlahPengingatAktif(tugasYangTerlihat, pengaturanKalender)}
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
      <div className={`flex flex-col min-h-screen min-w-0 pt-16 pb-44 sm:pb-32 ${sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-64'}`}>
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
                siswa={dashboardSiswa}
                jenjang={sekolah.jenjang || 'SMP'}
                lastSyncLog={syncLogs[0]}
                isAdmin={isAdmin}
                sessionTahun={sessionTahun}
                tahunAktif={sekolah.tahunAjaran}
                onOpenSync={() => handleNavigateTab('dapodik')}
                onLihat={(tujuan) => {
                  if (tujuan === 'siswa') handleNavigateTab('siswa');
                  else if (tujuan === 'nilai') handleNavigateTab('raport');
                  else if (tujuan === 'backup') handleNavigateTab('backup');
                }}
                onDrillDown={handleDashboardDrillDown}
              />
            )}

            {/* View: Dasbor Operasional */}
            {activeTab === 'dasbor' && (
              <ErrorBoundary fallbackTitle="Dasbor gagal dimuat">
                <OperatorDashboard
                  siswa={dashboardSiswa}
                  jumlahSebelumFilter={visibleSiswa.length}
                  sekolah={sekolah}
                  syncLogs={syncLogs}
                  rombelRefs={rombelRefs}
                  gtkCount={ptkRefs.length}
                  currentUser={currentUser}
                  isAdmin={isAdmin}
                  sessionTahun={sessionTahun}
                  filter={dashboardFilter}
                  onFilterChange={setDashboardFilter}
                  tahunOptions={daftarTahunAjaran}
                  onDrillDown={handleDashboardDrillDown}
                  onOpenBackup={() => handleNavigateTab('backup')}
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
                onOpenImpor={() => setImporSiswaOpen(true)}
                isAdmin={isAdmin}
                sessionTahun={sessionTahun}
                tahunOptions={daftarTahunAjaran}
                filterAwal={siswaPreset}
                filterNonce={siswaPresetNonce}
              />
              </ErrorBoundary>
            )}

            {/* View: 3b. Pusat Laporan (Issue #7) */}
            {activeTab === 'laporan' && (
              <LaporanView
                siswa={visibleSiswa}
                sekolah={sekolah}
                sessionTahun={sessionTahun}
                currentUser={currentUser}
                onEkspor={(info) =>
                  catatAudit('laporan_ekspor', {
                    entitas: 'laporan',
                    ringkasan: `Laporan ${info.jenis} diekspor (${info.format}) — ${info.jumlahBaris} baris`,
                    detail: info.parameter,
                  })
                }
              />
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
                presetRombel={raportPresetRombel}
                presetNonce={raportPresetNonce}
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

            {/* View: Generator Dokumen Administrasi (Issue #4) — hanya
                menerima visibleSiswa (sudah terpotong hak rombel + sesi);
                tab terbuka untuk semua peran seperti Pusat Cetak. */}
            {activeTab === 'dokumen' && (
              <ErrorBoundary fallbackTitle="Generator dokumen gagal dimuat">
                <GeneratorDokumen
                  siswa={visibleSiswa}
                  sekolah={sekolah}
                  currentUser={currentUser}
                  onUpdateSekolah={handleUpdateSekolah}
                />
              </ErrorBoundary>
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
                  onBatalkanPromosi={handleBatalkanPromosi}
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

            {/* View: Kalender & Pengingat Tenggat (semua peran, sesuai visibilitas tugas) */}
            {activeTab === 'kalender' && (
              <ErrorBoundary>
                <KalenderTugasView
                  tugas={tugasYangTerlihat}
                  currentUser={currentUser}
                  pengaturan={pengaturanKalender}
                  onPengaturanChanged={setPengaturanKalender}
                  onDataChanged={loadData}
                  onNavigate={handleNavigateTab}
                />
              </ErrorBoundary>
            )}

            {/* View: 8. Log Audit (Administrator Only) */}
            {activeTab === 'audit' && (
              isAdmin ? <AuditLogView /> : AccessDeniedNotice
            )}

            {/* View: Pemeriksa Data (Issue #3) — semua peran; data sudah
                terfilter hak akses lewat visibleSiswa (operator = rombelnya). */}
            {activeTab === 'pemeriksa' && (
              <ErrorBoundary fallbackTitle="Pemeriksa data gagal dimuat">
                <PemeriksaDataView
                  siswa={visibleSiswa}
                  sekolahNpsn={sekolah.npsn}
                  onEditSiswa={(s) => {
                    setEditingSiswa(s);
                    setIsFormOpen(true);
                  }}
                  onViewSiswa={(s) => setDetailSiswa(s)}
                />
              </ErrorBoundary>
            )}
          </>
        )}
        </Suspense>
      </main>

      {/* Footer — freeze di bawah viewport */}
      <footer className={`fixed bottom-0 right-0 left-0 z-30 border-t border-slate-200/80 bg-white/90 backdrop-blur px-4 sm:px-6 py-3 print:hidden transition-[left] duration-200 ${sidebarCollapsed ? 'lg:left-[76px]' : 'lg:left-64'}`}>
        <div className="max-w-7xl mx-auto flex flex-col gap-2 text-xs">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
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
              Offline-first (IndexedDB PWA) • Sinkron Dapodik Lokal • Standar Kemdikbudristek RI • Versi {APP_VERSION}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-1 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
            <p>
              © {new Date().getFullYear()} {sekolah.nama || 'Buku Induk Siswa Merdeka'}{sekolah.npsn ? ` • NPSN ${sekolah.npsn}` : ''} — Hak cipta dilindungi undang-undang.
            </p>
            <p>
              Pengembang: <span className="text-slate-500 font-medium">Amwaluddin Lubis, S.T</span> (
              <a href="mailto:amwaluddin.lubis@gmail.com" className="text-slate-500 hover:text-blue-600 hover:underline">
                amwaluddin.lubis@gmail.com
              </a>
              )
            </p>
            <p>
              Tahun Ajaran {sekolah.tahunAjaran} • Data tersimpan lokal di perangkat ini
            </p>
          </div>
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
          onBatalkanMutasi={handleBatalkanMutasi}
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
          onApplyStatus={handleApplyMutasiStatus}
          onClose={() => setMutasiOpen(false)}
        />
      )}

      {imporSiswaOpen && (
        <ImporSiswaView
          siswa={siswaList}
          currentUser={currentUser}
          sekolah={sekolah}
          onDataChanged={loadData}
          onClose={() => setImporSiswaOpen(false)}
        />
      )}

      {/* Global toast & konfirmasi (pengganti alert/confirm native) */}
      <ToastHost />
      <ConfirmDialogHost />

      {/* Pencarian global cepat (Ctrl+K) → buka detail siswa */}
      <GlobalSearch onPilihSiswa={(s) => setDetailSiswa(s)} />

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
    </ThemeProvider>
  );
}
