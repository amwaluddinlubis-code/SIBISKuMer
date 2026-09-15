import React, { useState } from 'react';
import { 
  BookOpen, 
  Users, 
  RefreshCw, 
  BarChart3, 
  Printer, 
  Settings, 
  GraduationCap,
  ShieldCheck,
  UserCog,
  LogOut,
  ChevronDown,
  UserCheck,
  ArrowLeftRight,
  Award,
  Database
} from 'lucide-react';
import { SekolahProfile, AppUser } from '../types';
import { OfflineIndicator } from './OfflineIndicator';
import { PWAInstallButton } from './PWAInstallButton';

interface NavbarProps {
  sekolah: SekolahProfile;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  siswaCount: number;
  currentUser: AppUser | null;
  impersonator: AppUser | null;
  onLogout: () => void;
  onStopImpersonating: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  sekolah,
  activeTab,
  setActiveTab,
  siswaCount,
  currentUser,
  impersonator,
  onLogout,
  onStopImpersonating
}) => {
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isAdmin = currentUser?.role === 'administrator';

  const jenjang = sekolah.jenjang || (sekolah.bentukPendidikan?.toUpperCase().includes('SD') ? 'SD' : 'SMP');

  const navItems = [
    { id: 'siswa', label: 'Master Siswa', icon: Users, badge: siswaCount },
    { id: 'raport', label: 'Nilai Raport', icon: Award },
    { id: 'dapodik', label: 'Sinkron Dapodik', icon: RefreshCw },
    { id: 'rekap', label: 'Rekapitulasi', icon: BarChart3 },
    { id: 'cetak', label: 'Cetak Lembar Induk', icon: Printer },
    { id: 'pengaturan', label: 'Profil Sekolah', icon: Settings },
  ];

  if (isAdmin) {
    navItems.push({
      id: 'backup',
      label: 'Backup & Restore',
      icon: Database,
      badge: undefined
    });
    navItems.push({
      id: 'users',
      label: 'Manajemen Pengguna',
      icon: UserCog,
      badge: undefined
    });
  }

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      {/* Impersonation Warning Banner (if currently impersonating) */}
      {impersonator && (
        <div className="bg-amber-600 text-white px-4 py-2 text-xs font-semibold shadow-inner">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-200 animate-ping" />
              <ArrowLeftRight className="w-4 h-4 text-amber-100" />
              <span>
                Mode Penyamaran (Impersonate): Anda sedang aktif sebagai operator <strong>{currentUser?.namaLengkap}</strong> (@{currentUser?.username}).
              </span>
            </div>
            <button
              onClick={onStopImpersonating}
              className="px-3 py-1 bg-white hover:bg-amber-50 text-amber-900 font-bold text-xs rounded-lg shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Kembali ke Administrator ({impersonator.namaLengkap})</span>
            </button>
          </div>
        </div>
      )}

      {/* Top Banner with School Identity and Status */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white px-4 py-2 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600/30 border border-blue-400/40 flex items-center justify-center shrink-0">
              <GraduationCap className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <span className="font-bold tracking-wide uppercase">{sekolah.nama || 'SMP NEGERI 1 MERDEKA BELAJAR'}</span>
              <span className="hidden md:inline text-blue-200 mx-2">|</span>
              <span className="hidden md:inline text-blue-200">NPSN: {sekolah.npsn || '20104567'}</span>
              <span className="hidden lg:inline text-blue-300 ml-2">({sekolah.kabupatenKota}, {sekolah.provinsi})</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-block px-2 py-0.5 rounded bg-blue-800/80 text-blue-200 font-medium">
              Kurikulum Merdeka ({jenjang === 'SD' ? 'Fase A-C' : 'Fase D'})
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-medium">
              TA {sekolah.tahunAjaran} - {sekolah.semesterAktif}
            </span>
            <OfflineIndicator />
          </div>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-700 text-white flex items-center justify-center shadow-md shadow-blue-700/20">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-none">
                  Buku Induk Siswa {jenjang}
                </h1>
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded">
                  Kurikulum Merdeka
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">
                Standar Lembar Induk Kemdikbudristek & Sinkronisasi Dapodik ({jenjang})
              </p>
            </div>
          </div>

          {/* Right Action & User Profile Dropdown */}
          <div className="flex items-center gap-3">
            <PWAInstallButton />

            {currentUser && (
              <div className="relative">
                <button
                  type="button"
                  id="user-profile-button"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2.5 p-1.5 sm:px-3 sm:py-1.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition cursor-pointer"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shadow-xs ${
                    currentUser.role === 'administrator' ? 'bg-purple-600' : 'bg-blue-600'
                  }`}>
                    {currentUser.namaLengkap.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="text-left hidden sm:block">
                    <p className="text-xs font-bold text-slate-900 leading-tight">
                      {currentUser.namaLengkap}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded-sm ${
                        currentUser.role === 'administrator'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {currentUser.role === 'administrator' ? 'Administrator' : 'Operator'}
                      </span>
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
                </button>

                {/* Dropdown Menu */}
                {userMenuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setUserMenuOpen(false)} 
                    />
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50 text-xs animate-in fade-in">
                      <div className="px-3.5 py-2 border-b border-slate-100">
                        <p className="font-bold text-slate-900 text-sm">{currentUser.namaLengkap}</p>
                        <p className="text-slate-500 font-mono text-[11px]">@{currentUser.username}</p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            currentUser.role === 'administrator' 
                              ? 'bg-purple-100 text-purple-800' 
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            Peran: {currentUser.role === 'administrator' ? 'Administrator Sistem' : 'Operator Dapodik / Sekolah'}
                          </span>
                        </div>
                      </div>

                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab('backup');
                              setUserMenuOpen(false);
                            }}
                            className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700 font-medium transition cursor-pointer"
                          >
                            <Database className="w-4 h-4 text-indigo-600" />
                            <span>Backup & Restore Database</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab('users');
                              setUserMenuOpen(false);
                            }}
                            className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700 font-medium transition cursor-pointer"
                          >
                            <UserCog className="w-4 h-4 text-purple-600" />
                            <span>Kelola Pengguna & Operator</span>
                          </button>
                        </>
                      )}

                      {impersonator && (
                        <button
                          type="button"
                          onClick={() => {
                            onStopImpersonating();
                            setUserMenuOpen(false);
                          }}
                          className="w-full text-left px-3.5 py-2.5 hover:bg-amber-50 text-amber-800 font-semibold flex items-center gap-2 transition cursor-pointer"
                        >
                          <ArrowLeftRight className="w-4 h-4 text-amber-600" />
                          <span>Kembali ke Administrator</span>
                        </button>
                      )}

                      <div className="border-t border-slate-100 my-1" />

                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          onLogout();
                        }}
                        className="w-full text-left px-3.5 py-2 hover:bg-rose-50 text-rose-700 font-semibold flex items-center gap-2 transition cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 text-rose-600" />
                        <span>Keluar (Logout)</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tab Navigation Menu */}
        <nav className="flex space-x-1 sm:space-x-2 border-t border-slate-100 overflow-x-auto py-1 scrollbar-none">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`tab-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm font-semibold rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 border border-blue-200/80 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-700' : 'text-slate-500'}`} />
                <span>{item.label}</span>
                {typeof item.badge === 'number' && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 text-[11px] font-bold rounded-full ${
                      isActive ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
