import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { track } from '@/lib/analytics/track';
import { colors, radius, spacing } from '@/theme';

const FAQ = [1, 2, 3] as const;

export default function HelpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(1);

  useEffect(() => {
    track('help_viewed');
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title={t('help.title')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <AppText variant="screenTitle">{t('help.heading')}</AppText>
        {FAQ.map((n) => {
          const expanded = open === n;
          return (
            <Pressable
              key={n}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setOpen(expanded ? null : n)}
              style={styles.item}>
              <View style={styles.itemHead}>
                <AppText variant="bodyStrong" style={styles.question}>
                  {t(`help.q${n}`)}
                </AppText>
                <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </View>
              {expanded ? <AppText color={colors.muted}>{t(`help.a${n}`)}</AppText> : null}
            </Pressable>
          );
        })}
        {/* The support channel (chat, call or WhatsApp) is undecided: the button opens the placeholder. */}
        <PrimaryButton
          label={t('help.contact')}
          onPress={() => router.push({ pathname: '/soon', params: { title: t('help.contact') } })}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: 40 },
  item: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 0.8,
    borderColor: colors.line,
  },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  question: { flex: 1 },
});
