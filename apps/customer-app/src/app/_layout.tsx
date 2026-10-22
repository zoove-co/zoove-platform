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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { track } from '@/lib/analytics/track';
import { useAuth } from '@/lib/auth/useAuth';
import { colors } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
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

  useEffect(() => {
    void hydrateAuth();
  }, [hydrateAuth]);

  const ready = (fontsLoaded || Boolean(fontError)) && authStatus !== 'loading';

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync();
    }
  }, [ready]);

  useEffect(() => {
    track('app_opened');
  }, []);

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
          <Stack.Screen name="policies" />
          <Stack.Screen name="referral" />
          <Stack.Screen name="addresses" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="soon" />
        </Stack.Protected>
      </Stack>
    </QueryClientProvider>
  );
}
