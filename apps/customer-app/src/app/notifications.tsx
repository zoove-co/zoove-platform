import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TabFooter } from '@/components/ui/TabFooter';
import { useMarkNotificationsRead, useNotifications } from '@/features/account/hooks';
import { formatAgo } from '@/lib/dates';
import { colors, radius, spacing } from '@/theme';

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, isPending, isError, refetch } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const hasUnread = data?.some((item) => !item.read) ?? false;

  // Opening the screen counts as reading: clear the badge after a moment, so the unread dots stay
  // visible for this visit.
  const { mutate: markAllRead } = markRead;
  useEffect(() => {
    if (!hasUnread) return undefined;
    const timer = setTimeout(() => markAllRead(), 1500);
    return () => clearTimeout(timer);
  }, [hasUnread, markAllRead]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title={t('notifications.title')} />
      {isPending ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.purple} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <AppText variant="heading">{t('notifications.loadError')}</AppText>
          <PrimaryButton label={t('notifications.retry')} variant="soft" onPress={() => void refetch()} />
        </View>
      ) : data.length === 0 ? (
        <View style={styles.center}>
          <AppText variant="heading" style={styles.centerText}>
            {t('notifications.emptyTitle')}
          </AppText>
          <AppText color={colors.muted} style={styles.centerText}>
            {t('notifications.emptyBody')}
          </AppText>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {data.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              disabled={!item.bookingId}
              onPress={() =>
                item.bookingId
                  ? router.push({ pathname: '/session/[id]', params: { id: item.bookingId } })
                  : undefined
              }
              style={styles.row}>
              <View style={styles.badge}>
                <Icon name="notifications-outline" size={18} color={colors.purple} />
              </View>
              <View style={styles.text}>
                <AppText variant="bodyStrong">{item.title}</AppText>
                <AppText variant="caption" color={colors.muted}>
                  {item.body}
                </AppText>
                <AppText variant="micro" color={colors.muted}>
                  {formatAgo(item.createdAt)}
                </AppText>
              </View>
              {!item.read ? <View style={styles.dot} /> : null}
            </Pressable>
          ))}
        </ScrollView>
      )}
      <TabFooter />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xxl },
  centerText: { textAlign: 'center' },
  content: { padding: 18, gap: 10, paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 3 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.magenta },
});
