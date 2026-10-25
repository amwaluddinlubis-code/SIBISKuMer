import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Regresi layar putih pasca-login (25 Okt 2026): LoginModal menaruh
// useRef SETELAH `if (!isOpen) return null`. Saat login berhasil dan App
// menutup modal, render berikutnya memanggil hook lebih sedikit →
// "Rendered fewer hooks than expected" → seluruh pohon React lepas →
// halaman putih kosong hingga muat ulang. Semua hook WAJIB di atas
// early return itu.
test('LoginModal: tidak ada hook React setelah early return isOpen', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(dir, '..', 'src', 'components', 'LoginModal.tsx'), 'utf8');
  const matchReturn = src.match(/^\s*if \(!isOpen\) \{/m);
  assert.ok(matchReturn && typeof matchReturn.index === 'number', 'early return isOpen harus ada');
  const idxReturn = matchReturn.index;
  const sesudah = src.slice(idxReturn);
  const hookSetelah = sesudah.match(/\buse(?:State|Effect|Ref|Memo|Callback)\s*\(/);
  assert.equal(
    hookSetelah,
    null,
    `hook ditemukan setelah early return isOpen: ${hookSetelah?.[0]} — pindahkan ke atas early return`,
  );
  // Dan useRef kata sandi final tetap terdaftar sebagai hook di atasnya.
  const sebelum = src.slice(0, idxReturn);
  assert.match(sebelum, /const kataSandiFinalRef = useRef\(/, 'kataSandiFinalRef harus dideklarasikan sebelum early return');
});
