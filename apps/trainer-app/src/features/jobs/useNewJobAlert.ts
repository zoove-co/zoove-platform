import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { Platform, Vibration } from 'react-native';

import type { OpenJob } from '@/lib/api';
import { ensureChannels, JOB_CHANNEL } from '@/lib/push';

// A long, hard-to-miss buzz: three strong pulses.
const BUZZ = [0, 700, 300, 700, 300, 700];

// Rings with the Zoove bell (the job request channel). Where the phone will not show notifications, it still buzzes.
async function ring(job: OpenJob): Promise<void> {
  try {
    await ensureChannels();
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status === 'granted') {
      await Notifications.scheduleNotificationAsync({
        content: { title: 'New job request', body: `${job.serviceName} · ${job.whenLabel}${job.area ? ` · ${job.area}` : ''}`, sound: 'zoove_job_bell.wav', ...(Platform.OS === 'android' ? { channelId: JOB_CHANNEL } : {}) },
        trigger: null,
      });
      return;
    }
  } catch {
    // fall through to the buzz
  }
  Vibration.vibrate(BUZZ);
}

/**
 * Watches the open jobs. When one appears that the trainer has not seen yet, the phone rings with the Zoove bell and the returned
 * job (for the pop-up card on screen) stays until dismissed. The first load never alerts.
 * This works while the app is open. With the app closed, the push message does the ringing (see push.ts).
 */
export function useNewJobAlert(open: OpenJob[] | undefined, enabled: boolean) {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<OpenJob | null>(null);

  useEffect(() => {
    if (!enabled) return;
    void ensureChannels().catch(() => undefined);
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
    void ring(first);
  }, [open, enabled]);

  // The card goes away by itself if somebody else takes the job first.
  const stillOpen = fresh && open?.some((job) => job.id === fresh.id) ? fresh : null;
  return { fresh: stillOpen, dismiss: () => setFresh(null) };
}
