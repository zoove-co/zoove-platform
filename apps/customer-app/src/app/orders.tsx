import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookingRow } from '@/components/orders/BookingRow';
import { AppText } from '@/components/ui/AppText';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TabFooter } from '@/components/ui/TabFooter';
import { useBookings } from '@/features/booking/hooks';
import { isActiveStatus } from '@/lib/api/status';
import { track } from '@/lib/analytics/track';
import { colors, radius, spacing } from '@/theme';

type Tab = 'upcoming' | 'past';

export default function OrdersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, isPending, isError, refetch } = useBookings();
  const [tab, setTab] = useState<Tab>('upcoming');

  useEffect(() => {
    track('orders_viewed');
  }, []);

  const { upcoming, past } = useMemo(() => {
    const all = data ?? [];
    const time = (startsAt: string | null) => (startsAt ? new Date(startsAt).getTime() : Number.MAX_SAFE_INTEGER);
    return {
      // Soonest first; instant bookings still matching have no time yet, so they sit at the top.
      upcoming: all
        .filter((b) => isActiveStatus(b.status))
        .sort((a, b) => (a.startsAt ? time(a.startsAt) : 0) - (b.startsAt ? time(b.startsAt) : 0)),
      // Most recent first.
      past: all
        .filter((b) => !isActiveStatus(b.status))
        .sort((a, b) => time(b.startsAt) - time(a.startsAt)),
    };
  }, [data]);

  const list = tab === 'upcoming' ? upcoming : past;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title={t('orders.title')} />
      <View style={styles.tabs}>
        {(['upcoming', 'past'] as const).map((item) => {
          const selected = item === tab;
          return (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setTab(item)}
              style={[styles.tab, selected && styles.tabSelected]}>
              <AppText variant="bodyStrong" color={selected ? colors.white : colors.ink}>
                {t(`orders.${item}`)}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {isPending ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.purple} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <AppText variant="heading" style={styles.centerText}>
            {t('orders.loadError')}
          </AppText>
          <PrimaryButton label={t('orders.retry')} variant="soft" onPress={() => void refetch()} />
        </View>
      ) : list.length === 0 ? (
        <View style={styles.center}>
          <AppText variant="heading" style={styles.centerText}>
            {tab === 'upcoming' ? t('orders.emptyUpcomingTitle') : t('orders.emptyPastTitle')}
          </AppText>
          <AppText color={colors.muted} style={styles.centerText}>
            {tab === 'upcoming' ? t('orders.emptyUpcomingBody') : t('orders.emptyPastBody')}
          </AppText>
          {tab === 'upcoming' ? (
            <View style={styles.cta}>
              <PrimaryButton label={t('orders.bookCta')} onPress={() => router.navigate('/home')} />
            </View>
          ) : null}
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {list.map((booking) => (
            <BookingRow
              key={booking.id}
              booking={booking}
              onPress={() => router.push({ pathname: '/session/[id]', params: { id: booking.id } })}
            />
          ))}
        </ScrollView>
      )}
      <TabFooter />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingVertical: 12 },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  tabSelected: { backgroundColor: colors.purple, borderColor: colors.purple },
  content: { paddingHorizontal: 18, paddingBottom: spacing.xl, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xxl },
  centerText: { textAlign: 'center' },
  cta: { alignSelf: 'stretch', marginTop: spacing.md },
});
