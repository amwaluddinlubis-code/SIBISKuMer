import { useEffect, useRef } from 'react';

/**
 * Otomatis memanggil onIdle bila tidak ada aktivitas selama timeoutMs.
 * Penting untuk perangkat bersama di sekolah: sesi tidak dibiarkan terbuka.
 */
export function useIdleLogout(onIdle: () => void, timeoutMs: number = 30 * 60 * 1000, enabled: boolean = true): void {
  const cbRef = useRef(onIdle);
  cbRef.current = onIdle;

  useEffect(() => {
    if (!enabled) return;

    let timer: number | null = null;
    const reset = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => cbRef.current(), timeoutMs);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'click', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    reset();

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, reset));
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [enabled, timeoutMs]);
}
