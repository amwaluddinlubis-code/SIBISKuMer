import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Download, 
  Upload, 
  Cloud, 
  HardDrive, 
  RefreshCw, 
  Trash2, 
  ShieldAlert, 
  CheckCircle2, 
  AlertCircle, 
  FileJson, 
  Lock, 
  RotateCcw,
  LogOut,
  ExternalLink,
  Calendar,
  Layers,
  FileCheck
} from 'lucide-react';
import { SekolahProfile, AppUser } from '../types';
import { exportDatabaseBackup, importDatabaseBackup, resetToInitialData, clearDatabase } from '../utils/db';
import { 
  initDriveAuth, 
  signInWithGoogleDrive, 
  getDriveAccessToken, 
  signOutGoogleDrive,
  setDriveAccessToken
} from '../utils/googleDriveAuth';
import { 
  listDriveBackups, 
  uploadBackupToDrive, 
  downloadBackupFromDrive, 
  deleteBackupFromDrive, 
  DriveBackupFile 
} from '../utils/googleDriveService';
import { User } from 'firebase/auth';

interface BackupRestoreModuleProps {
  sekolah: SekolahProfile;
  currentUser?: AppUser | null;
  onDataChanged: () => void;
}

export const BackupRestoreModule: React.FC<BackupRestoreModuleProps> = ({
  sekolah,
  currentUser,
  onDataChanged
}) => {
  const isAdmin = currentUser?.role === 'administrator';

  // Google Drive state
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isDriveConnecting, setIsDriveConnecting] = useState(false);
  const [driveBackups, setDriveBackups] = useState<DriveBackupFile[]>([]);
  const [isLoadingDriveFiles, setIsLoadingDriveFiles] = useState(false);

  // Local state
  const [isExportingLocal, setIsExportingLocal] = useState(false);
  const [isImportingLocal, setIsImportingLocal] = useState(false);

  // Drive actions state
  const [isUploadingDrive, setIsUploadingDrive] = useState(false);
  const [processingFileId, setProcessingFileId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Listen to Firebase auth state for Google Drive
  useEffect(() => {
    const unsubscribe = initDriveAuth(
      (user, token) => {
        setGoogleUser(user);
        setGoogleToken(token);
        fetchDriveBackups(token);
      },
      () => {
        setGoogleUser(null);
        setGoogleToken(null);
        setDriveBackups([]);
      }
    );

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const showStatus = (type: 'success' | 'error' | 'info', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => {
      setStatusMessage(null);
    }, 6000);
  };

  const fetchDriveBackups = async (token: string) => {
    try {
      setIsLoadingDriveFiles(true);
      const files = await listDriveBackups(token);
      setDriveBackups(files);
    } catch (err: any) {
      console.error('Error fetching drive backups:', err);
      showStatus('error', `Gagal memuat daftar cadangan dari Google Drive: ${err.message}`);
    } finally {
      setIsLoadingDriveFiles(false);
    }
  };

  const handleConnectDrive = async () => {
    try {
      setIsDriveConnecting(true);
      const res = await signInWithGoogleDrive();
      setGoogleUser(res.user);
      setGoogleToken(res.accessToken);
      showStatus('success', `Terhubung ke Google Drive sebagai ${res.user.email}`);
      await fetchDriveBackups(res.accessToken);
    } catch (err: any) {
      console.error('Failed to connect Google Drive:', err);
      showStatus('error', `Gagal menghubungkan Google Drive: ${err.message}`);
    } finally {
      setIsDriveConnecting(false);
    }
  };

  const handleDisconnectDrive = async () => {
    try {
      await signOutGoogleDrive();
      setGoogleUser(null);
      setGoogleToken(null);
      setDriveBackups([]);
      showStatus('info', 'Koneksi Google Drive telah diputuskan.');
    } catch (err: any) {
      showStatus('error', `Gagal memutus Google Drive: ${err.message}`);
    }
  };

  // Local Backup: Download JSON file
  const handleExportLocal = async () => {
    try {
      setIsExportingLocal(true);
      const jsonStr = await exportDatabaseBackup();
      const schoolName = (sekolah.nama || 'Sekolah').replace(/[^a-zA-Z0-9]/g, '_');
      const dateStr = new Date().toISOString().slice(0, 10);
      const timeStr = new Date().toTimeString().slice(0, 5).replace(':', '-');
      const filename = `Backup_BukuInduk_${schoolName}_${dateStr}_${timeStr}.json`;

      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showStatus('success', `Cadangan lokal berhasil diunduh (${filename}).`);
    } catch (err: any) {
      showStatus('error', `Gagal membuat cadangan lokal: ${err.message}`);
    } finally {
      setIsExportingLocal(false);
    }
  };

  // Local Restore: Select JSON file from computer
  const handleImportLocal = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm(`Peringatan: Memulihkan cadangan "${file.name}" akan menimpa data siswa dan konfigurasi yang ada. Lanjutkan pemulihan?`)) {
      e.target.value = '';
      return;
    }

    try {
      setIsImportingLocal(true);
      const text = await file.text();
      const res = await importDatabaseBackup(text);
      if (res.success) {
        showStatus('success', res.message);
        onDataChanged();
      } else {
        showStatus('error', `Gagal memulihkan data: ${res.message}`);
      }
    } catch (err: any) {
      showStatus('error', `Gagal memproses file cadangan lokal: ${err.message}`);
    } finally {
      setIsImportingLocal(false);
      e.target.value = '';
    }
  };

  // Google Drive: Backup current DB to Drive
  const handleBackupToDrive = async () => {
    const token = googleToken || getDriveAccessToken();
    if (!token) {
      showStatus('error', 'Silakan hubungkan akun Google Drive terlebih dahulu.');
      return;
    }

    try {
      setIsUploadingDrive(true);
      const jsonStr = await exportDatabaseBackup();
      const schoolName = (sekolah.nama || 'Sekolah').replace(/[^a-zA-Z0-9]/g, '_');
      const dateStr = new Date().toISOString().slice(0, 10);
      const timeStr = new Date().toTimeString().slice(0, 5).replace(':', '-');
      const filename = `Backup_BukuInduk_${schoolName}_${dateStr}_${timeStr}.json`;

      const uploaded = await uploadBackupToDrive(
        token,
        filename,
        jsonStr,
        `Cadangan Database Buku Induk Siswa - ${sekolah.nama || 'SMP/SD'} (Diekspor: ${new Date().toLocaleString('id-ID')})`
      );

      showStatus('success', `Berhasil mencadangkan database ke Google Drive: "${uploaded.name}".`);
      await fetchDriveBackups(token);
    } catch (err: any) {
      console.error('Failed to backup to drive:', err);
      showStatus('error', `Gagal mencadangkan ke Google Drive: ${err.message}`);
    } finally {
      setIsUploadingDrive(false);
    }
  };

  // Google Drive: Restore from selected Drive file
  const handleRestoreFromDrive = async (file: DriveBackupFile) => {
    const token = googleToken || getDriveAccessToken();
    if (!token) {
      showStatus('error', 'Silakan hubungkan akun Google Drive terlebih dahulu.');
      return;
    }

    if (!confirm(`Konfirmasi Pemulihan: Apakah Anda yakin ingin memulihkan database dari file Google Drive "${file.name}"?\nData lokal yang ada saat ini akan diperbarui sesuai arsip tersebut.`)) {
      return;
    }

    try {
      setProcessingFileId(file.id);
      const jsonStr = await downloadBackupFromDrive(token, file.id);
      const res = await importDatabaseBackup(jsonStr);
      if (res.success) {
        showStatus('success', `Berhasil memulihkan dari Google Drive: ${res.message}`);
        onDataChanged();
      } else {
        showStatus('error', `Gagal memulihkan: ${res.message}`);
      }
    } catch (err: any) {
      console.error('Failed to restore from drive:', err);
      showStatus('error', `Gagal mengunduh atau memulihkan dari Google Drive: ${err.message}`);
    } finally {
      setProcessingFileId(null);
    }
  };

  // Google Drive: Delete file from Drive
  const handleDeleteFromDrive = async (file: DriveBackupFile) => {
    const token = googleToken || getDriveAccessToken();
    if (!token) return;

    if (!confirm(`Hapus file cadangan "${file.name}" dari Google Drive secara permanen?`)) {
      return;
    }

    try {
      setProcessingFileId(file.id);
      await deleteBackupFromDrive(token, file.id);
      showStatus('success', `File cadangan "${file.name}" berhasil dihapus dari Google Drive.`);
      setDriveBackups((prev) => prev.filter((f) => f.id !== file.id));
    } catch (err: any) {
      showStatus('error', `Gagal menghapus file dari Google Drive: ${err.message}`);
    } finally {
      setProcessingFileId(null);
    }
  };

  // Reset to sample data
  const handleResetSample = async () => {
    if (!isAdmin) {
      alert('Tindakan ini memerlukan hak akses Administrator.');
      return;
    }
    if (confirm('Kembalikan database ke data contoh Kurikulum Merdeka? Data kustom akan digantikan dengan data sampel.')) {
      await resetToInitialData();
      onDataChanged();
      showStatus('success', 'Data contoh Kurikulum Merdeka berhasil dimuat kembali!');
    }
  };

  // Clear all data
  const handleClearAll = async () => {
    if (!isAdmin) {
      alert('Tindakan ini memerlukan hak akses Administrator.');
      return;
    }
    const input = prompt('PERINGATAN KRUSIAL: Seluruh data siswa dan riwayat akan dihapus permanen!\nKetik "HAPUS" untuk melanjutkan:');
    if (input === 'HAPUS') {
      await clearDatabase();
      onDataChanged();
      showStatus('info', 'Database aplikasi telah dikosongkan.');
    }
  };

  // If user is not an administrator, block access and explain
  if (!isAdmin) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-xl mx-auto shadow-xs">
        <div className="w-16 h-16 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center mx-auto mb-4 text-amber-600">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-base font-bold text-slate-900">Akses Dibatasi Khusus Administrator</h3>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          Modul <strong>Cadangan & Pemulihan Database</strong> (Lokal Komputer & Google Drive Cloud) berisi arsip menyeluruh data induk peserta didik, akun pengguna, dan konfigurasi rahasia sekolah sehingga hanya dapat diakses oleh pengguna dengan peran <strong>Administrator</strong>.
        </p>
        <div className="mt-4 p-3 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-200 flex items-center justify-center gap-2">
          <span>Pengguna saat ini:</span>
          <strong className="text-slate-800">{currentUser?.namaLengkap || 'Tamu'}</strong>
          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full font-bold uppercase text-[10px]">
            {currentUser?.role || 'operator'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white p-6 rounded-2xl shadow-sm border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center shrink-0 text-indigo-300">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold tracking-wide text-white">
                  Pusat Cadangan & Pemulihan Database
                </h2>
                <span className="px-2.5 py-0.5 text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full">
                  Hak Akses Administrator
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Kelola arsip cadangan (backup) dan pemulihan (restore) database Buku Induk Siswa secara fleksibel: simpan langsung ke penyimpanan <strong>Lokal Komputer (.json)</strong> atau sinkronisasikan secara aman ke <strong>Google Drive Cloud</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right hidden sm:block">
              <span className="text-[11px] text-slate-400 block">Status Arsip</span>
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Siap Digunakan
              </span>
            </div>
          </div>
        </div>

        {/* Global Notification Banner */}
        {statusMessage && (
          <div className={`mt-4 p-3.5 rounded-xl text-xs flex items-center gap-2.5 transition animate-in fade-in ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-200' 
              : statusMessage.type === 'error'
              ? 'bg-rose-950/80 border border-rose-500/50 text-rose-200'
              : 'bg-blue-950/80 border border-blue-500/50 text-blue-200'
          }`}>
            {statusMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {statusMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            {statusMessage.type === 'info' && <Layers className="w-4 h-4 text-blue-400 shrink-0" />}
            <span className="font-medium">{statusMessage.text}</span>
          </div>
        )}
      </div>

      {/* Grid: 2 Utama (Lokal vs Google Drive) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* MODUL 1: CADANGAN & PEMULIHAN LOKAL */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Penyimpanan Lokal Komputer</h3>
                  <p className="text-[11px] text-slate-500">Berkas arsip mandiri berformat JSON</p>
                </div>
              </div>
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-[10px] font-bold border border-blue-100">
                Offline Friendly
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-5">
              Ekspor seluruh basis data aplikasi (termasuk identitas satuan pendidikan, master peserta didik, capaian raport, akun pengguna, dan log integrasi) ke satu berkas file JSON terstruktur. File dapat disimpan di flashdisk, hard disk, atau media arsip sekolah lainnya.
            </p>

            <div className="space-y-4">
              {/* Unduh Cadangan Lokal */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 transition">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                      <Download className="w-4 h-4 text-blue-700" />
                      Cadangkan ke Komputer Lokal (Download .json)
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Menghasilkan file snapshot lengkap yang siap diunduh secara instan tanpa membutuhkan koneksi internet.
                    </p>
                  </div>
                  <button
                    onClick={handleExportLocal}
                    disabled={isExportingLocal}
                    className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 shrink-0 disabled:opacity-60 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isExportingLocal ? 'Menyiapkan...' : 'Unduh File'}</span>
                  </button>
                </div>
              </div>

              {/* Pulihkan Cadangan Lokal */}
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 transition">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-xs text-emerald-950 flex items-center gap-1.5">
                      <Upload className="w-4 h-4 text-emerald-700" />
                      Pulihkan dari Komputer Lokal (Upload .json)
                    </h4>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Pilih berkas cadangan .json dari komputer Anda untuk memulihkan seluruh data ke aplikasi.
                    </p>
                  </div>
                  <label className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 shrink-0 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isImportingLocal ? 'Memulihkan...' : 'Pilih Berkas'}</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportLocal}
                      disabled={isImportingLocal}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-[11px] text-slate-500 flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Format berkas cadangan kompatibel dengan skema baku IndexedDB Buku Induk Siswa.</span>
          </div>
        </div>

        {/* MODUL 2: CADANGAN & PEMULIHAN GOOGLE DRIVE */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Penyimpanan Google Drive Cloud</h3>
                  <p className="text-[11px] text-slate-500">Sinkronisasi arsip terenkripsi ke akun Google</p>
                </div>
              </div>
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md text-[10px] font-bold border border-indigo-100">
                Cloud Backup
              </span>
            </div>

            {/* Auth State Box */}
            {!googleUser ? (
              <div className="p-5 border border-dashed border-slate-300 rounded-xl bg-slate-50 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mx-auto">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900">Hubungkan Akun Google Drive</h4>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                    Otorisasikan akun Google Anda untuk menyimpan dan memulihkan cadangan database langsung melalui Google Drive API.
                  </p>
                </div>

                <button
                  onClick={handleConnectDrive}
                  disabled={isDriveConnecting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 shadow-xs transition cursor-pointer disabled:opacity-60"
                >
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  <span>{isDriveConnecting ? 'Menghubungkan...' : 'Masuk dengan Google'}</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Connected Account Bar */}
                <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 overflow-hidden">
                    {googleUser.photoURL ? (
                      <img 
                        src={googleUser.photoURL} 
                        alt="Avatar" 
                        referrerPolicy="no-referrer"
                        className="w-7 h-7 rounded-full object-cover border border-indigo-200" 
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-[10px]">
                        {googleUser.displayName?.[0] || 'G'}
                      </div>
                    )}
                    <div className="truncate">
                      <span className="font-bold text-indigo-950 block truncate">
                        {googleUser.displayName || 'Pengguna Google'}
                      </span>
                      <span className="text-[10px] text-indigo-700 block truncate">
                        {googleUser.email}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => googleToken && fetchDriveBackups(googleToken)}
                      title="Segarkan daftar file"
                      className="p-1.5 hover:bg-indigo-100 text-indigo-700 rounded-lg transition cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDriveFiles ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      onClick={handleDisconnectDrive}
                      title="Putus koneksi Google"
                      className="p-1.5 hover:bg-rose-100 text-rose-700 rounded-lg transition cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Upload to Drive Action Button */}
                <button
                  onClick={handleBackupToDrive}
                  disabled={isUploadingDrive}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  <Cloud className="w-4 h-4" />
                  <span>{isUploadingDrive ? 'Mengunggah ke Google Drive...' : 'Cadangkan Database Sekarang ke Google Drive'}</span>
                </button>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-indigo-600" />
              Izin terbatas (drive.file): Hanya membaca file aplikasi ini
            </span>
            {googleUser && (
              <span className="font-mono text-[10px] text-slate-400">
                {driveBackups.length} file ditemukan
              </span>
            )}
          </div>
        </div>
      </div>

      {/* DAFTAR FILE CADANGAN DI GOOGLE DRIVE */}
      {googleUser && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <FileJson className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="font-bold text-sm text-slate-900">Arsip Cadangan di Google Drive</h3>
                <p className="text-[11px] text-slate-500">
                  Daftar snapshot database yang tersimpan di Google Drive Anda
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => googleToken && fetchDriveBackups(googleToken)}
                disabled={isLoadingDriveFiles}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDriveFiles ? 'animate-spin' : ''}`} />
                <span>Segarkan</span>
              </button>
            </div>
          </div>

          {isLoadingDriveFiles ? (
            <div className="py-12 text-center text-slate-400 text-xs space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-600" />
              <p>Memuat daftar arsip dari Google Drive...</p>
            </div>
          ) : driveBackups.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-xs space-y-2 border border-dashed border-slate-200 rounded-xl">
              <Cloud className="w-8 h-8 mx-auto text-slate-300" />
              <p className="font-medium text-slate-600">Belum ada file cadangan di Google Drive Anda.</p>
              <p className="text-[11px] text-slate-400">
                Klik tombol <strong>"Cadangkan Database Sekarang ke Google Drive"</strong> di atas untuk membuat arsip awan pertama Anda.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {driveBackups.map((file) => {
                const isProcessing = processingFileId === file.id;
                const formattedDate = file.createdTime 
                  ? new Date(file.createdTime).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
                  : '-';

                return (
                  <div 
                    key={file.id} 
                    className="p-4 hover:bg-slate-50/80 transition flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                        <FileJson className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-xs text-slate-900 font-mono">
                            {file.name}
                          </h4>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {formattedDate}
                          </span>
                          {file.size && (
                            <span>• {(parseInt(file.size, 10) / 1024).toFixed(1)} KB</span>
                          )}
                          {file.description && (
                            <span className="text-slate-400 truncate max-w-xs">• {file.description}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                      {/* Restore Button */}
                      <button
                        onClick={() => handleRestoreFromDrive(file)}
                        disabled={isProcessing}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                        title="Pulihkan database dari file ini"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isProcessing ? 'Memproses...' : 'Pulihkan ke Aplikasi'}</span>
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={() => handleDeleteFromDrive(file)}
                        disabled={isProcessing}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer disabled:opacity-60"
                        title="Hapus dari Google Drive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Operasi Khusus Administrator: Muat Data Sampel & Kosongkan */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <ShieldAlert className="w-5 h-5 text-amber-600" />
          <div>
            <h3 className="font-bold text-sm text-slate-900">Pemeliharaan Tingkat Lanjut (Zona Berbahaya)</h3>
            <p className="text-[11px] text-slate-500">
              Pengaturan pembersihan menyeluruh atau pemuatan ulang data kurikulum awal
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleResetSample}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-semibold rounded-xl transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
              Muat Ulang Data Sampel Kurikulum Merdeka
            </button>

            <button
              onClick={handleClearAll}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-semibold rounded-xl transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              Kosongkan Seluruh Database
            </button>
          </div>

          <span className="text-[11px] text-slate-400">
            Aksi ini hanya dapat dieksekusi oleh Administrator.
          </span>
        </div>
      </div>
    </div>
  );
};
