import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/AppText';
import { StepHeading } from '@/components/ui/StepHeading';
import { useSlots } from '@/features/booking/hooks';
import { nextDays } from '@/lib/dates';
import { colors, radius } from '@/theme';

type Props = {
  serviceSlug: string;
  dayIso: string;
  onDayChange: (iso: string) => void;
  slotStartsAt: string | undefined;
  onSlotChange: (startsAt: string) => void;
  firstNumber?: number;
};

export function SchedulePicker({
  serviceSlug,
  dayIso,
  onDayChange,
  slotStartsAt,
  onSlotChange,
  firstNumber = 2,
}: Props) {
  const { t } = useTranslation();
  const days = useMemo(() => nextDays(7), []);
  const { data: slots, isPending } = useSlots(serviceSlug, dayIso);
  const anyAvailable = slots?.some((slot) => slot.available) ?? false;

  return (
    <View style={styles.wrap}>
      <StepHeading number={String(firstNumber)} title={t('booking.dateTitle')} />
      <View style={styles.dayRow}>
        {days.map((day) => {
          const selected = day.iso === dayIso;
          return (
            <Pressable
              key={day.iso}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onDayChange(day.iso)}
              style={[styles.day, selected && styles.daySelected]}>
              <AppText variant="micro" color={selected ? 'rgba(255,255,255,0.8)' : colors.muted} style={styles.tiny}>
                {day.weekday}
              </AppText>
              <AppText variant="heading" color={selected ? colors.white : colors.ink} style={styles.dayNumber}>
                {day.dayOfMonth}
              </AppText>
              <AppText variant="micro" color={selected ? 'rgba(255,255,255,0.8)' : colors.muted} style={styles.tiny}>
                {day.month}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <StepHeading number={String(firstNumber + 1)} title={t('booking.slotTitle')} detail={t('booking.slotDetail')} />
      {isPending ? (
        <ActivityIndicator color={colors.purple} />
      ) : (
        <View style={styles.slotGrid}>
          {slots?.map((slot) => {
            const selected = slot.startsAt === slotStartsAt;
            return (
              <Pressable
                key={slot.id}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: !slot.available }}
                disabled={!slot.available}
                onPress={() => onSlotChange(slot.startsAt)}
                style={[styles.slot, selected && styles.slotSelected, !slot.available && styles.slotOff]}>
                <AppText variant="micro" color={selected ? colors.white : colors.ink} style={styles.slotText}>
                  {slot.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      )}
      {!isPending && !anyAvailable ? (
        <AppText variant="caption" color={colors.muted}>
          {t('booking.noSlots')}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 13 },
  dayRow: { flexDirection: 'row', gap: 5 },
  day: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  daySelected: { backgroundColor: colors.purple, borderColor: colors.purple },
  tiny: { fontSize: 9 },
  dayNumber: { fontSize: 15 },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: {
    flexGrow: 1,
    flexBasis: '22%',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: radius.sm + 1,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  slotSelected: { backgroundColor: colors.purple, borderColor: colors.purple },
  slotOff: { opacity: 0.35 },
  slotText: { fontSize: 10 },
});
