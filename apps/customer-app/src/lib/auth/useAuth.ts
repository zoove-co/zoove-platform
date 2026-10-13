import { create } from 'zustand';

import { api } from '@/lib/api';

import { clearToken, readToken, writeToken } from './storage';

type Status = 'loading' | 'signedOut' | 'signedIn';

type AuthState = {
  status: Status;
  hydrate: () => Promise<void>;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuth = create<AuthState>((set) => ({
  status: 'loading',
  hydrate: async () => {
    const token = await readToken();
    api.setSession(token);
    set({ status: token ? 'signedIn' : 'signedOut' });
  },
  signIn: async (token) => {
    api.setSession(token);
    await writeToken(token);
    set({ status: 'signedIn' });
  },
  signOut: async () => {
    api.setSession(null);
    await clearToken();
    set({ status: 'signedOut' });
  },
}));
