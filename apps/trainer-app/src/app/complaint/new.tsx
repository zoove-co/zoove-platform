import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { complaintErrorMessage, errorMessage } from '@/lib/api';
import { formatWhen, useComplaintCategories, useComplaintSessions, useCreateComplaint } from '@/lib/useComplaints';
import { colors, radius, spacing } from '@/theme';

const MIN_LENGTH = 5;

function Choice({ selected, title, hint, onPress }: { selected: boolean; title: string; hint?: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: selected ? colors.lavender : colors.white, borderWidth: 0.8, borderColor: selected ? colors.purple : colors.line }}>
      <Icon name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.purple : colors.muted} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong">{title}</AppText>
        {hint ? <AppText variant="caption" color={colors.muted}>{hint}</AppText> : null}
      </View>
    </Pressable>
  );
}

// Raise a complaint. Opened from the Profile tab (about anything) or from a session (that session is already chosen).
export default function NewComplaint() {
  const params = useLocalSearchParams<{ bookingId?: string }>();
  const categories = useComplaintCategories();
  const sessions = useComplaintSessions();
  const create = useCreateComplaint();
  const [category, setCategory] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(typeof params.bookingId === 'string' ? params.bookingId : null);
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState(false);
  // One key per complaint: pressing send twice, or retrying after a dropped connection, is the same complaint.
  const requestKey = useRef<string | null>(null);

  const chosen = categories.data?.find((c) => c.key === category);
  const needsSession = chosen?.needsSession === true;
  const text = message.trim();
  const tooShort = text.length < MIN_LENGTH;
  const canSend = Boolean(chosen) && (!needsSession || bookingId !== null) && !tooShort && !create.isPending;

  const submit = () => {
    setTouched(true);
    if (!chosen || !canSend) return;
    create.mutate(
      { category: chosen.key, ...(bookingId ? { bookingId } : {}), message: text, idempotencyKey: (requestKey.current ??= `complaint-${Date.now()}-${Math.random().toString(36).slice(2)}`) },
      { onSuccess: (detail) => router.replace({ pathname: '/complaint/[id]', params: { id: detail.id } }) },
    );
  };

  return (
    <Screen
      footer={chosen ? <View style={{ flex: 1 }}><Button label="Send to Zoove" loading={create.isPending} disabled={touched && !canSend} onPress={submit} /></View> : undefined}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} hitSlop={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Icon name="chevron-back" size={18} color={colors.purple} />
        <AppText variant="bodyStrong" color={colors.purple}>Back</AppText>
      </Pressable>
      <AppText variant="screenTitle">Report a problem</AppText>
      {categories.isError ? <Banner tone="bad">{errorMessage(categories.error)}</Banner> : null}
      <AppText variant="heading">What is this about?</AppText>
      {(categories.data ?? []).map((c) => (
        <Choice key={c.key} selected={category === c.key} title={c.label} hint={c.hint} onPress={() => setCategory(c.key)} />
      ))}

      {chosen && (needsSession || (sessions.data?.length ?? 0) > 0) ? (
        <>
          <AppText variant="heading">{needsSession ? 'Which session?' : 'Which session? (optional)'}</AppText>
          {!needsSession ? <Choice selected={bookingId === null} title="Not about a session" onPress={() => setBookingId(null)} /> : null}
          {(sessions.data ?? []).map((s) => (
            <Choice key={s.id} selected={bookingId === s.id} title={`${s.serviceName} · ${s.code}`} {...(s.startsAt ? { hint: formatWhen(s.startsAt) } : {})} onPress={() => setBookingId(s.id)} />
          ))}
          {needsSession && !sessions.isPending && (sessions.data?.length ?? 0) === 0 ? <AppText variant="caption" color={colors.muted}>You have no recent sessions.</AppText> : null}
        </>
      ) : null}

      {chosen ? (
        <>
          <TextField
            label="Tell us what happened"
            value={message}
            onChangeText={setMessage}
            onBlur={() => setTouched(true)}
            placeholder="Write as much as you can. A person at Zoove will read it and reply here."
            multiline
            maxLength={2000}
            error={touched && tooShort ? 'Please tell us a little more (at least 5 characters).' : undefined}
          />
          {chosen.urgent ? <Banner tone="warn">If you are in danger right now, call the police on 112. We will treat this as urgent.</Banner> : null}
          {create.isError ? <Banner tone="bad">{complaintErrorMessage(create.error)}</Banner> : null}
        </>
      ) : null}
    </Screen>
  );
}
