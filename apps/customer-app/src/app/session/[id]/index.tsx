import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Icon, type IconName } from '@/components/ui/Icon';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TabFooter } from '@/components/ui/TabFooter';
import { useBooking, useCancelBooking } from '@/features/booking/hooks';
import { track } from '@/lib/analytics/track';
import { colors, fonts, radius, spacing } from '@/theme';

function DetailRow({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.detailRow}>
      <Icon name={icon} size={16} color={colors.purple} />
      <AppText variant="caption" style={styles.detailText}>
        {text}
      </AppText>
    </View>
  );
}

export default function SessionDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: booking, isPending, isError } = useBooking(id);
  const cancel = useCancelBooking(id);
  const [confirming, setConfirming] = useState(false);

  if (isPending) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.purple} />
      </SafeAreaView>
    );
  }

  if (isError || !booking) {
    return (
      <SafeAreaView style={styles.screen}>
        <ScreenHeader title={t('session.title')} />
        <View style={styles.center}>
          <AppText variant="heading">{t('session.notFound')}</AppText>
        </View>
      </SafeAreaView>
    );
  }

  const statusLabel =
    booking.status === 'confirmed'
      ? t('session.statusConfirmed')
      : booking.status === 'matching'
        ? t('session.statusMatching')
        : booking.status === 'cancelled'
          ? t('session.statusCancelled')
          : t('session.statusCompleted');
  const active = booking.status === 'confirmed' || booking.status === 'matching';
  const canReschedule = active && booking.mode !== 'instant' && booking.startsAt !== null;

  const onCancel = () => {
    cancel.mutate(undefined, {
      onSuccess: () => {
        track('booking_cancelled', { booking_id: booking.id, reason: 'customer' });
        setConfirming(false);
        router.replace('/home');
      },
      onError: () => setConfirming(false),
    });
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title={t('session.title')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <LinearGradient
            colors={[colors.purple, colors.supportingPurple]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.thumb}>
            <Icon name="fitness-outline" size={32} color={colors.white} />
          </LinearGradient>
          <View style={styles.cardText}>
            <View style={[styles.status, !active && styles.statusInactive]}>
              <AppText variant="micro" color={active ? colors.purple : colors.muted} style={styles.statusText}>
                {statusLabel}
              </AppText>
            </View>
            <AppText variant="heading">
              {booking.formatName} · {t('booking.personal')}
            </AppText>
            <DetailRow icon="calendar-outline" text={booking.whenLabel} />
          </View>
        </View>

        <View style={styles.details}>
          <DetailRow icon="home-outline" text={t('booking.formatValue')} />
          <DetailRow
            icon="person-outline"
            text={booking.status === 'matching' ? t('session.statusMatching') : t('booking.coachValue')}
          />
          <DetailRow icon="location-outline" text={`${booking.addressLabel} · ${booking.areaLabel}`} />
        </View>

        {active ? (
          <View style={styles.actions}>
            {canReschedule ? (
              <PrimaryButton
                label={t('session.reschedule')}
                variant="soft"
                disabled={!booking.canChange}
                onPress={() =>
                  router.push({ pathname: '/session/[id]/reschedule', params: { id: booking.id } })
                }
              />
            ) : null}
            <PrimaryButton
              label={t('session.cancel')}
              variant="soft"
              disabled={!booking.canChange}
              onPress={() => setConfirming(true)}
            />
            <AppText variant="micro" color={colors.muted} style={styles.note}>
              {booking.canChange ? t('session.changeNote') : t('session.changeClosed')}
            </AppText>
            {cancel.isError ? (
              <AppText variant="caption" color={colors.danger} style={styles.note}>
                {t('session.changeError')}
              </AppText>
            ) : null}
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/soon', params: { title: t('session.policy') } })}
          style={styles.linkRow}>
          <Icon name="shield-checkmark-outline" size={16} color={colors.purple} />
          <AppText variant="caption" style={styles.detailText}>
            {t('session.policy')}
          </AppText>
          <Icon name="chevron-forward" size={14} color={colors.muted} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/soon', params: { title: t('session.support') } })}
          style={styles.linkRow}>
          <Icon name="help-circle-outline" size={16} color={colors.purple} />
          <AppText variant="caption" style={styles.detailText}>
            {t('session.support')}
          </AppText>
          <Icon name="chevron-forward" size={14} color={colors.muted} />
        </Pressable>
      </ScrollView>
      <TabFooter />

      <ConfirmDialog
        visible={confirming}
        destructive
        title={t('session.cancelTitle')}
        body={t('session.cancelBody', { service: booking.serviceName })}
        confirmLabel={t('session.cancelConfirm')}
        cancelLabel={t('session.cancelKeep')}
        loading={cancel.isPending}
        onConfirm={onCancel}
        onCancel={() => setConfirming(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { padding: 18, gap: 15 },
  card: {
    flexDirection: 'row',
    gap: 14,
    padding: 14,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  thumb: { width: 76, height: 76, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, gap: 6 },
  status: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: colors.lavender,
  },
  statusInactive: { backgroundColor: 'rgba(8, 11, 15, 0.06)' },
  statusText: { fontFamily: fonts.semibold },
  details: {
    gap: spacing.md,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailText: { flex: 1 },
  actions: { gap: spacing.sm },
  note: { textAlign: 'center' },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: spacing.md,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
});
