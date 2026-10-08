import React, { useState, useEffect, useMemo } from 'react';
import { Search, Download, Trash2, RefreshCw } from 'lucide-react';
import { AuditLog, AuditAksi } from '../types';
import { getAuditLogs, clearAuditLogs } from '../utils/db';
import { PageControl } from './PageControl';
import { toast, confirmDialog } from '../utils/notify';

const AKSI_LABEL: Record<AuditAksi, string> = {
  login: 'Masuk',
  logout: 'Keluar',
  sesi_pindah: 'Pindah sesi',
  login_gagal: 'Gagal masuk',
  login_terkunci: 'Upaya saat terkunci',
  akun_buat: 'Akun dibuat',
  akun_ubah: 'Akun diubah',
  akun_hapus: 'Akun dihapus',
  password_ubah: 'Password diganti',
  password_reset: 'Password di-reset',
  impersonate_mulai: 'Impersonate mulai',
  impersonate_selesai: 'Impersonate selesai',
  siswa_tambah: 'Siswa ditambah',
  siswa_ubah: 'Siswa diubah',
  siswa_hapus: 'Siswa dihapus',
  mutasi_masuk: 'Mutasi masuk',
  mutasi_keluar: 'Mutasi keluar',
  tutup_tahun: 'Tutup tahun',
  buka_tahun: 'Buka kunci tahun',
  sinkron_terapkan: 'Sinkron diterapkan',
  backup_buat: 'Backup dibuat',
  backup_pulihkan: 'Backup dipulihkan',
  backup_reset: 'Reset database',
  cloud_unggah: 'Cloud diunggah',
  cloud_unduh: 'Cloud diunduh',
  cloud_sinkron: 'Sinkron cloud',
};

const AKSI_BADGE: Partial<Record<AuditAksi, string>> = {
  login_gagal: 'ui-badge-rose',
  login_terkunci: 'ui-badge-rose',
  akun_hapus: 'ui-badge-rose',
  siswa_hapus: 'ui-badge-rose',
  mutasi_keluar: 'ui-badge-amber',
  mutasi_masuk: 'ui-badge-emerald',
  backup_reset: 'ui-badge-rose',
  login: 'ui-badge-emerald',
  backup_buat: 'ui-badge-emerald',
  tutup_tahun: 'ui-badge-amber',
  buka_tahun: 'ui-badge-amber',
  password_ubah: 'ui-badge-indigo',
  password_reset: 'ui-badge-indigo',
};

const ENTITAS_OPTIONS = ['semua', 'sesi', 'akun', 'siswa', 'tahun', 'sinkron', 'backup'];
const AKSI_OPTIONS: Array<'semua' | AuditAksi> = ['semua', ...(Object.keys(AKSI_LABEL) as AuditAksi[])];

function formatWaktu(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Tab khusus administrator: jejak siapa-ubah-apa (maks 2000 entri terbaru). */
export const AuditLogView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [fAksi, setFAksi] = useState<'semua' | AuditAksi>('semua');
  const [fEntitas, setFEntitas] = useState('semua');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const muat = async () => {
    setLoading(true);
    try {
      setLogs(await getAuditLogs(2000));
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void muat();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [q, fAksi, fEntitas]);

  const tersaring = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (logs || []).filter((l) => {
      if (fAksi !== 'semua' && l.aksi !== fAksi) return false;
      if (fEntitas !== 'semua' && l.entitas !== fEntitas) return false;
      if (!k) return true;
      return (
        l.aktor.toLowerCase().includes(k) ||
        l.ringkasan.toLowerCase().includes(k) ||
        (l.entitasId || '').toLowerCase().includes(k) ||
        (l.detail || '').toLowerCase().includes(k)
      );
    });
  }, [logs, q, fAksi, fEntitas]);

  const totalPages = Math.max(1, Math.ceil(tersaring.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = tersaring.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleExportCsv = () => {
    if (tersaring.length === 0) {
      toast('Tidak ada data audit untuk diekspor.', 'warning');
      return;
    }
    const baris = ['Waktu,Aktor,Peran,Aksi,Entitas,Ringkasan'];
    for (const l of tersaring) {
      baris.push(
        [l.timestamp, l.aktor, l.peran || '', AKSI_LABEL[l.aksi] || l.aksi, l.entitas, l.ringkasan]
          .map(csvEscape)
          .join(',')
      );
    }
    const blob = new Blob([baris.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `LogAudit_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`${tersaring.length} baris log audit diekspor ke CSV.`, 'success');
  };

  const handleClear = async () => {
    const ok = await confirmDialog(
      'Hapus SELURUH log audit di database ini? Jejak aktivitas akan hilang dan tidak dapat dikembalikan.',
      { confirmLabel: 'Ya, Hapus Semua', danger: true }
    );
    if (!ok) return;
    try {
      await clearAuditLogs();
      await muat();
      toast('Log audit dikosongkan.', 'success');
    } catch (err: unknown) {
      toast(`Gagal mengosongkan log: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  return (
    <div className="space-y-4">
      {/* Aksi: header halaman dirender App via TAB_META (jangan ganda). */}
      <div className="ui-card p-3 flex flex-wrap gap-2 items-center print:hidden">
        <button onClick={() => void muat()} className="ui-btn ui-btn-outline" title="Muat ulang">
          <RefreshCw className="w-4 h-4" />
          <span className="hidden sm:inline">Muat Ulang</span>
        </button>
        <button onClick={handleExportCsv} className="ui-btn ui-btn-outline" title="Ekspor CSV tersaring">
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Ekspor CSV</span>
        </button>
        <button onClick={() => void handleClear()} className="ui-btn ui-btn-danger" title="Kosongkan log">
          <Trash2 className="w-4 h-4" />
          <span className="hidden sm:inline">Kosongkan</span>
        </button>
      </div>

      <div className="ui-card p-4 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari aktor / ringkasan / ID…"
            className="ui-input !pl-9"
            aria-label="Cari log audit"
          />
        </div>
        <select value={fAksi} onChange={(e) => setFAksi(e.target.value as 'semua' | AuditAksi)} className="ui-select !w-auto" aria-label="Filter aksi">
          {AKSI_OPTIONS.map((a) => (
            <option key={a} value={a}>{a === 'semua' ? 'Semua aksi' : AKSI_LABEL[a]}</option>
          ))}
        </select>
        <select value={fEntitas} onChange={(e) => setFEntitas(e.target.value)} className="ui-select !w-auto" aria-label="Filter entitas">
          {ENTITAS_OPTIONS.map((e) => (
            <option key={e} value={e}>{e === 'semua' ? 'Semua entitas' : e}</option>
          ))}
        </select>
      </div>

      <div className="ui-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="ui-table">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Aktor</th>
                <th>Aksi</th>
                <th>Ringkasan</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="text-center py-8 text-slate-500">Memuat log audit…</td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-slate-500">Belum ada aktivitas tercatat{logs.length === 0 ? '' : ' untuk filter ini'}.</td></tr>
              ) : (
                paged.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap text-xs tabular-nums">{formatWaktu(l.timestamp)}</td>
                    <td>
                      <span className="font-mono font-semibold">@{l.aktor}</span>
                      {l.peran && <span className="ml-1.5 ui-badge ui-badge-slate">{l.peran}</span>}
                    </td>
                    <td>
                      <span className={`ui-badge ${AKSI_BADGE[l.aksi] || 'ui-badge-slate'}`}>
                        {AKSI_LABEL[l.aksi] || l.aksi}
                      </span>
                    </td>
                    <td>
                      <div className="text-xs">{l.ringkasan}</div>
                      {l.detail && <div className="text-[11px] text-slate-500 mt-0.5">{l.detail}</div>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PageControl
          page={safePage}
          totalPages={totalPages}
          totalItems={tersaring.length}
          pageSize={pageSize}
          itemName="entri"
          onPageChange={setPage}
          onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
        />
      </div>
    </div>
  );
};
