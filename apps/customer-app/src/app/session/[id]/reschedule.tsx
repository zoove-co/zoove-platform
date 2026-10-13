import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookingSuccess } from '@/components/booking/BookingSuccess';
import { SchedulePicker } from '@/components/booking/SchedulePicker';
import { AppText } from '@/components/ui/AppText';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TabFooter } from '@/components/ui/TabFooter';
import { useBooking, useRescheduleBooking } from '@/features/booking/hooks';
import { track } from '@/lib/analytics/track';
import { ApiError } from '@/lib/api';
import { isActiveStatus } from '@/lib/api/status';
import { bookingErrorMessage } from '@/lib/api/errorMessage';
import { formatWhen, nextDays } from '@/lib/dates';
import { colors, radius, spacing } from '@/theme';

export default function RescheduleScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: booking, isPending, isError } = useBooking(id);
  const reschedule = useRescheduleBooking(id);

  const [dayIso, setDayIso] = useState(() => nextDays(1)[0]?.iso ?? '');
  const [slotStartsAt, setSlotStartsAt] = useState<string | undefined>();
  const [updatedLabel, setUpdatedLabel] = useState<string | null>(null);

  if (isError && !booking) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScreenHeader title={t('session.rescheduleTitle')} />
        <View style={styles.center}>
          <AppText variant="heading">{t('session.notFound')}</AppText>
        </View>
        <TabFooter />
      </SafeAreaView>
    );
  }

  if (isPending || !booking) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.purple} />
      </SafeAreaView>
    );
  }

  // Deep link or stale screen: only a changeable, scheduled session can be rescheduled.
  if (!updatedLabel && (!booking.canChange || booking.mode === 'instant' || !isActiveStatus(booking.status))) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScreenHeader title={t('session.rescheduleTitle')} />
        <View style={styles.center}>
          <AppText variant="bodyStrong" style={styles.closedText}>
            {t('session.changeError')}
          </AppText>
        </View>
        <View style={styles.footer}>
          <PrimaryButton
            label={t('session.done')}
            onPress={() => router.replace({ pathname: '/session/[id]', params: { id: booking.id } })}
          />
        </View>
        <TabFooter />
      </SafeAreaView>
    );
  }

  const backToSession = () =>
    router.replace({ pathname: '/session/[id]', params: { id: booking.id } });

  if (updatedLabel) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScreenHeader title={t('session.rescheduled')} />
        <View style={styles.successWrap}>
          <BookingSuccess
            title={t('session.rescheduled')}
            body={t('session.rescheduledBody', { when: updatedLabel })}
          />
        </View>
        <View style={styles.footer}>
          <PrimaryButton label={t('session.done')} onPress={backToSession} />
        </View>
        <TabFooter />
      </SafeAreaView>
    );
  }

  const onConfirm = () => {
    if (!slotStartsAt) return;
    if (reschedule.isPending) return;
    reschedule.mutate(slotStartsAt, {
      onError: (error) => {
        if (error instanceof ApiError && (error.code === 'SLOT_UNAVAILABLE' || error.code === 'SLOT_CONFLICT')) {
          setSlotStartsAt(undefined);
        }
      },
      onSuccess: (updated) => {
        track('booking_rescheduled', { booking_id: updated.id });
        setUpdatedLabel(updated.whenLabel);
      },
    });
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title={t('session.rescheduleTitle')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.current}>
          <AppText variant="eyebrow" color={colors.muted}>
            {t('session.currentBooking')}
          </AppText>
          <AppText variant="bodyStrong" color={colors.purple}>
            {booking.whenLabel}
          </AppText>
          <AppText variant="caption" color={colors.muted}>
            {booking.formatName}
          </AppText>
        </View>

        <SchedulePicker
          firstNumber={1}
          serviceSlug={booking.serviceSlug}
          dayIso={dayIso}
          onDayChange={(iso) => {
            setDayIso(iso);
            setSlotStartsAt(undefined);
          }}
          slotStartsAt={slotStartsAt}
          onSlotChange={setSlotStartsAt}
        />

        {slotStartsAt ? (
          <AppText variant="caption" color={colors.muted}>
            {formatWhen(slotStartsAt)}
          </AppText>
        ) : null}

        {reschedule.isError ? (
          <AppText variant="caption" color={colors.danger}>
            {bookingErrorMessage(reschedule.error, t)}
          </AppText>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label={t('session.rescheduleCta')}
          disabled={!slotStartsAt}
          loading={reschedule.isPending}
          onPress={onConfirm}
        />
      </View>
      <TabFooter />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { padding: 17, paddingBottom: spacing.xxl, gap: 22 },
  successWrap: { flex: 1 },
  closedText: { textAlign: 'center', paddingHorizontal: 24 },
  current: {
    gap: 3,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.lavender,
  },
  footer: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderTopWidth: 0.5,
    borderTopColor: colors.line,
    backgroundColor: colors.background,
  },
});
