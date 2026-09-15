import React, { useState } from 'react';
import { X, Save, User, Heart, Home, Users, School, Sparkles, BookOpen, AlertCircle, Plus, Trash2, Award, Calendar, GraduationCap } from 'lucide-react';
import { Siswa, JenisKelamin, Agama, TingkatKelas, JalurMasuk, StatusSiswa, PredikatP5, JenjangSekolah, RiwayatTahunAjaran, StatusKenaikanKelas } from '../types';

interface SiswaFormModalProps {
  initialData?: Siswa | null;
  jenjang?: JenjangSekolah;
  onSave: (siswa: Siswa) => Promise<void>;
  onClose: () => void;
}

export const SiswaFormModal: React.FC<SiswaFormModalProps> = ({
  initialData,
  jenjang = 'SMP',
  onSave,
  onClose
}) => {
  const isEdit = !!initialData;
  const [activeSection, setActiveSection] = useState<'identitas' | 'fisik-domisili' | 'ortu' | 'sekolah' | 'merdeka' | 'semester' | 'raport-riwayat'>('identitas');
  const [saving, setSaving] = useState(false);

  // Form State initialized from initialData or new template
  const [formData, setFormData] = useState<Siswa>(() => {
    if (initialData) return { ...initialData };
    const now = new Date().toISOString();
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
        pendidikan: 'SMA / Sederajat',
        pekerjaan: 'Wiraswasta',
        penghasilan: 'Rp 2.000.000 - Rp 5.000.000',
        noTelepon: '',
        status: 'Masih Hidup'
      },
      ibu: {
        nama: '',
        nik: '',
        tahunLahir: '1978',
        pendidikan: 'SMA / Sederajat',
        pekerjaan: 'Ibu Rumah Tangga',
        penghasilan: 'Tidak Berpenghasilan',
        noTelepon: '',
        status: 'Masih Hidup'
      },
      asalSdMi: '',
      npsnSdMi: '',
      noIjazahSd: '',
      tahunLulusSd: '2024',
      lamaBelajarSd: 6,
      tanggalDiterima: '2024-07-15',
      diterimaDiTingkat: '7',
      diterimaDiRombel: '7A',
      rombelSaatIni: '7A',
      jalurMasuk: 'Zonasi',
      p5Projects: [
        {
          id: `p5-init-${Date.now()}`,
          tema: 'Gaya Hidup Berkelanjutan',
          judulProjek: 'Pengurangan Jejak Karbon dan Kebersihan Lingkungan Sekolah',
          fase: 'Fase D',
          tingkat: '7',
          semester: '1',
          tahunAjaran: '2024/2025',
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
          nama: 'Pramuka Penggalang (Wajib)',
          keterangan: 'Mengikuti latihan rutin pramuka',
          predikat: 'Baik',
          tingkat: '7'
        }
      ],
      prestasi: [],
      riwayatSemester: [
        {
          id: `rs-init-${Date.now()}`,
          semester: '1',
          tingkat: '7',
          tahunAjaran: '2024/2025',
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
    if (!formData.namaLengkap.trim()) {
      alert('Nama lengkap siswa wajib diisi!');
      setActiveSection('identitas');
      return;
    }
    if (!formData.nisn.trim()) {
      alert('NISN siswa wajib diisi!');
      setActiveSection('identitas');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        ...formData,
        namaLengkap: formData.namaLengkap.trim().toUpperCase(),
        updatedAt: new Date().toISOString()
      });
      onClose();
    } catch (err: any) {
      alert(`Gagal menyimpan data siswa: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAddPrestasi = () => {
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
          tahun: '2024',
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
    const newEntry: RiwayatTahunAjaran = {
      id: `rta-${Date.now()}`,
      tahunAjaran: '2023/2024',
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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-xs">
        {/* Header Modal */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-sm sm:text-base">
              {isEdit ? `Edit Lembar Buku Induk: ${initialData?.namaLengkap}` : `Pendaftaran Siswa Baru (Buku Induk ${jenjang})`}
            </h3>
            <p className="text-[11px] text-slate-300">
              Formulir Standar Kurikulum Merdeka ({jenjang === 'SD' ? 'Fase A/B/C SD' : 'Fase D SMP'})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section Navigation Tabs */}
        <div className="bg-slate-100 border-b border-slate-200 px-4 flex gap-1 overflow-x-auto shrink-0 scrollbar-none py-1.5">
          {[
            { id: 'identitas', label: '1. Identitas Siswa', icon: User },
            { id: 'fisik-domisili', label: '2. Jasmani & Domisili', icon: Heart },
            { id: 'ortu', label: '3. Orang Tua / Wali', icon: Users },
            { id: 'sekolah', label: jenjang === 'SD' ? '4. TK Asal & Masuk SD' : '4. SD Asal & Masuk SMP', icon: School },
            { id: 'merdeka', label: '5. P5, Ekskul & Prestasi', icon: Sparkles },
            { id: 'semester', label: '6. Status Keaktifan', icon: BookOpen },
            { id: 'raport-riwayat', label: '7. Nilai Rapor & Riwayat TA', icon: Award }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold whitespace-nowrap transition text-xs cursor-pointer ${
                  isActive
                    ? 'bg-blue-700 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Form Body Scrollable */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* SECTION 1: IDENTITAS */}
          {activeSection === 'identitas' && (
            <div className="space-y-4">
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
                    onChange={(e) => setFormData({ ...formData, jenisKelamin: e.target.value as JenisKelamin })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  >
                    <option value="L">Laki-laki (L)</option>
                    <option value="P">Perempuan (P)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    NISN (10 Digit) *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={formData.nisn}
                    onChange={(e) => setFormData({ ...formData, nisn: e.target.value })}
                    placeholder="Contoh: 0091234567"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    No. Induk / NIPD
                  </label>
                  <input
                    type="text"
                    value={formData.nipd}
                    onChange={(e) => setFormData({ ...formData, nipd: e.target.value })}
                    placeholder="Contoh: 242507001"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Agama & Kepercayaan
                  </label>
                  <select
                    value={formData.agama}
                    onChange={(e) => setFormData({ ...formData, agama: e.target.value as Agama })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  >
                    <option value="Islam">Islam</option>
                    <option value="Kristen">Kristen</option>
                    <option value="Katholik">Katholik</option>
                    <option value="Hindu">Hindu</option>
                    <option value="Buddha">Buddha</option>
                    <option value="Khonghucu">Khonghucu</option>
                    <option value="Kepercayaan">Kepercayaan</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    NIK / No. KTP Siswa
                  </label>
                  <input
                    type="text"
                    maxLength={16}
                    value={formData.nik}
                    onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
                    placeholder="16 digit NIK"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    No. Kartu Keluarga (KK)
                  </label>
                  <input
                    type="text"
                    maxLength={16}
                    value={formData.noKk}
                    onChange={(e) => setFormData({ ...formData, noKk: e.target.value })}
                    placeholder="16 digit No. KK"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    No. Registrasi Akta Lahir
                  </label>
                  <input
                    type="text"
                    value={formData.noAktaLahir}
                    onChange={(e) => setFormData({ ...formData, noAktaLahir: e.target.value })}
                    placeholder="Contoh: 3201-LT-15042009-0012"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tempat Lahir
                  </label>
                  <input
                    type="text"
                    value={formData.tempatLahir}
                    onChange={(e) => setFormData({ ...formData, tempatLahir: e.target.value })}
                    placeholder="Contoh: Bandung"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tanggal Lahir
                  </label>
                  <input
                    type="date"
                    value={formData.tanggalLahir}
                    onChange={(e) => setFormData({ ...formData, tanggalLahir: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
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
                      <select
                        value={formData.tinggalDengan}
                        onChange={(e) => setFormData({ ...formData, tinggalDengan: e.target.value as any })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="Orang Tua">Orang Tua</option>
                        <option value="Wali">Wali</option>
                        <option value="Kost">Kost</option>
                        <option value="Asrama">Asrama</option>
                        <option value="Panti Asuhan">Panti Asuhan</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Transportasi ke Sekolah</label>
                      <select
                        value={formData.transportasiKeSekolah}
                        onChange={(e) => setFormData({ ...formData, transportasiKeSekolah: e.target.value as any })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="Jalan Kaki">Jalan Kaki</option>
                        <option value="Sepeda">Sepeda</option>
                        <option value="Sepeda Motor">Sepeda Motor</option>
                        <option value="Angkutan Umum">Angkutan Umum</option>
                        <option value="Antar Jemput">Antar Jemput</option>
                      </select>
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
                    <label className="block font-semibold text-slate-700 mb-1">NIK Ayah</label>
                    <input
                      type="text"
                      maxLength={16}
                      value={formData.ayah.nik}
                      onChange={(e) => setFormData({
                        ...formData,
                        ayah: { ...formData.ayah, nik: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Pekerjaan Ayah</label>
                    <input
                      type="text"
                      value={formData.ayah.pekerjaan}
                      onChange={(e) => setFormData({
                        ...formData,
                        ayah: { ...formData.ayah, pekerjaan: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Pendidikan Terakhir</label>
                    <input
                      type="text"
                      value={formData.ayah.pendidikan}
                      onChange={(e) => setFormData({
                        ...formData,
                        ayah: { ...formData.ayah, pendidikan: e.target.value }
                      })}
                      placeholder="Contoh: S1 / SMA"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Penghasilan Bulanan</label>
                    <input
                      type="text"
                      value={formData.ayah.penghasilan}
                      onChange={(e) => setFormData({
                        ...formData,
                        ayah: { ...formData.ayah, penghasilan: e.target.value }
                      })}
                      placeholder="Rp 2.000.000 - Rp 5.000.000"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
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
                    <label className="block font-semibold text-slate-700 mb-1">NIK Ibu</label>
                    <input
                      type="text"
                      maxLength={16}
                      value={formData.ibu.nik}
                      onChange={(e) => setFormData({
                        ...formData,
                        ibu: { ...formData.ibu, nik: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Pekerjaan Ibu</label>
                    <input
                      type="text"
                      value={formData.ibu.pekerjaan}
                      onChange={(e) => setFormData({
                        ...formData,
                        ibu: { ...formData.ibu, pekerjaan: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Pendidikan Terakhir</label>
                    <input
                      type="text"
                      value={formData.ibu.pendidikan}
                      onChange={(e) => setFormData({
                        ...formData,
                        ibu: { ...formData.ibu, pendidikan: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Penghasilan Bulanan</label>
                    <input
                      type="text"
                      value={formData.ibu.penghasilan}
                      onChange={(e) => setFormData({
                        ...formData,
                        ibu: { ...formData.ibu, penghasilan: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
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
                </div>
              </div>
            </div>
          )}

          {/* SECTION 5: MERDEKA P5, EKSKUL & PRESTASI */}
          {activeSection === 'merdeka' && (
            <div className="space-y-4">
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
                              placeholder="2023/2024"
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
                              placeholder="7A"
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

                {(!formData.raportSemester || formData.raportSemester.length === 0) ? (
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
                        {formData.raportSemester.map((rp, idx) => {
                          const total = rp.nilaiMataPelajaran.reduce((acc, m) => acc + m.nilaiAkhir, 0);
                          const avg = rp.nilaiMataPelajaran.length > 0 ? Math.round(total / rp.nilaiMataPelajaran.length) : 0;
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
                                {rp.nilaiMataPelajaran.length} Mapel
                              </td>
                              <td className="border border-slate-300 px-3 py-2 text-center font-mono font-bold text-emerald-700">
                                {avg}
                              </td>
                              <td className="border border-slate-300 px-3 py-2 text-center font-mono text-slate-600">
                                {rp.kehadiran.sakit}/{rp.kehadiran.izin}/{rp.kehadiran.tanpaKeterangan}
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

          {/* Submit Footer */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl font-semibold transition"
            >
              Batal
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl shadow-md transition active:scale-95 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Menyimpan...' : 'Simpan ke Buku Induk'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
