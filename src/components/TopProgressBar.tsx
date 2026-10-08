import React, { useEffect, useRef, useState } from 'react';
import { subscribeTopProgress, getTopProgressCount } from '../utils/progress';

/** Bilah progres di paling atas halaman — tampil setiap boot, reload data,
 *  ganti tab, ganti sekolah, dan simpan. Menumpuk aman untuk muat paralel. */
export const TopProgressBar: React.FC = () => {
  const [visible, setVisible] = useState(getTopProgressCount() > 0);
  const [width, setWidth] = useState(8);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const stopTick = () => {
      if (timer.current !== null) {
        window.clearInterval(timer.current);
        timer.current = null;
      }
    };
    const unsub = subscribeTopProgress((count) => {
      if (count > 0) {
        setVisible(true);
        setWidth((w) => (w >= 8 && w < 90 ? w : 12));
        stopTick();
        // Merayap menuju 90% selama muat berlangsung (indeterminate ala nprogress).
        timer.current = window.setInterval(() => {
          setWidth((w) => (w < 90 ? Math.min(90, w + Math.max(1, (90 - w) * 0.12)) : w));
        }, 160);
      } else {
        stopTick();
        setWidth(100);
        // Beri jeda agar pengguna melihat penyelesaian 100% sebelum hilang.
        window.setTimeout(() => {
          setVisible(false);
          setWidth(8);
        }, 320);
      }
    });
    return () => {
      stopTick();
      unsub();
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[90] h-1 print:hidden"
      role="progressbar"
      aria-label="Memuat halaman"
      aria-hidden={false}
    >
      <div className="h-full w-full bg-blue-100/70" />
      <div
        className="absolute top-0 left-0 h-full rounded-r-full bg-gradient-to-r from-blue-600 via-indigo-500 to-gold-400 shadow-[0_0_12px_rgba(37,99,235,0.7)] transition-[width] duration-200 ease-out"
        style={{ width: `${width}%` }}
      />
    </div>
  );
};
