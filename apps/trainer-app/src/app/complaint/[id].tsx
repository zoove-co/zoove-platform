import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { statusLabel } from '@/features/complaints/ComplaintRow';
import { complaintErrorMessage } from '@/lib/api';
import { formatAgo, useComplaint, useReplyToComplaint } from '@/lib/useComplaints';
import { colors, fonts, radius, spacing } from '@/theme';

// One complaint, as a chat with the Zoove team. It checks for new messages every few seconds while it is open.
export default function ComplaintThread() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const thread = useComplaint(id);
  const reply = useReplyToComplaint(id);
  const [draft, setDraft] = useState('');
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const shown = useRef(0);
  const detail = thread.data;

  // Stay at the newest message when the thread opens or something arrives.
  const count = detail?.messages.length ?? 0;
  useEffect(() => {
    if (count !== shown.current) {
      shown.current = count;
      setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
    }
  }, [count]);

  const send = () => {
    const body = draft.trim();
    if (!body || reply.isPending) return;
    reply.mutate(body, { onSuccess: () => setDraft('') });
  };
  const sendOff = !draft.trim() || reply.isPending;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Icon name="chevron-back" size={18} color={colors.purple} />
          <AppText variant="bodyStrong" color={colors.purple}>Back</AppText>
        </Pressable>
        {detail ? (
          <View style={{ gap: 2 }}>
            <AppText variant="heading" numberOfLines={1}>{detail.categoryLabel}</AppText>
            <AppText variant="caption" color={colors.muted} numberOfLines={1}>{`Reference ${detail.code}${detail.session ? ` · ${detail.session.serviceName} ${detail.session.code}` : ''}`}</AppText>
            <AppText variant="micro" color={detail.status === 'resolved' ? colors.success : colors.purple}>{statusLabel(detail.status)}</AppText>
          </View>
        ) : null}
      </View>

      {thread.isPending ? (
        <View style={styles.center}><ActivityIndicator color={colors.purple} /></View>
      ) : !detail ? (
        <View style={styles.center}>
          <AppText variant="heading">We could not load this complaint.</AppText>
          <Button label="Try again" variant="soft" onPress={() => void thread.refetch()} />
        </View>
      ) : (
        <>
          <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {detail.messages.map((m) =>
              m.from === 'system' ? (
                <AppText key={m.id} variant="caption" color={colors.muted} style={styles.system}>{m.body}</AppText>
              ) : (
                <View key={m.id} style={[styles.bubble, m.from === 'you' ? styles.mine : styles.theirs]}>
                  {m.from === 'team' ? <AppText variant="micro" color={colors.purple}>Zoove support</AppText> : null}
                  <AppText color={m.from === 'you' ? colors.white : colors.ink}>{m.body}</AppText>
                  <AppText variant="micro" color={m.from === 'you' ? 'rgba(255,255,255,0.7)' : colors.muted}>{formatAgo(m.createdAt)}</AppText>
                </View>
              ),
            )}
          </ScrollView>

          <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            {detail.canReply ? (
              <>
                {detail.status === 'resolved' ? <AppText variant="caption" color={colors.muted}>This was marked resolved. If it is not sorted, write below and we will pick it up again.</AppText> : null}
                {reply.isError ? <AppText variant="caption" color={colors.danger}>{complaintErrorMessage(reply.error)}</AppText> : null}
                <View style={styles.inputRow}>
                  <TextInput
                    accessibilityLabel="Write a message"
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Write a message"
                    placeholderTextColor="rgba(8, 11, 15, 0.3)"
                    multiline
                    maxLength={2000}
                    style={styles.input}
                  />
                  <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={sendOff} onPress={send} style={[styles.send, sendOff && { opacity: 0.4 }]}>
                    <Icon name="send" size={18} color={colors.white} />
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <AppText variant="caption" color={colors.muted}>This complaint was closed. Please raise a new one if you still need help.</AppText>
                <Button label="Report a new problem" onPress={() => router.replace('/complaint/new')} />
              </>
            )}
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, gap: spacing.sm, borderBottomWidth: 0.8, borderBottomColor: colors.line },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  messages: { padding: spacing.xl, gap: spacing.md },
  system: { textAlign: 'center', paddingHorizontal: spacing.lg },
  bubble: { maxWidth: '84%', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg, gap: 3 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.purple, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.lavender, borderBottomLeftRadius: 4 },
  composer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm, borderTopWidth: 0.8, borderTopColor: colors.line, backgroundColor: colors.white },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: { flex: 1, maxHeight: 120, minHeight: 46, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, borderRadius: radius.lg, borderWidth: 0.8, borderColor: colors.line, fontFamily: fonts.medium, fontSize: 14, color: colors.ink, backgroundColor: colors.white },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
});
