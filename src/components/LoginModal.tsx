import React, { useState, useEffect } from 'react';
import { KeyRound, UserCheck, AlertCircle, LogIn, School } from 'lucide-react';
import { AppUser } from '../types';
import { getAllUsers, saveUser } from '../utils/db';
import { verifyPassword, ensurePasswordHash } from '../utils/crypto';
import { initialUsersList } from '../data/initialData';

interface LoginModalProps {
  users?: AppUser[];
  isOpen?: boolean;
  onLogin?: (user: AppUser) => void;
  onLoginSuccess?: (user: AppUser) => void;
  onClose?: () => void;
  canClose?: boolean;
  notice?: string;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  users,
  isOpen = true,
  onLogin,
  onLoginSuccess,
  onClose,
  canClose = false,
  notice
}) => {
  const [internalUsers, setInternalUsers] = useState<AppUser[]>(users || initialUsersList);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (users && users.length > 0) {
      setInternalUsers(users);
    } else {
      getAllUsers()
        .then((res) => {
          if (res && res.length > 0) {
            setInternalUsers(res);
          } else {
            setInternalUsers(initialUsersList);
          }
        })
        .catch(() => {
          setInternalUsers(initialUsersList);
        });
    }
  }, [users]);

  if (!isOpen) {
    return null;
  }

  const notifyLogin = (user: AppUser) => {
    if (onLoginSuccess) {
      onLoginSuccess(user);
    } else if (onLogin) {
      onLogin(user);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const cleanUser = username.trim().toLowerCase();
      const cleanPass = password.trim();

      const userList = internalUsers && internalUsers.length > 0 ? internalUsers : initialUsersList;
      const matchedUser = userList.find(
        (u) => u.username.toLowerCase() === cleanUser
      );

      if (!matchedUser) {
        setError('Username tidak terdaftar dalam sistem.');
        return;
      }

      if (matchedUser.status === 'nonaktif') {
        setError('Akun ini sedang dinonaktifkan oleh Administrator. Hubungi pihak Tata Usaha.');
        return;
      }

      // Migrasi akun lama (password plaintext) ke hash saat login berhasil
      const migrated = await ensurePasswordHash(matchedUser);
      if (migrated !== matchedUser) {
        try { await saveUser(migrated); } catch { /* abaikan, lanjut login */ }
      }

      const passOk = migrated.passwordHash
        ? await verifyPassword(cleanPass, migrated.passwordHash)
        : false;

      if (!passOk) {
        setError('Kata sandi (password) salah. Silakan periksa kembali.');
        return;
      }

      const updatedUser: AppUser = {
        ...migrated,
        terakhirLogin: new Date().toISOString()
      };

      notifyLogin(updatedUser);
    } catch (err: any) {
      setError(err?.message || 'Gagal memverifikasi login. Coba lagi.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Branding */}
        <div className="bg-gradient-to-br from-blue-900 via-indigo-900 to-slate-900 text-white p-6 relative">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-amber-300 shadow-inner">
              <School className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-300/30 mb-1">
                Sistem Buku Induk Siswa
              </div>
              <h2 className="text-lg font-bold leading-tight">Autentikasi Pengguna</h2>
              <p className="text-xs text-blue-200">SMP Kurikulum Merdeka (Fase D)</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {notice && (
            <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p>{notice}</p>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2.5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Gagal Masuk</p>
                <p className="text-rose-600">{error}</p>
              </div>
            </div>
          )}

          {/* Form Login */}
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Contoh: administrator"
                  className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                />
                <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi..."
                  className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                />
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-700/20 flex items-center justify-center gap-2 transition disabled:opacity-60 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>{isLoading ? 'Memverifikasi...' : 'Masuk ke Sistem'}</span>
            </button>
          </form>


          {canClose && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
            >
              Batal
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
