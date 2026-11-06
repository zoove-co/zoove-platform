import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Vibration } from 'react-native';

import { useBookings } from '@/features/booking/hooks';

const BUZZ = [0, 700, 300, 700, 300, 700];

// Watches the customer's live sessions. When a session's timer ends, the phone buzzes and shows a notification
// ("time is over, give your finish code"), and the session is refreshed so the finish code and rating appear.
export function SessionClockWatcher() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const bookings = useBookings();
  const told = useRef<Set<string>>(new Set());
  const live = (bookings.data ?? []).filter((b) => b.inProgress && b.endsAt).map((b) => ({ id: b.id, endsAt: b.endsAt as string, name: b.serviceName }));
  const key = live.map((b) => `${b.id}@${b.endsAt}`).join('|');

  useEffect(() => {
    if (live.length === 0) return;
    const timer = setInterval(() => {
      for (const b of live) {
        const late = Date.now() - new Date(b.endsAt).getTime();
        if (late < 0 || told.current.has(b.id)) continue;
        told.current.add(b.id);
        if (late > 5 * 60_000) continue; // it ended a while ago: just refresh, no ringing
        Vibration.vibrate(BUZZ);
        void Notifications.scheduleNotificationAsync({ content: { title: t('session.timeUpTitle'), body: t('session.timeUpBody', { service: b.name }), sound: 'default' }, trigger: null }).catch(() => undefined);
        void queryClient.invalidateQueries({ queryKey: ['bookings'] });
        void queryClient.invalidateQueries({ queryKey: ['booking', b.id] });
      }
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
}
