import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { acceptJob, errorMessage } from '@/lib/api';
import { useJobs, useSetBoard, whoFor } from '@/lib/useJobs';
import { colors } from '@/theme';

// Sessions near the trainer that nobody has taken yet. The first trainer to accept gets it.
export default function Jobs() {
  const jobs = useJobs();
  const setBoard = useSetBoard();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function accept(id: string) {
    setBusy(id);
    setError(null);
    setNote(null);
    try {
      setBoard(await acceptJob(id));
      setNote('It is yours. Find the details under My sessions.');
    } catch (err) {
      setError(errorMessage(err));
      await jobs.refetch(); // most likely someone else took it first
    } finally {
      setBusy(null);
    }
  }

  const open = jobs.data?.open ?? [];
  return (
    <Screen refreshing={jobs.isRefetching} onRefresh={() => void jobs.refetch()}>
      <AppText variant="screenTitle">Open jobs</AppText>
      <AppText variant="body" color={colors.muted}>
        Sessions near you that nobody has taken yet. The closest jobs appear first, and more appear as we widen the search. The first trainer to accept gets it, and you only see jobs at times you are free. The full address shows after you accept.
      </AppText>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {note && !error ? <Banner tone="good">{note}</Banner> : null}
      {jobs.isError && !jobs.data ? <Banner tone="bad">{errorMessage(jobs.error)}</Banner> : null}
      {jobs.data && open.length === 0 ? (
        <Card soft>
          <AppText variant="body" color={colors.muted}>No open jobs right now. This list checks again every few seconds, and we also email you when a new job is offered to you.</AppText>
        </Card>
      ) : null}
      {open.map((job) => (
        <Card key={job.id}>
          <AppText variant="heading">{job.whenLabel}</AppText>
          <AppText variant="body">{`${job.serviceName} · ${job.formatName} · ${whoFor(job)}`}</AppText>
          <AppText variant="caption" color={colors.muted}>{`${job.area ?? 'Mumbai'} · Session ${job.sessionCode}`}</AppText>
          <View style={{ marginTop: 10 }}>
            <Button label="Accept this job" small loading={busy === job.id} disabled={busy !== null && busy !== job.id} onPress={() => void accept(job.id)} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
