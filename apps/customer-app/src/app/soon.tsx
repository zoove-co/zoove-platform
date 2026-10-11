import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { TabFooter } from '@/components/ui/TabFooter';
import { colors, radius, spacing } from '@/theme';

// Temporary landing screen for every tap that does not have a real screen yet.
export default function SoonScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { title } = useLocalSearchParams<{ title?: string }>();

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.body}>
        <AppText variant="eyebrow" color={colors.magenta}>
          {t('soon.title').toUpperCase()}
        </AppText>
        <AppText variant="screenTitle" style={styles.title}>
          {title ?? t('soon.title')}
        </AppText>
        <AppText color={colors.muted}>{t('soon.body')}</AppText>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.button}>
          <AppText variant="bodyStrong" color={colors.white}>
            {t('soon.back')}
          </AppText>
        </Pressable>
      </View>
      <TabFooter />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, justifyContent: 'center', gap: spacing.md, padding: spacing.xxl },
  title: { fontSize: 26 },
  button: {
    alignSelf: 'flex-start',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.purple,
  },
});
