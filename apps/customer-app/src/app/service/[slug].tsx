import { formatInr } from '@zoove/shared';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OptionRow } from '@/components/service/OptionRow';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { InfoPill } from '@/components/ui/InfoPill';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TabFooter } from '@/components/ui/TabFooter';
import { useService } from '@/features/booking/hooks';
import { useHomeData } from '@/features/home/useHomeData';
import { track } from '@/lib/analytics/track';
import { colors, fonts, radius, spacing } from '@/theme';

export default function ServiceDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data: service, isPending, isError } = useService(slug);
  const { data: home } = useHomeData();
  const [formatSlug, setFormatSlug] = useState<string | undefined>();

  if (isPending) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.purple} />
      </SafeAreaView>
    );
  }

  if (isError || !service) {
    return (
      <SafeAreaView style={styles.screen}>
        <ScreenHeader title="" />
        <View style={styles.center}>
          <AppText variant="heading">{t('service.notFound')}</AppText>
        </View>
      </SafeAreaView>
    );
  }

  const format = service.formats.find((item) => item.slug === formatSlug) ?? service.formats[0];
  const hours = home?.instant.etaHours ?? 4;

  const startBooking = (mode: 'instant' | 'scheduled' | 'demo') => {
    track('booking_started', { mode, service_slug: service.slug });
    router.push({
      pathname: '/booking',
      params: { service: service.slug, mode, format: format?.slug ?? '' },
    });
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title={service.name} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <LinearGradient
          colors={[colors.purple, colors.supportingPurple]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}>
          <AppText variant="screenTitle" color={colors.white}>
            {service.name}
          </AppText>
          <AppText variant="heading" color="rgba(255,255,255,0.85)">
            {service.tagline}
          </AppText>
        </LinearGradient>

        <View style={styles.pillRow}>
          {service.formats.map((item) => {
            const selected = item.slug === format?.slug;
            return (
              <Pressable
                key={item.slug}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setFormatSlug(item.slug)}
                style={[styles.pill, selected && styles.pillSelected]}>
                <AppText variant="micro" color={selected ? colors.purple : colors.ink} style={styles.pillText}>
                  {item.name}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {format ? (
          <AppText variant="body" color={colors.muted}>
            {format.description}
          </AppText>
        ) : null}

        <View style={styles.infoRow}>
          <InfoPill icon="time-outline" title={service.durationLabel} caption={t('service.duration')} />
          <InfoPill icon="bar-chart-outline" title={service.intensityLabel} caption={t('service.intensity')} />
        </View>

        <Pressable accessibilityRole="button" onPress={() => startBooking('demo')} style={styles.demo}>
          <Icon name="barbell-outline" size={20} color={colors.purple} />
          <AppText variant="micro" style={styles.demoText}>
            {t('service.demoNudge')}{' '}
            <AppText variant="micro" color={colors.purple} style={styles.demoText}>
              {t('service.demoLink', { price: formatInr(service.pricePaise.demo) })}
            </AppText>
          </AppText>
          <Icon name="arrow-forward" size={14} color={colors.purple} />
        </Pressable>

        <OptionRow
          prominent
          title={t('home.instantTitle')}
          detail={t('service.instantDetail', { hours, price: formatInr(service.pricePaise.instant) })}
          onPress={() => startBooking('instant')}
        />
        <OptionRow
          title={t('home.scheduleTitle')}
          detail={t('service.scheduleDetail', { price: formatInr(service.pricePaise.scheduled) })}
          onPress={() => startBooking('scheduled')}
        />
      </ScrollView>
      <TabFooter />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { padding: 18, gap: 15 },
  hero: { height: 170, justifyContent: 'flex-end', gap: 4, padding: 18, borderRadius: 22 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  pillSelected: { borderColor: colors.purple, borderWidth: 1.2, backgroundColor: 'rgba(232, 217, 255, 0.6)' },
  pillText: { fontSize: 12 },
  infoRow: { flexDirection: 'row', gap: 9 },
  demo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.lavender,
  },
  demoText: { flex: 1, fontSize: 11, fontFamily: fonts.semibold },
});
