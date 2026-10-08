# 04 — Kontrak API Backend (Express Proxy Dapodik)

> **Status:** Aktif · **Revisi:** 2026-09-15 · **Implementasi:** `server.ts` (port 3000)
> Frontend memanggil endpoint ini via `fetch()` agar bebas CORS dan token terpusat di server.

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

## 2. Endpoint

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
