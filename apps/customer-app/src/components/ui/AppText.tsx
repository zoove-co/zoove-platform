import { Text, type TextProps } from 'react-native';

import { colors, typography } from '@/theme';

type Variant = keyof typeof typography;
type Props = TextProps & { variant?: Variant; color?: string };

// The only text component screens should use, so fonts and sizes come from the theme.
export function AppText({ variant = 'body', color = colors.ink, style, ...rest }: Props) {
  return <Text {...rest} style={[typography[variant], { color }, style]} />;
}
