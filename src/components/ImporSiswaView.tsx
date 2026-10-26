// ---------------- IMPOR EXCEL/CSV SISWA (Issue #11) ----------------
// Wizard 4 langkah: 1) Pilih berkas -> 2) Pemetaan kolom -> 3) Pratinjau +
// rekonsiliasi -> 4) Ringkasan hasil.
//
// Jaminan keamanan yang ditegakkan di sini:
// - TIDAK ADA mutasi data sebelum pengguna mengonfirmasi pratinjau
//   (langkah 1-3 hanya menghitung; tulis hanya di handleTerapkan).
// - Baris "beda" tidak pernah digabung otomatis: pengguna memilih eksplisit
//   (massal + per baris) apakah dilewati atau diperbarui.
// - Sebelum tulis: snapshot pengaman (auto-backup). Tulis memakai
//   saveSiswaBulk = SATU transaksi IndexedDB (atomik: gagal = tidak ada
//   perubahan). Snapshot dapat dipulihkan manual dari menu Backup.
// - Hak rombel operator ditegakkan di rekonsiliasi (canUserAccessRombel):
//   baris di luar kewenangan dilewati dan nilai lamanya tidak ditampilkan.
// - Sidik jari (SHA-256) berkas yang sudah diterapkan disimpan; unggah ulang
//   berkas yang sama diblokir kecuali pengguna mencentang impor ulang.
// - Data siswa tidak pernah ditulis ke log.

import React, { useMemo, useRef, useState } from 'react';
import { X, Upload, FileSpreadsheet, Download, AlertTriangle, CheckCircle2, Eye, ChevronLeft } from 'lucide-react';
import type { AppUser, SekolahProfile, Siswa } from '../types';
import { toast, confirmDialog } from '../utils/notify';
import { PageControl } from './PageControl';
import { unduhExcel } from '../utils/excel';
import { catatAudit } from '../utils/audit';
import { bolehTulis } from '../utils/akses';
import { jalankanAutoBackup } from '../utils/autoBackup';
import {
  saveSiswaBulk,
  canUserAccessRombel,
  kunciOperasiPanjang,
  bukaKunciOperasiPanjang,
  scopedStorageKey,
  storageKeys,
} from '../utils/db';
import {
  KOLOM_IMPOR,
  LABEL_KLASIFIKASI,
  barisDariExcel,
  barisKeNilai,
  bangunCsvTemplate,
  barisXlsxTemplate,
  barisXlsxPanduan,
  catatSidikImpor,
  hitungSidikJari,
  laporanErrorCsv,
  parseCsv,
  petakanKolomOtomatis,
  pisahHeaderDanData,
  rekonsiliasiImpor,
  rencanaTerapkan,
  ringkasanImpor,
  sidikSudahDiterapkan,
  validasiFileImpor,
  validasiSemuaBaris,
  type BarisRekonsiliasi,
  type CatatanImpor,
  type KeputusanImpor,
  type KlasifikasiImpor,
} from '../utils/imporSiswa';

interface ImporSiswaViewProps {
  /** SELURUH siswa sekolah aktif (untuk pencocokan duplikat lintas rombel). */
  siswa: Siswa[];
  currentUser: AppUser | null;
  sekolah: SekolahProfile;
  onDataChanged: () => void | Promise<void>;
  onClose: () => void;
}

type Langkah = 'file' | 'pemetaan' | 'pratinjau' | 'selesai';

const LANGKAH_LABEL = ['Pilih Berkas', 'Pemetaan Kolom', 'Pratinjau & Rekonsiliasi', 'Hasil'];

/** Adapter penyimpanan sidik jari (localStorage ter-scope per database sekolah). */
const penyimpananSidik = {
  baca: () => {
    try {
      return localStorage.getItem(scopedStorageKey(storageKeys.IMPOR_SIDIK));
    } catch {
      return null;
    }
  },
  tulis: (raw: string) => {
    try {
      localStorage.setItem(scopedStorageKey(storageKeys.IMPOR_SIDIK), raw);
    } catch {
      /* abaikan */
    }
  },
};

function unduhTeks(namaFile: string, isi: string, tipe: string): void {
  const blob = new Blob([isi], { type: tipe });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = namaFile;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const ImporSiswaView: React.FC<ImporSiswaViewProps> = ({
  siswa,
  currentUser,
  sekolah,
  onDataChanged,
  onClose,
}) => {
  const [langkah, setLangkah] = useState<Langkah>('file');
  const [namaFile, setNamaFile] = useState('');
  const [header, setHeader] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [namaSheet, setNamaSheet] = useState<string | null>(null);
  const [pemetaan, setPemetaan] = useState<(string | null)[]>([]);
  const [peringatanPemetaan, setPeringatanPemetaan] = useState<string[]>([]);
  const [sidik, setSidik] = useState('');
  const [catatanLama, setCatatanLama] = useState<CatatanImpor | null>(null);
  const [izinkanUlang, setIzinkanUlang] = useState(false);
  const [membaca, setMembaca] = useState(false);
  const [bulkBeda, setBulkBeda] = useState<'lewati' | 'perbarui' | null>(null);
  const [keputusan, setKeputusan] = useState<Record<number, KeputusanImpor>>({});
  const [setuju, setSetuju] = useState(false);
  const [menerapkan, setMenerapkan] = useState(false);
  const [hasil, setHasil] = useState<{ tambah: number; perbarui: number; lewati: number } | null>(null);
  const [filterKlasifikasi, setFilterKlasifikasi] = useState<'semua' | KlasifikasiImpor>('semua');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const inputFileRef = useRef<HTMLInputElement>(null);

  const resetBerkas = () => {
    setHeader([]);
    setDataRows([]);
    setNamaSheet(null);
    setPemetaan([]);
    setPeringatanPemetaan([]);
    setSidik('');
    setCatatanLama(null);
    setIzinkanUlang(false);
    setBulkBeda(null);
    setKeputusan({});
    setSetuju(false);
    setHasil(null);
    setFilterKlasifikasi('semua');
    setPage(1);
    setLangkah('file');
  };

  // ---------- Langkah 1: baca berkas ----------
  const handlePilihFile = async (file: File | undefined) => {
    if (!file) return;
    const errFile = validasiFileImpor(file.name, file.size);
    if (errFile.length > 0) {
      toast(errFile.join(' '), 'error');
      return;
    }
    setMembaca(true);
    try {
      const isXlsx = file.name.toLowerCase().endsWith('.xlsx');
      let barisMentah: string[][];
      let sidikBaru: string;
      let sheet: string | null = null;
      if (isXlsx) {
        const buf = await file.arrayBuffer();
        const XLSX = await import('xlsx');
        const parsed = barisDariExcel(buf, XLSX as never);
        barisMentah = parsed.barisMentah;
        sheet = parsed.namaSheet;
        if (parsed.jumlahSheet > 1) {
          toast(`Berkas memiliki ${parsed.jumlahSheet} sheet — hanya sheet pertama ("${parsed.namaSheet}") yang diimpor.`, 'warning');
        }
        sidikBaru = await hitungSidikJari(buf);
      } else {
        const teks = await file.text();
        barisMentah = parseCsv(teks);
        sidikBaru = await hitungSidikJari(teks);
      }
      const { header: hdr, data } = pisahHeaderDanData(barisMentah);
      const peta = petakanKolomOtomatis(hdr);
      const lama = sidikSudahDiterapkan(sidikBaru, penyimpananSidik);
      resetBerkas();
      setNamaFile(file.name);
      setHeader(hdr);
      setDataRows(data);
      setNamaSheet(sheet);
      setPemetaan(peta.pemetaan);
      setPeringatanPemetaan(peta.peringatan);
      setSidik(sidikBaru);
      setCatatanLama(lama);
      if (lama) {
        toast(
          `Berkas ini sudah pernah diterapkan pada ${new Date(lama.diterapkanPada).toLocaleString('id-ID')} ` +
            `(+${lama.tambah} baru, ~${lama.perbarui} diperbarui). Centang "impor ulang" bila memang sengaja mengulang.`,
          'warning'
        );
      }
      setLangkah('pemetaan');
    } catch (err: unknown) {
      toast(`Gagal membaca berkas: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setMembaca(false);
    }
  };

  const handleUnduhTemplateCsv = () => {
    unduhTeks('template-impor-siswa.csv', `\uFEFF${bangunCsvTemplate()}`, 'text/csv;charset=utf-8');
    toast('Template CSV diunduh (2 baris contoh fiktif).', 'success');
  };

  const handleUnduhTemplateXlsx = async () => {
    try {
      await unduhExcel('template-impor-siswa', [
        { nama: 'Template', baris: barisXlsxTemplate() },
        { nama: 'Panduan', baris: barisXlsxPanduan() },
      ]);
      toast('Template Excel diunduh (sheet Template + Panduan).', 'success');
    } catch (err: unknown) {
      toast(`Gagal membuat template: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  // ---------- Perhitungan pratinjau (murni, tanpa mutasi) ----------
  const nilaiList = useMemo(
    () => dataRows.map((r) => barisKeNilai(r, pemetaan)),
    [dataRows, pemetaan]
  );
  const rekonsDasar = useMemo(() => {
    if (dataRows.length === 0) return [] as BarisRekonsiliasi[];
    const tervalidasi = validasiSemuaBaris(nilaiList);
    return rekonsiliasiImpor(tervalidasi, siswa, (rombel) => canUserAccessRombel(currentUser, rombel));
  }, [nilaiList, dataRows.length, siswa, currentUser]);

  /** Baris efektif = rekonsiliasi + keputusan pengguna (per baris; pilihan
   *  massal diterapkan ke SEMUA baris beda lewat pilihBulkBeda). */
  const rekonsEfektif = useMemo(() => {
    return rekonsDasar.map((b) => {
      const k = keputusan[b.nomorBaris];
      if (k && (b.klasifikasi === 'baru' || b.klasifikasi === 'beda')) return { ...b, keputusan: k };
      return b;
    });
  }, [rekonsDasar, keputusan]);

  /** Pilihan massal: timpa keputusan semua baris 'beda' (edit per baris sesudahnya tetap menang). */
  const pilihBulkBeda = (v: 'lewati' | 'perbarui') => {
    setBulkBeda(v);
    setKeputusan((prev) => {
      const next = { ...prev };
      for (const b of rekonsDasar) {
        if (b.klasifikasi === 'beda') next[b.nomorBaris] = v;
      }
      return next;
    });
  };

  const ringkasan = useMemo(() => ringkasanImpor(rekonsEfektif), [rekonsEfektif]);
  const wajibHilang = useMemo(
    () => KOLOM_IMPOR.filter((d) => d.wajib && !pemetaan.includes(d.field)).map((d) => d.label),
    [pemetaan]
  );
  const takDikenal = useMemo(
    () => header.map((h, i) => ({ h, i })).filter(({ i }) => pemetaan[i] === null && (header[i] || '').trim() !== ''),
    [header, pemetaan]
  );

  const barisTersaring = useMemo(() => {
    const daftar = filterKlasifikasi === 'semua' ? rekonsEfektif : rekonsEfektif.filter((b) => b.klasifikasi === filterKlasifikasi);
    return daftar;
  }, [rekonsEfektif, filterKlasifikasi]);
  const totalPages = Math.max(1, Math.ceil(barisTersaring.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const barisHalaman = barisTersaring.slice((safePage - 1) * pageSize, safePage * pageSize);

  const ubahKeputusanBaris = (nomorBaris: number, k: KeputusanImpor) => {
    setKeputusan((prev) => ({ ...prev, [nomorBaris]: k }));
  };

  // ---------- Langkah 3: terapkan (satu-satunya tempat mutasi) ----------
  const handleTerapkan = async () => {
    if (menerapkan) return;
    if (bulkBeda === null && ringkasan.beda > 0) {
      toast('Pilih dulu perlakuan untuk baris yang berbeda (lewati / perbarui).', 'warning');
      return;
    }
    if (!setuju) {
      toast('Centang pernyataan persetujuan sebelum menerapkan.', 'warning');
      return;
    }
    if (ringkasan.akanTambah + ringkasan.akanPerbarui === 0) {
      toast('Tidak ada baris yang akan diterapkan (semuanya dilewati).', 'warning');
      return;
    }
    // Issue #12: peran pimpinan hanya membaca (matriks akses).
    if (!bolehTulis(currentUser)) {
      toast('Peran pimpinan hanya dapat membaca data.', 'error');
      return;
    }
    setMenerapkan(true);
    kunciOperasiPanjang();
    try {
      // 1) Snapshot pengaman SEBELUM tulis (dipulihkan manual dari menu Backup bila perlu).
      const snap = await jalankanAutoBackup('impor-siswa');
      if (!snap.jalan) {
        const lanjut = await confirmDialog(
          `Snapshot pengaman gagal dibuat (${snap.pesan}). Lanjutkan impor tanpa snapshot pengaman? ` +
            'Bila terjadi kegagalan, transaksi tetap dibatalkan dan data tidak berubah.',
          { confirmLabel: 'Ya, Lanjutkan Tanpa Snapshot', danger: true }
        );
        if (!lanjut) return;
      }
      // 2) Tulis dalam SATU transaksi (saveSiswaBulk): gagal = tidak ada perubahan.
      const rencana = rencanaTerapkan(rekonsEfektif, siswa, {
        jenjang: sekolah.jenjang || 'SMP',
        tahunAjaran: sekolah.tahunAjaran || '',
        sekarangIso: new Date().toISOString(),
      });
      await saveSiswaBulk([...rencana.tambah, ...rencana.perbarui]);
      // 3) Catat sidik + audit (tanpa data siswa di detail — hanya hitungan).
      catatSidikImpor(
        {
          sidik,
          namaFile,
          diterapkanPada: new Date().toISOString(),
          tambah: rencana.tambah.length,
          perbarui: rencana.perbarui.length,
          lewati: ringkasan.akanLewati,
        },
        penyimpananSidik
      );
      catatAudit('impor_siswa', {
        entitas: 'siswa',
        ringkasan: `Impor ${namaFile}: +${rencana.tambah.length} baru, ~${rencana.perbarui.length} diperbarui, ${ringkasan.akanLewati} dilewati`,
        detail: `Berkas: ${namaFile}. Konflik: ${ringkasan.konflik}, error: ${ringkasan.error}, di luar kewenangan: ${ringkasan.ditolakAkses}.`,
      });
      await onDataChanged();
      setHasil({ tambah: rencana.tambah.length, perbarui: rencana.perbarui.length, lewati: ringkasan.akanLewati });
      setLangkah('selesai');
      toast(`Impor diterapkan: +${rencana.tambah.length} baru, ~${rencana.perbarui.length} diperbarui.`, 'success');
    } catch (err: unknown) {
      toast(
        `Impor GAGAL diterapkan: ${err instanceof Error ? err.message : String(err)} ` +
          'Transaksi dibatalkan — data tidak berubah. Bila ragu, pulihkan snapshot terbaru dari menu Backup.',
        'error'
      );
    } finally {
      bukaKunciOperasiPanjang();
      setMenerapkan(false);
    }
  };

  const handleUnduhLaporanError = () => {
    unduhTeks(`laporan-error-impor-${new Date().toISOString().slice(0, 10)}.csv`, laporanErrorCsv(rekonsEfektif), 'text/csv;charset=utf-8');
    toast('Laporan error diunduh.', 'success');
  };

  const bisaLanjutPemetaan = wajibHilang.length === 0 && !(catatanLama && !izinkanUlang);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            Impor Siswa dari Excel / CSV
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500" aria-label="Tutup">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-4 pb-5">
          {/* Stepper */}
          <div className="flex items-center gap-1 mb-5">
            {LANGKAH_LABEL.map((l, i) => {
              const idxLangkah: Langkah[] = ['file', 'pemetaan', 'pratinjau', 'selesai'];
              const aktif = idxLangkah.indexOf(langkah) === i;
              const lewat = idxLangkah.indexOf(langkah) > i;
              return (
                <div key={l} className="flex items-center gap-1 flex-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${aktif ? 'bg-emerald-600 text-white' : lewat ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {i + 1}
                  </div>
                  <span className={`text-xs font-semibold ${aktif ? 'text-slate-900' : 'text-slate-500'}`}>{l}</span>
                  {i < LANGKAH_LABEL.length - 1 && <div className="flex-1 h-px bg-slate-200 mx-1" />}
                </div>
              );
            })}
          </div>

          {/* ============ LANGKAH 1: FILE ============ */}
          {langkah === 'file' && (
            <div className="space-y-4">
              <div className="ui-card p-4">
                <p className="text-sm text-slate-700 mb-3">
                  Unggah berkas <strong>.csv</strong> atau <strong>.xlsx</strong> (maks 5 MB, maks {2000} baris).
                  Baris pertama harus header kolom. Belum ada template? Unduh dulu:
                </p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={handleUnduhTemplateCsv} className="ui-btn ui-btn-outline">
                    <Download className="w-3.5 h-3.5" /> Template CSV
                  </button>
                  <button onClick={handleUnduhTemplateXlsx} className="ui-btn ui-btn-outline">
                    <Download className="w-3.5 h-3.5" /> Template Excel (.xlsx)
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  CSV harus UTF-8 (di Excel: Save As → CSV UTF-8), delimiter “;” atau “,”.
                  Tanggal: YYYY-MM-DD (DD/MM/YYYY dan tanggal Excel juga diterima).
                  Sel kosong pada baris <em>perbarui</em> berarti “tidak diubah”.
                </p>
              </div>
              <div className="ui-card p-4">
                <input
                  ref={inputFileRef}
                  type="file"
                  accept=".csv,.xlsx"
                  className="hidden"
                  onChange={(e) => {
                    void handlePilihFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <button
                  onClick={() => inputFileRef.current?.click()}
                  disabled={membaca}
                  className="ui-btn ui-btn-primary w-full sm:w-auto"
                >
                  <Upload className="w-4 h-4" />
                  {membaca ? 'Membaca berkas…' : 'Pilih Berkas .csv / .xlsx'}
                </button>
                {namaFile && (
                  <p className="text-xs text-slate-600 mt-2">
                    Terakhir dibaca: <strong>{namaFile}</strong>
                    {namaSheet ? ` (sheet “${namaSheet}”)` : ''} — {dataRows.length} baris data.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ============ LANGKAH 2: PEMETAAN ============ */}
          {langkah === 'pemetaan' && (
            <div className="space-y-4">
              <div className="ui-card p-4">
                <p className="text-sm text-slate-700">
                  Berkas <strong>{namaFile}</strong> — {dataRows.length} baris data.
                  Periksa pemetaan kolom di bawah. Kolom yang tidak dikenal harus dipetakan manual atau dibiarkan “Abaikan”.
                </p>
                {peringatanPemetaan.length > 0 && (
                  <div className="mt-3 flex gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <ul className="list-disc pl-4 space-y-0.5">
                      {peringatanPemetaan.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </div>
                )}
                {wajibHilang.length > 0 && (
                  <div className="mt-3 flex gap-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-3">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Field wajib belum terpetakan: <strong>{wajibHilang.join(', ')}</strong>. Petakan kolomnya sebelum lanjut.</span>
                  </div>
                )}
                {catatanLama && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <p>
                      Berkas ini sudah pernah diterapkan pada{' '}
                      <strong>{new Date(catatanLama.diterapkanPada).toLocaleString('id-ID')}</strong>{' '}
                      (+{catatanLama.tambah} baru, ~{catatanLama.perbarui} diperbarui).
                    </p>
                    <label className="flex items-center gap-2 mt-2 font-semibold cursor-pointer">
                      <input type="checkbox" checked={izinkanUlang} onChange={(e) => setIzinkanUlang(e.target.checked)} />
                      Saya paham — impor ulang berkas ini dengan sengaja
                    </label>
                  </div>
                )}
              </div>

              <div className="ui-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                      <th className="px-4 py-2.5">Header di Berkas</th>
                      <th className="px-4 py-2.5">Contoh Isi (baris 1)</th>
                      <th className="px-4 py-2.5">Dipetakan ke Field</th>
                    </tr>
                  </thead>
                  <tbody>
                    {header.map((h, i) => {
                      const asing = pemetaan[i] === null;
                      return (
                        <tr key={i} className="border-b border-slate-50">
                          <td className="px-4 py-2 font-medium text-slate-800">
                            {h || <span className="text-slate-400 italic">(header kosong)</span>}
                            {asing && (h || '').trim() !== '' && (
                              <span className="ml-2 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">kolom asing</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-slate-600 max-w-[220px] truncate" title={dataRows[0]?.[i] || ''}>
                            {dataRows[0]?.[i] || <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-4 py-2">
                            <select
                              value={pemetaan[i] || ''}
                              onChange={(e) => {
                                const v = e.target.value || null;
                                setPemetaan((prev) => {
                                  const next = [...prev];
                                  // Cegah dua kolom ke satu field: kosongkan pemetaan lama bila bentrok.
                                  if (v) {
                                    const bentrok = next.findIndex((f, j) => j !== i && f === v);
                                    if (bentrok >= 0) next[bentrok] = null;
                                  }
                                  next[i] = v;
                                  return next;
                                });
                              }}
                              className="ui-select !w-auto min-w-[220px]"
                              aria-label={`Pemetaan untuk kolom ${h}`}
                            >
                              <option value="">Abaikan kolom ini</option>
                              {KOLOM_IMPOR.map((d) => (
                                <option key={d.field} value={d.field}>
                                  {d.label}{d.wajib ? ' (wajib)' : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {takDikenal.length > 0 && (
                <p className="text-xs text-amber-700">
                  {takDikenal.length} kolom asing (tidak dikenal): {takDikenal.map((t) => `“${t.h}”`).join(', ')} — akan diabaikan kecuali dipetakan manual.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <button onClick={() => setLangkah('file')} className="ui-btn ui-btn-outline">
                  <ChevronLeft className="w-3.5 h-3.5" /> Kembali
                </button>
                <button
                  onClick={() => {
                    setBulkBeda(null);
                    setKeputusan({});
                    setPage(1);
                    setLangkah('pratinjau');
                  }}
                  disabled={!bisaLanjutPemetaan}
                  className="ui-btn ui-btn-primary disabled:opacity-50"
                >
                  <Eye className="w-4 h-4" /> Lihat Pratinjau
                </button>
              </div>
            </div>
          )}

          {/* ============ LANGKAH 3: PRATINJAU ============ */}
          {langkah === 'pratinjau' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Total baris', nilai: ringkasan.total, kelas: 'text-slate-900' },
                  { label: 'Baru', nilai: ringkasan.baru, kelas: 'text-emerald-700' },
                  { label: 'Sama', nilai: ringkasan.sama, kelas: 'text-slate-500' },
                  { label: 'Berbeda', nilai: ringkasan.beda, kelas: 'text-amber-700' },
                  { label: 'Konflik', nilai: ringkasan.konflik, kelas: 'text-rose-700' },
                  { label: 'Error', nilai: ringkasan.error, kelas: 'text-rose-700' },
                  { label: 'Di luar kewenangan', nilai: ringkasan.ditolakAkses, kelas: 'text-rose-700' },
                  { label: 'Akan diterapkan', nilai: ringkasan.akanTambah + ringkasan.akanPerbarui, kelas: 'text-emerald-700' },
                ].map((k) => (
                  <div key={k.label} className="ui-card p-3 text-center">
                    <div className={`text-xl font-extrabold tabular-nums ${k.kelas}`}>{k.nilai}</div>
                    <div className="text-[11px] text-slate-500">{k.label}</div>
                  </div>
                ))}
              </div>

              {(ringkasan.konflik + ringkasan.error + ringkasan.ditolakAkses > 0) && (
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={handleUnduhLaporanError} className="ui-btn ui-btn-outline">
                    <Download className="w-3.5 h-3.5" /> Unduh Laporan Error (.csv)
                  </button>
                  <span className="text-xs text-slate-500">
                    Berisi baris konflik / error / di luar kewenangan beserta alasannya — perbaiki di berkas lalu impor ulang.
                  </span>
                </div>
              )}

              {ringkasan.beda > 0 && (
                <div className="ui-card p-4">
                  <p className="text-sm font-semibold text-slate-800 mb-2">
                    Perlakuan untuk {ringkasan.beda} baris yang <span className="text-amber-700">berbeda dari data lama</span> (wajib dipilih — tidak ada penggabungan otomatis):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <label className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm cursor-pointer ${bulkBeda === 'lewati' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                      <input type="radio" name="bulkBeda" checked={bulkBeda === 'lewati'} onChange={() => pilihBulkBeda('lewati')} />
                      Lewati semua (data lama dipertahankan)
                    </label>
                    <label className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm cursor-pointer ${bulkBeda === 'perbarui' ? 'border-amber-500 bg-amber-50' : 'border-slate-200'}`}>
                      <input type="radio" name="bulkBeda" checked={bulkBeda === 'perbarui'} onChange={() => pilihBulkBeda('perbarui')} />
                      Perbarui semua (timpa hanya field yang terisi di berkas)
                    </label>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Pilihan massal dapat diubah per baris di tabel di bawah. Sel kosong di berkas tidak pernah mengosongkan data lama.
                  </p>
                </div>
              )}

              <div className="ui-card">
                <div className="p-3 flex flex-wrap items-center gap-2 border-b border-slate-100">
                  <label className="text-xs text-slate-500" htmlFor="filter-klasifikasi">Saring:</label>
                  <select
                    id="filter-klasifikasi"
                    value={filterKlasifikasi}
                    onChange={(e) => {
                      setFilterKlasifikasi(e.target.value as 'semua' | KlasifikasiImpor);
                      setPage(1);
                    }}
                    className="ui-select !w-auto !text-xs"
                  >
                    <option value="semua">Semua klasifikasi ({rekonsEfektif.length})</option>
                    {(Object.keys(LABEL_KLASIFIKASI) as KlasifikasiImpor[]).map((k) => (
                      <option key={k} value={k}>
                        {LABEL_KLASIFIKASI[k]} ({rekonsEfektif.filter((b) => b.klasifikasi === k).length})
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-slate-500 ml-auto">
                    Akan tambah: <strong className="text-emerald-700">{ringkasan.akanTambah}</strong> · Akan perbarui:{' '}
                    <strong className="text-amber-700">{ringkasan.akanPerbarui}</strong> · Dilewati:{' '}
                    <strong>{ringkasan.akanLewati}</strong>
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                        <th className="px-4 py-2.5">Baris</th>
                        <th className="px-4 py-2.5">Nama / NISN / Rombel</th>
                        <th className="px-4 py-2.5">Klasifikasi</th>
                        <th className="px-4 py-2.5">Perbedaan / Alasan</th>
                        <th className="px-4 py-2.5">Keputusan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {barisHalaman.map((b) => (
                        <tr key={b.nomorBaris} className="border-b border-slate-50 align-top">
                          <td className="px-4 py-2 tabular-nums text-slate-500">{b.nomorBaris}</td>
                          <td className="px-4 py-2">
                            <div className="font-medium text-slate-800">{b.nilai.namaLengkap || '(tanpa nama)'}</div>
                            <div className="text-xs text-slate-500 font-mono">
                              {b.nilai.nisn || '-'} · Rombel {b.nilai.rombelSaatIni || '-'}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-xs font-semibold">
                            <span
                              className={
                                b.klasifikasi === 'baru'
                                  ? 'text-emerald-700'
                                  : b.klasifikasi === 'sama'
                                    ? 'text-slate-500'
                                    : b.klasifikasi === 'beda'
                                      ? 'text-amber-700'
                                      : 'text-rose-700'
                              }
                            >
                              {LABEL_KLASIFIKASI[b.klasifikasi]}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs text-slate-600 max-w-[320px]">
                            {b.klasifikasi === 'beda' && (
                              <ul className="space-y-0.5">
                                {b.perbedaan.slice(0, 3).map((d) => (
                                  <li key={d.field}>
                                    <span className="font-semibold">{d.label}:</span>{' '}
                                    <span className="text-rose-700 line-through decoration-rose-300">{d.lama || '(kosong)'}</span>{' '}
                                    → <span className="text-emerald-700">{d.baru}</span>
                                  </li>
                                ))}
                                {b.perbedaan.length > 3 && <li className="text-slate-400">+{b.perbedaan.length - 3} perbedaan lagi…</li>}
                              </ul>
                            )}
                            {(b.klasifikasi === 'error' || b.klasifikasi === 'konflik' || b.klasifikasi === 'ditolak-akses') && (
                              <span className="text-rose-700">{b.alasan}</span>
                            )}
                            {b.klasifikasi === 'baru' && <span className="text-slate-400">—</span>}
                            {b.klasifikasi === 'sama' && <span className="text-slate-400">Tidak ada perubahan.</span>}
                          </td>
                          <td className="px-4 py-2">
                            {b.klasifikasi === 'baru' && (
                              <select
                                value={b.keputusan}
                                onChange={(e) => ubahKeputusanBaris(b.nomorBaris, e.target.value as KeputusanImpor)}
                                className="ui-select !w-auto !text-xs"
                                aria-label={`Keputusan baris ${b.nomorBaris}`}
                              >
                                <option value="tambah">Tambah</option>
                                <option value="lewati">Lewati</option>
                              </select>
                            )}
                            {b.klasifikasi === 'beda' && (
                              <select
                                value={b.keputusan}
                                onChange={(e) => ubahKeputusanBaris(b.nomorBaris, e.target.value as KeputusanImpor)}
                                className="ui-select !w-auto !text-xs"
                                aria-label={`Keputusan baris ${b.nomorBaris}`}
                              >
                                <option value="lewati">Lewati</option>
                                <option value="perbarui">Perbarui</option>
                              </select>
                            )}
                            {(b.klasifikasi === 'sama' || b.klasifikasi === 'error' || b.klasifikasi === 'konflik' || b.klasifikasi === 'ditolak-akses') && (
                              <span className="text-xs text-slate-400">Lewati (tetap)</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {barisHalaman.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-400">
                            Tidak ada baris pada filter ini.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <PageControl
                  page={safePage}
                  totalPages={totalPages}
                  totalItems={barisTersaring.length}
                  pageSize={pageSize}
                  itemName="baris"
                  onPageChange={setPage}
                  onPageSizeChange={(n) => {
                    setPageSize(n);
                    setPage(1);
                  }}
                />
              </div>

              <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={setuju} onChange={(e) => setSetuju(e.target.checked)} className="mt-0.5" />
                <span>
                  Saya sudah memeriksa pratinjau di atas dan menyetujui penerapan:{' '}
                  <strong>+{ringkasan.akanTambah} baru</strong>, <strong>~{ringkasan.akanPerbarui} diperbarui</strong>,{' '}
                  <strong>{ringkasan.akanLewati} dilewati</strong>. Saya paham snapshot pengaman dibuat sebelum penerapan.
                </span>
              </label>

              <div className="flex flex-wrap gap-2">
                <button onClick={() => setLangkah('pemetaan')} className="ui-btn ui-btn-outline">
                  <ChevronLeft className="w-3.5 h-3.5" /> Kembali ke Pemetaan
                </button>
                <button
                  onClick={() => void handleTerapkan()}
                  disabled={
                    menerapkan ||
                    !setuju ||
                    (ringkasan.beda > 0 && bulkBeda === null) ||
                    ringkasan.akanTambah + ringkasan.akanPerbarui === 0
                  }
                  className="ui-btn ui-btn-primary disabled:opacity-50"
                >
                  {menerapkan ? 'Menerapkan…' : `Terapkan Impor (+${ringkasan.akanTambah} / ~${ringkasan.akanPerbarui})`}
                </button>
              </div>
            </div>
          )}

          {/* ============ LANGKAH 4: HASIL ============ */}
          {langkah === 'selesai' && hasil && (
            <div className="space-y-4">
              <div className="ui-card p-5 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                <h3 className="font-bold text-slate-900">Impor berhasil diterapkan</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Berkas <strong>{namaFile}</strong>: <strong className="text-emerald-700">+{hasil.tambah} siswa baru</strong>,{' '}
                  <strong className="text-amber-700">~{hasil.perbarui} diperbarui</strong>, {hasil.lewati} dilewati.
                  Snapshot pengaman tersimpan di menu Backup (dapat dipulihkan bila perlu).
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                <button onClick={resetBerkas} className="ui-btn ui-btn-outline">
                  Impor Berkas Lain
                </button>
                <button onClick={onClose} className="ui-btn ui-btn-primary">
                  Selesai &amp; Lihat Daftar Siswa
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
