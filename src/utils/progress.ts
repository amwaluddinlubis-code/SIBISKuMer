// Bus progres global untuk bilah muat di atas halaman (top progress bar).
// Setiap pemuatan data (boot, reload, ganti tab, ganti sekolah, simpan)
// memanggil startTopProgress() dan menutupnya dengan doneTopProgress().
// Penghitung menumpuk sehingga pemuatan paralel tidak menutup bar terlalu dini.

let topProgressCount = 0;
const topProgressTarget = new EventTarget();

function emitTopProgress(): void {
  topProgressTarget.dispatchEvent(
    new CustomEvent<number>('app-top-progress', { detail: topProgressCount })
  );
}

export function startTopProgress(): void {
  topProgressCount += 1;
  emitTopProgress();
}

export function doneTopProgress(): void {
  topProgressCount = Math.max(0, topProgressCount - 1);
  emitTopProgress();
}

/** Jalankan fn async dengan bar progres otomatis (sukses maupun gagal). */
export async function withTopProgress<T>(fn: () => Promise<T>): Promise<T> {
  startTopProgress();
  try {
    return await fn();
  } finally {
    doneTopProgress();
  }
}

export function subscribeTopProgress(handler: (activeCount: number) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<number>).detail);
  topProgressTarget.addEventListener('app-top-progress', listener);
  return () => topProgressTarget.removeEventListener('app-top-progress', listener);
}

export function getTopProgressCount(): number {
  return topProgressCount;
}
