export type JenisKelamin = 'L' | 'P';
export type Agama = 'Islam' | 'Kristen' | 'Katholik' | 'Hindu' | 'Buddha' | 'Khonghucu' | 'Kepercayaan';
export type StatusSiswa = 'Aktif' | 'Lulus' | 'Mutasi Keluar' | 'Mengundurkan Diri' | 'Meninggal Dunia';
export type JenjangSekolah = 'SD' | 'SMP';
export type TingkatKelasSD = '1' | '2' | '3' | '4' | '5' | '6';
export type TingkatKelasSMP = '7' | '8' | '9';
export type TingkatKelas = TingkatKelasSD | TingkatKelasSMP;
export type FaseKurikulum = 'Fase A' | 'Fase B' | 'Fase C' | 'Fase D';
export type JalurMasuk = 'Zonasi' | 'Afirmasi' | 'Prestasi' | 'Perpindahan Tugas Orang Tua' | 'Mutasi/Pindahan';

export type PredikatP5 = 'Mulai Berkembang' | 'Sedang Berkembang' | 'Berkembang Sesuai Harapan' | 'Sangat Berkembang';

export interface P5Project {
  id: string;
  tema: 'Gaya Hidup Berkelanjutan' | 'Kearifan Lokal' | 'Bhinneka Tunggal Ika' | 'Bangunlah Jiwa dan Raganya' | 'Suara Demokrasi' | 'Rekayasa dan Teknologi' | 'Kewirausahaan';
  judulProjek: string;
  fase: FaseKurikulum;
  tingkat: TingkatKelas;
  semester: '1' | '2';
  tahunAjaran: string;
  dimensi: {
    berimanBertakwa: PredikatP5;
    berkebinekaanGlobal: PredikatP5;
    bergotongRoyong: PredikatP5;
    mandiri: PredikatP5;
    bernalarKritis: PredikatP5;
    kreatif: PredikatP5;
  };
  catatanProses: string;
}

export interface EkstrakurikulerItem {
  id: string;
  nama: string;
  keterangan: string;
  predikat: 'Sangat Baik' | 'Baik' | 'Cukup';
  tingkat: TingkatKelas;
}

export interface PrestasiItem {
  id: string;
  namaLomba: string;
  bidang: 'Akademik' | 'Seni' | 'Olahraga' | 'Keagamaan' | 'Lainnya';
  tingkat: 'Sekolah' | 'Kecamatan' | 'Kabupaten/Kota' | 'Provinsi' | 'Nasional' | 'Internasional';
  peringkat: string;
  tahun: string;
  penyelenggara: string;
}

export interface RiwayatSemester {
  id: string;
  semester: '1' | '2';
  tingkat: TingkatKelas;
  tahunAjaran: string;
  sakit: number;
  izin: number;
  alpa: number;
  statusKenaikan: 'Belum Ditentukan' | 'Naik Kelas' | 'Tinggal di Kelas' | 'Lulus' | 'Tidak Lulus';
  catatanWaliKelas: string;
}

// ---------------- MODEL PENCATATAN NILAI RAPORT ----------------

export interface NilaiMataPelajaran {
  id: string;
  mataPelajaran: string;
  namaMapel?: string; // alias for display
  kategori?: 'Wajib' | 'Pilihan' | 'Muatan Lokal';
  nilaiAkhir: number; // 0 - 100
  predikat?: 'A' | 'B' | 'C' | 'D';
  capaianTertinggi?: string; // Capaian kompetensi tertinggi (Kurikulum Merdeka)
  capaianPerluPeningkatan?: string; // Capaian kompetensi yang perlu bimbingan/peningkatan
}

export interface RaportSemester {
  id: string;
  siswaId: string;
  tahunAjaran: string; // e.g. "2023/2024", "2024/2025"
  semester: '1' | '2';
  tingkat: TingkatKelas;
  rombel: string; // e.g. "1A", "7A"
  fase?: FaseKurikulum;
  waliKelas?: string;
  nipWaliKelas?: string;
  tanggalRaport?: string;
  nilaiMapel: NilaiMataPelajaran[];
  nilaiMataPelajaran?: NilaiMataPelajaran[];
  rataRataNilai?: number;
  ekstrakurikuler?: {
    nama: string;
    predikat: 'Sangat Baik' | 'Baik' | 'Cukup';
    keterangan: string;
  }[];
  kehadiran: {
    sakit: number;
    izin: number;
    alpa: number;
  };
  catatanWaliKelas?: string;
  statusKenaikan?: 'Belum Ditentukan' | 'Naik Kelas' | 'Tinggal di Kelas' | 'Lulus' | 'Tidak Lulus';
  keteranganKenaikan?: string;
  naikKeTingkat?: TingkatKelas;
}

// ---------------- RIWAYAT TAHUNAN (MULTI-TAHUN) ----------------

export type StatusKenaikanKelas = 'Naik Kelas' | 'Tinggal di Kelas' | 'Lulus' | 'Mutasi Keluar' | 'Belum Ditentukan';

export interface RiwayatTahunAjaran {
  id: string;
  tahunAjaran: string; // e.g. "2022/2023", "2023/2024"
  tingkat: TingkatKelas;
  rombel: string;
  waliKelas?: string;
  statusAkhirTahun?: StatusKenaikanKelas;
  statusKenaikan?: StatusKenaikanKelas;
  catatan?: string;
}

export interface Siswa {
  id: string;
  dapodikId?: string;
  
  // A. Identitas Siswa
  namaLengkap: string;
  namaPanggilan: string;
  jenisKelamin: JenisKelamin;
  nisn: string;
  nipd: string;
  nik: string;
  noKk: string;
  noAktaLahir: string;
  tempatLahir: string;
  tanggalLahir: string; // YYYY-MM-DD
  agama: Agama;
  kewarganegaraan: 'WNI' | 'WNA';
  anakKe: number;
  jumlahSaudaraKandung: number;
  jumlahSaudaraTiri: number;
  jumlahSaudaraAngkat: number;
  statusDalamKeluarga: 'Anak Kandung' | 'Anak Tiri' | 'Anak Angkat';
  bahasaSehariHari: string;
  fotoUrl?: string;

  // B. Kondisi Jasmani & Kesehatan
  golonganDarah: 'A' | 'B' | 'AB' | 'O' | '-';
  tinggiBadan: number; // cm
  beratBadan: number; // kg
  lingkarKepala?: number; // cm
  riwayatPenyakit: string;
  kelainanFisik: string;
  kebutuhanKhusus: string;

  // C. Tempat Tinggal
  alamat: string;
  rt: string;
  rw: string;
  dusun: string;
  kelurahan: string;
  kecamatan: string;
  kabupatenKota: string;
  provinsi: string;
  kodePos: string;
  tinggalDengan: 'Orang Tua' | 'Wali' | 'Asrama' | 'Kost' | 'Panti Asuhan' | 'Lainnya';
  jarakKeSekolahKm: number;
  transportasiKeSekolah: 'Jalan Kaki' | 'Sepeda' | 'Sepeda Motor' | 'Angkutan Umum' | 'Antar Jemput' | 'Lainnya';

  // D. Orang Tua & Wali
  ayah: {
    nama: string;
    nik: string;
    tahunLahir: string;
    pendidikan: string;
    pekerjaan: string;
    penghasilan: string;
    noTelepon: string;
    status: 'Masih Hidup' | 'Meninggal Dunia';
  };
  ibu: {
    nama: string;
    nik: string;
    tahunLahir: string;
    pendidikan: string;
    pekerjaan: string;
    penghasilan: string;
    noTelepon: string;
    status: 'Masih Hidup' | 'Meninggal Dunia';
  };
  wali?: {
    nama: string;
    nik: string;
    tahunLahir: string;
    pendidikan: string;
    pekerjaan: string;
    penghasilan: string;
    noTelepon: string;
    hubungan: string;
    alamat: string;
  };

  // E. Riwayat Pendidikan Sebelumnya (SD/MI)
  asalSdMi: string;
  npsnSdMi: string;
  noIjazahSd: string;
  tahunLulusSd: string;
  lamaBelajarSd: number;

  // F. Penerimaan di SMP
  tanggalDiterima: string;
  diterimaDiTingkat: TingkatKelas;
  diterimaDiRombel: string; // e.g. "7A"
  rombelSaatIni: string; // e.g. "7A", "8B", "9C"
  jalurMasuk: JalurMasuk;
  asalMutasi?: string;
  noSuratPenerimaan?: string;

  // G. Kurikulum Merdeka: P5, Ekskul, Prestasi
  p5Projects: P5Project[];
  ekstrakurikuler: EkstrakurikulerItem[];
  prestasi: PrestasiItem[];

  // H. Riwayat Semester, Raport, & Kehadiran
  riwayatSemester: RiwayatSemester[];
  nilaiRaport?: RaportSemester[];
  raportSemester?: RaportSemester[];
  riwayatTahunAjaran?: RiwayatTahunAjaran[];

  // I. Status Akhir & Mutasi
  statusSiswa: StatusSiswa;
  tanggalKeluar?: string;
  alasanKeluar?: string;
  sekolahTujuan?: string;
  noSuratMutasi?: string;
  noIjazahSmp?: string;
  tanggalIjazahSmp?: string;

  // Metadata
  createdAt: string;
  updatedAt: string;
  lastSyncedWithDapodik?: string;
}

export interface SekolahProfile {
  nama: string;
  npsn: string;
  nss: string;
  jenjang?: JenjangSekolah; // 'SD' | 'SMP'
  bentukPendidikan: string;
  statusSekolah: 'Negeri' | 'Swasta';
  alamat: string;
  desaKelurahan: string;
  kecamatan: string;
  kabupatenKota: string;
  provinsi: string;
  kodePos: string;
  telepon: string;
  email: string;
  website: string;
  kepalaSekolah: string;
  nipKepalaSekolah: string;
  petugasBukuInduk: string;
  nipPetugas: string;
  logoUrl?: string;
  semesterAktif: '1 (Ganjil)' | '2 (Genap)';
  tahunAjaran: string;
  lastSyncedWithDapodik?: string;
  syncSource?: string;
}

export type UserRole = 'administrator' | 'operator';

export interface AppUser {
  id: string;
  username: string;
  /** @deprecated Hanya untuk migrasi akun lama. Password baru selalu disimpan sebagai hash. */
  password?: string;
  /** Hash SHA-256 + salt, format "sha256$<salt>$<hash>". */
  passwordHash?: string;
  namaLengkap: string;
  role: UserRole;
  email: string;
  nomorTelepon?: string;
  jabatan?: string;
  rombelAkses?: string[]; // empty array or undefined means all rombels
  status: 'aktif' | 'nonaktif';
  terakhirLogin?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DapodikConfig {
  ip: string;
  port: number;
  npsn: string;
  token: string;
  semesterId: string;
  autoSync: boolean;
}

export interface DapodikSyncLog {
  id: string;
  timestamp: string;
  status: 'success' | 'warning' | 'error';
  totalDapodik: number;
  ditambahkan: number;
  diperbarui: number;
  dilewati: number;
  pesan: string;
  detail?: string;
}

export interface DapodikRawPesertaDidik {
  peserta_didik_id: string;
  nama: string;
  jenis_kelamin: 'L' | 'P';
  nisn: string;
  nipd: string;
  nik: string;
  tempat_lahir: string;
  tanggal_lahir: string;
  agama_id_str: string;
  alamat_jalan: string;
  rt: string;
  rw: string;
  nama_dusun: string;
  desa_kelurahan: string;
  kecamatan: string;
  kode_pos: string;
  nama_ayah: string;
  nik_ayah?: string;
  pekerjaan_ayah_id_str?: string;
  penghasilan_ayah_id_str?: string;
  nama_ibu: string;
  nik_ibu?: string;
  pekerjaan_ibu_id_str?: string;
  penghasilan_ibu_id_str?: string;
  nama_wali?: string;
  nomor_telepon_seluler?: string;
  sekolah_asal?: string;
  rombongan_belajar?: string;
  nama_rombel?: string;
  tingkat_pendidikan_id?: string | number;
  anak_keberapa?: number;
  kewarganegaraan?: string;
  berat_badan?: number;
  tinggi_badan?: number;
}

export interface DapodikRawSekolah {
  sekolah_id?: string;
  nama: string;
  npsn: string;
  nss?: string;
  bentuk_pendidikan_id_str?: string;
  status_sekolah?: string;
  alamat_jalan?: string;
  rt?: string;
  rw?: string;
  nama_dusun?: string;
  desa_kelurahan?: string;
  kecamatan?: string;
  kabupaten_kota?: string;
  provinsi?: string;
  kode_pos?: string;
  nomor_telepon?: string;
  nomor_fax?: string;
  email?: string;
  website?: string;
  kepala_sekolah?: string;
  nip_kepala_sekolah?: string;
  semester_id?: string;
  tahun_ajaran?: string;
}
