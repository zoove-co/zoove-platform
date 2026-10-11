import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radius } from '@/theme';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'solid' | 'soft' | 'danger';
};

export function PrimaryButton({ label, onPress, disabled = false, loading = false, variant = 'solid' }: Props) {
  const filled = variant !== 'soft';
  const background =
    variant === 'danger' ? colors.danger : variant === 'solid' ? colors.purple : colors.lavender;
  const foreground = filled ? colors.white : colors.purple;
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: background, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
      ]}>
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <AppText variant="heading" color={foreground} style={styles.label}>
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
