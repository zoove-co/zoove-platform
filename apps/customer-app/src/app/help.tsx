import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ComplaintRow } from '@/components/complaints/ComplaintRow';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useComplaints } from '@/features/complaints/hooks';
import { track } from '@/lib/analytics/track';
import { openSupport, SUPPORT_EMAIL } from '@/lib/support';
import { colors, radius, spacing } from '@/theme';

const FAQ = [1, 2, 3] as const;

export default function HelpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(1);
  const complaints = useComplaints(true);
  const active = complaints.data?.active ?? [];
  const any = active.length + (complaints.data?.past.length ?? 0) > 0;

  useEffect(() => {
    track('help_viewed');
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title={t('help.title')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <AppText variant="screenTitle">{t('help.heading')}</AppText>
        {/* Complaints are a conversation with the team: report a problem here, and the replies come back in the app. */}
        <PrimaryButton label={t('help.report')} onPress={() => router.push('/complaint/new')} />
        <AppText variant="caption" color={colors.muted}>{t('help.reportHint')}</AppText>
        {active.length > 0 ? <AppText variant="bodyStrong" style={styles.section}>{t('complaints.active')}</AppText> : null}
        {active.slice(0, 3).map((item) => (
          <ComplaintRow key={item.id} item={item} onPress={() => router.push({ pathname: '/complaint/[id]', params: { id: item.id } })} />
        ))}
        {any ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/complaints')} style={styles.seeAll}>
            <AppText variant="bodyStrong" color={colors.purple}>{t('complaints.seeAll')}</AppText>
            <Icon name="chevron-forward" size={14} color={colors.purple} />
          </Pressable>
        ) : null}
        <AppText variant="bodyStrong" style={styles.section}>{t('help.faqHeading')}</AppText>
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
        {/* Support is email for now (admin@zoove.co, reply within 24 hours). A chat or WhatsApp channel can replace it later. */}
        <AppText variant="caption" color={colors.muted}>
          {t('help.contactNote', { email: SUPPORT_EMAIL })}
        </AppText>
        <PrimaryButton label={t('help.contact')} variant="soft" onPress={() => openSupport(t('help.mailSubject'))} />
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
  section: { marginTop: spacing.md },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
});
