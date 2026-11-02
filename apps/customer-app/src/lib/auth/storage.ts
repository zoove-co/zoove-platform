import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { Session } from '@/lib/api/types';

const KEY = 'zoove.session.v2';

// SecureStore (Keychain / Keystore) on phones; localStorage on web, where SecureStore does not exist.
// Both tokens are kept together as one JSON value.
export async function readSession(): Promise<Session | null> {
  try {
    const raw = Platform.OS === 'web' ? (globalThis.localStorage?.getItem(KEY) ?? null) : await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    return typeof parsed.accessToken === 'string' && typeof parsed.refreshToken === 'string'
      ? { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken }
      : null;
  } catch {
    return null;
  }
}

export async function writeSession(session: Session): Promise<void> {
  try {
    const raw = JSON.stringify(session);
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, raw);
    else await SecureStore.setItemAsync(KEY, raw);
  } catch {
    // Storage can be unavailable (private window); the session then lasts until the app closes.
  }
}

export async function clearSession(): Promise<void> {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.removeItem(KEY);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // nothing to clear
  }
}
