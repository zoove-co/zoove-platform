import { useQueryClient } from '@tanstack/react-query';
import { Redirect, router, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { JobAlertPopup } from '@/features/jobs/JobAlertPopup';
import { useNewJobAlert } from '@/features/jobs/useNewJobAlert';
import { useTimeUpAlert } from '@/features/jobs/useTimeUpAlert';
import { onJobPushReceived, onNotificationTapped, registerForPush } from '@/lib/push';
import { destinationFor, useApplication } from '@/lib/useApplication';
import { JOBS_KEY, useJobs } from '@/lib/useJobs';
import { colors, fonts } from '@/theme';

// The approved trainer's app: open jobs, their own sessions, their earnings, and their profile.
export default function TabsLayout() {
  const application = useApplication();
  const jobs = useJobs();
  const queryClient = useQueryClient();
  const approved = application.data ? destinationFor(application.data) === 'jobs' : false;
  const accepting = jobs.data?.acceptingJobs ?? true;
  const alert = useNewJobAlert(jobs.data?.open, approved && accepting);
  const { quietFor } = alert;
  const timeUp = useTimeUpAlert(jobs.data?.mine);

  // An approved trainer's phone is registered for job alerts; tapping one opens the job list.
  useEffect(() => {
    if (approved) void registerForPush();
  }, [approved]);
  useEffect(() => onNotificationTapped(() => { quietFor(8_000); router.navigate('/jobs'); }), [quietFor]);
  // A job request push while the app is open: check the list at once, so the pop-up shows without waiting for the next refresh.
  useEffect(() => onJobPushReceived(() => void queryClient.invalidateQueries({ queryKey: JOBS_KEY })), [queryClient]);

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
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: 'transparent', height: 66, paddingTop: 6, paddingBottom: 8, borderTopLeftRadius: 22, borderTopRightRadius: 22, shadowColor: '#2A0F8F', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen name="today" options={{ title: 'Today', tabBarIcon: ({ color, size }) => <Icon name="home-outline" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="jobs" options={{ title: 'Open jobs', ...(openCount > 0 ? { tabBarBadge: openCount } : {}), tabBarIcon: ({ color, size }) => <Icon name="flash-outline" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="sessions" options={{ title: 'My sessions', tabBarIcon: ({ color, size }) => <Icon name="calendar-outline" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="insights" options={{ title: 'Earnings', tabBarIcon: ({ color, size }) => <Icon name="stats-chart-outline" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Icon name="person-outline" color={String(color)} size={size} /> }} />
    </Tabs>
    <JobAlertPopup job={alert.fresh} onView={() => { alert.dismiss(); router.navigate('/jobs'); }} onLater={alert.dismiss} />
    {timeUp.over ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Session time is over. Tap to open my sessions."
        onPress={() => { timeUp.dismiss(); router.navigate('/sessions'); }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 48, paddingBottom: 16, paddingHorizontal: 18, backgroundColor: colors.ink }}>
        <AppText variant="heading" color={colors.white}>Session time is over</AppText>
        <AppText variant="body" color={colors.white}>{`${timeUp.over.serviceName} · ${timeUp.over.customerFirstName}`}</AppText>
        <AppText variant="caption" color={colors.white}>Tap to enter the finish code from the customer.</AppText>
      </Pressable>
    ) : null}
    </View>
  );
}
