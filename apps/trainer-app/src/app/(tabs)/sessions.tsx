import { useState } from 'react';
import { Alert, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { cancelJob, completeJob, errorMessage, type JobBoard } from '@/lib/api';
import { useJobs, useSetBoard, whoFor } from '@/lib/useJobs';
import { colors } from '@/theme';

// The sessions this trainer holds: address after accepting, "Session done" after the start time, and "I cannot make it".
export default function Sessions() {
  const jobs = useJobs();
  const setBoard = useSetBoard();
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function run(id: string, action: () => Promise<JobBoard>, done: string) {
    setBusy(id);
    setError(null);
    setNote(null);
    try {
      setBoard(await action());
      setNote(done);
      setCancelling(null);
      setReason('');
    } catch (err) {
      setError(errorMessage(err));
      await jobs.refetch();
    } finally {
      setBusy(null);
    }
  }

  function confirmDone(id: string) {
    Alert.alert('Mark this session as done?', 'Only do this after you have trained the client.', [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Session done', onPress: () => void run(id, () => completeJob(id), 'Thank you. The session is marked done.') },
    ]);
  }

  const mine = jobs.data?.mine ?? [];
  return (
    <Screen refreshing={jobs.isRefetching} onRefresh={() => void jobs.refetch()}>
      <AppText variant="screenTitle">My sessions</AppText>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {note && !error ? <Banner tone="good">{note}</Banner> : null}
      {jobs.isError && !jobs.data ? <Banner tone="bad">{errorMessage(jobs.error)}</Banner> : null}
      {jobs.data && mine.length === 0 ? (
        <Card soft>
          <AppText variant="body" color={colors.muted}>No sessions yet. Pick one from Open jobs, or our team may assign you one and email you.</AppText>
        </Card>
      ) : null}
      {mine.map((job) => (
        <Card key={job.id}>
          <AppText variant="heading">{job.whenLabel}</AppText>
          <AppText variant="body">{`${job.serviceName} · ${job.formatName} · ${whoFor(job)}`}</AppText>
          <AppText variant="body" color={colors.muted}>{`${job.customerFirstName} · ${job.addressLabel}: ${job.addressLine}${job.pincode ? `, ${job.pincode}` : ''}`}</AppText>
          <AppText variant="caption" color={colors.muted}>{`Session ${job.sessionCode}`}</AppText>

          {job.canComplete ? (
            <View style={{ marginTop: 10 }}>
              <Button label="Session done" small loading={busy === job.id} onPress={() => confirmDone(job.id)} />
            </View>
          ) : null}

          {job.canCancel ? (
            cancelling === job.id ? (
              <View style={{ marginTop: 10, gap: 10 }}>
                <TextField label="Why can you not make it?" placeholder="For example: unwell, family emergency" value={reason} onChangeText={setReason} maxLength={300} />
                <AppText variant="caption" color={colors.muted}>The customer and our team are told, and the session goes back to open for other trainers. You cannot pick this session up again.</AppText>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}><Button label="Keep it" small variant="soft" disabled={busy === job.id} onPress={() => { setCancelling(null); setReason(''); }} /></View>
                  <View style={{ flex: 1.4 }}><Button label="Cancel this session" small variant="danger" loading={busy === job.id} disabled={reason.trim().length < 3} onPress={() => void run(job.id, () => cancelJob(job.id, reason.trim()), 'Cancelled. The session is open again for other trainers.')} /></View>
                </View>
              </View>
            ) : (
              <View style={{ marginTop: 10 }}>
                <Button label="I cannot make it" small variant="ghost" onPress={() => { setCancelling(job.id); setReason(''); setError(null); }} />
              </View>
            )
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
