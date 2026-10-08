import React from 'react';
import { 
  X, 
  Printer, 
  CreditCard, 
  Edit, 
  Trash2, 
  User, 
  Sparkles, 
  Heart, 
  School, 
  Users, 
  Calendar,
  MapPin,
  FileText
} from 'lucide-react';
import { Siswa, SekolahProfile } from '../types';

interface SiswaDetailModalProps {
  siswa: Siswa;
  sekolah: SekolahProfile;
  onClose: () => void;
  onEdit: (siswa: Siswa) => void;
  onPrintLembar: (siswa: Siswa) => void;
  onDelete: (id: string) => void;
}

export const SiswaDetailModal: React.FC<SiswaDetailModalProps> = ({
  siswa,
  sekolah,
  onClose,
  onEdit,
  onPrintLembar,
  onDelete
}) => {
  const formatDateIndo = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden text-xs anim-scale-in">
        {/* Header Profile Hero */}
        <div className="relative overflow-hidden bg-gradient-to-r from-navy-800 via-navy-900 to-[#0b1e4b] text-white p-5 shrink-0">
          <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-gold-500 via-gold-300 to-gold-500" />
          <div className="absolute -right-10 -top-14 w-48 h-48 rounded-full bg-blue-500/20 blur-3xl" />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition z-10"
            aria-label="Tutup pratinjau"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
            <div className="w-20 h-24 sm:w-24 sm:h-28 rounded-xl bg-white/10 border-2 border-white/30 overflow-hidden flex items-center justify-center shrink-0 shadow-lg">
              {siswa.fotoUrl ? (
                <img src={siswa.fotoUrl} alt={siswa.namaLengkap} className="w-full h-full object-cover" />
              ) : (
                <User className="w-10 h-10 text-white/50" />
              )}
            </div>

            <div className="flex-1 text-center sm:text-left space-y-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span className="px-2 py-0.5 rounded bg-blue-500/30 text-blue-200 font-mono text-[11px] border border-blue-400/30">
                  NISN: {siswa.nisn || '-'}
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-500/30 text-amber-200 font-mono text-[11px] border border-amber-400/30">
                  NIPD: {siswa.nipd || '-'}
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/30 text-emerald-200 font-bold text-[11px]">
                  {siswa.statusSiswa}
                </span>
              </div>

              <h2 className="text-lg sm:text-xl font-black tracking-wide text-white uppercase">
                {siswa.namaLengkap}
              </h2>

              <p className="text-blue-200 text-xs flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span>Rombel {siswa.rombelSaatIni} (Fase D)</span>
                <span>•</span>
                <span>{siswa.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan'}</span>
                <span>•</span>
                <span>{siswa.agama}</span>
              </p>

              <div className="pt-2 flex flex-wrap gap-2 justify-center sm:justify-start">
                <button
                  onClick={() => onPrintLembar(siswa)}
                  className="ui-btn ui-btn-gold"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Cetak Lembar Induk
                </button>
                <button
                  onClick={() => onEdit(siswa)}
                  className="ui-btn bg-white/10 hover:bg-white/20 text-white border border-white/25"
                >
                  <Edit className="w-3.5 h-3.5" />
                  Edit Data
                </button>
                <button
                  onClick={() => onDelete(siswa.id)}
                  className="ui-btn ui-btn-danger"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Hapus
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* Identitas & TTL */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-4 h-4 text-blue-700" />
              Identitas & Kependudukan
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[11px]">
              <div>
                <span className="text-slate-500 block">Tempat, Tanggal Lahir:</span>
                <span className="font-semibold text-slate-900">{siswa.tempatLahir}, {formatDateIndo(siswa.tanggalLahir)}</span>
              </div>
              <div>
                <span className="text-slate-500 block">NIK Siswa:</span>
                <span className="font-mono text-slate-900">{siswa.nik || '-'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Nomor KK:</span>
                <span className="font-mono text-slate-900">{siswa.noKk || '-'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Anak Ke-:</span>
                <span className="text-slate-900">Anak ke-{siswa.anakKe} dari {siswa.jumlahSaudaraKandung + 1}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Bahasa Sehari-hari:</span>
                <span className="text-slate-900">{siswa.bahasaSehariHari}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Kewarganegaraan:</span>
                <span className="text-slate-900">{siswa.kewarganegaraan}</span>
              </div>
            </div>
          </div>

          {/* Tempat Tinggal & Orang Tua */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-indigo-700" />
                Domisili & Jarak
              </h4>
              <p className="text-[11px] text-slate-800 leading-snug">
                {siswa.alamat} RT {siswa.rt} RW {siswa.rw}, Kel. {siswa.kelurahan}, Kec. {siswa.kecamatan}
              </p>
              <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-200 flex justify-between">
                <span>Tinggal bersama: <strong>{siswa.tinggalDengan}</strong></span>
                <span>Jarak: <strong>{siswa.jarakKeSekolahKm} km</strong></span>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-700" />
                Orang Tua Kandung
              </h4>
              <div className="text-[11px] space-y-1">
                <div>
                  <span className="text-slate-500">Ayah: </span>
                  <strong className="text-slate-900">{siswa.ayah?.nama || '-'}</strong>
                  <span className="text-slate-500 text-[10px] block">({siswa.ayah?.pekerjaan || '-'}, Telp: {siswa.ayah?.noTelepon || '-'})</span>
                </div>
                <div>
                  <span className="text-slate-500">Ibu: </span>
                  <strong className="text-slate-900">{siswa.ibu?.nama || '-'}</strong>
                  <span className="text-slate-500 text-[10px] block">({siswa.ibu?.pekerjaan || '-'}, Telp: {siswa.ibu?.noTelepon || '-'})</span>
                </div>
              </div>
            </div>
          </div>

          {/* Minat & Pendaftaran */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[11px]">
              <div>
                <span className="text-slate-500 block">Jenis Pendaftaran:</span>
                <span className="font-semibold text-slate-900">{siswa.jenisPendaftaran || '-'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Hobi:</span>
                <span className="font-semibold text-slate-900">{siswa.hobi || '-'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Cita-cita:</span>
                <span className="font-semibold text-slate-900">{siswa.citaCita || '-'}</span>
              </div>
            </div>
          </div>

          {/* Projek P5 Kurikulum Merdeka */}
          <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200 space-y-2">
            <h4 className="font-bold text-amber-950 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-600" />
              Projek Penguatan Profil Pelajar Pancasila (P5)
            </h4>
            {siswa.p5Projects && siswa.p5Projects.length > 0 ? (
              <div className="space-y-2">
                {siswa.p5Projects.map((p, idx) => (
                  <div key={idx} className="bg-white p-2.5 rounded-lg border border-amber-200 text-[11px]">
                    <div className="flex justify-between font-bold text-slate-900">
                      <span>{p.judulProjek}</span>
                      <span className="text-amber-800 text-[10px]">Tema: {p.tema}</span>
                    </div>
                    <p className="text-slate-600 text-[10px] mt-1 italic">
                      "{p.catatanProses}"
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 italic text-[11px]">Belum ada data projek P5.</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="ui-btn ui-btn-dark"
          >
            Tutup Pratinjau
          </button>
        </div>
      </div>
    </div>
  );
};
