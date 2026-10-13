import { formatInr } from '@zoove/shared';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import type { Booking } from '@/lib/api';
import { isActiveStatus } from '@/lib/api/status';
import { colors, fonts, radius } from '@/theme';

type Props = { booking: Booking; onPress: () => void };

export function BookingRow({ booking, onPress }: Props) {
  const { t } = useTranslation();
  const active = isActiveStatus(booking.status);
  const statusLabel =
    booking.status === 'confirmed'
      ? t('session.statusConfirmed')
      : booking.status === 'matching'
        ? t('session.statusMatching')
        : booking.status === 'rematching'
          ? t('session.statusRematching')
          : booking.status === 'cancelled'
            ? t('session.statusCancelled')
            : t('session.statusCompleted');
  const done = booking.status === 'completed';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${booking.serviceName}, ${booking.whenLabel}, ${statusLabel}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.88 : 1 }]}>
      <View style={styles.badge}>
        <Icon name={done ? 'checkmark-circle-outline' : 'fitness-outline'} size={20} color={colors.purple} />
      </View>
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {booking.formatName}
        </AppText>
        <AppText variant="caption" color={colors.muted} numberOfLines={1}>
          {booking.whenLabel} · {booking.areaLabel}
        </AppText>
        <View style={styles.meta}>
          <View style={[styles.status, !active && styles.statusInactive]}>
            <AppText variant="micro" color={active ? colors.purple : colors.muted} style={styles.statusText}>
              {statusLabel}
            </AppText>
          </View>
          <AppText variant="caption" color={colors.muted}>
            {formatInr(booking.totalPaise)}
          </AppText>
        </View>
      </View>
      <Icon name="chevron-forward" size={14} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  status: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: colors.lavender },
  statusInactive: { backgroundColor: 'rgba(8, 11, 15, 0.06)' },
  statusText: { fontFamily: fonts.semibold },
});
