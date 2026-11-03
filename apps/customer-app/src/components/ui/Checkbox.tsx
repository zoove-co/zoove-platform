import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { colors, radius } from '@/theme';

type Props = { checked: boolean; onChange: (checked: boolean) => void; label: string; children: ReactNode };

// A tick box whose whole row is one 44pt+ tap target. `label` is read out by screen readers; `children` is what is shown.
export function Checkbox({ checked, onChange, label, children }: Props) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      style={styles.row}>
      <View style={[styles.box, checked && styles.boxOn]}>{checked ? <Icon name="checkmark" size={16} color={colors.white} /> : null}</View>
      <View style={styles.text}>{children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  box: { width: 24, height: 24, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  boxOn: { backgroundColor: colors.purple, borderColor: colors.purple },
  text: { flex: 1 },
});
