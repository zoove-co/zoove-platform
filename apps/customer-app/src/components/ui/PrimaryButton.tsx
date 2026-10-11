import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radius } from '@/theme';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'solid' | 'soft';
};

export function PrimaryButton({ label, onPress, disabled = false, loading = false, variant = 'solid' }: Props) {
  const solid = variant === 'solid';
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: solid ? colors.purple : colors.lavender, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
      ]}>
      {loading ? (
        <ActivityIndicator color={solid ? colors.white : colors.purple} />
      ) : (
        <AppText variant="heading" color={solid ? colors.white : colors.purple} style={styles.label}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 19,
  },
  label: { fontSize: 15 },
});
