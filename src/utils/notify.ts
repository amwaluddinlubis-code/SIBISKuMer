export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastPayload {
  id: number;
  kind: ToastKind;
  message: string;
}

let toastSeq = 0;
const toastTarget = new EventTarget();

// Fase 3 §15: dedupe toast — pesan+jenis yang sama dalam 2 detik hanya
// tampil sekali (beberapa alur menerbitkan notifikasi yang sama dua kali).
let toastTerakhir: { kunci: string; pada: number } | null = null;

export function toast(message: string, kind: ToastKind = 'info'): void {
  const kunci = `${kind}::${message}`;
  const kini = Date.now();
  if (toastTerakhir && toastTerakhir.kunci === kunci && kini - toastTerakhir.pada < 2000) {
    return;
  }
  toastTerakhir = { kunci, pada: kini };
  toastSeq += 1;
  const payload: ToastPayload = { id: toastSeq, kind, message };
  toastTarget.dispatchEvent(new CustomEvent<ToastPayload>('app-toast', { detail: payload }));
}

export function subscribeToast(handler: (t: ToastPayload) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<ToastPayload>).detail);
  toastTarget.addEventListener('app-toast', listener);
  return () => toastTarget.removeEventListener('app-toast', listener);
}

// ---- Promise-based confirm dialog (pengganti window.confirm) ----

interface ConfirmRequest {
  id: number;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  /** Bila diisi, tombol konfirmasi hanya aktif setelah pengguna mengetik
   *  teks ini persis (konfirmasi dua tahap untuk aksi ireversibel). */
  requireText?: string;
  requireTextLabel?: string;
  resolve: (ok: boolean) => void;
}

let confirmSeq = 0;
const confirmTarget = new EventTarget();
// Simpan semua resolve per id agar dialog beruntun tidak saling menimpa
// (bug lama: satu variabel pendingConfirm membuat promise pertama menggantung).
const pendingConfirms = new Map<number, (ok: boolean) => void>();

export function confirmDialog(
  message: string,
  opts?: { confirmLabel?: string; cancelLabel?: string; danger?: boolean; requireText?: string; requireTextLabel?: string }
): Promise<boolean> {
  confirmSeq += 1;
  const id = confirmSeq;
  return new Promise<boolean>((resolve) => {
    const req: ConfirmRequest = {
      id,
      message,
      confirmLabel: opts?.confirmLabel || 'Ya, Lanjutkan',
      cancelLabel: opts?.cancelLabel || 'Batal',
      danger: opts?.danger ?? true,
      requireText: opts?.requireText,
      requireTextLabel: opts?.requireTextLabel,
      resolve: (ok: boolean) => {
        pendingConfirms.delete(id);
        resolve(ok);
      },
    };
    pendingConfirms.set(id, req.resolve);
    confirmTarget.dispatchEvent(new CustomEvent<ConfirmRequest>('app-confirm-request', { detail: req }));
  });
}

/** Dipakai host dialog untuk mengambil request terakhir. */
export function subscribeConfirmRequest(handler: (r: ConfirmRequest) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<ConfirmRequest>).detail);
  confirmTarget.addEventListener('app-confirm-request', listener);
  return () => confirmTarget.removeEventListener('app-confirm-request', listener);
}

export function resolvePendingConfirm(ok: boolean, id?: number): void {
  if (typeof id === 'number') {
    const fn = pendingConfirms.get(id);
    if (fn) {
      pendingConfirms.delete(id);
      fn(ok);
    }
    return;
  }
  // Tanpa id: selesaikan yang paling lama menunggu (FIFO).
  const first = pendingConfirms.entries().next();
  if (!first.done) {
    const [key, fn] = first.value;
    pendingConfirms.delete(key);
    fn(ok);
  }
}

export type { ConfirmRequest };
