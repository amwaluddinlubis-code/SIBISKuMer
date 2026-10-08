import { SekolahProfile, KopSurat } from '../types';

/** Kop bawaan: seluruh teks otomatis dari profil, logo generik.
 *  Hasil akhir menyerupai kop dinas standar (logo kiri saja + judul hitam tegas)
 *  cukup dengan mengunggah logo — tanpa mengetik baris teks. */
export function defaultKopSurat(): KopSurat {
  return {
    baris1: '',
    baris2: '',
    otoritas: 'kabupaten',
    fontJudul: 'serif',
    tampilBaris1: true,
    tampilBaris2: true,
    logoKiriUrl: '',
    tampilLogoKiri: true,
    logoKananMode: 'sembunyi',
    logoKananUrl: '',
    tampilAlamat: true,
    tampilKontak: true,
    tampilWebsite: false,
    garis: 'ganda',
    ukuranNama: 'besar',
  };
}

/** Gabungkan kop tersimpan dengan bawaan (profil lama tanpa kop tetap valid). */
export function getKop(sekolah: SekolahProfile): KopSurat {
  return { ...defaultKopSurat(), ...(sekolah.kop || {}) };
}

export interface KopResolved {
  kop: KopSurat;
  baris1: string;
  baris2: string;
  alamat: string;
  kontak: string;
}

/** Teks kop efektif: custom bila diisi, selain itu dirakit dari profil. */
export function resolveKop(sekolah: SekolahProfile): KopResolved {
  const kop = getKop(sekolah);
  const prov = (sekolah.provinsi || '').trim();
  const kabBersih = (sekolah.kabupatenKota || '').trim().replace(/^(kab\.?|kota)\s+/i, '');

  let baris1Otomatis: string;
  if (kop.otoritas === 'provinsi') {
    baris1Otomatis = `PEMERINTAH ${prov ? prov.toUpperCase() : 'DAERAH'}`;
  } else if (kop.otoritas === 'kota') {
    baris1Otomatis = `PEMERINTAH KOTA${kabBersih ? ` ${kabBersih.toUpperCase()}` : ''}`;
  } else {
    baris1Otomatis = `PEMERINTAH KABUPATEN${kabBersih ? ` ${kabBersih.toUpperCase()}` : ''}`;
  }
  const baris1 = (kop.baris1 || '').trim() || baris1Otomatis;
  const baris2 =
    (kop.baris2 || '').trim() ||
    `DINAS PENDIDIKAN DAN KEBUDAYAAN${kop.otoritas === 'provinsi' ? '' : kabBersih ? ` ${kabBersih.toUpperCase()}` : ''}`;

  const alamatWilayah = [
    sekolah.kecamatan ? `Kec. ${sekolah.kecamatan.trim()}` : '',
    kabBersih ? `Kab. ${kabBersih}` : (sekolah.kabupatenKota || '').trim(),
    prov ? `Prov. ${prov}` : '',
  ].filter((p) => p && p.trim());
  const alamatParts = [
    (sekolah.alamat || '').trim(),
    (sekolah.desaKelurahan || '').trim(),
    ...alamatWilayah,
  ].filter((p) => p && p.trim());
  const alamat = alamatParts.length > 0 ? `Alamat : ${alamatParts.join(', ')}` : '';

  const kontakParts = [
    sekolah.npsn ? `NPSN : ${sekolah.npsn.trim()}` : '',
    sekolah.email ? `Email : ${sekolah.email.trim()}` : '',
    sekolah.telepon ? `Telp : ${sekolah.telepon.trim()}` : '',
    sekolah.nss ? `NSS : ${sekolah.nss.trim()}` : '',
    sekolah.kodePos ? `Kode Pos. ${sekolah.kodePos.trim()}` : '',
  ].filter(Boolean);
  if (kop.tampilWebsite && sekolah.website) kontakParts.push(`Website : ${sekolah.website.trim()}`);
  const kontak = kontakParts.join('  ');

  return { kop, baris1, baris2, alamat, kontak };
}

/** Validasi ringan form kop (dipakai PengaturanSekolahView sebelum simpan). */
export function validateKop(kop: KopSurat): string[] {
  const errs: string[] = [];
  if ((kop.baris1 || '').length > 150) errs.push('Baris 1 kop maksimal 150 karakter.');
  if ((kop.baris2 || '').length > 150) errs.push('Baris 2 kop maksimal 150 karakter.');
  if (kop.logoKananMode === 'gambar' && !(kop.logoKananUrl || '').trim())
    errs.push('Logo kanan mode gambar wajib diunggah.');
  return errs;
}
