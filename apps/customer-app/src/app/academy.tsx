import { Image } from 'expo-image';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { track } from '@/lib/analytics/track';
import { academyImages } from '@/lib/images';
import { colors, radius, spacing } from '@/theme';

const CARDS = ['certified', 'programs', 'verified'] as const;

export default function AcademyScreen() {
  const { t } = useTranslation();
  useEffect(() => {
    track('academy_viewed', { section: 'detail' });
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title={t('academy.title')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <AppText variant="screenTitle">{t('academy.heading')}</AppText>
        <AppText color={colors.muted}>{t('academy.lead')}</AppText>
        <View style={styles.cards}>
          {CARDS.map((key) => (
            <Image key={key} source={academyImages[key]} contentFit="cover" style={styles.card} />
          ))}
        </View>
        <AppText color={colors.muted}>{t('academy.body')}</AppText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: 40 },
  cards: { gap: spacing.md },
  card: { width: '100%', aspectRatio: 1.5, borderRadius: radius.lg, backgroundColor: colors.lavender },
});
