import React, { useState, useMemo, useEffect } from 'react';
import {
  Award,
  Search,
  Calendar,
  Plus,
  Printer,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileText,
  Sparkles,
  TrendingUp,
  Users,
  ChevronRight,
  BookOpen,
  ArrowUpRight,
  School,
  X,
  Save,
  RotateCcw,
  CheckSquare,
  Square,
  Lock
} from 'lucide-react';
import {
  Siswa, 
  SekolahProfile, 
  RaportSemester, 
  NilaiMataPelajaran, 
  TingkatKelas, 
  FaseKurikulum, 
  AppUser,
  PtkRef 
} from '../types';
import {
  getTingkatOptions,
  getDefaultRombelOptions,
  getDefaultMataPelajaran,
  calculatePredikat,
  generateDeskripsiOtomatis,
  buildInitialNilaiMapel,
  getFaseKurikulum,
  getRaportList,
  getNilaiList
} from '../utils/raportUtils';
import { saveSiswaRaport, deleteSiswaRaport, promoteSiswaKenaikanKelas, getTahunAjaranTerakhirSiswa, tahunAjaranSebelumnya } from '../utils/db';
import { tahunBerikutnya } from '../utils/arsip';
import { canUserAccessTahun } from '../utils/tahunAjaran';
import { opsiTahunMaksSesi, tahanMaksSesi } from '../utils/sesi';
import { PageControl } from './PageControl';
import { KopSuratView } from './KopSuratView';
import { GtkAutocomplete } from './GtkAutocomplete';
import { toast, confirmDialog } from '../utils/notify';
import { validateRaportForm } from '../utils/validation';
import { startTopProgress, doneTopProgress } from '../utils/progress';

interface NilaiRaportViewProps {
  siswaList: Siswa[];
  sekolah: SekolahProfile;
  currentUser?: AppUser;
  /** Tahun ajaran yang dikunci arsip — simpan & promosi dari tahun ini ditolak. */
  tahunTerkunci?: string[];
  /** Data GTK untuk autocomplete wali kelas. */
  ptk?: PtkRef[];
  /** Sesi tahun ajaran hasil login per-TA (dipakai sebagai default filter). */
  sessionTahun?: string | null;
  onDataChanged: () => void;
}

export const NilaiRaportView: React.FC<NilaiRaportViewProps> = ({
  siswaList,
  sekolah,
  currentUser,
  tahunTerkunci,
  ptk,
  sessionTahun,
  onDataChanged
}) => {
  const jenjang = sekolah.jenjang || (sekolah.bentukPendidikan?.toUpperCase().includes('SD') ? 'SD' : 'SMP');
  const tingkatOptions = useMemo(() => getTingkatOptions(jenjang), [jenjang]);
  const rombelOptions = useMemo(() => {
    const list = new Set<string>();
    getDefaultRombelOptions(jenjang).forEach((r) => list.add(r));
    siswaList.forEach((s) => {
      if (s.rombelSaatIni) list.add(s.rombelSaatIni);
    });
    return Array.from(list).sort();
  }, [jenjang, siswaList]);

  // Year choices: dari profil + sesi login + data (tanpa tahun contoh statis,
  // agar database baru/kosong tidak memunculkan opsi tahun lama).
  // Cutoff sesi: tahun di atas sesi aktif tidak ditawarkan.
  const sesiEfektif = (sessionTahun || sekolah.tahunAjaran || '').trim();
  const availableTahunAjaran = useMemo(() => {
    const years = new Set<string>();
    if (sekolah.tahunAjaran) years.add(sekolah.tahunAjaran);
    if (sessionTahun) years.add(sessionTahun);
    siswaList.forEach((s) => {
      s.riwayatSemester?.forEach((r) => {
        if (r.tahunAjaran) years.add(r.tahunAjaran);
      });
      getRaportList(s).forEach((nr) => {
        if (nr.tahunAjaran) years.add(nr.tahunAjaran);
      });
      s.riwayatTahunAjaran?.forEach((rt) => {
        if (rt.tahunAjaran) years.add(rt.tahunAjaran);
      });
    });
    if (years.size === 0) years.add('2026/2027');
    return opsiTahunMaksSesi(Array.from(years).sort().reverse(), sesiEfektif);
  }, [sekolah.tahunAjaran, sessionTahun, siswaList, sesiEfektif]);

  // Filter States — default mengikuti sesi login per-TA bila ada.
  const [selectedTahun, setSelectedTahun] = useState<string>(sessionTahun || sekolah.tahunAjaran || '2026/2027');
  const [selectedSemester, setSelectedSemester] = useState<'1' | '2'>(
    sekolah.semesterAktif?.includes('2') ? '2' : '1'
  );
  const [selectedRombel, setSelectedRombel] = useState<string>('all');
  const [selectedTingkat, setSelectedTingkat] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Ikuti sesi login: setiap ganti sesi TA, filter raport ikut berpindah.
  useEffect(() => {
    if (sessionTahun) setSelectedTahun(sessionTahun);
  }, [sessionTahun]);

  // Cutoff sesi: pilihan di atas sesi dikembalikan ke sesi.
  useEffect(() => {
    if (sesiEfektif && selectedTahun !== sesiEfektif && selectedTahun > sesiEfektif) {
      setSelectedTahun(sesiEfektif);
    }
  }, [sesiEfektif, selectedTahun]);

  // Active View Tab: 'list' | 'kenaikan'
  const [activeTab, setActiveTab] = useState<'list' | 'kenaikan'>('list');

  // Modals
  const [editingRaportSiswa, setEditingRaportSiswa] = useState<Siswa | null>(null);
  const [activeRaportForm, setActiveRaportForm] = useState<RaportSemester | null>(null);
  const [printingRaport, setPrintingRaport] = useState<{ siswa: Siswa; raport: RaportSemester } | null>(null);
  const [viewingHistorySiswa, setViewingHistorySiswa] = useState<Siswa | null>(null);

  // Kenaikan Kelas Selection
  const [selectedForPromotion, setSelectedForPromotion] = useState<string[]>([]);
  const [targetPromotionTahun, setTargetPromotionTahun] = useState<string>(() =>
    tahunBerikutnya(sekolah.tahunAjaran || '') || '2027/2028'
  );
  const [targetPromotionTingkat, setTargetPromotionTingkat] = useState<TingkatKelas>(
    jenjang === 'SD' ? '2' : '8'
  );
  const [targetPromotionRombel, setTargetPromotionRombel] = useState<string>(
    jenjang === 'SD' ? '2A' : '8A'
  );
  const [targetPromotionStatus, setTargetPromotionStatus] = useState<'Naik Kelas' | 'Lulus'>('Naik Kelas');
  const [isPromoting, setIsPromoting] = useState<boolean>(false);

  // Filtered Siswa
  const filteredSiswa = useMemo(() => {
    return siswaList.filter((s) => {
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNama = s.namaLengkap.toLowerCase().includes(q);
        const matchNisn = s.nisn?.includes(q);
        const matchNipd = s.nipd?.includes(q);
        if (!matchNama && !matchNisn && !matchNipd) return false;
      }

      // Rombel
      if (selectedRombel !== 'all' && s.rombelSaatIni !== selectedRombel) {
        return false;
      }

      // Tingkat
      if (selectedTingkat !== 'all') {
        const startsWithTingkat = s.rombelSaatIni?.startsWith(selectedTingkat);
        if (!startsWithTingkat) return false;
      }

      return true;
    });
  }, [siswaList, searchQuery, selectedRombel, selectedTingkat]);

  // F2: kandidat promosi tab Kenaikan Kelas HANYA siswa berstatus 'Aktif'.
  // Siswa arsip ('Lulus'/'Mutasi Keluar'/lainnya) disaring dari daftar agar
  // tidak pernah terpilih untuk dipromosi.
  const kandidatPromosi = useMemo(
    () => filteredSiswa.filter((s) => s.statusSiswa === 'Aktif'),
    [filteredSiswa]
  );

  // Helper to get student's raport for current filter
  const getRaportForStudent = (s: Siswa, tahun: string, semester: '1' | '2'): RaportSemester | undefined => {
    const list = getRaportList(s);
    return list.find((r) => r && r.tahunAjaran === tahun && r.semester === semester);
  };

  // ----- Page control untuk daftar list -----
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(10);

  // Kembali ke halaman 1 setiap filter/daftar berubah agar tidak nyasar ke halaman kosong
  useEffect(() => {
    setListPage(1);
  }, [searchQuery, selectedRombel, selectedTingkat, selectedTahun, selectedSemester, siswaList.length]);

  const listTotalPages = Math.max(1, Math.ceil(filteredSiswa.length / listPageSize));
  const listSafePage = Math.min(listPage, listTotalPages);
  const pagedSiswa = useMemo(() => {
    const start = (listSafePage - 1) * listPageSize;
    return filteredSiswa.slice(start, start + listPageSize);
  }, [filteredSiswa, listSafePage, listPageSize]);

  // Open Edit Raport
  const handleOpenEditRaport = (siswa: Siswa) => {
    const existing = getRaportForStudent(siswa, selectedTahun, selectedSemester);
    const tingkat = (siswa.rombelSaatIni ? (siswa.rombelSaatIni.charAt(0) as TingkatKelas) : (jenjang === 'SD' ? '1' : '7'));
    const fase = getFaseKurikulum(tingkat);

    if (existing) {
      setActiveRaportForm({ ...existing });
    } else {
      // Create new fresh template with default subjects
      const initialMapel = buildInitialNilaiMapel(jenjang, tingkat);
      const avg = Math.round(initialMapel.reduce((acc, m) => acc + m.nilaiAkhir, 0) / initialMapel.length);
      setActiveRaportForm({
        id: `rap-${siswa.id}-${selectedTahun.replace(/\//g, '-')}-${selectedSemester}`,
        siswaId: siswa.id,
        tahunAjaran: selectedTahun,
        semester: selectedSemester,
        tingkat,
        rombel: siswa.rombelSaatIni || (jenjang === 'SD' ? '1A' : '7A'),
        fase,
        waliKelas: sekolah.petugasBukuInduk || 'Wali Kelas',
        nipWaliKelas: sekolah.nipPetugas || '-',
        tanggalRaport: new Date().toISOString().split('T')[0],
        nilaiMapel: initialMapel,
        rataRataNilai: avg,
        ekstrakurikuler: [
          {
            nama: jenjang === 'SD' ? 'Pramuka Siaga' : 'Pramuka Penggalang',
            predikat: 'Baik',
            keterangan: 'Aktif mengikuti kegiatan kepramukaan mingguan.'
          }
        ],
        kehadiran: { sakit: 0, izin: 0, alpa: 0 },
        catatanWaliKelas: 'Tingkatkan motivasi belajar dan terus aktif mengembangkan karakter Profil Pelajar Pancasila.',
        statusKenaikan: selectedSemester === '2' ? 'Naik Kelas' : 'Belum Ditentukan'
      });
    }
    setEditingRaportSiswa(siswa);
  };

  // Save Raport
  const handleSaveRaport = async () => {
    if (!editingRaportSiswa || !activeRaportForm) return;

    if (!canUserAccessTahun(currentUser, activeRaportForm.tahunAjaran)) {
      toast(`Akses ditolak: akun @${currentUser?.username} tidak memiliki akses ke tahun ${activeRaportForm.tahunAjaran}.`, 'error');
      return;
    }

    // Input hanya pada sesi aktif (tulis tepat di tahun sesi).
    if (sesiEfektif && (activeRaportForm.tahunAjaran || '').trim() !== sesiEfektif) {
      toast(`Di luar sesi aktif (TA ${sesiEfektif}). Pindah sesi ke ${activeRaportForm.tahunAjaran} untuk input tahun tersebut.`, 'error');
      return;
    }

    if ((tahunTerkunci || []).includes(activeRaportForm.tahunAjaran)) {
      toast(`Tahun ${activeRaportForm.tahunAjaran} terkunci arsip. Buka kuncinya di tab Arsip bila memang perlu dikoreksi.`, 'error');
      return;
    }

    const issues = validateRaportForm({
      tahunAjaran: activeRaportForm.tahunAjaran,
      semester: activeRaportForm.semester,
      tingkat: activeRaportForm.tingkat,
      rombel: activeRaportForm.rombel,
      nilaiMapel: activeRaportForm.nilaiMapel,
    });
    if (issues.length > 0) {
      toast(issues[0], 'error');
      return;
    }

    // Recalculate average
    const total = activeRaportForm.nilaiMapel.reduce((sum, m) => sum + (Number(m.nilaiAkhir) || 0), 0);
    const avg = activeRaportForm.nilaiMapel.length > 0 
      ? Number((total / activeRaportForm.nilaiMapel.length).toFixed(1)) 
      : 0;

    const toSave: RaportSemester = {
      ...activeRaportForm,
      nilaiMapel: [...(activeRaportForm.nilaiMapel || [])],
      nilaiMataPelajaran: [...(activeRaportForm.nilaiMapel || [])],
      rataRataNilai: avg
    };

    startTopProgress();
    try {
      await saveSiswaRaport(editingRaportSiswa.id, toSave);
      onDataChanged();
      toast(`Nilai raport ${editingRaportSiswa.namaLengkap} (TP ${toSave.tahunAjaran} Semester ${toSave.semester}) berhasil disimpan.`, 'success');
      setEditingRaportSiswa(null);
      setActiveRaportForm(null);
    } catch (err: any) {
      toast(`Gagal menyimpan nilai raport: ${err.message}`, 'error');
    } finally {
      doneTopProgress();
    }
  };

  // Auto Generate all descriptions for current form
  const handleAutoGenerateDeskripsi = () => {
    if (!activeRaportForm) return;
    const updatedMapel = activeRaportForm.nilaiMapel.map((m) => {
      const pred = calculatePredikat(m.nilaiAkhir);
      const desk = generateDeskripsiOtomatis(m.mataPelajaran, m.nilaiAkhir, jenjang, activeRaportForm.tingkat);
      return {
        ...m,
        predikat: pred,
        capaianTertinggi: desk.capaianTertinggi,
        capaianPerluPeningkatan: desk.capaianPerluPeningkatan
      };
    });
    setActiveRaportForm({
      ...activeRaportForm,
      nilaiMapel: updatedMapel
    });
  };

  // Add custom subject line
  const handleAddMapel = () => {
    if (!activeRaportForm) return;
    const newM: NilaiMataPelajaran = {
      id: `mapel-${Date.now()}`,
      mataPelajaran: 'Mata Pelajaran Baru',
      kategori: 'Pilihan',
      nilaiAkhir: 80,
      predikat: 'B',
      capaianTertinggi: 'Menunjukkan pemahaman materi pembelajaran yang baik.',
      capaianPerluPeningkatan: 'Perlu latihan lebih lanjut.'
    };
    setActiveRaportForm({
      ...activeRaportForm,
      nilaiMapel: [...activeRaportForm.nilaiMapel, newM]
    });
  };

  // Delete subject line
  const handleDeleteMapel = (id: string) => {
    if (!activeRaportForm) return;
    setActiveRaportForm({
      ...activeRaportForm,
      nilaiMapel: activeRaportForm.nilaiMapel.filter((m) => m.id !== id)
    });
  };

  // Handle Kenaikan Kelas Promosi
  const handleExecutePromotion = async () => {
    if (selectedForPromotion.length === 0) {
      toast('Silakan pilih minimal satu siswa untuk dipromosikan.', 'warning');
      return;
    }
    // Lewati siswa yang tahun terakhirnya terkunci arsip (riwayatnya tak boleh ditulis ulang).
    const terkunci = (tahunTerkunci || []).map((t) => t.trim());
    // F2: anotasi tipe eksplisit agar guard status di bawah ter-typecheck.
    const byId = new Map<string, Siswa>((siswaList || []).map((s) => [s.id, s]));
    const boleh = selectedForPromotion.filter((id) => {
      const s = byId.get(id);
      if (!s) return false;
      // F2: guard eksplisit — promosi HANYA untuk status 'Aktif'. Siswa
      // arsip ('Lulus'/'Mutasi Keluar'/lainnya) tidak boleh diproses karena
      // eksekusi memaksa statusSiswa kembali 'Aktif'.
      if (s.statusSiswa !== 'Aktif') return false;
      const tahunLama = (getTahunAjaranTerakhirSiswa(s) || '').trim();
      return !(tahunLama && terkunci.includes(tahunLama));
    });
    const ditahan = selectedForPromotion.length - boleh.length;
    if (ditahan > 0) {
      toast(`${ditahan} siswa dilewati (bukan status Aktif atau tahun terakhirnya terkunci arsip).`, 'warning');
    }
    if (boleh.length === 0) {
      toast('Tidak ada siswa yang dapat dipromosi (semua terkunci arsip).', 'error');
      return;
    }
    if (!targetPromotionTahun || !/^\d{4}\/\d{4}$/.test(targetPromotionTahun.trim())) {
      toast('Tahun ajaran baru wajib berformat TAHUN/TAHUN (cth. 2027/2028).', 'error');
      return;
    }
    if (!canUserAccessTahun(currentUser, targetPromotionTahun.trim())) {
      toast(`Akses ditolak: akun @${currentUser?.username} tidak memiliki akses ke tahun ${targetPromotionTahun.trim()}.`, 'error');
      return;
    }
    // Promosi manual menulis ke tahun target — wajib tepat pada sesi aktif.
    if (sesiEfektif && targetPromotionTahun.trim() !== sesiEfektif) {
      toast(`Di luar sesi aktif (TA ${sesiEfektif}). Pindah sesi ke ${targetPromotionTahun.trim()} untuk promosi ke tahun tersebut.`, 'error');
      return;
    }
    if (!targetPromotionRombel || !targetPromotionRombel.trim()) {
      toast('Rombel baru wajib diisi (cth. 8A).', 'error');
      return;
    }
    const confirmMsg = `Apakah Anda yakin ingin memproses ${targetPromotionStatus} untuk ${boleh.length} siswa ke Rombel ${targetPromotionRombel} Tahun Ajaran ${targetPromotionTahun}?`;
    if (!(await confirmDialog(confirmMsg, { confirmLabel: 'Ya, Proses', danger: false }))) return;

    setIsPromoting(true);
    try {
      const count = await promoteSiswaKenaikanKelas(
        boleh,
        targetPromotionTahun,
        targetPromotionTingkat,
        targetPromotionRombel,
        targetPromotionStatus,
        tahunAjaranSebelumnya(targetPromotionTahun.trim()) // F1: tahun sesi promosi → tahunLama riwayat
      );
      toast(`Berhasil memperbarui data multi-tahun untuk ${count} siswa!`, 'success');
      setSelectedForPromotion([]);
      onDataChanged();
    } catch (err: any) {
      toast(`Gagal memproses kenaikan kelas: ${err.message}`, 'error');
    } finally {
      setIsPromoting(false);
    }
  };

  // F2: pilih-semua hanya menyentuh kandidat Aktif.
  const handleToggleSelectAll = () => {
    if (selectedForPromotion.length === kandidatPromosi.length && kandidatPromosi.length > 0) {
      setSelectedForPromotion([]);
    } else {
      setSelectedForPromotion(kandidatPromosi.map((s) => s.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    if (selectedForPromotion.includes(id)) {
      setSelectedForPromotion(selectedForPromotion.filter((item) => item !== id));
    } else {
      setSelectedForPromotion([...selectedForPromotion, id]);
    }
  };

  // Date Formatter
  const formatDateIndo = (dStr?: string) => {
    if (!dStr) return '-';
    try {
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return dStr;
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return dStr;
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-3xl shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-400/20 via-transparent to-transparent pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-mono text-[11px] font-bold border border-amber-400/30 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5" />
                {jenjang === 'SD' ? 'Kurikulum Merdeka SD (Fase A-C)' : 'Kurikulum Merdeka SMP (Fase D)'}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-200 text-[11px] font-semibold border border-blue-400/30">
                Multi-Tahun Ajaran
              </span>
            </div>
          </div>

          {/* Quick Action Switcher */}
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md p-1.5 rounded-2xl border border-white/20 shrink-0">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'list'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-blue-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Daftar Nilai Raport</span>
            </button>
            <button
              onClick={() => setActiveTab('kenaikan')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'kenaikan'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-blue-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>Kenaikan Kelas & Multi-Tahun</span>
            </button>
          </div>
        </div>
      </div>

      {/* Control / Filter Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* Tahun Ajaran */}
          <div>
            <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              Tahun Ajaran
            </label>
            <div className="relative">
              <select
                value={selectedTahun}
                onChange={(e) => setSelectedTahun(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-blue-600 focus:outline-none"
              >
                {availableTahunAjaran.map((yr) => (
                  <option key={yr} value={yr}>
                    TP {yr} {yr === sekolah.tahunAjaran ? '(Aktif)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Semester */}
          <div>
            <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              Semester
            </label>
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value as '1' | '2')}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-blue-600 focus:outline-none"
            >
              <option value="1">Semester 1 (Ganjil)</option>
              <option value="2">Semester 2 (Genap)</option>
            </select>
          </div>

          {/* Tingkat Kelas */}
          <div>
            <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <School className="w-3.5 h-3.5 text-emerald-600" />
              Tingkat Kelas ({jenjang})
            </label>
            <select
              value={selectedTingkat}
              onChange={(e) => setSelectedTingkat(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-800 focus:ring-2 focus:ring-blue-600 focus:outline-none"
            >
              <option value="all">Semua Tingkat</option>
              {tingkatOptions.map((t) => (
                <option key={t} value={t}>
                  Kelas {t} ({getFaseKurikulum(t)})
                </option>
              ))}
            </select>
          </div>

          {/* Rombel */}
          <div>
            <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-amber-600" />
              Rombel Kelas
            </label>
            <select
              value={selectedRombel}
              onChange={(e) => setSelectedRombel(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-800 focus:ring-2 focus:ring-blue-600 focus:outline-none"
            >
              <option value="all">Semua Rombel</option>
              {rombelOptions.map((r) => (
                <option key={r} value={r}>
                  Rombel {r}
                </option>
              ))}
            </select>
          </div>

          {/* Search Bar */}
          <div>
            <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-slate-500" />
              Cari Siswa
            </label>
            <input
              type="text"
              placeholder="Nama, NISN, NIPD..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-800 focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
          </div>
        </div>

        {/* Quick Stats Strip */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4 text-slate-600">
            <span>
              Total Siswa Terfilter: <strong className="text-slate-900">{filteredSiswa.length}</strong>
            </span>
            <span>•</span>
            <span>
              Raport Terisi Semester Ini:{' '}
              <strong className="text-emerald-700 font-bold">
                {
                  filteredSiswa.filter((s) => getRaportForStudent(s, selectedTahun, selectedSemester))
                    .length
                }
              </strong>
            </span>
            <span>•</span>
            <span>
              Belum Diisi:{' '}
              <strong className="text-rose-600 font-bold">
                {
                  filteredSiswa.filter((s) => !getRaportForStudent(s, selectedTahun, selectedSemester))
                    .length
                }
              </strong>
            </span>
          </div>

          <div className="text-[11px] text-slate-500">
            Fase Kurikulum:{' '}
            <span className="font-semibold text-blue-800">
              {jenjang === 'SD' ? 'Fase A (1-2), Fase B (3-4), Fase C (5-6)' : 'Fase D (7-9)'}
            </span>
            {sessionTahun && (
              <span className={`ml-2 px-2 py-0.5 rounded font-mono font-bold ${selectedTahun === sessionTahun ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                Sesi {sessionTahun}{selectedTahun !== sessionTahun ? ` • lihat ${selectedTahun}` : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Tab 1: Nilai Raport List View */}
      {activeTab === 'list' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">No</th>
                  <th className="py-3 px-4">Peserta Didik</th>
                  <th className="py-3 px-4 text-center">Rombel / Fase</th>
                  <th className="py-3 px-4 text-center">Status Raport ({selectedTahun} S{selectedSemester})</th>
                  <th className="py-3 px-4 text-center">Rata-rata Nilai</th>
                  <th className="py-3 px-4 text-center">Kehadiran (S/I/A)</th>
                  <th className="py-3 px-4 text-center">Riwayat Belajar</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSiswa.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      Tidak ada data siswa yang cocok dengan filter di atas.
                    </td>
                  </tr>
                ) : (
                  pagedSiswa.map((siswa, idx) => {
                    const raport = getRaportForStudent(siswa, selectedTahun, selectedSemester);
                    const allRaportsCount = getRaportList(siswa).length;
                    const tingkat = siswa.rombelSaatIni?.charAt(0) as TingkatKelas || '7';

                    return (
                      <tr key={siswa.id} className="hover:bg-blue-50/40 transition">
                        <td className="py-3.5 px-4 text-center font-medium text-slate-500">
                          {(listSafePage - 1) * listPageSize + idx + 1}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 text-sm">{siswa.namaLengkap}</div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2 font-mono">
                            <span>NISN: {siswa.nisn || '-'}</span>
                            <span>•</span>
                            <span>NIPD: {siswa.nipd || '-'}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-800 font-bold rounded-lg border border-slate-200">
                            {siswa.rombelSaatIni || '-'}
                          </span>
                          <div className="text-[10px] text-slate-500 mt-1">
                            {getFaseKurikulum(tingkat)}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          {raport ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-800 font-bold rounded-lg border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Lengkap ({getNilaiList(raport).length} Mapel)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-800 font-semibold rounded-lg border border-amber-200">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                              Belum Diisi
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          {raport && raport.rataRataNilai !== undefined ? (
                            <div>
                              <span className="text-base font-black text-blue-900">
                                {raport.rataRataNilai}
                              </span>
                              <span className="ml-1 text-xs font-bold text-slate-500">
                                ({calculatePredikat(raport.rataRataNilai)})
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">-</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-center font-mono">
                          {raport ? (
                            <span className="text-slate-700">
                              S: <strong className="text-blue-700">{raport.kehadiran.sakit}</strong> | I: <strong className="text-amber-700">{raport.kehadiran.izin}</strong> | A: <strong className="text-rose-700">{raport.kehadiran.alpa}</strong>
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => setViewingHistorySiswa(siswa)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-[11px] transition"
                            title="Lihat riwayat raport multi-tahun siswa ini"
                          >
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span>{allRaportsCount} Raport Tersimpan</span>
                          </button>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEditRaport(siswa)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>{raport ? 'Edit Nilai' : 'Input Nilai'}</span>
                            </button>

                            {raport && (
                              <button
                                onClick={() => setPrintingRaport({ siswa, raport })}
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                                title="Cetak Lembar Raport Kurikulum Merdeka Siswa Ini"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Cetak</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {/* Page control */}
          {filteredSiswa.length > 0 && (
            <PageControl
              page={listSafePage}
              totalPages={listTotalPages}
              totalItems={filteredSiswa.length}
              pageSize={listPageSize}
              itemName="siswa"
              onPageChange={(p) => setListPage(p)}
              onPageSizeChange={(s) => { setListPageSize(s); setListPage(1); }}
            />
          )}
        </div>
      )}

      {/* Main Tab 2: Kenaikan Kelas & Promosi Multi-Tahun */}
      {activeTab === 'kenaikan' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-700" />
                Alur Kenaikan Kelas & Pelacakan Multi-Tahun Siswa ({jenjang})
              </h3>
              <p className="text-xs text-slate-500">
                Pilih peserta didik yang dinyatakan naik kelas atau lulus, kemudian tentukan rombel dan tahun ajaran tujuan untuk mencatat riwayat kenaikan kelas multi-tahun secara otomatis.
                {/* F2: hanya status 'Aktif' yang ditampilkan — siswa arsip (Lulus/Mutasi Keluar/dsb.) tidak dapat dipromosi. */}
                <span className="block mt-1 font-semibold text-slate-600">
                  Hanya siswa berstatus Aktif yang ditampilkan sebagai kandidat promosi.
                </span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs transition flex items-center gap-1.5"
              >
                {selectedForPromotion.length === kandidatPromosi.length && kandidatPromosi.length > 0 ? (
                  <>
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                    Batal Pilih Semua
                  </>
                ) : (
                  <>
                    <Square className="w-4 h-4 text-slate-500" />
                    Pilih Semua ({kandidatPromosi.length})
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Form Promosi Target */}
          <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-200/80 space-y-3">
            <h4 className="font-bold text-blue-950 text-xs flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-700" />
              Tentukan Sasaran Kenaikan Kelas / Kelulusan
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Keputusan Akhir</label>
                <select
                  value={targetPromotionStatus}
                  onChange={(e) => setTargetPromotionStatus(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-800"
                >
                  <option value="Naik Kelas">Naik Kelas</option>
                  <option value="Lulus">Lulus Satuan Pendidikan</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tahun Ajaran Baru</label>
                <input
                  type="text"
                  value={targetPromotionTahun}
                  onChange={(e) => setTargetPromotionTahun(e.target.value)}
                  placeholder="2027/2028"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tingkat Baru</label>
                <select
                  value={targetPromotionTingkat}
                  onChange={(e) => setTargetPromotionTingkat(e.target.value as TingkatKelas)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-800"
                >
                  {tingkatOptions.map((t) => (
                    <option key={t} value={t}>
                      Kelas {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Rombel Baru</label>
                <input
                  type="text"
                  value={targetPromotionRombel}
                  onChange={(e) => setTargetPromotionRombel(e.target.value)}
                  placeholder="8A"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-800 uppercase"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                disabled={selectedForPromotion.length === 0 || isPromoting}
                onClick={handleExecutePromotion}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer"
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>
                  {isPromoting
                    ? 'Memproses...'
                    : `Proses ${targetPromotionStatus} (${selectedForPromotion.length} Siswa Terpilih)`}
                </span>
              </button>
            </div>
          </div>

          {/* List Siswa Checkable */}
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
            {/* F2: hanya kandidat berstatus 'Aktif' yang dirender sebagai kandidat promosi */}
            {kandidatPromosi.map((s) => {
              const isChecked = selectedForPromotion.includes(s.id);
              return (
                <div
                  key={s.id}
                  onClick={() => handleToggleSelect(s.id)}
                  className={`p-3 flex items-center justify-between gap-3 text-xs cursor-pointer transition ${
                    isChecked ? 'bg-blue-50/80 font-medium' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}} // handled by row click
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-slate-900">{s.namaLengkap}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        NISN: {s.nisn || '-'} | Rombel Saat Ini: <strong>{s.rombelSaatIni}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="text-right text-[11px]">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                      {s.statusSiswa}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL INPUT / EDIT NILAI RAPORT */}
      {editingRaportSiswa && activeRaportForm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden text-xs">
            {/* Header Modal */}
            <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-blue-400/20 text-blue-200 font-mono text-[11px]">
                    TP {activeRaportForm.tahunAjaran} • Semester {activeRaportForm.semester}
                  </span>
                  {(tahunTerkunci || []).includes(activeRaportForm.tahunAjaran) && (
                    <span className="px-2 py-0.5 rounded bg-rose-500/25 text-rose-100 font-bold text-[11px] flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Terkunci arsip
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded bg-amber-400/20 text-amber-200 font-bold text-[11px]">
                    {activeRaportForm.fase}
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-black tracking-tight mt-1 text-white">
                  Pengisian Nilai Raport: {editingRaportSiswa.namaLengkap}
                </h2>
                <p className="text-blue-200 text-xs font-mono">
                  NISN: {editingRaportSiswa.nisn || '-'} • Rombel: {activeRaportForm.rombel} • Jenjang: {jenjang}
                </p>
              </div>

              <button
                onClick={() => {
                  setEditingRaportSiswa(null);
                  setActiveRaportForm(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body Form */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
              {/* Tool bar pintar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAutoGenerateDeskripsi}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Generate Deskripsi Capaian Otomatis</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAddMapel}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Mapel Kustom</span>
                  </button>
                </div>

                <div className="text-right">
                  <span className="text-slate-500 text-[11px] block">Rata-rata Nilai:</span>
                  <span className="text-lg font-black text-blue-900">
                    {activeRaportForm.nilaiMapel.length > 0
                      ? (
                          activeRaportForm.nilaiMapel.reduce(
                            (acc, m) => acc + (Number(m.nilaiAkhir) || 0),
                            0
                          ) / activeRaportForm.nilaiMapel.length
                        ).toFixed(1)
                      : 0}
                  </span>
                </div>
              </div>

              {/* Tabel Mata Pelajaran & Deskripsi Capaian */}
              <div className="space-y-3">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-700" />
                  Daftar Nilai Akhir & Deskripsi Capaian Kompetensi (Kurikulum Merdeka)
                </h3>

                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">No</th>
                        <th className="py-2.5 px-3 w-48">Mata Pelajaran</th>
                        <th className="py-2.5 px-3 w-20 text-center">Nilai (0-100)</th>
                        <th className="py-2.5 px-3 w-16 text-center">Predikat</th>
                        <th className="py-2.5 px-3">Capaian Tertinggi</th>
                        <th className="py-2.5 px-3">Perlu Peningkatan</th>
                        <th className="py-2.5 px-3 w-10 text-center">Hapus</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeRaportForm.nilaiMapel.map((m, mIdx) => (
                        <tr key={m.id || mIdx} className="hover:bg-slate-50/80">
                          <td className="py-2.5 px-3 text-center text-slate-400 font-bold">
                            {mIdx + 1}
                          </td>

                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              required
                              aria-required="true"
                              aria-label={`Nama mata pelajaran baris ${mIdx + 1}`}
                              value={m.mataPelajaran}
                              onChange={(e) => {
                                const copy = [...activeRaportForm.nilaiMapel];
                                copy[mIdx] = { ...copy[mIdx], mataPelajaran: e.target.value };
                                setActiveRaportForm({ ...activeRaportForm, nilaiMapel: copy });
                              }}
                              className="w-full px-2 py-1 bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-600 rounded font-semibold text-slate-800 focus:outline-none"
                            />
                            <span className="text-[10px] text-slate-400 block px-2">
                              {m.kategori || 'Wajib'}
                            </span>
                          </td>

                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="number"
                              required
                              aria-required="true"
                              aria-label={`Nilai ${m.mataPelajaran || `baris ${mIdx + 1}`} (0-100)`}
                              min={0}
                              max={100}
                              value={m.nilaiAkhir}
                              onChange={(e) => {
                                const raw = e.target.value === '' ? 0 : Number(e.target.value);
                                const val = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 0;
                                const copy = [...activeRaportForm.nilaiMapel];
                                copy[mIdx] = { 
                                  ...copy[mIdx], 
                                  nilaiAkhir: val,
                                  predikat: calculatePredikat(val)
                                };
                                setActiveRaportForm({ ...activeRaportForm, nilaiMapel: copy });
                              }}
                              className="w-16 px-2 py-1 text-center font-bold text-sm bg-blue-50 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                            />
                          </td>

                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`px-2 py-1 rounded font-bold text-xs ${
                                m.predikat === 'A'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : m.predikat === 'B'
                                  ? 'bg-blue-100 text-blue-800'
                                  : m.predikat === 'C'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {m.predikat || calculatePredikat(m.nilaiAkhir)}
                            </span>
                          </td>

                          <td className="py-2.5 px-3">
                            <textarea
                              rows={2}
                              value={m.capaianTertinggi || ''}
                              onChange={(e) => {
                                const copy = [...activeRaportForm.nilaiMapel];
                                copy[mIdx] = { ...copy[mIdx], capaianTertinggi: e.target.value };
                                setActiveRaportForm({ ...activeRaportForm, nilaiMapel: copy });
                              }}
                              placeholder="Ketercapaian kompetensi sangat baik..."
                              className="w-full px-2 py-1 text-[11px] border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                            />
                          </td>

                          <td className="py-2.5 px-3">
                            <textarea
                              rows={2}
                              value={m.capaianPerluPeningkatan || ''}
                              onChange={(e) => {
                                const copy = [...activeRaportForm.nilaiMapel];
                                copy[mIdx] = { ...copy[mIdx], capaianPerluPeningkatan: e.target.value };
                                setActiveRaportForm({ ...activeRaportForm, nilaiMapel: copy });
                              }}
                              placeholder="Perlu bimbingan dalam hal..."
                              className="w-full px-2 py-1 text-[11px] border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                            />
                          </td>

                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteMapel(m.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                              title="Hapus mata pelajaran ini"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Kehadiran & Ekstrakurikuler */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Kehadiran */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                    Ketidakhadiran (Hari)
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-slate-600 text-[11px] mb-1 font-medium">Sakit</label>
                      <input
                        type="number"
                        min={0}
                        value={activeRaportForm.kehadiran.sakit}
                        onChange={(e) =>
                          setActiveRaportForm({
                            ...activeRaportForm,
                            kehadiran: {
                              ...activeRaportForm.kehadiran,
                              sakit: Number(e.target.value) || 0
                            }
                          })
                        }
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-[11px] mb-1 font-medium">Izin</label>
                      <input
                        type="number"
                        min={0}
                        value={activeRaportForm.kehadiran.izin}
                        onChange={(e) =>
                          setActiveRaportForm({
                            ...activeRaportForm,
                            kehadiran: {
                              ...activeRaportForm.kehadiran,
                              izin: Number(e.target.value) || 0
                            }
                          })
                        }
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-[11px] mb-1 font-medium">
                        Tanpa Keterangan
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={activeRaportForm.kehadiran.alpa}
                        onChange={(e) =>
                          setActiveRaportForm({
                            ...activeRaportForm,
                            kehadiran: {
                              ...activeRaportForm.kehadiran,
                              alpa: Number(e.target.value) || 0
                            }
                          })
                        }
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold"
                      />
                    </div>
                  </div>
                </div>

                {/* Info Pengesahan */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                    Wali Kelas & Tanggal Pembagian
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 text-[11px] mb-1 font-medium">Nama Wali Kelas (dari data GTK)</label>
                      <GtkAutocomplete
                        value={activeRaportForm.waliKelas || ''}
                        ptk={ptk || []}
                        placeholder="Ketik untuk mencari di data GTK…"
                        onChange={(v) =>
                          setActiveRaportForm({ ...activeRaportForm, waliKelas: v })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-[11px] mb-1 font-medium">Tanggal Raport</label>
                      <input
                        type="date"
                        value={activeRaportForm.tanggalRaport || ''}
                        onChange={(e) =>
                          setActiveRaportForm({ ...activeRaportForm, tanggalRaport: e.target.value })
                        }
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Catatan Wali Kelas & Keputusan Kenaikan */}
              <div className="space-y-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Catatan Wali Kelas</label>
                  <textarea
                    rows={2}
                    value={activeRaportForm.catatanWaliKelas || ''}
                    onChange={(e) =>
                      setActiveRaportForm({ ...activeRaportForm, catatanWaliKelas: e.target.value })
                    }
                    placeholder="Tuliskan motivasi, perkembangan karakter, dan rekomendasi pembelajaran..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>

                {activeRaportForm.semester === '2' && (
                  <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 space-y-2">
                    <h4 className="font-bold text-amber-900 text-xs">
                      Keputusan Akhir Semester Genap (Kenaikan Kelas / Kelulusan)
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-700 text-xs mb-1 font-medium">Status Keputusan</label>
                        <select
                          value={activeRaportForm.statusKenaikan || 'Naik Kelas'}
                          onChange={(e) =>
                            setActiveRaportForm({
                              ...activeRaportForm,
                              statusKenaikan: e.target.value as any
                            })
                          }
                          className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl font-bold"
                        >
                          <option value="Naik Kelas">Naik Kelas</option>
                          <option value="Tinggal di Kelas">Tinggal di Kelas</option>
                          <option value="Lulus">Lulus</option>
                          <option value="Tidak Lulus">Tidak Lulus</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-700 text-xs mb-1 font-medium">Naik ke Tingkat / Kelas</label>
                        <select
                          value={activeRaportForm.naikKeTingkat || (jenjang === 'SD' ? '2' : '8')}
                          onChange={(e) =>
                            setActiveRaportForm({
                              ...activeRaportForm,
                              naikKeTingkat: e.target.value as TingkatKelas
                            })
                          }
                          className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl font-bold"
                        >
                          {tingkatOptions.map((t) => (
                            <option key={t} value={t}>
                              Kelas {t}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Modal */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setEditingRaportSiswa(null);
                  setActiveRaportForm(null);
                }}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl font-semibold transition"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleSaveRaport}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Nilai Raport</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PRINTABLE OFFICIAL RAPORT */}
      {printingRaport && (
        <div className="print-sheet-root fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[96vh] flex flex-col overflow-hidden text-slate-900 print:max-h-none print:shadow-none print:border-none print:w-full">
            {/* Action Bar (hidden on print) */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-blue-400" />
                <span className="font-bold text-sm">
                  Pratinjau Lembar Raport Kurikulum Merdeka
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak / Simpan PDF</span>
                </button>
                <button
                  onClick={() => setPrintingRaport(null)}
                  className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Raport Sheet */}
            <div className="print-sheet p-8 sm:p-10 overflow-y-auto space-y-6 text-xs bg-white text-slate-900 print:p-0 print:overflow-visible">
              {/* Kop Satuan Pendidikan (diatur di Profil Sekolah → Kop Surat) */}
              <KopSuratView sekolah={sekolah} />

              {/* Title Report */}
              <div className="text-center pt-2">
                <h3 className="text-sm font-black uppercase tracking-wider underline">
                  LAPORAN HASIL BELAJAR (RAPORT PESERTA DIDIK)
                </h3>
                <p className="text-xs font-semibold text-slate-700">
                  STANDAR KURIKULUM MERDEKA • {sekolah.jenjang === 'SD' ? 'SEKOLAH DASAR (SD)' : 'SEKOLAH MENENGAH PERTAMA (SMP)'}
                </p>
              </div>

              {/* Student Metadata Table */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[11px] border border-slate-300 p-3 rounded-lg bg-slate-50/50">
                <div className="flex">
                  <span className="w-36 text-slate-600">Nama Peserta Didik</span>
                  <span className="font-bold text-slate-900">: {printingRaport.siswa.namaLengkap}</span>
                </div>
                <div className="flex">
                  <span className="w-36 text-slate-600">Kelas / Rombel</span>
                  <span className="font-bold text-slate-900">: {printingRaport.raport.rombel}</span>
                </div>
                <div className="flex">
                  <span className="w-36 text-slate-600">NISN / NIPD</span>
                  <span className="font-mono text-slate-900">: {printingRaport.siswa.nisn || '-'} / {printingRaport.siswa.nipd || '-'}</span>
                </div>
                <div className="flex">
                  <span className="w-36 text-slate-600">Fase</span>
                  <span className="font-bold text-slate-900">: {printingRaport.raport.fase}</span>
                </div>
                <div className="flex">
                  <span className="w-36 text-slate-600">Nama Sekolah</span>
                  <span className="font-medium text-slate-900">: {sekolah.nama}</span>
                </div>
                <div className="flex">
                  <span className="w-36 text-slate-600">Semester</span>
                  <span className="font-bold text-slate-900">: {printingRaport.raport.semester} ({printingRaport.raport.semester === '1' ? 'Ganjil' : 'Genap'})</span>
                </div>
                <div className="flex">
                  <span className="w-36 text-slate-600">Alamat Sekolah</span>
                  <span className="text-slate-800">: {sekolah.alamat}</span>
                </div>
                <div className="flex">
                  <span className="w-36 text-slate-600">Tahun Ajaran</span>
                  <span className="font-bold text-slate-900">: {printingRaport.raport.tahunAjaran}</span>
                </div>
              </div>

              {/* Table Nilai & Capaian */}
              <div className="space-y-2">
                <h4 className="font-bold text-xs uppercase tracking-wide text-slate-900">
                  A. NILAI AKADEMIK & CAPAIAN PEMBELAJARAN
                </h4>
                <table className="w-full border-collapse border border-slate-400 text-[10px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800">
                      <th className="border border-slate-400 p-2 text-center w-8">No</th>
                      <th className="border border-slate-400 p-2 w-44">Mata Pelajaran</th>
                      <th className="border border-slate-400 p-2 text-center w-16">Nilai Akhir</th>
                      <th className="border border-slate-400 p-2 text-center w-12">Predikat</th>
                      <th className="border border-slate-400 p-2">Capaian Kompetensi Tertinggi & Perlu Peningkatan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getNilaiList(printingRaport.raport).map((m, idx) => (
                      <tr key={m.id || idx}>
                        <td className="border border-slate-400 p-2 text-center font-semibold">
                          {idx + 1}
                        </td>
                        <td className="border border-slate-400 p-2 font-bold text-slate-900">
                          {m.mataPelajaran}
                        </td>
                        <td className="border border-slate-400 p-2 text-center font-bold text-slate-900">
                          {m.nilaiAkhir}
                        </td>
                        <td className="border border-slate-400 p-2 text-center font-bold">
                          {m.predikat || calculatePredikat(m.nilaiAkhir)}
                        </td>
                        <td className="border border-slate-400 p-2 space-y-1">
                          {m.capaianTertinggi && (
                            <p className="text-slate-800">
                              <strong className="text-slate-900">Tercapai:</strong> {m.capaianTertinggi}
                            </p>
                          )}
                          {m.capaianPerluPeningkatan && (
                            <p className="text-slate-600 italic">
                              <strong>Perlu Bimbingan:</strong> {m.capaianPerluPeningkatan}
                            </p>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold">
                      <td colSpan={2} className="border border-slate-400 p-2 text-center uppercase">
                        Rata-rata Nilai Hasil Belajar
                      </td>
                      <td className="border border-slate-400 p-2 text-center text-sm font-black text-slate-900">
                        {printingRaport.raport.rataRataNilai || '-'}
                      </td>
                      <td colSpan={2} className="border border-slate-400 p-2 text-slate-600 font-normal">
                        Ketercapaian pembelajaran tuntas sesuai ketentuan Kurikulum Merdeka
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Ekstrakurikuler & Kehadiran */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <h4 className="font-bold text-xs uppercase tracking-wide text-slate-900">
                    B. EKSTRAKURIKULER
                  </h4>
                  <table className="w-full border-collapse border border-slate-400 text-[10px]">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="border border-slate-400 p-1.5 text-center w-8">No</th>
                        <th className="border border-slate-400 p-1.5">Kegiatan Ekstrakurikuler</th>
                        <th className="border border-slate-400 p-1.5 text-center w-20">Predikat</th>
                        <th className="border border-slate-400 p-1.5">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printingRaport.raport.ekstrakurikuler && printingRaport.raport.ekstrakurikuler.length > 0 ? (
                        printingRaport.raport.ekstrakurikuler.map((ek, idx) => (
                          <tr key={idx}>
                            <td className="border border-slate-400 p-1.5 text-center">{idx + 1}</td>
                            <td className="border border-slate-400 p-1.5 font-bold">{ek.nama}</td>
                            <td className="border border-slate-400 p-1.5 text-center font-semibold">{ek.predikat}</td>
                            <td className="border border-slate-400 p-1.5 text-slate-700">{ek.keterangan}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="border border-slate-400 p-2 text-center text-slate-400 italic">
                            Tidak mengikuti ekstrakurikuler khusus
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-1">
                  <h4 className="font-bold text-xs uppercase tracking-wide text-slate-900">
                    C. KETIDAKHADIRAN
                  </h4>
                  <table className="w-full border-collapse border border-slate-400 text-[10px]">
                    <tbody>
                      <tr>
                        <td className="border border-slate-400 p-1.5 w-44">Sakit</td>
                        <td className="border border-slate-400 p-1.5 font-bold text-center">
                          {printingRaport.raport.kehadiran.sakit} hari
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-slate-400 p-1.5">Izin</td>
                        <td className="border border-slate-400 p-1.5 font-bold text-center">
                          {printingRaport.raport.kehadiran.izin} hari
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-slate-400 p-1.5">Tanpa Keterangan</td>
                        <td className="border border-slate-400 p-1.5 font-bold text-center">
                          {printingRaport.raport.kehadiran.alpa} hari
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Catatan Wali Kelas */}
              <div className="border border-slate-400 p-3 rounded-lg space-y-1">
                <h4 className="font-bold text-xs uppercase text-slate-900">D. CATATAN WALI KELAS</h4>
                <p className="text-[11px] text-slate-800 italic">
                  "{printingRaport.raport.catatanWaliKelas || 'Pertahankan prestasi belajar dan karakter terpuji.'}"
                </p>
              </div>

              {/* Status Kenaikan jika semester 2 */}
              {printingRaport.raport.semester === '2' && (
                <div className="border-2 border-slate-900 p-3 rounded-lg text-center space-y-0.5">
                  <span className="text-[11px] font-bold text-slate-600 block uppercase">
                    Keputusan Kenaikan Kelas / Kelulusan:
                  </span>
                  <span className="text-sm font-black text-slate-900 uppercase">
                    Berdasarkan pencapaian seluruh kompetensi, siswa dinyatakan:{' '}
                    <span className="underline">{printingRaport.raport.statusKenaikan || 'NAIK KELAS'}</span>
                    {printingRaport.raport.statusKenaikan === 'Naik Kelas' && printingRaport.raport.naikKeTingkat && (
                      <span> Ke Kelas {printingRaport.raport.naikKeTingkat}</span>
                    )}
                  </span>
                </div>
              )}

              {/* Tanda Tangan */}
              <div className="grid grid-cols-3 gap-6 text-center text-[11px] pt-6 break-inside-avoid">
                <div>
                  <p className="text-slate-600">Mengetahui,</p>
                  <p className="font-semibold text-slate-900">Orang Tua / Wali Peserta Didik</p>
                  <div className="h-16 flex items-center justify-center text-slate-300 italic text-[10px]">
                    (Tanda Tangan)
                  </div>
                  <p className="font-bold text-slate-900 underline">
                    {printingRaport.siswa.ayah?.nama || '...........................................'}
                  </p>
                </div>

                <div>
                  <p className="text-slate-600">
                    {sekolah.kabupatenKota || 'Kota'}, {formatDateIndo(printingRaport.raport.tanggalRaport)}
                  </p>
                  <p className="font-semibold text-slate-900">Wali Kelas</p>
                  <div className="h-16 flex items-center justify-center text-slate-300 italic text-[10px]">
                    (Tanda Tangan)
                  </div>
                  <p className="font-bold text-slate-900 underline">
                    {printingRaport.raport.waliKelas || sekolah.petugasBukuInduk}
                  </p>
                  <p className="text-slate-600 font-mono text-[10px]">
                    NIP. {printingRaport.raport.nipWaliKelas || '-'}
                  </p>
                </div>

                <div>
                  <p className="text-slate-600">Mengetahui,</p>
                  <p className="font-semibold text-slate-900">Kepala {sekolah.nama}</p>
                  <div className="h-16 flex items-center justify-center text-slate-300 italic text-[10px]">
                    (Tanda Tangan & Cap)
                  </div>
                  <p className="font-bold text-slate-900 underline">{sekolah.kepalaSekolah}</p>
                  <p className="text-slate-600 font-mono text-[10px]">NIP. {sekolah.nipKepalaSekolah}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RIWAYAT NILAI MULTI-TAHUN */}
      {viewingHistorySiswa && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-xs">
            <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                <h3 className="font-bold text-sm">
                  Rekam Riwayat Akademik & Raport Multi-Tahun: {viewingHistorySiswa.namaLengkap}
                </h3>
              </div>
              <button
                onClick={() => setViewingHistorySiswa(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {/* Riwayat Tahun Ajaran (Kenaikan Kelas) — cutoff sesi */}
              {tahanMaksSesi(viewingHistorySiswa.riwayatTahunAjaran || [], (rt) => rt.tahunAjaran, sesiEfektif).length > 0 && (
                <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-200 space-y-2">
                  <h4 className="font-bold text-blue-950 text-xs flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-700" />
                    Riwayat Kenaikan Tingkat / Rombel Multi-Tahun
                  </h4>
                  <div className="space-y-1.5">
                    {tahanMaksSesi(viewingHistorySiswa.riwayatTahunAjaran || [], (rt) => rt.tahunAjaran, sesiEfektif).map((rt) => (
                      <div
                        key={rt.id}
                        className="bg-white p-2.5 rounded-lg border border-blue-100 flex items-center justify-between text-[11px]"
                      >
                        <div>
                          <strong className="text-slate-900">TP {rt.tahunAjaran}</strong>: Kelas {rt.tingkat} (Rombel {rt.rombel})
                          <p className="text-slate-500 text-[10px]">{rt.catatan || '-'}</p>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                          {rt.statusAkhirTahun}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Daftar Nilai Raport Per Semester — cutoff sesi */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  Daftar Nilai Raport yang Tersimpan
                </h4>
                {tahanMaksSesi(getRaportList(viewingHistorySiswa), (rap) => rap.tahunAjaran, sesiEfektif).length > 0 ? (
                  <div className="space-y-3">
                    {tahanMaksSesi(getRaportList(viewingHistorySiswa), (rap) => rap.tahunAjaran, sesiEfektif).map((rap) => (
                      <div
                        key={rap.id}
                        className="border border-slate-200 rounded-xl p-4 bg-slate-50 hover:bg-slate-100/60 transition space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-bold text-[11px]">
                              TP {rap.tahunAjaran}
                            </span>
                            <span className="font-bold text-slate-800 text-xs">
                              Semester {rap.semester} ({rap.semester === '1' ? 'Ganjil' : 'Genap'})
                            </span>
                            <span className="text-slate-500 text-[11px]">
                              • Rombel {rap.rombel} ({rap.fase})
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-blue-900">
                              Rata-rata: {rap.rataRataNilai}
                            </span>
                            <button
                              onClick={() => {
                                setViewingHistorySiswa(null);
                                setPrintingRaport({ siswa: viewingHistorySiswa, raport: rap });
                              }}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg text-[11px] flex items-center gap-1"
                            >
                              <Printer className="w-3 h-3" />
                              Cetak
                            </button>
                          </div>
                        </div>

                        {/* Ringkasan Nilai Mapel */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-[10px]">
                          {getNilaiList(rap).map((m, mIdx) => (
                            <div key={mIdx} className="bg-white p-1.5 rounded border border-slate-200 flex justify-between">
                              <span className="text-slate-700 truncate pr-2" title={m.mataPelajaran}>
                                {m.mataPelajaran}
                              </span>
                              <span className="font-bold text-slate-900 shrink-0">
                                {m.nilaiAkhir} ({m.predikat})
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 italic text-center py-6">
                    Belum ada rekaman nilai raport yang disimpan untuk siswa ini.
                  </p>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setViewingHistorySiswa(null)}
                className="px-4 py-2 bg-slate-800 text-white font-semibold rounded-xl text-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
