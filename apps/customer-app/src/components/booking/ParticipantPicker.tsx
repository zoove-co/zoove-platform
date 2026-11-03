import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { StepHeading } from '@/components/ui/StepHeading';
import { TextField } from '@/components/ui/TextField';
import type { Participant } from '@/lib/api';
import { participantImages } from '@/lib/images';
import { GROUP_MAX, GROUP_MIN, normalizeIndianMobile, isValidRecipientName } from '@/lib/participant';
import { colors, radius, spacing } from '@/theme';

type Props = {
  value: Participant;
  onChange: (value: Participant) => void;
  groupSize: number;
  onGroupSize: (value: number) => void;
  recipientName: string;
  onRecipientName: (value: string) => void;
  recipientPhone: string;
  onRecipientPhone: (value: string) => void;
};

export function ParticipantPicker({ value, onChange, groupSize, onGroupSize, recipientName, onRecipientName, recipientPhone, onRecipientPhone }: Props) {
  const { t } = useTranslation();
  const options: { id: Participant; title: string; subtitle: string; enabled: boolean }[] = [
    { id: 'personal', title: t('booking.personal'), subtitle: t('booking.personalSub'), enabled: true },
    { id: 'duo', title: t('booking.duo'), subtitle: t('booking.duoSub'), enabled: true },
    { id: 'loved_one', title: t('booking.lovedOne'), subtitle: t('booking.lovedOneSub'), enabled: true },
    { id: 'group', title: t('booking.group'), subtitle: t('booking.groupSub'), enabled: true },
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

      {value === 'group' ? (
        <View style={styles.detail}>
          <AppText variant="bodyStrong">{t('booking.groupSizeLabel')}</AppText>
          <View style={styles.stepper}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('booking.groupSizeLess')}
              disabled={groupSize <= GROUP_MIN}
              onPress={() => onGroupSize(Math.max(GROUP_MIN, groupSize - 1))}
              style={[styles.stepButton, groupSize <= GROUP_MIN && styles.cardDisabled]}>
              <Icon name="remove" size={22} color={colors.purple} />
            </Pressable>
            <AppText variant="heading">{t('booking.groupSizeValue', { count: groupSize })}</AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('booking.groupSizeMore')}
              disabled={groupSize >= GROUP_MAX}
              onPress={() => onGroupSize(Math.min(GROUP_MAX, groupSize + 1))}
              style={[styles.stepButton, groupSize >= GROUP_MAX && styles.cardDisabled]}>
              <Icon name="add" size={22} color={colors.purple} />
            </Pressable>
          </View>
          <AppText variant="micro" color={colors.muted}>
            {t('booking.groupSizeHint')}
          </AppText>
        </View>
      ) : null}

      {value === 'loved_one' ? (
        <View style={styles.detail}>
          <TextField
            label={t('booking.recipientName')}
            value={recipientName}
            onChangeText={onRecipientName}
            autoCapitalize="words"
            autoComplete="name"
            error={recipientName.length > 0 && !isValidRecipientName(recipientName) ? t('booking.recipientNameError') : undefined}
          />
          <TextField
            label={t('booking.recipientPhone')}
            value={recipientPhone}
            onChangeText={onRecipientPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            error={recipientPhone.length > 0 && !normalizeIndianMobile(recipientPhone) ? t('booking.recipientPhoneError') : undefined}
          />
          <AppText variant="micro" color={colors.muted}>
            {t('booking.recipientPhoneHint')}
          </AppText>
        </View>
      ) : null}
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
  detail: { gap: 10, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 0.8, borderColor: colors.line },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.purple },
  check: { position: 'absolute', top: 7, right: 7, borderRadius: 11, backgroundColor: colors.white },
});
