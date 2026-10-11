import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { Controller, useForm, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type KeyboardTypeOptions } from 'react-native';

import { AppText } from '@/components/ui/AppText';

import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { TextField } from '@/components/ui/TextField';
import { buildAddressSchema, type AddressFormValues } from '@/features/booking/addressSchema';
import { useAddAddress } from '@/features/booking/hooks';
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
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AddressFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { label: '', line: '', area: '', pincode: '' },
  });

  const submit = handleSubmit(async (values) => {
    setFailed(false);
    try {
      const created = await addAddress.mutateAsync(values);
      onSaved(created);
    } catch {
      setFailed(true);
    }
  });

  return (
    <View style={styles.form}>
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
  form: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
});
