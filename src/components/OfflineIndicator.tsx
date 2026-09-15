import React from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors ${
        isOnline
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse'
      }`}
      title={isOnline ? 'Terhubung ke Jaringan' : 'Mode Offline Aktif - Data tersimpan di database lokal browser'}
    >
      {isOnline ? (
        <>
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <Wifi className="w-3.5 h-3.5 text-emerald-600" />
          <span className="hidden sm:inline">Online</span>
        </>
      ) : (
        <>
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
          <WifiOff className="w-3.5 h-3.5 text-amber-600" />
          <span>Mode Offline</span>
        </>
      )}
    </div>
  );
};
