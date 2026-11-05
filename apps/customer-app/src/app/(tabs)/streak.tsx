import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookingRow } from '@/components/orders/BookingRow';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useMyPackages, useStreak } from '@/features/booking/hooks';
import { track } from '@/lib/analytics/track';
import type { StreakDay } from '@/lib/api';
import { serviceImages } from '@/lib/images';
import { colors, radius, spacing } from '@/theme';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';

// Your Streak. Everything here is computed by the API from bookings (see StreakData); the screen only
// draws it. Parts of Pratik's prototype are not built yet because the rules are open: milestones, the
// coach's "last week focus" note, and the package balance (docs/flutter-prototype-comparison.md).
export default function StreakScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, isPending, isError, refetch } = useStreak();
  const myPackages = useMyPackages();
  const creditsLeft = myPackages.data?.credits.creditsLeft ?? 0;
  useRefetchOnFocus(refetch);

  useEffect(() => {
    track('streak_viewed');
  }, []);

  if (isPending) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.purple} />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]} edges={['top']}>
        <AppText color={colors.danger}>{t('streak.error')}</AppText>
        <PrimaryButton label={t('streak.retry')} variant="soft" onPress={() => void refetch()} />
      </SafeAreaView>
    );
  }

  const reached = data.sessionsThisWeek >= data.weeklyGoal;
  const streakLabel =
    data.weekStreak === 1
      ? t('streak.weekStreakOne', { count: 1 })
      : t('streak.weekStreakMany', { count: data.weekStreak });

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.titleBlock}>
          <AppText variant="screenTitle">{t('streak.title')}</AppText>
          <AppText color={colors.muted}>{t('streak.lead')}</AppText>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.flame}>
              <Icon name="flash" size={22} color={colors.white} />
            </View>
            <View style={styles.heroText}>
              <AppText variant="eyebrow" color="rgba(255,255,255,0.8)">
                {t('streak.weekStreakTitle').toUpperCase()}
              </AppText>
              <AppText variant="screenTitle" color={colors.white}>
                {streakLabel}
              </AppText>
            </View>
          </View>
          <AppText color="rgba(255,255,255,0.9)">
            {data.weekStreak > 0
              ? t('streak.weekStreakKeep', { count: data.weekStreak })
              : t('streak.weekStreakEmpty')}
          </AppText>
        </View>

        <View style={styles.card}>
          <AppText variant="eyebrow" color={colors.purple}>
            {t('streak.thisWeek')}
          </AppText>
          <View style={styles.week}>
            {data.weekDays.map((day) => (
              <DayCell key={day.iso} day={day} />
            ))}
          </View>
          <AppText variant="bodyStrong">
            {t('streak.progress', { done: data.sessionsThisWeek, goal: data.weeklyGoal })}
          </AppText>
          <AppText color={colors.muted}>{reached ? t('streak.goalReached') : t('streak.keepGoing')}</AppText>
        </View>

        <View style={styles.stats}>
          <Stat label={t('streak.statTotal')} value={String(data.totalSessions)} />
          <Stat label={t('streak.statWeek')} value={`${data.sessionsThisWeek}/${data.weeklyGoal}`} />
          <Stat label={t('streak.statStreak')} value={String(data.weekStreak)} />
          <Stat label={t('streak.statFocus')} value={String(data.focusAreas.length)} />
        </View>

        <View style={styles.section}>
          <AppText variant="heading">{t('streak.focusTitle')}</AppText>
          {data.focusAreas.length === 0 ? (
            <AppText color={colors.muted}>{t('streak.focusEmpty')}</AppText>
          ) : (
            <View style={styles.focusRow}>
              {data.focusAreas.map((area) => {
                const image = serviceImages[area.serviceSlug];
                return (
                  <View key={area.serviceSlug} style={styles.focusCard}>
                    {image ? <Image source={image} contentFit="cover" style={styles.focusImage} /> : null}
                    <View style={styles.focusBody}>
                      <AppText variant="bodyStrong">{area.serviceName}</AppText>
                      <AppText variant="micro" color={colors.muted}>
                        {t('streak.focusSessions', { count: area.sessions })}
                      </AppText>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <AppText variant="heading">{t('streak.milestonesTitle')}</AppText>
          <View style={styles.milestones}>
            {MILESTONES.map((count) => {
              const done = data.totalSessions >= count;
              return (
                <View key={count} style={[styles.milestone, done && styles.milestoneDone]}>
                  <Icon name={done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={done ? colors.white : colors.muted} />
                  <AppText variant="bodyStrong" color={done ? colors.white : colors.ink}>{t('streak.milestone', { count })}</AppText>
                  <AppText variant="micro" color={done ? 'rgba(255,255,255,0.85)' : colors.muted}>
                    {done ? t('streak.milestoneDone') : t('streak.milestoneNext', { left: count - data.totalSessions })}
                  </AppText>
                </View>
              );
            })}
          </View>
        </View>

        <Pressable accessibilityRole="button" onPress={() => router.push('/progress')} style={styles.packageCard}>
          <View style={styles.packageText}>
            <AppText variant="bodyStrong">{t('progress.cta')}</AppText>
            <AppText variant="micro" color={colors.muted}>{t('progress.ctaBody')}</AppText>
          </View>
          <Icon name="chevron-forward" size={20} color={colors.purple} />
        </Pressable>

        <View style={styles.packageCard}>
          <View style={styles.packageText}>
            <AppText variant="bodyStrong">{creditsLeft > 0 ? t('streak.credits', { count: creditsLeft }) : t('streak.packageTitle')}</AppText>
            <AppText variant="micro" color={colors.muted}>{creditsLeft > 0 ? t('streak.creditsBody') : t('streak.packageBody')}</AppText>
          </View>
          <PrimaryButton label={t('streak.packageCta')} variant="soft" onPress={() => router.push('/packages')} />
        </View>

        <View style={styles.note}>
          <AppText variant="eyebrow" color={colors.purple}>{t('streak.noteTitle').toUpperCase()}</AppText>
          <AppText color={colors.muted}>{t('streak.noteBody')}</AppText>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <AppText variant="heading">{t('streak.recentTitle')}</AppText>
            <Pressable accessibilityRole="button" onPress={() => router.push('/orders')} hitSlop={12} style={{ minHeight: 44, justifyContent: 'center' }}>
              <AppText variant="bodyStrong" color={colors.purple}>
                {t('streak.recentAll')}
              </AppText>
            </Pressable>
          </View>
          {data.recentSessions.length === 0 ? (
            <AppText color={colors.muted}>{t('streak.recentEmpty')}</AppText>
          ) : (
            data.recentSessions.map((booking) => (
              <BookingRow
                key={booking.id}
                booking={booking}
                onPress={() => router.push({ pathname: '/session/[id]', params: { id: booking.id } })}
              />
            ))
          )}
        </View>

        <PrimaryButton label={t('streak.bookCta')} onPress={() => router.navigate('/home')} />
      </ScrollView>
    </SafeAreaView>
  );
}

function DayCell({ day }: { day: StreakDay }) {
  const { t } = useTranslation();
  const done = day.state === 'completed';
  const booked = day.state === 'booked';
  return (
    <View style={styles.dayCell}>
      <AppText variant="micro" color={colors.muted}>
        {day.weekday}
      </AppText>
      <View style={[styles.dayDot, done && styles.dayDone, booked && styles.dayBooked, day.isToday && styles.dayToday]}>
        {done ? (
          <Icon name="checkmark" size={16} color={colors.white} />
        ) : (
          <AppText variant="micro" color={booked ? colors.purple : colors.ink}>
            {day.dayOfMonth}
          </AppText>
        )}
      </View>
      <AppText variant="micro" color={day.isToday || booked ? colors.purple : colors.muted}>
        {day.isToday ? t('streak.today') : booked ? t('streak.booked') : done ? t('streak.done') : ' '}
      </AppText>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="screenTitle">{value}</AppText>
      <AppText variant="micro" color={colors.muted}>
        {label}
      </AppText>
    </View>
  );
}

const MILESTONES = [5, 10, 25, 50];

const styles = StyleSheet.create({
  milestones: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  milestone: { flexGrow: 1, flexBasis: '45%', gap: 2, padding: spacing.md, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  milestoneDone: { backgroundColor: colors.purple, borderColor: colors.purple },
  note: { gap: 4, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.lavender },
  screen: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: 40 },
  titleBlock: { gap: 4 },
  hero: { gap: spacing.md, padding: spacing.xl, borderRadius: radius.xl, backgroundColor: colors.purple },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroText: { gap: 2 },
  flame: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.magenta,
  },
  card: {
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCell: { alignItems: 'center', gap: 4, flex: 1 },
  dayDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8, 11, 15, 0.05)',
  },
  dayDone: { backgroundColor: colors.success },
  dayBooked: { backgroundColor: colors.lavender },
  dayToday: { borderWidth: 1.4, borderColor: colors.purple },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: {
    flexGrow: 1,
    flexBasis: '47%',
    gap: 2,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  section: { gap: spacing.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  focusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  focusCard: {
    flexGrow: 1,
    flexBasis: '47%',
    overflow: 'hidden',
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  focusImage: { width: '100%', aspectRatio: 1.9 },
  focusBody: { gap: 2, padding: spacing.md },
  packageCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.lavender,
  },
  packageText: { gap: 2 },
});
