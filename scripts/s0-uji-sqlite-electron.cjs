// S0-d — Uji node:sqlite di dalam Electron (BUKAN bagian aplikasi).
// Jalankan di PC dari folder repo setelah `npm install`:
//   npx electron scripts/s0-uji-sqlite-electron.cjs
// Hasil tertulis ke s0-hasil-electron.json di folder repo + konsol.
// Berkas ini dihapus setelah gerbang S0 diputuskan.
'use strict';
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.whenReady().then(() => {
  const hasil = {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    platform: process.platform,
  };
  try {
    const { DatabaseSync } = require('node:sqlite');
    hasil.nodeSqlite = 'tersedia';
    const berkas = path.join(app.getPath('userData'), 's0-uji.db');
    for (const suf of ['', '-wal', '-shm']) {
      try { fs.rmSync(berkas + suf, { force: true }); } catch { /* abaikan */ }
    }
    const db = new DatabaseSync(berkas);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('CREATE TABLE uji (id TEXT PRIMARY KEY, payload TEXT NOT NULL)');
    const sisip = db.prepare('INSERT INTO uji VALUES (?, ?)');
    db.exec('BEGIN');
    for (let i = 1; i <= 100; i++) sisip.run(`u${i}`, JSON.stringify({ i, ok: true }));
    db.exec('COMMIT');
    const n = db.prepare('SELECT COUNT(*) AS n FROM uji').get().n;
    const mode = db.prepare('PRAGMA journal_mode;').get().journal_mode;
    db.close();
    hasil.tulisBaca = n === 100;
    hasil.journalMode = mode;
    hasil.berkasDb = berkas;
    hasil.kesimpulan = n === 100 && mode === 'wal' ? 'LULUS' : 'GAGAL';
  } catch (err) {
    hasil.nodeSqlite = 'TIDAK tersedia';
    hasil.error = String(err && err.message ? err.message : err);
    hasil.kesimpulan = 'GAGAL';
  }
  const tujuan = path.join(process.cwd(), 's0-hasil-electron.json');
  fs.writeFileSync(tujuan, JSON.stringify(hasil, null, 2));
  console.log('=== HASIL UJI SQLITE ELECTRON ===');
  console.log(JSON.stringify(hasil, null, 2));
  console.log('Tertulis ke:', tujuan);
  app.quit();
});
