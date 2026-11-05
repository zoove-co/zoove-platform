import { useState } from 'react';
import { Linking, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/lib/auth';
import { SUPPORT_EMAIL } from '@/lib/support';
import { useApplication } from '@/lib/useApplication';
import { useQuery } from '@tanstack/react-query';
import { FALLBACK_SERVICES } from '@/lib/application';
import { deleteAccount, errorMessage, listServices } from '@/lib/api';
import { colors } from '@/theme';

// The profile the team approved. Changing it goes through the team, because it was checked against the documents.
export default function Profile() {
  const application = useApplication();
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
        <AppText variant="caption" color={colors.muted} style={{ marginTop: 10 }}>To change any of these details, contact the Zoove team.</AppText>
      </Card>
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
