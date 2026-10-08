import React, { useEffect, useMemo, useState } from 'react';
import {
  Users,
  Search,
  Plus,
  Pencil,
  Trash2,
  Eye,
  Download,
  RefreshCw,
  Database,
  GraduationCap,
  Briefcase,
  School,
  X,
  Save,
} from 'lucide-react';
import { PtkRef, RombelRef } from '../types';
import { savePtkRef, deletePtkRef } from '../utils/db';
import { PageControl } from './PageControl';
import { toast, confirmDialog } from '../utils/notify';
import { unduhExcel } from '../utils/excel';
import { validateGtkInput } from '../utils/validation';

interface GtkViewProps {
  ptk: PtkRef[];
  rombel: RombelRef[];
  isAdmin: boolean;
  onOpenSync: () => void;
  onDataChanged: () => void;
}

export type GtkKategori = 'Guru' | 'Tendik';

const TENDIK_KEYWORDS = [
  'tendik', 'tenaga kependidikan', 'tu ', 'tata usaha', 'operator',
  'pustakawan', 'laboran', 'teknisi', 'penjaga', 'satpam', 'security',
  'kebersihan', 'tukang', 'supir', 'sopir', 'pesuruh', 'administrasi',
];

/** Klasifikasi Guru vs Tendik dari field jenisPtk hasil sinkronisasi Dapodik. */
export function getGtkKategori(p: PtkRef): GtkKategori {
  const s = `${p.jenisPtk || ''} ${p.tugasTambahan || ''}`.toLowerCase();
  if (TENDIK_KEYWORDS.some((k) => s.includes(k))) return 'Tendik';
  return 'Guru';
}

export function getRombelBinaan(namaGtk: string, rombel: RombelRef[]): RombelRef[] {
  const key = (namaGtk || '').trim().toUpperCase();
  if (!key) return [];
  return (rombel || []).filter((r) => (r.waliKelas || '').trim().toUpperCase() === key);
}

function toCsvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const JENIS_OPTIONS = [
  'Kepala Sekolah',
  'Guru Kelas',
  'Guru Mata Pelajaran',
  'Guru BK',
  'Guru Pendamping',
  'Tenaga Administrasi Sekolah',
  'Operator Dapodik',
  'Pustakawan',
  'Laboran',
  'Penjaga Sekolah',
  'Lainnya',
];

const STATUS_OPTIONS = ['PNS', 'PPPK', 'GTY/PTY', 'Honorer', 'Kontrak', 'Lainnya'];

const emptyForm = (): PtkRef => ({
  id: '',
  nama: '',
  nip: '',
  nik: '',
  nuptk: '',
  jenisKelamin: 'L',
  tempatLahir: '',
  tanggalLahir: '',
  jenisPtk: 'Guru Mata Pelajaran',
  statusKepegawaian: 'Honorer',
  mapelAjar: '',
  tugasTambahan: '',
  updatedAt: new Date().toISOString(),
  source: 'manual',
});

export const GtkView: React.FC<GtkViewProps> = ({ ptk, rombel, isAdmin, onOpenSync, onDataChanged }) => {
  const [search, setSearch] = useState('');
  const [filterKategori, setFilterKategori] = useState<'all' | GtkKategori>('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSource, setFilterSource] = useState<'all' | 'dapodik' | 'manual'>('all');
  const [detail, setDetail] = useState<PtkRef | null>(null);
  const [editing, setEditing] = useState<PtkRef | null>(null);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of ptk || []) if (p.statusKepegawaian) set.add(p.statusKepegawaian);
    return [...set].sort();
  }, [ptk]);

  const stats = useMemo(() => {
    const list = ptk || [];
    const guru = list.filter((p) => getGtkKategori(p) === 'Guru').length;
    const waliCount = new Set(
      (rombel || []).map((r) => (r.waliKelas || '').trim().toUpperCase()).filter(Boolean)
    ).size;
    return {
      total: list.length,
      guru,
      tendik: list.length - guru,
      wali: waliCount,
      dapodik: list.filter((p) => p.source === 'dapodik').length,
    };
  }, [ptk, rombel]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...(ptk || [])]
      .filter((p) => {
        if (filterKategori !== 'all' && getGtkKategori(p) !== filterKategori) return false;
        if (filterStatus !== 'all' && (p.statusKepegawaian || '') !== filterStatus) return false;
        if (filterSource !== 'all' && p.source !== filterSource) return false;
        if (!q) return true;
        return (
          p.nama.toLowerCase().includes(q) ||
          (p.nip || '').includes(q) ||
          (p.nuptk || '').includes(q) ||
          (p.nik || '').includes(q) ||
          (p.mapelAjar || '').toLowerCase().includes(q) ||
          (p.jenisPtk || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.nama.localeCompare(b.nama));
  }, [ptk, search, filterKategori, filterStatus, filterSource]);

  // Pagination — reset ke halaman 1 setiap filter berubah agar tidak kosong
  useEffect(() => {
    setPage(1);
  }, [search, filterKategori, filterStatus, filterSource, ptk.length]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  const handleExportCsv = () => {
    const header = ['Nama', 'NIP', 'NUPTK', 'NIK', 'L/P', 'Kategori', 'Jenis PTK', 'Status Kepegawaian', 'Mapel Ajar', 'Tugas Tambahan', 'Rombel Binaan', 'Sumber'];
    const rows = filtered.map((p) => [
      p.nama,
      p.nip || '',
      p.nuptk || '',
      p.nik || '',
      p.jenisKelamin || '',
      getGtkKategori(p),
      p.jenisPtk || '',
      p.statusKepegawaian || '',
      p.mapelAjar || '',
      p.tugasTambahan || '',
      getRombelBinaan(p.nama, rombel).map((r) => r.nama).join('; '),
      p.source,
    ]);
    const csv = [header, ...rows].map((r) => r.map(toCsvCell).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GTK_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Diekspor ${filtered.length} data GTK ke CSV.`, 'success');
  };

  const handleExportExcel = async () => {
    if (filtered.length === 0) {
      toast('Tidak ada data GTK untuk diekspor.', 'warning');
      return;
    }
    try {
      const header = ['Nama', 'NIP', 'NUPTK', 'NIK', 'L/P', 'Kategori', 'Jenis PTK', 'Status Kepegawaian', 'Mapel Ajar', 'Tugas Tambahan', 'Rombel Binaan', 'Sumber'];
      const rows = filtered.map((p) => [
        p.nama || '',
        p.nip || '',
        p.nuptk || '',
        p.nik || '',
        p.jenisKelamin || '',
        getGtkKategori(p),
        p.jenisPtk || '',
        p.statusKepegawaian || '',
        p.mapelAjar || '',
        p.tugasTambahan || '',
        getRombelBinaan(p.nama, rombel).map((r) => r.nama).join('; '),
        p.source || '',
      ]);
      await unduhExcel(`GTK_${new Date().toISOString().slice(0, 10)}`, [
        { nama: 'GTK', baris: [header, ...rows] },
      ]);
      toast(`Diekspor ${filtered.length} data GTK ke Excel.`, 'success');
    } catch (err: unknown) {
      toast(`Gagal mengekspor Excel: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const handleDelete = async (p: PtkRef) => {
    const ok = await confirmDialog(`Hapus data GTK "${p.nama}" secara permanen?`, { confirmLabel: 'Ya, Hapus', danger: true });
    if (!ok) return;
    try {
      await deletePtkRef(p.id);
      toast(`Data GTK "${p.nama}" berhasil dihapus.`, 'success');
      if (detail?.id === p.id) setDetail(null);
      onDataChanged();
    } catch (err: unknown) {
      toast(`Gagal menghapus GTK: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const issues = validateGtkInput({ nama: editing.nama, nip: editing.nip, nik: editing.nik, nuptk: editing.nuptk });
    if (issues.length > 0) {
      toast(issues[0], 'error');
      return;
    }
    setSaving(true);
    try {
      await savePtkRef({ ...editing, nama: editing.nama.trim().toUpperCase() });
      toast(`Data GTK "${editing.nama}" tersimpan.`, 'success');
      setEditing(null);
      onDataChanged();
    } catch (err: unknown) {
      toast(`Gagal menyimpan GTK: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const statCard = (label: string, value: number, icon: React.ReactNode, tint: string) => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex items-center gap-3">
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tint}`}>{icon}</span>
      <span>
        <span className="block text-xl font-black text-slate-900 leading-none">{value}</span>
        <span className="block text-[11px] text-slate-500 font-semibold mt-1">{label}</span>
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Statistik */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {statCard('Total GTK', stats.total, <Users className="w-5 h-5" />, 'bg-indigo-100 text-indigo-700')}
        {statCard('Guru', stats.guru, <GraduationCap className="w-5 h-5" />, 'bg-blue-100 text-blue-700')}
        {statCard('Tendik', stats.tendik, <Briefcase className="w-5 h-5" />, 'bg-amber-100 text-amber-700')}
        {statCard('Wali Kelas (Rombel)', stats.wali, <School className="w-5 h-5" />, 'bg-emerald-100 text-emerald-700')}
        {statCard('Dari Dapodik', stats.dapodik, <Database className="w-5 h-5" />, 'bg-slate-100 text-slate-700')}
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-52">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, NIP, NUPTK, mapel…"
              className="ui-input !pl-9"
              aria-label="Cari GTK"
            />
          </div>
          <select value={filterKategori} onChange={(e) => setFilterKategori(e.target.value as 'all' | GtkKategori)} className="ui-input !w-auto" aria-label="Filter kategori">
            <option value="all">Semua Kategori</option>
            <option value="Guru">Guru</option>
            <option value="Tendik">Tendik</option>
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="ui-input !w-auto" aria-label="Filter status kepegawaian">
            <option value="all">Semua Status</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select value={filterSource} onChange={(e) => setFilterSource(e.target.value as 'all' | 'dapodik' | 'manual')} className="ui-input !w-auto" aria-label="Filter sumber data">
            <option value="all">Semua Sumber</option>
            <option value="dapodik">Dapodik</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <button onClick={onOpenSync} className="ui-btn ui-btn-outline">
              <RefreshCw className="w-3.5 h-3.5" />
              Sinkron Dapodik
            </button>
          )}
          <button onClick={handleExportCsv} disabled={filtered.length === 0} className="ui-btn ui-btn-outline disabled:opacity-50">
            <Download className="w-3.5 h-3.5" />
            Export CSV ({filtered.length})
          </button>
          <button onClick={() => void handleExportExcel()} disabled={filtered.length === 0} className="ui-btn ui-btn-outline disabled:opacity-50" title="Ekspor ke Excel (.xlsx)">
            <Download className="w-3.5 h-3.5" />
            Export Excel
          </button>
          {isAdmin && (
            <button onClick={() => setEditing(emptyForm())} className="ui-btn ui-btn-primary">
              <Plus className="w-3.5 h-3.5" />
              Tambah GTK
            </button>
          )}
        </div>
      </div>

      {/* Tabel */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <div className="mx-auto w-11 h-11 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {(ptk || []).length === 0
                ? 'Belum ada data GTK. Lakukan Sinkron Dapodik (getGtk/getPTK) atau tambah manual.'
                : 'Tidak ada GTK yang cocok dengan filter.'}
            </p>
            {isAdmin && (ptk || []).length === 0 && (
              <button onClick={onOpenSync} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl text-xs shadow-sm transition cursor-pointer">
                <RefreshCw className="w-3.5 h-3.5" />
                Buka Sinkron Dapodik
              </button>
            )}
          </div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-[10px] border-b border-slate-200">
                <tr>
                  <th className="p-3">Nama / NUPTK</th>
                  <th className="p-3">NIP</th>
                  <th className="p-3 text-center">Kategori</th>
                  <th className="p-3">Jenis / Status</th>
                  <th className="p-3">Mapel</th>
                  <th className="p-3 text-center">Rombel Binaan</th>
                  <th className="p-3 text-center">Sumber</th>
                  <th className="p-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((p) => {
                  const binaan = getRombelBinaan(p.nama, rombel);
                  const kat = getGtkKategori(p);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        <p className="font-bold text-slate-900">{p.nama}</p>
                        <p className="text-[11px] text-slate-500 font-mono">NUPTK: {p.nuptk || '-'}</p>
                      </td>
                      <td className="p-3 font-mono text-slate-700">{p.nip || '-'}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${kat === 'Guru' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                          {kat}
                        </span>
                      </td>
                      <td className="p-3">
                        <p className="text-slate-800 font-semibold">{p.jenisPtk || '-'}</p>
                        <p className="text-[11px] text-slate-500">{p.statusKepegawaian || '-'}</p>
                      </td>
                      <td className="p-3 text-slate-700 max-w-44 truncate" title={p.mapelAjar}>{p.mapelAjar || '-'}</td>
                      <td className="p-3 text-center">
                        {binaan.length > 0 ? (
                          <span className="inline-flex flex-wrap justify-center gap-1">
                            {binaan.map((r) => (
                              <span key={r.id} className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">{r.nama}</span>
                            ))}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${p.source === 'dapodik' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-700'}`}>
                          {p.source === 'dapodik' ? 'Dapodik' : 'Manual'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setDetail(p)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition" title="Detail" aria-label={`Detail ${p.nama}`}>
                            <Eye className="w-4 h-4" />
                          </button>
                          {isAdmin && (
                            <>
                              <button onClick={() => setEditing({ ...p })} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-500 hover:text-blue-700 transition" title="Ubah" aria-label={`Ubah ${p.nama}`}>
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete(p)} className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-500 hover:text-rose-700 transition" title="Hapus" aria-label={`Hapus ${p.nama}`}>
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PageControl
            page={safePage}
            totalPages={totalPages}
            totalItems={filtered.length}
            pageSize={pageSize}
            itemName="GTK"
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
          />
          </>
        )}
      </div>

      {/* Modal detail */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-sm text-slate-900">{detail.nama}</h3>
                <p className="text-[11px] text-slate-500">{getGtkKategori(detail)} • {detail.jenisPtk || '-'} • {detail.statusKepegawaian || '-'}</p>
              </div>
              <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg hover:bg-slate-100 transition" aria-label="Tutup detail">
                <X className="w-4 h-4" />
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              {([
                ['NIP', detail.nip || '-'],
                ['NUPTK', detail.nuptk || '-'],
                ['NIK', detail.nik || '-'],
                ['L/P', detail.jenisKelamin || '-'],
                ['Tempat Lahir', detail.tempatLahir || '-'],
                ['Tanggal Lahir', detail.tanggalLahir || '-'],
                ['Mapel Ajar', detail.mapelAjar || '-'],
                ['Tugas Tambahan', detail.tugasTambahan || '-'],
                ['ID Dapodik', detail.dapodikId || '-'],
                ['Sumber', detail.source === 'dapodik' ? 'Sinkronisasi Dapodik' : 'Input manual'],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="py-1.5 border-b border-slate-100">
                  <dt className="text-slate-400 text-[11px] font-semibold">{k}</dt>
                  <dd className="font-semibold text-slate-900 break-words">{v}</dd>
                </div>
              ))}
            </dl>
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Rombel Binaan (Wali Kelas)</p>
              {getRombelBinaan(detail.nama, rombel).length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {getRombelBinaan(detail.nama, rombel).map((r) => (
                    <span key={r.id} className="px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                      {r.nama}{r.tingkat ? ` • Kelas ${r.tingkat}` : ''}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">Bukan wali kelas rombel mana pun.</p>
              )}
            </div>
            {isAdmin && (
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => { setEditing({ ...detail }); setDetail(null); }} className="ui-btn ui-btn-primary">
                  <Pencil className="w-3.5 h-3.5" /> Ubah
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal form tambah/ubah */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <form onSubmit={handleSaveForm} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-sm text-slate-900">{editing.id ? 'Ubah Data GTK' : 'Tambah GTK Manual'}</h3>
              <button type="button" onClick={() => setEditing(null)} className="p-1.5 rounded-lg hover:bg-slate-100 transition" aria-label="Tutup form">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="ui-label" htmlFor="gtk-nama">Nama Lengkap *</label>
              <input id="gtk-nama" className="ui-input" value={editing.nama} onChange={(e) => setEditing({ ...editing, nama: e.target.value })} placeholder="cth: SITI RAHMAWATI, S.Pd." required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="ui-label" htmlFor="gtk-nip">NIP</label>
                <input id="gtk-nip" className="ui-input font-mono" value={editing.nip || ''} onChange={(e) => setEditing({ ...editing, nip: e.target.value })} placeholder="-" />
              </div>
              <div>
                <label className="ui-label" htmlFor="gtk-nuptk">NUPTK</label>
                <input id="gtk-nuptk" className="ui-input font-mono" value={editing.nuptk || ''} onChange={(e) => setEditing({ ...editing, nuptk: e.target.value })} placeholder="-" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="ui-label" htmlFor="gtk-nik">NIK</label>
                <input id="gtk-nik" className="ui-input font-mono" value={editing.nik || ''} onChange={(e) => setEditing({ ...editing, nik: e.target.value })} placeholder="-" />
              </div>
              <div>
                <label className="ui-label" htmlFor="gtk-jk">Jenis Kelamin</label>
                <select id="gtk-jk" className="ui-input" value={editing.jenisKelamin || 'L'} onChange={(e) => setEditing({ ...editing, jenisKelamin: e.target.value as 'L' | 'P' })}>
                  <option value="L">Laki-laki</option>
                  <option value="P">Perempuan</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="ui-label" htmlFor="gtk-jenis">Jenis PTK</label>
                <select id="gtk-jenis" className="ui-input" value={editing.jenisPtk || ''} onChange={(e) => setEditing({ ...editing, jenisPtk: e.target.value })}>
                  {JENIS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="ui-label" htmlFor="gtk-status">Status Kepegawaian</label>
                <select id="gtk-status" className="ui-input" value={editing.statusKepegawaian || ''} onChange={(e) => setEditing({ ...editing, statusKepegawaian: e.target.value })}>
                  {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="ui-label" htmlFor="gtk-mapel">Mapel / Bidang Ajar</label>
              <input id="gtk-mapel" className="ui-input" value={editing.mapelAjar || ''} onChange={(e) => setEditing({ ...editing, mapelAjar: e.target.value })} placeholder="cth: Matematika" />
            </div>
            <div>
              <label className="ui-label" htmlFor="gtk-tugas">Tugas Tambahan</label>
              <input id="gtk-tugas" className="ui-input" value={editing.tugasTambahan || ''} onChange={(e) => setEditing({ ...editing, tugasTambahan: e.target.value })} placeholder="cth: Wali Kelas 7A" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="ui-label" htmlFor="gtk-tl">Tempat Lahir</label>
                <input id="gtk-tl" className="ui-input" value={editing.tempatLahir || ''} onChange={(e) => setEditing({ ...editing, tempatLahir: e.target.value })} />
              </div>
              <div>
                <label className="ui-label" htmlFor="gtk-tgl">Tanggal Lahir</label>
                <input id="gtk-tgl" type="date" className="ui-input" value={editing.tanggalLahir || ''} onChange={(e) => setEditing({ ...editing, tanggalLahir: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditing(null)} className="ui-btn ui-btn-ghost">Batal</button>
              <button type="submit" disabled={saving} className="ui-btn ui-btn-primary disabled:opacity-50">
                <Save className="w-3.5 h-3.5" /> {saving ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
