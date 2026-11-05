import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Checkbox } from '@/components/ui/Checkbox';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TextField } from '@/components/ui/TextField';
import { useProgressProfile, useSaveProgressProfile } from '@/features/booking/hooks';
import { track } from '@/lib/analytics/track';
import type { FitnessGoal, ProgressProfile } from '@/lib/api';
import { colors, radius, spacing } from '@/theme';

const GOALS: FitnessGoal[] = ['lose_weight', 'build_strength', 'stay_active', 'flexibility', 'stress_relief'];
const DAYS = [1, 2, 3, 4, 5, 6, 7];

// Goal and days a week shape the Streak page. Height and weight are health data: they are asked for only with a tick,
// and they are deleted if the tick is removed.
export default function ProgressProfileScreen() {
  const { t } = useTranslation();
  const { data, isPending, isError, refetch } = useProgressProfile();
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title={t('progress.title')} />
      {isPending ? (
        <View style={styles.center}><ActivityIndicator color={colors.purple} /></View>
      ) : isError ? (
        <View style={styles.center}>
          <AppText color={colors.danger}>{t('progress.loadError')}</AppText>
          <PrimaryButton label={t('progress.retry')} variant="soft" onPress={() => void refetch()} />
        </View>
      ) : (
        <ProgressForm initial={data} />
      )}
    </SafeAreaView>
  );
}

function ProgressForm({ initial }: { initial: ProgressProfile }) {
  const { t } = useTranslation();
  const router = useRouter();
  const save = useSaveProgressProfile();
  const [goal, setGoal] = useState<FitnessGoal | null>(initial.goal);
  const [days, setDays] = useState<number | null>(initial.targetDaysPerWeek);
  const [consent, setConsent] = useState(initial.healthConsent);
  const [height, setHeight] = useState(initial.heightCm === null ? '' : String(initial.heightCm));
  const [weight, setWeight] = useState(initial.weightKg === null ? '' : String(initial.weightKg));

  const heightNum = height.trim() === '' ? null : Number(height);
  const weightNum = weight.trim() === '' ? null : Number(weight);
  const heightOk = heightNum === null || (Number.isInteger(heightNum) && heightNum >= 50 && heightNum <= 260);
  const weightOk = weightNum === null || (weightNum >= 20 && weightNum <= 400);
  const valid = heightOk && weightOk;

  const onSave = () => {
    if (!valid || save.isPending) return;
    save.mutate(
      { goal, targetDaysPerWeek: days, heightCm: consent ? heightNum : null, weightKg: consent ? weightNum : null, healthConsent: consent },
      {
        onSuccess: () => {
          track('progress_profile_saved');
          router.back();
        },
      },
    );
  };

  return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <AppText color={colors.muted}>{t('progress.lead')}</AppText>

        <AppText variant="heading">{t('progress.goalTitle')}</AppText>
        <View style={styles.wrap}>
          {GOALS.map((item) => (
            <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: goal === item }} onPress={() => setGoal(goal === item ? null : item)} style={[styles.chip, goal === item && styles.chipOn]}>
              <AppText variant="bodyStrong" color={goal === item ? colors.white : colors.ink}>{t(`progress.goal.${item}`)}</AppText>
            </Pressable>
          ))}
        </View>

        <AppText variant="heading">{t('progress.daysTitle')}</AppText>
        <View style={styles.wrap}>
          {DAYS.map((item) => (
            <Pressable key={item} accessibilityRole="button" accessibilityLabel={t('progress.daysLabel', { count: item })} accessibilityState={{ selected: days === item }} onPress={() => setDays(days === item ? null : item)} style={[styles.day, days === item && styles.chipOn]}>
              <AppText variant="bodyStrong" color={days === item ? colors.white : colors.ink}>{item}</AppText>
            </Pressable>
          ))}
        </View>

        <View style={styles.health}>
          <Checkbox checked={consent} onChange={setConsent} label={t('progress.consent')}>
            <AppText variant="bodyStrong">{t('progress.consent')}</AppText>
            <AppText variant="micro" color={colors.muted}>{t('progress.consentHint')}</AppText>
          </Checkbox>
          {consent ? (
            <>
              <TextField label={t('progress.height')} value={height} onChangeText={setHeight} keyboardType="number-pad" error={heightOk ? undefined : t('progress.heightError')} />
              <TextField label={t('progress.weight')} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" error={weightOk ? undefined : t('progress.weightError')} />
            </>
          ) : null}
        </View>

        {save.isError ? <AppText color={colors.danger}>{t('progress.saveError')}</AppText> : null}
        <PrimaryButton label={t('progress.save')} disabled={!valid} loading={save.isPending} onPress={onSave} />
      </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xxl },
  content: { padding: spacing.xl, gap: spacing.lg },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  day: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.purple, borderColor: colors.purple },
  health: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.lavender },
});
