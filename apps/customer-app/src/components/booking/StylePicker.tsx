import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/AppText';
import { InfoPill } from '@/components/ui/InfoPill';
import { StepHeading } from '@/components/ui/StepHeading';
import type { ServiceDetail, ServiceSummary } from '@/lib/api';
import { colors, radius, spacing } from '@/theme';

type Props = {
  services: ServiceSummary[];
  serviceSlug: string;
  onServiceChange: (slug: string) => void;
  detail: ServiceDetail | undefined;
  formatSlug: string | undefined;
  onFormatChange: (slug: string) => void;
};

function Pill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.pill, selected && styles.pillSelected]}>
      <AppText variant="micro" color={selected ? colors.purple : colors.ink} style={styles.pillText}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function StylePicker({ services, serviceSlug, onServiceChange, detail, formatSlug, onFormatChange }: Props) {
  const { t } = useTranslation();
  const format = detail?.formats.find((item) => item.slug === formatSlug) ?? detail?.formats[0];

  return (
    <View style={styles.wrap}>
      <StepHeading number="1" title={t('booking.chooseTitle')} detail={t('booking.chooseDetail')} />
      <View style={styles.row}>
        {services.map((service) => (
          <Pill
            key={service.slug}
            label={service.name}
            selected={service.slug === serviceSlug}
            onPress={() => onServiceChange(service.slug)}
          />
        ))}
      </View>

      {detail ? (
        <View style={styles.wrap}>
          <AppText variant="heading" style={styles.sub}>
            {t('booking.styleTitle')}
          </AppText>
          <View style={styles.row}>
            {detail.formats.map((item) => (
              <Pill
                key={item.slug}
                label={item.name}
                selected={item.slug === format?.slug}
                onPress={() => onFormatChange(item.slug)}
              />
            ))}
          </View>
          <AppText variant="heading" color={colors.purple}>
            {detail.tagline}
          </AppText>
          {format ? (
            <AppText variant="body" color={colors.muted}>
              {format.description}
            </AppText>
          ) : null}
          <View style={styles.infoRow}>
            <InfoPill icon="time-outline" title={detail.durationLabel} caption={t('service.duration')} />
            <InfoPill icon="bar-chart-outline" title={detail.intensityLabel} caption={t('service.intensity')} />
          </View>
        </View>
      ) : (
        <ActivityIndicator color={colors.purple} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 13 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sub: { fontSize: 14 },
  infoRow: { flexDirection: 'row', gap: 8 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  pillSelected: { borderColor: colors.purple, borderWidth: 1.2, backgroundColor: 'rgba(232, 217, 255, 0.6)' },
  pillText: { fontSize: 12 },
});
