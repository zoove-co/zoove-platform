import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';

import * as api from '@/lib/api';
import { unregisterFromPush } from '@/lib/push';

const KEY = 'zoove.trainer.session.v1';

// SecureStore (Keychain / Keystore) on phones; localStorage on web, where SecureStore does not exist.
async function readSession(): Promise<api.Session | null> {
  try {
    const raw = Platform.OS === 'web' ? (globalThis.localStorage?.getItem(KEY) ?? null) : await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<api.Session>;
    return typeof parsed.accessToken === 'string' && typeof parsed.refreshToken === 'string' ? { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken } : null;
  } catch {
    return null;
  }
}
async function writeSession(session: api.Session): Promise<void> {
  try {
    const raw = JSON.stringify(session);
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, raw);
    else await SecureStore.setItemAsync(KEY, raw);
  } catch {
    // Storage unavailable: the sign-in then lasts until the app closes.
  }
}
async function clearSession(): Promise<void> {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.removeItem(KEY);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // nothing to clear
  }
}

type Status = 'loading' | 'signedOut' | 'signedIn';
type AuthState = {
  status: Status;
  /** Shown once on the sign-in screen, e.g. after the server ended the session. */
  notice: string | null;
  hydrate: () => Promise<void>;
  signIn: (session: api.Session) => Promise<void>;
  signOut: () => Promise<void>;
  endedByServer: () => void;
};

export const useAuth = create<AuthState>((set) => ({
  status: 'loading',
  notice: null,
  hydrate: async () => {
    const session = await readSession();
    api.setSession(session);
    set({ status: session ? 'signedIn' : 'signedOut' });
  },
  signIn: async (session) => {
    api.setSession(session);
    await writeSession(session);
    set({ status: 'signedIn', notice: null });
  },
  signOut: async () => {
    // Tell the server first (best effort), then forget everything on this phone.
    await unregisterFromPush();
    try {
      await api.logout();
    } catch {
      // Signing out must always work, even offline.
    }
    api.setSession(null);
    await clearSession();
    set({ status: 'signedOut', notice: null });
  },
  endedByServer: () => set({ status: 'signedOut', notice: 'Your session ended. Please sign in again. What you filled in is saved.' }),
}));

// The API swaps tokens in the background (refresh) and ends the session when the server says it is over.
// Keep storage and the signed-in state in step with it.
api.onSessionChange((session) => {
  if (session) {
    void writeSession(session);
    return;
  }
  void clearSession();
  useAuth.getState().endedByServer();
});
