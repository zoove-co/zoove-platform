import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, type ImageSourcePropType } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radius, spacing } from '@/theme';

type Props = {
  name: string;
  imageSource?: ImageSourcePropType;
  onPress: () => void;
};

export function ExploreTile({ name, imageSource, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { opacity: pressed ? 0.88 : 1 }]}>
      {imageSource ? (
        <Image source={imageSource} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <LinearGradient
          colors={[colors.purple, colors.supportingPurple]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <LinearGradient
        colors={['transparent', colors.overlay]}
        start={{ x: 0.5, y: 0.5 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <AppText variant="bodyStrong" color={colors.white} style={styles.label}>
        {name}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    flexBasis: '47%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    borderWidth: 0.6,
    borderColor: colors.line,
  },
  label: { fontSize: 15, padding: spacing.md - 1 },
});
