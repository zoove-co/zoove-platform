import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { colors, radius } from '@/theme';

type Props = {
  name: string;
  locationLabel: string;
  hasUnread: boolean;
  onBell: () => void;
  onAvatar: () => void;
  onLocation: () => void;
};

export function HomeHeader({ name, locationLabel, hasUnread, onBell, onAvatar, onLocation }: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <AppText variant="heading" style={styles.greeting}>
          {t('home.greeting', { name })}
        </AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={onBell} style={styles.bell}>
          <Icon name="notifications-outline" size={22} color={colors.ink} />
          {hasUnread ? <View style={styles.dot} /> : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Profile" onPress={onAvatar} style={styles.avatar}>
          <Icon name="person" size={18} color={colors.purple} />
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={locationLabel} onPress={onLocation} style={styles.pill}>
        <Icon name="location-outline" size={15} color={colors.purple} />
        <AppText variant="micro" style={styles.pillText}>
          {locationLabel}
        </AppText>
        <Icon name="chevron-down" size={10} color={colors.purple} />
        <View style={styles.spacer} />
        <Icon name="chevron-forward" size={11} color={colors.purple} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 17 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  greeting: { flex: 1 },
  bell: { width: 36, height: 38, alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    top: 7,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.magenta,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 38,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(232, 217, 255, 0.32)',
  },
  pillText: { fontSize: 12 },
  spacer: { flex: 1 },
});
