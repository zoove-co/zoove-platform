import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, radius } from '@/theme';

type Props = { icon: IconName; label: string; onPress: () => void; dot?: boolean };

export function MenuRow({ icon, label, onPress, dot = false }: Props) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <Icon name={icon} size={18} color={colors.purple} />
      <AppText variant="bodyStrong" style={styles.label}>
        {label}
      </AppText>
      {dot ? <View accessibilityLabel="New reply" style={styles.dot} /> : null}
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
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.magenta },
});
