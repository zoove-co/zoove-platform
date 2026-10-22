import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MenuRow } from '@/components/account/MenuRow';
import { AppText } from '@/components/ui/AppText';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Icon } from '@/components/ui/Icon';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useProfile } from '@/features/auth/hooks';
import { track } from '@/lib/analytics/track';
import { useAuth } from '@/lib/auth/useAuth';
import { colors, fonts, radius, spacing } from '@/theme';

export default function AccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const signOut = useAuth((state) => state.signOut);
  const { data: profile } = useProfile();
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ');
  const hasName = Boolean(profile?.firstName);

  useEffect(() => {
    track('account_viewed');
  }, []);

  const logout = async () => {
    track('signed_out');
    setConfirmingLogout(false);
    // Nothing from this customer may stay in memory for the next person on the device.
    queryClient.clear();
    await signOut();
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <AppText variant="screenTitle">{t('account.title')}</AppText>

        <View style={styles.profile}>
          <View style={styles.avatar}>
            {hasName ? (
              <AppText variant="sectionTitle" color={colors.purple} style={styles.avatarText}>
                {(profile?.firstName ?? '').slice(0, 1).toUpperCase()}
              </AppText>
            ) : (
              <Icon name="person" size={26} color={colors.purple} />
            )}
          </View>
          <View style={styles.profileText}>
            <AppText variant="heading">{hasName ? fullName : (profile?.phone ?? '')}</AppText>
            {hasName && profile ? (
              <AppText variant="caption" color={colors.muted}>
                {profile.phone}
              </AppText>
            ) : null}
          </View>
        </View>

        {!hasName ? (
          <View style={styles.nudge}>
            <AppText variant="bodyStrong">{t('profile.completeTitle')}</AppText>
            <AppText variant="caption" color={colors.muted}>
              {t('profile.completeBody')}
            </AppText>
            <PrimaryButton label={t('profile.completeCta')} onPress={() => router.push('/profile')} />
          </View>
        ) : null}

        <MenuRow icon="receipt-outline" label={t('account.orders')} onPress={() => router.push('/orders')} />
        {hasName ? (
          <MenuRow icon="create-outline" label={t('account.profile')} onPress={() => router.push('/profile')} />
        ) : null}
        <MenuRow icon="location-outline" label={t('account.addresses')} onPress={() => router.push('/addresses')} />
        <MenuRow icon="layers-outline" label={t('account.packages')} onPress={() => router.push('/packages')} />
        <MenuRow icon="gift-outline" label={t('account.referral')} onPress={() => router.push('/referral')} />
        <MenuRow icon="shield-checkmark-outline" label={t('account.policy')} onPress={() => router.push('/policies')} />
        <MenuRow icon="help-circle-outline" label={t('account.support')} onPress={() => router.push('/help')} />
        <MenuRow icon="log-out-outline" label={t('profile.logout')} onPress={() => setConfirmingLogout(true)} />
      </ScrollView>

      <ConfirmDialog
        visible={confirmingLogout}
        destructive
        title={t('profile.logoutTitle')}
        body={t('profile.logoutBody')}
        confirmLabel={t('profile.logoutConfirm')}
        cancelLabel={t('profile.logoutKeep')}
        onConfirm={() => void logout()}
        onCancel={() => setConfirmingLogout(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: spacing.md },
  profileText: { flex: 1, gap: 2 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.bold },
  nudge: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.lavender,
  },
});
