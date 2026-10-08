import React, { useState, useRef } from 'react';
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
  Lock,
  ImagePlus,
  Stamp,
  Palette,
  Moon,
  Type,
  SunMoon
} from 'lucide-react';
import { useTheme, UkuranFont } from '../context/ThemeContext';
import { SekolahProfile, AppUser, DapodikConfig, JenjangSekolah, SchoolEntry, KopSurat, TemaMode } from '../types';
import { saveSekolahProfile, exportDatabaseBackup, importDatabaseBackup, resetToInitialData, clearDatabase, getActiveSchool, saveSchoolEntry } from '../utils/db';
import { fetchDapodikSekolah, convertDapodikToSekolahProfile } from '../utils/dapodikSync';
import { toast, confirmDialog } from '../utils/notify';
import { validateSekolahProfile } from '../utils/validation';
import { validateKop, getKop, resolveKop } from '../utils/kop';
import { resolveTemaEfektif, TEMA_LABEL } from '../utils/tema';
import { processLogoImage, formatKb, MAX_LOGO_BYTES } from '../utils/photo';
import { KopSuratView } from './KopSuratView';
import { startTopProgress, doneTopProgress } from '../utils/progress';

interface PengaturanSekolahViewProps {
  sekolah: SekolahProfile;
  currentUser?: AppUser;
  dapodikConfig?: DapodikConfig;
  /** Sesi tahun ajaran login — dibedakan dari tahun aktif database. */
  sessionTahun?: string | null;
  onUpdateSekolah: (profile: SekolahProfile) => void;
  onDataChanged: () => void;
  schools?: SchoolEntry[];
  activeSchoolId?: string | null;
  schoolSiswaCounts?: Record<string, number | null>;
  switchingSchoolId?: string | null;
  onSwitchSchool?: (id: string) => void;
  onManageSchools?: () => void;
}

export const PengaturanSekolahView: React.FC<PengaturanSekolahViewProps> = ({
  sekolah,
  currentUser,
  dapodikConfig,
  sessionTahun,
  onUpdateSekolah,
  onDataChanged,
  schools,
  activeSchoolId,
  schoolSiswaCounts,
  switchingSchoolId,
  onSwitchSchool,
  onManageSchools
}) => {
  const [profile, setProfile] = useState<SekolahProfile>(sekolah);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncingDapodik, setSyncingDapodik] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState<'kiri' | 'kanan' | null>(null);
  const logoKiriRef = useRef<HTMLInputElement>(null);
  const logoKananRef = useRef<HTMLInputElement>(null);

  const isAdmin = currentUser?.role === 'administrator';
  const kop: KopSurat = getKop(profile);
  // Tampilan (mode malam & ukuran huruf) — cakupan perangkat, bukan per sekolah.
  const { mode, ukuranFont, setUkuranFont, toggleMode } = useTheme();

  const updateKop = (patch: Partial<KopSurat>) => {
    setProfile((prev) => ({ ...prev, kop: { ...getKop(prev), ...patch } }));
  };

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>, sisi: 'kiri' | 'kanan') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingLogo(sisi);
    startTopProgress();
    try {
      const { dataUrl, bytes } = await processLogoImage(file);
      updateKop(sisi === 'kiri' ? { logoKiriUrl: dataUrl } : { logoKananUrl: dataUrl, logoKananMode: 'gambar' });
      toast(`Logo ${sisi} tersimpan (${formatKb(bytes)} / maks ${formatKb(MAX_LOGO_BYTES)}). Klik "Simpan Profil Sekolah" untuk menerapkan.`, 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Gagal memproses logo.', 'error');
    } finally {
      setUploadingLogo(null);
      doneTopProgress();
    }
  };

  const handleAutoKop = () => {
    const kabBersih = (profile.kabupatenKota || '').trim().replace(/^(kab\.?|kota)\s+/i, '');
    const baris1 =
      kop.otoritas === 'provinsi'
        ? `PEMERINTAH ${(profile.provinsi || '').trim().toUpperCase() || 'DAERAH'}`
        : kop.otoritas === 'kota'
          ? `PEMERINTAH KOTA${kabBersih ? ` ${kabBersih.toUpperCase()}` : ''}`
          : `PEMERINTAH KABUPATEN${kabBersih ? ` ${kabBersih.toUpperCase()}` : ''}`;
    updateKop({
      baris1,
      baris2: 'DINAS PENDIDIKAN DAN KEBUDAYAAN',
    });
    toast('Baris kop diisi otomatis dari profil. Simpan untuk menerapkan.', 'info');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const issues = validateSekolahProfile(profile);
    if (issues.length > 0) {
      toast(issues[0], 'error');
      return;
    }
    // Fondasi sesi: perubahan tahun aktif database berdampak ke seluruh sesi.
    if ((profile.tahunAjaran || '').trim() !== (sekolah.tahunAjaran || '').trim()) {
      const ok = await confirmDialog(
        `Ubah tahun aktif database dari ${sekolah.tahunAjaran || '-'} ke ${profile.tahunAjaran}? Sesi login berjalan (${sessionTahun || '-'}) tidak ikut berpindah otomatis.`,
        { confirmLabel: 'Ya, Ubah Tahun Aktif', danger: true }
      );
      if (!ok) return;
    }
    const kopIssues = validateKop(getKop(profile));
    if (kopIssues.length > 0) {
      toast(kopIssues[0], 'error');
      return;
    }
    startTopProgress();
    try {
      await saveSekolahProfile(profile);
      onUpdateSekolah(profile);
      // Jaga registry multi-sekolah tetap selaras (nama/NPSN/jenjang untuk pemilih sekolah).
      const active = getActiveSchool();
      if (active) {
        saveSchoolEntry({
          ...active,
          nama: profile.nama,
          npsn: profile.npsn,
          jenjang: profile.jenjang || active.jenjang,
          bentukPendidikan: profile.bentukPendidikan,
        });
      }
      setSavedSuccess(true);
      toast('Profil sekolah berhasil disimpan.', 'success');
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: unknown) {
      toast(`Gagal menyimpan profil sekolah: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      doneTopProgress();
    }
  };

  const handleSyncSekolahFromDapodik = async (isSimulation = false) => {
    if (!dapodikConfig) {
      toast('Konfigurasi Web Service Dapodik belum tersedia.', 'warning');
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
      // F4: tarikan identitas Dapodik tidak boleh mengubah tahun/semester
      // aktif secara diam-diam (berbahaya bila Dapodik belum rollover —
      // tahun aktif bisa mundur tanpa disadari). Bila tahun/semester dari
      // Dapodik berbeda dengan profil aktif, minta konfirmasi eksplisit via
      // ConfirmDialogHost; default = TIDAK diubah.
      const taBaru = (updated.tahunAjaran || '').trim();
      const taAktif = (profile.tahunAjaran || '').trim();
      const smBaru = (updated.semesterAktif || '').trim();
      const smAktif = (profile.semesterAktif || '').trim();
      const taBerubah = !!taBaru && taBaru !== taAktif;
      const smBerubah = !!smBaru && smBaru !== smAktif;
      let finalProfile = updated;
      if (taBerubah || smBerubah) {
        const ok = await confirmDialog(
          `Data Dapodik membawa ${taBerubah ? `tahun ajaran ${taBaru}` : ''}${taBerubah && smBerubah ? ' dan ' : ''}${smBerubah ? `semester ${smBaru}` : ''}, berbeda dengan profil aktif (TA ${taAktif || '-'}, semester ${smAktif || '-'}).\n\nUbah tahun/semester aktif mengikuti Dapodik? Bila Dapodik belum rollover sebaiknya TIDAK — pilih Batal agar tahun/semester aktif tetap.`,
          { confirmLabel: 'Ya, Ikuti Dapodik', cancelLabel: 'Batal (Tetap)', danger: true }
        );
        if (!ok) {
          // Default aman: pertahankan tahun/semester aktif.
          finalProfile = {
            ...updated,
            tahunAjaran: taBerubah ? profile.tahunAjaran : updated.tahunAjaran,
            semesterAktif: smBerubah ? profile.semesterAktif : updated.semesterAktif,
          };
        }
      }
      setProfile(finalProfile);
      await saveSekolahProfile(finalProfile);
      onUpdateSekolah(finalProfile);

      const active = getActiveSchool();
      if (active) {
        saveSchoolEntry({
          ...active,
          nama: finalProfile.nama,
          npsn: finalProfile.npsn,
          jenjang: finalProfile.jenjang || active.jenjang,
          bentukPendidikan: finalProfile.bentukPendidikan,
        });
      }

      setSyncSuccessMsg(`Identitas sekolah berhasil diperbarui dari Dapodik: ${finalProfile.nama} (NPSN: ${finalProfile.npsn}). Kepala Sekolah: ${finalProfile.kepalaSekolah}.`);
      setTimeout(() => setSyncSuccessMsg(null), 6000);
    } catch (err: any) {
      toast(`Gagal sinkronisasi identitas sekolah: ${err.message}. Anda juga dapat menguji coba menggunakan simulasi.`, 'error');
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
      toast(`Gagal membuat berkas cadangan: ${err.message}`, 'error');
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!(await confirmDialog('Peringatan: Memulihkan cadangan akan menimpa data yang ada. Lanjutkan?', { confirmLabel: 'Ya, Pulihkan' }))) {
      e.target.value = '';
      return;
    }

    setImporting(true);
    try {
      const text = await file.text();
      const res = await importDatabaseBackup(text);
      if (res.success) {
        toast(res.message, 'success');
        onDataChanged();
      } else {
        toast(`Gagal memulihkan: ${res.message}`, 'error');
      }
    } catch (err: any) {
      toast(`Gagal membaca berkas: ${err.message}`, 'error');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const handleResetSample = async () => {
    if (!isAdmin) {
      toast('Tindakan ini memerlukan izin hak akses Administrator.', 'error');
      return;
    }
    if (await confirmDialog('Kembalikan database ke data contoh Kurikulum Merdeka? Data kustom akan digantikan dengan data sampel.', { confirmLabel: 'Ya, Kembalikan' })) {
      await resetToInitialData();
      onDataChanged();
      toast('Data contoh Kurikulum Merdeka berhasil dimuat!', 'success');
    }
  };

  const handleClearAll = async () => {
    if (!isAdmin) {
      toast('Tindakan ini memerlukan izin hak akses Administrator.', 'error');
      return;
    }
    const ok = await confirmDialog('PERINGATAN: Seluruh data siswa dan riwayat akan dihapus secara permanen dari browser ini! Lanjutkan penghapusan?', { confirmLabel: 'Ya, Hapus Semua' });
    if (ok) {
      await clearDatabase();
      onDataChanged();
      toast('Database telah dikosongkan.', 'success');
    }
  };

  return (
    <div className="space-y-6">
      {/* Multi-sekolah / multi-database (admin) */}
      {isAdmin && schools && schools.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-navy-900 text-gold-300 flex items-center justify-center shrink-0">
                <Database className="w-4 h-4" />
              </span>
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  Multi-Sekolah Aktif ({schools.length} database)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Tiap sekolah terisolasi di database IndexedDB sendiri. Beralih tanpa login ulang bila username sama tersedia.
                </p>
              </div>
            </div>
            {onManageSchools && (
              <button
                type="button"
                onClick={onManageSchools}
                className="px-4 py-2 bg-navy-900 hover:bg-navy-800 text-white text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Kelola multi-sekolah
              </button>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {schools.map((s) => {
              const isActive = s.id === (activeSchoolId || schools[0]?.id);
              const busy = switchingSchoolId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={isActive || !!switchingSchoolId || !onSwitchSchool}
                  onClick={() => onSwitchSchool?.(s.id)}
                  title={isActive ? 'Sekolah aktif' : `Beralih ke ${s.nama}`}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border transition cursor-pointer disabled:cursor-default ${
                    isActive
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-blue-300 hover:text-navy-900'
                  }`}
                >
                  <span className={`px-1.5 py-px rounded text-[10px] font-extrabold ${isActive ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    {s.jenjang}
                  </span>
                  <span className="max-w-44 truncate">{s.nama}</span>
                  <span className="font-mono font-semibold opacity-70">
                    {typeof schoolSiswaCounts?.[s.id] === 'number' ? `${schoolSiswaCounts?.[s.id]} siswa` : ''}
                  </span>
                  {busy && <RefreshCw className="w-3 h-3 animate-spin" />}
                  {isActive && <CheckCircle2 className="w-3.5 h-3.5" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
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
                Identitas resmi satuan pendidikan (Nama Sekolah, NPSN, NSS, Alamat Lengkap, Kepala Sekolah & NIP, serta Tahun Ajaran) dapat ditarik langsung dari aplikasi Dapodik lokal sehingga data selalu konsisten dengan database pusat Kemdikbudristek.
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
                required
                aria-required="true"
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
                aria-required="true"
                inputMode="numeric"
                minLength={8}
                maxLength={8}
                pattern="[0-9]{8}"
                title="NPSN harus 8 digit angka"
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
              <label className="block font-semibold text-slate-700 mb-1">Tahun Ajaran Aktif *</label>
              <input
                type="text"
                required
                aria-required="true"
                pattern="\d{4}/\d{4}"
                title="Format: TAHUN/TAHUN (cth. 2026/2027)"
                value={profile.tahunAjaran}
                onChange={(e) => setProfile({ ...profile, tahunAjaran: e.target.value })}
                placeholder="2026/2027"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
              {sessionTahun && profile.tahunAjaran.trim() !== sessionTahun.trim() && (
                <p className="mt-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                  Sesi login Anda TA {sessionTahun} — tahun aktif database {profile.tahunAjaran || '-'}. Perubahan tahun aktif tidak memindahkan sesi; ganti sesi lewat menu pengguna di topbar.
                </p>
              )}
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Semester Aktif *</label>
              <select
                required
                aria-required="true"
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
                <label className="block font-semibold text-slate-700 mb-1">Nama Lengkap & Gelar *</label>
                <input
                  type="text"
                  required
                  aria-required="true"
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

      {/* Kop Surat Cetakan */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Stamp className="w-5 h-5 text-blue-700" />
            <div>
              <h3 className="font-bold text-sm text-slate-900">Kop Surat Cetakan</h3>
              <p className="text-[11px] text-slate-500">
                Berlaku untuk Lembar Buku Induk, Transkrip Raport, cetak Raport & Rekapitulasi. Kosongkan baris teks untuk otomatis dari profil.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAutoKop}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-700" />
            Isi otomatis dari profil
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Baris 1 kop (instansi pembina)</label>
              <input
                type="text"
                value={kop.baris1 || ''}
                maxLength={150}
                onChange={(e) => updateKop({ baris1: e.target.value })}
                placeholder={resolveKop({ ...profile, kop }).baris1}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl uppercase"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Baris 2 kop (dinas)</label>
              <input
                type="text"
                value={kop.baris2 || ''}
                maxLength={150}
                onChange={(e) => updateKop({ baris2: e.target.value })}
                placeholder={resolveKop({ ...profile, kop }).baris2}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl uppercase"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['tampilBaris1', 'Tampilkan baris 1'],
                ['tampilBaris2', 'Tampilkan baris 2'],
                ['tampilAlamat', 'Tampilkan alamat'],
                ['tampilKontak', 'Tampilkan kontak'],
              ] as ['tampilBaris1' | 'tampilBaris2' | 'tampilAlamat' | 'tampilKontak', string][]).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <input
                    type="checkbox"
                    checked={kop[key]}
                    onChange={(e) => updateKop({ [key]: e.target.checked } as Partial<KopSurat>)}
                    className="w-4 h-4 accent-blue-700"
                  />
                  <span className="font-medium text-slate-700">{label}</span>
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 cursor-pointer bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <input
                type="checkbox"
                checked={kop.tampilWebsite}
                onChange={(e) => updateKop({ tampilWebsite: e.target.checked })}
                className="w-4 h-4 accent-blue-700"
              />
              <span className="font-medium text-slate-700">Sertakan website di baris kontak</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Wilayah otomatis baris 1 (bila baris 1 dikosongkan)</label>
                <select
                  value={kop.otoritas}
                  onChange={(e) => updateKop({ otoritas: e.target.value as KopSurat['otoritas'] })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                >
                  <option value="kabupaten">Pemerintah Kabupaten … (cth. Madina)</option>
                  <option value="kota">Pemerintah Kota …</option>
                  <option value="provinsi">Pemerintah Provinsi …</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Jenis huruf judul</label>
                <select
                  value={kop.fontJudul}
                  onChange={(e) => updateKop({ fontJudul: e.target.value as KopSurat['fontJudul'] })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                >
                  <option value="serif">Serif tegas (standar dinas)</option>
                  <option value="sans">Sans modern</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ukuran nama sekolah</label>
                <select
                  value={kop.ukuranNama}
                  onChange={(e) => updateKop({ ukuranNama: e.target.value as KopSurat['ukuranNama'] })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                >
                  <option value="besar">Besar</option>
                  <option value="normal">Normal</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Garis bawah kop</label>
                <select
                  value={kop.garis}
                  onChange={(e) => updateKop({ garis: e.target.value as KopSurat['garis'] })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                >
                  <option value="ganda">Ganda (standar dinas)</option>
                  <option value="tunggal">Tunggal</option>
                  <option value="tanpa">Tanpa garis</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="border border-slate-200 rounded-xl p-3 space-y-2 bg-slate-50/60">
                <p className="font-bold text-slate-800">Logo kiri {kop.logoKiriUrl ? '(terpasang)' : '(generik)'}</p>
                {kop.logoKiriUrl && (
                  <img src={kop.logoKiriUrl} alt="Pratinjau logo kiri" className="w-16 h-16 object-contain bg-white border border-slate-200 rounded-xl" />
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={uploadingLogo === 'kiri'}
                    onClick={() => logoKiriRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-semibold rounded-xl transition cursor-pointer"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    {uploadingLogo === 'kiri' ? 'Memproses…' : 'Unggah'}
                  </button>
                  {kop.logoKiriUrl && (
                    <button
                      type="button"
                      onClick={() => updateKop({ logoKiriUrl: '' })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-600 font-semibold rounded-xl transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Hapus
                    </button>
                  )}
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                  <input
                    type="checkbox"
                    checked={kop.tampilLogoKiri}
                    onChange={(e) => updateKop({ tampilLogoKiri: e.target.checked })}
                    className="w-4 h-4 accent-blue-700"
                  />
                  <span>Tampilkan logo kiri</span>
                </label>
              </div>
              <div className="border border-slate-200 rounded-xl p-3 space-y-2 bg-slate-50/60">
                <p className="font-bold text-slate-800">Logo kanan</p>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Mode</label>
                  <select
                    value={kop.logoKananMode}
                    onChange={(e) => updateKop({ logoKananMode: e.target.value as KopSurat['logoKananMode'] })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                  >
                    <option value="badge">Lencana jenjang (bawaan)</option>
                    <option value="gambar">Gambar unggahan</option>
                    <option value="sembunyi">Sembunyikan</option>
                  </select>
                </div>
                {kop.logoKananMode === 'gambar' && (
                  <>
                    {kop.logoKananUrl && (
                      <img src={kop.logoKananUrl} alt="Pratinjau logo kanan" className="w-16 h-16 object-contain bg-white border border-slate-200 rounded-xl" />
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={uploadingLogo === 'kanan'}
                        onClick={() => logoKananRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-semibold rounded-xl transition cursor-pointer"
                      >
                        <ImagePlus className="w-3.5 h-3.5" />
                        {uploadingLogo === 'kanan' ? 'Memproses…' : 'Unggah'}
                      </button>
                      {kop.logoKananUrl && (
                        <button
                          type="button"
                          onClick={() => updateKop({ logoKananUrl: '' })}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-600 font-semibold rounded-xl transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Hapus
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
            <p className="text-[11px] text-slate-500">Logo: JPG/PNG/WebP, otomatis dikecilkan (sisi ≤ 512px) & dikompres ≤ 500 KB. Perubahan tersimpan bersama tombol "Simpan Profil Sekolah" di bawah.</p>
            <input ref={logoKiriRef} type="file" accept="image/*" className="hidden" aria-label="Unggah logo kiri kop" onChange={(e) => void handleLogoFile(e, 'kiri')} />
            <input ref={logoKananRef} type="file" accept="image/*" className="hidden" aria-label="Unggah logo kanan kop" onChange={(e) => void handleLogoFile(e, 'kanan')} />
          </div>
        </div>

        {/* Pratayang kop */}
        <div>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Pratayang langsung</p>
          <div className="border border-slate-200 rounded-xl bg-white p-4">
            <KopSuratView sekolah={profile} />
          </div>
        </div>
      </div>

      {/* Tema Warna Tampilan (khusus administrator) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Palette className="w-5 h-5 text-blue-700" />
          <div>
            <h3 className="font-bold text-sm text-slate-900">Tema Warna Tampilan</h3>
            <p className="text-[11px] text-slate-500">
              Aksen biru untuk SMP, maroon untuk SD. Hanya administrator yang dapat mengubah.
              Berlaku di layar (cetakan tidak ikut berubah).
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {(Object.keys(TEMA_LABEL) as TemaMode[]).map((mode) => {
            const aktif = (profile.tema?.mode || 'otomatis') === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setProfile((prev) => ({ ...prev, tema: { mode } }))}
                aria-pressed={aktif}
                className={`rounded-2xl border p-3.5 text-left transition cursor-pointer ${
                  aktif ? 'border-blue-600 ring-2 ring-blue-600/25 bg-blue-50/40' : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <span className="flex items-center gap-1.5 mb-2">
                  {mode === 'otomatis' && (
                    <>
                      <span className="w-5 h-5 rounded-full bg-blue-700 border-2 border-white shadow" />
                      <span className="w-5 h-5 rounded-full bg-[#7f1d1d] border-2 border-white shadow -ml-3" />
                    </>
                  )}
                  {mode === 'biru' && <span className="w-5 h-5 rounded-full bg-blue-700 border-2 border-white shadow" />}
                  {mode === 'maroon' && <span className="w-5 h-5 rounded-full bg-[#7f1d1d] border-2 border-white shadow" />}
                  <strong className="text-slate-900">{TEMA_LABEL[mode].judul}</strong>
                  {aktif && <CheckCircle2 className="w-4 h-4 text-blue-700 ml-auto" />}
                </span>
                <span className="text-slate-500 text-[11px] leading-snug block">{TEMA_LABEL[mode].desc}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-500">
          Efektif saat ini: <strong className="text-slate-800">{resolveTemaEfektif(profile) === 'maroon' ? 'Maroon' : 'Biru'}</strong>
          {' '}(jenjang {profile.jenjang || 'SMP'}). Klik "Simpan Profil Sekolah" di bawah untuk menerapkan.
        </p>
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

      {/* Tampilan: mode malam & ukuran huruf (cakupan perangkat) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <SunMoon className="w-5 h-5 text-blue-700" />
          <div>
            <h3 className="font-bold text-sm text-slate-900">Tampilan</h3>
            <p className="text-[11px] text-slate-500">
              Mode malam dan ukuran huruf. Berlaku di perangkat ini saja — tersimpan di browser, bukan per sekolah.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {/* Mode malam */}
          <div className="p-4 border border-slate-200 rounded-xl bg-slate-50 space-y-3">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <Moon className="w-4 h-4 text-blue-700" />
              Mode Malam
            </h4>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-600 text-[11px]">
                {mode === 'gelap' ? 'Aktif — tampilan gelap.' : 'Mati — tampilan terang.'}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={mode === 'gelap'}
                aria-label="Mode malam"
                onClick={toggleMode}
                className={`relative w-11 h-6 rounded-full transition cursor-pointer shrink-0 ${mode === 'gelap' ? 'bg-blue-700' : 'bg-slate-300'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${mode === 'gelap' ? 'translate-x-5' : ''}`}
                />
              </button>
            </div>
          </div>

          {/* Ukuran huruf */}
          <div className="p-4 border border-slate-200 rounded-xl bg-slate-50 space-y-3">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <Type className="w-4 h-4 text-blue-700" />
              Ukuran Huruf
            </h4>
            <div className="space-y-1.5" role="radiogroup" aria-label="Ukuran huruf">
              {([
                ['normal', 'Normal', 'Ukuran bawaan aplikasi.'],
                ['besar', 'Besar', 'Sedikit lebih besar, nyaman dibaca.'],
                ['sangat-besar', 'Sangat Besar', 'Paling besar, cocok untuk layar kecil.'],
              ] as [UkuranFont, string, string][]).map(([nilai, judul, desc]) => (
                <label
                  key={nilai}
                  className={`flex items-center gap-2.5 cursor-pointer border rounded-xl px-3 py-2 transition ${
                    ukuranFont === nilai
                      ? 'border-blue-600 bg-blue-50/40'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="ukuran-font"
                    checked={ukuranFont === nilai}
                    onChange={() => setUkuranFont(nilai)}
                    className="w-4 h-4 accent-blue-700 shrink-0"
                  />
                  <span>
                    <span className="block font-bold text-slate-900">{judul}</span>
                    <span className="block text-[11px] text-slate-500">{desc}</span>
                  </span>
                  {ukuranFont === nilai && <CheckCircle2 className="w-4 h-4 text-blue-700 ml-auto shrink-0" />}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
