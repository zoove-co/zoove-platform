import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, fonts } from '@/theme';

const TABS: { route: '/home' | '/streak' | '/account'; labelKey: string; icon: IconName }[] = [
  { route: '/home', labelKey: 'tabs.home', icon: 'home-outline' },
  { route: '/streak', labelKey: 'tabs.streak', icon: 'flash-outline' },
  { route: '/account', labelKey: 'tabs.account', icon: 'person-circle-outline' },
];

// The same three tabs as the real tab bar, for screens that are pushed on top of it
// (service, booking, session). Tapping a tab returns to that tab.
export function TabFooter() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      {TABS.map((tab) => (
        <Pressable
          key={tab.route}
          accessibilityRole="button"
          accessibilityLabel={t(tab.labelKey)}
          onPress={() => router.navigate(tab.route)}
          style={styles.item}>
          <Icon name={tab.icon} size={22} color={colors.muted} />
          <AppText variant="micro" color={colors.muted} style={styles.label}>
            {t(tab.labelKey)}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: 7,
  },
  item: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 2 },
  label: { fontFamily: fonts.medium },
});
