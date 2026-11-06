import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { cancelJob, checkInJob, checkOutJob, errorMessage, type JobBoard } from '@/lib/api';
import { SessionNote } from '@/features/jobs/SessionNote';
import { useJobs, useSetBoard, whoFor } from '@/lib/useJobs';
import { colors } from '@/theme';

// The sessions this trainer holds: address after accepting, then the customer's start code on arrival (the session goes live)
// and the customer's finish code after the training (the session is done), and "I cannot make it".
export default function Sessions() {
  const jobs = useJobs();
  const setBoard = useSetBoard();
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [codes, setCodes] = useState<Record<string, string>>({});

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

  const setCode = (id: string, value: string) => setCodes((all) => ({ ...all, [id]: value.replace(/\D/g, '').slice(0, 4) }));

  const mine = jobs.data?.mine ?? [];
  const done = jobs.data?.done ?? [];
  return (
    <Screen refreshing={jobs.isRefetching} onRefresh={() => void jobs.refetch()}>
      <AppText variant="screenTitle">My sessions</AppText>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="Upcoming" selected={!showDone} onPress={() => setShowDone(false)} />
        <Chip label={`Completed${jobs.data?.doneCount ? ` (${jobs.data.doneCount})` : ''}`} selected={showDone} onPress={() => setShowDone(true)} />
      </View>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {note && !error ? <Banner tone="good">{note}</Banner> : null}
      {jobs.isError && !jobs.data ? <Banner tone="bad">{errorMessage(jobs.error)}</Banner> : null}
      {!showDone && jobs.data && mine.length === 0 ? (
        <Card soft>
          <AppText variant="body" color={colors.muted}>No sessions yet. Pick one from Open jobs, or our team may assign you one and email you.</AppText>
        </Card>
      ) : null}
      {showDone && jobs.data && done.length === 0 ? (
        <Card soft><AppText variant="body" color={colors.muted}>Sessions you finish will appear here.</AppText></Card>
      ) : null}
      {showDone ? done.map((job) => (
        <Card key={job.id}>
          <AppText variant="heading">{job.whenLabel}</AppText>
          <AppText variant="body">{`${job.serviceName} · ${job.formatName} · ${whoFor(job)}`}</AppText>
          <AppText variant="caption" color={colors.muted}>{`${job.customerFirstName} · Session ${job.sessionCode}`}</AppText>
          <SessionNote id={job.id} note={job.note} />
        </Card>
      )) : mine.map((job) => (
        <Card key={job.id}>
          <AppText variant="heading">{job.whenLabel}</AppText>
          <AppText variant="body">{`${job.serviceName} · ${job.formatName} · ${whoFor(job)}`}</AppText>
          <AppText variant="body" color={colors.muted}>{`${job.customerFirstName} · ${job.addressLabel}: ${job.addressLine}${job.pincode ? `, ${job.pincode}` : ''}`}</AppText>
          <AppText variant="caption" color={colors.muted}>{`Session ${job.sessionCode}`}</AppText>

          <SessionNote id={job.id} note={job.note} />

          {job.started ? (
            <View style={{ marginTop: 10, gap: 10 }}>
              <Banner tone="good">This session is live.</Banner>
              <TextField label="Finish code" placeholder="4 digits" keyboardType="number-pad" maxLength={4} value={codes[job.id] ?? ''} onChangeText={(v) => setCode(job.id, v)} hint="After the training, ask the customer for the finish code in their app." />
              <Button label="Finish session" small loading={busy === job.id} disabled={(codes[job.id] ?? '').length !== 4} onPress={() => void run(job.id, () => checkOutJob(job.id, codes[job.id] ?? ''), 'Thank you. The session is done.')} />
            </View>
          ) : job.canCheckIn ? (
            <View style={{ marginTop: 10, gap: 10 }}>
              <TextField label="Start code" placeholder="4 digits" keyboardType="number-pad" maxLength={4} value={codes[job.id] ?? ''} onChangeText={(v) => setCode(job.id, v)} hint="When you arrive, ask the customer for the start code in their app." />
              <Button label="Start session" small loading={busy === job.id} disabled={(codes[job.id] ?? '').length !== 4} onPress={() => void run(job.id, () => checkInJob(job.id, codes[job.id] ?? ''), 'The session is live.')} />
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
