import React from 'react';

interface PageHeaderProps {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  accent?: 'blue' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'purple' | 'slate';
  actions?: React.ReactNode;
}

const ACCENT: Record<NonNullable<PageHeaderProps['accent']>, string> = {
  blue: 'from-blue-600 to-navy-900',
  indigo: 'from-indigo-500 to-indigo-700',
  emerald: 'from-emerald-500 to-emerald-700',
  amber: 'from-amber-500 to-amber-600',
  rose: 'from-rose-500 to-rose-700',
  purple: 'from-purple-500 to-purple-700',
  slate: 'from-slate-600 to-slate-800',
};

/** Kepala halaman konsisten: ikon gradien + judul + deskripsi + aksi kanan. */
export const PageHeader: React.FC<PageHeaderProps> = ({
  icon: Icon,
  title,
  subtitle,
  accent = 'blue',
  actions,
}) => (
  <div className="anim-fade-up flex flex-wrap items-center justify-between gap-3 mb-5 print:hidden">
    <div className="flex items-center gap-3 min-w-0">
      <div className={`w-10 h-10 rounded bg-gradient-to-br ${ACCENT[accent]} text-white flex items-center justify-center shadow-md shrink-0`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight">
          {title}
        </h1>
        <p className="text-xs text-slate-500 leading-snug">{subtitle}</p>
      </div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);
