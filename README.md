# SIBISKuMer — Buku Induk Siswa SD & SMP Kurikulum Merdeka

Aplikasi **Buku Induk Siswa** untuk jenjang SD & SMP: pendataan peserta didik,
pencatatan nilai raport Kurikulum Merdeka, riwayat kenaikan kelas multi-tahun,
cetak lembar buku induk standar dinas, rekapitulasi, sinkronisasi Web Service
Dapodik lokal, serta cadangan ke komputer lokal / Google Drive.

Arsitektur **PWA offline-first**: seluruh data tersimpan di browser perangkat
(IndexedDB). Cocok untuk sekolah dengan koneksi internet tidak stabil.
Server Node (`server.ts`) hanya menjadi perantara ke Web Service Dapodik lokal.

## Fitur Utama

- Master data siswa (biodata lengkap, NISN/NIPD, rombel, status)
- Nilai raport per semester + riwayat semester & kenaikan kelas multi-tahun
- Cetak Lembar Buku Induk & Kartu Pelajar standar dinas
- Rekapitulasi & dashboard statistik
- Sinkronisasi Dapodik lokal (host/port/token terkonfigurasi) + mode simulasi
- Multi-pengguna berbasis peran: `administrator` & `operator`
- Cadangan lokal (JSON, opsional **terenkripsi password**) & Google Drive
- PWA: dapat diinstal & berjalan offline
- **Baru:** form siswa wizard 5 langkah (mobile-friendly) • dashboard "Perlu Perhatian" • pencarian global (Ctrl+K) • pratinjau cetak WYSIWYG • mode malam + pengaturan ukuran huruf

## Menjalankan Lokal

```bash
bun install
bun run dev      # http://localhost:3000
```

Skrip lain: `bun run build`, `bun run preview`, `bun run lint` (`tsc --noEmit`).

## Akun Demo

> ⚠️ **Segera ganti password ini** di menu Manajemen Pengguna setelah instalasi.
> Kredensial demo hanya untuk percobaan awal.

| Username | Password | Peran |
|---|---|---|
| `administrator` | `administator` | Administrator (akses penuh) |
| `operator_bukuinduk` | `operator123` | Operator |
| `operator_kesiswaan` | `operator123` | Operator |

## Model Keamanan (jujur)

- Password **tidak pernah** disimpan plaintext — di-hash (SHA-256 + salt acak)
  via WebCrypto. Akun lama otomatis dimigrasi ke hash saat login.
- Login wajib username + password. Tidak ada lagi pintasan yang memajang password.
- Sesi berakhir otomatis setelah **30 menit tanpa aktivitas** (penting untuk
  perangkat bersama di tata usaha).
- File cadangan lokal dapat **dienkripsi dengan password** (PBKDF2 + AES-GCM-256)
  — sangat disarankan untuk file yang disimpan di flashdisk.
- Batasan yang perlu dipahami: aplikasi berjalan penuh di sisi klien (browser),
  sehingga perlindungannya setara dengan keamanan perangkat itu sendiri.
  Untuk data sangat sensitif, gunakan perangkat khusus operator dan kunci layarnya.

## Sinkronisasi Dapodik

1. Pastikan aplikasi Dapodikdasmen berjalan di server lokal (default `localhost:5774`).
2. Buka menu **Sinkronisasi Dapodik** → isi host, port, NPSN, dan Token Web Service.
3. Demi keamanan, proxy server hanya mengizinkan host berikut secara default:
   `localhost`, `127.0.0.1`, `::1`.
   Untuk server Dapodik di IP LAN lain, jalankan server dengan:
   ```
   DAPODIK_ALLOWED_HOSTS="localhost,127.0.0.1,192.168.1.10" bun run dev
   ```

## Regulasi Acuan

- Kurikulum Merdeka — **Permendikdasmen No. 13 Tahun 2025**
- 8 Dimensi **Profil Lulusan** (Permendikdasmen No. 10 Tahun 2025 tentang SKL)
- Format lembar buku induk mengikuti standar dinas pendidikan
