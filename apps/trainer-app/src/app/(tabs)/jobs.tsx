import { useEffect, useState } from 'react';
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
// Where the job is compared with the trainer's own pincode. The exact address stays hidden until the job is accepted.
const NEAR_LABEL = { same_pincode: 'In your pincode', near_you: 'Near you', elsewhere: 'Elsewhere in Mumbai' } as const;

// "Came in 4 min ago". The list is checked every few seconds, so this is what tells a trainer which job is the newest.
function cameIn(offeredAt: string | null, now: number): string | null {
  if (!offeredAt) return null;
  const minutes = Math.max(0, Math.floor((now - new Date(offeredAt).getTime()) / 60_000));
  if (minutes < 1) return 'Came in just now';
  if (minutes < 60) return `Came in ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `Came in ${hours} hr ago` : 'Came in over a day ago';
}
const JUST_IN_MINUTES = 15;

export default function Jobs() {
  const jobs = useJobs();
  const setBoard = useSetBoard();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Re-draw every 30 seconds so "min ago" and the "Just in" tag stay right while the screen is open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

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
  // The job that reached this trainer last. They may have passed on several far or unsuitable ones, so the newest one stands out.
  const newest = open.reduce<(typeof open)[number] | null>((best, job) => (job.offeredAt && (!best?.offeredAt || job.offeredAt > best.offeredAt) ? job : best), null);
  return (
    <Screen refreshing={jobs.isRefetching} onRefresh={() => void jobs.refetch()}>
      <AppText variant="screenTitle">Open jobs</AppText>
      <AppText variant="body" color={colors.muted}>
        Sessions near you that nobody has taken yet. The closest jobs appear first, and more appear as we widen the search. The first trainer to accept gets it, and you only see jobs at times you are free. The full address shows after you accept.
      </AppText>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {note && !error ? <Banner tone="good">{note}</Banner> : null}
      {jobs.isError && !jobs.data ? <Banner tone="bad">{errorMessage(jobs.error)}</Banner> : null}
      {jobs.data && !jobs.data.acceptingJobs ? <Banner tone="warn">You are switched off, so no new jobs are offered. Switch on from the Today tab.</Banner> : null}
      {jobs.data && jobs.data.acceptingJobs && open.length === 0 ? (
        <Card soft>
          <AppText variant="body" color={colors.muted}>No open jobs right now. This list checks again every few seconds, and we also email you when a new job is offered to you.</AppText>
        </Card>
      ) : null}
      {open.map((job) => {
        const age = cameIn(job.offeredAt, now);
        const justIn = newest?.id === job.id && job.offeredAt !== null && now - new Date(job.offeredAt).getTime() < JUST_IN_MINUTES * 60_000;
        // With several jobs the newest is always marked; a lone job is marked only while it is fresh.
        const latest = newest?.id === job.id && (open.length > 1 || justIn);
        return (
          <Card key={job.id} style={latest ? { borderColor: colors.purple, borderWidth: 2, backgroundColor: '#F7F2FF' } : {}}>
            {latest ? (
              <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                <View style={{ backgroundColor: colors.magenta, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 }}>
                  <AppText variant="caption" color={colors.white} style={{ fontWeight: '700' }}>{justIn ? 'JUST IN' : 'LATEST'}</AppText>
                </View>
              </View>
            ) : null}
            <AppText variant="heading">{job.whenLabel}</AppText>
            <AppText variant="body">{`${job.serviceName} · ${job.formatName} · ${whoFor(job)}`}</AppText>
            <AppText variant="body" style={{ fontWeight: '600' }}>{[job.area ?? 'Mumbai', NEAR_LABEL[job.nearness ?? 'elsewhere']].join(' · ')}</AppText>
            <AppText variant="caption" color={latest ? colors.purple : colors.muted}>{[`Session ${job.sessionCode}`, age].filter(Boolean).join(' · ')}</AppText>
            <View style={{ marginTop: 10 }}>
              <Button label="Accept this job" small loading={busy === job.id} disabled={busy !== null && busy !== job.id} onPress={() => void accept(job.id)} />
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}
