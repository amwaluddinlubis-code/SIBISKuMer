import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Pencil,
  Plus,
  Settings2,
  Trash2,
} from 'lucide-react';
import type { AppUser, PengaturanKalender, TugasAdministrasi } from '../types';
import { TAUTAN_AKSI_KALENDER } from '../types';
import { deleteTenggat, getAllUsers, savePengaturanKalender, saveTenggat } from '../utils/db';
import { toast, confirmDialog } from '../utils/notify';
import { catatAudit } from '../utils/audit';
import {
  KANAL_BELUM_TERSEDIA,
  KANAL_TERSEDIA,
  ZONA_WAKTU_PILIHAN,
  bolehKelolaTenggat,
  bolehUbahStatusTenggat,
  cariDuplikatTugas,
  hariIniDiZona,
  hitungJumlahPengingatAktif,
  idTugasBaru,
  labelStatusTenggat,
  normalisasiPengaturanKalender,
  statusTenggat,
  validasiTugas,
  type StatusTenggat,
} from '../utils/kalender';

interface KalenderTugasViewProps {
  tugas: TugasAdministrasi[];
  currentUser: AppUser | null;
  pengaturan: PengaturanKalender;
  onPengaturanChanged: (p: PengaturanKalender) => void;
  onDataChanged: () => void;
  onNavigate: (tab: string) => void;
}

const STATUS_BADGE: Record<StatusTenggat, string> = {
  selesai: 'ui-badge-emerald',
  tanpa_tenggat: 'ui-badge-slate',
  terlambat: 'ui-badge-rose',
  jatuh_tempo_hari_ini: 'ui-badge-amber',
  segera: 'ui-badge-indigo',
  mendatang: 'ui-badge-slate',
};

type FilterStatus = 'semua' | 'belum' | 'selesai' | 'terlambat' | 'segera' | 'hari_ini';

interface FormState {
  judul: string;
  deskripsi: string;
  tanggalJatuhTempo: string;
  kategori: string;
  penanggungJawab: string;
  rombel: string;
  tautanAksi: string;
  prioritas: string;
}

const FORM_KOSONG: FormState = {
  judul: '',
  deskripsi: '',
  tanggalJatuhTempo: '',
  kategori: '',
  penanggungJawab: '',
  rombel: '',
  tautanAksi: '',
  prioritas: 'normal',
};

function formDariTugas(t: TugasAdministrasi): FormState {
  return {
    judul: t.judul,
    deskripsi: t.deskripsi || '',
    tanggalJatuhTempo: t.tanggalJatuhTempo || '',
    kategori: t.kategori || '',
    penanggungJawab: t.penanggungJawab || '',
    rombel: t.rombel || '',
    tautanAksi: t.tautanAksi || '',
    prioritas: t.prioritas || 'normal',
  };
}

/** Sel kalender: daftar tanggal `YYYY-MM-DD` untuk grid bulan (Senin dulu). */
function tanggalGridBulan(tahun: number, bulan: number): string[] {
  const pertama = new Date(Date.UTC(tahun, bulan, 1));
  // getUTCDay: 0=Minggu..6=Sabtu → offset Senin=0.
  const offset = (pertama.getUTCDay() + 6) % 7;
  const awal = new Date(Date.UTC(tahun, bulan, 1 - offset));
  const hasil: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(awal.getTime() + i * 86400000);
    hasil.push(d.toISOString().slice(0, 10));
  }
  return hasil;
}

function formatTanggalId(tanggal: string): string {
  if (!tanggal) return '-';
  try {
    const [y, m, d] = tanggal.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return tanggal;
  }
}

/**
 * Kalender tugas administrasi & pengingat tenggat (Issue #8).
 * - Buat/ubah/hapus: administrator. Tandai selesai: administrator atau
 *   operator penanggung jawab. Semua peran melihat tugasnya.
 * - Pengingat HANYA dalam aplikasi (lencana + toast); kanal eksternal
 *   ditampilkan sebagai belum tersedia — tidak pernah diklaim terkirim.
 */
export const KalenderTugasView: React.FC<KalenderTugasViewProps> = ({
  tugas,
  currentUser,
  pengaturan,
  onPengaturanChanged,
  onDataChanged,
  onNavigate,
}) => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('semua');
  const [cari, setCari] = useState('');
  const [filterTanggal, setFilterTanggal] = useState('');
  const [bulanTampil, setBulanTampil] = useState(() => {
    const now = new Date();
    return { tahun: now.getFullYear(), bulan: now.getMonth() };
  });
  const [formTerbuka, setFormTerbuka] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(FORM_KOSONG);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [menyimpan, setMenyimpan] = useState(false);
  const [terpilih, setTerpilih] = useState<Set<string>>(new Set());
  const [pengaturanTerbuka, setPengaturanTerbuka] = useState(false);
  const [pengaturanForm, setPengaturanForm] = useState<PengaturanKalender>(pengaturan);

  const dapatKelola = bolehKelolaTenggat(currentUser);
  const hariIni = hariIniDiZona(pengaturan.zonaWaktu);

  useEffect(() => {
    void getAllUsers()
      .then((u) => setUsers(u || []))
      .catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    setPengaturanForm(pengaturan);
  }, [pengaturan]);

  const statusPerTugas = useMemo(() => {
    const m = new Map<string, StatusTenggat>();
    for (const t of tugas) m.set(t.id, statusTenggat(t, pengaturan));
    return m;
  }, [tugas, pengaturan]);

  const jumlahPerhatian = useMemo(
    () => hitungJumlahPengingatAktif(tugas, pengaturan),
    [tugas, pengaturan]
  );

  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return tugas.filter((t) => {
      if (filterTanggal && t.tanggalJatuhTempo !== filterTanggal) return false;
      if (q) {
        const hay = `${t.judul} ${t.deskripsi || ''} ${t.kategori || ''} ${t.penanggungJawab || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const s = statusPerTugas.get(t.id);
      switch (filterStatus) {
        case 'semua':
          return true;
        case 'belum':
          return t.status === 'belum';
        case 'selesai':
          return t.status === 'selesai';
        case 'terlambat':
          return s === 'terlambat';
        case 'segera':
          return s === 'segera';
        case 'hari_ini':
          return s === 'jatuh_tempo_hari_ini';
        default:
          return true;
      }
    });
  }, [tugas, cari, filterTanggal, filterStatus, statusPerTugas]);

  const tugasPerTanggal = useMemo(() => {
    const m = new Map<string, TugasAdministrasi[]>();
    for (const t of tugas) {
      if (!t.tanggalJatuhTempo || t.status === 'selesai') continue;
      const list = m.get(t.tanggalJatuhTempo) || [];
      list.push(t);
      m.set(t.tanggalJatuhTempo, list);
    }
    return m;
  }, [tugas]);

  const grid = useMemo(
    () => tanggalGridBulan(bulanTampil.tahun, bulanTampil.bulan),
    [bulanTampil]
  );

  const namaBulan = useMemo(() => {
    try {
      return new Date(Date.UTC(bulanTampil.tahun, bulanTampil.bulan, 1)).toLocaleDateString('id-ID', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });
    } catch {
      return `${bulanTampil.bulan + 1}/${bulanTampil.tahun}`;
    }
  }, [bulanTampil]);

  const bukaFormBaru = () => {
    setEditingId(null);
    setForm(FORM_KOSONG);
    setFormErrors([]);
    setFormTerbuka(true);
  };

  const bukaFormUbah = (t: TugasAdministrasi) => {
    setEditingId(t.id);
    setForm(formDariTugas(t));
    setFormErrors([]);
    setFormTerbuka(true);
  };

  const simpanForm = async () => {
    const errs = validasiTugas(form);
    setFormErrors(errs);
    if (errs.length > 0) return;
    const duplikat = cariDuplikatTugas(tugas, form, editingId || undefined);
    if (duplikat.length > 0) {
      const lanjut = await confirmDialog(
        `Tugas serupa sudah ada (${duplikat.length}): "${duplikat[0].judul}" jatuh tempo ${formatTanggalId(duplikat[0].tanggalJatuhTempo)}. Tetap simpan sebagai tugas baru?`
      );
      if (!lanjut) return;
    }
    setMenyimpan(true);
    try {
      const now = new Date().toISOString();
      if (editingId) {
        const lama = tugas.find((t) => t.id === editingId);
        if (!lama) throw new Error('Tugas tidak ditemukan.');
        const updated: TugasAdministrasi = {
          ...lama,
          judul: form.judul.trim(),
          deskripsi: form.deskripsi.trim() || undefined,
          tanggalJatuhTempo: form.tanggalJatuhTempo.trim(),
          kategori: form.kategori.trim() || undefined,
          penanggungJawab: form.penanggungJawab.trim() || undefined,
          rombel: form.rombel.trim() || undefined,
          tautanAksi: (form.tautanAksi || '') as TugasAdministrasi['tautanAksi'],
          prioritas: (form.prioritas || 'normal') as TugasAdministrasi['prioritas'],
          diubahPada: now,
        };
        await saveTenggat(updated);
        catatAudit('tenggat_ubah', { entitas: 'tenggat', entitasId: updated.id, ringkasan: `Tenggat diubah: "${updated.judul}"` });
        toast('Tenggat berhasil diubah.', 'success');
      } else {
        const baru: TugasAdministrasi = {
          id: idTugasBaru(),
          judul: form.judul.trim(),
          deskripsi: form.deskripsi.trim() || undefined,
          tanggalJatuhTempo: form.tanggalJatuhTempo.trim(),
          kategori: form.kategori.trim() || undefined,
          penanggungJawab: form.penanggungJawab.trim() || undefined,
          rombel: form.rombel.trim() || undefined,
          tautanAksi: (form.tautanAksi || '') as TugasAdministrasi['tautanAksi'],
          prioritas: (form.prioritas || 'normal') as TugasAdministrasi['prioritas'],
          status: 'belum',
          dibuatOleh: currentUser?.username || 'sistem',
          dibuatPada: now,
          diubahPada: now,
          selesaiPada: null,
          selesaiOleh: null,
        };
        await saveTenggat(baru);
        catatAudit('tenggat_buat', { entitas: 'tenggat', entitasId: baru.id, ringkasan: `Tenggat dibuat: "${baru.judul}"` });
        toast('Tenggat berhasil dibuat.', 'success');
      }
      setFormTerbuka(false);
      onDataChanged();
    } catch (err) {
      toast(`Gagal menyimpan tenggat: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setMenyimpan(false);
    }
  };

  const ubahStatus = async (t: TugasAdministrasi, selesai: boolean) => {
    if (!bolehUbahStatusTenggat(currentUser, t)) {
      toast('Hanya administrator atau penanggung jawab tugas yang dapat mengubah status ini.', 'error');
      return;
    }
    try {
      const now = new Date().toISOString();
      const updated: TugasAdministrasi = {
        ...t,
        status: selesai ? 'selesai' : 'belum',
        selesaiPada: selesai ? now : null,
        selesaiOleh: selesai ? currentUser?.username || 'sistem' : null,
        diubahPada: now,
      };
      await saveTenggat(updated);
      catatAudit('tenggat_selesai', {
        entitas: 'tenggat',
        entitasId: t.id,
        ringkasan: selesai ? `Tenggat diselesaikan: "${t.judul}"` : `Tenggat dibuka kembali: "${t.judul}"`,
      });
      toast(selesai ? 'Tugas ditandai selesai.' : 'Tugas dibuka kembali.', 'success');
      onDataChanged();
    } catch (err) {
      toast(`Gagal mengubah status: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const hapusTugas = async (t: TugasAdministrasi) => {
    const ok = await confirmDialog(`Hapus tenggat "${t.judul}"? Tindakan ini tidak dapat dibatalkan.`, {
      confirmLabel: 'Ya, Hapus',
    });
    if (!ok) return;
    try {
      await deleteTenggat(t.id);
      catatAudit('tenggat_hapus', { entitas: 'tenggat', entitasId: t.id, ringkasan: `Tenggat dihapus: "${t.judul}"` });
      toast('Tenggat berhasil dihapus.', 'success');
      onDataChanged();
    } catch (err) {
      toast(`Gagal menghapus: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  /** Operasi massal: selesaikan semua tugas terpilih yang boleh diubah pengguna. */
  const selesaikanTerpilih = async () => {
    const target = tersaring.filter((t) => terpilih.has(t.id) && t.status !== 'selesai' && bolehUbahStatusTenggat(currentUser, t));
    if (target.length === 0) {
      toast('Tidak ada tugas terpilih yang dapat diselesaikan.', 'warning');
      return;
    }
    const ok = await confirmDialog(
      `Tandai ${target.length} tugas terpilih sebagai selesai? Tugas yang tidak berwenang tidak ikut diproses.`,
      { confirmLabel: 'Ya, Selesaikan' }
    );
    if (!ok) return;
    let berhasil = 0;
    let gagal = 0;
    let pesanGagal = '';
    const now = new Date().toISOString();
    for (const t of target) {
      try {
        await saveTenggat({ ...t, status: 'selesai', selesaiPada: now, selesaiOleh: currentUser?.username || 'sistem', diubahPada: now });
        catatAudit('tenggat_selesai', { entitas: 'tenggat', entitasId: t.id, ringkasan: `Tenggat diselesaikan (massal): "${t.judul}"` });
        berhasil++;
      } catch (err) {
        gagal++;
        if (!pesanGagal) pesanGagal = err instanceof Error ? err.message : String(err);
      }
    }
    setTerpilih(new Set());
    onDataChanged();
    if (gagal === 0) toast(`${berhasil} tugas ditandai selesai.`, 'success');
    else toast(`${berhasil} tugas selesai, ${gagal} gagal. ${pesanGagal}`, 'warning');
  };

  const simpanPengaturan = () => {
    const normal = normalisasiPengaturanKalender(pengaturanForm);
    savePengaturanKalender(normal);
    onPengaturanChanged(normal);
    setPengaturanTerbuka(false);
    toast('Pengaturan kalender disimpan.', 'success');
  };

  const togglePilih = (id: string) => {
    setTerpilih((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const geserBulan = (delta: number) => {
    setBulanTampil((p) => {
      const total = p.tahun * 12 + p.bulan + delta;
      return { tahun: Math.floor(total / 12), bulan: ((total % 12) + 12) % 12 };
    });
  };

  return (
    <div className="space-y-4">
      {/* Ringkasan + pengaturan */}
      <div className="ui-card p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Bell className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-extrabold text-slate-900">
              {jumlahPerhatian > 0
                ? `${jumlahPerhatian} tugas perlu perhatian`
                : 'Tidak ada tugas yang perlu perhatian'}
            </p>
            <p className="text-[11px] text-slate-500">
              Zona waktu: <strong>{pengaturan.zonaWaktu}</strong> • Hari ini: {hariIni} • Pengingat dalam aplikasi
              {pengaturan.ingatkanHariSebelum > 0 ? ` • ${pengaturan.ingatkanHariSebelum} hari sebelum tenggat` : ' • hanya hari-H'}
            </p>
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => setPengaturanTerbuka((v) => !v)} className="ui-btn ui-btn-outline">
            <Settings2 className="w-4 h-4" /> Pengaturan
          </button>
          {dapatKelola && (
            <button type="button" onClick={bukaFormBaru} className="ui-btn ui-btn-primary">
              <Plus className="w-4 h-4" /> Tambah Tenggat
            </button>
          )}
        </div>
      </div>

      {pengaturanTerbuka && (
        <div className="ui-card p-4 space-y-3">
          <h3 className="ui-section-title !normal-case !tracking-normal !text-sm">
            <Settings2 className="w-4 h-4" /> Pengaturan Kalender &amp; Pengingat
          </h3>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="ui-label">Zona waktu</label>
              <select
                value={pengaturanForm.zonaWaktu}
                onChange={(e) => setPengaturanForm({ ...pengaturanForm, zonaWaktu: e.target.value })}
                className="ui-input"
              >
                {ZONA_WAKTU_PILIHAN.map((z) => (
                  <option key={z.id} value={z.id}>{z.label}</option>
                ))}
                {!ZONA_WAKTU_PILIHAN.some((z) => z.id === pengaturanForm.zonaWaktu) && (
                  <option value={pengaturanForm.zonaWaktu}>{pengaturanForm.zonaWaktu} (saat ini)</option>
                )}
              </select>
              <p className="ui-hint mt-1">Tanggal jatuh tempo dihitung di zona ini.</p>
            </div>
            <div>
              <label className="ui-label">Ingatkan (hari sebelum tenggat)</label>
              <input
                type="number"
                min={0}
                max={30}
                value={pengaturanForm.ingatkanHariSebelum}
                onChange={(e) => setPengaturanForm({ ...pengaturanForm, ingatkanHariSebelum: Number(e.target.value) })}
                className="ui-input"
              />
              <p className="ui-hint mt-1">0 = hanya pada hari jatuh tempo. Maks 30.</p>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pengaturanForm.ingatkanTerlambat}
                  onChange={(e) => setPengaturanForm({ ...pengaturanForm, ingatkanTerlambat: e.target.checked })}
                />
                Ingatkan juga tugas yang sudah terlambat
              </label>
            </div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
            <p className="font-bold text-slate-800 flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5" /> Kanal notifikasi
            </p>
            {KANAL_TERSEDIA.map((k) => (
              <p key={k.id}>✅ <strong>{k.label}</strong> — {k.keterangan}</p>
            ))}
            {KANAL_BELUM_TERSEDIA.map((k) => (
              <p key={k.id} className="flex items-start gap-1.5">
                <BellOff className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span><strong>{k.label}</strong> — {k.keterangan}</span>
              </p>
            ))}
            <p className="text-slate-500">
              Pencegahan duplikat: satu pengingat per tugas + tenggat + ambang hanya disampaikan sekali.
              Mengubah tenggat membuat pengingat baru; menyelesaikan tugas menghentikan pengingatnya.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={simpanPengaturan} className="ui-btn ui-btn-primary">Simpan Pengaturan</button>
            <button type="button" onClick={() => setPengaturanTerbuka(false)} className="ui-btn ui-btn-ghost">Tutup</button>
          </div>
        </div>
      )}

      {/* Kalender bulanan */}
      <div className="ui-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="ui-section-title !normal-case !tracking-normal !text-sm capitalize">
            <CalendarDays className="w-4 h-4" /> {namaBulan}
          </h3>
          <div className="flex gap-1">
            <button type="button" onClick={() => geserBulan(-1)} className="ui-btn ui-btn-outline !px-2" aria-label="Bulan sebelumnya">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => { const n = new Date(); setBulanTampil({ tahun: n.getFullYear(), bulan: n.getMonth() }); setFilterTanggal(''); }}
              className="ui-btn ui-btn-outline"
            >
              Hari ini
            </button>
            <button type="button" onClick={() => geserBulan(1)} className="ui-btn ui-btn-outline !px-2" aria-label="Bulan berikutnya">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-500 mb-1">
          {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((tgl) => {
            const diBulanIni = tgl.slice(0, 7) === `${bulanTampil.tahun}-${String(bulanTampil.bulan + 1).padStart(2, '0')}`;
            const list = tugasPerTanggal.get(tgl) || [];
            const aktif = filterTanggal === tgl;
            const adalahHariIni = tgl === hariIni;
            return (
              <button
                key={tgl}
                type="button"
                onClick={() => setFilterTanggal(aktif ? '' : tgl)}
                title={`${tgl}${list.length > 0 ? ` — ${list.length} tenggat` : ''}`}
                className={`min-h-12 rounded border p-1 text-left transition cursor-pointer ${
                  aktif
                    ? 'border-navy-900 bg-navy-900 text-white'
                    : adalahHariIni
                      ? 'border-amber-400 bg-amber-50'
                      : diBulanIni
                        ? 'border-slate-200 bg-white hover:bg-slate-50'
                        : 'border-slate-100 bg-slate-50/50 text-slate-400'
                }`}
              >
                <span className={`text-xs font-bold ${adalahHariIni && !aktif ? 'text-amber-800' : ''}`}>{Number(tgl.slice(8, 10))}</span>
                {list.length > 0 && (
                  <span className={`block text-[10px] font-semibold truncate ${aktif ? 'text-gold-300' : 'text-rose-700'}`}>
                    {list.length} tenggat
                  </span>
                )}
                {list.slice(0, 1).map((t) => (
                  <span key={t.id} className={`block text-[10px] truncate ${aktif ? 'text-slate-200' : 'text-slate-600'}`}>
                    {t.judul}
                  </span>
                ))}
              </button>
            );
          })}
        </div>
        {filterTanggal && (
          <p className="mt-2 text-xs text-slate-600">
            Menampilkan tenggat tanggal <strong>{filterTanggal}</strong>.{' '}
            <button type="button" onClick={() => setFilterTanggal('')} className="underline font-semibold">Hapus filter tanggal</button>
          </p>
        )}
      </div>

      {/* Form tambah/ubah */}
      {formTerbuka && (
        <div className="ui-card p-4 space-y-3">
          <h3 className="ui-section-title !normal-case !tracking-normal !text-sm">
            {editingId ? 'Ubah Tenggat' : 'Tambah Tenggat Baru'}
          </h3>
          {formErrors.length > 0 && (
            <ul className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 list-disc list-inside">
              {formErrors.map((e) => (<li key={e}>{e}</li>))}
            </ul>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="ui-label">Judul tugas *</label>
              <input value={form.judul} onChange={(e) => setForm({ ...form, judul: e.target.value })} className="ui-input" maxLength={120} placeholder="cth. Kirim laporan BOS triwulan" />
            </div>
            <div className="sm:col-span-2">
              <label className="ui-label">Deskripsi</label>
              <textarea value={form.deskripsi} onChange={(e) => setForm({ ...form, deskripsi: e.target.value })} className="ui-input" rows={2} placeholder="Catatan singkat. Jangan isi data pribadi siswa." />
            </div>
            <div>
              <label className="ui-label">Tanggal jatuh tempo</label>
              <input type="date" value={form.tanggalJatuhTempo} onChange={(e) => setForm({ ...form, tanggalJatuhTempo: e.target.value })} className="ui-input" />
              <p className="ui-hint mt-1">Kosong = tanpa tenggat (tidak memicu pengingat).</p>
            </div>
            <div>
              <label className="ui-label">Kategori</label>
              <input value={form.kategori} onChange={(e) => setForm({ ...form, kategori: e.target.value })} className="ui-input" maxLength={40} placeholder="Laporan / Verifikasi / Rapat" />
            </div>
            <div>
              <label className="ui-label">Penanggung jawab</label>
              <select value={form.penanggungJawab} onChange={(e) => setForm({ ...form, penanggungJawab: e.target.value })} className="ui-input">
                <option value="">Umum (semua dapat melihat)</option>
                {users.map((u) => (
                  <option key={u.id} value={u.username}>@{u.username} — {u.namaLengkap} ({u.role})</option>
                ))}
              </select>
              <p className="ui-hint mt-1">Operator yang ditunjuk dapat menandai tugasnya selesai.</p>
            </div>
            <div>
              <label className="ui-label">Rombel terkait (opsional)</label>
              <input value={form.rombel} onChange={(e) => setForm({ ...form, rombel: e.target.value })} className="ui-input" placeholder="cth. 7A" />
            </div>
            <div>
              <label className="ui-label">Tautan langsung ke tindakan</label>
              <select value={form.tautanAksi} onChange={(e) => setForm({ ...form, tautanAksi: e.target.value })} className="ui-input">
                {TAUTAN_AKSI_KALENDER.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="ui-label">Prioritas</label>
              <select value={form.prioritas} onChange={(e) => setForm({ ...form, prioritas: e.target.value })} className="ui-input">
                <option value="rendah">Rendah</option>
                <option value="normal">Normal</option>
                <option value="tinggi">Tinggi</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void simpanForm()} disabled={menyimpan} className="ui-btn ui-btn-primary">
              {menyimpan ? 'Menyimpan...' : 'Simpan'}
            </button>
            <button type="button" onClick={() => setFormTerbuka(false)} className="ui-btn ui-btn-ghost">Batal</button>
          </div>
        </div>
      )}

      {/* Filter + daftar */}
      <div className="ui-card p-3 flex flex-wrap gap-2 items-center">
        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari judul / kategori / penanggung jawab…"
          className="ui-input !w-64"
        />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as FilterStatus)} className="ui-input !w-48">
          <option value="semua">Semua status</option>
          <option value="belum">Belum selesai</option>
          <option value="selesai">Selesai</option>
          <option value="terlambat">Terlambat</option>
          <option value="hari_ini">Jatuh tempo hari ini</option>
          <option value="segera">Segera jatuh tempo</option>
        </select>
        <span className="text-xs text-slate-500 ml-auto">{tersaring.length} tugas ditampilkan</span>
        {terpilih.size > 0 && (
          <button type="button" onClick={() => void selesaikanTerpilih()} className="ui-btn ui-btn-primary">
            <CheckCircle2 className="w-4 h-4" /> Selesaikan {terpilih.size} terpilih
          </button>
        )}
      </div>

      <div className="ui-card overflow-hidden">
        {tersaring.length === 0 ? (
          <p className="p-6 text-center text-xs text-slate-500">
            Belum ada tenggat yang cocok dengan filter. {dapatKelola ? 'Tambah tenggat lewat tombol di atas.' : ''}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tersaring.map((t) => {
              const s = statusPerTugas.get(t.id) || 'mendatang';
              const dapatUbahStatus = bolehUbahStatusTenggat(currentUser, t);
              return (
                <li key={t.id} className="p-4 flex flex-wrap gap-3 items-start">
                  {t.status !== 'selesai' && dapatUbahStatus && (
                    <input
                      type="checkbox"
                      checked={terpilih.has(t.id)}
                      onChange={() => togglePilih(t.id)}
                      className="mt-1"
                      aria-label={`Pilih tugas ${t.judul}`}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900">
                      {t.judul}
                      {t.kategori && <span className="ml-2 text-[11px] font-semibold text-slate-500">• {t.kategori}</span>}
                    </p>
                    {t.deskripsi && <p className="text-xs text-slate-600 mt-0.5">{t.deskripsi}</p>}
                    <p className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {t.tanggalJatuhTempo ? `Tenggat: ${formatTanggalId(t.tanggalJatuhTempo)}` : 'Tanpa tenggat'}
                      </span>
                      <span>Penanggung jawab: {t.penanggungJawab ? `@${t.penanggungJawab}` : 'Umum'}</span>
                      {t.rombel && <span>Rombel: {t.rombel}</span>}
                      {t.status === 'selesai' && t.selesaiOleh && <span>Selesai oleh @{t.selesaiOleh}</span>}
                    </p>
                  </div>
                  <span className={`ui-badge ${STATUS_BADGE[s]}`}>{labelStatusTenggat(s)}</span>
                  <div className="flex gap-1">
                    {t.tautanAksi && (
                      <button
                        type="button"
                        onClick={() => onNavigate(t.tautanAksi as string)}
                        className="ui-btn ui-btn-outline !px-2"
                        title="Buka halaman tindakan"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    )}
                    {dapatUbahStatus && (
                      t.status === 'selesai' ? (
                        <button type="button" onClick={() => void ubahStatus(t, false)} className="ui-btn ui-btn-outline" title="Buka kembali tugas">
                          Buka Lagi
                        </button>
                      ) : (
                        <button type="button" onClick={() => void ubahStatus(t, true)} className="ui-btn ui-btn-primary" title="Tandai selesai">
                          <CheckCircle2 className="w-4 h-4" /> Selesai
                        </button>
                      )
                    )}
                    {dapatKelola && (
                      <>
                        <button type="button" onClick={() => bukaFormUbah(t)} className="ui-btn ui-btn-outline !px-2" title="Ubah tenggat">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => void hapusTugas(t)} className="ui-btn ui-btn-danger !px-2" title="Hapus tenggat">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="text-[11px] text-slate-400">
        Pengingat disampaikan sekali per tugas + tenggat + ambang, hanya saat aplikasi dibuka.
        Tidak ada pengiriman email/WhatsApp/push — lihat Pengaturan untuk detail kanal.
      </p>
    </div>
  );
};
