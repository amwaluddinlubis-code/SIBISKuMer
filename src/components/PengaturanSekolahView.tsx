import React, { useState } from 'react';
import { 
  School, 
  Save, 
  Download, 
  Upload, 
  RotateCcw, 
  Trash2, 
  ShieldAlert, 
  Database,
  CheckCircle2,
  HardDrive,
  RefreshCw,
  Sparkles,
  Server,
  Lock
} from 'lucide-react';
import { SekolahProfile, AppUser, DapodikConfig, JenjangSekolah } from '../types';
import { saveSekolahProfile, exportDatabaseBackup, importDatabaseBackup, resetToInitialData, clearDatabase } from '../utils/db';
import { fetchDapodikSekolah, convertDapodikToSekolahProfile } from '../utils/dapodikSync';
import { defaultSekolahProfile, presetSekolahSD } from '../data/initialData';

interface PengaturanSekolahViewProps {
  sekolah: SekolahProfile;
  currentUser?: AppUser;
  dapodikConfig?: DapodikConfig;
  onUpdateSekolah: (profile: SekolahProfile) => void;
  onDataChanged: () => void;
}

export const PengaturanSekolahView: React.FC<PengaturanSekolahViewProps> = ({
  sekolah,
  currentUser,
  dapodikConfig,
  onUpdateSekolah,
  onDataChanged
}) => {
  const [profile, setProfile] = useState<SekolahProfile>(sekolah);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncingDapodik, setSyncingDapodik] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'administrator';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSekolahProfile(profile);
    onUpdateSekolah(profile);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleSyncSekolahFromDapodik = async (isSimulation = false) => {
    if (!dapodikConfig) {
      alert('Konfigurasi Web Service Dapodik belum tersedia.');
      return;
    }

    setSyncingDapodik(true);
    setSyncSuccessMsg(null);

    try {
      const res = await fetchDapodikSekolah(dapodikConfig, isSimulation);
      if (!res.success || !res.data) {
        throw new Error(res.error || 'Gagal menghubungi Web Service Dapodik.');
      }

      const updated = convertDapodikToSekolahProfile(res.data, profile);
      setProfile(updated);
      await saveSekolahProfile(updated);
      onUpdateSekolah(updated);

      setSyncSuccessMsg(`Identitas sekolah berhasil diperbarui dari Dapodik: ${updated.nama} (NPSN: ${updated.npsn}). Kepala Sekolah: ${updated.kepalaSekolah}.`);
      setTimeout(() => setSyncSuccessMsg(null), 6000);
    } catch (err: any) {
      alert(`Gagal sinkronisasi identitas sekolah: ${err.message}. Anda juga dapat menguji coba menggunakan simulasi.`);
    } finally {
      setSyncingDapodik(false);
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const jsonStr = await exportDatabaseBackup();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Backup_BukuInduk_${profile.nama.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Gagal membuat berkas cadangan: ${err.message}`);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('Peringatan: Memulihkan cadangan akan menimpa data yang ada. Lanjutkan?')) {
      e.target.value = '';
      return;
    }

    setImporting(true);
    try {
      const text = await file.text();
      const res = await importDatabaseBackup(text);
      if (res.success) {
        alert(res.message);
        onDataChanged();
      } else {
        alert(`Gagal memulihkan: ${res.message}`);
      }
    } catch (err: any) {
      alert(`Gagal membaca berkas: ${err.message}`);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const handleResetSample = async () => {
    if (!isAdmin) {
      alert('Tindakan ini memerlukan izin hak akses Administrator.');
      return;
    }
    if (confirm('Kembalikan database ke data contoh Kurikulum Merdeka SMP? Data kustom akan digantikan dengan data sampel.')) {
      await resetToInitialData();
      onDataChanged();
      alert('Data contoh Kurikulum Merdeka berhasil dimuat!');
    }
  };

  const handleClearAll = async () => {
    if (!isAdmin) {
      alert('Tindakan ini memerlukan izin hak akses Administrator.');
      return;
    }
    const input = prompt('PERINGATAN: Seluruh data siswa dan riwayat akan dihapus secara permanen dari browser ini!\nKetik "HAPUS" untuk konfirmasi:');
    if (input === 'HAPUS') {
      await clearDatabase();
      onDataChanged();
      alert('Database telah dikosongkan.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Dapodik School Sync Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-5 rounded-2xl shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/40 border border-blue-400/40 flex items-center justify-center shrink-0 text-amber-300">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">
                  Otomatisasi Identitas Sekolah dari Dapodik
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-700 text-blue-100 rounded-full">
                  Sinkronisasi Web Service
                </span>
              </div>
              <p className="text-xs text-blue-200 mt-1 max-w-2xl leading-relaxed">
                Identitas resmi satuan pendidikan (Nama Sekolah, NPSN, NSS, Alamat Lengkap, Kepala Sekolah & NIP, serta Tahun Ajaran) dapat ditarik langsung dari aplikasi Dapodik lokal sehingga data selalu konsisten dengan database pusat Kemendikdasmen.
              </p>
              {profile.lastSyncedWithDapodik && (
                <p className="text-[11px] text-blue-300 mt-1 flex items-center gap-1.5 font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Terakhir disinkronkan: {new Date(profile.lastSyncedWithDapodik).toLocaleString('id-ID')}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={syncingDapodik}
              onClick={() => handleSyncSekolahFromDapodik(false)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 transition disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingDapodik ? 'animate-spin' : ''}`} />
              <span>{syncingDapodik ? 'Menghubungi Dapodik...' : 'Tarik dari Dapodik Lokal'}</span>
            </button>
            <button
              type="button"
              disabled={syncingDapodik}
              onClick={() => handleSyncSekolahFromDapodik(true)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Simulasi Tarik</span>
            </button>
          </div>
        </div>

        {syncSuccessMsg && (
          <div className="mt-4 p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-xs text-emerald-200 flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{syncSuccessMsg}</span>
          </div>
        )}
      </div>

      {/* Profil Sekolah Form */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <School className="w-5 h-5 text-blue-700" />
            <div>
              <h3 className="font-bold text-sm text-slate-900">
                Formulir Identitas Satuan Pendidikan ({profile.jenjang || 'SMP'})
              </h3>
              <p className="text-[11px] text-slate-500">
                Informasi ini digunakan sebagai kop surat resmi pada Lembar Buku Induk, Lembar Nilai Raport, Rekapitulasi, & Kartu Pelajar
              </p>
            </div>
          </div>

          {savedSuccess && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Tersimpan!
            </span>
          )}
        </div>

        {/* Quick Switcher SD vs SMP */}
        <div className="mb-5 p-4 rounded-xl bg-blue-50/70 border border-blue-200 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div>
            <span className="font-bold text-blue-950 block text-xs">
              Fleksibilitas Jenjang Satuan Pendidikan: SD & SMP Kurikulum Merdeka
            </span>
            <p className="text-slate-600 text-[11px] mt-0.5">
              Aplikasi ini mendukung jenjang SD (Fase A, B, C / Kelas 1-6) dan SMP (Fase D / Kelas 7-9) dengan template nilai raport, mata pelajaran, dan riwayat multi-tahun yang adaptif.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setProfile({ ...presetSekolahSD });
              }}
              className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                profile.jenjang === 'SD'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
              }`}
            >
              <span>Preset SD (Kelas 1-6)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setProfile({ ...defaultSekolahProfile });
              }}
              className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                profile.jenjang === 'SMP'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
              }`}
            >
              <span>Preset SMP (Kelas 7-9)</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Nama Satuan Pendidikan *</label>
              <input
                type="text"
                required
                value={profile.nama}
                onChange={(e) => setProfile({ ...profile, nama: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl uppercase font-bold focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Jenjang Sekolah *</label>
              <select
                value={profile.jenjang || 'SMP'}
                onChange={(e) => {
                  const newJenjang = e.target.value as JenjangSekolah;
                  setProfile({
                    ...profile,
                    jenjang: newJenjang,
                    bentukPendidikan: newJenjang
                  });
                }}
                className="w-full px-3 py-2 border border-blue-300 bg-blue-50/50 rounded-xl font-bold text-blue-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
              >
                <option value="SD">SD (Sekolah Dasar / Kelas 1-6)</option>
                <option value="SMP">SMP (Sekolah Menengah Pertama / Kelas 7-9)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">NPSN *</label>
              <input
                type="text"
                required
                value={profile.npsn}
                onChange={(e) => setProfile({ ...profile, npsn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">NSS (Nomor Statistik Sekolah)</label>
              <input
                type="text"
                value={profile.nss}
                onChange={(e) => setProfile({ ...profile, nss: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tahun Ajaran Aktif</label>
              <input
                type="text"
                value={profile.tahunAjaran}
                onChange={(e) => setProfile({ ...profile, tahunAjaran: e.target.value })}
                placeholder="2024/2025"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Semester Aktif</label>
              <select
                value={profile.semesterAktif}
                onChange={(e) => setProfile({ ...profile, semesterAktif: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
              >
                <option value="1 (Ganjil)">1 (Ganjil)</option>
                <option value="2 (Genap)">2 (Genap)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Bentuk Pendidikan</label>
              <input
                type="text"
                value={profile.bentukPendidikan}
                onChange={(e) => setProfile({ ...profile, bentukPendidikan: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Status Sekolah</label>
              <select
                value={profile.statusSekolah}
                onChange={(e) => setProfile({ ...profile, statusSekolah: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
              >
                <option value="Negeri">Negeri</option>
                <option value="Swasta">Swasta</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Alamat Jalan & Kompleks *</label>
            <input
              type="text"
              required
              value={profile.alamat}
              onChange={(e) => setProfile({ ...profile, alamat: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Desa / Kelurahan</label>
              <input
                type="text"
                value={profile.desaKelurahan}
                onChange={(e) => setProfile({ ...profile, desaKelurahan: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Kecamatan</label>
              <input
                type="text"
                value={profile.kecamatan}
                onChange={(e) => setProfile({ ...profile, kecamatan: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Kabupaten / Kota</label>
              <input
                type="text"
                value={profile.kabupatenKota}
                onChange={(e) => setProfile({ ...profile, kabupatenKota: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Provinsi</label>
              <input
                type="text"
                value={profile.provinsi}
                onChange={(e) => setProfile({ ...profile, provinsi: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Kode Pos</label>
              <input
                type="text"
                value={profile.kodePos}
                onChange={(e) => setProfile({ ...profile, kodePos: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nomor Telepon</label>
              <input
                type="text"
                value={profile.telepon}
                onChange={(e) => setProfile({ ...profile, telepon: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email Resmi</label>
              <input
                type="email"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
          </div>

          {/* Pejabat Penandatangan */}
          <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <h4 className="font-bold text-slate-900">Kepala Sekolah (Penandatangan I)</h4>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Lengkap & Gelar</label>
                <input
                  type="text"
                  value={profile.kepalaSekolah}
                  onChange={(e) => setProfile({ ...profile, kepalaSekolah: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">NIP Kepala Sekolah</label>
                <input
                  type="text"
                  value={profile.nipKepalaSekolah}
                  onChange={(e) => setProfile({ ...profile, nipKepalaSekolah: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-mono"
                />
              </div>
            </div>

            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <h4 className="font-bold text-slate-900">Petugas Pengelola Buku Induk (Penandatangan II)</h4>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Petugas / Tata Usaha</label>
                <input
                  type="text"
                  value={profile.petugasBukuInduk}
                  onChange={(e) => setProfile({ ...profile, petugasBukuInduk: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">NIP Petugas</label>
                <input
                  type="text"
                  value={profile.nipPetugas}
                  onChange={(e) => setProfile({ ...profile, nipPetugas: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-mono"
                />
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl shadow-xs transition cursor-pointer"
            >
              <Save className="w-4 h-4" />
              Simpan Profil Sekolah
            </button>
          </div>
        </form>
      </div>

      {/* Database Backup, Restore & Reset Section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Database className="w-5 h-5 text-indigo-700" />
          <div>
            <h3 className="font-bold text-sm text-slate-900">Cadangan & Pemulihan Data Offline</h3>
            <p className="text-[11px] text-slate-500">
              Simpan berkas cadangan ke komputer lokal Anda untuk keamanan arsip jangka panjang
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {/* Export JSON */}
          <div className="p-4 border border-slate-200 rounded-xl bg-slate-50 space-y-2">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <Download className="w-4 h-4 text-blue-700" />
              Unduh Cadangan Database (.json)
            </h4>
            <p className="text-slate-600 text-[11px]">
              Menyimpan seluruh master siswa, profil sekolah, data pengguna, dan log Dapodik dalam satu berkas terenkripsi JSON.
            </p>
            <button
              onClick={handleDownloadBackup}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-xl shadow-xs transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Unduh Berkas Cadangan
            </button>
          </div>

          {/* Import JSON */}
          <div className="p-4 border border-slate-200 rounded-xl bg-slate-50 space-y-2">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-emerald-700" />
              Pulihkan dari Berkas Cadangan (.json)
            </h4>
            <p className="text-slate-600 text-[11px]">
              Pilih berkas cadangan yang pernah Anda unduh untuk memulihkan seluruh data siswa ke browser ini.
            </p>
            <label className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-xl shadow-xs transition cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              {importing ? 'Memproses...' : 'Pilih Berkas Cadangan'}
              <input
                type="file"
                accept=".json"
                onChange={handleFileImport}
                disabled={importing}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Reset / Clear Actions */}
        <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          {isAdmin ? (
            <>
              <button
                onClick={handleResetSample}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-semibold rounded-xl transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                Muat Ulang Data Sampel Kurikulum Merdeka
              </button>

              <button
                onClick={handleClearAll}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-semibold rounded-xl transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                Kosongkan Database
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 text-slate-500 text-[11px] p-2 bg-slate-50 rounded-lg border border-slate-200 w-full">
              <Lock className="w-3.5 h-3.5 text-amber-600" />
              <span>
                Operasi pengosongan database & muat ulang data sampel dibatasi khusus untuk akun <strong>Administrator</strong>.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
