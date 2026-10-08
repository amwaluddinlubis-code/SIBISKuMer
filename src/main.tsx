import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initStorage, ensureSchoolsInit } from './utils/db';

// Tahap 1 multi-sekolah: daftarkan database lama sebagai sekolah pertama,
// lalu pastikan database sekolah AKTIF ter-seed sebelum UI membaca data.
ensureSchoolsInit()
  .catch(() => null)
  .then(() => initStorage())
  .catch(() => null)
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
