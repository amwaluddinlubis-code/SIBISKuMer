// ---------------- Template Surat Word (unggah .docx) ----------------
// Tab "Template Word": administrator mengunggah dokumen Word jadi →
// placeholder {{...}} dideteksi otomatis → tiap placeholder dipetakan ke
// data siswa / sekolah / surat / isian bebas → operator memakai template:
// pilih siswa (bila perlu) → isi field bebas + nomor/tanggal → periksa
// nilai placeholder → unduh .docx yang sudah terisi.
//
// Akses: komponen hanya menerima `siswa` yang sudah dipotong hak akses
// (visibleSiswa dari App) — operator TIDAK pernah melihat siswa di luar
// rombelnya. Unggah & hapus template hanya administrator (tulis koleksi
// 'template_word' juga dikunci admin di server). Ekspor dicatat App lewat
// onEkspor (audit `dokumen_ekspor`, tanpa nama/NISN di ringkasan).
//
// Batasan jujur: tidak ada pratinjau visual persis Word di browser — yang
// ditampilkan sebelum unduh adalah tabel nilai tiap placeholder untuk
// diperiksa; pemeriksaan tampilan akhir tetap di Word setelah diunduh.
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileUp, Search, Trash2, Upload } from 'lucide-react';
import type { AppUser, PemetaanPlaceholder, SekolahProfile, Siswa, TemplateWord } from '../types';
import { getAllTemplateWords, saveTemplateWords } from '../utils/db';
import { bolehKelolaAdmin } from '../utils/akses';
import { toast } from '../utils/notify';
import {
  KUNCI_SEKOLAH,
  KUNCI_SISWA,
  KUNCI_SURAT,
  PLACEHOLDER_KOSONG,
  deteksiPlaceholderDariBase64,
  isiTemplateWord,
  nilaiPlaceholder,
  saranPemetaan,
  validasiBerkasTemplate,
} from '../utils/templateWord';
/** Info ekspor template Word untuk audit (judul = nama template saja —
 *  TANPA nama/NISN siswa, mengikuti kebijakan isi Log Audit). */
export interface InfoEksporTemplateWord {
  judul: string;
  nomor: string;
  entitasId?: string;
}

interface TemplateWordViewProps {
  /** Siswa dalam kewenangan user (sudah terfilter akses + sesi). */
  siswa: Siswa[];
  sekolah: SekolahProfile;
  currentUser: AppUser | null;
  /** Dipanggil setelah unduh berhasil — App memakainya untuk audit log. */
  onEkspor?: (info: InfoEksporTemplateWord) => void;
}

function hariIni(): string {
  return new Date().toISOString().slice(0, 10);
}

function labelSumber(peta: PemetaanPlaceholder): string {
  if (peta.sumber === 'siswa') {
    return KUNCI_SISWA.find((k) => k.kunci === peta.kunci)?.label || peta.kunci;
  }
  if (peta.sumber === 'sekolah') {
    return KUNCI_SEKOLAH.find((k) => k.kunci === peta.kunci)?.label || peta.kunci;
  }
  if (peta.sumber === 'surat') {
    return KUNCI_SURAT.find((k) => k.kunci === peta.kunci)?.label || peta.kunci;
  }
  return 'Isian bebas operator';
}

/** Sorot penanda [BELUM DIISI] seperti GeneratorDokumen. */
function teksDenganTanda(teks: string): React.ReactNode {
  const parts = teks.split(PLACEHOLDER_KOSONG);
  if (parts.length === 1) return teks;
  return (
    <>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {p}
          {i < parts.length - 1 && (
            <mark className="bg-amber-300 text-amber-950 font-bold px-1 rounded">{PLACEHOLDER_KOSONG}</mark>
          )}
        </React.Fragment>
      ))}
    </>
  );
}

export const TemplateWordView: React.FC<TemplateWordViewProps> = ({
  siswa,
  sekolah,
  currentUser,
  onEkspor,
}) => {
  const admin = bolehKelolaAdmin(currentUser);
  const [daftar, setDaftar] = useState<TemplateWord[]>([]);
  const [memuat, setMemuat] = useState(true);

  // ---- Form unggah (admin) ----
  const [namaBaru, setNamaBaru] = useState('');
  const [deskripsiBaru, setDeskripsiBaru] = useState('');
  const [butuhSiswaBaru, setButuhSiswaBaru] = useState(true);
  const [perluNomorBaru, setPerluNomorBaru] = useState(true);
  const [berkasNama, setBerkasNama] = useState('');
  const [berkasBase64, setBerkasBase64] = useState('');
  const [ukuranBita, setUkuranBita] = useState(0);
  const [terdeteksi, setTerdeteksi] = useState<string[] | null>(null);
  const [pemetaanDraft, setPemetaanDraft] = useState<Record<string, PemetaanPlaceholder>>({});
  const [galatUnggah, setGalatUnggah] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [hapusSiap, setHapusSiap] = useState<string | null>(null);

  // ---- Form pakai ----
  const [templateId, setTemplateId] = useState('');
  const [cariSiswa, setCariSiswa] = useState('');
  const [siswaId, setSiswaId] = useState('');
  const [bebas, setBebas] = useState<Record<string, string>>({});
  const [nomorSurat, setNomorSurat] = useState('');
  const [tanggalSurat, setTanggalSurat] = useState(hariIni());
  const [mengunduh, setMengunduh] = useState(false);

  const muat = async () => {
    setMemuat(true);
    try {
      setDaftar(await getAllTemplateWords());
    } catch {
      toast('Gagal memuat daftar template Word.', 'error');
    } finally {
      setMemuat(false);
    }
  };

  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const templateTerpilih = useMemo(
    () => daftar.find((t) => t.id === templateId) || null,
    [daftar, templateId],
  );

  const butuhSiswaEfektif = useMemo(() => {
    if (!templateTerpilih) return false;
    if (templateTerpilih.butuhSiswa) return true;
    return Object.values(templateTerpilih.pemetaan).some((p) => p.sumber === 'siswa');
  }, [templateTerpilih]);

  const siswaTerpilih = useMemo(
    () => siswa.find((s) => s.id === siswaId) || null,
    [siswa, siswaId],
  );

  const siswaTersaring = useMemo(() => {
    const k = cariSiswa.trim().toLowerCase();
    return siswa
      .filter(
        (s) =>
          !k ||
          s.namaLengkap.toLowerCase().includes(k) ||
          (s.nisn || '').includes(k) ||
          (s.rombelSaatIni || '').toLowerCase().includes(k),
      )
      .slice(0, 100);
  }, [siswa, cariSiswa]);

  const bebasTerpilih = useMemo(() => {
    if (!templateTerpilih) return [];
    return templateTerpilih.placeholder.filter(
      (p) => templateTerpilih.pemetaan[p]?.sumber === 'bebas',
    );
  }, [templateTerpilih]);

  const nilai = useMemo(() => {
    if (!templateTerpilih) return {};
    return nilaiPlaceholder(templateTerpilih.pemetaan, {
      siswa: siswaTerpilih,
      sekolah,
      nomorSurat,
      tanggalSurat,
      bebas,
    });
  }, [templateTerpilih, siswaTerpilih, sekolah, nomorSurat, tanggalSurat, bebas]);

  const pilihBerkas = (berkas: File | undefined) => {
    setGalatUnggah(null);
    setTerdeteksi(null);
    setPemetaanDraft({});
    setBerkasBase64('');
    if (!berkas) return;
    const galat = validasiBerkasTemplate(berkas.name, berkas.size);
    if (galat) {
      setGalatUnggah(galat);
      return;
    }
    const pembaca = new FileReader();
    pembaca.onload = () => {
      const hasil = String(pembaca.result || '');
      const base64 = hasil.includes(',') ? hasil.split(',').slice(1).join(',') : hasil;
      try {
        const temu = deteksiPlaceholderDariBase64(base64);
        setBerkasNama(berkas.name);
        setBerkasBase64(base64);
        setUkuranBita(berkas.size);
        setTerdeteksi(temu);
        const draft: Record<string, PemetaanPlaceholder> = {};
        for (const nama of temu) draft[nama] = saranPemetaan(nama);
        setPemetaanDraft(draft);
        if (!namaBaru.trim()) {
          setNamaBaru(berkas.name.replace(/\.docx$/i, '').replace(/[_-]+/g, ' '));
        }
      } catch (err) {
        setGalatUnggah(err instanceof Error ? err.message : String(err));
      }
    };
    pembaca.onerror = () => setGalatUnggah('Berkas gagal dibaca. Coba unggah ulang.');
    pembaca.readAsDataURL(berkas);
  };

  const simpanTemplate = async () => {
    if (!namaBaru.trim() || !berkasBase64 || !terdeteksi) return;
    setMenyimpan(true);
    try {
      const baru: TemplateWord = {
        id: `tw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        nama: namaBaru.trim(),
        deskripsi: deskripsiBaru.trim(),
        butuhSiswa: butuhSiswaBaru,
        perluNomor: perluNomorBaru,
        placeholder: terdeteksi,
        pemetaan: pemetaanDraft,
        berkasNama,
        berkasBase64,
        ukuranBita,
        dibuatOleh: currentUser?.username,
        dibuatPada: new Date().toISOString(),
      };
      await saveTemplateWords([...daftar, baru]);
      setDaftar([...daftar, baru]);
      setNamaBaru('');
      setDeskripsiBaru('');
      setBerkasNama('');
      setBerkasBase64('');
      setTerdeteksi(null);
      setPemetaanDraft({});
      setGalatUnggah(null);
      toast(`Template "${baru.nama}" tersimpan.`, 'success');
    } catch (err) {
      toast(`Gagal menyimpan template: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setMenyimpan(false);
    }
  };

  const hapusTemplate = async (id: string) => {
    try {
      const sisa = daftar.filter((t) => t.id !== id);
      await saveTemplateWords(sisa);
      setDaftar(sisa);
      if (templateId === id) setTemplateId('');
      setHapusSiap(null);
      toast('Template dihapus.', 'success');
    } catch (err) {
      toast(`Gagal menghapus: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const pilihTemplate = (id: string) => {
    setTemplateId(id);
    setSiswaId('');
    setBebas({});
    setNomorSurat('');
    setTanggalSurat(hariIni());
  };

  const unduh = async () => {
    if (!templateTerpilih) return;
    if (butuhSiswaEfektif && !siswaTerpilih) {
      toast('Pilih siswa dulu — template ini memakai data siswa.', 'warning');
      return;
    }
    if (templateTerpilih.perluNomor && !nomorSurat.trim()) {
      toast('Nomor surat wajib diisi (nomor tidak pernah dikarang).', 'warning');
      return;
    }
    setMengunduh(true);
    try {
      const blob = await isiTemplateWord(templateTerpilih.berkasBase64, nilai);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const aman = templateTerpilih.nama.replace(/[^a-zA-Z0-9]+/g, '_');
      a.download = `${aman}_${tanggalSurat || 'tanpa-tanggal'}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onEkspor?.({
        judul: templateTerpilih.nama,
        nomor: nomorSurat,
        entitasId: siswaTerpilih?.id,
      });
      toast(`Surat "${templateTerpilih.nama}" diunduh (.docx).`, 'success');
    } catch (err) {
      toast(`Gagal mengisi template: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setMengunduh(false);
    }
  };

  const ubahPemetaan = (nama: string, sumber: PemetaanPlaceholder['sumber']) => {
    const daftarKunci =
      sumber === 'siswa' ? KUNCI_SISWA : sumber === 'sekolah' ? KUNCI_SEKOLAH : KUNCI_SURAT;
    setPemetaanDraft((d) => ({
      ...d,
      [nama]:
        sumber === 'bebas'
          ? { sumber, kunci: nama }
          : { sumber, kunci: daftarKunci[0].kunci },
    }));
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Unggah dokumen Word (.docx) yang sudah jadi — kop, format, dan kalimat sudah ditata di Word.
        Aplikasi hanya mengisi placeholder <code className="bg-slate-100 px-1 rounded">{'{{...}}'}</code> dengan
        data nyata. Nilai kosong tampil sebagai {PLACEHOLDER_KOSONG}, tidak pernah dibiarkan bolong.
      </p>

      {admin && (
        <section className="border rounded-xl p-4 space-y-4 bg-white">
          <h3 className="font-semibold flex items-center gap-2">
            <FileUp size={18} /> Unggah template baru (administrator)
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm space-y-1 block">
              <span className="font-medium">Berkas .docx (maks 2 MB) *</span>
              <input
                type="file"
                accept=".docx"
                className="w-full text-sm"
                onChange={(e) => pilihBerkas(e.target.files?.[0])}
              />
            </label>
            <label className="text-sm space-y-1 block">
              <span className="font-medium">Nama template *</span>
              <input
                type="text"
                value={namaBaru}
                onChange={(e) => setNamaBaru(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="cth. Surat Keterangan Domisili"
              />
            </label>
            <label className="text-sm space-y-1 block sm:col-span-2">
              <span className="font-medium">Deskripsi</span>
              <input
                type="text"
                value={deskripsiBaru}
                onChange={(e) => setDeskripsiBaru(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Kegunaan surat ini"
              />
            </label>
            <label className="text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={butuhSiswaBaru}
                onChange={(e) => setButuhSiswaBaru(e.target.checked)}
              />
              Butuh 1 siswa dipilih saat memakai
            </label>
            <label className="text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={perluNomorBaru}
                onChange={(e) => setPerluNomorBaru(e.target.checked)}
              />
              Nomor surat wajib diisi operator
            </label>
          </div>
          {galatUnggah && (
            <p className="text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle size={16} /> {galatUnggah}
            </p>
          )}
          {terdeteksi && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Placeholder terdeteksi ({terdeteksi.length}): atur sumber nilainya
              </p>
              <table className="w-full border-collapse border border-slate-300 text-sm">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-2 py-1 text-left">Placeholder</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Sumber nilai</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Field</th>
                  </tr>
                </thead>
                <tbody>
                  {terdeteksi.map((nama) => {
                    const peta = pemetaanDraft[nama] || { sumber: 'bebas' as const, kunci: nama };
                    const opsi =
                      peta.sumber === 'siswa'
                        ? KUNCI_SISWA
                        : peta.sumber === 'sekolah'
                          ? KUNCI_SEKOLAH
                          : peta.sumber === 'surat'
                            ? KUNCI_SURAT
                            : [];
                    return (
                      <tr key={nama}>
                        <td className="border border-slate-300 px-2 py-1 font-mono text-xs">{`{{${nama}}}`}</td>
                        <td className="border border-slate-300 px-2 py-1">
                          <select
                            value={peta.sumber}
                            onChange={(e) =>
                              ubahPemetaan(nama, e.target.value as PemetaanPlaceholder['sumber'])
                            }
                            className="border rounded px-2 py-1 text-sm"
                          >
                            <option value="siswa">Data siswa</option>
                            <option value="sekolah">Data sekolah</option>
                            <option value="surat">Data surat</option>
                            <option value="bebas">Isian bebas operator</option>
                          </select>
                        </td>
                        <td className="border border-slate-300 px-2 py-1">
                          {peta.sumber === 'bebas' ? (
                            <span className="text-slate-500 text-xs">diisi tiap pakai</span>
                          ) : (
                            <select
                              value={peta.kunci}
                              onChange={(e) =>
                                setPemetaanDraft((d) => ({
                                  ...d,
                                  [nama]: { sumber: peta.sumber, kunci: e.target.value },
                                }))
                              }
                              className="border rounded px-2 py-1 text-sm"
                            >
                              {opsi.map((o) => (
                                <option key={o.kunci} value={o.kunci}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <button
            type="button"
            disabled={!namaBaru.trim() || !berkasBase64 || !terdeteksi || menyimpan}
            onClick={simpanTemplate}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            <Upload size={16} /> {menyimpan ? 'Menyimpan…' : 'Simpan template'}
          </button>
        </section>
      )}

      <section className="border rounded-xl p-4 space-y-4 bg-white">
        <h3 className="font-semibold">Daftar template ({daftar.length})</h3>
        {memuat ? (
          <p className="text-sm text-slate-500">Memuat…</p>
        ) : daftar.length === 0 ? (
          <p className="text-sm text-slate-500">
            Belum ada template. {admin ? 'Unggah .docx pertama lewat formulir di atas.' : 'Minta administrator mengunggah template.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {daftar.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 border rounded-lg px-3 py-2">
                <div className="text-sm">
                  <p className="font-medium">{t.nama}</p>
                  <p className="text-slate-500 text-xs">
                    {t.berkasNama} · {(t.ukuranBita / 1024).toFixed(0)} KB · {t.placeholder.length} placeholder
                    {t.deskripsi ? ` · ${t.deskripsi}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => pilihTemplate(t.id)}
                    className="text-sm bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg"
                  >
                    Pakai
                  </button>
                  {admin &&
                    (hapusSiap === t.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => hapusTemplate(t.id)}
                          className="text-sm bg-red-600 text-white px-3 py-1 rounded-lg"
                        >
                          Ya, hapus
                        </button>
                        <button
                          type="button"
                          onClick={() => setHapusSiap(null)}
                          className="text-sm border px-3 py-1 rounded-lg"
                        >
                          Batal
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setHapusSiap(t.id)}
                        className="text-sm text-red-600 flex items-center gap-1 px-2 py-1"
                        title="Hapus template"
                      >
                        <Trash2 size={15} /> Hapus
                      </button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {templateTerpilih && (
        <section className="border rounded-xl p-4 space-y-4 bg-white">
          <h3 className="font-semibold">Pakai template: {templateTerpilih.nama}</h3>
          {butuhSiswaEfektif && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Search size={16} /> Cari siswa
              </label>
              <input
                type="text"
                value={cariSiswa}
                onChange={(e) => setCariSiswa(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Nama / NISN / rombel"
              />
              <select
                value={siswaId}
                onChange={(e) => setSiswaId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">— Pilih siswa —</option>
                {siswaTersaring.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.namaLengkap} · {s.nisn || '-'} · {s.rombelSaatIni || '-'}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {templateTerpilih.perluNomor && (
              <label className="text-sm space-y-1 block">
                <span className="font-medium">Nomor surat *</span>
                <input
                  type="text"
                  value={nomorSurat}
                  onChange={(e) => setNomorSurat(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Nomor dari penomoran sekolah"
                />
              </label>
            )}
            <label className="text-sm space-y-1 block">
              <span className="font-medium">Tanggal surat</span>
              <input
                type="date"
                value={tanggalSurat}
                onChange={(e) => setTanggalSurat(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              />
            </label>
            {bebasTerpilih.map((nama) => (
              <label key={nama} className="text-sm space-y-1 block">
                <span className="font-medium">{nama}</span>
                <input
                  type="text"
                  value={bebas[nama] || ''}
                  onChange={(e) => setBebas((b) => ({ ...b, [nama]: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder={`Isi ${nama}`}
                />
              </label>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600" /> Periksa nilai sebelum unduh
              (pratinjau visual Word tidak tersedia di browser)
            </p>
            <table className="w-full border-collapse border border-slate-300 text-sm">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 px-2 py-1 text-left">Placeholder</th>
                  <th className="border border-slate-300 px-2 py-1 text-left">Sumber</th>
                  <th className="border border-slate-300 px-2 py-1 text-left">Nilai yang akan terisi</th>
                </tr>
              </thead>
              <tbody>
                {templateTerpilih.placeholder.map((nama) => (
                  <tr key={nama}>
                    <td className="border border-slate-300 px-2 py-1 font-mono text-xs">{`{{${nama}}}`}</td>
                    <td className="border border-slate-300 px-2 py-1 text-xs">
                      {labelSumber(templateTerpilih.pemetaan[nama] || { sumber: 'bebas', kunci: nama })}
                    </td>
                    <td className="border border-slate-300 px-2 py-1">{teksDenganTanda(nilai[nama] || '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            disabled={mengunduh}
            onClick={unduh}
            className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            <Download size={16} /> {mengunduh ? 'Mengisi…' : 'Unduh surat (.docx)'}
          </button>
        </section>
      )}
    </div>
  );
};
