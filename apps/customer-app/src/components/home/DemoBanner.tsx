import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { demoTrainerImage } from '@/lib/images';
import { colors, radius, spacing } from '@/theme';

type Props = {
  priceLabel: string;
  originalPriceLabel: string;
  onPress: () => void;
};

export function DemoBanner({ priceLabel, originalPriceLabel, onPress }: Props) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('home.demoTitle')}, ${priceLabel}`}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}>
      <LinearGradient
        colors={[colors.lavender, colors.white]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.card}>
        <View style={styles.thumb}>
          <Image source={demoTrainerImage} contentFit="cover" style={styles.thumbImage} />
        </View>
        <View style={styles.text}>
          <AppText variant="eyebrow" color={colors.muted}>
            {t('home.demoEyebrow')}
          </AppText>
          <AppText variant="heading">{t('home.demoTitle')}</AppText>
          <View style={styles.prices}>
            <AppText variant="caption" color={colors.muted} style={styles.struck}>
              {originalPriceLabel}
            </AppText>
            <AppText variant="bodyStrong">{priceLabel}</AppText>
            <AppText variant="micro" color={colors.muted}>
              {t('home.demoFormat')}
            </AppText>
          </View>
        </View>
        <View style={styles.chevron}>
          <Icon name="chevron-forward" size={14} color={colors.magenta} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: spacing.md,
    borderRadius: radius.xl,
  },
  thumb: {
    width: 62,
    height: 62,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: { width: '100%', height: '100%' },
  text: { flex: 1, gap: 2 },
  prices: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  struck: { textDecorationLine: 'line-through' },
  chevron: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
