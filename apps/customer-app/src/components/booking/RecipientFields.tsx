import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { TextField } from '@/components/ui/TextField';
import { isValidRecipientName, normalizeIndianMobile } from '@/lib/participant';
import { colors, radius, spacing } from '@/theme';

type Props = { name: string; onName: (value: string) => void; phone: string; onPhone: (value: string) => void };

// Who the session is for, when it is for a loved one. Asked with the address, because that is where the coach goes.
export function RecipientFields({ name, onName, phone, onPhone }: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.box}>
      <AppText variant="bodyStrong">{t('booking.recipientTitle')}</AppText>
      <TextField
        label={t('booking.recipientName')}
        value={name}
        onChangeText={onName}
        autoCapitalize="words"
        autoComplete="name"
        error={name.length > 0 && !isValidRecipientName(name) ? t('booking.recipientNameError') : undefined}
      />
      <TextField
        label={t('booking.recipientPhone')}
        value={phone}
        onChangeText={onPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        error={phone.length > 0 && !normalizeIndianMobile(phone) ? t('booking.recipientPhoneError') : undefined}
      />
      <AppText variant="micro" color={colors.muted}>
        {t('booking.recipientPhoneHint')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 0.8, borderColor: colors.line },
});
