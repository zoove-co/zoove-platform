import '@/lib/i18n';

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Kalam_700Bold } from '@expo-google-fonts/kalam';
import Ionicons from '@expo/vector-icons/Ionicons';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { OutageOverlay } from '@/components/OutageOverlay';
import { RestDay } from '@/components/ui/RestDay';
import { track } from '@/lib/analytics/track';
import { useAuth } from '@/lib/auth/useAuth';
import { initMonitoring, reportError, withMonitoring } from '@/lib/monitoring';
import { useOutage } from '@/lib/outage';
import { bookingIdFrom, complaintIdFrom, onNotificationReceived, onNotificationTapped, registerForPush } from '@/lib/push';
import { colors } from '@/theme';

initMonitoring();
void SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Kalam_700Bold,
    ...Ionicons.font,
  });
  const authStatus = useAuth((state) => state.status);
  const hydrateAuth = useAuth((state) => state.hydrate);
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );

  // Coming back to the app from the background refreshes whatever is on screen.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => focusManager.setFocused(status === 'active'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    void hydrateAuth();
  }, [hydrateAuth]);

  // Signing out (or the server ending the session) must not leave one customer's data in memory for the next.
  useEffect(() => {
    if (authStatus === 'signedOut') queryClient.clear();
  }, [authStatus, queryClient]);

  // When Zoove becomes reachable again, whatever failed in the meantime loads again.
  const down = useOutage((state) => state.down);
  const wasDown = useRef(false);
  useEffect(() => {
    if (wasDown.current && !down) void queryClient.invalidateQueries();
    wasDown.current = down;
  }, [down, queryClient]);

  const ready = (fontsLoaded || Boolean(fontError)) && authStatus !== 'loading';

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync();
    }
  }, [ready]);

  useEffect(() => {
    track('app_opened');
  }, []);

  // A signed-in customer's phone is registered for push messages; tapping one opens the session it is about.
  useEffect(() => {
    if (authStatus === 'signedIn') void registerForPush();
  }, [authStatus]);
  useEffect(() => {
    const subscription = onNotificationTapped((response) => {
      const complaintId = complaintIdFrom(response);
      if (complaintId) {
        router.push({ pathname: '/complaint/[id]', params: { id: complaintId } });
        return;
      }
      const id = bookingIdFrom(response);
      if (id) router.push({ pathname: '/session/[id]', params: { id } });
    });
    return () => subscription.remove();
  }, []);
  // A reply from the team that arrives while the app is open shows up in the conversation straight away.
  useEffect(() => {
    const subscription = onNotificationReceived((notification) => {
      const complaintId = (notification.request.content.data as { complaintId?: unknown } | undefined)?.complaintId;
      if (typeof complaintId !== 'string') return;
      void queryClient.invalidateQueries({ queryKey: ['complaint', complaintId] });
      void queryClient.invalidateQueries({ queryKey: ['complaints'] });
    });
    return () => subscription.remove();
  }, [queryClient]);

  if (!ready) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="otp" />
        {/* Everything below needs a signed-in customer; signed-out visitors are sent back to '/'. */}
        <Stack.Protected guard={authStatus === 'signedIn'}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="booking" />
          <Stack.Screen name="service/[slug]" />
          <Stack.Screen name="session/[id]/index" />
          <Stack.Screen name="session/[id]/reschedule" />
          <Stack.Screen name="orders" />
          <Stack.Screen name="packages" />
          <Stack.Screen name="party" />
          <Stack.Screen name="academy" />
          <Stack.Screen name="help" />
          <Stack.Screen name="complaints" />
          <Stack.Screen name="complaint/new" />
          <Stack.Screen name="complaint/[id]" />
          <Stack.Screen name="policies" />
          <Stack.Screen name="referral" />
          <Stack.Screen name="progress" />
          <Stack.Screen name="addresses" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="soon" />
        </Stack.Protected>
      </Stack>
      <OutageOverlay />
    </QueryClientProvider>
  );
}

// A screen that breaks shows this instead of a blank page. "Try again" renders it afresh.
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  useEffect(() => {
    reportError(error, 'screen');
  }, [error]);
  return <RestDay kind="crash" onRetry={() => void retry()} />;
}

export default withMonitoring(RootLayout);
