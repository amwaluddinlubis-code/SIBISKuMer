import React, { useState, useMemo, useEffect } from 'react';
import { Download, Printer, Search } from 'lucide-react';
import { Siswa, SekolahProfile, AppUser, TingkatKelas } from '../types';
import { filterSiswaByAccess, getTingkatAktifSiswa } from '../utils/db';
import {
  getRaportList,
  getNilaiList,
  getDefaultMataPelajaran,
  getTingkatOptions,
  calculatePredikat,
  singkatanMapel,
} from '../utils/raportUtils';
import { PageControl } from './PageControl';
import { labelSesi, opsiTahunMaksSesi } from '../utils/sesi';
import { toast } from '../utils/notify';
import { unduhExcel } from '../utils/excel';

interface LegerNilaiViewProps {
  siswaList: Siswa[];
  sekolah: SekolahProfile;
  currentUser?: AppUser | null;
  sessionTahun?: string | null;
  tahunOptions?: string[];
}

interface BarisLeger {
  siswa: Siswa;
  nilai: Map<string, number>;
  rataRata: number | null;
  peringkat: number | null;
}

function namaMapel(n: { mataPelajaran: string; namaMapel?: string }): string {
  return (n.namaMapel || n.mataPelajaran || '').trim();
}

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Leger nilai gabungan: matriks siswa × mapel per tahun+semester+rombel + rata-rata + peringkat. */
export const LegerNilaiView: React.FC<LegerNilaiViewProps> = ({
  siswaList,
  sekolah,
  currentUser,
  sessionTahun,
  tahunOptions,
}) => {
  const jenjang = sekolah.jenjang || 'SMP';
  const taDefault = (sessionTahun || sekolah.tahunAjaran || '').trim();
  const [tahun, setTahun] = useState(taDefault);
  const [semester, setSemester] = useState<'1' | '2'>(sekolah.semesterAktif?.startsWith('2') ? '2' : '1');
  const [tingkat, setTingkat] = useState<string>('semua');
  const [rombel, setRombel] = useState<string>('semua');
  // Fase 2 §7: pencarian, pagination, dan opsi tampilkan semua siswa aktif
  // (bawaan: hanya siswa yang memiliki raport pada periode terpilih).
  const [cari, setCari] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [tampilSemua, setTampilSemua] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [cari, tahun, semester, tingkat, rombel, tampilSemua]);

  // Cutoff sesi: opsi & pilihan tahun di atas sesi disembunyikan/dikembalikan.
  const daftarTahun = useMemo(() => {
    const set = new Set<string>([...(tahunOptions || [])]);
    for (const s of siswaList || []) {
      for (const r of getRaportList(s)) {
        if (r.tahunAjaran) set.add(r.tahunAjaran);
      }
    }
    if (taDefault) set.add(taDefault);
    return opsiTahunMaksSesi([...set].sort().reverse(), taDefault);
  }, [siswaList, tahunOptions, taDefault]);

  useEffect(() => {
    if (taDefault) {
      if (!daftarTahun.includes(tahun)) setTahun(daftarTahun[0] || taDefault);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taDefault, daftarTahun.join('|')]);

  const opsiTingkat = useMemo(() => getTingkatOptions(jenjang), [jenjang]);

  const opsiRombel = useMemo(() => {
    const set = new Set<string>();
    for (const s of filterSiswaByAccess(siswaList || [], currentUser)) {
      if (s.rombelSaatIni) set.add(s.rombelSaatIni);
    }
    return [...set].sort();
  }, [siswaList, currentUser]);

  const { kolomMapel, baris }: { kolomMapel: string[]; baris: BarisLeger[] } = useMemo(() => {
    const dalamAkses = filterSiswaByAccess(siswaList || [], currentUser).filter(
      (s) => s.statusSiswa === 'Aktif'
    );
    const cocok = dalamAkses.filter((s) => {
      const rap = getRaportList(s).find((r) => r.tahunAjaran === tahun && r.semester === semester);
      if (!rap && !tampilSemua) return false;
      if (tingkat !== 'semua') {
        const t = rap ? (rap.tingkat || '').toString() : getTingkatAktifSiswa(s).toString();
        if (t !== tingkat) return false;
      }
      if (rombel !== 'semua' && (rap?.rombel || s.rombelSaatIni) !== rombel) return false;
      return true;
    });

    // Kolom: template mapel tingkat (bila tingkat dipilih) gabung mapel aktual.
    const template = tingkat === 'semua'
      ? [...new Set(opsiTingkat.flatMap((t) => getDefaultMataPelajaran(jenjang, t as TingkatKelas).map((m) => m.nama)))]
      : getDefaultMataPelajaran(jenjang, tingkat as TingkatKelas).map((m) => m.nama);
    const aktual = new Set<string>();
    const petaNilai = new Map<string, Map<string, number>>();
    for (const s of cocok) {
      const rap = getRaportList(s).find((r) => r.tahunAjaran === tahun && r.semester === semester);
      const m = new Map<string, number>();
      for (const n of getNilaiList(rap)) {
        const nama = namaMapel(n);
        if (!nama) continue;
        aktual.add(nama);
        const v = Number(n.nilaiAkhir);
        if (Number.isFinite(v)) m.set(nama, v);
      }
      petaNilai.set(s.id, m);
    }
    const kolom = [...new Set([...template, ...aktual])];

    const rows: BarisLeger[] = cocok.map((s) => {
      const m = petaNilai.get(s.id) || new Map<string, number>();
      const vals = kolom.map((k) => m.get(k)).filter((v): v is number => typeof v === 'number');
      const rataRata = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      return { siswa: s, nilai: m, rataRata, peringkat: null };
    });

    // Peringkat kompetisi (1,2,2,4…) berdasar rata-rata.
    const berNilai = rows.filter((r) => r.rataRata !== null).sort((a, b) => (b.rataRata as number) - (a.rataRata as number));
    let rank = 0;
    let prev: number | null = null;
    berNilai.forEach((r, i) => {
      if (prev === null || (r.rataRata as number) < prev) {
        rank = i + 1;
        prev = r.rataRata;
      }
      r.peringkat = rank;
    });
    rows.sort((a, b) => (a.peringkat ?? 9999) - (b.peringkat ?? 9999) || a.siswa.namaLengkap.localeCompare(b.siswa.namaLengkap));
    return { kolomMapel: kolom, baris: rows };
  }, [siswaList, currentUser, tahun, semester, tingkat, rombel, jenjang, opsiTingkat, tampilSemua]);

  // Baris tampilan: pencarian menyaring tampilan (peringkat tetap global),
  // ekspor selalu memakai seluruh `baris` pada periode terpilih.
  const barisTampil = useMemo(() => {
    const k = cari.trim().toLowerCase();
    if (!k) return baris;
    return baris.filter(
      (r) =>
        r.siswa.namaLengkap.toLowerCase().includes(k) ||
        (r.siswa.nisn || '').toLowerCase().includes(k)
    );
  }, [baris, cari]);
  const totalPages = Math.max(1, Math.ceil(barisTampil.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const barisHalaman = barisTampil.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleExportCsv = () => {
    if (baris.length === 0) {
      toast('Tidak ada data leger untuk diekspor.', 'warning');
      return;
    }
    const head = ['No', 'Nama', 'NISN', 'Rombel', ...kolomMapel, 'Rata-rata', 'Predikat', 'Peringkat'];
    const lines = [head.map(csvEscape).join(',')];
    baris.forEach((r, i) => {
      const cells: unknown[] = [
        i + 1,
        r.siswa.namaLengkap,
        r.siswa.nisn || '',
        r.siswa.rombelSaatIni || '',
        ...kolomMapel.map((k) => {
          const v = r.nilai.get(k);
          return typeof v === 'number' ? v : '';
        }),
        r.rataRata !== null ? r.rataRata.toFixed(1) : '',
        r.rataRata !== null ? calculatePredikat(r.rataRata) : '',
        r.peringkat ?? '',
      ];
      lines.push(cells.map(csvEscape).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Leger_${tahun.replace('/', '-')}_S${semester}_${rombel === 'semua' ? 'Semua' : rombel}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Leger ${baris.length} siswa diekspor ke CSV.`, 'success');
  };

  const handleExportExcel = async () => {
    if (baris.length === 0) {
      toast('Tidak ada data leger untuk diekspor.', 'warning');
      return;
    }
    try {
      const head = ['No', 'Nama', 'NISN', 'Rombel', ...kolomMapel, 'Rata-rata', 'Predikat', 'Peringkat'];
      const rows = baris.map((r, i) => [
        i + 1,
        r.siswa.namaLengkap || '',
        r.siswa.nisn || '',
        r.siswa.rombelSaatIni || '',
        ...kolomMapel.map((k) => {
          const v = r.nilai.get(k);
          return typeof v === 'number' ? v : '';
        }),
        r.rataRata !== null ? Number(r.rataRata.toFixed(1)) : '',
        r.rataRata !== null ? calculatePredikat(r.rataRata) : '',
        r.peringkat ?? '',
      ]);
      await unduhExcel(`Leger_${tahun.replace('/', '-')}_S${semester}_${rombel === 'semua' ? 'Semua' : rombel}`, [
        { nama: `Leger ${tahun} S${semester}`, baris: [head, ...rows] },
      ]);
      toast(`Leger ${baris.length} siswa diekspor ke Excel.`, 'success');
    } catch (err: unknown) {
      toast(`Gagal mengekspor Excel: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  return (
    <div className="space-y-4">
      {/* Aksi: header halaman dirender App via TAB_META (jangan ganda). */}
      <div className="ui-card p-3 flex flex-wrap gap-2 items-center print:hidden">
        <button onClick={handleExportCsv} className="ui-btn ui-btn-outline" title="Ekspor CSV">
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Ekspor CSV</span>
        </button>
        <button onClick={() => void handleExportExcel()} className="ui-btn ui-btn-outline" title="Ekspor Excel (.xlsx)">
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Ekspor Excel</span>
        </button>
        <button onClick={() => window.print()} className="ui-btn ui-btn-outline" title="Cetak leger">
          <Printer className="w-4 h-4" />
          <span className="hidden sm:inline">Cetak</span>
        </button>
      </div>

      <div className="ui-card p-4 flex flex-wrap gap-2 items-end print:hidden">
        <div className="w-full">
          <span className="font-mono font-extrabold text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
            {labelSesi(sessionTahun, sekolah.tahunAjaran)}
          </span>
        </div>
        <div>
          <label className="ui-label">Tahun Ajaran</label>
          <select value={tahun} onChange={(e) => setTahun(e.target.value)} className="ui-select !w-auto" aria-label="Tahun ajaran">
            {daftarTahun.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="ui-label">Semester</label>
          <select value={semester} onChange={(e) => setSemester(e.target.value as '1' | '2')} className="ui-select !w-auto" aria-label="Semester">
            <option value="1">1 (Ganjil)</option>
            <option value="2">2 (Genap)</option>
          </select>
        </div>
        <div>
          <label className="ui-label">Tingkat</label>
          <select value={tingkat} onChange={(e) => setTingkat(e.target.value)} className="ui-select !w-auto" aria-label="Tingkat">
            <option value="semua">Semua</option>
            {opsiTingkat.map((t) => <option key={t} value={t}>Kelas {t}</option>)}
          </select>
        </div>
        <div>
          <label className="ui-label">Rombel</label>
          <select value={rombel} onChange={(e) => setRombel(e.target.value)} className="ui-select !w-auto" aria-label="Rombel">
            <option value="semua">Semua</option>
            {opsiRombel.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <span className="text-xs text-slate-500 pb-2">
          <strong className="text-slate-800 tabular-nums">{baris.length}</strong> siswa • <strong className="text-slate-800 tabular-nums">{kolomMapel.length}</strong> mapel
        </span>
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari nama / NISN…"
            className="ui-input !pl-9"
            aria-label="Cari siswa di leger"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600 pb-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={tampilSemua}
            onChange={(e) => setTampilSemua(e.target.checked)}
            className="w-4 h-4 accent-blue-700"
          />
          Tampilkan semua siswa aktif
        </label>
      </div>

      {!tampilSemua && (
        <p className="text-[11px] text-slate-500 print:hidden">
          Hanya siswa yang <strong>memiliki raport</strong> pada tahun &amp; semester ini yang ditampilkan.
          Siswa aktif tanpa raport disembunyikan — aktifkan &quot;Tampilkan semua siswa aktif&quot; untuk melihat mereka (baris kosong tanpa peringkat).
        </p>
      )}

      <div className="ui-card overflow-hidden">
        <div className="print-sheet overflow-x-auto">
          <div className="hidden print:block px-4 pt-4 text-center">
            <h2 className="font-extrabold text-base">LEGER NILAI PESERTA DIDIK</h2>
            <p className="text-xs">Tahun {tahun} • Semester {semester} • {tingkat === 'semua' ? 'Semua Tingkat' : `Kelas ${tingkat}`} • {rombel === 'semua' ? 'Semua Rombel' : `Rombel ${rombel}`}</p>
          </div>
          <table className="ui-table">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-slate-50 w-10">No</th>
                <th className="sticky left-10 z-20 bg-slate-50 min-w-[170px]">Nama</th>
                {kolomMapel.map((m) => (
                  <th key={m} className="whitespace-nowrap" title={m}>
                    <span className="print:hidden">{singkatanMapel(m)}</span>
                    <span className="hidden print:inline">{m}</span>
                  </th>
                ))}
                <th>Rata-rata</th>
                <th>Peringkat</th>
              </tr>
            </thead>
            <tbody>
              {barisTampil.length === 0 ? (
                <tr><td colSpan={4 + kolomMapel.length} className="text-center py-8 text-slate-500">Tidak ada siswa pada filter ini{tampilSemua ? '' : ` — raport ${tahun} semester ${semester} belum ada`}.</td></tr>
              ) : (
                barisHalaman.map((r, i) => (
                  <tr key={r.siswa.id}>
                    <td className="tabular-nums sticky left-0 z-10 bg-white w-10">{(safePage - 1) * pageSize + i + 1}</td>
                    <td className="whitespace-nowrap font-semibold sticky left-10 z-10 bg-white min-w-[170px]">
                      {r.siswa.namaLengkap}
                      <span className="block text-[10px] font-normal text-slate-500 font-mono">{r.siswa.nisn || '-'} • {r.siswa.rombelSaatIni}</span>
                    </td>
                    {kolomMapel.map((m) => {
                      const v = r.nilai.get(m);
                      return (
                        <td key={m} className={`text-center tabular-nums ${typeof v === 'number' && v < 70 ? 'text-rose-700 font-bold' : ''}`}>
                          {typeof v === 'number' ? v : <span className="text-slate-300">-</span>}
                        </td>
                      );
                    })}
                    <td className="text-center tabular-nums font-bold">
                      {r.rataRata !== null ? r.rataRata.toFixed(1) : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="text-center tabular-nums">{r.peringkat ?? <span className="text-slate-300">-</span>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="print:hidden">
          <PageControl
            page={safePage}
            totalPages={totalPages}
            totalItems={barisTampil.length}
            pageSize={pageSize}
            itemName="siswa"
            onPageChange={setPage}
            onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
          />
        </div>
      </div>
    </div>
  );
};
