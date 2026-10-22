import { formatInr } from '@zoove/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddressSheet } from '@/components/home/AddressSheet';
import { AcademySection } from '@/components/home/AcademySection';
import { ActionTile } from '@/components/home/ActionTile';
import { BannerCarousel, type Banner } from '@/components/home/BannerCarousel';
import { DemoBanner } from '@/components/home/DemoBanner';
import { ExploreTile } from '@/components/home/ExploreTile';
import { HomeHeader } from '@/components/home/HomeHeader';
import { UpcomingDock } from '@/components/home/UpcomingDock';
import { Wordmark } from '@/components/brand/Wordmark';
import { AppText } from '@/components/ui/AppText';
import { useHomeData } from '@/features/home/useHomeData';
import { track } from '@/lib/analytics/track';
import { bannerImages, serviceImages } from '@/lib/images';
import { colors, radius, spacing } from '@/theme';

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, isPending, isError, refetch } = useHomeData();

  const [addressOpen, setAddressOpen] = useState(false);
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

  const banners: Banner[] = [
    {
      key: 'book-for-you',
      image: bannerImages.bookForYou,
      label: t('home.bannerBookForYou'),
      onPress: () => {
        track('banner_tapped', { banner: 'book_for_you' });
        track('booking_started', { mode: 'instant' });
        router.push({ pathname: '/booking', params: { mode: 'instant' } });
      },
    },
    {
      key: 'mix-format',
      image: bannerImages.mixFormat,
      label: t('home.bannerMixFormat'),
      onPress: () => {
        track('banner_tapped', { banner: 'mix_format' });
        track('packages_viewed');
        router.push('/packages');
      },
    },
    {
      key: 'swap-format',
      image: bannerImages.swapFormat,
      label: t('home.bannerSwapFormat'),
      onPress: () => {
        track('banner_tapped', { banner: 'swap_format' });
        // Swapping the format of a booked session is not built yet (open question 44).
        openSoon(t('home.bannerSwapFormat'));
      },
    },
    {
      key: 'flexible',
      image: bannerImages.flexible,
      label: t('home.bannerFlexible'),
      onPress: () => {
        track('banner_tapped', { banner: 'flexible_scheduling' });
        track('booking_started', { mode: 'scheduled' });
        router.push({ pathname: '/booking', params: { mode: 'scheduled' } });
      },
    },
    {
      key: 'party',
      image: bannerImages.party,
      label: t('home.bannerParty'),
      onPress: () => {
        track('banner_tapped', { banner: 'party' });
        router.push('/party');
      },
    },
  ];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <HomeHeader
          name={data.customerFirstName ?? t('profile.guestName')}
          locationLabel={data.locationLabel ?? t('location.addPrompt')}
          hasUnread={data.hasUnreadNotifications}
          onBell={() => {
            track('notifications_opened');
            router.push('/notifications');
          }}
          onAvatar={() => router.navigate('/account')}
          onLocation={() => setAddressOpen(true)}
        />

        {!data.locationServiceable ? (
          <View style={styles.banner}>
            <AppText variant="bodyStrong" color={colors.danger}>
              {t('location.bannerTitle', { area: data.locationArea ?? '' })}
            </AppText>
            <AppText variant="caption" color={colors.muted}>
              {t('location.bannerBody')}
            </AppText>
            <Pressable accessibilityRole="button" onPress={() => setAddressOpen(true)}>
              <AppText variant="bodyStrong" color={colors.purple}>
                {t('location.bannerCta')}
              </AppText>
            </Pressable>
          </View>
        ) : null}
        <BannerCarousel banners={banners} />

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
              router.push('/packages');
            }}
          />
        </View>

        <View style={styles.block}>
          <View style={styles.exploreRow} accessible accessibilityLabel={t('home.exploreTitle')}>
            <AppText variant="sectionTitle" style={styles.exploreText}>
              {t('home.exploreLead')}
            </AppText>
            <View style={styles.logoChip}>
              <Wordmark width={60} />
            </View>
            <AppText variant="sectionTitle" style={styles.exploreText}>
              {t('home.exploreTrail')}
            </AppText>
          </View>
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
            router.push('/academy');
          }}
        />
      </ScrollView>

      <AddressSheet visible={addressOpen} onClose={() => setAddressOpen(false)} />
      {session ? (
        <UpcomingDock
          serviceName={session.serviceName}
          whenLabel={session.whenLabel}
          status={session.status}
          done={session.sessionsDoneThisWeek}
          goal={session.weeklyGoal}
          onPress={() => router.push({ pathname: '/session/[id]', params: { id: session.id } })}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 18, paddingTop: 9, paddingBottom: spacing.lg, gap: 17 },
  block: { gap: 10 },
  exploreRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  exploreText: { fontSize: 18 },
  logoChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 0.9,
    borderColor: colors.line,
  },
  banner: {
    gap: 4,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(217, 45, 32, 0.06)',
  },
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
