import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';
import { subscribeToast, ToastPayload } from '../utils/notify';

const KIND_STYLE: Record<ToastPayload['kind'], { bar: string; icon: React.ReactNode }> = {
  success: { bar: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" /> },
  error: { bar: 'border-rose-200 bg-rose-50 text-rose-900', icon: <XCircle className="w-4 h-4 text-rose-600" /> },
  warning: { bar: 'border-amber-200 bg-amber-50 text-amber-900', icon: <AlertTriangle className="w-4 h-4 text-amber-600" /> },
  info: { bar: 'border-blue-200 bg-blue-50 text-blue-900', icon: <Info className="w-4 h-4 text-blue-600" /> },
};

export const ToastHost: React.FC = () => {
  const [items, setItems] = useState<ToastPayload[]>([]);

  useEffect(() => {
    const unsub = subscribeToast((t) => {
      setItems((prev) => [...prev.slice(-3), t]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== t.id));
      }, 4200);
    });
    return unsub;
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[min(92vw,360px)] print:hidden" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`anim-fade-up flex items-start gap-2 rounded-2xl border px-3.5 py-3 text-xs font-semibold shadow-xl ${KIND_STYLE[t.kind].bar}`}>
          <span className="mt-0.5 shrink-0">{KIND_STYLE[t.kind].icon}</span>
          <p className="flex-1 leading-relaxed">{t.message}</p>
          <button
            onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
            className="rounded-lg p-0.5 opacity-60 hover:opacity-100 hover:bg-black/5 transition"
            aria-label="Tutup notifikasi"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
