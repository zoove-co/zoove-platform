import { formatInr } from '@zoove/shared';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AcademySection } from '@/components/home/AcademySection';
import { ActionTile } from '@/components/home/ActionTile';
import { DemoBanner } from '@/components/home/DemoBanner';
import { ExploreTile } from '@/components/home/ExploreTile';
import { HomeHeader } from '@/components/home/HomeHeader';
import { UpcomingDock } from '@/components/home/UpcomingDock';
import { AppText } from '@/components/ui/AppText';
import { useHomeData } from '@/features/home/useHomeData';
import { track } from '@/lib/analytics/track';
import { serviceImages } from '@/lib/images';
import { colors, radius, spacing } from '@/theme';

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, isPending, isError, refetch } = useHomeData();

  const openSoon = (title: string) => router.push({ pathname: '/soon', params: { title } });

  if (isPending) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <ActivityIndicator color={colors.purple} />
      </SafeAreaView>
    );
  }

  if (isError || !data) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <AppText variant="heading" style={styles.centerText}>
          {t('home.errorTitle')}
        </AppText>
        <Pressable accessibilityRole="button" onPress={() => void refetch()} style={styles.retry}>
          <AppText variant="bodyStrong" color={colors.white}>
            {t('home.retry')}
          </AppText>
        </Pressable>
      </SafeAreaView>
    );
  }

  const session = data.upcomingSession;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <HomeHeader
          name={data.customerFirstName}
          locationLabel={data.locationLabel}
          hasUnread={data.hasUnreadNotifications}
          onBell={() => {
            track('notifications_opened');
            openSoon('Notifications');
          }}
          onAvatar={() => router.navigate('/account')}
          onLocation={() => openSoon('Addresses')}
        />

        <View style={styles.block}>
          <AppText variant="sectionTitle">{t('home.bookTitle')}</AppText>
          <View style={styles.tileRow}>
            <ActionTile
              variant="prominent"
              icon="flash"
              title={t('home.instantTitle')}
              detail={t('home.instantDetail', { hours: data.instant.etaHours })}
              price={formatInr(data.instant.pricePaise)}
              onPress={() => {
                track('booking_started', { mode: 'instant' });
                router.push({ pathname: '/booking', params: { mode: 'instant' } });
              }}
            />
            <ActionTile
              variant="outlined"
              icon="calendar-outline"
              title={t('home.scheduleTitle')}
              detail={t('home.scheduleDetail')}
              price={formatInr(data.scheduled.pricePaise)}
              onPress={() => {
                track('booking_started', { mode: 'scheduled' });
                router.push({ pathname: '/booking', params: { mode: 'scheduled' } });
              }}
            />
          </View>
          <ActionTile
            variant="soft"
            compact
            icon="layers-outline"
            title={t('home.packagesTitle')}
            detail={t('home.packagesDetail')}
            onPress={() => {
              track('packages_viewed');
              openSoon(t('home.packagesTitle'));
            }}
          />
        </View>

        <View style={styles.block}>
          <AppText variant="sectionTitle">{t('home.exploreTitle')}</AppText>
          <View style={styles.grid}>
            {data.services.map((service) => (
              <ExploreTile
                key={service.slug}
                name={service.name}
                imageSource={serviceImages[service.slug]}
                onPress={() => {
                  track('service_viewed', { service_slug: service.slug });
                  router.push({ pathname: '/service/[slug]', params: { slug: service.slug } });
                }}
              />
            ))}
          </View>
        </View>

        <DemoBanner
          priceLabel={formatInr(data.demo.pricePaise)}
          originalPriceLabel={formatInr(data.demo.originalPricePaise)}
          onPress={() => {
            track('booking_started', { mode: 'demo' });
            router.push({ pathname: '/booking', params: { mode: 'demo' } });
          }}
        />

        <AcademySection
          onOpen={(section) => {
            track('academy_viewed', { section });
            openSoon('Zoove Academy');
          }}
        />
      </ScrollView>

      {session ? (
        <UpcomingDock
          serviceName={session.serviceName}
          whenLabel={session.whenLabel}
          done={session.sessionsDoneThisWeek}
          goal={session.weeklyGoal}
          onPress={() => openSoon('Upcoming session')}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 18, paddingTop: 9, paddingBottom: spacing.lg, gap: 17 },
  block: { gap: 10 },
  tileRow: { flexDirection: 'row', gap: 9 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    backgroundColor: colors.background,
  },
  centerText: { textAlign: 'center', paddingHorizontal: spacing.xxl },
  retry: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.purple,
  },
});
