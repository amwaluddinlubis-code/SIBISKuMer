export type JenisKelamin = 'L' | 'P';
export type Agama = 'Islam' | 'Kristen' | 'Katholik' | 'Hindu' | 'Buddha' | 'Khonghucu' | 'Kepercayaan' | 'Lainnya';
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
  tahunAjaran: string; // e.g. "2026/2027", "2027/2028"
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
  tahunAjaran: string; // e.g. "2026/2027", "2027/2028"
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
  /** Mini JPEG (≤60KB) untuk sinkron cloud via Firestore — tanpa Storage.
   *  Dipakai sebagai fallback tampil bila fotoUrl lokal kosong. */
  fotoMini?: string;

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
  tinggalDengan: 'Orang Tua' | 'Wali' | 'Asrama' | 'Kost' | 'Panti Asuhan' | 'Pesantren' | 'Lainnya';
  jarakKeSekolahKm: number;
  transportasiKeSekolah:
    | 'Jalan Kaki'
    | 'Sepeda'
    | 'Sepeda Motor'
    | 'Angkutan Umum'
    | 'Antar Jemput'
    | 'Angkutan umum/bus/pete-pete'
    | 'Mobil/bus antar jemput'
    | 'Kereta api'
    | 'Ojek'
    | 'Andong/bendi/sado/dokar/delman/becak'
    | 'Perahu penyeberangan/rakit/getek'
    | 'Kuda'
    | 'Mobil Pribadi'
    | 'Lainnya';
  /** Minat (tabel kode hobi) & cita-cita (tabel kode profesi). */
  hobi?: string;
  citaCita?: string;

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
  /** Jenis pendaftaran Dapodik (Siswa Baru / Pindahan / Kembali Bersekolah). */
  jenisPendaftaran?: 'Siswa Baru' | 'Pindahan' | 'Kembali Bersekolah';
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

// ---------------- KOP SURAT CETAKAN ----------------
// Tersimpan di SekolahProfile.kop (ikut backup/restore & multi-sekolah).
// Teks kosong = otomatis dari profil (lihat resolveKop di utils/kop.ts).

export type KopGaris = 'ganda' | 'tunggal' | 'tanpa';
export type KopLogoKanan = 'badge' | 'gambar' | 'sembunyi';
export type KopUkuranNama = 'normal' | 'besar';
/** Sumber wilayah otomatis untuk baris 1 kop bila dikosongkan. */
export type KopOtoritas = 'provinsi' | 'kabupaten' | 'kota';
/** Jenis huruf judul kop (serif tegas = standar kop dinas). */
export type KopFontJudul = 'serif' | 'sans';

export interface KopSurat {
  /** Baris 1 kop (cth. "PEMERINTAH KABUPATEN MANDAILING NATAL"); kosong = otomatis. */
  baris1?: string;
  /** Baris 2 kop (cth. "DINAS PENDIDIKAN DAN KEBUDAYAAN"); kosong = otomatis. */
  baris2?: string;
  /** Wilayah otomatis baris 1 bila baris1 dikosongkan. */
  otoritas: KopOtoritas;
  /** Jenis huruf ketiga judul kop. */
  fontJudul: KopFontJudul;
  tampilBaris1: boolean;
  tampilBaris2: boolean;
  /** Logo kiri (dataURL hasil unggah); kosong = emblem generik. */
  logoKiriUrl?: string;
  tampilLogoKiri: boolean;
  logoKananMode: KopLogoKanan;
  /** Logo kanan kustom (dataURL); dipakai bila logoKananMode === 'gambar'. */
  logoKananUrl?: string;
  tampilAlamat: boolean;
  tampilKontak: boolean;
  tampilWebsite: boolean;
  garis: KopGaris;
  ukuranNama: KopUkuranNama;
}

// ---------------- TEMA TAMPILAN ----------------
// Aksen biru untuk SMP, maroon untuk SD. Otomatis mengikuti jenjang,
// dapat dikunci manual. Hanya administrator yang dapat mengubah.

export type TemaMode = 'otomatis' | 'biru' | 'maroon';

/** Mode tampilan layar: terang / gelap / mengikuti sistem. Per perangkat
 *  (localStorage), bukan per sekolah — preferensi pribadi, semua peran. */
export type ModeTampilan = 'terang' | 'gelap' | 'otomatis';

export interface TemaKustom {
  mode: TemaMode;
}

export interface SekolahProfile {  nama: string;
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
  /** Pengaturan kop surat cetakan (lembar induk, raport, rekap). */
  kop?: KopSurat;
  /** Tema warna tampilan (khusus administrator). */
  tema?: TemaKustom;
}

export type UserRole = 'administrator' | 'operator';

export interface AppUser {
  id: string;
  username: string;
  password?: string;
  namaLengkap: string;
  role: UserRole;
  email: string;
  nomorTelepon?: string;
  jabatan?: string;
  rombelAkses?: string[]; // empty array or undefined means all rombels
  /** Batas tahun ajaran login. Kosong/undefined = semua tahun. Cth. ["2026/2027"]. */
  tahunAkses?: string[];
  status: 'aktif' | 'nonaktif';
  /** True = wajib mengganti kata sandi saat login berikutnya (akun bawaan). */
  mustChangePassword?: boolean;
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
  status_sekolah_str?: string;
  alamat_jalan?: string;
  rt?: string;
  rw?: string;
  dusun?: string;
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

// ---------------- DATA REFERENSI DAPODIK (full-sync) ----------------
// Skema Web Service Dapodik bisa berbeda antarversi; semua field opsional
// dan konverter memakai beberapa alias agar tetap terbaca.

export interface DapodikRawRombel {
  rombongan_belajar_id: string;
  nama: string;
  tingkat_pendidikan_id?: string | number;
  jenis_rombel?: string;
  jurusan?: string;
  jurusan_id_str?: string;
  jumlah_anggota?: number;
  wali?: string;
  nama_wali?: string;
  nip_wali?: string;
  semester_id?: string;
  [key: string]: unknown;
}

export interface DapodikRawPtk {
  ptk_id: string;
  nama: string;
  nip?: string;
  nik?: string;
  nuptk?: string;
  jenis_ptk_id_str?: string;
  jenis_kelamin?: 'L' | 'P';
  tempat_lahir?: string;
  tanggal_lahir?: string;
  status_kepegawaian_id_str?: string;
  mata_pelajaran_ajar?: string;
  tugas_tambahan?: string;
  [key: string]: unknown;
}

export interface DapodikRawPengguna {
  pengguna_id: string;
  username: string;
  nama?: string;
  peran?: string;
  peran_id_str?: string;
  email?: string;
  aktif?: string | number | boolean;
  [key: string]: unknown;
}

// Referensi lokal hasil sinkronisasi (disimpan di IndexedDB)

export interface RombelRef {
  id: string;
  dapodikId?: string;
  nama: string;
  tingkat?: TingkatKelas;
  jenisRombel?: string;
  waliKelas?: string;
  jumlahAnggota?: number;
  tahunAjaran?: string;
  updatedAt: string;
  source: 'dapodik' | 'manual';
}

export interface PtkRef {
  id: string;
  dapodikId?: string;
  nama: string;
  nip?: string;
  nik?: string;
  nuptk?: string;
  jenisKelamin?: 'L' | 'P';
  tempatLahir?: string;
  tanggalLahir?: string;
  jenisPtk?: string;
  statusKepegawaian?: string;
  mapelAjar?: string;
  tugasTambahan?: string;
  updatedAt: string;
  source: 'dapodik' | 'manual';
}

// ---------------- ARSIP TAHUN AJARAN (tutup tahun, terkunci) ----------------
// Potret roster + ringkasan saat tahun ajaran ditutup. Kunci membuat raport &
// promosi tahun tersebut ditolak (buka ulang hanya oleh administrator).

export interface RosterArsip {
  siswaId: string;
  namaLengkap: string;
  nisn: string;
  tingkat: string;
  rombel: string;
  /** Status saat penutupan: Aktif / Lulus / Mutasi Keluar / ... */
  status: string;
}

export interface RingkasanTutupTahun {
  totalSiswa: number;
  perTingkat: Record<string, number>;
  perRombel: Record<string, number>;
  lulus: number;
  naik: number;
  tinggal: number;
  mutasi: number;
}

export interface TutupTahunAjaran {
  /** Kunci unik, format "2026/2027". */
  tahunAjaran: string;
  ditutupPada: string;
  ditutupOleh?: string;
  /** Tahun ajaran aktif yang ditetapkan setelah penutupan. */
  tahunAktifBaru?: string;
  ringkasan: RingkasanTutupTahun;
  roster: RosterArsip[];
}

// ---------------- PEMETAAN KELAS PER TAHUN AJARAN ----------------
// Daftar rombel resmi tiap tahun ajaran (khusus administrator). Dipakai sebagai
// acuan target promosi & validasi rombel; terpisah dari RombelRef sinkronisasi.

export interface PetaKelas {
  id: string;
  tahunAjaran: string; // "2027/2028"
  tingkat: TingkatKelas;
  rombel: string; // "8A"
  waliKelas?: string;
  updatedAt: string;
  source: 'manual' | 'generate';
  /** Anggota arsip (ID siswa) — dipakai untuk tahun non-aktif hasil Petakan
   *  Mundur. Tahun aktif tetap membaca rombelSaatIni siswa (live). */
  anggotaIds?: string[];
}

// ---------------- MULTI-SEKOLAH (satu laptop, banyak database) ----------------
// Tiap sekolah punya database IndexedDB sendiri (isolasi penuh ala Dapodik).
// Registry-nya ringan dan global (localStorage).

export interface SchoolEntry {
  id: string;
  nama: string;
  npsn: string;
  jenjang: JenjangSekolah;
  bentukPendidikan?: string;
  /** Nama database IndexedDB sekolah ini. DB lama = 'BukuInduk_Merdeka_DB'. */
  dbName: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------- AUDIT LOG (jejak siapa-ubah-apa) ----------------
// Ditulis otomatis pada aksi penting (login, kelola akun, data siswa,
// tutup tahun, sinkron, backup). Hanya administrator yang dapat melihat
// (tab Log Audit) & menghapus. Dibatasi 2000 entri terbaru per database.

export type AuditAksi =
  | 'login'
  | 'logout'
  | 'sesi_pindah'
  | 'login_gagal'
  | 'login_terkunci'
  | 'akun_buat'
  | 'akun_ubah'
  | 'akun_hapus'
  | 'password_ubah'
  | 'password_reset'
  | 'ganti_password_bawaan'
  | 'impersonate_mulai'
  | 'impersonate_selesai'
  | 'siswa_tambah'
  | 'siswa_ubah'
  | 'siswa_hapus'
  | 'mutasi_masuk'
  | 'mutasi_keluar'
  | 'tutup_tahun'
  | 'buka_tahun'
  | 'sinkron_terapkan'
  | 'backup_buat'
  | 'backup_pulihkan'
  | 'backup_reset'
  | 'cloud_unggah'
  | 'cloud_unduh'
  | 'cloud_sinkron';

export interface AuditLog {
  id: string;
  timestamp: string;
  /** Username pelaku (atau 'sistem'). */
  aktor: string;
  peran?: string;
  aksi: AuditAksi;
  /** Kelompok entitas: 'akun' | 'siswa' | 'tahun' | 'sinkron' | 'backup' | 'sesi'. */
  entitas: string;
  entitasId?: string;
  ringkasan: string;
  detail?: string;
}

// ---------------- CADANGAN OTOMATIS (auto-backup terjadwal) ----------------
// Snapshot JSON penuh disimpan di IndexedDB (bukan unduhan file) agar tidak
// diblokir browser; maksimal 5 snapshot terbaru per database.

export interface AutoBackupSetting {
  aktif: boolean;
  /** Interval menit: 15 | 30 | 60 | 120 | 240. */
  intervalMenit: number;
  terakhirJalan?: string | null;
  terakhirStatus?: string | null;
}

export interface AutoBackupSnapshot {
  id: string;
  timestamp: string;
  dibuatOleh: string;
  ukuranBytes: number;
  jumlahSiswa: number;
  /** Isi JSON BackupPayload (string) agar hemat parse saat listing. */
  payload: string;
}
