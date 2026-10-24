import React, { useMemo, useState } from 'react';
import { Search, ShieldCheck, Upload, RefreshCw, Eye, PencilLine, CheckCircle2, CircleSlash, X } from 'lucide-react';
import type { Siswa } from '../types';
import {
  ATURAN_PEMERIKSA,
  bandingkanDenganImpor,
  parseCsvImpor,
  periksaDataSiswa,
  ringkasanTemuan,
  statusEfektifTemuan,
  tandaiTemuan,
  type KonfigurasiAturan,
  type PetaStatusTemuan,
  type PrioritasTemuan,
  type KategoriTemuan,
  type StatusTemuan,
  type TemuanImpor,
  type TemuanPemeriksa,
} from '../utils/pemeriksaData';
import { toast } from '../utils/notify';

interface PemeriksaDataViewProps {
  /** Daftar siswa yang SUDAH terfilter hak akses (visibleSiswa). */
  siswa: Siswa[];
  /** NPSN sekolah aktif — scope kunci localStorage status/konfigurasi. */
  sekolahNpsn: string;
  onEditSiswa: (siswa: Siswa) => void;
  onViewSiswa?: (siswa: Siswa) => void;
}

const PRIORITAS_LABEL: Record<PrioritasTemuan, string> = { tinggi: 'Tinggi', sedang: 'Sedang', rendah: 'Rendah' };
const PRIORITAS_BADGE: Record<PrioritasTemuan, string> = {
  tinggi: 'ui-badge-rose',
  sedang: 'ui-badge-amber',
  rendah: 'ui-badge-slate',
};
const KATEGORI_LABEL: Record<KategoriTemuan, string> = {
  wajib: 'Field wajib',
  format: 'Format',
  rentang: 'Rentang nilai',
  konflik: 'Konflik antarkolom',
  duplikat: 'Duplikat',
  impor: 'Impor',
};
const STATUS_LABEL: Record<StatusTemuan, string> = {
  'belum-diperiksa': 'Belum diperiksa',
  diperbaiki: 'Diperbaiki',
  diabaikan: 'Diabaikan',
};

function bacaJsonLocal<T>(kunci: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(kunci);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function tulisJsonLocal(kunci: string, nilai: unknown): void {
  try {
    localStorage.setItem(kunci, JSON.stringify(nilai));
  } catch {
    /* abaikan — status hanya kenyamanan lokal */
  }
}

export const PemeriksaDataView: React.FC<PemeriksaDataViewProps> = ({ siswa, sekolahNpsn, onEditSiswa, onViewSiswa }) => {
  const scope = (sekolahNpsn || 'default').trim() || 'default';
  const kunciStatus = `bukuinduk_pemeriksa_status_${scope}`;
  const kunciKonfig = `bukuinduk_pemeriksa_konfig_${scope}`;

  const [petaStatus, setPetaStatus] = useState<PetaStatusTemuan>(() => bacaJsonLocal(kunciStatus, {}));
  const [konfig, setKonfig] = useState<KonfigurasiAturan>(() => bacaJsonLocal(kunciKonfig, {}));
  const [fPrioritas, setFPrioritas] = useState<'semua' | PrioritasTemuan>('semua');
  const [fKategori, setFKategori] = useState<'semua' | KategoriTemuan>('semua');
  const [fStatus, setFStatus] = useState<'semua' | StatusTemuan>('semua');
  const [cari, setCari] = useState('');
  const [tampilAturan, setTampilAturan] = useState(false);
  const [alasanAbaikanId, setAlasanAbaikanId] = useState<string | null>(null);
  const [alasanAbaikan, setAlasanAbaikan] = useState('');
  const [hasilImpor, setHasilImpor] = useState<TemuanImpor[] | null>(null);
  const [namaFileImpor, setNamaFileImpor] = useState('');
  const [fImpor, setFImpor] = useState<'semua' | TemuanImpor['status']>('semua');

  const siswaById = useMemo(() => new Map((siswa || []).map((s) => [s.id, s])), [siswa]);

  const temuan = useMemo(() => periksaDataSiswa(siswa || [], konfig), [siswa, konfig]);
  const ringkasan = useMemo(() => ringkasanTemuan(temuan, petaStatus), [temuan, petaStatus]);

  const temuanTampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return temuan.filter((t) => {
      if (fPrioritas !== 'semua' && t.prioritas !== fPrioritas) return false;
      if (fKategori !== 'semua' && t.kategori !== fKategori) return false;
      if (fStatus !== 'semua' && statusEfektifTemuan(t, petaStatus) !== fStatus) return false;
      if (q) {
        const s1 = siswaById.get(t.siswaId);
        const s2 = t.siswaIdLain ? siswaById.get(t.siswaIdLain) : undefined;
        const hay = `${s1?.namaLengkap || ''} ${s1?.nisn || ''} ${s2?.namaLengkap || ''} ${s2?.nisn || ''} ${t.judul}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [temuan, fPrioritas, fKategori, fStatus, cari, petaStatus, siswaById]);

  const simpanStatus = (baru: PetaStatusTemuan) => {
    setPetaStatus(baru);
    tulisJsonLocal(kunciStatus, baru);
  };

  const handleTandai = (t: TemuanPemeriksa, status: StatusTemuan) => {
    try {
      if (status === 'diabaikan') {
        setAlasanAbaikanId(t.id);
        setAlasanAbaikan('');
        return;
      }
      simpanStatus(tandaiTemuan(petaStatus, t.id, status));
      toast('Temuan ditandai diperbaiki.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleKonfirmasiAbaikan = (t: TemuanPemeriksa) => {
    try {
      simpanStatus(tandaiTemuan(petaStatus, t.id, 'diabaikan', alasanAbaikan));
      setAlasanAbaikanId(null);
      setAlasanAbaikan('');
      toast('Temuan diabaikan dengan alasan.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleToggleAturan = (aturanId: string) => {
    const baru = { ...konfig, [aturanId]: !(konfig[aturanId] ?? ATURAN_PEMERIKSA.find((a) => a.id === aturanId)?.aktif ?? true) };
    setKonfig(baru);
    tulisJsonLocal(kunciKonfig, baru);
  };

  const handleFileImpor = async (file: File | undefined) => {
    if (!file) return;
    try {
      const teks = await file.text();
      const baris = parseCsvImpor(teks);
      setHasilImpor(bandingkanDenganImpor(baris, siswa || []));
      setNamaFileImpor(file.name);
      setFImpor('semua');
      toast(`Pratinjau impor: ${baris.length} baris dibaca dari ${file.name}. Data TIDAK diubah.`, 'info');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const imporTampil = (hasilImpor || []).filter((h) => fImpor === 'semua' || h.status === fImpor);
  const hitungImpor = (st: TemuanImpor['status']) => (hasilImpor || []).filter((h) => h.status === st).length;

  const namaSiswa = (id: string): string => siswaById.get(id)?.namaLengkap || '(siswa tidak ditemukan di lingkup akses)';
  const nisnSiswa = (id: string): string => siswaById.get(id)?.nisn || '-';

  return (
    <div className="space-y-4">
      <div className="ui-card p-4 space-y-2">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-base font-extrabold text-slate-900">Pemeriksa Data Siswa</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Memeriksa kelengkapan, format, rentang nilai, konflik antarkolom, dan kemungkinan duplikat pada data siswa
              di sekolah aktif — sesuai hak akses Anda (operator hanya melihat rombelnya). Pemeriksa ini{' '}
              <strong className="text-slate-700">tidak pernah mengubah atau menghapus data</strong>; setiap temuan
              harus diperbaiki manual lewat formulir, atau diabaikan dengan alasan.
              Aturan lengkapnya (kelengkapan, format, konflik, rentang, duplikat) terbuka lewat tombol
              <strong className="text-slate-700"> &quot;Lihat &amp; atur aturan&quot;</strong> di bawah — perlu diingat,
              aturan format hanya berlaku <em>bila kolomnya diisi</em>, jadi kolom kosong tidak selalu berarti temuan.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <span className="ui-badge ui-badge-slate">Total {ringkasan.total} temuan</span>
          <span className="ui-badge ui-badge-rose">Tinggi: {ringkasan.tinggi}</span>
          <span className="ui-badge ui-badge-amber">Sedang: {ringkasan.sedang}</span>
          <span className="ui-badge ui-badge-slate">Rendah: {ringkasan.rendah}</span>
          <span className="ui-badge ui-badge-blue">Belum diperiksa: {ringkasan.belumDiperiksa}</span>
          <span className="ui-badge ui-badge-emerald">Diperbaiki: {ringkasan.diperbaiki}</span>
          <span className="ui-badge ui-badge-slate">Diabaikan: {ringkasan.diabaikan}</span>
          <button
            type="button"
            className="ui-btn ui-btn-outline !py-1 !px-2 !text-xs"
            onClick={() => setTampilAturan((v) => !v)}
          >
            {tampilAturan ? 'Sembunyikan aturan' : 'Lihat & atur aturan'}
          </button>
        </div>
      </div>

      {tampilAturan && (
        <div className="ui-card p-4 space-y-2">
          <h3 className="text-sm font-bold text-slate-900">Aturan pemeriksaan (dapat diaktifkan/nonaktifkan)</h3>
          <p className="text-xs text-slate-500">
            Konfigurasi tersimpan di perangkat ini untuk sekolah aktif. Dokumentasi lengkap tiap aturan ada di{' '}
            <span className="font-semibold">docs/03-model-data.md §4a</span> dan alur kerja di{' '}
            <span className="font-semibold">docs/05-operasional.md §4e</span>.
          </p>
          <ul className="divide-y divide-slate-100">
            {ATURAN_PEMERIKSA.map((a) => {
              const aktif = konfig[a.id] ?? a.aktif;
              return (
                <li key={a.id} className="py-2 flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={aktif}
                    onChange={() => handleToggleAturan(a.id)}
                    aria-label={`Aktifkan aturan ${a.judul}`}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-xs font-semibold text-slate-800">
                      {a.judul} <span className={`ui-badge ${PRIORITAS_BADGE[a.prioritas]} ml-1`}>{PRIORITAS_LABEL[a.prioritas]}</span>{' '}
                      <span className="ui-badge ui-badge-slate">{KATEGORI_LABEL[a.kategori]}</span>
                    </p>
                    <p className="text-xs text-slate-500">{a.penjelasan}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Filter + pencarian */}
      <div className="ui-card p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari nama / NISN / judul temuan…"
            className="ui-input !pl-9"
            aria-label="Cari temuan"
          />
        </div>
        <select value={fPrioritas} onChange={(e) => setFPrioritas(e.target.value as typeof fPrioritas)} className="ui-select !w-auto" aria-label="Filter prioritas">
          <option value="semua">Semua prioritas</option>
          <option value="tinggi">Tinggi</option>
          <option value="sedang">Sedang</option>
          <option value="rendah">Rendah</option>
        </select>
        <select value={fKategori} onChange={(e) => setFKategori(e.target.value as typeof fKategori)} className="ui-select !w-auto" aria-label="Filter kategori">
          <option value="semua">Semua kategori</option>
          <option value="wajib">Field wajib</option>
          <option value="format">Format</option>
          <option value="rentang">Rentang nilai</option>
          <option value="konflik">Konflik antarkolom</option>
          <option value="duplikat">Duplikat</option>
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value as typeof fStatus)} className="ui-select !w-auto" aria-label="Filter status">
          <option value="semua">Semua status</option>
          <option value="belum-diperiksa">Belum diperiksa</option>
          <option value="diperbaiki">Diperbaiki</option>
          <option value="diabaikan">Diabaikan</option>
        </select>
      </div>

      {/* Daftar temuan */}
      <div className="ui-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-bold text-slate-900">Daftar temuan ({temuanTampil.length})</h3>
          <span className="text-xs text-slate-500">— diperiksa dari {siswa.length} siswa dalam lingkup akses Anda.</span>
        </div>
        {temuanTampil.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">
            {temuan.length === 0
              ? 'Tidak ada temuan — data siswa dalam lingkup akses Anda lolos semua aturan yang aktif.'
              : 'Tidak ada temuan yang cocok dengan filter/pencarian.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {temuanTampil.map((t) => {
              const status = statusEfektifTemuan(t, petaStatus);
              const s = siswaById.get(t.siswaId);
              const s2 = t.siswaIdLain ? siswaById.get(t.siswaIdLain) : undefined;
              return (
                <li key={t.id} className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`ui-badge ${PRIORITAS_BADGE[t.prioritas]}`}>{PRIORITAS_LABEL[t.prioritas]}</span>
                    <span className="ui-badge ui-badge-slate">{KATEGORI_LABEL[t.kategori]}</span>
                    <span className="ui-badge ui-badge-blue">{STATUS_LABEL[status]}</span>
                    <span className="text-sm font-bold text-slate-900">{t.judul}</span>
                  </div>
                  <p className="text-xs text-slate-600">{t.alasan}</p>
                  <p className="text-xs text-slate-500">
                    Siswa: <strong className="text-slate-800">{namaSiswa(t.siswaId)}</strong> (NISN {nisnSiswa(t.siswaId)})
                    {t.siswaIdLain && (
                      <>
                        {' '}↔ <strong className="text-slate-800">{namaSiswa(t.siswaIdLain)}</strong> (NISN {nisnSiswa(t.siswaIdLain)})
                      </>
                    )}
                    {' '}· Sumber: data lokal
                  </p>
                  {status === 'diabaikan' && petaStatus[t.id]?.alasan && (
                    <p className="text-xs text-slate-500 italic">Alasan diabaikan: {petaStatus[t.id].alasan}</p>
                  )}
                  {alasanAbaikanId === t.id ? (
                    <div className="flex flex-wrap gap-2 items-center">
                      <input
                        value={alasanAbaikan}
                        onChange={(e) => setAlasanAbaikan(e.target.value)}
                        placeholder="Alasan mengabaikan (wajib)…"
                        className="ui-input !w-auto flex-1 min-w-[220px]"
                        aria-label="Alasan mengabaikan temuan"
                        autoFocus
                      />
                      <button type="button" className="ui-btn ui-btn-danger !py-1 !px-2 !text-xs" onClick={() => handleKonfirmasiAbaikan(t)}>
                        Konfirmasi abaikan
                      </button>
                      <button type="button" className="ui-btn ui-btn-ghost !py-1 !px-2 !text-xs" onClick={() => setAlasanAbaikanId(null)}>
                        Batal
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {s && (
                        <button
                          type="button"
                          className="ui-btn ui-btn-primary !py-1 !px-2 !text-xs"
                          onClick={() => onEditSiswa(s)}
                        >
                          <PencilLine className="w-3.5 h-3.5" /> Perbaiki di formulir
                        </button>
                      )}
                      {s2 && (
                        <button
                          type="button"
                          className="ui-btn ui-btn-outline !py-1 !px-2 !text-xs"
                          onClick={() => onEditSiswa(s2)}
                        >
                          <PencilLine className="w-3.5 h-3.5" /> Perbaiki record kedua
                        </button>
                      )}
                      {onViewSiswa && s && (
                        <button type="button" className="ui-btn ui-btn-ghost !py-1 !px-2 !text-xs" onClick={() => onViewSiswa(s)}>
                          <Eye className="w-3.5 h-3.5" /> Lihat detail
                        </button>
                      )}
                      {status !== 'diperbaiki' && (
                        <button
                          type="button"
                          className="ui-btn ui-btn-outline !py-1 !px-2 !text-xs"
                          onClick={() => handleTandai(t, 'diperbaiki')}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Tandai diperbaiki
                        </button>
                      )}
                      {status !== 'diabaikan' && (
                        <button
                          type="button"
                          className="ui-btn ui-btn-ghost !py-1 !px-2 !text-xs"
                          onClick={() => handleTandai(t, 'diabaikan')}
                        >
                          <CircleSlash className="w-3.5 h-3.5" /> Abaikan…
                        </button>
                      )}
                      {status !== 'belum-diperiksa' && (
                        <button
                          type="button"
                          className="ui-btn ui-btn-ghost !py-1 !px-2 !text-xs"
                          onClick={() => handleTandai(t, 'belum-diperiksa')}
                        >
                          <X className="w-3.5 h-3.5" /> Kembalikan ke belum diperiksa
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Pratinjau perbedaan data impor */}
      <div className="ui-card p-4 space-y-3">
        <h3 className="text-sm font-bold text-slate-900">Bandingkan dengan data impor (pratinjau CSV)</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Unggah berkas CSV yang kolom pertamanya berisi NISN, Nama, Tanggal Lahir, Rombel, dan NIK untuk melihat perbedaan terhadap data
          saat ini <strong className="text-slate-700">tanpa mengubah data apa pun</strong>. Baris berstatus konflik tidak boleh
          diterapkan tanpa tinjauan manual. Penerapan perubahan tetap dilakukan satu per satu lewat formulir siswa.
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="ui-btn ui-btn-outline !py-1.5 !px-3 !text-xs cursor-pointer">
            <Upload className="w-4 h-4" /> Pilih berkas CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => void handleFileImpor(e.target.files?.[0])}
            />
          </label>
          {hasilImpor && (
            <>
              <span className="text-xs text-slate-500">
                {namaFileImpor} — baru: {hitungImpor('baru')}, berbeda: {hitungImpor('berbeda')}, sama: {hitungImpor('sama')}, konflik: {hitungImpor('konflik')}, tanpa kunci: {hitungImpor('tanpa-kunci')}
              </span>
              <button type="button" className="ui-btn ui-btn-ghost !py-1 !px-2 !text-xs" onClick={() => { setHasilImpor(null); setNamaFileImpor(''); }}>
                Bersihkan pratinjau
              </button>
              <select value={fImpor} onChange={(e) => setFImpor(e.target.value as typeof fImpor)} className="ui-select !w-auto" aria-label="Filter hasil impor">
                <option value="semua">Semua hasil impor</option>
                <option value="baru">Baru</option>
                <option value="berbeda">Berbeda</option>
                <option value="sama">Sama</option>
                <option value="konflik">Konflik</option>
                <option value="tanpa-kunci">Tanpa kunci</option>
              </select>
            </>
          )}
        </div>
        {hasilImpor && (
          imporTampil.length === 0 ? (
            <p className="text-sm text-slate-500">Tidak ada baris impor yang cocok dengan filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="py-2 pr-2 font-semibold">NISN impor</th>
                    <th className="py-2 pr-2 font-semibold">Nama impor</th>
                    <th className="py-2 pr-2 font-semibold">Status</th>
                    <th className="py-2 pr-2 font-semibold">Perbedaan / alasan</th>
                  </tr>
                </thead>
                <tbody>
                  {imporTampil.map((h, i) => (
                    <tr key={`${h.nisn}-${i}`} className="border-b border-slate-50 align-top">
                      <td className="py-2 pr-2 tabular-nums">{h.nisn || '-'}</td>
                      <td className="py-2 pr-2">{h.namaImpor || '-'}</td>
                      <td className="py-2 pr-2">
                        <span className={`ui-badge ${h.status === 'konflik' ? 'ui-badge-rose' : h.status === 'berbeda' ? 'ui-badge-amber' : h.status === 'baru' ? 'ui-badge-emerald' : 'ui-badge-slate'}`}>
                          {h.status}
                        </span>
                      </td>
                      <td className="py-2 pr-2">
                        <p className="text-slate-600">{h.alasan}</p>
                        {h.perubahan.length > 0 && (
                          <ul className="list-disc pl-4 text-slate-600">
                            {h.perubahan.map((p) => (<li key={p}>{p}</li>))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
};
