import { zodResolver } from '@hookform/resolvers/zod';
import * as Location from 'expo-location';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, type KeyboardTypeOptions } from 'react-native';

import { AppText } from '@/components/ui/AppText';

import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { TextField } from '@/components/ui/TextField';
import { buildAddressSchema, type AddressFormValues } from '@/features/booking/addressSchema';
import { useAddAddress, useServiceability } from '@/features/booking/hooks';
import type { Address } from '@/lib/api';
import { colors, radius, spacing } from '@/theme';

type FieldProps = {
  control: Control<AddressFormValues>;
  name: keyof AddressFormValues;
  label: string;
  placeholder: string;
  error: string | undefined;
  keyboardType?: KeyboardTypeOptions;
};

function FormField({ control, name, label, placeholder, error, keyboardType }: FieldProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <TextField
          label={label}
          placeholder={placeholder}
          value={field.value}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          error={error}
          keyboardType={keyboardType}
        />
      )}
    />
  );
}

type Props = { onSaved: (address: Address) => void; onCancel: () => void };

export function AddressForm({ onSaved, onCancel }: Props) {
  const { t } = useTranslation();
  const schema = useMemo(() => buildAddressSchema((key) => t(key)), [t]);
  const addAddress = useAddAddress();
  const [failed, setFailed] = useState(false);
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<'denied' | 'failed' | null>(null);

  const pinCurrentLocation = async () => {
    if (locating) return;
    setLocating(true);
    setLocationError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationError('denied');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = position.coords;
      setPin({ latitude, longitude });
      // Filling the text fields is a convenience; the pin is what matters, so failure here is fine.
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (place) {
          const line = [place.name, place.street].filter(Boolean).join(', ');
          const area = [place.district ?? place.subregion, place.city].filter(Boolean).join(', ');
          if (line) setValue('line', line, { shouldValidate: true });
          if (area) setValue('area', area, { shouldValidate: true });
          if (place.postalCode) setValue('pincode', place.postalCode, { shouldValidate: true });
        }
      } catch {
        // keep the pin, let the customer type the rest
      }
    } catch {
      setLocationError('failed');
    } finally {
      setLocating(false);
    }
  };
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<AddressFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { label: '', line: '', area: '', pincode: '' },
  });
  const pincodeValue = useWatch({ control, name: 'pincode' }) ?? '';
  const serviceability = useServiceability(pincodeValue, pin);

  const submit = handleSubmit(async (values) => {
    setFailed(false);
    try {
      const created = await addAddress.mutateAsync({ ...values, ...(pin ?? {}) });
      onSaved(created);
    } catch {
      setFailed(true);
    }
  });

  return (
    <View style={styles.form}>
      <PrimaryButton
        label={locating ? t('booking.locating') : t('booking.useLocation')}
        variant="soft"
        loading={locating}
        onPress={() => void pinCurrentLocation()}
      />
      {pin ? (
        <View style={styles.pinRow}>
          <AppText variant="caption" color={colors.success} style={styles.pinText}>
            {t('booking.pinned')}
          </AppText>
          <Pressable accessibilityRole="button" onPress={() => setPin(null)}>
            <AppText variant="caption" color={colors.danger}>
              {t('booking.clearPin')}
            </AppText>
          </Pressable>
        </View>
      ) : (
        <AppText variant="micro" color={colors.muted}>
          {t('booking.pinHint')}
        </AppText>
      )}
      {locationError ? (
        <AppText variant="caption" color={colors.danger}>
          {locationError === 'denied' ? t('booking.locationDenied') : t('booking.locationFailed')}
        </AppText>
      ) : null}
      <FormField control={control} name="label" label={t('booking.fieldLabel')} placeholder="Home" error={errors.label?.message} />
      <FormField control={control} name="line" label={t('booking.fieldLine')} placeholder="A-1203, Rustomjee Seasons" error={errors.line?.message} />
      <FormField control={control} name="area" label={t('booking.fieldArea')} placeholder="Bandra West, Mumbai" error={errors.area?.message} />
      <FormField
        control={control}
        name="pincode"
        label={t('booking.fieldPincode')}
        placeholder="400050"
        error={errors.pincode?.message}
        keyboardType="number-pad"
      />
      {/^[1-9][0-9]{5}$/.test(pincodeValue.trim()) && !errors.pincode ? (
        <AppText
          variant="caption"
          color={
            serviceability.isPending
              ? colors.muted
              : serviceability.data?.serviceable === false
                ? colors.danger
                : serviceability.data?.serviceable
                  ? colors.success
                  : colors.muted
          }>
          {serviceability.isPending
            ? t('booking.pincodeChecking')
            : serviceability.data?.serviceable === false
              ? t('booking.pincodeNotServed')
              : serviceability.data?.serviceable
                ? t('booking.pincodeServed')
                : ''}
        </AppText>
      ) : null}
      {failed ? (
        <AppText variant="caption" color={colors.danger}>
          {t('booking.addressError')}
        </AppText>
      ) : null}
      <PrimaryButton label={t('booking.saveAddress')} loading={addAddress.isPending} onPress={() => void submit()} />
      <PrimaryButton label={t('booking.cancelAddAddress')} variant="soft" onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  pinRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  pinText: { flex: 1 },
  form: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
});
