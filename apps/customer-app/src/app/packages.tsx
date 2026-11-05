import { formatInr } from '@zoove/shared';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { TextField } from '@/components/ui/TextField';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TabFooter } from '@/components/ui/TabFooter';
import { useBuyPackage, useCancelPackageOrder, useMyPackages, usePackages } from '@/features/booking/hooks';
import { discountErrorMessage } from '@/lib/api/errorMessage';
import { track } from '@/lib/analytics/track';
import type { PackagePurchase, SessionPackage } from '@/lib/api';
import { colors, fonts, radius, spacing } from '@/theme';

// Everything on this screen (price, discount, validity, badge) comes from the API: Pratik, admins and
// support change it in the admin panel and it shows here without an app update (decision D13).
export default function PackagesScreen() {
  const { t } = useTranslation();
  const { data, isPending, isError, refetch } = usePackages();
  const mine = useMyPackages();
  const buy = useBuyPackage();
  const cancelOrder = useCancelPackageOrder();
  const [chosen, setChosen] = useState<SessionPackage | null>(null);
  const [code, setCode] = useState('');
  const [placed, setPlaced] = useState<PackagePurchase | null>(null);
  const orderKey = useRef<{ key: string; signature: string } | null>(null);
  const waiting = (mine.data?.purchases ?? []).filter((order) => order.status === 'awaiting_payment');
  const creditsLeft = mine.data?.credits.creditsLeft ?? 0;

  const onChoose = (item: SessionPackage) => {
    track('package_selected', {
      package_id: item.id,
      sessions_count: item.sessionsCount,
      price_paise: item.pricePaise,
    });
    setChosen(item);
    setPlaced(null);
    buy.reset();
  };

  const onOrder = () => {
    if (!chosen || buy.isPending) return;
    const signature = `${chosen.id}|${code.trim().toUpperCase()}`;
    if (!orderKey.current || orderKey.current.signature !== signature) {
      orderKey.current = { key: `pk-${Date.now()}-${Math.random().toString(36).slice(2)}`, signature };
    }
    buy.mutate(
      { packageId: chosen.id, ...(code.trim() ? { discountCode: code.trim() } : {}), idempotencyKey: orderKey.current.key },
      {
        onSuccess: (order) => {
          track('package_ordered', { package_id: chosen.id, amount_paise: order.totalPaise });
          setPlaced(order);
          setChosen(null);
          setCode('');
        },
      },
    );
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
          {creditsLeft > 0 ? (
            <View style={styles.balance}>
              <AppText variant="bodyStrong" color={colors.purple}>{t('packages.credits', { count: creditsLeft })}</AppText>
              <AppText variant="micro" color={colors.muted}>{t('packages.creditsHint')}</AppText>
            </View>
          ) : null}
          {placed ? (
            <View style={styles.balance}>
              <AppText variant="bodyStrong">{t('packages.placedTitle', { name: placed.name })}</AppText>
              <AppText color={colors.muted}>{t('packages.placedBody', { price: formatInr(placed.totalPaise) })}</AppText>
            </View>
          ) : null}
          {waiting.filter((order) => order.id !== placed?.id).map((order) => (
            <View key={order.id} style={styles.balance}>
              <AppText variant="bodyStrong">{t('packages.waitingTitle', { name: order.name, price: formatInr(order.totalPaise) })}</AppText>
              <AppText variant="micro" color={colors.muted}>{t('packages.waitingBody')}</AppText>
              <Pressable accessibilityRole="button" onPress={() => cancelOrder.mutate(order.id)} hitSlop={10}>
                <AppText variant="bodyStrong" color={colors.danger}>{t('packages.cancelOrder')}</AppText>
              </Pressable>
            </View>
          ))}
          {data.map((item) => (
            <PackageCard key={item.id} item={item} onChoose={() => onChoose(item)} />
          ))}
          {chosen ? (
            <View style={styles.order}>
              <AppText variant="heading">{t('packages.orderTitle', { name: chosen.name })}</AppText>
              <AppText color={colors.muted}>{t('packages.orderBody', { price: formatInr(chosen.pricePaise) })}</AppText>
              <TextField label={t('packages.codeLabel')} value={code} onChangeText={(text) => setCode(text.toUpperCase())} autoCapitalize="characters" />
              {buy.isError ? <AppText variant="caption" color={colors.danger}>{discountErrorMessage(buy.error, t)}</AppText> : null}
              <PrimaryButton label={t('packages.orderCta')} loading={buy.isPending} onPress={onOrder} />
              <PrimaryButton label={t('packages.orderBack')} variant="soft" onPress={() => setChosen(null)} />
            </View>
          ) : null}
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
  balance: { gap: 4, padding: 14, borderRadius: radius.xl, backgroundColor: colors.lavender },
  order: { gap: 10, padding: 16, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.purple, backgroundColor: colors.white },
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
