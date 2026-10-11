import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MenuRow } from '@/components/account/MenuRow';
import { AppText } from '@/components/ui/AppText';
import { useHomeData } from '@/features/home/useHomeData';
import { track } from '@/lib/analytics/track';
import { colors, fonts, spacing } from '@/theme';

export default function AccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data } = useHomeData();
  const name = data?.customerFirstName ?? '';

  useEffect(() => {
    track('account_viewed');
  }, []);

  const soon = (title: string) => router.push({ pathname: '/soon', params: { title } });

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <AppText variant="screenTitle">{t('account.title')}</AppText>
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <AppText variant="sectionTitle" color={colors.purple} style={styles.avatarText}>
              {name.slice(0, 1).toUpperCase()}
            </AppText>
          </View>
          <View>
            <AppText variant="heading">{name}</AppText>
            {data ? (
              <AppText variant="caption" color={colors.muted}>
                {data.locationLabel}
              </AppText>
            ) : null}
          </View>
        </View>

        <MenuRow icon="receipt-outline" label={t('account.orders')} onPress={() => router.push('/orders')} />
        <MenuRow icon="location-outline" label={t('account.addresses')} onPress={() => router.push('/addresses')} />
        <MenuRow icon="layers-outline" label={t('account.packages')} onPress={() => soon(t('account.packages'))} />
        <MenuRow icon="shield-checkmark-outline" label={t('account.policy')} onPress={() => soon(t('account.policy'))} />
        <MenuRow icon="help-circle-outline" label={t('account.support')} onPress={() => soon(t('account.support'))} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: spacing.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.bold },
});
