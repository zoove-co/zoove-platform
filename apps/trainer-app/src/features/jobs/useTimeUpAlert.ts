import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { Platform, Vibration } from 'react-native';

import type { MyJob } from '@/lib/api';
import { JOBS_KEY } from '@/lib/useJobs';

const BUZZ = [0, 700, 300, 700, 300, 700];

/**
 * When a live session's timer ends, the trainer's phone buzzes and shows a notification, and the returned job stays for a
 * banner until dismissed. The board is refreshed so the finish-code box opens. Works while the app is open.
 */
export function useTimeUpAlert(mine: MyJob[] | undefined) {
  const queryClient = useQueryClient();
  const told = useRef<Set<string>>(new Set());
  const [over, setOver] = useState<MyJob | null>(null);
  const live = (mine ?? []).filter((j) => j.started && j.endsAt);
  const key = live.map((j) => `${j.id}@${j.endsAt}`).join('|');

  useEffect(() => {
    if (live.length === 0) return;
    const timer = setInterval(() => {
      for (const job of live) {
        const late = Date.now() - new Date(job.endsAt as string).getTime();
        if (late < 0 || told.current.has(job.id)) continue;
        told.current.add(job.id);
        void queryClient.invalidateQueries({ queryKey: JOBS_KEY });
        if (late > 5 * 60_000) continue;
        setOver(job);
        Vibration.vibrate(BUZZ);
        void (async () => {
          try {
            if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('session-over', { name: 'Session over', importance: AndroidImportance.MAX, vibrationPattern: BUZZ, sound: 'default' });
            await Notifications.scheduleNotificationAsync({
              content: { title: 'Session time is over', body: `${job.serviceName} · ${job.customerFirstName}. Ask the customer for the finish code.`, sound: 'default', ...(Platform.OS === 'android' ? { channelId: 'session-over' } : {}) },
              trigger: null,
            });
          } catch {
            // The buzz and the banner are enough.
          }
        })();
      }
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { over, dismiss: () => setOver(null) };
}
