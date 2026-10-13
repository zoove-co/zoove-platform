import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { StepHeading } from '@/components/ui/StepHeading';
import type { PastCoach } from '@/lib/api';
import { colors, radius } from '@/theme';

type Props = {
  stepNumber: string;
  coaches: PastCoach[];
  selectedId: string | undefined; // undefined = any available coach
  onSelect: (coachId: string | undefined) => void;
};

// Only shown once the customer has finished a session: a first booking is always matched by us.
export function CoachPicker({ stepNumber, coaches, selectedId, onSelect }: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <StepHeading number={stepNumber} title={t('booking.coachTitle')} detail={t('booking.coachDetail')} />
      <Option
        title={t('booking.coachAny')}
        subtitle={t('booking.coachAnySub')}
        selected={selectedId === undefined}
        onPress={() => onSelect(undefined)}
      />
      {coaches.map((coach) => (
        <Option
          key={coach.id}
          title={coach.name}
          subtitle={t('booking.coachPast', { count: coach.sessionsTogether, when: coach.lastSessionLabel })}
          selected={selectedId === coach.id}
          onPress={() => onSelect(coach.id)}
        />
      ))}
      <AppText variant="micro" color={colors.muted}>
        {t('booking.coachFallback')}
      </AppText>
    </View>
  );
}

function Option({
  title,
  subtitle,
  selected,
  onPress,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.option, selected && styles.optionSelected]}>
      <View style={styles.badge}>
        <Icon name="person-outline" size={18} color={colors.purple} />
      </View>
      <View style={styles.text}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="micro" color={colors.muted}>
          {subtitle}
        </AppText>
      </View>
      {selected ? <Icon name="checkmark-circle" size={20} color={colors.purple} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  optionSelected: { borderColor: colors.purple, borderWidth: 1.2, backgroundColor: 'rgba(232, 217, 255, 0.5)' },
  badge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
});
