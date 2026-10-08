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
  Sparkles,
  Users,
  KeyRound,
  Lock
} from 'lucide-react';
import { DapodikConfig, DapodikSyncLog, Siswa, DapodikRawPesertaDidik, DapodikRawSekolah, DapodikRawRombel, DapodikRawPtk, DapodikRawPengguna, SekolahProfile, JenjangSekolah } from '../types';
import {
  testDapodikConnection,
  fetchDapodikWebservice,
  fetchDapodikSekolah,
  fetchDapodikRombel,
  fetchDapodikPtk,
  fetchDapodikPengguna,
  convertDapodikToSekolahProfile,
  compareDapodikWithExisting,
  compareRombelWithExisting,
  convertDapodikToSiswa,
  deriveRombelRefsFromPesertaDidik,
  convertDapodikToRombelRef,
  convertDapodikToPtkRef,
  convertPenggunaToAppUser,
  mapTingkatKelas,
  DapodikComparisonResult,
  RombelComparison
} from '../utils/dapodikSync';
import { saveDapodikConfig, addSyncLog, saveSiswa, saveSekolahProfile, saveRombelRefs, savePtkRefs, saveUser, getAllUsers, getAllRombelRefs, getAllPtkRefs, kunciOperasiPanjang, bukaKunciOperasiPanjang } from '../utils/db';
import { toast, confirmDialog } from '../utils/notify';
import { catatAudit } from '../utils/audit';
import { validateDapodikConfig } from '../utils/validation';
import { SyncProgressBar, SyncStep, SyncResult } from './SyncProgressBar';

interface DapodikSyncViewProps {
  config: DapodikConfig;
  sekolah: SekolahProfile;
  onUpdateSekolah: (profile: SekolahProfile) => void;
  onConfigChange: (newCfg: DapodikConfig) => void;
  existingSiswa: Siswa[];
  syncLogs: DapodikSyncLog[];
  /** Sesi tahun ajaran login — sinkron selalu menulis ke tahun aktif database. */
  sessionTahun?: string | null;
  onRefreshData: () => void;
}

// D14: NPSN dari Dapodik tidak boleh menimpa NPSN profil aktif tanpa
// konfirmasi eksplisit (salah konfigurasi Dapodik bisa menimpa identitas
// sekolah). Default = JANGAN ubah (false bila user membatalkan).
async function konfirmasiUbahNpsn(npsnDapodik: string, npsnAktif: string): Promise<boolean> {
  const d = (npsnDapodik || '').trim();
  const a = (npsnAktif || '').trim();
  if (!d || !a || d === a) return true;
  return confirmDialog(
    `NPSN dari Dapodik (${d}) BERBEDA dengan profil sekolah aktif (${a}). ` +
    `Ubah NPSN sekolah menjadi ${d}?`,
    { confirmLabel: 'Ya, Ubah NPSN', danger: true }
  );
}

export const DapodikSyncView: React.FC<DapodikSyncViewProps> = ({
  config,
  sekolah,
  onUpdateSekolah,
  onConfigChange,
  existingSiswa,
  syncLogs,
  sessionTahun,
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
  const jenjang: JenjangSekolah = sekolah.jenjang || (sekolah.bentukPendidikan?.toUpperCase().includes('SD') ? 'SD' : 'SMP');
  const [selectedBerbedaIds, setSelectedBerbedaIds] = useState<string[]>([]);
  const [processStatus, setProcessStatus] = useState<string | null>(null);

  // ----- Progress bar + notifikasi hasil sinkronisasi -----
  const [syncSteps, setSyncSteps] = useState<SyncStep[]>([]);
  const [syncPercent, setSyncPercent] = useState(0);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncTitle, setSyncTitle] = useState('Sinkronisasi Dapodik');
  const [lastWasSimulation, setLastWasSimulation] = useState(false);

  const setStep = (id: string, patch: Partial<SyncStep>) =>
    setSyncSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  /** Kunci stabil per baris Dapodik (peserta_didik_id bisa kosong pada respons tertentu). */
  const getDapodikKey = (s: DapodikRawPesertaDidik, idx?: number): string =>
    (s.peserta_didik_id && String(s.peserta_didik_id).trim()) ||
    (s.nisn && `nisn-${String(s.nisn).trim()}`) ||
    (s.nama && `nama-${s.nama.trim().toUpperCase()}`) ||
    `baris-${idx ?? 0}`;

  // Full-sync reference data (Rombel, PTK, Pengguna)
  const [dapodikRombel, setDapodikRombel] = useState<DapodikRawRombel[]>([]);
  const [dapodikPtk, setDapodikPtk] = useState<DapodikRawPtk[]>([]);
  const [dapodikPengguna, setDapodikPengguna] = useState<DapodikRawPengguna[]>([]);
  const [rombelComparison, setRombelComparison] = useState<RombelComparison | null>(null);
  const [rombelDerived, setRombelDerived] = useState(false);
  const [selectedPenggunaIds, setSelectedPenggunaIds] = useState<string[]>([]);
  const [createdAccounts, setCreatedAccounts] = useState<{ username: string; password: string; nama: string }[]>([]);
  // Status baca per endpoint (ditampilkan agar kegagalan tidak diam-diam)
  const [refStatus, setRefStatus] = useState<{ rombel: string | null; ptk: string | null; pengguna: string | null; sekolah: string | null }>({
    rombel: null,
    ptk: null,
    pengguna: null,
    sekolah: null
  });

  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    setCfg(config);
  }, [config]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const issues = validateDapodikConfig(cfg);
    if (issues.length > 0) {
      toast(issues[0], 'error');
      return;
    }
    try {
      await saveDapodikConfig(cfg);
      onConfigChange(cfg);
      toast('Pengaturan Web Service Dapodik berhasil disimpan!', 'success');
    } catch (err: unknown) {
      toast(`Gagal menyimpan pengaturan Dapodik: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const handleTestConnection = async (isSimulation = false) => {
    if (!isSimulation) {
      const issues = validateDapodikConfig(cfg);
      if (issues.length > 0) {
        const msg = issues[0];
        setConnResult({ success: false, message: msg });
        toast(msg, 'error');
        return;
      }
    }
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
    if (!isSimulation) {
      if (!cfg.npsn || !cfg.npsn.trim()) {
        toast('Isi NPSN sekolah terlebih dahulu sebelum menarik data Dapodik.', 'error');
        return;
      }
      if (!cfg.token || !cfg.token.trim()) {
        toast('Token Web Service kosong. Salin token dari Dapodik → Pengaturan → Web Service, atau gunakan mode simulasi.', 'error');
        return;
      }
    }
    setLastWasSimulation(isSimulation);
    setLoadingSync(true);
    setSyncResult(null);
    setSyncTitle(isSimulation ? 'Mengambil Data Simulasi Dapodik' : 'Menarik Data dari Dapodik Lokal');
    const initialSteps: SyncStep[] = [
      { id: 'siswa', label: 'Peserta Didik', status: 'pending', detail: 'Menunggu…' },
      { id: 'sekolah', label: 'Profil Sekolah', status: 'pending', detail: 'Menunggu…' },
      { id: 'rombel', label: 'Rombongan Belajar', status: 'pending', detail: 'Menunggu…' },
      { id: 'ptk', label: 'PTK / GTK', status: 'pending', detail: 'Menunggu…' },
      { id: 'pengguna', label: 'Pengguna', status: 'pending', detail: 'Menunggu…' },
    ];
    setSyncSteps(initialSteps);
    setSyncPercent(2);
    setProcessStatus(isSimulation ? 'Mengambil data simulasi Web Service & Identitas Sekolah...' : 'Menghubungi Web Service Dapodik lokal (getSekolah, getPesertaDidik, getRombonganBelajar, getGtk, getPengguna)...');
    try {
      // 1. Fetch BERURUTAN satu per satu (Dapodik desktop kewalahan request berbarengan)
      const toSettled = async <T,>(fn: () => Promise<T>): Promise<PromiseSettledResult<T>> => {
        try {
          return { status: 'fulfilled', value: await fn() };
        } catch (reason) {
          return { status: 'rejected', reason };
        }
      };
      const gap = async () => {
        if (!isSimulation) await new Promise((r) => setTimeout(r, 350));
      };
      const runStep = async <T,>(
        id: string,
        label: string,
        fn: () => Promise<T>,
        pctAfter: number
      ): Promise<PromiseSettledResult<T>> => {
        setStep(id, { status: 'active', detail: `Menghubungi ${label}…` });
        const res = await toSettled(fn);
        if (res.status === 'fulfilled') {
          const v = res.value as unknown as { success?: boolean; data?: unknown[]; error?: string };
          if (v && v.success === false) {
            setStep(id, { status: 'error', detail: v.error || 'Ditolak Dapodik' });
          } else {
            const n = Array.isArray(v?.data) ? (v.data as unknown[]).length : undefined;
            setStep(id, {
              status: 'success',
              detail: typeof n === 'number' ? `${n} baris terbaca` : 'OK',
            });
          }
        } else {
          const msg = res.reason instanceof Error ? res.reason.message : String(res.reason);
          setStep(id, { status: 'error', detail: msg.slice(0, 120) });
        }
        setSyncPercent(pctAfter);
        return res;
      };

      const resStudents = await runStep('siswa', 'getPesertaDidik', () => fetchDapodikWebservice(cfg, isSimulation), 25);
      await gap();
      const resSchool = await runStep('sekolah', 'getSekolah', () => fetchDapodikSekolah(cfg, isSimulation), 45);
      await gap();
      const resRombel = await runStep('rombel', 'getRombonganBelajar', () => fetchDapodikRombel(cfg, isSimulation), 65);
      await gap();
      const resPtk = await runStep('ptk', 'getGtk/getPTK', () => fetchDapodikPtk(cfg, isSimulation), 82);
      await gap();
      const resPengguna = await runStep('pengguna', 'getPengguna', () => fetchDapodikPengguna(cfg, isSimulation), 95);

      if (resSchool.status === 'fulfilled' && resSchool.value.success && resSchool.value.data) {
        setDapodikSekolah(resSchool.value.data);
        console.info('[dapodik] getSekolah raw:', resSchool.value.data);
      }

      if (resStudents.status !== 'fulfilled' || !resStudents.value.success || !resStudents.value.data) {
        const errMsg = resStudents.status === 'fulfilled' ? resStudents.value.error : 'Gagal terhubung';
        throw new Error(errMsg || 'Gagal mengambil daftar peserta didik dari Dapodik');
      }

      const comp = compareDapodikWithExisting(resStudents.value.data, existingSiswa);
      setComparison(comp);

      // Auto-select all new students by default (kunci stabil anti-tabrakan ID kosong)
      setSelectedBaruIds(comp.baru.map((s, i) => getDapodikKey(s, i)));
      setSelectedBerbedaIds(comp.berbeda.map((b, i) => getDapodikKey(b.dapodik, i)));

      // 2. Reference data (best-effort: tidak menggagalkan sinkron utama)
      const rombelList = resRombel.status === 'fulfilled' && resRombel.value.success ? resRombel.value.data : [];
      const ptkList = resPtk.status === 'fulfilled' && resPtk.value.success ? resPtk.value.data : [];
      const penggunaList = resPengguna.status === 'fulfilled' && resPengguna.value.success ? resPengguna.value.data : [];
      // 2b. Fallback rombel: turunkan dari data siswa bila getRombonganBelajar ditolak
      let finalRombel = rombelList;
      let derived = false;
      if (finalRombel.length === 0 && resStudents.status === 'fulfilled' && resStudents.value.success && resStudents.value.data.length > 0) {
        finalRombel = deriveRombelRefsFromPesertaDidik(resStudents.value.data, jenjang);
        derived = finalRombel.length > 0;
      }
      setDapodikRombel(finalRombel);
      setRombelDerived(derived);
      setDapodikPtk(ptkList);
      setDapodikPengguna(penggunaList);
      setRombelComparison(compareRombelWithExisting(finalRombel, existingSiswa));
      setSelectedPenggunaIds(penggunaList.map((p) => p.pengguna_id || p.username));
      setCreatedAccounts([]);
      const statusOf = (
        res: PromiseSettledResult<{ success: boolean; data: unknown[]; error?: string }>,
        label: string
      ): string | null => {
        if (res.status === 'rejected') return `${label}: gagal (promise rejected)`;
        if (!res.value.success) return `${label}: ${res.value.error || 'gagal tanpa pesan'}`;
        if (res.value.data.length === 0) return `${label}: terbaca 0 baris (respons kosong dari Dapodik)`;
        return null;
      };
      setRefStatus({
        rombel: statusOf(resRombel, 'Rombel'),
        ptk: statusOf(resPtk, 'PTK'),
        pengguna: statusOf(resPengguna, 'Pengguna'),
        sekolah: resSchool.status === 'fulfilled' && resSchool.value.success ? null : 'Identitas sekolah: gagal dibaca dari Dapodik'
      });

      if (comp.baru.length > 0) {
        setActiveSubTab('baru');
      } else if (comp.berbeda.length > 0) {
        setActiveSubTab('berbeda');
      } else {
        setActiveSubTab('sama');
      }

      const okMsg = `Berhasil membaca profil sekolah, ${resStudents.value.data.length} peserta didik, ${finalRombel.length} rombel, ${ptkList.length} PTK, dan ${penggunaList.length} pengguna dari Dapodik.`;
      setProcessStatus(okMsg);
      setSyncPercent(100);
      const partialFails = syncSteps.length > 0 ? undefined : undefined;
      // Tandai tahap turunan rombel bila fallback dipakai
      if (derived) {
        setStep('rombel', { status: 'success', detail: `${finalRombel.length} rombel (turunan data siswa)` });
      }
      setSyncSteps((prev) => prev.map((s) => (s.status === 'active' ? { ...s, status: 'success' as const } : s)));
      const failedSteps = ['sekolah', 'rombel', 'ptk', 'pengguna'].filter((id) => {
        if (id === 'sekolah') return !(resSchool.status === 'fulfilled' && resSchool.value.success);
        if (id === 'rombel') return finalRombel.length === 0;
        if (id === 'ptk') return !(resPtk.status === 'fulfilled' && resPtk.value.success);
        return !(resPengguna.status === 'fulfilled' && resPengguna.value.success);
      });
      void partialFails;
      if (failedSteps.length > 0) {
        setSyncResult({
          kind: 'warning',
          title: 'Data terbaca dengan peringatan',
          message: `${okMsg} Beberapa endpoint gagal/0 baris: ${failedSteps.join(', ')}. Data siswa tetap bisa diproses; periksa token & Web Service Dapodik.`,
        });
        toast('Data Dapodik terbaca dengan peringatan. Periksa panel progres.', 'warning');
      } else {
        setSyncResult({
          kind: 'success',
          title: 'Penarikan Data Berhasil',
          message: `${okMsg} Baru: ${comp.baru.length}, berubah: ${comp.berbeda.length}, cocok: ${comp.sama.length}. Lanjutkan dengan "Terapkan Sinkronisasi".`,
        });
        toast('Penarikan data Dapodik berhasil!', 'success');
      }
    } catch (err: any) {
      const msg = err.message || 'Gagal mengambil data dari Dapodik';
      toast(`Gagal mengambil data dari Dapodik: ${msg}`, 'error');
      setSyncSteps((prev) => prev.map((s) => (s.status === 'active' ? { ...s, status: 'error' as const, detail: msg.slice(0, 120) } : s.status === 'pending' ? { ...s, status: 'skipped' as const, detail: 'Dilewati karena gagal' } : s)));
      setSyncPercent(100);
      setSyncResult({
        kind: 'error',
        title: 'Penarikan Data Gagal',
        message: msg,
        details: ['Pastikan aplikasi Dapodik berjalan di host:port yang dikonfigurasi.', 'Pastikan token Web Service benar, atau gunakan "Uji Coba dengan Data Sampel Dapodik".'],
      });
      setProcessStatus(null);
    } finally {
      setLoadingSync(false);
    }
  };

  const handleSyncSekolahOnly = async () => {
    if (!dapodikSekolah) return;
    const updated = convertDapodikToSekolahProfile(dapodikSekolah, sekolah);
    // D14: NPSN berbeda → konfirmasi eksplisit; default = pertahankan NPSN lama.
    const bolehUbahNpsn = await konfirmasiUbahNpsn(dapodikSekolah.npsn || '', sekolah.npsn || '');
    const final = bolehUbahNpsn ? updated : { ...updated, npsn: sekolah.npsn };
    await saveSekolahProfile(final);
    onUpdateSekolah(final);
    const msg = `Identitas Sekolah berhasil disinkronkan dari Dapodik: ${final.nama} (NPSN: ${final.npsn}). Kepala Sekolah: ${final.kepalaSekolah}.`;
    setSchoolSyncMessage(msg);
    toast('Identitas sekolah berhasil disinkronkan!', 'success');
    setTimeout(() => setSchoolSyncMessage(null), 5000);
  };

  const handleApplySync = async () => {
    if (!comparison) return;

    // Input hanya pada sesi aktif: Dapodik memuat data hari ini (tahun aktif
    // profil). Terapkan diblokir bila sesi berada di bawahnya.
    const sesi = (sessionTahun || '').trim();
    const aktifProfil = (sekolah.tahunAjaran || '').trim();
    if (sesi && aktifProfil && sesi < aktifProfil) {
      toast(`Sinkron diblokir: sesi aktif (TA ${sesi}) di bawah tahun aktif database (TA ${aktifProfil}). Pindah sesi ke ${aktifProfil} dulu — data Dapodik adalah data hari ini.`, 'error');
      return;
    }

    setLoadingSync(true);
    setSyncResult(null);
    setSyncTitle('Menerapkan Sinkronisasi ke Buku Induk');
    setSyncPercent(2);
    // D11: kunci operasi panjang — ganti sekolah aktif ditolak selama apply.
    kunciOperasiPanjang();    setSyncSteps([
      { id: 'sekolah', label: 'Profil Sekolah', status: 'pending', detail: 'Menunggu…' },
      { id: 'referensi', label: 'Rombel & PTK', status: 'pending', detail: 'Menunggu…' },
      { id: 'akun', label: 'Akun Operator', status: 'pending', detail: 'Menunggu…' },
      { id: 'baru', label: 'Siswa Baru', status: 'pending', detail: 'Menunggu…' },
      { id: 'ubah', label: 'Siswa Diperbarui', status: 'pending', detail: 'Menunggu…' },
    ]);
    setProcessStatus('Memperbarui data Buku Induk Siswa & Identitas Sekolah...');
    let ditambahkan = 0;
    let diperbarui = 0;
    let gagal = 0;
    const gagalPesan: string[] = [];

    try {
      // 1. Process School Profile update if checked and available
      setStep('sekolah', { status: 'active', detail: 'Menyimpan identitas sekolah…' });
      if (syncSekolahChecked && dapodikSekolah) {
        const updatedSekolah = convertDapodikToSekolahProfile(dapodikSekolah, sekolah);
        // D14: NPSN berbeda → konfirmasi eksplisit; default = pertahankan NPSN lama.
        const bolehUbahNpsn = await konfirmasiUbahNpsn(dapodikSekolah.npsn || '', sekolah.npsn || '');
        const finalSekolah = bolehUbahNpsn ? updatedSekolah : { ...updatedSekolah, npsn: sekolah.npsn };
        await saveSekolahProfile(finalSekolah);
        onUpdateSekolah(finalSekolah);
        setStep('sekolah', { status: 'success', detail: `Terbarui: ${finalSekolah.nama}` });
      } else {
        setStep('sekolah', { status: 'skipped', detail: 'Dilewati (tidak dicentang/tidak ada data)' });
      }
      setSyncPercent(15);

      // 2b. Simpan referensi Rombel & PTK resmi Dapodik
      setStep('referensi', { status: 'active', detail: 'Menyimpan referensi…' });
      let rombelTersimpan = 0;
      let ptkTersimpan = 0;
      const simpanGagal: string[] = [];
      if (dapodikRombel.length > 0) {
        const refs = dapodikRombel.map((r) => convertDapodikToRombelRef(r, sekolah.tahunAjaran));
        await saveRombelRefs(refs);
        // Verifikasi tulis-baca: jangan laporkan sukses palsu bila
        // penyimpanan lokal menolak data (modul GTK akan tetap kosong).
        const stored = await getAllRombelRefs();
        if (stored.length === 0) {
          simpanGagal.push(`Rombel (${refs.length} baris gagal tersimpan ke penyimpanan lokal)`);
        } else {
          rombelTersimpan = refs.length;
        }
      }
      if (dapodikPtk.length > 0) {
        const refs = dapodikPtk.map((p) => convertDapodikToPtkRef(p));
        await savePtkRefs(refs);
        const stored = await getAllPtkRefs();
        if (stored.length === 0) {
          simpanGagal.push(`PTK/GTK (${refs.length} baris gagal tersimpan ke penyimpanan lokal)`);
        } else {
          ptkTersimpan = refs.length;
        }
      }
      if (simpanGagal.length > 0) {
        const msg = `Gagal menyimpan referensi: ${simpanGagal.join('; ')}. Data tidak akan muncul di modul GTK. Coba muat ulang halaman lalu sinkron ulang.`;
        setStep('referensi', { status: 'error', detail: msg.slice(0, 160) });
        gagalPesan.push(msg);
        toast(msg, 'error');
      } else {
        setStep('referensi', { status: 'success', detail: `${rombelTersimpan} rombel, ${ptkTersimpan} PTK` });
      }
      setSyncPercent(30);

      // 2c. Buat akun operator dari Pengguna Dapodik yang dipilih
      setStep('akun', { status: 'active', detail: 'Memproses akun…' });
      const akunBaru: { username: string; password: string; nama: string }[] = [];
      let akunDilewati = 0;
      if (selectedPenggunaIds.length > 0) {
        const existingUsers = await getAllUsers();
        for (const raw of dapodikPengguna) {
          if (!selectedPenggunaIds.includes(raw.pengguna_id)) continue;
          const hasil = await convertPenggunaToAppUser(raw, existingUsers);
          if (hasil.skipped) {
            akunDilewati++;
            continue;
          }
          await saveUser(hasil.user);
          existingUsers.push(hasil.user);
          akunBaru.push({ username: hasil.user.username, password: hasil.plainPassword, nama: hasil.user.namaLengkap });
        }
        setCreatedAccounts(akunBaru);
      }
      setStep('akun', { status: 'success', detail: `${akunBaru.length} dibuat${akunDilewati > 0 ? `, ${akunDilewati} dilewati` : ''}` });
      setSyncPercent(40);

      // 2. Process New Students (tahan gagal sebagian: satu baris gagal tidak membatalkan lainnya)
      const targetBaru = comparison.baru.filter((raw, idx) => selectedBaruIds.includes(getDapodikKey(raw, idx)));
      const targetUbah = comparison.berbeda.filter((item, idx) => selectedBerbedaIds.includes(getDapodikKey(item.dapodik, idx)));
      const totalTarget = targetBaru.length + targetUbah.length;
      const bumpApplyProgress = (doneCount: number) => {
        // Rentang 40% -> 95% untuk pemrosesan siswa
        if (totalTarget === 0) {
          setSyncPercent(95);
          return;
        }
        setSyncPercent(40 + Math.round((doneCount / totalTarget) * 55));
      };
      let processed = 0;
      setStep('baru', { status: targetBaru.length > 0 ? 'active' : 'skipped', detail: targetBaru.length > 0 ? `0/${targetBaru.length} diproses…` : 'Tidak ada yang dipilih' });
      for (let idx = 0; idx < comparison.baru.length; idx++) {
        const raw = comparison.baru[idx];
        if (selectedBaruIds.includes(getDapodikKey(raw, idx))) {
          try {
            const newSiswa = convertDapodikToSiswa(raw, undefined, jenjang, sekolah.tahunAjaran);
            await saveSiswa(newSiswa);
            ditambahkan++;
          } catch (err: unknown) {
            gagal++;
            gagalPesan.push(`${raw.nama || 'Tanpa nama'}: ${err instanceof Error ? err.message : String(err)}`);
          }
          processed++;
          bumpApplyProgress(processed);
          setStep('baru', { detail: `${ditambahkan}/${targetBaru.length} tersimpan…` });
        }
      }
      setStep('baru', { status: gagal > 0 ? 'success' : 'success', detail: `${ditambahkan}/${targetBaru.length} tersimpan` });

      // 3. Process Changed Students
      setStep('ubah', { status: targetUbah.length > 0 ? 'active' : 'skipped', detail: targetUbah.length > 0 ? `0/${targetUbah.length} diproses…` : 'Tidak ada yang dipilih' });
      for (let idx = 0; idx < comparison.berbeda.length; idx++) {
        const item = comparison.berbeda[idx];
        if (selectedBerbedaIds.includes(getDapodikKey(item.dapodik, idx))) {
          try {
            const updated = convertDapodikToSiswa(item.dapodik, item.existing, jenjang, sekolah.tahunAjaran);
            await saveSiswa(updated);
            diperbarui++;
          } catch (err: unknown) {
            gagal++;
            gagalPesan.push(`${item.existing.namaLengkap}: ${err instanceof Error ? err.message : String(err)}`);
          }
          processed++;
          bumpApplyProgress(processed);
          setStep('ubah', { detail: `${diperbarui}/${targetUbah.length} diperbarui…` });
        }
      }
      setStep('ubah', { status: 'success', detail: `${diperbarui}/${targetUbah.length} diperbarui` });
      setSyncPercent(97);

      const log: DapodikSyncLog = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        status: gagal > 0 ? 'warning' : 'success',
        totalDapodik: comparison.totalDapodik,
        ditambahkan,
        diperbarui,
        dilewati: Math.max(0, comparison.totalDapodik - (ditambahkan + diperbarui)),
        pesan: `Sinkronisasi Dapodik ${gagal > 0 ? 'selesai dengan peringatan' : 'berhasil'}. Ditambahkan: ${ditambahkan}, Diperbarui: ${diperbarui}${gagal > 0 ? `, Gagal: ${gagal}` : ''}${syncSekolahChecked && dapodikSekolah ? ', Identitas Sekolah diperbarui' : ''}, Rombel tersimpan: ${rombelTersimpan}, PTK tersimpan: ${ptkTersimpan}, Akun operator dibuat: ${akunBaru.length}${akunDilewati > 0 ? ` (${akunDilewati} dilewati)` : ''}.`
      };

      await addSyncLog(log);
      catatAudit('sinkron_terapkan', {
        entitas: 'sinkron',
        ringkasan: `Sinkron Dapodik: +${ditambahkan} baru, ~${diperbarui} diperbarui, ${akunBaru.length} akun baru`,
        detail: log.pesan.slice(0, 200),
      });
      onRefreshData();

      setComparison(null);
      setDapodikSekolah(null);
      setDapodikRombel([]);
      setRombelDerived(false);
      setDapodikPtk([]);
      setDapodikPengguna([]);
      setRombelComparison(null);
      setSelectedPenggunaIds([]);
      const doneMsg = `Selesai! Siswa baru: ${ditambahkan}, diperbarui: ${diperbarui}${gagal > 0 ? `, gagal: ${gagal}` : ''}, rombel: ${rombelTersimpan}, PTK: ${ptkTersimpan}, akun operator baru: ${akunBaru.length}.`;
      setProcessStatus(doneMsg);
      setSyncPercent(100);
      const adaGagalSimpan = simpanGagal.length > 0;
      if (gagal > 0 || adaGagalSimpan) {
        setSyncResult({
          kind: 'warning',
          title: 'Sinkronisasi Selesai dengan Peringatan',
          message: `${doneMsg} ${akunDilewati > 0 ? `${akunDilewati} akun dilewati (username sudah ada).` : ''}${adaGagalSimpan ? ' PERHATIAN: referensi yang gagal tersimpan tidak akan muncul di modul GTK/Rombel.' : ''}`,
          details: gagalPesan.slice(0, 5),
        });
        toast(`Sinkronisasi selesai dengan peringatan${gagal > 0 ? ` (${gagal} gagal)` : ''}.`, 'warning');
      } else {
        setSyncResult({
          kind: 'success',
          title: 'Sinkronisasi Berhasil',
          message: `${doneMsg} Seluruh data terpilih tersimpan ke Buku Induk.`,
        });
        toast('Sinkronisasi Dapodik berhasil tersimpan!', 'success');
      }
    } catch (err: any) {
      const msg = err.message || 'Kesalahan saat menyimpan sinkronisasi';
      setSyncSteps((prev) => prev.map((s) => (s.status === 'active' ? { ...s, status: 'error' as const, detail: msg.slice(0, 120) } : s)));
      setSyncPercent(100);
      setSyncResult({
        kind: 'error',
        title: 'Penyimpanan Sinkronisasi Gagal',
        message: msg,
        details: gagalPesan.slice(0, 5),
      });
      toast(`Kesalahan saat menyimpan sinkronisasi: ${msg}`, 'error');
    } finally {
      setLoadingSync(false);
      // D11: selalu lepas kunci operasi panjang.
      bukaKunciOperasiPanjang();
    }
  };

  const handleToggleSelectPengguna = (id: string) => {
    setSelectedPenggunaIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
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
      setSelectedBaruIds(comparison.baru.map((b, i) => getDapodikKey(b, i)));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-6 rounded-2xl shadow-sm relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-800/80 text-blue-200 text-xs font-semibold mb-2">
            <Server className="w-3.5 h-3.5 text-amber-300" />
            Integrasi Resmi Dapodik Kemdikbudristek RI
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            Sinkronisasi Web Service Dapodik Lokal
          </h2>
          <p className="text-sm text-blue-100 mt-1 leading-relaxed">
            Tarik seluruh data pokok {jenjang} — peserta didik, rombongan belajar, PTK, pengguna, dan profil sekolah — langsung dari database aplikasi Dapodik di komputer/laptop operator tanpa perlu input ulang.
          </p>
          {sessionTahun && (sessionTahun.trim() !== (sekolah.tahunAjaran || '').trim()) && (
            <p className="mt-3 inline-flex items-start gap-2 text-[11px] font-semibold text-amber-100 bg-amber-500/15 border border-amber-300/40 rounded-xl px-3 py-2">
              <AlertTriangle className="w-4 h-4 mt-px shrink-0 text-amber-300" />
              <span>
                Sesi login Anda TA {sessionTahun}, tetapi sinkronisasi selalu menulis ke tahun aktif database ({sekolah.tahunAjaran}).
                Hasil tarikan Dapodik masuk ke tahun aktif, bukan ke sesi.
              </span>
            </p>
          )}
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
            <li>Klik tombol <strong>Tambah</strong>, masukkan nama aplikasi misalnya: <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">Buku Induk Siswa {jenjang}</code>.</li>
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
                  Host / Alamat IP Dapodik *
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
                  Port Web Service *
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
                  NPSN Sekolah *
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
                  <option value="20261">2026/2027 Ganjil (20261) — aktif</option>
                  <option value="20262">2026/2027 Genap (20262)</option>
                  {!['20261', '20262'].includes(cfg.semesterId) && cfg.semesterId && (
                    <option value={cfg.semesterId}>Tersimpan: {cfg.semesterId} (ganti ke 20261)</option>
                  )}
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Token Web Service Dapodik (Bearer Key) *
              </label>
              <input
                type="text"
                required
                aria-required="true"
                value={cfg.token}
                onChange={(e) => setCfg({ ...cfg, token: e.target.value })}
                placeholder="Salin token dari menu Pengaturan Web Service di aplikasi Dapodik"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
              {/* S7: token tersimpan plaintext di perangkat ini (IndexedDB /
                  localStorage) — tidak ikut file backup, tetapi siapa pun
                  yang memegang perangkat dapat membacanya. */}
              <p className="mt-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                Token tersimpan <strong>plaintext</strong> di perangkat ini. Jangan bagikan file
                backup/config yang memuatnya; token tidak ikut diekspor ke file backup.
              </p>
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

      {/* Progress bar + notifikasi hasil sinkronisasi */}
      {(loadingSync || syncSteps.length > 0 || syncResult) && syncSteps.length > 0 && (
        <SyncProgressBar
          title={syncTitle}
          subtitle={
            loadingSync
              ? 'Mohon tunggu, jangan tutup halaman ini…'
              : syncResult
                ? processStatus || undefined
                : processStatus || undefined
          }
          percent={syncPercent}
          steps={syncSteps}
          result={syncResult}
          onDismissResult={() => {
            setSyncResult(null);
            if (!loadingSync) {
              setSyncSteps([]);
              setSyncPercent(0);
            }
          }}
          onRetry={syncResult?.kind === 'error' ? () => handleFetchData(lastWasSimulation) : undefined}
        />
      )}

      {/* Fallback teks status (kompatibilitas lama) */}
      {processStatus && syncSteps.length === 0 && !syncResult && (
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{processStatus}</p>
      )}

      {/* School Identity Notification / Card from Dapodik Sync */}
      {refStatus.sekolah && !dapodikSekolah && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠ {refStatus.sekolah} — data siswa tetap diproses. Salin pesan ini dan buka Console browser (F12) untuk detail teknis.
        </p>
      )}
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
                {!(dapodikSekolah.nama || dapodikSekolah.npsn) && (
                  <p className="mt-1 text-[11px] text-amber-200 bg-amber-500/20 border border-amber-300/40 rounded-lg px-2.5 py-1.5">
                    Respons getSekolah tidak dikenali (kolom kosong). Buka Console browser (F12), salin objek
                    <code className="font-mono"> [dapodik] getSekolah raw </code>
                    dan kirim ke pengembang untuk penyesuaian mapping.
                  </p>
                )}
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
              <span className="text-[10px] text-slate-300">Bentuk: {dapodikSekolah.bentuk_pendidikan_id_str || jenjang} ({dapodikSekolah.status_sekolah_str || dapodikSekolah.status_sekolah || 'Negeri'})</span>
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

      {/* Akun operator yang baru dibuat (tampilkan sekali, ada password awal) */}
      {createdAccounts.length > 0 && (
        <div className="bg-emerald-50 rounded-xl border border-emerald-300 shadow-xs p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-extrabold text-sm text-emerald-900 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-700" />
              Akun Operator Baru dari Dapodik ({createdAccounts.length})
            </h3>
            <button
              onClick={() => setCreatedAccounts([])}
              className="text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer"
            >
              Sembunyikan (catat dulu passwordnya!)
            </button>
          </div>
          <p className="text-[11px] text-emerald-800">
            Bagikan username + password awal ini ke petugas, lalu minta mereka mengganti lewat menu pengguna → Ganti Kata Sandi.
          </p>
          <div className="overflow-x-auto border border-emerald-200 rounded-lg bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-emerald-100/60 text-emerald-900 uppercase font-semibold text-[10px] border-b border-emerald-200">
                <tr>
                  <th className="p-2.5">Nama</th>
                  <th className="p-2.5">Username</th>
                  <th className="p-2.5">Password Awal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-100">
                {createdAccounts.map((a) => (
                  <tr key={a.username}>
                    <td className="p-2.5 font-semibold text-slate-800">{a.nama}</td>
                    <td className="p-2.5 font-mono text-slate-800">{a.username}</td>
                    <td className="p-2.5 font-mono font-bold text-emerald-800">{a.password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Data Referensi Dapodik: Rombel, PTK, Pengguna */}
      {(dapodikRombel.length > 0 || dapodikPtk.length > 0 || dapodikPengguna.length > 0) && (
        <div className="bg-white rounded-xl border border-indigo-200 shadow-xs p-5 space-y-5">
          <div>
            <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
              <Server className="w-5 h-5 text-indigo-700" />
              Data Referensi Dapodik
            </h3>
            <p className="text-xs text-slate-500">
              {dapodikRombel.length} rombongan belajar • {dapodikPtk.length} PTK • {dapodikPengguna.length} pengguna.
              Rombel & PTK otomatis tersimpan saat <strong>"Terapkan Sinkronisasi"</strong> diklik.
            </p>
            {rombelDerived && (
              <p className="mt-2 text-[11px] text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                Daftar rombel diturunkan otomatis dari data peserta didik karena getRombonganBelajar ditolak Dapodik.
              </p>
            )}
            {(refStatus.rombel || refStatus.ptk || refStatus.pengguna) && (
              <div className="mt-2 space-y-1.5">
                {[refStatus.rombel, refStatus.ptk, refStatus.pengguna].filter((m): m is string => !!m).map((msg) => (
                  <p key={msg} className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    ⚠ {msg} — salin pesan ini dan buka Console browser (F12) untuk detail teknis.
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Rombel */}
          {dapodikRombel.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-bold text-xs uppercase tracking-wide text-slate-900 flex items-center gap-1.5">
                <School className="w-4 h-4 text-indigo-700" />
                Rombongan Belajar (getRombonganBelajar)
              </h4>
              {rombelComparison && (rombelComparison.hanyaDapodik.length > 0 || rombelComparison.hanyaLokal.length > 0) && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {rombelComparison.hanyaDapodik.length > 0 && (
                    <span>Baru di Dapodik: <strong>{rombelComparison.hanyaDapodik.map((r) => r.nama).join(', ')}</strong>. </span>
                  )}
                  {rombelComparison.hanyaLokal.length > 0 && (
                    <span>Hanya ada di lokal (tidak di Dapodik): <strong>{rombelComparison.hanyaLokal.join(', ')}</strong>.</span>
                  )}
                </p>
              )}
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Rombel</th>
                      <th className="p-2.5 text-center">Tingkat</th>
                      <th className="p-2.5">Wali Kelas (Dapodik)</th>
                      <th className="p-2.5 text-center">Anggota</th>
                      <th className="p-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dapodikRombel.map((r, idx) => {
                      const isBaru = rombelComparison?.hanyaDapodik.some((x) => x.rombongan_belajar_id === r.rombongan_belajar_id);
                      return (
                        <tr key={`${r.rombongan_belajar_id || 'rombel'}-${idx}`} className="hover:bg-slate-50">
                          <td className="p-2.5 font-bold text-slate-900">{r.nama}</td>
                          <td className="p-2.5 text-center text-slate-700">
                            Kelas {mapTingkatKelas(r.tingkat_pendidikan_id, r.nama, jenjang)}
                          </td>
                          <td className="p-2.5 text-slate-700">{(r.nama_wali || r.wali || '-') as string}</td>
                          <td className="p-2.5 text-center font-semibold text-slate-800">{Number(r.jumlah_anggota) || 0}</td>
                          <td className="p-2.5 text-center">
                            {isBaru ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">Baru</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Cocok</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PTK */}
          {dapodikPtk.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-bold text-xs uppercase tracking-wide text-slate-900 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-indigo-700" />
                Pendidik & Tenaga Kependidikan (getPTK)
              </h4>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Nama</th>
                      <th className="p-2.5">NIP</th>
                      <th className="p-2.5">Jenis PTK</th>
                      <th className="p-2.5">Mengajar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dapodikPtk.map((p, idx) => (
                      <tr key={`${p.ptk_id || 'ptk'}-${idx}`} className="hover:bg-slate-50">
                        <td className="p-2.5 font-bold text-slate-900">{p.nama}</td>
                        <td className="p-2.5 font-mono text-slate-700">{p.nip || '-'}</td>
                        <td className="p-2.5 text-slate-700">{(p.jenis_ptk_id_str || '-') as string}</td>
                        <td className="p-2.5 text-slate-700">{(p.mata_pelajaran_ajar || '-') as string}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pengguna -> akun operator */}
          {dapodikPengguna.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-bold text-xs uppercase tracking-wide text-slate-900 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-indigo-700" />
                Pengguna Dapodik → Akun Operator (getPengguna)
              </h4>
              <p className="text-[11px] text-slate-500">
                Centang pengguna yang ingin dijadikan akun operator aplikasi. Username yang sudah ada akan dilewati otomatis.
              </p>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="p-2.5 w-8">
                        <input
                          type="checkbox"
                          checked={selectedPenggunaIds.length === dapodikPengguna.length && dapodikPengguna.length > 0}
                          onChange={() => setSelectedPenggunaIds(
                            selectedPenggunaIds.length === dapodikPengguna.length ? [] : dapodikPengguna.map((p) => p.pengguna_id)
                          )}
                          className="w-4 h-4 rounded text-blue-600"
                        />
                      </th>
                      <th className="p-2.5">Username</th>
                      <th className="p-2.5">Nama</th>
                      <th className="p-2.5">Peran (Dapodik)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dapodikPengguna.map((p, idx) => (
                      <tr key={`${p.pengguna_id || 'pengguna'}-${idx}`} className="hover:bg-slate-50">
                        <td className="p-2.5">
                          <input
                            type="checkbox"
                            checked={selectedPenggunaIds.includes(p.pengguna_id)}
                            onChange={() => handleToggleSelectPengguna(p.pengguna_id)}
                            className="w-4 h-4 rounded text-blue-600"
                          />
                        </td>
                        <td className="p-2.5 font-mono font-semibold text-slate-800">{p.username}</td>
                        <td className="p-2.5 text-slate-700">{p.nama || '-'}</td>
                        <td className="p-2.5 text-slate-700">{(p.peran || p.peran_id_str || '-') as string}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Comparison View Table (Appears when fetched) */}
      {comparison && !loadingSync && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-amber-900 leading-relaxed">
            <strong>Belum tersimpan!</strong> {comparison.baru.length} siswa baru, {comparison.berbeda.length} berubah,{' '}
            {dapodikRombel.length} rombel, {dapodikPtk.length} PTK/GTK menunggu diterapkan. Data baru muncul di
            Master Siswa & modul GTK <strong>setelah</strong> Anda menekan tombol di bawah.
          </p>
          <button
            onClick={() => document.getElementById('terapkan-sinkron')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-sm transition shrink-0 cursor-pointer"
          >
            Ke Tombol Terapkan ↓
          </button>
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
              id="terapkan-sinkron"
              onClick={handleApplySync}
              disabled={loadingSync || (selectedBaruIds.length === 0 && selectedBerbedaIds.length === 0 && !syncSekolahChecked && selectedPenggunaIds.length === 0 && dapodikRombel.length === 0 && dapodikPtk.length === 0)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm transition active:scale-95 disabled:opacity-50 text-xs cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Terapkan: {selectedBaruIds.length + selectedBerbedaIds.length} Siswa
              {syncSekolahChecked && dapodikSekolah ? ' + Sekolah' : ''}
              {dapodikRombel.length > 0 ? ` + ${dapodikRombel.length} Rombel` : ''}
              {dapodikPtk.length > 0 ? ` + ${dapodikPtk.length} PTK` : ''}
              {selectedPenggunaIds.length > 0 ? ` + ${selectedPenggunaIds.length} Akun` : ''}
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
                      {comparison.baru.map((b, idx) => {
                        const rowKey = getDapodikKey(b, idx);
                        return (
                        <tr
                          key={`${rowKey}-${idx}`}
                          className={`hover:bg-blue-50/50 transition cursor-pointer ${
                            selectedBaruIds.includes(rowKey) ? 'bg-blue-50/30' : ''
                          }`}
                          onClick={() => handleToggleSelectBaru(rowKey)}
                        >
                          <td className="p-3">
                            <input
                              type="checkbox"
                              checked={selectedBaruIds.includes(rowKey)}
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
                        );
                      })}
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
                  {comparison.berbeda.map((item, idx) => {
                    const rowKey = getDapodikKey(item.dapodik, idx);
                    return (
                    <div
                      key={`${rowKey}-${idx}`}
                      className="p-3 border border-amber-200 bg-amber-50/40 rounded-lg text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-bold text-slate-900 text-sm">{item.existing.namaLengkap}</span>
                          <span className="text-slate-500 ml-2 font-mono">NISN: {item.existing.nisn}</span>
                          {item.arsip && (
                            <span className="ml-2 inline-flex items-center gap-1 px-2 py-px rounded-full bg-slate-200 text-slate-700 text-[10px] font-extrabold uppercase">
                              <Lock className="w-3 h-3" />
                              Arsip ({item.existing.statusSiswa})
                            </span>
                          )}
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer font-semibold text-amber-900">
                          <input
                            type="checkbox"
                            checked={selectedBerbedaIds.includes(rowKey)}
                            onChange={() => {
                              setSelectedBerbedaIds((prev) =>
                                prev.includes(rowKey)
                                  ? prev.filter((id) => id !== rowKey)
                                  : [...prev, rowKey]
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
                        {item.arsip && (
                          <p className="mt-1.5 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                            Record berstatus arsip — pembaruan hanya menyentuh identitas, tidak mengubah
                            status maupun menimpa rombel dengan tebakan.
                          </p>
                        )}
                      </div>
                    </div>
                    );
                  })}
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
