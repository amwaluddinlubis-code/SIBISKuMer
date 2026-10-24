// Regresi gerbang migrasi S4 (25 Okt 2026): confirmDialog yang diterbitkan
// saat ConfirmDialogHost belum terpasang hilang di EventTarget (tak ada
// putar-ulang bagi pendengar terlambat) sehingga promise menggantung dan
// dialog tak pernah tampil. Request kini dibuffer sampai ada host.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmDialog, subscribeConfirmRequest, resolvePendingConfirm } from '../src/utils/notify.ts';

test('confirm tanpa host terbuffer lalu diserahkan saat host berlangganan', async () => {
  const janji = confirmDialog('Hapus data?', { confirmLabel: 'Ya' });
  let diterima: any = null;
  const unsub = subscribeConfirmRequest((r) => {
    diterima = r;
  });
  assert.ok(diterima, 'request terbuffer harus diserahkan ke host baru');
  assert.equal(diterima.message, 'Hapus data?');
  resolvePendingConfirm(true, diterima.id);
  assert.equal(await janji, true);
  unsub();
});

test('confirm dengan host aktif diteruskan langsung dan bisa dibatalkan', async () => {
  const diterimaList: any[] = [];
  const unsub = subscribeConfirmRequest((r) => diterimaList.push(r));
  const janji = confirmDialog('Lanjutkan?', {});
  assert.equal(diterimaList.length, 1);
  resolvePendingConfirm(false, diterimaList[0].id);
  assert.equal(await janji, false);
  unsub();
});
