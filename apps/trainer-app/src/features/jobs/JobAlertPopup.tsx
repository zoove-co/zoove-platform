import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { OpenJob } from '@/lib/api';
import { whoFor } from '@/lib/useJobs';
import { colors, radius } from '@/theme';

/**
 * The pop-up that appears over whatever screen the trainer is on when a new job request arrives (the app is open).
 * With the app closed or in the background, the phone shows the system pop-up for the push message instead.
 */
export function JobAlertPopup({ job, onView, onLater }: { job: OpenJob | null; onView: () => void; onLater: () => void }) {
  const [pop] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!job) {
      pop.setValue(0);
      return;
    }
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 6, tension: 90 }).start();
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [job, pop, pulse]);

  if (!job) return null;
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onLater} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close" style={styles.fill} onPress={onLater} />
        <Animated.View accessibilityViewIsModal style={[styles.card, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]}>
          <View style={styles.bellWrap}>
            <Animated.View style={[styles.bellRing, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
            <View style={styles.bell}><Icon name="notifications" color={colors.white} size={30} /></View>
          </View>
          <AppText variant="heading" style={{ textAlign: 'center' }}>New job request</AppText>
          <View style={styles.pill}><AppText variant="caption" color={colors.white} style={{ fontWeight: '700' }}>JUST IN</AppText></View>
          <View style={styles.details}>
            <AppText variant="heading" style={{ textAlign: 'center' }}>{job.whenLabel}</AppText>
            <AppText variant="body" style={{ textAlign: 'center' }}>{`${job.serviceName} · ${job.formatName} · ${whoFor(job)}`}</AppText>
            <AppText variant="body" color={colors.muted} style={{ textAlign: 'center' }}>{job.area ?? 'Mumbai'}</AppText>
          </View>
          <AppText variant="caption" color={colors.muted} style={{ textAlign: 'center' }}>First trainer to accept gets it.</AppText>
          <View style={{ gap: 6, alignSelf: 'stretch', marginTop: 6 }}>
            <Button label="View and accept" onPress={onView} />
            <Button label="Later" variant="ghost" onPress={onLater} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 22 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  card: { alignSelf: 'stretch', backgroundColor: colors.white, borderRadius: radius.xxl, padding: 20, alignItems: 'center', gap: 8, elevation: 12 },
  bellWrap: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center', marginTop: -6 },
  bellRing: { position: 'absolute', width: 70, height: 70, borderRadius: 35, backgroundColor: colors.magenta },
  bell: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  pill: { backgroundColor: colors.magenta, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  details: { alignSelf: 'stretch', backgroundColor: colors.lavender, borderRadius: radius.lg, padding: 12, gap: 2, marginVertical: 4 },
});
