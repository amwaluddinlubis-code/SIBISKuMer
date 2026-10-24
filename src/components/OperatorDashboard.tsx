import React, { useEffect, useMemo, useState } from 'react';
import {
  Sun,
  ClipboardList,
  Award,
  Camera,
  Printer,
  Plus,
  ArrowRight,
  Users,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Database,
  Contact,
  Filter,
  CalendarClock,
  ArrowLeftRight,
  FileWarning,
} from 'lucide-react';
import { Siswa, SekolahProfile, DapodikSyncLog, AppUser, RombelRef } from '../types';
import { tahunSesiEfektif } from '../utils/sesi';
import { statusBackupTerakhir } from '../utils/autoBackup';
import {
  DashboardFilter,
  DEFAULT_DASHBOARD_FILTER,
  KONDISI_LABELS,
  KondisiDrillDown,
  ROMBEL_KOSONG,
  STATUS_SISWA_OPTIONS,
  dataWajibKosong,
  hitungArus,
  hitungRingkasan,
  hitungTenggat,
  hitungTugas,
  raportBelum,
  rentangTanggalValid,
  type SiswaPresetFilter,
} from '../utils/dashboard';

interface OperatorDashboardProps {
  siswa: Siswa[];
  /** Jumlah siswa SEBELUM filter dasbor (visibleSiswa) — ditampilkan sebagai "X dari Y". */
  jumlahSebelumFilter?: number;
  sekolah: SekolahProfile;
  syncLogs: DapodikSyncLog[];
  rombelRefs: RombelRef[];
  gtkCount: number;
  currentUser: AppUser | null;
  isAdmin: boolean;
  /** Sesi tahun ajaran login — antrean raport & rombel mengikuti sesi ini. */
  sessionTahun?: string | null;
  /** Filter roster dasbor (tahun/rombel/status) — dikelola App agar kartu
   *  DashboardStats & dasbor ini selalu memakai daftar yang sama. */
  filter: DashboardFilter;
  onFilterChange: (f: DashboardFilter) => void;
  /** Opsi tahun untuk filter (daftar TA dari App). */
  tahunOptions?: string[];
  /** Drill-down: buka daftar data sumber pembentuk angka. */
  onDrillDown?: (kondisi: KondisiDrillDown, opts?: Partial<SiswaPresetFilter> & { tujuan?: 'siswa' | 'raport' }) => void;
  onOpenBackup?: () => void;
  onNavigate: (tab: string) => void;
  onAddSiswa: () => void;
  onEditSiswa: (s: Siswa) => void;
  onViewSiswa: (s: Siswa) => void;
  onPrintLembar: (s: Siswa) => void;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 19) return 'Selamat sore';
  return 'Selamat malam';
}

function activeSemester(sekolah: SekolahProfile): '1' | '2' {
  return (sekolah.semesterAktif || '').includes('2') ? '2' : '1';
}

export const OperatorDashboard: React.FC<OperatorDashboardProps> = ({
  siswa,
  jumlahSebelumFilter,
  sekolah,
  syncLogs,
  rombelRefs,
  gtkCount,
  currentUser,
  isAdmin,
  sessionTahun,
  filter,
  onFilterChange,
  tahunOptions,
  onDrillDown,
  onOpenBackup,
  onNavigate,
  onAddSiswa,
  onEditSiswa,
  onViewSiswa,
  onPrintLembar,
}) => {
  // Fondasi sesi: antrean raport selalu merujuk tahun sesi, bukan tahun profil.
  const tahunAktif = tahunSesiEfektif(sessionTahun, sekolah.tahunAjaran) || '2026/2027';
  const sesiBedaAktif = !!sessionTahun && !!sekolah.tahunAjaran && sessionTahun.trim() !== sekolah.tahunAjaran.trim();
  const semesterAktif = activeSemester(sekolah);

  // Rentang tanggal HANYA untuk widget Arus (penerimaan/keluar). Roster
  // adalah potret keadaan sekarang dan tidak dipengaruhi rentang.
  const [arusDari, setArusDari] = useState('');
  const [arusSampai, setArusSampai] = useState('');
  const arusRentangValid = rentangTanggalValid(arusDari, arusSampai);

  const ringkasan = useMemo(() => hitungRingkasan(siswa), [siswa]);
  const tugas = useMemo(
    () => hitungTugas(siswa, { tahunAktif, semesterAktif }),
    [siswa, tahunAktif, semesterAktif]
  );
  const arus = useMemo(
    () => hitungArus(siswa, arusDari, arusSampai),
    [siswa, arusDari, arusSampai]
  );
  // Sumber tunggal status backup (QA Fase 1.6) — sama dengan Dasbor admin
  // dan modul Backup: snapshot IndexedDB terbaru, bukan catatan setting.
  const [hariSejakBackup, setHariSejakBackup] = useState<number | null>(null);
  useEffect(() => {
    let hidup = true;
    statusBackupTerakhir()
      .then((st) => {
        if (!hidup) return;
        setHariSejakBackup(
          st.waktu ? Math.floor((Date.now() - new Date(st.waktu).getTime()) / 86400000) : null
        );
      })
      .catch(() => {
        if (hidup) setHariSejakBackup(null);
      });
    return () => {
      hidup = false;
    };
  }, []);
  const raportTugas = tugas.find((t) => t.id === 'raport-belum');
  const tenggat = useMemo(
    () =>
      hitungTenggat({
        hariSejakBackup,
        raportBelum: raportTugas?.jumlah ?? 0,
        raportTotal: (siswa || []).filter((s) => s.statusSiswa === 'Aktif').length,
        tahunAktif,
        semesterAktif,
      }),
    [hariSejakBackup, raportTugas?.jumlah, siswa, tahunAktif, semesterAktif]
  );

  const perRombel = useMemo(() => {
    const map = new Map<string, Siswa[]>();
    for (const s of siswa || []) {
      const key = (s.rombelSaatIni || 'Tanpa Rombel').trim() || 'Tanpa Rombel';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return [...map.entries()]
      .map(([nama, list]) => {
        const lengkap = list.filter((s) => !dataWajibKosong(s)).length;
        const raportOk = list.filter((s) => !raportBelum(s, tahunAktif, semesterAktif)).length;
        const wali = rombelRefs.find((r) => (r.nama || '').trim().toUpperCase() === nama.trim().toUpperCase())?.waliKelas;
        return {
          nama,
          total: list.length,
          laki: list.filter((s) => s.jenisKelamin === 'L').length,
          lengkapPct: list.length > 0 ? Math.round((lengkap / list.length) * 100) : 100,
          raportOk,
          wali,
        };
      })
      .sort((a, b) => a.nama.localeCompare(b.nama));
  }, [siswa, rombelRefs, tahunAktif, semesterAktif]);

  const rombelFilterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rombelRefs || []) if ((r.nama || '').trim()) set.add(r.nama.trim());
    for (const s of siswa || []) if ((s.rombelSaatIni || '').trim()) set.add(s.rombelSaatIni.trim());
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rombelRefs, siswa]);

  const tahunFilterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of tahunOptions || []) if (t) set.add(t);
    if (tahunAktif) set.add(tahunAktif);
    return [...set].sort().reverse();
  }, [tahunOptions, tahunAktif]);

  const filterAktif =
    filter.tahun !== 'all' || filter.rombel !== 'all' || filter.status !== 'all';
  const kosong = siswa.length === 0;

  const drillDown = (kondisi: KondisiDrillDown, opts?: Partial<SiswaPresetFilter> & { tujuan?: 'siswa' | 'raport' }) => {
    if (onDrillDown) onDrillDown(kondisi, opts);
    else onNavigate(opts?.tujuan === 'raport' ? 'raport' : 'siswa');
  };

  const siswaById = useMemo(() => new Map((siswa || []).map((s) => [s.id, s])), [siswa]);

  const lastSync = syncLogs[0];
  const rombelAkses = currentUser?.rombelAkses?.length ? currentUser.rombelAkses.join(', ') : 'Semua rombel';
  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const severityOf = (id: KondisiDrillDown): 'high' | 'medium' | 'low' => {
    if (id === 'raport-belum') return 'high';
    if (id === 'data-kosong' || id === 'data-tidak-valid') return 'medium';
    return 'low';
  };

  return (
    <div className="space-y-4">
      {/* Sapaan */}
      <div className="relative overflow-hidden rounded-xl p-5 text-white bg-gradient-to-br from-blue-700 via-navy-900 to-[#0b1e4b] shadow-md">
        <Sun className="absolute -right-6 -top-6 w-32 h-32 text-white/10" />
        <div className="relative">
          <p className="text-[11px] font-semibold text-blue-200">{today}</p>
          <h2 className="mt-0.5 text-lg sm:text-xl font-extrabold tracking-tight">
            {greeting()}, {currentUser?.namaLengkap || 'Operator'}!
          </h2>
          <p className="mt-1 text-xs text-blue-100">
            {currentUser?.role === 'administrator' ? 'Administrator' : 'Operator'} • {rombelAkses} • {siswa.length} siswa dalam kewenangan Anda
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span className="px-2.5 py-1 rounded-lg bg-amber-400/20 border border-amber-300/40 font-mono font-bold text-amber-100">
              Sesi {tahunAktif}{sesiBedaAktif ? ` (aktif ${sekolah.tahunAjaran})` : ''} • Semester {semesterAktif}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 font-semibold">
              {lastSync ? `Sinkron terakhir: ${new Date(lastSync.timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}` : 'Belum pernah sinkron'}
            </span>
          </div>
        </div>
      </div>

      {/* Aksi cepat */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {([
          { id: 'siswa', label: 'Tambah Siswa', desc: 'Entri baru', icon: <Plus className="w-4 h-4" />, onClick: onAddSiswa },
          { id: 'raport', label: 'Input Raport', desc: `Sem ${semesterAktif} • ${tahunAktif}`, icon: <Award className="w-4 h-4" />, onClick: () => onNavigate('raport') },
          { id: 'cetak', label: 'Cetak Dokumen', desc: 'Induk & kartu', icon: <Printer className="w-4 h-4" />, onClick: () => onNavigate('cetak') },
          { id: 'gtk', label: 'Data GTK', desc: `${gtkCount} GTK`, icon: <Contact className="w-4 h-4" />, onClick: () => onNavigate('gtk') },
          ...(isAdmin
            ? [{ id: 'dapodik', label: 'Sinkron Dapodik', desc: 'Admin', icon: <RefreshCw className="w-4 h-4" />, onClick: () => onNavigate('dapodik') }]
            : []),
        ]).map((a) => (
          <button
            key={a.id}
            onClick={a.onClick}
            className="ui-card ui-card-hover p-3.5 text-left transition cursor-pointer group"
          >
            <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center group-hover:bg-blue-700 group-hover:text-white transition">
              {a.icon}
            </span>
            <span className="block mt-2 text-xs font-extrabold text-slate-900">{a.label}</span>
            <span className="block text-[11px] text-slate-500">{a.desc}</span>
          </button>
        ))}
      </div>

      {/* Filter dasbor: tahun / rombel / status. Rentang tanggal tidak
          memengaruhi roster — ia hanya membatasi widget Arus di bawah. */}
      <section aria-label="Filter dasbor" className="ui-card p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-blue-700" />
          <h3 className="ui-section-title !normal-case !tracking-normal !text-sm">Filter Dasbor</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block">
            <span className="block text-[11px] font-bold text-slate-600 mb-1">Tahun ajaran</span>
            <select
              value={filter.tahun}
              onChange={(e) => onFilterChange({ ...filter, tahun: e.target.value })}
              className="ui-input"
              aria-label="Filter tahun ajaran"
            >
              <option value="all">Semua tahun</option>
              {tahunFilterOptions.map((t) => (
                <option key={t} value={t}>TA {t}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] font-bold text-slate-600 mb-1">Kelas / Rombel</span>
            <select
              value={filter.rombel}
              onChange={(e) => onFilterChange({ ...filter, rombel: e.target.value })}
              className="ui-input"
              aria-label="Filter kelas atau rombel"
            >
              <option value="all">Semua rombel</option>
              {rombelFilterOptions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
              <option value={ROMBEL_KOSONG}>Tanpa Rombel</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] font-bold text-slate-600 mb-1">Status siswa</span>
            <select
              value={filter.status}
              onChange={(e) => onFilterChange({ ...filter, status: e.target.value })}
              className="ui-input"
              aria-label="Filter status siswa"
            >
              <option value="all">Semua status</option>
              {STATUS_SISWA_OPTIONS.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p aria-live="polite" className="text-[11px] text-slate-600">
            Menampilkan <strong className="text-slate-900 tabular-nums">{siswa.length}</strong>
            {typeof jumlahSebelumFilter === 'number' && jumlahSebelumFilter !== siswa.length && (
              <> dari <strong className="text-slate-900 tabular-nums">{jumlahSebelumFilter}</strong></>
            )}{' '}
            siswa sesuai filter{filterAktif ? '' : ' (semua dalam kewenangan Anda)'}.
          </p>
          {filterAktif && (
            <button onClick={() => onFilterChange(DEFAULT_DASHBOARD_FILTER)} className="ui-btn ui-btn-ghost !py-1.5 !text-[11px]">
              Atur ulang filter
            </button>
          )}
        </div>
      </section>

      {kosong ? (
        <div className="ui-card p-8 text-center space-y-2" role="status">
          <p className="text-sm font-extrabold text-slate-900">
            {filterAktif ? 'Tidak ada siswa yang cocok dengan filter' : 'Belum ada siswa dalam kewenangan Anda'}
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {filterAktif
              ? 'Coba ubah atau atur ulang filter di atas — angka dasbor selalu berasal dari data nyata, bukan contoh.'
              : 'Tambahkan siswa baru, tarik dari Dapodik lokal, atau muat data contoh untuk mulai.'}
          </p>
          {filterAktif && (
            <button onClick={() => onFilterChange(DEFAULT_DASHBOARD_FILTER)} className="ui-btn ui-btn-outline !py-2">
              Atur ulang filter
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Distribusi status — tiap angka dapat dibuka ke daftar sumbernya */}
          <section aria-label="Distribusi status siswa" className="ui-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="ui-section-title !normal-case !tracking-normal !text-sm">
                <Users className="w-4 h-4" />
                Status Siswa ({ringkasan.total})
              </h3>
              <span className="text-[11px] text-slate-500">Klik angka untuk melihat daftarnya</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {STATUS_SISWA_OPTIONS.map((st) => (
                <button
                  key={st}
                  onClick={() => drillDown('semua', { status: st })}
                  className="rounded-xl border border-slate-200 bg-slate-50/50 hover:border-blue-300 hover:bg-blue-50/50 transition p-3 text-left cursor-pointer"
                  aria-label={`Lihat daftar siswa berstatus ${st}: ${ringkasan.perStatus[st]} siswa`}
                >
                  <span className="block text-xl font-black text-slate-900 tabular-nums leading-none">{ringkasan.perStatus[st]}</span>
                  <span className="block mt-1 text-[11px] font-bold text-slate-600">{st}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Antrean tugas — dari data nyata, tiap kartu dapat dibuka ke daftar sumbernya */}
          <div className="ui-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="ui-section-title !normal-case !tracking-normal !text-sm">
                <ClipboardList className="w-4 h-4" />
                Antrean Tugas Prioritas
              </h3>
              <span className="text-[11px] text-slate-500 font-semibold">
                {tugas.reduce((acc, t) => acc + t.jumlah, 0)} item menunggu
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mb-3">
              Menghitung <strong>butir pekerjaan</strong> yang menunggu ditindaklanjuti (satu siswa dapat menyumbang
              beberapa butir). Berbeda dari kartu Perlu Perhatian di Dasbor yang menghitung siswa per kondisi data.
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {tugas.map((t) => {
                const severity = t.jumlah === 0 ? 'done' : severityOf(t.id);
                const preview = t.ids.slice(0, 4).map((id) => siswaById.get(id)).filter(Boolean) as Siswa[];
                const icon =
                  t.id === 'raport-belum' ? <Award className="w-4 h-4" />
                  : t.id === 'dokumen' ? <FileWarning className="w-4 h-4" />
                  : t.id === 'tanpa-rombel' ? <Users className="w-4 h-4" />
                  : t.id === 'mutasi-surat' ? <ArrowLeftRight className="w-4 h-4" />
                  : t.id === 'data-tidak-valid' ? <AlertTriangle className="w-4 h-4" />
                  : t.id === 'data-kosong' ? <ClipboardList className="w-4 h-4" />
                  : <Camera className="w-4 h-4" />;
                const tint =
                  t.id === 'raport-belum' ? 'bg-indigo-100 text-indigo-700'
                  : t.id === 'dokumen' ? 'bg-violet-100 text-violet-700'
                  : t.id === 'tanpa-rombel' ? 'bg-amber-100 text-amber-700'
                  : t.id === 'mutasi-surat' ? 'bg-rose-100 text-rose-700'
                  : t.id === 'data-tidak-valid' ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700';
                return (
                  <div
                    key={t.id}
                    className={`rounded-xl border p-4 flex flex-col ${
                      severity === 'done' ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${tint}`}>{icon}</span>
                      {severity === 'done' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Beres
                        </span>
                      ) : (
                        <button
                          onClick={() => drillDown(t.id, { tujuan: t.tujuan })}
                          className="text-xl font-black text-slate-900 tabular-nums hover:text-blue-700 hover:underline cursor-pointer"
                          aria-label={`${KONDISI_LABELS[t.id]}: ${t.jumlah} siswa. Klik untuk melihat daftar.`}
                          title="Klik untuk melihat daftar siswa pembentuk angka ini"
                        >
                          {t.jumlah}
                        </button>
                      )}
                    </div>
                    <p className="mt-2 text-xs font-extrabold text-slate-900">{t.judul}</p>
                    <p className="text-[11px] text-slate-500 leading-snug">{t.deskripsi}</p>
                    {preview.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {preview.map((s) => (
                          <li key={s.id}>
                            <button
                              onClick={() => (t.id === 'raport-belum' ? onViewSiswa(s) : onEditSiswa(s))}
                              className="w-full text-left text-[11px] px-2 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition truncate"
                              title={s.namaLengkap}
                            >
                              <strong className="text-slate-800">{s.namaLengkap}</strong>
                              <span className="text-slate-400"> • {s.rombelSaatIni || '-'}</span>
                            </button>
                          </li>
                        ))}
                        {t.jumlah > preview.length && (
                          <li className="text-[11px] text-slate-400 font-semibold px-1">+{t.jumlah - preview.length} lainnya…</li>
                        )}
                      </ul>
                    )}
                    <div className="mt-3 flex flex-col gap-2">
                      {t.jumlah > 0 && (
                        <button onClick={() => drillDown(t.id, { tujuan: t.tujuan })} className="ui-btn ui-btn-outline w-full !py-2">
                          Lihat daftar ({t.jumlah})
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => onNavigate(t.tujuan === 'raport' ? 'raport' : 'siswa')}
                        className="ui-btn ui-btn-ghost w-full !py-2"
                      >
                        {t.tujuan === 'raport' ? 'Buka Nilai Raport' : 'Buka Master Siswa'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Arus siswa dalam rentang tanggal */}
          <section aria-label="Arus siswa" className="ui-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="ui-section-title !normal-case !tracking-normal !text-sm">
                <ArrowLeftRight className="w-4 h-4" />
                Arus Siswa
              </h3>
              <span className="text-[11px] text-slate-500">Berdasarkan tanggal diterima / keluar</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <label className="block">
                <span className="block text-[11px] font-bold text-slate-600 mb-1">Dari tanggal</span>
                <input type="date" value={arusDari} onChange={(e) => setArusDari(e.target.value)} className="ui-input" aria-label="Arus siswa dari tanggal" />
              </label>
              <label className="block">
                <span className="block text-[11px] font-bold text-slate-600 mb-1">Sampai tanggal</span>
                <input type="date" value={arusSampai} onChange={(e) => setArusSampai(e.target.value)} className="ui-input" aria-label="Arus siswa sampai tanggal" />
              </label>
            </div>
            {!arusRentangValid ? (
              <p role="alert" className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                Rentang tanggal tidak valid: tanggal awal tidak boleh setelah tanggal akhir.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => drillDown('diterima-rentang', { dari: arusDari, sampai: arusSampai })}
                    className="rounded-xl border border-slate-200 bg-slate-50/50 hover:border-blue-300 hover:bg-blue-50/50 transition p-3 text-left cursor-pointer"
                    aria-label={`Lihat daftar siswa diterima${arus.rentangAktif ? ' dalam rentang tanggal' : ''}: ${arus.diterima} siswa`}
                  >
                    <span className="block text-xl font-black text-slate-900 tabular-nums leading-none">{arus.diterima}</span>
                    <span className="block mt-1 text-[11px] font-bold text-slate-600">Diterima{arus.rentangAktif ? ' (rentang)' : ' (semua riwayat)'}</span>
                  </button>
                  <button
                    onClick={() => drillDown('keluar-rentang', { dari: arusDari, sampai: arusSampai })}
                    className="rounded-xl border border-slate-200 bg-slate-50/50 hover:border-blue-300 hover:bg-blue-50/50 transition p-3 text-left cursor-pointer"
                    aria-label={`Lihat daftar siswa keluar${arus.rentangAktif ? ' dalam rentang tanggal' : ''}: ${arus.keluar} siswa`}
                  >
                    <span className="block text-xl font-black text-slate-900 tabular-nums leading-none">{arus.keluar}</span>
                    <span className="block mt-1 text-[11px] font-bold text-slate-600">Keluar{arus.rentangAktif ? ' (rentang)' : ' (semua riwayat)'}</span>
                  </button>
                </div>
                {!arus.rentangAktif && (
                  <p className="mt-2 text-[11px] text-slate-500">Isi rentang tanggal di atas untuk membatasi arus pada periode tertentu. Siswa tanpa tanggal diterima/keluar tidak dihitung.</p>
                )}
              </>
            )}
          </section>

          {/* Tenggat & kewajiban laporan mendatang */}
          <section aria-label="Tenggat dan kewajiban laporan" className="ui-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="ui-section-title !normal-case !tracking-normal !text-sm">
                <CalendarClock className="w-4 h-4" />
                Tenggat &amp; Kewajiban Laporan
              </h3>
              <span className="text-[11px] text-slate-500">{tenggat.length} item</span>
            </div>
            {tenggat.length === 0 ? (
              <p className="text-xs text-slate-500">Tidak ada tenggat atau kewajiban laporan yang mendesak saat ini.</p>
            ) : (
              <ul className="space-y-2">
                {tenggat.map((item) => (
                  <li
                    key={item.id}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 ${
                      item.mendesak ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-slate-50/50'
                    }`}
                  >
                    <span>
                      <span className="block text-xs font-extrabold text-slate-900">{item.judul}</span>
                      <span className="block text-[11px] text-slate-500">{item.detail}</span>
                    </span>
                    <button
                      onClick={() => (item.tujuan === 'backup' ? (onOpenBackup ? onOpenBackup() : onNavigate('backup')) : onNavigate('raport'))}
                      className="ui-btn ui-btn-outline !py-1.5 !text-[11px]"
                    >
                      {item.tujuan === 'backup' ? 'Buka Backup' : 'Buka Nilai Raport'}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-slate-500">
              Catatan: model data belum menyimpan tanggal tenggat laporan, jadi item di atas tidak menampilkan tanggal tenggat
              karangan — hanya kewajiban berjalan dari data nyata.
            </p>
          </section>

          {/* Rombel saya */}
          <div className="ui-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="ui-section-title !normal-case !tracking-normal !text-sm">
                <Users className="w-4 h-4" />
                Rombel Saya ({perRombel.length})
              </h3>
              <button onClick={() => onNavigate('rekap')} className="text-[11px] font-bold text-blue-700 hover:underline">
                Lihat rekapitulasi →
              </button>
            </div>
            {perRombel.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-4 text-center">Belum ada siswa dalam kewenangan Anda.</p>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-left text-xs min-w-[520px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
                      <th className="py-2 pr-3 font-bold">Rombel</th>
                      <th className="py-2 pr-3 font-bold">Wali Kelas</th>
                      <th className="py-2 pr-3 text-center font-bold">Siswa</th>
                      <th className="py-2 pr-3 font-bold">Kelengkapan</th>
                      <th className="py-2 font-bold">Raport Sem {semesterAktif}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {perRombel.map((r) => (
                      <tr key={r.nama} className="hover:bg-slate-50/60">
                        <td className="py-2.5 pr-3 font-extrabold text-slate-900">
                          <button
                            onClick={() => drillDown('semua', { rombel: r.nama === 'Tanpa Rombel' ? ROMBEL_KOSONG : r.nama })}
                            className="hover:text-blue-700 hover:underline cursor-pointer"
                            title={`Lihat daftar siswa rombel ${r.nama}`}
                          >
                            {r.nama}
                          </button>
                        </td>
                        <td className="py-2.5 pr-3 text-slate-600">{r.wali || <span className="text-slate-300 italic">belum ada</span>}</td>
                        <td className="py-2.5 pr-3 text-center tabular-nums">
                          <strong>{r.total}</strong> <span className="text-slate-400">({r.laki}L/{r.total - r.laki}P)</span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 min-w-16 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${r.lengkapPct >= 90 ? 'bg-emerald-500' : r.lengkapPct >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                style={{ width: `${r.lengkapPct}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-bold tabular-nums w-9 text-right">{r.lengkapPct}%</span>
                          </div>
                        </td>
                        <td className="py-2.5">
                          {r.raportOk >= r.total && r.total > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5" /> {r.raportOk}/{r.total}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700">
                              <AlertTriangle className="w-3.5 h-3.5" /> {r.raportOk}/{r.total}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Status sistem */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="ui-card p-4 flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <Database className="w-4 h-4" />
              </span>
              <span>
                <span className="block text-[11px] text-slate-500 font-semibold">Basis Data</span>
                <span className="block text-xs font-extrabold text-slate-900">{siswa.length} siswa • offline-first</span>
              </span>
            </div>
            <button onClick={() => onNavigate('cetak')} className="ui-card ui-card-hover p-4 flex items-center gap-3 text-left cursor-pointer">
              <span className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                <Printer className="w-4 h-4" />
              </span>
              <span>
                <span className="block text-[11px] text-slate-500 font-semibold">Siap Cetak</span>
                <span className="block text-xs font-extrabold text-slate-900">Induk + kartu pelajar →</span>
              </span>
            </button>
            <div className="ui-card p-4 flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                <RefreshCw className="w-4 h-4" />
              </span>
              <span>
                <span className="block text-[11px] text-slate-500 font-semibold">Sinkronisasi</span>
                <span className="block text-xs font-extrabold text-slate-900">
                  {lastSync ? new Date(lastSync.timestamp).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Belum pernah'}
                </span>
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
