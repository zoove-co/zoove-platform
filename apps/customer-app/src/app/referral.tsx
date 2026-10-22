import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useReferralCode } from '@/features/booking/hooks';
import { track } from '@/lib/analytics/track';
import { colors, radius, spacing } from '@/theme';

// No reward is promised anywhere on this screen: referral rewards are undecided (open question 10).
export default function ReferralScreen() {
  const { t } = useTranslation();
  const { data: code, isPending } = useReferralCode();

  useEffect(() => {
    track('referral_viewed');
  }, []);

  const onShare = async () => {
    if (!code) return;
    track('referral_shared');
    try {
      await Share.share({ message: t('referral.shareMessage', { code }) });
    } catch {
      // The customer closed the sheet or sharing is unavailable: nothing to do.
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title={t('referral.title')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <AppText variant="screenTitle">{t('referral.heading')}</AppText>
        <AppText color={colors.muted}>{t('referral.body')}</AppText>
        <View style={styles.codeCard}>
          <AppText variant="eyebrow" color={colors.purple}>
            {t('referral.codeLabel').toUpperCase()}
          </AppText>
          {isPending ? (
            <ActivityIndicator color={colors.purple} />
          ) : (
            <AppText variant="screenTitle" selectable>
              {code}
            </AppText>
          )}
        </View>
        <PrimaryButton label={t('referral.share')} disabled={!code} onPress={() => void onShare()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg },
  codeCard: {
    gap: spacing.sm,
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.lavender,
  },
});
