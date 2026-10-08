import React, { useMemo, useState } from 'react';
import {
  Archive,
  Lock,
  LockOpen,
  Search,
  GraduationCap,
  TrendingUp,
  Users,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Printer,
} from 'lucide-react';
import { Siswa, SekolahProfile, TutupTahunAjaran, PetaKelas, AppUser } from '../types';
import { PageControl } from './PageControl';
import { toast, confirmDialog } from '../utils/notify';
import { cekTulisTahun, tahanMaksSesi } from '../utils/sesi';
import {
  tahunBerikutnya,
  tingkatAkhir,
  tingkatAktifSiswa,
  rombelTarget,
} from '../utils/arsip';

export interface RencanaRombel {
  key: string;
  tingkat: string;
  rombel: string;
  ids: string[];
  status: 'Naik Kelas' | 'Tinggal di Kelas' | 'Lulus';
  nextTingkat: string;
  nextRombel: string;
}

interface ArsipViewProps {
  siswa: Siswa[];
  sekolah: SekolahProfile;
  tutup: TutupTahunAjaran[];
  isAdmin: boolean;
  userName?: string;
  currentUser?: AppUser | null;
  /** Sesi tahun ajaran login — default tahun yang ditutup & penanda kartu sesi. */
  sessionTahun?: string | null;
  rombelAkses?: string[];
  busy?: boolean;
  /** Pemetaan resmi tahun tujuan — dipakai sebagai saran target rombel. */
  petaKelas?: PetaKelas[];
  onTutupTahun: (args: {
    tahunTutup: string;
    tahunBaru: string;
    groups: RencanaRombel[];
  }) => Promise<void>;
  onBukaTahun: (tahunAjaran: string) => Promise<void>;
}

export const ArsipView: React.FC<ArsipViewProps> = ({
  siswa,
  sekolah,
  tutup,
  isAdmin,
  userName,
  currentUser,
  sessionTahun,
  rombelAkses,
  busy,
  petaKelas,
  onTutupTahun,
  onBukaTahun,
}) => {
  const jenjang = sekolah.jenjang || 'SMP';
  const final = tingkatAkhir(jenjang);
  const sesiDefault = (sessionTahun || '').trim() || sekolah.tahunAjaran || '2026/2027';
  const [wizardOpen, setWizardOpen] = useState(false);
  const [tahunTutup, setTahunTutup] = useState(sesiDefault);
  const [tahunBaru, setTahunBaru] = useState(tahunBerikutnya(sesiDefault) || '');
  const [plan, setPlan] = useState<RencanaRombel[]>([]);
  const [planBuiltFor, setPlanBuiltFor] = useState('');
  const [executing, setExecuting] = useState(false);
  const [rosterSearch, setRosterSearch] = useState<Record<string, string>>({});
  const [rosterPage, setRosterPage] = useState<Record<string, number>>({});
  const [openingId, setOpeningId] = useState<string | null>(null);

  const aktif = useMemo(() => (siswa || []).filter((s) => s.statusSiswa === 'Aktif'), [siswa]);

  // Cutoff sesi: arsip di atas sesi aktif tidak ditampilkan (kunci tetap berlaku global).
  const sesiEfektif = (sessionTahun || sekolah.tahunAjaran || '').trim();
  const tutupTampil = useMemo(
    () => tahanMaksSesi(tutup || [], (t) => t.tahunAjaran, sesiEfektif),
    [tutup, sesiEfektif]
  );

  /** Saran rombel dari pemetaan resmi tahun baru (bila sudah disusun di modul Pemetaan Kelas). */
  const saranRombelBaru = useMemo(() => {
    const t = (tahunBaru || '').trim();
    if (!t) return [];
    return (petaKelas || [])
      .filter((p) => p.tahunAjaran === t)
      .map((p) => p.rombel)
      .sort();
  }, [petaKelas, tahunBaru]);

  const buildPlan = () => {
    const groups = new Map<string, RencanaRombel>();
    for (const s of aktif) {
      const tingkat = tingkatAktifSiswa(s);
      const rombel = (s.rombelSaatIni || '').trim();
      const key = `${tingkat}::${rombel}`;
      let g = groups.get(key);
      if (!g) {
        const lulus = tingkat === final;
        const nextT = lulus ? tingkat : String(Math.min(9, Number(tingkat || '0') + 1));
        g = {
          key,
          tingkat,
          rombel,
          ids: [],
          status: lulus ? 'Lulus' : 'Naik Kelas',
          nextTingkat: nextT,
          nextRombel: lulus ? rombel : rombelTarget(rombel, nextT),
        };
        groups.set(key, g);
      }
      g.ids.push(s.id);
    }
    const list = [...groups.values()].sort((a, b) =>
      a.tingkat.localeCompare(b.tingkat) || a.rombel.localeCompare(b.rombel)
    );
    setPlan(list);
    setPlanBuiltFor(`${tahunTutup}::${aktif.length}`);
  };

  const planStale = planBuiltFor !== `${tahunTutup}::${aktif.length}`;
  const totalLulus = plan.filter((g) => g.status === 'Lulus').reduce((n, g) => n + g.ids.length, 0);
  const totalNaik = plan.filter((g) => g.status === 'Naik Kelas').reduce((n, g) => n + g.ids.length, 0);
  const totalTinggal = plan.filter((g) => g.status === 'Tinggal di Kelas').reduce((n, g) => n + g.ids.length, 0);

  const handleExecute = async () => {
    if (!tahunTutup.trim() || !/^\d{4}\/\d{4}$/.test(tahunTutup.trim())) {
      toast('Tahun yang ditutup wajib berformat TAHUN/TAHUN (cth. 2026/2027).', 'error');
      return;
    }
    if (!tahunBaru.trim() || !/^\d{4}\/\d{4}$/.test(tahunBaru.trim())) {
      toast('Tahun ajaran baru wajib berformat TAHUN/TAHUN (cth. 2027/2028).', 'error');
      return;
    }
    // Fondasi sesi: tutup & tahun baru wajib dalam hak tahun user.
    const kunciLama = tutup.map((t) => t.tahunAjaran);
    const tolakTutup = cekTulisTahun(currentUser, tahunTutup.trim(), kunciLama);
    if (tolakTutup) {
      toast(tolakTutup, 'error');
      return;
    }
    const tolakBaru = cekTulisTahun(currentUser, tahunBaru.trim(), kunciLama);
    if (tolakBaru) {
      toast(tolakBaru, 'error');
      return;
    }
    if (tutup.some((t) => t.tahunAjaran === tahunTutup.trim())) {
      toast(`Tahun ${tahunTutup.trim()} sudah ditutup sebelumnya.`, 'error');
      return;
    }
    if (plan.length === 0) {
      toast('Rencana promosi kosong — tidak ada siswa aktif.', 'warning');
      return;
    }
    const ok = await confirmDialog(
      `Tutup & kunci tahun ${tahunTutup.trim()}? Lulus: ${totalLulus}, Naik: ${totalNaik}, Tinggal: ${totalTinggal}. Tahun aktif menjadi ${tahunBaru.trim()}. Arsip terkunci dan hanya bisa dibuka administrator.`,
      { confirmLabel: 'Ya, Tutup Tahun', danger: true }
    );
    if (!ok) return;
    setExecuting(true);
    try {
      await onTutupTahun({ tahunTutup: tahunTutup.trim(), tahunBaru: tahunBaru.trim(), groups: plan });
      setWizardOpen(false);
      setPlan([]);
      setPlanBuiltFor('');
    } finally {
      setExecuting(false);
    }
  };

  const handleBuka = async (t: TutupTahunAjaran) => {
    const ok = await confirmDialog(
      `Buka kunci tahun ${t.tahunAjaran}? Pembatalan TIDAK mengembalikan rombel/status yang sudah dipromosi — perbaiki manual bila perlu.`,
      { confirmLabel: 'Ya, Buka Kunci', danger: true }
    );
    if (!ok) return;
    setOpeningId(t.tahunAjaran);
    try {
      await onBukaTahun(t.tahunAjaran);
    } finally {
      setOpeningId(null);
    }
  };

  const rosterTerlihat = (t: TutupTahunAjaran) => {
    const q = (rosterSearch[t.tahunAjaran] || '').trim().toLowerCase();
    let rows = t.roster || [];
    if (!isAdmin && rombelAkses && rombelAkses.length > 0) {
      rows = rows.filter((r) => rombelAkses.includes(r.rombel));
    }
    if (q) {
      rows = rows.filter(
        (r) =>
          r.namaLengkap.toLowerCase().includes(q) ||
          (r.nisn || '').includes(q) ||
          (r.rombel || '').toLowerCase().includes(q)
      );
    }
    return rows;
  };

  return (
    <div className="space-y-5">
      {/* Kepala arsip + aksi tutup tahun */}
      <div className="ui-card p-5 anim-fade-up">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-navy-900 text-gold-300 flex items-center justify-center shrink-0">
              <Archive className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">
                Arsip Tahun Ajaran ({tutupTampil.length} tahun terkunci)
              </h2>
              <p className="text-[11px] text-slate-500">
                Potret roster tiap tutup tahun — tidak berubah walau data berjalan. Tahun aktif: {sekolah.tahunAjaran}
                {sessionTahun ? (
                  <span className="ml-1.5 font-mono font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                    Sesi {sessionTahun}
                  </span>
                ) : null}
                {userName ? ` • ${userName}` : ''}
              </p>
            </div>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                const d = (sessionTahun || '').trim() || sekolah.tahunAjaran || '2026/2027';
                setTahunTutup(d);
                setTahunBaru(tahunBerikutnya(d) || '');
                setPlan([]);
                setPlanBuiltFor('');
                setWizardOpen(true);
              }}
              className="ui-btn ui-btn-primary"
            >
              <Lock className="w-3.5 h-3.5" />
              Tutup Tahun Ajaran
            </button>
          )}
        </div>
        {!isAdmin && (
          <p className="mt-3 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            Arsip bersifat baca-saja untuk operator. Penutupan & pembukaan kunci hanya oleh administrator.
          </p>
        )}
      </div>

      {/* Wizard tutup tahun */}
      {wizardOpen && isAdmin && (
        <div className="ui-card p-5 space-y-4 anim-fade-up border-blue-200">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <Lock className="w-4 h-4 text-blue-700" />
            Tutup & Kunci Tahun Ajaran
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Tahun yang ditutup *</label>
              <input
                type="text"
                value={tahunTutup}
                onChange={(e) => setTahunTutup(e.target.value)}
                placeholder="2026/2027"
                pattern="\d{4}/\d{4}"
                className="ui-input font-mono"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Tahun ajaran aktif baru *</label>
              <input
                type="text"
                value={tahunBaru}
                onChange={(e) => setTahunBaru(e.target.value)}
                placeholder="2027/2028"
                pattern="\d{4}/\d{4}"
                className="ui-input font-mono"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={buildPlan} className="ui-btn ui-btn-outline">
              <Users className="w-3.5 h-3.5" />
              Susun rencana ({aktif.length} siswa aktif)
            </button>
            {plan.length > 0 && (
              <span className="text-[11px] text-slate-600">
                Lulus: <strong className="text-emerald-700">{totalLulus}</strong> • Naik:{' '}
                <strong className="text-blue-700">{totalNaik}</strong> • Tinggal:{' '}
                <strong className="text-amber-700">{totalTinggal}</strong>
                {planStale && <span className="text-rose-600 font-semibold"> • data berubah, susun ulang!</span>}
              </span>
            )}
          </div>
          {plan.length > 0 && (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              {saranRombelBaru.length > 0 && (
                <p className="px-3 pt-2 text-[11px] text-emerald-700 font-semibold">
                  Saran target dari Pemetaan Kelas {tahunBaru}: {saranRombelBaru.join(', ')}
                </p>
              )}
              <datalist id="saran-rombel-baru">
                {saranRombelBaru.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5">Rombel lama</th>
                    <th className="p-2.5 text-center">Siswa</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Tingkat baru</th>
                    <th className="p-2.5">Rombel baru</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {plan.map((g) => (
                    <tr key={g.key}>
                      <td className="p-2.5 font-bold text-slate-900">
                        Kelas {g.tingkat} ({g.rombel || '-'})
                      </td>
                      <td className="p-2.5 text-center font-mono">{g.ids.length}</td>
                      <td className="p-2.5">
                        {g.tingkat === final ? (
                          <span className="ui-badge ui-badge-emerald">Lulus</span>
                        ) : (
                          <select
                            value={g.status}
                            onChange={(e) =>
                              setPlan((prev) =>
                                prev.map((x) =>
                                  x.key === g.key
                                    ? { ...x, status: e.target.value as RencanaRombel['status'] }
                                    : x
                                )
                              )
                            }
                            className="ui-input !w-auto !py-1.5"
                            aria-label={`Status rombel ${g.rombel}`}
                          >
                            <option value="Naik Kelas">Naik Kelas</option>
                            <option value="Tinggal di Kelas">Tinggal di Kelas</option>
                          </select>
                        )}
                      </td>
                      <td className="p-2.5">
                        {g.status === 'Lulus' ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <input
                            value={g.nextTingkat}
                            onChange={(e) =>
                              setPlan((prev) =>
                                prev.map((x) => (x.key === g.key ? { ...x, nextTingkat: e.target.value } : x))
                              )
                            }
                            className="ui-input !w-20 font-mono"
                            aria-label={`Tingkat baru ${g.rombel}`}
                          />
                        )}
                      </td>
                      <td className="p-2.5">
                        {g.status === 'Lulus' ? (
                          <span className="text-slate-400">— (arsip)</span>
                        ) : (
                          <>
                            <input
                              value={g.nextRombel}
                              list={saranRombelBaru.length > 0 ? 'saran-rombel-baru' : undefined}
                              onChange={(e) =>
                                setPlan((prev) =>
                                  prev.map((x) => (x.key === g.key ? { ...x, nextRombel: e.target.value.toUpperCase() } : x))
                                )
                              }
                              className="ui-input !w-24 font-mono uppercase"
                              aria-label={`Rombel baru ${g.rombel}`}
                            />
                            {saranRombelBaru.length > 0 && !saranRombelBaru.includes(g.nextRombel.trim().toUpperCase()) && (
                              <span className="block text-[10px] text-amber-700 font-semibold mt-0.5">
                                Di luar pemetaan {tahunBaru}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setWizardOpen(false)} className="ui-btn ui-btn-ghost">
              Batal
            </button>
            <button
              type="button"
              disabled={executing || busy || plan.length === 0 || planStale}
              onClick={() => void handleExecute()}
              className="ui-btn ui-btn-primary disabled:opacity-50"
            >
              {executing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
              {executing ? 'Menutup…' : 'Tutup, promosikan & kunci'}
            </button>
          </div>
        </div>
      )}

      {/* Daftar tahun terkunci */}
      {tutupTampil.length === 0 ? (
        <div className="ui-card p-10 text-center space-y-3">
          <GraduationCap className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-xs text-slate-500">
            Belum ada tahun ajaran yang ditutup. Tutup tahun berjalan di akhir tahun ajaran agar
            arsip 7 → 8 → 9 → lulus tersimpan permanen sebelum sinkronisasi Dapodik tahun baru.
          </p>
        </div>
      ) : (
        tutupTampil.map((t) => {
          const rows = rosterTerlihat(t);
          const pageSize = 20;
          const page = Math.min(rosterPage[t.tahunAjaran] || 1, Math.max(1, Math.ceil(rows.length / pageSize)));
          const paged = rows.slice((page - 1) * pageSize, page * pageSize);
          const isSesi = !!sessionTahun && t.tahunAjaran === sessionTahun.trim();
          return (
            <div key={t.tahunAjaran} className={`ui-card p-5 space-y-4 anim-fade-up${isSesi ? ' ring-2 ring-amber-300 border-amber-300' : ''}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-xl bg-navy-900 text-gold-300 flex items-center justify-center font-extrabold text-[11px]">
                    {t.tahunAjaran.slice(2, 4)}
                  </span>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">
                      TP {t.tahunAjaran} — Terkunci
                      {isSesi && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-mono">
                          SESI
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Ditutup {new Date(t.ditutupPada).toLocaleString('id-ID')}
                      {t.ditutupOleh ? ` oleh ${t.ditutupOleh}` : ''}
                      {t.tahunAktifBaru ? ` • aktif baru: ${t.tahunAktifBaru}` : ''} •{' '}
                      {t.ringkasan.totalSiswa} siswa
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => window.print()} className="ui-btn ui-btn-outline !py-1.5" title="Cetak arsip tahun ini">
                    <Printer className="w-3.5 h-3.5" />
                    Cetak
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      disabled={openingId === t.tahunAjaran || busy}
                      onClick={() => void handleBuka(t)}
                      className="ui-btn ui-btn-ghost !text-amber-700 hover:!bg-amber-50 !py-1.5 disabled:opacity-50"
                    >
                      {openingId === t.tahunAjaran ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <LockOpen className="w-3.5 h-3.5" />
                      )}
                      Buka kunci
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="ui-badge ui-badge-slate">Total {t.ringkasan.totalSiswa}</span>
                <span className="ui-badge ui-badge-emerald flex items-center gap-1">
                  <GraduationCap className="w-3 h-3" /> Lulus {t.ringkasan.lulus}
                </span>
                <span className="ui-badge ui-badge-blue flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Naik {t.ringkasan.naik}
                </span>
                <span className="ui-badge ui-badge-amber">Tinggal {t.ringkasan.tinggal}</span>
                <span className="ui-badge ui-badge-rose">Mutasi {t.ringkasan.mutasi}</span>
                {Object.entries(t.ringkasan.perTingkat || {})
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([tk, n]) => (
                    <span key={tk} className="ui-badge ui-badge-indigo">
                      Kls {tk}: {n}
                    </span>
                  ))}
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  value={rosterSearch[t.tahunAjaran] || ''}
                  onChange={(e) => {
                    setRosterSearch((p) => ({ ...p, [t.tahunAjaran]: e.target.value }));
                    setRosterPage((p) => ({ ...p, [t.tahunAjaran]: 1 }));
                  }}
                  placeholder="Cari roster arsip (nama/NISN/rombel)…"
                  className="ui-input !pl-8 !py-1.5"
                  aria-label={`Cari roster ${t.tahunAjaran}`}
                />
              </div>

              {rows.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic py-4 text-center">
                  {isAdmin || !rombelAkses || rombelAkses.length === 0
                    ? 'Tidak ada baris yang cocok.'
                    : 'Tidak ada roster arsip pada rombel kewenangan Anda.'}
                </p>
              ) : (
                <>
                  <div className="ui-table-wrap">
                    <table className="ui-table">
                      <thead>
                        <tr>
                          <th className="w-10 text-center">No</th>
                          <th>Nama</th>
                          <th>NISN</th>
                          <th className="text-center">Tingkat</th>
                          <th>Rombel</th>
                          <th>Status saat tutup</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paged.map((r, i) => (
                          <tr key={r.siswaId}>
                            <td className="text-center text-slate-400 font-mono text-[11px]">
                              {(page - 1) * pageSize + i + 1}
                            </td>
                            <td className="font-bold text-slate-900 text-xs">{r.namaLengkap}</td>
                            <td className="font-mono text-xs">{r.nisn || '-'}</td>
                            <td className="text-center">{r.tingkat ? `Kelas ${r.tingkat}` : '-'}</td>
                            <td>
                              <span className="ui-badge ui-badge-indigo">{r.rombel || '-'}</span>
                            </td>
                            <td className="text-xs">{r.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <PageControl
                    page={page}
                    totalPages={Math.max(1, Math.ceil(rows.length / pageSize))}
                    totalItems={rows.length}
                    pageSize={pageSize}
                    itemName="baris arsip"
                    onPageChange={(p) => setRosterPage((prev) => ({ ...prev, [t.tahunAjaran]: p }))}
                    onPageSizeChange={() => undefined}
                  />
                </>
              )}
            </div>
          );
        })
      )}

      {/* Catatan ritme Dapodik */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-[11px] text-amber-900 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 mt-px shrink-0" />
        <p className="leading-relaxed">
          <strong>Urutan tahun ajaran baru:</strong> (1) Tutup & kunci tahun lama di sini
          (lulusan diabadikan, kelas berjalan dipromosi), (2) jadikan tahun baru aktif,
          (3) baru Sinkron Dapodik — siswa baru akan masuk, lulusan tak lagi muncul di
          Dapodik dan <strong>tidak</strong> terhapus/terubah dari arsip. Sinkron tidak
          pernah menimpa rombel dengan tebakan dan tidak mengubah status arsip.
          <span className="flex items-center gap-1 mt-1 text-emerald-800 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" /> NISN/NIK/NIPD stabil; rombel & status bergerak per tahun.
          </span>
        </p>
      </div>
    </div>
  );
};
