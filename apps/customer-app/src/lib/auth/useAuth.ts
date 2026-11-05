import { create } from 'zustand';

import { api } from '@/lib/api';
import { unregisterFromPush } from '@/lib/push';
import type { Session } from '@/lib/api/types';

import { clearSession, readSession, writeSession } from './storage';

type Status = 'loading' | 'signedOut' | 'signedIn';

type AuthState = {
  status: Status;
  hydrate: () => Promise<void>;
  signIn: (session: Session) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuth = create<AuthState>((set) => ({
  status: 'loading',
  hydrate: async () => {
    const session = await readSession();
    api.setSession(session);
    set({ status: session ? 'signedIn' : 'signedOut' });
  },
  signIn: async (session) => {
    api.setSession(session);
    await writeSession(session);
    set({ status: 'signedIn' });
  },
  signOut: async () => {
    // Tell the server first (best effort), then forget everything on this device.
    await unregisterFromPush();
    try {
      await api.logout();
    } catch {
      // Signing out must always work, even offline.
    }
    api.setSession(null);
    await clearSession();
    set({ status: 'signedOut' });
  },
}));

// The API swaps tokens in the background (refresh) and ends the session when the server says it is over.
// Keep storage and the signed-in state in step with it.
api.onSessionChange((session) => {
  if (session) {
    void writeSession(session);
    return;
  }
  void clearSession();
  useAuth.setState({ status: 'signedOut' });
});
