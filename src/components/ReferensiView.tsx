import React, { useMemo, useState } from 'react';
import {
  Layers,
  School,
  Users,
  Building2,
  Pencil,
  Database,
  RefreshCw,
  ArrowRight
} from 'lucide-react';
import { RombelRef, PtkRef, SekolahProfile, Siswa } from '../types';
import { GtkView } from './GtkView';

interface ReferensiViewProps {
  rombel: RombelRef[];
  ptk: PtkRef[];
  sekolah: SekolahProfile;
  siswa: Siswa[];
  isAdmin: boolean;
  /** Sesi tahun ajaran login — daftar rombel mengikuti sesi ini. */
  sessionTahun?: string | null;
  onEditSekolah: () => void;
  onOpenSync: () => void;
  onDataChanged?: () => void;
  onOpenGtk?: () => void;
}

type SubTab = 'rombel' | 'ptk' | 'sekolah';

export const ReferensiView: React.FC<ReferensiViewProps> = ({
  rombel,
  ptk,
  sekolah,
  siswa,
  isAdmin,
  sessionTahun,
  onEditSekolah,
  onOpenSync,
  onDataChanged,
  onOpenGtk
}) => {
  const [subTab, setSubTab] = useState<SubTab>('rombel');
  // Fondasi sesi: rombel ref berdimensi tahun → default tampil sesi berjalan.
  const [filterTahunRombel, setFilterTahunRombel] = useState<string>('sesi');
  const tahunRombelOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rombel || []) if ((r.tahunAjaran || '').trim()) set.add(r.tahunAjaran!.trim());
    return [...set].sort().reverse();
  }, [rombel]);
  const sesi = (sessionTahun || '').trim();
  const rombelTampil = useMemo(() => {
    if (filterTahunRombel === 'all') return rombel;
    const target = filterTahunRombel === 'sesi' ? sesi : filterTahunRombel;
    if (!target) return rombel;
    const cocok = (rombel || []).filter((r) => (r.tahunAjaran || '').trim() === target);
    // Rombel tanpa cap tahun (warisan/sinkron lama) tetap ditampilkan di sesi.
    const tanpaTahun = filterTahunRombel === 'sesi'
      ? (rombel || []).filter((r) => !(r.tahunAjaran || '').trim())
      : [];
    return [...cocok, ...tanpaTahun];
  }, [rombel, filterTahunRombel, sesi]);

  // Hitung anggota aktual per rombel dari data siswa lokal
  const anggotaAktual = (namaRombel: string) => {
    const key = (namaRombel || '').trim().toUpperCase();
    return (siswa || []).filter(
      (s) => (s.rombelSaatIni || '').trim().toUpperCase() === key
    ).length;
  };

  const tabs: { id: SubTab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: 'rombel', label: 'Rombongan Belajar', icon: School, count: rombelTampil.length },
    { id: 'ptk', label: 'PTK (Guru & Tendik)', icon: Users, count: ptk.length },
    { id: 'sekolah', label: 'Profil Sekolah', icon: Building2 },
  ];

  const emptyBox = (pesan: string) => (
    <div className="border border-dashed border-slate-300 rounded-xl p-8 text-center space-y-3 bg-slate-50/50">
      <div className="mx-auto w-11 h-11 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
        <Database className="w-5 h-5" />
      </div>
      <p className="text-xs text-slate-500 max-w-md mx-auto">{pesan}</p>
      {isAdmin && (
        <button
          onClick={onOpenSync}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl text-xs shadow-sm transition cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Buka Sinkron Dapodik
        </button>
      )}
    </div>
  );

  const profilRow = (label: string, value?: string) => (
    <div className="flex justify-between gap-4 py-2 border-b border-slate-100 last:border-none">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900 text-right">{value || '-'}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header + sub tabs */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-700" />
          Data Referensi Sekolah
        </h2>
        <p className="text-xs text-slate-500 mb-3">
          Rombongan belajar, PTK, dan profil sekolah hasil sinkronisasi Web Service Dapodik.
        </p>
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => {
            const Icon = t.icon;
            const aktif = subTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSubTab(t.id)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  aktif
                    ? 'bg-indigo-700 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
                {typeof t.count === 'number' && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    aktif ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rombel */}
      {subTab === 'rombel' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-1 print:hidden">
            {sesi && (
              <span className="text-[11px] font-mono font-extrabold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                Sesi TA {sesi}
              </span>
            )}
            <select
              value={filterTahunRombel}
              onChange={(e) => setFilterTahunRombel(e.target.value)}
              className="text-[11px] font-mono font-bold px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Filter rombel per tahun ajaran"
            >
              <option value="sesi">Tahun sesi{sesi ? ` (${sesi})` : ''}</option>
              <option value="all">Semua tahun</option>
              {tahunRombelOptions.map((t) => (
                <option key={t} value={t}>TA {t}</option>
              ))}
            </select>
            <span className="text-[11px] text-slate-400">
              {rombelTampil.length} dari {rombel.length} rombel
            </span>
          </div>
          {rombelTampil.length === 0 ? (
            <div className="p-4">
              {emptyBox('Belum ada data rombongan belajar. Lakukan Sinkron Dapodik (menu khusus Administrator) untuk menarik daftar rombel resmi.')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="p-3">Rombel</th>
                    <th className="p-3 text-center">Tingkat</th>
                    <th className="p-3">Wali Kelas</th>
                    <th className="p-3 text-center">Anggota (Dapodik)</th>
                    <th className="p-3 text-center">Anggota (Lokal)</th>
                    <th className="p-3">Tahun Ajaran</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...rombelTampil].sort((a, b) => a.nama.localeCompare(b.nama)).map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">{r.nama}</td>
                      <td className="p-3 text-center text-slate-700">
                        {r.tingkat ? `Kelas ${r.tingkat}` : '-'}
                      </td>
                      <td className="p-3 text-slate-700">{r.waliKelas || '-'}</td>
                      <td className="p-3 text-center text-slate-500">{r.jumlahAnggota ?? '-'}</td>
                      <td className="p-3 text-center font-bold text-indigo-800">{anggotaAktual(r.nama)}</td>
                      <td className="p-3 text-slate-500 text-[11px]">{r.tahunAjaran || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PTK — modul GTK penuh (selaras hasil sinkronisasi getGtk/getPTK) */}
      {subTab === 'ptk' && (
        <div className="space-y-3">
          {onOpenGtk && (
            <button
              onClick={onOpenGtk}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-800 transition cursor-pointer"
            >
              <span>Buka Modul GTK lengkap (statistik, filter, detail, tambah/ubah)</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          )}
          <GtkView
            ptk={ptk}
            rombel={rombel}
            isAdmin={isAdmin}
            onOpenSync={onOpenSync}
            onDataChanged={onDataChanged || (() => {})}
          />
        </div>
      )}

      {/* Profil Sekolah (read-only) */}
      {subTab === 'sekolah' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-base text-slate-900 uppercase">{sekolah.nama}</h3>
              <p className="text-xs text-slate-500">
                NPSN: <strong className="font-mono">{sekolah.npsn}</strong>
                {sekolah.nss ? <> • NSS: <strong className="font-mono">{sekolah.nss}</strong></> : null}
              </p>
            </div>
            {isAdmin && (
              <button
                onClick={onEditSekolah}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs shadow-sm transition cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                Ubah di Profil Sekolah
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 text-xs">
            <div>
              <h4 className="font-bold text-slate-800 uppercase tracking-wide text-[11px] mb-1">Identitas</h4>
              {profilRow('Bentuk Pendidikan', sekolah.bentukPendidikan)}
              {profilRow('Status', sekolah.statusSekolah)}
              {profilRow('Alamat', sekolah.alamat)}
              {profilRow('Desa/Kelurahan', sekolah.desaKelurahan)}
              {profilRow('Kecamatan', sekolah.kecamatan)}
              {profilRow('Kabupaten/Kota', sekolah.kabupatenKota)}
              {profilRow('Provinsi', sekolah.provinsi)}
              {profilRow('Kode Pos', sekolah.kodePos)}
            </div>
            <div>
              <h4 className="font-bold text-slate-800 uppercase tracking-wide text-[11px] mb-1">Kontak & Pimpinan</h4>
              {profilRow('Telepon', sekolah.telepon)}
              {profilRow('Email', sekolah.email)}
              {profilRow('Website', sekolah.website)}
              {profilRow('Kepala Sekolah', sekolah.kepalaSekolah)}
              {profilRow('NIP Kepala Sekolah', sekolah.nipKepalaSekolah)}
              {profilRow('Petugas Buku Induk', sekolah.petugasBukuInduk)}
              {profilRow('Tahun Ajaran', sekolah.tahunAjaran)}
              {profilRow('Semester Aktif', sekolah.semesterAktif)}
            </div>
          </div>

          {sekolah.lastSyncedWithDapodik && (
            <p className="text-[11px] text-slate-400">
              Terakhir diselaraskan dari Dapodik: {new Date(sekolah.lastSyncedWithDapodik).toLocaleString('id-ID')}
              {sekolah.syncSource ? ` (${sekolah.syncSource})` : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
