import { Redirect, router, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { useNewJobAlert } from '@/features/jobs/useNewJobAlert';
import { onNotificationTapped, registerForPush } from '@/lib/push';
import { destinationFor, useApplication } from '@/lib/useApplication';
import { useJobs } from '@/lib/useJobs';
import { colors, fonts } from '@/theme';

// The approved trainer's app: open jobs, their own sessions, and their profile.
export default function TabsLayout() {
  const application = useApplication();
  const jobs = useJobs();
  const approved = application.data ? destinationFor(application.data) === 'jobs' : false;
  const accepting = jobs.data?.acceptingJobs ?? true;
  const alert = useNewJobAlert(jobs.data?.open, approved && accepting);

  // An approved trainer's phone is registered for job alerts; tapping one opens the job list.
  useEffect(() => {
    if (approved) void registerForPush();
  }, [approved]);
  useEffect(() => onNotificationTapped(() => router.navigate('/jobs')), []);

  // Paused or suspended since the last visit, or not approved at all: the front door decides.
  if (application.data && !approved) return <Redirect href="/" />;

  const openCount = jobs.data?.open.length ?? 0;
  return (
    <View style={{ flex: 1 }}>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.purple,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.line },
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen name="today" options={{ title: 'Today', tabBarIcon: ({ color, size }) => <Icon name="home-outline" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="jobs" options={{ title: 'Open jobs', ...(openCount > 0 ? { tabBarBadge: openCount } : {}), tabBarIcon: ({ color, size }) => <Icon name="flash-outline" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="sessions" options={{ title: 'My sessions', tabBarIcon: ({ color, size }) => <Icon name="calendar-outline" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Icon name="person-outline" color={String(color)} size={size} /> }} />
    </Tabs>
    {alert.fresh ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New job. Tap to view."
        onPress={() => { alert.dismiss(); router.navigate('/jobs'); }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 48, paddingBottom: 16, paddingHorizontal: 18, backgroundColor: colors.purple }}>
        <AppText variant="heading" color={colors.white}>New job just came in</AppText>
        <AppText variant="body" color={colors.white}>{`${alert.fresh.serviceName} · ${alert.fresh.whenLabel}${alert.fresh.area ? ` · ${alert.fresh.area}` : ''}`}</AppText>
        <AppText variant="caption" color={colors.white}>Tap to view and accept. First to accept gets it.</AppText>
      </Pressable>
    ) : null}
    </View>
  );
}
