import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/AppText';
import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, fonts, spacing } from '@/theme';

type Props = { onOpen: (section: 'certified' | 'programs' | 'verified') => void };

export function AcademySection({ onOpen }: Props) {
  const { t } = useTranslation();
  const cards: { key: 'certified' | 'programs' | 'verified'; label: string; icon: IconName }[] = [
    { key: 'certified', label: t('home.academyCertified'), icon: 'ribbon-outline' },
    { key: 'programs', label: t('home.academyPrograms'), icon: 'school-outline' },
    { key: 'verified', label: t('home.academyVerified'), icon: 'shield-checkmark-outline' },
  ];

  return (
    <View style={styles.section}>
      <AppText variant="eyebrow" style={styles.title}>
        {t('home.academyTitle')}
      </AppText>
      <AppText variant="caption" color={colors.muted}>
        {t('home.academySubtitle')}
      </AppText>
      <View style={styles.row}>
        {cards.map((card) => (
          <Pressable
            key={card.key}
            accessibilityRole="button"
            accessibilityLabel={card.label.replace('\n', ' ')}
            onPress={() => onOpen(card.key)}
            style={styles.card}>
            <View style={styles.thumb}>
              <Icon name={card.icon} size={24} color={colors.purple} />
            </View>
            <AppText variant="micro" style={styles.cardLabel}>
              {card.label}
            </AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 9, paddingBottom: spacing.sm },
  title: { letterSpacing: 2, fontSize: 11 },
  row: { flexDirection: 'row', gap: 9 },
  card: { flex: 1, gap: 6, alignItems: 'center' },
  thumb: {
    alignSelf: 'stretch',
    height: 60,
    borderRadius: 13,
    backgroundColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: { textAlign: 'center', fontSize: 9, fontFamily: fonts.semibold },
});
