import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TextField } from '@/components/ui/TextField';
import { useApplyReferralCode, useReferral } from '@/features/booking/hooks';
import { ApiError } from '@/lib/api';
import { track } from '@/lib/analytics/track';
import { colors, radius, spacing } from '@/theme';

// No reward is promised anywhere on this screen: referral rewards are undecided (open question 10).
export default function ReferralScreen() {
  const { t } = useTranslation();
  const { data, isPending } = useReferral();
  const code = data?.code;
  const apply = useApplyReferralCode();
  const [friendCode, setFriendCode] = useState('');
  const applyMessage = apply.error instanceof ApiError ? (apply.error.code === 'NOT_FOUND' ? t('referral.codeInvalid') : t('referral.codeRefused')) : apply.isError ? t('referral.codeRefused') : null;

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
        {data ? (
          <View style={styles.stats}>
            <View style={styles.stat}>
              <AppText variant="screenTitle">{data.signedUp}</AppText>
              <AppText variant="micro" color={colors.muted}>{t('referral.joined')}</AppText>
            </View>
            <View style={styles.stat}>
              <AppText variant="screenTitle">{data.booked}</AppText>
              <AppText variant="micro" color={colors.muted}>{t('referral.booked')}</AppText>
            </View>
          </View>
        ) : null}
        {data && !data.referredBy ? (
          <View style={styles.apply}>
            <AppText variant="bodyStrong">{t('referral.haveCode')}</AppText>
            <TextField label={t('referral.friendCode')} value={friendCode} onChangeText={(text) => setFriendCode(text.toUpperCase())} autoCapitalize="characters" />
            {applyMessage ? <AppText variant="caption" color={colors.danger}>{applyMessage}</AppText> : null}
            <PrimaryButton label={t('referral.apply')} variant="soft" disabled={friendCode.trim().length < 4} loading={apply.isPending} onPress={() => apply.mutate(friendCode.trim())} />
          </View>
        ) : data?.referredBy ? (
          <AppText color={colors.success}>{t('referral.applied')}</AppText>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: spacing.md },
  stat: { flex: 1, alignItems: 'center', padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.lavender, gap: 2 },
  apply: { gap: spacing.sm, marginTop: spacing.md },
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
