import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { errorMessage } from '@/lib/api';
import { destinationFor, useApplication } from '@/lib/useApplication';
import { colors } from '@/theme';
import { Wizard } from '@/features/application/Wizard';
import { FitnessLoader } from '@/components/ui/FitnessLoader';

// The application. Only a trainer who is still filling it in (or was asked for changes) belongs here.
export default function Apply() {
  const application = useApplication();
  if (application.data) {
    if (destinationFor(application.data) !== 'apply') return <Redirect href="/" />;
    return <Wizard initial={application.data} />;
  }
  if (application.isError) {
    return (
      <Screen>
        <Banner tone="bad">{errorMessage(application.error)}</Banner>
        <Button label="Try again" onPress={() => void application.refetch()} />
      </Screen>
    );
  }
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <FitnessLoader fill={false} />
    </View>
  );
}
