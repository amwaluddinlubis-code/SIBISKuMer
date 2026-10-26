// Kamus label manusiawi untuk Log Audit (Fase 2 QA UI/UX butir 8):
// kode aksi & entitas mentah (mis. "ganti_password_bawaan") tidak boleh
// tampil mentah ke pengguna. Terpisah dari komponen agar dapat diuji.
import type { AuditAksi } from '../types';

export const AKSI_LABEL: Record<AuditAksi, string> = {
  login: 'Masuk',
  logout: 'Keluar',
  sesi_pindah: 'Pindah sesi',
  login_gagal: 'Gagal masuk',
  login_terkunci: 'Upaya saat terkunci',
  akun_buat: 'Akun dibuat',
  akun_ubah: 'Akun diubah',
  akun_hapus: 'Akun dihapus',
  password_ubah: 'Password diganti',
  password_reset: 'Password di-reset',
  ganti_password_bawaan: 'Ganti kata sandi bawaan',
  impersonate_mulai: 'Impersonate mulai',
  impersonate_selesai: 'Impersonate selesai',
  siswa_tambah: 'Siswa ditambah',
  siswa_ubah: 'Siswa diubah',
  siswa_hapus: 'Siswa dihapus',
  data_sensitif_dilihat: 'Data sensitif dilihat',
  mutasi_masuk: 'Mutasi masuk',
  mutasi_keluar: 'Mutasi keluar',
  mutasi_status: 'Perubahan status siswa',
  mutasi_batal: 'Mutasi dibatalkan',
  tutup_tahun: 'Tutup tahun',
  buka_tahun: 'Buka kunci tahun',
  sinkron_terapkan: 'Sinkron diterapkan',
  impor_siswa: 'Impor siswa (Excel/CSV)',
  backup_buat: 'Backup dibuat',
  backup_pulihkan: 'Backup dipulihkan',
  backup_reset: 'Reset database',
  laporan_ekspor: 'Laporan diekspor',
  cloud_unggah: 'Cloud diunggah',
  cloud_unduh: 'Cloud diunduh',
  cloud_sinkron: 'Sinkron cloud',
  rombel_ubah: 'Rombel diubah',
  dokumen_ekspor: 'Dokumen diekspor',
  pengaturan_ubah: 'Pengaturan diubah',
  gtk_ubah: 'GTK diubah',
  tenggat_buat: 'Tenggat dibuat',
  tenggat_ubah: 'Tenggat diubah',
  tenggat_selesai: 'Tenggat diselesaikan',
  tenggat_hapus: 'Tenggat dihapus',
  pengingat_kirim: 'Pengingat disampaikan',
  ai_gunakan: 'Asisten AI digunakan',
};

/** Label aksi; fallback merapikan snake_case menjadi kalimat terbaca. */
export function labelAksi(aksi: string): string {
  return (AKSI_LABEL as Record<string, string>)[aksi] || aksi.replace(/_/g, ' ');
}

export const ENTITAS_LABEL: Record<string, string> = {
  sesi: 'Sesi',
  akun: 'Akun',
  siswa: 'Siswa',
  tahun: 'Tahun ajaran',
  sinkron: 'Sinkronisasi',
  backup: 'Backup',
  laporan: 'Laporan',
  rombel: 'Rombel',
  dokumen: 'Dokumen',
  pengaturan: 'Pengaturan',
  gtk: 'GTK',
};

export function labelEntitas(entitas: string): string {
  return ENTITAS_LABEL[entitas] || entitas;
}
