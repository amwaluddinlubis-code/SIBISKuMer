import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  UserPlus,
  Eye,
  Edit,
  Trash2,
  Printer,
  FileSpreadsheet,
  RefreshCw,
  Sparkles,
  SearchX,
  DatabaseZap,
  Camera,
  Loader2,
  ArrowLeftRight
} from 'lucide-react';
import { Siswa, SekolahProfile, JenjangSekolah, StatusSiswa } from '../types';
import { getTingkatOptions, getFaseKurikulum, getTingkatDariRombel } from '../utils/raportUtils';
import { siswaTerlibatTahun, tahunSiswa } from '../utils/sesi';
import { PageControl } from './PageControl';
import { toast } from '../utils/notify';
import { unduhExcel } from '../utils/excel';
import { processStudentPhoto, formatKb, MAX_PHOTO_BYTES } from '../utils/photo';

interface SiswaListProps {
  siswa: Siswa[];
  sekolah: SekolahProfile;
  onAddSiswa: () => void;
  onEditSiswa: (siswa: Siswa) => void;
  onViewSiswa: (siswa: Siswa) => void;
  onPrintLembar: (siswa: Siswa) => void;
  onDeleteSiswa: (id: string) => void;
  onUpdateFoto: (siswa: Siswa, fotoUrl: string) => Promise<void> | void;
  onOpenSync: () => void;
  onResetSampleData: () => void;
  onOpenMutasi?: () => void;
  isAdmin?: boolean;
  /** Sesi tahun ajaran login (fondasi sesi; roster lingkup sekolah). */
  sessionTahun?: string | null;
  tahunOptions?: string[];
}

/** Gradien avatar deterministik dari nama — konsisten antar render. */
const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-purple-500 to-violet-600',
  'from-cyan-500 to-sky-600',
];
function avatarGradient(name: string): string {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}
function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function statusBadgeClass(status: StatusSiswa): string {
  switch (status) {
    case 'Aktif': return 'ui-badge-emerald';
    case 'Lulus': return 'ui-badge-blue';
    case 'Mutasi Keluar': return 'ui-badge-amber';
    case 'Mengundurkan Diri':
    case 'Meninggal Dunia': return 'ui-badge-rose';
    default: return 'ui-badge-slate';
  }
}

const STATUS_OPTIONS: StatusSiswa[] = ['Aktif', 'Lulus', 'Mutasi Keluar', 'Mengundurkan Diri', 'Meninggal Dunia'];

export const SiswaList: React.FC<SiswaListProps> = ({
  siswa,
  sekolah,
  onAddSiswa,
  onEditSiswa,
  onViewSiswa,
  onPrintLembar,
  onDeleteSiswa,
  onUpdateFoto,
  onOpenSync,
  onResetSampleData,
  onOpenMutasi,
  isAdmin = false,
  sessionTahun,
  tahunOptions
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRombel, setFilterRombel] = useState<string>('all');
  const [filterTingkat, setFilterTingkat] = useState<string>('all');
  const [filterGender, setFilterGender] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  // Filter keterlibatan tahun ajaran (riwayat/raport). Default 'all' agar roster
  // lingkup sekolah tidak menyembunyikan siswa; sesi ditampilkan eksplisit.
  const [filterTahun, setFilterTahun] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Upload foto langsung dari kolom aksi (crop 4:6, maks 500 KB)
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const [fotoTarget, setFotoTarget] = useState<Siswa | null>(null);
  const [uploadingFotoId, setUploadingFotoId] = useState<string | null>(null);

  const handlePickFoto = (s: Siswa) => {
    if (uploadingFotoId) return;
    setFotoTarget(s);
    // Reset agar file yang sama dapat dipilih ulang
    if (fotoInputRef.current) fotoInputRef.current.value = '';
    // Buka pemilih file setelah state target terpasang
    window.setTimeout(() => fotoInputRef.current?.click(), 0);
  };

  const handleFotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const target = fotoTarget;
    setFotoTarget(null);
    if (!file || !target) return;
    setUploadingFotoId(target.id);
    try {
      const { dataUrl, bytes } = await processStudentPhoto(file);
      await onUpdateFoto(target, dataUrl);
      toast(`Foto ${target.namaLengkap} tersimpan (${formatKb(bytes)} / maks ${formatKb(MAX_PHOTO_BYTES)}, rasio 4:6).`, 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Gagal mengunggah foto.', 'error');
    } finally {
      setUploadingFotoId(null);
    }
  };

  const jenjang: JenjangSekolah = sekolah.jenjang || (sekolah.bentukPendidikan?.toUpperCase().includes('SD') ? 'SD' : 'SMP');
  const tingkatOptions = getTingkatOptions(jenjang);
  const asalLabel = jenjang === 'SD' ? 'TK/PAUD Asal' : 'SD Asal';

  // Dynamic rombel list
  const rombelOptions = useMemo(() => {
    const set = new Set<string>();
    siswa.forEach((s) => {
      if (s.rombelSaatIni) set.add(s.rombelSaatIni);
    });
    return Array.from(set).sort();
  }, [siswa]);

  // Opsi tahun dari data siswa + opsi global (urutan terbaru dulu)
  const tahunFilterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of tahunOptions || []) if (t) set.add(t);
    for (const s of siswa) for (const t of tahunSiswa(s)) set.add(t);
    return [...set].sort().reverse();
  }, [siswa, tahunOptions]);

  // Filtered siswa
  const filtered = useMemo(() => {
    return siswa.filter((s) => {
      // Search text
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchNama = s.namaLengkap.toLowerCase().includes(query);
        const matchNisn = s.nisn?.includes(query);
        const matchNipd = s.nipd?.includes(query);
        const matchNik = s.nik?.includes(query);
        const matchAyah = s.ayah?.nama?.toLowerCase().includes(query);
        const matchIbu = s.ibu?.nama?.toLowerCase().includes(query);
        if (!matchNama && !matchNisn && !matchNipd && !matchNik && !matchAyah && !matchIbu) {
          return false;
        }
      }

      // Rombel
      if (filterRombel !== 'all' && s.rombelSaatIni !== filterRombel) {
        return false;
      }

      // Tingkat
      if (filterTingkat !== 'all') {
        const inRombel = s.rombelSaatIni?.startsWith(filterTingkat);
        const inTingkat = s.diterimaDiTingkat === filterTingkat;
        const inRombelRomawi = getTingkatDariRombel(s.rombelSaatIni) === filterTingkat;
        if (!inRombel && !inTingkat && !inRombelRomawi) return false;
      }

      // Gender
      if (filterGender !== 'all' && s.jenisKelamin !== filterGender) {
        return false;
      }

      // Status
      if (filterStatus !== 'all' && s.statusSiswa !== filterStatus) {
        return false;
      }

      // Keterlibatan tahun ajaran (sesi)
      if (filterTahun !== 'all' && !siswaTerlibatTahun(s, filterTahun)) {
        return false;
      }

      return true;
    });
  }, [siswa, searchTerm, filterRombel, filterTingkat, filterGender, filterStatus, filterTahun]);

  // Pagination — reset ke halaman 1 setiap filter berubah agar tidak kosong
  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterRombel, filterTingkat, filterGender, filterStatus, filterTahun, siswa.length]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  const hasActiveFilter = searchTerm !== '' || filterRombel !== 'all' || filterTingkat !== 'all' || filterGender !== 'all' || filterStatus !== 'all' || filterTahun !== 'all';
  const resetFilters = () => {
    setSearchTerm('');
    setFilterRombel('all');
    setFilterTingkat('all');
    setFilterGender('all');
    setFilterStatus('all');
    setFilterTahun('all');
  };

  const handleExportCSV = () => {
    if (filtered.length === 0) {
      toast('Tidak ada data untuk diekspor. Ubah filter atau tambah siswa dulu.', 'warning');
      return;
    }

    const headers = [
      'No',
      'Nama Lengkap',
      'NISN',
      'NIPD',
      'NIK',
      'Jenis Kelamin',
      'Tempat Lahir',
      'Tanggal Lahir',
      'Agama',
      'Rombel',
      'Alamat',
      'Nama Ayah',
      'Nama Ibu',
      asalLabel,
      'Jalur Masuk',
      'Status Siswa'
    ];

    const rows = filtered.map((s, idx) => [
      idx + 1,
      `"${s.namaLengkap}"`,
      `"${s.nisn}"`,
      `"${s.nipd}"`,
      `"${s.nik}"`,
      s.jenisKelamin,
      `"${s.tempatLahir}"`,
      s.tanggalLahir,
      s.agama,
      `"${s.rombelSaatIni}"`,
      `"${s.alamat}"`,
      `"${s.ayah?.nama || ''}"`,
      `"${s.ibu?.nama || ''}"`,
      `"${s.asalSdMi}"`,
      `"${s.jalurMasuk}"`,
      s.statusSiswa
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Buku_Induk_Siswa_${sekolah.nama || jenjang}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast(`Berhasil mengekspor ${filtered.length} data siswa ke CSV.`, 'success');
  };

  const handleExportExcel = async () => {
    if (filtered.length === 0) {
      toast('Tidak ada data untuk diekspor. Ubah filter atau tambah siswa dulu.', 'warning');
      return;
    }
    try {
      const header = [
        'No', 'Nama Lengkap', 'NISN', 'NIPD', 'NIK', 'Jenis Kelamin',
        'Tempat Lahir', 'Tanggal Lahir', 'Agama', 'Rombel', 'Alamat',
        'Nama Ayah', 'Nama Ibu', asalLabel, 'Jalur Masuk', 'Status Siswa',
      ];
      const baris = filtered.map((s, idx) => [
        idx + 1,
        s.namaLengkap || '',
        s.nisn || '',
        s.nipd || '',
        s.nik || '',
        s.jenisKelamin || '',
        s.tempatLahir || '',
        s.tanggalLahir || '',
        s.agama || '',
        s.rombelSaatIni || '',
        s.alamat || '',
        s.ayah?.nama || '',
        s.ibu?.nama || '',
        s.asalSdMi || '',
        s.jalurMasuk || '',
        s.statusSiswa || '',
      ]);
      await unduhExcel(`Buku_Induk_Siswa_${sekolah.nama || jenjang}_${new Date().toISOString().slice(0, 10)}`, [
        { nama: 'Master Siswa', baris: [header, ...baris] },
      ]);
      toast(`Berhasil mengekspor ${filtered.length} data siswa ke Excel.`, 'success');
    } catch (err: unknown) {
      toast(`Gagal mengekspor Excel: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar aksi */}
      <div className="ui-card p-3.5 flex flex-wrap items-center gap-2">
        <button
          id="btn-tambah-siswa"
          onClick={onAddSiswa}
          className="ui-btn ui-btn-primary"
        >
          <UserPlus className="w-4 h-4" />
          Tambah Siswa Baru
        </button>

        {isAdmin && (
          <button
            onClick={onOpenSync}
            className="ui-btn ui-btn-soft"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Tarik dari Dapodik
          </button>
        )}

        <button
          onClick={handleExportCSV}
          className="ui-btn ui-btn-outline"
          title="Ekspor daftar siswa ke file CSV / Excel"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
          Ekspor CSV
        </button>

        <button
          onClick={() => void handleExportExcel()}
          className="ui-btn ui-btn-outline"
          title="Ekspor daftar siswa ke file Excel (.xlsx)"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-blue-700" />
          Ekspor Excel
        </button>

        {onOpenMutasi && (
          <button
            onClick={onOpenMutasi}
            className="ui-btn ui-btn-outline"
            title="Wizard mutasi masuk / keluar"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-600" />
            Mutasi
          </button>
        )}

        <div className="flex-1" />

        <span className="text-xs text-slate-500">
          Menampilkan <strong className="text-slate-800 tabular-nums">{filtered.length}</strong> dari <strong className="text-slate-800 tabular-nums">{siswa.length}</strong> siswa
        </span>

        {siswa.length === 0 && (
          <button
            onClick={onResetSampleData}
            className="ui-btn ui-btn-gold"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Muat Data Contoh
          </button>
        )}
      </div>

      {/* Filter */}
      <div className="ui-card p-4">
        {sessionTahun && (
          <p className="mb-2.5 text-[11px] text-slate-500">
            Sesi data:{' '}
            <button
              type="button"
              onClick={() => setFilterTahun(filterTahun === sessionTahun ? 'all' : sessionTahun)}
              title="Saring ke kohort sesi ini / tampilkan semua"
              className="font-mono font-extrabold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 hover:bg-amber-100 transition cursor-pointer"
            >
              TA {sessionTahun}{filterTahun === sessionTahun ? ' ✓' : ''}
            </button>
            <span className="ml-1.5">• klik untuk menyaring kohort sesi (riwayat/raport TA tersebut)</span>
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari nama, NISN, NIPD, NIK, atau nama ortu..."
              className="ui-input !pl-9"
              aria-label="Cari siswa"
            />
          </div>

          <select
            value={filterTingkat}
            onChange={(e) => setFilterTingkat(e.target.value)}
            className="ui-select"
            aria-label="Filter tingkat"
          >
            <option value="all">Semua Tingkat ({jenjang === 'SD' ? 'Fase A–C' : 'Fase D'})</option>
            {tingkatOptions.map((t) => (
              <option key={t} value={t}>Kelas {t} ({getFaseKurikulum(t)})</option>
            ))}
          </select>

          <select
            value={filterRombel}
            onChange={(e) => setFilterRombel(e.target.value)}
            className="ui-select"
            aria-label="Filter rombel"
          >
            <option value="all">Semua Rombel</option>
            {rombelOptions.map((r) => (
              <option key={r} value={r}>Rombel {r}</option>
            ))}
          </select>

          <select
            value={filterGender}
            onChange={(e) => setFilterGender(e.target.value)}
            className="ui-select"
            aria-label="Filter jenis kelamin"
          >
            <option value="all">L / P</option>
            <option value="L">Laki-laki</option>
            <option value="P">Perempuan</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="ui-select"
            aria-label="Filter status siswa"
          >
            <option value="all">Semua Status</option>
            {STATUS_OPTIONS.map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>

          <select
            value={filterTahun}
            onChange={(e) => setFilterTahun(e.target.value)}
            className="ui-select font-mono"
            aria-label="Filter tahun ajaran (keterlibatan)"
            title="Saring siswa yang terlibat pada tahun ajaran tertentu"
          >
            <option value="all">Semua TA</option>
            {tahunFilterOptions.map((t) => (
              <option key={t} value={t}>TA {t}{sessionTahun === t ? ' (sesi)' : ''}</option>
            ))}
          </select>
        </div>

        {hasActiveFilter && (
          <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
            <span className="text-xs text-slate-500">
              Filter aktif — <strong className="text-slate-700">{filtered.length}</strong> hasil
            </span>
            <button
              onClick={resetFilters}
              className="text-xs font-bold text-blue-700 hover:text-blue-900 hover:underline transition"
            >
              Reset Filter
            </button>
          </div>
        )}
      </div>

      {/* Tabel */}
      <div className="ui-card overflow-hidden">
        {siswa.length === 0 ? (
          <div className="p-12 text-center space-y-3 anim-fade-up">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-navy-900 text-gold-300 flex items-center justify-center mx-auto shadow-lg">
              <DatabaseZap className="w-6 h-6" />
            </div>
            <h3 className="font-extrabold text-sm text-slate-800">Belum ada data siswa</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              Database kosong. Tambahkan siswa baru, tarik dari Dapodik lokal, atau muat data contoh Kurikulum Merdeka untuk mulai.
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button onClick={onAddSiswa} className="ui-btn ui-btn-primary">
                <UserPlus className="w-3.5 h-3.5" />
                Tambah Siswa
              </button>
              <button onClick={onResetSampleData} className="ui-btn ui-btn-outline">
                <Sparkles className="w-3.5 h-3.5" />
                Data Contoh
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center space-y-3 anim-fade-up">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <SearchX className="w-6 h-6" />
            </div>
            <h3 className="font-extrabold text-sm text-slate-800">Tidak ada yang cocok</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              Coba kata kunci lain atau longgarkan filter yang diterapkan.
            </p>
            <button onClick={resetFilters} className="ui-btn ui-btn-outline mx-auto">
              Reset Filter
            </button>
          </div>
        ) : (
          <>
          <div className="ui-table-wrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th className="w-12 text-center">No</th>
                  <th>Siswa</th>
                  <th>NISN / NIPD</th>
                  <th className="text-center">L/P</th>
                  <th>Rombel</th>
                  <th>Tempat, Tgl Lahir</th>
                  <th>Status</th>
                  <th className="text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((s, index) => (
                  <tr key={s.id}>
                    <td className="text-center text-slate-400 font-mono text-[11px] tabular-nums">
                      {(safePage - 1) * pageSize + index + 1}
                    </td>

                    <td>
                      <div className="flex items-center gap-3">
                        {s.fotoUrl ? (
                          <img src={s.fotoUrl} alt={s.namaLengkap} className="w-10 h-15 rounded-lg object-cover border border-slate-200 shrink-0 aspect-[4/6]" />
                        ) : (
                          <span className={`ui-avatar w-10 h-10 text-xs bg-gradient-to-br ${avatarGradient(s.namaLengkap)}`}>
                            {initials(s.namaLengkap)}
                          </span>
                        )}
                        <div className="min-w-0">
                          <span
                            onClick={() => onViewSiswa(s)}
                            className="font-bold text-slate-900 hover:text-blue-700 cursor-pointer block text-xs truncate"
                          >
                            {s.namaLengkap}
                          </span>
                          <span className="text-[11px] text-slate-500 truncate block">
                            {s.ayah?.nama || s.ibu?.nama || '-'}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className="font-mono font-bold text-navy-900 text-xs tabular-nums">
                        {s.nisn || '-'}
                      </div>
                      <div className="font-mono text-[10px] text-slate-500 tabular-nums">
                        {s.nipd ? `NIPD ${s.nipd}` : 'NIPD -'}
                      </div>
                    </td>

                    <td className="text-center">
                      <span className={`ui-badge ${s.jenisKelamin === 'L' ? 'ui-badge-blue' : 'ui-badge-rose'}`}>
                        {s.jenisKelamin}
                      </span>
                    </td>

                    <td>
                      <span className="ui-badge ui-badge-indigo">
                        {s.rombelSaatIni || '-'}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-1">
                        {s.jalurMasuk}
                      </span>
                    </td>

                    <td className="text-slate-700 text-[11px]">
                      <div className="font-semibold">{s.tempatLahir || '-'}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{s.tanggalLahir}</div>
                    </td>

                    <td>
                      <span className={`ui-badge ${statusBadgeClass(s.statusSiswa)}`}>
                        {s.statusSiswa}
                      </span>
                    </td>

                    <td>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => onViewSiswa(s)}
                          title="Lihat Rincian Buku Induk"
                          className="ui-btn ui-btn-ghost ui-btn-icon !text-slate-500 hover:!text-blue-700"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handlePickFoto(s)}
                          disabled={uploadingFotoId === s.id}
                          title={s.fotoUrl ? 'Ganti foto siswa (rasio 4:6, maks 500 KB)' : 'Upload foto siswa (rasio 4:6, maks 500 KB)'}
                          aria-label={`Upload foto ${s.namaLengkap}`}
                          className="ui-btn ui-btn-ghost ui-btn-icon !text-slate-500 hover:!text-emerald-700 hover:!bg-emerald-50 disabled:opacity-50"
                        >
                          {uploadingFotoId === s.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Camera className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => onPrintLembar(s)}
                          title="Cetak Lembar Buku Induk Resmi"
                          className="ui-btn ui-btn-ghost ui-btn-icon !text-blue-700 hover:!bg-blue-50"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onEditSiswa(s)}
                          title="Edit Data Siswa"
                          className="ui-btn ui-btn-ghost ui-btn-icon !text-slate-500 hover:!text-amber-700 hover:!bg-amber-50"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteSiswa(s.id)}
                          title="Hapus dari Buku Induk"
                          className="ui-btn ui-btn-ghost ui-btn-icon !text-slate-400 hover:!text-rose-600 hover:!bg-rose-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination footer */}
          <PageControl
            page={safePage}
            totalPages={totalPages}
            totalItems={filtered.length}
            pageSize={pageSize}
            itemName="siswa"
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
          />
          </>
        )}
      </div>
      {/* Pemilih file tersembunyi untuk upload foto kolom aksi */}
      <input
        ref={fotoInputRef}
        type="file"
        accept="image/*"
        aria-label="Pilih foto siswa (rasio 4:6, maks 500 KB)"
        className="hidden"
        onChange={handleFotoFileChange}
      />
    </div>
  );
};
