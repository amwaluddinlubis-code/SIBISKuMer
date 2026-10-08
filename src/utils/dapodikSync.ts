import { Siswa, DapodikConfig, DapodikRawPesertaDidik, DapodikRawSekolah, DapodikRawRombel, DapodikRawPtk, DapodikRawPengguna, RombelRef, PtkRef, AppUser, SekolahProfile, Agama, TingkatKelas, JenjangSekolah, FaseKurikulum } from '../types';
import { mockDapodikPesertaDidik, mockDapodikSekolah, mockDapodikRombel, mockDapodikPtk, mockDapodikPengguna } from '../data/initialData';
import { getFaseKurikulum, getTingkatDariRombel } from './raportUtils';
import { hashPassword } from './password';

/** Dapodik sering membungkus error sebagai teks "HTTP/1.0 403 ..." diikuti JSON.
 *  Helper ini mengekstrak bagian JSON agar direct-fetch dari browser tidak crash
 *  dengan SyntaxError yang menyembunyikan pesan asli. */
export function extractDapodikJsonText(text: string): any {
  const src = (text || '').trim();
  if (!src) throw new Error('Respons kosong dari Dapodik');
  const iObj = src.indexOf('{');
  const iArr = src.indexOf('[');
  let start = -1;
  if (iObj === -1) start = iArr;
  else if (iArr === -1) start = iObj;
  else start = Math.min(iObj, iArr);
  if (start === -1) {
    throw new Error(`Respons Dapodik bukan JSON: ${src.slice(0, 120)}`);
  }
  return JSON.parse(src.slice(start));
}

/** Buka amplop respons Dapodik yang bentuknya beragam:
 *  array langsung, {rows:[...]}, {rows:{...}} (SATU objek — kasus getSekolah),
 *  {results:[...]}, {result:{...}}, {data:...}, atau objek record langsung. */
export function unwrapDapodikRecord<T>(data: unknown): T | null {
  if (!data) return null;
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  if (typeof data !== 'object') return null;
  const rec = data as Record<string, unknown>;
  for (const key of ['rows', 'results', 'result', 'data']) {
    const v = rec[key];
    if (Array.isArray(v) && v.length > 0) return v[0] as T;
    if (v && typeof v === 'object') return v as T;
  }
  return data as T;
}

/** Buang awalan resmi wilayah Dapodik ("Kec. ", "Kab. ", "Prov. ") agar
 *  dokumen cetak tidak ganda ("Kec. Kec. Ranto Baek"). */
export function stripWilayahPrefix(value: string | undefined, prefix: RegExp): string {
  const s = (value || '').trim();
  return s.replace(prefix, '').trim();
}

/** "0" / "-" / "http://" dari Dapodik berarti kosong — pakai nilai lama. */
function dapodikStr(raw: unknown, existing = ''): string {
  const s = String(raw ?? '').trim();
  if (!s || s === '0' || s === '-' || s === '--') return existing;
  return s;
}

function dapodikWebsite(raw: unknown, existing = ''): string {
  const s = String(raw ?? '').trim();
  if (!s || /^https?:\/\/\s*$/.test(s) || s === '-') return existing;
  return s;
}

/** Normalisasi daftar Dapodik: rows/results/result/data bisa berupa
 *  array, SATU objek (Dapodik kadang begitu), atau tidak ada. */
export function toDapodikList(jsonData: any): any[] {
  if (!jsonData) return [];
  if (Array.isArray(jsonData)) return jsonData;
  const nested = jsonData.rows ?? jsonData.results ?? jsonData.result ?? jsonData.data ?? [];
  if (Array.isArray(nested)) return nested;
  if (nested && typeof nested === 'object') return [nested];
  return [];
}

/** ID unik untuk siswa hasil sinkron (anti-tabrakan bila peserta_didik_id kosong
 *  atau beberapa baris dibuat dalam milidetik yang sama). */
function newSyncId(prefix: string, fallback = ''): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${fallback || Date.now().toString(36)}-${rand}`;
}

export function convertDapodikToSekolahProfile(
  raw: DapodikRawSekolah,
  existing: SekolahProfile
): SekolahProfile {
  const now = new Date().toISOString();
  let semester: '1 (Ganjil)' | '2 (Genap)' = existing.semesterAktif;
  if (raw.semester_id !== undefined && raw.semester_id !== null && String(raw.semester_id).trim() !== '') {
    semester = String(raw.semester_id).trim().endsWith('1') ? '1 (Ganjil)' : '2 (Genap)';
  }

  const bentuk = raw.bentuk_pendidikan_id_str || existing.bentukPendidikan || existing.jenjang || 'SMP';
  const jenjang: JenjangSekolah = /SD/i.test(bentuk) ? 'SD' : /SMP/i.test(bentuk) ? 'SMP' : (existing.jenjang || 'SMP');

  // status_sekolah "1" = Negeri, "2" = Swasta; utamakan string resminya bila ada.
  const statusRaw = (raw.status_sekolah_str || raw.status_sekolah || '').trim();
  const statusSekolah = (/swasta/i.test(statusRaw) || statusRaw === '2' ? 'Swasta' : 'Negeri') as 'Negeri' | 'Swasta';

  return {
    ...existing,
    jenjang,
    nama: (raw.nama || existing.nama).toUpperCase(),
    npsn: raw.npsn || existing.npsn,
    nss: raw.nss || existing.nss,
    bentukPendidikan: raw.bentuk_pendidikan_id_str || existing.bentukPendidikan || jenjang,
    statusSekolah,
    alamat: raw.alamat_jalan || existing.alamat,
    desaKelurahan: raw.desa_kelurahan || existing.desaKelurahan,
    kecamatan: stripWilayahPrefix(raw.kecamatan || existing.kecamatan, /^kec\.?\s+/i),
    kabupatenKota: stripWilayahPrefix(raw.kabupaten_kota || existing.kabupatenKota, /^(kab|kota)\.?\s+/i),
    provinsi: stripWilayahPrefix(raw.provinsi || existing.provinsi, /^prov\.?\s+/i),
    kodePos: dapodikStr(raw.kode_pos, existing.kodePos),
    telepon: dapodikStr(raw.nomor_telepon, existing.telepon),
    email: raw.email || existing.email,
    website: dapodikWebsite(raw.website, existing.website),
    kepalaSekolah: raw.kepala_sekolah || existing.kepalaSekolah,
    nipKepalaSekolah: raw.nip_kepala_sekolah || existing.nipKepalaSekolah,
    semesterAktif: semester,
    tahunAjaran: raw.tahun_ajaran || existing.tahunAjaran || '2026/2027',
    lastSyncedWithDapodik: now,
    syncSource: 'Web Service Dapodik Lokal'
  };
}

export async function fetchDapodikSekolah(
  config: DapodikConfig,
  useSimulation = false
): Promise<{ success: boolean; data?: DapodikRawSekolah; error?: string }> {
  if (useSimulation) {
    await new Promise((r) => setTimeout(r, 400));
    return {
      success: true,
      data: mockDapodikSekolah
    };
  }

  const host = config.ip || 'localhost';
  const port = config.port || 5774;
  const npsn = config.npsn || '';
  const token = config.token || '';

  // Try via proxy first
  try {
    const proxyRes = await fetch('/api/dapodik/fetch-sekolah', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, npsn, token })
    });

    if (proxyRes.ok) {
      const json = await proxyRes.json();
      if (json.success && json.data) {
        // Urai ulang di client: proxy lama (server belum di-restart) bisa
        // mengembalikan amplop {rows:{...}} yang belum dibuka.
        const unwrapped = unwrapDapodikRecord<DapodikRawSekolah>(json.data) || json.data;
        return { success: true, data: unwrapped };
      }
    }
  } catch (err: any) {
    console.warn('Proxy fetch sekolah failed:', err.message);
  }

  // Fallback to direct fetch
  try {
    const targetUrl = `http://${host}:${port}/WebService/getSekolah?npsn=${npsn}`;
    const directRes = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(4000)
    });

    if (directRes.ok) {
      const text = await directRes.text();
      const data = extractDapodikJsonText(text);
      if (data && (data as { success?: boolean }).success === false) {
        throw new Error((data as { message?: string }).message || 'Akses ditolak Dapodik');
      }
      // rows bisa berupa SATU objek (bukan array) pada getSekolah — unwrap menanganinya.
      const schoolObj = unwrapDapodikRecord<DapodikRawSekolah>(data) || (data as DapodikRawSekolah);
      return { success: true, data: schoolObj };
    }
  } catch (directErr: any) {
    console.warn('Direct fetch sekolah failed:', directErr.message);
  }

  return {
    success: false,
    error: `Gagal membaca profil sekolah dari Web Service Dapodik di ${host}:${port}`
  };
}


export interface DapodikComparisonResult {
  baru: DapodikRawPesertaDidik[];
  berbeda: {
    dapodik: DapodikRawPesertaDidik;
    existing: Siswa;
    perubahan: string[];
    /** true bila record lokal berstatus arsip (Lulus/Mutasi/...) — sinkron tak boleh mengubah statusnya. */
    arsip: boolean;
  }[];
  sama: {
    dapodik: DapodikRawPesertaDidik;
    existing: Siswa;
    arsip: boolean;
  }[];
  totalDapodik: number;
}

export function mapAgamaDapodik(agamaStr?: string): Agama {
  if (!agamaStr) return 'Islam';
  const norm = agamaStr.toLowerCase();
  if (norm.includes('kristen') || norm.includes('protestan')) return 'Kristen';
  if (norm.includes('katolik') || norm.includes('katholik')) return 'Katholik';
  if (norm.includes('hindu')) return 'Hindu';
  if (norm.includes('buddha') || norm.includes('budha')) return 'Buddha';
  if (norm.includes('khonghucu') || norm.includes('konghucu')) return 'Khonghucu';
  if (norm.includes('kepercayaan')) return 'Kepercayaan';
  if (norm.includes('lainnya') || norm === '99' || norm === 'lain') return 'Lainnya';
  return 'Islam';
}

export function mapTingkatKelas(tingkat?: string | number, namaRombel?: string, jenjang?: JenjangSekolah): TingkatKelas {
  if (tingkat) {
    const tStr = String(tingkat).trim();
    if (jenjang === 'SD' || (!jenjang && ['1', '2', '3', '4', '5', '6'].includes(tStr))) {
      if (['1', '2', '3', '4', '5', '6'].includes(tStr)) return tStr as TingkatKelas;
    }
    if (jenjang === 'SMP' || !jenjang) {
      if (tStr === '7' || tStr === '8' || tStr === '9') return tStr as TingkatKelas;
    }
    // fallback: accept any valid tingkat regardless of jenjang
    if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(tStr)) return tStr as TingkatKelas;
  }
  if (namaRombel) {
    const t = getTingkatDariRombel(namaRombel);
    if (t) {
      if (jenjang === 'SD' && (t === '7' || t === '8' || t === '9')) return '6';
      if (jenjang === 'SMP' && ['1', '2', '3', '4', '5', '6'].includes(t)) return '7';
      return t;
    }
  }
  return jenjang === 'SD' ? '1' : '7';
}

export function convertDapodikToSiswa(
  raw: DapodikRawPesertaDidik,
  existing?: Siswa,
  jenjang: JenjangSekolah = 'SMP',
  // Tahun berjalan sinkronisasi (diisi pemanggil dari profil sekolah).
  // Menentukan tahunAjaran riwayat/P5 siswa BARU hasil tarikan Dapodik.
  tahunAktif: string = '2026/2027'
): Siswa {
  // Baris getPesertaDidik acap TIDAK membawa info rombel (tergantung versi
  // Dapodik) — jangan pernah menimpa rombel lokal dengan tebakan fallback.
  // Fallback `${tingkat}A` hanya untuk siswa BARU yang wajib punya rombel.
  const rawRombel = (raw.nama_rombel || raw.rombongan_belajar || '').trim();
  const hasRombel = rawRombel.length > 0;
  const tingkat = mapTingkatKelas(raw.tingkat_pendidikan_id, hasRombel ? rawRombel : undefined, jenjang);
  const rombel = hasRombel ? rawRombel : `${tingkat}A`;
  const fase: FaseKurikulum = getFaseKurikulum(tingkat);
  const now = new Date().toISOString();
  // Tahun sinkronisasi yang valid; fallback ke periode Dapodik berjalan.
  const tahunSinkron = /^\d{4}\/\d{4}$/.test((tahunAktif || '').trim()) ? tahunAktif.trim() : '2026/2027';
  const tahunMulai = Number(tahunSinkron.slice(0, 4));

  if (existing) {
    return {
      ...existing,
      dapodikId: raw.peserta_didik_id || existing.dapodikId,
      namaLengkap: (raw.nama || existing.namaLengkap).toUpperCase(),
      jenisKelamin: raw.jenis_kelamin || existing.jenisKelamin,
      nisn: raw.nisn || existing.nisn,
      nipd: raw.nipd || existing.nipd,
      nik: raw.nik || existing.nik,
      tempatLahir: raw.tempat_lahir || existing.tempatLahir,
      tanggalLahir: raw.tanggal_lahir || existing.tanggalLahir,
      agama: mapAgamaDapodik(raw.agama_id_str || existing.agama),
      alamat: raw.alamat_jalan || existing.alamat,
      rt: raw.rt || existing.rt,
      rw: raw.rw || existing.rw,
      dusun: raw.nama_dusun || existing.dusun,
      kelurahan: raw.desa_kelurahan || existing.kelurahan,
      kecamatan: raw.kecamatan || existing.kecamatan,
      kodePos: raw.kode_pos || existing.kodePos,
      tinggiBadan: raw.tinggi_badan ? Number(raw.tinggi_badan) : existing.tinggiBadan,
      beratBadan: raw.berat_badan ? Number(raw.berat_badan) : existing.beratBadan,
      ayah: {
        ...existing.ayah,
        nama: raw.nama_ayah || existing.ayah.nama,
        nik: raw.nik_ayah || existing.ayah.nik,
        pekerjaan: raw.pekerjaan_ayah_id_str || existing.ayah.pekerjaan,
        penghasilan: raw.penghasilan_ayah_id_str || existing.ayah.penghasilan,
      },
      ibu: {
        ...existing.ibu,
        nama: raw.nama_ibu || existing.ibu.nama,
        nik: raw.nik_ibu || existing.ibu.nik,
        pekerjaan: raw.pekerjaan_ibu_id_str || existing.ibu.pekerjaan,
        penghasilan: raw.penghasilan_ibu_id_str || existing.ibu.penghasilan,
      },
      asalSdMi: raw.sekolah_asal || existing.asalSdMi,
      // Rombel lokal dipertahankan bila Dapodik tidak membawa info rombel
      // (mencegah seluruh siswa "pindah" ke satu kelas tebakan saat sinkron).
      ...(hasRombel ? { rombelSaatIni: rombel } : {}),
      updatedAt: now,
      lastSyncedWithDapodik: now
    };
  }

  // New Student from Dapodik
  const syncStamp = Date.now();
  const uniqueSuffix = Math.random().toString(36).slice(2, 8);
  return {
    id: `sis-dpk-${raw.peserta_didik_id || `${syncStamp}-${uniqueSuffix}`}`,
    dapodikId: raw.peserta_didik_id,
    namaLengkap: (raw.nama || '').toUpperCase(),
    namaPanggilan: (raw.nama || '').split(' ')[0],
    jenisKelamin: raw.jenis_kelamin || 'L',
    nisn: raw.nisn || '',
    // NIPD wajib unik — jangan pakai pola statis per tingkat yang duplikat.
    nipd: raw.nipd || `${syncStamp.toString().slice(-6)}${tingkat}${uniqueSuffix.slice(0, 3)}`.slice(0, 20),
    nik: raw.nik || '',
    noKk: '',
    noAktaLahir: '',
    tempatLahir: raw.tempat_lahir || 'Kota',
    tanggalLahir: raw.tanggal_lahir || '2011-01-01',
    agama: mapAgamaDapodik(raw.agama_id_str),
    kewarganegaraan: 'WNI',
    anakKe: raw.anak_keberapa || 1,
    jumlahSaudaraKandung: 1,
    jumlahSaudaraTiri: 0,
    jumlahSaudaraAngkat: 0,
    statusDalamKeluarga: 'Anak Kandung',
    bahasaSehariHari: 'Bahasa Indonesia',
    golonganDarah: '-',
    tinggiBadan: raw.tinggi_badan ? Number(raw.tinggi_badan) : 155,
    beratBadan: raw.berat_badan ? Number(raw.berat_badan) : 45,
    riwayatPenyakit: 'Tidak ada riwayat kronis',
    kelainanFisik: 'Tidak ada',
    kebutuhanKhusus: 'Tidak ada',
    alamat: raw.alamat_jalan || '',
    rt: raw.rt || '01',
    rw: raw.rw || '01',
    dusun: raw.nama_dusun || '',
    kelurahan: raw.desa_kelurahan || '',
    kecamatan: raw.kecamatan || '',
    kabupatenKota: '',
    provinsi: '',
    kodePos: raw.kode_pos || '',
    tinggalDengan: 'Orang Tua',
    jarakKeSekolahKm: 1.0,
    transportasiKeSekolah: 'Jalan Kaki',
    ayah: {
      nama: raw.nama_ayah || '',
      nik: raw.nik_ayah || '',
      tahunLahir: '1975',
      pendidikan: 'SMA / sederajat',
      pekerjaan: raw.pekerjaan_ayah_id_str || 'Wiraswasta',
      penghasilan: raw.penghasilan_ayah_id_str || 'Rp. 2,000,000 - Rp. 4,999,999',
      noTelepon: raw.nomor_telepon_seluler || '',
      status: 'Masih Hidup'
    },
    ibu: {
      nama: raw.nama_ibu || '',
      nik: raw.nik_ibu || '',
      tahunLahir: '1978',
      pendidikan: 'SMA / sederajat',
      pekerjaan: raw.pekerjaan_ibu_id_str || 'Ibu Rumah Tangga',
      penghasilan: raw.penghasilan_ibu_id_str || 'Tidak Berpenghasilan',
      noTelepon: '',
      status: 'Masih Hidup'
    },
    asalSdMi: raw.sekolah_asal || '',
    npsnSdMi: '',
    noIjazahSd: '',
    tahunLulusSd: String(tahunMulai),
    lamaBelajarSd: 6,
    tanggalDiterima: `${tahunMulai}-07-15`,
    diterimaDiTingkat: tingkat,
    diterimaDiRombel: rombel,
    rombelSaatIni: rombel,
    jalurMasuk: 'Zonasi',
    // Dapodik tak membawa jenis pendaftaran; siswa sinkron dari tahun berjalan
    // dianggap Siswa Baru (operator dapat mengoreksi menjadi Pindahan).
    jenisPendaftaran: 'Siswa Baru',
    p5Projects: [
      {
        id: newSyncId('p5'),
        tema: 'Gaya Hidup Berkelanjutan',
        judulProjek: 'Projek Pengurangan Jejak Karbon Sekolah',
        fase,
        tingkat: tingkat,
        semester: '1',
        tahunAjaran: tahunSinkron,
        dimensi: {
          berimanBertakwa: 'Sedang Berkembang',
          berkebinekaanGlobal: 'Sedang Berkembang',
          bergotongRoyong: 'Berkembang Sesuai Harapan',
          mandiri: 'Berkembang Sesuai Harapan',
          bernalarKritis: 'Sedang Berkembang',
          kreatif: 'Sedang Berkembang'
        },
        catatanProses: 'Aktif berpartisipasi dalam kegiatan P5 Kurikulum Merdeka.'
      }
    ],
    ekstrakurikuler: [
      {
        id: newSyncId('ek'),
        nama: jenjang === 'SD' ? 'Pramuka Siaga (Wajib)' : 'Pramuka Penggalang (Wajib)',
        keterangan: 'Mengikuti latihan rutin pramuka',
        predikat: 'Baik',
        tingkat: tingkat
      }
    ],
    prestasi: [],
    riwayatSemester: [
      {
        id: newSyncId('rs'),
        semester: '1',
        tingkat: tingkat,
        tahunAjaran: tahunSinkron,
        sakit: 0,
        izin: 0,
        alpa: 0,
        statusKenaikan: 'Belum Ditentukan',
        catatanWaliKelas: 'Siswa baru dari sinkronisasi Web Service Dapodik.'
      }
    ],
    statusSiswa: 'Aktif',
    createdAt: now,
    updatedAt: now,
    lastSyncedWithDapodik: now
  };
}

export function compareDapodikWithExisting(
  dapodikList: DapodikRawPesertaDidik[],
  existingList: Siswa[]
): DapodikComparisonResult {
  const result: DapodikComparisonResult = {
    baru: [],
    berbeda: [],
    sama: [],
    totalDapodik: dapodikList.length
  };

  const existingByDapodikId = new Map<string, Siswa>();
  const existingByNisn = new Map<string, Siswa>();
  const existingByNik = new Map<string, Siswa>();
  const existingByName = new Map<string, Siswa>();

  for (const s of existingList) {
    if (s.dapodikId) existingByDapodikId.set(String(s.dapodikId).trim(), s);
    if (s.nisn) existingByNisn.set(s.nisn.trim(), s);
    if (s.nik) existingByNik.set(s.nik.trim(), s);
    if (s.namaLengkap) existingByName.set(s.namaLengkap.trim().toUpperCase(), s);
  }

  for (const dpk of dapodikList) {
    const dpkId = dpk.peserta_didik_id ? String(dpk.peserta_didik_id).trim() : '';
    const matched =
      (dpkId && existingByDapodikId.get(dpkId)) ||
      (dpk.nisn && existingByNisn.get(dpk.nisn.trim())) ||
      (dpk.nik && existingByNik.get(dpk.nik.trim())) ||
      existingByName.get((dpk.nama || '').trim().toUpperCase());

    if (!matched) {
      result.baru.push(dpk);
    } else {
      const perubahan: string[] = [];
      if (dpk.nama && dpk.nama.trim().toUpperCase() !== matched.namaLengkap.trim().toUpperCase()) {
        perubahan.push(`Nama: "${matched.namaLengkap}" -> "${dpk.nama.trim().toUpperCase()}"`);
      }
      if (dpk.nisn && dpk.nisn.trim() !== matched.nisn.trim()) {
        perubahan.push(`NISN: "${matched.nisn}" -> "${dpk.nisn}"`);
      }
      if (dpk.nipd && dpk.nipd.trim() !== matched.nipd.trim()) {
        perubahan.push(`NIPD: "${matched.nipd}" -> "${dpk.nipd}"`);
      }
      if (dpk.nik && dpk.nik.trim() !== (matched.nik || '').trim()) {
        perubahan.push(`NIK: "${matched.nik || '-'}" -> "${dpk.nik}"`);
      }
      if (dpk.jenis_kelamin && dpk.jenis_kelamin !== matched.jenisKelamin) {
        perubahan.push(`Jenis kelamin: "${matched.jenisKelamin}" -> "${dpk.jenis_kelamin}"`);
      }
      if (dpk.tanggal_lahir && dpk.tanggal_lahir !== matched.tanggalLahir) {
        perubahan.push(`Tanggal lahir: "${matched.tanggalLahir}" -> "${dpk.tanggal_lahir}"`);
      }
      if (dpk.tempat_lahir && dpk.tempat_lahir.trim().toUpperCase() !== (matched.tempatLahir || '').trim().toUpperCase()) {
        perubahan.push(`Tempat lahir: "${matched.tempatLahir}" -> "${dpk.tempat_lahir}"`);
      }
      const dapodikAgama = mapAgamaDapodik(dpk.agama_id_str);
      if (dpk.agama_id_str && dapodikAgama !== matched.agama) {
        perubahan.push(`Agama: "${matched.agama}" -> "${dapodikAgama}"`);
      }
      const newRombel = dpk.nama_rombel || dpk.rombongan_belajar;
      if (newRombel && newRombel !== matched.rombelSaatIni) {
        perubahan.push(`Rombel: "${matched.rombelSaatIni}" -> "${newRombel}"`);
      }

      if (perubahan.length > 0) {
        result.berbeda.push({
          dapodik: dpk,
          existing: matched,
          perubahan,
          arsip: matched.statusSiswa !== 'Aktif',
        });
      } else {
        result.sama.push({
          dapodik: dpk,
          existing: matched,
          arsip: matched.statusSiswa !== 'Aktif',
        });
      }
    }
  }

  return result;
}

// Perform Dapodik sync fetch
export async function fetchDapodikWebservice(
  config: DapodikConfig,
  useSimulation = false
): Promise<{ success: boolean; data: DapodikRawPesertaDidik[]; error?: string }> {
  if (useSimulation) {
    // Artificial 600ms latency to simulate real network/Dapodik response
    await new Promise((r) => setTimeout(r, 600));
    return {
      success: true,
      data: mockDapodikPesertaDidik
    };
  }

  const host = config.ip || 'localhost';
  const port = config.port || 5774;
  const npsn = config.npsn || '';
  const token = config.token || '';

  // Try via backend proxy first to avoid mixed-content / CORS errors
  let proxyErrorMsg = '';
  try {
    const proxyRes = await fetch('/api/dapodik/fetch-peserta-didik', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, npsn, token, semesterId: config.semesterId })
    });

    if (proxyRes.ok) {
      const json: any = await proxyRes.json();
      if (json.success && Array.isArray(json.data)) {
        return { success: true, data: dedupeById<DapodikRawPesertaDidik>(json.data, (d) => d?.peserta_didik_id).clean };
      }
      throw new Error(json.message || 'Gagal mengambil data dari proxy Dapodik');
    }
    proxyErrorMsg = `Proxy HTTP ${proxyRes.status}`;
  } catch (err: any) {
    proxyErrorMsg = err.message || 'Proxy gagal tanpa pesan';
    console.warn('Backend proxy fetch failed, trying direct client fetch...', proxyErrorMsg);
  }

  // Fallback to direct client fetch (useful when running standalone locally or in Chrome with allow-cors)
  try {
    const targetUrl = `http://${host}:${port}/WebService/getPesertaDidik?npsn=${npsn}`;
    const directRes = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(5000)
    });

    if (!directRes.ok) {
      throw new Error(`HTTP Error ${directRes.status}: ${directRes.statusText}`);
    }

    const text = await directRes.text();
    const jsonData: any = extractDapodikJsonText(text);
    if (jsonData && jsonData.success === false) {
      throw new Error(jsonData.message || 'Akses ditolak Dapodik');
    }
    const list = toDapodikList(jsonData);
    return { success: true, data: dedupeById(list, (d) => d?.peserta_didik_id).clean };
  } catch (directErr: any) {
    const detail = [proxyErrorMsg ? `proxy: ${proxyErrorMsg}` : '', directErr.message ? `langsung: ${directErr.message}` : ''].filter(Boolean).join(' | ');
    return {
      success: false,
      data: [],
      error: `Tidak dapat terhubung ke Web Service Dapodik di http://${host}:${port} (${detail}). Pastikan aplikasi Dapodik lokal sedang berjalan, Web Service aktif di port 5774, atau gunakan tombol 'Uji Coba Simulasi Dapodik'.`
    };
  }
}

export async function testDapodikConnection(
  config: DapodikConfig,
  useSimulation = false
): Promise<{ success: boolean; message: string; latencyMs?: number }> {
  const start = performance.now();

  if (useSimulation) {
    await new Promise((r) => setTimeout(r, 450));
    return {
      success: true,
      message: `Berhasil terhubung ke Simulasi Web Service Dapodik SMP (NPSN: ${config.npsn || '20104567'})! Respon OK.`,
      latencyMs: Math.round(performance.now() - start)
    };
  }

  const host = config.ip || 'localhost';
  const port = config.port || 5774;
  const npsn = config.npsn || '';
  const token = config.token || '';

  try {
    const proxyRes = await fetch('/api/dapodik/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, npsn, token })
    });

    const json = await proxyRes.json();
    const latency = Math.round(performance.now() - start);
    if (json.success) {
      return {
        success: true,
        message: json.message || `Terhubung ke Dapodik lokal di ${host}:${port} (NPSN: ${npsn}).`,
        latencyMs: latency
      };
    }
    return {
      success: false,
      message: json.message || `Gagal menghubungi service Dapodik di ${host}:${port}`,
      latencyMs: latency
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Koneksi gagal: ${err.message}. Periksa apakah service Dapodik aktif di http://${host}:${port}`
    };
  }
}

// ---------------- FULL-SYNC: ROMBEL, PTK, PENGGUNA ----------------

function str(v: unknown, fallback = ''): string {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  return s || fallback;
}

/** Buang baris kembar berdasar ID (Dapodik asli sering mengembalikan duplikat).
 *  Baris tanpa ID tetap dipertahankan. Mengembalikan juga jumlah yang dibuang. */
export function dedupeById<T>(list: T[], getId: (item: T) => string): { clean: T[]; removed: number } {
  const seen = new Set<string>();
  const clean: T[] = [];
  let removed = 0;
  for (const item of list || []) {
    const id = str(getId(item));
    if (!id) {
      clean.push(item);
      continue;
    }
    if (seen.has(id)) {
      removed++;
      continue;
    }
    seen.add(id);
    clean.push(item);
  }
  if (removed > 0) {
    console.warn(`[dapodik] ${removed} baris kembar dibuang (ID duplikat).`);
  }
  return { clean, removed };
}

function pick(obj: Record<string, unknown>, keys: string[], fallback = ''): string {
  for (const k of keys) {
    const v = obj[k];
    if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
  }
  return fallback;
}

async function fetchDapodikList<T>(
  config: DapodikConfig,
  methods: ('getRombonganBelajar' | 'getRombel' | 'getPTK' | 'getGtk' | 'getPengguna')[],
  proxyPath: string,
  mockData: T[],
  getId: (item: T) => string,
  useSimulation: boolean,
  latencyMs: number
): Promise<{ success: boolean; data: T[]; error?: string }> {
  if (useSimulation) {
    await new Promise((r) => setTimeout(r, latencyMs));
    return { success: true, data: mockData };
  }

  const host = config.ip || 'localhost';
  const port = config.port || 5774;
  const errors: string[] = [];

  for (const method of methods) {
    // 1. Coba via backend proxy
    try {
      const proxyRes = await fetch(proxyPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port, npsn: config.npsn, token: config.token, wsMethod: method })
      });
      if (proxyRes.ok) {
        const json = await proxyRes.json();
        if (json.success && Array.isArray(json.data)) {
          if (json.data.length === 0) {
            console.warn(`[dapodik] ${method} via proxy mengembalikan 0 baris. Respons mentah dicatat di log server.`);
          }
          return { success: true, data: dedupeById(json.data as T[], getId).clean };
        }
        errors.push(`${method} via proxy: ${json.message || 'respons tidak valid'}`);
      } else {
        errors.push(`${method} via proxy: HTTP ${proxyRes.status}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Backend proxy ${method} failed, trying direct client fetch...`, msg);
      errors.push(`${method} via proxy: ${msg}`);
    }

    // 2. Fallback direct fetch
    try {
      const targetUrl = `http://${host}:${port}/WebService/${method}?npsn=${config.npsn || ''}`;
      const directRes = await fetch(targetUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${config.token || ''}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000)
      });
      if (!directRes.ok) {
        errors.push(`${method} langsung: HTTP ${directRes.status}`);
        continue;
      }
      const text = await directRes.text();
      let jsonData: any;
      try {
        jsonData = extractDapodikJsonText(text);
      } catch (parseErr: unknown) {
        errors.push(`${method} langsung: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
        continue;
      }
      if (jsonData && jsonData.success === false) {
        errors.push(`${method} langsung: ${jsonData.message || 'ditolak Dapodik'}`);
        continue;
      }
      const list = toDapodikList(jsonData);
      console.info(`[dapodik] ${method} langsung OK: ${list.length} baris.`);
      return { success: true, data: dedupeById(list as T[], getId).clean };
    } catch (directErr: unknown) {
      const msg = directErr instanceof Error ? directErr.message : String(directErr);
      errors.push(`${method} langsung: ${msg}`);
    }
  }

  return {
    success: false,
    data: [],
    error: `Gagal membaca ${methods.join('/')} dari http://${host}:${port}. Detail: ${errors.join(' | ')}. Pastikan Web Service Dapodik aktif dan Token benar, atau gunakan 'Uji Coba Simulasi Dapodik'.`
  };
}

export function fetchDapodikRombel(config: DapodikConfig, useSimulation = false) {
  return fetchDapodikList<DapodikRawRombel>(config, ['getRombonganBelajar', 'getRombel'], '/api/dapodik/fetch-rombel', mockDapodikRombel, (r) => r?.rombongan_belajar_id, useSimulation, 500);
}

export function fetchDapodikPtk(config: DapodikConfig, useSimulation = false) {
  // getGtk terbukti ada di Dapodik 2026/2027; getPTK hanya fallback versi lama
  return fetchDapodikList<DapodikRawPtk>(config, ['getGtk', 'getPTK'], '/api/dapodik/fetch-ptk', mockDapodikPtk, (p) => p?.ptk_id || (p as unknown as Record<string, unknown>)?.gtk_id as string, useSimulation, 500);
}

export function fetchDapodikPengguna(config: DapodikConfig, useSimulation = false) {
  return fetchDapodikList<DapodikRawPengguna>(config, ['getPengguna'], '/api/dapodik/fetch-pengguna', mockDapodikPengguna, (p) => p?.pengguna_id, useSimulation, 400);
}

export interface RombelComparison {
  cocok: string[];
  hanyaDapodik: DapodikRawRombel[];
  hanyaLokal: string[];
}

/** Bandingkan rombel resmi Dapodik dengan rombel yang dipakai data lokal. */
export function compareRombelWithExisting(
  dapodikList: DapodikRawRombel[],
  existingSiswa: Siswa[]
): RombelComparison {
  const lokalSet = new Set<string>();
  for (const s of existingSiswa || []) {
    if (s.rombelSaatIni) lokalSet.add(s.rombelSaatIni.trim().toUpperCase());
  }
  const cocok: string[] = [];
  const hanyaDapodik: DapodikRawRombel[] = [];
  const seen = new Set<string>();
  for (const r of dapodikList || []) {
    const nama = str(r.nama).toUpperCase();
    if (!nama || seen.has(nama)) continue;
    seen.add(nama);
    if (lokalSet.has(nama)) cocok.push(str(r.nama));
    else hanyaDapodik.push(r);
  }
  const hanyaLokal = [...lokalSet].filter((l) => !seen.has(l));
  return { cocok, hanyaDapodik, hanyaLokal };
}

/** Turunkan daftar rombel dari data peserta didik (fallback saat
 *  getRombonganBelajar ditolak Dapodik). Dikelompokkan per nama_rombel.
 *  Hasilnya berbentuk DapodikRawRombel agar alur simpan sama persis. */
export function deriveRombelRefsFromPesertaDidik(
  list: DapodikRawPesertaDidik[],
  jenjang: JenjangSekolah = 'SMP'
): DapodikRawRombel[] {
  const groups = new Map<string, DapodikRawPesertaDidik[]>();
  for (const s of list || []) {
    const nama = str(s.nama_rombel || s.rombongan_belajar);
    if (!nama) continue;
    const key = nama.toUpperCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  return [...groups.entries()].map(([key, members]) => {
    const nama = str(members[0].nama_rombel || members[0].rombongan_belajar || key);
    return {
      rombongan_belajar_id: `turunan-${key}`,
      nama,
      tingkat_pendidikan_id: mapTingkatKelas(undefined, nama, jenjang),
      jenis_rombel: 'Turunan data siswa',
      jumlah_anggota: members.length,
      semester_id: ''
    };
  });
}

export function convertDapodikToRombelRef(raw: DapodikRawRombel, tahunAjaran = ''): RombelRef {  const rec = raw as unknown as Record<string, unknown>;
  const nama = str(raw.nama);
  return {
    id: `rombel-${str(raw.rombongan_belajar_id) || nama}`,
    dapodikId: str(raw.rombongan_belajar_id),
    nama,
    tingkat: mapTingkatKelas(raw.tingkat_pendidikan_id, nama),
    jenisRombel: str(raw.jenis_rombel),
    waliKelas: pick(rec, ['nama_wali', 'wali', 'nip_wali']),
    jumlahAnggota: typeof raw.jumlah_anggota === 'number' ? raw.jumlah_anggota : Number(raw.jumlah_anggota) || 0,
    tahunAjaran,
    updatedAt: new Date().toISOString(),
    source: 'dapodik'
  };
}

export function convertDapodikToPtkRef(raw: DapodikRawPtk): PtkRef {
  const rec = raw as unknown as Record<string, unknown>;
  const dapodikId = str(raw.ptk_id) || str(rec.gtk_id);
  return {
    id: `ptk-${dapodikId || str(raw.nip) || str(raw.nama)}`,
    dapodikId,
    nama: str(raw.nama).toUpperCase(),
    nip: str(raw.nip),
    nik: str(raw.nik),
    nuptk: str(rec.nuptk),
    jenisKelamin: raw.jenis_kelamin === 'P' ? 'P' : raw.jenis_kelamin === 'L' ? 'L' : undefined,
    tempatLahir: str(rec.tempat_lahir),
    tanggalLahir: str(rec.tanggal_lahir),
    jenisPtk: pick(rec, ['jenis_ptk_id_str', 'jenis_ptk', 'jabatan']),
    statusKepegawaian: pick(rec, ['status_kepegawaian_id_str', 'status_kepegawaian']),
    mapelAjar: pick(rec, ['mata_pelajaran_ajar', 'mapel', 'bidang_studi']),
    tugasTambahan: pick(rec, ['tugas_tambahan', 'tugas', 'jabatan_tambahan']),
    updatedAt: new Date().toISOString(),
    source: 'dapodik'
  };
}

function randomPassword(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `dpk-${n}`;
}

/** Ubah akun Pengguna Dapodik menjadi akun operator aplikasi.
 *  Mengembalikan user (password sudah di-hash) + password awal plaintext
 *  (tampilkan sekali ke admin, jangan disimpan di mana pun). */
export async function convertPenggunaToAppUser(
  raw: DapodikRawPengguna,
  existingUsers: AppUser[]
): Promise<{ user: AppUser; plainPassword: string; skipped: boolean; reason?: string }> {
  const rec = raw as unknown as Record<string, unknown>;
  const username = pick(rec, ['username', 'user_name', 'nama_pengguna']).toLowerCase().replace(/\s+/g, '_');
  const now = new Date().toISOString();
  if (!username) {
    return {
      user: null as unknown as AppUser,
      plainPassword: '',
      skipped: true,
      reason: 'Username kosong dari Dapodik'
    };
  }
  if ((existingUsers || []).some((u) => u.username.toLowerCase() === username)) {
    return {
      user: null as unknown as AppUser,
      plainPassword: '',
      skipped: true,
      reason: `Username "${username}" sudah ada`
    };
  }
  const plainPassword = randomPassword();
  const user: AppUser = {
    id: `usr-dpk-${str(raw.pengguna_id) || username}`,
    username,
    password: await hashPassword(plainPassword),
    namaLengkap: pick(rec, ['nama', 'nama_lengkap', 'nama_pengguna'], username),
    role: 'operator',
    email: pick(rec, ['email']),
    jabatan: pick(rec, ['peran', 'peran_id_str', 'jabatan'], 'Operator (dari Dapodik)'),
    rombelAkses: [],
    status: 'aktif',
    createdAt: now,
    updatedAt: now
  };
  return { user, plainPassword, skipped: false };
}
