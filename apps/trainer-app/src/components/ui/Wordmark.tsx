import { Image } from 'expo-image';

import logo from '../../../assets/zoove/logo.png';

const RATIO = 2076 / 758; // the supplied logo file

// The Zoove brush logo. The artwork is dark, so on purple screens pass tint={colors.white}.
export function Wordmark({ width = 160, tint }: { width?: number; tint?: string }) {
  return <Image source={logo} accessibilityLabel="Zoove" contentFit="contain" {...(tint ? { tintColor: tint } : {})} style={{ width, height: width / RATIO }} />;
}
