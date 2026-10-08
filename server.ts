import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { mockDapodikPesertaDidik, mockDapodikSekolah } from './src/data/initialData';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // ---- Pengamanan proxy Dapodik ----
  // Host tujuan dibatasi (default: hanya lokal). Tambah via env DAPODIK_ALLOWED_HOSTS="host1,host2".
  const ALLOWED_DAPODIK_HOSTS = (process.env.DAPODIK_ALLOWED_HOSTS || 'localhost,127.0.0.1,::1')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  function validateDapodikTarget(host: unknown, port: unknown, npsn: unknown): { ok: boolean; message?: string; portNum?: number } {
    const h = String(host ?? '').trim().toLowerCase();
    if (!ALLOWED_DAPODIK_HOSTS.includes(h)) {
      return { ok: false, message: `Host Dapodik "${host}" tidak diizinkan. Host yang diizinkan: ${ALLOWED_DAPODIK_HOSTS.join(', ')}.` };
    }
    const p = Number(port);
    if (!Number.isInteger(p) || p < 1 || p > 65535) {
      return { ok: false, message: 'Port Dapodik tidak valid (1-65535).' };
    }
    if (npsn !== undefined && npsn !== null && String(npsn).trim() !== '' && !/^\d{8}$/.test(String(npsn).trim())) {
      return { ok: false, message: 'NPSN harus 8 digit angka.' };
    }
    return { ok: true, portNum: p };
  }

  // Dapodik Web Service Proxy Routes
  app.post('/api/dapodik/fetch-sekolah', async (req, res) => {
    const { host = 'localhost', port = 5774, npsn, token } = req.body;
    const check = validateDapodikTarget(host, port, npsn);
    if (!check.ok) {
      return res.status(400).json({ success: false, message: check.message });
    }
    const targetUrl = `http://${String(host).trim().toLowerCase()}:${check.portNum}/WebService/getSekolah?npsn=${encodeURIComponent(String(npsn || '').trim())}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(targetUrl, {
        headers: {
          Authorization: `Bearer ${token || ''}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        const schoolObj = Array.isArray(data) ? data[0] : data.rows?.[0] || data.data || data;
        return res.json({
          success: true,
          data: schoolObj,
        });
      } else {
        return res.status(response.status).json({
          success: false,
          message: `Dapodik merespon dengan status ${response.status}: ${response.statusText}`,
        });
      }
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
  app.post('/api/dapodik/test-connection', async (req, res) => {
    const { host = 'localhost', port = 5774, npsn, token } = req.body;
    const check = validateDapodikTarget(host, port, npsn);
    if (!check.ok) {
      return res.status(400).json({ success: false, message: check.message });
    }
    const targetUrl = `http://${String(host).trim().toLowerCase()}:${check.portNum}/WebService/getSekolah?npsn=${encodeURIComponent(String(npsn || '').trim())}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);

      const response = await fetch(targetUrl, {
        headers: {
          Authorization: `Bearer ${token || ''}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        return res.json({
          success: true,
          message: `Berhasil tersambung ke Dapodik lokal (${host}:${port}). Respon sekolah: OK.`,
          data,
        });
      } else {
        return res.json({
          success: false,
          message: `Dapodik merespon dengan status ${response.status}: ${response.statusText}. Pastikan Token Web Service benar di menu Pengaturan Dapodik.`,
        });
      }
    } catch (err: any) {
      return res.json({
        success: false,
        message: `Tidak dapat menjangkau Dapodik lokal di ${host}:${port} (${err.message}). Anda dapat menggunakan fitur simulasi atau impor file jika Dapodik sedang offline.`,
      });
    }
  });

  app.post('/api/dapodik/fetch-peserta-didik', async (req, res) => {
    const { host = 'localhost', port = 5774, npsn, token } = req.body;
    const check = validateDapodikTarget(host, port, npsn);
    if (!check.ok) {
      return res.status(400).json({ success: false, message: check.message });
    }
    const targetUrl = `http://${String(host).trim().toLowerCase()}:${check.portNum}/WebService/getPesertaDidik?npsn=${encodeURIComponent(String(npsn || '').trim())}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(targetUrl, {
        headers: {
          Authorization: `Bearer ${token || ''}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          message: `Gagal mengambil data dari Dapodik: HTTP ${response.status}`,
        });
      }

      const data = await response.json();
      const list = Array.isArray(data) ? data : data.rows || data.results || data.data || [];
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

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'Buku Induk Siswa SMP Kurikulum Merdeka' });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
