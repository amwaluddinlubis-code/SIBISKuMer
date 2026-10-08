import { JenjangSekolah, TingkatKelas, FaseKurikulum, NilaiMataPelajaran, RaportSemester, Siswa } from '../types';

export interface MapelTemplate {
  nama: string;
  kategori: 'Wajib' | 'Pilihan' | 'Muatan Lokal';
  deskripsiDefaultTertinggi: string;
  deskripsiDefaultPerlu: string;
}

export const MAPEL_SD_FASE_A: MapelTemplate[] = [
  {
    nama: 'Pendidikan Agama dan Budi Pekerti',
    kategori: 'Wajib',
    deskripsiDefaultTertinggi: 'Menunjukkan pemahaman yang sangat baik dalam mengenal rukun iman/ajaran kasih dan pembiasaan doa sehari-hari.',
    deskripsiDefaultPerlu: 'Perlu bimbingan dalam melafalkan doa secara mandiri dan kesabaran saat beribadah.'
  },
  {
    nama: 'Pendidikan Pancasila',
    kategori: 'Wajib',
    deskripsiDefaultTertinggi: 'Sangat baik dalam mengenal simbol sila-sila Pancasila dan menaati aturan di rumah serta sekolah.',
    deskripsiDefaultPerlu: 'Perlu pendampingan dalam konsistensi mematuhi tata tertib kelas dan menghargai perbedaan teman.'
  },
  {
    nama: 'Bahasa Indonesia',
    kategori: 'Wajib',
    deskripsiDefaultTertinggi: 'Menunjukkan kemampuan istimewa dalam menyimak cerita, melafalkan bunyi huruf, dan membaca kata sederhana.',
    deskripsiDefaultPerlu: 'Perlu latihan lebih lanjut dalam merangkai suku kata menjadi kalimat dan kerapian menulis tegak bersambung.'
  },
  {
    nama: 'Matematika',
    kategori: 'Wajib',
    deskripsiDefaultTertinggi: 'Sangat terampil dalam membilang bilangan cacah sampai 100 serta penjumlahan dan pengurangan sederhana.',
    deskripsiDefaultPerlu: 'Perlu bimbingan dalam membedakan konsep bangun datar sederhana dan menyelesaikan soal cerita.'
  },
  {
    nama: 'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
    kategori: 'Wajib',
    deskripsiDefaultTertinggi: 'Sangat aktif dan lincah dalam mempraktikkan gerak dasar lokomotor, non-lokomotor, dan manipulatif.',
    deskripsiDefaultPerlu: 'Perlu pembiasaan dalam menjaga pola hidup bersih dan kebugaran tubuh secara teratur.'
  },
  {
    nama: 'Seni dan Budaya (Seni Rupa / Musik)',
    kategori: 'Wajib',
    deskripsiDefaultTertinggi: 'Menunjukkan kreativitas yang tinggi dalam memadukan warna, menggambar ekspresi, dan menyanyikan lagu anak.',
    deskripsiDefaultPerlu: 'Perlu bimbingan dalam ketelitian menggunakan alat gambar dan rasa percaya diri saat tampil.'
  },
  {
    nama: 'Bahasa Inggris',
    kategori: 'Pilihan',
    deskripsiDefaultTertinggi: 'Sangat baik dalam merespons instruksi sederhana dan mengenal kosakata warna, angka, dan hewan.',
    deskripsiDefaultPerlu: 'Perlu bimbingan dalam keberanian pelafalan kosakata bahasa Inggris sehari-hari.'
  },
  {
    nama: 'Muatan Lokal (Bahasa Daerah)',
    kategori: 'Muatan Lokal',
    deskripsiDefaultTertinggi: 'Sangat baik dalam melafalkan salam, perkenalan diri, dan tata krama berbahasa daerah.',
    deskripsiDefaultPerlu: 'Perlu bimbingan dalam memperkaya perbendaharaan kata halus/sopan bahasa daerah.'
  }
];

export const MAPEL_SD_FASE_BC: MapelTemplate[] = [
  {
    nama: 'Pendidikan Agama dan Budi Pekerti',
    kategori: 'Wajib',
    deskripsiDefaultTertinggi: 'Menunjukkan pemahaman yang sangat mendalam mengenai nilai-nilai moral keagamaan dan penerapan toleransi.',
    deskripsiDefaultPerlu: 'Perlu bimbingan dalam konsistensi menjalankan ibadah wajib dan pengamalan akhlak terpuji.'
  },
  {
    nama: 'Pendidikan Pancasila',
    kategori: 'Wajib',
    deskripsiDefaultTertinggi: 'Sangat baik dalam memahami hak dan kewajiban sebagai warga sekolah serta keberagaman budaya bangsa.',
    deskripsiDefaultPerlu: 'Perlu bimbingan dalam musyawarah mufakat dan menghargai keputusan bersama di kelas.'
  },
  {
    nama: 'Bahasa Indonesia',
    kategori: 'Wajib',
    deskripsiDefaultTertinggi: 'Sangat terampil dalam menemukan ide pokok teks informatif, menulis paragraf runtut, dan berpidato singkat.',
    deskripsiDefaultPerlu: 'Perlu pendampingan dalam penggunaan tanda baca baku dan penyusunan kalimat majemuk.'
  },
  {
    nama: 'Matematika',
    kategori: 'Wajib',
    deskripsiDefaultTertinggi: 'Sangat terampil dalam operasi hitung pecahan, desimal, serta menghitung luas dan volume bangun ruang.',
    deskripsiDefaultPerlu: 'Perlu pendampingan dalam ketelitian pengerjaan soal penalaran matematis bertingkat.'
  },
  {
    nama: 'Ilmu Pengetahuan Alam dan Sosial (IPAS)',
    kategori: 'Wajib',
    deskripsiDefaultTertinggi: 'Sangat baik dalam menganalisis siklus hidup makhluk hidup, rantai makanan, dan bentang alam Indonesia.',
    deskripsiDefaultPerlu: 'Perlu bimbingan dalam memahami proses perubahan wujud benda dan penghematan energi energi.'
  },
  {
    nama: 'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
    kategori: 'Wajib',
    deskripsiDefaultTertinggi: 'Sangat baik dalam keterampilan permainan bola besar/kecil dan menjunjung tinggi sportivitas.',
    deskripsiDefaultPerlu: 'Perlu peningkatan stamina dalam aktivitas fisik dan pemahaman pertolongan pertama sederhana.'
  },
  {
    nama: 'Seni dan Budaya (Seni Rupa / Musik / Tari)',
    kategori: 'Wajib',
    deskripsiDefaultTertinggi: 'Sangat kreatif dalam menciptakan karya seni kriya orisinal dan mengapresiasi ragam tari tradisional.',
    deskripsiDefaultPerlu: 'Perlu pendampingan dalam teknik penyelesaian akhir karya seni rupa.'
  },
  {
    nama: 'Bahasa Inggris',
    kategori: 'Pilihan',
    deskripsiDefaultTertinggi: 'Sangat fasih dalam percakapan perkenalan diri, mendeskripsikan benda di sekitar, dan membaca teks naratif pendek.',
    deskripsiDefaultPerlu: 'Perlu pendampingan dalam struktur tata bahasa sederhana (simple present tense).'
  },
  {
    nama: 'Muatan Lokal (Bahasa Daerah)',
    kategori: 'Muatan Lokal',
    deskripsiDefaultTertinggi: 'Sangat terampil membaca teks beraksara/dongeng daerah dan menggunakan undak-usuk basa santun.',
    deskripsiDefaultPerlu: 'Perlu bimbingan dalam menulis kalimat bebas berbahasa daerah dengan ejaan yang tepat.'
  }
];

export const MAPEL_SMP_FASE_D: MapelTemplate[] = [
  {
    nama: 'Pendidikan Agama dan Budi Pekerti',
    kategori: 'Wajib',
    deskripsiDefaultTertinggi: 'Menunjukkan pemahaman yang sangat mendalam mengenai dalil keagamaan, toleransi, dan kepedulian sosial.',
    deskripsiDefaultPerlu: 'Perlu penguatan dalam penghayatan ibadah wajib serta penguasaan bacaan kitab suci.'
  },
  {
    nama: 'Pendidikan Pancasila',
    kategori: 'Wajib',
    deskripsiDefaultTertinggi: 'Sangat kritis dalam menganalisis norma hukum, konstitusi UUD NRI 1945, dan menjaga persatuan NKRI.',
    deskripsiDefaultPerlu: 'Perlu penguatan dalam menerapkan nilai musyawarah mufakat dan kedisiplinan berorganisasi.'
  },
  {
    nama: 'Bahasa Indonesia',
    kategori: 'Wajib',
    deskripsiDefaultTertinggi: 'Sangat terampil menelaah struktur dan kaidah kebahasaan teks eksposisi, tanggapan, dan teks berita.',
    deskripsiDefaultPerlu: 'Perlu pembiasaan menulis argumen berbasis data faktual dan penyuntingan tanda baca.'
  },
  {
    nama: 'Matematika',
    kategori: 'Wajib',
    deskripsiDefaultTertinggi: 'Sangat unggul dalam menyelesaikan persamaan linear, sistem koordinat kartesius, dan logika aljabar.',
    deskripsiDefaultPerlu: 'Perlu pendampingan dalam ketelitian memecahkan masalah kontekstual teorema Phytagoras dan statistik.'
  },
  {
    nama: 'Ilmu Pengetahuan Alam (IPA)',
    kategori: 'Wajib',
    deskripsiDefaultTertinggi: 'Sangat memahami konsep sel organisme, ekosistem, sistem pernapasan, serta dinamika gerak dan gaya.',
    deskripsiDefaultPerlu: 'Perlu bimbingan dalam perumusan hipotesis eksperimen laboratorium dan perhitungan fluida statis.'
  },
  {
    nama: 'Ilmu Pengetahuan Sosial (IPS)',
    kategori: 'Wajib',
    deskripsiDefaultTertinggi: 'Sangat baik dalam menelaah interaksi keruangan antarnegara ASEAN, mobilitas sosial, dan kegiatan ekonomi pasar.',
    deskripsiDefaultPerlu: 'Perlu penguatan pemahaman kronologi peristiwa sejarah perjuangan kemerdekaan nasional.'
  },
  {
    nama: 'Bahasa Inggris',
    kategori: 'Wajib',
    deskripsiDefaultTertinggi: 'Sangat fasih memahami isi teks recount/procedure dan aktif mengemukakan opini secara lisan.',
    deskripsiDefaultPerlu: 'Perlu bimbingan dalam penggunaan bentuk lampau (past tense) dan kekayaan idiom kosakata.'
  },
  {
    nama: 'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
    kategori: 'Wajib',
    deskripsiDefaultTertinggi: 'Sangat mahir dalam strategi permainan beregu bola voli/basket serta menjaga disiplin kebugaran jasmani.',
    deskripsiDefaultPerlu: 'Perlu bimbingan dalam teknik renang gaya dada dan pencegahan cedera olahraga mandiri.'
  },
  {
    nama: 'Informatika',
    kategori: 'Wajib',
    deskripsiDefaultTertinggi: 'Sangat terampil dalam berpikir komputasional, analisis data spreadsheet, dan logika pemrograman blok/visual.',
    deskripsiDefaultPerlu: 'Perlu penguatan pemahaman jaringan komputer, topologi, dan etika keamanan data digital.'
  },
  {
    nama: 'Seni dan Prakarya (Seni Rupa / Musik)',
    kategori: 'Wajib',
    deskripsiDefaultTertinggi: 'Sangat kreatif dalam membuat karya ilustrasi perspektif orisinal dan memainkan alat musik ansambel.',
    deskripsiDefaultPerlu: 'Perlu pendampingan dalam teknik pewarnaan gradasi dan eksplorasi bahan daur ulang.'
  },
  {
    nama: 'Muatan Lokal (Bahasa Daerah)',
    kategori: 'Muatan Lokal',
    deskripsiDefaultTertinggi: 'Sangat baik dalam melantunkan tembang/pupuh tradisional dan memahami tata krama kesantunan tutur bahasa.',
    deskripsiDefaultPerlu: 'Perlu peningkatan perbendaharaan istilah sastra daerah dan aksara tradisional.'
  }
];

export function getFaseKurikulum(tingkat: TingkatKelas): FaseKurikulum {
  if (tingkat === '1' || tingkat === '2') return 'Fase A';
  if (tingkat === '3' || tingkat === '4') return 'Fase B';
  if (tingkat === '5' || tingkat === '6') return 'Fase C';
  return 'Fase D';
}

/** Baca tingkat dari nama rombel. Mendukung "7A", "Kelas 5", "Kelas V",
 *  "KELAS V-A", "VII", "VIII", "IX" (umum di Dapodik SD). */
export function getTingkatDariRombel(namaRombel?: string): TingkatKelas | null {
  if (!namaRombel) return null;
  const r = namaRombel.trim();
  if (!r) return null;
  const first = r.charAt(0);
  if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(first)) {
    return first as TingkatKelas;
  }
  // Angka 1-9 yang berdiri sendiri di tengah nama ("Kelas 8", "Rombel 3 B")
  const digit = r.match(/\b([1-9])\b/);
  if (digit) return digit[1] as TingkatKelas;
  // Angka Romawi sebagai kata utuh — urutan penting (VIII sebelum VII, IV/IX sebelum V/I)
  const romawi: [RegExp, TingkatKelas][] = [
    [/\bVIII\b/i, '8'],
    [/\bVII\b/i, '7'],
    [/\bIX\b/i, '9'],
    [/\bIV\b/i, '4'],
    [/\bVI\b/i, '6'],
    [/\bIII\b/i, '3'],
    [/\bII\b/i, '2'],
    [/\bV\b/i, '5'],
    [/\bI\b/i, '1'],
  ];
  for (const [re, t] of romawi) {
    if (re.test(r)) return t;
  }
  return null;
}

export function getTingkatOptions(jenjang: JenjangSekolah = 'SMP'): TingkatKelas[] {
  if (jenjang === 'SD') {
    return ['1', '2', '3', '4', '5', '6'];
  }
  return ['7', '8', '9'];
}

export function getDefaultRombelOptions(jenjang: JenjangSekolah = 'SMP'): string[] {
  if (jenjang === 'SD') {
    return [
      '1A', '1B', '2A', '2B', '3A', '3B',
      '4A', '4B', '5A', '5B', '6A', '6B'
    ];
  }
  return ['7A', '7B', '7C', '8A', '8B', '8C', '9A', '9B', '9C'];
}

export function getDefaultMataPelajaran(jenjang: JenjangSekolah = 'SMP', tingkat: TingkatKelas = '7'): MapelTemplate[] {
  if (jenjang === 'SD') {
    if (tingkat === '1' || tingkat === '2') {
      return MAPEL_SD_FASE_A;
    }
    return MAPEL_SD_FASE_BC;
  }
  return MAPEL_SMP_FASE_D;
}

export function calculatePredikat(nilai: number): 'A' | 'B' | 'C' | 'D' {
  if (nilai >= 90) return 'A';
  if (nilai >= 80) return 'B';
  if (nilai >= 70) return 'C';
  return 'D';
}

export function generateDeskripsiOtomatis(
  mapelNama: string,
  nilai: number,
  jenjang: JenjangSekolah = 'SMP',
  tingkat: TingkatKelas = '7'
): { capaianTertinggi: string; capaianPerluPeningkatan: string } {
  const templates = getDefaultMataPelajaran(jenjang, tingkat) || [];
  const found = templates.find((t) => t && t.nama && t.nama.toLowerCase() === (mapelNama || '').toLowerCase());

  const predikat = calculatePredikat(nilai);

  if (found) {
    if (predikat === 'A') {
      return {
        capaianTertinggi: found.deskripsiDefaultTertinggi,
        capaianPerluPeningkatan: 'Mampu mempertahankan dan mengembangkan capaian materi pengayaan secara mandiri.'
      };
    } else if (predikat === 'B') {
      return {
        capaianTertinggi: found.deskripsiDefaultTertinggi.replace('sangat ', '').replace('Sangat ', 'Baik dalam '),
        capaianPerluPeningkatan: found.deskripsiDefaultPerlu
      };
    } else if (predikat === 'C') {
      return {
        capaianTertinggi: `Cukup memahami materi pokok ${mapelNama} sesuai target ketuntasan capaian pembelajaran.`,
        capaianPerluPeningkatan: found.deskripsiDefaultPerlu
      };
    } else {
      return {
        capaianTertinggi: `Menunjukkan usaha dalam mengikuti pembelajaran pokok ${mapelNama}.`,
        capaianPerluPeningkatan: `Sangat membutuhkan bimbingan intensif dan latihan remedial terstruktur pada seluruh indikator ${mapelNama}.`
      };
    }
  }

  // Fallback generic descriptors
  if (predikat === 'A') {
    return {
      capaianTertinggi: `Menunjukkan penguasaan yang sangat baik dan konsisten pada seluruh capaian pembelajaran ${mapelNama}.`,
      capaianPerluPeningkatan: 'Mampu mengembangkan pemahaman melalui materi pengayaan tingkat lanjut.'
    };
  } else if (predikat === 'B') {
    return {
      capaianTertinggi: `Menunjukkan penguasaan yang baik dan aktif dalam kegiatan pembelajaran ${mapelNama}.`,
      capaianPerluPeningkatan: `Perlu latihan lebih lanjut pada aspek pendalaman konsep ${mapelNama}.`
    };
  } else if (predikat === 'C') {
    return {
      capaianTertinggi: `Cukup menguasai kompetensi dasar materi ${mapelNama} dengan baik.`,
      capaianPerluPeningkatan: `Perlu bimbingan dan keaktifan dalam menyelesaikan tugas-tugas ${mapelNama}.`
    };
  } else {
    return {
      capaianTertinggi: `Menunjukkan kemauan dalam mengikuti proses belajar ${mapelNama}.`,
      capaianPerluPeningkatan: `Memerlukan bimbingan khusus dari guru dan orang tua pada capaian pembelajaran ${mapelNama}.`
    };
  }
}

export function buildInitialNilaiMapel(jenjang: JenjangSekolah = 'SMP', tingkat: TingkatKelas = '7'): NilaiMataPelajaran[] {
  const templates = getDefaultMataPelajaran(jenjang, tingkat);
  const stamp = Date.now();
  return templates.map((t, idx) => {
    const nilai = 85;
    const predikat = calculatePredikat(nilai);
    const { capaianTertinggi, capaianPerluPeningkatan } = generateDeskripsiOtomatis(t.nama, nilai, jenjang, tingkat);
    return {
      id: `mapel-${idx + 1}-${stamp}-${idx}`,
      mataPelajaran: t.nama,
      kategori: t.kategori,
      nilaiAkhir: nilai,
      predikat,
      capaianTertinggi,
      capaianPerluPeningkatan
    };
  });
}

/** Daftar nilai dalam satu raport — mendukung field lama `nilaiMataPelajaran`
 *  maupun field baku `nilaiMapel`. Tidak pernah melempar bila salah satunya kosong. */
export function getNilaiList(raport: RaportSemester | null | undefined): NilaiMataPelajaran[] {
  if (!raport) return [];
  if (Array.isArray(raport.nilaiMapel) && raport.nilaiMapel.length > 0) return raport.nilaiMapel;
  if (Array.isArray(raport.nilaiMataPelajaran) && raport.nilaiMataPelajaran.length > 0) return raport.nilaiMataPelajaran;
  return Array.isArray(raport.nilaiMapel) ? raport.nilaiMapel : [];
}

/** Daftar raport milik siswa — mendukung field lama `raportSemester`
 *  maupun field baku `nilaiRaport`. Mengembalikan gabungan unik berdasar id. */
export function getRaportList(siswa: Siswa | null | undefined): RaportSemester[] {
  if (!siswa) return [];
  const a = Array.isArray(siswa.nilaiRaport) ? siswa.nilaiRaport : [];
  const b = Array.isArray(siswa.raportSemester) ? siswa.raportSemester : [];
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const seen = new Set<string>();
  const merged: RaportSemester[] = [];
  for (const r of [...a, ...b]) {
    const key = r?.id || `${r?.tahunAjaran}-${r?.semester}`;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    merged.push(r);
  }
  return merged;
}

/** Normalisasi raport agar kedua alias selalu terisi sama (mencegah crash
 *  pembaca yang hanya memakai salah satu field). */
export function normalizeRaport(raport: RaportSemester): RaportSemester {
  const nilai = getNilaiList(raport);
  return { ...raport, nilaiMapel: [...nilai], nilaiMataPelajaran: [...nilai] };
}

/** Normalisasi seluruh raport milik siswa (dipakai sebelum simpan/tampil). */
export function normalizeSiswaRaport(siswa: Siswa): Siswa {
  const list = getRaportList(siswa).map(normalizeRaport);
  return { ...siswa, nilaiRaport: list, raportSemester: list };
}

/** F7 — Pembulatan TUNGGAL untuk rata-rata nilai raport: 1 desimal dengan
 *  aturan Math.round(n*10)/10. Dipakai di simpan (NilaiRaportView), cetak
 *  (CetakBukuInduk), dan ekspor agar angka dokumen resmi selalu sama dengan
 *  data tersimpan. PENTING: helper ini TIDAK mengubah/migrasi data lama —
 *  hanya menyamakan logika pembulatan ke depan. */
export function bulatkanNilai(nilai: number): number {
  if (!Number.isFinite(nilai)) return 0;
  return Math.round(nilai * 10) / 10;
}

/** F14 — Rata-rata nilai mapel; nilai null/undefined ("belum dinilai")
 *  DIABAIKAN — tidak dihitung sebagai 0 dan tidak ikut penyebut — agar
 *  mapel yang belum dinilai tidak menekan rata-rata tanpa jejak.
 *  Hasil memakai aturan pembulatan tunggal bulatkanNilai (F7). */
export function hitungRataRataNilai(list: Array<{ nilaiAkhir?: number | null }>): number {
  const valid = (list || []).filter(
    (m) => typeof m?.nilaiAkhir === 'number' && Number.isFinite(m.nilaiAkhir)
  );
  if (valid.length === 0) return 0;
  const total = valid.reduce((acc, m) => acc + (m.nilaiAkhir as number), 0);
  return bulatkanNilai(total / valid.length);
}
