import { create } from 'zustand';
import { User } from '../types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: {
    uid: 'admin-123',
    name: 'Admin Toko',
    email: 'admin@pos.com',
    role: 'admin',
    createdAt: new Date()
  },
  isAuthenticated: true,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  logout: () => {}, // Logout dinonaktifkan
}));
