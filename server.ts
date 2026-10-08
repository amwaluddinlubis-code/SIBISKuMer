import express from 'express';
import path from 'path';
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

  app.post('/api/dapodik/fetch-sekolah', async (req, res) => {
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
  app.post('/api/dapodik/test-connection', async (req, res) => {
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

  app.post('/api/dapodik/fetch-peserta-didik', async (req, res) => {
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

  app.post('/api/dapodik/fetch-rombel', (req, res) =>
    proxyDapodikList(req, res, 'getRombonganBelajar', 6000)
  );
  // Urutan default getGtk dulu (terbukti ada di Dapodik 2026/2027); getPTK untuk versi lama
  app.post('/api/dapodik/fetch-ptk', (req, res) =>
    proxyDapodikList(req, res, 'getGtk', 6000)
  );
  app.post('/api/dapodik/fetch-pengguna', (req, res) =>
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

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
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
