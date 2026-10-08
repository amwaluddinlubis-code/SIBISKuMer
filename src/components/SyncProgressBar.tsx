import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Circle, MinusCircle, X } from 'lucide-react';

export type SyncStepStatus = 'pending' | 'active' | 'success' | 'error' | 'skipped';

export interface SyncStep {
  id: string;
  label: string;
  status: SyncStepStatus;
  detail?: string;
}

export type SyncResultKind = 'success' | 'error' | 'warning' | 'info';

export interface SyncResult {
  kind: SyncResultKind;
  title: string;
  message: string;
  details?: string[];
}

interface SyncProgressBarProps {
  title: string;
  subtitle?: string;
  percent: number;
  steps: SyncStep[];
  result?: SyncResult | null;
  onDismissResult?: () => void;
  onRetry?: () => void;
}

function stepIcon(status: SyncStepStatus) {
  switch (status) {
    case 'success':
      return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
    case 'error':
      return <XCircle className="w-4 h-4 text-rose-600 shrink-0" />;
    case 'active':
      return <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />;
    case 'skipped':
      return <MinusCircle className="w-4 h-4 text-slate-300 shrink-0" />;
    default:
      return <Circle className="w-4 h-4 text-slate-300 shrink-0" />;
  }
}

const RESULT_STYLE: Record<SyncResultKind, { box: string; icon: React.ReactNode; label: string }> = {
  success: {
    box: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />,
    label: 'Sinkronisasi Berhasil',
  },
  error: {
    box: 'bg-rose-50 border-rose-200 text-rose-900',
    icon: <XCircle className="w-5 h-5 text-rose-600 shrink-0" />,
    label: 'Sinkronisasi Gagal',
  },
  warning: {
    box: 'bg-amber-50 border-amber-200 text-amber-900',
    icon: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />,
    label: 'Selesai dengan Peringatan',
  },
  info: {
    box: 'bg-blue-50 border-blue-200 text-blue-900',
    icon: <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />,
    label: 'Informasi',
  },
};

/** Progress bar + status tahap + notifikasi hasil sinkronisasi Dapodik. */
export const SyncProgressBar: React.FC<SyncProgressBarProps> = ({
  title,
  subtitle,
  percent,
  steps,
  result,
  onDismissResult,
  onRetry,
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const done = steps.filter((s) => s.status === 'success').length;
  const failed = steps.filter((s) => s.status === 'error').length;
  const isRunning = steps.some((s) => s.status === 'active');

  return (
    <div className="bg-white rounded-xl border border-blue-200 shadow-md p-5 space-y-4" role="status" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
            {isRunning && <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />}
            {title}
          </h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <span className="text-xs font-black font-mono px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-800">
          {clamped}%
        </span>
      </div>

      {/* Bar */}
      <div
        className="h-3 w-full rounded-full bg-slate-100 border border-slate-200 overflow-hidden"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={title}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            failed > 0 && !isRunning
              ? 'bg-gradient-to-r from-rose-500 to-amber-500'
              : clamped >= 100
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600'
          }`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <p className="text-[11px] text-slate-500">
        {done}/{steps.length} tahap selesai{failed > 0 ? ` • ${failed} gagal` : ''}
        {isRunning ? ' • sedang berjalan…' : ''}
      </p>

      {/* Tahapan */}
      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {steps.map((s) => (
          <li
            key={s.id}
            className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs ${
              s.status === 'active'
                ? 'border-blue-300 bg-blue-50/60'
                : s.status === 'success'
                  ? 'border-emerald-200 bg-emerald-50/50'
                  : s.status === 'error'
                    ? 'border-rose-200 bg-rose-50/60'
                    : 'border-slate-200 bg-slate-50/60'
            }`}
          >
            {stepIcon(s.status)}
            <span className="min-w-0">
              <span className="block font-bold text-slate-800 leading-tight">{s.label}</span>
              {s.detail && <span className="block text-[11px] text-slate-500 leading-snug mt-0.5 break-words">{s.detail}</span>}
            </span>
          </li>
        ))}
      </ol>

      {/* Notifikasi hasil */}
      {result && (
        <div className={`rounded-xl border p-4 flex items-start gap-3 ${RESULT_STYLE[result.kind].box}`}>
          {RESULT_STYLE[result.kind].icon}
          <div className="min-w-0 flex-1">
            <p className="font-extrabold text-sm">
              {result.title || RESULT_STYLE[result.kind].label}
            </p>
            <p className="text-xs mt-0.5 leading-relaxed whitespace-pre-line">{result.message}</p>
            {result.details && result.details.length > 0 && (
              <ul className="mt-2 space-y-1 text-[11px] opacity-90 list-disc list-inside">
                {result.details.slice(0, 5).map((d, i) => (
                  <li key={i} className="break-words">{d}</li>
                ))}
                {result.details.length > 5 && <li>…dan {result.details.length - 5} lainnya.</li>}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {result.kind === 'error' && onRetry && (
                <button
                  onClick={onRetry}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition"
                >
                  Coba Lagi
                </button>
              )}
              {onDismissResult && (
                <button
                  onClick={onDismissResult}
                  className="px-3.5 py-1.5 bg-white/70 hover:bg-white border border-current/20 text-xs font-bold rounded-lg transition"
                >
                  Tutup
                </button>
              )}
            </div>
          </div>
          {onDismissResult && (
            <button
              onClick={onDismissResult}
              className="p-1 rounded-lg opacity-60 hover:opacity-100 hover:bg-black/5 transition"
              aria-label="Tutup notifikasi hasil"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
