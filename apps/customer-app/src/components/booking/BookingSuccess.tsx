import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { colors, radius } from '@/theme';

type Props = { title: string; body: string };

export function BookingSuccess({ title, body }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.badge}>
        <Icon name="checkmark" size={22} color={colors.purple} />
      </View>
      <View style={styles.text}>
        <AppText variant="sectionTitle">{title}</AppText>
        <AppText variant="caption" color={colors.muted}>
          {body}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(232, 217, 255, 0.72)',
  },
  badge: {
    width: 47,
    height: 47,
    borderRadius: 24,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 4 },
});
