import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon, type IconName } from '@/components/ui/Icon';
import { colors } from '@/theme';

type Props = { icon: IconName; title: string; caption: string };

export function InfoPill({ icon, title, caption }: Props) {
  return (
    <View style={styles.pill}>
      <Icon name={icon} size={16} color={colors.magenta} />
      <View style={styles.text}>
        <AppText variant="bodyStrong" color={colors.purple} style={styles.title}>
          {title}
        </AppText>
        <AppText variant="micro" color={colors.muted} style={styles.caption}>
          {caption}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    padding: 9,
    borderRadius: 13,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 11 },
  caption: { fontSize: 8, letterSpacing: 0.6 },
});
