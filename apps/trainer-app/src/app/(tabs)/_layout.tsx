import { Redirect, router, Tabs } from 'expo-router';
import { useEffect } from 'react';

import { Icon } from '@/components/ui/Icon';
import { onNotificationTapped, registerForPush } from '@/lib/push';
import { destinationFor, useApplication } from '@/lib/useApplication';
import { useJobs } from '@/lib/useJobs';
import { colors, fonts } from '@/theme';

// The approved trainer's app: open jobs, their own sessions, and their profile.
export default function TabsLayout() {
  const application = useApplication();
  const jobs = useJobs();
  const approved = application.data ? destinationFor(application.data) === 'jobs' : false;

  // An approved trainer's phone is registered for job alerts; tapping one opens the job list.
  useEffect(() => {
    if (approved) void registerForPush();
  }, [approved]);
  useEffect(() => onNotificationTapped(() => router.navigate('/jobs')), []);

  // Paused or suspended since the last visit, or not approved at all: the front door decides.
  if (application.data && !approved) return <Redirect href="/" />;

  const openCount = jobs.data?.open.length ?? 0;
  return (
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
  );
}
