// ---------------- Firebase bersama (Auth + Firestore, tier gratis) ----------------
// Satu-satunya tempat inisialisasi app agar tidak ganda. Config publik
// (apiKey dkk.) memang dirancang terekspos di klien — keamanan ditegakkan
// via firestore.rules + PIN sekolah (sisi klien).
// Catatan: Storage TIDAK dipakai (butuh upgrade) — foto sinkron sebagai
// mini JPEG ≤60KB langsung di dokumen Firestore (lihat photo.ts).

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const firebaseApp: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth: Auth = getAuth(firebaseApp);
export const firestoreDb: Firestore = getFirestore(firebaseApp);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/** Masuk dengan Google (tanpa scope Drive — khusus sinkron cloud). */
export async function signInGoogleCloud(): Promise<User> {
  const result = await signInWithPopup(firebaseAuth, googleProvider);
  return result.user;
}

export async function signOutGoogleCloud(): Promise<void> {
  await signOut(firebaseAuth);
}

export function pantauAuthCloud(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(firebaseAuth, cb);
}
