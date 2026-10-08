import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { subscribeConfirmRequest, resolvePendingConfirm, ConfirmRequest } from '../utils/notify';

export const ConfirmDialogHost: React.FC = () => {
  const [queue, setQueue] = useState<ConfirmRequest[]>([]);
  const req = queue[0] || null;

  useEffect(() => {
    const unsub = subscribeConfirmRequest((r) => setQueue((prev) => [...prev, r]));
    return unsub;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!req) return;
      if (e.key === 'Escape') {
        setQueue((prev) => prev.filter((x) => x.id !== req.id));
        resolvePendingConfirm(false, req.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req]);

  if (!req) return null;

  const answer = (ok: boolean) => {
    setQueue((prev) => prev.filter((x) => x.id !== req.id));
    resolvePendingConfirm(ok, req.id);
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-navy-950/70 backdrop-blur-sm p-4 print:hidden" role="alertdialog" aria-modal="true">
      <div className="anim-scale-in w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl border border-slate-200">
        <div className="flex items-start gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-sm ${req.danger ? 'bg-gradient-to-br from-rose-500 to-rose-700 text-white' : 'bg-gradient-to-br from-blue-600 to-navy-900 text-white'}`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">Konfirmasi Tindakan</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 whitespace-pre-line">{req.message}</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => answer(false)}
            className="ui-btn ui-btn-ghost"
          >
            {req.cancelLabel}
          </button>
          <button
            onClick={() => answer(true)}
            className={`ui-btn ${req.danger ? 'ui-btn-danger' : 'ui-btn-primary'}`}
          >
            {req.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
