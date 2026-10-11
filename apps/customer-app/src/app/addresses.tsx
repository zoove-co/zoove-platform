import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddressForm } from '@/components/booking/AddressForm';
import { AppText } from '@/components/ui/AppText';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Icon } from '@/components/ui/Icon';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TabFooter } from '@/components/ui/TabFooter';
import { useDeleteAddress, useSetDefaultAddress } from '@/features/account/hooks';
import { useAddresses } from '@/features/booking/hooks';
import type { Address } from '@/lib/api';
import { bookingErrorMessage } from '@/lib/api/errorMessage';
import { colors, fonts, radius, spacing } from '@/theme';

export default function AddressesScreen() {
  const { t } = useTranslation();
  const { data: addresses, isPending, isError, refetch } = useAddresses();
  const setDefault = useSetDefaultAddress();
  const remove = useDeleteAddress();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Address | null>(null);

  const onRemove = () => {
    if (!removing) return;
    remove.mutate(removing.id, {
      onSettled: () => setRemoving(null),
    });
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title={t('addresses.title')} />
      {isPending ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.purple} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <AppText variant="heading">{t('addresses.error')}</AppText>
          <PrimaryButton label={t('orders.retry')} variant="soft" onPress={() => void refetch()} />
        </View>
      ) : (
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}>
          {addresses.length === 0 && !adding ? (
            <View style={styles.empty}>
              <AppText variant="heading" style={styles.centerText}>
                {t('addresses.emptyTitle')}
              </AppText>
              <AppText color={colors.muted} style={styles.centerText}>
                {t('addresses.emptyBody')}
              </AppText>
            </View>
          ) : null}

          {addresses.map((address) => (
            <View key={address.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Icon name="location-outline" size={18} color={colors.purple} />
                <AppText variant="bodyStrong" style={styles.label}>
                  {address.label}
                </AppText>
                {address.isDefault ? (
                  <View style={styles.badge}>
                    <AppText variant="micro" color={colors.purple} style={styles.badgeText}>
                      {t('addresses.defaultBadge')}
                    </AppText>
                  </View>
                ) : null}
              </View>
              <AppText variant="caption" color={colors.muted}>
                {address.line}, {address.area} – {address.pincode}
              </AppText>
              {!address.serviceable ? (
                <AppText variant="caption" color={colors.danger}>
                  {t('addresses.notServiceable')}
                </AppText>
              ) : null}
              <View style={styles.actions}>
                {!address.isDefault ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={setDefault.isPending}
                    onPress={() => setDefault.mutate(address.id)}>
                    <AppText variant="bodyStrong" color={colors.purple}>
                      {t('addresses.makeDefault')}
                    </AppText>
                  </Pressable>
                ) : null}
                <Pressable accessibilityRole="button" onPress={() => setRemoving(address)}>
                  <AppText variant="bodyStrong" color={colors.danger}>
                    {t('addresses.remove')}
                  </AppText>
                </Pressable>
              </View>
            </View>
          ))}

          {remove.isError ? (
            <AppText variant="caption" color={colors.danger}>
              {bookingErrorMessage(remove.error, t)}
            </AppText>
          ) : null}

          {adding ? (
            <AddressForm onSaved={() => setAdding(false)} onCancel={() => setAdding(false)} />
          ) : (
            <PrimaryButton label={t('addresses.add')} variant="soft" onPress={() => setAdding(true)} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      )}
      <TabFooter />

      <ConfirmDialog
        visible={removing !== null}
        destructive
        title={t('addresses.removeTitle')}
        body={t('addresses.removeBody', { label: removing?.label ?? '' })}
        confirmLabel={t('addresses.removeConfirm')}
        cancelLabel={t('addresses.removeKeep')}
        loading={remove.isPending}
        onConfirm={onRemove}
        onCancel={() => setRemoving(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xxl },
  centerText: { textAlign: 'center' },
  content: { padding: 18, gap: 12, paddingBottom: spacing.xl },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  card: {
    gap: 6,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: colors.lavender },
  badgeText: { fontFamily: fonts.semibold },
  actions: { flexDirection: 'row', gap: 20, marginTop: 6 },
});
