import React, { useState, useMemo } from 'react';
import { 
  Search, 
  UserPlus, 
  Filter, 
  Download, 
  Eye, 
  Edit, 
  Trash2, 
  Printer, 
  FileSpreadsheet, 
  RefreshCw, 
  RotateCcw,
  Sparkles,
  Users
} from 'lucide-react';
import { Siswa, SekolahProfile } from '../types';

interface SiswaListProps {
  siswa: Siswa[];
  sekolah: SekolahProfile;
  onAddSiswa: () => void;
  onEditSiswa: (siswa: Siswa) => void;
  onViewSiswa: (siswa: Siswa) => void;
  onPrintLembar: (siswa: Siswa) => void;
  onDeleteSiswa: (id: string) => void;
  onOpenSync: () => void;
  onResetSampleData: () => void;
}

export const SiswaList: React.FC<SiswaListProps> = ({
  siswa,
  sekolah,
  onAddSiswa,
  onEditSiswa,
  onViewSiswa,
  onPrintLembar,
  onDeleteSiswa,
  onOpenSync,
  onResetSampleData
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRombel, setFilterRombel] = useState<string>('all');
  const [filterTingkat, setFilterTingkat] = useState<string>('all');
  const [filterGender, setFilterGender] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Dynamic rombel list
  const rombelOptions = useMemo(() => {
    const set = new Set<string>();
    siswa.forEach((s) => {
      if (s.rombelSaatIni) set.add(s.rombelSaatIni);
    });
    return Array.from(set).sort();
  }, [siswa]);

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
        const startsWithTingkat = s.rombelSaatIni?.startsWith(filterTingkat);
        if (!startsWithTingkat) return false;
      }

      // Gender
      if (filterGender !== 'all' && s.jenisKelamin !== filterGender) {
        return false;
      }

      // Status
      if (filterStatus !== 'all' && s.statusSiswa !== filterStatus) {
        return false;
      }

      return true;
    });
  }, [siswa, searchTerm, filterRombel, filterTingkat, filterGender, filterStatus]);

  const handleExportCSV = () => {
    if (filtered.length === 0) {
      alert('Tidak ada data untuk diekspor!');
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
      'SD Asal',
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
    link.setAttribute('download', `Buku_Induk_Siswa_${sekolah.nama || 'SMP'}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Top Action Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            id="btn-tambah-siswa"
            onClick={onAddSiswa}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl text-xs shadow-sm transition active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            Tambah Siswa Baru
          </button>

          <button
            onClick={onOpenSync}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 font-semibold rounded-xl text-xs transition"
          >
            <RefreshCw className="w-3.5 h-3.5 text-indigo-700" />
            Tarik dari Dapodik Lokal
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold rounded-xl text-xs transition"
            title="Ekspor daftar siswa ke file CSV / Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            Ekspor Excel/CSV
          </button>
        </div>

        {siswa.length === 0 && (
          <button
            onClick={onResetSampleData}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-semibold rounded-xl text-xs transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-700" />
            Muat Data Contoh Kurikulum Merdeka
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* Search Box */}
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari nama, NISN, NIPD, NIK, atau nama ortu..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
          </div>

          {/* Tingkat Filter */}
          <div>
            <select
              value={filterTingkat}
              onChange={(e) => setFilterTingkat(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none"
            >
              <option value="all">Semua Tingkat (Fase D)</option>
              <option value="7">Kelas 7 (Fase D Awal)</option>
              <option value="8">Kelas 8 (Fase D Lanjutan)</option>
              <option value="9">Kelas 9 (Fase D Akhir)</option>
            </select>
          </div>

          {/* Rombel Filter */}
          <div>
            <select
              value={filterRombel}
              onChange={(e) => setFilterRombel(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none"
            >
              <option value="all">Semua Rombel</option>
              {rombelOptions.map((r) => (
                <option key={r} value={r}>Rombel {r}</option>
              ))}
            </select>
          </div>

          {/* Gender Filter */}
          <div>
            <select
              value={filterGender}
              onChange={(e) => setFilterGender(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none"
            >
              <option value="all">Semua Gender</option>
              <option value="L">Laki-laki (L)</option>
              <option value="P">Perempuan (P)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
          <span>
            Menampilkan <strong>{filtered.length}</strong> dari <strong>{siswa.length}</strong> siswa terdaftar
          </span>
          {(searchTerm || filterRombel !== 'all' || filterTingkat !== 'all' || filterGender !== 'all' || filterStatus !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterRombel('all');
                setFilterTingkat('all');
                setFilterGender('all');
                setFilterStatus('all');
              }}
              className="text-blue-700 hover:underline font-semibold"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      {/* Main Students Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-sm text-slate-700">Tidak ada data siswa yang cocok</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Periksa kembali kata kunci pencarian atau filter yang diterapkan, atau tambahkan siswa baru.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3 w-10 text-center">No</th>
                  <th className="p-3">Identitas Siswa</th>
                  <th className="p-3">NISN / NIPD</th>
                  <th className="p-3 text-center">L/P</th>
                  <th className="p-3">Rombel</th>
                  <th className="p-3">Tempat, Tanggal Lahir</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-center">Aksi Lembar Induk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((s, index) => (
                  <tr key={s.id} className="hover:bg-slate-50/80 transition group">
                    <td className="p-3 text-center text-slate-400 font-mono text-[11px]">
                      {index + 1}
                    </td>

                    {/* Siswa & Foto */}
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-11 rounded bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                          {s.fotoUrl ? (
                            <img src={s.fotoUrl} alt={s.namaLengkap} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400">
                              {s.jenisKelamin}
                            </span>
                          )}
                        </div>
                        <div>
                          <span
                            onClick={() => onViewSiswa(s)}
                            className="font-bold text-slate-900 hover:text-blue-700 cursor-pointer block text-xs"
                          >
                            {s.namaLengkap}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            Anak dari: {s.ayah?.nama || s.ibu?.nama || '-'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* NISN / NIPD */}
                    <td className="p-3">
                      <div className="font-mono text-slate-800 text-xs">
                        <span className="font-bold text-blue-900">{s.nisn || '-'}</span>
                      </div>
                      <div className="font-mono text-[10px] text-slate-500">
                        NIPD: {s.nipd || '-'}
                      </div>
                    </td>

                    {/* L/P */}
                    <td className="p-3 text-center">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        s.jenisKelamin === 'L' ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {s.jenisKelamin}
                      </span>
                    </td>

                    {/* Rombel */}
                    <td className="p-3">
                      <span className="font-bold text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded text-[11px] border border-indigo-200">
                        {s.rombelSaatIni}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Jalur: {s.jalurMasuk}
                      </span>
                    </td>

                    {/* TTL */}
                    <td className="p-3 text-slate-700 text-[11px]">
                      <div>{s.tempatLahir}</div>
                      <div className="text-[10px] text-slate-500">{s.tanggalLahir}</div>
                    </td>

                    {/* Status */}
                    <td className="p-3">
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {s.statusSiswa}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => onViewSiswa(s)}
                          title="Lihat Rincian Buku Induk"
                          className="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onPrintLembar(s)}
                          title="Cetak Lembar Buku Induk Resmi"
                          className="p-1.5 text-blue-700 hover:bg-blue-100 rounded-lg transition"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onEditSiswa(s)}
                          title="Edit Data Siswa"
                          className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteSiswa(s.id)}
                          title="Hapus dari Buku Induk"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
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
        )}
      </div>
    </div>
  );
};
