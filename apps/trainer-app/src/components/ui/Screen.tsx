import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

type Props = {
  children: ReactNode;
  /** Pinned under the content, above the keyboard (the Continue button). */
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
};

// Every screen: safe area, scrolling, keyboard handling and an optional pinned footer.
export function Screen({ children, footer, refreshing, onRefresh }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg }}
        keyboardShouldPersistTaps="handled"
        {...(onRefresh ? { refreshControl: <RefreshControl refreshing={refreshing === true} onRefresh={onRefresh} /> } : {})}>
        {children}
      </ScrollView>
      {footer ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  footer: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.md, borderTopWidth: 0.8, borderTopColor: colors.line, backgroundColor: colors.white },
});
