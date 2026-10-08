import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getPageNumbers } from '../utils/pagination';

interface PageControlProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  pageSizeOptions?: number[];
  itemName?: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

/** Kontrol halaman bersama: info rentang, pilihan baris, prev/next + nomor halaman. */
export const PageControl: React.FC<PageControlProps> = ({
  page,
  totalPages,
  totalItems,
  pageSize,
  pageSizeOptions = [10, 20, 50],
  itemName = 'data',
  onPageChange,
  onPageSizeChange,
}) => {
  const numbers = useMemo(() => getPageNumbers(totalPages, page), [totalPages, page]);
  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-slate-50/70 text-xs text-slate-600">
      <div className="flex items-center gap-2">
        <span>Baris:</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="ui-select !w-auto !py-1 !px-2 !text-xs"
          aria-label="Baris per halaman"
        >
          {pageSizeOptions.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <span className="text-slate-500 tabular-nums">
          {from}–{to} dari {totalItems} {itemName}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="ui-btn ui-btn-outline !px-2.5"
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Sebelumnya</span>
        </button>
        {numbers.map((n, i) =>
          n === '…' ? (
            <span key={`e-${i}`} className="px-1 text-slate-400">…</span>
          ) : (
            <button
              key={n}
              onClick={() => onPageChange(n)}
              aria-label={`Halaman ${n}`}
              aria-current={n === page ? 'page' : undefined}
              className={`min-w-8 h-8 px-2 rounded-lg text-[11px] font-bold tabular-nums transition ${
                n === page
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white border border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-700'
              }`}
            >
              {n}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="ui-btn ui-btn-outline !px-2.5"
          aria-label="Halaman berikutnya"
        >
          <span className="hidden sm:inline">Berikutnya</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
