import { Image } from 'expo-image';

import { logoImage } from '@/lib/images';

const RATIO = 2076 / 758; // the supplied logo file

// The Zoove brush logo. The artwork is dark, so on purple screens pass tint={colors.white}.
export function Wordmark({ width = 220, tint }: { width?: number; tint?: string }) {
  return (
    <Image
      source={logoImage}
      accessibilityLabel="Zoove"
      contentFit="contain"
      tintColor={tint}
      style={{ width, height: width / RATIO }}
    />
  );
}
