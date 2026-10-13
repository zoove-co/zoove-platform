import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { StepHeading } from '@/components/ui/StepHeading';
import type { Participant } from '@/lib/api';
import { participantImages } from '@/lib/images';
import { colors, radius, spacing } from '@/theme';

type Props = { value: Participant; onChange: (value: Participant) => void };

export function ParticipantPicker({ value, onChange }: Props) {
  const { t } = useTranslation();
  // Only "Personal" is in the first release (see docs/prototype-v1-analysis.md, section 5).
  const options: { id: Participant; title: string; subtitle: string; enabled: boolean }[] = [
    { id: 'personal', title: t('booking.personal'), subtitle: t('booking.personalSub'), enabled: true },
    { id: 'duo', title: t('booking.duo'), subtitle: t('booking.duoSub'), enabled: false },
    { id: 'loved_one', title: t('booking.lovedOne'), subtitle: t('booking.lovedOneSub'), enabled: false },
    { id: 'group', title: t('booking.group'), subtitle: t('booking.groupSub'), enabled: false },
  ];

  return (
    <View style={styles.wrap}>
      <StepHeading title={t('booking.forTitle')} detail={t('booking.forDetail')} />
      <View style={styles.grid}>
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: !option.enabled }}
              disabled={!option.enabled}
              onPress={() => onChange(option.id)}
              style={[styles.card, selected && styles.cardSelected, !option.enabled && styles.cardDisabled]}>
              <Image source={participantImages[option.id]} contentFit="cover" style={styles.photo} />
              <View style={styles.body}>
                <AppText variant="bodyStrong">{option.title}</AppText>
                <AppText variant="micro" color={colors.muted}>
                  {option.enabled ? option.subtitle : t('booking.soon')}
                </AppText>
              </View>
              {selected ? (
                <View style={styles.check}>
                  <Icon name="checkmark-circle" size={22} color={colors.purple} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  card: {
    flexGrow: 1,
    flexBasis: '47%',
    overflow: 'hidden',
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  cardSelected: { borderColor: colors.purple, borderWidth: 1.4 },
  cardDisabled: { opacity: 0.55 },
  photo: { width: '100%', aspectRatio: 1.7 },
  body: { gap: 2, padding: spacing.md },
  check: { position: 'absolute', top: 7, right: 7, borderRadius: 11, backgroundColor: colors.white },
});
