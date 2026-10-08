import React, { useState } from 'react';
import {
  Users,
  RefreshCw,
  BarChart3,
  Printer,
  Settings,
  GraduationCap,
  UserCog,
  LogOut,
  ChevronDown,
  ArrowLeftRight,
  Award,
  Database,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  KeyRound,
  Layers,
  Contact,
  LayoutDashboard,
  Archive,
  LayoutGrid,
  ScrollText,
  Table,
  Sun,
  Moon,
  Monitor
} from 'lucide-react';
import { SekolahProfile, AppUser, SchoolEntry, ModeTampilan } from '../types';
import { OfflineIndicator } from './OfflineIndicator';
import { PWAInstallButton } from './PWAInstallButton';
import { SchoolSwitcher } from './SchoolSwitcher';
import { getAllUsers, saveUser, setCurrentUserSession } from '../utils/db';
import { verifyPassword, hashPassword } from '../utils/password';
import { catatAudit } from '../utils/audit';

interface NavbarProps {
  sekolah: SekolahProfile;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  siswaCount: number;
  currentUser: AppUser | null;
  impersonator: AppUser | null;
  onLogout: () => void;
  onStopImpersonating: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  schools?: SchoolEntry[];
  activeSchoolId?: string | null;
  schoolSiswaCounts?: Record<string, number | null>;
  switchingSchoolId?: string | null;
  onSwitchSchool?: (id: string) => void;
  onManageSchools?: () => void;
  /** Sesi tahun ajaran hasil login per-TA. */
  sessionTahun?: string | null;
  tahunOptions?: string[];
  tahunDiizinkan?: string[];
  onSwitchTahun?: (tahun: string) => void;
  /** Mode tampilan layar (semua peran) + pengalihnya. */
  modeTampilan?: ModeTampilan;
  onGantiMode?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  sekolah,
  activeTab,
  setActiveTab,
  siswaCount,
  currentUser,
  impersonator,
  onLogout,
  onStopImpersonating,
  collapsed,
  onToggleCollapse,
  schools,
  activeSchoolId,
  schoolSiswaCounts,
  switchingSchoolId,
  onSwitchSchool,
  onManageSchools,
  sessionTahun,
  tahunOptions,
  tahunDiizinkan,
  onSwitchTahun,
  modeTampilan = 'terang',
  onGantiMode
}) => {
  const [topUserOpen, setTopUserOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [pwOld, setPwOld] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  const isAdmin = currentUser?.role === 'administrator';

  const mainItems = [
    { id: 'dasbor', label: 'Dasbor', icon: LayoutDashboard, badge: undefined },
    { id: 'siswa', label: 'Master Siswa', icon: Users, badge: siswaCount },
    { id: 'raport', label: 'Nilai Raport', icon: Award, badge: undefined },
    { id: 'leger', label: 'Leger Nilai', icon: Table, badge: undefined },
    { id: 'rekap', label: 'Rekapitulasi', icon: BarChart3, badge: undefined },
    { id: 'cetak', label: 'Cetak Lembar Induk', icon: Printer, badge: undefined },
    { id: 'referensi', label: 'Data Referensi', icon: Layers, badge: undefined },
    { id: 'gtk', label: 'Data GTK', icon: Contact, badge: undefined },
    { id: 'arsip', label: 'Arsip Tahun Ajaran', icon: Archive, badge: undefined },
  ];

  // Menu admin hanya lewat dropdown pengguna di topbar (tidak di sidebar)
  const adminMenu = [
    { id: 'dapodik', label: 'Sinkron Dapodik', icon: RefreshCw },
    { id: 'pemetaan', label: 'Pemetaan Kelas', icon: LayoutGrid },
    { id: 'pengaturan', label: 'Profil Sekolah', icon: Settings },
    { id: 'backup', label: 'Backup & Restore', icon: Database },
    { id: 'users', label: 'Manajemen Pengguna', icon: UserCog },
    { id: 'audit', label: 'Log Audit', icon: ScrollText },
  ];

  const handleNavigate = (tab: string) => {
    setActiveTab(tab);
    setDrawerOpen(false);
    setTopUserOpen(false);
  };

  const renderNavButton = (
    item: { id: string; label: string; icon: React.ElementType; badge?: number },
    iconOnly = false
  ) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    if (iconOnly) {
      return (
        <button
          key={item.id}
          id={`tab-${item.id}`}
          title={item.label}
          onClick={() => handleNavigate(item.id)}
          className={`relative w-full flex items-center justify-center py-2.5 rounded transition-all cursor-pointer group ${
            isActive
              ? 'bg-white text-navy-900 shadow-lg shadow-black/30'
              : 'text-slate-400 hover:text-white hover:bg-white/10'
          }`}
        >
          <span
            className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-gold-400 transition-opacity ${
              isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'
            }`}
          />
          <Icon className="w-5 h-5" />
          {typeof item.badge === 'number' && (
            <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded bg-gold-400 text-navy-950 text-[10px] font-extrabold flex items-center justify-center">
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </button>
      );
    }
    return (
      <button
        key={item.id}
        id={`tab-${item.id}`}
        onClick={() => handleNavigate(item.id)}
        className={`relative w-full flex items-center gap-3 pl-3 pr-3 py-2.5 text-sm font-semibold rounded transition-all cursor-pointer overflow-hidden ${
          isActive
            ? 'bg-white text-navy-900 shadow-lg shadow-black/25'
            : 'text-slate-300 hover:text-white hover:bg-white/10'
        }`}
      >
        <span
          className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-7 rounded-r-full bg-gold-400 transition-all ${
            isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
          }`}
        />
        <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-navy-800' : 'text-slate-400'}`} />
        <span className="flex-1 text-left truncate">{item.label}</span>
        {typeof item.badge === 'number' && (
          <span
            className={`px-1.5 py-0.5 text-[11px] font-extrabold rounded tabular-nums ${
              isActive ? 'bg-navy-900 text-gold-300' : 'bg-white/10 text-slate-300'
            }`}
          >
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  const sesiOptions = (tahunDiizinkan && tahunDiizinkan.length > 0
    ? tahunDiizinkan
    : tahunOptions || []).filter(Boolean);

  const userMenuContent = (
    <>
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70">
        <p className="font-bold text-slate-900 text-sm truncate">{currentUser?.namaLengkap}</p>
        <p className="text-slate-500 font-mono text-[11px]">@{currentUser?.username}</p>
        <span className={`inline-block mt-1.5 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wide ${
          currentUser?.role === 'administrator'
            ? 'bg-purple-100 text-purple-800'
            : 'bg-blue-100 text-blue-800'
        }`}>
          {currentUser?.role === 'administrator' ? 'Administrator' : 'Operator'}
        </span>
        {currentUser?.rombelAkses && currentUser.rombelAkses.length > 0 && (
          <p className="mt-1.5 text-[11px] text-slate-500">
            Rombel: <strong className="text-slate-700">{currentUser.rombelAkses.join(', ')}</strong>
          </p>
        )}
        <p className="mt-1.5 text-[11px] text-slate-500">
          Sesi TA:{' '}
          <strong className="text-slate-700 font-mono">{sessionTahun || sekolah.tahunAjaran || '-'}</strong>
          {currentUser?.tahunAkses && currentUser.tahunAkses.length > 0 && (
            <span className="block text-[10px] text-slate-400">
              Dibatasi: {currentUser.tahunAkses.join(', ')}
            </span>
          )}
        </p>
        {sesiOptions.length > 1 && onSwitchTahun && (
          <div className="mt-2">
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
              Ganti sesi TA
            </label>
            <select
              value={sessionTahun || ''}
              onChange={(e) => e.target.value && onSwitchTahun(e.target.value)}
              className="w-full px-2 py-1.5 text-[11px] font-mono font-bold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Ganti sesi tahun ajaran"
            >
              {sesiOptions.map((t) => (
                <option key={t} value={t}>
                  TA {t}{t === sekolah.tahunAjaran ? ' (Aktif)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {isAdmin && (
        <>
          <p className="px-4 pt-2 pb-1 text-[10px] font-extrabold uppercase tracking-[0.15em] text-slate-400">
            Administrator
          </p>
          {adminMenu.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-2.5 font-semibold transition cursor-pointer ${
                  active ? 'bg-navy-900 text-white' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-gold-300' : 'text-slate-400'}`} />
                <span className="flex-1">{item.label}</span>
                {active && <span className="w-1.5 h-1.5 rounded-full bg-gold-400" />}
              </button>
            );
          })}
          {onManageSchools && (
            <button
              type="button"
              onClick={() => {
                onManageSchools();
                setTopUserOpen(false);
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-slate-700 font-semibold flex items-center gap-2.5 transition cursor-pointer"
            >
              <GraduationCap className="w-4 h-4 text-slate-400" />
              <span className="flex-1">Kelola Multi-Sekolah</span>
              {schools && schools.length > 1 && (
                <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-extrabold">
                  {schools.length}
                </span>
              )}
            </button>
          )}
          <div className="border-t border-slate-100 my-1" />
        </>
      )}

      {impersonator && (
        <button
          type="button"
          onClick={() => {
            onStopImpersonating();
            setTopUserOpen(false);
          }}
          className="w-full text-left px-4 py-2.5 hover:bg-amber-50 text-amber-800 font-semibold flex items-center gap-2.5 transition cursor-pointer"
        >
          <ArrowLeftRight className="w-4 h-4 text-amber-600" />
          <span>Kembali ke Administrator</span>
        </button>
      )}

      <div className="border-t border-slate-100 my-1" />

      <button
        type="button"
        onClick={() => {
          setPwOld('');
          setPwNew('');
          setPwConfirm('');
          setPwError(null);
          setPwSuccess(false);
          setPwModalOpen(true);
          setTopUserOpen(false);
        }}
        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-2.5 transition cursor-pointer"
      >
        <KeyRound className="w-4 h-4 text-slate-500" />
        <span>Ganti Kata Sandi</span>
      </button>

      <button
        type="button"
        onClick={() => {
          setTopUserOpen(false);
          onLogout();
        }}
        className="w-full text-left px-4 py-2.5 hover:bg-rose-50 text-rose-700 font-semibold flex items-center gap-2.5 transition cursor-pointer"
      >
        <LogOut className="w-4 h-4 text-rose-600" />
        <span>Keluar (Logout)</span>
      </button>
    </>
  );

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(false);
    if (!currentUser) return;
    if (pwNew.length < 6) {
      setPwError('Kata sandi baru minimal 6 karakter.');
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwError('Konfirmasi kata sandi tidak sama.');
      return;
    }
    setPwSaving(true);
    try {
      const users = await getAllUsers();
      const fresh = users.find((u) => u.id === currentUser.id);
      if (!fresh) {
        setPwError('Akun tidak ditemukan di database.');
        return;
      }
      const oldOk = (await verifyPassword(pwOld, fresh.password)).ok;
      if (!oldOk) {
        setPwError('Kata sandi lama salah.');
        return;
      }
      const updated: AppUser = { ...fresh, password: await hashPassword(pwNew), updatedAt: new Date().toISOString() };
      await saveUser(updated);
      setCurrentUserSession(updated);
      catatAudit('password_ubah', {
        entitas: 'akun',
        entitasId: updated.id,
        ringkasan: `@${updated.username} mengganti kata sandi sendiri`,
      });
      setPwSuccess(true);
      setPwOld('');
      setPwNew('');
      setPwConfirm('');
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : 'Gagal menyimpan kata sandi.');
    } finally {
      setPwSaving(false);
    }
  };

  const renderSidebarBody = (iconOnly: boolean) => (
    <div className="flex flex-col h-full">
      {/* Brand + tombol toggle expand/collapse */}
      <div className={`${iconOnly ? 'px-2 pt-3 pb-2 flex flex-col items-center gap-2' : 'px-4 pt-4 pb-3'}`}>
        {iconOnly ? (
          <>
            <div className="w-10 h-10 rounded bg-gradient-to-br from-blue-500 to-navy-800 border border-white/20 flex items-center justify-center shadow-lg">
              <GraduationCap className="w-5 h-5 text-gold-300" />
            </div>
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Bentangkan sidebar"
              aria-label="Bentangkan sidebar"
              className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <PanelLeftOpen className="w-4.5 h-4.5" />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded bg-gradient-to-br from-blue-500 to-navy-800 border border-white/20 flex items-center justify-center shadow-lg shrink-0">
              <GraduationCap className="w-5 h-5 text-gold-300" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white font-extrabold text-sm leading-tight tracking-wide">
                BUKU<span className="text-gold-400">INDUK</span>
              </p>
              <p className="text-[10px] text-slate-400 font-semibold tracking-widest uppercase">
                Kurikulum Merdeka
              </p>
              <span className="inline-block mt-1 px-1.5 py-px rounded text-[10px] font-extrabold bg-gold-400/15 text-gold-300 border border-gold-400/30">
                {sekolah.jenjang || 'SMP'} • {sekolah.tahunAjaran || '-'}
              </span>
            </div>
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Ciutkan sidebar"
              aria-label="Ciutkan sidebar"
              className="p-1.5 -mr-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0"
            >
              <PanelLeftClose className="w-4.5 h-4.5" />
            </button>
          </div>
        )}
      </div>

      {/* Navigation — hanya menu utama; menu admin ada di dropdown pengguna */}
      <nav className={`flex-1 overflow-y-auto py-2 space-y-1 ${iconOnly ? 'px-2' : 'px-3'}`}>
        {!iconOnly && (
          <p className="px-3 pb-1.5 text-[10px] font-extrabold uppercase tracking-[0.15em] text-slate-500">
            Menu Utama
          </p>
        )}
        {mainItems.map((item) => renderNavButton(item, iconOnly))}
      </nav>

      {/* Bottom: user mini-card + PWA */}
      <div className={`border-t border-white/10 ${iconOnly ? 'p-2 flex flex-col items-center gap-2' : 'p-3 space-y-2'}`}>
        {isAdmin && onManageSchools && schools && schools.length > 0 && (
          <button
            type="button"
            onClick={onManageSchools}
            title={`Kelola multi-sekolah (${schools.length} database)`}
            className={iconOnly
              ? 'w-full flex items-center justify-center py-2 rounded text-gold-300 hover:bg-white/10 transition cursor-pointer'
              : 'w-full flex items-center gap-2 px-2.5 py-2 rounded bg-white/5 border border-white/10 hover:bg-white/10 transition cursor-pointer text-left'}
          >
            <GraduationCap className="w-4 h-4 text-gold-300 shrink-0" />
            {!iconOnly && (
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold text-white truncate">
                  {schools.find((s) => s.id === activeSchoolId)?.nama || sekolah.nama}
                </span>
                <span className="block text-[10px] text-slate-400">
                  {schools.length} database • Kelola
                </span>
              </span>
            )}
          </button>
        )}
        {iconOnly ? (
          <div
            title={currentUser?.namaLengkap || 'Pengguna'}
            className={`w-9 h-9 rounded flex items-center justify-center text-[11px] font-extrabold text-white ${
              currentUser?.role === 'administrator'
                ? 'bg-gradient-to-br from-purple-500 to-purple-700'
                : 'bg-gradient-to-br from-blue-500 to-navy-800'
            }`}
          >
            {currentUser ? currentUser.namaLengkap.slice(0, 2).toUpperCase() : '?'}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5 rounded bg-white/5 border border-white/10 px-2.5 py-2">
              <div className={`w-8 h-8 rounded flex items-center justify-center text-[11px] font-extrabold text-white shrink-0 ${
                currentUser?.role === 'administrator'
                  ? 'bg-gradient-to-br from-purple-500 to-purple-700'
                  : 'bg-gradient-to-br from-blue-500 to-navy-800'
              }`}>
                {currentUser ? currentUser.namaLengkap.slice(0, 2).toUpperCase() : '?'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate leading-tight">
                  {currentUser?.namaLengkap || 'Pengguna'}
                </p>
                <p className="text-[10px] text-slate-400 truncate">
                  {isAdmin ? 'Administrator' : 'Operator'}
                </p>
              </div>
            </div>
            <PWAInstallButton />
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Topbar terang — mulai dari tepi sidebar sampai ujung kanan (sidebar full-height) */}
      <header className={`fixed top-0 right-0 left-0 h-16 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 print:hidden transition-[left] duration-200 ${collapsed ? 'lg:left-[76px]' : 'lg:left-64'}`}>
        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 h-16">
          {/* Sidebar toggle (desktop) / drawer (mobile) */}
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? 'Bentangkan sidebar' : 'Ciutkan sidebar'}
            className="hidden lg:flex p-2 rounded text-slate-500 hover:text-navy-900 hover:bg-slate-100 transition cursor-pointer"
            aria-label="Expand/collapse sidebar"
          >
            {collapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden p-2 -ml-1 rounded text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            aria-label="Buka menu navigasi"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Nama Sekolah */}
          <div className="w-10 h-10 rounded bg-gradient-to-br from-blue-600 to-navy-900 text-white items-center justify-center shrink-0 shadow-md shadow-blue-900/20 hidden sm:flex">
            <GraduationCap className="w-5 h-5 text-gold-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-extrabold leading-tight truncate uppercase tracking-wide text-slate-900">
              {sekolah.nama || 'Sekolah (SD/SMP)'}
            </p>
            <p className="text-[11px] text-slate-500 truncate">
              NPSN: <span className="font-mono font-semibold">{sekolah.npsn || '-'}</span>
              <span className="hidden md:inline"> • {sekolah.kabupatenKota}{sekolah.kabupatenKota && sekolah.provinsi ? ', ' : ''}{sekolah.provinsi}</span>
            </p>
          </div>

          {/* Periode Aktif */}
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-navy-900 text-white text-[11px] font-bold whitespace-nowrap shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-gold-400" />
            TA {sekolah.tahunAjaran} • {sekolah.semesterAktif}
          </span>
          {sessionTahun && sesiOptions.length > 0 && onSwitchTahun ? (
            <select
              value={sessionTahun}
              onChange={(e) => e.target.value && onSwitchTahun(e.target.value)}
              title="Sesi tahun ajaran login (ganti sesi)"
              aria-label="Sesi tahun ajaran login"
              className="hidden sm:block px-2 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-mono font-extrabold whitespace-nowrap shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
            >
              {sesiOptions.map((t) => (
                <option key={t} value={t}>
                  Sesi {t}
                </option>
              ))}
            </select>
          ) : sessionTahun ? (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-mono font-extrabold whitespace-nowrap">
              Sesi {sessionTahun}
            </span>
          ) : null}
          {isAdmin && schools && schools.length > 0 && onSwitchSchool && onManageSchools && (
            <div className="hidden md:block">
              <SchoolSwitcher
                schools={schools}
                activeId={activeSchoolId || null}
                siswaCounts={schoolSiswaCounts}
                switchingId={switchingSchoolId || null}
                onSwitch={onSwitchSchool}
                onManage={onManageSchools}
              />
            </div>
          )}
          <div className="hidden md:block">
            <OfflineIndicator />
          </div>

          {/* Pengalih terang/gelap (preferensi perangkat, semua peran) */}
          <button
            type="button"
            onClick={onGantiMode}
            className="p-2 rounded hover:bg-slate-100 border border-transparent hover:border-slate-200 transition cursor-pointer shrink-0"
            title={`Mode tampilan: ${modeTampilan === 'terang' ? 'Terang' : modeTampilan === 'gelap' ? 'Gelap' : 'Otomatis'} (klik untuk ganti)`}
            aria-label="Ganti mode tampilan terang atau gelap"
          >
            {modeTampilan === 'gelap' ? (
              <Moon className="w-4 h-4 text-indigo-400" />
            ) : modeTampilan === 'otomatis' ? (
              <Monitor className="w-4 h-4 text-slate-500" />
            ) : (
              <Sun className="w-4 h-4 text-amber-500" />
            )}
          </button>

          {/* User login */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setTopUserOpen(!topUserOpen)}
              className="flex items-center gap-2 p-1.5 pr-2 rounded hover:bg-slate-100 border border-transparent hover:border-slate-200 transition cursor-pointer"
              aria-label="Menu pengguna"
            >
              <div className={`w-9 h-9 rounded flex items-center justify-center text-[11px] font-extrabold text-white shadow-sm ${
                currentUser?.role === 'administrator'
                  ? 'bg-gradient-to-br from-purple-500 to-purple-700'
                  : 'bg-gradient-to-br from-blue-600 to-navy-900'
              }`}>
                {currentUser ? currentUser.namaLengkap.slice(0, 2).toUpperCase() : '?'}
              </div>
              <div className="text-left hidden xl:block">
                <p className="text-xs font-bold leading-tight max-w-32 truncate text-slate-900">
                  {currentUser ? currentUser.namaLengkap : 'Belum masuk'}
                </p>
                <p className="text-[10px] text-slate-500 font-mono leading-tight">
                  @{currentUser?.username || '-'}
                </p>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 hidden sm:block transition-transform ${topUserOpen ? 'rotate-180' : ''}`} />
            </button>

            {topUserOpen && currentUser && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setTopUserOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded shadow-xl border border-slate-200 py-2 z-50 text-xs anim-scale-in overflow-hidden">
                  {userMenuContent}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Impersonation Warning Banner (below fixed topbar) */}
      {impersonator && (
        <div className={`pt-16 print:hidden ${collapsed ? 'lg:pl-[76px]' : 'lg:pl-64'}`}>
          <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white px-4 py-2 text-xs font-semibold shadow-sm">
            <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                </span>
                <ArrowLeftRight className="w-4 h-4 text-amber-100" />
                <span>
                  Mode Penyamaran: aktif sebagai <strong>{currentUser?.namaLengkap}</strong> (@{currentUser?.username}).
                </span>
              </div>
              <button
                onClick={onStopImpersonating}
                className="px-3 py-1.5 bg-white hover:bg-amber-50 text-amber-900 font-bold text-xs rounded shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Kembali ke {impersonator.namaLengkap}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar full-height (collapsible) */}
      <aside className={`hidden lg:block fixed left-0 top-0 bottom-0 bg-gradient-to-b from-navy-950 via-navy-900 to-[#0b1e4b] print:hidden z-40 transition-all duration-200 shadow-2xl ${collapsed ? 'w-[76px]' : 'w-64'}`}>
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-gold-500 via-gold-300 to-gold-500" />
        {renderSidebarBody(collapsed)}
      </aside>

      {/* Modal Ganti Kata Sandi */}
      {pwModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-sm print:hidden">
          <div className="w-full max-w-sm ui-card p-5 anim-scale-in shadow-2xl">
            <h3 className="ui-section-title !normal-case !tracking-normal !text-sm">
              <KeyRound className="w-4 h-4" />
              Ganti Kata Sandi
            </h3>
            <p className="ui-hint mb-4">
              Akun: <strong>@{currentUser?.username}</strong>
            </p>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="ui-label">Kata sandi lama</label>
                <input
                  type="password"
                  required
                  value={pwOld}
                  onChange={(e) => setPwOld(e.target.value)}
                  className="ui-input"
                />
              </div>
              <div>
                <label className="ui-label">Kata sandi baru (min. 6 karakter)</label>
                <input
                  type="password"
                  required
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  className="ui-input"
                />
              </div>
              <div>
                <label className="ui-label">Konfirmasi kata sandi baru</label>
                <input
                  type="password"
                  required
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  className="ui-input"
                />
              </div>
              {pwError && (
                <p className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">{pwError}</p>
              )}
              {pwSuccess && (
                <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
                  Kata sandi berhasil diganti. Gunakan kata sandi baru saat masuk berikutnya.
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPwModalOpen(false)}
                  className="ui-btn ui-btn-ghost flex-1"
                >
                  {pwSuccess ? 'Tutup' : 'Batal'}
                </button>
                {!pwSuccess && (
                  <button
                    type="submit"
                    disabled={pwSaving}
                    className="ui-btn ui-btn-primary flex-1"
                  >
                    {pwSaving ? 'Menyimpan...' : 'Simpan'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mobile Drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 print:hidden">
          <div
            className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-gradient-to-b from-navy-950 via-navy-900 to-[#0b1e4b] shadow-2xl anim-slide-in-left flex flex-col overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-gold-500 via-gold-300 to-gold-500" />
            <div className="flex justify-end p-2">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                aria-label="Tutup menu navigasi"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              {renderSidebarBody(false)}
            </div>
          </aside>
        </div>
      )}
    </>
  );
};
