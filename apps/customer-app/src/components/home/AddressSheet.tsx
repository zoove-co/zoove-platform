import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AddressForm } from '@/components/booking/AddressForm';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useSetDefaultAddress } from '@/features/account/hooks';
import { useAddresses } from '@/features/booking/hooks';
import { colors, radius, spacing } from '@/theme';

type Props = { visible: boolean; onClose: () => void };

// Bottom sheet on Home: pick which saved address your coach should come to, or add one.
export function AddressSheet({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: addresses } = useAddresses();
  const setDefault = useSetDefaultAddress();
  const [adding, setAdding] = useState(false);

  const close = () => {
    setAdding(false);
    onClose();
  };

  const choose = (id: string) => {
    setDefault.mutate(id, { onSuccess: close });
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessibilityLabel={t('location.close')} style={styles.backdrop} onPress={close} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <AppText variant="sectionTitle" style={styles.title}>
              {t('location.chooseTitle')}
            </AppText>
            <Pressable accessibilityRole="button" accessibilityLabel={t('location.close')} onPress={close}>
              <Icon name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
            {addresses?.map((address) => (
              <Pressable
                key={address.id}
                accessibilityRole="button"
                accessibilityState={{ selected: address.isDefault }}
                disabled={setDefault.isPending}
                onPress={() => (address.isDefault ? close() : choose(address.id))}
                style={[styles.row, address.isDefault && styles.rowSelected]}>
                <Icon name="location-outline" size={18} color={colors.purple} />
                <View style={styles.rowText}>
                  <AppText variant="bodyStrong">{address.label}</AppText>
                  <AppText variant="caption" color={colors.muted}>
                    {address.line}, {address.area}
                  </AppText>
                  {!address.serviceable ? (
                    <AppText variant="caption" color={colors.danger}>
                      {t('addresses.notServiceable')}
                    </AppText>
                  ) : null}
                </View>
                <Icon
                  name={address.isDefault ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={address.isDefault ? colors.purple : colors.muted}
                />
              </Pressable>
            ))}

            {adding ? (
              <AddressForm
                onSaved={(address) => {
                  // A freshly added address becomes the one the customer is booking for.
                  setDefault.mutate(address.id, { onSettled: close });
                }}
                onCancel={() => setAdding(false)}
              />
            ) : (
              <>
                <PrimaryButton label={t('addresses.add')} variant="soft" onPress={() => setAdding(true)} />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    close();
                    router.push('/addresses');
                  }}
                  style={styles.manage}>
                  <AppText variant="bodyStrong" color={colors.purple}>
                    {t('location.manage')}
                  </AppText>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(8, 11, 15, 0.45)' },
  backdrop: { flex: 1 },
  sheet: {
    maxHeight: '85%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: 18,
    paddingBottom: spacing.md,
  },
  title: { flex: 1, fontSize: 18 },
  list: { paddingHorizontal: 18, paddingBottom: spacing.xxl, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  rowSelected: { borderColor: colors.purple, borderWidth: 1.2 },
  rowText: { flex: 1, gap: 3 },
  manage: { alignItems: 'center', paddingVertical: spacing.sm },
});
