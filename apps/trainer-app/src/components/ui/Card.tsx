import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius } from '@/theme';

export function Card({ children, soft = false, style }: { children: ReactNode; soft?: boolean; style?: ViewStyle }) {
  return <View style={[styles.card, soft && styles.soft, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: radius.lg, borderWidth: 0.8, borderColor: colors.line, backgroundColor: colors.white, gap: 4 },
  soft: { backgroundColor: colors.lavender, borderColor: colors.lavender },
});
