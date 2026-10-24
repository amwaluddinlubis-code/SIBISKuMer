// Hook jalur baca layar pilot (Fase S2 migrasi SQLite).
//
// Mengembalikan daftar siswa prop apa adanya pada mode 'lokal'. Pada
// mode 'server', daftar diambil sekali dari API SQLite saat komponen
// tampil; selama memuat (atau bila server/sesi tidak tersedia) prop
// lokal tetap dipakai agar layar tidak pernah kosong. Saat impersonate
// aktif, data server tidak dipakai (sesi server milik impersonator).
import { useEffect, useState } from 'react';
import type { Siswa } from '../types';
import { modeLayar, type LayarPilot } from '../utils/modeData';
import { ambilSiswaDariServer, sedangMenyamar } from '../utils/dataApi';

export function useSiswaLayar(layar: LayarPilot, siswaProp: Siswa[]): Siswa[] {
  const [dariServer, setDariServer] = useState<Siswa[] | null>(null);

  useEffect(() => {
    if (modeLayar(layar) !== 'server' || sedangMenyamar()) {
      setDariServer(null);
      return;
    }
    let hidup = true;
    ambilSiswaDariServer()
      .then((data) => {
        if (hidup) setDariServer(data);
      })
      .catch(() => {
        if (hidup) setDariServer(null);
      });
    return () => {
      hidup = false;
    };
  }, [layar]);

  return dariServer ?? siswaProp;
}
