import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { colors } from '@/theme';

type Props = { title: string; body: string };

const SIZE = 112;

// Centered success state: green circle springs in, the tick pops, a ripple fades out, then the text.
export function BookingSuccess({ title, body }: Props) {
  const [circle] = useState(() => new Animated.Value(0));
  const [tick] = useState(() => new Animated.Value(0));
  const [ripple] = useState(() => new Animated.Value(0));
  const [text] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const native = Platform.OS !== 'web';
    Animated.sequence([
      Animated.spring(circle, { toValue: 1, friction: 5, tension: 90, useNativeDriver: native }),
      Animated.parallel([
        Animated.spring(tick, { toValue: 1, friction: 4, tension: 140, useNativeDriver: native }),
        Animated.timing(ripple, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.quad),
          useNativeDriver: native,
        }),
      ]),
      Animated.timing(text, { toValue: 1, duration: 320, useNativeDriver: native }),
    ]).start();
  }, [circle, tick, ripple, text]);

  return (
    <View style={styles.wrap}>
      <View style={styles.badgeBox}>
        <Animated.View
          style={[
            styles.disc,
            {
              opacity: ripple.interpolate({ inputRange: [0, 0.01, 1], outputRange: [0, 0.4, 0] }),
              transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }],
            },
          ]}
        />
        <Animated.View style={[styles.disc, styles.circle, { transform: [{ scale: circle }] }]}>
          <Animated.View style={{ opacity: tick, transform: [{ scale: tick }] }}>
            <Icon name="checkmark" size={64} color={colors.white} />
          </Animated.View>
        </Animated.View>
      </View>

      <Animated.View
        style={[
          styles.textBlock,
          {
            opacity: text,
            transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
          },
        ]}>
        <AppText variant="screenTitle" style={styles.title}>
          {title}
        </AppText>
        <AppText variant="body" color={colors.muted} style={styles.body}>
          {body}
        </AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 30, padding: 24 },
  badgeBox: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  disc: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.success,
  },
  circle: { alignItems: 'center', justifyContent: 'center' },
  textBlock: { alignItems: 'center', gap: 8 },
  title: { fontSize: 26, textAlign: 'center' },
  body: { textAlign: 'center', maxWidth: 300 },
});
