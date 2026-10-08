import React, { useMemo } from 'react';
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
} from 'lucide-react';
import { Siswa, SekolahProfile, DapodikSyncLog, AppUser, RombelRef } from '../types';
import { getRaportList } from '../utils/raportUtils';
import { tahunSesiEfektif } from '../utils/sesi';

interface OperatorDashboardProps {
  siswa: Siswa[];
  sekolah: SekolahProfile;
  syncLogs: DapodikSyncLog[];
  rombelRefs: RombelRef[];
  gtkCount: number;
  currentUser: AppUser | null;
  isAdmin: boolean;
  /** Sesi tahun ajaran login — antrean raport & rombel mengikuti sesi ini. */
  sessionTahun?: string | null;
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

function isLengkap(s: Siswa): boolean {
  return Boolean(s.namaLengkap && s.nisn && s.nik && s.ayah?.nama && s.ibu?.nama && s.asalSdMi);
}

function activeSemester(sekolah: SekolahProfile): '1' | '2' {
  return (sekolah.semesterAktif || '').includes('2') ? '2' : '1';
}

export const OperatorDashboard: React.FC<OperatorDashboardProps> = ({
  siswa,
  sekolah,
  syncLogs,
  rombelRefs,
  gtkCount,
  currentUser,
  isAdmin,
  sessionTahun,
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

  const incomplete = useMemo(() => (siswa || []).filter((s) => !isLengkap(s)), [siswa]);
  const noFoto = useMemo(() => (siswa || []).filter((s) => !s.fotoUrl), [siswa]);
  const raportMissing = useMemo(
    () =>
      (siswa || []).filter(
        (s) =>
          s.statusSiswa === 'Aktif' &&
          !getRaportList(s).some((r) => r.tahunAjaran === tahunAktif && r.semester === semesterAktif)
      ),
    [siswa, tahunAktif, semesterAktif]
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
        const lengkap = list.filter(isLengkap).length;
        const raportOk = list.filter((s) =>
          getRaportList(s).some((r) => r.tahunAjaran === tahunAktif && r.semester === semesterAktif)
        ).length;
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

  const lastSync = syncLogs[0];
  const rombelAkses = currentUser?.rombelAkses?.length ? currentUser.rombelAkses.join(', ') : 'Semua rombel';
  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const tasks = [
    {
      id: 'raport',
      icon: <Award className="w-4 h-4" />,
      tint: 'bg-indigo-100 text-indigo-700',
      title: `Input raport TP ${tahunAktif} Semester ${semesterAktif}`,
      desc: 'Siswa aktif yang belum punya nilai semester berjalan.',
      count: raportMissing.length,
      preview: raportMissing.slice(0, 4),
      actionLabel: 'Buka Nilai Raport',
      onAction: () => onNavigate('raport'),
      severity: raportMissing.length > 0 ? 'high' : 'done',
    },
    {
      id: 'lengkap',
      icon: <ClipboardList className="w-4 h-4" />,
      tint: 'bg-amber-100 text-amber-700',
      title: 'Lengkapi data induk',
      desc: 'NISN, NIK, nama orang tua, atau asal sekolah masih kosong.',
      count: incomplete.length,
      preview: incomplete.slice(0, 4),
      actionLabel: 'Buka Master Siswa',
      onAction: () => onNavigate('siswa'),
      severity: incomplete.length > 0 ? 'medium' : 'done',
    },
    {
      id: 'foto',
      icon: <Camera className="w-4 h-4" />,
      tint: 'bg-sky-100 text-sky-700',
      title: 'Foto siswa (kartu pelajar)',
      desc: 'Diperlukan untuk cetak kartu pelajar.',
      count: noFoto.length,
      preview: noFoto.slice(0, 4),
      actionLabel: 'Lihat Data',
      onAction: () => onNavigate('siswa'),
      severity: noFoto.length > 0 ? 'low' : 'done',
    },
  ] as const;

  const quickActions = [
    { id: 'siswa', label: 'Tambah Siswa', desc: 'Entri baru', icon: <Plus className="w-4 h-4" />, onClick: onAddSiswa },
    { id: 'raport', label: 'Input Raport', desc: `Sem ${semesterAktif} • ${tahunAktif}`, icon: <Award className="w-4 h-4" />, onClick: () => onNavigate('raport') },
    { id: 'cetak', label: 'Cetak Dokumen', desc: 'Induk & kartu', icon: <Printer className="w-4 h-4" />, onClick: () => onNavigate('cetak') },
    { id: 'gtk', label: 'Data GTK', desc: `${gtkCount} GTK`, icon: <Contact className="w-4 h-4" />, onClick: () => onNavigate('gtk') },
    ...(isAdmin
      ? [{ id: 'dapodik', label: 'Sinkron Dapodik', desc: 'Admin', icon: <RefreshCw className="w-4 h-4" />, onClick: () => onNavigate('dapodik') }]
      : []),
  ];

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
        {quickActions.map((a) => (
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

      {/* Antrean tugas */}
      <div className="ui-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="ui-section-title !normal-case !tracking-normal !text-sm">
            <ClipboardList className="w-4 h-4" />
            Antrean Tugas Prioritas
          </h3>
          <span className="text-[11px] text-slate-500 font-semibold">
            {tasks.reduce((acc, t) => acc + t.count, 0)} item menunggu
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {tasks.map((t) => (
            <div
              key={t.id}
              className={`rounded-xl border p-4 flex flex-col ${
                t.severity === 'done' ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.tint}`}>{t.icon}</span>
                {t.severity === 'done' ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Beres
                  </span>
                ) : (
                  <span className="text-xl font-black text-slate-900 tabular-nums">{t.count}</span>
                )}
              </div>
              <p className="mt-2 text-xs font-extrabold text-slate-900">{t.title}</p>
              <p className="text-[11px] text-slate-500 leading-snug">{t.desc}</p>
              {t.preview.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {t.preview.map((s) => (
                    <li key={s.id}>
                      <button
                        onClick={() => (t.id === 'raport' ? onViewSiswa(s) : onEditSiswa(s))}
                        className="w-full text-left text-[11px] px-2 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition truncate"
                        title={s.namaLengkap}
                      >
                        <strong className="text-slate-800">{s.namaLengkap}</strong>
                        <span className="text-slate-400"> • {s.rombelSaatIni || '-'}</span>
                      </button>
                    </li>
                  ))}
                  {t.count > t.preview.length && (
                    <li className="text-[11px] text-slate-400 font-semibold px-1">+{t.count - t.preview.length} lainnya…</li>
                  )}
                </ul>
              )}
              <button onClick={t.onAction} className="ui-btn ui-btn-outline w-full mt-3 !py-2">
                {t.actionLabel}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

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
                    <td className="py-2.5 pr-3 font-extrabold text-slate-900">{r.nama}</td>
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
    </div>
  );
};
