// ---------------- ASISTEN AI ADMINISTRASI (Issue #13) ----------------
// Modul MURNI (tanpa IO / DOM / IndexedDB) agar mudah diuji.
//
// ATURAN PRIVASI YANG TIDAK BISA DITAWAR (ditegakkan di sini + server/ai.ts):
// 1. Jalur eksternal HANYA menerima data agregat (hitungan per aturan) dan
//    isian draf yang sudah teredaksi. Data bernama siswa (nama, NISN, NIK,
//    telepon, alamat, email) TIDAK PERNAH dikirim ke layanan eksternal —
//    bukan karena flag, melainkan karena arsitektur: server MENOLAK payload
//    yang mengandung field identitas (400) dan meredaksi ulang sebelum kirim.
// 2. AI tidak pernah menjadi sumber data resmi dan tidak pernah membuat
//    keputusan administratif final. Keluaran AI selalu berupa DRAF yang
//    wajib ditinjau/diubah/disetujui operator sebelum dipakai; tidak ada
//    jalur yang menyimpan perubahan sensitif dari keluaran AI tanpa
//    konfirmasi manusia.
// 3. Nomor surat TIDAK PERNAH dikarang (cermin suratDokumen.ts): draf
//    memakai placeholder yang wajib diisi operator. Peraturan / fakta siswa
//    juga tidak dikarang: draf hanya memakai isian operator + template
//    tetap; penjelasan aturan hanya mengutip katalog ATURAN_PEMERIKSA.
// 4. Prompt dan keluaran AI TIDAK PERNAH masuk log/audit. Audit hanya
//    mencatat metadata: mode, sumber (lokal/eksternal), dan waktu.
import type { TemuanPemeriksa } from './pemeriksaData';
import { ATURAN_PEMERIKSA } from './pemeriksaData';
import { TEMPLATE_SURAT, type TemplateSuratId } from './suratDokumen';

export type ModeAi = 'ringkasan' | 'draf';
export type SumberAi = 'lokal' | 'eksternal';

export interface HasilAi {
  teks: string;
  sumber: SumberAi;
  /** Alasan fallback / catatan transparansi (tampil di UI, bukan di log). */
  peringatan?: string;
}

// ---------------- Redaksi ----------------

/** Pola identitas yang wajib disensor sebelum teks apa pun keluar perangkat. */
const POLA_IDENTITAS: Array<{ pola: RegExp; ganti: string }> = [
  { pola: /\b\d{16}\b/g, ganti: '[NIK]' }, // NIK / No. KK (16 digit)
  { pola: /\b\d{10}\b/g, ganti: '[NISN]' }, // NISN (10 digit)
  { pola: /\b08\d{8,11}\b/g, ganti: '[TELEPON]' }, // nomor HP Indonesia
  { pola: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, ganti: '[EMAIL]' },
];

/** Sensor identitas dari teks bebas. Deterministik, tanpa IO. */
export function redaksiTeks(teks: string): string {
  let hasil = teks || '';
  for (const { pola, ganti } of POLA_IDENTITAS) {
    hasil = hasil.replace(pola, ganti);
  }
  return hasil;
}

/** True bila teks masih mengandung pola identitas (dipakai server untuk menolak payload). */
export function mengandungIdentitas(teks: string): boolean {
  return POLA_IDENTITAS.some(({ pola }) => {
    pola.lastIndex = 0;
    return pola.test(teks || '');
  });
}

/** Kunci field yang TIDAK PERNAH boleh ada di payload jalur eksternal. */
export const FIELD_IDENTITAS_TERLARANG = [
  'nama',
  'namalengkap',
  'nisn',
  'nik',
  'telepon',
  'nohp',
  'hp',
  'alamat',
  'email',
  'nokk',
  'nipd',
] as const;

/** True bila objek payload mengandung kunci identitas (cek case-insensitive). */
export function payloadMengandungIdentitas(objek: unknown): boolean {
  if (!objek || typeof objek !== 'object') return false;
  return Object.keys(objek as Record<string, unknown>).some((k) =>
    (FIELD_IDENTITAS_TERLARANG as readonly string[]).includes(k.toLowerCase())
  );
}

// ---------------- Ringkasan agregat (tanpa identitas) ----------------

export interface AturanAgregat {
  aturanId: string;
  judul: string;
  kategori: string;
  prioritas: string;
  jumlah: number;
}

export interface RingkasanAgregatAi {
  totalTemuan: number;
  /** Jumlah siswa terdampak — HITUNGAN saja, tanpa daftar ID/nama. */
  totalSiswaTerdampak: number;
  perKategori: Record<string, number>;
  perPrioritas: Record<string, number>;
  aturanTeratas: AturanAgregat[];
  /** Saran tindak lanjut generik (bukan keputusan — operator yang mengeksekusi). */
  saran: string[];
}

/** Agregasi temuan menjadi ringkasan tanpa identitas apa pun. */
export function ringkasanAgregat(temuan: TemuanPemeriksa[]): RingkasanAgregatAi {
  const perKategori: Record<string, number> = {};
  const perPrioritas: Record<string, number> = {};
  const siswaUnik = new Set<string>();
  const perAturan = new Map<string, AturanAgregat>();
  for (const t of temuan || []) {
    perKategori[t.kategori] = (perKategori[t.kategori] || 0) + 1;
    perPrioritas[t.prioritas] = (perPrioritas[t.prioritas] || 0) + 1;
    if (t.siswaId) siswaUnik.add(t.siswaId);
    const lama = perAturan.get(t.aturanId);
    if (lama) {
      lama.jumlah += 1;
    } else {
      perAturan.set(t.aturanId, {
        aturanId: t.aturanId,
        judul: t.judul,
        kategori: t.kategori,
        prioritas: t.prioritas,
        jumlah: 1,
      });
    }
  }
  const aturanTeratas = [...perAturan.values()].sort((a, b) => b.jumlah - a.jumlah).slice(0, 5);
  const saran: string[] = [];
  if ((perKategori['wajib'] || 0) > 0) {
    saran.push(`Lengkapi dulu ${perKategori['wajib']} temuan wajib — data wajib yang kosong menghambat dokumen resmi.`);
  }
  if ((perPrioritas['tinggi'] || 0) > 0) {
    saran.push(`Prioritaskan ${perPrioritas['tinggi']} temuan prioritas tinggi sebelum tutup tahun atau cetak massal.`);
  }
  if ((perKategori['duplikat'] || 0) > 0) {
    saran.push('Temuan duplikat hanya "kemungkinan" — verifikasi manual; jangan gabung/hapus otomatis.');
  }
  if (saran.length === 0) {
    saran.push('Tidak ada temuan — data sudah bersih menurut aturan yang aktif.');
  }
  return {
    totalTemuan: (temuan || []).length,
    totalSiswaTerdampak: siswaUnik.size,
    perKategori,
    perPrioritas,
    aturanTeratas,
    saran,
  };
}

/** Narasi ringkasan dari agregat (mesin lokal — dipakai sebagai fallback provider). */
export function susunNarasiRingkasan(ringkasan: RingkasanAgregatAi): string {
  if (ringkasan.totalTemuan === 0) {
    return 'Ringkasan kelengkapan data: tidak ditemukan temuan pada aturan yang aktif. Data sudah bersih menurut pemeriksaan saat ini.';
  }
  const baris = [
    `Ringkasan kelengkapan data: ${ringkasan.totalTemuan} temuan pada ${ringkasan.totalSiswaTerdampak} siswa.`,
    `Per kategori: ${Object.entries(ringkasan.perKategori)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}.`,
    `Per prioritas: ${Object.entries(ringkasan.perPrioritas)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}.`,
  ];
  if (ringkasan.aturanTeratas.length > 0) {
    baris.push(
      `Aturan terbanyak: ${ringkasan.aturanTeratas
        .map((a) => `${a.judul} (${a.jumlah})`)
        .join('; ')}.`
    );
  }
  baris.push(`Saran tindak lanjut: ${ringkasan.saran.join(' ')}`);
  baris.push('Catatan: ringkasan ini agregat — tidak memuat nama atau identitas siswa.');
  return baris.join('\n');
}

// ---------------- Penjelasan aturan (dapat ditelusuri) ----------------

const LANGKAH_PER_KATEGORI: Record<string, string[]> = {
  wajib: ['Buka formulir siswa yang bersangkutan dan lengkapi field yang kosong.', 'Simpan, lalu jalankan ulang Pemeriksa Data untuk memastikan temuan hilang.'],
  format: ['Perbaiki penulisan field sesuai format yang diminta (jumlah digit / pola).', 'Hindari spasi dan karakter tambahan di dalam nomor.'],
  rentang: ['Periksa kembali nilai tanggal/angka terhadap rentang yang diizinkan.', 'Bila nilai memang benar, catat alasannya dan abaikan temuan secara sadar.'],
  konflik: ['Bandingkan field yang saling bertentangan dan tentukan mana yang benar dari dokumen sumber.', 'Perbaiki satu sisi saja agar konsisten.'],
  duplikat: ['Verifikasi manual apakah kedua record memang orang yang sama.', 'Jangan gabung atau hapus otomatis — keputusan ada di operator.'],
};

export interface PenjelasanAturan {
  aturanId: string;
  judul: string;
  kategori: string;
  prioritas: string;
  penjelasan: string;
  langkah: string[];
}

/** Penjelasan aturan dari katalog — null bila ID tidak dikenal (tidak mengarang). */
export function jelaskanAturan(aturanId: string): PenjelasanAturan | null {
  const aturan = ATURAN_PEMERIKSA.find((a) => a.id === aturanId);
  if (!aturan) return null;
  return {
    aturanId: aturan.id,
    judul: aturan.judul,
    kategori: aturan.kategori,
    prioritas: aturan.prioritas,
    penjelasan: aturan.penjelasan,
    langkah: LANGKAH_PER_KATEGORI[aturan.kategori] || ['Tinjau temuan dan perbaiki manual lewat formulir.'],
  };
}

// ---------------- Draf surat (template + isian minimum) ----------------

export const PLACEHOLDER_NOMOR_SURAT = '[NOMOR SURAT — diisi operator]';
export const PLACEHOLDER_NAMA = '[NAMA — diisi operator]';

/**
 * Susun draf surat dari template + isian operator. MURNI lokal.
 * - Field wajib template yang kosong → Error (operator melengkapi dulu).
 * - Nomor surat TIDAK PERNAH dikarang: selalu placeholder, kecuali operator
 *   mengisi nomornya sendiri lewat `nomorSurat`.
 * - Nama pemohon opsional dan HANYA dipakai lokal; pengiriman eksternal
 *   wajib menggantinya dengan placeholder (lihat server/ai.ts).
 */
export function susunDrafSurat(
  templateId: string,
  isian: Record<string, string>,
  namaSekolah: string,
  tanggalISO: string
): string {
  const template = (TEMPLATE_SURAT as Record<string, { judul: string; perihal: string; field: Array<{ kunci: string; label: string; wajib: boolean }> }>)[templateId];
  if (!template) throw new Error(`Template surat tidak dikenal: ${templateId}.`);
  const kosong = template.field.filter((f) => f.wajib && !(isian[f.kunci] || '').trim());
  if (kosong.length > 0) {
    throw new Error(`Field wajib belum diisi: ${kosong.map((f) => f.label).join(', ')}.`);
  }
  const nama = (isian['nama'] || '').trim() || PLACEHOLDER_NAMA;
  const nomor = (isian['nomorSurat'] || '').trim() || PLACEHOLDER_NOMOR_SURAT;
  const baris: string[] = [
    `${namaSekolah}`,
    `Nomor: ${nomor}`,
    `Perihal: ${template.perihal}`,
    '',
    `DRAF — ${template.judul}`,
    '',
    `Yang bertanda tangan di bawah ini menerangkan bahwa ${nama} adalah siswa di ${namaSekolah}.`,
    '',
  ];
  for (const f of template.field) {
    const nilai = (isian[f.kunci] || '').trim();
    if (nilai) baris.push(`${f.label}: ${nilai}`);
  }
  baris.push(
    '',
    'Demikian surat keterangan ini dibuat untuk dapat dipergunakan sebagaimana mestinya.',
    '',
    `Tanggal: ${tanggalISO}`,
    '',
    'Catatan: draf ini disusun dari template + isian operator dan WAJIB ditinjau sebelum dipakai. Nomor surat di atas bukan nomor resmi bila masih placeholder.'
  );
  return baris.join('\n');
}

// ---------------- Validasi keluaran ----------------

/** Keluaran AI (lokal/eksternal) yang kosong atau berlebih ditolak — fallback lokal dipakai. */
export function validasiKeluaran(teks: unknown): { ok: boolean; alasan?: string } {
  if (typeof teks !== 'string' || teks.trim().length === 0) {
    return { ok: false, alasan: 'Keluaran kosong.' };
  }
  if (teks.length > 8000) {
    return { ok: false, alasan: 'Keluaran melebihi batas 8000 karakter.' };
  }
  return { ok: true };
}
