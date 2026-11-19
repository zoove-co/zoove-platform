import { formatInr } from '@zoove/shared';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookingRow } from '@/components/orders/BookingRow';
import { AppText } from '@/components/ui/AppText';
import { FitnessLoader } from '@/components/ui/FitnessLoader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { TextField } from '@/components/ui/TextField';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TabFooter } from '@/components/ui/TabFooter';
import { useBookings, useBuyPackage, useCancelPackageOrder, useMyPackages, usePackages } from '@/features/booking/hooks';
import { discountErrorMessage } from '@/lib/api/errorMessage';
import { track } from '@/lib/analytics/track';
import type { Booking, PackagePurchase, SessionPackage } from '@/lib/api';
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
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const bookings = useBookings();
  const paid = (mine.data?.purchases ?? []).filter((order) => order.status === 'paid');
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
          scroller.current?.scrollTo({ y: 0, animated: true });
        },
      },
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title={t('packages.title')} />
      {isPending ? (
        <View style={styles.center}>
          <FitnessLoader fill={false} />
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
        <ScrollView ref={scroller} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
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
          {paid.length > 0 ? (
            <View style={styles.section}>
              <AppText variant="heading">{t('packages.mineTitle')}</AppText>
              {paid.map((purchase) => (
                <MyPackage key={purchase.id} purchase={purchase} sessions={(bookings.data ?? []).filter((b) => b.packageId === purchase.id && b.status !== 'cancelled')} />
              ))}
              <AppText variant="heading" style={styles.buyHeading}>{t('packages.buyAnother')}</AppText>
            </View>
          ) : null}
          {data.map((item) => (
            <PackageCard key={item.id} item={item} onChoose={() => onChoose(item)} />
          ))}
        </ScrollView>
      )}
      <Modal visible={chosen !== null} transparent animationType="slide" onRequestClose={() => setChosen(null)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.backdropTap} onPress={() => setChosen(null)} accessibilityLabel={t('packages.orderBack')} />
          {chosen ? (
            <View style={styles.sheet}>
              <AppText variant="heading">{t('packages.orderTitle', { name: chosen.name })}</AppText>
              <AppText color={colors.muted}>{t('packages.orderBody', { price: formatInr(chosen.pricePaise) })}</AppText>
              <TextField label={t('packages.codeLabel')} value={code} onChangeText={(text) => setCode(text.toUpperCase())} autoCapitalize="characters" />
              {buy.isError ? <AppText variant="caption" color={colors.danger}>{discountErrorMessage(buy.error, t)}</AppText> : null}
              <PrimaryButton label={t('packages.orderCta')} loading={buy.isPending} onPress={onOrder} />
              <PrimaryButton label={t('packages.orderBack')} variant="soft" onPress={() => setChosen(null)} />
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
      <TabFooter />
    </SafeAreaView>
  );
}

function MyPackage({ purchase, sessions }: { purchase: PackagePurchase; sessions: Booking[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const expired = purchase.expired ?? false;
  const used = purchase.creditsTotal - (purchase.creditsUnused ?? purchase.creditsLeft);
  const left = expired ? 0 : purchase.creditsLeft;
  const date = purchase.expiresAt ? new Date(purchase.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const ordered = useMemo(() => {
    const time = (b: Booking) => (b.startsAt ? new Date(b.startsAt).getTime() : Number.MAX_SAFE_INTEGER);
    const active = sessions.filter((b) => b.status !== 'completed').sort((a, b) => time(a) - time(b));
    const finished = sessions.filter((b) => b.status === 'completed').sort((a, b) => time(b) - time(a));
    return [...active, ...finished];
  }, [sessions]);
  const percent = purchase.creditsTotal > 0 ? Math.min(100, Math.round((used / purchase.creditsTotal) * 100)) : 0;

  return (
    <View style={[styles.mine, expired && { opacity: 0.7 }]}>
      <View style={styles.cardTop}>
        <AppText variant="heading">{purchase.name}</AppText>
        <AppText variant="bodyStrong" color={colors.purple}>{left === 1 ? t('packages.leftOne') : t('packages.left', { count: left })}</AppText>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%` }]} />
      </View>
      <AppText variant="caption" color={colors.muted}>
        {t('packages.used', { used, total: purchase.creditsTotal })}
        {date ? `  ·  ${expired ? t('packages.expired', { date }) : t('packages.validUntil', { date })}` : ''}
      </AppText>
      {left > 0 ? (
        <PrimaryButton label={t('packages.bookNext')} onPress={() => router.push({ pathname: '/booking', params: { credit: '1' } })} />
      ) : (
        <AppText variant="caption" color={colors.muted}>{expired ? '' : t('packages.usedUp')}</AppText>
      )}
      <AppText variant="bodyStrong">{t('packages.sessionsHeading')}</AppText>
      {ordered.length === 0 ? (
        <AppText variant="caption" color={colors.muted}>{t('packages.noSessionsYet')}</AppText>
      ) : (
        <>
          {ordered.map((booking) => (
            <BookingRow key={booking.id} booking={booking} showCoach onPress={() => router.push({ pathname: '/session/[id]', params: { id: booking.id } })} />
          ))}
          <AppText variant="micro" color={colors.muted}>{t('packages.tapToChange')}</AppText>
        </>
      )}
    </View>
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
  section: { gap: 12 },
  buyHeading: { marginTop: 8 },
  mine: { gap: 10, padding: 16, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.purple, backgroundColor: colors.white },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.lavender, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.purple },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(8, 11, 15, 0.45)' },
  backdropTap: { flex: 1 },
  sheet: { gap: 10, padding: 20, paddingBottom: 28, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.white },
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
