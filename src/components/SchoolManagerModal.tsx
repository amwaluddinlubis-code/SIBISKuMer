import React, { useEffect, useState } from 'react';
import { X, School, Plus, Trash2, Check, Loader2, Database, AlertTriangle } from 'lucide-react';
import { SchoolEntry, JenjangSekolah } from '../types';
import { confirmDialog } from '../utils/notify';

interface SchoolManagerModalProps {
  isOpen: boolean;
  schools: SchoolEntry[];
  activeId: string | null;
  siswaCounts?: Record<string, number | null>;
  switchingId?: string | null;
  busy?: boolean;
  resetting?: boolean;
  onClose: () => void;
  onSwitch: (id: string) => void;
  onCreate: (input: { nama: string; npsn: string; jenjang: JenjangSekolah; withSample: boolean }) => Promise<void>;
  onDelete: (id: string, deletePhysical: boolean) => Promise<void>;
  /** Hapus TOTAL semua database kecuali utama (termasuk sisa fisik yatim). */
  onResetToMain: () => Promise<void>;
}

/** Kelola registry multi-sekolah: tambah, jadikan aktif, hapus (registry / fisik). */
export const SchoolManagerModal: React.FC<SchoolManagerModalProps> = ({
  isOpen,
  schools,
  activeId,
  siswaCounts,
  switchingId,
  busy,
  resetting,
  onClose,
  onSwitch,
  onCreate,
  onDelete,
  onResetToMain,
}) => {
  const [nama, setNama] = useState('');
  const [npsn, setNpsn] = useState('');
  const [jenjang, setJenjang] = useState<JenjangSekolah>('SMP');
  const [withSample, setWithSample] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletePhysical, setDeletePhysical] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setNama('');
      setNpsn('');
      setJenjang('SMP');
      setWithSample(false);
      setFormError(null);
      setSaving(false);
      setDeletingId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cleanNama = nama.trim();
    const cleanNpsn = npsn.trim();
    if (!cleanNama) {
      setFormError('Nama sekolah wajib diisi.');
      return;
    }
    if (cleanNpsn && schools.some((s) => (s.npsn || '').trim() === cleanNpsn)) {
      setFormError(`NPSN ${cleanNpsn} sudah dipakai sekolah lain.`);
      return;
    }
    setSaving(true);
    try {
      await onCreate({ nama: cleanNama.toUpperCase(), npsn: cleanNpsn, jenjang, withSample });
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Gagal menambah sekolah.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: SchoolEntry) => {
    if (schools.length <= 1) return;
    const ok = await confirmDialog(
      deletePhysical
        ? `Hapus "${s.nama}" BESERTA database fisiknya (IndexedDB + cache lokal)? Tindakan ini permanen.`
        : `Hapus "${s.nama}" dari daftar (database fisik dibiarkan, bisa diimpor ulang)?`,
      { confirmLabel: 'Ya, Hapus', danger: true }
    );
    if (!ok) return;
    setDeletingId(s.id);
    try {
      await onDelete(s.id, deletePhysical);
    } finally {
      setDeletingId(null);
    }
  };

  const handleResetToMain = async () => {
    const lain = schools.filter((s) => s.id !== activeId).length;
    const ok = await confirmDialog(
      `Hapus TOTAL ${lain > 0 ? `${lain} database sekolah lain` : 'semua sisa database'} dan tinggalkan HANYA database utama? ` +
        `File IndexedDB + cache milik database lain (termasuk sisa fisik yatim tak terdaftar) dihapus permanen dan aplikasi dimuat ulang. Database utama TIDAK dihapus.`,
      { confirmLabel: 'Ya, Hapus Semua Kecuali Utama', danger: true }
    );
    if (!ok) return;
    await onResetToMain();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl anim-fade-up">
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-100 px-5 py-4 flex items-center gap-3 rounded-t-2xl z-10">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-navy-900 text-gold-300 flex items-center justify-center shrink-0">
            <Database className="w-4.5 h-4.5" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-extrabold text-slate-900">Multi-Sekolah — Satu Laptop, Banyak Database</h2>
            <p className="text-[11px] text-slate-500">Tiap sekolah punya database IndexedDB sendiri & terisolasi penuh.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Daftar sekolah */}
          <div className="space-y-2">
            {schools.map((s) => {
              const isActive = s.id === activeId;
              const busyRow = switchingId === s.id || deletingId === s.id;
              return (
                <div
                  key={s.id}
                  className={`rounded-2xl border p-3.5 flex items-center gap-3 transition ${
                    isActive ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-extrabold shrink-0 ${
                    isActive ? 'bg-navy-900 text-gold-300' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {s.jenjang}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-extrabold text-slate-900 truncate">
                      {s.nama}
                      {isActive && (
                        <span className="ml-2 inline-flex items-center gap-1 px-2 py-px rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase">
                          <Check className="w-3 h-3" /> Aktif
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono truncate">
                      NPSN {s.npsn || '-'} • {typeof siswaCounts?.[s.id] === 'number' ? `${siswaCounts?.[s.id]} siswa` : 'menghitung…'} • {new Date(s.createdAt).toLocaleDateString('id-ID')}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">DB: {s.dbName}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isActive && (
                      <button
                        type="button"
                        disabled={!!switchingId || !!deletingId || !!busy}
                        onClick={() => onSwitch(s.id)}
                        className="px-3 py-1.5 rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-[11px] font-bold transition cursor-pointer disabled:opacity-60 inline-flex items-center gap-1.5"
                      >
                        {switchingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        Jadikan aktif
                      </button>
                    )}
                    <button
                      type="button"
                      title={schools.length <= 1 ? 'Tidak dapat menghapus satu-satunya sekolah' : 'Hapus sekolah'}
                      disabled={schools.length <= 1 || !!switchingId || !!deletingId || !!busy}
                      onClick={() => void handleDelete(s)}
                      className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer disabled:opacity-40"
                    >
                      {deletingId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                    {busyRow && <span className="sr-only">Memproses…</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <label className="flex items-start gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 cursor-pointer text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={deletePhysical}
              onChange={(e) => setDeletePhysical(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-rose-600"
            />
            <span>
              <strong className="text-slate-800">Hapus permanen database fisik</strong> saat menghapus sekolah
              (IndexedDB + cache lokal ter-scope). Matikan bila hanya ingin menghapus dari daftar.
            </span>
          </label>

          {/* Form tambah */}
          <form onSubmit={(e) => void handleCreate(e)} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <h3 className="text-xs font-extrabold text-slate-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-700" />
              Tambah sekolah baru
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Nama sekolah *</label>
                <input
                  type="text"
                  required
                  aria-required="true"
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  placeholder="cth. SD NEGERI 02 MERDEKA"
                  className="ui-input uppercase"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">NPSN (unik, opsional)</label>
                <input
                  type="text"
                  value={npsn}
                  onChange={(e) => setNpsn(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
                  placeholder="cth. 10204588"
                  inputMode="numeric"
                  className="ui-input font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Jenjang *</label>
                <select value={jenjang} onChange={(e) => setJenjang(e.target.value as JenjangSekolah)} className="ui-input">
                  <option value="SD">SD</option>
                  <option value="SMP">SMP</option>
                </select>
              </div>
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer text-[11px] text-slate-600">
              <input
                type="checkbox"
                checked={withSample}
                onChange={(e) => setWithSample(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-blue-700"
              />
              <span>Mulai dengan <strong>5 data contoh + akun bawaan</strong>. Matikan untuk database kosong (hanya profil, config & akun).</span>
            </label>
            {formError && (
              <p className="flex items-start gap-2 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
                {formError}
              </p>
            )}
            <button
              type="submit"
              disabled={saving || !!switchingId}
              className="ui-btn ui-btn-primary disabled:opacity-60 inline-flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <School className="w-3.5 h-3.5" />}
              {saving ? 'Menyiapkan database…' : 'Tambah & siapkan database'}
            </button>
          </form>

          {/* Zona berbahaya: reset ke satu database utama */}
          <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 space-y-2.5">
            <h3 className="text-xs font-extrabold text-rose-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              Zona Berbahaya
            </h3>
            <p className="text-[11px] text-rose-800/80 leading-relaxed">
              Hapus <strong>semua database sekolah kecuali utama</strong> — termasuk sisa file fisik yatim
              yang tak terdaftar. Database utama tidak dihapus. Aplikasi dimuat ulang setelahnya.
            </p>
            <button
              type="button"
              disabled={!!switchingId || !!deletingId || !!busy || !!resetting}
              onClick={() => void handleResetToMain()}
              className="ui-btn !bg-rose-600 hover:!bg-rose-700 !text-white disabled:opacity-60 inline-flex items-center gap-2"
            >
              {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {resetting ? 'Menghapus…' : 'Hapus Semua Kecuali Database Utama'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
