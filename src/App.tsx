import React, { useState, useEffect, useCallback } from 'react';
import { 
  getAllSiswa, 
  getSekolahProfile, 
  getDapodikConfig, 
  getSyncLogs, 
  saveSiswa, 
  deleteSiswa, 
  resetToInitialData,
  getCurrentUserSession,
  setCurrentUserSession,
  getImpersonateSession,
  setImpersonateSession,
  clearImpersonateSession,
  clearCurrentUserSession,
  saveSekolahProfile
} from './utils/db';
import { Siswa, SekolahProfile, DapodikConfig, DapodikSyncLog, AppUser } from './types';
import { initialSekolahProfile, initialDapodikConfig } from './data/initialData';
import { Navbar } from './components/Navbar';
import { DashboardStats } from './components/DashboardStats';
import { SiswaList } from './components/SiswaList';
import { DapodikSyncView } from './components/DapodikSyncView';
import { RekapitulasiView } from './components/RekapitulasiView';
import { PengaturanSekolahView } from './components/PengaturanSekolahView';
import { CetakBukuInduk } from './components/CetakBukuInduk';
import { SiswaFormModal } from './components/SiswaFormModal';
import { SiswaDetailModal } from './components/SiswaDetailModal';
import { LoginModal } from './components/LoginModal';
import { UserManagementView } from './components/UserManagementView';
import { NilaiRaportView } from './components/NilaiRaportView';
import { BackupRestoreModule } from './components/BackupRestoreModule';
import { FileText, Search, User, Printer, Eye, Lock } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [impersonator, setImpersonator] = useState<AppUser | null>(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [sekolah, setSekolah] = useState<SekolahProfile>(initialSekolahProfile);
  const [dapodikConfig, setDapodikConfig] = useState<DapodikConfig>(initialDapodikConfig);
  const [syncLogs, setSyncLogs] = useState<DapodikSyncLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Active navigation tab: 'siswa' | 'dapodik' | 'rekap' | 'cetak' | 'pengaturan' | 'users'
  const [activeTab, setActiveTab] = useState<string>('siswa');

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSiswa, setEditingSiswa] = useState<Siswa | null>(null);
  const [detailSiswa, setDetailSiswa] = useState<Siswa | null>(null);
  const [printSiswa, setPrintSiswa] = useState<Siswa | null>(null);

  // Search state for 'cetak' tab student selector
  const [cetakSearch, setCetakSearch] = useState('');

  // Check initial user authentication session
  useEffect(() => {
    const sessionUser = getCurrentUserSession();
    const impUser = getImpersonateSession();

    if (sessionUser) {
      setCurrentUser(sessionUser);
      setImpersonator(impUser);
      setIsLoginOpen(false);
    } else {
      setIsLoginOpen(true);
    }
  }, []);

  // Load initial data from IndexedDB
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [siswa, sek, cfg, logs] = await Promise.all([
        getAllSiswa(),
        getSekolahProfile(),
        getDapodikConfig(),
        getSyncLogs()
      ]);
      setSiswaList(siswa);
      setSekolah(sek);
      setDapodikConfig(cfg);
      setSyncLogs(logs);
    } catch (err) {
      console.error('Failed loading data from IndexedDB:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auth Handlers
  const handleLoginSuccess = (user: AppUser) => {
    setCurrentUserSession(user);
    setCurrentUser(user);
    setImpersonator(null);
    setIsLoginOpen(false);
  };

  const handleLogout = () => {
    clearImpersonateSession();
    clearCurrentUserSession();
    setCurrentUser(null);
    setImpersonator(null);
    setIsLoginOpen(true);
  };

  const handleStartImpersonate = (operatorUser: AppUser) => {
    if (!currentUser) return;
    setImpersonateSession(currentUser, operatorUser);
    setImpersonator(currentUser);
    setCurrentUser(operatorUser);
    setActiveTab('siswa');
  };

  const handleStopImpersonating = () => {
    if (!impersonator) return;
    clearImpersonateSession();
    setCurrentUser(impersonator);
    setImpersonator(null);
    setActiveTab('users');
  };

  // Handle Save Siswa (Add or Edit)
  const handleSaveSiswa = async (siswaData: Siswa) => {
    await saveSiswa(siswaData);
    await loadData();
    setIsFormOpen(false);
    setEditingSiswa(null);
  };

  // Handle Delete Siswa
  const handleDeleteSiswa = async (id: string) => {
    const student = (siswaList || []).find((s) => s.id === id);
    const nama = student?.namaLengkap || 'siswa';
    if (confirm(`Apakah Anda yakin ingin menghapus data "${nama}" dari Buku Induk?`)) {
      await deleteSiswa(id);
      await loadData();
      if (detailSiswa?.id === id) setDetailSiswa(null);
      if (printSiswa?.id === id) setPrintSiswa(null);
    }
  };

  // Handle Reset to Sample Data
  const handleResetSample = async () => {
    await resetToInitialData();
    await loadData();
  };

  const handleUpdateSekolah = async (updated: SekolahProfile) => {
    setSekolah(updated);
    await saveSekolahProfile(updated);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased selection:bg-blue-100 selection:text-blue-900">
      {/* Top Header & Navigation */}
      <Navbar
        sekolah={sekolah}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        siswaCount={siswaList.length}
        currentUser={currentUser}
        impersonator={impersonator}
        onLogout={handleLogout}
        onStopImpersonating={handleStopImpersonating}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Memuat basis data Buku Induk Siswa...</p>
          </div>
        ) : (
          <>
            {/* Dashboard Overview Cards */}
            <DashboardStats
              siswa={siswaList}
              lastSyncLog={syncLogs[0]}
              onOpenSync={() => setActiveTab('dapodik')}
            />

            {/* View: 1. Master Siswa */}
            {activeTab === 'siswa' && (
              <SiswaList
                siswa={siswaList}
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
                onOpenSync={() => setActiveTab('dapodik')}
                onResetSampleData={handleResetSample}
              />
            )}

            {/* View: Nilai Raport Kurikulum Merdeka */}
            {activeTab === 'raport' && (
              <NilaiRaportView
                siswaList={siswaList}
                sekolah={sekolah}
                currentUser={currentUser || undefined}
                onDataChanged={loadData}
              />
            )}

            {/* View: 2. Sinkron Dapodik */}
            {activeTab === 'dapodik' && (
              <DapodikSyncView
                config={dapodikConfig}
                sekolah={sekolah}
                onUpdateSekolah={handleUpdateSekolah}
                onConfigChange={setDapodikConfig}
                existingSiswa={siswaList}
                syncLogs={syncLogs}
                onRefreshData={loadData}
              />
            )}

            {/* View: 3. Rekapitulasi */}
            {activeTab === 'rekap' && (
              <RekapitulasiView
                siswa={siswaList}
                sekolah={sekolah}
              />
            )}

            {/* View: 4. Cetak Lembar Induk & Kartu Pelajar (Cetak Tab) */}
            {activeTab === 'cetak' && (
              <div className="space-y-6">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-4">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-700" />
                        Pusat Cetak Dokumen Buku Induk & Kartu Pelajar
                      </h2>
                      <p className="text-xs text-slate-500">
                        Pilih siswa di bawah ini untuk mencetak Lembar Buku Induk Standar Dinas atau Kartu Pelajar SMP.
                      </p>
                    </div>

                    <div className="relative w-full sm:w-72">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={cetakSearch}
                        onChange={(e) => setCetakSearch(e.target.value)}
                        placeholder="Cari siswa untuk dicetak..."
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Student Cards Grid for Printing */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {siswaList
                      .filter((s) => {
                        if (!cetakSearch.trim()) return true;
                        const q = cetakSearch.toLowerCase();
                        return (
                          s.namaLengkap.toLowerCase().includes(q) ||
                          s.nisn?.includes(q) ||
                          s.rombelSaatIni?.toLowerCase().includes(q)
                        );
                      })
                      .map((s) => (
                        <div
                          key={s.id}
                          className="bg-slate-50 hover:bg-blue-50/40 p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 transition flex items-center justify-between gap-3"
                        >
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
                              <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                                Rombel {s.rombelSaatIni}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col gap-1 shrink-0">
                            <button
                              onClick={() => setPrintSiswa(s)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              Cetak
                            </button>
                            <button
                              onClick={() => setDetailSiswa(s)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              Detail
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* View: 5. Profil Sekolah & Cadangan */}
            {activeTab === 'pengaturan' && (
              <PengaturanSekolahView
                sekolah={sekolah}
                currentUser={currentUser || undefined}
                dapodikConfig={dapodikConfig}
                onUpdateSekolah={handleUpdateSekolah}
                onDataChanged={loadData}
              />
            )}

            {/* View: 6. Manajemen Pengguna & Operator (Administrator Only) */}
            {activeTab === 'users' && currentUser?.role === 'administrator' && (
              <UserManagementView
                currentUser={currentUser}
                onImpersonate={handleStartImpersonate}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-4 sm:px-6 text-center text-xs text-slate-500 print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>
            Buku Induk Siswa {sekolah.jenjang || 'SMP'} • <strong>Kurikulum Merdeka {sekolah.jenjang === 'SD' ? '(Fase A, B, C)' : '(Fase D)'}</strong> & Sinkronisasi Web Service Dapodik Lokal
          </p>
          <p className="text-slate-400 text-[11px]">
            Mode Offline Terenkripsi (IndexedDB PWA) • Standar Kemdikbudristek RI
          </p>
        </div>
      </footer>

      {/* Authentication Modal Gate */}
      <LoginModal
        isOpen={isLoginOpen}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Modals */}
      {isFormOpen && (
        <SiswaFormModal
          initialData={editingSiswa}
          jenjang={sekolah.jenjang || 'SMP'}
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

      {printSiswa && (
        <CetakBukuInduk
          siswa={printSiswa}
          sekolah={sekolah}
          onClose={() => setPrintSiswa(null)}
        />
      )}
    </div>
  );
}
