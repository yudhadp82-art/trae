import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Lock, ShieldCheck, Store, User } from 'lucide-react';
import { auth, db } from '../api/firebase';
import { useAppFeedback } from '../components/useAppFeedback';
import { useAuthStore } from '../store/authStore';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Terjadi kesalahan yang tidak dikenal';
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { notify } = useAppFeedback();
  const setUser = useAuthStore((state) => state.setUser);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));

      if (userDoc.exists()) {
        const userData = userDoc.data();
        setUser({
          uid: userCredential.user.uid,
          email: userCredential.user.email!,
          name: userData.name,
          role: userData.role,
          createdAt: userData.createdAt.toDate(),
        });
      } else {
        setUser({
          uid: userCredential.user.uid,
          email: userCredential.user.email!,
          name: 'User',
          role: 'cashier',
          createdAt: new Date(),
        });
      }

      navigate('/dashboard');
    } catch (err) {
      setError('Email atau kata sandi tidak valid.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAdmin = async () => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, 'admin@pos.com', 'admin123');

      await setDoc(doc(db, 'users', userCredential.user.uid), {
        uid: userCredential.user.uid,
        name: 'Admin Toko',
        email: 'admin@pos.com',
        role: 'admin',
        createdAt: serverTimestamp(),
      });

      setEmail('admin@pos.com');
      setPassword('admin123');

      notify({
        title: 'Akun admin demo berhasil dibuat',
        description: 'Gunakan admin@pos.com dan kata sandi admin123 untuk masuk.',
        tone: 'success',
      });
    } catch (error) {
      console.error(error);
      notify({
        title: 'Gagal membuat akun admin demo',
        description: getErrorMessage(error),
        tone: 'error',
      });
    }
  };

  return (
    <div className="relative w-full max-w-md overflow-hidden rounded-[32px] border border-white/60 bg-white/90 p-8 shadow-[0_28px_90px_rgba(15,23,42,0.16)] backdrop-blur">
      <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.2),_transparent_65%)]" />

      <div className="relative">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-600 shadow-inner shadow-emerald-200/70">
            <Store className="h-8 w-8" />
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-600">KDMP POS</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">Masuk ke dashboard toko</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Kelola penjualan, stok, dan laporan dari satu panel operasional.
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Email</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-11 py-3 text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                placeholder="admin@pos.com"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Kata sandi</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-11 py-3 text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                placeholder="Masukkan kata sandi"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <div className="h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              'Masuk'
            )}
          </button>

          <button
            type="button"
            onClick={handleCreateAdmin}
            className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
          >
            Buat akun admin demo
          </button>
        </form>
      </div>
    </div>
  );
}
