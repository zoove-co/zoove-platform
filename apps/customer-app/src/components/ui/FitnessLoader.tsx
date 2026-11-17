import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/AppText';
import { colors } from '@/theme';

type Props = {
  /** One line to show instead of the rotating ones. */
  label?: string;
  /** "small" fits inside a list or a card; "medium" is for a whole screen. */
  size?: 'small' | 'medium';
  /** Centre in the space available (a whole screen). Turn off inside a card. */
  fill?: boolean;
};

const RISE = 30;

// The wait animation: a barbell lifted and dropped on a loop. Drawn with plain views, so it adds nothing to the app's size.
export function FitnessLoader({ label, size = 'medium', fill = true }: Props) {
  const { t } = useTranslation();
  const u = size === 'small' ? 0.55 : 1;
  const [lift] = useState(() => new Animated.Value(0));
  const [reduced, setReduced] = useState(false);
  const [line, setLine] = useState(0);
  const lines = label ? [label] : [t('loader.line1'), t('loader.line2'), t('loader.line3')];

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(lift, { toValue: 1, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.delay(140),
        Animated.timing(lift, { toValue: 0, duration: 700, easing: Easing.bounce, useNativeDriver: true }),
        Animated.delay(120),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [lift, reduced]);

  useEffect(() => {
    if (lines.length < 2) return;
    const timer = setInterval(() => setLine((n) => (n + 1) % lines.length), 2300);
    return () => clearInterval(timer);
  }, [lines.length]);

  const rise = RISE * u;
  const lifted = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -rise] });
  const shadowScale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] });
  const shadowOpacity = lift.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.1] });
  const text = lines[line % lines.length] ?? '';

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={lines[0]}
      accessibilityLiveRegion="polite"
      style={[styles.wrap, fill && styles.fill]}>
      <View style={{ height: (46 + RISE + 14) * u, justifyContent: 'flex-end', alignItems: 'center' }}>
        <Animated.View style={{ transform: [{ translateY: reduced ? 0 : lifted }] }}>
          <Barbell u={u} />
        </Animated.View>
        <Animated.View
          style={{
            marginTop: 6 * u,
            width: 96 * u,
            height: 7 * u,
            borderRadius: 4 * u,
            backgroundColor: colors.ink,
            opacity: reduced ? 0.3 : shadowOpacity,
            transform: [{ scaleX: reduced ? 1 : shadowScale }],
          }}
        />
      </View>
      {size === 'medium' ? (
        <AppText variant="bodyStrong" color={colors.muted} style={styles.text}>
          {text}
        </AppText>
      ) : null}
    </View>
  );
}

// Weight plates in the brand colours either side of the bar.
export function Barbell({ u = 1 }: { u?: number }) {
  const plate = (w: number, h: number, color: string, key: string) => (
    <View key={key} style={{ width: w * u, height: h * u, borderRadius: 5 * u, backgroundColor: color }} />
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 * u }}>
      {plate(6, 16, colors.ink, 'e1')}
      {plate(9, 30, colors.magenta, 's1')}
      {plate(12, 46, colors.purple, 'b1')}
      {plate(5, 16, colors.ink, 'c1')}
      <View style={{ width: 40 * u, height: 6 * u, borderRadius: 3 * u, backgroundColor: colors.supportingPurple }} />
      {plate(5, 16, colors.ink, 'c2')}
      {plate(12, 46, colors.purple, 'b2')}
      {plate(9, 30, colors.magenta, 's2')}
      {plate(6, 16, colors.ink, 'e2')}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 },
  fill: { flex: 1 },
  text: { textAlign: 'center' },
});
