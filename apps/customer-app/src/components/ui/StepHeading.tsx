import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors } from '@/theme';

type Props = { number?: string; title: string; detail?: string };

export function StepHeading({ number, title, detail }: Props) {
  return (
    <View style={styles.row}>
      {number ? (
        <View style={styles.badge}>
          <AppText variant="bodyStrong" color={colors.purple}>
            {number}
          </AppText>
        </View>
      ) : null}
      <View style={styles.text}>
        <AppText variant="sectionTitle" style={styles.title}>
          {title}
        </AppText>
        {detail ? (
          <AppText variant="caption" color={colors.muted}>
            {detail}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  badge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 4 },
  title: { fontSize: 22 },
});
