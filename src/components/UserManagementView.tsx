import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  UserCheck, 
  Shield, 
  ShieldAlert, 
  KeyRound, 
  Trash2, 
  Edit3, 
  Eye, 
  Lock, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  Sparkles, 
  Search, 
  Phone, 
  Mail, 
  Briefcase,
  ArrowLeftRight,
  ExternalLink
} from 'lucide-react';
import { AppUser, UserRole } from '../types';
import { getAllUsers, saveUser, deleteUser } from '../utils/db';

interface UserManagementViewProps {
  users?: AppUser[];
  currentUser: AppUser;
  onSaveUser?: (user: AppUser) => Promise<void>;
  onDeleteUser?: (userId: string) => Promise<void>;
  onImpersonate: (operatorUser: AppUser) => void;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  users: initialUsers,
  currentUser,
  onSaveUser,
  onDeleteUser,
  onImpersonate
}) => {
  const [internalUsers, setInternalUsers] = useState<AppUser[]>(initialUsers || []);

  useEffect(() => {
    if (initialUsers) {
      setInternalUsers(initialUsers);
    } else {
      getAllUsers().then((res) => setInternalUsers(res));
    }
  }, [initialUsers]);

  const refreshUsers = async () => {
    const list = await getAllUsers();
    setInternalUsers(list || []);
  };

  const users = internalUsers || [];
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'administrator' | 'operator'>('all');

  // Modal State for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);

  // Modal State for Reset Password
  const [resetPasswordModalUser, setResetPasswordModalUser] = useState<AppUser | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');

  // Impersonate Confirmation Modal
  const [impersonateTarget, setImpersonateTarget] = useState<AppUser | null>(null);

  // Form fields for Add/Edit
  const [formData, setFormData] = useState<Partial<AppUser>>({
    username: '',
    password: '',
    namaLengkap: '',
    role: 'operator',
    email: '',
    nomorTelepon: '',
    jabatan: '',
    rombelAkses: ['7A', '7B', '8A', '8B', '9A', '9B'],
    status: 'aktif'
  });

  const availableRombels = ['7A', '7B', '8A', '8B', '9A', '9B'];

  const handleOpenAdd = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      password: '',
      namaLengkap: '',
      role: 'operator',
      email: '',
      nomorTelepon: '',
      jabatan: 'Operator Buku Induk',
      rombelAkses: ['7A', '7B', '8A', '8B', '9A', '9B'],
      status: 'aktif'
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (u: AppUser) => {
    setEditingUser(u);
    setFormData({
      ...u,
      password: u.password || ''
    });
    setIsModalOpen(true);
  };

  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.username || !formData.namaLengkap) {
      alert('Mohon isi username dan nama lengkap.');
      return;
    }

    const now = new Date().toISOString();

    if (editingUser) {
      // Update
      const updated: AppUser = {
        ...editingUser,
        username: formData.username.trim().toLowerCase(),
        namaLengkap: formData.namaLengkap.trim(),
        role: formData.role || 'operator',
        email: formData.email || '',
        nomorTelepon: formData.nomorTelepon || '',
        jabatan: formData.jabatan || '',
        rombelAkses: formData.rombelAkses || [],
        status: formData.status || 'aktif',
        password: formData.password ? formData.password.trim() : editingUser.password,
        updatedAt: now
      };
      if (onSaveUser) {
        await onSaveUser(updated);
      } else {
        await saveUser(updated);
      }
      await refreshUsers();
    } else {
      // Create
      // Check duplicate username
      const dup = (users || []).find((x) => x && x.username && x.username.toLowerCase() === formData.username?.trim().toLowerCase());
      if (dup) {
        alert(`Username "${formData.username}" sudah digunakan oleh pengguna lain.`);
        return;
      }

      const newUser: AppUser = {
        id: `usr-${Date.now()}`,
        username: (formData.username || '').trim().toLowerCase(),
        password: (formData.password || 'operator123').trim(),
        namaLengkap: (formData.namaLengkap || '').trim(),
        role: formData.role || 'operator',
        email: formData.email || '',
        nomorTelepon: formData.nomorTelepon || '',
        jabatan: formData.jabatan || 'Operator Data Pokok',
        rombelAkses: formData.rombelAkses || [],
        status: formData.status || 'aktif',
        createdAt: now,
        updatedAt: now
      };
      if (onSaveUser) {
        await onSaveUser(newUser);
      } else {
        await saveUser(newUser);
      }
      await refreshUsers();
    }

    setIsModalOpen(false);
  };

  const handleDeleteClick = async (u: AppUser) => {
    if (u.username.toLowerCase() === 'administrator') {
      alert('Akun Administrator Utama tidak boleh dihapus demi keamanan sistem.');
      return;
    }
    if (u.id === currentUser.id) {
      alert('Anda tidak dapat menghapus akun Anda sendiri saat sedang aktif.');
      return;
    }
    if (window.confirm(`Yakin ingin menghapus akun operator "${u.namaLengkap}" (@${u.username})? Tindakan ini tidak dapat dibatalkan.`)) {
      if (onDeleteUser) {
        await onDeleteUser(u.id);
      } else {
        await deleteUser(u.id);
      }
      await refreshUsers();
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordModalUser || !newPasswordInput.trim()) return;

    const updated: AppUser = {
      ...resetPasswordModalUser,
      password: newPasswordInput.trim(),
      updatedAt: new Date().toISOString()
    };
    if (onSaveUser) {
      await onSaveUser(updated);
    } else {
      await saveUser(updated);
    }
    await refreshUsers();
    alert(`Kata sandi untuk @${resetPasswordModalUser.username} berhasil diperbarui.`);
    setResetPasswordModalUser(null);
    setNewPasswordInput('');
  };

  const handleToggleRombel = (rombel: string) => {
    const current = formData.rombelAkses || [];
    if (current.includes(rombel)) {
      setFormData({ ...formData, rombelAkses: current.filter((r) => r !== rombel) });
    } else {
      setFormData({ ...formData, rombelAkses: [...current, rombel] });
    }
  };

  const handleToggleAllRombel = () => {
    const current = formData.rombelAkses || [];
    if (current.length === availableRombels.length) {
      setFormData({ ...formData, rombelAkses: [] });
    } else {
      setFormData({ ...formData, rombelAkses: [...availableRombels] });
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch = 
      u.namaLengkap.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.jabatan && u.jabatan.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  const operatorList = users.filter((u) => u.role === 'operator' && u.status === 'aktif');

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white p-6 rounded-2xl shadow-sm relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-800/80 text-blue-200 text-xs font-semibold mb-2">
            <Shield className="w-3.5 h-3.5 text-amber-300" />
            Panel Khusus Administrator Sistem
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            Manajemen Pengguna & Operator SIM
          </h2>
          <p className="text-sm text-blue-100 mt-1 leading-relaxed">
            Kelola akun petugas buku induk dan staf kesiswaan. Administrator memiliki wewenang penuh untuk membuat, memperbarui, mengatur kata sandi, serta melakukan <strong>Impersonasi (Menyamar)</strong> untuk meninjau akses operator secara langsung.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={handleOpenAdd}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-2 transition cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Tambah Operator Baru</span>
            </button>
            <span className="text-xs text-blue-200 bg-blue-950/60 px-3 py-1.5 rounded-lg border border-blue-800/50">
              Total Pengguna: <strong>{users.length} Akun</strong> ({operatorList.length} Operator Aktif)
            </span>
          </div>
        </div>
      </div>

      {/* Impersonate Quick Launcher Card */}
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-50 to-indigo-50/40 border border-amber-200/80 p-5 rounded-2xl shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-amber-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Fitur Impersonasi Operator (Menyamar)
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-200 text-amber-900 rounded-full">
                  Menu Administrator
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5 max-w-2xl">
                Sebagai Administrator, Anda dapat langsung menyamar sebagai operator manapun tanpa mengetahui kata sandi mereka. Anda akan dapat melihat tampilan tepat seperti yang dilihat oleh operator tersebut untuk keperluan supervisi, audit, atau verifikasi batasan akses.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              id="quick-impersonate-select"
              className="text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
              defaultValue=""
              onChange={(e) => {
                const targetId = e.target.value;
                if (!targetId) return;
                const found = (users || []).find((u) => u.id === targetId);
                if (found) {
                  setImpersonateTarget(found);
                }
                e.target.value = '';
              }}
            >
              <option value="" disabled>-- Pilih Operator untuk Disamar --</option>
              {operatorList.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.namaLengkap} (@{op.username}) - {op.jabatan || 'Operator'}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Filter and User List Section */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {/* Filter Bar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/60">
          <div className="relative w-full sm:w-80">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari nama, username, jabatan..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-slate-500 font-medium">Filter Peran:</span>
            <div className="flex bg-slate-200/80 p-0.5 rounded-xl text-xs font-semibold text-slate-600">
              <button
                onClick={() => setRoleFilter('all')}
                className={`px-3 py-1 rounded-lg transition ${
                  roleFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
                }`}
              >
                Semua ({users.length})
              </button>
              <button
                onClick={() => setRoleFilter('administrator')}
                className={`px-3 py-1 rounded-lg transition ${
                  roleFilter === 'administrator' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
                }`}
              >
                Admin
              </button>
              <button
                onClick={() => setRoleFilter('operator')}
                className={`px-3 py-1 rounded-lg transition ${
                  roleFilter === 'operator' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
                }`}
              >
                Operator
              </button>
            </div>
          </div>
        </div>

        {/* User Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Pengguna</th>
                <th className="py-3 px-4">Peran & Jabatan</th>
                <th className="py-3 px-4">Kontak</th>
                <th className="py-3 px-4">Rombel Akses</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Terakhir Login</th>
                <th className="py-3 px-4 text-right">Aksi & Impersonasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    Tidak ditemukan data pengguna yang cocok dengan kriteria pencarian.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isCurrent = u.id === currentUser.id;
                  const isAdmin = u.role === 'administrator';

                  return (
                    <tr 
                      key={u.id} 
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isCurrent ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      {/* Name and Username */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 shadow-xs ${
                            isAdmin 
                              ? 'bg-blue-700 text-white' 
                              : 'bg-emerald-600 text-white'
                          }`}>
                            {isAdmin ? <Shield className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{u.namaLengkap}</span>
                              {isCurrent && (
                                <span className="px-1.5 py-0.2 text-[10px] bg-blue-100 text-blue-800 rounded font-semibold">
                                  Anda
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              @{u.username}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role and Position */}
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${
                            isAdmin
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {u.role}
                          </span>
                          <p className="text-slate-600 font-medium">{u.jabatan || 'Pengelola Data'}</p>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="py-3 px-4 text-slate-600">
                        <div className="space-y-0.5">
                          {u.email ? (
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <Mail className="w-3 h-3 text-slate-400" />
                              <span className="truncate max-w-[150px]">{u.email}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">-</span>
                          )}
                          {u.nomorTelepon && (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                              <Phone className="w-3 h-3 text-slate-400" />
                              <span>{u.nomorTelepon}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Rombel Akses */}
                      <td className="py-3 px-4">
                        {isAdmin ? (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-medium">
                            Semua Rombel (Fase D)
                          </span>
                        ) : u.rombelAkses && u.rombelAkses.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[140px]">
                            {u.rombelAkses.map((r) => (
                              <span key={r} className="px-1.5 py-0.2 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-bold font-mono">
                                {r}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Semua Rombel</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          u.status === 'aktif'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            u.status === 'aktif' ? 'bg-emerald-600' : 'bg-rose-600'
                          }`} />
                          {u.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>

                      {/* Last Login */}
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {u.terakhirLogin ? (
                          <span>{new Date(u.terakhirLogin).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}</span>
                        ) : (
                          <span className="text-slate-400">Belum pernah</span>
                        )}
                      </td>

                      {/* Actions & Impersonate */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Impersonate button (only for operators) */}
                          {u.role === 'operator' && (
                            <button
                              type="button"
                              onClick={() => setImpersonateTarget(u)}
                              title={`Menyamar sebagai ${u.namaLengkap}`}
                              className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] rounded-lg shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Impersonate</span>
                            </button>
                          )}

                          {/* Edit info */}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(u)}
                            title="Edit data pengguna"
                            className="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          {/* Reset Password */}
                          <button
                            type="button"
                            onClick={() => {
                              setResetPasswordModalUser(u);
                              setNewPasswordInput('');
                            }}
                            title="Reset kata sandi"
                            className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>

                          {/* Delete (if not admin) */}
                          {u.username.toLowerCase() !== 'administrator' && (
                            <button
                              type="button"
                              onClick={() => handleDeleteClick(u)}
                              title="Hapus akun"
                              className="p-1.5 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role Comparison & Use Cases Matrix */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-700" />
          Matriks Hak Akses & Pembagian Use Case (Peran Administrator vs Operator)
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Standar operasional pengelolaan Buku Induk Siswa Kurikulum Merdeka pada tingkat Satuan Pendidikan SMP:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Administrator Use Cases */}
          <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 space-y-3">
            <div className="flex items-center gap-2 font-bold text-blue-900">
              <div className="w-6 h-6 rounded-lg bg-blue-700 text-white flex items-center justify-center text-xs">
                A
              </div>
              <h4>Administrator (Koordinator SIM / Kepala TU)</h4>
            </div>
            <ul className="space-y-2 text-slate-700 list-disc list-inside">
              <li><strong>CRUD Akun Operator</strong>: Membuat, memperbarui, mengatur ulang password, dan menghapus akun operator kesiswaan.</li>
              <li><strong>Menu Impersonate Operator</strong>: Menyamar langsung ke dalam sesi operator untuk inspeksi batasan tugas dan verifikasi entri data.</li>
              <li><strong>Konfigurasi Web Service Dapodik</strong>: Mengatur IP host, port 5774, dan Token resmi Kemdikbudristek.</li>
              <li><strong>Sinkronisasi Identitas Satuan Pendidikan</strong>: Menyetujui dan memperbarui profil resmi sekolah dari Dapodik.</li>
              <li><strong>Cadangan & Pemulihan Sistem</strong>: Mengunduh arsip JSON lengkap dan mengembalikan basis data offline.</li>
              <li><strong>Akses Penuh Seluruh Rombel</strong>: Pengawasan tanpa batasan kelas pada Fase D (Kelas 7, 8, dan 9).</li>
            </ul>
          </div>

          {/* Operator Use Cases */}
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3">
            <div className="flex items-center gap-2 font-bold text-emerald-900">
              <div className="w-6 h-6 rounded-lg bg-emerald-700 text-white flex items-center justify-center text-xs">
                O
              </div>
              <h4>Operator (Petugas Buku Induk & Staf Kesiswaan)</h4>
            </div>
            <ul className="space-y-2 text-slate-700 list-disc list-inside">
              <li><strong>Pencatatan Buku Induk Siswa</strong>: Menambah dan memperbarui biodata lengkap siswa (Bagian A-I, data ortu/wali, kesehatan, beasiswa).</li>
              <li><strong>Pencatatan Projek P5</strong>: Mengisi dimensi dan tema Projek Penguatan Profil Pelajar Pancasila.</li>
              <li><strong>Cetak Dokumen Resmi</strong>: Mencetak Lembar Buku Induk Kurikulum Merdeka dan Kartu Tanda Pelajar (KTP Siswa).</li>
              <li><strong>Rekapitulasi Kesiswaan</strong>: Melihat statistik gender, agama, jalur masuk, dan status kelulusan/mutasi.</li>
              <li><strong>Sinkronisasi Siswa dari Dapodik</strong>: Menjalankan penarikan data peserta didik baru dari Dapodik lokal.</li>
              <li><span className="text-rose-700 font-semibold">Batasan</span>: Tidak dapat mengakses manajemen pengguna, tidak dapat mengosongkan database, dan tidak dapat mengubah token inti server.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* MODAL: Add / Edit User */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <UserPlus className="w-5 h-5 text-amber-300" />
                <h3 className="font-bold text-base">
                  {editingUser ? 'Edit Pengguna / Operator' : 'Tambah Operator Baru'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-white/80 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Username <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.username || ''}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="Contoh: operator_kelas7"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {editingUser ? 'Kata Sandi Baru (Kosongkan jika tetap)' : 'Kata Sandi *'}
                  </label>
                  <input
                    type="password"
                    required={!editingUser}
                    value={formData.password || ''}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={editingUser ? 'Tetap gunakan kata sandi lama' : 'Contoh: operator123'}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Lengkap & Gelar <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.namaLengkap || ''}
                  onChange={(e) => setFormData({ ...formData, namaLengkap: e.target.value })}
                  placeholder="Contoh: Siti Rahmawati, S.Kom."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Peran (Role)
                  </label>
                  <select
                    value={formData.role || 'operator'}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="operator">Operator (Buku Induk & Kesiswaan)</option>
                    <option value="administrator">Administrator (Akses Penuh)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Status Akun
                  </label>
                  <select
                    value={formData.status || 'aktif'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'aktif' | 'nonaktif' })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif (Dibekukan)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Jabatan / Penugasan di Sekolah
                </label>
                <input
                  type="text"
                  value={formData.jabatan || ''}
                  onChange={(e) => setFormData({ ...formData, jabatan: e.target.value })}
                  placeholder="Contoh: Petugas Pengelola Buku Induk & Arsip"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@sekolah.sch.id"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    No. WhatsApp / HP
                  </label>
                  <input
                    type="text"
                    value={formData.nomorTelepon || ''}
                    onChange={(e) => setFormData({ ...formData, nomorTelepon: e.target.value })}
                    placeholder="081234567890"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Assigned Rombels */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Penugasan Rombel (Fase D SMP)
                  </label>
                  <button
                    type="button"
                    onClick={handleToggleAllRombel}
                    className="text-[11px] text-blue-600 hover:underline font-medium"
                  >
                    {(formData.rombelAkses || []).length === availableRombels.length
                      ? 'Kosongkan Semua'
                      : 'Pilih Semua Rombel'}
                  </button>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {availableRombels.map((rombel) => {
                    const isChecked = (formData.rombelAkses || []).includes(rombel);
                    return (
                      <button
                        type="button"
                        key={rombel}
                        onClick={() => handleToggleRombel(rombel)}
                        className={`py-1.5 px-2 rounded-lg text-xs font-mono font-bold border transition ${
                          isChecked
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {rombel}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  * Jika semua dipilih atau dikosongkan, operator memiliki akses umum ke semua rombel.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-xl shadow-md shadow-blue-700/20"
                >
                  {editingUser ? 'Simpan Perubahan' : 'Buat Operator'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Reset Password */}
      {resetPasswordModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm">Ganti Kata Sandi</h3>
              </div>
              <button
                onClick={() => setResetPasswordModalUser(null)}
                className="text-white/70 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="p-5 space-y-4">
              <p className="text-xs text-slate-600">
                Ubah kata sandi untuk pengguna <strong>{resetPasswordModalUser.namaLengkap}</strong> (@{resetPasswordModalUser.username}).
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kata Sandi Baru
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  placeholder="Masukkan kata sandi baru..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetPasswordModalUser(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-xl shadow-xs"
                >
                  Simpan Kata Sandi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Impersonate Confirmation */}
      {impersonateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-amber-200" />
              </div>
              <div>
                <h3 className="font-bold text-base">Konfirmasi Impersonasi</h3>
                <p className="text-xs text-amber-100">Masuk ke Sesi Operator</p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-slate-700 space-y-2">
                <p>
                  Anda akan menyamar sebagai Operator <strong>{impersonateTarget.namaLengkap}</strong> (<code>@{impersonateTarget.username}</code>).
                </p>
                <ul className="list-disc list-inside text-[11px] text-amber-900 space-y-1">
                  <li>Hak akses Anda akan dibatasi persis seperti operator ini.</li>
                  <li>Menu Manajemen Pengguna akan disembunyikan.</li>
                  <li>Terdapat banner di bagian atas layar untuk kembali ke akun Administrator kapan saja dengan 1 klik.</li>
                </ul>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setImpersonateTarget(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = impersonateTarget;
                    setImpersonateTarget(null);
                    onImpersonate(target);
                  }}
                  className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-md shadow-amber-600/20 flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Mulai Sesi Impersonate</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
