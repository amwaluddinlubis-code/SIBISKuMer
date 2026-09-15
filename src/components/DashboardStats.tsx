import React from 'react';
import { Users, GraduationCap, CheckCircle, RefreshCw, AlertCircle } from 'lucide-react';
import { Siswa, DapodikSyncLog } from '../types';

interface DashboardStatsProps {
  siswa: Siswa[];
  lastSyncLog?: DapodikSyncLog;
  onOpenSync: () => void;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({
  siswa,
  lastSyncLog,
  onOpenSync
}) => {
  const total = siswa.length;
  const laki = siswa.filter((s) => s.jenisKelamin === 'L').length;
  const perempuan = siswa.filter((s) => s.jenisKelamin === 'P').length;

  const kelas7 = siswa.filter((s) => s.rombelSaatIni?.startsWith('7')).length;
  const kelas8 = siswa.filter((s) => s.rombelSaatIni?.startsWith('8')).length;
  const kelas9 = siswa.filter((s) => s.rombelSaatIni?.startsWith('9')).length;

  // Calculate completeness of master records
  const lengkapCount = siswa.filter(
    (s) => s.namaLengkap && s.nisn && s.nik && s.ayah?.nama && s.ibu?.nama && s.asalSdMi
  ).length;
  const persentaseLengkap = total > 0 ? Math.round((lengkapCount / total) * 100) : 100;

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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Card 1: Total Siswa */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs hover:border-blue-300 transition">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Siswa Terdaftar</span>
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-extrabold text-slate-900">{total}</span>
          <span className="text-xs text-slate-500 font-medium">Siswa Aktif</span>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-600 border-t border-slate-100 pt-2">
          <span>L: <strong className="text-slate-800">{laki}</strong> ({total > 0 ? Math.round((laki/total)*100) : 0}%)</span>
          <span className="text-slate-300">•</span>
          <span>P: <strong className="text-slate-800">{perempuan}</strong> ({total > 0 ? Math.round((perempuan/total)*100) : 0}%)</span>
        </div>
      </div>

      {/* Card 2: Distribusi Fase D */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs hover:border-indigo-300 transition">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Fase D (Tingkat SMP)</span>
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
            <GraduationCap className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-extrabold text-indigo-950">{kelas7 + kelas8 + kelas9}</span>
          <span className="text-xs text-indigo-700 font-medium">Rombel 7, 8, 9</span>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-600 border-t border-slate-100 pt-2">
          <span>Kls 7: <strong>{kelas7}</strong></span>
          <span className="text-slate-300">•</span>
          <span>Kls 8: <strong>{kelas8}</strong></span>
          <span className="text-slate-300">•</span>
          <span>Kls 9: <strong>{kelas9}</strong></span>
        </div>
      </div>

      {/* Card 3: Kelengkapan Dokumen Buku Induk */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs hover:border-emerald-300 transition">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Kelengkapan Buku Induk</span>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <CheckCircle className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-extrabold text-emerald-900">{persentaseLengkap}%</span>
          <span className="text-xs text-emerald-700 font-medium">{lengkapCount} dari {total} data lengkap</span>
        </div>
        <div className="mt-3 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-emerald-600 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${persentaseLengkap}%` }}
          />
        </div>
      </div>

      {/* Card 4: Status Web Service Dapodik */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs hover:border-amber-300 transition">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Web Service Dapodik</span>
          <button
            onClick={onOpenSync}
            className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 flex items-center justify-center transition"
            title="Buka Sinkronisasi Dapodik"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-bold text-slate-800">Siap Sinkron (Port 5774)</span>
        </div>
        <div className="mt-3 text-[11px] text-slate-500 border-t border-slate-100 pt-2 truncate">
          {lastSyncLog ? (
            <span className="text-slate-700">
              Terakhir: <strong>{formatTime(lastSyncLog.timestamp)}</strong>
            </span>
          ) : (
            <span className="text-amber-700 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 shrink-0" />
              Tersedia sinkron Web Service
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
