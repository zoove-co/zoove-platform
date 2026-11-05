import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from '@/lib/api';
import { reportError } from '@/lib/monitoring';

// Push messages. This file is the only one that touches the push library. Everything here is best effort: a customer who
// says no, a simulator, or a build without push credentials simply gets their messages by email and in the app instead.

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
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Zoove', importance: AndroidImportance.DEFAULT });
  }
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

/** Call once the customer is signed in. Asks for permission the first time. */
export async function registerForPush(): Promise<void> {
  try {
    const token = await currentToken(true);
    if (token) await api.registerDevice(token, Platform.OS === 'ios' ? 'ios' : 'android');
  } catch (error) {
    reportError(error);
  }
}

/** Call before signing out, so the next person on this phone does not receive this customer's messages. */
export async function unregisterFromPush(): Promise<void> {
  try {
    const token = await currentToken(false);
    if (token) await api.removeDevice(token);
  } catch {
    // Signing out must always work, even offline.
  }
}

/** The booking a tapped notification is about, if it names one. */
export function bookingIdFrom(response: Notifications.NotificationResponse): string | null {
  const id = (response.notification.request.content.data as { bookingId?: unknown } | undefined)?.bookingId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export const onNotificationTapped = (listener: (response: Notifications.NotificationResponse) => void) =>
  Notifications.addNotificationResponseReceivedListener(listener);
