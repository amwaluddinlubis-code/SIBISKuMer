// Tabel referensi kode Dapodik untuk isian form (Select "kode – uraian").
// `nilai` adalah string yang tersimpan di data siswa. Untuk kode yang ejaannya
// berbeda dengan nilai lama (cth. Budha → Buddha), `nilai` mempertahankan
// ejaan lama agar data & rekap yang sudah ada tidak pecah.

export interface RefKode {
  kode: string;
  uraian: string;
  /** Nilai tersimpan; default = uraian. */
  nilai: string;
}

const r = (kode: string, uraian: string, nilai?: string): RefKode => ({
  kode,
  uraian,
  nilai: nilai ?? uraian,
});

// A. Agama
export const AGAMA_OPTIONS: RefKode[] = [
  r('1', 'Islam'),
  r('2', 'Kristen'),
  r('3', 'Katholik'),
  r('4', 'Hindu'),
  r('5', 'Budha', 'Buddha'),
  r('6', 'Khonghucu'),
  r('7', 'Kepercayaan kpd Tuhan YME', 'Kepercayaan'),
  r('99', 'Lainnya'),
];

// B. Jenis tinggal
export const TINGGAL_OPTIONS: RefKode[] = [
  r('1', 'Bersama orang tua', 'Orang Tua'),
  r('2', 'Wali'),
  r('3', 'Kost'),
  r('4', 'Asrama'),
  r('5', 'Panti asuhan', 'Panti Asuhan'),
  r('10', 'Pesantren'),
  r('99', 'Lainnya'),
];

// C. Moda transportasi
export const TRANSPORTASI_OPTIONS: RefKode[] = [
  r('1', 'Jalan kaki', 'Jalan Kaki'),
  r('3', 'Angkutan umum/bus/pete-pete'),
  r('4', 'Mobil/bus antar jemput'),
  r('5', 'Kereta api'),
  r('6', 'Ojek'),
  r('7', 'Andong/bendi/sado/dokar/delman/becak'),
  r('8', 'Perahu penyeberangan/rakit/getek'),
  r('11', 'Kuda'),
  r('12', 'Sepeda'),
  r('13', 'Sepeda motor', 'Sepeda Motor'),
  r('14', 'Mobil pribadi', 'Mobil Pribadi'),
  r('99', 'Lainnya'),
];

// D. Jenjang pendidikan (orang tua/wali)
export const PENDIDIKAN_OPTIONS: RefKode[] = [
  r('0', 'Tidak sekolah'),
  r('1', 'PAUD'),
  r('2', 'TK / sederajat'),
  r('3', 'Putus SD'),
  r('4', 'SD / sederajat'),
  r('5', 'SMP / sederajat'),
  r('6', 'SMA / sederajat'),
  r('7', 'Paket A'),
  r('8', 'Paket B'),
  r('9', 'Paket C'),
  r('20', 'D1'),
  r('21', 'D2'),
  r('22', 'D3'),
  r('23', 'D4'),
  r('30', 'S1'),
  r('31', 'Profesi'),
  r('32', 'Sp-1'),
  r('35', 'S2'),
  r('36', 'S2 Terapan'),
  r('37', 'Sp-2'),
  r('40', 'S3'),
  r('41', 'S3 Terapan'),
  r('90', 'Non formal'),
  r('91', 'Informal'),
  r('99', 'Lainnya'),
];

// E. Pekerjaan (orang tua/wali)
export const PEKERJAAN_OPTIONS: RefKode[] = [
  r('1', 'Tidak bekerja'),
  r('2', 'Nelayan'),
  r('3', 'Petani'),
  r('4', 'Peternak'),
  r('5', 'PNS/TNI/Polri'),
  r('6', 'Karyawan Swasta'),
  r('7', 'Pedagang Kecil'),
  r('8', 'Pedagang Besar'),
  r('9', 'Wiraswasta'),
  r('10', 'Wirausaha'),
  r('11', 'Buruh'),
  r('12', 'Pensiunan'),
  r('13', 'Tenaga Kerja Indonesia'),
  r('14', 'Karyawan BUMN'),
  r('90', 'Tidak dapat diterapkan'),
  r('98', 'Sudah Meninggal'),
  r('99', 'Lainnya'),
];

// F. Penghasilan (orang tua/wali)
export const PENGHASILAN_OPTIONS: RefKode[] = [
  r('11', 'Kurang dari Rp. 500,000'),
  r('12', 'Rp. 500,000 - Rp. 999,999'),
  r('13', 'Rp. 1,000,000 - Rp. 1,999,999'),
  r('14', 'Rp. 2,000,000 - Rp. 4,999,999'),
  r('15', 'Rp. 5,000,000 - Rp. 20,000,000'),
  r('16', 'Lebih dari Rp. 20,000,000'),
  r('17', '< Rp1.000.000'),
  r('99', 'Tidak Berpenghasilan'),
];

// Jenis pendaftaran (penerimaan)
export const JENIS_PENDAFTARAN_OPTIONS: RefKode[] = [
  r('1', 'Siswa baru', 'Siswa Baru'),
  r('2', 'Pindahan'),
  r('7', 'Kembali bersekolah', 'Kembali Bersekolah'),
];

// G. Hobi
export const HOBI_OPTIONS: RefKode[] = [
  r('1', 'Olah Raga'),
  r('2', 'Kesenian'),
  r('3', 'Membaca'),
  r('4', 'Menulis'),
  r('5', 'Traveling'),
  r('6', 'Lainnya'),
  r('11', 'Fotografi'),
  r('12', 'Fitness'),
  r('13', 'Belanja'),
  r('14', 'Menggambar'),
  r('15', 'Bermain Musik'),
  r('16', 'mendaki'),
  r('17', 'Jogging'),
  r('18', 'Bermain Gitar'),
  r('19', 'Bermain Bola'),
  r('20', 'Bermain Bulu Tangkis'),
  r('21', 'Bermain Bola Tenis'),
  r('22', 'Bermain Biola'),
  r('23', 'Bermain Piano'),
  r('24', 'Berlari'),
  r('25', 'Berkemah'),
  r('26', 'Memancing'),
  r('27', 'Berselancar'),
  r('28', 'Bermain Gitar'),
  r('29', 'Bermain Boneka'),
  r('30', 'Makan'),
  r('31', 'Menjahit'),
  r('32', 'Main Puzzle'),
  r('33', 'Mewarnai'),
];

// H. Cita-cita
export const CITACITA_OPTIONS: RefKode[] = [
  r('1', 'PNS'),
  r('2', 'TNI/Polri'),
  r('3', 'Guru/Dosen'),
  r('4', 'Dokter'),
  r('5', 'Politikus'),
  r('6', 'Wiraswasta'),
  r('7', 'Seni/Lukis/Artis/Sejenis'),
  r('8', 'Lainnya'),
  r('11', "Penghafal Al-Qur'an"),
  r('12', 'Atlet E-Sport Profesional'),
  r('13', 'Atlet'),
  r('14', 'Content Creator'),
  r('15', 'Vloger'),
  r('16', 'Koki'),
  r('17', 'Pendeta'),
  r('18', 'Perawat'),
  r('19', 'Pilot'),
  r('20', 'Pembalap'),
  r('21', 'Atlit Olahraga'),
  r('22', 'Pengacara'),
  r('23', "Da'i / Ustadz"),
  r('24', 'Entertainer / Pekerja Seni'),
  r('25', 'Wartawan'),
  r('26', 'Pengusaha / Bisnismen'),
  r('27', 'Penulis'),
  r('28', 'Penyiar Radio'),
  r('29', 'Pembawa Acara / Master Ceremony'),
  r('30', 'Polisi'),
  r('31', 'Pemadam Kebakaran'),
  r('32', 'Astronot'),
  r('33', 'Masinis Kereta Api'),
  r('34', 'Perawat / Suster'),
  r('35', 'Bidan'),
  r('36', 'Presiden'),
  r('37', 'Pegawai Negeri Sipil / PNS'),
  r('38', 'Translator'),
  r('39', 'Designer'),
  r('40', 'Pelaut'),
  r('41', 'Arsitek'),
];

/** Label opsi "kode – uraian" untuk Select. */
export function labelKode(o: RefKode): string {
  return `${o.kode} – ${o.uraian}`;
}

/** Samakan nilai lama ke tabel (persis → peta legacy → cocok takpeka huruf). */
export function normalisasiNilai(
  options: RefKode[],
  raw: string | undefined,
  petaLegacy?: Record<string, string>
): string {
  const v = (raw || '').trim();
  if (!v) return options[0]?.nilai || '';
  if (options.some((o) => o.nilai === v)) return v;
  if (petaLegacy && petaLegacy[v]) return petaLegacy[v];
  const lower = v.toLowerCase();
  const ci = options.find((o) => o.nilai.toLowerCase() === lower || o.uraian.toLowerCase() === lower);
  return ci ? ci.nilai : v;
}

export const TRANSPORTASI_LEGACY: Record<string, string> = {
  'Angkutan Umum': 'Angkutan umum/bus/pete-pete',
  'Antar Jemput': 'Mobil/bus antar jemput',
};

export const PENGHASILAN_LEGACY: Record<string, string> = {
  'Rp 2.000.000 - Rp 3.000.000': 'Rp. 2,000,000 - Rp. 4,999,999',
  'Rp 3.000.000 - Rp 5.000.000': 'Rp. 2,000,000 - Rp. 4,999,999',
  'Rp 5.000.000 - Rp 10.000.000': 'Rp. 5,000,000 - Rp. 20,000,000',
  'Lebih dari Rp 10.000.000': 'Rp. 5,000,000 - Rp. 20,000,000',
};

export const PEKERJAAN_LEGACY: Record<string, string> = {
  'Pegawai BUMN': 'Karyawan BUMN',
};

export const AGAMA_LEGACY: Record<string, string> = {
  Budha: 'Buddha',
  'Kepercayaan kpd Tuhan YME': 'Kepercayaan',
};
