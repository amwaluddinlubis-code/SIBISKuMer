import React, { useState } from 'react';
import {
  School,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  CalendarRange,
  Database,
  PartyPopper,
} from 'lucide-react';
import { SekolahProfile, DapodikConfig, Siswa, DapodikSyncLog, AppUser, JenjangSekolah } from '../types';
import { DapodikSyncView } from './DapodikSyncView';
import { toast } from '../utils/notify';
import { isValidTahun, normalizeTahun } from '../utils/tahunAjaran';
import { defaultSekolahProfile, presetSekolahSD } from '../data/initialData';

interface SetupWizardProps {
  sekolah: SekolahProfile;
  dapodikConfig: DapodikConfig;
  siswaList: Siswa[];
  syncLogs: DapodikSyncLog[];
  sessionTahun?: string | null;
  currentUser?: AppUser | null;
  onSaveSekolah: (p: SekolahProfile) => Promise<void>;
  onConfigChange: (c: DapodikConfig) => void;
  onRefreshData: () => Promise<void> | void;
  onLoadSample: () => Promise<void>;
  onFinish: () => void;
}

/**
 * Wizard penyiapan database baru (kosong): Profil Sekolah → Sinkron Dapodik
 * → Selesai. Tampil otomatis untuk administrator saat database belum berisi
 * data (belum ada siswa & belum ada log sinkron).
 */
export const SetupWizard: React.FC<SetupWizardProps> = ({
  sekolah,
  dapodikConfig,
  siswaList,
  syncLogs,
  sessionTahun,
  currentUser,
  onSaveSekolah,
  onConfigChange,
  onRefreshData,
  onLoadSample,
  onFinish,
}) => {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [saving, setSaving] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);

  // Form profil sekolah langkah 1. Nilai contoh bawaan (profil struktural)
  // dikosongkan agar administrator wajib mengisi identitas asli sekolah.
  const SAMPLE_NAMES = [defaultSekolahProfile.nama, presetSekolahSD.nama, 'Sekolah Saya', 'Sekolah Baru'];
  const SAMPLE_NPSN = [defaultSekolahProfile.npsn, presetSekolahSD.npsn];
  const [nama, setNama] = useState(SAMPLE_NAMES.includes((sekolah.nama || '').trim()) ? '' : sekolah.nama || '');
  const [npsn, setNpsn] = useState(SAMPLE_NPSN.includes((sekolah.npsn || '').trim()) ? '' : sekolah.npsn || '');
  const [jenjang, setJenjang] = useState<JenjangSekolah>(sekolah.jenjang || 'SMP');
  const [status, setStatus] = useState<'Negeri' | 'Swasta'>(sekolah.statusSekolah || 'Negeri');
  const [tahun, setTahun] = useState(
    normalizeTahun(sekolah.tahunAjaran) || normalizeTahun(sessionTahun) || '2026/2027'
  );

  const steps = [
    { id: 0, label: 'Data Sekolah', icon: School },
    { id: 1, label: 'Sinkron Dapodik', icon: RefreshCw },
    { id: 2, label: 'Selesai', icon: PartyPopper },
  ];

  const handleSaveSekolah = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nama.trim().length < 3) {
      toast('Nama sekolah minimal 3 karakter.', 'error');
      return;
    }
    if (!/^\d{8}$/.test(npsn.trim())) {
      toast('NPSN wajib 8 digit angka.', 'error');
      return;
    }
    const t = normalizeTahun(tahun);
    if (!isValidTahun(t)) {
      toast('Tahun ajaran wajib berformat TAHUN/TAHUN (cth. 2026/2027).', 'error');
      return;
    }
    setSaving(true);
    try {
      await onSaveSekolah({
        ...sekolah,
        nama: nama.trim().toUpperCase(),
        npsn: npsn.trim(),
        jenjang,
        bentukPendidikan: jenjang,
        statusSekolah: status,
        tahunAjaran: t,
        // Periode berjalan mengikuti Dapodik: 2026/2027 Ganjil.
        semesterAktif: '1 (Ganjil)',
      });
      setStep(1);
    } finally {
      setSaving(false);
    }
  };

  const handleLoadSample = async () => {
    setLoadingSample(true);
    try {
      await onLoadSample();
    } finally {
      setLoadingSample(false);
    }
  };

  return (
    <div className="space-y-5 anim-fade-up">
      {/* Kepala wizard */}
      <div className="ui-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
              Penyiapan Database Baru
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              Selamat datang{currentUser?.namaLengkap ? `, ${currentUser.namaLengkap}` : ''}! Database ini masih kosong —
              lengkapi data sekolah, lalu tarik data dari Dapodik periode{' '}
              <strong className="font-mono">2026/2027 Ganjil</strong>. Pilihan tahun ajaran akan terisi
              otomatis dari hasil sinkronisasi.
            </p>
          </div>
          <button
            type="button"
            onClick={onFinish}
            className="text-xs font-semibold text-slate-400 hover:text-slate-700 hover:underline transition"
          >
            Lewati penyiapan
          </button>
        </div>

        {/* Indikator langkah */}
        <div className="mt-4 flex items-center gap-1.5 sm:gap-2">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const aktif = step === s.id;
            const lewat = step > s.id;
            return (
              <React.Fragment key={s.id}>
                {i > 0 && (
                  <span className={`flex-1 h-0.5 rounded ${step >= s.id ? 'bg-blue-600' : 'bg-slate-200'}`} />
                )}
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition ${
                    aktif
                      ? 'bg-navy-900 text-white border-navy-900 shadow-sm'
                      : lewat
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-50 text-slate-500 border-slate-200'
                  }`}
                >
                  {lewat ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{s.id + 1}</span>
                </span>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Langkah 1: Data Sekolah */}
      {step === 0 && (
        <form onSubmit={(e) => void handleSaveSekolah(e)} className="ui-card p-5 sm:p-6 space-y-4">
          <h3 className="ui-section-title !normal-case !tracking-normal !text-sm">
            <School className="w-4 h-4" />
            Langkah 1 — Data Sekolah Baru
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="sm:col-span-2">
              <label className="ui-label">Nama sekolah *</label>
              <input
                type="text"
                required
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                placeholder="cth. SMP NEGERI 1 MERDEKA BELAJAR"
                className="ui-input uppercase"
              />
            </div>
            <div>
              <label className="ui-label">NPSN (8 digit) *</label>
              <input
                type="text"
                required
                inputMode="numeric"
                pattern="\d{8}"
                value={npsn}
                onChange={(e) => setNpsn(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="cth. 20104567"
                className="ui-input font-mono"
              />
            </div>
            <div>
              <label className="ui-label">Tahun ajaran berjalan *</label>
              <input
                type="text"
                required
                value={tahun}
                onChange={(e) => setTahun(e.target.value)}
                placeholder="2026/2027"
                pattern="\d{4}/\d{4}"
                className="ui-input font-mono"
              />
            </div>
            <div>
              <label className="ui-label">Jenjang *</label>
              <div className="grid grid-cols-2 gap-2">
                {(['SD', 'SMP'] as JenjangSekolah[]).map((j) => (
                  <button
                    key={j}
                    type="button"
                    onClick={() => setJenjang(j)}
                    className={`py-2 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
                      jenjang === j
                        ? 'bg-navy-900 text-white border-navy-900 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {j === 'SD' ? 'SD (Fase A–C)' : 'SMP (Fase D)'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="ui-label">Status sekolah *</label>
              <div className="grid grid-cols-2 gap-2">
                {(['Negeri', 'Swasta'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`py-2 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
                      status === s
                        ? 'bg-navy-900 text-white border-navy-900 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <CalendarRange className="w-4 h-4 text-blue-700 shrink-0" />
            Semester aktif dikunci <strong className="font-mono">1 (Ganjil)</strong> mengikuti periode Dapodik 2026/2027 Ganjil.
          </p>

          <div className="flex justify-end pt-1">
            <button type="submit" disabled={saving} className="ui-btn ui-btn-primary disabled:opacity-50">
              {saving ? 'Menyimpan...' : 'Simpan & Lanjut ke Sinkron Dapodik'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {/* Langkah 2: Sinkron Dapodik */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="ui-card p-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="ui-section-title !normal-case !tracking-normal !text-sm">
              <RefreshCw className="w-4 h-4" />
              Langkah 2 — Sinkron Dapodik (2026/2027 Ganjil)
            </h3>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setStep(0)} className="ui-btn ui-btn-ghost">
                <ArrowLeft className="w-3.5 h-3.5" />
                Kembali
              </button>
              <button type="button" onClick={() => setStep(2)} className="ui-btn ui-btn-primary">
                {(siswaList.length > 0 || syncLogs.length > 0) ? 'Lanjut — Selesai' : 'Lewati Sinkron'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <DapodikSyncView
            config={dapodikConfig}
            sekolah={sekolah}
            onUpdateSekolah={(p) => void onSaveSekolah(p)}
            onConfigChange={onConfigChange}
            existingSiswa={siswaList}
            syncLogs={syncLogs}
            sessionTahun={sessionTahun}
            onRefreshData={onRefreshData}
          />
        </div>
      )}

      {/* Langkah 3: Selesai */}
      {step === 2 && (
        <div className="ui-card p-6 sm:p-8 text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-lg">
            <PartyPopper className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Penyiapan Selesai</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
              {sekolah.nama || 'Sekolah'} • TP {sekolah.tahunAjaran || '2026/2027'} •{' '}
              <strong className="text-slate-700">{siswaList.length} siswa</strong> •{' '}
              <strong className="text-slate-700">{syncLogs.length} log sinkron</strong>
            </p>
          </div>
          {siswaList.length === 0 && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 max-w-md mx-auto">
              Database masih kosong. Anda bisa memuat data contoh untuk latihan, atau kembali ke langkah
              sinkron untuk menarik data Dapodik.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button type="button" onClick={() => setStep(1)} className="ui-btn ui-btn-ghost">
              <ArrowLeft className="w-3.5 h-3.5" />
              Kembali ke Sinkron
            </button>
            {siswaList.length === 0 && (
              <button
                type="button"
                onClick={() => void handleLoadSample()}
                disabled={loadingSample}
                className="ui-btn ui-btn-outline disabled:opacity-50"
              >
                <Database className="w-3.5 h-3.5" />
                {loadingSample ? 'Memuat...' : 'Muat Data Contoh (Latihan)'}
              </button>
            )}
            <button type="button" onClick={onFinish} className="ui-btn ui-btn-primary">
              <Sparkles className="w-4 h-4" />
              Mulai Kelola Aplikasi
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
