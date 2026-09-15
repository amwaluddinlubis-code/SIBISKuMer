import React, { useState } from 'react';
import { Download, CheckCircle2, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-md border border-emerald-200">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Terpasang PWA
      </span>
    );
  }

  if (isInstallable) {
    return (
      <button
        id="btn-install-pwa"
        onClick={install}
        className={`inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-800 transition active:scale-95 ${className}`}
        title="Pasang aplikasi di desktop / ponsel untuk akses cepat offline"
      >
        <Download className="w-3.5 h-3.5" />
        Pasang Aplikasi (Offline PWA)
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          id="btn-install-ios-pwa"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition shadow-sm ${className}`}
        >
          <Smartphone className="w-3.5 h-3.5 text-blue-600" />
          Pasang di iOS
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-slate-900">Pasang di iPhone / iPad</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed space-y-2">
                <span className="block">1. Ketuk tombol <strong>Bagikan (Share)</strong> di bilah bawah Safari.</span>
                <span className="block">2. Gulir ke bawah lalu pilih <strong>Tambahkan ke Layar Utama (Add to Home Screen)</strong>.</span>
                <span className="block text-emerald-600 font-medium">3. Aplikasi siap dibuka kapan saja tanpa koneksi internet!</span>
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-lg bg-slate-900 py-2 text-xs font-medium text-white hover:bg-slate-800"
              >
                Mengerti
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
