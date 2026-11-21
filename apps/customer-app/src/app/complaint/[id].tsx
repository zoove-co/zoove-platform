import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { statusLabelKey } from '@/components/complaints/ComplaintRow';
import { AppText } from '@/components/ui/AppText';
import { FitnessLoader } from '@/components/ui/FitnessLoader';
import { Icon } from '@/components/ui/Icon';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useComplaint, useReplyToComplaint } from '@/features/complaints/hooks';
import { complaintErrorMessage } from '@/lib/complaintErrors';
import { formatAgo } from '@/lib/dates';
import { colors, fonts, radius, spacing } from '@/theme';

// One complaint, as a chat with the Zoove team. It checks for new messages every few seconds while it is open.
export default function ComplaintThreadScreen() {
  const { t } = useTranslation();
  const router = useRouter();
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

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader title={t('complaints.threadTitle')} />
      {thread.isPending ? (
        <View style={styles.center}><FitnessLoader fill={false} /></View>
      ) : !detail ? (
        <View style={styles.center}>
          <AppText variant="heading">{t('complaints.loadError')}</AppText>
          <PrimaryButton label={t('complaints.retry')} variant="soft" onPress={() => void thread.refetch()} />
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <View style={styles.summary}>
            <AppText variant="bodyStrong" numberOfLines={1}>{detail.categoryLabel}</AppText>
            <AppText variant="caption" color={colors.muted} numberOfLines={1}>
              {t('complaints.reference', { code: detail.code })}{detail.session ? ` · ${detail.session.serviceName} ${detail.session.code}` : ''}
            </AppText>
            <AppText variant="micro" color={detail.status === 'resolved' ? colors.success : colors.purple}>{t(statusLabelKey(detail.status))}</AppText>
          </View>
          <ScrollView ref={scroller} style={styles.flex} contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {detail.messages.map((m) =>
              m.from === 'system' ? (
                <AppText key={m.id} variant="caption" color={colors.muted} style={styles.system}>{m.body}</AppText>
              ) : (
                <View key={m.id} style={[styles.bubble, m.from === 'you' ? styles.mine : styles.theirs]}>
                  {m.from === 'team' ? <AppText variant="micro" color={colors.purple}>{t('complaints.team')}</AppText> : null}
                  <AppText color={m.from === 'you' ? colors.white : colors.ink}>{m.body}</AppText>
                  <AppText variant="micro" color={m.from === 'you' ? 'rgba(255,255,255,0.7)' : colors.muted}>{formatAgo(m.createdAt)}</AppText>
                </View>
              ),
            )}
          </ScrollView>

          {detail.canReply ? (
            <View style={styles.composer}>
              {detail.status === 'resolved' ? <AppText variant="caption" color={colors.muted}>{t('complaints.resolvedNote')}</AppText> : null}
              {reply.isError ? <AppText variant="caption" color={colors.danger}>{complaintErrorMessage(reply.error, t)}</AppText> : null}
              <View style={styles.inputRow}>
                <TextInput
                  accessibilityLabel={t('complaints.composerPlaceholder')}
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={t('complaints.composerPlaceholder')}
                  placeholderTextColor="rgba(8, 11, 15, 0.3)"
                  multiline
                  maxLength={2000}
                  style={styles.input}
                />
                <Pressable accessibilityRole="button" accessibilityLabel={t('complaints.send')} disabled={!draft.trim() || reply.isPending} onPress={send} style={[styles.send, (!draft.trim() || reply.isPending) && styles.sendOff]}>
                  <Icon name="send" size={18} color={colors.white} />
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.composer}>
              <AppText variant="caption" color={colors.muted}>{t('complaints.closedNote')}</AppText>
              <PrimaryButton label={t('complaints.raiseNew')} onPress={() => router.replace('/complaint/new')} />
            </View>
          )}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  summary: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: 2, borderBottomWidth: 0.8, borderBottomColor: colors.line },
  messages: { padding: spacing.xl, gap: spacing.md },
  system: { textAlign: 'center', paddingHorizontal: spacing.lg },
  bubble: { maxWidth: '84%', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg, gap: 3 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.purple, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.lavender, borderBottomLeftRadius: 4 },
  composer: { padding: spacing.lg, gap: spacing.sm, borderTopWidth: 0.8, borderTopColor: colors.line, backgroundColor: colors.white },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: { flex: 1, maxHeight: 120, minHeight: 46, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, borderRadius: radius.lg, borderWidth: 0.8, borderColor: colors.line, fontFamily: fonts.medium, fontSize: 14, color: colors.ink, backgroundColor: colors.white },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.4 },
});
