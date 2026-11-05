import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radius } from '@/theme';

type Tone = 'info' | 'warn' | 'bad' | 'good';
const TONES: Record<Tone, { background: string; text: string }> = {
  info: { background: colors.lavender, text: colors.ink },
  warn: { background: '#FFF4D6', text: '#5C4300' },
  bad: { background: '#FDE4E1', text: '#8A1C12' },
  good: { background: '#DDF4E6', text: '#14532D' },
};

export function Banner({ tone = 'info', children }: { tone?: Tone; children: string }) {
  const style = TONES[tone];
  return (
    <View accessibilityRole={tone === 'bad' ? 'alert' : undefined} style={[styles.box, { backgroundColor: style.background }]}>
      <AppText variant="body" color={style.text}>
        {children}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({ box: { padding: 12, borderRadius: radius.md } });
