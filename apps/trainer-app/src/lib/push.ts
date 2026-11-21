import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { registerDevice, removeDevice } from '@/lib/api';
import { reportError } from '@/lib/monitoring';

// Push messages. Everything here is best effort: a trainer who says no, a simulator, or a build without push credentials
// simply gets the same messages by email and sees the jobs when they open the app.

// The channel new job requests arrive on (the server sends this id). A channel's sound cannot be changed after the phone
// creates it, so a new ring means a new id: the first was 'jobs', this one carries the Zoove bell.
export const JOB_CHANNEL = 'jobs-v2';

// With the app open, a job request is shown by the app itself (a pop-up card that rings), so the system does not show a second one.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isJob = (notification.request.content.data as { kind?: unknown } | undefined)?.kind === 'job_available';
    return { shouldShowBanner: !isJob, shouldShowList: !isJob, shouldPlaySound: !isJob, shouldSetBadge: false };
  },
});

/** Runs when a job request push arrives while the app is open. */
export const onJobPushReceived = (listener: () => void) => {
  const subscription = Notifications.addNotificationReceivedListener((notification) => {
    if ((notification.request.content.data as { kind?: unknown } | undefined)?.kind === 'job_available') listener();
  });
  return () => subscription.remove();
};

/** Creates the Android channels (safe to call again). Job requests ring loudly: heads-up pop-up, lock screen, the Zoove bell and a strong buzz. */
export async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('zoove', { name: 'Zoove updates', importance: AndroidImportance.HIGH });
  await Notifications.setNotificationChannelAsync(JOB_CHANNEL, {
    name: 'New job requests',
    importance: AndroidImportance.MAX,
    sound: 'zoove_job_bell.wav',
    vibrationPattern: [0, 600, 250, 600, 250, 600],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableVibrate: true,
    bypassDnd: false,
  });
  // Older builds made these; they are not used any more.
  for (const old of ['jobs', 'new-jobs', 'default']) await Notifications.deleteNotificationChannelAsync(old).catch(() => undefined);
}

async function currentToken(askPermission: boolean): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null; // the build has no EAS project yet
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && askPermission) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;
  await ensureChannels();
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

/** Call once the trainer is approved. Asks for permission the first time. */
export async function registerForPush(): Promise<void> {
  try {
    const token = await currentToken(true);
    if (token) await registerDevice(token, Platform.OS === 'ios' ? 'ios' : 'android');
  } catch (error) {
    reportError(error, 'push-register');
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

/** The complaint a push is about, when it is one (the server puts the id in the push data). */
export const complaintIdFrom = (data: unknown): string | null => {
  const d = data as { kind?: unknown; complaintId?: unknown } | undefined;
  return d?.kind === 'complaint' && typeof d.complaintId === 'string' ? d.complaintId : null;
};

/** Runs when a notification is tapped. `complaintId` is set when the team replied to a complaint, otherwise it is a job alert. */
export const onNotificationTapped = (listener: (complaintId: string | null) => void) => {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => listener(complaintIdFrom(response.notification.request.content.data)));
  return () => subscription.remove();
};

/** Runs when the team's reply to a complaint arrives while the app is open. */
export const onComplaintPushReceived = (listener: (complaintId: string) => void) => {
  const subscription = Notifications.addNotificationReceivedListener((notification) => {
    const id = complaintIdFrom(notification.request.content.data);
    if (id) listener(id);
  });
  return () => subscription.remove();
};
