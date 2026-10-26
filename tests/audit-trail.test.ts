// Tes regresi issue #9 — audit trail (sanitasi, diff, append-only,
// isolasi antar-sekolah, dedup, retensi, akses).
// Dijalankan via `npm test` (tsx --test). Modul src diimpor dinamis
// SETELAH shim localStorage/window, karena db.ts memakai fallback
// localStorage bila IndexedDB tidak tersedia (seperti di Node ini).

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
  sanitasiNilaiAudit,
  sanitasiTeksAudit,
  diffAudit,
  bolehImporEntriAudit,
} = await import('../src/utils/auditSanitasi.ts');
const { catatAudit, bolehMelihatAuditLog } = await import('../src/utils/audit.ts');
const { getSekolahProfile } = await import('../src/utils/db.ts');
const { addAuditLog, getAuditLogs, saveSekolahProfile, importBackupData } = await import('../src/utils/db.ts');

const KUNCI_AKTIF = 'bukuinduk_active_school';

beforeEach(() => {
  isi.clear();
  fakeLocalStorage.setItem(KUNCI_AKTIF, 'sekolah-uji');
});

describe('sanitasi audit', () => {
  it('menyensor kunci rahasia & data pribadi di objek bersarang', () => {
    const hasil = sanitasiNilaiAudit({
      token: 'abc-123',
      password: 'rahasia',
      nik: '1234567890123456',
      nisn: '0011223344',
      fotoUrl: 'data:image/jpeg;base64,xxx',
      alamat: 'Jl. Merdeka 1',
      nama: 'Budi',
      rombel: '5A',
      dalam: { kataSandi: 'x', statusSiswa: 'Aktif' },
    }) as Record<string, unknown>;
    assert.equal(hasil.token, '[disensor]');
    assert.equal(hasil.password, '[disensor]');
    assert.equal(hasil.nik, '[disensor]');
    assert.equal(hasil.nisn, '[disensor]');
    assert.equal(hasil.fotoUrl, '[disensor]');
    assert.equal(hasil.alamat, '[disensor]');
    assert.equal(hasil.nama, 'Budi');
    assert.equal(hasil.rombel, '5A');
    assert.equal((hasil.dalam as Record<string, unknown>).kataSandi, '[disensor]');
    assert.equal((hasil.dalam as Record<string, unknown>).statusSiswa, 'Aktif');
  });

  it('menyensor pasangan token/password di teks bebas', () => {
    const hasil = sanitasiTeksAudit('gagal, token: abc123 dan password=rahasia!');
    assert.ok(!hasil.includes('abc123'));
    assert.ok(!hasil.includes('rahasia'));
    assert.ok(hasil.includes('[disensor]'));
  });

  it('diffAudit hanya mencatat field allowlist yang berubah', () => {
    const diff = diffAudit(
      { statusSiswa: 'Aktif', rombelSaatIni: '5A', nik: '111', nama: 'Budi' },
      { statusSiswa: 'Mutasi Keluar', rombelSaatIni: '5A', nik: '222', nama: 'Budi' },
      ['statusSiswa', 'rombelSaatIni']
    );
    assert.deepEqual(diff, {
      sebelum: { statusSiswa: 'Aktif' },
      sesudah: { statusSiswa: 'Mutasi Keluar' },
    });
  });

  it('diffAudit mengembalikan undefined bila tak ada perubahan allowlist', () => {
    assert.equal(
      diffAudit({ statusSiswa: 'Aktif', nik: '111' }, { statusSiswa: 'Aktif', nik: '222' }, [
        'statusSiswa',
      ]),
      undefined
    );
  });
});

describe('penulis audit (catatAudit)', () => {
  it('mencap sekolahId + hasil default berhasil, tanpa pernah melempar', async () => {
    catatAudit('siswa_ubah', {
      entitas: 'siswa',
      entitasId: 's-1',
      ringkasan: 'Ubah siswa',
      sebelum: { statusSiswa: 'Aktif' },
      sesudah: { statusSiswa: 'Lulus' },
    });
    await tidur(30);
    const logs = await getAuditLogs(100);
    const entri = logs.find((l) => l.entitasId === 's-1');
    assert.ok(entri);
    assert.equal(entri?.sekolahId, 'sekolah-uji');
    assert.equal(entri?.hasil, 'berhasil');
    assert.deepEqual(entri?.sebelum, { statusSiswa: 'Aktif' });
    assert.deepEqual(entri?.sesudah, { statusSiswa: 'Lulus' });
  });

  it('menyimpan hasil gagal apa adanya dan tetap menyensor sebelum/sesudah', async () => {
    catatAudit('backup_pulihkan', {
      entitas: 'backup',
      ringkasan: 'Restore DITOLAK, token: jangan-bocor',
      hasil: 'gagal',
      sebelum: { token: 'jangan-bocor' },
      sesudah: { jumlah: 0 },
    });
    await tidur(30);
    const logs = await getAuditLogs(100);
    const entri = logs.find((l) => l.aksi === 'backup_pulihkan' && l.hasil === 'gagal');
    assert.ok(entri);
    assert.ok(!String(entri?.ringkasan).includes('jangan-bocor'));
    assert.deepEqual(entri?.sebelum, { token: '[disensor]' });
  });
});

describe('penyimpanan audit (db.ts)', () => {
  it('tidak menduplikasi entri dengan id yang sama', async () => {
    const entri = {
      id: 'aud-dup-1',
      timestamp: new Date().toISOString(),
      aktor: 'admin',
      aksi: 'login' as const,
      entitas: 'sesi',
      ringkasan: 'masuk',
    };
    await addAuditLog(entri);
    await addAuditLog(entri);
    const logs = await getAuditLogs(100);
    assert.equal(logs.filter((l) => l.id === 'aud-dup-1').length, 1);
  });

  it('retensi cermin: maksimal 300 entri terbaru dipertahankan', async () => {
    for (let i = 0; i < 305; i++) {
      await addAuditLog({
        id: `aud-ret-${i}`,
        timestamp: new Date(Date.now() + i).toISOString(),
        aktor: 'admin',
        aksi: 'login' as const,
        entitas: 'sesi',
        ringkasan: `masuk ${i}`,
      });
    }
    const logs = await getAuditLogs(1000);
    assert.equal(logs.length, 300);
    // Entri tertua terbuang, terbaru bertahan.
    assert.ok(!logs.some((l) => l.id === 'aud-ret-0'));
    assert.ok(logs.some((l) => l.id === 'aud-ret-304'));
  });

  it('tidak mengekspor API hapus log (append-only)', async () => {
    const db = (await import('../src/utils/db.ts')) as Record<string, unknown>;
    assert.equal(db.clearAuditLogs, undefined);
  });
});

describe('isolasi antar-sekolah saat restore', () => {
  it('menerima entri dengan sekolahId yang cocok', () => {
    assert.equal(
      bolehImporEntriAudit({ sekolahId: 'sekolah-uji' }, 'sekolah-uji', '123', '123'),
      true
    );
  });

  it('menolak entri sekolah lain walau NPSN berkas sama', () => {
    assert.equal(
      bolehImporEntriAudit({ sekolahId: 'sekolah-lain' }, 'sekolah-uji', '123', '123'),
      false
    );
  });

  it('menerima entri lawas tanpa sekolahId bila NPSN berkas = NPSN aktif', () => {
    assert.equal(bolehImporEntriAudit({}, 'sekolah-uji', '123', '123'), true);
  });

  it('menolak entri lawas tanpa sekolahId bila NPSN berbeda', () => {
    assert.equal(bolehImporEntriAudit({}, 'sekolah-uji', '999', '123'), false);
  });
  it('menolak audit lawas sekolah sumber saat restore mengganti profil NPSN tujuan', async () => {
    await saveSekolahProfile({ npsn: '123' } as never);
    const result = await importBackupData(JSON.stringify({
      app: 'Buku Induk Siswa Kurikulum Merdeka',
      version: '1.3.0',
      sekolah: { npsn: '999' },
      siswa: [],
      audit: [{
        id: 'legacy-audit-sumber',
        timestamp: new Date().toISOString(),
        aksi: 'login',
        entitas: 'sesi',
        ringkasan: 'log lama sekolah sumber',
      }],
    }), { konfirmasiSekolahLain: true, lewatiSnapshotPengaman: true });
    assert.equal(result.success, true, result.message || result.alasan || JSON.stringify(result));
    assert.equal((await getSekolahProfile()).npsn, '999');
    const logs = await getAuditLogs(100);
    assert.equal(logs.some((log) => log.id === 'legacy-audit-sumber'), false);
  });

  it('menolak entri kosong', () => {
    assert.equal(bolehImporEntriAudit(null, 'sekolah-uji', '123', '123'), false);
  });
});

describe('akses baca audit', () => {
  it('hanya administrator boleh melihat log audit', () => {
    const admin = { id: 'u1', username: 'admin', role: 'administrator' } as never;
    const operator = { id: 'u2', username: 'op', role: 'operator' } as never;
    assert.equal(bolehMelihatAuditLog(admin), true);
    assert.equal(bolehMelihatAuditLog(operator), false);
    assert.equal(bolehMelihatAuditLog(null), false);
    assert.equal(bolehMelihatAuditLog(undefined), false);
  });
});

describe('batas sanitasi audit (Issue #30)', () => {
  it('kedalaman > 4 runtuh menjadi sensor di level ke-5', () => {
    const hasil = sanitasiNilaiAudit({
      a: { b: { c: { d: { e: { nik: '1234567890123456' } } } } },
    }) as Record<string, any>;
    assert.deepEqual(hasil.a.b.c.d, { e: '[disensor]' });
  });

  it('array dipotong 50 elemen, elemen sensitif tetap disensor', () => {
    const banyak = Array.from({ length: 60 }, (_, i) => ({ i, nik: '1234567890123456' }));
    const hasil = sanitasiNilaiAudit(banyak) as Array<Record<string, unknown>>;
    assert.equal(hasil.length, 50);
    assert.equal(hasil[0].nik, '[disensor]');
    assert.equal(hasil[49].i, 49);
  });
});
