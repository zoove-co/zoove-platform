import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, radius, spacing } from '@/theme';

type Props = {
  title: string;
  detail: string;
  price?: string;
  icon: IconName;
  variant: 'prominent' | 'outlined' | 'soft';
  compact?: boolean;
  onPress: () => void;
};

export function ActionTile({ title, detail, price, icon, variant, compact = false, onPress }: Props) {
  const prominent = variant === 'prominent';
  const foreground = prominent ? colors.white : colors.ink;
  const accent = prominent ? colors.white : colors.purple;
  const secondary = prominent ? 'rgba(255, 255, 255, 0.82)' : colors.muted;
  const background = prominent ? colors.purple : variant === 'soft' ? colors.lavender : colors.white;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={price ? `${title}, ${price}` : title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        compact ? styles.compact : styles.regular,
        { backgroundColor: background, opacity: pressed ? 0.85 : 1 },
        !prominent && styles.bordered,
      ]}>
      <View style={styles.iconRow}>
        <Icon name={icon} size={compact ? 17 : 19} color={accent} />
        <Icon name="arrow-up" size={12} color={accent} style={styles.arrow} />
      </View>
      <AppText variant="heading" color={foreground} numberOfLines={compact ? 1 : 2} style={styles.title}>
        {title}
      </AppText>
      <AppText variant="micro" color={secondary} numberOfLines={1}>
        {detail}
      </AppText>
      {price ? (
        <AppText variant="price" color={foreground} style={styles.price}>
          {price}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.lg, gap: spacing.sm },
  regular: { flex: 1, padding: spacing.md, minHeight: 139 },
  compact: { padding: 13, minHeight: 76, gap: 7 },
  bordered: { borderWidth: 0.8, borderColor: colors.line },
  iconRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  arrow: { transform: [{ rotate: '45deg' }] },
  title: { fontSize: 14 },
  price: { marginTop: 1 },
});
