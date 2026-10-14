// ---------------- Generator Dokumen Administrasi (Issue #4) ----------------
// Tab "Generator Dokumen": pilih template → pilih siswa/rombel → isi field
// (nomor/tanggal) → PRATINJAU langsung (field wajib kosong ditandai) →
// cetak / ekspor Word (.docx) / Excel (daftar rombel).
//
// Akses: komponen hanya menerima `siswa` yang sudah dipotong hak akses
// (visibleSiswa dari App: batas rombel operator + sesi) — operator TIDAK
// pernah melihat siswa di luar rombelnya. Pengaturan penomoran hanya
// administrator. Pencatatan ekspor dokumen (aksi `dokumen_ekspor`) masuk
// lewat PR #18 (audit trail, belum merge) — komponen ini sengaja tidak
// menambah aksi audit baru agar tidak konflik.

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileText, Mail, Printer, Search, Settings2 } from 'lucide-react';
import type { AppUser, PenomoranDokumen, PenomoranTemplate, SekolahProfile, Siswa, TemplateSuratId } from '../types';
import { KopSuratView } from './KopSuratView';
import {
  DAFTAR_TEMPLATE_SURAT,
  TEMPLATE_SURAT,
  bangunDokumenSurat,
  defaultPenomoran,
  formatNomorSurat,
  getPenomoran,
  prefillField,
  saranNomorUrut,
  siswaUntukTemplate,
  terapkanPenomoran,
  unduhDaftarRombelExcel,
  unduhSuratWord,
  validasiSurat,
  type DokumenSurat,
} from '../utils/suratDokumen';
import { toast } from '../utils/notify';

interface GeneratorDokumenProps {
  /** Siswa dalam kewenangan user (sudah terfilter akses + sesi). */
  siswa: Siswa[];
  sekolah: SekolahProfile;
  currentUser: AppUser | null;
  onUpdateSekolah: (profile: SekolahProfile) => void;
}

function hariIni(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Tandai penanda [BELUM DIISI] di pratinjau dengan sorotan kuning. */
function teksDenganTanda(teks: string): React.ReactNode {
  const parts = teks.split('[BELUM DIISI]');
  if (parts.length === 1) return teks;
  return (
    <>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {p}
          {i < parts.length - 1 && (
            <mark className="bg-amber-300 text-amber-950 font-bold px-1 rounded">[BELUM DIISI]</mark>
          )}
        </React.Fragment>
      ))}
    </>
  );
}

export const GeneratorDokumen: React.FC<GeneratorDokumenProps> = ({ siswa, sekolah, currentUser, onUpdateSekolah }) => {
  const isAdmin = currentUser?.role === 'administrator';

  const [templateId, setTemplateId] = useState<TemplateSuratId>('keterangan-aktif');
  const [cari, setCari] = useState('');
  const [siswaId, setSiswaId] = useState('');
  const [rombel, setRombel] = useState('');
  const [nomorUrut, setNomorUrut] = useState(() => saranNomorUrut(getPenomoran(sekolah, 'keterangan-aktif')));
  const [pakaiManual, setPakaiManual] = useState(false);
  const [nomorManual, setNomorManual] = useState('');
  const [tanggalSurat, setTanggalSurat] = useState(hariIni());
  const [field, setField] = useState<Record<string, string>>({});
  const [configOpen, setConfigOpen] = useState(false);
  const [configDraft, setConfigDraft] = useState<PenomoranDokumen>(() => ({
    ...defaultPenomoran(),
    ...(sekolah.penomoran || {}),
  }));
  const [exporting, setExporting] = useState<null | 'word' | 'excel'>(null);

  const meta = TEMPLATE_SURAT[templateId];

  // Sinkron draf konfigurasi bila profil berubah dari luar (mis. sesudah simpan).
  useEffect(() => {
    setConfigDraft({ ...defaultPenomoran(), ...(sekolah.penomoran || {}) });
  }, [sekolah.penomoran]);

  const kandidat = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return siswaUntukTemplate(siswa, templateId)
      .filter((s) => !k || s.namaLengkap.toLowerCase().includes(k) || (s.nisn || '').includes(k) || (s.rombelSaatIni || '').toLowerCase().includes(k))
      .slice(0, 30);
  }, [siswa, cari, templateId]);

  const siswaDipilih = useMemo(
    () => (siswa || []).find((s) => s.id === siswaId) || null,
    [siswa, siswaId]
  );

  const opsiRombel = useMemo(() => {
    const set = new Set<string>();
    for (const s of siswa || []) {
      if (s.statusSiswa === 'Aktif' && s.rombelSaatIni) set.add(s.rombelSaatIni);
    }
    return [...set].sort();
  }, [siswa]);

  const daftarRombel = useMemo(
    () => (siswa || []).filter((s) => s.statusSiswa === 'Aktif' && s.rombelSaatIni === rombel),
    [siswa, rombel]
  );

  const input = useMemo(
    () => ({
      nomorUrut,
      nomorManual: pakaiManual ? nomorManual.trim() : '',
      tanggalSurat,
      field,
    }),
    [nomorUrut, pakaiManual, nomorManual, tanggalSurat, field]
  );

  const hilang = useMemo(
    () => validasiSurat(templateId, input, siswaDipilih, rombel, daftarRombel, sekolah),
    [templateId, input, siswaDipilih, rombel, daftarRombel, sekolah]
  );

  const dok: DokumenSurat = useMemo(
    () => bangunDokumenSurat(templateId, input, siswaDipilih, rombel, daftarRombel, sekolah),
    [templateId, input, siswaDipilih, rombel, daftarRombel, sekolah]
  );

  const penomoranAktif = getPenomoran(sekolah, templateId);

  const pilihTemplate = (id: TemplateSuratId) => {
    setTemplateId(id);
    setSiswaId('');
    setRombel('');
    setField({});
    setCari('');
    setPakaiManual(false);
    setNomorManual('');
    setNomorUrut(saranNomorUrut(getPenomoran(sekolah, id)));
  };

  const pilihSiswa = (s: Siswa) => {
    setSiswaId(s.id);
    // Prefill hanya mengisi field yang masih kosong (jangan timpa isian operator).
    setField((prev) => {
      const isi = prefillField(templateId, s);
      const gabung = { ...prev };
      for (const [k, v] of Object.entries(isi)) {
        if (!gabung[k]) gabung[k] = v;
      }
      return gabung;
    });
  };

  const handleCetak = () => {
    if (hilang.length > 0) {
      toast('Dokumen belum lengkap — lengkapi field yang ditandai dulu.', 'warning');
      return;
    }
    window.print();
  };

  const handleExportWord = async () => {
    if (hilang.length > 0) {
      toast('Dokumen belum lengkap — lengkapi field yang ditandai dulu.', 'warning');
      return;
    }
    setExporting('word');
    try {
      await unduhSuratWord(dok, sekolah);
      toast(`Dokumen "${dok.judul}" diunduh (.docx).`, 'success');
    } catch (err: unknown) {
      toast(`Gagal mengekspor: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setExporting(null);
    }
  };

  const handleExportExcel = async () => {
    if (hilang.length > 0) {
      toast('Dokumen belum lengkap — lengkapi field yang ditandai dulu.', 'warning');
      return;
    }
    setExporting('excel');
    try {
      await unduhDaftarRombelExcel(dok, sekolah, rombel);
      toast(`Daftar siswa rombel ${rombel} diunduh (.xlsx).`, 'success');
    } catch (err: unknown) {
      toast(`Gagal mengekspor: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setExporting(null);
    }
  };

  const handleTandaiTerpakai = () => {
    if (!isAdmin || pakaiManual) return;
    onUpdateSekolah(terapkanPenomoran(sekolah, templateId, nomorUrut));
    toast(`Nomor urut ${nomorUrut} ditandai terpakai untuk "${meta.judul}".`, 'success');
  };

  const handleSimpanConfig = () => {
    const bersih: PenomoranDokumen = {};
    for (const t of DAFTAR_TEMPLATE_SURAT) {
      const c = configDraft[t.id];
      if (c) bersih[t.id] = { pola: (c.pola || '').trim(), nomorTerakhir: Math.max(0, Math.floor(Number(c.nomorTerakhir) || 0)) };
    }
    onUpdateSekolah({ ...sekolah, penomoran: bersih });
    setConfigOpen(false);
    toast('Aturan penomoran disimpan.', 'success');
  };

  const opsiPenerima = useMemo(() => {
    const daftar = ['Orang Tua/Wali', siswaDipilih?.ayah?.nama, siswaDipilih?.ibu?.nama, siswaDipilih?.wali?.nama]
      .map((v) => (v || '').trim())
      .filter(Boolean);
    return [...new Set(daftar)];
  }, [siswaDipilih]);

  const nomorPratinjau = pakaiManual
    ? nomorManual.trim() || '(nomor manual kosong)'
    : formatNomorSurat(penomoranAktif.pola, nomorUrut, tanggalSurat);

  return (
    <div className="space-y-4">
      {/* Pilih template */}
      <div className="ui-card p-4 print:hidden">
        <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-600" /> 1. Pilih Template Dokumen
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
          {DAFTAR_TEMPLATE_SURAT.map((t) => (
            <button
              key={t.id}
              onClick={() => pilihTemplate(t.id)}
              className={`text-left p-3 rounded-xl border transition cursor-pointer ${templateId === t.id ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}
            >
              <span className="block font-bold text-xs text-slate-900">{t.judul}</span>
              <span className="block text-[11px] text-slate-500 mt-1">{t.deskripsi}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Kolom form */}
        <div className="space-y-4 print:hidden">
          {/* Pilih siswa / rombel */}
          <div className="ui-card p-4">
            <h3 className="font-bold text-sm text-slate-900">
              {meta.butuhRombel ? '2. Pilih Rombel' : '2. Pilih Siswa'}
            </h3>
            {meta.butuhRombel ? (
              <>
                <select value={rombel} onChange={(e) => setRombel(e.target.value)} className="ui-select mt-3" aria-label="Pilih rombel">
                  <option value="">— Pilih rombel —</option>
                  {opsiRombel.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                {rombel && (
                  <p className="text-xs text-slate-600 mt-2">
                    Rombel <strong>{rombel}</strong>: <strong>{daftarRombel.length}</strong> siswa aktif.
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="relative mt-3">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama / NISN / rombel…" className="ui-input !pl-9" aria-label="Cari siswa" />
                </div>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto mt-2">
                  {kandidat.length === 0 ? (
                    <p className="p-4 text-xs text-slate-500 text-center">Tidak ada siswa yang cocok.</p>
                  ) : (
                    kandidat.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => pilihSiswa(s)}
                        className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 transition cursor-pointer ${siswaId === s.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                      >
                        <span>
                          <span className="block text-sm font-bold text-slate-900">{s.namaLengkap}</span>
                          <span className="block text-[11px] text-slate-500 font-mono">{s.nisn || '-'} • {s.rombelSaatIni || '-'} • {s.statusSiswa}</span>
                        </span>
                        {siswaId === s.id && <CheckCircle2 className="w-5 h-5 text-indigo-600 shrink-0" />}
                      </button>
                    ))
                  )}
                </div>
                {templateId === 'pindah-keluar' && siswaDipilih?.noSuratMutasi && (
                  <p className="text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-2.5 mt-2">
                    Nomor tercatat di data mutasi: <strong>{siswaDipilih.noSuratMutasi}</strong>.
                    Aktifkan “nomor manual” di bawah bila mencetak ulang dengan nomor yang sama.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Nomor & tanggal */}
          <div className="ui-card p-4">
            <h3 className="font-bold text-sm text-slate-900">3. Nomor &amp; Tanggal Surat</h3>
            <div className="mt-3 space-y-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input type="checkbox" checked={pakaiManual} onChange={(e) => setPakaiManual(e.target.checked)} className="rounded border-slate-300" />
                Tulis nomor lengkap secara manual (mis. mencetak ulang dengan nomor tercatat)
              </label>
              {pakaiManual ? (
                <div>
                  <label className="ui-label">Nomor surat (manual) *</label>
                  <input value={nomorManual} onChange={(e) => setNomorManual(e.target.value)} placeholder="cth. 421/123/2026" className="ui-input font-mono" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="ui-label">Nomor urut *</label>
                    <input
                      type="number"
                      min={meta.perluNomor ? 1 : 0}
                      value={nomorUrut}
                      onChange={(e) => setNomorUrut(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                      className="ui-input font-mono"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Saran berikutnya: <strong>{saranNomorUrut(penomoranAktif)}</strong> (terakhir terpakai: {penomoranAktif.nomorTerakhir})
                    </p>
                  </div>
                  <div>
                    <label className="ui-label">Tanggal surat *</label>
                    <input type="date" value={tanggalSurat} onChange={(e) => setTanggalSurat(e.target.value)} className="ui-input" />
                  </div>
                </div>
              )}
              {pakaiManual && (
                <div>
                  <label className="ui-label">Tanggal surat *</label>
                  <input type="date" value={tanggalSurat} onChange={(e) => setTanggalSurat(e.target.value)} className="ui-input" />
                </div>
              )}
              <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                Nomor yang akan tercetak: <strong className="font-mono">{nomorPratinjau}</strong>
                {!pakaiManual && <span className="text-slate-500"> (pola: <span className="font-mono">{penomoranAktif.pola}</span>)</span>}
              </p>
              {isAdmin && !pakaiManual && (
                <button
                  onClick={handleTandaiTerpakai}
                  disabled={hilang.length > 0 || nomorUrut <= penomoranAktif.nomorTerakhir}
                  className="ui-btn ui-btn-outline !py-1.5 !text-xs"
                  title={hilang.length > 0 ? 'Lengkapi dokumen dulu' : nomorUrut <= penomoranAktif.nomorTerakhir ? 'Nomor ini sudah ditandai terpakai' : 'Catat nomor ini sebagai terakhir terpakai'}
                >
                  Tandai nomor urut {nomorUrut} sebagai terpakai
                </button>
              )}
              {!isAdmin && (
                <p className="text-[11px] text-slate-500">Penomoran dikelola administrator. Operator memakai saran nomor atau menulis nomor manual.</p>
              )}
            </div>
          </div>

          {/* Field template */}
          <div className="ui-card p-4">
            <h3 className="font-bold text-sm text-slate-900">4. Isi Surat</h3>
            <div className="mt-3 space-y-3">
              {meta.field.map((f) => {
                const nilai = field[f.kunci] || '';
                const setNilai = (v: string) => setField((prev) => ({ ...prev, [f.kunci]: v }));
                if (templateId === 'panggilan-ortu' && f.kunci === 'penerima' && siswaDipilih) {
                  return (
                    <div key={f.kunci}>
                      <label className="ui-label">{f.label} *</label>
                      <select value={nilai} onChange={(e) => setNilai(e.target.value)} className="ui-select">
                        <option value="">— Pilih —</option>
                        {opsiPenerima.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-500 mt-1">{f.deskripsi}</p>
                    </div>
                  );
                }
                return (
                  <div key={f.kunci}>
                    <label className="ui-label">{f.label}{f.wajib ? ' *' : ''}</label>
                    {f.multiline ? (
                      <textarea value={nilai} onChange={(e) => setNilai(e.target.value)} rows={3} className="ui-input" />
                    ) : (
                      <input
                        type={f.tipe === 'tanggal' ? 'date' : f.tipe === 'jam' ? 'time' : 'text'}
                        value={nilai}
                        onChange={(e) => setNilai(e.target.value)}
                        className="ui-input"
                      />
                    )}
                    <p className="text-[11px] text-slate-500 mt-1">{f.deskripsi}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pengaturan penomoran (admin) */}
          {isAdmin && (
            <div className="ui-card p-4">
              <button onClick={() => setConfigOpen((v) => !v)} className="flex items-center gap-2 font-bold text-sm text-slate-900 cursor-pointer">
                <Settings2 className="w-4 h-4 text-indigo-600" />
                {configOpen ? 'Sembunyikan' : 'Atur'} aturan penomoran sekolah
              </button>
              {configOpen && (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-slate-500">
                    Placeholder pola: <span className="font-mono">{'{no}'}</span> nomor urut, <span className="font-mono">{'{no3}'}</span> nomor 3 digit,
                    <span className="font-mono"> {'{bulan}'}</span> bulan 2 digit, <span className="font-mono">{'{bulanRomawi}'}</span> bulan Romawi,
                    <span className="font-mono"> {'{tahun}'}</span> tahun surat.
                  </p>
                  {DAFTAR_TEMPLATE_SURAT.map((t) => {
                    const c = configDraft[t.id] ?? (defaultPenomoran()[t.id] as PenomoranTemplate);
                    return (
                      <div key={t.id} className="border border-slate-200 rounded-xl p-3 space-y-2">
                        <p className="font-bold text-xs text-slate-900">{t.judul}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_130px] gap-2">
                          <input
                            value={c.pola}
                            onChange={(e) => setConfigDraft((prev) => ({ ...prev, [t.id]: { ...(prev[t.id] || defaultPenomoran()[t.id]), pola: e.target.value } }))}
                            className="ui-input font-mono"
                            aria-label={`Pola penomoran ${t.judul}`}
                          />
                          <input
                            type="number"
                            min={0}
                            value={c.nomorTerakhir}
                            onChange={(e) => setConfigDraft((prev) => ({ ...prev, [t.id]: { ...(prev[t.id] || defaultPenomoran()[t.id]), nomorTerakhir: Math.max(0, Math.floor(Number(e.target.value) || 0)) } }))}
                            className="ui-input font-mono"
                            aria-label={`Nomor terakhir ${t.judul}`}
                          />
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Contoh: <span className="font-mono">{formatNomorSurat(c.pola, saranNomorUrut(c), hariIni())}</span>
                        </p>
                      </div>
                    );
                  })}
                  <button onClick={handleSimpanConfig} className="ui-btn ui-btn-primary !py-2">Simpan aturan penomoran</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Kolom pratinjau */}
        <div className="space-y-3">
          {hilang.length > 0 ? (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-900 print:hidden">
              <p className="font-bold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Field wajib yang masih kosong ({hilang.length}):</p>
              <ul className="list-disc list-inside mt-1.5 space-y-0.5">
                {hilang.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
              <p className="mt-1.5">Ditandai <mark className="bg-amber-300 px-1 rounded font-bold">[BELUM DIISI]</mark> di pratinjau. Cetak/ekspor diblokir sampai lengkap.</p>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3 text-xs text-emerald-900 flex items-center gap-1.5 print:hidden">
              <CheckCircle2 className="w-4 h-4" /> Dokumen lengkap — siap cetak / ekspor.
            </div>
          )}

          <div className="flex flex-wrap gap-2 print:hidden">
            <button onClick={handleCetak} disabled={hilang.length > 0} className="ui-btn ui-btn-primary">
              <Printer className="w-4 h-4" /> Cetak
            </button>
            <button onClick={() => void handleExportWord()} disabled={hilang.length > 0 || exporting !== null} className="ui-btn ui-btn-outline">
              <Download className="w-4 h-4" /> {exporting === 'word' ? 'Menyiapkan…' : 'Ekspor Word (.docx)'}
            </button>
            {templateId === 'daftar-rombel' && (
              <button onClick={() => void handleExportExcel()} disabled={hilang.length > 0 || exporting !== null} className="ui-btn ui-btn-outline">
                <Download className="w-4 h-4" /> {exporting === 'excel' ? 'Menyiapkan…' : 'Ekspor Excel (.xlsx)'}
              </button>
            )}
          </div>

          {/* Lembar pratinjau = lembar yang tercetak */}
          <div className="print-sheet bg-white border border-slate-300 rounded-xl shadow-sm p-6 sm:p-8 text-slate-900">
            <KopSuratView sekolah={sekolah} />
            <div className="text-center mt-4">
              <h2 className="font-extrabold uppercase tracking-wide underline underline-offset-4 text-sm sm:text-base">
                {dok.judul}
              </h2>
            </div>
            <div className="text-xs sm:text-sm mt-4 space-y-0.5">
              {dok.nomor && (
                <p><span className="inline-block w-20">Nomor</span>: {teksDenganTanda(dok.nomor)}</p>
              )}
              <p><span className="inline-block w-20">Perihal</span>: {dok.perihal}</p>
            </div>
            {dok.kepada.length > 0 && (
              <div className="text-xs sm:text-sm mt-4 space-y-0.5">
                {dok.kepada.map((k, i) => (
                  <p key={i}>{teksDenganTanda(k)}</p>
                ))}
              </div>
            )}
            <p className="text-xs sm:text-sm mt-4 text-justify leading-relaxed">{teksDenganTanda(dok.pembuka)}</p>
            {dok.tabel && (
              <div className="overflow-x-auto mt-3">
                <table className="w-full border-collapse border border-slate-400 text-[11px] sm:text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      {dok.tabel.header.map((h) => (
                        <th key={h} className="border border-slate-300 px-2 py-1.5 text-left break-words">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dok.tabel.baris.map((r, i) => (
                      <tr key={i}>
                        {r.map((c, j) => (
                          <td key={j} className="border border-slate-300 px-2 py-1.5 break-words align-top">{teksDenganTanda(c)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {dok.paragraf.map((p, i) => (
              <p key={i} className="text-xs sm:text-sm mt-3 text-justify leading-relaxed">{teksDenganTanda(p)}</p>
            ))}
            <p className="text-xs sm:text-sm mt-3 text-justify leading-relaxed">{teksDenganTanda(dok.penutup)}</p>
            <div className="mt-8 text-xs sm:text-sm text-right break-inside-avoid">
              <p>{teksDenganTanda(dok.kotaTanggal)}</p>
              <p className="mt-1">{teksDenganTanda(dok.penandatangan.jabatan)}</p>
              <div className="h-16 flex items-end justify-end text-slate-400 italic text-[10px]">(Tanda Tangan &amp; Cap Sekolah)</div>
              <p className="font-bold underline">{dok.penandatangan.nama ? teksDenganTanda(dok.penandatangan.nama) : teksDenganTanda('')}</p>
              <p className="font-mono text-[11px]">NIP. {dok.penandatangan.nip || '—'}</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 print:hidden flex items-center gap-1">
            <Mail className="w-3.5 h-3.5" /> Pratinjau di atas adalah persis yang tercetak. Untuk PDF, pilih “Save as PDF” di dialog cetak browser.
          </p>
        </div>
      </div>
    </div>
  );
};
