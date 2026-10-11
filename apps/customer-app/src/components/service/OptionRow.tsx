import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { colors } from '@/theme';

type Props = { title: string; detail: string; prominent?: boolean; onPress: () => void };

export function OptionRow({ title, detail, prominent = false, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: prominent ? colors.purple : colors.lavender, opacity: pressed ? 0.88 : 1 },
      ]}>
      <View style={styles.text}>
        <AppText variant="sectionTitle" color={prominent ? colors.white : colors.ink} style={styles.title}>
          {title}
        </AppText>
        <AppText variant="caption" color={prominent ? 'rgba(255,255,255,0.82)' : colors.muted}>
          {detail}
        </AppText>
      </View>
      <Icon name="chevron-forward" size={18} color={prominent ? colors.white : colors.purple} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 19 },
  text: { flex: 1, gap: 4 },
  title: { fontSize: 19 },
});
