import { formatInr } from '@zoove/shared';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TabFooter } from '@/components/ui/TabFooter';
import { usePackages } from '@/features/booking/hooks';
import { track } from '@/lib/analytics/track';
import type { SessionPackage } from '@/lib/api';
import { colors, fonts, radius, spacing } from '@/theme';

// Everything on this screen (price, discount, validity, badge) comes from the API: Pratik, admins and
// support change it in the admin panel and it shows here without an app update (decision D13).
export default function PackagesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, isPending, isError, refetch } = usePackages();

  const onChoose = (item: SessionPackage) => {
    track('package_selected', {
      package_id: item.id,
      sessions_count: item.sessionsCount,
      price_paise: item.pricePaise,
    });
    // Checkout waits for payments (open questions 1 to 7).
    router.push({ pathname: '/soon', params: { title: item.name } });
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title={t('packages.title')} />
      {isPending ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.purple} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <AppText color={colors.danger} style={styles.centerText}>
            {t('packages.error')}
          </AppText>
          <PrimaryButton label={t('packages.retry')} variant="soft" onPress={() => void refetch()} />
        </View>
      ) : data.length === 0 ? (
        <View style={styles.center}>
          <AppText color={colors.muted} style={styles.centerText}>
            {t('packages.empty')}
          </AppText>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.intro}>
            <AppText variant="screenTitle">{t('packages.heading')}</AppText>
            <AppText color={colors.muted}>{t('packages.detail')}</AppText>
          </View>
          {data.map((item) => (
            <PackageCard key={item.id} item={item} onChoose={() => onChoose(item)} />
          ))}
        </ScrollView>
      )}
      <TabFooter />
    </SafeAreaView>
  );
}

function PackageCard({ item, onChoose }: { item: SessionPackage; onChoose: () => void }) {
  const { t } = useTranslation();
  const hasDiscount = item.originalPricePaise !== null && item.originalPricePaise > item.pricePaise;
  const percent = hasDiscount
    ? Math.round(((item.originalPricePaise! - item.pricePaise) / item.originalPricePaise!) * 100)
    : 0;
  const perSession = item.sessionsCount > 0 ? Math.round(item.pricePaise / item.sessionsCount) : item.pricePaise;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <AppText variant="heading">{t('packages.sessions', { count: item.sessionsCount })}</AppText>
        {item.badge ? (
          <View style={styles.badge}>
            <AppText variant="micro" color={colors.purple} style={styles.badgeText}>
              {item.badge}
            </AppText>
          </View>
        ) : null}
      </View>
      <View style={styles.priceRow}>
        <AppText variant="screenTitle">{formatInr(item.pricePaise)}</AppText>
        {hasDiscount ? (
          <>
            <AppText color={colors.muted} style={styles.strike}>
              {formatInr(item.originalPricePaise!)}
            </AppText>
            <AppText variant="micro" color={colors.success} style={styles.badgeText}>
              {t('packages.save', { percent })}
            </AppText>
          </>
        ) : null}
      </View>
      <AppText variant="caption" color={colors.muted}>
        {t('packages.perSession', { price: formatInr(perSession) })}
        {item.validityDays !== null ? `  ·  ${t('packages.validity', { days: item.validityDays })}` : ''}
      </AppText>
      <Pressable accessibilityRole="button" onPress={onChoose} style={styles.cta}>
        <AppText variant="bodyStrong" color={colors.white}>
          {t('packages.choose')}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xxl },
  centerText: { textAlign: 'center' },
  content: { padding: 18, gap: 14 },
  intro: { gap: 4, marginBottom: 4 },
  card: {
    gap: 8,
    padding: 16,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: colors.lavender },
  badgeText: { fontFamily: fonts.semibold },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  strike: { textDecorationLine: 'line-through' },
  cta: {
    marginTop: 6,
    height: 46,
    borderRadius: radius.lg,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
