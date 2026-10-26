// Tes regresi Issue #30 — isolasi audit saat restore backup.
// Dijalankan via `npm test` (tsx --test). Modul src diimpor dinamis
// SETELAH shim localStorage/window, karena db.ts memakai fallback
// localStorage bila IndexedDB tidak tersedia (seperti di Node ini).
// Batasan harness yang jujur: snapshot pengaman pra-restore TIDAK dapat
// diuji di Node (saveAutoSnapshot butuh IndexedDB) — bagian itu masuk
// checklist smoke test manual di PR, bukan tes ini.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---- Shim penyimpanan (cermin localStorage) ----
const isi = new Map<string, string>();
const fakeLocalStorage = {
  getItem: (k: string) => (isi.has(k) ? isi.get(k)! : null),
  setItem: (k: string, v: string) => {
    isi.set(k, String(v));
  },
  removeItem: (k: string) => {
    isi.delete(k);
  },
  clear: () => isi.clear(),
};
(globalThis as unknown as Record<string, unknown>).localStorage = fakeLocalStorage;
(globalThis as unknown as Record<string, unknown>).window = {};
(globalThis as unknown as Record<string, unknown>).indexedDB = undefined;

const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

const {
  addAuditLog,
  getAuditLogs,
  saveSekolahProfile,
  importBackupData,
  exportAllData,
} = await import('../src/utils/db.ts');
const { catatAudit } = await import('../src/utils/audit.ts');

const KUNCI_AKTIF = 'bukuinduk_active_school';

beforeEach(() => {
  isi.clear();
  fakeLocalStorage.setItem(KUNCI_AKTIF, 'sekolah-uji');
});

function entriAudit(id: string, sekolahId?: string) {
  return {
    id,
    timestamp: new Date().toISOString(),
    aktor: 'admin',
    aksi: 'login',
    entitas: 'sesi',
    ringkasan: `entri ${id}`,
    ...(sekolahId !== undefined ? { sekolahId } : {}),
  };
}

function payloadBackup(audit: unknown[], npsn = '123') {
  return JSON.stringify({
    app: 'Buku Induk Siswa Kurikulum Merdeka',
    version: '1.3.0',
    sekolah: { npsn },
    siswa: [],
    audit,
  });
}

describe('isolasi audit saat restore (Issue #30)', () => {
  it('entri sekolah sama + entri lawas se-NPSN diimpor; entri sekolah lain ditolak', async () => {
    await saveSekolahProfile({ npsn: '123' } as never);
    const result = await importBackupData(
      payloadBackup([
        entriAudit('aud-sama', 'sekolah-uji'),
        entriAudit('aud-lain', 'sekolah-lain'),
        entriAudit('aud-lawas'),
      ]),
      { lewatiSnapshotPengaman: true }
    );
    assert.equal(result.success, true, result.message || result.alasan || JSON.stringify(result));
    const logs = await getAuditLogs(100);
    const ids = new Set(logs.map((l) => l.id));
    assert.equal(ids.has('aud-sama'), true);
    assert.equal(ids.has('aud-lawas'), true);
    assert.equal(ids.has('aud-lain'), false);
    assert.ok((result.peringatan || []).some((p) => p.includes('tidak diimpor')));
  });

  it('impor audit massal: cermin LS hanya mempertahankan 300 terbaru', async () => {
    await saveSekolahProfile({ npsn: '123' } as never);
    const banyak = Array.from({ length: 505 }, (_, i) => entriAudit(`cap-${i}`, 'sekolah-uji'));
    const result = await importBackupData(payloadBackup(banyak), { lewatiSnapshotPengaman: true });
    assert.equal(result.success, true, result.message || result.alasan || JSON.stringify(result));
    // Loop impor memotong di 500 entri PERTAMA (slice di db.ts, mode IDB);
    // di harness Node yang teramati adalah cermin LS (maks 300, terbaru dulu).
    // Jadi: cap-504 tidak pernah diimpor, cap-0 diimpor lalu digusur cermin.
    const logs = await getAuditLogs(1000);
    const ids = new Set(logs.map((l) => l.id));
    assert.equal(logs.filter((l) => l.id.startsWith('cap-')).length, 300);
    assert.equal(ids.has('cap-499'), true);
    assert.equal(ids.has('cap-504'), false);
    assert.equal(ids.has('cap-0'), false);
  });

  it('ganti-total menghapus log audit lama dari store aktif; sumber snapshot memuatnya', async () => {
    await saveSekolahProfile({ npsn: '123' } as never);
    await addAuditLog({
      id: 'pra-restore-1',
      timestamp: new Date().toISOString(),
      aktor: 'admin',
      aksi: 'login',
      entitas: 'sesi',
      ringkasan: 'sebelum restore',
      sekolahId: 'sekolah-uji',
    });
    // Sumber snapshot pengaman (exportAllData) WAJIB memuat log lama —
    // inilah yang ditulis ulang ke snapshot setelah clearDatabase.
    const eksporSebelum = await exportAllData();
    assert.ok(eksporSebelum.includes('pra-restore-1'));
    const result = await importBackupData(
      payloadBackup([entriAudit('aud-baru', 'sekolah-uji')]),
      { mode: 'ganti-total', lewatiSnapshotPengaman: true }
    );
    assert.equal(result.success, true, result.message || result.alasan || JSON.stringify(result));
    const logs = await getAuditLogs(100);
    const ids = new Set(logs.map((l) => l.id));
    assert.equal(ids.has('pra-restore-1'), false);
    assert.equal(ids.has('aud-baru'), true);
  });

  it('setelah restore, pencatatan audit berjalan lagi', async () => {
    await saveSekolahProfile({ npsn: '123' } as never);
    const result = await importBackupData(payloadBackup([]), {
      mode: 'ganti-total',
      lewatiSnapshotPengaman: true,
    });
    assert.equal(result.success, true, result.message || result.alasan || JSON.stringify(result));
    catatAudit('backup_pulihkan', { entitas: 'backup', ringkasan: 'pulihkan uji' });
    await tidur(30);
    const logs = await getAuditLogs(100);
    assert.ok(logs.some((l) => l.aksi === 'backup_pulihkan'));
  });
});
