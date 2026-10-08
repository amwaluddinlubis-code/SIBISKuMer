import React, { useEffect, useMemo, useState } from 'react';
import {
  LayoutGrid,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Sparkles,
  Save,
  X,
  Loader2,
  CalendarRange,
  Search,
  Users,
  ArrowRightLeft,
  History,
} from 'lucide-react';
import { PetaKelas, Siswa, SekolahProfile, TingkatKelas, PtkRef, RombelRef, AppUser } from '../types';
import { savePetaKelas, deletePetaKelas, savePetaKelasList, saveSiswa, saveSiswaBulk, getTahunAjaranTerakhirSiswa } from '../utils/db';
import { getTingkatOptions, getTingkatDariRombel, getRaportList } from '../utils/raportUtils';
import { cekTulisTahun, opsiTahunMaksSesi } from '../utils/sesi';
import { canUserAccessTahun } from '../utils/tahunAjaran';
import { GtkAutocomplete } from './GtkAutocomplete';
import { toast, confirmDialog } from '../utils/notify';
import { startTopProgress, doneTopProgress } from '../utils/progress';

interface PemetaanKelasViewProps {
  peta: PetaKelas[];
  siswa: Siswa[];
  sekolah: SekolahProfile;
  ptk: PtkRef[];
  tahunTerkunci: string[];
  currentUser?: AppUser | null;
  /** Sesi tahun ajaran login — tab pemetaan dibuka pada tahun sesi. */
  sessionTahun?: string | null;
  onDataChanged: () => void;
  rombelRefs?: RombelRef[];
}

/** Tahun ajaran mundur n tahun ("2026/2027" - 1 → "2025/2026"). Null bila format invalid. */
export function mundurTahunAjaran(tahun: string, n: number): string | null {
  const m = /^\s*(\d{4})\s*\/\s*(\d{4})\s*$/.exec(tahun || '');
  if (!m) return null;
  const awal = Number(m[1]) - n;
  if (!Number.isFinite(awal) || awal < 1900) return null;
  return `${awal}/${awal + 1}`;
}

/** Geser nama rombel mengikuti tingkat ("9A" turun ke 8 → "8A", huruf dipertahankan).
 *  Bila nama tidak diawali angka tingkat, nama dipertahankan apa adanya. */
export function geserRombelMundur(rombel: string, dariTingkat: string, keTingkat: string): string {
  const r = (rombel || '').trim().toUpperCase();
  const dari = (dariTingkat || '').trim();
  const ke = (keTingkat || '').trim();
  if (dari && ke && r.startsWith(dari)) {
    return (ke + r.slice(dari.length)).trim() || r;
  }
  return r;
}

/** Kelompok roster aktif per rombel (sumber rekonstruksi mundur). Murni — dapat diuji. */
export function kelompokSumberAktif(
  daftar: Siswa[] | null | undefined,
  tebakTingkat: (rombel: string) => string | null
): Map<string, { tingkat: string; ids: string[] }> {
  const unik = new Map<string, { tingkat: string; ids: string[] }>();
  for (const s of daftar || []) {
    if (s.statusSiswa !== 'Aktif') continue;
    const rawRombel = (s.rombelSaatIni || '').trim();
    if (!rawRombel) continue;
    const tingkat = tebakTingkat(rawRombel);
    if (!tingkat) continue;
    const key = rawRombel.toUpperCase();
    const ada = unik.get(key);
    if (ada) {
      if (!ada.ids.includes(s.id)) ada.ids.push(s.id);
    } else {
      unik.set(key, { tingkat, ids: [s.id] });
    }
  }
  return unik;
}

/** True bila siswa sudah punya catatan apa pun pada tahun tsb (riwayat/raport).
 *  Murni — dipakai agar cap arsip tak menduplikasi catatan asli. */
export function punyaCatatanTahun(s: Siswa | null | undefined, tahun: string): boolean {
  if (!s) return false;
  const t = (tahun || '').trim();
  if (!t) return false;
  if ((s.riwayatTahunAjaran || []).some((r) => (r.tahunAjaran || '').trim() === t)) return true;
  if ((s.riwayatSemester || []).some((r) => (r.tahunAjaran || '').trim() === t)) return true;
  if (getRaportList(s).some((r) => (r.tahunAjaran || '').trim() === t)) return true;
  return false;
}

/** Cap satu entri riwayat arsip hasil Petakan Mundur (null bila sudah tercatat).
 *  Status jujur "Belum Ditentukan" + catatan rekonstruksi — TU koreksi manual. */
export function capRiwayatArsip(
  s: Siswa,
  baris: { tahun: string; tingkat: string; rombel: string },
  now: string
): Siswa | null {
  if (punyaCatatanTahun(s, baris.tahun)) return null;
  return {
    ...s,
    riwayatTahunAjaran: [
      ...(s.riwayatTahunAjaran || []),
      {
        id: `rt-arsip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        tahunAjaran: baris.tahun,
        tingkat: baris.tingkat as TingkatKelas,
        rombel: baris.rombel,
        waliKelas: '',
        statusKenaikan: 'Belum Ditentukan',
        catatan: 'Rekonstruksi arsip (Petakan Mundur).',
      },
    ],
    updatedAt: now,
  };
}

const TANDA_REKONSTRUKSI = 'Rekonstruksi arsip';

/** Buang cap rekonstruksi tahun tsb dari record pribadi (null bila tak ada).
 *  Hanya entri bertanda rekonstruksi yang dibuang — catatan asli (raport,
 *  riwayat semester, entri manual) tidak pernah disentuh. Murni. */
export function buangCapArsip(s: Siswa | null | undefined, tahun: string): Siswa | null {
  if (!s) return null;
  const t = (tahun || '').trim();
  if (!t) return null;
  const riwayat = s.riwayatTahunAjaran || [];
  const sisa = riwayat.filter(
    (r) => !((r.tahunAjaran || '').trim() === t && (r.catatan || '').includes(TANDA_REKONSTRUKSI))
  );
  if (sisa.length === riwayat.length) return null;
  return { ...s, riwayatTahunAjaran: sisa, updatedAt: new Date().toISOString() };
}

/** Pemetaan rombel resmi per tahun ajaran (khusus administrator). */
export const PemetaanKelasView: React.FC<PemetaanKelasViewProps> = ({
  peta,
  siswa,
  sekolah,
  ptk,
  tahunTerkunci,
  currentUser,
  sessionTahun,
  onDataChanged,
  rombelRefs,
}) => {
  const jenjang = sekolah.jenjang || 'SMP';
  const tingkatOptions = useMemo(() => getTingkatOptions(jenjang), [jenjang]);
  // Cutoff sesi: tahun di atas sesi aktif tidak ditampilkan/ditulis.
  const sesiEfektif = (sessionTahun || sekolah.tahunAjaran || '').trim();
  const tahunList = useMemo(() => {
    const set = new Set<string>();
    if (sekolah.tahunAjaran) set.add(sekolah.tahunAjaran);
    for (const p of peta || []) if (p.tahunAjaran) set.add(p.tahunAjaran);
    return opsiTahunMaksSesi([...set].sort().reverse(), sesiEfektif);
  }, [peta, sekolah.tahunAjaran, sesiEfektif]);
  const [tahunAktif, setTahunAktif] = useState(
    (sessionTahun || '').trim() || sekolah.tahunAjaran || tahunList[0] || '2026/2027'
  );
  const [tahunBaru, setTahunBaru] = useState('');
  const [editing, setEditing] = useState<(PetaKelas & { isNew?: boolean }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  // Petakan mundur (rekonstruksi kohort): dari roster tahun sumber, bangkitkan
  // baris tahun-tahun sebelumnya dengan tingkat digeser turun.
  const [mundurOpen, setMundurOpen] = useState(false);
  const [mundurDalam, setMundurDalam] = useState<1 | 2 | 3>(2);

  // Pemilihan siswa pada kelas terpilih (nama, NISN, NIPD) + pindah rombel
  const [kelasTerpilih, setKelasTerpilih] = useState<string | null>(null);
  const [cariSiswa, setCariSiswa] = useState('');
  const [siswaDipilih, setSiswaDipilih] = useState<string[]>([]);
  const [targetPindah, setTargetPindah] = useState('');
  const [moving, setMoving] = useState(false);
  // Tambah anggota arsip (tahun non-aktif): tidak menyentuh rombelSaatIni.
  const [tambahCari, setTambahCari] = useState('');
  const [savingAnggota, setSavingAnggota] = useState(false);

  const efektif = tahunList.includes(tahunAktif) ? tahunAktif : tahunList[0] || tahunAktif;
  const baris = useMemo(
    () =>
      (peta || [])
        .filter((p) => p.tahunAjaran === efektif)
        .sort((a, b) => a.tingkat.localeCompare(b.tingkat) || a.rombel.localeCompare(b.rombel)),
    [peta, efektif]
  );
  const terkunci = tahunTerkunci.includes(efektif);

  // Fondasi sesi: tab dibuka pada tahun sesi; guard tulis tunggal per tahun
  // (tepat pada sesi aktif) + cutoff tampilan ke atas.
  useEffect(() => {
    const s = (sessionTahun || '').trim();
    if (s) setTahunAktif(s);
  }, [sessionTahun]);
  useEffect(() => {
    if (sesiEfektif && tahunAktif !== sesiEfektif && tahunAktif > sesiEfektif) {
      setTahunAktif(tahunList[0] || sesiEfektif);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesiEfektif]);
  const tolakTahun = (tahun: string): string | null =>
    cekTulisTahun(currentUser, tahun, tahunTerkunci, sesiEfektif);

  const emptyForm = (tingkat: TingkatKelas): PetaKelas & { isNew?: boolean } => ({
    id: '',
    tahunAjaran: efektif,
    tingkat,
    rombel: '',
    waliKelas: '',
    updatedAt: new Date().toISOString(),
    source: 'manual',
    isNew: true,
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (terkunci) {
      toast(`Tahun ${efektif} terkunci arsip — pemetaan tidak dapat diubah.`, 'error');
      return;
    }
    if (!editing.tahunAjaran.trim() || !/^\d{4}\/\d{4}$/.test(editing.tahunAjaran.trim())) {
      toast('Tahun ajaran wajib berformat TAHUN/TAHUN (cth. 2026/2027).', 'error');
      return;
    }
    {
      const tolak = tolakTahun(editing.tahunAjaran.trim());
      if (tolak) {
        toast(tolak, 'error');
        return;
      }
    }
    if (!editing.rombel.trim()) {
      toast('Nama rombel wajib diisi (cth. 8A).', 'error');
      return;
    }
    const duplikat = (peta || []).some(
      (p) =>
        p.id !== editing.id &&
        p.tahunAjaran === editing.tahunAjaran.trim() &&
        p.rombel.trim().toUpperCase() === editing.rombel.trim().toUpperCase()
    );
    if (duplikat) {
      toast(`Rombel ${editing.rombel.trim().toUpperCase()} sudah terdaftar pada ${editing.tahunAjaran.trim()}.`, 'error');
      return;
    }
    setSaving(true);
    startTopProgress();
    try {
      await savePetaKelas(editing);
      toast(`Pemetaan ${editing.rombel.trim().toUpperCase()} (${editing.tahunAjaran.trim()}) tersimpan.`, 'success');
      setEditing(null);
      onDataChanged();
    } catch (err: unknown) {
      toast(`Gagal menyimpan pemetaan: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setSaving(false);
      doneTopProgress();
    }
  };

  const handleDelete = async (p: PetaKelas) => {
    const tolak = tolakTahun(p.tahunAjaran);
    if (tolak) {
      toast(tolak, 'error');
      return;
    }
    const ok = await confirmDialog(`Hapus pemetaan ${p.rombel} (${p.tahunAjaran})?`, {
      confirmLabel: 'Ya, Hapus',
      danger: true,
    });
    if (!ok) return;
    setDeletingId(p.id);
    startTopProgress();
    try {
      await deletePetaKelas(p.id);
      toast(`Pemetaan ${p.rombel} dihapus.`, 'success');
      onDataChanged();
    } catch (err: unknown) {
      toast(`Gagal menghapus: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setDeletingId(null);
      doneTopProgress();
    }
  };

  const handleSalin = async () => {
    const tujuan = tahunBaru.trim();
    if (!tujuan || !/^\d{4}\/\d{4}$/.test(tujuan)) {
      toast('Isi tahun tujuan dengan format TAHUN/TAHUN (cth. 2027/2028).', 'error');
      return;
    }
    if (tahunTerkunci.includes(tujuan)) {
      toast(`Tahun ${tujuan} terkunci arsip — tidak dapat disalin ke sana.`, 'error');
      return;
    }
    {
      const tolak = tolakTahun(tujuan);
      if (tolak) {
        toast(tolak, 'error');
        return;
      }
    }
    const sumber = tahunList.find((t) => t !== tujuan) || '';
    const asal = (peta || []).filter((p) => p.tahunAjaran === (sumber || efektif));
    if (asal.length === 0) {
      toast('Tidak ada baris untuk disalin.', 'warning');
      return;
    }
    const sudahAda = new Set(
      (peta || []).filter((p) => p.tahunAjaran === tujuan).map((p) => p.rombel.trim().toUpperCase())
    );
    const disalin = asal.filter((p) => !sudahAda.has(p.rombel.trim().toUpperCase()));
    if (disalin.length === 0) {
      toast(`Semua rombel sudah terdaftar pada ${tujuan}.`, 'info');
      return;
    }
    const ok = await confirmDialog(
      `Salin ${disalin.length} rombel dari ${sumber || efektif} ke ${tujuan}? Wali kelas ikut disalin dan dapat diubah setelahnya.`,
      { confirmLabel: 'Ya, Salin', danger: false }
    );
    if (!ok) return;
    setWorking('salin');
    startTopProgress();
    try {
      const now = new Date().toISOString();
      const items: PetaKelas[] = disalin.map((p) => ({
        id: `peta-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        tahunAjaran: tujuan,
        tingkat: p.tingkat,
        rombel: p.rombel,
        waliKelas: p.waliKelas,
        updatedAt: now,
        source: 'manual',
      }));
      await savePetaKelasList(items);
      toast(`${items.length} rombel disalin ke ${tujuan}.`, 'success');
      setTahunAktif(tujuan);
      setTahunBaru('');
      onDataChanged();
    } catch (err: unknown) {
      toast(`Gagal menyalin: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setWorking(null);
      doneTopProgress();
    }
  };

  const handleGenerate = async () => {
    if (terkunci) {
      toast(`Tahun ${efektif} terkunci arsip — pemetaan tidak dapat diubah.`, 'error');
      return;
    }
    {
      const tolak = tolakTahun(efektif);
      if (tolak) {
        toast(tolak, 'error');
        return;
      }
    }
    const unik = new Map<string, { tingkat: string; rombel: string }>();
    for (const s of siswa || []) {
      const rawRombel = (s.rombelSaatIni || '').trim();
      if (!rawRombel) continue;
      const rombel = rawRombel.toUpperCase();
      // Dukung "1A", "Kelas 1", "Kelas I", "KELAS V-A", "VII" (umum di Dapodik SD).
      const tingkat = getTingkatDariRombel(rawRombel);
      if (!tingkat) continue;
      if (!unik.has(rombel)) unik.set(rombel, { tingkat, rombel });
    }
    if (unik.size === 0) {
      toast('Tidak ada rombel pada data siswa untuk dibangkitkan.', 'warning');
      return;
    }
    const sudah = new Set(baris.map((p) => p.rombel.toUpperCase()));
    const baru = [...unik.values()].filter((u) => !sudah.has(u.rombel));
    if (baru.length === 0) {
      toast(`Semua ${unik.size} rombel sudah terpetakan pada ${efektif}.`, 'info');
      return;
    }
    setWorking('generate');
    startTopProgress();
    try {
      const now = new Date().toISOString();
      await savePetaKelasList(
        baru.map((u) => ({
          id: `peta-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          tahunAjaran: efektif,
          tingkat: u.tingkat as TingkatKelas,
          rombel: u.rombel,
          waliKelas: '',
          updatedAt: now,
          source: 'generate',
        }))
      );
      toast(`${baru.length} rombel dibangkitkan dari data siswa ke ${efektif}.`, 'success');
      onDataChanged();
    } catch (err: unknown) {
      toast(`Gagal membangkitkan: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setWorking(null);
      doneTopProgress();
    }
  };

  // ---------- Petakan mundur (rekonstruksi kohort) ----------
  // Aturan (SMP, sumber 2026/2027): kelas 9 → 8 (2025/2026) → 7 (2024/2025);
  // kelas 8 → 7 (2025/2026); kelas 7 tidak dipetakan ke mana-mana (di bawah
  // tingkat minimal). Berlaku umum: tingkat - n < minimal (SD 1 / SMP 7) dilewati.
  const tingkatMinimal = jenjang === 'SD' ? 1 : 7;

  const grupSumber = useMemo(
    () => kelompokSumberAktif(siswa, getTingkatDariRombel),
    [siswa]
  );

  const rencanaMundur: {
    valid: boolean;
    alasan: string;
    baru: Array<{ tahun: string; tingkat: string; rombel: string; anggotaIds: string[] }>;
    sudahAda: number;
    terkunciLewat: number;
    bawahMinimal: number;
    tahunKena: string[];
  } = useMemo(() => {
    const gagal = (alasan: string) => ({
      valid: false,
      alasan,
      baru: [] as Array<{ tahun: string; tingkat: string; rombel: string; anggotaIds: string[] }>,
      sudahAda: 0,
      terkunciLewat: 0,
      bawahMinimal: 0,
      tahunKena: [] as string[],
    });
    if (!/^\s*\d{4}\s*\/\s*\d{4}\s*$/.test(efektif || '')) {
      return gagal('Tahun sumber tidak valid.');
    }
    if (grupSumber.size === 0) {
      return gagal('Tidak ada rombel pada data siswa untuk dipetakan mundur.');
    }
    const adaPerTahun = new Map<string, Set<string>>();
    for (const p of peta || []) {
      const t = (p.tahunAjaran || '').trim();
      if (!t) continue;
      if (!adaPerTahun.has(t)) adaPerTahun.set(t, new Set());
      adaPerTahun.get(t)?.add(p.rombel.trim().toUpperCase());
    }
    const baru: Array<{ tahun: string; tingkat: string; rombel: string; anggotaIds: string[] }> = [];
    let sudahAda = 0;
    let terkunciLewat = 0;
    let bawahMinimal = 0;
    const tahunKena: string[] = [];
    for (let n = 1; n <= mundurDalam; n++) {
      const target = mundurTahunAjaran(efektif, n);
      if (!target) continue;
      if (tahunTerkunci.includes(target)) {
        terkunciLewat += grupSumber.size;
        continue;
      }
      tahunKena.push(target);
      const sudah = adaPerTahun.get(target) || new Set<string>();
      for (const [rombel, g] of grupSumber) {
        const tNum = Number(g.tingkat) - n;
        if (!Number.isFinite(tNum) || tNum < tingkatMinimal) {
          bawahMinimal++;
          continue;
        }
        const nama = geserRombelMundur(rombel, g.tingkat, String(tNum));
        if (sudah.has(nama)) {
          sudahAda++;
          continue;
        }
        sudah.add(nama);
        baru.push({ tahun: target, tingkat: String(tNum), rombel: nama, anggotaIds: [...g.ids] });
      }
    }
    return { valid: true, alasan: '', baru, sudahAda, terkunciLewat, bawahMinimal, tahunKena };
  }, [efektif, grupSumber, mundurDalam, peta, tahunTerkunci, tingkatMinimal]);

  const handleTerapkanMundur = async () => {
    if (!rencanaMundur.valid) {
      toast(rencanaMundur.alasan || 'Rencana belum valid.', 'warning');
      return;
    }
    if (rencanaMundur.baru.length === 0) {
      toast('Tidak ada baris baru — semua sudah terpetakan atau di luar aturan.', 'info');
      return;
    }
    // Petakan mundur SELALU dimulai dari sesi aktif (bukan tahun yang sedang dilihat).
    // Tahun target (masa lalu) dikecualikan dari guard kesetaraan sesi — justru
    // harus di bawah sesi. Kunci arsip + hak tahun tetap ditegakkan per target.
    if (sesiEfektif && efektif !== sesiEfektif) {
      toast(`Petakan mundur dimulai dari sesi aktif (TA ${sesiEfektif}). Pindah sesi dulu.`, 'error');
      return;
    }
    for (const t of rencanaMundur.tahunKena) {
      if (tahunTerkunci.includes(t)) {
        toast(`Tahun ${t} terkunci arsip — tidak dapat dipetakan ke sana.`, 'error');
        return;
      }
      if (!canUserAccessTahun(currentUser, t)) {
        toast(`Akses ditolak: akun @${currentUser?.username || '?'} tidak memiliki akses ke tahun ${t}.`, 'error');
        return;
      }
    }
    const ringkas = rencanaMundur.tahunKena
      .map((t) => {
        const jml = rencanaMundur.baru.filter((b) => b.tahun === t).length;
        return `${t} (+${jml})`;
      })
      .join(', ');
    const ok = await confirmDialog(
      `Petakan mundur dari ${efektif} ke ${ringkas} sekaligus mengisi anggota dari roster aktif dan mencap riwayat personal mereka? Wali kelas dikosongkan dan dapat diisi setelahnya.`,
      { confirmLabel: 'Ya, Petakan', danger: false }
    );
    if (!ok) return;
    setWorking('mundur');
    startTopProgress();
    try {
      const now = new Date().toISOString();
      await savePetaKelasList(
        rencanaMundur.baru.map((b) => ({
          id: `peta-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          tahunAjaran: b.tahun,
          tingkat: b.tingkat as TingkatKelas,
          rombel: b.rombel,
          waliKelas: '',
          updatedAt: now,
          source: 'generate' as const,
          anggotaIds: b.anggotaIds,
        }))
      );
      // Cap riwayat personal anggota (agar terlihat pada sesi tahun tsb);
      // lewati yang sudah punya catatan tahun tersebut (data asli menang).
      // Dikelompokkan per siswa dulu agar cap 2 tahun menumpuk dengan benar.
      const olehId = new Map((siswa || []).map((s) => [s.id, s]));
      const perSiswa = new Map<string, { s: Siswa; baris: typeof rencanaMundur.baru }>();
      for (const b of rencanaMundur.baru) {
        for (const id of b.anggotaIds) {
          const s = olehId.get(id);
          if (!s) continue;
          const e = perSiswa.get(id) || { s, baris: [] as typeof rencanaMundur.baru };
          e.baris.push(b);
          perSiswa.set(id, e);
        }
      }
      const finalCap: Siswa[] = [];
      let lewatiCap = 0;
      for (const { s, baris } of perSiswa.values()) {
        let cur: Siswa = s;
        let n = 0;
        for (const b of baris) {
          const h = capRiwayatArsip(cur, b, now);
          if (h) {
            cur = h;
            n++;
          } else {
            lewatiCap++;
          }
        }
        if (n > 0) finalCap.push(cur);
      }
      if (finalCap.length > 0) await saveSiswaBulk(finalCap);
      const info: string[] = [];
      if (rencanaMundur.sudahAda > 0) info.push(`${rencanaMundur.sudahAda} sudah ada (dilewati)`);
      if (rencanaMundur.terkunciLewat > 0) info.push(`${rencanaMundur.terkunciLewat} terkunci (dilewati)`);
      if (rencanaMundur.bawahMinimal > 0) info.push(`${rencanaMundur.bawahMinimal} di bawah tingkat minimal (tidak dipetakan)`);
      if (lewatiCap > 0) info.push(`${lewatiCap} riwayat sudah tercatat (tidak ditimpa)`);
      toast(
        `${rencanaMundur.baru.length} baris dipetakan mundur + ${finalCap.length} riwayat siswa dicap.${info.length > 0 ? ` ${info.join('; ')}.` : ''}`,
        'success'
      );
      const tertua = rencanaMundur.tahunKena
        .filter((t) => rencanaMundur.baru.some((b) => b.tahun === t))
        .sort()
        .shift();
      if (tertua) setTahunAktif(tertua);
      setMundurOpen(false);
      onDataChanged();
    } catch (err: unknown) {
      toast(`Gagal memetakan mundur: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setWorking(null);
      doneTopProgress();
    }
  };

  const handleImporReferensi = async () => {
    if (terkunci) {
      toast(`Tahun ${efektif} terkunci arsip — pemetaan tidak dapat diubah.`, 'error');
      return;
    }
    {
      const tolak = tolakTahun(efektif);
      if (tolak) {
        toast(tolak, 'error');
        return;
      }
    }
    const refs = rombelRefs || [];
    if (refs.length === 0) {
      toast('Tidak ada Data Referensi (Rombel Dapodik) untuk diimpor. Lakukan Sinkron Dapodik dulu.', 'warning');
      return;
    }
    const sudah = new Set(baris.map((p) => p.rombel.trim().toUpperCase()));
    const unik = new Map<string, { tingkat: string; rombel: string; waliKelas: string }>();
    for (const r of refs) {
      const rawRombel = (r.nama || '').trim();
      if (!rawRombel) continue;
      const key = rawRombel.toUpperCase();
      if (sudah.has(key) || unik.has(key)) continue;
      const tingkat = r.tingkat || getTingkatDariRombel(rawRombel);
      if (!tingkat) continue;
      unik.set(key, { tingkat, rombel: key, waliKelas: (r.waliKelas || '').toUpperCase() });
    }
    const baru = [...unik.values()];
    if (baru.length === 0) {
      toast(`Semua ${refs.length} rombel referensi sudah terpetakan pada ${efektif}.`, 'info');
      return;
    }
    const ok = await confirmDialog(
      `Impor ${baru.length} rombel dari Data Referensi ke pemetaan ${efektif}?`,
      { confirmLabel: 'Ya, Impor', danger: false }
    );
    if (!ok) return;
    setWorking('impor');
    startTopProgress();
    try {
      const now = new Date().toISOString();
      await savePetaKelasList(
        baru.map((u) => ({
          id: `peta-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          tahunAjaran: efektif,
          tingkat: u.tingkat as TingkatKelas,
          rombel: u.rombel,
          waliKelas: u.waliKelas || '',
          updatedAt: now,
          source: 'generate' as const,
        }))
      );
      toast(`${baru.length} rombel diimpor dari Data Referensi ke ${efektif}.`, 'success');
      onDataChanged();
    } catch (err: unknown) {
      toast(`Gagal mengimpor: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setWorking(null);
      doneTopProgress();
    }
  };

  const entriTerpilih = kelasTerpilih === '__UNMAPPED__'
    ? null
    : (baris.find((p) => p.id === kelasTerpilih) || null);
  const rombelTerpilih = kelasTerpilih === '__UNMAPPED__'
    ? ''
    : (entriTerpilih?.rombel || '').toUpperCase();

  const rombelTerpetakan = useMemo(
    () => new Set(baris.map((p) => p.rombel.trim().toUpperCase())),
    [baris]
  );

  /** Tahun aktif sekolah — baris tahun lain = arsip (anggota via anggotaIds). */
  const tahunAktifSekolah = (sekolah.tahunAjaran || sessionTahun || '').trim();
  const modeArsip = !!entriTerpilih && !!tahunAktifSekolah && entriTerpilih.tahunAjaran !== tahunAktifSekolah;

  /** Anggota arsip: resolve anggotaIds ke data siswa (boleh non-aktif). */
  const anggotaArsip = useMemo(() => {
    if (!modeArsip || !entriTerpilih) return [];
    const ids = new Set(entriTerpilih.anggotaIds || []);
    const q = cariSiswa.trim().toLowerCase();
    return (siswa || [])
      .filter((s) => {
        if (!ids.has(s.id)) return false;
        if (!q) return true;
        return (
          s.namaLengkap.toLowerCase().includes(q) ||
          (s.nisn || '').includes(q) ||
          (s.nipd || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.namaLengkap.localeCompare(b.namaLengkap));
  }, [modeArsip, entriTerpilih, siswa, cariSiswa]);

  /** Kandidat tambah arsip: siswa aktif yang belum menjadi anggota. */
  const kandidatTambah = useMemo(() => {
    if (!modeArsip || !entriTerpilih) return [];
    const ids = new Set(entriTerpilih.anggotaIds || []);
    const q = tambahCari.trim().toLowerCase();
    return (siswa || [])
      .filter((s) => {
        if (s.statusSiswa !== 'Aktif' || ids.has(s.id)) return false;
        if (!q) return true;
        return (
          s.namaLengkap.toLowerCase().includes(q) ||
          (s.nisn || '').includes(q) ||
          (s.rombelSaatIni || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.namaLengkap.localeCompare(b.namaLengkap))
      .slice(0, 30);
  }, [modeArsip, entriTerpilih, siswa, tambahCari]);

  /** Siswa aktif pada kelas terpilih (mode live: cocok rombelSaatIni). */
  const anggotaKelas = useMemo(() => {
    if (!kelasTerpilih) return [];
    const q = cariSiswa.trim().toLowerCase();
    const list = (siswa || []).filter((s) => {
      if (s.statusSiswa !== 'Aktif') return false;
      const r = (s.rombelSaatIni || '').trim().toUpperCase();
      const cocok = kelasTerpilih === '__UNMAPPED__' ? !rombelTerpetakan.has(r) : r === rombelTerpilih;
      if (!cocok) return false;
      if (!q) return true;
      return (
        s.namaLengkap.toLowerCase().includes(q) ||
        (s.nisn || '').includes(q) ||
        (s.nipd || '').toLowerCase().includes(q)
      );
    });
    return list.sort((a, b) => a.namaLengkap.localeCompare(b.namaLengkap));
  }, [kelasTerpilih, siswa, cariSiswa, rombelTerpetakan, rombelTerpilih]);

  const jumlahTakTerpetakan = useMemo(
    () =>
      (siswa || []).filter(
        (s) =>
          s.statusSiswa === 'Aktif' &&
          !rombelTerpetakan.has((s.rombelSaatIni || '').trim().toUpperCase())
      ).length,
    [siswa, rombelTerpetakan]
  );

  /** Daftar tampil tabel panel: arsip (anggotaIds) vs live (rombelSaatIni). */
  const daftarTampil =
    modeArsip && kelasTerpilih !== '__UNMAPPED__' ? anggotaArsip : anggotaKelas;

  const pilihKelas = (id: string | null) => {
    setKelasTerpilih((prev) => (prev === id ? null : id));
    setCariSiswa('');
    setSiswaDipilih([]);
    setTargetPindah('');
    setTambahCari('');
  };

  const toggleSiswa = (id: string) => {
    setSiswaDipilih((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handlePindah = async () => {
    const tujuan = targetPindah.trim().toUpperCase();
    if (siswaDipilih.length === 0) {
      toast('Pilih minimal satu siswa untuk dipindahkan.', 'warning');
      return;
    }
    if (!tujuan) {
      toast('Pilih kelas tujuan terlebih dahulu.', 'error');
      return;
    }
    if (tahunTerkunci.includes(efektif)) {
      toast(`Tahun ${efektif} terkunci arsip — siswa tidak dapat dipindahkan.`, 'error');
      return;
    }
    {
      const tolak = tolakTahun(efektif);
      if (tolak) {
        toast(tolak, 'error');
        return;
      }
    }
    const ok = await confirmDialog(
      `Pindahkan ${siswaDipilih.length} siswa ke kelas ${tujuan} (${efektif})? Rombel saat ini akan diperbarui.`,
      { confirmLabel: 'Ya, Pindahkan', danger: false }
    );
    if (!ok) return;
    setMoving(true);
    startTopProgress();
    let pindah = 0;
    let ditahan = 0;
    try {
      for (const id of siswaDipilih) {
        const s = (siswa || []).find((x) => x.id === id);
        if (!s) continue;
        const tahunLama = (getTahunAjaranTerakhirSiswa(s) || '').trim();
        if (tahunLama && tahunTerkunci.includes(tahunLama)) {
          ditahan++;
          continue;
        }
        await saveSiswa({ ...s, rombelSaatIni: tujuan, updatedAt: new Date().toISOString() });
        pindah++;
      }
      toast(
        `${pindah} siswa dipindahkan ke ${tujuan}.${ditahan > 0 ? ` ${ditahan} dilewati (tahun terakhir terkunci).` : ''}`,
        pindah > 0 ? 'success' : 'warning'
      );
      setSiswaDipilih([]);
      onDataChanged();
    } catch (err: unknown) {
      toast(`Gagal memindahkan: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setMoving(false);
      doneTopProgress();
    }
  };

  /** Simpan daftar anggota arsip (tanpa menyentuh rombelSaatIni siswa). */
  const simpanAnggotaArsip = async (ids: string[], pesan: string) => {
    if (!entriTerpilih) return;
    if (tahunTerkunci.includes(entriTerpilih.tahunAjaran)) {
      toast(`Tahun ${entriTerpilih.tahunAjaran} terkunci arsip — anggota tidak dapat diubah.`, 'error');
      return;
    }
    {
      const tolak = tolakTahun(entriTerpilih.tahunAjaran);
      if (tolak) {
        toast(tolak, 'error');
        return;
      }
    }
    setSavingAnggota(true);
    startTopProgress();
    try {
      await savePetaKelas({
        ...entriTerpilih,
        anggotaIds: ids,
        updatedAt: new Date().toISOString(),
      });
      toast(pesan, 'success');
      onDataChanged();
    } catch (err: unknown) {
      toast(`Gagal menyimpan anggota: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setSavingAnggota(false);
      doneTopProgress();
    }
  };

  const handleTambahAnggota = async (id: string) => {
    if (!entriTerpilih) return;
    const ids = entriTerpilih.anggotaIds || [];
    if (ids.includes(id)) return;
    const s = (siswa || []).find((x) => x.id === id);
    // Konsisten dua arah: anggota arsip juga dicap di record pribadi
    // (bila belum tercatat) agar terlihat pada sesi tahun tsb.
    const cap = s
      ? capRiwayatArsip(s, { tahun: entriTerpilih.tahunAjaran, tingkat: entriTerpilih.tingkat, rombel: entriTerpilih.rombel }, new Date().toISOString())
      : null;
    if (cap) {
      try {
        await saveSiswaBulk([cap]);
      } catch {
        /* lanjut — daftar kelas tetap disimpan */
      }
    }
    await simpanAnggotaArsip(
      [...ids, id],
      `"${s?.namaLengkap || 'Siswa'}" ditambahkan ke arsip ${entriTerpilih.rombel} • ${entriTerpilih.tahunAjaran}${cap ? ' + riwayat dicap' : ''}.`
    );
  };

  const handleKeluarkanAnggota = async () => {
    if (!entriTerpilih) return;
    if (siswaDipilih.length === 0) {
      toast('Pilih minimal satu anggota untuk dikeluarkan.', 'warning');
      return;
    }
    // Konsisten dua arah: cap rekonstruksi tahun ini dibuang dari record
    // pribadi (catatan asli seperti raport tak pernah disentuh). Tanpa ini
    // siswa tetap terlihat pada sesi tahun tsb walau sudah dikeluarkan.
    const olehId = new Map((siswa || []).map((x) => [x.id, x]));
    const bersih: Siswa[] = [];
    for (const id of siswaDipilih) {
      const hasil = buangCapArsip(olehId.get(id), entriTerpilih.tahunAjaran);
      if (hasil) bersih.push(hasil);
    }
    if (bersih.length > 0) {
      try {
        await saveSiswaBulk(bersih);
      } catch {
        /* lanjut — daftar kelas tetap disimpan */
      }
    }
    const buang = new Set(siswaDipilih);
    const sisa = (entriTerpilih.anggotaIds || []).filter((id) => !buang.has(id));
    const n = siswaDipilih.length;
    setSiswaDipilih([]);
    await simpanAnggotaArsip(
      sisa,
      `${n} anggota dikeluarkan dari arsip ${entriTerpilih.rombel} • ${entriTerpilih.tahunAjaran}${bersih.length > 0 ? ` + ${bersih.length} cap rekonstruksi dibersihkan` : ''}.`
    );
  };

  return (
    <div className="space-y-4">
      {/* Toolbar tahun */}
      <div className="ui-card p-4 anim-fade-up">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-700">
            <CalendarRange className="w-4 h-4 text-blue-700" />
            Tahun Ajaran
          </span>
          {sessionTahun && (
            <span className="text-[11px] font-mono font-extrabold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
              Sesi {sessionTahun}
            </span>
          )}
          <div className="flex flex-wrap gap-1.5">
            {tahunList.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTahunAktif(t)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition cursor-pointer ${
                  t === efektif ? 'bg-navy-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t}
                {tahunTerkunci.includes(t) ? ' 🔒' : ''}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <input
              value={tahunBaru}
              onChange={(e) => setTahunBaru(e.target.value)}
              placeholder="2027/2028"
              className="ui-input !w-32 font-mono"
              aria-label="Tahun tujuan penyalinan"
            />
            <button
              type="button"
              disabled={working === 'salin'}
              onClick={() => void handleSalin()}
              className="ui-btn ui-btn-outline disabled:opacity-50"
              title="Salin pemetaan tahun lain ke tahun tujuan"
            >
              <Copy className="w-3.5 h-3.5" />
              Salin ke tahun
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(rombelRefs || []).length > 0 && (
            <button
              type="button"
              disabled={terkunci || working === 'impor'}
              onClick={() => void handleImporReferensi()}
              className="ui-btn ui-btn-outline disabled:opacity-50"
              title="Buat baris dari Data Referensi (Rombel hasil Sinkron Dapodik)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              {working === 'impor' ? 'Mengimpor…' : `Impor dari Data Referensi (${(rombelRefs || []).length} rombel)`}
            </button>
          )}
          <button
            type="button"
            disabled={terkunci || working === 'generate'}
            onClick={() => void handleGenerate()}
            className="ui-btn ui-btn-outline disabled:opacity-50"
            title="Buat baris dari rombel yang ada pada data siswa"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {working === 'generate' ? 'Membangkitkan…' : `Bangkitkan dari data siswa (${efektif})`}
          </button>
          <button
            type="button"
            onClick={() => setMundurOpen((v) => !v)}
            className="ui-btn ui-btn-outline"
            title="Rekonstruksi kohort: petakan roster tahun ini ke tahun-tahun sebelumnya (9→8→7)"
          >
            <History className="w-3.5 h-3.5" />
            Petakan Mundur
          </button>
          <button
            type="button"
            disabled={terkunci}
            onClick={() => setEditing(emptyForm((tingkatOptions[0] || '7') as TingkatKelas))}
            className="ui-btn ui-btn-primary disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            Tambah Kelas
          </button>
          {terkunci && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-1.5">
              Tahun {efektif} terkunci arsip — pemetaan tidak dapat diubah.
            </span>
          )}
        </div>
      </div>

      {/* Panel petakan mundur (rekonstruksi kohort) */}
      {mundurOpen && (
        <div className="ui-card p-4 anim-fade-up space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-600" />
              Petakan Mundur dari {efektif}
            </h3>
            <span className="text-[11px] text-slate-500">
              Kelas 9 → 8 → 7 • kelas 8 → 7 • kelas 7 stop (huruf rombel dipertahankan: 9A→8A→7A; angka = jumlah anggota terisi otomatis)
            </span>
            {sesiEfektif && efektif !== sesiEfektif && (
              <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5">
                Sumber tahun yang dilihat ({efektif}) bukan sesi aktif (TA {sesiEfektif}) — pindah sesi dulu untuk menerapkan.
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <label className="text-[11px] font-bold text-slate-600" htmlFor="mundur-dalam">Mundur</label>
              <select
                id="mundur-dalam"
                value={mundurDalam}
                onChange={(e) => setMundurDalam(Number(e.target.value) as 1 | 2 | 3)}
                className="ui-input !w-auto !py-1.5"
              >
                <option value={1}>1 tahun</option>
                <option value={2}>2 tahun</option>
                <option value={3}>3 tahun</option>
              </select>
            </div>
          </div>

          {!rencanaMundur.valid ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              {rencanaMundur.alasan}
            </p>
          ) : rencanaMundur.baru.length === 0 ? (
            <p className="text-xs text-slate-500 italic">
              Tidak ada baris baru untuk dibuat
              {rencanaMundur.sudahAda > 0 && ` (${rencanaMundur.sudahAda} sudah ada)`}
              {rencanaMundur.terkunciLewat > 0 && ` (${rencanaMundur.terkunciLewat} tahun terkunci)`}
              {rencanaMundur.bawahMinimal > 0 && ` (${rencanaMundur.bawahMinimal} di bawah tingkat minimal)`}.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {rencanaMundur.baru
                  .sort((a, b) => a.tahun.localeCompare(b.tahun) || a.tingkat.localeCompare(b.tingkat) || a.rombel.localeCompare(b.rombel))
                  .map((b, i) => (
                    <span key={`${b.tahun}-${b.rombel}-${i}`} className="ui-badge ui-badge-indigo font-mono">
                      {b.tahun} • K{b.tingkat} • {b.rombel} ({b.anggotaIds.length})
                    </span>
                  ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={working === 'mundur'}
                  onClick={() => void handleTerapkanMundur()}
                  className="ui-btn ui-btn-primary disabled:opacity-50"
                >
                  {working === 'mundur' ? 'Memetakan…' : `Terapkan ${rencanaMundur.baru.length} baris`}
                </button>
                <button type="button" onClick={() => setMundurOpen(false)} className="ui-btn ui-btn-ghost">
                  Tutup
                </button>
                {(rencanaMundur.sudahAda > 0 || rencanaMundur.terkunciLewat > 0 || rencanaMundur.bawahMinimal > 0) && (
                  <span className="text-[11px] text-slate-500">
                    Dilewati: {[
                      rencanaMundur.sudahAda > 0 ? `${rencanaMundur.sudahAda} sudah ada` : '',
                      rencanaMundur.terkunciLewat > 0 ? `${rencanaMundur.terkunciLewat} terkunci` : '',
                      rencanaMundur.bawahMinimal > 0 ? `${rencanaMundur.bawahMinimal} di bawah minimal` : '',
                    ].filter(Boolean).join(' • ')}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Tabel pemetaan */}
      <div className="ui-card overflow-hidden anim-fade-up">
        {baris.length === 0 ? (
          <p className="p-8 text-center text-xs text-slate-400 italic">
            Belum ada pemetaan kelas untuk {efektif}. Tambah manual, salin dari tahun lain, impor dari Data Referensi, bangkitkan dari data siswa, atau petakan mundur untuk rekonstruksi kohort.
          </p>
        ) : (
          <div className="ui-table-wrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th className="w-12 text-center">No</th>
                  <th className="text-center">Tingkat</th>
                  <th>Rombel</th>
                  <th>Wali Kelas</th>
                  <th className="text-center">Sumber</th>
                  <th className="text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {jumlahTakTerpetakan > 0 && (
                  <tr
                    onClick={() => pilihKelas('__UNMAPPED__')}
                    className={`cursor-pointer transition ${
                      kelasTerpilih === '__UNMAPPED__' ? 'bg-amber-50' : 'hover:bg-amber-50/50'
                    }`}
                    title="Tampilkan siswa di luar pemetaan tahun ini"
                  >
                    <td className="text-center text-slate-400 font-mono text-[11px]">!</td>
                    <td className="text-center font-bold">—</td>
                    <td>
                      <span className="ui-badge ui-badge-amber">Di luar pemetaan</span>
                    </td>
                    <td className="font-mono text-xs">{jumlahTakTerpetakan} siswa</td>
                    <td className="text-center">—</td>
                    <td className="text-center text-[11px] text-slate-400">Klik untuk pilih</td>
                  </tr>
                )}
                {baris.map((p, i) => (
                  <tr
                    key={p.id}
                    onClick={() => pilihKelas(p.id)}
                    className={`cursor-pointer transition ${
                      kelasTerpilih === p.id ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                    }`}
                    title={`Tampilkan siswa kelas ${p.rombel}`}
                  >
                    <td className="text-center text-slate-400 font-mono text-[11px]">{i + 1}</td>
                    <td className="text-center font-bold">Kelas {p.tingkat}</td>
                    <td>
                      <span className="ui-badge ui-badge-indigo">{p.rombel}</span>
                    </td>
                    <td className="font-semibold text-xs">{p.waliKelas || '-'}</td>
                    <td className="text-center">
                      <span className={`ui-badge ${p.source === 'manual' ? 'ui-badge-blue' : 'ui-badge-slate'}`}>
                        {p.source === 'manual' ? 'Manual' : 'Generate'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          disabled={terkunci}
                          onClick={() => setEditing({ ...p })}
                          title="Ubah"
                          className="ui-btn ui-btn-ghost ui-btn-icon !text-slate-500 hover:!text-amber-700 disabled:opacity-40"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={terkunci || deletingId === p.id}
                          onClick={() => void handleDelete(p)}
                          title="Hapus"
                          className="ui-btn ui-btn-ghost ui-btn-icon !text-slate-400 hover:!text-rose-600 disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Panel siswa kelas terpilih */}
      {kelasTerpilih && (
        <div className="ui-card p-4 anim-fade-up space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-700" />
              {kelasTerpilih === '__UNMAPPED__' ? (
                <>Siswa di luar pemetaan {efektif} ({anggotaKelas.length})</>
              ) : modeArsip ? (
                <>Arsip {rombelTerpilih} • {entriTerpilih?.tahunAjaran} ({anggotaArsip.length}) <span className="ui-badge ui-badge-amber">Arsip</span></>
              ) : (
                <>Siswa kelas {rombelTerpilih} • {efektif} ({anggotaKelas.length})</>
              )}
            </h3>
            <button type="button" onClick={() => pilihKelas(null)} className="ui-btn ui-btn-ghost !py-1.5">
              <X className="w-3.5 h-3.5" />
              Tutup
            </button>
          </div>

          {modeArsip && (
            <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              Tahun arsip — tambah/keluarkan anggota hanya mengubah daftar kelas ini, <strong>tidak</strong> mengubah rombel aktif siswa.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-48">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                value={cariSiswa}
                onChange={(e) => setCariSiswa(e.target.value)}
                placeholder="Cari nama / NISN / NIPD…"
                className="ui-input !pl-8 !py-1.5"
                aria-label="Cari siswa kelas terpilih"
              />
            </div>
            {!modeArsip && kelasTerpilih !== '__UNMAPPED__' && (
              <>
                <select
                  value={targetPindah}
                  onChange={(e) => setTargetPindah(e.target.value)}
                  className="ui-input !w-auto"
                  aria-label="Kelas tujuan pindahan"
                >
                  <option value="">— Kelas tujuan —</option>
                  {baris
                    .filter((p) => p.rombel.toUpperCase() !== rombelTerpilih)
                    .map((p) => (
                      <option key={p.id} value={p.rombel}>
                        {p.rombel}{p.waliKelas ? ` • ${p.waliKelas}` : ''}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  disabled={moving || siswaDipilih.length === 0 || terkunci}
                  onClick={() => void handlePindah()}
                  className="ui-btn ui-btn-primary disabled:opacity-50"
                  title="Pindahkan siswa terpilih ke kelas tujuan"
                >
                  {moving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRightLeft className="w-3.5 h-3.5" />}
                  {moving ? 'Memindahkan…' : `Pindahkan (${siswaDipilih.length})`}
                </button>
              </>
            )}
            {modeArsip && (
              <button
                type="button"
                disabled={savingAnggota || siswaDipilih.length === 0}
                onClick={() => void handleKeluarkanAnggota()}
                className="ui-btn ui-btn-outline disabled:opacity-50"
                title="Keluarkan anggota terpilih dari arsip kelas ini"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {savingAnggota ? 'Menyimpan…' : `Keluarkan (${siswaDipilih.length})`}
              </button>
            )}
          </div>

          {modeArsip && (
            <div className="border border-dashed border-slate-300 rounded-xl p-3 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  value={tambahCari}
                  onChange={(e) => setTambahCari(e.target.value)}
                  placeholder="Tambah anggota: cari nama / NISN / rombel aktif…"
                  className="ui-input !pl-8 !py-1.5"
                  aria-label="Cari siswa untuk ditambahkan ke arsip"
                />
              </div>
              {kandidatTambah.length > 0 && (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {kandidatTambah.map((s) => (
                    <div key={s.id} className="px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-slate-50">
                      <span className="text-xs">
                        <strong>{s.namaLengkap}</strong>{' '}
                        <span className="font-mono text-slate-500">{s.nisn || '-'} • {s.rombelSaatIni || '-'}</span>
                      </span>
                      <button
                        type="button"
                        disabled={savingAnggota}
                        onClick={() => void handleTambahAnggota(s.id)}
                        className="ui-btn ui-btn-ghost !py-1 !px-2 text-emerald-700 disabled:opacity-50"
                        title={`Tambahkan ${s.namaLengkap} ke arsip`}
                      >
                        <Plus className="w-3.5 h-3.5" /> Tambah
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {daftarTampil.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400 italic">
              {cariSiswa ? 'Tidak ada siswa yang cocok dengan pencarian.' : modeArsip ? 'Arsip kelas ini belum berisi anggota.' : 'Belum ada siswa aktif pada kelas ini.'}
            </p>
          ) : (
            <div className="ui-table-wrap max-h-80 overflow-y-auto">
              <table className="ui-table">
                <thead className="sticky top-0">
                  <tr>
                    <th className="w-10 text-center">
                      <input
                        type="checkbox"
                        checked={siswaDipilih.length > 0 && siswaDipilih.length === daftarTampil.length}
                        onChange={() =>
                          setSiswaDipilih((prev) =>
                            prev.length === daftarTampil.length ? [] : daftarTampil.map((s) => s.id)
                          )
                        }
                        aria-label="Pilih semua siswa"
                        className="rounded border-slate-300"
                      />
                    </th>
                    <th>Nama</th>
                    <th>NISN</th>
                    <th>NIPD</th>
                    <th>Rombel saat ini</th>
                  </tr>
                </thead>
                <tbody>
                  {daftarTampil.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => toggleSiswa(s.id)}
                      className={`cursor-pointer ${siswaDipilih.includes(s.id) ? 'bg-blue-50/60' : ''}`}
                    >
                      <td className="text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={siswaDipilih.includes(s.id)}
                          onChange={() => toggleSiswa(s.id)}
                          aria-label={`Pilih ${s.namaLengkap}`}
                          className="rounded border-slate-300"
                        />
                      </td>
                      <td className="font-bold text-slate-900 text-xs">{s.namaLengkap}</td>
                      <td className="font-mono text-xs">{s.nisn || '-'}</td>
                      <td className="font-mono text-xs">{s.nipd || '-'}</td>
                      <td>
                        <span className="ui-badge ui-badge-indigo">{s.rombelSaatIni || '-'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal tambah/ubah */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <form
            onSubmit={handleSave}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-blue-700" />
                {editing.isNew ? 'Tambah Kelas' : `Ubah ${editing.rombel}`}
              </h3>
              <button type="button" onClick={() => setEditing(null)} className="p-1.5 rounded-lg hover:bg-slate-100 transition" aria-label="Tutup form">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="ui-label" htmlFor="peta-tahun">Tahun ajaran *</label>
                <input
                  id="peta-tahun"
                  value={editing.tahunAjaran}
                  onChange={(e) => setEditing({ ...editing, tahunAjaran: e.target.value })}
                  placeholder="2026/2027"
                  required
                  pattern="\d{4}/\d{4}"
                  className="ui-input font-mono"
                />
              </div>
              <div>
                <label className="ui-label" htmlFor="peta-tingkat">Tingkat *</label>
                <select
                  id="peta-tingkat"
                  value={editing.tingkat}
                  onChange={(e) => setEditing({ ...editing, tingkat: e.target.value as TingkatKelas })}
                  className="ui-input"
                >
                  {tingkatOptions.map((t) => (
                    <option key={t} value={t}>Kelas {t}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="ui-label" htmlFor="peta-rombel">Rombel *</label>
              <input
                id="peta-rombel"
                value={editing.rombel}
                onChange={(e) => setEditing({ ...editing, rombel: e.target.value.toUpperCase() })}
                placeholder="cth. 8A"
                required
                className="ui-input font-mono uppercase"
              />
            </div>
            <div>
              <label className="ui-label" htmlFor="peta-wali">Wali kelas (dari data GTK)</label>
              <GtkAutocomplete
                id="peta-wali"
                value={editing.waliKelas || ''}
                ptk={ptk}
                placeholder="cth. SITI RAHMAWATI, S.Pd."
                onChange={(v) => setEditing({ ...editing, waliKelas: v.toUpperCase() })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setEditing(null)} className="ui-btn ui-btn-ghost">Batal</button>
              <button type="submit" disabled={saving} className="ui-btn ui-btn-primary disabled:opacity-50">
                <Save className="w-3.5 h-3.5" /> {saving ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
