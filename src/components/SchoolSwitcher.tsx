import React, { useState, useRef, useEffect } from 'react';
import { School, ChevronDown, Check, Settings2, Loader2 } from 'lucide-react';
import { SchoolEntry } from '../types';

interface SchoolSwitcherProps {
  schools: SchoolEntry[];
  activeId: string | null;
  siswaCounts?: Record<string, number | null>;
  switchingId?: string | null;
  onSwitch: (id: string) => void;
  onManage: () => void;
}

/** Pemilih sekolah aktif di topbar (khusus administrator). */
export const SchoolSwitcher: React.FC<SchoolSwitcherProps> = ({
  schools,
  activeId,
  siswaCounts,
  switchingId,
  onSwitch,
  onManage,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = schools.find((s) => s.id === activeId) || schools[0] || null;

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!active) return null;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Ganti sekolah aktif (multi-database)"
        aria-label="Ganti sekolah aktif"
        className="flex items-center gap-2 pl-2.5 pr-2 py-1.5 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 bg-white shadow-xs transition cursor-pointer max-w-56"
      >
        <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-navy-900 text-gold-300 flex items-center justify-center shrink-0">
          <School className="w-3.5 h-3.5" />
        </span>
        <span className="min-w-0 text-left hidden sm:block">
          <span className="block text-[11px] font-extrabold text-slate-900 truncate leading-tight max-w-32">
            {active.nama}
          </span>
          <span className="block text-[10px] text-slate-500 font-mono leading-tight">
            {active.jenjang} • {typeof siswaCounts?.[active.id] === 'number' ? `${siswaCounts?.[active.id]} siswa` : '…'}
          </span>
        </span>
        {switchingId ? (
          <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin shrink-0" />
        ) : (
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 overflow-hidden z-50 anim-fade-up">
          <p className="px-4 pt-3 pb-1.5 text-[10px] font-extrabold uppercase tracking-[0.15em] text-slate-400">
            Sekolah aktif ({schools.length})
          </p>
          <div className="max-h-64 overflow-y-auto">
            {schools.map((s) => {
              const isActive = s.id === active.id;
              const busy = switchingId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!!switchingId}
                  onClick={() => {
                    if (!isActive) onSwitch(s.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-2.5 transition cursor-pointer disabled:opacity-60 ${
                    isActive ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-extrabold shrink-0 ${
                    isActive ? 'bg-navy-900 text-gold-300' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {s.jenjang}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-slate-900 truncate">{s.nama}</span>
                    <span className="block text-[10px] text-slate-500 font-mono">
                      NPSN {s.npsn || '-'} • {typeof siswaCounts?.[s.id] === 'number' ? `${siswaCounts?.[s.id]} siswa` : '…'}
                    </span>
                  </span>
                  {busy ? (
                    <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                  ) : isActive ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="border-t border-slate-100 p-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onManage();
              }}
              className="w-full px-3 py-2 rounded-xl text-xs font-bold text-navy-900 hover:bg-slate-50 flex items-center gap-2 transition cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5 text-slate-500" />
              Kelola multi-sekolah (tambah / hapus)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
