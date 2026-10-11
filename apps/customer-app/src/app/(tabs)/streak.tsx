import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useHomeData } from '@/features/home/useHomeData';
import { track } from '@/lib/analytics/track';
import { colors, radius, spacing } from '@/theme';

export default function StreakScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data } = useHomeData();
  const done = data?.weekly.done ?? 0;
  const goal = data?.weekly.goal ?? 3;
  const reached = done >= goal;

  useEffect(() => {
    track('streak_viewed');
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppText variant="screenTitle">{t('streak.title')}</AppText>
      <View style={styles.card}>
        <AppText variant="eyebrow" color={colors.purple}>
          {t('streak.thisWeek')}
        </AppText>
        <View style={styles.dots}>
          {Array.from({ length: goal }, (_, index) => {
            const filled = index < done;
            return (
              <View key={index} style={[styles.dot, filled && styles.dotFilled]}>
                <Icon name={filled ? 'checkmark' : 'flash-outline'} size={20} color={filled ? colors.white : colors.muted} />
              </View>
            );
          })}
        </View>
        <AppText variant="heading">{t('streak.progress', { done, goal })}</AppText>
        <AppText color={colors.muted}>{reached ? t('streak.goalReached') : t('streak.keepGoing')}</AppText>
      </View>
      <PrimaryButton label={t('streak.bookCta')} onPress={() => router.navigate('/home')} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.lg },
  card: {
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  dots: { flexDirection: 'row', gap: 10, marginVertical: spacing.sm },
  dot: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8, 11, 15, 0.06)',
  },
  dotFilled: { backgroundColor: colors.success },
});
