import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing } from '@/theme';

export function ScreenHeader({ title }: { title: string }) {
  const router = useRouter();
  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        style={styles.back}>
        <Icon name="chevron-back" size={18} color={colors.ink} />
      </Pressable>
      <AppText variant="sectionTitle" numberOfLines={1} style={styles.title}>
        {title}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 18,
    paddingTop: spacing.sm,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.line,
  },
  back: {
    width: 37,
    height: 37,
    borderRadius: 19,
    backgroundColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1 },
});
