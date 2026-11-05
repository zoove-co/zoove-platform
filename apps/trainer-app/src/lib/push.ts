import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { registerDevice, removeDevice } from '@/lib/api';

// Push messages. Everything here is best effort: a trainer who says no, a simulator, or a build without push credentials
// simply gets the same messages by email and sees the jobs when they open the app.

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

async function currentToken(askPermission: boolean): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null; // the build has no EAS project yet
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && askPermission) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: 'Zoove jobs', importance: AndroidImportance.HIGH });
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

/** Call once the trainer is approved. Asks for permission the first time. */
export async function registerForPush(): Promise<void> {
  try {
    const token = await currentToken(true);
    if (token) await registerDevice(token, Platform.OS === 'ios' ? 'ios' : 'android');
  } catch {
    // best effort
  }
}

/** Call before signing out, so the next person on this phone does not receive this trainer's job alerts. */
export async function unregisterFromPush(): Promise<void> {
  try {
    const token = await currentToken(false);
    if (token) await removeDevice(token);
  } catch {
    // Signing out must always work, even offline.
  }
}

export const onNotificationTapped = (listener: () => void) => {
  const subscription = Notifications.addNotificationResponseReceivedListener(() => listener());
  return () => subscription.remove();
};
