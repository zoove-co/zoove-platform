import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radius } from '@/theme';

export function Chip({ label, selected, onPress, disabled = false }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, selected && styles.on, disabled && { opacity: 0.5 }]}>
      <AppText variant="bodyStrong" color={selected ? colors.white : colors.purple}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 16, minHeight: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lavender, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: colors.purple, borderColor: colors.purple },
});
