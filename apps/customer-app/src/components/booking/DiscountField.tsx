import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { TextField } from '@/components/ui/TextField';
import { usePreviewDiscount } from '@/features/booking/hooks';
import { discountErrorMessage } from '@/lib/api/errorMessage';
import type { BookingMode, DiscountQuote } from '@/lib/api';
import { colors, radius, spacing } from '@/theme';

type Props = {
  serviceSlug: string;
  mode: BookingMode;
  applied: DiscountQuote | null;
  onApplied: (quote: DiscountQuote | null) => void;
};

// "Have a discount code?" The server checks the code and returns the new total; the app never works the price out itself.
export function DiscountField({ serviceSlug, mode, applied, onApplied }: Props) {
  const { t } = useTranslation();
  const preview = usePreviewDiscount();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');

  if (applied) {
    return (
      <View style={styles.applied}>
        <Icon name="pricetag" size={18} color={colors.purple} />
        <AppText variant="bodyStrong" color={colors.purple} style={styles.appliedText}>
          {t('discount.applied', { code: applied.code, label: applied.label })}
        </AppText>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onApplied(null);
            setCode('');
            preview.reset();
          }}
          hitSlop={8}
          style={styles.remove}>
          <AppText variant="caption" color={colors.purple}>
            {t('discount.remove')}
          </AppText>
        </Pressable>
      </View>
    );
  }

  if (!open) {
    return (
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.link}>
        <Icon name="pricetag-outline" size={18} color={colors.purple} />
        <AppText variant="bodyStrong" color={colors.purple}>
          {t('discount.have')}
        </AppText>
      </Pressable>
    );
  }

  const submit = () => {
    if (code.trim().length < 3 || preview.isPending) return;
    preview.mutate({ code, serviceSlug, mode }, { onSuccess: (quote) => onApplied(quote) });
  };

  return (
    <View style={styles.box}>
      <TextField
        label={t('discount.label')}
        value={code}
        onChangeText={(value) => setCode(value.toUpperCase())}
        autoCapitalize="characters"
        error={preview.isError ? discountErrorMessage(preview.error, t) : undefined}
      />
      <PrimaryButton label={t('discount.apply')} variant="soft" disabled={code.trim().length < 3} loading={preview.isPending} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  box: { gap: spacing.sm },
  applied: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.lavender,
  },
  appliedText: { flex: 1 },
  remove: { minHeight: 44, justifyContent: 'center' },
});
