import { Siswa, DapodikConfig, DapodikRawPesertaDidik, DapodikRawSekolah, SekolahProfile, Agama, TingkatKelas } from '../types';
import { mockDapodikPesertaDidik, mockDapodikSekolah } from '../data/initialData';

export function convertDapodikToSekolahProfile(
  raw: DapodikRawSekolah,
  existing: SekolahProfile
): SekolahProfile {
  const now = new Date().toISOString();
  let semester: '1 (Ganjil)' | '2 (Genap)' = existing.semesterAktif;
  if (raw.semester_id) {
    semester = raw.semester_id.endsWith('1') ? '1 (Ganjil)' : '2 (Genap)';
  }

  return {
    ...existing,
    nama: (raw.nama || existing.nama).toUpperCase(),
    npsn: raw.npsn || existing.npsn,
    nss: raw.nss || existing.nss,
    bentukPendidikan: raw.bentuk_pendidikan_id_str || existing.bentukPendidikan || 'SMP',
    statusSekolah: (raw.status_sekolah?.toLowerCase() === 'swasta' ? 'Swasta' : 'Negeri') as 'Negeri' | 'Swasta',
    alamat: raw.alamat_jalan || existing.alamat,
    desaKelurahan: raw.desa_kelurahan || existing.desaKelurahan,
    kecamatan: raw.kecamatan || existing.kecamatan,
    kabupatenKota: raw.kabupaten_kota || existing.kabupatenKota,
    provinsi: raw.provinsi || existing.provinsi,
    kodePos: raw.kode_pos || existing.kodePos,
    telepon: raw.nomor_telepon || existing.telepon,
    email: raw.email || existing.email,
    website: raw.website || existing.website,
    kepalaSekolah: raw.kepala_sekolah || existing.kepalaSekolah,
    nipKepalaSekolah: raw.nip_kepala_sekolah || existing.nipKepalaSekolah,
    semesterAktif: semester,
    tahunAjaran: raw.tahun_ajaran || existing.tahunAjaran || '2024/2025',
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
        return { success: true, data: json.data };
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
      const data = await directRes.json();
      const schoolObj = Array.isArray(data) ? data[0] : data.rows?.[0] || data.data || data;
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
  }[];
  sama: {
    dapodik: DapodikRawPesertaDidik;
    existing: Siswa;
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
  return 'Islam';
}

export function mapTingkatKelas(tingkat?: string | number, namaRombel?: string): TingkatKelas {
  if (tingkat) {
    const tStr = String(tingkat).trim();
    if (tStr === '7' || tStr === '8' || tStr === '9') return tStr as TingkatKelas;
  }
  if (namaRombel) {
    if (namaRombel.startsWith('7') || namaRombel.toLowerCase().includes('vii')) return '7';
    if (namaRombel.startsWith('8') || namaRombel.toLowerCase().includes('viii')) return '8';
    if (namaRombel.startsWith('9') || namaRombel.toLowerCase().includes('ix')) return '9';
  }
  return '7';
}

export function convertDapodikToSiswa(raw: DapodikRawPesertaDidik, existing?: Siswa): Siswa {
  const tingkat = mapTingkatKelas(raw.tingkat_pendidikan_id, raw.nama_rombel || raw.rombongan_belajar);
  const rombel = raw.nama_rombel || raw.rombongan_belajar || `${tingkat}A`;
  const now = new Date().toISOString();

  if (existing) {
    return {
      ...existing,
      dapodikId: raw.peserta_didik_id || existing.dapodikId,
      namaLengkap: raw.nama || existing.namaLengkap,
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
      rombelSaatIni: rombel,
      updatedAt: now,
      lastSyncedWithDapodik: now
    };
  }

  // New Student from Dapodik
  return {
    id: `sis-dpk-${raw.peserta_didik_id || Date.now()}`,
    dapodikId: raw.peserta_didik_id,
    namaLengkap: (raw.nama || '').toUpperCase(),
    namaPanggilan: (raw.nama || '').split(' ')[0],
    jenisKelamin: raw.jenis_kelamin || 'L',
    nisn: raw.nisn || '',
    nipd: raw.nipd || `24250${tingkat}000`,
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
      pendidikan: 'SMA / Sederajat',
      pekerjaan: raw.pekerjaan_ayah_id_str || 'Wiraswasta',
      penghasilan: raw.penghasilan_ayah_id_str || 'Rp 2.000.000 - Rp 5.000.000',
      noTelepon: raw.nomor_telepon_seluler || '',
      status: 'Masih Hidup'
    },
    ibu: {
      nama: raw.nama_ibu || '',
      nik: raw.nik_ibu || '',
      tahunLahir: '1978',
      pendidikan: 'SMA / Sederajat',
      pekerjaan: raw.pekerjaan_ibu_id_str || 'Ibu Rumah Tangga',
      penghasilan: raw.penghasilan_ibu_id_str || 'Tidak Berpenghasilan',
      noTelepon: '',
      status: 'Masih Hidup'
    },
    asalSdMi: raw.sekolah_asal || '',
    npsnSdMi: '',
    noIjazahSd: '',
    tahunLulusSd: '2024',
    lamaBelajarSd: 6,
    tanggalDiterima: '2024-07-15',
    diterimaDiTingkat: tingkat,
    diterimaDiRombel: rombel,
    rombelSaatIni: rombel,
    jalurMasuk: 'Zonasi',
    p5Projects: [
      {
        id: `p5-${Date.now()}-1`,
        tema: 'Gaya Hidup Berkelanjutan',
        judulProjek: 'Projek Pengurangan Jejak Karbon Sekolah',
        fase: 'Fase D',
        tingkat: tingkat,
        semester: '1',
        tahunAjaran: '2024/2025',
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
        id: `ek-${Date.now()}-1`,
        nama: 'Pramuka Penggalang (Wajib)',
        keterangan: 'Mengikuti latihan rutin pramuka',
        predikat: 'Baik',
        tingkat: tingkat
      }
    ],
    prestasi: [],
    riwayatSemester: [
      {
        id: `rs-${Date.now()}-1`,
        semester: '1',
        tingkat: tingkat,
        tahunAjaran: '2024/2025',
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

  const existingByNisn = new Map<string, Siswa>();
  const existingByNik = new Map<string, Siswa>();
  const existingByName = new Map<string, Siswa>();

  for (const s of existingList) {
    if (s.nisn) existingByNisn.set(s.nisn.trim(), s);
    if (s.nik) existingByNik.set(s.nik.trim(), s);
    existingByName.set(s.namaLengkap.trim().toUpperCase(), s);
  }

  for (const dpk of dapodikList) {
    const matched =
      (dpk.nisn && existingByNisn.get(dpk.nisn.trim())) ||
      (dpk.nik && existingByNik.get(dpk.nik.trim())) ||
      existingByName.get((dpk.nama || '').trim().toUpperCase());

    if (!matched) {
      result.baru.push(dpk);
    } else {
      const perubahan: string[] = [];
      if (dpk.nama && dpk.nama.trim().toUpperCase() !== matched.namaLengkap.trim().toUpperCase()) {
        perubahan.push(`Nama: "${matched.namaLengkap}" -> "${dpk.nama}"`);
      }
      if (dpk.nisn && dpk.nisn.trim() !== matched.nisn.trim()) {
        perubahan.push(`NISN: "${matched.nisn}" -> "${dpk.nisn}"`);
      }
      if (dpk.nipd && dpk.nipd.trim() !== matched.nipd.trim()) {
        perubahan.push(`NIPD: "${matched.nipd}" -> "${dpk.nipd}"`);
      }
      const newRombel = dpk.nama_rombel || dpk.rombongan_belajar;
      if (newRombel && newRombel !== matched.rombelSaatIni) {
        perubahan.push(`Rombel: "${matched.rombelSaatIni}" -> "${newRombel}"`);
      }

      if (perubahan.length > 0) {
        result.berbeda.push({
          dapodik: dpk,
          existing: matched,
          perubahan
        });
      } else {
        result.sama.push({
          dapodik: dpk,
          existing: matched
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
  try {
    const proxyRes = await fetch('/api/dapodik/fetch-peserta-didik', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, npsn, token, semesterId: config.semesterId })
    });

    if (proxyRes.ok) {
      const json = await proxyRes.json();
      if (json.success && Array.isArray(json.data)) {
        return { success: true, data: json.data };
      }
      throw new Error(json.message || 'Gagal mengambil data dari proxy Dapodik');
    }
  } catch (err: any) {
    console.warn('Backend proxy fetch failed, trying direct client fetch...', err.message);
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

    const data = await directRes.json();
    const list = Array.isArray(data) ? data : data.rows || data.results || data.data || [];
    return { success: true, data: list };
  } catch (directErr: any) {
    return {
      success: false,
      data: [],
      error: `Tidak dapat terhubung ke Web Service Dapodik di http://${host}:${port} (${directErr.message}). Pastikan aplikasi Dapodik lokal sedang berjalan, Web Service aktif di port 5774, atau gunakan tombol 'Uji Coba Simulasi Dapodik'.`
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
