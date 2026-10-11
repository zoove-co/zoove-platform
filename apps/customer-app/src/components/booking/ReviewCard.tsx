import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { StepHeading } from '@/components/ui/StepHeading';
import { colors, radius } from '@/theme';

type Row = { label: string; value: string; emphasized?: boolean };

type Props = {
  stepNumber: string;
  heading: string;
  detail: string;
  title: string;
  subtitle: string;
  priceLabel: string;
  rows: Row[];
  footnote: string;
};

export function ReviewCard({ stepNumber, heading, detail, title, subtitle, priceLabel, rows, footnote }: Props) {
  return (
    <View style={styles.wrap}>
      <StepHeading number={stepNumber} title={heading} detail={detail} />
      <View style={styles.summary}>
        <AppText variant="heading">{title}</AppText>
        <AppText variant="micro" color={colors.muted}>
          {subtitle}
        </AppText>
        <AppText variant="bodyStrong" color={colors.purple}>
          {priceLabel}
        </AppText>
      </View>
      <View style={styles.rows}>
        {rows.map((row, index) => (
          <View key={row.label} style={[styles.row, index > 0 && styles.rowBorder]}>
            <AppText variant="caption" color={colors.muted}>
              {row.label}
            </AppText>
            <AppText
              variant={row.emphasized ? 'bodyStrong' : 'caption'}
              style={styles.value}
              numberOfLines={2}>
              {row.value}
            </AppText>
          </View>
        ))}
      </View>
      <AppText variant="micro" color={colors.muted}>
        {footnote}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 13 },
  summary: {
    gap: 4,
    padding: 13,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  rows: {
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 12 },
  rowBorder: { borderTopWidth: 0.5, borderTopColor: colors.line },
  value: { flex: 1, textAlign: 'right' },
});
