import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const hasMissing = Object.values(firebaseConfig).some((v) => !v || typeof v !== 'string' || v.length === 0);
if (hasMissing) {
  throw new Error('Missing Firebase environment variables');
}

const app = initializeApp(firebaseConfig as Record<string, string>);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
