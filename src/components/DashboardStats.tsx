import React from 'react';
import { Users, GraduationCap, CheckCircle, RefreshCw, AlertCircle, ArrowRight, ShieldAlert } from 'lucide-react';
import { Siswa, DapodikSyncLog, JenjangSekolah } from '../types';
import { getTingkatOptions, getTingkatDariRombel } from '../utils/raportUtils';

interface DashboardStatsProps {
  siswa: Siswa[];
  jenjang?: JenjangSekolah;
  lastSyncLog?: DapodikSyncLog;
  isAdmin?: boolean;
  /** Sesi tahun ajaran login (fondasi sesi; roster lingkup sekolah). */
  sessionTahun?: string | null;
  tahunAktif?: string | null;
  onOpenSync: () => void;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({
  siswa,
  jenjang: jenjangProp = 'SMP',
  lastSyncLog,
  isAdmin = false,
  sessionTahun,
  tahunAktif,
  onOpenSync
}) => {
  const jenjang = (jenjangProp || 'SMP') as JenjangSekolah;
  const total = siswa.length;
  const laki = siswa.filter((s) => s.jenisKelamin === 'L').length;
  const perempuan = siswa.filter((s) => s.jenisKelamin === 'P').length;
  const pctL = total > 0 ? Math.round((laki / total) * 100) : 0;

  const tingkatOptions = getTingkatOptions(jenjang);
  const countByTingkat = (t: string) =>
    siswa.filter((s) =>
      (s.rombelSaatIni || '').startsWith(t) ||
      s.diterimaDiTingkat === t ||
      getTingkatDariRombel(s.rombelSaatIni) === t
    ).length;
  const maxTingkat = Math.max(1, ...tingkatOptions.map(countByTingkat));
  const faseLabel = jenjang === 'SD' ? 'Fase A–C (Tingkat SD)' : 'Fase D (Tingkat SMP)';

  // Calculate completeness of master records
  const lengkapCount = siswa.filter(
    (s) => s.namaLengkap && s.nisn && s.nik && s.ayah?.nama && s.ibu?.nama && s.asalSdMi
  ).length;
  const persentaseLengkap = total > 0 ? Math.round((lengkapCount / total) * 100) : 100;
  const ringR = 22;
  const ringC = 2 * Math.PI * ringR;

  const formatTime = (iso?: string) => {
    if (!iso) return 'Belum pernah sinkron';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="mb-5 anim-stagger print:hidden">
    {sessionTahun && (
      <p className="mb-2 text-[11px] text-slate-500">
        Sesi data:{' '}
        <strong className="font-mono text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
          TA {sessionTahun}
        </strong>
        {tahunAktif && sessionTahun.trim() !== tahunAktif.trim() && (
          <span className="ml-1.5 text-slate-400">(tahun aktif database: {tahunAktif})</span>
        )}
        <span className="ml-1.5">• roster lingkup sekolah, {total} siswa dalam kewenangan Anda</span>
      </p>
    )}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Card 1: Total Siswa — hero navy, dipadatkan */}
      <div className="relative overflow-hidden rounded p-3 text-white bg-gradient-to-br from-navy-800 via-navy-900 to-[#0b1e4b] shadow-md shadow-navy-900/25">
        <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-blue-500/20 blur-2xl" />
        <div className="relative flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-300">Total Siswa</span>
          <div className="w-7 h-7 rounded bg-white/10 border border-white/15 flex items-center justify-center">
            <Users className="w-3.5 h-3.5 text-gold-300" />
          </div>
        </div>
        <div className="relative mt-0.5 flex items-baseline gap-1.5">
          <span className="text-2xl font-extrabold tabular-nums tracking-tight leading-none">{total}</span>
          <span className="text-[11px] text-slate-300 font-semibold">peserta didik</span>
        </div>
        {/* Bilah komposisi L/P */}
        <div className="relative mt-2">
          <div className="flex h-1.5 rounded-sm overflow-hidden bg-white/15">
            <div className="bg-gradient-to-r from-sky-400 to-blue-500 transition-all" style={{ width: `${pctL}%` }} />
            <div className="bg-gradient-to-r from-rose-300 to-rose-400 transition-all" style={{ width: `${100 - pctL}%` }} />
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] font-semibold">
            <span className="flex items-center gap-1 text-sky-200">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" /> L: {laki} ({pctL}%)
            </span>
            <span className="flex items-center gap-1 text-rose-200">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-300" /> P: {perempuan} ({100 - pctL}%)
            </span>
          </div>
        </div>
      </div>

      {/* Card 2: Distribusi Fase — dipadatkan */}
      <div className="ui-card ui-card-hover p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">{faseLabel}</span>
          <div className="w-7 h-7 rounded bg-indigo-50 text-indigo-700 flex items-center justify-center">
            <GraduationCap className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-xl font-extrabold text-slate-900 tabular-nums leading-none">
            {tingkatOptions.reduce((acc, t) => acc + countByTingkat(t), 0)}
          </span>
          <span className="text-[11px] text-slate-500 font-semibold">terpetakan ke fase</span>
        </div>
        <div className="mt-2 space-y-1">
          {tingkatOptions.map((t) => {
            const c = countByTingkat(t);
            return (
              <div key={t} className="flex items-center gap-2 text-[11px] leading-none">
                <span className="w-12 shrink-0 font-bold text-slate-600">Kls {t}</span>
                <div className="flex-1 h-1.5 rounded-sm bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-sm bg-gradient-to-r from-indigo-500 to-blue-600 transition-all"
                    style={{ width: `${Math.round((c / maxTingkat) * 100)}%` }}
                  />
                </div>
                <span className="w-7 text-right font-extrabold text-slate-800 tabular-nums">{c}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Card 3: Kelengkapan — ring kecil */}
      <div className="ui-card ui-card-hover p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Kelengkapan Data</span>
          <div className="w-7 h-7 rounded bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <CheckCircle className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-1 flex items-center gap-2.5">
          <div className="relative w-[48px] h-[48px] shrink-0">
            <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
              <circle cx="32" cy="32" r={ringR} fill="none" stroke="#f1f5f9" strokeWidth="8" />
              <circle
                cx="32" cy="32" r={ringR} fill="none" stroke="url(#lengkapGrad)"
                strokeWidth="8" strokeLinecap="butt"
                strokeDasharray={ringC}
                strokeDashoffset={ringC - (ringC * persentaseLengkap) / 100}
                className="transition-all duration-700"
              />
              <defs>
                <linearGradient id="lengkapGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
              </defs>
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-extrabold text-slate-900 tabular-nums">
              {persentaseLengkap}%
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-800 leading-snug">
              {lengkapCount} dari {total} lengkap
            </p>
            <p className="text-[11px] text-slate-500 leading-snug">
              {total - lengkapCount > 0
                ? `${total - lengkapCount} perlu dilengkapi`
                : 'Semua lengkap'}
            </p>
          </div>
        </div>
      </div>

      {/* Card 4: Status Dapodik — dibatasi untuk administrator */}
      <div className="ui-card ui-card-hover p-3 flex flex-col">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Dapodik Lokal</span>
          {isAdmin ? (
            <button
              onClick={onOpenSync}
              className="w-7 h-7 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 flex items-center justify-center transition"
              title="Buka Sinkronisasi Dapodik"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span className="w-7 h-7 rounded bg-slate-100 text-slate-400 flex items-center justify-center" title="Khusus administrator">
              <ShieldAlert className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-sm font-extrabold text-slate-800 leading-none">Siap Sinkron</span>
          <span className="ui-badge ui-badge-slate font-mono">:5774</span>
        </div>
        <div className="mt-1.5 text-[11px] text-slate-500 leading-snug">
          {lastSyncLog ? (
            <span>Terakhir: <strong className="text-slate-700">{formatTime(lastSyncLog.timestamp)}</strong></span>
          ) : (
            <span className="text-amber-700 font-semibold flex items-center gap-1">
              <AlertCircle className="w-3 h-3 shrink-0" />
              Belum pernah sinkron
            </span>
          )}
        </div>
        {isAdmin ? (
          <button
            onClick={onOpenSync}
            className="ui-btn ui-btn-soft w-full mt-2 !py-2"
          >
            Buka Sinkronisasi
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <p className="mt-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-slate-400" />
            Sinkronisasi khusus administrator
          </p>
        )}
      </div>
    </div>
    </div>
  );
};
