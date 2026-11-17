import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { colors } from '@/theme';

type Props = {
  /** "unreachable": the app cannot reach Zoove. "crash": a screen broke. */
  kind: 'unreachable' | 'crash';
  onRetry: () => void;
  busy?: boolean;
};

// Shown when Zoove cannot be reached or a screen breaks. A dumbbell having a rest, with a few Zs floating up.
export function RestDay({ kind, onRetry, busy = false }: Props) {
  const { t } = useTranslation();
  const COPY = {
    unreachableTitle: t('restDay.unreachableTitle'),
    unreachableBody: t('restDay.unreachableBody'),
    crashTitle: t('restDay.crashTitle'),
    crashBody: t('restDay.crashBody'),
    hint: t('restDay.hint'),
    artLabel: t('restDay.artLabel'),
  };
  const [reduced, setReduced] = useState(false);
  const [breath] = useState(() => new Animated.Value(0));
  const [zs] = useState(() => [new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    const floating = zs.map((z, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 700),
          Animated.timing(z, { toValue: 1, duration: 2100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.delay(Math.max(0, 1400 - i * 700)),
        ]),
      ),
    );
    breathing.start();
    floating.forEach((f) => f.start());
    return () => {
      breathing.stop();
      floating.forEach((f) => f.stop());
    };
  }, [breath, zs, reduced]);

  const scale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const title = kind === 'crash' ? COPY.crashTitle : COPY.unreachableTitle;
  const body = kind === 'crash' ? COPY.crashBody : COPY.unreachableBody;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.art} accessible accessibilityRole="image" accessibilityLabel={COPY.artLabel}>
        {zs.map((z, i) => (
          <Animated.Text
            key={i}
            style={[
              styles.z,
              {
                fontSize: 18 + i * 6,
                left: 118 + i * 22,
                opacity: reduced ? 0.6 : z.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 0.8, 0] }),
                transform: [
                  { translateY: reduced ? -i * 14 : z.interpolate({ inputRange: [0, 1], outputRange: [0, -46] }) },
                  { translateX: reduced ? 0 : z.interpolate({ inputRange: [0, 1], outputRange: [0, 14] }) },
                ],
              },
            ]}>
            z
          </Animated.Text>
        ))}
        <Animated.View style={{ transform: [{ scale: reduced ? 1 : scale }] }}>
          <View style={styles.dumbbell}>
            <View style={[styles.plate, { width: 14, height: 40, backgroundColor: colors.purple }]} />
            <View style={[styles.plate, { width: 11, height: 28, backgroundColor: colors.magenta }]} />
            <View style={styles.handle} />
            <View style={[styles.plate, { width: 11, height: 28, backgroundColor: colors.magenta }]} />
            <View style={[styles.plate, { width: 14, height: 40, backgroundColor: colors.purple }]} />
          </View>
        </Animated.View>
        <View style={styles.floor} />
      </View>
      <AppText variant="sectionTitle" style={styles.title}>
        {title}
      </AppText>
      <AppText variant="body" color={colors.muted} style={styles.body}>
        {body}
      </AppText>
      {kind === 'unreachable' ? (
        <AppText variant="caption" color={colors.muted} style={styles.hint}>
          {COPY.hint}
        </AppText>
      ) : null}
      <View style={styles.action}>
        <PrimaryButton label={t('restDay.retry')} onPress={onRetry} loading={busy} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, paddingHorizontal: 32 },
  art: { width: 220, height: 130, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 22 },
  dumbbell: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  plate: { borderRadius: 6 },
  handle: { width: 56, height: 8, borderRadius: 4, backgroundColor: colors.supportingPurple },
  floor: { width: 150, height: 6, borderRadius: 3, backgroundColor: colors.lavender, marginTop: 8 },
  z: { position: 'absolute', top: 38, color: colors.purple, fontWeight: '700' },
  title: { textAlign: 'center', marginBottom: 8 },
  body: { textAlign: 'center', lineHeight: 20, maxWidth: 320 },
  hint: { textAlign: 'center', marginTop: 10, maxWidth: 300 },
  action: { marginTop: 26, alignSelf: 'stretch', maxWidth: 320 },
});
