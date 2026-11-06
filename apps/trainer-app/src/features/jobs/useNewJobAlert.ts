import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { Platform, Vibration } from 'react-native';

import type { OpenJob } from '@/lib/api';

const CHANNEL = 'new-jobs';
// A long, hard-to-miss buzz: three strong pulses.
const BUZZ = [0, 700, 300, 700, 300, 700];

async function ready(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'New jobs', importance: AndroidImportance.MAX, vibrationPattern: BUZZ, sound: 'default' });
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Watches the open jobs. When one appears that the trainer has not seen yet, the phone buzzes and a notification with sound
 * shows at once, and the returned job (for a banner on screen) stays until dismissed. The first load never alerts.
 * This works while the app is open. Alerts with the app closed need a push build (see push.ts).
 */
export function useNewJobAlert(open: OpenJob[] | undefined, enabled: boolean) {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<OpenJob | null>(null);

  useEffect(() => {
    if (!enabled) return;
    void ready();
  }, [enabled]);

  useEffect(() => {
    if (!open) return;
    if (seen.current === null) {
      seen.current = new Set(open.map((job) => job.id));
      return;
    }
    const added = open.filter((job) => !seen.current?.has(job.id));
    open.forEach((job) => seen.current?.add(job.id));
    const first = added[0];
    if (!first || !enabled) return;
    setFresh(first);
    Vibration.vibrate(BUZZ);
    void Notifications.scheduleNotificationAsync({
      content: { title: 'New job near you', body: `${first.serviceName} · ${first.whenLabel}${first.area ? ` · ${first.area}` : ''}. Open Zoove to accept it.`, sound: 'default', ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}) },
      trigger: null,
    }).catch(() => undefined);
  }, [open, enabled]);

  return { fresh, dismiss: () => setFresh(null) };
}
