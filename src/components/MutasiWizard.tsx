import React, { useState, useMemo } from 'react';
import { ArrowLeftRight, LogIn, LogOut, Search, X, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { Siswa, AppUser, JenjangSekolah, TingkatKelas } from '../types';
import { canUserAccessRombel } from '../utils/db';
import { getDefaultRombelOptions, getTingkatOptions } from '../utils/raportUtils';
import { tahunAjaranDariTanggal } from '../utils/tahunAjaran';
import { siswaTerlihatSesi } from '../utils/sesi';
import { toast } from '../utils/notify';

export interface DokumenMutasiKeluar {
  sekolahTujuan: string;
  tanggalKeluar: string;
  noSuratMutasi: string;
  alasanKeluar: string;
}

interface MutasiWizardProps {
  /** Daftar siswa dalam kewenangan user (sudah terfilter akses). */
  siswa: Siswa[];
  currentUser: AppUser | null;
  jenjang: JenjangSekolah;
  tahunAjaran: string;
  onApplyMasuk: (baru: Siswa) => Promise<void> | void;
  onApplyKeluar: (id: string, dokumen: DokumenMutasiKeluar) => Promise<void> | void;
  onClose: () => void;
}

type Mode = 'masuk' | 'keluar';

function hariIni(): string {
  return new Date().toISOString().slice(0, 10);
}

function idBaru(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Wizard mutasi: pindahan masuk (registrasi ringkas) & keluar (surat + status). */
export const MutasiWizard: React.FC<MutasiWizardProps> = ({
  siswa,
  currentUser,
  jenjang,
  tahunAjaran,
  onApplyMasuk,
  onApplyKeluar,
  onClose,
}) => {
  const [mode, setMode] = useState<Mode>('keluar');
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // --- Keluar ---
  const [cari, setCari] = useState('');
  const [pilihId, setPilihId] = useState('');
  const [dokKeluar, setDokKeluar] = useState<DokumenMutasiKeluar>({
    sekolahTujuan: '',
    tanggalKeluar: hariIni(),
    noSuratMutasi: '',
    alasanKeluar: 'Pindah mengikuti orang tua',
  });

  // --- Masuk ---
  const [fNama, setFnama] = useState('');
  const [fPanggilan, setFPanggilan] = useState('');
  const [fJk, setFJk] = useState<'L' | 'P'>('L');
  const [fNisn, setFNisn] = useState('');
  const [fNik, setFNik] = useState('');
  const [fTtl, setFTtl] = useState('');
  const [fTgl, setFTgl] = useState('');
  const [fAgama, setFAgama] = useState('Islam');
  const [fTingkat, setFTingkat] = useState<TingkatKelas>(jenjang === 'SD' ? '1' : '7');
  const [fRombel, setFRombel] = useState('');
  const [fAsal, setFAsal] = useState('');
  const [fTglMasuk, setFTglMasuk] = useState(hariIni());
  const [fNoSurat, setFNoSurat] = useState('');

  const kandidatKeluar = useMemo(() => {
    const k = cari.trim().toLowerCase();
    // Cutoff sesi: hanya siswa yang terlihat pada tahun wizard (sesi) yang bisa dipilih.
    return (siswa || [])
      .filter((s) => s.statusSiswa === 'Aktif' && siswaTerlihatSesi(s, tahunAjaran))
      // F11: operator hanya boleh melihat/mutasi siswa dalam rombel kewenangannya.
      .filter((s) => canUserAccessRombel(currentUser, s.rombelSaatIni))
      .filter((s) => !k || s.namaLengkap.toLowerCase().includes(k) || (s.nisn || '').includes(k) || (s.rombelSaatIni || '').toLowerCase().includes(k))
      .slice(0, 30);
  }, [siswa, cari, tahunAjaran, currentUser]);

  const siswaDipilih = useMemo(
    () => (siswa || []).find((s) => s.id === pilihId) || null,
    [siswa, pilihId]
  );

  const opsiRombel = useMemo(() => {
    const set = new Set<string>(getDefaultRombelOptions(jenjang));
    for (const s of siswa || []) {
      if (s.rombelSaatIni && siswaTerlihatSesi(s, tahunAjaran)) set.add(s.rombelSaatIni);
    }
    return [...set].sort().filter((r) => canUserAccessRombel(currentUser, r));
  }, [siswa, jenjang, currentUser, tahunAjaran]);

  const opsiTingkat = useMemo(() => getTingkatOptions(jenjang), [jenjang]);

  const gantiMode = (m: Mode) => {
    setMode(m);
    setStep(1);
  };

  // ---------- Validasi ----------
  const validasiKeluarStep1 = (): boolean => {
    if (!siswaDipilih) {
      toast('Pilih dulu siswa yang akan mutasi keluar.', 'warning');
      return false;
    }
    return true;
  };

  const validasiKeluarStep2 = (): boolean => {
    if (!dokKeluar.sekolahTujuan.trim()) {
      toast('Sekolah tujuan wajib diisi.', 'warning');
      return false;
    }
    if (!dokKeluar.tanggalKeluar) {
      toast('Tanggal keluar wajib diisi.', 'warning');
      return false;
    }
    // Mutasi keluar tercatat pada sesi aktif.
    const sesi = (tahunAjaran || '').trim();
    const taKeluar = tahunAjaranDariTanggal(dokKeluar.tanggalKeluar);
    if (sesi && taKeluar && taKeluar !== sesi) {
      toast(`Tanggal keluar (TA ${taKeluar}) di luar sesi aktif (TA ${sesi}). Pindah sesi dulu.`, 'error');
      return false;
    }
    return true;
  };

  const cekDuplikat = (field: 'nisn' | 'nik', nilai: string): boolean => {
    const v = nilai.trim();
    if (!v) return false;
    return (siswa || []).some((s) => String((s as unknown as Record<string, unknown>)[field] || '').trim() === v);
  };

  const validasiMasukStep1 = (): boolean => {
    if (!fNama.trim()) {
      toast('Nama lengkap wajib diisi.', 'warning');
      return false;
    }
    if (fNisn.trim() && !/^\d{10}$/.test(fNisn.trim())) {
      toast('NISN harus 10 digit angka.', 'error');
      return false;
    }
    if (fNisn.trim() && cekDuplikat('nisn', fNisn)) {
      toast('NISN sudah terdaftar di database ini.', 'error');
      return false;
    }
    if (fNik.trim() && !/^\d{16}$/.test(fNik.trim())) {
      toast('NIK harus 16 digit angka.', 'error');
      return false;
    }
    if (fNik.trim() && cekDuplikat('nik', fNik)) {
      toast('NIK sudah terdaftar di database ini.', 'error');
      return false;
    }
    if (!fRombel) {
      toast('Rombel tujuan wajib dipilih.', 'warning');
      return false;
    }
    return true;
  };

  const validasiMasukStep2 = (): boolean => {
    if (!fAsal.trim()) {
      toast('Sekolah asal wajib diisi.', 'warning');
      return false;
    }
    if (!fTglMasuk) {
      toast('Tanggal diterima wajib diisi.', 'warning');
      return false;
    }
    const sesi = (tahunAjaran || '').trim();
    const taMasuk = tahunAjaranDariTanggal(fTglMasuk);
    if (sesi && taMasuk && taMasuk !== sesi) {
      toast(`Tanggal diterima (TA ${taMasuk}) di luar sesi aktif (TA ${sesi}). Pindah sesi dulu.`, 'error');
      return false;
    }
    return true;
  };

  // ---------- Terapkan ----------
  const terapkanKeluar = async () => {
    if (!siswaDipilih) return;
    setSaving(true);
    try {
      await onApplyKeluar(siswaDipilih.id, {
        sekolahTujuan: dokKeluar.sekolahTujuan.trim(),
        tanggalKeluar: dokKeluar.tanggalKeluar,
        noSuratMutasi: dokKeluar.noSuratMutasi.trim(),
        alasanKeluar: dokKeluar.alasanKeluar.trim(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const bangunSiswaMasuk = (): Siswa => {
    const now = new Date().toISOString();
    const ta = /^\d{4}\/\d{4}$/.test((tahunAjaran || '').trim()) ? tahunAjaran.trim() : '2026/2027';
    const nama = fNama.trim();
    return {
      id: idBaru('sis'),
      namaLengkap: nama,
      namaPanggilan: fPanggilan.trim() || nama.split(' ')[0],
      jenisKelamin: fJk,
      nisn: fNisn.trim(),
      nipd: '',
      nik: fNik.trim(),
      noKk: '',
      noAktaLahir: '',
      tempatLahir: fTtl.trim(),
      tanggalLahir: fTgl || '2012-01-01',
      agama: fAgama as Siswa['agama'],
      kewarganegaraan: 'WNI',
      anakKe: 1,
      jumlahSaudaraKandung: 0,
      jumlahSaudaraTiri: 0,
      jumlahSaudaraAngkat: 0,
      statusDalamKeluarga: 'Anak Kandung',
      bahasaSehariHari: 'Bahasa Indonesia',
      fotoUrl: '',
      golonganDarah: '-',
      tinggiBadan: 0,
      beratBadan: 0,
      riwayatPenyakit: '',
      kelainanFisik: '',
      kebutuhanKhusus: '',
      alamat: '',
      rt: '',
      rw: '',
      dusun: '',
      kelurahan: '',
      kecamatan: '',
      kabupatenKota: '',
      provinsi: '',
      kodePos: '',
      tinggalDengan: 'Orang Tua',
      jarakKeSekolahKm: 0,
      transportasiKeSekolah: 'Jalan Kaki',
      ayah: { nama: '', nik: '', tahunLahir: '', pendidikan: '', pekerjaan: '', penghasilan: '', noTelepon: '', status: 'Masih Hidup' },
      ibu: { nama: '', nik: '', tahunLahir: '', pendidikan: '', pekerjaan: '', penghasilan: '', noTelepon: '', status: 'Masih Hidup' },
      asalSdMi: '',
      npsnSdMi: '',
      noIjazahSd: '',
      tahunLulusSd: ta.slice(0, 4),
      lamaBelajarSd: 6,
      tanggalDiterima: fTglMasuk,
      diterimaDiTingkat: fTingkat,
      diterimaDiRombel: fRombel,
      rombelSaatIni: fRombel,
      jalurMasuk: 'Mutasi/Pindahan',
      jenisPendaftaran: 'Pindahan',
      asalMutasi: fAsal.trim(),
      noSuratPenerimaan: fNoSurat.trim(),
      hobi: '',
      citaCita: '',
      p5Projects: [],
      ekstrakurikuler: [],
      prestasi: [],
      // Tahun awal mengikuti sesi aktif saat input (aturan sesi).
      riwayatSemester: [
        {
          id: `rs-mutasi-${Date.now().toString(36)}`,
          semester: '1',
          tingkat: fTingkat,
          tahunAjaran: ta,
          sakit: 0,
          izin: 0,
          alpa: 0,
          statusKenaikan: 'Belum Ditentukan',
          catatanWaliKelas: '',
        },
      ],
      statusSiswa: 'Aktif',
      createdAt: now,
      updatedAt: now,
    };
  };

  const terapkanMasuk = async () => {
    setSaving(true);
    try {
      await onApplyMasuk(bangunSiswaMasuk());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const lanjut = () => {
    if (mode === 'keluar') {
      if (step === 1 && validasiKeluarStep1()) setStep(2);
      else if (step === 2 && validasiKeluarStep2()) setStep(3);
    } else {
      if (step === 1 && validasiMasukStep1()) setStep(2);
      else if (step === 2 && validasiMasukStep2()) setStep(3);
    }
  };

  const langkah = mode === 'keluar'
    ? ['Pilih Siswa', 'Dokumen Mutasi', 'Konfirmasi']
    : ['Identitas', 'Asal & Penerimaan', 'Konfirmasi'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-indigo-600" />
            Wizard Mutasi Siswa
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500" aria-label="Tutup">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-4">
          {/* Mode */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl mb-4">
            <button
              onClick={() => gantiMode('keluar')}
              className={`py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer ${mode === 'keluar' ? 'bg-white shadow text-amber-700' : 'text-slate-500'}`}
            >
              <LogOut className="w-4 h-4" /> Mutasi Keluar
            </button>
            <button
              onClick={() => gantiMode('masuk')}
              className={`py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer ${mode === 'masuk' ? 'bg-white shadow text-emerald-700' : 'text-slate-500'}`}
            >
              <LogIn className="w-4 h-4" /> Mutasi Masuk
            </button>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-1 mb-5">
            {langkah.map((l, i) => {
              const n = i + 1;
              const aktif = step === n;
              const lewat = step > n;
              return (
                <React.Fragment key={l}>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center ${aktif ? 'bg-indigo-600 text-white' : lewat ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                      {lewat ? '✓' : n}
                    </span>
                    <span className={`text-[11px] font-semibold ${aktif ? 'text-slate-900' : 'text-slate-400'}`}>{l}</span>
                  </div>
                  {n < langkah.length && <div className="flex-1 h-px bg-slate-200 mx-1" />}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className="px-5 pb-4 space-y-3">
          {mode === 'keluar' && step === 1 && (
            <>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama / NISN / rombel…" className="ui-input !pl-9" aria-label="Cari siswa" />
              </div>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {kandidatKeluar.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500 text-center">Tidak ada siswa aktif yang cocok.</p>
                ) : (
                  kandidatKeluar.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setPilihId(s.id)}
                      className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 transition cursor-pointer ${pilihId === s.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                    >
                      <span>
                        <span className="block text-sm font-bold text-slate-900">{s.namaLengkap}</span>
                        <span className="block text-[11px] text-slate-500 font-mono">{s.nisn || '-'} • {s.rombelSaatIni || '-'}</span>
                      </span>
                      {pilihId === s.id && <CheckCircle2 className="w-5 h-5 text-indigo-600 shrink-0" />}
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {mode === 'keluar' && step === 2 && (
            <>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                Mutasi keluar: <strong>{siswaDipilih?.namaLengkap}</strong> ({siswaDipilih?.rombelSaatIni}) — status menjadi non-aktif dan tercatat di arsip.
              </div>
              <div>
                <label className="ui-label">Sekolah Tujuan *</label>
                <input value={dokKeluar.sekolahTujuan} onChange={(e) => setDokKeluar({ ...dokKeluar, sekolahTujuan: e.target.value })} placeholder="cth. SMPN 2 Kota" className="ui-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="ui-label">Tanggal Keluar *</label>
                  <input type="date" value={dokKeluar.tanggalKeluar} onChange={(e) => setDokKeluar({ ...dokKeluar, tanggalKeluar: e.target.value })} className="ui-input" />
                </div>
                <div>
                  <label className="ui-label">No. Surat Mutasi</label>
                  <input value={dokKeluar.noSuratMutasi} onChange={(e) => setDokKeluar({ ...dokKeluar, noSuratMutasi: e.target.value })} placeholder="cth. 421/123/2026" className="ui-input" />
                </div>
              </div>
              <div>
                <label className="ui-label">Alasan</label>
                <input value={dokKeluar.alasanKeluar} onChange={(e) => setDokKeluar({ ...dokKeluar, alasanKeluar: e.target.value })} placeholder="cth. Pindah mengikuti orang tua" className="ui-input" />
              </div>
            </>
          )}

          {mode === 'keluar' && step === 3 && siswaDipilih && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm space-y-1.5">
              <p><span className="text-slate-500">Siswa:</span> <strong>{siswaDipilih.namaLengkap}</strong> ({siswaDipilih.nisn || '-'} • {siswaDipilih.rombelSaatIni})</p>
              <p><span className="text-slate-500">Tujuan:</span> <strong>{dokKeluar.sekolahTujuan}</strong></p>
              <p><span className="text-slate-500">Tanggal:</span> {dokKeluar.tanggalKeluar}{dokKeluar.noSuratMutasi && <span className="text-slate-500"> • No. surat: {dokKeluar.noSuratMutasi}</span>}</p>
              <p className="text-amber-700 font-semibold pt-1">Status siswa menjadi "Mutasi Keluar" — tidak lagi muncul di roster aktif.</p>
            </div>
          )}

          {mode === 'masuk' && step === 1 && (
            <>
              <div>
                <label className="ui-label">Nama Lengkap *</label>
                <input value={fNama} onChange={(e) => setFnama(e.target.value)} placeholder="Nama sesuai akta/ijazah" className="ui-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="ui-label">Nama Panggilan</label>
                  <input value={fPanggilan} onChange={(e) => setFPanggilan(e.target.value)} className="ui-input" />
                </div>
                <div>
                  <label className="ui-label">Jenis Kelamin</label>
                  <select value={fJk} onChange={(e) => setFJk(e.target.value as 'L' | 'P')} className="ui-select">
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="ui-label">NISN (10 digit)</label>
                  <input value={fNisn} onChange={(e) => setFNisn(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10 digit" className="ui-input font-mono" inputMode="numeric" />
                </div>
                <div>
                  <label className="ui-label">NIK (16 digit)</label>
                  <input value={fNik} onChange={(e) => setFNik(e.target.value.replace(/\D/g, '').slice(0, 16))} placeholder="16 digit" className="ui-input font-mono" inputMode="numeric" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="ui-label">Tempat Lahir</label>
                  <input value={fTtl} onChange={(e) => setFTtl(e.target.value)} className="ui-input" />
                </div>
                <div>
                  <label className="ui-label">Tanggal Lahir</label>
                  <input type="date" value={fTgl} onChange={(e) => setFTgl(e.target.value)} className="ui-input" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="ui-label">Agama</label>
                  <select value={fAgama} onChange={(e) => setFAgama(e.target.value)} className="ui-select">
                    {['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu'].map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="ui-label">Tingkat *</label>
                  <select value={fTingkat} onChange={(e) => setFTingkat(e.target.value as TingkatKelas)} className="ui-select">
                    {opsiTingkat.map((t) => <option key={t} value={t}>Kelas {t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="ui-label">Rombel Tujuan *</label>
                  <select value={fRombel} onChange={(e) => setFRombel(e.target.value)} className="ui-select">
                    <option value="">— Pilih —</option>
                    {opsiRombel.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}

          {mode === 'masuk' && step === 2 && (
            <>
              <div>
                <label className="ui-label">Sekolah Asal *</label>
                <input value={fAsal} onChange={(e) => setFAsal(e.target.value)} placeholder="cth. SDN 1 Kota" className="ui-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="ui-label">Tanggal Diterima *</label>
                  <input type="date" value={fTglMasuk} onChange={(e) => setFTglMasuk(e.target.value)} className="ui-input" />
                </div>
                <div>
                  <label className="ui-label">No. Surat Penerimaan</label>
                  <input value={fNoSurat} onChange={(e) => setFNoSurat(e.target.value)} placeholder="cth. 421/456/2026" className="ui-input" />
                </div>
              </div>
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900">
                Didaftarkan sebagai <strong>Pindahan (Mutasi)</strong> • Kelas {fTingkat} • Rombel {fRombel || '—'}. Data lain dapat dilengkapi lewat form edit siswa.
              </div>
            </>
          )}

          {mode === 'masuk' && step === 3 && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm space-y-1.5">
              <p><span className="text-slate-500">Nama:</span> <strong>{fNama}</strong>{fNisn && <span className="font-mono"> • NISN {fNisn}</span>}</p>
              <p><span className="text-slate-500">Asal:</span> <strong>{fAsal}</strong> → Kelas {fTingkat} • Rombel {fRombel}</p>
              <p><span className="text-slate-500">Diterima:</span> {fTglMasuk}{fNoSurat && <span> • No. surat: {fNoSurat}</span>}</p>
            </div>
          )}
        </div>

        <div className="px-5 pb-5 pt-1 flex items-center justify-between gap-2">
          <button onClick={() => (step > 1 ? setStep(step - 1) : onClose())} className="ui-btn ui-btn-outline" disabled={saving}>
            <ChevronLeft className="w-4 h-4" /> {step > 1 ? 'Kembali' : 'Batal'}
          </button>
          {step < 3 ? (
            <button onClick={lanjut} className="ui-btn ui-btn-primary" disabled={saving}>
              Lanjut <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => void (mode === 'keluar' ? terapkanKeluar() : terapkanMasuk())}
              className={`ui-btn ${mode === 'keluar' ? 'ui-btn-danger' : 'ui-btn-primary'}`}
              disabled={saving}
            >
              <CheckCircle2 className="w-4 h-4" /> {saving ? 'Menyimpan…' : mode === 'keluar' ? 'Terapkan Mutasi Keluar' : 'Daftarkan Siswa'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
