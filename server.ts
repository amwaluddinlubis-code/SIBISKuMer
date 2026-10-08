import express from 'express';
import path from 'path';
import crypto from 'crypto';
// Catatan: 'vite' diimpor dinamis hanya saat development agar bundel produksi
// (dist/server.cjs, dipakai aplikasi desktop Electron) tidak butuh vite runtime.
import { mockDapodikPesertaDidik, mockDapodikSekolah, mockDapodikRombel, mockDapodikPtk, mockDapodikPengguna } from './src/data/initialData';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // Dapodik Web Service Proxy Routes
  // CATATAN: Dapodik sering membungkus error sebagai teks "HTTP/1.0 403 ..."
  // diikuti JSON, dengan outer HTTP 200 — response.json() langsung akan crash.
  // Helper ini mengekstrak JSON-nya dan mengubah error Dapodik jadi pesan bersih.
  function extractDapodikJson(text: string): any {
    const iObj = text.indexOf('{');
    const iArr = text.indexOf('[');
    let start = -1;
    if (iObj === -1) start = iArr;
    else if (iArr === -1) start = iObj;
    else start = Math.min(iObj, iArr);
    if (start === -1) {
      throw new Error(`Respons Dapodik bukan JSON: ${text.slice(0, 120)}`);
    }
    return JSON.parse(text.slice(start));
  }

  function dapodikDeniedHint(message: string): string {
    return `Dapodik menolak: ${message}. Pastikan entri aplikasi & Token di Dapodik → Pengaturan → Web Service sudah benar (IP sesuai), lalu RESTART aplikasi Dapodik dan coba lagi — Dapodik kadang butuh restart agar token baru aktif.`;
  }

  async function fetchDapodikRaw(targetUrl: string, token: string, timeoutMs: number): Promise<any> {
    // S4 (audit token): ke Dapodik HANYA dikirim header Authorization yang
    // dibangun dari field `token` eksplisit di body — header mentah peminta
    // (req.headers) TIDAK PERNAH diteruskan ke Dapodik.
    // Coba 2x: Dapodik desktop kadang menolak request pertama / kewalahan request beruntun
    let lastErr: any = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(targetUrl, {
          headers: {
            Authorization: `Bearer ${token || ''}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        const text = await response.text();
        let parsed: any;
        try {
          parsed = extractDapodikJson(text);
        } catch {
          throw new Error(
            `Dapodik merespon HTTP ${response.status} tanpa JSON (${text.slice(0, 120)}). Kemungkinan method tidak dikenal versi Dapodik ini.`
          );
        }
        if (parsed && parsed.success === false) {
          throw new Error(dapodikDeniedHint(parsed.message || 'Akses ditolak Dapodik'));
        }
        return parsed;
      } catch (err: any) {
        lastErr = err;
        // Hanya ulangi untuk penolakan Dapodik (bukan network/timeout)
        if (!/menolak|terdaftar/i.test(err.message || '') || attempt === 2) break;
        await new Promise((r) => setTimeout(r, 1200));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastErr;
  }

  function asList(data: any): any[] {
    if (Array.isArray(data)) return data;
    const nested = data?.rows || data?.results || data?.result || data?.data;
    if (Array.isArray(nested)) return nested;
    // Dapodik kadang mengembalikan satu objek (bukan array) — bungkus jadi array
    if (nested && typeof nested === 'object') return [nested];
    if (data && typeof data === 'object' && (data.peserta_didik_id || data.rombongan_belajar_id || data.ptk_id || data.gtk_id || data.pengguna_id || data.nama)) {
      return [data];
    }
    return [];
  }

  /** Ambil objek sekolah tunggal dari berbagai bentuk respons Dapodik
   *  ({...}, [{...}], {rows:[{...}]}, {rows:{...}} SATU objek (kasus getSekolah),
   *  {data:[{...}]}, {data:{...}}). */
  function asSingleObject(data: any): any {
    if (!data) return data;
    if (Array.isArray(data)) return data[0];
    if (typeof data !== 'object') return data;
    for (const key of ['rows', 'results', 'result', 'data']) {
      const v = data[key];
      if (Array.isArray(v) && v.length > 0) return v[0];
      if (v && typeof v === 'object') return v;
    }
    return data;
  }

  function withSemester(targetUrl: string, semesterId?: unknown): string {
    const sid = String(semesterId || '').trim();
    if (!sid) return targetUrl;
    const sep = targetUrl.includes('?') ? '&' : '?';
    return `${targetUrl}${sep}semester_id=${encodeURIComponent(sid)}`;
  }

  // ============ S4: Pengamanan proxy Web Service Dapodik (anti-SSRF) ============
  // Proxy ini mem-fetch host/port yang dikirim peminta — tanpa pengaman, siapa
  // pun di LAN bisa memaksa server me-fetch host/port internal arbitrer.
  // Tiga lapis pengaman: (1) allowlist host, (2) validasi port, (3) header rahasia.

  /** S4: host yang selalu diizinkan — loopback lokal saja. */
  const DAPODIK_LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

  /** S4: host tambahan yang diizinkan eksplisit via env DAPODIK_ALLOW_HOSTS (comma-separated). */
  function dapodikExtraAllowHosts(): Set<string> {
    return new Set(
      String(process.env.DAPODIK_ALLOW_HOSTS || '')
        .split(',')
        .map((h) => h.trim().toLowerCase().replace(/^\[|\]$/g, ''))
        .filter(Boolean)
    );
  }

  /** S4: host hanya boleh loopback atau tercantum di DAPODIK_ALLOW_HOSTS. */
  function isDapodikHostAllowed(rawHost: unknown): boolean {
    if (typeof rawHost !== 'string') return false;
    const host = rawHost.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (!host) return false;
    if (DAPODIK_LOOPBACK_HOSTS.has(host)) return true;
    return dapodikExtraAllowHosts().has(host);
  }

  /** S4: perbandingan secret constant-time (tahan timing attack). */
  function secretsMatch(provided: string, expected: string): boolean {
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  /** S4: middleware pengaman untuk semua endpoint proxy Dapodik. */
  function dapodikProxyGuard(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    // (3) Secret proxy WAJIB dikonfigurasi admin; tanpanya SEMUA request proxy ditolak.
    const proxySecret = process.env.DAPODIK_PROXY_SECRET;
    if (!proxySecret) {
      return res.status(503).json({
        success: false,
        message:
          'Proxy Dapodik dinonaktifkan: admin server belum mengatur variabel lingkungan DAPODIK_PROXY_SECRET. ' +
          'Atur DAPODIK_PROXY_SECRET ke nilai acak yang kuat, lalu restart server.',
      });
    }
    const provided = String(req.get('x-dapodik-secret') || '');
    if (!provided || !secretsMatch(provided, proxySecret)) {
      return res.status(403).json({
        success: false,
        message: 'Akses proxy Dapodik ditolak: header x-dapodik-secret tidak ada atau tidak cocok.',
      });
    }

    // (2) Port harus integer 1-65535, selain itu tolak dengan 400.
    const rawPort = req.body?.port;
    const portCandidate = rawPort === undefined || rawPort === null || rawPort === '' ? 5774 : rawPort;
    const portNum =
      typeof portCandidate === 'number'
        ? portCandidate
        : /^\d+$/.test(String(portCandidate).trim())
          ? Number(String(portCandidate).trim())
          : NaN;
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      return res.status(400).json({
        success: false,
        message: `Port Dapodik tidak valid ("${String(rawPort ?? '').slice(0, 40)}"): harus bilangan bulat 1-65535.`,
      });
    }

    // (1) Host hanya boleh loopback atau tercantum di DAPODIK_ALLOW_HOSTS.
    const rawHost =
      req.body?.host === undefined || req.body?.host === null || req.body?.host === ''
        ? 'localhost'
        : req.body.host;
    if (!isDapodikHostAllowed(rawHost)) {
      return res.status(403).json({
        success: false,
        message:
          `Host Dapodik "${String(rawHost).slice(0, 80)}" tidak diizinkan. ` +
          'Proxy hanya boleh menjangkau localhost/127.0.0.1/::1 atau host yang tercantum di env DAPODIK_ALLOW_HOSTS.',
      });
    }

    // Teruskan nilai yang sudah divalidasi ke handler agar URL dibangun dari input aman.
    req.body.host = typeof rawHost === 'string' ? rawHost.trim() : rawHost;
    req.body.port = portNum;
    return next();
  }
  // ============ akhir S4 ============

  app.post('/api/dapodik/fetch-sekolah', dapodikProxyGuard, async (req, res) => {
    const { host = 'localhost', port = 5774, npsn, token, semesterId } = req.body;
    const targetUrl = withSemester(
      `http://${host}:${port}/WebService/getSekolah?npsn=${npsn || ''}`,
      semesterId
    );

    try {
      const data = await fetchDapodikRaw(targetUrl, token || '', 4000);
      const schoolObj = asSingleObject(data);
      return res.json({
        success: true,
        data: schoolObj,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: `Koneksi ke Web Service Dapodik gagal: ${err.message}`,
      });
    }
  });

  app.get('/api/dapodik/mock-sekolah', (req, res) => {
    res.json({
      success: true,
      data: mockDapodikSekolah,
    });
  });
  app.get('/api/dapodik/mock-rombel', (req, res) => {
    res.json({
      success: true,
      data: mockDapodikRombel,
      count: mockDapodikRombel.length,
      note: 'Data emulator Rombongan Belajar Web Service Dapodik.',
    });
  });
  app.get('/api/dapodik/mock-ptk', (req, res) => {
    res.json({
      success: true,
      data: mockDapodikPtk,
      count: mockDapodikPtk.length,
      note: 'Data emulator PTK Web Service Dapodik.',
    });
  });
  app.get('/api/dapodik/mock-pengguna', (req, res) => {
    res.json({
      success: true,
      data: mockDapodikPengguna,
      count: mockDapodikPengguna.length,
      note: 'Data emulator Pengguna Web Service Dapodik.',
    });
  });
  app.post('/api/dapodik/test-connection', dapodikProxyGuard, async (req, res) => {
    const { host = 'localhost', port = 5774, npsn, token } = req.body;
    const targetUrl = `http://${host}:${port}/WebService/getSekolah?npsn=${npsn || ''}`;

    try {
      const data = await fetchDapodikRaw(targetUrl, token || '', 3500);
      return res.json({
        success: true,
        message: `Berhasil tersambung ke Dapodik lokal (${host}:${port}). Respon sekolah: OK.`,
        data,
      });
    } catch (err: any) {
      const msg = /menolak|terdaftar/i.test(err.message)
        ? err.message
        : `Tidak dapat menjangkau Dapodik lokal di ${host}:${port} (${err.message}). Anda dapat menggunakan fitur simulasi atau impor file jika Dapodik sedang offline.`;
      return res.json({
        success: false,
        message: msg,
      });
    }
  });

  app.post('/api/dapodik/fetch-peserta-didik', dapodikProxyGuard, async (req, res) => {
    const { host = 'localhost', port = 5774, npsn, token, semesterId } = req.body;
    const targetUrl = withSemester(
      `http://${host}:${port}/WebService/getPesertaDidik?npsn=${npsn || ''}`,
      semesterId
    );

    try {
      const data = await fetchDapodikRaw(targetUrl, token || '', 6000);
      const list = asList(data);
      return res.json({
        success: true,
        data: list,
        count: list.length,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: `Koneksi Dapodik terputus atau timeout: ${err.message}`,
      });
    }
  });

  app.get('/api/dapodik/mock-peserta-didik', (req, res) => {
    res.json({
      success: true,
      data: mockDapodikPesertaDidik,
      count: mockDapodikPesertaDidik.length,
      note: 'Data emulator Web Service Dapodik untuk pengetesan sinkronisasi.',
    });
  });

  // Generic proxy untuk endpoint list Web Service Dapodik
  // (getRombonganBelajar, getGtk/getPTK, getPengguna)
  async function proxyDapodikList(
    req: any,
    res: any,
    method: string,
    timeoutMs = 6000
  ) {
    const { host = 'localhost', port = 5774, npsn, token, wsMethod, semesterId } = req.body;
    // wsMethod memungkinkan frontend mencoba alias method (mis. getGtk -> getPTK)
    const finalMethod = typeof wsMethod === 'string' && wsMethod ? wsMethod : method;
    const targetUrl = withSemester(
      `http://${host}:${port}/WebService/${finalMethod}?npsn=${npsn || ''}`,
      semesterId
    );

    try {
      const data = await fetchDapodikRaw(targetUrl, token || '', timeoutMs);
      const list = asList(data);
      if (list.length === 0) {
        console.warn(`[dapodik:${finalMethod}] respons kosong.`);
      }
      return res.json({ success: true, data: list, count: list.length });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: `Koneksi Dapodik terputus atau timeout (${finalMethod}): ${err.message}`,
      });
    }
  }

  app.post('/api/dapodik/fetch-rombel', dapodikProxyGuard, (req, res) =>
    proxyDapodikList(req, res, 'getRombonganBelajar', 6000)
  );
  // Urutan default getGtk dulu (terbukti ada di Dapodik 2026/2027); getPTK untuk versi lama
  app.post('/api/dapodik/fetch-ptk', dapodikProxyGuard, (req, res) =>
    proxyDapodikList(req, res, 'getGtk', 6000)
  );
  app.post('/api/dapodik/fetch-pengguna', dapodikProxyGuard, (req, res) =>
    proxyDapodikList(req, res, 'getPengguna', 6000)
  );

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'Buku Induk Siswa Kurikulum Merdeka' });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Pakai middleware fallback (bukan app.get('*')) agar kompatibel
    // Express 4 maupun Express 5 (di v5 pola '*' melempar PathError).
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // S4: bind ke loopback secara default agar proxy tidak terekspos ke LAN;
  // override bila memang perlu via env HOST (mis. HOST=0.0.0.0).
  const LISTEN_HOST = process.env.HOST || '127.0.0.1';
  const server = app.listen(PORT, LISTEN_HOST, () => {
    console.log(`Server running on http://${LISTEN_HOST}:${PORT}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Port ${PORT} sudah dipakai proses lain. Hentikan proses lama atau jalankan dengan port lain, contoh: PORT=3001 npm run dev`
      );
      process.exit(1);
    }
    console.error('Gagal menjalankan server:', err.message);
    process.exit(1);
  });
}

startServer();
