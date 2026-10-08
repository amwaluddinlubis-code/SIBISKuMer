import React, { useState, useEffect } from 'react';
import { X, Save, User, Heart, Home, Users, School, Sparkles, BookOpen, AlertCircle, Plus, Trash2, Award, Calendar, GraduationCap, Check, ChevronLeft, ChevronRight, Eraser, Lock } from 'lucide-react';
import { Siswa, JenisKelamin, Agama, TingkatKelas, JalurMasuk, StatusSiswa, PredikatP5, JenjangSekolah, RiwayatTahunAjaran, StatusKenaikanKelas } from '../types';
import { validateIdentitasSiswa, FieldIssue } from '../utils/validation';
import { getRaportList, getNilaiList } from '../utils/raportUtils';
import { toast } from '../utils/notify';
import { KodeSelect } from './KodeSelect';
import {
  AGAMA_OPTIONS,
  TINGGAL_OPTIONS,
  TRANSPORTASI_OPTIONS,
  PENDIDIKAN_OPTIONS,
  PEKERJAAN_OPTIONS,
  PENGHASILAN_OPTIONS,
  JENIS_PENDAFTARAN_OPTIONS,
  HOBI_OPTIONS,
  CITACITA_OPTIONS,
  AGAMA_LEGACY,
  TRANSPORTASI_LEGACY,
  PENGHASILAN_LEGACY,
  PEKERJAAN_LEGACY,
  normalisasiNilai,
} from '../data/referensi';

/** Samakan nilai lama (teks bebas/duplikat ejaan) ke tabel kode saat form dibuka. */
function normalisasiReferensiSiswa(s: Siswa): Siswa {
  const ortu = (o: Siswa['ayah']): Siswa['ayah'] => ({
    ...o,
    pendidikan: normalisasiNilai(PENDIDIKAN_OPTIONS, o.pendidikan),
    pekerjaan: normalisasiNilai(PEKERJAAN_OPTIONS, o.pekerjaan, PEKERJAAN_LEGACY),
    penghasilan: normalisasiNilai(PENGHASILAN_OPTIONS, o.penghasilan, PENGHASILAN_LEGACY),
  });
  return {
    ...s,
    agama: normalisasiNilai(AGAMA_OPTIONS, s.agama, AGAMA_LEGACY) as Siswa['agama'],
    tinggalDengan: normalisasiNilai(TINGGAL_OPTIONS, s.tinggalDengan) as Siswa['tinggalDengan'],
    transportasiKeSekolah: normalisasiNilai(
      TRANSPORTASI_OPTIONS, s.transportasiKeSekolah, TRANSPORTASI_LEGACY
    ) as Siswa['transportasiKeSekolah'],
    ayah: ortu(s.ayah),
    ibu: ortu(s.ibu),
    jenisPendaftaran: (s.jenisPendaftaran as Siswa['jenisPendaftaran']) || 'Siswa Baru',
    hobi: s.hobi || '',
    citaCita: s.citaCita || '',
  };
}

type SectionId = 'identitas' | 'fisik-domisili' | 'ortu' | 'sekolah' | 'merdeka' | 'semester' | 'raport-riwayat';

interface WizardStep {
  id: SectionId;
  label: string;
  desc: string;
  icon: typeof User;
}

const DRAFT_KEY = 'bukuinduk_draft_siswa_v1';

function loadDraft(): Partial<Siswa> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.namaLengkap !== undefined) return parsed;
    return null;
  } catch {
    return null;
  }
}

interface SiswaFormModalProps {
  initialData?: Siswa | null;
  jenjang?: JenjangSekolah;
  existingSiswa?: Siswa[];
  /** Tahun ajaran berjalan (default baris riwayat/P5 baru). */
  tahunAjaran?: string;
  onSave: (siswa: Siswa) => Promise<void>;
  onClose: () => void;
}

export const SiswaFormModal: React.FC<SiswaFormModalProps> = ({
  initialData,
  jenjang = 'SMP',
  existingSiswa = [],
  tahunAjaran,
  onSave,
  onClose
}) => {
  const isEdit = !!initialData;
  // ----- Kunci field tetap Dapodik (Tahap 2J) -----
  // Sumber data wajib Dapodik: 10 identitas pokok menjadi readonly saat Edit.
  // Bila nilai lama masih kosong (data legacy), izinkan isi satu kali;
  // setelah terisi, pengubahan hanya via Sinkron Dapodik.
  const kunciNilai = (v: unknown) => isEdit && String(v ?? '').trim() !== '';
  const clsKunci = (locked: boolean) =>
    locked ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : '';
  const [activeSection, setActiveSection] = useState<SectionId>('identitas');
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [visited, setVisited] = useState<SectionId[]>(['identitas']);
  const [draftRestored, setDraftRestored] = useState(false);

  const STEPS: WizardStep[] = [
    { id: 'identitas', label: 'Identitas', desc: 'Nama, NISN & NIPD', icon: User },
    { id: 'fisik-domisili', label: 'Fisik & Domisili', desc: 'Kesehatan & alamat', icon: Heart },
    { id: 'ortu', label: 'Orang Tua', desc: 'Ayah, ibu & wali', icon: Users },
    { id: 'sekolah', label: jenjang === 'SD' ? 'TK & Masuk SD' : 'SD & Masuk SMP', desc: 'Asal & penerimaan', icon: School },
    { id: 'merdeka', label: 'P5 & Prestasi', desc: 'Projek, ekskul & lomba', icon: Sparkles },
    { id: 'semester', label: 'Keaktifan', desc: 'Rombel & status', icon: BookOpen },
    { id: 'raport-riwayat', label: 'Riwayat TA', desc: 'Tahun ajaran lalu', icon: Award },
  ];
  const stepIndex = Math.max(0, STEPS.findIndex((s) => s.id === activeSection));
  const isLastStep = stepIndex === STEPS.length - 1;

  const goStep = (id: SectionId) => {
    setActiveSection(id);
    setVisited((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  // Form State initialized from initialData or new template
  const [formData, setFormData] = useState<Siswa>(() => {
    if (initialData) return normalisasiReferensiSiswa({ ...initialData });
    // Tahun berjalan untuk baris default (P5/riwayat) — dari profil sekolah.
    const taBerjalan = /^\d{4}\/\d{4}$/.test((tahunAjaran || '').trim()) ? tahunAjaran!.trim() : '2026/2027';
    const tahunMulai = taBerjalan.slice(0, 4);
    const now = new Date().toISOString();
    const isSD = jenjang === 'SD';
    const defTingkat: TingkatKelas = isSD ? '1' : '7';
    const defRombel = isSD ? '1A' : '7A';
    const defFase = isSD ? 'Fase A' : 'Fase D';
    return {
      id: `sis-${Date.now()}`,
      namaLengkap: '',
      namaPanggilan: '',
      jenisKelamin: 'L',
      nisn: '',
      nipd: '',
      nik: '',
      noKk: '',
      noAktaLahir: '',
      tempatLahir: '',
      tanggalLahir: '2011-01-01',
      agama: 'Islam',
      kewarganegaraan: 'WNI',
      anakKe: 1,
      jumlahSaudaraKandung: 0,
      jumlahSaudaraTiri: 0,
      jumlahSaudaraAngkat: 0,
      statusDalamKeluarga: 'Anak Kandung',
      bahasaSehariHari: 'Bahasa Indonesia',
      fotoUrl: '',
      golonganDarah: '-',
      tinggiBadan: 155,
      beratBadan: 45,
      riwayatPenyakit: 'Tidak ada',
      kelainanFisik: 'Tidak ada',
      kebutuhanKhusus: 'Tidak ada',
      alamat: '',
      rt: '01',
      rw: '01',
      dusun: '',
      kelurahan: '',
      kecamatan: '',
      kabupatenKota: '',
      provinsi: '',
      kodePos: '',
      tinggalDengan: 'Orang Tua',
      jarakKeSekolahKm: 1.0,
      transportasiKeSekolah: 'Jalan Kaki',
      ayah: {
        nama: '',
        nik: '',
        tahunLahir: '1975',
        pendidikan: 'SMA / sederajat',
        pekerjaan: 'Wiraswasta',
        penghasilan: 'Rp. 2,000,000 - Rp. 4,999,999',
        noTelepon: '',
        status: 'Masih Hidup'
      },
      ibu: {
        nama: '',
        nik: '',
        tahunLahir: '1978',
        pendidikan: 'SMA / sederajat',
        pekerjaan: 'Lainnya',
        penghasilan: 'Tidak Berpenghasilan',
        noTelepon: '',
        status: 'Masih Hidup'
      },
      asalSdMi: '',
      npsnSdMi: '',
      noIjazahSd: '',
      tahunLulusSd: tahunMulai,
      lamaBelajarSd: 6,
      tanggalDiterima: `${tahunMulai}-07-15`,
      diterimaDiTingkat: defTingkat,
      diterimaDiRombel: defRombel,
      rombelSaatIni: defRombel,
      jalurMasuk: 'Zonasi',
      jenisPendaftaran: 'Siswa Baru',
      hobi: '',
      citaCita: '',
      p5Projects: [
        {
          id: `p5-init-${Date.now()}`,
          tema: 'Gaya Hidup Berkelanjutan',
          judulProjek: 'Pengurangan Jejak Karbon dan Kebersihan Lingkungan Sekolah',
          fase: defFase,
          tingkat: defTingkat,
          semester: '1',
          tahunAjaran: taBerjalan,
          dimensi: {
            berimanBertakwa: 'Berkembang Sesuai Harapan',
            berkebinekaanGlobal: 'Berkembang Sesuai Harapan',
            bergotongRoyong: 'Sangat Berkembang',
            mandiri: 'Berkembang Sesuai Harapan',
            bernalarKritis: 'Berkembang Sesuai Harapan',
            kreatif: 'Berkembang Sesuai Harapan'
          },
          catatanProses: 'Aktif berkolaborasi dalam kelompok kerja projek P5.'
        }
      ],
      ekstrakurikuler: [
        {
          id: `ek-init-${Date.now()}`,
          nama: isSD ? 'Pramuka Siaga (Wajib)' : 'Pramuka Penggalang (Wajib)',
          keterangan: 'Mengikuti latihan rutin pramuka',
          predikat: 'Baik',
          tingkat: defTingkat
        }
      ],
      prestasi: [],
      riwayatSemester: [
        {
          id: `rs-init-${Date.now()}`,
          semester: '1',
          tingkat: defTingkat,
          tahunAjaran: taBerjalan,
          sakit: 0,
          izin: 0,
          alpa: 0,
          statusKenaikan: 'Belum Ditentukan',
          catatanWaliKelas: 'Menunjukkan kesungguhan belajar di kelas.'
        }
      ],
      statusSiswa: 'Aktif',
      createdAt: now,
      updatedAt: now
    };
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const issues: FieldIssue[] = validateIdentitasSiswa(
      {
        id: formData.id,
        namaLengkap: formData.namaLengkap,
        nisn: formData.nisn,
        nik: formData.nik,
        nipd: formData.nipd,
        noKk: formData.noKk,
      },
      existingSiswa
    );
    if (issues.length > 0) {
      const mapped: Record<string, string> = {};
      for (const i of issues) mapped[i.field] = i.message;
      setFieldErrors(mapped);
      setActiveSection('identitas');
      toast(issues[0].message, 'error');
      return;
    }
    setFieldErrors({});

    setSaving(true);
    try {
      await onSave({
        ...formData,
        namaLengkap: formData.namaLengkap.trim().toUpperCase(),
        updatedAt: new Date().toISOString()
      });
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch { /* abaikan */ }
      toast(`Data "${formData.namaLengkap.trim()}" berhasil disimpan.`, 'success');
      onClose();
    } catch (err: any) {
      toast(`Gagal menyimpan data siswa: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Muat draft tersimpan (pendaftaran baru saja) + simpan otomatis tiap perubahan
  useEffect(() => {
    if (!initialData) {
      const d = loadDraft();
      if (d) {
        setFormData((prev) => ({ ...prev, ...d, id: prev.id }));
        setDraftRestored(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isEdit) return;
    const t = window.setTimeout(() => {
      try {
        const { fotoUrl: _foto, ...rest } = formData;
        void _foto;
        localStorage.setItem(DRAFT_KEY, JSON.stringify(rest));
      } catch { /* kuota penuh / storage tidak tersedia — abaikan */ }
    }, 800);
    return () => window.clearTimeout(t);
  }, [formData, isEdit]);

  const discardDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch { /* abaikan */ }
    setDraftRestored(false);
    toast('Draft tersimpan dibuang. Pendaftaran baru berikutnya mulai kosong.', 'info');
  };

  /** Lanjut ke langkah berikut; identitas wajib valid sebelum lanjut. */
  const handleNext = () => {
    if (activeSection === 'identitas') {
      const issues = validateIdentitasSiswa(
        {
          id: formData.id,
          namaLengkap: formData.namaLengkap,
          nisn: formData.nisn,
          nik: formData.nik,
          nipd: formData.nipd,
          noKk: formData.noKk,
        },
        existingSiswa
      );
      if (issues.length > 0) {
        const mapped: Record<string, string> = {};
        for (const i of issues) mapped[i.field] = i.message;
        setFieldErrors(mapped);
        toast(issues[0].message, 'error');
        return;
      }
      setFieldErrors({});
    }
    const next = STEPS[Math.min(stepIndex + 1, STEPS.length - 1)];
    if (next) goStep(next.id);
  };

  const handleBack = () => {
    const prev = STEPS[Math.max(stepIndex - 1, 0)];
    if (prev) goStep(prev.id);
  };

  const handleAddPrestasi = () => {
    const taBerjalan = /^\d{4}\/\d{4}$/.test((tahunAjaran || '').trim()) ? tahunAjaran!.trim() : '2026/2027';
    setFormData({
      ...formData,
      prestasi: [
        ...formData.prestasi,
        {
          id: `pr-${Date.now()}`,
          namaLomba: '',
          bidang: 'Akademik',
          tingkat: 'Sekolah',
          peringkat: 'Juara 1',
          tahun: taBerjalan.slice(0, 4),
          penyelenggara: ''
        }
      ]
    });
  };

  const handleRemovePrestasi = (idx: number) => {
    const list = [...formData.prestasi];
    list.splice(idx, 1);
    setFormData({ ...formData, prestasi: list });
  };

  const handleAddRiwayatTA = () => {
    const existing = formData.riwayatTahunAjaran || [];
    const taBerjalan = /^\d{4}\/\d{4}$/.test((tahunAjaran || '').trim()) ? tahunAjaran!.trim() : '2026/2027';
    const newEntry: RiwayatTahunAjaran = {
      id: `rta-${Date.now()}`,
      tahunAjaran: taBerjalan,
      tingkat: jenjang === 'SD' ? '1' : '7',
      rombel: formData.rombelSaatIni || (jenjang === 'SD' ? '1A' : '7A'),
      statusKenaikan: 'Naik Kelas',
      waliKelas: '',
      catatan: 'Menuntaskan seluruh capaian pembelajaran dengan baik.'
    };
    setFormData({
      ...formData,
      riwayatTahunAjaran: [...existing, newEntry]
    });
  };

  const handleRemoveRiwayatTA = (idx: number) => {
    const existing = [...(formData.riwayatTahunAjaran || [])];
    existing.splice(idx, 1);
    setFormData({ ...formData, riwayatTahunAjaran: existing });
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden text-xs anim-scale-in">
        {/* Header Modal */}
        <div className="relative overflow-hidden bg-gradient-to-r from-navy-800 via-navy-900 to-[#0b1e4b] text-white px-5 py-4 shrink-0">
          <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-gold-500 via-gold-300 to-gold-500" />
          <div className="absolute -right-10 -top-14 w-48 h-48 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
                <GraduationCap className="w-5 h-5 text-gold-300" />
              </div>
              <div className="min-w-0">
                <h3 className="font-extrabold text-sm sm:text-base tracking-tight truncate">
                  {isEdit ? `Edit: ${initialData?.namaLengkap}` : `Siswa Baru — Buku Induk ${jenjang}`}
                </h3>
                <p className="text-[11px] text-slate-300">
                  Langkah {stepIndex + 1} dari {STEPS.length}: <strong className="text-gold-300">{STEPS[stepIndex]?.label}</strong>
                  {' '}• {jenjang === 'SD' ? 'Fase A/B/C' : 'Fase D'} Kurikulum Merdeka
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!isEdit && (
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-[10px] font-bold text-slate-200" title="Perubahan tersimpan otomatis di perangkat ini">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {draftRestored ? 'Draft dipulihkan' : 'Draft otomatis'}
                </span>
              )}
              {!isEdit && draftRestored && (
                <button
                  type="button"
                  onClick={discardDraft}
                  title="Buang draft tersimpan"
                  className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                >
                  <Eraser className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                aria-label="Tutup formulir"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          {/* Bilah kemajuan */}
          <div className="relative mt-3 h-1.5 rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300 transition-all duration-300"
              style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Navigasi langkah wizard */}
        <div className="bg-slate-50/80 border-b border-slate-200 px-3 sm:px-4 py-2.5 shrink-0 overflow-x-auto">
          <ol className="flex items-center gap-1.5 min-w-max">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              const done = idx < stepIndex || (visited.includes(step.id) && idx !== stepIndex);
              const current = idx === stepIndex;
              return (
                <li key={step.id} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => goStep(step.id)}
                    title={`${step.label} — ${step.desc}`}
                    className={`flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer ${
                      current
                        ? 'bg-navy-900 text-white shadow-md'
                        : done
                          ? 'text-emerald-800 hover:bg-emerald-50'
                          : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-extrabold shrink-0 ${
                      current
                        ? 'bg-gold-400 text-navy-950'
                        : done
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-200 text-slate-500'
                    }`}>
                      {done && !current ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                    </span>
                    <span className="text-left leading-tight">
                      <span className="block text-xs">{step.label}</span>
                      <span className={`hidden lg:block text-[10px] font-semibold ${current ? 'text-slate-300' : 'text-slate-400'}`}>
                        {step.desc}
                      </span>
                    </span>
                    <Icon className={`w-3.5 h-3.5 hidden sm:block ${current ? 'text-gold-300' : ''}`} />
                  </button>
                  {idx < STEPS.length - 1 && <span className="w-3 h-px bg-slate-300 shrink-0" />}
                </li>
              );
            })}
          </ol>
        </div>

        {/* Form Body Scrollable */}
        <form onSubmit={handleSubmit} key={activeSection} className="p-5 overflow-y-auto space-y-4 flex-1 anim-fade-up">
          {/* SECTION 1: IDENTITAS */}
          {activeSection === 'identitas' && (
            <div className="space-y-4">
              {isEdit && (
                <p className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-800">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  Field identitas pokok (NISN, NIPD, NIK, KK, Akta, TTL, Jenis Kelamin) terkunci Dapodik — perubahan hanya via menu Sinkron Dapodik.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nama Lengkap Siswa *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.namaLengkap}
                    onChange={(e) => setFormData({ ...formData, namaLengkap: e.target.value })}
                    placeholder="Contoh: MUHAMMAD RIZKY PRATAMA"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg uppercase focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                    {fieldErrors.namaLengkap && (
                      <p className="mt-1 text-[11px] font-medium text-rose-600">{fieldErrors.namaLengkap}</p>
                    )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nama Panggilan
                  </label>
                  <input
                    type="text"
                    value={formData.namaPanggilan}
                    onChange={(e) => setFormData({ ...formData, namaPanggilan: e.target.value })}
                    placeholder="Contoh: Rizky"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Jenis Kelamin *
                  </label>
                  <select
                    value={formData.jenisKelamin}
                    disabled={isEdit}
                    title={isEdit ? 'Terkunci Dapodik' : undefined}
                    onChange={(e) => setFormData({ ...formData, jenisKelamin: e.target.value as JenisKelamin })}
                    className={`w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none ${clsKunci(isEdit)}`}
                  >
                    <option value="L">Laki-laki (L)</option>
                    <option value="P">Perempuan (P)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    NISN (10 Digit) * <span title="Terkunci Dapodik">🔒</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={formData.nisn}
                    readOnly={kunciNilai(initialData?.nisn)}
                    title={kunciNilai(initialData?.nisn) ? 'Terkunci Dapodik — ubah via Sinkron Dapodik' : undefined}
                    onChange={(e) => setFormData({ ...formData, nisn: e.target.value })}
                    placeholder="Contoh: 0091234567"
                      className={`w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none ${clsKunci(kunciNilai(initialData?.nisn))}`}
                    />
                    {fieldErrors.nisn && (
                      <p className="mt-1 text-[11px] font-medium text-rose-600">{fieldErrors.nisn}</p>
                    )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    No. Induk / NIPD <span title="Terkunci Dapodik">🔒</span>
                  </label>
                  <input
                    type="text"
                    value={formData.nipd}
                    readOnly={kunciNilai(initialData?.nipd)}
                    title={kunciNilai(initialData?.nipd) ? 'Terkunci Dapodik — ubah via Sinkron Dapodik' : undefined}
                    onChange={(e) => setFormData({ ...formData, nipd: e.target.value })}
                    placeholder="Contoh: 242507001"
                      className={`w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none ${clsKunci(kunciNilai(initialData?.nipd))}`}
                    />
                    {fieldErrors.nipd && (
                      <p className="mt-1 text-[11px] font-medium text-rose-600">{fieldErrors.nipd}</p>
                    )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Agama & Kepercayaan
                  </label>
                  <KodeSelect
                    value={formData.agama}
                    options={AGAMA_OPTIONS}
                    ariaLabel="Agama dan kepercayaan"
                    onChange={(v) => setFormData({ ...formData, agama: v as Agama })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    NIK / No. KTP Siswa <span title="Terkunci Dapodik">🔒</span>
                  </label>
                  <input
                    type="text"
                    maxLength={16}
                    value={formData.nik}
                    readOnly={kunciNilai(initialData?.nik)}
                    title={kunciNilai(initialData?.nik) ? 'Terkunci Dapodik — ubah via Sinkron Dapodik' : undefined}
                    onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
                    placeholder="16 digit NIK"
                    className={`w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none ${clsKunci(kunciNilai(initialData?.nik))}`}
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    No. Kartu Keluarga (KK) <span title="Terkunci Dapodik">🔒</span>
                  </label>
                  <input
                    type="text"
                    maxLength={16}
                    value={formData.noKk}
                    readOnly={kunciNilai(initialData?.noKk)}
                    title={kunciNilai(initialData?.noKk) ? 'Terkunci Dapodik — ubah via Sinkron Dapodik' : undefined}
                    onChange={(e) => setFormData({ ...formData, noKk: e.target.value })}
                    placeholder="16 digit No. KK"
                    className={`w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none ${clsKunci(kunciNilai(initialData?.noKk))}`}
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    No. Registrasi Akta Lahir <span title="Terkunci Dapodik">🔒</span>
                  </label>
                  <input
                    type="text"
                    value={formData.noAktaLahir}
                    readOnly={kunciNilai(initialData?.noAktaLahir)}
                    title={kunciNilai(initialData?.noAktaLahir) ? 'Terkunci Dapodik — ubah via Sinkron Dapodik' : undefined}
                    onChange={(e) => setFormData({ ...formData, noAktaLahir: e.target.value })}
                    placeholder="Contoh: 3201-LT-15042009-0012"
                    className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none ${clsKunci(kunciNilai(initialData?.noAktaLahir))}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tempat Lahir <span title="Terkunci Dapodik">🔒</span>
                  </label>
                  <input
                    type="text"
                    value={formData.tempatLahir}
                    readOnly={kunciNilai(initialData?.tempatLahir)}
                    title={kunciNilai(initialData?.tempatLahir) ? 'Terkunci Dapodik — ubah via Sinkron Dapodik' : undefined}
                    onChange={(e) => setFormData({ ...formData, tempatLahir: e.target.value })}
                    placeholder="Contoh: Bandung"
                    className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none ${clsKunci(kunciNilai(initialData?.tempatLahir))}`}
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tanggal Lahir <span title="Terkunci Dapodik">🔒</span>
                  </label>
                  <input
                    type="date"
                    value={formData.tanggalLahir}
                    disabled={kunciNilai(initialData?.tanggalLahir)}
                    title={kunciNilai(initialData?.tanggalLahir) ? 'Terkunci Dapodik — ubah via Sinkron Dapodik' : undefined}
                    onChange={(e) => setFormData({ ...formData, tanggalLahir: e.target.value })}
                    className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none ${clsKunci(kunciNilai(initialData?.tanggalLahir))}`}
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Kewarganegaraan
                  </label>
                  <select
                    value={formData.kewarganegaraan}
                    onChange={(e) => setFormData({ ...formData, kewarganegaraan: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="WNI">WNI (Indonesia)</option>
                    <option value="WNA">WNA (Asing)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Anak Ke-
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={formData.anakKe}
                    onChange={(e) => setFormData({ ...formData, anakKe: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Jml Saudara Kandung
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData.jumlahSaudaraKandung}
                    onChange={(e) => setFormData({ ...formData, jumlahSaudaraKandung: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Status dalam Keluarga
                  </label>
                  <select
                    value={formData.statusDalamKeluarga}
                    onChange={(e) => setFormData({ ...formData, statusDalamKeluarga: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Anak Kandung">Anak Kandung</option>
                    <option value="Anak Tiri">Anak Tiri</option>
                    <option value="Anak Angkat">Anak Angkat</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Bahasa Sehari-hari
                  </label>
                  <input
                    type="text"
                    value={formData.bahasaSehariHari}
                    onChange={(e) => setFormData({ ...formData, bahasaSehariHari: e.target.value })}
                    placeholder="Bahasa Indonesia, Sunda, dll."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}

          {/* SECTION 2: FISIK & DOMISILI */}
          {activeSection === 'fisik-domisili' && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <h4 className="font-bold text-slate-800 mb-2">Kondisi Fisik & Kesehatan</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Golongan Darah</label>
                    <select
                      value={formData.golonganDarah}
                      onChange={(e) => setFormData({ ...formData, golonganDarah: e.target.value as any })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="-">- (Belum Tahu)</option>
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="AB">AB</option>
                      <option value="O">O</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Tinggi Badan (cm)</label>
                    <input
                      type="number"
                      value={formData.tinggiBadan}
                      onChange={(e) => setFormData({ ...formData, tinggiBadan: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Berat Badan (kg)</label>
                    <input
                      type="number"
                      value={formData.beratBadan}
                      onChange={(e) => setFormData({ ...formData, beratBadan: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Riwayat Penyakit Berat</label>
                    <input
                      type="text"
                      value={formData.riwayatPenyakit}
                      onChange={(e) => setFormData({ ...formData, riwayatPenyakit: e.target.value })}
                      placeholder="Asma, Alergi, atau 'Tidak ada'"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Kebutuhan Khusus / Disabilitas</label>
                    <input
                      type="text"
                      value={formData.kebutuhanKhusus}
                      onChange={(e) => setFormData({ ...formData, kebutuhanKhusus: e.target.value })}
                      placeholder="'Tidak ada' atau jenis kebutuhan khusus"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <h4 className="font-bold text-slate-800 mb-2">Alamat & Tempat Tinggal</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Alamat Jalan / Tempat Tinggal</label>
                    <input
                      type="text"
                      value={formData.alamat}
                      onChange={(e) => setFormData({ ...formData, alamat: e.target.value })}
                      placeholder="Jl. Merpati Putih No. 12"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">RT</label>
                      <input
                        type="text"
                        value={formData.rt}
                        onChange={(e) => setFormData({ ...formData, rt: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">RW</label>
                      <input
                        type="text"
                        value={formData.rw}
                        onChange={(e) => setFormData({ ...formData, rw: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Dusun / Kampung</label>
                      <input
                        type="text"
                        value={formData.dusun}
                        onChange={(e) => setFormData({ ...formData, dusun: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Desa / Kelurahan</label>
                      <input
                        type="text"
                        value={formData.kelurahan}
                        onChange={(e) => setFormData({ ...formData, kelurahan: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Kecamatan</label>
                      <input
                        type="text"
                        value={formData.kecamatan}
                        onChange={(e) => setFormData({ ...formData, kecamatan: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Tinggal Bersama</label>
                      <KodeSelect
                        value={formData.tinggalDengan}
                        options={TINGGAL_OPTIONS}
                        ariaLabel="Jenis tinggal"
                        onChange={(v) => setFormData({ ...formData, tinggalDengan: v as Siswa['tinggalDengan'] })}
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Transportasi ke Sekolah</label>
                      <KodeSelect
                        value={formData.transportasiKeSekolah}
                        options={TRANSPORTASI_OPTIONS}
                        ariaLabel="Moda transportasi ke sekolah"
                        onChange={(v) => setFormData({ ...formData, transportasiKeSekolah: v as Siswa['transportasiKeSekolah'] })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: ORANG TUA & WALI */}
          {activeSection === 'ortu' && (
            <div className="space-y-4">
              {/* Ayah Kandung */}
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-200">
                <h4 className="font-bold text-blue-900 text-sm mb-3">Data Ayah Kandung</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Nama Lengkap Ayah</label>
                    <input
                      type="text"
                      value={formData.ayah.nama}
                      onChange={(e) => setFormData({
                        ...formData,
                        ayah: { ...formData.ayah, nama: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">NIK Ayah <span title="Terkunci Dapodik">🔒</span></label>
                    <input
                      type="text"
                      maxLength={16}
                      value={formData.ayah.nik}
                      readOnly={kunciNilai(initialData?.ayah?.nik)}
                      title={kunciNilai(initialData?.ayah?.nik) ? 'Terkunci Dapodik — ubah via Sinkron Dapodik' : undefined}
                      onChange={(e) => setFormData({
                        ...formData,
                        ayah: { ...formData.ayah, nik: e.target.value }
                      })}
                      className={`w-full px-3 py-2 border border-slate-300 rounded-lg font-mono ${clsKunci(kunciNilai(initialData?.ayah?.nik))}`}
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Pekerjaan Ayah</label>
                    <KodeSelect
                      value={formData.ayah.pekerjaan}
                      options={PEKERJAAN_OPTIONS}
                      ariaLabel="Pekerjaan ayah"
                      onChange={(v) => setFormData({
                        ...formData,
                        ayah: { ...formData.ayah, pekerjaan: v }
                      })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Pendidikan Terakhir</label>
                    <KodeSelect
                      value={formData.ayah.pendidikan}
                      options={PENDIDIKAN_OPTIONS}
                      ariaLabel="Pendidikan terakhir ayah"
                      onChange={(v) => setFormData({
                        ...formData,
                        ayah: { ...formData.ayah, pendidikan: v }
                      })}
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Penghasilan Bulanan</label>
                    <KodeSelect
                      value={formData.ayah.penghasilan}
                      options={PENGHASILAN_OPTIONS}
                      ariaLabel="Penghasilan bulanan ayah"
                      onChange={(v) => setFormData({
                        ...formData,
                        ayah: { ...formData.ayah, penghasilan: v }
                      })}
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">No. HP / WhatsApp</label>
                    <input
                      type="text"
                      value={formData.ayah.noTelepon}
                      onChange={(e) => setFormData({
                        ...formData,
                        ayah: { ...formData.ayah, noTelepon: e.target.value }
                      })}
                      placeholder="0812xxxxxxxx"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Ibu Kandung */}
              <div className="bg-rose-50/50 p-4 rounded-xl border border-rose-200">
                <h4 className="font-bold text-rose-900 text-sm mb-3">Data Ibu Kandung</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Nama Lengkap Ibu</label>
                    <input
                      type="text"
                      value={formData.ibu.nama}
                      onChange={(e) => setFormData({
                        ...formData,
                        ibu: { ...formData.ibu, nama: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">NIK Ibu <span title="Terkunci Dapodik">🔒</span></label>
                    <input
                      type="text"
                      maxLength={16}
                      value={formData.ibu.nik}
                      readOnly={kunciNilai(initialData?.ibu?.nik)}
                      title={kunciNilai(initialData?.ibu?.nik) ? 'Terkunci Dapodik — ubah via Sinkron Dapodik' : undefined}
                      onChange={(e) => setFormData({
                        ...formData,
                        ibu: { ...formData.ibu, nik: e.target.value }
                      })}
                      className={`w-full px-3 py-2 border border-slate-300 rounded-lg font-mono ${clsKunci(kunciNilai(initialData?.ibu?.nik))}`}
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Pekerjaan Ibu</label>
                    <KodeSelect
                      value={formData.ibu.pekerjaan}
                      options={PEKERJAAN_OPTIONS}
                      ariaLabel="Pekerjaan ibu"
                      onChange={(v) => setFormData({
                        ...formData,
                        ibu: { ...formData.ibu, pekerjaan: v }
                      })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Pendidikan Terakhir</label>
                    <KodeSelect
                      value={formData.ibu.pendidikan}
                      options={PENDIDIKAN_OPTIONS}
                      ariaLabel="Pendidikan terakhir ibu"
                      onChange={(v) => setFormData({
                        ...formData,
                        ibu: { ...formData.ibu, pendidikan: v }
                      })}
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Penghasilan Bulanan</label>
                    <KodeSelect
                      value={formData.ibu.penghasilan}
                      options={PENGHASILAN_OPTIONS}
                      ariaLabel="Penghasilan bulanan ibu"
                      onChange={(v) => setFormData({
                        ...formData,
                        ibu: { ...formData.ibu, penghasilan: v }
                      })}
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">No. HP / WhatsApp</label>
                    <input
                      type="text"
                      value={formData.ibu.noTelepon}
                      onChange={(e) => setFormData({
                        ...formData,
                        ibu: { ...formData.ibu, noTelepon: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 4: PENDIDIKAN ASAL & PENERIMAAN SEKOLAH */}
          {activeSection === 'sekolah' && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h4 className="font-bold text-slate-900 text-sm mb-3">
                  {jenjang === 'SD'
                    ? 'Data Pendidikan Sebelumnya (TK / PAUD / RA / Belum Sekolah)'
                    : 'Data Pendidikan Sebelumnya (SD / MI)'}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {jenjang === 'SD' ? 'Nama TK / PAUD / RA Asal' : 'Nama SD / MI Asal'}
                    </label>
                    <input
                      type="text"
                      value={formData.asalSdMi}
                      onChange={(e) => setFormData({ ...formData, asalSdMi: e.target.value })}
                      placeholder={jenjang === 'SD' ? 'TK Pertiwi Nusantara' : 'SD Negeri 1 Nusantara'}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {jenjang === 'SD' ? 'NPSN TK/PAUD Asal' : 'NPSN SD Asal'}
                    </label>
                    <input
                      type="text"
                      value={formData.npsnSdMi}
                      onChange={(e) => setFormData({ ...formData, npsnSdMi: e.target.value })}
                      placeholder="20101234"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {jenjang === 'SD' ? 'No. Sertifikat / Ijazah TK' : 'No. Ijazah SD/MI'}
                    </label>
                    <input
                      type="text"
                      value={formData.noIjazahSd}
                      onChange={(e) => setFormData({ ...formData, noIjazahSd: e.target.value })}
                      placeholder={jenjang === 'SD' ? 'TK-02/...' : 'DN-02/D-SD/...'}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {jenjang === 'SD' ? 'Tahun Lulus TK' : 'Tahun Lulus SD'}
                    </label>
                    <input
                      type="text"
                      value={formData.tahunLulusSd}
                      onChange={(e) => setFormData({ ...formData, tahunLulusSd: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Lama Belajar (Tahun)</label>
                    <input
                      type="number"
                      value={formData.lamaBelajarSd}
                      onChange={(e) => setFormData({ ...formData, lamaBelajarSd: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h4 className="font-bold text-slate-900 text-sm mb-3">
                  Penerimaan di {jenjang} Ini
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Tanggal Diterima</label>
                    <input
                      type="date"
                      value={formData.tanggalDiterima}
                      onChange={(e) => setFormData({ ...formData, tanggalDiterima: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Tingkat Awal</label>
                    <select
                      value={formData.diterimaDiTingkat}
                      onChange={(e) => setFormData({ ...formData, diterimaDiTingkat: e.target.value as TingkatKelas })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-bold"
                    >
                      {jenjang === 'SD' ? (
                        <>
                          <option value="1">Kelas 1</option>
                          <option value="2">Kelas 2</option>
                          <option value="3">Kelas 3</option>
                          <option value="4">Kelas 4</option>
                          <option value="5">Kelas 5</option>
                          <option value="6">Kelas 6</option>
                        </>
                      ) : (
                        <>
                          <option value="7">Kelas 7</option>
                          <option value="8">Kelas 8</option>
                          <option value="9">Kelas 9</option>
                        </>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Rombel Saat Ini</label>
                    <input
                      type="text"
                      value={formData.rombelSaatIni}
                      onChange={(e) => setFormData({ ...formData, rombelSaatIni: e.target.value })}
                      placeholder={jenjang === 'SD' ? 'Contoh: 1A, 2B, 3A' : 'Contoh: 7A, 8B, 9A'}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold text-blue-900"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Jalur Masuk PPDB</label>
                    <select
                      value={formData.jalurMasuk}
                      onChange={(e) => setFormData({ ...formData, jalurMasuk: e.target.value as JalurMasuk })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Zonasi">Zonasi</option>
                      <option value="Afirmasi">Afirmasi (Keluarga Tidak Mampu)</option>
                      <option value="Prestasi">Prestasi (Akademik / Non-Akademik)</option>
                      <option value="Perpindahan Tugas Orang Tua">Perpindahan Tugas Orang Tua</option>
                      <option value="Mutasi/Pindahan">Mutasi / Pindahan Sekolah</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Jenis Pendaftaran</label>
                    <KodeSelect
                      value={formData.jenisPendaftaran || 'Siswa Baru'}
                      options={JENIS_PENDAFTARAN_OPTIONS}
                      ariaLabel="Jenis pendaftaran"
                      onChange={(v) => setFormData({ ...formData, jenisPendaftaran: v as Siswa['jenisPendaftaran'] })}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 5: MERDEKA P5, EKSKUL & PRESTASI */}
          {activeSection === 'merdeka' && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h4 className="font-bold text-slate-900 text-sm mb-3">Minat, Hobi & Cita-cita</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Hobi</label>
                    <KodeSelect
                      value={formData.hobi || ''}
                      options={HOBI_OPTIONS}
                      ariaLabel="Hobi siswa"
                      onChange={(v) => setFormData({ ...formData, hobi: v })}
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Cita-cita</label>
                    <KodeSelect
                      value={formData.citaCita || ''}
                      options={CITACITA_OPTIONS}
                      ariaLabel="Cita-cita siswa"
                      onChange={(v) => setFormData({ ...formData, citaCita: v })}
                    />
                  </div>
                </div>
              </div>
              <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-amber-950 text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    Projek Penguatan Profil Pelajar Pancasila (P5)
                  </h4>
                </div>

                {formData.p5Projects.map((p, pIdx) => (
                  <div key={p.id || pIdx} className="bg-white p-3 rounded-lg border border-amber-200 mb-3 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-0.5">Judul Projek P5</label>
                        <input
                          type="text"
                          value={p.judulProjek}
                          onChange={(e) => {
                            const copy = [...formData.p5Projects];
                            copy[pIdx].judulProjek = e.target.value;
                            setFormData({ ...formData, p5Projects: copy });
                          }}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-0.5">Tema P5</label>
                        <select
                          value={p.tema}
                          onChange={(e) => {
                            const copy = [...formData.p5Projects];
                            copy[pIdx].tema = e.target.value as any;
                            setFormData({ ...formData, p5Projects: copy });
                          }}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                        >
                          <option value="Gaya Hidup Berkelanjutan">Gaya Hidup Berkelanjutan</option>
                          <option value="Kearifan Lokal">Kearifan Lokal</option>
                          <option value="Bhinneka Tunggal Ika">Bhinneka Tunggal Ika</option>
                          <option value="Bangunlah Jiwa dan Raganya">Bangunlah Jiwa dan Raganya</option>
                          <option value="Suara Demokrasi">Suara Demokrasi</option>
                          <option value="Rekayasa dan Teknologi">Rekayasa dan Teknologi</option>
                          <option value="Kewirausahaan">Kewirausahaan</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-0.5">Catatan Perkembangan Karakter</label>
                      <input
                        type="text"
                        value={p.catatanProses}
                        onChange={(e) => {
                          const copy = [...formData.p5Projects];
                          copy[pIdx].catatanProses = e.target.value;
                          setFormData({ ...formData, p5Projects: copy });
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Prestasi */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-slate-900 text-sm">Catatan Prestasi Siswa</h4>
                  <button
                    type="button"
                    onClick={handleAddPrestasi}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-700 text-white rounded font-medium text-xs hover:bg-blue-800"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah Prestasi
                  </button>
                </div>

                {formData.prestasi.length === 0 ? (
                  <p className="text-slate-400 italic text-xs">Belum ada catatan prestasi.</p>
                ) : (
                  <div className="space-y-2">
                    {formData.prestasi.map((pr, idx) => (
                      <div key={pr.id || idx} className="flex gap-2 items-center bg-white p-2 rounded border border-slate-200">
                        <input
                          type="text"
                          placeholder="Nama Lomba / Kejuaraan"
                          value={pr.namaLomba}
                          onChange={(e) => {
                            const copy = [...formData.prestasi];
                            copy[idx].namaLomba = e.target.value;
                            setFormData({ ...formData, prestasi: copy });
                          }}
                          className="flex-1 px-2 py-1 border rounded"
                        />
                        <input
                          type="text"
                          placeholder="Peringkat (Juara 1)"
                          value={pr.peringkat}
                          onChange={(e) => {
                            const copy = [...formData.prestasi];
                            copy[idx].peringkat = e.target.value;
                            setFormData({ ...formData, prestasi: copy });
                          }}
                          className="w-28 px-2 py-1 border rounded"
                        />
                        <input
                          type="text"
                          placeholder="Tahun"
                          value={pr.tahun}
                          onChange={(e) => {
                            const copy = [...formData.prestasi];
                            copy[idx].tahun = e.target.value;
                            setFormData({ ...formData, prestasi: copy });
                          }}
                          className="w-20 px-2 py-1 border rounded"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePrestasi(idx)}
                          className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 6: KEHADIRAN & MUTASI */}
          {activeSection === 'semester' && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h4 className="font-bold text-slate-900 text-sm mb-3">Status Akhir Siswa</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Status Keaktifan</label>
                    <select
                      value={formData.statusSiswa}
                      onChange={(e) => setFormData({ ...formData, statusSiswa: e.target.value as StatusSiswa })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-bold"
                    >
                      <option value="Aktif">Aktif</option>
                      <option value="Lulus">Lulus</option>
                      <option value="Mutasi Keluar">Mutasi Keluar (Pindah Sekolah)</option>
                      <option value="Mengundurkan Diri">Mengundurkan Diri</option>
                      <option value="Meninggal Dunia">Meninggal Dunia</option>
                    </select>
                  </div>

                  {formData.statusSiswa === 'Mutasi Keluar' && (
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Sekolah Tujuan Mutasi</label>
                      <input
                        type="text"
                        value={formData.sekolahTujuan || ''}
                        onChange={(e) => setFormData({ ...formData, sekolahTujuan: e.target.value })}
                        placeholder={jenjang === 'SD' ? 'Nama SD Tujuan' : 'Nama SMP Tujuan'}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* SECTION 7: NILAI RAPORT & RIWAYAT TAHUN AJARAN */}
          {activeSection === 'raport-riwayat' && (
            <div className="space-y-4">
              {/* Riwayat Multi-Tahun Ajaran */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-blue-700" />
                      Riwayat Kenaikan Tingkat & Multi-Tahun Ajaran
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Mencatat perpindahan rombel, tingkat kelas, dan riwayat kelulusan per tahun pelajaran.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddRiwayatTA}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-bold text-xs shadow-xs transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah Riwayat TA
                  </button>
                </div>

                {(!formData.riwayatTahunAjaran || formData.riwayatTahunAjaran.length === 0) ? (
                  <div className="p-4 text-center text-slate-400 bg-white border border-dashed border-slate-300 rounded-lg">
                    Belum ada catatan riwayat tahun ajaran sebelumnya. Klik tombol di atas untuk menambahkan.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {formData.riwayatTahunAjaran.map((rw, idx) => (
                      <div key={rw.id || idx} className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Tahun Ajaran</label>
                            <input
                              type="text"
                              value={rw.tahunAjaran}
                              onChange={(e) => {
                                const copy = [...(formData.riwayatTahunAjaran || [])];
                                copy[idx].tahunAjaran = e.target.value;
                                setFormData({ ...formData, riwayatTahunAjaran: copy });
                              }}
                              placeholder="2026/2027"
                              className="w-full px-2 py-1 border border-slate-300 rounded font-mono"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Tingkat Kelas</label>
                            <select
                              value={rw.tingkat}
                              onChange={(e) => {
                                const copy = [...(formData.riwayatTahunAjaran || [])];
                                copy[idx].tingkat = e.target.value as any;
                                setFormData({ ...formData, riwayatTahunAjaran: copy });
                              }}
                              className="w-full px-2 py-1 border border-slate-300 rounded bg-white"
                            >
                              {jenjang === 'SD' ? (
                                <>
                                  <option value="1">Kelas 1</option>
                                  <option value="2">Kelas 2</option>
                                  <option value="3">Kelas 3</option>
                                  <option value="4">Kelas 4</option>
                                  <option value="5">Kelas 5</option>
                                  <option value="6">Kelas 6</option>
                                </>
                              ) : (
                                <>
                                  <option value="7">Kelas 7</option>
                                  <option value="8">Kelas 8</option>
                                  <option value="9">Kelas 9</option>
                                </>
                              )}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Rombel</label>
                            <input
                              type="text"
                              value={rw.rombel}
                              onChange={(e) => {
                                const copy = [...(formData.riwayatTahunAjaran || [])];
                                copy[idx].rombel = e.target.value;
                                setFormData({ ...formData, riwayatTahunAjaran: copy });
                              }}
                              placeholder={jenjang === 'SD' ? '1A' : '7A'}
                              className="w-full px-2 py-1 border border-slate-300 rounded font-bold text-blue-900"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Status Kenaikan</label>
                            <select
                              value={rw.statusKenaikan}
                              onChange={(e) => {
                                const copy = [...(formData.riwayatTahunAjaran || [])];
                                copy[idx].statusKenaikan = e.target.value as StatusKenaikanKelas;
                                setFormData({ ...formData, riwayatTahunAjaran: copy });
                              }}
                              className="w-full px-2 py-1 border border-slate-300 rounded bg-white font-semibold text-emerald-800"
                            >
                              <option value="Belum Ditentukan">Belum Ditentukan</option>
                              <option value="Naik Kelas">Naik Kelas</option>
                              <option value="Tinggal di Kelas">Tinggal di Kelas</option>
                              <option value="Lulus">Lulus</option>
                            </select>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="w-1/3">
                            <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Nama Wali Kelas</label>
                            <input
                              type="text"
                              value={rw.waliKelas || ''}
                              onChange={(e) => {
                                const copy = [...(formData.riwayatTahunAjaran || [])];
                                copy[idx].waliKelas = e.target.value;
                                setFormData({ ...formData, riwayatTahunAjaran: copy });
                              }}
                              placeholder="Nama Wali Kelas"
                              className="w-full px-2 py-1 border border-slate-300 rounded"
                            />
                          </div>

                          <div className="flex-1">
                            <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Catatan Perkembangan</label>
                            <input
                              type="text"
                              value={rw.catatan || ''}
                              onChange={(e) => {
                                const copy = [...(formData.riwayatTahunAjaran || [])];
                                copy[idx].catatan = e.target.value;
                                setFormData({ ...formData, riwayatTahunAjaran: copy });
                              }}
                              placeholder="Catatan perkembangan karakter / akademik"
                              className="w-full px-2 py-1 border border-slate-300 rounded"
                            />
                          </div>

                          <div className="pt-4">
                            <button
                              type="button"
                              onClick={() => handleRemoveRiwayatTA(idx)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                              title="Hapus riwayat"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ringkasan Nilai Raport Semester */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <Award className="w-4 h-4 text-emerald-600" />
                      Ringkasan Raport Semester Terdata
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Entri detail nilai capaian pembelajaran mata pelajaran juga dapat dikelola via tab menu 'Nilai Raport'.
                    </p>
                  </div>
                </div>

                {getRaportList(formData as Siswa).length === 0 ? (
                  <div className="p-4 text-center text-slate-400 bg-white border border-dashed border-slate-300 rounded-lg text-xs">
                    Belum ada nilai raport semester yang dimasukkan. Anda dapat menginput nilai lengkap di tab menu <strong>Nilai Raport</strong>.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-slate-300 bg-white rounded-lg text-xs">
                      <thead className="bg-slate-100 text-slate-700">
                        <tr>
                          <th className="border border-slate-300 px-3 py-2 text-left">Semester & TA</th>
                          <th className="border border-slate-300 px-3 py-2 text-center">Tingkat</th>
                          <th className="border border-slate-300 px-3 py-2 text-center">Fase</th>
                          <th className="border border-slate-300 px-3 py-2 text-center">Jumlah Mapel</th>
                          <th className="border border-slate-300 px-3 py-2 text-center">Rata-rata Nilai</th>
                          <th className="border border-slate-300 px-3 py-2 text-center">Absensi (S/I/A)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getRaportList(formData as Siswa).map((rp, idx) => {
                          const nilaiList = getNilaiList(rp);
                          const total = nilaiList.reduce((acc, m) => acc + (Number(m.nilaiAkhir) || 0), 0);
                          const avg = nilaiList.length > 0 ? Math.round(total / nilaiList.length) : 0;
                          return (
                            <tr key={rp.id || idx} className="hover:bg-slate-50">
                              <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-900">
                                Semester {rp.semester} ({rp.tahunAjaran})
                              </td>
                              <td className="border border-slate-300 px-3 py-2 text-center font-bold text-blue-900">
                                Kelas {rp.tingkat} ({rp.rombel})
                              </td>
                              <td className="border border-slate-300 px-3 py-2 text-center text-slate-600">
                                Fase {rp.fase}
                              </td>
                              <td className="border border-slate-300 px-3 py-2 text-center">
                                {nilaiList.length} Mapel
                              </td>
                              <td className="border border-slate-300 px-3 py-2 text-center font-mono font-bold text-emerald-700">
                                {avg}
                              </td>
                              <td className="border border-slate-300 px-3 py-2 text-center font-mono text-slate-600">
                                {rp.kehadiran.sakit}/{rp.kehadiran.izin}/{rp.kehadiran.alpa}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Footer wizard */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-2 sticky bottom-0 bg-white pb-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="ui-btn ui-btn-ghost"
              >
                Batal
              </button>
              <span className="hidden sm:inline text-[11px] font-bold text-slate-400 tabular-nums">
                {stepIndex + 1} / {STEPS.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="ui-btn ui-btn-outline"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Kembali
                </button>
              )}

              {!isLastStep ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="ui-btn ui-btn-primary"
                >
                  Lanjut: {STEPS[stepIndex + 1]?.label}
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={saving}
                  className="ui-btn ui-btn-primary"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Menyimpan...' : 'Simpan ke Buku Induk'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
