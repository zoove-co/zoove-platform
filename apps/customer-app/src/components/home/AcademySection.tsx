import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { academyImages } from '@/lib/images';
import { colors, spacing } from '@/theme';

type Section = 'certified' | 'programs' | 'verified';
type Props = { onOpen: (section: Section) => void };

export function AcademySection({ onOpen }: Props) {
  const { t } = useTranslation();
  const cards: { key: Section; label: string }[] = [
    { key: 'certified', label: t('home.academyCertified') },
    { key: 'programs', label: t('home.academyPrograms') },
    { key: 'verified', label: t('home.academyVerified') },
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
            style={({ pressed }) => [styles.card, { opacity: pressed ? 0.88 : 1 }]}>
            <Image source={academyImages[card.key]} contentFit="cover" style={styles.image} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 9, paddingBottom: spacing.sm },
  title: { letterSpacing: 2, fontSize: 11 },
  row: { flexDirection: 'row', gap: 8 },
  card: { flex: 1, aspectRatio: 1.5, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.lavender },
  image: { flex: 1 },
});
