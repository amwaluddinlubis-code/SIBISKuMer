# 04 — Kontrak API Backend

> **Status:** Aktif · **Revisi:** 2026-10-25 · **Implementasi:** `server.ts` (port 3000)
> Dua keluarga API: **§1A API data SQLite `/api/v1`** (lapisan data aplikasi pada
> mode server, Fase S1) dan **§1–§5 proxy Dapodik** (frontend memanggilnya via
> `fetch()` agar bebas CORS dan token terpusat di server).

## 1. Konvensi Umum

- Basis URL dev/prod: sama dengan origin aplikasi (mis. `http://localhost:3000`).
- Target upstream: `http://{host}:{port}/WebService/{method}?npsn={npsn}[&semester_id={semesterId}]`, header
  `Authorization: Bearer {token}`, `Accept: application/json`. `semesterId` opsional —
  ditambahkan via `withSemester()` bila diisi (didukung semua endpoint POST).
- Sukses: `{ success: true, data, count? }`. Gagal proxy: HTTP 500 +
  `{ success: false, message }`; gagal tes koneksi: HTTP 200 + `{ success: false, message }`.
- Parsing toleran (`extractDapodikJson`): mencari awal `{`/`[` pertama karena Dapodik kerap
  mengawali respons dengan teks `HTTP/1.0 403 ...`. `success === false` dari Dapodik
  diubah menjadi pesan + saran (cek token/IP, restart Dapodik). Retry 1x untuk penolakan
  dengan jeda ±1,2 dtk; timeout 3,5–6 dtk per endpoint. Normalisasi bentuk:
  `asList` (array/`rows`/`results`/`result`/`data`/objek tunggal) dan `asSingleObject`
  (khusus `getSekolah`, termasuk kasus `{rows:{...}}` satu objek). Respons list kosong
  dicatat `console.warn`, bukan error.

## 1A. API Data SQLite — `/api/v1` (`server/api.ts`, `server/auth.ts`)

**Konvensi.** Envelope seragam: sukses `{ ok: true, data }`, gagal
`{ ok: false, pesan }` dengan status HTTP yang sesuai. Parser JSON rute ini
25 MB (di atas parser global). Klien resmi: `src/utils/dataApi.ts`.

**Auth & sesi.** `POST /auth/login` `{ sekolahId?, username, password }` →
menanam cookie `sibis_sesi` (HttpOnly, SameSite=Lax, 12 jam; token acak
32-byte hex di tabel `sesi` registry); header `Authorization: Bearer <token>`
juga diterima. Login memakai verifikasi password yang sama dengan klien
(PBKDF2; warisan plaintext diterima sekali lalu di-hash ulang transparan).
5x gagal per (sekolah, username) → kunci 15 menit (HTTP 423). Akun nonaktif
ditolak; pesan gagal generik (anti-enumerasi). Semua endpoint selain
`GET /health`, `GET/POST /sekolah`, dan `POST /auth/login` mensyaratkan sesi
(401 tanpa sesi sah). Respons tidak pernah memuat field password
(`userPublik`). `benihAwal` pada respons login/sesi = basis data masih benih
awal (lihat `03-model-data.md` §2b).

**Login Authenticator (2FA TOTP, RFC 6238).** Bila akun mengaktifkan
Authenticator, `POST /auth/login` dengan kata sandi benar TIDAK menerbitkan
sesi: respons `{ perluTotp: true }` + cookie tertunda `sibis_totp` (HttpOnly,
5 menit; keadaan tertunda hanya di memori server). Klien menukar cookie itu +
kode di `POST /auth/verifikasi-totp` — kode TOTP 6 digit (HMAC-SHA1, jendela
30 detik, toleransi ±1) atau satu **kode pemulihan** sekali pakai (10 buah
diterbitkan saat aktivasi; server hanya menyimpan hash SHA-256). 5x kode
salah membatalkan keadaan tertunda dan tercatat ke kunci login akun. Secret
per pengguna tersimpan pada catatan pengguna (`totp`) dan TIDAK pernah
dikirim ke klien (`userPublik` hanya mengekspos penanda `totpAktif`);
edit pengguna oleh admin mempertahankan keadaan `totp` apa adanya.
Pendaftaran dari menu akun → "Login Authenticator (2FA)": `totp/mulai`
mengembalikan secret base32 + URL `otpauth://` untuk entri manual di
aplikasi authenticator, `totp/aktifkan` memverifikasi satu kode sebelum
mengaktifkan. Penonaktifan wajib kode sah; reset oleh admin (HP hilang)
lewat `POST /data/users/:id/reset-totp`. Modul inti: `server/totp.ts`.

| Method & Path | Sesi/Peran | Keterangan |
|---------------|-----------|------------|
| `GET /health` | publik | `{ status, skema, sekolah }` |
| `GET /sekolah` | publik | Daftar sekolah terdaftar di registry |
| `POST /sekolah` | admin | Daftarkan sekolah baru |
| `POST /auth/login` | publik | Buat sesi (cookie) |
| `POST /auth/logout` | sesi | Hapus sesi |
| `GET /auth/sesi` | sesi | Profil sesi + `benihAwal` (+ profil penyamar bila sedang menyamar) |
| `POST /auth/ganti-sandi` | sesi | Ganti sandi sendiri (min. 8 karakter; menghapus `mustChangePassword`) |
| `POST /auth/verifikasi-totp` | cookie tertunda | Langkah kedua login Authenticator: kode TOTP/kode pemulihan → sesi penuh |
| `POST /auth/totp/mulai` | sesi | Mulai pendaftaran Authenticator (secret base32 + URL otpauth) |
| `POST /auth/totp/aktifkan` | sesi | Aktifkan dengan satu kode; menerbitkan 10 kode pemulihan (sekali tampil) |
| `POST /auth/totp/nonaktifkan` | sesi | Nonaktifkan dengan kode sah (TOTP/kode pemulihan) |
| `POST /data/users/:id/reset-totp` | sesi; admin | Reset Authenticator pengguna (kasus HP hilang) |
| `POST /auth/impersonate` / `POST /auth/impersonate/berhenti` | sesi (penyamar tercatat) | Sesi menyamar menyimpan `impersonator_id` + `token_induk`; target admin/diri sendiri/nonaktif ditolak |
| `GET/POST /data/siswa`, `GET/PUT/DELETE /data/siswa/:id`, `POST /data/siswa/bulk` | sesi | Baca tersaring `rombelAkses` sesi (siswa tanpa rombel tetap terlihat); tulis memeriksa rombel lama & baru; bulk = impor massal |
| `GET /data/koleksi/:entitas`, `PUT/DELETE /data/koleksi/:entitas/:id`, `POST /data/koleksi/:entitas/bulk` | sesi | Entitas: `rombel`, `ptk`, `peta_kelas`, `tutup_tahun`, `sync_logs`, `audit_logs`; bulk mode `ganti` = ganti total koleksi |
| `GET/PUT /data/profil` | sesi; tulis admin/operator | Profil sekolah |
| `GET/PUT /data/config/:kunci` | sesi; tulis admin/operator | Config (mis. `dapodik`) |
| `GET/POST /data/users`, `PUT/DELETE /data/users/:id` | sesi; tulis khusus admin | DELETE menjaga akun sendiri & admin aktif terakhir |
| `GET/POST /data/snapshot`, `POST /data/snapshot/:id/pulihkan`, `DELETE /data/snapshot/:id` | sesi; pulih/hapus hati-hati | Snapshot di dalam basis data (termasuk `pengaman-impor-*`) |
| `GET /snapshot/berkas`, `POST /snapshot/berkas`, `POST /snapshot/berkas/:nama/pulihkan`, `DELETE /snapshot/berkas/:nama`, `GET /snapshot/berkas/:nama/unduh` | baca: sesi; tulis/unduh: admin | Snapshot berkas `.db` (VACUUM INTO); pulih membuat pengaman `pra-pulih` + membatalkan semua sesi sekolah |
| `GET /backup/ekspor` | sesi | BackupPayload utuh (token Dapodik dikosongkan; blok integritas ditambahkan) |
| `POST /backup/impor` | admin | Impor ganti-total tervalidasi (struktur + kompatibilitas `BACKUP_APP_NAME`/versi + checksum; payload tanpa checksum diterima); snapshot pengaman `pengaman-impor-<ts>` dibuat sebelum menimpa; menandai `data_nyata` |
| `GET /backup/unduh-db` | admin | Unduh berkas `.db` konsisten sekolah aktif sesi |

**Penanda data nyata.** Setiap mutasi berhasil ke `/data` atau `/snapshot`
menyalakan penanda `data_nyata` (status benih berakhir) — kecuali entri
`audit_logs`, karena aplikasi menulis audit pada setiap login.

## 2. Endpoint (Proxy Dapodik)

| Method & Path | Body | Upstream | Keterangan |
|---------------|------|----------|------------|
| `POST /api/dapodik/fetch-sekolah` | `{ host?, port?, npsn?, token?, semesterId? }` | `getSekolah` (timeout 4 dtk) | Objek sekolah tunggal via `asSingleObject` |
| `POST /api/dapodik/test-connection` | sama (tanpa `semesterId`) | `getSekolah` (3,5 dtk) | Selalu HTTP 200; `message` berisi hasil/latensi |
| `POST /api/dapodik/fetch-peserta-didik` | sama + `semesterId?` | `getPesertaDidik` (6 dtk) | `{ data[], count }` via `asList` |
| `POST /api/dapodik/fetch-rombel` | sama + `wsMethod?`, `semesterId?` | default `getRombonganBelajar` (6 dtk) | `wsMethod` memungkinkan alias |
| `POST /api/dapodik/fetch-ptk` | sama + `wsMethod?`, `semesterId?` | default `getGtk` (Dapodik 2026/2027, 6 dtk); fallback `getPTK` | — |
| `POST /api/dapodik/fetch-pengguna` | sama + `wsMethod?`, `semesterId?` | default `getPengguna` (6 dtk) | — |
| `GET /api/dapodik/mock-sekolah` | — | — | Emulator profil sekolah |
| `GET /api/dapodik/mock-peserta-didik` | — | — | Emulator + `count` + `note` |
| `GET /api/dapodik/mock-rombel` | — | — | Emulator rombel |
| `GET /api/dapodik/mock-ptk` | — | — | Emulator PTK |
| `GET /api/dapodik/mock-pengguna` | — | — | Emulator pengguna |
| `GET /api/health` | — | — | `{ status:'ok', service:'Buku Induk Siswa Kurikulum Merdeka' }` |

Nilai default bila body kosong: `host='localhost'`, `port=5774`.

> Catatan frontend: `src/utils/dapodikSync.ts` memuat pasangan client
> (`testDapodikConnection`, `fetchDapodikWebservice/Sekolah/Rombel/Ptk/Pengguna`,
> `extractDapodikJsonText`, `unwrapDapodikRecord`, `toDapodikList`) untuk mode
> direct-fetch, tetapi jalur utama aplikasi memakai proksi Express di atas.

## 3. Contoh

```http
POST /api/dapodik/fetch-peserta-didik
Content-Type: application/json

{ "host": "localhost", "port": 5774, "npsn": "20104567", "token": "ws_..." }
```

```json
{ "success": true, "count": 5, "data": [ { "peserta_didik_id": "dpk-...", "nama": "...", "nisn": "..." } ] }
```

## 4. Metode Web Service Dapodik (upstream, di luar kendali repo ini)

`getSekolah`, `getPesertaDidik`, `getRombonganBelajar`, `getGtk` (alias lama `getPTK`),
`getPengguna` — semua dengan query `?npsn=`. Skema field bervariasi antar versi Dapodik;
konversi ada di `src/utils/dapodikSync.ts` (`convertDapodikToSiswa`, `...SekolahProfile`,
`...RombelRef`, `...PtkRef`, `convertPenggunaToAppUser`, `mapTingkatKelas`,
`compareDapodikWithExisting`, `deriveRombelRefsFromPesertaDidik`).

## 5. Penyajian

- Dev (`NODE_ENV !== 'production'`): middleware Vite; Produksi: statis `dist/` + fallback
  `index.html` (SPA). Mulai prod: `npm run build && npm start`.
- Folder statis produksi dicari berurutan: folder berkas server terbundel
  (`dist/server.cjs` tinggal di dalam `dist/`), `<cwd>/dist` sebagai cadangan —
  TIDAK bergantung pada direktori kerja proses (aplikasi desktop dapat
  dijalankan dari folder mana pun; perbaikan gerbang S5, 2026-10-25).
