import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import type { BookingStatus } from '@/lib/api';
import { colors, radius, spacing } from '@/theme';

type Props = {
  serviceName: string;
  whenLabel: string;
  status: BookingStatus;
  done: number;
  goal: number;
  onPress: () => void;
};

export function UpcomingDock({ serviceName, whenLabel, status, done, goal, onPress }: Props) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${serviceName}, ${whenLabel}`}
      onPress={onPress}
      style={({ pressed }) => [styles.dock, { opacity: pressed ? 0.88 : 1 }]}>
      <View style={styles.badge}>
        <Icon
          name={status === 'rematching' ? 'search-outline' : 'calendar-outline'}
          size={18}
          color={colors.purple}
        />
      </View>
      <View style={styles.text}>
        <AppText variant="eyebrow" color={colors.purple} style={styles.eyebrow}>
          {status === 'rematching'
            ? t('home.findingCoachEyebrow')
            : t('home.upcomingEyebrow', { done, goal })}
        </AppText>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {serviceName}  ·  {whenLabel}
        </AppText>
      </View>
      <Icon name="chevron-up" size={14} color={colors.purple} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: 13,
    marginTop: 7,
    marginBottom: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  badge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 3 },
  eyebrow: { fontSize: 9, letterSpacing: 1 },
});
