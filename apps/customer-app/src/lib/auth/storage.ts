import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'zoove.session';

// SecureStore (Keychain / Keystore) on phones; localStorage on web, where SecureStore does not exist.
// A real refresh-token flow replaces this when the NestJS API lands (decision D5).
export async function readToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function writeToken(token: string): Promise<void> {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, token);
    else await SecureStore.setItemAsync(KEY, token);
  } catch {
    // Storage can be unavailable (private window); the session then lasts until the app closes.
  }
}

export async function clearToken(): Promise<void> {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.removeItem(KEY);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // nothing to clear
  }
}
