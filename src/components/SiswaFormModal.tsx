import React, { useState, useEffect } from 'react';
import { X, Save, User, Home, Users, School, ClipboardCheck, ChevronLeft, ChevronRight, Lock, Eraser, Check } from 'lucide-react';
import { Siswa, JenisKelamin, Agama, TingkatKelas, JalurMasuk, StatusSiswa, JenjangSekolah } from '../types';
import { validateIdentitasSiswa, FieldIssue } from '../utils/validation';
import { scopedStorageKey } from '../utils/db';
import { toast, confirmDialog } from '../utils/notify';
import { KodeSelect } from './KodeSelect';
import {
  AGAMA_OPTIONS,
  PENDIDIKAN_OPTIONS,
  PEKERJAAN_OPTIONS,
  PENGHASILAN_OPTIONS,
  AGAMA_LEGACY,
  PEKERJAAN_LEGACY,
  PENGHASILAN_LEGACY,
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
    ayah: ortu(s.ayah),
    ibu: ortu(s.ibu),
  };
}

type StepId = 'identitas' | 'alamat' | 'ortu' | 'akademik' | 'tinjau';

interface WizardStep {
  id: StepId;
  label: string;
  desc: string;
  icon: typeof User;
}

/** F9: kunci draft di-scope per database sekolah aktif (scopedStorageKey) agar
 *  draft pendaftaran sekolah A tidak pulih saat membuka form di sekolah B.
 *  Dihitung ulang SETIAP dipakai — TIDAK di-cache di module scope karena
 *  activeDbName bisa berubah saat ganti sekolah. */
function draftKey(): string {
  return scopedStorageKey('bukuinduk_draft_siswa_v1');
}

function loadDraft(): Partial<Siswa> | null {
  try {
    const raw = localStorage.getItem(draftKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.namaLengkap !== undefined) return parsed;
    return null;
  } catch {
    return null;
  }
}

const emptyWali = (): NonNullable<Siswa['wali']> => ({
  nama: '',
  nik: '',
  tahunLahir: '',
  pendidikan: 'SMA / sederajat',
  pekerjaan: 'Lainnya',
  penghasilan: 'Tidak Berpenghasilan',
  noTelepon: '',
  hubungan: '',
  alamat: '',
});

/** Tanggal valid: format YYYY-MM-DD dan tanggal kalender nyata. */
function isValidDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function fmtTgl(iso: string): string {
  if (!isValidDate(iso)) return iso?.trim() ? iso : '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
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

  const [activeStep, setActiveStep] = useState<StepId>('identitas');
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [visited, setVisited] = useState<StepId[]>(['identitas']);
  const [draftRestored, setDraftRestored] = useState(false);
  const [waliAda, setWaliAda] = useState<boolean>(
    () => !!initialData?.wali?.nama?.trim()
  );

  const STEPS: WizardStep[] = [
    { id: 'identitas', label: 'Identitas', desc: 'Nama, NISN & TTL', icon: User },
    { id: 'alamat', label: 'Alamat', desc: 'Domisili & kode pos', icon: Home },
    { id: 'ortu', label: 'Orang Tua/Wali', desc: 'Ayah, ibu & wali', icon: Users },
    { id: 'akademik', label: 'Akademik', desc: 'Rombel & penerimaan', icon: School },
    { id: 'tinjau', label: 'Tinjau', desc: 'Periksa & simpan', icon: ClipboardCheck },
  ];
  const stepIndex = Math.max(0, STEPS.findIndex((s) => s.id === activeStep));
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === STEPS.length - 1;

  const goStep = (id: StepId) => {
    setActiveStep(id);
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

  // ----- Helper pengubah field + bersihkan error field tsb -----
  const touch = (key: string) =>
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const n = { ...prev };
      delete n[key];
      return n;
    });

  const set = <K extends keyof Siswa>(key: K, value: Siswa[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    touch(key as string);
  };

  const setOrtu = (who: 'ayah' | 'ibu', key: keyof Siswa['ayah'], value: string) => {
    setFormData((prev) => ({ ...prev, [who]: { ...prev[who], [key]: value } }));
    touch(`${who}.${key}`);
  };

  const setWali = (key: keyof NonNullable<Siswa['wali']>, value: string) => {
    setFormData((prev) => ({ ...prev, wali: { ...(prev.wali ?? emptyWali()), [key]: value } }));
    touch(`wali.${key}`);
  };

  // ----- Validasi per langkah -----
  const validateStep = (id: StepId): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (id === 'identitas') {
      const issues: FieldIssue[] = validateIdentitasSiswa(
        {
          id: formData.id,
          namaLengkap: formData.namaLengkap,
          nisn: formData.nisn,
          nik: formData.nik,
          nipd: formData.nipd,
          noKk: formData.noKk,
          tanggalLahir: formData.tanggalLahir,
        },
        existingSiswa
      );
      for (const i of issues) errs[i.field] = i.message;
      if (!errs.tanggalLahir && !isValidDate(formData.tanggalLahir)) {
        errs.tanggalLahir = 'Tanggal lahir tidak valid. Pilih tanggal dari kalender.';
      }
      return errs;
    }
    if (id === 'alamat') {
      const kp = formData.kodePos.trim();
      if (kp && !/^[0-9]{5}$/.test(kp)) {
        errs.kodePos = 'Kode pos harus tepat 5 digit angka.';
      }
      return errs;
    }
    if (id === 'ortu') {
      (['ayah', 'ibu'] as const).forEach((who) => {
        const label = who === 'ayah' ? 'Ayah' : 'Ibu';
        const nik = formData[who].nik.trim();
        if (nik && !/^[0-9]{16}$/.test(nik)) {
          errs[`${who}.nik`] = `NIK ${label} harus 16 digit angka bila diisi.`;
        }
        const hp = formData[who].noTelepon.trim();
        if (hp && !/^[0-9+\-\s]{9,17}$/.test(hp)) {
          errs[`${who}.noTelepon`] = `No. HP ${label} tidak valid (9–17 digit, boleh + dan spasi).`;
        }
      });
      const wnik = formData.wali?.nik.trim() || '';
      if (waliAda && formData.wali?.nama.trim() && wnik && !/^[0-9]{16}$/.test(wnik)) {
        errs['wali.nik'] = 'NIK wali harus 16 digit angka bila diisi.';
      }
      return errs;
    }
    if (id === 'akademik') {
      if (!formData.rombelSaatIni.trim()) {
        errs.rombelSaatIni = 'Rombel saat ini wajib diisi.';
      }
      if (!isValidDate(formData.tanggalDiterima)) {
        errs.tanggalDiterima = 'Tanggal diterima tidak valid. Pilih tanggal dari kalender.';
      }
      if (!formData.diterimaDiTingkat) {
        errs.diterimaDiTingkat = 'Tingkat kelas wajib dipilih.';
      }
      return errs;
    }
    return errs;
  };

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
      goStep('identitas');
      toast(issues[0].message, 'error');
      return;
    }
    setFieldErrors({});

    setSaving(true);
    try {
      // Wali hanya disimpan bila namanya diisi; bila kosong, jangan kirim objek kosong.
      const waliFinal =
        formData.wali && formData.wali.nama.trim() ? formData.wali : undefined;
      await onSave({
        ...formData,
        wali: waliFinal,
        namaLengkap: formData.namaLengkap.trim().toUpperCase(),
        updatedAt: new Date().toISOString()
      });
      try {
        localStorage.removeItem(draftKey());
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
        if (d.wali && d.wali.nama && d.wali.nama.trim()) setWaliAda(true);
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
        localStorage.setItem(draftKey(), JSON.stringify(rest));
      } catch { /* kuota penuh / storage tidak tersedia — abaikan */ }
    }, 800);
    return () => window.clearTimeout(t);
  }, [formData, isEdit]);

  const discardDraft = () => {
    try {
      localStorage.removeItem(draftKey());
    } catch { /* abaikan */ }
    setDraftRestored(false);
    toast('Draft tersimpan dibuang. Pendaftaran baru berikutnya mulai kosong.', 'info');
  };

  /** Batal eksplisit: buang draft lalu tutup (mode tambah saja). */
  const handleCancel = async () => {
    if (!isEdit) {
      const ok = await confirmDialog(
        'Batalkan pendaftaran ini? Draft tersimpan otomatis akan dibuang.',
        { confirmLabel: 'Ya, Batalkan', cancelLabel: 'Lanjut Mengisi', danger: true }
      );
      if (!ok) return;
      try {
        localStorage.removeItem(draftKey());
      } catch { /* abaikan */ }
    }
    onClose();
  };

  /** Lanjut ke langkah berikut; langkah aktif wajib valid sebelum lanjut. */
  const handleNext = () => {
    const errs = validateStep(activeStep);
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      toast(Object.values(errs)[0], 'error');
      return;
    }
    setFieldErrors({});
    const next = STEPS[Math.min(stepIndex + 1, STEPS.length - 1)];
    if (next) goStep(next.id);
  };

  const handleBack = () => {
    const prev = STEPS[Math.max(stepIndex - 1, 0)];
    if (prev) goStep(prev.id);
  };

  /** Ubah status langsung dari form — konfirmasi bila ke Lulus / Mutasi Keluar
   *  (F8-tambahan, pola dialog repo, tanpa prop drilling). */
  const handleStatusChange = async (baru: StatusSiswa) => {
    if (baru !== formData.statusSiswa && (baru === 'Lulus' || baru === 'Mutasi Keluar')) {
      const ok = await confirmDialog(
        `"${(formData.namaLengkap || 'Siswa').trim()}" akan ditandai "${baru}" tanpa lewat Wizard Mutasi / Tutup Tahun. Lanjutkan?`,
        { confirmLabel: 'Ya, Ubah Status', danger: baru === 'Mutasi Keluar' }
      );
      if (!ok) return; // select controlled → batal = nilai tetap lama
    }
    set('statusSiswa', baru);
  };

  const errText = (key: string) =>
    fieldErrors[key] ? (
      <p className="mt-1 text-[11px] font-medium text-rose-600">{fieldErrors[key]}</p>
    ) : null;

  // ----- Komponen bantu ringkasan tinjau (tetap satu file) -----
  const SumRow = ({ label, value }: { label: string; value?: string }) => (
    <div className="flex justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
      <dt className="text-slate-500 font-semibold shrink-0">{label}</dt>
      <dd className="text-slate-900 font-bold text-right break-words">{value?.trim() ? value : '—'}</dd>
    </div>
  );

  const SumCard = ({ stepId, title, children }: { stepId: StepId; title: string; children: React.ReactNode }) => (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <h4 className="font-extrabold text-slate-800 text-[13px]">{title}</h4>
        <button
          type="button"
          onClick={() => goStep(stepId)}
          className="text-[11px] font-bold text-blue-700 hover:text-blue-900 hover:underline cursor-pointer"
        >
          Ubah
        </button>
      </div>
      <dl className="px-4 py-2">{children}</dl>
    </div>
  );

  const renderOrtuFields = (who: 'ayah' | 'ibu') => {
    const label = who === 'ayah' ? 'Ayah' : 'Ibu';
    const data = formData[who];
    const lockedNik = kunciNilai(initialData?.[who]?.nik);
    // Kelas Tailwind ditulis statis (bukan template string) agar ter-compile JIT.
    const cardCls = who === 'ayah'
      ? 'bg-blue-50/50 border-blue-200'
      : 'bg-rose-50/50 border-rose-200';
    const titleCls = who === 'ayah' ? 'text-blue-900' : 'text-rose-900';
    return (
      <div className={`${cardCls} p-4 rounded-xl border`}>
        <h4 className={`font-bold ${titleCls} text-sm mb-3`}>Data {label} Kandung</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Nama Lengkap {label}</label>
            <input
              type="text"
              value={data.nama}
              onChange={(e) => setOrtu(who, 'nama', e.target.value)}
              placeholder={`Nama lengkap ${label.toLowerCase()}`}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">NIK {label} <span title="Terkunci Dapodik">🔒</span></label>
            <input
              type="text"
              maxLength={16}
              value={data.nik}
              readOnly={lockedNik}
              title={lockedNik ? 'Terkunci Dapodik — ubah via Sinkron Dapodik' : undefined}
              onChange={(e) => setOrtu(who, 'nik', e.target.value)}
              placeholder="16 digit NIK"
              className={`w-full px-3 py-2 border border-slate-300 rounded-lg font-mono ${clsKunci(lockedNik)}`}
            />
            {errText(`${who}.nik`)}
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Pekerjaan {label}</label>
            <KodeSelect
              value={data.pekerjaan}
              options={PEKERJAAN_OPTIONS}
              ariaLabel={`Pekerjaan ${label.toLowerCase()}`}
              onChange={(v) => setOrtu(who, 'pekerjaan', v)}
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">No. HP / WhatsApp {label}</label>
            <input
              type="tel"
              inputMode="tel"
              value={data.noTelepon}
              onChange={(e) => setOrtu(who, 'noTelepon', e.target.value)}
              placeholder="0812xxxxxxxx"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
            {errText(`${who}.noTelepon`)}
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Pendidikan Terakhir</label>
            <KodeSelect
              value={data.pendidikan}
              options={PENDIDIKAN_OPTIONS}
              ariaLabel={`Pendidikan terakhir ${label.toLowerCase()}`}
              onChange={(v) => setOrtu(who, 'pendidikan', v)}
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Penghasilan Bulanan</label>
            <KodeSelect
              value={data.penghasilan}
              options={PENGHASILAN_OPTIONS}
              ariaLabel={`Penghasilan bulanan ${label.toLowerCase()}`}
              onChange={(v) => setOrtu(who, 'penghasilan', v)}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[94vh] flex flex-col overflow-hidden text-xs anim-scale-in">
        {/* Header Modal */}
        <div className="relative overflow-hidden bg-gradient-to-r from-navy-800 via-navy-900 to-[#0b1e4b] text-white px-5 py-4 shrink-0">
          <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-gold-500 via-gold-300 to-gold-500" />
          <div className="absolute -right-10 -top-14 w-48 h-48 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm sm:text-base tracking-tight truncate">
                {isEdit ? `Edit: ${initialData?.namaLengkap}` : `Siswa Baru — Buku Induk ${jenjang}`}
              </h3>
              <p className="text-[11px] text-slate-300">
                Langkah {stepIndex + 1} dari {STEPS.length}: <strong className="text-gold-300">{STEPS[stepIndex]?.label}</strong>
                {' '}• {STEPS[stepIndex]?.desc}
              </p>
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
          {/* Nama langkah */}
          <div className="relative mt-2 flex items-center justify-between">
            {STEPS.map((step, idx) => {
              const done = idx < stepIndex || (visited.includes(step.id) && idx !== stepIndex);
              const current = idx === stepIndex;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => goStep(step.id)}
                  title={`${step.label} — ${step.desc}`}
                  className={`flex items-center gap-1 min-w-0 cursor-pointer ${current ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0 ${
                    current
                      ? 'bg-gold-400 text-navy-950'
                      : done
                        ? 'bg-emerald-400/80 text-navy-950'
                        : 'bg-white/20 text-slate-200'
                  }`}>
                    {done && !current ? <Check className="w-3 h-3" /> : idx + 1}
                  </span>
                  <span className={`text-[10px] font-bold truncate hidden min-[420px]:inline ${current ? 'text-gold-300' : ''}`}>
                    {step.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Form Body Scrollable */}
        <form onSubmit={handleSubmit} key={activeStep} className="p-5 overflow-y-auto space-y-4 flex-1 anim-fade-up">
          {/* LANGKAH 1: IDENTITAS */}
          {activeStep === 'identitas' && (
            <div className="space-y-4">
              {isEdit && (
                <p className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-800">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  Field identitas pokok (NISN, NIPD, NIK, KK, Akta, TTL, Jenis Kelamin) terkunci Dapodik — perubahan hanya via menu Sinkron Dapodik.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nama Lengkap Siswa *</label>
                  <input
                    type="text"
                    required
                    value={formData.namaLengkap}
                    onChange={(e) => set('namaLengkap', e.target.value)}
                    placeholder="Contoh: MUHAMMAD RIZKY PRATAMA"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg uppercase focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                  {errText('namaLengkap')}
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nama Panggilan</label>
                  <input
                    type="text"
                    value={formData.namaPanggilan}
                    onChange={(e) => set('namaPanggilan', e.target.value)}
                    placeholder="Contoh: Rizky"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">NISN (10 Digit) * <span title="Terkunci Dapodik">🔒</span></label>
                  <input
                    type="text"
                    required
                    inputMode="numeric"
                    maxLength={10}
                    value={formData.nisn}
                    readOnly={kunciNilai(initialData?.nisn)}
                    title={kunciNilai(initialData?.nisn) ? 'Terkunci Dapodik — ubah via Sinkron Dapodik' : undefined}
                    onChange={(e) => set('nisn', e.target.value)}
                    placeholder="0091234567"
                    className={`w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none ${clsKunci(kunciNilai(initialData?.nisn))}`}
                  />
                  {errText('nisn')}
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">No. Induk / NIPD <span title="Terkunci Dapodik">🔒</span></label>
                  <input
                    type="text"
                    value={formData.nipd}
                    readOnly={kunciNilai(initialData?.nipd)}
                    title={kunciNilai(initialData?.nipd) ? 'Terkunci Dapodik — ubah via Sinkron Dapodik' : undefined}
                    onChange={(e) => set('nipd', e.target.value)}
                    placeholder="242507001"
                    className={`w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none ${clsKunci(kunciNilai(initialData?.nipd))}`}
                  />
                  {errText('nipd')}
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Jenis Kelamin *</label>
                  <select
                    value={formData.jenisKelamin}
                    disabled={isEdit}
                    title={isEdit ? 'Terkunci Dapodik' : undefined}
                    onChange={(e) => set('jenisKelamin', e.target.value as JenisKelamin)}
                    className={`w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none ${clsKunci(isEdit)}`}
                  >
                    <option value="L">Laki-laki (L)</option>
                    <option value="P">Perempuan (P)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">NIK / No. KTP Siswa <span title="Terkunci Dapodik">🔒</span></label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={16}
                    value={formData.nik}
                    readOnly={kunciNilai(initialData?.nik)}
                    title={kunciNilai(initialData?.nik) ? 'Terkunci Dapodik — ubah via Sinkron Dapodik' : undefined}
                    onChange={(e) => set('nik', e.target.value)}
                    placeholder="16 digit NIK"
                    className={`w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none ${clsKunci(kunciNilai(initialData?.nik))}`}
                  />
                  {errText('nik')}
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">No. Kartu Keluarga (KK) <span title="Terkunci Dapodik">🔒</span></label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={16}
                    value={formData.noKk}
                    readOnly={kunciNilai(initialData?.noKk)}
                    title={kunciNilai(initialData?.noKk) ? 'Terkunci Dapodik — ubah via Sinkron Dapodik' : undefined}
                    onChange={(e) => set('noKk', e.target.value)}
                    placeholder="16 digit No. KK"
                    className={`w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none ${clsKunci(kunciNilai(initialData?.noKk))}`}
                  />
                  {errText('noKk')}
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">No. Registrasi Akta Lahir <span title="Terkunci Dapodik">🔒</span></label>
                  <input
                    type="text"
                    value={formData.noAktaLahir}
                    readOnly={kunciNilai(initialData?.noAktaLahir)}
                    title={kunciNilai(initialData?.noAktaLahir) ? 'Terkunci Dapodik — ubah via Sinkron Dapodik' : undefined}
                    onChange={(e) => set('noAktaLahir', e.target.value)}
                    placeholder="3201-LT-15042009-0012"
                    className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none ${clsKunci(kunciNilai(initialData?.noAktaLahir))}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tempat Lahir <span title="Terkunci Dapodik">🔒</span></label>
                  <input
                    type="text"
                    value={formData.tempatLahir}
                    readOnly={kunciNilai(initialData?.tempatLahir)}
                    title={kunciNilai(initialData?.tempatLahir) ? 'Terkunci Dapodik — ubah via Sinkron Dapodik' : undefined}
                    onChange={(e) => set('tempatLahir', e.target.value)}
                    placeholder="Contoh: Bandung"
                    className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none ${clsKunci(kunciNilai(initialData?.tempatLahir))}`}
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tanggal Lahir <span title="Terkunci Dapodik">🔒</span></label>
                  <input
                    type="date"
                    value={formData.tanggalLahir}
                    disabled={kunciNilai(initialData?.tanggalLahir)}
                    title={kunciNilai(initialData?.tanggalLahir) ? 'Terkunci Dapodik — ubah via Sinkron Dapodik' : undefined}
                    onChange={(e) => set('tanggalLahir', e.target.value)}
                    className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none ${clsKunci(kunciNilai(initialData?.tanggalLahir))}`}
                  />
                  {errText('tanggalLahir')}
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Agama & Kepercayaan</label>
                  <KodeSelect
                    value={formData.agama}
                    options={AGAMA_OPTIONS}
                    ariaLabel="Agama dan kepercayaan"
                    onChange={(v) => set('agama', v as Agama)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* LANGKAH 2: ALAMAT & KONTAK */}
          {activeStep === 'alamat' && (
            <div className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Alamat Jalan / Tempat Tinggal</label>
                <textarea
                  rows={2}
                  value={formData.alamat}
                  onChange={(e) => set('alamat', e.target.value)}
                  placeholder="Jl. Merpati Putih No. 12"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">RT</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formData.rt}
                    onChange={(e) => set('rt', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">RW</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formData.rw}
                    onChange={(e) => set('rw', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Dusun / Kampung</label>
                  <input
                    type="text"
                    value={formData.dusun}
                    onChange={(e) => set('dusun', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Desa / Kelurahan</label>
                  <input
                    type="text"
                    value={formData.kelurahan}
                    onChange={(e) => set('kelurahan', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kecamatan</label>
                  <input
                    type="text"
                    value={formData.kecamatan}
                    onChange={(e) => set('kecamatan', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kabupaten / Kota</label>
                  <input
                    type="text"
                    value={formData.kabupatenKota}
                    onChange={(e) => set('kabupatenKota', e.target.value)}
                    placeholder="Contoh: Kab. Bandung"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Provinsi</label>
                  <input
                    type="text"
                    value={formData.provinsi}
                    onChange={(e) => set('provinsi', e.target.value)}
                    placeholder="Contoh: Jawa Barat"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kode Pos</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    value={formData.kodePos}
                    onChange={(e) => set('kodePos', e.target.value)}
                    placeholder="5 digit"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                  {errText('kodePos')}
                </div>
              </div>
            </div>
          )}

          {/* LANGKAH 3: ORANG TUA & WALI */}
          {activeStep === 'ortu' && (
            <div className="space-y-4">
              {renderOrtuFields('ayah')}
              {renderOrtuFields('ibu')}

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={waliAda}
                    onChange={(e) => setWaliAda(e.target.checked)}
                    className="w-4 h-4 accent-blue-700"
                  />
                  <span className="font-bold text-slate-800 text-sm">Siswa diasuh wali (bila ada)</span>
                </label>
                {waliAda && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Nama Lengkap Wali</label>
                      <input
                        type="text"
                        value={formData.wali?.nama || ''}
                        onChange={(e) => setWali('nama', e.target.value)}
                        placeholder="Nama lengkap wali"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Hubungan dengan Siswa</label>
                      <input
                        type="text"
                        value={formData.wali?.hubungan || ''}
                        onChange={(e) => setWali('hubungan', e.target.value)}
                        placeholder="Kakek, Paman, Kakak, dll."
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">NIK Wali <span title="Terkunci Dapodik">🔒</span></label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={16}
                        value={formData.wali?.nik || ''}
                        readOnly={kunciNilai(initialData?.wali?.nik)}
                        title={kunciNilai(initialData?.wali?.nik) ? 'Terkunci Dapodik — ubah via Sinkron Dapodik' : undefined}
                        onChange={(e) => setWali('nik', e.target.value)}
                        placeholder="16 digit NIK"
                        className={`w-full px-3 py-2 border border-slate-300 rounded-lg font-mono ${clsKunci(kunciNilai(initialData?.wali?.nik))}`}
                      />
                      {errText('wali.nik')}
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">No. HP / WhatsApp Wali</label>
                      <input
                        type="tel"
                        inputMode="tel"
                        value={formData.wali?.noTelepon || ''}
                        onChange={(e) => setWali('noTelepon', e.target.value)}
                        placeholder="0812xxxxxxxx"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Pekerjaan Wali</label>
                      <KodeSelect
                        value={formData.wali?.pekerjaan || 'Lainnya'}
                        options={PEKERJAAN_OPTIONS}
                        ariaLabel="Pekerjaan wali"
                        onChange={(v) => setWali('pekerjaan', v)}
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Alamat Wali</label>
                      <input
                        type="text"
                        value={formData.wali?.alamat || ''}
                        onChange={(e) => setWali('alamat', e.target.value)}
                        placeholder="Alamat tempat tinggal wali"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* LANGKAH 4: AKADEMIK */}
          {activeStep === 'akademik' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Rombel Saat Ini *</label>
                  <input
                    type="text"
                    required
                    value={formData.rombelSaatIni}
                    onChange={(e) => set('rombelSaatIni', e.target.value)}
                    placeholder={jenjang === 'SD' ? 'Contoh: 1A, 2B, 3A' : 'Contoh: 7A, 8B, 9A'}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold text-blue-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                  {errText('rombelSaatIni')}
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tingkat Kelas *</label>
                  <select
                    value={formData.diterimaDiTingkat}
                    onChange={(e) => set('diterimaDiTingkat', e.target.value as TingkatKelas)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-bold focus:ring-2 focus:ring-blue-600 focus:outline-none"
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
                  {errText('diterimaDiTingkat')}
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Status Siswa *</label>
                  <select
                    value={formData.statusSiswa}
                    onChange={(e) => handleStatusChange(e.target.value as StatusSiswa)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-bold focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  >
                    <option value="Aktif">Aktif</option>
                    <option value="Lulus">Lulus</option>
                    <option value="Mutasi Keluar">Mutasi Keluar (Pindah Sekolah)</option>
                    <option value="Mengundurkan Diri">Mengundurkan Diri</option>
                    <option value="Meninggal Dunia">Meninggal Dunia</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tanggal Diterima / Masuk *</label>
                  <input
                    type="date"
                    value={formData.tanggalDiterima}
                    onChange={(e) => set('tanggalDiterima', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                  {errText('tanggalDiterima')}
                </div>
              </div>

              {formData.statusSiswa === 'Mutasi Keluar' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Sekolah Tujuan Mutasi</label>
                  <input
                    type="text"
                    value={formData.sekolahTujuan || ''}
                    onChange={(e) => set('sekolahTujuan', e.target.value)}
                    placeholder={jenjang === 'SD' ? 'Nama SD Tujuan' : 'Nama SMP Tujuan'}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              )}

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h4 className="font-bold text-slate-900 text-sm mb-3">
                  Asal Sekolah ({jenjang === 'SD' ? 'TK / PAUD / RA' : 'SD / MI'})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {jenjang === 'SD' ? 'Nama TK / PAUD / RA Asal' : 'Nama SD / MI Asal'}
                    </label>
                    <input
                      type="text"
                      value={formData.asalSdMi}
                      onChange={(e) => set('asalSdMi', e.target.value)}
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
                      inputMode="numeric"
                      value={formData.npsnSdMi}
                      onChange={(e) => set('npsnSdMi', e.target.value)}
                      placeholder="20101234"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Jalur Masuk PPDB</label>
                    <select
                      value={formData.jalurMasuk}
                      onChange={(e) => set('jalurMasuk', e.target.value as JalurMasuk)}
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
                    <select
                      value={formData.jenisPendaftaran || 'Siswa Baru'}
                      onChange={(e) => set('jenisPendaftaran', e.target.value as Siswa['jenisPendaftaran'])}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Siswa Baru">Siswa Baru</option>
                      <option value="Pindahan">Pindahan</option>
                      <option value="Kembali Bersekolah">Kembali Bersekolah</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* LANGKAH 5: TINJAU & SIMPAN */}
          {activeStep === 'tinjau' && (
            <div className="space-y-3">
              <p className="text-[11px] text-slate-500 font-semibold">
                Periksa kembali seluruh isian sebelum disimpan ke Buku Induk. Ketuk <span className="text-blue-700 font-bold">Ubah</span> untuk kembali ke langkah terkait.
              </p>
              <SumCard stepId="identitas" title="Identitas">
                <SumRow label="Nama Lengkap" value={formData.namaLengkap} />
                <SumRow label="Nama Panggilan" value={formData.namaPanggilan} />
                <SumRow label="Jenis Kelamin" value={formData.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan'} />
                <SumRow label="NISN" value={formData.nisn} />
                <SumRow label="NIPD" value={formData.nipd} />
                <SumRow label="NIK" value={formData.nik} />
                <SumRow label="No. KK" value={formData.noKk} />
                <SumRow label="No. Akta Lahir" value={formData.noAktaLahir} />
                <SumRow label="Tempat, Tanggal Lahir" value={`${formData.tempatLahir}, ${fmtTgl(formData.tanggalLahir)}`} />
                <SumRow label="Agama" value={formData.agama} />
              </SumCard>
              <SumCard stepId="alamat" title="Alamat & Domisili">
                <SumRow label="Alamat" value={formData.alamat} />
                <SumRow label="RT / RW" value={formData.rt && formData.rw ? `${formData.rt} / ${formData.rw}` : ''} />
                <SumRow label="Dusun" value={formData.dusun} />
                <SumRow label="Desa / Kelurahan" value={formData.kelurahan} />
                <SumRow label="Kecamatan" value={formData.kecamatan} />
                <SumRow label="Kabupaten / Kota" value={formData.kabupatenKota} />
                <SumRow label="Provinsi" value={formData.provinsi} />
                <SumRow label="Kode Pos" value={formData.kodePos} />
              </SumCard>
              <SumCard stepId="ortu" title="Orang Tua / Wali">
                <SumRow label="Nama Ayah" value={formData.ayah.nama} />
                <SumRow label="Pekerjaan Ayah" value={formData.ayah.pekerjaan} />
                <SumRow label="No. HP Ayah" value={formData.ayah.noTelepon} />
                <SumRow label="Nama Ibu" value={formData.ibu.nama} />
                <SumRow label="Pekerjaan Ibu" value={formData.ibu.pekerjaan} />
                <SumRow label="No. HP Ibu" value={formData.ibu.noTelepon} />
                {waliAda && formData.wali?.nama.trim() && (
                  <>
                    <SumRow label="Nama Wali" value={formData.wali.nama} />
                    <SumRow label="Hubungan" value={formData.wali.hubungan} />
                    <SumRow label="No. HP Wali" value={formData.wali.noTelepon} />
                  </>
                )}
              </SumCard>
              <SumCard stepId="akademik" title="Akademik">
                <SumRow label="Rombel Saat Ini" value={formData.rombelSaatIni} />
                <SumRow label="Tingkat" value={`Kelas ${formData.diterimaDiTingkat}`} />
                <SumRow label="Status" value={formData.statusSiswa} />
                {formData.statusSiswa === 'Mutasi Keluar' && (
                  <SumRow label="Sekolah Tujuan" value={formData.sekolahTujuan} />
                )}
                <SumRow label="Tanggal Diterima" value={fmtTgl(formData.tanggalDiterima)} />
                <SumRow label="Asal Sekolah" value={formData.asalSdMi} />
                <SumRow label="NPSN Asal" value={formData.npsnSdMi} />
                <SumRow label="Jalur Masuk" value={formData.jalurMasuk} />
                <SumRow label="Jenis Pendaftaran" value={formData.jenisPendaftaran} />
              </SumCard>
            </div>
          )}

          {/* Footer wizard — sticky, tombol full-width di mobile */}
          <div className="pt-4 border-t border-slate-200 sticky bottom-0 bg-white pb-1">
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="ui-btn ui-btn-ghost w-full sm:w-auto"
              >
                Batal
              </button>
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                {!isFirstStep && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="ui-btn ui-btn-outline w-full sm:w-auto"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Kembali
                  </button>
                )}
                {!isLastStep ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="ui-btn ui-btn-primary w-full sm:w-auto"
                  >
                    Lanjut: {STEPS[stepIndex + 1]?.label}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={saving}
                    className="ui-btn ui-btn-primary w-full sm:w-auto"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Menyimpan...' : 'Simpan ke Buku Induk'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
