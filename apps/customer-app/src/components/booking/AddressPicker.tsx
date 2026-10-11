import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AddressForm } from '@/components/booking/AddressForm';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { StepHeading } from '@/components/ui/StepHeading';
import { useAddresses } from '@/features/booking/hooks';
import type { Address } from '@/lib/api';
import { colors, radius, spacing } from '@/theme';

type Props = {
  stepNumber: string;
  selectedId: string | undefined;
  onSelect: (address: Address) => void;
};

export function AddressPicker({ stepNumber, selectedId, onSelect }: Props) {
  const { t } = useTranslation();
  const { data: addresses } = useAddresses();
  const [adding, setAdding] = useState(false);
  const selected = addresses?.find((address) => address.id === selectedId);

  return (
    <View style={styles.wrap}>
      <StepHeading number={stepNumber} title={t('booking.whereTitle')} detail={t('booking.whereDetail')} />

      {addresses?.map((address) => {
        const isSelected = address.id === selectedId;
        return (
          <Pressable
            key={address.id}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(address)}
            style={[styles.row, isSelected && styles.rowSelected]}>
            <View style={styles.pin}>
              <Icon name="location-outline" size={18} color={colors.purple} />
            </View>
            <View style={styles.text}>
              <AppText variant="bodyStrong">{address.label}</AppText>
              <AppText variant="caption" color={colors.muted}>
                {address.line}, {address.area} – {address.pincode}
              </AppText>
            </View>
            <Icon
              name={isSelected ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={isSelected ? colors.purple : colors.muted}
            />
          </Pressable>
        );
      })}

      {selected && !selected.serviceable ? (
        <View style={styles.warning}>
          <AppText variant="bodyStrong" color={colors.danger}>
            {t('booking.notServiceableTitle')}
          </AppText>
          <AppText variant="caption" color={colors.muted}>
            {t('booking.notServiceableBody', { area: selected.area })}
          </AppText>
        </View>
      ) : null}

      {adding ? (
        <AddressForm
          onSaved={(address) => {
            onSelect(address);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <Pressable accessibilityRole="button" onPress={() => setAdding(true)} style={styles.add}>
          <Icon name="add-circle-outline" size={18} color={colors.purple} />
          <AppText variant="bodyStrong" color={colors.purple}>
            {t('booking.addAddress')}
          </AppText>
        </Pressable>
      )}

      <AppText variant="micro" color={colors.muted} style={styles.note}>
        {t('booking.rescheduleNote')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 13,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  rowSelected: { borderColor: colors.purple, borderWidth: 1.2 },
  pin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 3 },
  warning: {
    gap: 4,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(217, 45, 32, 0.06)',
  },
  add: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm },
  note: { textAlign: 'center' },
});
