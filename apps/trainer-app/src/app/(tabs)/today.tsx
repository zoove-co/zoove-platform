import { router } from 'expo-router';
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { errorMessage, setAcceptingJobs } from '@/lib/api';
import { useApplication } from '@/lib/useApplication';
import { useJobs, useSetBoard, whoFor } from '@/lib/useJobs';
import { colors } from '@/theme';

const WEEK_MS = 7 * 86_400_000;

// The first screen of an approved trainer: what is next, what is open, and how many sessions they have done.
export default function Today() {
  const jobs = useJobs();
  const setBoard = useSetBoard();
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const application = useApplication();
  const first = application.data?.form.firstName?.trim();
  const mine = jobs.data?.mine ?? [];
  const next = mine[0];
  const openCount = jobs.data?.open.length ?? 0;
  const thisWeek = (jobs.data?.done ?? []).filter((job) => job.completedAt && jobs.dataUpdatedAt - new Date(job.completedAt).getTime() < WEEK_MS).length;

  const accepting = jobs.data?.acceptingJobs ?? true;

  async function toggle(on: boolean) {
    setSwitching(true);
    setSwitchError(null);
    try {
      setBoard(await setAcceptingJobs(on));
    } catch (err) {
      setSwitchError(errorMessage(err));
    } finally {
      setSwitching(false);
    }
  }

  return (
    <Screen refreshing={jobs.isRefetching} onRefresh={() => void jobs.refetch()}>
      <AppText variant="screenTitle">{first ? `Hello, ${first}` : 'Hello'}</AppText>
      <AppText variant="body" color={colors.muted}>Here is your day on Zoove.</AppText>
      {jobs.isError && !jobs.data ? <Banner tone="bad">{errorMessage(jobs.error)}</Banner> : null}

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <AppText variant="heading">{accepting ? 'You are on' : 'You are off'}</AppText>
            <AppText variant="caption" color={colors.muted}>{accepting ? 'New sessions near you are offered to you.' : 'No new sessions are offered to you. Sessions you already hold stay yours.'}</AppText>
          </View>
          <Switch value={accepting} disabled={switching || !jobs.data} onValueChange={(on) => void toggle(on)} trackColor={{ false: colors.lavender, true: '#22A559' }} thumbColor="#FFFFFF" accessibilityLabel="Accept new jobs" />
        </View>
        {switchError ? <Banner tone="bad">{switchError}</Banner> : null}
      </Card>

      <Card>
        <AppText variant="caption" color={colors.muted}>UP NEXT</AppText>
        {next ? (
          <>
            <AppText variant="heading">{next.whenLabel}</AppText>
            <AppText variant="body">{`${next.serviceName} · ${next.formatName} · ${whoFor(next)}`}</AppText>
            <AppText variant="body" color={colors.muted}>{`${next.customerFirstName} · ${next.addressLine}${next.pincode ? `, ${next.pincode}` : ''}`}</AppText>
            <View style={{ marginTop: 10 }}><Button label="Open my sessions" small variant="soft" onPress={() => router.navigate('/sessions')} /></View>
          </>
        ) : (
          <AppText variant="body" color={colors.muted}>No session on your list yet.</AppText>
        )}
      </Card>

      <Card>
        <AppText variant="caption" color={colors.muted}>OPEN JOBS</AppText>
        <AppText variant="heading">{openCount === 0 ? 'Nothing open right now' : `${openCount} ${openCount === 1 ? 'job is' : 'jobs are'} waiting for you`}</AppText>
        {openCount > 0 ? <View style={{ marginTop: 10 }}><Button label="See open jobs" small onPress={() => router.navigate('/jobs')} /></View> : null}
      </Card>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Card soft style={{ flex: 1 }}>
          <AppText variant="heading">{thisWeek}</AppText>
          <AppText variant="caption" color={colors.muted}>Done in the last 7 days</AppText>
        </Card>
        <Card soft style={{ flex: 1 }}>
          <AppText variant="heading">{jobs.data?.doneCount ?? 0}</AppText>
          <AppText variant="caption" color={colors.muted}>Done in total</AppText>
        </Card>
      </View>
    </Screen>
  );
}
