import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import type { ComplaintStatus, ComplaintSummary } from '@/lib/api';
import { formatAgo } from '@/lib/useComplaints';
import { colors, radius, spacing } from '@/theme';

export const statusLabel = (status: ComplaintStatus): string => (status === 'resolved' ? 'Resolved' : status === 'waiting_on_user' ? 'Zoove replied' : 'We are looking into it');

export function ComplaintRow({ item, onPress }: { item: ComplaintSummary; onPress: () => void }) {
  const who = item.lastMessage?.from === 'team' ? 'Zoove support: ' : item.lastMessage?.from === 'you' ? 'You: ' : '';
  const preview = item.lastMessage ? `${who}${item.lastMessage.body}` : item.subject;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <View style={styles.icon}>
        <Icon name={item.status === 'resolved' ? 'checkmark-circle-outline' : 'chatbubbles-outline'} size={18} color={item.status === 'resolved' ? colors.success : colors.purple} />
      </View>
      <View style={styles.body}>
        <View style={styles.top}>
          <AppText variant="bodyStrong" style={styles.title} numberOfLines={1}>{item.categoryLabel}</AppText>
          {item.unread ? <View accessibilityLabel="Unread reply" style={styles.dot} /> : null}
        </View>
        {item.session ? <AppText variant="caption" color={colors.muted} numberOfLines={1}>{`${item.session.serviceName} · ${item.session.code}`}</AppText> : null}
        <AppText variant="caption" color={colors.muted} numberOfLines={2}>{preview}</AppText>
        <View style={styles.meta}>
          <AppText variant="micro" color={item.status === 'waiting_on_user' ? colors.purple : colors.muted}>{statusLabel(item.status)}</AppText>
          <AppText variant="micro" color={colors.muted}>{`· ${item.code} · ${formatAgo(item.lastMessage?.at ?? item.createdAt)}`}</AppText>
        </View>
      </View>
      <Icon name="chevron-forward" size={14} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 0.8, borderColor: colors.line },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.lavender, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flexShrink: 1 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.magenta },
  meta: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', marginTop: 2 },
});
