import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { SUCCESS_SVG } from '@/components/animations/successSvg';
import { SvgAnimation } from '@/components/animations/SvgAnimation';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/theme';

type Props = { title: string; body: string };

// Centered success state: designer animation, then the text fades up.
export function BookingSuccess({ title, body }: Props) {
  const [text] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(text, { toValue: 1, duration: 400, delay: 900, useNativeDriver: false }).start();
  }, [text]);

  return (
    <View style={styles.wrap}>
      <SvgAnimation svg={SUCCESS_SVG} size={200} />
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
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  textBlock: { alignItems: 'center', gap: 8 },
  title: { fontSize: 26, textAlign: 'center' },
  body: { textAlign: 'center', maxWidth: 300 },
});
