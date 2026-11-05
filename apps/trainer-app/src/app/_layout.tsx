import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/lib/auth';
import { colors } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, ...Ionicons.font });
  const authStatus = useAuth((state) => state.status);
  const hydrate = useAuth((state) => state.hydrate);
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } }));

  // Coming back to the app from the background refreshes whatever is on screen (a new status, a new job).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => focusManager.setFocused(status === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  // Signing out must not leave one trainer's data in memory for the next person on this phone.
  useEffect(() => {
    if (authStatus === 'signedOut') queryClient.clear();
  }, [authStatus, queryClient]);

  const ready = (fontsLoaded || Boolean(fontError)) && authStatus !== 'loading';
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="sign-in" />
        {/* Everything below needs a signed-in trainer; signed-out visitors are sent back to '/'. */}
        <Stack.Protected guard={authStatus === 'signedIn'}>
          <Stack.Screen name="apply" />
          <Stack.Screen name="status" />
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
      </Stack>
    </QueryClientProvider>
  );
}
