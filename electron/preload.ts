// ---------------- Preload (jembatan aman renderer ↔ main) ----------------
// contextIsolation aktif + nodeIntegration mati: renderer hanya dapat API
// eksplisit di bawah (tidak ada akses Node langsung).

import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('appDesktop', {
  platform: process.platform,
  /** True bila berjalan sebagai aplikasi desktop (bukan browser). */
  isDesktop: true,
});
