// Util format tampilan bersama (Fase 2 QA UI/UX): tanggal Indonesia,
// sensor data sensitif, dan alamat satu sumber. Murni & dapat diuji.

/** "2010-04-15" → "15 Apr 2010". Kosong → "-"; tak valid → apa adanya. */
export function formatTanggalIndo(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "2010-04-15" → "15 April 2010" (bulan penuh, untuk detail/cetak). */
export function formatTanggalPanjang(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Sensor nilai sensitif: tampilkan hanya `tampil` karakter terakhir.
 * "3201234567890001" → "••••••••••••0001". Nilai pendek (< 8) disensor penuh
 * selain 2 karakter terakhir agar tidak bocor lewat potongan.
 */
export function sensorNilai(nilai?: string | null, tampil = 4): string {
  const v = (nilai || '').trim();
  if (!v) return '-';
  if (v.length <= tampil + 2) {
    return '•'.repeat(Math.max(2, v.length - 2)) + v.slice(-2);
  }
  return '•'.repeat(v.length - tampil) + v.slice(-tampil);
}

/** Pola RT/RW yang kerap menempel di ujung string alamat (termasuk bentuk rapat "RT03RW05"). */
const POLA_RT_RW_EKOR =
  /[\s,]*RT\.?\s*\d{1,3}\s*\/?\s*RW\.?\s*\d{1,3}\s*$/i;

/** Buang ekor RT/RW dari string alamat bebas agar tidak dobel saat digabung field terstruktur. */
export function alamatTanpaRtRw(alamat?: string | null): string {
  let a = (alamat || '').trim();
  // Ulangi: sebagian alamat hasil sinkron membawa dua ekor ("... RT 03 RW 05RT03RW05").
  for (let i = 0; i < 3 && POLA_RT_RW_EKOR.test(a); i++) {
    a = a.replace(POLA_RT_RW_EKOR, '').trim();
  }
  return a.replace(/[\s,]+$/, '');
}

/**
 * Alamat lengkap SATU SUMBER: alamat (tanpa ekor RT/RW) + RT/RW terstruktur
 * + kelurahan/kecamatan. Dipakai semua pratinjau agar tidak ada duplikasi.
 */
export function formatAlamatLengkap(s: {
  alamat?: string;
  rt?: string;
  rw?: string;
  kelurahan?: string;
  kecamatan?: string;
}): string {
  const bagian: string[] = [];
  const dasar = alamatTanpaRtRw(s.alamat);
  if (dasar) bagian.push(dasar);
  const rt = (s.rt || '').trim();
  const rw = (s.rw || '').trim();
  if (rt || rw) bagian.push(`RT ${rt || '-'} RW ${rw || '-'}`);
  if ((s.kelurahan || '').trim()) bagian.push(`Kel. ${s.kelurahan!.trim()}`);
  if ((s.kecamatan || '').trim()) bagian.push(`Kec. ${s.kecamatan!.trim()}`);
  return bagian.length ? bagian.join(', ') : '-';
}
