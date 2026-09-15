import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { mockDapodikPesertaDidik, mockDapodikSekolah } from './src/data/initialData';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Dapodik Web Service Proxy Routes
  app.post('/api/dapodik/fetch-sekolah', async (req, res) => {
    const { host = 'localhost', port = 5774, npsn, token } = req.body;
    const targetUrl = `http://${host}:${port}/WebService/getSekolah?npsn=${npsn || ''}`;

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
    const targetUrl = `http://${host}:${port}/WebService/getSekolah?npsn=${npsn || ''}`;

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
    const targetUrl = `http://${host}:${port}/WebService/getPesertaDidik?npsn=${npsn || ''}`;

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
