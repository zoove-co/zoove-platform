import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, radius } from '@/theme';

type Props = { icon: IconName; label: string; onPress: () => void };

export function MenuRow({ icon, label, onPress }: Props) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <Icon name={icon} size={18} color={colors.purple} />
      <AppText variant="bodyStrong" style={styles.label}>
        {label}
      </AppText>
      <Icon name="chevron-forward" size={14} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  label: { flex: 1 },
});
