import { Modal, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { colors, radius, spacing } from '@/theme';

type Props = {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  loading?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// An in-app dialog (Alert.alert does nothing on web, and we test on web too).
export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  loading = false,
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <AppText variant="sectionTitle">{title}</AppText>
          <AppText variant="body" color={colors.muted}>
            {body}
          </AppText>
          <View style={styles.actions}>
            <PrimaryButton
              label={confirmLabel}
              variant={destructive ? 'danger' : 'solid'}
              loading={loading}
              onPress={onConfirm}
            />
            <PrimaryButton label={cancelLabel} variant="soft" onPress={onCancel} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xxl,
    backgroundColor: 'rgba(8, 11, 15, 0.45)',
  },
  card: {
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
  },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
