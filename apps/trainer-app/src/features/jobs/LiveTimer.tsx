import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { clockText, useCountdown } from '@/lib/useCountdown';
import { colors } from '@/theme';

// "Live · 42:10" while a session's timer runs, "Time over" when it ends.
export function LiveTimer({ endsAt, big = false }: { endsAt: string | null; big?: boolean }) {
  const left = useCountdown(endsAt);
  const over = left === 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: big ? 10 : 4, borderRadius: 12, backgroundColor: over ? '#FDE4E1' : 'rgba(31, 157, 85, 0.14)' }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: over ? colors.danger : colors.success }} />
      <AppText variant={big ? 'heading' : 'bodyStrong'} color={over ? colors.danger : colors.success}>
        {left === null ? 'Live' : over ? 'Time over' : `Live · ${clockText(left)} left`}
      </AppText>
    </View>
  );
}
