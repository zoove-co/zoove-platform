import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { Screen } from '@/components/ui/Screen';
import { ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { destinationFor, useApplication } from '@/lib/useApplication';
import { colors } from '@/theme';

// The front door. It sends a trainer where their application says they belong: still filling it in, waiting for review, or approved.
export default function Index() {
  const status = useAuth((state) => state.status);
  const signOut = useAuth((state) => state.signOut);
  if (status !== 'signedIn') return <Redirect href="/sign-in" />;
  return <Gate onSignOut={() => void signOut()} />;
}

function Gate({ onSignOut }: { onSignOut: () => void }) {
  const application = useApplication();
  if (application.data) {
    const to = destinationFor(application.data);
    return <Redirect href={to === 'apply' ? '/apply' : to === 'status' ? '/status' : '/jobs'} />;
  }
  if (application.isError) {
    const forbidden = application.error instanceof ApiError && application.error.status === 403;
    return (
      <Screen>
        <Banner tone="bad">{forbidden ? 'This account cannot apply as a trainer. Sign in with the email you applied with.' : errorMessage(application.error)}</Banner>
        {forbidden ? null : <Button label="Try again" onPress={() => void application.refetch()} />}
        <Button label="Sign out" variant="soft" onPress={onSignOut} />
      </Screen>
    );
  }
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.purple} />
    </View>
  );
}
