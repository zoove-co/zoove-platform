import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { TextField } from '@/components/ui/TextField';
import { useUpdateProfile } from '@/features/auth/hooks';
import { track } from '@/lib/analytics/track';
import type { Profile } from '@/lib/api';
import { normalizeIndianMobile } from '@/lib/participant';
import { colors, radius, spacing } from '@/theme';

// A customer can book without ever filling in their profile. Right before checkout, if the coach would not know their name or
// a number to reach them on, this slides up and asks for just that. Nothing else is asked.
export const profileComplete = (profile: Profile): boolean =>
  Boolean(profile.firstName && profile.firstName.trim().length >= 2) && Boolean(profile.phone ?? profile.contactPhone);

type Props = { visible: boolean; profile: Profile; onClose: () => void; onSaved: () => void };

export function CheckoutDetailsSheet({ visible, profile, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const update = useUpdateProfile();
  const [name, setName] = useState([profile.firstName, profile.lastName].filter(Boolean).join(' '));
  const [phone, setPhone] = useState((profile.contactPhone ?? '').replace('+91', ''));
  const [touched, setTouched] = useState(false);

  const trimmed = name.trim();
  const mobile = profile.phone ?? normalizeIndianMobile(phone);
  const nameOk = trimmed.length >= 2 && trimmed.length <= 60;
  const [token = '', ...tail] = trimmed.split(/\s+/);
  // A one-letter first word ("A Sharma") would fail the 2-letter rule, so keep the whole name as the first name.
  const oneLetter = token.length < 2;
  const first = oneLetter ? trimmed : token;
  const rest = oneLetter ? [] : tail;

  const save = () => {
    setTouched(true);
    if (!nameOk || !mobile || update.isPending) return;
    update.mutate(
      { firstName: first, ...(rest.length > 0 ? { lastName: rest.join(' ') } : {}), ...(profile.phone ? {} : { contactPhone: mobile }) },
      {
        onSuccess: () => {
          track('profile_completed');
          onSaved();
        },
      },
    );
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior="padding">
        <Pressable accessibilityLabel={t('checkoutDetails.close')} style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <AppText variant="sectionTitle" style={styles.title}>
              {t('checkoutDetails.title')}
            </AppText>
            <Pressable accessibilityRole="button" accessibilityLabel={t('checkoutDetails.close')} onPress={onClose}>
              <Icon name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>
          <AppText variant="caption" color={colors.muted}>
            {t('checkoutDetails.body')}
          </AppText>
          <TextField
            label={t('checkoutDetails.name')}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="name"
            error={touched && !nameOk ? t('profile.errorFirstName') : undefined}
          />
          {profile.phone ? null : (
            <TextField
              label={t('checkoutDetails.mobile')}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              error={touched && !mobile ? t('booking.recipientPhoneError') : undefined}
            />
          )}
          {profile.email ? (
            <AppText variant="micro" color={colors.muted}>
              {t('checkoutDetails.emailVerified', { email: profile.email })}
            </AppText>
          ) : null}
          {update.isError ? (
            <AppText variant="caption" color={colors.danger}>
              {t('profile.saveError')}
            </AppText>
          ) : null}
          <PrimaryButton label={t('checkoutDetails.save')} loading={update.isPending} onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { gap: 12, padding: spacing.xl, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flex: 1 },
});
