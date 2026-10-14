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
- Generator Dokumen Administrasi: surat keterangan siswa aktif, surat pindah/mutasi keluar, surat panggilan orang tua/wali, daftar siswa per rombel (penomoran dari aturan sekolah, pratinjau sebelum cetak/ekspor Word/Excel)
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
   DAPODIK_ALLOW_HOSTS="localhost,127.0.0.1,192.168.1.10" bun run dev
   ```
   Nama variabel yang berlaku adalah `DAPODIK_ALLOW_HOSTS`. README lama
   menyebut `DAPODIK_ALLOWED_HOSTS` — nama itu tidak pernah dibaca aplikasi,
   tetapi tetap didukung sebagai alias lama (deprecated) agar deployment yang
   mengikuti README lama tidak tiba-tiba kehilangan allowlist. Bila keduanya
   diatur dengan nilai berbeda, yang dipakai adalah `DAPODIK_ALLOW_HOSTS`.
   Server mencatat peringatan saat alias dipakai. Konfigurasi dibaca sekali
   saat startup; perubahan env butuh restart server. Detail lengkap:
   `docs/05-operasional.md` §7a–7b.

### Secret proxy Dapodik

Semua request proxy `/api/dapodik/*` wajib membawa header
`x-dapodik-secret` yang nilainya sama dengan `DAPODIK_PROXY_SECRET` di
env server. Tanpa secret ini:

- secret belum diatur di server → request ditolak **503** (proxy
  dinonaktifkan);
- header tidak ada atau tidak cocok → ditolak **403**;
- port di luar 1–65535 → ditolak **400**.

Cara mengatur (server): set `DAPODIK_PROXY_SECRET` ke nilai acak yang kuat
(minimal 32 karakter, mis. hasil `openssl rand -hex 32`), dan samakan
`VITE_DAPODIK_PROXY_SECRET` di env frontend lalu rebuild frontend. Contoh
placeholder ada di `.env.example` — jangan pernah commit nilai sungguhan.

Rotasi secret: (1) set nilai baru di env server, (2) samakan
`VITE_DAPODIK_PROXY_SECRET` di frontend dan rebuild, (3) restart server.
Sejak restart, secret lama langsung tidak berlaku.

Catatan jujur: nilai secret tidak pernah ditulis ke log, respons error,
maupun repository. Namun karena browser harus mengirim secret ini,
salinan frontend-nya (`VITE_DAPODIK_PROXY_SECRET`) secara teknis tertanam
di client bundle — jadi perlakukan secret ini sebagai rahasia bersama
khusus LAN, bukan kredensial kuat: biarkan server bind ke `127.0.0.1`
(bawaan), jangan pakai nilai yang sama untuk keperluan lain, dan rotasi
bila bundle pernah terekspos ke pihak yang tidak dipercaya.

## Regulasi Acuan

- Kurikulum Merdeka — **Permendikdasmen No. 13 Tahun 2025**
- 8 Dimensi **Profil Lulusan** (Permendikdasmen No. 10 Tahun 2025 tentang SKL)
- Format lembar buku induk mengikuti standar dinas pendidikan
