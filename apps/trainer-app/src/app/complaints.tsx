import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { ComplaintRow } from '@/features/complaints/ComplaintRow';
import { errorMessage } from '@/lib/api';
import { useComplaints } from '@/lib/useComplaints';
import { colors } from '@/theme';

// Everything this trainer has told Zoove: open conversations first, then resolved ones.
export default function Complaints() {
  const complaints = useComplaints(true);
  const data = complaints.data;
  const open = (id: string) => router.push({ pathname: '/complaint/[id]', params: { id } });
  return (
    <Screen refreshing={complaints.isRefetching} onRefresh={() => void complaints.refetch()}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} hitSlop={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Icon name="chevron-back" size={18} color={colors.purple} />
        <AppText variant="bodyStrong" color={colors.purple}>Back</AppText>
      </Pressable>
      <AppText variant="screenTitle">Complaints</AppText>
      <Button label="Report a problem" onPress={() => router.push('/complaint/new')} />
      {complaints.isError && !data ? <Banner tone="bad">{errorMessage(complaints.error)}</Banner> : null}
      {data && data.active.length === 0 && data.past.length === 0 ? (
        <Card soft>
          <AppText variant="heading">No complaints</AppText>
          <AppText variant="body" color={colors.muted}>If something goes wrong with a session, a payout or the app, tell us and we will sort it out here.</AppText>
        </Card>
      ) : null}
      {data && data.active.length > 0 ? <AppText variant="bodyStrong">Open conversations</AppText> : null}
      {data?.active.map((item) => <ComplaintRow key={item.id} item={item} onPress={() => open(item.id)} />)}
      {data && data.past.length > 0 ? <View style={{ marginTop: 8 }}><AppText variant="bodyStrong">Resolved</AppText></View> : null}
      {data?.past.map((item) => <ComplaintRow key={item.id} item={item} onPress={() => open(item.id)} />)}
    </Screen>
  );
}
