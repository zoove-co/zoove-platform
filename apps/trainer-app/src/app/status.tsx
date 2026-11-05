import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { Wordmark } from '@/components/ui/Wordmark';
import { errorMessage, type ApplicationView } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { destinationFor, useApplication } from '@/lib/useApplication';
import { SUPPORT_EMAIL } from '@/lib/support';
import { colors } from '@/theme';

type Tone = 'wait' | 'hold' | 'no';
const TONES: Record<Tone, { icon: IconName; color: string; background: string }> = {
  wait: { icon: 'time-outline', color: colors.purple, background: colors.lavender },
  hold: { icon: 'pause', color: '#8A5A00', background: '#FFF4D6' },
  no: { icon: 'close', color: colors.danger, background: '#FDE4E1' },
};

function Hero({ tone, title, text }: { tone: Tone; title: string; text: string }) {
  const style = TONES[tone];
  return (
    <View style={{ alignItems: 'center', gap: 12, paddingVertical: 12 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: style.background }}>
        <Icon name={style.icon} size={34} color={style.color} />
      </View>
      <AppText variant="screenTitle" style={{ textAlign: 'center' }}>{title}</AppText>
      <AppText variant="body" color={colors.muted} style={{ textAlign: 'center' }}>{text}</AppText>
    </View>
  );
}

function body(view: ApplicationView, name: string): { tone: Tone; title: string; text: string; note?: string } {
  if (view.status === 'rejected') return { tone: 'no', title: 'We cannot take this forward', text: `Thank you for applying, ${name}. We are not able to onboard you right now.`, ...(view.reviewNote ? { note: view.reviewNote } : {}) };
  if (view.status === 'approved') {
    const held = view.trainerStatus;
    const title = held === 'paused' ? 'Your account is paused' : held === 'suspended' ? 'Your account is suspended' : 'Your trainer account is no longer active';
    return { tone: 'hold', title, text: `Hi ${name}, please contact the Zoove team to find out more.` };
  }
  return { tone: 'wait', title: 'Application received', text: `Thanks, ${name}. The Zoove team is reviewing your details and documents. We will email you at ${view.form.email ?? 'your email'} as soon as there is an update.` };
}

// Shown while the team reviews the application, after a rejection, or when an approved account is paused or suspended.
// It uses the same wording and the same status as the Join Zoove page, because both read the same application.
export default function Status() {
  const application = useApplication({ refetchEverySeconds: 60 });
  const signOut = useAuth((state) => state.signOut);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      await application.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  const view = application.data;
  if (!view) {
    return application.isError ? (
      <Screen>
        <Banner tone="bad">{errorMessage(application.error)}</Banner>
        <Button label="Try again" onPress={() => void application.refetch()} />
        <Button label="Sign out" variant="soft" onPress={() => void signOut()} />
      </Screen>
    ) : (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.purple} />
      </View>
    );
  }
  // The team approved the application, or asked for changes: the front door sends the trainer to the right place.
  if (destinationFor(view) !== 'status') return <Redirect href="/" />;

  const name = view.form.firstName ?? 'there';
  const shown = body(view, name);
  const waiting = shown.tone === 'wait';
  return (
    <Screen refreshing={refreshing} onRefresh={() => void refresh()}>
      <Wordmark width={120} />
      <Hero tone={shown.tone} title={shown.title} text={shown.text} />
      {shown.note ? (
        <Card soft>
          <AppText variant="bodyStrong">Reason</AppText>
          <AppText variant="body">{shown.note}</AppText>
        </Card>
      ) : null}
      {waiting ? (
        <Card soft>
          <AppText variant="bodyStrong">{view.status === 'in_review' ? 'Under review' : 'Waiting for review'}</AppText>
          <AppText variant="body" color={colors.muted}>You do not need to do anything else. You can close the app and come back any time with the same email. Pull down to check for news.</AppText>
        </Card>
      ) : (
        <Card soft>
          <AppText variant="body" color={colors.muted}>{`Write to ${SUPPORT_EMAIL} and the Zoove team will help.`}</AppText>
        </Card>
      )}
      <Button label="Sign out" variant="soft" onPress={() => void signOut()} />
    </Screen>
  );
}
