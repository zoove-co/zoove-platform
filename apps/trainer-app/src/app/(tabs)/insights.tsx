import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { FitnessLoader } from '@/components/ui/FitnessLoader';
import { Screen } from '@/components/ui/Screen';
import { errorMessage, type EarnSlice, type Insights } from '@/lib/api';
import { rupees, rupeesShort, useInsights } from '@/lib/useInsights';
import { colors, radius } from '@/theme';

const CHART_HEIGHT = 120;

// One bar that grows into place when it first shows and again when its value changes.
function Bar({ value, max, label, top, current }: { value: number; max: number; label: string; top: string; current: boolean }) {
  const [grow] = useState(() => new Animated.Value(0));
  const target = value > 0 ? Math.max(6, Math.round((value / max) * CHART_HEIGHT)) : 3;
  useEffect(() => {
    Animated.timing(grow, { toValue: target, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [grow, target]);
  return (
    <View style={styles.barCol}>
      <AppText variant="micro" color={value > 0 ? colors.ink : 'transparent'} numberOfLines={1}>{top}</AppText>
      <View style={styles.barSlot}>
        <Animated.View style={[styles.bar, { height: grow, backgroundColor: value === 0 ? colors.lavender : current ? colors.purple : '#B79CFF' }]} />
      </View>
      <AppText variant="micro" color={current ? colors.purple : colors.muted} numberOfLines={1}>{label}</AppText>
    </View>
  );
}

function Chart({ data, known }: { data: Insights; known: boolean }) {
  const [mode, setMode] = useState<'weeks' | 'months'>('weeks');
  const rows = mode === 'weeks' ? data.weekly : data.monthly;
  const value = (r: { sessions: number; earnedPaise: number }) => (known ? r.earnedPaise : r.sessions);
  const max = Math.max(1, ...rows.map(value));
  return (
    <Card>
      <View style={styles.rowBetween}>
        <AppText variant="heading">{known ? 'Earnings over time' : 'Sessions over time'}</AppText>
        <View style={styles.seg}>
          {(['weeks', 'months'] as const).map((m) => (
            <Pressable key={m} onPress={() => setMode(m)} accessibilityRole="button" accessibilityState={{ selected: mode === m }} style={[styles.segItem, mode === m && styles.segOn]}>
              <AppText variant="bodyStrong" color={mode === m ? colors.white : colors.purple}>{m === 'weeks' ? '8 weeks' : '6 months'}</AppText>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.chart}>
        {rows.map((r, i) => (
          <Bar key={`${mode}-${r.label}`} value={value(r)} max={max} label={r.label} top={known ? rupeesShort(r.earnedPaise) : String(r.sessions)} current={i === rows.length - 1} />
        ))}
      </View>
      <AppText variant="caption" color={colors.muted}>{mode === 'weeks' ? 'Each bar is a week starting on the date shown.' : 'Each bar is a calendar month.'} The last bar is now.</AppText>
    </Card>
  );
}

function Breakdown({ title, rows, known }: { title: string; rows: EarnSlice[]; known: boolean }) {
  const metric = (r: EarnSlice) => (known ? r.earnedPaise : r.sessions);
  const total = rows.reduce((sum, r) => sum + metric(r), 0) || 1;
  const [grow] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(grow, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [grow]);
  return (
    <View style={{ gap: 10 }}>
      <AppText variant="eyebrow" color={colors.muted}>{title.toUpperCase()}</AppText>
      {rows.length === 0 ? <AppText variant="body" color={colors.muted}>Nothing yet.</AppText> : rows.map((r, i) => {
        const share = metric(r) / total;
        return (
          <View key={r.name} style={{ gap: 5 }}>
            <View style={styles.rowBetween}>
              <AppText variant="bodyStrong">{r.name}</AppText>
              <AppText variant="body" color={colors.muted}>{`${r.sessions} session${r.sessions === 1 ? '' : 's'}${known ? ` · ${rupees(r.earnedPaise)}` : ''}`}</AppText>
            </View>
            <View style={styles.track}>
              <Animated.View style={[styles.fill, { width: grow.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${Math.max(4, Math.round(share * 100))}%`] }), backgroundColor: i === 0 ? colors.purple : colors.magenta, opacity: i === 0 ? 1 : 0.55 }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function Earnings() {
  const q = useInsights();
  const data = q.data;
  const known = data?.earningsKnown ?? false;
  const p = data?.periods;
  // "Personal ₹1,200 · Duo ₹1,560": what each kind of session pays, for the kinds that have an amount.
  const perSession = data
    ? ([['Personal', data.payouts.personal], ['Duo', data.payouts.duo], ['Family', data.payouts.loved_one], ['Group', data.payouts.group]] as [string, number | null][])
        .filter((row): row is [string, number] => row[1] !== null)
        .map(([label, paise]) => `${label} ${rupees(paise)}`)
    : [];
  const tile = (label: string, period: { sessions: number; earnedPaise: number } | undefined) => (
    <Card soft style={{ flex: 1 }}>
      <AppText variant="eyebrow" color={colors.supportingPurple}>{label}</AppText>
      <AppText variant="price">{period ? (known ? rupees(period.earnedPaise) : String(period.sessions)) : '–'}</AppText>
      <AppText variant="caption" color={colors.muted}>{period ? `${period.sessions} session${period.sessions === 1 ? '' : 's'}` : ''}</AppText>
    </Card>
  );

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <View>
        <AppText variant="screenTitle">Earnings</AppText>
        <AppText variant="body" color={colors.muted}>What you have earned and where it comes from.</AppText>
      </View>
      {q.isError && !data ? <Banner tone="bad">{errorMessage(q.error)}</Banner> : null}
      {q.isPending ? <FitnessLoader fill={false} /> : null}

      {data && p ? (
        <>
          <View style={styles.hero}>
            <AppText variant="eyebrow" color="rgba(255,255,255,0.75)">THIS MONTH</AppText>
            <AppText variant="screenTitle" color={colors.white} style={styles.heroNumber}>{known ? rupees(p.month.earnedPaise) : `${p.month.sessions} sessions`}</AppText>
            <AppText variant="body" color="rgba(255,255,255,0.85)">
              {known ? `${p.month.sessions} session${p.month.sessions === 1 ? '' : 's'} this month · ${rupees(p.week.earnedPaise)} this week` : 'Your earnings will show here once Zoove sets the payout for each session. Your session counts are below.'}
            </AppText>
            {known && perSession.length > 0 ? (
              <View style={styles.heroChip}><AppText variant="bodyStrong" color={colors.white}>{perSession.join(' · ')}</AppText></View>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            {tile('TODAY', p.today)}
            {tile('THIS WEEK', p.week)}
            {tile('LIFETIME', p.lifetime)}
          </View>

          <Chart data={data} known={known} />

          <Card style={{ gap: 18 }}>
            <AppText variant="heading">Where you earn</AppText>
            <Breakdown title="By service" rows={data.byService} known={known} />
            <Breakdown title="By session type" rows={data.byParticipant} known={known} />
            <Breakdown title="Instant or scheduled" rows={data.byMode} known={known} />
          </Card>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Card style={{ flex: 1 }}>
              <AppText variant="eyebrow" color={colors.muted}>YOUR RATING</AppText>
              <AppText variant="price">{data.rating.average !== null ? `★ ${data.rating.average}` : '–'}</AppText>
              <AppText variant="caption" color={colors.muted}>{data.rating.count === 0 ? 'No ratings yet' : `${data.rating.count} rating${data.rating.count === 1 ? '' : 's'}`}</AppText>
            </Card>
            <Card style={{ flex: 1 }}>
              <AppText variant="eyebrow" color={colors.muted}>COMING UP</AppText>
              <AppText variant="price">{data.upcoming}</AppText>
              <AppText variant="caption" color={colors.muted}>{data.upcoming === 1 ? 'session on your list' : 'sessions on your list'}</AppText>
            </Card>
          </View>
          <AppText variant="caption" color={colors.muted}>Amounts are what Zoove pays you per completed session. The amount that applied when you finished a session stays with that session.</AppText>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { padding: 20, borderRadius: radius.xxl, backgroundColor: colors.purple, gap: 6, shadowColor: colors.purple, shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  heroNumber: { fontSize: 40, lineHeight: 46 },
  heroChip: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.18)' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  seg: { flexDirection: 'row', padding: 3, borderRadius: radius.pill, backgroundColor: colors.lavender },
  segItem: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: radius.pill },
  segOn: { backgroundColor: colors.purple },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingTop: 8 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barSlot: { height: CHART_HEIGHT, justifyContent: 'flex-end', alignSelf: 'stretch', alignItems: 'center' },
  bar: { width: '70%', maxWidth: 30, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  track: { height: 9, borderRadius: radius.pill, backgroundColor: colors.lavender, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
