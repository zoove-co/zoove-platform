import { useEffect } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';

import { RestDay } from '@/components/ui/RestDay';
import { recheck, useOutage } from '@/lib/outage';

const AUTO_CHECK_MS = 6_000;

// Sits on top of the whole app while Zoove cannot be reached. The screens underneath stay as they were,
// so when the connection returns the person is exactly where they left off.
export function OutageOverlay() {
  const down = useOutage((s) => s.down);
  const checking = useOutage((s) => s.checking);

  useEffect(() => {
    if (!down) return;
    const timer = setInterval(() => void recheck(), AUTO_CHECK_MS);
    // The back button must not quietly navigate the screens hidden underneath.
    const back = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => {
      clearInterval(timer);
      back.remove();
    };
  }, [down]);

  if (!down) return null;
  return (
    <View style={styles.cover} accessibilityViewIsModal>
      <RestDay kind="unreachable" busy={checking} onRetry={() => void recheck()} />
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, elevation: 1000 },
});
