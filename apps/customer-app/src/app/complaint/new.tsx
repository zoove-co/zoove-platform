import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { FieldScrollContext, useFieldScroll } from '@/components/ui/fieldScroll';
import { FitnessLoader } from '@/components/ui/FitnessLoader';
import { Icon } from '@/components/ui/Icon';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TextField } from '@/components/ui/TextField';
import { useComplaintCategories, useComplaintSessions, useCreateComplaint } from '@/features/complaints/hooks';
import { complaintErrorMessage } from '@/lib/complaintErrors';
import { formatWhen } from '@/lib/dates';
import { colors, radius, spacing } from '@/theme';

const MIN_LENGTH = 5;

function Choice({ selected, title, hint, onPress }: { selected: boolean; title: string; hint?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={[styles.choice, selected && styles.choiceOn]}>
      <Icon name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.purple : colors.muted} />
      <View style={styles.choiceText}>
        <AppText variant="bodyStrong">{title}</AppText>
        {hint ? <AppText variant="caption" color={colors.muted}>{hint}</AppText> : null}
      </View>
    </Pressable>
  );
}

// Raise a complaint. Opened from Help (about anything) or from a session (that session is already chosen).
export default function NewComplaintScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ bookingId?: string }>();
  const categories = useComplaintCategories();
  const sessions = useComplaintSessions();
  const create = useCreateComplaint();
  const field = useFieldScroll();
  const [category, setCategory] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(typeof params.bookingId === 'string' ? params.bookingId : null);
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState(false);
  // One key per complaint: pressing send twice, or retrying after a dropped connection, is the same complaint.
  const requestKey = useRef<string | null>(null);

  const chosen = categories.data?.find((c) => c.key === category);
  const needsSession = chosen?.needsSession === true;
  const text = message.trim();
  const tooShort = text.length < MIN_LENGTH;
  const canSend = Boolean(chosen) && (!needsSession || bookingId !== null) && !tooShort && !create.isPending;

  const submit = () => {
    setTouched(true);
    if (!chosen || !canSend) return;
    create.mutate(
      { category: chosen.key, ...(bookingId ? { bookingId } : {}), message: text, idempotencyKey: (requestKey.current ??= `complaint-${Date.now()}-${Math.random().toString(36).slice(2)}`) },
      { onSuccess: (detail) => router.replace({ pathname: '/complaint/[id]', params: { id: detail.id } }) },
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title={t('complaints.newTitle')} />
      {categories.isPending ? (
        <View style={styles.center}><FitnessLoader fill={false} /></View>
      ) : categories.isError ? (
        <View style={styles.center}>
          <AppText variant="heading">{t('complaints.loadError')}</AppText>
          <PrimaryButton label={t('complaints.retry')} variant="soft" onPress={() => void categories.refetch()} />
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <FieldScrollContext.Provider value={field.reveal}>
            <ScrollView {...field.scrollProps} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
              <AppText variant="screenTitle">{t('complaints.whatHappened')}</AppText>
              {categories.data.map((c) => (
                <Choice key={c.key} selected={category === c.key} title={c.label} hint={c.hint} onPress={() => setCategory(c.key)} />
              ))}

              {chosen && (needsSession || (sessions.data?.length ?? 0) > 0) ? (
                <>
                  <AppText variant="bodyStrong" style={styles.section}>{needsSession ? t('complaints.whichSession') : t('complaints.whichSessionOptional')}</AppText>
                  {!needsSession ? <Choice selected={bookingId === null} title={t('complaints.noneOfThese')} onPress={() => setBookingId(null)} /> : null}
                  {(sessions.data ?? []).map((s) => (
                    <Choice key={s.id} selected={bookingId === s.id} title={`${s.serviceName} · ${s.code}`} {...(s.startsAt ? { hint: formatWhen(s.startsAt) } : {})} onPress={() => setBookingId(s.id)} />
                  ))}
                  {needsSession && !sessions.isPending && (sessions.data?.length ?? 0) === 0 ? <AppText variant="caption" color={colors.muted}>{t('complaints.noSessions')}</AppText> : null}
                </>
              ) : null}

              {chosen ? (
                <>
                  <View style={styles.section}>
                    <TextField
                      label={t('complaints.tellUs')}
                      value={message}
                      onChangeText={setMessage}
                      onBlur={() => setTouched(true)}
                      placeholder={t('complaints.placeholder')}
                      multiline
                      maxLength={2000}
                      {...(touched && tooShort ? { error: t('complaints.tooShort') } : {})}
                    />
                  </View>
                  {chosen.urgent ? <AppText variant="caption" color={colors.danger}>{t('complaints.urgentNote')}</AppText> : null}
                  {create.isError ? <AppText variant="caption" color={colors.danger}>{complaintErrorMessage(create.error, t)}</AppText> : null}
                  <PrimaryButton label={create.isPending ? t('complaints.sending') : t('complaints.submit')} loading={create.isPending} disabled={!canSend && touched} onPress={submit} />
                </>
              ) : null}
            </ScrollView>
          </FieldScrollContext.Provider>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  section: { marginTop: spacing.md },
  choice: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 0.8, borderColor: colors.line },
  choiceOn: { borderColor: colors.purple, backgroundColor: colors.lavender },
  choiceText: { flex: 1, gap: 2 },
});
