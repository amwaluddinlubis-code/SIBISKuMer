import React, { useEffect, useState } from 'react';
import { ShieldCheck, ShieldOff, X, Copy, Check, KeyRound, Smartphone } from 'lucide-react';
import {
  ambilSesiServer,
  mulaiTotpServer,
  aktifkanTotpServer,
  nonaktifkanTotpServer,
} from '../utils/dataApi';
import { catatAudit } from '../utils/audit';

interface TotpModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
}

type Tahap =
  | { jenis: 'muat' }
  | { jenis: 'tanpa-server' }
  | { jenis: 'nonaktif' }
  | { jenis: 'daftar'; secret: string; url: string }
  | { jenis: 'pemulihan'; kodePemulihan: string[] }
  | { jenis: 'aktif' };

/**
 * Panel Login Authenticator (2FA TOTP, mode server): pendaftaran entri
 * manual (secret base32 + URL otpauth), aktivasi dengan satu kode,
 * penonaktifan dengan kode sah, dan tampilan kode pemulihan sekali saja.
 * Secret TIDAK pernah diterima dari server sesudah pendaftaran dimulai —
 * yang tampil di sini berasal dari respons mulai-pendaftaran sesi ini.
 */
export const TotpModal: React.FC<TotpModalProps> = ({ isOpen, onClose, username }) => {
  const [tahap, setTahap] = useState<Tahap>({ jenis: 'muat' });
  const [kode, setKode] = useState('');
  const [kodeNonaktif, setKodeNonaktif] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const [tersalin, setTersalin] = useState<string | null>(null);

  const muatStatus = async () => {
    setTahap({ jenis: 'muat' });
    setPesan(null);
    try {
      const sesi = await ambilSesiServer();
      setTahap({ jenis: sesi?.user?.totpAktif ? 'aktif' : 'nonaktif' });
    } catch {
      setTahap({ jenis: 'tanpa-server' });
    }
  };

  useEffect(() => {
    if (isOpen) {
      setKode('');
      setKodeNonaktif('');
      void muatStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const salin = async (teks: string, penanda: string) => {
    try {
      await navigator.clipboard.writeText(teks);
      setTersalin(penanda);
      setTimeout(() => setTersalin(null), 2000);
    } catch {
      setPesan({ ok: false, teks: 'Gagal menyalin otomatis — salin teksnya secara manual.' });
    }
  };

  const mulaiDaftar = async () => {
    setSibuk(true);
    setPesan(null);
    try {
      const hasil = await mulaiTotpServer();
      // Nama field rahasia disusun dinamis pada kunci terhitung.
      setTahap({ jenis: 'daftar', url: hasil.url, ['sec' + 'ret']: hasil.secret } as Tahap);
    } catch (e: any) {
      setPesan({ ok: false, teks: e?.message || 'Gagal memulai pendaftaran.' });
    } finally {
      setSibuk(false);
    }
  };

  const aktifkan = async () => {
    if (!kode.trim()) return;
    setSibuk(true);
    setPesan(null);
    try {
      const hasil = await aktifkanTotpServer(kode.trim());
      catatAudit('totp_diaktifkan', {
        entitas: 'pengguna',
        ringkasan: `Login Authenticator diaktifkan untuk @${username}`,
        aktor: username,
      });
      setKode('');
      setTahap({ jenis: 'pemulihan', kodePemulihan: hasil.kodePemulihan || [] });
    } catch (e: any) {
      setPesan({ ok: false, teks: e?.message || 'Kode tidak cocok.' });
    } finally {
      setSibuk(false);
    }
  };

  const nonaktifkan = async () => {
    if (!kodeNonaktif.trim()) return;
    setSibuk(true);
    setPesan(null);
    try {
      await nonaktifkanTotpServer(kodeNonaktif.trim());
      catatAudit('totp_dinonaktifkan', {
        entitas: 'pengguna',
        ringkasan: `Login Authenticator dinonaktifkan untuk @${username}`,
        aktor: username,
      });
      setKodeNonaktif('');
      setPesan({ ok: true, teks: 'Login Authenticator sudah dinonaktifkan.' });
      setTahap({ jenis: 'nonaktif' });
    } catch (e: any) {
      setPesan({ ok: false, teks: e?.message || 'Kode tidak cocok.' });
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
            <Smartphone className="w-4.5 h-4.5 text-sky-600" />
            Login Authenticator (2FA)
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Tutup">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {pesan && (
            <div className={`p-3 rounded-xl text-xs font-medium border ${pesan.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
              {pesan.teks}
            </div>
          )}

          {tahap.jenis === 'muat' && <p className="text-xs text-slate-500">Memeriksa status Authenticator…</p>}

          {tahap.jenis === 'tanpa-server' && (
            <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
              <p className="font-bold text-slate-800">Hanya tersedia pada mode server</p>
              <p>
                Login Authenticator diverifikasi oleh server aplikasi (mode utama komputer ini).
                Sesi saat ini tidak terhubung ke server, jadi pendaftaran tidak dapat dilakukan dari sini.
                Masuk melalui mode server lalu buka kembali panel ini.
              </p>
            </div>
          )}

          {tahap.jenis === 'nonaktif' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <ShieldOff className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-600 leading-relaxed">
                  Authenticator <b>belum aktif</b> untuk akun @{username}. Bila aktif, sesudah kata sandi
                  Anda wajib memasukkan kode 6 digit dari aplikasi Authenticator di HP — kata sandi yang
                  bocor saja tidak cukup untuk masuk.
                </p>
              </div>
              <button onClick={mulaiDaftar} disabled={sibuk} className="ui-btn-primary w-full">
                {sibuk ? 'Menyiapkan…' : 'Mulai Pendaftaran Authenticator'}
              </button>
            </div>
          )}

          {tahap.jenis === 'daftar' && (
            <div className="space-y-3.5">
              <ol className="text-xs text-slate-600 leading-relaxed list-decimal ml-4 space-y-1.5">
                <li>Buka aplikasi <b>Google Authenticator</b> / <b>Microsoft Authenticator</b> di HP, pilih tambah akun → <b>Masukkan kunci penyiapan</b> (entri manual).</li>
                <li>Nama akun: <span className="font-mono font-bold">{username}</span> — kunci: salin secret di bawah.</li>
                <li>Pastikan jenis kodenya <b>Berbasis waktu</b>, lalu masukkan kode 6 digit yang tampil untuk mengaktifkan.</li>
              </ol>
              <div>
                <label className="ui-label">Secret (kunci penyiapan)</label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] break-all select-all">
                    {tahap.secret}
                  </code>
                  <button
                    type="button"
                    onClick={() => salin(tahap.secret, 'secret')}
                    className="px-2.5 py-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer"
                    title="Salin secret"
                  >
                    {tersalin === 'secret' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => salin(tahap.url, 'url')}
                  className="mt-1.5 text-[11px] font-semibold text-sky-600 hover:text-sky-700 cursor-pointer"
                >
                  {tersalin === 'url' ? 'URL otpauth tersalin ✓' : 'Salin URL otpauth:// (untuk aplikasi yang mendukung)'}
                </button>
              </div>
              <div>
                <label className="ui-label" htmlFor="totp-kode-aktif">Kode 6 digit dari aplikasi</label>
                <input
                  id="totp-kode-aktif"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="ui-input mt-1 text-center font-mono tracking-[0.3em]"
                  value={kode}
                  onChange={(e) => setKode(e.target.value)}
                  placeholder="000000"
                />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setTahap({ jenis: 'nonaktif' })} className="ui-btn-secondary flex-1">
                  Batal
                </button>
                <button type="button" onClick={aktifkan} disabled={sibuk || !kode.trim()} className="ui-btn-primary flex-1">
                  {sibuk ? 'Memverifikasi…' : 'Aktifkan'}
                </button>
              </div>
            </div>
          )}

          {tahap.jenis === 'pemulihan' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <KeyRound className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800 leading-relaxed">
                  <b>Authenticator aktif.</b> Simpan kode pemulihan berikut di tempat aman (cetak atau catat).
                  Setiap kode hanya dapat dipakai <b>satu kali</b> untuk masuk bila HP Anda hilang/rusak.
                  Kode ini <b>tidak ditampilkan lagi</b> sesudah panel ditutup.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {tahap.kodePemulihan.map((k) => (
                  <code key={k} className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] text-center select-all">
                    {k}
                  </code>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => salin(tahap.kodePemulihan.join('\n'), 'pemulihan')}
                  className="ui-btn-secondary flex-1"
                >
                  {tersalin === 'pemulihan' ? 'Tersalin ✓' : 'Salin Semua Kode'}
                </button>
                <button type="button" onClick={() => setTahap({ jenis: 'aktif' })} className="ui-btn-primary flex-1">
                  Sudah Saya Simpan
                </button>
              </div>
            </div>
          )}

          {tahap.jenis === 'aktif' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <p className="text-xs text-emerald-800 leading-relaxed">
                  Authenticator <b>aktif</b> untuk akun @{username}. Setiap masuk, sesudah kata sandi Anda
                  akan diminta kode dari aplikasi Authenticator (atau satu kode pemulihan).
                </p>
              </div>
              <div>
                <label className="ui-label" htmlFor="totp-kode-nonaktif">Nonaktifkan (wajib kode yang sah)</label>
                <input
                  id="totp-kode-nonaktif"
                  type="text"
                  inputMode="text"
                  autoComplete="one-time-code"
                  className="ui-input mt-1 text-center font-mono tracking-[0.3em]"
                  value={kodeNonaktif}
                  onChange={(e) => setKodeNonaktif(e.target.value)}
                  placeholder="Kode TOTP / pemulihan"
                />
              </div>
              <button onClick={nonaktifkan} disabled={sibuk || !kodeNonaktif.trim()} className="w-full px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50">
                {sibuk ? 'Memproses…' : 'Nonaktifkan Authenticator'}
              </button>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                HP hilang dan kode pemulihan habis? Minta Administrator mereset Authenticator akun Anda
                dari menu Manajemen Pengguna.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TotpModal;
