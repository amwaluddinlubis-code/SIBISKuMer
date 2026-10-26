// ---------------- ASISTEN AI ADMINISTRASI (Issue #13) ----------------
// Tab Asisten AI: ringkasan agregat temuan, penjelasan aturan, dan draf surat.
// ATURAN TAMPILAN (bukan sekadar janji):
// - Ringkasan SELALU agregat: hitungan per aturan, tanpa nama/identitas siswa.
// - Draf SELALU bisa diedit sebelum dipakai; tidak ada tombol yang menyimpan
//   perubahan sensitif langsung dari keluaran AI (hanya "Salin draf").
// - Tombol eksternal hanya ada di mode server; server yang memutuskan apakah
//   provider terkonfigurasi — klien tidak pernah memegang API key.
// - Audit hanya mencatat metadata (mode + sumber), TIDAK PERNAH prompt/keluaran.
import React, { useMemo, useState } from 'react';
import { Sparkles, FileText, ShieldCheck, Copy, AlertTriangle, Info, Lock } from 'lucide-react';
import type { AppUser, SekolahProfile, Siswa } from '../types';
import { periksaDataSiswa } from '../utils/pemeriksaData';
import { DAFTAR_TEMPLATE_SURAT } from '../utils/suratDokumen';
import {
  ringkasanAgregat,
  susunNarasiRingkasan,
  jelaskanAturan,
  susunDrafSurat,
  PLACEHOLDER_NOMOR_SURAT,
} from '../utils/asistenAi';
import { bolehTulis } from '../utils/akses';
import { mintaAiServer } from '../utils/dataApi';
import { catatAudit } from '../utils/audit';
import { toast } from '../utils/notify';

interface AsistenAiViewProps {
  /** Daftar siswa yang SUDAH tersaring hak akses pemanggil (visibleSiswa App). */
  siswa: Siswa[];
  sekolah: SekolahProfile;
  currentUser: AppUser | null;
  pakaiServer: boolean;
}

export const AsistenAiView: React.FC<AsistenAiViewProps> = ({
  siswa,
  sekolah,
  currentUser,
  pakaiServer,
}) => {
  const tulis = bolehTulis(currentUser);

  // ---- Ringkasan agregat (dihitung lokal dari temuan pemeriksa) ----
  const temuan = useMemo(() => periksaDataSiswa(siswa || []), [siswa]);
  const agregat = useMemo(() => ringkasanAgregat(temuan), [temuan]);
  const narasiLokal = useMemo(() => susunNarasiRingkasan(agregat), [agregat]);
  const [narasiTampil, setNarasiTampil] = useState<string | null>(null);
  const [sumberNarasi, setSumberNarasi] = useState<'lokal' | 'eksternal'>('lokal');
  const [peringatanNarasi, setPeringatanNarasi] = useState<string | null>(null);
  const [memolesRingkasan, setMemolesRingkasan] = useState(false);
  const [aturanJelaskan, setAturanJelaskan] = useState<string>('');
  const penjelasan = aturanJelaskan ? jelaskanAturan(aturanJelaskan) : null;

  const polesRingkasan = async () => {
    if (!pakaiServer) return;
    setMemolesRingkasan(true);
    try {
      const hasil = await mintaAiServer({ mode: 'ringkasan', agregat });
      setNarasiTampil(hasil.teks);
      setSumberNarasi(hasil.sumber);
      setPeringatanNarasi(hasil.peringatan || null);
      catatAudit('ai_gunakan', { entitas: 'ai', ringkasan: `Asisten AI ringkasan via ${hasil.sumber}` });
    } catch (err: any) {
      toast(`Gagal memoles ringkasan: ${err?.message || 'server tidak terjangkau.'} Narasi lokal tetap dipakai.`, 'error');
    } finally {
      setMemolesRingkasan(false);
    }
  };

  // ---- Draf surat ----
  const [templateId, setTemplateId] = useState<string>(DAFTAR_TEMPLATE_SURAT[0]?.id || '');
  const template = DAFTAR_TEMPLATE_SURAT.find((t) => t.id === templateId);
  const [isian, setIsian] = useState<Record<string, string>>({});
  const [namaOpsional, setNamaOpsional] = useState('');
  const [nomorSurat, setNomorSurat] = useState('');
  const [tanggalISO, setTanggalISO] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [draf, setDraf] = useState<string | null>(null);
  const [sumberDraf, setSumberDraf] = useState<'lokal' | 'eksternal'>('lokal');
  const [peringatanDraf, setPeringatanDraf] = useState<string | null>(null);
  const [memolesDraf, setMemolesDraf] = useState(false);

  const pilihTemplate = (id: string) => {
    setTemplateId(id);
    setIsian({});
    setDraf(null);
    setPeringatanDraf(null);
  };

  const susunDrafLokal = () => {
    if (!template) return;
    try {
      const teks = susunDrafSurat(
        template.id,
        { ...isian, nama: namaOpsional, nomorSurat },
        sekolah.nama || 'Sekolah',
        tanggalISO
      );
      setDraf(teks);
      setSumberDraf('lokal');
      setPeringatanDraf(null);
      catatAudit('ai_gunakan', { entitas: 'ai', ringkasan: `Asisten AI draf ${template.id} via lokal` });
    } catch (err: any) {
      toast(err?.message || 'Draf tidak dapat disusun.', 'error');
    }
  };

  const polesDraf = async () => {
    if (!pakaiServer || !template) return;
    setMemolesDraf(true);
    try {
      // Nama ikut terkirim HANYA sebagai field lokal; server menggantinya
      // dengan placeholder sebelum apa pun diteruskan ke provider.
      const hasil = await mintaAiServer({
        mode: 'draf',
        templateId: template.id,
        isian: { ...isian, nama: namaOpsional, nomorSurat },
        namaSekolah: sekolah.nama || 'Sekolah',
        tanggalISO,
      });
      setDraf(hasil.teks);
      setSumberDraf(hasil.sumber);
      setPeringatanDraf(hasil.peringatan || null);
      catatAudit('ai_gunakan', { entitas: 'ai', ringkasan: `Asisten AI draf ${template.id} via ${hasil.sumber}` });
    } catch (err: any) {
      toast(`Gagal memoles draf: ${err?.message || 'server tidak terjangkau.'} Draf lokal tetap dipakai.`, 'error');
    } finally {
      setMemolesDraf(false);
    }
  };

  const salinDraf = async () => {
    if (!draf) return;
    try {
      await navigator.clipboard.writeText(draf);
      toast('Draf disalin. Tempel ke Generator Dokumen dan tinjau sebelum dipakai.', 'success');
    } catch {
      toast('Gagal menyalin otomatis — blok teks draf dan salin manual.', 'warning');
    }
  };

  return (
    <div className="space-y-5">
      {/* Privasi & batasan */}
      <div className="ui-card p-4 flex gap-3">
        <Lock className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-600 leading-relaxed">
          <p className="font-bold text-slate-900 text-sm mb-1 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-700" /> Asisten AI — bantu, bukan putuskan
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>AI <strong>tidak pernah</strong> menjadi sumber data resmi dan tidak membuat keputusan administratif final.</li>
            <li>Ringkasan selalu <strong>agregat</strong> (hitungan saja) — tanpa nama, NISN, NIK, atau identitas siswa.</li>
            <li>Ke layanan eksternal (bila dikonfigurasi admin server) hanya pergi data agregat / draf teredaksi. Nama siswa tidak pernah dikirim.</li>
            <li>Nomor surat <strong>tidak pernah dikarang</strong> — draf memakai placeholder sampai operator mengisinya.</li>
            <li>Semua keluaran adalah <strong>draf</strong>: tinjau, ubah, dan setujui sendiri sebelum dipakai. Tidak ada yang tersimpan otomatis.</li>
          </ul>
        </div>
      </div>

      {/* Ringkasan agregat */}
      <div className="ui-card p-4 space-y-3">
        <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-700" /> Ringkasan temuan kelengkapan data
        </h3>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-full bg-slate-100 font-bold">{agregat.totalTemuan} temuan</span>
          <span className="px-2.5 py-1 rounded-full bg-slate-100 font-bold">{agregat.totalSiswaTerdampak} siswa terdampak</span>
          {Object.entries(agregat.perKategori).map(([k, v]) => (
            <span key={k} className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 font-semibold">{k}: {v}</span>
          ))}
          {Object.entries(agregat.perPrioritas).map(([k, v]) => (
            <span key={k} className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 font-semibold">prioritas {k}: {v}</span>
          ))}
        </div>
        <textarea
          readOnly
          value={narasiTampil ?? narasiLokal}
          rows={6}
          className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl leading-relaxed"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold px-2 py-1 rounded bg-violet-100 text-violet-800">
            {sumberNarasi === 'eksternal' ? 'Dipoles provider eksternal' : 'Disusun lokal'}
          </span>
          {pakaiServer ? (
            <button
              type="button"
              onClick={polesRingkasan}
              disabled={memolesRingkasan}
              className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition cursor-pointer"
            >
              {memolesRingkasan ? 'Memoles…' : 'Poles dengan provider eksternal'}
            </button>
          ) : (
            <span className="text-[11px] text-slate-500">Provider eksternal hanya tersedia di mode server.</span>
          )}
        </div>
        {peringatanNarasi && (
          <p className="text-[11px] text-amber-700 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {peringatanNarasi}
          </p>
        )}

        {/* Jelaskan aturan */}
        <div className="pt-2 border-t border-slate-100">
          <label className="block text-xs font-semibold text-slate-700 mb-1">Jelaskan aturan temuan</label>
          <select
            value={aturanJelaskan}
            onChange={(e) => setAturanJelaskan(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl"
          >
            <option value="">— Pilih aturan —</option>
            {agregat.aturanTeratas.map((a) => (
              <option key={a.aturanId} value={a.aturanId}>
                {a.judul} ({a.jumlah} temuan)
              </option>
            ))}
          </select>
          {penjelasan && (
            <div className="mt-2 text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="font-bold text-slate-900">{penjelasan.judul} <span className="font-normal text-slate-500">({penjelasan.aturanId} · {penjelasan.kategori} · prioritas {penjelasan.prioritas})</span></p>
              <p className="mt-1">{penjelasan.penjelasan}</p>
              <p className="mt-2 font-semibold text-slate-800">Langkah tindak lanjut:</p>
              <ul className="list-disc list-inside">
                {penjelasan.langkah.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Draf surat */}
      <div className="ui-card p-4 space-y-3">
        <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-700" /> Draf surat dari template
        </h3>
        {!tulis ? (
          <p className="text-xs text-slate-500 flex items-start gap-1.5">
            <Info className="w-4 h-4 shrink-0" /> Peran pimpinan hanya dapat membaca: ringkasan di atas bisa dibaca, tetapi draf surat hanya dapat disusun operator, wali kelas, dan administrator.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Template surat</label>
                <select
                  value={templateId}
                  onChange={(e) => pilihTemplate(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl"
                >
                  {DAFTAR_TEMPLATE_SURAT.map((t) => (
                    <option key={t.id} value={t.id}>{t.judul}</option>
                  ))}
                </select>
                {template && <p className="text-[11px] text-slate-500 mt-1">{template.deskripsi}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal draf</label>
                <input
                  type="date"
                  value={tanggalISO}
                  onChange={(e) => setTanggalISO(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama pemohon (opsional, hanya dipakai lokal)</label>
                <input
                  type="text"
                  value={namaOpsional}
                  onChange={(e) => setNamaOpsional(e.target.value)}
                  placeholder="Kosongkan = placeholder"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor surat (opsional — kosong = placeholder)</label>
                <input
                  type="text"
                  value={nomorSurat}
                  onChange={(e) => setNomorSurat(e.target.value)}
                  placeholder={PLACEHOLDER_NOMOR_SURAT}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>
            </div>
            {template?.field.map((f) => (
              <div key={f.kunci}>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {f.label} {f.wajib && <span className="text-rose-500">*</span>}
                </label>
                {f.multiline ? (
                  <textarea
                    rows={2}
                    value={isian[f.kunci] || ''}
                    onChange={(e) => setIsian({ ...isian, [f.kunci]: e.target.value })}
                    placeholder={f.deskripsi}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl"
                  />
                ) : (
                  <input
                    type={f.tipe === 'tanggal' ? 'date' : f.tipe === 'jam' ? 'time' : 'text'}
                    value={isian[f.kunci] || ''}
                    onChange={(e) => setIsian({ ...isian, [f.kunci]: e.target.value })}
                    placeholder={f.deskripsi}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl"
                  />
                )}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={susunDrafLokal}
                className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold rounded-lg transition cursor-pointer"
              >
                Susun draf (lokal)
              </button>
              {pakaiServer && (
                <button
                  type="button"
                  onClick={polesDraf}
                  disabled={memolesDraf || !draf}
                  className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                >
                  {memolesDraf ? 'Memoles…' : 'Poles eksternal (teredaksi)'}
                </button>
              )}
              {draf && (
                <button
                  type="button"
                  onClick={salinDraf}
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" /> Salin draf
                </button>
              )}
            </div>
            {peringatanDraf && (
              <p className="text-[11px] text-amber-700 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {peringatanDraf}
              </p>
            )}
            {draf && (
              <>
                <textarea
                  value={draf}
                  onChange={(e) => setDraf(e.target.value)}
                  rows={12}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl leading-relaxed"
                />
                <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                  Draf {sumberDraf === 'eksternal' ? 'dipoles provider eksternal dari versi teredaksi' : 'disusun lokal dari template'}.
                  Tinjau dan ubah seperlunya, lengkapi nomor surat bila masih placeholder, lalu salin ke Generator Dokumen. Draf ini tidak tersimpan otomatis.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
