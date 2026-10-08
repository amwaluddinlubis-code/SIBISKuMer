import { SekolahProfile, Siswa, DapodikConfig, DapodikRawPesertaDidik, DapodikRawSekolah, DapodikRawRombel, DapodikRawPtk, DapodikRawPengguna, AppUser } from '../types';

export const defaultSekolahProfile: SekolahProfile = {
  nama: 'SMP NEGERI 1 MERDEKA BELAJAR',
  npsn: '20104567',
  nss: '201010101001',
  jenjang: 'SMP',
  bentukPendidikan: 'SMP',
  statusSekolah: 'Negeri',
  alamat: 'Jl. Pendidikan Merdeka No. 45, Kompleks Edukasi',
  desaKelurahan: 'Mekar Jaya',
  kecamatan: 'Sukasari',
  kabupatenKota: 'Kota Nusantara',
  provinsi: 'Jawa Barat',
  kodePos: '40123',
  telepon: '(022) 7890123',
  email: 'smpn1merdekabelajar@sch.id',
  website: 'https://smpn1merdekabelajar.sch.id',
  kepalaSekolah: 'Dr. H. Ahmad Dahlan, M.Pd.',
  nipKepalaSekolah: '19740512 199903 1 002',
  petugasBukuInduk: 'Siti Rahmawati, S.Kom.',
  nipPetugas: '19850820 201001 2 015',
  semesterAktif: '1 (Ganjil)',
  tahunAjaran: '2026/2027',
  lastSyncedWithDapodik: '2026-07-20T08:30:00.000Z',
  syncSource: 'Dapodik Web Service v2026'
};

export const presetSekolahSD: SekolahProfile = {
  nama: 'SD NEGERI 01 MERDEKA BELAJAR',
  npsn: '10204588',
  nss: '101010101002',
  jenjang: 'SD',
  bentukPendidikan: 'SD',
  statusSekolah: 'Negeri',
  alamat: 'Jl. Ki Hajar Dewantara No. 10, Kompleks Pendidikan Dasar',
  desaKelurahan: 'Sukamaju',
  kecamatan: 'Sukasari',
  kabupatenKota: 'Kota Nusantara',
  provinsi: 'Jawa Barat',
  kodePos: '40124',
  telepon: '(022) 7890456',
  email: 'sdn01merdekabelajar@sch.id',
  website: 'https://sdn01merdekabelajar.sch.id',
  kepalaSekolah: 'Hj. Endang Sulastri, S.Pd., M.M.',
  nipKepalaSekolah: '19710815 199303 2 004',
  petugasBukuInduk: 'Ahmad Fauzi, S.Pd.',
  nipPetugas: '19880312 201201 1 008',
  semesterAktif: '1 (Ganjil)',
  tahunAjaran: '2026/2027',
  lastSyncedWithDapodik: '2026-07-20T08:30:00.000Z',
  syncSource: 'Dapodik Web Service v2026'
};

export const mockDapodikSekolah: DapodikRawSekolah = {
  sekolah_id: 'dpk-sch-20104567-uuid',
  nama: 'SMP NEGERI 1 MERDEKA BELAJAR',
  npsn: '20104567',
  nss: '201010101001',
  bentuk_pendidikan_id_str: 'SMP',
  status_sekolah: 'Negeri',
  alamat_jalan: 'Jl. Pendidikan Merdeka No. 45, Kompleks Edukasi',
  rt: '02',
  rw: '05',
  nama_dusun: 'Kompleks Pendidikan',
  desa_kelurahan: 'Mekar Jaya',
  kecamatan: 'Sukasari',
  kabupaten_kota: 'Kota Nusantara',
  provinsi: 'Jawa Barat',
  kode_pos: '40123',
  nomor_telepon: '(022) 7890123',
  nomor_fax: '(022) 7890124',
  email: 'smpn1merdekabelajar@sch.id',
  website: 'https://smpn1merdekabelajar.sch.id',
  kepala_sekolah: 'Dr. H. Ahmad Dahlan, M.Pd.',
  nip_kepala_sekolah: '19740512 199903 1 002',
  semester_id: '20261',
  tahun_ajaran: '2026/2027'
};

export const initialUsersList: AppUser[] = [
  {
    id: 'usr-admin-01',
    username: 'administrator',
    password: 'administrator',
    namaLengkap: 'Administrator Sistem',
    role: 'administrator',
    email: 'admin@smpn1merdekabelajar.sch.id',
    nomorTelepon: '081234567890',
    jabatan: 'Koordinator IT & Kepala Tata Usaha',
    status: 'aktif',
    mustChangePassword: true,
    terakhirLogin: '2026-09-15T10:00:00.000Z',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z'
  },
  {
    id: 'usr-op-01',
    username: 'operator_bukuinduk',
    password: 'operator123',
    namaLengkap: 'Siti Rahmawati, S.Kom.',
    role: 'operator',
    email: 'siti.rahmawati@smpn1merdekabelajar.sch.id',
    nomorTelepon: '081298765432',
    jabatan: 'Petugas Pengelola Buku Induk',
    rombelAkses: ['7A', '7B', '8A', '8B', '9A', '9B'],
    status: 'aktif',
    mustChangePassword: true,
    terakhirLogin: '2026-09-14T08:20:00.000Z',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z'
  },
  {
    id: 'usr-op-02',
    username: 'operator_kesiswaan',
    password: 'operator123',
    namaLengkap: 'Budi Santoso, S.Pd.',
    role: 'operator',
    email: 'budi.santoso@smpn1merdekabelajar.sch.id',
    nomorTelepon: '085712348899',
    jabatan: 'Staf Kesiswaan & Projek P5',
    rombelAkses: ['7A', '7B'],
    status: 'aktif',
    mustChangePassword: true,
    terakhirLogin: '2026-09-12T14:15:00.000Z',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z'
  }
];

export const defaultDapodikConfig: DapodikConfig = {
  ip: 'localhost',
  port: 5774,
  npsn: '20104567',
  token: 'ws_dapodik_smp_2026_auth_key',
  semesterId: '20261',
  autoSync: false
};

export const initialSekolahProfile = defaultSekolahProfile;
export const initialDapodikConfig = defaultDapodikConfig;

export const initialSiswaList: Siswa[] = [
  {
    id: 'sis-001',
    dapodikId: 'dpk-001-uuid',
    namaLengkap: 'MUHAMMAD RIZKY PRATAMA',
    namaPanggilan: 'Rizky',
    jenisKelamin: 'L',
    nisn: '0091234567',
    nipd: '262707001',
    nik: '3201011504090001',
    noKk: '3201011001050008',
    noAktaLahir: '3201-LT-15042009-0012',
    tempatLahir: 'Bandung',
    tanggalLahir: '2010-04-15',
    agama: 'Islam',
    kewarganegaraan: 'WNI',
    anakKe: 1,
    jumlahSaudaraKandung: 2,
    jumlahSaudaraTiri: 0,
    jumlahSaudaraAngkat: 0,
    statusDalamKeluarga: 'Anak Kandung',
    bahasaSehariHari: 'Bahasa Indonesia, Sunda',
    fotoUrl: '',
    golonganDarah: 'O',
    tinggiBadan: 158,
    beratBadan: 47,
    lingkarKepala: 54,
    riwayatPenyakit: 'Tidak ada penyakit kronis',
    kelainanFisik: 'Tidak ada',
    kebutuhanKhusus: 'Tidak ada',
    alamat: 'Jl. Merpati Putih No. 12 RT 03 RW 05',
    rt: '03',
    rw: '05',
    dusun: 'Kampung Sukamaju',
    kelurahan: 'Mekar Jaya',
    kecamatan: 'Sukasari',
    kabupatenKota: 'Kota Nusantara',
    provinsi: 'Jawa Barat',
    kodePos: '40123',
    tinggalDengan: 'Orang Tua',
    jarakKeSekolahKm: 1.5,
    transportasiKeSekolah: 'Sepeda',
    ayah: {
      nama: 'Bambang Pratama, S.T.',
      nik: '3201011205780003',
      tahunLahir: '1978',
      pendidikan: 'S1 Teknik',
      pekerjaan: 'Karyawan Swasta',
      penghasilan: 'Rp. 5,000,000 - Rp. 20,000,000',
      noTelepon: '081234567890',
      status: 'Masih Hidup'
    },
    ibu: {
      nama: 'Nurul Hidayah, S.Pd.',
      nik: '3201014508800004',
      tahunLahir: '1980',
      pendidikan: 'S1 Pendidikan',
      pekerjaan: 'Guru',
      penghasilan: 'Rp. 2,000,000 - Rp. 4,999,999',
      noTelepon: '081398765432',
      status: 'Masih Hidup'
    },
    asalSdMi: 'SD Negeri Sukasari 01',
    npsnSdMi: '20201122',
    noIjazahSd: 'DN-02/D-SD/13/0012345',
    tahunLulusSd: '2026',
    lamaBelajarSd: 6,
    tanggalDiterima: '2026-07-17',
    diterimaDiTingkat: '7',
    diterimaDiRombel: '7A',
    rombelSaatIni: '8A',
    jalurMasuk: 'Zonasi',
    p5Projects: [
      {
        id: 'p5-01',
        tema: 'Gaya Hidup Berkelanjutan',
        judulProjek: 'Pengelolaan Sampah Organik Menjadi Kompos Sekolah',
        fase: 'Fase D',
        tingkat: '7',
        semester: '1',
        tahunAjaran: '2026/2027',
        dimensi: {
          berimanBertakwa: 'Berkembang Sesuai Harapan',
          berkebinekaanGlobal: 'Sedang Berkembang',
          bergotongRoyong: 'Sangat Berkembang',
          mandiri: 'Berkembang Sesuai Harapan',
          bernalarKritis: 'Berkembang Sesuai Harapan',
          kreatif: 'Sangat Berkembang'
        },
        catatanProses: 'Aktif mengorganisir kelompok dalam pembuatan tong komposter dan mencatat suhu penguraian.'
      },
      {
        id: 'p5-02',
        tema: 'Kearifan Lokal',
        judulProjek: 'Eksplorasi Batik & Angklung Tradisional Nusantara',
        fase: 'Fase D',
        tingkat: '7',
        semester: '2',
        tahunAjaran: '2026/2027',
        dimensi: {
          berimanBertakwa: 'Berkembang Sesuai Harapan',
          berkebinekaanGlobal: 'Sangat Berkembang',
          bergotongRoyong: 'Berkembang Sesuai Harapan',
          mandiri: 'Berkembang Sesuai Harapan',
          bernalarKritis: 'Sangat Berkembang',
          kreatif: 'Sangat Berkembang'
        },
        catatanProses: 'Mampu memainkan instrumen angklung lagu daerah dan mempresentasikan makna filosofis motif batik lokal.'
      }
    ],
    ekstrakurikuler: [
      {
        id: 'ek-01',
        nama: 'Pramuka Penggalang',
        keterangan: 'Aktif regu rajawali, lulus uji SKU Penggalang Ramu',
        predikat: 'Sangat Baik',
        tingkat: '8'
      },
      {
        id: 'ek-02',
        nama: 'Klub Robotika & Koding',
        keterangan: 'Merakit robot line follower sederhana',
        predikat: 'Sangat Baik',
        tingkat: '8'
      }
    ],
    prestasi: [
      {
        id: 'pr-01',
        namaLomba: 'Olimpiade Sains Nasional (OSN) IPA Tingkat Kota',
        bidang: 'Akademik',
        tingkat: 'Kabupaten/Kota',
        peringkat: 'Juara 2',
        tahun: '2026',
        penyelenggara: 'Dinas Pendidikan Kota Nusantara'
      }
    ],
    riwayatSemester: [
      {
        id: 'rs-01',
        semester: '1',
        tingkat: '7',
        tahunAjaran: '2026/2027',
        sakit: 2,
        izin: 1,
        alpa: 0,
        statusKenaikan: 'Naik Kelas',
        catatanWaliKelas: 'Menunjukkan motivasi belajar yang konsisten dan sopan santun yang terpuji.'
      },
      {
        id: 'rs-02',
        semester: '2',
        tingkat: '7',
        tahunAjaran: '2026/2027',
        sakit: 1,
        izin: 0,
        alpa: 0,
        statusKenaikan: 'Naik Kelas',
        catatanWaliKelas: 'Naik ke Kelas 8 dengan capaian kompetensi Fase D yang sangat memuaskan.'
      }
    ],
    riwayatTahunAjaran: [
      {
        id: 'rth-01',
        tahunAjaran: '2026/2027',
        tingkat: '7',
        rombel: '7A',
        waliKelas: 'Dra. Hj. Nurjanah, M.Pd.',
        statusAkhirTahun: 'Naik Kelas',
        catatan: 'Naik ke kelas 8A dengan prestasi akademik peringkat 1 di kelas.'
      }
    ],
    nilaiRaport: [
      {
        id: 'rap-001-2026-1',
        siswaId: 'sis-001',
        tahunAjaran: '2026/2027',
        semester: '1',
        tingkat: '7',
        rombel: '7A',
        fase: 'Fase D',
        waliKelas: 'Dra. Hj. Nurjanah, M.Pd.',
        nipWaliKelas: '19760812 200212 2 001',
        tanggalRaport: '2026-12-22',
        rataRataNilai: 88.5,
        nilaiMapel: [
          {
            id: 'm-1',
            mataPelajaran: 'Pendidikan Agama dan Budi Pekerti',
            kategori: 'Wajib',
            nilaiAkhir: 90,
            predikat: 'A',
            capaianTertinggi: 'Menunjukkan pemahaman yang sangat mendalam mengenai dalil keagamaan, toleransi, dan kepedulian sosial.',
            capaianPerluPeningkatan: 'Mampu mempertahankan dan mengembangkan capaian materi pengayaan secara mandiri.'
          },
          {
            id: 'm-2',
            mataPelajaran: 'Pendidikan Pancasila',
            kategori: 'Wajib',
            nilaiAkhir: 88,
            predikat: 'B',
            capaianTertinggi: 'Kritis dalam menganalisis norma hukum, konstitusi UUD NRI 1945, dan menjaga persatuan NKRI.',
            capaianPerluPeningkatan: 'Perlu penguatan dalam menerapkan nilai musyawarah mufakat di kelas.'
          },
          {
            id: 'm-3',
            mataPelajaran: 'Bahasa Indonesia',
            kategori: 'Wajib',
            nilaiAkhir: 89,
            predikat: 'B',
            capaianTertinggi: 'Terampil menelaah struktur dan kaidah kebahasaan teks eksposisi dan teks berita.',
            capaianPerluPeningkatan: 'Perlu pembiasaan menulis argumen berbasis data faktual.'
          },
          {
            id: 'm-4',
            mataPelajaran: 'Matematika',
            kategori: 'Wajib',
            nilaiAkhir: 92,
            predikat: 'A',
            capaianTertinggi: 'Sangat unggul dalam menyelesaikan persamaan linear, sistem koordinat kartesius, dan logika aljabar.',
            capaianPerluPeningkatan: 'Mampu mempertahankan daya nalar logika matematika dalam soal olimpiade.'
          },
          {
            id: 'm-5',
            mataPelajaran: 'Ilmu Pengetahuan Alam (IPA)',
            kategori: 'Wajib',
            nilaiAkhir: 93,
            predikat: 'A',
            capaianTertinggi: 'Sangat memahami konsep sel organisme, ekosistem, sistem pernapasan, serta dinamika gerak.',
            capaianPerluPeningkatan: 'Dapat ditingkatkan melalui partisipasi aktif pada bimbingan OSN IPA.'
          },
          {
            id: 'm-6',
            mataPelajaran: 'Ilmu Pengetahuan Sosial (IPS)',
            kategori: 'Wajib',
            nilaiAkhir: 86,
            predikat: 'B',
            capaianTertinggi: 'Baik dalam menelaah interaksi keruangan antarnegara ASEAN dan kegiatan ekonomi pasar.',
            capaianPerluPeningkatan: 'Perlu penguatan pemahaman kronologi peristiwa sejarah nasional.'
          },
          {
            id: 'm-7',
            mataPelajaran: 'Bahasa Inggris',
            kategori: 'Wajib',
            nilaiAkhir: 87,
            predikat: 'B',
            capaianTertinggi: 'Fasih memahami isi teks recount/procedure dan aktif berdiskusi lisan.',
            capaianPerluPeningkatan: 'Perlu bimbingan dalam penggunaan variasi idiom kosakata.'
          },
          {
            id: 'm-8',
            mataPelajaran: 'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
            kategori: 'Wajib',
            nilaiAkhir: 85,
            predikat: 'B',
            capaianTertinggi: 'Sangat terampil dalam teknik dasar permainan bola voli dan atletik.',
            capaianPerluPeningkatan: 'Perlu pembiasaan menjaga ketahanan fisik secara berkala.'
          },
          {
            id: 'm-9',
            mataPelajaran: 'Informatika',
            kategori: 'Wajib',
            nilaiAkhir: 94,
            predikat: 'A',
            capaianTertinggi: 'Sangat terampil dalam berpikir komputasional, analisis data spreadsheet, dan logika pemrograman blok visual.',
            capaianPerluPeningkatan: 'Mampu menjadi tutor sebaya bagi rekan sekelas pada materi coding.'
          },
          {
            id: 'm-10',
            mataPelajaran: 'Seni dan Prakarya (Seni Rupa / Musik)',
            kategori: 'Wajib',
            nilaiAkhir: 84,
            predikat: 'B',
            capaianTertinggi: 'Kreatif dalam membuat karya gambar ilustrasi perspektif dan desain grafis orisinal.',
            capaianPerluPeningkatan: 'Perlu pendampingan dalam eksplorasi teknik gradasi warna.'
          },
          {
            id: 'm-11',
            mataPelajaran: 'Muatan Lokal (Bahasa Daerah)',
            kategori: 'Muatan Lokal',
            nilaiAkhir: 85,
            predikat: 'B',
            capaianTertinggi: 'Sangat baik dalam tata krama tutur kata kesantunan berbahasa Sunda.',
            capaianPerluPeningkatan: 'Perlu peningkatan dalam menulis aksara tradisional Sunda.'
          }
        ],
        ekstrakurikuler: [
          { nama: 'Pramuka Penggalang', predikat: 'Sangat Baik', keterangan: 'Aktif, disiplin, dan berjiwa kepemimpinan tinggi.' },
          { nama: 'Klub Robotika', predikat: 'Sangat Baik', keterangan: 'Kreatif merancang mikrokontroler mandiri.' }
        ],
        kehadiran: { sakit: 2, izin: 1, alpa: 0 },
        catatanWaliKelas: 'Pertahankan prestasi gemilang di bidang akademik dan terus kembangkan bakat teknologi serta karakter profil pelajar Pancasila.',
        statusKenaikan: 'Belum Ditentukan'
      },
      {
        id: 'rap-001-2026-2',
        siswaId: 'sis-001',
        tahunAjaran: '2026/2027',
        semester: '2',
        tingkat: '7',
        rombel: '7A',
        fase: 'Fase D',
        waliKelas: 'Dra. Hj. Nurjanah, M.Pd.',
        nipWaliKelas: '19760812 200212 2 001',
        tanggalRaport: '2026-06-21',
        rataRataNilai: 90.2,
        nilaiMapel: [
          {
            id: 'm-21',
            mataPelajaran: 'Pendidikan Agama dan Budi Pekerti',
            kategori: 'Wajib',
            nilaiAkhir: 92,
            predikat: 'A',
            capaianTertinggi: 'Sangat konsisten dalam pengamalan akhlak mulia dan kepedulian sosial di lingkungan sekolah.',
            capaianPerluPeningkatan: 'Mampu mempertahankan pemahaman dalil keagamaan.'
          },
          {
            id: 'm-22',
            mataPelajaran: 'Pendidikan Pancasila',
            kategori: 'Wajib',
            nilaiAkhir: 89,
            predikat: 'B',
            capaianTertinggi: 'Sangat menguasai identifikasi norma hukum dan peran pemuda dalam persatuan bangsa.',
            capaianPerluPeningkatan: 'Perlu bimbingan dalam memimpin musyawarah kelompok.'
          },
          {
            id: 'm-23',
            mataPelajaran: 'Bahasa Indonesia',
            kategori: 'Wajib',
            nilaiAkhir: 90,
            predikat: 'A',
            capaianTertinggi: 'Sangat terampil dalam menulis teks persuasi dan menganalisis karya sastra nusantara.',
            capaianPerluPeningkatan: 'Pertahankan kemampuan literasi membaca yang kritis.'
          },
          {
            id: 'm-24',
            mataPelajaran: 'Matematika',
            kategori: 'Wajib',
            nilaiAkhir: 94,
            predikat: 'A',
            capaianTertinggi: 'Istimewa dalam pemecahan masalah geometri dan penyajian data statistik.',
            capaianPerluPeningkatan: 'Sangat siap mengikuti kompetisi olimpiade tingkat lanjut.'
          },
          {
            id: 'm-25',
            mataPelajaran: 'Ilmu Pengetahuan Alam (IPA)',
            kategori: 'Wajib',
            nilaiAkhir: 95,
            predikat: 'A',
            capaianTertinggi: 'Sangat unggul dalam analisis getaran gelombang serta perancangan percobaan fisika.',
            capaianPerluPeningkatan: 'Pertahankan prestasi juara 2 OSN IPA tingkat kota.'
          },
          {
            id: 'm-26',
            mataPelajaran: 'Ilmu Pengetahuan Sosial (IPS)',
            kategori: 'Wajib',
            nilaiAkhir: 88,
            predikat: 'B',
            capaianTertinggi: 'Memahami dengan baik keanekaragaman flora fauna dan potensi ekonomi maritim Indonesia.',
            capaianPerluPeningkatan: 'Perlu pendalaman pada materi perdagangan internasional.'
          },
          {
            id: 'm-27',
            mataPelajaran: 'Bahasa Inggris',
            kategori: 'Wajib',
            nilaiAkhir: 89,
            predikat: 'B',
            capaianTertinggi: 'Sangat percaya diri mempresentasikan ulasan buku dalam bahasa Inggris.',
            capaianPerluPeningkatan: 'Perlu memperluas perbendaharaan kalimat kompleks.'
          },
          {
            id: 'm-28',
            mataPelajaran: 'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
            kategori: 'Wajib',
            nilaiAkhir: 86,
            predikat: 'B',
            capaianTertinggi: 'Sangat aktif dalam kebugaran jasmani senam lantai dan basket.',
            capaianPerluPeningkatan: 'Perlu menjaga konsistensi latihan daya tahan fisik.'
          },
          {
            id: 'm-29',
            mataPelajaran: 'Informatika',
            kategori: 'Wajib',
            nilaiAkhir: 96,
            predikat: 'A',
            capaianTertinggi: 'Sangat luar biasa dalam merancang proyek otomatisasi koding dan analisis data web.',
            capaianPerluPeningkatan: 'Pertahankan antusiasme dan eksplorasi pemrograman tingkat lanjut.'
          },
          {
            id: 'm-30',
            mataPelajaran: 'Seni dan Prakarya (Seni Rupa / Musik)',
            kategori: 'Wajib',
            nilaiAkhir: 85,
            predikat: 'B',
            capaianTertinggi: 'Kreatif dalam memproduksi anyaman dan kerajinan bahan lunak bernilai guna.',
            capaianPerluPeningkatan: 'Perlu ketelitian dalam perakitan detail ornamen.'
          },
          {
            id: 'm-31',
            mataPelajaran: 'Muatan Lokal (Bahasa Daerah)',
            kategori: 'Muatan Lokal',
            nilaiAkhir: 87,
            predikat: 'B',
            capaianTertinggi: 'Sangat baik dalam membaca carita pondok dan tembang pupuh kinanti.',
            capaianPerluPeningkatan: 'Tingkatkan keterampilan pidato (biantara) bahasa daerah.'
          }
        ],
        ekstrakurikuler: [
          { nama: 'Pramuka Penggalang', predikat: 'Sangat Baik', keterangan: 'Dianugerahi lencana kepemimpinan regu.' },
          { nama: 'Klub Robotika', predikat: 'Sangat Baik', keterangan: 'Juara harapan kompetisi sains robotik pelajar.' }
        ],
        kehadiran: { sakit: 1, izin: 0, alpa: 0 },
        catatanWaliKelas: 'Selamat atas keberhasilan menuntaskan pembelajaran Fase D Tingkat 7 dengan predikat Sangat Baik. Naik ke Kelas 8.',
        statusKenaikan: 'Naik Kelas',
        naikKeTingkat: '8'
      }
    ],
    statusSiswa: 'Aktif',
    createdAt: '2026-07-17T08:00:00.000Z',
    updatedAt: '2026-07-20T10:30:00.000Z',
    lastSyncedWithDapodik: '2026-07-20T10:30:00.000Z'
  },
  {
    id: 'sis-002',
    dapodikId: 'dpk-002-uuid',
    namaLengkap: 'ANNISA AULIA PUTRI',
    namaPanggilan: 'Annisa',
    jenisKelamin: 'P',
    nisn: '0103456789',
    nipd: '262707002',
    nik: '3201015609100002',
    noKk: '3201011001050015',
    noAktaLahir: '3201-LT-16092010-0044',
    tempatLahir: 'Jakarta',
    tanggalLahir: '2010-09-16',
    agama: 'Islam',
    kewarganegaraan: 'WNI',
    anakKe: 2,
    jumlahSaudaraKandung: 1,
    jumlahSaudaraTiri: 0,
    jumlahSaudaraAngkat: 0,
    statusDalamKeluarga: 'Anak Kandung',
    bahasaSehariHari: 'Bahasa Indonesia',
    golonganDarah: 'A',
    tinggiBadan: 153,
    beratBadan: 42,
    lingkarKepala: 53,
    riwayatPenyakit: 'Alergi debu',
    kelainanFisik: 'Tidak ada',
    kebutuhanKhusus: 'Tidak ada',
    alamat: 'Kompleks Graha Permai Blok C3 No. 8',
    rt: '02',
    rw: '08',
    dusun: 'Blok Anggrek',
    kelurahan: 'Mekar Jaya',
    kecamatan: 'Sukasari',
    kabupatenKota: 'Kota Nusantara',
    provinsi: 'Jawa Barat',
    kodePos: '40123',
    tinggalDengan: 'Orang Tua',
    jarakKeSekolahKm: 0.8,
    transportasiKeSekolah: 'Jalan Kaki',
    ayah: {
      nama: 'Ir. Hendra Gunawan',
      nik: '3201011403750005',
      tahunLahir: '1975',
      pendidikan: 'S1 Teknik Sipil',
      pekerjaan: 'Wiraswasta',
      penghasilan: 'Rp. 5,000,000 - Rp. 20,000,000',
      noTelepon: '081122334455',
      status: 'Masih Hidup'
    },
    ibu: {
      nama: 'Dewi Sartika, S.E.',
      nik: '3201016010770006',
      tahunLahir: '1977',
      pendidikan: 'S1 Ekonomi',
      pekerjaan: 'Pegawai BUMN',
      penghasilan: 'Rp. 5,000,000 - Rp. 20,000,000',
      noTelepon: '081233445566',
      status: 'Masih Hidup'
    },
    asalSdMi: 'SD Islam Terpadu Al-Fath',
    npsnSdMi: '20205566',
    noIjazahSd: 'DN-02/D-SD/13/0012346',
    tahunLulusSd: '2026',
    lamaBelajarSd: 6,
    tanggalDiterima: '2026-07-17',
    diterimaDiTingkat: '7',
    diterimaDiRombel: '7B',
    rombelSaatIni: '8A',
    jalurMasuk: 'Prestasi',
    p5Projects: [
      {
        id: 'p5-03',
        tema: 'Suara Demokrasi',
        judulProjek: 'Musyawarah Kelas dan Pemilihan Ketua OSIS Digital',
        fase: 'Fase D',
        tingkat: '7',
        semester: '1',
        tahunAjaran: '2026/2027',
        dimensi: {
          berimanBertakwa: 'Berkembang Sesuai Harapan',
          berkebinekaanGlobal: 'Sangat Berkembang',
          bergotongRoyong: 'Sangat Berkembang',
          mandiri: 'Berkembang Sesuai Harapan',
          bernalarKritis: 'Sangat Berkembang',
          kreatif: 'Berkembang Sesuai Harapan'
        },
        catatanProses: 'Memimpin debat kandidat OSIS dengan argumentasi logis dan santun.'
      }
    ],
    ekstrakurikuler: [
      {
        id: 'ek-03',
        nama: 'Palang Merah Remaja (PMR)',
        keterangan: 'Ketua Unit Pertolongan Pertama PMR Madya',
        predikat: 'Sangat Baik',
        tingkat: '8'
      },
      {
        id: 'ek-04',
        nama: 'Paduan Suara Gita Pelajar',
        keterangan: 'Vokal sopran lagu wajib dan daerah',
        predikat: 'Sangat Baik',
        tingkat: '8'
      }
    ],
    prestasi: [
      {
        id: 'pr-02',
        namaLomba: 'Lomba Pidato Bahasa Inggris (English Speech Contest) SMP',
        bidang: 'Akademik',
        tingkat: 'Provinsi',
        peringkat: 'Juara 1',
        tahun: '2026',
        penyelenggara: 'Balai Bahasa Jawa Barat'
      }
    ],
    riwayatSemester: [
      {
        id: 'rs-03',
        semester: '1',
        tingkat: '7',
        tahunAjaran: '2026/2027',
        sakit: 0,
        izin: 0,
        alpa: 0,
        statusKenaikan: 'Naik Kelas',
        catatanWaliKelas: 'Kehadiran sempurna dan aktif memimpin diskusi kolaboratif di kelas.'
      },
      {
        id: 'rs-04',
        semester: '2',
        tingkat: '7',
        tahunAjaran: '2026/2027',
        sakit: 1,
        izin: 1,
        alpa: 0,
        statusKenaikan: 'Naik Kelas',
        catatanWaliKelas: 'Dapat mempertahankan prestasi akademik dan kepemimpinan di kelas 8.'
      }
    ],
    statusSiswa: 'Aktif',
    createdAt: '2026-07-17T08:00:00.000Z',
    updatedAt: '2026-07-20T10:30:00.000Z',
    lastSyncedWithDapodik: '2026-07-20T10:30:00.000Z'
  },
  {
    id: 'sis-003',
    dapodikId: 'dpk-003-uuid',
    namaLengkap: 'DANIEL CHRISTIAN SIAHAAN',
    namaPanggilan: 'Daniel',
    jenisKelamin: 'L',
    nisn: '0112345678',
    nipd: '262707003',
    nik: '3201011802110007',
    noKk: '3201011001050022',
    noAktaLahir: '3201-LT-18022011-0089',
    tempatLahir: 'Medan',
    tanggalLahir: '2011-02-18',
    agama: 'Kristen',
    kewarganegaraan: 'WNI',
    anakKe: 1,
    jumlahSaudaraKandung: 1,
    jumlahSaudaraTiri: 0,
    jumlahSaudaraAngkat: 0,
    statusDalamKeluarga: 'Anak Kandung',
    bahasaSehariHari: 'Bahasa Indonesia, Batak',
    golonganDarah: 'B',
    tinggiBadan: 162,
    beratBadan: 51,
    lingkarKepala: 55,
    riwayatPenyakit: 'Tidak ada',
    kelainanFisik: 'Tidak ada',
    kebutuhanKhusus: 'Tidak ada',
    alamat: 'Jl. Cemara Asri No. 27',
    rt: '04',
    rw: '02',
    dusun: 'Dusun Harapan',
    kelurahan: 'Mekar Jaya',
    kecamatan: 'Sukasari',
    kabupatenKota: 'Kota Nusantara',
    provinsi: 'Jawa Barat',
    kodePos: '40123',
    tinggalDengan: 'Orang Tua',
    jarakKeSekolahKm: 2.1,
    transportasiKeSekolah: 'Sepeda Motor',
    ayah: {
      nama: 'Togar Siahaan, S.H.',
      nik: '3201011008760008',
      tahunLahir: '1976',
      pendidikan: 'S1 Hukum',
      pekerjaan: 'Advokat / Pengacara',
      penghasilan: 'Rp. 5,000,000 - Rp. 20,000,000',
      noTelepon: '081377889900',
      status: 'Masih Hidup'
    },
    ibu: {
      nama: 'Maria Simanjuntak, S.Farm.',
      nik: '3201015011780009',
      tahunLahir: '1978',
      pendidikan: 'S1 Farmasi',
      pekerjaan: 'Apoteker',
      penghasilan: 'Rp. 5,000,000 - Rp. 20,000,000',
      noTelepon: '081366778899',
      status: 'Masih Hidup'
    },
    asalSdMi: 'SD Santo Yoseph Nusantara',
    npsnSdMi: '20207788',
    noIjazahSd: 'DN-02/D-SD/13/0012347',
    tahunLulusSd: '2026',
    lamaBelajarSd: 6,
    tanggalDiterima: '2026-07-15',
    diterimaDiTingkat: '7',
    diterimaDiRombel: '7A',
    rombelSaatIni: '7A',
    jalurMasuk: 'Zonasi',
    p5Projects: [
      {
        id: 'p5-04',
        tema: 'Rekayasa dan Teknologi',
        judulProjek: 'Purwarupa Penyiram Tanaman Otomatis Berbasis Sensor Tanah',
        fase: 'Fase D',
        tingkat: '7',
        semester: '1',
        tahunAjaran: '2026/2027',
        dimensi: {
          berimanBertakwa: 'Berkembang Sesuai Harapan',
          berkebinekaanGlobal: 'Berkembang Sesuai Harapan',
          bergotongRoyong: 'Sangat Berkembang',
          mandiri: 'Berkembang Sesuai Harapan',
          bernalarKritis: 'Sangat Berkembang',
          kreatif: 'Sangat Berkembang'
        },
        catatanProses: 'Memiliki rasa ingin tahu teknologi yang tinggi dan mampu merakit rangkaian sederhana.'
      }
    ],
    ekstrakurikuler: [
      {
        id: 'ek-05',
        nama: 'Bola Basket',
        keterangan: 'Anggota tim inti basket putra SMP',
        predikat: 'Sangat Baik',
        tingkat: '7'
      }
    ],
    prestasi: [
      {
        id: 'pr-03',
        namaLomba: 'Kejuaraan Bola Basket Antar Pelajar SMP se-Kota',
        bidang: 'Olahraga',
        tingkat: 'Kabupaten/Kota',
        peringkat: 'Juara 1',
        tahun: '2026',
        penyelenggara: 'Perbasi Kota Nusantara'
      }
    ],
    riwayatSemester: [
      {
        id: 'rs-05',
        semester: '1',
        tingkat: '7',
        tahunAjaran: '2026/2027',
        sakit: 0,
        izin: 1,
        alpa: 0,
        statusKenaikan: 'Belum Ditentukan',
        catatanWaliKelas: 'Adaptasi sangat baik di lingkungan SMP, berjiwa sportif dan ramah.'
      }
    ],
    statusSiswa: 'Aktif',
    createdAt: '2026-07-15T08:00:00.000Z',
    updatedAt: '2026-09-01T09:15:00.000Z'
  },
  {
    id: 'sis-004',
    dapodikId: 'dpk-004-uuid',
    namaLengkap: 'SITI AISYAH NURJANNAH',
    namaPanggilan: 'Aisyah',
    jenisKelamin: 'P',
    nisn: '0087654321',
    nipd: '262407004',
    nik: '3201016212080010',
    noKk: '3201011001050033',
    noAktaLahir: '3201-LT-22122008-0112',
    tempatLahir: 'Bandung',
    tanggalLahir: '2008-12-22',
    agama: 'Islam',
    kewarganegaraan: 'WNI',
    anakKe: 3,
    jumlahSaudaraKandung: 2,
    jumlahSaudaraTiri: 0,
    jumlahSaudaraAngkat: 0,
    statusDalamKeluarga: 'Anak Kandung',
    bahasaSehariHari: 'Bahasa Indonesia, Sunda',
    golonganDarah: 'AB',
    tinggiBadan: 156,
    beratBadan: 46,
    lingkarKepala: 54,
    riwayatPenyakit: 'Asma ringan',
    kelainanFisik: 'Tidak ada',
    kebutuhanKhusus: 'Tidak ada',
    alamat: 'Kp. Babakan Tarogong No. 88 RT 01 RW 04',
    rt: '01',
    rw: '04',
    dusun: 'Dusun Babakan',
    kelurahan: 'Sukamantri',
    kecamatan: 'Sukasari',
    kabupatenKota: 'Kota Nusantara',
    provinsi: 'Jawa Barat',
    kodePos: '40124',
    tinggalDengan: 'Orang Tua',
    jarakKeSekolahKm: 3.2,
    transportasiKeSekolah: 'Angkutan Umum',
    ayah: {
      nama: 'Ujang Sudrajat',
      nik: '3201010101700011',
      tahunLahir: '1970',
      pendidikan: 'SMA / sederajat',
      pekerjaan: 'Pedagang',
      penghasilan: 'Rp. 2,000,000 - Rp. 4,999,999',
      noTelepon: '085211223344',
      status: 'Masih Hidup'
    },
    ibu: {
      nama: 'Kokom Komariah',
      nik: '3201014101730012',
      tahunLahir: '1973',
      pendidikan: 'SMP / sederajat',
      pekerjaan: 'Ibu Rumah Tangga',
      penghasilan: 'Tidak Berpenghasilan',
      noTelepon: '085222334455',
      status: 'Masih Hidup'
    },
    asalSdMi: 'SD Negeri Sukamantri 02',
    npsnSdMi: '20203344',
    noIjazahSd: 'DN-02/D-SD/12/0098765',
    tahunLulusSd: '2026',
    lamaBelajarSd: 6,
    tanggalDiterima: '2026-07-18',
    diterimaDiTingkat: '7',
    diterimaDiRombel: '7C',
    rombelSaatIni: '9A',
    jalurMasuk: 'Afirmasi',
    p5Projects: [
      {
        id: 'p5-05',
        tema: 'Kewirausahaan',
        judulProjek: 'Kreasi Olahan Singkong Menjadi Produk Bernilai Ekonomi',
        fase: 'Fase D',
        tingkat: '8',
        semester: '2',
        tahunAjaran: '2026/2027',
        dimensi: {
          berimanBertakwa: 'Berkembang Sesuai Harapan',
          berkebinekaanGlobal: 'Berkembang Sesuai Harapan',
          bergotongRoyong: 'Sangat Berkembang',
          mandiri: 'Sangat Berkembang',
          bernalarKritis: 'Berkembang Sesuai Harapan',
          kreatif: 'Sangat Berkembang'
        },
        catatanProses: 'Sangat ulet dalam perencanaan kemasan, promosi bazar sekolah dan pencatatan laba rugi sederhana.'
      }
    ],
    ekstrakurikuler: [
      {
        id: 'ek-06',
        nama: 'Paskibra Sekolah',
        keterangan: 'Komandan Pleton Paskibra SMP tingkat kota',
        predikat: 'Sangat Baik',
        tingkat: '9'
      }
    ],
    prestasi: [
      {
        id: 'pr-04',
        namaLomba: 'Lomba Tata Upacara Bendera & Baris Berbaris SMP',
        bidang: 'Olahraga',
        tingkat: 'Provinsi',
        peringkat: 'Juara 3',
        tahun: '2026',
        penyelenggara: 'Dispora Provinsi Jawa Barat'
      }
    ],
    riwayatSemester: [
      {
        id: 'rs-06',
        semester: '1',
        tingkat: '8',
        tahunAjaran: '2026/2027',
        sakit: 1,
        izin: 0,
        alpa: 0,
        statusKenaikan: 'Naik Kelas',
        catatanWaliKelas: 'Sangat disiplin dan bertanggung jawab terhadap tugas sekolah.'
      },
      {
        id: 'rs-07',
        semester: '2',
        tingkat: '8',
        tahunAjaran: '2026/2027',
        sakit: 0,
        izin: 0,
        alpa: 0,
        statusKenaikan: 'Naik Kelas',
        catatanWaliKelas: 'Naik ke kelas 9 dengan predikat kepribadian terpuji.'
      }
    ],
    statusSiswa: 'Aktif',
    createdAt: '2026-07-18T08:00:00.000Z',
    updatedAt: '2026-07-15T09:00:00.000Z'
  },
  {
    id: 'sis-005',
    dapodikId: 'dpk-005-uuid',
    namaLengkap: 'I GEDE PUTRA ADITYA',
    namaPanggilan: 'Putra',
    jenisKelamin: 'L',
    nisn: '0109876543',
    nipd: '262707005',
    nik: '3201010505100013',
    noKk: '3201011001050044',
    noAktaLahir: '3201-LT-05052010-0199',
    tempatLahir: 'Denpasar',
    tanggalLahir: '2010-05-05',
    agama: 'Hindu',
    kewarganegaraan: 'WNI',
    anakKe: 1,
    jumlahSaudaraKandung: 0,
    jumlahSaudaraTiri: 0,
    jumlahSaudaraAngkat: 0,
    statusDalamKeluarga: 'Anak Kandung',
    bahasaSehariHari: 'Bahasa Indonesia, Bali',
    golonganDarah: 'O',
    tinggiBadan: 160,
    beratBadan: 49,
    riwayatPenyakit: 'Tidak ada',
    kelainanFisik: 'Tidak ada',
    kebutuhanKhusus: 'Tidak ada',
    alamat: 'Perumahan Pesona Alam Regency Blok D No. 15',
    rt: '05',
    rw: '09',
    dusun: 'Dusun Alam Asri',
    kelurahan: 'Mekar Jaya',
    kecamatan: 'Sukasari',
    kabupatenKota: 'Kota Nusantara',
    provinsi: 'Jawa Barat',
    kodePos: '40123',
    tinggalDengan: 'Orang Tua',
    jarakKeSekolahKm: 1.8,
    transportasiKeSekolah: 'Sepeda Motor',
    ayah: {
      nama: 'I Wayan Sudarma, S.Sn.',
      nik: '3201011508770014',
      tahunLahir: '1977',
      pendidikan: 'S1 Seni Pertunjukan',
      pekerjaan: 'Seniman / Desainer',
      penghasilan: 'Rp. 5,000,000 - Rp. 20,000,000',
      noTelepon: '081299887766',
      status: 'Masih Hidup'
    },
    ibu: {
      nama: 'Ni Made Astuti, S.Pd.',
      nik: '3201015509800015',
      tahunLahir: '1980',
      pendidikan: 'S1 Pendidikan Seni',
      pekerjaan: 'Guru',
      penghasilan: 'Rp. 2,000,000 - Rp. 4,999,999',
      noTelepon: '081288776655',
      status: 'Masih Hidup'
    },
    asalSdMi: 'SD Saraswati Nusantara',
    npsnSdMi: '20208899',
    noIjazahSd: 'DN-02/D-SD/13/0012348',
    tahunLulusSd: '2026',
    lamaBelajarSd: 6,
    tanggalDiterima: '2026-07-17',
    diterimaDiTingkat: '7',
    diterimaDiRombel: '7A',
    rombelSaatIni: '8B',
    jalurMasuk: 'Prestasi',
    p5Projects: [
      {
        id: 'p5-06',
        tema: 'Bangunlah Jiwa dan Raganya',
        judulProjek: 'Gizi Seimbang dan Kesehatan Mental Remaja SMP',
        fase: 'Fase D',
        tingkat: '7',
        semester: '2',
        tahunAjaran: '2026/2027',
        dimensi: {
          berimanBertakwa: 'Berkembang Sesuai Harapan',
          berkebinekaanGlobal: 'Berkembang Sesuai Harapan',
          bergotongRoyong: 'Sangat Berkembang',
          mandiri: 'Sangat Berkembang',
          bernalarKritis: 'Berkembang Sesuai Harapan',
          kreatif: 'Sangat Berkembang'
        },
        catatanProses: 'Menciptakan poster kampanye visual anti-bullying dan menu bekal bergizi.'
      }
    ],
    ekstrakurikuler: [
      {
        id: 'ek-07',
        nama: 'Seni Musik & Karawitan',
        keterangan: 'Pemain instrumen gamelan dan gitar akustik',
        predikat: 'Sangat Baik',
        tingkat: '8'
      }
    ],
    prestasi: [
      {
        id: 'pr-05',
        namaLomba: 'Festival Lomba Seni Siswa Nasional (FLS2N) Gitar Duet',
        bidang: 'Seni',
        tingkat: 'Kabupaten/Kota',
        peringkat: 'Juara 1',
        tahun: '2026',
        penyelenggara: 'Balai Pengembangan Talenta Indonesia'
      }
    ],
    riwayatSemester: [
      {
        id: 'rs-08',
        semester: '1',
        tingkat: '7',
        tahunAjaran: '2026/2027',
        sakit: 0,
        izin: 1,
        alpa: 0,
        statusKenaikan: 'Naik Kelas',
        catatanWaliKelas: 'Bakat seni menonjol dan disenangi banyak teman sekelas.'
      },
      {
        id: 'rs-09',
        semester: '2',
        tingkat: '7',
        tahunAjaran: '2026/2027',
        sakit: 0,
        izin: 0,
        alpa: 0,
        statusKenaikan: 'Naik Kelas',
        catatanWaliKelas: 'Naik kelas 8 dengan capaian ekstrakurikuler istimewa.'
      }
    ],
    statusSiswa: 'Aktif',
    createdAt: '2026-07-17T08:00:00.000Z',
    updatedAt: '2026-07-20T10:30:00.000Z'
  }
];

// Sample data for Dapodik Web Service emulator / mock test
export const mockDapodikPesertaDidik: DapodikRawPesertaDidik[] = [
  {
    peserta_didik_id: 'dpk-001-uuid',
    nama: 'MUHAMMAD RIZKY PRATAMA',
    jenis_kelamin: 'L',
    nisn: '0091234567',
    nipd: '262707001',
    nik: '3201011504090001',
    tempat_lahir: 'Bandung',
    tanggal_lahir: '2010-04-15',
    agama_id_str: 'Islam',
    alamat_jalan: 'Jl. Merpati Putih No. 12 RT 03 RW 05',
    rt: '03',
    rw: '05',
    nama_dusun: 'Kampung Sukamaju',
    desa_kelurahan: 'Mekar Jaya',
    kecamatan: 'Sukasari',
    kode_pos: '40123',
    nama_ayah: 'Bambang Pratama, S.T.',
    nik_ayah: '3201011205780003',
    pekerjaan_ayah_id_str: 'Karyawan Swasta',
    penghasilan_ayah_id_str: 'Rp 5.000.000 - Rp 10.000.000',
    nama_ibu: 'Nurul Hidayah, S.Pd.',
    nik_ibu: '3201014508800004',
    pekerjaan_ibu_id_str: 'Guru',
    penghasilan_ibu_id_str: 'Rp 3.000.000 - Rp 5.000.000',
    nomor_telepon_seluler: '081234567890',
    sekolah_asal: 'SD Negeri Sukasari 01',
    nama_rombel: '8A',
    tingkat_pendidikan_id: 8,
    berat_badan: 47,
    tinggi_badan: 158
  },
  {
    peserta_didik_id: 'dpk-002-uuid',
    nama: 'ANNISA AULIA PUTRI',
    jenis_kelamin: 'P',
    nisn: '0103456789',
    nipd: '262707002',
    nik: '3201015609100002',
    tempat_lahir: 'Jakarta',
    tanggal_lahir: '2010-09-16',
    agama_id_str: 'Islam',
    alamat_jalan: 'Kompleks Graha Permai Blok C3 No. 8',
    rt: '02',
    rw: '08',
    nama_dusun: 'Blok Anggrek',
    desa_kelurahan: 'Mekar Jaya',
    kecamatan: 'Sukasari',
    kode_pos: '40123',
    nama_ayah: 'Ir. Hendra Gunawan',
    nik_ayah: '3201011403750005',
    pekerjaan_ayah_id_str: 'Wiraswasta',
    penghasilan_ayah_id_str: 'Rp 5.000.000 - Rp 10.000.000',
    nama_ibu: 'Dewi Sartika, S.E.',
    nik_ibu: '3201016010770006',
    pekerjaan_ibu_id_str: 'Pegawai BUMN',
    penghasilan_ibu_id_str: 'Rp 5.000.000 - Rp 10.000.000',
    nomor_telepon_seluler: '081122334455',
    sekolah_asal: 'SD Islam Terpadu Al-Fath',
    nama_rombel: '8A',
    tingkat_pendidikan_id: 8,
    berat_badan: 42,
    tinggi_badan: 153
  },
  {
    peserta_didik_id: 'dpk-006-uuid-new',
    nama: 'FATHUR ROHMAN HAKIM',
    jenis_kelamin: 'L',
    nisn: '0119876512',
    nipd: '262707006',
    nik: '3201012108110016',
    tempat_lahir: 'Bandung',
    tanggal_lahir: '2011-08-21',
    agama_id_str: 'Islam',
    alamat_jalan: 'Jl. Surya Kencana No. 42 RT 02 RW 01',
    rt: '02',
    rw: '01',
    nama_dusun: 'Dusun Kencana',
    desa_kelurahan: 'Mekar Jaya',
    kecamatan: 'Sukasari',
    kode_pos: '40123',
    nama_ayah: 'Ahmad Hakim, M.Ag.',
    nik_ayah: '3201011005740017',
    pekerjaan_ayah_id_str: 'PNS / Guru Agama',
    penghasilan_ayah_id_str: 'Rp 3.000.000 - Rp 5.000.000',
    nama_ibu: 'Fatimah Az-Zahra',
    nik_ibu: '3201015206770018',
    pekerjaan_ibu_id_str: 'Ibu Rumah Tangga',
    penghasilan_ibu_id_str: 'Tidak Berpenghasilan',
    nomor_telepon_seluler: '081344556677',
    sekolah_asal: 'MI Al-Ikhlas Nusantara',
    nama_rombel: '7B',
    tingkat_pendidikan_id: 7,
    berat_badan: 45,
    tinggi_badan: 155
  },
  {
    peserta_didik_id: 'dpk-007-uuid-new',
    nama: 'CHELSEA OLIVIA NATASHA',
    jenis_kelamin: 'P',
    nisn: '0118899221',
    nipd: '262707007',
    nik: '3201016511110019',
    tempat_lahir: 'Surabaya',
    tanggal_lahir: '2011-11-25',
    agama_id_str: 'Kristen',
    alamat_jalan: 'Jl. Flamboyan Indah No. 5 RT 04 RW 06',
    rt: '04',
    rw: '06',
    nama_dusun: 'Flamboyan Garden',
    desa_kelurahan: 'Mekar Jaya',
    kecamatan: 'Sukasari',
    kode_pos: '40123',
    nama_ayah: 'David Wijaya, S.E.',
    nik_ayah: '3201011809750020',
    pekerjaan_ayah_id_str: 'Manajer Bank',
    penghasilan_ayah_id_str: 'Lebih dari Rp 10.000.000',
    nama_ibu: 'Grace Novita',
    nik_ibu: '3201016804790021',
    pekerjaan_ibu_id_str: 'Karyawan Swasta',
    penghasilan_ibu_id_str: 'Rp 5.000.000 - Rp 10.000.000',
    nomor_telepon_seluler: '081299001122',
    sekolah_asal: 'SD Petra 2',
    nama_rombel: '7A',
    tingkat_pendidikan_id: 7,
    berat_badan: 41,
    tinggi_badan: 150
  },
  {
    peserta_didik_id: 'dpk-008-uuid-new',
    nama: 'RAIHAN ATHALLAH GUNADHI',
    jenis_kelamin: 'L',
    nisn: '0098712390',
    nipd: '262407008',
    nik: '3201010303090022',
    tempat_lahir: 'Cimahi',
    tanggal_lahir: '2009-03-03',
    agama_id_str: 'Islam',
    alamat_jalan: 'Jl. Dahlia Raya No. 19',
    rt: '01',
    rw: '03',
    nama_dusun: 'Dahlia Asri',
    desa_kelurahan: 'Sukamantri',
    kecamatan: 'Sukasari',
    kode_pos: '40124',
    nama_ayah: 'Agus Gunadhi',
    nik_ayah: '3201011102710023',
    pekerjaan_ayah_id_str: 'TNI / Polri',
    penghasilan_ayah_id_str: 'Rp 5.000.000 - Rp 10.000.000',
    nama_ibu: 'Rina Marlina',
    nik_ibu: '3201015105740024',
    pekerjaan_ibu_id_str: 'PNS',
    penghasilan_ibu_id_str: 'Rp 3.000.000 - Rp 5.000.000',
    nomor_telepon_seluler: '081388776611',
    sekolah_asal: 'SD Negeri Cimahi 03',
    nama_rombel: '9B',
    tingkat_pendidikan_id: 9,
    berat_badan: 55,
    tinggi_badan: 165
  }
];

// Sample data Rombongan Belajar untuk emulator Web Service Dapodik
export const mockDapodikRombel: DapodikRawRombel[] = [
  {
    rombongan_belajar_id: 'dpk-rombel-7a',
    nama: '7A',
    tingkat_pendidikan_id: 7,
    jenis_rombel: 'Reguler',
    jumlah_anggota: 32,
    nama_wali: 'Dra. Hj. Nurjanah, M.Pd.',
    semester_id: '20261'
  },
  {
    rombongan_belajar_id: 'dpk-rombel-7b',
    nama: '7B',
    tingkat_pendidikan_id: 7,
    jenis_rombel: 'Reguler',
    jumlah_anggota: 30,
    nama_wali: 'Drs. H. Maman Suparman',
    semester_id: '20261'
  },
  {
    rombongan_belajar_id: 'dpk-rombel-8a',
    nama: '8A',
    tingkat_pendidikan_id: 8,
    jenis_rombel: 'Reguler',
    jumlah_anggota: 31,
    nama_wali: 'Siti Rahmawati, S.Kom.',
    semester_id: '20261'
  },
  {
    rombongan_belajar_id: 'dpk-rombel-9a',
    nama: '9A',
    tingkat_pendidikan_id: 9,
    jenis_rombel: 'Reguler',
    jumlah_anggota: 29,
    nama_wali: 'Budi Santoso, S.Pd.',
    semester_id: '20261'
  }
];

// Sample data PTK untuk emulator Web Service Dapodik
export const mockDapodikPtk: DapodikRawPtk[] = [
  {
    ptk_id: 'dpk-ptk-01',
    nama: 'Dr. H. Ahmad Dahlan, M.Pd.',
    nip: '19740512 199903 1 002',
    nik: '3201011205740001',
    jenis_ptk_id_str: 'Kepala Sekolah',
    jenis_kelamin: 'L',
    status_kepegawaian_id_str: 'PNS',
    mata_pelajaran_ajar: 'Pendidikan Agama dan Budi Pekerti'
  },
  {
    ptk_id: 'dpk-ptk-02',
    nama: 'Dra. Hj. Nurjanah, M.Pd.',
    nip: '19760812 200212 2 001',
    nik: '3201015208760002',
    jenis_ptk_id_str: 'Guru Kelas',
    jenis_kelamin: 'P',
    status_kepegawaian_id_str: 'PNS',
    mata_pelajaran_ajar: 'Bahasa Indonesia'
  },
  {
    ptk_id: 'dpk-ptk-03',
    nama: 'Budi Santoso, S.Pd.',
    nip: '19880312 201201 1 008',
    nik: '3201011203880003',
    jenis_ptk_id_str: 'Guru Mata Pelajaran',
    jenis_kelamin: 'L',
    status_kepegawaian_id_str: 'PPPK',
    mata_pelajaran_ajar: 'Informatika'
  }
];

// Sample data Pengguna Dapodik untuk emulator Web Service
export const mockDapodikPengguna: DapodikRawPengguna[] = [
  {
    pengguna_id: 'dpk-user-01',
    username: 'operator_dapodik',
    nama: 'Siti Rahmawati, S.Kom.',
    peran: 'Operator Sekolah',
    email: 'siti.rahmawati@smpn1merdekabelajar.sch.id',
    aktif: 1
  },
  {
    pengguna_id: 'dpk-user-02',
    username: 'bendahara_bos',
    nama: 'Dewi Sartika, S.E.',
    peran: 'Bendahara BOS',
    email: 'bendahara@smpn1merdekabelajar.sch.id',
    aktif: 1
  }
];
