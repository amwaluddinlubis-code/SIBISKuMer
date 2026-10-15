import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Plus,
  Search,
  CheckCircle2,
  Pencil,
  Trash2,
  Ban,
  RotateCcw,
  ArrowUpRight,
  BellRing,
  Settings2,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { AppUser, PengaturanPengingat, TugasKategori, TugasTabTujuan, TugasTenggat } from '../types';
import {
  bacaPengaturanPengingat,
  deleteTenggat,
  getAllTenggat,
  getAllUsers,
  saveTenggat,
  simpanPengaturanPengingat,
} from '../utils/db';
import { catatAudit } from '../utils/audit';
import { toast, confirmDialog } from '../utils/notify';
import {
  TENGGAT_HARI_SEBELUM_PILIHAN,
  TENGGAT_KATEGORI,
  TENGGAT_KATEGORI_LABEL,
  TENGGAT_TAB_TUJUAN,
  isZonaWaktuValid,
  ringkasanTenggat,
  statusTurunan,
  tanggalDiZonaWaktu,
  urutkanTenggat,
  validasiTenggat,
  type StatusTenggatTurunan,
} from '../utils/tenggat';

interface KalenderTenggatViewProps {
  currentUser: AppUser | null;
  isAdmin: boolean;
  onNavigate: (tab: string) => void;
}

const TAB_LABEL: Record<TugasTabTujuan, string> = {
  dasbor: 'Dasbor',
  siswa: 'Master Siswa',
  raport: 'Nilai Raport',
  leger: 'Leger Nilai',
  dapodik: 'Sinkron Dapodik',
  rekap: 'Rekapitulasi',
  cetak: 'Cetak Lembar Induk',
  referensi: 'Data Referensi',
  gtk: 'Data GTK',
  arsip: 'Arsip Tahun Ajaran',
  pemetaan: 'Pemetaan Kelas',
  pengaturan: 'Profil Sekolah',
  users: 'Manajemen Pengguna',
  backup: 'Backup & Restore',
  audit: 'Log Audit',
  kalender: 'Kalender & Tenggat',
};

const STATUS_LABEL: Record<StatusTenggatTurunan, string> = {
  selesai: 'Selesai',
  dibatalkan: 'Dibatalkan',
  terlambat: 'Terlambat',
  'hari-ini': 'Jatuh tempo hari ini',
  besok: 'Jatuh tempo besok',
  mendatang: 'Mendatang',
};

const STATUS_BADGE: Record<StatusTenggatTurunan, string> = {
  selesai: 'ui-badge-emerald',
  dibatalkan: 'ui-badge-slate',
  terlambat: 'ui-badge-rose',
  'hari-ini': 'ui-badge-amber',
  besok: 'ui-badge-indigo',
  mendatang: 'ui-badge-blue',
};

const PRIORITAS_LABEL: Record<number, string> = { 1: 'Rendah', 2: 'Normal', 3: 'Tinggi' };

const ZONA_WAKTU_PILIHAN = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'Asia/Singapore', 'Asia/Kuala_Lumpur', 'UTC'];

interface FormState {
  judul: string;
  deskripsi: string;
  kategori: TugasKategori;
  prioritas: 1 | 2 | 3;
  tanggalJatuhTempo: string;
  penanggungJawab: string;
  tautanTab: '' | TugasTabTujuan;
  tautanLabel: string;
}

const FORM_KOSONG: FormState = {
  judul: '',
  deskripsi: '',
  kategori: 'administrasi',
  prioritas: 2,
  tanggalJatuhTempo: '',
  penanggungJawab: '',
  tautanTab: '',
  tautanLabel: '',
};

function idBaru(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `tenggat-${crypto.randomUUID()}`;
  } catch {
    /* fallback */
  }
  return `tenggat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function namaHariSingkat(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('id-ID', { weekday: 'short', timeZone: 'UTC' });
}

export const KalenderTenggatView: React.FC<KalenderTenggatViewProps> = ({ currentUser, isAdmin, onNavigate }) => {
  const [daftar, setDaftar] = useState<TugasTenggat[]>([]);
  const [pengguna, setPengguna] = useState<AppUser[]>([]);
  const [pengaturan, setPengaturan] = useState<PengaturanPengingat>(() => bacaPengaturanPengingat());
  const [memuat, setMemuat] = useState(true);
  const [cari, setCari] = useState('');
  const [filterStatus, setFilterStatus] = useState<'semua' | 'terbuka' | 'terlambat' | 'selesai' | 'dibatalkan'>('semua');
  const [filterKategori, setFilterKategori] = useState<'semua' | TugasKategori>('semua');
  const [filterPj, setFilterPj] = useState<string>('semua');
  const [hariTerpilih, setHariTerpilih] = useState<string | null>(null);
  const [bulanTampil, setBulanTampil] = useState(() => {
    const now = new Date();
    return { tahun: now.getFullYear(), bulan: now.getMonth() + 1 };
  });
  const [formTerbuka, setFormTerbuka] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(FORM_KOSONG);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [menyimpan, setMenyimpan] = useState(false);
  const [pengaturanTerbuka, setPengaturanTerbuka] = useState(false);
  const [zonaInput, setZonaInput] = useState(pengaturan.zonaWaktu);
  const [hariSebelumDraft, setHariSebelumDraft] = useState<number[]>(pengaturan.hariSebelum);
  const [pengingatAktifDraft, setPengingatAktifDraft] = useState(pengaturan.aktif);
  const [terlambatHarianDraft, setTerlambatHarianDraft] = useState(pengaturan.pengingatTerlambatHarian);
  const [menyimpanPengaturan, setMenyimpanPengaturan] = useState(false);

  const hariIni = useMemo(() => tanggalDiZonaWaktu(pengaturan.zonaWaktu), [pengaturan.zonaWaktu]);
  const ringkasan = useMemo(() => ringkasanTenggat(daftar, hariIni), [daftar, hariIni]);

  const muat = async () => {
    setMemuat(true);
    try {
      const [t, u] = await Promise.all([getAllTenggat(), getAllUsers().catch(() => [])]);
      setDaftar(t);
      setPengguna(u.filter((x) => x.status === 'aktif'));
    } catch {
      toast('Gagal memuat daftar tenggat.', 'error');
    } finally {
      setMemuat(false);
    }
  };

  useEffect(() => {
    void muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const namaPengguna = (username?: string): string => {
    if (!username) return 'Belum ditentukan';
    return pengguna.find((u) => u.username === username)?.namaLengkap || username;
  };

  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const list = daftar.filter((t) => {
      if (hariTerpilih && t.tanggalJatuhTempo !== hariTerpilih) return false;
      if (filterKategori !== 'semua' && t.kategori !== filterKategori) return false;
      if (filterPj !== 'semua' && (t.penanggungJawab || '') !== filterPj) return false;
      if (filterStatus === 'terbuka' && t.status !== 'terbuka') return false;
      if (filterStatus === 'terlambat' && statusTurunan(t, hariIni) !== 'terlambat') return false;
      if (filterStatus === 'selesai' && t.status !== 'selesai') return false;
      if (filterStatus === 'dibatalkan' && t.status !== 'dibatalkan') return false;
      if (q && !`${t.judul} ${t.deskripsi || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return urutkanTenggat(list, hariIni);
  }, [daftar, cari, filterStatus, filterKategori, filterPj, hariTerpilih, hariIni]);

  // Sel kalender: tugas terbuka per tanggal (maks 2 judul + hitungan sisa).
  const tugasPerTanggal = useMemo(() => {
    const map = new Map<string, TugasTenggat[]>();
    for (const t of daftar) {
      if (t.status !== 'terbuka') continue;
      const arr = map.get(t.tanggalJatuhTempo) || [];
      arr.push(t);
      map.set(t.tanggalJatuhTempo, arr);
    }
    return map;
  }, [daftar]);

  const selKalender = useMemo(() => {
    const { tahun, bulan } = bulanTampil;
    const hariPertama = new Date(Date.UTC(tahun, bulan - 1, 1));
    // Senin = kolom pertama (getUTCDay: 0=Minggu).
    const offset = (hariPertama.getUTCDay() + 6) % 7;
    const jumlahHari = new Date(Date.UTC(tahun, bulan, 0)).getUTCDate();
    const sel: Array<{ iso: string; hari: number; diBulanIni: boolean }> = [];
    const pad = (n: number) => String(n).padStart(2, '0');
    for (let i = 0; i < offset; i++) sel.push({ iso: '', hari: 0, diBulanIni: false });
    for (let d = 1; d <= jumlahHari; d++) {
      sel.push({ iso: `${tahun}-${pad(bulan)}-${pad(d)}`, hari: d, diBulanIni: true });
    }
    while (sel.length % 7 !== 0) sel.push({ iso: '', hari: 0, diBulanIni: false });
    return sel;
  }, [bulanTampil]);

  const geserBulan = (delta: number) => {
    setBulanTampil((b) => {
      const total = (b.tahun * 12 + (b.bulan - 1) + delta);
      return { tahun: Math.floor(total / 12), bulan: (total % 12) + 1 };
    });
  };

  const bukaFormBaru = () => {
    setEditingId(null);
    setForm({ ...FORM_KOSONG, tanggalJatuhTempo: hariTerpilih || hariIni });
    setFormErrors({});
    setFormTerbuka(true);
  };

  const bukaFormUbah = (t: TugasTenggat) => {
    setEditingId(t.id);
    setForm({
      judul: t.judul,
      deskripsi: t.deskripsi || '',
      kategori: t.kategori,
      prioritas: t.prioritas,
      tanggalJatuhTempo: t.tanggalJatuhTempo,
      penanggungJawab: t.penanggungJawab || '',
      tautanTab: t.tautanTindakan?.tab || '',
      tautanLabel: t.tautanTindakan?.label || '',
    });
    setFormErrors({});
    setFormTerbuka(true);
  };

  const simpanForm = async () => {
    const kandidat: Partial<TugasTenggat> = {
      judul: form.judul.trim(),
      deskripsi: form.deskripsi.trim() || undefined,
      kategori: form.kategori,
      prioritas: form.prioritas,
      tanggalJatuhTempo: form.tanggalJatuhTempo,
      penanggungJawab: form.penanggungJawab || undefined,
      tautanTindakan: form.tautanTab ? { tab: form.tautanTab, label: form.tautanLabel.trim() || undefined } : null,
    };
    const errs = validasiTenggat(kandidat);
    const peta: Record<string, string> = {};
    for (const e of errs) peta[e.field] = e.message;
    setFormErrors(peta);
    if (errs.length > 0) return;
    setMenyimpan(true);
    try {
      const sekarang = new Date().toISOString();
      if (editingId) {
        const lama = daftar.find((t) => t.id === editingId);
        if (!lama) throw new Error('Tugas tidak ditemukan.');
        const berikutnya: TugasTenggat = {
          ...lama,
          ...kandidat,
          judul: kandidat.judul as string,
          kategori: kandidat.kategori as TugasKategori,
          prioritas: kandidat.prioritas as 1 | 2 | 3,
          tanggalJatuhTempo: kandidat.tanggalJatuhTempo as string,
          diubahPada: sekarang,
        };
        await saveTenggat(berikutnya);
        catatAudit('tenggat_ubah', { entitas: 'tenggat', entitasId: editingId, ringkasan: `Tugas diubah: ${berikutnya.judul}` });
        toast('Tugas diperbarui.', 'success');
      } else {
        const baru: TugasTenggat = {
          id: idBaru(),
          judul: kandidat.judul as string,
          deskripsi: kandidat.deskripsi,
          kategori: kandidat.kategori as TugasKategori,
          status: 'terbuka',
          prioritas: kandidat.prioritas as 1 | 2 | 3,
          tanggalJatuhTempo: kandidat.tanggalJatuhTempo as string,
          penanggungJawab: kandidat.penanggungJawab,
          tautanTindakan: kandidat.tautanTindakan as TugasTenggat['tautanTindakan'],
          dibuatOleh: currentUser?.username || 'sistem',
          dibuatPada: sekarang,
          diubahPada: sekarang,
          selesaiPada: null,
          selesaiOleh: null,
        };
        await saveTenggat(baru);
        catatAudit('tenggat_buat', { entitas: 'tenggat', entitasId: baru.id, ringkasan: `Tugas dibuat: ${baru.judul} (tenggat ${baru.tanggalJatuhTempo})` });
        toast('Tugas ditambahkan.', 'success');
      }
      setFormTerbuka(false);
      await muat();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menyimpan tugas.', 'error');
    } finally {
      setMenyimpan(false);
    }
  };

  const ubahStatus = async (t: TugasTenggat, status: TugasTenggat['status']) => {
    try {
      const sekarang = new Date().toISOString();
      const berikutnya: TugasTenggat = {
        ...t,
        status,
        diubahPada: sekarang,
        selesaiPada: status === 'selesai' ? sekarang : null,
        selesaiOleh: status === 'selesai' ? currentUser?.username || 'sistem' : null,
      };
      await saveTenggat(berikutnya);
      if (status === 'selesai') {
        catatAudit('tenggat_selesai', { entitas: 'tenggat', entitasId: t.id, ringkasan: `Tugas selesai: ${t.judul}` });
        toast('Tugas ditandai selesai.', 'success');
      } else if (status === 'dibatalkan') {
        catatAudit('tenggat_batal', { entitas: 'tenggat', entitasId: t.id, ringkasan: `Tugas dibatalkan: ${t.judul}` });
        toast('Tugas dibatalkan.', 'success');
      } else {
        catatAudit('tenggat_ubah', { entitas: 'tenggat', entitasId: t.id, ringkasan: `Tugas dibuka lagi: ${t.judul}` });
        toast('Tugas dibuka lagi.', 'success');
      }
      await muat();
    } catch {
      toast('Gagal mengubah status tugas.', 'error');
    }
  };

  const hapusTugas = async (t: TugasTenggat) => {
    const ok = await confirmDialog(
      `Hapus tugas "${t.judul}" (tenggat ${t.tanggalJatuhTempo})? Pengingat yang sudah dijadwalkan untuk tugas ini ikut dibersihkan. Tindakan ini tidak dapat dibatalkan.`,
      { confirmLabel: 'Ya, Hapus', danger: true },
    );
    if (!ok) return;
    try {
      await deleteTenggat(t.id);
      catatAudit('tenggat_hapus', { entitas: 'tenggat', entitasId: t.id, ringkasan: `Tugas dihapus: ${t.judul}` });
      toast('Tugas dihapus.', 'success');
      await muat();
    } catch {
      toast('Gagal menghapus tugas.', 'error');
    }
  };

  const simpanPengaturan = async () => {
    if (!isZonaWaktuValid(zonaInput.trim())) {
      toast('Zona waktu tidak valid. Contoh yang benar: Asia/Jakarta.', 'error');
      return;
    }
    if (hariSebelumDraft.length === 0) {
      toast('Pilih minimal satu jadwal pengingat (H-minus).', 'error');
      return;
    }
    setMenyimpanPengaturan(true);
    try {
      const berikutnya = simpanPengaturanPengingat({
        zonaWaktu: zonaInput.trim(),
        aktif: pengingatAktifDraft,
        hariSebelum: [...hariSebelumDraft].sort((a, b) => b - a),
        pengingatTerlambatHarian: terlambatHarianDraft,
      });
      setPengaturan(berikutnya);
      catatAudit('tenggat_pengaturan_ubah', {
        entitas: 'tenggat',
        ringkasan: `Pengaturan pengingat diubah: zona ${berikutnya.zonaWaktu}, H-${berikutnya.hariSebelum.join('/')} (in-app)`,
      });
      toast('Pengaturan pengingat disimpan.', 'success');
      setPengaturanTerbuka(false);
    } catch {
      toast('Gagal menyimpan pengaturan.', 'error');
    } finally {
      setMenyimpanPengaturan(false);
    }
  };

  const namaBulan = new Date(Date.UTC(bulanTampil.tahun, bulanTampil.bulan - 1, 1)).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div className="space-y-4">
      {/* Ringkasan */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Terbuka', nilai: ringkasan.terbuka, kelas: 'text-slate-900' },
          { label: 'Terlambat', nilai: ringkasan.terlambat, kelas: 'text-rose-700' },
          { label: 'Jatuh tempo hari ini', nilai: ringkasan.hariIni, kelas: 'text-amber-700' },
          { label: 'Selesai', nilai: ringkasan.selesai, kelas: 'text-emerald-700' },
        ].map((k) => (
          <div key={k.label} className="ui-card p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{k.label}</p>
            <p className={`text-2xl font-black tabular-nums ${k.kelas}`}>{k.nilai}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        Zona waktu sekolah: <strong className="text-slate-700">{pengaturan.zonaWaktu}</strong> · Hari ini:{' '}
        <strong className="text-slate-700">{hariIni}</strong> · Pengingat hanya di dalam aplikasi (in-app) — tidak ada
        pengiriman email/WhatsApp. Pengingat untuk tugas yang sama tidak dikirim berulang.
      </p>

      <div className="flex flex-wrap gap-2">
        <button onClick={bukaFormBaru} className="ui-btn ui-btn-primary">
          <Plus className="w-4 h-4" /> Tugas Baru
        </button>
        {isAdmin && (
          <button onClick={() => setPengaturanTerbuka((v) => !v)} className="ui-btn ui-btn-outline">
            <Settings2 className="w-4 h-4" /> Pengaturan Pengingat
          </button>
        )}
        {hariTerpilih && (
          <button onClick={() => setHariTerpilih(null)} className="ui-btn ui-btn-outline">
            <X className="w-4 h-4" /> Tampilkan semua tanggal
          </button>
        )}
      </div>

      {/* Pengaturan pengingat (khusus administrator) */}
      {isAdmin && pengaturanTerbuka && (
        <div className="ui-card p-4 sm:p-5 space-y-4">
          <h3 className="ui-section-title !normal-case !tracking-normal !text-sm">
            <BellRing className="w-4 h-4" /> Pengaturan Pengingat
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="ui-label" htmlFor="tenggat-zona">Zona waktu sekolah (IANA)</label>
              <input
                id="tenggat-zona"
                className="ui-input"
                value={zonaInput}
                onChange={(e) => setZonaInput(e.target.value)}
                placeholder="Asia/Jakarta"
                list="tenggat-zona-pilihan"
              />
              <datalist id="tenggat-zona-pilihan">
                {ZONA_WAKTU_PILIHAN.map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
              <p className="text-[11px] text-slate-500 mt-1">Semua tanggal tenggat &amp; pengingat dihitung dalam zona ini.</p>
            </div>
            <div>
              <span className="ui-label">Kanal notifikasi</span>
              <p className="ui-input bg-slate-50 text-slate-600">In-app saja (toast + lencana)</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Tidak ada kanal eksternal yang terkonfigurasi. Aplikasi tidak mengklaim pengiriman email/WhatsApp.
              </p>
            </div>
          </div>
          <div>
            <span className="ui-label">Jadwal pengingat sebelum tenggat</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {TENGGAT_HARI_SEBELUM_PILIHAN.map((h) => {
                const aktif = hariSebelumDraft.includes(h);
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() =>
                      setHariSebelumDraft((d) => (aktif ? d.filter((x) => x !== h) : [...d, h].sort((a, b) => b - a)))
                    }
                    className={`px-3 py-1.5 rounded-full border text-xs font-bold ${aktif ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300'}`}
                    aria-pressed={aktif}
                  >
                    {h === 0 ? 'Hari-H' : `H-${h}`}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600" checked={pengingatAktifDraft} onChange={(e) => setPengingatAktifDraft(e.target.checked)} />
            Pengingat aktif
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600" checked={terlambatHarianDraft} onChange={(e) => setTerlambatHarianDraft(e.target.checked)} />
            Kirim satu pengingat harian selama tugas terlambat
          </label>
          <div>
            <button onClick={() => void simpanPengaturan()} disabled={menyimpanPengaturan} className="ui-btn ui-btn-primary">
              {menyimpanPengaturan ? 'Menyimpan…' : 'Simpan Pengaturan'}
            </button>
          </div>
        </div>
      )}

      {/* Form tambah/ubah */}
      {formTerbuka && (
        <div className="ui-card p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="ui-section-title !normal-case !tracking-normal !text-sm">
              {editingId ? 'Ubah Tugas' : 'Tugas Baru'}
            </h3>
            <button onClick={() => setFormTerbuka(false)} className="ui-btn ui-btn-ghost !px-2" aria-label="Tutup formulir">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="ui-label" htmlFor="tenggat-judul">Judul tugas *</label>
              <input
                id="tenggat-judul"
                className="ui-input"
                value={form.judul}
                onChange={(e) => setForm({ ...form, judul: e.target.value })}
                placeholder="cth: Kirim laporan BOS ke dinas"
                maxLength={120}
              />
              {formErrors.judul && <p className="text-xs text-rose-600 mt-1">{formErrors.judul}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="ui-label" htmlFor="tenggat-deskripsi">Deskripsi / catatan (opsional)</label>
              <textarea
                id="tenggat-deskripsi"
                className="ui-input"
                rows={2}
                value={form.deskripsi}
                onChange={(e) => setForm({ ...form, deskripsi: e.target.value })}
                placeholder="Rincian singkat tugas. Jangan menulis data pribadi siswa di sini."
                maxLength={500}
              />
              {formErrors.deskripsi && <p className="text-xs text-rose-600 mt-1">{formErrors.deskripsi}</p>}
            </div>
            <div>
              <label className="ui-label" htmlFor="tenggat-kategori">Kategori</label>
              <select
                id="tenggat-kategori"
                className="ui-input"
                value={form.kategori}
                onChange={(e) => setForm({ ...form, kategori: e.target.value as TugasKategori })}
              >
                {TENGGAT_KATEGORI.map((k) => (
                  <option key={k} value={k}>{TENGGAT_KATEGORI_LABEL[k]}</option>
                ))}
              </select>
              {formErrors.kategori && <p className="text-xs text-rose-600 mt-1">{formErrors.kategori}</p>}
            </div>
            <div>
              <label className="ui-label" htmlFor="tenggat-prioritas">Prioritas</label>
              <select
                id="tenggat-prioritas"
                className="ui-input"
                value={form.prioritas}
                onChange={(e) => setForm({ ...form, prioritas: Number(e.target.value) as 1 | 2 | 3 })}
              >
                {[1, 2, 3].map((p) => (
                  <option key={p} value={p}>{PRIORITAS_LABEL[p]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="ui-label" htmlFor="tenggat-tanggal">Tanggal jatuh tempo *</label>
              <input
                id="tenggat-tanggal"
                type="date"
                className="ui-input"
                value={form.tanggalJatuhTempo}
                onChange={(e) => setForm({ ...form, tanggalJatuhTempo: e.target.value })}
              />
              {formErrors.tanggalJatuhTempo && <p className="text-xs text-rose-600 mt-1">{formErrors.tanggalJatuhTempo}</p>}
            </div>
            <div>
              <label className="ui-label" htmlFor="tenggat-pj">Penanggung jawab</label>
              <select
                id="tenggat-pj"
                className="ui-input"
                value={form.penanggungJawab}
                onChange={(e) => setForm({ ...form, penanggungJawab: e.target.value })}
              >
                <option value="">Belum ditentukan</option>
                {pengguna.map((u) => (
                  <option key={u.id} value={u.username}>{u.namaLengkap} ({u.username})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="ui-label" htmlFor="tenggat-tautan">Tautan ke tindakan (opsional)</label>
              <select
                id="tenggat-tautan"
                className="ui-input"
                value={form.tautanTab}
                onChange={(e) => setForm({ ...form, tautanTab: e.target.value as '' | TugasTabTujuan })}
              >
                <option value="">Tanpa tautan</option>
                {TENGGAT_TAB_TUJUAN.map((t) => (
                  <option key={t} value={t}>{TAB_LABEL[t]}</option>
                ))}
              </select>
              {formErrors.tautanTindakan && <p className="text-xs text-rose-600 mt-1">{formErrors.tautanTindakan}</p>}
            </div>
            <div>
              <label className="ui-label" htmlFor="tenggat-tautan-label">Label tautan (opsional)</label>
              <input
                id="tenggat-tautan-label"
                className="ui-input"
                value={form.tautanLabel}
                onChange={(e) => setForm({ ...form, tautanLabel: e.target.value })}
                placeholder="cth: Buka Master Siswa"
                maxLength={80}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void simpanForm()} disabled={menyimpan} className="ui-btn ui-btn-primary">
              {menyimpan ? 'Menyimpan…' : editingId ? 'Simpan Perubahan' : 'Tambah Tugas'}
            </button>
            <button onClick={() => setFormTerbuka(false)} className="ui-btn ui-btn-outline">Batal</button>
          </div>
        </div>
      )}

      {/* Kalender bulanan */}
      <div className="ui-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="ui-section-title !normal-case !tracking-normal !text-sm">
            <CalendarDays className="w-4 h-4" /> Kalender — {namaBulan}
          </h3>
          <div className="flex gap-1">
            <button onClick={() => geserBulan(-1)} className="ui-btn ui-btn-outline !px-2" aria-label="Bulan sebelumnya">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                const now = new Date();
                setBulanTampil({ tahun: now.getFullYear(), bulan: now.getMonth() + 1 });
              }}
              className="ui-btn ui-btn-outline !px-3 text-xs"
            >
              Hari ini
            </button>
            <button onClick={() => geserBulan(1)} className="ui-btn ui-btn-outline !px-2" aria-label="Bulan berikutnya">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-500 mb-1">
          {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((h) => (
            <div key={h} className="py-1">{h}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {selKalender.map((sel, i) => {
            if (!sel.diBulanIni) return <div key={i} className="min-h-14 rounded-lg" />;
            const tugasHari = tugasPerTanggal.get(sel.iso) || [];
            const dipilih = hariTerpilih === sel.iso;
            const adalahHariIni = sel.iso === hariIni;
            return (
              <button
                key={sel.iso}
                onClick={() => setHariTerpilih(dipilih ? null : sel.iso)}
                className={`min-h-14 rounded-lg border p-1 text-left align-top transition ${dipilih ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'border-slate-200 bg-white hover:border-indigo-300'} ${adalahHariIni ? 'outline outline-1 outline-amber-400' : ''}`}
                title={`${namaHariSingkat(sel.iso)}, ${sel.iso}${tugasHari.length > 0 ? ` — ${tugasHari.length} tugas terbuka` : ''}`}
                aria-pressed={dipilih}
              >
                <span className={`text-xs font-extrabold ${adalahHariIni ? 'text-amber-700' : 'text-slate-700'}`}>{sel.hari}</span>
                {tugasHari.slice(0, 2).map((t) => (
                  <span key={t.id} className="block truncate text-[10px] font-semibold text-indigo-700 leading-tight">
                    • {t.judul}
                  </span>
                ))}
                {tugasHari.length > 2 && (
                  <span className="block text-[10px] text-slate-400 font-semibold">+{tugasHari.length - 2} lagi</span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-400 mt-2">Klik tanggal untuk menyaring daftar di bawah. Hanya tugas terbuka yang tampil di kalender.</p>
      </div>

      {/* Filter + daftar */}
      <div className="ui-card p-4 sm:p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="ui-input !pl-9"
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="Cari judul / deskripsi…"
              aria-label="Cari tugas"
            />
          </div>
          <select className="ui-input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)} aria-label="Filter status">
            <option value="semua">Semua status</option>
            <option value="terbuka">Terbuka</option>
            <option value="terlambat">Terlambat</option>
            <option value="selesai">Selesai</option>
            <option value="dibatalkan">Dibatalkan</option>
          </select>
          <select className="ui-input" value={filterKategori} onChange={(e) => setFilterKategori(e.target.value as typeof filterKategori)} aria-label="Filter kategori">
            <option value="semua">Semua kategori</option>
            {TENGGAT_KATEGORI.map((k) => (
              <option key={k} value={k}>{TENGGAT_KATEGORI_LABEL[k]}</option>
            ))}
          </select>
          <select className="ui-input" value={filterPj} onChange={(e) => setFilterPj(e.target.value)} aria-label="Filter penanggung jawab">
            <option value="semua">Semua penanggung jawab</option>
            {pengguna.map((u) => (
              <option key={u.id} value={u.username}>{u.namaLengkap}</option>
            ))}
          </select>
        </div>

        {memuat ? (
          <p className="text-sm text-slate-400 italic py-6 text-center">Memuat daftar tenggat…</p>
        ) : tersaring.length === 0 ? (
          <p className="text-sm text-slate-400 italic py-6 text-center">
            {daftar.length === 0
              ? 'Belum ada tugas. Buat tugas pertama dengan tombol “Tugas Baru”.'
              : 'Tidak ada tugas yang cocok dengan filter.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tersaring.map((t) => {
              const turunan = statusTurunan(t, hariIni);
              return (
                <li key={t.id} className="py-3 flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-slate-900 text-sm">{t.judul}</span>
                      <span className={`ui-badge ${STATUS_BADGE[turunan]}`}>{STATUS_LABEL[turunan]}</span>
                      <span className="ui-badge ui-badge-slate">{TENGGAT_KATEGORI_LABEL[t.kategori]}</span>
                      <span className="ui-badge ui-badge-slate">Prioritas: {PRIORITAS_LABEL[t.prioritas]}</span>
                    </div>
                    {t.deskripsi && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{t.deskripsi}</p>}
                    <p className="text-[11px] text-slate-400 mt-1">
                      Tenggat <strong className="text-slate-600">{t.tanggalJatuhTempo}</strong> · Penanggung jawab:{' '}
                      {namaPengguna(t.penanggungJawab)} · Dibuat oleh {t.dibuatOleh}
                      {t.selesaiPada && <> · Selesai {t.selesaiPada.slice(0, 10)} oleh {t.selesaiOleh || '-'}</>}
                    </p>
                    {t.tautanTindakan && (
                      <button onClick={() => onNavigate(t.tautanTindakan!.tab)} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:underline">
                        {t.tautanTindakan.label || `Buka ${TAB_LABEL[t.tautanTindakan.tab]}`}
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    {t.status === 'terbuka' && (
                      <>
                        <button onClick={() => void ubahStatus(t, 'selesai')} className="ui-btn ui-btn-outline !px-2.5 !py-1.5 text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Selesai
                        </button>
                        <button onClick={() => void ubahStatus(t, 'dibatalkan')} className="ui-btn ui-btn-outline !px-2.5 !py-1.5 text-xs">
                          <Ban className="w-3.5 h-3.5" /> Batalkan
                        </button>
                      </>
                    )}
                    {t.status !== 'terbuka' && (
                      <button onClick={() => void ubahStatus(t, 'terbuka')} className="ui-btn ui-btn-outline !px-2.5 !py-1.5 text-xs">
                        <RotateCcw className="w-3.5 h-3.5" /> Buka lagi
                      </button>
                    )}
                    <button onClick={() => bukaFormUbah(t)} className="ui-btn ui-btn-outline !px-2.5 !py-1.5 text-xs">
                      <Pencil className="w-3.5 h-3.5" /> Ubah
                    </button>
                    <button onClick={() => void hapusTugas(t)} className="ui-btn ui-btn-outline !px-2.5 !py-1.5 text-xs !text-rose-700">
                      <Trash2 className="w-3.5 h-3.5" /> Hapus
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default KalenderTenggatView;
