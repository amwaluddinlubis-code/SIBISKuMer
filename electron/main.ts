// ---------------- Main process: Buku Induk Siswa (desktop Windows) ----------------
// Development : backend diharapkan sudah jalan (`npm run dev` → :3000),
//               window membuka http://localhost:3000.
// Produksi    : cari port bebas → set PORT → require dist/server.cjs
//               (Express statis, NODE_ENV=production) → buka 127.0.0.1:PORT.

import { app, BrowserWindow } from 'electron';
import net from 'net';
import path from 'path';

const isDev = !app.isPackaged;

function cariPortBebas(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    // 'localhost' (bukan 127.0.0.1): Firebase Auth hanya mengizinkan
    // localhost secara bawaan (127.0.0.1 → auth/unauthorized-domain).
    srv.listen(0, 'localhost', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

async function urlBackend(): Promise<string> {
  if (isDev) return 'http://localhost:3000';
  const port = await cariPortBebas();
  process.env.PORT = String(port);
  process.env.NODE_ENV = 'production';
  // dist-electron/main.cjs  →  ../dist/server.cjs (ikut dipaketkan, lihat electron-builder.yml)
  const serverCjs = path.join(__dirname, '..', 'dist', 'server.cjs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(serverCjs);
  return `http://localhost:${port}`;
}

function buatWindow(url: string): void {
  const win = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 640,
    autoHideMenuBar: true,
    backgroundColor: '#f8fafc',
    title: 'Buku Induk Siswa Kurikulum Merdeka',
    icon: isDev
      ? path.join(__dirname, '..', 'public', 'pwa-512x512.png')
      : path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.on('closed', () => {
    /* dereferensi */
  });
  void win.loadURL(url);
}

// Satu instance saja — window lama difokuskan bila dibuka dua kali.
const lock = app.requestSingleInstanceLock();
if (!lock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const semua = BrowserWindow.getAllWindows();
    if (semua.length > 0) {
      const w = semua[0];
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });

  void app.whenReady().then(async () => {
    try {
      const url = await urlBackend();
      buatWindow(url);
    } catch (err: unknown) {
      // Gagal total (mis. port tak tersedia) — keluar dengan pesan di console.
      // eslint-disable-next-line no-console
      console.error('Gagal menjalankan backend:', err instanceof Error ? err.message : String(err));
      app.quit();
      return;
    }
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void urlBackend().then(buatWindow);
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
