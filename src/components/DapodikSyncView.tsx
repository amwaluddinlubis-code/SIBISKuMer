import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, 
  Server, 
  CheckCircle2, 
  AlertTriangle, 
  HelpCircle, 
  ArrowRight, 
  FileSpreadsheet, 
  UserPlus, 
  Clock, 
  Wifi, 
  ShieldCheck,
  Check,
  Download,
  School,
  Sparkles
} from 'lucide-react';
import { DapodikConfig, DapodikSyncLog, Siswa, DapodikRawPesertaDidik, DapodikRawSekolah, SekolahProfile } from '../types';
import { 
  testDapodikConnection, 
  fetchDapodikWebservice, 
  fetchDapodikSekolah,
  convertDapodikToSekolahProfile,
  compareDapodikWithExisting, 
  convertDapodikToSiswa,
  DapodikComparisonResult 
} from '../utils/dapodikSync';
import { saveDapodikConfig, addSyncLog, saveSiswa, saveSekolahProfile } from '../utils/db';

interface DapodikSyncViewProps {
  config: DapodikConfig;
  sekolah: SekolahProfile;
  onUpdateSekolah: (profile: SekolahProfile) => void;
  onConfigChange: (newCfg: DapodikConfig) => void;
  existingSiswa: Siswa[];
  syncLogs: DapodikSyncLog[];
  onRefreshData: () => void;
}

export const DapodikSyncView: React.FC<DapodikSyncViewProps> = ({
  config,
  sekolah,
  onUpdateSekolah,
  onConfigChange,
  existingSiswa,
  syncLogs,
  onRefreshData
}) => {
  const [cfg, setCfg] = useState<DapodikConfig>(config);
  const [testingConn, setTestingConn] = useState(false);
  const [connResult, setConnResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);

  const [loadingSync, setLoadingSync] = useState(false);
  const [comparison, setComparison] = useState<DapodikComparisonResult | null>(null);
  const [dapodikSekolah, setDapodikSekolah] = useState<DapodikRawSekolah | null>(null);
  const [syncSekolahChecked, setSyncSekolahChecked] = useState(true);
  const [schoolSyncMessage, setSchoolSyncMessage] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'baru' | 'berbeda' | 'sama'>('baru');
  const [selectedBaruIds, setSelectedBaruIds] = useState<string[]>([]);
  const [selectedBerbedaIds, setSelectedBerbedaIds] = useState<string[]>([]);
  const [processStatus, setProcessStatus] = useState<string | null>(null);

  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    setCfg(config);
  }, [config]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveDapodikConfig(cfg);
    onConfigChange(cfg);
    alert('Pengaturan Web Service Dapodik berhasil disimpan!');
  };

  const handleTestConnection = async (isSimulation = false) => {
    setTestingConn(true);
    setConnResult(null);
    try {
      const res = await testDapodikConnection(cfg, isSimulation);
      setConnResult({
        success: res.success,
        message: res.message,
        latency: res.latencyMs
      });
    } catch (err: any) {
      setConnResult({
        success: false,
        message: err.message || 'Gagal mengetes koneksi Web Service Dapodik'
      });
    } finally {
      setTestingConn(false);
    }
  };

  const handleFetchData = async (isSimulation = false) => {
    setLoadingSync(true);
    setProcessStatus(isSimulation ? 'Mengambil data simulasi Web Service & Identitas Sekolah...' : 'Menghubungi Web Service Dapodik lokal (getSekolah & getPesertaDidik)...');
    try {
      // 1. Fetch school info concurrently
      const [resStudents, resSchool] = await Promise.allSettled([
        fetchDapodikWebservice(cfg, isSimulation),
        fetchDapodikSekolah(cfg, isSimulation)
      ]);

      if (resSchool.status === 'fulfilled' && resSchool.value.success && resSchool.value.data) {
        setDapodikSekolah(resSchool.value.data);
      }

      if (resStudents.status !== 'fulfilled' || !resStudents.value.success || !resStudents.value.data) {
        const errMsg = resStudents.status === 'fulfilled' ? resStudents.value.error : 'Gagal terhubung';
        throw new Error(errMsg || 'Gagal mengambil daftar peserta didik dari Dapodik');
      }

      const comp = compareDapodikWithExisting(resStudents.value.data, existingSiswa);
      setComparison(comp);

      // Auto-select all new students by default
      setSelectedBaruIds(comp.baru.map((s) => s.peserta_didik_id));
      setSelectedBerbedaIds(comp.berbeda.map((b) => b.dapodik.peserta_didik_id));

      if (comp.baru.length > 0) {
        setActiveSubTab('baru');
      } else if (comp.berbeda.length > 0) {
        setActiveSubTab('berbeda');
      } else {
        setActiveSubTab('sama');
      }

      setProcessStatus(`Berhasil membaca profil sekolah dan ${resStudents.value.data.length} peserta didik dari Dapodik.`);
    } catch (err: any) {
      alert(`Gagal mengambil data dari Dapodik: ${err.message}`);
      setProcessStatus(null);
    } finally {
      setLoadingSync(false);
    }
  };

  const handleSyncSekolahOnly = async () => {
    if (!dapodikSekolah) return;
    const updated = convertDapodikToSekolahProfile(dapodikSekolah, sekolah);
    await saveSekolahProfile(updated);
    onUpdateSekolah(updated);
    setSchoolSyncMessage(`Identitas Sekolah berhasil disinkronkan dari Dapodik: ${updated.nama} (NPSN: ${updated.npsn}). Kepala Sekolah: ${updated.kepalaSekolah}.`);
    setTimeout(() => setSchoolSyncMessage(null), 5000);
  };

  const handleApplySync = async () => {
    if (!comparison) return;

    setLoadingSync(true);
    setProcessStatus('Memperbarui data Buku Induk Siswa & Identitas Sekolah...');
    let ditambahkan = 0;
    let diperbarui = 0;

    try {
      // 1. Process School Profile update if checked and available
      if (syncSekolahChecked && dapodikSekolah) {
        const updatedSekolah = convertDapodikToSekolahProfile(dapodikSekolah, sekolah);
        await saveSekolahProfile(updatedSekolah);
        onUpdateSekolah(updatedSekolah);
      }

      // 2. Process New Students
      for (const raw of comparison.baru) {
        if (selectedBaruIds.includes(raw.peserta_didik_id)) {
          const newSiswa = convertDapodikToSiswa(raw);
          await saveSiswa(newSiswa);
          ditambahkan++;
        }
      }

      // 3. Process Changed Students
      for (const item of comparison.berbeda) {
        if (selectedBerbedaIds.includes(item.dapodik.peserta_didik_id)) {
          const updated = convertDapodikToSiswa(item.dapodik, item.existing);
          await saveSiswa(updated);
          diperbarui++;
        }
      }

      const log: DapodikSyncLog = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        status: 'success',
        totalDapodik: comparison.totalDapodik,
        ditambahkan,
        diperbarui,
        dilewati: comparison.totalDapodik - (ditambahkan + diperbarui),
        pesan: `Sinkronisasi Dapodik berhasil. Ditambahkan: ${ditambahkan}, Diperbarui: ${diperbarui}${syncSekolahChecked && dapodikSekolah ? ', Identitas Sekolah diperbarui' : ''}.`
      };

      await addSyncLog(log);
      onRefreshData();

      setComparison(null);
      setDapodikSekolah(null);
      setProcessStatus(`Selesai! Berhasil mengimpor ${ditambahkan} siswa baru, memperbarui ${diperbarui} data siswa, serta menyelaraskan identitas sekolah.`);
    } catch (err: any) {
      alert(`Kesalahan saat menyimpan sinkronisasi: ${err.message}`);
    } finally {
      setLoadingSync(false);
    }
  };

  const handleToggleSelectBaru = (id: string) => {
    setSelectedBaruIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllBaru = () => {
    if (!comparison) return;
    if (selectedBaruIds.length === comparison.baru.length) {
      setSelectedBaruIds([]);
    } else {
      setSelectedBaruIds(comparison.baru.map((b) => b.peserta_didik_id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-6 rounded-2xl shadow-sm relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-800/80 text-blue-200 text-xs font-semibold mb-2">
            <Server className="w-3.5 h-3.5 text-amber-300" />
            Integrasi Resmi Dapodik Kemendikdasmen RI
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            Sinkronisasi Web Service Dapodik Lokal
          </h2>
          <p className="text-sm text-blue-100 mt-1 leading-relaxed">
            Tarik data peserta didik SMP secara langsung dari database aplikasi Dapodik yang terpasang di komputer/laptop operator tanpa perlu input ulang.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/10 hover:bg-white/20 text-white transition border border-white/20"
            >
              <HelpCircle className="w-3.5 h-3.5 text-amber-300" />
              {showGuide ? 'Sembunyikan Panduan Dapodik' : 'Lihat Cara Mengaktifkan Web Service di Dapodik'}
            </button>
          </div>
        </div>
      </div>

      {/* Guide Card (Collapsible) */}
      {showGuide && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-xs text-amber-900 space-y-3">
          <h4 className="font-bold text-sm text-amber-950 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-700" />
            Cara Mengaktifkan Web Service di Aplikasi Dapodik Sekolah:
          </h4>
          <ol className="list-decimal list-inside space-y-2 text-slate-800 ml-1">
            <li>Buka aplikasi <strong>Dapodik</strong> di komputer Anda (<code className="bg-amber-100 px-1 py-0.5 rounded font-mono">http://localhost:5774</code>).</li>
            <li>Masuk dengan akun operator sekolah Anda.</li>
            <li>Buka menu <strong>Pengaturan</strong> &rarr; pilih <strong>Web Service</strong>.</li>
            <li>Klik tombol <strong>Tambah</strong>, masukkan nama aplikasi misalnya: <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">Buku Induk Siswa SMP</code>.</li>
            <li>Tentukan IP Pengguna (bisa diisi <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">127.0.0.1</code> atau <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">*</code> agar bisa diakses di jaringan lokal).</li>
            <li>Salin <strong>Token Web Service</strong> yang terbit ke kolom token di bawah ini, lalu klik Simpan dan Tes Koneksi.</li>
          </ol>
        </div>
      )}

      {/* Two Column Grid: Config Card & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Form Konfigurasi */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-700" />
              <h3 className="font-bold text-sm text-slate-900">Pengaturan Koneksi Web Service Dapodik</h3>
            </div>
            <span className="text-[11px] font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">
              Default Port: 5774
            </span>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">
                  Host / Alamat IP Dapodik
                </label>
                <input
                  type="text"
                  value={cfg.ip}
                  onChange={(e) => setCfg({ ...cfg, ip: e.target.value })}
                  placeholder="localhost atau 127.0.0.1 atau 192.168.1.xxx"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  required
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Gunakan <code className="text-slate-600">localhost</code> jika aplikasi berjalan di PC yang sama dengan Dapodik.
                </span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Port Web Service
                </label>
                <input
                  type="number"
                  value={cfg.port}
                  onChange={(e) => setCfg({ ...cfg, port: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  NPSN Sekolah
                </label>
                <input
                  type="text"
                  value={cfg.npsn}
                  onChange={(e) => setCfg({ ...cfg, npsn: e.target.value })}
                  placeholder="Contoh: 20104567"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Semester ID Aktif
                </label>
                <select
                  value={cfg.semesterId}
                  onChange={(e) => setCfg({ ...cfg, semesterId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none bg-white"
                >
                  <option value="20241">2024/2025 Ganjil (20241)</option>
                  <option value="20242">2024/2025 Genap (20242)</option>
                  <option value="20251">2025/2026 Ganjil (20251)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Token Web Service Dapodik (Bearer Key)
              </label>
              <input
                type="text"
                value={cfg.token}
                onChange={(e) => setCfg({ ...cfg, token: e.target.value })}
                placeholder="Salin token dari menu Pengaturan Web Service di aplikasi Dapodik"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg shadow-xs transition"
              >
                Simpan Konfigurasi
              </button>

              <button
                type="button"
                onClick={() => handleTestConnection(false)}
                disabled={testingConn}
                className="px-4 py-2 bg-blue-50 border border-blue-200 text-blue-800 hover:bg-blue-100 font-semibold rounded-lg transition inline-flex items-center gap-1.5"
              >
                <Wifi className={`w-3.5 h-3.5 ${testingConn ? 'animate-spin' : ''}`} />
                {testingConn ? 'Mengetes Koneksi...' : 'Tes Koneksi Dapodik'}
              </button>

              <button
                type="button"
                onClick={() => handleTestConnection(true)}
                disabled={testingConn}
                className="px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 font-medium rounded-lg transition text-xs"
                title="Simulasi tes koneksi tanpa harus menyalakan Dapodik desktop"
              >
                Tes Simulasi Web Service
              </button>
            </div>
          </form>

          {/* Connection Test Result Box */}
          {connResult && (
            <div
              className={`mt-4 p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                connResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              {connResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-semibold">{connResult.message}</p>
                {connResult.latency && (
                  <p className="text-[11px] text-emerald-700 mt-0.5">
                    Waktu respon (latency): {connResult.latency} ms
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right 1 Col: Quick Sync Panel */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-2">
              <RefreshCw className="w-4 h-4 text-blue-700" />
              <h3 className="font-bold text-sm text-slate-900">Aksi Sinkronisasi Data</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              Mulai penarikan data peserta didik dari Dapodik. Anda dapat memeriksa perbandingan data sebelum menyimpannya ke Buku Induk.
            </p>

            <div className="space-y-2.5">
              <button
                onClick={() => handleFetchData(false)}
                disabled={loadingSync}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl shadow-sm transition active:scale-98 disabled:opacity-50 text-xs"
              >
                <RefreshCw className={`w-4 h-4 ${loadingSync ? 'animate-spin' : ''}`} />
                {loadingSync ? 'Sedang Membaca Dapodik...' : 'Tarik Data dari Dapodik Lokal'}
              </button>

              <button
                onClick={() => handleFetchData(true)}
                disabled={loadingSync}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-semibold rounded-xl transition text-xs"
              >
                <Server className="w-4 h-4 text-indigo-600" />
                Uji Coba dengan Data Sampel Dapodik
              </button>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100">
            <span className="text-[11px] text-slate-500 block mb-1">Status Sinkronisasi Terakhir:</span>
            {syncLogs.length > 0 ? (
              <div className="text-xs bg-slate-50 p-2 rounded border border-slate-200">
                <span className="font-semibold text-slate-800">{syncLogs[0].pesan}</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {new Date(syncLogs[0].timestamp).toLocaleString('id-ID')}
                </span>
              </div>
            ) : (
              <span className="text-xs text-slate-400 italic">Belum ada riwayat sinkronisasi.</span>
            )}
          </div>
        </div>
      </div>

      {/* School Identity Notification / Card from Dapodik Sync */}
      {dapodikSekolah && (
        <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white rounded-2xl border border-blue-400/30 p-5 shadow-md space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-blue-800/60 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-amber-300">
                <School className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  Identitas Satuan Pendidikan dari Dapodik
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/30 text-blue-200 border border-blue-400/30">
                    Hasil Sinkronisasi
                  </span>
                </h3>
                <p className="text-[11px] text-blue-200">
                  Data profil sekolah yang terbaca dari Web Service Dapodik lokal (getSekolah)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSyncSekolahOnly}
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                Perbarui Identitas Sekolah Sekarang
              </button>
            </div>
          </div>

          {schoolSyncMessage && (
            <div className="p-2.5 bg-emerald-950 border border-emerald-500/50 rounded-xl text-xs text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{schoolSyncMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
              <span className="text-[10px] text-blue-300 block font-semibold uppercase tracking-wider">Nama Sekolah (Dapodik)</span>
              <p className="font-bold text-white text-sm mt-0.5">{dapodikSekolah.nama}</p>
              <span className="text-[10px] text-slate-300">Bentuk: {dapodikSekolah.bentuk_pendidikan_str || 'SMP'} ({dapodikSekolah.status_sekolah_str || 'Negeri'})</span>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
              <span className="text-[10px] text-blue-300 block font-semibold uppercase tracking-wider">NPSN & NSS</span>
              <p className="font-mono font-bold text-amber-300 text-sm mt-0.5">{dapodikSekolah.npsn}</p>
              <span className="text-[10px] text-slate-300">NSS: {dapodikSekolah.nss || '-'}</span>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
              <span className="text-[10px] text-blue-300 block font-semibold uppercase tracking-wider">Kepala Sekolah</span>
              <p className="font-bold text-white text-xs mt-0.5 truncate">{dapodikSekolah.kepala_sekolah || '-'}</p>
              <span className="text-[10px] text-slate-300 font-mono">NIP: {dapodikSekolah.nip_kepala_sekolah || '-'}</span>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
              <span className="text-[10px] text-blue-300 block font-semibold uppercase tracking-wider">Alamat & Wilayah</span>
              <p className="text-[11px] text-slate-200 mt-0.5 line-clamp-1">{dapodikSekolah.alamat_jalan || '-'}</p>
              <span className="text-[10px] text-slate-300">{dapodikSekolah.kecamatan || ''}, {dapodikSekolah.kabupaten_kota || ''}</span>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer pt-1 text-xs text-blue-100">
            <input
              type="checkbox"
              checked={syncSekolahChecked}
              onChange={(e) => setSyncSekolahChecked(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-white/30 bg-white/10"
            />
            <span className="font-medium">
              Sertakan pembaruan identitas sekolah ini saat tombol <strong>"Terapkan Sinkronisasi"</strong> diklik.
            </span>
          </label>
        </div>
      )}

      {/* Comparison View Table (Appears when fetched) */}
      {comparison && (
        <div className="bg-white rounded-xl border border-blue-200 shadow-md p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h3 className="font-extrabold text-base text-slate-900">
                Pratinjau Hasil Pembacaan Data Dapodik
              </h3>
              <p className="text-xs text-slate-500">
                Ditemukan total <strong>{comparison.totalDapodik} peserta didik</strong> di Web Service Dapodik{dapodikSekolah ? ' serta profil satuan pendidikan' : ''}.
              </p>
            </div>

            <button
              onClick={handleApplySync}
              disabled={loadingSync || (selectedBaruIds.length === 0 && selectedBerbedaIds.length === 0 && !syncSekolahChecked)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm transition active:scale-95 disabled:opacity-50 text-xs cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Terapkan Sinkronisasi ({selectedBaruIds.length + selectedBerbedaIds.length} Siswa{syncSekolahChecked && dapodikSekolah ? ' + Sekolah' : ''})
            </button>
          </div>

          {/* Subtabs for Comparison */}
          <div className="flex gap-2 border-b border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setActiveSubTab('baru')}
              className={`pb-2 px-3 flex items-center gap-1.5 border-b-2 transition ${
                activeSubTab === 'baru'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Siswa Baru Belum Ada di Buku Induk
              <span className="px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                {comparison.baru.length}
              </span>
            </button>

            <button
              onClick={() => setActiveSubTab('berbeda')}
              className={`pb-2 px-3 flex items-center gap-1.5 border-b-2 transition ${
                activeSubTab === 'berbeda'
                  ? 'border-amber-600 text-amber-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Perubahan Data Siswa
              <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                {comparison.berbeda.length}
              </span>
            </button>

            <button
              onClick={() => setActiveSubTab('sama')}
              className={`pb-2 px-3 flex items-center gap-1.5 border-b-2 transition ${
                activeSubTab === 'sama'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Data Cocok / Identik
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                {comparison.sama.length}
              </span>
            </button>
          </div>

          {/* Subtab Content: Siswa Baru */}
          {activeSubTab === 'baru' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Pilih siswa baru dari Dapodik yang ingin didaftarkan ke Buku Induk Siswa:</span>
                <button
                  onClick={handleToggleSelectAllBaru}
                  className="text-blue-700 hover:underline font-semibold"
                >
                  {selectedBaruIds.length === comparison.baru.length ? 'Batal Pilih Semua' : 'Pilih Semua Siswa Baru'}
                </button>
              </div>

              {comparison.baru.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-lg">
                  Tidak ada siswa baru di Dapodik (semua siswa sudah tercatat di Buku Induk).
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase font-semibold text-[10px]">
                      <tr>
                        <th className="p-3 w-8">
                          <input
                            type="checkbox"
                            checked={selectedBaruIds.length === comparison.baru.length && comparison.baru.length > 0}
                            onChange={handleToggleSelectAllBaru}
                            className="rounded border-slate-300 text-blue-600"
                          />
                        </th>
                        <th className="p-3">Nama Lengkap</th>
                        <th className="p-3">NISN / NIPD</th>
                        <th className="p-3">L/P</th>
                        <th className="p-3">Rombel Dapodik</th>
                        <th className="p-3">Nama Orang Tua</th>
                        <th className="p-3">Sekolah Asal SD</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {comparison.baru.map((b) => (
                        <tr
                          key={b.peserta_didik_id}
                          className={`hover:bg-blue-50/50 transition cursor-pointer ${
                            selectedBaruIds.includes(b.peserta_didik_id) ? 'bg-blue-50/30' : ''
                          }`}
                          onClick={() => handleToggleSelectBaru(b.peserta_didik_id)}
                        >
                          <td className="p-3">
                            <input
                              type="checkbox"
                              checked={selectedBaruIds.includes(b.peserta_didik_id)}
                              onChange={() => {}}
                              className="rounded border-slate-300 text-blue-600"
                            />
                          </td>
                          <td className="p-3 font-bold text-slate-900">{b.nama}</td>
                          <td className="p-3 font-mono text-slate-700">
                            {b.nisn || '-'} / {b.nipd || '-'}
                          </td>
                          <td className="p-3">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              b.jenis_kelamin === 'L' ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {b.jenis_kelamin}
                            </span>
                          </td>
                          <td className="p-3 font-semibold text-blue-800">
                            {b.nama_rombel || b.rombongan_belajar || '-'}
                          </td>
                          <td className="p-3 text-slate-600">
                            {b.nama_ayah || b.nama_ibu || '-'}
                          </td>
                          <td className="p-3 text-slate-600">{b.sekolah_asal || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Subtab Content: Perubahan Data */}
          {activeSubTab === 'berbeda' && (
            <div className="space-y-3">
              {comparison.berbeda.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-lg">
                  Tidak ditemukan perbedaan data pada siswa yang sudah ada.
                </div>
              ) : (
                <div className="space-y-3">
                  {comparison.berbeda.map((item) => (
                    <div
                      key={item.dapodik.peserta_didik_id}
                      className="p-3 border border-amber-200 bg-amber-50/40 rounded-lg text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-bold text-slate-900 text-sm">{item.existing.namaLengkap}</span>
                          <span className="text-slate-500 ml-2 font-mono">NISN: {item.existing.nisn}</span>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer font-semibold text-amber-900">
                          <input
                            type="checkbox"
                            checked={selectedBerbedaIds.includes(item.dapodik.peserta_didik_id)}
                            onChange={() => {
                              setSelectedBerbedaIds((prev) =>
                                prev.includes(item.dapodik.peserta_didik_id)
                                  ? prev.filter((id) => id !== item.dapodik.peserta_didik_id)
                                  : [...prev, item.dapodik.peserta_didik_id]
                              );
                            }}
                            className="rounded border-amber-400 text-amber-700"
                          />
                          Perbarui Data Ini
                        </label>
                      </div>

                      <div className="bg-white p-2 rounded border border-amber-200 text-xs">
                        <span className="text-slate-500 font-semibold block mb-1">Perbedaan yang terdeteksi:</span>
                        <ul className="list-disc list-inside space-y-0.5 text-amber-900">
                          {item.perubahan.map((p, pIdx) => (
                            <li key={pIdx}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Subtab Content: Data Cocok */}
          {activeSubTab === 'sama' && (
            <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-900">
              <p className="font-semibold mb-1">
                {comparison.sama.length} Peserta Didik Sudah Sinkron Sempurna!
              </p>
              <p className="text-emerald-800 text-[11px]">
                Data NISN, nama, dan rombel telah terverifikasi cocok antara aplikasi Buku Induk dan database Dapodik.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Sync Log History Table */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-slate-600" />
          <h3 className="font-bold text-sm text-slate-900">Riwayat Log Sinkronisasi Web Service</h3>
        </div>

        {syncLogs.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-2">Belum ada riwayat aktivitas sinkronisasi.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px] border-b border-slate-200">
                <tr>
                  <th className="p-2.5">Waktu</th>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5">Total Data Dapodik</th>
                  <th className="p-2.5">Ditambahkan</th>
                  <th className="p-2.5">Diperbarui</th>
                  <th className="p-2.5">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {syncLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="p-2.5 text-slate-600 font-mono text-[11px]">
                      {new Date(log.timestamp).toLocaleString('id-ID')}
                    </td>
                    <td className="p-2.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        <CheckCircle2 className="w-3 h-3" />
                        Sukses
                      </span>
                    </td>
                    <td className="p-2.5 font-semibold text-slate-800">{log.totalDapodik}</td>
                    <td className="p-2.5 font-semibold text-blue-700">+{log.ditambahkan}</td>
                    <td className="p-2.5 font-semibold text-amber-700">~{log.diperbarui}</td>
                    <td className="p-2.5 text-slate-700">{log.pesan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
