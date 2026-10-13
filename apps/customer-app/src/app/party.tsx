import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddressPicker } from '@/components/booking/AddressPicker';
import { SchedulePicker } from '@/components/booking/SchedulePicker';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { StepHeading } from '@/components/ui/StepHeading';
import { useSavePartyPlan } from '@/features/booking/hooks';
import { track } from '@/lib/analytics/track';
import type { Address, PartyOccasion } from '@/lib/api';
import { formatWhen, nextDays } from '@/lib/dates';
import { bannerImages, serviceImages } from '@/lib/images';
import { colors, radius, spacing } from '@/theme';

const OCCASIONS: PartyOccasion[] = ['birthday', 'friends', 'family', 'team'];
const ACTIVITIES = ['yoga', 'strength', 'pilates', 'zumba'] as const;
const TOTAL_STEPS = 4;
const MIN_GUESTS = 2;
const MAX_GUESTS = 30;

// Zoove Party from Pratik's prototype v12: a 4-step planner that saves a plan. No price and no payment
// yet, because party rules are still open (docs/open-questions.md, items 35 to 43; decision D16).
export default function PartyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const save = useSavePartyPlan();

  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [occasion, setOccasion] = useState<PartyOccasion | undefined>();
  const [activity, setActivity] = useState<(typeof ACTIVITIES)[number] | undefined>();
  const [guests, setGuests] = useState(6);
  const [dayIso, setDayIso] = useState(() => nextDays(1)[0]?.iso ?? '');
  const [slotStartsAt, setSlotStartsAt] = useState<string | undefined>();
  const [address, setAddress] = useState<Address | undefined>();

  useEffect(() => {
    track('party_viewed');
  }, []);

  const activityName = (slug: string) => slug.charAt(0).toUpperCase() + slug.slice(1);
  const canContinue =
    step === 1 ? Boolean(occasion) : step === 2 ? Boolean(activity) : step === 3 ? Boolean(slotStartsAt && address?.serviceable) : true;

  const onSave = () => {
    if (!occasion || !activity || !slotStartsAt || !address) return;
    save.mutate(
      { occasion, serviceSlug: activity, guests, startsAt: slotStartsAt, addressId: address.id },
      {
        onSuccess: () => {
          track('party_plan_saved', { occasion, activity, guests });
          setDone(true);
        },
      },
    );
  };

  const onNext = () => (step < TOTAL_STEPS ? setStep(step + 1) : onSave());
  const onBack = () => (step > 1 ? setStep(step - 1) : router.back());

  if (done) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.doneWrap}>
          <View style={styles.doneIcon}>
            <Icon name="checkmark" size={38} color={colors.white} />
          </View>
          <AppText variant="screenTitle" style={styles.center}>
            {t('party.doneTitle')}
          </AppText>
          <AppText color={colors.muted} style={styles.center}>
            {t('party.doneBody')}
          </AppText>
        </View>
        <View style={styles.footer}>
          <PrimaryButton label={t('party.backHome')} onPress={() => router.replace('/home')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader title={t('party.title')} />
      <View style={styles.progress}>
        {Array.from({ length: TOTAL_STEPS }, (_, index) => (
          <View key={index} style={[styles.segment, index < step && styles.segmentOn]} />
        ))}
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}>
        {step === 1 ? (
          <>
            <Image source={bannerImages.party} contentFit="cover" style={styles.banner} />
            <StepHeading title={t('party.occasionTitle')} detail={t('party.occasionDetail')} />
            <View style={styles.list}>
              {OCCASIONS.map((item) => (
                <Option key={item} label={t(`party.${item}`)} selected={item === occasion} onPress={() => setOccasion(item)} />
              ))}
            </View>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <StepHeading title={t('party.activityTitle')} detail={t('party.activityDetail')} />
            <View style={styles.grid}>
              {ACTIVITIES.map((slug) => (
                <Pressable
                  key={slug}
                  accessibilityRole="button"
                  accessibilityState={{ selected: slug === activity }}
                  onPress={() => setActivity(slug)}
                  style={[styles.tile, slug === activity && styles.tileOn]}>
                  <Image source={serviceImages[slug]} contentFit="cover" style={styles.tileImage} />
                  <AppText variant="bodyStrong" style={styles.tileLabel}>
                    {activityName(slug)}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {step === 3 && activity ? (
          <>
            <StepHeading title={t('party.detailsTitle')} />
            <View style={styles.stepper}>
              <AppText variant="bodyStrong">{t('party.guestsLabel')}</AppText>
              <View style={styles.stepperControls}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('party.guestsLess')}
                  disabled={guests <= MIN_GUESTS}
                  onPress={() => setGuests(guests - 1)}
                  style={[styles.round, guests <= MIN_GUESTS && styles.dim]}>
                  <Icon name="remove" size={20} color={colors.purple} />
                </Pressable>
                <AppText variant="heading" style={styles.count}>
                  {guests}
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('party.guestsMore')}
                  disabled={guests >= MAX_GUESTS}
                  onPress={() => setGuests(guests + 1)}
                  style={[styles.round, guests >= MAX_GUESTS && styles.dim]}>
                  <Icon name="add" size={20} color={colors.purple} />
                </Pressable>
              </View>
            </View>
            <SchedulePicker
              serviceSlug={activity}
              dayIso={dayIso}
              onDayChange={(iso) => {
                setDayIso(iso);
                setSlotStartsAt(undefined);
              }}
              slotStartsAt={slotStartsAt}
              onSlotChange={setSlotStartsAt}
              numbered={false}
            />
            <View style={styles.where}>
              <View style={styles.modes}>
                <Mode label={t('party.atHome')} on />
                <Mode label={`${t('party.studio')} · ${t('booking.soon')}`} />
                <Mode label={`${t('party.online')} · ${t('booking.soon')}`} />
              </View>
              <AddressPicker selectedId={address?.id} onSelect={setAddress} />
            </View>
          </>
        ) : null}

        {step === 4 && occasion && activity && slotStartsAt && address ? (
          <>
            <StepHeading title={t('party.reviewTitle')} />
            <View style={styles.review}>
              <Row label={t('party.rowOccasion')} value={t(`party.${occasion}`)} />
              <Row label={t('party.rowActivity')} value={activityName(activity)} />
              <Row label={t('party.rowGuests')} value={String(guests)} />
              <Row label={t('party.rowWhen')} value={formatWhen(slotStartsAt)} />
              <Row label={t('party.rowWhere')} value={`${address.label}, ${address.area}`} last />
            </View>
            <AppText variant="micro" color={colors.muted}>
              {t('party.reviewNote')}
            </AppText>
            {save.isError ? (
              <AppText color={colors.danger}>{t('party.error')}</AppText>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <AppText variant="micro" color={colors.muted} style={styles.center}>
          {t('party.stepOf', { current: step, total: TOTAL_STEPS })}
        </AppText>
        <View style={styles.actions}>
          <View style={styles.backBtn}>
            <PrimaryButton label={t('party.back')} variant="soft" onPress={onBack} />
          </View>
          <View style={styles.nextBtn}>
            <PrimaryButton
              label={step < TOTAL_STEPS ? t('party.next') : save.isPending ? t('party.saving') : t('party.save')}
              disabled={!canContinue}
              loading={save.isPending}
              onPress={onNext}
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function Option({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.option, selected && styles.optionOn]}>
      <AppText variant="bodyStrong">{label}</AppText>
      {selected ? <Icon name="checkmark-circle" size={22} color={colors.purple} /> : null}
    </Pressable>
  );
}

function Mode({ label, on = false }: { label: string; on?: boolean }) {
  return (
    <View style={[styles.mode, on && styles.modeOn]}>
      <AppText variant="micro" color={on ? colors.white : colors.muted}>
        {label}
      </AppText>
    </View>
  );
}

function Row({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowLine]}>
      <AppText color={colors.muted}>{label}</AppText>
      <AppText variant="bodyStrong" style={styles.rowValue}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: 18, paddingBottom: 6 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.lavender },
  segmentOn: { backgroundColor: colors.purple },
  content: { padding: 18, gap: 16 },
  banner: { width: '100%', aspectRatio: 1.9, borderRadius: radius.lg, backgroundColor: colors.lavender },
  list: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 0.8,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  optionOn: { borderColor: colors.purple, borderWidth: 1.4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: 0.8,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  tileOn: { borderColor: colors.purple, borderWidth: 1.4 },
  tileImage: { width: '100%', aspectRatio: 1.3 },
  tileLabel: { padding: spacing.md },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  round: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lavender,
  },
  dim: { opacity: 0.4 },
  count: { minWidth: 30, textAlign: 'center' },
  where: { gap: 12 },
  modes: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  mode: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.lavender },
  modeOn: { backgroundColor: colors.purple },
  review: { borderRadius: radius.lg, borderWidth: 0.8, borderColor: colors.line, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 13 },
  rowLine: { borderBottomWidth: 0.8, borderBottomColor: colors.line },
  rowValue: { flexShrink: 1, textAlign: 'right' },
  footer: { gap: 8, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12 },
  actions: { flexDirection: 'row', gap: 10 },
  backBtn: { flex: 1 },
  nextBtn: { flex: 2 },
  center: { textAlign: 'center' },
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28 },
  doneIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
  },
});
