import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, fonts } from '@/theme';

type Props = { label: string; active: boolean; live?: boolean };

// The small status pill. A session that is on right now gets a green dot and green text.
export function StatusChip({ label, active, live = false }: Props) {
  return (
    <View style={[styles.chip, live ? styles.live : !active && styles.inactive]}>
      {live ? <View style={styles.dot} /> : null}
      <AppText variant="micro" color={live ? colors.success : active ? colors.purple : colors.muted} style={styles.text}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: colors.lavender },
  inactive: { backgroundColor: 'rgba(8, 11, 15, 0.06)' },
  live: { backgroundColor: 'rgba(31, 157, 85, 0.14)' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  text: { fontFamily: fonts.semibold },
});
