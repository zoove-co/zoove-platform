import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/lib/auth';
import { SUPPORT_EMAIL } from '@/lib/support';
import { APPLICATION_KEY, useApplication } from '@/lib/useApplication';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FALLBACK_SERVICES } from '@/lib/application';
import { cancelContactRequest, createContactRequest, deleteAccount, errorMessage, listContactRequests, listServices, type ContactKind, type ContactRequest } from '@/lib/api';
import { colors } from '@/theme';


const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Email is how the trainer signs in and both were checked at approval, so a change is a request: Zoove verifies it with the trainer
// (usually a call) and approves it in the admin app. Nothing changes before that.
function ContactChange({ onApproved }: { onApproved: () => void }) {
  const queryClient = useQueryClient();
  const requests = useQuery({ queryKey: ['contact-requests'], queryFn: listContactRequests, refetchInterval: 20_000 });
  const [kind, setKind] = useState<ContactKind | null>(null);
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = requests.data ?? [];
  const pending = (k: ContactKind) => list.find((r) => r.kind === k && r.status === 'pending');
  const label = (k: ContactKind) => (k === 'email' ? 'email' : 'mobile number');
  const show = (data: ContactRequest[]) => queryClient.setQueryData(['contact-requests'], data);

  // When Zoove approves a request, the details above change: reload them once.
  const approvedCount = list.filter((r) => r.status === 'approved').length;
  const seenApproved = useRef<number | null>(null);
  const loaded = requests.data !== undefined;
  useEffect(() => {
    if (!loaded) return;
    if (seenApproved.current === null) {
      seenApproved.current = approvedCount;
      return;
    }
    if (approvedCount > seenApproved.current) {
      seenApproved.current = approvedCount;
      onApproved();
    }
  }, [loaded, approvedCount, onApproved]);

  const clean = kind === 'phone' ? value.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '') : value.trim();
  const valid = kind === 'phone' ? /^[6-9]\d{9}$/.test(clean) : EMAIL_PATTERN.test(clean);
  async function submit() {
    if (!kind || !valid) return;
    setBusy(true);
    setError(null);
    try {
      show(await createContactRequest(kind, kind === 'phone' ? `+91${clean}` : clean, reason));
      setKind(null);
      setValue('');
      setReason('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function withdraw(id: string) {
    setBusy(true);
    try {
      show(await cancelContactRequest(id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <AppText variant="heading">Change email or mobile</AppText>
      <AppText variant="caption" color={colors.muted}>Your email is how you sign in, so Zoove checks with you first (we may call you). Nothing changes until we approve it.</AppText>
      {list.map((r) => (
        <View key={r.id} style={{ marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: r.status === 'rejected' ? '#FDE4E1' : r.status === 'approved' ? '#DDF4E6' : colors.lavender }}>
          <AppText variant="bodyStrong">{`${r.kind === 'email' ? 'Email' : 'Mobile'} → ${r.newValue}`}</AppText>
          <AppText variant="caption" color={colors.muted}>
            {r.status === 'pending' ? 'Waiting for Zoove to verify it.' : r.status === 'approved' ? 'Approved. Your details are updated.' : `Not changed.${r.decisionNote ? ` ${r.decisionNote}` : ''}`}
          </AppText>
          {r.status === 'pending' ? <View style={{ marginTop: 6 }}><Button label="Withdraw request" small variant="soft" disabled={busy} onPress={() => void withdraw(r.id)} /></View> : null}
        </View>
      ))}
      {kind ? (
        <View style={{ marginTop: 10, gap: 8 }}>
          <TextField
            label={kind === 'email' ? 'New email' : 'New mobile number'}
            value={value}
            onChangeText={setValue}
            {...(kind === 'phone' ? { prefix: '+91', keyboardType: 'phone-pad' as const, maxLength: 10 } : { keyboardType: 'email-address' as const, autoCapitalize: 'none' as const, autoCorrect: false })}
            error={value.length > 0 && !valid ? (kind === 'phone' ? 'Enter a 10-digit Indian mobile number' : 'Enter a valid email') : undefined}
          />
          <TextField label="Why are you changing it? (optional)" value={reason} onChangeText={setReason} maxLength={300} />
          {error ? <Banner tone="bad">{error}</Banner> : null}
          <Button label="Send request to Zoove" loading={busy} disabled={!valid} onPress={() => void submit()} />
          <Button label="Cancel" variant="ghost" disabled={busy} onPress={() => { setKind(null); setError(null); }} />
        </View>
      ) : (
        <View style={{ marginTop: 10, gap: 8 }}>
          {(['email', 'phone'] as const).map((k) => (
            <Button key={k} label={pending(k) ? `Change ${label(k)} (request sent)` : `Change my ${label(k)}`} variant="soft" disabled={Boolean(pending(k))} onPress={() => { setKind(k); setError(null); }} />
          ))}
        </View>
      )}
    </Card>
  );
}

// The profile the team approved. Changing it goes through the team, because it was checked against the documents.
export default function Profile() {
  const application = useApplication();
  const queryClient = useQueryClient();
  const refreshApplication = useCallback(() => void queryClient.invalidateQueries({ queryKey: APPLICATION_KEY }), [queryClient]);
  const signOut = useAuth((state) => state.signOut);
  const services = useQuery({ queryKey: ['services'], queryFn: listServices, staleTime: 10 * 60_000 });
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const f = application.data?.form;
  const removeAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      await signOut();
    } catch (error) {
      setDeleteError(errorMessage(error));
      setDeleting(false);
    }
  };
  const serviceName = (slug: string) => (services.data ?? FALLBACK_SERVICES).find((item) => item.slug === slug)?.name ?? slug;
  const rows: [string, string][] = f
    ? [
        ['Name', [f.firstName, f.lastName].filter(Boolean).join(' ') || '—'],
        ['Email', f.email ?? '—'],
        ['Mobile', f.phone ?? '—'],
        ['Trains', f.specialties.map(serviceName).join(', ') || '—'],
        ['Experience', f.experienceYears != null ? `${f.experienceYears} years` : '—'],
        ['Languages', f.languages.join(', ') || '—'],
        ['Area', [f.addressArea, f.addressCity].filter(Boolean).join(', ') || '—'],
      ]
    : [];
  return (
    <Screen refreshing={application.isRefetching} onRefresh={() => void application.refetch()}>
      <AppText variant="screenTitle">Profile</AppText>
      <Card>
        {rows.map(([label, value]) => (
          <View key={label} style={{ flexDirection: 'row', gap: 10, paddingVertical: 3 }}>
            <AppText variant="body" color={colors.muted} style={{ width: 90 }}>{label}</AppText>
            <AppText variant="body" style={{ flex: 1 }}>{value}</AppText>
          </View>
        ))}
        <AppText variant="caption" color={colors.muted} style={{ marginTop: 10 }}>To change your name, services or area, contact the Zoove team. Email and mobile you can ask to change below.</AppText>
      </Card>
      <ContactChange onApproved={refreshApplication} />
      <Button label={`Contact the team (${SUPPORT_EMAIL})`} variant="soft" onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Trainer help')}`).catch(() => undefined)} />
      <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
      {confirming ? (
        <Card>
          <AppText variant="heading">Delete your Zoove trainer account?</AppText>
          <AppText variant="body" color={colors.muted} style={{ marginTop: 6 }}>
            Your details, ID documents and private notes are removed and you are signed out everywhere. This cannot be undone. You must finish or cancel your upcoming sessions first.
          </AppText>
          {deleteError ? <View style={{ marginTop: 8 }}><Banner tone="bad">{deleteError}</Banner></View> : null}
          <View style={{ marginTop: 10, gap: 8 }}>
            <Button label="Yes, delete my account" variant="danger" loading={deleting} onPress={() => void removeAccount()} />
            <Button label="Keep my account" variant="ghost" disabled={deleting} onPress={() => { setConfirming(false); setDeleteError(null); }} />
          </View>
        </Card>
      ) : (
        <Button label="Delete my account" variant="ghost" onPress={() => setConfirming(true)} />
      )}
    </Screen>
  );
}
