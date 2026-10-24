// Fase S5: Mode Utama bawaan — kemasan desktop Electron mulai pada mode
// server (server SQLite terbundel), browser web tetap lokal; pilihan
// tersimpan pengguna selalu menang atas bawaan.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const gudang = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (gudang.has(k) ? gudang.get(k)! : null),
  setItem: (k: string, v: string) => void gudang.set(k, String(v)),
  removeItem: (k: string) => void gudang.delete(k),
  clear: () => gudang.clear(),
};

const { modeUtama, aturModeUtama, adalahDesktop, MODE_UTAMA_KEY } = await import(
  '../src/utils/modeData.ts'
);

beforeEach(() => {
  gudang.clear();
  delete (globalThis as any).window;
});

test('tanpa jendela desktop dan tanpa simpanan: lokal', () => {
  assert.equal(adalahDesktop(), false);
  assert.equal(modeUtama(), 'lokal');
});

test('kemasan desktop tanpa simpanan: server', () => {
  (globalThis as any).window = { appDesktop: { isDesktop: true } };
  assert.equal(adalahDesktop(), true);
  assert.equal(modeUtama(), 'server');
});

test('pilihan tersimpan mengalahkan bawaan desktop', () => {
  (globalThis as any).window = { appDesktop: { isDesktop: true } };
  aturModeUtama('lokal');
  assert.equal(localStorage.getItem(MODE_UTAMA_KEY), 'lokal');
  assert.equal(modeUtama(), 'lokal');
  aturModeUtama('server');
  assert.equal(modeUtama(), 'server');
});
