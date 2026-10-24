// Regresi Fase S2 (migrasi SQLite): saklar mode data per layar dan klien
// API server. localStorage & fetch disimulasikan — tidak ada server
// sungguhan yang dilibatkan.
import test from 'node:test';
import assert from 'node:assert/strict';

// --- Rintisan localStorage ---
class LSStub {
  private peta = new Map<string, string>();
  getItem(k: string): string | null {
    return this.peta.has(k) ? this.peta.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.peta.set(k, String(v));
  }
  removeItem(k: string): void {
    this.peta.delete(k);
  }
  clear(): void {
    this.peta.clear();
  }
}
const ls = new LSStub();
(globalThis as any).localStorage = ls;

// --- Rintisan fetch ---
interface PanggilanFetch {
  url: string;
  init: any;
}
let panggilan: PanggilanFetch[] = [];
let responBerikut: { status: number; body: unknown } = { status: 200, body: { ok: true, data: [] } };
(globalThis as any).fetch = async (url: string, init: any) => {
  panggilan.push({ url, init });
  return {
    ok: responBerikut.status >= 200 && responBerikut.status < 300,
    status: responBerikut.status,
    json: async () => responBerikut.body,
  };
};

const modeData = await import('../src/utils/modeData');
const dataApi = await import('../src/utils/dataApi');

test.beforeEach(() => {
  ls.clear();
  panggilan = [];
  responBerikut = { status: 200, body: { ok: true, data: [] } };
});

test('modeLayar: bawaan lokal, saklar tersimpan & terbaca kembali', () => {
  assert.equal(modeData.modeLayar('dasbor'), 'lokal');
  assert.equal(modeData.adaLayarServer(), false);
  modeData.aturModeLayar('dasbor', 'server');
  assert.equal(modeData.modeLayar('dasbor'), 'server');
  assert.equal(modeData.modeLayar('siswa'), 'lokal');
  assert.equal(modeData.adaLayarServer(), true);
  modeData.aturModeLayar('dasbor', 'lokal');
  assert.equal(modeData.adaLayarServer(), false);
});

test('modeLayar: JSON rusak di penyimpanan -> jatuh ke lokal, tidak melempar', () => {
  ls.setItem(modeData.MODE_DATA_KEY, '{bukan json');
  assert.equal(modeData.modeLayar('siswa'), 'lokal');
  ls.setItem(modeData.MODE_DATA_KEY, '{"siswa":"aneh"}');
  assert.equal(modeData.modeLayar('siswa'), 'lokal');
});

test('sekolahIdServer: tanpa sekolah aktif -> utama; dengan id aktif -> id itu', () => {
  assert.equal(dataApi.sekolahIdServer(), 'utama');
  ls.setItem('bukuinduk_active_school', 'sk-abc123');
  assert.equal(dataApi.sekolahIdServer(), 'sk-abc123');
});

test('ambilSiswaDariServer: memanggil API dengan cookie sesi & membuka amplop', async () => {
  responBerikut = { status: 200, body: { ok: true, data: [{ id: 's1' }, { id: 's2' }] } };
  const hasil = await dataApi.ambilSiswaDariServer();
  assert.equal(hasil.length, 2);
  assert.equal(panggilan[0].url, '/api/v1/data/siswa');
  assert.equal(panggilan[0].init.credentials, 'same-origin');
});

test('ambilSiswaDariServer: 401 dari server -> melempar pesan server', async () => {
  responBerikut = { status: 401, body: { ok: false, pesan: 'Sesi tidak ditemukan.' } };
  await assert.rejects(() => dataApi.ambilSiswaDariServer(), /Sesi tidak ditemukan/);
});

test('loginKeServer: mengirim sekolahId+username+password; gagal -> false tanpa melempar', async () => {
  const ok = await dataApi.loginKeServer('administrator', 'rahasia');
  assert.equal(ok, true);
  assert.equal(panggilan[0].url, '/api/v1/auth/login');
  const body = JSON.parse(panggilan[0].init.body);
  assert.deepEqual(body, { sekolahId: 'utama', username: 'administrator', password: 'rahasia' });

  responBerikut = { status: 401, body: { ok: false, pesan: 'Salah.' } };
  const gagal = await dataApi.loginKeServer('administrator', 'salah');
  assert.equal(gagal, false);
});

test('sedangMenyamar mengikuti kunci impersonate lokal', () => {
  assert.equal(dataApi.sedangMenyamar(), false);
  ls.setItem('bukuinduk_impersonate_from', '{"id":"usr-admin-01"}');
  assert.equal(dataApi.sedangMenyamar(), true);
});
